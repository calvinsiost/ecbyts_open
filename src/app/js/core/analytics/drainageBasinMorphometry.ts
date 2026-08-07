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
 * @module drainageBasinMorphometry
 * @description Morfometria de bacia hidrografica - indices de Horton (1945) e Strahler (1964).
 * Quantifica forma, drenagem e hierarquia de redes de drenagem.
 *
 * Academic references:
 *   Horton, R.E. (1945). Erosional development of streams and their drainage basins;
 *     hydrophysical approach to quantitative morphology. GSA Bulletin 56(3):275–370.
 *   Strahler, A.N. (1964). Quantitative geomorphology of drainage basins and channel networks.
 *     In: Chow, V.T. (Ed.) Handbook of Applied Hydrology. McGraw-Hill, NY. Section 4-II.
 *   Miller, V.C. (1953). A quantitative geomorphic study of drainage basin characteristics
 *     in the Clinch Mountain area, Virginia and Tennessee. Dept. of Geology, Columbia Univ.,
 *     ONR, Tech. Rept. 3.
 */

'use strict';

interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: string;
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
    };
    inputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
}

/**
 * Determina a ordem de Strahler do topo da rede de drenagem a partir de um objeto
 * de rede hierarquica. Segmentos sem tributarios = ordem 1.
 *
 * Algoritmo:
 *   - Folhas (sem tributarios) = ordem 1
 *   - Confluencia de dois segmentos de mesma ordem n → ordem n+1
 *   - Confluencia de ordens diferentes → ordem do maior
 *
 * @param network - Objeto com chaves sendo IDs de segmentos.
 *   Cada valor: { tributaries: string[] } com IDs dos segmentos que confluem neste.
 *   Ex.: { A: { tributaries: [] }, B: { tributaries: [] }, C: { tributaries: ['A','B'] } }
 */
export function calcStreamOrder(network: unknown): { order: number; segmentOrders: Record<string, number> } {
    if (typeof network !== 'object' || network === null || Array.isArray(network)) {
        throw new TypeError('network must be a plain object');
    }
    const net = network as Record<string, { tributaries: string[] }>;
    const keys = Object.keys(net);
    if (keys.length === 0) throw new RangeError('network must have at least one segment');

    const orders: Record<string, number> = {};

    // Iteracao topologica: processar ate todos os segmentos terem ordem
    const maxIter = keys.length * keys.length + 10;
    let iter = 0;
    while (Object.keys(orders).length < keys.length) {
        if (iter++ > maxIter) throw new Error('Cycle detected in drainage network or unresolvable topology');
        for (const id of keys) {
            if (orders[id] !== undefined) continue;
            const seg = net[id]!;
            if (!Array.isArray(seg.tributaries) || seg.tributaries.length === 0) {
                orders[id] = 1;
            } else {
                const tribOrders: Array<number | undefined> = seg.tributaries.map((t: string) => orders[t]);
                if (tribOrders.some((o) => o === undefined)) continue; // wait
                const tribOrdersDefined = tribOrders as number[];
                const maxOrd = Math.max(...tribOrdersDefined);
                const countMax = tribOrdersDefined.filter((o) => o === maxOrd).length;
                orders[id] = countMax >= 2 ? maxOrd + 1 : maxOrd;
            }
        }
    }

    const maxOrder = Math.max(...Object.values(orders));
    return { order: maxOrder, segmentOrders: orders };
}

/**
 * Calcula a Razao de Bifurcacao (Rb) entre duas ordens consecutivas.
 * Rb = N_u / N_(u+1)
 *   onde N_u = numero de segmentos de ordem u e N_(u+1) = ordem u+1.
 *
 * Valores tipicos: Rb entre 3 e 5 para bacias naturais (Horton 1945).
 *
 * @param streamsN - Numero de segmentos de ordem u, must be integer >= 1
 * @param streamsN1 - Numero de segmentos de ordem u+1, must be integer >= 1
 */
