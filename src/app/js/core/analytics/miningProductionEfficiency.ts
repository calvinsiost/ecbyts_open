// @ts-check
// Generated from src/app/js/core/analytics/miningProductionEfficiency.ts by TS-MIGRATION-001. Do not edit manually.
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
 * Mining Production Efficiency - Eficiencia de Producao em Mineracao
 *
 * References / Referencias:
 *   - Nakajima, S. (1988). Introduction to TPM: Total Productive Maintenance.
 *     Productivity Press. ISBN 0-915299-23-2
 *   - SME (2011). SME Mining Engineering Handbook, 3rd ed.
 *     Society for Mining, Metallurgy & Exploration. ISBN 978-0-87335-264-2
 *   - Rausand, M. & Hoyland, A. (2004). System Reliability Theory, 2nd ed.
 *     Wiley-Interscience. ISBN 0-471-47133-X (MTBF/MTTR)
 *   - Peng, S.S. (2006). Longwall Mining, 2nd ed. DOI: 10.1201/9780203020586
 *
 * OEE (Overall Equipment Effectiveness) = Availability * Performance * Quality
 * World-class benchmark: OEE >= 85% (Nakajima 1988)
 *
 * Zero DOM/IDB/Three.js/fetch dependencies - pure math module.
 * Sem dependencias de DOM/IDB/Three.js/fetch - modulo de matematica pura.
 *
 * @module miningProductionEfficiency
 */
'use strict';
/** World-class OEE threshold (%) per Nakajima 1988 */
const WORLD_CLASS_OEE = 85;
/** OEE performance classification thresholds */
const OEE_CLASSES = [
    { label: 'critical', labelPT: 'Critico', min: 0, max: 50 },
    { label: 'poor', labelPT: 'Ruim', min: 50, max: 65 },
    { label: 'acceptable', labelPT: 'Aceitavel', min: 65, max: 75 },
    { label: 'good', labelPT: 'Bom', min: 75, max: 85 },
    { label: 'world_class', labelPT: 'World-Class', min: 85, max: Infinity },
];
/**
 * Validate that a value is a non-negative finite number
 * Valida que um valor e um numero nao-negativo finito
 * @param {number} v
 * @param {string} name
 */
function requireNonNegative( v: any, name: any) {
    if (typeof v !== 'number' || !isFinite(v) || v < 0) {
        throw new RangeError(`${name} deve ser numero nao-negativo e finito`);
    }
}
/**
 * Compute Physical Availability (DF%) - Disponibilidade Fisica
 * DF = (HT - HP) / HT * 100
 * where HT = total hours available, HP = programmed maintenance hours
 *
 * Indica o percentual de tempo em que o equipamento esta fisicamente disponivel.
 * Indicates the percentage of time the equipment is physically available.
 *
 * @param {number} totalHours       - Total calendar hours (HT)
 * @param {number} maintenanceHours - Programmed maintenance hours (HP)
 * @returns {number} Physical availability DF%
 * @throws {RangeError} on invalid inputs
 */
export function physicalAvailability( totalHours: any, maintenanceHours: any) {
    requireNonNegative(totalHours, 'totalHours');
    requireNonNegative(maintenanceHours, 'maintenanceHours');
    if (totalHours === 0) throw new RangeError('totalHours deve ser > 0');
    if (maintenanceHours > totalHours) throw new RangeError('maintenanceHours nao pode exceder totalHours');
    return ((totalHours - maintenanceHours) / totalHours) * 100;
}
/**
 * Compute Physical Utilization (UF%) - Utilizacao Fisica
 * UF = HT_operado / (HT - HP) * 100
 * Hours actually operated vs. available hours (discounting maintenance).
 * Horas efetivamente operadas vs. horas disponiveis (descontando manutencao).
 *
 * @param {number} operatedHours    - Hours the equipment actually operated
 * @param {number} availableHours   - Available hours (HT - HP)
 * @returns {number} Physical utilization UF%
 * @throws {RangeError} on invalid inputs
 */
export function physicalUtilization( operatedHours: any, availableHours: any) {
    requireNonNegative(operatedHours, 'operatedHours');
    requireNonNegative(availableHours, 'availableHours');
    if (availableHours === 0) throw new RangeError('availableHours deve ser > 0');
    if (operatedHours > availableHours) throw new RangeError('operatedHours nao pode exceder availableHours');
    return (operatedHours / availableHours) * 100;
}
/**
 * Compute Operational Yield (RO%) - Rendimento Operacional
 * RO = producao_real / producao_nominal * 100
 * Ratio of actual to nominal (nameplate) production rate.
 * Razao entre producao real e producao nominal da especificacao.
 *
 * @param {number} actualProduction   - Actual production (any consistent unit, e.g. t/h)
 * @param {number} nominalProduction  - Nameplate / design production
 * @returns {number} Operational yield RO%
 * @throws {RangeError} on invalid inputs
 */
