// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Compliance Banner Markup — pure-logic HTML builder
 * (claude - novaspec, 2026-06-04).
 *
 * SPEC_MODEL_BASELINE_COMPLIANCE_PRESET §5.1: banner persistente acima do
 * statusbar, sempre visível em TODAS as views (3D, Inspector, DataStudio,
 * Report). Anatomia: bandeira + nome preset + badge trust ✓/⚠ +
 * separador + indicador CONFORMIDADE CALCULADA (✅/⚠/❌/❓) + componentes
 * + [Detalhes ▼].
 *
 * Multi-preset (B4/B5 / ADR A9 / D7): banner mostra chips múltiplos
 * agrupados em flyout "+N mais ▼" quando >3.
 *
 * Esta camada é PURE-LOGIC — sem DOM. Toma `BannerStateVM` +
 * `IndicatorPairVM` + `BannerTierVM` (já implementados) e retorna string
 * HTML escapada pronta para `innerHTML`. Qualquer wire DOM consome este
 * markup.
 *
 * Scope desta slice:
 *   - buildBannerMarkup(state) → string HTML
 *   - buildChipMarkup(chip) → string HTML por chip
 *   - escapeForHTML utility local (não importa do utils — pure dependency)
 *   - 5 estados visuais cobertos (none/active/mismatch/outdated/revoked)
 *   - 3 tiers responsive cobertos (full/medium/mini)
 *
 * Out of scope (futuras slices):
 *   - Wire DOM (utils/ui/complianceBanner.ts — outra sessão)
 *   - CSS styles (app/css/compliance-banner.css)
 *   - Event listeners (click no [Detalhes] abre modal)
 *
 * Tests live in `tests/compliance-banner-markup-pure.test.mjs`.
 */

import type { BannerStateKind } from './_bannerStateResolverPure';
import type { BannerTierVM, BannerTier } from './_bannerResponsivePure';

/**
 * Forma de um chip do par indicador, já resolvido pelo caller para markup
 * (ícone + label + classe CSS). Contrato consumido por renderIndicatorChip —
 * distinto do ChipVM cru de _complianceIndicatorPairPure (que carrega
 * labelKey/severity para o caller resolver antes de montar este shape).
 */
export interface IndicatorChipMarkup {
    readonly icon?: string;
    readonly label?: string;
    readonly cssClass?: string;
}

/** Estado do banner já resolvido para markup (kind + label pronto). */
export interface BannerStateMarkup {
    readonly kind: BannerStateKind;
    readonly bannerLabel?: string;
}

/** Par indicador resolvido para markup (preset chip + conformity chip). */
export interface IndicatorPairMarkup {
    readonly presetChip?: IndicatorChipMarkup;
    readonly conformityChip?: IndicatorChipMarkup;
}

// ----------------------------------------------------------------
// CONSTANTS frozen
// ----------------------------------------------------------------

/** CSS class por estado do banner (drives styling). */
export const BANNER_STATE_CSS_CLASS = Object.freeze({
    none: 'cb-state-none',
    active: 'cb-state-active',
    mismatch: 'cb-state-mismatch',
    outdated: 'cb-state-outdated',
    'registry-revoked': 'cb-state-revoked',
} as const);

/** CSS class por tier responsive. */
export const BANNER_TIER_CSS_CLASS = Object.freeze({
    full: 'cb-tier-full',
    medium: 'cb-tier-medium',
    mini: 'cb-tier-mini',
} as const);

/** ID canônico do elemento root do banner (DOM contract). */
export const BANNER_ROOT_ID = 'compliance-banner' as const;

/** Max chips visíveis antes de virar flyout "+N mais ▼". */
export const MAX_INLINE_CHIPS = 3 as const;

// ----------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------

