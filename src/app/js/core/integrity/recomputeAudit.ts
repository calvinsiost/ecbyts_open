// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * TRUST-020 (claude - novaspec, 2026-05-30) — RecomputeAudit Decorator (pure-logic).
 *
 * Implementa Camada 6 da TRUST-015 (audit trail reprodutível por execução):
 * decorator que wrap solver/ML function e registra automaticamente cada
 * execução em ledger append-only com:
 *   - solverId + version + inputHash + outputHash + durationMs + timestamp
 *   - Mesma input + mesma version → mesmo outputHash (determinismo)
 *   - Drift detection: outputHash diferente entre versions = regressão
 *
 * Caller (solver runner) decora:
 *   const auditedSolver = withSolverAudit(rawSolver, 'gaussianPlume', '1.0.0');
 *   const result = await auditedSolver(input);
 *   // Audit entry registrada automaticamente em getAuditLog()
 *
 * NÃO faz I/O persistente — caller (Edge Function ou wallet sync) drena
 * log para Supabase periodicamente. Pure-logic com clock injetável.
 *
 * Refs:
 *   - TRUST-015 Camada 6 (audit trail reprodutível)
 *   - CONAMA Resolução 420/2009 (fundamentação técnica laudo — rastreabilidade)
 *   - Receita Federal Reforma 2026 (audit trail obrigatório transações)
 *   - core/crypto/ hashChain + merkle (composable se quiser chain de blocks)
 */

export interface AuditEntry {
    /** Solver/ML model ID (cross-ref TRUST-013/016) */
    artifactId: string;
    /** Version do artifact (semver — quando mudar, output pode mudar) */
    version: string;
    /** Hash determinístico do input serializado (FNV-1a 64-bit) */
    inputHash: string;
    /** Hash determinístico do output serializado */
    outputHash: string;
    /** Duração da execução em milissegundos */
    durationMs: number;
    /** Epoch ms quando execução iniciou */
    startedAtMs: number;
    /** Epoch ms quando execução terminou */
    completedAtMs: number;
    /** Status final: 'success' / 'error' (caller pode usar p/ alertas) */
    status: 'success' | 'error';
    /** Mensagem de erro abreviada (sem stack — apenas message + tipo) se status=error */
    errorMessage?: string;
}

export interface AuditConfig {
    /** Max entries no log in-memory (default 1000 — drain para Supabase periodicamente) */
    maxInMemoryEntries: number;
    /** Habilitar deep drift detection (compara output hash entre versions) */
    enableDriftDetection: boolean;
}

export const DEFAULT_AUDIT_CONFIG: Readonly<AuditConfig> = Object.freeze({
    maxInMemoryEntries: 1000,
    enableDriftDetection: true,
});

// ── Internal append-only log ─────────────────────────────────────────────

const _auditLog: AuditEntry[] = [];
let _config: AuditConfig = { ...DEFAULT_AUDIT_CONFIG };
let _clock: () => number = () => Date.now();

/**
 * Configura audit (max entries + drift detection). Reset clock opcional.
 */
export function configureAudit(updates: Partial<AuditConfig>, clockOverride?: () => number): void {
    _config = { ..._config, ...updates };
    if (clockOverride) _clock = clockOverride;
}

/**
 * Reset clock e config para defaults (útil em tests).
 */
export function resetAudit(): void {
    _auditLog.length = 0;
    _config = { ...DEFAULT_AUDIT_CONFIG };
    _clock = () => Date.now();
}

// ── FNV-1a 64-bit hash (pure, sync, sem deps) ────────────────────────────

const FNV_OFFSET_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const MASK_64 = (1n << 64n) - 1n;

export function fnv1aHash(input: unknown): string {
    let str: string;
    try {
        str = typeof input === 'string' ? input : JSON.stringify(input);
    } catch {
        str = String(input);
    }
    let hash = FNV_OFFSET_64;
    for (let i = 0; i < str.length; i++) {
        hash ^= BigInt(str.charCodeAt(i));
        hash = (hash * FNV_PRIME_64) & MASK_64;
    }
    return hash.toString(16).padStart(16, '0');
}

