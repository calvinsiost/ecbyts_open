// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   SAO FILTERING PURE (Module C extraction)
   ================================================================

   3 helpers de filtragem extraídos de core/sao/index.ts. Pure-logic
   sobre parameters array; recebem state como deps injetáveis. Testáveis
   sem subir CONFIG/persistência.

   Conceitos SAO (Standard Analytical Operations):
     - matrices: agrupamentos de parâmetros por domínio (groundwater, soil, etc).
     - tiers: hierarquia cumulativa (essential ⊂ recommended ⊂ specialized).
     - scenarios: presets de matrices ativas.
   ================================================================ */

type AnyRecord = Record<string, any>;

/**
 * Filtra parameters globais pelo scenario+matrices+tier ativos. Legacy
 * parameters (sem `sao` metadata) sempre passam (backward compat).
 *
 * Quando nenhum scenario E nenhuma matriz ativa: retorna parameters
 * intactos (modo "no filtering" do SAO desligado).
 *
 * @param parameters — array CONFIG.PARAMETERS-like
 * @param activeScenario — id (string) ou null
 * @param activeMatrices — Set<string> de matrix IDs ativas
 * @param activeTier — tier corrente (key em tierRank)
 * @param tierRank — mapa {tier: rank number}; comparação rank<=rank
 */
export function filterActiveParameters(
    parameters: any[],
    activeScenario: string | null,
    activeMatrices: ReadonlySet<string>,
    activeTier: string,
    tierRank: Readonly<Record<string, number>>,
): any[] {
    if (!Array.isArray(parameters)) return [];
    // No scenario active AND no matrices → return everything (backward compat)
    if (!activeScenario && activeMatrices.size === 0) return parameters;
    const activeTierRank = tierRank[activeTier] ?? 0;
    return parameters.filter((p: AnyRecord) => {
        if (!p?.sao) return true; // legacy passes
        if (!activeMatrices.has(p.sao.matrix)) return false;
        const paramTierRank = tierRank[p.sao.tier] ?? 0;
        return paramTierRank <= activeTierRank;
    });
}

/**
 * Filtra parameters por matrixId específica (independente do scenario
 * corrente) + tier cap. Útil para matrix browser panel.
 *
 * @param parameters — array global
 * @param matrixId — matriz a inspecionar
 * @param tier — tier máximo a incluir (default 'specialized')
 * @param tierRank — mapa {tier: rank}; default fallback rank=2 (specialized)
 */
export function filterMatrixParameters(
    parameters: any[],
    matrixId: string,
    tier: string = 'specialized',
    tierRank: Readonly<Record<string, number>> = {},
): any[] {
    if (!Array.isArray(parameters)) return [];
    const maxRank = tierRank[tier] ?? 2;
    return parameters.filter((p: AnyRecord) => {
        if (!p?.sao || p.sao.matrix !== matrixId) return false;
        const paramTier = p.sao.tier;
        return (tierRank[paramTier] ?? 0) <= maxRank;
    });
}

/**
 * Conta parameters por matrix×tier para UI badges. Cada matrix vira
 * { essential, recommended, specialized, total }.
 *
 * Inicializa TODAS as matrices em allMatrixIds com counts=0 (para
 * dashboard mostrar matrices vazias também — invariante UI).
 *
 * Parameters sem `sao.matrix` ou matrix desconhecida são ignorados.
 */
export function countParametersByMatrixTier(
    parameters: any[],
    allMatrixIds: ReadonlyArray<string>,
): Record<string, { essential: number; recommended: number; specialized: number; total: number }> {
    const counts: Record<string, { essential: number; recommended: number; specialized: number; total: number }> = {};
    for (const matrixId of allMatrixIds) {
        counts[matrixId] = { essential: 0, recommended: 0, specialized: 0, total: 0 };
    }
    if (!Array.isArray(parameters)) return counts;
    for (const p of parameters) {
        const m = p?.sao?.matrix;
        if (!m || !counts[m]) continue;
        const tier = p.sao.tier as 'essential' | 'recommended' | 'specialized';
        if (tier === 'essential' || tier === 'recommended' || tier === 'specialized') {
            counts[m][tier]++;
            counts[m].total++;
        }
    }
    return counts;
}
