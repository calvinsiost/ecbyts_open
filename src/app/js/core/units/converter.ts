// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   CONVERSOR DE UNIDADES (UNIT CONVERTER) — TypeScript leaf
   Motor puro de conversão entre unidades de medida.
   ================================================================ */

import { UNITS, getUnitById, areUnitsCompatible, formatWithUnit, getUnitsByDimension } from './catalog.js';

/** Unit catalog entry (matches structure in catalog.js). */
export interface Unit {
    id: string;
    symbol?: string;
    name?: string;
    dimension: string;
    toBase: number;
    isBase?: boolean;
    offset?: number;
}

export interface ConvertResult {
    value: number | null;
    success: boolean;
    error?: string | undefined;
}

export interface ConvertArrayResult {
    values: number[] | null;
    success: boolean;
    error?: string | undefined;
}

export interface NormalizeResult {
    value: number | null;
    baseUnitId: string | null;
    success: boolean;
}

export interface RangeValidationResult {
    valid: boolean;
    message?: string;
}

export interface AutoFormatOptions {
    precision?: number;
}

export interface ObservationLike {
    value?: number;
    unitId?: string;
    [key: string]: unknown;
}

type GhgGas = 'CO2' | 'CH4' | 'N2O' | 'HFCs' | 'PFCs' | 'SF6';

/** Options for ppm <-> mg/m3 gas-phase conversion. */
export interface GasMolarOptions {
    /** Temperature in degrees Celsius. Default 25 (US EPA reference). */
    tempC?: number;
    /** Absolute pressure in atm. Default 1 (US EPA reference). */
    pressureAtm?: number;
}

export interface GasConvertResult {
    value: number | null;
    success: boolean;
    /** Molar volume (L/mol) actually used in the conversion. */
    molarVolumeL?: number;
    error?: string | undefined;
}

// ----------------------------------------------------------------
// CONVERSAO PRINCIPAL
// ----------------------------------------------------------------

/**
 * Converte valor entre unidades.
 */
export function convert(value: number, fromUnitId: string, toUnitId: string): ConvertResult {
    if (fromUnitId === toUnitId) {
        return { value, success: true };
    }

    const fromUnit = getUnitById(fromUnitId) as Unit | null;
    const toUnit = getUnitById(toUnitId) as Unit | null;

    if (!fromUnit) {
        return { value: null, success: false, error: `Unidade origem desconhecida: ${fromUnitId}` };
    }
    if (!toUnit) {
        return { value: null, success: false, error: `Unidade destino desconhecida: ${toUnitId}` };
    }

    if (!areUnitsCompatible(fromUnitId, toUnitId)) {
        return {
            value: null,
            success: false,
            error: `Unidades incompativeis: ${fromUnit.dimension} -> ${toUnit.dimension}`,
        };
    }

    if (fromUnit.dimension === 'temperature') {
        return convertTemperature(value, fromUnit, toUnit);
    }

    let baseValue: number;
    if (fromUnit.offset !== undefined) {
        baseValue = (value + fromUnit.offset) * fromUnit.toBase;
    } else {
        baseValue = value * fromUnit.toBase;
    }

    let result: number;
    if (toUnit.offset !== undefined) {
        result = baseValue / toUnit.toBase - toUnit.offset;
    } else {
        result = baseValue / toUnit.toBase;
    }

    return { value: result, success: true };
}

function convertTemperature(value: number, fromUnit: Unit, toUnit: Unit): ConvertResult {
    let celsius: number;

    switch (fromUnit.id) {
        case 'celsius':
            celsius = value;
            break;
        case 'fahrenheit':
            celsius = (value - 32) * (5 / 9);
            break;
        case 'kelvin':
            celsius = value - 273.15;
            break;
        default:
            return { value: null, success: false, error: 'Unidade de temperatura desconhecida' };
    }

    let result: number;
    switch (toUnit.id) {
        case 'celsius':
            result = celsius;
            break;
        case 'fahrenheit':
            result = (celsius * 9) / 5 + 32;
            break;
        case 'kelvin':
            result = celsius + 273.15;
            break;
        default:
            return { value: null, success: false, error: 'Unidade de temperatura desconhecida' };
    }

    return { value: result, success: true };
}

// ----------------------------------------------------------------
// CONVERSAO EM LOTE
// ----------------------------------------------------------------

export function convertArray(values: number[], fromUnitId: string, toUnitId: string): ConvertArrayResult {
    if (fromUnitId === toUnitId) {
        return { values: [...values], success: true };
    }

    const results: number[] = [];
    for (const value of values) {
        const result = convert(value, fromUnitId, toUnitId);
        if (!result.success || result.value === null) {
            return { values: null, success: false, error: result.error };
        }
        results.push(result.value);
    }

    return { values: results, success: true };
}

