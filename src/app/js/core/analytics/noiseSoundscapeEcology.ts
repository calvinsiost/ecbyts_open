// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining - Noise, Soundscape & Acoustic Ecology
// Authorship: Calvin Stefan Iost
// Spec code: BCO
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Academic References:
// - ISO 1996-1:2016. Acoustics - Description, measurement and assessment of
//   environmental noise. Part 1: Basic quantities and assessment procedures.
// - ISO 9613-1:1993. Acoustics - Attenuation of sound during propagation outdoors.
//   Part 1: Calculation of the absorption of sound by the atmosphere.
// - ISO 9612:2009. Acoustics - Determination of occupational noise exposure.
//   Engineering method. DOI:10.3403/30150720
// - ISO 2631-1:1997. Mechanical vibration and shock - Evaluation of human exposure
//   to whole-body vibration. Part 1: General requirements.
// - ISO 3382-2:2008. Acoustics - Measurement of room acoustic parameters.
//   Part 2: Reverberation time in ordinary rooms.
// - US EPA (1974). Information on Levels of Environmental Noise Requisite to Protect
//   Public Health and Welfare with an Adequate Margin of Safety.
//   EPA 550/9-74-004.
// - California Air Resources Board. Community Noise Equivalent Level (CNEL).
//   Title 21, California Code of Regulations Section 5001.
// - FHWA (1996). Traffic Noise Model - Technical Manual.
//   FHWA-HEP-96-021. Federal Highway Administration.
// - EU Directive 2002/49/EC. Assessment and Management of Environmental Noise.
//   Official Journal of the European Communities L 189/12, 2002.
// - EU Directive 2003/10/EC. Minimum Health and Safety Requirements Regarding the
//   Exposure of Workers to the Risks Arising from Physical Agents (Noise).
//   Official Journal of the European Union L 42/38, 2003.
// - Schultz, T.J. (1978). Synthesis of social surveys on noise annoyance.
//   Journal of the Acoustical Society of America 64(2):377-405.
//   DOI:10.1121/1.382013
// - Boelman, N.C. et al. (2007). Refinement of the Bioacoustic Index.
//   Journal of the Acoustical Society of America 121(5):2936–2944.
//   DOI:10.1121/1.2717871
// - Pieretti, N., Farina, A. & Morri, D. (2011). A new methodology to infer the
//   singing activity of an avian community: The Acoustic Complexity Index (ACI).
//   Ecological Indicators 11(3):868–873. DOI:10.1016/j.ecolind.2010.11.005
// - Farina, A. (2014). Soundscape Ecology: Principles, Patterns, Methods and
//   Applications. Springer. ISBN:978-94-007-7374-5.
// - Maekawa, Z. (1968). Noise reduction by screens.
//   Applied Acoustics 1(3):157–173. DOI:10.1016/0003-682X(68)90020-0
// - WHO (2009). Night Noise Guidelines for Europe.
//   WHO Regional Office for Europe. ISBN:978-92-890-4173-7.
// - Lam, K.C., Chan, P.K. & Chan, W.K. (2009). Annoyance response to mixed
//   transportation noise in Hong Kong. Applied Acoustics 70(1):1–10.
//   DOI:10.1016/j.apacoust.2008.08.006

console.debug('[BCO:load]', 'app/js/core/analytics/noiseSoundscapeEcology.js');

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/**
 * Speed of sound in air at 20°C (m/s).
 * ISO 9613-1:1993 §3.
 * @type {number}
 */
const SPEED_OF_SOUND_MS = 343.0;

/**
 * WHO Night Noise Guidelines thresholds (dB Leq,night).
 * WHO (2009).
 * @type {{ intermediate: number, adverse: number }}
 */
const WHO_NIGHT_THRESHOLDS = Object.freeze({
    /** Below this: no significant effects observed. */
    intermediate: 40,
    /** Above this: adverse health effects occur frequently. */
    adverse: 55,
});

/**
 * EU Directive 2003/10/EC occupational noise exposure action values (dB).
 * @type {{ lower: number, upper: number, limit: number }}
 */
const EU_NOISE_ACTION_VALUES = Object.freeze({
    lower: 80,
    upper: 85,
    limit: 87,
});

/**
 * Schultz (1978) polynomial coefficients for %HA regression.
 * %HA = a + b·Ldn + c·Ldn²  (Ldn in dB, 45–85 dB range)
 * Coefficients from Schultz 1978 Table 3 curve fit.
 * DOI:10.1121/1.382013
 * @type {{ a: number, b: number, c: number }}
 */
const SCHULTZ_COEFFICIENTS = Object.freeze({
    a: 0.8532,
    b: -0.05547,
    c: 0.0009004,
});

// ---------------------------------------------------------------------------
// Utility helpers (unexported)
// ---------------------------------------------------------------------------

/**
 * Converts dB Sound Pressure Level to linear energy (mean-square pressure ratio).
 * @param {number} dB - Level in decibels.
 * @returns {number} Linear energy value.
 */
function _dBToLinear(dB: number): number {
    return Math.pow(10, dB / 10);
}

/**
 * Converts linear energy back to dB.
 * @param {number} linear - Linear energy value (must be > 0).
 * @returns {number} Level in decibels.
 */
function _linearTodB(linear: number): number {
    return 10 * Math.log10(linear);
}

/**
 * Validates that a value is a finite number.
 * @param {number} val - Value to check.
 * @param {string} name - Parameter name for error messages.
 */
function _requireFinite(val: number, name: string) {
    if (typeof val !== 'number' || !isFinite(val)) {
        throw new TypeError(`${name} must be a finite number, got ${val}`);
    }
}

/**
 * Validates that a value is a finite number and non-negative.
 * @param {number} val - Value to check.
 * @param {string} name - Parameter name for error messages.
 */
function _requireNonNegative(val: number, name: string) {
    _requireFinite(val, name);
    if (val < 0) throw new RangeError(`${name} must be >= 0, got ${val}`);
}

/**
 * Validates that a value is a finite number and strictly positive.
 * @param {number} val - Value to check.
 * @param {string} name - Parameter name for error messages.
 */
function _requirePositive(val: number, name: string) {
    _requireFinite(val, name);
    if (val <= 0) throw new RangeError(`${name} must be > 0, got ${val}`);
}

/**
 * Validates that an array is non-empty and all elements are finite numbers.
 * @param {number[]} arr - Array to validate.
 * @param {string} name - Parameter name for error messages.
 */
function _requireNonEmptyArray(arr: number[], name: string) {
    if (!Array.isArray(arr) || arr.length === 0) {
        throw new TypeError(`${name} must be a non-empty array`);
    }
    for (let i = 0; i < arr.length; i++) {
        if (typeof arr[i] !== 'number' || !isFinite(arr[i]!)) {
            throw new TypeError(`${name}[${i}] must be a finite number, got ${arr[i]}`);
        }
    }
}

