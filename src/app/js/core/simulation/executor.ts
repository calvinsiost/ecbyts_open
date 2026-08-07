// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import { getSimulationModel, buildDefaultParams } from './registry.js';
import { hasSimulationConsent } from './consent.js';
import { signData } from '../crypto/signer.js';
import { getAllElements } from '../elements/manager.js';
import { collectObservationPoints } from '../interpolation/manager.js';
import { EMPTY, VADOSE, SATURATED, CONFINING, BEDROCK } from '../voxel/engine.js';

/**
 * Execute a simulation model and return channel payload.
 */
export async function executeSimulation(
    modelId: string,
    params: any,
    volume: any,
    opts: any = {},
): Promise<any> {
    const model: any = getSimulationModel(modelId);
    if (!model) throw new Error(`Simulation model not found: ${modelId}`);
    if (!volume?.dims || !volume?.grid) throw new Error('A valid voxel volume is required.');
    if (!hasSimulationConsent(model.id, model.version)) {
        throw new Error('License consent required before running this model.');
    }
    const mergedParams = { ...buildDefaultParams(model), ...(params || {}) };
    const context = _buildContext(model, mergedParams, volume);
    const startedAt = performance.now();
    let result: any;
    if (model.source.type === 'builtin') {
        const mod: any = await import(model.source.entry);
        const runFn = mod[model.source.fn];
        if (typeof runFn !== 'function') {
            throw new Error(`Solver entry not found: ${model.source.fn}`);
        }
        result = runFn(mergedParams, volume, context);
    } else if (model.source.type === 'cdn-esm') {
        const { importCDN } = await import('../../utils/helpers/cdnLoader.js');
        const { repository, version = 'latest', path: solverPath } = model.source;
        const cdnUrl = `https://cdn.jsdelivr.net/gh/${repository}@${version}/${solverPath}`;
        const mod: any = await importCDN(cdnUrl, { timeout: 30000, name: model.id });
        const runFn = mod[model.source.fn] ?? mod.default;
        if (typeof runFn !== 'function') {
            throw new Error(`Function "${model.source.fn}" not found in ${cdnUrl}`);
        }
        result = await Promise.resolve(runFn(mergedParams, volume, context));
    } else {
        throw new Error(`Unsupported source type: ${model.source.type}`);
    }
    const elapsedMs = performance.now() - startedAt;
    const channel: any = {
        name: model.outputs?.[0]?.id || 'result',
        label: result.label || model.outputs?.[0]?.id || model.name,
        unit: result.unit || model.outputs?.[0]?.unit || '',
        ramp: result.ramp || model.outputs?.[0]?.ramp || 'generic',
        data: result.data,
        min: result.min,
        max: result.max,
        timestamp: Date.now(),
    };
    let signature: any;
    let signaturePayload: any;
    if (opts.signingKeyId) {
        signaturePayload = {
            modelId: model.id,
            modelVersion: model.version,
            params: mergedParams,
            volumeId: volume.id,
            elapsedMs,
            output: {
                channel: channel.name,
                min: channel.min,
                max: channel.max,
                values: channel.data.length,
            },
            timestamp: channel.timestamp,
        };
        try {
            signature = await signData(opts.signingKeyId, signaturePayload);
        } catch {
            signature = undefined;
        }
    }
    return {
        model,
        channel,
        elapsedMs,
        signature,
        signaturePayload,
    };
}

// ----------------------------------------------------------------
// CONTEXT BUILDER - enriches solver call with spatial data
// ----------------------------------------------------------------

function _buildContext(model: any, mergedParams: any, volume: any): any {
    const ctx: any = {
        elements: [],
        sourcePosition: null,
        spatialFields: {},
        zoneGrid: volume.grid,
        zoneConstants: { EMPTY, VADOSE, SATURATED, CONFINING, BEDROCK },
        activeZones: null,
    };
    for (const input of model.inputs || []) {
        if (input.type === 'elementPosition') {
            ctx.sourcePosition = _resolveElementPosition(mergedParams[input.id], volume, input);
        }
        if (input.type === 'observationField' && mergedParams[input.id] === '__spatial__') {
            ctx.spatialFields[input.id] = _buildSpatialField(input, volume);
        }
        if (input.type === 'zoneAware') {
            const zones = mergedParams[input.id] || input.default || [];
            ctx.activeZones = new Set(Array.isArray(zones) ? zones : [zones]);
        }
    }
    return ctx;
}

function _resolveElementPosition(paramValue: any, volume: any, inputDef: any): any {
    if (paramValue && typeof paramValue === 'string') {
        const el: any = (getAllElements() as any[]).find((e: any) => e.id === paramValue);
        if (el) {
            return {
                x: el.data?.coordinates?.easting ?? el.data?.position?.x ?? 0,
                y: el.data?.coordinates?.elevation ?? el.data?.position?.y ?? 0,
                z: el.data?.coordinates?.northing ?? el.data?.position?.z ?? 0,
            };
        }
    }
    if (inputDef.fallback === 'volumeCenter') {
        return {
            x: (volume.bounds.minX + volume.bounds.maxX) / 2,
            y: (volume.yRange.top + volume.yRange.bottom) / 2,
            z: (volume.bounds.minZ + volume.bounds.maxZ) / 2,
        };
    }
    return null;
}

function _buildSpatialField(inputDef: any, volume: any): Float32Array {
    const { nx, ny, nz } = volume.dims;
    const total = nx * ny * nz;
    const points: any[] = collectObservationPoints(inputDef.parameterId) as any[];
    if (points.length < 2) {
        const arr = new Float32Array(total);
        arr.fill(inputDef.scalarFallback || 0);
        return arr;
    }
    // IDW 2D with vertical broadcast - same value for all Y in a column
    const { minX, minZ } = volume.bounds;
    const res = volume.resolution;
    const halfRes = res / 2;
    const field = new Float32Array(total);
    for (let iz = 0; iz < nz; iz++) {
        const wz = minZ + iz * res + halfRes;
        for (let ix = 0; ix < nx; ix++) {
            const wx = minX + ix * res + halfRes;
            const val = _idw2D(wx, wz, points, 2);
            for (let iy = 0; iy < ny; iy++) {
                field[iz * ny * nx + iy * nx + ix] = val;
            }
        }
    }
    return field;
}

/**
 * Inverse Distance Weighting 2D (inline - avoids dependency on interpolation/engine.js).
 */
function _idw2D(x: number, z: number, points: any[], power: number): number {
    let wSum = 0;
    let vSum = 0;
    for (const p of points) {
        const dx = x - p.x;
        const dz = z - p.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 1e-10) return p.value;
        const w = 1 / Math.pow(d2, power / 2);
        wSum += w;
        vSum += w * p.value;
    }
    return wSum > 0 ? vSum / wSum : 0;
}
