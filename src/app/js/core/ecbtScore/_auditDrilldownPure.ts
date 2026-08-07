// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ECBT Audit Trail — drill-down pure logic.
 *
 * Calvin 2026-06-07: "é preciso ver os dados brutos nessa janela como eles vêm
 * do modelo e se consolidam aí. Ao clicar neles deve ser possível abrir esse
 * 'reading' direto na tela ou o cálculo direto no sql editor".
 *
 * Para cada cellId do Audit Trail (A.x, B.x, C.x, D.T, etc), gera:
 *  - kind: 'reading' (observação raw) | 'element' (elemento 3D) | 'computed' (derivado)
 *  - elementId: ID do elemento a selecionar via handleSelectElement (opcional)
 *  - sqlQuery: SQL "view source" para abrir no DataStudio editor (sempre)
 *  - description: explicação 1-linha do que esta célula representa
 *
 * Wire consume via ecbtAuditTrailPanel `click` handler → dispatch event
 * 'ecbt:audit-trail-row-clicked' { drilldown: DrilldownInfo } → caller abre
 * modal/select element/preencher SQL editor conforme kind.
 */

export type DrilldownKind = 'reading' | 'element' | 'computed' | 'aggregate';

export interface DrilldownInfo {
    readonly cellId: string;
    readonly kind: DrilldownKind;
    readonly elementId: string | null;
    readonly sqlQuery: string;
    readonly description: string;
    readonly rawHint: string | null;
}

/**
 * Bloco A (Entradas) — dados de campo brutos.
 * cellId patterns: 'A.obs.{elementId}' ou 'A.obs' agregado.
 */
function _buildAEntries(cellId: string): DrilldownInfo {
    const parts = cellId.split('.');
    const elementId = parts.length >= 3 ? parts.slice(2).join('.') : null;
    if (elementId) {
        return Object.freeze({
            cellId,
            kind: 'reading' as const,
            elementId,
            sqlQuery: `-- Observações de campo do elemento ${elementId}\nSELECT timestamp, parameter, value, unit, matrix, depth\nFROM observations\nWHERE element_id = '${elementId.replace(/'/g, "''")}'\nORDER BY timestamp DESC;`,
            description: `Leitura bruta da observação de campo no elemento ${elementId}`,
            rawHint: 'observations[element_id]',
        });
    }
    return Object.freeze({
        cellId,
        kind: 'aggregate' as const,
        elementId: null,
        sqlQuery: `-- Total de observações agregadas no modelo\nSELECT COUNT(*) AS total_readings,\n       COUNT(DISTINCT element_id) AS elements_with_readings,\n       MIN(timestamp) AS first_reading,\n       MAX(timestamp) AS last_reading\nFROM observations;`,
        description: 'Total agregado de observações de campo do modelo',
        rawHint: 'observations',
    });
}

/**
 * Bloco B (Limites legais CONAMA/CETESB) — thresholds normativos.
 */
function _buildBLimits(cellId: string): DrilldownInfo {
    return Object.freeze({
        cellId,
        kind: 'computed' as const,
        elementId: null,
        sqlQuery: `-- Limites legais aplicáveis (CONAMA 420 / CETESB DD-256/2016)\nSELECT parameter, matrix, vr, vp, vi, unit, source\nFROM thresholds\nWHERE source IN ('CONAMA-420-2009', 'CETESB-DD-256-2016')\nORDER BY parameter, matrix;`,
        description: 'Limites VR/VP/VI aplicáveis por parâmetro e matriz',
        rawHint: 'thresholds[source]',
    });
}

/**
 * Bloco C (Conformidade HQ) — quociente de risco por observação.
 */
