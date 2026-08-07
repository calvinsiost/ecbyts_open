// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// app/js/core/sao/params/resiliencia.ts
// SAO PARAMS - Resilience/Governance Matrix
// Parametros SAO - Matriz de Resiliencia e Governanca
//
// Variaveis de governanca, licenciamento, contingencia, risco social e
// resiliencia para avaliacao ambiental transversal.
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
 * Resilience/Governance matrix parameters.
 */
export const RESILIENCIA_PARAMETERS: readonly SaoParameter[] = [
    // ─── 🔴 ESSENTIAL ───────────────────────────────────────────
    {
        id: 'gov_licensing',
        name: 'Licenciamento Ambiental (LP/LI/LO)',
        names: { en: 'Environmental Licensing (LP/LI/LO)', es: 'Licenciamiento Ambiental (LP/LI/LO)' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'emission',
        allowedCustomFields: [],
        sao: {
            matrix: 'resiliencia',
            tier: 'essential',
            subcategory: 'compliance',
            regulatoryRefs: [],
            scenarios: ['tailings_dam', 'mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'gov_eia_rima',
        name: 'EIA/RIMA — Condicionantes',
        names: { en: 'EIA/RIMA — Conditions', es: 'EIA/RIMA — Condicionantes' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'emission',
        allowedCustomFields: [],
        sao: {
            matrix: 'resiliencia',
            tier: 'essential',
            subcategory: 'compliance',
            regulatoryRefs: [],
            scenarios: ['tailings_dam', 'mining_operations', 'deforestation'],
        },
    },
    {
        id: 'gov_gri_303',
        name: 'GRI 303 — Água e Efluentes',
        names: { en: 'GRI 303 — Water and Effluents', es: 'GRI 303 — Agua y Efluentes' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'emission',
        allowedCustomFields: [],
        sao: {
            matrix: 'resiliencia',
            tier: 'essential',
            subcategory: 'gri_standards',
            regulatoryRefs: [],
            scenarios: ['tailings_dam', 'mining_operations', 'oil_spill', 'routine_monitoring'],
        },
    },
    {
        id: 'gov_gri_304',
        name: 'GRI 304 — Biodiversidade',
        names: { en: 'GRI 304 — Biodiversity', es: 'GRI 304 — Biodiversidad' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'emission',
        allowedCustomFields: [],
        sao: {
            matrix: 'resiliencia',
            tier: 'essential',
            subcategory: 'gri_standards',
            regulatoryRefs: [],
            scenarios: ['deforestation', 'tailings_dam', 'mining_operations'],
        },
    },
    {
        id: 'gov_gri_305',
        name: 'GRI 305 — Emissões',
        names: { en: 'GRI 305 — Emissions', es: 'GRI 305 — Emisiones' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'emission',
        allowedCustomFields: [],
        sao: {
            matrix: 'resiliencia',
            tier: 'essential',
            subcategory: 'gri_standards',
            regulatoryRefs: [],
            scenarios: ['chemical_accident', 'mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'gov_gri_306',
        name: 'GRI 306 — Resíduos',
        names: { en: 'GRI 306 — Waste', es: 'GRI 306 — Residuos' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'emission',
        allowedCustomFields: [],
        sao: {
            matrix: 'resiliencia',
            tier: 'essential',
            subcategory: 'gri_standards',
            regulatoryRefs: [],
            scenarios: ['mining_operations', 'chemical_accident', 'routine_monitoring'],
        },
    },
    {
        id: 'gov_gri_403',
        name: 'GRI 403 — Saúde e Segurança Ocupacional',
        names: { en: 'GRI 403 — Occupational Health and Safety', es: 'GRI 403 — Salud y Seguridad Ocupacional' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'emission',
        allowedCustomFields: [],
        sao: {
            matrix: 'resiliencia',
            tier: 'essential',
            subcategory: 'gri_standards',
            regulatoryRefs: [],
            scenarios: ['chemical_accident', 'mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'gov_ghg_scope1',
        name: 'GEE Escopo 1 — Emissões Diretas',
        names: { en: 'GHG Scope 1 — Direct Emissions', es: 'GEI Alcance 1 — Emisiones Directas' },
        defaultUnitId: 'tCO2e',
        type: 'SI',
        category: 'emission',
        allowedCustomFields: [],
        sao: {
            matrix: 'resiliencia',
            tier: 'essential',
            subcategory: 'ghg',
            regulatoryRefs: [],
            scenarios: ['mining_operations', 'chemical_accident', 'routine_monitoring'],
        },
    },
    {
        id: 'gov_ghg_scope2',
        name: 'GEE Escopo 2 — Energia',
        names: { en: 'GHG Scope 2 — Energy', es: 'GEI Alcance 2 — Energía' },
        defaultUnitId: 'tCO2e',
        type: 'SI',
        category: 'emission',
        allowedCustomFields: [],
        sao: {
            matrix: 'resiliencia',
            tier: 'essential',
            subcategory: 'ghg',
            regulatoryRefs: [],
            scenarios: ['mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'gov_waste_total',
        name: 'Geração Total de Resíduos',
        names: { en: 'Total Waste Generation', es: 'Generación Total de Residuos' },
        defaultUnitId: 'tCO2e',
        type: 'SI',
        category: 'waste',
        allowedCustomFields: [],
        sao: {
            matrix: 'resiliencia',
            tier: 'essential',
            subcategory: 'waste_gov',
            regulatoryRefs: [],
            scenarios: ['mining_operations', 'chemical_accident', 'routine_monitoring'],
        },
    },
    {
        id: 'gov_waste_hazardous',
        name: 'Resíduos Perigosos (Classe I)',
        names: { en: 'Hazardous Waste (Class I)', es: 'Residuos Peligrosos (Clase I)' },
        defaultUnitId: 'tCO2e',
        type: 'SI',
        category: 'waste',
        allowedCustomFields: [],
        sao: {
            matrix: 'resiliencia',
            tier: 'essential',
            subcategory: 'waste_gov',
            regulatoryRefs: [{ agency: 'ABNT', standard: 'NBR 10004' }],
            scenarios: ['mining_operations', 'chemical_accident', 'routine_monitoring'],
        },
    },
    {
        id: 'gov_recycling_rate',
        name: 'Taxa de Reciclagem',
        names: { en: 'Recycling Rate', es: 'Tasa de Reciclaje' },
        defaultUnitId: 'percent',
        type: 'SI',
        category: 'waste',
        allowedCustomFields: [],
        sao: {
            matrix: 'resiliencia',
            tier: 'essential',
            subcategory: 'waste_gov',
            regulatoryRefs: [],
            scenarios: ['mining_operations', 'routine_monitoring'],
        },
    },
    // ─── 🟡 RECOMMENDED ─────────────────────────────────────────
    {
        id: 'gov_iso14001',
        name: 'ISO 14001 — SGA',
        names: { en: 'ISO 14001 — EMS', es: 'ISO 14001 — SGA' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'emission',
        allowedCustomFields: [],
        sao: {
            matrix: 'resiliencia',
            tier: 'recommended',
            subcategory: 'compliance',
            regulatoryRefs: [],
            scenarios: ['mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'gov_iso45001',
        name: 'ISO 45001 — SSO',
        names: { en: 'ISO 45001 — OHS', es: 'ISO 45001 — SSO' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'resiliencia',
            tier: 'recommended',
            subcategory: 'compliance',
            regulatoryRefs: [],
            scenarios: ['mining_operations', 'chemical_accident', 'routine_monitoring'],
        },
    },
    {
        id: 'gov_ghg_scope3',
        name: 'GEE Escopo 3 — Cadeia de Valor',
        names: { en: 'GHG Scope 3 — Value Chain', es: 'GEI Alcance 3 — Cadena de Valor' },
        defaultUnitId: 'tCO2e',
        type: 'SI',
        category: 'emission',
        allowedCustomFields: [],
        sao: {
            matrix: 'resiliencia',
            tier: 'recommended',
            subcategory: 'ghg',
            regulatoryRefs: [],
            scenarios: ['mining_operations'],
        },
    },
    {
        id: 'gov_carbon_footprint',
        name: 'Pegada de Carbono (ACV)',
        names: { en: 'Carbon Footprint (LCA)', es: 'Huella de Carbono (ACV)' },
        defaultUnitId: 'tCO2e',
        type: 'SI',
        category: 'emission',
        allowedCustomFields: [],
        sao: {
            matrix: 'resiliencia',
            tier: 'recommended',
            subcategory: 'lca',
            regulatoryRefs: [{ agency: 'ISO', standard: '14040/14044' }],
            scenarios: ['mining_operations'],
        },
    },
    {
        id: 'gov_water_footprint',
        name: 'Pegada Hídrica',
        names: { en: 'Water Footprint', es: 'Huella Hídrica' },
        defaultUnitId: 'm3',
        type: 'SI',
        category: 'emission',
        allowedCustomFields: [],
        sao: {
            matrix: 'resiliencia',
            tier: 'recommended',
            subcategory: 'lca',
            regulatoryRefs: [],
            scenarios: ['mining_operations', 'tailings_dam'],
        },
    },
    {
        id: 'gov_ecosystem_services',
        name: 'Serviços Ecossistêmicos — Valoração',
        names: { en: 'Ecosystem Services — Valuation', es: 'Servicios Ecosistémicos — Valoración' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: [],
        sao: {
            matrix: 'resiliencia',
            tier: 'recommended',
            subcategory: 'lca',
            regulatoryRefs: [],
            scenarios: ['deforestation', 'tailings_dam'],
        },
    },
    {
        id: 'gov_dual_materiality',
        name: 'Dupla Materialidade (ESRS/CSRD)',
        names: { en: 'Double Materiality (ESRS/CSRD)', es: 'Doble Materialidad (ESRS/CSRD)' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'emission',
        allowedCustomFields: [],
        sao: {
            matrix: 'resiliencia',
            tier: 'recommended',
            subcategory: 'gri_standards',
            regulatoryRefs: [],
            scenarios: ['mining_operations', 'routine_monitoring'],
        },
    },
    // ─── 🟢 SPECIALIZED ─────────────────────────────────────────
    {
        id: 'gov_resilience_time',
        name: 'Tempo de Recuperação Ecológica (t_rec)',
        names: { en: 'Ecological Recovery Time (t_rec)', es: 'Tiempo de Recuperación Ecológica (t_rec)' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: [],
        sao: {
            matrix: 'resiliencia',
            tier: 'specialized',
            subcategory: 'ecological_resilience',
            regulatoryRefs: [],
            scenarios: ['tailings_dam', 'oil_spill', 'deforestation'],
        },
    },
    {
        id: 'gov_ews',
        name: 'Early Warning Signals (Variância, Autocorrelação)',
        names: {
            en: 'Early Warning Signals (Variance, Autocorrelation)',
            es: 'Señales de Alerta Temprana (Varianza, Autocorrelación)',
        },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: [],
        sao: {
            matrix: 'resiliencia',
            tier: 'specialized',
            subcategory: 'ecological_resilience',
            regulatoryRefs: [],
            scenarios: ['tailings_dam', 'deforestation'],
        },
    },
    {
        id: 'gov_connectivity',
        name: 'Conectividade Ecológica (Teoria de Grafos)',
        names: { en: 'Ecological Connectivity (Graph Theory)', es: 'Conectividad Ecológica (Teoría de Grafos)' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: [],
        sao: {
            matrix: 'resiliencia',
            tier: 'specialized',
            subcategory: 'ecological_resilience',
            regulatoryRefs: [],
            scenarios: ['deforestation'],
        },
    },
    {
        id: 'gov_teeb',
        name: 'TEEB — Valoração por Ecossistema',
        names: { en: 'TEEB — Valuation by Ecosystem', es: 'TEEB — Valoración por Ecosistema' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: [],
        sao: {
            matrix: 'resiliencia',
            tier: 'specialized',
            subcategory: 'lca',
            regulatoryRefs: [],
            scenarios: ['deforestation', 'oil_spill'],
        },
    },
];
