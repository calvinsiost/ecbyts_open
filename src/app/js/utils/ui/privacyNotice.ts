// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * Privacy / Legal consent — LGPD compliance (SPEC COMPLIANCE-LEGAL-001).
 *
 * Two surfaces:
 *  1. Unified ToS / Privacy / Cookie consent MODAL on first visit
 *     (and re-shown when the policy version/hash changes). Captures a
 *     provable consent record (timestamp + version + policyHash).
 *  2. Cookie-banner helpers kept for backward compatibility.
 *
 * Cookies essenciais (auth, idioma) nao requerem consentimento; cookies
 * de preferencia (tema, layout) podem ser recusados.
 */
import { t } from '../i18n/translations.js';
import { safeSetItem } from '../storage/storageMonitor.js';
import { idbSet, idbGet } from '../storage/idbStore.js';
import { escapeHtml } from '../helpers/html.js';
import { createLogger } from '../helpers/logger.js';
import { safeJsonParse } from '../helpers/safeJsonParse.js';
import { attachModalA11y } from './modalA11y.js';
import {
    buildConsentRecord,
    isConsentValid,
    POLICY_VERSION,
    syncConsentRecord,
    hasImproveProductConsent,
    applyImproveProductConsent,
} from '../auth/consentLedger.js';
const log = createLogger('privacyNotice');
const CONSENT_KEY = 'ecbyts-cookie-consent';
/** Chave do registro de consentimento legal completo (IDB + LS fallback). */
const LEGAL_CONSENT_KEY = 'ecbyts-legal-consent';
export const IMPROVE_PRODUCT_CONSENT_EVENT = 'ecbyts:improve-product-consent';
const MODAL_ID = 'legal-consent-modal';
/** Chaves de localStorage consideradas opcionais (preferencia). */
const OPTIONAL_KEYS = [
    'ecbyts-theme',
    'ecbyts-panel-layout',
    'ecbyts-tab-layout',
    'ecbyts-bars-layout',
    'ecbyts-constellation-height',
    'ecbyts-constellation-collapsed',
    'ecbyts-customize',
    'ecbyts-quality-tier',
    'ecbyts-nn-panel',
];
/**
 * Texto canonico das politicas usado para o policyHash. Mudar este
 * texto (ou POLICY_VERSION) forca re-aceite no proximo boot.
 */
const POLICY_TEXT = `terms=/terms.html;privacy=/privacy.html;v=${POLICY_VERSION}`;
let _improveProductWriteRevision = 0;
let _improveProductWriteQueue: Promise<void> = Promise.resolve();
// ─── Cookie-banner backward-compat API ───────────────────────────
/**
 * Retorna o consentimento de cookies salvo ou null.
 * @returns {{ essential: boolean, preferences: boolean, accepted_at: string } | null}
 */
export function getConsent() {
    return safeJsonParse<{ essential: boolean; preferences: boolean; accepted_at: string }>(
        localStorage.getItem(CONSENT_KEY)
    );
}
/**
 * Verifica se cookies de preferencia foram aceitos.
 * @returns {boolean}
 */
export function hasPreferenceConsent() {
    const c = getConsent();
    return c ? c.preferences === true : false;
}
function _saveCookieConsent(preferences: boolean) {
    safeSetItem(CONSENT_KEY, JSON.stringify({ essential: true, preferences, accepted_at: new Date().toISOString() }));
}
function _clearOptionalCookies() {
    for (const key of OPTIONAL_KEYS) localStorage.removeItem(key);
}
// ─── Legal consent record persistence ────────────────────────────
/**
 * Le o registro de consentimento legal (IDB primario, LS fallback).
 * @returns {Promise<any|null>}
 */
export async function getLegalConsent() {
    try {
        const fromIdb = await idbGet(LEGAL_CONSENT_KEY);
        if (fromIdb) return fromIdb;
    } catch (e: any) {
        log.debug('idbGet legal consent failed', /** @type {any} */ (e)?.message || e);
    }
    return safeJsonParse(localStorage.getItem(LEGAL_CONSENT_KEY));
}
/**
 * Persiste o registro (IDB + LS fallback) e dispara o sync stub.
 * @param {any} record
 */
