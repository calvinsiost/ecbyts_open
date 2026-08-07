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
 * Noise Exposure Model - avaliação de exposição ocupacional e comunitária ao ruído
 *
 * Referências normativas e acadêmicas:
 * - ISO 1996-1:2016 - Acoustics: Description, measurement and assessment of environmental noise
 * - NR-15 ABNT/MTE - Atividades e Operações Insalubres (Brasil)
 * - Directive 2002/49/EC - Assessment and management of environmental noise (EU END)
 * - Berglund, B. et al. (1999) Guidelines for Community Noise. WHO. ISBN:9241545127
 */

/**
 * Calcula o nível de pressão sonora contínuo equivalente (Leq) a partir de múltiplas
 * amostras de nível e seus respectivos tempos de exposição. (ISO 1996-1:2016)
 * Leq = 10 × log10( Σ(10^(Li/10) × ti) / T )
 *
 * @param {number[]} levels_dB - Array de níveis de pressão sonora (dB), cada valor deve ser ≥ 0
 * @param {number[]} durations_h - Array de durações de exposição (horas), cada valor deve ser > 0
 * @returns {{ Leq_dB: number }} Nível contínuo equivalente em dB
 * @throws {TypeError} Se os parâmetros não forem arrays de números finitos
 * @throws {RangeError} Se os arrays tiverem comprimentos diferentes ou forem vazios, ou se valores fora de range
 */
export function computeEquivalentContinuousLevel(levels_dB: any, durations_h: any) {
    if (!Array.isArray(levels_dB) || !Array.isArray(durations_h)) {
        throw new TypeError('computeEquivalentContinuousLevel: levels_dB e durations_h devem ser arrays');
    }
    if (levels_dB.length === 0 || durations_h.length === 0) {
        throw new RangeError('computeEquivalentContinuousLevel: arrays não podem ser vazios');
    }
    if (levels_dB.length !== durations_h.length) {
        throw new RangeError('computeEquivalentContinuousLevel: arrays devem ter o mesmo comprimento');
    }

    let energySum = 0;
    let totalTime = 0;

    for (let i = 0; i < levels_dB.length; i++) {
        const L = levels_dB[i];
        const t = durations_h[i];
        if (typeof L !== 'number' || !isFinite(L)) {
            throw new TypeError(`levels_dB[${i}] deve ser um número finito`);
        }
        if (typeof t !== 'number' || !isFinite(t) || t <= 0) {
            throw new RangeError(`durations_h[${i}] deve ser um número finito > 0`);
        }
        if (L < 0) throw new RangeError(`levels_dB[${i}] deve ser ≥ 0 dB`);

        // Energia proporcional: 10^(L/10) × duração
        energySum += Math.pow(10, L / 10) * t;
        totalTime += t;
    }

    const Leq_dB = 10 * Math.log10(energySum / totalTime);
    return { Leq_dB };
}

/**
 * Calcula a exposição diária ao ruído (LEX,8h) e a dose percentual de exposição
 * conforme NR-15 ABNT/MTE e ISO 9612:2009.
 * LEX = Leq + 10×log10(Te/8) onde Te é o tempo de exposição em horas.
 * Dose = 100 × 10^((LEX - 85) / 10)
 *
 * @param {number} Leq_dB - Nível contínuo equivalente durante a jornada (dB), deve ser ≥ 0
 * @param {number} exposure_h - Duração da exposição ao nível Leq (horas), deve estar em (0, 24]
 * @returns {{ LEX_dB: number, dose_pct: number }} Exposição diária e dose percentual
 * @throws {TypeError} Se qualquer parâmetro não for número finito
 * @throws {RangeError} Se Leq < 0 ou exposure_h fora de (0, 24]
 */
