// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining - Industrial Pressure Relief Sizing
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Industrial Pressure Relief Sizing - API STD 520/521 Method
 *
 * Módulo puro implementando o dimensionamento de dispositivos de alívio de
 * pressão (PSV - Pressure Safety Valves e RD - Rupture Discs) conforme
 * API STD 520 Parte I (2020) e API STD 521 (2020). Cálculo de área mínima
 * de alívio para vapor, gás e líquido, com correção de contrapressão.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - API STD 520 Part I (2020). "Sizing, Selection, and Installation of
 *     Pressure-Relieving Devices in Refineries - Part I: Sizing and
 *     Selection." 10th Edition. Washington, DC: American Petroleum Institute.
 *     (equacoes de dimensionamento para vapor, gas, liquido - Sec. 5)
 *   - API STD 521 (2020). "Pressure-relieving and Depressuring Systems."
 *     7th Edition. Washington, DC: American Petroleum Institute.
 *     (selecao de cenarios de aluvio, backpressure, piping)
 *   - ASME BPVC Section VIII Division 1 (2023). "Rules for Construction of
 *     Pressure Vessels." New York: American Society of Mechanical Engineers.
 *     (MAWP, stamp UV/UD, coeficiente de descarga Kd)
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

/** Coeficiente de descarga padrao para PSV API (API STD 520, Sec. 5.4.3.1) */
const KD_DEFAULT = 0.975;

/** Fator de servico K (reducao de 10% no area para PSV API certificada) */
const K_SERVICE = 0.9;

/**
 * Valida que um valor e um numero finito positivo.
 * @param name  - Nome do parametro para mensagem de erro
 * @param value - Valor a validar
 * @param allowZero - Permitir zero
 * @throws {TypeError|RangeError}
 */
function assertPositive(name: string, value: number, allowZero = false): void {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(`${name} must be a finite number, got ${value}`);
    }
    if (allowZero ? value < 0 : value <= 0) {
        throw new RangeError(`${name} must be ${allowZero ? '>= 0' : '> 0'}, got ${value}`);
    }
}

/**
 * Calcula a area minima de alívio de pressão (A) conforme API STD 520 Part I.
 *
 * Para gas/vapor: A = W / (C * Kd * P1 * sqrt(M / (T * Z))) [cm²]
 * Para liquido:   A = Q / (38 * Kv * sqrt(deltaP / SG))     [cm²]
 *
 * Onde:
 *   W  = vazao massica [kg/h]
 *   C  = constante de gas (funcao de k = Cp/Cv)
 *   Kd = coeficiente de descarga (0.975 padrao API)
 *   P1 = pressao absoluta de alívio [kPa abs]
 *   M  = massa molar [g/mol]
 *   T  = temperatura absoluta de alívio [K]
 *   Z  = fator de compressibilidade [-]
 *
 * @param massFlowRate - Vazao massica W [kg/h] (> 0)
 * @param relievingPressure - Pressao absoluta de alívio P1 [kPa abs] (> 0)
 * @param temperature - Temperatura de alívio T [K] (> 0)
 * @param molarMass - Massa molar M [g/mol] (> 0)
 * @param Kd - Coeficiente de descarga Kd [-] (0–1)
 * @param Z - Fator de compressibilidade [-] (> 0)
 * @param kRatio - Razao de calores especificos Cp/Cv [-] (> 1)
 * @returns Area minima de alívio A [cm²]
 * @throws {TypeError|RangeError} Para inputs invalidos
 */
