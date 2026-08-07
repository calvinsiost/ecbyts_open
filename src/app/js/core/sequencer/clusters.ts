// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   SPATIAL CLUSTERING — Auto-detect element clusters
   Detecta agrupamentos espaciais de elementos usando
   single-linkage clustering. Elementos distantes (ex: 2 areas
   em estados diferentes) formam clusters separados na barra.

   Algoritmo: Single-linkage (nearest-neighbor)
   Complexidade: O(n²) — aceitavel para modelos tipicos (<10k).
   ================================================================ */
import { getAllElements } from '../elements/manager.js';
import { getElementPosition } from '../io/geo/coordinates.js';
// ----------------------------------------------------------------
// CONFIGURATION
// ----------------------------------------------------------------
const DEFAULT_THRESHOLD = 500; // metros — distancia maxima para merge
// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------
/**
 * Detecta clusters espaciais a partir dos elementos do modelo.
 * Retorna array de clusters com centroid, bounds e elementIds.
 *
 * @param {{ threshold?: number, elements?: Array<any> }} [options]
 * @returns {Array<any>}
 */
export function detectClusters(options: any = {}) {
    const threshold = options.threshold || DEFAULT_THRESHOLD;
    const elements = options.elements || getAllElements();
    // 1. Extrair posicoes validas (exclui elementos sem posicao)
    const positioned = [];
    for (const el of elements) {
        const pos = getElementPosition(el);
        if (pos && (pos.x !== 0 || pos.z !== 0)) {
            positioned.push({ id: el.id, family: el.family, name: el.name, pos });
        }
    }
    if (positioned.length === 0)
        return [];
    // 2. Union-Find para single-linkage clustering
    const parent = positioned.map((_: any, i: any) => i);
    /** @param {number} i */
    function find(i: any) {
        while (parent[i] !== i) {
            parent[i] = parent[parent[i]];
            i = parent[i];
        }
        return i;
    }
    /** @param {number} a @param {number} b */
    function union(a: any, b: any) {
        const ra = find(a), rb = find(b);
        if (ra !== rb)
            parent[ra] = rb;
    }
    // 3. Merge elementos com distancia < threshold
    for (let i = 0; i < positioned.length; i++) {
        for (let j = i + 1; j < positioned.length; j++) {
            const dist = distance3D(positioned[i]!.pos, positioned[j]!.pos);
            if (dist < threshold) {
                union(i, j);
            }
        }
    }
    // 4. Agrupar por cluster root
    /** @type {Record<number, Array<any>>} */
    const groups: Record<string, any> = {};
    for (let i = 0; i < positioned.length; i++) {
        const root = find(i);
        if (!groups[root])
            groups[root] = [];
        groups[root].push(positioned[i]);
    }
    // 5. Converter para formato Cluster
    const clusters = Object.values(groups).map((members: any, idx: any) => {
        const elementIds = members.map((m: any) => m.id);
        const bounds = computeBounds(members);
        const centroid = computeCentroid(members);
        const dominantFamily = getDominantFamily(members);
        return {
            id: `cluster-${buildStableClusterId(elementIds)}`,
            name: generateClusterName(members, idx),
            elementIds,
            elementCount: members.length,
            centroid,
            bounds,
            dominantFamily,
            cameraState: computeCameraForBounds(bounds, centroid),
        };
    });
    // Ordenar por posicao X (esquerda → direita no viewport)
    clusters.sort((a: any, b: any) => a.centroid.x - b.centroid.x);
    // Garantir unicidade de IDs mesmo em colisao de hash.
    const usedIds = new Set();
    for (const cluster of clusters) {
        const baseId = cluster.id;
        let uniqueId = baseId;
        let suffix = 1;
        while (usedIds.has(uniqueId)) {
            uniqueId = `${baseId}-${suffix++}`;
        }
        cluster.id = uniqueId;
        usedIds.add(uniqueId);
    }
    return clusters;
}
/**
 * Computa o bounding box de um conjunto de posicoes.
 * @param {Array<{pos: {x: number, y: number, z: number}}>} members
 * @returns {{minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number}}
 */
export function computeBounds(members: any) {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const m of members) {
        const { x, y, z } = m.pos;
        if (x < minX)
            minX = x;
        if (x > maxX)
            maxX = x;
        if (y < minY)
            minY = y;
        if (y > maxY)
            maxY = y;
        if (z < minZ)
            minZ = z;
        if (z > maxZ)
            maxZ = z;
    }
    return { minX, maxX, minY, maxY, minZ, maxZ };
}
// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
import { distance3D as _distance3D } from '../../utils/helpers/geometry.js';
function distance3D(a: any, b: any) {
    return _distance3D(a, b);
}
/** @param {Array<any>} members */
function computeCentroid(members: any) {
    let sx = 0, sy = 0, sz = 0;
    for (const m of members) {
        sx += m.pos.x;
        sy += m.pos.y;
        sz += m.pos.z;
    }
    const n = members.length;
    return { x: sx / n, y: sy / n, z: sz / n };
}
/** @param {Array<any>} members */
function getDominantFamily(members: any) {
    const counts: Record<string, any> = {};
    for (const m of members) {
        counts[m.family] = (counts[m.family] || 0) + 1;
    }
    let best = '', max = 0;
    for (const [fam, count] of Object.entries(counts)) {
        if (count > max) {
            max = count;
            best = fam;
        }
    }
    return best;
}
/** @param {Array<any>} members @param {number} idx */
function generateClusterName(members: any, idx: any) {
    // Tenta usar nomes dos elementos para gerar nome significativo
    // Ex: se todos comecam com "SP-" → "Cluster SP"
    const names = members.map((m: any) => m.name || '');
    const prefix = findCommonPrefix(names);
    if (prefix.length >= 2)
        return prefix.replace(/[-_\s]+$/, '');
    // Fallback: letra A, B, C...
    return String.fromCharCode(65 + idx);
}
/** @param {Array<string>} strings */
function findCommonPrefix(strings: any) {
    if (strings.length === 0)
        return '';
    let prefix = strings[0];
    for (let i = 1; i < strings.length; i++) {
        while (strings[i].indexOf(prefix) !== 0) {
            prefix = prefix.slice(0, -1);
            if (prefix === '')
                return '';
        }
    }
    return prefix;
}
/** @param {Array<any>} elementIds */
function buildStableClusterId(elementIds: any) {
    if (!Array.isArray(elementIds) || elementIds.length === 0)
        return 'empty';
    const signature = [...elementIds]
        .map((id: any) => String(id))
        .sort()
        .join('|');
    // FNV-1a 32-bit para gerar ID curto e deterministico.
    let hash = 0x811c9dc5;
    for (let i = 0; i < signature.length; i++) {
        hash ^= signature.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
        hash >>>= 0;
    }
    return `${elementIds.length}-${hash.toString(36)}`;
}
/**
 * Computa camera state que enquadra o bounding box.
 * Usa vista isometrica com margem de 20%.
 */
/** @param {any} bounds @param {any} centroid */
function computeCameraForBounds(bounds: any, centroid: any) {
    const extentX = bounds.maxX - bounds.minX || 10;
    const extentZ = bounds.maxZ - bounds.minZ || 10;
    const maxExtent = Math.max(extentX, extentZ);
    // Camera isometrica: posicao elevada olhando para centroid
    const distance = maxExtent * 1.2; // margem 20%
    return {
        camera: {
            x: centroid.x + distance * 0.5,
            y: centroid.y + distance,
            z: centroid.z + distance * 0.5,
            zoom: 1,
        },
        target: {
            x: centroid.x,
            y: centroid.y,
            z: centroid.z,
        },
    };
}
