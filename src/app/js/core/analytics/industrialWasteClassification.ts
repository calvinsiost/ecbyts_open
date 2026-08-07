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
 * Industrial Waste Classification - ABNT NBR 10004:2004 & Basel Convention
 *
 * Academic references:
 * - ABNT NBR 10004:2004 - Resíduos sólidos - Classificação. ABNT, Rio de Janeiro.
 * - ABNT NBR 10005:2004 - Procedimento para obtenção de extrato lixiviado de resíduos sólidos.
 * - ABNT NBR 10006:2004 - Procedimento para obtenção de extrato solubilizado de resíduos sólidos.
 * - Basel Convention (2019). Technical Guidelines on the Environmentally Sound Management
 *   of Wastes Consisting of, Containing or Contaminated with Persistent Organic Pollutants.
 *   UNEP/CHW.14/6/Add.3. ISBN:978-92-1-159027-5
 * - US EPA (2015). Hazardous Waste Characteristics: A User-Friendly Reference Document.
 *   EPA530-K-12-003.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * ABNT NBR 10004:2004 Annex H - Hazardous characteristics lookup.
 * Características de periculosidade conforme Anexo H da NBR 10004.
 */
const HAZARD_CHAR: Record<string, { code: string; name: string; weight: number }> = {
    flammable: { code: 'F', name: 'Inflamável', weight: 3 },
    corrosive: { code: 'C', name: 'Corrosivo', weight: 2 },
    reactive: { code: 'R', name: 'Reativo', weight: 3 },
    toxic: { code: 'T', name: 'Tóxico', weight: 4 },
    pathogenic: { code: 'P', name: 'Patogênico', weight: 5 },
    ecotoxic: { code: 'E', name: 'Ecotóxico', weight: 3 },
    carcinogenic: { code: 'K', name: 'Cancerígeno', weight: 4 },
};

/**
 * Leachate thresholds (mg/L) from ABNT NBR 10004:2004 Annex B.
 * Limites de lixiviação (mg/L) - Anexo B NBR 10004:2004.
 */
const LEACHATE_LIMITS_MG_L: Record<string, number> = {
    arsenic: 1.0,
    barium: 70.0,
    cadmium: 0.5,
    chromium: 5.0,
    lead: 1.0,
    mercury: 0.1,
    selenium: 1.0,
    silver: 5.0,
};

/**
 * Solubilizate thresholds (mg/L) from ABNT NBR 10004:2004 Annex G.
 * Limites de solubilização (mg/L) - Anexo G NBR 10004:2004.
 */
const SOLUBILIZATE_LIMITS_MG_L: Record<string, number> = {
    arsenic: 0.01,
    barium: 0.7,
    cadmium: 0.005,
    chromium: 0.05,
    lead: 0.01,
    mercury: 0.001,
    nitrate: 10.0,
    fluoride: 1.5,
};

// ─── Exports ─────────────────────────────────────────────────────────────────

/**
 * Classifies a waste sample according to ABNT NBR 10004:2004.
 * Classificação de resíduo sólido conforme NBR 10004:2004: Classe I, IIA ou IIB.
 *
 * @param {object} params
 * @param {Record<string, boolean>}  params.hazardCharacteristics  - Present characteristics: { flammable, corrosive, reactive, toxic, pathogenic, ecotoxic, carcinogenic } - each boolean
 * @param {Record<string, number>}  [params.leachateMgL]       - Leachate test results (mg/L) per element
 * @param {Record<string, number>}  [params.solubilizateMgL]   - Solubilizate test results (mg/L) per element
 * @param {boolean} [params.inertTestPassed=false] - True if inert test (NBR 10006) passed
 * @returns {{ classNBR: string, hazardScore: number, hazardCodes: string[], exceedances: string[], disposalRoute: string }}
 */