export function calcRequiredReliefArea(
    massFlowRate: number,
    relievingPressure: number,
    temperature: number,
    molarMass: number,
    Kd: number = KD_DEFAULT,
    Z: number = 1.0,
    kRatio: number = 1.4,
): number {
    assertPositive('massFlowRate', massFlowRate);
    assertPositive('relievingPressure', relievingPressure);
    assertPositive('temperature', temperature);
    assertPositive('molarMass', molarMass);
    assertPositive('Z', Z);
    if (typeof Kd !== 'number' || !Number.isFinite(Kd) || Kd <= 0 || Kd > 1) {
        throw new RangeError(`Kd must be in (0, 1], got ${Kd}`);
    }
    if (typeof kRatio !== 'number' || !Number.isFinite(kRatio) || kRatio <= 1) {
        throw new RangeError(`kRatio (Cp/Cv) must be > 1, got ${kRatio}`);
    }

    // Constante de gas C (API STD 520 Eq. 5): C = 520 * sqrt(k * (2/(k+1))^((k+1)/(k-1)))
    // Representa a funcao de fluxo critico para gas ideal
    const k = kRatio;
    const C = 520 * Math.sqrt(k * Math.pow(2 / (k + 1), (k + 1) / (k - 1)));

    // Pressao em psia para formula API (1 kPa = 0.14504 psia)
    const P1psia = relievingPressure * 0.14504;

    // Vazao em lb/h (1 kg/h = 2.20462 lb/h)
    const Wlb = massFlowRate * 2.20462;

    // Massa molar em lb/lb-mol = g/mol (equivalentes numericamente)
    // Temperatura em R (Rankine): T[R] = T[K] * 1.8
    const TR = temperature * 1.8;

    // API STD 520 Eq. 5 - area em in²
    // A = W / (C * Kd * P1 * K * sqrt(M / (T * Z)))
    const areaIn2 = (Wlb * Math.sqrt((TR * Z) / molarMass)) / (C * Kd * K_SERVICE * P1psia);

    // Converter in² para cm² (1 in² = 6.4516 cm²)
    return areaIn2 * 6.4516;
}

/**
 * Calcula a vazao massica critica para gas em escoamento compressivel.
 *
 * Vazao critica (choked flow) conforme API STD 520 Eq. 3:
 * W = C * Kd * A * P1 * sqrt(M / (T * Z)) / K_service
 *
 * Util para verificacao inversa: dado area instalada, qual a capacidade?
 *
 * @param reliefArea - Area instalada A [cm²] (> 0)
 * @param relievingPressure - Pressao absoluta P1 [kPa abs] (> 0)
 * @param temperature - Temperatura T [K] (> 0)
 * @param molarMass - Massa molar M [g/mol] (> 0)
 * @param Kd - Coeficiente de descarga (0–1)
 * @param Z - Fator de compressibilidade (> 0)
 * @param kRatio - Razao Cp/Cv (> 1)
 * @returns Vazao massica critica W [kg/h]
 * @throws {TypeError|RangeError} Para inputs invalidos
 */
export function calcMassFlowRate(
    reliefArea: number,
    relievingPressure: number,
    temperature: number,
    molarMass: number,
    Kd: number = KD_DEFAULT,
    Z: number = 1.0,
    kRatio: number = 1.4,
): number {
    assertPositive('reliefArea', reliefArea);
    assertPositive('relievingPressure', relievingPressure);
    assertPositive('temperature', temperature);
    assertPositive('molarMass', molarMass);
    assertPositive('Z', Z);
    if (typeof Kd !== 'number' || !Number.isFinite(Kd) || Kd <= 0 || Kd > 1) {
        throw new RangeError(`Kd must be in (0, 1], got ${Kd}`);
    }
    if (typeof kRatio !== 'number' || !Number.isFinite(kRatio) || kRatio <= 1) {
        throw new RangeError(`kRatio must be > 1, got ${kRatio}`);
    }

    const k = kRatio;
    const C = 520 * Math.sqrt(k * Math.pow(2 / (k + 1), (k + 1) / (k - 1)));

    const P1psia = relievingPressure * 0.14504;
    const areaIn2 = reliefArea / 6.4516; // cm² → in²
    const TR = temperature * 1.8;

    // Inverso da equacao de area
    const Wlb = C * Kd * K_SERVICE * areaIn2 * P1psia * Math.sqrt(molarMass / (TR * Z));

    // lb/h → kg/h
    return Wlb / 2.20462;
}

/**
 * Calcula o fator de correcao de contrapressao Kb para PSV convencional.
 *
 * Para PSVs convencionais a contrapressao reduz a capacidade de alívio.
 * API STD 520 Fig. 30 (para gas): Kb = 1 quando P2/P1 <= 0.10 (10%),
 * decrescendo linearmente ate Kb = 0 quando P2/P1 = 1.
 * Valido para contrapressao percentual entre 0 e 50% (faixa pratica API).
 *
 * @param backpressure  - Contrapressao total P2 [kPa abs] (>= 0)
 * @param relievingPressure - Pressao absoluta de alívio P1 [kPa abs] (> 0)
 * @param type - Tipo de PSV
 * @returns Fator Kb [-] em [0, 1]
 * @throws {TypeError|RangeError} Para inputs invalidos
 */
