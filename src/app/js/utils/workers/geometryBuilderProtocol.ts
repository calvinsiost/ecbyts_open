// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Geometry Builder Worker Protocol
 * Defines the message protocol and task types for the geometry-building Web Worker.
 * Pure-logic module: zero DOM, zero Three.js, zero browser APIs.
 * Both the main thread and the worker import this file to share the protocol schema.
 *
 * The geometry builder worker receives ECBT element descriptors and returns
 * serializable BufferGeometry-compatible data (vertex arrays, index arrays, etc.)
 * that the main thread can hydrate into Three.js objects without any blocking computation.
 *
 * @module geometryBuilderProtocol
 */

// ─── Geometry Task Types ─────────────────────────────────────────────────────

/**
 * Enumeration of supported geometry builder task types.
 * Representa os tipos de tarefa suportados pelo Web Worker de geometria.
 */
export const GEO_TASK = Object.freeze({
    /** Build a box/cube geometry from width/height/depth */
    BUILD_BOX: 'build_box',
    /** Build a sphere geometry from radius and segment counts */
    BUILD_SPHERE: 'build_sphere',
    /** Build an extruded polygon geometry from a 2-D contour */
    BUILD_EXTRUDED_POLYGON: 'build_extruded_polygon',
    /** Build a tube geometry along a 3-D polyline path */
    BUILD_TUBE: 'build_tube',
    /** Build a terrain grid geometry from an elevation array */
    BUILD_TERRAIN_GRID: 'build_terrain_grid',
    /** Compute a plume iso-surface mesh from a scalar voxel field */
    BUILD_PLUME_MESH: 'build_plume_mesh',
    /** Merge multiple geometry descriptors into a single buffer (batching) */
    MERGE_GEOMETRIES: 'merge_geometries',
});

// ─── Geometry Result Status ──────────────────────────────────────────────────

/**
 * Enumeration of result status codes returned by the geometry worker.
 * Representa os códigos de status possíveis em respostas do worker de geometria.
 */
export const GEO_RESULT_STATUS = Object.freeze({
    /** Task completed; geometry data is ready */
    OK: 'ok',
    /** Task failed; geometry could not be computed */
    ERROR: 'error',
    /** Task produced a degraded (lower-quality / fallback) mesh */
    FALLBACK: 'fallback',
});

// ─── LOD Levels ──────────────────────────────────────────────────────────────

/**
 * Level-of-detail options that guide geometry complexity.
 * Controla o nível de detalhe solicitado para a geometria.
 */
export const GEO_LOD = Object.freeze({
    /** Full resolution — for desktop / close camera */
    HIGH: 'high',
    /** Medium resolution — default */
    MEDIUM: 'medium',
    /** Low resolution — mobile or distant camera */
    LOW: 'low',
});

// ─── Geometry Data Descriptor ────────────────────────────────────────────────

/**
 * Create a frozen geometry data descriptor - the serializable representation
 * of a Three.js BufferGeometry that can cross a Worker boundary as JSON.
 * Cria um descritor imutável de dados de geometria compatível com transferência.
 *
 * @param {object} options
 * @param {Float32Array|number[]} options.positions  - Flat [x,y,z,...] vertex positions
 * @param {Uint16Array|Uint32Array|number[]|null} [options.indices]  - Face indices (or null for non-indexed)
 * @param {Float32Array|number[]|null} [options.normals]  - Per-vertex normals
 * @param {Float32Array|number[]|null} [options.uvs]  - Per-vertex UV coordinates
 * @param {string|null} [options.boundingBoxHint]  - Optional serialized AABB hint "minX,minY,minZ,maxX,maxY,maxZ"
 * @returns {Readonly<object>}
 */
export function createGeometryData({
    positions,
    indices = null,
    normals = null,
    uvs = null,
    boundingBoxHint = null,
}: {
    positions: Float32Array | number[];
    indices?: Uint16Array | Uint32Array | number[] | null;
    normals?: Float32Array | number[] | null;
    uvs?: Float32Array | number[] | null;
    boundingBoxHint?: string | null;
}): Readonly<object> {
    if (!positions || (Array.isArray(positions) && positions.length === 0)) {
        throw new TypeError('createGeometryData: positions array must be non-empty');
    }
    return Object.freeze({
        positions,
        indices,
        normals,
        uvs,
        boundingBoxHint,
    });
}

