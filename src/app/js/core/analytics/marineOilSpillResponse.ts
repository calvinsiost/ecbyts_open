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
 * Marine Oil Spill Response
 *
 * Implements spill spreading rates (Fay 1971), area estimation, ITOPF tier classification,
 * critical response time and containment boom efficiency for marine oil spills.
 *
 * References:
 *   - Fay, J.A. (1971). "Physical processes in the spread of oil on a water surface."
 *     Proc. Joint Conf. Prev. Control Oil Spills, API. pp. 463–467.
 *   - ITOPF (2011). "Fate of marine oil spills." Technical Information Paper TIP 2.
 *     International Tanker Owners Pollution Federation. London.
 *   - NOAA (2024). "Emergency Response Guide (ERG) for Oil Spills."
 *     Office of Response and Restoration, NOAA. https://response.restoration.noaa.gov
 *   - Reed, M. et al. (1999). "Oil spill modeling towards the close of the 20th century."
 *     Spill Science & Technology Bulletin, 5(1), 3–16. DOI: 10.1016/S1353-2561(98)00029-2
 *   - CONAMA Resolução 393/2007. "Descarte de água produzida e fluidos de perfuração."
 *     Brasil.
 *
 * @module marineOilSpillResponse
 */

// Local interface (substitui import('../../../../types/app/analytics-library.js'))
interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: 'analytics';
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
        citation?: string;
    };
    inputSchema: { type: 'object'; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: 'object'; properties: Record<string, unknown>; required: string[] };
    library?: { published: boolean; priceECBT?: number; licenseRef?: string };
}

// ─── Physical constants ───────────────────────────────────────────────────────

/** Density of seawater (kg/m³) */
const RHO_WATER = 1025;

/** Gravitational acceleration (m/s²) */
const GRAVITY = 9.81;

/** Kinematic viscosity of seawater at 20°C (m²/s) */
const NU_WATER = 1.05e-6;

/** Minimum effective slick thickness for mechanical recovery (m) — operational limit */
const MIN_SLICK_THICKNESS = 1e-4; // 0.1 mm

// ─── ITOPF Tier classification thresholds (tonnes) ───────────────────────────
const ITOPF_TIERS = [
    { tier: 1, maxTonnes: 7, label: 'Tier 1 — Small spill', labelPT: 'Nível 1 — Pequeno derrame' },
    { tier: 2, maxTonnes: 700, label: 'Tier 2 — Medium spill', labelPT: 'Nível 2 — Médio derrame' },
    { tier: 3, maxTonnes: Infinity, label: 'Tier 3 — Large spill', labelPT: 'Nível 3 — Grande derrame' },
];

