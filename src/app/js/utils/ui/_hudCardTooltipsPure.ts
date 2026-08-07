// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// HUD-CARDS-REDESIGN-001 F1 — pure catalog de tooltips canônicos para os
// 3 cards HUD (EIS Radar, ECBT Score, Violations). Frozen, i18n-aware via
// chaves t() resolvidas em runtime.
//
// Cada entry descreve: title curto + description user-friendly + (opcional)
// formula técnica + threshold ranges + link p/ docs.
//
// USO: hudCardTooltipsRuntime.ts importa CATALOG e atrela hover/touch.
// Cheap test trava cobertura de TODOS data-tooltip-key referenciados em paint.

export type HudCardTooltipKey =
    // EIS Radar (M1)
    | 'eisHud.score'
    | 'eisHud.axis.T'
    | 'eisHud.axis.A'
    | 'eisHud.axis.Cp'
    | 'eisHud.axis.Ty'
    | 'eisHud.axis.Cs'
    | 'eisHud.axis.Cm'
    | 'eisHud.mode'
    | 'eisHud.kappa'
    | 'eisHud.trend'
    | 'eisHud.subtitle.3CTA'
    | 'eisHud.bullet'
    // ECBT (M2)
    | 'ecbtHud.title'
    | 'ecbtHud.mode.ABS'
    | 'ecbtHud.mode.MKI'
    | 'ecbtHud.passivo'
    | 'ecbtHud.ativo'
    | 'ecbtHud.liquido.positive'
    | 'ecbtHud.liquido.negative'
    | 'ecbtHud.kappa'
    | 'ecbtHud.uncertainty'
    // Violations (M3 — novo)
    | 'violationsHud.title'
    | 'violationsHud.counter'
    | 'violationsHud.critical'
    | 'violationsHud.medium'
    | 'violationsHud.low'
    | 'violationsHud.preset'
    | 'violationsHud.preset.none'
    | 'violationsHud.sparkline'
    // Cost + compass + globe (W2 — cobertura dos 6 cards)
    | 'costHud.title'
    | 'costHud.top'
    | 'costHud.uncertainty'
    | 'compassHud.title'
    | 'globeHud.title';

/** Threshold range com label + cor semântica WCAG. */
export interface ThresholdRange {
    readonly min: number | null; // null = -∞
    readonly max: number | null; // null = +∞
    readonly label: string;
    readonly tone: 'green' | 'yellow' | 'red' | 'neutral';
}

export interface HudCardTooltip {
    readonly key: HudCardTooltipKey;
    /** Título curto i18n key (resolvido via t()). */
    readonly titleKey: string;
    /** Description i18n key — texto detalhado user-friendly. */
    readonly descriptionKey: string;
    /** Formula técnica opcional (monospace). */
    readonly formula?: string;
    /** Threshold ranges para indicador visual + screen reader. */
    readonly thresholds?: ReadonlyArray<ThresholdRange>;
    /** Link i18n key + path em docs.html (#fragment). */
    readonly docsHash?: string;
}

/**
 * EIS thresholds — derivados de getVerdictColor (handlers/eis.ts:2285):
 *   eis >= 4.5  → verde (rgb(34,197,94))
 *   eis >= 3.5  → amarelo (rgb(234,179,8))
 *   eis <  3.5  → vermelho (rgb(239,68,68))
 */
export const EIS_THRESHOLDS: ReadonlyArray<ThresholdRange> = Object.freeze([
    Object.freeze({ min: 4.5, max: 5.0, label: 'hud.eis.threshold.reliable', tone: 'green' as const }),
    Object.freeze({ min: 3.5, max: 4.5, label: 'hud.eis.threshold.verify', tone: 'yellow' as const }),
    Object.freeze({ min: 0.0, max: 3.5, label: 'hud.eis.threshold.insufficient', tone: 'red' as const }),
]);

/** Sign para ECBT amount: surplus / deficit / zero. */
export const ECBT_SIGN_THRESHOLDS: ReadonlyArray<ThresholdRange> = Object.freeze([
    Object.freeze({ min: 0.01, max: null, label: 'hud.ecbt.threshold.surplus', tone: 'green' as const }),
    Object.freeze({ min: -0.01, max: 0.01, label: 'hud.ecbt.threshold.zero', tone: 'neutral' as const }),
    Object.freeze({ min: null, max: -0.01, label: 'hud.ecbt.threshold.deficit', tone: 'red' as const }),
]);

