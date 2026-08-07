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
/* ================================================================
   DEMO CONTROLLER UI — FAB button, selection panel, navigation overlay
   Interface do modo de demonstracao interativa

   Componentes:
   1. FAB (Floating Action Button) — canto inferior direito
   2. Painel de selecao — vertical/modulo/caso
   3. Navigation overlay — prev/next/exit durante demo ativa

   ================================================================ */
import { getIcon } from './icons.js';
import { t, applyTranslations } from '../i18n/translations.js';
// ----------------------------------------------------------------
// VERTICAL & MODULE METADATA
// ----------------------------------------------------------------
const VERTICALS = [
    {
        id: 'mining',
        icon: 'mountain',
        labelKey: 'demoMining',
        fallback: 'Mining',
        color: '#e67e22',
    },
    {
        id: 'forestry',
        icon: 'trees',
        labelKey: 'demoForestry',
        fallback: 'Forestry',
        color: '#27ae60',
    },
    {
        id: 'contamination',
        icon: 'flask-round',
        labelKey: 'demoContamination',
        fallback: 'Contaminated Areas',
        color: '#e74c3c',
    },
    {
        id: 'occupational_health',
        icon: 'hard-hat',
        labelKey: 'demoOccupationalHealth',
        fallback: 'Occupational Health',
        color: '#3498db',
    },
    {
        id: 'emissions',
        icon: 'factory',
        labelKey: 'demoEmissions',
        fallback: 'Emissões',
        color: '#8e44ad',
    },
];
const MODULES = [
    {
        id: 'neural_net',
        icon: 'brain',
        labelKey: 'demoNeuralNet',
        fallback: 'Neural Network',
        color: '#9b59b6',
    },
    {
        id: 'ai_bot',
        icon: 'bot',
        labelKey: 'demoAIBot',
        fallback: 'AI Bot',
        color: '#1abc9c',
    },
    {
        id: 'satellite',
        icon: 'satellite',
        labelKey: 'demoSatellite',
        fallback: 'Satellite Recognition',
        color: '#f39c12',
    },
];
// ----------------------------------------------------------------
// RISK LEVEL BADGES
// ----------------------------------------------------------------
const RISK_COLORS = {
    low: { bg: '#dcfce7', text: '#166534', label: 'LOW' },
    med: { bg: '#fef3c7', text: '#92400e', label: 'MED' },
    high: { bg: '#fecaca', text: '#991b1b', label: 'HIGH' },
};
// ----------------------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------------------
/**
 * Initialize demo UI components.
 * Creates FAB button if not already present.
 */
export function initDemoUI() {
    // FAB button is in index.html, just ensure it exists
    const fab = document.getElementById('tour-controller');
    if (!fab) {
        console.warn('[DemoUI] #tour-controller not found in DOM');
    }
}
// ----------------------------------------------------------------
// PANEL RENDERING
// ----------------------------------------------------------------
/**
 * Show the demo selection panel.
 */
export function showDemoPanel() {
    const panel = document.getElementById('demo-panel');
    if (panel) {
        panel.style.display = '';
        panel.classList.add('active');
    }
    // Hide FAB when panel is open
    const fab = document.getElementById('tour-controller');
    if (fab) fab.style.display = 'none';
}
/**
 * Hide the demo selection panel.
 */
export function hideDemoPanel() {
    const panel = document.getElementById('demo-panel');
    if (panel) {
        panel.classList.remove('active');
        panel.style.display = 'none';
    }
    // Show FAB again
    const fab = document.getElementById('tour-controller');
    if (fab) fab.style.display = '';
}
/**
 * Render the demo controller panel content.
 * @param {Object} state - DemoState
 * @param {string|null} selectedVertical
 * @param {string|null} selectedModule
 * @param {string|null} selectedCaseId - Optional selected case ID
 * @param {Array<Object>} [availableCases] - Filtered cases to display
 */
