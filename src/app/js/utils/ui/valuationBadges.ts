// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// SPEC_COST_VALUATION_PROVENANCE_CONSOLIDATION — Fase 3 UI helpers (claude - executor)
// Pure HTML builders para consumidores (cost-analysis-panel, reports, dashboards).
//
// Cada helper retorna string HTML pronto para insertion. Não toca DOM
// diretamente — caller injeta via .innerHTML ou template literals.
//
// i18n: usa chaves valuation.* (commit 6989e105). Fallback inline quando t() ausente.

import { escapeHtml } from '../helpers/html.js';
import { classifyEisVerdict } from '../../core/valuation/_eisBindingPure.js';

/**
 * ValuationResult shape (subset relevante).
 * Mantém compatível com ValuationResult<T> de core/valuation/_types.
 */
export interface ValuationResultLike {
    value: unknown;
    unit?: string;
    provenance?: ReadonlyArray<unknown>;
    method?: string;
    source?: string;
    uncertainty?: { min: number; expected: number; max: number };
    integrity?: { eis: number };
}

function _tFallback(key: string, fallback: string): string {
    // Lazy: caller's i18n imported asynchronously is overkill here.
    // Always return fallback — callers que querem i18n usam t() externamente
    // e passam labels customizadas via opts.
    return fallback;
}

/**
 * Badge de proveniência — mostra contagem de TUPLAx refs.
 *   N refs → "Proveniência: N registros" (verde se ≥1, cinza se 0)
 */
export function renderProvenanceBadge(
    result: ValuationResultLike | null | undefined,
    opts: { label?: string } = {},
): string {
    if (!result) return '';
    const count = Array.isArray(result.provenance) ? result.provenance.length : 0;
    const label = opts.label || _tFallback('valuation.provenance.label', 'Proveniência');
    const cls = count > 0 ? 'val-prov-badge val-prov-badge--ok' : 'val-prov-badge val-prov-badge--empty';
    const text = `${escapeHtml(label)}: ${count}`;
    return `<span class="${cls}" role="status" aria-label="${escapeHtml(text)}">${escapeHtml(text)}</span>`;
}

/**
 * Badge de integridade EIS — green/yellow/red/unknown.
 *   green  → "Alta integridade"  (eis ≥ 4.5)
 *   yellow → "Média integridade" (eis ≥ 3.5)
 *   red    → "Baixa integridade" (eis < 3.5)
 *   unknown→ omitido (retorna '')
 */
export function renderIntegrityBadge(
    result: ValuationResultLike | null | undefined,
    opts: { labels?: { green?: string; yellow?: string; red?: string } } = {},
): string {
    if (!result || !result.integrity || typeof result.integrity.eis !== 'number') return '';
    const verdict = classifyEisVerdict(result.integrity.eis);
    if (verdict === 'unknown') return '';
    const labels = {
        green: opts.labels?.green || _tFallback('valuation.integrity.green', 'Alta integridade'),
        yellow: opts.labels?.yellow || _tFallback('valuation.integrity.yellow', 'Média integridade'),
        red: opts.labels?.red || _tFallback('valuation.integrity.red', 'Baixa integridade — revisar registros'),
    };
    const text = `${labels[verdict]} (EIS ${result.integrity.eis.toFixed(2)})`;
    const cls = `val-int-badge val-int-badge--${verdict}`;
    return `<span class="${cls}" role="status" aria-label="${escapeHtml(text)}">${escapeHtml(text)}</span>`;
}

/**
 * Faixa de incerteza — mostra "min – expected – max" formatado.
 *   Sem uncertainty no result → retorna apenas o value escalar formatado.
 */
export function renderUncertaintyRange(
    result: ValuationResultLike | null | undefined,
    opts: { unit?: string; formatter?: (n: number) => string; label?: string } = {},
): string {
    if (!result) return '';
    const unit = opts.unit || result.unit || '';
    const fmt = opts.formatter || ((n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—'));
    if (!result.uncertainty) {
        const val = typeof result.value === 'number' ? fmt(result.value) : String(result.value);
        return `<span class="val-range val-range--point">${escapeHtml(val)} ${escapeHtml(unit)}</span>`;
    }
    const u = result.uncertainty;
    const label = opts.label || _tFallback('valuation.uncertainty.range', 'Faixa de incerteza');
    const text = `${fmt(u.min)} – ${fmt(u.expected)} – ${fmt(u.max)} ${unit}`.trim();
    return (
        `<span class="val-range val-range--gum" aria-label="${escapeHtml(label + ': ' + text)}">` +
        escapeHtml(text) +
        '</span>'
    );
}

/**
 * Composição completa: badges + range em um único container.
 * Útil para drill-down rows / detail panels.
 */
export function renderValuationBadges(
    result: ValuationResultLike | null | undefined,
    opts: {
        showProvenance?: boolean;
        showIntegrity?: boolean;
        showRange?: boolean;
        unit?: string;
    } = {},
): string {
    if (!result) return '';
    const showProv = opts.showProvenance !== false;
    const showInt = opts.showIntegrity !== false;
    const showRng = opts.showRange !== false;
    const parts: string[] = [];
    if (showRng) parts.push(renderUncertaintyRange(result, { ...(opts.unit ? { unit: opts.unit } : {}) }));
    if (showProv) parts.push(renderProvenanceBadge(result));
    if (showInt) parts.push(renderIntegrityBadge(result));
    const inner = parts.filter(Boolean).join(' ');
    if (!inner) return '';
    return `<div class="val-badges">${inner}</div>`;
}

/** Metadata para introspecção / testes. */
export const VALUATION_BADGES_META = Object.freeze({
    spec: 'COST_VALUATION_PROVENANCE_CONSOLIDATION',
    phase: 'F3-ui-badges',
    delivered_at: '2026-06-02',
    exports: Object.freeze([
        'renderProvenanceBadge',
        'renderIntegrityBadge',
        'renderUncertaintyRange',
        'renderValuationBadges',
    ]),
});
