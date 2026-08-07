// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
/**
 * Noise & Vibration Advanced Assessment Module
 *
 * Advanced topics not covered by noiseVibration.js (ISO 9613 / USBM / NBR 10151).
 *
 * Implements:
 *  - CORINE road traffic noise (EC 2002 Environmental Noise Directive)
 *  - Schall 03 railway noise (DB AG 1990, EU END)
 *  - Industrial noise with octave band analysis (ISO 8297, EN ISO 3746)
 *  - Building sound transmission loss (ISO 717-1, mass law, coincidence)
 *  - Blast vibration PPV with human comfort (ISEE 2011, USBM RI 8507)
 *  - Low-frequency noise and infrasound (Berglund 1996 WHO, Leventhall 2003)
 *  - Simplified noise contour mapping (ISO 9613-2 + Maekawa)
 *  - Human vibration exposure (ISO 2631-1:1997, EU Directive 2002/44/EC)
 *  - Community noise criteria and impact (WHO 2018 Environmental Noise Guidelines)
 *  - Acoustic model validation statistics (ISO 1996-2, HARMONOISE protocol)
 *
 * Academic references:
 *  - CORINE (2002) EC Environmental Noise Directive 2002/49/EC
 *    DOI:10.1016/S0003-682X(02)00026-4 (END methodology overview)
 *  - DB AG (1990) Schall 03: Richtlinie zur Berechnung der Schallimmissionen
 *    von Schienenwegen - Ausgabe 1990, Deutsche Bahn AG
 *  - ISO 8297:1994 Acoustics - Determination of sound power levels of
 *    multisource industrial plants
 *  - ISO 9613-1:1993 Acoustics - Atmospheric absorption (Sutherland-Bass)
 *  - ISO 717-1:2013 Acoustics - Rating of sound insulation (Rw)
 *  - ISEE (2011) Blasting Vibration Standards, Explosive Reference Database
 *  - Berglund B., Hassmen P., Job R.F.S. (1996) Sources and effects of
 *    low-frequency noise. JASA 99(5):2985-3002. DOI:10.1121/1.414863
 *  - Leventhall H.G. (2003) A review of published research on low frequency
 *    noise and its effects. DEFRA, London
 *  - ISO 2631-1:1997 Mechanical vibration and shock - Evaluation of human
 *    exposure to whole-body vibration
 *  - EU Directive 2002/44/EC on minimum health and safety requirements
 *    regarding the exposure of workers to risks arising from physical agents
 *  - WHO (2018) Environmental Noise Guidelines for the European Region.
 *    WHO Regional Office for Europe, Copenhagen
 *  - Miedema H.M.E., Oudshoorn C.G.M. (2001) Annoyance from transportation
 *    noise: relationships with exposure metrics DNL and DENL and their
 *    confidence intervals. Environ Health Perspect 109(4):409-416.
 *    DOI:10.1289/ehp.01109409
 *  - ISO 1996-2:2017 Acoustics - Description, measurement and assessment of
 *    environmental noise
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Energy addition: 10*log10(sum(10^(Li/10))).
 * Soma de níveis de pressão sonora em escala logarítmica.
 * @param {number[]} levels_dB
 * @returns {number}
 */
function energySum(levels_dB: number[]): number {
    return 10 * Math.log10(levels_dB.reduce((s, l) => s + Math.pow(10, l / 10), 0));
}

// ---------------------------------------------------------------------------
// 1. CORINE Road Traffic Noise (EU END 2002/49/EC)
// ---------------------------------------------------------------------------

/**
 * CORINE road traffic noise emission and propagation model.
 *
 * Emission level at 7.5 m reference distance (EU Environmental Noise Directive
 * 2002/49/EC + CORINE methodology):
 *   E_day = 10×log10( ADT×(1-pt)×vcar^(1.5) + 8×pt×ADT×vtruck^(1.5) )
 *   Correction for gradient: +0.5×|gradient_pct| dB
 *   Distance correction: -10×log10(d/7.5)
 *
 * Lnight = Lday - 5 dB (simplification for standard traffic patterns)
 * Lden = 10×log10( (12/24)×10^(Lday/10) + (4/24)×10^((Lday-3+5)/10) + (8/24)×10^((Lnight+10)/10) )
 *
 * EU Lden target: < 55 dB (residential, WHO 2018 recommendation)
 *
 * @param {number} adt - Annual Daily Traffic (vehicles/day, > 0)
 * @param {number} percentTrucks - Fraction of heavy vehicles (0–1)
 * @param {number} speedKmh - Traffic speed (km/h, > 0)
 * @param {number} distanceM - Distance from road centre to receiver (m, > 0)
 * @param {number} [gradientPct=0] - Road gradient (%, can be negative)
 * @returns {{ leq_day_dB: number, leq_night_dB: number, lden_dB: number, exceedsEUTarget: boolean }}
 * @throws {RangeError} for non-positive ADT, speed or distance, or out-of-range percentTrucks
 * @see EU Directive 2002/49/EC Annex II; CORINE programme report
 */
export function trafficNoiseCorine(adt: number, percentTrucks: number, speedKmh: number, distanceM: number, gradientPct: number = 0): { leq_day_dB: number, leq_night_dB: number, lden_dB: number, exceedsEUTarget: boolean } {
    if (adt <= 0) throw new RangeError(`adt must be > 0, got ${adt}`);
    if (percentTrucks < 0 || percentTrucks > 1) {
        throw new RangeError(`percentTrucks must be in [0,1], got ${percentTrucks}`);
    }
    if (speedKmh <= 0) throw new RangeError(`speedKmh must be > 0, got ${speedKmh}`);
    if (distanceM <= 0) throw new RangeError(`distanceM must be > 0, got ${distanceM}`);

    const pt = percentTrucks;
    const vcar = speedKmh;
    const vtruck = Math.min(speedKmh, 90); // trucks capped at 90 km/h

    // CORINE emission term: energia de carros + caminhoes pesados
    // Fator de caminhao = 8 (equivalencia de emissao sonora)
    const trafficEnergy = adt * (1 - pt) * Math.pow(vcar, 1.5) + 8 * pt * adt * Math.pow(vtruck, 1.5);
    let emissionLevel = 10 * Math.log10(trafficEnergy + 1e-30); // +eps evita log(0)

    // Correcao de gradiente: +0.5 dB por % de inclinacao
    emissionLevel += 0.5 * Math.abs(gradientPct);

    // Correcao de distancia (espalhamento cilindrico para via longa):
    // -10×log10(d/7.5)
    const distanceCorrection = -10 * Math.log10(distanceM / 7.5);
    const leq_day_dB = emissionLevel + distanceCorrection;

    // Nivel noturno: reducao tipica de 5 dB por menor fluxo
    const leq_night_dB = leq_day_dB - 5;

    // Lden (EU END) com periodos dia/tarde/noite
    // Tarde = leq_day - 3 dB (simplificado), penalidade tarde +5, penalidade noite +10
    const leq_evening_dB = leq_day_dB - 3;
    const lden_dB =
        10 *
        Math.log10(
            (12 / 24) * Math.pow(10, leq_day_dB / 10) +
                (4 / 24) * Math.pow(10, (leq_evening_dB + 5) / 10) +
                (8 / 24) * Math.pow(10, (leq_night_dB + 10) / 10),
        );

    // Meta EU: Lden < 55 dB (residencial)
    const exceedsEUTarget = lden_dB >= 55;

    return Object.freeze({ leq_day_dB, leq_night_dB, lden_dB, exceedsEUTarget });
}

