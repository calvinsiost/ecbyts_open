// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Environmental Geo Analytics Schema - ECBT
 *
 * Pure-logic factories and validators for spatial geometry analytics and
 * geocomputation primitives. Esquema canônico para registros geométricos,
 * validações topológicas, distâncias geodésicas, centroides e largura de
 * banda de kernel para análise espacial.
 *
 * Domain references (used as factual/normative basis only - no code copied):
 * - PostGIS conventions (ST_* function naming)
 * - ESRI ArcGIS Pro spatial statistics toolset
 * - OGC standards (Simple Features Access, KML, WKT)
 * - INPE TerraLib spatial data structures
 * - ABNT NBR 13133 - Execução de levantamento topográfico
 *
 * Constraints:
 * - Zero DOM, zero browser APIs, zero external imports
 * - All enums frozen via Object.freeze
 * - All record factories return Object.freeze
 */

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export const SPATIAL_OPERATION = Object.freeze({
    BUFFER: 'BUFFER',
    INTERSECT: 'INTERSECT',
    UNION: 'UNION',
    DIFFERENCE: 'DIFFERENCE',
    CONVEX_HULL: 'CONVEX_HULL',
    CENTROID: 'CENTROID',
    NEAREST_NEIGHBOR: 'NEAREST_NEIGHBOR',
    KERNEL_DENSITY: 'KERNEL_DENSITY',
});

export const GEOMETRY_TYPE = Object.freeze({
    POINT: 'POINT',
    LINE: 'LINE',
    POLYGON: 'POLYGON',
    MULTIPOINT: 'MULTIPOINT',
    MULTILINE: 'MULTILINE',
    MULTIPOLYGON: 'MULTIPOLYGON',
});

export const CRS_FAMILY = Object.freeze({
    WGS84_GEOGRAPHIC: 'WGS84_GEOGRAPHIC',
    UTM_PROJECTED: 'UTM_PROJECTED',
    SIRGAS2000: 'SIRGAS2000',
    ALBERS_EQUAL_AREA: 'ALBERS_EQUAL_AREA',
});

export const SPATIAL_ERROR_TYPE = Object.freeze({
    TOPOLOGY: 'TOPOLOGY',
    INVALID_GEOMETRY: 'INVALID_GEOMETRY',
    OUT_OF_EXTENT: 'OUT_OF_EXTENT',
    CRS_MISMATCH: 'CRS_MISMATCH',
});

export const GEO_ANALYTICS_ERROR = Object.freeze({
    INVALID_OP: 'INVALID_OP',
    INVALID_GEOMETRY: 'INVALID_GEOMETRY',
    INVALID_CRS: 'INVALID_CRS',
});

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Raio médio da Terra em km (esfera de referência IUGG). */
export const EARTH_RADIUS_KM = 6371.0088;

/** Comprimento de 1 grau de latitude em metros, no equador WGS84. */
export const WGS84_TO_M_LAT = 110540;

/** Precisão default de buffer (metros). */
export const BUFFER_PRECISION_M = 1.0;

/** Fator Silverman para kernel bandwidth: 1.06 * std * n^(-1/5). */
export const KERNEL_BANDWIDTH_FACTOR = 1.06;

/**
 * Complexidade assintótica de operações espaciais - referência informativa
 * para planejamento de pipeline e controle de timeouts.
 */
export const SPATIAL_OP_COMPLEXITY = Object.freeze({
    BUFFER: 'O(n)',
    INTERSECT: 'O(n²)',
    UNION: 'O(n²)',
    DIFFERENCE: 'O(n²)',
    CONVEX_HULL: 'O(n log n)',
    CENTROID: 'O(n)',
    NEAREST_NEIGHBOR: 'O(n²)',
    KERNEL_DENSITY: 'O(nk)',
});

/** Identidade do módulo. */
export const GEO_ANALYTICS_META = Object.freeze({
    spec: 'GEO_ANALYTICS_SCHEMA_001',
    deliveredAt: '2026-05-02',
    framework: 'PostGIS/OGC-SFA/INPE-TerraLib',
    operations: Object.values(SPATIAL_OPERATION),
});

/** Erro tipado lançado pelo schema. */
export class GeoAnalyticsError extends Error {
    code: string;

