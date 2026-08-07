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
 * Industrial Noise Mapping - Mapeamento de ruído industrial
 *
 * Implements the ISO 9613-2:1996 outdoor noise propagation model for
 * industrial point sources, including geometric spreading, atmospheric
 * absorption, and barrier/berm attenuation.
 *
 * Academic references:
 * - ISO 9613-2:1996. Acoustics - Attenuation of sound during propagation
 *   outdoors. Part 2: General method of calculation. ISO, Geneva.
 * - Maekawa, Z. (1968). Noise reduction by screens. Applied Acoustics 1(3):157-173.
 *   DOI: 10.1016/0003-682X(68)90020-0
 * - Bass, H.E. et al. (1995). Atmospheric absorption of sound: Further developments.
 *   JASA 97(1):680-683. DOI: 10.1121/1.412989
 * - CONAMA Resolução 001/1990 e 002/1990 - limites brasileiros de ruído ambiental.
 * - ABNT NBR 10151:2019 - Acústica - Avaliação do ruído em áreas habitadas.
 *
 * Zero DOM/IDB/Three.js/fetch dependencies. Pure math functions only.
 *
 * @module industrialNoiseMapping
 */

/** Velocidade do som no ar a 20°C, 1 atm (m/s) */
const SPEED_OF_SOUND = 343.0;

/**
 * Geometric spreading attenuation (Adiv) - Atenuação por divergência geométrica.
 * Para fonte pontual: Adiv = 20 * log10(d/d0) + 11 dB (ISO 9613-2 Eq. 8)
 * d0 = 1 m (distância de referência)
 *
 * @param {number} distanceM - Distância fonte-receptor (m), > 0
 * @returns {number} Adiv (dB) - atenuação por divergência
 */
function geometricSpreadingAttenuation(distanceM: number): number {
    if (typeof distanceM !== 'number' || !isFinite(distanceM)) {
        throw new TypeError('distanceM must be a finite number');
    }
    if (distanceM <= 0) throw new RangeError('distanceM must be > 0 m');

    // ISO 9613-2 Eq. 8: Adiv = 20*log10(d) + 11 dB para fonte pontual em campo livre
    return 20 * Math.log10(distanceM) + 11;
}

/**
 * Atmospheric absorption attenuation (Aatm) - Atenuação atmosférica.
 * ISO 9613-2 Eq. 9: Aatm = alpha * d / 1000 (dB)
 * onde alpha é o coeficiente de absorção atmosférica (dB/km).
 *
 * Coeficientes típicos (ISO 9613-1, T=20°C, RH=70%, P=101.3 kPa):
 *  125 Hz: 0.4 dB/km; 250 Hz: 1.0; 500 Hz: 1.9; 1k Hz: 3.7; 2k Hz: 9.7; 4k Hz: 32.8
 *
 * @param {number} distanceM   - Distância (m), > 0
 * @param {number} alphaDbKm   - Coeficiente de absorção (dB/km), > 0
 * @returns {number} Aatm (dB)
 */
function atmosphericAbsorptionAttenuation(distanceM: number, alphaDbKm: number): number {
    if ([distanceM, alphaDbKm].some((v) => typeof v !== 'number' || !isFinite(v))) {
        throw new TypeError('distanceM and alphaDbKm must be finite numbers');
    }
    if (distanceM <= 0) throw new RangeError('distanceM must be > 0 m');
    if (alphaDbKm <= 0) throw new RangeError('alphaDbKm must be > 0 dB/km');

    return (alphaDbKm * distanceM) / 1000;
}

/**
 * Barrier/berm attenuation (Abar) - Atenuação por obstáculo (barreira/berma).
 * Método de Maekawa (1968) conforme ISO 9613-2 Annex A.
 * Abar = 10 * log10(3 + 20 * N) dB, onde N = numero de Fresnel.
 * N = ±2 * delta / lambda; delta = caminho difratado - caminho direto (m)
 * Sinal positivo quando barreira intercepta linha de visão (N > 0).
 *
 * @param {number} deltaM    - Diferença de caminho (m): delta = (S-T) + (T-R) - (S-R)
 *                            S=fonte, T=topo barreira, R=receptor
 *                            Positivo quando barreira obstrui linha de visão
 * @param {number} freqHz    - Frequência central da banda de oitava (Hz), > 0
 * @returns {number} Abar (dB) - limitado a 0 dB mínimo (sem amplificação)
 */
function barrierAttenuation(deltaM: number, freqHz: number): number {
    if ([deltaM, freqHz].some((v) => typeof v !== 'number' || !isFinite(v))) {
        throw new TypeError('deltaM and freqHz must be finite numbers');
    }
    if (freqHz <= 0) throw new RangeError('freqHz must be > 0 Hz');

    const lambda = SPEED_OF_SOUND / freqHz;
    const N = (2 * deltaM) / lambda;

    // Maekawa (1968): Abar = 10*log10(3 + 20*N)
    // Quando N < -0.3 (fonte/receptor do mesmo lado + visão livre), Abar = 0
    if (N < -0.3) return 0;

    const Abar = 10 * Math.log10(3 + 20 * Math.max(0, N));
    // Sem amplificação abaixo de 0 dB; máximo prático ~20 dB (ISO 9613-2 §7.3)
    return Math.min(Math.max(0, Abar), 20);
}

