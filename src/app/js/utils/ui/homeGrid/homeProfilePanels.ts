// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 — render das seções de perfil do usuário na home:
 * "Meu Ambiente" (identidade pessoal) e "Marketplace Activity" (atividade do
 * marketplace / feed da comunidade). claude - ui 2026-06-15.
 *
 * EN: Renders the two user-profile home panels into their target elements.
 *     `renderPersonalIdentity` draws the avatar/initials + name/email/org card
 *     and an "open my environment" CTA; `renderMarketplaceActivity` draws either
 *     personal publishing stats (when the user owns published libraries) or a
 *     community activity feed. Both await injected async data loaders
 *     (`ensureReputationData` / `ensureMarketplaceData`) that own homeGrid's
 *     caches, and both re-read the live target element via `getContainer()`
 *     after the await to keep the legacy re-entrancy guard byte-for-byte. Click
 *     listeners are wired here but delegate to homeGrid via `deps.onAction`. The
 *     marketplace activity-formatting helpers travel with this module since they
 *     are only used here. Behavior identical to the legacy inline
 *     `_renderPersonalIdentity` / `_renderMarketplaceActivity` pair.
 *
 * PT (leigo): desenha as duas caixinhas de perfil na tela inicial. "Meu Ambiente"
 *     mostra as iniciais/avatar, nome, e-mail e organização do usuário, com um
 *     botão que abre o ambiente pessoal. "Marketplace Activity" mostra os números
 *     do usuário (curtidas, instalações, vendas) se ele tem bibliotecas
 *     publicadas, ou então o feed de atividade da comunidade. As duas esperam os
 *     dados chegarem (carregados por funções injetadas que guardam o cache do
 *     homeGrid) e, depois que chegam, conferem de novo se a caixinha ainda existe
 *     antes de desenhar (igualzinho ao código antigo). O clique é ligado aqui mas
 *     chama de volta o homeGrid. Comportamento idêntico ao código antigo que
 *     ficava embutido no homeGrid.
 *
 * DOM-coupled (escreve innerHTML + listeners) — mantém classes/IDs/atributos/
 * innerHTML/fetch idênticos ao legado.
 */

import { escapeHtml } from '../../helpers/html.js';

/** Dependências injetadas — i18n, usuário atual, loaders de dados e clique. */
export interface ProfilePanelsDeps {
    /** Tradutor i18n (chave → texto); cai no fallback literal se ausente. */
    readonly t: (key: string) => string;
    /** Usuário atual (homeGrid `getCurrentUser`) — re-avaliado após o await. */
    readonly getCurrentUser: () => any;
    /**
     * Re-lê o elemento-alvo VIVO no momento da chamada (após o await), espelhando
     * o guard de re-entrância do legado (`!_personalIdentityEl`/`!_marketplaceEl`).
     */
    readonly getContainer: () => HTMLElement | null;
    /**
     * Callback de execução de ação por nome de handler (mantém o fluxo CSP-safe
     * de `_executeHandler` no homeGrid).
     */
    readonly onAction: (handlerName: string) => void;
}

/** Deps da identidade pessoal — inclui o loader de reputação do homeGrid. */
export interface PersonalIdentityDeps extends ProfilePanelsDeps {
    /** Loader async cacheado do homeGrid: `{ profile, badges }`. */
    readonly ensureReputationData: (userId: any) => Promise<any>;
}

/** Deps da atividade de marketplace — inclui o loader de marketplace. */
export interface MarketplaceActivityDeps extends ProfilePanelsDeps {
    /** Loader async cacheado do homeGrid: `{ activity, myLibs }`. */
    readonly ensureMarketplaceData: (userId: any) => Promise<any>;
}

/**
 * Renderiza a seção "Meu Ambiente" (identidade pessoal) dentro de `containerEl`.
 * Comportamento idêntico ao `_renderPersonalIdentity` legado.
 *
 * @param containerEl Elemento-alvo da seção (homeGrid `_personalIdentityEl`).
 * @param deps Dependências injetadas.
 */
