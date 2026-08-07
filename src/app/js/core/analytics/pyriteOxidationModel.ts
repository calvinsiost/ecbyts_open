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
 * Pyrite Oxidation Model - Acid Mine Drainage (AMD/DAM) generation
 *
 * Academic references:
 * - Singer, P.C. & Stumm, W. (1970). Acid mine drainage: the rate-determining step.
 *   Science, 167(3921), 1121-1123. DOI:10.1126/science.167.3921.1121
 * - Williamson, M.A. & Rimstidt, J.D. (1994). The kinetics and electrochemical
 *   rate-determining step of aqueous pyrite oxidation. Geochimica et Cosmochimica
 *   Acta, 58(24), 5443-5454. DOI:10.1016/0016-7037(94)90241-0
 * - ABNT NBR 13029:2016 - Mineração: elaboração e apresentação de projeto de barragem
 * - INAP (2014). Global Acid Rock Drainage Guide (GARD Guide).
 */

// ─── Constants ───────────────────────────────────────────────────────────────

// Molecular weights (g/mol)
const MW_PYRITE = 119.98; // FeS2
// eslint-disable-next-line
const MW_H2SO4 = 98.079;
// eslint-disable-next-line
const MW_CaCO3 = 100.09;

// Williamson & Rimstidt (1994) rate constants
// Eq: r = k * m(O2)^a * m(Fe3+)^b * m(H+)^c (mol/m²/s)
const WR_K = 10 ** -8.19; // rate constant (mol/m²/s) — pH-independent term
const WR_A = 0.5; // O2 exponent
const WR_B = 0.93; // Fe³⁺ exponent (at pH < ~4)
const WR_C = -0.11; // H⁺ exponent (negative = inverse pH)

// Acid Potential / Neutralization Potential (ABA - Acid-Base Accounting)
const AP_FACTOR = 31.25; // AP (kg CaCO3/t) = %S * 31.25 (INAP GARD Guide §4.2)

// DAM risk classification thresholds (Net Neutralization Potential Ratio)
const NNPR_LOW = 3.0; // NNPR > 3 → non-acid-generating
const NNPR_UNCER = 1.0; // 1 < NNPR ≤ 3 → uncertain
// NNPR ≤ 1 → acid-generating

// ─── Exports ─────────────────────────────────────────────────────────────────

/**
 * Calculates pyrite oxidation rate using Williamson & Rimstidt (1994) kinetics.
 * Taxa de oxidação de pirita por O₂ e Fe³⁺ conforme cinética W&R.
 *
 * @param {object} params - Reaction parameters
 * @param {number} params.o2Molality    - Dissolved O₂ molality (mol/kg), range [0, 0.05]
 * @param {number} params.fe3Molality   - Fe³⁺ molality (mol/kg), range [0, 1]
 * @param {number} params.pH            - Solution pH [0, 14]
 * @param {number} [params.reactiveSurfaceArea=1.0] - Reactive surface area (m²/g pyrite)
 * @returns {{ rateKgPerKgPerDay: number, rateKgPerM2PerDay: number, mechanism: string }}
 */
