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
 * Environmental Contaminant Transport (Water) Schema - Schema de transporte
 * de contaminantes em aguas subterraneas para licenciamento e remediacao
 * de areas contaminadas.
 *
 * Modela adveccao, dispersao, retardo por adsorcao (Koc/foc) e biodegradacao
 * em aquiferos, usando a solucao analitica de Domenico-Schwartz (1998) para
 * 1D advection-dispersion com decay de primeira ordem. Suporta avaliacao
 * de risco para ACBR (Acoes Corretivas Baseadas no Risco) sob CETESB,
 * licenciamento de empreendimentos com potencial poluidor (CONAMA 396/2008)
 * e gestao de outorga de uso de aguas (Lei 9.433/1997 / ANA).
 *
 * Referencias regulatorias e cientificas:
 *  - Domenico, P.A. & Schwartz, F.W. (1998). Physical and Chemical
 *    Hydrogeology, 2nd ed. John Wiley & Sons, New York. (Analytical
 *    solution for 1D advection-dispersion-reaction)
 *  - Bear, J. (1972). Dynamics of Fluids in Porous Media. American
 *    Elsevier, New York. (Darcy law, dispersion coefficient theory)
 *  - Fetter, C.W. (2001). Applied Hydrogeology, 4th ed. Prentice-Hall.
 *  - Wiedemeier, T.H. et al. (1999). Natural Attenuation of Fuels and
 *    Chlorinated Solvents in the Subsurface. Wiley.
 *  - Brasil - CONAMA Resolucao 396/2008 (classificacao e enquadramento
 *    de aguas subterraneas).
 *  - Brasil - CETESB Decisao de Diretoria 263/2009 (gerenciamento de
 *    areas contaminadas - modelo conceitual).
 *  - Brasil - Lei n. 9.433/1997 (Politica Nacional de Recursos Hidricos);
 *    ANA Resolucao 707/2004 (outorga).
 *  - U.S. EPA (1996). Soil Screening Guidance: Technical Background
 *    Document. EPA/540/R-95/128. (Retardation and partitioning).
 *
 * Zero dependencias DOM/IDB/Three.js/fetch. Pure-logic.
 * @module environmentalContaminantTransportWaterSchema
 */

/** Regimes dominantes de transporte. */
export const TRANSPORT_REGIME = Object.freeze({
    ADVECTIVE: 'ADVECTIVE',
    DISPERSIVE: 'DISPERSIVE',
    ADSORPTIVE: 'ADSORPTIVE',
    BIODEGRADATION: 'BIODEGRADATION',
    MIXED: 'MIXED',
});

/** Tipos hidrogeologicos de aquifero. */
export const AQUIFER_TYPE = Object.freeze({
    UNCONFINED: 'UNCONFINED',
    CONFINED: 'CONFINED',
    SEMI_CONFINED: 'SEMI_CONFINED',
    FRACTURED_ROCK: 'FRACTURED_ROCK',
    KARST: 'KARST',
});

/** Comportamento ambiental do contaminante (fate). */
export const CONTAMINANT_FATE = Object.freeze({
    PERSISTENT: 'PERSISTENT',
    MODERATELY_DEGRADABLE: 'MODERATELY_DEGRADABLE',
    EASILY_DEGRADABLE: 'EASILY_DEGRADABLE',
    VOLATILE_FATE: 'VOLATILE_FATE',
    DENSER_THAN_WATER_DNAPL: 'DENSER_THAN_WATER_DNAPL',
    LIGHTER_THAN_WATER_LNAPL: 'LIGHTER_THAN_WATER_LNAPL',
});

/** Dimensoes suportadas pelo modelo conceitual. */
export const MODEL_DIMENSION = Object.freeze({
    ONE_D: 'ONE_D',
    TWO_D: 'TWO_D',
    THREE_D: 'THREE_D',
});

/** Codigos de erro emitidos pelo schema. */
export const WATER_TRANSPORT_ERROR = Object.freeze({
    INVALID_AQUIFER: 'INVALID_AQUIFER',
    INVALID_REGIME: 'INVALID_REGIME',
    INVALID_PARAM: 'INVALID_PARAM',
});

