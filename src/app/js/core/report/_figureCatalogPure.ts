// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Canonical report figure catalog — pure logic (SPEC_REPORT_FIGURE_CATALOG DoD #1).
 *
 * Catalog of the 20 canonical figure-types required by CETESB DD 038/2017
 * and ABNT NBR 16434 for environmental investigation reports. Each entry
 * lists default layers, mandatory regulatory flag, valid filter dimensions
 * and a caption template (placeholder syntax {N}, {contaminante}, etc).
 *
 * Source of truth: `docs/specs/_archived/SPEC_REPORT_FIGURE_CATALOG_2026_05_29.md`
 *   (note: spec body is in features/ pre-archive; once arquivada this ref
 *   updates per Onda 27 pattern).
 *
 * Anti-requirements honoured (SPEC §5):
 *   - No visual config (paleta/style) — out of scope, lives elsewhere.
 *   - No multi-caption per figure — 1 canonical caption per figure-type.
 *   - No multi-figure composition — orthogonal layout responsibility.
 *
 * Tests live in `tests/figure-catalog-pure.test.mjs`.
 */

export type FigureCategory =
    | 'localizacao_entorno'
    | 'planta_site'
    | 'rede_monitoramento'
    | 'plumas_contaminacao'
    | 'geologia_hidrogeologia'
    | 'risco_receptores';

export type FigureFilterDim =
    | 'familia'
    | 'campanha'
    | 'area'
    | 'matriz'
    | 'contaminante'
    | 'compliance'
    | 'raio'
    | 'linha_corte'
    | 'viewport'
    | 'cenario_risco';

export type FigureMandatory = 'DD_038_OBRIG' | 'DD_038_REC' | 'OPTIONAL';

export interface FigureTypeEntry {
    readonly id: string;
    readonly category: FigureCategory;
    readonly title_pt: string;
    readonly title_en: string;
    readonly defaultLayers: ReadonlyArray<string>;
    readonly mandatory: FigureMandatory;
    readonly requiredFilters: ReadonlyArray<FigureFilterDim>;
    readonly optionalFilters: ReadonlyArray<FigureFilterDim>;
    /** Caption template — placeholders `{N}` `{contaminante}` `{campanha}` `{citacao}`. */
    readonly captionTemplate: string;
}

