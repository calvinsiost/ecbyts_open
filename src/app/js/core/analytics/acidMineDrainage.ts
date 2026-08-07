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
// Application: EHS & Mining - Acid Mine Drainage (DAM)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Acid Mine Drainage (AMD/DAM) - Geochemical Potential Assessment
 *
 * Módulo puro implementando cálculo de Potencial de Geração de Ácido (AP),
 * Potencial de Neutralização (NP), Potencial Líquido de Neutralização (NNP)
 * e dosagem de calcário para tratamento de drenagem ácida de mineração.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Price, W. A. (1997). DRAFT Guidelines and Recommended Methods for the
 *     Prediction of Metal Leaching and Acid Rock Drainage at Minesites in
 *     British Columbia. MEND Report 1.16.1b. Victoria: BC Ministry of Energy,
 *     Mines and Petroleum Resources. (Critério NNP: -20 / +20 kg CaCO3/t)
 *   - Sobek, A. A., Schuller, W. A., Freeman, J. R. & Smith, R. M. (1978).
 *     Field and Laboratory Methods Applicable to Overburdens and Minesoils.
 *     EPA 600/2-78-054. Cincinnati: US EPA. (Método de pasta + NP por titulação)
 *   - INAP (2014). Global Acid Rock Drainage Guide (GARD Guide). Vancouver:
 *     International Network for Acid Prevention. http://www.gardguide.com/
 *     (Revisão abrangente de metodologias AP/NP/NNP)
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

// ─── Acid Generation Potential ────────────────────────────────────────────────

/**
 * Compute Acid Generation Potential (AP) from sulfur content.
 * Calcula o Potencial de Geração de Ácido (PA) a partir do teor de enxofre.
 *
 * AP (kg H2SO4/t) = 31.25 × S%
 * Derivado de: S → SO4²⁻ → H2SO4 (stoichiometria: MW H2SO4 / MW S × S% / 100 × 1000)
 *
 * @param sulfurContent_pct - Teor de enxofre total na amostra (%), 0–100
 * @param rockMass_t        - Massa de rocha/rejeito avaliada (t), > 0
 * @returns AP por tonelada e AP total
 * @throws {RangeError} Se sulfurContent_pct fora de [0, 100] ou rockMass_t <= 0
 */
export function computeAcidGenerationPotential(
    sulfurContent_pct: number,
    rockMass_t: number,
): { ap_kg_t: number; totalAP_t: number } {
    if (sulfurContent_pct < 0 || sulfurContent_pct > 100) {
        throw new RangeError('sulfurContent_pct must be in [0, 100]');
    }
    if (rockMass_t <= 0) throw new RangeError('rockMass_t must be > 0');

    // AP = 31.25 × S% (Sobek et al. 1978 - estequiometria H2SO4/S)
    const ap_kg_t = 31.25 * sulfurContent_pct;
    const totalAP_t = +((ap_kg_t * rockMass_t) / 1000).toFixed(6); // kg → t

    return { ap_kg_t: +ap_kg_t.toFixed(4), totalAP_t };
}

// ─── Neutralization Potential ─────────────────────────────────────────────────

/**
 * Compute Neutralization Potential (NP) from carbonate content.
 * Calcula o Potencial de Neutralização (PN) a partir do teor de carbonatos.
 *
 * NP (kg CaCO3/t) = 10 × CaCO3%
 * Fator 10: conversão de percentual para kg/t via estequiometria CaCO3 + H2SO4.
 *
 * @param carbonateContent_pct - Teor de CaCO3 equivalente (%), 0–100
 * @returns Potencial de neutralização por tonelada
 * @throws {RangeError} Se carbonateContent_pct fora de [0, 100]
 */
export function computeNeutralizationPotential(carbonateContent_pct: number): { np_kg_t: number } {
    if (carbonateContent_pct < 0 || carbonateContent_pct > 100) {
        throw new RangeError('carbonateContent_pct must be in [0, 100]');
    }

    // NP = 10 × CaCO3% (Sobek et al. 1978)
    const np_kg_t = 10 * carbonateContent_pct;
    return { np_kg_t: +np_kg_t.toFixed(4) };
}

