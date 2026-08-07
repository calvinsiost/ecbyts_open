// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/*
 * Uncertainty - Q2Q → Monte Carlo bridge (UNC-001 Phase 2 slice 3)
 *
 * Motivação (Gemini review 2026-04-17 12:50, finding High #2):
 * "Gap de Integração Q2Q-MC: SPEC-Q2Q define a conversão qualitativa→quantitativa,
 *  mas SPEC-002 (MC) não explicita se o motor consome automaticamente os `params`
 *  gerados pelo Q2Q ou se exige reentrada manual de distribuições."
 *
 * Esta bridge converte Q2Q output → variables consumíveis por runMonteCarlo()
 * sem reentrada manual. Preserva compatibilidade: caller pode ignorar Q2Q e
 * passar variables customizadas diretamente.
 */


import { convertQualitativeUncertainty } from './q2q.js';

/**
 * Converte um resultado Q2Q + valor central numérico em variável consumível
 * por runMonteCarlo().
 *
 * Estratégia:
 * - uniform: params {min: central*(1-relDefault/100), max: central*(1+relDefault/100)}
 * - triangular: params {min: lowerAbs, max: upperAbs, mode: central}
 *
 * @param {any} q2qResult - output de convertQualitativeUncertainty()
 * @param {number} centralValue - valor nominal/mediano da variável
 * @param {string} id - identificador para MC
 * @returns {{ok:boolean, variable:object|null, reason?:string}}
 */
export function q2qToMonteCarloVariable(q2qResult: any, centralValue: any, id: any) {
    if (!q2qResult || !q2qResult.ok || q2qResult.blocked) {
        return { ok: false, variable: null, reason: 'q2q_blocked_or_invalid' };
    }
    if (typeof centralValue !== 'number' || !Number.isFinite(centralValue)) {
        return { ok: false, variable: null, reason: 'invalid_central_value' };
    }
    if (!id || typeof id !== 'string') {
        return { ok: false, variable: null, reason: 'missing_id' };
    }

    const mapped = q2qResult.mapped;
    if (!mapped || !mapped.distribution || typeof mapped.relDefault !== 'number') {
        return { ok: false, variable: null, reason: 'invalid_q2q_mapping' };
    }

    const rel = mapped.relDefault / 100;
    const lowerAbs = centralValue * (1 - rel);
    const upperAbs = centralValue * (1 + rel);

    if (mapped.distribution === 'uniform') {
        return {
            ok: true,
            variable: {
                id,
                distribution: 'uniform',
                // Preserve canonical min/max plus legacy a/b aliases.
                params: { min: lowerAbs, max: upperAbs, a: lowerAbs, b: upperAbs },
                source: 'q2q',
                q2q_label: q2qResult.label,
            },
        };
    }

    if (mapped.distribution === 'triangular') {
        return {
            ok: true,
            variable: {
                id,
                distribution: 'triangular',
                // Preserve canonical min/max/mode plus legacy a/b/c aliases.
                params: {
                    min: lowerAbs,
                    max: upperAbs,
                    mode: centralValue,
                    a: lowerAbs,
                    b: upperAbs,
                    c: centralValue,
                },
                source: 'q2q',
                q2q_label: q2qResult.label,
            },
        };
    }

    return { ok: false, variable: null, reason: `unsupported_distribution_${mapped.distribution}` };
}

/**
 * Constrói array de variables para runMonteCarlo() a partir de um policy v3 com
 * q2q_overrides + dicionário de central values por id.
 *
 * Exemplo:
 *   const policy = { q2q_overrides: { K: { label: 'high' }, porosity: { label: 'medium' } } };
 *   const centrals = { K: 1.5e-5, porosity: 0.3 };
 *   const result = buildMcVariablesFromQ2Q(policy, centrals);
 *   // result.variables prontas para runMonteCarlo()
 *
 * @param {any} policy - policy v3 com q2q_overrides
 * @param {Record<string, number>} centralValues - { [id]: number }
 * @param {{ runType?: string }} [opts] - { runType: 'exploratory'|'compliance' }
 * @returns {{ok:boolean, variables:Array<any>, skipped:Array<any>}}
 */
export function buildMcVariablesFromQ2Q(policy: any, centralValues: any, opts: any = {}) {
    if (!policy || typeof policy !== 'object') {
        return { ok: false, variables: [], skipped: [{ reason: 'invalid_policy' }] };
    }
    if (!centralValues || typeof centralValues !== 'object') {
        return { ok: false, variables: [], skipped: [{ reason: 'invalid_centrals' }] };
    }

    const overrides = policy.q2q_overrides || {};
    const runType = opts.runType || 'exploratory';
    const variables = [];
    const skipped = [];

    for (const [id, q2qInput] of Object.entries(overrides)) {
        const central = centralValues[id];
        if (typeof central !== 'number' || !Number.isFinite(central)) {
            skipped.push({ id, reason: 'missing_central_value' });
            continue;
        }

        const q2qResult = convertQualitativeUncertainty(q2qInput as any, { runType });
        const bridgeResult = q2qToMonteCarloVariable(q2qResult, central, id);

        if (bridgeResult.ok) {
            variables.push(bridgeResult.variable);
        } else {
            skipped.push({ id, reason: bridgeResult.reason });
        }
    }

    return { ok: variables.length > 0, variables, skipped };
}
