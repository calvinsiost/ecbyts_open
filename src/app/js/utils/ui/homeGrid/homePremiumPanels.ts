// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 — render dos painéis Premium (Connections + Assistant).
 *
 * EN: Renders the two right-sidebar "premium" panels (graph/connections and
 *     AI/assistant) into their injected target elements. Mirrors the legacy
 *     inline `_renderPremiumPanels` in homeGrid byte-for-byte: same feature-flag
 *     gating, same Spec V2 F5 unified-CTA consolidation when both panels are
 *     premium-locked, same classes/data-testid/innerHTML, and the same
 *     `actions:*` CustomEvents. Capability/usage helpers and module state are
 *     injected via `deps`; click listeners are wired here but read the active
 *     object id lazily through `deps.getActiveObjectId()` so the event `detail`
 *     binds at click time exactly like the legacy module-level `_activeObjectId`.
 *
 * PT (leigo): desenha os dois quadros "premium" da barra lateral direita — o de
 *     "Conexões" (grafo) e o de "Assistente" (IA). Faz exatamente o que o código
 *     antigo embutido no homeGrid fazia: respeita as mesmas chaves de
 *     liga/desliga (feature flags), junta os dois num único botão de "Desbloquear
 *     Premium" quando ambos estão travados (regra V2 F5), e mantém as mesmas
 *     classes/identificadores/HTML e os mesmos eventos de clique. As funções de
 *     permissão/uso e os elementos de tela chegam de fora (injetados); o id do
 *     objeto ativo é lido na hora do clique (não na hora de desenhar) para o
 *     comportamento ficar idêntico ao original.
 *
 * DOM-coupled (escreve innerHTML + liga listeners) — mantém classes/IDs/
 * atributos/innerHTML/eventos idênticos ao legado.
 */

import { t } from '../../i18n/translations.js';
import { escapeHtml } from '../../helpers/html.js';
import { CONFIG } from '../../../config.js';

/** Catálogo de chaves de feature flag (mesmo `FEATURE_KEYS` do homeGrid). */
export interface PremiumFeatureKeys {
    readonly GRAPH: string;
    readonly AI_PANEL: string;
}

/** Dependências injetadas — estado/elementos/helpers vindos do homeGrid. */
export interface PremiumPanelsDeps {
    /** Mapa de feature flags atual (homeGrid `_featureFlags`). */
    readonly featureFlags: Record<string, boolean>;
    /** Chaves canônicas de flag (homeGrid `FEATURE_KEYS`). */
    readonly featureKeys: PremiumFeatureKeys;
    /** Checagem de capability premium por id (homeGrid `_canUseCapability`). */
    readonly canUseCapability: (capability: any) => boolean;
    /** Elemento-alvo do painel de grafo/conexões (homeGrid `_graphPanelEl`). */
    readonly graphPanelEl: any;
    /** Elemento-alvo do painel de IA/assistente (homeGrid `_aiPanelEl`). */
    readonly aiPanelEl: any;
    /** Id do objeto ativo, lido lazy no clique (homeGrid `_activeObjectId`). */
    readonly getActiveObjectId: () => any;
    /** Registro de uso/metering premium (homeGrid `_trackActionsPremiumUsage`). */
    readonly trackPremiumUsage: (metric: any, context: any) => void;
}

/**
 * Renderiza os painéis premium. Comportamento idêntico ao `_renderPremiumPanels`
 * legado do homeGrid (gating, unificação V2 F5, innerHTML, listeners, eventos).
 *
 * @param deps Dependências injetadas.
 */