/** Violation severity mapping — CONAMA 420 Anexo II (VR/VP/VI). */
export const VIOLATIONS_SEVERITY: ReadonlyArray<ThresholdRange> = Object.freeze([
    Object.freeze({ min: null, max: null, label: 'hud.violations.severity.critical', tone: 'red' as const }),
    Object.freeze({ min: null, max: null, label: 'hud.violations.severity.medium', tone: 'yellow' as const }),
    Object.freeze({ min: null, max: null, label: 'hud.violations.severity.low', tone: 'green' as const }),
]);

/**
 * CATALOG canônico. Cada entry tem `key` que deve bater com `data-tooltip-key`
 * referenciado no paint do canvas correspondente.
 *
 * NOTA: ordem do array é estável p/ snapshot tests; mantenha agrupado por HUD.
 */
export const HUD_CARD_TOOLTIPS_CATALOG: ReadonlyArray<HudCardTooltip> = Object.freeze([
    // ============================================================
    // EIS Radar (M1)
    // ============================================================
    Object.freeze({
        key: 'eisHud.score' as HudCardTooltipKey,
        titleKey: 'hud.eis.score.title',
        descriptionKey: 'hud.eis.score.desc',
        formula: 'EIS = ∏ axis_i^weight_i  (média geométrica não-compensatória)',
        thresholds: EIS_THRESHOLDS,
        docsHash: '#eis-score',
    }),
    Object.freeze({
        key: 'eisHud.axis.T' as HudCardTooltipKey,
        titleKey: 'hud.eis.axis.T.title',
        descriptionKey: 'hud.eis.axis.T.desc',
        formula: 'T = base × credentialMultiplier  (doutor 2.0× / mestre 1.6×)',
        docsHash: '#eis-axis-transparencia',
    }),
    Object.freeze({
        key: 'eisHud.axis.A' as HudCardTooltipKey,
        titleKey: 'hud.eis.axis.A.title',
        descriptionKey: 'hud.eis.axis.A.desc',
        docsHash: '#eis-axis-acuracia',
    }),
    Object.freeze({
        key: 'eisHud.axis.Cp' as HudCardTooltipKey,
        titleKey: 'hud.eis.axis.Cp.title',
        descriptionKey: 'hud.eis.axis.Cp.desc',
        docsHash: '#eis-axis-completude',
    }),
    Object.freeze({
        key: 'eisHud.axis.Ty' as HudCardTooltipKey,
        titleKey: 'hud.eis.axis.Ty.title',
        descriptionKey: 'hud.eis.axis.Ty.desc',
        docsHash: '#eis-axis-tipicidade',
    }),
    Object.freeze({
        key: 'eisHud.axis.Cs' as HudCardTooltipKey,
        titleKey: 'hud.eis.axis.Cs.title',
        descriptionKey: 'hud.eis.axis.Cs.desc',
        docsHash: '#eis-axis-consistencia',
    }),
    Object.freeze({
        key: 'eisHud.axis.Cm' as HudCardTooltipKey,
        titleKey: 'hud.eis.axis.Cm.title',
        descriptionKey: 'hud.eis.axis.Cm.desc',
        docsHash: '#eis-axis-calibracao',
    }),
    Object.freeze({
        key: 'eisHud.mode' as HudCardTooltipKey,
        titleKey: 'hud.eis.mode.title',
        descriptionKey: 'hud.eis.mode.desc',
        formula: 'GEO: ∏ axis^w  |  VETO: if T≤2 or A≤2 → 0  |  CUST: user weights',
        docsHash: '#eis-mode',
    }),
    Object.freeze({
        key: 'eisHud.kappa' as HudCardTooltipKey,
        titleKey: 'hud.eis.kappa.title',
        descriptionKey: 'hud.eis.kappa.desc',
        docsHash: '#kappa',
    }),
    Object.freeze({
        key: 'eisHud.trend' as HudCardTooltipKey,
        titleKey: 'hud.eis.trend.title',
        descriptionKey: 'hud.eis.trend.desc',
        docsHash: '#eis-trend',
    }),
    Object.freeze({
        key: 'eisHud.subtitle.3CTA' as HudCardTooltipKey,
        titleKey: 'hud.eis.subtitle.3CTA.title',
        descriptionKey: 'hud.eis.subtitle.3CTA.desc',
        docsHash: '#eis-3cta-plus',
    }),
    Object.freeze({
        key: 'eisHud.bullet' as HudCardTooltipKey,
        titleKey: 'hud.eis.bullet.title',
        descriptionKey: 'hud.eis.bullet.desc',
        thresholds: EIS_THRESHOLDS,
        docsHash: '#eis-bullet',
    }),
    // ============================================================
    // ECBT (M2)
    // ============================================================
    Object.freeze({
        key: 'ecbtHud.title' as HudCardTooltipKey,
        titleKey: 'hud.ecbt.title.title',
        descriptionKey: 'hud.ecbt.title.desc',
        formula: 'ECBT Score = ATIVO − PASSIVO',
        thresholds: ECBT_SIGN_THRESHOLDS,
        docsHash: '#ecbt-score',
    }),
    Object.freeze({
        key: 'ecbtHud.mode.ABS' as HudCardTooltipKey,
        titleKey: 'hud.ecbt.mode.ABS.title',
        descriptionKey: 'hud.ecbt.mode.ABS.desc',
        docsHash: '#ecbt-mode-abs',
    }),
    Object.freeze({
        key: 'ecbtHud.mode.MKI' as HudCardTooltipKey,
        titleKey: 'hud.ecbt.mode.MKI.title',
        descriptionKey: 'hud.ecbt.mode.MKI.desc',
        formula: 'MKI = (ATIVO − PASSIVO) / EBITDA × 100%',
        docsHash: '#ecbt-mode-mki',
    }),
    Object.freeze({
        key: 'ecbtHud.passivo' as HudCardTooltipKey,
        titleKey: 'hud.ecbt.passivo.title',
        descriptionKey: 'hud.ecbt.passivo.desc',
        formula: 'PASSIVO = Σ (CAPEX + OPEX) por elemento+campanha+WBS+contrato',
        docsHash: '#ecbt-passivo',
    }),
    Object.freeze({
        key: 'ecbtHud.ativo' as HudCardTooltipKey,
        titleKey: 'hud.ecbt.ativo.title',
        descriptionKey: 'hud.ecbt.ativo.desc',
        formula: 'ATIVO = Σ (área × R$/m²)  via extractNaturalAssets',
        docsHash: '#ecbt-ativo',
    }),
    Object.freeze({
        key: 'ecbtHud.liquido.positive' as HudCardTooltipKey,
        titleKey: 'hud.ecbt.liquido.positive.title',
        descriptionKey: 'hud.ecbt.liquido.positive.desc',
        docsHash: '#ecbt-liquido',
    }),
    Object.freeze({
        key: 'ecbtHud.liquido.negative' as HudCardTooltipKey,
        titleKey: 'hud.ecbt.liquido.negative.title',
        descriptionKey: 'hud.ecbt.liquido.negative.desc',
        docsHash: '#ecbt-liquido',
    }),
    Object.freeze({
        key: 'ecbtHud.kappa' as HudCardTooltipKey,
        titleKey: 'hud.ecbt.kappa.title',
        descriptionKey: 'hud.ecbt.kappa.desc',
        docsHash: '#kappa',
    }),
    Object.freeze({
        key: 'ecbtHud.uncertainty' as HudCardTooltipKey,
        titleKey: 'hud.ecbt.uncertainty.title',
        descriptionKey: 'hud.ecbt.uncertainty.desc',
        formula: 'Monte Carlo ±1σ relativo',
        docsHash: '#uncertainty',
    }),
    // ============================================================
    // Violations (M3 — novo)
    // ============================================================
    Object.freeze({
        key: 'violationsHud.title' as HudCardTooltipKey,
        titleKey: 'hud.violations.title.title',
        descriptionKey: 'hud.violations.title.desc',
        docsHash: '#violations',
    }),
    Object.freeze({
        key: 'violationsHud.counter' as HudCardTooltipKey,
        titleKey: 'hud.violations.counter.title',
        descriptionKey: 'hud.violations.counter.desc',
        docsHash: '#violations-counter',
    }),
    Object.freeze({
        key: 'violationsHud.critical' as HudCardTooltipKey,
        titleKey: 'hud.violations.critical.title',
        descriptionKey: 'hud.violations.critical.desc',
        formula: 'concentração ≥ VI (Valor de Intervenção, CONAMA 420)',
        docsHash: '#violations-critical',
    }),
    Object.freeze({
        key: 'violationsHud.medium' as HudCardTooltipKey,
        titleKey: 'hud.violations.medium.title',
        descriptionKey: 'hud.violations.medium.desc',
        formula: 'VP ≤ concentração < VI',
        docsHash: '#violations-medium',
    }),
    Object.freeze({
        key: 'violationsHud.low' as HudCardTooltipKey,
        titleKey: 'hud.violations.low.title',
        descriptionKey: 'hud.violations.low.desc',
        formula: 'VR ≤ concentração < VP',
        docsHash: '#violations-low',
    }),
    Object.freeze({
        key: 'violationsHud.preset' as HudCardTooltipKey,
        titleKey: 'hud.violations.preset.title',
        descriptionKey: 'hud.violations.preset.desc',
        docsHash: '#preset',
    }),
    Object.freeze({
        key: 'violationsHud.preset.none' as HudCardTooltipKey,
        titleKey: 'hud.violations.preset.none.title',
        descriptionKey: 'hud.violations.preset.none.desc',
        docsHash: '#preset-none',
    }),
    Object.freeze({
        key: 'violationsHud.sparkline' as HudCardTooltipKey,
        titleKey: 'hud.violations.sparkline.title',
        descriptionKey: 'hud.violations.sparkline.desc',
        docsHash: '#sparkline',
    }),
    // ============================================================
    // Cost + Compass + Globe (W2 — HUD-UX-PAIN-DRAIN-001)
    // ============================================================
    Object.freeze({
        key: 'costHud.title' as HudCardTooltipKey,
        titleKey: 'hud.cost.tooltip.title',
        descriptionKey: 'hud.cost.tooltip.desc',
        formula: 'PASSIVO = Σ (CAPEX + OPEX) lançados no modelo',
        docsHash: '#cost-analysis',
    }),
    Object.freeze({
        key: 'costHud.top' as HudCardTooltipKey,
        titleKey: 'hud.cost.top.title',
        descriptionKey: 'hud.cost.top.desc',
        docsHash: '#cost-categories',
    }),
    Object.freeze({
        key: 'costHud.uncertainty' as HudCardTooltipKey,
        titleKey: 'hud.cost.uncertainty.title',
        descriptionKey: 'hud.cost.uncertainty.desc',
        formula: 'U = incerteza relativa combinada (GUM Tier 1)',
        docsHash: '#uncertainty',
    }),
    Object.freeze({
        key: 'compassHud.title' as HudCardTooltipKey,
        titleKey: 'hud.compass.title',
        descriptionKey: 'hud.compass.desc',
        docsHash: '#compass',
    }),
    Object.freeze({
        key: 'globeHud.title' as HudCardTooltipKey,
        titleKey: 'hud.globe.title',
        descriptionKey: 'hud.globe.desc',
        docsHash: '#globe',
    }),
]) as ReadonlyArray<HudCardTooltip>;