// ---------------------------------------------------------------------------
// 1. computeEquivalentLevel
// ---------------------------------------------------------------------------

/**
 * Computes the equivalent continuous sound pressure level (Leq) from multiple
 * SPL measurements with corresponding durations using energy-time averaging.
 *
 * Formula: Leq = 10 · log10( (1/T) · Σ tᵢ · 10^(Lᵢ/10) )
 * where T = Σ tᵢ
 *
 * @param {number[]} levels - Array of SPL measurements in dB.
 * @param {number[]} durations - Array of corresponding durations (any consistent unit, e.g. seconds).
 * @returns {{ Leq: number, totalDuration: number }} Leq in dB and total duration.
 * @reference ISO 1996-1:2016 §3.3
 * @throws {TypeError} If inputs are not non-empty arrays of equal length.
 */
export function computeEquivalentLevel(levels: number[], durations: number[]): { Leq: number, totalDuration: number } {
    _requireNonEmptyArray(levels, 'levels');
    _requireNonEmptyArray(durations, 'durations');
    if (levels.length !== durations.length) {
        throw new RangeError(
            `levels and durations must have equal length: got ${levels.length} vs ${durations.length}`,
        );
    }
    for (let i = 0; i < durations.length; i++) {
        if (durations[i]! <= 0) {
            throw new RangeError(`durations[${i}] must be > 0, got ${durations[i]}`);
        }
    }

    let energySum = 0;
    let totalDuration = 0;
    for (let i = 0; i < levels.length; i++) {
        energySum += durations[i]! * _dBToLinear(levels[i]!);
        totalDuration += durations[i]!;
    }
    const Leq = _linearTodB(energySum / totalDuration);
    return { Leq, totalDuration };
}

// ---------------------------------------------------------------------------
// 2. computeDayNightLevel
// ---------------------------------------------------------------------------

/**
 * Computes the Day-Night Average Sound Level (Ldn or DNL) with 10 dB night penalty.
 *
 * Day period: 07:00–22:00 (15 hours).
 * Night period: 22:00–07:00 (9 hours) with +10 dB penalty.
 *
 * Formula: Ldn = 10 · log10( (15/24) · 10^(Lday/10) + (9/24) · 10^((Lnight+10)/10) )
 *
 * @param {number} dayLeq - Daytime Leq (dB), 07:00–22:00.
 * @param {number} nightLeq - Night-time Leq (dB), 22:00–07:00.
 * @returns {{ Ldn: number, dayContribution: number, nightContribution: number }}
 *   Ldn in dB and fractional energy contributions.
 * @reference US EPA (1974) EPA 550/9-74-004
 */
export function computeDayNightLevel(dayLeq: number, nightLeq: number): { Ldn: number, dayContribution: number, nightContribution: number } {
    _requireFinite(dayLeq, 'dayLeq');
    _requireFinite(nightLeq, 'nightLeq');

    const DAY_HOURS = 15;
    const NIGHT_HOURS = 9;
    const TOTAL_HOURS = 24;
    const NIGHT_PENALTY_DB = 10;

    const dayLinear = (DAY_HOURS / TOTAL_HOURS) * _dBToLinear(dayLeq);
    const nightLinear = (NIGHT_HOURS / TOTAL_HOURS) * _dBToLinear(nightLeq + NIGHT_PENALTY_DB);
    const totalLinear = dayLinear + nightLinear;

    const Ldn = _linearTodB(totalLinear);
    return {
        Ldn,
        dayContribution: dayLinear / totalLinear,
        nightContribution: nightLinear / totalLinear,
    };
}

// ---------------------------------------------------------------------------
// 3. computeCNEL
// ---------------------------------------------------------------------------

/**
 * Computes the Community Noise Equivalent Level (CNEL) per California regulation.
 *
 * Periods and penalties:
 *  - Day:     07:00–19:00 (12 h) - no penalty
 *  - Evening: 19:00–22:00 (3 h)  - +5 dB
 *  - Night:   22:00–07:00 (9 h)  - +10 dB
 *
 * Formula: CNEL = 10 · log10(
 *   (12/24)·10^(Ld/10) + (3/24)·10^((Le+5)/10) + (9/24)·10^((Ln+10)/10) )
 *
 * @param {number} dayLeq     - Daytime Leq (dB), 07:00–19:00.
 * @param {number} eveningLeq - Evening Leq (dB), 19:00–22:00.
 * @param {number} nightLeq   - Night-time Leq (dB), 22:00–07:00.
 * @returns {{ CNEL: number }} CNEL value in dB.
 * @reference California Code of Regulations Title 21 §5001; CARB CNEL definition.
 */
export function computeCNEL(dayLeq: number, eveningLeq: number, nightLeq: number): { CNEL: number } {
    _requireFinite(dayLeq, 'dayLeq');
    _requireFinite(eveningLeq, 'eveningLeq');
    _requireFinite(nightLeq, 'nightLeq');

    const DAY_H = 12;
    const EVE_H = 3;
    const NIGHT_H = 9;
    const TOTAL_H = 24;

    const combined =
        (DAY_H / TOTAL_H) * _dBToLinear(dayLeq) +
        (EVE_H / TOTAL_H) * _dBToLinear(eveningLeq + 5) +
        (NIGHT_H / TOTAL_H) * _dBToLinear(nightLeq + 10);

    return { CNEL: _linearTodB(combined) };
}

// ---------------------------------------------------------------------------
// 4. computeNoiseExposureIndex
// ---------------------------------------------------------------------------

/**
 * Computes the daily noise exposure level (LEX,8h) per ISO 9612 for occupational
 * noise assessment.
 *
 * Formula: LEX,8h = Leq + 10 · log10(T / TW)
 * where T is actual exposure duration and TW is the reference duration (8 hours = 28800 s).
 *
 * @param {number} Leq - Equivalent continuous sound level during exposure (dB A).
 * @param {number} T   - Actual exposure duration (seconds).
 * @param {number} TW  - Reference work period duration (seconds); typically 28800 (8 h).
 * @returns {{ LEX8h: number, exposureRatio: number }} LEX,8h in dB and T/TW ratio.
 * @reference ISO 9612:2009 §10 - DOI:10.3403/30150720
 */
export function computeNoiseExposureIndex(Leq: number, T: number, TW: number): { LEX8h: number, exposureRatio: number } {
    _requireFinite(Leq, 'Leq');
    _requirePositive(T, 'T');
    _requirePositive(TW, 'TW');

    const exposureRatio = T / TW;
    const LEX8h = Leq + 10 * Math.log10(exposureRatio);
    return { LEX8h, exposureRatio };
}

// ---------------------------------------------------------------------------
// 5. computeSoundPressurePropagation
// ---------------------------------------------------------------------------