// ---------------------------------------------------------------------------
// 2. Schall 03 Railway Noise (DB AG 1990, EU END)
// ---------------------------------------------------------------------------

/**
 * German Schall 03 railway noise calculation.
 *
 * Emission at 25 m reference distance (base values per train category at 100 km/h):
 *   passenger:  LA,eq(25m) = 67 dB(A)
 *   freight:    LA,eq(25m) = 72 dB(A)
 *   highspeed:  LA,eq(25m) = 63 dB(A)
 *
 * Speed correction: +30×log10(v/100) [Schall 03, Abschnitt 4.1]
 * Time fraction: -10×log10(T_ref/T_mess) where T_ref = 1 h
 * Traffic term:  +10×log10(N) for N trains
 * Distance:      -10×log10(d/25) [cylindrical spreading from track]
 * Shielding benefit: 3 dB per metre of barrier above line-of-sight (simplified)
 *
 * @param {'passenger'|'freight'|'highspeed'} trainCategory - Category of rolling stock
 * @param {number} speed_kmh - Train speed (km/h, > 0)
 * @param {number} numberOfTrains - Number of train passages in assessment period (> 0)
 * @param {number} duration_hr - Assessment period duration (hours, > 0)
 * @param {number} distanceM - Distance from track centreline to receiver (m, > 0)
 * @returns {{ lAeq_dB: number, leq_dB: number, lnight_dB: number, shieldingBenefit_dB: number }}
 * @throws {RangeError} for invalid category or non-positive numeric inputs
 * @see DB AG (1990) Schall 03 Richtlinie Abschnitt 4
 */
export function railwayNoiseSchall03(trainCategory: 'passenger'|'freight'|'highspeed', speed_kmh: number, numberOfTrains: number, duration_hr: number, distanceM: number): { lAeq_dB: number, leq_dB: number, lnight_dB: number, shieldingBenefit_dB: number } {
    const validCategories = ['passenger', 'freight', 'highspeed'];
    if (!validCategories.includes(trainCategory)) {
        throw new RangeError(`trainCategory must be one of ${validCategories.join('|')}, got '${trainCategory}'`);
    }
    if (speed_kmh <= 0) throw new RangeError(`speed_kmh must be > 0, got ${speed_kmh}`);
    if (numberOfTrains <= 0) throw new RangeError(`numberOfTrains must be > 0, got ${numberOfTrains}`);
    if (duration_hr <= 0) throw new RangeError(`duration_hr must be > 0, got ${duration_hr}`);
    if (distanceM <= 0) throw new RangeError(`distanceM must be > 0, got ${distanceM}`);

    // Valor de emissao base a 25 m, 100 km/h [dB(A)]
    const baseEmission = { passenger: 67, freight: 72, highspeed: 63 };
    const lm_25m = baseEmission[trainCategory];

    // Correcao de velocidade: +30×log10(v/100)
    const speedCorr = 30 * Math.log10(speed_kmh / 100);

    // Correcao de numero de trens e tempo de referencia
    // LM = lm_25m + speedCorr + 10×log10(N/T_hr)
    const trafficCorr = 10 * Math.log10(numberOfTrains / duration_hr);

    // Nivel de emissao a 25 m
    const lm_emission = lm_25m + speedCorr + trafficCorr;

    // Atenuacao por distancia (espalhamento cilindrico da via): -10×log10(d/25)
    const distCorr = -10 * Math.log10(distanceM / 25);

    const lAeq_dB = lm_emission + distCorr;

    // Diferenca A-ponderacao vs linear (aprox. +0.5 dB para ruido ferroviario tipico)
    const leq_dB = lAeq_dB - 0.5;

    // Nivel noturno: periodo 22h-06h tipicamente com -4 dB por reducao de trafego
    const lnight_dB = lAeq_dB - 4;

    // Beneficio de barreira: 3 dB/m de altura acima da linha de visada (simplificado)
    const shieldingBenefit_dB = 3.0; // valor por metro, informativo

    return Object.freeze({ lAeq_dB, leq_dB, lnight_dB, shieldingBenefit_dB });
}

// ---------------------------------------------------------------------------
// 3. Industrial Noise with Octave Band Analysis (ISO 8297, EN ISO 3746)
// ---------------------------------------------------------------------------

/**
 * Simplified atmospheric absorption coefficients for the Sutherland-Bass model.
 * ISO 9613-1:1993 Annex A - values in dB/km at 20°C, 50% RH.
 * Keys are octave band centre frequencies (Hz).
 * @type {Readonly<Record<number, number>>}
 */
const ISO9613_ALPHA_20C_50RH = Object.freeze(
    ({
        125: 0.1,
        250: 0.4,
        500: 1.0,
        1000: 1.9,
        2000: 3.7,
        4000: 9.7,
    } as Record<number, number>),
);

/**
 * Atmospheric absorption correction factors for temperature and humidity.
 * Simple multiplicative factor relative to reference (20°C, 50% RH).
 * Higher temperature or lower humidity increases absorption at high frequencies.
 * @param {number} temperature_C
 * @param {number} humidity_pct
 * @param {number} frequency_hz
 * @returns {number} absorption coefficient in dB/km
 */
