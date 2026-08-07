// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   BUILTIN EXAMPLES — DATA module (extracted from marketplace.js)
   Refactor LOC-reduction 2026-05-20: extraído como data module
   puro para reduzir marketplace.js (era 1271L, fica ~225L).
   ZERO behavior change — split puro JS-to-JS via ES module re-export.
   Snapshot baseline: 17 entries (validado por gate behavior-equivalence).
   ================================================================ */

export const BUILTIN_EXAMPLES = [
    {
        ecbytsLibrary: '1.0.0',
        id: 'conama-420-groundwater',
        name: 'CONAMA 420/2009 — Groundwater',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'Brazilian CONAMA 420/2009 groundwater quality criteria. Includes regulatory limits for BTEX, metals, and PAHs in groundwater and soil matrices.',
        license: 'MIT',
        tags: ['regulatory', 'brazil', 'groundwater', 'CONAMA'],
        icon: 'shield',
        dependencies: [],
        contents: {
            parameters: [
                {
                    id: 'vinyl_chloride',
                    name: 'Cloreto de vinila',
                    names: { en: 'Vinyl chloride', pt: 'Cloreto de vinila', es: 'Cloruro de vinilo' },
                    defaultUnitId: 'ug_L',
                    type: 'SI',
                    category: 'contaminant',
                },
                {
                    id: 'dichloroethene',
                    name: '1,2-Dicloroeteno',
                    names: { en: '1,2-Dichloroethene', pt: '1,2-Dicloroeteno', es: '1,2-Dicloroeteno' },
                    defaultUnitId: 'ug_L',
                    type: 'SI',
                    category: 'contaminant',
                },
                {
                    id: 'trichloroethene',
                    name: 'Tricloroeteno',
                    names: { en: 'Trichloroethene', pt: 'Tricloroeteno', es: 'Tricloroeteno' },
                    defaultUnitId: 'ug_L',
                    type: 'SI',
                    category: 'contaminant',
                },
            ],
            validationRules: {
                regulatoryLimits: {
                    '75-01-4': { groundwater: { max: 5, unit: 'ug_L', source: 'CONAMA 420/2009' } },
                    '156-59-2': { groundwater: { max: 50, unit: 'ug_L', source: 'CONAMA 420/2009' } },
                    '79-01-6': { groundwater: { max: 70, unit: 'ug_L', source: 'CONAMA 420/2009' } },
                },
            },
            agents: [
                {
                    id: 'conama-420-expert',
                    name: 'CONAMA 420 Specialist',
                    description: 'Expert in CONAMA 420/2009 groundwater and soil quality criteria',
                    systemPromptAddition:
                        'You are an expert in CONAMA 420/2009 — Brazilian soil and groundwater quality criteria for contaminated site management. Always cite specific articles and annexes. Cross-reference values with CETESB guiding values when applicable.',
                    icon: 'shield',
                },
            ],
            i18n: {
                en: {
                    conamaGroundwater: 'CONAMA 420 Groundwater',
                    conamaGroundwaterDesc: 'Brazilian groundwater quality standards',
                },
                pt: {
                    conamaGroundwater: 'CONAMA 420 Águas Subterrâneas',
                    conamaGroundwaterDesc: 'Padrões brasileiros de qualidade de águas subterrâneas',
                },
                es: {
                    conamaGroundwater: 'CONAMA 420 Aguas Subterráneas',
                    conamaGroundwaterDesc: 'Estándares brasileños de calidad de aguas subterráneas',
                },
            },
            lockedFields: [
                {
                    id: 'conama-420-badge',
                    type: 'ticker_badge',
                    lock: 'display',
                    content: { label: 'CONAMA 420/2009', icon: 'shield', color: '#2d8a7a' },
                },
            ],
        },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'epa-rsls-screening',
        name: 'EPA RSLs — Regional Screening Levels',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'US EPA Regional Screening Levels for chemical contaminants in soil and groundwater. Risk-based values for residential and industrial land use.',
        license: 'MIT',
        tags: ['regulatory', 'usa', 'epa', 'screening'],
        icon: 'shield',
        dependencies: [],
        contents: {
            parameters: [
                {
                    id: 'pcbs_total',
                    name: 'PCBs Totais',
                    names: { en: 'Total PCBs', pt: 'PCBs Totais', es: 'PCBs Totales' },
                    defaultUnitId: 'mg_kg',
                    type: 'SI',
                    category: 'contaminant',
                },
                {
                    id: 'pfos',
                    name: 'PFOS',
                    names: { en: 'PFOS', pt: 'PFOS', es: 'PFOS' },
                    defaultUnitId: 'ug_L',
                    type: 'SI',
                    category: 'contaminant',
                },
                {
                    id: 'pfoa',
                    name: 'PFOA',
                    names: { en: 'PFOA', pt: 'PFOA', es: 'PFOA' },
                    defaultUnitId: 'ug_L',
                    type: 'SI',
                    category: 'contaminant',
                },
            ],
            validationRules: {
                regulatoryLimits: {
                    '1336-36-3': { soil: { max: 0.23, unit: 'mg_kg', source: 'EPA RSL 2024 (residential)' } },
                    '1763-23-1': { groundwater: { max: 0.07, unit: 'ug_L', source: 'EPA RSL 2024' } },
                    '335-67-1': { groundwater: { max: 0.004, unit: 'ug_L', source: 'EPA RSL 2024' } },
                },
            },
            agents: [
                {
                    id: 'epa-rsl-expert',
                    name: 'EPA RSL Specialist',
                    description: 'Expert in EPA Regional Screening Levels and risk assessment',
                    systemPromptAddition:
                        'You are an expert in US EPA Regional Screening Levels (RSLs). Always specify whether screening values are for residential or industrial land use. Reference the latest RSL tables and underlying toxicity values.',
                    icon: 'shield',
                },
            ],
            i18n: {
                en: { epaRsls: 'EPA RSLs', epaRslsDesc: 'US EPA Regional Screening Levels' },
                pt: { epaRsls: 'EPA RSLs', epaRslsDesc: 'Níveis de triagem regionais da EPA' },
                es: { epaRsls: 'EPA RSLs', epaRslsDesc: 'Niveles de detección regionales de la EPA' },
            },
            lockedFields: [
                {
                    id: 'epa-rsl-badge',
                    type: 'ticker_badge',
                    lock: 'display',
                    content: { label: 'EPA RSL 2024', icon: 'shield', color: '#3b6ea5' },
                },
            ],
        },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'synthetic-monitoring-demo',
        name: 'Synthetic Monitoring Demo',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'Demonstration library with AI-generated hypothetical monitoring data. Includes locked disclaimer badge to warn users about synthetic data.',
        license: 'MIT',
        tags: ['demo', 'synthetic', 'training'],
        icon: 'sparkles',
        dependencies: [],
        contents: {
            families: {
                synthetic_well: {
                    id: 'synthetic_well',
                    name: 'Synthetic Well',
                    icon: 'well',
                    code: 'Y',
                    enabled: true,
                    custom: true,
                },
            },
            tickerItems: [
                {
                    label: 'Demo Wells: ',
                    filters: [{ dimension: 'family', operator: 'is', value: 'synthetic_well' }],
                    calculation: 'count',
                    precision: 0,
                    color: '#aa6633',
                },
            ],
            i18n: {
                en: { syntheticDemo: 'Synthetic Demo', hypotheticalData: 'Hypothetical Data' },
                pt: { syntheticDemo: 'Demo Sintético', hypotheticalData: 'Dados Hipotéticos' },
                es: { syntheticDemo: 'Demo Sintético', hypotheticalData: 'Datos Hipotéticos' },
            },
            lockedFields: [
                {
                    id: 'synthetic-disclaimer',
                    type: 'ticker_badge',
                    lock: 'display',
                    content: {
                        label: 'Hypothetical Data',
                        icon: 'alert-triangle',
                        color: '#c44',
                        // H-009 (HUD Audit 2026-06-05, claude - ui): tooltip explica
                        // a natureza demo do badge para usuário leigo, evitando o
                        // sinal falso de alarme. Nielsen H10 Help and documentation.
                        description: 'Demonstration data — generated synthetically for exploration. Use Generate or Import to load your own model for real analysis.',
                    },
                },
                { id: 'synthetic-family-lock', type: 'family_enabled', lock: 'display', target: 'synthetic_well' },
            ],
        },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'esg-reporting-pack',
        name: 'ESG Reporting Pack',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'Environmental, Social, and Governance reporting templates. Includes GRI-aligned parameters, benchmarks, and report template.',
        license: 'MIT',
        tags: ['esg', 'reporting', 'gri', 'sustainability'],
        icon: 'leaf',
        dependencies: [],
        contents: {
            parameters: [
                {
                    id: 'scope1_emissions',
                    name: 'Emissões Escopo 1',
                    names: { en: 'Scope 1 Emissions', pt: 'Emissões Escopo 1', es: 'Emisiones Alcance 1' },
                    defaultUnitId: 'tCO2e',
                    type: 'SI',
                    category: 'emission',
                },
                {
                    id: 'scope2_emissions',
                    name: 'Emissões Escopo 2',
                    names: { en: 'Scope 2 Emissions', pt: 'Emissões Escopo 2', es: 'Emisiones Alcance 2' },
                    defaultUnitId: 'tCO2e',
                    type: 'SI',
                    category: 'emission',
                },
                {
                    id: 'water_withdrawal',
                    name: 'Captação de água',
                    names: { en: 'Water Withdrawal', pt: 'Captação de água', es: 'Extracción de agua' },
                    defaultUnitId: 'm3',
                    type: 'SI',
                    category: 'physical',
                },
            ],
            validationRules: {
                benchmarks: {
                    scope1_intensity: {
                        industry_avg: 100,
                        top_quartile: 50,
                        world_class: 20,
                        unit: 'tCO2e_unit',
                        source: 'GRI 305',
                    },
                    water_intensity: {
                        industry_avg: 5,
                        top_quartile: 2,
                        world_class: 1,
                        unit: 'm3_unit',
                        source: 'GRI 303',
                    },
                },
            },
            reportTemplate: {
                title: 'ESG Compliance Report',
                content:
                    '<h1>ESG Compliance Report</h1><h2>1. Environmental Performance</h2><p>Scope 1 & 2 emissions, water withdrawal, waste generation metrics.</p><h2>2. Social Indicators</h2><p>Health & safety rates, community engagement metrics.</p><h2>3. Governance</h2><p>Compliance status, audit findings, corrective actions.</p>',
            },
            chatTools: [
                {
                    id: 'esg-advisor',
                    name: 'ESG Advisor',
                    description: 'Reviews data against GRI standards',
                    icon: 'leaf',
                    promptAddition:
                        'When analyzing data, always compare against GRI Standards (GRI 303 Water, GRI 305 Emissions, GRI 306 Waste). Highlight alignment or gaps with ESG reporting requirements.',
                },
            ],
            i18n: {
                en: { esgPack: 'ESG Reporting', esgPackDesc: 'GRI-aligned ESG reporting templates' },
                pt: { esgPack: 'Relatório ESG', esgPackDesc: 'Templates de relatório ESG alinhados ao GRI' },
                es: { esgPack: 'Informe ESG', esgPackDesc: 'Plantillas de informes ESG alineadas con GRI' },
            },
        },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'sample-aerial-sentinel',
        name: 'Sentinel-2 Sample — S\u00e3o Paulo',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'Sample Sentinel-2 cloudless imagery (10m/px) for the S\u00e3o Paulo metropolitan region. Generated on-demand from open Sentinel-2 tiles — no API key required.',
        license: 'MIT',
        tags: ['imagery', 'satellite', 'brazil', 'sentinel-2'],
        icon: 'image',
        dependencies: [],
        contents: {
            imagery: [
                {
                    id: 'sentinel-sp-metro-2021',
                    name: 'S\u00e3o Paulo Metro — 2021',
                    bbox: [-23.65, -46.8, -23.45, -46.55],
                    resolution: '10m/px',
                    date: '2021-01-01',
                    format: 'jpeg',
                    source: 'sentinel-tiles',
                },
            ],
            i18n: {
                en: { sentinelSample: 'Sentinel-2 Sample', sentinelSampleDesc: 'Satellite imagery for S\u00e3o Paulo' },
                pt: {
                    sentinelSample: 'Amostra Sentinel-2',
                    sentinelSampleDesc: 'Imagem de sat\u00e9lite para S\u00e3o Paulo',
                },
                es: {
                    sentinelSample: 'Muestra Sentinel-2',
                    sentinelSampleDesc: 'Imagen satelital para S\u00e3o Paulo',
                },
            },
        },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'ibge-bacias-hidrograficas-br',
        name: 'Bacias Hidrogr\u00e1ficas do Brasil',
        version: '1.0.0',
        author: { name: 'IBGE/ANA', url: 'https://www.ibge.gov.br' },
        description:
            'Divis\u00e3o Hidrogr\u00e1fica Nacional (DHN250) e Bacias Hidrogr\u00e1ficas do Brasil (BHB250). Dados oficiais do IBGE e ANA na escala 1:250.000. Inclui 12 Regi\u00f5es Hidrogr\u00e1ficas e principais bacias.',
        license: 'Open Data',
        tags: ['hidrografia', 'brasil', 'ibge', 'ana', 'bacias', 'free', 'geodata'],
        icon: 'droplet',
        dependencies: [],
        contents: {
            vectorLayers: [
                {
                    id: 'dhn250-regioes',
                    name: 'Regi\u00f5es Hidrogr\u00e1ficas',
                    supabaseStoragePath: 'ibge/dhn250_regioes.geojson',
                    geojsonUrl: '/assets/geo/ibge/dhn250_regioes.geojson',
                    bbox: [-73.8, -33.7, -34.7, 5.2],
                    style: {
                        stroke: '#0066cc',
                        strokeWidth: 2,
                        fill: '#0066cc',
                        fillOpacity: 0.05,
                    },
                    visibleByDefault: true,
                },
                {
                    id: 'bhb250-bacias',
                    name: 'Bacias Hidrogr\u00e1ficas',
                    supabaseStoragePath: 'ibge/bhb250_bacias.geojson',
                    geojsonUrl: '/assets/geo/ibge/bhb250_bacias.geojson',
                    bbox: [-73.8, -33.7, -34.7, 5.2],
                    style: {
                        stroke: '#009900',
                        strokeWidth: 1.5,
                        fill: '#009900',
                        fillOpacity: 0.03,
                    },
                    visibleByDefault: false,
                },
            ],
            i18n: {
                en: {
                    ibgeBacias: 'Brazil Hydrographic Basins',
                    ibgeBaciasDesc: 'Official hydrographic data from IBGE/ANA',
                    regioesHidrograficas: 'Hydrographic Regions',
                    baciasHidrograficas: 'Hydrographic Basins',
                    contextoHidro: 'Hydrological Context',
                    bacia: 'Basin',
                    regiao: 'Region',
                },
                pt: {
                    ibgeBacias: 'Bacias Hidrogr\u00e1ficas do Brasil',
                    ibgeBaciasDesc: 'Dados hidrogr\u00e1ficos oficiais do IBGE/ANA',
                    regioesHidrograficas: 'Regi\u00f5es Hidrogr\u00e1ficas',
                    baciasHidrograficas: 'Bacias Hidrogr\u00e1ficas',
                    contextoHidro: 'Contexto Hidrogr\u00e1fico',
                    bacia: 'Bacia',
                    regiao: 'Regi\u00e3o',
                },
                es: {
                    ibgeBacias: 'Cuencas Hidrogr\u00e1ficas de Brasil',
                    ibgeBaciasDesc: 'Datos hidrogr\u00e1ficos oficiales de IBGE/ANA',
                    regioesHidrograficas: 'Regiones Hidrogr\u00e1ficas',
                    baciasHidrograficas: 'Cuencas Hidrogr\u00e1ficas',
                    contextoHidro: 'Contexto Hidrogr\u00e1fico',
                    bacia: 'Cuenca',
                    regiao: 'Regi\u00f3n',
                },
            },
        },
    },
    // ── Natural Earth - Global Rivers & Lakes (CC0 / Public Domain) ──
    {
        ecbytsLibrary: '1.0.0',
        id: 'natural-earth-hydro-global',
        name: 'Natural Earth — Global Rivers & Lakes',
        version: '1.0.0',
        author: { name: 'Natural Earth', url: 'https://www.naturalearthdata.com' },
        description:
            'Major world rivers and lakes from Natural Earth (1:110M scale). ' +
            'Public domain (CC0). ~100 river centerlines + ~25 major lakes.',
        license: 'CC0',
        tags: ['global', 'rivers', 'lakes', 'hydrology', 'free', 'geodata'],
        icon: 'droplet',
        dependencies: [],
        contents: {
            vectorLayers: [
                {
                    id: 'ne-110m-rivers',
                    name: 'World Rivers (110m)',
                    supabaseStoragePath: 'natural-earth/ne_110m_rivers_lake_centerlines.geojson',
                    geojsonUrl: '/assets/geo/natural-earth/ne_110m_rivers_lake_centerlines.geojson',
                    bbox: [-180, -90, 180, 90],
                    style: { stroke: '#1a8cff', strokeWidth: 1.5 },
                    visibleByDefault: true,
                },
                {
                    id: 'ne-110m-lakes',
                    name: 'World Lakes (110m)',
                    supabaseStoragePath: 'natural-earth/ne_110m_lakes.geojson',
                    geojsonUrl: '/assets/geo/natural-earth/ne_110m_lakes.geojson',
                    bbox: [-180, -90, 180, 90],
                    style: { stroke: '#0055aa', strokeWidth: 1, fill: '#0077cc', fillOpacity: 0.08 },
                    visibleByDefault: true,
                },
            ],
            i18n: {
                en: {
                    neHydroGlobal: 'Natural Earth — Global Rivers & Lakes',
                    neHydroGlobalDesc: 'Major world rivers and lakes (1:110M)',
                },
                pt: {
                    neHydroGlobal: 'Natural Earth — Rios e Lagos Globais',
                    neHydroGlobalDesc: 'Principais rios e lagos mundiais (1:110M)',
                },
                es: {
                    neHydroGlobal: 'Natural Earth — Rios y Lagos Globales',
                    neHydroGlobalDesc: 'Principales rios y lagos del mundo (1:110M)',
                },
            },
        },
    },
    // ── Natural Earth - Parks & Protected Lands (CC0 / Public Domain) ──
    {
        ecbytsLibrary: '1.0.0',
        id: 'natural-earth-parks-global',
        name: 'Natural Earth — Parks & Protected Lands',
        version: '1.0.0',
        author: { name: 'Natural Earth', url: 'https://www.naturalearthdata.com' },
        description:
            'US National Park Service areas from Natural Earth (1:10M scale). ' +
            'Public domain (CC0). 61 park polygons including Yellowstone, Yosemite, Grand Canyon.',
        license: 'CC0',
        tags: ['global', 'parks', 'protected-areas', 'conservation', 'free', 'geodata'],
        icon: 'shield',
        dependencies: [],
        contents: {
            vectorLayers: [
                {
                    id: 'ne-10m-parks-area',
                    name: 'Parks & Protected Lands',
                    supabaseStoragePath: 'natural-earth/ne_10m_parks_and_protected_lands_area.geojson',
                    geojsonUrl: '/assets/geo/natural-earth/ne_10m_parks_and_protected_lands_area.geojson',
                    bbox: [-180, -90, 180, 90],
                    style: { stroke: '#2d8a4e', strokeWidth: 1.5, fill: '#2d8a4e', fillOpacity: 0.06 },
                    visibleByDefault: true,
                },
            ],
            i18n: {
                en: { neParks: 'Parks & Protected Lands' },
                pt: { neParks: 'Parques e Areas Protegidas' },
                es: { neParks: 'Parques y Areas Protegidas' },
            },
        },
    },
    // ── Natural Earth - Country Boundaries (CC0 / Public Domain) ──
    {
        ecbytsLibrary: '1.0.0',
        id: 'natural-earth-boundaries-global',
        name: 'Natural Earth — Country Boundaries',
        version: '1.0.0',
        author: { name: 'Natural Earth', url: 'https://www.naturalearthdata.com' },
        description:
            'Country boundaries from Natural Earth (1:110M scale). ' +
            'Public domain (CC0). 177 countries with names, ISO codes, population.',
        license: 'CC0',
        tags: ['global', 'countries', 'boundaries', 'admin', 'free', 'geodata'],
        icon: 'globe',
        dependencies: [],
        contents: {
            vectorLayers: [
                {
                    id: 'ne-110m-countries',
                    name: 'Country Boundaries (110m)',
                    supabaseStoragePath: 'natural-earth/ne_110m_admin_0_countries.geojson',
                    geojsonUrl: '/assets/geo/natural-earth/ne_110m_admin_0_countries.geojson',
                    bbox: [-180, -90, 180, 90],
                    style: { stroke: '#888888', strokeWidth: 1, fill: '#aaaaaa', fillOpacity: 0.03 },
                    visibleByDefault: false,
                },
            ],
            i18n: {
                en: { neCountries: 'Country Boundaries' },
                pt: { neCountries: 'Fronteiras de Paises' },
                es: { neCountries: 'Fronteras de Paises' },
            },
        },
    },
    // ── GEM Global Active Faults (CC-BY-SA 4.0) ──
    {
        ecbytsLibrary: '1.0.0',
        id: 'gem-active-faults-global',
        name: 'GEM Global Active Faults',
        version: '2024.0',
        author: { name: 'GEM Foundation', url: 'https://www.globalquakemodel.org' },
        description:
            'Global database of active fault traces from the GEM Foundation. ' +
            '16,195 faults with slip type classification. CC-BY-SA 4.0 license.',
        license: 'CC-BY-SA-4.0',
        tags: ['global', 'faults', 'seismic', 'earthquake', 'hazard', 'geology', 'free', 'geodata'],
        icon: 'alert-triangle',
        dependencies: [],
        contents: {
            vectorLayers: [
                {
                    id: 'gem-active-faults',
                    name: 'Active Faults',
                    supabaseStoragePath: 'gem/gem_active_faults_lite.geojson',
                    geojsonUrl: '/assets/geo/gem/gem_active_faults_lite.geojson',
                    bbox: [-180, -90, 180, 90],
                    style: { stroke: '#cc3333', strokeWidth: 1 },
                    visibleByDefault: true,
                },
            ],
            i18n: {
                en: { gemFaults: 'Global Active Faults', gemFaultsDesc: 'Seismogenic fault traces worldwide' },
                pt: {
                    gemFaults: 'Falhas Tectonicas Ativas',
                    gemFaultsDesc: 'Tracados de falhas sismogenicas mundiais',
                },
                es: {
                    gemFaults: 'Fallas Tectonicas Activas',
                    gemFaultsDesc: 'Trazas de fallas sismogenicas mundiales',
                },
            },
        },
    },
    // ── CETESB/SEMIL - Areas Contaminadas SP (Dados Publicos Gov SP) ──
    {
        ecbytsLibrary: '1.0.0',
        id: 'cetesb-areas-contaminadas-sp',
        name: 'CETESB — Areas Contaminadas SP',
        version: '2026.04',
        author: { name: 'SEMIL/CETESB', url: 'https://cetesb.sp.gov.br/areas-contaminadas/' },
        description:
            'Cadastro de areas contaminadas e reabilitadas do Estado de Sao Paulo (CETESB/SEMIL). ' +
            '7.150 areas com classificacao, contaminantes, meios impactados. ' +
            'Inclui poligonos de delimitacao e areas de restricao de aguas subterraneas.',
        license: 'Dados Publicos Gov SP',
        tags: ['brasil', 'sao-paulo', 'contaminacao', 'remediacao', 'cetesb', 'areas-contaminadas', 'free', 'geodata'],
        icon: 'alert-triangle',
        dependencies: [],
        contents: {
            vectorLayers: [
                {
                    id: 'cetesb-contaminadas-pontos',
                    name: 'Areas Contaminadas (pontos)',
                    apiUrl: 'https://mapas.infraestruturameioambiente.sp.gov.br/server/rest/services/SIGAM/Empreendimento_Contaminacao_SGP/MapServer/1/query',
                    apiFields: 'NomeEmpree,ClassificacaoAtual,GrupoContaminante,MeiosImpactados,NomMunicipio,Sigla_DG',
                    supabaseStoragePath: 'cetesb/areas_contaminadas_pontos.geojson',
                    geojsonUrl: '/assets/geo/cetesb/areas_contaminadas_pontos.geojson',
                    bbox: [-53.1, -25.3, -44.2, -19.8],
                    style: { stroke: '#cc3333', fill: '#cc3333', fillOpacity: 0.8, pointRadius: 4 },
                    visibleByDefault: true,
                },
                {
                    id: 'cetesb-contaminadas-poligonos',
                    name: 'Areas Contaminadas (poligonos)',
                    apiUrl: 'https://mapas.infraestruturameioambiente.sp.gov.br/server/rest/services/SIGAM/Empreendimento_Contaminacao_SGP/MapServer/2/query',
                    apiFields: 'NomeEmpree,ClassificacaoAtual,GrupoContaminante,MeiosImpactados,Sigla_DG',
                    supabaseStoragePath: 'cetesb/areas_contaminadas_poligonos.geojson',
                    geojsonUrl: '/assets/geo/cetesb/areas_contaminadas_poligonos.geojson',
                    bbox: [-53.1, -25.3, -44.2, -19.8],
                    style: { stroke: '#cc0000', strokeWidth: 2, fill: '#cc0000', fillOpacity: 0.12 },
                    visibleByDefault: true,
                },
                {
                    id: 'cetesb-restricao-aguas',
                    name: 'Restricao de Aguas Subterraneas',
                    apiUrl: 'https://mapas.infraestruturameioambiente.sp.gov.br/server/rest/services/SIGAM/Empreendimento_Contaminacao_SGP/MapServer/3/query',
                    apiFields: '*',
                    supabaseStoragePath: 'cetesb/areas_restricao_aguas.geojson',
                    geojsonUrl: '/assets/geo/cetesb/areas_restricao_aguas.geojson',
                    bbox: [-53.1, -25.3, -44.2, -19.8],
                    style: { stroke: '#ff8800', strokeWidth: 1.5, fill: '#ff8800', fillOpacity: 0.06 },
                    visibleByDefault: false,
                },
            ],
            i18n: {
                en: {
                    cetesb: 'CETESB — Contaminated Areas SP',
                    cetesDesc: 'Contaminated and rehabilitated areas in Sao Paulo State',
                },
                pt: {
                    cetesb: 'CETESB — Areas Contaminadas SP',
                    cetesDesc: 'Areas contaminadas e reabilitadas do Estado de Sao Paulo',
                },
                es: {
                    cetesb: 'CETESB — Areas Contaminadas SP',
                    cetesDesc: 'Areas contaminadas y rehabilitadas del Estado de Sao Paulo',
                },
            },
        },
    },
    // ── SIGAM/SEMIL - Dados Ambientais SP (Dados Publicos Gov SP) ──
    {
        ecbytsLibrary: '1.0.0',
        id: 'sigam-ambiente-sp',
        name: 'SIGAM — Dados Ambientais SP',
        version: '2026.04',
        author: { name: 'SEMIL/SP', url: 'https://sigam.ambiente.sp.gov.br/sigam3/' },
        description:
            'Dados ambientais do Estado de Sao Paulo via SIGAM/SEMIL. ' +
            'Inclui Unidades de Conservacao (336 UCs), Painel Verde (84K areas de restauracao), ' +
            'Autos de Infracao Ambiental (75K TCRAs) e Ocorrencias Ambientais (206K). ' +
            'Layers grandes carregam via API em tempo real.',
        license: 'Dados Publicos Gov SP',
        tags: ['brasil', 'sao-paulo', 'unidades-conservacao', 'infracoes', 'restauracao', 'sigam', 'free', 'geodata'],
        icon: 'shield',
        dependencies: [],
        contents: {
            vectorLayers: [
                {
                    id: 'sigam-areas-protegidas',
                    name: 'Unidades de Conservacao SP',
                    apiUrl: 'https://mapas.infraestruturameioambiente.sp.gov.br/server/rest/services/SIGAM/Areas_Protegidas_p_Unidade/MapServer/0/query',
                    apiFields:
                        'nomUnidade,nomTipoUnidade,Categoria,Grupo,Esfera,Bioma,Area_ha,OrgaoGestor,nomMunicipio',
                    supabaseStoragePath: 'sigam/areas_protegidas_sp.geojson',
                    geojsonUrl: '/assets/geo/sigam/areas_protegidas_sp.geojson',
                    bbox: [-53.1, -25.3, -44.2, -19.8],
                    style: { stroke: '#1a7a3a', strokeWidth: 2, fill: '#2d8a4e', fillOpacity: 0.08 },
                    visibleByDefault: true,
                },
                {
                    id: 'sigam-painel-verde',
                    name: 'Painel Verde (restauracao/danos)',
                    apiUrl: 'https://mapas.infraestruturameioambiente.sp.gov.br/server/rest/services/SIGAM/Painel_Verde/MapServer/0/query',
                    apiFields: 'Classificacao,Categoria,Municipio,Area_ha',
                    supabaseStoragePath: 'sigam/painel_verde_sp.geojson',
                    geojsonUrl: '/assets/geo/sigam/painel_verde_sp.geojson',
                    bbox: [-53.1, -25.3, -44.2, -19.8],
                    style: { stroke: '#4a9e3f', strokeWidth: 1, fill: '#66bb6a', fillOpacity: 0.05 },
                    visibleByDefault: false,
                },
                {
                    id: 'sigam-tcra-aia',
                    name: 'Autos de Infracao Ambiental (TCRA)',
                    apiUrl: 'https://mapas.infraestruturameioambiente.sp.gov.br/server/rest/services/SIGAM/TCRA_AIA_PUBLICO/MapServer/0/query',
                    apiFields: 'Categoria,ClasseInfracao,SituacaoTCRA,Municipio',
                    supabaseStoragePath: 'sigam/tcra_aia_sp.geojson',
                    geojsonUrl: '/assets/geo/sigam/tcra_aia_sp.geojson',
                    bbox: [-53.1, -25.3, -44.2, -19.8],
                    style: { stroke: '#ff6600', fill: '#ff6600', fillOpacity: 0.7, pointRadius: 3 },
                    visibleByDefault: false,
                },
                {
                    id: 'sigam-ocorrencias',
                    name: 'Ocorrencias Ambientais',
                    apiUrl: 'https://mapas.infraestruturameioambiente.sp.gov.br/server/rest/services/SIGAM/AIAe_AreaOcorrencia_P/MapServer/0/query',
                    apiFields: 'Natureza,CategoriaInfracao,NomeInfracao,Situacao,Fase,Municipio',
                    supabaseStoragePath: 'sigam/ocorrencias_sp.geojson',
                    geojsonUrl: '/assets/geo/sigam/ocorrencias_sp.geojson',
                    bbox: [-53.1, -25.3, -44.2, -19.8],
                    style: { stroke: '#cc6600', strokeWidth: 1, fill: '#cc6600', fillOpacity: 0.06 },
                    visibleByDefault: false,
                },
            ],
            i18n: {
                en: {
                    sigam: 'SIGAM — Environmental Data SP',
                    sigamDesc:
                        'Conservation units, ecological restoration, violations and occurrences in Sao Paulo State',
                },
                pt: {
                    sigam: 'SIGAM — Dados Ambientais SP',
                    sigamDesc:
                        'Unidades de conservacao, restauracao ecologica, infracoes e ocorrencias ambientais do Estado de SP',
                },
                es: {
                    sigam: 'SIGAM — Datos Ambientales SP',
                    sigamDesc:
                        'Unidades de conservacion, restauracion ecologica, infracciones y ocurrencias ambientales de SP',
                },
            },
        },
    },
    // ── ARTESP - Infraestrutura Rodoviaria SP (Dados Abertos) ──
    {
        ecbytsLibrary: '1.0.0',
        id: 'transport-artesp-sp',
        name: 'ARTESP — Infraestrutura Rodoviaria SP',
        version: '2026.04',
        author: { name: 'ARTESP/CCM', url: 'https://dadosabertos.artesp.sp.gov.br' },
        description:
            'Malha rodoviaria concessionada do Estado de Sao Paulo (~3.400 km, 25 concessionarias), ' +
            'acidentes rodoviarios (2001-2026) e programacao de obras/conservacao. ' +
            'Dados publicos (Dominio Publico) do portal de Dados Abertos da ARTESP.',
        license: 'Dominio Publico',
        tags: [
            'brasil',
            'sao-paulo',
            'transport',
            'roads',
            'highways',
            'accidents',
            'infrastructure',
            'free',
            'geodata',
        ],
        icon: 'road',
        dependencies: [],
        contents: {
            vectorLayers: [
                {
                    id: 'artesp-malha-rodoviaria',
                    name: 'Malha Rodoviaria Concessionada SP',
                    geojsonUrl: '/assets/geo/artesp/malha_rodoviaria_sp.geojson',
                    supabaseStoragePath: 'artesp/malha_rodoviaria_sp.geojson',
                    bbox: [-53.1, -25.3, -44.2, -19.8],
                    style: { stroke: '#e65100', strokeWidth: 2, fill: null, fillOpacity: 0 },
                    visibleByDefault: true,
                },
                {
                    id: 'artesp-obras',
                    name: 'Obras e Conservacao SP',
                    geojsonUrl: '/assets/geo/artesp/obras_sp.geojson',
                    supabaseStoragePath: 'artesp/obras_sp.geojson',
                    bbox: [-53.1, -25.3, -44.2, -19.8],
                    style: { stroke: '#ff9800', strokeWidth: 2, fill: '#ff9800', fillOpacity: 0.15 },
                    visibleByDefault: false,
                },
            ],
            i18n: {
                en: {
                    artesp: 'ARTESP — Road Infrastructure SP',
                    artespDesc: 'Concessioned road network, accidents and construction works in Sao Paulo State',
                },
                pt: {
                    artesp: 'ARTESP — Infraestrutura Rodoviaria SP',
                    artespDesc: 'Malha rodoviaria concessionada, acidentes e obras do Estado de SP',
                },
                es: {
                    artesp: 'ARTESP — Infraestructura Vial SP',
                    artespDesc: 'Red vial concesionada, accidentes y obras del Estado de Sao Paulo',
                },
            },
        },
    },
    // ── ANA - Dados Hidricos do Brasil (Dados Abertos) ──
    {
        ecbytsLibrary: '1.0.0',
        id: 'hydro-ana-br',
        name: 'ANA — Dados Hidricos BR',
        version: '2026.04',
        author: { name: 'ANA/SNIRH', url: 'https://dadosabertos.ana.gov.br' },
        description:
            'Dados hidricos nacionais da Agencia Nacional de Aguas: outorgas federais/estaduais, ' +
            'estacoes hidrometeorologicas (RHN ~18K), bacias hidrograficas ottocodificadas, ' +
            'trechos de rios, massas de agua, barragens (SNISB ~24K), qualidade (RNQA), ' +
            'disponibilidade hidrica subterranea. Dados Abertos Gov BR.',
        license: 'Dados Abertos Gov BR',
        tags: [
            'brasil',
            'hydrology',
            'groundwater',
            'surface_water',
            'water_quality',
            'dams',
            'outorgas',
            'free',
            'geodata',
        ],
        icon: 'droplet',
        dependencies: [],
        contents: {
            vectorLayers: [
                {
                    id: 'ana-outorgas-federais',
                    name: 'Outorgas Federais',
                    apiUrl: 'https://www.snirh.gov.br/arcgis/rest/services/SPR/Outorga_Federal/FeatureServer/0',
                    apiFields: 'FINALIDADE_PRINCIPAL,CORPO_HIDRICO,UF,MUNICIPIO,VAZAO_MAX_M3_H',
                    geojsonUrl: '/assets/geo/ana/outorgas_federais.geojson',
                    supabaseStoragePath: 'ana/outorgas_federais.geojson',
                    bbox: [-73.99, -33.75, -34.79, 5.27],
                    style: { stroke: '#d32f2f', fill: '#d32f2f', fillOpacity: 0.8, pointRadius: 3 },
                    visibleByDefault: false,
                },
                {
                    id: 'ana-outorgas-estaduais-sp',
                    name: 'Outorgas Estaduais Superficiais (SP)',
                    geojsonUrl: '/assets/geo/ana/by-uf/SP.geojson',
                    supabaseStoragePath: 'ana/outorgas-estaduais-sup/SP.geojson',
                    bbox: [-53.1, -25.3, -44.2, -19.8],
                    style: { stroke: '#c62828', fill: '#c62828', fillOpacity: 0.7, pointRadius: 2 },
                    visibleByDefault: false,
                },
                {
                    id: 'ana-estacoes-rhn',
                    name: 'Estacoes Hidrometeorologicas (RHN)',
                    apiUrl: 'https://www.snirh.gov.br/arcgis/rest/services/SPR/EstacoesTelemetricas_v2/FeatureServer/0',
                    apiFields: 'Nome,Codigo,TipoEstacao,Operando,Bacia,SubBacia',
                    geojsonUrl: '/assets/geo/ana/estacoes_rhn.geojson',
                    supabaseStoragePath: 'ana/estacoes_rhn.geojson',
                    bbox: [-73.99, -33.75, -34.79, 5.27],
                    style: { stroke: '#1565c0', fill: '#1565c0', fillOpacity: 0.8, pointRadius: 3 },
                    visibleByDefault: true,
                },
                {
                    id: 'ana-bacias-otto-n1',
                    name: 'Bacias Hidrograficas (nivel 1)',
                    geojsonUrl: '/assets/geo/ana/bacias_otto_n1.geojson',
                    supabaseStoragePath: 'ana/bacias_otto_n1.geojson',
                    bbox: [-73.99, -33.75, -34.79, 5.27],
                    style: { stroke: '#0277bd', strokeWidth: 2, fill: '#0288d1', fillOpacity: 0.05 },
                    visibleByDefault: false,
                },
                {
                    id: 'ana-barragens-snisb',
                    name: 'Barragens Cadastradas (SNISB)',
                    apiUrl: 'https://www.snirh.gov.br/arcgis/rest/services/SPR/SNISB_Barragens/FeatureServer/0',
                    apiFields: 'BAR_NM_NOME,TIPO_MATERIAL,USO_PRINCIPAL,BAR_NU_ALT_MAX_NIVEL_TERRENO',
                    geojsonUrl: '/assets/geo/ana/barragens_snisb.geojson',
                    supabaseStoragePath: 'ana/barragens_snisb.geojson',
                    bbox: [-73.99, -33.75, -34.79, 5.27],
                    style: { stroke: '#f57f17', fill: '#f57f17', fillOpacity: 0.9, pointRadius: 4 },
                    visibleByDefault: false,
                },
                {
                    id: 'ana-trechos-rios-50k',
                    name: 'Trechos de Rios 50K (hidrografia)',
                    geojsonUrl: '/assets/geo/ana/trechos_rios_50k_centroid.geojson',
                    supabaseStoragePath: 'ana/trechos_rios_50k_centroid.geojson',
                    bbox: [-73.99, -33.75, -34.79, 5.27],
                    style: { stroke: '#0288d1', strokeWidth: 1, fill: null, fillOpacity: 0 },
                    visibleByDefault: false,
                },
                {
                    id: 'ana-qualidade-rnqa',
                    name: 'Qualidade da Agua (RNQA)',
                    apiUrl: 'https://www.snirh.gov.br/arcgis/rest/services/SPR/RNQA/FeatureServer/0',
                    apiFields: 'SGUFG,NMEST,NMMUN,NMCURSODAG,AAINICIO',
                    geojsonUrl: '/assets/geo/ana/qualidade_rnqa.geojson',
                    supabaseStoragePath: 'ana/qualidade_rnqa.geojson',
                    bbox: [-73.99, -33.75, -34.79, 5.27],
                    style: { stroke: '#2e7d32', fill: '#2e7d32', fillOpacity: 0.8, pointRadius: 3 },
                    visibleByDefault: false,
                },
            ],
            i18n: {
                en: {
                    ana: 'ANA — Water Resources BR',
                    anaDesc:
                        'Federal/state water permits, hydro stations, basins, rivers, dams, water quality for Brazil',
                },
                pt: {
                    ana: 'ANA — Recursos Hidricos BR',
                    anaDesc:
                        'Outorgas federais/estaduais, estacoes hidrometeorologicas, bacias, rios, barragens e qualidade da agua do Brasil',
                },
                es: {
                    ana: 'ANA — Recursos Hidricos BR',
                    anaDesc:
                        'Permisos de uso del agua, estaciones, cuencas, rios, represas y calidad del agua de Brasil',
                },
            },
        },
    },
    // ── INMET - Estacoes Meteorologicas BR ──
    {
        ecbytsLibrary: '1.0.0',
        id: 'meteo-inmet-br',
        name: 'INMET — Estacoes Meteorologicas BR',
        version: '2026.04',
        author: { name: 'INMET', url: 'https://portal.inmet.gov.br' },
        description:
            'Cadastro de 671 estacoes meteorologicas automaticas do INMET cobrindo todos os 27 estados. ' +
            'Inclui coordenadas, altitude, situacao operacional e datas de operacao. ' +
            'API publica (apitempo.inmet.gov.br). Dados publicos Gov BR.',
        license: 'Dados Publicos Gov BR',
        tags: ['brasil', 'meteorology', 'precipitation', 'temperature', 'weather', 'stations', 'free', 'geodata'],
        icon: 'cloud',
        dependencies: [],
        contents: {
            vectorLayers: [
                {
                    id: 'inmet-estacoes',
                    name: 'Estacoes Meteorologicas INMET',
                    geojsonUrl: '/assets/geo/inmet/estacoes_inmet.geojson',
                    supabaseStoragePath: 'inmet/estacoes_inmet.geojson',
                    bbox: [-73.99, -33.75, -34.79, 5.27],
                    style: { stroke: '#43a047', fill: '#43a047', fillOpacity: 0.9, pointRadius: 4 },
                    visibleByDefault: true,
                },
            ],
            i18n: {
                en: {
                    inmet: 'INMET — Weather Stations BR',
                    inmetDesc: '671 automatic weather stations across all 27 Brazilian states',
                },
                pt: {
                    inmet: 'INMET — Estacoes Meteorologicas BR',
                    inmetDesc: '671 estacoes meteorologicas automaticas em todos os 27 estados do Brasil',
                },
                es: {
                    inmet: 'INMET — Estaciones Meteorologicas BR',
                    inmetDesc: '671 estaciones meteorologicas automaticas en los 27 estados de Brasil',
                },
            },
        },
    },
    // ── ICMBio - Unidades de Conservacao Federais ──
    {
        ecbytsLibrary: '1.0.0',
        id: 'conservation-icmbio-br',
        name: 'ICMBio — Unidades de Conservacao BR',
        version: '2026.04',
        author: { name: 'ICMBio/IBAMA', url: 'https://www.gov.br/icmbio' },
        description:
            '334 unidades de conservacao federais: parques nacionais, reservas biologicas, APAs, FLONA, RESEX e mais',
        license: 'Dados Publicos Gov BR',
        tags: ['environmental', 'conservation', 'protected-areas', 'icmbio', 'brazil'],
        icon: '&#9670;',
        manifest: {
            name: { en: 'conservation-icmbio-br', pt: 'conservation-icmbio-br', es: 'conservation-icmbio-br' },
            description: { en: 'icmbioDesc', pt: 'icmbioDesc', es: 'icmbioDesc' },
        },
        vectorLayers: [
            {
                id: 'icmbio-ucs-federais',
                name: 'Unidades de Conservacao Federais',
                apiUrl: 'https://geoservicos.inde.gov.br/geoserver/ICMBio/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=ICMBio:limiteucsfederais_a&outputFormat=application/json',
                apiFields: 'nomeuc,cnuc,siglacateg,grupouc,areahaalb,criacaoano,esferaadm',
                geojsonUrl: '/assets/geo/icmbio/ucs_federais.geojson',
                supabaseStoragePath: 'icmbio/ucs_federais.geojson',
                bbox: [-73.99, -33.75, -34.79, 5.27],
                style: { stroke: '#2e7d32', strokeWidth: 2, fill: '#4caf50', fillOpacity: 0.15 },
                visibleByDefault: false,
            },
        ],
        i18n: {
            en: {
                icmbio: 'ICMBio — Conservation Units BR',
                icmbioDesc: '334 federal conservation units: national parks, biological reserves, APAs, FLONA, RESEX',
            },
            pt: {
                icmbio: 'ICMBio — Unidades de Conservacao BR',
                icmbioDesc:
                    '334 unidades de conservacao federais: parques nacionais, reservas biologicas, APAs, FLONA, RESEX',
            },
            es: {
                icmbio: 'ICMBio — Unidades de Conservacion BR',
                icmbioDesc:
                    '334 unidades de conservacion federales: parques nacionales, reservas biologicas, APAs, FLONA, RESEX',
            },
        },
    },
    // ── IBAMA/INPE - DETER Amazonia ──
    {
        ecbytsLibrary: '1.0.0',
        id: 'deforestation-ibama-br',
        name: 'IBAMA/INPE — DETER Amazonia',
        version: '2026.04',
        author: { name: 'INPE/TerraBrasilis', url: 'https://terrabrasilis.dpi.inpe.br' },
        description:
            'Dados de desmatamento INPE/TerraBrasilis: alertas DETER (Amazonia + Cerrado) e ' +
            'desmatamento consolidado PRODES (6 biomas). Dados Publicos Gov BR.',
        license: 'Dados Publicos Gov BR',
        tags: ['environmental', 'deforestation', 'amazon', 'cerrado', 'ibama', 'inpe', 'prodes', 'deter', 'brazil'],
        icon: '&#9650;',
        manifest: {
            name: { en: 'deforestation-ibama-br', pt: 'deforestation-ibama-br', es: 'deforestation-ibama-br' },
            description: { en: 'deterDesc', pt: 'deterDesc', es: 'deterDesc' },
        },
        vectorLayers: [
            {
                id: 'ibama-deter-amazonia',
                name: 'DETER — Alertas Desmatamento Amazonia',
                geojsonUrl: '/assets/geo/ibama/deter_amazonia.geojson',
                supabaseStoragePath: 'ibama/deter_amazonia.geojson',
                bbox: [-73.99, -16.0, -44.0, 5.27],
                style: { stroke: '#d50000', strokeWidth: 1, fill: '#ff1744', fillOpacity: 0.4 },
                visibleByDefault: false,
            },
            {
                id: 'ibama-deter-cerrado',
                name: 'DETER — Alertas Desmatamento Cerrado',
                geojsonUrl: '/assets/geo/ibama/deter_cerrado.geojson',
                supabaseStoragePath: 'ibama/deter_cerrado.geojson',
                bbox: [-60.0, -24.0, -41.0, -2.0],
                style: { stroke: '#e65100', strokeWidth: 1, fill: '#ff6d00', fillOpacity: 0.4 },
                visibleByDefault: false,
            },
            {
                id: 'ibama-prodes-amazonia',
                name: 'PRODES — Desmatamento Consolidado Amazonia',
                geojsonUrl: '/assets/geo/ibama/prodes_amazonia.geojson',
                supabaseStoragePath: 'ibama/prodes_amazonia.geojson',
                bbox: [-73.99, -16.0, -44.0, 5.27],
                style: { stroke: '#b71c1c', strokeWidth: 1, fill: '#c62828', fillOpacity: 0.3 },
                visibleByDefault: false,
            },
            {
                id: 'ibama-prodes-cerrado',
                name: 'PRODES — Desmatamento Consolidado Cerrado',
                geojsonUrl: '/assets/geo/ibama/prodes_cerrado.geojson',
                supabaseStoragePath: 'ibama/prodes_cerrado.geojson',
                bbox: [-60.0, -24.0, -41.0, -2.0],
                style: { stroke: '#bf360c', strokeWidth: 1, fill: '#e64a19', fillOpacity: 0.3 },
                visibleByDefault: false,
            },
            {
                id: 'ibama-prodes-mata-atlantica',
                name: 'PRODES — Desmatamento Mata Atlantica',
                geojsonUrl: '/assets/geo/ibama/prodes_mata_atlantica.geojson',
                supabaseStoragePath: 'ibama/prodes_mata_atlantica.geojson',
                bbox: [-54.0, -33.0, -35.0, -3.0],
                style: { stroke: '#4a148c', strokeWidth: 1, fill: '#7b1fa2', fillOpacity: 0.3 },
                visibleByDefault: false,
            },
        ],
        i18n: {
            en: {
                deter: 'IBAMA/INPE — Deforestation Data BR',
                deterDesc:
                    'DETER near-real-time deforestation alerts + PRODES consolidated deforestation (Amazon, Cerrado, Atlantic Forest)',
            },
            pt: {
                deter: 'IBAMA/INPE — Dados de Desmatamento BR',
                deterDesc:
                    'Alertas DETER em tempo quase-real + desmatamento consolidado PRODES (Amazonia, Cerrado, Mata Atlantica)',
            },
            es: {
                deter: 'IBAMA/INPE — Datos de Deforestacion BR',
                deterDesc:
                    'Alertas DETER en tiempo casi-real + deforestacion consolidada PRODES (Amazonia, Cerrado, Mata Atlantica)',
            },
        },
    },
    // MOD-LIB-MIG-001 — capability modules (built-ins as first-party libraries).
    // Pilot: interpolation. Aparece na aba Marketplace "Módulos" alinhado ao
    // Library Hub (config/libraryCategories.ts id='interpolation'). kind:'capability'
    // diferencia de data-packs (não injeta parâmetros; é um feature toggle).
    {
        ecbytsLibrary: '1.0.0',
        id: 'interpolation',
        name: 'Interpolation — IDW · RBF · Kriging',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'Spatial interpolation engine: IDW, RBF and ordinary Kriging for contaminant/terrain surfaces. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'interpolation', 'kriging', 'spatial', 'first-party'],
        icon: 'git-branch',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'interpolation' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'simulation',
        name: 'Simulation Lab — Plume · Theis · USLE',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'Environmental simulation lab: Gaussian plume, Theis/Thiem drawdown, Green-Ampt infiltration, SCS-CN runoff, USLE/RUSLE erosion and Manning open-channel flow. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'simulation', 'solvers', 'hydrology', 'first-party'],
        icon: 'flask-conical',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'simulation' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'nn',
        name: 'ML Studio — Neural Networks',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'Neural network training, what-if analysis and prediction over environmental monitoring data. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'nn', 'ml', 'prediction', 'first-party'],
        icon: 'brain-circuit',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'nn' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'recognition',
        name: 'Aerial Recognition — SAM · YOLOS',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'AI image/aerial recognition: SAM, SLIC, YOLOS and samgeo segmentation for feature detection on aerial imagery. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'recognition', 'ai', 'aerial', 'segmentation', 'first-party'],
        icon: 'scan-eye',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'recognition' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'report',
        name: 'Report Studio — PDF · DOCX',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'Report studio: multi-report manager, PDF/DOCX export, rich editor and filter presets for environmental deliverables. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'report', 'pdf', 'docx', 'first-party'],
        icon: 'file-text',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'report' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'sensor',
        name: 'Sensor Center — IoT · Open-Meteo',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'IoT sensor center: live data integration, Open-Meteo weather feed and auto-refresh polling for monitoring stations. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'sensor', 'iot', 'live', 'first-party'],
        icon: 'radio',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'sensor' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'photolog',
        name: 'PhotoLog — Field Capture · EXIF GPS',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'PhotoLog: field photo capture with EXIF GPS, 3D markers and AI vision analysis for site documentation. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'photolog', 'photo', 'exif', 'first-party'],
        icon: 'camera',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'photolog' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'optimization',
        name: 'Spatial Optimization — GA',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'Prescriptive spatial optimization using a genetic algorithm with an uncertainty proxy — well placement, remediation layout. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'optimization', 'genetic-algorithm', 'prescriptive', 'first-party'],
        icon: 'target',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'optimization' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'scenarioSimulation',
        name: 'Scenario Modeling — Monte Carlo · LHS',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'Environmental scenario modeling with Monte Carlo and Latin Hypercube sampling for uncertainty quantification. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'scenario', 'monte-carlo', 'lhs', 'uncertainty', 'first-party'],
        icon: 'dices',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'scenarioSimulation' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'health',
        name: 'Occupational Health — ACGIH BEI',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'Occupational health monitoring: ACGIH BEI 2024 threshold engine and pseudonymized worker registry (LGPD). First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'health', 'occupational', 'acgih', 'first-party'],
        icon: 'heart-pulse',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'health' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'calculator',
        name: 'Environmental Calculator',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'Environmental metrics calculator with a reusable filter pipeline and Launchpad KPI seeds. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'calculator', 'metrics', 'kpi', 'first-party'],
        icon: 'calculator',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'calculator' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'forum',
        name: 'Knowledge Groups Forum',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'Knowledge Groups forum: threads, karma, notifications and moderation adjacent to the Libraries marketplace. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'forum', 'community', 'knowledge', 'first-party'],
        icon: 'messages-square',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'forum' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'pid',
        name: 'Diagram Editor — ISA S5.1 · P&ID',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'Canvas technical diagram editor with ISA S5.1 / P&ID symbols, pan/zoom and PNG/SVG export. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'pid', 'diagram', 'isa', 'first-party'],
        icon: 'shapes',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'pid' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'automation',
        name: 'Automation Bots',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'Event-driven automation bots: file uploads, AI photo tagging and map interpolation triggers. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'automation', 'bots', 'event-driven', 'first-party'],
        icon: 'bot',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'automation' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'costAnalysis',
        name: 'Cost Analysis — CAPEX · OPEX',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'Cost analysis dashboard: CAPEX/OPEX roll-up across L1-L4 with aggregation and reporting. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'cost', 'capex', 'opex', 'economics', 'first-party'],
        icon: 'dollar-sign',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'costAnalysis' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'hypothesisTest',
        name: 'Hypothesis Testing',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'Statistical hypothesis testing: t-test, ANOVA and trend significance for environmental monitoring series. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'statistics', 'hypothesis', 'anova', 'first-party'],
        icon: 'flask-conical',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'hypothesisTest' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'crossSection',
        name: 'Geological Cross-Section',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'Geological cross-section: 2D vertical slice through the 3D model for stratigraphy and plume visualization. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'cross-section', 'geology', 'stratigraphy', 'first-party'],
        icon: 'layers',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'crossSection' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'ingestion',
        name: 'Bulk Import Wizard — EDD · XLSX',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'EDD/XLSX/CSV bulk import wizard with date normalizer and identity resolver for lab and field datasets. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'ingestion', 'import', 'edd', 'xlsx', 'first-party'],
        icon: 'upload-cloud',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'ingestion' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'spatial',
        name: 'Spatial Blueprint — DXF/CAD',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'Spatial Blueprint: DXF/CAD ingestion pipeline with georeferencing for site footprints. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'spatial', 'dxf', 'cad', 'blueprint', 'first-party'],
        icon: 'pen-tool',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'spatial' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'eis',
        name: 'EIS Dashboard — TCCCA+T',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'Environmental Integrity Score: TCCCA+T dashboard with 10-axis radar and score history. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'eis', 'score', 'esg', 'first-party'],
        icon: 'gauge',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'eis' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'governance',
        name: 'ESG Governance Dashboard',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'ESG governance: audit trail, compliance dashboard, regulatory calendar and decision log. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'governance', 'esg', 'audit', 'first-party'],
        icon: 'landmark',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'governance' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'sao',
        name: 'SAO / ESH Matrices',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'SAO / ESH scenario assessment matrices for environment, safety & health. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'sao', 'esh', 'safety', 'first-party'],
        icon: 'grid-3x3',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'sao' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'ohs',
        name: 'Occupational Health & Safety',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'Occupational health & safety: exposure tracking and ACGIH limits. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'ohs', 'safety', 'acgih', 'first-party'],
        icon: 'hard-hat',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'ohs' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'pipelineManager',
        name: 'Pipeline Automation — BPMN',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'BPMN pipeline automation: schema, registry and executor for data workflows. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'pipelines', 'bpmn', 'automation', 'first-party'],
        icon: 'git-merge',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'pipelineManager' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'workflowEngine',
        name: 'Guided Workflows',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'Guided environmental workflows: plume delineation, risk assessment and emergency response. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'workflows', 'guided', 'first-party'],
        icon: 'workflow',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'workflowEngine' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'issues',
        name: 'Issues 3D / BCF + Bug Bounty',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'Issues 3D / BCF-like non-conformity markers with bug bounty tiers and leaderboard. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'issues', 'bcf', 'bounty', 'first-party'],
        icon: 'flag',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'issues' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'purpose',
        name: 'Purpose Module — EIS Impact',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'Purpose Module: EIS impact tracking, micro-feedback and snapshots. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'purpose', 'impact', 'eis', 'first-party'],
        icon: 'heart-handshake',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'purpose' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'financial',
        name: 'Valuation + MAC Curve',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'Project valuation engine (VPL, CRF, VPLA) with marginal abatement cost (MAC) curve. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'financial', 'valuation', 'mac', 'first-party'],
        icon: 'trending-up',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'financial' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'etl',
        name: 'Lab API ETL Reconciliation',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'Lab API ETL: unit conversion, fuzzy name matching and campaign reconciliation. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'etl', 'lab', 'reconciliation', 'first-party'],
        icon: 'arrow-left-right',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'etl' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'assessment',
        name: 'Document Assessment',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'Document type assessment: keyword-based detection for environmental documents with PT/EN support. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'assessment', 'document', 'detection', 'first-party'],
        icon: 'file-search',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'assessment' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'demo',
        name: 'Demo Mode — Cases',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'Demo mode: pre-loaded scenarios, guided cases and ticker for onboarding and showcases. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'demo', 'cases', 'onboarding', 'first-party'],
        icon: 'play-circle',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'demo' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'sharing',
        name: 'Resource Sharing',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'Resource sharing: org role hierarchy and action matrix (READ/WRITE/SHARE/DELETE) for granular access. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'sharing', 'rbac', 'access', 'first-party'],
        icon: 'share-2',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'sharing' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'symbologyEditor',
        name: 'Symbology Editor',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'Symbology profile editor: color, marker and line style overlay editor for visual profiles. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'symbology', 'editor', 'visual', 'first-party'],
        icon: 'palette',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'symbologyEditor' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'validationEngine',
        name: 'Domain Validator Engine',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'Generic domain validator engine: 3-level validation with JSON domain loader for custom rules. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'validation', 'engine', 'rules', 'first-party'],
        icon: 'check-square',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'validationEngine' },
    },
    {
        ecbytsLibrary: '1.0.0',
        id: 'presentation',
        name: 'Presentation Mode',
        version: '1.0.0',
        author: { name: 'ecbyts' },
        description:
            'Presentation Mode: step model FSM, recorder/player, audio, captions and video export. First-party capability module — toggle in the Library Hub.',
        license: 'AGPL-3.0-only',
        tags: ['capability', 'presentation', 'recorder', 'video', 'first-party'],
        icon: 'presentation',
        dependencies: [],
        kind: 'capability',
        contents: { capability: 'presentation' },
    },
];