/**
 * Estimates sound pressure level at distance r from a point source in a free
 * field using inverse-square-law geometric spreading and directivity correction.
 *
 * Formula: Lp = Lw + DI − 20·log10(r) − 11 (dB, free-field point source)
 * where DI (Directivity Index) = 0 for omnidirectional, 3 for hemispherical (ground), etc.
 *
 * The −11 dB term combines: −10·log10(4π) ≈ −11 dB for a sphere of radius r.
 *
 * @param {number} Lw          - Sound power level (dB re 1 pW, i.e., re 10⁻¹² W).
 * @param {number} r           - Distance from source to receiver (m); must be > 0.
 * @param {number} [directivity=0] - Directivity index DI (dB); 0 = omnidirectional,
 *                                   3 = hemispherical radiation over a reflecting plane.
 * @returns {{ Lp: number, geometricAttenuation_dB: number }}
 *   Lp: sound pressure level at r (dB); geometricAttenuation_dB: spreading loss.
 * @reference ISO 9613-1:1993 §7 - geometric spreading component.
 */
export function computeSoundPressurePropagation(Lw: number, r: number, directivity: number = 0): { Lp: number, geometricAttenuation_dB: number } {
    _requireFinite(Lw, 'Lw');
    _requirePositive(r, 'r');
    _requireFinite(directivity, 'directivity');

    // Geometric spreading loss for a point source in free field:
    // ΔL_div = 20·log10(r) + 11 dB   (ISO 9613-1 eq. 3)
    const geometricAttenuation_dB = 20 * Math.log10(r) + 11;
    const Lp = Lw + directivity - geometricAttenuation_dB;
    return { Lp, geometricAttenuation_dB };
}

// ---------------------------------------------------------------------------
// 6. computeTrafficNoiseFHWA
// ---------------------------------------------------------------------------

/**
 * Estimates A-weighted equivalent traffic noise level (Leq) using a simplified
 * FHWA Traffic Noise Model formulation.
 *
 * Simplified FHWA formula (close-proximity approximation):
 *   Leq(h) = 38.1 · log10(S) + 10 · log10(ADT / D) − 2.6
 *          + heavy vehicle correction: 10 · log10(1 + (pHV − 1) × 14.5)
 *
 * where:
 *   S   = speed (km/h)
 *   ADT = Annual Daily Traffic (vehicles/day)
 *   D   = reference distance (m), typically 15 m
 *   pHV = proportion heavy vehicles (0–1)
 *
 * Reference distance is normalized to D=15 m per FHWA-HEP-96-021.
 *
 * @param {number} ADT                - Annual Daily Traffic (vehicles/day).
 * @param {number} speed              - Vehicle speed (km/h).
 * @param {number} heavyVehiclePercent - Percentage of heavy vehicles (0–100).
 * @param {number} distance           - Distance from road centerline (m).
 * @returns {{ Leq: number, correction_HV_dB: number }}
 *   Leq: A-weighted level in dB(A); correction_HV_dB: heavy vehicle penalty.
 * @reference FHWA-HEP-96-021, Chapter 3, Simplified Traffic Noise Model.
 */
export function computeTrafficNoiseFHWA(ADT: number, speed: number, heavyVehiclePercent: number, distance: number): { Leq: number, correction_HV_dB: number } {
    _requirePositive(ADT, 'ADT');
    _requirePositive(speed, 'speed');
    _requireNonNegative(heavyVehiclePercent, 'heavyVehiclePercent');
    _requirePositive(distance, 'distance');
    if (heavyVehiclePercent > 100) {
        throw new RangeError(`heavyVehiclePercent must be 0–100, got ${heavyVehiclePercent}`);
    }

    const D_ref = 15; // reference distance (m), FHWA standard
    const pHV = heavyVehiclePercent / 100;

    // Base noise from traffic flow and speed
    // FHWA simplified: Leq ≈ 38.1·log10(S) + 10·log10(ADT/D_ref) − 2.6
    const baseLeq = 38.1 * Math.log10(speed) + 10 * Math.log10(ADT / D_ref) - 2.6;

    // Heavy vehicle correction (FHWA energy equivalent factor ≈ 14.5 for HDVs vs cars)
    // When pHV = 0: correction = 0; when pHV = 1: correction = 10·log10(14.5) ≈ 11.6 dB
    const hvFactor = pHV > 0 ? 10 * Math.log10(1 + pHV * 14.5) : 0;

    // Distance correction from reference (15 m) to actual distance
    const distCorrection = -20 * Math.log10(distance / D_ref);

    const Leq = baseLeq + hvFactor + distCorrection;
    return { Leq, correction_HV_dB: hvFactor };
}

// ---------------------------------------------------------------------------
// 7. computeRailwayNoiseSEL
// ---------------------------------------------------------------------------

/**
 * Estimates the Single Event Level (SEL) for a railway pass-by and converts
 * to an equivalent Leq for a given number of pass-bys per hour.
 *
 * Simplified formula based on EU Directive 2002/49/EC methodology:
 *   SEL = LpAFmax + 10·log10(L / (v · T0))
 *   where L = train length (m), v = speed (m/s), T0 = 1 s reference.
 *
 * Hourly Leq from N pass-bys:
 *   Leq = SEL + 10·log10(N / 3600)
 *
 * @param {number} speed   - Train speed (km/h).
 * @param {number} length  - Train length (m).
 * @param {number} passby  - Number of pass-bys per hour.
 * @returns {{ SEL: number, Leq_hourly: number, passByDuration_s: number }}
 * @reference EU Directive 2002/49/EC Annex II - railway noise assessment.
 */
export function computeRailwayNoiseSEL(speed: number, length: number, passby: number): { SEL: number, Leq_hourly: number, passByDuration_s: number } {
    _requirePositive(speed, 'speed');
    _requirePositive(length, 'length');
    _requireNonNegative(passby, 'passby');

    // Convert speed to m/s
    const v_ms = speed / 3.6;

    // Reference SPL for a train at 80 km/h at 25 m from track (EU RMR default ≈ 78 dB)
    // Simplified proportional speed correction: L_base + 30·log10(v/v_ref)
    const V_REF_KMH = 80;
    const L_BASE_DB = 78;
    const LpAFmax = L_BASE_DB + 30 * Math.log10(speed / V_REF_KMH);

    // Pass-by duration (s)
    const passByDuration_s = length / v_ms;

    // SEL: integrate over pass-by duration relative to 1 s
    const SEL = LpAFmax + 10 * Math.log10(passByDuration_s);

    // Hourly Leq from N pass-bys
    const Leq_hourly = passby > 0 ? SEL + 10 * Math.log10(passby / 3600) : -Infinity;

    return { SEL, Leq_hourly, passByDuration_s };
}

// ---------------------------------------------------------------------------
// 8. computeAircraftNoiseLDEN
// ---------------------------------------------------------------------------

