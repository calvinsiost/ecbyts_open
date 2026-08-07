// @ts-check
// Generated from src/app/js/utils/recovery/errorRecoveryRuntime.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/**
 * Browser/runtime integration for SPEC_ERROR_RECOVERY_JOURNEY.
 *
 * Pure modules own state contracts. This adapter owns browser facts: DOM
 * mounting, localStorage inspection, IndexedDB session recovery, heartbeat
 * probes, queue retry buttons, and navigator.storage.estimate().
 */
import {
    DEFAULT_HEARTBEAT_INTERVAL_MS,
    createOnlineState,
    deriveConnectivity,
    reduceOnlineEvent,
    shouldRunHeartbeat,
} from '../network/onlineState.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
import { buildOfflineBannerState, mountOfflineBanner } from '../ui/offlineBanner.js';
import {
    syncMascotWithOfflineState,
    isMascotBubbleAdapterEnabled,
} from '../ui/offlineBannerMascotAdapter.js';
import {
    buildCorruptionDialogState,
    buildRecoveryDialogState,
    mountCorruptionDialog,
    mountRecoveryDialog,
} from '../ui/recoveryDialog.js';
import { buildConflictModalState, mountConflictResolverModal } from '../ui/conflictResolverModal.js';
import {
    assessStoragePressure,
    buildStorageCorruptionReport,
    parseStorageJson,
    summarizeStorageHealth,
} from '../../core/recovery/storageHealth.js';
import { flushSyncQueue, getSyncQueueItems, getSyncQueueSize } from '../storage/syncQueue.js';
import { idbDelete, idbGet } from '../storage/idbStore.js';
import { createPollBackoff, type PollBackoff } from '../helpers/_pollBackoffPure.js';
import { isGuestMode } from '../../main/guestGate.js';
import { SERVER_RECONNECTED_EVENT } from '../helpers/_lazyImportPure.js';
const RUNTIME_KEY = '__ecbytsErrorRecoveryRuntime';
const SESSION_SAVED_AT_KEY = 'ecbyts-session-saved-at';
const SESSION_REVIEWED_AT_KEY = 'ecbyts-recovery-reviewed-at';
const SKIP_RECOVERY_KEY = 'ecbyts-skip-recovery';
const DEFAULT_HEALTH_ENDPOINT = '/api/health';
/** Teto do backoff do heartbeat: server morto = 1 probe a cada ~5min. */
const HEARTBEAT_MAX_INTERVAL_MS = 300_000;
export const DEFAULT_STORAGE_JSON_KEYS = Object.freeze([
    'ecbyts-init-mode',
    'ecbyts-viz-settings',
    'ecbyts-filter-presets',
    'ecbyts-pipelines',
    'ecbyts-pipeline-logs',
    'ecbyts_user_constants',
]);
function nowMs() {
    return Date.now();
}
function safeNumber(value: any, fallback: any = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}
function safeGet(localStorageRef: any, key: string) {
    try {
        return localStorageRef?.getItem?.(key) ?? null;
    } catch (e: any) {
        console.debug('[recovery:safeGet]', /** @type {any} */ (e)?.message || e);
        return null;
    }
}
function safeSet(localStorageRef: any, key: string, value: any) {
    try {
        localStorageRef?.setItem?.(key, String(value));
        return true;
    } catch (e: any) {
        console.debug('[recovery:safeSet]', /** @type {any} */ (e)?.message || e);
        return false;
    }
}
function safeRemove(localStorageRef: any, key: string) {
    try {
        localStorageRef?.removeItem?.(key);
        return true;
    } catch (e: any) {
        console.debug('[recovery:safeRemove]', /** @type {any} */ (e)?.message || e);
        return false;
    }
}
function dispatchWindowEvent(windowRef: any, name: string, detail: any) {
    try {
        windowRef?.dispatchEvent?.(new CustomEvent(name, { detail }));
    } catch (e: any) {
        console.debug('[recovery:dispatchWindowEvent]', /** @type {any} */ (e)?.message || e);
    }
}
function collectStorageEntries(localStorageRef: any, keys: any = DEFAULT_STORAGE_JSON_KEYS) {
    const entries = [];
    for (const key of keys) {
        const raw = safeGet(localStorageRef, key);
        if (raw == null || raw === '') continue;
        entries.push(parseStorageJson(key, raw));
    }
    return entries;
}
function downloadRawStorageEntry({ documentRef, windowRef, localStorageRef, key }: any) {
    const raw = safeGet(localStorageRef, key);
    if (raw == null) return false;
    const blob = new Blob([raw], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = documentRef.createElement('a');
    anchor.href = url;
    anchor.download = `${key}-raw.json`;
    anchor.rel = 'noopener';
    documentRef.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    windowRef.setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
}
async function queueCounts() {
    try {
        const items = (await getSyncQueueItems()) as any[];
        const failedCount = items.filter((item: any) => item.lastError).length;
        return {
            pendingCount: items.length,
            failedCount,
            syncingCount: 0,
        };
    } catch (e: any) {
        console.debug('[recovery:queueCounts]', /** @type {any} */ (e)?.message || e);
        const pendingCount = await getSyncQueueSize().catch(() => 0);
        return { pendingCount, failedCount: 0, syncingCount: 0 };
    }
}
interface RuntimeRefs {
    windowRef: Window & typeof globalThis & Record<string, any>;
    documentRef: Document;
    navigatorRef: Navigator;
    localStorageRef: Storage;
}

interface RuntimeContext extends RuntimeRefs {
    options: Record<string, any>;
    online: ReturnType<typeof createOnlineState>;
    heartbeatTimer: number | null;
    offlineDismissed: boolean;
    lastPressureStatus: string | null;
    healthEndpointUnavailable: boolean;
    healthEndpoint: string;
    heartbeatIntervalMs: number;
    /** BOOT-RESILIENCE-001: espaca o probe quando /api/health nao responde. */
    heartbeatBackoff: PollBackoff;
    heartbeatStopped: boolean;
    showToast: (...args: any[]) => void;
    applyModel: ((model: any) => void | Promise<void>) | null;
    domainRefresh: ((domain: string, reason: string) => void) | null;
    runtime: Record<string, any>;
}

function noop() {
    // intentionally empty
}

function resolveShowToast(options: any, windowRef: Window & typeof globalThis): (...args: any[]) => void {
    if (typeof options.showToast === 'function') return options.showToast;
    if (typeof windowRef.showToast === 'function') return windowRef.showToast;
    return noop;
}

function requestRecoveryUIRefresh(ctx: RuntimeContext, reason = 'recovery.snapshot-restored') {
    if (!ctx.domainRefresh) return;
    const domains = [
        UI_INVALIDATION_DOMAINS.MODEL,
        UI_INVALIDATION_DOMAINS.LISTS,
        UI_INVALIDATION_DOMAINS.SCENE,
        UI_INVALIDATION_DOMAINS.STATUS,
        UI_INVALIDATION_DOMAINS.HOME,
        UI_INVALIDATION_DOMAINS.INSPECTOR,
    ];
    for (const domain of domains) {
        ctx.domainRefresh(domain, reason);
    }
}

function createOfflineActionHandler(ctx: RuntimeContext, counts: { pendingCount: number; failedCount: number; syncingCount: number }) {
    return async (command: any) => {
        if (command.type === 'dismiss_offline_banner') {
            ctx.offlineDismissed = true;
            return true;
        }
        if (command.type === 'retry_sync_queue') {
            await flushSyncQueue({ limit: 50 }).catch(() => null);
            await refreshOfflineStateImpl(ctx);
            return false;
        }
        if (command.type === 'open_sync_queue') {
            ctx.showToast(`${counts.pendingCount} mudanca(s) aguardando sincronizacao.`, 'info');
            return false;
        }
        return true;
    };
}

async function refreshOfflineStateImpl(ctx: RuntimeContext) {
    const connectivity = deriveConnectivity(ctx.online);
    const counts = await queueCounts();
    const input = {
        ...connectivity,
        ...counts,
        userDismissed: ctx.offlineDismissed,
    };
    const onAction = createOfflineActionHandler(ctx, counts);
    // SPEC_OFFLINE_BANNER_TO_MASCOT_BUBBLE Fase 3 — roteia entre adapter
    // (default) e mountOfflineBanner legado via feature flag
    // localStorage['ecbyts-mascot-offline-bubble'] (Calvin kill-switch).
    let state: any;
    if (isMascotBubbleAdapterEnabled()) {
        const result = syncMascotWithOfflineState(input, onAction);
        state = result.state;
    } else {
        state = buildOfflineBannerState(input);
        mountOfflineBanner(state, { documentRef: ctx.documentRef, onAction });
    }
    ctx.runtime.lastConnectivity = connectivity;
    ctx.runtime.lastBannerState = state;
    dispatchWindowEvent(ctx.windowRef, 'ecbyts:error-recovery:offline-state', { connectivity, counts, state });
    return state;
}

/**
 * Fecha o ciclo do backoff do heartbeat (BOOT-RESILIENCE-001).
 * Na BORDA de recuperacao (falhava -> voltou) anuncia na janela que o
 * servidor voltou, para quem degradou nesse periodo se recompor
 * (`lazyImport` re-tenta os chunks que nao carregaram).
 */
function recordHeartbeatOutcome(ctx: RuntimeContext, ok: boolean) {
    if (!ok) {
        ctx.heartbeatBackoff.recordFailure();
        return;
    }
    if (ctx.heartbeatBackoff.recordSuccess()) {
        dispatchWindowEvent(ctx.windowRef, SERVER_RECONNECTED_EVENT, {
            source: 'error-recovery-heartbeat',
            reconnect: true,
            endpoint: ctx.healthEndpoint,
        });
    }
}

async function runHeartbeatImpl(ctx: RuntimeContext, force = false) {
    if (ctx.healthEndpointUnavailable) return ctx.online;
    const now = nowMs();
    if (!force && !shouldRunHeartbeat(ctx.online, now, ctx.heartbeatIntervalMs)) return ctx.online;
    try {
        const response = await ctx.windowRef.fetch(ctx.healthEndpoint, { cache: 'no-store' });
        if (response.status === 404) {
            ctx.healthEndpointUnavailable = true;
            ctx.online = reduceOnlineEvent(ctx.online, { type: 'heartbeat-success', now });
            recordHeartbeatOutcome(ctx, true);
        } else {
            const eventType: 'heartbeat-success' | 'heartbeat-failure' = response.ok ? 'heartbeat-success' : 'heartbeat-failure';
            ctx.online = reduceOnlineEvent(ctx.online, { type: eventType, now });
            recordHeartbeatOutcome(ctx, response.ok === true);
        }
    } catch (e: any) {
        console.debug('[recovery:runHeartbeat]', e?.message || e);
        ctx.online = reduceOnlineEvent(ctx.online, { type: 'heartbeat-failure', now });
        recordHeartbeatOutcome(ctx, false);
    }
    await refreshOfflineStateImpl(ctx);
    return ctx.online;
}

function createStorageActionHandler(ctx: RuntimeContext) {
    return async (command: any) => {
        if (command.type === 'reset_corrupted_workspace') {
            const keys = Array.isArray(command.keys) ? command.keys : [];
            keys.forEach((key: any) => safeRemove(ctx.localStorageRef, key));
            ctx.showToast('Workspace local resetado. Recarregue para iniciar limpo.', 'warning', 6000);
            dispatchWindowEvent(ctx.windowRef, 'ecbyts:error-recovery:storage-reset', { keys });
        } else if (command.type === 'export_raw_storage_entry') {
            downloadRawStorageEntry({
                documentRef: ctx.documentRef,
                windowRef: ctx.windowRef,
                localStorageRef: ctx.localStorageRef,
                key: command.key,
            });
        } else {
            safeSet(ctx.localStorageRef, 'ecbyts-storage-corruption-dismissed-at', nowMs());
        }
        return true;
    };
}

async function estimateStoragePressure(ctx: RuntimeContext) {
    if (!ctx.navigatorRef.storage?.estimate) {
        return assessStoragePressure({ available: false });
    }
    try {
        const estimate = await ctx.navigatorRef.storage.estimate();
        return assessStoragePressure({
            usage: estimate.usage,
            quota: estimate.quota,
        });
    } catch (e: any) {
        console.debug('[recovery:checkStorageHealth:estimate]', e?.message || e);
        return assessStoragePressure({ available: false });
    }
}

async function checkStorageHealthImpl(ctx: RuntimeContext) {
    const storageKeys = ctx.options.storageJsonKeys || DEFAULT_STORAGE_JSON_KEYS;
    const entries = collectStorageEntries(ctx.localStorageRef, storageKeys);
    const corruptionReport = buildStorageCorruptionReport(entries);
    const pressure = await estimateStoragePressure(ctx);
    const summary = summarizeStorageHealth({ corruptionReport, pressure });
    ctx.runtime.lastStorageHealth = summary;
    ctx.windowRef.__ecbytsStorageHealth = summary;
    if (summary.needsUserDecision) {
        const state = buildCorruptionDialogState({ report: corruptionReport });
        mountCorruptionDialog(state, {
            documentRef: ctx.documentRef,
            onAction: createStorageActionHandler(ctx),
        });
    }
    if (pressure.shouldWarn && pressure.status !== ctx.lastPressureStatus) {
        ctx.lastPressureStatus = pressure.status;
        ctx.showToast(pressure.message, pressure.toastKind || 'warning', 6000);
    }
    dispatchWindowEvent(ctx.windowRef, 'ecbyts:error-recovery:storage-health', summary);
    return summary;
}

function countSessionItems(sessionPayload: any) {
    const _count = (v: any) => (Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0);
    return _count(sessionPayload?.elements) + _count(sessionPayload?.campaigns) + _count(sessionPayload?.scenes);
}

function createCrashCloseHandler(ctx: RuntimeContext, savedAt: number) {
    return () => {
        safeSet(ctx.localStorageRef, SESSION_REVIEWED_AT_KEY, savedAt);
    };
}

function createCrashActionHandler(ctx: RuntimeContext, session: any) {
    return async (command: any) => {
        if (command.type === 'restore_snapshot') {
            if (ctx.applyModel) await ctx.applyModel(session);
            requestRecoveryUIRefresh(ctx, 'recovery.snapshot-restored');
            safeSet(ctx.localStorageRef, SESSION_REVIEWED_AT_KEY, nowMs());
            ctx.showToast('Snapshot local restaurado.', 'success');
            dispatchWindowEvent(ctx.windowRef, 'ecbyts:error-recovery:snapshot-restored', command);
            return true;
        }
        if (command.type === 'discard_autosave_snapshots') {
            await idbDelete('ecbyts-session');
            safeSet(ctx.localStorageRef, SESSION_REVIEWED_AT_KEY, nowMs());
            ctx.showToast('Snapshot local descartado.', 'info');
            dispatchWindowEvent(ctx.windowRef, 'ecbyts:error-recovery:snapshot-discarded', command);
            return true;
        }
        ctx.showToast('Comparacao de snapshots ainda nao esta disponivel.', 'info');
        return false;
    };
}

async function checkCrashRecoveryImpl(ctx: RuntimeContext) {
    if (safeGet(ctx.localStorageRef, SKIP_RECOVERY_KEY) === '1') return null;
    const savedAt = safeNumber(safeGet(ctx.localStorageRef, SESSION_SAVED_AT_KEY), 0);
    const reviewedAt = safeNumber(safeGet(ctx.localStorageRef, SESSION_REVIEWED_AT_KEY), 0);
    if (!savedAt || savedAt <= reviewedAt) return null;
    const session = await idbGet('ecbyts-session');
    if (!session || typeof session !== 'object') return null;
    // Skip empty sessions: a snapshot with 0 elements/campaigns/scenes is not
    // meaningful work to recover. Offering it on every boot is just noise
    // ("0 elemento(s)" loop). Mark it reviewed so the check stops firing.
    // Pular sessoes vazias: snapshot com 0 elementos/campanhas/cenas nao tem
    // o que recuperar — oferecer isso a cada boot e so ruido.
    const sessionPayload: any = (session as any).payload ?? (session as any).model ?? session;
    const totalItems = countSessionItems(sessionPayload);
    if (totalItems === 0) {
        safeSet(ctx.localStorageRef, SESSION_REVIEWED_AT_KEY, savedAt);
        return null;
    }
    const state = buildRecoveryDialogState({
        currentSessionLastSavedAt: reviewedAt,
        now: nowMs(),
        snapshots: [
            {
                id: 'ecbyts-session',
                timestamp: savedAt,
                payload: session,
                source: 'local session',
            },
        ],
    });
    mountRecoveryDialog(state, {
        documentRef: ctx.documentRef,
        onClose: createCrashCloseHandler(ctx, savedAt),
        onAction: createCrashActionHandler(ctx, session),
    });
    return state;
}

function createConflictActionHandler(ctx: RuntimeContext) {
    return async (command: any) => {
        ctx.runtime.lastConflictCommand = command;
        ctx.windowRef.__ecbytsLastConflictCommand = command;
        dispatchWindowEvent(ctx.windowRef, 'ecbyts:error-recovery:conflict-command', command);
        ctx.showToast('Conflito resolvido para sincronizacao.', 'success');
        return true;
    };
}

function showConflictModalImpl(ctx: RuntimeContext, input: any = {}) {
    const state = input.kind === 'conflict-resolver-modal' ? input : buildConflictModalState(input);
    mountConflictResolverModal(state, {
        documentRef: ctx.documentRef,
        onAction: createConflictActionHandler(ctx),
    });
    return state;
}

function onOffline(ctx: RuntimeContext) {
    ctx.offlineDismissed = false;
    ctx.online = reduceOnlineEvent(ctx.online, { type: 'browser-offline', now: nowMs() });
    void refreshOfflineStateImpl(ctx);
}

function onOnline(ctx: RuntimeContext) {
    ctx.offlineDismissed = false;
    ctx.online = reduceOnlineEvent(ctx.online, { type: 'browser-online', now: nowMs() });
    void flushSyncQueue({ limit: 50 })
        .catch(() => null)
        .finally(() => refreshOfflineStateImpl(ctx));
}

function onQueueChanged(ctx: RuntimeContext) {
    void refreshOfflineStateImpl(ctx);
}

function onConflictDetected(ctx: RuntimeContext, event: any) {
    showConflictModalImpl(ctx, event.detail || {});
}

function destroy(ctx: RuntimeContext, listeners: { onOffline: () => void; onOnline: () => void; onQueueChanged: () => void; onConflictDetected: (event: any) => void }) {
    // O heartbeat agora e uma cadeia de setTimeout (backoff), nao setInterval:
    // marca parado ANTES de limpar para que um tick em voo nao se reagende.
    ctx.heartbeatStopped = true;
    if (ctx.heartbeatTimer) ctx.windowRef.clearTimeout(ctx.heartbeatTimer);
    ctx.heartbeatTimer = null;
    ctx.windowRef.removeEventListener('offline', listeners.onOffline);
    ctx.windowRef.removeEventListener('online', listeners.onOnline);
    ctx.windowRef.removeEventListener('ecbyts:sync-queue-changed', listeners.onQueueChanged);
    ctx.windowRef.removeEventListener('ecbyts:conflict-detected', listeners.onConflictDetected);
    delete ctx.windowRef[RUNTIME_KEY];
}

/**
 * Agenda o proximo probe de /api/health (BOOT-RESILIENCE-001).
 *
 * Era `setInterval` de cadencia FIXA: com o server local morto isso vira
 * um probe a cada 30s para sempre, com o erro de rede correspondente no
 * console — martelando um endpoint que nao vai responder. Agora e uma
 * cadeia de `setTimeout` guiada pelo backoff: 30s enquanto saudavel,
 * crescendo ate o teto (5min) enquanto falha, e VOLTA para 30s no
 * primeiro sucesso (`recordSuccess` no ciclo do heartbeat).
 */
function scheduleNextHeartbeat(ctx: RuntimeContext) {
    if (ctx.heartbeatStopped) return;
    // 404 = host estatico sem /api/health: o probe nunca mais tem o que
    // fazer, entao a cadeia para de vez em vez de rodar em vazio.
    if (ctx.healthEndpointUnavailable) {
        ctx.heartbeatTimer = null;
        return;
    }
    const delayMs = Math.max(1000, ctx.heartbeatBackoff.nextDelayMs());
    ctx.heartbeatTimer = ctx.windowRef.setTimeout(() => {
        ctx.heartbeatTimer = null;
        void runHeartbeatImpl(ctx, false)
            .catch((e: any) => {
                console.debug('[recovery:heartbeatTick]', e?.message || e);
            })
            .finally(() => scheduleNextHeartbeat(ctx));
    }, delayMs);
}

function startHeartbeatInterval(ctx: RuntimeContext) {
    ctx.heartbeatStopped = false;
    scheduleNextHeartbeat(ctx);
    return ctx.heartbeatTimer;
}

function resolveRuntimeRefs(options: any): RuntimeRefs | null {
    const windowRef = options.windowRef || (typeof window !== 'undefined' ? window : null);
    const documentRef = options.documentRef || (typeof document !== 'undefined' ? document : null);
    const navigatorRef = options.navigatorRef || (typeof navigator !== 'undefined' ? navigator : null);
    const localStorageRef = options.localStorageRef || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!windowRef || !documentRef || !navigatorRef || !localStorageRef) {
        return null;
    }
    return { windowRef, documentRef, navigatorRef, localStorageRef };
}

