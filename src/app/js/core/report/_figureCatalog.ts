// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// REPORT-FIG-CAT-001 F1 — Catálogo canônico dos 20 figure-types do relatório.
//
// Spec: docs/specs/features/SPEC_REPORT_FIGURE_CATALOG_2026_05_29.md
// Padrões: CETESB DD 038/2017 IC + ABNT NBR 16434 + Manual ABNT/USP.
//
// Pure-logic: Object.freeze, sem DOM, sem IO. Consumido por figureSelectModal
// e _reportFigureInsert.
//
// SUBSET-FILTERS: 7 dimensões opcionais por figura — família, campanha, área,
// matriz, contaminante, compliance, raio. Cada figure-type declara quais
// filtros são `obrigatórios` (devem ser preenchidos) vs `opcionais`.

export type FigureCategoryId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export type SubsetFilterDim =
    | 'familia'
    | 'campanha'
    | 'area'
    | 'matriz'
    | 'contaminante'
    | 'compliance'
    | 'raio'
    | 'viewport'
    | 'linha_corte'
    | 'cenario_risco'
    | 'familia_receptor';

export type ObrigatoriedadeRegulatoria = 'DD-038-obrig' | 'DD-038-sugerido' | 'ABNT' | 'opcional';

export interface FigureType {
    /** ID estável (A1, B2, ...) — NUNCA renomear sem ADR. */
    readonly id: string;
    /** Categoria letra (A=localização, B=planta, C=rede, D=plumas, E=geologia, F=risco). */
    readonly category: FigureCategoryId;
    /** Título visível (pt-BR). */
    readonly title: string;
    /** Layers default que compõem o template visual. */
    readonly defaultLayers: ReadonlyArray<string>;
    /** Obrigatoriedade regulatória. */
    readonly obrig: ObrigatoriedadeRegulatoria;
    /** Filtros obrigatórios (devem ser preenchidos antes de renderizar). */
    readonly requiredFilters: ReadonlyArray<SubsetFilterDim>;
    /** Filtros opcionais válidos para esta figura. */
    readonly optionalFilters: ReadonlyArray<SubsetFilterDim>;
    /** Template de caption com placeholders {N}, {contaminante}, {campanha}, {citacao}. */
    readonly captionTemplate: string;
}

// ===========================================================================
// CATÁLOGO — 20 figure-types em 6 categorias
// ===========================================================================

