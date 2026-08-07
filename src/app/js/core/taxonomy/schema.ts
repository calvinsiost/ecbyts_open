// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   TAXONOMY SCHEMA — Field type definitions and validation
   Tipos de campo e validacao de valores de taxonomia

   Define os tipos suportados (string, number, enum, boolean, date),
   valida valores contra constraints do campo e fornece defaults.
   ================================================================ */

// ----------------------------------------------------------------
// FIELD TYPES
// Tipos de campo suportados em definicoes de taxonomia
// ----------------------------------------------------------------

export const FIELD_TYPES: string[] = ['string', 'number', 'enum', 'boolean', 'date'];

interface EnumOption {
    value: unknown;
    label?: string;
}
interface FieldDef {
    id: string;
    type: string;
    required?: boolean;
    defaultValue?: unknown;
    maxLength?: number;
    pattern?: string;
    formatHint?: string;
    min?: number;
    max?: number;
    options?: ReadonlyArray<EnumOption>;
}
interface FieldSection {
    id: string;
    fields: ReadonlyArray<FieldDef>;
}
interface TaxonomyDefinition {
    id?: unknown;
    name?: unknown;
    families?: ReadonlyArray<unknown>;
    fieldSections?: ReadonlyArray<FieldSection>;
    observationFields?: ReadonlyArray<FieldDef>;
}

interface ValidationResult {
    valid: boolean;
    error?: string;
}

// ----------------------------------------------------------------
// VALIDATION
// Valida valor contra definicao do campo
// ----------------------------------------------------------------

/**
 * Validate a single field value against its definition.
 * Valida um valor contra a definicao do campo (tipo, required, pattern, etc.).
 *
 * @param fieldDef - Field definition from taxonomy
 * @param value - Value to validate
 */
export function validateFieldValue(fieldDef: FieldDef, value: unknown): ValidationResult {
    if (!fieldDef || !fieldDef.type) {
        return { valid: false, error: 'Invalid field definition' };
    }

    // Required check - empty string, null, undefined
    const isEmpty = value === null || value === undefined || value === '';
    if (fieldDef.required && isEmpty) {
        return { valid: false, error: `Field "${fieldDef.id}" is required` };
    }

    // Optional + empty → valid
    if (isEmpty) {
        return { valid: true };
    }

    switch (fieldDef.type) {
        case 'string':
            return _validateString(fieldDef, value);
        case 'number':
            return _validateNumber(fieldDef, value);
        case 'enum':
            return _validateEnum(fieldDef, value);
        case 'boolean':
            return _validateBoolean(value);
        case 'date':
            return _validateDate(fieldDef, value);
        default:
            return { valid: false, error: `Unknown field type: ${fieldDef.type}` };
    }
}

/**
 * Get the default value for a field based on its type.
 * Retorna valor inicial baseado no tipo do campo.
 *
 * @param fieldDef - Field definition
 * @returns Default value
 */
export function getDefaultValue(fieldDef: FieldDef): unknown {
    if (fieldDef.defaultValue !== undefined) return fieldDef.defaultValue;
    switch (fieldDef.type) {
        case 'string':
            return '';
        case 'number':
            return null;
        case 'enum':
            return '';
        case 'boolean':
            return false;
        case 'date':
            return '';
        default:
            return null;
    }
}

/**
 * Validate a complete taxonomy definition structure.
 * Verifica se a definicao de taxonomia esta bem formada.
 *
 * @param taxonomy - Taxonomy definition object
 */