// ─── Oil density presets (kg/m³) - ASTM D70 / API gravity reference ──────────
export const OIL_DENSITY_PRESETS = {
    light_crude: 820, // API > 38° — cru leve
    medium_crude: 870, // API 22–38° — cru médio
    heavy_crude: 930, // API 10–22° — cru pesado
    bunker_c: 985, // Óleo combustível C (HFO)
    diesel: 840, // Diesel marítimo (MGO)
    lubricating: 900, // Óleo lubrificante
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Convert volume in m³ to mass in tonnes given oil density.
 * @param volume_m3 - Volume (m³)
 * @param density   - Oil density (kg/m³)
 * @returns Mass in tonnes
 */
function volumeToTonnes(volume_m3: number, density: number): number {
    return (volume_m3 * density) / 1000;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Estimate oil slick spreading radius and area using Fay (1971) gravity-viscous regime.
 *
 * Na fase viscosa-gravitacional (dominante após ~10 min), o raio de espalhamento:
 *   R(t) = C × (g' × V₀² / ν_w)^(1/6) × t^(1/4)
 * onde g' = g × (ρ_w - ρ_oil)/ρ_w (gravidade reduzida), C ≈ 0.40 (constante Fay).
 *
 * @param volume_m3      - Volume derramado (m³)
 * @param oilDensity_kg_m3 - Densidade do óleo (kg/m³)
 * @param time_s         - Tempo após o derrame (s)
 * @throws {TypeError}  se inputs não forem números
 * @throws {RangeError} se valores fora de limites físicos
 */
export function faySpreadingRadius(
    volume_m3: number,
    oilDensity_kg_m3: number,
    time_s: number,
): { radius_m: number; area_m2: number; area_km2: number; avgThickness_m: number } {
    if (typeof volume_m3 !== 'number' || typeof oilDensity_kg_m3 !== 'number' || typeof time_s !== 'number') {
        throw new TypeError('volume_m3, oilDensity_kg_m3, and time_s must be numbers');
    }
    if (volume_m3 <= 0) throw new RangeError('volume_m3 must be positive');
    if (oilDensity_kg_m3 <= 0 || oilDensity_kg_m3 >= RHO_WATER) {
        throw new RangeError(`oilDensity_kg_m3 must be in (0, ${RHO_WATER}) kg/m³ — oil must be less dense than water`);
    }
    if (time_s <= 0) throw new RangeError('time_s must be positive');

    // Gravidade reduzida (reduced gravity) - impulsão relativa
    const g_prime = (GRAVITY * (RHO_WATER - oilDensity_kg_m3)) / RHO_WATER;

    // Constante de Fay (adimensional) - regime viscoso-gravitacional
    const FAY_C = 0.4;

    // R(t) = C × (g' × V₀² / ν_w)^(1/6) × t^(1/4)
    const radius_m = FAY_C * Math.pow((g_prime * volume_m3 ** 2) / NU_WATER, 1 / 6) * Math.pow(time_s, 1 / 4);

    const area_m2 = Math.PI * radius_m ** 2;
    const area_km2 = area_m2 / 1e6;
    // Espessura média: volume / área (mínimo físico: MIN_SLICK_THICKNESS)
    const avgThickness_m = Math.max(volume_m3 / area_m2, MIN_SLICK_THICKNESS);

    return {
        radius_m: Math.round(radius_m * 10) / 10,
        area_m2: Math.round(area_m2),
        area_km2: Math.round(area_km2 * 1000) / 1000,
        avgThickness_m: avgThickness_m,
    };
}

/**
 * Classify spill according to ITOPF tier system by volume.
 *
 * Classifica o derrame por volume segundo ITOPF (2011):
 * Tier 1 < 7 t; Tier 2 = 7–700 t; Tier 3 > 700 t.
 * Aciona resposta local, regional ou internacional respectivamente.
 *
 * @param volume_m3        - Volume derramado (m³)
 * @param oilDensity_kg_m3 - Densidade do óleo (kg/m³)
 * @throws {TypeError}  se inputs não forem números
 * @throws {RangeError} se valores negativos ou óleo mais denso que água
 */
export function classifySpillTier(
    volume_m3: number,
    oilDensity_kg_m3: number,
): {
    tonnes: number;
    tier: number;
    label: string;
    labelPT: string;
    responseLevel: string;
} {
    if (typeof volume_m3 !== 'number' || typeof oilDensity_kg_m3 !== 'number') {
        throw new TypeError('volume_m3 and oilDensity_kg_m3 must be numbers');
    }
    if (volume_m3 <= 0) throw new RangeError('volume_m3 must be positive');
    if (oilDensity_kg_m3 <= 0 || oilDensity_kg_m3 >= RHO_WATER) {
        throw new RangeError('oilDensity_kg_m3 must be in (0, 1025) kg/m³');
    }

    const tonnes = volumeToTonnes(volume_m3, oilDensity_kg_m3);
    // ITOPF_TIERS termina com maxTonnes: Infinity, então find sempre retorna um item; cast para non-undefined.
    const tierDef = ITOPF_TIERS.find((t) => tonnes <= t.maxTonnes) as {
        tier: number;
        maxTonnes: number;
        label: string;
        labelPT: string;
    };

    const responseLevels: Record<number, string> = {
        1: 'Local response — vessel or facility own resources',
        2: 'Regional response — national authority, coastal contingency plan',
        3: 'International response — ITOPF assistance, IMO OPRC 1990',
    };

    return {
        tonnes: Math.round(tonnes * 100) / 100,
        tier: tierDef.tier,
        label: tierDef.label,
        labelPT: tierDef.labelPT,
        responseLevel: responseLevels[tierDef.tier]!,
    };
}

/**
 * Estimate critical response time before oil reaches shoreline.
 *
 * Tempo crítico = distância à costa / velocidade de deriva superficial.
 * Velocidade de deriva: aproximação = 3% da velocidade do vento (regra ITOPF/NOAA ERG 2024)
 * mais corrente superficial.
 *
 * @param distanceToShore_km   - Distância à linha de costa (km)
 * @param windSpeed_ms         - Velocidade do vento (m/s)
 * @param currentSpeed_ms      - Velocidade da corrente superficial (m/s)
 * @throws {TypeError}  se inputs não forem números
 * @throws {RangeError} se distância ou velocidades negativas
 */
export function criticalResponseTime(
    distanceToShore_km: number,
    windSpeed_ms: number,
    currentSpeed_ms = 0,
): {
    driftSpeed_ms: number;
    criticalTime_hours: number;
    criticalTime_min: number;
    urgencyLevel: string;
} {
    if (
        typeof distanceToShore_km !== 'number' ||
        typeof windSpeed_ms !== 'number' ||
        typeof currentSpeed_ms !== 'number'
    ) {
        throw new TypeError('All parameters must be numbers');
    }
    if (distanceToShore_km <= 0) throw new RangeError('distanceToShore_km must be positive');
    if (windSpeed_ms < 0) throw new RangeError('windSpeed_ms must be non-negative');
    if (currentSpeed_ms < 0) throw new RangeError('currentSpeed_ms must be non-negative');

    // Velocidade de deriva: 3% do vento + corrente - ITOPF TIP 2 / NOAA ERG 2024
    const windDrift_ms = 0.03 * windSpeed_ms;
    const driftSpeed_ms = windDrift_ms + currentSpeed_ms;

    if (driftSpeed_ms === 0) {
        // Sem vento nem corrente - tempo infinito (retornar sentinel alto)
        return {
            driftSpeed_ms: 0,
            criticalTime_hours: Infinity,
            criticalTime_min: Infinity,
            urgencyLevel: 'low',
        };
    }

    const distanceToShore_m = distanceToShore_km * 1000;
    const criticalTime_s = distanceToShore_m / driftSpeed_ms;
    const criticalTime_hours = criticalTime_s / 3600;
    const criticalTime_min = criticalTime_s / 60;

    let urgencyLevel;
    if (criticalTime_hours < 2)
        urgencyLevel = 'critical'; // Emergência — < 2 horas
    else if (criticalTime_hours < 6)
        urgencyLevel = 'high'; // Alto — 2–6 horas
    else if (criticalTime_hours < 24)
        urgencyLevel = 'medium'; // Médio — 6–24 horas
    else urgencyLevel = 'low'; // Baixo — > 24 horas

    return {
        driftSpeed_ms: Math.round(driftSpeed_ms * 1000) / 1000,
        criticalTime_hours: Math.round(criticalTime_hours * 10) / 10,
        criticalTime_min: Math.round(criticalTime_min),
        urgencyLevel,
    };
}

/**
 * Estimate containment boom efficiency for a given slick and sea state.
 *
 * Eficiência de barreira de contenção diminui com estado do mar (altura de onda)
 * e velocidade de corrente relativa - ITOPF TIP 3 / ASTM F625.
 *
 * @param params
 * @param params.boomLengthDeployed_m  - Comprimento de barreira implantada (m)
 * @param params.slickWidth_m          - Largura estimada da mancha (m)
 * @param params.waveHeight_m          - Altura significativa de onda Hs (m)
 * @param params.currentSpeed_ms       - Velocidade da corrente relativa (m/s)
 * @throws {TypeError}  se params não tiver campos numéricos
 * @throws {RangeError} se valores negativos ou fisicamente impossíveis
 */
export function boomContainmentEfficiency({
    boomLengthDeployed_m,
    slickWidth_m,
    waveHeight_m,
    currentSpeed_ms,
}: {
    boomLengthDeployed_m: number;
    slickWidth_m: number;
    waveHeight_m: number;
    currentSpeed_ms: number;
}): {
    coverageRatio: number;
    waveEfficiency: number;
    currentEfficiency: number;
    overallEfficiency: number;
    recommendation: string;
} {
    for (const [k, v] of Object.entries({ boomLengthDeployed_m, slickWidth_m, waveHeight_m, currentSpeed_ms })) {
        if (typeof v !== 'number' || isNaN(v)) throw new TypeError(`${k} must be a number`);
        if (v < 0) throw new RangeError(`${k} must be non-negative`);
    }
    if (boomLengthDeployed_m <= 0) throw new RangeError('boomLengthDeployed_m must be positive');
    if (slickWidth_m <= 0) throw new RangeError('slickWidth_m must be positive');

    // Proporção de cobertura: min(boom / mancha, 1)
    const coverageRatio = Math.min(boomLengthDeployed_m / slickWidth_m, 1.0);

    // Eficiência por estado do mar - ITOPF TIP 3 (Beaufort adaptado)
    // Hs > 2 m: operação inviável para a maioria das barreiras convencionais
    let waveEfficiency;
    if (waveHeight_m <= 0.5)
        waveEfficiency = 0.95; // Sea state 1–2: excelente
    else if (waveHeight_m <= 1.0)
        waveEfficiency = 0.8; // Sea state 3: bom
    else if (waveHeight_m <= 1.5)
        waveEfficiency = 0.6; // Sea state 4: reduzido
    else if (waveHeight_m <= 2.0)
        waveEfficiency = 0.35; // Sea state 5: comprometido
    else waveEfficiency = 0.1; // Sea state > 5: ineficaz

    // Eficiência por corrente - limite operacional ~1.0 m/s (ASTM F625 / ITOPF)
    let currentEfficiency;
    if (currentSpeed_ms <= 0.5)
        currentEfficiency = 0.95; // Corrente fraca: excelente
    else if (currentSpeed_ms <= 0.75)
        currentEfficiency = 0.75; // Moderada: bom
    else if (currentSpeed_ms <= 1.0)
        currentEfficiency = 0.5; // Forte: reduzido
    else currentEfficiency = 0.15; // Muito forte: ineficaz

    const overallEfficiency = coverageRatio * waveEfficiency * currentEfficiency;

    let recommendation;
    if (overallEfficiency >= 0.7) recommendation = 'Boom deployment is effective. Deploy and monitor.';
    else if (overallEfficiency >= 0.4)
        recommendation = 'Marginal efficiency. Consider additional booms or dispersants.';
    else
        recommendation =
            'Boom ineffective under current conditions. Prioritize dispersants and in-situ burning (if permitted).';

    return {
        coverageRatio: Math.round(coverageRatio * 100) / 100,
        waveEfficiency: Math.round(waveEfficiency * 100) / 100,
        currentEfficiency: Math.round(currentEfficiency * 100) / 100,
        overallEfficiency: Math.round(overallEfficiency * 1000) / 1000,
        recommendation,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const marineOilSpillResponseMeta: AnalyticsModuleMeta = {
    name: 'marineOilSpillResponse',
    description: 'marineOilSpillResponse',
    category: 'analytics',
    familyTags: ['coastal', 'hydrocarbon'],
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