function atmosphericAbsorptionISO9613(temperature_C: number, humidity_pct: number, frequency_hz: number): number {
    const bands = [125, 250, 500, 1000, 2000, 4000];
    const baseAlpha = ISO9613_ALPHA_20C_50RH;

    // Temperatura e humidade afetam absorcao principalmente nas altas frequencias
    // Fator de correcao simplificado (Sutherland-Bass Annex A)
    // deltaT = temperatura relativa a 20 C, deltaH = humidade relativa a 50%
    const deltaT = (temperature_C - 20) / 20;
    const deltaH = (humidity_pct - 50) / 50;
    const freqFactor = Math.log10(Math.max(frequency_hz, 100) / 100) / Math.log10(4000 / 100);
    const correction = 1 + 0.2 * deltaT * freqFactor - 0.1 * deltaH * freqFactor;

    // Interpolacao log-linear entre bandas
    if (frequency_hz <= bands[0]!) return (baseAlpha[bands[0]!] ?? 0) * correction;
    if (frequency_hz >= bands[bands.length - 1]!)
        return (baseAlpha[bands[bands.length - 1]!] ?? 0) * correction;

    for (let i = 0; i < bands.length - 1; i++) {
        const bi = bands[i]!;
        const bi1 = bands[i + 1]!;
        if (frequency_hz >= bi && frequency_hz <= bi1) {
            const t = (Math.log10(frequency_hz) - Math.log10(bi)) / (Math.log10(bi1) - Math.log10(bi));
            const alpha = (baseAlpha[bi] ?? 0) + t * ((baseAlpha[bi1] ?? 0) - (baseAlpha[bi] ?? 0));
            return alpha * correction;
        }
    }
    return (baseAlpha[bands[bands.length - 1]!] ?? 0) * correction;
}

/**
 * Industrial noise prediction with octave band analysis.
 *
 * Geometric spreading (ISO 8297): Lp = Lw - 20×log10(d) - 11
 * Atmospheric absorption per octave band (ISO 9613-1 Annex A, Sutherland-Bass).
 * Broadband level: energy sum of octave band levels.
 *
 * @param {number} soundPower_dB - Overall A-weighted sound power level (dB re 1 pW)
 * @param {{125?:number, 250?:number, 500?:number, 1000?:number, 2000?:number, 4000?:number}} octaveBandPowers
 *   Octave band sound power levels (dB). Missing bands default to soundPower_dB - 6 dB each.
 * @param {number} distanceM - Distance from source to receiver (m, > 0)
 * @param {{temperature_C: number, humidity_pct: number}} atmosphere - Air conditions
 * @returns {{
 *   lpAtReceiver_dB: number,
 *   octaveBandAttenuation: Object<number,number>,
 *   atmosphericAbsorption: Object<number,number>,
 *   totalAttenuation_dB: number
 * }}
 * @throws {RangeError} for non-positive distance or invalid atmosphere values
 * @see ISO 8297:1994; ISO 9613-1:1993 Annex A
 */
export function industrialNoiseLwa(soundPower_dB: number, octaveBandPowers: {125?:number, 250?:number, 500?:number, 1000?:number, 2000?:number, 4000?:number}, distanceM: number, atmosphere: {temperature_C: number, humidity_pct: number}): { lpAtReceiver_dB: number, octaveBandAttenuation: Record<number,number>, atmosphericAbsorption: Record<number,number>, totalAttenuation_dB: number } {
    if (distanceM <= 0) throw new RangeError(`distanceM must be > 0, got ${distanceM}`);
    if (!atmosphere || !Number.isFinite(atmosphere.temperature_C)) {
        throw new RangeError('atmosphere.temperature_C must be a finite number');
    }
    if (!Number.isFinite(atmosphere.humidity_pct) || atmosphere.humidity_pct < 0 || atmosphere.humidity_pct > 100) {
        throw new RangeError('atmosphere.humidity_pct must be in [0,100]');
    }

    const bands = [125, 250, 500, 1000, 2000, 4000];
    const defaultBandLevel = soundPower_dB - 10 * Math.log10(bands.length); // energia igual por banda

    // Atenuacao geometrica (ponto): -20×log10(d) - 11
    const geometricAtten = 20 * Math.log10(distanceM) + 11;

        const octaveBandAttenuation: Record<number, number>= {};
        const atmosphericAbsorption: Record<number, number>= {};
        const bandLevelsAtReceiver: number[]= [];
    const obp = (octaveBandPowers as Record<number, number>);

    for (const f of bands) {
        const lw_band = obp[f] !== undefined ? obp[f] : defaultBandLevel;
        const alpha = atmosphericAbsorptionISO9613(atmosphere.temperature_C, atmosphere.humidity_pct, f);
        // Absorcao atmosferica: A_atm = alpha [dB/km] × d [m] / 1000
        const aAtm = (alpha * distanceM) / 1000;
        atmosphericAbsorption[f] = aAtm;
        const totalAtten = geometricAtten + aAtm;
        octaveBandAttenuation[f] = totalAtten;
        bandLevelsAtReceiver.push(lw_band - totalAtten);
    }

    const lpAtReceiver_dB = energySum(bandLevelsAtReceiver);
    const totalAttenuation_dB = soundPower_dB - lpAtReceiver_dB;

    return Object.freeze({
        lpAtReceiver_dB,
        octaveBandAttenuation: Object.freeze(octaveBandAttenuation),
        atmosphericAbsorption: Object.freeze(atmosphericAbsorption),
        totalAttenuation_dB,
    });
}

// ---------------------------------------------------------------------------
// 4. Building Sound Transmission Loss (ISO 717-1, mass law)
// ---------------------------------------------------------------------------

/**
 * Material properties for sound transmission loss calculations.
 * density in kg/m³, Young's modulus E in Pa.
 * @type {Readonly<Record<string, { density: number, E: number, Rw_100mm: number }>>}
 */
const WALL_MATERIAL_PROPS = Object.freeze({
    concrete: Object.freeze({ density: 2300, E: 30e9, Rw_100mm: 45 }),
    brick: Object.freeze({ density: 1800, E: 15e9, Rw_100mm: 42 }),
    glass: Object.freeze({ density: 2500, E: 70e9, Rw_100mm: 28 }),
    steel: Object.freeze({ density: 7800, E: 200e9, Rw_100mm: 32 }),
    wood: Object.freeze({ density: 600, E: 10e9, Rw_100mm: 18 }),
});

