// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   TRAJECTORY PURE (Module C extraction — refactor-opportunities pick)
   ================================================================

   Helpers pure-logic extraídos de core/elements/meshFactory.ts para o
   P1-8 P5p2 (SPEC_FAMILY_FAULT_WELLS_DIRECTIONAL).

   Convenção de coordenadas:
     Three.js: x=East, y=UP (=-TVD), z=North
   Por isso o y retornado é -tvd (TVD positivo = profundidade; UP é negativo).

   Funções retornam tuplas {x,y,z} pure (não Vector3) — o caller faz
   o wrap em Three.Vector3, mantendo este módulo livre da dep Three.

   Ref: Sawaryn & Thorogood (2005) SPE-84246-PA - Minimum Curvature.
   ================================================================ */

import { toFiniteNumber } from '../../utils/helpers/toFiniteNumber.js';

export interface Point3D {
    x: number;
    y: number;
    z: number;
}

/**
 * Raio do tubo de rio/canal a partir de width. Clamp mínimo 0.35m
 * (visualmente perceptível na cena, não some em zoom out).
 */
export function getRiverTubeRadius(width: any): number {
    const safeWidth = toFiniteNumber(width, 3);
    return Math.max(0.35, safeWidth * 0.22);
}

/**
 * Interpola coordenada 3D ao longo da trajetória direcional no MD dado.
 * Linear search entre stations adjacentes (arrays tipicamente <50).
 * Retorna {x,y,z} em coords Three.js (x=east, y=-tvd, z=north).
 *
 * Edge cases:
 *   - targetMd <= primeiro md → retorna primeiro ponto
 *   - targetMd >= último md → retorna último ponto
 *   - Entre stations → lerp linear de east/north/tvd
 *
 * @param md - measured depths array
 * @param north - northings array (m)
 * @param east - eastings array (m)
 * @param tvd - true vertical depths array (m, positive down)
 * @param targetMd - MD desejado para interpolação
 */
export function interpolateTrajectoryPoint3D(
    md: number[],
    north: number[],
    east: number[],
    tvd: number[],
    targetMd: number,
): Point3D {
    if (!Array.isArray(md) || md.length === 0) return { x: 0, y: 0, z: 0 };
    // Normaliza -0 → 0 via `+ 0` (preserva semântica numérica, evita strict-deep-equal flake)
    // Arrays paralelas com length verificada acima — `!` é seguro
    // (noUncheckedIndexedAccess) e mantém runtime byte-idêntico.
    if (targetMd <= md[0]!) return { x: east[0]!, y: -tvd[0]! + 0, z: north[0]! };
    const last = md.length - 1;
    if (targetMd >= md[last]!) return { x: east[last]!, y: -tvd[last]! + 0, z: north[last]! };
    for (let i = 1; i < md.length; i++) {
        if (md[i]! >= targetMd) {
            const t = (targetMd - md[i - 1]!) / (md[i]! - md[i - 1]!);
            return {
                x: east[i - 1]! + t * (east[i]! - east[i - 1]!),
                y: -(tvd[i - 1]! + t * (tvd[i]! - tvd[i - 1]!)),
                z: north[i - 1]! + t * (north[i]! - north[i - 1]!),
            };
        }
    }
    return { x: east[last]!, y: -tvd[last]!, z: north[last]! };
}

/**
 * Extrai pontos de trajetória no intervalo [mdTop, mdBottom], incluindo
 * interpolações exatas nas fronteiras. Deduplica pontos adjacentes
 * idênticos (distância < 0.001m) — pode acontecer quando station coincide
 * exatamente com fronteira.
 *
 * Use para gerar tubo segmentado por litologia (cada segmento é um slice
 * entre topo e base da camada).
 */
export function trajectorySlice3D(
    md: number[],
    north: number[],
    east: number[],
    tvd: number[],
    mdTop: number,
    mdBottom: number,
): Point3D[] {
    if (!Array.isArray(md) || md.length === 0) return [];
    const pts: Point3D[] = [interpolateTrajectoryPoint3D(md, north, east, tvd, mdTop)];
    for (let i = 0; i < md.length; i++) {
        if (md[i]! > mdTop && md[i]! < mdBottom) {
            pts.push({ x: east[i]!, y: -tvd[i]!, z: north[i]! });
        }
    }
    pts.push(interpolateTrajectoryPoint3D(md, north, east, tvd, mdBottom));
    return pts.filter((p, i) => {
        if (i === 0) return true;
        const prev = pts[i - 1]!;
        const dx = p.x - prev.x;
        const dy = p.y - prev.y;
        const dz = p.z - prev.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz) > 0.001;
    });
}
