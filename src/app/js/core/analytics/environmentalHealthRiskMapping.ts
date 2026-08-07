// @ts-check
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
// Application: EHS & Mining - Environmental Health Risk Mapping
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Environmental Health Risk Mapping - Multi-Pathway Risk Module
 *
 * Módulo puro implementando avaliação de risco à saúde humana por múltiplas
 * vias de exposição: quociente de perigo (HQ) não-cancerígeno multi-via,
 * risco cancerígeno incremental (ILCR) multi-via, índice de risco cumulativo
 * e classificação do nível de risco.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - US EPA (1989). "Risk Assessment Guidance for Superfund (RAGS), Vol. I:
 *     Human Health Evaluation Manual (Part A)." EPA/540/1-89/002. Washington, DC.
 *     (CDI, HQ, fórmulas multi-via, limiares de risco)
 *   - WHO (2001). "Biomarkers in Risk Assessment: Validity and Validation."
 *     Environmental Health Criteria 222. Geneva: WHO.
 *     (biomarcadores, limites de referência para populações)
 *   - ATSDR (2023). "Minimal Risk Levels (MRLs) for Hazardous Substances."
 *     Agency for Toxic Substances and Disease Registry. Atlanta, GA.
 *     (MRLs por via de exposição: ingestão oral, inalação, contato dérmico)
 *
 * @module environmentalHealthRiskMapping
 */

'use strict';

/**
 * Calcula o Hazard Quotient (HQ) agregado por múltiplas vias de exposição
 * para substâncias não-cancerígenas.
 *
 * HQ = CDI / RfD (ou RfC para inalação)
 * CDI [mg/kg/d] = C * IR * EF * ED / (BW * AT)
 * HI (Hazard Index) = soma de HQ por substância por via
 * Referência: US EPA RAGS Part A (1989), Seção 6.2
 *
 * @param {Object[]} exposureRoutes  Array de vias de exposição
 * @param {number} exposureRoutes[].intakeRate_mg_kg_d  Ingestão diária por via [mg/(kg·d)]
 * @param {number} exposureRoutes[].referenceValue_mg_kg_d  RfD ou RfC da substância [mg/(kg·d)]
 * @param {string} exposureRoutes[].route  Nome da via ('ingestion'|'inhalation'|'dermal')
 * @returns {{ hazardIndex: number, hazardQuotients: Array<{route:string, HQ:number}>, dominantRoute: string }}
 * @throws {TypeError} Se exposureRoutes não for array com os campos obrigatórios
 * @throws {RangeError} Se referenceValue for zero ou negativo
 */
export function calcHazardQuotientMultiple(exposureRoutes: any) {
    if (!Array.isArray(exposureRoutes) || exposureRoutes.length === 0) {
        throw new TypeError('exposureRoutes must be a non-empty array');
    }

    const hazardQuotients = exposureRoutes.map((route, idx) => {
        if (typeof route.intakeRate_mg_kg_d !== 'number') {
            throw new TypeError(`exposureRoutes[${idx}].intakeRate_mg_kg_d must be a number`);
        }
        if (typeof route.referenceValue_mg_kg_d !== 'number') {
            throw new TypeError(`exposureRoutes[${idx}].referenceValue_mg_kg_d must be a number`);
        }
        if (route.referenceValue_mg_kg_d <= 0) {
            throw new RangeError(`exposureRoutes[${idx}].referenceValue_mg_kg_d must be > 0`);
        }
        if (route.intakeRate_mg_kg_d < 0) {
            throw new RangeError(`exposureRoutes[${idx}].intakeRate_mg_kg_d must be >= 0`);
        }

        // HQ por via: razão entre exposição diária e valor de referência toxicológico
        const HQ = route.intakeRate_mg_kg_d / route.referenceValue_mg_kg_d;
        return { route: route.route || `route_${idx}`, HQ };
    });

    // Índice de Perigo (HI) = soma dos HQs (US EPA RAGS, 1989)
    const hazardIndex = hazardQuotients.reduce((sum, r) => sum + r.HQ, 0);

    // Via dominante = maior contribuição ao HI
    const dominantRoute = (hazardQuotients.reduce((max, r) => (r.HQ > (max)!.HQ ? r : max), hazardQuotients[0]))!.route;

    return { hazardIndex, hazardQuotients, dominantRoute };
}

