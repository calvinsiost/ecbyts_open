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
 * Industrial Lighting Energy Audit - Maintained Illuminance, Uniformity, DPI, LED Savings
 *
 * Academic references:
 * - ISO/CIE 8995-1:2002. Lighting of work places - Part 1: Indoor. ISO/CIE.
 * - ABNT NBR ISO/CIE 8995-1:2013. Iluminação de ambientes de trabalho - Parte 1: Interior.
 *   ABNT. (Equivalent to ISO/CIE 8995-1:2002 with Brazilian amendments)
 * - ANEEL / PROCEL (2021). Manual de Medição e Verificação de Desempenho. PROCEL Info.
 *   https://www.procelinfo.com.br
 *
 * @module industrialLightingEnergyAudit
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

// ---- Task illuminance requirements (ABNT NBR ISO/CIE 8995-1:2013, Table 5.4) ----
// Iluminâncias mantidas recomendadas por tipo de tarefa visual (lux)

type TaskType =
    | 'storage_inactive'
    | 'storage_active'
    | 'rough_work'
    | 'medium_work'
    | 'fine_work'
    | 'precision_work'
    | 'very_fine_work'
    | 'extra_fine_work'
    | 'office_general'
    | 'drawing_office'
    | 'inspection_general'
    | 'inspection_fine'
    | 'laboratory';

export const TASK_REQUIREMENTS: Record<TaskType, { emMin: number; raMin: number; label: string }> = {
    storage_inactive: { emMin: 50, raMin: 40, label: 'Storage (inactive)' },
    storage_active: { emMin: 100, raMin: 60, label: 'Storage (active)' },
    rough_work: { emMin: 200, raMin: 40, label: 'Rough work' },
    medium_work: { emMin: 300, raMin: 80, label: 'Medium work' },
    fine_work: { emMin: 500, raMin: 80, label: 'Fine work' },
    precision_work: { emMin: 750, raMin: 80, label: 'Precision work' },
    very_fine_work: { emMin: 1000, raMin: 90, label: 'Very fine work' },
    extra_fine_work: { emMin: 1500, raMin: 90, label: 'Extra fine work' },
    office_general: { emMin: 500, raMin: 80, label: 'Office — general' },
    drawing_office: { emMin: 750, raMin: 80, label: 'Drawing office' },
    inspection_general: { emMin: 500, raMin: 80, label: 'Inspection — general' },
    inspection_fine: { emMin: 1000, raMin: 90, label: 'Inspection — fine' },
    laboratory: { emMin: 500, raMin: 80, label: 'Laboratory' },
};

// DPI (Density of Power Installed) limits by task tier (W/m²) - PROCEL 2021 reference
// Limites de DPI por nível de tarefa para tecnologias fluorescente e LED
const DPI_LIMITS: Record<TaskType, [number, number]> = {
    // [fluorescent, LED]
    storage_inactive: [4, 2],
    storage_active: [6, 3],
    rough_work: [8, 4],
    medium_work: [10, 5],
    fine_work: [12, 6],
    precision_work: [16, 8],
    very_fine_work: [20, 10],
    extra_fine_work: [25, 12],
    office_general: [12, 6],
    drawing_office: [16, 8],
    inspection_general: [12, 6],
    inspection_fine: [20, 10],
    laboratory: [14, 7],
};

/**
 * Calculate maintained illuminance (Em) from grid measurements.
 * Calcula a iluminância média mantida a partir de uma grade de medições (lux).
 *
 * Standard: ABNT NBR ISO/CIE 8995-1:2013 §5.3 (método da grade uniforme)
 *
 * @param {number[]} measurements - array of illuminance readings in lux
 * @returns {{ em: number, eMin: number, eMax: number, uniformity: number }}
 */
