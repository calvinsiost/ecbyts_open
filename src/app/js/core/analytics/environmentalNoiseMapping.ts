// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Environmental Noise Mapping - Lden, annoyance prevalence, insulation and impact
// Mapeamento de Ruído Ambiental - Lden, prevalência de incômodo, isolamento e avaliação de impacto
//
// References / Referências:
//   EU Directive 2002/49/CE - Environmental Noise Directive (END)
//   WHO (2018) Environmental Noise Guidelines for the European Region
//   CONAMA Resolução 1/1990 - Critérios de padrões de emissão de ruídos
//   ABNT NBR 10151:2019 - Acústica: avaliação do ruído em áreas habitadas
//   ABNT NBR 10152:2017 - Acústica: níveis de pressão sonora em ambientes internos

'use strict';

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

/**
 * Compute Day-Evening-Night noise level (Lden) indicator.
 * Calcula o indicador de ruído Dia-Entardecer-Noite (Lden).
 *
 * Formula per EU Directive 2002/49/CE:
 * Lden = 10 × log10((12 × 10^(Lday/10) + 4 × 10^((Levening+5)/10) + 8 × 10^((Lnight+10)/10)) / 24)
 *
 * Penalty of +5 dB applied to evening (19h–23h) and +10 dB to night (23h–7h).
 * Penalidade de +5 dB aplicada ao entardecer (19h–23h) e +10 dB à noite (23h–7h).
 *
 * @param lday_dB - Daytime equivalent level in dB(A) / Nível equivalente diurno em dB(A)
 * @param levening_dB - Evening equivalent level in dB(A) / Nível equivalente entardecer em dB(A)
 * @param lnight_dB - Night-time equivalent level in dB(A) / Nível equivalente noturno em dB(A)
 */
export function computeLden(lday_dB: number, levening_dB: number, lnight_dB: number): { lden_dB: number } {
    if (typeof lday_dB !== 'number' || typeof levening_dB !== 'number' || typeof lnight_dB !== 'number') {
        throw new TypeError('All level parameters must be numbers / Todos os parâmetros de nível devem ser números');
    }
    if (lday_dB < 0) throw new RangeError('lday_dB must be >= 0');
    if (levening_dB < 0) throw new RangeError('levening_dB must be >= 0');
    if (lnight_dB < 0) throw new RangeError('lnight_dB must be >= 0');

    // Energias ponderadas conforme períodos do dia / Energy weighted by time periods
    const e_day = 12 * Math.pow(10, lday_dB / 10);
    const e_evening = 4 * Math.pow(10, (levening_dB + 5) / 10); // +5 dB penalidade
    const e_night = 8 * Math.pow(10, (lnight_dB + 10) / 10); // +10 dB penalidade

    const lden_dB = 10 * Math.log10((e_day + e_evening + e_night) / 24);

    return { lden_dB: Number(lden_dB.toFixed(1)) };
}

/**
 * Compute prevalence of highly annoyed (HA) and highly sleep-disturbed (HN) persons.
 * Calcula a prevalência de pessoas altamente incomodadas (HA) e altamente perturbadas no sono (HN).
 *
 * Dose-response functions from WHO (2018) Environmental Noise Guidelines.
 * Funções dose-resposta da OMS (2018) Environmental Noise Guidelines.
 *
 * Road traffic HA:       HA% = 100 / (1 + exp(11.341 - 0.1221 × Lden))  [WHO 2018]
 * Industrial HA:         HA% = 100 / (1 + exp(12.649 - 0.1345 × Lden))  [WHO 2018]
 * Rail HA:               HA% = 100 / (1 + exp(11.718 - 0.1165 × Lden))  [WHO 2018]
 * Aircraft HA:           HA% = 100 / (1 + exp(9.394 - 0.1106 × Lden))   [WHO 2018]
 * Night sleep disturbed: HN% = 100 / (1 + exp(6.297 - 0.1220 × Lnight)) approximated from Lden-3
 *
 * @param lden_dB - Day-evening-night level in dB(A) / Nível Lden em dB(A)
 * @param source_type - Noise source type / Tipo de fonte de ruído
 */
