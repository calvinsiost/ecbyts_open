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
 * @module lifecycleAssessmentModel
 * Modelos de Avaliação do Ciclo de Vida (ACV / LCA) ambiental.
 * Implementa GWP100 (IPCC AR6), demanda cumulativa de energia (CED),
 * depleção de água (WDP) e classificação de impacto.
 *
 * Referências acadêmicas:
 * - IPCC AR6 WGI Chapter 7 Supplementary Material - GWP100 values (2021)
 *   DOI:10.1017/9781009157896
 * - Frischknecht, R. et al. (2015). The ecoinvent database: overview and methodology.
 *   Int J Life Cycle Assess, 10(1), 3–9. DOI:10.1007/BF02978505
 * - ISO 14040:2006 - Gestão ambiental - ACV — Princípios e estrutura
 * - ISO 14044:2006 - Gestão ambiental - ACV — Requisitos e orientações
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

// Fatores GWP100 (kg CO2 equivalente por kg de gás) - IPCC AR6 Tabela 7.SM.7
const GWP_FACTORS: Record<string, number> = {
    CO2: 1,
    CH4: 27.9,
    N2O: 273,
    'HFC-134a': 1526,
    'HFC-32': 771,
    SF6: 25200,
};

// Fatores de energia primária por fonte (MJ primário por MJ final)
const PRIMARY_ENERGY_FACTORS: Record<string, number> = {
    electricity: 2.5,
    natural_gas: 1.13,
    diesel: 1.18,
    renewable: 1.0,
    coal: 1.05,
    biomass: 1.1,
};

/**
 * Calcula o Potencial de Aquecimento Global (GWP100) em kg CO2 equivalente.
 * GWP_total = Σ (mass_kg[i] × GWP_factor[i])
 *
 * @param emissions
 *   Array de emissões. Cada item deve ter `gas` (string) e `mass_kg` (number >= 0).
 *   Gases reconhecidos: CO2, CH4, N2O, HFC-134a, HFC-32, SF6.
 *   Gas desconhecido lança TypeError; mass_kg negativo lança RangeError.
 * @returns Soma ponderada em kg CO2 equivalente
 */
export function computeGlobalWarmingPotential(
    emissions: Array<{ gas: string; mass_kg: number }>,
): { GWP_CO2eq: number } {
    if (!Array.isArray(emissions)) {
        throw new TypeError('computeGlobalWarmingPotential: emissions deve ser um Array');
    }
    let GWP_CO2eq = 0;
    for (const item of emissions) {
        if (typeof item.gas !== 'string') {
            throw new TypeError('computeGlobalWarmingPotential: cada item deve ter propriedade gas (string)');
        }
        if (typeof item.mass_kg !== 'number') {
            throw new TypeError('computeGlobalWarmingPotential: cada item deve ter propriedade mass_kg (number)');
        }
        if (item.mass_kg < 0) {
            throw new RangeError(`computeGlobalWarmingPotential: mass_kg deve ser >= 0, recebido ${item.mass_kg}`);
        }
        if (!(item.gas in GWP_FACTORS)) {
            throw new TypeError(
                `computeGlobalWarmingPotential: gás não reconhecido "${item.gas}". Use: ${Object.keys(GWP_FACTORS).join(', ')}`,
            );
        }
        GWP_CO2eq += item.mass_kg * GWP_FACTORS[item.gas]!;
    }
    return { GWP_CO2eq };
}

/**
 * Calcula a Demanda Cumulativa de Energia (CED) em MJ de energia primária.
 * CED = Σ (energy_MJ[i] × primary_energy_factor[i])
 *
 * @param energy_inputs
 *   Fontes de energia. Cada item deve ter `source` e `energy_MJ` (>= 0).
 *   Fontes suportadas: electricity, natural_gas, diesel, renewable, coal, biomass.
 * @returns Demanda cumulativa de energia (MJ primário)
 */
export function computeCumulativeEnergyDemand(
    energy_inputs: Array<{ source: string; energy_MJ: number }>,
): { CED_MJ: number } {
    if (!Array.isArray(energy_inputs)) {
        throw new TypeError('computeCumulativeEnergyDemand: energy_inputs deve ser um Array');
    }
    let CED_MJ = 0;
    for (const item of energy_inputs) {
        if (typeof item.source !== 'string') {
            throw new TypeError('computeCumulativeEnergyDemand: cada item deve ter propriedade source (string)');
        }
        if (typeof item.energy_MJ !== 'number') {
            throw new TypeError('computeCumulativeEnergyDemand: cada item deve ter propriedade energy_MJ (number)');
        }
        if (item.energy_MJ < 0) {
            throw new RangeError(`computeCumulativeEnergyDemand: energy_MJ deve ser >= 0, recebido ${item.energy_MJ}`);
        }
        if (!(item.source in PRIMARY_ENERGY_FACTORS)) {
            throw new TypeError(
                `computeCumulativeEnergyDemand: fonte não reconhecida "${item.source}". Use: ${Object.keys(PRIMARY_ENERGY_FACTORS).join(', ')}`,
            );
        }
        CED_MJ += item.energy_MJ * PRIMARY_ENERGY_FACTORS[item.source]!;
    }
    return { CED_MJ };
}

