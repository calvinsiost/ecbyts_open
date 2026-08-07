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
 * Soil Moisture Model - pedotransfer functions para estimativa de propriedades
 * hidráulicas do solo a partir de dados texturais e de matéria orgânica.
 *
 * Referência principal:
 * Saxton, K.E. & Rawls, W.J. (2006). Soil Water Characteristic Estimates by
 * Texture and Organic Matter for Hydrologic Solutions.
 * Soil Sci. Soc. Am. J. 70:1569–1578.
 * DOI: 10.2136/sssaj2005.0117
 */

interface FieldCapacityResult { FC_m3_m3: number }
interface WiltingPointResult { WP_m3_m3: number }
interface AvailableWaterCapacityResult { AWC_mm: number }
interface MoistureStatusResult { status: string; SFR: number | null }

/**
 * Valida frações percentuais de textura do solo.
 * @param {number} clay_pct  - Teor de argila (%)
 * @param {number} silt_pct  - Teor de silte (%)
 * @param {number} organic_matter_pct - Teor de matéria orgânica (%)
 * @throws {TypeError} se algum argumento não for número finito
 * @throws {RangeError} se valores estiverem fora do intervalo válido
 */
function _validateTexture(clay_pct: number, silt_pct: number, organic_matter_pct: number): void {
    if (
        typeof clay_pct !== 'number' ||
        !isFinite(clay_pct) ||
        typeof silt_pct !== 'number' ||
        !isFinite(silt_pct) ||
        typeof organic_matter_pct !== 'number' ||
        !isFinite(organic_matter_pct)
    ) {
        throw new TypeError('clay_pct, silt_pct e organic_matter_pct devem ser números finitos');
    }
    if (clay_pct < 0 || clay_pct > 100) throw new RangeError('clay_pct deve estar em [0, 100]');
    if (silt_pct < 0 || silt_pct > 100) throw new RangeError('silt_pct deve estar em [0, 100]');
    if (organic_matter_pct < 0 || organic_matter_pct > 100)
        throw new RangeError('organic_matter_pct deve estar em [0, 100]');
    if (clay_pct + silt_pct > 100) throw new RangeError('clay_pct + silt_pct não pode exceder 100%');
}

/**
 * Calcula a Capacidade de Campo (Field Capacity) do solo.
 * FC é o conteúdo de água retido após drenagem gravitacional por 2-3 dias.
 *
 * Equação de Saxton & Rawls (2006), Tabela 1:
 *   FC = 0.299 - 0.251×sand_frac + 0.195×clay_frac + 0.011×OM_frac
 *   (frações decimais, OM em % massa)
 *
 * @param {number} clay_pct  - Teor de argila (%, 0–100)
 * @param {number} silt_pct  - Teor de silte (%, 0–100)
 * @param {number} organic_matter_pct - Matéria orgânica (%, 0–100)
 * @returns {{ FC_m3_m3: number }} Capacidade de campo em m³/m³
 */
export function computeFieldCapacity(clay_pct: number, silt_pct: number, organic_matter_pct: number): FieldCapacityResult {
    _validateTexture(clay_pct, silt_pct, organic_matter_pct);
    const sand_frac = (100 - clay_pct - silt_pct) / 100;
    const clay_frac = clay_pct / 100;
    const OM_frac = organic_matter_pct / 100;
    // Equação pedotransferência Saxton & Rawls 2006
    const FC = 0.299 - 0.251 * sand_frac + 0.195 * clay_frac + 0.011 * OM_frac;
    return { FC_m3_m3: Math.max(0, Math.min(1, FC)) };
}

/**
 * Calcula o Ponto de Murcha Permanente (Wilting Point).
 * WP é o teor de água abaixo do qual as plantas não conseguem extrair água do solo.
 *
 * Equação simplificada de Saxton & Rawls (2006):
 *   WP = 0.026 + 0.005×clay_pct + 0.013×OM_pct  (em m³/m³)
 *
 * @param {number} clay_pct  - Teor de argila (%, 0–100)
 * @param {number} organic_matter_pct - Matéria orgânica (%, 0–100)
 * @returns {{ WP_m3_m3: number }} Ponto de murcha permanente em m³/m³
 * @throws {TypeError} se argumentos não forem números finitos
 * @throws {RangeError} se valores estiverem fora do intervalo válido
 */