// ─── Net Neutralization Potential ────────────────────────────────────────────

/**
 * Compute Net Neutralization Potential (NNP) and classify AMD risk.
 * Calcula o Potencial Líquido de Neutralização e classifica potencial de DAM.
 *
 * NNP = NP - AP (kg CaCO3/t)
 * Classificação Price (1997):
 *   - NNP < -20  → acid_generating (potencialmente gerador de ácido)
 *   - -20 ≤ NNP ≤ 20 → uncertain (incerto - exige testes cinéticos)
 *   - NNP > 20  → non_acid_generating (não gerador de ácido)
 *
 * @param np - Potencial de Neutralização (kg CaCO3/t)
 * @param ap - Potencial de Geração de Ácido (kg H2SO4/t)
 * @throws {TypeError} Se np ou ap não forem números
 */
export function computeNetNeutralizationPotential(
    np: number,
    ap: number,
): { nnp: number; classification: 'acid_generating' | 'uncertain' | 'non_acid_generating' } {
    if (typeof np !== 'number' || !isFinite(np)) throw new TypeError('np must be a finite number');
    if (typeof ap !== 'number' || !isFinite(ap)) throw new TypeError('ap must be a finite number');

    const nnp = np - ap;

    let classification: 'acid_generating' | 'uncertain' | 'non_acid_generating';
    if (nnp < -20) classification = 'acid_generating';
    else if (nnp > 20) classification = 'non_acid_generating';
    else classification = 'uncertain';

    return { nnp: +nnp.toFixed(4), classification };
}

// ─── ARD Treatment Dose ───────────────────────────────────────────────────────

/**
 * Compute lime (CaCO3) treatment dose required to raise alkalinity to target.
 * Calcula a dosagem de calcário necessária para neutralização da DAM.
 *
 * D = flow × (alkalinity_target - current_alk) × 1e-3 / efficiency
 * efficiency = 0.9 (rendimento típico de calcário agrícola 90%)
 *
 * @param ph                    - pH atual da drenagem (usado para validação)
 * @param flow_m3_day           - Vazão da drenagem ácida (m³/dia), > 0
 * @param alkalinity_target_mg_L - Alcalinidade alvo (mg CaCO3/L), > 0
 * @param currentAlkalinity_mg_L - Alcalinidade atual (mg CaCO3/L), >= 0
 * @returns Dosagem diária e anual
 * @throws {RangeError} Se ph fora de [0,14], flow <= 0, ou target <= 0
 */
export function computeARDTreatmentDose(
    ph: number,
    flow_m3_day: number,
    alkalinity_target_mg_L: number,
    currentAlkalinity_mg_L: number = 0,
): { dose_kg_day: number; lime_tons_year: number } {
    if (ph < 0 || ph > 14) throw new RangeError('ph must be in [0, 14]');
    if (flow_m3_day <= 0) throw new RangeError('flow_m3_day must be > 0');
    if (alkalinity_target_mg_L <= 0) throw new RangeError('alkalinity_target_mg_L must be > 0');
    if (currentAlkalinity_mg_L < 0) throw new RangeError('currentAlkalinity_mg_L must be >= 0');

    // Déficit de alcalinidade a suprir (mg/L)
    const deficit_mg_L = Math.max(0, alkalinity_target_mg_L - currentAlkalinity_mg_L);

    // Dosagem: volume × concentração alvo × conversão L→m³ / eficiência do reagente
    // flow [m³/d] × deficit [mg/L] × 1e-3 [g/mg] × 1e-3 [kg/g] × 1e3 [L/m³] / 0.9
    const dose_kg_day = +((flow_m3_day * deficit_mg_L) / 0.9).toFixed(4);
    const lime_tons_year = +((dose_kg_day * 365) / 1000).toFixed(4);

    return { dose_kg_day, lime_tons_year };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const acidMineDrainageMeta: AnalyticsModuleMeta = {
    name: 'acidMineDrainage',
    description: 'Acid Mine Drainage (DAM)',
    category: 'analytics',
    familyTags: ['mining', 'stormwater'],
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
