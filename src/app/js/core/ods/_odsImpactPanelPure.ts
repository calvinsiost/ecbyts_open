// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ODS impact panel/HUD — pure view-model + HTML builder (RF-4 of
 * SPEC_ODS_IMPACT_PARAMS).
 *
 * Read-only card that renders `OdsImpactResult[]` from RF-2's
 * `computeOdsImpact` (`core/ods/_odsImpactPure.ts`): one row per ODS with a
 * tier badge (`measured`/`estimated`/`claimed`/`absent`) that is ALWAYS
 * shown next to the score — never a bare number, never a green semaphore
 * for anything less than `measured`.
 *
 * Anti-requirements honoured (SPEC_ODS_IMPACT_PARAMS §4/§5, RF-4):
 *   - `absent` renders as "não mensurável aqui" (score suppressed, never a
 *     green/neutral placeholder, never silently omitted from the list).
 *   - `claimed` is displayed with a NEUTRAL badge — no green semaphore, no
 *     numeric highlight — the rendering-time honesty gate
 *     (`resolveOdsPanelRowVM`) suppresses `highlightScore` for any tier
 *     below `measured`; the raw score is still surfaced as text so the
 *     panel never hides a fact, it just never over-promotes it.
 *   - No inline editing: this module produces read-only view-models/HTML
 *     only; there is no mutation entry point here (params only via admin
 *     curation upstream, RF-1).
 *   - Pure: zero I/O/DOM. All rendering is plain string templates consumed
 *     by a thin `utils/ui` DOM mount (kept separate per repo convention).
 *
 * Tests live in `tests/ods-impact-panel-pure.test.mjs`.
 */

import type { OdsImpactResult, OdsImpactTier } from './_odsImpactPure.js';
import { getOds } from './_registryPure.js';

/** Tier ranking used to decide whether a numeric highlight may be shown. */
const TIER_RANK: Readonly<Record<OdsImpactTier, number>> = Object.freeze({
    absent: 0,
    claimed: 1,
    estimated: 2,
    measured: 3,
});

/** Only `measured` tier is honest enough to earn a highlighted/green score. */
const MIN_HIGHLIGHT_TIER: OdsImpactTier = 'measured';

export interface OdsPanelRowVM {
    readonly odsId: number;
    readonly label: string;
    readonly tier: OdsImpactTier;
    /** `null` for `absent` — never a fabricated 0. */
    readonly score: number | null;
    /** Score formatted 0-100 for display, or `null` when there is nothing honest to show. */
    readonly scoreLabel: string | null;
    /** True only when tier is `measured` — gates any green/success styling. */
    readonly highlightScore: boolean;
    /** Human copy for the `absent` case; empty string otherwise. */
    readonly absentLabel: string;
    /** Indicator codes that contributed a signal (provenance summary). */
    readonly indicatorCodes: ReadonlyArray<string>;
}

export interface OdsPanelVM {
    readonly rows: ReadonlyArray<OdsPanelRowVM>;
    readonly measuredCount: number;
    readonly estimatedCount: number;
    readonly claimedCount: number;
    readonly absentCount: number;
}

const ABSENT_LABEL_PT = 'não mensurável aqui';

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Rendering-time honesty gate: given a raw `OdsImpactResult`, decide whether
 * the score may be highlighted (only `measured`) and what the absent-state
 * copy should be. Mirrors `isClaimedTierHonest`'s intent (never render above
 * the real tier) applied to this engine's tier vocabulary — `claimed`
 * NEVER earns the same visual treatment as `measured`, and `absent` NEVER
 * renders as if it were zero/neutral-good.
 */
