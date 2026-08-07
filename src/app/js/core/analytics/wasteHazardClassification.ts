// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
'use strict';
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//

/**
 * Waste Hazard Classification - classificação de periculosidade de resíduos.
 *
 * Referências normativas e acadêmicas:
 *   - ABNT NBR 10004:2004 - Resíduos Sólidos - Classificação.
 *   - GHS Rev.9 (2021) - Globally Harmonized System of Classification and
 *     Labelling of Chemicals. United Nations. ISBN: 978-92-1-116988-1.
 *     https://unece.org/transport/standards/transport/dangerous-goods/ghs-rev9-2021
 *   - Le Chatelier, H. (1891). Note sur le dosage du grisou par les limites
 *     d'inflammabilité. Annales des Mines, 19(8), 388–395.
 */

interface CompositionComponent {
    flash_point_C: number;
    fraction: number;
}

interface FlashPointResult {
    flash_point_C: number;
    flammability_class: string;
}

interface ToxicityResult {
    score: number;
    GHS_class: number;
}

interface HWIResult {
    HWI: number;
    classification: 'Class_I' | 'Class_IIA' | 'Class_IIB';
}

interface DisposalRouteResult {
    route: string;
}

/**
 * Estima o ponto de fulgor de uma mistura por média ponderada de componentes.
 * Baseado na regra de Le Chatelier adaptada para misturas líquidas.
 * Retorna também a classe de inflamabilidade ABNT/GHS.
 *
 * @param {Array<{flash_point_C: number, fraction: number}>} composition
 *   Array de componentes com ponto de fulgor (°C) e fração mássica (0–1).
 *   A soma das frações deve ser 1 (tolerância ±1e-6).
 * @returns {{ flash_point_C: number, flammability_class: string }}
 * @throws {TypeError} Se composition não for array ou tiver formato inválido.
 * @throws {RangeError} Se frações não somarem a 1 ou ponto de fulgor inválido.
 */
export function computeFlashPoint(composition: CompositionComponent[]): FlashPointResult {
    if (!Array.isArray(composition) || composition.length === 0) {
        throw new TypeError('composition deve ser um array não-vazio');
    }
    let sumFractions = 0;
    for (const comp of composition) {
        if (typeof comp.flash_point_C !== 'number' || !isFinite(comp.flash_point_C)) {
            throw new TypeError('flash_point_C deve ser um número finito em cada componente');
        }
        if (typeof comp.fraction !== 'number' || !isFinite(comp.fraction) || comp.fraction < 0) {
            throw new TypeError('fraction deve ser um número finito não-negativo');
        }
        sumFractions += comp.fraction;
    }
    if (Math.abs(sumFractions - 1) > 1e-6) {
        throw new RangeError(`Soma das frações deve ser 1 (obtido: ${sumFractions.toFixed(6)})`);
    }

    // Média ponderada do ponto de fulgor pela fração mássica de cada componente
    const flash_point_C = composition.reduce((acc, c) => acc + c.flash_point_C * c.fraction, 0);

    // Classificação de inflamabilidade conforme ABNT NBR 10004 e GHS
    let flammability_class: string;
    if (flash_point_C < 23) {
        flammability_class = 'extremely_flammable'; // GHS Cat 1–2
    } else if (flash_point_C < 60) {
        flammability_class = 'flammable'; // GHS Cat 3
    } else if (flash_point_C < 93) {
        flammability_class = 'combustible'; // GHS Cat 4
    } else {
        flammability_class = 'non_flammable'; // acima de 93°C
    }

    return { flash_point_C, flammability_class };
}

/**
 * Calcula o escore de toxicidade e a categoria GHS com base no LD50.
 * Categorias GHS Rev.9 (2021) para LD50 oral ou dérmico em mg/kg peso corporal.
 *
 * @param {number} LD50_mg_kg - LD50 em mg/kg (peso corporal). Deve ser > 0.
 * @param {'oral'|'dermal'|'inhalation'} route - Via de exposição.
 * @returns {{ score: number, GHS_class: number }} Score numérico e categoria GHS (1–5).
 * @throws {TypeError} Se LD50_mg_kg não for número finito ou route for inválido.
 * @throws {RangeError} Se LD50_mg_kg ≤ 0.
 */
