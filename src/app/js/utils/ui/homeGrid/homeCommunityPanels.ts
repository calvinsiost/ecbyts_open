// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 — render das seções "Community Impact" e "Reputation"
 * da tela inicial. claude - ui 2026-06-15.
 *
 * EN: Two home-screen renderers extracted verbatim from the homeGrid monolith.
 *     `renderCommunityImpact` draws the community counters card (users / models),
 *     hiding itself when the LAUNCHPAD_V3_PANELS flag is on, when there is no
 *     impact data, or when the community is still empty. It honours the same
 *     short-lived cache (DATA_CACHE_TTL) read/written back through the injected
 *     getter/setter so the caching behaviour is byte-identical to the legacy
 *     inline function. `renderReputation` draws the user's reputation card
 *     (score, level, progress bar toward the next tier, follower/credential
 *     stats and badge chips); reputation data fetch + the tier/level/credential
 *     helpers stay in homeGrid and are injected via `deps` (they are shared with
 *     `_renderPersonalIdentity`). `fetchCommunityImpact`, `t` and `CONFIG` are
 *     stable imports. Behaviour identical to the legacy `_renderCommunityImpact`
 *     / `_renderReputation` pair — same classes/IDs/innerHTML/fetch/listeners.
 *
 * PT (leigo): duas caixinhas da tela inicial, recortadas sem mudança de
 *     comportamento do arquivo gigante homeGrid. `renderCommunityImpact` desenha
 *     o card de impacto da comunidade (quantos profissionais e quantos modelos);
 *     ela se esconde sozinha quando o painel novo (V3) está ligado, quando não há
 *     dados, ou quando a comunidade ainda está vazia. Usa o mesmo cache curto de
 *     1 minuto, lido e gravado de volta no homeGrid pelos callbacks injetados, pra
 *     o comportamento ficar idêntico ao código antigo. `renderReputation` desenha
 *     o card de reputação do usuário (nota, nível, barra de progresso pro próximo
 *     nível, seguidores, credencial e selos); a busca dos dados de reputação e as
 *     funções de nível/credencial continuam no homeGrid e são passadas via `deps`
 *     (são compartilhadas com a seção de identidade). Comportamento idêntico ao
 *     código antigo embutido no homeGrid.
 *
 * DOM-coupled (escreve innerHTML + liga ícones) — mantém classes/IDs/atributos/
 * innerHTML idênticos ao legado.
 */

import { t } from '../../i18n/translations.js';
import { CONFIG } from '../../../config.js';
import { fetchCommunityImpact } from '../../libraries/supabaseMarketplace.js';

/** Dependências injetadas da seção "Community Impact". */
export interface CommunityImpactDeps {
    /** Lê o cache de impacto da comunidade (homeGrid `_communityImpactCache`). */
    readonly getCache: () => any;
    /** Lê o timestamp do cache (homeGrid `_communityImpactFetchedAt`). */
    readonly getFetchedAt: () => number;
    /** Grava o cache de impacto de volta no homeGrid. */
    readonly setCache: (value: any) => void;
    /** Grava o timestamp do cache de volta no homeGrid. */
    readonly setFetchedAt: (value: number) => void;
    /** TTL do cache em ms (homeGrid `DATA_CACHE_TTL`). */
    readonly cacheTtl: number;
}

/** Dependências injetadas da seção "Reputation". */
export interface ReputationDeps {
    /** Usuário atual (homeGrid `getCurrentUser`). */
    readonly getCurrentUser: () => any;
    /** Busca perfil + selos de reputação (homeGrid `_ensureReputationData`). */
    readonly ensureReputationData: (userId: any) => Promise<{ profile: any; badges: any[] }>;
    /** Resolve o tier de reputação a partir do score (homeGrid `_getReputationLevel`). */
    readonly getReputationLevel: (score: any) => { class: string; label: string; min: number };
    /** Resolve o próximo tier a partir do score (homeGrid `_getNextLevel`). */
    readonly getNextLevel: (score: any) => { threshold: number; label: string } | null;
    /** Rótulo da credencial (homeGrid `_getCredentialLabel`). */
    readonly getCredentialLabel: (level: any) => string;
}