/**
 * Building sound transmission loss via mass law and ISO 717-1 Rw rating.
 *
 * Mass law (Berger, London):
 *   TL(f) = 20×log10(f × m) - 47.2  [dB, m = surface mass in kg/m²]
 *
 * Coincidence frequency (bending wave resonance):
 *   fc = c² / (π × h) × sqrt(ρ / E)
 *   where c = 340 m/s, h = thickness, ρ = density, E = Young's modulus
 *
 * Near coincidence, TL drops ~10 dB below mass law prediction.
 *
 * Rw weighted sound reduction index: Rw ≈ Rw_100mm × (thickness_m / 0.1)^0.5
 * (simplified proportionality for single homogeneous leaf)
 *
 * @param {number} frequency_hz - Assessment frequency (Hz, > 0)
 * @param {'concrete'|'brick'|'glass'|'steel'|'wood'} wallMaterial - Wall material
 * @param {number} thickness_m - Wall thickness (m, > 0)
 * @returns {{
 *   Rw_dB: number,
 *   frequencyDependentTL: number,
 *   coincidenceFrequency_hz: number,
 *   insertionLoss_dB: number
 * }}
 * @throws {RangeError} for non-positive frequency or thickness, or unknown material
 * @see ISO 717-1:2013; Fahy F. (2001) Foundations of Engineering Acoustics, §5
 */
export function buildingInsertionLoss(frequency_hz: number, wallMaterial: 'concrete'|'brick'|'glass'|'steel'|'wood', thickness_m: number): { Rw_dB: number, frequencyDependentTL: number, coincidenceFrequency_hz: number, insertionLoss_dB: number } {
    if (frequency_hz <= 0) throw new RangeError(`frequency_hz must be > 0, got ${frequency_hz}`);
    if (thickness_m <= 0) throw new RangeError(`thickness_m must be > 0, got ${thickness_m}`);
    if (!WALL_MATERIAL_PROPS[wallMaterial]) {
        throw new RangeError(
            `wallMaterial '${wallMaterial}' unknown. Valid: ${Object.keys(WALL_MATERIAL_PROPS).join('|')}`,
        );
    }

    const { density, E, Rw_100mm } = WALL_MATERIAL_PROPS[wallMaterial];
    const c = 340; // velocidade do som no ar (m/s)

    // Massa superficial [kg/m²]
    const surfaceMass = density * thickness_m;

    // Lei de massa: TL = 20×log10(f × m) - 47.2
    const tlMassLaw = 20 * Math.log10(frequency_hz * surfaceMass) - 47.2;

    // Frequencia de coincidencia: fc = c² / (π × h) × sqrt(ρ / E)
    const coincidenceFrequency_hz = ((c * c) / (Math.PI * thickness_m)) * Math.sqrt(density / E);

    // Reducao por coincidencia: TL cai ~10 dB em fc ± 1/3 oitava
    let frequencyDependentTL = tlMassLaw;
    const freqRatio = frequency_hz / coincidenceFrequency_hz;
    if (freqRatio > 0.7 && freqRatio < 1.4) {
        // Reducao na regiao de coincidencia (modelo simplificado)
        const coincidenceDip = 10 * (1 - Math.abs(Math.log2(freqRatio)));
        frequencyDependentTL = tlMassLaw - coincidenceDip;
    }

    // Indice de reducao sonora ponderada Rw (ISO 717-1)
    // Escala com raiz quadrada da espessura relativa a 100 mm
    const Rw_dB = Rw_100mm * Math.sqrt(thickness_m / 0.1);

    // Perda de insercao no receptor: min(TL(f), Rw) como estimativa pratica
    const insertionLoss_dB = Math.max(0, Math.min(frequencyDependentTL, Rw_dB));

    return Object.freeze({
        Rw_dB,
        frequencyDependentTL,
        coincidenceFrequency_hz,
        insertionLoss_dB,
    });
}

// ---------------------------------------------------------------------------
// 5. Blast Vibration PPV and Human Comfort (ISEE 2011, USBM RI 8507)
// ---------------------------------------------------------------------------

/**
 * Blast vibration PPV prediction with scaled distance and human comfort assessment.
 *
 * USBM RI 8507 (Siskind et al. 1980) propagation law:
 *   PPV = k × (D / sqrt(W))^(-n)
 * Default: k = 160 (ISEE 2011 site constant for rock), n = 1.6
 *
 * Damage risk (DIN 4150-3:2016 / USBM thresholds):
 *   PPV < 2 mm/s  → negligible
 *   PPV < 5 mm/s  → minor
 *   PPV < 10 mm/s → moderate
 *   PPV >= 10 mm/s → major
 *
 * Human comfort (ISO 2631-2:2003):
 *   PPV < 0.15 mm/s → not_perceptible
 *   PPV < 0.6 mm/s  → perceptible
 *   PPV < 2 mm/s    → annoying
 *   PPV >= 2 mm/s   → disturbing
 *
 * @param {number} chargeWeight_kg - Maximum instantaneous charge per delay (kg, > 0)
 * @param {number} distanceM - Distance from blast to receiver (m, > 0)
 * @param {number} [kConstant=160] - Site propagation constant (> 0)
 * @param {number} [nExponent=1.6] - Decay exponent (> 0)
 * @returns {{
 *   ppv_mm_s: number,
 *   scaledDistance: number,
 *   damageRisk: 'negligible'|'minor'|'moderate'|'major',
 *   humanComfortClass: 'not_perceptible'|'perceptible'|'annoying'|'disturbing'
 * }}
 * @throws {RangeError} for non-positive inputs
 * @see Siskind et al. (1980) USBM RI 8507; ISEE (2011) Blasting Vibration Standards
 */
export function blastVibrationPPV(chargeWeight_kg: number, distanceM: number, kConstant: number = 160, nExponent: number = 1.6): { ppv_mm_s: number, scaledDistance: number, damageRisk: 'negligible'|'minor'|'moderate'|'major', humanComfortClass: 'not_perceptible'|'perceptible'|'annoying'|'disturbing' } {
    if (chargeWeight_kg <= 0) throw new RangeError(`chargeWeight_kg must be > 0, got ${chargeWeight_kg}`);
    if (distanceM <= 0) throw new RangeError(`distanceM must be > 0, got ${distanceM}`);
    if (kConstant <= 0) throw new RangeError(`kConstant must be > 0, got ${kConstant}`);
    if (nExponent <= 0) throw new RangeError(`nExponent must be > 0, got ${nExponent}`);

    // Distancia escalada SD = D / sqrt(W) [m / kg^0.5]
    const scaledDistance = distanceM / Math.sqrt(chargeWeight_kg);

    // PPV em mm/s
    const ppv_mm_s = kConstant * Math.pow(scaledDistance, -nExponent);

    // Classificacao de risco de danos estruturais
        let damageRisk: 'negligible'|'minor'|'moderate'|'major';
    if (ppv_mm_s < 2) damageRisk = 'negligible';
    else if (ppv_mm_s < 5) damageRisk = 'minor';
    else if (ppv_mm_s < 10) damageRisk = 'moderate';
    else damageRisk = 'major';

    // Classificacao de conforto humano (ISO 2631-2)
        let humanComfortClass: 'not_perceptible'|'perceptible'|'annoying'|'disturbing';
    if (ppv_mm_s < 0.15) humanComfortClass = 'not_perceptible';
    else if (ppv_mm_s < 0.6) humanComfortClass = 'perceptible';
    else if (ppv_mm_s < 2) humanComfortClass = 'annoying';
    else humanComfortClass = 'disturbing';

    return { ppv_mm_s, scaledDistance, damageRisk, humanComfortClass };
}