const RAW_CATALOG: ReadonlyArray<FigureTypeEntry> = [
    // ── A. Localização & Entorno ───────────────────────────────────────────────
    {
        id: 'A1',
        category: 'localizacao_entorno',
        title_pt: 'Mapa de localização',
        title_en: 'Site location map',
        defaultLayers: ['basemap', 'boundary'],
        mandatory: 'DD_038_REC',
        requiredFilters: [],
        optionalFilters: [],
        captionTemplate: 'Figura {N}. Mapa de localização do empreendimento. {citacao}',
    },
    {
        id: 'A2',
        category: 'localizacao_entorno',
        title_pt: 'Mapa de entorno raio 500m (AVZ/GAC)',
        title_en: 'Surroundings map (500 m radius / GAC zone)',
        defaultLayers: ['boundary', 'raio500m', 'uso_solo', 'receptores_sensiveis'],
        mandatory: 'DD_038_OBRIG',
        requiredFilters: [],
        optionalFilters: ['raio'],
        captionTemplate: 'Figura {N}. Mapa do entorno num raio de 500 m do empreendimento (AVZ/GAC). {citacao}',
    },
    {
        id: 'A3',
        category: 'localizacao_entorno',
        title_pt: 'Mapa de receptores potenciais',
        title_en: 'Potential receptors map',
        defaultLayers: ['raio500m', 'pocos_particulares', 'escolas', 'hospitais', 'app'],
        mandatory: 'DD_038_REC',
        requiredFilters: [],
        optionalFilters: ['raio', 'familia'],
        captionTemplate: 'Figura {N}. Receptores sensíveis no entorno. {citacao}',
    },

    // ── B. Planta do site ──────────────────────────────────────────────────────
    {
        id: 'B1',
        category: 'planta_site',
        title_pt: 'Planta geral',
        title_en: 'General site plan',
        defaultLayers: ['boundary', 'buildings', 'tanks', 'infrastructure', 'areas'],
        mandatory: 'DD_038_REC',
        requiredFilters: [],
        optionalFilters: ['area'],
        captionTemplate: 'Figura {N}. Planta geral do empreendimento. {citacao}',
    },
    {
        id: 'B2',
        category: 'planta_site',
        title_pt: 'Planta por sub-área',
        title_en: 'Sub-area plan',
        defaultLayers: ['boundary_subarea', 'buildings', 'tanks', 'infrastructure'],
        mandatory: 'OPTIONAL',
        requiredFilters: ['area'],
        optionalFilters: [],
        captionTemplate: 'Figura {N}. Planta da sub-área {area}. {citacao}',
    },
    {
        id: 'B3',
        category: 'planta_site',
        title_pt: 'Planta de fontes potenciais',
        title_en: 'Potential sources plan',
        defaultLayers: ['boundary', 'tanks', 'emission_source', 'waste_stream', 'buildings_risco'],
        mandatory: 'DD_038_REC',
        requiredFilters: [],
        optionalFilters: ['familia', 'area'],
        captionTemplate: 'Figura {N}. Fontes potenciais de contaminação identificadas. {citacao}',
    },

    // ── C. Rede de monitoramento ───────────────────────────────────────────────
    {
        id: 'C1',
        category: 'rede_monitoramento',
        title_pt: 'Rede de monitoramento completa',
        title_en: 'Complete monitoring network',
        defaultLayers: ['boundary', 'wells', 'wells_ids', 'matriz'],
        mandatory: 'DD_038_OBRIG',
        requiredFilters: [],
        optionalFilters: [],
        captionTemplate: 'Figura {N}. Rede de monitoramento — todos os poços. {citacao}',
    },
    {
        id: 'C2',
        category: 'rede_monitoramento',
        title_pt: 'Rede por campanha',
        title_en: 'Monitoring network by campaign',
        defaultLayers: ['boundary', 'wells_campanha'],
        mandatory: 'DD_038_REC',
        requiredFilters: ['campanha'],
        optionalFilters: [],
        captionTemplate: 'Figura {N}. Rede amostrada na campanha {campanha}. {citacao}',
    },
    {
        id: 'C3',
        category: 'rede_monitoramento',
        title_pt: 'Rede por matriz',
        title_en: 'Monitoring network by matrix',
        defaultLayers: ['boundary', 'wells_matriz'],
        mandatory: 'OPTIONAL',
        requiredFilters: ['matriz'],
        optionalFilters: [],
        captionTemplate: 'Figura {N}. Rede de monitoramento para a matriz {matriz}. {citacao}',
    },
    {
        id: 'C4',
        category: 'rede_monitoramento',
        title_pt: 'Rede por compliance',
        title_en: 'Monitoring network by compliance',
        defaultLayers: ['boundary', 'wells_colored_by_compliance', 'tabela_inset'],
        mandatory: 'DD_038_REC',
        requiredFilters: ['compliance', 'contaminante'],
        optionalFilters: [],
        captionTemplate: 'Figura {N}. Conformidade com VI/VP/VR para {contaminante}. {citacao}',
    },

    // ── D. Plumas de contaminação ──────────────────────────────────────────────
    {
        id: 'D1',
        category: 'plumas_contaminacao',
        title_pt: 'Pluma por contaminante',
        title_en: 'Plume by contaminant',
        defaultLayers: ['boundary', 'pluma_contaminante', 'wells'],
        mandatory: 'DD_038_OBRIG',
        requiredFilters: ['contaminante'],
        optionalFilters: [],
        captionTemplate: 'Figura {N}. Pluma de {contaminante}. {citacao}',
    },
    {
        id: 'D2',
        category: 'plumas_contaminacao',
        title_pt: 'Pluma por matriz × contaminante',
        title_en: 'Plume by matrix × contaminant',
        defaultLayers: ['boundary', 'pluma_matriz_contaminante', 'wells'],
        mandatory: 'DD_038_REC',
        requiredFilters: ['matriz', 'contaminante'],
        optionalFilters: [],
        captionTemplate: 'Figura {N}. Pluma de {contaminante} na matriz {matriz}. {citacao}',
    },
    {
        id: 'D3',
        category: 'plumas_contaminacao',
        title_pt: 'Pluma sobreposta com fontes',
        title_en: 'Plume overlay with sources',
        defaultLayers: ['boundary', 'pluma', 'tanks', 'emission_source'],
        mandatory: 'OPTIONAL',
        requiredFilters: ['contaminante'],
        optionalFilters: [],
        captionTemplate: 'Figura {N}. Pluma de {contaminante} sobreposta às fontes potenciais. {citacao}',
    },
    {
        id: 'D4',
        category: 'plumas_contaminacao',
        title_pt: 'Evolução temporal de pluma',
        title_en: 'Plume temporal evolution',
        defaultLayers: ['boundary', 'pluma_campanha_N1', 'pluma_campanha_N2'],
        mandatory: 'OPTIONAL',
        requiredFilters: ['contaminante', 'campanha'],
        optionalFilters: [],
        captionTemplate: 'Figura {N}. Evolução temporal da pluma de {contaminante} entre campanhas {campanha}. {citacao}',
    },

    // ── E. Geologia / Hidrogeologia ────────────────────────────────────────────
    {
        id: 'E1',
        category: 'geologia_hidrogeologia',
        title_pt: 'Mapa pedológico/geológico',
        title_en: 'Pedological/geological map',
        defaultLayers: ['basemap_geologico', 'boundary', 'faults'],
        mandatory: 'DD_038_REC',
        requiredFilters: [],
        optionalFilters: [],
        captionTemplate: 'Figura {N}. Mapa geológico/pedológico da área. {citacao}',
    },
    {
        id: 'E2',
        category: 'geologia_hidrogeologia',
        title_pt: 'Mapa potenciométrico',
        title_en: 'Potentiometric map',
        defaultLayers: ['boundary', 'wells', 'water_table_isolines', 'flow_arrows'],
        mandatory: 'DD_038_OBRIG',
        requiredFilters: ['campanha'],
        optionalFilters: [],
        captionTemplate: 'Figura {N}. Mapa potenciométrico — campanha {campanha}. {citacao}',
    },
    {
        id: 'E3',
        category: 'geologia_hidrogeologia',
        title_pt: 'Seção transversal A-A\'',
        title_en: 'Cross-section A-A\'',
        defaultLayers: ['strata', 'wells_section', 'plumas_section'],
        mandatory: 'DD_038_REC',
        requiredFilters: ['linha_corte'],
        optionalFilters: [],
        captionTemplate: 'Figura {N}. Seção transversal {linha_corte}. {citacao}',
    },
    {
        id: 'E4',
        category: 'geologia_hidrogeologia',
        title_pt: 'Modelo conceitual 3D',
        title_en: '3D conceptual model',
        defaultLayers: ['boundary', 'plumas', 'wells', 'strata', 'sources'],
        mandatory: 'OPTIONAL',
        requiredFilters: ['viewport'],
        optionalFilters: [],
        captionTemplate: 'Figura {N}. Modelo conceitual 3D (vista {viewport}). {citacao}',
    },

    // ── F. Risco & Receptores (opcional, Fase 2) ───────────────────────────────
    {
        id: 'F1',
        category: 'risco_receptores',
        title_pt: 'Mapa de risco',
        title_en: 'Risk zoning map',
        defaultLayers: ['zonas_exposicao', 'receptores', 'plumas'],
        mandatory: 'OPTIONAL',
        requiredFilters: ['cenario_risco'],
        optionalFilters: [],
        captionTemplate: 'Figura {N}. Mapa de risco — cenário {cenario_risco}. {citacao}',
    },
    {
        id: 'F2',
        category: 'risco_receptores',
        title_pt: 'Receptores × plumas overlay',
        title_en: 'Receptors × plumes overlay',
        defaultLayers: ['receptores', 'plumas'],
        mandatory: 'OPTIONAL',
        requiredFilters: ['contaminante', 'cenario_risco'],
        optionalFilters: [],
        captionTemplate: 'Figura {N}. Receptores expostos a {contaminante} no cenário {cenario_risco}. {citacao}',
    },
];

