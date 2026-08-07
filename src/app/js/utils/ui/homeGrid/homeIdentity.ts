// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * homeIdentity.js - Personal Identity, Reputation, Badges, Impact cards
 * Extracted from homeGrid.js per SPLIT-HOMEGRID-001 S2.
 * Pure UI subdomain: renders reputation and personal identity cards
 * into provided container elements.
 */

import { escapeHtml } from '../../helpers/html.js';
import { t } from '../../i18n/translations.js';
import { getCurrentUser } from '../../auth/session.js';
import { fetchCreatorProfile, getUserBadges } from '../../libraries/supabaseMarketplace.js';
import { formatInitials, computeProgressPercent } from './homeIdentityHelpers.js';

const DATA_CACHE_TTL = 60000; // 1 minute

// --- State ---
/** @type {HTMLElement|null} */
let _reputationEl: any = null;
/** @type {HTMLElement|null} */
let _personalIdentityEl: any = null;
/** @type {{profile: any, badges: any[]}|null} */
let _reputationCache: any = null;
/** @type {string|null} */
let _reputationCacheUserId: any = null;
/** @type {{userId: string, promise: Promise<any>}|null} */
let _reputationInFlight: any = null;
let _reputationFetchedAt = 0;

// --- Public API ---

/**
 * @param {HTMLElement|null} identityContainer
 * @param {HTMLElement|null} reputationContainer
 */
export function initIdentity(identityContainer: any, reputationContainer: any) {
    _personalIdentityEl = identityContainer;
    _reputationEl = reputationContainer;
}

export function renderIdentity() {
    _renderReputation();
    _renderPersonalIdentity();
}

export function destroyIdentity() {
    _reputationEl = null;
    _personalIdentityEl = null;
    _reputationCache = null;
    _reputationCacheUserId = null;
    _reputationInFlight = null;
    _reputationFetchedAt = 0;
}

// --- Internal ---

/** @param {string} userId */
function _resetReputationCacheForUser(userId: any) {
    if (_reputationCacheUserId === userId) return;
    _reputationCacheUserId = userId;
    _reputationCache = null;
    _reputationFetchedAt = 0;
    _reputationInFlight = null;
}

/** @param {string} userId */
async function _ensureReputationData(userId: any) {
    if (!userId) return { profile: null, badges: [] };

    _resetReputationCacheForUser(userId);

    const now = Date.now();
    if (_reputationCache && now - _reputationFetchedAt < DATA_CACHE_TTL) {
        return _reputationCache;
    }
    if (_reputationInFlight?.userId === userId) {
        return _reputationInFlight.promise;
    }

    const promise = Promise.all([fetchCreatorProfile(userId), getUserBadges(userId).catch(() => [])])
        .then(([profile, badges]) => {
            const result = {
                profile: profile || null,
                badges: Array.isArray(badges) ? badges : [],
            };
            if (_reputationCacheUserId === userId) {
                _reputationCache = result;
                _reputationFetchedAt = Date.now();
            }
            return result;
        })
        .finally(() => {
            if (_reputationInFlight?.userId === userId) {
                _reputationInFlight = null;
            }
        });

    _reputationInFlight = { userId, promise };
    return promise;
}

async function _renderReputation() {
    if (!_reputationEl) return;

    /** @type {any} */
    const user = getCurrentUser();
    if (!user) {
        _reputationEl.innerHTML = '';
        _reputationEl.style.display = 'none';
        return;
    }

    _reputationEl.style.display = 'block';

    const requestUserId = user.id;
    const { profile, badges } = await _ensureReputationData(requestUserId);
    if (getCurrentUser()?.id !== requestUserId || !_reputationEl) return;
    if (!profile) {
        _reputationEl.innerHTML = '';
        return;
    }

    const reputationScore = profile.reputation_score || 0;
    const level = _getReputationLevel(reputationScore);
    const nextLevel = _getNextLevel(reputationScore);
    const followers = profile.followers_count || 0;
    const credLevel = user.credentialLevel || 'common';
    const credLabel = _getCredentialLabel(credLevel);

    const progressPct = nextLevel ? computeProgressPercent(reputationScore, level.min, nextLevel.threshold) : 100;
    const progressHTML = nextLevel
        ? `<div class="home-reputation-progress">
               <div class="home-reputation-progress-label">
                   ${reputationScore.toFixed(0)} / ${nextLevel.threshold} ${t('repToNext') || 'to'} ${nextLevel.label}
               </div>
               <div class="home-reputation-progress-bar">
                   <div class="home-reputation-progress-fill ${level.class}" style="width: ${progressPct}%"></div>
               </div>
           </div>`
        : `<div class="home-reputation-progress">
               <div class="home-reputation-progress-label">${t('repMaxTier') || 'Highest tier reached'}</div>
           </div>`;

    const badgesHTML =
        badges.length > 0
            ? `<div class="home-reputation-badges">${badges
                  .map(
                      (b: any) =>
                          `<span class="home-reputation-badge-chip" title="${b.badge_type}">${b.badge_type}</span>`,
                  )
                  .join('')}</div>`
            : '';

    _reputationEl.innerHTML = `
        <div class="home-section-header">
            <span class="home-section-title">${t('homeReputationTitle') || 'Your Reputation'}</span>
            <span class="home-reputation-level ${level.class}">${level.label}</span>
        </div>
        <div class="home-reputation-content">
            <div class="home-reputation-main">
                <div class="home-reputation-score">${reputationScore.toFixed(0)}</div>
                <div class="home-reputation-scale">/ 100</div>
            </div>
            <div class="home-reputation-stats">
                <div class="home-reputation-stat">
                    <span data-icon="users" data-icon-size="14px"></span>
                    <span>${followers} ${t('homeFollowers') || 'followers'}</span>
                </div>
                <div class="home-reputation-stat">
                    <span data-icon="graduation-cap" data-icon-size="14px"></span>
                    <span>${credLabel}</span>
                </div>
            </div>
            ${progressHTML}
            ${badgesHTML}
        </div>
    `;

    if (typeof window.hydrateIcons === 'function') {
        window.hydrateIcons(_reputationEl);
    }
}