export function calculateMaintainedIlluminance(measurements: number[]): {
    em: number;
    eMin: number;
    eMax: number;
    uniformity: number;
} {
    if (!Array.isArray(measurements) || measurements.length === 0) {
        throw new TypeError('measurements must be a non-empty array');
    }
    for (const v of measurements) {
        if (typeof v !== 'number' || !isFinite(v) || v < 0) {
            throw new RangeError(`Each measurement must be a finite non-negative number, got: ${v}`);
        }
    }
    const eMin = Math.min(...measurements);
    const eMax = Math.max(...measurements);
    const em = measurements.reduce((s, v) => s + v, 0) / measurements.length;
    // Uniformidade U0 = Emin / Em (ISO/CIE 8995-1:2002 §4.3)
    const uniformity = em > 0 ? eMin / em : 0;
    return {
        em: Math.round(em * 10) / 10,
        eMin,
        eMax,
        uniformity: Math.round(uniformity * 1000) / 1000,
    };
}

/**
 * Check lighting compliance against ABNT NBR ISO/CIE 8995-1:2013 requirements.
 * Verifica conformidade da instalação de iluminação com a norma para o tipo de tarefa.
 *
 * @param {Object} opts
 * @param {TaskType} opts.taskType        - task type identifier
 * @param {number}   opts.em              - measured maintained illuminance (lux)
 * @param {number}   opts.uniformity      - measured uniformity U0 (0–1)
 * @param {number}   opts.ra              - measured colour rendering index Ra (0–100)
 * @returns {{ compliant: boolean, issues: string[], requirements: Object }}
 */
export function checkLightingCompliance({
    taskType,
    em,
    uniformity,
    ra,
}: {
    taskType: TaskType;
    em: number;
    uniformity: number;
    ra: number;
}): { compliant: boolean; issues: string[]; requirements: Record<string, unknown> } {
    if (!TASK_REQUIREMENTS[taskType]) {
        throw new TypeError(`Unknown taskType: "${taskType}". Valid: ${Object.keys(TASK_REQUIREMENTS).join(', ')}`);
    }
    for (const [n, v] of [
        ['em', em],
        ['uniformity', uniformity],
        ['ra', ra],
    ] as [string, number][]) {
        if (typeof v !== 'number' || !isFinite(v)) {
            throw new TypeError(`"${n}" must be a finite number, got: ${v}`);
        }
    }
    if (uniformity < 0 || uniformity > 1) throw new RangeError(`uniformity must be in [0, 1], got: ${uniformity}`);
    if (ra < 0 || ra > 100) throw new RangeError(`ra must be in [0, 100], got: ${ra}`);

    const req = TASK_REQUIREMENTS[taskType];
    const issues: string[] = [];

    // ABNT NBR ISO/CIE 8995-1:2013 §4.2: Em >= Emín da tabela
    if (em < req.emMin) {
        issues.push(`Insufficient illuminance: ${em} lx < required ${req.emMin} lx`);
    }
    // §4.3: U0 >= 0.60 para maioria das tarefas (mín aceitável)
    const u0Min = 0.6;
    if (uniformity < u0Min) {
        issues.push(`Poor uniformity: U0=${uniformity.toFixed(3)} < min ${u0Min}`);
    }
    // §4.4: Ra >= valor mínimo por tarefa
    if (ra < req.raMin) {
        issues.push(`Inadequate colour rendering: Ra=${ra} < required Ra=${req.raMin}`);
    }

    return {
        compliant: issues.length === 0,
        issues,
        requirements: { emMin: req.emMin, u0Min, raMin: req.raMin, label: req.label },
    };
}

/**
 * Calculate Density of Power Installed (DPI) and evaluate against PROCEL limits.
 * Calcula a Densidade de Potência Instalada (DPI) e verifica conformidade com PROCEL.
 *
 * @param {Object} opts
 * @param {TaskType} opts.taskType        - task type
 * @param {number}   opts.totalPowerW     - total installed lighting power (W)
 * @param {number}   opts.areaM2          - room/zone area (m²)
 * @param {'fluorescent'|'led'} opts.technology - lamp technology
 * @returns {{ dpi: number, limitW_m2: number, compliant: boolean, excessPercent: number }}
 */
