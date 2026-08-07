// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Environmental Flow Assessment - ecological flow regimes, Q95/Q90, IHA alteration index
// Vazão ecológica - regime de referência, hidrologia de referência e índice de alteração hidrológica

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

type FlowRegime = 'flushing' | 'outstanding' | 'excellent' | 'good' | 'fair' | 'poor' | 'minimum';

/**
 * Compute recommended ecological flow using the Tennant (Instream Flow Incremental Methodology) method.
 * Calcula a vazão ecológica recomendada pelo método Tennant (1976).
 *
 * @param mean_annual_flow_m3_s - Mean Annual Flow (MAF) in m³/s
 * @param season - Season of the year
 * @param flow_regime - Target ecological regime
 *
 * Refs: Tennant (1976) Fisheries 1(4):6-10; ANA (2013) Conjuntura dos Recursos Hídricos no Brasil
 */
export function computeTennantFlow(
    mean_annual_flow_m3_s: number,
    season: 'wet' | 'dry',
    flow_regime: FlowRegime,
): { ecological_flow_m3_s: number; percent_maf: number } {
    if (typeof mean_annual_flow_m3_s !== 'number') throw new TypeError('mean_annual_flow_m3_s must be a number');
    if (mean_annual_flow_m3_s < 0) throw new RangeError('mean_annual_flow_m3_s cannot be negative');

    const VALID_SEASONS = ['wet', 'dry'];
    const VALID_REGIMES = ['flushing', 'outstanding', 'excellent', 'good', 'fair', 'poor', 'minimum'];
    if (!VALID_SEASONS.includes(season)) throw new TypeError('Invalid season; must be "wet" or "dry"');
    if (!VALID_REGIMES.includes(flow_regime)) throw new TypeError('Invalid flow_regime');

    // Percentuais do MAF por regime (Tennant 1976, Tabela 1)
    const REGIME_PCT: Record<FlowRegime, number> = {
        flushing: 200,
        outstanding: 60,
        excellent: 40,
        good: 30,
        fair: 20,
        poor: 10,
        minimum: 10,
    };

    let percent_maf = REGIME_PCT[flow_regime];
    // Ajuste sazonal: período úmido +5%, período seco -5% (exceto flushing e minimum)
    if (flow_regime !== 'flushing' && flow_regime !== 'minimum') {
        percent_maf += season === 'wet' ? 5 : -5;
        percent_maf = Math.max(5, percent_maf); // mínimo absoluto de 5% MAF
    }

    const ecological_flow_m3_s = (mean_annual_flow_m3_s * percent_maf) / 100;

    return {
        ecological_flow_m3_s: Math.round(ecological_flow_m3_s * 10000) / 10000,
        percent_maf: Math.round(percent_maf * 100) / 100,
    };
}

/**
 * Compute Q95 and Q90 exceedance flows from a daily flow series.
 * Calcula as vazões de permanência Q95 e Q90 a partir de uma série de vazões diárias.
 *
 * Q95 = flow exceeded 95% of time (5th percentile); Q90 = 10th percentile
 *
 * @param flow_series - Array of daily (or monthly) flow values in m³/s; min 12 values
 *
 * Refs: Richter et al. (1996) Conservation Biology DOI:10.1046/j.1523-1739.1996.10020153.x; ANA (2013)
 */
export function computeQ95Flow(flow_series: number[]): { q95_m3_s: number; q90_m3_s: number } {
    if (!Array.isArray(flow_series)) throw new TypeError('flow_series must be an array');
    if (flow_series.length < 12) throw new RangeError('flow_series must have at least 12 values');
    if (flow_series.some((v) => typeof v !== 'number' || v < 0)) {
        throw new RangeError('All flow values must be non-negative numbers');
    }

    // Ordena em ordem crescente para calcular percentis
    const sorted = [...flow_series].sort((a, b) => a - b);
    // eslint-disable-next-line
    const n = sorted.length;

    // Interpolação linear de percentil (método R tipo 7 - padrão estatístico)
    function percentile(arr: number[], p: number): number {
        const idx = (p / 100) * (arr.length - 1);
        const lower = Math.floor(idx);
        const upper = Math.ceil(idx);
        if (lower === upper) return arr[lower]!;
        return arr[lower]! + (idx - lower) * (arr[upper]! - arr[lower]!);
    }

    const q95_m3_s = percentile(sorted, 5); // excedido 95% do tempo = percentil 5
    const q90_m3_s = percentile(sorted, 10); // excedido 90% do tempo = percentil 10

    return {
        q95_m3_s: Math.round(q95_m3_s * 10000) / 10000,
        q90_m3_s: Math.round(q90_m3_s * 10000) / 10000,
    };
}

/**
 * Compute hydrological alteration index (simplified IHA) comparing pre- and post-impact flows.
 * Calcula o Índice de Alteração Hidrológica (IHA simplificado) comparando pré e pós-impacto.
 *
 * IHA = mean(|pre_i - post_i| / pre_i) × 100  over monthly means
 *
 * @param pre_impact_flows - Pre-impact monthly flow series (m³/s); min 12 values
 * @param post_impact_flows - Post-impact monthly flow series (m³/s); same length
 *
 * Refs: Richter et al. (1996) Conservation Biology DOI:10.1046/j.1523-1739.1996.10020153.x
 */
