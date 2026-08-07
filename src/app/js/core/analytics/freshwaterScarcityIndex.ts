// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
'use strict';

/**
 * Freshwater Scarcity Index Module
 *
 * Implements water scarcity assessment following:
 *   - Hoekstra, A.Y. & Mekonnen, M.M. (2012). The water footprint of humanity.
 *     PNAS 109(9):3232–3237. DOI: 10.1073/pnas.1109936109
 *   - Pfister, S., Koehler, A. & Hellweg, S. (2009). Assessing the environmental impacts
 *     of freshwater consumption in LCA. Environ. Sci. Technol. 43(11):4098–4104.
 *     DOI: 10.1021/es808762v
 *   - Boulay, A.-M. et al. (2018). The WULCA consensus characterisation factor for water
 *     scarcity footprints: assessing impacts of freshwater consumption in LCA using
 *     available water remaining (AWARE). Int. J. LCA 23:368–378.
 *     DOI: 10.1007/s11367-017-1333-8
 *
 * Metrics implemented:
 *   - WSI (Water Stress Index, Pfister 2009): withdrawal-to-availability ratio mapped to [0,1]
 *   - AWARE characterisation factor (m³world-eq / m³local)
 *   - Blue/green/grey water footprint calculation
 *   - Scarcity classification per Mekonnen & Hoekstra 2016
 *
 * Zero DOM / IDB / Three.js / fetch dependencies - pure math module.
 *
 * @module freshwaterScarcityIndex
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * WSI logistic parameters (Pfister 2009, eq. 3)
 * WSI = 1 / (1 + exp(−6.4 · (WTA* − 0.5)))   where WTA* = water withdrawal / availability
 * @readonly
 */
const WSI_LOGISTIC_K = 6.4;
const WSI_LOGISTIC_MIDPOINT = 0.5;

/**
 * Scarcity classification based on WSI (Mekonnen & Hoekstra 2016, Table 1)
 * Classificação de escassez baseada no WSI.
 * @readonly
 */
const SCARCITY_CLASSES = [
    { label: 'extreme', minWSI: 0.9 },
    { label: 'severe', minWSI: 0.6 },
    { label: 'moderate', minWSI: 0.3 },
    { label: 'low', minWSI: 0.1 },
    { label: 'abundant', minWSI: 0 },
];

/**
 * Global average freshwater availability used as AWARE reference value (m³/month/ha).
 * Valor de referência global para cálculo do fator AWARE.
 * Source: Boulay et al. 2018, Supplementary Table S1 (global average AMR).
 * @readonly
 */
const AWARE_GLOBAL_AMR = 8.28; // m³/month/ha (global average available water remaining)

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Calculate Water Stress Index (WSI) using Pfister 2009 logistic function.
 * Calcula o Índice de Estresse Hídrico (WSI) pela função logística de Pfister 2009.
 *
 * Formula: WSI = 1 / (1 + exp(−k · (WTA − 0.5)))
 *   WTA = totalWithdrawal / availableWater  (withdrawal-to-availability ratio)
 * Range: (0, 1)  - 0 = no stress, 1 = maximum stress
 *
 * @param {number} totalWithdrawal - annual total freshwater withdrawal (m³/yr or m³/month)
 * @param {number} availableWater  - annual natural water availability (same unit as withdrawal)
 * @returns {{ wsi: number, wta: number, classification: string }}
 */
export function calcWaterStressIndex(totalWithdrawal: number, availableWater: number): { wsi: number, wta: number, classification: string } {
    if (typeof totalWithdrawal !== 'number' || !isFinite(totalWithdrawal) || totalWithdrawal < 0) {
        throw new RangeError('totalWithdrawal must be a non-negative finite number');
    }
    if (typeof availableWater !== 'number' || !isFinite(availableWater) || availableWater <= 0) {
        throw new RangeError('availableWater must be a positive finite number');
    }

    // Razão retirada/disponibilidade (adimensional)
    const wta = totalWithdrawal / availableWater;

    // Função logística de Pfister (2009) eq. 3
    const wsi = 1 / (1 + Math.exp(-WSI_LOGISTIC_K * (wta - WSI_LOGISTIC_MIDPOINT)));

    const cls = SCARCITY_CLASSES.find((c) => wsi >= c.minWSI);
    const classification = cls ? cls.label : 'abundant';

    return { wsi: +wsi.toFixed(6), wta: +wta.toFixed(6), classification };
}

/**
 * Calculate AWARE characterisation factor (CF) for water scarcity LCA.
 * Calcula o fator de caracterização AWARE para pegada hídrica em ACV.
 *
 * Formula (Boulay 2018, eq. 1):
 *   CF = AMR_global / AMR_local   (m³world-eq / m³local)
 *   Bounded: [0.1, 100]  (AWARE Technical Report 2016)
 *   Desert areas: CF = 100 (no available water remaining)
 *
 * @param {number} localAMR  - local available water remaining (m³/month/ha)
 * @returns {{ awareCF: number, unit: string }}
 */
