// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   MESH FACTORY PURE (ARCH-MONOLITH-ATOMIZATION-001 extraction)
   ================================================================

   Helpers pure-logic extraídos de core/elements/meshFactory.ts.

   ESCOPO: SÓ o cálculo que DECIDE os números de dimensão e posição
   das malhas "caixa" legadas (pit, dam, building). A construção do
   THREE.Mesh/BoxGeometry permanece em meshFactory.ts — este módulo é
   livre da dependência Three.js (mesmo boundary do _trajectoryPure.ts).

   IMPORTANTE — comportamento idêntico:
     As expressões abaixo replicam EXATAMENTE os defaults/clamps inline
     do meshFactory.ts. O padrão `Number(x) || default` (NÃO toFiniteNumber)
     é deliberado: cai no default quando o valor é 0, NaN, undefined,
     null, '' ou qualquer falsy — mesma semântica que o monolito tinha.
     Mudar para toFiniteNumber alteraria o resultado quando o input é 0.

   Convenção de coordenadas Three.js: x=East, y=UP, z=North.
   `baseY` é a cota de referência (data.position?.y ?? 0).
   ================================================================ */

export interface BoxDimensions {
    /** Eixo X (length) em unidades de cena */
    length: number;
    /** Eixo Y (altura/profundidade) em unidades de cena */
    height: number;
    /** Eixo Z (width/espessura) em unidades de cena */
    width: number;
}

export interface BoxMeshSpec extends BoxDimensions {
    /** Cota Y do CENTRO da BoxGeometry (já com o offset vertical aplicado) */
    centerY: number;
}

/**
 * Dimensões da caixa legada de um POÇO/CAVA (pit) por dimensions.
 * Caminho legado de createPitMesh quando NÃO há data.vertices.
 *
 * Defaults/clamps idênticos ao monolito:
 *   length = Math.max(1,   Number(data?.dimensions?.length) || 40)   // eixo X
 *   width  = Math.max(1,   Number(data?.dimensions?.width)  || 30)   // eixo Z
 *   depth  = Math.max(0.1, Number(data?.depth)              || 20)   // eixo Y
 *
 * Posicionamento: topo na cota baseY → centro em baseY - depth/2.
 */
export function resolvePitBoxSpec(data: any): BoxMeshSpec {
    const length = Math.max(1, Number(data?.dimensions?.length) || 40);
    const width = Math.max(1, Number(data?.dimensions?.width) || 30);
    const depth = Math.max(0.1, Number(data?.depth) || 20);
    const baseY = data?.position?.y ?? 0;
    return {
        length,
        height: depth,
        width,
        centerY: baseY - depth / 2,
    };
}

/**
 * Dimensões da caixa legada de uma BARRAGEM (dam) por dimensions.
 * Caminho legado de createDamMesh quando NÃO há data.vertices.
 *
 * Defaults/clamps idênticos ao monolito:
 *   length = Math.max(1,   Number(data?.dimensions?.length) || 30)   // eixo X
 *   width  = Math.max(0.5, Number(data?.dimensions?.width)  || 6)    // eixo Z (espessura)
 *   height = Math.max(0.1, Number(data?.height)             || 5)    // eixo Y (crista)
 *
 * Posicionamento: base na cota baseY → centro em baseY + height/2.
 */
export function resolveDamBoxSpec(data: any): BoxMeshSpec {
    const length = Math.max(1, Number(data?.dimensions?.length) || 30);
    const width = Math.max(0.5, Number(data?.dimensions?.width) || 6);
    const height = Math.max(0.1, Number(data?.height) || 5);
    const baseY = data?.position?.y ?? 0;
    return {
        length,
        height,
        width,
        centerY: baseY + height / 2,
    };
}

/**
 * Dimensões da caixa de um EDIFÍCIO (building). createBuildingMesh usa
 * BoxGeometry(1,1,1) cacheada + mesh.scale.set(w,h,d), logo as dimensões
 * são o próprio fator de escala.
 *
 * Defaults idênticos ao monolito (cadeia de fallback `||`, sem clamp):
 *   w = data.dimensions?.width  || data.footprint?.width  || 10                       // eixo X
 *   h = data.dimensions?.height || data.height            || 5                        // eixo Y
 *   d = data.dimensions?.depth  || data.dimensions?.length || data.footprint?.length || 10  // eixo Z
 *
 * Posicionamento: base na cota baseY → centro em baseY + h/2.
 */
export function resolveBuildingBoxSpec(data: any): BoxMeshSpec {
    const w = data?.dimensions?.width || data?.footprint?.width || 10;
    const h = data?.dimensions?.height || data?.height || 5;
    const d =
        data?.dimensions?.depth || data?.dimensions?.length || data?.footprint?.length || 10;
    const baseY = data?.position?.y ?? 0;
    return {
        length: w,
        height: h,
        width: d,
        centerY: baseY + h / 2,
    };
}
