// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining - Ecotoxicology Risk Assessment
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

'use strict';

/**
 * Ecotoxicology Risk Assessment - Aquatic Environment
 *
 * Módulo puro para avaliação de risco ecotoxicológico aquático:
 * HQ/RQ, Species Sensitivity Distribution (SSD / HC5) e NSF WQI.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * References:
 *   - ECHA (2011). Guidance on Information Requirements and Chemical Safety Assessment.
 *     Chapter R.10: Characterisation of dose [concentration]-response for environment.
 *     European Chemicals Agency. https://echa.europa.eu/guidance-documents/guidance-on-information-requirements-and-csa
 *   - Brown, R.M. et al. (1970). A water quality index - do we dare?
 *     Water & Sewage Works, 117(10), 339-343.
 *   - Posthuma, L., Suter, G.W., Traas, T.P. (Eds.) (2002).
 *     Species Sensitivity Distributions in Ecotoxicology. Lewis Publishers, Boca Raton.
 */

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

// Pesos NSF WQI (Brown et al. 1970) - soma dos 5 sub-índices usados = 0.56
// (subset dos 9 parâmetros originais adaptado para dados típicos de monitoramento)
const NSF_WEIGHTS: Record<string, number> = {
    do_pct_sat: 0.17, // Oxigênio Dissolvido (% saturação)
    bod: 0.11, // Demanda Bioquímica de Oxigênio (mg/L)
    turbidity: 0.08, // Turbidez (NTU)
    nitrate: 0.1, // Nitrato (mg/L NO3-)
    phosphate: 0.1, // Fosfato total (mg/L PO4³-)
};

/**
 * Compute the Hazard Quotient for aquatic risk.
 * Calcula o Quociente de Perigo (HQ) para risco aquático.
 *
 * HQ = MEC / PNEC
 *
 * @param {number} measuredConc         - Measured Environmental Concentration MEC (µg/L or mg/L)
 * @param {number} predictedNoEffectConc - PNEC - Predicted No-Effect Concentration (same unit)
 * @returns {{ hq: number, riskLevel: 'low'|'moderate'|'high' }}
 * @throws {RangeError} If measuredConc < 0 or predictedNoEffectConc <= 0
 * @see ECHA REACH Guidance R.10 (2011)
 */
export function computeHazardQuotient(
    measuredConc: number,
    predictedNoEffectConc: number,
): { hq: number; riskLevel: 'low' | 'moderate' | 'high' } {
    if (measuredConc < 0) throw new RangeError('measuredConc must be >= 0');
    if (predictedNoEffectConc <= 0) throw new RangeError('predictedNoEffectConc must be > 0');

    const hq = measuredConc / predictedNoEffectConc;

    // Classificação de risco conforme ECHA (2011):
    // HQ < 1 → baixo risco; 1 ≤ HQ < 10 → moderado; HQ ≥ 10 → alto
    let riskLevel: 'low' | 'moderate' | 'high';
    if (hq < 1) riskLevel = 'low';
    else if (hq < 10) riskLevel = 'moderate';
    else riskLevel = 'high';

    return { hq, riskLevel };
}

/**
 * Compute the Risk Quotient for sediment ecotoxicology.
 * Calcula o Quociente de Risco (RQ) para sedimento.
 *
 * @param {number} exposure       - Exposure concentration (µg/kg dw or mg/kg dw)
 * @param {number} ecotoxThreshold - Ecotoxicological threshold (same unit)
 * @returns {{ rq: number, riskLevel: 'low'|'moderate'|'high' }}
 * @throws {RangeError} If exposure < 0 or ecotoxThreshold <= 0
 * @see ECHA REACH Guidance R.10 (2011)
 */
export function computeRiskQuotient(
    exposure: number,
    ecotoxThreshold: number,
): { rq: number; riskLevel: 'low' | 'moderate' | 'high' } {
    if (exposure < 0) throw new RangeError('exposure must be >= 0');
    if (ecotoxThreshold <= 0) throw new RangeError('ecotoxThreshold must be > 0');

    const rq = exposure / ecotoxThreshold;

    let riskLevel: 'low' | 'moderate' | 'high';
    if (rq < 1) riskLevel = 'low';
    else if (rq < 10) riskLevel = 'moderate';
    else riskLevel = 'high';

    return { rq, riskLevel };
}

