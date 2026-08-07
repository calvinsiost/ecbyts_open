// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   SEQUENCER CLUSTER PURE (Module C extraction — refactor-opportunities pick)
   ================================================================

   Helpers pure-logic extraídos de core/sequencer/manager.ts.
   Determinísticos, sem deps de window/state interno.

   - mapLegacyClusterKeyframes: remap de itemId em keyframes por legacy map
     (recebido como dep injetada — antes lia _getClusterLegacyIdMap interno).
   - buildClusterCarryOverMap: jaccard-like greedy assignment entre clusters
     anteriores e novos com base em sobreposição máxima de elementIds.
     Útil para preservar referências keyframe após rebuild de clusters.

   Pattern Module C campaign (commits 22287c10..5b071278).
   ================================================================ */

type AnyRecord = Record<string, any>;

/**
 * Remap de itemId em cada keyframe usando legacy map (Map<oldId,newId>).
 * Pure: retorna novo array; não muta input. Keyframes sem entrada no map
 * (ou que mapeiam para si mesmo) são preservados intactos.
 *
 * @param keyframes Array de keyframes (cada um com itemId).
 * @param legacyMap Map de oldId → newId.
 * @returns Array novo de keyframes com itemIds remapeados.
 */
export function mapLegacyClusterKeyframes(keyframes: any, legacyMap: Map<string, string> | null | undefined): any[] {
    if (!Array.isArray(keyframes)) return keyframes;
    if (!legacyMap || legacyMap.size === 0) return keyframes;
    return keyframes.map((kf: AnyRecord) => {
        if (!kf || typeof kf !== 'object') return kf;
        const itemId = typeof kf.itemId === 'string' ? kf.itemId : '';
        const mappedId = itemId ? legacyMap.get(itemId) : undefined;
        if (!mappedId || mappedId === itemId) return kf;
        return { ...kf, itemId: mappedId };
    });
}

/**
 * Constrói map de carry-over (Map<previousClusterId, nextClusterId>) baseado
 * em sobreposição máxima de elementIds. Greedy: para cada previousCluster,
 * escolhe o nextCluster com maior overlap > 0. Sem matching duplo: se 2
 * previous casam com mesmo next, ambos apontam para o mesmo (mantém
 * comportamento legado).
 *
 * Retorna Map vazio se inputs inválidos / vazios / sem overlap.
 *
 * @param previousClusters Clusters anteriores (cada um com id + elementIds[]).
 * @param nextClusters Clusters novos (mesmo shape).
 * @returns Map de previousId → nextId quando previousId !== nextId.
 */
interface ClusterSet {
    id: string;
    set: Set<string>;
}

function computeBestMatch(prevIds: string[], nextSets: ClusterSet[]): { id: string | null; overlap: number } {
    let bestId: string | null = null;
    let bestOverlap = 0;
    for (const next of nextSets) {
        let overlap = 0;
        for (const id of prevIds) {
            if (next.set.has(id)) overlap++;
        }
        if (overlap > bestOverlap) {
            bestOverlap = overlap;
            bestId = next.id;
        }
    }
    return { id: bestId, overlap: bestOverlap };
}

function shouldCarryOver(bestId: string | null, bestOverlap: number, prevId: string): bestId is string {
    return Boolean(bestId && bestOverlap > 0 && bestId !== prevId);
}

export function buildClusterCarryOverMap(previousClusters: any, nextClusters: any): Map<string, string> {
    const map = new Map<string, string>();
    if (!Array.isArray(previousClusters) || !Array.isArray(nextClusters)) return map;
    if (previousClusters.length === 0 || nextClusters.length === 0) return map;
    const nextSets: ClusterSet[] = nextClusters
        .map((cluster: AnyRecord) => ({
            id: typeof cluster?.id === 'string' ? cluster.id : '',
            set: new Set<string>(Array.isArray(cluster?.elementIds) ? cluster.elementIds : []),
        }))
        .filter((cs: ClusterSet) => cs.id !== '');
    for (const prev of previousClusters) {
        const prevIds = Array.isArray(prev?.elementIds) ? (prev.elementIds as string[]) : [];
        const prevId = typeof prev?.id === 'string' ? prev.id : '';
        if (prevIds.length === 0 || !prevId) continue;
        const { id: bestId, overlap: bestOverlap } = computeBestMatch(prevIds, nextSets);
        if (shouldCarryOver(bestId, bestOverlap, prevId)) {
            map.set(prevId, bestId);
        }
    }
    return map;
}
