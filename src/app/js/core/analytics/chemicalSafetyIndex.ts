// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Chemical Safety Index - GHS hazard scoring, NFPA 704, storage compatibility, risk tier
// Índice de segurança química - score de hazard GHS, compatibilidade de armazenamento e NFPA 704

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

// Pontuação base dos pictogramas GHS (UN GHS 9th Ed. 2021)
const GHS_SCORES: Record<string, number> = {
    GHS01: 5, // Explosivo
    GHS02: 4, // Inflamável
    GHS03: 3, // Oxidante
    GHS04: 1, // Gás comprimido
    GHS05: 3, // Corrosivo
    GHS06: 5, // Tóxico agudo (caveira)
    GHS07: 2, // Irritante / Nocivo
    GHS08: 3, // Perigo à saúde a longo prazo (silhueta)
    GHS09: 2, // Perigoso para o ambiente
};

/**
 * Compute GHS Hazard Score from pictogram codes, signal word, and hazard categories.
 * Calcula o Score de Perigo GHS a partir dos pictogramas, palavra de advertência e categorias de perigo.
 *
 * @param pictograms - Array of GHS pictogram codes (e.g., ['GHS01', 'GHS06'])
 * @param signal_word - GHS signal word
 * @param hazard_categories - Array of hazard category codes (informational, not scored separately)
 *
 * Refs: UN GHS 9th Edition (2021); ABNT NBR 14725 (2022)
 */
export function computeGHSHazardScore(
    pictograms: string[],
    signal_word: 'Danger' | 'Warning' | 'none',
    hazard_categories: string[],
): { ghs_score: number; hazard_level: 'low' | 'moderate' | 'high' | 'severe' } {
    if (!Array.isArray(pictograms)) throw new TypeError('pictograms must be an array');
    if (!Array.isArray(hazard_categories)) throw new TypeError('hazard_categories must be an array');
    if (!['Danger', 'Warning', 'none'].includes(signal_word)) {
        throw new TypeError('signal_word must be "Danger", "Warning", or "none"');
    }

    const valid_ghs = Object.keys(GHS_SCORES);
    for (const pic of pictograms) {
        if (!valid_ghs.includes(pic)) throw new TypeError(`Unknown GHS pictogram: ${pic}`);
    }

    // Soma dos scores dos pictogramas (cada pictograma conta uma vez)
    const unique_pics = [...new Set(pictograms)];
    let score = unique_pics.reduce((sum, pic) => sum + (GHS_SCORES[pic] || 1), 0);

    // Palavra de advertência: Danger +2, Warning +1
    if (signal_word === 'Danger') score += 2;
    else if (signal_word === 'Warning') score += 1;

    // Classificação: severe > 8, high 6-8, moderate 3-5, low <= 2
    let hazard_level: 'low' | 'moderate' | 'high' | 'severe';
    if (score > 8) hazard_level = 'severe';
    else if (score >= 6) hazard_level = 'high';
    else if (score >= 3) hazard_level = 'moderate';
    else hazard_level = 'low';

    return { ghs_score: score, hazard_level };
}

/**
 * Compute NFPA 704 diamond overall hazard rating.
 * Calcula a classificação geral de perigo do diamante NFPA 704.
 *
 * @param health - Health hazard 0–4
 * @param flammability - Flammability hazard 0–4
 * @param reactivity - Reactivity hazard 0–4
 * @param special - Special hazard code: 'W', 'OX', 'SA', or null
 *
 * Refs: NFPA 704 (2022 edition); MTE NR-20
 */
export function computeNFPA704Scores(
    health: number,
    flammability: number,
    reactivity: number,
    special: string | null,
): { overall_hazard: number; nfpa_rating: '0' | '1' | '2' | '3' | '4'; description: string } {
    if ([health, flammability, reactivity].some((v) => typeof v !== 'number')) {
        throw new TypeError('health, flammability, and reactivity must be numbers');
    }
    if ([health, flammability, reactivity].some((v) => v < 0 || v > 4 || !Number.isInteger(v))) {
        throw new RangeError('health, flammability, and reactivity must be integers in [0, 4]');
    }
    const VALID_SPECIAL = [null, undefined, 'W', 'OX', 'SA'];
    if (!VALID_SPECIAL.includes(special)) throw new TypeError('special must be "W", "OX", "SA", or null');

    const overall_hazard = Math.max(health, flammability, reactivity);
    const nfpa_rating = String(overall_hazard) as '0' | '1' | '2' | '3' | '4';

    const DESCRIPTIONS: Record<number, string> = {
        0: 'Minimal hazard',
        1: 'Slight hazard',
        2: 'Moderate hazard',
        3: 'Serious hazard',
        4: 'Severe hazard',
    };
    const SPECIAL_DESC: Record<string, string> = {
        W: ' | Special: Water reactive',
        OX: ' | Special: Oxidizer',
        SA: ' | Special: Simple asphyxiant',
    };
    const description = DESCRIPTIONS[overall_hazard] + (special ? SPECIAL_DESC[special] || '' : '');

    return { overall_hazard, nfpa_rating, description };
}