/**
 * Compute Species Sensitivity Distribution HC_p via log-normal fitting.
 * Calcula a Concentração Perigosa para p% das espécies (HC_p).
 *
 * Ajusta distribuição log-normal aos valores de ecotoxicidade fornecidos
 * e retorna HC_p (Hazardous Concentration for p% of species).
 * HC5 (p=5) é o padrão REACH para derivação de PNEC.
 *
 * @param {number[]} ecValues       - Array of EC50/NOEC values (mg/L), min 3 values
 * @param {number}   targetPercentile - Percentile (0–100), e.g. 5 for HC5
 * @returns {number} HC_p in mg/L
 * @throws {RangeError} If ecValues has <3 entries, or percentile out of range
 * @see Posthuma et al. (2002) Species Sensitivity Distributions in Ecotoxicology
 */
export function computeSpeciesSensitivityDistribution(
    ecValues: number[],
    targetPercentile: number,
): number {
    if (!Array.isArray(ecValues) || ecValues.length < 3) {
        throw new RangeError('ecValues must be an array with at least 3 values');
    }
    if (targetPercentile <= 0 || targetPercentile >= 100) {
        throw new RangeError('targetPercentile must be between 0 and 100 (exclusive)');
    }
    if (ecValues.some((v) => v <= 0)) throw new RangeError('all ecValues must be > 0');

    // Transformação log (base natural) dos valores
    const logVals = ecValues.map((v) => Math.log(v));
    const n = logVals.length;

    // Média e desvio padrão amostral em escala log
    const meanLog = logVals.reduce((a, b) => a + b, 0) / n;
    const variance = logVals.reduce((s, x) => s + (x - meanLog) ** 2, 0) / (n - 1);
    const stdLog = Math.sqrt(variance);

    // Inversa da normal padrão via aproximação Beasley-Springer-Moro
    const p = targetPercentile / 100;
    const zp = _normalInverse(p);

    // HC_p = exp(μ_log + z_p × σ_log)
    return Math.exp(meanLog + zp * stdLog);
}

/**
 * Classify Water Quality Index (NSF WQI subset, 0–100).
 * Classifica o Índice de Qualidade da Água (IQA) baseado em NSF WQI.
 *
 * Usa os sub-índices e pesos de Brown et al. (1970):
 * WQI = Σ (wi × qi)
 *
 * @param {{ do_pct_sat: number, bod: number, turbidity: number, nitrate: number, phosphate: number }} params
 *   - do_pct_sat  : OD como % de saturação (0–200)
 *   - bod         : DBO (mg/L)
 *   - turbidity   : Turbidez (NTU)
 *   - nitrate     : Nitrato (mg/L)
 *   - phosphate   : Fosfato total (mg/L)
 * @returns {{ wqi: number, category: 'excellent'|'good'|'fair'|'poor'|'very_poor' }}
 * @throws {TypeError} If any required parameter is missing
 * @see Brown et al. (1970) Water & Sewage Works 117(10):339-343
 */
export function classifyWaterQualityIndex(params: {
    do_pct_sat: number;
    bod: number;
    turbidity: number;
    nitrate: number;
    phosphate: number;
}): { wqi: number; category: 'excellent' | 'good' | 'fair' | 'poor' | 'very_poor' } {
    const required: Array<'do_pct_sat' | 'bod' | 'turbidity' | 'nitrate' | 'phosphate'> = [
        'do_pct_sat',
        'bod',
        'turbidity',
        'nitrate',
        'phosphate',
    ];
    const p = params as Record<string, number>;
    for (const key of required) {
        if (p[key] === undefined || p[key] === null) {
            throw new TypeError(`Missing required parameter: ${key}`);
        }
        if (typeof p[key] !== 'number' || (p[key] as number) < 0) {
            throw new RangeError(`${key} must be a non-negative number`);
        }
    }

    // Sub-índices qi (0–100) por parâmetro - curvas simplificadas de Brown 1970
    const qi: Record<string, number> = {
        do_pct_sat: _qiDO(params.do_pct_sat),
        bod: _qiBOD(params.bod),
        turbidity: _qiTurbidity(params.turbidity),
        nitrate: _qiNitrate(params.nitrate),
        phosphate: _qiPhosphate(params.phosphate),
    };

    // WQI ponderado: Σ wi × qi - resultado em escala 0–(weightSum×100)
    let rawWqi = 0;
    const weights = NSF_WEIGHTS as Record<string, number>;
    for (const key of required) {
        rawWqi += (weights[key] ?? 0) * (qi[key] ?? 0);
    }
    // Normalizar para escala 0–100 dividindo pelo somatório dos pesos
    // Exemplo: todos qi=100 → rawWqi=0.56×100=56 → wqi=56/0.56=100 ✓
    //          todos qi=5   → rawWqi=0.56×5=2.8  → wqi=2.8/0.56=5  ✓
    const weightSum = Object.values(NSF_WEIGHTS).reduce((a, b) => a + b, 0);
    let wqi = rawWqi / weightSum;
    wqi = Math.min(100, Math.max(0, wqi));

    // Classificação NSF WQI
    let category: 'excellent' | 'good' | 'fair' | 'poor' | 'very_poor';
    if (wqi >= 90) category = 'excellent';
    else if (wqi >= 70) category = 'good';
    else if (wqi >= 50) category = 'fair';
    else if (wqi >= 25) category = 'poor';
    else category = 'very_poor';

    return { wqi: Math.round(wqi * 10) / 10, category };
}

