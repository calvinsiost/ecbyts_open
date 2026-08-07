// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * TRUST-021 (claude - novaspec, 2026-05-30) — Auditable Solver Registry (pure-logic).
 *
 * Registry pluggable que aplica `withSolverAudit` (TRUST-020) automaticamente
 * a solvers/ML models registrados, eliminando necessidade de modificar 29+22
 * arquivos individuais com import + wrap manual.
 *
 * Caller registra solver UMA VEZ no bootstrap:
 *
 *   import { gaussianPlume } from './core/simulation/solvers/gaussianPlume.js';
 *   registerAuditedSolver('gaussianPlume', gaussianPlume, '1.0.0');
 *
 *   // Em qualquer lugar do app:
 *   const audited = getAuditedSolver('gaussianPlume');
 *   const result = audited(input);
 *   // → audit entry registrada automaticamente em TRUST-020 _auditLog
 *
 * Compatível com TRUST-013 (solverProvenance) e TRUST-016 (mlProvenance):
 * `getAuditedSolver(id)` retorna fn auditada se registrada, OU null se não.
 *
 * Pure-logic — sem deps DOM/rede. Registry in-memory + serialização opcional.
 */

import { withSolverAudit } from './recomputeAudit.js';

export interface RegisteredSolver<TInput = unknown, TOutput = unknown> {
    artifactId: string;
    version: string;
    /** Função original (não-decorada) — útil para inspeção/debug */
    originalFn: (input: TInput) => TOutput | Promise<TOutput>;
    /** Função decorada (audit automático) — caller consome esta */
    auditedFn: (input: TInput) => TOutput | Promise<TOutput>;
    /** Epoch ms quando foi registrado (auditoria de bootstrap) */
    registeredAtMs: number;
    /** Origem opcional para debug ('core/simulation/solvers/gaussianPlume.ts') */
    sourceModule?: string | undefined;
}

const _registry: Map<string, RegisteredSolver<any, any>> = new Map();
let _clock: () => number = () => Date.now();

/**
 * Reset registry + clock (útil para teardown de tests).
 */
export function resetAuditableRegistry(clockOverride?: () => number): void {
    _registry.clear();
    _clock = clockOverride || (() => Date.now());
}

/**
 * Configura clock determinístico (sem reset do registry).
 */
export function setAuditableRegistryClock(clock: () => number): void {
    _clock = clock;
}

/**
 * Registra um solver/ML model. Idempotente: segunda chamada com mesmo
 * artifactId sobrescreve (útil para hot-reload em dev).
 *
 * Retorna a função auditada pronta para uso.
 */
export function registerAuditedSolver<TInput, TOutput>(
    artifactId: string,
    fn: (input: TInput) => TOutput | Promise<TOutput>,
    version: string = '1.0.0',
    sourceModule?: string,
): (input: TInput) => TOutput | Promise<TOutput> {
    if (!artifactId || typeof artifactId !== 'string') {
        throw new TypeError('registerAuditedSolver: artifactId must be a non-empty string');
    }
    if (typeof fn !== 'function') {
        throw new TypeError('registerAuditedSolver: fn must be a function');
    }
    const auditedFn = withSolverAudit(fn, artifactId, version);
    const entry: RegisteredSolver<TInput, TOutput> = {
        artifactId,
        version,
        originalFn: fn,
        auditedFn,
        registeredAtMs: _clock(),
        sourceModule,
    };
    _registry.set(artifactId, entry);
    return auditedFn;
}

/**
 * Recupera a função auditada por artifactId. Retorna null se não registrada.
 */
export function getAuditedSolver<TInput = unknown, TOutput = unknown>(
    artifactId: string,
): ((input: TInput) => TOutput | Promise<TOutput>) | null {
    const entry = _registry.get(artifactId);
    return entry ? (entry.auditedFn as (input: TInput) => TOutput | Promise<TOutput>) : null;
}

/**
 * Recupera entry completa (debug/inspeção).
 */
export function getRegisteredSolverEntry(artifactId: string): RegisteredSolver<any, any> | null {
    return _registry.get(artifactId) || null;
}

/**
 * Lista todos os solvers registrados (admin dashboard).
 */
export function listRegisteredSolvers(): string[] {
    return Array.from(_registry.keys()).sort();
}

/**
 * True se solver está registrado (alternativa a getAuditedSolver != null).
 */
export function isSolverRegistered(artifactId: string): boolean {
    return _registry.has(artifactId);
}

/**
 * Remove solver do registry (útil para hot-reload ou teardown).
 */
export function unregisterAuditedSolver(artifactId: string): boolean {
    return _registry.delete(artifactId);
}

/**
 * Estatísticas agregadas para admin dashboard.
 */
export interface RegistryStats {
    totalRegistered: number;
    /** Counts por version (helps spotting multi-version coexistence) */
    byVersion: Record<string, number>;
    /** Latest registeredAtMs */
    lastRegisteredAtMs: number | null;
    /** Lista de artifactIds */
    ids: string[];
}

export function getAuditableRegistryStats(): RegistryStats {
    const byVersion: Record<string, number> = {};
    let lastRegistered = 0;
    const ids: string[] = [];
    for (const entry of _registry.values()) {
        ids.push(entry.artifactId);
        byVersion[entry.version] = (byVersion[entry.version] || 0) + 1;
        if (entry.registeredAtMs > lastRegistered) lastRegistered = entry.registeredAtMs;
    }
    return {
        totalRegistered: _registry.size,
        byVersion,
        lastRegisteredAtMs: _registry.size > 0 ? lastRegistered : null,
        ids: ids.sort(),
    };
}

/**
 * Bulk registration: registra múltiplos solvers de uma vez no bootstrap.
 * Retorna mapa artifactId → auditedFn.
 *
 * @example
 *   registerBulkSolvers([
 *       { artifactId: 'gaussianPlume', fn: gaussianPlume, version: '1.0.0' },
 *       { artifactId: 'theisThiem', fn: theisThiem, version: '1.0.0' },
 *   ]);
 */
export interface BulkRegistrationEntry<TInput = unknown, TOutput = unknown> {
    artifactId: string;
    fn: (input: TInput) => TOutput | Promise<TOutput>;
    version?: string;
    sourceModule?: string | undefined;
}

export function registerBulkSolvers(
    entries: ReadonlyArray<BulkRegistrationEntry>,
): Record<string, (input: any) => any> {
    const result: Record<string, (input: any) => any> = {};
    if (!Array.isArray(entries)) return result;
    for (const e of entries) {
        if (!e.artifactId || typeof e.fn !== 'function') continue;
        const audited = registerAuditedSolver(e.artifactId, e.fn, e.version || '1.0.0', e.sourceModule);
        result[e.artifactId] = audited;
    }
    return result;
}

/**
 * Helper: invoca solver registrado por ID com fallback (não-throw se não
 * registrado — retorna defaultValue).
 *
 * Útil para code paths defensivos onde solver pode não ter sido bootstrapped.
 */
export function invokeAuditedSolver<TInput, TOutput>(
    artifactId: string,
    input: TInput,
    defaultValue?: TOutput,
): TOutput | Promise<TOutput> | undefined {
    const fn = getAuditedSolver<TInput, TOutput>(artifactId);
    if (!fn) {
        return defaultValue;
    }
    return fn(input);
}