export function classifyWasteNBR10004({
    hazardCharacteristics = {},
    leachateMgL = {},
    solubilizateMgL = {},
    inertTestPassed = false,
}: {
    hazardCharacteristics?: Record<string, boolean>;
    leachateMgL?: Record<string, number>;
    solubilizateMgL?: Record<string, number>;
    inertTestPassed?: boolean;
}): { classNBR: string; hazardScore: number; hazardCodes: string[]; exceedances: string[]; disposalRoute: string } {
    if (typeof hazardCharacteristics !== 'object' || hazardCharacteristics === null)
        throw new TypeError('hazardCharacteristics must be an object');

    const hazardCodes: string[] = [];
    let hazardScore = 0;

    // Avaliar cada característica de periculosidade
    for (const [key, meta] of Object.entries(HAZARD_CHAR)) {
        if (hazardCharacteristics[key] === true) {
            hazardCodes.push(meta.code);
            hazardScore += meta.weight;
        }
    }

    // Verificar excedências no ensaio de lixiviação (NBR 10005)
    const exceedances: string[] = [];
    for (const [element, limit] of Object.entries(LEACHATE_LIMITS_MG_L)) {
        const measured = leachateMgL[element];
        if (typeof measured === 'number' && measured > limit) {
            exceedances.push(`leachate:${element}(${measured}>${limit}mg/L)`);
            if (!hazardCodes.includes('T')) {
                hazardCodes.push('T');
                hazardScore += HAZARD_CHAR.toxic!.weight;
            }
        }
    }

    // Verificar excedências no ensaio de solubilização (NBR 10006)
    const solubExceedances: string[] = [];
    for (const [element, limit] of Object.entries(SOLUBILIZATE_LIMITS_MG_L)) {
        const measured = solubilizateMgL[element];
        if (typeof measured === 'number' && measured > limit) {
            solubExceedances.push(`solubilizate:${element}(${measured}>${limit}mg/L)`);
        }
    }
    exceedances.push(...solubExceedances);

    // Classificação NBR 10004
    let classNBR: string;
    if (hazardScore > 0 || exceedances.some((e) => e.startsWith('leachate:'))) {
        classNBR = 'I'; // Perigoso
    } else if (solubExceedances.length > 0 || !inertTestPassed) {
        classNBR = 'IIA'; // Não-inerte
    } else {
        classNBR = 'IIB'; // Inerte
    }

    // Rota de destinação recomendada
    const disposalRoute = getDisposalRoute(classNBR, hazardCodes);

    return { classNBR, hazardScore, hazardCodes: [...new Set(hazardCodes)], exceedances, disposalRoute };
}

/**
 * Determines recommended disposal route based on waste class and hazard codes.
 * Rota de destinação recomendada conforme classe e características.
 *
 * @param {string}   classNBR    - 'I', 'IIA', or 'IIB'
 * @param {string[]} hazardCodes - Array of hazard codes (F, C, R, T, P, E, K)
 * @returns {string} Recommended disposal route description
 */
export function getDisposalRoute(classNBR: string, hazardCodes: string[] = []): string {
    if (!['I', 'IIA', 'IIB'].includes(classNBR)) throw new RangeError('classNBR must be I, IIA, or IIB');
    if (!Array.isArray(hazardCodes)) throw new TypeError('hazardCodes must be an array');

    if (classNBR === 'IIB') return 'Aterro Classe III (inerte) — NBR 13591';

    if (classNBR === 'IIA') {
        return 'Aterro Classe II (não-inerte) — co-processamento ou tratamento biológico/físico-químico';
    }

    // Classe I - escolha por hierarquia de periculosidade
    if (hazardCodes.includes('P')) return 'Incineração em forno de alta temperatura (patogênico) — RDC ANVISA 222/2018';
    if (hazardCodes.includes('K'))
        return 'Co-processamento em forno de cimento + incineração — Resolução CONAMA 264/1999';
    if (hazardCodes.includes('R')) return 'Tratamento físico-químico controlado + aterro industrial Classe I';
    if (hazardCodes.includes('T') || hazardCodes.includes('E'))
        return 'Aterro industrial Classe I (impermeabilizado duplo) — NBR 10157';
    return 'Aterro industrial Classe I — tratamento prévio recomendado';
}

/**
 * Evaluates Basel Convention transboundary shipment eligibility.
 * Elegibilidade para movimentação transfronteiriça conforme Convenção de Basileia.
 *
 * @param {object} params
 * @param {string}   params.classNBR         - NBR 10004 class (I, IIA, IIB)
 * @param {string[]} params.baselAnnexes     - Applicable Basel Annexes: 'I','II','III','IV','VIII','IX'
 * @param {string}   params.exportCountry    - ISO 3166-1 alpha-2 exporting country code
 * @param {string}   params.importCountry    - ISO 3166-1 alpha-2 importing country code
 * @returns {{ eligible: boolean, restrictions: string[], requiredProcedure: string }}
 */
