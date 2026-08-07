// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ECBT Score HUD — pure formatting / layout helpers.
 *
 * No DOM, no Canvas API. Returns deterministic strings + color tokens that
 * the canvas painter (in `ecbtScoreHud.ts`) consumes. Tests live in
 * `tests/ecbt-score-hud-pure.test.mjs` and run in plain Node.
 *
 * Linked to SPEC_ECBT_SCORE_MONETARY_EIS §5 (UX/UI — 3 blocks lado a lado;
 * here we deliver the *third* block as a dedicated HUD widget alongside
 * `eis-hud-canvas` and `cost-hud-canvas`).
 */

// HUD-UX-PAIN-DRAIN-001 W1.5 (D19): formatters canônicos vêm do catálogo
// compartilhado — este módulo apenas re-exporta p/ manter API backward-compat.
import {
    formatKappa as _sharedFormatKappa,
    formatMoney as _sharedFormatMoney,
} from './_hudCardTooltipsPure.js';
import type { FineImpactOutput } from '../../core/ecbtScore/_fineImpactPure.js';

export type EcbtSign = 'surplus' | 'deficit' | 'zero' | 'unknown';
export type EcbtMode = 'marketIntensity' | 'returnOnCost' | 'extension' | 'absolute';

export interface EcbtHudSnapshotInput {
    readonly amount?: number;
    readonly currency?: string;
    readonly sign?: EcbtSign | string;
    readonly pct?: number | null;
    readonly pctLow?: number | null;
    readonly pctHigh?: number | null;
    readonly mode?: EcbtMode | string;
    readonly denominatorKind?: string | null;
    readonly kappa?: number;
    /** F8 addendum: when true, render the "♻ Neutro" badge over the amount. */
    readonly netZero?: boolean;
    /** F8 addendum: sum of compensations applied (BRL/USD/...) — surfaced as
     *  a small footer chip when > 0 (UI fallback: numeric value only). */
    readonly vCompensation?: number;
    /** FIS-001 Fase 2 — FineImpactScore ∈ [0, 5]. null/undefined = sem dado. */
    readonly fineImpactScore?: number | null;
    /** Contagem de multas na janela de recorrência. */
    readonly fineCount?: number;
    /** CC-14 wire UI — banda de robustez do ratio (denominador estável):
     *  combina incerteza GUM no numerador (±U) com banda de volatilidade do
     *  denominador. Origem: computeStableEcbtReport (_ecbtDenominatorStablePure). */
    readonly stableBand?: 'positivo_robusto' | 'sinal_misto' | 'negativo_robusto' | null;
    /** CC-14 — rationale PN-3 do denominador escolhido na cascata
     *  revenue→EBITDA→EV→asset_proxy (exibido como tooltip). */
    readonly denominatorRationale?: string | null;
    /** HUD-CARDS-REDESIGN-001 F3 (Calvin 2026-06-10): passivo/ativo brutos para
     *  bullet chart layout — quando ambos > 0, paint usa bullet vertical em vez
     *  do layout textual padrão. */
    readonly passivoAmount?: number;
    readonly ativoAmount?: number;
    /** FIS-001 Fase 3.5 (Calvin 2026-06-09): audit completo do FineImpact
     *  propagado pelo painel para tooltip/detalhe (finesInWindow etc.). */
    readonly fineImpactAudit?: FineImpactOutput | null;
}

export interface EcbtHudSnapshot {
    readonly available: boolean;
    readonly amountTxt: string;
    readonly pctTxt: string;
    readonly bandTxt: string;
    readonly modeBadge: string;
    readonly modeFull: string;
    readonly denomKindTxt: string;
    readonly arrow: '▲' | '▼' | '◆' | '–';
    readonly tone: string;
    readonly kappaTxt: string;
    /** F8 addendum: ready-to-render neutrality badge ('♻ Neutro' or '') */
    readonly neutralBadge: string;
    /** F8 addendum: compensation footer chip ('Comp: R$ Xk') or '' when none */
    readonly compensationChip: string;
    /** HUD-CARDS-REDESIGN-001 F3: bullet layout when both > 0. */
    readonly passivoAmount: number;
    readonly ativoAmount: number;
    /** Passivo / Ativo formatado para display (R$ X.X M etc) */
    readonly passivoTxt: string;
    readonly ativoTxt: string;
}

