// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   XLSX TEMPLATES — Definicoes de templates de exportacao
   ================================================================

   Cada template define um conjunto de planilhas (sheets) com
   colunas especificas mapeadas a campos do modelo ecbyts.

   A chave `nameKey` referencia uma string de traducao no i18n.
   A chave `enabled` controla se o template aparece ativo na UI.

   ================================================================ */

interface TemplateColumn {
    header: string;
    value: (...args: any[]) => any;
}

interface TemplateSheet {
    name: string;
    source:
        | 'elements'
        | 'campaigns'
        | 'observations'
        | 'meta'
        | 'ghgT1'
        | 'ghgT2'
        | 'ghgT3'
        | 'ghgT4'
        | 'ghgT5'
        | 'ghgT6'
        | 'ghgT7'
        | 'ghgT8';
    columns: TemplateColumn[];
}

interface XLSXTemplate {
    id: string;
    nameKey: string;
    descKey: string;
    enabled: boolean;
    sheets: TemplateSheet[];
}

/**
 * All available XLSX export templates.
 * Templates com enabled:false aparecem na UI como "(coming soon)".
 */
export const XLSX_TEMPLATES: Record<string, XLSXTemplate> = {
    'edd-br': {
        id: 'edd-br',
        nameKey: 'xlsxTemplateEddBrName',
        descKey: 'xlsxTemplateEddBrDesc',
        enabled: true,
        sheets: [
            {
                name: 'Locais',
                source: 'elements',
                columns: [
                    { header: 'cod_ponto', value: (el: any) => el.name || el.id },
                    { header: 'nome', value: (el: any) => el.name || '' },
                    { header: 'x', value: (el: any) => el.position?.x ?? '' },
                    { header: 'y', value: (el: any) => el.position?.y ?? '' },
                    { header: 'z', value: (el: any) => el.position?.z ?? '' },
                    { header: 'sistema_coordenadas', value: (el: any) => el.coordinateSystem || 'UTM' },
                    { header: 'zona_utm', value: (el: any) => el.utmZone || '' },
                    { header: 'hemisferio', value: (el: any) => el.hemisphere || 'S' },
                    { header: 'tipo', value: (el: any) => el.family || '' },
                ],
            },
            {
                name: 'Amostras',
                source: 'campaigns',
                columns: [
                    { header: 'cod_amostra', value: (c: any) => c.id },
                    { header: 'nome_campanha', value: (c: any) => c.name || c.id },
                    { header: 'data_inicio', value: (c: any) => c.startDate || c.date || '' },
                    { header: 'data_fim', value: (c: any) => c.endDate || c.date || '' },
                ],
            },
            {
                name: 'Resultados',
                source: 'observations',
                columns: [
                    { header: 'cod_ponto', value: (obs: any, el: any) => el.name || el.id },
                    { header: 'parametro', value: (obs: any) => obs.parameterId || '' },
                    { header: 'cas_number', value: (obs: any) => obs.casNumber || '' },
                    { header: 'resultado', value: (obs: any) => obs.value ?? '' },
                    { header: 'unidade', value: (obs: any) => obs.unit || '' },
                    { header: 'data_coleta', value: (obs: any) => obs.date || '' },
                    { header: 'campanha', value: (obs: any) => obs.campaignId || '' },
                ],
            },
        ],
    },

    ecbyts: {
        id: 'ecbyts',
        nameKey: 'xlsxTemplateEcbytsName',
        descKey: 'xlsxTemplateEcbytsDesc',
        enabled: true,
        sheets: [
            {
                name: 'Data',
                source: 'observations',
                columns: [
                    { header: 'elementId', value: (obs: any, el: any) => el.id },
                    { header: 'elementName', value: (obs: any, el: any) => el.name || '' },
                    {
                        header: 'elementType',
                        value: (obs: any, el: any) => el.family || '',
                    },
                    { header: 'x', value: (obs: any, el: any) => el.position?.x ?? '' },
                    { header: 'y', value: (obs: any, el: any) => el.position?.y ?? '' },
                    { header: 'z', value: (obs: any, el: any) => el.position?.z ?? '' },
                    { header: 'campaignId', value: (obs: any) => obs.campaignId || '' },
                    { header: 'date', value: (obs: any) => obs.date || '' },
                    { header: 'parameterId', value: (obs: any) => obs.parameterId || '' },
                    { header: 'casNumber', value: (obs: any) => obs.casNumber || '' },
                    { header: 'value', value: (obs: any) => obs.value ?? '' },
                    { header: 'unit', value: (obs: any) => obs.unit || '' },
                    { header: 'depth', value: (obs: any) => obs.depth ?? '' },
                    { header: 'matrix', value: (obs: any) => obs.matrix || '' },
                    { header: 'method', value: (obs: any) => obs.method || '' },
                    { header: 'lab', value: (obs: any) => obs.lab || '' },
                    { header: 'detectionLimit', value: (obs: any) => obs.detectionLimit ?? '' },
                    { header: 'qualifier', value: (obs: any) => obs.qualifier || '' },
                ],
            },
        ],
    },

    'edd-r2': {
        id: 'edd-r2',
        nameKey: 'xlsxTemplateEddR2Name',
        descKey: 'xlsxTemplateEddR2Desc',
        enabled: true,
        sheets: [
            {
                name: 'Location_v1',
                source: 'elements',
                columns: [
                    { header: 'sys_loc_code', value: (el: any) => el.id },
                    { header: 'loc_name', value: (el: any) => el.name || '' },
                    { header: 'loc_type', value: (el: any) => el.family || '' },
                    { header: 'x_coord', value: (el: any) => el.position?.x ?? '' },
                    { header: 'y_coord', value: (el: any) => el.position?.y ?? '' },
                    { header: 'z_coord', value: (el: any) => el.position?.z ?? '' },
                    { header: 'coord_system', value: (el: any) => el.coordinateSystem || 'WGS84' },
                ],
            },
            {
                name: 'Sample_v4',
                source: 'campaigns',
                columns: [
                    { header: 'sys_sample_code', value: (c: any) => c.id },
                    { header: 'sample_name', value: (c: any) => c.name || c.id },
                    { header: 'sample_date', value: (c: any) => c.startDate || c.date || '' },
                    { header: 'sample_end_date', value: (c: any) => c.endDate || '' },
                ],
            },
            {
                name: 'TestResultsQC_v4',
                source: 'observations',
                columns: [
                    { header: 'sys_loc_code', value: (obs: any, el: any) => el.id },
                    { header: 'sys_sample_code', value: (obs: any) => obs.campaignId || '' },
                    { header: 'cas_rn', value: (obs: any) => obs.casNumber || '' },
                    { header: 'chemical_name', value: (obs: any) => obs.parameterId || '' },
                    { header: 'result_value', value: (obs: any) => obs.value ?? '' },
                    { header: 'result_unit', value: (obs: any) => obs.unit || '' },
                    {
                        header: 'detect_flag',
                        value: (obs: any) => ((obs.qualifier as any) === '<' ? 'N' : 'Y'),
                    },
                    {
                        header: 'reporting_detection_limit',
                        value: (obs: any) => obs.detectionLimit ?? '',
                    },
                    { header: 'analysis_date', value: (obs: any) => obs.date || '' },
                    { header: 'lab_name', value: (obs: any) => obs.lab || '' },
                    { header: 'method', value: (obs: any) => obs.method || '' },
                    { header: 'matrix', value: (obs: any) => obs.matrix || '' },
                    { header: 'sample_depth', value: (obs: any) => obs.depth ?? '' },
                ],
            },
        ],
    },

    'ghg-protocol': {
        id: 'ghg-protocol',
        nameKey: 'xlsxTemplateGhgName',
        descKey: 'xlsxTemplateGhgDesc',
        enabled: true,
        // Aba Resumo oficial do Programa Brasileiro GHG Protocol v2026.
        // 9 sheets: Capa + T1..T8 (SPEC_GHG_PROTOCOL_INVENTARIO_RESUMO).
        // Source `meta` le model.ghg.coverPage / model.ghg.metadata.
        // Sources `ghgT1`..`ghgT8` leem model.ghg.t1_*..t8_*.
        // Quando model.ghg ausente, sheets ficam vazios (no crash).
        sheets: [
            // 1. Capa do inventario
            {
                name: 'Capa',
                source: 'meta',
                columns: [
                    { header: 'campo', value: (r: any) => r.campo },
                    { header: 'valor', value: (r: any) => r.valor },
                ],
            },
            // 2. T1 — Emissoes consolidadas por GEE x Escopo
            {
                name: 'T1_GEE_x_Escopos',
                source: 'ghgT1',
                columns: [
                    { header: 'gas', value: (r: any) => r.gas ?? '' },
                    { header: 'tonnes_scope1', value: (r: any) => r.tonnesScope1 ?? 0 },
                    { header: 'tonnes_scope2_loc', value: (r: any) => r.tonnesScope2Loc ?? 0 },
                    { header: 'tonnes_scope2_mb', value: (r: any) => r.tonnesScope2Mb ?? 0 },
                    { header: 'tonnes_scope3', value: (r: any) => r.tonnesScope3 ?? 0 },
                    { header: 'co2e_scope1', value: (r: any) => r.co2eScope1 ?? 0 },
                    { header: 'co2e_scope2_loc', value: (r: any) => r.co2eScope2Loc ?? 0 },
                    { header: 'co2e_scope2_mb', value: (r: any) => r.co2eScope2Mb ?? 0 },
                    { header: 'co2e_scope3', value: (r: any) => r.co2eScope3 ?? 0 },
                ],
            },
            // 3. T2 — Emissoes de CO2 biogenico (separadas)
            {
                name: 'T2_CO2_biogenico',
                source: 'ghgT2',
                columns: [
                    { header: 'fonte', value: (r: any) => r.source ?? '' },
                    { header: 'co2_biogenico_t', value: (r: any) => r.biogenicCo2t ?? 0 },
                    { header: 'observacao', value: (r: any) => r.note ?? '' },
                ],
            },
            // 4. T3 — Emissoes por categoria — Escopo 1
            {
                name: 'T3_Escopo1_categorias',
                source: 'ghgT3',
                columns: [
                    { header: 'categoria', value: (r: any) => r.category ?? '' },
                    { header: 'tco2e', value: (r: any) => r.tco2e ?? 0 },
                    { header: 'participacao_pct', value: (r: any) => r.share ?? 0 },
                    { header: 'num_fontes', value: (r: any) => r.sourceCount ?? 0 },
                ],
            },
            // 5. T4 — Emissoes por categoria — Escopo 2 (localizacao)
            {
                name: 'T4_Escopo2_loc_categorias',
                source: 'ghgT4',
                columns: [
                    { header: 'categoria', value: (r: any) => r.category ?? '' },
                    { header: 'tco2e', value: (r: any) => r.tco2e ?? 0 },
                    { header: 'participacao_pct', value: (r: any) => r.share ?? 0 },
                    { header: 'num_fontes', value: (r: any) => r.sourceCount ?? 0 },
                ],
            },
            // 6. T5 — Emissoes por categoria — Escopo 2 (escolha de compra)
            {
                name: 'T5_Escopo2_mb_categorias',
                source: 'ghgT5',
                columns: [
                    { header: 'categoria', value: (r: any) => r.category ?? '' },
                    { header: 'tco2e', value: (r: any) => r.tco2e ?? 0 },
                    { header: 'participacao_pct', value: (r: any) => r.share ?? 0 },
                    { header: 'num_fontes', value: (r: any) => r.sourceCount ?? 0 },
                ],
            },
            // 7. T6 — Emissoes por categoria — Escopo 3
            {
                name: 'T6_Escopo3_categorias',
                source: 'ghgT6',
                columns: [
                    { header: 'categoria', value: (r: any) => r.category ?? '' },
                    { header: 'tco2e', value: (r: any) => r.tco2e ?? 0 },
                    { header: 'participacao_pct', value: (r: any) => r.share ?? 0 },
                    { header: 'num_fontes', value: (r: any) => r.sourceCount ?? 0 },
                ],
            },
            // 8. T7 — Indicadores de intensidade
            {
                name: 'T7_Intensidade',
                source: 'ghgT7',
                columns: [
                    { header: 'denominador', value: (r: any) => r.denominator ?? '' },
                    { header: 'valor', value: (r: any) => r.value ?? 0 },
                    { header: 'unidade', value: (r: any) => r.unit ?? '' },
                    { header: 'tco2e_por_unidade', value: (r: any) => r.tco2ePerUnit ?? 0 },
                    { header: 'tendencia', value: (r: any) => r.trend ?? '' },
                ],
            },
            // 9. T8 — Comparativo ano-base x ano-corrente
            {
                name: 'T8_Ano_a_ano',
                source: 'ghgT8',
                columns: [
                    { header: 'metrica', value: (r: any) => r.metric ?? '' },
                    { header: 'ano_base', value: (r: any) => r.baselineValue ?? '' },
                    { header: 'ano_atual', value: (r: any) => r.currentValue ?? '' },
                    { header: 'delta_absoluto', value: (r: any) => r.absoluteDelta ?? '' },
                    { header: 'delta_pct', value: (r: any) => r.percentDelta ?? '' },
                ],
            },
        ],
    },

    generic: {
        id: 'generic',
        nameKey: 'xlsxTemplateGenericName',
        descKey: 'xlsxTemplateGenericDesc',
        enabled: true,
        sheets: [
            {
                name: 'Elements',
                source: 'elements',
                columns: [
                    { header: 'id', value: (el: any) => el.id },
                    { header: 'name', value: (el: any) => el.name || '' },
                    { header: 'family', value: (el: any) => el.family || '' },
                    { header: 'x', value: (el: any) => el.position?.x ?? '' },
                    { header: 'y', value: (el: any) => el.position?.y ?? '' },
                    { header: 'z', value: (el: any) => el.position?.z ?? '' },
                ],
            },
            {
                name: 'Observations',
                source: 'observations',
                columns: [
                    { header: 'element_id', value: (obs: any, el: any) => el.id },
                    { header: 'element_name', value: (obs: any, el: any) => el.name || '' },
                    { header: 'parameter', value: (obs: any) => obs.parameterId || '' },
                    { header: 'value', value: (obs: any) => obs.value ?? '' },
                    { header: 'unit', value: (obs: any) => obs.unit || '' },
                    { header: 'date', value: (obs: any) => obs.date || '' },
                    { header: 'campaign', value: (obs: any) => obs.campaignId || '' },
                    { header: 'depth', value: (obs: any) => obs.depth ?? '' },
                    { header: 'matrix', value: (obs: any) => obs.matrix || '' },
                ],
            },
            {
                name: 'Campaigns',
                source: 'campaigns',
                columns: [
                    { header: 'id', value: (c: any) => c.id },
                    { header: 'name', value: (c: any) => c.name || '' },
                    { header: 'start_date', value: (c: any) => c.startDate || c.date || '' },
                    { header: 'end_date', value: (c: any) => c.endDate || '' },
                ],
            },
        ],
    },

    /* ================================================================
       GHG SOURCE RESOLVERS — Suporte para template `ghg-protocol`.
       Permite que xlsx.js:_buildRows consulte rows derivadas de
       `model.ghg` (output de core/reports/ghgInventory.buildGhgInventory)
       sem o engine de export precisar conhecer a estrutura do report.
       Spec: SPEC_GHG_PROTOCOL_INVENTARIO_RESUMO §4.2 + F3 deliverable.
       ================================================================ */

    'ohs-aiha': {
        id: 'ohs-aiha',
        nameKey: 'xlsxTemplateOhsAihaName',
        descKey: 'xlsxTemplateOhsAihaDesc',
        enabled: false,
        sheets: [
            {
                name: 'Exposures',
                source: 'observations',
                columns: [
                    { header: 'worker_id', value: (obs: any, el: any) => el.id },
                    { header: 'worker_name', value: (obs: any, el: any) => el.name || '' },
                    { header: 'agent', value: (obs: any) => obs.parameterId || '' },
                    { header: 'exposure_value', value: (obs: any) => obs.value ?? '' },
                    { header: 'unit', value: (obs: any) => obs.unit || '' },
                    { header: 'date', value: (obs: any) => obs.date || '' },
                    { header: 'duration_hours', value: (obs: any) => obs.data?.duration ?? '' },
                    { header: 'oel', value: (obs: any) => obs.data?.oel ?? '' },
                ],
            },
            {
                name: 'Workers',
                source: 'elements',
                columns: [
                    { header: 'worker_id', value: (el: any) => el.id },
                    { header: 'worker_name', value: (el: any) => el.name || '' },
                    { header: 'job_title', value: (el: any) => el.data?.jobTitle || '' },
                    { header: 'department', value: (el: any) => el.data?.department || '' },
                    { header: 'seg', value: (el: any) => el.data?.seg || '' },
                ],
            },
        ],
    },
};

