// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ECBT Score panel — pure logic.
 *
 * Builds the "Veredito da Área" panel HTML from a DualReportVM (F4 combinator).
 * Three blocks side by side (SPEC §5):
 *
 *   ┌── Bloco 1 (Físico EIS) ──┬── Bloco 2 (R/I) ──┬── Bloco 3 (ECBT Score $) ──┐
 *
 * Returns plain HTML string + ARIA-ready snippet. Tests live in
 * `tests/ecbt-score-panel-pure.test.mjs` and run in plain Node — no DOM.
 *
 * The wire layer (`ecbtScorePanel.ts`) handles the modal overlay, close, click
 * routing and i18n translation pass. This file is the deterministic shaper.
 */

import type { EcbtHudSnapshotInput } from './_ecbtScoreHudPure.js';

export interface PhysicalBlock {
    /** Severity continuum value 0-1 (from core/severity). */
    readonly S: number;
    /** Risk component 0-1. */
    readonly R: number;
    /** Impact component 0-1. */
    readonly I: number;
    /** Confidence κ = integrity3CTA/5 ∈ [0,1]. */
    readonly kappa: number;
    /** Optional raw 3CTA+ integrity 0-5. */
    readonly integrity3CTA?: number | null;
    /** True if T≤2 ∨ A≤2 (label suppressed). */
    readonly veto: boolean;
    readonly vetoReason?: string | null;
    /** Translated severity label (e.g. 'critica', 'alta'). */
    readonly severityLabel: string;
}

export interface CompensationByInstrument {
    readonly instrument: string;
    readonly amount: number;
}

export interface PanelInput {
    readonly physical: PhysicalBlock;
    /** Same shape as the HUD snapshot — reused intentionally. */
    readonly monetary: EcbtHudSnapshotInput;
    /** F8 addendum: breakdown of compensations by legal instrument. */
    readonly compensations?: ReadonlyArray<CompensationByInstrument> | null;
}

function clamp01(v: number): number {
    if (!Number.isFinite(v)) return 0;
    if (v < 0) return 0;
    if (v > 1) return 1;
    return v;
}

function pct100(v: number): string {
    return `${(clamp01(v) * 100).toFixed(0)}%`;
}

function escapeHtml(s: string): string {
    return String(s).replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
    );
}

function severityTone(severityLabel: string): string {
    switch (severityLabel) {
        case 'critica':
            return '#ef4444';
        case 'severa':
            return '#f97316';
        case 'alta':
            return '#f59e0b';
        case 'moderada':
            return '#eab308';
        case 'baixa':
            return '#22c55e';
        default:
            return '#94a3b8';
    }
}

function signTone(sign: string | undefined): string {
    switch (sign) {
        case 'surplus':
            return '#22c55e';
        case 'deficit':
            return '#ef4444';
        case 'zero':
            return '#f59e0b';
        default:
            return '#94a3b8';
    }
}

function signGlyph(sign: string | undefined): '▲' | '▼' | '◆' | '–' {
    switch (sign) {
        case 'surplus':
            return '▲';
        case 'deficit':
            return '▼';
        case 'zero':
            return '◆';
        default:
            return '–';
    }
}

function modeKey(mode: string | undefined): string {
    if (mode === 'marketIntensity' || mode === 'returnOnCost' || mode === 'extension' || mode === 'absolute') {
        return `ecbtScore.mode.${mode}`;
    }
    return 'ecbtScore.mode.absolute';
}

function fmtMoneyShort(v: number | undefined, currency: string | undefined): string {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    const cur = (currency || 'BRL').toUpperCase();
    const sym = cur === 'USD' ? 'US$' : cur === 'BTC' ? '₿' : cur === 'MIXED' || cur === 'mixed' ? '∑' : 'R$';
    const abs = Math.abs(n);
    const sign = n < 0 ? '−' : '';
    let body: string;
    if (abs >= 1e9) body = `${(abs / 1e9).toFixed(1)}B`;
    else if (abs >= 1e6) body = `${(abs / 1e6).toFixed(1)}M`;
    else if (abs >= 1e3) body = `${(abs / 1e3).toFixed(1)}k`;
    else body = abs.toFixed(0);
    return `${sign}${sym} ${body}`;
}