export function operationalYield( actualProduction: any, nominalProduction: any) {
    requireNonNegative(actualProduction, 'actualProduction');
    requireNonNegative(nominalProduction, 'nominalProduction');
    if (nominalProduction === 0) throw new RangeError('nominalProduction deve ser > 0');
    return (actualProduction / nominalProduction) * 100;
}
/**
 * Compute Overall Equipment Effectiveness (OEE) - Eficacia Global do Equipamento
 * OEE = (DF/100) * (UF/100) * (RO/100) * 100
 * Composite metric combining availability, utilization, and yield.
 * Metrica composta que combina disponibilidade, utilizacao e rendimento.
 *
 * @param {number} df - Physical availability DF% (0–100)
 * @param {number} uf - Physical utilization UF% (0–100)
 * @param {number} ro - Operational yield RO% (0–100)
 * @returns {number} OEE%
 * @throws {RangeError} if any input is outside [0, 100]
 */
export function oee( df: any, uf: any, ro: any) {
    const entries: any[] = [
        ['df', df],
        ['uf', uf],
        ['ro', ro],
    ];
    for (const [name, val] of entries) {
        if (val < 0 || val > 100) throw new RangeError(`${name} deve estar entre 0 e 100`);
    }
    return (df / 100) * (uf / 100) * (ro / 100) * 100;
}
/**
 * Classify OEE performance - Classificacao do desempenho OEE
 *
 * @param {number} oeePercent - OEE value (0–100)
 * @returns {{ label: string, labelPT: string, isWorldClass: boolean }}
 * @throws {RangeError} if oeePercent is outside [0, 100]
 */
export function classifyOEE( oeePercent: any) {
    if (oeePercent < 0 || oeePercent > 100) throw new RangeError('OEE deve estar entre 0 e 100');
    const cls: any =
        OEE_CLASSES.find((c: any) => oeePercent >= c.min && oeePercent < c.max) || OEE_CLASSES[OEE_CLASSES.length - 1];
    return { label: cls.label, labelPT: cls.labelPT, isWorldClass: oeePercent >= WORLD_CLASS_OEE };
}
/**
 * Compute MTBF and MTTR - Tempo Medio entre Falhas e Tempo Medio de Reparo
 * MTBF = total operating time / number of failures
 * MTTR = total repair time / number of failures
 * Reliability metrics per Rausand & Hoyland (2004).
 *
 * @param {number} totalOperatingHours - Total hours of operation
 * @param {number} totalRepairHours    - Total hours spent on corrective maintenance
 * @param {number} numberOfFailures    - Number of equipment failures
 * @returns {{ mtbf: number, mttr: number, inherentAvailability: number }}
 * @throws {RangeError} on invalid inputs
 */
export function mtbfMttr( totalOperatingHours: any, totalRepairHours: any, numberOfFailures: any) {
    requireNonNegative(totalOperatingHours, 'totalOperatingHours');
    requireNonNegative(totalRepairHours, 'totalRepairHours');
    if (!Number.isInteger(numberOfFailures) || numberOfFailures <= 0) {
        throw new RangeError('numberOfFailures deve ser inteiro > 0');
    }
    const mtbf = totalOperatingHours / numberOfFailures;
    const mttr = totalRepairHours / numberOfFailures;
    // Inherent (intrinsic) availability Ai = MTBF / (MTBF + MTTR)
    // Disponibilidade intrínseca: indica confiabilidade sem perdas de processo
    const inherentAvailability = mtbf / (mtbf + mttr);
    return { mtbf, mttr, inherentAvailability };
}
/**
 * Full mining equipment efficiency report - Relatorio completo de eficiencia
 *
 * @param {object} params
 * @param {number} params.totalHours
 * @param {number} params.maintenanceHours
 * @param {number} params.operatedHours
 * @param {number} params.actualProduction
 * @param {number} params.nominalProduction
 * @param {number} [params.totalRepairHours]
 * @param {number} [params.numberOfFailures]
 * @returns {{ df: number, uf: number, ro: number, oeeValue: number, oeeClass: object, reliability?: object }}
 */
export function equipmentEfficiencyReport({ totalHours, maintenanceHours, operatedHours, actualProduction, nominalProduction, totalRepairHours, numberOfFailures }: any) {
    const df = physicalAvailability(totalHours, maintenanceHours);
    const availableHours = totalHours - maintenanceHours;
    const uf = physicalUtilization(operatedHours, availableHours);
    const ro = operationalYield(actualProduction, nominalProduction);
    const oeeValue = oee(df, uf, ro);
    const oeeClass = classifyOEE(oeeValue);
    const result: any = { df, uf, ro, oeeValue, oeeClass };
    if (totalRepairHours !== undefined && numberOfFailures !== undefined) {
        result.reliability = mtbfMttr(operatedHours, totalRepairHours, numberOfFailures);
    }
    return result;
}
/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js' as string).AnalyticsModuleMeta}
 */
export const miningProductionEfficiencyMeta = {
    name: 'miningProductionEfficiency',
    description: 'miningProductionEfficiency',
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
