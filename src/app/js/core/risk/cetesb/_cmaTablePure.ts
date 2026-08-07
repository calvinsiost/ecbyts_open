// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Tabela determinística HTML/Markdown CMA × SQI para inserção em template
// AI Report CETESB IC (P1-9 Fase 1.8) — placeholder `{{cmaTable}}`.
//
// Pure-logic, sem THREE/DOM/IDB. Reusa `computeRiskAndCma` do pipeline e
// gera HTML escapado seguro para injeção via _aiReportDataGroundingPure.
//
// SPEC: CETESB-RISK-001 RF-1.6

import { computeRiskAndCma, type ScenarioId, type Medium, type MediaConcentrations } from './index.js';

export interface CmaTableObservation {
    /** CAS da SQI. */
    sqiCas: string;
    /** Nome humano (UI). Default: CAS. */
    sqiName?: string;
    /** Mídia da concentração observada. */
    medium: Medium;
    /** Concentração observada (mg/kg | mg/L | mg/m³). */
    concentration: number;
}

export interface CmaTableOptions {
    /** Cenário receptor para todas as observações. */
    scenario: ScenarioId;
    /** ILCR target (default 1e-6). */
    targetILCR?: number;
    /** HQ target (default 1.0). */
    targetHQ?: number;
    /** Idade aplicável; default conforme cenário. */
    ageGroup?: 'child' | 'adult';
    /** Label do cenário para cabeçalho (default: id). */
    scenarioLabel?: string;
    /** Timestamp ISO de geração (carimbo determinístico). */
    now?: string;
}

export interface CmaTableRow {
    sqiCas: string;
    sqiName: string;
    medium: string;
    observed: number;
    observedUnit: string;
    ilcr: number;
    hq: number;
    cma: number | string;
    cmaUnit: string;
    /** Status compliance: 🟢 OK / 🟡 Atenção / 🔴 Excedência / ⚪ N/D */
    status: 'ok' | 'warning' | 'exceeded' | 'unknown';
    limitingPathway: string;
}

export interface CmaTableResult {
    readonly rows: ReadonlyArray<CmaTableRow>;
    readonly html: string;
    readonly markdown: string;
    readonly meta: Readonly<{
        scenarioId: ScenarioId;
        targetILCR: number;
        targetHQ: number;
        totalSqis: number;
        totalExceedances: number;
        generatedAt: string;
    }>;
}

function _esc(s: unknown): string {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
        c === '&' ? '&amp;'
        : c === '<' ? '&lt;'
        : c === '>' ? '&gt;'
        : c === '"' ? '&quot;'
        : '&#39;',
    );
}

function _fmt(n: number, sig = 3): string {
    if (!Number.isFinite(n)) return n === Infinity ? '∞' : 'N/D';
    if (n === 0) return '0';
    const abs = Math.abs(n);
    if (abs >= 1e4 || abs < 1e-3) return n.toExponential(sig);
    return n.toFixed(sig);
}

function _unitFor(medium: Medium): string {
    if (medium === 'soil') return 'mg/kg';
    if (medium === 'groundwater') return 'mg/L';
    return 'mg/m³';
}

function _statusOf(observed: number, cma: number): CmaTableRow['status'] {
    if (!Number.isFinite(cma) || cma <= 0) return 'unknown';
    if (observed > cma) return 'exceeded';
    if (observed > cma * 0.5) return 'warning';
    return 'ok';
}

function _statusBadge(status: CmaTableRow['status']): string {
    if (status === 'exceeded') return '🔴 Excedido';
    if (status === 'warning') return '🟡 Atenção';
    if (status === 'ok') return '🟢 OK';
    return '⚪ N/D';
}

function _conc(o: CmaTableObservation): MediaConcentrations {
    if (o.medium === 'soil') return { soil: o.concentration };
    if (o.medium === 'groundwater') return { groundwater: o.concentration };
    return { air: o.concentration };
}

/**
 * Constrói tabela CMA × SQI a partir de observações + cenário.
 * Pure-logic — não usa Date.now (passe `now` se quiser carimbar).
 */
