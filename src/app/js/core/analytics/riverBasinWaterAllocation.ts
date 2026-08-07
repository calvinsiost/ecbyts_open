// @ts-check
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
 * River Basin Water Allocation Module
 *
 * Alocação de água em bacia hidrográfica com cálculo de disponibilidade,
 * estresse hídrico e segurança hídrica.
 *
 * References:
 * - ANA/SNGRH (2019). Atlas Esgotos: Despoluição de Bacias Hidrográficas.
 *   https://arquivos.ana.gov.br/institucional/sag/CobrancaUso/Atlas/Atlas_Esgotos_Despoluicao_de_Bacias_Hidrograficas.pdf
 * - Falkenmark, M. & Widstrand, C. (1992). Population and water resources: a delicate balance.
 *   Population Bulletin, 47(3), 1–36. doi:10.1080/02508069208686229
 * - Global Water Tool (2021). World Business Council for Sustainable Development (WBCSD).
 *   https://www.wbcsd.org/Programs/Food-and-Nature/Water/Resources/Global-Water-Tool
 * - ADB (2016). Asian Water Development Outlook 2016: Strengthening Water Security in Asia and the Pacific.
 *   https://www.adb.org/sites/default/files/publication/189411/awdo-2016.pdf
 * - CNRH Resolução 16/2001 - critérios gerais de outorga (Brasil)
 *
 * @module riverBasinWaterAllocation
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Falkenmark water stress thresholds (m³ per person per year).
 * Limites de estresse hídrico de Falkenmark (m³/habitante/ano).
 * Source: Falkenmark & Widstrand (1992).
 */
const FALKENMARK_THRESHOLDS = {
    WATER_RICH: 1700, // acima de 1700 → sem estresse hídrico
    WATER_STRESSED: 1000, // 1000–1700 → estresse hídrico periódico
    WATER_SCARCE: 500, // 500–1000 → estresse crônico
    ABSOLUTE_SCARCITY: 0, // abaixo de 500 → escassez absoluta
};

/**
 * ADB Water Security Index classification (1–5 scale).
 * Classificação do Índice de Segurança Hídrica ADB (escala 1–5).
 */
const ADB_SECURITY_CLASSES = [
    { score: 5, label: 'exemplary', description: 'Exemplar — bacia segura e resiliente' },
    { score: 4, label: 'functional', description: 'Funcional — bacia com gestão adequada' },
    { score: 3, label: 'engaged', description: 'Em transição — investimentos em andamento' },
    { score: 2, label: 'emerging', description: 'Emergente — infraestrutura básica em implantação' },
    { score: 1, label: 'nascent', description: 'Nascente — sem gestão hídrica estruturada' },
];

/**
 * Brazilian outorga limit (% of Q7,10 - mínima de 7 dias com período de retorno 10 anos)
 * as defined by CNRH Resolução 16/2001 and state-level practices.
 * Limite de outorga = percentual máximo da Q7,10 que pode ser outorgado (variável por estado).
 */
const BR_OUTORGA_LIMIT_FRACTION = 0.7; // 70% da Q7,10 para uso consuntivo (prática mais restritiva)

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Validates that a value is a finite positive number.
 * Valida que o valor é um número finito positivo.
 * @param {*} v @param {string} name
 */
function requirePositive(v: any, name: any) {
    if (typeof v !== 'number' || !isFinite(v) || v <= 0) {
        throw new RangeError(`${name} must be a finite positive number, got: ${v}`);
    }
}

/**
 * Validates that a value is a finite non-negative number.
 * Valida que o valor é um número finito não-negativo.
 * @param {*} v @param {string} name
 */
