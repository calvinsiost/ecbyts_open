// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   CREDITS HUB - Mobile-first consolidated credits view
   Consulta consolidada de creditos ECBT + EIC.
   ================================================================ */
import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';
import { createLogger } from '../helpers/logger.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';
import * as _authNs from '../auth/session.js';
const getCurrentUser = _authNs.getCurrentUser;
import { getBalance, getTransactions } from '../../core/currency/ecbtLedger.js';
import { fetchRates, convert } from '../../core/currency/exchangeRates.js';
import { formatECBT, formatFiatValue } from '../helpers/currencyFormat.js';
import { fetchCreditPortfolio } from '../libraries/marketV2Client.js';
const log = createLogger('CreditsHub');
/** @type {any} */
let _overlay: any = null;
/** @type {any} */
let _panel: any = null;
let _isOpen = false;
/** @type {any} */
let _lastFocus: any = null;
let _requestId = 0;
/** @param {any} [options] */
export async function openCreditsHub(options: any = {}) {
    // FINDING-010 (UI/UX Audit 2026-06-04, claude - ui): default = {}
    // só aplica se argumento for undefined. Dispatcher applyDeepLink passa
    // payload=null explicitamente quando ?tools=credits-hub sem payload —
    // null não dispara default e quebrava em `options.source` (TypeError
    // null.source). Coerce defensivo cobre null E undefined.
    options = options || {};
    _ensureDom();
    if (!_overlay || !_panel)
        return;
    _isOpen = true;
    _lastFocus = document.activeElement;
    _overlay.classList.add('active');
    document.body.classList.add('credits-hub-open');
    _emitTelemetry('navigation', 'credits_hub_open', { source: String(options.source || 'unknown') });
    await refreshCreditsHub();
    // Sprint 3 Tier-B wire (Calvin 2026-06-03)
    syncDeepLinkUrl('credits-hub');
}
export function closeCreditsHub() {
    if (!_overlay)
        return;
    _isOpen = false;
    _overlay.classList.remove('active');
    document.body.classList.remove('credits-hub-open');
    clearDeepLinkUrl();
    if (_lastFocus && typeof _lastFocus.focus === 'function') {
        try {
            _lastFocus.focus();
        }
        catch (e: any) {
            console.debug('[creditsHub] restoreFocus:', e?.message || e);
            /* noop */
        }
    }
}
export async function refreshCreditsHub() {
    if (!_panel)
        return;
    _requestId += 1;
    const reqId = _requestId;
    _emitTelemetry('click', 'credits_hub_refresh', {});
    _renderSkeleton();
    const mockUser = typeof window !== 'undefined' ? window.__ecbytsCreditsHubMockUser : null;
    const user = getCurrentUser?.() || mockUser || null;
    if (!user) {
        if (reqId !== _requestId)
            return;
        _renderLoggedOut();
        return;
    }
    const mock = typeof window !== 'undefined' ? window.__ecbytsCreditsHubMock : null;
    const ecbtPromise = mock?.ecbt ? Promise.resolve(mock.ecbt) : _loadEcbtData();
    const eicPromise = mock?.eic ? Promise.resolve(mock.eic) : _loadEicData();
    const [ecbtResult, eicResult] = await Promise.allSettled([ecbtPromise, eicPromise]);
    if (reqId !== _requestId)
        return;
    const ecbt = ecbtResult.status === 'fulfilled'
        ? ecbtResult.value
        : { error: true, message: ecbtResult.reason?.message || 'ecbt_fetch_failed' };
    const eic = eicResult.status === 'fulfilled'
        ? eicResult.value
        : { error: true, message: eicResult.reason?.message || 'eic_fetch_failed' };
    _renderContent({ ecbt, eic });
}
async function _loadEcbtData() {
    const [balance, rates, transactions] = await Promise.all([
        getBalance(),
        fetchRates(),
        getTransactions({ limit: 12 }),
    ]);
    return { balance, rates, transactions: Array.isArray(transactions) ? transactions : [] };
}
async function _loadEicData() {
    const raw = await fetchCreditPortfolio();
    const items = Array.isArray(raw?.items) ? raw.items : [];
    const summary = _summarizeEic(items);
    return { items, summary };
}
/** @param {any} items */
function _summarizeEic(items: any) {
    const acc = { held: 0, listed: 0, traded: 0, retired: 0 };
    for (const item of items || []) {
        const amount = Number(item?.amount || 0);
        const status = String(item?.status || 'held');
        if (!Number.isFinite(amount) || amount <= 0)
            continue;
        if (status === 'listed')
            acc.listed += amount;
        else if (status === 'traded')
            acc.traded += amount;
        else if (status === 'retired')
            acc.retired += amount;
        else
            acc.held += amount;
    }
    return {
        held: _round2(acc.held),
        listed: _round2(acc.listed),
        traded: _round2(acc.traded),
        retired: _round2(acc.retired),
    };
}
function _renderSkeleton() {
    if (!_panel)
        return;
    _panel.innerHTML = `
        ${_headerHtml()}
        <div class="credits-hub-body">
            <section class="credits-hub-summary">
                <article class="credits-hub-card credits-hub-skeleton" aria-hidden="true"></article>
                <article class="credits-hub-card credits-hub-skeleton" aria-hidden="true"></article>
            </section>
            <section class="credits-hub-section">
                <div class="credits-hub-skeleton credits-hub-skeleton-line" aria-hidden="true"></div>
                <div class="credits-hub-skeleton credits-hub-skeleton-line" aria-hidden="true"></div>
                <div class="credits-hub-skeleton credits-hub-skeleton-line" aria-hidden="true"></div>
            </section>
        </div>
    `;
    _bindStaticActions();
}
function _renderLoggedOut() {
    if (!_panel)
        return;
    _panel.innerHTML = `
        ${_headerHtml()}
        <div class="credits-hub-body">
            <section class="credits-hub-summary">
                <article class="credits-hub-card" data-testid="credits-ecbt-card">
                    <h3>${escapeHtml(t('wallet.balance') || 'Saldo $ECBT')}</h3>
                    <p class="credits-hub-muted">${escapeHtml(t('auth.loginRequired') || 'Faca login para consultar seus creditos.')}</p>
                </article>
                <article class="credits-hub-card" data-testid="credits-eic-card">
                    <h3>${escapeHtml('Creditos EIC')}</h3>
                    <p class="credits-hub-muted">${escapeHtml('Faca login para visualizar held/listed/traded/retired.')}</p>
                </article>
            </section>
            <section class="credits-hub-section" data-testid="credits-logged-out">
                <h4>${escapeHtml('Acesso necessario')}</h4>
                <p class="credits-hub-muted">${escapeHtml('Entre na sua conta para ver saldo consolidado em tempo real.')}</p>
                <div class="credits-hub-actions">
                    <button class="credits-hub-btn credits-hub-btn-primary" id="credits-action-login">${escapeHtml(t('login') || 'Login')}</button>
                </div>
            </section>
        </div>
    `;
    _bindStaticActions();
    const btn = document.getElementById('credits-action-login');
    if (btn) {
        btn.addEventListener('click', () => {
            _emitTelemetry('click', 'credits_quick_action_click', { action: 'login' });
            closeCreditsHub();
            if (typeof window.handleOpenAuthModal === 'function')
                window.handleOpenAuthModal();
            else if (typeof window.handleToggleAuthMenu === 'function')
                window.handleToggleAuthMenu();
        });
    }
}
function _renderContent({ ecbt, eic }: { ecbt: any; eic: any }) {
    if (!_panel)
        return;
    const ecbtErrored = Boolean(ecbt?.error);
    const eicErrored = Boolean(eic?.error);
    const ecbtBalance = ecbtErrored ? null : Number(ecbt?.balance || 0);
    const rates = ecbt?.rates || null;
    const brl = ecbtErrored || !rates ? null : convert(ecbtBalance as number, 'ECBT', 'BRL', rates);
    const usd = ecbtErrored || !rates ? null : convert(ecbtBalance as number, 'ECBT', 'USD', rates);
    const eicSummary = eicErrored ? { held: 0, listed: 0, traded: 0, retired: 0 } : eic.summary;
    const recent = _buildRecent(ecbt?.transactions || [], eic?.items || []);
    _panel.innerHTML = `
        ${_headerHtml()}
        <div class="credits-hub-body">
            <section class="credits-hub-summary">
                <article class="credits-hub-card" data-testid="credits-ecbt-card">
                    <h3>${escapeHtml(t('wallet.balance') || 'Saldo $ECBT')}</h3>
                    ${ecbtErrored
        ? `<p class="credits-hub-error">${escapeHtml(t('wallet.error') || 'Erro ao carregar carteira')}</p>`
        : `<p class="credits-hub-strong">${escapeHtml(formatECBT(ecbtBalance as number))}</p>
                               <p class="credits-hub-muted">~ ${escapeHtml(formatFiatValue(brl || 0, 'BRL'))} | ${escapeHtml(formatFiatValue(usd || 0, 'USD'))}</p>`}
                </article>
                <article class="credits-hub-card" data-testid="credits-eic-card">
                    <h3>${escapeHtml('Creditos EIC')}</h3>
                    ${eicErrored
        ? `<p class="credits-hub-error">${escapeHtml('Erro ao carregar portfolio EIC')}</p>`
        : `<div class="credits-hub-metrics">
                                <span><strong>Held</strong> ${escapeHtml(eicSummary.held.toFixed(2))}</span>
                                <span><strong>Listed</strong> ${escapeHtml(eicSummary.listed.toFixed(2))}</span>
                                <span><strong>Traded</strong> ${escapeHtml(eicSummary.traded.toFixed(2))}</span>
                                <span><strong>Retired</strong> ${escapeHtml(eicSummary.retired.toFixed(2))}</span>
                               </div>`}
                </article>
            </section>
            <section class="credits-hub-section">
                <h4>${escapeHtml('Acoes rapidas')}</h4>
                <div class="credits-hub-actions">
                    <button class="credits-hub-btn credits-hub-btn-primary" id="credits-action-topup">${escapeHtml(t('wallet.addFunds') || 'Adicionar fundos')}</button>
                    <button class="credits-hub-btn" id="credits-action-portfolio">${escapeHtml('Ver portfolio EIC')}</button>
                    <button class="credits-hub-btn" id="credits-action-offers">${escapeHtml('Buscar ofertas EIC')}</button>
                </div>
            </section>
            <section class="credits-hub-section">
                <h4>${escapeHtml('Movimentacoes recentes')}</h4>
                ${recent.length
        ? `<ul class="credits-hub-recent" data-testid="credits-recent-list">${recent.map(_renderRecentItem).join('')}</ul>`
        : `<p class="credits-hub-muted">${escapeHtml(t('wallet.emptyState') || 'Nenhuma transacao ainda')}</p>`}
            </section>
        </div>
    `;
    _bindStaticActions();
    _bindQuickActions();
}
/** @param {any} transactions @param {any} credits */
function _buildRecent(transactions: any, credits: any) {
    const txItems = (transactions || []).map((tx: any) => ({
        ts: tx?.created_at ? new Date(tx.created_at).getTime() : 0,
        type: tx?.type || 'transaction',
        label: tx?.description || String(tx?.type || 'Transaction'),
        amount: Number(tx?.amount || 0) / 1_000_000,
        channel: 'ecbt',
        status: Number(tx?.amount || 0) >= 0 ? 'credit' : 'debit'
    }));
    const creditItems = (credits || []).map((item: any) => {
        const tsRaw = item?.tradedAt || item?.listedAt || item?.retiredAt || item?.createdAt || item?.updated_at || null;
        const status = String(item?.status || 'held');
        return {
            ts: tsRaw ? new Date(tsRaw).getTime() : 0,
            type: 'eic',
            label: `EIC ${Number(item?.amount || 0).toFixed(2)} (${status})`,
            amount: Number(item?.amount || 0),
            channel: 'eic',
            status,
        };
    });
    return [...txItems, ...creditItems]
        .filter((x: any) => Number.isFinite(x.ts) && x.ts > 0)
        .sort((a: any, b: any) => b.ts - a.ts)
        .slice(0, 12);
}
function _renderRecentItem(item: any) {
    const when = _relativeDate(item.ts);
    const amount = item.channel === 'ecbt'
        ? `${item.amount >= 0 ? '+' : ''}${item.amount.toFixed(2)} ECBT`
        : `${item.amount.toFixed(2)} EIC`;
    return `
        <li class="credits-hub-recent-item">
            <div>
                <div class="credits-hub-recent-title">${escapeHtml(item.label)}</div>
                <div class="credits-hub-recent-meta">${escapeHtml(item.channel.toUpperCase())} • ${escapeHtml(when)}</div>
            </div>
            <div class="credits-hub-recent-amount">${escapeHtml(amount)}</div>
        </li>
    `;
}
function _headerHtml() {
    return `
        <header class="credits-hub-header">
            <h2>${escapeHtml('Creditos')}</h2>
            <div class="credits-hub-header-actions">
                <button class="credits-hub-btn-icon" id="credits-hub-refresh-btn" aria-label="${escapeHtml(t('refresh') || 'Atualizar')}">&#x21bb;</button>
                <button class="credits-hub-btn-icon" id="credits-hub-close-btn" aria-label="${escapeHtml(t('close') || 'Fechar')}">&#10005;</button>
            </div>
        </header>
    `;
}
function _bindQuickActions() {
    const topup = document.getElementById('credits-action-topup');
    if (topup) {
        topup.addEventListener('click', () => {
            _emitTelemetry('click', 'credits_quick_action_click', { action: 'topup' });
            closeCreditsHub();
            if (typeof window.handleTopUp === 'function')
                window.handleTopUp();
        });
    }
    const portfolio = document.getElementById('credits-action-portfolio');
    if (portfolio) {
        portfolio.addEventListener('click', async () => {
            _emitTelemetry('click', 'credits_quick_action_click', { action: 'portfolio' });
            closeCreditsHub();
            if (typeof window.handleOpenLibraryManager === 'function')
                window.handleOpenLibraryManager();
            if (typeof window.handleLibraryTabSwitch === 'function')
                await window.handleLibraryTabSwitch('credits');
        });
    }
    const offers = document.getElementById('credits-action-offers');
    if (offers) {
        offers.addEventListener('click', async () => {
            _emitTelemetry('click', 'credits_quick_action_click', { action: 'offers' });
            closeCreditsHub();
            if (typeof window.handleOpenLibraryManager === 'function')
                window.handleOpenLibraryManager();
            if (typeof window.handleLibraryTabSwitch === 'function')
                await window.handleLibraryTabSwitch('buy');
            const category = document.getElementById('market-filter-category') as any;
            if (category)
                category.value = 'credit';
            if (typeof window.handleMarketSearch === 'function')
                await window.handleMarketSearch(true);
        });
    }
}
function _bindStaticActions() {
    const refreshBtn = document.getElementById('credits-hub-refresh-btn');
    if (refreshBtn)
        refreshBtn.addEventListener('click', () => refreshCreditsHub());
    const closeBtn = document.getElementById('credits-hub-close-btn');
    if (closeBtn)
        closeBtn.addEventListener('click', () => closeCreditsHub());
}
function _ensureDom() {
    _ensureStyles();
    if (_overlay && document.body.contains(_overlay))
        return;
    const overlay = document.createElement('div');
    overlay.id = 'credits-hub-overlay';
    overlay.className = 'credits-hub-overlay';
    overlay.innerHTML = `
        <section id="credits-hub-panel" class="credits-hub-panel" role="dialog" aria-modal="true" aria-labelledby="credits-hub-title"></section>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (ev) => {
        if (ev.target === overlay)
            closeCreditsHub();
    });
    _overlay = overlay;
    _panel = overlay.querySelector('#credits-hub-panel');
    document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && _isOpen)
            closeCreditsHub();
    });
}
function _ensureStyles() {
    const id = 'credits-hub-style-link';
    if (document.getElementById(id))
        return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = './css/credits-hub.css';
    document.head.appendChild(link);
}
function _relativeDate(ts: any) {
    if (!ts || !Number.isFinite(ts))
        return '';
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1)
        return t('wallet.justNow') || 'agora';
    if (mins < 60)
        return `${mins}min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24)
        return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30)
        return `${days}d`;
    return new Date(ts).toLocaleDateString();
}
function _round2(v: any) {
    return Math.round((Number(v) || 0) * 100) / 100;
}
function _emitTelemetry(eventType: any, target: any, metadata: any) {
    import('../telemetry/tracker.js' as string)
        .then(({ trackEvent }) => trackEvent(eventType, target, metadata || {}))
        .catch((err) => {
        log.debug?.('Telemetry skipped', err?.message || 'telemetry_unavailable');
    });
}