async function _persistLegalConsent(record: any) {
    try {
        await idbSet(LEGAL_CONSENT_KEY, record);
    } catch (e: any) {
        log.debug('idbSet legal consent failed; LS fallback', /** @type {any} */ (e)?.message || e);
    }
    safeSetItem(LEGAL_CONSENT_KEY, JSON.stringify(record));
    try {
        const r = await syncConsentRecord(record);
        log.debug('consent sync deferred', r?.reason);
    } catch (e: any) {
        log.debug('syncConsentRecord stub error', /** @type {any} */ (e)?.message || e);
    }
}

function _notifyImproveProductConsent(enabled: boolean) {
    try {
        if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
        window.dispatchEvent(new CustomEvent(IMPROVE_PRODUCT_CONSENT_EVENT, {
            detail: { enabled: enabled === true },
        }));
    } catch (e: any) {
        log.debug('improve_product notification failed', e?.message || e);
    }
}

/** Assina mudancas do opt-in na aba corrente. */
export function subscribeImproveProductOptIn(listener: (enabled: boolean) => void) {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => {};
    const handler = (event: Event) => listener((event as CustomEvent)?.detail?.enabled === true);
    window.addEventListener(IMPROVE_PRODUCT_CONSENT_EVENT, handler);
    return () => window.removeEventListener(IMPROVE_PRODUCT_CONSENT_EVENT, handler);
}
// ─── Unified consent modal ───────────────────────────────────────
/** @type {(() => void) | null} */
let _a11yCleanup: any = null;
/**
 * Aguarda o #loading-overlay de boot (z-index 99999 inline em index.html, opaco)
 * sumir/parar de interceptar antes de mostrar o consent. Sem isto, o overlay
 * oclui o modal e intercepta o clique em "Aceitar todos" durante o boot/geração
 * (~30s), travando o usuario na primeira visita (North Star v2: usabilidade).
 * Limitado por timeout — o boot watchdog remove o overlay de qualquer forma.
 * @param {number} timeoutMs
 * @returns {Promise<void>}
 */