export function renderPremiumPanels(deps: PremiumPanelsDeps): void {
    const {
        featureFlags: _featureFlags,
        featureKeys: FEATURE_KEYS,
        canUseCapability: _canUseCapability,
        graphPanelEl: _graphPanelEl,
        aiPanelEl: _aiPanelEl,
        getActiveObjectId,
        trackPremiumUsage: _trackActionsPremiumUsage,
    } = deps;

    const _activeObjectId = getActiveObjectId();

    const graphEnabled = _featureFlags[FEATURE_KEYS.GRAPH] !== false;
    const aiEnabled = _featureFlags[FEATURE_KEYS.AI_PANEL] !== false;
    const canGraph = graphEnabled && _canUseCapability('cap_graph_relations');
    const canAi = aiEnabled && _canUseCapability('cap_ai_context_panel');
    const activeObjectLabel = _activeObjectId || 'launchpad';

    // Spec V2 F5: se AMBOS os painéis estão premium-gated (user free),
    // consolidar em 1 CTA único - evita 2 cards "Disponível no Premium"
    // empilhados ocupando 40% do sidebar direito.
    const bothLocked = !canGraph && !canAi && graphEnabled && aiEnabled;
    if (bothLocked && CONFIG.FEATURES.HOME_REDESIGN_V2) {
        if (_graphPanelEl) {
            _graphPanelEl.innerHTML = `
                <h4>${t('premium.unlockTitle') || 'Unlock Premium'}</h4>
                <div class="actions-shell-premium-copy" data-testid="actions-premium-unified">
                    ${t('premium.unifiedCopy') || 'Unlock Connections and Assistant together with a Premium subscription.'}
                </div>
                <button type="button" class="actions-shell-premium-btn" data-testid="actions-premium-cta">
                    ${t('premium.unlockCta') || 'Unlock Premium'}
                </button>
            `;
            const cta = _graphPanelEl.querySelector('[data-testid="actions-premium-cta"]');
            cta?.addEventListener('click', () => {
                _trackActionsPremiumUsage('upgrade_click', { feature: 'unified_cta' });
                window.dispatchEvent(new CustomEvent('actions:open-upgrade'));
            });
        }
        if (_aiPanelEl) {
            _aiPanelEl.innerHTML = '';
            _aiPanelEl.style.display = 'none';
        }
        return;
    }
    // Caminho legado: se só um está locked ou ambos unlocked, mostra
    // cada painel individualmente (comportamento V1).
    if (_aiPanelEl) {
        _aiPanelEl.style.display = '';
    }

    if (_graphPanelEl) {
        if (canGraph) {
            _graphPanelEl.innerHTML = `
                <h4>${CONFIG.FEATURES.HOME_REDESIGN_V2 ? t('panel.connections') || 'Connections' : 'Grafo Relacional (Z3)'}</h4>
                <div class="actions-shell-premium-copy" data-testid="actions-graph-ready">
                    Ego graph pronto para <strong>${escapeHtml(activeObjectLabel)}</strong>.
                </div>
                <button type="button" class="actions-shell-premium-btn" data-testid="actions-open-graph">Abrir grafo</button>
            `;
        } else if (!graphEnabled) {
            _graphPanelEl.innerHTML = `
                <h4>${CONFIG.FEATURES.HOME_REDESIGN_V2 ? t('panel.connections') || 'Connections' : 'Grafo Relacional (Z3)'}</h4>
                <div class="actions-shell-premium-lock" data-testid="actions-graph-locked">
                    Modulo temporariamente desativado por feature flag.
                </div>
            `;
        } else {
            _graphPanelEl.innerHTML = `
                <h4>${CONFIG.FEATURES.HOME_REDESIGN_V2 ? t('panel.connections') || 'Connections' : 'Grafo Relacional (Z3)'}</h4>
                <div class="actions-shell-premium-lock" data-testid="actions-graph-locked">
                    Disponivel no Premium. Upgrade para explorar relacoes entre objetos.
                </div>
            `;
        }

        const graphBtn = _graphPanelEl.querySelector('[data-testid="actions-open-graph"]');
        graphBtn?.addEventListener('click', () => {
            _trackActionsPremiumUsage('mcp_calls', { feature: 'z3_graph' });
            window.dispatchEvent(new CustomEvent('actions:open-graph', { detail: { objectId: getActiveObjectId() } }));
        });
    }

    if (_aiPanelEl) {
        if (canAi) {
            _aiPanelEl.innerHTML = `
                <h4>${CONFIG.FEATURES.HOME_REDESIGN_V2 ? t('panel.assistant') || 'Assistant' : 'AI Contextual (Z4c)'}</h4>
                <div class="actions-shell-premium-copy" data-testid="actions-ai-ready">
                    Sugestoes prontas para o contexto atual do objeto.
                </div>
                <button type="button" class="actions-shell-premium-btn" data-testid="actions-open-ai">Abrir AI</button>
            `;
        } else if (!aiEnabled) {
            _aiPanelEl.innerHTML = `
                <h4>${CONFIG.FEATURES.HOME_REDESIGN_V2 ? t('panel.assistant') || 'Assistant' : 'AI Contextual (Z4c)'}</h4>
                <div class="actions-shell-premium-lock" data-testid="actions-ai-locked">
                    Modulo temporariamente desativado por feature flag.
                </div>
            `;
        } else {
            _aiPanelEl.innerHTML = `
                <h4>${CONFIG.FEATURES.HOME_REDESIGN_V2 ? t('panel.assistant') || 'Assistant' : 'AI Contextual (Z4c)'}</h4>
                <div class="actions-shell-premium-lock" data-testid="actions-ai-locked">
                    Assistente contextual disponivel no Premium.
                </div>
            `;
        }

        const aiBtn = _aiPanelEl.querySelector('[data-testid="actions-open-ai"]');
        aiBtn?.addEventListener('click', () => {
            _trackActionsPremiumUsage('llm_tokens', { feature: 'z4_ai_panel' });
            window.dispatchEvent(new CustomEvent('actions:open-ai-panel', { detail: { objectId: getActiveObjectId() } }));
        });
    }
}
