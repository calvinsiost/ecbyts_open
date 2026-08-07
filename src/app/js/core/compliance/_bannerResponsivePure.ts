// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Compliance Banner Responsive Tier Resolver — pure logic (RF17 / B10 of
 * SPEC_MODEL_BASELINE_COMPLIANCE_PRESET).
 *
 * Decides which of 3 tiers the banner renders given the available viewport
 * width. Pure: caller passes width + preset/state metadata; module returns
 * a frozen VM with the tier + concrete display strings (full/medium/mini).
 *
 * 3 tiers (B10 / Calvin D1 recommendation):
 *   - `full`   ≥ 768px (desktop)   — authority + jurisdiction + instrument + version + status chip
 *   - `medium` 480–767px (tablet)  — authority + instrument + status chip
 *   - `mini`   < 480px (mobile)    — icon + 3-letter sigla + tooltip detail
 *
 * Out of scope (deferred):
 *   - Actual DOM/CSS rendering — caller plugs into a renderer
 *   - Banner state precedence (none/active/mismatch/outdated/revoked) —
 *     covered by `_bannerStateResolverPure` (RF8)
 *
 * Tests live in `tests/compliance-banner-responsive-pure.test.mjs`.
 */

export type BannerTier = 'full' | 'medium' | 'mini';

export interface BannerDisplayInput {
    /** Viewport width in CSS px. */
    readonly viewportWidth: number;
    /** Optional user override (forces a specific tier; useful for testing/preview). */
    readonly forceTier?: BannerTier;
    /** Preset metadata to render. */
    readonly authority?: string;
    readonly jurisdiction?: string;
    readonly instrument?: string;
    readonly version?: string;
    /** Short status chip label (e.g. "ATIVO", "ATUALIZAR"). */
    readonly statusChip?: string;
    /** Banner state kind (from _bannerStateResolverPure). */
    readonly stateKind?: 'none' | 'active' | 'mismatch' | 'outdated' | 'registry-revoked';
}

export interface BannerTierVM {
    readonly tier: BannerTier;
    /** Text to display in the banner row. */
    readonly displayText: string;
    /** Detail text for tooltip (mini tier) or aria-label (full/medium). */
    readonly tooltip: string;
    /** 3-letter sigla shown on mini tier (authority code). */
    readonly sigla: string;
    /** True when the banner content was abbreviated due to tier. */
    readonly abbreviated: boolean;
}

const BREAKPOINT_FULL = 768;
const BREAKPOINT_MEDIUM = 480;

function pickTier(width: number, force?: BannerTier): BannerTier {
    if (force === 'full' || force === 'medium' || force === 'mini') return force;
    if (!Number.isFinite(width) || width < 0) return 'mini';
    if (width >= BREAKPOINT_FULL) return 'full';
    if (width >= BREAKPOINT_MEDIUM) return 'medium';
    return 'mini';
}

function safeStr(v: unknown): string {
    return typeof v === 'string' ? v : '';
}

function deriveSigla(authority: string): string {
    if (!authority) return '???';
    const compact = authority.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (compact.length === 0) return '???';
    return compact.slice(0, 3).padEnd(3, '_').slice(0, 3);
}

/**
 * Build the display VM given viewport width and preset metadata.
 *
 * Strings are JOIN-style — caller picks separator (typically `' · '` for
 * full, `' '` for medium, just sigla for mini). We return the assembled
 * `displayText` so the renderer is dead-simple.
 */
export function resolveBannerTier(input: BannerDisplayInput | null | undefined): BannerTierVM {
    if (!input || typeof input !== 'object') {
        return Object.freeze({
            tier: 'mini' as const,
            displayText: '???',
            tooltip: '',
            sigla: '???',
            abbreviated: true,
        });
    }
    const tier = pickTier(input.viewportWidth, input.forceTier);
    const authority = safeStr(input.authority);
    const jurisdiction = safeStr(input.jurisdiction);
    const instrument = safeStr(input.instrument);
    const version = safeStr(input.version);
    const statusChip = safeStr(input.statusChip);
    const sigla = deriveSigla(authority);

    // Build tooltip (always full detail — used as aria-label or hover popover)
    const tooltipParts: string[] = [];
    if (authority) tooltipParts.push(authority);
    if (jurisdiction) tooltipParts.push(`(${jurisdiction})`);
    if (instrument) tooltipParts.push(instrument);
    if (version) tooltipParts.push(`v${version}`);
    if (statusChip) tooltipParts.push(`[${statusChip}]`);
    const tooltip = tooltipParts.join(' ').trim();

    let displayText: string;
    let abbreviated = false;

    if (tier === 'full') {
        const parts: string[] = [];
        if (authority) parts.push(authority);
        if (jurisdiction) parts.push(`(${jurisdiction})`);
        if (instrument) parts.push(instrument);
        if (version) parts.push(`v${version}`);
        if (statusChip) parts.push(`[${statusChip}]`);
        displayText = parts.join(' ').trim();
    } else if (tier === 'medium') {
        const parts: string[] = [];
        if (authority) parts.push(authority);
        if (instrument) parts.push(instrument);
        if (statusChip) parts.push(`[${statusChip}]`);
        displayText = parts.join(' ').trim();
        abbreviated = !!(jurisdiction || version);
    } else {
        // mini
        displayText = sigla;
        abbreviated = !!(jurisdiction || version || instrument);
    }

    if (displayText.length === 0) displayText = sigla || '???';

    return Object.freeze({
        tier,
        displayText,
        tooltip,
        sigla,
        abbreviated,
    });
}

/**
 * Convenience predicate — `true` when the tier is `mini`, which means the
 * caller MUST attach a tooltip listener (full content otherwise invisible).
 */
export function requiresTooltip(vm: BannerTierVM | null | undefined): boolean {
    return !!vm && vm.tier === 'mini';
}
