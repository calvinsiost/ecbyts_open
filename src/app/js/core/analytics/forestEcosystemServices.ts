// @ts-check
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
 * Forest Ecosystem Services - Carbon Storage, Watershed Protection, Air Purification, Integrity
 *
 * Módulo puro para quantificação de serviços ecossistêmicos florestais:
 * estoque de carbono (IPCC Tier 2), valor de proteção hídrica, capacidade de
 * purificação do ar e classificação de integridade ecossistêmica.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - IPCC (2006). Guidelines for National Greenhouse Gas Inventories.
 *     Vol. 4 - Agriculture, Forestry and Other Land Use.
 *     ISBN 9789291691654. (Tier 2 biomass carbon approach)
 *   - Nowak, D. J., et al. (2014). Tree and forest effects on air quality and
 *     human health in the United States. Environmental Pollution, 193, 119–129.
 *     DOI:10.1016/j.envpol.2014.05.028
 *   - Costanza, R., et al. (1997). The value of the world's ecosystem services
 *     and natural capital. Nature, 387, 253–260.
 *     DOI:10.1038/387253a0
 *
 * @module forestEcosystemServices
 */

'use strict';

// Fração de carbono na biomassa seca (IPCC 2006 Tabela 4.3) - valor padrão
const CARBON_FRACTION = 0.5;

/**
 * Compute total carbon storage in forest stand (IPCC 2006 Tier 2).
 * Calcula o estoque total de carbono na floresta pelo método IPCC Tier 2.
 *
 * C_total = biomassa × BEF × (1 + root_shoot) × 0.5
 *
 * Inclui biomassa aérea expandida (BEF) e raízes (razão raiz:parte aérea).
 * O fator 0.5 é a fração de carbono na biomassa seca (IPCC 2006).
 *
 * @param {number} biomass_t_ha - Biomassa aérea em pé (t matéria seca / ha)
 * @param {number} BEF - Fator de expansão de biomassa (adimensional, ≥ 1)
 * @param {number} root_shoot_ratio - Razão raiz/parte aérea (adimensional, ≥ 0)
 * @returns {{ total_C_t_ha: number }} Carbono total (t C / ha)
 * @throws {RangeError} Se biomass ou root_shoot_ratio forem negativos, ou BEF < 1
 *
 * Referência: IPCC (2006) ISBN:9789291691654, Vol. 4, Cap. 4, Eq. 4.1.
 */
export function computeCarbonStorage(biomass_t_ha: any, BEF: any, root_shoot_ratio: any) {
    if (biomass_t_ha < 0) {
        throw new RangeError('computeCarbonStorage: biomass_t_ha deve ser ≥ 0');
    }
    if (BEF < 1) {
        throw new RangeError('computeCarbonStorage: BEF deve ser ≥ 1 (fator de expansão)');
    }
    if (root_shoot_ratio < 0) {
        throw new RangeError('computeCarbonStorage: root_shoot_ratio deve ser ≥ 0');
    }

    // C total = biomassa aérea × BEF × (1 + razão raiz/parte aérea) × fração de carbono
    const total_C_t_ha = biomass_t_ha * BEF * (1 + root_shoot_ratio) * CARBON_FRACTION;

    return { total_C_t_ha };
}

/**
 * Compute annual watershed protection value from forest erosion reduction.
 * Calcula o valor anual de proteção de bacia hidrográfica pela redução de erosão.
 *
 * Proteção de solo: erosão evitada × fração reduzida × valor monetário do solo
 *
 * Estimativa simplificada de USLE (R × K × L × S cancelam na razão relativa).
 * Converte precipitação + redução percentual em massa de solo protegida.
 *
 * @param {number} forest_area_ha - Área florestal na bacia (ha)
 * @param {number} rainfall_mm - Precipitação anual (mm)
 * @param {number} erosion_reduction_pct - Redução de erosão pela floresta (%, 0–100)
 * @param {number} soil_value_BRL_t - Valor do solo protegido (BRL/t de solo)
 * @returns {{ protection_value_BRL_yr: number }}
 * @throws {RangeError} Se erosion_reduction_pct fora de [0, 100] ou parâmetros negativos
 *
 * Referência: Costanza et al. (1997) DOI:10.1038/387253a0 - watershed protection valuation.
 */
export function computeWatershedProtectionValue(forest_area_ha: any, rainfall_mm: any, erosion_reduction_pct: any, soil_value_BRL_t: any) {
    if (forest_area_ha < 0 || rainfall_mm < 0 || soil_value_BRL_t < 0) {
        throw new RangeError('computeWatershedProtectionValue: parâmetros de área, precipitação e valor devem ser ≥ 0');
    }
    if (erosion_reduction_pct < 0 || erosion_reduction_pct > 100) {
        throw new RangeError('computeWatershedProtectionValue: erosion_reduction_pct deve ser 0–100%');
    }

    // Estimativa de erosão em t/ha/ano: fator empírico USLE médio = 0.001 × rainfall (mm)
    // (simplificação dimensional para comparação relativa)
    const erosion_t_ha_yr = (0.001 * rainfall_mm * rainfall_mm) / 100; // erosividade proporcional a R²
    const soil_protected_t_yr = erosion_t_ha_yr * forest_area_ha * (erosion_reduction_pct / 100);

    const protection_value_BRL_yr = soil_protected_t_yr * soil_value_BRL_t;

    return { protection_value_BRL_yr };
}

