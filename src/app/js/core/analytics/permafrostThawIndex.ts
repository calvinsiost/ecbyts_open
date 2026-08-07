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
 * @module permafrostThawIndex
 * @description Índice de descongelamento de permafrost via equação de Stefan e modelo TTOP.
 * Usado para avaliação de estabilidade de terreno em regiões árticas/subárticas
 * e em contextos de mudança climática e mineração em climas frios.
 *
 * References:
 *   - Stefan J (1891) Über die Theorie der Eisbildung, insbesondere über Eisbildung
 *     im Polarmeere. Ann. Phys. Chem. 42:269–286. DOI:10.1002/andp.18912780206
 *   - Shiklomanov NI, Nelson FE (2002) Active-layer mapping at regional scales: a 13-year
 *     spatial time series for the Kuparuk region, north-central Alaska.
 *     Permafrost Periglacial Proc. 13(3):219–230.
 *   - Smith MW, Riseborough DW (2002) Climate and the limits of permafrost: a zonal analysis.
 *     Permafrost Periglacial Proc. 13(1):1–15. DOI:10.1002/ppp.410
 */

'use strict';

/**
 * Calcula o índice de degelo (Thaw Index, IT) em grau-dias positivos (°C·dias).
 * IT = soma de temperaturas médias diárias acima de 0 °C no período analisado.
 *
 * Usado como variável de entrada para a equação de Stefan e para cálculo de TTOP.
 *
 * @param {number[]} tempSeries_C - Série de temperaturas médias diárias (°C)
 *                                  Ex.: [−5, −3, 0, 2, 5, 1, −1, ...]
 * @returns {{ thawIndex_Cdays: number, thawDays: number, freezeIndex_Cdays: number }}
 * @throws {TypeError} Se tempSeries_C não for um array de números
 * @throws {RangeError} Se o array estiver vazio
 *
 * @see Shiklomanov & Nelson (2002) Permafrost Periglacial Proc. 13(3):219–230.
 */
export function calcThawIndex(tempSeries_C: number[]): { thawIndex_Cdays: number, thawDays: number, freezeIndex_Cdays: number } {
    if (!Array.isArray(tempSeries_C)) {
        throw new TypeError('tempSeries_C must be an array of numbers');
    }
    if (tempSeries_C.length === 0) {
        throw new RangeError('tempSeries_C must not be empty');
    }
    if (tempSeries_C.some((v) => typeof v !== 'number' || !isFinite(v))) {
        throw new TypeError('All elements of tempSeries_C must be finite numbers');
    }

    let thawIndex_Cdays = 0;
    let freezeIndex_Cdays = 0;
    let thawDays = 0;

    for (const T of tempSeries_C) {
        if (T > 0) {
            thawIndex_Cdays += T;
            thawDays++;
        } else {
            freezeIndex_Cdays += Math.abs(T);
        }
    }

    return {
        thawIndex_Cdays: +thawIndex_Cdays.toFixed(2),
        thawDays,
        freezeIndex_Cdays: +freezeIndex_Cdays.toFixed(2),
    };
}

/**
 * Calcula a profundidade máxima de degelo (active layer thickness) via equação de Stefan.
 *
 * d = sqrt(2 × k_thawed × IT × 86400 / (ρ_d × w × L_f))
 *
 * onde:
 *   k_thawed       = condutividade térmica do solo descongelado (W/m·K)
 *   IT             = thaw index (°C·dias)
 *   86400          = conversão dia→segundos
 *   ρ_d            = densidade seca do solo (kg/m³)
 *   w              = teor de umidade gravimétrico (decimal)
 *   L_f            = calor latente de fusão da água (334 000 J/kg)
 *
 * @param {number} thawIndex           - Índice de degelo IT (°C·dias), >= 0
 * @param {number} thermalConductivity - Condutividade térmica solo descongelado (W/m·K), > 0
 * @param {number} latentHeat          - Calor latente volumétrico (J/m³); padrão: ρ_d × w × L_f
 * @param {number} density             - Densidade seca do solo (kg/m³), > 0
 * @param {number} waterContent        - Teor de umidade gravimétrico (fração, 0–1)
 * @returns {{ thawDepth_m: number, activeLayerThickness_cm: number }}
 * @throws {RangeError} Se parâmetros forem inválidos
 *
 * @see Stefan J (1891) Ann. Phys. Chem. 42:269–286. DOI:10.1002/andp.18912780206
 */
export function calcStefanThawDepth(thawIndex: number, thermalConductivity: number, latentHeat: number, density: number, waterContent: number): { thawDepth_m: number, activeLayerThickness_cm: number } {
    if (
        [thawIndex, thermalConductivity, latentHeat, density, waterContent].some(
            (v) => typeof v !== 'number' || !isFinite(v),
        )
    ) {
        throw new TypeError('All parameters must be finite numbers');
    }
    if (thawIndex < 0) {
        throw new RangeError('thawIndex must be >= 0');
    }
    if (thermalConductivity <= 0) {
        throw new RangeError('thermalConductivity must be positive');
    }
    if (density <= 0) {
        throw new RangeError('density must be positive');
    }
    if (waterContent < 0 || waterContent > 1) {
        throw new RangeError('waterContent must be between 0 and 1');
    }

    const L_f = 334000; // J/kg, calor latente de fusão da água
    // Calor latente volumétrico efetivo (J/m³)
    const Lv = latentHeat > 0 ? latentHeat : density * waterContent * L_f;

    if (Lv <= 0) {
        throw new RangeError('Effective latent heat must be positive');
    }

    // Equação de Stefan: d = sqrt(2 × k × IT × 86400 / Lv)
    const thawDepth_m = Math.sqrt((2 * thermalConductivity * thawIndex * 86400) / Lv);

    return {
        thawDepth_m: +thawDepth_m.toFixed(4),
        activeLayerThickness_cm: +(thawDepth_m * 100).toFixed(2),
    };
}

