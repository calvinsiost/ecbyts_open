// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import { lazyImport } from '../utils/helpers/lazyImport.js';

/** @param {any} error */
function logSilentCatch(error: any) {
    console.debug('[main:silent-catch]', (error as any)?.message || error);
}

const LAZY_REGISTRY_EVENT_LIMIT = 50;
const SCREENSHOT_PREWARM_DELAY_MS = 20000;
const IDLE_PRELOAD_INITIAL_DELAY_MS = 30000;
const IDLE_PRELOAD_SPACING_MS = 4000;
const IDLE_CALLBACK_TIMEOUT_MS = 60000;
let apiBridgeInitPromise: Promise<unknown> | null = null;

function getLazyWindow(): any {
    return typeof window !== 'undefined' ? (window as any) : null;
}

function perfNow(windowRef: any = getLazyWindow()): number {
    const performanceRef = windowRef?.performance;
    return typeof performanceRef?.now === 'function' ? performanceRef.now() : Date.now();
}

function shouldRecordLazyRegistryEvent(windowRef: any = getLazyWindow()): boolean {
    if (!windowRef) return false;
    if (windowRef.__perfRouteVitals || windowRef.__ecbytsWebVitalsFieldMonitor) return true;
    try {
        return windowRef.localStorage?.getItem('ecbyts-perf-debug') === 'true';
    } catch (_error: any) {
        return false;
    }
}

function recordLazyRegistryEvent(label: string, startTime: number, success: boolean, error: any = null): void {
    const windowRef = getLazyWindow();
    if (!shouldRecordLazyRegistryEvent(windowRef)) return;
    const event = {
        label,
        startTime: Math.round(startTime),
        duration: Math.round(perfNow(windowRef) - startTime),
        success,
        error: error ? String(error?.message || error).slice(0, 120) : '',
    };
    const current = Array.isArray(windowRef.__ecbytsLazyRegistryEvents) ? windowRef.__ecbytsLazyRegistryEvents : [];
    windowRef.__ecbytsLazyRegistryEvents = [...current, event].slice(-LAZY_REGISTRY_EVENT_LIMIT);
}

async function runLazyTask(label: string, task: () => Promise<unknown>): Promise<unknown> {
    const startTime = perfNow();
    try {
        const result = await task();
        recordLazyRegistryEvent(label, startTime, true);
        return result;
    } catch (error: any) {
        recordLazyRegistryEvent(label, startTime, false, error);
        throw error;
    }
}

function scheduleIdleWork(task: () => void, delayMs = 0): void {
    const runWhenIdle = () => {
        const windowRef = getLazyWindow();
        const requestIdle = windowRef?.requestIdleCallback;
        if (typeof requestIdle === 'function') {
            requestIdle.call(windowRef, () => task(), { timeout: IDLE_CALLBACK_TIMEOUT_MS });
            return;
        }
        setTimeout(task, 0);
    };
    if (delayMs > 0) {
        setTimeout(runWhenIdle, delayMs);
    } else {
        runWhenIdle();
    }
}

