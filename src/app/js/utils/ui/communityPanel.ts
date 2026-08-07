// @ts-check
// Generated from src/app/js/utils/ui/communityPanel.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.2
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   COMMUNITY PANEL — Hall dos Guardioes
   ================================================================

   Painel comunitario como aba dockavel.
   3 abas: Top Contribuidores, Badges, Minha Jornada.

   ================================================================ */
import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';
import { getCurrentUser } from '../auth/session.js';
import { fetchTopCreators, getUserBadges, fetchCreatorProfile } from '../libraries/supabaseMarketplace.js';
import { getLeaderboard } from '../../core/issues/manager.js';
// --- State ---
let _container: any = null;
let _activeTab = 'top';
// PERF-MASTER S3.3 - listener cleanup via AbortController.
// Cada _render() recria DOM completo, então abortamos listeners velhos
// antes de criar novos para evitar acumulação em re-renders.
let _abortController: any = null;
// --- Environmental tier labels ---
const TIER_LABELS = {
    seed: { label: 'Seed', envLabel: 'Semente', min: 0 },
    rising: { label: 'Rising', envLabel: 'Nascente', min: 40 },
    active: { label: 'Active', envLabel: 'Aquifero', min: 60 },
    trusted: { label: 'Trusted', envLabel: 'Guardiao', min: 75 },
    vanguard: { label: 'Vanguard', envLabel: 'Sentinela', min: 90 },
};
// --- Public API ---
/**
 * Initialize the community panel inside a container element.
 * @param {HTMLElement} container
 */
export function initCommunityPanel( container: any) {
    _container = container;
    _render();
}
/**
 * Refresh the panel content.
 */
export function refreshCommunityPanel() {
    if (_container) _render();
}
// --- Render ---
async function _render() {
    if (!_container) return;
    // PERF-MASTER S3.3 - abort listeners do render anterior (DOM
    // anterior está prestes a ser substituído por innerHTML).
    if (_abortController) {
        try {
            _abortController.abort();
        } catch (e: any) {
            console.debug('[communityPanel] abortPrev:', /** @type {any} */ (e)?.message || e);
        }
    }
    _abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    _container.innerHTML = `
        <div class="community-panel">
            <div class="community-tabs">
                <button class="community-tab ${_activeTab === 'top' ? 'active' : ''}" data-tab="top">
                    ${t('communityTabTop') || 'Top Contributors'}
                </button>
                <button class="community-tab ${_activeTab === 'badges' ? 'active' : ''}" data-tab="badges">
                    ${t('communityTabBadges') || 'Badges'}
                </button>
                <button class="community-tab ${_activeTab === 'journey' ? 'active' : ''}" data-tab="journey">
                    ${t('communityTabJourney') || 'My Journey'}
                </button>
            </div>
            <div class="community-content" id="community-tab-content"></div>
        </div>
    `;
    // Bind tab events - listeners atrelados ao controller atual.
    // PERF-MASTER S3.3: signal aborta no próximo _render() ou ao desmontar.
    const signal = _abortController?.signal;
    /** @type {any} */ (_container.querySelectorAll('.community-tab')).forEach((btn: any) => {
        btn.addEventListener(
            'click',
            () => {
                _activeTab = btn.getAttribute('data-tab');
                _render();
            },
            signal ? { signal } : undefined,
        );
    });
    // Render active tab content
    const contentEl = (_container.querySelector('#community-tab-content')) as any;
    if (!contentEl) return;
    switch (_activeTab) {
        case 'top':
            await _renderTopContributors(contentEl);
            break;
        case 'badges':
            await _renderBadges(contentEl);
            break;
        case 'journey':
            await _renderJourney(contentEl);
            break;
    }
    if (typeof window.hydrateIcons === 'function') {
        window.hydrateIcons(_container);
    }
}
// --- Top Contributors Tab ---
/**
 * @param {any} el
 */
async function _renderTopContributors( el: any) {
    el.innerHTML = `<div class="community-loading">${t('loading') || 'Loading...'}</div>`;
    try {
        const [creators, bountyBoard] = await Promise.all([fetchTopCreators(10), getLeaderboard()]);
        if ((!creators || creators.length === 0) && bountyBoard.length === 0) {
            el.innerHTML = `<div class="community-empty">${t('communityNoContributors') || 'No contributors yet. Be the first!'}</div>`;
            return;
        }
        // Marketplace creators
        let html = '';
        if (creators && creators.length > 0) {
            html += `<div class="community-subsection-title">${t('communityMarketplaceLeaders') || 'Marketplace Leaders'}</div>`;
            html += creators
                .map((c: any, i: any) => {
                    const rank = i + 1;
                    const rankClass = rank <= 3 ? `community-rank-${rank}` : '';
                    return `<div class="community-contributor ${rankClass}">
                    <span class="community-rank">#${rank}</span>
                    <span class="community-contributor-name">${escapeHtml(c.display_name || 'Anonymous')}</span>
                    <span class="community-contributor-score">${(c.reputation_score || 0).toFixed(0)}</span>
                </div>`;
                })
                .join('');
        }
        // Bounty leaderboard
        if (bountyBoard.length > 0) {
            html += `<div class="community-subsection-title">${t('communityBountyLeaders') || 'Bounty Leaders'}</div>`;
            html += bountyBoard
                .slice(0, 10)
                .map((b: any, i: any) => {
                    const rank = i + 1;
                    const rankClass = rank <= 3 ? `community-rank-${rank}` : '';
                    return `<div class="community-contributor ${rankClass}">
                    <span class="community-rank">#${rank}</span>
                    <span class="community-contributor-name">${escapeHtml(b.userId?.split('@')[0] || 'Anonymous')}</span>
                    <span class="community-contributor-score">${b.totalPoints} pts</span>
                </div>`;
                })
                .join('');
        }
        el.innerHTML = html;
    } catch {
        el.innerHTML = `<div class="community-empty">${t('error') || 'Error loading data'}</div>`;
    }
}
// --- Badges Tab ---
/**
 * @param {any} el
 */
