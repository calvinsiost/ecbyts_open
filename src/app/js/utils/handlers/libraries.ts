// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
// Libraries handler V2: Marketplace-first UX with buy/sell journeys.
import * as libraryManagerModule from '../libraries/manager.js';
import * as marketplaceModule from '../libraries/marketplace.js';
import * as supabaseMarketplaceModule from '../libraries/supabaseMarketplace.js';
import { openModal, closeModal, buildModalShell } from '../ui/modals.js';
import { LIBRARY_CATEGORIES, isCategoryActive, setActivationState } from '../../config/libraryCategories.js';
import { showToast } from '../ui/toast.js';
import { openIpNoticeModal } from '../ui/ipNoticeModal.js';
import { asyncPrompt } from '../ui/asyncDialogs.js';
import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';
import { getIcon } from '../ui/icons.js';
import * as authSessionModule from '../auth/session.js';
import * as contractManagerModule from '../governance/contractManager.js';
import * as marketV2ClientModule from '../libraries/marketV2Client.js';
import * as marketV2RulesModule from '../libraries/marketV2Rules.js';
import * as notificationsManagerModule from '../../core/notifications/manager.js';
import { createLogger } from '../helpers/logger.js';
import { formatBytes as _formatBytesCanonical } from '../helpers/formatBytes.js';
import { CONFIG } from '../../config.js';
import * as snapshotEngineModule from '../../core/purpose/snapshotEngine.js';
import * as enrichmentSchemaModule from '../../core/catalog/enrichmentSchema.js';
import * as creditEngineModule from '../../core/credits/creditEngine.js';
import * as creditBinderModule from '../../core/credits/creditBinder.js';
import * as profSvcModule from '../libraries/professionalServices.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
import {
    summarizeEicPortfolio,
    eicVerificationLabel,
    eicValidityLabel,
    isBronzeCredit,
    eicClassMeaning,
    scopeKey,
    scopeLabel,
    parseScopeKey,
} from './_librariesEicScopePure.js';
import {
    normalizeListingPreview,
    marketPreviewKind,
    marketImagePreviewSrc,
} from './_librariesPreviewPure.js';
const log = createLogger('Libraries');
/** @typedef {Record<string, any>} any */
const window = globalThis.window;
const document = globalThis.document;
const localStorage = globalThis.localStorage;
const navigator = globalThis.navigator;
const Blob = globalThis.Blob;
const URL = globalThis.URL;
const { installLibrary, uninstallLibrary, activateLibrary, deactivateLibrary, getInstalledLibraries, getLibraryById, rateLibrary, } = libraryManagerModule;
const { getLibraryDetails, getMarketplaceCatalog } = marketplaceModule;
const { downloadLibraryManifest, verifyPurchases } = supabaseMarketplaceModule;
const { getAccessToken, getCurrentUser, getSupabaseClient, isLoggedIn } = authSessionModule;
const { getInsuranceCatalog, calculatePremium, getContracts } = contractManagerModule;
const { createListingDraft, recordListingConsent, publishListing, searchListings, buyListing, createRfqThread, submitOrderReview, fetchNotifications, markNotificationRead, fetchMarketDashboard, fetchAdminModerationQueue, moderateListing, fetchAdminDisputesQueue, resolveDispute, fetchWebhookDlq, replayWebhook, renewListing, fetchInstitutions, suggestInstitution, setListingAccess, fetchCreditPortfolio, fetchCreditById, searchCredits, generateCredits, retireCredits, markCreditListed, } = marketV2ClientModule;
const { calculateSplit, validateCreditSplit, validateInstitutionSplit, validatePayloadLimits, classifyEicQuality } = marketV2RulesModule;
const { createNotification } = notificationsManagerModule;
const { computeDelta } = snapshotEngineModule;
const { normalizeLibraryVersionModerationQueue } = enrichmentSchemaModule;
const { computeGrossEic, computeDeficitState, validateCreditSplit: validateCreditSplitCore } = creditEngineModule;
const { buildCreditBindingTriple } = creditBinderModule;
let _requestUIRefresh: any = null;
export function setLibrariesUpdateAllUI( fn: any) {
    _requestUIRefresh = fn;
}
function requestLibrariesUIRefresh(reason = 'libraries.changed') {
    if (!_requestUIRefresh)
        return;
    _requestUIRefresh(UI_INVALIDATION_DOMAINS.LIBRARIES, reason);
}
const PREFS_KEY = 'ecbyts-market-v2-prefs';
const WIZARD_DONE_KEY = 'ecbyts-market-v2-wizard-done';
const EIC_LOCAL_KEY = 'ecbyts-market-v2-eic-local';
const CONSENT_TEXT = 'Declaro que os dados enviados respeitam direitos de uso, compliance e podem ser negociados conforme regras da plataforma.';
const MARKET_REVIEW_SUBMITTED_EVENT = 'ecbyts:market-review-submitted';
// ARCH-MONO-001 Phase 7a: market data → ./librariesMarketData.js
import * as librariesMarketDataModule from './librariesMarketData.js';
const { MARKET_MESSAGE_MAP, MARKET_CATEGORY_OPTIONS, MARKET_MODE_OPTIONS, MARKET_VISIBILITY_LABELS } = librariesMarketDataModule;
function marketMessage( message: any, fallback: any = 'Nao foi possivel concluir a acao agora.') {
    const raw = String(message || '').trim();
    const normalized = raw.replace(/^Error:\s*/i, '');
    if (!normalized)
        return fallback;
    const key = normalized.replace(/\s+/g, '_');
    return (MARKET_MESSAGE_MAP as any)[key] || (MARKET_MESSAGE_MAP as any)[normalized] || normalized;
}
function emitMarketReviewSubmitted( detail: any) {
    window.dispatchEvent(new CustomEvent(MARKET_REVIEW_SUBMITTED_EVENT, {
        detail: {
            contract_version: 1,
            event_key: 'market.review.submitted',
            ...detail,
        },
    }));
}
const state: any = {
    tab: 'home',
    loading: false,
    search: {
        q: '',
        category: '',
        currency: 'BRL',
        mode: '',
        min_price_cents: '',
        max_price_cents: '',
        seller_min_score: '',
        page_size: 12,
    },
    searchItems: [],
    searchNextCursor: null,
    searchHasMore: false,
    wizard: {
        step: 1,
        profile: 'comprador-vendedor',
        categories: 'project,waste',
        currency: 'BRL',
        region: 'BR',
        notifications: 'in_app',
    },
    sell: freshSellDraft(),
    dashboard: null,
    notifications: [],
    notificationsNextCursor: null,
    admin: {
        moderation: [],
        versionModeration: [],
        disputes: [],
        webhooks: [],
    },
    institutions: [],
    credits: {
        loading: false,
        portfolio: [],
        selectedAgreementId: '',
        selectedScopeKey: '',
    },
};
function marketCategoryLabel( value: any) {
    const found = MARKET_CATEGORY_OPTIONS.find((item: any) => item.value === value);
    return found?.label || value || '-';
}
function marketModeLabel( value: any) {
    const found = MARKET_MODE_OPTIONS.find((item: any) => item.value === value);
    return found?.label || value || '-';
}
function marketVisibilityLabel( value: any) {
    return (MARKET_VISIBILITY_LABELS as any)[value] || value || '-';
}
function marketCategoriesSummary( rawValue: any) {
    const list = String(rawValue || '')
        .split(',')
        .map((item: any) => item.trim())
        .filter(Boolean);
    if (list.length === 0)
        return 'nao definido';
    return list.map((item: any) => marketCategoryLabel(item)).join(', ');
}
function formatShortDate( value: any) {
    if (!value)
        return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime()))
        return '-';
    return d.toLocaleDateString('pt-BR');
}
function formatBytes(bytes: any) {
    return _formatBytesCanonical(bytes, { unknownLabel: '-', maxUnit: 'MB', zeroAsUnknown: true });
}
// normalizeListingPreview / marketPreviewKind / marketImagePreviewSrc
// extraídos para _librariesPreviewPure.ts (ARCH-MONOLITH-ATOMIZATION-001) — importados acima.
/**
 * Builds the detail label list for a listing preview.
 * @param {any} kind
 * @param {string} mime
 * @param {string} sizeText
 * @returns {string[]}
 */
function _buildListingPreviewDetails( kind: any, mime: string, sizeText: string) {
    const details = [kind.label];
    if (mime)
        details.push(mime);
    if (sizeText !== '-')
        details.push(sizeText);
    return details;
}

/**
 * Renders the thumbnail portion of a listing preview.
 * @param {string} src
 * @param {string} title
 * @param {any} kind
 * @returns {string}
 */
function _renderPreviewThumb( src: string, title: string, kind: any) {
    if (src) {
        return `<img src="${escapeHtml(src)}" alt="${escapeHtml(title)}" loading="eager" decoding="async" referrerpolicy="no-referrer">`;
    }
    return getIcon(kind.icon, { size: '18px' });
}

/**
 * Renders the info text block for a listing preview.
 * @param {string} title
 * @param {string[]} details
 * @param {string} pathText
 * @returns {string}
 */
function _renderPreviewInfo( title: string, details: string[], pathText: string) {
    return `
        <div class="marketv2-product-preview-info">
            <strong>${escapeHtml(title)}</strong>
            <span>${escapeHtml(details.join(' • '))}</span>
            <code title="${escapeHtml(pathText)}">${escapeHtml(pathText)}</code>
        </div>
    `;
}

/**
 * Resolves the effective MIME type for a listing preview.
 * @param {any} preview
 * @returns {string}
 */
function _resolvePreviewMime(preview: any) {
    const previewMime = String(preview?.preview_file_mime || '').trim().toLowerCase();
    const mainMime = String(preview?.main_file_mime || '').trim().toLowerCase();
    return previewMime || mainMime;
}

/**
 * Resolves the effective file size for a listing preview.
 * @param {any} preview
 * @returns {number}
 */
function _resolvePreviewSize(preview: any) {
    return Number(preview?.preview_file_size_bytes || preview?.main_file_size_bytes || 0);
}

/**
 * Resolves the trimmed preview file path, if any.
 * @param {any} preview
 * @returns {string}
 */
function _resolvePreviewPath(preview: any) {
    return String(preview?.preview_file_path || '').trim();
}

/**
 * Resolves the display path text for a listing preview.
 * @param {string} path
 * @param {any} options
 * @returns {string}
 */
function _resolvePreviewPathText(path: string, options: any) {
    return path || String(options.emptyText || 'Sem preview cadastrado');
}

function renderListingPreview( preview: any, options: any = {}) {
    const title = String(options.title || 'Preview do recurso').trim();
    const mime = _resolvePreviewMime(preview);
    const size = _resolvePreviewSize(preview);
    const path = _resolvePreviewPath(preview);
    const hasAny = Boolean(path || mime || size);
    const showEmpty = Boolean(options.showEmpty);
    if (!hasAny && !showEmpty)
        return '';
    const kind = marketPreviewKind(mime, path);
    const src = marketImagePreviewSrc(path, mime);
    const sizeText = formatBytes(size);
    const pathText = _resolvePreviewPathText(path, options);
    const details = _buildListingPreviewDetails(kind, mime, sizeText);
    return `
        <div class="marketv2-product-preview">
            <div class="marketv2-product-preview-thumb ${src ? '' : 'placeholder'}">
                ${_renderPreviewThumb(src, title, kind)}
            </div>
            ${_renderPreviewInfo(title, details, pathText)}
        </div>
    `;
}
function freshSellDraft() {
    return {
        step: 1,
        listingId: null,
        eco1_key: '',
        asset_category: 'project',
        title: '',
        description: '',
        payloadText: '{\n  "summary": ""\n}',
        payload_hash: '',
        main_file_path: '',
        main_file_mime: 'application/json',
        main_file_size_bytes: '',
        preview_file_path: '',
        preview_file_mime: 'application/pdf',
        preview_file_size_bytes: '',
        checksum_sha256: '',
        mode: 'fixed',
        currency: 'BRL',
        fixed_price_cents: 1000,
        visibility: 'public',
        access_user_ids: '',
        institution_id: '',
        institution_pct: 0,
        institution_suggestion_name: '',
        institution_suggestion_url: '',
        institution_suggestion_note: '',
        consent_checked: false,
    };
}
function getPrefs() {
    try {
        return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    }
    catch (e: any) {
        console.debug('[libraries] getPrefs-parse:', e?.message || e);
        return {};
    }
}
function setPrefs( next: any) {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next || {}));
}
function wizardDone() {
    return localStorage.getItem(WIZARD_DONE_KEY) === '1';
}
function setWizardDone( done: any) {
    localStorage.setItem(WIZARD_DONE_KEY, done ? '1' : '0');
}
function getLocalEicRecords() {
    try {
        const data = JSON.parse(localStorage.getItem(EIC_LOCAL_KEY) || '[]');
        return Array.isArray(data) ? data : [];
    }
    catch (e: any) {
        console.debug('[libraries] getLocalEicRecords-parse:', e?.message || e);
        return [];
    }
}
function setLocalEicRecords( items: any) {
    localStorage.setItem(EIC_LOCAL_KEY, JSON.stringify(Array.isArray(items) ? items : []));
}
// summarizeEicPortfolio / eicVerificationLabel / eicValidityLabel /
// isBronzeCredit / eicClassMeaning extraídos para _librariesEicScopePure.ts
// (ARCH-MONOLITH-ATOMIZATION-001) — importados acima.
function renderEicMeaningPanel( compact: any = false) {
    if (compact) {
        return `
            <div class="marketv2-alert" style="margin:8px 0;">
                <strong>EIC:</strong> credito nao-monetario baseado no <strong>delta positivo do EIS</strong>.
                Empresas com melhora de integridade de dados podem negociar com empresas em declinio.
            </div>
        `;
    }
    return `
        <section class="marketv2-alert" style="margin:10px 0 14px 0;">
            <h4 style="margin:0 0 6px 0;">O que significa um Credito EIC?</h4>
            <p style="margin:0 0 6px 0;">
                EIC (Environmental Integrity Credit) representa melhoria verificada na qualidade de dados ambientais.
                Nao e dinheiro: e uma unidade de compensacao de integridade.
            </p>
            <ul style="margin:0 0 0 18px;">
                <li><strong>Como nasce:</strong> delta EIS positivo (ex.: +0.66).</li>
                <li><strong>Unidade:</strong> 1 EIC = 0.10 de delta EIS.</li>
                <li><strong>Quem recebe:</strong> split contratual entre contratante e contratado.</li>
                <li><strong>Uso:</strong> listar, negociar (buy/RFQ) ou retirar (offset interno).</li>
                <li><strong>Classes:</strong> Gold/Silver listaveis; Bronze apenas uso interno.</li>
            </ul>
        </section>
    `;
}
function listCreditAgreements() {
    return getContracts().filter((c: any) => c.type === 'credit_agreement');
}
// scopeKey / scopeLabel / parseScopeKey extraídos para
// _librariesEicScopePure.ts (ARCH-MONOLITH-ATOMIZATION-001) — importados acima.
function ensureCreditSelection() {
    const agreements = listCreditAgreements();
    if (!agreements.length) {
        state.credits.selectedAgreementId = '';
        state.credits.selectedScopeKey = '';
        return;
    }
    const hasCurrent = agreements.some((a: any) => String(a.id) === String(state.credits.selectedAgreementId));
    const chosen = agreements.find((a: any) => String(a.id) === String(state.credits.selectedAgreementId)) ||
        agreements.find((a: any) => a.status === 'active') ||
        agreements[0];
    if (!hasCurrent && chosen) {
        state.credits.selectedAgreementId = String(chosen.id);
    }
    const selectedAgreement = agreements.find((a: any) => String(a.id) === String(state.credits.selectedAgreementId)) || chosen || null;
    const selectedScope = selectedAgreement?.creditTerms?.scope || { type: 'model' };
    const skey = scopeKey(selectedScope);
    if (!state.credits.selectedScopeKey)
        state.credits.selectedScopeKey = skey;
}
function modalBody() {
    return document.getElementById('library-modal-body');
}
function modalWrap( content: any) {
    return `${renderTabHeader()}<div class="marketv2-content">${content}</div>`;
}
function renderTabHeader() {
    const tabs = [
        { id: 'home', icon: 'home', label: 'Inicio' },
        { id: 'modules', icon: 'package', label: 'Módulos' },
        { id: 'buy', icon: 'shopping-bag', label: 'Comprar' },
        { id: 'sell', icon: 'upload', label: 'Vender' },
        { id: 'credits', icon: 'award', label: 'Creditos EIC' },
        { id: 'services', icon: 'clipboard', label: 'Servicos' },
        { id: 'dashboard', icon: 'bar-chart', label: 'Painel' },
        { id: 'notifications', icon: 'bell', label: 'Notificacoes' },
        { id: 'admin', icon: 'shield', label: 'Admin' },
    ];
    return `
        <div class="marketv2-tabs">
            ${tabs
        .map((tb: any) => `
                <button class="marketv2-tab ${state.tab === tb.id ? 'active' : ''}" data-cc-call-click="handleLibraryTabSwitch|s:${encodeURIComponent(`${tb.id}`)}">
                    ${getIcon(tb.icon, { size: '13px' })} ${tb.label}
                </button>
            `)
        .join('')}
        </div>
    `;
}
/**
 * Ensures institutions are loaded before rendering the sell tab.
 */
async function _ensureInstitutionsLoaded() {
    if (!state.institutions.length) {
        try {
            state.institutions = await fetchInstitutions();
        }
        catch (e: any) {
            console.debug('[libraries] fetchInstitutions:', e?.message || e);
        }
    }
}

/**
 * Loads the market dashboard into state, capturing any error.
 */
async function _loadDashboardState() {
    try {
        state.dashboard = await fetchMarketDashboard();
    }
    catch (err: any) {
        log.error('Failed to fetch market dashboard', err.message);
        state.dashboard = { error: err?.message || 'dashboard_error' };
    }
}

/**
 * Renders a simple tab whose content is synchronous.
 * @param {() => string} renderFn
 */
function _renderSimpleTab(renderFn: () => string) {
    const body = modalBody();
    if (!body)
        return;
    body.innerHTML = modalWrap(renderFn());
}

/**
 * Renders a loading placeholder, awaits an async loader, then renders the final tab.
 * @param {string} loadingMessage
 * @param {() => Promise<void>} loader
 * @param {() => string} renderFn
 */
async function _renderAsyncTab(loadingMessage: string, loader: () => Promise<void>, renderFn: () => string) {
    const body = modalBody();
    if (!body)
        return;
    body.innerHTML = modalWrap(`<div class="marketv2-loading">${loadingMessage}</div>`);
    await loader();
    body.innerHTML = modalWrap(renderFn());
}

async function rerender() {
    const body = modalBody();
    if (!body)
        return;
    const tab = state.tab;
    if (tab === 'modules') {
        await renderModulesTab();
        return;
    }
    if (tab === 'home') {
        _renderSimpleTab(renderHome);
        return;
    }
    if (tab === 'wizard') {
        _renderSimpleTab(renderWizard);
        return;
    }
    if (tab === 'buy') {
        _renderSimpleTab(renderBuy);
        return;
    }
    if (tab === 'sell') {
        await _ensureInstitutionsLoaded();
        _renderSimpleTab(renderSell);
        return;
    }
    if (tab === 'credits') {
        await _renderAsyncTab(t('libraries.loadingEicCredits'), loadCreditsPortfolio, renderCreditsTab);
        return;
    }
    if (tab === 'services') {
        _renderSimpleTab(renderServicesTab);
        _loadServiceProducts();
        return;
    }
    if (tab === 'dashboard') {
        await _renderAsyncTab(t('libraries.loadingDashboard'), _loadDashboardState, renderDashboard);
        return;
    }
    if (tab === 'notifications') {
        await _renderAsyncTab(t('libraries.loadingNotifications'), () => loadNotifications(true), renderNotifications);
        return;
    }
    if (tab === 'admin') {
        await _renderAsyncTab(t('libraries.loadingAdminQueues'), loadAdminQueues, renderAdmin);
        return;
    }
}
// ── Módulos - catálogo de biblioteca com compra e download ──────────────────
/**
 * Carrega e renderiza o catálogo de módulos de biblioteca disponíveis.
 * Mostra botão "Instalar" (gratuito), "Comprar" (pago + não-possuído)
 * ou "Baixar" (pago + já comprado).
 */
