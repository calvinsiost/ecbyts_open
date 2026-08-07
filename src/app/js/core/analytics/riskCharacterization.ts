// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   RISK CHARACTERIZATION — USEPA RAGS Vol. I
   ================================================================

   Caracterizacao de risco multicomposto e multivia conforme
   USEPA Risk Assessment Guidance for Superfund (RAGS), Volume I.

   REFERENCIAS ACADEMICAS:
   - USEPA (1989). Risk Assessment Guidance for Superfund Vol. I.
     EPA/540/1-89/002. Office of Emergency and Remedial Response.
   - USEPA (2009). Risk Assessment Guidance for Superfund Vol. I
     Part F: Supplemental Guidance for Inhalation Risk Assessment.
     EPA-540-R-070-002.
   - USEPA (2011). Exposure Factors Handbook: 2011 Edition.
     EPA/600/R-09/052F.

   METODOS:
   - aggregateCancerRisk   — somacao linear de CR por via/composto
   - aggregateHazardIndex  — HI por sistema-alvo e via
   - computeCumulativeRisk — pipeline completo receptor → risco
   - sensitivityAnalysis   — top contributors por fracao
   - computeRiskReductionTarget — fator de reducao regulatorio
   - classifyRiskLevel     — nivel integrado cancer + nao-cancer
   - RISK_BENCHMARKS       — limiares USEPA canonicos

   ================================================================ */

// ================================================================
// CONSTANTS - USEPA regulatory benchmarks
// Limiares regulatorios USEPA (RAGS Vol. I, 1989)
// ================================================================

/**
 * Limiares de referencia USEPA para risco carcinogenico e nao-carcinogenico.
 * Reference: USEPA RAGS Vol. I, 1989, Sections 8.2 e 8.3.
 */
export const RISK_BENCHMARKS = Object.freeze({
    /** Risco carcinogenico aceitavel (goal regulatorio) */
    cancer_acceptable: 1e-6,
    /** Risco carcinogenico que requer remediacaoo */
    cancer_elevated: 1e-4,
    /** Hazard Index seguro (nao-carcinogenico) */
    HI_safe: 1.0,
    /** Hazard Index de preocupacao */
    HI_concern: 10.0,
    /** Referencia normativa */
    usepa_reference: 'RAGS Vol. I 1989',
});

// ================================================================
// TARGET ORGAN VALIDATION
// Sistemas-alvo reconhecidos pela USEPA
// ================================================================

const VALID_TARGET_ORGANS = new Set(['respiratory', 'neurological', 'hepatic', 'renal', 'dermal', 'systemic']);

/**
 * Normaliza targetOrgan para valor valido.
 * @param {string|undefined} organ
 * @returns {string}
 */
function normalizeTargetOrgan(organ: string|undefined): string {
    if (organ && VALID_TARGET_ORGANS.has(organ)) return organ;
    return 'systemic';
}

// ================================================================
// AGGREGATE CANCER RISK
// Somacao linear de riscos carcinogenicos (RAGS Vol. I, Sec. 8.3)
// CR_total = sum(CR_i) para todos compostos e vias
// ================================================================

/**
 * Soma linear de riscos carcinogenicos por via e composto.
 * Metodo canonico USEPA: adiçao de risco (risco independente por composto).
 * Reference: USEPA RAGS Vol. I, 1989, Equation 8-1.
 *
 * @param {Array<{chemical: string, pathway: string, cancerRisk: number}>} chemicalRisks
 *   Array de objetos com chemical, pathway e cancerRisk individual
 * @returns {Readonly<{
 *   totalRisk: number,
 *   byPathway: Object,
 *   byChemical: Object,
 *   riskLevel: string,
 *   method: string
 * }>}
 */
