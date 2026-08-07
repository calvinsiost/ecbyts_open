// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Dataset Camera Fit — pure-logic, zero THREE.js / DOM dependency.
 *
 * SPEC_CAMERA_FIT_TO_DATASET (2026-05-14).
 *
 * Permite enquadrar a câmera em um *subset* de elementos da cena, ignorando o
 * resto. Resolve regressão visual quando dois datasets de escalas diferentes
 * coexistem (ex: random model centrado na origem + boundaries RMSP a 100km).
 *
 * Convenções de coordenadas (mesmo padrão de controls.js):
 *   X = leste-oeste (positivo = leste)
 *   Y = cima-baixo (positivo = cima)
 *   Z = norte-sul  (positivo = sul)
 *
 * Math 100% POJO. Animação e estado real da câmera ficam no wrapper JS em
 * `utils/scene/controls.js`.
 */

export interface Vec3 {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

export interface DatasetBounds {
    readonly min: Vec3;
    readonly max: Vec3;
    readonly center: Vec3;
    /** max(dx, dz) clamped >= minExtent. Define escala horizontal do subset. */
    readonly extent: number;
    /** Centroide Y excluindo stratum (fallback = center.y se todos forem stratum). */
    readonly surfaceY: number;
}

export interface ElementForFit {
    readonly id?: string;
    readonly family?: string;
    readonly visible?: boolean;
    readonly data?: {
        readonly position?: Partial<Vec3>;
        readonly vertices?: ReadonlyArray<Partial<Vec3>>;
        readonly path?: ReadonlyArray<Partial<Vec3>>;
    };
    readonly meta?: { readonly datasetId?: string; readonly [k: string]: unknown };
}

export interface OptimalCameraResult {
    readonly position: Vec3;
    readonly target: Vec3;
    /** Distância euclidiana da câmera ao target. */
    readonly distance: number;
    /** Zoom calculado, já clamped em [minZoom, maxZoom]. */
    readonly zoom: number;
}

export interface OptimalCameraOptions {
    /**
     * Vetor da câmera ao target (camera.position - controls.target). Será
     * normalizado internamente. Define a direção do "frame" preservada do
     * estado atual da câmera. Obrigatório porque pure-logic não conhece scene.
     */
    readonly direction: Vec3;
    /** Margem em torno da bbox. Default 0.15 (15%). */
    readonly padding?: number;
    /** Clamp inferior do extent (m). Default 30 — single-point seguro. */
    readonly minExtent?: number;
    /** Clamp inferior do zoom. Default 0.05. */
    readonly minZoom?: number;
    /** Clamp superior do zoom. Default 2. */
    readonly maxZoom?: number;
    /**
     * "Tela canônica" em metros: zoom = baseScreenExtent / extent. Default 60
     * (mesmo magic number existente em controls.js para compatibilidade).
     */
    readonly baseScreenExtent?: number;
    /**
     * Override Y do target. Quando não fornecido, usa surfaceY do bounds com
     * teto -5 (mesma heurística do fitAllElements legado).
     */
    readonly targetYOverride?: number;
}

const DEFAULT_PADDING = 0.15;
const DEFAULT_MIN_EXTENT = 30;
const DEFAULT_MIN_ZOOM = 0.05;
const DEFAULT_MAX_ZOOM = 2;
const DEFAULT_BASE_SCREEN_EXTENT = 60;

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function isFiniteNumber(n: unknown): n is number {
    return typeof n === 'number' && Number.isFinite(n);
}

function coord(v: Partial<Vec3> | undefined, axis: 'x' | 'y' | 'z'): number {
    if (!v) return 0;
    const raw = v[axis];
    return isFiniteNumber(raw) ? raw : 0;
}

/**
 * Extrai a posição "primária" de um elemento. Equivalente reduzido de
 * `getElementPosition(el)` do core/io/geo/coordinates.js para uso pure-logic.
 *
 * Prefere `data.position`; fallback para `{0,0,0}` (centro de coordenadas
 * relativas).
 */
function elementPosition(el: ElementForFit): Vec3 {
    const p = el.data?.position;
    return {
        x: coord(p, 'x'),
        y: coord(p, 'y'),
        z: coord(p, 'z'),
    };
}

// ──────────────────────────────────────────────────────────────────────────
// computeBoundsFromElements
// ──────────────────────────────────────────────────────────────────────────

/**
 * Computa bounding box 3D de um subset de elementos.
 *
 * Considera centroide (`data.position`) e — quando presente — vértices
 * (`data.vertices` para boundaries) ou path (`data.path` para rios/rotas). Sem
 * isso, polígonos grandes (RMSP) seriam tratados como pontos no centroide e
 * a bbox subdimensionaria 100×.
 *
 * Retorna `null` se a lista estiver vazia ou se nenhum elemento produzir
 * coordenadas finitas.
 *
 * `surfaceY` exclui família `stratum` do cálculo do target Y (estratos podem
 * estar arbitrariamente profundos e enviesar a câmera). Fallback = center.y
 * se todos forem stratum.
 */
export function computeBoundsFromElements(
    elements: ReadonlyArray<ElementForFit>,
    opts?: { readonly minExtent?: number },
): DatasetBounds | null {
    if (!Array.isArray(elements) || elements.length === 0) return null;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let surfMinY = Infinity;
    let surfMaxY = -Infinity;
    let touched = false;

    for (const el of elements) {
        if (!el) continue;
        const pos = elementPosition(el);
        const isStratum = el.family === 'stratum';

        // Inclui centroide do elemento
        if (pos.x < minX) minX = pos.x;
        if (pos.x > maxX) maxX = pos.x;
        if (pos.y < minY) minY = pos.y;
        if (pos.y > maxY) maxY = pos.y;
        if (pos.z < minZ) minZ = pos.z;
        if (pos.z > maxZ) maxZ = pos.z;
        touched = true;

        if (!isStratum) {
            if (pos.y < surfMinY) surfMinY = pos.y;
            if (pos.y > surfMaxY) surfMaxY = pos.y;
        }

        // Inclui vértices reais de polígonos/paths quando presentes
        const verts = el.data?.vertices ?? el.data?.path;
        if (verts && verts.length > 0) {
            for (const v of verts) {
                const vx = coord(v, 'x');
                const vy = coord(v, 'y');
                const vz = coord(v, 'z');
                if (vx < minX) minX = vx;
                if (vx > maxX) maxX = vx;
                if (vy < minY) minY = vy;
                if (vy > maxY) maxY = vy;
                if (vz < minZ) minZ = vz;
                if (vz > maxZ) maxZ = vz;
                if (!isStratum) {
                    if (vy < surfMinY) surfMinY = vy;
                    if (vy > surfMaxY) surfMaxY = vy;
                }
            }
        }
    }

    if (!touched) return null;

    // Fallback: todos os elementos eram stratum
    if (!Number.isFinite(surfMinY) || !Number.isFinite(surfMaxY)) {
        surfMinY = minY;
        surfMaxY = maxY;
    }

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    const dx = maxX - minX;
    const dz = maxZ - minZ;
    const minExtent = opts?.minExtent ?? DEFAULT_MIN_EXTENT;
    const extent = Math.max(dx, dz, minExtent);
    const surfaceY = (surfMinY + surfMaxY) / 2;

    return Object.freeze({
        min: Object.freeze({ x: minX, y: minY, z: minZ }),
        max: Object.freeze({ x: maxX, y: maxY, z: maxZ }),
        center: Object.freeze({ x: cx, y: cy, z: cz }),
        extent,
        surfaceY,
    });
}

// ──────────────────────────────────────────────────────────────────────────
// computeOptimalCameraFromBounds
// ──────────────────────────────────────────────────────────────────────────

/**
 * Dado um bounds e a direção atual da câmera (vetor não-normalizado é OK),
 * calcula posição, target, distância e zoom ótimos para enquadrar.
 *
 * Math:
 *   scale         = max(extent * (1 + padding), minExtent)
 *   directionUnit = direction / |direction|
 *   target.y      = clamp(surfaceY, -∞, -5)  [override via targetYOverride]
 *   position      = target + directionUnit * scale
 *   distance      = scale  (= |position - target|)
 *   zoom          = clamp(baseScreenExtent / extent, minZoom, maxZoom)
 *
 * Se `direction` for vetor zero (câmera no target), assume isometric
 * `{1,1,1}/√3` como fallback determinístico.
 */
export function computeOptimalCameraFromBounds(
    bounds: DatasetBounds,
    opts: OptimalCameraOptions,
): OptimalCameraResult {
    const padding = opts.padding ?? DEFAULT_PADDING;
    const minExtent = opts.minExtent ?? DEFAULT_MIN_EXTENT;
    const minZoom = opts.minZoom ?? DEFAULT_MIN_ZOOM;
    const maxZoom = opts.maxZoom ?? DEFAULT_MAX_ZOOM;
    const baseScreenExtent = opts.baseScreenExtent ?? DEFAULT_BASE_SCREEN_EXTENT;

    // Normaliza direção; fallback isométrico se zero/inválida.
    let dx = isFiniteNumber(opts.direction?.x) ? opts.direction.x : 0;
    let dy = isFiniteNumber(opts.direction?.y) ? opts.direction.y : 0;
    let dz = isFiniteNumber(opts.direction?.z) ? opts.direction.z : 0;
    let len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!Number.isFinite(len) || len < 1e-9) {
        const iso = 1 / Math.sqrt(3);
        dx = iso;
        dy = iso;
        dz = iso;
        len = 1;
    }
    const ux = dx / len;
    const uy = dy / len;
    const uz = dz / len;

