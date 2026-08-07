// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Input boundary enforcement — pure logic (CONSIST-OBS-001 B4).
 *
 * Enforcement de unidade + incerteza na FRONTEIRA de entrada de observação
 * (não só na análise): "número nu" (valor sem unidade) é a principal fonte
 * de dado não-citável e não-comparável (FAIR², Nature Sci Data).
 *
 * Modos:
 *   warn   — não bloqueia; retorna warnings + enriquecimento (default,
 *            preserva fluxos existentes: random model, imports legados)
 *   strict — rejeita número nu / unidade desconhecida (ok=false)
 *
 * Enriquecimento: anexa `_unitMeta` { ucum, qudt, fairCitable,
 * hasUncertainty } SEM mutar o input (cópia). O badge UNC-001 consome
 * `hasUncertainty`; o export FAIR consome `ucum`/`qudt`.
 *
 * Clock/catálogo injetáveis — Node-testável.
 */

import { toUcum, toQudt, isFairCitable } from './_ucumMappingPure.js';

export type EnforcementMode = 'warn' | 'strict';

export interface EnforcementResult {
    readonly ok: boolean;
    readonly errors: readonly string[];
    readonly warnings: readonly string[];
    /** Observação enriquecida (cópia; original nunca mutado). */
    readonly enriched: any;
}

/**
 * Enforce unit + uncertainty at the observation input boundary.
 *
 * @param obs           observação candidata ({ value, unitId?, uncertainty? ... })
 * @param opts.mode     'warn' (default) | 'strict'
 * @param opts.knownUnitIds catálogo injetável (ids válidos)
 */
export function enforceObservationInput(
    obs: any,
    opts: { mode?: EnforcementMode; knownUnitIds?: readonly string[] } = {},
): EnforcementResult {
    const mode: EnforcementMode = opts.mode === 'strict' ? 'strict' : 'warn';
    const known = opts.knownUnitIds || null;
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!obs || typeof obs !== 'object') {
        return Object.freeze({
            ok: false,
            errors: Object.freeze(['observation must be an object']),
            warnings: Object.freeze([]),
            enriched: obs,
        });
    }

    // 1. Valor numérico finito
    const value = Number(obs.value);
    if (!Number.isFinite(value)) {
        errors.push(`value must be a finite number (got: ${String(obs.value)})`);
    }

    // 2. Unidade obrigatória — REJEITA número nu (strict) / avisa (warn)
    const unitId = typeof obs.unitId === 'string' && obs.unitId.trim() ? obs.unitId.trim() : null;
    if (!unitId) {
        const msg = 'naked number: observation has no unitId (FAIR² requires explicit unit)';
        if (mode === 'strict') errors.push(msg);
        else warnings.push(msg);
    } else if (known && !known.includes(unitId)) {
        const msg = `unknown unitId "${unitId}" (not in catalog)`;
        if (mode === 'strict') errors.push(msg);
        else warnings.push(msg);
    }

    // 3. Incerteza (UNC-001 na ENTRADA, não só na análise)
    const hasUncertainty = obs.uncertainty !== undefined && obs.uncertainty !== null
        && Number.isFinite(Number(obs.uncertainty?.value ?? obs.uncertainty));
    if (!hasUncertainty) {
        warnings.push('no uncertainty declared — UNC-001 quality badge will report "unknown"');
    }

    // 4. Enriquecimento FAIR (nunca muta o original)
    const ucum = unitId ? toUcum(unitId) : null;
    const enriched = {
        ...obs,
        _unitMeta: Object.freeze({
            unitId,
            ucum,
            qudt: unitId ? toQudt(unitId) : null,
            fairCitable: unitId ? isFairCitable(unitId) : false,
            hasUncertainty,
        }),
    };
    if (unitId && !ucum) {
        warnings.push(`unit "${unitId}" has no UCUM mapping — not FAIR-citable (declared in _ucumMappingPure)`);
    }

    return Object.freeze({
        ok: errors.length === 0,
        errors: Object.freeze(errors),
        warnings: Object.freeze(warnings),
        enriched,
    });
}
