// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Compliance Banner — Indicator Pair Resolver — pure logic (RF9 / B1 of
 * SPEC_MODEL_BASELINE_COMPLIANCE_PRESET, ADR A6).
 *
 * Calvin D5 homologation: banner MUST surface TWO adjacent indicators
 * — never collapse into a single chip — because conflating "preset
 * ATIVO" (aplicação) with "CONFORMIDADE CALCULADA" (verdict) creates
 * material legal risk: auditor sees green chip and assumes the model is
 * compliant when in fact the preset was merely applied without yet
 * computing the validation passes.
 *
 * Two indicators:
 *   1. **Preset (aplicação)** — IS A preset attached to this model?
 *      States: none / active / mismatch / outdated / revoked (RF8).
 *   2. **Compliance (cálculo)** — DID we compute conformity, and what
 *      was the verdict? States: conforme / warnings / viola / nao_calculado.
 *
 * The KEY anti-N: when preset.active is TRUE we DO NOT automatically
 * claim compliance.active=conforme. The two must be derived from
 * separate signals. Caller passes both inputs; module returns frozen
 * VM pair ready for adjacent chip rendering.
 *
 * Tests live in `tests/compliance-indicator-pair-pure.test.mjs`.
 */

import type { BannerStateKind } from './_bannerStateResolverPure';

export type ConformityVerdict = 'conforme' | 'warnings' | 'viola' | 'nao_calculado';

export interface ChipVM {
    readonly kind: 'preset' | 'compliance';
    readonly state: string;
    readonly labelKey: string;
    readonly color: string;
    readonly icon: string;
    readonly severity: 'info' | 'success' | 'warning' | 'error';
    /** Tooltip i18n key — caller may resolve at render time. */
    readonly tooltipKey: string;
}

export interface IndicatorPairVM {
    readonly preset: ChipVM;
    readonly compliance: ChipVM;
    /** Separator hint for screen-reader announcement (semantic distinction). */
    readonly ariaSeparator: string;
}

const COLOR_NEUTRAL = '#6b7280';
const COLOR_SUCCESS = '#10b981';
const COLOR_WARNING = '#f59e0b';
const COLOR_ERROR = '#ef4444';

function freezeChip(c: ChipVM): ChipVM {
    return Object.freeze({ ...c });
}

function buildPresetChip(state: BannerStateKind | null | undefined): ChipVM {
    switch (state) {
        case 'active':
            return freezeChip({
                kind: 'preset',
                state: 'active',
                labelKey: 'compliance.indicator.preset.active',
                color: COLOR_SUCCESS,
                icon: 'shield-check',
                severity: 'info',
                tooltipKey: 'compliance.indicator.preset.active.tooltip',
            });
        case 'mismatch':
            return freezeChip({
                kind: 'preset',
                state: 'mismatch',
                labelKey: 'compliance.indicator.preset.mismatch',
                color: COLOR_WARNING,
                icon: 'shield-warning',
                severity: 'warning',
                tooltipKey: 'compliance.indicator.preset.mismatch.tooltip',
            });
        case 'outdated':
            return freezeChip({
                kind: 'preset',
                state: 'outdated',
                labelKey: 'compliance.indicator.preset.outdated',
                color: COLOR_WARNING,
                icon: 'shield-clock',
                severity: 'warning',
                tooltipKey: 'compliance.indicator.preset.outdated.tooltip',
            });
        case 'registry-revoked':
            return freezeChip({
                kind: 'preset',
                state: 'registry-revoked',
                labelKey: 'compliance.indicator.preset.revoked',
                color: COLOR_ERROR,
                icon: 'shield-x',
                severity: 'error',
                tooltipKey: 'compliance.indicator.preset.revoked.tooltip',
            });
        case 'none':
        default:
            return freezeChip({
                kind: 'preset',
                state: 'none',
                labelKey: 'compliance.indicator.preset.none',
                color: COLOR_NEUTRAL,
                icon: 'shield-off',
                severity: 'info',
                tooltipKey: 'compliance.indicator.preset.none.tooltip',
            });
    }
}

function buildComplianceChip(verdict: ConformityVerdict | null | undefined): ChipVM {
    switch (verdict) {
        case 'conforme':
            return freezeChip({
                kind: 'compliance',
                state: 'conforme',
                labelKey: 'compliance.indicator.compliance.conforme',
                color: COLOR_SUCCESS,
                icon: 'check-circle',
                severity: 'success',
                tooltipKey: 'compliance.indicator.compliance.conforme.tooltip',
            });
        case 'warnings':
            return freezeChip({
                kind: 'compliance',
                state: 'warnings',
                labelKey: 'compliance.indicator.compliance.warnings',
                color: COLOR_WARNING,
                icon: 'alert-triangle',
                severity: 'warning',
                tooltipKey: 'compliance.indicator.compliance.warnings.tooltip',
            });
        case 'viola':
            return freezeChip({
                kind: 'compliance',
                state: 'viola',
                labelKey: 'compliance.indicator.compliance.viola',
                color: COLOR_ERROR,
                icon: 'x-circle',
                severity: 'error',
                tooltipKey: 'compliance.indicator.compliance.viola.tooltip',
            });
        case 'nao_calculado':
        default:
            return freezeChip({
                kind: 'compliance',
                state: 'nao_calculado',
                labelKey: 'compliance.indicator.compliance.nao_calculado',
                color: COLOR_NEUTRAL,
                icon: 'help-circle',
                severity: 'info',
                tooltipKey: 'compliance.indicator.compliance.nao_calculado.tooltip',
            });
    }
}

/**
 * Resolve the two-chip indicator pair (RF9 / B1).
 *
 * IMPORTANT: caller must pass BOTH inputs independently. We DO NOT
 * derive compliance from preset state — that's the whole point of
 * RF9. If the caller has not computed conformity, they pass
 * `nao_calculado` (explicit, audit-friendly).
 */
export function resolveIndicatorPair(
    presetState: BannerStateKind | null | undefined,
    complianceVerdict: ConformityVerdict | null | undefined,
): IndicatorPairVM {
    return Object.freeze({
        preset: buildPresetChip(presetState),
        compliance: buildComplianceChip(complianceVerdict),
        ariaSeparator: 'compliance.indicator.ariaSeparator',
    });
}

/**
 * Anti-N safety net (B1): if caller accidentally tries to set
 * preset='active' + compliance='conforme' WITHOUT supplying explicit
 * `complianceComputedAt`, this returns FALSE — useful in tests/audit.
 */
export function isComplianceClaimSafe(
    presetState: BannerStateKind | null | undefined,
    complianceVerdict: ConformityVerdict | null | undefined,
    complianceComputedAt?: string | null,
): boolean {
    if (complianceVerdict !== 'conforme') return true;
    if (typeof complianceComputedAt !== 'string' || complianceComputedAt.length === 0) return false;
    return Number.isFinite(Date.parse(complianceComputedAt));
}
