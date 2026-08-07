// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Generated from src/app/js/main/window-bridges.ts by TS-MIGRATION-001. Do not edit manually.
export function ensureStaticWindowBridges({ switchView }: any) {
    if (typeof window === 'undefined' || typeof window.handleSwitchView === 'function') return;
    window.handleSwitchView = (mode: any) => {
        Promise.resolve(switchView(mode)).catch((err: any) => {
            console.error('[ecbyts] handleSwitchView fallback failed:', err?.message);
        });
    };
}
export function exposeLazyWindowModules({ getAllElements }: any) {
    if (typeof window === 'undefined') return;
    import('../core/taxonomy/fieldResolver.js' as string)
        .then((mod: any) => {
            window.__ecbyts_taxonomy_resolver = mod;
        })
        .catch((_e: any) => console.debug('[main:silent-catch]', _e?.message || _e));
    import('../core/io/geo/coordinates.js' as string)
        .then((mod: any) => {
            window._ecbytsCoordModule = mod;
            mod.setElementsGetter(getAllElements);
        })
        .catch((_e: any) => console.debug('[main:silent-catch]', _e?.message || _e));
}
export function registerEarlyWindowBridges({ authHandlers, handleOpenCreditsPanel, hydrateRegulatoryCalendar, hydrateDecisionLog, hydrateStakeholderShares, hydrateRetentionPolicies, hydrateProvenanceGraphPreview }: any) {
    if (typeof window === 'undefined') return;
    Object.assign(window, authHandlers);
    window.handleOpenCreditsPanel = handleOpenCreditsPanel;
    window.hydrateRegulatoryCalendar = hydrateRegulatoryCalendar;
    window.hydrateDecisionLog = hydrateDecisionLog;
    window.hydrateStakeholderShares = hydrateStakeholderShares;
    window.hydrateRetentionPolicies = hydrateRetentionPolicies;
    window.hydrateProvenanceGraphPreview = hydrateProvenanceGraphPreview;
}
export function registerCalculatorBridge({ getCalculatorItems }: any) {
    if (typeof window === 'undefined') return;
    window.__ecbyts_calculator = { getCalculatorItems };
}
export function registerHandlerRegistryBridge({ registerAllHandlers }: any) {
    if (typeof window === 'undefined') return;
    window.registerAllHandlers = registerAllHandlers;
}
export function registerFeedbackBridges({ apiFeedback }: any) {
    if (typeof window === 'undefined') return;
    window.handleFeedbackLike = () => apiFeedback(1, 'global');
    window.handleFeedbackDislike = () => apiFeedback(-1, 'global');
}
export function registerPerfMonitorBridge({ togglePerfHud }: any) {
    if (typeof window === 'undefined') return;
    window.handleTogglePerfMonitor = togglePerfHud;
}
