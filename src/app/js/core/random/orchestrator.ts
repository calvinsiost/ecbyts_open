// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Random Module Orchestrator V2 (RANDOM-REBUILD-V2 / Phase A)

import { createSeededRng, generateFallbackSeed, hashString } from './prng.js';
import { realNow } from './runtime.js';

function _nextRunId(): any {
    const root: any = typeof window !== 'undefined' ? window : globalThis;
    root.__ecbytsRandomRunCount = Number(root.__ecbytsRandomRunCount || 0) + 1;
    return root.__ecbytsRandomRunCount;
}

function _emitLifecycle(event: any, payload: any = {}): void {
    const root: any = typeof window !== 'undefined' ? window : globalThis;
    if (!Array.isArray(root.__ecbytsRandomLifecycle)) {
        root.__ecbytsRandomLifecycle = [];
    }
    const entry = {
        // realNow(): dentro do run o Date global está mockado (congelado) —
        // ts congelado fazia toda fase aparentar 0ms no console/lifecycle.
        ts: realNow(),
        event,
        ...payload,
    };
    root.__ecbytsRandomLifecycle.push(entry);
    console.debug(`[randomOrchestrator] ${event}`, payload);
}

function _getRoot(): any {
    return (typeof window !== 'undefined' ? window : globalThis) as any;
}

function _resolveCameraPolicy(source: any, options: any = {}): any {
    const explicit = options?.cameraPolicy;
    if (typeof explicit === 'string') return explicit;

    if (source === 'boot-random') {
        try {
            if (_getRoot()?.localStorage?.getItem('ecbyts-camera-state')) {
                return 'preserve_boot_camera';
            }
        } catch (e: any) {
            console.debug('[random-orchestrator] localStorage-camera-check:', e?.message || e);
            /* localStorage unavailable */
        }
    }

    return 'isometric_fit';
}

function _resolveSeed(explicitSeed: any): any {
    return explicitSeed === undefined || explicitSeed === null || explicitSeed === ''
        ? generateFallbackSeed()
        : explicitSeed;
}

function _normalizeSeed(seed: any): any {
    return typeof seed === 'number' ? seed >>> 0 : String(seed);
}

function _seedToTimestamp(seed: any): any {
    const normalized = _normalizeSeed(seed);
    const hash = typeof normalized === 'number' ? normalized : hashString(normalized);
    const yearMs = 365 * 24 * 60 * 60 * 1000;
    return Date.UTC(2025, 0, 1) + (hash % yearMs);
}

function _createSeededUuidFactory(seed: any): () => string {
    const rng = createSeededRng(`${_normalizeSeed(seed)}::uuid`);
    return () => {
        const bytes = Array.from({ length: 16 }, () => Math.floor(rng() * 256));
        bytes[6] = ((bytes[6] as number) & 0x0f) | 0x40;
        bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
        const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
        return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
    };
}

async function _runWithDeterministicRuntime(seed: any, fn: any): Promise<any> {
    const root: any = _getRoot();
    const normalizedSeed = _normalizeSeed(seed);
    const uuidFn = _createSeededUuidFactory(normalizedSeed);
    const fixedNow = _seedToTimestamp(normalizedSeed);
    const RealDate = root.Date;
    const previousUuid = root.__ecbytsRandomSeededUuid;
    const previousSeed = root.__ecbytsRandomActiveSeed;
    const previousRuntime = root.__ecbytsRandomRuntime;
    const streamCache = new Map();

    function getRng(channel = 'default') {
        const key = String(channel || 'default');
        if (!streamCache.has(key)) {
            streamCache.set(key, createSeededRng(`${normalizedSeed}::${key}`));
        }
        return streamCache.get(key);
    }

    class DeterministicDate extends RealDate {
        constructor(...args: any[]) {
            super(...(args.length === 0 ? [fixedNow] : (args as any)));
        }

        static now() {
            return fixedNow;
        }

        static parse(value: any) {
            return RealDate.parse(value);
        }

        static UTC(...args: any[]) {
            return RealDate.UTC(...(args as any));
        }
    }

    try {
        root.Date = DeterministicDate;
        root.__ecbytsRandomSeededUuid = uuidFn;
        root.__ecbytsRandomActiveSeed = normalizedSeed;
        root.__ecbytsRandomRuntime = {
            seed: normalizedSeed,
            rng: () => getRng('default')(),
            getRng,
            now: () => fixedNow,
            uuid: uuidFn,
        };
        return await fn();
    } finally {
        root.Date = RealDate;
        if (typeof previousUuid === 'function') root.__ecbytsRandomSeededUuid = previousUuid;
        else delete root.__ecbytsRandomSeededUuid;
        if (previousSeed !== undefined) root.__ecbytsRandomActiveSeed = previousSeed;
        else delete root.__ecbytsRandomActiveSeed;
        if (previousRuntime && typeof previousRuntime === 'object') root.__ecbytsRandomRuntime = previousRuntime;
        else delete root.__ecbytsRandomRuntime;
    }
}