function _waitForBootOverlayGone(timeoutMs = 45000) {
    return new Promise<void>((resolve) => {
        if (typeof document === 'undefined') return resolve();
        const stillBlocks = () => {
            const o = document.getElementById('loading-overlay');
            if (!o) return false;
            const s = getComputedStyle(o);
            return s.display !== 'none' && s.pointerEvents !== 'none' && Number(s.opacity) > 0.05;
        };
        if (!stillBlocks()) return resolve();
        const start = Date.now();
        const tick = () => {
            if (!stillBlocks() || Date.now() - start > timeoutMs) return resolve();
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
}
/**
 * Inicializa o consentimento legal. Chamado no boot. Se o registro
 * salvo ainda for valido para a versao corrente, nao mostra nada.
 */
export async function initCookieConsent() {
    let record = null;
    try {
        record = await getLegalConsent();
    } catch (e: any) {
        log.debug('getLegalConsent failed', /** @type {any} */ (e)?.message || e);
    }
    if (isConsentValid(record, POLICY_TEXT, POLICY_VERSION)) return;
    // O modal so aparece quando o boot overlay nao estiver mais bloqueando,
    // garantindo que "Aceitar todos" seja clicavel (ver _waitForBootOverlayGone).
    await _waitForBootOverlayGone();
    // TD-2 (PERSONA_JOURNEY audit, frente "a" Calvin 2026-06-11): na 1ª visita
    // o consent abria POR CIMA do welcome (2 modais empilhados — burocracia
    // antes de valor). Sequencia: welcome fecha → consent aparece. Fail-safe
    // legal: cap de 90s — se o usuário ficar parado no welcome, o consent
    // aparece mesmo assim (nunca processar além do boot sem consentimento).
    await _waitForWelcomeGone();
    // Nunca montar o consent por cima de uma interação em curso: aguardar uma
    // micro-pausa. Cobre o caso residual (deep-link/guest na 1ª visita, em que o
    // welcome não monta e o timer cego dispara com o usuário já interagindo) e
    // qualquer sobreposição com a ação que acabou de fechar o welcome
    // (UI-EVAL-COVERAGE-001 ordem-invertida).
    await _waitForInteractionIdle();
    _showConsentModal();
}

/**
 * Aguarda a .welcome-overlay (1ª visita) fechar antes do consent — um modal
 * por vez. Cap 90s + resolve imediato se não há welcome a esperar.
 *
 * A predição "o welcome vai montar?" ESPELHA a condição canônica do
 * startup-gates/welcomeScreen (`shouldShowWelcome`): 1ª visita não tratada =
 * `ecbyts-first-visit` ausente E `ecbyts-welcome-shown !== 'true'`. Antes olhava
 * só `welcome-shown`; quando `ecbyts-first-visit` já existia (p.ex. o fluxo de
 * convite marca first-visit SEM setar welcome-shown, ou o gate pula o welcome
 * por deep-link/guest) o consent ficava esperando um welcome que nunca monta e
 * o timer cego de 15s montava o modal por cima da interação em curso
 * (UI-EVAL-COVERAGE-001 ordem-invertida). Além do polling, ancora no evento
 * real `welcome:complete` disparado pelo welcomeScreen ao fechar.
 * @param {number} timeoutMs
 * @returns {Promise<void>}
 */
function _waitForWelcomeGone(timeoutMs = 90000) {
    return new Promise<void>((resolve) => {
        if (typeof document === 'undefined') return resolve();
        const isOpen = () => {
            const w = document.querySelector('.welcome-overlay') as HTMLElement | null;
            if (!w) return false;
            const s = getComputedStyle(w);
            return s.display !== 'none' && w.getBoundingClientRect().width > 0;
        };
        // Só espera o welcome se for REALMENTE a 1ª visita não tratada — a mesma
        // condição que o startup-gates usa para decidir montá-lo. 'ecbyts-first-
        // visit' é lido inline (não via FIRST_VISIT_KEY) para não puxar o módulo
        // pesado do tour no caminho de boot — mesmo padrão do startup-gates.
        // (loadedFromURL/guestMode não são observáveis aqui; o idle-gate em
        // initCookieConsent impede o consent de cair por cima da interação nesses
        // casos residuais.)
        let willMount = false;
        try {
            willMount =
                !localStorage.getItem('ecbyts-first-visit') &&
                localStorage.getItem('ecbyts-welcome-shown') !== 'true';
        } catch (e: any) {
            log.debug('welcome-shown read failed', e?.message || e);
        }
        if (!isOpen() && !willMount) return resolve();
        const start = Date.now();
        let seenOpen = isOpen();
        let done = false;
        let iv: ReturnType<typeof setInterval> | null = null;
        const finish = () => {
            if (done) return;
            done = true;
            if (iv) clearInterval(iv);
            if (typeof window !== 'undefined') {
                window.removeEventListener('welcome:complete', finish);
                window.removeEventListener('welcome:dismissed', finish);
            }
            resolve();
        };
        // Sinais reais de fim do welcome, para não depender do timer cego:
        //  • 'welcome:complete'  — welcomeScreen.close(), escolha do usuário;
        //  • 'welcome:dismissed' — forceDismissWelcomeOverlays(), remoção à força
        //    pelo gate (sem passar pelo close()). É este caminho que, sem sinal,
        //    fazia o consent esperar 15s e cair por cima da interação.
        if (typeof window !== 'undefined') {
            window.addEventListener('welcome:complete', finish);
            window.addEventListener('welcome:dismissed', finish);
        }
        iv = setInterval(() => {
            const open = isOpen();
            if (open) seenOpen = true;
            const mountWindowOver = !seenOpen && Date.now() - start > 15000;
            const closedAfterOpen = seenOpen && !open;
            if (closedAfterOpen || mountWindowOver || Date.now() - start > timeoutMs) {
                finish();
            }
        }, 300);
    });
}

/**
 * Aguarda uma micro-pausa na interação antes de montar o consent, para NUNCA
 * abri-lo por cima de um clique/arrasto/digitação em curso — o modal rouba o
 * foco e intercepta o passo seguinte, invalidando ações em par
 * (UI-EVAL-COVERAGE-001 ordem-invertida). Fail-safe legal preservado: teto
 * curto — se o usuário interage sem parar, o consent aparece mesmo assim
 * (nunca seguir além do boot sem consentimento).
 * @param {number} idleMs silêncio de interação para considerar "ocioso"
 * @param {number} capMs teto absoluto de espera
 * @returns {Promise<void>}
 */
function _waitForInteractionIdle(idleMs = 800, capMs = 8000) {
    return new Promise<void>((resolve) => {
        if (typeof window === 'undefined' || typeof document === 'undefined') return resolve();
        let last = Date.now();
        const bump = () => {
            last = Date.now();
        };
        const evs = ['pointerdown', 'pointerup', 'pointermove', 'keydown', 'wheel', 'touchstart'];
        evs.forEach((ev) => window.addEventListener(ev, bump, { passive: true, capture: true }));
        const start = Date.now();
        const iv = setInterval(() => {
            if (Date.now() - last >= idleMs || Date.now() - start >= capMs) {
                clearInterval(iv);
                evs.forEach((ev) => window.removeEventListener(ev, bump, { capture: true }));
                resolve();
            }
        }, 150);
    });
}
/**
 * Reabre o modal de consentimento (entrada via UI/footer/menu).
 * Permite ao usuario revisar e revogar/atualizar a escolha.
 */
export function openConsentModal() {
    _showConsentModal();
}
function _closeModal() {
    const overlay = document.getElementById(MODAL_ID);
    if (!overlay) return;
    if (typeof _a11yCleanup === 'function') {
        _a11yCleanup();
        _a11yCleanup = null;
    }
    overlay.remove();
}
/**
 * Grava o consentimento com as preferencias escolhidas e fecha.
 * @param {boolean} preferences aceita cookies de preferencia?
 */
async function _accept(preferences: any) {
    _saveCookieConsent(preferences);
    if (!preferences) _clearOptionalCookies();
    // Opt-in "Ajude a melhorar o produto" (SPEC_HUMAN_USAGE_CAPTURE_OPT_IN F1/F2):
    // lê o checkbox do modal — NUNCA pré-marcado (default OFF); só liga se o
    // usuário marcou explicitamente. Independente do consentimento obrigatório.
    const improveEl = document.getElementById('legal-consent-improve') as HTMLInputElement | null;
    const improveProduct = improveEl?.checked === true;
    const record = buildConsentRecord({
        scopes: {
            terms: true,
            privacy: true,
            cookies_essential: true,
            cookies_preferences: preferences,
            improve_product: improveProduct,
        },
        policyText: POLICY_TEXT,
    });
    if (!improveProduct) _notifyImproveProductConsent(false);
    await _persistLegalConsent(record);
    if (improveProduct) _notifyImproveProductConsent(true);
    _closeModal();
    // LOADING-PERF-001 RF-7: ao consentir opt-in (cookies/telemetria opcionais),
    // liga a coleta de Web Vitals de campo SEM exigir reload. Se recusou
    // ("essential only"), a coleta permanece desligada. Lazy + tolerante a falha.
    _applyFieldVitalsConsent(record);
}

/**
 * Aplica o consentimento opt-in à coleta de Web Vitals de campo (RF-7).
 * Liga o monitor quando o usuário aceitou os cookies/telemetria opcionais.
 * No-op silencioso se a flag estiver off, fora do browser, ou já houver
 * um monitor ativo. Não lança.
 * @param {any} record registro legal recém-gravado.
 */
function _applyFieldVitalsConsent(record: any) {
    try {
        if (typeof window === 'undefined') return;
        const w = window as any;
        if (w.__ecbytsWebVitalsFieldMonitor) return; // já ligado neste tab
        void import('../telemetry/webVitalsField.js')
            .then(({ startWebVitalsFieldMonitoring }) => {
                w.__ecbytsWebVitalsFieldMonitor = startWebVitalsFieldMonitoring({
                    consented: record,
                });
            })
            .catch((e: any) => log.debug('field-vitals consent apply failed', e?.message || e));
    } catch (e: any) {
        log.debug('field-vitals consent gate error', e?.message || e);
    }
}
function _showConsentModal() {
    if (document.getElementById(MODAL_ID)) return;
    const title = t('consent.title') || 'Privacy & Terms';
    const intro = t('consent.intro') || 'Before continuing, please review and accept our terms.';
    const cookieLine = t('cookie.banner') || 'This site uses cookies for authentication and preferences.';
    const termsLbl = t('legal.terms') || 'Terms of Service';
    const privacyLbl = t('legal.privacy') || 'Privacy Policy';
    const learnMore = t('cookie.learnMore') || 'Learn more';
    const acceptAll = t('cookie.acceptAll') || 'Accept all';
    const essentialOnly = t('cookie.essentialOnly') || 'Essential only';
    const improveLbl =
        t('consent.improveProduct') ||
        'Help improve the product — we record your interaction anonymously, never any typed text.';
    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.className = 'ecbt-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'legal-consent-title');
    overlay.innerHTML = `
        <div class="ecbt-dialog ecbt-dialog--sm legal-consent-dialog">
            <h2 id="legal-consent-title" class="ecbt-dialog__title">${escapeHtml(title)}</h2>
            <div class="ecbt-dialog__body">
                <p>${escapeHtml(intro)}</p>
                <p>${escapeHtml(cookieLine)}</p>
                <p>
                    <a href="/terms.html" target="_blank" rel="noopener">${escapeHtml(termsLbl)}</a>
                    &middot;
                    <a href="/privacy.html" target="_blank" rel="noopener">${escapeHtml(privacyLbl)}</a>
                    &middot;
                    <a href="/privacy.html#cookies" target="_blank" rel="noopener">${escapeHtml(learnMore)}</a>
                </p>
                <label class="legal-consent-improve-row">
                    <!-- Opt-in improve_product: NUNCA "checked" no markup — default OFF (LGPD/CDC). -->
                    <input type="checkbox" id="legal-consent-improve" />
                    <span>${escapeHtml(improveLbl)}</span>
                </label>
            </div>
            <div class="ecbt-dialog__footer">
                <button type="button" class="btn-secondary" id="legal-consent-essential">${escapeHtml(essentialOnly)}</button>
                <button type="button" class="btn-primary" id="legal-consent-accept">${escapeHtml(acceptAll)}</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    const acceptBtn = (document.getElementById('legal-consent-accept')) as HTMLElement|null;
    document.getElementById('legal-consent-accept')?.addEventListener('click', () => _accept(true));
    document.getElementById('legal-consent-essential')?.addEventListener('click', () => _accept(false));
    // First-visit consent must be answered: Escape closes as
    // "essential only" (a valid LGPD choice — no cookie wall).
    _a11yCleanup = attachModalA11y(overlay, () => _accept(false), { initialFocus: acceptBtn });
    // Reabertura (revisão/revogação — LGPD Art. 18): reflete o estado SALVO do
    // opt-in. Na 1ª visita o registro não existe → permanece desmarcado (OFF).
    void getLegalConsent()
        .then((rec) => {
            const cb = document.getElementById('legal-consent-improve') as HTMLInputElement | null;
            if (cb && hasImproveProductConsent(rec)) cb.checked = true;
        })
        .catch((e: any) => log.debug('improve_product state restore failed', e?.message || e));
}

// ─── Opt-in "Ajude a melhorar o produto" (improve_product) ───────
/**
 * Lê o estado corrente do opt-in improve_product (default OFF).
 * @returns {Promise<boolean>}
 */
export async function getImproveProductOptIn() {
    try {
        return hasImproveProductConsent(await getLegalConsent());
    } catch (e: any) {
        log.debug('getImproveProductOptIn failed', e?.message || e);
        return false;
    }
}

/**
 * Liga/desliga o opt-in improve_product de forma revogável: gera um NOVO
 * registro de consentimento (append-only — a trilha anterior não é apagada)
 * preservando os demais escopos, e persiste (IDB + LS + sync stub).
 * @param {boolean} enabled
 * @returns {Promise<boolean>} estado efetivo gravado.
 */
export async function setImproveProductOptIn(enabled: boolean) {
    const intent = ++_improveProductWriteRevision;
    const desired = enabled === true;
    if (!desired) _notifyImproveProductConsent(false);
    const write = _improveProductWriteQueue.then(async () => {
        let prev = null;
        try {
            prev = await getLegalConsent();
        } catch (e: any) {
            log.debug('setImproveProductOptIn read failed', e?.message || e);
        }
        const record = applyImproveProductConsent(prev, desired, { policyText: POLICY_TEXT });
        await _persistLegalConsent(record);
        if (intent === _improveProductWriteRevision) _notifyImproveProductConsent(desired);
        return desired;
    });
    _improveProductWriteQueue = write.then(() => undefined, () => undefined);
    return write;
}
