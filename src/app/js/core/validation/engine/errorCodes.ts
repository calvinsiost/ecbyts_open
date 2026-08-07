/**
 * ecbyts - Generic Validation Error Codes
 * Domain-agnostic codes for the validator engine.
 * Domain-specific codes come from imported JSON templates.
 *
 * Convention:
 *   COMMON_* - cross-domain engine rules
 *
 * Language: message=PT (user), fix_hint=EN (agent)
 * @license AGPL-3.0-only
 */

export type FixAction =
    | 'set_value'
    | 'change_value'
    | 'remove_value'
    | 'check_reference'
    | 'manual_review';

export interface MachineHint {
    code: string;
    fix_action: FixAction | string;
    fix_field: string;
    fix_hint: string;
    allowed_values?: string[];
}

export function hint(
    code: string,
    fix_action: FixAction | string,
    fix_field: string,
    fix_hint: string,
    allowed_values?: string[],
): MachineHint {
    const machineHint: MachineHint = { code, fix_action, fix_field, fix_hint };
    if (allowed_values) {
        machineHint.allowed_values = allowed_values;
    }
    return machineHint;
}

export const CODES = Object.freeze({
    COMMON_REQUIRED: 'COMMON_REQUIRED',
    COMMON_INVALID_ENUM: 'COMMON_INVALID_ENUM',
    COMMON_INVALID_NUMERIC: 'COMMON_INVALID_NUMERIC',
    COMMON_OUT_OF_RANGE: 'COMMON_OUT_OF_RANGE',
    COMMON_INVALID_FORMAT: 'COMMON_INVALID_FORMAT',
    COMMON_FIELD_OMITTED: 'COMMON_FIELD_OMITTED',
    COMMON_DUPLICATE_KEY: 'COMMON_DUPLICATE_KEY',
    COMMON_REF_INTEGRITY: 'COMMON_REF_INTEGRITY',
} as const);
