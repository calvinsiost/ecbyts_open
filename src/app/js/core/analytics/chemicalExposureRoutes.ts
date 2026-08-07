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
// Application: EHS & Mining - Chemical Exposure Routes Assessment
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

'use strict';

interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: string;
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
    };
    inputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
}

/**
 * Chemical Exposure Routes - Multi-Pathway Human Health Risk Assessment
 *
 * Módulo puro para avaliação de exposição química por múltiplas rotas:
 * inalação, dermal e ingestão segundo metodologia USEPA RAGS.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - US EPA (1992). Dermal Exposure Assessment: Principles and Applications.
 *     EPA/600/8-91/011B. Washington, DC: US EPA Office of Research and
 *     Development. (dermal exposure equations)
 *   - US EPA (2004). Risk Assessment Guidance for Superfund (RAGS) Volume I:
 *     Human Health Evaluation Manual (Part E). EPA/540/R/99/005. Washington,
 *     DC: US EPA. (multi-route exposure framework, averaging time)
 *   - CalEPA (2012). Air Toxics Hot Spots Program Risk Assessment Guidelines,
 *     Part II: Technical Support Document for Cancer Potency Factors. Sacramento,
 *     CA: CalEPA OEHHA. (carcinogenic averaging time 70 years)
 */

/** Default averaging time for carcinogens (years) / Tempo de média para carcinógenos (anos) */
const DEFAULT_AT_YEARS = 70;

/**
 * Compute inhalation chronic daily intake (CDI).
 * Calcula a dose diária crônica por inalação.
 *
 * Formula: DI = (C × IR × ET × EF) / (BW × AT × 365 × 1000)
 *   C  = air concentration (µg/m³ → mg/m³ via /1000)
 *   IR = inhalation rate (m³/h)
 *   ET = exposure time (h/day)
 *   EF = exposure days (days/year or total days)
 *   BW = body weight (kg)
 *   AT = averaging time (years, default 70 for carcinogens)
 *
 * @param concentration_ug_m3 - Air concentration (µg/m³) / Concentração no ar (µg/m³)
 * @param inhalationRate_m3_h - Inhalation rate (m³/h) / Taxa de inalação (m³/h)
 * @param exposureHours - Daily exposure duration (h/day) / Duração de exposição diária (h/dia)
 * @param exposureDays - Total exposure duration (days) / Duração total de exposição (dias)
 * @param bodyWeight_kg - Body weight (kg) / Peso corporal (kg)
 * @param averagingTime_years - Averaging time (years) / Tempo de média (anos)
 * @throws {RangeError} If any input is out of valid range
 */
export function computeInhalationExposure(
    concentration_ug_m3: number,
    inhalationRate_m3_h: number,
    exposureHours: number,
    exposureDays: number,
    bodyWeight_kg: number,
    averagingTime_years: number = DEFAULT_AT_YEARS,
): number {
    _validatePositive({
        concentration_ug_m3,
        inhalationRate_m3_h,
        exposureHours,
        exposureDays,
        bodyWeight_kg,
        averagingTime_years,
    });

    // Converter µg/m³ para mg/m³ / Convert µg/m³ to mg/m³
    const concentration_mg_m3 = concentration_ug_m3 / 1000;
    // DI = C(mg/m³) × IR(m³/h) × ET(h/d) × EF(d) / (BW(kg) × AT(yr) × 365 d/yr)
    return (
        (concentration_mg_m3 * inhalationRate_m3_h * exposureHours * exposureDays) /
        (bodyWeight_kg * averagingTime_years * 365)
    );
}

/**
 * Compute dermal chronic daily intake (CDI).
 * Calcula a dose diária crônica por contato dérmico.
 *
 * Formula: DD = (C × SA × ABS × EF) / (BW × AT × 365)
 *   C   = surface concentration (mg/cm²)
 *   SA  = skin contact area (cm²)
 *   ABS = dermal absorption fraction (unitless)
 *   EF  = exposure days (days)
 *   BW  = body weight (kg)
 *   AT  = averaging time (years)
 *
 * @param concentration_mg_cm2 - Surface concentration (mg/cm²) / Concentração superficial (mg/cm²)
 * @param skinArea_cm2 - Skin contact area (cm²) / Área de contato com a pele (cm²)
 * @param absorptionFraction - Dermal absorption fraction (0–1) / Fração de absorção dérmica (0–1)
 * @param exposureDays - Total exposure days / Dias totais de exposição
 * @param bodyWeight_kg - Body weight (kg) / Peso corporal (kg)
 * @param averagingTime_years - Averaging time (years) / Tempo de média (anos)
 * @throws {RangeError} If any input is out of valid range
 */
