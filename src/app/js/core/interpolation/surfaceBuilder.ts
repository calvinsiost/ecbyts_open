// @ts-check
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
/* ================================================================
   SURFACE BUILDER — Construção de meshes 3D a partir de grids
   ================================================================

   Converte grids interpolados (Float32Array) em meshes Three.js
   com PlaneGeometry deformada e vertex colors.

   GEOMETRIA:
   - PlaneGeometry(width, depth, cols-1, rows-1) rotacionada -π/2 em X
   - Vertex Y = valor do grid (elevação, nível d'água, etc.)
   - Vertex colors via colorRamps.js

   MATERIAL:
   - MeshLambertMaterial com vertexColors, transparent, DoubleSide

   ================================================================ */
import { createTHREEProxy } from '../three-lazy.js';
const THREE: any = createTHREEProxy();
import { sampleRamp, hexToRgb } from './colorRamps.js';
import { requestRender } from '../../utils/scene/setup.js';
// ----------------------------------------------------------------
// CONSTRUÇÃO
// ----------------------------------------------------------------
/**
 * Constrói um mesh de superfície 3D a partir de um grid interpolado.
 *
 * @param {Float32Array} grid - dados row-major [rows * cols]
 * @param {{ minX: number, maxX: number, minZ: number, maxZ: number }} bounds
 * @param {{ cols: number, rows: number }} gridSize
 * @param {string} colorRamp - nome da paleta (ex: 'terrain')
 * @param {{ min: number, max: number }} stats - min/max para normalização de cor
 * @param {Object} [options]
 * @param {number} [options.opacity=0.85]
 * @param {boolean} [options.wireframe=false]
 * @param {number} [options.verticalScale=1] - exagero vertical
 * @param {number} [options.zOffset=0] - offset vertical para evitar z-fighting
 * @param {number} [options.renderOrder=1] - ordem de renderização (maior = mais na frente)
 * @param {string|null} [options.fixedColor=null] - cor fixa (hex), bypassa rampa
 * @returns {any}
 */
export function buildSurfaceMesh(grid: any, bounds: any, gridSize: any, colorRamp: any, stats: any, options: any = {}) {
    const { cols, rows } = gridSize;
    const { opacity = 0.85, wireframe = false, verticalScale = 1, zOffset = 0, renderOrder = 1, fixedColor = null, } = options;
    const fixedRgb = fixedColor ? hexToRgb(fixedColor) : null;
    const width = bounds.maxX - bounds.minX;
    const depth = bounds.maxZ - bounds.minZ;
    // PlaneGeometry no plano XY → rotacionar para XZ
    const geo = new THREE.PlaneGeometry(width, depth, cols - 1, rows - 1);
    geo.rotateX(-Math.PI / 2);
    // Posiciona o centro do plane nos bounds
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerZ = (bounds.minZ + bounds.maxZ) / 2;
    // Acessa buffer de posições
    const positions = geo.attributes.position;
    const colors = new Float32Array(positions.count * 3);
    const range = stats.max - stats.min;
    const safeRange = range < 1e-6 ? 1 : range;
    for (let i = 0; i < positions.count; i++) {
        // PlaneGeometry após rotação: vértices em (localX, 0, localZ)
        // Mapeamos para coordenadas do grid
        const localX = positions.getX(i);
        const localZ = positions.getZ(i);
        // Converte posição local do plane para índice no grid
        // PlaneGeometry vai de -width/2 a +width/2, -depth/2 a +depth/2
        const fracX = (localX + width / 2) / width; // 0..1
        const fracZ = (localZ + depth / 2) / depth; // 0..1
        const gCol = Math.min(cols - 1, Math.max(0, Math.round(fracX * (cols - 1))));
        const gRow = Math.min(rows - 1, Math.max(0, Math.round(fracZ * (rows - 1))));
        const value = grid[gRow * cols + gCol];
        // Deforma Y com exagero vertical centrado em zero.
        // Fórmula: (value - mean) * verticalScale
        // Posicionamento absoluto via mesh.position.set(..., zOffset, ...).
        const meanY = (stats.min + stats.max) / 2;
        positions.setY(i, (value - meanY) * verticalScale);
        // Vertex color - cor fixa (geologia) ou gradiente (demais)
        if (fixedRgb) {
            colors[i * 3] = fixedRgb.r;
            colors[i * 3 + 1] = fixedRgb.g;
            colors[i * 3 + 2] = fixedRgb.b;
        }
        else {
            const t = (value - stats.min) / safeRange;
            const color = sampleRamp(colorRamp, t);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }
    }
    positions.needsUpdate = true;
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    // Material
    const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
        wireframe,
        roughness: 0.92,
        metalness: 0.02,
    });
    const mesh = new THREE.Mesh(geo, mat);
    // Posiciona no centro do bounds (zOffset eleva acima do terreno para evitar z-fighting)
    mesh.position.set(centerX, zOffset, centerZ);
    mesh.name = 'interpolationSurface';
    mesh.renderOrder = renderOrder;
    // Metadata para updates
    mesh.userData.interpolation = {
        bounds,
        gridSize,
        colorRamp,
        stats,
        verticalScale,
        fixedColor,
        renderOrder,
        zOffset,
    };
    return mesh;
}
// ----------------------------------------------------------------
// ATUALIZAÇÃO IN-PLACE
// ----------------------------------------------------------------
/**
 * Atualiza elevações e cores de um mesh existente sem recriar geometria.
 * Usado quando o método/dados mudam mas a resolução permanece.
 *
 * @param {any} mesh
 * @param {Float32Array} grid - novo grid
 * @param {string} colorRamp
 * @param {{ min: number, max: number }} stats
 * @param {number} [verticalScale=1]
 */
