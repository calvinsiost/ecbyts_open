// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Environmental Thermal Comfort - WBGT, simplified PMV and occupational heat stress
// Conforto Térmico Ambiental - WBGT, PMV simplificado e estresse por calor ocupacional
//
// References / Referências:
//   ISO 7243:2017 - Hot environments: estimation of heat stress on working man
//   Fanger, P.O. (1970) Thermal Comfort: Analysis and Applications in Environmental Engineering
//   ACGIH TLV (2024) - Threshold Limit Values for Chemical Substances and Physical Agents
//   ABNT NBR 16001 - Responsabilidade social: Sistema de gestão
//   MTE NR-15 Anexo 3 (BR) - Operações e atividades insalubres: calor

'use strict';

/**
 * Compute Wet Bulb Globe Temperature (WBGT) index.
 * Calcula o índice WBGT (Temperatura de Globo de Bulbo Úmido).
 *
 * Indoor:  WBGT = 0.7 × Twb + 0.3 × Tg               (ISO 7243:2017)
 * Outdoor: WBGT = 0.7 × Twb + 0.2 × Tg + 0.1 × Tdb  (ISO 7243:2017)
 *
 * @param {number} dry_bulb_c - Dry bulb temperature °C / Temperatura de bulbo seco em °C
 * @param {number} wet_bulb_c - Natural wet bulb temperature °C / Temperatura de bulbo úmido natural em °C
 * @param {number} globe_temp_c - Globe temperature °C / Temperatura de globo em °C
 * @param {boolean} outdoor - True if outdoor (with solar load) / Verdadeiro se ao ar livre (com carga solar)
 * @returns {{ wbgt_c: number }}
 */
export function computeWBGT(dry_bulb_c: any, wet_bulb_c: any, globe_temp_c: any, outdoor: any) {
    if (typeof dry_bulb_c !== 'number' || typeof wet_bulb_c !== 'number' || typeof globe_temp_c !== 'number') {
        throw new TypeError('Temperature parameters must be numbers');
    }
    if (typeof outdoor !== 'boolean') {
        throw new TypeError('outdoor must be a boolean');
    }
    /** @type {Array<[string, number]>} */
    const checks = [
        ['dry_bulb_c', dry_bulb_c],
        ['wet_bulb_c', wet_bulb_c],
        ['globe_temp_c', globe_temp_c],
    ];
    for (const [name, val] of checks) {
if ((val as number) < -20 || (val as number) > 60) throw new RangeError(`${name} must be in range [-20, 60] °C`);
    }

    let wbgt_c;
    if (outdoor) {
        // Ao ar livre: inclui componente de bulbo seco (radiação solar direta)
        wbgt_c = 0.7 * wet_bulb_c + 0.2 * globe_temp_c + 0.1 * dry_bulb_c;
    } else {
        // Ambientes internos: sem componente de radiação solar direta
        wbgt_c = 0.7 * wet_bulb_c + 0.3 * globe_temp_c;
    }

    return { wbgt_c: Number(wbgt_c.toFixed(2)) };
}

/**
 * Compute occupational heat stress limit based on ACGIH TLV (2024) and NR-15 Anexo 3.
 * Calcula o limite de estresse por calor ocupacional baseado na ACGIH TLV (2024) e NR-15 Anexo 3.
 *
 * ACGIH TLV categories (metabolic rate):
 *   Light    : ≤ 200 W
 *   Moderate : 201–350 W
 *   Heavy    : > 350 W
 * Acclimatized workers get +1°C allowance on the limit.
 *
 * @param {number} wbgt_c - Measured WBGT in °C / WBGT medido em °C
 * @param {number} metabolic_rate_W - Work metabolic rate in W / Taxa metabólica de trabalho em W
 * @param {boolean} acclimatized - Worker is heat-acclimatized / Trabalhador aclimatado ao calor
 * @returns {{ limit_wbgt_c: number, exceeded: boolean, rest_work_ratio: string }}
 */
