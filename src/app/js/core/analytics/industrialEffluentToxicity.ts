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
 * Industrial Effluent Toxicity Analysis
 * Análise de Toxicidade de Efluente Industrial
 *
 * References / Referências:
 * - ABNT NBR 12713:2016 - Ecotoxicologia aquática: toxicidade aguda com Daphnia sp.
 * - US EPA/821/R-02/012 (2002) - Whole Effluent Toxicity (WET) Testing Methods
 * - CONAMA 430/2011 - Condições e padrões de lançamento de efluentes
 * - Sprague, J.B. (1969). Measurement of pollutant toxicity to fish. Water Research, 3(11): 793–821.
 *   DOI: 10.1016/0043-1354(69)90117-8
 * - CETESB L5.018 (2012) - Determinação de Toxicidade Aguda com Daphnia similis
 *
 * Zero DOM/IDB/Three.js/fetch dependencies.
 * Sem dependências de DOM, IDB, Three.js ou fetch.
 */

// Toxicity classification thresholds (Toxic Units)
// Limites de classificação por Unidades de Toxicidade
// maxUT is inclusive upper bound for the class (ut <= maxUT)
// Limite superior inclusivo para cada classe (ut <= maxUT)
const TOXICITY_CLASS = [
    { maxUT: 1, class: 'I', label: 'Non-toxic', labelPT: 'Não tóxico' },
    { maxUT: 2, class: 'II', label: 'Slightly toxic', labelPT: 'Levemente tóxico' },
    { maxUT: 4, class: 'III', label: 'Moderately toxic', labelPT: 'Moderadamente tóxico' },
    { maxUT: Infinity, class: 'IV', label: 'Highly toxic', labelPT: 'Altamente tóxico' },
];

// CONAMA 430/2011 Art. 16: acute toxicity limit for receiving body Daphnia similis LC50(48h)
// Limite de toxicidade aguda para lançamento em corpo receptor (CONAMA 430/2011)
const CONAMA_430_MAX_UT = 2; // Classes I and II are compliant

/**
 * Validate a positive finite number.
 * Valida se o valor é um número positivo e finito.
 * @param {number} value
 * @param {string} name
 */
function _requirePositive(value: number, name: string) {
    if (typeof value !== 'number' || !isFinite(value) || value <= 0) {
        throw new RangeError(`${name} must be a positive finite number, got: ${value}`);
    }
}

/**
 * Calculate Dilution Factor (FD) for an effluent sample.
 * Calcula o Fator de Diluição (FD) - relação entre volume total e volume de efluente.
 *
 * FD = (volume_effluent + volume_diluent) / volume_effluent
 *
 * @param {number} volumeEffluent_mL - Volume of effluent in test (mL)
 * @param {number} volumeDiluent_mL  - Volume of diluent added (mL)
 * @returns {number} Dilution factor (dimensionless)
 */
export function dilutionFactor(volumeEffluent_mL: number, volumeDiluent_mL: number): number {
    _requirePositive(volumeEffluent_mL, 'volumeEffluent_mL');
    if (typeof volumeDiluent_mL !== 'number' || !isFinite(volumeDiluent_mL) || volumeDiluent_mL < 0) {
        throw new RangeError('volumeDiluent_mL must be a non-negative finite number');
    }
    return (volumeEffluent_mL + volumeDiluent_mL) / volumeEffluent_mL;
}

/**
 * Calculate Toxic Unit (UT) from CE50 or CL50.
 * Calcula Unidade de Toxicidade (UT) a partir de CE50 ou CL50.
 *
 * UT = 100 / CE50(%)
 *
 * CE50 is the effluent concentration (%) causing 50% effect on test organisms.
 * CE50 é a concentração do efluente (%) que causa efeito em 50% dos organismos.
 *
 * @param {number} ce50_pct - CE50 or CL50 expressed as % effluent (0 < ce50 <= 100)
 * @returns {number} Toxic Unit (UT)
 */
export function toxicUnit(ce50_pct: number): number {
    _requirePositive(ce50_pct, 'ce50_pct');
    if (ce50_pct > 100) {
        throw new RangeError('ce50_pct must be <= 100 (percentage)');
    }
    return 100 / ce50_pct;
}

/**
 * Classify acute toxicity by Toxic Unit (UT).
 * Classifica a toxicidade aguda pela Unidade de Toxicidade.
 *
 * Classes: I (UT<1) - II (UT 1-2) - III (UT 2-4) — IV (UT>4)
 *
 * @param {number} ut - Toxic Unit value
 * @returns {{ class: string, label: string, labelPT: string }} Classification object
 */
export function classifyToxicity(ut: number): { class: string, label: string, labelPT: string } {
    if (typeof ut !== 'number' || !isFinite(ut)) {
        throw new TypeError('ut must be a finite number');
    }
    if (ut < 0) throw new RangeError('ut must be >= 0');

    for (const tier of TOXICITY_CLASS) {
        if (ut <= tier.maxUT) return { class: tier.class, label: tier.label, labelPT: tier.labelPT };
    }
    // Fallback: Class IV (shouldn't reach here with Infinity sentinel)
    return { class: 'IV', label: 'Highly toxic', labelPT: 'Altamente tóxico' };
}

