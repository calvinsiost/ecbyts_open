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
/**
 * @module heatExchangerPerformanceIndex
 * @description Índice de performance de trocador de calor - método NTU-ε (Number of
 * Transfer Units - Effectiveness). Implementação de algoritmos fundamentais de
 * transferência de calor para análise de performance industrial.
 *
 * Referências acadêmicas:
 * - Kays, W.M. & London, A.L. (1984). Compact Heat Exchangers, 3rd ed.
 *   McGraw-Hill. ISBN 978-0070334182
 * - Shah, R.K. & Sekulic, D.P. (2003). Fundamentals of Heat Exchanger Design.
 *   John Wiley & Sons. ISBN 978-0471321712
 *   https://doi.org/10.1002/9780470172605
 * - TEMA (2019). Standards of the Tubular Exchanger Manufacturers Association,
 *   10th ed. Tarrytown, NY: TEMA.
 * - Incropera, F.P. et al. (2007). Fundamentals of Heat and Mass Transfer, 6th ed.
 *   John Wiley & Sons. ISBN 978-0471457282
 */

'use strict';

/**
 * Calcula o Número de Unidades de Transferência (NTU).
 *
 * NTU = UA / C_min
 *
 * onde:
 *   UA    = produto do coeficiente global de transferência de calor pela área [W/K]
 *   C_min = menor capacidade calorífica [W/K] = (m_dot * Cp)_min
 *
 * @param {number} UA   - Produto UA [W/K], > 0
 * @param {number} Cmin - Menor capacidade calorífica [W/K], > 0
 * @returns {{ NTU: number }}
 *
 * @see Shah & Sekulic (2003) Eq. 3.1
 */
export function calcNTU(UA: any, Cmin: any) {
    if (UA <= 0) throw new RangeError('UA deve ser positivo [W/K]');
    if (Cmin <= 0) throw new RangeError('Cmin deve ser positivo [W/K]');

    return { NTU: UA / Cmin };
}

/**
 * Calcula a efetividade ε do trocador de calor pelo método NTU-ε.
 *
 * Razão de capacidade calorífica: Cr = C_min / C_max (0 <= Cr <= 1)
 *
 * Equações por arranjo de fluxo (Shah & Sekulic 2003, Chapter 3):
 *
 * counterflow:
 *   ε = (1 - exp(-NTU*(1-Cr))) / (1 - Cr*exp(-NTU*(1-Cr)))  [Cr < 1]
 *   ε = NTU / (1 + NTU)  [Cr = 1]
 *
 * parallel:
 *   ε = (1 - exp(-NTU*(1+Cr))) / (1 + Cr)
 *
 * crossflow (ambos os fluidos não misturados - Shah & Sekulic Eq. 3.68):
 *   ε ≈ 1 - exp((NTU^0.22/Cr) * (exp(-Cr*NTU^0.78) - 1))
 *
 * shell_tube (1-2 TEMA E):
 *   D = sqrt(1 + Cr²)
 *   ε = 2 / (1 + Cr + D * (1 + exp(-NTU*D)) / (1 - exp(-NTU*D)))
 *
 * @param {number} NTU             - Número de Unidades de Transferência, >= 0
 * @param {number} Cr              - Razão de capacidades calóricas [0–1]
 * @param {string} flowArrangement - 'counterflow'|'parallel'|'crossflow'|'shell_tube'
 * @returns {{ effectiveness: number, flowArrangement: string, NTU: number, Cr: number }}
 */