/**
 * Computes LDEN (Day-Evening-Night weighted noise level) for airports per
 * EU Directive 2002/49/EC.
 *
 * LDEN = 10 · log10(
 *   (12/24) · 10^(Ld/10) +
 *   (4/24)  · 10^((Le+5)/10) +
 *   (8/24)  · 10^((Ln+10)/10)  )
 *
 * Each period level is computed from per-operation SEL values:
 *   Lperiod = 10 · log10( Σ 10^(SELᵢ/10) ) − 10 · log10(T_period_s)
 *
 * @param {number}   operationCount - Total aircraft operations (not used directly; arrays drive calculation).
 * @param {number[]} SEL_array      - Single Event Level for each operation (dB).
 * @param {number}   dayCount       - Number of day-period operations (07:00–19:00).
 * @param {number}   eveningCount   - Number of evening-period operations (19:00–23:00).
 * @param {number}   nightCount     - Number of night-period operations (23:00–07:00).
 * @returns {{ LDEN: number, Lday: number, Levening: number, Lnight: number }}
 * @reference EU Directive 2002/49/EC Article 3(b) - LDEN definition.
 */
export function computeAircraftNoiseLDEN(operationCount: number, SEL_array: number[], dayCount: number, eveningCount: number, nightCount: number): { LDEN: number, Lday: number, Levening: number, Lnight: number } {
    _requireNonNegative(operationCount, 'operationCount');
    _requireNonEmptyArray(SEL_array, 'SEL_array');
    _requireNonNegative(dayCount, 'dayCount');
    _requireNonNegative(eveningCount, 'eveningCount');
    _requireNonNegative(nightCount, 'nightCount');

    const totalOps = dayCount + eveningCount + nightCount;
    if (totalOps === 0) throw new RangeError('At least one of dayCount, eveningCount, nightCount must be > 0');
    if (SEL_array.length !== totalOps) {
        throw new RangeError(
            `SEL_array.length (${SEL_array.length}) must equal dayCount + eveningCount + nightCount (${totalOps})`,
        );
    }

    const DAY_S = 12 * 3600; // 12 hours
    const EVENING_S = 4 * 3600; // 4 hours
    const NIGHT_S = 8 * 3600; // 8 hours

    // Split SEL array by period
    const daySELs = SEL_array.slice(0, dayCount);
    const eveningSELs = SEL_array.slice(dayCount, dayCount + eveningCount);
    const nightSELs = SEL_array.slice(dayCount + eveningCount);

    /**
     * Computes Leq from an array of SELs over a period of T_s seconds.
     * @param {number[]} sels - SEL values
     * @param {number} T_s - period duration in seconds
     * @returns {number} Leq in dB
     */
    function selsToLeq(sels: number[], T_s: number): number {
        if (sels.length === 0) return -Infinity;
        const energySum = sels.reduce((acc: number, sel: number) => acc + _dBToLinear(sel), 0);
        return _linearTodB(energySum) - 10 * Math.log10(T_s);
    }

    const Lday = selsToLeq(daySELs, DAY_S);
    const Levening = selsToLeq(eveningSELs, EVENING_S);
    const Lnight = selsToLeq(nightSELs, NIGHT_S);

    const dayEnergy = (12 / 24) * (Lday > -Infinity ? _dBToLinear(Lday) : 0);
    const eveningEnergy = (4 / 24) * (Levening > -Infinity ? _dBToLinear(Levening + 5) : 0);
    const nightEnergy = (8 / 24) * (Lnight > -Infinity ? _dBToLinear(Lnight + 10) : 0);

    const LDEN = _linearTodB(dayEnergy + eveningEnergy + nightEnergy);
    return { LDEN, Lday, Levening, Lnight };
}

// ---------------------------------------------------------------------------
// 9. computeBioacousticIndex
// ---------------------------------------------------------------------------

/**
 * Computes the Bioacoustic Index (BI) as the area under the mean SPL spectrum
 * within a specified frequency band using trapezoidal integration.
 *
 * BI = Σ (SPL[i] − min_SPL) × freqStep   for freqMin ≤ f ≤ freqMax
 *
 * The BI captures the amplitude and frequency richness of biological sounds.
 * Higher values indicate greater biological activity.
 *
 * @param {number[]} SPL_array - Array of mean SPL values (dB) at each frequency bin.
 * @param {number}   freqMin   - Lower frequency bound (Hz).
 * @param {number}   freqMax   - Upper frequency bound (Hz).
 * @param {number}   freqStep  - Frequency resolution (Hz per bin).
 * @returns {{ BI: number, bandSPL: number[], minSPL: number }}
 *   BI: Bioacoustic Index value; bandSPL: clipped SPL sub-array; minSPL: noise floor.
 * @reference Boelman et al. (2007) DOI:10.1121/1.2717871
 */
export function computeBioacousticIndex(SPL_array: number[], freqMin: number, freqMax: number, freqStep: number): { BI: number, bandSPL: number[], minSPL: number } {
    _requireNonEmptyArray(SPL_array, 'SPL_array');
    _requireNonNegative(freqMin, 'freqMin');
    _requirePositive(freqMax, 'freqMax');
    _requirePositive(freqStep, 'freqStep');
    if (freqMax <= freqMin) {
        throw new RangeError(`freqMax (${freqMax}) must be > freqMin (${freqMin})`);
    }

    // Build frequency axis and extract band bins
    const bandSPL: number[] = [];
    for (let i = 0; i < SPL_array.length; i++) {
        const freq = freqMin + i * freqStep;
        if (freq >= freqMin && freq <= freqMax) {
            bandSPL.push(SPL_array[i]!);
        }
    }

    if (bandSPL.length === 0) return { BI: 0, bandSPL: [], minSPL: 0 };

    const minSPL = Math.min(...bandSPL);

    // BI = sum of (SPL[i] - floor) * freqStep  (area under curve above floor)
    const BI = bandSPL.reduce((acc, spl) => acc + (spl - minSPL) * freqStep, 0);

    return { BI, bandSPL, minSPL };
}

// ---------------------------------------------------------------------------
// 10. computeAcousticComplexityIndex
// ---------------------------------------------------------------------------

/**
 * Computes the Acoustic Complexity Index (ACI) from a time-frequency SPL matrix.
 *
 * For each frequency band j, ACI_j = Σ|SPL[t+1][j] − SPL[t][j]| / Σ SPL[t][j]
 * ACI_total = Σ ACI_j
 *
 * A higher ACI indicates greater temporal variation within each frequency band,
 * characteristic of biological sounds (birds) vs. stationary anthropogenic noise.
 *
 * @param {number[][]} SPL_matrix - 2D array [timeFrames][frequencyBins]; all values ≥ 0.
 * @returns {{ ACI: number, ACI_per_band: number[], timeFrames: number, freqBins: number }}
 * @reference Pieretti et al. (2011) DOI:10.1016/j.ecolind.2010.11.005
 */
