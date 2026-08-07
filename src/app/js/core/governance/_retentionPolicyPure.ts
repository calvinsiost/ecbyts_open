// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   RETENTION POLICY PURE (Module C extraction — refactor-opportunities pick)
   ================================================================

   Helpers pure-logic extraídos de core/governance/retentionPolicy.ts.
   Validação + entry build sem state. Pattern Module C campaign.
   ================================================================ */

type AnyRecord = Record<string, any>;

/**
 * Valida params de setPolicy. Throws com mensagem específica:
 *   - params não-objeto
 *   - dataType não em validDataTypes
 *   - retentionDays não-number ou NaN
 *   - retentionDays != -1 (indefinite) e < 1 (inválido)
 *
 * Retorna void quando válido. Pure (sem state).
 */
export function validatePolicyParams(params: any, validDataTypes: ReadonlyArray<string>): void {
    if (!params || typeof params !== 'object') {
        throw new Error('setPolicy: params object required');
    }
    if (!validDataTypes.includes(params.dataType)) {
        throw new Error(`setPolicy: unknown dataType "${params.dataType}"`);
    }
    if (typeof params.retentionDays !== 'number' || Number.isNaN(params.retentionDays)) {
        throw new Error('setPolicy: retentionDays must be a number');
    }
    if (params.retentionDays !== -1 && params.retentionDays < 1) {
        throw new Error('setPolicy: retentionDays must be -1 (indefinite) or >= 1');
    }
}

/**
 * Constrói a entry de policy a partir dos params validados.
 * - rationale: trim de params.rationale se fornecido, senão defaultRationale.
 * - updatedAt: ISO string de `now` (injetável para determinismo em testes).
 * - updatedBy: params.updatedBy ou 'anonymous'.
 *
 * Pure: não toca state interno.
 */
export function buildPolicyEntry(
    params: any,
    defaultRationale: string,
    now: () => string = () => new Date().toISOString(),
): AnyRecord {
    const rationale = params?.rationale ? String(params.rationale).trim() : defaultRationale;
    return {
        dataType: params.dataType,
        retentionDays: params.retentionDays,
        rationale,
        updatedAt: now(),
        updatedBy: params?.updatedBy || 'anonymous',
    };
}