export function aggregateCancerRisk(chemicalRisks: Array<{chemical: string, pathway: string, cancerRisk: number}>): Readonly<{ totalRisk: number, byPathway: Object, byChemical: Object, riskLevel: string, method: string }> {
    if (!Array.isArray(chemicalRisks) || chemicalRisks.length === 0) {
        return Object.freeze({
            totalRisk: 0,
            byPathway: {},
            byChemical: {},
            riskLevel: 'acceptable',
            method: 'usepa-rags',
        });
    }

    let totalRisk = 0;
        const byPathway: Record<string, number>= {};
        const byChemical: Record<string, number>= {};

    for (const entry of chemicalRisks) {
        const cr = Number(entry.cancerRisk) || 0;
        const pathway = entry.pathway || 'unspecified';
        const chemical = entry.chemical || 'unknown';

        totalRisk += cr;

        // Agrupamento por via de exposicao
        if (!byPathway[pathway]) byPathway[pathway] = 0;
        byPathway[pathway] += cr;

        // Agrupamento por composto
        if (!byChemical[chemical]) byChemical[chemical] = 0;
        byChemical[chemical] += cr;
    }

    // Classificacao do nivel de risco
    let riskLevel;
    if (totalRisk < RISK_BENCHMARKS.cancer_acceptable) {
        riskLevel = 'acceptable';
    } else if (totalRisk < RISK_BENCHMARKS.cancer_elevated) {
        riskLevel = 'elevated';
    } else {
        riskLevel = 'high';
    }

    return Object.freeze({
        totalRisk,
        byPathway: Object.freeze(byPathway),
        byChemical: Object.freeze(byChemical),
        riskLevel,
        method: 'usepa-rags',
    });
}

// ================================================================
// AGGREGATE HAZARD INDEX
// Somatorio de HQ por sistema-alvo (RAGS Vol. I, Sec. 8.2)
// HI_sistema = sum(HQ_i) para compostos com mesmo sistema-alvo
// ================================================================

/**
 * Somatório de Hazard Quotients por sistema-alvo e via de exposicao.
 * Compostos com mesmo sistema-alvo sao somados - princípio da adiçao
 * de efeito para endpoints nao-carcinogenicos.
 * Reference: USEPA RAGS Vol. I, 1989, Equation 8-2.
 *
 * @param {Array<{chemical: string, pathway: string, HQ: number, targetOrgan?: string}>} chemicalHQs
 * @returns {Readonly<{
 *   totalHI: number,
 *   byTargetOrgan: Object,
 *   byPathway: Object,
 *   hazardLevel: string
 * }>}
 */
export function aggregateHazardIndex(chemicalHQs: Array<{chemical: string, pathway: string, HQ: number, targetOrgan?: string}>): Readonly<{ totalHI: number, byTargetOrgan: Object, byPathway: Object, hazardLevel: string }> {
    if (!Array.isArray(chemicalHQs) || chemicalHQs.length === 0) {
        return Object.freeze({
            totalHI: 0,
            byTargetOrgan: {},
            byPathway: {},
            hazardLevel: 'safe',
        });
    }

    let totalHI = 0;
        const byTargetOrgan: Record<string, number>= {};
        const byPathway: Record<string, number>= {};

    for (const entry of chemicalHQs) {
        const hq = Number(entry.HQ) || 0;
        const organ = normalizeTargetOrgan(entry.targetOrgan);
        const pathway = entry.pathway || 'unspecified';

        totalHI += hq;

        // Agrupamento por sistema-alvo (endpoint toxicologico)
        if (!byTargetOrgan[organ]) byTargetOrgan[organ] = 0;
        byTargetOrgan[organ] += hq;

        // Agrupamento por via de exposicao
        if (!byPathway[pathway]) byPathway[pathway] = 0;
        byPathway[pathway] += hq;
    }

    // Classificacao do nivel de perigo nao-carcinogenico
    let hazardLevel;
    if (totalHI <= RISK_BENCHMARKS.HI_safe) {
        hazardLevel = 'safe';
    } else if (totalHI <= RISK_BENCHMARKS.HI_concern) {
        hazardLevel = 'concern';
    } else {
        hazardLevel = 'high';
    }

    return Object.freeze({
        totalHI,
        byTargetOrgan: Object.freeze(byTargetOrgan),
        byPathway: Object.freeze(byPathway),
        hazardLevel,
    });
}

