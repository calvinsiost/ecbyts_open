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
 * @module industrialProcessWaterQuality
 * @description Avaliação de risco de reúso de água industrial - cálculo de DALY,
 * redução logarítmica, verificação de diretrizes WHO e classificação de categoria
 * de reúso (WHO 2006 + CONAMA 54/2005).
 *
 * Referências:
 * - WHO (2006). WHO Guidelines for the Safe Use of Wastewater, Excreta and
 *   Greywater. Volume 2: Wastewater Use in Agriculture.
 *   ISBN 92-4-154683-2. https://www.who.int/publications/i/item/9241546832
 * - CONAMA Resolução n° 54/2005 - Reúso Direto Não Potável de Água.
 *   Brasil, Conselho Nacional do Meio Ambiente.
 * - Haas, C.N., Rose, J.B., & Gerba, C.P. (1999). Quantitative Microbial Risk
 *   Assessment. John Wiley & Sons. ISBN 978-0-471-18397-6.
 * - Prüss-Ustün, A. et al. (2016). Burden of disease from inadequate water,
 *   sanitation and hygiene. International Journal of Hygiene and Environmental Health,
 *   219(6), 599–605. DOI:10.1016/j.ijheh.2016.05.004
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
 * Diretrizes WHO para patógenos em reúso agrícola - concentração máxima por categoria.
 * Fonte: WHO (2006) Vol. 2, Table A5.1 (adaptado para unidades SI).
 *
 * Categorias:
 *   A - irrigação de alimentos consumidos crus (E. coli ≤1000 CFU/100mL; helmintos ≤1 ovo/L)
 *   B - irrigação de pastagem / culturas processadas (E. coli ≤100000 CFU/100mL; helmintos ≤1 ovo/L)
 *   C - localizados/não irrigação por aspersão (sem limite numérico WHO; nível de tratamento primário)
 *   D - sem restrição para árvores / plantações industriais (tratamento mínimo)
 */
const WHO_GUIDELINES: Record<string, { A: number; B: number; C: number; D: number; unit: string }> = {
    ecoli: { A: 1000, B: 100000, C: Infinity, D: Infinity, unit: 'CFU/100mL' },
    helminths: { A: 1, B: 1, C: Infinity, D: Infinity, unit: 'ova/L' },
    turbidity: { A: 2, B: 10, C: Infinity, D: Infinity, unit: 'NTU' },
};

const REUSE_CATEGORY_DESCRIPTIONS: Record<string, string> = {
    A: 'Restricted irrigation — raw-eaten food crops (highest treatment)',
    B: 'Restricted irrigation — processed crops, pasture, fodder',
    C: 'Localized drip irrigation — trees, vines (primary treatment min.)',
    D: 'Industrial trees / energy crops (minimal treatment)',
};

/**
 * Calcula DALYs (Disability-Adjusted Life Years) por patógeno via modelo dose-resposta.
 * DALY = P_inf × DALY_burden_per_case × exposureFreq_per_year
 * onde P_inf = 1 − exp(−r × dose)   (modelo exponencial, Haas 1983)
 *
 * @param exposureConc     - Concentração de patógeno na água de reúso [org/L ou CFU/100mL]
 * @param inhalationRate   - Volume ingerido/inalado por evento [L/evento]
 * @param doseResponse_r   - Parâmetro r da curva dose-resposta (modelo exponencial) [adim.]
 * @param exposureFreq     - Frequência de exposição [eventos/ano]
 * @param dalyPerCase      - Carga de doença por caso [DALY/caso]; fonte WHO GBD
 * @returns
 *
 * @example
 * // Rotavírus agrícola (Haas et al. 1999, r=0.09109, DALY=1.4e-3)
 * calcDALYfromPathogen(1, 0.002, 0.09109, 365, 1.4e-3)
 */
export function calcDALYfromPathogen(
    exposureConc: number,
    inhalationRate: number,
    doseResponse_r: number,
    exposureFreq: number,
    dalyPerCase: number,
): { daly_per_year: number; P_infection: number; dose: number } {
    const args = [exposureConc, inhalationRate, doseResponse_r, exposureFreq, dalyPerCase];
    if (args.some((v) => typeof v !== 'number')) {
        throw new TypeError('Todos os parâmetros devem ser números.');
    }
    if (exposureConc < 0) throw new RangeError('exposureConc deve ser >= 0.');
    if (inhalationRate <= 0) throw new RangeError('inhalationRate deve ser > 0.');
    if (doseResponse_r <= 0 || doseResponse_r > 1) {
        throw new RangeError('doseResponse_r deve estar entre 0 (excl.) e 1 (incl.).');
    }
    if (exposureFreq < 0) throw new RangeError('exposureFreq deve ser >= 0.');
    if (dalyPerCase < 0) throw new RangeError('dalyPerCase deve ser >= 0.');

    const dose = exposureConc * inhalationRate;
    const P_infection = 1 - Math.exp(-doseResponse_r * dose);
    const daly_per_year = P_infection * dalyPerCase * exposureFreq;

    return {
        daly_per_year: parseFloat(daly_per_year.toExponential(4)),
        P_infection: parseFloat(P_infection.toFixed(8)),
        dose: parseFloat(dose.toFixed(8)),
    };
}

