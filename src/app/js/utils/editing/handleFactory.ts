// Generated from src/app/js/utils/editing/handleFactory.ts by TS-MIGRATION-001. Do not edit manually.
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
   HANDLE FACTORY — Vertex/midpoint/axis handle meshes
   ================================================================

   Cria os "alças" (handles) visuais para edição de geometria.
   Cada handle é uma esfera ou cubo pequeno que o usuário pode
   arrastar para mover vértices, pontos de controle ou eixos.

   TIPOS DE HANDLES:
   - vertex:   esfera nos vértices do polígono/caminho
   - midpoint: esfera menor entre vértices (clique insere novo vértice)
   - axis:     cubo colorido nos endpoints de eixos (raio, dimensão)

   ================================================================ */
import { createTHREEProxy } from '../../core/three-lazy.js';
const THREE: any = createTHREEProxy();
import { getCamera } from '../scene/setup.js';
// ----------------------------------------------------------------
// CONSTANTES VISUAIS
// ----------------------------------------------------------------
const HANDLE_COLORS = {
    vertex: 0x00ff88, // Verde — vértice principal
    vertexSelected: 0xffdd00, // Amarelo — vértice selecionado
    midpoint: 0x4488ff, // Azul — ponto médio (adicionar vértice)
    axisX: 0xff4444, // Vermelho — eixo X
    axisY: 0x44ff44, // Verde — eixo Y
    axisZ: 0x4444ff, // Azul — eixo Z
};
const VERTEX_RADIUS = 0.8;
const MIDPOINT_RADIUS = 0.5;
const AXIS_SIZE = 0.6;
// Geometrias compartilhadas (reutilizadas para todos os handles do mesmo tipo)
/** @type {any} */
let _vertexGeom: any = null;
/** @type {any} */
let _midpointGeom: any = null;
/** @type {any} */
let _axisGeom: any = null;
function getVertexGeometry() {
    if (!_vertexGeom) _vertexGeom = new THREE.SphereGeometry(VERTEX_RADIUS, 12, 12);
    return _vertexGeom;
}
function getMidpointGeometry() {
    if (!_midpointGeom) _midpointGeom = new THREE.SphereGeometry(MIDPOINT_RADIUS, 8, 8);
    return _midpointGeom;
}
function getAxisGeometry() {
    if (!_axisGeom) _axisGeom = new THREE.BoxGeometry(AXIS_SIZE, AXIS_SIZE, AXIS_SIZE);
    return _axisGeom;
}
// ----------------------------------------------------------------
// CRIAÇÃO DE HANDLES
// ----------------------------------------------------------------
/**
 * Cria handle de vértice principal.
 * Esfera verde que pode ser arrastada para mover o vértice.
 *
 * @param {any} position - Posição do handle
 * @param {number} index - Índice do vértice nos dados do elemento
 * @param {string} elementId - ID do elemento dono
 * @returns {any}
 */
export function createVertexHandle(position: any, index: any, elementId: any) {
    const material = new THREE.MeshBasicMaterial({
        color: HANDLE_COLORS.vertex,
        depthTest: false,
        transparent: true,
        opacity: 0.9,
    });
    const mesh = new THREE.Mesh(getVertexGeometry(), material);
    mesh.position.copy(position);
    mesh.renderOrder = 999;
    mesh.userData = {
        handleType: 'vertex',
        vertexIndex: index,
        elementId: elementId,
    };
    return mesh;
}
/**
 * Cria handle de ponto médio (entre vértices).
 * Esfera azul menor - clique insere novo vértice nesta posição.
 *
 * @param {any} position - Posição (média entre dois vértices)
 * @param {number} afterIndex - Índice do vértice anterior (novo vértice será inserido depois)
 * @param {string} elementId - ID do elemento dono
 * @returns {any}
 */