/**
 * Densidade aparente tipica de aquiferos sedimentares (kg/m^3).
 * Fonte: Bear (1972), Fetter (2001) - usar 1700 como default robusto.
 */
export const BULK_DENSITY_KG_M3 = 1700;

/**
 * Meias-vidas tipicas de biodegradacao em aquiferos (dias). Calibradas
 * a partir de Wiedemeier et al. (1999) e EPA Onsite Wastewater Manual.
 * PERSISTENT recebe Infinity (sem decay).
 */
export const BIODEGRADATION_HALF_LIFE_DAYS = Object.freeze({
    PERSISTENT: Infinity,
    MODERATELY_DEGRADABLE: 365,
    EASILY_DEGRADABLE: 30,
    VOLATILE_FATE: 60,
    DENSER_THAN_WATER_DNAPL: 730,
    LIGHTER_THAN_WATER_LNAPL: 180,
});

/**
 * Coeficientes de dispersao tipicos por dimensionalidade (m^2/dia).
 * Calibrados em Bear (1972) para aquiferos arenosos homogeneos.
 */
export const DISPERSION_COEFF_M2_PER_DAY = Object.freeze({
    ONE_D: 0.5,
    TWO_D: 1.0,
    THREE_D: 2.0,
});

/** Comprimento maximo de pluma considerado em avaliacao de licenciamento. */
export const MAX_PLUME_LENGTH_M = 3000;

/** Identidade do modulo. */
export const WATER_TRANSPORT_META = Object.freeze({
    spec: 'WATER_TRANSPORT_SCHEMA_001',
    deliveredAt: '2026-05-02',
    framework: 'Domenico-Schwartz-Bear',
    regimes: Object.values(TRANSPORT_REGIME),
});

/** Erro tipado lancado pelo schema. */
export class WaterTransportError extends Error {
    code: string;

