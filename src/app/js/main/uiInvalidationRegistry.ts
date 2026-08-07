// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

export const UI_INVALIDATION_DOMAINS = Object.freeze({
    FULL: 'full',
    AERIAL: 'aerial',
    ANALYTICS: 'analytics',
    AUTH: 'auth',
    BOREHOLE: 'borehole',
    CONSTANTS: 'constants',
    DEMO: 'demo',
    ELEMENT_LIST: 'elementList',
    FILES: 'files',
    HISTORY: 'history',
    HIERARCHY: 'hierarchy',
    HOME: 'home',
    INGESTION: 'ingestion',
    INSPECTOR: 'inspector',
    INTERPOLATION: 'interpolation',
    ISSUES: 'issues',
    LIBRARIES: 'libraries',
    LISTS: 'lists',
    MODEL: 'model',
    NN: 'nn',
    PIPELINES: 'pipelines',
    PHOTOLOG: 'photolog',
    REPORT: 'report',
    SCENE: 'scene',
    SENSOR: 'sensor',
    STATUS: 'status',
    SYMBOLOGY: 'symbology',
    TICKER: 'ticker',
    TOUR: 'tour',
    VALIDATION: 'validation',
    VOXEL: 'voxel',
});

type UIInvalidationDomain = (typeof UI_INVALIDATION_DOMAINS)[keyof typeof UI_INVALIDATION_DOMAINS];
type InvalidationSnapshot = Readonly<{
    domains: readonly UIInvalidationDomain[];
    hasFull: boolean;
    reasons: readonly string[];
}>;

const VALID_DOMAINS = new Set(Object.values(UI_INVALIDATION_DOMAINS));

/**
 * Normalize unknown domains to full compatibility mode.
 * Dominios novos nunca podem perder render por erro de chamada.
 */
export function normalizeUIInvalidationDomain(domain: unknown): UIInvalidationDomain {
    return VALID_DOMAINS.has(domain as UIInvalidationDomain)
        ? (domain as UIInvalidationDomain)
        : UI_INVALIDATION_DOMAINS.FULL;
}

/**
 * Small queue for domain-scoped UI invalidation.
 * Agrega eventos no mesmo frame e preserva fallback full.
 */
export function createUIInvalidationRegistry({ scheduleFlush }: { scheduleFlush: () => void }) {
    const pendingDomains = new Set<UIInvalidationDomain>();
    const pendingReasons: string[] = [];
    let scheduled = false;

    function invalidate(domain: unknown = UI_INVALIDATION_DOMAINS.FULL, reason = 'unspecified'): void {
        pendingDomains.add(normalizeUIInvalidationDomain(domain));
        pendingReasons.push(String(reason || 'unspecified'));
        if (!scheduled) {
            scheduled = true;
            scheduleFlush();
        }
    }

    function consumePending(): InvalidationSnapshot {
        const domains = pendingDomains.size > 0
            ? [...pendingDomains]
            : [UI_INVALIDATION_DOMAINS.FULL];
        const reasons = [...pendingReasons];
        pendingDomains.clear();
        pendingReasons.length = 0;
        scheduled = false;
        return Object.freeze({
            domains: Object.freeze(domains),
            hasFull: domains.includes(UI_INVALIDATION_DOMAINS.FULL),
            reasons: Object.freeze(reasons),
        });
    }

    return Object.freeze({
        consumePending,
        getPendingDomains: () => Object.freeze([...pendingDomains]),
        invalidate,
        isScheduled: () => scheduled,
    });
}
