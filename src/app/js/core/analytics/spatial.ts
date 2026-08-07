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
   SPATIAL EXTRAPOLATION — Optimal sampling point recommendation
   ================================================================

   Sugere pontos otimos para proxima campanha baseado em:
   - Cobertura espacial (onde ha pocos de monitoramento)
   - Lacunas na malha (areas sem dados)
   - Distancia maxima entre pontos

   ================================================================ */
import { getAllElements } from '../elements/manager.js';
// ================================================================
// ELEMENT POSITION EXTRACTION
// Extrai posicao de elementos independente da familia
// ================================================================
/**
 * Get position of an element in scene coordinates.
 * Retorna posicao do elemento em coordenadas da cena.
 *
 * @param {any} element
 * @returns {{x: number, y: number, z: number}|null}
 */
function getElementPosition(element: any) {
    const data = element.data;
    if (!data)
        return null;
    // Wells use coordinates
    if (data.coordinates) {
        return {
            x: data.coordinates.easting || 0,
            y: data.coordinates.elevation || 0,
            z: data.coordinates.northing || 0,
        };
    }
    // Plumes use center
    if (data.center) {
        return { x: data.center.x || 0, y: data.center.y || 0, z: data.center.z || 0 };
    }
    // Generic position
    if (data.position) {
        return { x: data.position.x || 0, y: data.position.y || 0, z: data.position.z || 0 };
    }
    // Boundary/polygon: centroid
    if (data.vertices && data.vertices.length > 0) {
        const cx = data.vertices.reduce((a: any, v: any) => a + (v.x || 0), 0) /
            data.vertices.length;
        const cz = data.vertices.reduce((a: any, v: any) => a + (v.z || 0), 0) /
            data.vertices.length;
        return { x: cx, y: 0, z: cz };
    }
    // Path: midpoint
    if (data.path && data.path.length > 0) {
        const mid = data.path[Math.floor(data.path.length / 2)];
        return { x: mid.x || 0, y: mid.y || 0, z: mid.z || 0 };
    }
    return null;
}
// ================================================================
// COVERAGE ANALYSIS - How well is the area monitored?
// ================================================================
/**
 * Calculate monitoring coverage percentage.
 * Calcula a porcentagem de cobertura de monitoramento.
 * Usa buffer circular ao redor de cada poco/ponto.
 *
 * @param {any} [elements] - Array of elements (optional, defaults to all)
 * @param {number} [bufferRadius] - Coverage radius per point (meters, default 50)
 * @returns {Object} { coverage, boundingBox, pointCount, totalArea, coveredArea }
 */
export function calculateCoverage(elements = null, bufferRadius = 50) {
    const allElements = elements || getAllElements();
    // Get positions of monitoring points (wells, markers, sample points)
    const monitoringFamilies = ['well', 'spring', 'marker', 'sample'];
    const points = [];
    for (const el of allElements) {
        if (monitoringFamilies.includes(el.family)) {
            const pos = getElementPosition(el);
            if (pos)
                points.push(pos);
        }
    }
    if (points.length < 2) {
        return { coverage: 0, boundingBox: null, pointCount: points.length, totalArea: 0, coveredArea: 0 };
    }
    // Bounding box
    const minX = Math.min(...points.map((p: any) => p.x)) - bufferRadius;
    const maxX = Math.max(...points.map((p: any) => p.x)) + bufferRadius;
    const minZ = Math.min(...points.map((p: any) => p.z)) - bufferRadius;
    const maxZ = Math.max(...points.map((p: any) => p.z)) + bufferRadius;
    const totalArea = (maxX - minX) * (maxZ - minZ);
    if (totalArea <= 0)
        return { coverage: 0, boundingBox: null, pointCount: points.length, totalArea: 0, coveredArea: 0 };
    // Grid-based coverage estimation
    const gridSize = bufferRadius / 2;
    const cols = Math.ceil((maxX - minX) / gridSize);
    const rows = Math.ceil((maxZ - minZ) / gridSize);
    let coveredCells = 0;
    const totalCells = cols * rows;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cellX = minX + c * gridSize + gridSize / 2;
            const cellZ = minZ + r * gridSize + gridSize / 2;
            // Check if any point is within buffer radius
            const isCovered = points.some((p: any) => {
                const dx = p.x - cellX;
                const dz = p.z - cellZ;
                return Math.sqrt(dx * dx + dz * dz) <= bufferRadius;
            });
            if (isCovered)
                coveredCells++;
        }
    }
    const coverage = totalCells > 0 ? coveredCells / totalCells : 0;
    return {
        coverage,
        boundingBox: { minX, maxX, minZ, maxZ },
        pointCount: points.length,
        totalArea,
        coveredArea: coverage * totalArea,
    };
}
// ================================================================
// GAP DETECTION - Find areas without monitoring
// ================================================================
/**
 * Find gaps in monitoring coverage.
 * Identifica areas sem pontos de monitoramento proximo.
 *
 * @param {any} [elements] - Array of elements (optional)
 * @param {number} [gridSize] - Grid cell size (meters, default 20)
 * @param {number} [minDistance] - Min distance to flag as gap (default 80)
 * @returns {Array<{x: number, z: number, nearestDistance: number}>} Gap locations
 */