/**
 * Compute annual air purification capacity of forest (particle removal).
 * Calcula a capacidade anual de purificação do ar pela floresta (remoção de partículas).
 *
 * Remoção = LAI × deposição × 10000 / 1000
 * (conversão: g/m² → kg/ha: × 10000 m²/ha ÷ 1000 g/kg)
 *
 * @param {number} LAI - Índice de área foliar (m² folha / m² solo, adimensional)
 * @param {number} particulate_deposition_g_m2_yr - Taxa de deposição de partículas (g/m²/ano)
 * @returns {{ particles_removed_kg_ha_yr: number }}
 * @throws {RangeError} Se LAI ou deposition forem negativos
 *
 * Referência: Nowak et al. (2014) DOI:10.1016/j.envpol.2014.05.028, Eq. 1.
 */
export function computeAirPurificationCapacity(LAI: any, particulate_deposition_g_m2_yr: any) {
    if (LAI < 0) {
        throw new RangeError('computeAirPurificationCapacity: LAI deve ser ≥ 0');
    }
    if (particulate_deposition_g_m2_yr < 0) {
        throw new RangeError('computeAirPurificationCapacity: particulate_deposition deve ser ≥ 0');
    }

    // Remoção [kg/ha/ano] = LAI × deposição [g/m²] × 10000 [m²/ha] / 1000 [g/kg]
    const particles_removed_kg_ha_yr = (LAI * particulate_deposition_g_m2_yr * 10000) / 1000;

    return { particles_removed_kg_ha_yr };
}

/**
 * Classify forest ecosystem integrity based on composite of three indicators.
 * Classifica a integridade do ecossistema florestal por score composto normalizado.
 *
 * Score composto = média dos três indicadores normalizados [0, 1]:
 *   - Densidade de carbono: ≥ 200 t/ha → 1.0; ≥ 100 → 0.6; ≥ 50 → 0.3; < 50 → 0.0
 *   - Riqueza de espécies: ≥ 100 → 1.0; ≥ 50 → 0.6; ≥ 20 → 0.3; < 20 → 0.0
 *   - Distúrbio (invertido): ≤ 10% → 1.0; ≤ 30% → 0.6; ≤ 60% → 0.3; > 60% → 0.0
 *
 * Limiares: pristine ≥ 0.85, intact ≥ 0.65, recovering ≥ 0.35, degraded < 0.35
 *
 * @param {number} carbon_density_t_ha - Densidade de carbono (t C/ha)
 * @param {number} species_richness - Riqueza de espécies arbóreas (número)
 * @param {number} disturbance_index - Índice de distúrbio (%, 0–100)
 * @returns {{ integrity: 'degraded'|'recovering'|'intact'|'pristine' }}
 * @throws {RangeError} Se carbon_density ou species_richness forem negativos, ou disturbance_index fora de [0, 100]
 *
 * Referência: IPCC (2006) ISBN:9789291691654; Costanza et al. (1997) DOI:10.1038/387253a0.
 */
function _validateForestIntegrityInputs(carbon_density_t_ha: any, species_richness: any, disturbance_index: any): void {
    if (carbon_density_t_ha < 0) {
        throw new RangeError('classifyForestEcosystemIntegrity: carbon_density_t_ha deve ser ≥ 0');
    }
    if (species_richness < 0) {
        throw new RangeError('classifyForestEcosystemIntegrity: species_richness deve ser ≥ 0');
    }
    if (disturbance_index < 0 || disturbance_index > 100) {
        throw new RangeError('classifyForestEcosystemIntegrity: disturbance_index deve ser 0–100%');
    }
}

function _carbonScore(carbon_density_t_ha: number): number {
    if (carbon_density_t_ha >= 200) return 1.0;
    if (carbon_density_t_ha >= 100) return 0.6;
    if (carbon_density_t_ha >= 50) return 0.3;
    return 0.0;
}

function _speciesScore(species_richness: number): number {
    if (species_richness >= 100) return 1.0;
    if (species_richness >= 50) return 0.6;
    if (species_richness >= 20) return 0.3;
    return 0.0;
}

function _disturbanceScore(disturbance_index: number): number {
    if (disturbance_index <= 10) return 1.0;
    if (disturbance_index <= 30) return 0.6;
    if (disturbance_index <= 60) return 0.3;
    return 0.0;
}

function _integrityFromComposite(composite: number): 'degraded' | 'recovering' | 'intact' | 'pristine' {
    if (composite >= 0.85) return 'pristine';
    if (composite >= 0.55) return 'intact';
    if (composite >= 0.25) return 'recovering';
    return 'degraded';
}

export function classifyForestEcosystemIntegrity(carbon_density_t_ha: any, species_richness: any, disturbance_index: any) {
    _validateForestIntegrityInputs(carbon_density_t_ha, species_richness, disturbance_index);

    const carbon_score = _carbonScore(carbon_density_t_ha);
    const species_score = _speciesScore(species_richness);
    const disturbance_score = _disturbanceScore(disturbance_index);

    const composite = (carbon_score + species_score + disturbance_score) / 3;
    const integrity = _integrityFromComposite(composite);

    return { integrity };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const forestEcosystemServicesMeta = {
    name: 'forestEcosystemServices',
    description: 'forestEcosystemServices',
    category: 'analytics',
    familyTags: ['ecosystem', 'forest'],
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
