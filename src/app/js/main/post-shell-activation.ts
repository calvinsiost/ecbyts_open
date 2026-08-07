// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

const POST_SHELL_IDLE_TIMEOUT_MS = 2500;

function schedulePostShellIdleTask(label: string, task: () => Promise<unknown>): void {
    const run = () => task().catch((error: any) => console.debug(`[post-shell-activation:${label}]`, error?.message || error));
    const windowRef = typeof window !== 'undefined' ? window : null;
    if (typeof windowRef?.requestIdleCallback === 'function') {
        windowRef.requestIdleCallback(run, { timeout: POST_SHELL_IDLE_TIMEOUT_MS });
        return;
    }
    Promise.resolve().then(run);
}

export async function runPostShellActivationSequence(/** @type {any} */ {
    mountFeedbackWidgetLazy,
    registerAllHandlers,
    registerFeedbackBridges,
    registerHandlerRegistryBridge,
    translate,
    requestUIRefresh,
    // eslint-disable-next-line
    updateAnalyticsData,
    updateLoading,
    initTour,
    maybeAutoStartTourLazy,
    initHistory,
    buildModel,
    applyModel,
    installSequencerLazyBridge
}: any) {
    updateLoading(translate('registeringHandlers') || 'Registering handlers...', 80);

    // registerAllHandlers ja foi chamado cedo em main.js (antes de runRandomBootSequence)
    // para que E2E walkers detectem app-ready via window.handleAddElement sem furar timeout.
    // registerHandlerRegistryBridge ainda roda aqui pois nao depende de timing critico.
    registerHandlerRegistryBridge({ registerAllHandlers });

    schedulePostShellIdleTask('feedback-widget', () => mountFeedbackWidgetLazy({ registerFeedbackBridges }));

    initTour();
    schedulePostShellIdleTask('auto-tour', () => maybeAutoStartTourLazy());
    initHistory({ buildModel, applyModel, requestUIRefresh });
    installSequencerLazyBridge();
}
