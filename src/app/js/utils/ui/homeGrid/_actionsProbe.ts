// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 (actions-probe slice) — helpers de telemetria do probe
 * de ações (`window.__ecbytsActionsProbe`). claude - re-arq 2026-06-20.
 *
 * EN: Pure-ish telemetry helpers extracted from the homeGrid monolith. The probe
 *     captures localStorage, layout metrics (DOM rects of the actions shell) and
 *     a settle-wait used by export/apply replay. Behaviour is BYTE-identical to
 *     the legacy inline `_collectActionsProbeLocalStorage` /
 *     `_captureActionsProbeMetrics` / `_waitForActionsProbeLayoutSettle`.
 *
 *     - collectActionsProbeLocalStorage: pure (reads localStorage only).
 *     - captureActionsProbeMetrics: reads the 6 actions-shell element refs via an
 *       injected context (getters only, no setters) + global constellation DOM.
 *     - waitForActionsProbeLayoutSettle: pure (window/RAF/setTimeout only).
 *
 *     The stateful orchestrators (export/apply/install) STAY in homeGrid.ts: they
 *     read+write ~15 module `let` vars and call 6 module functions, so moving them
 *     would inflate fan-out (a coupled context with setters) — out of scope for
 *     this slice. These 3 helpers are the cohesive, low-coupling sub-cluster.
 *
 * PT (leigo): junta as funcinhas que "fotografam" o estado da tela de ações para
 *     o probe de testes — o que está salvo no navegador, onde cada painel está na
 *     tela, e uma esperinha pro layout assentar. Comportamento idêntico ao antigo.
 */

/**
 * Contexto injetado com os refs de elementos do actions shell (getters only).
 * Equivale a ler as `let` do homeGrid sem acoplá-las (sem setters).
 */
export interface ActionsProbeMetricsContext {
    readonly getShellRoot: () => HTMLElement | null;
    readonly getShellLeft: () => HTMLElement | null;
    readonly getShellMain: () => HTMLElement | null;
    readonly getShellRight: () => HTMLElement | null;
    readonly getWorkspaceSection: () => HTMLElement | null;
    readonly getInspectorPanel: () => HTMLElement | null;
}

export function collectActionsProbeLocalStorage() {
    const snapshot: any = {};
    try {
        for (let i = 0; i < localStorage.length; i += 1) {
            const key = localStorage.key(i) || '';
            if (!key) continue;
            if (
                key.startsWith('ecbyts-') ||
                key.startsWith('sb-') ||
                key === '__e2e_bypass_invite__' ||
                key === 'ecbyts-api'
            ) {
                snapshot[key] = localStorage.getItem(key);
            }
        }
    } catch (e: unknown) {
        console.debug('[homeGrid] collectActionsProbeLocalStorage:', (e as { message?: string } | null)?.message || e);
        /* no-op */
    }
    return snapshot;
}

export function captureActionsProbeMetrics(ctx: ActionsProbeMetricsContext) {
    const rect = /** @param {any} el */ (el: any) => {
        if (!(el instanceof HTMLElement)) return null;
        const box = el.getBoundingClientRect();
        return {
            x: Math.round(box.x),
            y: Math.round(box.y),
            width: Math.round(box.width),
            height: Math.round(box.height),
        };
    };

    const _shellRootEl = ctx.getShellRoot();
    const _shellLeftEl = ctx.getShellLeft();
    const _shellMainEl = ctx.getShellMain();
    const _shellRightEl = ctx.getShellRight();
    const _workspaceSectionEl = ctx.getWorkspaceSection();
    const _inspectorPanelEl = ctx.getInspectorPanel();

    const hud = document.getElementById('constellation-hud');
    const view = document.getElementById('constellation-view-graph');
    const canvas = document.getElementById('constellation-canvas');
    const graphTab = document.querySelector('.constellation-tab[data-ctab="graph"]');
    const pdpluTab = document.querySelector('.constellation-tab[data-ctab="pdplu"]');
    const reportTab = document.querySelector('.constellation-tab[data-ctab="report"]');
    const storyboardTab = document.querySelector('.constellation-tab[data-ctab="storyboard"]');
    const displayOf = /** @param {any} el */ (el: any) => (el instanceof HTMLElement ? getComputedStyle(el).display : null);

    return {
        url: typeof location !== 'undefined' ? location.href : '',
        activeGroup: document.getElementById('app')?.className || '',
        actionsShellPresent: _shellRootEl instanceof HTMLElement,
        shellClass: _shellRootEl?.className || '',
        shellRect: rect(_shellRootEl),
        sidebarRect: rect(_shellLeftEl),
        mainRect: rect(_shellMainEl),
        rightRect: rect(_shellRightEl),
        workspaceRect: rect(_workspaceSectionEl),
        inspectorRect: rect(_inspectorPanelEl),
        hudParentId: hud?.parentElement?.id || '',
        hudClass: hud?.className || '',
        hudRect: rect(hud),
        viewRect: rect(view),
        canvasRect: rect(canvas),
        canvasAttr:
            canvas instanceof HTMLCanvasElement
                ? {
                      width: canvas.width,
                      height: canvas.height,
                  }
                : null,
        tabs: {
            graph: graphTab instanceof HTMLElement ? graphTab.textContent?.trim() || '' : '',
            pdplu: displayOf(pdpluTab),
            report: displayOf(reportTab),
            storyboard: displayOf(storyboardTab),
        },
    };
}

export async function waitForActionsProbeLayoutSettle({ forceRebuild = true }: any = {}) {
    if (typeof window === 'undefined') return;
    const waitFrame = () =>
        new Promise((resolve: any) => {
            requestAnimationFrame(() => requestAnimationFrame(resolve));
        });
    const waitMs = /** @param {any} ms */ (ms: any) =>
        new Promise((resolve: any) => {
            window.setTimeout(resolve, ms);
        });

    await waitFrame();
    window.syncConstellationLayout?.(forceRebuild);
    await waitMs(280);
    await waitFrame();
    window.syncConstellationLayout?.(forceRebuild);
    await waitMs(120);
    await waitFrame();
}