export async function mountFeedbackWidgetLazy({ registerFeedbackBridges }: any) {
    try {
        await runLazyTask('feedback-widget:init', async () => {
            const { mountFeedbackBar, wireKeyboardShortcuts, apiFeedback } = await import(
                '../utils/ui/components/likeDislikeBar.js' as string
            );
            mountFeedbackBar('feedback-mount-statusbar', 'statusbar', { variant: 'compact' });
            wireKeyboardShortcuts();
            registerFeedbackBridges({ apiFeedback });
        });
    } catch (/** @type {any} */ err) {
        console.warn('[feedback] statusbar mount failed:', (err as any)?.message || err);
    }
}
export async function maybeAutoStartTourLazy() {
    if (!localStorage.getItem('ecbyts-tour-shown')) {
        localStorage.setItem('ecbyts-tour-shown', '1');
        try {
            await runLazyTask('auto-tour:load-engine', async () => {
                const { startTour } = await import('../utils/tour/engine.js' as string);
                setTimeout(() => startTour('add-first-element'), 2000);
            });
        } catch (/** @type {any} */ e) {
            console.debug('[lazy-registry] autoTour:', (e as any)?.message || e);
            // tour auto-trigger is non-critical
        }
    }
}
export function installSequencerLazyBridge() {
    const windowRef = getLazyWindow();
    if (!windowRef || windowRef.__ecbyts_sequencer) return;
    const pendingKey = '__ecbyts_pending_storyboard';
    let pendingState = Object.prototype.hasOwnProperty.call(windowRef, pendingKey) ? windowRef[pendingKey] : null;
    let loading: Promise<any> | null = null;
    const ensureReady = async () => {
        if (!loading) {
            loading = runLazyTask('sequencer:on-demand-init', () =>
                import('../core/sequencer/manager.js' as string).then(async (mgr) => {
                    await mgr.initSequencer();
                    return mgr;
                }),
            );
        }
        return loading;
    };
    windowRef.__ecbyts_sequencer = {
        __lazyBridge: true,
        ensureReady,
        getSerializableState() {
            return Object.prototype.hasOwnProperty.call(windowRef, pendingKey) ? windowRef[pendingKey] : pendingState;
        },
        restoreFromSerialized(data: any) {
            pendingState = data ?? null;
            windowRef[pendingKey] = pendingState;
        },
    };
}
export function initLifecycleMetricsLazy() {
    runLazyTask('lifecycle-metrics:init', () =>
        import('../core/analytics/lifecycleMetrics.js' as string).then(({ initLifecycleMetrics }) =>
            initLifecycleMetrics(),
        ),
    ).catch((/** @type {any} */ err) => {
        console.warn('[analytics] lifecycle metrics lazy init failed:', (err as any)?.message || err);
    });
}
export async function maybeInitApiBridgeLazy() {
    const bridgeHostname = typeof window !== 'undefined' ? window.location.hostname : '';
    const bridgeIsLocal =
        bridgeHostname === 'localhost' ||
        bridgeHostname === '127.0.0.1' ||
        bridgeHostname === '::1' ||
        bridgeHostname === '';
    const apiParam = new URLSearchParams(window.location.search).get('api');
    if ((apiParam !== null || localStorage.getItem('ecbyts-api') === 'true') && bridgeIsLocal) {
        try {
            if (!apiBridgeInitPromise) {
                apiBridgeInitPromise = runLazyTask('api-bridge:init', async () => {
                    const { initBridge } = await import('../utils/api/bridge.js' as string);
                    initBridge(apiParam || null);
                });
            }
            await apiBridgeInitPromise;
        } catch (/** @type {any} */ e) {
            apiBridgeInitPromise = null;
            console.warn('[API Bridge] Failed to load:', (e as any)?.message || e);
        }
    } else if ((apiParam !== null || localStorage.getItem('ecbyts-api') === 'true') && !bridgeIsLocal) {
        console.warn(
            '[API Bridge] Rejected: hostname is not localhost. /api/eval exposes arbitrary JS execution and MUST NOT run on public hosts.',
        );
    }
}
/**
 * LOADING-PERF GAP-2 (claude - adm 2026-06-25): warm-up NÃO-BLOQUEANTE de SAO e NN
 * logo após a 1ª tela usável. Saíram do caminho crítico do boot (boot-preflight não
 * mais os aguarda em série). Disparados aqui via requestIdleCallback fora de qualquer
 * `await` crítico, de modo que normalmente já terminaram antes do 1º clique do usuário,
 * sem custar TTI. ensureSAO()/ensureNN() são idempotentes e deduplicam concorrência:
 * se o usuário disparar um consumidor antes do warm-up terminar, ambos compartilham a
 * mesma promise (o trabalho roda EXATAMENTE uma vez).
 */