export function resolveOdsPanelRowVM(result: OdsImpactResult): OdsPanelRowVM {
    const entry = getOds(result.odsId);
    const label = entry ? entry.label_pt : `ODS ${result.odsId}`;
    const tier = result.tier;
    const hasScore = tier !== 'absent' && isFiniteNumber(result.score);
    const highlightScore = hasScore && TIER_RANK[tier] >= TIER_RANK[MIN_HIGHLIGHT_TIER];

    return Object.freeze({
        odsId: result.odsId,
        label,
        tier,
        score: hasScore ? (result.score as number) : null,
        scoreLabel: hasScore ? `${Math.round((result.score as number) * 100)}` : null,
        highlightScore,
        absentLabel: tier === 'absent' ? ABSENT_LABEL_PT : '',
        indicatorCodes: Object.freeze(result.indicators.map((i) => i.code)),
    });
}

/** Builds the full read-only panel VM from RF-2's raw results array. */
export function buildOdsImpactPanelVM(results: ReadonlyArray<OdsImpactResult> | null | undefined): OdsPanelVM {
    const list = Array.isArray(results) ? results : [];
    const rows = list.map(resolveOdsPanelRowVM);

    let measuredCount = 0;
    let estimatedCount = 0;
    let claimedCount = 0;
    let absentCount = 0;
    for (const row of rows) {
        if (row.tier === 'measured') measuredCount++;
        else if (row.tier === 'estimated') estimatedCount++;
        else if (row.tier === 'claimed') claimedCount++;
        else absentCount++;
    }

    return Object.freeze({
        rows: Object.freeze(rows),
        measuredCount,
        estimatedCount,
        claimedCount,
        absentCount,
    });
}

const TIER_BADGE_LABEL: Readonly<Record<OdsImpactTier, string>> = Object.freeze({
    measured: 'medido',
    estimated: 'estimado',
    claimed: 'declarado',
    absent: 'não mensurável',
});

/**
 * Tier badge CSS class — `measured` is the ONLY tier allowed a "success"
 * class; every other tier gets a neutral/warning class. No tier ever maps
 * to a class that a stylesheet could plausibly render as green-success
 * except `measured`, per the anti-decorative-claim gate.
 */
const TIER_BADGE_CLASS: Readonly<Record<OdsImpactTier, string>> = Object.freeze({
    measured: 'ods-impact-badge ods-impact-badge--measured',
    estimated: 'ods-impact-badge ods-impact-badge--estimated',
    claimed: 'ods-impact-badge ods-impact-badge--claimed',
    absent: 'ods-impact-badge ods-impact-badge--absent',
});

function escapeHtml(value: string): string {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

/** Builds the read-only HTML for one panel row. Pure string template, no DOM. */
export function buildOdsPanelRowHtml(row: OdsPanelRowVM): string {
    const badgeClass = TIER_BADGE_CLASS[row.tier];
    const badgeLabel = TIER_BADGE_LABEL[row.tier];
    const scoreHtml =
        row.tier === 'absent'
            ? `<span class="ods-impact-absent">${escapeHtml(row.absentLabel)}</span>`
            : `<span class="ods-impact-score${row.highlightScore ? ' ods-impact-score--highlight' : ''}">${escapeHtml(
                  row.scoreLabel ?? '—',
              )}</span>`;
    const provenance =
        row.indicatorCodes.length > 0
            ? `<span class="ods-impact-provenance">${escapeHtml(row.indicatorCodes.join(', '))}</span>`
            : '';

    return (
        `<div class="ods-impact-row" data-ods-id="${row.odsId}" data-ods-tier="${row.tier}">` +
        `<span class="ods-impact-label">${escapeHtml(`ODS ${row.odsId} — ${row.label}`)}</span>` +
        `${scoreHtml}` +
        `<span class="${badgeClass}">${escapeHtml(badgeLabel)}</span>` +
        `${provenance}` +
        `</div>`
    );
}

/** Builds the full read-only panel HTML (container + one row per ODS result). */
export function buildOdsImpactPanelHtml(vm: OdsPanelVM): string {
    const rowsHtml = vm.rows.map(buildOdsPanelRowHtml).join('');
    return `<div class="ods-impact-panel" role="region" aria-label="Impacto por ODS">${rowsHtml}</div>`;
}