export function buildCmaTable(
    observations: ReadonlyArray<CmaTableObservation>,
    opts: CmaTableOptions,
): CmaTableResult {
    const targetILCR = Number.isFinite(opts.targetILCR) ? (opts.targetILCR as number) : 1e-6;
    const targetHQ = Number.isFinite(opts.targetHQ) ? (opts.targetHQ as number) : 1.0;
    const now = opts.now || '';

    const rows: CmaTableRow[] = [];
    let totalExceedances = 0;

    for (const obs of observations || []) {
        if (!obs || typeof obs.sqiCas !== 'string') continue;
        const concentrations = _conc(obs);
        const result = computeRiskAndCma({
            sqiCas: obs.sqiCas,
            scenario: opts.scenario,
            ageGroup: opts.ageGroup,
            mediaImpacted: [obs.medium],
            concentrations,
            targetILCR,
            targetHQ,
            now,
        });
        const cma = result.cma;
        const observedUnit = _unitFor(obs.medium);
        const cmaUnit = result.cmaUnit || observedUnit;
        const status = _statusOf(obs.concentration, cma);
        if (status === 'exceeded') totalExceedances++;

        rows.push({
            sqiCas: obs.sqiCas,
            sqiName: obs.sqiName || obs.sqiCas,
            medium: obs.medium,
            observed: obs.concentration,
            observedUnit,
            ilcr: result.ilcr,
            hq: result.hq,
            cma: Number.isFinite(cma) ? cma : (cma === Infinity ? '∞' : 'N/D'),
            cmaUnit,
            status,
            limitingPathway: result.limitingPathway,
        });
    }

    const scenarioLabel = opts.scenarioLabel || opts.scenario;
    const html = _renderHtml(rows, { scenarioLabel, targetILCR, targetHQ, totalExceedances, now });
    const markdown = _renderMarkdown(rows, { scenarioLabel, targetILCR, targetHQ, totalExceedances });

    return {
        rows,
        html,
        markdown,
        meta: Object.freeze({
            scenarioId: opts.scenario,
            targetILCR,
            targetHQ,
            totalSqis: rows.length,
            totalExceedances,
            generatedAt: now,
        }),
    };
}

function _renderHtml(
    rows: ReadonlyArray<CmaTableRow>,
    opts: { scenarioLabel: string; targetILCR: number; targetHQ: number; totalExceedances: number; now: string },
): string {
    if (rows.length === 0) {
        return `<p class="cma-table-empty">Sem observações para tabela CMA — cenário ${_esc(opts.scenarioLabel)}.</p>`;
    }
    const header = `
        <thead>
            <tr>
                <th scope="col">SQI (CAS)</th>
                <th scope="col">Mídia</th>
                <th scope="col">C observada</th>
                <th scope="col">ILCR</th>
                <th scope="col">HQ</th>
                <th scope="col">CMA</th>
                <th scope="col">Status</th>
                <th scope="col">Via limitante</th>
            </tr>
        </thead>`;
    const body = rows
        .map((r) => `
        <tr class="cma-row cma-row--${_esc(r.status)}">
            <th scope="row">${_esc(r.sqiName)} <small>(${_esc(r.sqiCas)})</small></th>
            <td>${_esc(r.medium)}</td>
            <td>${_fmt(r.observed)} ${_esc(r.observedUnit)}</td>
            <td>${_fmt(r.ilcr)}</td>
            <td>${_fmt(r.hq)}</td>
            <td>${typeof r.cma === 'number' ? _fmt(r.cma) : _esc(r.cma)} ${_esc(r.cmaUnit)}</td>
            <td>${_statusBadge(r.status)}</td>
            <td>${_esc(r.limitingPathway)}</td>
        </tr>`)
        .join('');
    const tFoot = `
        <tfoot>
            <tr>
                <td colspan="8">
                    Cenário: <strong>${_esc(opts.scenarioLabel)}</strong> ·
                    Target ILCR: <code>${_fmt(opts.targetILCR)}</code> ·
                    Target HQ: <code>${_fmt(opts.targetHQ)}</code> ·
                    Excedências: <strong>${opts.totalExceedances}</strong> de ${rows.length}
                    ${opts.now ? ` · Gerado em ${_esc(opts.now)}` : ''}
                </td>
            </tr>
        </tfoot>`;
    return `<table class="cma-table" aria-label="Tabela CMA — ${_esc(opts.scenarioLabel)}">${header}<tbody>${body}</tbody>${tFoot}</table>`;
}