function requireNonNegative(v: any, name: any) {
    if (typeof v !== 'number' || !isFinite(v) || v < 0) {
        throw new RangeError(`${name} must be >= 0, got: ${v}`);
    }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Computes per-capita water availability and Falkenmark water stress index.
 * Calcula disponibilidade hídrica per capita e classifica pelo índice de Falkenmark.
 *
 * Disponibilidade per capita = disponibilidade total / população.
 *
 * @param {number} totalAvailabilityM3PerYear - Disponibilidade hídrica total da bacia (m³/ano)
 * @param {number} population - População na área da bacia (habitantes)
 * @returns {{ perCapitaM3PerYear: number, stressClass: string, stressDescription: string }}
 */
export function calculateFalkenmarkIndex(totalAvailabilityM3PerYear: any, population: any) {
    requirePositive(totalAvailabilityM3PerYear, 'totalAvailabilityM3PerYear');
    requirePositive(population, 'population');

    const perCapitaM3PerYear = totalAvailabilityM3PerYear / population;

    let stressClass, stressDescription;
    if (perCapitaM3PerYear >= FALKENMARK_THRESHOLDS.WATER_RICH) {
        stressClass = 'no_stress';
        stressDescription = 'Sem estresse hídrico — disponibilidade acima de 1700 m³/hab/ano';
    } else if (perCapitaM3PerYear >= FALKENMARK_THRESHOLDS.WATER_STRESSED) {
        stressClass = 'periodic_stress';
        stressDescription = 'Estresse hídrico periódico — 1000–1700 m³/hab/ano';
    } else if (perCapitaM3PerYear >= FALKENMARK_THRESHOLDS.WATER_SCARCE) {
        stressClass = 'chronic_stress';
        stressDescription = 'Estresse crônico — 500–1000 m³/hab/ano';
    } else {
        stressClass = 'absolute_scarcity';
        stressDescription = 'Escassez absoluta — abaixo de 500 m³/hab/ano';
    }

    return { perCapitaM3PerYear, stressClass, stressDescription };
}

/**
 * Computes water balance between available flow and granted withdrawals (outorgas).
 * Calcula o balanço hídrico entre disponibilidade e demandas outorgadas (SNGRH/ANA 2019).
 *
 * Balanço = Q7,10 × limite_outorga - soma das outorgas concedidas.
 * Positivo = disponibilidade remanescente; negativo = sobreoutorga.
 *
 * @param {number} q710M3PerS - Vazão de referência Q7,10 (m³/s)
 * @param {number[]} grantedWithdrawalsM3PerS - Outorgas concedidas (m³/s cada)
 * @param {number} [outorgaLimitFraction=0.7] - Fração máxima outorgável da Q7,10
 * @returns {{ availableForGrantsM3PerS: number, totalGrantedM3PerS: number, balanceM3PerS: number, utilizationFraction: number, status: string }}
 */
export function computeBasinWaterBalance(
    q710M3PerS: any,
    grantedWithdrawalsM3PerS: any,
    outorgaLimitFraction = BR_OUTORGA_LIMIT_FRACTION,
) {
    requirePositive(q710M3PerS, 'q710M3PerS');
    if (!Array.isArray(grantedWithdrawalsM3PerS)) {
        throw new TypeError('grantedWithdrawalsM3PerS must be an array');
    }
    grantedWithdrawalsM3PerS.forEach((w, i) => requireNonNegative(w, `grantedWithdrawalsM3PerS[${i}]`));
    if (typeof outorgaLimitFraction !== 'number' || outorgaLimitFraction <= 0 || outorgaLimitFraction > 1) {
        throw new RangeError('outorgaLimitFraction must be in (0, 1]');
    }

    // Disponibilidade máxima para outorga = Q7,10 × fração limite
    const availableForGrantsM3PerS = q710M3PerS * outorgaLimitFraction;
    const totalGrantedM3PerS = grantedWithdrawalsM3PerS.reduce((acc, w) => acc + w, 0);
    const balanceM3PerS = availableForGrantsM3PerS - totalGrantedM3PerS;
    const utilizationFraction = totalGrantedM3PerS / availableForGrantsM3PerS;

    let status;
    if (utilizationFraction <= 0.5)
        status = 'adequate'; // disponibilidade ampla
    else if (utilizationFraction <= 0.8)
        status = 'cautionary'; // atenção — próximo do limite
    else if (utilizationFraction <= 1.0)
        status = 'critical'; // próximo da capacidade máxima
    else status = 'over_allocated'; // sobreoutorga — conflito de uso

    return { availableForGrantsM3PerS, totalGrantedM3PerS, balanceM3PerS, utilizationFraction, status };
}

/**
 * Computes reservoir regularization index for a basin.
 * Calcula o índice de regularização de reservatório para uma bacia.
 *
 * Índice = volume total de regularização / volume médio anual de escoamento.
 * Classifica a capacidade de regularização hídrica da bacia (ANA 2019).
 *
 * @param {number} totalReservoirVolumeM3 - Volume total de regularização dos reservatórios (m³)
 * @param {number} meanAnnualFlowM3PerS - Vazão média anual da bacia (m³/s)
 * @returns {{ regularizationIndex: number, regulationClass: string, annualVolumeM3: number }}
 */
export function computeRegularizationIndex(totalReservoirVolumeM3: any, meanAnnualFlowM3PerS: any) {
    requirePositive(totalReservoirVolumeM3, 'totalReservoirVolumeM3');
    requirePositive(meanAnnualFlowM3PerS, 'meanAnnualFlowM3PerS');

    // Volume médio anual de escoamento = Q_médio × segundos/ano
    const annualVolumeM3 = meanAnnualFlowM3PerS * 365.25 * 24 * 3600;

    // Índice de regularização: razão entre capacidade de armazenamento e volume anual
    const regularizationIndex = totalReservoirVolumeM3 / annualVolumeM3;

    let regulationClass;
    if (regularizationIndex >= 0.5)
        regulationClass = 'high'; // alta regularização — ≥50% do volume anual
    else if (regularizationIndex >= 0.2)
        regulationClass = 'medium'; // média regularização — 20–50%
    else if (regularizationIndex >= 0.05)
        regulationClass = 'low'; // baixa regularização — 5–20%
    else regulationClass = 'very_low'; // muito baixa — < 5%

    return { regularizationIndex, regulationClass, annualVolumeM3 };
}

/**
 * Classifies water security level using adapted ADB Water Security Index framework.
 * Classifica o nível de segurança hídrica usando o framework ADB (escala 1–5).
 *
 * Score composto baseado em: regularização, disponibilidade per capita e utilização de outorgas.
 *
 * @param {number} perCapitaM3PerYear - Disponibilidade hídrica per capita (m³/hab/ano)
 * @param {number} regularizationIndex - Índice de regularização de reservatório [0, ∞)
 * @param {number} utilizationFraction - Fração de utilização das outorgas [0, ∞)
 * @returns {{ adbScore: number, securityClass: string, securityDescription: string }}
 */
export function classifyWaterSecurity(perCapitaM3PerYear: any, regularizationIndex: any, utilizationFraction: any) {
    requirePositive(perCapitaM3PerYear, 'perCapitaM3PerYear');
    requireNonNegative(regularizationIndex, 'regularizationIndex');
    requireNonNegative(utilizationFraction, 'utilizationFraction');

    // Sub-índice de disponibilidade (0–5) baseado em Falkenmark
    let availScore;
    if (perCapitaM3PerYear >= 1700) availScore = 5;
    else if (perCapitaM3PerYear >= 1000) availScore = 4;
    else if (perCapitaM3PerYear >= 500) availScore = 2;
    else availScore = 1;

    // Sub-índice de regularização (0–5)
    let regScore;
    if (regularizationIndex >= 0.5) regScore = 5;
    else if (regularizationIndex >= 0.2) regScore = 4;
    else if (regularizationIndex >= 0.05) regScore = 2;
    else regScore = 1;

    // Sub-índice de gestão de demanda - baixa utilização = melhor score
    let demandScore;
    if (utilizationFraction <= 0.3) demandScore = 5;
    else if (utilizationFraction <= 0.6) demandScore = 4;
    else if (utilizationFraction <= 0.8) demandScore = 3;
    else if (utilizationFraction <= 1.0) demandScore = 2;
    else demandScore = 1;

    // Score composto = média dos três sub-índices, arredondado para mais próximo
    const rawScore = (availScore + regScore + demandScore) / 3;
    const adbScore = Math.min(5, Math.max(1, Math.round(rawScore)));

    const classInfo = (ADB_SECURITY_CLASSES.find((c) => c.score === adbScore) || ADB_SECURITY_CLASSES[4])!;

    return {
        adbScore,
        securityClass: classInfo.label,
        securityDescription: classInfo.description,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const riverBasinWaterAllocationMeta = {
    name: 'riverBasinWaterAllocation',
    description: 'riverBasinWaterAllocation',
    category: 'analytics',
    familyTags: ['water', 'river'],
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