/**
 * Initialize runtime recovery UX. Idempotent per window.
 *
 * @param {any} options
 */
export function initErrorRecoveryRuntime(options: any = {}) {
    const refs = resolveRuntimeRefs(options);
    if (!refs) return null;
    const { windowRef, documentRef, navigatorRef, localStorageRef } = refs;
    if (windowRef[RUNTIME_KEY]) return windowRef[RUNTIME_KEY];

    const ctx: RuntimeContext = {
        windowRef,
        documentRef,
        navigatorRef,
        localStorageRef,
        options,
        online: createOnlineState({ navigatorOnline: navigatorRef.onLine !== false }),
        heartbeatTimer: null,
        offlineDismissed: false,
        lastPressureStatus: null,
        // ECBYTS-OPEN-LOCAL-001 F1: em Modo Convidado o probe /api/health
        // nasce marcado como indisponível — runHeartbeatImpl retorna cedo e
        // scheduleNextHeartbeat nem agenda (era um 404 de boot, F0 §1.4).
        healthEndpointUnavailable: isGuestMode(),
        healthEndpoint: options.healthEndpoint || DEFAULT_HEALTH_ENDPOINT,
        heartbeatIntervalMs: options.heartbeatIntervalMs || DEFAULT_HEARTBEAT_INTERVAL_MS,
        heartbeatBackoff: createPollBackoff({
            baseMs: Math.max(1000, options.heartbeatIntervalMs || DEFAULT_HEARTBEAT_INTERVAL_MS),
            capMs: options.heartbeatMaxIntervalMs || HEARTBEAT_MAX_INTERVAL_MS,
        }),
        heartbeatStopped: false,
        showToast: resolveShowToast(options, windowRef),
        applyModel: typeof options.applyModel === 'function' ? options.applyModel : null,
        domainRefresh: typeof options.requestUIRefresh === 'function' ? options.requestUIRefresh : null,
        runtime: {},
    };

    function checkStorageHealth() {
        return checkStorageHealthImpl(ctx);
    }
    function refreshOfflineState() {
        return refreshOfflineStateImpl(ctx);
    }
    function runHeartbeat(force = false) {
        return runHeartbeatImpl(ctx, force);
    }

    const runtime: any = {
        initialized: true,
        lastConnectivity: null,
        lastBannerState: null,
        lastStorageHealth: null,
        lastConflictCommand: null,
        checkStorageHealth,
        checkCrashRecovery: () => checkCrashRecoveryImpl(ctx),
        refreshOfflineState,
        showConflictModal: (input: any) => showConflictModalImpl(ctx, input),
        destroy: () => destroy(ctx, listenerBundle),
    };
    ctx.runtime = runtime;

    const listenerBundle = {
        onOffline: () => onOffline(ctx),
        onOnline: () => onOnline(ctx),
        onQueueChanged: () => onQueueChanged(ctx),
        onConflictDetected: (event: any) => onConflictDetected(ctx, event),
    };

    windowRef.addEventListener('offline', listenerBundle.onOffline);
    windowRef.addEventListener('online', listenerBundle.onOnline);
    windowRef.addEventListener('ecbyts:sync-queue-changed', listenerBundle.onQueueChanged);
    windowRef.addEventListener('ecbyts:conflict-detected', listenerBundle.onConflictDetected);
    startHeartbeatInterval(ctx);

    windowRef.ecbytsErrorRecovery = runtime;
    windowRef[RUNTIME_KEY] = runtime;
    // RECOVERY-ON-DEMAND (Calvin pedido 2026-06-02):
    // Modal "Trabalho não salvo encontrado" NÃO abre mais automaticamente
    // no boot. Aparece apenas quando o usuário chama via ecby (mascot avatar)
    // que invoca window.handleCheckCrashRecovery().
    windowRef.handleCheckCrashRecovery = () => {
        void runtime.checkCrashRecovery();
    };
    void checkStorageHealth();
    // void checkCrashRecovery(); — desabilitado: ver handleCheckCrashRecovery acima
    void refreshOfflineState();
    void runHeartbeat(true);
    return runtime;
}
export default { initErrorRecoveryRuntime, DEFAULT_STORAGE_JSON_KEYS };