// Cache + filter state for the Módulos tab (avoids refetch on filter change).
let _modulesCache: any[] = [];
let _modulesOwnedIds: Set<any> = new Set();
const _modulesFilter = { q: '', kind: 'all' };

async function renderModulesTab() {
    const body = modalBody();
    if (!body)
        return;
    body.innerHTML = modalWrap(`<div class="marketv2-loading">&#8635; ${t('libraries.loadingModules')}</div>`);
    let items: any[] = [];
    let isOffline: boolean;
    try {
        const result = await getMarketplaceCatalog();
        items = result.items || [];
        isOffline = !!result.isOffline;
    }
    catch (e: any) {
        console.debug('[libraries] getMarketplaceCatalog:', e?.message || e);
        isOffline = true;
    }
    // Verificação bulk de ownership para bibliotecas pagas
    const paidItems = items.filter((it: any) => it.is_paid && it.id);
    const ownedIds = new Set();
    if (paidItems.length && isLoggedIn()) {
        try {
            const notOwned = await verifyPurchases(paidItems.map((i: any) => i.id));
            const notOwnedSet = new Set(notOwned);
            paidItems.forEach((i: any) => {
                if (!notOwnedSet.has(i.id))
                    ownedIds.add(i.id);
            });
        }
        catch (e: any) {
            console.debug('[libraries] verifyPurchases:', e?.message || e);
        }
    }
    _modulesCache = items;
    _modulesOwnedIds = ownedIds;
    const offlineBanner = isOffline
        ? '<div class="marketv2-alert">Modo offline — mostrando módulos integrados</div>'
        : '';
    body.innerHTML = modalWrap(`
        ${offlineBanner}
        ${_renderModulesFilterBar()}
        <div class="marketv2-modules-grid" id="marketv2-modules-grid"></div>
    `);
    _renderModulesGridOnly();
}

/** Filter bar (search + kind chips) for the Módulos tab. Rendered once; the grid
 *  re-renders on change so the search input keeps focus. */
function _renderModulesFilterBar() {
    const f = _modulesFilter;
    const chip = (k: string, label: string) =>
        `<button class="marketv2-filter-chip${f.kind === k ? ' active' : ''}" data-kind="${k}" data-cc-call-click="handleModulesFilterKind|s:${encodeURIComponent(`${k}`)}">${escapeHtml(label)}</button>`;
    return `
        <div class="marketv2-modules-filterbar">
            <input type="search" class="marketv2-filter-search" placeholder="Filtrar módulos..."
                   value="${escapeHtml(f.q)}" data-cc-input="cc-940817d4"
                   aria-label="Filtrar módulos" />
            <div class="marketv2-filter-chips" role="group" aria-label="Filtrar por tipo">
                ${chip('all', 'Todos')}
                ${chip('capability', 'Módulos')}
                ${chip('artifact', 'Data-packs')}
                ${chip('course', 'Cursos')}
                ${chip('installed', 'Ativos/Instalados')}
            </div>
        </div>`;
}

/**
 * Checks whether a catalog item matches the selected kind filter.
 * @param {any} item
 * @param {string} kind
 * @returns {boolean}
 */
function _matchesModuleKind(item: any, kind: string) {
    if (kind === 'capability')
        return item.kind === 'capability';
    if (kind === 'course')
        return item.kind === 'course';
    if (kind === 'artifact')
        return item.kind !== 'capability' && item.kind !== 'course';
    if (kind === 'installed')
        return _isModuleInstalled(item);
    return true;
}

/**
 * Checks whether a catalog item is considered installed/active.
 * @param {any} item
 * @returns {boolean}
 */
function _isModuleInstalled(item: any) {
    if (item.kind === 'capability')
        return isCategoryActive(item.library_id || item.id);
    return item._installed || getInstalledLibraries().some((l: any) => l.manifest?.id === item.library_id);
}

/**
 * Checks whether a catalog item matches the free-text query.
 * @param {any} item
 * @param {string} q
 * @returns {boolean}
 */
function _matchesModuleQuery(item: any, q: string) {
    if (!q)
        return true;
    const hay = `${item.name || ''} ${item.description || ''} ${item.library_id || ''}`.toLowerCase();
    return hay.includes(q);
}

/** Apply the current filter to a catalog list. */
function _filterModules(items: any[]) {
    const q = _modulesFilter.q.trim().toLowerCase();
    const kind = _modulesFilter.kind;
    return items.filter((it: any) => _matchesModuleKind(it, kind) && _matchesModuleQuery(it, q));
}

/** Re-render only the grid container (keeps the filter bar + input focus). */
function _renderModulesGridOnly() {
    const grid = document.getElementById('marketv2-modules-grid');
    if (!grid) return;
    const filtered = _filterModules(_modulesCache);
    const cards = filtered.map((item: any) => _renderModuleCard(item, _modulesOwnedIds)).join('');
    grid.innerHTML = cards || '<p class="marketv2-empty">Nenhum módulo corresponde ao filtro.</p>';
}

function handleModulesFilterKind( kind: any) {
    _modulesFilter.kind = String(kind || 'all');
    document.querySelectorAll('.marketv2-filter-chip').forEach((c: any) => {
        c.classList.toggle('active', c.getAttribute('data-kind') === _modulesFilter.kind);
    });
    _renderModulesGridOnly();
}

function handleModulesFilterSearch( value: any) {
    _modulesFilter.q = String(value == null ? '' : value);
    _renderModulesGridOnly();
}
/**
 * Renderiza card de um item do catálogo com botão de ação adequado.
 * @param {object} item - item do catálogo (campos: id, library_id, name, is_paid, price_cents…)
 * @param {Set<string>} ownedIds - UUIDs de bibliotecas já compradas pelo usuário
 * @returns {string} HTML do card
 */
/**
 * Resolves the analytics family tag from a library_id, if any.
 * @param {any} item
 * @returns {string}
 */
function _resolveAnalyticsFamilyTag(item: any) {
    if (typeof item.library_id === 'string' && item.library_id.startsWith('analytics-')) {
        return item.library_id.slice('analytics-'.length);
    }
    return '';
}

/**
 * Builds the "Executar" analytics button for a module card.
 * @param {any} item
 * @returns {string}
 */
function _renderAnalyticsRunBtn(item: any) {
    const familyTag = _resolveAnalyticsFamilyTag(item);
    if (!familyTag)
        return '';
    return ` <button class="marketv2-primary" data-cc-call-click="handleRunAnalyticsFamily|s:${encodeURIComponent(`${escapeHtml(familyTag)}`)}">&#9654; Executar</button>`;
}

/**
 * Builds the main action button for a non-capability, non-course module card.
 * @param {any} item
 * @param {boolean} installed
 * @param {boolean} isPaid
 * @param {boolean} owned
 * @param {string} runBtn
 * @returns {string}
 */
function _renderModuleActionBtn(item: any, installed: boolean, isPaid: boolean, owned: boolean, runBtn: string) {
    if (installed) {
        return `<button class="marketv2-ghost" data-cc-call-click="handleUninstallLibrary|s:${encodeURIComponent(`${escapeHtml(item.library_id)}`)}">Remover</button>${runBtn}`;
    }
    if (!isPaid) {
        return `<button class="marketv2-primary" data-cc-call-click="handleInstallLibrary|s:${encodeURIComponent(`${escapeHtml(item.library_id)}`)}">&#43; Instalar</button>${runBtn}`;
    }
    if (owned) {
        return `<button class="marketv2-primary" data-cc-call-click="handleDownloadPurchasedLibrary|s:${encodeURIComponent(`${escapeHtml(item.id)}`)}|s:${encodeURIComponent(`${escapeHtml(item.library_id)}`)}">&#8659; Baixar</button>`;
    }
    const price = item.price_cents ? ` R$ ${(item.price_cents / 100).toFixed(2).replace('.', ',')}` : '';
    return `<button class="marketv2-primary" data-cc-call-click="handleBuyLibrary|s:${encodeURIComponent(`${escapeHtml(item.id)}`)}">&#128722; Comprar${escapeHtml(price)}</button>`;
}

/**
 * Builds the status badges for a module card.
 * @param {boolean} installed
 * @param {boolean} isPaid
 * @returns {string}
 */
function _renderModuleBadges(installed: boolean, isPaid: boolean) {
    const installedBadge = installed ? '<span class="marketv2-badge installed">Instalado</span>' : '';
    const paidBadge = isPaid && !installed ? '<span class="marketv2-badge paid">Pago</span>' : '';
    return `${installedBadge}${paidBadge}`;
}

/**
 * MKT-OWNER-VERIFY-001 RF-6 — aviso de proveniência no card de produto pago,
 * com link "como funciona" (abre ipNoticeModal.ts). Gate: flag
 * MARKETPLACE_OWNER_VERIFY (mesma flag do painel Minhas Obras/Obras
 * Adquiridas — RF-1/F1 já registra a licença independente da UI).
 * @param {boolean} isPaid
 * @returns {string}
 */
function _renderIpNotice(isPaid: boolean) {
    if (!isPaid || !(CONFIG as any)?.FEATURES?.MARKETPLACE_OWNER_VERIFY) return '';
    const label = t('mkt.ipNotice.card') || 'Protegido por cadeia criptográfica assinada';
    const howLabel = t('mkt.ipNotice.howLink') || t('checkout.howItWorks') || 'como funciona';
    return `
        <p class="marketv2-ip-notice">
            &#128274; ${escapeHtml(label)}
            <button type="button" class="marketv2-ip-notice-link" data-cc-call-click="handleShowIpNotice">${escapeHtml(howLabel)}</button>
        </p>
    `;
}

/**
 * Builds the rating HTML for a module card.
 * @param {any} item
 * @returns {string}
 */
function _renderModuleRating(item: any) {
    return item.avg_rating_overall ? `&#9733; ${Number(item.avg_rating_overall).toFixed(1)}` : '';
}

function _renderModuleCard( item: any, ownedIds: any) {
    // MOD-LIB-MIG-001 — capability modules (built-in features) use Open + Activate,
    // not the install/remove paradigm of data-packs. Fixes the dead-click journey.
    if (item.kind === 'capability') {
        return _renderCapabilityCard(item);
    }
    if (item.kind === 'course') {
        return _renderCourseCard(item, ownedIds);
    }
    const installed = getInstalledLibraries().some((l: any) => l.manifest?.id === item.library_id);
    const isPaid = !!(item.is_paid && item.id);
    const owned = isPaid && ownedIds.has(item.id);
    const runBtn = _renderAnalyticsRunBtn(item);
    const actionBtn = _renderModuleActionBtn(item, installed, isPaid, owned, runBtn);
    const rating = _renderModuleRating(item);
    const badges = _renderModuleBadges(installed, isPaid);
    return `
        <article class="marketv2-module-card">
            <header class="marketv2-module-header">
                <span class="marketv2-module-icon">${getIcon(item.icon || 'package', { size: '18px' })}</span>
                <div class="marketv2-module-title">
                    <strong>${escapeHtml(item.name || item.library_id)}</strong>
                    ${badges}
                </div>
            </header>
            <p class="marketv2-module-desc">${escapeHtml(item.description || '')}</p>
            ${_renderIpNotice(isPaid)}
            <footer class="marketv2-module-footer">
                <span class="marketv2-module-meta">
                    ${rating ? `<span>${rating}</span>` : ''}
                    <span>v${escapeHtml(item.version || '1.0.0')}</span>
                </span>
                ${actionBtn}
            </footer>
        </article>
    `;
}
/**
 * Card for a capability module (built-in feature migrated to first-party library).
 * MOD-LIB-MIG-001 — shows Open (routes to the feature panel) + Activate/Deactivate
 * (mirrors the Library Hub toggle), instead of install/remove.
 * @param {object} item
 * @returns {string}
 */
function _renderCapabilityCard( item: any) {
    const id = item.library_id || item.id;
    const active = isCategoryActive(id);
    const statusBadge = active
        ? '<span class="marketv2-badge installed">Ativo</span>'
        : '<span class="marketv2-badge paid">Inativo</span>';
    const kindBadge = '<span class="marketv2-badge module">Módulo</span>';
    const openBtn = `<button class="marketv2-primary" data-cc-call-click="handleOpenCapabilityModule|s:${encodeURIComponent(`${escapeHtml(id)}`)}">&#9654; Abrir</button>`;
    const toggleLabel = active ? 'Desativar' : 'Ativar';
    const toggleBtn = `<button class="marketv2-ghost" data-cc-call-click="handleToggleCapabilityModule|s:${encodeURIComponent(`${escapeHtml(id)}`)}">${toggleLabel}</button>`;
    return `
        <article class="marketv2-module-card">
            <header class="marketv2-module-header">
                <span class="marketv2-module-icon">${getIcon(item.icon || 'package', { size: '18px' })}</span>
                <div class="marketv2-module-title">
                    <strong>${escapeHtml(item.name || id)}</strong>
                    ${statusBadge}${kindBadge}
                </div>
            </header>
            <p class="marketv2-module-desc">${escapeHtml(item.description || '')}</p>
            <footer class="marketv2-module-footer">
                <span class="marketv2-module-meta"><span>v${escapeHtml(item.version || '1.0.0')}</span></span>
                ${openBtn}${toggleBtn}
            </footer>
        </article>
    `;
}

/**
 * Card for an LMS course offered in the marketplace (F6 — SPEC_TRAINING_MODULE_LMS).
 * Gratuito → "Obter curso" (matricula no LMS). Pago → "Comprar R$ X" (checkout
 * do marketplace, requer listing remoto). Sempre oferece "Abrir Treinamento".
 * @param {object} item - entrada de curso (kind 'course', trainingId, is_paid…)
 * @param {Set<string>} ownedIds
 * @returns {string}
 */
/**
 * Resolves the training id for a course catalog item.
 * @param {any} item
 * @returns {string}
 */
function _resolveCourseTrainingId(item: any) {
    if (item.trainingId)
        return item.trainingId;
    if (item.manifest?.trainingId)
        return item.manifest.trainingId;
    if (typeof item.library_id === 'string' && item.library_id.startsWith('course-')) {
        return item.library_id.slice('course-'.length);
    }
    return '';
}

/**
 * Builds the action button for a course card.
 * @param {any} item
 * @param {boolean} isPaid
 * @param {boolean} owned
 * @param {string} tidArg
 * @returns {string}
 */
function _renderCourseActionBtn(item: any, isPaid: boolean, owned: boolean, tidArg: string) {
    if (!isPaid || owned) {
        return `<button class="marketv2-primary" data-cc-call-click="handleGetCourse|${tidArg}">&#43; Obter curso</button>`;
    }
    if (item.id) {
        const price = ` R$ ${(Number(item.price_cents) / 100).toFixed(2).replace('.', ',')}`;
        return `<button class="marketv2-primary" data-cc-call-click="handleBuyLibrary|s:${encodeURIComponent(`${escapeHtml(item.id)}`)}">&#128722; Comprar${escapeHtml(price)}</button>`;
    }
    return '<button class="marketv2-ghost" disabled>Em breve</button>';
}

/**
 * Builds the "Abrir Treinamento" button when appropriate.
 * @param {boolean} isPaid
 * @param {boolean} owned
 * @param {string} tidArg
 * @returns {string}
 */
function _renderCourseOpenBtn(isPaid: boolean, owned: boolean, tidArg: string) {
    if (isPaid && !owned)
        return '';
    return `<button class="marketv2-ghost" data-cc-call-click="handleGetCourse|${tidArg}">&#9654; Abrir Treinamento</button>`;
}

/**
 * Builds the meta line for a course card.
 * @param {any} item
 * @returns {string}
 */
function _renderCourseMeta(item: any) {
    const parts = [
        item.difficulty ? escapeHtml(item.difficulty) : '',
        item.lessons_count ? `${item.lessons_count} lições` : '',
        item.estimated_hours ? `${item.estimated_hours}h` : '',
    ].filter(Boolean);
    return parts.join(' · ');
}

function _renderCourseCard( item: any, ownedIds: any) {
    const trainingId = _resolveCourseTrainingId(item);
    const isPaid = !!(item.is_paid && Number(item.price_cents) > 0);
    const owned = isPaid && item.id && ownedIds && ownedIds.has(item.id);
    const courseBadge = '<span class="marketv2-badge module">Curso</span>';
    const paidBadge = isPaid && !owned ? '<span class="marketv2-badge paid">Pago</span>' : '';
    const tidArg = `s:${encodeURIComponent(`${escapeHtml(trainingId)}`)}`;
    const actionBtn = _renderCourseActionBtn(item, isPaid, owned, tidArg);
    const openBtn = _renderCourseOpenBtn(isPaid, owned, tidArg);
    const meta = _renderCourseMeta(item);
    return `
        <article class="marketv2-module-card">
            <header class="marketv2-module-header">
                <span class="marketv2-module-icon">${getIcon(item.icon || 'book-open', { size: '18px' })}</span>
                <div class="marketv2-module-title">
                    <strong>${escapeHtml(item.name || trainingId)}</strong>
                    ${courseBadge}${paidBadge}
                </div>
            </header>
            <p class="marketv2-module-desc">${escapeHtml(item.description || '')}</p>
            ${_renderIpNotice(isPaid)}
            <footer class="marketv2-module-footer">
                <span class="marketv2-module-meta">${meta ? `<span>${meta}</span>` : ''}<span>v${escapeHtml(item.version || '1.0.0')}</span></span>
                ${actionBtn}${openBtn}
            </footer>
        </article>
    `;
}

/**
 * "Obter curso" do marketplace → matricula o usuário no curso LMS e abre o
 * módulo de Treinamento na aba "Meus Cursos". Import dinâmico para evitar
 * acoplar o handler de libraries ao bundle do LMS no load.
 * @param {string} trainingId
 */
async function handleGetCourse( trainingId: any) {
    const tid = String(trainingId || '').trim();
    if (!tid) return;
    try {
        const mod: any = await import('../ui/lmsManager.js' as string);
        if (typeof mod.grantCourseEnrollment === 'function') {
            await mod.grantCourseEnrollment(tid);
        } else if (typeof (window as any).handleOpenTraining === 'function') {
            (window as any).handleOpenTraining();
        }
    } catch (e: any) {
        console.debug('[libraries] handleGetCourse:', e?.message || e);
        (window as any).showToast?.('Não foi possível abrir o curso agora.', 'warning');
    }
}

/**
 * Open a capability module's feature panel. Routes via the registry's openHandler
 * (window.* name). Closes the Libraries modal first so the panel is visible.
 * @param {string} id
 */
function handleOpenCapabilityModule( id: any) {
    const cat = LIBRARY_CATEGORIES.find((c: any) => c.id === id && c.kind === 'capability');
    const handlerName = cat?.openHandler;
    const fn = handlerName ? (window as any)[handlerName] : null;
    if (typeof fn === 'function') {
        closeModal('library-modal');
        fn();
        return;
    }
    showToast(`Não foi possível abrir o módulo "${id}".`, 'warning');
}

/**
 * Toggle a capability module's activation (mirrors the Library Hub Add/Remove).
 * @param {string} id
 */
function handleToggleCapabilityModule( id: any) {
    const nowActive = !isCategoryActive(id);
    setActivationState(id, nowActive);
    showToast(nowActive ? `Módulo "${id}" ativado` : `Módulo "${id}" desativado`, 'success');
    _renderModulesGridOnly();
}

