// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   GRAPH KPI EXPORT — A2 (SPEC_RELATIONS_PANEL_KPI_POLISH, Calvin 2026-06-14)
   Exporta os KPIs científicos do grafo (GraphMetricsResult) em linhas prontas
   para CSV. Contexto doutorado Poli/USP: os números (densidade, betweenness,
   modularidade...) entram na tese e precisam ser citáveis/reprodutíveis.

   Pure: sem DOM. Retorna { headers, rows } para utils/helpers/csvExport.toCsv.
   Sanitiza contra CSV-injection (prefixa célula iniciada por = + - @ tab/cr).
   ================================================================ */

export interface KpiExportOptions {
    /** Resolve id de nó → nome legível (default: o próprio id). */
    readonly labelOf?: (id: string) => string;
    /** Rótulos de cabeçalho (i18n). Default pt-BR. */
    readonly headers?: readonly [string, string, string];
    /** Quantos itens das listas top-N incluir. Default 5. */
    readonly topN?: number;
}

export interface KpiExport {
    readonly headers: readonly string[];
    readonly rows: ReadonlyArray<readonly string[]>;
}

/** Anti CSV-injection: prefixa `'` se a célula começar com caractere perigoso. */
export function sanitizeCsvFormula(value: unknown): string {
    const s = value == null ? '' : String(value);
    return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function pct(x: number): string {
    return Number.isFinite(x) ? `${Math.round(x * 100)}%` : '0%';
}
function num(x: number, dp = 2): string {
    if (!Number.isFinite(x)) return '0';
    const f = Math.pow(10, dp);
    return (Math.round(x * f) / f).toString().replace('.', ',');
}

/**
 * Constrói as linhas de export dos KPIs a partir do resultado do motor.
 * Cada métrica é uma linha [Métrica, Valor, Detalhe], tudo sanitizado.
 */
export function buildGraphKpiExport(result: any, opts: KpiExportOptions = {}): KpiExport {
    const labelOf = typeof opts.labelOf === 'function' ? opts.labelOf : (id: string) => id;
    const topN = typeof opts.topN === 'number' && opts.topN >= 1 ? Math.floor(opts.topN) : 5;
    const headers = opts.headers || (['Métrica', 'Valor', 'Detalhe'] as const);
    const rows: string[][] = [];
    const add = (metric: string, value: string, detail = '') =>
        rows.push([sanitizeCsvFormula(metric), sanitizeCsvFormula(value), sanitizeCsvFormula(detail)]);

    if (!result || typeof result !== 'object') {
        return Object.freeze({ headers: Object.freeze([...headers]), rows: Object.freeze([]) });
    }

    add('Nós (vértices)', String(result.nodeCount ?? 0));
    add('Arestas (relações)', String(result.edgeCount ?? 0));
    add('Densidade', pct(result.density ?? 0), 'arestas reais ÷ possíveis');

    const deg = result.degree || {};
    add('Grau médio', num(deg.mean ?? 0, 1));
    add('Grau máximo', String(deg.max ?? 0));
    if (deg.topByDegree?.[0]) add('Mais conectado (hub)', labelOf(deg.topByDegree[0].id), `grau ${deg.topByDegree[0].score}`);
    add('Nós isolados', String(deg.isolatedCount ?? 0));

    const comp = result.components || {};
    add('Componentes conexos', String(comp.count ?? 0));
    add('Maior componente', String(comp.largestSize ?? 0), 'nós');

    add('Coesão local (clustering)', pct(result.clusteringGlobal ?? 0));

    const conn = result.connectivityRisk || {};
    const artic = conn.articulationPoints || [];
    add('Pontos de articulação', String(artic.length), artic.slice(0, topN).map((id: string) => labelOf(id)).join('; '));
    add('Pontes (relações críticas)', String((conn.bridges || []).length));

    if (result.betweenness && !result.betweenness.skipped) {
        for (const s of (result.betweenness.top || []).slice(0, topN)) {
            if (s.score > 0) add('Betweenness (caminho crítico)', labelOf(s.id), pct(s.score));
        }
    }
    if (result.closeness && !result.closeness.skipped) {
        for (const s of (result.closeness.top || []).slice(0, topN)) {
            if (s.score > 0) add('Closeness (proximidade)', labelOf(s.id), pct(s.score));
        }
    }
    if (result.spread && !result.spread.skipped) {
        add('Diâmetro', String(result.spread.diameter ?? 0));
        add('Comprimento médio de caminho', num(result.spread.averagePathLength ?? 0, 2));
    }
    if (typeof result.modularity === 'number') {
        add('Modularidade (Q)', num(result.modularity, 2), 'Newman-Girvan 2004');
    }

    return Object.freeze({ headers: Object.freeze([...headers]), rows: Object.freeze(rows.map((r) => Object.freeze(r))) });
}