// ─── Priority Levels ─────────────────────────────────────────────────────────

/** @type {ReadonlyArray<string>} Valid priority levels for geometry requests */
const VALID_PRIORITIES: ReadonlyArray<string> = Object.freeze(['high', 'normal', 'low']);

// ─── Auto-incrementing request ID counter ───────────────────────────────────

let _geoRequestCounter = 0;

function _nextGeoRequestId(): string {
    _geoRequestCounter = (_geoRequestCounter + 1) % Number.MAX_SAFE_INTEGER;
    return `geo_req_${Date.now()}_${_geoRequestCounter}`;
}

// ─── Request Factory ─────────────────────────────────────────────────────────

/**
 * Create a frozen geometry build request message to send to the worker.
 * Cria uma mensagem de requisição imutável para o worker de geometria.
 *
 * @param {object} options
 * @param {string} options.taskType  - One of GEO_TASK values
 * @param {object} options.params  - Task-specific geometry parameters
 * @param {string} [options.requestId]  - Optional explicit ID; auto-generated if omitted
 * @param {'high'|'normal'|'low'} [options.priority='normal']  - Execution priority
 * @param {'high'|'medium'|'low'} [options.lod='medium']  - Level of detail
 * @param {string|null} [options.elementId]  - Source ECBT element ID (for cache keying)
 * @returns {Readonly<object>}
 * @throws {TypeError} If taskType is not a recognized GEO_TASK value
 */
export function createGeoRequest({
    taskType,
    params,
    requestId,
    priority = 'normal',
    lod = GEO_LOD.MEDIUM,
    elementId = null,
}: {
    taskType: string;
    params: object;
    requestId?: string;
    priority?: 'high' | 'normal' | 'low';
    lod?: 'high' | 'medium' | 'low';
    elementId?: string | null;
}): Readonly<object> {
    const validTasks = Object.values(GEO_TASK) as string[];
    if (!validTasks.includes(taskType)) {
        throw new TypeError(
            `createGeoRequest: unknown taskType "${taskType}". ` + `Valid values: ${validTasks.join(', ')}`,
        );
    }

    if (!VALID_PRIORITIES.includes(priority)) {
        throw new TypeError(
            `createGeoRequest: invalid priority "${priority}". ` + `Valid values: ${VALID_PRIORITIES.join(', ')}`,
        );
    }

    const validLods = Object.values(GEO_LOD);
    if (!validLods.includes(lod)) {
        throw new TypeError(`createGeoRequest: invalid lod "${lod}". ` + `Valid values: ${validLods.join(', ')}`);
    }

    return Object.freeze({
        taskType,
        params: params ?? null,
        requestId: typeof requestId === 'string' && requestId.length > 0 ? requestId : _nextGeoRequestId(),
        priority,
        lod,
        elementId,
    });
}

// ─── Result Factory ──────────────────────────────────────────────────────────

/**
 * Create a frozen geometry result message to send back from the worker.
 * Cria uma mensagem de resultado imutável retornada pelo worker de geometria.
 *
 * @param {object} options
 * @param {string} options.requestId  - The requestId from the original request
 * @param {string} options.taskType  - The task type that was executed
 * @param {string} options.status  - One of GEO_RESULT_STATUS values
 * @param {object|null} options.geometryData  - Serialized geometry descriptor or null on error
 * @param {string|null} [options.error]  - Error message if status is ERROR
 * @param {string|null} [options.elementId]  - Echo of elementId from the request
 * @param {number|null} [options.triangleCount]  - Number of triangles in the geometry
 * @param {string|null} [options.lodUsed]  - Actual LOD level used (may differ from requested)
 * @returns {Readonly<object>}
 * @throws {TypeError} If status is not a recognized GEO_RESULT_STATUS value
 */