export function computeAcousticComplexityIndex(SPL_matrix: number[][]): { ACI: number, ACI_per_band: number[], timeFrames: number, freqBins: number } {
    if (!Array.isArray(SPL_matrix) || SPL_matrix.length < 2) {
        throw new TypeError('SPL_matrix must be a 2D array with at least 2 time frames');
    }
    const timeFrames = SPL_matrix.length;
    const freqBins = SPL_matrix[0]!.length;
    if (freqBins === 0) throw new RangeError('SPL_matrix must have at least 1 frequency bin');

    // Validate all rows
    for (let t = 0; t < timeFrames; t++) {
        if (!Array.isArray(SPL_matrix[t]) || SPL_matrix[t]!.length !== freqBins) {
            throw new TypeError(`SPL_matrix[${t}] must be an array of length ${freqBins}`);
        }
        for (let j = 0; j < freqBins; j++) {
            if (typeof SPL_matrix[t]![j] !== 'number' || !isFinite(SPL_matrix[t]![j]!)) {
                throw new TypeError(`SPL_matrix[${t}][${j}] must be a finite number`);
            }
            if (SPL_matrix[t]![j]! < 0) {
                throw new RangeError(`SPL_matrix[${t}][${j}] must be >= 0 (linear domain SPL)`);
            }
        }
    }

    const ACI_per_band = new Array(freqBins).fill(0);

    for (let j = 0; j < freqBins; j++) {
        let sumDiff = 0;
        let sumVal = 0;
        for (let t = 0; t < timeFrames - 1; t++) {
            sumDiff += Math.abs(SPL_matrix[t + 1]![j]! - SPL_matrix[t]![j]!);
            sumVal += SPL_matrix[t]![j]!;
        }
        // Include last frame in sum
        sumVal += SPL_matrix[timeFrames - 1]![j]!;
        ACI_per_band[j] = sumVal > 0 ? sumDiff / sumVal : 0;
    }

    const ACI = ACI_per_band.reduce((a, b) => a + b, 0);
    return { ACI, ACI_per_band, timeFrames, freqBins };
}

// ---------------------------------------------------------------------------
// 11. computeSoundscapeIndex
// ---------------------------------------------------------------------------

/**
 * Computes a Soundscape Balance Index (SBI) quantifying the ratio of biophony
 * (biological sounds) to total soundscape energy.
 *
 * SBI = biophony_linear / (biophony_linear + anthropophony_linear + geophony_linear)
 *
 * SBI = 1.0: pure biological soundscape.
 * SBI = 0.0: no biological contribution.
 *
 * Also returns a composite quality score combining BI and ACI normalized to 0–1.
 *
 * @param {number} BI                - Bioacoustic Index (from computeBioacousticIndex).
 * @param {number} ACI               - Acoustic Complexity Index (from computeAcousticComplexityIndex).
 * @param {number} anthropophony_dB  - Anthropophony equivalent level (dB).
 * @param {number} geophony_dB       - Geophony equivalent level (dB).
 * @param {number} biophony_dB       - Biophony equivalent level (dB).
 * @returns {{ SBI: number, compositeQuality: number, dominantSource: string }}
 * @reference Farina (2014) Soundscape Ecology ISBN:978-94-007-7374-5
 */
export function computeSoundscapeIndex(BI: number, ACI: number, anthropophony_dB: number, geophony_dB: number, biophony_dB: number): { SBI: number, compositeQuality: number, dominantSource: string } {
    _requireNonNegative(BI, 'BI');
    _requireNonNegative(ACI, 'ACI');
    _requireFinite(anthropophony_dB, 'anthropophony_dB');
    _requireFinite(geophony_dB, 'geophony_dB');
    _requireFinite(biophony_dB, 'biophony_dB');

    const anthroLinear = _dBToLinear(anthropophony_dB);
    const geoLinear = _dBToLinear(geophony_dB);
    const bioLinear = _dBToLinear(biophony_dB);
    const totalLinear = anthroLinear + geoLinear + bioLinear;

    const SBI = totalLinear > 0 ? bioLinear / totalLinear : 0;

    // Composite quality: harmonic mean of normalized BI (capped at 100) and
    // normalized ACI (capped at 1.0 per band)
    const normalizedBI = Math.min(BI / 100, 1);
    const normalizedACI = Math.min(ACI / 1, 1);
    const compositeQuality =
        totalLinear > 0 ? (2 * normalizedBI * normalizedACI) / (normalizedBI + normalizedACI + 1e-12) : 0;

    // Dominant source determination
    let dominantSource;
    const maxLinear = Math.max(anthroLinear, geoLinear, bioLinear);
    if (maxLinear === bioLinear) dominantSource = 'biophony';
    else if (maxLinear === anthroLinear) dominantSource = 'anthropophony';
    else dominantSource = 'geophony';

    return { SBI, compositeQuality, dominantSource };
}

// ---------------------------------------------------------------------------
// 12. assessHabitatAcousticQuality
// ---------------------------------------------------------------------------

/**
 * Assesses overall habitat acoustic quality on a 0–1 scale combining ACI,
 * BI, night-time Leq, and sensitivity for specific species groups.
 *
 * Score components:
 *  - ACI contribution (25%): normalized to [0,1] using reference ACI_max = 1.0
 *  - BI contribution (25%): normalized to [0,1] using reference BI_max = 100
 *  - Quiet night bonus (25%): 1.0 if Leq_night ≤ 30 dB; linearly degrades to 0 at 55 dB
 *  - Species sensitivity penalty (25%): reduced proportionally by noise above threshold
 *
 * @param {number}   ACI            - Acoustic Complexity Index.
 * @param {number}   BI             - Bioacoustic Index.
 * @param {number}   Leq_night      - Night-time equivalent level (dB).
 * @param {string[]} sensitiveSpecies - List of sensitive species/groups present;
 *                                    each species adds a −0.05 penalty per 5 dB above 30 dB.
 * @returns {{ score: number, grade: string, components: object }}
 *   score: 0–1; grade: 'Excellent'/'Good'/'Moderate'/'Poor'/'Critical'.
 * @reference Farina (2014) ISBN:978-94-007-7374-5 §8.3
 */
