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
 * Radiological Contamination Module - Activity, Dose & Classification
 *
 * Módulo puro de avaliação de contaminação radiológica em água: concentração
 * de atividade, dose comprometida por ingestão, dose por exposição externa e
 * classificação de nível de contaminação por radionuclídeo.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - ISO 9696:2017 - Water quality - Measurement of gross alpha activity in
 *     non-saline water - Thick source method. Geneva: ISO, 2017.
 *     (fórmula de concentração de atividade a partir de contagens)
 *   - ICRP Publication 119 - Compendium of Dose Coefficients based on ICRP
 *     Publication 60. Ann. ICRP 42(4), 2012.
 *     DOI: 10.1016/j.icrp.2012.06.038
 *     (coeficientes de dose por ingestão - DCF em Sv/Bq)
 *   - IAEA Safety Standards Series No. GSR Part 3 - Radiation Protection and
 *     Safety of Radiation Sources: International Basic Safety Standards.
 *     Vienna: IAEA, 2014.
 *     (limites de nível de atividade por radionuclídeo em água potável)
 *   - UNSCEAR 2008 Report Vol. I - Sources and Effects of Ionizing Radiation.
 *     New York: United Nations, 2010.
 *     (dose por deposição superficial e dose externa de radiação gama)
 *
 * @module radiologicalContamination
 */

'use strict';

// Limites de nível de atividade (Bq/L) por radionuclídeo e nível de classificação
// Fonte: IAEA BSS 2014 (Tabela B - Derived Clearance Levels for water)
// Estrutura: { exempt, clearance, supervised, controlled } em Bq/L
const NUCLIDE_THRESHOLDS: Record<string, { exempt: number, clearance: number, supervised: number, controlled: number }>= {
    Cs137: { exempt: 0.1, clearance: 1, supervised: 10, controlled: 100 },
    Sr90: { exempt: 0.01, clearance: 0.1, supervised: 1, controlled: 10 },
    Ra226: { exempt: 0.01, clearance: 0.1, supervised: 1, controlled: 10 },
    H3: { exempt: 100, clearance: 1000, supervised: 10000, controlled: 100000 },
};

/**
 * Compute activity concentration from detector counts.
 * Calcula a concentração de atividade radiológica a partir de contagens do detector.
 *
 * A (Bq/L) = (cps - background) / (efficiency × volume_L)
 *
 * Nota: se (cps - background) < 0, retorna { activity_Bq_L: 0 } (abaixo do limite de detecção).
 *
 * @param {number} counts_per_s - Taxa de contagens brutas do detector (cps)
 * @param {number} background_cps - Taxa de contagem de fundo (background) (cps)
 * @param {number} detector_efficiency - Eficiência do detector (fração, 0 < e ≤ 1)
 * @param {number} sample_volume_L - Volume da amostra (L)
 * @returns {{ activity_Bq_L: number }} Concentração de atividade em Bq/L
 * @throws {RangeError} Se efficiency ou volume não forem positivos, ou efficiency > 1
 * @throws {TypeError} Se algum parâmetro não for número
 *
 * Referência: ISO 9696:2017.
 */
export function computeActivityConcentration(counts_per_s: number, background_cps: number, detector_efficiency: number, sample_volume_L: number): { activity_Bq_L: number } {
    if (
        typeof counts_per_s !== 'number' ||
        typeof background_cps !== 'number' ||
        typeof detector_efficiency !== 'number' ||
        typeof sample_volume_L !== 'number'
    ) {
        throw new TypeError('computeActivityConcentration: todos os parâmetros devem ser números');
    }
    if (detector_efficiency <= 0 || detector_efficiency > 1) {
        throw new RangeError('computeActivityConcentration: detector_efficiency deve estar em (0, 1]');
    }
    if (sample_volume_L <= 0) {
        throw new RangeError('computeActivityConcentration: sample_volume_L deve ser positivo');
    }

    // Contagens líquidas (abaixo do fundo = concentração abaixo do limite de detecção)
    const net_cps = counts_per_s - background_cps;
    if (net_cps <= 0) {
        return { activity_Bq_L: 0 };
    }

    // A = (cps_líquido) / (eficiência × volume) → Bq/L
    const activity_Bq_L = net_cps / (detector_efficiency * sample_volume_L);
    return { activity_Bq_L };
}

/**
 * Compute committed effective dose from ingestion of contaminated water.
 * Calcula a dose efetiva comprometida por ingestão de água contaminada.
 *
 * E (mSv) = A × Q × DCF × t × 365 / 1000
 *
 * onde:
 *   A   = concentração de atividade (Bq/L)
 *   Q   = consumo diário de água (L/dia)
 *   DCF = coeficiente de dose por ingestão (Sv/Bq)
 *   t   = período de exposição (anos)
 *
 * @param {number} activity_Bq_L - Concentração de atividade (Bq/L)
 * @param {number} consumption_L_day - Consumo diário de água (L/dia)
 * @param {number} DCF_Sv_Bq - Coeficiente de dose por ingestão (Sv/Bq) - ICRP 119
 * @param {number} exposure_days - Período de exposição (dias)
 * @returns {{ committed_dose_mSv: number }} Dose comprometida em mSv
 * @throws {RangeError} Se qualquer parâmetro for negativo ou zero
 *
 * Referência: ICRP Publication 119 (2012). DOI: 10.1016/j.icrp.2012.06.038
 */