export interface BannerChip {
    /** Bandeira/emoji do publishedBy.jurisdiction (ex: 🇧🇷, 🌍, 🇺🇸). */
    readonly flag: string;
    /** Label visível (curto, conforme tier). Ex: "CONAMA 420 + IPCC AR4". */
    readonly label: string;
    /** Badge de trust chain: ✓ verificado | ⚠ não-verificado | null. */
    readonly trustBadge: '✓' | '⚠' | null;
    /** preset id (data attribute). */
    readonly presetId: string;
    /** Escopo do binding (solo, ghg, etc.) — para chips multi-jurisdição. */
    readonly scope?: string;
}

export interface BannerMarkupInput {
    /** State resolvido para markup (kind + bannerLabel). */
    readonly state: BannerStateMarkup;
    /** Resolved responsive tier (full/medium/mini). */
    readonly tier: BannerTierVM;
    /** Indicador de conformidade calculada (RF9 / B1 / ADR A6). */
    readonly indicator: IndicatorPairMarkup;
    /** Chips ativos (1 = single-preset · N = multi-jurisdição). */
    readonly chips: ReadonlyArray<BannerChip>;
    /** i18n strings já resolvidas pelo caller (não depende de t() runtime). */
    readonly i18n: Readonly<{
        detailsButton: string;
        moreFlyout: string; // "+{n} mais ▼" template
        ariaLabel: string;
        tooltipPresetVsConformity: string;
    }>;
}

// ----------------------------------------------------------------
// UTILITIES — HTML escaping (no DOM dependency)
// ----------------------------------------------------------------

/** Escape para uso em conteúdo textual de HTML. */
export function escapeForHTML(s: unknown): string {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    } as Record<string, string>)[c] as string);
}

/** Escape para uso em atributo HTML (mais restritivo). */
export function escapeForAttr(s: unknown): string {
    return escapeForHTML(s);
}

// ----------------------------------------------------------------
// CHIP MARKUP — 1 chip de preset ativo
// ----------------------------------------------------------------

/**
 * Constrói markup de um chip individual.
 *
 * Mini tier: somente flag + sigla truncada · sem trust badge inline.
 * Medium/Full: flag + label completa + trust badge.
 */
export function buildChipMarkup(chip: BannerChip, tier: BannerTier): string {
    if (!chip || typeof chip !== 'object') return '';
    const flag = escapeForHTML(chip.flag);
    const label = escapeForHTML(chip.label);
    const presetId = escapeForAttr(chip.presetId);
    const scope = chip.scope ? escapeForAttr(chip.scope) : '';
    const trust = tier === 'mini' || !chip.trustBadge ? '' : `<span class="cb-trust">${escapeForHTML(chip.trustBadge)}</span>`;

    return (
        `<span class="cb-chip" data-preset-id="${presetId}"` +
        (scope ? ` data-scope="${scope}"` : '') +
        `>` +
        `<span class="cb-flag" aria-hidden="true">${flag}</span>` +
        `<span class="cb-label">${label}</span>` +
        trust +
        `</span>`
    );
}

// ----------------------------------------------------------------
// BANNER MARKUP — main builder
// ----------------------------------------------------------------

/**
 * Constrói o markup completo do banner.
 *
 * Estrutura:
 *   <div id="compliance-banner" class="cb-banner cb-state-X cb-tier-Y"
 *        role="region" aria-label="...">
 *     <div class="cb-chips">CHIPS + (optional flyout)</div>
 *     <span class="cb-separator">│</span>
 *     <div class="cb-indicator">INDICATOR PAIR</div>
 *     <button class="cb-details" aria-label="...">[Detalhes ▼]</button>
 *   </div>
 *
 * Quando state=none: mostra apenas mensagem "Sem preset · defaults".
 * Quando chips.length > MAX_INLINE_CHIPS: agrupa em "+N mais ▼" flyout.
 */