    // Escala = extent + padding, com clamp inferior em minExtent.
    const paddedExtent = bounds.extent * (1 + Math.max(0, padding));
    const scale = Math.max(paddedExtent, minExtent);

    // Target Y: usa surfaceY clampado em -5 (consistente com fitAllElements
    // legado) salvo override explícito.
    const targetY = isFiniteNumber(opts.targetYOverride)
        ? opts.targetYOverride
        : Math.min(bounds.surfaceY, -5);

    const target: Vec3 = Object.freeze({
        x: bounds.center.x,
        y: targetY,
        z: bounds.center.z,
    });

    const position: Vec3 = Object.freeze({
        x: target.x + ux * scale,
        y: target.y + uy * scale,
        z: target.z + uz * scale,
    });

    const distance = scale;

    // Zoom: baseScreenExtent / extent, clampado.
    const rawZoom = bounds.extent > 0 ? baseScreenExtent / bounds.extent : maxZoom;
    const zoom = Math.max(minZoom, Math.min(maxZoom, rawZoom));

    return Object.freeze({ position, target, distance, zoom });
}

// ──────────────────────────────────────────────────────────────────────────
// filterElementsByPredicate
// ──────────────────────────────────────────────────────────────────────────

/**
 * Helper genérico para filtrar elementos por predicado. Wrapper conveniente
 * para reduzir boilerplate nos consumidores (filtros por family, datasetId,
 * id-list, visibilidade).
 *
 * Retorna sempre uma cópia (array novo) — nunca alias.
 */
export function filterElementsByPredicate<T extends ElementForFit>(
    elements: ReadonlyArray<T>,
    predicate: (el: T) => boolean,
): T[] {
    if (!Array.isArray(elements) || elements.length === 0) return [];
    if (typeof predicate !== 'function') return [];
    const out: T[] = [];
    for (const el of elements) {
        if (!el) continue;
        if (predicate(el)) out.push(el);
    }
    return out;
}
