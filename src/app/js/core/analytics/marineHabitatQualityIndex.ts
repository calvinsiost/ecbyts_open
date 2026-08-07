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
 * @module marineHabitatQualityIndex
 * @description Índice de saúde de recifes de coral baseado em ReefBase, GCRMN (2020)
 *   e Reef Check (2022). Implementação independente.
 *
 * Referências acadêmicas:
 *   - GCRMN (2020) "Status of Coral Reefs of the World: 2020." Global Coral Reef
 *     Monitoring Network. Australian Institute of Marine Science, Townsville.
 *     ISBN:978-0-6489622-0-2
 *   - Reef Check Foundation (2022) "Reef Check Scientific Methodology."
 *     https://www.reefcheck.org/tropical-program/tropical-methodology/
 *   - Hughes, T.P. et al. (2017) "Global warming and recurrent mass bleaching of corals."
 *     Nature 543:373–377. DOI:10.1038/nature21707
 *   - Bellwood, D.R. et al. (2004) "Confronting the coral reef crisis." Nature 429:827–833.
 *     DOI:10.1038/nature02691
 *   - McClanahan, T.R. et al. (2012) "Critical thresholds and tangible targets for
 *     ecosystem-based management of coral reef fisheries." Proc. Natl. Acad. Sci.
 *     109:17230–17233. DOI:10.1073/pnas.1120829109
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

type ReefHealthLabel = 'critical' | 'poor' | 'fair' | 'good' | 'excellent';

// ---------------------------------------------------------------------------
// Limiares de saúde de recife - GCRMN (2020) Tabela 1 + McClanahan et al. (2012)
// ---------------------------------------------------------------------------
const REEF_HEALTH_CLASSES: Array<{ max: number; label: ReefHealthLabel }> = [
    { max: 20, label: 'critical' },
    { max: 40, label: 'poor' },
    { max: 60, label: 'fair' },
    { max: 80, label: 'good' },
    { max: Infinity, label: 'excellent' },
];

// Peso de cada componente no score final
const COMPONENT_WEIGHTS = {
    coralCover: 0.4, // cobertura de coral vivo (maior peso — proxy de saúde do recife)
    fishBiomass: 0.3, // biomassa de peixes-alvo
    invertebrate: 0.2, // invertebrados indicadores (ouriços, lagosta, pepino)
    bleaching: 0.1, // penalidade por branqueamento (impacto negativo)
};

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/**
 * Garante que um valor numérico está em [0, 100].
 * @param name
 * @param value
 */
