// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   GEE TEMPLATES — SPEC_SQL_TABLES_REPORT §Journey 4

   Pure helpers para Gestão de Emissões de GEE (GHG Protocol):
   - 3 templates canônicos: resumo_escopo / detalhamento_fonte / serie_temporal
   - Scope 1/2/3 classification (GHG Protocol)
   - CO2e conversion com GWP (IPCC AR6)
   - Aggregação por fonte + período
   - XLSX GHG Protocol structure importer
   - Formatação condicional (verde/amarelo/vermelho por limite)

   Sem dependência de Three.js/DOM — pronto para node:test.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Constants §GHG Protocol
// ──────────────────────────────────────────────────────────────────────

export const GHG_SCOPES = Object.freeze(['scope_1', 'scope_2', 'scope_3']);

export const SCOPE_DESCRIPTIONS = Object.freeze({
    scope_1: 'Emissões diretas (fontes controladas)',
    scope_2: 'Emissões indiretas (energia adquirida)',
    scope_3: 'Outras emissões indiretas (cadeia de valor)',
});

// GWP IPCC AR6 (100-year) - para conversão em CO2e
export const GWP_100 = Object.freeze({
    CO2: 1,
    CH4: 27.9, // IPCC AR6 corrigido para fossil
    N2O: 273,
    SF6: 25200,
    HFC134a: 1530,
    CF4: 7380,
});

export const GEE_TEMPLATES = Object.freeze([
    { id: 'resumo_escopo', name: 'Resumo por Escopo', columns: ['scope', 'sources', 'total_tco2e', 'share_pct'] },
    {
        id: 'detalhamento_fonte',
        name: 'Detalhamento por Fonte',
        columns: ['source', 'scope', 'activity', 'factor', 'tco2e'],
    },
    { id: 'serie_temporal', name: 'Série Temporal', columns: ['period', 'scope_1', 'scope_2', 'scope_3', 'total'] },
]);

export const TEMPLATE_IDS = Object.freeze(GEE_TEMPLATES.map((t) => t.id));

// Limites de alerta por categoria (tCO2e/ano) para formatação condicional
export const ALERT_THRESHOLDS = Object.freeze({
    low: 1000, // verde
    medium: 10_000, // amarelo
    high: 100_000, // vermelho
});

// ──────────────────────────────────────────────────────────────────────
// Helpers internos
// ──────────────────────────────────────────────────────────────────────

export function isValidScope(scope: string): boolean {
    return typeof scope === 'string' && GHG_SCOPES.includes(scope);
}

export function isValidTemplateId(id: string): boolean {
    return typeof id === 'string' && TEMPLATE_IDS.includes(id);
}

/**
 * Converte uma emissão em CO2e via GWP.
 *
 * @returns toneladas CO2e
 */
export function convertToCO2e(emission: { gas: string; amount: number }): number {
    if (!emission || typeof emission !== 'object') return 0;
    const gas = String(emission.gas || 'CO2').toUpperCase();
    const amount = Number(emission.amount);
    if (!Number.isFinite(amount) || amount < 0) return 0;
    const gwp = (GWP_100 as Record<string, number>)[gas] ?? GWP_100.CO2;
    return amount * gwp;
}

export function classifyAlertLevel(tco2e: number): 'low' | 'medium' | 'high' | 'critical' {
    const n = Number(tco2e);
    if (!Number.isFinite(n) || n < 0) return 'low';
    if (n < ALERT_THRESHOLDS.low) return 'low';
    if (n < ALERT_THRESHOLDS.medium) return 'medium';
    if (n < ALERT_THRESHOLDS.high) return 'high';
    return 'critical';
}

// ──────────────────────────────────────────────────────────────────────
// Template 1: Resumo por Escopo
// ──────────────────────────────────────────────────────────────────────

/**
 * Agrega emissões por scope com total tCO2e + share_pct.
 */
export function buildResumoEscopo(
    emissions: Array<{ scope: string; gas: string; amount: number }>,
): Array<{
    scope: string;
    description?: string;
    sources: number;
    total_tco2e: number;
    share_pct: number;
    alert: string;
}> {
    if (!Array.isArray(emissions)) return [];
    const byScope: Record<string, { scope: string; sources: number; total_tco2e: number }> = {};
    for (const scope of GHG_SCOPES) {
        byScope[scope] = { scope, sources: 0, total_tco2e: 0 };
    }
    let grandTotal = 0;

    for (const e of emissions) {
        if (!isValidScope(e?.scope)) continue;
        const tco2e = convertToCO2e(e);
        const bucket = byScope[e.scope] as { scope: string; sources: number; total_tco2e: number };
        bucket.sources++;
        bucket.total_tco2e += tco2e;
        grandTotal += tco2e;
    }

    return GHG_SCOPES.map((scope) => {
        const row = byScope[scope] as { scope: string; sources: number; total_tco2e: number };
        return {
            scope,
            description: (SCOPE_DESCRIPTIONS as Record<string, string>)[scope] as string,
            sources: row.sources,
            total_tco2e: row.total_tco2e,
            share_pct: grandTotal > 0 ? (row.total_tco2e / grandTotal) * 100 : 0,
            alert: classifyAlertLevel(row.total_tco2e),
        };
    });
}

// ──────────────────────────────────────────────────────────────────────
// Template 2: Detalhamento por Fonte
// ──────────────────────────────────────────────────────────────────────

/**
 * Lista detalhada com source, scope, activity, factor, tCO2e.
 */