export function renderDemoController(state: any, selectedVertical: any, selectedModule: any, selectedCaseId: any, availableCases: any = []) {
    const panel = document.getElementById('demo-panel');
    if (!panel) return;
    let html = '';
    // Header
    html += `
        <div class="demo-panel-header">
            <h3>${safeIcon('play-circle')} ${tSafe('demoMode', 'Demo Mode')}</h3>
            <button class="demo-panel-close" data-cc-action="cc-69d43b61" title="Close">
                ${safeIcon('x')}
            </button>
        </div>
    `;
    html += '<div class="demo-panel-body">';
    // Step 1: Vertical selection
    html += `<div class="demo-section">
        <div class="demo-section-label">${tSafe('demoSelectVertical', 'Select Vertical')}</div>
        <div class="demo-grid">`;
    for (const v of VERTICALS) {
        const isSelected = selectedVertical === v.id;
        const cls = isSelected ? 'demo-card selected' : 'demo-card';
        html += `
            <button class="${cls}" data-cc-call-click="handleSelectVertical|s:${encodeURIComponent(`${v.id}`)}"
                    style="--card-color: ${v.color}">
                <span class="demo-card-icon">${safeIcon(v.icon)}</span>
                <span class="demo-card-label">${tSafe(v.labelKey, v.fallback)}</span>
            </button>`;
    }
    html += `</div></div>`;
    // Step 2: Module selection (only if vertical selected)
    if (selectedVertical) {
        html += `<div class="demo-section">
            <div class="demo-section-label">${tSafe('demoSelectModule', 'Select Module (optional)')}</div>
            <div class="demo-grid demo-grid-3">`;
        for (const m of MODULES) {
            const isSelected = selectedModule === m.id;
            const cls = isSelected ? 'demo-card selected' : 'demo-card';
            html += `
                <button class="${cls}" data-cc-call-click="handleSelectModule|s:${encodeURIComponent(`${m.id}`)}"
                        style="--card-color: ${m.color}">
                    <span class="demo-card-icon">${safeIcon(m.icon)}</span>
                    <span class="demo-card-label">${tSafe(m.labelKey, m.fallback)}</span>
                </button>`;
        }
        html += `</div></div>`;
    }
    // Step 3: Case selection (only if vertical selected and cases available)
    if (selectedVertical && availableCases.length > 0) {
        html += buildCaseListHtml(availableCases, selectedCaseId);
    }
    // Step 4: Start button
    if (selectedVertical) {
        const hasSelected = !!selectedCaseId;
        const btnLabel = hasSelected
            ? tSafe('demoStartSelected', 'Start Selected Case')
            : tSafe('demoStartRandom', 'Start Random Case');
        html += `
            <div class="demo-section demo-actions">
                <button class="demo-start-btn" data-cc-action="cc-7d58c491" ${availableCases.length === 0 ? 'disabled' : ''}>
                    ${safeIcon('play')} ${btnLabel}
                </button>
                ${!hasSelected ? `<span class="demo-hint">${tSafe('demoHintRandom', 'Select a case above, or click to start a random one')}</span>` : ''}
            </div>`;
    }
    html += '</div>';
    panel.innerHTML = html;
    (applyTranslations as any)(panel);
}
// ----------------------------------------------------------------
// NAVIGATION OVERLAY
// ----------------------------------------------------------------
/**
 * Show the navigation overlay during active demo.
 * @param {Object} state - DemoState from getDemoState()
 */
export function showNavigationOverlay(state: any) {
    const overlay = document.getElementById('demo-overlay');
    if (!overlay) return;
    overlay.style.display = '';
    const st = state;
    if (!st.currentCase) return;
    // Defensive 2026-05-15: customLoader-only demos (e.g. individual-health) have
    // no steps array. Treat as 0-step demo with overlay hidden / inert.
    const steps = Array.isArray(st.currentCase.steps) ? st.currentCase.steps : [];
    const current = st.currentStep;
    const total = steps.length;
    if (total === 0) {
        overlay.style.display = 'none';
        return;
    }
    const step = current >= 0 && current < total ? steps[current] : null;
    const progress = total > 0 ? ((current + 1) / total) * 100 : 0;
    const canPrev = current > 0;
    const canNext = current < total - 1;
    // Risk badge
    const risk = (RISK_COLORS as Record<string,any>)[st.currentCase.riskLevel] || RISK_COLORS.med;
    const titleEl = document.getElementById('demo-step-title');
    const counterEl = document.getElementById('demo-step-counter');
    const progressFill = document.getElementById('demo-progress-fill');
    const caseTitle = document.getElementById('demo-case-title');
    const riskBadge = document.getElementById('demo-risk-badge');
    const prevBtn = document.getElementById('demo-prev-btn');
    const nextBtn = document.getElementById('demo-next-btn');
    if (caseTitle) {
        caseTitle.textContent = st.currentCase.title || '';
    }
    if (riskBadge) {
        riskBadge.textContent = risk.label;
        riskBadge.style.backgroundColor = risk.bg;
        riskBadge.style.color = risk.text;
    }
    if (titleEl && step) {
        titleEl.textContent = step.title || '';
    }
    if (counterEl) {
        counterEl.textContent = `${current + 1} / ${total}`;
    }
    if (progressFill) {
        progressFill.style.width = `${progress}%`;
    }
    if (prevBtn) {
        (prevBtn as any).disabled = !canPrev;
        prevBtn.style.opacity = canPrev ? '1' : '0.3';
    }
    if (nextBtn) {
        (nextBtn as any).disabled = !canNext;
        nextBtn.style.opacity = canNext ? '1' : '0.3';
    }
}
/**
 * Hide the navigation overlay.
 */
