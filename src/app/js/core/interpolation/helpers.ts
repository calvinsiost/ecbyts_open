// @ts-check
// This file is part of ecbyts/ECBT. AGPL-3.0-only.
// Extracted from app/js/core/interpolation/manager.js in ARCH-MONO-001 Phase 3.
//
// Pure helpers that operate on element state (via getAllElements)
// or raw numeric grids - zero references to manager.js module state
// (no _layers, no _interpolationGroup, no full-refresh callback).
//
// Kept here so manager.js can shrink under the 2000-line budget.
import { CONFIG } from '../../config.js';
import { getAllElements } from '../elements/manager.js';
import { createLogger } from '../../utils/helpers/logger.js';
const log = createLogger('InterpolationHelpers');
/**
 * Constrói um grid 3D Float32Array por extrusão vertical de um grid 2D.
 * Cada layer vertical aplica decaimento exponencial: v[k] = v[0] * exp(-decay * k/(nLayers-1)).
 * Heurística para Fase 1 - não é Kriging 3D. Documentado no plano GeoML Fase 1.
 *
 * @param {Float32Array|number[]} grid2D - Grid plano [rows * cols] (row-major)
 * @param {{ cols: number, rows: number }} gridSize
 * @param {{ minX: number, maxX: number, minZ: number, maxZ: number }} bounds2D
 * @param {Array<{y: number}>} [points] - Pontos com elevação para calcular minY/maxY
 * @returns {{ grid3D: Float32Array, bounds3D: Object, dims: Object }}
 */
export function build3DGrid(grid2D: any, gridSize: any, bounds2D: any, points: any = []) {
    const nLayers = CONFIG.GEOML?.ISOSURFACE_LAYERS ?? 8;
    const decay = CONFIG.GEOML?.ISOSURFACE_DECAY ?? 0.5;
    const { cols, rows } = gridSize;
    // Calcular minY/maxY a partir dos pontos coletados com elevação
    const elevations = points.map((p: any) => p.y).filter(Number.isFinite);
    const minY = elevations.length ? Math.min(...elevations) - 20 : -30;
    const maxY = elevations.length ? Math.max(...elevations) + 5 : 5;
    const grid3D = new Float32Array(nLayers * rows * cols);
    for (let k = 0; k < nLayers; k++) {
        const factor = Math.exp(-decay * (k / Math.max(1, nLayers - 1)));
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const v2 = grid2D[r * cols + c] ?? 0;
                grid3D[k * rows * cols + r * cols + c] = v2 * factor;
            }
        }
    }
    return {
        grid3D,
        bounds3D: { ...bounds2D, minY, maxY },
        dims: { cols, rows, layers: nLayers },
    };
}
/**
 * Compute bounds from observation points with padding.
 * @param {Array<{x: number, z: number}>} points
 * @param {number} points - Fraction (0.10 = 10%)
 * @returns {{ minX: number, maxX: number, minZ: number, maxZ: number }}
 */
export function computeBoundsFromPoints(points: any, padding: any = 0.1) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of points) {
        if (p.x < minX)
            minX = p.x;
        if (p.x > maxX)
            maxX = p.x;
        if (p.z < minZ)
            minZ = p.z;
        if (p.z > maxZ)
            maxZ = p.z;
    }
    const dx = (maxX - minX) * padding || 1;
    const dz = (maxZ - minZ) * padding || 1;
    return { minX: minX - dx, maxX: maxX + dx, minZ: minZ - dz, maxZ: maxZ + dz };
}
/**
 * Busca bounds da boundary no modelo.
 * @returns {{ minX: number, maxX: number, minZ: number, maxZ: number }|null}
 */