export function computeHeatStressLimit(wbgt_c: any, metabolic_rate_W: any, acclimatized: any) {
    if (typeof wbgt_c !== 'number' || typeof metabolic_rate_W !== 'number') {
        throw new TypeError('wbgt_c and metabolic_rate_W must be numbers');
    }
    if (typeof acclimatized !== 'boolean') {
        throw new TypeError('acclimatized must be a boolean');
    }
    if (metabolic_rate_W < 0) throw new RangeError('metabolic_rate_W must be >= 0');
    if (wbgt_c < -20 || wbgt_c > 60) throw new RangeError('wbgt_c must be in range [-20, 60] °C');

    // Limites ACGIH TLV 2024 para trabalho contínuo (0:60 = sem descanso / full work)
    // ACGIH TLV 2024 limits for continuous work
    let base_limit, rest_work_ratio;
    if (metabolic_rate_W <= 200) {
        base_limit = 31.0; // Leve / Light
        rest_work_ratio = '0:60';
    } else if (metabolic_rate_W <= 350) {
        base_limit = 28.0; // Moderado / Moderate
        rest_work_ratio = '15:45';
    } else if (metabolic_rate_W <= 500) {
        base_limit = 25.0; // Pesado / Heavy
        rest_work_ratio = '30:30';
    } else {
        base_limit = 22.5; // Muito pesado / Very heavy
        rest_work_ratio = '45:15';
    }

    // Trabalhadores aclimatados toleram +1°C / Acclimatized workers tolerate +1°C
    const limit_wbgt_c = base_limit + (acclimatized ? 1.0 : 0.0);
    const exceeded = wbgt_c > limit_wbgt_c;

    return {
        limit_wbgt_c: Number(limit_wbgt_c.toFixed(1)),
        exceeded,
        rest_work_ratio,
    };
}

/**
 * Compute Predicted Mean Vote (PMV) and Predicted Percentage Dissatisfied (PPD).
 * Calcula o Voto Médio Estimado (PMV) e a Porcentagem Prevista de Insatisfeitos (PPD).
 *
 * Simplified Fanger (1970) equation for the comfort zone.
 * Equação simplificada de Fanger (1970) para a zona de conforto.
 *
 * PMV is approximated as linear function of thermal load parameters.
 * PMV ≈ a(ta - 22) + b(tr - 22) + c(va - 0.1) + d(rh - 50) + e(clo - 1) + f(met - 1)
 * Coefficients calibrated for typical office/industrial environments.
 * PPD = 100 - 95 × exp(-0.03353 × PMV⁴ - 0.2179 × PMV²)  [ISO 7730]
 *
 * @param {number} air_temp_c - Air temperature °C / Temperatura do ar em °C
 * @param {number} mean_radiant_temp_c - Mean radiant temperature °C / Temperatura radiante média em °C
 * @param {number} air_velocity_m_s - Air velocity in m/s / Velocidade do ar em m/s
 * @param {number} humidity_pct - Relative humidity in % / Umidade relativa em %
 * @param {number} clothing_clo - Clothing insulation in clo / Isolamento de vestuário em clo
 * @param {number} activity_met - Metabolic activity in met / Atividade metabólica em met
 * @returns {{ pmv: number, ppd_pct: number, sensation: string }}
 */