function _clearPendingCameraApply(): void {
    const root = _getRoot();
    const pending = root.__ecbytsRandomPendingCameraApply;
    if (pending?.cleanup) {
        try {
            pending.cleanup();
        } catch (e: any) {
            console.debug('[random-orchestrator] pending-cleanup:', e?.message || e);
            /* best effort cleanup */
        }
    }
    root.__ecbytsRandomPendingCameraApply = null;
}

async function _applyCameraPolicy(cameraPolicy: any, opts: any = {}): Promise<void> {
    const { runId, source } = opts;
    _emitLifecycle('phase:camera:policy', { runId, source, cameraPolicy });

    if (cameraPolicy === 'none' || cameraPolicy === 'preserve_boot_camera') {
        _clearPendingCameraApply();
        return;
    }

    if (cameraPolicy !== 'isometric_fit') {
        _emitLifecycle('phase:camera:unsupported', { runId, source, cameraPolicy });
        return;
    }

    await _waitForCameraSettle();

    const [{ setIsometricView }, { isSceneReady }] = await Promise.all([
        import('../../utils/scene/controls.js'),
        import('../../utils/scene/viewRouter.js'),
    ]);

    const root = _getRoot();
    _clearPendingCameraApply();

    if (isSceneReady()) {
        setIsometricView();
        _emitLifecycle('phase:camera:applied', { runId, source, cameraPolicy, mode: 'immediate' });
        return;
    }

    if (typeof window === 'undefined') {
        _emitLifecycle('phase:camera:skipped', {
            runId,
            source,
            cameraPolicy,
            reason: 'no-window',
        });
        return;
    }

    const applyOnce = () => {
        try {
            setIsometricView();
            _emitLifecycle('phase:camera:applied', { runId, source, cameraPolicy, mode: 'deferred' });
        } catch (error: any) {
            _emitLifecycle('phase:camera:error', {
                runId,
                source,
                cameraPolicy,
                message: error?.message || String(error),
            });
        } finally {
            cleanup();
        }
    };

    const cleanup = () => {
        window.removeEventListener('ecbyts:sceneReady', applyOnce);
        window.removeEventListener('groupChanged', applyOnce);
        root.__ecbytsRandomPendingCameraApply = null;
    };

    window.addEventListener('ecbyts:sceneReady', applyOnce, { once: true });
    window.addEventListener('groupChanged', applyOnce, { once: true });
    root.__ecbytsRandomPendingCameraApply = { cleanup, runId, source, cameraPolicy };
    _emitLifecycle('phase:camera:deferred', { runId, source, cameraPolicy });
}

function _waitForCameraSettle(): Promise<any> {
    const root = _getRoot();
    const waitFrame =
        typeof root.requestAnimationFrame === 'function'
            ? new Promise((resolve) => root.requestAnimationFrame(resolve))
            : Promise.resolve();

    return waitFrame.then(
        () =>
            new Promise((resolve) => {
                setTimeout(resolve, 200);
            }),
    );
}

