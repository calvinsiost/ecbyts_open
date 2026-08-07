// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   INGESTION VALIDATOR PURE (Module C extraction)
   ================================================================

   Helpers pure-logic extraídos de core/ingestion/validator.ts:
     - validatePhysicalRange: checa hard physical limits + warning de
       possível erro de unidade (>100x fora da faixa típica).
     - REGULATORY_LIMITS_AS_DEFAULT: catálogo CETESB 2021 frozen
       (10 parâmetros principais agua subterrânea).
     - checkRegulatoryLimit: helper para comparar valor contra limit.

   Recebem ranges/limits como deps injetáveis — testáveis sem CONFIG.
   ================================================================ */

export interface PhysicalRange {
    physicalMin?: number;
    physicalMax?: number;
    min?: number;
    max?: number;
    unitId?: string;
}

export interface ValidationResult {
    valid: boolean;
    severity?: 'error' | 'warning';
    message?: string;
}

/**
 * CETESB 2021 — agua subterrânea (10 parâmetros principais por CAS).
 * Frozen — caller injeta em checkRegulatoryLimit. Não importa CONFIG.
 */
export const REGULATORY_LIMITS_AS_DEFAULT: Readonly<Record<string, { name: string; limit: number; unit: string; source: string }>> = Object.freeze({
    '71-43-2': { name: 'Benzeno', limit: 5, unit: 'ug/L', source: 'CETESB 2021' },
    '108-88-3': { name: 'Tolueno', limit: 700, unit: 'ug/L', source: 'CETESB 2021' },
    '100-41-4': { name: 'Etilbenzeno', limit: 300, unit: 'ug/L', source: 'CETESB 2021' },
    '1330-20-7': { name: 'Xilenos', limit: 500, unit: 'ug/L', source: 'CETESB 2021' },
    '7440-38-2': { name: 'Arsênio', limit: 10, unit: 'ug/L', source: 'CETESB 2021' },
    '7440-43-9': { name: 'Cádmio', limit: 5, unit: 'ug/L', source: 'CETESB 2021' },
    '7439-92-1': { name: 'Chumbo', limit: 10, unit: 'ug/L', source: 'CETESB 2021' },
    '7439-97-6': { name: 'Mercúrio', limit: 1, unit: 'ug/L', source: 'CETESB 2021' },
    '127-18-4': { name: 'PCE', limit: 40, unit: 'ug/L', source: 'CETESB 2021' },
    '79-01-6': { name: 'TCE', limit: 70, unit: 'ug/L', source: 'CETESB 2021' },
});

function resolveRange(
    parameterId: string | null | undefined,
    value: unknown,
    ranges: Readonly<Record<string, PhysicalRange>>,
): { id: string; value: number; range: PhysicalRange } | null {
    if (!parameterId || value == null || typeof value !== 'number' || Number.isNaN(value)) return null;
    const range = ranges?.[parameterId];
    if (!range) return null;
    return { id: parameterId, value, range };
}

function checkPhysicalLimits(value: number, range: PhysicalRange, parameterId: string): ValidationResult | null {
    if (range.physicalMin != null && value < range.physicalMin) {
        return {
            valid: false,
            severity: 'error',
            message: `${parameterId}: valor ${value} abaixo do minimo fisico (${range.physicalMin})`,
        };
    }
    if (range.physicalMax != null && value > range.physicalMax) {
        return {
            valid: false,
            severity: 'error',
            message: `${parameterId}: valor ${value} acima do maximo fisico (${range.physicalMax})`,
        };
    }
    return null;
}

function checkTypicalRangeWarnings(value: number, range: PhysicalRange, parameterId: string): ValidationResult | null {
    const typicalMax = range.max;
    const typicalMin = range.min;
    if (typicalMax != null && value > 0 && typicalMax > 0 && value > typicalMax * 100) {
        return {
            valid: true,
            severity: 'warning',
            message: `${parameterId}: valor ${value} e >100x acima da faixa tipica (${typicalMin}-${typicalMax} ${range.unitId}) — possivel erro de unidade`,
        };
    }
    if (typicalMin != null && value > 0 && typicalMin > 0 && value < typicalMin / 100) {
        return {
            valid: true,
            severity: 'warning',
            message: `${parameterId}: valor ${value} e >100x abaixo da faixa tipica (${typicalMin}-${typicalMax} ${range.unitId}) — possivel erro de unidade`,
        };
    }
    return null;
}

/**
 * Valida valor contra physical range + typical range. Retorna:
 *   - error se value < physicalMin OR > physicalMax (hard limit)
 *   - warning se value > 100×typicalMax OR < typicalMin/100 (possible unit error)
 *   - { valid: true } se dentro de bounds
 *   - null se parameterId/value/range ausente
 *
 * Pure: recebe `ranges` dict injetável (Record<paramId, PhysicalRange>).
 */
export function validatePhysicalRange(
    parameterId: string | null | undefined,
    value: unknown,
    ranges: Readonly<Record<string, PhysicalRange>>,
): ValidationResult | null {
    const resolved = resolveRange(parameterId, value, ranges);
    if (!resolved) return null;
    const { id, value: numValue, range } = resolved;
    return checkPhysicalLimits(numValue, range, id) ?? checkTypicalRangeWarnings(numValue, range, id) ?? { valid: true };
}

/**
 * Verifica se valor excede limit regulatório para um CAS. Retorna:
 *   - { exceeds: true, ... } se value > limit
 *   - { exceeds: false, ... } se ≤ limit
 *   - null se CAS não está no catálogo (não-regulado por esta tabela)
 *
 * @param cas — CAS Registry Number (ex: '71-43-2' para Benzeno)
 * @param value — valor a comparar (mesma unidade que limit.unit)
 * @param limits — catálogo de limits (default REGULATORY_LIMITS_AS_DEFAULT)
 */
export function checkRegulatoryLimit(
    cas: any,
    value: any,
    limits: Readonly<Record<string, { name: string; limit: number; unit: string; source: string }>> = REGULATORY_LIMITS_AS_DEFAULT,
): { exceeds: boolean; limit: number; unit: string; source: string; name: string; ratio: number } | null {
    if (!cas || typeof cas !== 'string') return null;
    if (value == null || typeof value !== 'number' || !Number.isFinite(value)) return null;
    const entry = limits?.[cas];
    if (!entry) return null;
    return {
        exceeds: value > entry.limit,
        limit: entry.limit,
        unit: entry.unit,
        source: entry.source,
        name: entry.name,
        ratio: entry.limit > 0 ? value / entry.limit : Infinity,
    };
}
