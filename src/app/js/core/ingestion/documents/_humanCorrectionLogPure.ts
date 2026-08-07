// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// CONSENSUS-MATRIX-001 F4 / RF-7 — Human correction log (pure-logic).
//
// Registra correções humanas sobre verdicts do consensus matrix.
// LGPD: log fica LOCAL em IDB (NÃO sync com server). Permite calcular
// accuracy[tier][field_type] offline em RF-8 (_tierAccuracyCalculatorPure).
//
// Pure-logic 100%: sem DOM, sem IDB, sem rede. Funções recebem store-like
// adapter (set/get/list) injetado para testabilidade.

import type { ConsensusCategory, ConsensusVerdict, TierOutput } from './_consensusMatrixBuilderPure';

export interface CorrectionLogEntry {
    readonly timestamp: number;
    readonly fieldId: string;
    readonly fieldType: string;
    readonly tierOutputs: ReadonlyArray<TierOutput>;
    readonly humanCorrection: unknown;
    readonly chosenCategory: ConsensusCategory;
    readonly notes?: string | undefined;
}

export interface CorrectionLogStore {
    readonly put: (entry: CorrectionLogEntry) => Promise<void> | void;
    readonly getAll: () => Promise<ReadonlyArray<CorrectionLogEntry>> | ReadonlyArray<CorrectionLogEntry>;
    readonly clear?: () => Promise<void> | void;
    readonly deleteBefore?: (timestamp: number) => Promise<number> | number;
}

const MIN_TIMESTAMP = 0;
const MAX_NOTES_LENGTH = 500;

/**
 * Valida entry antes de gravar. Defensive: input inválido → null + reason.
 */
export function validateCorrectionEntry(input: unknown): {
    valid: boolean;
    entry: CorrectionLogEntry | null;
    reason: string | null;
} {
    if (!input || typeof input !== 'object') {
        return { valid: false, entry: null, reason: 'input não é objeto' };
    }
    const raw = input as Partial<CorrectionLogEntry>;

    if (typeof raw.fieldId !== 'string' || raw.fieldId.length === 0) {
        return { valid: false, entry: null, reason: 'fieldId ausente ou vazio' };
    }
    if (typeof raw.fieldType !== 'string' || raw.fieldType.length === 0) {
        return { valid: false, entry: null, reason: 'fieldType ausente ou vazio' };
    }
    if (typeof raw.chosenCategory !== 'string') {
        return { valid: false, entry: null, reason: 'chosenCategory inválida' };
    }
    if (!Array.isArray(raw.tierOutputs)) {
        return { valid: false, entry: null, reason: 'tierOutputs não é array' };
    }
    // humanCorrection pode ser qualquer tipo (string, number, null, object)
    // mas precisa estar presente
    if (!('humanCorrection' in raw)) {
        return { valid: false, entry: null, reason: 'humanCorrection ausente' };
    }

    const timestamp =
        typeof raw.timestamp === 'number' && Number.isFinite(raw.timestamp) && raw.timestamp >= MIN_TIMESTAMP
            ? raw.timestamp
            : Date.now();

    const notes =
        typeof raw.notes === 'string' && raw.notes.length > 0
            ? raw.notes.slice(0, MAX_NOTES_LENGTH)
            : undefined;

    const entry: CorrectionLogEntry = Object.freeze({
        timestamp,
        fieldId: raw.fieldId,
        fieldType: raw.fieldType,
        tierOutputs: Object.freeze([...raw.tierOutputs] as ReadonlyArray<TierOutput>),
        humanCorrection: raw.humanCorrection,
        chosenCategory: raw.chosenCategory as ConsensusCategory,
        notes,
    });

    return { valid: true, entry, reason: null };
}

/**
 * Constrói entry a partir de verdict + correção humana.
 * Helper alternativo quando a UI tem o verdict completo em mãos.
 */
export function buildEntryFromVerdict(
    verdict: unknown,
    fieldType: unknown,
    humanCorrection: unknown,
    notes?: unknown,
): CorrectionLogEntry | null {
    if (!verdict || typeof verdict !== 'object') return null;
    const v = verdict as ConsensusVerdict;
    if (typeof v.fieldId !== 'string') return null;

    const candidate = {
        timestamp: Date.now(),
        fieldId: v.fieldId,
        fieldType: typeof fieldType === 'string' && fieldType.length > 0 ? fieldType : 'unknown',
        tierOutputs: Array.isArray(v.evidenceTrail) ? v.evidenceTrail : [],
        humanCorrection,
        chosenCategory: v.category,
        notes: typeof notes === 'string' ? notes : undefined,
    };

    const { valid, entry } = validateCorrectionEntry(candidate);
    return valid ? entry : null;
}

/**
 * Grava entry no store. Defensive: store inválido → false.
 */
