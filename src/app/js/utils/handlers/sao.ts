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

/* ================================================================
   SAO HANDLERS — Protocol Scenario & Matrix Control
   Handlers SAO — Controle de Cenário e Matrizes do Protocolo

   Handlers para selecao de cenario, controle de tier e
   ativacao/desativacao de matrizes ambientais SAO.
   ================================================================ */

import { t } from '../i18n/translations.js';
import { showToast } from '../ui/toast.js';
import { createLogger } from '../helpers/logger.js';
import {
    ensureSAO,
    activateScenario,
    deactivateScenario,
    getActiveScenario,
    setTier,
    getActiveTier,
    toggleMatrix,
    isMatrixActive,
    getActiveMatrixIds,
    getActiveParameters,
    getParameterCounts,
    isSAOActive,
    loadAllMatrices,
} from '../../core/sao/index.js';
import { SAO_SCENARIOS } from '../../core/sao/scenarios.js';
import { SAO_MATRICES } from '../../core/sao/matrices.js';
import { openModal, closeModal } from '../ui/modals.js';
import { hydrateIcons } from '../ui/icons.js';

const log = createLogger('SAO');

export function setUpdateAllUI(_fn: () => void): void {
    // Compatibility hook: SAO handlers use local badge/modal renders.
}

// ================================================================
// SCENARIO HANDLERS
// ================================================================

/**
 * Open the SAO scenario selection modal.
 */
export async function handleOpenSAOScenarioModal(): Promise<void> {
    // LOADING-PERF GAP-2: SAO é lazy. Garante init antes de renderizar o modal
    // (lê cenário/matrizes ativos do estado restaurado). Idempotente.
    await ensureSAO();
    renderSAOScenarioModal();
    openModal('sao-scenario-modal');
}

/**
 * Activate a SAO scenario by ID.
 */
export async function handleActivateScenario(scenarioId: string): Promise<void> {
    try {
        await ensureSAO();
        await activateScenario(scenarioId);
        const scenario: any = (SAO_SCENARIOS as any)[scenarioId];
        const name = scenario ? t(scenario.nameKey) : scenarioId;
        showToast(`SAO: ${name} — ${getActiveMatrixIds().length} ${t('saoLoadedMatrices')}`, 'success');
        closeModal('sao-scenario-modal');
        renderSAOStatusBadge();
    } catch (err: any) {
        log.error('SAO scenario activation failed', err?.message);
        showToast(`SAO Error: ${err?.message}`, 'error');
    }
}

/**
 * Deactivate the current SAO scenario.
 */
export function handleDeactivateScenario(): void {
    deactivateScenario();
    showToast(t('saoNoScenario'), 'info');
    renderSAOStatusBadge();
}

// ================================================================
// TIER HANDLERS
// ================================================================

/**
 * Set the active tier filter level.
 */
export function handleSetTier(tier: string): void {
    setTier(tier);
    const count = getActiveParameters().length;
    showToast(
        `SAO ${t('saoTier')}: ${t('saoTier' + tier.charAt(0).toUpperCase() + tier.slice(1))} — ${count} ${t('saoActiveParams')}`,
        'info',
    );
    renderSAOStatusBadge();
}

// ================================================================
// MATRIX HANDLERS
// ================================================================

/**
 * Toggle a matrix on/off.
 */
export async function handleToggleMatrix(matrixId: string): Promise<void> {
    await ensureSAO();
    await toggleMatrix(matrixId);
    renderSAOStatusBadge();
}

/**
 * Open the SAO matrix/tier control panel modal.
 */
export async function handleOpenSAOMatrixPanel(): Promise<void> {
    // LOADING-PERF GAP-2: garante SAO antes de renderizar contagens/tiers. Idempotente.
    await ensureSAO();
    renderSAOMatrixPanel();
    openModal('sao-matrix-modal');
}

/**
 * Load all SAO matrices at once.
 */
export async function handleLoadAllMatrices(): Promise<void> {
    await ensureSAO();
    await loadAllMatrices();
    showToast('SAO: All matrices loaded', 'success');
    renderSAOStatusBadge();
}

// ================================================================
// UI RENDERING
// ================================================================

function renderSAOScenarioModal(): void {
    let modal = document.getElementById('sao-scenario-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'sao-scenario-modal';
        // B2 migração 2026-05-29: .modal-overlay → .ecbt-overlay (2 modais SAO).
        modal.className = 'ecbt-overlay';
        document.body.appendChild(modal);
    }
    const activeId = getActiveScenario();
    const scenarioCards = Object.values(SAO_SCENARIOS)
        .map((s: any) => {
            const isActive = s.id === activeId;
            const primaryNames = s.primaryMatrices
                .map((m: any) => ((SAO_MATRICES as any)[m] ? t((SAO_MATRICES as any)[m].nameKey) : m))
                .join(', ');
            const secondaryNames = s.secondaryMatrices
                .map((m: any) => ((SAO_MATRICES as any)[m] ? t((SAO_MATRICES as any)[m].nameKey) : m))
                .join(', ');
            return `
            <div class="sao-scenario-card ${isActive ? 'sao-scenario-active' : ''}" data-cc-call-click="handleActivateScenario|s:${encodeURIComponent(`${s.id}`)}">
                <div class="sao-scenario-header">
                    <span class="icon" data-icon="${s.icon}"></span>
                    <strong>${t(s.nameKey)}</strong>
                    ${isActive ? '<span class="badge badge-si">Active</span>' : ''}
                </div>
                <p class="sao-scenario-desc">${t(s.descKey)}</p>
                <div class="sao-scenario-matrices">
                    <div><small><strong>${t('saoPrimaryMatrices')}:</strong> ${primaryNames}</small></div>
                    <div><small>${t('saoSecondaryMatrices')}: ${secondaryNames}</small></div>
                </div>
            </div>
        `;
        })
        .join('');
    modal.innerHTML = `
        <div class="ecbt-dialog ecbt-dialog--lg sao-scenario-dialog">
            <div class="ecbt-dialog-header">
                <h2 class="ecbt-dialog-title">${t('saoSelectScenario')}</h2>
                <button class="ecbt-dialog-close" data-cc-action="cc-031203f0" aria-label="Close"><span data-icon="x" data-icon-size="14px"></span></button>
            </div>
            <div class="ecbt-dialog-body">
                <p class="text-muted">${t('saoSelectScenarioDesc')}</p>
                <div class="sao-scenario-grid">
                    ${scenarioCards}
                </div>
                ${
                    activeId
                        ? `
                    <div style="margin-top: 1rem; text-align: center;">
                        <button class="btn btn-secondary" data-cc-action="cc-801bef04">
                            ${t('saoDeactivate')}
                        </button>
                    </div>
                `
                        : ''
                }
            </div>
        </div>
    `;
    hydrateIcons(modal);
}