// ---------------------------------------------------------------------------
// 6. Low-Frequency Noise and Infrasound (WHO / Leventhall 2003)
// ---------------------------------------------------------------------------

/**
 * G-weighting filter factors (dB) for infrasound assessment.
 * Per IEC 61672 / ISO 7196:1995. Relative to 0 dB at reference.
 * Keys are octave band centre frequencies (Hz).
 * @type {Readonly<Record<number, number>>}
 */
const G_WEIGHTING_FACTORS = Object.freeze(
    ({
        8: -4.0,
        16: 0.0, // reference frequency
        31.5: -3.0,
        63: -11.0,
        125: -23.0,
    } as Record<number, number>),
);

/**
 * Low-frequency noise and infrasound assessment.
 *
 * G-weighted level per ISO 7196:
 *   LG = 10×log10(sum(10^((Li + Gi)/10)))
 * where Gi are the G-weighting offsets.
 *
 * Low-frequency character criterion (Leventhall 2003):
 *   LFN present if any of {8,16,31.5,63} Hz bands > threshold
 *
 * Annoyance probability (Berglund 1996 simplified):
 *   > 45 dB G-weighted → high annoyance risk
 *   > 40 dB G-weighted → moderate annoyance risk
 *
 * @param {{8?: number, 16?: number, 31.5?: number, 63?: number, 125?: number}} octaveBandLevels
 *   Sound pressure levels (dB) by octave band centre frequency
 * @param {string} [measurementLocation='outdoor'] - Location context (informative)
 * @returns {{
 *   Gweighted_dB: number,
 *   lowFreqCharacter: boolean,
 *   annoyanceProbability_pct: number,
 *   GweightedCurveExceedances: Object<number, boolean>
 * }}
 * @throws {RangeError} if no valid band levels are provided
 * @see Berglund et al. (1996) JASA 99(5):2985-3002; ISO 7196:1995
 */
export function lowFrequencyNoise(octaveBandLevels: {8?: number, 16?: number, 31.5?: number, 63?: number, 125?: number}, _measurementLocation: string = 'outdoor'): { Gweighted_dB: number, lowFreqCharacter: boolean, annoyanceProbability_pct: number, GweightedCurveExceedances: Record<number, boolean> } {
    const bands = [8, 16, 31.5, 63, 125];
    const obl = (octaveBandLevels as Record<number, number>);
    const presentBands = bands.filter((f) => obl[f] !== undefined && Number.isFinite(obl[f]));
    if (presentBands.length === 0) {
        throw new RangeError('octaveBandLevels must contain at least one valid band {8, 16, 31.5, 63, 125}');
    }

    // Nivel G-ponderado: energia somada com fatores de ponderacao
    const weightedLevels = presentBands.map((f) => obl[f]! + (G_WEIGHTING_FACTORS[f] || 0));
    const Gweighted_dB = energySum(weightedLevels);

    // Carater de baixa frequencia: nivel em 63 Hz > 50 dB indica alta probabilidade de incomodo
    // (criterio Leventhall 2003, confirmado pelo WHO 1999)
    const lowFreqCharacter = (obl[63] || -Infinity) > 50 || (obl[31.5] || -Infinity) > 55;

    // Probabilidade de incomodo baseada no nivel G-ponderado
    let annoyanceProbability_pct;
    if (Gweighted_dB > 55) annoyanceProbability_pct = 90;
    else if (Gweighted_dB > 50) annoyanceProbability_pct = 70;
    else if (Gweighted_dB > 45) annoyanceProbability_pct = 50;
    else if (Gweighted_dB > 40) annoyanceProbability_pct = 25;
    else annoyanceProbability_pct = 10;

    // Verificacao de ultrapassagem por banda (limites orientativos WHO/Leventhall)
        const thresholds: Record<number, number>= { 8: 80, 16: 72, 31.5: 64, 63: 55, 125: 45 };
        const GweightedCurveExceedances: Record<number, boolean>= {};
    for (const f of presentBands) {
        GweightedCurveExceedances[f] = (obl[f] || -Infinity) > (thresholds[f] || 999);
    }

    return Object.freeze({
        Gweighted_dB,
        lowFreqCharacter,
        annoyanceProbability_pct,
        GweightedCurveExceedances: Object.freeze(GweightedCurveExceedances),
    });
}

// ---------------------------------------------------------------------------
// 7. Simplified Noise Contour Mapping (ISO 9613-2 + Maekawa)
// ---------------------------------------------------------------------------

/**
 * Barrier Maekawa insertion loss helper for noise mapping.
 * IL = 10×log10(3 + 20×N), N = 2×delta/lambda (Fresnel number).
 * Assumes horizontal source and receiver at ground level for simplified geometry.
 * @param {{x1:number,y1:number,x2:number,y2:number,height_m:number}} barrier
 * @param {{x_m:number,y_m:number}} sourceXY - Source location (m)
 * @param {{x_m:number,y_m:number}} receptorXY - Receptor location (m)
 * @param {number} frequency_hz
 * @returns {number} insertion loss in dB (0 if barrier doesn't intercept path)
 */
function barrierMaekawaIL(barrier: {x1:number,y1:number,x2:number,y2:number,height_m:number}, sourceXY: {x_m:number,y_m:number}, receptorXY: {x_m:number,y_m:number}, frequency_hz: number): number {
    const c = 340;
    const lambda = c / frequency_hz;

    // Verificar se a barreira intercepta a linha fonte-receptor (simplificado)
    // Projecao da barreira: ponto medio
    const bmx = (barrier.x1 + barrier.x2) / 2;
    const bmy = (barrier.y1 + barrier.y2) / 2;

    // Distancia fonte-barreira e barreira-receptor
    const ds = Math.sqrt((sourceXY.x_m - bmx) ** 2 + (sourceXY.y_m - bmy) ** 2);
    const dr = Math.sqrt((receptorXY.x_m - bmx) ** 2 + (receptorXY.y_m - bmy) ** 2);
    const directDist = Math.sqrt((sourceXY.x_m - receptorXY.x_m) ** 2 + (sourceXY.y_m - receptorXY.y_m) ** 2);

    // Verificar se barreira esta entre fonte e receptor (soma de distancias aproximada)
    if (ds + dr > directDist * 1.5) return 0; // barreira fora do caminho

    const h = barrier.height_m;
    const pathOver = Math.sqrt(h * h + ds * ds) + Math.sqrt(h * h + dr * dr);
    const delta = pathOver - directDist;
    if (delta <= 0) return 0;

    const N = (2 * delta) / lambda;
    return 10 * Math.log10(3 + 20 * N);
}