export const FIGURE_CATALOG: ReadonlyArray<FigureType> = Object.freeze([
    // Categoria A — Localização & Entorno
    Object.freeze({
        id: 'A1',
        category: 'A' as FigureCategoryId,
        title: 'Mapa de localização',
        defaultLayers: Object.freeze(['basemap', 'boundary']),
        obrig: 'DD-038-sugerido' as ObrigatoriedadeRegulatoria,
        requiredFilters: Object.freeze([]),
        optionalFilters: Object.freeze([]),
        captionTemplate: 'Figura {N} — Mapa de localização do site. Fonte: {citacao}.',
    }),
    Object.freeze({
        id: 'A2',
        category: 'A' as FigureCategoryId,
        title: 'Mapa de entorno raio 500m (AVZ/GAC)',
        defaultLayers: Object.freeze(['basemap', 'boundary', 'raio500m', 'uso_solo', 'receptores_sensiveis']),
        obrig: 'DD-038-obrig' as ObrigatoriedadeRegulatoria,
        requiredFilters: Object.freeze([]),
        optionalFilters: Object.freeze(['raio']),
        captionTemplate: 'Figura {N} — Entorno — raio de 500 m (GAC, CETESB DD 038/2017).',
    }),
    Object.freeze({
        id: 'A3',
        category: 'A' as FigureCategoryId,
        title: 'Mapa de receptores potenciais',
        defaultLayers: Object.freeze(['raio500m', 'pocos_particulares', 'escolas', 'hospitais', 'app']),
        obrig: 'DD-038-sugerido' as ObrigatoriedadeRegulatoria,
        requiredFilters: Object.freeze([]),
        optionalFilters: Object.freeze(['raio', 'familia_receptor']),
        captionTemplate: 'Figura {N} — Receptores potenciais no raio de 500 m.',
    }),

    // Categoria B — Planta do site
    Object.freeze({
        id: 'B1',
        category: 'B' as FigureCategoryId,
        title: 'Planta geral',
        defaultLayers: Object.freeze(['boundary', 'buildings', 'tanks', 'infrastructure', 'areas']),
        obrig: 'DD-038-sugerido' as ObrigatoriedadeRegulatoria,
        requiredFilters: Object.freeze([]),
        optionalFilters: Object.freeze(['area']),
        captionTemplate: 'Figura {N} — Planta geral do site.',
    }),
    Object.freeze({
        id: 'B2',
        category: 'B' as FigureCategoryId,
        title: 'Planta por sub-área',
        defaultLayers: Object.freeze(['boundary_subarea', 'buildings', 'tanks', 'infrastructure']),
        obrig: 'opcional' as ObrigatoriedadeRegulatoria,
        requiredFilters: Object.freeze(['area']),
        optionalFilters: Object.freeze([]),
        captionTemplate: 'Figura {N} — Planta da sub-área {area}.',
    }),
    Object.freeze({
        id: 'B3',
        category: 'B' as FigureCategoryId,
        title: 'Planta de fontes potenciais',
        defaultLayers: Object.freeze(['tanks', 'emission_source', 'waste_stream', 'buildings_risco']),
        obrig: 'DD-038-sugerido' as ObrigatoriedadeRegulatoria,
        requiredFilters: Object.freeze([]),
        optionalFilters: Object.freeze(['familia', 'area']),
        captionTemplate: 'Figura {N} — Fontes potenciais de contaminação.',
    }),

    // Categoria C — Rede de monitoramento
    Object.freeze({
        id: 'C1',
        category: 'C' as FigureCategoryId,
        title: 'Rede de monitoramento completa',
        defaultLayers: Object.freeze(['boundary', 'wells_all', 'wells_ids', 'matriz_label']),
        obrig: 'DD-038-obrig' as ObrigatoriedadeRegulatoria,
        requiredFilters: Object.freeze([]),
        optionalFilters: Object.freeze([]),
        captionTemplate: 'Figura {N} — Rede de monitoramento. Total: {wellCount} poços.',
    }),
    Object.freeze({
        id: 'C2',
        category: 'C' as FigureCategoryId,
        title: 'Rede por campanha',
        defaultLayers: Object.freeze(['boundary', 'wells_campanha']),
        obrig: 'DD-038-sugerido' as ObrigatoriedadeRegulatoria,
        requiredFilters: Object.freeze(['campanha']),
        optionalFilters: Object.freeze([]),
        captionTemplate: 'Figura {N} — Rede amostrada na campanha {campanha}.',
    }),
    Object.freeze({
        id: 'C3',
        category: 'C' as FigureCategoryId,
        title: 'Rede por matriz',
        defaultLayers: Object.freeze(['boundary', 'wells_matriz']),
        obrig: 'opcional' as ObrigatoriedadeRegulatoria,
        requiredFilters: Object.freeze(['matriz']),
        optionalFilters: Object.freeze([]),
        captionTemplate: 'Figura {N} — Rede de monitoramento — matriz {matriz}.',
    }),
    Object.freeze({
        id: 'C4',
        category: 'C' as FigureCategoryId,
        title: 'Rede por compliance',
        defaultLayers: Object.freeze(['boundary', 'wells_compliance', 'compliance_table_inset']),
        obrig: 'DD-038-sugerido' as ObrigatoriedadeRegulatoria,
        requiredFilters: Object.freeze([]),
        optionalFilters: Object.freeze(['compliance', 'contaminante']),
        captionTemplate: 'Figura {N} — Rede classificada por compliance ({contaminante}).',
    }),

    // Categoria D — Plumas de contaminação
    Object.freeze({
        id: 'D1',
        category: 'D' as FigureCategoryId,
        title: 'Pluma por contaminante',
        defaultLayers: Object.freeze(['boundary', 'pluma', 'wells_rede']),
        obrig: 'DD-038-obrig' as ObrigatoriedadeRegulatoria,
        requiredFilters: Object.freeze(['contaminante']),
        optionalFilters: Object.freeze([]),
        captionTemplate: 'Figura {N} — Pluma de {contaminante}.',
    }),
    Object.freeze({
        id: 'D2',
        category: 'D' as FigureCategoryId,
        title: 'Pluma por matriz × contaminante',
        defaultLayers: Object.freeze(['boundary', 'pluma_matriz_cont', 'wells']),
        obrig: 'DD-038-sugerido' as ObrigatoriedadeRegulatoria,
        requiredFilters: Object.freeze(['matriz', 'contaminante']),
        optionalFilters: Object.freeze([]),
        captionTemplate: 'Figura {N} — Pluma de {contaminante} em {matriz}.',
    }),
    Object.freeze({
        id: 'D3',
        category: 'D' as FigureCategoryId,
        title: 'Pluma sobreposta com fontes',
        defaultLayers: Object.freeze(['pluma', 'tanks', 'emission_source']),
        obrig: 'opcional' as ObrigatoriedadeRegulatoria,
        requiredFilters: Object.freeze(['contaminante']),
        optionalFilters: Object.freeze([]),
        captionTemplate: 'Figura {N} — Pluma de {contaminante} sobreposta com fontes potenciais.',
    }),
    Object.freeze({
        id: 'D4',
        category: 'D' as FigureCategoryId,
        title: 'Evolução temporal de pluma',
        defaultLayers: Object.freeze(['pluma_n1', 'pluma_n2', 'overlay_transparencia']),
        obrig: 'opcional' as ObrigatoriedadeRegulatoria,
        requiredFilters: Object.freeze(['contaminante', 'campanha']),
        optionalFilters: Object.freeze([]),
        captionTemplate: 'Figura {N} — Evolução temporal da pluma de {contaminante}.',
    }),

    // Categoria E — Geologia / Hidrogeologia
    Object.freeze({
        id: 'E1',
        category: 'E' as FigureCategoryId,
        title: 'Mapa pedológico/geológico',
        defaultLayers: Object.freeze(['basemap_geologico_ibge', 'boundary', 'faults']),
        obrig: 'DD-038-sugerido' as ObrigatoriedadeRegulatoria,
        requiredFilters: Object.freeze([]),
        optionalFilters: Object.freeze([]),
        captionTemplate: 'Figura {N} — Contexto geológico. Fonte: IBGE.',
    }),
    Object.freeze({
        id: 'E2',
        category: 'E' as FigureCategoryId,
        title: 'Mapa potentiométrico',
        defaultLayers: Object.freeze(['wells', 'isolinhas_water_table', 'setas_fluxo']),
        obrig: 'DD-038-obrig' as ObrigatoriedadeRegulatoria,
        requiredFilters: Object.freeze([]),
        optionalFilters: Object.freeze(['campanha']),
        captionTemplate: 'Figura {N} — Mapa potentiométrico (campanha {campanha}).',
    }),
    Object.freeze({
        id: 'E3',
        category: 'E' as FigureCategoryId,
        title: 'Seção transversal A-A\'',
        defaultLayers: Object.freeze(['strata', 'wells_corte', 'plumas_corte']),
        obrig: 'DD-038-sugerido' as ObrigatoriedadeRegulatoria,
        requiredFilters: Object.freeze(['linha_corte']),
        optionalFilters: Object.freeze([]),
        captionTemplate: 'Figura {N} — Seção transversal A-A\'.',
    }),
    Object.freeze({
        id: 'E4',
        category: 'E' as FigureCategoryId,
        title: 'Modelo conceitual 3D',
        defaultLayers: Object.freeze(['boundary', 'plumas', 'wells', 'strata', 'fontes']),
        obrig: 'opcional' as ObrigatoriedadeRegulatoria,
        requiredFilters: Object.freeze([]),
        optionalFilters: Object.freeze(['viewport']),
        captionTemplate: 'Figura {N} — Modelo conceitual 3D do site.',
    }),

    // Categoria F — Risco & Receptores (opcional, fase 2)
    Object.freeze({
        id: 'F1',
        category: 'F' as FigureCategoryId,
        title: 'Mapa de risco',
        defaultLayers: Object.freeze(['zonas_exposicao', 'receptores', 'plumas']),
        obrig: 'opcional' as ObrigatoriedadeRegulatoria,
        requiredFilters: Object.freeze(['cenario_risco']),
        optionalFilters: Object.freeze([]),
        captionTemplate: 'Figura {N} — Mapa de risco (cenário {cenario_risco}).',
    }),
    Object.freeze({
        id: 'F2',
        category: 'F' as FigureCategoryId,
        title: 'Receptores × plumas overlay',
        defaultLayers: Object.freeze(['receptores_classificados', 'plumas']),
        obrig: 'opcional' as ObrigatoriedadeRegulatoria,
        requiredFilters: Object.freeze([]),
        optionalFilters: Object.freeze(['contaminante', 'cenario_risco']),
        captionTemplate: 'Figura {N} — Receptores classificados por exposição.',
    }),
]) as ReadonlyArray<FigureType>;