    /**
     * @param {string} code
     * @param {string} [message?]
     */
    constructor(code: string, message?: string) {
        super(message || code);
        this.name = 'GeoAnalyticsError';
        this.code = code;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** @param {unknown} v */
function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.length > 0;
}

/** @param {unknown} v */
function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

/** @param {number} deg */
function deg2rad(deg: number): number {
    return (deg * Math.PI) / 180;
}

/**
 * Conta vértices recursivamente em estrutura aninhada de coordenadas.
 * Um vértice é um par [x, y] (eventualmente com z). Reconhecido como leaf
 * quando o array tem ≥2 elementos numéricos no primeiro nível interno.
 * @param {unknown} coords
 * @returns {number}
 */
function countVertices(coords: unknown): number {
    if (!Array.isArray(coords)) return 0;
    if (coords.length === 0) return 0;
    // Leaf: array of numbers like [x,y] or [x,y,z]
    if (typeof coords[0] === 'number') {
        return coords.length >= 2 ? 1 : 0;
    }
    let count = 0;
    for (const inner of coords) {
        count += countVertices(inner);
    }
    return count;
}

// ─────────────────────────────────────────────────────────────────────────────
// Factories
// ─────────────────────────────────────────────────────────────────────────────

interface GeometryRecord {
    id: string;
    type: string;
    coordinates: Array<unknown>;
    crs: string;
    attributes: Readonly<Record<string, unknown>>;
    vertexCount: number;
}

interface CreateGeometryInput {
    id?: string;
    type?: string;
    coordinates?: Array<unknown>;
    crs?: string;
    attributes?: Record<string, unknown>;
}

/**
 * Cria registro frozen de geometria com contagem de vértices computada.
 * @param {CreateGeometryInput} input
 * @returns {Readonly<GeometryRecord>}
 */
export function createGeometryRecord({
    id,
    type,
    coordinates,
    crs,
    attributes,
}: CreateGeometryInput): Readonly<GeometryRecord> {
    if (!isNonEmptyString(id)) {
        throw new GeoAnalyticsError(GEO_ANALYTICS_ERROR.INVALID_GEOMETRY, 'id obrigatório');
    }
    if (!(Object.values(GEOMETRY_TYPE) as string[]).includes(type as string)) {
        throw new GeoAnalyticsError(GEO_ANALYTICS_ERROR.INVALID_GEOMETRY, `type inválido: ${type}`);
    }
    if (!Array.isArray(coordinates)) {
        throw new GeoAnalyticsError(GEO_ANALYTICS_ERROR.INVALID_GEOMETRY, 'coordinates deve ser array');
    }
    const useCrs = crs || CRS_FAMILY.WGS84_GEOGRAPHIC;
    if (!(Object.values(CRS_FAMILY) as string[]).includes(useCrs)) {
        throw new GeoAnalyticsError(GEO_ANALYTICS_ERROR.INVALID_CRS, `crs inválido: ${crs}`);
    }
    const vertexCount = countVertices(coordinates);
    return Object.freeze({
        id,
        type,
        coordinates,
        crs: useCrs,
        attributes: Object.freeze({ ...(attributes || {}) }),
        vertexCount,
    } as GeometryRecord);
}

/**
 * Calcula bounding box {minX, minY, maxX, maxY} a partir da geometria.
 * @param {GeometryRecord} geometry saída de createGeometryRecord
 * @returns {Readonly<{minX: number, minY: number, maxX: number, maxY: number}>}
 */
export function computeBoundingBox(
    geometry: GeometryRecord,
): Readonly<{ minX: number; minY: number; maxX: number; maxY: number }> {
    if (!geometry || !Array.isArray(geometry.coordinates)) {
        throw new GeoAnalyticsError(GEO_ANALYTICS_ERROR.INVALID_GEOMETRY, 'geometry inválida');
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    function visit(coords: unknown): void {
        if (!Array.isArray(coords) || coords.length === 0) return;
        if (typeof coords[0] === 'number') {
            const [x, y] = coords as number[];
            if (isFiniteNumber(x) && isFiniteNumber(y)) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
            return;
        }
        for (const inner of coords) visit(inner);
    }
    visit(geometry.coordinates);

    if (!Number.isFinite(minX)) {
        throw new GeoAnalyticsError(GEO_ANALYTICS_ERROR.INVALID_GEOMETRY, 'sem vértices válidos');
    }
    return Object.freeze({ minX, minY, maxX, maxY });
}

/**
 * Distância geodésica entre dois pontos {lat, lon} em km - fórmula Haversine.
 * @param {{lat:number,lon:number}} p1
 * @param {{lat:number,lon:number}} p2
 * @returns {number}
 */
export function computeHaversineDistanceKm(
    p1: { lat: number; lon: number },
    p2: { lat: number; lon: number },
): number {
    if (
        !p1 ||
        !p2 ||
        !isFiniteNumber(p1.lat) ||
        !isFiniteNumber(p1.lon) ||
        !isFiniteNumber(p2.lat) ||
        !isFiniteNumber(p2.lon)
    ) {
        throw new GeoAnalyticsError(GEO_ANALYTICS_ERROR.INVALID_GEOMETRY, 'pontos inválidos {lat,lon}');
    }
    const dLat = deg2rad(p2.lat - p1.lat);
    const dLon = deg2rad(p2.lon - p1.lon);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(deg2rad(p1.lat)) * Math.cos(deg2rad(p2.lat)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_KM * c;
}

/**
 * Centroide aritmético [x,y] de uma lista de pontos. Para polígono nestado
 * usa o primeiro anel.
 * @param {Array<unknown>} coords array de [x,y] ou estrutura POLYGON [[[x,y],...]]
 * @returns {Readonly<{x: number, y: number}>}
 */
export function computeCentroidPoint(coords: Array<unknown>): Readonly<{ x: number; y: number }> {
    if (!Array.isArray(coords) || coords.length === 0) {
        throw new GeoAnalyticsError(GEO_ANALYTICS_ERROR.INVALID_GEOMETRY, 'coords vazio ou inválido');
    }
    let ring: Array<unknown> = coords;
    // POLYGON: [ [ [x,y], [x,y], ... ] ] → use primeiro ring
    if (Array.isArray(coords[0]) && Array.isArray((coords[0] as Array<unknown>)[0])) {
        ring = coords[0] as Array<unknown>;
    }
    let sumX = 0;
    let sumY = 0;
    let n = 0;
    for (const pt of ring) {
        if (Array.isArray(pt) && isFiniteNumber(pt[0]) && isFiniteNumber(pt[1])) {
            sumX += pt[0];
            sumY += pt[1];
            n += 1;
        }
    }
    if (n === 0) {
        throw new GeoAnalyticsError(GEO_ANALYTICS_ERROR.INVALID_GEOMETRY, 'sem vértices numéricos');
    }
    return Object.freeze({ x: sumX / n, y: sumY / n });
}

/**
 * Avalia validade topológica básica de uma geometria.
 * Retorna chave de SPATIAL_ERROR_TYPE em caso de falha; null se válida.
 * Regras:
 *   - coordinates ausente/null → INVALID_GEOMETRY
 *   - LINE com <2 vértices → INVALID_GEOMETRY
 *   - POLYGON com ring de <4 vértices (3 + closing) → INVALID_GEOMETRY
 *   - POLYGON com primeiro ring não-fechado → TOPOLOGY
 * @param {GeometryRecord} geometry
 * @returns {string|null}
 */
export function assessGeometryValidity(geometry: GeometryRecord): string | null {
    if (!geometry || !geometry.coordinates) {
        return SPATIAL_ERROR_TYPE.INVALID_GEOMETRY;
    }
    const { type, coordinates } = geometry;
    if (type === GEOMETRY_TYPE.POINT) {
        if (!Array.isArray(coordinates) || coordinates.length < 2) {
            return SPATIAL_ERROR_TYPE.INVALID_GEOMETRY;
        }
        if (!isFiniteNumber(coordinates[0]) || !isFiniteNumber(coordinates[1])) {
            return SPATIAL_ERROR_TYPE.INVALID_GEOMETRY;
        }
        return null;
    }
    if (type === GEOMETRY_TYPE.LINE) {
        if (!Array.isArray(coordinates) || coordinates.length < 2) {
            return SPATIAL_ERROR_TYPE.INVALID_GEOMETRY;
        }
        return null;
    }
    if (type === GEOMETRY_TYPE.POLYGON) {
        if (!Array.isArray(coordinates) || coordinates.length === 0) {
            return SPATIAL_ERROR_TYPE.INVALID_GEOMETRY;
        }
        const ring = coordinates[0];
        if (!Array.isArray(ring) || ring.length < 4) {
            // 3 distinct + 1 closing
            return SPATIAL_ERROR_TYPE.INVALID_GEOMETRY;
        }
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (!Array.isArray(first) || !Array.isArray(last) || first[0] !== last[0] || first[1] !== last[1]) {
            return SPATIAL_ERROR_TYPE.TOPOLOGY;
        }
        return null;
    }
    // MULTIPOINT/MULTILINE/MULTIPOLYGON: validação básica de não-vazio
    if (!Array.isArray(coordinates) || coordinates.length === 0) {
        return SPATIAL_ERROR_TYPE.INVALID_GEOMETRY;
    }
    return null;
}

/**
 * Largura de banda de kernel via regra Silverman: 1.06 * std * n^(-1/5).
 * @param {number[]} values
 * @returns {number}
 */
export function computeKernelBandwidth(values: number[]): number {
    if (!Array.isArray(values) || values.length === 0) {
        throw new GeoAnalyticsError(GEO_ANALYTICS_ERROR.INVALID_GEOMETRY, 'values deve ser array não-vazio');
    }
    const n = values.length;
    let sum = 0;
    for (const v of values) {
        if (!isFiniteNumber(v)) {
            throw new GeoAnalyticsError(GEO_ANALYTICS_ERROR.INVALID_GEOMETRY, 'values contém entrada não-finita');
        }
        sum += v;
    }
    const mean = sum / n;
    let varSum = 0;
    for (const v of values) {
        const d = v - mean;
        varSum += d * d;
    }
    const std = Math.sqrt(varSum / n);
    if (n === 1 || std === 0) return 0;
    return KERNEL_BANDWIDTH_FACTOR * std * Math.pow(n, -1 / 5);
}

/**
 * Constrói relatório agregado frozen para conjunto de geometrias.
 * @param {Array<GeometryRecord>} geometries
 * @returns {Readonly<{totalGeometries: number, typeBreakdown: Readonly<Record<string,number>>, totalVertices: number, validCount: number, invalidByErrorType: Readonly<Record<string,number>>, crsBreakdown: Readonly<Record<string,number>>}>}
 */
export function buildGeoAnalyticsReport(
    geometries: Array<GeometryRecord>,
): Readonly<{
    totalGeometries: number;
    typeBreakdown: Readonly<Record<string, number>>;
    totalVertices: number;
    validCount: number;
    invalidByErrorType: Readonly<Record<string, number>>;
    crsBreakdown: Readonly<Record<string, number>>;
}> {
    if (!Array.isArray(geometries)) {
        throw new GeoAnalyticsError(GEO_ANALYTICS_ERROR.INVALID_GEOMETRY, 'geometries deve ser array');
    }
    let totalVertices = 0;
    let validCount = 0;
    const typeBreakdown: Record<string, number> = {};
    const invalidByErrorType: Record<string, number> = {};
    const crsBreakdown: Record<string, number> = {};

    for (const geom of geometries) {
        if (!geom || typeof geom !== 'object') continue;
        const t = geom.type || 'UNKNOWN';
        typeBreakdown[t] = (typeBreakdown[t] || 0) + 1;
        if (geom.crs) crsBreakdown[geom.crs] = (crsBreakdown[geom.crs] || 0) + 1;
        if (typeof geom.vertexCount === 'number') {
            totalVertices += geom.vertexCount;
        } else {
            totalVertices += countVertices(geom.coordinates);
        }
        const err = assessGeometryValidity(geom);
        if (err === null) {
            validCount += 1;
        } else {
            invalidByErrorType[err] = (invalidByErrorType[err] || 0) + 1;
        }
    }

    return Object.freeze({
        totalGeometries: geometries.length,
        typeBreakdown: Object.freeze(typeBreakdown),
        totalVertices,
        validCount,
        invalidByErrorType: Object.freeze(invalidByErrorType),
        crsBreakdown: Object.freeze(crsBreakdown),
    });
}
