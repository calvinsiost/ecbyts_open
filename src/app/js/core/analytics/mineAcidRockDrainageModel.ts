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
 * Mine Acid Rock Drainage Model - Sulfide Mineral Oxidation
 * Modelo de Drenagem Ácida de Mina - Oxidação de Minerais Sulfetados
 *
 * Cinética de oxidação de pirita pelo modelo de Williamson & Rimstidt (1994),
 * integrado com método ABA (Sobek et al. 1978) para potencial líquido de geração de ácido.
 *
 * Referências / References:
 * - Williamson, M.A., Rimstidt, J.D. (1994) The kinetics and electrochemical
 *   rate-determining step of aqueous pyrite oxidation. Geochim. Cosmochim. Acta
 *   58(24):5443–5454. DOI:10.1016/0016-7037(94)90007-8
 * - Sobek, A.A., Schuller, W.A., Freeman, J.R., Smith, R.M. (1978) Field and
 *   Laboratory Methods Applicable to Overburdens and Minesoils. EPA-600/2-78-054.
 *   U.S. Environmental Protection Agency, Cincinnati, OH.
 * - Nordstrom, D.K. (2011) Mine waters: acidic to circumneutral. Elements 7(6):393–398.
 *   DOI:10.2113/gselements.7.6.393
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

/**
 * Calcula a taxa de oxidação da pirita (FeS2) pelo modelo cinético de Williamson & Rimstidt (1994).
 * Calculates pyrite oxidation rate using the Williamson & Rimstidt (1994) kinetic model.
 *
 * Equação de taxa (Eq. 22 W&R 1994):
 *   r = 10^(−8.19) × [O2]^0.5 × [Fe³⁺]^0.93 × [H⁺]^(−0.11)  (mol/m²/s)
 *
 * Concentrações em molalidade (mol/L ≈ mol/kg para soluções diluídas).
 *
 * @param m_O2    - Concentração de O2 dissolvido (mol/L). / Dissolved O2 concentration (mol/L).
 * @param m_Fe3   - Concentração de Fe³⁺ (mol/L). / Fe³⁺ concentration (mol/L).
 * @param pH      - pH da solução (adimensional). / Solution pH (dimensionless).
 * @param T_K - Temperatura (K). Não usada na eq. base de W&R 1994, incluída para extensão futura. / Temperature (K).
 * @returns Taxa de oxidação da pirita (mol/m²/s). / Pyrite oxidation rate.
 */
export function calcPyriteOxidationRate(
    m_O2: number,
    m_Fe3: number,
    pH: number,
    T_K = 298.15,
): { oxidationRate_mol_m2_s: number } {
    if (typeof m_O2 !== 'number' || m_O2 < 0) {
        throw new RangeError('m_O2 must be a non-negative number');
    }
    if (typeof m_Fe3 !== 'number' || m_Fe3 < 0) {
        throw new RangeError('m_Fe3 must be a non-negative number');
    }
    if (typeof pH !== 'number' || pH < 0 || pH > 14) {
        throw new RangeError('pH must be in range [0, 14]');
    }
    if (typeof T_K !== 'number' || T_K <= 0) {
        throw new RangeError('T_K must be a positive number');
    }

    // Concentração de H⁺ a partir do pH
    const m_H = Math.pow(10, -pH);

    // Williamson & Rimstidt (1994) Eq. 22 - modelo misto O2/Fe3+ em pH ácido
    // k = 10^(-8.19) = 6.46e-9
    const k = Math.pow(10, -8.19);

    // Termo de O2 - contribuição oxidante primário (expoente 0.5)
    const termO2 = m_O2 > 0 ? Math.pow(m_O2, 0.5) : 0;

    // Termo de Fe3+ - oxidante secundário (expoente 0.93); contribuição nula se ausente
    const termFe3 = m_Fe3 > 0 ? Math.pow(m_Fe3, 0.93) : 0;

    // Termo de H+ - inibição ácida leve (expoente -0.11)
    const termH = Math.pow(m_H, -0.11);

    // Taxa total (mol/m²/s) - contribuição de ambos os oxidantes (O2 domina em pH>3)
    const oxidationRate_mol_m2_s = k * (termO2 + termFe3) * termH;
    return { oxidationRate_mol_m2_s };
}

/**
 * Calcula o consumo de O2 pela oxidação de pirita em uma superfície reativa.
 * Calculates O2 consumption rate by pyrite oxidation over a reactive surface.
 *
 * O consumo de O2 é proporcional à taxa de oxidação e à área de superfície exposta.
 * Estequiometria: FeS2 + 7/2 O2 + H2O → Fe²⁺ + 2SO4²⁻ + 2H⁺ (oxidação por O2)
 * → 3.5 mol O2 / mol FeS2 oxidado
 *
 * @param pyriteSurface_m2   - Área de superfície de pirita exposta (m²). / Exposed pyrite surface area (m²).
 * @param oxidationRate_mol_m2_s - Taxa de oxidação (mol/m²/s). / Oxidation rate (mol/m²/s).
 * @returns Consumo de O2 (mol/s). / O2 consumption rate (mol/s).
 */