/** Reputation tier thresholds with environmental terminology */
const REPUTATION_TIERS = [
    { min: 0, threshold: 40, class: 'seed', i18nKey: 'repSeed', fallback: 'Seed' },
    { min: 40, threshold: 60, class: 'rising', i18nKey: 'repRising', fallback: 'Rising' },
    { min: 60, threshold: 75, class: 'active', i18nKey: 'repActive', fallback: 'Active' },
    { min: 75, threshold: 90, class: 'trusted', i18nKey: 'repTrusted', fallback: 'Trusted' },
    { min: 90, threshold: 101, class: 'vanguard', i18nKey: 'repVanguard', fallback: 'Vanguard' },
];

/** @param {number} score */
function _getReputationLevel(score: any) {
    for (let i = REPUTATION_TIERS.length - 1; i >= 0; i--) {
        if (score >= REPUTATION_TIERS[i]!.min) {
            const tier: any = REPUTATION_TIERS[i];
            return { class: tier.class, label: t(tier.i18nKey) || tier.fallback, min: tier.min };
        }
    }
    return { class: 'seed', label: t('repSeed') || 'Seed', min: 0 };
}

/** @param {number} score */
function _getNextLevel(score: any) {
    for (const tier of REPUTATION_TIERS) {
        if (score < tier.threshold && tier.threshold <= 100) {
            return { threshold: tier.threshold, label: t(tier.i18nKey) || tier.fallback };
        }
    }
    return null;
}

/** @param {string} level */
function _getCredentialLabel(level: any) {
    /** @type {Record<string, string>} */
    const labels = {
        common: t('credCommon') || 'Member',
        professional: t('credProfessional') || 'Professional',
        pos_graduado: t('credPostGrad') || 'Postgraduate',
        mestre: t('credMaster') || 'Master',
        doutor: t('credDoctor') || 'PhD',
    };
    return (labels as Record<string, any>)[level] || labels.common;
}

async function _renderPersonalIdentity() {
    if (!_personalIdentityEl) return;

    /** @type {any} */
    const user = getCurrentUser();
    if (!user) {
        _personalIdentityEl.innerHTML = '';
        _personalIdentityEl.style.display = 'none';
        return;
    }

    _personalIdentityEl.style.display = 'block';

    const requestUserId = user.id;
    const { profile } = await _ensureReputationData(requestUserId);
    if (getCurrentUser()?.id !== requestUserId || !_personalIdentityEl) return;

    const displayName = escapeHtml(
        profile?.display_name ||
            user.displayName ||
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email?.split('@')[0] ||
            'User',
    );
    const email = escapeHtml(user.email || '');
    const organization = escapeHtml(
        profile?.organization_name || user.user_metadata?.company || user.app_metadata?.company || '',
    );
    const initials = formatInitials(displayName);

    _personalIdentityEl.innerHTML = `
        <div class="home-section-header">
            <span class="home-section-title">${t('personalEnvironment.title') || 'Meu Ambiente'}</span>
        </div>
        <div class="home-reputation-content">
            <div class="home-reputation-main">
                <div class="home-reputation-score">${initials}</div>
                <div class="home-eis-scale">${t('personalEnvironment.identityLabel') || 'Identidade'}</div>
            </div>
            <div class="home-reputation-stats">
                <div class="home-reputation-stat">
                    <span data-icon="user" data-icon-size="14px"></span>
                    <span>${displayName}</span>
                </div>
                ${
                    email
                        ? `
                <div class="home-reputation-stat">
                    <span data-icon="mail" data-icon-size="14px"></span>
                    <span>${email}</span>
                </div>`
                        : ''
                }
                ${
                    organization
                        ? `
                <div class="home-reputation-stat">
                    <span data-icon="building-2" data-icon-size="14px"></span>
                    <span>${organization}</span>
                </div>`
                        : ''
                }
            </div>
            <div class="home-reputation-progress">
                <button type="button" class="home-empty-state-cta secondary" data-testid="home-personal-identity-open">
                    ${t('personalEnvironment.avatarDropdown.myEnvironment') || 'Meu Ambiente'}
                </button>
            </div>
        </div>
    `;

    _personalIdentityEl.querySelector('[data-testid="home-personal-identity-open"]')?.addEventListener('click', () => {
        if (typeof window.handleOpenPersonalEnvironment === 'function') {
            window.handleOpenPersonalEnvironment();
        }
    });

    if (typeof window.hydrateIcons === 'function') {
        window.hydrateIcons(_personalIdentityEl);
    }
}