export async function recordCorrection(
    store: unknown,
    input: unknown,
): Promise<{ success: boolean; entry: CorrectionLogEntry | null; error?: string }> {
    if (!store || typeof store !== 'object') {
        return { success: false, entry: null, error: 'store inválido' };
    }
    const s = store as CorrectionLogStore;
    if (typeof s.put !== 'function') {
        return { success: false, entry: null, error: 'store.put não é função' };
    }

    const { valid, entry, reason } = validateCorrectionEntry(input);
    if (!valid || !entry) {
        return { success: false, entry: null, error: reason || 'entry inválida' };
    }

    try {
        await Promise.resolve(s.put(entry));
        return { success: true, entry };
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'put falhou';
        return { success: false, entry: null, error: msg };
    }
}

/**
 * Lista entries do store. Defensive: store inválido → [].
 */
export async function listCorrections(
    store: unknown,
): Promise<ReadonlyArray<CorrectionLogEntry>> {
    if (!store || typeof store !== 'object') return Object.freeze([]);
    const s = store as CorrectionLogStore;
    if (typeof s.getAll !== 'function') return Object.freeze([]);
    try {
        const all = await Promise.resolve(s.getAll());
        if (!Array.isArray(all)) return Object.freeze([]);
        // Sanitize: filtra entries inválidas
        const safe: CorrectionLogEntry[] = [];
        for (const it of all) {
            const { valid, entry } = validateCorrectionEntry(it);
            if (valid && entry) safe.push(entry);
        }
        return Object.freeze(safe);
    } catch {
        return Object.freeze([]);
    }
}

/**
 * Filtra entries por critérios (fieldType, chosenCategory, timestamp range).
 * Útil para alimentar o accuracy calculator com subset relevante.
 */
export interface CorrectionFilter {
    readonly fieldType?: string;
    readonly chosenCategory?: ConsensusCategory;
    readonly sinceTimestamp?: number;
    readonly untilTimestamp?: number;
    readonly fieldId?: string;
}

function _matchesFilter(entry: CorrectionLogEntry, filter: CorrectionFilter): boolean {
    if (filter.fieldType && entry.fieldType !== filter.fieldType) return false;
    if (filter.chosenCategory && entry.chosenCategory !== filter.chosenCategory) return false;
    if (filter.fieldId && entry.fieldId !== filter.fieldId) return false;
    if (typeof filter.sinceTimestamp === 'number' && entry.timestamp < filter.sinceTimestamp) return false;
    if (typeof filter.untilTimestamp === 'number' && entry.timestamp > filter.untilTimestamp) return false;
    return true;
}

export function filterCorrections(
    entries: unknown,
    filter: unknown,
): ReadonlyArray<CorrectionLogEntry> {
    if (!Array.isArray(entries) || entries.length === 0) return Object.freeze([]);
    const f = (filter && typeof filter === 'object' ? filter : {}) as CorrectionFilter;
    const out: CorrectionLogEntry[] = [];
    for (const e of entries) {
        if (!e || typeof e !== 'object') continue;
        const en = e as CorrectionLogEntry;
        if (_matchesFilter(en, f)) out.push(en);
    }
    return Object.freeze(out);
}

/**
 * Sumário básico do log: contagem total + por categoria + por fieldType.
 */
export interface CorrectionLogSummary {
    readonly total: number;
    readonly byCategory: Readonly<Record<string, number>>;
    readonly byFieldType: Readonly<Record<string, number>>;
    readonly oldestTimestamp: number | null;
    readonly newestTimestamp: number | null;
}

export function summarizeLog(entries: unknown): CorrectionLogSummary {
    const empty: CorrectionLogSummary = Object.freeze({
        total: 0,
        byCategory: Object.freeze({}),
        byFieldType: Object.freeze({}),
        oldestTimestamp: null,
        newestTimestamp: null,
    });
    if (!Array.isArray(entries) || entries.length === 0) return empty;

    const byCategory: Record<string, number> = {};
    const byFieldType: Record<string, number> = {};
    let oldest = Number.POSITIVE_INFINITY;
    let newest = Number.NEGATIVE_INFINITY;
    let total = 0;

    for (const e of entries) {
        if (!e || typeof e !== 'object') continue;
        const en = e as CorrectionLogEntry;
        total += 1;
        const cat = String(en.chosenCategory || 'unknown');
        byCategory[cat] = (byCategory[cat] || 0) + 1;
        const ft = String(en.fieldType || 'unknown');
        byFieldType[ft] = (byFieldType[ft] || 0) + 1;
        if (typeof en.timestamp === 'number') {
            if (en.timestamp < oldest) oldest = en.timestamp;
            if (en.timestamp > newest) newest = en.timestamp;
        }
    }

    return Object.freeze({
        total,
        byCategory: Object.freeze(byCategory),
        byFieldType: Object.freeze(byFieldType),
        oldestTimestamp: Number.isFinite(oldest) ? oldest : null,
        newestTimestamp: Number.isFinite(newest) ? newest : null,
    });
}

export const HUMAN_CORRECTION_LOG_META = Object.freeze({
    moduleId: 'consensus-matrix.human-correction-log',
    version: 1,
    maxNotesLength: MAX_NOTES_LENGTH,
    storage: 'IDB-local-only (LGPD safe)',
});