export function calcBifurcationRatio(
    streamsN: number,
    streamsN1: number,
): { Rb: number; streamsN: number; streamsN1: number } {
    if (!Number.isInteger(streamsN) || streamsN < 1) {
        throw new RangeError(`streamsN must be integer >= 1, got: ${streamsN}`);
    }
    if (!Number.isInteger(streamsN1) || streamsN1 < 1) {
        throw new RangeError(`streamsN1 must be integer >= 1, got: ${streamsN1}`);
    }
    return { Rb: streamsN / streamsN1, streamsN, streamsN1 };
}

/**
 * Calcula a Densidade de Drenagem (Dd) - comprimento total de canais por area de bacia.
 * Dd (km/km²) = L_total / A
 *
 * @param totalLength_km - Comprimento total da rede de drenagem (km), must be > 0
 * @param basinArea_km2 - Area da bacia hidrografica (km²), must be > 0
 */
export function calcDrainageDensity(
    totalLength_km: number,
    basinArea_km2: number,
): { Dd: number; totalLength_km: number; basinArea_km2: number } {
    if (typeof totalLength_km !== 'number' || !isFinite(totalLength_km) || totalLength_km <= 0) {
        throw new RangeError(`totalLength_km must be > 0, got: ${totalLength_km}`);
    }
    if (typeof basinArea_km2 !== 'number' || !isFinite(basinArea_km2) || basinArea_km2 <= 0) {
        throw new RangeError(`basinArea_km2 must be > 0, got: ${basinArea_km2}`);
    }
    return { Dd: totalLength_km / basinArea_km2, totalLength_km, basinArea_km2 };
}

/**
 * Calcula o Indice de Circularidade (Rc) da bacia - Miller (1953).
 * Rc = 4π × A / P²
 *   Rc = 1.0 para bacia perfeitamente circular; < 1.0 para bacias elongadas.
 *
 * @param basinArea_km2 - Area da bacia (km²), must be > 0
 * @param perimeter_km - Perimetro da bacia (km), must be > 0
 */
export function calcCircularityRatio(
    basinArea_km2: number,
    perimeter_km: number,
): { Rc: number; basinArea_km2: number; perimeter_km: number } {
    if (typeof basinArea_km2 !== 'number' || !isFinite(basinArea_km2) || basinArea_km2 <= 0) {
        throw new RangeError(`basinArea_km2 must be > 0, got: ${basinArea_km2}`);
    }
    if (typeof perimeter_km !== 'number' || !isFinite(perimeter_km) || perimeter_km <= 0) {
        throw new RangeError(`perimeter_km must be > 0, got: ${perimeter_km}`);
    }
    const Rc = (4 * Math.PI * basinArea_km2) / (perimeter_km * perimeter_km);
    return { Rc, basinArea_km2, perimeter_km };
}

/**
 * Classifica a forma da bacia com base no indice de circularidade Rc.
 *
 * | Forma      | Rc            |
 * |------------|---------------|
 * | elongated  | Rc < 0.5      |
 * | oval       | 0.5 <= Rc < 0.75 |
 * | circular   | Rc >= 0.75    |
 *
 * @param Rc - Indice de circularidade (0 < Rc <= 1)
 */
export function classifyBasinShape(Rc: number): 'elongated' | 'oval' | 'circular' {
    if (typeof Rc !== 'number' || !isFinite(Rc) || Rc <= 0) {
        throw new RangeError(`Rc must be a positive finite number, got: ${Rc}`);
    }
    if (Rc < 0.5) return 'elongated';
    if (Rc < 0.75) return 'oval';
    return 'circular';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const drainageBasinMorphometryMeta: AnalyticsModuleMeta = {
    name: 'drainageBasinMorphometry',
    description: 'drainageBasinMorphometry',
    category: 'analytics',
    familyTags: ['stormwater'],
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
