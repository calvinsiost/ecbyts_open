// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Generated from src/app/js/utils/startup/analyticsInit.ts by TS-MIGRATION-001. Do not edit manually.
// analyticsInit.js - extracted from main.js (ARCH-MONO-002 Phase 2)
// Analytics module boot + refresh handlers.
import { CONFIG } from '../../config.js';
import { getAllElements } from '../../core/elements/manager.js';
import { renderUncertaintyHubPanel, hydrateUncertaintyHubPanel } from '../ui/uncertaintyHubPanel.js';

async function loadAnalytics() {
    const { getAnalytics } = await import('../../core/analytics/index.js' as string);
    return getAnalytics();
}

export function initAnalyticsModule() {
    const workspaceEl = document.getElementById('analytics-workspace');
    if (!workspaceEl) return;
    void initAnalyticsModuleLazy(workspaceEl);
}

async function initAnalyticsModuleLazy(workspaceEl: HTMLElement) {
    try {
        const analytics = await loadAnalytics();
        analytics.initialize(workspaceEl);
        document.getElementById('analytics-refresh-btn')?.addEventListener('click', updateAnalyticsData);
        document.addEventListener('globalFilterChanged', () => updateAnalyticsData());
        document.getElementById('analytics-reset-btn')?.addEventListener('click', () => {
            analytics.getViewportManager()?.resetLayout?.();
        });
        document.getElementById('analytics-sync-btn')?.addEventListener('click', function () {
            const syncManager = analytics.getSyncManager();
            const enabled = !syncManager.isSyncEnabled();
            syncManager.setSyncEnabled(enabled);
            this.classList.toggle('active', enabled);
        });
        const paramSelect = document.getElementById('analytics-parameter-select');
        if (paramSelect) {
            const params = ((CONFIG as any).DEFAULT_PARAMETERS || []) as any[];
            (paramSelect as any).innerHTML = '<option value="">Todos</option>';
            params.forEach((p: any) => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                paramSelect.appendChild(opt);
            });
            paramSelect.addEventListener('change', (e: any) => {
                const tgt = (e.target) as HTMLSelectElement | null;
                analytics.getViewportManager()?.updateHistogramParameter?.(tgt?.value || null);
            });
        }
    }
    catch (error: any) {
        console.error('Erro ao inicializar Analytics:', error);
    }
}
export function initUncertaintyHubPanel() {
    // No-op: kept for test compatibility. Lazy modal replaces boot-time init.
    void renderUncertaintyHubPanel;
    void hydrateUncertaintyHubPanel;
}
export function updateAnalyticsData() {
    void updateAnalyticsDataLazy();
}

async function updateAnalyticsDataLazy() {
    try {
        const panel = document.getElementById('analytics-workspace');
        if (!panel || panel.offsetParent === null) return;
        const analytics = await loadAnalytics();
        analytics.loadData(getAllElements());
    }
    catch (error: any) {
        console.error('Erro ao atualizar Analytics:', error);
    }
}
