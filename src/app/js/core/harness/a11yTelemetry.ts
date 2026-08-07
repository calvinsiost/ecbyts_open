// This file is part of ecbyts/ECBT - Copyright (C) 2026 Calvin Stefan Iost
// AGPL-3.0-only

import { toFiniteNumber } from '../../utils/helpers/toFiniteNumber.js';

export interface ActionLabelParts {
    readonly text?: unknown;
    readonly ariaLabel?: unknown;
    readonly dataAction?: unknown;
    readonly stableId?: unknown;
    readonly selector?: unknown;
    readonly interactionDetail?: unknown;
}

export type ActionLabelInput = string | ActionLabelParts;

export interface AriaLiveAnnouncementInput {
    readonly beforeText?: unknown;
    readonly afterText?: unknown;
    readonly liveRegionCount?: number;
}

export interface AriaLiveIssueInput {
    readonly criticalAction?: boolean;
    readonly announced?: boolean;
    readonly selector?: unknown;
    readonly stableId?: unknown;
    readonly label?: unknown;
    readonly liveRegionCount?: number;
}

export interface AriaLiveIssue {
    readonly id: 't5-aria-live-missing';
    readonly severity: 'warn';
    readonly category: 'accessibility';
    readonly message: string;
    readonly selector: unknown;
    readonly stableId: unknown;
    readonly label: unknown;
    readonly t5: 'aria-live';
}

export interface T5IssueRecord {
    uxIssues?: unknown[];
    [key: string]: unknown;
}

const CRITICAL_ACTION_RE =
    /\b(save|salvar|submit|send|enviar|delete|remove|remover|excluir|deletar|apagar|confirm|confirmar|publish|approve|reject|reset|clear|limpar|error|danger)\b/i;

function joinActionText(input: ActionLabelInput = {}): string {
    const text =
        typeof input === 'string'
            ? input
            : [
                  input.text,
                  input.ariaLabel,
                  input.dataAction,
                  input.stableId,
                  input.selector,
                  input.interactionDetail,
              ]
                  .filter(Boolean)
                  .join(' ');
    return String(text).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
}

export function isCriticalActionLabel(input: ActionLabelInput = {}): boolean {
    return CRITICAL_ACTION_RE.test(joinActionText(input));
}

export function hasAriaLiveAnnouncement({
    beforeText = '',
    afterText = '',
    liveRegionCount = 0,
}: AriaLiveAnnouncementInput = {}): boolean {
    const before = String(beforeText || '').trim();
    const after = String(afterText || '').trim();
    return liveRegionCount > 0 && after.length > 0 && after !== before;
}

export function buildAriaLiveIssue({
    criticalAction = false,
    announced = false,
    selector = '',
    stableId = '',
    label = '',
    liveRegionCount = 0,
}: AriaLiveIssueInput = {}): AriaLiveIssue | null {
    if (!criticalAction || announced) return null;
    const suffix = liveRegionCount > 0 ? 'existing live regions did not change' : 'no live region found';
    return {
        id: 't5-aria-live-missing',
        severity: 'warn',
        category: 'accessibility',
        message: `Critical action did not produce an aria-live announcement (${suffix}).`,
        selector,
        stableId,
        label,
        t5: 'aria-live',
    };
}

// ─── T6: color-contrast telemetry (WCAG 2.1 AA) ──────────────────────
// O click-harness "clica tudo" + visita todos os modais/telas mas NÃO media
// contraste — então defeitos dark-on-dark (ex: .ecbt-dialog sem color no tema
// light, contraste 1.05:1) escapavam. Estes primitivos pure-logic deixam o
// runner/train computar fg/bg via getComputedStyle por elemento e harvestar
// issues de contraste no mesmo pipeline (mergeT5Issues → uxIssues).
// SPEC_ARCH_CSS_CASCADE_LAYERS §22 + SPEC_UI_EXPLORATION_HARNESS.

export interface RGB {
    readonly r: number;
    readonly g: number;
    readonly b: number;
}