export function updateSurfaceElevations(mesh: any, grid: any, colorRamp: any, stats: any, verticalScale: any = 1) {
    const geo = mesh.geometry;
    const positions = geo.attributes.position;
    const colorAttr = geo.attributes.color;
    const meta = mesh.userData.interpolation;
    const { cols, rows } = meta.gridSize;
    const width = meta.bounds.maxX - meta.bounds.minX;
    const depth = meta.bounds.maxZ - meta.bounds.minZ;
    const fixedRgb = meta.fixedColor ? hexToRgb(meta.fixedColor) : null;
    const range = stats.max - stats.min;
    const safeRange = range < 1e-6 ? 1 : range;
    for (let i = 0; i < positions.count; i++) {
        const localX = positions.getX(i);
        const localZ = positions.getZ(i);
        const fracX = (localX + width / 2) / width;
        const fracZ = (localZ + depth / 2) / depth;
        const gCol = Math.min(cols - 1, Math.max(0, Math.round(fracX * (cols - 1))));
        const gRow = Math.min(rows - 1, Math.max(0, Math.round(fracZ * (rows - 1))));
        const value = grid[gRow * cols + gCol];
        positions.setY(i, value * verticalScale);
        if (fixedRgb) {
            colorAttr.setXYZ(i, fixedRgb.r, fixedRgb.g, fixedRgb.b);
        }
        else {
            const t = (value - stats.min) / safeRange;
            const color = sampleRamp(colorRamp, t);
            colorAttr.setXYZ(i, color.r, color.g, color.b);
        }
    }
    positions.needsUpdate = true;
    colorAttr.needsUpdate = true;
    geo.computeVertexNormals();
    // Atualiza metadata
    mesh.userData.interpolation.colorRamp = colorRamp;
    mesh.userData.interpolation.stats = stats;
    mesh.userData.interpolation.verticalScale = verticalScale;
}
// ----------------------------------------------------------------
// WIREFRAME TOGGLE
// ----------------------------------------------------------------
/**
 * Alterna wireframe de um mesh de superfície.
 * @param {any} mesh
 * @param {boolean} enabled
 */
export function setSurfaceWireframe(mesh: any, enabled: any) {
    if (mesh && mesh.material) {
        mesh.material.wireframe = enabled;
        mesh.material.needsUpdate = true;
    }
}
/**
 * Atualiza opacidade de um mesh de superfície.
 * @param {any} mesh
 * @param {number} opacity - 0..1
 */
export function setSurfaceOpacity(mesh: any, opacity: any) {
    if (mesh && mesh.material) {
        mesh.material.opacity = opacity;
        mesh.material.needsUpdate = true;
    }
}
// ----------------------------------------------------------------
// DISPOSE
// ----------------------------------------------------------------
// ----------------------------------------------------------------
// SATELLITE TEXTURE - Imagem aérea sobre o terreno
// ----------------------------------------------------------------
/**
 * Aplica textura de satélite ao mesh de superfície.
 * Carrega imagem com fallback chain (ESRI → Google → Bing).
 *
 * @param {any} mesh
 * @param {string[]} imageUrls - URLs com fallback
 */
