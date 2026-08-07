// @ts-check
// Generated from src/app/js/utils/tour/tooltip.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   TOUR TOOLTIP — Persistent tooltip for onboarding tour
   Tooltip persistente para o tour de onboarding

   Nao desaparece sozinho — usuario deve clicar Next/Back/Skip.
   Posiciona-se perto do elemento alvo com seta direcional.
   ================================================================ */
import { t } from '../i18n/translations.js';
// ----------------------------------------------------------------
// CONFIG
// ----------------------------------------------------------------
const TOOLTIP_GAP = 16; // px between spotlight and tooltip
// eslint-disable-next-line
const TOOLTIP_MAX_WIDTH = 360; // px
const VIEWPORT_MARGIN = 12; // px from viewport edges
// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------
let tooltipEl: HTMLElement | null = null;
// eslint-disable-next-line
let callbacks: { onNext: Function; onPrev: Function; onSkip: Function } | null = null;
// ----------------------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------------------
/**
 * Initialize tooltip element references.
 */
export function initTooltip() {
    tooltipEl = document.getElementById('tour-tooltip');
}
/**
 * Wire navigation callbacks.
 * @param {{ onNext: Function, onPrev: Function, onSkip: Function }} cbs
 */
export function setTooltipCallbacks(cbs: { onNext: Function; onPrev: Function; onSkip: Function }) {
    callbacks = cbs;
}
/**
 * Whether the tooltip ref is initialized and attached to the DOM.
 * Usado pelo tour engine p/ detectar boot parcial (initTour nunca rodou) e
 * falhar com sinal claro em vez de no-op silencioso em showTooltip.
 */
export function isTooltipReady(): boolean {
    return !!(tooltipEl && document.body.contains(tooltipEl));
}
// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------
/**
 * Show tooltip for a tour step.
 * Posiciona e popula o tooltip perto do elemento alvo.
 *
 * @param {any} step - Step definition (target/title/body/position/interactive/placement)
 * @param {number} stepIndex - Current step index (0-based)
 * @param {number} totalSteps - Total steps in chapter
 * @param {string} chapterName - Chapter display name
 */
export function showTooltip(step: any, stepIndex: number, totalSteps: number, chapterName: string) {
    if (!tooltipEl) return;
    const tt = tooltipEl;
    // Populate content
    _setContent(step, stepIndex, totalSteps, chapterName);
    // Show tooltip before positioning (needs dimensions)
    tt.style.display = 'block';
    tt.style.opacity = '0';
    // Position after a frame (so dimensions are calculated)
    requestAnimationFrame(() => {
        _positionTooltip(step.target, step.position || step.placement || 'bottom');
        tt.style.opacity = '1';
    });
}
/**
 * Hide tooltip.
 */
export function hideTooltip() {
    if (tooltipEl) {
        tooltipEl.style.display = 'none';
    }
}
/**
 * Reposition tooltip for current target (on resize).
 */
export function repositionTooltip() {
    if (!tooltipEl || tooltipEl.style.display === 'none') return;
    const pos = tooltipEl.getAttribute('data-position');
    const sel = tooltipEl.getAttribute('data-target');
    if (sel && pos) {
        _positionTooltip(sel, pos);
    }
}
// ----------------------------------------------------------------
// CONTENT RENDERING
// ----------------------------------------------------------------
/**
 * @param {any} step
 * @param {any} stepIndex
 * @param {any} totalSteps
 * @param {any} chapterName
 */
function _setContent(step: any, stepIndex: number, totalSteps: number, chapterName: string) {
    const counterEl = document.getElementById('tour-step-counter');
    const chapterEl = document.getElementById('tour-chapter-name');
    const titleEl = document.getElementById('tour-tooltip-title');
    const bodyEl = document.getElementById('tour-tooltip-body');
    const prevBtn = /** @type {any} */ (document.getElementById('tour-prev-btn'));
    const nextBtn = /** @type {any} */ (document.getElementById('tour-next-btn'));
    if (counterEl) counterEl.textContent = `${stepIndex + 1} / ${totalSteps}`;
    if (chapterEl) chapterEl.textContent = chapterName;
    if (titleEl) titleEl.textContent = _t(step.title || step.titleKey);
    if (bodyEl) bodyEl.textContent = _t(step.body || step.bodyKey);
    // Disable prev on first step
    if (prevBtn) {
        prevBtn.disabled = stepIndex === 0;
        prevBtn.style.opacity = stepIndex === 0 ? '0.3' : '1';
    }
    // For interactive steps: disable Next (user must act)
    if (nextBtn) {
        const isLast = stepIndex === totalSteps - 1;
        nextBtn.textContent = isLast ? _t('tourFinish', 'Finish') : _t('tourNext', 'Next');
        if (step.interactive) {
            nextBtn.disabled = true;
            nextBtn.style.opacity = '0.3';
        } else {
            nextBtn.disabled = false;
            nextBtn.style.opacity = '1';
        }
    }
    // Store target for repositioning
    if (tooltipEl) tooltipEl.setAttribute('data-target', step.target || '');
}
/**
 * Enable the Next button (called when interactive step completes).
 */