function _buildCCompliance(cellId: string): DrilldownInfo {
    return Object.freeze({
        cellId,
        kind: 'computed' as const,
        elementId: null,
        sqlQuery: `-- Hazard Quotient HQ = observed_value / threshold_value\nSELECT o.element_id, o.parameter, o.matrix, o.value AS observed,\n       t.vi AS threshold_intervention,\n       (o.value / NULLIF(t.vi, 0)) AS hq\nFROM observations o\nJOIN thresholds t USING(parameter, matrix)\nWHERE t.source = 'CONAMA-420-2009'\nORDER BY hq DESC;`,
        description: 'Hazard Quotient = valor observado ÷ limite de intervenção',
        rawHint: 'observations JOIN thresholds',
    });
}

/**
 * Bloco D (10 eixos EIS — Core-6 + Progressive-4).
 * cellId pattern: 'D.T', 'D.A', 'D.Cp', 'D.Ty', 'D.Cs', 'D.Cm', 'D.Gc', 'D.Bi', 'D.Se', 'D.Tr'.
 */
const D_AXIS_SQL_HINTS: Record<string, { desc: string; rawHint: string; query: string }> = {
    T: {
        desc: 'Eixo T (Rastreabilidade) — fração de observações com fonte rastreada',
        rawHint: 'observations.traced',
        query: `SELECT COUNT(*) AS total, SUM(CASE WHEN traced = TRUE THEN 1 ELSE 0 END) AS traced_count,\n       1 + 4 * (SUM(CASE WHEN traced = TRUE THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0)) AS axis_T\nFROM observations;`,
    },
    A: {
        desc: 'Eixo A (Acurácia) — fração de observações NÃO non-detect',
        rawHint: 'observations.nonDetect',
        query: `SELECT COUNT(*) AS total, SUM(CASE WHEN non_detect = FALSE THEN 1 ELSE 0 END) AS detected,\n       1 + 4 * (1 - SUM(CASE WHEN non_detect = TRUE THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0)) AS axis_A\nFROM observations;`,
    },
    Cp: {
        desc: 'Eixo Cp (Cobertura) — MIN(executadas/planejadas, 1) por campanha',
        rawHint: 'campaigns.executed/planned',
        query: `SELECT id, executed_readings, planned_readings,\n       LEAST(executed_readings::float / NULLIF(planned_readings, 0), 1) AS coverage_ratio,\n       1 + 4 * AVG(LEAST(executed_readings::float / NULLIF(planned_readings, 0), 1)) OVER () AS axis_Cp\nFROM campaigns;`,
    },
    Ty: {
        desc: 'Eixo Ty (Tempestividade) — fração de leituras dentro do prazo',
        rawHint: 'observations.onTime',
        query: `SELECT COUNT(*) AS total, SUM(CASE WHEN on_time = TRUE THEN 1 ELSE 0 END) AS on_time_count,\n       1 + 4 * (SUM(CASE WHEN on_time = TRUE THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0)) AS axis_Ty\nFROM observations;`,
    },
    Cs: {
        desc: 'Eixo Cs (Consistência) — fração de leituras em unidade SI',
        rawHint: 'observations.unitSI',
        query: `SELECT COUNT(*) AS total, SUM(CASE WHEN unit_si = TRUE THEN 1 ELSE 0 END) AS si_count,\n       1 + 4 * (SUM(CASE WHEN unit_si = TRUE THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0)) AS axis_Cs\nFROM observations;`,
    },
    Cm: {
        desc: 'Eixo Cm (Completude) — fração de parâmetros mapeados ao catálogo taxonômico',
        rawHint: 'observations.taxonMapped',
        query: `SELECT COUNT(*) AS total, SUM(CASE WHEN taxon_mapped = TRUE THEN 1 ELSE 0 END) AS mapped_count,\n       1 + 4 * (SUM(CASE WHEN taxon_mapped = TRUE THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0)) AS axis_Cm\nFROM observations;`,
    },
    Gc: {
        desc: 'Eixo Gc (Governança Corporativa) — score externo ESG [0-5]',
        rawHint: 'external_scores.governance',
        query: `SELECT score AS axis_Gc, source, last_updated\nFROM external_scores\nWHERE category = 'governance'\nORDER BY last_updated DESC\nLIMIT 1;`,
    },
    Bi: {
        desc: 'Eixo Bi (Biodiversidade) — score externo ecológico [0-5]',
        rawHint: 'external_scores.biodiversity',
        query: `SELECT score AS axis_Bi, source, last_updated\nFROM external_scores\nWHERE category = 'biodiversity'\nORDER BY last_updated DESC\nLIMIT 1;`,
    },
    Se: {
        desc: 'Eixo Se (Segurança EHS) — score externo HSE [0-5]',
        rawHint: 'external_scores.safety',
        query: `SELECT score AS axis_Se, source, last_updated\nFROM external_scores\nWHERE category = 'safety_ehs'\nORDER BY last_updated DESC\nLIMIT 1;`,
    },
    Tr: {
        desc: 'Eixo Tr (Transparência Reporte) — score externo GRI/ISSB [0-5]',
        rawHint: 'external_scores.transparency',
        query: `SELECT score AS axis_Tr, source, last_updated\nFROM external_scores\nWHERE category = 'transparency_report'\nORDER BY last_updated DESC\nLIMIT 1;`,
    },
};