export function warmupSaoNnLazy() {
    scheduleIdleWork(() => {
        runLazyTask('warmup:sao', () =>
            import('../core/sao/index.js' as string).then(({ ensureSAO }) => ensureSAO()),
        ).catch((err: any) => console.debug('[main:warmup-sao]', err?.message || err));
        runLazyTask('warmup:nn', () =>
            import('../core/nn/manager.js' as string).then(({ ensureNN }) => ensureNN()),
        ).catch((err: any) => console.debug('[main:warmup-nn]', err?.message || err));
    });
}
export function scheduleScreenshotPrewarmLazy() {
    scheduleIdleWork(() => {
        runLazyTask('screenshot:prewarm', () =>
            import('../utils/errorReporting/screenshot.js' as string).then(({ prewarmScreenshot }) =>
                prewarmScreenshot(),
            ),
        ).catch(logSilentCatch);
    }, SCREENSHOT_PREWARM_DELAY_MS);
}
export function scheduleIdlePreloadsLazy() {
    // REF-SWEEPS RF-2: preloads usam lazyImport (fail-soft, toast unico por
    // dependencia caida, retry na reconexao). Antes: import() cru estourava
    // `Uncaught (in promise)` com o server local morto (BOOT-RESILIENCE-001).
    const preloads = [
        { label: 'siteResearch', path: '../core/llm/siteResearch.js', importer: () => import('../core/llm/siteResearch.js' as string) },
        { label: 'complianceDashboard', path: '../core/governance/complianceDashboard.js', importer: () => import('../core/governance/complianceDashboard.js' as string) },
        { label: 'auditTrail', path: '../core/governance/auditTrail.js', importer: () => import('../core/governance/auditTrail.js' as string) },
        { label: 'observationLock', path: '../core/governance/observationLock.js', importer: () => import('../core/governance/observationLock.js' as string) },
        { label: 'regulatoryCalendar', path: '../core/governance/regulatoryCalendar.js', importer: () => import('../core/governance/regulatoryCalendar.js' as string) },
    ].map((p) => ({
        label: p.label,
        run: () => lazyImport(p.path, { importer: p.importer }),
    }));
    const runNext = (index: number) => {
        const preload = preloads[index];
        if (!preload) return;
        const delayMs = index === 0 ? IDLE_PRELOAD_INITIAL_DELAY_MS : IDLE_PRELOAD_SPACING_MS;
        scheduleIdleWork(() => {
            runLazyTask(`preload-idle:${preload.label}`, preload.run)
                .catch((/** @type {any} */ error) =>
                    console.debug('[main:preload-idle]', (error as any)?.message || error),
                )
                .finally(() => runNext(index + 1));
        }, delayMs);
    };
    runNext(0);
}

export async function initFineScenarioConsoleLazy(): Promise<unknown> {
    return runLazyTask('optional-ui:fine-scenario-console', () =>
        import('../utils/ui/fineScenarioConsole.js' as string).then(({ initFineScenarioConsole }) =>
            initFineScenarioConsole(),
        ),
    ).catch(logSilentCatch);
}

export function scheduleOptionalUiBootstrapsLazy(): void {
    scheduleIdleWork(() => {
        const bootstraps = [
            {
                label: 'compliance-violations-fab',
                load: () =>
                    import('../utils/ui/complianceViolationsFab.js' as string).then(
                        ({ initComplianceViolationsFab }) => initComplianceViolationsFab(),
                    ),
            },
            {
                label: 'violation-details-modal',
                load: () =>
                    import('../utils/ui/violationDetailsModal.js' as string).then(
                        ({ initViolationDetailsModal }) => initViolationDetailsModal(),
                    ),
            },
            {
                label: 'fis-panel',
                load: () =>
                    import('../utils/ui/fisPanel.js' as string).then(({ initFisPanel }) => initFisPanel()),
            },
            {
                label: 'command-palette-access',
                load: () =>
                    import('../utils/ui/commandPaletteAccess.js' as string).then(
                        ({ initCommandPaletteAccess }) => initCommandPaletteAccess(),
                    ),
            },
        ];
        for (const bootstrap of bootstraps) {
            void runLazyTask(`optional-ui:${bootstrap.label}`, bootstrap.load).catch(logSilentCatch);
        }
    });
}
