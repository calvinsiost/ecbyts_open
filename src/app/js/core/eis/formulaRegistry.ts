// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

import { EIS_DEFAULT_WEIGHTS } from './eisCalculator.js';

const AXIS_KEYS = ['T', 'A', 'Cp', 'Ty', 'Cs', 'Cm'];

function axisDef(axis: string, fn: string) {
    return {
        id: `eis.axis.${axis}.v1`,
        kind: 'axis',
        version: 1,
        axis,
        calculatorFn: fn,
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
        paramsDefault: {},
        paramsBounds: {},
        deprecated: false,
    };
}

export const EIS_FORMULA_REGISTRY: Array<Record<string, any>> = [
    axisDef('T', 'computeTFromObservations'),
    axisDef('A', 'computeAFromModel'),
    axisDef('Cp', 'computeCpFromCampaigns'),
    axisDef('Ty', 'computeTyFromObservations'),
    axisDef('Cs', 'computeCsFromObservations'),
    axisDef('Cm', 'computeCmFromObservations'),
    {
        id: 'eis.aggregate.geometric_weighted.v1',
        kind: 'aggregate',
        version: 1,
        calculatorFn: 'calculate',
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
        paramsDefault: {
            mode: 'geometric',
            credentialLevel: 'common',
            credentialMultiplier: null,
            weights: EIS_DEFAULT_WEIGHTS,
        },
        paramsBounds: {},
        deprecated: false,
    },
    {
        id: 'eis.veto.default.v1',
        kind: 'veto',
        version: 1,
        calculatorFn: 'calculate',
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
        paramsDefault: {
            mode: 'veto',
            credentialLevel: 'common',
            credentialMultiplier: null,
            weights: EIS_DEFAULT_WEIGHTS,
        },
        paramsBounds: {},
        deprecated: false,
    },
    {
        id: 'eis.verdict.banding.v1',
        kind: 'verdict',
        version: 1,
        calculatorFn: 'defaultVerdictBanding',
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
        paramsDefault: {
            auditReadyMin: 4.5,
            managementReadyMin: 3.5,
        },
        paramsBounds: {
            auditReadyMin: { min: 0, max: 5 },
            managementReadyMin: { min: 0, max: 5 },
        },
        deprecated: false,
    },
];

const REGISTRY_BY_ID = new Map(EIS_FORMULA_REGISTRY.map((f) => [f.id, f]));

export function listEisFormulas() {
    return [...EIS_FORMULA_REGISTRY];
}

export function getEisFormula(id: string) {
    return REGISTRY_BY_ID.get(id) || null;
}

export function getCanonicalAxisFormulaRefs() {
    const refs: Record<string, string> = {};
    for (const axis of AXIS_KEYS) refs[axis] = `eis.axis.${axis}.v1`;
    return refs;
}

export function validateFormulaRef(id: string) {
    const def = getEisFormula(id);
    if (!def) return { ok: false, error: `Unknown formula_ref: ${id}` };
    if (def.deprecated) return { ok: false, error: `Deprecated formula_ref: ${id}` };
    return { ok: true, def };
}

export { AXIS_KEYS as EIS_FORMULA_AXIS_KEYS };