/**
 * Assess chemical storage compatibility between two chemical classes.
 * Avalia a compatibilidade de armazenamento entre duas classes de produtos químicos.
 *
 * @param chemical_a_class
 * @param chemical_b_class
 *
 * Refs: NFPA 400 (2022); ABNT NBR 14064:2022; EPA 40 CFR Part 68
 */
export function assessStorageCompatibility(
    chemical_a_class: 'acid' | 'base' | 'oxidizer' | 'reducer' | 'flammable' | 'toxic' | 'reactive' | 'inert',
    chemical_b_class: 'acid' | 'base' | 'oxidizer' | 'reducer' | 'flammable' | 'toxic' | 'reactive' | 'inert',
): { compatible: boolean; risk: 'none' | 'segregate' | 'separate' | 'isolate'; reaction_hazard: string } {
    const VALID_CLASSES = ['acid', 'base', 'oxidizer', 'reducer', 'flammable', 'toxic', 'reactive', 'inert'];
    if (!VALID_CLASSES.includes(chemical_a_class)) throw new TypeError(`Invalid chemical_a_class: ${chemical_a_class}`);
    if (!VALID_CLASSES.includes(chemical_b_class)) throw new TypeError(`Invalid chemical_b_class: ${chemical_b_class}`);

    // Matriz de incompatibilidade simplificada baseada em NFPA 400 + NBR 14064
    // Formato: key = 'classA|classB' (ordenado alfabeticamente para lookup bidirecional)
    const makeKey = (a: string, b: string): string => [a, b].sort().join('|');

    const INCOMPATIBILITY: Record<
        string,
        { risk: 'none' | 'segregate' | 'separate' | 'isolate'; reaction_hazard: string }
    > = {
        [makeKey('acid', 'base')]: {
            risk: 'isolate',
            reaction_hazard: 'Neutralization — heat generation, spattering risk',
        },
        [makeKey('acid', 'oxidizer')]: {
            risk: 'separate',
            reaction_hazard: 'Potential release of toxic gases (Cl₂, SO₃)',
        },
        [makeKey('acid', 'reactive')]: {
            risk: 'isolate',
            reaction_hazard: 'Vigorous reaction — hydrogen gas, fire risk',
        },
        [makeKey('base', 'oxidizer')]: {
            risk: 'separate',
            reaction_hazard: 'Oxidation of base — heat, possible ignition',
        },
        [makeKey('oxidizer', 'reducer')]: {
            risk: 'isolate',
            reaction_hazard: 'Redox reaction — explosion or rapid combustion',
        },
        [makeKey('oxidizer', 'flammable')]: {
            risk: 'isolate',
            reaction_hazard: 'Fire and explosion hazard — oxidizer accelerates combustion',
        },
        [makeKey('flammable', 'reactive')]: {
            risk: 'separate',
            reaction_hazard: 'Potential ignition of flammable by reactive',
        },
        [makeKey('acid', 'flammable')]: {
            risk: 'segregate',
            reaction_hazard: 'Corrosive attack on containers — vapor release',
        },
        [makeKey('base', 'reactive')]: { risk: 'separate', reaction_hazard: 'Possible hydrolysis or violent reaction' },
        [makeKey('reducer', 'flammable')]: {
            risk: 'segregate',
            reaction_hazard: 'Similar ignition risk — reduce to single fire zone',
        },
    };

    const key = makeKey(chemical_a_class, chemical_b_class);
    if (chemical_a_class === chemical_b_class) {
        // Mesma classe: compatível, exceto oxidantes e reativos entre si
        if (chemical_a_class === 'oxidizer' || chemical_a_class === 'reactive') {
            return {
                compatible: false,
                risk: 'segregate',
                reaction_hazard: 'Same reactive class — segregate to limit incident scope',
            };
        }
        return { compatible: true, risk: 'none', reaction_hazard: 'Same chemical class — compatible storage' };
    }
    if (INCOMPATIBILITY[key]) {
        const entry = INCOMPATIBILITY[key]!;
        return { compatible: entry.risk === 'segregate', ...entry };
    }
    // Substâncias inertes ou tóxicas sem incompatibilidade conhecida
    return { compatible: true, risk: 'none', reaction_hazard: 'No known incompatibility' };
}

