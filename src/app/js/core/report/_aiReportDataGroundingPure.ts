// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Pure data-grounding helpers para geração de relatório por IA.
// Normaliza observações de múltiplas formas (modelo aleatório: reading/unit;
// ingerida: parameterId/value/unitId/matrix), resume estatisticamente e monta
// tabelas HTML determinísticas (excedências regulatórias, observações por parâmetro).
//
// Por que existe: o AI report injetava só contagens agregadas — o LLM não recebia
// nenhum valor medido real, gerando prosa genérica. Este módulo extrai os números
// reais do modelo de forma determinística (sem o LLM inventar), atendendo o requisito
// de auditabilidade (CLAUDE.md) e o North Star v2 (confiança no resultado).
//
// CORE module — sem dependência de utils/UI; escape de HTML inline.

export type NormalizedObs = {
    parameter: string;
    value: number;
    unit: string;
    date: string;
    matrix: string;
};

export type ParamStat = {
    parameter: string;
    count: number;
    min: number;
    max: number;
    mean: number;
    unit: string;
};

export type ObsSummary = {
    totalObs: number;
    dateRange: { from: string; to: string } | null;
    byParameter: ParamStat[];
};

export type Exceedance = {
    substance: string;
    value: number;
    threshold: number;
    unit: string;
    jurisdiction: string;
    status: 'exceeds' | 'ok';
};

const _esc = (s: unknown): string =>
    String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const _num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

/** Formata um número para exibição compacta (notação científica nos extremos). */
export function fmtNum(n: number): string {
    if (!Number.isFinite(n)) return 'N/A';
    if (n === 0) return '0';
    const abs = Math.abs(n);
    if (abs >= 1e4 || abs < 0.01) return n.toExponential(2);
    return (Math.round(n * 1000) / 1000).toString();
}

/**
 * Normaliza uma observação crua (qualquer forma) para {parameter,value,unit,date,matrix}.
 * paramLookup(parameterId) → {name?, unit?} | null — injetado pelo handler via CONFIG.PARAMETERS.
 * Retorna null se não houver valor numérico.
 */
export function normalizeObservation(
    obs: any,
    paramLookup?: (id: string) => { name?: string; unit?: string } | null,
): NormalizedObs | null {
    if (!obs || typeof obs !== 'object') return null;
    const rawVal = obs.value !== undefined && obs.value !== null && obs.value !== '' ? obs.value : obs.reading;
    const value = _num(rawVal);
    if (value === null) return null;
    let parameter = '';
    let unit = obs.unitId || obs.unit || '';
    if (obs.parameterId && typeof paramLookup === 'function') {
        const p = paramLookup(obs.parameterId);
        if (p?.name) parameter = p.name;
        if (!unit && p?.unit) unit = p.unit;
    }
    if (!parameter) parameter = obs.parameter || obs.parameterId || 'desconhecido';
    const date = String(obs.date || obs.timestamp || '').slice(0, 10);
    const matrix = obs.matrix || 'groundwater';
    return { parameter: String(parameter), value, unit: String(unit || ''), date, matrix };
}

/** Achata + normaliza todas as observações de uma lista de elementos. */
export function collectObservations(
    elements: any[],
    paramLookup?: (id: string) => { name?: string; unit?: string } | null,
): NormalizedObs[] {
    if (!Array.isArray(elements)) return [];
    const out: NormalizedObs[] = [];
    for (const el of elements) {
        const obsList = Array.isArray(el?.observations) ? el.observations : [];
        for (const o of obsList) {
            const n = normalizeObservation(o, paramLookup);
            if (n) out.push(n);
        }
    }
    return out;
}

/** Resume observações normalizadas: total, intervalo de datas, estatísticas por parâmetro. */
export function summarizeObservations(obs: NormalizedObs[]): ObsSummary {
    const list = Array.isArray(obs) ? obs : [];
    const byParamMap = new Map<string, { values: number[]; unit: string }>();
    let from = '';
    let to = '';
    for (const o of list) {
        if (o.date) {
            if (!from || o.date < from) from = o.date;
            if (!to || o.date > to) to = o.date;
        }
        const key = o.parameter;
        if (!byParamMap.has(key)) byParamMap.set(key, { values: [], unit: o.unit });
        const e = byParamMap.get(key)!;
        e.values.push(o.value);
        if (!e.unit && o.unit) e.unit = o.unit;
    }
    const byParameter: ParamStat[] = Array.from(byParamMap.entries())
        .map(([parameter, { values, unit }]) => {
            const min = Math.min(...values);
            const max = Math.max(...values);
            const mean = values.reduce((a, b) => a + b, 0) / values.length;
            return { parameter, count: values.length, min, max, mean, unit };
        })
        .sort((a, b) => b.count - a.count);
    return {
        totalObs: list.length,
        dateRange: from || to ? { from, to } : null,
        byParameter,
    };
}