export function computeAnnoyancePrevalence(
    lden_dB: number,
    source_type: 'road' | 'rail' | 'air' | 'industrial',
): { ha_pct: number; hn_pct: number } {
    if (typeof lden_dB !== 'number') throw new TypeError('lden_dB must be a number');
    if (lden_dB < 0) throw new RangeError('lden_dB must be >= 0');
    const valid_sources = ['road', 'rail', 'air', 'industrial'];
    if (!valid_sources.includes(source_type)) {
        throw new TypeError(`source_type must be one of: ${valid_sources.join(', ')}`);
    }

    // Coeficientes da curva dose-resposta WHO (2018) / WHO (2018) dose-response curve coefficients
    const ha_coeffs: Record<string, number[]> = {
        road: [11.341, 0.1221],
        rail: [11.718, 0.1165],
        air: [9.394, 0.1106],
        industrial: [12.649, 0.1345],
    };

    const [a, b] = ha_coeffs[source_type]!;
    const ha_pct = 100 / (1 + Math.exp(a! - b! * lden_dB));

    // Perturbação do sono estimada a partir de Lnight ≈ Lden - 3 (aproximação nocturna)
    // Sleep disturbance estimated from Lnight ≈ Lden - 3 (nighttime approximation)
    const lnight_approx = lden_dB - 3;
    const hn_pct = 100 / (1 + Math.exp(6.297 - 0.122 * lnight_approx));

    return {
        ha_pct: Number(ha_pct.toFixed(1)),
        hn_pct: Number(hn_pct.toFixed(1)),
    };
}

/**
 * Compute indoor sound level after applying building insulation.
 * Calcula o nível sonoro interno após aplicar o isolamento acústico do edifício.
 *
 * Lp_indoor = Lp_source - Rw
 * sufficient: indoor level ≤ 45 dB(A) (NBR 10152:2017 class B residential)
 *
 * @param rw_dB - Weighted sound reduction index of facade in dB / Índice de redução sonora da fachada em dB
 * @param source_lp_dB - Outdoor sound pressure level in dB(A) / Nível de pressão sonora externo em dB(A)
 */
export function computeSoundInsulation(
    rw_dB: number,
    source_lp_dB: number,
): { indoor_lp_dB: number; sufficient: boolean } {
    if (typeof rw_dB !== 'number' || typeof source_lp_dB !== 'number') {
        throw new TypeError('rw_dB and source_lp_dB must be numbers');
    }
    if (rw_dB < 0) throw new RangeError('rw_dB must be >= 0');
    if (source_lp_dB < 0) throw new RangeError('source_lp_dB must be >= 0');

    // Nível interno após redução da fachada / Indoor level after facade reduction
    const indoor_lp_dB = Number((source_lp_dB - rw_dB).toFixed(1));
    // NBR 10152:2017 - Classe B residencial: ≤ 45 dB(A) / NBR 10152:2017 Class B residential: ≤ 45 dB(A)
    const sufficient = indoor_lp_dB <= 45;

    return { indoor_lp_dB, sufficient };
}

/**
 * Classify environmental noise impact for a given receptor type.
 * Classifica o impacto do ruído ambiental para um dado tipo de receptor.
 *
 * Limits per CONAMA Resolução 1/1990 + ABNT NBR 10151:2019:
 *   residential: 65 dB(A) daytime
 *   school: 60 dB(A)
 *   hospital: 50 dB(A)
 *   commercial: 70 dB(A)
 *
 * @param lden_dB - Day-evening-night level in dB(A) / Nível Lden em dB(A)
 * @param receptor_type - Type of sensitive receptor / Tipo de receptor sensível
 */
export function classifyNoiseImpact(
    lden_dB: number,
    receptor_type: 'residential' | 'school' | 'hospital' | 'commercial',
): { impact: 'none' | 'slight' | 'moderate' | 'severe' | 'critical'; limit_dB: number; exceedance_dB: number } {
    if (typeof lden_dB !== 'number') throw new TypeError('lden_dB must be a number');
    if (lden_dB < 0) throw new RangeError('lden_dB must be >= 0');
    const valid_receptors = ['residential', 'school', 'hospital', 'commercial'];
    if (!valid_receptors.includes(receptor_type)) {
        throw new TypeError(`receptor_type must be one of: ${valid_receptors.join(', ')}`);
    }

    // Limites CONAMA 1/1990 + NBR 10151:2019 / CONAMA 1/1990 + NBR 10151:2019 limits
    const limits: Record<string, number> = {
        residential: 65,
        school: 60,
        hospital: 50,
        commercial: 70,
    };

    const limit_dB = limits[receptor_type]!;
    const exceedance_dB = Number((lden_dB - limit_dB).toFixed(1));

    let impact: 'none' | 'slight' | 'moderate' | 'severe' | 'critical';
    if (exceedance_dB <= 0) {
        impact = 'none';
    } else if (exceedance_dB <= 5) {
        impact = 'slight';
    } else if (exceedance_dB <= 10) {
        impact = 'moderate';
    } else if (exceedance_dB <= 20) {
        impact = 'severe';
    } else {
        impact = 'critical';
    }

    return { impact, limit_dB, exceedance_dB };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const environmentalNoiseMappingMeta: AnalyticsModuleMeta = {
    name: 'environmentalNoiseMapping',
    description: 'environmentalNoiseMapping',
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
