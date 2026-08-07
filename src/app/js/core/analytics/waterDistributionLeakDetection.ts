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
'use strict';

/**
 * Water Distribution Leak Detection - ILI + UARL (IWA/AWWA).
 * Deteccao de perdas em redes de distribuicao de agua potavel.
 *
 * References:
 *   IWA/AWWA (2000) Manual of Best Practice - Performance Indicators for Water Supply Services.
 *   Lambert A. (2003) Assessing Non-Revenue Water and its Components. Water Supply 3(1-2):1-8.
 *     DOI: 10.2166/ws.2003.0005
 *   Farley M. & Trow S. (2003) Losses in Water Distribution Networks. IWA Publishing.
 */

/**
 * Calcula o UARL - Unavoidable Annual Real Losses (L/dia).
 * Formula IWA: UARL = (18 * Lm + 0.8 * Nc + 25 * Lp) * P
 *   Lm = comprimento de main pipes (km)
 *   Nc = numero de conexoes de servico
 *   Lp = comprimento de service pipes (km, do ramal ao medidor)
 *   P  = pressao media (mH2O)
 *
 * @param {number} connectionLength_km - Comprimento total de tubulacao principal (km)
 * @param {number} serviceConnections - Numero de conexoes de servico (ramais)
 * @param {number} pressure_m - Pressao media de operacao (metros de coluna d'agua)
 * @param {number} [serviceLength_km=0] - Comprimento de ramal do medidor (km); default 0
 * @returns {number} UARL em litros/dia
 */
export function calcUARL(connectionLength_km: any, serviceConnections: any, pressure_m: any, serviceLength_km = 0) {
    if (typeof connectionLength_km !== 'number' || !isFinite(connectionLength_km) || connectionLength_km < 0) {
        throw new RangeError('connectionLength_km must be a non-negative finite number');
    }
    if (typeof serviceConnections !== 'number' || !isFinite(serviceConnections) || serviceConnections < 0) {
        throw new RangeError('serviceConnections must be a non-negative finite number');
    }
    if (typeof pressure_m !== 'number' || !isFinite(pressure_m) || pressure_m <= 0) {
        throw new RangeError('pressure_m must be a positive finite number');
    }
    if (typeof serviceLength_km !== 'number' || !isFinite(serviceLength_km) || serviceLength_km < 0) {
        throw new RangeError('serviceLength_km must be a non-negative finite number');
    }
    return (18 * connectionLength_km + 0.8 * serviceConnections + 25 * serviceLength_km) * pressure_m;
}

/**
 * Calcula o ILI - Infrastructure Leakage Index (adimensional).
 * ILI = CARL / UARL
 *   CARL = Current Annual Real Losses (L/dia)
 *   ILI = 1 => desempenho minimo tecnicamente alcancavel
 *
 * @param {number} CARL - Perdas reais anuais atuais (L/dia)
 * @param {number} UARL - Perdas inevitaveis anuais (L/dia) via calcUARL()
 * @returns {number} ILI (adimensional)
 */
export function calcILI(CARL: any, UARL: any) {
    if (typeof CARL !== 'number' || !isFinite(CARL) || CARL < 0) {
        throw new RangeError('CARL must be a non-negative finite number');
    }
    if (typeof UARL !== 'number' || !isFinite(UARL) || UARL <= 0) {
        throw new RangeError('UARL must be a positive finite number');
    }
    return CARL / UARL;
}

/**
 * Calcula a Agua Nao Faturada (NRW - Non-Revenue Water).
 * NRW = systemInput - billed_authorised
 *
 * @param {number} systemInput - Volume total introducido no sistema (m3/periodo)
 * @param {number} billed_authorised - Volume faturado autorizado (m3/periodo)
 * @returns {{ NRW_m3: number, NRW_pct: number }}
 */
export function calcNRW(systemInput: any, billed_authorised: any) {
    if (typeof systemInput !== 'number' || !isFinite(systemInput) || systemInput <= 0) {
        throw new RangeError('systemInput must be a positive finite number');
    }
    if (typeof billed_authorised !== 'number' || !isFinite(billed_authorised) || billed_authorised < 0) {
        throw new RangeError('billed_authorised must be a non-negative finite number');
    }
    if (billed_authorised > systemInput) {
        throw new RangeError('billed_authorised cannot exceed systemInput');
    }
    const NRW_m3 = systemInput - billed_authorised;
    const NRW_pct = (NRW_m3 / systemInput) * 100;
    return { NRW_m3, NRW_pct };
}

/**
 * Classifica o desempenho de vazamentos com base no ILI (Lambert 2003).
 * A1 (ILI 1-2): excelente; A2 (2-4): bom; B (4-8): razoavel; C (8-16): ruim; D (>16): muito ruim.
 *
 * @param {number} ILI - Infrastructure Leakage Index
 * @returns {'A1_excellent'|'A2_good'|'B_fair'|'C_poor'|'D_very_poor'} Classificacao
 */
export function classifyLeakagePerformance(ILI: any) {
    if (typeof ILI !== 'number' || !isFinite(ILI) || ILI <= 0) {
        throw new RangeError('ILI must be a positive finite number');
    }
    if (ILI <= 2) return 'A1_excellent';
    if (ILI <= 4) return 'A2_good';
    if (ILI <= 8) return 'B_fair';
    if (ILI <= 16) return 'C_poor';
    return 'D_very_poor';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const waterDistributionLeakDetectionMeta = {
    name: 'waterDistributionLeakDetection',
    description: 'waterDistributionLeakDetection',
    category: 'analytics',
    familyTags: ['water'],
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