export function evalBaselShipmentEligibility({
    classNBR,
    baselAnnexes,
    exportCountry,
    importCountry,
}: {
    classNBR: string;
    baselAnnexes: string[];
    exportCountry: string;
    importCountry: string;
}): { eligible: boolean; restrictions: string[]; requiredProcedure: string } {
    if (!['I', 'IIA', 'IIB'].includes(classNBR)) throw new RangeError('classNBR must be I, IIA, or IIB');
    if (!Array.isArray(baselAnnexes)) throw new TypeError('baselAnnexes must be an array');
    if (typeof exportCountry !== 'string' || exportCountry.length !== 2)
        throw new TypeError('exportCountry must be a 2-letter ISO code');
    if (typeof importCountry !== 'string' || importCountry.length !== 2)
        throw new TypeError('importCountry must be a 2-letter ISO code');

    const restrictions: string[] = [];
    let eligible = true;

    // Anexo VIII → resíduo perigoso Basel (lista A)
    const isHazardous = baselAnnexes.includes('VIII') || classNBR === 'I';
    // Anexo IX → não perigoso Basel (lista B) - exceto se contaminação tornar perigoso
    const isListed = baselAnnexes.includes('IX');

    if (isHazardous) {
        // OCDE Decision C(2001)107: exportação de países não-OCDE para OCDE é proibida para valorização
        if (['BR', 'IN', 'CN', 'PH', 'MY'].includes(exportCountry.toUpperCase())) {
            restrictions.push('Basel Ban Amendment (1995) — proibição de exportação de países não-OCDE');
            eligible = false;
        }
        restrictions.push('Prior Informed Consent (PIC) obrigatório — Art. 6 Convenção de Basileia');
    }

    if (!isHazardous && isListed) {
        restrictions.push('Notificação simplificada para resíduos da Lista B');
    }

    let requiredProcedure: string;
    if (!eligible) {
        requiredProcedure = 'Movimentação proibida — tratar e dispor no país de origem';
    } else if (isHazardous) {
        requiredProcedure = 'PIC completo: notificação escrita, consentimento expresso das autoridades competentes';
    } else {
        requiredProcedure = 'Notificação por movimento (documento de acompanhamento)';
    }

    return { eligible, restrictions, requiredProcedure };
}

/**
 * Computes composite hazard index from multiple waste streams for blended waste.
 * Índice de periculosidade composto para mistura de resíduos industriais.
 *
 * @param {Array<{fraction: number, hazardScore: number, classNBR: string}>} streams
 *   - Array of waste streams with mass fraction [0,1] and hazard score
 * @returns {{ compositeScore: number, blendedClass: string, maxScore: number }}
 */
export function calcCompositeHazardIndex(
    streams: Array<{ fraction: number; hazardScore: number; classNBR: string }>,
): { compositeScore: number; blendedClass: string; maxScore: number } {
    if (!Array.isArray(streams) || streams.length === 0) throw new TypeError('streams must be a non-empty array');

    const totalFraction = streams.reduce((s, w) => s + (w.fraction ?? 0), 0);
    if (Math.abs(totalFraction - 1.0) > 0.01)
        throw new RangeError(`Stream fractions must sum to 1.0 (got ${totalFraction.toFixed(3)})`);

    let compositeScore = 0;
    let maxScore = 0;

    for (const stream of streams) {
        if (typeof stream.fraction !== 'number' || stream.fraction < 0)
            throw new RangeError('Each stream.fraction must be >= 0');
        if (typeof stream.hazardScore !== 'number' || stream.hazardScore < 0)
            throw new RangeError('Each stream.hazardScore must be >= 0');

        compositeScore += stream.fraction * stream.hazardScore;
        if (stream.hazardScore > maxScore) maxScore = stream.hazardScore;
    }

    // NBR 10004: mistura com qualquer componente Classe I → resultado é Classe I
    const hasClassI = streams.some((s) => s.classNBR === 'I');
    const hasClassIIA = streams.some((s) => s.classNBR === 'IIA');
    let blendedClass: string;
    if (hasClassI) blendedClass = 'I';
    else if (hasClassIIA) blendedClass = 'IIA';
    else blendedClass = 'IIB';

    return { compositeScore, blendedClass, maxScore };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const industrialWasteClassificationMeta = {
    name: 'industrialWasteClassification',
    description: 'industrialWasteClassification',
    category: 'analytics',
    familyTags: ['industrial', 'waste'],
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
