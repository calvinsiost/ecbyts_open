// SPDX-License-Identifier: AGPL-3.0-only
// © 2026 ECBT (Environmental & Occupational Core Byte Tools). All rights reserved.
//
// vizChangeTracker.js - Git-style change tracking for visualization settings
// Rastreamento de mudanças estilo Git para configurações de visualização do inspetor.
// Módulo puro: sem DOM, IDB, Three.js ou fetch.

export interface VizChangeEntry {
    /** Unique entry identifier */
    id: string;
    /** ID of the element whose viz changed */
    elementId: string;
    /** Viz field name (e.g. 'color', 'opacity') */
    field: string;
    /** Previous value (serializable) */
    oldValue: any;
    /** New value (serializable) */
    newValue: any;
    /** Session alias (LGPD: no real names) */
    changedBy: string;
    /** ISO 8601 timestamp string */
    changedAt: string;
    /** Optional context metadata */
    meta: Record<string, any> | null;
}

interface CreateVizChangeEntryFields {
    elementId: string;
    field: string;
    oldValue: any;
    newValue: any;
    changedBy: string;
    changedAt: string;
    meta?: Record<string, any> | null;
}

interface VizChangeTracker {
    record(
        elementId: string,
        field: string,
        oldValue: any,
        newValue: any,
        meta?: Record<string, any> | null,
    ): Readonly<VizChangeEntry>;
    getHistory(elementId: string): VizChangeEntry[];
    undoLast(elementId: string): Readonly<VizChangeEntry> | null;
    diffSummary(elementId: string): {
        fieldChanges: Record<string, { from: any; to: any }>;
        changeCount: number;
    };
    clearHistory(elementId: string): number;
    exportAll(): Record<string, VizChangeEntry[]>;
    size(): number;
}

// Gera ID único sem dependência de crypto
// Generates a unique ID without requiring the crypto module
function _genId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Valida se a string é um formato ISO 8601 básico
// Validates basic ISO 8601 format (not exhaustive, but sufficient for runtime checks)
function _isIsoString(value: any): boolean {
    if (typeof value !== 'string') return false;
    const d = new Date(value);
    return !isNaN(d.getTime()) && value.includes('T');
}

/**
 * Creates an immutable VizChangeEntry.
 * Cria uma entrada imutável de mudança de visualização.
 *
 * @throws {TypeError} When required fields are missing or wrong type
 * @throws {RangeError} When string fields exceed length limits
 */
export function createVizChangeEntry(fields: CreateVizChangeEntryFields): Readonly<VizChangeEntry> {
    const { elementId, field, oldValue, newValue, changedBy, changedAt, meta = null } = fields ?? {};

    // Validação de elementId
    if (!elementId || typeof elementId !== 'string') {
        throw new TypeError('createVizChangeEntry: elementId is required and must be a string');
    }

    // Validação de field (máximo 80 chars)
    if (!field || typeof field !== 'string') {
        throw new TypeError('createVizChangeEntry: field is required and must be a string');
    }
    if (field.length > 80) {
        throw new RangeError(`createVizChangeEntry: field exceeds 80 characters (got ${field.length})`);
    }

    // Validação de changedBy (máximo 64 chars, LGPD: apenas alias)
    if (!changedBy || typeof changedBy !== 'string') {
        throw new TypeError('createVizChangeEntry: changedBy is required and must be a string');
    }
    if (changedBy.length > 64) {
        throw new RangeError(`createVizChangeEntry: changedBy exceeds 64 characters (got ${changedBy.length})`);
    }

    // Validação de changedAt (formato ISO)
    if (!_isIsoString(changedAt)) {
        throw new TypeError(`createVizChangeEntry: changedAt must be a valid ISO string (got ${changedAt})`);
    }

    return Object.freeze({
        id: _genId(),
        elementId,
        field,
        oldValue,
        newValue,
        changedBy,
        changedAt,
        meta: meta ?? null,
    });
}

/**
 * Compares two viz state objects and returns a structured diff.
 * Compara dois estados de visualização e retorna um diff estruturado.
 *
 * @param stateA - Previous viz state
 * @param any> - New viz state
 */
export function diffVizStates(
    stateA: Record<string, any> | null | undefined,
    stateB: Record<string, any> | null | undefined,
): {
    changed: string[];
    added: string[];
    removed: string[];
    entries: Array<{ field: string; from: any; to: any }>;
} {
    const a = stateA ?? {};
    const b = stateB ?? {};
    const keysA = new Set(Object.keys(a));
    const keysB = new Set(Object.keys(b));

    const changed: string[] = [];
    const added: string[] = [];
    const removed: string[] = [];
    const entries: Array<{ field: string; from: any; to: any }> = [];

    // Campos presentes em B mas não em A → adicionados
    for (const key of keysB) {
        if (!keysA.has(key)) {
            added.push(key);
            entries.push({ field: key, from: undefined, to: b[key] });
        }
    }

    // Campos presentes em A mas não em B → removidos
    for (const key of keysA) {
        if (!keysB.has(key)) {
            removed.push(key);
            entries.push({ field: key, from: a[key], to: undefined });
        }
    }

    // Campos em ambos: verificar por igualdade JSON (lida com objetos/arrays)
    // Fields in both: compare by JSON-serialized equality (handles objects/arrays)
    for (const key of keysA) {
        if (!keysB.has(key)) continue;
        const same = JSON.stringify(a[key]) === JSON.stringify(b[key]);
        if (!same) {
            changed.push(key);
            entries.push({ field: key, from: a[key], to: b[key] });
        }
    }

    return { changed, added, removed, entries };
}

