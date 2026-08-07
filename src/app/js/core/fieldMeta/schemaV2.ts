// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   FIELD-META-001 Phase 1 — P1-55 schemaV2

   Field type system v2: typed fields, O(1) index, v1→v2 migration,
   and 3-way merge for collaborative editing scenarios.

   Extends schema.js (PROV-O / ALCOA++ metadata layer) with a strict
   field-definition registry — distinct concern from field-value metadata.

   Reference:
   - ISO 19115-1:2014 §6.5 — attribute definition schema
   - W3C Linked Data Platform — resource typing constraints
   ================================================================ */

/** Versão do schema de definição de campos. */
export const SCHEMA_VERSION = 2;

/**
 * Tipos canônicos de campo suportados pelo schema v2.
 * Frozen - extensões requerem novo major version.
 */
export const FIELD_TYPES_V2 = Object.freeze({
    TEXT: 'text',
    NUMBER: 'number',
    DATE: 'date',
    BOOLEAN: 'boolean',
    ENUM: 'enum',
    COORDINATES: 'coordinates',
    REFERENCE: 'reference',
});

// Conjunto de valores válidos para validação interna
const VALID_TYPES = new Set(Object.values(FIELD_TYPES_V2));

/**
 * Cria uma definição de campo v2 tipada e frozen.
 *
 * @param id - Identificador único do campo (non-empty)
 * @param type - Um dos valores de FIELD_TYPES_V2
 * @param options - Propriedades opcionais sobrescrevendo defaults
 * @returns Campo v2 frozen
 * @throws Se id vazio ou type inválido
 */
export function createFieldV2(
    id: string,
    type: string,
    options: {
        label?: string;
        required?: boolean;
        unit?: string | null;
        enumValues?: string[];
        min?: number | null;
        max?: number | null;
        defaultValue?: unknown;
    } = {},
): Readonly<object> {
    if (!id || typeof id !== 'string' || !id.trim()) {
        throw new Error('createFieldV2: id must be a non-empty string');
    }
    if (!(VALID_TYPES as Set<unknown>).has(type)) {
        throw new Error(`createFieldV2: type "${type}" is not valid. Must be one of: ${[...VALID_TYPES].join(', ')}`);
    }
    return Object.freeze({
        id: id.trim(),
        type,
        version: SCHEMA_VERSION,
        label: options.label !== undefined ? options.label : id,
        required: options.required !== undefined ? Boolean(options.required) : false,
        unit: options.unit !== undefined ? options.unit : null,
        enumValues: options.enumValues !== undefined ? options.enumValues : [],
        min: options.min !== undefined ? options.min : null,
        max: options.max !== undefined ? options.max : null,
        defaultValue: options.defaultValue !== undefined ? options.defaultValue : null,
    });
}

/**
 * Valida uma definição de campo v2.
 *
 * @param field - Campo a validar
 */
