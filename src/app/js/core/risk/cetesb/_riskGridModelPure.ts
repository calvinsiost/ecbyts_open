// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// CETESB-RISK-001 UI-A pure-logic — modelo de grid SQI × via canônico.
//
// Mirror das tabelas das planilhas CETESB v4.00:
//   - Aba PDE (input)       — N SQIs × {soil_sup, soil_subsup, AS} mg/kg|mg/L
//   - Aba CMA Solo Cr/Ad    — N SQIs × {vapor, dermal, ingestion, vegetables, ambient_air, indoor_air} mg/kg
//   - Aba CMA AS Cr/Ad      — N SQIs × {receptor_4_vias + source_4_vias} mg/L
//   - Aba CMA AR Cr-Ad      — N SQIs × {ambient, indoor} µg/m³
//
// API pure-logic, sem DOM. Caller (riskAssessmentPanel) constroi <table> com
// HTML escape downstream usando este modelo.
//
// PRIOR ART (protocolo 2026-05-31):
//   - src/app/js/core/risk/cetesb/index.ts (computeRiskAndCma)
//   - src/app/js/core/risk/cetesb/_riskCatalogPure.ts (ScenarioId)
//   - tests/fixtures/cetesb-cma-column-map-4scenarios.json (column-map oficial)
//
// SPEC: docs/specs/features/SPEC_CETESB_RISK_ASSESSMENT.md (paridade UI Excel)

import type { ScenarioId } from './_riskCatalogPure.js';

// ===========================================================================
// Tipos canônicos
// ===========================================================================

export type GridMatrix = 'soil_sup' | 'soil_subsup' | 'groundwater' | 'air';
export type GridUnit = 'mg/kg' | 'mg/L' | 'µg/m³';
export type GridSection =
    | 'PDE_INPUT'
    | 'CMA_SOLO_CR'
    | 'CMA_SOLO_AD'
    | 'CMA_SOLO'
    | 'CMA_AS_CR'
    | 'CMA_AS_AD'
    | 'CMA_AS'
    | 'CMA_AR_CR_AD'
    | 'CMA_AR';

/** Coluna do grid — espelha column-map Sub-2.4.1. */
export interface GridColumn {
    /** Id estável (pathway canônico ou "input_*"). */
    readonly id: string;
    /** Label legível (pt-BR). */
    readonly label: string;
    /** Unidade (string explícita, não inferir). */
    readonly unit: GridUnit;
    /** Editável (true para PDE_INPUT, false para outputs CMA). */
    readonly editable: boolean;
}

/** Linha do grid — uma SQI. */
export interface GridRow {
    readonly cas: string;
    readonly name: string;
    /** Grupo químico (BTEX, PAH, Metal, etc.) — para coloração visual. */
    readonly group: string;
}

/** Célula do grid. */
export interface GridCell {
    readonly rowCas: string;
    readonly columnId: string;
    /** Valor numérico (null se não computado/inserido). */
    readonly value: number | null;
    /** Compliance flag — para CMA output (verde/amarelo/vermelho). */
    readonly compliance?: 'ok' | 'monitoring' | 'exceeded' | 'na';
}

/** Modelo completo de uma seção (PDE input OU CMA output). */
export interface GridSectionModel {
    readonly section: GridSection;
    readonly title: string;
    readonly columns: ReadonlyArray<GridColumn>;
    readonly rows: ReadonlyArray<GridRow>;
    readonly cells: ReadonlyArray<GridCell>;
    /** Cenário aplicável (null para PDE input que é cross-cenário). */
    readonly scenario: ScenarioId | null;
}

// ===========================================================================
// Catálogo de colunas canônicas — espelha column-map Sub-2.4.1
// ===========================================================================

const COLUMNS_PDE_INPUT: ReadonlyArray<GridColumn> = Object.freeze([
    Object.freeze({ id: 'input_soil_sup', label: 'Solo superficial', unit: 'mg/kg' as GridUnit, editable: true }),
    Object.freeze({ id: 'input_soil_subsup', label: 'Solo subsuperficial', unit: 'mg/kg' as GridUnit, editable: true }),
    Object.freeze({ id: 'input_groundwater', label: 'Água subterrânea', unit: 'mg/L' as GridUnit, editable: true }),
]);

