// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * AI provenance — pure logic (CONSIST-OBS-001 B3).
 *
 * Proveniência IA-vs-humano para mutações executadas pelo bot LLM:
 * tag canônica `_provenance` em toda mutação + log de sessão + disclosure
 * machine-readable (EU AI Act Art. 50 — deadline Ago/2026).
 *
 * Alinhamento:
 * - PROV-O minimal (fieldMeta já tem `filled_by:'ai'` e activity
 *   'ai_suggestion' — esta tag é a camada de MUTAÇÃO via bot, com modelo
 *   e action rastreáveis).
 * - C2PA-like sem X.509: tamper-evidence vem do hash-chain ECBT type B na
 *   exportação (a tag viaja DENTRO do payload encadeado — adulterar a tag
 *   quebra a cadeia).
 *
 * Pure: sem DOM, sem rede; clock e traceId injetáveis. Testes em
 * tests/ai-provenance-pure.test.mjs (Node).
 */

export const AI_PROVENANCE_SOURCE = 'ai-bot';

/** FNV-1a 32-bit — hash de correlação dos params (NÃO criptográfico; a
 *  tamper-evidence é do hash-chain ECBT, não deste campo). */
function fnv1aHex8(str: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
}

/** Serialização canônica (sorted keys) p/ hash estável de params. */
function canonicalJson(obj: any): string {
    if (obj === null || typeof obj !== 'object') return JSON.stringify(obj) ?? 'null';
    if (Array.isArray(obj)) return `[${obj.map(canonicalJson).join(',')}]`;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

export interface AiProvenanceTag {
    readonly source: typeof AI_PROVENANCE_SOURCE;
    readonly model: string;
    readonly actionId: string;
    readonly ts: string;
    readonly traceId: string | null;
    readonly paramsHash: string;
}

/**
 * Build the canonical AI provenance tag for a bot mutation.
 *
 * @param input.model    nome do modelo LLM ativo (ex: 'claude-sonnet-4-6')
 * @param input.actionId action executada (ex: 'ADD_OBSERVATION')
 * @param input.params   params da action (hash de correlação, não armazenados)
 * @param input.nowIso   clock injetável (default new Date())
 * @param input.traceId  trace-id de sessão (S3) p/ stitch frontend↔backend
 */
export function buildAiProvenanceTag(input: {
    model: string;
    actionId: string;
    params?: any;
    nowIso?: string;
    traceId?: string | null;
}): AiProvenanceTag | null {
    if (!input || typeof input.model !== 'string' || !input.model.trim()) return null;
    if (typeof input.actionId !== 'string' || !input.actionId.trim()) return null;
    return Object.freeze({
        source: AI_PROVENANCE_SOURCE,
        model: input.model.trim(),
        actionId: input.actionId.trim(),
        ts: input.nowIso || new Date().toISOString(),
        traceId: input.traceId ?? null,
        paramsHash: fnv1aHex8(canonicalJson(input.params ?? null)),
    });
}

/** Type-guard da tag (consumidores: audit, export, badge UI). */
export function isAiProvenanceTag(tag: any): tag is AiProvenanceTag {
    return !!tag
        && tag.source === AI_PROVENANCE_SOURCE
        && typeof tag.model === 'string'
        && typeof tag.actionId === 'string'
        && typeof tag.ts === 'string'
        && typeof tag.paramsHash === 'string';
}

/**
 * Attach the tag to a payload WITHOUT mutating it (returns shallow copy with
 * `_provenance`). Preserva tag pré-existente se `overwrite` for false.
 */
export function attachProvenance(obj: any, tag: AiProvenanceTag, overwrite = true): any {
    if (!obj || typeof obj !== 'object' || !isAiProvenanceTag(tag)) return obj;
    if (!overwrite && obj._provenance) return obj;
    return { ...obj, _provenance: tag };
}

// ----------------------------------------------------------------
// SESSION LOG — factory (estado injetável p/ teste; singleton no wire)
// ----------------------------------------------------------------

export interface AiProvenanceLog {
    record(tag: AiProvenanceTag): boolean;
    getAll(): AiProvenanceTag[];
    count(): number;
    clear(): void;
}

/** Cria um log de mutações IA da sessão (append-only em memória, cap LRU). */
export function createAiProvenanceLog(maxEntries = 1000): AiProvenanceLog {
    let entries: AiProvenanceTag[] = [];
    return {
        record(tag: AiProvenanceTag) {
            if (!isAiProvenanceTag(tag)) return false;
            entries.push(tag);
            if (entries.length > maxEntries) entries = entries.slice(-maxEntries);
            return true;
        },
        getAll() {
            return [...entries];
        },
        count() {
            return entries.length;
        },
        clear() {
            entries = [];
        },
    };
}

// ----------------------------------------------------------------
// EU AI ACT ART. 50 — disclosure machine-readable
// ----------------------------------------------------------------

/**
 * Build the machine-readable AI disclosure (EU AI Act Art. 50).
 *
 * Agrega o log de mutações em um documento JSON canônico: período coberto,
 * modelos usados, contagem por action — adequado para export junto à chave
 * ECBT (type B = tamper-evident) ou endpoint de transparência.
 */
export function buildArt50Disclosure(tags: AiProvenanceTag[], nowIso?: string) {
    const valid = (tags || []).filter(isAiProvenanceTag);
    const models = new Map<string, number>();
    const actions = new Map<string, number>();
    let first: string | null = null;
    let last: string | null = null;
    for (const t of valid) {
        models.set(t.model, (models.get(t.model) || 0) + 1);
        actions.set(t.actionId, (actions.get(t.actionId) || 0) + 1);
        if (!first || t.ts < first) first = t.ts;
        if (!last || t.ts > last) last = t.ts;
    }
    return Object.freeze({
        standard: 'EU-AI-Act-Art50',
        disclosure: 'ai-assisted-data-mutations',
        generatedAt: nowIso || new Date().toISOString(),
        period: { first, last },
        totalMutations: valid.length,
        byModel: Object.fromEntries([...models.entries()].sort()),
        byAction: Object.fromEntries([...actions.entries()].sort()),
    });
}
