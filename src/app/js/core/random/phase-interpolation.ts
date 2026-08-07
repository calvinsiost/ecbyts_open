// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/**
 * Phase Interpolation - RANDOM-REBUILD-V2 Phase C.6 (2026-04-11).
 *
 * Explicit interpolation phase for the Random Module orchestrator.
 * Wraps createTerrainLayer + applyTerrainElevationToElements + fitAllElements
 * with STRUCTURED error handling instead of the silent
 * `.catch((_e: any) => console.debug('[core/random/phase-interpolation:silent-catch]', _e?.message || _e))` that swallowed failures in `main.js:1660`.
 *
 * Why this exists:
 *   - The previous `createTerrainLayer()` call in main.js auto-terrain block
 *     failed silently when the random model had no WGS84 origin set (common
 *     case for synthetic random without lat/lng). Users saw
 *     `[ecbyts:init] random:auto-terrain:failed` warn with no explanation.
 *   - createTerrainLayer throws with specific messages:
 *       'Interpolation group not available'
 *       'No boundary found'
 *       'No origin set'           ← most common during random boot
 *     but main.js swallowed them all the same way.
 *   - This phase returns a TYPED artifact
 *     { createdLayers, terrainOriginDelta, skipped, reason, error }
 *     so callers can distinguish "legitimately skipped" (no origin is fine
 *     for pure random) from "something broke" (group not available is a bug).
 *
 * This module wraps existing `core/interpolation/manager.js` functions -
 * it does NOT reimplement layer math. Zero duplication.
 *
 * @example
 *   import { applyInterpolationPhase } from '/core/random/phase-interpolation.js';
 *   const result = await applyInterpolationPhase({ autoTerrain: true });
 *   if (result.skipped) {
 *       console.info('[interpolation]', result.reason);
 *   } else if (result.error) {
 *       console.warn('[interpolation] failed', result.error);
 *   } else {
 *       console.log('[interpolation] ok', result.createdLayers);
 *   }
 */
import { createTerrainLayer, applyTerrainElevationToElements, setInterpolationToastsQuiet } from '../interpolation/manager.js';
import { hasOrigin } from '../io/geo/coordinates.js';
import { getAllElements } from '../elements/manager.js';
import { fitAllElements } from '../../utils/scene/controls.js';
import { requestRender } from '../../utils/scene/setup.js';
import { isSceneReady } from '../../utils/scene/viewRouter.js';
/**
 * @typedef {Object} InterpolationPhaseResult
 * @property {string[]} createdLayers - ids of successfully created layers
 * @property {number|null} terrainOriginDelta - elev delta (null if skipped)
 * @property {boolean} skipped - true if the phase was legitimately skipped
 * @property {string|null} reason - human-readable reason when skipped
 * @property {Error|null} error - propagated error when an unexpected failure occurred
 * @property {number} phaseDurationMs - total phase duration in ms
 */
/**
 * Run the interpolation phase for the random orchestrator.
 *
 * This function is idempotent per run - safe to call multiple times
 * in one boot as long as you check the returned skipped flag.
 *
 * @param {Object} [opts]
 * @param {boolean} [opts.autoTerrain=true] - whether to create terrain layer
 * @param {boolean} [opts.deferIfSceneNotReady=false] - wait for sceneReady
 *        event before attempting - useful when called during boot before
 *        the lazy scene init has completed
 * @returns {Promise<InterpolationPhaseResult>}
 */