function assertPct(name: string, value: number): void {
    if (typeof value !== 'number' || !isFinite(value) || value < 0 || value > 100) {
        throw new RangeError(`${name} must be a finite number between 0 and 100`);
    }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Calcula o índice de cobertura de coral (0-100) a partir das coberturas
 * percentuais de coral vivo, macroalgas e coral morto.
 *
 * Score = max(0, liveCoralCover × 2 - macroalgaeCover × 1.5 - deadCoral × 0.5)
 * limitado a [0, 100].
 *
 * Ponderação baseada em: GCRMN (2020) §3.2 - Live coral cover é o indicador primário;
 * macroalgas indicam regime alterado (Hughes et al. 2017); coral morto recente
 * indica evento de branqueamento recente.
 *
 * @param liveCoralCover_pct - Cobertura de coral vivo (%, 0-100)
 * @param macroalgaeCover_pct - Cobertura de macroalgas (%, 0-100)
 * @param deadCoral_pct - Cobertura de coral morto (%, 0-100)
 * @returns Score de cobertura (0-100)
 */
export function calcCoralCoverIndex(
    liveCoralCover_pct: number,
    macroalgaeCover_pct: number,
    deadCoral_pct: number,
): { coralCoverIndex: number } {
    assertPct('liveCoralCover_pct', liveCoralCover_pct);
    assertPct('macroalgaeCover_pct', macroalgaeCover_pct);
    assertPct('deadCoral_pct', deadCoral_pct);

    const raw = liveCoralCover_pct * 2 - macroalgaeCover_pct * 1.5 - deadCoral_pct * 0.5;
    const coralCoverIndex = Math.min(100, Math.max(0, raw));
    return { coralCoverIndex };
}

/**
 * Calcula o índice de biomassa de peixes-alvo relativo a um baseline (não-pesca).
 *
 * Índice = min(1, targetedFish_kg_ha / baseline_kg_ha)
 *
 * Baseline recomendado: ~1000 kg/ha para recifes pristinos (McClanahan 2012).
 *
 * Referência: McClanahan et al. (2012) Proc. Natl. Acad. Sci. 109:17230.
 *
 * @param targetedFish_kg_ha - Biomassa de peixes-alvo observada (kg/ha, ≥ 0)
 * @param baseline_kg_ha     - Biomassa de referência sem pesca (kg/ha, > 0)
 * @returns Índice relativo (0 a 1)
 */
export function calcFishBiomassIndex(
    targetedFish_kg_ha: number,
    baseline_kg_ha: number,
): { fishBiomassIndex: number } {
    if (typeof targetedFish_kg_ha !== 'number' || !isFinite(targetedFish_kg_ha) || targetedFish_kg_ha < 0) {
        throw new RangeError('targetedFish_kg_ha must be a non-negative finite number');
    }
    if (typeof baseline_kg_ha !== 'number' || !isFinite(baseline_kg_ha) || baseline_kg_ha <= 0) {
        throw new RangeError('baseline_kg_ha must be a positive finite number');
    }

    const fishBiomassIndex = Math.min(1, targetedFish_kg_ha / baseline_kg_ha);
    return { fishBiomassIndex };
}

/**
 * Calcula o score total de saúde do recife (0-100) combinando quatro componentes.
 *
 * Score = Σ(componentScore_i × weight_i)
 *
 * O componente de branqueamento é tratado como penalidade:
 *   bleachingPenalty = bleaching_pct/100 × 100 × weight_bleaching
 *   (bleaching alto reduz o score)
 *
 * Pesos: coralCover=40%, fishBiomass=30%, invertebrate=20%, bleaching=-10%
 *
 * Referência: Reef Check (2022) §5; GCRMN (2020) Appendix C.
 *
 * @param coralCover    - Score de cobertura de coral (0-100) de calcCoralCoverIndex
 * @param fishBiomass   - Índice de biomassa de peixes (0-1) de calcFishBiomassIndex
 * @param invertebrate  - Score de invertebrados bentônicos (0-100)
 * @param bleaching     - Percentagem de branqueamento ativo (0-100)
 * @returns
 */
export function calcReefHealthScore(
    coralCover: number,
    fishBiomass: number,
    invertebrate: number,
    bleaching: number,
): { reefHealthScore: number; components: object } {
    if (typeof coralCover !== 'number' || !isFinite(coralCover) || coralCover < 0 || coralCover > 100) {
        throw new RangeError('coralCover must be between 0 and 100');
    }
    if (typeof fishBiomass !== 'number' || !isFinite(fishBiomass) || fishBiomass < 0 || fishBiomass > 1) {
        throw new RangeError('fishBiomass must be between 0 and 1');
    }
    assertPct('invertebrate', invertebrate);
    assertPct('bleaching', bleaching);

    const w = COMPONENT_WEIGHTS;
    const fishScore = fishBiomass * 100; // normalizar para 0-100
    const bleachingPenalty = bleaching; // já em 0-100; age como penalidade

    const reefHealthScore = Math.min(
        100,
        Math.max(
            0,
            coralCover * w.coralCover +
                fishScore * w.fishBiomass +
                invertebrate * w.invertebrate -
                bleachingPenalty * w.bleaching,
        ),
    );

    return {
        reefHealthScore,
        components: {
            coralCover_weighted: coralCover * w.coralCover,
            fishBiomass_weighted: fishScore * w.fishBiomass,
            invertebrate_weighted: invertebrate * w.invertebrate,
            bleaching_penalty: bleachingPenalty * w.bleaching,
        },
    };
}

/**
 * Classifica a saúde do recife com base no score total.
 *
 * Classes (score 0-100):
 *   ≤ 20 → 'critical'
 *   ≤ 40 → 'poor'
 *   ≤ 60 → 'fair'
 *   ≤ 80 → 'good'
 *   > 80 → 'excellent'
 *
 * Referência: GCRMN (2020) Tabela 1 - Global coral reef status categories.
 *
 * @param score - Score de saúde do recife (0-100)
 * @returns
 */
export function classifyReefHealth(score: number): ReefHealthLabel {
    if (typeof score !== 'number' || !isFinite(score) || score < 0 || score > 100) {
        throw new RangeError('score must be between 0 and 100');
    }

    for (const { max, label } of REEF_HEALTH_CLASSES) {
        if (score <= max) return label;
    }
    return 'excellent'; // fallback
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const marineHabitatQualityIndexMeta: AnalyticsModuleMeta = {
    name: 'marineHabitatQualityIndex',
    description: 'marineHabitatQualityIndex',
    category: 'analytics',
    familyTags: ['coastal'],
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