// ================================================================
// COMPUTE CUMULATIVE RISK
// Risco cumulativo completo por receptor (RAGS Vol. I, Sections 7-8)
// CR = ADD * CSF; HQ = ADD / RfD
// ================================================================

/**
 * Computa risco cumulativo completo (carcinogenico + nao-carcinogenico)
 * para um receptor, dado o conjunto de compostos, vias de exposicao,
 * ADD (Average Daily Dose), CSF e RfD.
 *
 * Equacoes:
 *   CR_i = ADD_i * CSF_i  (RAGS Vol. I, Eq. 6-1)
 *   HQ_i = ADD_i / RfD_i  (RAGS Vol. I, Eq. 6-2)
 *
 * @param {{
 *   receptor: string,
 *   chemicals: Array<{
 *     name: string,
 *     pathway: string,
 *     ADD_mgkgd: number,
 *     CSF?: number,
 *     RfD?: number,
 *     targetOrgan?: string
 *   }>
 * }} exposureMatrix
 * @returns {Readonly<Object>}
 */
export function computeCumulativeRisk(exposureMatrix: { receptor: string, chemicals: Array<{ name: string, pathway: string, ADD_mgkgd: number, CSF?: number, RfD?: number, targetOrgan?: string }> }): Readonly<Object> {
    const receptor = (exposureMatrix && exposureMatrix.receptor) || 'unknown';
    const chemicals = exposureMatrix && Array.isArray(exposureMatrix.chemicals) ? exposureMatrix.chemicals : [];

        const cancerInputs: Array<{chemical: string, pathway: string, cancerRisk: number}>= [];
        const hazardInputs: Array<{chemical: string, pathway: string, HQ: number, targetOrgan: string}>= [];
        const byChemical: Record<string, Readonly<{pathway: string, ADD_mgkgd: number, cancerRisk: number|null, HQ: number|null, targetOrgan: string}>>= {};

    for (const chem of chemicals) {
        const name = chem.name || 'unknown';
        const pathway = chem.pathway || 'unspecified';
        const add = Number(chem.ADD_mgkgd) || 0;
        const organ = normalizeTargetOrgan(chem.targetOrgan);

        let cr = null;
        let hq = null;

        // Risco carcinogenico (se CSF fornecido)
        if (chem.CSF !== undefined && chem.CSF !== null) {
            cr = add * Number(chem.CSF);
            cancerInputs.push({ chemical: name, pathway, cancerRisk: cr });
        }

        // Hazard Quotient (se RfD fornecido)
        if (chem.RfD !== undefined && chem.RfD !== null && Number(chem.RfD) > 0) {
            hq = add / Number(chem.RfD);
            hazardInputs.push({ chemical: name, pathway, HQ: hq, targetOrgan: organ });
        }

        byChemical[name] = Object.freeze({
            pathway,
            ADD_mgkgd: add,
            cancerRisk: cr,
            HQ: hq,
            targetOrgan: organ,
        });
    }

    const cancerResult = aggregateCancerRisk(cancerInputs);
    const hazardResult = aggregateHazardIndex(hazardInputs);

    const riskSummary = classifyRiskLevel(cancerResult.totalRisk, hazardResult.totalHI);

    return Object.freeze({
        receptor,
        totalCancerRisk: cancerResult.totalRisk,
        totalHI: hazardResult.totalHI,
        byChemical: Object.freeze(byChemical),
        byPathway: Object.freeze({
            cancer: cancerResult.byPathway,
            hazard: hazardResult.byPathway,
        }),
        riskSummary,
    });
}

// ================================================================
// SENSITIVITY ANALYSIS
// Fracao de contribuicao por composto/via ao risco total
// Referencia: USEPA RAGS Vol. I, 1989, Section 8.4
// ================================================================

