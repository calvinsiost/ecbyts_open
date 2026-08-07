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
 * @module industrialVentilationDesign
 * @description Ventilação local exaustora (VLE) - cálculo de velocidade de captura,
 * vazão de hood, pressão dinâmica e perda de carga por Darcy-Weisbach.
 *
 * Referências:
 * - ACGIH (2023). Industrial Ventilation: A Manual of Recommended Practice, 30th ed.
 *   ISBN 978-1-607260-83-6
 * - ABNT NBR 14787:2001 - Espaço Confinado - Prevenção, Preparação e Atendimento
 *   a Emergências (referenciado em projeto de ventilação industrial)
 * - ASHRAE Standard 62.1-2022 - Ventilation and Acceptable Indoor Air Quality.
 *   ISBN 978-1-947916-84-7
 * - Heinsohn, R.J. (1991). Industrial Ventilation: Engineering Principles.
 *   Wiley-Interscience. ISBN 978-0-471-50073-5
 */

'use strict';

// ─── Look-up: velocidade de captura recomendada [m/s] ────────────────────────
// Fonte: ACGIH IV Manual 30th ed., Table 3-1 (adaptado)
// [contaminantType][enclosureType] → m/s (valor central da faixa)
/** @type {Record<string, Record<string, number>>} */
const CAPTURE_VELOCITY_TABLE = {
    vapor_low_toxicity: { open: 0.25, partial: 0.5, enclosed: 0.75 },
    vapor_high_toxicity: { open: 0.5, partial: 1.0, enclosed: 1.5 },
    dust_light: { open: 0.5, partial: 1.0, enclosed: 1.5 },
    dust_heavy: { open: 1.0, partial: 2.0, enclosed: 3.0 },
    fumes: { open: 0.5, partial: 1.0, enclosed: 1.5 },
    mist: { open: 0.5, partial: 1.0, enclosed: 1.5 },
    gas_inert: { open: 0.25, partial: 0.5, enclosed: 0.75 },
    gas_toxic: { open: 0.75, partial: 1.5, enclosed: 2.5 },
};

// Density of dry air at 20°C, 101.325 kPa [kg/m³]
const AIR_DENSITY_20C = 1.204;

/**
 * Retorna velocidade de captura recomendada (m/s) por tipo de contaminante e capô.
 *
 * @param {string} contaminantType - Chave da tabela ACGIH (e.g. 'dust_light', 'fumes')
 * @param {string} enclosureType   - Grau de enclausuramento: 'open'|'partial'|'enclosed'
 * @returns {{ captureVelocity_m_s: number, contaminantType: string, enclosureType: string }}
 *
 * @example
 * calcCaptureVelocity('fumes', 'partial') // { captureVelocity_m_s: 1.0, ... }
 */
export function calcCaptureVelocity(contaminantType: string, enclosureType: string): { captureVelocity_m_s: number, contaminantType: string, enclosureType: string } {
    const valid = ['open', 'partial', 'enclosed'];
    if (!valid.includes(enclosureType)) {
        throw new RangeError(`enclosureType deve ser um de: ${valid.join(', ')}.`);
    }
    const row = (CAPTURE_VELOCITY_TABLE as Record<string, Record<string, number>>)[contaminantType];
    if (!row) {
        const keys = Object.keys(CAPTURE_VELOCITY_TABLE).join(', ');
        throw new RangeError(`contaminantType desconhecido. Valores válidos: ${keys}`);
    }
    return {
        captureVelocity_m_s: row[enclosureType]!,
        contaminantType,
        enclosureType,
    };
}

/**
 * Calcula a vazão de ar necessária no hood (capô).
 * Q = v_captura × A_controle
 *
 * @param {number} captureVelocity_m_s - Velocidade de captura [m/s]
 * @param {number} controlArea_m2      - Área de controle do capô [m²]
 * @returns {{ Q_m3_s: number, Q_m3_h: number, Q_cfm: number }}
 *
 * @example
 * calcHoodAirflow(1.0, 0.5) // { Q_m3_s: 0.5, Q_m3_h: 1800, Q_cfm: 1059 }
 */
export function calcHoodAirflow(captureVelocity_m_s: number, controlArea_m2: number): { Q_m3_s: number, Q_m3_h: number, Q_cfm: number } {
    if (typeof captureVelocity_m_s !== 'number' || typeof controlArea_m2 !== 'number') {
        throw new TypeError('captureVelocity_m_s e controlArea_m2 devem ser números.');
    }
    if (captureVelocity_m_s <= 0) throw new RangeError('captureVelocity_m_s deve ser > 0.');
    if (controlArea_m2 <= 0) throw new RangeError('controlArea_m2 deve ser > 0.');

    const Q_m3_s = captureVelocity_m_s * controlArea_m2;
    return {
        Q_m3_s: parseFloat(Q_m3_s.toFixed(5)),
        Q_m3_h: parseFloat((Q_m3_s * 3600).toFixed(2)),
        Q_cfm: parseFloat((Q_m3_s * 2118.88).toFixed(1)),
    };
}