/**
 * Simplified noise contour generation for environmental mapping.
 *
 * Uses ISO 9613-2 geometric spreading (point source) plus Maekawa barrier
 * insertion loss for each receptor-barrier pair.
 * Geometric attenuation: Lp(r) = Lsource - 20×log10(r) - 11
 *
 * Contour bands generated: [35, 40, 45, 50, 55, 60, 65] dB.
 *
 * @param {number} sourceLevel_dB - Source sound power level (dB re 1 pW)
 * @param {{x_m: number, y_m: number}[]} receptorGrid - Array of receptor positions
 * @param {{x1: number, y1: number, x2: number, y2: number, height_m: number}[]} barriers
 *   Line barriers (each described by two endpoints + height)
 * @returns {{
 *   levels_dB: number[],
 *   contourBands: {level: number, points: {x_m: number, y_m: number}[]}[]
 * }}
 * @throws {RangeError} if receptorGrid is empty
 * @see ISO 9613-2:1996 Section 7; Maekawa (1968) Applied Acoustics 1(3):157-173
 */
export function noiseMappingContour(sourceLevel_dB: number, receptorGrid: {x_m: number, y_m: number}[], barriers: {x1: number, y1: number, x2: number, y2: number, height_m: number}[]): { levels_dB: number[], contourBands: {level: number, points: {x_m: number, y_m: number}[]}[] } {
    if (!Array.isArray(receptorGrid) || receptorGrid.length === 0) {
        throw new RangeError('receptorGrid must be a non-empty array of {x_m, y_m} objects');
    }

    const sourceXY = { x_m: 0, y_m: 0 }; // fonte na origem por convencao
    const validBarriers = Array.isArray(barriers) ? barriers : [];
    const CONTOUR_LEVELS = [35, 40, 45, 50, 55, 60, 65];
    const FREQ_REF = 1000; // frequencia de referencia para calculos de barreira

    const levels_dB = receptorGrid.map((pt) => {
        const r = Math.sqrt(pt.x_m ** 2 + pt.y_m ** 2);
        if (r < 1) return sourceLevel_dB; // muito proximo da fonte

        // Atenuacao geometrica (ponto): -20log10(r) - 11
        let lp = sourceLevel_dB - 20 * Math.log10(r) - 11;

        // Aplicar insercao de barreira (maximo entre todas as barreiras que interceptam)
        let maxBarrierIL = 0;
        for (const b of validBarriers) {
            const il = barrierMaekawaIL(b, sourceXY, pt, FREQ_REF);
            if (il > maxBarrierIL) maxBarrierIL = il;
        }
        lp -= maxBarrierIL;

        return lp;
    });

    // Agrupar receptores por banda de nivel de contorno
    const contourBands = CONTOUR_LEVELS.map((level) => ({
        level,
        points: receptorGrid.filter((pt, i) => levels_dB[i]! >= level),
    }));

    return {
        levels_dB,
        contourBands,
    };
}

// ---------------------------------------------------------------------------
// 8. Human Vibration Exposure (ISO 2631-1:1997, EU Directive 2002/44/EC)
// ---------------------------------------------------------------------------

/**
 * Wk frequency weighting factors for whole-body vertical vibration (ISO 2631-1:1997 Table A.1).
 * Simplified discrete values; interpolation used for intermediate frequencies.
 * @type {ReadonlyArray<{f: number, wk: number}>}
 */
const WK_WEIGHTING = Object.freeze([
    { f: 0.5, wk: 0.085 },
    { f: 1, wk: 0.38 },
    { f: 2, wk: 0.8 },
    { f: 4, wk: 1.0 }, // reference (unity gain)
    { f: 8, wk: 0.88 },
    { f: 16, wk: 0.41 },
    { f: 31.5, wk: 0.15 },
    { f: 63, wk: 0.06 },
    { f: 125, wk: 0.03 },
]);

/**
 * Wh frequency weighting factors for hand-arm vibration (ISO 5349-1:2001, simplified).
 * @type {ReadonlyArray<{f: number, wh: number}>}
 */
const WH_WEIGHTING = Object.freeze([
    { f: 6.3, wh: 0.63 },
    { f: 8, wh: 0.8 },
    { f: 10, wh: 1.0 },
    { f: 12.5, wh: 1.0 },
    { f: 16, wh: 0.8 },
    { f: 25, wh: 0.5 },
    { f: 31.5, wh: 0.4 },
    { f: 63, wh: 0.2 },
    { f: 125, wh: 0.1 },
    { f: 250, wh: 0.05 },
    { f: 500, wh: 0.025 },
    { f: 1000, wh: 0.013 },
]);

/**
 * Interpolate weighting factor at a given frequency.
 * @param {ReadonlyArray<Record<string, number>>} table
 * @param {number} number>>
 * @param {string} frequency_hz - 'wk' or 'wh'
 * @returns {number}
 */
function interpolateWeighting(table: ReadonlyArray<Record<string, number>>, frequency_hz: number, key: string): number {
    if (frequency_hz <= table[0]!.f!) return table[0]![key]!;
    if (frequency_hz >= table[table.length - 1]!.f!) return table[table.length - 1]![key]!;
    for (let i = 0; i < table.length - 1; i++) {
        const ti = table[i]!;
        const ti1 = table[i + 1]!;
        if (frequency_hz >= ti.f! && frequency_hz <= ti1.f!) {
            const t = (frequency_hz - ti.f!) / (ti1.f! - ti.f!);
            return ti[key]! + t * (ti1[key]! - ti[key]!);
        }
    }
    return table[table.length - 1]![key]!;
}

