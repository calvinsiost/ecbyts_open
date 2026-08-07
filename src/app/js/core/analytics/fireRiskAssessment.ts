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
// Application: EHS & Mining - Industrial Fire Risk Assessment
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Industrial Fire Risk Assessment
 *
 * Módulo puro para avaliação de risco de incêndio industrial. Implementa
 * modelos de ponto de fulgor, limites de explosividade, radiação térmica e
 * zonas de consequência baseados em literatura técnica reconhecida.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - SFPE (2016). SFPE Handbook of Fire Protection Engineering (5th ed.).
 *     Springer. ISBN: 978-1-4939-2565-0. (thermal radiation models, fire consequences)
 *   - NFPA 652 (2022). Standard on the Fundamentals of Combustible Dust.
 *     National Fire Protection Association. (explosion limits, safety margins)
 *   - Lees, F. P. (2012). Loss Prevention in the Process Industries:
 *     Hazard Identification, Assessment and Control (4th ed.). Butterworth-Heinemann.
 *     ISBN: 978-0-08-097642-9. (flash point criteria, consequence zoning)
 *   - TNO (1997). Methods for the Calculation of Physical Effects (Yellow Book),
 *     CPR 14E. Committee for the Prevention of Disasters, The Netherlands.
 *     (fireball thermal radiation equations)
 *
 * @module fireRiskAssessment
 */

'use strict';

const FOUR_PI = 4 * Math.PI; // 4π ≈ 12.566

/**
 * Assess fire risk based on substance flash point relative to ambient temperature.
 * Avalia o risco de incêndio comparando o ponto de fulgor com a temperatura ambiente.
 *
 * Risk levels (Lees 2012, Chapter 16):
 *   - none:     temperature < flashPoint − 10 °C (margem segura)
 *   - low:      temperature < flashPoint (abaixo do ponto de fulgor)
 *   - moderate: temperature >= flashPoint (vapores inflamáveis presentes)
 *   - high:     temperature >= flashPoint × 1.2 (significativamente acima)
 *   - extreme:  temperature >= autoignitionTemp (ignição espontânea possível)
 *
 * @param {{ name: string, flashPoint_C: number, autoignitionTemp_C: number }} substance
 *   - name: substance identifier
 *   - flashPoint_C: flash point temperature (°C)
 *   - autoignitionTemp_C: auto-ignition temperature (°C)
 * @param {number} temperature_C - Ambient temperature (°C)
 * @returns {{ fireRisk: boolean, riskLevel: 'none'|'low'|'moderate'|'high'|'extreme' }}
 * @throws {TypeError}  If substance is missing required fields
 * @throws {RangeError} If autoignitionTemp_C ≤ flashPoint_C
 */
export function computeFlashPoint(substance: { name: string, flashPoint_C: number, autoignitionTemp_C: number }, temperature_C: number): { fireRisk: boolean, riskLevel: 'none'|'low'|'moderate'|'high'|'extreme' } {
    // Validação da substância
    if (!substance || typeof substance !== 'object') {
        throw new TypeError('substance must be an object with name, flashPoint_C, autoignitionTemp_C');
    }
    if (typeof substance.flashPoint_C !== 'number' || !isFinite(substance.flashPoint_C)) {
        throw new TypeError('substance.flashPoint_C must be a finite number');
    }
    if (typeof substance.autoignitionTemp_C !== 'number' || !isFinite(substance.autoignitionTemp_C)) {
        throw new TypeError('substance.autoignitionTemp_C must be a finite number');
    }
    if (typeof temperature_C !== 'number' || !isFinite(temperature_C)) {
        throw new TypeError('temperature_C must be a finite number');
    }
    if (substance.autoignitionTemp_C <= substance.flashPoint_C) {
        throw new RangeError('autoignitionTemp_C must be greater than flashPoint_C');
    }

    const fp = substance.flashPoint_C;
    const ait = substance.autoignitionTemp_C;
    const t = temperature_C;

        let riskLevel: 'none'|'low'|'moderate'|'high'|'extreme';
    // Avaliação sequencial do nível de risco, do mais grave para o mais leve
    if (t >= ait) {
        riskLevel = 'extreme'; // Temperatura de auto-ignição atingida
    } else if (t >= fp * 1.2) {
        riskLevel = 'high'; // 20% acima do ponto de fulgor
    } else if (t >= fp) {
        riskLevel = 'moderate'; // Acima do ponto de fulgor — vapores presentes
    } else if (t >= fp - 10) {
        riskLevel = 'low'; // Dentro de 10°C abaixo do ponto de fulgor
    } else {
        riskLevel = 'none'; // Margem de segurança confortável
    }

    return {
        fireRisk: riskLevel !== 'none',
        riskLevel,
    };
}