/**
 * Sound pressure level at receiver - Nível de pressão sonora no receptor Lp(r).
 * ISO 9613-2 Eq. 4: Lp = Lw + Dc - A
 * Onde: A = Adiv + Aatm + Abar (atenuações somadas)
 *       Dc = correção direcional da fonte (0 dB para fonte omnidirecional)
 *
 * @param {object} params
 * @param {number} params.Lw          - Nível de potência sonora da fonte (dB re 1pW), qualquer valor finito
 * @param {number} params.distanceM   - Distância fonte-receptor (m), > 0
 * @param {number} params.alphaDbKm   - Absorção atmosférica (dB/km), > 0
 * @param {number} params.deltaBarrierM- Diferença de caminho na barreira (m); 0 = sem barreira
 * @param {number} params.freqHz      - Frequência (Hz), > 0 (usado para Abar e Aatm)
 * @param {number} [params.Dc=0]      - Correção direcional (dB), default 0
 * @returns {{ Lp: number, Adiv: number, Aatm: number, Abar: number, A_total: number }}
 */
function computeSoundPressureLevel({
    Lw,
    distanceM,
    alphaDbKm,
    deltaBarrierM,
    freqHz,
    Dc = 0,
}: {
    Lw: number;
    distanceM: number;
    alphaDbKm: number;
    deltaBarrierM: number;
    freqHz: number;
    Dc?: number;
}): { Lp: number; Adiv: number; Aatm: number; Abar: number; A_total: number } {
    const required = [Lw, distanceM, alphaDbKm, deltaBarrierM, freqHz];
    if (required.some((v) => typeof v !== 'number' || !isFinite(v))) {
        throw new TypeError('All parameters must be finite numbers');
    }
    if (distanceM <= 0) throw new RangeError('distanceM must be > 0 m');
    if (alphaDbKm <= 0) throw new RangeError('alphaDbKm must be > 0 dB/km');
    if (freqHz <= 0) throw new RangeError('freqHz must be > 0 Hz');

    const Adiv = geometricSpreadingAttenuation(distanceM);
    const Aatm = atmosphericAbsorptionAttenuation(distanceM, alphaDbKm);
    const Abar = barrierAttenuation(deltaBarrierM, freqHz);
    const A_total = Adiv + Aatm + Abar;
    const Lp = Lw + Dc - A_total;

    return { Lp, Adiv, Aatm, Abar, A_total };
}

/**
 * Combine sound levels from multiple sources - Combinação de níveis sonoros.
 * Lei da adição energética: Lp_total = 10 * log10(sum(10^(Lpi/10)))
 *
 * @param {number[]} levels - Array de níveis de pressão sonora (dB)
 * @returns {number} Nível resultante combinado (dB)
 */
function combineSoundLevels(levels: number[]): number {
    if (!Array.isArray(levels) || levels.length === 0) {
        throw new TypeError('levels must be a non-empty array');
    }
    for (const L of levels) {
        if (typeof L !== 'number' || !isFinite(L)) {
            throw new TypeError('Each level must be a finite number');
        }
    }
    const sum = levels.reduce((s, L) => s + Math.pow(10, L / 10), 0);
    return 10 * Math.log10(sum);
}

/**
 * Noise compliance classification (ABNT NBR 10151:2019 / CONAMA 001/1990).
 * Classifica conformidade do nível medido frente ao limite regulatório.
 *
 * @param {number} measuredLp  - Nível medido no receptor (dB(A))
 * @param {number} limitDb     - Limite regulatório aplicável (dB(A))
 * @returns {{ exceedance: number, compliant: boolean, category: string }}
 *   exceedance - superação (dB); negativo = abaixo do limite
 *   compliant  - verdadeiro se measuredLp <= limitDb
 *   category   - 'compliant' | 'marginal' | 'non_compliant' | 'severely_non_compliant'
 */
function noiseComplianceClassification(
    measuredLp: number,
    limitDb: number,
): { exceedance: number; compliant: boolean; category: string } {
    if ([measuredLp, limitDb].some((v) => typeof v !== 'number' || !isFinite(v))) {
        throw new TypeError('measuredLp and limitDb must be finite numbers');
    }

    const exceedance = measuredLp - limitDb;
    const compliant = exceedance <= 0;

    let category: string;
    if (exceedance <= 0) {
        category = 'compliant';
    } else if (exceedance <= 3) {
        category = 'marginal';
    } else if (exceedance <= 10) {
        category = 'non_compliant';
    } else {
        category = 'severely_non_compliant';
    }

    return { exceedance, compliant, category };
}

export {
    SPEED_OF_SOUND,
    geometricSpreadingAttenuation,
    atmosphericAbsorptionAttenuation,
    barrierAttenuation,
    computeSoundPressureLevel,
    combineSoundLevels,
    noiseComplianceClassification,
};

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const industrialNoiseMappingMeta = {
    name: 'industrialNoiseMapping',
    description: 'industrialNoiseMapping',
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