export function createMidpointHandle(position: any, afterIndex: any, elementId: any) {
    const material = new THREE.MeshBasicMaterial({
        color: HANDLE_COLORS.midpoint,
        depthTest: false,
        transparent: true,
        opacity: 0.6,
    });
    const mesh = new THREE.Mesh(getMidpointGeometry(), material);
    mesh.position.copy(position);
    mesh.renderOrder = 998;
    mesh.userData = {
        handleType: 'midpoint',
        afterIndex: afterIndex,
        elementId: elementId,
    };
    return mesh;
}
/**
 * Cria handle de eixo (para plume, lake, building).
 * Cubo colorido no endpoint de um eixo de dimensão.
 *
 * @param {any} position - Posição do endpoint
 * @param {string} axisName - Nome do eixo ('radiusX', 'radiusY', 'radiusZ', 'width', 'length', 'height')
 * @param {string} direction - Direção: 'positive' | 'negative'
 * @param {string} elementId - ID do elemento dono
 * @returns {any}
 */
export function createAxisHandle(position: any, axisName: any, direction: any, elementId: any) {
    // Cor baseada no eixo principal
    let color = HANDLE_COLORS.axisX;
    if (axisName.includes('Y') || axisName === 'height') color = HANDLE_COLORS.axisY;
    if (axisName.includes('Z') || axisName === 'length') color = HANDLE_COLORS.axisZ;
    const material = new THREE.MeshBasicMaterial({
        color: color,
        depthTest: false,
        transparent: true,
        opacity: 0.9,
    });
    const mesh = new THREE.Mesh(getAxisGeometry(), material);
    mesh.position.copy(position);
    mesh.renderOrder = 999;
    mesh.userData = {
        handleType: 'axis',
        axisName: axisName,
        direction: direction,
        elementId: elementId,
    };
    return mesh;
}
// ----------------------------------------------------------------
// SELEÇÃO VISUAL
// ----------------------------------------------------------------
/**
 * Destaca handle como selecionado (amarelo).
 * @param {any} handle
 */
export function selectHandle(handle: any) {
    if (handle?.material) {
        handle.material.color.setHex(HANDLE_COLORS.vertexSelected);
    }
}
/**
 * Remove destaque de handle (volta à cor original).
 * @param {any} handle
 */
export function deselectHandle(handle: any) {
    if (!handle?.material || !handle.userData) return;
    const type = handle.userData.handleType;
    if (type === 'vertex') {
        handle.material.color.setHex(HANDLE_COLORS.vertex);
    } else if (type === 'midpoint') {
        handle.material.color.setHex(HANDLE_COLORS.midpoint);
    }
}
// ----------------------------------------------------------------
// ESCALA ADAPTATIVA
// ----------------------------------------------------------------
/**
 * Ajusta escala dos handles para manter tamanho visual constante
 * independente do zoom da câmera ortográfica.
 *
 * @param {any} handleGroup - Grupo contendo todos os handles
 */
export function updateHandleScales(handleGroup: any) {
    const camera = getCamera();
    if (!camera || !handleGroup) return;
    // Câmera ortográfica: zoom controla a escala visual
    const scale = 1 / /** @type {{ zoom?: number }} */ (camera.zoom || 1);
    handleGroup.children.forEach((handle: any) => {
        handle.scale.set(scale, scale, scale);
    });
}
// ----------------------------------------------------------------
// LIMPEZA
// ----------------------------------------------------------------
/**
 * Remove e descarta todos os handles de um grupo.
 * Libera materiais (geometrias compartilhadas não são descartadas).
 *
 * @param {any} handleGroup - Grupo a limpar
 */
export function disposeHandles(handleGroup: any) {
    if (!handleGroup) return;
    while (handleGroup.children.length > 0) {
        const child = handleGroup.children[0];
        // Dispose geometrias não-compartilhadas (Lines, outlines da cage)
        if (child.geometry && !child.userData?.handleType) {
            child.geometry.dispose();
        }
        if (child.material) child.material.dispose();
        handleGroup.remove(child);
    }
}
/**
 * Descarta geometrias compartilhadas.
 * Chamar apenas ao destruir o editor completamente.
 */
export function disposeSharedGeometries() {
    if (_vertexGeom) {
        _vertexGeom.dispose();
        _vertexGeom = null;
    }
    if (_midpointGeom) {
        _midpointGeom.dispose();
        _midpointGeom = null;
    }
    if (_axisGeom) {
        _axisGeom.dispose();
        _axisGeom = null;
    }
}