/** Lookup O(1) por key. */
const TOOLTIP_MAP: ReadonlyMap<HudCardTooltipKey, HudCardTooltip> = (() => {
    const m = new Map<HudCardTooltipKey, HudCardTooltip>();
    for (const e of HUD_CARD_TOOLTIPS_CATALOG) m.set(e.key, e);
    return m;
})();

export function getHudCardTooltip(key: HudCardTooltipKey): HudCardTooltip | null {
    return TOOLTIP_MAP.get(key) ?? null;
}

export function listHudCardTooltipKeys(): ReadonlyArray<HudCardTooltipKey> {
    return Object.freeze(HUD_CARD_TOOLTIPS_CATALOG.map((e) => e.key));
}

/**
 * Resolve threshold para um valor numérico — usado em EIS bullet bar e
 * ECBT sign indicator. Retorna o primeiro range cujos min/max contêm o valor.
 */
export function resolveThreshold(
    value: number,
    ranges: ReadonlyArray<ThresholdRange>,
): ThresholdRange | null {
    if (!Number.isFinite(value) || !ranges || ranges.length === 0) return null;
    for (const r of ranges) {
        const minOk = r.min === null || value >= r.min;
        const maxOk = r.max === null || value < r.max;
        if (minOk && maxOk) return r;
    }
    return null;
}

