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
 * Mine Haul Truck Efficiency - ciclo de transporte e produtividade de frota.
 * Eficiencia de caminhoes de transporte em mineracao.
 *
 * References:
 *   Caterpillar (2001) Caterpillar Performance Handbook Ed. 31. Peoria, IL.
 *   Hartman H.L. & Mutmansky J.M. (2002) Introductory Mining Engineering.
 *     SME Mining Engineering Handbook, 3rd ed.
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
 * Calcula o tempo de ciclo total de um caminhao de mina.
 * Total cycle time = load + haul + dump + return.
 *
 * @param loadTime - Tempo de carregamento (min)
 * @param haulingTime - Tempo de translado carregado (min)
 * @param dumpTime - Tempo de descarga (min)
 * @param returnTime - Tempo de retorno vazio (min)
 * @returns Tempo de ciclo total (min)
 */
export function calcCycleTime(
    loadTime: number,
    haulingTime: number,
    dumpTime: number,
    returnTime: number,
): number {
    for (const [name, val] of [
        ['loadTime', loadTime],
        ['haulingTime', haulingTime],
        ['dumpTime', dumpTime],
        ['returnTime', returnTime],
    ] as Array<[string, number]>) {
        if (typeof val !== 'number' || !isFinite(val) || val < 0) {
            throw new RangeError(`${name} must be a non-negative finite number`);
        }
    }
    return loadTime + haulingTime + dumpTime + returnTime;
}

/**
 * Calcula o payload efetivo de um caminhao.
 * Effective payload = gross load - empty (tare) weight.
 *
 * @param grossLoad_t - Massa total bruta (toneladas)
 * @param emptyWeight_t - Massa do caminhao vazio / tara (toneladas)
 * @returns Payload efetivo (t)
 */
export function calcEffectivePayload(grossLoad_t: number, emptyWeight_t: number): number {
    if (typeof grossLoad_t !== 'number' || !isFinite(grossLoad_t) || grossLoad_t <= 0) {
        throw new RangeError('grossLoad_t must be a positive finite number');
    }
    if (typeof emptyWeight_t !== 'number' || !isFinite(emptyWeight_t) || emptyWeight_t < 0) {
        throw new RangeError('emptyWeight_t must be a non-negative finite number');
    }
    if (emptyWeight_t >= grossLoad_t) {
        throw new RangeError('emptyWeight_t must be less than grossLoad_t');
    }
    return grossLoad_t - emptyWeight_t;
}

/**
 * Calcula a produtividade da frota de caminhoes (t/h).
 * Fleet productivity = (n * payload * availability * 60) / cycleTime
 *
 * @param nTrucks - Numero de caminhoes na frota
 * @param payload_t - Payload efetivo por caminhao (t)
 * @param cycleTime_min - Tempo de ciclo (min)
 * @param availability - Disponibilidade mecanica (0-1, ex: 0.85)
 * @returns Producao da frota (t/h)
 */
export function calcFleetProductivity(
    nTrucks: number,
    payload_t: number,
    cycleTime_min: number,
    availability: number,
): number {
    if (!Number.isInteger(nTrucks) || nTrucks <= 0) {
        throw new RangeError('nTrucks must be a positive integer');
    }
    if (typeof payload_t !== 'number' || !isFinite(payload_t) || payload_t <= 0) {
        throw new RangeError('payload_t must be a positive finite number');
    }
    if (typeof cycleTime_min !== 'number' || !isFinite(cycleTime_min) || cycleTime_min <= 0) {
        throw new RangeError('cycleTime_min must be a positive finite number');
    }
    if (typeof availability !== 'number' || !isFinite(availability) || availability <= 0 || availability > 1) {
        throw new RangeError('availability must be between 0 (exclusive) and 1 (inclusive)');
    }
    return (nTrucks * payload_t * availability * 60) / cycleTime_min;
}

/**
 * Estima o consumo de combustivel por ciclo (L/ciclo).
 * Fuel consumption = payload * grade_factor * distance * specific_consumption.
 * Grade factor: positivo para subida carregado (0 = sem rampa).
 *
 * @param payload_t - Payload efetivo (t)
 * @param grade_pct - Gradiente medio da rampa (%, positivo = subida)
 * @param distance_km - Distancia de translado (km, apenas sentido carregado)
 * @param consumption_L_t_km - Consumo especifico (L por t.km, tipico 0.03-0.08)
 * @returns Consumo estimado (L/ciclo)
 */
export function calcFuelConsumption(
    payload_t: number,
    grade_pct: number,
    distance_km: number,
    consumption_L_t_km: number,
): number {
    if (typeof payload_t !== 'number' || !isFinite(payload_t) || payload_t <= 0) {
        throw new RangeError('payload_t must be a positive finite number');
    }
    if (typeof grade_pct !== 'number' || !isFinite(grade_pct)) {
        throw new TypeError('grade_pct must be a finite number');
    }
    if (typeof distance_km !== 'number' || !isFinite(distance_km) || distance_km < 0) {
        throw new RangeError('distance_km must be a non-negative finite number');
    }
    if (typeof consumption_L_t_km !== 'number' || !isFinite(consumption_L_t_km) || consumption_L_t_km <= 0) {
        throw new RangeError('consumption_L_t_km must be a positive finite number');
    }
    // Fator de resistencia de rampa: grade adiciona ~0.01 de resistencia por 1%
    const gradeFactor = 1 + Math.max(0, grade_pct) * 0.01;
    return payload_t * gradeFactor * distance_km * consumption_L_t_km;
}

/**
 * Classifica a eficiencia de carga do caminhao em relacao ao payload nominal.
 * Underloaded < 85%, Optimal 85-110%, Overloaded > 110%.
 *
 * @param actual_t - Payload efetivo medido (t)
 * @param nominal_t - Payload nominal do fabricante (t)
 * @returns Classificacao de eficiencia
 */
export function classifyPayloadEfficiency(
    actual_t: number,
    nominal_t: number,
): 'underloaded' | 'optimal' | 'overloaded' {
    if (typeof actual_t !== 'number' || !isFinite(actual_t) || actual_t <= 0) {
        throw new RangeError('actual_t must be a positive finite number');
    }
    if (typeof nominal_t !== 'number' || !isFinite(nominal_t) || nominal_t <= 0) {
        throw new RangeError('nominal_t must be a positive finite number');
    }
    const ratio = actual_t / nominal_t;
    if (ratio < 0.85) return 'underloaded';
    if (ratio <= 1.1) return 'optimal';
    return 'overloaded';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const mineHaulfTruckEfficiencyMeta: AnalyticsModuleMeta = {
    name: 'mineHaulfTruckEfficiency',
    description: 'mineHaulfTruckEfficiency',
    category: 'analytics',
    familyTags: ['mining'],
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