/**
 * Assess whether a vapor concentration falls within explosive limits.
 * Avalia se a concentração de vapor está dentro dos limites de explosividade.
 *
 * Safety margin: percentage distance to the nearest flammability limit (LEL or UEL).
 * Margem de segurança: distância percentual ao limite de inflamabilidade mais próximo.
 *
 * Reference: NFPA 652 §5.1; Lees (2012) Chapter 17.
 *
 * @param {number} concentration_pct - Vapor concentration in air (% v/v)
 * @param {number} lel               - Lower Explosive Limit (% v/v); must be > 0
 * @param {number} uel               - Upper Explosive Limit (% v/v); must be > lel
 * @returns {{ inExplosiveRange: boolean, safetyMargin: number }}
 *   - inExplosiveRange: true if lel ≤ concentration ≤ uel
 *   - safetyMargin: % distance to the nearest limit (positive = outside range)
 * @throws {RangeError} If lel ≤ 0, uel ≤ lel, or concentration_pct < 0
 */
export function computeExplosionLimits(concentration_pct: number, lel: number, uel: number): { inExplosiveRange: boolean, safetyMargin: number } {
    // Validação de entradas
    if (typeof concentration_pct !== 'number' || !isFinite(concentration_pct)) {
        throw new TypeError('concentration_pct must be a finite number');
    }
    if (typeof lel !== 'number' || !isFinite(lel)) {
        throw new TypeError('lel must be a finite number');
    }
    if (typeof uel !== 'number' || !isFinite(uel)) {
        throw new TypeError('uel must be a finite number');
    }
    if (concentration_pct < 0) {
        throw new RangeError('concentration_pct must be ≥ 0');
    }
    if (lel <= 0) {
        throw new RangeError('lel must be positive (> 0)');
    }
    if (uel <= lel) {
        throw new RangeError('uel must be greater than lel');
    }

    const c = concentration_pct;
    const inExplosiveRange = c >= lel && c <= uel;

    // Margem de segurança: distância ao limite mais próximo
    // Valores negativos indicam que está dentro da faixa explosiva
    let safetyMargin;
    if (c < lel) {
        safetyMargin = lel - c; // Abaixo do LEL — margem positiva
    } else if (c > uel) {
        safetyMargin = c - uel; // Acima do UEL — margem positiva
    } else {
        // Dentro da faixa: distância negativa ao limite mais próximo
        safetyMargin = -Math.min(c - lel, uel - c);
    }

    return { inExplosiveRange, safetyMargin };
}

/**
 * Compute thermal radiation irradiance at a given distance from a fire.
 * Calcula a irradiância de radiação térmica a uma distância de um incêndio.
 *
 * Point-source model: q = Q / (4π × r²)
 * q = irradiance (kW/m²), Q = heat release rate (kW), r = distance (m)
 *
 * Injury thresholds (SFPE Handbook 2016, Chapter 62):
 *   - safe:       < 1.6 kW/m²  (no pain after prolonged exposure)
 *   - 1st_degree: 1.6–6.3 kW/m² (1st-degree burn after 10 s)
 *   - 2nd_degree: 6.3–12.5 kW/m² (2nd-degree burn after 10 s)
 *   - lethal:     > 12.5 kW/m² (50% lethality for 10 s exposure)
 *
 * @param {number} heatRelease_kW - Heat release rate Q (kW); must be > 0
 * @param {number} distance_m     - Distance from fire to receptor (m); must be > 0
 * @returns {{ irradiance_kW_m2: number, injuryThreshold: '1st_degree'|'2nd_degree'|'lethal'|'safe' }}
 * @throws {RangeError} If heatRelease_kW ≤ 0 or distance_m ≤ 0
 */