export function calcAWAREfactor(localAMR: number): { awareCF: number, unit: string } {
    if (typeof localAMR !== 'number' || !isFinite(localAMR) || localAMR < 0) {
        throw new RangeError('localAMR must be a non-negative finite number');
    }

    let awareCF;
    if (localAMR === 0) {
        // Regiões áridas sem disponibilidade: fator máximo = 100 m³world-eq/m³
        awareCF = 100;
    } else {
        awareCF = AWARE_GLOBAL_AMR / localAMR;
        // Limite inferior AWARE: 0.1 (regiões com alta disponibilidade relativa ao global)
        awareCF = Math.max(0.1, Math.min(100, awareCF));
    }

    return { awareCF: +awareCF.toFixed(6), unit: 'm3world-eq/m3local' };
}

/**
 * Calculate water footprint components (blue, green, grey).
 * Calcula os componentes da pegada hídrica (azul, verde, cinza).
 *
 * Definitions (Hoekstra & Mekonnen 2012):
 *   Blue  = surface/groundwater actually consumed (evaporated or incorporated into product)
 *   Green = rainwater consumed (stored in soil as soil moisture)
 *   Grey  = freshwater needed to dilute pollutants to water quality standards
 *
 * Grey water formula: WFgrey = (L / (cmax − cnat)) × volume
 *   L    = pollutant load (kg/period)
 *   cmax = maximum acceptable concentration (kg/m³)
 *   cnat = natural background concentration (kg/m³)
 *
 * @param {object} p
 * @param {number} p.blueWaterConsumption  - blue water consumed (m³/period)
 * @param {number} p.greenWaterConsumption - green water consumed (m³/period)
 * @param {number} p.pollutantLoad         - pollutant discharged to water body (kg/period)
 * @param {number} p.maxConcentration      - regulatory maximum concentration (kg/m³)
 * @param {number} p.naturalConcentration  - natural background concentration (kg/m³); default 0
 * @returns {{ blueWF: number, greenWF: number, greyWF: number, totalWF: number, unit: string }}
 */
export function calcWaterFootprint({
    blueWaterConsumption,
    greenWaterConsumption,
    pollutantLoad,
    maxConcentration,
    naturalConcentration = 0,
}: {
    blueWaterConsumption: number;
    greenWaterConsumption: number;
    pollutantLoad: number;
    maxConcentration: number;
    naturalConcentration?: number;
}): { blueWF: number; greenWF: number; greyWF: number; totalWF: number; unit: string } {
    for (const [k, v] of Object.entries({
        blueWaterConsumption,
        greenWaterConsumption,
        pollutantLoad,
        maxConcentration,
    })) {
        if (typeof v !== 'number' || !isFinite(v)) throw new TypeError(`${k} must be a finite number`);
        if (v < 0) throw new RangeError(`${k} cannot be negative`);
    }
    if (typeof naturalConcentration !== 'number' || naturalConcentration < 0) {
        throw new RangeError('naturalConcentration must be non-negative');
    }
    if (maxConcentration <= naturalConcentration) {
        throw new RangeError('maxConcentration must be greater than naturalConcentration');
    }

    const blueWF = blueWaterConsumption;
    const greenWF = greenWaterConsumption;

    // Pegada hídrica cinza: volume de água necessário para diluir a carga poluente
    const greyWF = pollutantLoad / (maxConcentration - naturalConcentration);
    const totalWF = blueWF + greenWF + greyWF;

    return {
        blueWF: +blueWF.toFixed(4),
        greenWF: +greenWF.toFixed(4),
        greyWF: +greyWF.toFixed(4),
        totalWF: +totalWF.toFixed(4),
        unit: 'm3/period',
    };
}

/**
 * Calculate water scarcity impact (m³world-eq) from water footprint and AWARE CF.
 * Calcula o impacto de escassez hídrica em m³-equivalentes mundiais.
 *
 * Formula: Scarcity impact = WF_blue × CF_AWARE   (ISO 14046; Boulay 2018)
 * Only blue water contributes to depletive scarcity; green water is excluded per AWARE.
 *
 * @param {number} blueWaterFootprint - blue water footprint (m³/period)
 * @param {number} awareCF            - AWARE characterisation factor (m³world-eq/m³)
 * @returns {{ scarcityImpact: number, unit: string }}
 */
export function calcScarcityImpact(blueWaterFootprint: number, awareCF: number): { scarcityImpact: number, unit: string } {
    if (typeof blueWaterFootprint !== 'number' || !isFinite(blueWaterFootprint) || blueWaterFootprint < 0) {
        throw new RangeError('blueWaterFootprint must be a non-negative finite number');
    }
    if (typeof awareCF !== 'number' || !isFinite(awareCF) || awareCF <= 0) {
        throw new RangeError('awareCF must be a positive finite number');
    }

    // Impacto de escassez = pegada azul × fator de caracterização AWARE
    const scarcityImpact = blueWaterFootprint * awareCF;

    return { scarcityImpact: +scarcityImpact.toFixed(4), unit: 'm3world-eq' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const freshwaterScarcityIndexMeta = {
    name: 'freshwaterScarcityIndex',
    description: 'freshwaterScarcityIndex',
    category: 'analytics',
    familyTags: ['water', 'water_stress'],
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