/**
 * Renderiza a seção "Community Impact" dentro de `impactEl`. Comportamento
 * idêntico ao `_renderCommunityImpact` legado.
 *
 * @param impactEl Elemento-alvo da seção (homeGrid `_impactEl`).
 * @param deps Dependências injetadas (cache + TTL).
 */
export async function renderCommunityImpact(impactEl: any, deps: CommunityImpactDeps): Promise<void> {
    if (!impactEl) return;
    // V3: panels include a dedicated Community card - legacy impact
    // section is replaced to avoid duplicate messaging.
    if (CONFIG.FEATURES?.LAUNCHPAD_V3_PANELS) {
        impactEl.style.display = 'none';
        impactEl.innerHTML = '';
        return;
    }

    const now = Date.now();
    let impact;
    if (deps.getCache() && now - deps.getFetchedAt() < deps.cacheTtl) {
        impact = deps.getCache();
    } else {
        impact = await fetchCommunityImpact();
        deps.setCache(impact);
        deps.setFetchedAt(now);
    }
    if (!impact) {
        impactEl.innerHTML = '';
        impactEl.style.display = 'none';
        return;
    }

    // Spec V2 F6: esconder seção quando comunidade ainda não tem conteúdo
    // real (evita ruído visual "Comunidade em formação" ocupando espaço
    // de feature com dados).
    if ((impact.users || 0) === 0 && (impact.models || 0) === 0) {
        impactEl.innerHTML = '';
        impactEl.style.display = 'none';
        return;
    }

    impactEl.style.display = 'block';

    // Threshold: small community gets different messaging
    const isEarly = impact.users < 10;
    const narrative = isEarly
        ? t('communityImpactEarly') || 'Community forming -- be one of the first to contribute'
        : (
              t('communityImpactNarrative') ||
              'Together, {users} professionals are building transparent environmental monitoring'
          ).replace('{users}', impact.users);

    impactEl.innerHTML = `
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

/**
 * Renderiza a seção "Reputation" dentro de `reputationEl`. Comportamento
 * idêntico ao `_renderReputation` legado.
 *
 * @param reputationEl Elemento-alvo da seção (homeGrid `_reputationEl`).
 * @param deps Dependências injetadas (usuário + dados + helpers de tier).
 */
export async function renderReputation(reputationEl: any, deps: ReputationDeps): Promise<void> {
    if (!reputationEl) return;

    const user = (deps.getCurrentUser()) as any;
    if (!user) {
        reputationEl.innerHTML = '';
        reputationEl.style.display = 'none';
        return;
    }

    reputationEl.style.display = 'block';

    const requestUserId = user.id;
    const { profile, badges } = await deps.ensureReputationData(requestUserId);
    if (deps.getCurrentUser()?.id !== requestUserId || !reputationEl) return;
    if (!profile) {
        reputationEl.innerHTML = '';
        return;
    }

    const reputationScore = profile.reputation_score || 0;
    const level = deps.getReputationLevel(reputationScore);
    const nextLevel = deps.getNextLevel(reputationScore);
    const followers = profile.followers_count || 0;
    const credLevel = user.credentialLevel || 'common';
    const credLabel = deps.getCredentialLabel(credLevel);

    // Progress bar toward next tier
    const progressPct = nextLevel
        ? Math.min(100, Math.round(((reputationScore - level.min) / (nextLevel.threshold - level.min)) * 100))
        : 100;
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

    // Badges chips
    const badgesHTML =
        badges.length > 0
            ? `<div class="home-reputation-badges">${badges
                  .map(
                      /** @param {any} b */ (b: any) =>
                          `<span class="home-reputation-badge-chip" title="${b.badge_type}">${b.badge_type}</span>`,
                  )
                  .join('')}</div>`
            : '';

    reputationEl.innerHTML = `
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
        window.hydrateIcons(reputationEl);
    }
}