/**
 * Calcula o risco cancerígeno incremental (ILCR) por múltiplas vias de exposição.
 *
 * ILCR = CDI * SF  (para ingestão e dérmico)
 * ILCR = IUR * C_ar  (para inalação, via concentração no ar)
 * ILCR_total = soma de ILCR por via
 * Referência: US EPA RAGS Part A (1989), Seção 6.3; ATSDR MRLs (2023)
 *
 * @param {Object[]} cancerRoutes  Array de vias para risco cancerígeno
 * @param {number} cancerRoutes[].intakeRate_mg_kg_d  CDI por via [mg/(kg·d)]
 * @param {number} cancerRoutes[].slopeFactor_per_mg_kg_d  SF (CSF) da substância [(mg/kg/d)^-1]
 * @param {string} cancerRoutes[].route  Nome da via
 * @returns {{ totalCancerRisk: number, cancerRiskByRoute: Array<{route:string,ILCR:number}>, dominantRoute: string }}
 * @throws {TypeError} Se cancerRoutes não for array
 * @throws {RangeError} Se slopeFactor for negativo
 */
export function calcCancerRiskMultiple(cancerRoutes: any) {
    if (!Array.isArray(cancerRoutes) || cancerRoutes.length === 0) {
        throw new TypeError('cancerRoutes must be a non-empty array');
    }

    const cancerRiskByRoute = cancerRoutes.map((route, idx) => {
        if (typeof route.intakeRate_mg_kg_d !== 'number') {
            throw new TypeError(`cancerRoutes[${idx}].intakeRate_mg_kg_d must be a number`);
        }
        if (typeof route.slopeFactor_per_mg_kg_d !== 'number') {
            throw new TypeError(`cancerRoutes[${idx}].slopeFactor_per_mg_kg_d must be a number`);
        }
        if (route.slopeFactor_per_mg_kg_d < 0) {
            throw new RangeError(`cancerRoutes[${idx}].slopeFactor_per_mg_kg_d must be >= 0`);
        }
        if (route.intakeRate_mg_kg_d < 0) {
            throw new RangeError(`cancerRoutes[${idx}].intakeRate_mg_kg_d must be >= 0`);
        }

        // ILCR por via: CDI * SF (US EPA RAGS Part A, 1989, eq. 6.3)
        const ILCR = route.intakeRate_mg_kg_d * route.slopeFactor_per_mg_kg_d;
        return { route: route.route || `route_${idx}`, ILCR };
    });

    // Risco total: soma das contribuições de todas as vias
    const totalCancerRisk = cancerRiskByRoute.reduce((sum, r) => sum + r.ILCR, 0);

    const dominantRoute = (cancerRiskByRoute.reduce(
        (max, r) => (r.ILCR > (max)!.ILCR ? r : max),
        cancerRiskByRoute[0],
    ))!.route;

    return { totalCancerRisk, cancerRiskByRoute, dominantRoute };
}

/**
 * Calcula o índice de risco cumulativo combinando risco cancerígeno e
 * não-cancerígeno em um único índice normalizado.
 *
 * O índice cumulativo (CRI) não é diretamente somável (unidades diferentes),
 * mas pode ser expresso em termos de exceedance de limiares aceitáveis:
 * CRI = max(HI / 1.0, totalCancerRisk / 1e-6)
 * Valores > 1 indicam excedência do limiar regulatório aceito.
 * Referência: US EPA RAGS (1989); WHO (2001), Cap. 3
 *
 * @param {number} hazardIndex  Índice de Perigo (HI) não-cancerígeno [-]
 * @param {number} totalCancerRisk  Risco cancerígeno total (ILCR) [-]
 * @param {number} [acceptableHI=1.0]  Limiar de HI aceitável (padrão EPA: 1.0)
 * @param {number} [acceptableCancerRisk=1e-6]  Risco cancerígeno aceitável (padrão EPA: 1×10⁻⁶)
 * @returns {{ cumulativeRiskIndex: number, hazardExceedance: number, cancerExceedance: number, hazardIndex: number, totalCancerRisk: number }}
 * @throws {RangeError} Se limiares forem zero ou negativos
 */
