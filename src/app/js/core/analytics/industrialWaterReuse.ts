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
 * Industrial Water Reuse - Recovery Rate, Treatment Efficiency, Reuse Index, CONAMA Quality Class.
 *
 * Módulo puro para cálculo de indicadores de reúso industrial de água:
 * taxa de recuperação, eficiência de tratamento, índice de reúso composto
 * e classificação de qualidade baseada em CONAMA 357/2005 (adaptado para reúso).
 * Sem dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - CONAMA Resolução 357/2005 (BR). Dispõe sobre a classificação dos corpos
 *     de água e diretrizes ambientais para seu enquadramento.
 *     Parâmetros: TSS, DBO, turbidez por classe de uso.
 *   - ANA (2005). Conservação e reúso de água em edificações.
 *     Agência Nacional de Águas, Brasília. (Indicadores de reúso industrial)
 *   - Hespanhol, I. (2002). Water reuse and integrated environmental management.
 *     Water Supply, 2(3-4), 277-285.
 *     DOI: 10.2166/ws.2002.0097
 *     (Framework de índice composto para classificação de reúso)
 *
 * @module industrialWaterReuse
 */

'use strict';

/**
 * Compute Water Recovery Rate from process water balance.
 * Calcula a taxa de recuperação de água em um processo industrial.
 *
 * WRR = (recovered_m3 / input_m3) × 100
 * Indicador de eficiência do circuito de reúso (meta típica: >70% em indústria).
 *
 * @param {number} input_m3     - Total water input to process (m³); must be > 0
 * @param {number} recovered_m3 - Water recovered/recycled (m³); must be ≥ 0 and ≤ input_m3
 * @returns {{ WRR_pct: number }} Water Recovery Rate (%)
 * @throws {TypeError}  If inputs are not finite numbers
 * @throws {RangeError} If input ≤ 0, recovered < 0, or recovered > input
 */
export function computeWaterRecoveryRate(input_m3: number, recovered_m3: number): { WRR_pct: number } {
    if (typeof input_m3 !== 'number' || !isFinite(input_m3)) {
        throw new TypeError('input_m3 must be a finite number');
    }
    if (typeof recovered_m3 !== 'number' || !isFinite(recovered_m3)) {
        throw new TypeError('recovered_m3 must be a finite number');
    }
    if (input_m3 <= 0) {
        throw new RangeError('input_m3 must be > 0');
    }
    if (recovered_m3 < 0) {
        throw new RangeError('recovered_m3 must be ≥ 0');
    }
    if (recovered_m3 > input_m3) {
        throw new RangeError('recovered_m3 cannot exceed input_m3');
    }

    // WRR (%) = volume recuperado / volume de entrada × 100
    const WRR_pct = (recovered_m3 / input_m3) * 100;
    return { WRR_pct };
}

/**
 * Compute pollutant removal efficiency across a treatment step.
 * Calcula a eficiência de remoção de poluente em uma etapa de tratamento.
 *
 * Removal (%) = ((influent − effluent) / influent) × 100
 * Eficiência negativa indica deterioração da qualidade (ex.: ressuspensão).
 *
 * @param {number} influent_mg_L - Inlet concentration (mg/L); must be > 0
 * @param {number} effluent_mg_L - Outlet concentration (mg/L); must be ≥ 0
 * @returns {{ removal_pct: number }} Removal efficiency (%)
 * @throws {TypeError}  If inputs are not finite numbers
 * @throws {RangeError} If influent ≤ 0 or effluent < 0
 */
export function computeTreatmentEfficiency(influent_mg_L: number, effluent_mg_L: number): { removal_pct: number } {
    if (typeof influent_mg_L !== 'number' || !isFinite(influent_mg_L)) {
        throw new TypeError('influent_mg_L must be a finite number');
    }
    if (typeof effluent_mg_L !== 'number' || !isFinite(effluent_mg_L)) {
        throw new TypeError('effluent_mg_L must be a finite number');
    }
    if (influent_mg_L <= 0) {
        throw new RangeError('influent_mg_L must be > 0');
    }
    if (effluent_mg_L < 0) {
        throw new RangeError('effluent_mg_L must be ≥ 0');
    }

    // Eficiência = (entrada − saída) / entrada × 100
    const removal_pct = ((influent_mg_L - effluent_mg_L) / influent_mg_L) * 100;
    return { removal_pct };
}

/**
 * Compute composite Water Reuse Index from recovery and compliance metrics.
 * Calcula o índice composto de reúso de água ponderando recuperação e conformidade.
 *
 * WRI = 0.60 × (WRR_pct / 100) + 0.40 × (quality_compliance_pct / 100)
 * Ponderação: 60% recuperação volumétrica + 40% conformidade de qualidade.
 * Resultado no intervalo [0, 1]; meta de boas práticas: WRI ≥ 0.70.
 *
 * @param {number} WRR_pct               - Water Recovery Rate (%); must be in [0, 100]
 * @param {number} quality_compliance_pct - Fraction of quality parameters in compliance (%); [0, 100]
 * @returns {{ WRI: number }} Water Reuse Index in [0, 1]
 * @throws {TypeError}  If inputs are not finite numbers
 * @throws {RangeError} If any percentage is outside [0, 100]
 */