/** CMA Solo residencial (7 colunas). */
const COLUMNS_CMA_SOLO_RES: ReadonlyArray<GridColumn> = Object.freeze([
    Object.freeze({ id: 'inhalation_vapor', label: 'Inalação vapor', unit: 'mg/kg' as GridUnit, editable: false }),
    Object.freeze({ id: 'dermal_contact', label: 'Contato dérmico', unit: 'mg/kg' as GridUnit, editable: false }),
    Object.freeze({ id: 'ingestion', label: 'Ingestão', unit: 'mg/kg' as GridUnit, editable: false }),
    Object.freeze({ id: 'ingestion_vegetables', label: 'Ingestão vegetais', unit: 'mg/kg' as GridUnit, editable: false }),
    Object.freeze({ id: 'inhalation_ambient_air', label: 'Ar ambiente', unit: 'mg/kg' as GridUnit, editable: false }),
    Object.freeze({ id: 'inhalation_indoor_air', label: 'Ar indoor', unit: 'mg/kg' as GridUnit, editable: false }),
]);

/** CMA Solo trabalhador (8 colunas — particulate + metallic/organic split). */
const COLUMNS_CMA_SOLO_TRAB: ReadonlyArray<GridColumn> = Object.freeze([
    Object.freeze({ id: 'inhalation_vapor', label: 'Inalação vapor', unit: 'mg/kg' as GridUnit, editable: false }),
    Object.freeze({ id: 'inhalation_particulate', label: 'Inalação particulado', unit: 'mg/kg' as GridUnit, editable: false }),
    Object.freeze({ id: 'dermal_contact', label: 'Contato dérmico', unit: 'mg/kg' as GridUnit, editable: false }),
    Object.freeze({ id: 'ingestion', label: 'Ingestão', unit: 'mg/kg' as GridUnit, editable: false }),
    Object.freeze({ id: 'ingestion_metallic', label: 'Ingestão metais', unit: 'mg/kg' as GridUnit, editable: false }),
    Object.freeze({ id: 'ingestion_organic', label: 'Ingestão orgânicos', unit: 'mg/kg' as GridUnit, editable: false }),
    Object.freeze({ id: 'inhalation_ambient_air', label: 'Ar ambiente', unit: 'mg/kg' as GridUnit, editable: false }),
    Object.freeze({ id: 'inhalation_indoor_air', label: 'Ar indoor', unit: 'mg/kg' as GridUnit, editable: false }),
]);

/** CMA AS (8 colunas — 4 receptor + 4 fonte). */
const COLUMNS_CMA_AS: ReadonlyArray<GridColumn> = Object.freeze([
    Object.freeze({ id: 'inhalation_ambient_air', label: 'Ar ambiente (recept)', unit: 'mg/L' as GridUnit, editable: false }),
    Object.freeze({ id: 'inhalation_indoor_air', label: 'Ar indoor (recept)', unit: 'mg/L' as GridUnit, editable: false }),
    Object.freeze({ id: 'dermal_contact', label: 'Dérmico (recept)', unit: 'mg/L' as GridUnit, editable: false }),
    Object.freeze({ id: 'ingestion', label: 'Ingestão (recept)', unit: 'mg/L' as GridUnit, editable: false }),
    Object.freeze({ id: 'inhalation_ambient_air_source', label: 'Ar ambiente (fonte)', unit: 'mg/L' as GridUnit, editable: false }),
    Object.freeze({ id: 'inhalation_indoor_air_source', label: 'Ar indoor (fonte)', unit: 'mg/L' as GridUnit, editable: false }),
    Object.freeze({ id: 'dermal_contact_source', label: 'Dérmico (fonte)', unit: 'mg/L' as GridUnit, editable: false }),
    Object.freeze({ id: 'ingestion_source', label: 'Ingestão (fonte)', unit: 'mg/L' as GridUnit, editable: false }),
]);

/** CMA AR (2 colunas — ambient + source). */
const COLUMNS_CMA_AR: ReadonlyArray<GridColumn> = Object.freeze([
    Object.freeze({ id: 'inhalation_air', label: 'Ar (receptor)', unit: 'µg/m³' as GridUnit, editable: false }),
    Object.freeze({ id: 'inhalation_air_source', label: 'Ar (fonte)', unit: 'µg/m³' as GridUnit, editable: false }),
]);

// ===========================================================================
// API pública
// ===========================================================================