/**
 * Analise de sensibilidade: identifica compostos e vias que mais
 * contribuem ao risco carcinogenico total e ao HI.
 *
 * @param {{
 *   receptor: string,
 *   chemicals: Array<{
 *     name: string, pathway: string, ADD_mgkgd: number,
 *     CSF?: number, RfD?: number, targetOrgan?: string
 *   }>
 * }} exposureMatrix
 * @param {{ topN?: number }} [options]
 * @returns {Readonly<{
 *   topContributorsCancer: ReadonlyArray<Readonly<{chemical: string, pathway: string, contribution: number, fraction: number}>>,
 *   topContributorsHazard: ReadonlyArray<Readonly<{chemical: string, pathway: string, contribution: number, fraction: number, targetOrgan?: string}>>,
 *   totalCancerRisk: number,
 *   totalHI: number
 * }>}
 */
export function sensitivityAnalysis(exposureMatrix: { receptor: string, chemicals: Array<{ name: string, pathway: string, ADD_mgkgd: number, CSF?: number, RfD?: number, targetOrgan?: string }> }, { topN = 5 }: { topN?: number } = {}) {
    const chemicals = exposureMatrix && Array.isArray(exposureMatrix.chemicals) ? exposureMatrix.chemicals : [];

        const cancerItems: Array<{chemical: string, pathway: string, contribution: number}>= [];
        const hazardItems: Array<{chemical: string, pathway: string, contribution: number, targetOrgan: string}>= [];

    for (const chem of chemicals) {
        const name = chem.name || 'unknown';
        const pathway = chem.pathway || 'unspecified';
        const add = Number(chem.ADD_mgkgd) || 0;
        const organ = normalizeTargetOrgan(chem.targetOrgan);

        if (chem.CSF !== undefined && chem.CSF !== null) {
            const cr = add * Number(chem.CSF);
            cancerItems.push({ chemical: name, pathway, contribution: cr });
        }

        if (chem.RfD !== undefined && chem.RfD !== null && Number(chem.RfD) > 0) {
            const hq = add / Number(chem.RfD);
            hazardItems.push({ chemical: name, pathway, contribution: hq, targetOrgan: organ });
        }
    }

    // Total de cada categoria
    const totalCancerRisk = cancerItems.reduce((s, i) => s + i.contribution, 0);
    const totalHI = hazardItems.reduce((s, i) => s + i.contribution, 0);

    // Fracao de contribuicao normalizada
    const withFractionCancer = cancerItems
        .map((i) =>
            Object.freeze({
                chemical: i.chemical,
                pathway: i.pathway,
                contribution: i.contribution,
                fraction: totalCancerRisk > 0 ? i.contribution / totalCancerRisk : 0,
            }),
        )
        .sort((a, b) => b.fraction - a.fraction)
        .slice(0, topN);

    const withFractionHazard = hazardItems
        .map((i) =>
            Object.freeze({
                chemical: i.chemical,
                pathway: i.pathway,
                contribution: i.contribution,
                fraction: totalHI > 0 ? i.contribution / totalHI : 0,
            }),
        )
        .sort((a, b) => b.fraction - a.fraction)
        .slice(0, topN);

    return Object.freeze({
        topContributorsCancer: Object.freeze(withFractionCancer),
        topContributorsHazard: Object.freeze(withFractionHazard),
        totalCancerRisk,
        totalHI,
    });
}

// ================================================================
// RISK REDUCTION TARGET
// Fator de reducao necessario para atingir metas regulatorias
// Referencia: USEPA RAGS Vol. I, 1989, Section 8.5
// ================================================================

/**
 * Calcula o fator de reducao de risco necessario para atingir metas
 * regulatorias de CR e HI. Util para dimensionamento de remediacoes.
 *
 * reductionFactorCancer = targetRisk / currentTotalCancerRisk
 * reductionFactorHazard = targetHI   / currentTotalHI
 *
 * @param {{ totalCancerRisk: number, totalHI: number }} currentRisk
 * @param {{ targetRisk?: number, targetHI?: number }} [options]
 * @returns {Readonly<{
 *   reductionFactorCancer: number,
 *   reductionFactorHazard: number,
 *   achievable: boolean,
 *   requiredConcentrationReduction: number
 * }>}
 */
