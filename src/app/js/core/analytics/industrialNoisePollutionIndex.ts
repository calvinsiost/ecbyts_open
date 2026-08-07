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
 * Industrial Noise Pollution Index Module
 *
 * Cálculo de índices de poluição sonora industrial com base em normas internacionais e brasileiras.
 *
 * References:
 * - ISO 1996-2:2017 - Acoustics: Description, measurement and assessment of environmental noise.
 *   https://www.iso.org/standard/59766.html
 * - ABNT NBR 10151:2019 - Avaliação do ruído em áreas habitadas.
 *   https://www.abntcatalogo.com.br/norma.aspx?ID=396213
 * - WHO (2018). Environmental Noise Guidelines for the European Region.
 *   https://apps.who.int/iris/handle/10665/279952
 * - European Directive 2002/49/EC on Environmental Noise (LDEN framework).
 *   https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32002L0049
 * - Miedema, H.M.E. & Oudshoorn, C.G.M. (2001). Annoyance from transportation noise.
 *   Environmental Health Perspectives, 109(4), 409–416. doi:10.1289/ehp.01109409
 *
 * @module industrialNoisePollutionIndex
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

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * NBR 10151:2019 noise limits by zone type (dB(A)).
 * Limites de ruído por tipo de zona conforme ABNT NBR 10151:2019 (Tabela 1).
 * Valores de LAeq em dB(A) para áreas externas.
 */
const NBR10151_LIMITS_DB: Record<string, { diurnal: number; nocturnal: number }> = {
    residential_urban: { diurnal: 55, nocturnal: 45 },
    residential_rural: { diurnal: 50, nocturnal: 40 },
    mixed_commercial: { diurnal: 65, nocturnal: 55 },
    industrial: { diurnal: 70, nocturnal: 60 },
    hospital: { diurnal: 45, nocturnal: 35 },
    recreational: { diurnal: 65, nocturnal: 55 },
};

/**
 * WHO 2018 recommended Lnight limits for outdoor areas (dB(A)).
 * Valores recomendados pela OMS para ruído noturno em áreas externas.
 */
const WHO_LNIGHT_LIMITS_DB = {
    residential: 40, // recommendation for health protection
    industrial: 55, // área industrial (less restrictive)
};

/**
 * LDEN penalty factors (hours and penalty in dB).
 * Ponderações horárias e penalidades do índice LDEN (Diretiva Europeia 2002/49/EC).
 */