export function getBoundaryBounds() {
    const elements = getAllElements();
    const boundary = elements.find((/** @type {any} */ e) => e.family === 'boundary');
    if (!boundary || !boundary.data?.vertices?.length)
        return null;
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const v of boundary.data.vertices) {
        if (v.x < minX)
            minX = v.x;
        if (v.x > maxX)
            maxX = v.x;
        if (v.z < minZ)
            minZ = v.z;
        if (v.z > maxZ)
            maxZ = v.z;
    }
    // Margem de 10% para evitar cortes nas bordas
    const padX = (maxX - minX) * 0.1;
    const padZ = (maxZ - minZ) * 0.1;
    return {
        minX: minX - padX,
        maxX: maxX + padX,
        minZ: minZ - padZ,
        maxZ: maxZ + padZ,
    };
}
/**
 * Familias de elementos que possuem observacoes quimicas interpolaveis.
 * well = agua subterranea, marker = solo/ar, spring = nascente, lake = agua superficial.
 */
export const INTERPOLABLE_FAMILIES = new Set(['well', 'marker', 'spring', 'lake']);
/**
 * Coleta pontos de observação de elementos para um parâmetro.
 * Retorna o valor mais recente de cada ponto.
 *
 * @param {string} parameterId
 * @param {Object} [opts]
 * @param {string|null} [opts.campaignId]
 * @param {string|null} [opts.matrix] - Filtro por sample_matrix ('soil', 'groundwater', 'surface water')
 * @param {number} [opts.tolerance=0.01]
 * @param {boolean} [opts.include3D=false] - Se true, inclui y (elevation) em cada ponto (retrocompatível)
 * @returns {Array<{x: number, z: number, value: number, y?: number}>}
 */
export function collectObservationPointsImpl(parameterId: any, opts: any = {}) {
    const { campaignId = null, matrix = null, tolerance = 0.01, include3D = false } = opts;
    const elements = getAllElements();
    const raw = [];
    const aliases = resolveParameterAliases(parameterId);
    console.debug('[Interpolation] Collecting points for %s (matrix=%s, campaign=%s)', parameterId, matrix || 'all', campaignId || 'all');
    let skipped = 0;
    for (const el of elements) {
        if (!INTERPOLABLE_FAMILIES.has(el.family)) {
            skipped++;
            continue;
        }
        const observations = el.data?.observations;
        if (!Array.isArray(observations) || observations.length === 0)
            continue;
        const obs = observations
            .filter((o: any) => aliases.has(o.parameterId) && Number.isFinite(parseFloat(o.value)))
            .filter((o: any) => !campaignId || o.campaignId === campaignId)
            .filter((o: any) => !matrix || o.sample_matrix === matrix)
            .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        if (obs.length === 0)
            continue;
        const value = parseFloat(obs[0].value);
        if (!Number.isFinite(value))
            continue;
        const x = el.data?.coordinates?.easting ?? el.data?.position?.x ?? 0;
        const z = el.data?.coordinates?.northing ?? el.data?.position?.z ?? 0;
        const y = el.data?.coordinates?.elevation ?? el.data?.position?.y ?? 0;
        raw.push({ x, y, z, value, date: obs[0].date });
    }
    console.debug('[Interpolation] %d points collected, %d elements skipped (non-interpolable families)', raw.length, skipped);
    // RED-C3: Deduplicate co-located points (tolerance 0.01m), latest-value-wins
    // Prevents IDW NaN (division by zero at d=0)
    const seen = new Map();
    for (const pt of raw) {
        const kx = Math.round(pt.x / tolerance) * tolerance;
        const kz = Math.round(pt.z / tolerance) * tolerance;
        const key = `${kx}_${kz}`;
        const existing = seen.get(key);
        if (!existing || new Date(pt.date) > new Date(existing.date)) {
            seen.set(key, pt);
        }
    }
    return Array.from(seen.values()).map((p: any) => include3D ? { x: p.x, y: p.y, z: p.z, value: p.value } : { x: p.x, z: p.z, value: p.value });
}
/** Labels em português para tipos de solo ABGE */
export const GEOLOGY_SOIL_LABELS = {
    clay: 'Argila',
    sand: 'Areia',
    silt: 'Silte',
    gravel: 'Cascalho',
    rock: 'Rocha',
    sandy_clay: 'Argila arenosa',
    clayey_sand: 'Areia argilosa',
    silty_sand: 'Areia siltosa',
    fill: 'Aterro',
    topsoil: 'Solo organico',
    peat: 'Turfa',
};
/**
 * Coleta pontos de contato geológico dos perfis litológicos dos poços.
 * Para cada poço com o tipo de solo solicitado, extrai a profundidade do
 * contato (topo ou base) e converte para elevação absoluta.
 *
 * @param {string} soilType - tipo de solo (clay, sand, rock, etc.)
 * @param {'top'|'bottom'} [contactType='top'] - topo ou base da camada
 * @returns {Array<{x: number, z: number, value: number}>}
 */
