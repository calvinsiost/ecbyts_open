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
   HELPERS PARA CRIAÇÃO DE MESHES 3D
   ================================================================

   Funções utilitárias compartilhadas entre meshFactory, spriteFactory
   e meshESG — evitam duplicação de lógica comum.

   FUNCOES:
   - parseColor: converte hex string em numero
   - normalizeUVs: normaliza coordenadas UV para [0,1]
   - applyRotationDegrees: aplica rotação em graus a um mesh
   - DEG2RAD: constante de conversão graus→radianos

   ================================================================ */

import { createTHREEProxy } from '../three-lazy.js';
const _THREE: any = createTHREEProxy();

// Minimal structural types mirroring the project's three-module shim
// (types/app/three-module.d.ts). Type-only — erased at runtime.
interface _ThreeBufferAttribute {
    count: number;
    needsUpdate: boolean;
    getX(index: number): number;
    getY(index: number): number;
    setXY(index: number, x: number, y: number): void;
}
interface _ThreeBufferGeometry {
    attributes: {
        uv?: _ThreeBufferAttribute;
        [name: string]: _ThreeBufferAttribute | undefined;
    };
}
interface _ThreeObject3D {
    rotation: { set(x: number, y: number, z: number): void };
}

// ----------------------------------------------------------------
// CONSTANTES
// ----------------------------------------------------------------

/** Fator de conversao graus → radianos */
export const DEG2RAD: number = Math.PI / 180;

// ----------------------------------------------------------------
// PARSECOLOR - Converte string hex em numero
// ----------------------------------------------------------------

/**
 * Converte string de cor (hex) em numero.
 * Aceita formato "#ff9900" ou "ff9900".
 *
 * @param value - Cor em formato hex
 * @returns Cor numerica ou null se invalida
 */
export function parseColor(value: string): number | null {
    if (!value || typeof value !== 'string') return null;
    const normalized = value.trim().replace('#', '');
    if (!/^[0-9A-Fa-f]{6}$/.test(normalized)) {
        return null;
    }
    return parseInt(normalized, 16);
}

// ----------------------------------------------------------------
// NORMALIZE UVS - ShapeGeometry usa coordenadas brutas
// ----------------------------------------------------------------

/**
 * Normaliza coordenadas UV de uma geometria para o intervalo [0,1].
 * ShapeGeometry gera UVs em coordenadas do mundo - isso impede que
 * texturas de overlay (imagem aérea) fiquem posicionadas corretamente.
 *
 * @param geometry - Geometria com atributo UV
 */
export function normalizeUVs(geometry: _ThreeBufferGeometry): void {
    const uvAttr = geometry.attributes.uv;
    if (!uvAttr) return;

    let minU = Infinity,
        maxU = -Infinity,
        minV = Infinity,
        maxV = -Infinity;
    for (let i = 0; i < uvAttr.count; i++) {
        const u = uvAttr.getX(i),
            v = uvAttr.getY(i);
        if (u < minU) minU = u;
        if (u > maxU) maxU = u;
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
    }
    const du = maxU - minU || 1,
        dv = maxV - minV || 1;
    for (let i = 0; i < uvAttr.count; i++) {
        uvAttr.setXY(i, (uvAttr.getX(i) - minU) / du, (uvAttr.getY(i) - minV) / dv);
    }
    uvAttr.needsUpdate = true;
}

// ----------------------------------------------------------------
// APPLY ROTATION DEGREES - Converte graus para radianos e aplica
// ----------------------------------------------------------------

/**
 * Aplica rotação em graus a um mesh, convertendo para radianos.
 * Evita repetir a multiplicação por DEG2RAD em cada criador.
 *
 * @param mesh - Objeto 3D para rotacionar
 * @param rotation - Rotação em graus {x, y, z}
 */
export function applyRotationDegrees(
    mesh: _ThreeObject3D,
    rotation: { x?: number; y?: number; z?: number },
): void {
    if (!rotation) return;
    mesh.rotation.set((rotation.x || 0) * DEG2RAD, (rotation.y || 0) * DEG2RAD, (rotation.z || 0) * DEG2RAD);
}
