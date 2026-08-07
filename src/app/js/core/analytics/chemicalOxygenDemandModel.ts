// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
/**
 * Chemical Oxygen Demand / Biochemical Oxygen Demand Model -
 * Self-purification, pollutant load, and dissolved oxygen deficit in water bodies.
 *
 * Modelagem de DQO/DBO em corpos hídricos - autodepuração, carga
 * poluidora e déficit de oxigênio dissolvido (OD).
 *
 * References / Referências:
 * - Streeter, H.W. & Phelps, E.B. (1925) A Study of the Pollution and
 *   Natural Purification of the Ohio River. USPHS Bulletin 146, Washington DC.
 * - CONAMA 357/2005 - Classificação de corpos d'água e padrões de qualidade
 * - von Sperling, M. (2007) Introdução à Qualidade das Águas e ao Tratamento
 *   de Esgotos. 3ª ed. UFMG, Belo Horizonte. ISBN 978-85-7041-370-5
 * - ANA (2005) Panorama da Qualidade das Águas Superficiais no Brasil
 */
'use strict';

interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: string;
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
    };
    inputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
}

const SECONDS_PER_DAY = 86400;

/**
 * Compute BOD remaining after first-order decay (deoxygenation).
 * Calcula a DBO remanescente após decaimento de primeira ordem.
 *
 * BOD(t) = BOD0 × exp(-k1 × t)
 *
 * @param bod_initial_mg_L - Initial BOD concentration (mg/L) / DBO inicial
 * @param k1_day           - BOD deoxygenation rate constant (1/day) / Constante de desoxigenação
 * @param time_days        - Elapsed time (days) / Tempo decorrido
 * @returns
 */
export function computeBODDecay(
    bod_initial_mg_L: number,
    k1_day: number,
    time_days: number,
): { bod_remaining_mg_L: number; bod_removed_mg_L: number } {
    if ([bod_initial_mg_L, k1_day, time_days].some((v) => typeof v !== 'number')) {
        throw new TypeError('All parameters must be numbers');
    }
    if (bod_initial_mg_L < 0) throw new RangeError('bod_initial_mg_L must be >= 0');
    if (k1_day < 0) throw new RangeError('k1_day must be >= 0');
    if (time_days < 0) throw new RangeError('time_days must be >= 0');

    const bod_remaining_mg_L = bod_initial_mg_L * Math.exp(-k1_day * time_days);
    const bod_removed_mg_L = bod_initial_mg_L - bod_remaining_mg_L;

    return { bod_remaining_mg_L, bod_removed_mg_L };
}

/**
 * Compute dissolved oxygen deficit using the Streeter-Phelps equation (1925).
 * Calcula o déficit de oxigênio dissolvido pela equação de Streeter-Phelps.
 *
 * D(t) = (k1×L0/(k2-k1))×(exp(-k1×t) - exp(-k2×t)) + D0×exp(-k2×t)
 * DO(t) = DOsat - D(t)
 *
 * @param do_saturation_mg_L - DO saturation concentration (mg/L) / OD de saturação
 * @param do_initial_mg_L    - Initial DO at mixing point (mg/L) / OD inicial
 * @param k1_day             - BOD deoxygenation rate (1/day) / Taxa de desoxigenação
 * @param k2_day             - Reaeration rate constant (1/day) / Constante de reaeração
 * @param bod_mg_L           - Ultimate BOD at mixing point (mg/L) / DBO última
 * @param time_days          - Elapsed time (days) / Tempo decorrido
 * @returns
 */
export function computeOxygenDeficit(
    do_saturation_mg_L: number,
    do_initial_mg_L: number,
    k1_day: number,
    k2_day: number,
    bod_mg_L: number,
    time_days: number,
): { do_mg_L: number; deficit_mg_L: number } {
    if ([do_saturation_mg_L, do_initial_mg_L, k1_day, k2_day, bod_mg_L, time_days].some((v) => typeof v !== 'number')) {
        throw new TypeError('All parameters must be numbers');
    }
    if (do_saturation_mg_L <= 0) throw new RangeError('do_saturation_mg_L must be > 0');
    if (do_initial_mg_L < 0) throw new RangeError('do_initial_mg_L must be >= 0');
    if (k1_day <= 0) throw new RangeError('k1_day must be > 0');
    if (k2_day <= 0) throw new RangeError('k2_day must be > 0');
    if (k1_day === k2_day) throw new RangeError('k1_day and k2_day must differ to avoid division by zero');
    if (bod_mg_L < 0) throw new RangeError('bod_mg_L must be >= 0');
    if (time_days < 0) throw new RangeError('time_days must be >= 0');

    // Déficit inicial / Initial deficit
    const D0 = do_saturation_mg_L - do_initial_mg_L;

    // Equação de Streeter-Phelps (1925) / Streeter-Phelps equation
    const deficit_mg_L =
        ((k1_day * bod_mg_L) / (k2_day - k1_day)) * (Math.exp(-k1_day * time_days) - Math.exp(-k2_day * time_days)) +
        D0 * Math.exp(-k2_day * time_days);

    // OD não pode ser negativo / DO cannot be negative
    const do_mg_L = Math.max(0, do_saturation_mg_L - deficit_mg_L);

    return { do_mg_L, deficit_mg_L };
}