export function calcPyriteOxidationRate({
    o2Molality,
    fe3Molality,
    pH,
    reactiveSurfaceArea = 1.0,
}: {
    o2Molality: number;
    fe3Molality: number;
    pH: number;
    reactiveSurfaceArea?: number;
}): { rateKgPerKgPerDay: number; rateKgPerM2PerDay: number; mechanism: string } {
    if (typeof o2Molality !== 'number' || o2Molality < 0) throw new RangeError('o2Molality must be >= 0');
    if (typeof fe3Molality !== 'number' || fe3Molality < 0) throw new RangeError('fe3Molality must be >= 0');
    if (typeof pH !== 'number' || pH < 0 || pH > 14) throw new RangeError('pH must be in [0, 14]');
    if (typeof reactiveSurfaceArea !== 'number' || reactiveSurfaceArea <= 0)
        throw new RangeError('reactiveSurfaceArea must be > 0');

    // Concentrações dos oxidantes - evitar log(0)
    const mO2 = Math.max(o2Molality, 1e-20);
    const mFe3 = Math.max(fe3Molality, 1e-20);
    const mH = 10 ** -pH;

    // W&R rate (mol FeS2 / m² / s)
    // Singer & Stumm (1970): Fe³⁺ é o oxidante dominante em pH baixo
    const mechanism = fe3Molality > 0.001 && pH < 4 ? 'Fe3_dominant' : 'O2_dominant';

    let rateMolPerM2PerS;
    if (mechanism === 'Fe3_dominant') {
        // W&R Eq (23): log r = -8.19 + 0.93*log[Fe3+] - 0.11*log[H+]
        rateMolPerM2PerS = WR_K * mFe3 ** WR_B * mH ** WR_C;
    } else {
        // W&R Eq (9): log r = -8.19 + 0.5*log[O2(aq)]
        rateMolPerM2PerS = WR_K * mO2 ** WR_A;
    }

    // Conversão: mol/m²/s → kg FeS2/m²/dia
    const rateKgPerM2PerDay = ((rateMolPerM2PerS * MW_PYRITE) / 1000) * 86400;

    // Conversão por massa de pirita (assumindo RSA em m²/g)
    // kg/m²/dia × m²/g × 1000 g/kg = kg FeS2 oxidado / kg pirita / dia
    const rateKgPerKgPerDay = rateKgPerM2PerDay * reactiveSurfaceArea * 1000;

    return { rateKgPerKgPerDay, rateKgPerM2PerDay, mechanism };
}

/**
 * Calculates Acid Potential (AP) and Net Neutralization Potential (NNP).
 * Potencial de acidez e neutralização líquida - base do ABA (Acid-Base Accounting).
 *
 * @param {object} params
 * @param {number} params.sulfurPercent         - Total sulfur content (% mass)
 * @param {number} params.neutralizationPotential - NP measured (kg CaCO3 eq/t)
 * @returns {{ AP: number, NP: number, NNP: number, NNPR: number, riskClass: string }}
 */
export function calcAcidBasePotential({
    sulfurPercent,
    neutralizationPotential,
}: {
    sulfurPercent: number;
    neutralizationPotential: number;
}): { AP: number; NP: number; NNP: number; NNPR: number } {
    if (typeof sulfurPercent !== 'number' || sulfurPercent < 0 || sulfurPercent > 100)
        throw new RangeError('sulfurPercent must be in [0, 100]');
    if (typeof neutralizationPotential !== 'number' || neutralizationPotential < 0)
        throw new RangeError('neutralizationPotential must be >= 0');

    // AP (kg CaCO3/t) = %S × 31.25 (INAP GARD Guide §4.2)
    const AP = sulfurPercent * AP_FACTOR;
    const NP = neutralizationPotential;

    // NNP = NP - AP; NNPR = NP / AP
    const NNP = NP - AP;
    const NNPR = AP > 0 ? NP / AP : Infinity;

    // Classificação de risco de DAM
    let riskClass;
    if (NNPR > NNPR_LOW) riskClass = 'non_acid_generating';
    else if (NNPR > NNPR_UNCER) riskClass = 'uncertain';
    // eslint-disable-next-line
    else riskClass = 'acid_generating';

    return { AP, NP, NNP, NNPR: isFinite(NNPR) ? NNPR : (null as unknown as number) };
}

/**
 * Estimates equilibrium pH from carbonate neutralization of sulfuric acid.
 * pH de equilíbrio estimado pela neutralização de CaCO3 versus H2SO4 gerado.
 *
 * @param {object} params
 * @param {number} params.h2so4MolPerL   - H2SO4 concentration (mol/L)
 * @param {number} params.caco3MolPerL   - Dissolved CaCO3 available (mol/L)
 * @returns {{ pHEquilibrium: number, neutralized: boolean, residualH2SO4MolPerL: number }}
 */