// ── Decorator core ────────────────────────────────────────────────────────

/**
 * Wrap solver/ML function com audit automático.
 *
 * Compatível com fn sync OR async — detecta automaticamente.
 *
 * @example
 *   const auditedSolver = withSolverAudit(gaussianPlume, 'gaussianPlume', '1.0.0');
 *   const result = await auditedSolver({ stack: 50, lat: -23.5 });
 *   // → audit entry adicionada automaticamente em _auditLog
 */
export function withSolverAudit<TInput, TOutput>(
    fn: (input: TInput) => TOutput | Promise<TOutput>,
    artifactId: string,
    version: string = '1.0.0',
): (input: TInput) => TOutput | Promise<TOutput> {
    return (input: TInput) => {
        const startedAtMs = _clock();
        const inputHash = fnv1aHash(input);
        let result: TOutput | Promise<TOutput>;
        try {
            result = fn(input);
        } catch (err: any) {
            const completedAtMs = _clock();
            recordEntry({
                artifactId, version, inputHash,
                outputHash: '0000000000000000',
                durationMs: completedAtMs - startedAtMs,
                startedAtMs, completedAtMs,
                status: 'error',
                errorMessage: shortenError(err),
            });
            throw err;
        }
        if (result && typeof (result as Promise<TOutput>).then === 'function') {
            return (result as Promise<TOutput>).then(
                (resolved: TOutput) => {
                    const completedAtMs = _clock();
                    recordEntry({
                        artifactId, version, inputHash,
                        outputHash: fnv1aHash(resolved),
                        durationMs: completedAtMs - startedAtMs,
                        startedAtMs, completedAtMs,
                        status: 'success',
                    });
                    return resolved;
                },
                (err: any) => {
                    const completedAtMs = _clock();
                    recordEntry({
                        artifactId, version, inputHash,
                        outputHash: '0000000000000000',
                        durationMs: completedAtMs - startedAtMs,
                        startedAtMs, completedAtMs,
                        status: 'error',
                        errorMessage: shortenError(err),
                    });
                    throw err;
                },
            );
        }
        const completedAtMs = _clock();
        recordEntry({
            artifactId, version, inputHash,
            outputHash: fnv1aHash(result),
            durationMs: completedAtMs - startedAtMs,
            startedAtMs, completedAtMs,
            status: 'success',
        });
        return result;
    };
}

function shortenError(err: any): string {
    const msg = err?.message || String(err);
    const name = err?.name || 'Error';
    return `${name}: ${String(msg).slice(0, 200)}`;
}

function recordEntry(entry: AuditEntry): void {
    _auditLog.push(Object.freeze(entry) as AuditEntry);
    if (_auditLog.length > _config.maxInMemoryEntries) {
        _auditLog.shift();
    }
}

// ── Query API ────────────────────────────────────────────────────────────

/**
 * Retorna cópia do audit log (snapshot — não-mutável pelo caller).
 */
export function getAuditLog(): ReadonlyArray<AuditEntry> {
    return [..._auditLog];
}

/**
 * Filter por artifactId.
 */
export function getAuditEntriesFor(artifactId: string): AuditEntry[] {
    return _auditLog.filter((e) => e.artifactId === artifactId);
}

/**
 * Estatísticas agregadas (admin dashboard).
 */
export interface AuditStats {
    totalEntries: number;
    successCount: number;
    errorCount: number;
    successRate: number; // 0-1
    byArtifact: Record<string, { count: number; avgDurationMs: number; lastVersionSeen: string }>;
}