export function computeWaterReuseIndex(WRR_pct: number, quality_compliance_pct: number): { WRI: number } {
    if (typeof WRR_pct !== 'number' || !isFinite(WRR_pct)) {
        throw new TypeError('WRR_pct must be a finite number');
    }
    if (typeof quality_compliance_pct !== 'number' || !isFinite(quality_compliance_pct)) {
        throw new TypeError('quality_compliance_pct must be a finite number');
    }
    if (WRR_pct < 0 || WRR_pct > 100) {
        throw new RangeError('WRR_pct must be in [0, 100]');
    }
    if (quality_compliance_pct < 0 || quality_compliance_pct > 100) {
        throw new RangeError('quality_compliance_pct must be in [0, 100]');
    }

    // Índice composto com pesos 60% (recuperação) + 40% (qualidade)
    const WRI = 0.6 * (WRR_pct / 100) + 0.4 * (quality_compliance_pct / 100);
    return { WRI };
}

type ReuseQualityClass = 'class_1' | 'class_2' | 'class_3' | 'non_compliant';

function assertReuseQualityInputs(
    TSS_mg_L: number,
    BOD_mg_L: number,
    turbidity_NTU: number,
): void {
    if (typeof TSS_mg_L !== 'number' || !isFinite(TSS_mg_L)) {
        throw new TypeError('TSS_mg_L must be a finite number');
    }
    if (typeof BOD_mg_L !== 'number' || !isFinite(BOD_mg_L)) {
        throw new TypeError('BOD_mg_L must be a finite number');
    }
    if (typeof turbidity_NTU !== 'number' || !isFinite(turbidity_NTU)) {
        throw new TypeError('turbidity_NTU must be a finite number');
    }
    if (TSS_mg_L < 0) throw new RangeError('TSS_mg_L must be ≥ 0');
    if (BOD_mg_L < 0) throw new RangeError('BOD_mg_L must be ≥ 0');
    if (turbidity_NTU < 0) throw new RangeError('turbidity_NTU must be ≥ 0');
}

function reuseQualityClass(
    TSS_mg_L: number,
    BOD_mg_L: number,
    turbidity_NTU: number,
): ReuseQualityClass {
    if (TSS_mg_L <= 20 && BOD_mg_L <= 10 && turbidity_NTU <= 40) return 'class_1';
    if (TSS_mg_L <= 100 && BOD_mg_L <= 30 && turbidity_NTU <= 100) return 'class_2';
    if (TSS_mg_L <= 300 && BOD_mg_L <= 60 && turbidity_NTU <= 200) return 'class_3';
    return 'non_compliant';
}

/**
 * Classify reuse water quality based on CONAMA 357/2005 thresholds adapted for industrial reuse.
 * Classifica a qualidade da água para reúso com base na CONAMA 357 adaptada.
 *
 * Classes de reúso industrial (adaptado de CONAMA 357 e ANA 2005):
 *   Classe 1: TSS ≤ 20, BOD ≤ 10, Turbidez ≤ 40 NTU  (usos nobres: torres de resfriamento)
 *   Classe 2: TSS ≤ 100, BOD ≤ 30, Turbidez ≤ 100     (irrigação industrial, lavagem de veículos)
 *   Classe 3: TSS ≤ 300, BOD ≤ 60, Turbidez ≤ 200     (supressão de poeira, compactação de aterro)
 *   non_compliant: fora dos limites da Classe 3
 *
 * @param {number} TSS_mg_L      - Total Suspended Solids (mg/L); must be ≥ 0
 * @param {number} BOD_mg_L      - Biochemical Oxygen Demand (mg/L); must be ≥ 0
 * @param {number} turbidity_NTU - Turbidity (NTU); must be ≥ 0
 * @returns {{ class: 'class_1'|'class_2'|'class_3'|'non_compliant' }} Water quality class for reuse
 * @throws {TypeError}  If any input is not a finite number
 * @throws {RangeError} If any parameter is < 0
 */
export function classifyReuseQuality(TSS_mg_L: number, BOD_mg_L: number, turbidity_NTU: number): { class: 'class_1'|'class_2'|'class_3'|'non_compliant' } {
    assertReuseQualityInputs(TSS_mg_L, BOD_mg_L, turbidity_NTU);
    return { class: reuseQualityClass(TSS_mg_L, BOD_mg_L, turbidity_NTU) };
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

export const industrialWaterReuseMeta: AnalyticsModuleMeta = {
    name: 'industrialWaterReuse',
    description: 'industrialWaterReuse',
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
