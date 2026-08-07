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
// Application: EHS & Mining - Industrial Hygiene
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Industrial Hygiene - TWA, Mixture Hazard Index, Skin Absorption, OEL Compliance
 *
 * Módulo puro de higiene industrial e saúde ocupacional: cálculo de média
 * ponderada pelo tempo (TWA), índice de hazard de misturas (ACGIH/NIOSH),
 * dose dérmica por absorção cutânea e classificação de conformidade com
 * limites de exposição ocupacional (OEL).
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - ACGIH (2024). Threshold Limit Values for Chemical Substances and
 *     Physical Agents and Biological Exposure Indices. Cincinnati, OH: ACGIH.
 *     ISBN 978-1-607261-30-8. (TLV-TWA, TLV-STEL, mistura aditiva HI)
 *   - NIOSH (2007). NIOSH Pocket Guide to Chemical Hazards. DHHS (NIOSH)
 *     Publication No. 2005-149. Cincinnati, OH: CDC/NIOSH.
 *     (PEL, REL, estratégia de amostragem)
 *   - ISO 10882-1:2011. Health and Safety in Welding and Allied Processes -
 *     Sampling of Airborne Particles and Gases in the Operator's Breathing Zone.
 *     Geneva: ISO. (metodologia de amostragem e cálculo TWA)
 *   - US EPA (1992). Dermal Exposure Assessment: Principles and Applications.
 *     EPA/600/8-91/011B. Washington, DC: US EPA.
 *     (dose dérmica: D = Cs × Kp × A × t)
 *
 * @module industrialHygiene
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

// Jornada de trabalho padrão ACGIH/OSHA (h)
const STANDARD_WORKDAY_HOURS = 8;

/**
 * Compute Time-Weighted Average (TWA) concentration.
 * Calcula a média ponderada pelo tempo para uma jornada de trabalho de 8 horas.
 *
 * TWA = Σ(Ci × Ti) / 8h
 *
 * @param measurements - Array de concentrações medidas (mg/m³ ou ppm)
 * @param durations - Array de durações correspondentes (horas); soma deve ser ≤ 8
 * @returns TWA em mg/m³ (ou ppm, mesma unidade dos measurements)
 * @throws {TypeError} Se measurements ou durations não forem arrays
 * @throws {RangeError} Se arrays tiverem tamanhos diferentes, forem vazios ou durações > 8h
 *
 * Referência: ACGIH (2024) TLV Documentation, Introduction - TWA calculation.
 */
export function computeTWA(measurements: number[], durations: number[]): number {
    if (!Array.isArray(measurements) || !Array.isArray(durations)) {
        throw new TypeError('computeTWA: measurements and durations must be arrays');
    }
    if (measurements.length === 0 || durations.length === 0) {
        throw new RangeError('computeTWA: arrays must not be empty');
    }
    if (measurements.length !== durations.length) {
        throw new RangeError('computeTWA: measurements and durations must have the same length');
    }
    if (measurements.some((c) => c < 0)) {
        throw new RangeError('computeTWA: concentrations must be non-negative');
    }
    if (durations.some((t) => t <= 0)) {
        throw new RangeError('computeTWA: durations must be positive (hours)');
    }

    const totalHours = durations.reduce((sum, t) => sum + t, 0);
    if (totalHours > STANDARD_WORKDAY_HOURS + 1e-9) {
        throw new RangeError(
            `computeTWA: total exposure duration (${totalHours.toFixed(2)}h) ` +
                `exceeds standard workday of ${STANDARD_WORKDAY_HOURS}h`,
        );
    }

    // TWA = Σ(Ci × Ti) / 8; períodos não amostrados contribuem com 0
    const sumCT = measurements.reduce((sum, c, i) => sum + c * durations[i]!, 0);
    return sumCT / STANDARD_WORKDAY_HOURS;
}

/**
 * Compute Hazard Index (HI) for additive chemical mixture.
 * Calcula o índice de hazard para mistura aditiva de substâncias com efeito similar.
 *
 * HI = Σ(Ci / PEL_i)
 *
 * Aplicável quando as substâncias têm o mesmo órgão-alvo (efeito aditivo).
 *
 * @param components - Array de componentes
 *   concentration: concentração medida no ambiente (mg/m³ ou ppm)
 *   pel: limite de exposição permissível para a substância (mesma unidade)
 * @returns
 * @throws {TypeError} Se components não for array ou elementos faltarem campos
 * @throws {RangeError} Se concentrações negativas ou PEL ≤ 0
 *
 * Referência: ACGIH (2024) TLV Documentation, Mixtures - Additive Effects.
 */