export function calculateDPI({
    taskType,
    totalPowerW,
    areaM2,
    technology = 'led',
}: {
    taskType: TaskType;
    totalPowerW: number;
    areaM2: number;
    technology?: 'fluorescent' | 'led';
}): { dpi: number; limitW_m2: number; compliant: boolean; excessPercent: number } {
    if (!TASK_REQUIREMENTS[taskType]) {
        throw new TypeError(`Unknown taskType: "${taskType}"`);
    }
    if (typeof totalPowerW !== 'number' || !isFinite(totalPowerW) || totalPowerW < 0) {
        throw new RangeError(`totalPowerW must be a finite non-negative number, got: ${totalPowerW}`);
    }
    if (typeof areaM2 !== 'number' || !isFinite(areaM2) || areaM2 <= 0) {
        throw new RangeError(`areaM2 must be a finite positive number, got: ${areaM2}`);
    }
    if (technology !== 'fluorescent' && technology !== 'led') {
        throw new TypeError(`technology must be "fluorescent" or "led", got: "${technology}"`);
    }

    const dpi = totalPowerW / areaM2;
    const [fluorLimit, ledLimit] = DPI_LIMITS[taskType];
    const limitW_m2 = technology === 'led' ? ledLimit : fluorLimit;
    const compliant = dpi <= limitW_m2;
    const excessPercent = compliant ? 0 : Math.round(((dpi - limitW_m2) / limitW_m2) * 1000) / 10;

    return {
        dpi: Math.round(dpi * 100) / 100,
        limitW_m2,
        compliant,
        excessPercent,
    };
}

/**
 * Estimate potential energy savings from replacing existing lamps with LED.
 * Estima a economia energética potencial com substituição de luminárias por LED.
 *
 * @param {Object} opts
 * @param {number} opts.currentPowerW       - current total power (W)
 * @param {number} opts.operatingHoursYear  - annual operating hours
 * @param {number} opts.ledEfficacyLmW      - LED luminous efficacy (lm/W), default 120
 * @param {number} opts.currentEfficacyLmW  - current lamp efficacy (lm/W), default 50 (fluorescent T8)
 * @param {number} opts.energyCostKWh       - energy cost (R$/kWh)
 * @returns {{ savedKWh: number, savedBRL: number, ledPowerW: number, savingsPercent: number }}
 */
export function estimateLEDSavings({
    currentPowerW,
    operatingHoursYear,
    ledEfficacyLmW = 120,
    currentEfficacyLmW = 50,
    energyCostKWh,
}: {
    currentPowerW: number;
    operatingHoursYear: number;
    ledEfficacyLmW?: number;
    currentEfficacyLmW?: number;
    energyCostKWh: number;
}): { savedKWh: number; savedBRL: number; ledPowerW: number; savingsPercent: number } {
    for (const [n, v] of [
        ['currentPowerW', currentPowerW],
        ['operatingHoursYear', operatingHoursYear],
        ['ledEfficacyLmW', ledEfficacyLmW],
        ['currentEfficacyLmW', currentEfficacyLmW],
        ['energyCostKWh', energyCostKWh],
    ] as [string, number][]) {
        if (typeof v !== 'number' || !isFinite(v) || v <= 0) {
            throw new RangeError(`"${n}" must be a finite positive number, got: ${v}`);
        }
    }

    // Potência LED para mesma quantidade de lúmens totais
    const ledPowerW = currentPowerW * (currentEfficacyLmW / ledEfficacyLmW);
    const savedW = currentPowerW - ledPowerW;
    const savedKWh = (savedW / 1000) * operatingHoursYear;
    const savedBRL = savedKWh * energyCostKWh;
    const savingsPercent = Math.round((savedW / currentPowerW) * 1000) / 10;

    return {
        ledPowerW: Math.round(ledPowerW * 10) / 10,
        savedKWh: Math.round(savedKWh * 10) / 10,
        savedBRL: Math.round(savedBRL * 100) / 100,
        savingsPercent,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialLightingEnergyAuditMeta: AnalyticsModuleMeta = {
    name: 'industrialLightingEnergyAudit',
    description: 'industrialLightingEnergyAudit',
    category: 'analytics',
    familyTags: ['industrial', 'energy'],
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