function fmtPctNoClamp(p: number | null | undefined): string {
    if (p === null || p === undefined || !Number.isFinite(p)) return '—';
    const sign = p > 0 ? '+' : p < 0 ? '−' : '';
    const abs = Math.abs(p);
    const dec = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
    return `${sign}${abs.toFixed(dec).replace('.', ',')}%`;
}

export interface PanelHtmlOutput {
    readonly title: string;
    readonly html: string;
    readonly ariaLabel: string;
}

/**
 * Build the dual-report panel HTML.
 *
 * - Block 1 (Physical EIS): label + severity bar + confidence κ + veto flag.
 * - Block 2 (R/I decomposition): two thin bars, R left / I right.
 * - Block 3 (Monetary ECBT Score): big pct (no clamp) + band + amount + denominator.
 *
 * Uses `data-i18n` attributes everywhere; the wire layer translates after
 * insertion. No script tags, no event handlers — caller wires those.
 */
export function buildEcbtScorePanelHtml(input: PanelInput): PanelHtmlOutput {
    if (!input || !input.physical || !input.monetary) {
        throw new TypeError(
            'buildEcbtScorePanelHtml: physical + monetary blocks required (anti-N3)',
        );
    }
    const { physical, monetary } = input;

    const sevPct = pct100(physical.S);
    const sevTone = severityTone(physical.severityLabel);
    const kappaPct = pct100(physical.kappa);
    const rPct = pct100(physical.R);
    const iPct = pct100(physical.I);

    const sign = monetary.sign as string | undefined;
    const tone = signTone(sign);
    const arrow = signGlyph(sign);
    const pctTxt = fmtPctNoClamp(monetary.pct ?? null);
    const amountTxt = fmtMoneyShort(monetary.amount, monetary.currency);
    const lowTxt = fmtPctNoClamp(monetary.pctLow ?? null);
    const highTxt = fmtPctNoClamp(monetary.pctHigh ?? null);
    const denomKind = monetary.denominatorKind ? escapeHtml(monetary.denominatorKind) : '—';
    const modeI18nKey = escapeHtml(modeKey(monetary.mode));

    const physicalBlock = `
<section class="ecbt-panel-block ecbt-panel-block--physical">
    <header>
        <h3 data-i18n="ecbtScore.title">ECBT Score</h3>
        <span class="ecbt-panel-sub" data-i18n="eis.severity">Severity</span>
    </header>
    <div class="ecbt-panel-bar" style="background:linear-gradient(90deg,${sevTone} ${sevPct},rgba(255,255,255,0.06) ${sevPct});" aria-hidden="true"></div>
    <div class="ecbt-panel-line">
        <span class="ecbt-panel-key" data-severity-label="${escapeHtml(physical.severityLabel)}">${escapeHtml(physical.severityLabel)}</span>
        <span class="ecbt-panel-value">S=${sevPct}</span>
    </div>
    <div class="ecbt-panel-line">
        <span class="ecbt-panel-key" data-i18n="eis.confidence">Confidence</span>
        <span class="ecbt-panel-value">κ=${kappaPct}</span>
    </div>
    ${physical.veto ? `<div class="ecbt-panel-veto" role="status" data-i18n="eis.notConfirmed" data-veto-reason="${escapeHtml(physical.vetoReason || '')}">Not confirmed</div>` : ''}
</section>`;

    const decompBlock = `
<section class="ecbt-panel-block ecbt-panel-block--decomp">
    <header>
        <h3><span data-i18n="eis.risk">Risk</span> / <span data-i18n="eis.impact">Impact</span></h3>
    </header>
    <div class="ecbt-panel-row">
        <span class="ecbt-panel-key" data-i18n="eis.risk">Risk</span>
        <div class="ecbt-panel-bar ecbt-panel-bar--thin"><span style="width:${rPct};background:#3b82f6;"></span></div>
        <span class="ecbt-panel-value">${rPct}</span>
    </div>
    <div class="ecbt-panel-row">
        <span class="ecbt-panel-key" data-i18n="eis.impact">Impact</span>
        <div class="ecbt-panel-bar ecbt-panel-bar--thin"><span style="width:${iPct};background:#8b5cf6;"></span></div>
        <span class="ecbt-panel-value">${iPct}</span>
    </div>
</section>`;

    // F8 addendum — render chips per legal instrument when compensations present.
    const comps = Array.isArray(input.compensations) ? input.compensations : [];
    let compensationBlock = '';
    if (comps.length > 0) {
        const chips = comps
            .map((c) => {
                if (!c || typeof c.instrument !== 'string' || !Number.isFinite(c.amount)) return '';
                const tag = escapeHtml(c.instrument);
                const amt = fmtMoneyShort(c.amount, monetary.currency);
                return `<span class="ecbt-panel-comp-chip" data-instrument="${tag}" data-i18n="ecbtScore.compensation.instruments.${tag}">${tag}: ${escapeHtml(amt)}</span>`;
            })
            .filter(Boolean)
            .join(' ');
        compensationBlock = `
    <div class="ecbt-panel-comp" data-i18n-title="ecbtScore.compensation.title">
        <span class="ecbt-panel-comp-label" data-i18n="ecbtScore.compensation.title">Compensations</span>
        ${chips}
    </div>`;
    }

    // F8 addendum — render the netZero banner when monetary.netZero is true.
    const netZeroBanner = monetary.netZero === true
        ? `<div class="ecbt-panel-netzero-banner" role="status" data-i18n="ecbtScore.compensation.netZero">Monetary verdict neutral (zero-to-zero)</div>`
        : '';

    // CC-14 wire UI — chip de banda de robustez (denominador estável).
    // Cores: verde (positivo robusto), âmbar (sinal misto — incerteza cruza
    // zero), vermelho (negativo robusto). Rationale PN-3 como tooltip.
    let stableBandChip = '';
    if (monetary.stableBand) {
        const bandTone = monetary.stableBand === 'positivo_robusto' ? '#22c55e'
            : monetary.stableBand === 'negativo_robusto' ? '#ef4444' : '#f59e0b';
        const bandFallback = monetary.stableBand === 'positivo_robusto' ? 'Positivo robusto'
            : monetary.stableBand === 'negativo_robusto' ? 'Negativo robusto' : 'Sinal misto';
        const rationaleAttr = monetary.denominatorRationale
            ? ` title="${escapeHtml(monetary.denominatorRationale)}"`
            : '';
        stableBandChip = `
    <div class="ecbt-panel-stable-band" data-band="${escapeHtml(monetary.stableBand)}"${rationaleAttr} style="color:${bandTone};border:1px solid ${bandTone};border-radius:4px;padding:2px 8px;display:inline-block;font-size:0.78rem;margin-top:4px;">
        <span data-i18n="ecbtScore.stableBand.${escapeHtml(monetary.stableBand)}">${bandFallback}</span>
    </div>`;
    }

    const monetaryBlock = `
<section class="ecbt-panel-block ecbt-panel-block--monetary" style="border-color:${tone};">
    <header>
        <h3 data-i18n="ecbtScore.title">ECBT Score</h3>
        <span class="ecbt-panel-mode" data-i18n="${modeI18nKey}">${escapeHtml(monetary.mode || 'absolute')}</span>
    </header>
    ${netZeroBanner}
    <div class="ecbt-panel-big" style="color:${tone};">${arrow} ${escapeHtml(pctTxt)}</div>
    <div class="ecbt-panel-band">
        <span data-i18n="ecbtScore.band">Band</span>: [${escapeHtml(lowTxt)}; ${escapeHtml(highTxt)}]
    </div>
    <div class="ecbt-panel-line">
        <span class="ecbt-panel-key" data-i18n="ecbtScore.amount">Net amount</span>
        <span class="ecbt-panel-value">${escapeHtml(amountTxt)}</span>
    </div>
    <div class="ecbt-panel-line">
        <span class="ecbt-panel-key">d:</span>
        <span class="ecbt-panel-value">${denomKind}</span>
    </div>${stableBandChip}${compensationBlock}
</section>`;

    const html = `<div class="ecbt-panel-grid">${physicalBlock}${decompBlock}${monetaryBlock}</div>`;
    const tail = monetary.netZero ? ', balanço monetário neutro (compensação aplicada)' : '';
    const ariaLabel = `ECBT Score panel. Severity ${physical.severityLabel} ${sevPct}, confidence ${kappaPct}, monetary ${pctTxt}, amount ${amountTxt}${tail}.`;
    return { title: 'ECBT Score', html, ariaLabel };
}