export function assessHabitatAcousticQuality(ACI: number, BI: number, Leq_night: number, sensitiveSpecies: string[]): { score: number, grade: string, components: object } {
    _requireNonNegative(ACI, 'ACI');
    _requireNonNegative(BI, 'BI');
    _requireFinite(Leq_night, 'Leq_night');
    if (!Array.isArray(sensitiveSpecies)) {
        throw new TypeError('sensitiveSpecies must be an array of strings');
    }

    const ACI_MAX = 1.0;
    const BI_MAX = 100;

    const aciScore = Math.min(ACI / ACI_MAX, 1);
    const biScore = Math.min(BI / BI_MAX, 1);

    // Night quiet bonus: max at ≤30 dB, zero at ≥55 dB
    const QUIET_FLOOR_DB = 30;
    const QUIET_LIMIT_DB = 55;
    const nightScore =
        Leq_night <= QUIET_FLOOR_DB
            ? 1.0
            : Leq_night >= QUIET_LIMIT_DB
              ? 0.0
              : 1.0 - (Leq_night - QUIET_FLOOR_DB) / (QUIET_LIMIT_DB - QUIET_FLOOR_DB);

    // Species sensitivity: each species adds a penalty of 0.05 per 5 dB above 30 dB
    const excessDB = Math.max(0, Leq_night - QUIET_FLOOR_DB);
    const speciesPenalty = Math.min(sensitiveSpecies.length * 0.05 * Math.floor(excessDB / 5), 1.0);
    const speciesScore = Math.max(0, 1.0 - speciesPenalty);

    // Weighted composite score
    const score = Math.max(0, Math.min(1, 0.25 * aciScore + 0.25 * biScore + 0.25 * nightScore + 0.25 * speciesScore));

    // Grade mapping
    let grade;
    if (score >= 0.8) grade = 'Excellent';
    else if (score >= 0.6) grade = 'Good';
    else if (score >= 0.4) grade = 'Moderate';
    else if (score >= 0.2) grade = 'Poor';
    else grade = 'Critical';

    return {
        score,
        grade,
        components: { aciScore, biScore, nightScore, speciesScore },
    };
}

// ---------------------------------------------------------------------------
// 13. computeBarrierInsertion
// ---------------------------------------------------------------------------

/**
 * Estimates the insertion loss (IL) of a thin rigid noise barrier using the
 * Maekawa (1968) diffraction formula based on the Fresnel number N.
 *
 * Fresnel number: N = 2δ/λ = 2·freq·δ/c
 * where δ = path length difference = (source→top→receiver) − (source→receiver direct)
 *
 * Maekawa IL (dB) = 10·log10(3 + 20·N)   for N > 0
 *
 * Geometry (2D cross-section):
 *   d_source   = horizontal distance source to barrier base (m)
 *   d_receiver = horizontal distance barrier base to receiver (m)
 *   h_barrier  = barrier height above source/receiver grade (m)
 *
 * @param {number} Lw         - Source sound power level (dB) (for reference only; IL is geometry-based).
 * @param {number} freq        - Frequency of interest (Hz).
 * @param {number} h_barrier   - Effective barrier height above line-of-sight (m).
 * @param {number} d_source    - Horizontal distance, source to barrier (m).
 * @param {number} d_receiver  - Horizontal distance, barrier to receiver (m).
 * @param {number} [c=343]     - Speed of sound (m/s).
 * @returns {{ IL_dB: number, fresnelN: number, pathDiff_m: number }}
 * @reference Maekawa (1968) DOI:10.1016/0003-682X(68)90020-0
 */
export function computeBarrierInsertion(Lw: number, freq: number, h_barrier: number, d_source: number, d_receiver: number, c: number = SPEED_OF_SOUND_MS): { IL_dB: number, fresnelN: number, pathDiff_m: number } {
    _requireFinite(Lw, 'Lw');
    _requirePositive(freq, 'freq');
    _requireNonNegative(h_barrier, 'h_barrier');
    _requirePositive(d_source, 'd_source');
    _requirePositive(d_receiver, 'd_receiver');
    _requirePositive(c, 'c');

    // Direct path length (straight line source to receiver, over flat terrain)
    const directPath = Math.sqrt(Math.pow(d_source + d_receiver, 2));

    // Diffracted path length: source → barrier top → receiver
    const pathToBarrier = Math.sqrt(d_source * d_source + h_barrier * h_barrier);
    const pathFromBarrier = Math.sqrt(d_receiver * d_receiver + h_barrier * h_barrier);
    const diffractedPath = pathToBarrier + pathFromBarrier;

    // Path difference (positive when barrier interrupts line of sight)
    const pathDiff_m = diffractedPath - directPath;

    // Wavelength at this frequency
    const lambda = c / freq;

    // Fresnel number
    const fresnelN = (2 * pathDiff_m) / lambda;

    // Maekawa IL
    const IL_dB = fresnelN > 0 ? 10 * Math.log10(3 + 20 * fresnelN) : 0; // No barrier effect if path difference is zero or negative

    return { IL_dB, fresnelN, pathDiff_m };
}

// ---------------------------------------------------------------------------
// 14. computeRoomReverberationTime
// ---------------------------------------------------------------------------

/**
 * Computes room reverberation time RT60 (T60) using the Sabine formula.
 *
 * RT60 = 0.161 · V / A
 * where V = room volume (m³) and A = total absorption (m², sabins).
 *
 * The constant 0.161 = 24·ln(10)/c ≈ 0.161 s/m for c = 343 m/s.
 *
 * @param {number} volume          - Room volume (m³).
 * @param {number} totalAbsorption - Total acoustic absorption (m² sabins, A = Σ αᵢ·Sᵢ).
 * @returns {{ RT60_s: number, absorptionCoefficient: number }}
 *   RT60_s: reverberation time in seconds; absorptionCoefficient: A/V ratio.
 * @reference ISO 3382-2:2008; Sabine, W.C. (1900) American Architect.
 */
export function computeRoomReverberationTime(volume: number, totalAbsorption: number): { RT60_s: number, absorptionCoefficient: number } {
    _requirePositive(volume, 'volume');
    _requirePositive(totalAbsorption, 'totalAbsorption');

    const SABINE_K = 0.161; // s/m, Sabine constant for c = 343 m/s
    const RT60_s = (SABINE_K * volume) / totalAbsorption;
    return { RT60_s, absorptionCoefficient: totalAbsorption / volume };
}

// ---------------------------------------------------------------------------
// 15. computeNoiseAnnoyancePercentage
// ---------------------------------------------------------------------------

/**
 * Estimates the percentage of the population highly annoyed (%HA) from
 * Day-Night Level (Ldn) using the Schultz (1978) polynomial regression.
 *
 * %HA = a + b·Ldn + c·Ldn²   (valid for Ldn ≈ 45–85 dB)
 *
 * Schultz coefficients (1978 Table 3 curve fit):
 *   a = 0.8532, b = −0.05547, c = 0.0009004
 *
 * Results are clamped to [0, 100] %.
 *
 * @param {number} Ldn - Day-Night Level (dB). Recommended range: 45–85 dB.
 * @returns {{ percentHighlyAnnoyed: number, validRange: boolean }}
 * @reference Schultz (1978) DOI:10.1121/1.382013
 */
