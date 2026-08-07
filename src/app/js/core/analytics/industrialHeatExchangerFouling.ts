// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
'use strict';

/**
 * Industrial Heat Exchanger Fouling
 * Avaliação de incrustação (fouling) em trocadores de calor industriais.
 *
 * Referências:
 *   TEMA (2007) Standards of the Tubular Exchanger Manufacturers Association, 9th ed.
 *   Wilson (1915) Trans. ASME 37:47-70. (Wilson plot original)
 *   Somerscales & Knudsen (1981) Fouling of Heat Transfer Equipment. DOI:10.1016/0009-2509(81)85033-4
 */

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
 * Resistências de fouling de referência TEMA (m²·K/W) por classe de fluido.
 * TEMA (2007) Table RGP-T-2.4
 */
const TEMA_RF_REFERENCE: Record<string, number> = {
    cooling_water_treated: 1.76e-4, // água de refrigeração tratada
    cooling_water_untreated: 3.52e-4, // água de refrigeração não tratada
    river_water: 5.28e-4, // água de rio
    sea_water: 8.8e-5, // água do mar (< 52°C)
    steam_condensate: 8.8e-5, // condensado limpo
    crude_oil: 5.28e-4, // óleo cru
    fuel_oil: 8.8e-4, // óleo combustível
    boiler_feedwater_treated: 1.76e-4,
    process_side_gas: 2.64e-4,
};

/**
 * Calcula a resistência de fouling total (Rf) a partir dos coeficientes globais
 * de transferência de calor limpo e incrustado.
 * Rf = 1/U_fouled - 1/U_clean  (Wilson 1915; TEMA 2007 eq. Q-3.2)
 *
 * @param U_clean  - Coeficiente global limpo (W/m²·K)
 * @param U_fouled - Coeficiente global incrustado / medido (W/m²·K)
 * @returns Rf em m²·K/W (positivo indica fouling)
 */
export function calcFoulingResistance(U_clean: number, U_fouled: number): number {
    if (typeof U_clean !== 'number' || typeof U_fouled !== 'number') {
        throw new TypeError('calcFoulingResistance: U_clean e U_fouled devem ser números.');
    }
    if (U_clean <= 0 || U_fouled <= 0) {
        throw new RangeError('calcFoulingResistance: coeficientes U devem ser positivos.');
    }
    if (U_fouled > U_clean) {
        // U_fouled > U_clean é fisicamente inconsistente (incrustação reduz U)
        // Retornar 0 - sem fouling detectável
        return 0;
    }

    return 1 / U_fouled - 1 / U_clean;
}

/**
 * Estima o intervalo até a próxima limpeza baseado na taxa de fouling.
 * t_limpeza = (Rf_max - Rf_atual) / taxa_fouling
 *
 * @param Rf         - Resistência de fouling atual (m²·K/W)
 * @param Rf_max     - Resistência máxima aceitável (m²·K/W); geralmente valor TEMA
 * @param foulingRate - Taxa de acúmulo de fouling (m²·K/W por dia)
 */
export function calcCleaningInterval(
    Rf: number,
    Rf_max: number,
    foulingRate: number,
): { daysUntilCleaning: number; isOverdue: boolean } {
    if (typeof Rf !== 'number' || typeof Rf_max !== 'number' || typeof foulingRate !== 'number') {
        throw new TypeError('calcCleaningInterval: todos os parâmetros devem ser números.');
    }
    if (Rf < 0 || Rf_max <= 0 || foulingRate <= 0) {
        throw new RangeError('calcCleaningInterval: Rf >= 0; Rf_max e foulingRate devem ser positivos.');
    }

    const remaining = Rf_max - Rf;
    const isOverdue = remaining <= 0;
    const daysUntilCleaning = isOverdue ? 0 : remaining / foulingRate;

    return { daysUntilCleaning: Math.round(daysUntilCleaning), isOverdue };
}

/**
 * Calcula a perda percentual de capacidade de troca de calor devida ao fouling.
 * Q_loss% = (1 - U_fouled/U_clean) × 100
 * Derivado de Q = U × A × LMTD; A e LMTD constantes.
 *
 * @param Q_design - Capacidade de projeto (W ou kW - apenas referência)
 * @param Rf       - Resistência de fouling atual (m²·K/W)
 * @param U_clean  - Coeficiente global limpo (W/m²·K)
 */
export function calcHeatDutyLoss(
    Q_design: number,
    Rf: number,
    U_clean: number,
): { heatDutyLossFraction: number; heatDutyLossPercent: number } {
    if (typeof Q_design !== 'number' || typeof Rf !== 'number' || typeof U_clean !== 'number') {
        throw new TypeError('calcHeatDutyLoss: todos os parâmetros devem ser números.');
    }
    if (Q_design <= 0 || U_clean <= 0) {
        throw new RangeError('calcHeatDutyLoss: Q_design e U_clean devem ser positivos.');
    }
    if (Rf < 0) {
        throw new RangeError('calcHeatDutyLoss: Rf deve ser >= 0.');
    }

    // U_fouled = 1 / (1/U_clean + Rf)
    const U_fouled = 1 / (1 / U_clean + Rf);
    const heatDutyLossFraction = 1 - U_fouled / U_clean;

    return {
        heatDutyLossFraction: Math.max(0, heatDutyLossFraction),
        heatDutyLossPercent: Math.max(0, heatDutyLossFraction * 100),
    };
}

/**
 * Classifica a tendência de incrustação segundo os limites TEMA (2007).
 *
 * @param Rf - Resistência de fouling (m²·K/W)
 */
export function classifyFoulingTendency(Rf: number): 'negligible' | 'moderate' | 'severe' {
    if (typeof Rf !== 'number' || Rf < 0) {
        throw new RangeError('classifyFoulingTendency: Rf deve ser número não-negativo.');
    }

    // Limites baseados em TEMA Table RGP-T-2.4 e prática industrial
    // < 1.76e-4: negligível (abaixo do TEMA para água tratada)
    // 1.76e-4 a 5.28e-4: moderado
    // > 5.28e-4: severo (acima de TEMA para água de rio / óleo cru)
    if (Rf < 1.76e-4) return 'negligible';
    if (Rf <= 5.28e-4) return 'moderate';
    return 'severe';
}

/**
 * Retorna a resistência de fouling de referência TEMA para um tipo de fluido.
 *
 * @param fluidType - Chave de fluido (ver TEMA_RF_REFERENCE)
 * @returns Rf TEMA em m²·K/W ou null se não reconhecido
 */
export function getTEMAReferenceRf(fluidType: string): number | null {
    if (typeof fluidType !== 'string') {
        throw new TypeError('getTEMAReferenceRf: fluidType deve ser string.');
    }
    return TEMA_RF_REFERENCE[fluidType] ?? null;
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialHeatExchangerFoulingMeta: AnalyticsModuleMeta = {
    name: 'industrialHeatExchangerFouling',
    description: 'industrialHeatExchangerFouling',
    category: 'analytics',
    familyTags: ['industrial'],
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
