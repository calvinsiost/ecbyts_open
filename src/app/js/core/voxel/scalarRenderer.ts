// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   SCALAR RENDERER â€” Per-instance color overlay for voxel channels
   Renderizador escalar â€” sobrepoe cor continua por canal Float32Array

   Aplica gradiente de cor continuo nos voxels baseado em canal
   escalar (concentracao, temperatura, etc.) via InstancedBufferAttribute.
   Complementa o renderer de zonas: nao substitui â€” sobrepoe.

   MODO DE OPERACAO:
   1. applyChannelColors() â€” pinta instancedMesh com ramp do canal
   2. clearChannelColors() â€” restaura cor original da zona
   3. extractChannelIsosurface() â€” gera mesh de isosuperfÃ­cie no valor dado
   ================================================================ */

import { createTHREEProxy } from '../three-lazy.js';
const THREE: any = createTHREEProxy();
import { sampleRamp } from '../interpolation/colorRamps.js';
import { extractIsosurface } from '../interpolation/isosurface.js';

interface ScalarChannel {
    data: Float32Array;
    min: number;
    max: number;
    ramp: string;
    label?: string;
    name?: string;
}

// ----------------------------------------------------------------
// PER-INSTANCE COLOR APPLICATION
// ----------------------------------------------------------------

/**
 * Apply continuous color gradient to InstancedMesh based on a scalar channel.
 * Aplica gradiente de cor continuo nos voxels usando InstancedBufferAttribute.
 */
export function applyChannelColors(
    instMesh: any,
    channel: ScalarChannel,
    instanceToGrid: number[],
    opts: { threshold?: number; invert?: boolean } = {},
): void {
    if (!instMesh || !channel?.data || !instanceToGrid) return;

    const count = instMesh.count;
    const { data, min, max, ramp = 'contamination' } = channel;
    const range = max - min;
    const threshold = opts.threshold ?? 0;
    const invert = opts.invert ?? false;

    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
        const flatIdx = instanceToGrid[i];
        const raw = data[flatIdx as number] ?? 0;
        let t = range > 1e-10 ? (raw - min) / range : 0;
        t = Math.max(0, Math.min(1, t));
        if (invert) t = 1 - t;

        if (t < threshold) {
            // Esconde ocultando-se atrÃ¡s de alpha zero nÃ£o Ã© possÃ­vel em InstancedMesh
            // sem MorphTargets - usar cor idÃªntica ao fundo (transparÃªncia via opacity)
            colors[i * 3] = 0;
            colors[i * 3 + 1] = 0;
            colors[i * 3 + 2] = 0;
        } else {
            const { r, g, b } = sampleRamp(ramp, t);
            colors[i * 3] = r;
            colors[i * 3 + 1] = g;
            colors[i * 3 + 2] = b;
        }
    }

    instMesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    instMesh.instanceColor.needsUpdate = true;
    instMesh.material.vertexColors = true;
    instMesh.material.needsUpdate = true;
}

/**
 * Remove channel color overlay and restore zone material color.
 * Remove sobreposicao de canal e restaura cor original da zona.
 */
export function clearChannelColors(instMesh: any): void {
    if (!instMesh) return;
    instMesh.instanceColor = null;
    instMesh.material.vertexColors = false;
    instMesh.material.needsUpdate = true;
}

// ----------------------------------------------------------------
// APPLY TO FULL VOLUME GROUP
// ----------------------------------------------------------------

/**
 * Apply channel colors to all InstancedMesh children of a group.
 * Aplica canal em todos os InstancedMesh do grupo de um volume.
 */
export function applyChannelToVolume(
    parentGroup: any,
    volumeId: string,
    channel: ScalarChannel,
    opts: { threshold?: number; invert?: boolean } = {},
): void {
    for (const child of parentGroup.children) {
        if (child.userData.volumeId !== volumeId) continue;
        if (!child.isInstancedMesh) continue;
        const itg = child.userData.instanceToGrid;
        if (!itg) continue;
        applyChannelColors(child, channel, itg, opts);
    }
}

/**
 * Clear channel overlay from all InstancedMesh in a volume.
 * Limpa sobreposicao de canal de um volume.
 */
export function clearChannelFromVolume(parentGroup: any, volumeId: string): void {
    for (const child of parentGroup.children) {
        if (child.userData.volumeId !== volumeId) continue;
        if (!child.isInstancedMesh) continue;
        clearChannelColors(child);
    }
}

// ----------------------------------------------------------------
// ISOSURFACE FROM CHANNEL
// ----------------------------------------------------------------

/**
 * Extract an isosurface mesh from a scalar channel at a given value.
 * Extrai isosuperfÃ­cie de um canal escalar no valor especificado.
 */
export function extractChannelIsosurface(
    channel: { data: Float32Array; min: number; max: number; ramp: string; label: string; name?: string },
    dims: { nx: number; ny: number; nz: number },
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
    yRange: { top: number; bottom: number },
    resolution: number,
    isoValue: number,
    opts: { opacity?: number; ramp?: string } = {},
): any {
    if (!channel?.data || !dims) return null;

    const range = channel.max - channel.min;
    if (range < 1e-10) return null;

    const t = Math.max(0, Math.min(1, (isoValue - channel.min) / range));
    const geometry = extractIsosurface(channel.data, dims as any, bounds as any, isoValue);
    if (!geometry || !geometry.attributes.position?.count) return null;

    const { r, g, b } = sampleRamp(opts.ramp || channel.ramp || 'contamination', t);
    const color = new THREE.Color(r, g, b);

    const mat = new THREE.MeshStandardMaterial({
        color,
        transparent: true,
        opacity: opts.opacity ?? 0.6,
        side: THREE.DoubleSide,
        depthWrite: false,
        roughness: 0.7,
    });

    const mesh = new THREE.Mesh(geometry, mat);
    mesh.name = `voxel-iso-${channel.label || channel.name || 'channel'}-${isoValue}`;
    mesh.renderOrder = 6;
    mesh.userData.isIsosurface = true;
    mesh.userData.isoValue = isoValue;
    mesh.userData.channelName = channel.name;

    return mesh;
}

/**
 * Remove previously added isosurface meshes from a group.
 * Remove isosuperficies do grupo de voxels.
 */
export function clearIsosurfaces(parentGroup: any, volumeId?: string): void {
    const toRemove = parentGroup.children.filter(
        (c: any) => c.userData.isIsosurface && (volumeId === undefined || c.userData.volumeId === volumeId),
    );
    for (const m of toRemove) {
        parentGroup.remove(m);
        if (m.geometry) m.geometry.dispose();
        if (m.material) m.material.dispose();
    }
}
