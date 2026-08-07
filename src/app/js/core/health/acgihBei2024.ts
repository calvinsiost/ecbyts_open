// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   HEALTH-MON-001 — Catálogo ACGIH BEI 2024
   Referência: ACGIH Threshold Limit Values (TLV) and Biological
   Exposure Indices (BEI), 2024 Edition.

   DOI: n/a (publicação ACGIH privada; valores de domínio público).
   Nota: valores pré-configurados para onboarding rápido (Q7 spec).
   Usuario pode sobrescrever por projeto.

   Sem DOM, sem rede — catálogo estático frozen.
   ================================================================ */

import { REFERENCE_STANDARD } from './schema.js';

/**
 * ACGIH BEI 2024 canonical catalog.
 * Keys are biomarkerType identifiers (lowercase, underscore-separated).
 * Aligns with sampleMatrix from schema.SAMPLE_MATRIX.
 */
export const ACGIH_BEI_2024 = Object.freeze({
    // Benzene (ACGIH BEI 2024)
    benzene_muconic_acid_urine: Object.freeze({
        displayName: 'Ácido mucônico (urina) — Benzeno',
        biomarkerType: 'benzene_muconic_acid_urine',
        warningValue: 250, // µg/g creatinine (non-specific — 50% BEI)
        criticalValue: 500, // µg/g creatinine
        actionValue: 750,
        unit: 'µg/g creatinina',
        sampleMatrix: 'urine',
        referenceStandard: REFERENCE_STANDARD.ACGIH_BEI_2024,
        substance: 'Benzeno',
        notes: 'Metabolito urinário não-específico; tabagismo pode elevar ~50%',
    }),

    // Lead / Chumbo (ACGIH BEI 2024)
    lead_blood: Object.freeze({
        displayName: 'Chumbo no sangue',
        biomarkerType: 'lead_blood',
        warningValue: 25, // µg/dL (50% do BEI)
        criticalValue: 50, // µg/dL
        actionValue: 70, // µg/dL — ação imediata
        unit: 'µg/dL',
        sampleMatrix: 'blood',
        referenceStandard: REFERENCE_STANDARD.ACGIH_BEI_2024,
        substance: 'Chumbo',
        notes: 'NR-15 BR = 60 µg/dL; ACGIH = 50 µg/dL. Usar NR-15 para contexto brasileiro.',
    }),

    // Toluene / Tolueno (ACGIH BEI 2024)
    toluene_o_cresol_urine: Object.freeze({
        displayName: 'o-Cresol (urina) — Tolueno',
        biomarkerType: 'toluene_o_cresol_urine',
        warningValue: 0.3, // mg/L (50% do BEI)
        criticalValue: 0.6, // mg/L
        actionValue: null,
        unit: 'mg/L',
        sampleMatrix: 'urine',
        referenceStandard: REFERENCE_STANDARD.ACGIH_BEI_2024,
        substance: 'Tolueno',
        notes: 'Coleta no fim da jornada ou fim da semana de trabalho',
    }),

    // Xylene / Xileno (ACGIH BEI 2024)
    xylene_methylhippuric_acid_urine: Object.freeze({
        displayName: 'Ácido metilhipúrico (urina) — Xileno',
        biomarkerType: 'xylene_methylhippuric_acid_urine',
        warningValue: 750, // mg/g creatinine
        criticalValue: 1500, // mg/g creatinine
        actionValue: null,
        unit: 'mg/g creatinina',
        sampleMatrix: 'urine',
        referenceStandard: REFERENCE_STANDARD.ACGIH_BEI_2024,
        substance: 'Xileno',
        notes: 'Soma dos isômeros orto + meta + para',
    }),

    // Mercury / Mercúrio (ACGIH BEI 2024)
    mercury_inorganic_urine: Object.freeze({
        displayName: 'Mercúrio inorgânico (urina)',
        biomarkerType: 'mercury_inorganic_urine',
        warningValue: 15, // µg/g creatinine
        criticalValue: 35, // µg/g creatinine
        actionValue: 50,
        unit: 'µg/g creatinina',
        sampleMatrix: 'urine',
        referenceStandard: REFERENCE_STANDARD.ACGIH_BEI_2024,
        substance: 'Mercúrio (inorgânico)',
        notes: 'Coleta no pré-turno após 3+ dias de exposição',
    }),
});

/**
 * Get a default threshold rule object (ready for createThresholdRule) from the BEI catalog.
 * @param {string} biomarkerType
 * @param {string} projectId
 * @returns {object|null}
 */
export function getDefaultBeiRule(biomarkerType: any, projectId: any) {
    const bei = (ACGIH_BEI_2024 as Record<string, any>)[biomarkerType];
    if (!bei) return null;
    return {
        biomarkerType: bei.biomarkerType,
        warningValue: bei.warningValue,
        criticalValue: bei.criticalValue,
        actionValue: bei.actionValue ?? null,
        unit: bei.unit,
        referenceStandard: bei.referenceStandard,
        projectId: String(projectId),
        active: true,
    };
}

/**
 * List all available default BEI biomarker types.
 * @returns {string[]}
 */
export function listDefaultBeiTypes() {
    return Object.keys(ACGIH_BEI_2024);
}

/**
 * Get display name for a biomarker type.
 * @param {string} biomarkerType
 * @returns {string}
 */
export function getBiomarkerDisplayName(biomarkerType: any) {
    return (ACGIH_BEI_2024 as Record<string, any>)[biomarkerType]?.displayName || biomarkerType;
}
