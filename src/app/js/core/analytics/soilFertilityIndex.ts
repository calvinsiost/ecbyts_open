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
 * Soil Fertility Index - Indice de Fertilidade do Solo
 *
 * References / Referencias:
 *   - Embrapa Solos (2017). Manual de Metodos de Analise de Solo. 3a ed. ISBN 978-85-7035-771-7
 *   - van Raij, B. et al. (2001). Recomendacoes de adubacao e calagem para o Estado de Sao Paulo.
 *     IAC Boletim Tecnico 100. ISBN 85-85564-01-4
 *   - Raij, B. van (1991). Fertilidade do solo e adubacao. Piracicaba: Potafos. ISBN 85-7028-001-X
 *
 * Zero DOM/IDB/Three.js/fetch dependencies - pure math module.
 * Sem dependencias de DOM/IDB/Three.js/fetch - modulo de matematica pura.
 *
 * @module soilFertilityIndex
 */

'use strict';

interface FertilityClassEntry {
    label: string;
    labelPT: string;
    minV: number;
    maxV: number;
}

interface BaseSaturationResult {
    sb: number;
    v: number;
}

interface FertilityLabel {
    label: string;
    labelPT: string;
}

interface AssessmentParams {
    ca: number;
    mg: number;
    k: number;
    al: number;
    ctc: number;
    vf?: number;
    prnt?: number;
}

interface AssessmentResult {
    sb: number;
    v: number;
    m: number;
    fertilityClass: FertilityLabel;
    limeRequirementTHa: number;
}

/**
 * Soil fertility classification thresholds (% base saturation, V%)
 * Classificacao de fertilidade por saturacao de bases (Embrapa 2017, Tabela 2)
 */
const FERTILITY_CLASSES: FertilityClassEntry[] = [
    { label: 'very_low', labelPT: 'Muito Baixo', minV: 0, maxV: 25 },
    { label: 'low', labelPT: 'Baixo', minV: 25, maxV: 50 },
    { label: 'medium', labelPT: 'Medio', minV: 50, maxV: 70 },
    { label: 'good', labelPT: 'Bom', minV: 70, maxV: 85 },
    { label: 'very_good', labelPT: 'Muito Bom', minV: 85, maxV: Infinity },
];

/**
 * Compute base saturation (V%) - Saturacao por bases
 * V% = (SB / T) * 100
 * where SB = Ca + Mg + K (cmolc/dm3), T = CTC efetiva ou potencial
 *
 * @param {number} ca  - Calcium (cmolc/dm3)
 * @param {number} mg  - Magnesium (cmolc/dm3)
 * @param {number} k   - Potassium (cmolc/dm3)
 * @param {number} ctc - Cation Exchange Capacity / CTC (cmolc/dm3)
 * @returns {BaseSaturationResult} Sum of bases and base saturation %
 * @throws {RangeError} if any value is negative or CTC is zero/negative
 */
export function baseSaturation(ca: number, mg: number, k: number, ctc: number): BaseSaturationResult {
    if (ca < 0 || mg < 0 || k < 0) throw new RangeError('Ca, Mg e K devem ser >= 0 (cmolc/dm3)');
    if (ctc <= 0) throw new RangeError('CTC deve ser > 0 (cmolc/dm3)');
    const sb = ca + mg + k;
    const v = (sb / ctc) * 100;
    return { sb, v };
}

/**
 * Compute aluminum saturation (m%) - Saturacao por aluminio
 * m% = (Al / (SB + Al)) * 100
 * Indica toxicidade de Al para plantas sensíveis / toxicity indicator
 *
 * @param {number} al - Exchangeable aluminum (cmolc/dm3)
 * @param {number} sb - Sum of bases (cmolc/dm3), from baseSaturation()
 * @returns {number} Aluminum saturation m%
 * @throws {RangeError} if al < 0 or sb < 0 or both are zero
 */
export function aluminumSaturation(al: number, sb: number): number {
    if (al < 0) throw new RangeError('Al deve ser >= 0 (cmolc/dm3)');
    if (sb < 0) throw new RangeError('SB deve ser >= 0 (cmolc/dm3)');
    if (al === 0 && sb === 0) throw new RangeError('Al + SB nao pode ser zero');
    return (al / (sb + al)) * 100;
}

/**
 * Classify fertility from base saturation V%
 * Classificacao de fertilidade a partir da saturacao de bases
 *
 * @param {number} v - Base saturation V% (0–100)
 * @returns {FertilityLabel} Fertility class
 * @throws {RangeError} if v is outside [0, 100]
 */
export function classifyFertility(v: number): FertilityLabel {
    if (v < 0 || v > 100) throw new RangeError('V% deve estar entre 0 e 100');
    const cls = FERTILITY_CLASSES.find((c) => v >= c.minV && v < c.maxV);
    // Ultimo intervalo inclui 100
    // Last interval includes 100
    if (!cls) return { label: FERTILITY_CLASSES[FERTILITY_CLASSES.length - 1]!.label, labelPT: FERTILITY_CLASSES[FERTILITY_CLASSES.length - 1]!.labelPT };
    return { label: cls.label, labelPT: cls.labelPT };
}

/**
 * Lime requirement by SMP buffer method - Necessidade de Calagem (NC) pelo metodo SMP
 * Widely used in southern Brazil (RS/SC/PR) for correcting soil acidity.
 * Amplamente utilizado no Sul do Brasil para correcao da acidez do solo.
 *
 * Formula: NC (t/ha) = (Vf - V%) * CTC / (PRNT * 100)
 * where Vf = target V% (usually 70 for grains, 80 for fruits/vegetables)
 *
 * @param {number} v     - Current base saturation V%
 * @param {number} ctc   - CTC (cmolc/dm3)
 * @param {number} vf    - Target V% (default 70 for annual crops)
 * @param {number} prnt  - Relative Total Neutralizing Power (0–100), default 100
 * @returns {number} Lime requirement in t/ha (0 if soil already at target)
 * @throws {RangeError} on invalid inputs
 */
export function limeRequirement(v: number, ctc: number, vf: number = 70, prnt: number = 100): number {
    if (v < 0 || v > 100) throw new RangeError('V% deve estar entre 0 e 100');
    if (ctc <= 0) throw new RangeError('CTC deve ser > 0 (cmolc/dm3)');
    if (vf <= 0 || vf > 100) throw new RangeError('Vf deve estar entre 0 e 100');
    if (prnt <= 0 || prnt > 100) throw new RangeError('PRNT deve estar entre 0 e 100');
    if (v >= vf) return 0; // Solo ja esta na faixa alvo / Already at target
    const nc = ((vf - v) * ctc) / prnt; // t/ha (factor 100 simplificado por convencao IAC)
    return Math.max(0, nc);
}

/**
 * Full soil fertility assessment - Avaliacao completa de fertilidade do solo
 *
 * @param {AssessmentParams} params
 * @returns {AssessmentResult}
 */
export function soilFertilityAssessment({ ca, mg, k, al, ctc, vf = 70, prnt = 100 }: AssessmentParams): AssessmentResult {
    const { sb, v } = baseSaturation(ca, mg, k, ctc);
    const m = aluminumSaturation(al, sb);
    const fertilityClass = classifyFertility(v);
    const limeRequirementTHa = limeRequirement(v, ctc, vf, prnt);
    return { sb, v, m, fertilityClass, limeRequirementTHa };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
// @ts-ignore
export const soilFertilityIndexMeta = {
    name: 'soilFertilityIndex',
    description: 'soilFertilityIndex',
    category: 'analytics',
    familyTags: ['soil', 'hydrocarbon'],
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
