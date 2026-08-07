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
//
// SPEC: docs/specs/features/SPEC_GIS_OUT_OF_VIEWPORT_BANNER.md
//
// UI layer for the "out-of-viewport" banner. Pure DOM creation + sessionStorage
// dismissal. All math lives in core/scene/viewportDetector.js.
import { escapeHtml } from '../helpers/html.js';
const CONTAINER_ID = 'gis-banner-container';
const STORAGE_PREFIX = 'ecbyts-gis-banner-dismissed:';
const AUTO_DISMISS_MS = 15000;
// ----------------------------------------------------------------
// CONTAINER + DISMISSAL HELPERS
// ----------------------------------------------------------------
/**
 * Returns the banner container, creating it if missing.
 * Positioned top-right of the viewport (above toast container).
 *
 * @returns {HTMLElement}
 */
function ensureContainer() {
    let c = document.getElementById(CONTAINER_ID);
    if (c) return c;
    c = document.createElement('div');
    c.id = CONTAINER_ID;
    c.setAttribute('aria-live', 'polite');
    c.setAttribute('role', 'region');
    c.setAttribute('aria-label', 'Import notifications');
    document.body.appendChild(c);
    return c;
}
/**
 * Sanitises datasetId for sessionStorage key. Mirrors the TS helper but
 * inlined here so the UI module has no cyclic import.
 *
 * @param {string} id
 * @returns {string}
 */
function safeKey(id: any) {
    const cleaned = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');
    return STORAGE_PREFIX + (cleaned.length > 0 ? cleaned : '_');
}
/**
 * @param {string} datasetId
 * @returns {boolean}
 */
export function isDismissedInSession(datasetId: any) {
    try {
        return sessionStorage.getItem(safeKey(datasetId)) === '1';
    } catch (e: any) {
        console.debug('[outOfViewportBanner:isDismissedInSession]', e?.message || e);
        return false;
    }
}
/**
 * @param {string} datasetId
 */
function persistDismissal(datasetId: any) {
    try {
        sessionStorage.setItem(safeKey(datasetId), '1');
    } catch (e: any) {
        console.debug('[outOfViewportBanner:persistDismissal]', e?.message || e);
        /* sessionStorage full / blocked — banner just won't be remembered */
    }
}
/**
 * Test / admin helper.
 *
 * @param {string} datasetId
 */
export function clearDismissedFlag(datasetId: any) {
    try {
        sessionStorage.removeItem(safeKey(datasetId));
    } catch (e: any) {
        console.debug('[outOfViewportBanner:clearDismissedFlag]', e?.message || e);
    }
}
// ----------------------------------------------------------------
// DOM CREATION
// ----------------------------------------------------------------
/**
 * Shows a non-modal banner top-right. Returns the created HTMLElement, or
 * null if the datasetId was already dismissed in this session.
 *
 * @param {object} opts
 * @param {string} opts.datasetId      - Unique id for dismissal persistence
 * @param {number} opts.distanceM      - Distance in metres (formatted for display)
 * @param {string} [opts.messageText]  - Pre-built message (i18n already applied by caller)
 * @param {string} [opts.centerLabel]  - Button label (i18n by caller)
 * @param {() => void} opts.onCenter   - Click callback (e.g. fitAllElements)
 * @param {() => void} [opts.onDismiss]- Dismiss callback (after persistence)
 * @returns {HTMLElement|null}
 */