export function convertObservation(observation: ObservationLike, toUnitId: string): ObservationLike {
    if (!observation.value || !observation.unitId) {
        return observation;
    }

    const result = convert(observation.value, observation.unitId, toUnitId);
    if (!result.success || result.value === null) {
        return observation;
    }

    return {
        ...observation,
        value: result.value,
        unitId: toUnitId,
        originalValue: observation.value,
        originalUnitId: observation.unitId,
    };
}

// ----------------------------------------------------------------
// FORMATACAO
// ----------------------------------------------------------------

export function convertAndFormat(value: number, fromUnitId: string, toUnitId: string, precision = 2): string {
    const result = convert(value, fromUnitId, toUnitId);
    if (!result.success || result.value === null) {
        return formatWithUnit(value, fromUnitId, precision);
    }
    return formatWithUnit(result.value, toUnitId, precision);
}

// ----------------------------------------------------------------
// CONVERSOES ESPECIFICAS
// ----------------------------------------------------------------

export function convertHSRate(value: number, fromBase: string, toBase: string): number {
    if (fromBase === toBase) return value;

    if (fromBase === 'osha' && toBase === 'oit') {
        return value * 5;
    } else if (fromBase === 'oit' && toBase === 'osha') {
        return value / 5;
    }

    return value;
}

export function convertToGHGEquivalent(value: number, gas: string, toUnitId: string = 'tCO2e'): ConvertResult {
    const GWP: Record<GhgGas, number> = {
        CO2: 1,
        CH4: 28,
        N2O: 265,
        HFCs: 1300,
        PFCs: 7000,
        SF6: 23500,
    };

    const gwp = GWP[gas as GhgGas];
    if (!gwp) {
        return { value: null, success: false, error: `Gas desconhecido: ${gas}` };
    }

    const tCO2e = value * gwp;

    if (toUnitId === 'kgCO2e') {
        return { value: tCO2e * 1000, success: true };
    }

    return { value: tCO2e, success: true };
}

// ----------------------------------------------------------------
// CONVERSAO GASOSA: ppm <-> mg/m3 (via massa molar + volume molar)
// ----------------------------------------------------------------
//
// Para um gás/vapor ideal, a concentração mássica e a fração volumétrica
// relacionam-se pela massa molar (MW) e pelo volume molar (Vm):
//
//     mg/m3 = ppm * MW / Vm
//     ppm   = mg/m3 * Vm / MW
//
// Volume molar de referência (25 °C, 1 atm) = 24.45 L/mol — adotado por
// US EPA e ACGIH para higiene ocupacional/qualidade do ar.
// Referências:
//   - US EPA (1999). "Compendium of Methods for the Determination of Toxic
//     Organic Compounds in Ambient Air", EPA/625/R-96/010b; conversão
//     padrão ppmv <-> µg/m3 a 25 °C, 1 atm (Vm = 24.45 L/mol).
//   - ACGIH (2023). "TLVs and BEIs", apêndice de conversão:
//     mg/m3 = (ppm * MW) / 24.45 a NTP (25 °C, 760 mmHg).
//   - Lei dos gases ideais (CODATA R = 0.082057 L·atm·mol⁻¹·K⁻¹) para
//     ajuste a outras temperaturas/pressões: Vm = R*T/P.

/** Constante dos gases (L·atm·mol⁻¹·K⁻¹), CODATA 2018. */
const R_GAS_L_ATM = 0.0820573660809596;

/**
 * Volume molar de um gás ideal (L/mol) a uma dada temperatura e pressão.
 * Vm = R * T / P  (lei dos gases ideais).
 *
 * @param tempC        Temperatura em °C (padrão 25)
 * @param pressureAtm  Pressão absoluta em atm (padrão 1)
 * @returns Volume molar em L/mol (24.45 a 25 °C, 1 atm)
 */
export function molarVolume(tempC = 25, pressureAtm = 1): number {
    const tK = tempC + 273.15;
    return (R_GAS_L_ATM * tK) / pressureAtm;
}

/**
 * Converte concentração de gás/vapor de ppm (volume) para mg/m³.
 *
 *     mg/m³ = ppm * MW / Vm
 *
 * @param ppm           Concentração em ppmv (>= 0)
 * @param molarMass     Massa molar do composto em g/mol (> 0)
 * @param opts          Temperatura (°C) e pressão (atm); padrão EPA 25 °C / 1 atm
 * @returns Resultado com valor em mg/m³ e o volume molar usado
 */