export function computeRiskReductionTarget(
    currentRisk: { totalCancerRisk: number, totalHI: number },
    { targetRisk = RISK_BENCHMARKS.cancer_acceptable, targetHI = RISK_BENCHMARKS.HI_safe }: { targetRisk?: number, targetHI?: number } = {},
) {
    const totalCR = (currentRisk && Number(currentRisk.totalCancerRisk)) || 0;
    const totalHI = (currentRisk && Number(currentRisk.totalHI)) || 0;

    // Fator de reducao para cancer
    const reductionFactorCancer = totalCR > 0 ? targetRisk / totalCR : 1;

    // Fator de reducao para nao-cancer
    const reductionFactorHazard = totalHI > 0 ? targetHI / totalHI : 1;

    // Fator limitante (pior caso - menor reducao)
    const minFactor = Math.min(reductionFactorCancer, reductionFactorHazard);
    const achievable = minFactor < 1;

    // Reducao de concentracao necessaria (percentual, 0-1)
    const requiredConcentrationReduction = achievable ? 1 - minFactor : 0;

    return Object.freeze({
        reductionFactorCancer,
        reductionFactorHazard,
        achievable,
        requiredConcentrationReduction,
    });
}

// ================================================================
// CLASSIFY RISK LEVEL
// Classificacao integrada cancer + nao-cancer em nivel qualitativo
// Referencia: USEPA RAGS Vol. I, 1989, Section 8.6
// ================================================================

/**
 * Classifica o nivel integrado de risco combinando CR e HI.
 * Retorna nivel qualitativo, cor de alerta e mensagem para o usuario.
 *
 * Niveis (hierarquico - o mais restrictivo prevalece):
 *   negligible  : CR < 1e-7 AND HI < 0.1
 *   acceptable  : CR < 1e-6 AND HI <= 1
 *   elevated    : CR < 1e-4 OR  HI <= 10
 *   high        : CR >= 1e-4 OR  HI > 10 (ate 100)
 *   very-high   : CR muito elevado ou HI >> 10
 *
 * @param {number} totalCancerRisk - Risco carcinogenico total
 * @param {number} totalHI - Hazard Index total
 * @returns {Readonly<{ level: string, color: string, message: string }>}
 */
export function classifyRiskLevel(totalCancerRisk: number, totalHI: number): Readonly<{ level: string, color: string, message: string }> {
    const cr = Number(totalCancerRisk) || 0;
    const hi = Number(totalHI) || 0;

    // Very-high: CR muito alto ou HI muito alto
    if (cr >= 1e-3 || hi > 100) {
        return Object.freeze({
            level: 'very-high',
            color: 'red',
            message: 'Risco muito alto — requer intervencao imediata (USEPA RAGS Vol. I)',
        });
    }

    // High: CR elevado ou HI alto
    if (cr >= RISK_BENCHMARKS.cancer_elevated || hi > RISK_BENCHMARKS.HI_concern) {
        return Object.freeze({
            level: 'high',
            color: 'red',
            message: 'Risco alto — remediacao necessaria (USEPA RAGS Vol. I)',
        });
    }

    // Elevated: CR entre 1e-6 e 1e-4, ou HI entre 1 e 10
    if (cr >= RISK_BENCHMARKS.cancer_acceptable || hi > RISK_BENCHMARKS.HI_safe) {
        return Object.freeze({
            level: 'elevated',
            color: 'orange',
            message: 'Risco elevado — monitoramento e avaliacao adicional recomendados',
        });
    }

    // Negligible: CR < 1e-7 AND HI < 0.1
    if (cr < 1e-7 && hi < 0.1) {
        return Object.freeze({
            level: 'negligible',
            color: 'green',
            message: 'Risco negligivel — dentro dos parametros de seguranca (USEPA RAGS Vol. I)',
        });
    }

    // Acceptable: CR < 1e-6 AND HI <= 1
    return Object.freeze({
        level: 'acceptable',
        color: 'green',
        message: 'Risco aceitavel — dentro dos parametros regulatorios USEPA',
    });
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const riskCharacterizationMeta = {
    name: 'riskCharacterization',
    description: 'riskCharacterization',
    category: 'analytics',
    familyTags: ['risk'],
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