/**
 * Compute daily and annual pollutant load from flow and concentration.
 * Calcula a carga poluidora diária e anual a partir de vazão e concentração.
 *
 * Carga (kg/dia) = Q (m³/s) × C (mg/L) × 86400 (s/dia) / 1000
 *
 * @param flow_m3_s          - Streamflow (m³/s) / Vazão
 * @param concentration_mg_L - Pollutant concentration (mg/L) / Concentração do poluente
 * @returns
 */
export function computePollutantLoad(
    flow_m3_s: number,
    concentration_mg_L: number,
): { load_kg_day: number; load_t_yr: number } {
    if (typeof flow_m3_s !== 'number' || typeof concentration_mg_L !== 'number') {
        throw new TypeError('flow_m3_s and concentration_mg_L must be numbers');
    }
    if (flow_m3_s < 0) throw new RangeError('flow_m3_s must be >= 0');
    if (concentration_mg_L < 0) throw new RangeError('concentration_mg_L must be >= 0');

    // mg/L × m³/s × 86400 s/d ÷ 1000 → kg/d
    const load_kg_day = (flow_m3_s * concentration_mg_L * SECONDS_PER_DAY) / 1000;
    const load_t_yr = (load_kg_day * 365.25) / 1000;

    return { load_kg_day, load_t_yr };
}

/**
 * Classify water body degradation according to CONAMA 357/2005.
 * Classifica a degradação do corpo hídrico conforme CONAMA 357/2005.
 *
 * Classe I: OD ≥ 6 mg/L, DBO ≤ 3 mg/L
 * Classe II: OD ≥ 5 mg/L, DBO ≤ 5 mg/L
 * Classe III: OD ≥ 4 mg/L, DBO ≤ 10 mg/L
 * Classe IV: OD ≥ 2 mg/L (sem limite de DBO)
 *
 * @param do_mg_L  - Dissolved oxygen (mg/L) / Oxigênio dissolvido
 * @param bod_mg_L - BOD 5-day (mg/L) / DBO5
 * @returns
 */
export function classifyWaterBodyDegradation(
    do_mg_L: number,
    bod_mg_L: number,
): { class: string; conama_compliant: boolean; description: string } {
    if (typeof do_mg_L !== 'number' || typeof bod_mg_L !== 'number') {
        throw new TypeError('do_mg_L and bod_mg_L must be numbers');
    }
    if (do_mg_L < 0) throw new RangeError('do_mg_L must be >= 0');
    if (bod_mg_L < 0) throw new RangeError('bod_mg_L must be >= 0');

    let bodyClass: string, description: string;

    if (do_mg_L >= 6 && bod_mg_L <= 3) {
        bodyClass = 'I';
        description = 'Abastecimento doméstico após tratamento simplificado; proteção de comunidades aquáticas';
    } else if (do_mg_L >= 5 && bod_mg_L <= 5) {
        bodyClass = 'II';
        description = 'Abastecimento doméstico após tratamento convencional; atividades de contato primário';
    } else if (do_mg_L >= 4 && bod_mg_L <= 10) {
        bodyClass = 'III';
        description = 'Abastecimento doméstico após tratamento convencional ou avançado; irrigação';
    } else if (do_mg_L >= 2) {
        bodyClass = 'IV';
        description = 'Navegação; harmonia paisagística; usos menos exigentes';
    } else {
        bodyClass = 'IV';
        description = 'Condição crítica — OD abaixo do mínimo de Classe IV; risco de anoxia';
    }

    // Conformidade: qualquer classe CONAMA tem valor mínimo de OD ≥ 2 mg/L
    // Compliance: any CONAMA class requires OD ≥ 2 mg/L
    const conama_compliant = do_mg_L >= 2;

    return { class: bodyClass, conama_compliant, description };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const chemicalOxygenDemandModelMeta: AnalyticsModuleMeta = {
    name: 'chemicalOxygenDemandModel',
    description: 'chemicalOxygenDemandModel',
    category: 'analytics',
    familyTags: ['chemical'],
    provenance: {
        generatedBy: 'claude',
        version: 'v0.1',
        validatedByHuman: false,
        disclaimerAcknowledged: true,
        specRef: 'SPEC_SCIENTIFIC_MODULES_PROGRAM.md',
    },
    // TODO: populate inputSchema/outputSchema when connector is built
    inputSchema: { type: 'object', properties: {}, required: [] },
    outputSchema: { type: 'object', properties: {}, required: [] },
};