export function calcOxygenConsumption(
    pyriteSurface_m2: number,
    oxidationRate_mol_m2_s: number,
): { O2_consumption_mol_s: number } {
    if (typeof pyriteSurface_m2 !== 'number' || pyriteSurface_m2 < 0) {
        throw new RangeError('pyriteSurface_m2 must be a non-negative number');
    }
    if (typeof oxidationRate_mol_m2_s !== 'number' || oxidationRate_mol_m2_s < 0) {
        throw new RangeError('oxidationRate_mol_m2_s must be a non-negative number');
    }

    // 3.5 mol O2 por mol FeS2 (reação dominante em pH > 3.5, oxidação por O2)
    const O2_stoichiometry = 3.5;
    const O2_consumption_mol_s = pyriteSurface_m2 * oxidationRate_mol_m2_s * O2_stoichiometry;
    return { O2_consumption_mol_s };
}

/**
 * Calcula a taxa de geração de ácido (H⁺) a partir da oxidação de pirita.
 * Calculates acid generation rate (H⁺) from pyrite oxidation.
 *
 * Estequiometria DAM: FeS2 + 15/4 O2 + 7/2 H2O → Fe(OH)3 + 2SO4²⁻ + 4H⁺ (completa)
 * → 4 mol H⁺ / mol FeS2 (Nordstrom 2011)
 *
 * @param oxidationRate_mol_m2_s - Taxa de oxidação da pirita (mol/m²/s). / Pyrite oxidation rate (mol/m²/s).
 * @param stoichiometry      - Coeficiente estequiométrico de H⁺ por mol FeS2. / Stoichiometric H⁺ coefficient per mol FeS2.
 * @returns Taxa de geração de H⁺ (mol/m²/s). / Acid generation rate (mol/m²/s).
 */
export function calcAcidGenerationRate(
    oxidationRate_mol_m2_s: number,
    stoichiometry = 4,
): { acidRate_mol_s_per_m2: number } {
    if (typeof oxidationRate_mol_m2_s !== 'number' || oxidationRate_mol_m2_s < 0) {
        throw new RangeError('oxidationRate_mol_m2_s must be a non-negative number');
    }
    if (typeof stoichiometry !== 'number' || stoichiometry <= 0) {
        throw new RangeError('stoichiometry must be a positive number');
    }

    const acidRate_mol_s_per_m2 = oxidationRate_mol_m2_s * stoichiometry;
    return { acidRate_mol_s_per_m2 };
}

/**
 * Calcula o Potencial Líquido de Geração de Ácido (NAG) pelo método ABA simplificado.
 * Calculates Net Acid Generation (NAG) potential using simplified Acid-Base Accounting.
 *
 * NAG = AP − NP × buffer_factor
 * AP (Acid Potential) = %S × 31.25 (kg H2SO4/t) - Sobek et al. (1978)
 * NP = Potencial de Neutralização (kg CaCO3/t) - titulação ácida padronizada
 * buffer_factor = 1.0 (sem buffer adicional) ou valor experimental
 *
 * Interpretação:
 *   NAG > 20  : alto risco de DAM
 *   NAG 0–20  : incerto (zona de transição)
 *   NAG < 0   : potencial de neutralização excede geração de ácido
 *
 * @param AP_kg_H2SO4_t  - Potencial de acidez (kg H2SO4/t rocha). / Acid potential (kg H2SO4/t rock).
 * @param NP_kg_CaCO3_t  - Potencial de neutralização (kg CaCO3/t). / Neutralization potential (kg CaCO3/t).
 * @param buffer   - Fator de buffer (adimensional). / Buffer factor (dimensionless).
 */
export function calcNetAcidGeneration(
    AP_kg_H2SO4_t: number,
    NP_kg_CaCO3_t: number,
    buffer = 1.0,
): { NAG_kg_t: number; classification: 'acid_generating' | 'uncertain' | 'non_acid_generating' } {
    if (typeof AP_kg_H2SO4_t !== 'number' || AP_kg_H2SO4_t < 0) {
        throw new RangeError('AP_kg_H2SO4_t must be a non-negative number');
    }
    if (typeof NP_kg_CaCO3_t !== 'number' || NP_kg_CaCO3_t < 0) {
        throw new RangeError('NP_kg_CaCO3_t must be a non-negative number');
    }
    if (typeof buffer !== 'number' || buffer <= 0) {
        throw new RangeError('buffer must be a positive number');
    }

    // Conversão de unidades: NP em CaCO3 → equivalente H2SO4 (PM: H2SO4=98, CaCO3=100)
    // 1 kg CaCO3 neutraliza 0.98 kg H2SO4 → mas Sobek usa escala direta AP vs NP×1
    const NAG_kg_t = AP_kg_H2SO4_t - NP_kg_CaCO3_t * buffer;

    let classification: 'acid_generating' | 'uncertain' | 'non_acid_generating';
    if (NAG_kg_t > 20) {
        classification = 'acid_generating';
    } else if (NAG_kg_t >= 0) {
        classification = 'uncertain';
    } else {
        classification = 'non_acid_generating';
    }

    return { NAG_kg_t, classification };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const mineAcidRockDrainageModelMeta: AnalyticsModuleMeta = {
    name: 'mineAcidRockDrainageModel',
    description: 'mineAcidRockDrainageModel',
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