function _buildDAxis(cellId: string): DrilldownInfo {
    const axis = cellId.split('.').pop() ?? '';
    const hint = D_AXIS_SQL_HINTS[axis];
    if (!hint) {
        return Object.freeze({
            cellId,
            kind: 'computed' as const,
            elementId: null,
            sqlQuery: `-- Eixo EIS desconhecido: ${cellId}`,
            description: `Eixo desconhecido (${axis}) — verificar registry`,
            rawHint: null,
        });
    }
    return Object.freeze({
        cellId,
        kind: 'computed' as const,
        elementId: null,
        sqlQuery: `-- ${hint.desc}\n${hint.query}`,
        description: hint.desc,
        rawHint: hint.rawHint,
    });
}

/**
 * Builder principal — retorna DrilldownInfo para qualquer cellId reconhecido.
 * Fallback: gera SQL genérico SELECT * FROM audit_log WHERE cell_id = ?.
 */
export function buildDrilldown(cellId: string): DrilldownInfo {
    if (!cellId || typeof cellId !== 'string') {
        return Object.freeze({
            cellId: '',
            kind: 'computed' as const,
            elementId: null,
            sqlQuery: '-- cellId inválido',
            description: 'cellId inválido ou vazio',
            rawHint: null,
        });
    }
    const block = cellId.charAt(0).toUpperCase();
    switch (block) {
        case 'A': return _buildAEntries(cellId);
        case 'B': return _buildBLimits(cellId);
        case 'C': return _buildCCompliance(cellId);
        case 'D': return _buildDAxis(cellId);
    }
    // Genérico para blocos E-I
    return Object.freeze({
        cellId,
        kind: 'computed' as const,
        elementId: null,
        sqlQuery: `-- Trace audit log para a célula ${cellId}\nSELECT cell_id, formula, value, computed_at, source_refs\nFROM audit_log\nWHERE cell_id = '${cellId.replace(/'/g, "''")}'\nORDER BY computed_at DESC\nLIMIT 1;`,
        description: `Trace de cálculo da célula ${cellId}`,
        rawHint: `audit_log[cell_id=${cellId}]`,
    });
}

/**
 * Atalho UI: HTML escapado pronto para clipboard / preview.
 */
export function formatDrilldownPreview(d: DrilldownInfo): string {
    const lines: string[] = [];
    lines.push(`Cell: ${d.cellId}`);
    lines.push(`Kind: ${d.kind}`);
    if (d.elementId) lines.push(`Element ID: ${d.elementId}`);
    if (d.rawHint) lines.push(`Source: ${d.rawHint}`);
    lines.push('');
    lines.push('-- SQL --');
    lines.push(d.sqlQuery);
    return lines.join('\n');
}