export function computeDailyNoiseExposure(Leq_dB: any, exposure_h: any) {
    if (typeof Leq_dB !== 'number' || !isFinite(Leq_dB) || typeof exposure_h !== 'number' || !isFinite(exposure_h)) {
        throw new TypeError('computeDailyNoiseExposure: todos os parâmetros devem ser números finitos');
    }
    if (Leq_dB < 0) throw new RangeError('Leq_dB deve ser ≥ 0');
    if (exposure_h <= 0 || exposure_h > 24) throw new RangeError('exposure_h deve estar em (0, 24] horas');

    // Normaliza para jornada de 8 horas (NR-15)
    const LEX_dB = Leq_dB + 10 * Math.log10(exposure_h / 8);

    // Dose percentual: 100% ao atingir LEX = 85 dB(A) em 8h (NR-15 limite de ação)
    const dose_pct = 100 * Math.pow(10, (LEX_dB - 85) / 10);

    return { LEX_dB, dose_pct };
}

/**
 * Calcula o Lden (Level day-evening-night) para avaliação de ruído comunitário,
 * conforme Diretiva Europeia 2002/49/EC (END - Environmental Noise Directive).
 * Penalidades: período noturno +10 dB, período da tarde +5 dB.
 * Lden = 10×log10( (13×10^(Ld/10) + 3×10^((Le+5)/10) + 8×10^((Ln+10)/10)) / 24 )
 *
 * @param {number} Lday_dB - Nível médio diurno (07h–19h, 13 horas), dB, deve ser ≥ 0
 * @param {number} Levening_dB - Nível médio vespertino (19h–23h, 3 horas + 5 dB), dB, deve ser ≥ 0
 * @param {number} Lnight_dB - Nível médio noturno (23h–07h, 8 horas + 10 dB), dB, deve ser ≥ 0
 * @returns {{ Lden_dB: number }} Nível dia-tarde-noite ponderado em dB
 * @throws {TypeError} Se qualquer parâmetro não for número finito
 * @throws {RangeError} Se qualquer nível for < 0
 */
export function computeCommunityNoiseLden(Lday_dB: any, Levening_dB: any, Lnight_dB: any) {
    if (
        typeof Lday_dB !== 'number' ||
        !isFinite(Lday_dB) ||
        typeof Levening_dB !== 'number' ||
        !isFinite(Levening_dB) ||
        typeof Lnight_dB !== 'number' ||
        !isFinite(Lnight_dB)
    ) {
        throw new TypeError('computeCommunityNoiseLden: todos os parâmetros devem ser números finitos');
    }
    if (Lday_dB < 0) throw new RangeError('Lday_dB deve ser ≥ 0');
    if (Levening_dB < 0) throw new RangeError('Levening_dB deve ser ≥ 0');
    if (Lnight_dB < 0) throw new RangeError('Lnight_dB deve ser ≥ 0');

    // Ponderação horária e penalidades conforme 2002/49/EC
    const day_energy = 13 * Math.pow(10, Lday_dB / 10);
    const evening_energy = 3 * Math.pow(10, (Levening_dB + 5) / 10);
    const night_energy = 8 * Math.pow(10, (Lnight_dB + 10) / 10);

    const Lden_dB = 10 * Math.log10((day_energy + evening_energy + night_energy) / 24);

    return { Lden_dB };
}

/**
 * Classifica o risco de exposição ao ruído ocupacional conforme NR-15 ABNT/MTE.
 * Limites de ação (80 dB) e limite de tolerância (85 dB) para jornada de 8h.
 * Exposição ≥ 90 dB(A) como LEX implica risco crítico (exposição proibida sem EPI eficaz).
 *
 * @param {number} LEX_dB - Exposição diária normalizada para 8h em dB(A)
 * @returns {{ risk: 'safe'|'caution'|'danger'|'critical' }} Classificação de risco
 * @throws {TypeError} Se LEX_dB não for número finito
 */
export function classifyNoiseExposureRisk(LEX_dB: any) {
    if (typeof LEX_dB !== 'number' || !isFinite(LEX_dB)) {
        throw new TypeError('classifyNoiseExposureRisk: LEX_dB deve ser um número finito');
    }

    // NR-15: ação em 80 dB(A), limite em 85 dB(A), crítico ≥ 90 dB(A)
    if (LEX_dB >= 90) return { risk: 'critical' };
    if (LEX_dB >= 85) return { risk: 'danger' };
    if (LEX_dB >= 80) return { risk: 'caution' };
    return { risk: 'safe' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const noiseExposureModelMeta = {
    name: 'noiseExposureModel',
    description: 'noiseExposureModel',
    category: 'analytics',
    familyTags: ['noise'],
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
