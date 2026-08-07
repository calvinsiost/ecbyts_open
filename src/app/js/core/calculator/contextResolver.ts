// @ts-check
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

/* ================================================================
   CONTEXT RESOLVER — Generic variable-to-regulatory-context mapper
   Resolucao generica de variaveis de observacao para contexto regulatorio

   Nao hardcoda nenhum dominio — usa tabela de regras extensivel.
   Cada regra mapeia combinacao de variaveis + familia → chave regulatoria
   que e usada por validateObservationFull() em validation/rules.js.
   ================================================================ */

import { FAMILY_VARIABLES } from '../elements/randomModel.js';

interface ContextRule {
    match: Record<string, string>;
    context?: string;
    familyMap?: Record<string, string>;
}

// ----------------------------------------------------------------
// CONTEXT RULES - Tabela de mapeamento generica
// Cada regra: { match: { varId: valor }, context | familyMap }
// familyMap permite refinar por familia de elemento
// ----------------------------------------------------------------

const CONTEXT_RULES: ContextRule[] = [
    {
        match: { is_matrix_water: '1' },
        familyMap: {
            well: 'groundwater',
            spring: 'groundwater',
            sensor: 'groundwater',
            sample: 'groundwater',
            lake: 'surface_water',
            river: 'surface_water',
            effluent_point: 'surface_water',
            _default: 'groundwater',
        },
    },
    { match: { is_matrix_soil: '1' }, context: 'soil' },
    { match: { is_matrix_air: '1' }, context: 'air' },
    { match: { is_matrix_biota: '1' }, context: 'biota' },
    {
        match: { is_matrix_human: '1' },
        familyMap: {
            area: 'occupational',
            individual: 'occupational',
            _default: 'occupational',
        },
    },
    { match: { is_matrix_geotechnical: '1' }, context: 'geotechnical' },
    { match: { is_matrix_remote_sensing: '1' }, context: 'remote_sensing' },
    { match: { is_matrix_climatology: '1' }, context: 'climatology' },
    { match: { is_matrix_resilience: '1' }, context: 'resilience' },
];

// ----------------------------------------------------------------
// RESOLVE REGULATORY CONTEXT
// Dadas variaveis de observacao + familia, retorna chave regulatoria
// ----------------------------------------------------------------

/**
 * Resolve observation variables to a regulatory context string.
 * Itera regras em ordem, retorna primeiro match.
 * Fallback: infere de FAMILY_VARIABLES se obs nao tem variaveis.
 */
export function resolveRegulatoryContext(variables: any, family: string): string {
    const vars = normalizeVariables(variables);
    for (const rule of CONTEXT_RULES) {
        if (matchesRule(vars, rule.match)) {
            if (rule.context) return rule.context;
            if (rule.familyMap) {
                const fm = rule.familyMap as any;
                return fm[family] || fm._default || 'groundwater';
            }
        }
    }
    // Fallback: infere variaveis da familia e tenta novamente
    if (family && (FAMILY_VARIABLES as any)[family]) {
        const inferred = normalizeVariables((FAMILY_VARIABLES as any)[family]);
        for (const rule of CONTEXT_RULES) {
            if (matchesRule(inferred, rule.match)) {
                if (rule.context) return rule.context;
                if (rule.familyMap) {
                    const fm = rule.familyMap as any;
                    return fm[family] || fm._default || 'groundwater';
                }
            }
        }
    }
    return 'groundwater'; // ultimo recurso
}

/**
 * Infer default variables from element family.
 */
export function inferVariablesFromFamily(family: string): any {
    return (FAMILY_VARIABLES as any)[family] || {};
}

/**
 * Get the variable value from obs.variables.
 */
export function getVariableValue(variables: any, variableId: string): string {
    if (!variables) return '';
    const v = (variables as any)[variableId];
    if (v == null) return '';
    if (typeof v === 'object') return String(v.value || '');
    return String(v);
}

// ----------------------------------------------------------------
// INTERNALS
// ----------------------------------------------------------------

function normalizeVariables(variables: any): Record<string, string> {
    if (!variables) return {};
    const flat: Record<string, string> = {};
    for (const [key, val] of Object.entries(variables)) {
        if (val == null) continue;
        flat[key] = typeof val === 'object' ? String((val as any).value || '') : String(val);
    }
    return flat;
}

function matchesRule(flatVars: Record<string, string>, matchCriteria: Record<string, string>): boolean {
    for (const [key, expected] of Object.entries(matchCriteria)) {
        if (flatVars[key] !== expected) return false;
    }
    return true;
}
