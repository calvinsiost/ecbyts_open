// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Compliance Banner State Resolver — pure logic (RF8 of
 * SPEC_MODEL_BASELINE_COMPLIANCE_PRESET).
 *
 * Decides which of the 5 banner states applies given the current
 * workspace preset + model binding + registry metadata. Pure: caller
 * gathers inputs, this module returns a frozen VM ready to render.
 *
 * 5 states (RF8):
 *   - `none`              — no preset active (default for new models)
 *   - `active`            — workspace preset == model binding, all healthy
 *   - `mismatch`          — workspace preset != model's binding preset
 *   - `outdated`          — preset.supersededBy is set (newer version exists)
 *   - `registry-revoked`  — preset.revokedAt is set
 *
 * Precedence (highest → lowest):
 *   registry-revoked > mismatch > outdated > active > none
 *
 * Reason: if a preset was revoked, that always takes priority — the user
 * must know data integrity is compromised. Mismatch beats outdated since
 * a fresh-but-wrong preset is more confusing than a known-outdated one.
 *
 * Out of scope (deferred):
 *   - Multi-preset bindings (D7 pending Calvin homologation)
 *   - Trust-chain badge state (RF12 / D6 — separate resolver)
 *   - Compliance-calculated indicator (RF9 / B1 — separate adjacent VM)
 *
 * Tests live in `tests/compliance-banner-state-resolver-pure.test.mjs`.
 */

import type { CompliancePreset } from './_presetPure';

export type BannerStateKind = 'none' | 'active' | 'mismatch' | 'outdated' | 'registry-revoked';

export interface BannerInput {
    /** Preset selected at workspace level (what the user picked). Null = no preset. */
    readonly workspacePresetId?: string | null;
    /** Preset id bound to the currently-open model. Null = model has no binding. */
    readonly modelBindingPresetId?: string | null;
    /** The currently-selected preset payload (workspace preset). */
    readonly currentPreset?: CompliancePreset | null;
}

export interface BannerStateVM {
    readonly kind: BannerStateKind;
    /** i18n key for the banner label. */
    readonly labelKey: string;
    /** Color hex from preset if available, else state-default. */
    readonly color: string;
    /** Severity for a11y (informational/warning/error). */
    readonly severity: 'info' | 'warning' | 'error';
    /** Extra context for the modal/detail view. */
    readonly detail: Readonly<Record<string, string>>;
}

const COLOR_NEUTRAL = '#6b7280';
const COLOR_WARNING = '#f59e0b';
const COLOR_ERROR = '#ef4444';

const LABEL_NONE = 'compliance.banner.state.none';
const LABEL_ACTIVE = 'compliance.banner.state.active';
const LABEL_MISMATCH = 'compliance.banner.state.mismatch';
const LABEL_OUTDATED = 'compliance.banner.state.outdated';
const LABEL_REVOKED = 'compliance.banner.state.revoked';

function freezeVm(vm: BannerStateVM): BannerStateVM {
    return Object.freeze({
        ...vm,
        detail: Object.freeze({ ...vm.detail }),
    });
}

/**
 * Resolve the banner state VM from current workspace + model + registry
 * context. Pure, side-effect-free, returns frozen VM.
 *
 * @example
 *   resolveBannerState({ workspacePresetId: null }) // → 'none'
 *   resolveBannerState({ workspacePresetId: 'a', modelBindingPresetId: 'b', currentPreset: pa })
 *     // → 'mismatch' (workspace = 'a', model = 'b')
 */
export function resolveBannerState(input: BannerInput | null | undefined): BannerStateVM {
    if (!input || typeof input !== 'object') {
        return freezeVm({
            kind: 'none',
            labelKey: LABEL_NONE,
            color: COLOR_NEUTRAL,
            severity: 'info',
            detail: {},
        });
    }

    const ws = input.workspacePresetId ?? null;
    const mb = input.modelBindingPresetId ?? null;
    const preset = input.currentPreset ?? null;

    // STATE 1 — none: no workspace preset AND no model binding
    if (!ws && !mb) {
        return freezeVm({
            kind: 'none',
            labelKey: LABEL_NONE,
            color: COLOR_NEUTRAL,
            severity: 'info',
            detail: {},
        });
    }

    // STATE 2 — registry-revoked: highest precedence (preset still applied
    // but data integrity is compromised). Check before mismatch so the user
    // sees the revocation reason even when also wrong preset.
    if (preset && preset.revokedAt) {
        return freezeVm({
            kind: 'registry-revoked',
            labelKey: LABEL_REVOKED,
            color: COLOR_ERROR,
            severity: 'error',
            detail: {
                presetId: preset.id,
                revokedAt: preset.revokedAt,
                revokedReason: preset.revokedReason ?? '',
                supersededBy: preset.supersededBy ?? '',
            },
        });
    }

    // STATE 3 — mismatch: workspace and model disagree.
    // Special case: model has binding but workspace doesn't → still mismatch
    // (the imported model declares a preset; workspace is empty).
    if (mb && ws && mb !== ws) {
        return freezeVm({
            kind: 'mismatch',
            labelKey: LABEL_MISMATCH,
            color: COLOR_WARNING,
            severity: 'warning',
            detail: {
                workspacePresetId: ws,
                modelBindingPresetId: mb,
            },
        });
    }
    if (mb && !ws) {
        return freezeVm({
            kind: 'mismatch',
            labelKey: LABEL_MISMATCH,
            color: COLOR_WARNING,
            severity: 'warning',
            detail: {
                workspacePresetId: '',
                modelBindingPresetId: mb,
            },
        });
    }

    // STATE 4 — outdated: workspace preset has a successor.
    if (preset && preset.supersededBy) {
        return freezeVm({
            kind: 'outdated',
            labelKey: LABEL_OUTDATED,
            color: COLOR_WARNING,
            severity: 'warning',
            detail: {
                presetId: preset.id,
                supersededBy: preset.supersededBy,
            },
        });
    }

    // STATE 5 — active: workspace == model (or model has no binding yet but
    // workspace is set), preset is current and not revoked.
    if (ws) {
        return freezeVm({
            kind: 'active',
            labelKey: preset?.bannerLabelKey ?? LABEL_ACTIVE,
            color: preset?.bannerColor ?? COLOR_NEUTRAL,
            severity: 'info',
            detail: {
                presetId: ws,
                ...(preset?.publishedBy.authority ? { authority: preset.publishedBy.authority } : {}),
                ...(preset?.publishedBy.jurisdiction
                    ? { jurisdiction: preset.publishedBy.jurisdiction }
                    : {}),
            },
        });
    }

    // Defensive fallthrough — should be unreachable.
    return freezeVm({
        kind: 'none',
        labelKey: LABEL_NONE,
        color: COLOR_NEUTRAL,
        severity: 'info',
        detail: {},
    });
}

/**
 * Convenience predicate — `true` if the banner state requires user action
 * (mismatch / outdated / revoked). Useful for `aria-live` polite vs assertive.
 */
export function bannerStateRequiresAttention(vm: BannerStateVM | null | undefined): boolean {
    if (!vm) return false;
    return vm.kind === 'mismatch' || vm.kind === 'outdated' || vm.kind === 'registry-revoked';
}