export function createGeoResult({
    requestId,
    taskType,
    status,
    geometryData,
    error = null,
    elementId = null,
    triangleCount = null,
    lodUsed = null,
}: {
    requestId: string;
    taskType: string;
    status: string;
    geometryData: object | null;
    error?: string | null;
    elementId?: string | null;
    triangleCount?: number | null;
    lodUsed?: string | null;
}): Readonly<object> {
    const validStatuses = Object.values(GEO_RESULT_STATUS) as string[];
    if (!validStatuses.includes(status)) {
        throw new TypeError(
            `createGeoResult: unknown status "${status}". ` + `Valid values: ${validStatuses.join(', ')}`,
        );
    }

    return Object.freeze({
        requestId,
        taskType,
        status,
        geometryData: geometryData ?? null,
        error,
        elementId,
        triangleCount,
        lodUsed,
    });
}

// ─── Request Validator ───────────────────────────────────────────────────────

/**
 * Validate a geometry build request and return a structured validation result.
 * Valida uma requisição de geometria e retorna os erros encontrados.
 *
 * @param {*} req
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateGeoRequest(req: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (req === null || typeof req !== 'object') {
        return { valid: false, errors: ['Request must be a non-null object'] };
    }

    const validTasks = Object.values(GEO_TASK);
    if (typeof req.taskType !== 'string' || !validTasks.includes(req.taskType)) {
        errors.push(`taskType "${req.taskType}" is not valid. Accepted: ${validTasks.join(', ')}`);
    }

    if (typeof req.requestId !== 'string' || req.requestId.trim().length === 0) {
        errors.push('requestId must be a non-empty string');
    }

    if (!VALID_PRIORITIES.includes(req.priority)) {
        errors.push(`priority "${req.priority}" is not valid. Accepted: ${VALID_PRIORITIES.join(', ')}`);
    }

    const validLods = Object.values(GEO_LOD);
    if (!validLods.includes(req.lod)) {
        errors.push(`lod "${req.lod}" is not valid. Accepted: ${validLods.join(', ')}`);
    }

    if (!Object.prototype.hasOwnProperty.call(req, 'params')) {
        errors.push('params field is required (may be null)');
    }

    return { valid: errors.length === 0, errors };
}

// ─── Geometry Cache Key ──────────────────────────────────────────────────────

/**
 * Build a string cache key for a geometry request.
 * Useful for deduplication before dispatching to the worker.
 * Constrói uma chave de cache para a requisição de geometria.
 *
 * @param {string} taskType
 * @param {object|null} params
 * @param {string} lod
 * @returns {string}
 */
export function buildGeoCacheKey(taskType: string, params: object | null, lod: string): string {
    let paramsStr;
    try {
        paramsStr = JSON.stringify(params);
    } catch {
        paramsStr = String(params);
    }
    return `${taskType}::${lod}::${paramsStr}`;
}

// ─── Triangle Count Estimate ─────────────────────────────────────────────────

/**
 * Estimate the triangle count for a geometry task before building it.
 * Used to decide whether to request a lower LOD to stay within budget.
 * Estima o número de triângulos esperados para um tipo de geometria.
 *
 * @param {string} taskType  - One of GEO_TASK values
 * @param {'high'|'medium'|'low'} lod
 * @returns {number} Approximate triangle count
 */
export function estimateTriangleCount(taskType: string, lod: 'high' | 'medium' | 'low'): number {
    const budgets = {
        [GEO_TASK.BUILD_BOX]: { high: 12, medium: 12, low: 12 },
        [GEO_TASK.BUILD_SPHERE]: { high: 1024, medium: 256, low: 64 },
        [GEO_TASK.BUILD_EXTRUDED_POLYGON]: { high: 2000, medium: 500, low: 100 },
        [GEO_TASK.BUILD_TUBE]: { high: 800, medium: 200, low: 50 },
        [GEO_TASK.BUILD_TERRAIN_GRID]: { high: 8000, medium: 2000, low: 512 },
        [GEO_TASK.BUILD_PLUME_MESH]: { high: 20000, medium: 5000, low: 1000 },
        [GEO_TASK.MERGE_GEOMETRIES]: { high: 50000, medium: 12000, low: 3000 },
    };

    const validLods = Object.values(GEO_LOD) as string[];
    const safeLod = validLods.includes(lod) ? lod : GEO_LOD.MEDIUM;
    const entry = (budgets as Record<string, Record<string, number>>)[taskType];
    if (!entry) return 0;
    return entry[safeLod] ?? (entry[GEO_LOD.MEDIUM] as number);
}