export async function renderPersonalIdentity(
    containerEl: HTMLElement | null,
    deps: PersonalIdentityDeps,
): Promise<void> {
    if (!containerEl) return;

    const { t, getCurrentUser, getContainer, ensureReputationData, onAction } = deps;

    const user = (getCurrentUser()) as any;
    if (!user) {
        containerEl.innerHTML = '';
        containerEl.style.display = 'none';
        return;
    }

    containerEl.style.display = 'block';

    const requestUserId = user.id;
    const { profile } = await ensureReputationData(requestUserId);
    const liveEl = getContainer();
    if (getCurrentUser()?.id !== requestUserId || !liveEl) return;

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
    const initials = escapeHtml(
        String(displayName)
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part: any) => part[0]?.toUpperCase() || '')
            .join('') || 'U',
    );

    liveEl.innerHTML = `
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

    liveEl.querySelector('[data-testid="home-personal-identity-open"]')?.addEventListener('click', () => {
        onAction('handleOpenPersonalEnvironment');
    });

    if (typeof window.hydrateIcons === 'function') {
        window.hydrateIcons(liveEl);
    }
}

/**
 * Renderiza a seção "Marketplace Activity" (ou feed da comunidade) dentro de
 * `containerEl`. Comportamento idêntico ao `_renderMarketplaceActivity` legado.
 *
 * @param containerEl Elemento-alvo da seção (homeGrid `_marketplaceEl`).
 * @param deps Dependências injetadas.
 */
export async function renderMarketplaceActivity(
    containerEl: HTMLElement | null,
    deps: MarketplaceActivityDeps,
): Promise<void> {
    if (!containerEl) return;

    const { t, getCurrentUser, getContainer, ensureMarketplaceData } = deps;

    const user = (getCurrentUser()) as any;
    if (!user) {
        containerEl.innerHTML = '';
        containerEl.style.display = 'none';
        return;
    }

    containerEl.style.display = 'block';

    const requestUserId = user.id;
    const { activity, myLibs } = await ensureMarketplaceData(requestUserId);
    const liveEl = getContainer();
    if (getCurrentUser()?.id !== requestUserId || !liveEl) return;

    // If user has published libraries, show personal stats
    if (myLibs.length > 0) {
        const myLibIds = new Set(myLibs.map(/** @param {any} type */ (l: any) => l.id));
        const libActivity = activity.filter(/** @param {any} a */ (a: any) => myLibIds.has(a.library_id)).slice(0, 5);
        const totalLikes = myLibs.reduce(
            (sum: any, l: any) => sum + (l.likes_count || 0),
            0,
        );
        const totalInstalls = myLibs.reduce(
            (sum: any, l: any) => sum + (l.install_count || 0),
            0,
        );
        const salesCount = myLibs.filter(/** @param {any} type */ (l: any) => l.is_paid).length;

        liveEl.innerHTML = `
            <div class="home-section-header">
                <span class="home-section-title">${t('homeMarketplaceTitle') || 'Marketplace Activity'}</span>
                <span class="home-marketplace-badge">${myLibs.length} ${t('homePublished') || 'published'}</span>
            </div>
            <div class="home-marketplace-content">
                <div class="home-marketplace-stats">
                    <div class="home-marketplace-stat">
                        <span data-icon="heart" data-icon-size="16px"></span>
                        <span class="home-marketplace-stat-value">${totalLikes}</span>
                        <span class="home-marketplace-stat-label">${t('homeTotalLikes') || 'likes'}</span>
                    </div>
                    <div class="home-marketplace-stat">
                        <span data-icon="download" data-icon-size="16px"></span>
                        <span class="home-marketplace-stat-value">${totalInstalls}</span>
                        <span class="home-marketplace-stat-label">${t('homeTotalInstalls') || 'installs'}</span>
                    </div>
                    <div class="home-marketplace-stat">
                        <span data-icon="dollar-sign" data-icon-size="16px"></span>
                        <span class="home-marketplace-stat-value">${salesCount}</span>
                        <span class="home-marketplace-stat-label">${t('homeSales') || 'sales'}</span>
                    </div>
                </div>
                ${
                    libActivity.length > 0
                        ? `
                    <div class="home-marketplace-activity">
                        <div class="home-marketplace-activity-header">${t('homeRecentActivity') || 'Recent Activity'}</div>
                        ${libActivity
                            .map(
                                /** @param {any} a */ (a: any) => `
                            <div class="home-marketplace-activity-item">
                                <span data-icon="${_getActivityIcon(a.activity_type)}" data-icon-size="14px"></span>
                                <span class="home-marketplace-activity-text">${_formatActivity(a)}</span>
                                <span class="home-marketplace-activity-time">${_formatTimeAgo(a.created_at)}</span>
                            </div>
                        `,
                            )
                            .join('')}
                    </div>
                `
                        : ''
                }
            </div>
        `;
    } else {
        // Community feed for users without published libraries
        const communityFeed = activity.slice(0, 5);
        if (communityFeed.length === 0) {
            liveEl.innerHTML = '';
            liveEl.style.display = 'none';
            return;
        }

        liveEl.innerHTML = `
            <div class="home-section-header">
                <span class="home-section-title">${t('homeCommunityFeedTitle') || 'Community Activity'}</span>
            </div>
            <div class="home-marketplace-content">
                <div class="home-marketplace-activity">
                    ${communityFeed
                        .map(
                            /** @param {any} a */ (a: any) => `
                        <div class="home-marketplace-activity-item">
                            <span data-icon="${_getActivityIcon(a.activity_type)}" data-icon-size="14px"></span>
                            <span class="home-marketplace-activity-text">${_formatActivity(a)}</span>
                            <span class="home-marketplace-activity-time">${_formatTimeAgo(a.created_at)}</span>
                        </div>
                    `,
                        )
                        .join('')}
                </div>
            </div>
        `;
    }

    if (typeof window.hydrateIcons === 'function') {
        window.hydrateIcons(liveEl);
    }
}

/** @param {any} type */
function _getActivityIcon( type: any) {
    switch (type) {
        case 'like':
            return 'heart';
        case 'comment':
            return 'message-circle';
        case 'install':
            return 'download';
        case 'purchase':
            return 'shopping-cart';
        case 'publish':
            return 'upload';
        default:
            return 'activity';
    }
}

/** @param {any} activity */
function _formatActivity( activity: any) {
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

/** @param {any} timestamp */
function _formatTimeAgo( timestamp: any) {
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}