export function calcCumulativeRiskIndex(hazardIndex: any, totalCancerRisk: any, acceptableHI = 1.0, acceptableCancerRisk = 1e-6) {
    if (typeof hazardIndex !== 'number' || typeof totalCancerRisk !== 'number') {
        throw new TypeError('hazardIndex and totalCancerRisk must be numbers');
    }
    if (hazardIndex < 0) {
        throw new RangeError('hazardIndex must be >= 0');
    }
    if (totalCancerRisk < 0) {
        throw new RangeError('totalCancerRisk must be >= 0');
    }
    if (acceptableHI <= 0) {
        throw new RangeError('acceptableHI must be > 0');
    }
    if (acceptableCancerRisk <= 0) {
        throw new RangeError('acceptableCancerRisk must be > 0');
    }

    // Excedências normalizadas em relação aos limiares regulatórios
    const hazardExceedance = hazardIndex / acceptableHI;
    const cancerExceedance = totalCancerRisk / acceptableCancerRisk;

    // CRI = valor máximo de excedância (lado mais crítico)
    const cumulativeRiskIndex = Math.max(hazardExceedance, cancerExceedance);

    return {
        cumulativeRiskIndex,
        hazardExceedance,
        cancerExceedance,
        hazardIndex,
        totalCancerRisk,
    };
}

/**
 * Classifica o nível de risco à saúde com base no índice de risco cumulativo
 * e nos valores individuais de HI e risco cancerígeno.
 *
 * Classificação integrada (US EPA RAGS, 1989; ATSDR MRLs, 2023):
 *   CRI <= 0.1  : ACCEPTABLE   - risco de background, sem ação necessária
 *   CRI <= 1.0  : LOW          - risco baixo, monitoramento recomendado
 *   CRI <= 10   : MODERATE     - risco moderado, investigação complementar
 *   CRI <= 100  : HIGH         - risco alto, medidas de controle obrigatórias
 *   CRI > 100   : UNACCEPTABLE - risco inaceitável, remediação imediata
 *
 * @param {number} cumulativeRiskIndex  Índice de risco cumulativo (CRI) [-]
 * @param {number} hazardIndex  HI não-cancerígeno [-]
 * @param {number} totalCancerRisk  ILCR total [-]
 * @returns {{ riskLevel: string, riskDescription: string, requiresAction: boolean, actionPriority: string }}
 * @throws {RangeError} Se qualquer índice for negativo
 */
export function classifyHealthRiskLevel(cumulativeRiskIndex: any, hazardIndex: any, totalCancerRisk: any) {
    if (
        typeof cumulativeRiskIndex !== 'number' ||
        typeof hazardIndex !== 'number' ||
        typeof totalCancerRisk !== 'number'
    ) {
        throw new TypeError('All risk indices must be numbers');
    }
    if (cumulativeRiskIndex < 0 || hazardIndex < 0 || totalCancerRisk < 0) {
        throw new RangeError('Risk indices must be >= 0');
    }

    let riskLevel;
    let riskDescription;
    let requiresAction;
    let actionPriority;

    if (cumulativeRiskIndex <= 0.1) {
        riskLevel = 'ACCEPTABLE';
        riskDescription = 'Acceptable risk — within background levels, no action required';
        requiresAction = false;
        actionPriority = 'NONE';
    } else if (cumulativeRiskIndex <= 1.0) {
        riskLevel = 'LOW';
        riskDescription = 'Low risk — below regulatory thresholds, monitoring recommended';
        requiresAction = false;
        actionPriority = 'MONITORING';
    } else if (cumulativeRiskIndex <= 10) {
        riskLevel = 'MODERATE';
        riskDescription = 'Moderate risk — exceeds EPA thresholds, further investigation required';
        requiresAction = true;
        actionPriority = 'INVESTIGATION';
    } else if (cumulativeRiskIndex <= 100) {
        riskLevel = 'HIGH';
        riskDescription = 'High risk — significant exceedance, exposure control measures mandatory';
        requiresAction = true;
        actionPriority = 'CONTROL_MEASURES';
    } else {
        riskLevel = 'UNACCEPTABLE';
        riskDescription = 'Unacceptable risk — immediate remediation and exposure elimination required';
        requiresAction = true;
        actionPriority = 'IMMEDIATE_REMEDIATION';
    }

    return { riskLevel, riskDescription, requiresAction, actionPriority };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const environmentalHealthRiskMappingMeta = {
    name: 'environmentalHealthRiskMapping',
    description: 'Environmental Health Risk Mapping',
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