export function computeNoiseAnnoyancePercentage(Ldn: number): { percentHighlyAnnoyed: number, validRange: boolean } {
    _requireFinite(Ldn, 'Ldn');

    const { a, b, c } = SCHULTZ_COEFFICIENTS;
    const raw = a + b * Ldn + c * Ldn * Ldn;
    const percentHighlyAnnoyed = Math.max(0, Math.min(100, raw));
    const validRange = Ldn >= 45 && Ldn <= 85;

    return { percentHighlyAnnoyed, validRange };
}

// ---------------------------------------------------------------------------
// 16. computeVibrationWeightedRMS
// ---------------------------------------------------------------------------

/**
 * Computes the frequency-weighted RMS acceleration for whole-body vibration
 * assessment per ISO 2631-1.
 *
 * aw = sqrt( Σ (Wk[i] · a[i])² )   (discrete approximation)
 *
 * where Wk[i] are frequency weighting factors and a[i] are acceleration amplitudes
 * in m/s² at each frequency band.
 *
 * @param {number[]} acceleration_array - Array of acceleration amplitudes (m/s²) per band.
 * @param {number[]} Wk_weights         - Frequency weighting factors (Wk per ISO 2631-1 Table A.2).
 * @returns {{ aw_rms: number, crestFactor: number }}
 *   aw_rms: frequency-weighted RMS (m/s²); crestFactor: peak/RMS ratio estimate.
 * @reference ISO 2631-1:1997 §7.2
 */
export function computeVibrationWeightedRMS(acceleration_array: number[], Wk_weights: number[]): { aw_rms: number, crestFactor: number } {
    _requireNonEmptyArray(acceleration_array, 'acceleration_array');
    _requireNonEmptyArray(Wk_weights, 'Wk_weights');
    if (acceleration_array.length !== Wk_weights.length) {
        throw new RangeError(
            `acceleration_array and Wk_weights must have equal length: ${acceleration_array.length} vs ${Wk_weights.length}`,
        );
    }
    for (let i = 0; i < Wk_weights.length; i++) {
        _requireNonNegative(Wk_weights[i]!, `Wk_weights[${i}]`);
    }

    let sumSq = 0;
    let peakWeighted = 0;
    for (let i = 0; i < acceleration_array.length; i++) {
        const weighted = Wk_weights[i]! * acceleration_array[i]!;
        sumSq += weighted * weighted;
        if (Math.abs(weighted) > peakWeighted) peakWeighted = Math.abs(weighted);
    }

    const aw_rms = Math.sqrt(sumSq);
    const crestFactor = aw_rms > 0 ? peakWeighted / aw_rms : 0;
    return { aw_rms, crestFactor };
}

// ---------------------------------------------------------------------------
// 17. computeExposureActionValues
// ---------------------------------------------------------------------------

/**
 * Evaluates a daily noise exposure level (LEX,8h) against EU Directive 2003/10/EC
 * exposure action values and limit values.
 *
 * Action values (no hearing protection correction for EAV):
 *  - Lower EAV: 80 dB(A)  - Employer must make protection available
 *  - Upper EAV: 85 dB(A)  - Protection use is mandatory
 *  - Limit:     87 dB(A)  - Must not be exceeded at ear (with protection)
 *
 * @param {number} LEX8h - Daily noise exposure level (dB A).
 * @returns {{
 *   exceedsLowerEAV: boolean,
 *   exceedsUpperEAV: boolean,
 *   exceedsLimit: boolean,
 *   actionLevel: string,
 *   margin_to_limit_dB: number
 * }}
 * @reference EU Directive 2003/10/EC Article 3 - DOI:10.2800/71750
 */
export function computeExposureActionValues(LEX8h: number): { exceedsLowerEAV: boolean, exceedsUpperEAV: boolean, exceedsLimit: boolean, actionLevel: string, margin_to_limit_dB: number } {
    _requireFinite(LEX8h, 'LEX8h');

    const { lower, upper, limit } = EU_NOISE_ACTION_VALUES;
    const exceedsLowerEAV = LEX8h >= lower;
    const exceedsUpperEAV = LEX8h >= upper;
    const exceedsLimit = LEX8h >= limit;

    let actionLevel;
    if (exceedsLimit) actionLevel = 'limit_exceeded';
    else if (exceedsUpperEAV) actionLevel = 'upper_action_value';
    else if (exceedsLowerEAV) actionLevel = 'lower_action_value';
    else actionLevel = 'below_lower_action_value';

    const margin_to_limit_dB = limit - LEX8h;
    return { exceedsLowerEAV, exceedsUpperEAV, exceedsLimit, actionLevel, margin_to_limit_dB };
}

// ---------------------------------------------------------------------------
// 18. computeNoisePollutionIndex
// ---------------------------------------------------------------------------

/**
 * Computes the Noise Pollution Index (NPI) from percentile noise levels.
 *
 * NPI = L10 + D   where D = L10 − L90
 *
 * L10: level exceeded 10% of time (characterises loud events).
 * L50: level exceeded 50% of time (median / background).
 * L90: level exceeded 90% of time (background / residual).
 * D = L10 − L90: measure of noise fluctuation/intrusion.
 *
 * @param {number} L10 - Level exceeded 10% of measurement period (dB).
 * @param {number} L50 - Level exceeded 50% of measurement period (dB).
 * @param {number} L90 - Level exceeded 90% of measurement period (dB).
 * @returns {{ NPI: number, D: number, fluctuation: string }}
 *   NPI: Noise Pollution Index; D: fluctuation range; fluctuation: qualitative label.
 * @reference Griffiths, I.D. & Langdon, F.J. (1968). Subjective response to road
 *   traffic noise. J. Sound Vib. 8(1):16–32. DOI:10.1016/0022-460X(68)90148-2
 */
export function computeNoisePollutionIndex(L10: number, L50: number, L90: number): { NPI: number, D: number, fluctuation: string } {
    _requireFinite(L10, 'L10');
    _requireFinite(L50, 'L50');
    _requireFinite(L90, 'L90');
    if (L10 < L90) {
        throw new RangeError(`L10 (${L10}) must be >= L90 (${L90}) by definition`);
    }
    if (L10 < L50) {
        throw new RangeError(`L10 (${L10}) must be >= L50 (${L50}) by definition`);
    }

    const D = L10 - L90;
    const NPI = L10 + D;

    let fluctuation;
    if (D < 6) fluctuation = 'stable';
    else if (D < 12) fluctuation = 'moderate';
    else if (D < 20) fluctuation = 'high';
    else fluctuation = 'very_high';

    return { NPI, D, fluctuation };
}

// ---------------------------------------------------------------------------
// 19. computeNightTimeNoiseCriteria
// ---------------------------------------------------------------------------