/**
 * Calcula o potencial de depleção de água (WDP) em m³ equivalente.
 * WDP = Σ (volume_m3[i] × scarcity_factor[i])
 * O fator de escassez hídrica é fornecido pelo usuário (0.01–100), conforme
 * o método AWARE (Available WAter REmaining, Boulay et al. 2018).
 *
 * @param water_withdrawals
 *   Retiradas de água. Cada item: `region` (string), `volume_m3` (>= 0), `scarcity_factor` (> 0).
 * @returns Depleção de água (m³ equivalente)
 */
export function computeWaterDepletion(
    water_withdrawals: Array<{ region: string; volume_m3: number; scarcity_factor: number }>,
): { WDP_m3_eq: number } {
    if (!Array.isArray(water_withdrawals)) {
        throw new TypeError('computeWaterDepletion: water_withdrawals deve ser um Array');
    }
    let WDP_m3_eq = 0;
    for (const item of water_withdrawals) {
        if (typeof item.region !== 'string') {
            throw new TypeError('computeWaterDepletion: cada item deve ter propriedade region (string)');
        }
        if (typeof item.volume_m3 !== 'number') {
            throw new TypeError('computeWaterDepletion: cada item deve ter propriedade volume_m3 (number)');
        }
        if (typeof item.scarcity_factor !== 'number') {
            throw new TypeError('computeWaterDepletion: cada item deve ter propriedade scarcity_factor (number)');
        }
        if (item.volume_m3 < 0) {
            throw new RangeError(`computeWaterDepletion: volume_m3 deve ser >= 0, recebido ${item.volume_m3}`);
        }
        if (item.scarcity_factor <= 0) {
            throw new RangeError(
                `computeWaterDepletion: scarcity_factor deve ser > 0, recebido ${item.scarcity_factor}`,
            );
        }
        WDP_m3_eq += item.volume_m3 * item.scarcity_factor;
    }
    return { WDP_m3_eq };
}

/**
 * Classifica o nível de impacto de ACV com base em GWP, CED e WDP.
 * Avalia os três indicadores e retorna o pior (abordagem conservadora).
 *
 * Limites por indicador (por unidade funcional):
 *   GWP: >1000 tCO2eq OR CED>10000 GJ OR WDP>100000 m³ eq = critical
 *   GWP: >100 tCO2eq OR CED>1000 GJ OR WDP>10000 m³ eq = high
 *   GWP: >10 tCO2eq OR CED>100 GJ OR WDP>1000 m³ eq = moderate
 *   Demais = low
 *
 * @param GWP    - Potencial de aquecimento global (kg CO2eq)
 * @param CED_MJ - Demanda cumulativa de energia (MJ)
 * @param WDP    - Depleção de água (m³ eq)
 */
export function classifyLCAImpactLevel(
    GWP: number,
    CED_MJ: number,
    WDP: number,
): { impact: 'low' | 'moderate' | 'high' | 'critical' } {
    if (typeof GWP !== 'number' || typeof CED_MJ !== 'number' || typeof WDP !== 'number') {
        throw new TypeError('classifyLCAImpactLevel: todos os parâmetros devem ser números');
    }
    if (GWP < 0) throw new RangeError('classifyLCAImpactLevel: GWP deve ser >= 0');
    if (CED_MJ < 0) throw new RangeError('classifyLCAImpactLevel: CED_MJ deve ser >= 0');
    if (WDP < 0) throw new RangeError('classifyLCAImpactLevel: WDP deve ser >= 0');

    // Converter GWP de kg para toneladas para comparação com limites
    const GWP_t = GWP / 1000;
    // Converter CED de MJ para GJ
    const CED_GJ = CED_MJ / 1000;

    function _level(val: number, t1: number, t2: number, t3: number): number {
        if (val > t3) return 3;
        if (val > t2) return 2;
        if (val > t1) return 1;
        return 0;
    }

    const LABELS = ['low', 'moderate', 'high', 'critical'] as const;
    const gwp_lvl = _level(GWP_t, 10, 100, 1000);
    const ced_lvl = _level(CED_GJ, 100, 1000, 10000);
    const wdp_lvl = _level(WDP, 1000, 10000, 100000);

    const worst = Math.max(gwp_lvl, ced_lvl, wdp_lvl) as 0 | 1 | 2 | 3;
    return { impact: LABELS[worst] };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const lifecycleAssessmentModelMeta: AnalyticsModuleMeta = {
    name: 'lifecycleAssessmentModel',
    description: 'lifecycleAssessmentModel',
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