/**
 * Violations HUD VM — pure, derivado de contagem por severidade.
 * Calvin 2026-06-10: tile novo nunca tinha sido criado.
 */
export interface ViolationsHudVm {
    readonly counterTotal: number;
    readonly critical: number;
    readonly medium: number;
    readonly low: number;
    readonly preset: string | null; // ID do preset ativo ou null
    readonly sparkline: ReadonlyArray<number>; // últimas 24h normalizadas [0,1]
    readonly pulseBorder: boolean; // true se critical >= 1
    readonly emptyState: boolean; // true se total === 0 && preset === null
}

export interface ViolationEntryShape {
    readonly severity?: 'critical' | 'medium' | 'low' | string | null;
    readonly timestampMs?: number;
}

export function buildViolationsHudVm(
    violations: ReadonlyArray<ViolationEntryShape>,
    preset: string | null,
    nowMs: number = Date.now(),
    historyWindowMs: number = 24 * 3600 * 1000,
): ViolationsHudVm {
    const safe = Array.isArray(violations) ? violations : [];
    let critical = 0;
    let medium = 0;
    let low = 0;
    const bins = new Array<number>(12).fill(0); // 12 buckets de 2h (24h/12)
    const binSize = historyWindowMs / bins.length;
    const startMs = nowMs - historyWindowMs;
    for (const v of safe) {
        const sev = String(v?.severity || '').toLowerCase();
        if (sev === 'critical') critical++;
        else if (sev === 'medium') medium++;
        else if (sev === 'low') low++;
        const ts = Number(v?.timestampMs);
        if (Number.isFinite(ts) && ts >= startMs && ts <= nowMs) {
            const idx = Math.min(bins.length - 1, Math.floor((ts - startMs) / binSize));
            bins[idx] = (bins[idx] || 0) + 1;
        }
    }
    const maxBin = Math.max(1, ...bins);
    const sparkline = Object.freeze(bins.map((b) => b / maxBin));
    const counterTotal = safe.length;
    return Object.freeze({
        counterTotal,
        critical,
        medium,
        low,
        preset: preset || null,
        sparkline,
        pulseBorder: critical >= 1,
        emptyState: counterTotal === 0 && !preset,
    });
}

