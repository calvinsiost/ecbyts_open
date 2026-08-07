// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// app/js/core/sao/params/biota.ts
// SAO PARAMS - Biota/Biodiversity Matrix
// Parametros SAO - Matriz de Biota e Biodiversidade
//
// Variaveis de biodiversidade, estrutura vegetal, fauna, habitats e
// bioindicadores para avaliacao ambiental transversal.
/**
 * Regulatory reference: either a free-form string (e.g. "ABNT NBR 6484")
 * or a structured tuple { agency, standard } used in some SAO datasets.
 */
export type SaoRegulatoryRef = string | { readonly agency: string; readonly standard: string };

/**
 * SAO parameter shape shared across all matrix param files.
 * Local interface to keep this file a self-contained leaf
 * (TS-MIGRATION-001: no cross-leaf re-exports).
 */
export interface SaoParameter {
    readonly id: string;
    readonly name: string;
    readonly names: { readonly en: string; readonly es: string };
    readonly defaultUnitId: string;
    readonly type: string;
    readonly category: string;
    readonly allowedCustomFields: readonly string[];
    readonly sao: {
        readonly matrix: string;
        readonly tier: 'essential' | 'recommended' | 'specialized';
        readonly subcategory: string;
        readonly regulatoryRefs: readonly SaoRegulatoryRef[];
        readonly scenarios: readonly string[];
    };
}

/**
 * Biota/Biodiversity matrix parameters for SAO taxonomy.
 * ~30 parameters covering 9 subcategories.
 *
 * Tiers:
 *   essential    - minimum viable for baseline biota assessment
 *   recommended  — standard practice for detailed studies
 *   specialized  — advanced/emerging techniques
 */