function renderHome() {
    const prefs = getPrefs();
    const wizardBanner = wizardDone()
        ? `<button class="marketv2-ghost" data-cc-action="cc-672020cf">Reconfigurar wizard</button>`
        : `<button class="marketv2-primary" data-cc-action="cc-672020cf">Iniciar wizard</button>`;
    return `
        <section class="marketv2-hero">
            <div class="marketv2-hero-copy">
                <h2>Marketplace Ambiental</h2>
                <p>Compre, venda e negocie projetos, residuos, creditos de carbono e ativos com chave ECBT.</p>
                <div class="marketv2-cta-row">
                    <button class="marketv2-primary" data-cc-action="cc-f4dc8260">${getIcon('shopping-bag', { size: '14px' })} Comprar</button>
                    <button class="marketv2-primary alt" data-cc-action="cc-f7f076bc">${getIcon('upload', { size: '14px' })} Vender</button>
                    ${wizardBanner}
                </div>
            </div>
            <div class="marketv2-hero-metrics">
                <div><strong>Moedas aceitas</strong><span>BRL, USD, EUR</span></div>
                <div><strong>Duracao do anuncio</strong><span>90 dias + 3 renovacoes</span></div>
                <div><strong>Link de download seguro</strong><span>Valido por 15 min e ate 3 downloads</span></div>
            </div>
        </section>

        <section class="marketv2-prefbar">
            <strong>Preferencias atuais:</strong>
            <span>Perfil: ${escapeHtml(prefs.profile || 'nao definido')}</span>
            <span>Categorias: ${escapeHtml(marketCategoriesSummary(prefs.categories || ''))}</span>
            <span>Moeda: ${escapeHtml(prefs.currency || 'BRL')}</span>
            <span>Regiao: ${escapeHtml(prefs.region || 'BR')}</span>
        </section>

        <section class="marketv2-cards">
            <article>
                <h3>${getIcon('target', { size: '14px' })} Jornada de compra</h3>
                <p>Filtros salvos, proposta e contraproposta, e fechamento da compra em um fluxo simples.</p>
                <button class="marketv2-ghost" data-cc-action="cc-f4dc8260">Abrir busca</button>
            </article>
            <article>
                <h3>${getIcon('trending-up', { size: '14px' })} Jornada de venda</h3>
                <p>Cadastro guiado em 7 passos com consentimento e apoio opcional para instituicoes.</p>
                <button class="marketv2-ghost" data-cc-action="cc-f7f076bc">Criar anuncio</button>
            </article>
            <article>
                <h3>${getIcon('trophy', { size: '14px' })} Reputacao e conquistas</h3>
                <p>Reputacao atualizada com o tempo, metas semanais e conquistas para destacar bons vendedores.</p>
                <button class="marketv2-ghost" data-cc-action="cc-51eadbcc">Ver reputacao</button>
            </article>
            <article>
                <h3>${getIcon('users', { size: '14px' })} ${escapeHtml(t('profSvc.title') || 'Servicos profissionais')}</h3>
                <p>${escapeHtml(t('profSvc.cardDesc') || 'Contrate horas de profissionais Junior, Pleno ou Senior por RFQ.')}</p>
                <button class="marketv2-ghost" data-cc-action="cc-79fcba2b">${escapeHtml(t('profSvc.open') || 'Abrir servicos')}</button>
            </article>
        </section>
    `;
}
function renderWizard() {
    const s = state.wizard;
    const step = s.step;
    return `
        <section class="marketv2-wizard">
            <header>
                <h3>Wizard inicial (${step}/4)</h3>
                <p>Defina interesses para acelerar compra e venda.</p>
            </header>
            ${step === 1
        ? `
                <div class="marketv2-form-grid">
                    <label>Perfil
                        <select data-field-meta="true" data-field-meta-key="auto:wizard-profile" id="wizard-profile">
                            <option value="comprador-vendedor" ${s.profile === 'comprador-vendedor' ? 'selected' : ''}>Comprador + Vendedor</option>
                            <option value="comprador" ${s.profile === 'comprador' ? 'selected' : ''}>Somente comprador</option>
                            <option value="vendedor" ${s.profile === 'vendedor' ? 'selected' : ''}>Somente vendedor</option>
                        </select>
                    </label>
                </div>
            `
        : ''}
            ${step === 2
        ? `
                <div class="marketv2-form-grid">
                    <label>Categorias (csv)
                        <input data-field-meta="true" data-field-meta-key="auto:wizard-categories" id="wizard-categories" value="${escapeHtml(s.categories)}" placeholder="project,waste,carbon_credit">
                    </label>
                </div>
            `
        : ''}
            ${step === 3
        ? `
                <div class="marketv2-form-grid">
                    <label>Regiao
                        <input data-field-meta="true" data-field-meta-key="auto:wizard-region" id="wizard-region" value="${escapeHtml(s.region)}" placeholder="BR">
                    </label>
                    <label>Moeda
                        <select data-field-meta="true" data-field-meta-key="auto:wizard-currency" id="wizard-currency">
                            ${['BRL', 'USD', 'EUR'].map((c: any) => `<option value="${c}" ${s.currency === c ? 'selected' : ''}>${c}</option>`).join('')}
                        </select>
                    </label>
                </div>
            `
        : ''}
            ${step === 4
        ? `
                <div class="marketv2-form-grid">
                    <label>Notificacoes
                        <select data-field-meta="true" data-field-meta-key="auto:wizard-notifications" id="wizard-notifications">
                            <option value="in_app" ${s.notifications === 'in_app' ? 'selected' : ''}>In-app</option>
                            <option value="in_app_email" ${s.notifications === 'in_app_email' ? 'selected' : ''}>In-app + Email</option>
                            <option value="email" ${s.notifications === 'email' ? 'selected' : ''}>Email</option>
                        </select>
                    </label>
                </div>
            `
        : ''}

            <footer class="marketv2-stepper-actions">
                <button class="marketv2-ghost" data-cc-action="cc-5f965218" ${step === 1 ? 'disabled' : ''}>Voltar</button>
                ${step < 4
        ? `<button class="marketv2-primary" data-cc-action="cc-03ea239e">Proximo</button>`
        : `<button class="marketv2-primary" data-cc-action="cc-5b19de8c">Concluir</button>`}
            </footer>
        </section>
    `;
}
async function loadCreditsPortfolio() {
    state.credits.loading = true;
    try {
        const remote = await fetchCreditPortfolio();
        state.credits.portfolio = Array.isArray(remote?.items) ? remote.items : [];
    }
    catch (e: any) {
        console.debug('[libraries] fetchCreditPortfolio:', e?.message || e);
        state.credits.portfolio = getLocalEicRecords();
    }
    finally {
        state.credits.loading = false;
    }
}
/**
 * Builds the agreement <option> list for the EIC credits tab.
 * @param {any[]} agreements
 * @param {string} selectedId
 * @returns {string}
 */
function _renderAgreementOptions(agreements: any[], selectedId: string) {
    if (!agreements.length)
        return '<option value="">Sem credit_agreement</option>';
    return agreements
        .map((a: any) => `<option value="${escapeHtml(String(a.id))}" ${String(a.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(a.name || a.id)}</option>`)
        .join('');
}

/**
 * Builds the scope <option> for the EIC credits tab.
 * @param {any|null} selectedAgreement
 * @param {any} selectedScope
 * @param {string} selectedScopeKey
 * @returns {string}
 */
function _renderScopeOption(selectedAgreement: any, selectedScope: any, selectedScopeKey: string) {
    if (!selectedAgreement)
        return '<option value="">Sem escopo</option>';
    const skey = scopeKey(selectedScope);
    return `<option value="${escapeHtml(skey)}" ${skey === String(selectedScopeKey) ? 'selected' : ''}>${escapeHtml(scopeLabel(selectedScope))}</option>`;
}

/**
 * Builds the agreement split detail line for the EIC credits tab.
 * @param {any|null} selectedAgreement
 * @returns {string}
 */
function _renderAgreementDetail(selectedAgreement: any) {
    if (!selectedAgreement)
        return `<p style="margin-top:6px;font-size:12px;opacity:0.85;">${escapeHtml(marketMessage('credit_agreement_required'))}</p>`;
    const split = selectedAgreement?.creditTerms?.creditSplit || {};
    return `<p style="margin-top:6px;font-size:12px;opacity:0.85;">Split contratual: ${escapeHtml(String(split.contractor || 0))}% contratante / ${escapeHtml(String(split.contracted || 0))}% contratado</p>`;
}

/**
 * Builds the EIC metrics boxes (Held/Listed/Retired).
 * @param {any} summary
 * @returns {string}
 */
function _renderCreditsMetrics(summary: any) {
    return `
        <div class="marketv2-hero-metrics">
            <div><strong>Held</strong><span>${summary.held.toFixed(2)} EIC</span></div>
            <div><strong>Listed</strong><span>${summary.listed.toFixed(2)} EIC</span></div>
            <div><strong>Retired</strong><span>${summary.retired.toFixed(2)} EIC</span></div>
        </div>`;
}

/**
 * Builds the portfolio section for the EIC credits tab.
 * @param {any[]} items
 * @returns {string}
 */
function _renderPortfolioSection(items: any[]) {
    const body = items.length
        ? items.map((item: any) => renderEicPortfolioCard(item)).join('')
        : '<p class="marketv2-empty">Sem creditos ainda. Use "Gerar creditos".</p>';
    return `<section class="marketv2-results"><h3>Meu portfolio</h3>${body}</section>`;
}

/**
 * Builds the marketplace offers section for the EIC credits tab.
 * @param {any[]} marketCredits
 * @returns {string}
 */
function _renderMarketCreditsSection(marketCredits: any[]) {
    const body = marketCredits.length
        ? marketCredits.map((item: any) => renderListingCard(item)).join('')
        : '<p class="marketv2-empty">Nenhuma oferta EIC carregada. Use a aba Comprar com categoria "Creditos EIC".</p>';
    return `<section class="marketv2-results"><h3>Ofertas EIC no Marketplace</h3>${body}</section>`;
}

function renderCreditsTab() {
    ensureCreditSelection();
    const agreements = listCreditAgreements();
    const selectedAgreement = agreements.find((a: any) => String(a.id) === String(state.credits.selectedAgreementId)) || null;
    const selectedScope = selectedAgreement?.creditTerms?.scope || { type: 'model' };
    const items = state.credits.portfolio || [];
    const summary = summarizeEicPortfolio(items);
    const marketCredits = (state.searchItems || []).filter((item: any) => String(item?.asset_category || '') === 'credit');
    const agreementOptions = _renderAgreementOptions(agreements, state.credits.selectedAgreementId);
    const scopeOption = _renderScopeOption(selectedAgreement, selectedScope, state.credits.selectedScopeKey);
    const agreementDetail = _renderAgreementDetail(selectedAgreement);
    const metrics = _renderCreditsMetrics(summary);
    return `
        <section class="marketv2-hero">
            <div class="marketv2-hero-copy">
                <h2>Creditos EIC</h2>
                <p>Saldo em carteira, ofertas no marketplace e trilha de proveniencia.</p>
                <div class="marketv2-form-grid" style="margin-top:10px;">
                    <label>Contrato EIC
                        <select data-field-meta="true" data-field-meta-key="auto:eic-agreement-select" id="eic-agreement-select" data-cc-change="cc-69827971">
                            ${agreementOptions}
                        </select>
                    </label>
                    <label>Escopo
                        <select data-field-meta="true" data-field-meta-key="auto:eic-scope-select" id="eic-scope-select" data-cc-change="cc-8215ca71">
                            ${scopeOption}
                        </select>
                    </label>
                </div>
                ${agreementDetail}
                <div class="marketv2-cta-row">
                    <button class="marketv2-primary" data-cc-action="cc-f4843b0e" ${selectedAgreement ? '' : 'disabled'}>${getIcon('plus', { size: '14px' })} Gerar creditos</button>
                    <button class="marketv2-ghost" data-cc-action="cc-f4dc8260">${getIcon('shopping-bag', { size: '14px' })} Buscar ofertas</button>
                </div>
            </div>
            ${metrics}
        </section>
        ${renderEicMeaningPanel(false)}
        ${_renderPortfolioSection(items)}
        ${_renderMarketCreditsSection(marketCredits)}
    `;
}
/**
 * Resolves the split text for an EIC portfolio card.
 * @param {any} allocation
 * @returns {string}
 */
function _resolveEicSplitText(allocation: any) {
    if (!allocation || !Number.isFinite(Number(allocation.contractorEic)))
        return 'Split: -';
    const ctr = Number(allocation.contractorEic).toFixed(2);
    const ctd = Number(allocation.contractedEic || 0).toFixed(2);
    return `Split Ctr/Ctd: ${ctr}/${ctd}`;
}

/**
 * Resolves the delta EIS text for an EIC portfolio card.
 * @param {any} item
 * @returns {string}
 */
function _resolveEicDeltaText(item: any) {
    const raw = Number(item?.deltaEis);
    return Number.isFinite(raw) ? raw.toFixed(2) : '-';
}

/**
 * Resolves a string display field with a fallback.
 * @param {any} value
 * @param {string} fallback
 * @returns {string}
 */
function _fallbackString(value: any, fallback: string) {
    return value ? String(value) : fallback;
}

/**
 * Computes the display fields for an EIC portfolio card.
 * @param {any} item
 * @returns {any}
 */
function _computeEicPortfolioFields(item: any) {
    const status = _fallbackString(item?.status, 'held');
    const quality = _fallbackString(item?.quality_class || item?.qualityClass, 'EIC-Silver');
    const canList = status === 'held' && !isBronzeCredit(item);
    return {
        amount: Number(item?.amount || 0).toFixed(2),
        status,
        scope: _fallbackString(item?.scope_label || item?.scopeHash, '-'),
        origin: _fallbackString(item?.origin_label || item?.modelId, '-'),
        quality,
        verification: eicVerificationLabel(item),
        validity: eicValidityLabel(item, formatShortDate),
        canRetire: status !== 'retired',
        canList,
        safeId: escapeHtml(_fallbackString(item.id, '')),
        splitTxt: _resolveEicSplitText(item?.allocation),
        deltaTxt: _resolveEicDeltaText(item),
        classMeaning: eicClassMeaning(quality),
    };
}

/**
 * Builds the meta rows for an EIC portfolio card.
 * @param {any} fields
 * @returns {string}
 */
function _renderEicPortfolioMeta(fields: any) {
    const rows = [
        { icon: 'map-pinned', label: 'Escopo', value: fields.scope },
        { icon: 'building', label: 'Origem', value: fields.origin },
        { icon: 'award', label: 'Classe', value: fields.quality },
        { icon: 'shield-check', label: 'Verificacao', value: fields.verification },
        { icon: 'calendar', label: 'Validade', value: fields.validity },
        { icon: 'trending-up', label: 'Delta EIS', value: fields.deltaTxt },
        { icon: 'scale', label: '', value: fields.splitTxt },
    ];
    return rows
        .map((r: any) => `<span>${getIcon(r.icon, { size: '12px' })} ${r.label ? `${r.label}: ` : ''}${escapeHtml(r.value)}</span>`)
        .join('');
}

/**
 * Builds the action buttons for an EIC portfolio card.
 * @param {any} fields
 * @returns {string}
 */
function _renderEicPortfolioActions(fields: any) {
    const safeId = encodeURIComponent(`${fields.safeId}`);
    const retireBtn = fields.canRetire
        ? `<button class="marketv2-ghost" data-cc-call-click="handleRetireLocalEic|s:${safeId}">Retirar</button>`
        : '';
    const listBtn = fields.canList
        ? `<button class="marketv2-primary" data-cc-call-click="handlePrepareCreditListing|s:${safeId}">Listar no marketplace</button>`
        : '';
    const provenanceBtn = `<button class="marketv2-ghost" data-cc-call-click="handleOpenEicProvenance|s:${safeId}">Proveniencia</button>`;
    return `${retireBtn}${listBtn}${provenanceBtn}`;
}