/* ================================================================
   GHG SOURCE RESOLVER
   ================================================================

   Tabela de mapeamento source -> path no GhgInventoryReport.
   Consumido por xlsx.js:_buildRows para resolver fontes `meta` e
   `ghgT1..ghgT8` declaradas pelo template `ghg-protocol`.

   Quando `model.ghg` ausente, retorna []. Sem crash em ausencia
   do modulo de reports/ghgInventory (feature flag off).
   ================================================================ */

interface GhgCoverRow {
    campo: string;
    valor: string | number;
}

/**
 * Resolve rows para um sheet GHG (fontes `meta` e `ghgT1..ghgT8`).
 * Caller (xlsx.js) confere `isGhgSource(sheet.source)` antes de chamar.
 *
 * @param model - Modelo ecbyts (pode conter `model.ghg`)
 * @param source - Identificador da fonte (`meta`, `ghgT1`..`ghgT8`)
 * @returns Array de rows; cada row e passada como `primary` em col.value(primary, null)
 */
export function resolveGhgSource(model: any, source: string): object[] {
    const report = model?.ghg;
    if (!report) return [];

    if (source === 'meta') {
        const cover = report.coverPage || {};
        const rows: GhgCoverRow[] = [
            { campo: 'inventoryYear', valor: cover.inventoryYear ?? '' },
            { campo: 'gwpVersion', valor: cover.gwpVersion ?? report.metadata?.gwpVersion ?? '' },
            { campo: 'organizationalBoundary', valor: cover.organizationalBoundary ?? '' },
            { campo: 'companyName', valor: cover.companyName ?? '' },
            { campo: 'cnpj', valor: cover.cnpj ?? '' },
            { campo: 'cnae', valor: cover.cnae ?? '' },
            { campo: 'responsibleTechnician', valor: cover.responsibleTechnician ?? '' },
            { campo: 'totalTCO2e', valor: typeof report.totalTCO2e === 'number' ? report.totalTCO2e : '' },
            { campo: 'generatedAt', valor: report.metadata?.generatedAt ?? '' },
            { campo: 'toolVersion', valor: report.metadata?.toolVersion ?? '' },
        ];
        return rows;
    }

    const sourceToPath: Record<string, string> = {
        ghgT1: 't1_consolidatedByGasAndScope',
        ghgT2: 't2_biogenicEmissions',
        ghgT3: 't3_scope1ByCategory',
        ghgT4: 't4_scope2LocationByCategory',
        ghgT5: 't5_scope2MarketBasedByCategory',
        ghgT6: 't6_scope3ByCategory',
        ghgT7: 't7_intensityIndicators',
        ghgT8: 't8_yearOverYearComparison',
    };
    const path = sourceToPath[source];
    if (!path) return [];
    const rows = report[path];
    return Array.isArray(rows) ? rows : [];
}

/**
 * Identifica sources que devem passar pelo resolver GHG (em vez de
 * elements/campaigns/observations).
 */
export function isGhgSource(source: string): boolean {
    return (
        source === 'meta' ||
        source === 'ghgT1' ||
        source === 'ghgT2' ||
        source === 'ghgT3' ||
        source === 'ghgT4' ||
        source === 'ghgT5' ||
        source === 'ghgT6' ||
        source === 'ghgT7' ||
        source === 'ghgT8'
    );
}
