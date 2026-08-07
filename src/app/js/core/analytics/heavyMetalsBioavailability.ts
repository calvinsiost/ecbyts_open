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
// Heavy Metals Bioavailability - soil bioaccessibility and plant-soil transfer
// Biodisponibilidade de metais pesados no solo - fração bioacessível e transferência planta-solo.
//
// References / Referências:
//   Gao & Maguhn (2011) Environ Pollut doi:10.1016/j.envpol.2011.07.026
//   Ruby et al. (1996) Environ Sci Technol doi:10.1021/es950722f
//   CETESB DD-256/2016 - Valores Orientadores para Solo e Água Subterrânea no Estado de SP
//   USEPA RAGS Part B (1991) - Risk Assessment Guidance for Superfund, Vol. I, Part B

'use strict';

/**
 * CETESB DD-256/2016 VP (Valor de Prevenção) reference values in mg/kg for soil.
 * Valores de referência VP (prevenção) da CETESB DD-256/2016 para solo (mg/kg peso seco).
 * @private
 */
const CETESB_VP_SOIL_MG_KG = {
    Pb: 72,
    Cd: 1.3,
    As: 15,
    Hg: 0.5,
    Cr: 75,
    Cu: 60,
    Zn: 300,
};

/**
 * CETESB DD-256/2016 VP reference values for sediment in mg/kg.
 * Valores orientadores para sedimentos (mg/kg).
 * @private
 */
const CETESB_VP_SEDIMENT_MG_KG = {
    Pb: 35,
    Cd: 0.6,
    As: 5.9,
    Hg: 0.17,
    Cr: 37.3,
    Cu: 35.7,
    Zn: 123,
};

/**
 * Compute the bioaccessible fraction of a heavy metal in soil.
 * Calcula a fração bioacessível de um metal pesado no solo, base para avaliação de risco oral.
 *
 * @param {number} total_mg_kg - Total metal concentration in soil (mg/kg dry weight).
 *   Concentração total do metal no solo (mg/kg peso seco).
 * @param {number} extraction_efficiency - Extraction efficiency as a fraction [0, 1].
 *   Eficiência de extração como fração [0, 1] (ex.: PBET, IVBA, UBM).
 * @returns {{ bioaccessible_mg_kg: number, fraction_pct: number }}
 *   Bioaccessible concentration (mg/kg) and fraction as percentage.
 * @throws {TypeError} If inputs are not finite numbers.
 * @throws {RangeError} If inputs are negative or extraction_efficiency > 1.
 */
export function computeBioaccessibleFraction(total_mg_kg: any, extraction_efficiency: any) {
    if (!Number.isFinite(total_mg_kg) || !Number.isFinite(extraction_efficiency)) {
        throw new TypeError('total_mg_kg and extraction_efficiency must be finite numbers');
    }
    if (total_mg_kg < 0) {
        throw new RangeError('total_mg_kg must be >= 0');
    }
    if (extraction_efficiency < 0 || extraction_efficiency > 1) {
        throw new RangeError('extraction_efficiency must be in [0, 1]');
    }

    const bioaccessible_mg_kg = total_mg_kg * extraction_efficiency;
    const fraction_pct = extraction_efficiency * 100;

    return { bioaccessible_mg_kg, fraction_pct };
}

/**
 * Compute metal concentration in plant tissue via transfer factor (BAC/TF).
 * Calcula concentração do metal no tecido vegetal via fator de transferência solo-planta (BAC/TF).
 * Typical TF values: Pb 0.01–0.1, Cd 0.1–1.0, As 0.01–0.1, Zn 0.1–1.0.
 *
 * @param {number} soil_mg_kg - Metal concentration in soil (mg/kg dry weight).
 * @param {number} transfer_coefficient - Bioaccumulation/transfer coefficient (dimensionless, TF = C_plant / C_soil).
 * @returns {{ plant_mg_kg: number }}
 *   Estimated metal concentration in plant tissue (mg/kg fresh or dry weight, consistent with TF definition).
 * @throws {TypeError} If inputs are not finite numbers.
 * @throws {RangeError} If inputs are negative.
 */
export function computePlantUptakeFactor(soil_mg_kg: any, transfer_coefficient: any) {
    if (!Number.isFinite(soil_mg_kg) || !Number.isFinite(transfer_coefficient)) {
        throw new TypeError('soil_mg_kg and transfer_coefficient must be finite numbers');
    }
    if (soil_mg_kg < 0) {
        throw new RangeError('soil_mg_kg must be >= 0');
    }
    if (transfer_coefficient < 0) {
        throw new RangeError('transfer_coefficient must be >= 0');
    }

    const plant_mg_kg = soil_mg_kg * transfer_coefficient;
    return { plant_mg_kg };
}