async function _renderBadges( el: any) {
    const user = getCurrentUser();
    if (!user) {
        el.innerHTML = `<div class="community-empty">${t('communityLoginForBadges') || 'Log in to see your badges'}</div>`;
        return;
    }
    el.innerHTML = `<div class="community-loading">${t('loading') || 'Loading...'}</div>`;
    try {
        const badges = await getUserBadges(/** @type {any} */ (user).id);
        if (!badges || badges.length === 0) {
            el.innerHTML = `
                <div class="community-empty">
                    ${t('communityNoBadges') || 'No badges yet. Contribute to earn your first badge!'}
                </div>
                <div class="community-badge-catalog">
                    <div class="community-subsection-title">${t('communityAvailableBadges') || 'Available Badges'}</div>
                    <div class="community-badge-item community-badge-locked">
                        <span data-icon="award" data-icon-size="16px"></span>
                        <span>${t('communityBadgeTopCreator') || 'Top Creator -- Publish 5+ libraries'}</span>
                    </div>
                    <div class="community-badge-item community-badge-locked">
                        <span data-icon="star" data-icon-size="16px"></span>
                        <span>${t('communityBadgeHighRating') || 'High Rating -- Maintain 4.5+ average'}</span>
                    </div>
                    <div class="community-badge-item community-badge-locked">
                        <span data-icon="shield" data-icon-size="16px"></span>
                        <span>${t('communityBadgeBountyHunter') || 'Bounty Hunter -- Resolve 10+ bounties'}</span>
                    </div>
                </div>
            `;
        } else {
            el.innerHTML = `
                <div class="community-subsection-title">${t('communityYourBadges') || 'Your Badges'}</div>
                ${badges
                    .map(
                        (b: any) => `
                    <div class="community-badge-item community-badge-earned">
                        <span data-icon="award" data-icon-size="16px"></span>
                        <span>${escapeHtml(b.badge_type)}</span>
                        <span class="community-badge-date">${new Date(b.earned_at).toLocaleDateString()}</span>
                    </div>
                `,
                    )
                    .join('')}
            `;
        }
    } catch {
        el.innerHTML = `<div class="community-empty">${t('error') || 'Error'}</div>`;
    }
}
// --- My Journey Tab ---
/**
 * @param {any} el
 */
async function _renderJourney( el: any) {
    const user = getCurrentUser();
    if (!user) {
        el.innerHTML = `<div class="community-empty">${t('communityLoginForJourney') || 'Log in to see your journey'}</div>`;
        return;
    }
    el.innerHTML = `<div class="community-loading">${t('loading') || 'Loading...'}</div>`;
    try {
        const [profile, badges] = await Promise.all([
            fetchCreatorProfile(/** @type {any} */ (user).id),
            getUserBadges(/** @type {any} */ (user).id).catch(() => []),
        ]);
        const score = (profile)?.reputation_score || 0;
        const followers = /** @type {any} */ (profile)?.followers_count || 0;
        const credLevel = user.credentialLevel || 'common';
        const tier = _getTierForScore(score) as any;
        el.innerHTML = `
            <div class="community-journey">
                <div class="community-journey-header">
                    <div class="community-journey-tier ${tier.class}">${tier.envLabel}</div>
                    <div class="community-journey-score">${score.toFixed(0)} / 100</div>
                </div>
                <div class="community-journey-stats">
                    <div class="community-journey-stat">
                        <span data-icon="users" data-icon-size="14px"></span>
                        ${followers} ${t('homeFollowers') || 'followers'}
                    </div>
                    <div class="community-journey-stat">
                        <span data-icon="graduation-cap" data-icon-size="14px"></span>
                        ${escapeHtml(credLevel)}
                    </div>
                    <div class="community-journey-stat">
                        <span data-icon="award" data-icon-size="14px"></span>
                        ${badges.length} ${t('communityBadgesCount') || 'badges'}
                    </div>
                </div>
                <div class="community-subsection-title">${t('communityTierPath') || 'Tier Progression'}</div>
                <div class="community-tier-path">
                    ${Object.entries(TIER_LABELS)
                        .map(
                            ([_key, val]) => `
                        <div class="community-tier-step ${score >= val.min ? 'community-tier-reached' : 'community-tier-locked'}">
                            <span class="community-tier-dot"></span>
                            <span class="community-tier-name">${val.envLabel}</span>
                            <span class="community-tier-threshold">${val.min}+</span>
                        </div>
                    `,
                        )
                        .join('')}
                </div>
            </div>
        `;
    } catch {
        el.innerHTML = `<div class="community-empty">${t('error') || 'Error'}</div>`;
    }
}
/**
 * @param {any} score
 */
function _getTierForScore( score: any) {
    const entries = Object.entries(TIER_LABELS) as [string, any][];
    for (let i = entries.length - 1; i >= 0; i--) {
        const ent: any = entries[i];
        if (score >= ent[1].min) {
            return { class: ent[0], ...ent[1] };
        }
    }
    return { class: 'seed', ...TIER_LABELS.seed };
}
