// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0-only.

const DEFERRED_STYLE_SELECTOR = 'link[data-deferred-href]';
const ACTIVATION_EVENTS = Object.freeze(['pointerover', 'focusin', 'touchstart']);
const DEFAULT_BATCH_SIZE = 6;

export function activateDeferredStyles(documentRef: Document = document, limit = Number.POSITIVE_INFINITY): number {
    const links = Array.from(documentRef.querySelectorAll<HTMLLinkElement>(DEFERRED_STYLE_SELECTOR)).slice(0, limit);
    for (const link of links) {
        const href = link.dataset.deferredHref;
        if (!href) continue;
        link.href = href;
        delete link.dataset.deferredHref;
    }
    return links.filter((link) => !link.dataset.deferredHref).length;
}

/** Há folha adiada esperando? Uma querySelector — barata o bastante para o
 *  caminho de abertura de painel (e vira no-op assim que a fila drena). */
export function hasPendingDeferredStyles(documentRef: Document = document): boolean {
    return !!documentRef.querySelector(DEFERRED_STYLE_SELECTOR);
}

/**
 * CINTO-E-SUSPENSÓRIOS do BUG-DEFERRED-CSS-PANEL.
 *
 * O fix a8b604480 (primeiro pointerdown/keydown ativa tudo) cobre o GESTO
 * humano. Não cobre abertura PROGRAMÁTICA — Automation API, deep-link, tour,
 * `window.handleOpenX()` chamado direto — porque nesses caminhos nunca houve
 * gesto, a fila segue cheia e o painel abre sem folha.
 *
 * Chame ANTES de mostrar o painel. Custo em boot quente: uma querySelector que
 * retorna null. Prefere o evento (rota já existente, um único ponto de verdade);
 * cai para ativação direta se initDeferredStyles ainda não instalou o listener.
 *
 * @returns quantas folhas foram ativadas nesta chamada (0 = nada pendente).
 */
export function ensureDeferredStylesLoaded(documentRef: Document = document, windowRef: Window = window): number {
    if (!hasPendingDeferredStyles(documentRef)) return 0;
    const pendingBefore = documentRef.querySelectorAll(DEFERRED_STYLE_SELECTOR).length;
    try {
        windowRef.dispatchEvent(new Event('ecbyts:load-deferred-styles'));
    } catch (e: any) {
        // Event indisponível (ambiente não-DOM) — o fallback abaixo resolve.
        console.debug('[deferredStyles:dispatch]', e?.message || e);
    }
    if (hasPendingDeferredStyles(documentRef)) activateDeferredStyles(documentRef);
    return pendingBefore - documentRef.querySelectorAll(DEFERRED_STYLE_SELECTOR).length;
}

const PANEL_OPENER = /^handle(Open|Show|Toggle)/;
const PANEL_TARGET = /(Modal|Panel|Dashboard|Hub|Wizard|Editor|Drawer|Overlay)$/;
const GUARD_FLAG = '__ecbytsStyleGuarded';

/**
 * Envolve os `window.handleOpen*` de painel com a guarda acima. É o funil dos
 * abridores PROGRAMÁTICOS (inclusive os auto-registrados por registerOrphanPanels),
 * que é justamente o que o fix do primeiro gesto não alcança. Idempotente.
 *
 * @returns quantos abridores foram envolvidos.
 */
export function installPanelOpenStyleGuard(windowRef: any = window, documentRef: Document = document): number {
    if (!windowRef) return 0;
    let wrapped = 0;
    for (const name of Object.keys(windowRef)) {
        if (!PANEL_OPENER.test(name) || !PANEL_TARGET.test(name)) continue;
        const original = windowRef[name];
        if (typeof original !== 'function' || original[GUARD_FLAG]) continue;
        const guarded = function (this: unknown, ...args: unknown[]) {
            ensureDeferredStylesLoaded(documentRef, windowRef);
            return original.apply(this, args);
        };
        guarded[GUARD_FLAG] = true;
        windowRef[name] = guarded;
        wrapped += 1;
    }
    return wrapped;
}

/** Teto da espera explícita antes de abrir um painel (ms). */
export const STYLE_WAIT_TIMEOUT_MS = 2500;

/**
 * BUG-DEFERRED-CSS-PANEL-3G (frente #rede-lenta, 2026-08-06).
 *
 * O fix do primeiro gesto (a8b604480) ativa as ~93 folhas adiadas de uma vez.
 * Em rede rápida isso resolve; em rede lenta ele EMPURRA o problema: o clique
 * dispara ~1,02 MB de CSS e o painel pode abrir ANTES da folha dele chegar —
 * mesmo sintoma do bug original ("Mais → Interpolação não funcionou"), outra
 * rota. MEDIDO nesta máquina, do 1º gesto até a folha ficar APLICADA
 * (link.sheet != null), cache frio:
 *   localhost sem throttle → interpolation.css 636 ms · p50 929 ms · máx 1200 ms
 *   Fast 3G                → interpolation.css 4645 ms · p50 7243 ms · máx 11452 ms
 *   Slow 3G                → ver .runtime/ev-rede/out-f6-slow3g.json
 * Ou seja: a janela de FOUC passa de 200 ms em TODOS os perfis, inclusive sem
 * throttle. Daí a espera explícita abaixo.
 *
 * Contrato:
 *  - ativa o que ainda estiver adiado (idempotente, reusa activateDeferredStyles);
 *  - se TODAS as folhas já estão aplicadas devolve `null` (caminho síncrono, custo
 *    zero — é o caso comum depois que a rede assenta);
 *  - senão devolve Promise que resolve no load/error das folhas pendentes ou no
 *    timeout, marcando `documentElement.dataset.deferredStylesLoading` enquanto
 *    espera (gancho do spinner, ver #boot-critical-css em app/index.html) e
 *    `dataset.deferredStylesDegraded` quando estourou o teto ou alguma folha
 *    falhou — é a degradação COM AVISO exigida pelo caso de falha de rede.
 */