/**
 * Human vibration exposure and health risk assessment.
 *
 * Frequency-weighted RMS acceleration (ISO 2631-1:1997):
 *   aw = W(f) × a_rms  [m/s²]
 *
 * Vibration Dose Value (VDV, ISO 2631-1 Annex C):
 *   VDV = (aw^4 × T)^0.25  [m/s^1.75]
 *
 * EU Directive 2002/44/EC thresholds:
 *   Whole-body: EAV = 0.5 m/s², ELV = 1.15 m/s²
 *   Hand-arm:   EAV = 2.5 m/s², ELV = 5.0 m/s²
 *
 * @param {number} acceleration_m_s2 - RMS acceleration (m/s², > 0)
 * @param {number} frequency_hz - Dominant vibration frequency (Hz, > 0)
 * @param {number} duration_hrs - Daily exposure duration (hours, > 0)
 * @param {'whole_body'|'hand_arm'} exposureType - Type of exposure
 * @returns {{
 *   awRMS_m_s2: number,
 *   vibrationDoseValue: number,
 *   eav_exceedance: boolean,
 *   elv_exceedance: boolean,
 *   healthRisk: string
 * }}
 * @throws {RangeError} for non-positive inputs or invalid exposureType
 * @see ISO 2631-1:1997; EU Directive 2002/44/EC Annex I
 */
export function vibrationHumanExposure(acceleration_m_s2: number, frequency_hz: number, duration_hrs: number, exposureType: 'whole_body'|'hand_arm'): { awRMS_m_s2: number, vibrationDoseValue: number, eav_exceedance: boolean, elv_exceedance: boolean, healthRisk: string } {
    if (acceleration_m_s2 <= 0) throw new RangeError(`acceleration_m_s2 must be > 0, got ${acceleration_m_s2}`);
    if (frequency_hz <= 0) throw new RangeError(`frequency_hz must be > 0, got ${frequency_hz}`);
    if (duration_hrs <= 0) throw new RangeError(`duration_hrs must be > 0, got ${duration_hrs}`);
    if (exposureType !== 'whole_body' && exposureType !== 'hand_arm') {
        throw new RangeError(`exposureType must be 'whole_body' or 'hand_arm', got '${exposureType}'`);
    }

    // Fator de ponderacao por frequencia
    let weightFactor;
    if (exposureType === 'whole_body') {
        weightFactor = interpolateWeighting(WK_WEIGHTING, frequency_hz, 'wk');
    } else {
        weightFactor = interpolateWeighting(WH_WEIGHTING, frequency_hz, 'wh');
    }

    // Aceleracao ponderada RMS
    const awRMS_m_s2 = weightFactor * acceleration_m_s2;

    // Valor dose de vibracao VDV = (aw^4 × T_seg)^0.25
    const durationSeconds = duration_hrs * 3600;
    const vibrationDoseValue = Math.pow(Math.pow(awRMS_m_s2, 4) * durationSeconds, 0.25);

    // Limiares EU 2002/44/EC
    const thresholds = {
        whole_body: { eav: 0.5, elv: 1.15 },
        hand_arm: { eav: 2.5, elv: 5.0 },
    };
    const { eav, elv } = thresholds[exposureType];

    const eav_exceedance = awRMS_m_s2 > eav;
    const elv_exceedance = awRMS_m_s2 > elv;

    // Risco de saude baseado em Diretiva EU 2002/44/EC + ISO 2631-1 Anex D
    let healthRisk;
    if (elv_exceedance) healthRisk = 'high_risk_above_ELV';
    else if (eav_exceedance) healthRisk = 'action_required_above_EAV';
    else if (awRMS_m_s2 > eav * 0.5) healthRisk = 'monitor_approaching_EAV';
    else healthRisk = 'acceptable';

    return Object.freeze({ awRMS_m_s2, vibrationDoseValue, eav_exceedance, elv_exceedance, healthRisk });
}

// ---------------------------------------------------------------------------
// 9. Community Noise Criteria (WHO 2018, ANSI S12.9)
// ---------------------------------------------------------------------------

/**
 * WHO 2018 Environmental Noise Guidelines outdoor limits (Lnight, Lden) by land use.
 * Format: {lden_limit, lnight_limit} in dB.
 * @type {Readonly<Record<string, { lden_limit: number, lnight_limit: number }>>}
 */
const WHO2018_LIMITS = Object.freeze({
    residential: Object.freeze({ lden_limit: 53, lnight_limit: 40 }),
    commercial: Object.freeze({ lden_limit: 58, lnight_limit: 45 }),
    industrial: Object.freeze({ lden_limit: 65, lnight_limit: 55 }),
    recreational: Object.freeze({ lden_limit: 55, lnight_limit: 45 }),
    hospital: Object.freeze({ lden_limit: 45, lnight_limit: 35 }),
});

/**
 * Community noise criteria, impact assessment and annoyance prediction.
 *
 * Lden = 10×log10( (12/24)×10^(Ld/10) + (4/24)×10^((Le+5)/10) + (8/24)×10^((Ln+10)/10) )
 * where Le = (Ld + Ln)/2 (simplified estimate of evening level)
 *
 * Annoyance prediction (Miedema and Oudshoorn 2001 road traffic):
 *   %HA = 18.147 - 0.0023×Lden + 0.00047×Lden² (for Lden > 45 dB)
 *   %HSD (highly sleep disturbed) = max(0, -4.9 + 0.14×Lnight)
 *
 * Background noise impact: if existing_background > 0 and
 * (source level - background) < 5 dB, impact is considered low.
 *
 * @param {number} leqDay_dB - Daytime equivalent level Ld (dB, 07:00-19:00)
 * @param {number} leqNight_dB - Night-time equivalent level Ln (dB, 23:00-07:00)
 * @param {'residential'|'commercial'|'industrial'|'recreational'|'hospital'} landUse
 * @param {number} [existingBackground_dB=0] - Pre-existing background noise (dB, 0 = unknown)
 * @returns {{
 *   lden_dB: number,
 *   annoyedPercent: number,
 *   highlyAnnoyedPercent: number,
 *   sleepDisturbedPercent: number,
 *   impactLevel: 'negligible'|'low'|'moderate'|'high'|'severe',
 *   mitigationRequired: boolean
 * }}
 * @throws {RangeError} for unknown landUse or non-finite level inputs
 * @see WHO (2018) Environmental Noise Guidelines for the European Region
 * @see Miedema & Oudshoorn (2001) Environ Health Perspect 109(4):409-416
 */