/**
 * Severity icon resolver — duplica cor com glyph para WCAG 1.4.1 (use of color).
 */
export function severityIcon(severity: 'critical' | 'medium' | 'low'): string {
    if (severity === 'critical') return '🔴';
    if (severity === 'medium') return '🟡';
    return '🟢';
}

// ============================================================
// HUD-UX-PAIN-DRAIN-001 W3.2 (D06) — CONTRATO DE BORDA dos HUD cards.
// Toda borda de card usa um destes 4 tons semânticos; a legenda por
// card vive nos thresholds do tooltip (chips coloridos):
//   green   → ok / surplus / confiável
//   yellow  → atenção / verificar
//   red     → crítico / deficit / insuficiente
//   neutral → sem dado / informativo (sem julgamento de valor)
// ============================================================
export const HUD_TONE_COLORS: Readonly<Record<'green' | 'yellow' | 'red' | 'neutral', string>> =
    Object.freeze({
        green: '#22c55e',
        yellow: '#eab308',
        red: '#ef4444',
        neutral: '#475569',
    });

// ============================================================
// W3.3 (D15) — labels canônicos de balanço. NUNCA abreviar ad-hoc:
// por extenso quando a largura disponível ≥ 90px, senão a forma curta
// canônica desta tabela.
// ============================================================
export const BALANCE_LABELS = Object.freeze({
    passivo: Object.freeze({ full: 'PASSIVO', short: 'PAS' }),
    ativo: Object.freeze({ full: 'ATIVO', short: 'ATV' }),
    liquido: Object.freeze({ full: 'LÍQUIDO', short: 'LÍQ' }),
});

export function balanceLabel(
    kind: 'passivo' | 'ativo' | 'liquido',
    availableWidthPx: number,
): string {
    const entry = BALANCE_LABELS[kind];
    if (!entry) return '';
    return Number.isFinite(availableWidthPx) && availableWidthPx >= 90 ? entry.full : entry.short;
}