/**
 * Calcula a pressão dinâmica (velocity pressure) do ar no duto.
 * VP = 0.5 × ρ × v²    [Pa]
 *
 * @param {number} velocity_m_s      - Velocidade do ar no duto [m/s]
 * @param {number} [airDensity_kg_m3=1.204] - Densidade do ar [kg/m³]; default 20°C, 1 atm
 * @returns {{ velocityPressure_Pa: number, velocity_m_s: number }}
 *
 * @example
 * calcDuctVelocityPressure(10, 1.204) // { velocityPressure_Pa: 60.2, velocity_m_s: 10 }
 */
export function calcDuctVelocityPressure(velocity_m_s: number, airDensity_kg_m3: number = AIR_DENSITY_20C): { velocityPressure_Pa: number, velocity_m_s: number } {
    if (typeof velocity_m_s !== 'number' || typeof airDensity_kg_m3 !== 'number') {
        throw new TypeError('velocity_m_s e airDensity_kg_m3 devem ser números.');
    }
    if (velocity_m_s <= 0) throw new RangeError('velocity_m_s deve ser > 0.');
    if (airDensity_kg_m3 <= 0) throw new RangeError('airDensity_kg_m3 deve ser > 0.');

    const VP = 0.5 * airDensity_kg_m3 * velocity_m_s ** 2;
    return {
        velocityPressure_Pa: parseFloat(VP.toFixed(4)),
        velocity_m_s,
    };
}

/**
 * Calcula a perda de carga em duto circular pela equação de Darcy-Weisbach.
 * ΔP = f × (L/D) × (ρ × v² / 2)    [Pa]
 *
 * @param {number} L_m           - Comprimento do duto [m]
 * @param {number} D_m           - Diâmetro interno do duto [m]
 * @param {number} velocity_m_s  - Velocidade do ar [m/s]
 * @param {number} f             - Fator de atrito de Darcy-Weisbach (adimensional)
 * @param {number} [rho=1.204]   - Densidade do ar [kg/m³]
 * @returns {{ pressureDrop_Pa: number, headLoss_mmH2O: number }}
 *
 * @example
 * calcStaticPressureDrop(10, 0.3, 10, 0.02) // { pressureDrop_Pa: 40.13, headLoss_mmH2O: 4.09 }
 */
export function calcStaticPressureDrop(L_m: number, D_m: number, velocity_m_s: number, f: number, rho: number = AIR_DENSITY_20C): { pressureDrop_Pa: number, headLoss_mmH2O: number } {
    if ([L_m, D_m, velocity_m_s, f, rho].some((v) => typeof v !== 'number')) {
        throw new TypeError('Todos os parâmetros devem ser números.');
    }
    if (L_m <= 0) throw new RangeError('L_m deve ser > 0.');
    if (D_m <= 0) throw new RangeError('D_m deve ser > 0.');
    if (velocity_m_s <= 0) throw new RangeError('velocity_m_s deve ser > 0.');
    if (f <= 0 || f > 1) throw new RangeError('Fator de atrito f deve estar entre 0 e 1.');
    if (rho <= 0) throw new RangeError('rho deve ser > 0.');

    const dynamicPressure = 0.5 * rho * velocity_m_s ** 2;
    const dP = f * (L_m / D_m) * dynamicPressure;
    // 1 Pa = 0.101972 mmH2O
    const headLoss_mmH2O = dP * 0.101972;

    return {
        pressureDrop_Pa: parseFloat(dP.toFixed(4)),
        headLoss_mmH2O: parseFloat(headLoss_mmH2O.toFixed(4)),
    };
}

/**
 * Classifica a adequação do sistema de ventilação com base em ACH (trocas de ar/hora).
 *
 * @param {number} measured_ACH  - ACH medido no ambiente
 * @param {number} required_ACH  - ACH mínimo requerido pela norma/processo
 * @returns {'adequate'|'marginal'|'inadequate'}
 *
 * Critério:
 *   measured >= required × 1.1 → adequate
 *   measured >= required × 0.9 → marginal (tolerância ±10%)
 *   measured < required × 0.9  → inadequate
 */
export function classifyVentilationAdequacy(measured_ACH: number, required_ACH: number): 'adequate'|'marginal'|'inadequate' {
    if (typeof measured_ACH !== 'number' || typeof required_ACH !== 'number') {
        throw new TypeError('measured_ACH e required_ACH devem ser números.');
    }
    if (measured_ACH < 0) throw new RangeError('measured_ACH deve ser >= 0.');
    if (required_ACH <= 0) throw new RangeError('required_ACH deve ser > 0.');

    const ratio = measured_ACH / required_ACH;
    if (ratio >= 1.1) return 'adequate';
    if (ratio >= 0.9) return 'marginal';
    return 'inadequate';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
interface AnalyticsJsonSchema {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties?: boolean;
    description?: string;
}
interface AnalyticsModuleProvenance {
    generatedBy: string;
    version: string;
    validatedByHuman: boolean;
    disclaimerAcknowledged: boolean;
    specRef: string;
    citation?: string;
}
interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: 'analytics';
    familyTags: string[];
    provenance: AnalyticsModuleProvenance;
    inputSchema: AnalyticsJsonSchema;
    outputSchema: AnalyticsJsonSchema;
}

export const industrialVentilationDesignMeta: AnalyticsModuleMeta = {
    name: 'industrialVentilationDesign',
    description: 'industrialVentilationDesign',
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