export function applySatelliteTexture(mesh: any, imageUrls: any) {
    if (!mesh || !imageUrls?.length)
        return Promise.resolve(false);
    return _loadTextureWithFallback(imageUrls, 0, mesh);
}
/**
 * Carrega textura com fallback recursivo.
 * @param {string[]} urls
 * @param {number} index
 * @param {any} mesh
 * @returns {Promise<boolean>}
 */
function _loadTextureWithFallback(urls: any, index: any, mesh: any) {
    return new Promise((resolve) => {
        /** @param {number} useTexture */
        const tryLoad = (currentIndex: any) => {
            if (currentIndex >= urls.length) {
                // Fallback: se todas as URLs falharem, mantém vertex colors
                console.warn('[Interpolation] All satellite textures failed, keeping vertex colors');
                if (mesh.material?.map) {
                    mesh.material.map.dispose();
                    mesh.material.map = null;
                }
                mesh.material.vertexColors = true;
                mesh.material.needsUpdate = true;
                if (mesh.userData?.interpolation) {
                    mesh.userData.interpolation.satelliteTexture = null;
                }
                requestRender();
                resolve(false);
                return;
            }
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const tex = new THREE.Texture(img);
                tex.needsUpdate = true;
                mesh.material.map = tex;
                mesh.material.vertexColors = false;
                mesh.material.needsUpdate = true;
                mesh.userData.interpolation.satelliteTexture = tex;
                requestRender();
                resolve(true);
            };
            img.onerror = () => tryLoad(currentIndex + 1);
            img.src = urls[currentIndex];
        };
        tryLoad(index);
    });
}
/**
 * Alterna entre textura de satélite e vertex colors (color ramp).
 * @param {any} useTexture
 * @param {boolean} useTexture - true = satélite, false = color ramp
 */
export function toggleSurfaceTexture(mesh: any, useTexture: any) {
    if (!mesh?.material)
        return;
    const tex = mesh.userData.interpolation?.satelliteTexture;
    if (useTexture && tex) {
        mesh.material.map = tex;
        mesh.material.vertexColors = false;
    }
    else {
        mesh.material.map = null;
        mesh.material.vertexColors = true;
    }
    mesh.material.needsUpdate = true;
    requestRender();
}
// ----------------------------------------------------------------
// DISPOSE
// ----------------------------------------------------------------
/**
 * Remove mesh e libera recursos GPU.
 * @param {any} mesh
 */
export function disposeSurface(mesh: any) {
    if (!mesh)
        return;
    if (mesh.geometry)
        mesh.geometry.dispose();
    if (mesh.material) {
        if (mesh.material.map)
            mesh.material.map.dispose();
        mesh.material.dispose();
    }
    if (mesh.parent)
        mesh.parent.remove(mesh);
}
/**
 * Recolore os vértices de uma superfície por faixas de valor.
 * Substitui o colorRamp para o frame corrente.
 *
 * @param {any} mesh - mesh da superfície
 * @param {Array<{max:number|null, color:string|number}>} bands - ordenadas por max crescente; última com max=null (catch-all)
 * @param {Object} [bands] - {min, max} - mantido por consistência de assinatura
 */
export function applyValueBands(mesh: any, bands: any, _stats: any) {
    if (!bands?.length || !mesh?.geometry)
        return;
    const geometry = mesh.geometry;
    const positions = geometry.attributes.position;
    const colorAttr = geometry.attributes.color;
    if (!colorAttr || !positions)
        return;
    const color = new THREE.Color();
    for (let i = 0; i < positions.count; i++) {
        const y = positions.getY(i);
        // Encontra a primeira faixa cujo max >= y (ou null = catch-all)
        const band = bands.find((b: any) => b.max === null || y <= b.max) ?? bands[bands.length - 1];
        color.set(band.color);
        colorAttr.setXYZ(i, color.r, color.g, color.b);
    }
    colorAttr.needsUpdate = true;
    geometry.computeVertexNormals();
    if (typeof requestRender === 'function')
        requestRender();
}