/**
 * TD-6 (FRIEND-SCORE-001): a forma canônica de BALANCE_LABELS é pt fixo, o que
 * pintava "PASSIVO/ATIVO/LÍQUIDO" mesmo em EN/ES (idioma misto nos HUDs). Esta
 * variante retorna a CHAVE i18n (full ou short conforme a largura); o caller
 * (paint do HUD) resolve via t(), mantendo o pure sem dependência de i18n.
 */
export function balanceLabelKey(
    kind: 'passivo' | 'ativo' | 'liquido',
    availableWidthPx: number,
): string {
    if (!BALANCE_LABELS[kind]) return '';
    const wide = Number.isFinite(availableWidthPx) && availableWidthPx >= 90;
    return wide ? `hud.balance.${kind}` : `hud.balance.${kind}Short`;
}

// ============================================================
// HUD-UX-PAIN-DRAIN-001 W1.5 — formatters canônicos compartilhados (D19/D15)
// Gate G4 (hud-paint-contracts): cards runtime NÃO podem definir formatter
// local próprio — devem importar daqui (ou de outro _*Pure que re-exporte).
// ============================================================

/**
 * κ formatter canônico — vírgula decimal (padrão BR de todo o app).
 * Antes: eis.ts usava `toFixed(2)` (ponto) e ecbt usava vírgula → D19.
 */
export function formatKappa(kappa: number | undefined): string {
    if (!Number.isFinite(Number(kappa))) return 'κ:—';
    return `κ:${Number(kappa).toFixed(2).replace('.', ',')}`;
}

/**
 * Money formatter canônico compacto: BRL/USD aware, k/M/B suffixes.
 * Única fonte — costHud, ecbtScoreHud e violations importam daqui.
 */
export function formatMoney(value: number | undefined, currency: string | undefined): string {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    const cur = (currency || 'BRL').toUpperCase();
    const symbol =
        cur === 'USD' ? 'US$' :
        cur === 'BTC' ? '₿' :
        cur === 'MIXED' ? '∑' :
        'R$';
    const abs = Math.abs(n);
    const sign = n < 0 ? '−' : '';
    let body: string;
    if (abs >= 1e9) body = `${(abs / 1e9).toFixed(1)}B`;
    else if (abs >= 1e6) body = `${(abs / 1e6).toFixed(1)}M`;
    else if (abs >= 1e3) body = `${(abs / 1e3).toFixed(1)}k`;
    else body = abs.toFixed(0);
    return `${sign}${symbol} ${body}`;
}

// ============================================================
// HUD-UX-PAIN-DRAIN-001 W2 — region maps p/ tooltip runtime (F5)
// Coordenadas em FRAÇÕES [0,1] do canvas (independe de 120 vs 200
// lógico e do CSS size atual). Runtime: fx=(clientX-rect.left)/rect.width.
// ============================================================

/** Pseudo-keys resolvidas em runtime pelo estado do card (dataset). */
export type HudTooltipPseudoKey = 'ecbtHud.mode' | 'ecbtHud.liquido';

export interface HudTooltipRegion {
    readonly key: HudCardTooltipKey | HudTooltipPseudoKey;
    readonly x: number; // fração [0,1]
    readonly y: number;
    readonly w: number;
    readonly h: number;
}

export interface HudRegionMap {
    readonly regions: ReadonlyArray<HudTooltipRegion>;
    readonly defaultKey: HudCardTooltipKey;
}

/**
 * Resoluções possíveis de cada pseudo-key — gate G6 valida que TODA key
 * (direta ou resolvida) tem entry no CATALOG.
 */
export const PSEUDO_KEY_RESOLUTIONS: Readonly<Record<HudTooltipPseudoKey, ReadonlyArray<HudCardTooltipKey>>> =
    Object.freeze({
        'ecbtHud.mode': Object.freeze(['ecbtHud.mode.ABS', 'ecbtHud.mode.MKI']) as ReadonlyArray<HudCardTooltipKey>,
        'ecbtHud.liquido': Object.freeze(['ecbtHud.liquido.positive', 'ecbtHud.liquido.negative']) as ReadonlyArray<HudCardTooltipKey>,
    });

/**
 * Resolve pseudo-key pelo estado do card. `state` vem de canvas.dataset:
 *   hudMode: 'ABS' | 'F' | 'R' | 'I'   (modeBadge do snapshot)
 *   hudSign: 'surplus' | 'deficit' | 'zero'
 */