export function ppmToMgm3(ppm: number, molarMass: number, opts: GasMolarOptions = {}): GasConvertResult {
    if (!Number.isFinite(ppm) || ppm < 0) {
        return { value: null, success: false, error: `ppm inválido: ${ppm}` };
    }
    if (!Number.isFinite(molarMass) || molarMass <= 0) {
        return { value: null, success: false, error: `massa molar inválida: ${molarMass}` };
    }
    const Vm = molarVolume(opts.tempC ?? 25, opts.pressureAtm ?? 1);
    return { value: (ppm * molarMass) / Vm, success: true, molarVolumeL: Vm };
}

/**
 * Converte concentração de gás/vapor de mg/m³ para ppm (volume).
 *
 *     ppm = mg/m³ * Vm / MW
 *
 * @param mgm3          Concentração em mg/m³ (>= 0)
 * @param molarMass     Massa molar do composto em g/mol (> 0)
 * @param opts          Temperatura (°C) e pressão (atm); padrão EPA 25 °C / 1 atm
 * @returns Resultado com valor em ppm e o volume molar usado
 */
export function mgm3ToPpm(mgm3: number, molarMass: number, opts: GasMolarOptions = {}): GasConvertResult {
    if (!Number.isFinite(mgm3) || mgm3 < 0) {
        return { value: null, success: false, error: `mg/m³ inválido: ${mgm3}` };
    }
    if (!Number.isFinite(molarMass) || molarMass <= 0) {
        return { value: null, success: false, error: `massa molar inválida: ${molarMass}` };
    }
    const Vm = molarVolume(opts.tempC ?? 25, opts.pressureAtm ?? 1);
    return { value: (mgm3 * Vm) / molarMass, success: true, molarVolumeL: Vm };
}

// ----------------------------------------------------------------
// VALIDACAO
// ----------------------------------------------------------------

export function validateRange(value: number, min: number, max: number, unitId: string): RangeValidationResult {
    const unit = getUnitById(unitId) as Unit | null;
    const symbol = unit?.symbol || unitId;

    if (value < min) {
        return {
            valid: false,
            message: `Valor ${value} ${symbol} abaixo do minimo ${min} ${symbol}`,
        };
    }

    if (value > max) {
        return {
            valid: false,
            message: `Valor ${value} ${symbol} acima do maximo ${max} ${symbol}`,
        };
    }

    return { valid: true };
}

export function normalizeToBase(value: number, unitId: string): NormalizeResult {
    const unit = getUnitById(unitId) as Unit | null;
    if (!unit) {
        return { value: null, baseUnitId: null, success: false };
    }

    if (unit.isBase) {
        return { value, baseUnitId: unitId, success: true };
    }

    const allUnits = Object.values(UNITS) as Unit[];
    const baseUnit = allUnits.find((u) => u.dimension === unit.dimension && u.isBase);

    if (!baseUnit) {
        return { value: null, baseUnitId: null, success: false };
    }

    const result = convert(value, unitId, baseUnit.id);
    return {
        value: result.value,
        baseUnitId: baseUnit.id,
        success: result.success,
    };
}

// ----------------------------------------------------------------
// UTILITARIOS
// ----------------------------------------------------------------

export function getConversionFactor(fromUnitId: string, toUnitId: string): number | null {
    if (fromUnitId === toUnitId) return 1;

    const fromUnit = getUnitById(fromUnitId) as Unit | null;
    const toUnit = getUnitById(toUnitId) as Unit | null;

    if (!fromUnit || !toUnit) return null;
    if (!areUnitsCompatible(fromUnitId, toUnitId)) return null;

    if (fromUnit.dimension === 'temperature') return null;

    return fromUnit.toBase / toUnit.toBase;
}

export function autoFormat(value: number, unitId: string, options: AutoFormatOptions = {}): string {
    const unit = getUnitById(unitId) as Unit | null;
    if (!unit) return `${value}`;

    const compatibleUnits = getUnitsByDimension(unit.dimension) as Unit[];
    const precision = options.precision ?? 2;

    if (compatibleUnits.length <= 1) {
        return formatWithUnit(value, unitId, precision);
    }

    for (const targetUnit of compatibleUnits) {
        const result = convert(value, unitId, targetUnit.id);
        if (result.success && result.value !== null) {
            const absValue = Math.abs(result.value);
            if (absValue >= 1 && absValue < 1000) {
                return formatWithUnit(result.value, targetUnit.id, precision);
            }
        }
    }

    return formatWithUnit(value, unitId, precision);
}