export function buildBannerMarkup(input: BannerMarkupInput | null | undefined): string {
    if (!input || typeof input !== 'object') return '';
    if (!input.state || !input.tier || !input.indicator) return '';

    const stateKind: BannerStateKind = input.state.kind;
    const tier: BannerTier = input.tier.tier;
    const stateClass = BANNER_STATE_CSS_CLASS[stateKind] || 'cb-state-none';
    const tierClass = BANNER_TIER_CSS_CLASS[tier] || 'cb-tier-full';

    const ariaLabel = escapeForAttr(input.i18n.ariaLabel || 'Compliance preset banner');
    const tooltip = escapeForAttr(input.i18n.tooltipPresetVsConformity || '');
    const detailsLabel = escapeForHTML(input.i18n.detailsButton || 'Detalhes ▼');

    // Caso especial: state=none → renderiza placeholder sem chips
    if (stateKind === 'none') {
        const noneMsg = escapeForHTML(input.state.bannerLabel || 'Sem preset · defaults');
        return (
            `<div id="${BANNER_ROOT_ID}" class="cb-banner ${stateClass} ${tierClass}" ` +
            `role="region" aria-label="${ariaLabel}">` +
            `<span class="cb-none-msg">${noneMsg}</span>` +
            `<button class="cb-details" type="button">${detailsLabel}</button>` +
            `</div>`
        );
    }

    // Render chips (com flyout se >MAX_INLINE_CHIPS)
    const inlineChips = input.chips.slice(0, MAX_INLINE_CHIPS);
    const overflow = input.chips.length - MAX_INLINE_CHIPS;
    const chipsMarkup = inlineChips.map((c) => buildChipMarkup(c, tier)).join('<span class="cb-chip-sep">·</span>');
    const flyoutMarkup =
        overflow > 0
            ? `<button class="cb-flyout" type="button">` +
              escapeForHTML((input.i18n.moreFlyout || '+{n} mais ▼').replace('{n}', String(overflow))) +
              `</button>`
            : '';

    // Indicator pair (preset✓ │ ✅conforme)
    const indicatorPreset = renderIndicatorChip(input.indicator.presetChip);
    const indicatorConformity = renderIndicatorChip(input.indicator.conformityChip);

    return (
        `<div id="${BANNER_ROOT_ID}" class="cb-banner ${stateClass} ${tierClass}" ` +
        `role="region" aria-label="${ariaLabel}"` +
        (tooltip ? ` title="${tooltip}"` : '') +
        `>` +
        `<div class="cb-chips">${chipsMarkup}${flyoutMarkup}</div>` +
        `<span class="cb-separator" aria-hidden="true">│</span>` +
        `<div class="cb-indicator-pair">${indicatorPreset}${indicatorConformity}</div>` +
        `<button class="cb-details" type="button">${detailsLabel}</button>` +
        `</div>`
    );
}

/** Render de um chip do IndicatorPairVM (preset chip OR conformity chip). */
function renderIndicatorChip(chip: { readonly icon?: string; readonly label?: string; readonly cssClass?: string } | null | undefined): string {
    if (!chip || typeof chip !== 'object') return '';
    const icon = escapeForHTML(chip.icon || '');
    const label = escapeForHTML(chip.label || '');
    const cls = escapeForAttr(chip.cssClass || '');
    return `<span class="cb-indicator ${cls}"><span class="cb-icon" aria-hidden="true">${icon}</span><span class="cb-indicator-label">${label}</span></span>`;
}

// ----------------------------------------------------------------
// VALIDATION
// ----------------------------------------------------------------

/**
 * Sanity check: input bem-formado pode ser renderizado sem crash.
 * Retorna boolean (não throw — defensive UI).
 */
export function isValidBannerInput(input: unknown): input is BannerMarkupInput {
    if (!input || typeof input !== 'object') return false;
    const i = input as BannerMarkupInput;
    if (!i.state || typeof i.state !== 'object') return false;
    if (!i.tier || typeof i.tier !== 'object') return false;
    if (!i.indicator || typeof i.indicator !== 'object') return false;
    if (!Array.isArray(i.chips)) return false;
    if (!i.i18n || typeof i.i18n !== 'object') return false;
    return true;
}