export function showOutOfViewportBanner(opts: any) {
    const { datasetId, messageText, centerLabel, onCenter, onDismiss } = opts;
    if (isDismissedInSession(datasetId)) return null;
    const container = ensureContainer();
    const banner = document.createElement('div');
    banner.className = 'ecbt-banner ecbt-banner--gis-out-of-viewport';
    banner.setAttribute('role', 'status');
    banner.setAttribute('data-dataset-id', escapeHtml(String(datasetId || '')));
    const msg = String(messageText || 'Imported data is outside current view');
    const label = String(centerLabel || 'Center on data');
    banner.innerHTML = `
        <span class="ecbt-banner-message">${escapeHtml(msg)}</span>
        <button type="button" class="ecbt-btn ecbt-btn--primary ecbt-banner-action">${escapeHtml(label)}</button>
        <button type="button" class="ecbt-banner-close" aria-label="Dismiss banner" title="Dismiss">×</button>
    `;
    const actionBtn = banner.querySelector('.ecbt-banner-action');
    const closeBtn = banner.querySelector('.ecbt-banner-close');
    /** @type {ReturnType<typeof setTimeout>|null} */
    let timer: any = null;
    const cleanup = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        if (banner.parentNode) banner.parentNode.removeChild(banner);
    };
    if (actionBtn) {
        actionBtn.addEventListener('click', () => {
            cleanup();
            try {
                if (typeof onCenter === 'function') onCenter();
            } catch (e: any) {
                console.debug('[outOfViewportBanner:onCenter]', e?.message || e);
            }
        });
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            persistDismissal(datasetId);
            cleanup();
            try {
                if (typeof onDismiss === 'function') onDismiss();
            } catch (e: any) {
                console.debug('[outOfViewportBanner:onDismiss]', e?.message || e);
            }
        });
    }
    // Auto-dismiss after 15s; cancel on hover, restart on hover-end
    const startTimer = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            // Auto-dismiss does NOT persist (user did not explicitly dismiss)
            cleanup();
        }, AUTO_DISMISS_MS);
    };
    banner.addEventListener('mouseenter', () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    });
    banner.addEventListener('mouseleave', () => {
        startTimer();
    });
    container.appendChild(banner);
    startTimer();
    return banner;
}
// ----------------------------------------------------------------
// INTEGRATED CHECK + SHOW
// ----------------------------------------------------------------
/**
 * High-level entry-point: checks if banner should show, then displays it.
 * Imports the camera and translation lazily so this module is safe to
 * import from anywhere.
 *
 * @param {object} opts
 * @param {string} opts.datasetId
 * @param {Array<object>} opts.importedElements  - Elements returned by importGeoJSONObject or equivalent
 * @param {number} [opts.threshold]              - Override default 50000m
 * @returns {Promise<HTMLElement|null>}
 */
export async function checkAndShowOutOfViewportBanner({ datasetId, importedElements, threshold }: any) {
    try {
        const detector = await import('../../core/scene/viewportDetector.js' as string);
        const sceneSetup = await import('../scene/setup.js' as string);
        const controlsMod = await import('../scene/controls.js' as string);
        const camera = typeof sceneSetup.getCamera === 'function' ? sceneSetup.getCamera() : null;
        if (!camera || !camera.position) {
            console.debug('[outOfViewportBanner] camera unavailable, skipping check');
            return null;
        }
        const decision = detector.checkOutOfViewportBannerDecision({
            camera: { position: { x: camera.position.x, y: camera.position.y, z: camera.position.z } },
            elements: importedElements || [],
            datasetId,
            threshold,
            isDismissed: isDismissedInSession,
        });
        if (!decision.show) {
            console.debug('[outOfViewportBanner] no-show:', decision.reason, 'dist:', decision.distanceM);
            return null;
        }
        // Translation (lazy)
        let messageText = `Imported data is ${detector.formatDistanceM(decision.distanceM)} from current view`;
        let centerLabel = 'Center on data';
        try {
            const tMod = await import('../i18n/translations.js' as string);
            const t = tMod.t;
            if (typeof t === 'function') {
                const dist = detector.formatDistanceM(decision.distanceM);
                const raw = t('gis.outOfViewport.banner') || messageText;
                messageText = String(raw).replace('{dist}', dist);
                centerLabel = t('gis.outOfViewport.centerBtn') || centerLabel;
            }
        } catch (e: any) {
            console.debug('[outOfViewportBanner:i18n]', e?.message || e);
        }
        const fitAllElements = controlsMod.fitAllElements;
        return showOutOfViewportBanner({
            datasetId,
            distanceM: decision.distanceM,
            messageText,
            centerLabel,
            onCenter: () => {
                if (typeof fitAllElements === 'function') fitAllElements();
            },
        });
    } catch (e: any) {
        console.debug('[outOfViewportBanner:checkAndShow]', e?.message || e);
        return null;
    }
}