export function computeMixtureHazardIndex(
    components: { concentration: number; pel: number }[],
): { hi: number; riskLevel: 'safe' | 'concern' | 'hazardous' } {
    if (!Array.isArray(components) || components.length === 0) {
        throw new TypeError('computeMixtureHazardIndex: components must be a non-empty array');
    }

    for (let i = 0; i < components.length; i++) {
        const c = components[i]!;
        if (typeof c !== 'object' || c === null || !('concentration' in c) || !('pel' in c)) {
            throw new TypeError(`computeMixtureHazardIndex: component[${i}] must have { concentration, pel }`);
        }
        if (c.concentration < 0) {
            throw new RangeError(`computeMixtureHazardIndex: component[${i}].concentration must be ≥ 0`);
        }
        if (c.pel <= 0) {
            throw new RangeError(`computeMixtureHazardIndex: component[${i}].pel must be > 0`);
        }
    }

    // HI = Σ(Ci / PELi) - índice de hazard aditivo ACGIH
    const hi = components.reduce((sum, c) => sum + c.concentration / c.pel, 0);

    let riskLevel: 'safe' | 'concern' | 'hazardous';
    if (hi < 1) {
        riskLevel = 'safe';
    } else if (hi < 3) {
        riskLevel = 'concern';
    } else {
        riskLevel = 'hazardous';
    }

    return { hi, riskLevel };
}

/**
 * Compute dermal absorption dose.
 * Calcula a dose absorvida através da pele durante exposição ocupacional.
 *
 * D = Cs × Kp × A × t
 *
 * Onde Cs (mg/cm³) = concentration (mg/m³) / 1 000 000 × 1000 = concentration / 1000
 * (conversão de mg/m³ → mg/cm³: dividir por 1e6 para m³→cm³, × 1e6/1e3 → /1000)
 *
 * @param concentration_mg_m3 - Concentração no ar ou solução (mg/m³ equivalente)
 * @param contactArea_cm2 - Área de pele em contato (cm²)
 * @param permeabilityCoeff_cm_h - Coeficiente de permeabilidade cutânea (cm/h)
 * @param exposureHours - Duração da exposição (horas)
 * @returns Dose dérmica absorvida (mg)
 * @throws {RangeError} Se qualquer parâmetro for negativo ou zero onde não permitido
 *
 * Referência: US EPA (1992) Dermal Exposure Assessment, EPA/600/8-91/011B, Eq. 3-1.
 */
export function computeSkinAbsorptionDose(
    concentration_mg_m3: number,
    contactArea_cm2: number,
    permeabilityCoeff_cm_h: number,
    exposureHours: number,
): number {
    if (concentration_mg_m3 < 0 || contactArea_cm2 <= 0 || permeabilityCoeff_cm_h <= 0 || exposureHours <= 0) {
        throw new RangeError('computeSkinAbsorptionDose: concentration≥0, area>0, Kp>0, hours>0');
    }

    // Cs (mg/cm³): conversão de mg/m³ (1 m³ = 1e6 cm³) → mg/cm³
    const cs_mg_cm3 = concentration_mg_m3 / 1e6;

    // D = Cs (mg/cm³) × Kp (cm/h) × A (cm²) × t (h) → mg
    const dose_mg = cs_mg_cm3 * permeabilityCoeff_cm_h * contactArea_cm2 * exposureHours;

    return dose_mg;
}

/**
 * Classify occupational exposure category relative to OEL.
 * Classifica a categoria de exposição ocupacional em relação ao limite (OEL).
 *
 * Critérios ACGIH/NIOSH:
 *   - compliant: TWA ≤ OEL-TWA E (se fornecido) medição curta ≤ OEL-STEL
 *   - action_level: TWA > 0.5 × OEL-TWA (requer monitoramento intensificado)
 *   - non_compliant: TWA > OEL-TWA OU medição curta > OEL-STEL
 *
 * @param twa - TWA medida (mg/m³ ou ppm)
 * @param oelShortTerm - OEL de curto prazo / STEL (mesma unidade), ou null
 * @param oelTWA - OEL de 8h / TLV-TWA (mesma unidade)
 * @returns
 *   ratio: TWA / OEL-TWA (índice de conformidade)
 * @throws {RangeError} Se twa < 0 ou oelTWA ≤ 0
 *
 * Referência: ACGIH (2024) TLV Introduction - Action Level = 0.5 × TLV-TWA.
 */
export function classifyExposureCategory(
    twa: number,
    oelShortTerm: number | null,
    oelTWA: number,
): { category: 'compliant' | 'action_level' | 'non_compliant'; ratio: number } {
    if (twa < 0 || oelTWA <= 0) {
        throw new RangeError('classifyExposureCategory: twa≥0 and oelTWA>0 required');
    }
    if (oelShortTerm !== null && oelShortTerm !== undefined && oelShortTerm <= 0) {
        throw new RangeError('classifyExposureCategory: oelShortTerm must be > 0 or null');
    }

    const ratio = twa / oelTWA;

    // Não-conforme se TWA excede OEL ou STEL excedido (se fornecido)
    if (twa > oelTWA) {
        return { category: 'non_compliant', ratio };
    }

    // Nível de ação: TWA entre 50% e 100% do OEL-TWA
    if (twa > 0.5 * oelTWA) {
        return { category: 'action_level', ratio };
    }

    return { category: 'compliant', ratio };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialHygieneMeta: AnalyticsModuleMeta = {
    name: 'industrialHygiene',
    description: 'Industrial Hygiene',
    category: 'analytics',
    familyTags: ['industrial', 'occupational'],
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