export function computeHydrologicalAlteration(
    pre_impact_flows: number[],
    post_impact_flows: number[],
): { iha_score: number; altered_indicators: number; alteration_level: 'low' | 'moderate' | 'high' } {
    if (!Array.isArray(pre_impact_flows) || !Array.isArray(post_impact_flows)) {
        throw new TypeError('Both parameters must be arrays');
    }
    if (pre_impact_flows.length < 12 || post_impact_flows.length < 12) {
        throw new RangeError('Both arrays must have at least 12 values');
    }
    if (pre_impact_flows.length !== post_impact_flows.length) {
        throw new RangeError('Both arrays must have the same length');
    }
    if (pre_impact_flows.some((v) => v < 0) || post_impact_flows.some((v) => v < 0)) {
        throw new RangeError('Flow values cannot be negative');
    }

    // Calcula médias mensais (grupos de 12 meses) para pré e pós
    const n = 12;
    const pre_monthly = Array.from({ length: n }, (_, m) => {
        const vals = pre_impact_flows.filter((_, i) => i % n === m);
        return vals.reduce((s, v) => s + v, 0) / vals.length;
    });
    const post_monthly = Array.from({ length: n }, (_, m) => {
        const vals = post_impact_flows.filter((_, i) => i % n === m);
        return vals.reduce((s, v) => s + v, 0) / vals.length;
    });

    // IHA = média das alterações relativas por mês
    let sum_alteration = 0;
    let altered_indicators = 0;
    for (let m = 0; m < n; m++) {
        const pre = pre_monthly[m]!;
        if (pre === 0) continue;
        const rel = Math.abs(pre - post_monthly[m]!) / pre;
        sum_alteration += rel;
        if (rel > 0.33) altered_indicators++;
    }
    const iha_score = Math.round((sum_alteration / n) * 10000) / 100; // em %

    // Classificação Richter (1996): low < 33%, moderate 33–67%, high > 67%
    let alteration_level: 'low' | 'moderate' | 'high';
    if (iha_score < 33) alteration_level = 'low';
    else if (iha_score <= 67) alteration_level = 'moderate';
    else alteration_level = 'high';

    return { iha_score, altered_indicators, alteration_level };
}

/**
 * Classify river ecological status based on flow and biological indicators.
 * Classifica o estado ecológico do rio baseado em indicadores de fluxo e biológicos.
 *
 * @param eco_flow_deficit_pct - Ecological flow deficit in % (0 = no deficit, 100 = fully dry)
 * @param iha_score - IHA alteration score in % (from computeHydrologicalAlteration)
 * @param fish_index - Fish index 0–1 (1 = reference, 0 = degraded)
 * @param macroinvertebrate_index - Macroinvertebrate index 0–1
 *
 * Refs: EU WFD 2000/60/CE Annex V; CONAMA 357/2005; MMA Resolução 357/2005
 */
export function classifyRiverEcologicalStatus(
    eco_flow_deficit_pct: number,
    iha_score: number,
    fish_index: number,
    macroinvertebrate_index: number,
): { status: 'reference' | 'good' | 'moderate' | 'poor' | 'bad'; flow_recommendation_m3_s: string } {
    if ([eco_flow_deficit_pct, iha_score, fish_index, macroinvertebrate_index].some((v) => typeof v !== 'number')) {
        throw new TypeError('All parameters must be numbers');
    }
    if (eco_flow_deficit_pct < 0 || eco_flow_deficit_pct > 100)
        throw new RangeError('eco_flow_deficit_pct must be in [0, 100]');
    if (iha_score < 0) throw new RangeError('iha_score cannot be negative');
    if (fish_index < 0 || fish_index > 1) throw new RangeError('fish_index must be in [0, 1]');
    if (macroinvertebrate_index < 0 || macroinvertebrate_index > 1)
        throw new RangeError('macroinvertebrate_index must be in [0, 1]');

    // BAD: déficit > 80% (WFD critério absoluto)
    if (eco_flow_deficit_pct > 80) {
        return {
            status: 'bad',
            flow_recommendation_m3_s: 'Critical: restore minimum ecological flow immediately (Q7,10 reference)',
        };
    }
    // REFERENCE: déficit < 5%, IHA < 10%, biota excelente
    if (eco_flow_deficit_pct < 5 && iha_score < 10 && fish_index >= 0.8 && macroinvertebrate_index >= 0.8) {
        return { status: 'reference', flow_recommendation_m3_s: 'Reference conditions — maintain current flow regime' };
    }
    // GOOD
    if (eco_flow_deficit_pct < 20 && iha_score < 33 && fish_index >= 0.6 && macroinvertebrate_index >= 0.6) {
        return {
            status: 'good',
            flow_recommendation_m3_s: 'Good ecological status — maintain Q90 as minimum ecological flow',
        };
    }
    // POOR
    if (eco_flow_deficit_pct > 50 || iha_score > 67 || fish_index < 0.3 || macroinvertebrate_index < 0.3) {
        return {
            status: 'poor',
            flow_recommendation_m3_s: 'Poor status — implement flow augmentation; target 20% MAF as minimum',
        };
    }
    // MODERATE por exclusão
    return {
        status: 'moderate',
        flow_recommendation_m3_s: 'Moderate status — enforce 10% MAF minimum; monitor biotic recovery',
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const environmentalFlowAssessmentMeta: AnalyticsModuleMeta = {
    name: 'environmentalFlowAssessment',
    description: 'environmentalFlowAssessment',
    category: 'analytics',
    familyTags: ['environmental'],
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
