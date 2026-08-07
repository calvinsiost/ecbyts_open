// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   GUEST DEMO — dataset de exemplo em 1 clique (ECBYTS-OPEN-LOCAL-001 RF3)

   O dataset (app/data/demo/guest-demo.ecokey — chave ECBT tipo A, 3 poços +
   1 boundary, 100% sintético) já era servido por HTTP, mas SÓ dava para
   carregá-lo pelo Import manual: colar/arrastar arquivo. Quem clona o repo
   público cai num app vazio e não tem o que ver. Este módulo é o atalho:
   um botão, um fetch, o caminho de import que o app já usa.

   REUSO — nada de codec novo aqui. `importFromString()` (core/io/import.ts) é
   exatamente o que o modal de Import chama (utils/ui/modals.ts:948): detecta a
   versão da chave, decodifica e roda `applyModel()`, que reconstrói a cena 3D.
   Este módulo só busca o texto da chave e entrega para ele.

   Só monta em Modo Convidado (isGuestMode()) — no privado/online o usuário tem
   os próprios dados e o botão seria ruído.
   ================================================================ */

import { isGuestMode } from './guestGate.js';

/** Caminho do dataset, relativo à raiz servida (app/). */
export const GUEST_DEMO_KEY_URL = './data/demo/guest-demo.ecokey';

const BUTTON_ID = 'guest-load-demo';
const I18N_KEY = 'guest.loadDemo';
/** Fallback pt-BR: o botão nunca aparece vazio nem com a chave crua. */
const FALLBACK_LABEL = 'Carregar exemplo';

/**
 * Injeção de dependências — o teste roda sem rede e sem o app inteiro.
 */
export interface GuestDemoDeps {
    fetchFn?: typeof fetch;
    /** Recebe o texto da chave ECBT e aplica o modelo (default: core/io/import). */
    importKey?: (key: string) => Promise<unknown>;
}

async function defaultImportKey(key: string): Promise<unknown> {
    const mod = await import('../core/io/import.js' as string);
    return mod.importFromString(key);
}

/**
 * Busca o dataset demo e aplica no app (mesmo caminho do Import manual).
 *
 * @returns o modelo aplicado
 * @throws se o fetch falhar (404/offline) ou a chave for inválida — o chamador
 *         decide o que mostrar; aqui não há UI.
 */
export async function loadGuestDemo(deps: GuestDemoDeps = {}): Promise<unknown> {
    const doFetch = deps.fetchFn ?? (typeof fetch !== 'undefined' ? fetch : null);
    if (!doFetch) throw new Error('fetch indisponível');
    const res = await doFetch(GUEST_DEMO_KEY_URL, { cache: 'no-store' } as RequestInit);
    if (!res.ok) throw new Error(`dataset demo indisponível (HTTP ${res.status})`);
    const key = (await res.text()).trim();
    if (!key) throw new Error('dataset demo vazio');
    const importKey = deps.importKey ?? defaultImportKey;
    return importKey(key);
}

function setLabel(el: HTMLElement): void {
    el.textContent = FALLBACK_LABEL;
    // data-i18n mantém o rótulo correto quando o usuário troca de idioma
    // (applyTranslations() varre [data-i18n] e reescreve o textContent).
    el.setAttribute('data-i18n', I18N_KEY);
    import('../utils/i18n/translations.js' as string)
        .then(({ t }) => {
            const traduzido = t(I18N_KEY);
            // t() devolve a própria chave quando não encontra — nesse caso o
            // fallback é melhor que "guest.loadDemo" na tela.
            if (traduzido && traduzido !== I18N_KEY) el.textContent = traduzido;
        })
        .catch((e: any) => console.debug('[guestDemo:i18n]', e?.message || e));
}

/**
 * Monta o botão "Carregar exemplo" (RF3). Idempotente; no-op fora do Modo
 * Convidado. Posicionado acima do banner RF2 (que fica em bottom:12px e é
 * pointer-events:none) para não disputar clique com ele.
 *
 * A11y (§9): <button> real (foco por Tab, Enter/Espaço nativos),
 * aria-busy durante o carregamento, :focus-visible pelo outline do tema.
 */
export function mountGuestDemoButton(
    documentRef: Document | null = typeof document !== 'undefined' ? document : null,
    deps: GuestDemoDeps = {},
): HTMLElement | null {
    if (!isGuestMode() || !documentRef || !documentRef.body) return null;
    const existing = documentRef.getElementById(BUTTON_ID);
    if (existing) return existing as HTMLElement;

    const btn = documentRef.createElement('button');
    btn.id = BUTTON_ID;
    btn.type = 'button';
    setLabel(btn);
    btn.style.cssText = [
        'position:fixed',
        'left:12px',
        // 12px do banner + ~34px de altura dele + 8px de respiro
        'bottom:58px',
        // mesmo tier do banner Modo Convidado (Z_INDEX.EXCEPTION_GUEST_MODE_BANNER
        // = 10100 = teto do css-zindex-audit). Não colidem: o botão fica acima do
        // banner na tela (bottom:58px vs bottom do banner). O max-int estourava o gate.
        'z-index:10100',
        'padding:8px 16px',
        'border:1px solid rgba(255,255,255,0.35)',
        'border-radius:6px',
        // mesmo tom do banner RF2 (#966c22 == --warning light, 4.70:1 com branco)
        'background:#966c22',
        'color:#ffffff',
        'font-size:13px',
        'line-height:1.4',
        'font-family:inherit',
        'cursor:pointer',
        'box-shadow:0 2px 8px rgba(0,0,0,0.35)',
    ].join(';');

    btn.addEventListener('click', () => {
        if (btn.getAttribute('aria-busy') === 'true') return;
        btn.setAttribute('aria-busy', 'true');
        btn.disabled = true;
        loadGuestDemo(deps)
            .then(() => {
                // Sucesso: o dataset está na cena, o botão perdeu a função.
                btn.remove();
                documentRef.dispatchEvent(new CustomEvent('ecbyts:guest-demo-loaded'));
            })
            .catch((e: any) => {
                console.error('[guestDemo] falha ao carregar o dataset demo:', e?.message || e);
                btn.removeAttribute('aria-busy');
                btn.disabled = false;
                import('../utils/ui/toast.js' as string)
                    .then(({ showToast }) => showToast('Não foi possível carregar o exemplo.', 'error'))
                    .catch((toastErr: any) => console.debug('[guestDemo:toast]', toastErr?.message || toastErr));
            });
    });

    documentRef.body.appendChild(btn);
    return btn;
}

/** Test-only: id do botão, para asserção sem duplicar string. */
export const _GUEST_DEMO_BUTTON_ID = BUTTON_ID;
