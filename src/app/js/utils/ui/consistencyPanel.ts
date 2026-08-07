// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   CONSISTENCY PANEL — CONSIST-OBS-001 S2 UI consumer
   Painel admin "Consistência do Sistema" — lê veredict JSON e renderiza
   verde/vermelho + lista de checks + timestamp.

   Camada UI mínima sobre buildVeredictHtml (pure-logic). Fluxo:
   1) openConsistencyPanel() → fetch .runtime/consistency-veredict.json
   2) Se ok → buildVeredictHtml + inject em overlay flutuante
   3) Se falha (404/CORS) → render estado "no veredict — rode CLI"

   Feature flag: CONFIG.FEATURES.CONSISTENCY_ADMIN_PANEL (default OFF).
   ================================================================ */

import { buildVeredictHtml } from '../telemetry/consistencyVeredictHtmlPure.js';
import type { ConsistencyVeredict } from '../telemetry/consistencyVeredictPure.js';
import { isVeredictFresh } from '../telemetry/consistencyVeredictPure.js';
import { CONFIG } from '../../config.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';

const OVERLAY_ID = 'consistency-panel-overlay';
const VEREDICT_URL = '/.runtime/consistency-veredict.json';
const FALLBACK_URL = '.runtime/consistency-veredict.json';

function isFlagOn(): boolean {
    try {
        return Boolean((CONFIG as any)?.FEATURES?.CONSISTENCY_ADMIN_PANEL);
    } catch (e) {
        if (typeof console !== 'undefined') console.debug('[consistencyPanel:flag]', (e as Error)?.message || e);
        return false;
    }
}

async function fetchVeredict(): Promise<ConsistencyVeredict | null> {
    const urls = [VEREDICT_URL, FALLBACK_URL];
    for (const u of urls) {
        try {
            const r = await fetch(u, { cache: 'no-store' });
            if (!r.ok) continue;
            const j = await r.json();
            if (j && typeof j === 'object' && j.status) return j as ConsistencyVeredict;
        } catch (e) {
            if (typeof console !== 'undefined') console.debug('[consistencyPanel:fetch]', u, (e as Error)?.message || e);
            // try next URL
        }
    }
    return null;
}

function freshnessNote(v: ConsistencyVeredict | null): string {
    if (!v) return '';
    // FIX: isVeredictFresh é (veredict, nowIso, maxAgeMs) — a chamada anterior
    // passava v.lastRun como veredict e o maxAge como nowIso → sempre "stale".
    const fresh = isVeredictFresh(v, new Date().toISOString(), 24 * 3600 * 1000);
    if (fresh) return '<p class="consistency-fresh">Fresh (≤24h)</p>';
    return '<p class="consistency-stale">Stale (&gt;24h) — re-run recommended</p>';
}

function instructionsBlock(): string {
    return (
        '<details class="consistency-instructions">' +
        '<summary>How to re-run from CLI</summary>' +
        '<pre>npm run test:consistency:veredict</pre>' +
        '<p>Writes .runtime/consistency-veredict.json then refresh this panel.</p>' +
        '</details>'
    );
}

function ensureOverlay(): HTMLDivElement {
    let el = document.getElementById(OVERLAY_ID) as HTMLDivElement | null;
    if (el) return el;
    el = document.createElement('div');
    el.id = OVERLAY_ID;
    el.className = 'consistency-panel-overlay';
    el.style.cssText = [
        'position:fixed',
        'inset:0',
        'background:rgba(0,0,0,0.55)',
        'z-index:9000',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'padding:24px',
    ].join(';');
    document.body.appendChild(el);
    return el;
}

function buildShellHtml(inner: string): string {
    return (
        '<div class="consistency-panel-shell" role="dialog" aria-modal="true" ' +
        'aria-labelledby="consistency-panel-title" ' +
        'style="background:#fff;color:#111;max-width:920px;width:100%;max-height:80vh;overflow:auto;border-radius:8px;padding:20px;box-shadow:0 8px 32px rgba(0,0,0,0.35);">' +
        '<div class="consistency-panel-bar" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
        '<span id="consistency-panel-title" style="font-weight:600;font-size:14px;">Consistência do Sistema</span>' +
        '<button type="button" class="consistency-panel-close" aria-label="Close" ' +
        'style="background:transparent;border:0;font-size:18px;cursor:pointer;">×</button>' +
        '</div>' +
        inner +
        '</div>'
    );
}

function bindClose(overlay: HTMLDivElement, onClose: () => void): void {
    const close = (): void => {
        overlay.removeEventListener('click', backdropHandler);
        document.removeEventListener('keydown', escHandler);
        onClose();
    };
    const backdropHandler = (e: MouseEvent): void => {
        if (e.target === overlay) close();
    };
    const escHandler = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') close();
    };
    overlay.addEventListener('click', backdropHandler);
    document.addEventListener('keydown', escHandler);
    const btn = overlay.querySelector('.consistency-panel-close');
    if (btn) {
        btn.addEventListener('click', () => close(), { once: true });
    }
}

function bindReRun(overlay: HTMLDivElement, refresh: () => Promise<void>): void {
    const btn = overlay.querySelector('.consistency-rerun') as HTMLButtonElement | null;
    if (!btn) return;
    btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Refreshing…';
        await refresh();
    }, { once: true });
}

function destroyOverlay(): void {
    const el = document.getElementById(OVERLAY_ID);
    if (el && el.parentNode) {
        el.parentNode.removeChild(el);
        clearDeepLinkUrl();
    }
}

/**
 * Open the consistency admin panel as a floating overlay.
 * Respects CONFIG.FEATURES.CONSISTENCY_ADMIN_PANEL — no-op if flag is off.
 * Re-entrant: closes existing instance before opening a new one.
 */
export async function openConsistencyPanel(): Promise<boolean> {
    if (!isFlagOn()) {
        console.debug('[consistency:panel] flag OFF — no-op');
        return false;
    }
    destroyOverlay();
    const overlay = ensureOverlay();
    const render = async (): Promise<void> => {
        const v = await fetchVeredict();
        const body = buildVeredictHtml(v, {
            title: 'Consistência do Sistema',
            reRunLabel: 'Re-rodar suite',
            lastRunLabel: 'Última rodada',
            assertiveOnError: true,
        });
        overlay.innerHTML = buildShellHtml(body + freshnessNote(v) + instructionsBlock());
        bindClose(overlay, destroyOverlay);
        bindReRun(overlay, render);
    };
    await render();
    syncDeepLinkUrl('consistency');
    return true;
}

/**
 * Programmatic close (also bound to backdrop/Esc/close button).
 */
export function closeConsistencyPanel(): void {
    destroyOverlay();
}

declare global {
    interface Window {
        handleOpenConsistencyPanel?: () => Promise<boolean>;
        handleCloseConsistencyPanel?: () => void;
    }
}

export function registerConsistencyPanelHandlers(): void {
    if (typeof window === 'undefined') return;
    window.handleOpenConsistencyPanel = openConsistencyPanel;
    window.handleCloseConsistencyPanel = closeConsistencyPanel;
}