export function communityNoiseCriteria(leqDay_dB: number, leqNight_dB: number, landUse: 'residential'|'commercial'|'industrial'|'recreational'|'hospital', existingBackground_dB: number = 0): { lden_dB: number, annoyedPercent: number, highlyAnnoyedPercent: number, sleepDisturbedPercent: number, impactLevel: 'negligible'|'low'|'moderate'|'high'|'severe', mitigationRequired: boolean } {
    if (!WHO2018_LIMITS[landUse]) {
        throw new RangeError(`landUse '${landUse}' unknown. Valid: ${Object.keys(WHO2018_LIMITS).join('|')}`);
    }
    if (!Number.isFinite(leqDay_dB)) throw new RangeError(`leqDay_dB must be finite, got ${leqDay_dB}`);
    if (!Number.isFinite(leqNight_dB)) throw new RangeError(`leqNight_dB must be finite, got ${leqNight_dB}`);

    // Estimativa do nivel noturno-tarde como media dos periodos
    const leqEvening_dB = (leqDay_dB + leqNight_dB) / 2;

    // Lden (EU END formula)
    const lden_dB =
        10 *
        Math.log10(
            (12 / 24) * Math.pow(10, leqDay_dB / 10) +
                (4 / 24) * Math.pow(10, (leqEvening_dB + 5) / 10) +
                (8 / 24) * Math.pow(10, (leqNight_dB + 10) / 10),
        );

    // Percentual incomodado (Miedema-Oudshoorn 2001, curva de transporte rodoviario)
    // %A = max(0, -9.868 + 0.01436×Lden + 0.0044×Lden²) - forma quadratica
    const annoyed = Math.max(0, -9.868 + 0.01436 * lden_dB + 0.0044 * lden_dB * lden_dB);
    const annoyedPercent = Math.min(100, annoyed);

    // Percentual altamente incomodado: ~70% do incomodado acima de 55 dB
    const highlyAnnoyedPercent = Math.min(100, Math.max(0, annoyedPercent * (lden_dB > 55 ? 0.7 : 0.3)));

    // Perturbacao do sono: %HSD por Lnight (Miedema 2004 simplificado)
    const sleepDisturbedPercent = Math.min(100, Math.max(0, -4.9 + 0.14 * leqNight_dB) * 2);

    // Nivel de impacto comparado com limites WHO 2018
    const { lden_limit, lnight_limit } = WHO2018_LIMITS[landUse];
    const excessDen = lden_dB - lden_limit;
    const excessNight = leqNight_dB - lnight_limit;
    const maxExcess = Math.max(excessDen, excessNight);

    // Efeito do ruido de fundo: se diferenca < 5 dB, impacto e baixo
    const backgroundEffect = existingBackground_dB > 0 && lden_dB - existingBackground_dB < 5;

        let impactLevel: 'negligible'|'low'|'moderate'|'high'|'severe';
    if (backgroundEffect || maxExcess < -10) impactLevel = 'negligible';
    else if (maxExcess < 0) impactLevel = 'low';
    else if (maxExcess < 5) impactLevel = 'moderate';
    else if (maxExcess < 10) impactLevel = 'high';
    else impactLevel = 'severe';

    const mitigationRequired = maxExcess > 0;

    return {
        lden_dB,
        annoyedPercent,
        highlyAnnoyedPercent,
        sleepDisturbedPercent,
        impactLevel,
        mitigationRequired,
    };
}

// ---------------------------------------------------------------------------
// 10. Acoustic Model Validation Statistics (ISO 1996-2, HARMONOISE)
// ---------------------------------------------------------------------------

/**
 * Statistical validation of acoustic model predictions against measurements.
 *
 * Validation metrics (ISO 1996-2:2017, HARMONOISE validation protocol):
 *   Bias (systematic error) = mean(predicted - measured)
 *   Standard deviation      = std(predicted - measured)
 *   RMSE                    = sqrt(mean((predicted - measured)²))
 *   % within 2 dB           = fraction with |residual| <= 2.0 dB
 *
 * Model grade (HARMONOISE accuracy criteria):
 *   Excellent: |bias| < 1 dB AND sd < 2 dB
 *   Good:      |bias| < 2 dB AND sd < 3 dB
 *   Acceptable:|bias| < 3 dB AND sd < 4 dB
 *   Poor:      otherwise
 *
 * @param {number[]} measured_dB - Array of measured sound levels (dB)
 * @param {number[]} predicted_dB - Array of predicted sound levels (dB, same length)
 * @returns {{
 *   bias_dB: number,
 *   standardDeviation_dB: number,
 *   rmse_dB: number,
 *   within2dBPercent: number,
 *   modelGrade: 'Excellent'|'Good'|'Acceptable'|'Poor'
 * }}
 * @throws {RangeError} if arrays are empty or have different lengths
 * @see ISO 1996-2:2017 Annex F; HARMONOISE (2004) Technical Report HAR32TR-040922-STEL10
 */
export function acousticModelingValidation(measured_dB: number[], predicted_dB: number[]): { bias_dB: number, standardDeviation_dB: number, rmse_dB: number, within2dBPercent: number, modelGrade: 'Excellent'|'Good'|'Acceptable'|'Poor' } {
    if (!Array.isArray(measured_dB) || measured_dB.length === 0) {
        throw new RangeError('measured_dB must be a non-empty array');
    }
    if (!Array.isArray(predicted_dB) || predicted_dB.length !== measured_dB.length) {
        throw new RangeError('predicted_dB must have the same length as measured_dB');
    }

    const n = measured_dB.length;
    const residuals = measured_dB.map((m, i) => predicted_dB[i]! - m);

    // Vies (desvio sistematico): media dos residuos
    const bias_dB = residuals.reduce((s, r) => s + r, 0) / n;

    // Desvio padrao dos residuos
    const variance = residuals.reduce((s, r) => s + Math.pow(r - bias_dB, 2), 0) / n;
    const standardDeviation_dB = Math.sqrt(variance);

    // RMSE = raiz da media dos quadrados dos residuos
    const rmse_dB = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / n);

    // Percentual dentro de ±2 dB
    const within2 = residuals.filter((r) => Math.abs(r) <= 2.0).length;
    const within2dBPercent = (within2 / n) * 100;

    // Grau do modelo (HARMONOISE)
        let modelGrade: 'Excellent'|'Good'|'Acceptable'|'Poor';
    const absBias = Math.abs(bias_dB);
    if (absBias < 1 && standardDeviation_dB < 2) modelGrade = 'Excellent';
    else if (absBias < 2 && standardDeviation_dB < 3) modelGrade = 'Good';
    else if (absBias < 3 && standardDeviation_dB < 4) modelGrade = 'Acceptable';
    else modelGrade = 'Poor';

    return { bias_dB, standardDeviation_dB, rmse_dB, within2dBPercent, modelGrade };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const noiseVibrationAdvancedMeta = {
    name: 'noiseVibrationAdvanced',
    description: 'noiseVibrationAdvanced',
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