/** Retorna colunas canônicas por seção × cenário. */
export function getColumnsForSection(section: GridSection, _scenario: ScenarioId | null): ReadonlyArray<GridColumn> {
    if (section === 'PDE_INPUT') return COLUMNS_PDE_INPUT;
    if (section === 'CMA_SOLO_CR' || section === 'CMA_SOLO_AD') return COLUMNS_CMA_SOLO_RES;
    if (section === 'CMA_SOLO') return COLUMNS_CMA_SOLO_TRAB;
    if (section === 'CMA_AS_CR' || section === 'CMA_AS_AD' || section === 'CMA_AS') return COLUMNS_CMA_AS;
    if (section === 'CMA_AR_CR_AD' || section === 'CMA_AR') return COLUMNS_CMA_AR;
    return Object.freeze([]);
}

/** Lista de seções aplicáveis para um cenário. Espelha estrutura abas planilha. */
export function getSectionsForScenario(scenario: ScenarioId): ReadonlyArray<GridSection> {
    if (scenario === 'RES_URB' || scenario === 'RES_RUR') {
        return Object.freeze([
            'PDE_INPUT' as GridSection,
            'CMA_SOLO_CR' as GridSection, 'CMA_SOLO_AD' as GridSection,
            'CMA_AS_CR' as GridSection, 'CMA_AS_AD' as GridSection,
            'CMA_AR_CR_AD' as GridSection,
        ]);
    }
    // TRAB_COM_IND / TRAB_OBRA_CIV — só adulto
    return Object.freeze([
        'PDE_INPUT' as GridSection,
        'CMA_SOLO' as GridSection,
        'CMA_AS' as GridSection,
        'CMA_AR' as GridSection,
    ]);
}

/** Título visual de uma seção (pt-BR). */
export function getSectionTitle(section: GridSection): string {
    const titles: Record<GridSection, string> = {
        PDE_INPUT: 'Concentrações de entrada (PDE)',
        CMA_SOLO_CR: 'CMA Solo — Criança',
        CMA_SOLO_AD: 'CMA Solo — Adulto',
        CMA_SOLO: 'CMA Solo — Adulto',
        CMA_AS_CR: 'CMA Água Subterrânea — Criança',
        CMA_AS_AD: 'CMA Água Subterrânea — Adulto',
        CMA_AS: 'CMA Água Subterrânea — Adulto',
        CMA_AR_CR_AD: 'CMA Ar Ambiente — Criança/Adulto',
        CMA_AR: 'CMA Ar Ambiente — Adulto',
    };
    return titles[section] || section;
}

/** Constrói modelo de seção a partir de rows + (opcional) cell-data. */
export function buildSectionModel(
    section: GridSection,
    scenario: ScenarioId | null,
    rows: ReadonlyArray<GridRow>,
    cellsByCasAndColumn?: ReadonlyMap<string, number | null>,
): GridSectionModel {
    const columns = getColumnsForSection(section, scenario);
    const cells: GridCell[] = [];
    for (const row of rows) {
        for (const col of columns) {
            const key = `${row.cas}|${col.id}`;
            const value = cellsByCasAndColumn?.get(key) ?? null;
            cells.push(Object.freeze({ rowCas: row.cas, columnId: col.id, value }));
        }
    }
    return Object.freeze({
        section,
        title: getSectionTitle(section),
        columns,
        rows: Object.freeze([...rows]),
        cells: Object.freeze(cells),
        scenario,
    });
}

/** Computa célula veredict (compliance flag) — usado em rendering output CMA. */
export function classifyCellCompliance(
    cmaValue: number | null,
    observedConc: number | null,
): GridCell['compliance'] {
    if (cmaValue === null || observedConc === null) return 'na';
    if (!Number.isFinite(cmaValue) || !Number.isFinite(observedConc)) return 'na';
    if (observedConc <= cmaValue * 0.5) return 'ok';
    if (observedConc <= cmaValue) return 'monitoring';
    return 'exceeded';
}

/** Constantes públicas para auditoria. */
export const GRID_MODEL_META = Object.freeze({
    columnsCountByScenarioType: Object.freeze({
        residencial_solo: COLUMNS_CMA_SOLO_RES.length,
        trabalhador_solo: COLUMNS_CMA_SOLO_TRAB.length,
        cma_as: COLUMNS_CMA_AS.length,
        cma_ar: COLUMNS_CMA_AR.length,
        pde_input: COLUMNS_PDE_INPUT.length,
    }),
});