    /**
     * @param {string} code
     * @param {string} [message?]
     */
    constructor(code: string, message?: string) {
        super(message || code);
        this.name = 'WaterTransportError';
        this.code = code;
    }
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/** @param {unknown} v */
function isPositiveFinite(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/** @param {unknown} v */
function isNonNegativeFinite(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

/**
 * Aproximacao de erfc (complementary error function) usando expansao
 * de Abramowitz & Stegun (1964) eq. 7.1.26 - erro maximo ~1.5e-7.
 * @param {number} x
 * @returns {number} erfc(x)
 */
function erfcApprox(x: number): number {
    const sign = x < 0 ? -1 : 1;
    const ax = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * ax);
    const y =
        1 -
        ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
            t *
            Math.exp(-ax * ax);
    const erfVal = sign * y;
    return 1 - erfVal;
}

interface AquiferRecord {
    aquiferId: string;
    type: string;
    hydraulicConductivityMperD: number;
    gradientMperM: number;
    porosityNe: number;
    organicCarbonFractionFoc: number;
    darcyVelocityMperD: number;
    seepageVelocityMperD: number;
}

interface ContaminantTransportRecord {
    transportId: string;
    aquiferId: string;
    contaminantId: string;
    sourceConcentrationMgL: number;
    kocLperKg: number;
    fate: string;
    dimension: string;
}

interface CreateAquiferInput {
    aquiferId?: string;
    type?: string;
    hydraulicConductivityMperD?: number;
    gradientMperM?: number;
    porosityNe?: number;
    organicCarbonFractionFoc?: number;
}

interface CreateContaminantTransportInput {
    transportId?: string;
    aquiferId?: string;
    contaminantId?: string;
    sourceConcentrationMgL?: number;
    kocLperKg?: number;
    fate?: string;
    dimension?: string;
}

/**
 * Computa fator de retardo R = 1 + (Koc * foc * rho_b) / (ne * 1000).
 * Conversao 1000: Koc em L/kg, rho_b em kg/m^3 → m^3 base.
 *
 * Fonte: U.S. EPA Soil Screening Guidance (1996) equacao 13.
 *
 * @param {number} Koc - coeficiente de adsorcao no carbono organico (L/kg)
 * @param {number} foc - fracao de carbono organico (admimensional)
 * @param {number} ne - porosidade efetiva (admimensional, 0 < ne < 1)
 * @returns {number} R (>= 1)
 */
export function RETARDATION_FACTOR_KOC_TO_R(Koc: number, foc: number, ne: number): number {
    if (!isNonNegativeFinite(Koc)) {
        throw new WaterTransportError(WATER_TRANSPORT_ERROR.INVALID_PARAM, 'Koc must be >= 0');
    }
    if (!isNonNegativeFinite(foc)) {
        throw new WaterTransportError(WATER_TRANSPORT_ERROR.INVALID_PARAM, 'foc must be >= 0');
    }
    if (!isPositiveFinite(ne) || ne >= 1) {
        throw new WaterTransportError(WATER_TRANSPORT_ERROR.INVALID_PARAM, 'ne must be in (0,1)');
    }
    return 1 + (Koc * foc * BULK_DENSITY_KG_M3) / (ne * 1000);
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

/**
 * Cria registro frozen de aquifero. Computa velocidades Darcy e seepage
 * automaticamente.
 *
 * Formulas:
 *  - darcyVelocity = K * i (Darcy 1856)
 *  - seepageVelocity = darcyVelocity / ne (velocidade real da agua)
 *
 * @param {CreateAquiferInput} [input]
 * @returns {Readonly<AquiferRecord>} frozen aquifer record
 */
export function createAquifer({
    aquiferId,
    type,
    hydraulicConductivityMperD,
    gradientMperM,
    porosityNe,
    organicCarbonFractionFoc = 0.001,
}: CreateAquiferInput = {}): Readonly<AquiferRecord> {
    if (typeof aquiferId !== 'string' || aquiferId.trim().length === 0) {
        throw new WaterTransportError(WATER_TRANSPORT_ERROR.INVALID_AQUIFER, 'aquiferId must be non-empty string');
    }
    if (!(Object.values(AQUIFER_TYPE) as string[]).includes(type as string)) {
        throw new WaterTransportError(WATER_TRANSPORT_ERROR.INVALID_AQUIFER, `unknown type: ${type}`);
    }
    if (!isPositiveFinite(hydraulicConductivityMperD)) {
        throw new WaterTransportError(WATER_TRANSPORT_ERROR.INVALID_PARAM, 'hydraulicConductivityMperD must be > 0');
    }
    if (!isNonNegativeFinite(gradientMperM)) {
        throw new WaterTransportError(WATER_TRANSPORT_ERROR.INVALID_PARAM, 'gradientMperM must be >= 0');
    }
    if (!isPositiveFinite(porosityNe) || (porosityNe as number) >= 1) {
        throw new WaterTransportError(WATER_TRANSPORT_ERROR.INVALID_PARAM, 'porosityNe must be in (0,1)');
    }
    if (!isNonNegativeFinite(organicCarbonFractionFoc)) {
        throw new WaterTransportError(WATER_TRANSPORT_ERROR.INVALID_PARAM, 'organicCarbonFractionFoc must be >= 0');
    }

    const darcyVelocityMperD = (hydraulicConductivityMperD as number) * (gradientMperM as number);
    const seepageVelocityMperD = darcyVelocityMperD / (porosityNe as number);

    return Object.freeze({
        aquiferId,
        type,
        hydraulicConductivityMperD,
        gradientMperM,
        porosityNe,
        organicCarbonFractionFoc,
        darcyVelocityMperD,
        seepageVelocityMperD,
    } as AquiferRecord);
}

/**
 * Cria registro frozen de transporte de contaminante.
 *
 * @param {CreateContaminantTransportInput} [input]
 * @returns {Readonly<ContaminantTransportRecord>} frozen transport record
 */
export function createContaminantTransport({
    transportId,
    aquiferId,
    contaminantId,
    sourceConcentrationMgL,
    kocLperKg,
    fate,
    dimension = MODEL_DIMENSION.ONE_D,
}: CreateContaminantTransportInput = {}): Readonly<ContaminantTransportRecord> {
    if (typeof transportId !== 'string' || transportId.trim().length === 0) {
        throw new WaterTransportError(WATER_TRANSPORT_ERROR.INVALID_PARAM, 'transportId must be non-empty string');
    }
    if (typeof aquiferId !== 'string' || aquiferId.trim().length === 0) {
        throw new WaterTransportError(WATER_TRANSPORT_ERROR.INVALID_PARAM, 'aquiferId must be non-empty string');
    }
    if (typeof contaminantId !== 'string' || contaminantId.trim().length === 0) {
        throw new WaterTransportError(WATER_TRANSPORT_ERROR.INVALID_PARAM, 'contaminantId must be non-empty string');
    }
    if (!isNonNegativeFinite(sourceConcentrationMgL)) {
        throw new WaterTransportError(WATER_TRANSPORT_ERROR.INVALID_PARAM, 'sourceConcentrationMgL must be >= 0');
    }
    if (!isNonNegativeFinite(kocLperKg)) {
        throw new WaterTransportError(WATER_TRANSPORT_ERROR.INVALID_PARAM, 'kocLperKg must be >= 0');
    }
    if (!(Object.values(CONTAMINANT_FATE) as string[]).includes(fate as string)) {
        throw new WaterTransportError(WATER_TRANSPORT_ERROR.INVALID_PARAM, `unknown fate: ${fate}`);
    }
    if (!(Object.values(MODEL_DIMENSION) as string[]).includes(dimension)) {
        throw new WaterTransportError(WATER_TRANSPORT_ERROR.INVALID_PARAM, `unknown dimension: ${dimension}`);
    }

    return Object.freeze({
        transportId,
        aquiferId,
        contaminantId,
        sourceConcentrationMgL,
        kocLperKg,
        fate,
        dimension,
    } as ContaminantTransportRecord);
}

/**
 * Computa fator de retardo R para uma combinacao aquifero+contaminante.
 *
 * @param {AquiferRecord} aquifer
 * @param {ContaminantTransportRecord} transport
 * @returns {number} R (>= 1)
 */
export function computeRetardationFactor(
    aquifer: AquiferRecord,
    transport: ContaminantTransportRecord,
): number {
    if (!aquifer || typeof aquifer !== 'object') {
        throw new WaterTransportError(WATER_TRANSPORT_ERROR.INVALID_AQUIFER, 'aquifer must be object');
    }
    if (!transport || typeof transport !== 'object') {
        throw new WaterTransportError(WATER_TRANSPORT_ERROR.INVALID_PARAM, 'transport must be object');
    }
    return RETARDATION_FACTOR_KOC_TO_R(transport.kocLperKg, aquifer.organicCarbonFractionFoc, aquifer.porosityNe);
}

/**
 * Computa concentracao C(x,t) em pluma 1D advection-dispersion-reaction
 * conforme Domenico & Schwartz (1998).
 *
 *   C(x,t) = (C0/2) * erfc[(x - v*t/R) / (2*sqrt(D*t/R))] * exp(-lambda*t)
 *
 * onde lambda = ln(2) / halfLife (decay de 1a ordem).
 *
 * @param {AquiferRecord} aquifer
 * @param {ContaminantTransportRecord} transport
 * @param {number} timeDay tempo decorrido desde inicio da fonte (>= 0)
 * @param {number} distanceM distancia desde a fonte (>= 0)
 * @returns {number} concentracao em mg/L
 */
export function computePlumeAtTime(
    aquifer: AquiferRecord,
    transport: ContaminantTransportRecord,
    timeDay: number,
    distanceM: number,
): number {
    if (!aquifer || typeof aquifer !== 'object') {
        throw new WaterTransportError(WATER_TRANSPORT_ERROR.INVALID_AQUIFER, 'aquifer must be object');
    }
    if (!transport || typeof transport !== 'object') {
        throw new WaterTransportError(WATER_TRANSPORT_ERROR.INVALID_PARAM, 'transport must be object');
    }
    if (!isNonNegativeFinite(timeDay)) {
        throw new WaterTransportError(WATER_TRANSPORT_ERROR.INVALID_PARAM, 'timeDay must be >= 0');
    }
    if (!isNonNegativeFinite(distanceM)) {
        throw new WaterTransportError(WATER_TRANSPORT_ERROR.INVALID_PARAM, 'distanceM must be >= 0');
    }
    if (timeDay === 0) return 0;

    const C0 = transport.sourceConcentrationMgL;
    const v = aquifer.seepageVelocityMperD;
    const R = computeRetardationFactor(aquifer, transport);
    const D =
        (DISPERSION_COEFF_M2_PER_DAY as Record<string, number>)[transport.dimension] ||
        DISPERSION_COEFF_M2_PER_DAY.ONE_D;
    const halfLife = (BIODEGRADATION_HALF_LIFE_DAYS as Record<string, number>)[transport.fate];
    const lambda = Number.isFinite(halfLife) && (halfLife as number) > 0 ? Math.LN2 / (halfLife as number) : 0;

    const denomSq = (4 * D * timeDay) / R;
    if (denomSq <= 0) return 0;
    const denom = 2 * Math.sqrt((D * timeDay) / R);
    const arg = (distanceM - (v * timeDay) / R) / denom;
    const erfcVal = erfcApprox(arg);
    const decay = Math.exp(-lambda * timeDay);
    const c = 0.5 * C0 * erfcVal * decay;
    return c < 0 ? 0 : c;
}

/**
 * Avalia estabilidade da pluma. Calcula attenuationFactor (decay sozinho)
 * e flag se pluma atinge MAX_PLUME_LENGTH_M na concentracao 1% da fonte.
 *
 * @param {AquiferRecord} aquifer
 * @param {ContaminantTransportRecord} transport
 * @param {number} timeDay
 * @returns {Readonly<{reachLengthM: number, reachesMaxLength: boolean, plumeAge: number, attenuationFactor: number}>} frozen stability assessment
 */
export function assessPlumeStability(
    aquifer: AquiferRecord,
    transport: ContaminantTransportRecord,
    timeDay: number,
): Readonly<{ reachLengthM: number; reachesMaxLength: boolean; plumeAge: number; attenuationFactor: number }> {
    if (!aquifer || typeof aquifer !== 'object') {
        throw new WaterTransportError(WATER_TRANSPORT_ERROR.INVALID_AQUIFER, 'aquifer must be object');
    }
    if (!transport || typeof transport !== 'object') {
        throw new WaterTransportError(WATER_TRANSPORT_ERROR.INVALID_PARAM, 'transport must be object');
    }
    if (!isNonNegativeFinite(timeDay)) {
        throw new WaterTransportError(WATER_TRANSPORT_ERROR.INVALID_PARAM, 'timeDay must be >= 0');
    }
    const halfLife = (BIODEGRADATION_HALF_LIFE_DAYS as Record<string, number>)[transport.fate];
    const lambda = Number.isFinite(halfLife) && (halfLife as number) > 0 ? Math.LN2 / (halfLife as number) : 0;
    const attenuationFactor = Math.exp(-lambda * timeDay);

    // Estimar comprimento da pluma onde C(x) = 0.01 * C0 - busca simples.
    let reachLengthM = 0;
    const stepM = 50;
    for (let x = 0; x <= MAX_PLUME_LENGTH_M; x += stepM) {
        const c = computePlumeAtTime(aquifer, transport, timeDay, x);
        if (transport.sourceConcentrationMgL > 0 && c >= 0.01 * transport.sourceConcentrationMgL) {
            reachLengthM = x;
        }
    }
    const reachesMaxLength = reachLengthM >= MAX_PLUME_LENGTH_M;

    return Object.freeze({
        reachLengthM,
        reachesMaxLength,
        plumeAge: timeDay,
        attenuationFactor,
    });
}

function sanitizeAquifers(aquifers: Array<AquiferRecord>): Array<AquiferRecord> {
    return Array.isArray(aquifers) ? aquifers.filter((a) => a && typeof a === 'object') : [];
}

function sanitizeTransports(transports: Array<ContaminantTransportRecord>): Array<ContaminantTransportRecord> {
    return Array.isArray(transports) ? transports.filter((t) => t && typeof t === 'object') : [];
}

function buildFateDistribution(transports: Array<ContaminantTransportRecord>): Record<string, number> {
    const fateDistribution: Record<string, number> = {
        [CONTAMINANT_FATE.PERSISTENT]: 0,
        [CONTAMINANT_FATE.MODERATELY_DEGRADABLE]: 0,
        [CONTAMINANT_FATE.EASILY_DEGRADABLE]: 0,
        [CONTAMINANT_FATE.VOLATILE_FATE]: 0,
        [CONTAMINANT_FATE.DENSER_THAN_WATER_DNAPL]: 0,
        [CONTAMINANT_FATE.LIGHTER_THAN_WATER_LNAPL]: 0,
    };
    for (const t of transports) {
        const fate = t.fate;
        if (fate && Object.prototype.hasOwnProperty.call(fateDistribution, fate)) {
            fateDistribution[fate] = (fateDistribution[fate] ?? 0) + 1;
        }
    }
    return fateDistribution;
}

function computeAverageRetardation(
    aquifers: Array<AquiferRecord>,
    transports: Array<ContaminantTransportRecord>,
): number {
    let retSum = 0;
    let retCount = 0;
    for (const tx of transports) {
        const aq = aquifers.find((a) => a.aquiferId === tx.aquiferId);
        if (!aq) continue;
        try {
            const R = computeRetardationFactor(aq, tx);
            if (Number.isFinite(R)) {
                retSum += R;
                retCount += 1;
            }
        } catch (e: unknown) {
            console.debug('[water-transport:retardation]', (e as Error | undefined)?.message ?? e);
        }
    }
    return retCount > 0 ? retSum / retCount : 0;
}

function computeLongestPlumeM(
    aquifers: Array<AquiferRecord>,
    transports: Array<ContaminantTransportRecord>,
): number {
    let longestPlumeM = 0;
    for (const tx of transports) {
        const aq = aquifers.find((a) => a.aquiferId === tx.aquiferId);
        if (!aq) continue;
        try {
            const stab = assessPlumeStability(aq, tx, 365);
            if (stab.reachLengthM > longestPlumeM) longestPlumeM = stab.reachLengthM;
        } catch (e: unknown) {
            console.debug('[water-transport:stability]', (e as Error | undefined)?.message ?? e);
        }
    }
    return longestPlumeM;
}

/**
 * Constroi relatorio agregado frozen sobre conjuntos de aquiferos e
 * transportes de contaminantes.
 *
 * @param {Array<AquiferRecord>} aquifers
 * @param {Array<ContaminantTransportRecord>} transports
 * @returns {Readonly<{totalAquifers: number, totalTransports: number, avgRetardation: number, longestPlumeM: number, fateDistribution: Readonly<Record<string,number>>}>} frozen report
 */
export function buildTransportReport(
    aquifers: Array<AquiferRecord>,
    transports: Array<ContaminantTransportRecord>,
): Readonly<{
    totalAquifers: number;
    totalTransports: number;
    avgRetardation: number;
    longestPlumeM: number;
    fateDistribution: Readonly<Record<string, number>>;
}> {
    const safeAq = sanitizeAquifers(aquifers);
    const safeTx = sanitizeTransports(transports);

    return Object.freeze({
        totalAquifers: safeAq.length,
        totalTransports: safeTx.length,
        avgRetardation: computeAverageRetardation(safeAq, safeTx),
        longestPlumeM: computeLongestPlumeM(safeAq, safeTx),
        fateDistribution: Object.freeze({ ...buildFateDistribution(safeTx) }),
    });
}