/**
 * Classify overall chemical risk tier and determine PPE level.
 * Classifica o nível de risco químico e determina o EPI necessário.
 *
 * @param ghs_score - GHS hazard score from computeGHSHazardScore
 * @param nfpa_overall - NFPA overall hazard from computeNFPA704Scores
 * @param quantity_kg - Quantity of chemical in kg
 * @param exposure_scenario
 *
 * Refs: EPA RMP Rule 40 CFR Part 68; NFPA 704 (2022); UN GHS 9th Ed. (2021); MTE NR-20
 */
export function classifyChemicalRisk(
    ghs_score: number,
    nfpa_overall: number,
    quantity_kg: number,
    exposure_scenario: 'storage' | 'process' | 'transport' | 'disposal',
): { risk_tier: 'T1' | 'T2' | 'T3' | 'T4'; regulatory_threshold: boolean; ppe_level: 'A' | 'B' | 'C' | 'D' } {
    if ([ghs_score, nfpa_overall, quantity_kg].some((v) => typeof v !== 'number')) {
        throw new TypeError('ghs_score, nfpa_overall, and quantity_kg must be numbers');
    }
    if (ghs_score < 0) throw new RangeError('ghs_score cannot be negative');
    if (nfpa_overall < 0 || nfpa_overall > 4 || !Number.isInteger(nfpa_overall)) {
        throw new RangeError('nfpa_overall must be an integer in [0, 4]');
    }
    if (quantity_kg < 0) throw new RangeError('quantity_kg cannot be negative');
    const VALID_SCENARIOS = ['storage', 'process', 'transport', 'disposal'];
    if (!VALID_SCENARIOS.includes(exposure_scenario)) throw new TypeError('Invalid exposure_scenario');

    // Multiplicador por cenário: processo e transporte são mais críticos
    const SCENARIO_MULT: Record<string, number> = { storage: 1.0, process: 1.3, transport: 1.2, disposal: 1.1 };
    const eff_ghs = ghs_score * SCENARIO_MULT[exposure_scenario]!;
    const eff_nfpa = nfpa_overall * SCENARIO_MULT[exposure_scenario]!;

    // T4: condições máximas de risco
    const is_T4 = ghs_score > 8 && nfpa_overall >= 3 && quantity_kg > 1000;
    // T3: alto risco
    const is_T3 = eff_ghs > 8 || (eff_nfpa >= 3 && quantity_kg > 500) || (ghs_score > 6 && quantity_kg > 1000);
    // T2: risco moderado
    const is_T2 = eff_ghs > 5 || eff_nfpa >= 2 || quantity_kg > 100;

    let risk_tier: 'T1' | 'T2' | 'T3' | 'T4';
    if (is_T4) risk_tier = 'T4';
    else if (is_T3) risk_tier = 'T3';
    else if (is_T2) risk_tier = 'T2';
    else risk_tier = 'T1';

    // Limiar regulatório EPA RMP: T3 ou T4 com qty > EPA threshold (simplificado: 500kg genérico)
    const regulatory_threshold = (risk_tier === 'T3' || risk_tier === 'T4') && quantity_kg >= 500;

    // Nível de EPI por tier: T4=A (SCBA completo), T3=B, T2=C, T1=D
    const PPE: Record<'T1' | 'T2' | 'T3' | 'T4', 'A' | 'B' | 'C' | 'D'> = { T4: 'A', T3: 'B', T2: 'C', T1: 'D' };
    const ppe_level = PPE[risk_tier];

    return { risk_tier, regulatory_threshold, ppe_level };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const chemicalSafetyIndexMeta: AnalyticsModuleMeta = {
    name: 'chemicalSafetyIndex',
    description: 'chemicalSafetyIndex',
    category: 'analytics',
    familyTags: ['chemical', 'risk'],
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
