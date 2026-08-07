// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
'use strict';
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//

/**
 * Bioaccumulation in Food Chains
 * Bioacumulação em cadeias alimentares
 *
 * References / Referências:
 *   Mackay, D. & Fraser, A. (2000). Bioaccumulation of persistent organic chemicals:
 *     mechanisms and models. Environmental Pollution, 110(3), 375–391.
 *     DOI: 10.1016/S0269-7491(00)00162-7
 *   US EPA (2000). Methodology for Deriving Ambient Water Quality Criteria for the
 *     Protection of Human Health (Technical Support Document). EPA-822-B-00-004.
 *   Arnot, J.A. & Gobas, F.A.P.C. (2006). A review of bioconcentration factor (BCF)
 *     and bioaccumulation factor (BAF) assessments for organic chemicals in aquatic
 *     organisms. Environmental Reviews, 14(4), 257–297. DOI: 10.1139/a06-005
 *   Gobas, F.A.P.C. (1993). A model for predicting the bioaccumulation of hydrophobic
 *     organic chemicals in aquatic food webs. Ecological Modelling, 69(1-2), 1–17.
 *     DOI: 10.1016/0304-3800(93)90spectrumX
 *   Veith, G.D. & Kosian, P. (1983). Estimating bioconcentration potential from
 *     octanol-water partition coefficients. In: Physical Behavior of PCBs in the Great Lakes.
 *
 * @module bioaccumulationFoodChain
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

// ─── Bioconcentration Factor (BCF) ───────────────────────────────────────────

/**
 * Estimate the Bioconcentration Factor (BCF) from the octanol-water partition
 * coefficient (Kow) using the Veith (1983) regression for fish.
 * Estima o Fator de Bioconcentração (BCF) a partir do coeficiente de partição
 * octanol-água (Kow) pela regressão de Veith (1983) para peixes.
 *
 * log₁₀(BCF) = 0.85 × log₁₀(Kow) − 0.70
 * Valid range: log₁₀(Kow) ∈ [1, 8]
 *
 * For log₁₀(Kow) > 6, metabolism may reduce BCF; this model is conservative.
 * Para log₁₀(Kow) > 6, o metabolismo pode reduzir o BCF; o modelo é conservador.
 *
 * @param logKow   Decadic logarithm of octanol-water partition coefficient
 *                  Logaritmo decimal do coeficiente de partição octanol-água
 * @returns Bioconcentration factor BCF (L/kg wet weight)
 *          Fator de bioconcentração BCF (L/kg peso úmido)
 * @throws {RangeError} If logKow is outside [1, 8] or is not finite
 */
export function bioconcentrationFactor(logKow: number): number {
    if (!Number.isFinite(logKow) || logKow < 1 || logKow > 8) {
        throw new RangeError('logKow must be a finite number in [1, 8]');
    }
    const logBCF = 0.85 * logKow - 0.7;
    return Math.pow(10, logBCF);
}

/**
 * Estimate the Bioaccumulation Factor (BAF) for a given trophic level using the
 * Gobas (1993) trophic magnification model.
 * Estima o Fator de Bioacumulação (BAF) para um nível trófico usando o modelo
 * de magnificação trófica de Gobas (1993).
 *
 * BAF_n = BCF × TMF^(n - 1)
 * where:
 *   n   = trophic level (1 = primary producer, 2 = primary consumer, ...)
 *   TMF = Trophic Magnification Factor (dimensionless, typical range 1–10)
 *   BCF = bioconcentration factor for the chemical
 *
 * @param bcf           Bioconcentration factor (L/kg)
 * @param tmf           Trophic Magnification Factor (dimensionless, > 1 for BMF)
 * @param trophicLevel  Integer trophic level of target organism (≥ 1)
 * @returns BAF (L/kg wet weight)
 *          FAB (L/kg peso úmido)
 * @throws {RangeError} On invalid inputs
 */
export function bioaccumulationFactor(bcf: number, tmf: number, trophicLevel: number): number {
    if (!Number.isFinite(bcf) || bcf <= 0) {
        throw new RangeError('bcf must be a positive finite number');
    }
    if (!Number.isFinite(tmf) || tmf <= 0) {
        throw new RangeError('tmf must be a positive finite number');
    }
    if (!Number.isInteger(trophicLevel) || trophicLevel < 1) {
        throw new RangeError('trophicLevel must be a positive integer');
    }
    return bcf * Math.pow(tmf, trophicLevel - 1);
}

/**
 * Estimate the Trophic Magnification Factor (TMF) from field-measured
 * concentrations and stable nitrogen isotope data (δ¹⁵N).
 * Estima o Fator de Magnificação Trófica (TMF) a partir de concentrações medidas
 * em campo e isótopos estáveis de nitrogênio (δ¹⁵N).
 *
 * Method: ordinary least-squares regression of log₁₀(C) on δ¹⁵N:
 *   log₁₀(C_i) = a + b × δ¹⁵N_i
 *   TMF = 10^(b × 3.4)
 * where 3.4 ‰ is the mean trophic enrichment factor for δ¹⁵N per trophic level
 * (Minagawa & Wada 1984; Post 2002).
 *
 * Reference: Jardine et al. (2006) Environ. Sci. Technol. 40:2167.
 *            DOI: 10.1021/es051793b
 *
 * @param organisms
 *   Array of organisms with δ¹⁵N (‰) and tissue concentration (μg/kg)
 * @returns
 *   tmf: trophic magnification factor
 *   slope/intercept: regression coefficients
 *   r2: coefficient of determination
 * @throws {TypeError}  If organisms is not an array
 * @throws {RangeError} If fewer than 3 organisms or invalid fields
 */