export function collectGeologyContactPointsImpl(soilType: any, contactType: any = "top") {
    const elements = getAllElements();
    const points = [];
    for (const el of elements) {
        if (el.family !== 'well')
            continue;
        const lithologic = el.data?.profile?.lithologic;
        if (!Array.isArray(lithologic) || lithologic.length === 0)
            continue;
        const matches = lithologic.filter((l: any) => l.soilType === soilType);
        if (matches.length === 0)
            continue;
        // Shallowest 'from' for top contact; deepest 'to' for bottom contact
        const depth = contactType === 'top' ? Math.min(...matches.map((m: any) => m.from)) : Math.max(...matches.map((m: any) => m.to));
        // Elevacao da boca do poco - mesmo path de _collectObservationPoints
        const surfaceElev = el.data?.coordinates?.elevation ?? 0;
        const value = surfaceElev - depth;
        const x = el.data?.coordinates?.easting ?? el.data?.position?.x ?? 0;
        const z = el.data?.coordinates?.northing ?? el.data?.position?.z ?? 0;
        points.push({ x, z, value });
    }
    log.debug('[Interpolation] Geology contacts: %d wells with %s (%s)', points.length, soilType, contactType);
    return points;
}
export function normalizeGridSize(gridSize: any) {
    if (typeof gridSize === 'number' && Number.isFinite(gridSize)) {
        const n = Math.max(8, Math.round(gridSize));
        return { cols: n, rows: n };
    }
    if (gridSize && typeof gridSize === 'object') {
        const cols = Number(gridSize.cols);
        const rows = Number(gridSize.rows);
        if (Number.isFinite(cols) && Number.isFinite(rows)) {
            return {
                cols: Math.max(8, Math.round(cols)),
                rows: Math.max(8, Math.round(rows)),
            };
        }
    }
    return { cols: 64, rows: 64 };
}
export function normalizeManualPoints(points: any) {
    if (!Array.isArray(points))
        return [];
    const out = [];
    for (const pt of points) {
        if (!pt || typeof pt !== 'object')
            continue;
        const rawX = pt.x;
        const rawZ = pt.z ?? pt.y;
        const rawValue = pt.value;
        // Nao converte null/undefined/empty para 0 (evita pontos sinteticos 0,0,0).
        if (rawX == null || rawZ == null || rawValue == null)
            continue;
        if (rawX === '' || rawZ === '' || rawValue === '')
            continue;
        const x = Number(rawX);
        const z = Number(rawZ);
        const value = Number(rawValue);
        if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(value))
            continue;
        out.push({
            x,
            z,
            value,
            complianceStatus: pt.complianceStatus || null,
        });
    }
    return out;
}
export function resolveParameterAliases(parameterId: any) {
    const pid = String(parameterId || '').trim();
    if (!pid)
        return new Set();
    if (pid === 'water_level' || pid === 'hydraulicHead') {
        return new Set(['water_level', 'hydraulicHead']);
    }
    return new Set([pid]);
}