function _renderMarkdown(
    rows: ReadonlyArray<CmaTableRow>,
    opts: { scenarioLabel: string; targetILCR: number; targetHQ: number; totalExceedances: number },
): string {
    if (rows.length === 0) {
        return `_Sem observações para tabela CMA — cenário **${opts.scenarioLabel}**._`;
    }
    const head = '| SQI (CAS) | Mídia | C observada | ILCR | HQ | CMA | Status | Via limitante |\n| --- | --- | --- | --- | --- | --- | --- | --- |';
    const body = rows
        .map((r) =>
            `| ${r.sqiName} (${r.sqiCas}) | ${r.medium} | ${_fmt(r.observed)} ${r.observedUnit} | ${_fmt(r.ilcr)} | ${_fmt(r.hq)} | ${typeof r.cma === 'number' ? _fmt(r.cma) : r.cma} ${r.cmaUnit} | ${_statusBadge(r.status)} | ${r.limitingPathway} |`,
        )
        .join('\n');
    const footer = `\n\n_Cenário: **${opts.scenarioLabel}** · Target ILCR: \`${_fmt(opts.targetILCR)}\` · Target HQ: \`${_fmt(opts.targetHQ)}\` · Excedências: **${opts.totalExceedances}** de ${rows.length}._`;
    return `${head}\n${body}${footer}`;
}

export const CMA_TABLE_SOURCE = 'CETESB-RISK-001 RF-1.6 / Manual §7.1' as const;

/**
 * Bridge para integração com `core/report/_aiReportDataGroundingPure`.
 * Aceita observações normalizadas pelo report (shape `{parameter, value, unit, date, matrix}`)
 * e mapeia para o shape da tabela CMA via `casLookup`.
 *
 * Retorna apenas o `html` (placeholder consumível pelo template) + `meta` para audit.
 */
export interface NormalizedObsForCma {
    /** Nome humano OU CAS da SQI (resolvido por `casLookup` se for nome). */
    parameter: string;
    value: number;
    unit: string;
    /** Mídia. Default: 'groundwater' (default do report). */
    matrix?: string;
}

export interface BuildCmaTableFromObsOptions {
    scenario: ScenarioId;
    /** Função que mapeia nome do parâmetro → CAS conhecido (null se não mapeia). */
    casLookup?: (parameterName: string) => string | null;
    targetILCR?: number;
    targetHQ?: number;
    ageGroup?: 'child' | 'adult';
    scenarioLabel?: string;
    now?: string;
    /** Concentração mínima para incluir (ignora ND/zero); default 0. */
    minConcentration?: number;
}

/**
 * Constrói tabela CMA a partir de observações já normalizadas pelo report.
 * Combina observações duplicadas (mesma SQI + mídia) pelo VALOR MÁXIMO
 * (conservador — pior cenário regulatório).
 */
export function buildCmaTableFromObservations(
    obs: ReadonlyArray<NormalizedObsForCma>,
    opts: BuildCmaTableFromObsOptions,
): CmaTableResult {
    const minC = Number.isFinite(opts.minConcentration) ? (opts.minConcentration as number) : 0;
    const lookup = opts.casLookup || (() => null);
    // Mapa: chave = `${cas}|${medium}` → maior concentração observada
    const byKey = new Map<string, CmaTableObservation>();
    for (const o of obs || []) {
        if (!o || typeof o.parameter !== 'string') continue;
        if (!Number.isFinite(o.value) || o.value <= minC) continue;
        const matrix = String(o.matrix || 'groundwater');
        const medium: Medium = matrix === 'soil' ? 'soil' : matrix === 'air' ? 'air' : 'groundwater';
        // Resolve CAS: tenta lookup; se não, usa o próprio parameter (pode ser CAS direto)
        const cas = lookup(o.parameter) || o.parameter;
        const key = `${cas}|${medium}`;
        const existing = byKey.get(key);
        if (!existing || o.value > existing.concentration) {
            byKey.set(key, {
                sqiCas: cas,
                sqiName: o.parameter,
                medium,
                concentration: o.value,
            });
        }
    }
    const arr = Array.from(byKey.values());
    return buildCmaTable(arr, opts);
}