/**
 * Calcula a temperatura no topo do permafrost (TTOP) usando o modelo de
 * Smith & Riseborough (2002) - equação do balanço de condutividade sazonal.
 *
 * TTOP = (nf × k_frozen × TF + nt × k_thawed × TT) / (nf × k_frozen + nt × k_thawed)
 *
 * onde TF e TT são as temperaturas médias das estações de congelamento e degelo, e
 * nf/nt são os fatores de redução de neve/superfície para cada estação.
 *
 * @param {number} meanAirTemp_C - Temperatura média anual do ar (MAAT, °C)
 * @param {number} nf            - Fator de congelamento (n-factor, 0.5–1.0)
 * @param {number} nt            - Fator de degelo (n-factor, 0.5–1.5)
 * @param {number} k_frozen      - Condutividade térmica solo congelado (W/m·K), > 0
 * @param {number} k_thawed      - Condutividade térmica solo descongelado (W/m·K), > 0
 * @param {number} P_snow        - Precipitação de neve anual (m), >= 0
 * @returns {{ TTOP_C: number, permafrostLikely: boolean }}
 * @throws {RangeError} Se parâmetros forem inválidos
 *
 * @see Smith MW, Riseborough DW (2002) Permafrost Periglacial Proc. 13(1):1–15.
 *      DOI:10.1002/ppp.410
 */
export function calcTTOP(meanAirTemp_C: number, nf: number, nt: number, k_frozen: number, k_thawed: number, P_snow: number): { TTOP_C: number, permafrostLikely: boolean } {
    if ([meanAirTemp_C, nf, nt, k_frozen, k_thawed, P_snow].some((v) => typeof v !== 'number' || !isFinite(v))) {
        throw new TypeError('All parameters must be finite numbers');
    }
    if (nf < 0.1 || nf > 2.0) {
        throw new RangeError('nf must be between 0.1 and 2.0');
    }
    if (nt < 0.1 || nt > 2.0) {
        throw new RangeError('nt must be between 0.1 and 2.0');
    }
    if (k_frozen <= 0 || k_thawed <= 0) {
        throw new RangeError('Thermal conductivities must be positive');
    }
    if (P_snow < 0) {
        throw new RangeError('P_snow must be non-negative');
    }

    // Partição anual: temperatura da estação de congelamento (TF) e degelo (TT)
    // Aproximação de 6 meses cada com correção por precipitação de neve
    const snowInsulation = Math.min(0.5, P_snow * 1.5); // reduz TF pela neve
    const TF = meanAirTemp_C - Math.abs(meanAirTemp_C) * 0.5 - snowInsulation;
    const TT = meanAirTemp_C + Math.abs(meanAirTemp_C) * 0.5;

    // TTOP: balanço de condução em regime periódico (Smith & Riseborough 2002, eq. 1)
    const numerator = nf * k_frozen * TF + nt * k_thawed * TT;
    const denominator = nf * k_frozen + nt * k_thawed;
    const TTOP_C = numerator / denominator;

    return {
        TTOP_C: +TTOP_C.toFixed(3),
        permafrostLikely: TTOP_C < 0,
    };
}

/**
 * Classifica a zona de permafrost com base na MAAT e no TTOP calculado.
 *
 * | Zona          | Critério principal                              |
 * |---------------|-------------------------------------------------|
 * | continuous    | MAAT <= −8 °C e TTOP <= −2 °C                  |
 * | discontinuous | MAAT ∈ (−8, −2) °C ou TTOP ∈ (−2, 0) °C       |
 * | sporadic      | MAAT ∈ (−2, 0) °C e TTOP próximo a 0 °C        |
 * | isolated      | TTOP ∈ (−0.5, 0) °C; MAAT > 0 °C              |
 * | none          | TTOP >= 0 °C                                    |
 *
 * @param {number} MAAT_C  - Temperatura média anual do ar (°C)
 * @param {number} TTOP_C  - Temperatura no topo do permafrost (°C)
 * @returns {'continuous'|'discontinuous'|'sporadic'|'isolated'|'none'}
 *
 * @see Smith MW, Riseborough DW (2002) DOI:10.1002/ppp.410, Fig. 3.
 */
export function classifyPermafrostZone(MAAT_C: number, TTOP_C: number): 'continuous'|'discontinuous'|'sporadic'|'isolated'|'none' {
    if (typeof MAAT_C !== 'number' || typeof TTOP_C !== 'number') {
        throw new TypeError('MAAT_C and TTOP_C must be numbers');
    }
    if (!isFinite(MAAT_C) || !isFinite(TTOP_C)) {
        throw new RangeError('MAAT_C and TTOP_C must be finite');
    }

    if (TTOP_C >= 0) return 'none';
    if (TTOP_C < -2 && MAAT_C <= -8) return 'continuous';
    if (TTOP_C < 0 && (MAAT_C <= -2 || TTOP_C <= -0.5)) return 'discontinuous';
    if (TTOP_C >= -0.5 && TTOP_C < 0 && MAAT_C > 0) return 'isolated';
    return 'sporadic';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const permafrostThawIndexMeta = {
    name: 'permafrostThawIndex',
    description: 'permafrostThawIndex',
    category: 'analytics',
    familyTags: ['energy'],
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