export async function applyInterpolationPhase(opts: any = {}) {
    const startedAt = Date.now();
    const autoTerrain = opts.autoTerrain !== false;
    const deferIfSceneNotReady = opts.deferIfSceneNotReady === true;
    const result: any = {
        createdLayers: [],
        terrainOriginDelta: null,
        skipped: false,
        reason: null,
        error: null,
        phaseDurationMs: 0,
    };
    // 1. SKIP if auto-terrain disabled (caller's decision)
    if (!autoTerrain) {
        result.skipped = true;
        result.reason = 'autoTerrain disabled';
        result.phaseDurationMs = Date.now() - startedAt;
        return result;
    }
    // 2. SKIP if scene is not ready (lazy init has not fired)
    //    We do NOT defer here unless explicitly asked. Silent defer is
    //    worse than an explicit skip because the caller loses visibility.
    if (!isSceneReady()) {
        if (!deferIfSceneNotReady) {
            result.skipped = true;
            result.reason = 'scene not ready (lazy init pending)';
            result.phaseDurationMs = Date.now() - startedAt;
            return result;
        }
        // Wait up to 10s for sceneReady event then continue
        await new Promise((resolve: any) => {
            const timer = setTimeout(() => {
                window.removeEventListener('ecbyts:sceneReady', handler);
                resolve(null);
            }, 10_000);
            const handler = () => {
                clearTimeout(timer);
                resolve(null);
            };
            window.addEventListener('ecbyts:sceneReady', handler, { once: true });
        });
        if (!isSceneReady()) {
            result.skipped = true;
            result.reason = 'scene still not ready after 10s wait';
            result.phaseDurationMs = Date.now() - startedAt;
            return result;
        }
    }
    // 3. SKIP if no WGS84 origin set. This is the MOST COMMON reason for
    //    auto-terrain:failed during random boot - synthetic random without
    //    lat/lng coords cannot fetch real Terrarium tiles from S3. Silent
    //    skip is the correct outcome, but we record the reason.
    if (!hasOrigin()) {
        result.skipped = true;
        result.reason = 'no WGS84 origin set (random without geolocation)';
        result.phaseDurationMs = Date.now() - startedAt;
        return result;
    }
    // 4-5. Criação da layer + apply em modo SILENCIOSO (anti-flood toasts
    // 2026-06-11): este caminho é background/boot — o farol geoStatusBeacon
    // é quem comunica o estado ao usuário, não 6× "Fetching elevation data...".
    setInterpolationToastsQuiet(true);
    try {
        // 4. Try to create the terrain layer
        try {
            const layer = /** @type {{ id?: string } | null | undefined} */ (await createTerrainLayer());
            if (layer?.id)
                result.createdLayers.push(layer.id);
        }
        catch (err: any) {
            result.error = err instanceof Error ? err : new Error(String(err));
            // Known "legitimate skip" messages from createTerrainLayer guards
            const knownSkips = /no origin set|no boundary found|insufficient|interpolation group not available|scene not initialized/i;
            if (knownSkips.test(result.error.message)) {
                result.skipped = true;
                result.reason = result.error.message;
                result.error = null; // downgrade from error to skip
            }
            result.phaseDurationMs = Date.now() - startedAt;
            return result;
        }
        // 5. Apply terrain elevation to elements + fit camera
        try {
            const elevations = _captureCurrentElevations();
            applyTerrainElevationToElements();
            const afterElevations = _captureCurrentElevations();
            result.terrainOriginDelta = _computeDelta(elevations, afterElevations);
            if (typeof fitAllElements === 'function') {
                fitAllElements();
            }
            if (typeof requestRender === 'function') {
                requestRender();
            }
        }
        catch (err: any) {
            // Layer WAS created but downstream apply failed - propagate as soft error
            result.error = err instanceof Error ? err : new Error(String(err));
        }
    } finally {
        setInterpolationToastsQuiet(false);
    }
    result.phaseDurationMs = Date.now() - startedAt;
    return result;
}
/**
 * Snapshot current element elevations for delta computation.
 * @returns {Array<{id: string, y: number}>}
 */
function _captureCurrentElevations() {
    try {
        const elements = getAllElements() || [];
        return elements
            .filter((/** @type {any} */ el) => el?.data?.coordinates)
            .map((/** @type {any} */ el) => ({
            id: el.id,
            y: Number(el.data.coordinates.elevation) || 0
        }));
    }
    catch {
        return [];
    }
}
/**
 * Compute elevation delta magnitude (max |before - after|).
 * Returns 0 if inputs are empty or mismatched.
 */
/**
 * @param {Array<{id: any, y: number}>} before
 * @param {Array<{id: any, y: number}>} after
 */
function _computeDelta(before: any, after: any) {
    if (!before.length || !after.length)
        return 0;
    const beforeMap = new Map(before.map((e: any) => [e.id, e.y]));
    let maxDelta = 0;
    for (const { id, y: yAfter } of after) {
        const yBefore = beforeMap.get(id) as number | undefined;
        if (yBefore === undefined)
            continue;
        const d = Math.abs(yAfter - yBefore);
        if (d > maxDelta)
            maxDelta = d;
    }
    return maxDelta;
}