/**
 * Creates a stateful viz change tracker for one or more elements.
 * Cria um rastreador de mudanças de visualização com estado para um ou mais elementos.
 */
export function createVizChangeTracker(
    opts: { maxHistory?: number; sessionAlias?: string } = {},
): VizChangeTracker {
    const maxHistory = opts.maxHistory ?? 200;
    const sessionAlias = opts.sessionAlias ?? 'anonymous';

    // Mapa interno: elementId → VizChangeEntry[] (mais recente primeiro não - append, invertemos no get)
    // Internal map: elementId → VizChangeEntry[] (oldest first internally, reversed on read)
    const _store = new Map<string, VizChangeEntry[]>();

    function _getOrCreate(elementId: string): VizChangeEntry[] {
        if (!_store.has(elementId)) _store.set(elementId, []);
        return _store.get(elementId) as VizChangeEntry[];
    }

    return {
        /**
         * Records a viz property change for an element.
         * Registra uma mudança de propriedade de visualização para um elemento.
         */
        record(
            elementId: string,
            field: string,
            oldValue: any,
            newValue: any,
            meta: Record<string, any> | null = null,
        ): Readonly<VizChangeEntry> {
            const entry = createVizChangeEntry({
                elementId,
                field,
                oldValue,
                newValue,
                changedBy: sessionAlias,
                changedAt: new Date().toISOString(),
                meta,
            });

            const list = _getOrCreate(elementId);
            list.push(entry);

            // Aplica limite máximo de histórico (remove o mais antigo)
            // Enforces maxHistory cap by dropping the oldest entry
            if (list.length > maxHistory) {
                list.splice(0, list.length - maxHistory);
            }

            return entry;
        },

        /**
         * Returns change history for an element, newest first.
         * Retorna o histórico de mudanças para um elemento, mais recente primeiro.
         */
        getHistory(elementId: string): VizChangeEntry[] {
            const list = _store.get(elementId);
            if (!list) return [];
            return [...list].reverse();
        },

        /**
         * Undoes the last recorded change for an element (removes it from history).
         * Desfaz a última mudança registrada para um elemento (remove do histórico).
         */
        undoLast(elementId: string): Readonly<VizChangeEntry> | null {
            const list = _store.get(elementId);
            if (!list || list.length === 0) return null;
            return list.pop() ?? null;
        },

        /**
         * Returns a summary of field-level changes for an element (latest value per field).
         * Retorna um resumo das mudanças por campo para um elemento (valor mais recente por campo).
         */
        diffSummary(elementId: string): {
            fieldChanges: Record<string, { from: any; to: any }>;
            changeCount: number;
        } {
            const list = _store.get(elementId) ?? [];
            // Reconstrói o estado mais recente por campo (mais recente = maior índice)
            // Rebuild latest state per field (latest = highest index in list)
            const firstSeen = new Map<string, VizChangeEntry>(); // field → earliest entry for 'from'
            const lastSeen = new Map<string, VizChangeEntry>(); // field → latest entry for 'to'

            for (const entry of list) {
                if (!firstSeen.has(entry.field)) {
                    firstSeen.set(entry.field, entry);
                }
                lastSeen.set(entry.field, entry);
            }

            const fieldChanges: Record<string, { from: any; to: any }> = {};
            for (const [field, earliest] of firstSeen) {
                const latest = lastSeen.get(field);
                fieldChanges[field] = { from: earliest.oldValue, to: latest?.newValue };
            }

            return { fieldChanges, changeCount: firstSeen.size };
        },

        /**
         * Clears the change history for a specific element.
         * Limpa o histórico de mudanças de um elemento específico.
         *
         * @returns Number of entries removed
         */
        clearHistory(elementId: string): number {
            const list = _store.get(elementId);
            if (!list) return 0;
            const count = list.length;
            _store.delete(elementId);
            return count;
        },

        /**
         * Exports a deep snapshot of all tracked histories.
         * Exporta um snapshot profundo de todos os históricos rastreados.
         */
        exportAll(): Record<string, VizChangeEntry[]> {
            const snapshot: Record<string, VizChangeEntry[]> = {};
            for (const [elementId, list] of _store) {
                // Cópia de array para não compartilhar referência com o store interno
                // Array copy to avoid sharing reference with internal store
                snapshot[elementId] = [...list];
            }
            return snapshot;
        },

        /**
         * Returns the total number of entries tracked across all elements.
         * Retorna o número total de entradas rastreadas em todos os elementos.
         */
        size(): number {
            let total = 0;
            for (const list of _store.values()) total += list.length;
            return total;
        },
    };
}
