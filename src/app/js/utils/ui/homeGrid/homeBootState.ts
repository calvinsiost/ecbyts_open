// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 S5-runtime — render do "estado de boot" da tela inicial.
 * claude - ui 2026-06-15.
 *
 * EN: Renders the home boot-state strip. When a random model is being prepared
 *     it shows an inline spinner + "Preparing random model..." message; otherwise
 *     it hides the strip and clears its content. Behaviour is identical to the
 *     legacy inline `_renderBootState` (same display/innerHTML, same i18n key).
 *     Deps (`t`) are injected with a default fallback to the shared translator.
 *
 * PT (leigo): mostra (ou esconde) a faixinha de "estado de carregamento" da tela
 *     inicial. Se um modelo aleatório está sendo preparado, aparece uma rodinha
 *     (spinner) com o texto "Preparando modelo aleatório..."; caso contrário, a
 *     faixa some e fica vazia. Comportamento idêntico ao trecho antigo embutido.
 *
 * DOM-coupled (lê/escreve no elemento) — sem efeitos além do elemento recebido.
 */
import { t as _t } from '../../i18n/translations.js';

/** Dependências injetadas (i18n) — sem globais ocultos. */
export interface HomeBootStateDeps {
    /** Tradutor i18n (chave → texto); cai na própria chave/fallback se ausente. */
    readonly t: (key: string) => string;
}

/**
 * Renderiza o estado de boot no elemento fornecido. Comportamento idêntico ao
 * bloco inline legado `_renderBootState` (mesmas classes/innerHTML/style).
 *
 * @param bootStateEl Elemento alvo (`_bootStateEl`); no-op se ausente.
 * @param isPreparingRandom Flag `_bootPreparingRandom` (modelo aleatório em preparo).
 * @param deps Tradutor i18n (default: o tradutor compartilhado).
 */
export function renderHomeBootState(
    bootStateEl: HTMLElement | null | undefined,
    isPreparingRandom: boolean,
    deps: HomeBootStateDeps = { t: _t },
): void {
    const t = deps.t;
    if (!bootStateEl) return;
    if (isPreparingRandom) {
        bootStateEl.style.display = 'flex';
        bootStateEl.innerHTML = `
            <span class="home-inline-spinner" aria-hidden="true"></span>
            <span>${t('homePreparingRandom') || 'Preparing random model...'}</span>
        `;
        return;
    }
    bootStateEl.style.display = 'none';
    bootStateEl.innerHTML = '';
}