export interface ContrastIssueInput {
    readonly fgColor?: unknown;
    readonly bgColor?: unknown;
    /**
     * Fundo opaco efetivo ATRÁS do `bgColor`, quando este é translúcido (alpha<1).
     * Necessário para compor a cor visível real (alpha-over) antes de medir o
     * contraste — sem ele, um tint translúcido de mesma matiz do texto produz um
     * falso 1:1. O scanner deve resolver isto caminhando até o 1º ancestral opaco.
     */
    readonly backdropColor?: unknown;
    readonly fontSizePx?: number;
    readonly bold?: boolean;
    readonly selector?: unknown;
    readonly stableId?: unknown;
    readonly label?: unknown;
}

export interface ContrastIssue {
    readonly id: 't6-contrast-low';
    readonly severity: 'warn' | 'error';
    readonly category: 'accessibility';
    readonly message: string;
    readonly selector: unknown;
    readonly stableId: unknown;
    readonly label: unknown;
    readonly ratio: number;
    readonly required: number;
    readonly t6: 'contrast';
}

/** Parse `rgb()/rgba()` ou `#rgb/#rrggbb` → RGB; null se não-parseável (gradiente, transparente, keyword). */
export function parseCssColor(input: unknown): RGB | null {
    const s = String(input || '').trim();
    const m = s.match(/rgba?\(([^)]+)\)/i);
    if (m) {
        const rawChannels = m[1];
        if (!rawChannels) return null;
        const parts = rawChannels.split(',').map((x) => parseFloat(x));
        if (parts.length >= 3 && parts.slice(0, 3).every((n) => Number.isFinite(n))) {
            // alpha 0 = transparente → não há cor de texto efetiva p/ avaliar
            if (parts.length >= 4 && parts[3] === 0) return null;
            return { r: parts[0]!, g: parts[1]!, b: parts[2]! };
        }
        return null;
    }
    const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
        let h = hex[1]!;
        if (h.length === 3) h = h.split('').map((c) => c + c).join('');
        return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
    }
    return null;
}

/** Canal alpha de uma cor CSS: 1 p/ opaca (hex/keyword/rgb), 0..1 p/ rgba(). */
export function cssAlpha(input: unknown): number {
    const s = String(input || '').trim();
    const m = s.match(/rgba?\(([^)]+)\)/i);
    if (m && m[1]) {
        const parts = m[1].split(',').map((x) => parseFloat(x));
        if (parts.length >= 4 && Number.isFinite(parts[3])) {
            return Math.max(0, Math.min(1, parts[3]!));
        }
    }
    return 1;
}

/** Alpha-over: compõe uma cor translúcida (top @ alpha) sobre um backdrop opaco → RGB opaco. */
export function compositeOver(top: RGB, alpha: number, backdrop: RGB): RGB {
    const a = Math.max(0, Math.min(1, toFiniteNumber(alpha, 1)));
    return {
        r: Math.round(top.r * a + backdrop.r * (1 - a)),
        g: Math.round(top.g * a + backdrop.g * (1 - a)),
        b: Math.round(top.b * a + backdrop.b * (1 - a)),
    };
}