export function findGaps(elements = null, gridSize = 20, minDistance = 80) {
    const allElements = elements || getAllElements();
    const monitoringFamilies = ['well', 'spring', 'marker', 'sample'];
    const points = [];
    for (const el of allElements) {
        if (monitoringFamilies.includes(el.family)) {
            const pos = getElementPosition(el);
            if (pos)
                points.push(pos);
        }
    }
    if (points.length < 2)
        return [];
    // Bounding box
    const minX = Math.min(...points.map((p: any) => p.x)) - minDistance;
    const maxX = Math.max(...points.map((p: any) => p.x)) + minDistance;
    const minZ = Math.min(...points.map((p: any) => p.z)) - minDistance;
    const maxZ = Math.max(...points.map((p: any) => p.z)) + minDistance;
    const gaps = [];
    const cols = Math.ceil((maxX - minX) / gridSize);
    const rows = Math.ceil((maxZ - minZ) / gridSize);
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cellX = minX + c * gridSize + gridSize / 2;
            const cellZ = minZ + r * gridSize + gridSize / 2;
            // Find nearest monitoring point
            let nearest = Infinity;
            for (const p of points) {
                const dx = p.x - cellX;
                const dz = p.z - cellZ;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist < nearest)
                    nearest = dist;
            }
            if (nearest > minDistance) {
                gaps.push({ x: cellX, z: cellZ, nearestDistance: nearest });
            }
        }
    }
    return gaps;
}
// ================================================================
// OPTIMAL POINT SUGGESTION - Greedy coverage maximization
// ================================================================
/**
 * Suggest optimal locations for new monitoring points.
 * Sugere locais otimos para novos pontos de monitoramento.
 * Usa algoritmo guloso: coloca pontos onde maximiza cobertura.
 *
 * @param {number} [count] - Number of points to suggest (default 5)
 * @param {any} [elements] - Array of elements (optional)
 * @returns {Array<{x: number, y: number, z: number, reason: string, priority: number}>}
 */
export function suggestOptimalPoints(count = 5, elements = null) {
    const allElements = elements || getAllElements();
    const monitoringFamilies = ['well', 'spring', 'marker', 'sample'];
    const existingPoints = [];
    for (const el of allElements) {
        if (monitoringFamilies.includes(el.family)) {
            const pos = getElementPosition(el);
            if (pos)
                existingPoints.push(pos);
        }
    }
    if (existingPoints.length < 1)
        return [];
    // Get gaps
    const gaps = findGaps(allElements as any);
    if (gaps.length === 0)
        return [];
    // Sort gaps by nearest distance (largest gaps first)
    gaps.sort((a: any, b: any) => b.nearestDistance - a.nearestDistance);
    // Greedy selection: pick top gaps that are far from each other
    /** @type {any[]} */
    const selected: any[] = [];
    const minSeparation = 30; // Minimum distance between suggested points
    for (const gap of gaps) {
        if (selected.length >= count)
            break;
        // Check distance from already selected points
        const tooClose = selected.some((s: any) => {
            const dx = s.x - gap.x;
            const dz = s.z - gap.z;
            return Math.sqrt(dx * dx + dz * dz) < minSeparation;
        });
        if (!tooClose) {
            selected.push({
                x: gap.x,
                y: 0,
                z: gap.z,
                reason: `Coverage gap: nearest well is ${Math.round(gap.nearestDistance)}m away`,
                priority: selected.length + 1,
                nearestDistance: gap.nearestDistance,
            });
        }
    }
    return selected;
}
// ================================================================
// 3D VISUALIZATION - Add markers to Three.js scene
// ================================================================
// Store references for cleanup
/** @type {any[]} */
let recommendationMeshes: any[] = [];
/**
 * Add translucent sphere markers to the 3D scene.
 * Adiciona esferas translucidas na cena 3D para pontos recomendados.
 *
 * @param {any} scene - Three.js scene object
 * @param {any[]} points - Suggested points from suggestOptimalPoints
 * @param {any} THREE - Three.js library reference
 */
export function visualizeRecommendations(scene: any, points: any, THREE: any) {
    // Clear previous markers
    clearRecommendations(scene);
    if (!THREE || !scene)
        return;
    const geometry = new THREE.SphereGeometry(2, 16, 16);
    const material = new THREE.MeshBasicMaterial({
        color: 0x00ff88,
        transparent: true,
        opacity: 0.4,
        wireframe: false,
    });
    for (const point of points) {
        const mesh = new THREE.Mesh(geometry, material.clone());
        mesh.position.set(point.x, point.y, point.z);
        mesh.userData = { isRecommendation: true, priority: point.priority, reason: point.reason };
        scene.add(mesh);
        recommendationMeshes.push(mesh);
        // Add wireframe ring for visibility
        const ringGeometry = new THREE.RingGeometry(2.5, 3, 32);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff88,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.6,
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.position.set(point.x, 0.1, point.z);
        ring.rotation.x = -Math.PI / 2;
        ring.userData = { isRecommendation: true };
        scene.add(ring);
        recommendationMeshes.push(ring);
    }
}
/**
 * Remove recommendation markers from scene.
 * Remove marcadores de recomendacao da cena.
 *
 * @param {any} scene - Three.js scene object
 */
export function clearRecommendations(scene: any) {
    if (!scene)
        return;
    for (const mesh of recommendationMeshes) {
        scene.remove(mesh);
        if (mesh.geometry)
            mesh.geometry.dispose();
        if (mesh.material)
            mesh.material.dispose();
    }
    recommendationMeshes = [];
}