export function ensureDeferredStylesApplied(
    documentRef: Document = document,
    windowRef: Window = window,
    timeoutMs: number = STYLE_WAIT_TIMEOUT_MS,
): Promise<'ready' | 'degraded'> | null {
    activateDeferredStyles(documentRef);
    const links = Array.from(documentRef.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'));
    const pending = links.filter((link) => !!link.getAttribute('href') && !link.sheet);
    if (pending.length === 0) return null;

    const root = documentRef.documentElement;
    root.dataset.deferredStylesLoading = String(pending.length);
    return new Promise<'ready' | 'degraded'>((resolve) => {
        let left = pending.length;
        let failed = false;
        let done = false;
        const finish = (outcome: 'ready' | 'degraded') => {
            if (done) return;
            done = true;
            delete root.dataset.deferredStylesLoading;
            if (outcome === 'degraded') {
                root.dataset.deferredStylesDegraded = 'true';
                try {
                    windowRef.dispatchEvent(new CustomEvent('ecbyts:deferred-styles-degraded', { detail: { pending: left, failed } }));
                } catch (e: any) {
                    console.debug('[deferredStyles] degraded event:', e?.message || e);
                }
                // AVISO ao usuário: sem isto o painel abre cru e o usuário não
                // tem como saber que foi a rede (era o buraco do caso "falha de
                // CSS no meio da sessão"). Import dinâmico: nada disso pesa no boot.
                import('../utils/ui/toast.js' as string)
                    .then(({ showToast }: any) => import('../utils/i18n/translations.js' as string)
                        .then(({ t }: any) => showToast(
                            t('deferredStyles.degraded') || 'Rede lenta: alguns estilos não carregaram. A tela pode aparecer sem formatação — recarregue quando a conexão melhorar.',
                            'warning',
                            8000,
                        ))
                        .catch((i18nErr: any) => {
                            console.debug('[deferredStyles:degraded-i18n]', i18nErr?.message || i18nErr);
                            showToast('Rede lenta: alguns estilos não carregaram. A tela pode aparecer sem formatação — recarregue quando a conexão melhorar.', 'warning', 8000);
                        }))
                    .catch((e: any) => console.debug('[deferredStyles:degraded-toast:silent-catch]', e?.message || e));
            }
            resolve(outcome);
        };
        const tick = (bad: boolean) => {
            if (bad) failed = true;
            left -= 1;
            if (left <= 0) finish(failed ? 'degraded' : 'ready');
        };
        for (const link of pending) {
            link.addEventListener('load', () => tick(false), { once: true });
            link.addEventListener('error', () => tick(true), { once: true });
        }
        windowRef.setTimeout(() => finish('degraded'), timeoutMs);
    });
}

export function initDeferredStyles(documentRef: Document = document, windowRef: Window = window): () => void {
    let interactionWindowOpen = false;
    const activateBatch = () => {
        if (interactionWindowOpen) return;
        interactionWindowOpen = true;
        activateDeferredStyles(documentRef, DEFAULT_BATCH_SIZE);
        windowRef.requestAnimationFrame(() => {
            interactionWindowOpen = false;
        });
    };
    const activateAll = () => {
        activateDeferredStyles(documentRef);
    };

    for (const eventName of ACTIVATION_EVENTS) {
        windowRef.addEventListener(eventName, activateBatch, { capture: true, passive: true });
    }
    // BUG-DEFERRED-CSS-PANEL (Calvin, 2026-08-06): "Mais → Interpolação não
    // funcionou" — o JS abria o .eis-modal, mas eis.css seguia adiado (93
    // folhas pendentes MEDIDAS na sessão) e o "modal" virava bloco sem estilo
    // fora da tela. Lotes de 6 por pointerover não drenam a fila a tempo de um
    // clique direto no menu. No PRIMEIRO gesto de intenção (pointerdown/keydown)
    // o boot já cumpriu o papel do adiamento → ativa TUDO, uma vez.
    for (const eventName of ['pointerdown', 'keydown']) {
        windowRef.addEventListener(eventName, activateAll, { capture: true, passive: true, once: true });
    }
    windowRef.addEventListener('ecbyts:load-deferred-styles', activateAll);
    documentRef.documentElement.dataset.deferredStylesReady = 'true';

    const params = new URLSearchParams(windowRef.location?.search || '');
    if (params.has('tools') || params.has('tool') || windowRef.location?.hash?.includes('tools=')) {
        activateAll();
    }

    return activateAll;
}
