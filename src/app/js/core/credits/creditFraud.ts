// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

export const BASELINE_DAYS = 30;
export const AXIS_CEILING = 2.0;
export const ELEMENT_FLOOR = 5;
export const OBS_DENSITY_FLOOR = 3.0;
export const CAMPAIGN_FLOOR = 2;
export const COOLDOWN_DAYS = 14;

export interface SnapshotMetrics {
    elementCount?: number;
    observationCount?: number;
    campaignCount?: number;
}

function diffDays(fromIso: string, toIso: string = new Date().toISOString()): number {
    const from = new Date(fromIso).getTime();
    const to = new Date(toIso).getTime();
    if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
    return Math.floor((to - from) / 86_400_000);
}

export function checkBaselinePeriod(
    modelCreatedAt: string,
    nowIso: string = new Date().toISOString(),
): boolean {
    return diffDays(modelCreatedAt, nowIso) >= BASELINE_DAYS;
}

export function checkAxisCeiling(deltaAxes: Record<string, number> = {}): boolean {
    return ['T', 'A', 'Cp', 'Ty', 'Cs', 'Cm'].every((axis) => Number(deltaAxes?.[axis] || 0) <= AXIS_CEILING);
}

export function checkElementFloor(endSnapshot: SnapshotMetrics = {}): boolean {
    return Number(endSnapshot?.elementCount || 0) >= ELEMENT_FLOOR;
}

export function checkObservationDensity(endSnapshot: SnapshotMetrics = {}): boolean {
    const elements = Number(endSnapshot?.elementCount || 0);
    const observations = Number(endSnapshot?.observationCount || 0);
    if (elements <= 0) return false;
    return observations / elements >= OBS_DENSITY_FLOOR;
}

export function checkCampaignContinuity(endSnapshot: SnapshotMetrics = {}): boolean {
    return Number(endSnapshot?.campaignCount || 0) >= CAMPAIGN_FLOOR;
}

export function checkCooldown(lastMintAt: string | null | undefined, nowIso: string = new Date().toISOString()): boolean {
    if (!lastMintAt) return true;
    return diffDays(lastMintAt, nowIso) >= COOLDOWN_DAYS;
}

export async function checkSnapshotIntegrity(startSnapshot: unknown, endSnapshot: unknown): Promise<boolean> {
    if (!startSnapshot || !endSnapshot) return false;
    if (typeof crypto === 'undefined' || !crypto.subtle?.digest) return false;
    
    const hasher = async (obj: unknown): Promise<string> => {
        const bytes = new TextEncoder().encode(JSON.stringify(obj || {}));
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest))
            .map((v) => v.toString(16).padStart(2, '0'))
            .join('');
    };
    const a = await hasher(startSnapshot);
    const b = await hasher(endSnapshot);
    return Boolean(a && b && a !== b);
}

export function checkCrossScopeOutlier(): boolean {
    // Placeholder gate for future population-based z-score detection.
    return true;
}