/**
 * Compute Hazard Quotient (HQ) for bioaccessible metal ingestion (USEPA RAGS Part B).
 * Calcula o Quociente de Risco (HQ) para ingestão oral da fração bioacessível do metal.
 * HQ = (C_bio × IR) / (RfD × BW × 1000)
 * onde IR em g/dia, BW em kg, fator 1000 converte mg→g para C_bio em mg/kg.
 *
 * @param {number} bioaccessible_mg_kg - Bioaccessible concentration in soil (mg/kg).
 * @param {number} rfd_mg_kg_day - Oral reference dose (mg/kg-day). Ex.: Pb 0.0035, Cd 0.001.
 * @param {number} body_weight_kg - Body weight in kg (adult ~70 kg, child ~15 kg).
 * @param {number} ingestion_rate_g_day - Daily soil ingestion rate (g/day). Adult ~50, child ~200.
 * @returns {{ hq: number, concern: boolean }}
 *   Hazard Quotient and boolean flag (concern = true when HQ > 1).
 * @throws {TypeError} If inputs are not finite numbers.
 * @throws {RangeError} If any input is <= 0 (except bioaccessible_mg_kg which allows 0).
 */
export function computeBioaccessibilityRisk(bioaccessible_mg_kg: any, rfd_mg_kg_day: any, body_weight_kg: any, ingestion_rate_g_day: any) {
    if (
        !Number.isFinite(bioaccessible_mg_kg) ||
        !Number.isFinite(rfd_mg_kg_day) ||
        !Number.isFinite(body_weight_kg) ||
        !Number.isFinite(ingestion_rate_g_day)
    ) {
        throw new TypeError('All parameters must be finite numbers');
    }
    if (bioaccessible_mg_kg < 0) {
        throw new RangeError('bioaccessible_mg_kg must be >= 0');
    }
    if (rfd_mg_kg_day <= 0) {
        throw new RangeError('rfd_mg_kg_day must be > 0');
    }
    if (body_weight_kg <= 0) {
        throw new RangeError('body_weight_kg must be > 0');
    }
    if (ingestion_rate_g_day <= 0) {
        throw new RangeError('ingestion_rate_g_day must be > 0');
    }

    // HQ = (C_bio [mg/kg] × IR [g/day]) / (RfD [mg/kg-day] × BW [kg] × 1000 [g/kg])
    const hq = (bioaccessible_mg_kg * ingestion_rate_g_day) / (rfd_mg_kg_day * body_weight_kg * 1000);
    const concern = hq > 1;

    return { hq, concern };
}

/**
 * Classify metal contamination level using CETESB DD-256/2016 VP reference values.
 * Classifica nível de contaminação por metal com base nos valores orientadores CETESB DD-256/2016.
 *
 * @param {number} total_mg_kg - Total metal concentration (mg/kg dry weight).
 * @param {'Pb'|'Cd'|'As'|'Hg'|'Cr'|'Cu'|'Zn'} metal - Metal symbol.
 * @param {'soil'|'sediment'} matrix - Environmental matrix.
 * @returns {{ level: 'background'|'elevated'|'contaminated'|'highly_contaminated', reference_mg_kg: number }}
 *   Classification level and VP reference value used.
 * @throws {TypeError} If inputs have wrong types.
 * @throws {RangeError} If total_mg_kg < 0 or metal/matrix not supported.
 */
export function classifyMetalContamination(total_mg_kg: any, metal: any, matrix: any) {
    if (!Number.isFinite(total_mg_kg)) {
        throw new TypeError('total_mg_kg must be a finite number');
    }
    if (total_mg_kg < 0) {
        throw new RangeError('total_mg_kg must be >= 0');
    }

    const VALID_METALS = ['Pb', 'Cd', 'As', 'Hg', 'Cr', 'Cu', 'Zn'];
    const VALID_MATRICES = ['soil', 'sediment'];

    if (!VALID_METALS.includes(metal)) {
        throw new RangeError(`metal must be one of: ${VALID_METALS.join(', ')}`);
    }
    if (!VALID_MATRICES.includes(matrix)) {
        throw new RangeError(`matrix must be one of: ${VALID_MATRICES.join(', ')}`);
    }

const ref = matrix === 'soil' ? (CETESB_VP_SOIL_MG_KG as any)[metal] : (CETESB_VP_SEDIMENT_MG_KG as any)[metal];

    // Classificação: background (<50% VP), elevated (50%-100% VP), contaminated (100%-200% VP), highly_contaminated (>200% VP)
    /** @type {'background'|'elevated'|'contaminated'|'highly_contaminated'} */
    let level;
    if (total_mg_kg < ref * 0.5) {
        level = 'background';
    } else if (total_mg_kg < ref) {
        level = 'elevated';
    } else if (total_mg_kg < ref * 2) {
        level = 'contaminated';
    } else {
        level = 'highly_contaminated';
    }

    return { level, reference_mg_kg: ref };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const heavyMetalsBioavailabilityMeta = {
    name: 'heavyMetalsBioavailability',
    description: 'heavyMetalsBioavailability',
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