export function getAuditStats(): AuditStats {
    const byArtifact: Record<string, { count: number; totalDuration: number; lastVersionSeen: string }> = {};
    let successCount = 0;
    let errorCount = 0;
    for (const e of _auditLog) {
        if (e.status === 'success') successCount++;
        else errorCount++;
        if (!byArtifact[e.artifactId]) {
            byArtifact[e.artifactId] = { count: 0, totalDuration: 0, lastVersionSeen: e.version };
        }
        const entry = byArtifact[e.artifactId]!; // garantido pelo init acima
        entry.count++;
        entry.totalDuration += e.durationMs;
        entry.lastVersionSeen = e.version; // overwrites with most recent
    }
    const totalEntries = _auditLog.length;
    const byArtifactOut: Record<string, { count: number; avgDurationMs: number; lastVersionSeen: string }> = {};
    for (const [k, v] of Object.entries(byArtifact)) {
        byArtifactOut[k] = {
            count: v.count,
            avgDurationMs: v.count > 0 ? Math.round(v.totalDuration / v.count) : 0,
            lastVersionSeen: v.lastVersionSeen,
        };
    }
    return {
        totalEntries,
        successCount,
        errorCount,
        successRate: totalEntries > 0 ? successCount / totalEntries : 1,
        byArtifact: byArtifactOut,
    };
}

// ── Drift detection ──────────────────────────────────────────────────────

export interface DriftDetectionResult {
    artifactId: string;
    /** True se mesma input gerou outputHash diferente entre versions */
    driftDetected: boolean;
    /** Pairs (version, outputHash) que diferem mesmo com mesmo inputHash */
    conflictingVersions: Array<{ version: string; outputHash: string; count: number }>;
}

/**
 * Detecta drift: mesma input + versions diferentes → outputs diferentes.
 *
 * Útil para CI gate (CD pipeline): se nova version gera output diferente
 * para mesma input cached, é regressão semântica → bloquear deploy.
 *
 * Retorna apenas artifacts COM drift (sem entries = lista vazia).
 */
export function detectDrift(): DriftDetectionResult[] {
    if (!_config.enableDriftDetection) return [];
    // Group por (artifactId + inputHash) e ver se outputHash varia entre versions
    const grouped: Record<string, Map<string, Map<string, number>>> = {};
    // grouped[artifactId+inputHash][version] = Map<outputHash, count>
    for (const e of _auditLog) {
        if (e.status !== 'success') continue;
        const key = `${e.artifactId}::${e.inputHash}`;
        if (!grouped[key]) grouped[key] = new Map();
        if (!grouped[key].get(e.version)) grouped[key].set(e.version, new Map());
        const versionMap = grouped[key].get(e.version)!;
        versionMap.set(e.outputHash, (versionMap.get(e.outputHash) || 0) + 1);
    }
    const results: DriftDetectionResult[] = [];
    const seen = new Set<string>();
    for (const [key, versionsMap] of Object.entries(grouped)) {
        const [artifactId] = key.split('::');
        if (versionsMap.size < 2) continue; // só 1 version vista → sem drift possível
        // Coletar todos os outputHashes únicos entre versions
        const allHashes = new Set<string>();
        for (const hashes of versionsMap.values()) {
            for (const h of hashes.keys()) allHashes.add(h);
        }
        if (allHashes.size < 2) continue; // mesmo output em todas as versions = sem drift
        if (seen.has(artifactId!)) continue;
        seen.add(artifactId!);
        const conflictingVersions: Array<{ version: string; outputHash: string; count: number }> = [];
        for (const [version, hashes] of versionsMap.entries()) {
            for (const [hash, count] of hashes.entries()) {
                conflictingVersions.push({ version, outputHash: hash, count });
            }
        }
        results.push({
            artifactId: artifactId!,
            driftDetected: true,
            conflictingVersions,
        });
    }
    return results;
}

/**
 * Serializa audit log para drain → Supabase.
 */
export function serializeAuditLog(): string {
    return JSON.stringify({
        schemaVersion: 1,
        entries: _auditLog,
        exportedAtMs: _clock(),
    });
}

/**
 * Drena (esvazia) audit log — caller usa após persistir em Supabase.
 */
export function drainAuditLog(): AuditEntry[] {
    const drained = [..._auditLog];
    _auditLog.length = 0;
    return drained;
}