export function enableNextButton() {
    const nextBtn = /** @type {any} */ (document.getElementById('tour-next-btn'));
    if (nextBtn) {
        nextBtn.disabled = false;
        nextBtn.style.opacity = '1';
    }
}
// ----------------------------------------------------------------
// POSITIONING
// ----------------------------------------------------------------
/**
 * @param {any} targetSelector
 * @param {any} preferred
 */
function _positionTooltip(targetSelector: string, preferred: string) {
    const target = document.querySelector(targetSelector);
    if (!target || !tooltipEl) return;
    const tRect = target.getBoundingClientRect();
    // Elemento oculto (display:none, visibility:hidden, ou fora do viewport) - nao posicionar
    if (tRect.width === 0 && tRect.height === 0) return;
    const ttRect = tooltipEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Try preferred position, fallback to opposite
    const positions = _getPriorityOrder(preferred);
    let placed = false;
    for (const pos of positions) {
        const coords = _calcPosition(pos, tRect, ttRect, vw, vh);
        if (coords) {
            tooltipEl.style.top = `${coords.top}px`;
            tooltipEl.style.left = `${coords.left}px`;
            tooltipEl.setAttribute('data-position', pos);
            placed = true;
            break;
        }
    }
    // Fallback: center in viewport
    if (!placed) {
        tooltipEl.style.top = `${(vh - ttRect.height) / 2}px`;
        tooltipEl.style.left = `${(vw - ttRect.width) / 2}px`;
        tooltipEl.setAttribute('data-position', 'center');
    }
}
/** @param {any} preferred */
function _getPriorityOrder(preferred: string) {
    const all = ['bottom', 'top', 'right', 'left'];
    const idx = all.indexOf(preferred);
    if (idx === -1) return all;
    return [preferred, ...all.filter((p) => p !== preferred)];
}
/**
 * @param {any} pos
 * @param {any} tRect
 * @param {any} ttRect
 * @param {any} vw
 * @param {any} vh
 */
function _calcPosition(pos: string, tRect: DOMRect, ttRect: DOMRect, vw: number, vh: number) {
    let top, left;
    switch (pos) {
        case 'bottom':
            top = tRect.bottom + TOOLTIP_GAP;
            left = tRect.left + (tRect.width - ttRect.width) / 2;
            break;
        case 'top':
            top = tRect.top - ttRect.height - TOOLTIP_GAP;
            left = tRect.left + (tRect.width - ttRect.width) / 2;
            break;
        case 'right':
            top = tRect.top + (tRect.height - ttRect.height) / 2;
            left = tRect.right + TOOLTIP_GAP;
            break;
        case 'left':
            top = tRect.top + (tRect.height - ttRect.height) / 2;
            left = tRect.left - ttRect.width - TOOLTIP_GAP;
            break;
        default:
            return null;
    }
    // Verificar encaixe ANTES de qualquer clamp.
    // Se clampear primeiro, os checks abaixo nunca rejeitam - o tooltip seria
    // colocado num canto distante do elemento alvo sem indicacao visual.
    if (top < VIEWPORT_MARGIN || top + ttRect.height > vh - VIEWPORT_MARGIN) return null;
    if (left < VIEWPORT_MARGIN || left + ttRect.width > vw - VIEWPORT_MARGIN) return null;
    // Clamp horizontal leve para targets muito largos (ex: #toolbar full-width)
    left = Math.max(VIEWPORT_MARGIN, Math.min(left, vw - ttRect.width - VIEWPORT_MARGIN));
    return { top, left };
}
// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
/**
 * @param {any} key
 * @param {any} [fallback]
 */
function _t(key: string, fallback = '') {
    try {
        const val = t(key);
        return val && val !== key ? val : fallback || key;
    } catch {
        return fallback || key;
    }
}
//# sourceMappingURL=tooltip.js.map