export function resolvePseudoKey(
    key: HudCardTooltipKey | HudTooltipPseudoKey,
    state: { hudMode?: string; hudSign?: string } = {},
): HudCardTooltipKey {
    if (key === 'ecbtHud.mode') {
        return state.hudMode === 'ABS' ? 'ecbtHud.mode.ABS' : 'ecbtHud.mode.MKI';
    }
    if (key === 'ecbtHud.liquido') {
        return state.hudSign === 'deficit' ? 'ecbtHud.liquido.negative' : 'ecbtHud.liquido.positive';
    }
    return key;
}

/**
 * Region maps por canvas id. Layout derivado dos paints reais:
 *  - eis-hud-canvas (200²): cx=cy=100, R=60, labels eixos a r=72;
 *    footer 3CTA+ y=178, bullet y=186, mode/κ y=196 (handlers/eis.ts).
 *  - ecbt-hud-canvas (120²): PASS y=22..33, ATIV y=44..55, LÍQUIDO y=H-28,
 *    footer d:/κ y=H-4 (ecbtScoreHud.ts).
 *  - violations-hud-canvas (200²): counter y=26..60, breakdown y=65..95,
 *    sparkline y=H-26..H-10, preset y=H-6 (violationsHud.ts).
 *  - cost-hud-canvas (200²): total y=26..55, top-3 y=62..100, U y=H-12.
 */
export const HUD_REGION_MAPS: Readonly<Record<string, HudRegionMap>> = Object.freeze({
    'eis-hud-canvas': Object.freeze({
        defaultKey: 'eisHud.score' as HudCardTooltipKey,
        regions: Object.freeze([
            Object.freeze({ key: 'eisHud.axis.T' as const, x: 0.40, y: 0.08, w: 0.20, h: 0.11 }),
            Object.freeze({ key: 'eisHud.axis.A' as const, x: 0.72, y: 0.25, w: 0.18, h: 0.12 }),
            Object.freeze({ key: 'eisHud.axis.Cp' as const, x: 0.72, y: 0.62, w: 0.18, h: 0.12 }),
            Object.freeze({ key: 'eisHud.axis.Ty' as const, x: 0.40, y: 0.80, w: 0.20, h: 0.06 }),
            Object.freeze({ key: 'eisHud.axis.Cs' as const, x: 0.10, y: 0.62, w: 0.18, h: 0.12 }),
            Object.freeze({ key: 'eisHud.axis.Cm' as const, x: 0.10, y: 0.25, w: 0.18, h: 0.12 }),
            Object.freeze({ key: 'eisHud.trend' as const, x: 0.56, y: 0.41, w: 0.12, h: 0.09 }),
            Object.freeze({ key: 'eisHud.score' as const, x: 0.32, y: 0.38, w: 0.24, h: 0.15 }),
            Object.freeze({ key: 'eisHud.mode' as const, x: 0.40, y: 0.53, w: 0.20, h: 0.07 }),
            Object.freeze({ key: 'eisHud.subtitle.3CTA' as const, x: 0.32, y: 0.86, w: 0.36, h: 0.05 }),
            Object.freeze({ key: 'eisHud.bullet' as const, x: 0.0, y: 0.91, w: 1.0, h: 0.04 }),
            Object.freeze({ key: 'eisHud.mode' as const, x: 0.0, y: 0.95, w: 0.5, h: 0.05 }),
            Object.freeze({ key: 'eisHud.kappa' as const, x: 0.5, y: 0.95, w: 0.5, h: 0.05 }),
        ]),
    }),
    'ecbt-hud-canvas': Object.freeze({
        defaultKey: 'ecbtHud.title' as HudCardTooltipKey,
        regions: Object.freeze([
            Object.freeze({ key: 'ecbtHud.title' as const, x: 0.0, y: 0.0, w: 0.5, h: 0.15 }),
            Object.freeze({ key: 'ecbtHud.mode' as const, x: 0.5, y: 0.0, w: 0.5, h: 0.15 }),
            Object.freeze({ key: 'ecbtHud.passivo' as const, x: 0.0, y: 0.16, w: 1.0, h: 0.17 }),
            Object.freeze({ key: 'ecbtHud.ativo' as const, x: 0.0, y: 0.34, w: 1.0, h: 0.16 }),
            Object.freeze({ key: 'ecbtHud.liquido' as const, x: 0.0, y: 0.62, w: 1.0, h: 0.26 }),
            Object.freeze({ key: 'ecbtHud.kappa' as const, x: 0.5, y: 0.88, w: 0.5, h: 0.12 }),
        ]),
    }),
    'cost-hud-canvas': Object.freeze({
        defaultKey: 'costHud.title' as HudCardTooltipKey,
        regions: Object.freeze([
            Object.freeze({ key: 'costHud.title' as const, x: 0.0, y: 0.0, w: 1.0, h: 0.29 }),
            Object.freeze({ key: 'costHud.top' as const, x: 0.0, y: 0.29, w: 1.0, h: 0.23 }),
            Object.freeze({ key: 'costHud.uncertainty' as const, x: 0.0, y: 0.90, w: 1.0, h: 0.10 }),
        ]),
    }),
    'violations-hud-canvas': Object.freeze({
        defaultKey: 'violationsHud.title' as HudCardTooltipKey,
        regions: Object.freeze([
            Object.freeze({ key: 'violationsHud.title' as const, x: 0.0, y: 0.0, w: 1.0, h: 0.11 }),
            Object.freeze({ key: 'violationsHud.counter' as const, x: 0.2, y: 0.11, w: 0.6, h: 0.19 }),
            Object.freeze({ key: 'violationsHud.critical' as const, x: 0.0, y: 0.31, w: 1.0, h: 0.07 }),
            Object.freeze({ key: 'violationsHud.medium' as const, x: 0.0, y: 0.38, w: 1.0, h: 0.06 }),
            Object.freeze({ key: 'violationsHud.low' as const, x: 0.0, y: 0.44, w: 1.0, h: 0.06 }),
            Object.freeze({ key: 'violationsHud.sparkline' as const, x: 0.0, y: 0.85, w: 1.0, h: 0.09 }),
            Object.freeze({ key: 'violationsHud.preset' as const, x: 0.0, y: 0.94, w: 1.0, h: 0.06 }),
        ]),
    }),
    'compass-canvas': Object.freeze({
        defaultKey: 'compassHud.title' as HudCardTooltipKey,
        regions: Object.freeze([]) as ReadonlyArray<HudTooltipRegion>,
    }),
    'globe-canvas': Object.freeze({
        defaultKey: 'globeHud.title' as HudCardTooltipKey,
        regions: Object.freeze([]) as ReadonlyArray<HudTooltipRegion>,
    }),
});

