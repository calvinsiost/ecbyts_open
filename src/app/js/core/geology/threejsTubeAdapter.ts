// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   THREE.JS TUBE ADAPTER — Bridge wellMeshBuilder buffers → Three.js
   ================================================================
   P1-8 Family Fault Wells Directional Phase 5 parte 2 (Claude-owner)

   Recebe THREE namespace injected (não importa direto) e produz
   THREE.Mesh a partir dos buffers gerados por wellMeshBuilder.
   Essa indireção permite:
   - Testar com mock minimal de THREE em Node (jsdom-free)
   - Suporte a múltiplas versões de THREE.js sem rebuild
   - Engine-swap se for necessário (Babylon.js, three-fiber, etc.)

   Roadmap: §0.2 P1-8 Phase 5 parte 2
   ================================================================ */

console.debug('[mod:load]', 'app/js/core/geology/threejsTubeAdapter.js');

export interface BuildThreeTubeMeshOptions {
    material?: unknown;
    roughness?: number;
    opacity?: number;
    name?: string;
}

export interface BuildThreeTubeMeshResult {
    ok: boolean;
    mesh?: unknown;
    geometry?: unknown;
    error?: string;
}

export interface LithologySegment {
    mdTop: number;
    mdBottom: number;
    lithology: string;
    color?: string;
}

export interface DirectionalElement {
    data?: {
        trajectory?: Array<{
            md?: number;
         }>;
    };
}

export interface LithologyElement {
    data?: {
        lithologySegments?: Array<LithologySegment>;
        profile?: {
            lithologic?: Array<{
                depthTop?: number | string;
                mdTop?: number | string;
                depthBottom?: number | string;
                mdBottom?: number | string;
                lithology?: string;
                type?: string;
                color?: string;
            }>;
        };
    };
}

interface BufferGeometryLike {
    setAttribute(name: string, attr: unknown): void;
    setIndex(index: unknown): void;
    computeBoundingSphere?(): void;
    computeBoundingBox?(): void;
}

interface MeshLike {
    name: string;
    frustumCulled: boolean;
}

interface ThreeNamespace {
    BufferGeometry: new () => BufferGeometryLike;
    BufferAttribute: new (data: unknown, itemSize: number) => unknown;
    Mesh: new (geometry: unknown, material: unknown) => MeshLike;
    MeshStandardMaterial: new (opts: Record<string, unknown>) => unknown;
}

function asThreeNamespace(THREE: Record<string, unknown>): ThreeNamespace | null {
    if (
        typeof THREE.BufferGeometry === 'function' &&
        typeof THREE.BufferAttribute === 'function' &&
        typeof THREE.Mesh === 'function' &&
        typeof THREE.MeshStandardMaterial === 'function'
    ) {
        return THREE as unknown as ThreeNamespace;
    }
    return null;
}

function validateTubeBuffers(buffers: Record<string, unknown>): BuildThreeTubeMeshResult | null {
    if (!buffers || typeof buffers !== 'object' || !buffers.positions || !buffers.indices) {
        return { ok: false, error: 'buffers_invalid' };
    }
    return null;
}

function buildTubeGeometry(
    THREE: ThreeNamespace,
    buffers: Record<string, unknown>,
): BufferGeometryLike {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(buffers.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(buffers.normals, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(buffers.colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(buffers.indices, 1));

    if (typeof geometry.computeBoundingSphere === 'function') {
        geometry.computeBoundingSphere();
    }
    if (typeof geometry.computeBoundingBox === 'function') {
        geometry.computeBoundingBox();
    }
    return geometry;
}

function createTubeMaterial(
    THREE: ThreeNamespace,
    opts: BuildThreeTubeMeshOptions,
): unknown {
    if (opts.material) return opts.material;
    return new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: typeof opts.roughness === 'number' ? opts.roughness : 0.5,
        transparent: typeof opts.opacity === 'number' && opts.opacity < 1.0,
        opacity: typeof opts.opacity === 'number' ? opts.opacity : 1.0,
    });
}

/**
 * Constrói THREE.Mesh a partir de buffers + namespace THREE injected.
 * Vertex colors são ativados (vertexColors=true) e o material default
 * é MeshStandardMaterial com roughness=0.5.
 *
 * @param {Record<string, unknown>} THREE - namespace Three.js (injected)
 * @param {Record<string, unknown>} buffers - output de buildTubeBuffers()
 * @param {BuildThreeTubeMeshOptions} [opts]
 * @returns {BuildThreeTubeMeshResult}
 */
export function buildThreeTubeMesh(
    THREE: Record<string, unknown>,
    buffers: Record<string, unknown>,
    opts: BuildThreeTubeMeshOptions = {},
): BuildThreeTubeMeshResult {
    if (!THREE || typeof THREE !== 'object') {
        return { ok: false, error: 'three_namespace_required' };
    }

    const t = asThreeNamespace(THREE);
    if (!t) {
        return { ok: false, error: 'three_missing_required_classes' };
    }

    const buffersError = validateTubeBuffers(buffers);
    if (buffersError) return buffersError;

    const geometry = buildTubeGeometry(t, buffers);
    const material = createTubeMaterial(t, opts);

    const mesh = new t.Mesh(geometry, material);
    mesh.name = opts.name || 'well-tube';
    mesh.frustumCulled = false;

    return { ok: true, mesh, geometry };
}

/**
 * Helper: detecta se um element tem dados de trajetória direcional.
 * Critério: existe `data.trajectory` array com ≥2 stations e MD definido.
 *
 * @param {unknown} element
 * @returns {boolean}
 */
export function hasDirectionalTrajectory(element: unknown): boolean {
    if (!element || typeof element !== 'object') return false;
    const e = element as DirectionalElement;
    const data = e.data || {};
    const trajectory = data.trajectory;
    if (!Array.isArray(trajectory) || trajectory.length < 2) return false;
    // Pelo menos uma station precisa ter MD definido
    return trajectory.some((s) => s && typeof s.md === 'number' && Number.isFinite(s.md));
}

/**
 * Helper: extrai segments litológicos de um element well.
 * Aceita formato profile.lithologic ou direct lithologySegments.
 *
 * @param {unknown} element
 * @returns {LithologySegment[]}
 */
export function extractLithologySegments(element: unknown): LithologySegment[] {
    if (!element || typeof element !== 'object') return [];
    const e = element as LithologyElement;
    const data = e.data || {};
    if (Array.isArray(data.lithologySegments)) {
        return data.lithologySegments as LithologySegment[];
    }
    if (data.profile && Array.isArray(data.profile.lithologic)) {
        return data.profile.lithologic.map((seg: any) => ({
            mdTop: Number(seg.depthTop ?? seg.mdTop) || 0,
            mdBottom: Number(seg.depthBottom ?? seg.mdBottom) || 0,
            lithology: String(seg.lithology || seg.type || 'unknown'),
            color: seg.color,
        }));
    }
    return [];
}

console.debug('[mod:end]', 'app/js/core/geology/threejsTubeAdapter.js');