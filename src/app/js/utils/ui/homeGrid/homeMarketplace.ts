// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * homeMarketplace.js - Marketplace Activity & Community Impact
 * Extracted from homeGrid.js per SPLIT-HOMEGRID-001 S2.
 * Pure UI subdomain: renders marketplace feed, published libraries stats,
 * and community impact counters into provided container elements.
 */

// eslint-disable-next-line
import { escapeHtml } from '../../helpers/html.js';
import { formatActivity, formatTimeAgo } from './homeMarketplaceHelpers.js';
import { t } from '../../i18n/translations.js';
import { getCurrentUser } from '../../auth/session.js';
import {
    fetchActivityFeed,
    getMyPublishedLibraries,
    fetchCommunityImpact,
} from '../../libraries/supabaseMarketplace.js';

const DATA_CACHE_TTL = 60000; // 1 minute

// --- State ---
/** @type {*} */
let _marketplaceEl: any = null;
/** @type {*} */
let _impactEl: any = null;
/** @type {*} */
let _marketplaceCache: any = null;
/** @type {*} */
let _marketplaceCacheUserId: any = null;
/** @type {*} */
let _marketplaceInFlight: any = null;
/** @type {*} */
let _communityImpactCache: any = null;
let _communityImpactFetchedAt = 0;
let _lastDataFetch = 0;

// --- Public API ---

/** @param {*} marketplaceContainer @param {*} impactContainer */
export function initMarketplace(marketplaceContainer: any, impactContainer: any) {
    _marketplaceEl = marketplaceContainer;
    _impactEl = impactContainer;
}

export function renderMarketplace() {
    _renderCommunityImpact();
    _renderMarketplaceActivity();
}

export function destroyMarketplace() {
    _marketplaceEl = null;
    _impactEl = null;
    _marketplaceCache = null;
    _marketplaceCacheUserId = null;
    _marketplaceInFlight = null;
    _communityImpactCache = null;
    _communityImpactFetchedAt = 0;
    _lastDataFetch = 0;
}

// --- Internal ---

/** @param {*} userId */
function _resetMarketplaceCacheForUser(userId: any) {
    if (_marketplaceCacheUserId === userId) return;
    _marketplaceCacheUserId = userId;
    _marketplaceCache = null;
    _lastDataFetch = 0;
    _marketplaceInFlight = null;
}

/** @param {*} userId */
async function _ensureMarketplaceData(userId: any) {
    if (!userId) return { activity: [], myLibs: [] };

    _resetMarketplaceCacheForUser(userId);

    const now = Date.now();
    if (_marketplaceCache && now - _lastDataFetch < DATA_CACHE_TTL) {
        return _marketplaceCache;
    }
    if (_marketplaceInFlight?.userId === userId) {
        return _marketplaceInFlight.promise;
    }

    const promise = Promise.all([fetchActivityFeed(10), getMyPublishedLibraries()])
        .then(([activity, myLibs]) => {
            const result = { activity: activity || [], myLibs: myLibs || [] };
            if (_marketplaceCacheUserId === userId) {
                _marketplaceCache = result;
                _lastDataFetch = Date.now();
            }
            return result;
        })
        .finally(() => {
            if (_marketplaceInFlight?.userId === userId) {
                _marketplaceInFlight = null;
            }
        });

    _marketplaceInFlight = { userId, promise };
    return promise;
}

async function _renderCommunityImpact() {
    if (!_impactEl) return;

    const now = Date.now();
    let impact;
    if (_communityImpactCache && now - _communityImpactFetchedAt < DATA_CACHE_TTL) {
        impact = _communityImpactCache;
    } else {
        impact = await fetchCommunityImpact();
        _communityImpactCache = impact;
        _communityImpactFetchedAt = now;
    }
    if (!impact) {
        _impactEl.innerHTML = '';
        _impactEl.style.display = 'none';
        return;
    }

    if ((impact.users || 0) === 0 && (impact.models || 0) === 0) {
        _impactEl.innerHTML = '';
        _impactEl.style.display = 'none';
        return;
    }

    _impactEl.style.display = 'block';

    const isEarly = impact.users < 10;
    const narrative = isEarly
        ? t('communityImpactEarly') || 'Community forming -- be one of the first to contribute'
        : (
              t('communityImpactNarrative') ||
              'Together, {users} professionals are building transparent environmental monitoring'
          ).replace('{users}', impact.users);

    _impactEl.innerHTML = `
        <div class="home-section-header">
            <span class="home-section-title">${t('communityImpactTitle') || 'Community Impact'}</span>
        </div>
        <div class="home-impact-narrative">${narrative}</div>
        <div class="home-impact-counters">
            <div class="home-impact-counter">
                <div class="home-impact-counter-value">${impact.users}</div>
                <div class="home-impact-counter-label">${t('communityImpactUsers') || 'professionals'}</div>
            </div>
            <div class="home-impact-counter">
                <div class="home-impact-counter-value">${impact.models}</div>
                <div class="home-impact-counter-label">${t('communityImpactModels') || 'models published'}</div>
            </div>
        </div>
    `;
}