function renderEicPortfolioCard( item: any) {
    const f = _computeEicPortfolioFields(item);
    return `
        <article class="marketv2-card">
            <header>
                <h4>${f.amount} EIC</h4>
                <span class="marketv2-pill">${escapeHtml(f.status)}</span>
            </header>
            <div class="marketv2-meta">
                ${_renderEicPortfolioMeta(f)}
            </div>
            <p style="margin-top:6px;opacity:0.85;">${escapeHtml(f.classMeaning)}</p>
            <footer>
                ${_renderEicPortfolioActions(f)}
            </footer>
        </article>
    `;
}
function renderBuy() {
    return `
        <section class="marketv2-filters">
            <label>Busca<input data-field-meta="true" data-field-meta-key="auto-pos:libraries:input:L950" id="market-filter-q" value="${escapeHtml(state.search.q)}" placeholder="${t('libraries.searchPlaceholder')}"></label>
            <label>Categoria
                <select data-field-meta="true" data-field-meta-key="auto-pos:libraries:select:L952" id="market-filter-category">
                    <option value="">Todas</option>
                    ${MARKET_CATEGORY_OPTIONS.map((c: any) => `<option value="${c.value}" ${state.search.category === c.value ? 'selected' : ''}>${c.label}</option>`).join('')}
                </select>
            </label>
            <label>Tipo de negociacao
                <select data-field-meta="true" data-field-meta-key="auto-pos:libraries:select:L961" id="market-filter-mode">
                    <option value="">Todos</option>
                    ${MARKET_MODE_OPTIONS.map((m: any) => `<option value="${m.value}" ${state.search.mode === m.value ? 'selected' : ''}>${m.label}</option>`).join('')}
                </select>
            </label>
            <label>Moeda
                <select data-field-meta="true" data-field-meta-key="auto-pos:libraries:select:L967" id="market-filter-currency">
                    ${['BRL', 'USD', 'EUR'].map((c: any) => `<option value="${c}" ${state.search.currency === c ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
            </label>
            <label>Preco minimo (em centavos)<input data-field-meta="true" data-field-meta-key="auto-pos:libraries:input:L971" id="market-filter-min" type="number" value="${escapeHtml(String(state.search.min_price_cents || ''))}"></label>
            <label>Preco maximo (em centavos)<input data-field-meta="true" data-field-meta-key="auto-pos:libraries:input:L972" id="market-filter-max" type="number" value="${escapeHtml(String(state.search.max_price_cents || ''))}"></label>
            <label>Reputacao minima do vendedor<input data-field-meta="true" data-field-meta-key="auto-pos:libraries:input:L973" id="market-filter-score" type="number" min="0" max="100" value="${escapeHtml(String(state.search.seller_min_score || ''))}"></label>
            <div class="marketv2-filter-actions">
                <button class="marketv2-primary" data-cc-action="cc-4f9516ec">${getIcon('search', { size: '13px' })} Buscar</button>
                <button class="marketv2-ghost" data-cc-action="cc-46cdeefe">Resetar</button>
            </div>
        </section>
        ${state.search.category === 'credit' ? renderEicMeaningPanel(true) : ''}

        <section id="market-results" class="marketv2-results">
            ${state.searchItems.length === 0
        ? '<p class="marketv2-empty">Nenhum resultado ainda. Clique em Buscar.</p>'
        : state.searchItems.map((item: any) => renderListingCard(item)).join('')}
        </section>

        ${state.searchHasMore ? `<div class="marketv2-load-more"><button class="marketv2-ghost" data-cc-action="cc-f426bd8b">Carregar mais</button></div>` : ''}
    `;
}
/**
 * Builds the meta row HTML for a standard marketplace listing card.
 * @param {any} item
 * @param {any} rep
 * @param {number} fixedPrice
 * @returns {string}
 */
function _renderListingMeta(item: any, rep: any, fixedPrice: number) {
    return `
        <div class="marketv2-meta">
            <span>${getIcon('key-round', { size: '12px' })} ECBT: ${escapeHtml(item.eco1_key || '-')}</span>
            <span>${getIcon('coins', { size: '12px' })} ${escapeHtml(item.currency || 'BRL')} ${fixedPrice / 100}</span>
            <span>${getIcon('lock', { size: '12px' })} ${marketVisibilityLabel(item.visibility)}</span>
            <span>${getIcon('award', { size: '12px' })} Reputacao ${Number(rep.score || 50).toFixed(1)} (${escapeHtml(rep.level || 'Seed')})</span>
        </div>`;
}

/**
 * Builds the footer buttons for a standard marketplace listing card.
 * @param {any} item
 * @param {boolean} canBuy
 * @param {boolean} canRfq
 * @param {number} fixedPrice
 * @param {string} safeRfqCurrency
 * @returns {string}
 */
function _renderListingFooter(item: any, canBuy: boolean, canRfq: boolean, fixedPrice: number, safeRfqCurrency: string) {
    const buyBtn = canBuy
        ? `<button class="marketv2-primary" data-cc-call-click="handleMarketBuyListing|s:${encodeURIComponent(`${item.id}`)}">Comprar</button>`
        : '';
    const rfqBtn = canRfq
        ? `<button class="marketv2-ghost" data-cc-call-click="handleMarketOpenRfqPrompt|s:${encodeURIComponent(`${item.id}`)}|s:${encodeURIComponent(`${safeRfqCurrency}`)}">Pedir proposta</button>`
        : '';
    const insuranceToggle = canBuy && fixedPrice > 0
        ? `<button class="marketv2-ghost" data-cc-call-click="handleToggleInsurance|s:${encodeURIComponent(`${item.id}`)}">&#9741; ${t('insuranceOptions') || 'Insurance Options'}</button>`
        : '';
    const copyBtn = `<button class="marketv2-ghost" data-cc-call-click="handleMarketCopyListingId|s:${encodeURIComponent(`${item.id}`)}">Copiar codigo</button>`;
    return `<footer>${insuranceToggle}${buyBtn}${rfqBtn}${copyBtn}</footer>`;
}

function renderListingCard( item: any) {
    if (String(item?.asset_category || '') === 'credit') {
        return renderCreditListingCard(item);
    }
    const rep = item.seller_reputation || { score: 50, level: 'Seed' };
    const canBuy = ['fixed', 'both'].includes(item.mode);
    const canRfq = ['rfq', 'both'].includes(item.mode);
    const fixedPrice = Number(item.fixed_price_cents || 0);
    const safeRfqCurrency = escapeHtml(item.currency || 'BRL');
    const preview = normalizeListingPreview(item);
    const previewHtml = renderListingPreview(preview, { title: item.title || 'Preview do recurso' });
    const insuranceAddon = canBuy && fixedPrice > 0 ? _renderInsuranceAddon(item.id, fixedPrice, item.currency || 'BRL') : '';
    return `
        <article class="marketv2-card">
            <header>
                <h4>${escapeHtml(item.title || 'Sem titulo')}</h4>
                <span class="marketv2-pill">${escapeHtml(marketCategoryLabel(item.asset_category || 'project'))}</span>
            </header>
            ${previewHtml}
            <p>${escapeHtml(item.description || '')}</p>
            ${_renderListingMeta(item, rep, fixedPrice)}
            ${insuranceAddon}
            ${_renderListingFooter(item, canBuy, canRfq, fixedPrice, safeRfqCurrency)}
        </article>
    `;
}
/**
 * Resolves the credit amount from a credit listing item.
 * @param {any} item
 * @returns {number}
 */
function _resolveCreditAmount(item: any) {
    return Number(item?.eic_amount || item?.payload?.amount || 0);
}

/**
 * Resolves the credit quality class from a credit listing item.
 * @param {any} item
 * @returns {string}
 */
function _resolveCreditQualityClass(item: any) {
    return String(item?.eic_quality_class || item?.payload?.qualityClass || 'EIC-Silver');
}

/**
 * Resolves the credit verification method from a credit listing item.
 * @param {any} item
 * @returns {string}
 */
function _resolveCreditVerificationMethod(item: any) {
    return String(item?.eic_verification_method || item?.payload?.verificationMethod || 'automatic');
}

/**
 * Resolves the credit origin model from a credit listing item.
 * @param {any} item
 * @returns {string}
 */
function _resolveCreditOriginModel(item: any) {
    return String(item?.eic_origin_model || item?.payload?.modelId || '-');
}

/**
 * Resolves the credit scope hash from a credit listing item.
 * @param {any} item
 * @returns {string}
 */
function _resolveCreditScopeHash(item: any) {
    return String(item?.eic_scope_hash || item?.payload?.scopeHash || '-');
}

/**
 * Resolves the credit expiration date from a credit listing item.
 * @param {any} item
 * @returns {any}
 */
function _resolveCreditExpiresAt(item: any) {
    return item?.eic_expires_at || item?.payload?.expiresAt || null;
}

/**
 * Checks whether a credit listing can be bought.
 * @param {any} item
 * @param {string} qualityClass
 * @returns {boolean}
 */
function _canBuyCredit(item: any, qualityClass: string) {
    return qualityClass !== 'EIC-Bronze' && ['fixed', 'both'].includes(item.mode);
}

/**
 * Checks whether a credit listing can receive an RFQ.
 * @param {any} item
 * @param {string} qualityClass
 * @returns {boolean}
 */
function _canRfqCredit(item: any, qualityClass: string) {
    return qualityClass !== 'EIC-Bronze' && ['rfq', 'both'].includes(item.mode);
}

/**
 * Builds the meta row HTML for a credit listing card.
 * @param {any} fields
 * @returns {string}
 */
function _renderCreditListingMeta(fields: any) {
    const rep = fields.rep;
    const validity = fields.expiresAt ? formatShortDate(fields.expiresAt) : '-';
    return `
        <div class="marketv2-meta">
            <span>${getIcon('coins', { size: '12px' })} ${fields.amount.toFixed(2)} EIC</span>
            <span>${getIcon('building', { size: '12px' })} Modelo: ${escapeHtml(fields.originModel)}</span>
            <span>${getIcon('map-pinned', { size: '12px' })} Scope: ${escapeHtml(fields.scopeHash)}</span>
            <span>${getIcon('shield-check', { size: '12px' })} Verificacao: ${escapeHtml(fields.verificationMethod)}</span>
            <span>${getIcon('calendar', { size: '12px' })} Validade: ${escapeHtml(validity)}</span>
            <span>${getIcon('alert-circle', { size: '12px' })} Risco: ${escapeHtml(fields.qualityInfo.risk)}</span>
            <span>${getIcon('award', { size: '12px' })} Reputacao ${Number(rep.score || 50).toFixed(1)} (${escapeHtml(rep.level || 'Seed')})</span>
            <span>${getIcon('coins', { size: '12px' })} ${escapeHtml(fields.currency)} ${fields.fixedPrice / 100}</span>
        </div>`;
}

/**
 * Builds the footer buttons for a credit listing card.
 * @param {any} fields
 * @returns {string}
 */
function _renderCreditListingFooter(fields: any) {
    const idArg = encodeURIComponent(`${fields.itemId}`);
    const currencyArg = encodeURIComponent(`${fields.safeCreditCurrency}`);
    const buyBtn = fields.canBuy
        ? `<button class="marketv2-primary" data-cc-call-click="handleMarketBuyListing|s:${idArg}">Comprar</button>`
        : '';
    const rfqBtn = fields.canRfq
        ? `<button class="marketv2-ghost" data-cc-call-click="handleMarketOpenRfqPrompt|s:${idArg}|s:${currencyArg}">Pedir proposta</button>`
        : '';
    const bronzeBtn = !fields.canBuy && !fields.canRfq
        ? `<button class="marketv2-ghost" data-cc-call-click="showToast|s:${encodeURIComponent(`${fields.safeBronzeMsg}`)}|s:warning">${t('libraries.internalUse')}</button>`
        : '';
    const provenanceBtn = `<button class="marketv2-ghost" data-cc-call-click="handleOpenEicProvenance|s:${encodeURIComponent(`${fields.safeCreditProvId}`)}">Proveniencia</button>`;
    return `<footer>${buyBtn}${rfqBtn}${bronzeBtn}${provenanceBtn}</footer>`;
}

function renderCreditListingCard( item: any) {
    const rep = item.seller_reputation || { score: 50, level: 'Seed' };
    const qualityClass = _resolveCreditQualityClass(item);
    const verificationMethod = _resolveCreditVerificationMethod(item);
    const qualityInfo = classifyEicQuality({
        hasContract: true,
        hasAuditor: verificationMethod === 'auditor',
        verificationMethod,
        hasVetoClearance: true,
    });
    const fixedPrice = Number(item.fixed_price_cents || 0);
    const fields = {
        item,
        itemId: item.id,
        rep,
        amount: _resolveCreditAmount(item),
        qualityClass,
        verificationMethod,
        originModel: _resolveCreditOriginModel(item),
        scopeHash: _resolveCreditScopeHash(item),
        expiresAt: _resolveCreditExpiresAt(item),
        fixedPrice,
        currency: item.currency || 'BRL',
        qualityInfo,
        classMeaning: eicClassMeaning(qualityClass),
        canBuy: _canBuyCredit(item, qualityClass),
        canRfq: _canRfqCredit(item, qualityClass),
        safeCreditCurrency: escapeHtml(item.currency || 'BRL'),
        safeBronzeMsg: marketMessage('credit_bronze_not_listable'),
        safeCreditProvId: escapeHtml(String(item?.payload?.creditId || item?.id || '')),
    };
    return `
        <article class="marketv2-card">
            <header>
                <h4>${escapeHtml(item.title || 'Credito EIC')}</h4>
                <span class="marketv2-pill">${escapeHtml(qualityClass)}</span>
            </header>
            <p>${escapeHtml(item.description || '')}</p>
            <p style="margin-top:-4px;opacity:0.85;">
                <strong>Significado:</strong> melhoria verificada da integridade de dados ambientais (delta EIS positivo).
            </p>
            ${_renderCreditListingMeta(fields)}
            <p style="margin-top:6px;opacity:0.85;">${escapeHtml(fields.classMeaning)}</p>
            ${_renderCreditListingFooter(fields)}
        </article>
    `;
}
function renderSell() {
    const s = state.sell;
    const split = calculateSplit(s.fixed_price_cents, s.institution_pct || 0, 12);
    const step = s.step;
    return `
        <section class="marketv2-sell">
            <header>
                <h3>Fluxo de venda (${step}/7)</h3>
                <p>Itens com chave ECBT podem ser vendidos ou enviados para proposta.</p>
            </header>

            ${step === 1 ? renderSellStepType(s) : ''}
            ${step === 2 ? renderSellStepDetails(s) : ''}
            ${step === 3 ? renderSellStepFiles(s) : ''}
            ${step === 4 ? renderSellStepPricing(s) : ''}
            ${step === 5 ? renderSellStepVisibility(s) : ''}
            ${step === 6 ? renderSellStepInstitution(s, split) : ''}
            ${step === 7 ? renderSellStepConsent(s, split) : ''}

            <footer class="marketv2-stepper-actions">
                <button class="marketv2-ghost" data-cc-action="cc-39142997" ${step === 1 ? 'disabled' : ''}>Voltar</button>
                ${step < 7
        ? `<button class="marketv2-primary" data-cc-action="cc-11ca26b5">Proximo</button>`
        : `<button class="marketv2-primary" data-cc-action="cc-9da6cca9">Publicar anuncio</button>`}
            </footer>
        </section>
    `;
}
function renderSellStepType( s: any) {
    return `
        <div class="marketv2-form-grid">
            <label>Categoria
                <select data-field-meta="true" data-field-meta-key="auto:sell-asset-category" id="sell-asset-category">
                    ${MARKET_CATEGORY_OPTIONS.map((c: any) => `<option value="${c.value}" ${s.asset_category === c.value ? 'selected' : ''}>${c.label}</option>`).join('')}
                </select>
            </label>
            <label>Chave ECBT
                <input data-field-meta="true" data-field-meta-key="auto:sell-eco1-key" id="sell-eco1-key" value="${escapeHtml(s.eco1_key)}" placeholder="ECBT..." required>
            </label>
        </div>
    `;
}
function renderSellStepDetails( s: any) {
    return `
        <div class="marketv2-form-grid">
            <label>Titulo
                <input data-field-meta="true" data-field-meta-key="auto:sell-title" id="sell-title" value="${escapeHtml(s.title)}" maxlength="160">
            </label>
            <label>Descricao
                <textarea data-field-meta="true" data-field-meta-key="auto:sell-description" id="sell-description" rows="4" maxlength="5000">${escapeHtml(s.description)}</textarea>
            </label>
            <label>Dados tecnicos (JSON, max 64KB)
                <textarea data-field-meta="true" data-field-meta-key="auto:sell-payload" id="sell-payload" rows="8">${escapeHtml(s.payloadText)}</textarea>
            </label>
        </div>
    `;
}
function renderSellStepFiles( s: any) {
    const preview = normalizeListingPreview({
        preview_file_path: s.preview_file_path,
        preview_file_mime: s.preview_file_mime,
        preview_file_size_bytes: s.preview_file_size_bytes,
        main_file_mime: s.main_file_mime,
        main_file_size_bytes: s.main_file_size_bytes,
    });
    return `
        <div class="marketv2-form-grid">
            <label>Caminho do arquivo principal<input data-field-meta="true" data-field-meta-key="auto:sell-main-path" id="sell-main-path" value="${escapeHtml(s.main_file_path)}" placeholder="${t('libraries.mainPathPlaceholder')}"></label>
            <label>Tipo do arquivo principal
                <select data-field-meta="true" data-field-meta-key="auto:sell-main-mime" id="sell-main-mime">
                    ${['application/json', 'text/csv', 'application/zip', 'application/pdf'].map((m: any) => `<option value="${m}" ${s.main_file_mime === m ? 'selected' : ''}>${m}</option>`).join('')}
                </select>
            </label>
            <label>Tamanho do arquivo principal (bytes)<input data-field-meta="true" data-field-meta-key="auto:sell-main-size" id="sell-main-size" type="number" value="${escapeHtml(String(s.main_file_size_bytes || ''))}"></label>
            <label>Codigo de seguranca do arquivo (SHA-256)<input data-field-meta="true" data-field-meta-key="auto:sell-checksum" id="sell-checksum" value="${escapeHtml(s.checksum_sha256)}" maxlength="64"></label>
            <label>Caminho do arquivo de visualizacao<input data-field-meta="true" data-field-meta-key="auto:sell-preview-path" id="sell-preview-path" value="${escapeHtml(s.preview_file_path)}"></label>
            <label>Tipo do arquivo de visualizacao
                <select data-field-meta="true" data-field-meta-key="auto:sell-preview-mime" id="sell-preview-mime">
                    ${['application/json', 'text/csv', 'application/zip', 'application/pdf'].map((m: any) => `<option value="${m}" ${s.preview_file_mime === m ? 'selected' : ''}>${m}</option>`).join('')}
                </select>
            </label>
            <label>Tamanho da visualizacao (bytes)<input data-field-meta="true" data-field-meta-key="auto:sell-preview-size" id="sell-preview-size" type="number" value="${escapeHtml(String(s.preview_file_size_bytes || ''))}"></label>
        </div>
        <div class="marketv2-inline-preview">
            <h4>${getIcon('image', { size: '14px' })} Preview para compradores</h4>
            ${renderListingPreview(preview, {
        title: s.title || 'Anuncio em preparacao',
        showEmpty: true,
        emptyText: 'Preencha caminho, tipo e tamanho da visualizacao para exibir o preview.',
    })}
        </div>
    `;
}
function renderSellStepPricing( s: any) {
    return `
        <div class="marketv2-form-grid">
            <label>Tipo de negociacao
                <select data-field-meta="true" data-field-meta-key="auto:sell-mode" id="sell-mode">
                    ${MARKET_MODE_OPTIONS.map((m: any) => `<option value="${m.value}" ${s.mode === m.value ? 'selected' : ''}>${m.label}</option>`).join('')}
                </select>
            </label>
            <label>Moeda
                <select data-field-meta="true" data-field-meta-key="auto:sell-currency" id="sell-currency">
                    ${['BRL', 'USD', 'EUR'].map((c: any) => `<option value="${c}" ${s.currency === c ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
            </label>
            <label>Preco fixo (em centavos)
                <input data-field-meta="true" data-field-meta-key="auto:sell-fixed-price" id="sell-fixed-price" type="number" value="${escapeHtml(String(s.fixed_price_cents || 0))}">
            </label>
        </div>
    `;
}
function renderSellStepVisibility( s: any) {
    return `
        <div class="marketv2-form-grid">
            <label>Visibilidade
                <select data-field-meta="true" data-field-meta-key="auto:sell-visibility" id="sell-visibility">
                    <option value="public" ${s.visibility === 'public' ? 'selected' : ''}>Publico para todos</option>
                    <option value="restricted" ${s.visibility === 'restricted' ? 'selected' : ''}>Somente usuarios autorizados</option>
                </select>
            </label>
            <label>Usuarios permitidos (separe por virgula)
                <textarea data-field-meta="true" data-field-meta-key="auto:sell-access-users" id="sell-access-users" rows="4" placeholder="uuid1,uuid2">${escapeHtml(s.access_user_ids)}</textarea>
            </label>
        </div>
    `;
}
function renderSellStepInstitution( s: any, split: any) {
    return `
        <div class="marketv2-form-grid">
            <label>Instituicao parceira
                <select data-field-meta="true" data-field-meta-key="auto:sell-institution-id" id="sell-institution-id">
                    <option value="">Sem instituicao</option>
                    ${state.institutions.map((i: any) => `<option value="${i.id}" ${s.institution_id === i.id ? 'selected' : ''}>${escapeHtml(i.name)}</option>`).join('')}
                </select>
            </label>
            <label>Percentual para instituicao (1-50)
                <input data-field-meta="true" data-field-meta-key="auto:sell-institution-pct" id="sell-institution-pct" type="number" min="0" max="50" value="${escapeHtml(String(s.institution_pct || 0))}">
            </label>
            <div class="marketv2-split-preview">
                <span>Instituicao: ${split.institution_amount_cents}</span>
                <span>Plataforma: ${split.platform_fee_cents}</span>
                <span>Liquido vendedor: ${split.seller_net_cents}</span>
            </div>
            <label>Sugerir nova instituicao (nome)
                <input data-field-meta="true" data-field-meta-key="auto:sell-suggest-name" id="sell-suggest-name" value="${escapeHtml(s.institution_suggestion_name)}" placeholder="${t('libraries.institutionPlaceholder')}">
            </label>
            <label>Website<input data-field-meta="true" data-field-meta-key="auto:sell-suggest-url" id="sell-suggest-url" value="${escapeHtml(s.institution_suggestion_url)}"></label>
            <label>Observacao<textarea data-field-meta="true" data-field-meta-key="auto:sell-suggest-note" id="sell-suggest-note" rows="3">${escapeHtml(s.institution_suggestion_note)}</textarea></label>
        </div>
    `;
}
function renderSellStepConsent( s: any, split: any) {
    return `
        <div class="marketv2-consent">
            <h4>Tela de consentimento</h4>
            <p>${escapeHtml(CONSENT_TEXT)}</p>
            <label class="marketv2-checkbox-row">
                <input data-field-meta="true" data-field-meta-key="auto:sell-consent" id="sell-consent" type="checkbox" ${s.consent_checked ? 'checked' : ''}>
                Concordo que os dados serao enviados para compra/venda/cotacao.
            </label>
            <ul>
                <li>Categoria: ${escapeHtml(marketCategoryLabel(s.asset_category))}</li>
                <li>ECBT: ${escapeHtml(s.eco1_key || '-')}</li>
                <li>Tipo de negociacao: ${escapeHtml(marketModeLabel(s.mode))}</li>
                <li>Preco (centavos): ${escapeHtml(String(s.fixed_price_cents || 0))}</li>
                <li>Visibilidade: ${escapeHtml(marketVisibilityLabel(s.visibility))}</li>
                <li>Apoio para instituicao: ${escapeHtml(String(s.institution_pct || 0))}%</li>
                <li>Distribuicao vendedor/plataforma/instituicao: ${split.seller_net_cents}/${split.platform_fee_cents}/${split.institution_amount_cents}</li>
            </ul>
        </div>
    `;
}
async function _loadServiceProducts() {
    const listEl = document.getElementById('services-product-list');
    if (!listEl)
        return;
    try {
        // OPT-3: prefer cached `getAccessToken()` over `auth.getSession()` -
        // populated by buildSession() at bootstrap and kept in sync by
        // onAuthStateChange. Falls back to error message if no token.
        const supabase = getSupabaseClient();
        if (!supabase) {
            listEl.innerHTML =
                '<div style="text-align:center;color:var(--neutral-400);padding:20px;font-size:13px;">Faca login para gerenciar servicos.</div>';
            return;
        }
        const accessToken = getAccessToken();
        if (!accessToken) {
            listEl.innerHTML =
                '<div style="text-align:center;color:var(--neutral-400);padding:20px;font-size:13px;">Sessao expirada. Faca login novamente.</div>';
            return;
        }
        const url = `${supabase.supabaseUrl}/functions/v1/service-products?mine=true`;
        const res = await fetch(url, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                apikey: supabase.supabaseKey,
            },
        });
        const json = await res.json();
        if (!res.ok || !json.products) {
            listEl.innerHTML =
                '<div style="text-align:center;color:var(--neutral-400);padding:20px;font-size:13px;">Erro ao carregar servicos.</div>';
            return;
        }
        if (json.products.length === 0) {
            listEl.innerHTML =
                '<div style="text-align:center;color:var(--neutral-400);padding:20px;font-size:13px;">Nenhum servico criado ainda. Clique em "+ Novo Servico" para comecar.</div>';
            return;
        }
        const statusColors = {
            draft: '#94a3b8',
            published: '#22c55e',
            archived: '#f59e0b',
            deleted: '#ef4444',
        };
        const statusLabels = {
            draft: 'Rascunho',
            published: 'Publicado',
            archived: 'Arquivado',
            deleted: 'Removido',
        };
        listEl.innerHTML = json.products
            .map((p: any) => `
            <div style="padding:12px;border:1px solid var(--neutral-200);border-radius:var(--radius-sm);background:var(--neutral-50);display:flex;align-items:center;gap:12px;">
                <div style="flex:1;">
                    <div style="font-size:14px;font-weight:500;">${escapeHtml(p.name)}</div>
                    <div style="font-size:12px;color:var(--neutral-500);margin-top:2px;">
                        ${escapeHtml(p.category)} &#183;
                        <span style="color:${(statusColors as any)[p.status] || '#94a3b8'};">&#9679; ${(statusLabels as any)[p.status] || p.status}</span>
                        ${p.version ? ' &#183; v' + escapeHtml(p.version) : ''}
                    </div>
                </div>
                <button class="btn btn-secondary" style="font-size:11px;" data-cc-call-click="handleEditProductWizard|s:${encodeURIComponent(`${p.id}`)}">
                    Editar
                </button>
            </div>
        `)
            .join('');
    }
    catch (err: any) {
        // CORS / rede / funcao nao deployada - esperado em modo local
        log.warn('Service-products unavailable (local mode or function not deployed)', err.message);
        listEl.innerHTML =
            '<div style="text-align:center;color:var(--neutral-400);padding:20px;font-size:13px;">Servicos indisponiveis em modo local.</div>';
    }
}
function renderServicesTab() {
    return `
        <div style="padding:16px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
                <h3 style="margin:0;font-size:15px;">Servicos Produtizados</h3>
                <button class="btn btn-primary" style="font-size:12px;" data-cc-action="cc-f329a58e">
                    &#10010; Novo Servico
                </button>
            </div>
            <div style="padding:10px 12px;background:var(--neutral-100);border-radius:var(--radius-sm);font-size:12px;color:var(--neutral-600);margin-bottom:16px;">
                &#9432; Os documentos gerados sao propostas de escopo e termos sugeridos. Requerem revisao juridica para validade contratual.
            </div>
            <div id="services-product-list" style="display:flex;flex-direction:column;gap:8px;">
                <div style="text-align:center;color:var(--neutral-400);padding:20px;font-size:13px;">
                    Carregando servicos...
                </div>
            </div>
        </div>
    `;
}
/**
 * Resolves the public rating block from dashboard state.
 * @returns {any}
 */
function _resolveDashboardPublicRating() {
    return state.dashboard?.public_rating || {
        avg_last_10: 0,
        relations_count_last_10: 0,
        total_released_relations: 0,
        relations_volume_band: 'hidden',
        display_rating: false,
        last_published_at: null,
    };
}

/**
 * Builds the reputation article for the dashboard.
 * @param {any} rep
 * @param {any} publicRating
 * @returns {string}
 */
function _renderDashboardReputation(rep: any, publicRating: any) {
    const avgStars = Number(publicRating.avg_last_10 || 0);
    const showPublicRating = Boolean(publicRating.display_rating && publicRating.total_released_relations >= 10);
    const updatedAt = formatShortDate(publicRating.last_published_at);
    const publicRatingText = showPublicRating
        ? `${avgStars.toFixed(2)} / 5.00`
        : 'Ainda sem historico publico suficiente (minimo de 10 relacoes).';
    return `
        <article>
            <h3>${getIcon('trophy', { size: '14px' })} Reputacao</h3>
            <p class="marketv2-score">${Number(rep.score || 50).toFixed(1)} - ${escapeHtml(rep.level || 'Seed')}</p>
            <p>A reputacao considera mais os resultados recentes dos ultimos 90 dias.</p>
            <div class="marketv2-row" style="margin-top:8px;display:block;">
                <strong>Media publica (ultimas 10 relacoes):</strong>
                <div style="margin-top:4px;">${publicRatingText}</div>
                <small style="display:block;margin-top:4px;opacity:.8;">
                    Faixa de volume: ${escapeHtml(publicRating.relations_volume_band || 'hidden')} | Atualizado em: ${escapeHtml(updatedAt)}
                </small>
            </div>
        </article>`;
}

/**
 * Builds the recent listings article for the dashboard.
 * @param {any[]} listings
 * @returns {string}
 */
function _renderDashboardListings(listings: any[]) {
    const body = listings.length
        ? listings.map((l: any) => `<div class="marketv2-row"><span>${escapeHtml(l.title || '')}</span><span>${escapeHtml(l.status || '')}</span></div>`).join('')
        : '<p>Nenhum anuncio.</p>';
    return `<article><h3>${getIcon('list', { size: '14px' })} Anuncios recentes</h3>${body}</article>`;
}

/**
 * Builds the open orders article for the dashboard.
 * @param {any[]} openOrders
 * @returns {string}
 */
function _renderDashboardOrders(openOrders: any[]) {
    const body = openOrders.length
        ? openOrders.map((o: any) => `<div class="marketv2-row"><span>${escapeHtml(o.id)}</span><span>${escapeHtml(o.status)}</span></div>`).join('')
        : '<p>Nenhuma ordem ativa.</p>';
    return `<article><h3>${getIcon('shopping-bag', { size: '14px' })} Ordens abertas</h3>${body}</article>`;
}

/**
 * Builds the notifications article for the dashboard.
 * @returns {string}
 */
function _renderDashboardNotifications() {
    return `
        <article>
            <h3>${getIcon('bell', { size: '14px' })} Notificacoes</h3>
            <p>Nao lidas: ${Number(state.dashboard?.unread_notifications || 0)}</p>
            <button class="marketv2-ghost" data-cc-action="cc-ea40b72c">Abrir centro</button>
        </article>`;
}

/**
 * Builds the pending reviews article for the dashboard.
 * @param {any[]} pendingReviews
 * @returns {string}
 */
function _renderDashboardPendingReviews(pendingReviews: any[]) {
    const header = `<h3>${getIcon('star', { size: '14px' })} Avaliacoes pendentes</h3><p style="margin:0 0 8px 0;">A avaliacao e confidencial e anonima para a outra parte. A nota publica atualiza em lote semanal.</p>`;
    const body = pendingReviews.length
        ? pendingReviews.map((o: any) => `
            <div class="marketv2-row" style="align-items:center;gap:10px;flex-wrap:wrap;">
                <span>Ordem ${escapeHtml(o.id)}</span>
                <span>Status: ${escapeHtml(o.status)}</span>
                <span>Papel: ${escapeHtml(o.reviewer_role === 'buyer' ? 'contratante' : 'contratado')}</span>
                <button class="marketv2-primary" data-cc-call-click="handleMarketSubmitReviewPrompt|s:${encodeURIComponent(`${escapeHtml(o.id)}`)}">Avaliar</button>
            </div>
        `).join('')
        : '<p>Nenhuma avaliacao pendente.</p>';
    return `<article style="grid-column:1/-1;">${header}${body}</article>`;
}

function renderDashboard() {
    if (state.dashboard?.error) {
        return `<p class="marketv2-empty">Erro ao carregar painel: ${escapeHtml(marketMessage(state.dashboard.error, 'Nao foi possivel carregar o painel.'))}</p>`;
    }
    const rep = state.dashboard?.reputation || { score: 50, level: 'Seed' };
    const publicRating = _resolveDashboardPublicRating();
    return `
        <section class="marketv2-dash-grid">
            ${_renderDashboardReputation(rep, publicRating)}
            ${_renderDashboardListings(state.dashboard?.listings || [])}
            ${_renderDashboardOrders(state.dashboard?.open_orders || [])}
            ${_renderDashboardNotifications()}
            ${_renderDashboardPendingReviews(state.dashboard?.pending_reviews || [])}
        </section>
    `;
}
function renderNotifications() {
    return `
        <section class="marketv2-notifications">
            <div class="marketv2-filter-actions">
                <button class="marketv2-ghost" data-cc-action="cc-ca3498c1">Atualizar</button>
            </div>
            ${state.notifications.length === 0 ? '<p class="marketv2-empty">Sem notificacoes.</p>' : ''}
            ${state.notifications
        .map((n: any) => `
                <article class="marketv2-notification ${n.is_read ? '' : 'unread'}">
                    <header>
                        <strong>${escapeHtml(n.title || n.type || 'Notificacao')}</strong>
                        <span>${escapeHtml(String(n.priority || 'medium'))}</span>
                    </header>
                    <p>${escapeHtml(n.body || '')}</p>
                    <footer>
                        <small>${escapeHtml(String(n.created_at || ''))}</small>
                        ${n.is_read ? '' : `<button class="marketv2-ghost" data-cc-call-click="handleMarketMarkNotificationRead|s:${encodeURIComponent(`${n.id}`)}">Marcar lida</button>`}
                    </footer>
                </article>
            `)
        .join('')}
            ${state.notificationsNextCursor ? '<button class="marketv2-ghost" data-cc-action="cc-54351301">Carregar mais</button>' : ''}
        </section>
    `;
}
function renderAdmin() {
    const hasAny = state.admin.moderation.length ||
        state.admin.versionModeration.length ||
        state.admin.disputes.length ||
        state.admin.webhooks.length;
    return `
        <section class="marketv2-admin">
            <div class="marketv2-filter-actions">
                <button class="marketv2-ghost" data-cc-action="cc-c1134efe">Atualizar filas</button>
            </div>
            ${!hasAny ? '<p class="marketv2-empty">Sem itens admin pendentes ou acesso negado.</p>' : ''}

            <h4>Moderacao de anuncios</h4>
            ${state.admin.moderation
        .map((l: any) => `
                <div class="marketv2-admin-row">
                    <span>${escapeHtml(l.title || '')}</span>
                    <span>${escapeHtml(l.status || '')}</span>
                    <button class="marketv2-ghost" data-cc-call-click="handleMarketAdminModerate|s:${encodeURIComponent(`${l.id}`)}|s:approve">Aprovar</button>
                    <button class="marketv2-ghost" data-cc-call-click="handleMarketAdminModerate|s:${encodeURIComponent(`${l.id}`)}|s:reject">Rejeitar</button>
                    <button class="marketv2-ghost" data-cc-call-click="handleMarketAdminModerate|s:${encodeURIComponent(`${l.id}`)}|s:auto_hold">Auto-hold</button>
                </div>
            `)
        .join('')}
            <h4>Moderacao de versoes</h4>
            ${state.admin.versionModeration
        .map((v: any) => `
                <div class="marketv2-admin-row">
                    <span>${escapeHtml(v.title || '')}</span>
                    <span>${escapeHtml(`v${v.versionNo} - ${v.status}`)}</span>
                    <small>${escapeHtml(v.listingId)}</small>
                </div>
            `)
        .join('')}

            <h4>Disputas abertas</h4>
            ${state.admin.disputes
        .map((d: any) => `
                <div class="marketv2-admin-row">
                    <span>${escapeHtml(d.id)}</span>
                    <span>${escapeHtml(d.status)}</span>
                    <button class="marketv2-ghost" data-cc-call-click="handleMarketAdminResolveDispute|s:${encodeURIComponent(`${d.id}`)}|s:seller_won">Seller won</button>
                    <button class="marketv2-ghost" data-cc-call-click="handleMarketAdminResolveDispute|s:${encodeURIComponent(`${d.id}`)}|s:buyer_won">Buyer won</button>
                    <button class="marketv2-ghost" data-cc-call-click="handleMarketAdminResolveDispute|s:${encodeURIComponent(`${d.id}`)}|s:partial_refund">Partial refund</button>
                </div>
            `)
        .join('')}

            <h4>DLQ webhooks</h4>
            ${state.admin.webhooks
        .map((w: any) => `
                <div class="marketv2-admin-row">
                    <span>${escapeHtml(w.provider_event_id || w.id)}</span>
                    <span>${escapeHtml(w.status)}</span>
                    <button class="marketv2-ghost" data-cc-call-click="handleMarketAdminReplayWebhook|s:${encodeURIComponent(`${w.id}`)}">Replay</button>
                </div>
            `)
        .join('')}
        </section>
    `;
}
async function loadNotifications( reset: any = false) {
    try {
        const params: any = { page_size: 20 };
        if (!reset && state.notificationsNextCursor)
            params.cursor = state.notificationsNextCursor;
        const res = await fetchNotifications(params);
        state.notifications = reset ? res.items || [] : [...state.notifications, ...(res.items || [])];
        state.notificationsNextCursor = res.next_cursor || null;
    }
    catch (err: any) {
        log.error('Failed to load notifications', err.message);
        showToast(marketMessage(err?.message || 'notifications_error'), 'error');
    }
}
async function loadAdminQueues() {
    state.admin = { moderation: [], versionModeration: [], disputes: [], webhooks: [] };
    try {
        const [moderation, disputes, webhooks] = await Promise.all([
            fetchAdminModerationQueue(),
            fetchAdminDisputesQueue(),
            fetchWebhookDlq(),
        ]);
        state.admin.moderation = moderation?.listings || [];
        state.admin.versionModeration = normalizeLibraryVersionModerationQueue(moderation);
        state.admin.disputes = disputes?.disputes || [];
        state.admin.webhooks = webhooks?.events || [];
    }
    catch (e: any) {
        console.debug('[libraries] loadAdminQueues (likely forbidden non-admin):', e?.message || e);
    }
}
function readWizardStepFields() {
    if (state.wizard.step === 1) {
        state.wizard.profile = document.getElementById('wizard-profile')?.value || state.wizard.profile;
    }
    if (state.wizard.step === 2) {
        state.wizard.categories = document.getElementById('wizard-categories')?.value || state.wizard.categories;
    }
    if (state.wizard.step === 3) {
        state.wizard.region = document.getElementById('wizard-region')?.value || state.wizard.region;
        state.wizard.currency = document.getElementById('wizard-currency')?.value || state.wizard.currency;
    }
    if (state.wizard.step === 4) {
        state.wizard.notifications =
            document.getElementById('wizard-notifications')?.value || state.wizard.notifications;
    }
}
/**
 * Reads the trimmed value of a form input/select, falling back to a default.
 * Extracted to avoid many `||` fallback branches in filter readers.
 * @param {string} id
 * @param {string} [fallback]
 * @returns {string}
 */
function _readInputValue(id: string, fallback: string = '') {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    const raw = el?.value;
    return typeof raw === 'string' ? raw.trim() : fallback;
}

function readBuyFilters() {
    state.search.q = _readInputValue('market-filter-q');
    state.search.category = _readInputValue('market-filter-category');
    state.search.mode = _readInputValue('market-filter-mode');
    state.search.currency = _readInputValue('market-filter-currency', 'BRL');
    state.search.min_price_cents = _readInputValue('market-filter-min');
    state.search.max_price_cents = _readInputValue('market-filter-max');
    state.search.seller_min_score = _readInputValue('market-filter-score');
}
/**
 * Reads the trimmed value of a form input, falling back to a default.
 * @param {string} id
 * @param {string} [fallback]
 * @returns {string}
 */
function _readInputTrimmed(id: string, fallback: string = '') {
    const el = document.getElementById(id) as HTMLInputElement | null;
    return typeof el?.value === 'string' ? el.value.trim() : fallback;
}

/**
 * Reads step 1 sell form fields into state.
 */
function _readSellStep1() {
    const s = state.sell;
    s.asset_category = _readInputValue('sell-asset-category', s.asset_category);
    s.eco1_key = _readInputTrimmed('sell-eco1-key');
}

/**
 * Reads step 2 sell form fields into state.
 */
function _readSellStep2() {
    const s = state.sell;
    s.title = _readInputTrimmed('sell-title');
    s.description = _readInputTrimmed('sell-description');
    s.payloadText = _readInputValue('sell-payload', s.payloadText);
}

/**
 * Reads step 3 sell form fields into state.
 */
function _readSellStep3() {
    const s = state.sell;
    s.main_file_path = _readInputTrimmed('sell-main-path');
    s.main_file_mime = _readInputValue('sell-main-mime', s.main_file_mime);
    s.main_file_size_bytes = _readInputValue('sell-main-size');
    s.preview_file_path = _readInputTrimmed('sell-preview-path');
    s.preview_file_mime = _readInputValue('sell-preview-mime', s.preview_file_mime);
    s.preview_file_size_bytes = _readInputValue('sell-preview-size');
    s.checksum_sha256 = _readInputTrimmed('sell-checksum');
}

/**
 * Reads step 4 sell form fields into state.
 */
function _readSellStep4() {
    const s = state.sell;
    s.mode = _readInputValue('sell-mode', s.mode);
    s.currency = _readInputValue('sell-currency', s.currency);
    s.fixed_price_cents = Number(_readInputValue('sell-fixed-price', '0'));
}

/**
 * Reads step 5 sell form fields into state.
 */
function _readSellStep5() {
    const s = state.sell;
    s.visibility = _readInputValue('sell-visibility', s.visibility);
    s.access_user_ids = _readInputValue('sell-access-users');
}

/**
 * Reads step 6 sell form fields into state.
 */
function _readSellStep6() {
    const s = state.sell;
    s.institution_id = _readInputValue('sell-institution-id');
    s.institution_pct = Number(_readInputValue('sell-institution-pct', '0'));
    s.institution_suggestion_name = _readInputValue('sell-suggest-name');
    s.institution_suggestion_url = _readInputValue('sell-suggest-url');
    s.institution_suggestion_note = _readInputValue('sell-suggest-note');
}

/**
 * Reads step 7 sell form fields into state.
 */
function _readSellStep7() {
    const s = state.sell;
    const el = document.getElementById('sell-consent') as HTMLInputElement | null;
    s.consent_checked = Boolean(el?.checked);
}

const _SELL_STEP_READERS: Record<number, () => void> = {
    1: _readSellStep1,
    2: _readSellStep2,
    3: _readSellStep3,
    4: _readSellStep4,
    5: _readSellStep5,
    6: _readSellStep6,
    7: _readSellStep7,
};

function readSellStepFields() {
    const reader = _SELL_STEP_READERS[state.sell.step];
    if (reader)
        reader();
}
/**
 * Validates step 1 of the sell wizard.
 * @returns {string|null}
 */
function _validateSellStep1() {
    if (!state.sell.eco1_key)
        return 'eco1_key_required';
    return null;
}

/**
 * Validates the credit-specific payload fields in step 2.
 * @param {any} parsed
 * @returns {string|null}
 */
function _validateSellStep2CreditPayload(parsed: any) {
    const quality = String(parsed?.qualityClass || parsed?.eicQualityClass || 'EIC-Silver');
    if (quality === 'EIC-Bronze')
        return 'credit_bronze_not_listable';
    const split = parsed?.creditTerms?.creditSplit || {};
    const splitCheck = validateCreditSplit(split.contractor, split.contracted);
    return splitCheck.valid ? null : splitCheck.error;
}

/**
 * Validates step 2 of the sell wizard.
 * @returns {string|null}
 */
function _validateSellStep2() {
    const s = state.sell;
    if (!s.title || !s.description)
        return 'title_and_description_required';
    try {
        const parsed = JSON.parse(s.payloadText || '{}');
        const payloadCheck = validatePayloadLimits(parsed);
        if (!payloadCheck.valid)
            return 'payload_too_large';
        if (s.asset_category === 'credit') {
            const creditErr = _validateSellStep2CreditPayload(parsed);
            if (creditErr)
                return creditErr;
        }
    }
    catch (e: any) {
        console.debug('[libraries] validateSellStep-payloadParse:', e?.message || e);
        return 'invalid_payload_json';
    }
    return null;
}

/**
 * Validates step 3 of the sell wizard.
 * @returns {string|null}
 */
function _validateSellStep3() {
    const s = state.sell;
    if (!s.main_file_path || !s.main_file_mime || !s.main_file_size_bytes || !s.checksum_sha256)
        return 'main_file_required';
    return null;
}

/**
 * Validates step 4 of the sell wizard.
 * @returns {string|null}
 */
function _validateSellStep4() {
    const s = state.sell;
    const needsPrice = s.mode === 'fixed' || s.mode === 'both';
    if (needsPrice && (!Number.isFinite(s.fixed_price_cents) || s.fixed_price_cents <= 0))
        return 'fixed_price_required';
    if (s.mode === 'rfq')
        s.fixed_price_cents = 0;
    return null;
}

/**
 * Validates step 5 of the sell wizard.
 * @returns {string|null}
 */
function _validateSellStep5() {
    const s = state.sell;
    if (s.visibility === 'restricted' && !s.access_user_ids.trim())
        return 'access_list_required';
    return null;
}

/**
 * Validates step 6 of the sell wizard.
 * @returns {string|null}
 */
function _validateSellStep6() {
    const s = state.sell;
    const splitCheck = validateInstitutionSplit(s.institution_id || null, s.institution_pct);
    return splitCheck.valid ? null : splitCheck.error;
}

/**
 * Validates step 7 of the sell wizard.
 * @returns {string|null}
 */
function _validateSellStep7() {
    if (!state.sell.consent_checked)
        return 'consent_required';
    return null;
}

const _SELL_STEP_VALIDATORS: Record<number, () => string | null> = {
    1: _validateSellStep1,
    2: _validateSellStep2,
    3: _validateSellStep3,
    4: _validateSellStep4,
    5: _validateSellStep5,
    6: _validateSellStep6,
    7: _validateSellStep7,
};

function validateSellStep( step: any) {
    const validator = _SELL_STEP_VALIDATORS[step];
    return validator ? validator() : null;
}
async function sha256Hex( input: any) {
    const bytes = new TextEncoder().encode(String(input || ''));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const arr = Array.from(new Uint8Array(digest));
    return arr.map((b: any) => b.toString(16).padStart(2, '0')).join('');
}
async function doSearch( reset: any) {
    readBuyFilters();
    if (reset) {
        state.searchItems = [];
        state.searchNextCursor = null;
        state.searchHasMore = false;
    }
    const params = {
        q: state.search.q,
        category: state.search.category,
        mode: state.search.mode,
        currency: state.search.currency,
        min_price_cents: state.search.min_price_cents,
        max_price_cents: state.search.max_price_cents,
        page_size: state.search.page_size,
        cursor: reset ? '' : state.searchNextCursor,
    };
    let res;
    if (params.category === 'credit') {
        try {
            res = await searchCredits(params);
        }
        catch (e: any) {
            console.debug('[libraries] searchCredits-fallback:', e?.message || e);
            // Operational fallback until dedicated /credits endpoints are fully deployed.
            res = await searchListings(params);
        }
    }
    else {
        res = await searchListings(params);
    }
    let items = res.items || [];
    const minScore = Number(state.search.seller_min_score || 0);
    if (Number.isFinite(minScore) && minScore > 0) {
        items = items.filter((i: any) => Number(i?.seller_reputation?.score || 0) >= minScore);
    }
    state.searchItems = reset ? items : [...state.searchItems, ...items];
    state.searchNextCursor = res.next_cursor || null;
    state.searchHasMore = Boolean(res.has_more && res.next_cursor);
}
/**
 * Validates a credit payload before publishing a listing.
 * @param {any} payload
 */
function _validateCreditPayloadForPublish(payload: any) {
    const quality = String(payload?.qualityClass || payload?.eicQualityClass || 'EIC-Silver');
    if (quality === 'EIC-Bronze')
        throw new Error('credit_bronze_not_listable');
    const split = payload?.creditTerms?.creditSplit || {};
    const splitCheck = validateCreditSplit(split.contractor, split.contracted);
    if (!splitCheck.valid)
        throw new Error(splitCheck.error);
}

/**
 * Builds the createListingDraft payload from current sell state.
 * @param {any} payload
 * @param {string} payloadHash
 * @returns {any}
 */
function _buildListingDraftPayload(payload: any, payloadHash: string) {
    const s = state.sell;
    return {
        eco1_key: s.eco1_key,
        asset_category: s.asset_category,
        title: s.title,
        description: s.description,
        payload,
        payload_hash: payloadHash,
        main_file_path: s.main_file_path,
        main_file_mime: s.main_file_mime,
        main_file_size_bytes: Number(s.main_file_size_bytes || 0),
        preview_file_path: s.preview_file_path || null,
        preview_file_mime: s.preview_file_mime || null,
        preview_file_size_bytes: s.preview_file_size_bytes ? Number(s.preview_file_size_bytes) : null,
        checksum_sha256: s.checksum_sha256,
        mode: s.mode,
        visibility: s.visibility,
        currency: s.currency,
        fixed_price_cents: Number(s.fixed_price_cents || 0),
        institution_id: s.institution_id || null,
        institution_pct: Number(s.institution_pct || 0),
        metadata: {
            source: 'libraries_module_v2',
            submitted_at: new Date().toISOString(),
        },
    };
}

/**
 * Parses and applies restricted access user ids for a listing.
 * @param {string} listingId
 * @param {string} accessUserIds
 */
async function _applyRestrictedAccess(listingId: string, accessUserIds: string) {
    const access = accessUserIds
        .split(',')
        .map((x: any) => x.trim())
        .filter(Boolean);
    await setListingAccess(listingId, access);
}

/**
 * Submits a new institution suggestion if the form has one.
 * @param {any} s
 */
async function _submitInstitutionSuggestion(s: any) {
    if (!s.institution_suggestion_name.trim())
        return;
    await suggestInstitution({
        name: s.institution_suggestion_name.trim(),
        website_url: s.institution_suggestion_url.trim() || null,
        note: s.institution_suggestion_note.trim() || null,
    });
}

/**
 * Records listing consent for a published listing.
 * @param {string} listingId
 */
async function _recordPublishConsent(listingId: string) {
    await recordListingConsent(listingId, {
        consent_version: 'v1.0.0',
        consent_hash: await sha256Hex(CONSENT_TEXT),
        ip_hash: null,
        metadata: {
            accepted_from: 'libraries_modal_v2',
        },
    });
}

/**
 * Marks a local credit record as listed and updates state.
 * @param {any} payload
 * @param {string} listingId
 */
async function _markLocalCreditListed(payload: any, listingId: string) {
    const creditId = payload?.creditId || payload?.id || null;
    if (!creditId)
        return;
    try {
        await markCreditListed(creditId, listingId);
    }
    catch (e: any) {
        console.debug('[libraries] markCreditListed:', e?.message || e);
    }
    const local = getLocalEicRecords();
    const next = local.map((item: any) => String(item.id) === String(creditId)
        ? { ...item, status: 'listed', listingId, listedAt: new Date().toISOString() }
        : item);
    setLocalEicRecords(next);
    state.credits.portfolio = next;
}

async function doPublishListing() {
    readSellStepFields();
    const err = validateSellStep(7);
    if (err)
        throw new Error(err);
    const s = state.sell;
    const payload = JSON.parse(s.payloadText || '{}');
    if (s.asset_category === 'credit') {
        _validateCreditPayloadForPublish(payload);
    }
    const payloadHash = await sha256Hex(JSON.stringify(payload));
    const draft = await createListingDraft(_buildListingDraftPayload(payload, payloadHash));
    const listingId = draft.listing_id;
    if (!listingId)
        throw new Error('listing_create_failed');
    s.listingId = listingId;
    if (s.visibility === 'restricted')
        await _applyRestrictedAccess(listingId, s.access_user_ids);
    await _submitInstitutionSuggestion(s);
    await _recordPublishConsent(listingId);
    await publishListing(listingId);
    if (s.asset_category === 'credit')
        await _markLocalCreditListed(payload, listingId);
}
function maybeOpenWizardOnStart() {
    if (!wizardDone()) {
        state.tab = 'wizard';
        state.wizard.step = 1;
    }
}
function handleOpenLibraryManager() {
    state.tab = 'home';
    maybeOpenWizardOnStart();
    rerender();
    openModal('library-modal');
}
async function handleOpenMarketplace() {
    if (!isLoggedIn()) {
        try {
            window.showToast?.('Login necessario para acessar o Marketplace', 'warn');
        }
        catch (e: any) {
            console.debug('[libraries] showToast-loginRequired:', e?.message || e);
        }
        return;
    }
    state.tab = 'buy';
    openModal('library-modal');
    await rerender();
    await handleMarketSearch(true);
}
async function handleLibraryTabSwitch( tab: any) {
    state.tab = tab;
    await rerender();
}
async function handleMarketOpenWizard() {
    state.tab = 'wizard';
    state.wizard.step = 1;
    await rerender();
}
async function handleMarketWizardBack() {
    readWizardStepFields();
    state.wizard.step = Math.max(1, state.wizard.step - 1);
    await rerender();
}
async function handleMarketWizardNext() {
    readWizardStepFields();
    state.wizard.step = Math.min(4, state.wizard.step + 1);
    await rerender();
}
async function handleMarketWizardFinish() {
    readWizardStepFields();
    setPrefs({ ...state.wizard });
    setWizardDone(true);
    showToast(t('libraries.wizardSaved'), 'success');
    state.tab = 'home';
    await rerender();
}
async function handleMarketSearch( reset: any = true) {
    try {
        await doSearch(Boolean(reset));
    }
    catch (err: any) {
        log.error('Marketplace search failed', err.message);
        showToast(marketMessage(err?.message || 'search_failed'), 'error');
    }
    await rerender();
}
async function handleMarketResetFilters() {
    state.search = {
        q: '',
        category: '',
        currency: 'BRL',
        mode: '',
        min_price_cents: '',
        max_price_cents: '',
        seller_min_score: '',
        page_size: 12,
    };
    state.searchItems = [];
    state.searchNextCursor = null;
    state.searchHasMore = false;
    await rerender();
}
async function handleSelectCreditAgreement() {
    state.credits.selectedAgreementId = document.getElementById('eic-agreement-select')?.value || '';
    const agreement = listCreditAgreements().find((a: any) => String(a.id) === String(state.credits.selectedAgreementId));
    state.credits.selectedScopeKey = agreement ? scopeKey(agreement?.creditTerms?.scope || { type: 'model' }) : '';
    await rerender();
}
async function handleSelectCreditScope() {
    state.credits.selectedScopeKey = document.getElementById('eic-scope-select')?.value || '';
    await rerender();
}
/**
 * Resolves the credit agreement to use for EIC generation.
 * @returns {any|null}
 */
function _resolveGenerationAgreement() {
    const agreements = listCreditAgreements();
    return agreements.find((c: any) => String(c.id) === String(state.credits.selectedAgreementId)) ||
        agreements.find((c: any) => c.status === 'active') ||
        agreements[0] ||
        null;
}

/**
 * Validates the credit split for EIC generation.
 * @param {any} agreement
 * @returns {string|null}
 */
function _validateGenerationSplit(agreement: any) {
    const split = agreement.creditTerms.creditSplit || {};
    const splitCheckA = validateCreditSplit(split.contractor, split.contracted);
    const splitCheckB = validateCreditSplitCore(split);
    if (!splitCheckA.valid || !splitCheckB.valid)
        return (splitCheckA as any).error || (splitCheckB as any).error || 'credit_split_must_sum_100';
    return null;
}

/**
 * Resolves the generation scope and binding triple.
 * @param {any} agreement
 * @param {any} delta
 * @returns {any}
 */
function _resolveGenerationBinding(agreement: any, delta: any) {
    const scope = parseScopeKey(state.credits.selectedScopeKey) ||
        agreement.creditTerms?.scope || { type: 'model' };
    return buildCreditBindingTriple({
        cnpj: scope?.cnpj || '',
        modelId: delta?.endSnapshot?.modelId || delta?.startSnapshot?.modelId || '',
        scope: scope as any,
    } as any);
}

/**
 * Finds the most recent non-retired local credit in the same scope.
 * @param {any} binding
 * @returns {any}
 */
function _findLastSameScopeCredit(binding: any) {
    const local = getLocalEicRecords();
    const sameScope = local
        .filter((x: any) => String(x.scopeHash || '') === String(binding.scopeHash || '') && x.status !== 'retired')
        .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return sameScope[0];
}

/**
 * Computes the EIC allocation split.
 * @param {number} grossEic
 * @param {any} split
 * @returns {any}
 */
function _computeEicAllocation(grossEic: number, split: any) {
    const contractorEic = Math.round(grossEic * (split.contractor / 100) * 100) / 100;
    const contractedEic = Math.round((grossEic - contractorEic) * 100) / 100;
    const residualEic = Math.round((grossEic - contractorEic - contractedEic) * 100) / 100;
    return { grossEic, contractorEic, contractedEic, residualEic };
}

/**
 * Classifies the quality for a generated EIC sample.
 * @param {any} agreement
 * @returns {any}
 */
function _classifyGenerationQuality(agreement: any) {
    const verificationMethod = agreement.creditTerms.verificationMethod;
    return classifyEicQuality({
        verificationMethod,
        hasAuditor: verificationMethod === 'auditor' && Boolean(agreement.creditTerms.auditorAddress),
        hasContract: true,
        hasVetoClearance: true,
    });
}

/**
 * Builds a new local EIC record from generation inputs.
 * @param {any} agreement
 * @param {any} delta
 * @param {number} grossEic
 * @param {number} deltaEis
 * @param {any} binding
 * @param {any} allocation
 * @param {any} qualityInfo
 * @returns {any}
 */
function _buildSampleEicRecord(agreement: any, delta: any, grossEic: number, deltaEis: number, binding: any, allocation: any, qualityInfo: any) {
    const now = new Date();
    const expires = new Date(now);
    expires.setMonth(expires.getMonth() + 24);
    return {
        id: `eic-local-${now.getTime()}`,
        status: 'held',
        amount: grossEic,
        deltaEis,
        startEis: Number(delta?.startSnapshot?.eis || 0),
        endEis: Number(delta?.endSnapshot?.eis || 0),
        lastMintEis: Number(delta?.endSnapshot?.eis || 0),
        qualityClass: qualityInfo.quality,
        verificationMethod: agreement.creditTerms.verificationMethod || 'automatic',
        modelId: binding.modelId || delta?.endSnapshot?.modelId || `model-${now.getFullYear()}`,
        scopeHash: binding.scopeHash,
        cnpjHash: binding.cnpjHash,
        contractId: agreement.id,
        allocation,
        createdAt: now.toISOString(),
        expiresAt: expires.toISOString(),
    };
}

/**
 * Persists a generated EIC sample locally and best-effort remotely.
 * @param {any} agreement
 * @param {any} delta
 * @param {any} sample
 */
async function _persistGeneratedEic(agreement: any, delta: any, sample: any) {
    try {
        await generateCredits({
            source: 'libraries_modal_v2',
            creditAgreementId: agreement.id,
            delta,
            credit: sample,
        });
    }
    catch (e: any) {
        console.debug('[libraries] generateCredits:', e?.message || e);
    }
    const local = getLocalEicRecords();
    const next = [sample, ...local];
    setLocalEicRecords(next);
    state.credits.portfolio = next;
}

/**
 * Validates the computed EIC delta and deficit before persisting.
 * @param {number} grossEic
 * @param {any} delta
 * @param {any} binding
 * @returns {boolean}
 */
function _validateGenerationDelta(grossEic: number, delta: any, binding: any) {
    if (grossEic <= 0) {
        showToast(marketMessage('credit_delta_below_threshold'), 'warning');
        return false;
    }
    const last = _findLastSameScopeCredit(binding);
    const deficit = computeDeficitState(delta?.endSnapshot?.eis || 0, Number(last?.lastMintEis || last?.endEis || 0), last?.deficitSince || null);
    if (deficit.blockNewMint) {
        showToast(marketMessage('credit_deficit_state'), 'warning');
        return false;
    }
    return true;
}

/**
 * Generates and persists a sample EIC record after prerequisites are met.
 * @param {any} agreement
 * @returns {any|null}
 */
async function _generateAndPersistSampleEic(agreement: any) {
    const delta = await computeDelta('30d');
    const deltaEis = Number(delta?.deltaEis || 0);
    const grossEic = computeGrossEic(deltaEis);
    const binding = _resolveGenerationBinding(agreement, delta);
    if (!_validateGenerationDelta(grossEic, delta, binding))
        return null;
    const split = agreement.creditTerms.creditSplit || {};
    const allocation = _computeEicAllocation(grossEic, split);
    const qualityInfo = _classifyGenerationQuality(agreement);
    const sample = _buildSampleEicRecord(agreement, delta, grossEic, deltaEis, binding, allocation, qualityInfo);
    await _persistGeneratedEic(agreement, delta, sample);
    return sample;
}

async function handleGenerateSampleEic() {
    try {
        ensureCreditSelection();
        const agreement = _resolveGenerationAgreement();
        if (!agreement?.creditTerms) {
            showToast(marketMessage('credit_agreement_required'), 'warning');
            return;
        }
        const splitError = _validateGenerationSplit(agreement);
        if (splitError) {
            showToast(marketMessage(splitError), 'error');
            return;
        }
        const sample = await _generateAndPersistSampleEic(agreement);
        if (!sample)
            return;
        showToast(t('libraries.eicCreditGenerated', { amount: sample.amount.toFixed(2) }), 'success');
        await rerender();
    }
    catch (err: any) {
        log.error('EIC generation failed', err?.message);
        showToast(marketMessage(err?.message || 'credit_generate_failed'), 'error');
    }
}
async function handleRetireLocalEic( creditId: any) {
    const list = getLocalEicRecords();
    const next = list.map((item: any) => String(item.id) === String(creditId)
        ? { ...item, status: 'retired', retiredAt: new Date().toISOString() }
        : item);
    setLocalEicRecords(next);
    state.credits.portfolio = next;
    try {
        await retireCredits({ creditId, source: 'libraries_modal_v2' });
    }
    catch (e: any) {
        console.debug('[libraries] retireCredits:', e?.message || e);
    }
    showToast(t('libraries.eicCreditWithdrawn'), 'success');
    await rerender();
}
/**
 * Resolves a provenance display value from multiple possible keys.
 * @param {any} credit
 * @param {string[]} keys
 * @param {any} fallback
 * @returns {any}
 */
function _resolveProvenanceValue(credit: any, keys: string[], fallback: any) {
    for (const key of keys) {
        if (credit?.[key] != null)
            return credit[key];
    }
    return fallback;
}

/**
 * Resolves the provenance delta EIS text.
 * @param {any} credit
 * @returns {string}
 */
function _resolveProvenanceDelta(credit: any) {
    const raw = Number(_resolveProvenanceValue(credit, ['delta_eis', 'deltaEis'], null));
    return Number.isFinite(raw) ? raw.toFixed(2) : '-';
}

/**
 * Resolves the provenance allocation values.
 * @param {any} credit
 * @returns {any}
 */
function _resolveProvenanceAllocation(credit: any) {
    const allocation = credit?.allocation || {};
    return {
        contractorEic: Number(allocation.contractorEic || 0).toFixed(2),
        contractedEic: Number(allocation.contractedEic || 0).toFixed(2),
    };
}

/**
 * Builds a single provenance row.
 * @param {string} label
 * @param {string} value
 * @returns {string}
 */
function _renderProvenanceRow(label: string, value: string) {
    return `<div><strong>${label}:</strong> ${escapeHtml(value)}</div>`;
}

function renderEicProvenanceHtml( credit: any = {}) {
    const amount = Number(credit?.amount || 0).toFixed(2);
    const delta = _resolveProvenanceDelta(credit);
    const quality = String(_resolveProvenanceValue(credit, ['quality_class', 'qualityClass'], 'EIC-Silver'));
    const verification = String(_resolveProvenanceValue(credit, ['verification_method', 'verificationMethod'], 'automatic'));
    const modelId = String(_resolveProvenanceValue(credit, ['model_id', 'modelId'], '-'));
    const scopeHash = String(_resolveProvenanceValue(credit, ['scope_hash', 'scopeHash'], '-'));
    const cnpjHash = String(_resolveProvenanceValue(credit, ['cnpj_hash', 'cnpjHash'], '-'));
    const contractId = String(_resolveProvenanceValue(credit, ['contract_id', 'contractId'], '-'));
    const status = String(credit?.status || 'held');
    const expiresAt = _resolveProvenanceValue(credit, ['expires_at', 'expiresAt'], null);
    const { contractorEic, contractedEic } = _resolveProvenanceAllocation(credit);
    const validity = expiresAt ? formatShortDate(expiresAt) : '-';
    const rows = [
        { label: 'ID', value: String(credit?.id || '-') },
        { label: 'Status', value: status },
        { label: 'Quantidade', value: `${amount} EIC` },
        { label: 'Delta EIS', value: delta },
        { label: 'Classe', value: `${quality} (${eicClassMeaning(quality)})` },
        { label: 'Verificacao', value: verification },
        { label: 'Modelo', value: modelId },
        { label: 'Scope Hash', value: scopeHash },
        { label: 'CNPJ Hash', value: cnpjHash },
        { label: 'Contrato', value: contractId },
        { label: 'Split (Ctr/Ctd)', value: `${contractorEic}/${contractedEic} EIC` },
        { label: 'Validade', value: validity },
    ];
    return `
        <div style="display:grid;gap:8px;">
            ${rows.map((r: any) => _renderProvenanceRow(r.label, r.value)).join('')}
            <div style="opacity:0.85;">
                <strong>Significado:</strong> evidencia de melhoria de integridade ambiental (delta EIS), negociavel no marketplace conforme classe e contrato.
            </div>
        </div>
    `;
}
async function handleOpenEicProvenance( creditId: any) {
    if (!creditId) {
        showToast(t('libraries.creditNoProvenanceId'), 'warning');
        return;
    }
    let credit: any = null;
    try {
        const remote = await fetchCreditById(creditId);
        credit = remote?.credit || null;
    }
    catch (e: any) {
        console.debug('[libraries] fetchCreditById:', e?.message || e);
    }
    if (!credit) {
        credit = getLocalEicRecords().find((x: any) => String(x.id) === String(creditId)) || null;
    }
    if (!credit) {
        showToast(t('libraries.couldNotLoadProvenance'), 'warning');
        return;
    }
    const { overlay, body, footer, close } = buildModalShell({
        title: 'Proveniencia EIC',
        width: '760px',
    });
    body.innerHTML = renderEicProvenanceHtml(credit);
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = t('libraries.close');
    btn.onclick = close;
    footer.appendChild(btn);
    document.body.appendChild(overlay);
}
/**
 * Resolves the credit split percentages from allocation data.
 * @param {any} allocation
 * @returns {any}
 */
function _resolveCreditListingSplit(allocation: any) {
    const gross = Number(allocation?.grossEic || 0);
    if (!gross)
        return { contractor: 50, contracted: 50 };
    const contractor = Math.round((Number(allocation?.contractorEic || 0) / gross) * 100);
    const contracted = Math.round((Number(allocation?.contractedEic || 0) / gross) * 100);
    return { contractor, contracted };
}

/**
 * Builds the payload object for a credit listing draft.
 * @param {any} credit
 * @returns {any}
 */
function _buildCreditListingPayload(credit: any) {
    const split = _resolveCreditListingSplit(credit?.allocation);
    return {
        kind: 'eic_credit',
        creditId: credit.id,
        amount: Number(credit.amount || 0),
        deltaEis: Number(credit.deltaEis || 0),
        qualityClass: String(credit.qualityClass || 'EIC-Silver'),
        verificationMethod: String(credit.verificationMethod || 'automatic'),
        modelId: credit.modelId || null,
        scopeHash: credit.scopeHash || null,
        expiresAt: credit.expiresAt || null,
        contractId: credit.contractId || null,
        creditTerms: {
            creditSplit: split,
        },
        meaning: 'Credito nao-monetario de melhoria de integridade ambiental (delta EIS positivo verificado).',
    };
}

/**
 * Populates a sell draft with credit listing defaults.
 * @param {any} draft
 * @param {any} payload
 * @param {any} credit
 */
async function _populateCreditSellDraft(draft: any, payload: any, credit: any) {
    draft.asset_category = 'credit';
    draft.eco1_key = `EIC-${String(credit.id || '').slice(-10)}`;
    draft.title = `EIC ${Number(credit.amount || 0).toFixed(2)} - ${credit.modelId || t('libraries.model')}`;
    draft.description =
        `Credito EIC gerado por melhoria de EIS (delta ${Number(credit.deltaEis || 0).toFixed(2)}). ` +
            `Classe ${credit.qualityClass || 'EIC-Silver'}, verificacao ${credit.verificationMethod || 'automatic'}.`;
    draft.payloadText = JSON.stringify(payload, null, 2);
    draft.main_file_path = `market/eic/${credit.id}.json`;
    draft.main_file_mime = 'application/json';
    draft.main_file_size_bytes = String(Math.max(512, draft.payloadText.length));
    draft.preview_file_path = `market/eic/${credit.id}-preview.json`;
    draft.preview_file_mime = 'application/json';
    draft.preview_file_size_bytes = String(Math.max(256, Math.round(draft.payloadText.length / 2)));
    draft.checksum_sha256 = await sha256Hex(draft.payloadText);
    draft.mode = 'both';
    draft.currency = 'BRL';
    draft.fixed_price_cents = 1000;
    draft.step = 2;
    draft.consent_checked = false;
}

async function handlePrepareCreditListing( creditId: any) {
    const records = getLocalEicRecords();
    const credit = records.find((x: any) => String(x.id) === String(creditId));
    if (!credit) {
        showToast(t('libraries.eicCreditNotFound'), 'warning');
        return;
    }
    if (isBronzeCredit(credit)) {
        showToast(marketMessage('credit_bronze_not_listable'), 'warning');
        return;
    }
    const draft = freshSellDraft();
    const payload = _buildCreditListingPayload(credit);
    await _populateCreditSellDraft(draft, payload, credit);
    state.sell = draft;
    state.tab = 'sell';
    showToast(t('libraries.eicDraftPrepared'), 'success');
    await rerender();
}
// ----------------------------------------------------------------
// INSURANCE ADD-ON - Secao de seguro no card de listing
// ----------------------------------------------------------------
/**
 * Render insurance add-on section (hidden by default).
 * Renderiza secao colapsavel de opcoes de seguro.
 */
function _renderInsuranceAddon( listingId: any, priceCents: any, currency: any) {
    const catalog = getInsuranceCatalog();
    const eid = escapeHtml(listingId);
    let html = `<div class="insurance-addon" id="ins-${eid}" style="display:none">`;
    // Environmental
    const envEntries = Object.entries(catalog.environmental || {});
    if (envEntries.length) {
        html += `<div class="ins-group-label">${t('envInsurance') || 'Environmental Insurance'}</div>`;
        for (const [key, entry] of envEntries) {
            const prem = calculatePremium(priceCents, key);
            html += `<label class="ins-option"><input data-field-meta="true" data-field-meta-key="auto-pos:libraries:input:L2189" type="checkbox" data-ins-cat="environmental" data-ins-sub="${key}" data-ins-prem="${prem}" data-cc-call-change="handleInsuranceCheckChange|s:${encodeURIComponent(`${eid}`)}|s:${encodeURIComponent(`${currency}`)}"> ${t(entry.i18nKey) || key} (${entry.pctOfPrice}% &mdash; ${currency} ${(prem / 100).toFixed(2)})</label>`;
        }
    }
    // Warranty
    const warEntries = Object.entries(catalog.warranty || {});
    if (warEntries.length) {
        html += `<div class="ins-group-label">${t('productWarranty') || 'Product Warranty'}</div>`;
        for (const [key, entry] of warEntries) {
            const prem = calculatePremium(priceCents, key);
            html += `<label class="ins-option"><input data-field-meta="true" data-field-meta-key="auto-pos:libraries:input:L2199" type="checkbox" data-ins-cat="warranty" data-ins-sub="${key}" data-ins-prem="${prem}" data-cc-call-change="handleInsuranceCheckChange|s:${encodeURIComponent(`${eid}`)}|s:${encodeURIComponent(`${currency}`)}"> ${t(entry.i18nKey) || key} (${entry.pctOfPrice}% &mdash; ${currency} ${(prem / 100).toFixed(2)})</label>`;
        }
    }
    html += `<div class="ins-summary" id="ins-total-${eid}"></div></div>`;
    return html;
}
/**
 * Toggle insurance section visibility.
 */
function handleToggleInsurance( listingId: any) {
    const el = document.getElementById(`ins-${listingId}`);
    if (!el)
        return;
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
}
/**
 * Recalculate insurance total when checkbox changes.
 * Recalcula total de premios selecionados.
 */
function handleInsuranceCheckChange( listingId: any, currency: any) {
    const section = document.getElementById(`ins-${listingId}`);
    if (!section)
        return;
    const checks = section.querySelectorAll('input[type="checkbox"]:checked');
    let total = 0;
    checks.forEach((cb: any) => {
        total += Number(cb.dataset.insPrem || 0);
    });
    const summary = document.getElementById(`ins-total-${listingId}`);
    if (summary) {
        summary.textContent =
            total > 0 ? `${t('premium') || t('libraries.premium')}: ${currency} ${(total / 100).toFixed(2)}` : '';
    }
}
/**
 * Collect selected insurance options from a listing card.
 * Coleta opcoes de seguro marcadas pelo usuario.
 * @param {string} listingId
 * @returns {Array<{category: string, subtype: string}>}
 */
function _collectInsuranceOptions( listingId: any) {
    const section = document.getElementById(`ins-${listingId}`);
    if (!section)
        return [];
    const checks = section.querySelectorAll('input[type="checkbox"]:checked');
    const opts: any[] = [];
    checks.forEach((cb: any) => {
        opts.push({ category: cb.dataset.insCat, subtype: cb.dataset.insSub });
    });
    return opts;
}
/**
 * Updates local EIC records when a credit listing is purchased.
 * @param {any} listing
 * @param {any} res
 */
function _updateLocalCreditAfterPurchase(listing: any, res: any) {
    const creditId = listing?.active_version_data?.payload?.creditId || listing?.payload?.creditId || null;
    if (!creditId)
        return;
    const next = getLocalEicRecords().map((item: any) => String(item.id) === String(creditId)
        ? {
            ...item,
            status: 'traded',
            tradedAt: new Date().toISOString(),
            orderId: res?.order?.id || null,
        }
        : item);
    setLocalEicRecords(next);
    state.credits.portfolio = next;
}

async function handleMarketBuyListing( listingId: any) {
    if (!isLoggedIn()) {
        showToast(t('login') || t('libraries.loginRequired'), 'warning');
        return;
    }
    try {
        const insuranceOptions = _collectInsuranceOptions(listingId);
        const res = await buyListing(listingId, { insuranceOptions });
        const listing = (state.searchItems || []).find((x: any) => String(x.id) === String(listingId));
        if (listing && String(listing.asset_category || '') === 'credit')
            _updateLocalCreditAfterPurchase(listing, res);
        showToast(t('libraries.orderCreated', { id: res?.order?.id || '' }), 'success');
        if (insuranceOptions.length)
            showToast(t('insAddedToOrder') || t('libraries.insuranceAddedToOrder'), 'info');
        requestLibrariesUIRefresh();
    }
    catch (err: any) {
        log.error('Listing purchase failed', err.message);
        showToast(marketMessage(err?.message || 'buy_failed'), 'error');
    }
}
/**
 * Notifies the seller of a new RFQ proposal.
 * @param {string} listingId
 * @param {number} price
 * @param {string} currency
 */
async function _notifySellerOfRfq(listingId: string, price: number, currency: string) {
    const listing = (state.searchItems || []).find((x: any) => String(x.id) === String(listingId));
    const sellerId = listing?.creator_id || listing?.seller_id || listing?.user_id;
    if (!sellerId)
        return;
    await createNotification({
        userId: sellerId,
        type: 'quote.received',
        priority: 'P0',
        targetId: listingId,
        payload: { title: 'Nova proposta recebida', body: `Valor: ${price} ${currency}` },
    });
}

async function handleMarketOpenRfqPrompt( listingId: any, currency: any = 'BRL') {
    if (!isLoggedIn()) {
        showToast(t('login') || t('libraries.loginRequired'), 'warning');
        return;
    }
    const raw = await asyncPrompt(t('libraries.initialProposalValue', { currency }), '1000', {
        placeholder: 'Ex: 1000 = R$ 10,00',
        confirmLabel: t('submit') || 'Enviar proposta',
        cancelLabel: t('cancel') || 'Cancelar',
    });
    if (raw == null)
        return;
    const price = Number(raw);
    if (!Number.isFinite(price) || price <= 0) {
        showToast(t('libraries.invalidValuePositiveIntegerCents'), 'error');
        return;
    }
    try {
        const thread = await createRfqThread(listingId, { price_cents: price, currency });
        showToast(t('libraries.proposalSent', { id: thread?.thread?.id || '' }), 'success');
        await _notifySellerOfRfq(listingId, price, currency);
        requestLibrariesUIRefresh();
    }
    catch (err: any) {
        log.error('RFQ proposal submission failed', err.message);
        showToast(marketMessage(err?.message || 'rfq_failed'), 'error');
    }
}
/**
 * Prompts the user for a review rating and validates it.
 * @returns {number|null}
 */
async function _promptForReviewRating() {
    const rawRating = await asyncPrompt(t('libraries.ratingPrompt'), '5', {
        placeholder: '1 a 5',
        confirmLabel: t('next') || 'Próximo',
        cancelLabel: t('cancel') || 'Cancelar',
    });
    if (rawRating == null)
        return null;
    const rating = Number(rawRating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        showToast(t('libraries.invalidRating'), 'error');
        return null;
    }
    return rating;
}

/**
 * Prompts the user for an optional private moderation comment.
 * @returns {string}
 */
async function _promptForReviewComment() {
    const raw = (await asyncPrompt(t('libraries.privateModerationComment'), '', {
        placeholder: t('libraries.moderatorJustificationPlaceholder'),
        confirmLabel: t('submit') || 'Enviar avaliação',
        cancelLabel: t('cancel') || 'Cancelar',
    })) || '';
    return raw.trim().slice(0, 2000);
}

/**
 * Builds the success message and emits the review-submitted event.
 * @param {string} orderId
 * @param {number} rating
 * @param {string|null} holdUntil
 */
function _emitMarketReviewSubmitted(orderId: string, rating: number, holdUntil: string | null) {
    const holdDate = holdUntil ? new Date(holdUntil).toLocaleDateString('pt-BR') : '';
    const baseMsg = t('marketReviewSubmitted') || 'Avaliacao registrada. Confidencial e anonima.';
    const holdTemplate = t('marketReviewSubmittedHoldUntil') || 'Entra no agregado apos {date}.';
    const holdMsg = holdDate ? ` ${holdTemplate.replace('{date}', holdDate)}` : '';
    showToast(`${baseMsg}${holdMsg}`, 'success');
    emitMarketReviewSubmitted({
        order_id: orderId,
        rating,
        hold_until: holdUntil,
        i18n_key: 'marketReviewSubmitted',
        i18n_hold_key: holdDate ? 'marketReviewSubmittedHoldUntil' : null,
        locale_date: holdDate || null,
    });
}

async function handleMarketSubmitReviewPrompt( orderId: any) {
    if (!isLoggedIn()) {
        showToast(t('login') || t('libraries.loginRequired'), 'warning');
        return;
    }
    const rating = await _promptForReviewRating();
    if (rating == null)
        return;
    const privateComment = await _promptForReviewComment();
    try {
        const result = await submitOrderReview(orderId, { rating, private_comment: privateComment });
        const holdUntil = result?.review?.hold_until || null;
        _emitMarketReviewSubmitted(String(orderId || ''), rating, holdUntil);
        if (state.tab === 'dashboard') {
            state.dashboard = await fetchMarketDashboard();
            await rerender();
        }
        requestLibrariesUIRefresh();
    }
    catch (err: any) {
        log.error('Order review submission failed', err.message);
        showToast(marketMessage(err?.message || 'review_submit_failed'), 'error');
    }
}
function handleMarketCopyListingId( listingId: any) {
    navigator.clipboard
        .writeText(String(listingId || ''))
        .then(() => {
        showToast(t('libraries.codeCopied'), 'success');
    })
        .catch((err: any) => {
        log.debug('Clipboard copy ignored', err?.message);
    });
}
async function handleMarketSellBack() {
    readSellStepFields();
    state.sell.step = Math.max(1, state.sell.step - 1);
    await rerender();
}
async function handleMarketSellNext() {
    readSellStepFields();
    const err = validateSellStep(state.sell.step);
    if (err) {
        showToast(marketMessage(err), 'error');
        return;
    }
    state.sell.step = Math.min(7, state.sell.step + 1);
    await rerender();
}
async function handleMarketPublishListing() {
    if (!isLoggedIn()) {
        showToast(t('login') || t('libraries.loginRequired'), 'warning');
        return;
    }
    try {
        await doPublishListing();
        showToast(t('libraries.listingPublished'), 'success');
        // Notificar curadores (best-effort: notificar o próprio usuário como confirmação de submissão)
        const userId = getCurrentUser()?.id;
        if (userId) {
            await createNotification({
                userId,
                type: 'review.pending',
                priority: 'P1',
                payload: { title: 'Item submetido para revisão', body: 'Seu anúncio foi enviado para moderação.' },
            });
        }
        state.sell = freshSellDraft();
        state.tab = 'dashboard';
        requestLibrariesUIRefresh();
    }
    catch (err: any) {
        log.error('Listing publish failed', err.message);
        showToast(marketMessage(err?.message || 'publish_failed'), 'error');
    }
    await rerender();
}
async function handleMarketRefreshNotifications() {
    await loadNotifications(true);
    await rerender();
}
async function handleMarketLoadMoreNotifications() {
    await loadNotifications(false);
    await rerender();
}
async function handleMarketMarkNotificationRead( notificationId: any) {
    try {
        await markNotificationRead(notificationId);
    }
    catch (err: any) {
        log.error('Notification mark-read failed', err.message);
        showToast(marketMessage(err?.message || 'notification_update_failed'), 'error');
    }
    await loadNotifications(true);
    await rerender();
}
async function handleMarketRefreshAdmin() {
    await loadAdminQueues();
    await rerender();
}
async function handleMarketAdminModerate( listingId: any, decision: any) {
    const reason = await asyncPrompt(t('libraries.decisionReasonPrompt'), 'Moderação manual V2', {
        placeholder: t('libraries.decisionJustificationPlaceholder'),
        confirmLabel: 'Moderar',
        cancelLabel: t('cancel') || 'Cancelar',
    });
    if (!reason)
        return;
    try {
        await moderateListing(listingId, { decision, reason });
        showToast(t('libraries.moderation', { decision }), 'success');
        // Notificar submitter (creator do listing)
        const listing = (state.admin.moderation || []).find((x: any) => String(x.id) === String(listingId));
        const creatorId = listing?.creator_id || listing?.user_id;
        if (creatorId) {
            await createNotification({
                userId: creatorId,
                type: 'review.resolved',
                priority: 'P1',
                targetId: listingId,
                payload: { title: 'Revisão concluída', body: `Decisão: ${decision}` },
            });
        }
        await loadAdminQueues();
    }
    catch (err: any) {
        log.error('Listing moderation failed', err.message);
        showToast(marketMessage(err?.message || 'moderation_failed'), 'error');
    }
    await rerender();
}
async function handleMarketAdminResolveDispute( disputeId: any, resolution: any) {
    const reason = await asyncPrompt(t('libraries.resolutionReasonPrompt'), 'Resolução manual de disputa', {
        placeholder: t('libraries.resolutionJustificationPlaceholder'),
        confirmLabel: 'Resolver disputa',
        cancelLabel: t('cancel') || 'Cancelar',
    });
    if (!reason)
        return;
    try {
        await resolveDispute(disputeId, { resolution, reason });
        showToast(t('libraries.disputeResolved', { resolution }), 'success');
        await loadAdminQueues();
    }
    catch (err: any) {
        log.error('Dispute resolution failed', err.message);
        showToast(marketMessage(err?.message || 'resolve_dispute_failed'), 'error');
    }
    await rerender();
}
async function handleMarketAdminReplayWebhook( eventId: any) {
    try {
        await replayWebhook(eventId);
        showToast(t('libraries.webhookRequeued'), 'success');
        await loadAdminQueues();
    }
    catch (err: any) {
        log.error('Webhook replay failed', err.message);
        showToast(marketMessage(err?.message || 'webhook_replay_failed'), 'error');
    }
    await rerender();
}
async function handleMarketRenewListing( listingId: any) {
    try {
        const result = await renewListing(listingId);
        if (result?.ok === false)
            throw new Error(result?.error || 'renew_failed');
        showToast(t('libraries.listingRenewed30Days'), 'success');
        await rerender();
    }
    catch (err: any) {
        log.error('Listing renewal failed', err.message);
        showToast(marketMessage(err?.message || 'renew_failed'), 'error');
    }
}
function handleImportLibraryFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
        const file = input.files?.[0];
        if (!file)
            return;
        const text = await file.text();
        try {
            const manifest = JSON.parse(text);
            const result = installLibrary(manifest);
            if (!result.success)
                throw new Error(result.error || 'install_failed');
            showToast(t('libraries.libraryInstalled', { name: manifest?.name || manifest?.id || '' }), 'success');
            requestLibrariesUIRefresh();
        }
        catch (err: any) {
            log.error('Library file import failed', err.message);
            showToast(marketMessage(err?.message || 'invalid_library_file'), 'error');
        }
    };
    input.click();
}
function handleExportLibrary( libraryId: any) {
    const lib = getLibraryById(libraryId);
    if (!lib) {
        showToast(t('libraries.libraryNotFound'), 'error');
        return;
    }
    const blob = new Blob([JSON.stringify(lib.manifest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${lib.manifest.id || 'library'}.json`;
    a.click();
    URL.revokeObjectURL(url);
}
function handleInstallLibrary( libraryId: any) {
    const manifest = getLibraryDetails(libraryId);
    if (!manifest) {
        showToast(t('libraries.libraryNotFound'), 'error');
        return;
    }
    const result = installLibrary(manifest);
    if (result.success) {
        showToast(t('libraries.libraryInstalled', { name: manifest.name || manifest.id }), 'success');
        requestLibrariesUIRefresh();
    }
    else {
        showToast(marketMessage(result.error || 'install_failed'), 'error');
    }
}
function handleUninstallLibrary( libraryId: any) {
    const result = uninstallLibrary(libraryId);
    if (result.success) {
        showToast(t('libraries.libraryRemoved'), 'success');
        requestLibrariesUIRefresh();
    }
    else {
        showToast(marketMessage(result.error || 'uninstall_failed'), 'error');
    }
}
/**
 * Open the standardized Analytics Runner modal for a familyTag (e.g. 'mining',
 * 'water', 'air'). Triggered by the green "Executar" button on analytics-*
 * Library cards. See SPEC_ANALYTICS_LIBRARY_UI.md.
 *
 * @param {string} familyTag
 */
function handleRunAnalyticsFamily( familyTag: any) {
    const runnerUrl = new URL('../ui/analyticsRunner.js', import.meta.url).href;
    import(runnerUrl)
        .then((mod: any) => mod.openAnalyticsFamilyRunner(familyTag))
        .catch((e: any) => {
        console.debug('[libraries] handleRunAnalyticsFamily:', e?.message || e);
        showToast(`Falha ao abrir runner: ${e?.message || e}`, 'error');
    });
}
function handleActivateLibrary( libraryId: any) {
    const result = activateLibrary(libraryId);
    if (result.success) {
        showToast(t('libraries.libraryActivated'), 'success');
        requestLibrariesUIRefresh();
    }
    else {
        showToast(marketMessage(result.error || 'activate_failed'), 'error');
    }
}
function handleDeactivateLibrary( libraryId: any) {
    const result = deactivateLibrary(libraryId);
    if (result.success) {
        showToast(t('libraries.libraryDeactivated'), 'success');
        requestLibrariesUIRefresh();
    }
    else {
        showToast(marketMessage(result.error || 'deactivate_failed'), 'error');
    }
}
function handleSearchMarketplace() {
    return handleMarketSearch(true);
}
function handleSortMarketplace() {
    return handleMarketSearch(true);
}
function handleRateLibrary( libraryId: any, rating: any) {
    rateLibrary(libraryId, rating);
    showToast(t('libraries.ratingSavedLocally'), 'success');
}
function handleUpdateLibrary() {
    showToast(t('libraries.v2UsePublishedListingVersioning'), 'info');
}
function handleUpdateAllLibraries() {
    showToast(t('libraries.v2BatchUpdateDoesNotApply'), 'info');
}
function legacyNotUsed() {
    showToast(t('libraries.legacyFlowReplaced'), 'info');
}
const handleToggleLike = legacyNotUsed;
const handlePostComment = legacyNotUsed;
const handleDeleteComment = legacyNotUsed;
const handleViewLibraryDetail = legacyNotUsed;
const handlePublishLibrary = legacyNotUsed;
const handleUnpublishLibrary = legacyNotUsed;
const handleToggleFollow = legacyNotUsed;
const handleSelectRating = legacyNotUsed;
const handleQuickFillRating = legacyNotUsed;
const handlePublishTypeChange = legacyNotUsed;
const handleCharitySliderChange = legacyNotUsed;
const handlePublishPriceChange = legacyNotUsed;
const handleVerifyCharity = legacyNotUsed;
const handleConfirmPublish = legacyNotUsed;
const handleToggleContentsDetail = legacyNotUsed;
const handleTagFilter = legacyNotUsed;
const handleRefreshRecommendations = legacyNotUsed;
/**
 * Inicia checkout Stripe para biblioteca paga não-possuída.
 * @param {string} libraryDbId - UUID da biblioteca em `libraries.id`
 */
async function handleBuyLibrary( libraryDbId: any) {
    if (!isLoggedIn()) {
        showToast(t('loginRequired') || t('libraries.loginRequired'), 'warning');
        return;
    }
    try {
        // Route through unified $ECBT checkout modal
        const { openCheckoutModal } = await import('../ui/checkoutModal.js' as string);
        openCheckoutModal('library', libraryDbId, {
            itemName: 'Biblioteca',
            itemSubtitle: libraryDbId,
        });
    }
    catch (_err: any) {
        showToast(t('checkoutError') || t('libraries.checkoutError'), 'error');
    }
}
/**
 * MKT-OWNER-VERIFY-001 RF-6 — abre o modal "como funciona" do aviso de
 * proveniência exibido no card de produto pago (link `mkt.ipNotice.card`).
 */
function handleShowIpNotice() {
    openIpNoticeModal();
}
/**
 * Baixa manifest de biblioteca já comprada e instala.
 * @param {string} libraryDbId - UUID da biblioteca
 * @param {string} _libraryId - ID string do manifest (para refresh de UI)
 */
async function handleDownloadPurchasedLibrary( libraryDbId: any, _libraryId: any) {
    const { manifest, error } = await downloadLibraryManifest(libraryDbId);
    if (error || !manifest) {
        showToast(t('downloadError') || t('libraries.downloadError'), 'error');
        return;
    }
    const result = installLibrary(manifest);
    if (result.success) {
        showToast(t('libraries.libraryInstalled', { name: manifest.name || manifest.id }) + ' ' + t('libraries.installed'), 'success');
        requestLibrariesUIRefresh();
        if (state.tab === 'modules')
            await renderModulesTab();
    }
    else {
        showToast(result.error || t('installFailed') || t('libraries.installFailed'), 'error');
    }
}
// ----------------------------------------------------------------
// KNOWLEDGE SYNC HANDLERS
// Sincronizacao da base de conhecimento com Supabase
// ----------------------------------------------------------------
/**
 * Sync knowledge base from Supabase.
 * Mostra toast de progresso e resultado.
 */
async function handleSyncKnowledgeBase() {
    const { syncKnowledgeBase, isSyncing } = await import('../libraries/knowledgeSync.js' as string);
    if (isSyncing()) {
        showToast(t('knowledgeSync.syncing') || t('libraries.knowledgeSyncSyncing'), 'info');
        return;
    }
    showToast(t('knowledgeSync.syncing') || t('libraries.knowledgeSyncSyncing'), 'info');
    const result = await syncKnowledgeBase({ force: false });
    if (result.success) {
        if (result.count === 0) {
            showToast(t('knowledgeSync.empty') || t('libraries.knowledgeSyncEmpty'), 'info');
        }
        else {
            showToast((t('knowledgeSync.synced') || t('libraries.knowledgeBaseSynced')).replace('{count}', String(result.count)), 'success');
        }
    }
    else {
        if (result.source === 'offline') {
            showToast((t('knowledgeSync.offline') || t('libraries.knowledgeBaseOffline')).replace('{count}', String(result.count)), 'warning');
        }
        else {
            showToast(t('knowledgeSync.error') || t('libraries.knowledgeSyncError'), 'error');
        }
    }
}
/**
 * Open knowledge panel / trigger knowledge view.
 * Abre o painel de conhecimento com assets sincronizados.
 */
async function handleOpenKnowledgePanel() {
    const { syncKnowledgeBase, getCachedAssets } = await import('../libraries/knowledgeSync.js' as string);
    // Sync first (respects cooldown)
    await syncKnowledgeBase();
    // Get assets for display
    const assets = await getCachedAssets();
    if (assets.length === 0) {
        showToast(t('knowledgeSync.empty') || t('libraries.knowledgeSyncEmpty'), 'info');
        return;
    }
    showToast((t('knowledgeSync.synced') || t('libraries.knowledgeBaseSynced')).replace('{count}', String(assets.length)), 'success');
}
// ----------------------------------------------------------------
// PROFESSIONAL SERVICES — SPEC_PROFESSIONAL_SERVICES_MARKETPLACE (MVP)
// Thin UI over utils/libraries/professionalServices.js (which reuses
// the core motor). Register profile, search, send RFQ — sem rede no MVP.
// ----------------------------------------------------------------
/**
 * Constrói o corpo HTML do painel de serviços profissionais.
 * @param {string} userId
 * @returns {string}
 */
function renderProfServicesBody( userId: any) {
    const ps = profSvcModule;
    const tierOpts = ps.TIER_IDS.map((id: any) => `<option value="${escapeHtml(id)}">${escapeHtml(id)}</option>`).join('');
    const found = ps.searchProfessionals({});
    const myContracts = ps.listMyContracts(userId);
    const list = found.length
        ? found
            .map((p: any) => `
        <div class="ecbt-card" style="padding:10px;margin:6px 0">
            <strong>${escapeHtml(p.code)}</strong> — ${escapeHtml(p.tier)}
            <div>${escapeHtml((p.skills || []).join(', ') || '—')}</div>
            <div>R$ ${escapeHtml(String(p.hourlyRateBRL))}/h · ${escapeHtml(p.availability || '')}
                ${p.rating ? ` · &#9733; ${escapeHtml(String(p.rating))} (${escapeHtml(String(p.reviewCount || 0))})` : ''}</div>
            <button class="marketv2-ghost" data-cc-call-click="handleProfServiceRfq|s:${encodeURIComponent(`${escapeHtml(p.id)}`)}">${escapeHtml(t('profSvc.rfq') || 'Solicitar orcamento')}</button>
        </div>`)
            .join('')
        : `<p>${escapeHtml(t('profSvc.empty') || 'Nenhum profissional cadastrado ainda.')}</p>`;
    const contracts = myContracts.length
        ? myContracts.map((c: any) => `<li>${escapeHtml(c.title)} — <em>${escapeHtml(c.status)}</em></li>`).join('')
        : `<li>${escapeHtml(t('profSvc.noContracts') || 'Sem contratos.')}</li>`;
    return `
        <h3>${escapeHtml(t('profSvc.registerTitle') || 'Oferecer servicos')}</h3>
        <div class="ecbt-form-row" style="display:flex;gap:8px;flex-wrap:wrap">
            <select id="profsvc-tier">${tierOpts}</select>
            <input id="profsvc-rate" type="number" min="1" placeholder="R$/h" style="width:90px" />
            <input id="profsvc-years" type="number" min="0" placeholder="anos exp." style="width:90px" />
            <input id="profsvc-skills" type="text" placeholder="skills (virgula)" style="flex:1;min-width:160px" />
            <button class="marketv2-primary" data-cc-action="cc-50c0ceae">${escapeHtml(t('profSvc.register') || 'Cadastrar')}</button>
        </div>
        <h3 style="margin-top:14px">${escapeHtml(t('profSvc.searchTitle') || 'Profissionais disponiveis')}</h3>
        <div id="profsvc-list">${list}</div>
        <h3 style="margin-top:14px">${escapeHtml(t('profSvc.myContracts') || 'Meus contratos')}</h3>
        <ul>${contracts}</ul>
    `;
}
/** Abre o painel de Servicos Profissionais (entrada visivel via card no Marketplace). */
function handleOpenProfessionalServices() {
    const userId = getCurrentUser()?.id;
    if (!userId) {
        showToast(t('profSvc.loginRequired') || 'Faca login para usar servicos profissionais.', 'warning');
        return;
    }
    const shell = buildModalShell({
        title: t('profSvc.title') || 'Servicos profissionais',
        width: '720px',
        id: 'prof-svc-modal',
    });
    shell.body.innerHTML = renderProfServicesBody(userId);
    document.body.appendChild(shell.overlay);
    window._profSvcShell = shell;
}
/** Cadastra o usuário atual como profissional a partir do formulário. */
function handleRegisterProfessional() {
    const ps = profSvcModule;
    const userId = getCurrentUser()?.id;
    if (!userId)
        return;
    const tier = document.getElementById('profsvc-tier')?.value;
    const rate = Number(document.getElementById('profsvc-rate')?.value);
    const years = Number(document.getElementById('profsvc-years')?.value);
    const skills = String(document.getElementById('profsvc-skills')?.value || '')
        .split(',')
        .map((s: any) => s.trim())
        .filter(Boolean);
    const res = ps.registerProfessional({ userId, tier, hourlyRateBRL: rate, yearsExperience: years, skills });
    if (!res.ok) {
        showToast((res.errors || []).join('; '), 'error');
        return;
    }
    showToast(t('profSvc.registered') || 'Perfil profissional salvo.', 'success');
    const shell = window._profSvcShell;
    if (shell)
        shell.body.innerHTML = renderProfServicesBody(userId);
}
/**
 * Envia RFQ (cria contrato 'proposed') para um profissional anonimizado.
 * @param {string} professionalId
 */
async function handleProfServiceRfq( professionalId: any) {
    const ps = profSvcModule;
    const userId = getCurrentUser()?.id;
    if (!userId)
        return;
    const title = await asyncPrompt(t('profSvc.rfqTitle') || 'Titulo do projeto:');
    if (!title)
        return;
    const hours = Number(await asyncPrompt(t('profSvc.rfqHours') || 'Estimativa de horas:', '20'));
    const res = ps.createServiceRFQ({
        clientId: userId,
        professionalId,
        title,
        description: '',
        paymentModel: 'hourly',
        hourlyRateBRL: 150,
        estimatedHours: Number.isFinite(hours) ? hours : 1,
    });
    if (!res.ok) {
        showToast((res.errors || []).join('; '), 'error');
        return;
    }
    showToast(t('profSvc.rfqSent') || 'RFQ enviada.', 'success');
    const shell = window._profSvcShell;
    if (shell)
        shell.body.innerHTML = renderProfServicesBody(userId);
}
/**
 * Open the Community Data Enrichment proposal modal for an element.
 * Abre o modal de proposta de enriquecimento da comunidade (SPEC 9.68).
 *
 * @param {string} [elementId] - ID do elemento alvo (selecionado no Inspector)
 * @returns {Promise<void>}
 */
async function handleSuggestEnrichment( elementId: any) {
    if (CONFIG.FEATURES?.COMMUNITY_ENRICHMENT === false)
        return;
    if (!elementId) {
        showToast(t('enrichmentNoSelection') || 'Select an element first', 'warning');
        return;
    }
    const { openEnrichmentProposalModal } = await import('../ui/library/enrichmentProposalModal.js' as string);
    openEnrichmentProposalModal({
        elementId,
        onSubmit: async (payload: any) => {
            const session = authSessionModule.getCurrentSession?.();
            enrichmentSchemaModule.createLibraryCommunityContribution({
                contributorId: session?.userId || session?.email || 'anonymous',
                recordId: payload.elementId,
                contributionType: payload.contributionType,
                justification: payload.description,
                dataSource: payload.evidenceName || 'user-described',
                sourceUrl: 'https://ecbyts.com/community',
                sourceDate: new Date().toISOString(),
                spatialAccuracy: 'other',
                licenseConfirmed: true,
            });
            showToast(t('enrichmentSubmitted') || 'Enrichment proposal submitted', 'success');
        },
    });
}
/**
 * Toggle a community 3D enrichment layer on/off (pure-logic state only).
 * Alterna uma camada 3D de contribuições da comunidade (SPEC 9.68).
 *
 * @param {string} layerId - ID da camada registrada
 * @param {boolean} [active] - Estado explícito; se omitido, inverte
 * @returns {Promise<void>}
 */
async function handleToggleCommunityLayer( layerId: any, active: any) {
    if (CONFIG.FEATURES?.COMMUNITY_ENRICHMENT === false)
        return;
    const { toggleCommunityLayer } = await import('../../core/catalog/communityLayers.js' as string);
    const layer = toggleCommunityLayer(layerId, active);
    if (!layer) {
        showToast(t('communityLayerMissing') || 'Community layer not found', 'warning');
        return;
    }
    window.dispatchEvent(new CustomEvent('communityLayerToggled', { detail: layer }));
}
export const libraryHandlers = {
    handleSuggestEnrichment,
    handleToggleCommunityLayer,
    handleOpenLibraryManager,
    handleOpenProfessionalServices,
    handleRegisterProfessional,
    handleProfServiceRfq,
    handleOpenMarketplace,
    handleLibraryTabSwitch,
    handleImportLibraryFile,
    handleExportLibrary,
    handleInstallLibrary,
    handleGetCourse,
    handleUninstallLibrary,
    handleOpenCapabilityModule,
    handleToggleCapabilityModule,
    handleModulesFilterKind,
    handleModulesFilterSearch,
    handleRunAnalyticsFamily,
    handleActivateLibrary,
    handleDeactivateLibrary,
    handleSearchMarketplace,
    handleSortMarketplace,
    handleRateLibrary,
    handleUpdateLibrary,
    handleUpdateAllLibraries,
    handleMarketOpenWizard,
    handleMarketWizardBack,
    handleMarketWizardNext,
    handleMarketWizardFinish,
    handleMarketSearch,
    handleMarketResetFilters,
    handleSelectCreditAgreement,
    handleSelectCreditScope,
    handleGenerateSampleEic,
    handleRetireLocalEic,
    handlePrepareCreditListing,
    handleOpenEicProvenance,
    handleMarketBuyListing,
    handleMarketOpenRfqPrompt,
    handleMarketSubmitReviewPrompt,
    handleMarketCopyListingId,
    handleMarketSellBack,
    handleMarketSellNext,
    handleMarketPublishListing,
    handleMarketRefreshNotifications,
    handleMarketLoadMoreNotifications,
    handleMarketMarkNotificationRead,
    handleMarketRefreshAdmin,
    handleMarketAdminModerate,
    handleMarketAdminResolveDispute,
    handleMarketAdminReplayWebhook,
    handleMarketRenewListing,
    handleToggleInsurance,
    handleInsuranceCheckChange,
    handleToggleLike,
    handlePostComment,
    handleDeleteComment,
    handleViewLibraryDetail,
    handlePublishLibrary,
    handleUnpublishLibrary,
    handleToggleFollow,
    handleSelectRating,
    handleQuickFillRating,
    handlePublishTypeChange,
    handleCharitySliderChange,
    handlePublishPriceChange,
    handleVerifyCharity,
    handleConfirmPublish,
    handleToggleContentsDetail,
    handleBuyLibrary,
    handleShowIpNotice,
    handleDownloadPurchasedLibrary,
    handleTagFilter,
    handleRefreshRecommendations,
    handleSyncKnowledgeBase,
    handleOpenKnowledgePanel,
};
