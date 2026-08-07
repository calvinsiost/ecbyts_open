// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * homeIdentityHelpers.ts - Pure helpers for identity/reputation formatting.
 * No side effects, no DOM, no network. Easily testable.
 */

export function formatInitials(displayName: unknown): string {
    if (typeof displayName !== 'string') return 'U';
    const initials = displayName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || '')
        .join('');
    return initials || 'U';
}

export function computeProgressPercent(score: number, min: number, threshold: number): number {
    if (threshold <= min) return 100;
    const pct = ((score - min) / (threshold - min)) * 100;
    return Math.min(100, Math.round(pct));
}