export function trophicMagnificationFactor(
    organisms: Array<{ delta15N: number; concentration: number }>,
): { tmf: number; slope: number; intercept: number; r2: number } {
    if (!Array.isArray(organisms) || organisms.length < 3) {
        throw new RangeError('organisms must be an array with at least 3 elements');
    }

    const n = organisms.length;
    const xs: number[] = [];
    const ys: number[] = [];

    for (let i = 0; i < n; i++) {
        const o = organisms[i]!;
        if (!Number.isFinite(o.delta15N)) {
            throw new RangeError(`organisms[${i}].delta15N must be a finite number`);
        }
        if (!Number.isFinite(o.concentration) || o.concentration <= 0) {
            throw new RangeError(`organisms[${i}].concentration must be a positive finite number`);
        }
        xs.push(o.delta15N);
        ys.push(Math.log10(o.concentration));
    }

    // Regressão OLS: y = a + b·x
    const xMean = xs.reduce((s, v) => s + v, 0) / n;
    const yMean = ys.reduce((s, v) => s + v, 0) / n;
    let sxy = 0;
    let sxx = 0;
    let syy = 0;

    for (let i = 0; i < n; i++) {
        const dx = xs[i]! - xMean;
        const dy = ys[i]! - yMean;
        sxy += dx * dy;
        sxx += dx * dx;
        syy += dy * dy;
    }

    if (sxx === 0) {
        throw new RangeError('All δ¹⁵N values are identical — regression undefined');
    }

    const slope = sxy / sxx;
    const intercept = yMean - slope * xMean;
    const r2 = sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : 0;

    // TMF = 10^(slope × 3.4‰ trophic enrichment)
    const TROPHIC_ENRICHMENT = 3.4;
    const tmf = Math.pow(10, slope * TROPHIC_ENRICHMENT);

    return { tmf, slope, intercept, r2 };
}

/**
 * Estimate human health risk from consumption of biologically contaminated fish.
 * Estima risco à saúde humana pelo consumo de peixes biologicamente contaminados.
 *
 * Based on US EPA (2000) human health water quality criteria methodology:
 *   HQ = (C_water × BAF × IR) / (BW × RfD)
 * where:
 *   C_water = chemical concentration in water (μg/L = mg/m³)
 *   BAF     = bioaccumulation factor for the target trophic level (L/kg)
 *   IR      = fish ingestion rate (kg/day) - EPA default: 0.0175 kg/d (adults)
 *   BW      = body weight (kg) - EPA default: 70 kg
 *   RfD     = oral reference dose (μg/kg/day)
 *
 * @param waterConc_ug_L   Chemical concentration in water (μg/L)
 * @param baf              Bioaccumulation factor (L/kg wet weight)
 * @param rfd_ug_kg_day    Oral reference dose (μg/kg/day)
 * @param ir_kg_day        Fish ingestion rate (kg/day)
 * @param bw_kg            Body weight (kg)
 * @returns
 *   fishConc_ug_kg: predicted concentration in fish tissue (μg/kg)
 *   dailyDose_ug_kgday: estimated daily dose (μg/kg body weight/day)
 *   hazardQuotient: HQ - values > 1 indicate potential concern
 * @throws {RangeError} On non-positive inputs
 */
export function humanHealthRiskFishConsumption(
    waterConc_ug_L: number,
    baf: number,
    rfd_ug_kg_day: number,
    ir_kg_day: number = 0.0175,
    bw_kg: number = 70,
): { fishConc_ug_kg: number; dailyDose_ug_kgday: number; hazardQuotient: number } {
    if (!Number.isFinite(waterConc_ug_L) || waterConc_ug_L < 0) {
        throw new RangeError('waterConc_ug_L must be a non-negative finite number');
    }
    if (!Number.isFinite(baf) || baf <= 0) {
        throw new RangeError('baf must be a positive finite number');
    }
    if (!Number.isFinite(rfd_ug_kg_day) || rfd_ug_kg_day <= 0) {
        throw new RangeError('rfd_ug_kg_day must be a positive finite number');
    }
    if (!Number.isFinite(ir_kg_day) || ir_kg_day <= 0) {
        throw new RangeError('ir_kg_day must be a positive finite number');
    }
    if (!Number.isFinite(bw_kg) || bw_kg <= 0) {
        throw new RangeError('bw_kg must be a positive finite number');
    }

    const fishConc_ug_kg = waterConc_ug_L * baf;
    const dailyDose_ug_kgday = (fishConc_ug_kg * ir_kg_day) / bw_kg;
    const hazardQuotient = dailyDose_ug_kgday / rfd_ug_kg_day;

    return { fishConc_ug_kg, dailyDose_ug_kgday, hazardQuotient };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const bioaccumulationFoodChainMeta: AnalyticsModuleMeta = {
    name: 'bioaccumulationFoodChain',
    description: 'bioaccumulationFoodChain',
    category: 'analytics',
    familyTags: ['bioaccumulation'],
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