function channelLuminance(c: number): number {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** Luminância relativa WCAG (0..1). */
export function relativeLuminance({ r, g, b }: RGB): number {
    return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/** Razão de contraste WCAG (1..21). */
export function contrastRatio(fg: RGB, bg: RGB): number {
    const l1 = relativeLuminance(fg);
    const l2 = relativeLuminance(bg);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

/** Limite AA: 3.0 p/ texto grande (≥24px, ou ≥18.66px bold); 4.5 caso contrário. */
export function requiredContrast(fontSizePx = 16, bold = false): number {
    const large = fontSizePx >= 24 || (bold && fontSizePx >= 18.66);
    return large ? 3.0 : 4.5;
}

/**
 * Resolve a cor efetiva composta considerando alpha < 1.
 * Retorna null se a cor translúcida não tiver backdrop conhecido.
 *
 * @param {RGB} raw
 * @param {unknown} originalCss
 * @param {unknown} backdropCss
 * @returns {RGB|null}
 */
function effectiveColor(raw: RGB, originalCss: unknown, backdropCss: unknown): RGB | null {
    const alpha = cssAlpha(originalCss);
    if (alpha >= 1) return raw;
    const backdrop = parseCssColor(backdropCss);
    if (!backdrop) return null;
    return compositeOver(raw, alpha, backdrop);
}

/**
 * Build contrast issue payload from measured ratio.
 *
 * @param {number} ratio
 * @param {number} required
 * @param {unknown} selector
 * @param {unknown} stableId
 * @param {unknown} label
 * @returns {ContrastIssue}
 */
function makeContrastIssue(
    ratio: number,
    required: number,
    selector: unknown,
    stableId: unknown,
    label: unknown,
): ContrastIssue {
    return {
        id: 't6-contrast-low',
        severity: ratio < 3 ? 'error' : 'warn',
        category: 'accessibility',
        message: `Text contrast ${ratio.toFixed(2)}:1 is below WCAG AA (needs ${required}:1).`,
        selector,
        stableId,
        label,
        ratio: Math.round(ratio * 100) / 100,
        required,
        t6: 'contrast',
    };
}

/** Issue estruturada se o contraste fg/bg ficar abaixo do AA. null se OK ou não-avaliável. */
export function buildContrastIssue({
    fgColor = '',
    bgColor = '',
    backdropColor = '',
    fontSizePx = 16,
    bold = false,
    selector = '',
    stableId = '',
    label = '',
}: ContrastIssueInput = {}): ContrastIssue | null {
    const fg = parseCssColor(fgColor);
    const bgRaw = parseCssColor(bgColor);
    if (!fg || !bgRaw) return null; // não-avaliável (transparente/gradiente) → sem falso-positivo

    const bg = effectiveColor(bgRaw, bgColor, backdropColor);
    if (!bg) return null; // bg translúcido sem backdrop conhecido → indeterminado

    const effFg = effectiveColor(fg, fgColor, bg);
    if (!effFg) return null;

    const ratio = contrastRatio(effFg, bg);
    const required = requiredContrast(fontSizePx, bold);
    if (ratio >= required) return null;
    return makeContrastIssue(ratio, required, selector, stableId, label);
}

// ─── T7: horizontal-overflow telemetry (responsividade, SPEC §16.2) ──
// Elemento que começa dentro do viewport mas cuja borda direita o ultrapassa →
// conteúdo clipado/cortado (o padrão scene-hud/header-actions/lang-grid). Detecção
// pura a partir do rect; o sweep/harness extrai via getBoundingClientRect.

export interface OverflowIssueInput {
    readonly left?: number;
    readonly right?: number;
    readonly viewportWidth?: number;
    readonly position?: unknown;
    /**
     * `true` quando um ancestral com `overflow`(-x) hidden/scroll/auto/clip — que
     * cabe no viewport — contém o elemento. Aí o "overflow" é clipado/rolável POR
     * DESIGN (marquee do ticker, container scrollável do DataStudio), NÃO uma quebra
     * de layout que vaza a página. O scanner resolve caminhando até esse ancestral.
     */
    readonly clippedByAncestor?: boolean;
    readonly selector?: unknown;
    readonly stableId?: unknown;
    readonly label?: unknown;
}

export interface OverflowIssue {
    readonly id: 't7-overflow-x';
    readonly severity: 'warn' | 'error';
    readonly category: 'layout';
    readonly message: string;
    readonly selector: unknown;
    readonly stableId: unknown;
    readonly label: unknown;
    readonly over: number;
    readonly t7: 'overflow';
}

export function buildOverflowIssue({
    left = 0,
    right = 0,
    viewportWidth = 0,
    clippedByAncestor = false,
    selector = '',
    stableId = '',
    label = '',
}: OverflowIssueInput = {}): OverflowIssue | null {
    if (!viewportWidth) return null;
    // conteúdo clipado/rolável por um ancestral overflow:hidden/scroll/auto → by-design, não vaza a página
    if (clippedByAncestor) return null;
    // começa on-screen (left>=-8 e < viewport) mas estoura a borda direita
    if (!(left >= -8 && left < viewportWidth - 4 && right > viewportWidth + 2)) return null;
    const over = Math.round(right - viewportWidth);
    return {
        id: 't7-overflow-x',
        severity: over > 40 ? 'error' : 'warn',
        category: 'layout',
        message: `Element overflows the viewport by ${over}px (horizontal clip).`,
        selector,
        stableId,
        label,
        over,
        t7: 'overflow',
    };
}

// ─── T8: semantic-clickable telemetry (a11y, SPEC §18) ───────────────
// <div>/<span> com onclick usados como botão mas sem role/teclado → não focáveis
// nem anunciados. Backdrops de overlay (click-to-dismiss) são exceção legítima.

export interface SemanticClickableInput {
    readonly tag?: unknown;
    readonly hasOnclick?: boolean;
    readonly role?: unknown;
    readonly isOverlayBackdrop?: boolean;
    readonly selector?: unknown;
    readonly stableId?: unknown;
    readonly label?: unknown;
}

export interface SemanticClickableIssue {
    readonly id: 't8-clickable-no-role';
    readonly severity: 'warn';
    readonly category: 'accessibility';
    readonly message: string;
    readonly selector: unknown;
    readonly stableId: unknown;
    readonly label: unknown;
    readonly t8: 'semantic-clickable';
}

/** Roles semanticamente clicáveis que dispensam a regra T8. */
const SEMANTIC_CLICKABLE_ROLES = Object.freeze(new Set(['button', 'link', 'menuitem', 'tab']));

/**
 * Verifica se um elemento com onclick precisa de role para ser considerado acessível.
 *
 * @param {string} tag
 * @param {boolean} hasOnclick
 * @param {unknown} role
 * @param {boolean} isOverlayBackdrop
 * @returns {boolean}
 */
function isSemanticClickableViolation(tag: string, hasOnclick: boolean, role: unknown, isOverlayBackdrop: boolean): boolean {
    if (tag !== 'div' && tag !== 'span') return false;
    if (!hasOnclick) return false;
    if (typeof role === 'string' && SEMANTIC_CLICKABLE_ROLES.has(role)) return false;
    if (isOverlayBackdrop) return false; // dismiss-on-click backdrop = OK
    return true;
}

export function buildSemanticClickableIssue({
    tag = '',
    hasOnclick = false,
    role = '',
    isOverlayBackdrop = false,
    selector = '',
    stableId = '',
    label = '',
}: SemanticClickableInput = {}): SemanticClickableIssue | null {
    const t = String(tag).toLowerCase();
    if (!isSemanticClickableViolation(t, hasOnclick, role, isOverlayBackdrop)) return null;
    return {
        id: 't8-clickable-no-role',
        severity: 'warn',
        category: 'accessibility',
        message: `<${t}> with onclick used as a control but lacks role="button" + keyboard support.`,
        selector,
        stableId,
        label,
        t8: 'semantic-clickable',
    };
}

// ─── T9: window-management telemetry (close affordance, SPEC §7/§19) ─
// Superfície de modal/overlay SEM controle de fechar VISÍVEL (X/Cancel) →
// o usuário fica preso (o caso "Nova Issue"/"New Bounty" que Calvin reportou).
// Escape/backdrop existem às vezes mas não são descobríveis → uma afordância
// visível é exigida. hasCloseControl é extraído pelo sweep (querySelector por
// .modal-close/[data-i18n-aria=close]/botão com ×/Cancel dentro da superfície).

export interface WindowMgmtIssueInput {
    readonly isModalSurface?: boolean;
    readonly hasCloseControl?: boolean;
    readonly selector?: unknown;
    readonly stableId?: unknown;
    readonly label?: unknown;
}

export interface WindowMgmtIssue {
    readonly id: 't9-no-close-affordance';
    readonly severity: 'warn';
    readonly category: 'usability';
    readonly message: string;
    readonly selector: unknown;
    readonly stableId: unknown;
    readonly label: unknown;
    readonly t9: 'window-mgmt';
}

export function buildWindowMgmtIssue({
    isModalSurface = false,
    hasCloseControl = false,
    selector = '',
    stableId = '',
    label = '',
}: WindowMgmtIssueInput = {}): WindowMgmtIssue | null {
    if (!isModalSurface) return null;
    if (hasCloseControl) return null;
    return {
        id: 't9-no-close-affordance',
        severity: 'warn',
        category: 'usability',
        message: 'Modal/overlay surface lacks a visible close/cancel control (user may get stuck).',
        selector,
        stableId,
        label,
        t9: 'window-mgmt',
    };
}

export function mergeT5Issues<TRecord extends T5IssueRecord>(
    record: TRecord,
    issues: readonly unknown[] = [],
): TRecord {
    const filtered = issues.filter(Boolean);
    if (filtered.length === 0) return record;
    const existing = Array.isArray(record.uxIssues) ? record.uxIssues : [];
    record.uxIssues = existing.concat(filtered);
    return record;
}