/**
 * Check CONAMA 430/2011 compliance for effluent discharge.
 * Verifica conformidade com CONAMA 430/2011 para lançamento de efluente.
 *
 * Compliant if UT <= 2 (Class I or II).
 * Conforme se UT <= 2 (Classe I ou II).
 *
 * @param {number} ut - Toxic Unit
 * @returns {{ compliant: boolean, limit: number, ut: number, message: string }}
 */
export function checkConama430Compliance(ut: number): { compliant: boolean, limit: number, ut: number, message: string } {
    if (typeof ut !== 'number' || !isFinite(ut)) {
        throw new TypeError('ut must be a finite number');
    }
    if (ut < 0) throw new RangeError('ut must be >= 0');

    const compliant = ut <= CONAMA_430_MAX_UT;
    return {
        compliant,
        limit: CONAMA_430_MAX_UT,
        ut,
        message: compliant
            ? `Compliant: UT ${ut.toFixed(2)} <= ${CONAMA_430_MAX_UT} (CONAMA 430/2011)`
            : `Non-compliant: UT ${ut.toFixed(2)} > ${CONAMA_430_MAX_UT} (CONAMA 430/2011)`,
    };
}

/**
 * Calculate Aquatic Risk Index (ARI) for a discharge point.
 * Calcula Índice de Risco Aquático (IRA) para um ponto de lançamento.
 *
 * ARI = UT * dilutionFactor
 * Represents the hazard quotient after mixing with receiving body.
 * Representa o quociente de risco após mistura com o corpo receptor.
 *
 * ARI interpretation:
 *   < 0.1  - negligible risk / risco desprezível
 *   0.1–1  - low risk / risco baixo
 *   1–10   - moderate risk / risco moderado
 *   > 10   - high risk / risco alto
 *
 * @param {number} ut - Toxic Unit of effluent
 * @param {number} fd - Dilution factor at discharge point (>= 1)
 * @returns {{ ari: number, riskLevel: string, riskLevelPT: string }}
 */
export function aquaticRiskIndex(ut: number, fd: number): { ari: number, riskLevel: string, riskLevelPT: string } {
    if (typeof ut !== 'number' || !isFinite(ut) || ut < 0) {
        throw new RangeError('ut must be a non-negative finite number');
    }
    _requirePositive(fd, 'fd');
    if (fd < 1) throw new RangeError('fd (dilution factor) must be >= 1');

    // ARI = UT after dilution - conta a diluição no corpo receptor
    const ari = ut / fd;

    let riskLevel, riskLevelPT;
    if (ari < 0.1) {
        riskLevel = 'negligible';
        riskLevelPT = 'desprezível';
    } else if (ari < 1) {
        riskLevel = 'low';
        riskLevelPT = 'baixo';
    } else if (ari < 10) {
        riskLevel = 'moderate';
        riskLevelPT = 'moderado';
    } else {
        riskLevel = 'high';
        riskLevelPT = 'alto';
    }

    return { ari, riskLevel, riskLevelPT };
}

/**
 * Full toxicity assessment pipeline for a single effluent sample.
 * Pipeline completo de avaliação de toxicidade para uma amostra de efluente.
 *
 * @param {object} params
 * @param {number} params.ce50_pct        - CE50 or CL50 (% effluent)
 * @param {number} params.receivingBodyFD - Dilution factor in receiving water body (>= 1)
 * @returns {{ ut: number, classification: object, compliance: object, ari: object }}
 */
export function assessEffluentToxicity({ ce50_pct, receivingBodyFD }: { ce50_pct: number; receivingBodyFD: number }): { ut: number, classification: object, compliance: object, ari: object } {
    const ut = toxicUnit(ce50_pct);
    const classification = classifyToxicity(ut);
    const compliance = checkConama430Compliance(ut);
    const ari = aquaticRiskIndex(ut, receivingBodyFD);
    return { ut, classification, compliance, ari };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
interface AnalyticsJsonSchema {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties?: boolean;
    description?: string;
}
interface AnalyticsModuleProvenance {
    generatedBy: string;
    version: string;
    validatedByHuman: boolean;
    disclaimerAcknowledged: boolean;
    specRef: string;
    citation?: string;
}
interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: 'analytics';
    familyTags: string[];
    provenance: AnalyticsModuleProvenance;
    inputSchema: AnalyticsJsonSchema;
    outputSchema: AnalyticsJsonSchema;
}

export const industrialEffluentToxicityMeta: AnalyticsModuleMeta = {
    name: 'industrialEffluentToxicity',
    description: 'industrialEffluentToxicity',
    category: 'analytics',
    familyTags: ['industrial', 'chemical'],
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