/**
 * Calcula a redução logarítmica (log10) entre afluente e efluente de tratamento.
 * LR = log10(C_influent / C_effluent)
 *
 * @param C_influent - Concentração de entrada [org/L ou CFU/100mL]
 * @param C_effluent - Concentração de saída [mesmas unidades]
 * @returns
 *
 * @example
 * calcLogReduction(1e6, 10) // { logReduction: 5, removalPercent: 99.999, concentrationRatio: 100000 }
 */
export function calcLogReduction(
    C_influent: number,
    C_effluent: number,
): { logReduction: number; removalPercent: number; concentrationRatio: number } {
    if (typeof C_influent !== 'number' || typeof C_effluent !== 'number') {
        throw new TypeError('C_influent e C_effluent devem ser números.');
    }
    if (C_influent <= 0) throw new RangeError('C_influent deve ser > 0.');
    if (C_effluent <= 0) throw new RangeError('C_effluent deve ser > 0.');
    if (C_effluent > C_influent) {
        throw new RangeError('C_effluent não pode ser maior que C_influent (sem crescimento no tratamento).');
    }

    const concentrationRatio = C_influent / C_effluent;
    const logReduction = Math.log10(concentrationRatio);
    const removalPercent = ((C_influent - C_effluent) / C_influent) * 100;

    return {
        logReduction: parseFloat(logReduction.toFixed(4)),
        removalPercent: parseFloat(removalPercent.toFixed(4)),
        concentrationRatio: parseFloat(concentrationRatio.toFixed(2)),
    };
}

/**
 * Verifica conformidade de um patógeno/parâmetro com diretriz WHO para reúso.
 *
 * @param pathogen - Parâmetro de qualidade
 * @param concentration                      - Concentração medida [unidade do patógeno]
 * @param useCategory              - Categoria WHO de reúso
 * @returns
 *
 * @example
 * checkWHOReuseGuideline('ecoli', 500, 'A') // { compliant: true, guideline_value: 1000, margin: 500 }
 */
export function checkWHOReuseGuideline(
    pathogen: 'ecoli' | 'helminths' | 'turbidity',
    concentration: number,
    useCategory: 'A' | 'B' | 'C' | 'D',
): { compliant: boolean; guideline_value: number; margin: number; unit: string } {
    const validPathogens = Object.keys(WHO_GUIDELINES);
    if (!validPathogens.includes(pathogen)) {
        throw new RangeError(`pathogen deve ser um de: ${validPathogens.join(', ')}.`);
    }
    const validCategories = ['A', 'B', 'C', 'D'];
    if (!validCategories.includes(useCategory)) {
        throw new RangeError(`useCategory deve ser 'A', 'B', 'C' ou 'D'.`);
    }
    if (typeof concentration !== 'number' || concentration < 0) {
        throw new RangeError('concentration deve ser um número >= 0.');
    }

    const guidelineEntry = WHO_GUIDELINES[pathogen]!;
    const guideline_value = guidelineEntry[useCategory];
    const compliant = concentration <= guideline_value;
    const margin = guideline_value === Infinity ? Infinity : guideline_value - concentration;

    return {
        compliant,
        guideline_value,
        margin: isFinite(margin) ? parseFloat(margin.toFixed(4)) : Infinity,
        unit: guidelineEntry.unit,
    };
}

/**
 * Classifica a categoria de reúso WHO/CONAMA com base no propósito do uso.
 *
 * @param purpose
 * @returns
 *
 * Mapeamento (WHO 2006 Vol. 2, Tabela 1 + CONAMA 54/2005 Art. 3°):
 *   food_crops_raw        → A
 *   food_crops_processed  → B
 *   pasture               → B
 *   drip_trees            → C
 *   industrial_trees      → D
 *   urban_irrigation      → B (parques, jardins públicos - CONAMA 54 inciso IV)
 *   construction          → C (compactação de solo, supressão de poeira)
 */
export function classifyReuseCategory(
    purpose:
        | 'food_crops_raw'
        | 'food_crops_processed'
        | 'pasture'
        | 'drip_trees'
        | 'industrial_trees'
        | 'urban_irrigation'
        | 'construction',
): { category: 'A' | 'B' | 'C' | 'D'; description: string; conama54: string } {
    const mapping: Record<string, { category: 'A' | 'B' | 'C' | 'D'; conama54: string }> = {
        food_crops_raw: { category: 'A', conama54: 'Art. 3° inciso I' },
        food_crops_processed: { category: 'B', conama54: 'Art. 3° inciso II' },
        pasture: { category: 'B', conama54: 'Art. 3° inciso III' },
        drip_trees: { category: 'C', conama54: 'Art. 3° inciso V' },
        industrial_trees: { category: 'D', conama54: 'Art. 3° inciso VI' },
        urban_irrigation: { category: 'B', conama54: 'Art. 3° inciso IV' },
        construction: { category: 'C', conama54: 'Art. 3° inciso VII' },
    };

    const entry = mapping[purpose];
    if (!entry) {
        const valid = Object.keys(mapping).join(', ');
        throw new RangeError(`purpose desconhecido. Válidos: ${valid}`);
    }

    return {
        category: entry.category,
        description: REUSE_CATEGORY_DESCRIPTIONS[entry.category]!,
        conama54: entry.conama54,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialProcessWaterQualityMeta: AnalyticsModuleMeta = {
    name: 'industrialProcessWaterQuality',
    description: 'industrialProcessWaterQuality',
    category: 'analytics',
    familyTags: ['water', 'industrial'],
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