export function computeThermalRadiation(heatRelease_kW: number, distance_m: number): { irradiance_kW_m2: number, injuryThreshold: '1st_degree'|'2nd_degree'|'lethal'|'safe' } {
    // Validação de entradas
    if (typeof heatRelease_kW !== 'number' || !isFinite(heatRelease_kW)) {
        throw new TypeError('heatRelease_kW must be a finite number');
    }
    if (typeof distance_m !== 'number' || !isFinite(distance_m)) {
        throw new TypeError('distance_m must be a finite number');
    }
    if (heatRelease_kW <= 0) {
        throw new RangeError('heatRelease_kW must be positive (> 0)');
    }
    if (distance_m <= 0) {
        throw new RangeError('distance_m must be positive (> 0)');
    }

    // q = Q / (4π × r²) - modelo de fonte pontual
    const irradiance_kW_m2 = heatRelease_kW / (FOUR_PI * distance_m * distance_m);

    // Classificação dos limiares de lesão (SFPE 2016)
        let injuryThreshold: '1st_degree'|'2nd_degree'|'lethal'|'safe';
    if (irradiance_kW_m2 > 12.5) {
        injuryThreshold = 'lethal';
    } else if (irradiance_kW_m2 > 6.3) {
        injuryThreshold = '2nd_degree';
    } else if (irradiance_kW_m2 > 1.6) {
        injuryThreshold = '1st_degree';
    } else {
        injuryThreshold = 'safe';
    }

    return { irradiance_kW_m2, injuryThreshold };
}

/**
 * Compute fire consequence zones (impact radii) for each injury threshold.
 * Calcula as zonas de consequência do incêndio (raios de impacto) para cada limiar de lesão.
 *
 * Inverted from: q = Q_rad / (4π × r²) → r = sqrt(Q_rad / (4π × q_threshold))
 * Where Q_rad = fraction_radiated × heatRelease_kW
 *
 * Thresholds (kW/m²): lethal = 12.5, severe (2nd-degree) = 6.3, moderate (1st-degree) = 1.6
 *
 * Reference: SFPE Handbook (2016); Lees (2012) Loss Prevention, Chapter 16.
 *
 * @param {number} heatRelease_kW   - Total heat release rate Q (kW); must be > 0
 * @param {number} fraction_radiated - Fraction of heat released as radiation (0–1)
 * @returns {{ lethal_m: number, severe_m: number, moderate_m: number }}
 * @throws {RangeError} If heatRelease_kW ≤ 0 or fraction_radiated outside (0,1]
 */
export function computeFireConsequenceZone(heatRelease_kW: number, fraction_radiated: number): { lethal_m: number, severe_m: number, moderate_m: number } {
    // Validação de entradas
    if (typeof heatRelease_kW !== 'number' || !isFinite(heatRelease_kW)) {
        throw new TypeError('heatRelease_kW must be a finite number');
    }
    if (typeof fraction_radiated !== 'number' || !isFinite(fraction_radiated)) {
        throw new TypeError('fraction_radiated must be a finite number');
    }
    if (heatRelease_kW <= 0) {
        throw new RangeError('heatRelease_kW must be positive (> 0)');
    }
    if (fraction_radiated <= 0 || fraction_radiated > 1) {
        throw new RangeError('fraction_radiated must be in (0, 1]');
    }

    // Potência radiada: parte do calor total que é emitida como radiação
    const q_rad = heatRelease_kW * fraction_radiated;

    // r = sqrt(Q_rad / (4π × q_threshold)) - raio de impacto para cada limiar
        const radius = (threshold_kW_m2: number) => Math.sqrt(q_rad / (FOUR_PI * threshold_kW_m2));

    return {
        lethal_m: radius(12.5), // Zona letal (>12.5 kW/m²)
        severe_m: radius(6.3), // Zona de queimaduras graves (>6.3 kW/m²)
        moderate_m: radius(1.6), // Zona de queimaduras leves (>1.6 kW/m²)
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const fireRiskAssessmentMeta = {
    name: 'fireRiskAssessment',
    description: 'Industrial Fire Risk Assessment',
    category: 'analytics',
    familyTags: ['risk', 'fire'],
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