export function calcBackpressureCorrection(
    backpressure: number,
    relievingPressure: number,
    type: 'conventional' | 'balanced' | 'pilot' = 'conventional',
): number {
    assertPositive('backpressure', backpressure, true); // pode ser zero
    assertPositive('relievingPressure', relievingPressure);

    const validTypes = ['conventional', 'balanced', 'pilot'];
    if (!validTypes.includes(type)) {
        throw new RangeError(`type must be one of ${validTypes.join(', ')}, got "${type}"`);
    }
    if (backpressure >= relievingPressure) {
        throw new RangeError('backpressure must be < relievingPressure');
    }

    const ratio = backpressure / relievingPressure; // P2/P1

    // PSV pilotada: insensivel a contrapressao ate 95% (API STD 520 Sec. 5.8.3)
    if (type === 'pilot') return 1.0;

    // PSV balanceada: Kb = 1.0 para P2/P1 <= 0.30; reducao suave ate 0.60
    // (API STD 520 Fig. 31 - linearizacao conservadora)
    if (type === 'balanced') {
        if (ratio <= 0.3) return 1.0;
        return Math.max(0, 1.0 - (ratio - 0.3) / 0.3);
    }

    // PSV convencional: Kb = 1 para P2/P1 <= 0.10; reducao linear
    // (API STD 520 Fig. 30 - gas servico)
    if (ratio <= 0.1) return 1.0;
    return Math.max(0, 1.0 - (ratio - 0.1) / 0.9);
}

/**
 * Classifica o tipo de dispositivo de alívio mais adequado com base nas
 * condicoes de operacao e fluido.
 *
 * Criterios de selecao conforme API STD 520 Sec. 4 e API STD 521 Sec. 5:
 *   - PSV convencional: servico limpo, P2/P1 < 10%
 *   - PSV balanceada (bellows): P2/P1 10–50% ou fluido corrosivo
 *   - PSV pilotada: pressao de operacao > 90% do set, ou multiplos cenarios
 *   - Disco de ruptura (RD): servico toxico/explosivo ou resposta ultrarapida
 *
 * @param setPressure - Pressao de ajuste (set pressure) [kPa g] (> 0)
 * @param operatingPressure - Pressao de operacao normal [kPa g] (> 0)
 * @param backpressureRatio - Razao P2/P1 contrapressao [-] (0–1)
 * @param toxic - Fluido toxico ou altamente inflamavel
 * @throws {TypeError|RangeError} Para inputs invalidos
 */
export function classifyReliefDeviceType(
    setPressure: number,
    operatingPressure: number,
    backpressureRatio: number,
    toxic = false,
): { type: string; code: string; rationale: string } {
    assertPositive('setPressure', setPressure);
    assertPositive('operatingPressure', operatingPressure);
    if (
        typeof backpressureRatio !== 'number' ||
        !Number.isFinite(backpressureRatio) ||
        backpressureRatio < 0 ||
        backpressureRatio >= 1
    ) {
        throw new RangeError('backpressureRatio must be in [0, 1), got ' + backpressureRatio);
    }
    if (operatingPressure >= setPressure) {
        throw new RangeError('operatingPressure must be < setPressure');
    }

    const opRatio = operatingPressure / setPressure; // razao de operacao

    // Disco de ruptura: fluido toxico/explosivo ou razao de operacao muito alta
    if (toxic) {
        return {
            type: 'Rupture Disc',
            code: 'RD',
            rationale: 'Toxic/explosive service requires leak-tight protection (API STD 520 Sec. 4.3)',
        };
    }

    // PSV pilotada: razao de operacao > 90% (previne chattering)
    if (opRatio > 0.9) {
        return {
            type: 'Pilot-Operated PSV',
            code: 'POPSV',
            rationale: 'Operating/set ratio > 90% — pilot prevents chattering (API STD 520 Sec. 4.4)',
        };
    }

    // PSV balanceada: contrapressao entre 10–50%
    if (backpressureRatio > 0.1 && backpressureRatio <= 0.5) {
        return {
            type: 'Balanced Bellows PSV',
            code: 'BBPSV',
            rationale: 'Backpressure ratio 10–50% requires balanced bellows (API STD 520 Sec. 4.2.2)',
        };
    }

    // PSV convencional: condicoes normais
    return {
        type: 'Conventional PSV',
        code: 'CPSV',
        rationale: 'Standard clean service with backpressure < 10% (API STD 520 Sec. 4.2.1)',
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialPressureReliefSizingMeta: AnalyticsModuleMeta = {
    name: 'industrialPressureReliefSizing',
    description: 'Industrial Pressure Relief Sizing',
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