export function computeToxicityHazardScore(LD50_mg_kg: number, route: 'oral' | 'dermal' | 'inhalation'): ToxicityResult {
    if (typeof LD50_mg_kg !== 'number' || !isFinite(LD50_mg_kg)) {
        throw new TypeError('LD50_mg_kg deve ser um número finito');
    }
    if (LD50_mg_kg <= 0) throw new RangeError('LD50_mg_kg deve ser positivo');

    const validRoutes = ['oral', 'dermal', 'inhalation'];
    if (!validRoutes.includes(route)) {
        throw new TypeError(`route deve ser um de: ${validRoutes.join(', ')}`);
    }

    // Limites GHS Rev.9 Tabela 3.1.1 para via oral (mg/kg)
    // Adaptados para via dérmica com fator de 2× e inalação com fator de 0.5×
    const routeFactor = route === 'dermal' ? 2 : route === 'inhalation' ? 0.5 : 1;
    const adjustedLD50 = LD50_mg_kg / routeFactor;

    let GHS_class: number;
    if (adjustedLD50 <= 5)
        GHS_class = 1; // Fatal — H300
    else if (adjustedLD50 <= 50)
        GHS_class = 2; // Fatal — H300
    else if (adjustedLD50 <= 300)
        GHS_class = 3; // Tóxico — H301
    else if (adjustedLD50 <= 2000)
        GHS_class = 4; // Nocivo — H302
    else GHS_class = 5; // Baixo risco — H303

    // Score: inverso da categoria - Cat 1 = score máximo (5)
    const score = 6 - GHS_class;
    return { score, GHS_class };
}

/**
 * Calcula o Índice de Periculosidade de Resíduos (HWI - Hazardous Waste Index).
 * HWI é a média aritmética dos escores individuais de periculosidade.
 * Classificação conforme ABNT NBR 10004:2004 - Classe I (perigoso) vs Classe II.
 *
 * @param {number[]} scores - Array de escores de periculosidade (1–5 cada). Não vazio.
 * @returns {{ HWI: number, classification: 'Class_I'|'Class_IIA'|'Class_IIB' }}
 * @throws {TypeError} Se scores não for array ou contiver não-números.
 * @throws {RangeError} Se scores estiver vazio ou algum score estiver fora de [1, 5].
 */
export function computeHazardousWasteIndex(scores: number[]): HWIResult {
    if (!Array.isArray(scores) || scores.length === 0) {
        throw new TypeError('scores deve ser um array não-vazio');
    }
    for (const s of scores) {
        if (typeof s !== 'number' || !isFinite(s)) {
            throw new TypeError('Cada score deve ser um número finito');
        }
        if (s < 1 || s > 5) {
            throw new RangeError(`Score deve estar entre 1 e 5 (obtido: ${s})`);
        }
    }

    const HWI = scores.reduce((a, b) => a + b, 0) / scores.length;

    // Classificação NBR 10004: Class I = perigoso, IIA = não-inerte, IIB = inerte
    let classification: 'Class_I' | 'Class_IIA' | 'Class_IIB';
    if (HWI >= 3.5) {
        classification = 'Class_I'; // Resíduo perigoso — requer gestão especial
    } else if (HWI >= 2.0) {
        classification = 'Class_IIA'; // Não-inerte — pode ser reativo/biodegradável
    } else {
        classification = 'Class_IIB'; // Inerte — disposição simplificada
    }

    return { HWI, classification };
}

/**
 * Determina a rota de disposição recomendada para o resíduo.
 * Considera periculosidade (HWI), radioatividade e caráter infeccioso.
 *
 * @param {number} HWI - Índice de Periculosidade de Resíduos (1–5).
 * @param {boolean} radioactive - Indica se o resíduo é radioativo.
 * @param {boolean} infectious - Indica se o resíduo é infeccioso (RSS/biológico).
 * @returns {{ route: string }} Rota de disposição recomendada.
 * @throws {TypeError} Se HWI não for número finito, ou flags não forem boolean.
 * @throws {RangeError} Se HWI estiver fora de [1, 5].
 */
export function classifyWasteDisposalRoute(HWI: number, radioactive: boolean, infectious: boolean): DisposalRouteResult {
    if (typeof HWI !== 'number' || !isFinite(HWI)) {
        throw new TypeError('HWI deve ser um número finito');
    }
    if (typeof radioactive !== 'boolean') {
        throw new TypeError('radioactive deve ser boolean');
    }
    if (typeof infectious !== 'boolean') {
        throw new TypeError('infectious deve ser boolean');
    }
    if (HWI < 1 || HWI > 5) {
        throw new RangeError('HWI deve estar entre 1 e 5');
    }

    // Resíduos com características especiais requerem rota dedicada
    if (radioactive || infectious) {
        return { route: 'specialized' };
    }

    // Resíduos altamente perigosos requerem incineração (GHS Cat 1–2)
    if (HWI >= 4) {
        return { route: 'incineration' };
    }

    // Resíduos perigosos moderados → aterro Classe A (co-processamento possível)
    if (HWI >= 2.5) {
        return { route: 'landfill_class_A' };
    }

    // Resíduos de baixa periculosidade → aterro sanitário Classe B
    return { route: 'landfill_class_B' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const wasteHazardClassificationMeta = {
    name: 'wasteHazardClassification',
    description: 'wasteHazardClassification',
    category: 'analytics',
    familyTags: ['waste', 'risk'],
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
