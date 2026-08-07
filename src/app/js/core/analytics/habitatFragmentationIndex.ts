// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
/**
 * Habitat Fragmentation Index - FRAGSTATS metrics
 *
 * Implementa métricas de paisagem derivadas de McGarigal & Marks (1995) e
 * Jaeger (2000) para quantificar grau de fragmentação de habitat.
 *
 * Referências:
 *   McGarigal, K. & Marks, B.J. (1995). FRAGSTATS: Spatial pattern analysis
 *     program for quantifying landscape structure. USDA Gen. Tech. Rep. PNW-351.
 *   Jaeger, J.A.G. (2000). Landscape division, splitting index, and effective
 *     mesh size: new measures of landscape fragmentation. Landscape Ecology 15,
 *     115-130. DOI:10.1023/A:1008151713032
 *
 * @module habitatFragmentationIndex
 */

'use strict';

/**
 * Calcula Patch Density (PD) - número de fragmentos por 100 hectares.
 * PD elevado indica alta fragmentação.
 *
 * PD = (NP / A) × 10000   [onde A está em m²; resultado em patches/100ha]
 *
 * @param numPatches - Número total de fragmentos (NP)
 * @param totalArea_ha - Área total da paisagem em hectares
 *
 * @example calcPatchDensity(50, 1000) → { PD_patches_per_100ha: 5 }
 */
export function calcPatchDensity(numPatches: number, totalArea_ha: number): { PD_patches_per_100ha: number } {
    if (!Number.isFinite(numPatches) || numPatches < 0) {
        throw new RangeError(`numPatches deve ser >= 0, recebido: ${numPatches}`);
    }
    if (!Number.isFinite(totalArea_ha) || totalArea_ha <= 0) {
        throw new RangeError(`totalArea_ha deve ser > 0, recebido: ${totalArea_ha}`);
    }
    const PD_patches_per_100ha = (numPatches / totalArea_ha) * 100;
    return { PD_patches_per_100ha };
}

/**
 * Calcula Mean Patch Size (MPS) - tamanho médio de cada fragmento.
 * MPS baixo indica paisagem muito fragmentada.
 *
 * MPS = A / NP   [ha]
 *
 * @param totalArea_ha - Área total da paisagem em hectares
 * @param numPatches - Número total de fragmentos (NP)
 */
export function calcMeanPatchSize(totalArea_ha: number, numPatches: number): { MPS_ha: number } {
    if (!Number.isFinite(totalArea_ha) || totalArea_ha <= 0) {
        throw new RangeError(`totalArea_ha deve ser > 0, recebido: ${totalArea_ha}`);
    }
    if (!Number.isFinite(numPatches) || numPatches <= 0) {
        throw new RangeError(`numPatches deve ser > 0, recebido: ${numPatches}`);
    }
    const MPS_ha = totalArea_ha / numPatches;
    return { MPS_ha };
}

/**
 * Calcula Edge Density (ED) - comprimento de borda por hectare.
 * Alta ED indica maior efeito de borda e fragmentação estrutural.
 *
 * ED = E / A   [m/ha]
 *
 * @param totalEdge_m - Comprimento total de bordas em metros
 * @param totalArea_ha - Área total da paisagem em hectares
 */
export function calcEdgeDensity(totalEdge_m: number, totalArea_ha: number): { ED_m_per_ha: number } {
    if (!Number.isFinite(totalEdge_m) || totalEdge_m < 0) {
        throw new RangeError(`totalEdge_m deve ser >= 0, recebido: ${totalEdge_m}`);
    }
    if (!Number.isFinite(totalArea_ha) || totalArea_ha <= 0) {
        throw new RangeError(`totalArea_ha deve ser > 0, recebido: ${totalArea_ha}`);
    }
    const ED_m_per_ha = totalEdge_m / totalArea_ha;
    return { ED_m_per_ha };
}

/**
 * Calcula Landscape Shape Index (LSI) - compara borda observada com borda
 * mínima possível para a mesma área (forma circular).
 * LSI = 1 → paisagem compacta; LSI ↑ → maior irregularidade/fragmentação.
 *
 * LSI = E / (2 × sqrt(π × A_m²))
 *   onde A_m² = totalArea_ha × 10000
 *
 * @param totalEdge_m - Comprimento total de bordas em metros
 * @param totalArea_ha - Área total da paisagem em hectares
 */
export function calcLandscapeShapeIndex(totalEdge_m: number, totalArea_ha: number): { LSI: number } {
    if (!Number.isFinite(totalEdge_m) || totalEdge_m < 0) {
        throw new RangeError(`totalEdge_m deve ser >= 0, recebido: ${totalEdge_m}`);
    }
    if (!Number.isFinite(totalArea_ha) || totalArea_ha <= 0) {
        throw new RangeError(`totalArea_ha deve ser > 0, recebido: ${totalArea_ha}`);
    }
    const area_m2 = totalArea_ha * 10_000;
    const minPerimeter = 2 * Math.sqrt(Math.PI * area_m2);
    const LSI = totalEdge_m / minPerimeter;
    return { LSI };
}

/**
 * Classifica o nível de fragmentação da paisagem com base em PD e ED.
 *
 * Faixas calibradas para paisagens tropicais (Atlântico/Amazônia):
 *   intact              : PD < 1   e ED < 50
 *   low                 : PD < 5   e ED < 150
 *   moderate            : PD < 15  e ED < 400
 *   high                : PD < 50  e ED < 1000
 *   severely_fragmented : acima dos limites acima
 *
 * @param PD - Patch Density (patches/100ha)
 * @param ED - Edge Density (m/ha)
 */
export function classifyFragmentationLevel(
    PD: number,
    ED: number,
): 'intact' | 'low' | 'moderate' | 'high' | 'severely_fragmented' {
    if (!Number.isFinite(PD) || PD < 0) {
        throw new TypeError(`PD inválido: ${PD}`);
    }
    if (!Number.isFinite(ED) || ED < 0) {
        throw new TypeError(`ED inválido: ${ED}`);
    }
    if (PD < 1 && ED < 50) return 'intact';
    if (PD < 5 && ED < 150) return 'low';
    if (PD < 15 && ED < 400) return 'moderate';
    if (PD < 50 && ED < 1000) return 'high';
    return 'severely_fragmented';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const habitatFragmentationIndexMeta = {
    name: 'habitatFragmentationIndex',
    description: 'habitatFragmentationIndex',
    category: 'analytics',
    familyTags: ['environmental'],
    provenance: {
        generatedBy: 'claude',
        version: 'v0.1',
        validatedByHuman: false,
        disclaimerAcknowledged: true,
        specRef: 'SPEC_SCIENTIFIC_MODULES_PROGRAM.md',
    },
    // TODO: populate inputSchema/outputSchema when connector is built
    inputSchema: { type: 'object', properties: {}, required: [] },
    outputSchema: { type: 'object', properties: {}, required: [] },
};