export function validateTaxonomyDefinition(taxonomy: TaxonomyDefinition): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!taxonomy.id || typeof taxonomy.id !== 'string') {
        errors.push('Taxonomy must have a string "id"');
    }
    if (!taxonomy.name || typeof taxonomy.name !== 'string') {
        errors.push('Taxonomy must have a string "name"');
    }
    if (!Array.isArray(taxonomy.families) || taxonomy.families.length === 0) {
        errors.push('Taxonomy must have a non-empty "families" array');
    }
    if (!Array.isArray(taxonomy.fieldSections)) {
        errors.push('Taxonomy must have a "fieldSections" array');
    } else {
        taxonomy.fieldSections.forEach((section, si) => {
            if (!section.id) errors.push(`fieldSections[${si}]: missing id`);
            if (!Array.isArray(section.fields)) {
                errors.push(`fieldSections[${si}]: "fields" must be an array`);
            } else {
                (section.fields as ReadonlyArray<FieldDef>).forEach((field: FieldDef, fi: number) => {
                    _validateFieldDef(field, `fieldSections[${si}].fields[${fi}]`, errors);
                });
            }
        });
    }

    // Optional observationFields
    if (taxonomy.observationFields !== undefined) {
        if (!Array.isArray(taxonomy.observationFields)) {
            errors.push('"observationFields" must be an array');
        } else {
            taxonomy.observationFields.forEach((field, fi) => {
                _validateFieldDef(field, `observationFields[${fi}]`, errors);
            });
        }
    }

    return { valid: errors.length === 0, errors };
}

// ----------------------------------------------------------------
// PRIVATE VALIDATORS
// Validadores internos por tipo
// ----------------------------------------------------------------

function _validateString(fieldDef: FieldDef, value: unknown): ValidationResult {
    if (typeof value !== 'string') {
        return { valid: false, error: `Expected string, got ${typeof value}` };
    }
    if (fieldDef.maxLength && value.length > fieldDef.maxLength) {
        return { valid: false, error: `Max length ${fieldDef.maxLength}, got ${value.length}` };
    }
    if (fieldDef.pattern) {
        const re = new RegExp(fieldDef.pattern);
        if (!re.test(value)) {
            return { valid: false, error: fieldDef.formatHint || `Does not match pattern ${fieldDef.pattern}` };
        }
    }
    return { valid: true };
}

function _validateNumber(fieldDef: FieldDef, value: unknown): ValidationResult {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (typeof num !== 'number' || isNaN(num)) {
        return { valid: false, error: 'Expected a number' };
    }
    if (fieldDef.min !== undefined && num < fieldDef.min) {
        return { valid: false, error: `Minimum value is ${fieldDef.min}` };
    }
    if (fieldDef.max !== undefined && num > fieldDef.max) {
        return { valid: false, error: `Maximum value is ${fieldDef.max}` };
    }
    return { valid: true };
}

function _validateEnum(fieldDef: FieldDef, value: unknown): ValidationResult {
    if (!Array.isArray(fieldDef.options)) {
        return { valid: false, error: 'Enum field has no options defined' };
    }
    const allowed = fieldDef.options.map((o) => o.value);
    if (!allowed.includes(value)) {
        return { valid: false, error: `Value "${value}" not in allowed options` };
    }
    return { valid: true };
}

function _validateBoolean(value: unknown): ValidationResult {
    if (typeof value !== 'boolean') {
        return { valid: false, error: `Expected boolean, got ${typeof value}` };
    }
    return { valid: true };
}

function _validateDate(_fieldDef: FieldDef, value: unknown): ValidationResult {
    if (typeof value !== 'string') {
        return { valid: false, error: 'Date must be a string' };
    }
    const parsed = Date.parse(value);
    if (isNaN(parsed)) {
        return { valid: false, error: 'Invalid date format' };
    }
    return { valid: true };
}

/**
 * Validate a single field definition structure.
 * @param field
 * @param path - For error messages
 * @param errors - Accumulator
 */
function _validateFieldDef(field: FieldDef, path: string, errors: string[]): void {
    if (!field.id) {
        errors.push(`${path}: missing "id"`);
    }
    if (!field.type || !FIELD_TYPES.includes(field.type)) {
        errors.push(`${path}: "type" must be one of ${FIELD_TYPES.join(', ')}`);
    }
    if (field.type === 'enum') {
        if (!Array.isArray(field.options) || field.options.length === 0) {
            errors.push(`${path}: enum field must have non-empty "options" array`);
        } else {
            field.options.forEach((opt, oi) => {
                if (opt.value === undefined) {
                    errors.push(`${path}.options[${oi}]: missing "value"`);
                }
            });
        }
    }
}