/**
 * Evaluates night-time noise against WHO Night Noise Guidelines (2009).
 *
 * Window-open factor accounts for façade attenuation:
 *   Indoor_Leq = Leq_night − attenuationFactor
 *   windowOpenFactor = 0 → 15 dB attenuation (window closed)
 *   windowOpenFactor = 1 → 0 dB attenuation (window fully open)
 *   Intermediate: linear interpolation.
 *
 * WHO thresholds (outdoor):
 *   ≤ 40 dB: no significant effects
 *   40–55 dB: adverse effects begin
 *   > 55 dB: adverse effects frequent; health impact likely
 *
 * @param {number} Leq_night       - Outdoor night-time Leq (dB), 22:00–07:00.
 * @param {number} windowOpenFactor - 0 (closed) to 1 (fully open); default 0.5.
 * @returns {{
 *   Leq_indoor: number,
 *   category: string,
 *   exceedsIntermediate: boolean,
 *   exceedsAdverse: boolean,
 *   recommendation: string
 * }}
 * @reference WHO Night Noise Guidelines for Europe (2009) ISBN:978-92-890-4173-7
 */
export function computeNightTimeNoiseCriteria(Leq_night: number, windowOpenFactor: number = 0.5): { Leq_indoor: number, category: string, exceedsIntermediate: boolean, exceedsAdverse: boolean, recommendation: string } {
    _requireFinite(Leq_night, 'Leq_night');
    _requireFinite(windowOpenFactor, 'windowOpenFactor');
    if (windowOpenFactor < 0 || windowOpenFactor > 1) {
        throw new RangeError(`windowOpenFactor must be 0–1, got ${windowOpenFactor}`);
    }

    // Façade attenuation: 0 dB when open, 15 dB when closed
    const MAX_ATTENUATION = 15; // dB, typical window closed attenuation
    const attenuation = MAX_ATTENUATION * (1 - windowOpenFactor);
    const Leq_indoor = Leq_night - attenuation;

    const { intermediate, adverse } = WHO_NIGHT_THRESHOLDS;
    const exceedsIntermediate = Leq_night > intermediate;
    const exceedsAdverse = Leq_night > adverse;

    let category;
    let recommendation;
    if (!exceedsIntermediate) {
        category = 'no_significant_effect';
        recommendation = 'No action required. Level below WHO intermediate threshold.';
    } else if (!exceedsAdverse) {
        category = 'moderate_effect';
        recommendation =
            'Monitor continuously. Consider noise barriers or quiet façades. Level between WHO 40 and 55 dB.';
    } else {
        category = 'adverse_effect';
        recommendation = 'Immediate mitigation required. Level exceeds WHO 55 dB adverse threshold.';
    }

    return { Leq_indoor, category, exceedsIntermediate, exceedsAdverse, recommendation };
}

// ---------------------------------------------------------------------------
// 20. computeUrbanNoiseMap
// ---------------------------------------------------------------------------

/**
 * Computes a simplified urban noise map by summing contributions from multiple
 * point sources to each receiver, applying barrier insertion loss where defined.
 *
 * For each source s and receiver r:
 *   Lp_sr = computeSoundPressurePropagation(Lw_s, distance_sr)
 *   If a barrier exists between s and r: Lp_sr -= computeBarrierInsertion(...)
 *   Total at r: L_r = 10·log10( Σ 10^(Lp_sr/10) )
 *
 * @param {{
 *   id: string,
 *   Lw: number,
 *   x: number,
 *   y: number,
 *   directivity?: number
 * }[]} sources - Array of point sources.
 *
 * @param {{
 *   id: string,
 *   x: number,
 *   y: number
 * }[]} receivers - Array of receiver positions.
 *
 * @param {{
 *   source_id: string,
 *   receiver_id: string,
 *   h_barrier: number,
 *   freq: number
 * }[]} barriers - Array of barrier definitions linking source-receiver pairs.
 *
 * @returns {{
 *   receiverLevels: { id: string, Lp_total: number, contributions: object[] }[]
 * }}
 * @reference ISO 9613-1:1993 §7; ISO 9613-2:1996 §7 (engineering method).
 */
export function computeUrbanNoiseMap(sources: { id: string, Lw: number, x: number, y: number, directivity?: number }[], receivers: { id: string, x: number, y: number }[], barriers: { source_id: string, receiver_id: string, h_barrier: number, freq: number }[]): { receiverLevels: { id: string, Lp_total: number, contributions: object[] }[] } {
    if (!Array.isArray(sources) || sources.length === 0) throw new TypeError('sources must be a non-empty array');
    if (!Array.isArray(receivers) || receivers.length === 0) throw new TypeError('receivers must be a non-empty array');
    if (!Array.isArray(barriers)) throw new TypeError('barriers must be an array');

    // Build barrier lookup: key = `${source_id}::${receiver_id}`
    const barrierMap = new Map();
    for (const b of barriers) {
        if (!b.source_id || !b.receiver_id) {
            throw new TypeError('Each barrier must have source_id and receiver_id');
        }
        _requireNonNegative(b.h_barrier, 'barrier.h_barrier');
        _requirePositive(b.freq, 'barrier.freq');
        barrierMap.set(`${b.source_id}::${b.receiver_id}`, b);
    }

    const receiverLevels = receivers.map((rec) => {
        let totalLinear = 0;
        const contributions = [];

        for (const src of sources) {
            const dist = Math.sqrt(Math.pow(rec.x - src.x, 2) + Math.pow(rec.y - src.y, 2));
            if (dist <= 0) {
                // Co-located: skip (undefined propagation)
                contributions.push({ source_id: src.id, Lp: null, note: 'co-located' });
                continue;
            }

            const { Lp } = computeSoundPressurePropagation(src.Lw, dist, src.directivity ?? 0);
            let Lp_final = Lp;

            // Apply barrier if defined for this source-receiver pair
            const barrierKey = `${src.id}::${rec.id}`;
            if (barrierMap.has(barrierKey)) {
                const b = barrierMap.get(barrierKey);
                const d_source = Math.abs(src.x - (src.x + rec.x) / 2) || dist / 2;
                const d_receiver = dist - d_source;
                const { IL_dB } = computeBarrierInsertion(
                    src.Lw,
                    b.freq,
                    b.h_barrier,
                    Math.max(d_source, 0.1),
                    Math.max(d_receiver, 0.1),
                );
                Lp_final = Lp - IL_dB;
            }

            totalLinear += _dBToLinear(Lp_final);
            contributions.push({ source_id: src.id, Lp: Lp_final, distance_m: dist });
        }

        const Lp_total = totalLinear > 0 ? _linearTodB(totalLinear) : -Infinity;
        return { id: rec.id, Lp_total, contributions };
    });

    return { receiverLevels };
}

console.debug('[BCO:end]', 'app/js/core/analytics/noiseSoundscapeEcology.js');

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const noiseSoundscapeEcologyMeta = {
    name: 'noiseSoundscapeEcology',
    description: 'Noise, Soundscape & Acoustic Ecology',
    category: 'analytics',
    familyTags: ['noise'],
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