export function hideNavigationOverlay() {
    const overlay = document.getElementById('demo-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}
// ----------------------------------------------------------------
// PURE RENDER HELPERS (exported for cheap tests)
// ----------------------------------------------------------------
/**
 * Build HTML for the case selection list. Pure function — testable without DOM.
 *
 * UX rule (FEAT-DEMO-ONE-CLICK-001):
 *   - When availableCases.length === 1 → card uses onclick handleStartCaseDirect
 *     (combines select + start in single click, shows prominent play-circle CTA).
 *   - When availableCases.length >= 2 → preserves legacy two-click flow
 *     (card click selects; Start button starts).
 *
 * @param {Array<any>} availableCases
 * @param {string|null} selectedCaseId
 * @returns {string} HTML string
 */
export function buildCaseListHtml(availableCases: any, selectedCaseId: any) {
    if (!Array.isArray(availableCases) || availableCases.length === 0) return '';
    const isSingleCase = availableCases.length === 1;
    const sectionLabel = tSafe('demoSelectCase', 'Select Case');
    let html = `<div class="demo-section">
        <div class="demo-section-label">${sectionLabel} (${availableCases.length})`;
    if (isSingleCase) {
        html += ` <span class="demo-single-case-hint">${tSafe('demoSingleCaseHint', 'Single case — one click starts the demo')}</span>`;
    }
    html += `</div>
        <div class="demo-case-list${isSingleCase ? ' demo-case-list--single' : ''}">`;
    for (const _c of availableCases) {
        const c = _c;
        html += buildCaseCardHtml(c, selectedCaseId, isSingleCase);
    }
    html += `</div></div>`;
    return html;
}
/**
 * Build HTML for a single case card. Pure function — testable without DOM.
 *
 * @param {any} c - Case object with {id, title, description?, riskLevel?, steps?, module?}
 * @param {string|null} selectedCaseId
 * @param {boolean} directStart - When true, card onclick = handleStartCaseDirect.
 * @returns {string} HTML string
 */
export function buildCaseCardHtml(c: any, selectedCaseId: any, directStart: any) {
    if (!c || typeof c !== 'object') return '';
    const id = c.id || '';
    const isSelected = selectedCaseId === id;
    const baseCls = directStart ? 'demo-case-card demo-case-card--direct-start' : 'demo-case-card';
    const cls = isSelected ? `${baseCls} selected` : baseCls;
    const riskColor = (RISK_COLORS as Record<string,any>)[c.riskLevel] || RISK_COLORS.med;
    const stepCount = c.steps?.length || 0;
    const duration = estimateDuration(stepCount);
    const safeId = escapeHtml(id);
    const safeTitle = escapeHtml(c.title || id);
    // CC-S1 B3 artesanal: payload cc-call (nome|arg) em vez de código inline.
    // keydown a11y reusa o handler genérico Enter/Space→click do mapa global
    // (cc-e98cddcb, drenado do index.html na Fase C-B1).
    const ccPayload = directStart
        ? `handleStartCaseDirect|s:${encodeURIComponent(safeId)}`
        : `handleSelectCase|s:${encodeURIComponent(safeId)}`;
    const ariaLabel = directStart ? `Start ${escapeHtml(c.title || id)}` : `Select ${escapeHtml(c.title || id)}`;
    const ctaBadge = directStart
        ? `<span class="demo-case-cta" aria-hidden="true">${safeIcon('play-circle')} <em>${tSafe('demoStartDirectly', 'Click to start')}</em></span>`
        : '';
    return `
        <div class="${cls}" role="button" tabindex="0" aria-label="${ariaLabel}"
             data-cc-call-click="${ccPayload}"
             data-cc-keydown="cc-e98cddcb">
            <div class="demo-case-header">
                <span class="demo-case-title">${safeTitle}</span>
                <span class="demo-case-risk" style="background: ${riskColor.bg}; color: ${riskColor.text}">
                    ${riskColor.label}
                </span>
            </div>
            <div class="demo-case-meta">
                <span>${stepCount} ${tSafe('demoSteps', 'steps')}</span>
                <span>&bull;</span>
                <span>~${duration}</span>
                ${c.module ? `<span>&bull;</span><span>${getModuleLabel(c.module)}</span>` : ''}
            </div>
            ${c.description ? `<p class="demo-case-desc">${escapeHtml(c.description)}</p>` : ''}
            ${ctaBadge}
        </div>`;
}
// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
function safeIcon(name: string) {
    try {
        return getIcon(name, { size: '16px' });
    } catch {
        return '';
    }
}
function tSafe(key: string, fallback: string) {
    try {
        const val = t(key);
        return val && val !== key ? val : fallback;
    } catch {
        return fallback;
    }
}
/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str: any) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
/**
 * Estimate demo duration based on step count.
 * @param {number} stepCount
 * @returns {string} Human-readable duration (e.g., "2 min", "5 min")
 */
function estimateDuration(stepCount: any) {
    if (stepCount === 0) return '1 min';
    // Rough estimate: ~30s per step avg (varies by action type)
    const totalSeconds = stepCount * 30;
    const minutes = Math.ceil(totalSeconds / 60);
    return `${minutes} min`;
}
/**
 * Get module label by ID.
 * @param {string} moduleId
 * @returns {string}
 */
function getModuleLabel(moduleId: any) {
    const module = MODULES.find((m: any) => m.id === moduleId);
    return module ? module.fallback : moduleId;
}