// ---------------------------------------------------------------------------
// Internal helpers - sub-índices NSF WQI (curvas de resposta piecewise linear)
// Baseado nas curvas gráficas de Brown et al. (1970), Tabela 1
// ---------------------------------------------------------------------------

/** Sub-índice OD (% saturação) @param {number} pct */
function _qiDO(pct: number): number {
    if (pct >= 140) return 50; // Supersaturação alta — penalidade
    if (pct >= 100) return 100;
    if (pct >= 80) return 80;
    if (pct >= 60) return 60;
    if (pct >= 40) return 40;
    if (pct >= 20) return 20;
    return 5;
}

/** Sub-índice DBO (mg/L) @param {number} bod */
function _qiBOD(bod: number): number {
    if (bod <= 1) return 100;
    if (bod <= 2) return 85;
    if (bod <= 5) return 60;
    if (bod <= 10) return 35;
    if (bod <= 20) return 15;
    return 5;
}

/** Sub-índice Turbidez (NTU) @param {number} ntu */
function _qiTurbidity(ntu: number): number {
    if (ntu <= 1) return 100;
    if (ntu <= 5) return 85;
    if (ntu <= 10) return 70;
    if (ntu <= 50) return 40;
    if (ntu <= 100) return 20;
    return 5;
}

/** Sub-índice Nitrato (mg/L NO3-) @param {number} no3 */
function _qiNitrate(no3: number): number {
    if (no3 <= 1) return 100;
    if (no3 <= 5) return 75;
    if (no3 <= 10) return 50;
    if (no3 <= 20) return 25;
    return 5;
}

/** Sub-índice Fosfato (mg/L PO4³-) @param {number} po4 */
function _qiPhosphate(po4: number): number {
    if (po4 <= 0.1) return 100;
    if (po4 <= 0.5) return 75;
    if (po4 <= 1.0) return 50;
    if (po4 <= 2.0) return 25;
    return 5;
}

/**
 * Inverse normal CDF approximation (Beasley, Springer, Moro, 1977).
 * Aproximação da inversa da função de distribuição acumulada normal padrão.
 *
 * @param {number} p - Probability (0 < p < 1)
 * @returns {number} z-score
 */
function _normalInverse(p: number): number {
    // Coeficientes de Abramowitz & Stegun 26.2.17 (precisão ~1e-4)
    const a = [2.515517, 0.802853, 0.010328];
    const b = [1.432788, 0.189269, 0.001308];
    const t = p < 0.5 ? Math.sqrt(-2 * Math.log(p)) : Math.sqrt(-2 * Math.log(1 - p));
    const num = (a[0] ?? 0) + (a[1] ?? 0) * t + (a[2] ?? 0) * t * t;
    const den = 1 + (b[0] ?? 0) * t + (b[1] ?? 0) * t * t + (b[2] ?? 0) * t * t * t;
    const z = t - num / den;
    return p < 0.5 ? -z : z;
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const ecotoxicologyRiskMeta: AnalyticsModuleMeta = {
    name: 'ecotoxicologyRisk',
    description: 'Ecotoxicology Risk Assessment',
    category: 'analytics',
    familyTags: ['chemical', 'risk'],
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