/**
 * Encontra a key da região sob (fx, fy) — frações [0,1] do canvas.
 * Última região declarada vence empate (ordem = prioridade crescente? Não:
 * primeira que contém vence — ordem do array é prioridade decrescente).
 * Fora de toda região → defaultKey. Canvas desconhecido → null.
 */
export function findHudTooltipKeyAt(
    canvasId: string,
    fx: number,
    fy: number,
): HudCardTooltipKey | HudTooltipPseudoKey | null {
    const map = HUD_REGION_MAPS[canvasId];
    if (!map) return null;
    if (!Number.isFinite(fx) || !Number.isFinite(fy)) return map.defaultKey;
    for (const r of map.regions) {
        if (fx >= r.x && fx < r.x + r.w && fy >= r.y && fy < r.y + r.h) return r.key;
    }
    return map.defaultKey;
}

/** Interface mínima p/ medir texto — injetável (CanvasRenderingContext2D satisfaz). */
export interface TextMeasurer {
    measureText(text: string): { width: number };
}

/**
 * W1.3 (D02) — elide texto para caber em maxWidth. Nunca corta sem indicar:
 * se não cabe, remove chars até caber COM a reticência '…'. Pure + testável
 * com measurer mock; em runtime recebe o próprio ctx 2D (font já setada).
 */
export function fitText(ctx: TextMeasurer, text: string, maxWidth: number): string {
    const s = String(text ?? '');
    if (!ctx || typeof ctx.measureText !== 'function' || !Number.isFinite(maxWidth) || maxWidth <= 0) {
        return s;
    }
    if (ctx.measureText(s).width <= maxWidth) return s;
    const ell = '…';
    let lo = 0;
    let hi = s.length;
    // busca binária pelo maior prefixo que cabe com '…'
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (ctx.measureText(s.slice(0, mid) + ell).width <= maxWidth) lo = mid;
        else hi = mid - 1;
    }
    return lo <= 0 ? ell : s.slice(0, lo) + ell;
}
