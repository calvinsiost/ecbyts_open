// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Registry de artefatos portáveis .ecbt (SPEC_ECBT_PORTABLE_ARTIFACTS Fase A — P1-10).
// Generaliza o codec ECBT kind-aware: qualquer módulo registra um kind (NN, simbologia,
// validação, taxonomia, EIS, MCA/csm…) e ganha encode/decode portável reusando
// encodeKey/decodeKey + (no consumidor) o _ecbtLibraryStore (Library ecbyts vs local).
//
// Pure: registry + wrapper build/parse + dispatch. encodeArtifact/decodeArtifact fazem
// wiring assíncrono do codec (CDN no browser); a superfície pura é 100% testável.

export type ValidationResult = { valid: boolean; errors: string[] };

export type PortableHandler = {
    kind: string;
    schemaVersion: number;
    /** Valida o payload (objeto do módulo) antes do encode / após o decode. */
    validate(payload: unknown): ValidationResult;
    /** Módulo → payload serializável (artifact). */
    toArtifact(obj: unknown): unknown;
    /** Payload (artifact) → objeto do módulo. */
    fromArtifact(artifact: unknown): unknown;
    /** Grava/aplica o objeto importado no store/estado do módulo. */
    applyImport(obj: unknown): Promise<boolean>;
};

export type ArtifactWrapper = {
    ecbyts: string;
    _kind: string;
    schemaVersion: number;
    artifact: unknown;
};

const REGISTRY = new Map<string, PortableHandler>();

/** Registra um handler de kind. Sobrescreve se o kind já existir (idempotente por kind). */
export function registerKind(handler: PortableHandler): void {
    if (!handler || typeof handler.kind !== 'string' || !handler.kind) {
        throw new Error('registerKind: handler.kind (string não-vazia) obrigatório');
    }
    REGISTRY.set(handler.kind, handler);
}

export function getHandler(kind: string): PortableHandler | null {
    return REGISTRY.get(kind) || null;
}

export function listKinds(): string[] {
    return Array.from(REGISTRY.keys());
}

/** Limpa o registry (uso em testes / hot-reload). */
export function clearKinds(): void {
    REGISTRY.clear();
}

/** Monta o wrapper kind-aware (pure) — discriminador `_kind` + schemaVersion. */
export function buildArtifactWrapper(kind: string, schemaVersion: number, artifact: unknown): ArtifactWrapper {
    return { ecbyts: '2.0.0', _kind: String(kind), schemaVersion: Number(schemaVersion) || 1, artifact };
}

/** Lê um objeto decodificado e extrai {kind, schemaVersion, artifact} se for um wrapper válido. */
export function parseArtifactWrapper(
    decoded: unknown,
): { kind: string; schemaVersion: number; artifact: unknown } | null {
    if (!decoded || typeof decoded !== 'object') return null;
    const d = decoded as any;
    if (typeof d._kind !== 'string' || !d._kind) return null;
    if (!('artifact' in d)) return null;
    return { kind: d._kind, schemaVersion: Number(d.schemaVersion) || 1, artifact: d.artifact };
}

/**
 * Codifica um artefato de um kind registrado numa chave .ecbt portável.
 * Valida → toArtifact → wrapper → encodeKey. Lança em kind desconhecido ou payload inválido.
 */
export async function encodeArtifact(kind: string, payload: unknown): Promise<string> {
    const handler = getHandler(kind);
    if (!handler) throw new Error(`encodeArtifact: kind desconhecido "${kind}"`);
    const v = handler.validate(payload);
    if (!v.valid) throw new Error(`encodeArtifact: payload inválido — ${(v.errors || []).join('; ')}`);
    const artifact = handler.toArtifact(payload);
    const wrapper = buildArtifactWrapper(kind, handler.schemaVersion, artifact);
    const { encodeKey } = await import('./encoder.js' as string);
    return encodeKey(wrapper);
}

/**
 * Decodifica uma chave .ecbt → {kind, obj}. decodeKeyUniversal → parse → dispatch handler.fromArtifact.
 * Usa o decodificador universal para aceitar chaves tipo A/B e chaves tipo C
 * comprimidas, que são comuns em pacotes de aula grandes.
 * Retorna null se a chave não for um wrapper de artefato válido. Lança em kind não registrado.
 */
export async function decodeArtifact(
    key: string,
    options?: import('./typeD.js').DecodeTypeDOptions,
): Promise<{ kind: string; obj: unknown } | null> {
    const trimmed = String(key || '').trim();
    if (!trimmed.startsWith('ECBT.')) return null;
    const dec: any = await import('./decoder.js' as string);
    if (typeof dec.decodeKeyUniversal !== 'function') {
        throw new Error('decodeArtifact: decodificador universal indisponível');
    }
    const decoded = await dec.decodeKeyUniversal(trimmed, options);
    const parsed = parseArtifactWrapper(decoded);
    if (!parsed) return null;
    const handler = getHandler(parsed.kind);
    if (!handler) throw new Error(`decodeArtifact: kind não registrado "${parsed.kind}"`);
    const obj = handler.fromArtifact(parsed.artifact);
    return { kind: parsed.kind, obj };
}

/** decode + applyImport — grava o artefato importado no store do módulo. */
export async function importArtifactKey(
    key: string,
    options?: import('./typeD.js').DecodeTypeDOptions,
): Promise<boolean> {
    const res = await decodeArtifact(key, options);
    if (!res) return false;
    const handler = getHandler(res.kind);
    if (!handler) return false;
    return handler.applyImport(res.obj);
}
