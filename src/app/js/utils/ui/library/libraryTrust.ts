// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   LIBRARY TRUST — pure scoring/sort helpers for SPEC_LIBRARY_HUB_V2.

   Isolated from libraryItemBrowser.js so it has ZERO browser/Supabase
   imports and can be tested in Node cheap tests directly.
   ================================================================ */

interface CatalogItem {
    library_id?: string;
    name?: string;
    install_count?: number;
    avg_rating?: number;
    total_ratings?: number;
    _creatorType?: string;
    _creatorStatus?: string;
}

/**
 * Whether a catalog item comes from a verified publisher.
 * Verified = professional/credentialed creator OR a verified status flag.
 * @param {CatalogItem} item
 * @returns {boolean}
 */
export function isVerifiedPublisher(item: CatalogItem | undefined | null): boolean {
    if (!item) return false;
    const status = String(item._creatorStatus || '').toLowerCase();
    const type = String(item._creatorType || '').toLowerCase();
    if (status === 'verified' || status === 'professional') return true;
    return type !== '' && type !== 'common' && type !== 'none';
}

/**
 * Composite trust score in [0,1] from install count, rating, and the
 * verified-publisher signal. Logarithmic install weighting prevents
 * popularity from dominating (VS Code marketplace multi-metric pattern).
 * @param {CatalogItem} item
 * @param {number} [maxInstalls] highest install_count in the listing
 * @returns {number} 0..1 rounded to 3 decimals
 */
export function computeTrustScore(item: CatalogItem | undefined | null, maxInstalls: number = 0): number {
    if (!item) return 0;
    const installs = Math.max(0, Number(item.install_count) || 0);
    const rating = Math.max(0, Math.min(5, Number(item.avg_rating) || 0));
    const verified = isVerifiedPublisher(item) ? 1 : 0;
    const cap = Math.max(installs, maxInstalls, 1);
    const installFactor = Math.log10(installs + 1) / Math.log10(cap + 1);
    const score = 0.5 * (rating / 5) + 0.3 * installFactor + 0.2 * verified;
    return Math.round(Math.min(1, Math.max(0, score)) * 1000) / 1000;
}

/**
 * Sort a catalog listing by the chosen criterion. Returns a new array.
 * @param {CatalogItem[]} items
 * @param {'recommended'|'installs'|'rating'|'name'} sort
 * @returns {CatalogItem[]}
 */
export function sortItems(items: CatalogItem[], sort: 'recommended' | 'installs' | 'rating' | 'name'): CatalogItem[] {
    const list = Array.isArray(items) ? items.slice() : [];
    const maxInstalls = list.reduce((m, i) => Math.max(m, Number(i.install_count) || 0), 0);
    const byName = (a: CatalogItem, b: CatalogItem): number =>
        String(a.name || '').localeCompare(String(b.name || ''));
    if (sort === 'name') return list.sort(byName);
    if (sort === 'installs') {
        return list.sort((a, b) => (Number(b.install_count) || 0) - (Number(a.install_count) || 0) || byName(a, b));
    }
    if (sort === 'rating') {
        return list.sort((a, b) => (Number(b.avg_rating) || 0) - (Number(a.avg_rating) || 0) || byName(a, b));
    }
    return list.sort((a, b) => computeTrustScore(b, maxInstalls) - computeTrustScore(a, maxInstalls) || byName(a, b));
}