async function _renderMarketplaceActivity() {
    if (!_marketplaceEl) return;

    const user = getCurrentUser();
    const requestUserId = user?.id || null;
    if (!requestUserId) {
        _marketplaceEl.innerHTML = '';
        _marketplaceEl.style.display = 'none';
        return;
    }

    _marketplaceEl.style.display = 'block';

    const { activity, myLibs } = await _ensureMarketplaceData(requestUserId);
    if (getCurrentUser()?.id !== requestUserId || !_marketplaceEl) return;

    const html = _buildMarketplaceHtml(activity, myLibs);
    if (html === null) {
        _marketplaceEl.innerHTML = '';
        _marketplaceEl.style.display = 'none';
        return;
    }

    _marketplaceEl.innerHTML = html;

    if (typeof window.hydrateIcons === 'function') {
        window.hydrateIcons(_marketplaceEl);
    }
}

function _sumLibField(libs: Array<any>, field: string): number {
    return libs.reduce((s: number, l: any) => s + (l[field] || 0), 0);
}

function _buildActivityItemsHtml(activity: Array<any>): string {
    return activity
        .map(
            (a: any) => `
        <div class="home-marketplace-activity-item">
            <span class="home-marketplace-activity-text">${formatActivity(a)}</span>
            <span class="home-marketplace-activity-time">${formatTimeAgo(a.created_at)}</span>
        </div>
    `,
        )
        .join('');
}

function _buildPublishedStatsHtml(libs: Array<any>): string {
    const totalLikes = _sumLibField(libs, 'likes_count');
    const totalInstalls = _sumLibField(libs, 'installs_count');
    const salesCount = _sumLibField(libs, 'sales_count');
    const activityItems = ''; // rendered separately by caller when needed

    return `
        <div class="home-section-header">
            <span class="home-section-title">${t('homeMarketplaceTitle') || 'Marketplace Activity'}</span>
            <span class="home-marketplace-badge">${libs.length} ${t('homePublished') || 'published'}</span>
        </div>
        <div class="home-marketplace-content">
            <div class="home-marketplace-stats">
                <div class="home-marketplace-stat">
                    <span class="home-marketplace-stat-value">${totalLikes}</span>
                    <span class="home-marketplace-stat-label">${t('homeTotalLikes') || 'likes'}</span>
                </div>
                <div class="home-marketplace-stat">
                    <span class="home-marketplace-stat-value">${totalInstalls}</span>
                    <span class="home-marketplace-stat-label">${t('homeTotalInstalls') || 'installs'}</span>
                </div>
                <div class="home-marketplace-stat">
                    <span class="home-marketplace-stat-value">${salesCount}</span>
                    <span class="home-marketplace-stat-label">${t('homeSales') || 'sales'}</span>
                </div>
            </div>
            ${activityItems}
        </div>
    `;
}

function _buildMarketplaceWithLibsHtml(activity: Array<any>, libs: Array<any>): string {
    const statsHtml = _buildPublishedStatsHtml(libs);
    if (activity.length === 0) return statsHtml;

    const activityHeader = `<div class="home-marketplace-activity-header">${t('homeRecentActivity') || 'Recent Activity'}</div>`;
    const activityHtml = `<div class="home-marketplace-activity">${activityHeader}${_buildActivityItemsHtml(activity)}</div>`;

    return statsHtml.replace(activityItems, activityHtml);
}

const activityItems = '<!--ACTIVITY-PLACEHOLDER-->';

function _buildCommunityFeedHtml(activity: Array<any>): string | null {
    const communityFeed = activity.slice(0, 5);
    if (communityFeed.length === 0) return null;

    return `
        <div class="home-section-header">
            <span class="home-section-title">${t('homeMarketplaceTitle') || 'Marketplace Activity'}</span>
        </div>
        <div class="home-marketplace-content">
            <div class="home-marketplace-activity">
                ${_buildActivityItemsHtml(communityFeed)}
            </div>
        </div>
    `;
}

function _buildMarketplaceHtml(activity: Array<any>, myLibs: Array<any>): string | null {
    if (Array.isArray(myLibs) && myLibs.length > 0) {
        return _buildMarketplaceWithLibsHtml(activity || [], myLibs);
    }
    return _buildCommunityFeedHtml(activity || []);
}

// formatActivity and formatTimeAgo live in homeMarketplaceHelpers.js