/** Texto curto para o placeholder {{observationSummary}}. */
export function formatObservationSummaryText(summary: ObsSummary): string {
    if (!summary || summary.totalObs === 0) return 'Nenhuma observação registrada no modelo.';
    const params = summary.byParameter
        .slice(0, 8)
        .map(
            (p) =>
                `${p.parameter}: ${p.count} medição(ões), faixa ${fmtNum(p.min)}–${fmtNum(p.max)} ${p.unit} (média ${fmtNum(p.mean)})`,
        )
        .join('; ');
    const range = summary.dateRange ? ` entre ${summary.dateRange.from} e ${summary.dateRange.to}` : '';
    return `${summary.totalObs} observações${range}. ${params}.`;
}

/** Texto para o placeholder {{dateRange}}. */
export function formatDateRange(summary: ObsSummary): string {
    if (!summary?.dateRange) return 'N/A';
    return `${summary.dateRange.from} a ${summary.dateRange.to}`;
}

/** Texto para o placeholder {{topContaminants}} a partir de excedências. */
export function formatTopContaminants(exceedances: Exceedance[], n = 5): string {
    const ex = (Array.isArray(exceedances) ? exceedances : []).filter((e) => e.status === 'exceeds');
    if (ex.length === 0) return 'Nenhum parâmetro excede os limites regulatórios avaliados.';
    return ex
        .slice(0, n)
        .map((e) => `${e.substance} (${fmtNum(e.value)} ${e.unit}, limite ${fmtNum(e.threshold)} — ${e.jurisdiction})`)
        .join('; ');
}

/** Tabela HTML determinística de excedências para o placeholder {{exceedanceTable}}. */
export function buildExceedanceTableHtml(exceedances: Exceedance[]): string {
    const ex = Array.isArray(exceedances) ? exceedances : [];
    if (ex.length === 0) return '<p>Sem dados de excedência regulatória disponíveis.</p>';
    const rows = ex
        .map((e) => {
            const ratio = e.threshold > 0 ? e.value / e.threshold : 0;
            const sit =
                e.status === 'exceeds'
                    ? `&#9888; Excede${ratio ? ` (${ratio.toFixed(1)}&times;)` : ''}`
                    : 'Conforme';
            return (
                `<tr class="${e.status === 'exceeds' ? 'exceed' : 'ok'}">` +
                `<td>${_esc(e.substance)}</td>` +
                `<td>${_esc(fmtNum(e.value))} ${_esc(e.unit)}</td>` +
                `<td>${_esc(fmtNum(e.threshold))} ${_esc(e.unit)}</td>` +
                `<td>${_esc(e.jurisdiction)}</td>` +
                `<td>${sit}</td>` +
                `</tr>`
            );
        })
        .join('');
    return (
        `<table class="report-data-table report-exceedance-table"><thead><tr>` +
        `<th>Substância</th><th>Valor medido</th><th>Limite</th><th>Referência</th><th>Situação</th>` +
        `</tr></thead><tbody>${rows}</tbody></table>`
    );
}

/** Tabela HTML de resumo de observações por parâmetro para o placeholder {{observationTable}}. */
export function buildObservationTableHtml(summary: ObsSummary): string {
    if (!summary || summary.totalObs === 0) return '<p>Nenhuma observação registrada.</p>';
    const rows = summary.byParameter
        .map(
            (p) =>
                `<tr><td>${_esc(p.parameter)}</td><td>${p.count}</td>` +
                `<td>${_esc(fmtNum(p.min))}</td><td>${_esc(fmtNum(p.max))}</td>` +
                `<td>${_esc(fmtNum(p.mean))}</td><td>${_esc(p.unit)}</td></tr>`,
        )
        .join('');
    return (
        `<table class="report-data-table report-observation-table"><thead><tr>` +
        `<th>Parâmetro</th><th>N</th><th>Mín</th><th>Máx</th><th>Média</th><th>Unidade</th>` +
        `</tr></thead><tbody>${rows}</tbody></table>`
    );
}

/**
 * Bloco de grounding (texto puro) para o prompt do LLM — dados reais + instrução
 * anti-alucinação. O modelo é instruído a usar SOMENTE estes números.
 */
export function buildGroundingBlock(summary: ObsSummary, exceedances: Exceedance[]): string {
    const obs = formatObservationSummaryText(summary);
    const top = formatTopContaminants(exceedances, 8);
    return (
        'DADOS REAIS DO MODELO (use SOMENTE estes números; NÃO invente valores nem datas):\n' +
        `- Observações: ${obs}\n` +
        `- Excedências regulatórias: ${top}`
    );
}
