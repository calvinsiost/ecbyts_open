// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PIPELINE MINIMUM PARAMETER GATE - pure publish-blocking check.

   Reads the required-by-profile technical parameters declared in
   ./pipelineDomainProfile.ts (DomainTechnicalParameter.requiredForPublish)
   and checks them against the values actually filled in an item
   (see section 10.8 of
   docs/specs/features/SPEC_PIPELINE_PACK_CUSTOMIZATION_WORKBENCH.md:
   "bloquear publicacao quando parametro minimo do dominio estiver vazio
   sem justificativa"). No DOM, no storage, no network.
   ================================================================ */

/**
 * Minimal shape this gate needs from a domain technical parameter. Matches
 * the relevant fields of `DomainTechnicalParameter` in
 * ./pipelineDomainProfile.ts without importing it, so this module stays a
 * leaf with zero dependencies.
 */
export interface MinParamGateParameter {
    id: string;
    label: string;
    requiredForPublish?: boolean;
}

/** Values actually filled in the item being published, keyed by parameter id. */
export interface MinParamGateItemParams {
    [paramId: string]: unknown;
    _justifications?: Record<string, unknown>;
}

export interface MinParamGatePendency {
    paramId: string;
    paramLabel: string;
    reason: string;
    hasJustification: boolean;
}

export interface MinParamGateResult {
    canPublish: boolean;
    pendencies: MinParamGatePendency[];
}

/** Returns true when a value is empty: null, undefined, '', or whitespace-only. */
function _isEmptyValue(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0;
    return false;
}

/** Returns true when `itemParams._justifications[paramId]` holds a non-empty justification. */
function _hasJustification(itemParams: MinParamGateItemParams, paramId: string): boolean {
    const justifications = itemParams._justifications;
    if (!justifications || typeof justifications !== 'object') return false;
    return !_isEmptyValue((justifications as Record<string, unknown>)[paramId]);
}

/**
 * Builds the pendency (or accepted-with-justification note) for a single
 * required parameter, or returns null when the parameter is filled.
 */
function _checkParameter(
    parameter: MinParamGateParameter,
    itemParams: MinParamGateItemParams,
): MinParamGatePendency | null {
    const value = itemParams[parameter.id];
    if (!_isEmptyValue(value)) return null;

    const hasJustification = _hasJustification(itemParams, parameter.id);
    return {
        paramId: parameter.id,
        paramLabel: parameter.label,
        reason: hasJustification
            ? 'Parametro minimo obrigatorio esta vazio, mas foi aceito com justificativa registrada.'
            : 'Parametro minimo obrigatorio do perfil de dominio esta vazio e sem justificativa.',
        hasJustification,
    };
}

/**
 * Validates that every parameter marked `requiredForPublish` in the given
 * domain profile's technical parameter list has a filled value in
 * `itemParams`, or an explicit justification at
 * `itemParams._justifications[paramId]`. Parameters without a registered
 * justification block publication; parameters with one are reported as
 * pendencies too (for transparency) but do not block.
 * @param profileParameters Technical parameters of the resolved domain
 *   profile (only `requiredForPublish` entries are checked).
 * @param itemParams Values filled in the item, plus optional `_justifications`.
 */
export function validateMinimumParameters(
    profileParameters: MinParamGateParameter[],
    itemParams: MinParamGateItemParams,
): MinParamGateResult {
    const safeParameters = Array.isArray(profileParameters) ? profileParameters : [];
    const safeItemParams = itemParams && typeof itemParams === 'object' ? itemParams : {};

    const pendencies: MinParamGatePendency[] = [];
    for (const parameter of safeParameters) {
        if (!parameter.requiredForPublish) continue;
        const pendency = _checkParameter(parameter, safeItemParams);
        if (pendency) pendencies.push(pendency);
    }

    const canPublish = pendencies.every((pendency) => pendency.hasJustification);
    return { canPublish, pendencies };
}