function renderSAOMatrixPanel(): void {
    let modal = document.getElementById('sao-matrix-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'sao-matrix-modal';
        // B2 migração 2026-05-29: .modal-overlay → .ecbt-overlay (2 modais SAO).
        modal.className = 'ecbt-overlay';
        document.body.appendChild(modal);
    }
    const currentTier = getActiveTier();
    const counts: any = getParameterCounts();
    const tierButtons = ['essential', 'recommended', 'specialized']
        .map((tier) => {
            const label = t('saoTier' + tier.charAt(0).toUpperCase() + tier.slice(1));
            const isActive = tier === currentTier;
            const tierClass = `sao-tier-btn sao-tier-${tier} ${isActive ? 'sao-tier-active' : ''}`;
            return `<button class="${tierClass}" data-cc-call-click="handleSetTier|s:${encodeURIComponent(`${tier}`)}">${label}</button>`;
        })
        .join('');
    const matrixToggles = Object.values(SAO_MATRICES)
        .map((m: any) => {
            const active = isMatrixActive(m.id);
            const count = counts[m.id] || { essential: 0, recommended: 0, specialized: 0, total: 0 };
            return `
            <div class="sao-matrix-toggle ${active ? 'sao-matrix-active' : ''}" data-cc-call-click="handleToggleMatrix|s:${encodeURIComponent(`${m.id}`)}">
                <div class="sao-matrix-icon" style="background: ${m.color}20; color: ${m.color};">
                    <span class="icon" data-icon="${m.icon}"></span>
                </div>
                <div class="sao-matrix-info">
                    <strong>${t(m.nameKey)}</strong>
                    <small>${count.essential} / ${count.recommended} / ${count.specialized}</small>
                </div>
                <div class="sao-matrix-switch">
                    <input data-field-meta="true" data-field-meta-key="auto-pos:sao:input:L260" type="checkbox" ${active ? 'checked' : ''} data-cc-call-click="__noop" data-cc-stop="1" data-cc-call-change="handleToggleMatrix|s:${encodeURIComponent(`${m.id}`)}">
                </div>
            </div>
        `;
        })
        .join('');
    const activeCount = getActiveParameters().length;
    modal.innerHTML = `
        <div class="ecbt-dialog ecbt-dialog--lg sao-matrix-dialog">
            <div class="ecbt-dialog-header">
                <h2 class="ecbt-dialog-title">${t('saoMatrices')}</h2>
                <button class="ecbt-dialog-close" data-cc-action="cc-630aa30c" aria-label="Close"><span data-icon="x" data-icon-size="14px"></span></button>
            </div>
            <div class="ecbt-dialog-body">
                <div class="sao-tier-selector">
                    <label class="form-label">${t('saoTier')}:</label>
                    <div class="sao-tier-group">${tierButtons}</div>
                </div>
                <div class="sao-status-line">
                    <span>${activeCount} ${t('saoActiveParams')}</span>
                    <span class="text-muted">(${getActiveMatrixIds().length} ${t('saoLoadedMatrices')})</span>
                </div>
                <div class="sao-matrix-list">
                    ${matrixToggles}
                </div>
            </div>
        </div>
    `;
    hydrateIcons(modal);
}

function renderSAOStatusBadge(): void {
    const badge = document.getElementById('sao-status-badge');
    if (!badge) return;
    if (isSAOActive()) {
        const scenario = getActiveScenario();
        const scenarioName: string =
            scenario && (SAO_SCENARIOS as any)[scenario] ? t((SAO_SCENARIOS as any)[scenario].nameKey) : '';
        const count = getActiveParameters().length;
        badge.innerHTML = `SAO: ${scenarioName || t('saoMatrices')} (${count})`;
        badge.style.display = 'inline-block';
    } else {
        badge.style.display = 'none';
    }
}

/**
 * Close the SAO scenario modal.
 */
export function closeSAOScenarioModal(): void {
    closeModal('sao-scenario-modal');
}

// ================================================================
// EXPORTS - Handler registry object
// ================================================================

export const saoHandlers = {
    handleOpenSAOScenarioModal,
    handleActivateScenario,
    handleDeactivateScenario,
    handleSetTier,
    handleToggleMatrix,
    handleOpenSAOMatrixPanel,
    handleLoadAllMatrices,
    closeSAOScenarioModal,
};
