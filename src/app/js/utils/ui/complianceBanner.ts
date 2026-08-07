// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Compliance Banner — wire DOM (claude - novaspec, 2026-06-04).
 *
 * SPEC_MODEL_BASELINE_COMPLIANCE_PRESET §5.1: banner persistente acima do
 * statusbar, sempre visível em TODAS as views.
 *
 * Camada thin sobre pure-logic já entregue:
 *   - _bannerMarkupPure.buildBannerMarkup → string HTML
 *   - _bannerStateResolverPure.resolveBannerState → BannerStateVM
 *   - _bannerResponsivePure.resolveBannerTier → BannerTierVM
 *   - _complianceIndicatorPairPure.resolveIndicatorPair → IndicatorPairVM
 *
 * Responsabilidades wire (3 apenas):
 *   1. Mount/update DOM (innerHTML usando builder — XSS já tratado pure)
 *   2. Re-render no resize (debounced) — tier recalculado
 *   3. Click listener em .cb-details → dispatch event 'compliance:open-details'
 *
 * Anti-pattern Calvin pixels-over-dom (AGENTS.md):
 *   - NÃO abre modal automaticamente em tab/route change
 *   - Click em [Detalhes ▼] dispatches custom event; quem escuta abre modal
 *
 * Wire NÃO sabe sobre Supabase / state global / models. Recebe input puro,
 * renderiza. Update é triggered externamente por chamada a renderComplianceBanner().
 */

import { buildBannerMarkup, isValidBannerInput, BANNER_ROOT_ID } from '../../core/compliance/_bannerMarkupPure.js';
import type { BannerMarkupInput } from '../../core/compliance/_bannerMarkupPure.js';

const PARENT_SELECTOR = '#main-area';
const STATUSBAR_SELECTOR = '#statusbar';
const RESIZE_DEBOUNCE_MS = 150;

let _currentInput: BannerMarkupInput | null = null;
let _resizeTimer: ReturnType<typeof setTimeout> | null = null;
let _resizeBound = false;

/**
 * Garante que o elemento root #compliance-banner existe no DOM antes do
 * statusbar. Idempotente.
 */
function _ensureRoot(): HTMLElement | null {
    const doc = (globalThis as any).document as Document | undefined;
    if (!doc) return null;
    let root = doc.getElementById(BANNER_ROOT_ID);
    if (root) return root;
    const parent = doc.querySelector(PARENT_SELECTOR) || doc.body;
    if (!parent) return null;
    const statusbar = doc.querySelector(STATUSBAR_SELECTOR);
    root = doc.createElement('div');
    root.id = BANNER_ROOT_ID;
    if (statusbar && statusbar.parentNode === parent) {
        parent.insertBefore(root, statusbar);
    } else {
        parent.appendChild(root);
    }
    return root;
}

/**
 * Renderiza/atualiza o banner com input pure-logic já resolvido.
 * Chamado por gerenciadores externos quando state muda.
 */
export function renderComplianceBanner(input: BannerMarkupInput | null | undefined): void {
    if (!isValidBannerInput(input)) {
        const doc = (globalThis as any).document as Document | undefined;
        if (doc) {
            const root = doc.getElementById(BANNER_ROOT_ID);
            if (root) root.innerHTML = '';
        }
        _currentInput = null;
        return;
    }
    _currentInput = input as BannerMarkupInput;
    const root = _ensureRoot();
    if (!root) return;
    const markup = buildBannerMarkup(input);
    root.outerHTML = markup; // outerHTML substitui o próprio root pelo novo (mantém ID)
    _wireDetailsButton();
    _ensureResizeListener();
}

/**
 * Wire do click em [Detalhes ▼] — dispatcha custom event no document.
 * Quem escuta (ex: openComplianceDetailsModal) abre modal.
 */
function _wireDetailsButton(): void {
    const doc = (globalThis as any).document as Document | undefined;
    if (!doc) return;
    const root = doc.getElementById(BANNER_ROOT_ID);
    if (!root) return;
    const btn = root.querySelector('.cb-details');
    if (!btn) return;
    btn.addEventListener('click', _onDetailsClick);
}

function _onDetailsClick(): void {
    const doc = (globalThis as any).document as Document | undefined;
    if (!doc) return;
    doc.dispatchEvent(new CustomEvent('compliance:open-details', { detail: { input: _currentInput } }));
}

/**
 * Re-render no resize com debounce — tier responsive recalculado pelo caller.
 * Wire apenas notifica via event 'compliance:resize'.
 */
function _ensureResizeListener(): void {
    if (_resizeBound) return;
    const win = (globalThis as any).window as Window | undefined;
    if (!win) return;
    win.addEventListener('resize', _onResize);
    _resizeBound = true;
}

function _onResize(): void {
    if (_resizeTimer) clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
        const doc = (globalThis as any).document as Document | undefined;
        if (!doc) return;
        doc.dispatchEvent(new CustomEvent('compliance:resize', { detail: { input: _currentInput } }));
    }, RESIZE_DEBOUNCE_MS);
}

/**
 * Remove banner do DOM (limpeza ao desmontar app). Idempotente.
 */
export function disposeComplianceBanner(): void {
    const doc = (globalThis as any).document as Document | undefined;
    if (!doc) return;
    const root = doc.getElementById(BANNER_ROOT_ID);
    if (root && root.parentNode) root.parentNode.removeChild(root);
    const win = (globalThis as any).window as Window | undefined;
    if (win && _resizeBound) {
        win.removeEventListener('resize', _onResize);
        _resizeBound = false;
    }
    if (_resizeTimer) {
        clearTimeout(_resizeTimer);
        _resizeTimer = null;
    }
    _currentInput = null;
}

/**
 * Getter de teste — não usar em produção.
 */
export function _getCurrentInput(): BannerMarkupInput | null {
    return _currentInput;
}