// ─── Worker Handshake ────────────────────────────────────────────────────────

/**
 * Build the geometry worker handshake message sent during initialization.
 * Constrói a mensagem de handshake do worker de geometria.
 *
 * @returns {Readonly<{type:'handshake', version:string, supportedTasks:string[], supportedLods:string[]}>}
 */
export function buildGeoWorkerHandshake(): Readonly<{
    type: 'handshake';
    version: string;
    supportedTasks: string[];
    supportedLods: string[];
}> {
    return Object.freeze({
        type: 'handshake' as 'handshake',
        version: '1',
        supportedTasks: Object.freeze([...Object.values(GEO_TASK)]) as unknown as string[],
        supportedLods: Object.freeze([...Object.values(GEO_LOD)]) as unknown as string[],
    });
}

// ─── Raw Message Parser ──────────────────────────────────────────────────────

/**
 * Parse and validate a raw message received from/to the geometry worker.
 * Analisa e valida uma mensagem bruta trocada com o worker de geometria.
 *
 * @param {*} raw
 * @returns {Readonly<object>} Validated typed message
 * @throws {TypeError} If the message is structurally invalid
 */
export function parseGeoWorkerMessage(raw: any): Readonly<object> {
    if (raw === null || typeof raw !== 'object') {
        throw new TypeError('parseGeoWorkerMessage: message must be a non-null object');
    }

    // Handshake
    if (raw.type === 'handshake') {
        if (typeof raw.version !== 'string') {
            throw new TypeError('parseGeoWorkerMessage: handshake.version must be a string');
        }
        if (!Array.isArray(raw.supportedTasks)) {
            throw new TypeError('parseGeoWorkerMessage: handshake.supportedTasks must be an array');
        }
        return Object.freeze({ ...raw });
    }

    // Result (has 'status' field)
    if (Object.prototype.hasOwnProperty.call(raw, 'status')) {
        const validStatuses = Object.values(GEO_RESULT_STATUS);
        if (!validStatuses.includes(raw.status)) {
            throw new TypeError(`parseGeoWorkerMessage: unknown result status "${raw.status}"`);
        }
        if (typeof raw.requestId !== 'string') {
            throw new TypeError('parseGeoWorkerMessage: result.requestId must be a string');
        }
        return Object.freeze({ ...raw });
    }

    // Request (has 'taskType' field)
    if (Object.prototype.hasOwnProperty.call(raw, 'taskType')) {
        const { valid, errors } = validateGeoRequest(raw);
        if (!valid) {
            throw new TypeError(`parseGeoWorkerMessage: invalid geo request — ${errors.join('; ')}`);
        }
        return Object.freeze({ ...raw });
    }

    throw new TypeError(
        'parseGeoWorkerMessage: message does not match any known type ' + '(handshake, geo request, or geo result)',
    );
}

// ─── LOD Downgrade ───────────────────────────────────────────────────────────

/**
 * Suggest a lower LOD level when the estimated triangle count exceeds a budget.
 * Returns the same LOD if no downgrade is needed.
 * Sugere um LOD menor quando o número de triângulos excede o orçamento.
 *
 * @param {string} taskType
 * @param {string} currentLod
 * @param {number} triangleBudget  - Maximum allowed triangles
 * @returns {string} The recommended LOD level
 */
export function suggestLodForBudget(taskType: string, currentLod: string, triangleBudget: number): string {
    const lodOrder = [GEO_LOD.HIGH, GEO_LOD.MEDIUM, GEO_LOD.LOW];
    const safeLod = (Object.values(GEO_LOD) as string[]).includes(currentLod) ? currentLod : GEO_LOD.MEDIUM;

    // Try from highest quality down; return first that fits budget.
    // If nothing fits, return the lowest LOD as the best available fallback.
    for (const candidate of lodOrder) {
        if (estimateTriangleCount(taskType, candidate as 'high' | 'medium' | 'low') <= triangleBudget) {
            return candidate;
        }
    }
    // Nothing fits - return the lowest LOD as minimum-triangle fallback,
    // but keep the original lod if it was already the lowest possible.
    return safeLod === GEO_LOD.HIGH ? GEO_LOD.LOW : safeLod;
}