export function computeDermalExposure(
    concentration_mg_cm2: number,
    skinArea_cm2: number,
    absorptionFraction: number,
    exposureDays: number,
    bodyWeight_kg: number,
    averagingTime_years: number = DEFAULT_AT_YEARS,
): number {
    _validatePositive({ concentration_mg_cm2, skinArea_cm2, exposureDays, bodyWeight_kg, averagingTime_years });
    if (typeof absorptionFraction !== 'number' || absorptionFraction < 0 || absorptionFraction > 1) {
        throw new RangeError('absorptionFraction must be in [0, 1]');
    }

    // DD = C(mg/cm²) × SA(cm²) × ABS × EF(d) / (BW(kg) × AT(yr) × 365 d/yr)
    return (
        (concentration_mg_cm2 * skinArea_cm2 * absorptionFraction * exposureDays) /
        (bodyWeight_kg * averagingTime_years * 365)
    );
}

/**
 * Compute ingestion chronic daily intake (CDI).
 * Calcula a dose diária crônica por ingestão.
 *
 * Formula: DING = (C × IR × EF) / (BW × AT × 365 × 1000)
 *   C  = soil/food concentration (mg/kg)
 *   IR = ingestion rate (mg/day)
 *   EF = exposure days
 *   BW = body weight (kg)
 *   AT = averaging time (years)
 *   /1000 converts mg/kg → g/kg for unit consistency
 *
 * @param concentration_mg_kg - Concentration in soil/food (mg/kg) / Concentração em solo/alimento (mg/kg)
 * @param ingestionRate_mg_day - Ingestion rate (mg/day) / Taxa de ingestão (mg/dia)
 * @param exposureDays - Total exposure days / Dias totais de exposição
 * @param bodyWeight_kg - Body weight (kg) / Peso corporal (kg)
 * @param averagingTime_years - Averaging time (years) / Tempo de média (anos)
 * @throws {RangeError} If any input is out of valid range
 */
export function computeIngestionExposure(
    concentration_mg_kg: number,
    ingestionRate_mg_day: number,
    exposureDays: number,
    bodyWeight_kg: number,
    averagingTime_years: number = DEFAULT_AT_YEARS,
): number {
    _validatePositive({ concentration_mg_kg, ingestionRate_mg_day, exposureDays, bodyWeight_kg, averagingTime_years });

    // DING = C(mg/kg) × IR(mg/d) × EF(d) / (BW(kg) × AT(yr) × 365 × 1000)
    // /1000: converter mg/kg × mg → mg²/kg, normalizar para mg/kg-dia
    return (
        (concentration_mg_kg * ingestionRate_mg_day * exposureDays) / (bodyWeight_kg * averagingTime_years * 365 * 1000)
    );
}

/**
 * Compute total multi-route exposure and identify dominant pathway.
 * Calcula exposição total multi-rota e identifica a via de exposição dominante.
 *
 * @param inhalation - Inhalation CDI (mg/kg-day) / Dose inalatória (mg/kg-dia)
 * @param dermal - Dermal CDI (mg/kg-day) / Dose dérmica (mg/kg-dia)
 * @param ingestion - Ingestion CDI (mg/kg-day) / Dose por ingestão (mg/kg-dia)
 * @throws {RangeError} If any dose is negative
 */
export function computeTotalExposure(
    inhalation: number,
    dermal: number,
    ingestion: number,
): {
    total: number;
    routes: { inhalation: number; dermal: number; ingestion: number };
    dominantRoute: string;
} {
    for (const [name, val] of [
        ['inhalation', inhalation],
        ['dermal', dermal],
        ['ingestion', ingestion],
    ] as Array<[string, number]>) {
        if (typeof val !== 'number') throw new TypeError(`${name} must be a number`);
        if (val < 0) throw new RangeError(`${name} dose must be >= 0`);
    }

    const total = inhalation + dermal + ingestion;

    // Via dominante: maior contribuição relativa / Dominant route: largest relative contribution
    const routes = { inhalation, dermal, ingestion };
    let dominantRoute: 'inhalation' | 'dermal' | 'ingestion' = 'inhalation';
    if (dermal > routes[dominantRoute]) dominantRoute = 'dermal';
    if (ingestion > routes[dominantRoute]) dominantRoute = 'ingestion';

    return { total, routes, dominantRoute };
}

/**
 * Internal validator for positive numeric parameters.
 * Validador interno para parâmetros numéricos positivos.
 *
 * @param params - Key-value pairs to validate
 * @throws {TypeError|RangeError}
 */
function _validatePositive(params: Record<string, unknown>): void {
    for (const [key, val] of Object.entries(params)) {
        if (typeof val !== 'number') throw new TypeError(`${key} must be a number`);
        if (val <= 0) throw new RangeError(`${key} must be > 0`);
    }
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const chemicalExposureRoutesMeta: AnalyticsModuleMeta = {
    name: 'chemicalExposureRoutes',
    description: 'Chemical Exposure Routes Assessment',
    category: 'analytics',
    familyTags: ['chemical'],
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