export function calcEffectiveness(NTU: any, Cr: any, flowArrangement: any) {
    if (NTU < 0) throw new RangeError('NTU deve ser >= 0');
    if (Cr < 0 || Cr > 1) throw new RangeError('Cr deve estar em [0, 1]');

    const validArrangements = ['counterflow', 'parallel', 'crossflow', 'shell_tube'];
    if (!validArrangements.includes(flowArrangement)) {
        throw new TypeError(`flowArrangement inválido: '${flowArrangement}'. Válidos: ${validArrangements.join(', ')}`);
    }

    let effectiveness;

    if (flowArrangement === 'counterflow') {
        if (Math.abs(Cr - 1) < 1e-6) {
            effectiveness = NTU / (1 + NTU);
        } else {
            const exponent = -NTU * (1 - Cr);
            effectiveness = (1 - Math.exp(exponent)) / (1 - Cr * Math.exp(exponent));
        }
    } else if (flowArrangement === 'parallel') {
        effectiveness = (1 - Math.exp(-NTU * (1 + Cr))) / (1 + Cr);
    } else if (flowArrangement === 'crossflow') {
        // Shah & Sekulic (2003) Eq. 3.68 - ambos os fluidos não misturados
        effectiveness =
            1 -
            Math.exp(
                (Math.pow(NTU, 0.22) / Math.max(Cr, 1e-6)) * (Math.exp(-Math.max(Cr, 1e-6) * Math.pow(NTU, 0.78)) - 1),
            );
    } else {
        // shell_tube - 1-2 TEMA E (Shah & Sekulic 2003 Eq. 3.80)
        const D = Math.sqrt(1 + Cr * Cr);
        const expND = Math.exp(-NTU * D);
        effectiveness = 2 / (1 + Cr + (D * (1 + expND)) / (1 - expND + 1e-12));
    }

    effectiveness = Math.min(1, Math.max(0, effectiveness));

    return { effectiveness, flowArrangement, NTU, Cr };
}

/**
 * Calcula a taxa de transferência de calor Q usando efetividade e temperaturas de entrada.
 *
 * Q = ε * C_min * (T_h_in - T_c_in)
 *
 * @param {number} epsilon  - Efetividade do trocador (0–1)
 * @param {number} Cmin     - Menor capacidade calorífica [W/K], > 0
 * @param {number} Th_in    - Temperatura de entrada do fluido quente [K ou °C], > Tc_in
 * @param {number} Tc_in    - Temperatura de entrada do fluido frio [K ou °C]
 * @returns {{ Q_W: number, Q_kW: number, Th_in: number, Tc_in: number }}
 */
export function calcHeatTransferRate(epsilon: any, Cmin: any, Th_in: any, Tc_in: any) {
    if (epsilon < 0 || epsilon > 1) throw new RangeError('epsilon deve estar em [0, 1]');
    if (Cmin <= 0) throw new RangeError('Cmin deve ser positivo [W/K]');
    if (Th_in <= Tc_in) {
        throw new RangeError('Th_in deve ser maior que Tc_in (fluido quente > fluido frio)');
    }

    const Q_W = epsilon * Cmin * (Th_in - Tc_in);
    return { Q_W, Q_kW: Q_W / 1000, Th_in, Tc_in };
}

/**
 * Calcula o fator de incrustação (fouling factor) Rf.
 *
 * Rf = 1/U_fouled - 1/U_clean  [m²·K/W]
 *
 * Valores de referência TEMA (2019):
 *   Água de resfriamento de torre: Rf ≈ 0.000176 m²K/W
 *   Água de rio:                   Rf ≈ 0.000352 m²K/W
 *   Água de mar:                   Rf ≈ 0.000088 m²K/W
 *   Óleo leve:                     Rf ≈ 0.000176 m²K/W
 *
 * @param {number} U_clean   - Coeficiente global limpo [W/(m²·K)], > 0
 * @param {number} U_fouled  - Coeficiente global incrustado [W/(m²·K)], > 0; < U_clean
 * @returns {{ Rf_m2K_W: number, performanceLoss_pct: number }}
 */
export function calcFoulingFactor(U_clean: any, U_fouled: any) {
    if (U_clean <= 0) throw new RangeError('U_clean deve ser positivo [W/(m²K)]');
    if (U_fouled <= 0) throw new RangeError('U_fouled deve ser positivo [W/(m²K)]');
    if (U_fouled > U_clean) {
        throw new RangeError('U_fouled deve ser <= U_clean (incrustação reduz performance)');
    }

    const Rf_m2K_W = 1 / U_fouled - 1 / U_clean;
    const performanceLoss_pct = ((U_clean - U_fouled) / U_clean) * 100;

    return { Rf_m2K_W, performanceLoss_pct };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const heatExchangerPerformanceIndexMeta = {
    name: 'heatExchangerPerformanceIndex',
    description: 'heatExchangerPerformanceIndex',
    category: 'analytics',
    familyTags: ['environmental'],
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