// ===========================================================================
// Lookup helpers — O(1) via Map
// ===========================================================================

const CATALOG_MAP: ReadonlyMap<string, FigureType> = (() => {
    const m = new Map<string, FigureType>();
    for (const f of FIGURE_CATALOG) m.set(f.id, f);
    return m;
})();

/** Recupera figure-type por id. null se desconhecido. */
export function getFigureType(id: string): FigureType | null {
    if (typeof id !== 'string' || !id) return null;
    return CATALOG_MAP.get(id) || null;
}

/** Filtra por categoria (A/B/C/D/E/F). */
export function getFiguresByCategory(category: FigureCategoryId): ReadonlyArray<FigureType> {
    return Object.freeze(FIGURE_CATALOG.filter((f) => f.category === category));
}

/** Filtra obrigatórios CETESB DD 038/2017 (subset essencial). */
export function getObligatoryFigures(): ReadonlyArray<FigureType> {
    return Object.freeze(FIGURE_CATALOG.filter((f) => f.obrig === 'DD-038-obrig'));
}

/** Lista IDs (snapshot frozen). */
export function listFigureIds(): ReadonlyArray<string> {
    return Object.freeze(FIGURE_CATALOG.map((f) => f.id));
}

/** Validar se um subset preenche todos os requiredFilters de um figure-type. */
export function validateSubset(
    figureId: string,
    subset: Readonly<Partial<Record<SubsetFilterDim, unknown>>>,
): { valid: boolean; missing: ReadonlyArray<SubsetFilterDim> } {
    const f = getFigureType(figureId);
    if (!f) return Object.freeze({ valid: false, missing: Object.freeze([]) });
    const missing = f.requiredFilters.filter((dim) => subset[dim] === undefined || subset[dim] === null);
    return Object.freeze({
        valid: missing.length === 0,
        missing: Object.freeze(missing),
    });
}

export const FIGURE_CATALOG_META = Object.freeze({
    total: FIGURE_CATALOG.length,
    obligatoryCount: FIGURE_CATALOG.filter((f) => f.obrig === 'DD-038-obrig').length,
    categories: Object.freeze(['A', 'B', 'C', 'D', 'E', 'F']) as ReadonlyArray<FigureCategoryId>,
});