const TONE_GREEN = '#22c55e';
const TONE_RED = '#ef4444';
const TONE_AMBER = '#f59e0b';
const TONE_MUTED = '#94a3b8';

/**
 * Pick the visual tone (border + accent color) from sign.
 *
 * - surplus → green
 * - deficit → red
 * - zero    → amber
 * - unknown → muted gray (graceful empty state)
 */
export function pickTone(sign: string | undefined): string {
    switch (sign) {
        case 'surplus':
            return TONE_GREEN;
        case 'deficit':
            return TONE_RED;
        case 'zero':
            return TONE_AMBER;
        default:
            return TONE_MUTED;
    }
}

/**
 * Pick the directional arrow glyph by sign. Plain UTF-8 glyphs so the
 * canvas renderer works with any font (no emoji deps).
 */
export function pickArrow(sign: string | undefined): '▲' | '▼' | '◆' | '–' {
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

/**
 * Short letter badge for the mode.
 *
 *   marketIntensity → F (Financial materiality)
 *   returnOnCost    → R (Return on cost / BCR−1)
 *   extension       → I (Intensity per ha/capita)
 *   absolute        → ABS
 *
 * The full mode name is exposed separately via `modeFullLabel()` for aria.
 */
export function modeBadge(mode: string | undefined): string {
    switch (mode) {
        case 'marketIntensity':
            return 'F';
        case 'returnOnCost':
            return 'R';
        case 'extension':
            return 'I';
        case 'absolute':
            return 'ABS';
        default:
            return '–';
    }
}

export function modeFullLabel(mode: string | undefined): string {
    switch (mode) {
        case 'marketIntensity':
            return 'Materialidade Financeira';
        case 'returnOnCost':
            return 'Retorno sobre Custo';
        case 'extension':
            return 'Intensidade por Extensão';
        case 'absolute':
            return 'Valor Absoluto';
        default:
            return '—';
    }
}

/**
 * Compact money formatting — re-export do formatter canônico compartilhado
 * (W1.5/D19: única fonte em `_hudCardTooltipsPure`). Mantido aqui por
 * backward-compat de import path.
 */
export const formatMoney = _sharedFormatMoney;

/**
 * Percent formatting WITHOUT clamp — magnitudes beyond ±100 % are critical
 * information (passive larger than firm → "environmental insolvency").
 * Uses Brazilian decimal separator (vírgula) by request.
 */
export function formatPct(pct: number | null | undefined): string {
    if (pct === null || pct === undefined || !Number.isFinite(pct)) return '—';
    const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
    const abs = Math.abs(pct);
    const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
    return `${sign}${abs.toFixed(decimals).replace('.', ',')}%`;
}

/**
 * Band formatting. Returns "±Y%" when low/high are symmetric (within ε),
 * otherwise "[low; high]%".
 */
export function formatBand(
    pctLow: number | null | undefined,
    pctHigh: number | null | undefined,
    centre: number | null | undefined,
): string {
    if (pctLow == null || pctHigh == null || !Number.isFinite(pctLow) || !Number.isFinite(pctHigh)) {
        return '±—';
    }
    const c = Number.isFinite(Number(centre)) ? Number(centre) : (pctLow + pctHigh) / 2;
    const lowDelta = c - pctLow;
    const highDelta = pctHigh - c;
    if (Math.abs(lowDelta - highDelta) < 1e-6) {
        const half = (highDelta < 0 ? 0 : highDelta);
        const decimals = half >= 10 ? 1 : 2;
        return `±${half.toFixed(decimals).replace('.', ',')}%`;
    }
    const dec = (v: number) => (Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)).replace('.', ',');
    return `[${dec(pctLow)}; ${dec(pctHigh)}]%`;
}