export function computeWiltingPoint(clay_pct: number, organic_matter_pct: number): WiltingPointResult {
    if (typeof clay_pct !== 'number' || !isFinite(clay_pct)) throw new TypeError('clay_pct deve ser número finito');
    if (typeof organic_matter_pct !== 'number' || !isFinite(organic_matter_pct))
        throw new TypeError('organic_matter_pct deve ser número finito');
    if (clay_pct < 0 || clay_pct > 100) throw new RangeError('clay_pct deve estar em [0, 100]');
    if (organic_matter_pct < 0 || organic_matter_pct > 100)
        throw new RangeError('organic_matter_pct deve estar em [0, 100]');

    const WP = 0.026 + 0.005 * clay_pct + 0.013 * organic_matter_pct;
    return { WP_m3_m3: Math.max(0, Math.min(1, WP)) };
}

/**
 * Calcula a Capacidade de Água Disponível (Available Water Capacity).
 * AWC = (FC - WP) × profundidade × 10  [mm]
 * O fator 10 converte m³/m³ × cm → mm equivalente de lâmina d'água.
 *
 * @param {number} FC - Capacidade de campo (m³/m³)
 * @param {number} WP - Ponto de murcha permanente (m³/m³)
 * @param {number} depth_cm - Profundidade do perfil analisado (cm, > 0)
 * @returns {{ AWC_mm: number }} Capacidade de água disponível em mm
 * @throws {TypeError} se argumentos não forem números finitos
 * @throws {RangeError} se FC ≤ WP ou depth_cm ≤ 0
 */
export function computeAvailableWaterCapacity(FC: number, WP: number, depth_cm: number): AvailableWaterCapacityResult {
    if (
        typeof FC !== 'number' ||
        !isFinite(FC) ||
        typeof WP !== 'number' ||
        !isFinite(WP) ||
        typeof depth_cm !== 'number' ||
        !isFinite(depth_cm)
    ) {
        throw new TypeError('FC, WP e depth_cm devem ser números finitos');
    }
    if (FC < 0 || FC > 1) throw new RangeError('FC deve estar em [0, 1]');
    if (WP < 0 || WP > 1) throw new RangeError('WP deve estar em [0, 1]');
    if (FC <= WP) throw new RangeError('FC deve ser maior que WP');
    if (depth_cm <= 0) throw new RangeError('depth_cm deve ser positivo');

    const AWC_mm = (FC - WP) * depth_cm * 10;
    return { AWC_mm };
}

/**
 * Classifica o status de umidade do solo em relação à FC e WP.
 * Baseado na razão de saturação relativa: SFR = (current - WP) / (FC - WP)
 *
 * Classes:
 *   saturated    : current > FC
 *   field_capacity: SFR ≥ 0.95
 *   adequate     : SFR ≥ 0.40
 *   stressed     : SFR ≥ 0.10
 *   wilting      : SFR < 0.10 (inclui abaixo do WP)
 *
 * @param {number} current_m3_m3 - Umidade atual do solo (m³/m³)
 * @param {number} FC - Capacidade de campo (m³/m³)
 * @param {number} WP - Ponto de murcha permanente (m³/m³)
 * @returns {{ status: string, SFR: number | null }} Status e razão de saturação relativa
 * @throws {TypeError} se argumentos não forem números finitos
 * @throws {RangeError} se FC ≤ WP
 */
export function classifySoilMoistureStatus(current_m3_m3: number, FC: number, WP: number): MoistureStatusResult {
    if (
        typeof current_m3_m3 !== 'number' ||
        !isFinite(current_m3_m3) ||
        typeof FC !== 'number' ||
        !isFinite(FC) ||
        typeof WP !== 'number' ||
        !isFinite(WP)
    ) {
        throw new TypeError('current_m3_m3, FC e WP devem ser números finitos');
    }
    if (FC <= WP) throw new RangeError('FC deve ser maior que WP');

    if (current_m3_m3 > FC) return { status: 'saturated', SFR: null };

    const SFR = (current_m3_m3 - WP) / (FC - WP);
    let status: string;
    if (SFR >= 0.95) status = 'field_capacity';
    else if (SFR >= 0.4) status = 'adequate';
    else if (SFR >= 0.1) status = 'stressed';
    else status = 'wilting';

    return { status, SFR };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const soilMoistureModelMeta = {
    name: 'soilMoistureModel',
    description: 'soilMoistureModel',
    category: 'analytics',
    familyTags: ['soil', 'hydrocarbon'],
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
