// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   JSON INSPECTOR — Edit Validator
   Validacao de edicoes no inspetor JSON.

   Verifica tipo, campos obrigatorios, somente-leitura,
   e ranges antes de aplicar alteracoes ao modelo.
   ================================================================ */

// ----------------------------------------------------------------
// READ-ONLY & REQUIRED FIELDS
// ----------------------------------------------------------------

// Top-level model sections that are editable (elements is the main one)
// eslint-disable-next-line
const EDITABLE_SECTIONS = ['elements'];

// Element-level fields that cannot be edited
const ELEMENT_READ_ONLY = ['id', 'family'];

// Element-level fields that cannot be deleted
const ELEMENT_REQUIRED = ['id', 'family', 'name', 'visible', 'data'];

/**
 * Check if a path is read-only.
 * Verifica se um caminho e somente leitura.
 *
 * Paths like model.elements.N.* are editable (except id/family).
 * All other model sections (project, campaigns, etc.) are read-only
 * because they come from multiple managers and can't be directly written back.
 *
 * @param {string} path - Dot-separated path (e.g., "model.elements.0.id")
 * @returns {boolean}
 */
export function isReadOnly(path: string): boolean {
    const parts = path.split('.');
    if (parts[0] === 'model') parts.shift();

    // Top-level model keys (ecbyts, timestamp, etc.) are read-only
    if (parts.length <= 1) return true;

    // Only elements section is editable
    if (parts[0] !== 'elements') return true;

    // model.elements itself (the array) is read-only
    if (parts.length === 1) return true;

    // model.elements.N - the element object at index N — read-only structurally
    if (parts.length === 2) return true;

    // model.elements.N.id and model.elements.N.family are read-only
    if (parts.length === 3 && ELEMENT_READ_ONLY.includes(parts[2] as string)) return true;

    return false;
}

/**
 * Check if a path is a required field (cannot be deleted).
 * Verifica se caminho e obrigatorio (nao pode ser excluido).
 *
 * @param {string} path - Dot-separated path
 * @returns {boolean}
 */
export function isRequired(path: string): boolean {
    const parts = path.split('.');
    if (parts[0] === 'model') parts.shift();

    // Top-level sections can't be deleted
    if (parts.length <= 1) return true;

    // Elements array can't be deleted
    if (parts[0] === 'elements' && parts.length <= 2) return true;

    // Element required fields: id, family, name, visible, data
    if (parts[0] === 'elements' && parts.length === 3) {
        return ELEMENT_REQUIRED.includes(parts[2] as string);
    }

    return false;
}

/**
 * Extract the element index from a model path, if applicable.
 * Extrai o indice do elemento de um caminho do modelo.
 *
 * @param {string} path - e.g., "model.elements.3.data.center.x"
 * @returns {number|null} - The element index, or null if not an element path
 */
export function getElementIndex(path: string): number | null {
    const parts = path.split('.');
    if (parts[0] === 'model') parts.shift();
    if (parts[0] === 'elements' && parts.length >= 2) {
        const idx = parseInt(parts[1] as string, 10);
        if (!isNaN(idx)) return idx;
    }
    return null;
}

/**
 * Get the element-relative sub-path from a full model path.
 * Retorna sub-caminho relativo ao elemento.
 *
 * @param {string} path - e.g., "model.elements.3.data.center.x"
 * @returns {string[]} - e.g., ["data", "center", "x"]
 */
export function getElementSubPath(path: string): string[] {
    const parts = path.split('.');
    if (parts[0] === 'model') parts.shift();
    if (parts[0] === 'elements') {
        return parts.slice(2); // skip "elements" and index
    }
    return parts;
}

// ----------------------------------------------------------------
// VALIDATION
// ----------------------------------------------------------------

/**
 * Validate an edit before applying it.
 * Valida uma edicao antes de aplica-la ao modelo.
 *
 * @param {string} path - Dot-separated field path
 * @param {*} oldValue - Current value
 * @param {*} newValue - Proposed new value
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateEdit(path: string, oldValue: any, newValue: any): { valid: boolean; error?: string } {
    // Read-only check
    if (isReadOnly(path)) {
        return { valid: false, error: 'Field is read-only' };
    }

    // Same value - no change needed
    if (oldValue === newValue) {
        return { valid: true };
    }

    // Type preservation: numbers stay numbers, strings stay strings, etc.
    const oldType = typeof oldValue;
    const newType = typeof newValue;

    if (oldValue !== null && oldValue !== undefined && oldType !== newType) {
        return { valid: false, error: `Type mismatch: expected ${oldType}, got ${newType}` };
    }

    // Number validation
    if (newType === 'number') {
        if (!isFinite(newValue)) {
            return { valid: false, error: 'Must be a finite number' };
        }
    }

    // Color validation (hex format)
    if (path.endsWith('.color') && typeof newValue === 'string' && newValue !== '') {
        if (!/^#[0-9A-Fa-f]{6}$/.test(newValue)) {
            return { valid: false, error: 'Invalid hex color (use #RRGGBB)' };
        }
    }

    // Coordinate range check (avoid absurd values)
    if (isCoordinateField(path) && typeof newValue === 'number') {
        if (Math.abs(newValue) > 1e6) {
            return { valid: false, error: 'Value out of reasonable range' };
        }
    }

    // Name: must not be empty
    if (path.endsWith('.name') && typeof newValue === 'string') {
        if (newValue.trim() === '') {
            return { valid: false, error: 'Name cannot be empty' };
        }
    }

    return { valid: true };
}

/**
 * Parse a raw input string into the correct type based on the old value.
 * Converte texto de entrada para o tipo correto baseado no valor original.
 *
 * @param {string} rawValue - Raw input string
 * @param {*} oldValue - Current value (to determine type)
 * @returns {{ value: *, error?: string }}
 */
export function parseInputValue(rawValue: string, oldValue: any): { value: any; error?: string } {
    const oldType = oldValue === null ? 'null' : typeof oldValue;

    switch (oldType) {
        case 'number': {
            const num = Number(rawValue);
            if (isNaN(num)) {
                return { value: null, error: 'Invalid number' };
            }
            return { value: num };
        }
        case 'boolean': {
            const lower = rawValue.toLowerCase().trim();
            if (lower === 'true' || lower === '1') return { value: true };
            if (lower === 'false' || lower === '0') return { value: false };
            return { value: null, error: 'Must be true or false' };
        }
        case 'null': {
            if (rawValue.trim() === 'null') return { value: null };
            // Allow changing null to a string
            return { value: rawValue };
        }
        case 'string':
        default:
            return { value: rawValue };
    }
}

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------

function isCoordinateField(path: any) {
    const coordKeys = [
        '.x',
        '.y',
        '.z',
        '.easting',
        '.northing',
        '.elevation',
        '.radiusX',
        '.radiusY',
        '.radiusZ',
        '.width',
        '.length',
        '.depth',
        '.diameter',
        '.height',
        '.top',
        '.bottom',
    ];
    return coordKeys.some((k) => path.endsWith(k));
}
