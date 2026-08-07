// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ODS 17 Partnerships — pure measurer (F2 of SPEC_ODS_IMPACT_RISK).
 *
 * Targets UN indicator 17.16.1 — "Number of countries reporting progress in
 * multi-stakeholder development effectiveness monitoring frameworks". In
 * ecbyts terms the proxy is project-scoped:
 *
 *   IMPACT = non-compensatory aggregate of three sub-indicators:
 *            (a) `radarDiversity` = nDistinctProfileTypes / 5  (saturation)
 *            (b) `forumActivity`  = ratio of cross-org threads / total threads
 *            (c) `governanceTransparency` = 1 if audit log enabled, else 0
 *   RISK   = 1 − IMPACT  (clamped to [0, 1])
 *   TIER   = T1 (all 3 readings present from existing core modules)
 *          | T2 (1-2 readings present, the others null)
 *          | T0 (zero readings — module not initialised yet)
 *
 * Anti-requirements honoured (SPEC §2):
 *   - N1 no fabricated data: missing inputs return `null` per sub-indicator;
 *     when all three are null → tier='T0' and impact/risk null.
 *   - N4 non-compensatory: uses the same geometric aggregate as the rest of
 *     `core/ods/`.
 *   - N5 reuse only: ZERO new bases — the inputs are computed from
 *     `core/radar` (profileRegistry), `core/forum` (threadRegistry) and
 *     `core/governance` (G1 audit log) which are ALREADY in the repo.
 *
 * Tests live in `tests/ods17-pure.test.mjs`.
 */

import { nonCompensatoryAggregate } from '../_normalizePure.js';
import type { OdsTier } from '../_registryPure.js';

export interface Ods17Input {
    /** Number of distinct radar profile *types* active in the project (e.g.
     *  REGULATOR, COMMUNITY, INVESTOR, etc). Bounded saturation at 5 = full
     *  diversity. Null when radar module is not initialised. */
    readonly radarProfileTypeCount?: number | null;
    /** Total forum threads visible in the project. */
    readonly forumThreadCount?: number | null;
    /** Forum threads with participants from > 1 organisation. */
    readonly forumCrossOrgThreadCount?: number | null;
    /** True when the G1 governance audit log has at least one entry. */
    readonly governanceAuditEnabled?: boolean | null;
}

export interface Ods17SubScores {
    readonly radarDiversity: number | null;
    readonly forumActivity: number | null;
    readonly governanceTransparency: number | null;
}

export interface Ods17Result {
    readonly impact: number | null;
    readonly risk: number | null;
    readonly tier: OdsTier;
    readonly subScores: Ods17SubScores;
    readonly provenance: ReadonlyArray<string>;
}

function clamp01(value: number): number {
    if (!Number.isFinite(value)) return 0;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}

function readRadarDiversity(count: number | null | undefined): number | null {
    if (count === null || count === undefined || !Number.isFinite(count)) return null;
    if (count < 0) return 0;
    // Saturation at 5 distinct types
    return clamp01(count / 5);
}

function readForumActivity(
    total: number | null | undefined,
    crossOrg: number | null | undefined,
): number | null {
    if (
        total === null || total === undefined ||
        crossOrg === null || crossOrg === undefined ||
        !Number.isFinite(total) || !Number.isFinite(crossOrg)
    ) {
        return null;
    }
    if (total <= 0) return 0;
    return clamp01((crossOrg as number) / (total as number));
}

function readGovernanceTransparency(enabled: boolean | null | undefined): number | null {
    if (enabled === null || enabled === undefined) return null;
    return enabled ? 1 : 0;
}

/**
 * Compute ODS 17 partnership impact + risk + tier from the three internal
 * readings. Deterministic. Returns frozen result.
 */
export function measureOds17Partnerships(input: Ods17Input): Ods17Result {
    const inp = input || ({} as Ods17Input);
    const radarDiversity = readRadarDiversity(inp.radarProfileTypeCount);
    const forumActivity = readForumActivity(
        inp.forumThreadCount,
        inp.forumCrossOrgThreadCount,
    );
    const governanceTransparency = readGovernanceTransparency(inp.governanceAuditEnabled);

    const present: number[] = [];
    const provenance: string[] = [];
    if (radarDiversity !== null) {
        present.push(radarDiversity);
        provenance.push('radar:profileTypeCount/5');
    }
    if (forumActivity !== null) {
        present.push(forumActivity);
        provenance.push('forum:crossOrgThreadRatio');
    }
    if (governanceTransparency !== null) {
        present.push(governanceTransparency);
        provenance.push('governance:auditLogEnabled');
    }

    let tier: OdsTier;
    if (present.length === 0) tier = 'T0';
    else if (present.length === 3) tier = 'T1';
    else tier = 'T2';

    const impact = present.length > 0 ? nonCompensatoryAggregate(present) : null;
    const risk = impact === null ? null : clamp01(1 - (impact as number));

    return Object.freeze({
        impact,
        risk,
        tier,
        subScores: Object.freeze({
            radarDiversity,
            forumActivity,
            governanceTransparency,
        }),
        provenance: Object.freeze(provenance),
    });
}
