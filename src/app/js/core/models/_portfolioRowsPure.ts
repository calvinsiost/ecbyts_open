// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   PORTFOLIO ROWS — agregador da visão multi-site (P4-3)
   FRIEND-SCORE-001 (Calvin loop 2026-06-14). O gestor não tinha como
   comparar N sites do portfólio "1 número por site lado a lado". Este
   pure normaliza a lista de modelos (registry listModels) em linhas de
   portfólio + agregados (total sites, total elementos, EIS médio dos que
   têm número). Sem DOM, sem IO. Determinístico.
   ================================================================ */

export interface PortfolioModelInput {
    readonly id: string;
    readonly name?: string;
    readonly elementCount?: number;
    readonly campaignCount?: number;
    readonly updatedAt?: number;
    /** EIS 0-5 do site, se disponível (modelo ativo ou metadata persistida). */
    readonly eis?: number | null;
    /** Resultado monetário líquido (R$), se disponível. */
    readonly ecbtAmount?: number | null;
    /** Status de conformidade: 'ok' | 'attention' | 'critical' | null. */
    readonly compliance?: string | null;
}

export type EisBand = 'high' | 'medium' | 'low' | 'na';

export interface PortfolioRow {
    readonly id: string;
    readonly name: string;
    readonly elementCount: number;
    readonly campaignCount: number;
    readonly updatedAt: number | null;
    readonly eis: number | null;
    readonly eisBand: EisBand;
    readonly ecbtAmount: number | null;
    readonly compliance: 'ok' | 'attention' | 'critical' | 'na';
    readonly isActive: boolean;
}

export interface PortfolioSummary {
    readonly totalSites: number;
    readonly totalElements: number;
    readonly totalCampaigns: number;
    /** EIS médio dos sites que têm número (null se nenhum). */
    readonly avgEis: number | null;
    /** Soma do líquido ECBT dos sites que têm número. */
    readonly totalEcbt: number | null;
    readonly sitesWithEis: number;
}

export interface PortfolioView {
    readonly rows: ReadonlyArray<PortfolioRow>;
    readonly summary: PortfolioSummary;
}

/** Banda do EIS (mesmos cortes do veredito do app: 🟢≥3.5 🟡≥2.5 🔴<2.5). */
export function eisBand(eis: number | null | undefined): EisBand {
    if (typeof eis !== 'number' || !Number.isFinite(eis)) return 'na';
    if (eis >= 3.5) return 'high';
    if (eis >= 2.5) return 'medium';
    return 'low';
}

function _num(v: unknown, fallback = 0): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function _compliance(v: unknown): 'ok' | 'attention' | 'critical' | 'na' {
    const s = String(v ?? '').toLowerCase();
    if (s === 'ok' || s === 'compliant') return 'ok';
    if (s === 'attention' || s === 'warn' || s === 'prevention') return 'attention';
    if (s === 'critical' || s === 'violation' || s === 'intervention') return 'critical';
    return 'na';
}

/**
 * Monta a visão de portfólio. Ordena por EIS asc (pior site primeiro — onde
 * agir), sites sem EIS ao final; tiebreak por updatedAt desc (mais recente).
 */
export function buildPortfolioView(
    models: ReadonlyArray<PortfolioModelInput>,
    activeId: string | null = null,
): PortfolioView {
    const list = Array.isArray(models) ? models : [];
    const rows: PortfolioRow[] = list
        .filter((m) => m && typeof m.id === 'string')
        .map((m) => {
            const eis = typeof m.eis === 'number' && Number.isFinite(m.eis) ? m.eis : null;
            const ecbt = typeof m.ecbtAmount === 'number' && Number.isFinite(m.ecbtAmount) ? m.ecbtAmount : null;
            return Object.freeze({
                id: m.id,
                name: typeof m.name === 'string' && m.name.trim() ? m.name.trim() : m.id.slice(0, 8),
                elementCount: _num(m.elementCount),
                campaignCount: _num(m.campaignCount),
                updatedAt: typeof m.updatedAt === 'number' ? m.updatedAt : null,
                eis,
                eisBand: eisBand(eis),
                ecbtAmount: ecbt,
                compliance: _compliance(m.compliance),
                isActive: m.id === activeId,
            });
        });

    rows.sort((a, b) => {
        const ae = a.eis ?? Infinity;
        const be = b.eis ?? Infinity;
        if (ae !== be) return ae - be; // pior EIS primeiro; sem EIS ao final
        return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    });

    const withEis = rows.filter((r) => r.eis != null);
    const ecbtRows = rows.filter((r) => r.ecbtAmount != null);
    const summary: PortfolioSummary = Object.freeze({
        totalSites: rows.length,
        totalElements: rows.reduce((s, r) => s + r.elementCount, 0),
        totalCampaigns: rows.reduce((s, r) => s + r.campaignCount, 0),
        avgEis: withEis.length
            ? Math.round((withEis.reduce((s, r) => s + (r.eis as number), 0) / withEis.length) * 100) / 100
            : null,
        totalEcbt: ecbtRows.length ? ecbtRows.reduce((s, r) => s + (r.ecbtAmount as number), 0) : null,
        sitesWithEis: withEis.length,
    });

    return Object.freeze({ rows: Object.freeze(rows), summary });
}