const LDEN_CONFIG = {
    DAY_HOURS: 12, // 07:00–19:00
    EVENING_HOURS: 4, // 19:00–23:00
    NIGHT_HOURS: 8, // 23:00–07:00
    EVENING_PENALTY_DB: 5,
    NIGHT_PENALTY_DB: 10,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Validates that a value is a finite number.
 * Valida que o valor é um número finito.
 * @param {*} v @param {string} name
 */
function requireFinite(v: unknown, name: string): void {
    if (typeof v !== 'number' || !isFinite(v)) {
        throw new TypeError(`${name} must be a finite number, got: ${v}`);
    }
}

/**
 * Validates that a sound level is in a physically plausible range (0–200 dB).
 * Valida que o nível sonoro está em faixa plausível (0–200 dB).
 * @param {*} v @param {string} name
 */
function requireSoundLevel(v: unknown, name: string): void {
    requireFinite(v, name);
    if ((v as number) < 0 || (v as number) > 200) {
        throw new RangeError(`${name} must be between 0 and 200 dB, got: ${v}`);
    }
}

/**
 * Energy-average (Leq) of multiple sound level measurements.
 * Média energética (Leq) de múltiplas medições de nível sonoro.
 * Leq = 10 × log10(1/N × Σ 10^(Li/10))
 * @param {number[]} levelsDb @returns {number}
 */
function energyAverage(levelsDb: number[]): number {
    if (levelsDb.length === 0) return -Infinity;
    const sum = levelsDb.reduce((acc, L) => acc + Math.pow(10, L / 10), 0);
    return 10 * Math.log10(sum / levelsDb.length);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Calculates Leq diurnal and nocturnal from time-series SPL measurements.
 * Calcula o Leq diurno e noturno a partir de medições de NPS em série temporal.
 *
 * Leq = 10 × log10(1/N × Σ 10^(Li/10))  [ISO 1996-2:2017, Eq. 3.1]
 *
 * @param {number[]} diurnalMeasurementsDb - Medições no período diurno (dB(A))
 * @param {number[]} nocturnalMeasurementsDb - Medições no período noturno (dB(A))
 * @returns {{ leqDiurnalDb: number, leqNocturnalDb: number }}
 */
export function calculateLeq(
    diurnalMeasurementsDb: number[],
    nocturnalMeasurementsDb: number[],
): { leqDiurnalDb: number; leqNocturnalDb: number } {
    if (!Array.isArray(diurnalMeasurementsDb) || diurnalMeasurementsDb.length === 0) {
        throw new TypeError('diurnalMeasurementsDb must be a non-empty array');
    }
    if (!Array.isArray(nocturnalMeasurementsDb) || nocturnalMeasurementsDb.length === 0) {
        throw new TypeError('nocturnalMeasurementsDb must be a non-empty array');
    }
    diurnalMeasurementsDb.forEach((v, i) => requireSoundLevel(v, `diurnalMeasurementsDb[${i}]`));
    nocturnalMeasurementsDb.forEach((v, i) => requireSoundLevel(v, `nocturnalMeasurementsDb[${i}]`));

    return {
        leqDiurnalDb: energyAverage(diurnalMeasurementsDb),
        leqNocturnalDb: energyAverage(nocturnalMeasurementsDb),
    };
}

/**
 * Calculates Ldn (Day-Night Level) from diurnal and nocturnal Leq.
 * Calcula o Ldn (Nível Dia-Noite) a partir do Leq diurno e noturno.
 *
 * Ldn = 10 × log10((15/24 × 10^(Ld/10)) + (9/24 × 10^((Ln+10)/10)))
 * Período diurno: 07:00–22:00 (15h); noturno: 22:00–07:00 (9h) [US EPA 1974].
 *
 * @param {number} leqDiurnalDb - Leq diurno (dB(A)), período 07:00–22:00
 * @param {number} leqNocturnalDb - Leq noturno (dB(A)), período 22:00–07:00
 * @returns {{ ldnDb: number, leqDiurnalDb: number, leqNocturnalDb: number }}
 */
export function calculateLdn(
    leqDiurnalDb: number,
    leqNocturnalDb: number,
): { ldnDb: number; leqDiurnalDb: number; leqNocturnalDb: number } {
    requireSoundLevel(leqDiurnalDb, 'leqDiurnalDb');
    requireSoundLevel(leqNocturnalDb, 'leqNocturnalDb');

    // Ldn = 10 × log10((15/24 × 10^(Ld/10)) + (9/24 × 10^((Ln+10)/10)))
    const dayEnergy = (15 / 24) * Math.pow(10, leqDiurnalDb / 10);
    const nightEnergy = (9 / 24) * Math.pow(10, (leqNocturnalDb + 10) / 10);
    const ldnDb = 10 * Math.log10(dayEnergy + nightEnergy);

    return { ldnDb, leqDiurnalDb, leqNocturnalDb };
}

/**
 * Calculates LDEN (Day-Evening-Night Level) as per European Directive 2002/49/EC.
 * Calcula o LDEN (Nível Dia-Tarde-Noite) conforme Diretiva Europeia 2002/49/EC.
 *
 * LDEN = 10 × log10((12/24 × 10^(Ld/10)) + (4/24 × 10^((Le+5)/10)) + (8/24 × 10^((Ln+10)/10)))
 *
 * @param {number} leqDayDb - Leq diurno - dia 07:00–19:00 (dB(A))
 * @param {number} leqEveningDb - Leq entardecer - tarde 19:00–23:00 (dB(A))
 * @param {number} leqNightDb - Leq noturno - noite 23:00–07:00 (dB(A))
 * @returns {{ ldenDb: number, leqDayDb: number, leqEveningDb: number, leqNightDb: number }}
 */
export function calculateLden(
    leqDayDb: number,
    leqEveningDb: number,
    leqNightDb: number,
): { ldenDb: number; leqDayDb: number; leqEveningDb: number; leqNightDb: number } {
    requireSoundLevel(leqDayDb, 'leqDayDb');
    requireSoundLevel(leqEveningDb, 'leqEveningDb');
    requireSoundLevel(leqNightDb, 'leqNightDb');

    const c = LDEN_CONFIG;
    const dayEnergy = (c.DAY_HOURS / 24) * Math.pow(10, leqDayDb / 10);
    const eveningEnergy = (c.EVENING_HOURS / 24) * Math.pow(10, (leqEveningDb + c.EVENING_PENALTY_DB) / 10);
    const nightEnergy = (c.NIGHT_HOURS / 24) * Math.pow(10, (leqNightDb + c.NIGHT_PENALTY_DB) / 10);

    const ldenDb = 10 * Math.log10(dayEnergy + eveningEnergy + nightEnergy);

    return { ldenDb, leqDayDb, leqEveningDb, leqNightDb };
}

/**
 * Checks noise limit exceedances against NBR 10151:2019 and WHO 2018 guidelines.
 * Verifica a excedência dos limites de ruído conforme NBR 10151:2019 e OMS 2018.
 *
 * @param {number} leqDiurnalDb - Leq diurno medido (dB(A))
 * @param {number} leqNocturnalDb - Leq noturno medido (dB(A))
 * @param {'residential_urban'|'residential_rural'|'mixed_commercial'|'industrial'|'hospital'|'recreational'} zoneType - Tipo de zona
 * @returns {{ diurnalExceedanceDb: number, nocturnalExceedanceDb: number, nbrCompliant: boolean, whoNightCompliant: boolean, exceedanceClass: string }}
 */
export function checkLimitExceedances(
    leqDiurnalDb: number,
    leqNocturnalDb: number,
    zoneType: 'residential_urban' | 'residential_rural' | 'mixed_commercial' | 'industrial' | 'hospital' | 'recreational',
): {
    diurnalExceedanceDb: number;
    nocturnalExceedanceDb: number;
    nbrCompliant: boolean;
    whoNightCompliant: boolean;
    exceedanceClass: string;
} {
    requireSoundLevel(leqDiurnalDb, 'leqDiurnalDb');
    requireSoundLevel(leqNocturnalDb, 'leqNocturnalDb');
    if (!NBR10151_LIMITS_DB[zoneType]) {
        throw new TypeError(`zoneType must be one of: ${Object.keys(NBR10151_LIMITS_DB).join(', ')}`);
    }

    const limits = NBR10151_LIMITS_DB[zoneType]!;
    const diurnalExceedanceDb = leqDiurnalDb - limits.diurnal;
    const nocturnalExceedanceDb = leqNocturnalDb - limits.nocturnal;
    const nbrCompliant = diurnalExceedanceDb <= 0 && nocturnalExceedanceDb <= 0;

    // WHO Lnight: usar o limite noturno mais restritivo aplicável
    const whoLimit = zoneType === 'industrial' ? WHO_LNIGHT_LIMITS_DB.industrial : WHO_LNIGHT_LIMITS_DB.residential;
    const whoNightCompliant = leqNocturnalDb <= whoLimit;

    // Classificação de excedência: máxima excedência entre os dois períodos
    const maxExceedance = Math.max(diurnalExceedanceDb, nocturnalExceedanceDb);
    let exceedanceClass: string;
    if (maxExceedance <= 0) exceedanceClass = 'compliant';
    else if (maxExceedance <= 3)
        exceedanceClass = 'minor'; // até 3 dB acima do limite
    else if (maxExceedance <= 10)
        exceedanceClass = 'moderate'; // 3–10 dB acima
    else exceedanceClass = 'severe'; // mais de 10 dB acima

    return { diurnalExceedanceDb, nocturnalExceedanceDb, nbrCompliant, whoNightCompliant, exceedanceClass };
}

/**
 * Computes composite noise annoyance index using Miedema & Oudshoorn (2001) dose-response.
 * Calcula o índice composto de incomodidade sonora usando resposta de dose de Miedema (2001).
 *
 * %HA (Highly Annoyed) = a × Lden³ + b × Lden² + c × Lden + d  (industrial noise coefficients)
 * Referência: Miedema & Oudshoorn (2001), Table 3 - industrial noise.
 *
 * @param {number} ldenDb - Nível LDEN (dB(A))
 * @param {number} exposedPopulation - População exposta ao LDEN calculado
 * @returns {{ percentHighlyAnnoyed: number, affectedPersons: number, annoyanceClass: string }}
 */
export function computeAnnoyanceIndex(
    ldenDb: number,
    exposedPopulation: number,
): { percentHighlyAnnoyed: number; affectedPersons: number; annoyanceClass: string } {
    requireSoundLevel(ldenDb, 'ldenDb');
    if (typeof exposedPopulation !== 'number' || !isFinite(exposedPopulation) || exposedPopulation < 0) {
        throw new RangeError('exposedPopulation must be a non-negative finite number');
    }

    // Coeficientes para ruído industrial (Miedema & Oudshoorn 2001, Table 3)
    // %HA = a × (Lden-42)³ + b × (Lden-42)² + c × (Lden-42)
    const L = ldenDb - 42; // deslocamento de referência
    const percentHighlyAnnoyed = Math.min(
        100,
        Math.max(0, 0.000009018 * Math.pow(L, 3) + 0.002461 * Math.pow(L, 2) + 0.2116 * L),
    );

    const affectedPersons = Math.round((percentHighlyAnnoyed / 100) * exposedPopulation);

    let annoyanceClass: string;
    if (percentHighlyAnnoyed < 5) annoyanceClass = 'low';
    else if (percentHighlyAnnoyed < 15) annoyanceClass = 'moderate';
    else if (percentHighlyAnnoyed < 30) annoyanceClass = 'high';
    else annoyanceClass = 'severe';

    return { percentHighlyAnnoyed, affectedPersons, annoyanceClass };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const industrialNoisePollutionIndexMeta: AnalyticsModuleMeta = {
    name: 'industrialNoisePollutionIndex',
    description: 'industrialNoisePollutionIndex',
    category: 'analytics',
    familyTags: ['industrial', 'noise'],
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