export const FIGURE_CATALOG: ReadonlyArray<Readonly<FigureTypeEntry>> = Object.freeze(
    RAW_CATALOG.map((e) =>
        Object.freeze({
            ...e,
            defaultLayers: Object.freeze([...e.defaultLayers]),
            requiredFilters: Object.freeze([...e.requiredFilters]),
            optionalFilters: Object.freeze([...e.optionalFilters]),
        }) as FigureTypeEntry,
    ),
);

/** Lookup by id (case-sensitive). Returns undefined when not found. */
export function getFigureType(id: string): FigureTypeEntry | undefined {
    if (typeof id !== 'string' || id.length === 0) return undefined;
    return FIGURE_CATALOG.find((e) => e.id === id);
}

/** Subset filtered by mandatory flag (DD_038_OBRIG entries only). */
export function getMandatoryFigureTypes(): ReadonlyArray<FigureTypeEntry> {
    return FIGURE_CATALOG.filter((e) => e.mandatory === 'DD_038_OBRIG');
}

/** Subset filtered by category. */
export function getFigureTypesByCategory(
    category: FigureCategory,
): ReadonlyArray<FigureTypeEntry> {
    return FIGURE_CATALOG.filter((e) => e.category === category);
}

/** All categories (frozen). */
export function listFigureCategories(): ReadonlyArray<FigureCategory> {
    return Object.freeze([
        'localizacao_entorno',
        'planta_site',
        'rede_monitoramento',
        'plumas_contaminacao',
        'geologia_hidrogeologia',
        'risco_receptores',
    ]);
}

/** Counts grouped by mandatory flag — useful for audit dashboard. */
export function countByMandatory(): Readonly<Record<FigureMandatory, number>> {
    const out: Record<FigureMandatory, number> = {
        DD_038_OBRIG: 0,
        DD_038_REC: 0,
        OPTIONAL: 0,
    };
    for (const e of FIGURE_CATALOG) out[e.mandatory]++;
    return Object.freeze(out);
}

/**
 * Resolve caption template with subset values. Replaces {placeholder} tokens.
 * Unknown placeholders are left as-is so the caller can detect them.
 */
export function resolveCaption(
    template: string,
    subset: Readonly<Record<string, string | number | undefined>>,
): string {
    if (typeof template !== 'string') return '';
    if (!subset || typeof subset !== 'object') return template;
    return template.replace(/\{([a-zA-Z_]+)\}/g, (match, key) => {
        const value = subset[key];
        if (value === undefined || value === null) return match;
        return String(value);
    });
}