export function computeIngestionDose(activity_Bq_L: number, consumption_L_day: number, DCF_Sv_Bq: number, exposure_days: number): { committed_dose_mSv: number } {
    if (activity_Bq_L < 0) {
        throw new RangeError('computeIngestionDose: activity_Bq_L deve ser ≥ 0');
    }
    if (consumption_L_day <= 0) {
        throw new RangeError('computeIngestionDose: consumption_L_day deve ser positivo');
    }
    if (DCF_Sv_Bq <= 0) {
        throw new RangeError('computeIngestionDose: DCF_Sv_Bq deve ser positivo');
    }
    if (exposure_days <= 0) {
        throw new RangeError('computeIngestionDose: exposure_days deve ser positivo');
    }

    // E (Sv) = A (Bq/L) × Q (L/dia) × DCF (Sv/Bq) × t (dias)
    // Converter Sv → mSv multiplicando por 1000
    const committed_dose_mSv = activity_Bq_L * consumption_L_day * DCF_Sv_Bq * exposure_days * 1000;
    return { committed_dose_mSv };
}

/**
 * Compute external exposure dose from surface deposition of radionuclides.
 * Calcula a dose por exposição externa a partir de deposição superficial.
 *
 * D_ext (mSv) = A_surf (Bq/m²) × gamma_coef (mSv·m²/Bq·h) × time_h (h)
 *
 * @param {number} activity_Bq_m2 - Atividade de deposição superficial (Bq/m²)
 * @param {number} gamma_dose_coef - Coeficiente de dose gama (mSv·m²/(Bq·h))
 * @param {number} time_h - Tempo de exposição (horas)
 * @returns {{ external_dose_mSv: number }} Dose externa em mSv
 * @throws {RangeError} Se qualquer parâmetro for negativo ou zero
 *
 * Referência: UNSCEAR 2008 Report Vol. I, Annex B.
 */
export function computeExternalExposureDose(activity_Bq_m2: number, gamma_dose_coef: number, time_h: number): { external_dose_mSv: number } {
    if (activity_Bq_m2 < 0) {
        throw new RangeError('computeExternalExposureDose: activity_Bq_m2 deve ser ≥ 0');
    }
    if (gamma_dose_coef <= 0) {
        throw new RangeError('computeExternalExposureDose: gamma_dose_coef deve ser positivo');
    }
    if (time_h <= 0) {
        throw new RangeError('computeExternalExposureDose: time_h deve ser positivo');
    }

    // D_ext = deposição × coeficiente gama × tempo de exposição
    const external_dose_mSv = activity_Bq_m2 * gamma_dose_coef * time_h;
    return { external_dose_mSv };
}

/**
 * Classify radiological contamination level for a given nuclide in water.
 * Classifica o nível de contaminação radiológica em água para um radionuclídeo específico.
 *
 * Níveis (IAEA BSS 2014):
 *   - 'exempt'     : atividade abaixo do nível de isenção (sem controle necessário)
 *   - 'clearance'  : acima de isenção mas abaixo de clearance (monitoramento eventual)
 *   - 'supervised' : requer área supervisionada e monitoramento periódico
 *   - 'controlled' : requer área controlada e controle radiológico contínuo
 *
 * Radionuclídeos suportados e limiares (Bq/L):
 *   Cs137: 0.1 / 1 / 10 / 100
 *   Sr90:  0.01 / 0.1 / 1 / 10
 *   Ra226: 0.01 / 0.1 / 1 / 10
 *   H3:    100 / 1000 / 10000 / 100000
 *
 * @param {number} activity_Bq_L - Concentração de atividade (Bq/L)
 * @param {string} nuclide - Identificador do radionuclídeo ('Cs137'|'Sr90'|'Ra226'|'H3')
 * @returns {{ level: 'exempt'|'clearance'|'supervised'|'controlled' }}
 * @throws {RangeError} Se activity_Bq_L for negativo
 * @throws {TypeError} Se nuclide não for reconhecido
 *
 * Referência: IAEA BSS GSR Part 3 (2014).
 */
export function classifyRadiologicalContaminationLevel(activity_Bq_L: number, nuclide: string): { level: 'exempt'|'clearance'|'supervised'|'controlled' } {
    if (activity_Bq_L < 0) {
        throw new RangeError('classifyRadiologicalContaminationLevel: activity_Bq_L deve ser ≥ 0');
    }
    if (!NUCLIDE_THRESHOLDS[nuclide]) {
        throw new TypeError(
            `classifyRadiologicalContaminationLevel: nuclide '${nuclide}' não reconhecido. ` +
                `Valores válidos: ${Object.keys(NUCLIDE_THRESHOLDS).join(', ')}`,
        );
    }

    const t = NUCLIDE_THRESHOLDS[nuclide];

    // Classificação ascendente: verifica do nível mais baixo ao mais alto
        let level: 'exempt'|'clearance'|'supervised'|'controlled';
    if (activity_Bq_L < t.exempt) {
        level = 'exempt';
    } else if (activity_Bq_L < t.clearance) {
        level = 'clearance';
    } else if (activity_Bq_L < t.supervised) {
        level = 'supervised';
    } else {
        level = 'controlled';
    }

    return { level };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const radiologicalContaminationMeta = {
    name: 'radiologicalContamination',
    description: 'radiologicalContamination',
    category: 'analytics',
    familyTags: ['radiation'],
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