export function estimateCarbonateNeutralizationPH({
    h2so4MolPerL,
    caco3MolPerL,
}: {
    h2so4MolPerL: number;
    caco3MolPerL: number;
}): { pHEquilibrium: number; neutralized: boolean; residualH2SO4MolPerL: number } {
    if (typeof h2so4MolPerL !== 'number' || h2so4MolPerL < 0) throw new RangeError('h2so4MolPerL must be >= 0');
    if (typeof caco3MolPerL !== 'number' || caco3MolPerL < 0) throw new RangeError('caco3MolPerL must be >= 0');

    // Reação: CaCO3 + H2SO4 → CaSO4 + H2O + CO2
    // Razão molar 1:1 (simplificado)
    const consumed = Math.min(caco3MolPerL, h2so4MolPerL);
    const residualH2SO4MolPerL = Math.max(0, h2so4MolPerL - consumed);
    const neutralized = residualH2SO4MolPerL < 1e-10;

    // pH estimado: H2SO4 totalmente dissociado → [H+] ≈ 2 * residual H2SO4
    let pHEquilibrium;
    if (neutralized) {
        // pH tampão CaCO3 ≈ 6.3–8.3; assumir 7.0 para CaCO3 saturado
        pHEquilibrium = 7.0;
    } else {
        const hConc = 2 * residualH2SO4MolPerL;
        pHEquilibrium = Math.max(0, -Math.log10(hConc));
    }

    return { pHEquilibrium, neutralized, residualH2SO4MolPerL };
}

function validateAMDRiskInputs(NNPR: number, pH: number, sulfatesMgPerL: number): void {
    if (typeof NNPR !== 'number' || NNPR < 0) throw new RangeError('NNPR must be >= 0');
    if (typeof pH !== 'number' || pH < 0 || pH > 14) throw new RangeError('pH must be in [0, 14]');
    if (typeof sulfatesMgPerL !== 'number' || sulfatesMgPerL < 0) throw new RangeError('sulfatesMgPerL must be >= 0');
}

function scoreNNPR(NNPR: number, flags: string[]): number {
    if (NNPR <= 1) {
        flags.push('NNPR_acid_generating');
        return 3;
    }
    if (NNPR <= 3) {
        flags.push('NNPR_uncertain');
        return 1;
    }
    return 0;
}

function scorePH(pH: number, flags: string[]): number {
    if (pH < 4) {
        flags.push('pH_strongly_acidic');
        return 3;
    }
    if (pH < 6) {
        flags.push('pH_acidic');
        return 2;
    }
    if (pH < 6.5) {
        flags.push('pH_slightly_acidic');
        return 1;
    }
    return 0;
}

function scoreSulfates(sulfatesMgPerL: number, flags: string[]): number {
    // CONAMA 430/2011 - limite de sulfatos no efluente: 250 mg/L
    if (sulfatesMgPerL > 1000) {
        flags.push('sulfates_very_high');
        return 2;
    }
    if (sulfatesMgPerL > 250) {
        flags.push('sulfates_above_CONAMA430');
        return 1;
    }
    return 0;
}

function resolveRiskLevel(score: number): string {
    if (score >= 5) return 'critical';
    if (score >= 3) return 'high';
    if (score >= 1) return 'moderate';
    return 'low';
}

/**
 * Classifies AMD risk based on multiple indicators.
 * Classificação integrada de risco de Drenagem Ácida de Minas (DAM).
 *
 * @param {object} params
 * @param {number} params.NNPR       - Net Neutralization Potential Ratio
 * @param {number} params.pH         - Observed leachate/drainage pH
 * @param {number} params.sulfatesMgPerL - Sulfate concentration (mg/L)
 * @returns {{ riskLevel: string, score: number, flags: string[] }}
 */
export function classifyAMDRisk({
    NNPR,
    pH,
    sulfatesMgPerL,
}: {
    NNPR: number;
    pH: number;
    sulfatesMgPerL: number;
}): { riskLevel: string; score: number; flags: string[] } {
    validateAMDRiskInputs(NNPR, pH, sulfatesMgPerL);

    const flags: string[] = [];
    const score = scoreNNPR(NNPR, flags) + scorePH(pH, flags) + scoreSulfates(sulfatesMgPerL, flags);

    return { riskLevel: resolveRiskLevel(score), score, flags };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const pyriteOxidationModelMeta = {
    name: 'pyriteOxidationModel',
    description: 'pyriteOxidationModel',
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