export function validateFieldV2(field: Record<string, any>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!field || typeof field !== 'object') {
        return { valid: false, errors: ['field must be a non-null object'] };
    }

    // id
    if (!field.id || typeof field.id !== 'string' || !field.id.trim()) {
        errors.push('id must be a non-empty string');
    }

    // type
    if (!VALID_TYPES.has(field.type)) {
        errors.push(`type "${field.type}" is not valid. Must be one of: ${[...VALID_TYPES].join(', ')}`);
    }

    // enum: enumValues deve ser array não-vazio
    if (field.type === FIELD_TYPES_V2.ENUM) {
        if (!Array.isArray(field.enumValues) || field.enumValues.length === 0) {
            errors.push('enumValues must be a non-empty array when type is "enum"');
        }
    }

    // number: min <= max se ambos definidos
    if (field.type === FIELD_TYPES_V2.NUMBER) {
        if (field.min !== null && field.min !== undefined && field.max !== null && field.max !== undefined) {
            if (typeof field.min !== 'number' || typeof field.max !== 'number') {
                errors.push('min and max must be numbers when set');
            } else if (field.min > field.max) {
                errors.push(`min (${field.min}) must be <= max (${field.max})`);
            }
        }
    }

    // defaultValue: verificar compatibilidade de tipo
    if (field.defaultValue !== null && field.defaultValue !== undefined) {
        const dv = field.defaultValue;
        const t = field.type;
        if (t === FIELD_TYPES_V2.NUMBER && typeof dv !== 'number') {
            errors.push(`defaultValue must be a number for type "number", got ${typeof dv}`);
        } else if (t === FIELD_TYPES_V2.BOOLEAN && typeof dv !== 'boolean') {
            errors.push(`defaultValue must be a boolean for type "boolean", got ${typeof dv}`);
        } else if (t === FIELD_TYPES_V2.TEXT && typeof dv !== 'string') {
            errors.push(`defaultValue must be a string for type "text", got ${typeof dv}`);
        } else if (t === FIELD_TYPES_V2.ENUM) {
            if (Array.isArray(field.enumValues) && field.enumValues.length > 0) {
                if (!field.enumValues.includes(dv)) {
                    errors.push(`defaultValue "${dv}" is not in enumValues`);
                }
            }
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Constrói um índice O(1) de campos por id.
 *
 * @param fields - Array de definições de campo
 * @returns Mapa id → campo
 * @throws Se houver IDs duplicados
 */
export function buildFieldIndex(fields: object[]): Map<string, object> {
    if (!Array.isArray(fields)) {
        throw new Error('buildFieldIndex: fields must be an array');
    }
    const index = new Map<string, object>();
    for (const field of fields) {
        const id = field && (field as any).id;
        if (!id) continue;
        if (index.has(id)) {
            throw new Error(`buildFieldIndex: duplicate field id "${id}"`);
        }
        index.set(id, field);
    }
    return index;
}

/**
 * Migra um campo v1 para o schema v2.
 * Schema v1 esperado: {id, type, label, required}
 *
 * @param v1Field - Campo no formato v1
 * @returns Campo no formato v2 (frozen)
 */
export function migrateV1ToV2(v1Field: Record<string, any>): Readonly<object> {
    if (!v1Field || typeof v1Field !== 'object') {
        throw new Error('migrateV1ToV2: v1Field must be a non-null object');
    }
    // Normalizar tipo: v1 pode usar strings que não existem em v2
    const typeMap = {
        string: FIELD_TYPES_V2.TEXT,
        str: FIELD_TYPES_V2.TEXT,
        text: FIELD_TYPES_V2.TEXT,
        number: FIELD_TYPES_V2.NUMBER,
        num: FIELD_TYPES_V2.NUMBER,
        float: FIELD_TYPES_V2.NUMBER,
        integer: FIELD_TYPES_V2.NUMBER,
        int: FIELD_TYPES_V2.NUMBER,
        date: FIELD_TYPES_V2.DATE,
        datetime: FIELD_TYPES_V2.DATE,
        boolean: FIELD_TYPES_V2.BOOLEAN,
        bool: FIELD_TYPES_V2.BOOLEAN,
        enum: FIELD_TYPES_V2.ENUM,
        coordinates: FIELD_TYPES_V2.COORDINATES,
        coords: FIELD_TYPES_V2.COORDINATES,
        reference: FIELD_TYPES_V2.REFERENCE,
        ref: FIELD_TYPES_V2.REFERENCE,
    };
    const rawType = typeof v1Field.type === 'string' ? v1Field.type.toLowerCase() : '';
    const resolvedType = (typeMap as Record<string, any>)[rawType] || FIELD_TYPES_V2.TEXT;

    return createFieldV2(v1Field.id, resolvedType, {
        label: v1Field.label !== undefined ? v1Field.label : v1Field.id,
        required: Boolean(v1Field.required),
        unit: v1Field.unit !== undefined ? v1Field.unit : null,
        enumValues: Array.isArray(v1Field.enumValues) ? v1Field.enumValues : [],
        min: v1Field.min !== undefined ? v1Field.min : null,
        max: v1Field.max !== undefined ? v1Field.max : null,
        defaultValue: v1Field.defaultValue !== undefined ? v1Field.defaultValue : null,
    });
}

/**
 * Compara dois arrays de campos e retorna diff estrutural.
 *
 * @param v1Fields - Array base (v1 ou qualquer versão)
 * @param v2Fields - Array novo
 */
export function diffFieldSchemas(
    v1Fields: object[],
    v2Fields: object[],
): { added: string[]; removed: string[]; modified: Array<{ id: string; changes: string[] }> } {
    const baseIndex = buildFieldIndex(Array.isArray(v1Fields) ? v1Fields : []);
    const newIndex = buildFieldIndex(Array.isArray(v2Fields) ? v2Fields : []);

    const added: string[] = [];
    const removed: string[] = [];
    const modified: Array<{ id: string; changes: string[] }> = [];

    for (const [id] of newIndex) {
        if (!baseIndex.has(id)) {
            added.push(id);
        } else {
            const base = baseIndex.get(id);
            const next = newIndex.get(id);
            const changes = _diffFieldObjects(base, next);
            if (changes.length > 0) {
                modified.push({ id, changes });
            }
        }
    }

    for (const [id] of baseIndex) {
        if (!newIndex.has(id)) {
            removed.push(id);
        }
    }

    return { added, removed, modified };
}

/**
 * Diff interno entre dois objetos de campo.
 * @private
 */
function _diffFieldObjects(a: any, b: any): string[] {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    const changes: string[] = [];
    for (const k of keys) {
        const av = a[k];
        const bv = b[k];
        if (JSON.stringify(av) !== JSON.stringify(bv)) {
            changes.push(k);
        }
    }
    return changes;
}

/**
 * 3-way merge de schemas de campo.
 * Estratégia: local wins em conflito (local !== base), caso contrário remote.
 *
 * @param base - Schema base comum (ancestral)
 * @param local - Schema local (modificações locais)
 * @param remote - Schema remoto (modificações remotas)
 */
export function mergeFieldSchemas(
    base: object[],
    local: object[],
    remote: object[],
): { merged: object[]; conflicts: Array<{ id: string; resolution: string }> } {
    const baseIdx = buildFieldIndex(Array.isArray(base) ? base : []);
    const localIdx = buildFieldIndex(Array.isArray(local) ? local : []);
    const remoteIdx = buildFieldIndex(Array.isArray(remote) ? remote : []);

    const allIds = new Set([...baseIdx.keys(), ...localIdx.keys(), ...remoteIdx.keys()]);
    const merged: any[] = [];
    const conflicts: any[] = [];

    for (const id of allIds) {
        const b = baseIdx.get(id) || null;
        const l = localIdx.get(id) || null;
        const r = remoteIdx.get(id) || null;

        // Caso: adicionado apenas em um lado
        if (!b) {
            if (l && !r) {
                merged.push(l);
                continue;
            }
            if (!l && r) {
                merged.push(r);
                continue;
            }
            if (l && r) {
                // Ambos adicionaram o mesmo id - conflito, local wins
                merged.push(l);
                conflicts.push({ id, resolution: 'local_wins_both_added' });
                continue;
            }
        }

        // Caso: removido em um ou ambos os lados
        if (b && !l && !r) continue; // removido nos dois → ausente no merge
        if (b && !l && r) {
            // Local removeu, remote manteve/modificou - local wins (remoção)
            conflicts.push({ id, resolution: 'local_deleted_wins' });
            continue;
        }
        if (b && l && !r) {
            // Remote removeu, local manteve/modificou - local wins
            merged.push(l);
            conflicts.push({ id, resolution: 'local_modified_remote_deleted' });
            continue;
        }

        // Ambos presentes - verificar modificações
        const localChanged = JSON.stringify(b) !== JSON.stringify(l);
        const remoteChanged = JSON.stringify(b) !== JSON.stringify(r);

        if (!localChanged && !remoteChanged) {
            merged.push(b);
            continue;
        }
        if (localChanged && !remoteChanged) {
            merged.push(l);
            continue;
        }
        if (!localChanged && remoteChanged) {
            merged.push(r);
            continue;
        }

        // Ambos modificaram - field-level merge
        const { resolved, hadConflict } = _mergeFieldLevel(b, l, r);
        merged.push(resolved);
        if (hadConflict) {
            conflicts.push({ id, resolution: 'field_level_local_wins' });
        }
    }

    return { merged, conflicts };
}

/**
 * Merge a nível de propriedade entre dois campos modificados.
 * @private
 */
function _mergeFieldLevel(
    base: any,
    local: any,
    remote: any,
): { resolved: Readonly<Record<string, any>>; hadConflict: boolean } {
    const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
    const result: Record<string, any> = {};
    let hadConflict = false;

    for (const k of keys) {
        const b = base ? base[k] : undefined;
        const l = local[k];
        const r = remote[k];
        const localChanged = JSON.stringify(b) !== JSON.stringify(l);
        const remoteChanged = JSON.stringify(b) !== JSON.stringify(r);

        if (localChanged && remoteChanged && JSON.stringify(l) !== JSON.stringify(r)) {
            // Conflito real - local wins
            result[k] = l;
            hadConflict = true;
        } else if (localChanged) {
            result[k] = l;
        } else {
            result[k] = r !== undefined ? r : l;
        }
    }

    return { resolved: Object.freeze(result), hadConflict };
}