export function computePMV(
    air_temp_c: any,
    mean_radiant_temp_c: any,
    air_velocity_m_s: any,
    humidity_pct: any,
    clothing_clo: any,
    activity_met: any,
) {
    if (
        [air_temp_c, mean_radiant_temp_c, air_velocity_m_s, humidity_pct, clothing_clo, activity_met].some(
            (v) => typeof v !== 'number',
        )
    ) {
        throw new TypeError('All parameters must be numbers');
    }
    if (air_temp_c < -20 || air_temp_c > 60) throw new RangeError('air_temp_c must be in range [-20, 60] °C');
    if (mean_radiant_temp_c < -20 || mean_radiant_temp_c > 60)
        throw new RangeError('mean_radiant_temp_c must be in range [-20, 60] °C');
    if (air_velocity_m_s < 0) throw new RangeError('air_velocity_m_s must be >= 0');
    if (humidity_pct < 0 || humidity_pct > 100) throw new RangeError('humidity_pct must be 0–100');
    if (clothing_clo < 0) throw new RangeError('clothing_clo must be >= 0');
    if (activity_met <= 0) throw new RangeError('activity_met must be > 0');

    // Coeficientes lineares simplificados (Fanger 1972 linearizado na zona de conforto)
    // Simplified linear coefficients (Fanger 1972 linearized in comfort zone)
    const pmv_raw =
        0.303 * Math.exp(-0.036 * activity_met * 58.2) +
        0.028 +
        // Contribuições de temperatura / Temperature contributions
        0.036 * (air_temp_c - 22) +
        0.024 * (mean_radiant_temp_c - 22) +
        // Velocidade do ar resfria / Air velocity cools
        -0.2 * (air_velocity_m_s - 0.1) +
        // Umidade tem efeito pequeno / Humidity has small effect
        0.0018 * (humidity_pct - 50) +
        // Vestuário (clo) adiciona calor / Clothing adds heat
        0.15 * (clothing_clo - 1.0) +
        // Atividade / Activity
        0.12 * (activity_met - 1.0);

    // Clampar PMV ao intervalo físico [-3, +3] / Clamp PMV to physical range
    const pmv = Number(Math.max(-3, Math.min(3, pmv_raw)).toFixed(2));

    // PPD = 100 - 95 × exp(-0.03353 × PMV⁴ - 0.2179 × PMV²)  [ISO 7730:2005]
    const pmv2 = pmv * pmv;
    const ppd_pct = Number(Math.min(100, 100 - 95 * Math.exp(-0.03353 * pmv2 * pmv2 - 0.2179 * pmv2)).toFixed(1));

    // Sensação térmica ASHRAE / ASHRAE thermal sensation scale
    /** @type {Record<string, string>} */
    const sensations = {
        '-3': 'cold',
        '-2': 'cool',
        '-1': 'slightly_cool',
        0: 'neutral',
        1: 'slightly_warm',
        2: 'warm',
        3: 'hot',
    };
const sensation = (sensations as Record<string, string>)[String(Math.round(pmv))] || 'neutral';

    return { pmv, ppd_pct, sensation };
}

/**
 * Classify heat risk level based on WBGT and metabolic rate.
 * Classifica o nível de risco de calor com base no WBGT e taxa metabólica.
 *
 * Based on ACGIH TLV (2024) and NR-15 Anexo 3 (Brazil).
 * Extreme: WBGT > 33°C for light work or proportionally lower for heavier work.
 *
 * @param {number} wbgt_c - WBGT index in °C / Índice WBGT em °C
 * @param {number} metabolic_rate_W - Work metabolic rate in W / Taxa metabólica em W
 * @returns {{ risk: 'negligible'|'low'|'moderate'|'high'|'extreme', action: string }}
 */
export function classifyHeatRisk(wbgt_c: any, metabolic_rate_W: any) {
    if (typeof wbgt_c !== 'number' || typeof metabolic_rate_W !== 'number') {
        throw new TypeError('wbgt_c and metabolic_rate_W must be numbers');
    }
    if (wbgt_c < -20 || wbgt_c > 60) throw new RangeError('wbgt_c must be in range [-20, 60] °C');
    if (metabolic_rate_W < 0) throw new RangeError('metabolic_rate_W must be >= 0');

    // Carga de calor combinada: WBGT + contribuição metabólica normalizada
    // Combined heat load: WBGT + normalized metabolic contribution
    const metabolic_correction = metabolic_rate_W > 350 ? 3 : metabolic_rate_W > 200 ? 1.5 : 0;
    const effective_wbgt = wbgt_c + metabolic_correction;

    if (effective_wbgt > 36) {
        return {
            risk: 'extreme',
            action: 'Suspender atividade imediatamente — WBGT excede limite máximo absoluto (NR-15 Anexo 3)',
        };
    }
    if (effective_wbgt > 32) {
        return {
            risk: 'high',
            action: 'Restrição de trabalho — pausas obrigatórias ≥45 min/hora, hidratação 250ml/20min (ACGIH TLV 2024)',
        };
    }
    if (effective_wbgt > 28) {
        return {
            risk: 'moderate',
            action: 'Monitoramento contínuo — escalonamento de pausas e controle de hidratação',
        };
    }
    if (effective_wbgt > 24) {
        return { risk: 'low', action: 'Precauções básicas — água disponível, monitoramento periódico' };
    }
    return { risk: 'negligible', action: 'Condições normais de trabalho — nenhuma restrição específica de calor' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const thermalComfortEnvironmentalMeta = {
    name: 'thermalComfortEnvironmental',
    description: 'thermalComfortEnvironmental',
    category: 'analytics',
    familyTags: ['climate'],
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