export function buildDetalhamentoFonte(
    emissions: Array<{
        source: string;
        scope: string;
        activity: string;
        factor: number;
        gas: string;
        amount: number;
    }>,
): Array<{
    source: string;
    scope: string;
    activity: string;
    factor: number | null;
    tco2e: number;
    alert: string;
}> {
    if (!Array.isArray(emissions)) return [];
    const result: Array<{
        source: string;
        scope: string;
        activity: string;
        factor: number | null;
        tco2e: number;
        alert: string;
    }> = [];
    for (const e of emissions) {
        if (!e || typeof e !== 'object' || !isValidScope(e.scope)) continue;
        const tco2e = convertToCO2e(e);
        result.push({
            source: String(e.source || 'desconhecido'),
            scope: e.scope,
            activity: String(e.activity || ''),
            factor: Number.isFinite(Number(e.factor)) ? Number(e.factor) : null,
            tco2e,
            alert: classifyAlertLevel(tco2e),
        });
    }
    // Ordenar por tco2e DESC (piores primeiro)
    return result.sort((a, b) => b.tco2e - a.tco2e);
}

// ──────────────────────────────────────────────────────────────────────
// Template 3: Série Temporal
// ──────────────────────────────────────────────────────────────────────

/**
 * Agrupa emissões por período (YYYY-MM) com scope 1/2/3 breakdown.
 */
export function buildSerieTemporal(
    emissions: Array<{ scope: string; gas: string; amount: number; date?: string | number | Date }>,
    opts: { groupBy?: 'month' | 'year' | 'quarter' } = {},
): Array<{ period: string; scope_1: number; scope_2: number; scope_3: number; total: number }> {
    if (!Array.isArray(emissions)) return [];
    const groupBy = opts?.groupBy || 'month';
    const byPeriod: Map<
        string,
        { period: string; scope_1: number; scope_2: number; scope_3: number; total: number }
    > = new Map();

    for (const e of emissions) {
        if (!isValidScope(e?.scope)) continue;
        const date = e.date ? new Date(e.date) : null;
        if (!date || Number.isNaN(date.getTime())) continue;
        const period = formatPeriod(date, groupBy);
        if (!byPeriod.has(period)) {
            byPeriod.set(period, { period, scope_1: 0, scope_2: 0, scope_3: 0, total: 0 });
        }
        const row = byPeriod.get(period) as any;
        const tco2e = convertToCO2e(e);
        row[e.scope] += tco2e;
        row.total += tco2e;
    }

    return Array.from(byPeriod.values()).sort((a, b) => a.period.localeCompare(b.period));
}

export function formatPeriod(date: Date, groupBy: string): string {
    const yyyy = date.getUTCFullYear();
    const mm = date.getUTCMonth() + 1;
    if (groupBy === 'year') return String(yyyy);
    if (groupBy === 'quarter') return `${yyyy}-Q${Math.ceil(mm / 3)}`;
    return `${yyyy}-${String(mm).padStart(2, '0')}`;
}

// ──────────────────────────────────────────────────────────────────────
// Dispatch builder
// ──────────────────────────────────────────────────────────────────────

/**
 * Constrói template GEE por ID. Retorna estrutura com colunas + rows.
 */
export function buildGeeTemplate(
    templateId: string,
    emissions: Array<any>,
    opts?: Record<string, any>,
): { template: any; columns: any; rows: any; generatedAt: string } | null {
    if (!isValidTemplateId(templateId)) return null;
    const meta = GEE_TEMPLATES.find((t: any) => t.id === templateId) as any;
    if (!meta) return null;
    const nowMs = opts?.nowMs ? Number(opts.nowMs) : Date.now();
    let rows: any[] = [];
    if (templateId === 'resumo_escopo') rows = buildResumoEscopo(emissions);
    else if (templateId === 'detalhamento_fonte') rows = buildDetalhamentoFonte(emissions);
    else if (templateId === 'serie_temporal') rows = buildSerieTemporal(emissions, opts);

    return {
        template: { id: templateId, name: meta.name },
        columns: meta.columns,
        rows,
        generatedAt: new Date(nowMs).toISOString(),
    };
}

// ──────────────────────────────────────────────────────────────────────
// XLSX GHG Protocol importer (structure validator)
// ──────────────────────────────────────────────────────────────────────

/**
 * Valida linha de XLSX GHG Protocol. Retorna { valid, errors, normalized }.
 *
 * Expected columns: source, scope, activity, gas, amount, factor, date
 */
export function validateGhgXlsxRow(row: Record<string, any>): {
    valid: boolean;
    errors: string[];
    normalized: any;
} {
    const errors: string[] = [];
    if (!row || typeof row !== 'object') {
        return { valid: false, errors: ['not object'], normalized: null };
    }
    if (!row.source) errors.push('source required');
    if (!isValidScope(row.scope)) errors.push('scope must be scope_1/scope_2/scope_3');
    if (!Number.isFinite(Number(row.amount))) errors.push('amount required numeric');

    const normalized =
        errors.length === 0
            ? {
                  source: String(row.source),
                  scope: row.scope,
                  activity: String(row.activity || ''),
                  gas: String(row.gas || 'CO2').toUpperCase(),
                  amount: Number(row.amount),
                  factor: Number.isFinite(Number(row.factor)) ? Number(row.factor) : null,
                  date: row.date || null,
              }
            : null;

    return { valid: errors.length === 0, errors, normalized };
}
