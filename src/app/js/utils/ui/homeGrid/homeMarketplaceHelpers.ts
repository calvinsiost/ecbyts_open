// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * homeMarketplaceHelpers.ts - Pure helpers for marketplace formatting.
 * No side effects, no DOM, no network. Easily testable.
 */

interface MarketplaceActivity {
    actor?: {
        display_name?: unknown;
    };
    library?: {
        name?: unknown;
    };
    activity_type?: unknown;
}

export function formatActivity(activity: MarketplaceActivity = {}): string {
    const actor = escapeHtml(activity.actor?.display_name || 'Someone');
    const lib = escapeHtml(activity.library?.name || 'your library');
    switch (activity.activity_type) {
        case 'like':
            return `${actor} liked ${lib}`;
        case 'comment':
            return `${actor} commented on ${lib}`;
        case 'install':
            return `${actor} installed ${lib}`;
        case 'purchase':
            return `${actor} purchased ${lib}`;
        default:
            return `${actor} interacted with ${lib}`;
    }
}

export function formatTimeAgo(timestamp: string | number | Date): string {
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}

function escapeHtml(str: unknown): string {
    if (typeof str !== 'string') return String(str);
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