/**
 * Random lifecycle orchestrator (Phase A wrapper).
 * Keeps existing behavior while producing deterministic lifecycle logs.
 *
 * @param {Object} params
 * @param {string} params.source - where run started (boot|manual|api)
 * @param {Set<string>|null} params.selectedFamilies
 * @param {Object} params.options
 * @param {Function} [params.onProgress]
 * @param {Function} params.generateRandomModelFn
 * @param {Function} params.buildFullRandomModelFn
 * @returns {Promise<Object>} randomResult
 */
export async function runRandomOrchestratorV2({
    source = 'unknown',
    selectedFamilies = null,
    options = {},
    onProgress,
    generateRandomModelFn,
    buildFullRandomModelFn,
}: {
    source?: string;
    selectedFamilies?: Set<string> | null;
    options?: any;
    onProgress?: Function;
    generateRandomModelFn?: Function;
    buildFullRandomModelFn?: Function;
}): Promise<object> {
    if (typeof generateRandomModelFn !== 'function' || typeof buildFullRandomModelFn !== 'function') {
        throw new Error('runRandomOrchestratorV2 requires generateRandomModelFn and buildFullRandomModelFn');
    }

    const runId = _nextRunId();
    const startedAt = Date.now();
    const progress = typeof onProgress === 'function' ? onProgress : () => {};
    const cameraPolicy = _resolveCameraPolicy(source, options);
    const resolvedSeed = _resolveSeed((options as any)?.seed);
    const root = _getRoot();
    root.__ecbytsRandomLastSeed = resolvedSeed;

    _emitLifecycle('run:start', {
        runId,
        source,
        selectedFamilyCount: selectedFamilies ? selectedFamilies.size : null,
        cameraPolicy,
        seed: resolvedSeed,
    });

    try {
        const randomResult = await _runWithDeterministicRuntime(resolvedSeed, async () => {
            progress(15, 'Generating random structure...');
            _emitLifecycle('phase:generate:start', { runId, source, seed: resolvedSeed });
            const generateStartedAt = realNow();
            // Inject runId so generateRandomModel does NOT increment the global
            // counter again. Without this flag the counter goes 1,3,5,... because
            // both orchestrator and generateRandomModel bump it.
            const innerOptions = { ...(options || {}), seed: resolvedSeed, __orchestratorRunId: runId };
            const generated = await generateRandomModelFn(selectedFamilies, innerOptions);
            _emitLifecycle('phase:generate:finish', {
                runId,
                source,
                seed: resolvedSeed,
                durationMs: realNow() - generateStartedAt,
                campaigns: Array.isArray(generated?.campaigns) ? generated.campaigns.length : 0,
                edges: Array.isArray(generated?.edges) ? generated.edges.length : 0,
            });

            progress(30, 'Building full model...');
            _emitLifecycle('phase:build:start', { runId, source, seed: resolvedSeed });
            const buildPhaseStartedAt = realNow();
            await buildFullRandomModelFn(generated, {
                onProgress: (pct: any, msg: any) => progress(pct, msg),
                __randomRunId: runId,
                __randomSource: source,
                __enforceNeutralBackground: true,
                __skipCameraFinalize: true,
                __randomSeed: resolvedSeed,
            });
            _emitLifecycle('phase:build:finish', {
                runId,
                source,
                seed: resolvedSeed,
                durationMs: realNow() - buildPhaseStartedAt,
            });

            await _applyCameraPolicy(cameraPolicy, { runId, source });
            return generated;
        });

        _emitLifecycle('run:finish', {
            runId,
            source,
            cameraPolicy,
            seed: resolvedSeed,
            durationMs: Date.now() - startedAt,
        });
        return randomResult;
    } catch (error: any) {
        _emitLifecycle('run:error', {
            runId,
            source,
            seed: resolvedSeed,
            durationMs: Date.now() - startedAt,
            message: error?.message || String(error),
        });
        throw error;
    }
}