/** Re-export do κ formatter canônico (W1.5/D19 — vírgula decimal sempre). */
export const formatKappa = _sharedFormatKappa;

/**
 * Truncate an arbitrary string to fit the badge area. Used for denominator
 * kind labels which can be free-form ("marketCap", "restorationCost", ...).
 */
export function shortKind(kind: string | null | undefined, maxLen = 14): string {
    if (!kind) return '—';
    const s = String(kind);
    return s.length > maxLen ? `${s.slice(0, maxLen - 1)}…` : s;
}

/**
 * Build the frozen snapshot consumed by the canvas painter. Handles the
 * empty / unavailable case explicitly — never throws, always returns a
 * complete VM so the painter can render the muted "—" widget state.
 */
export function buildEcbtHudSnapshot(input: EcbtHudSnapshotInput | null | undefined): EcbtHudSnapshot {
    if (!input || typeof input !== 'object') {
        return Object.freeze({
            available: false,
            amountTxt: '—',
            pctTxt: '—',
            bandTxt: '±—',
            modeBadge: '–',
            modeFull: '—',
            denomKindTxt: '—',
            arrow: '–' as const,
            tone: TONE_MUTED,
            kappaTxt: 'κ:—',
            neutralBadge: '',
            compensationChip: '',
            passivoAmount: 0,
            ativoAmount: 0,
            passivoTxt: '—',
            ativoTxt: '—',
        });
    }
    const sign = input.sign ?? 'unknown';
    const passivoAmount = Number(input.passivoAmount) || 0;
    const ativoAmount = Number(input.ativoAmount) || 0;
    const snap: EcbtHudSnapshot = {
        available: true,
        amountTxt: formatMoney(input.amount, input.currency),
        pctTxt: formatPct(input.pct ?? null),
        bandTxt: formatBand(input.pctLow ?? null, input.pctHigh ?? null, input.pct ?? null),
        modeBadge: modeBadge(input.mode),
        modeFull: modeFullLabel(input.mode),
        denomKindTxt: shortKind(input.denominatorKind),
        arrow: pickArrow(sign),
        tone: pickTone(sign),
        kappaTxt: formatKappa(input.kappa),
        // F8 addendum strings (anti-N9: only monetary state, never moves physical)
        neutralBadge: input.netZero === true ? '♻ Neutro' : '',
        compensationChip:
            typeof input.vCompensation === 'number' &&
            Number.isFinite(input.vCompensation) &&
            input.vCompensation > 0
                ? `Comp: ${formatMoney(input.vCompensation, input.currency)}`
                : '',
        // HUD-CARDS-REDESIGN-001 F3 (Calvin 2026-06-10): passivo/ativo brutos
        passivoAmount,
        ativoAmount,
        passivoTxt: passivoAmount > 0 ? formatMoney(passivoAmount, input.currency) : '—',
        ativoTxt: ativoAmount > 0 ? formatMoney(ativoAmount, input.currency) : '—',
    };
    return Object.freeze(snap);
}

/**
 * Build an a11y / tooltip label from a snapshot. Single string, never null.
 */
export function buildAriaLabel(snapshot: EcbtHudSnapshot): string {
    if (!snapshot || !snapshot.available) {
        return 'ECBT Score: dados indisponíveis. Clique para abrir o painel.';
    }
    const tail = snapshot.neutralBadge
        ? ` Compensação aplicada — balanço monetário neutro.`
        : '';
    return `ECBT Score (${snapshot.modeFull}): ${snapshot.pctTxt} ${snapshot.bandTxt}, valor líquido ${snapshot.amountTxt}, ${snapshot.kappaTxt}.${tail} Clique para abrir o painel.`;
}