export const BIOTA_PARAMETERS: readonly SaoParameter[] = [
    // ─── vegetation_structure ────────────────────────────────────────
    // Estrutura da vegetacao: medidas basicas de porte e cobertura
    {
        id: 'dap',
        name: 'DAP (Diâmetro à Altura do Peito)',
        names: { en: 'DBH (Diameter at Breast Height)', es: 'DAP (Diámetro a la Altura del Pecho)' },
        defaultUnitId: 'cm',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['species', 'plot_id', 'measurement_height'],
        sao: {
            matrix: 'biota',
            tier: 'essential',
            subcategory: 'vegetation_structure',
            regulatoryRefs: ['IBAMA IN 06/2009', 'CONAMA 423/2010'],
            scenarios: ['tailings_dam', 'deforestation', 'mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'total_height',
        name: 'Altura Total',
        names: { en: 'Total Height', es: 'Altura Total' },
        defaultUnitId: 'm',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['species', 'plot_id', 'measurement_method'],
        sao: {
            matrix: 'biota',
            tier: 'essential',
            subcategory: 'vegetation_structure',
            regulatoryRefs: ['IBAMA IN 06/2009'],
            scenarios: ['tailings_dam', 'deforestation', 'mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'basal_area',
        name: 'Área Basal',
        names: { en: 'Basal Area', es: 'Área Basal' },
        defaultUnitId: 'm2_ha',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['plot_id', 'stratum'],
        sao: {
            matrix: 'biota',
            tier: 'essential',
            subcategory: 'vegetation_structure',
            regulatoryRefs: ['CONAMA 423/2010'],
            scenarios: ['tailings_dam', 'deforestation', 'mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'vegetation_density',
        name: 'Densidade de Vegetação',
        names: { en: 'Vegetation Density', es: 'Densidad de Vegetación' },
        defaultUnitId: 'ind_ha',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['plot_id', 'stratum', 'dbh_threshold'],
        sao: {
            matrix: 'biota',
            tier: 'essential',
            subcategory: 'vegetation_structure',
            regulatoryRefs: ['IBAMA IN 06/2009'],
            scenarios: ['tailings_dam', 'deforestation', 'mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'vegetation_cover',
        name: 'Cobertura Vegetal',
        names: { en: 'Vegetation Cover', es: 'Cobertura Vegetal' },
        defaultUnitId: 'percent',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['method', 'stratum'],
        sao: {
            matrix: 'biota',
            tier: 'essential',
            subcategory: 'vegetation_structure',
            regulatoryRefs: ['CONAMA 423/2010', 'Lei 12.651/2012'],
            scenarios: ['tailings_dam', 'deforestation', 'mining_operations', 'routine_monitoring'],
        },
    },
    // ─── phytosociology ─────────────────────────────────────────────
    // Fitossociologia: diversidade e estrutura da comunidade vegetal
    {
        id: 'species_richness',
        name: 'Riqueza de Espécies',
        names: { en: 'Species Richness', es: 'Riqueza de Especies' },
        defaultUnitId: 'count',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['taxon_group', 'plot_id', 'area_sampled'],
        sao: {
            matrix: 'biota',
            tier: 'essential',
            subcategory: 'phytosociology',
            regulatoryRefs: ['IBAMA IN 06/2009', 'CBD Aichi Targets'],
            scenarios: ['tailings_dam', 'oil_spill', 'deforestation', 'mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'abundance',
        name: 'Abundância',
        names: { en: 'Abundance', es: 'Abundancia' },
        defaultUnitId: 'count',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['taxon_group', 'plot_id', 'area_sampled'],
        sao: {
            matrix: 'biota',
            tier: 'recommended',
            subcategory: 'phytosociology',
            regulatoryRefs: ['IBAMA IN 06/2009'],
            scenarios: ['tailings_dam', 'deforestation', 'mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'shannon_h',
        name: "Índice de Shannon-Wiener (H')",
        names: { en: "Shannon-Wiener Index (H')", es: "Índice de Shannon-Wiener (H')" },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['log_base', 'taxon_group'],
        sao: {
            matrix: 'biota',
            tier: 'essential',
            subcategory: 'phytosociology',
            regulatoryRefs: ['IBAMA IN 06/2009', 'ISO 19580'],
            scenarios: ['tailings_dam', 'oil_spill', 'deforestation', 'mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'pielou_j',
        name: 'Equabilidade de Pielou (J)',
        names: { en: 'Pielou Evenness (J)', es: 'Equitatividad de Pielou (J)' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['taxon_group'],
        sao: {
            matrix: 'biota',
            tier: 'essential',
            subcategory: 'phytosociology',
            regulatoryRefs: ['IBAMA IN 06/2009'],
            scenarios: ['tailings_dam', 'deforestation', 'mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'simpson_index',
        name: 'Índice de Simpson (1-D)',
        names: { en: 'Simpson Index (1-D)', es: 'Índice de Simpson (1-D)' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['taxon_group'],
        sao: {
            matrix: 'biota',
            tier: 'recommended',
            subcategory: 'phytosociology',
            regulatoryRefs: [],
            scenarios: ['deforestation', 'mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'rarefaction',
        name: 'Rarefação de Espécies',
        names: { en: 'Species Rarefaction', es: 'Rarefacción de Especies' },
        defaultUnitId: 'count',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['sample_size', 'taxon_group'],
        sao: {
            matrix: 'biota',
            tier: 'recommended',
            subcategory: 'phytosociology',
            regulatoryRefs: [],
            scenarios: ['deforestation', 'mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'beta_diversity',
        name: 'Diversidade Beta',
        names: { en: 'Beta Diversity', es: 'Diversidad Beta' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['dissimilarity_index', 'taxon_group'],
        sao: {
            matrix: 'biota',
            tier: 'recommended',
            subcategory: 'phytosociology',
            regulatoryRefs: [],
            scenarios: ['deforestation', 'mining_operations'],
        },
    },
    {
        id: 'functional_diversity',
        name: 'Diversidade Funcional',
        names: { en: 'Functional Diversity', es: 'Diversidad Funcional' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['traits_used', 'taxon_group'],
        sao: {
            matrix: 'biota',
            tier: 'recommended',
            subcategory: 'phytosociology',
            regulatoryRefs: [],
            scenarios: ['deforestation', 'mining_operations'],
        },
    },
    // ─── fauna_survey ───────────────────────────────────────────────
    // Levantamento faunistico: riqueza, abundancia e conservacao
    {
        id: 'fauna_richness',
        name: 'Riqueza Faunística',
        names: { en: 'Fauna Richness', es: 'Riqueza Faunística' },
        defaultUnitId: 'count',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['taxon_group', 'method', 'effort'],
        sao: {
            matrix: 'biota',
            tier: 'essential',
            subcategory: 'fauna_survey',
            regulatoryRefs: ['IBAMA IN 13/2013', 'CONAMA 01/1986'],
            scenarios: ['tailings_dam', 'oil_spill', 'deforestation', 'mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'fauna_abundance',
        name: 'Abundância Faunística',
        names: { en: 'Fauna Abundance', es: 'Abundancia Faunística' },
        defaultUnitId: 'count',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['taxon_group', 'method', 'effort'],
        sao: {
            matrix: 'biota',
            tier: 'essential',
            subcategory: 'fauna_survey',
            regulatoryRefs: ['IBAMA IN 13/2013'],
            scenarios: ['tailings_dam', 'oil_spill', 'deforestation', 'mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'endangered_species',
        name: 'Espécies Ameaçadas',
        names: { en: 'Endangered Species', es: 'Especies Amenazadas' },
        defaultUnitId: 'count',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['red_list_category', 'taxon_group'],
        sao: {
            matrix: 'biota',
            tier: 'essential',
            subcategory: 'fauna_survey',
            regulatoryRefs: ['MMA Portaria 148/2022', 'IUCN Red List', 'CITES'],
            scenarios: ['tailings_dam', 'oil_spill', 'deforestation', 'mining_operations', 'routine_monitoring'],
        },
    },
    // ─── dendrometry ────────────────────────────────────────────────
    // Dendrometria: volumetria, biomassa e crescimento florestal
    {
        id: 'crown_diameter',
        name: 'Diâmetro de Copa',
        names: { en: 'Crown Diameter', es: 'Diámetro de Copa' },
        defaultUnitId: 'm',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['species', 'plot_id'],
        sao: {
            matrix: 'biota',
            tier: 'recommended',
            subcategory: 'dendrometry',
            regulatoryRefs: [],
            scenarios: ['deforestation', 'mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'aboveground_biomass',
        name: 'Biomassa Acima do Solo (AGB)',
        names: { en: 'Aboveground Biomass (AGB)', es: 'Biomasa Aérea (AGB)' },
        defaultUnitId: 'tC_ha',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['allometric_equation', 'species', 'plot_id'],
        sao: {
            matrix: 'biota',
            tier: 'recommended',
            subcategory: 'dendrometry',
            regulatoryRefs: ['IPCC Guidelines', 'REDD+ MRV'],
            scenarios: ['deforestation', 'mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'necromass',
        name: 'Necromassa',
        names: { en: 'Necromass', es: 'Necromasa' },
        defaultUnitId: 'tC_ha',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['decomposition_class', 'plot_id'],
        sao: {
            matrix: 'biota',
            tier: 'recommended',
            subcategory: 'dendrometry',
            regulatoryRefs: ['IPCC Guidelines'],
            scenarios: ['deforestation', 'mining_operations'],
        },
    },
    // ─── fauna_methods ──────────────────────────────────────────────
    // Metodos faunisticos: indices de captura, condicao e bioindicadores
    {
        id: 'cpue',
        name: 'CPUE (Captura por Unidade de Esforço)',
        names: { en: 'CPUE (Catch Per Unit Effort)', es: 'CPUE (Captura por Unidad de Esfuerzo)' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['gear_type', 'effort_unit', 'taxon_group'],
        sao: {
            matrix: 'biota',
            tier: 'recommended',
            subcategory: 'fauna_methods',
            regulatoryRefs: ['IBAMA IN 13/2013'],
            scenarios: ['oil_spill', 'mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'fulton_k',
        name: 'Fator de Condição de Fulton (K)',
        names: { en: 'Fulton Condition Factor (K)', es: 'Factor de Condición de Fulton (K)' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['species', 'length_unit', 'weight_unit'],
        sao: {
            matrix: 'biota',
            tier: 'recommended',
            subcategory: 'fauna_methods',
            regulatoryRefs: [],
            scenarios: ['oil_spill', 'mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'bioaccumulation_tissue',
        name: 'Bioacumulação em Tecido',
        names: { en: 'Tissue Bioaccumulation', es: 'Bioacumulación en Tejido' },
        defaultUnitId: 'mg_L_lethal',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['tissue_type', 'species', 'analyte', 'detection_limit'],
        sao: {
            matrix: 'biota',
            tier: 'recommended',
            subcategory: 'fauna_methods',
            regulatoryRefs: ['CONAMA 357/2005', 'USEPA 823-B-00-007'],
            scenarios: ['tailings_dam', 'oil_spill', 'mining_operations'],
        },
    },
    {
        id: 'bmwp',
        name: 'BMWP (Biological Monitoring Working Party)',
        names: { en: 'BMWP (Biological Monitoring Working Party)', es: 'BMWP (Biological Monitoring Working Party)' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['adaptation', 'habitat_type'],
        sao: {
            matrix: 'biota',
            tier: 'recommended',
            subcategory: 'fauna_methods',
            regulatoryRefs: ['CETESB L5.309'],
            scenarios: ['tailings_dam', 'oil_spill', 'mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'ept_index',
        name: 'Índice EPT (Ephemeroptera, Plecoptera, Trichoptera)',
        names: {
            en: 'EPT Index (Ephemeroptera, Plecoptera, Trichoptera)',
            es: 'Índice EPT (Ephemeroptera, Plecoptera, Trichoptera)',
        },
        defaultUnitId: 'percent',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['habitat_type'],
        sao: {
            matrix: 'biota',
            tier: 'recommended',
            subcategory: 'fauna_methods',
            regulatoryRefs: ['CETESB L5.309'],
            scenarios: ['tailings_dam', 'mining_operations', 'routine_monitoring'],
        },
    },
    // ─── plant_physiology ───────────────────────────────────────────
    // Fisiologia vegetal: estresse hidrico, fotossintese e nutricao foliar
    {
        id: 'chlorophyll_fvfm',
        name: 'Fluorescência da Clorofila (Fv/Fm)',
        names: { en: 'Chlorophyll Fluorescence (Fv/Fm)', es: 'Fluorescencia de la Clorofila (Fv/Fm)' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['species', 'dark_adaptation_min'],
        sao: {
            matrix: 'biota',
            tier: 'recommended',
            subcategory: 'plant_physiology',
            regulatoryRefs: [],
            scenarios: ['tailings_dam', 'oil_spill', 'mining_operations'],
        },
    },
    {
        id: 'foliar_nutrients',
        name: 'Nutrientes Foliares',
        names: { en: 'Foliar Nutrients', es: 'Nutrientes Foliares' },
        defaultUnitId: 'mg_L',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['species', 'element', 'tissue_age'],
        sao: {
            matrix: 'biota',
            tier: 'recommended',
            subcategory: 'plant_physiology',
            regulatoryRefs: [],
            scenarios: ['tailings_dam', 'mining_operations', 'routine_monitoring'],
        },
    },
    // ─── remote_sensing_bio ─────────────────────────────────────────
    // Sensoriamento remoto biologico: indices espectrais de vegetacao
    {
        id: 'ndvi',
        name: 'NDVI (Índice de Vegetação por Diferença Normalizada)',
        names: {
            en: 'NDVI (Normalized Difference Vegetation Index)',
            es: 'NDVI (Índice de Vegetación de Diferencia Normalizada)',
        },
        defaultUnitId: 'ndvi',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['sensor', 'acquisition_date', 'spatial_resolution'],
        sao: {
            matrix: 'biota',
            tier: 'essential',
            subcategory: 'remote_sensing_bio',
            regulatoryRefs: ['INPE PRODES', 'MapBiomas'],
            scenarios: ['tailings_dam', 'oil_spill', 'deforestation', 'mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'evi',
        name: 'EVI (Índice de Vegetação Melhorado)',
        names: { en: 'EVI (Enhanced Vegetation Index)', es: 'EVI (Índice de Vegetación Mejorado)' },
        defaultUnitId: 'ndvi',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['sensor', 'acquisition_date', 'spatial_resolution'],
        sao: {
            matrix: 'biota',
            tier: 'recommended',
            subcategory: 'remote_sensing_bio',
            regulatoryRefs: ['MODIS Products'],
            scenarios: ['deforestation', 'mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'savi',
        name: 'SAVI (Índice de Vegetação Ajustado ao Solo)',
        names: { en: 'SAVI (Soil-Adjusted Vegetation Index)', es: 'SAVI (Índice de Vegetación Ajustado al Suelo)' },
        defaultUnitId: 'ndvi',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['sensor', 'L_factor', 'spatial_resolution'],
        sao: {
            matrix: 'biota',
            tier: 'recommended',
            subcategory: 'remote_sensing_bio',
            regulatoryRefs: [],
            scenarios: ['deforestation', 'mining_operations'],
        },
    },
    {
        id: 'lai',
        name: 'LAI (Índice de Área Foliar)',
        names: { en: 'LAI (Leaf Area Index)', es: 'LAI (Índice de Área Foliar)' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['sensor', 'method', 'spatial_resolution'],
        sao: {
            matrix: 'biota',
            tier: 'recommended',
            subcategory: 'remote_sensing_bio',
            regulatoryRefs: ['MODIS MOD15A2H'],
            scenarios: ['deforestation', 'mining_operations', 'routine_monitoring'],
        },
    },
    // ─── ecosystem_services ─────────────────────────────────────────
    // Servicos ecossistemicos: carbono, interceptacao e protecao do solo
    {
        id: 'carbon_stock',
        name: 'Estoque de Carbono',
        names: { en: 'Carbon Stock', es: 'Stock de Carbono' },
        defaultUnitId: 'tC_ha',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['pool', 'method'],
        sao: {
            matrix: 'biota',
            tier: 'recommended',
            subcategory: 'ecosystem_services',
            regulatoryRefs: ['IPCC Guidelines', 'REDD+ MRV', 'UNFCCC NDC'],
            scenarios: ['deforestation', 'mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'carbon_sequestration',
        name: 'Sequestro de Carbono',
        names: { en: 'Carbon Sequestration', es: 'Secuestro de Carbono' },
        defaultUnitId: 'tC_ha_yr',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['pool', 'method', 'period_years'],
        sao: {
            matrix: 'biota',
            tier: 'recommended',
            subcategory: 'ecosystem_services',
            regulatoryRefs: ['IPCC Guidelines', 'REDD+ MRV'],
            scenarios: ['deforestation', 'mining_operations', 'routine_monitoring'],
        },
    },
    // ─── molecular_bio ──────────────────────────────────────────────
    // Biologia molecular e acustica: tecnicas avancadas de deteccao
    {
        id: 'edna',
        name: 'DNA Ambiental (eDNA)',
        names: { en: 'Environmental DNA (eDNA)', es: 'ADN Ambiental (eDNA)' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['primer', 'target_taxon', 'filter_volume_L'],
        sao: {
            matrix: 'biota',
            tier: 'specialized',
            subcategory: 'molecular_bio',
            regulatoryRefs: [],
            scenarios: ['oil_spill', 'deforestation', 'mining_operations'],
        },
    },
    {
        id: 'metabarcoding',
        name: 'Metabarcoding',
        names: { en: 'Metabarcoding', es: 'Metabarcoding' },
        defaultUnitId: 'count',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['marker_gene', 'platform', 'reads_count'],
        sao: {
            matrix: 'biota',
            tier: 'specialized',
            subcategory: 'molecular_bio',
            regulatoryRefs: [],
            scenarios: ['oil_spill', 'deforestation', 'mining_operations'],
        },
    },
    {
        id: 'acoustic_index',
        name: 'Índices Acústicos (ACI/ADI/NDSI)',
        names: { en: 'Acoustic Indices (ACI/ADI/NDSI)', es: 'Índices Acústicos (ACI/ADI/NDSI)' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: ['index_type', 'recorder_model', 'frequency_range'],
        sao: {
            matrix: 'biota',
            tier: 'specialized',
            subcategory: 'molecular_bio',
            regulatoryRefs: [],
            scenarios: ['deforestation', 'mining_operations', 'routine_monitoring'],
        },
    },
];
