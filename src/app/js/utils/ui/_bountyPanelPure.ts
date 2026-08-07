// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM Wave QQQ3 (Tier B per MONOLITH_IMPACT_ANALYSIS_2026_05_27).
// Pure-logic extraction from utils/ui/bountyPanel.js
// (densidade seam 12.1/100L — Tier B hidden gem #3).
//
// Hand-authored R1-safe.
//
// Spec NOT:
// - NÃO ler DOM (caller monta cards/leaderboard rows)
// - NÃO ler i18n (caller resolve labels via t())
// - NÃO ler eventBus (caller integra eventos)
// - NÃO ler getCurrentUser/window.* (caller injeta dados)
// - NÃO emoji
//
// Extracted helpers:
//   - SEVERITY_COLORS / TIER_LABELS / FLAG_LABELS  (frozen constants)
//   - computeBountyStats     (counts + total verified points)
//   - applyBountyFilters     (severity / status / flagType filter)
//   - getLeaderboardTopN     (slice top N, default 10)
//   - extractUsernameFromId  (id → username before @)
//   - formatLeaderboardRank  (1-based "#N" + rank-1/2/3 podium class)

export type BountySeverity = 'low' | 'medium' | 'high' | 'critical';
export type BountyTier = 'bronze' | 'silver' | 'gold' | 'platinum';
export type BountyStatus = 'open' | 'in_progress' | 'resolved' | 'wontfix' | 'planned';
export type BountyFlagType =
    | 'data_quality'
    | 'compliance'
    | 'suspicious_reading'
    | 'equipment'
    | 'general';

export interface BountyIssue {
    id?: string;
    type?: string;
    status?: BountyStatus | string;
    severity?: BountySeverity | string;
    bounty?: {
        flagType?: BountyFlagType | string;
        rewardPoints?: number;
        verifiedBy?: string | null;
    };
}

export interface BountyStats {
    open: number;
    claimed: number;
    resolved: number;
    totalPoints: number;
}

export interface BountyFilterState {
    severity: 'all' | BountySeverity | string;
    status: 'all' | BountyStatus | string;
    flagType: 'all' | BountyFlagType | string;
}

export interface LeaderboardEntry {
    userId: string;
    totalPoints: number;
    resolved: number;
}

export interface FormattedRank {
    label: string;
    rankClass: string;
}

/** Frozen severity color palette. */
export const SEVERITY_COLORS: Readonly<Record<BountySeverity, string>> = Object.freeze({
    low: '#3498db',
    medium: '#f39c12',
    high: '#e74c3c',
    critical: '#8e44ad',
});

/** Frozen tier metadata: label + reward points. */
export const TIER_LABELS: Readonly<Record<BountyTier, { label: string; points: number }>> = Object.freeze({
    bronze: { label: 'Bronze', points: 5 },
    silver: { label: 'Silver', points: 15 },
    gold: { label: 'Gold', points: 40 },
    platinum: { label: 'Platinum', points: 100 },
});

/** Frozen flag type labels (English fallback; caller may override via i18n). */
export const FLAG_LABELS: Readonly<Record<BountyFlagType, string>> = Object.freeze({
    data_quality: 'Data Quality',
    compliance: 'Compliance',
    suspicious_reading: 'Suspicious',
    equipment: 'Equipment',
    general: 'General',
});

/**
 * Compute stats over a bounty list:
 *   - open: status === 'open'
 *   - claimed: status === 'in_progress'
 *   - resolved: status === 'resolved'
 *   - totalPoints: sum of rewardPoints over resolved+verified entries
 */
export function computeBountyStats(bounties: ReadonlyArray<BountyIssue> | null | undefined): BountyStats {
    if (!Array.isArray(bounties)) return { open: 0, claimed: 0, resolved: 0, totalPoints: 0 };
    let open = 0;
    let claimed = 0;
    let resolved = 0;
    let totalPoints = 0;
    for (const b of bounties) {
        if (!b || typeof b !== 'object') continue;
        if (b.status === 'open') open++;
        else if (b.status === 'in_progress') claimed++;
        else if (b.status === 'resolved') {
            resolved++;
            if (b.bounty?.verifiedBy) {
                const pts = b.bounty?.rewardPoints;
                if (typeof pts === 'number' && Number.isFinite(pts)) {
                    totalPoints += pts;
                }
            }
        }
    }
    return { open, claimed, resolved, totalPoints };
}

/**
 * Apply severity/status/flagType filters to an issue list.
 * `flagType` filter applies only to non-service_request entries.
 * Returns a new array (immutable).
 */
export function applyBountyFilters(
    issues: ReadonlyArray<BountyIssue> | null | undefined,
    filters: BountyFilterState,
): BountyIssue[] {
    if (!Array.isArray(issues)) return [];
    if (!filters || typeof filters !== 'object') return [...issues];
    const fSev = filters.severity ?? 'all';
    const fStat = filters.status ?? 'all';
    const fFlag = filters.flagType ?? 'all';
    const out: BountyIssue[] = [];
    for (const b of issues) {
        if (!b || typeof b !== 'object') continue;
        if (fSev !== 'all' && b.severity !== fSev) continue;
        if (fStat !== 'all' && b.status !== fStat) continue;
        if (fFlag !== 'all' && b.type !== 'service_request' && b.bounty?.flagType !== fFlag) continue;
        out.push(b);
    }
    return out;
}

/**
 * Slice top-N leaderboard entries (default 10).
 * Preserves caller's order — does not sort.
 */
export function getLeaderboardTopN(
    entries: ReadonlyArray<LeaderboardEntry> | null | undefined,
    n: number = 10,
): LeaderboardEntry[] {
    if (!Array.isArray(entries)) return [];
    const safeN = Number.isFinite(n) && n > 0 ? Math.floor(n) : 10;
    return entries.slice(0, safeN);
}

/**
 * Extract username segment from an id like "user@example.com".
 * Returns the original string if no '@' is present.
 */
export function extractUsernameFromId(userId: string | null | undefined): string {
    if (typeof userId !== 'string' || !userId) return '';
    const at = userId.indexOf('@');
    return at >= 0 ? userId.slice(0, at) : userId;
}

/**
 * Format a 0-based leaderboard index as podium rank label + class.
 * Returns:
 *   - label: "#1", "#2", "#3", ...
 *   - rankClass: "rank-1" / "rank-2" / "rank-3" for top 3, empty otherwise
 */
export function formatLeaderboardRank(index: number): FormattedRank {
    if (!Number.isFinite(index) || index < 0) {
        return { label: '#0', rankClass: '' };
    }
    const i = Math.floor(index);
    const label = `#${i + 1}`;
    const rankClass = i < 3 ? `rank-${i + 1}` : '';
    return { label, rankClass };
}

/** Check whether a string is a valid BountySeverity. */
export function isValidSeverity(value: unknown): value is BountySeverity {
    return value === 'low' || value === 'medium' || value === 'high' || value === 'critical';
}

/** Check whether a string is a valid BountyStatus. */
export function isValidStatus(value: unknown): value is BountyStatus {
    return (
        value === 'open' ||
        value === 'in_progress' ||
        value === 'resolved' ||
        value === 'wontfix' ||
        value === 'planned'
    );
}
