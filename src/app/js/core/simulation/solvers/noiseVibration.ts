// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

console.debug('[noisevib:load]', 'app/js/core/simulation/solvers/noiseVibration.js');

/**
 * Noise & Vibration Propagation Solver
 *
 * Implements:
 *  - Point source spherical spreading attenuation (ISO 9613-1)
 *  - Line source cylindrical spreading attenuation (ISO 9613-2)
 *  - Atmospheric absorption by octave band (ISO 9613-1)
 *  - Maekawa barrier insertion loss (1968)
 *  - Day-Night Average Sound Level Ldn and Lden (EPA 1974; EU 2002/49/EC)
 *  - Ground vibration PPV via USBM RI 8507 (Siskind 1980)
 *  - Building damage threshold check (DIN 4150-3:2016)
 *  - Brazilian noise conformance ABNT NBR 10151:2019
 *  - CONAMA Resolution 001/1990 urban noise conformance
 *  - Octave band SPL decomposition (ISO 266:1997)
 *
 * Academic references:
 *  - ISO 9613-1:1993 Acoustics - Attenuation of sound during propagation outdoors
 *  - ISO 9613-2:1996 Acoustics - General method of calculation
 *  - Maekawa (1968) Noise reduction by screens, Applied Acoustics 1(3):157-173
 *    DOI:10.1016/0003-682X(68)90020-0
 *  - Siskind et al. (1980) Structure Response and Damage Produced by Ground Vibration
 *    from Surface Mine Blasting, USBM RI 8507
 *  - EPA (1974) Information on Levels of Environmental Noise Requisite to Protect
 *    Public Health and Welfare with an Adequate Margin of Safety (EPA 550/9-74-004)
 *  - EU Directive 2002/49/EC relating to the assessment and management of
 *    environmental noise
 *  - DIN 4150-3:2016-12 Erschütterungen im Bauwesen - Teil 3
 *  - ABNT NBR 10151:2019 Acústica - Medição e avaliação de sons em ambientes externos
 *  - CONAMA Resolução 001/1990 (ruído veicular e urbano)
 *  - ISO 266:1997 Acoustics - Preferred frequencies
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Standard octave band center frequencies (Hz) per ISO 266:1997.
 */
export const OCTAVE_BANDS_HZ: ReadonlyArray<number> = Object.freeze([63, 125, 250, 500, 1000, 2000, 4000, 8000]);

/**
 * Atmospheric absorption coefficients (dB/km) by octave band.
 * Condições de referência: 20°C, 70% RH (ISO 9613-1:1993 Table 1).
 */
export const ALPHA_DB_KM: Readonly<Record<number, number>> = Object.freeze({
    63: 0.0,
    125: 0.1,
    250: 0.3,
    500: 0.6,
    1000: 1.3,
    2000: 3.0,
    4000: 8.0,
    8000: 26.0,
});

/**
 * ABNT NBR 10151:2019 - limites de nível de pressão sonora por zona (dB).
 * Par [diurno, noturno].
 */
export const NBR10151_LIMITS: Readonly<Record<string, readonly [number, number]>> = Object.freeze({
    rural_residential: Object.freeze([35, 45] as [number, number]),
    urban_residential: Object.freeze([45, 55] as [number, number]),
    mixed: Object.freeze([50, 60] as [number, number]),
    commercial: Object.freeze([55, 65] as [number, number]),
    industrial: Object.freeze([60, 70] as [number, number]),
});

/**
 * CONAMA 001/1990 - limites de nível de pressão sonora por classe de zona (dB).
 * Par [diurno, noturno]. Classes I (sensível) a IV (industrial).
 */
export const CONAMA001_LIMITS: Readonly<Record<string, readonly [number, number]>> = Object.freeze({
    I: Object.freeze([50, 40] as [number, number]),
    II: Object.freeze([55, 45] as [number, number]),
    III: Object.freeze([60, 50] as [number, number]),
    IV: Object.freeze([70, 60] as [number, number]),
});

// ---------------------------------------------------------------------------
// 1. Point Source Attenuation (ISO 9613-1)
// ---------------------------------------------------------------------------

interface PointSourceAttenuationResult {
    lp_dB: number;
    attenuation_dB: number;
    distance_m: number;
}

/**
 * Compute sound pressure level from a point source with spherical spreading.
 *
 * ISO 9613-1:1993 equation (espalhamento esférico):
 *   Lp = Lw + DI - 20×log10(r) - 11
 *   DI = 10×log10(directivity)
 *
 * @param lw_dB       - Sound power level (dB re 1 pW)
 * @param distance_m  - Receiver distance from source (m, > 0)
 * @param directivity - Directivity factor Q (dimensionless, > 0)
 * @returns
 * @throws RangeError if distance_m <= 0 or directivity <= 0
 * @see ISO 9613-1:1993
 */
export function pointSourceAttenuation(
    lw_dB: number,
    distance_m: number,
    directivity: number = 1.0,
): PointSourceAttenuationResult {
    if (distance_m <= 0) throw new RangeError(`distance_m must be > 0, got ${distance_m}`);
    if (directivity <= 0) throw new RangeError(`directivity must be > 0, got ${directivity}`);

    // Índice de diretividade DI = 10×log10(Q)
    const di_dB = 10 * Math.log10(directivity);
    const attenuation_dB = 20 * Math.log10(distance_m) + 11 - di_dB;
    const lp_dB = lw_dB - attenuation_dB;

    return Object.freeze({ lp_dB, attenuation_dB, distance_m });
}

// ---------------------------------------------------------------------------
// 2. Line Source Attenuation (ISO 9613-2)
// ---------------------------------------------------------------------------

interface LineSourceAttenuationResult {
    lp_dB: number;
    attenuation_dB: number;
    source_type: 'line';
}

/**
 * Compute sound pressure level from a finite line source with cylindrical spreading.
 *
 * Espalhamento cilíndrico (ISO 9613-2:1996):
 *   Lp = Lw_per_m - 10×log10(r) - 8  [para r << L/π]
 * Correção de linha finita aplicada quando r > length_m/π.
 *
 * @param lw_per_m_dB - Sound power level per metre (dB/m re 1 pW/m)
 * @param distance_m  - Perpendicular receiver distance (m, > 0)
 * @param length_m    - Physical length of line source (m, > 0)
 * @returns
 * @throws RangeError if distance_m <= 0 or length_m <= 0
 * @see ISO 9613-2:1996
 */
export function lineSourceAttenuation(
    lw_per_m_dB: number,
    distance_m: number,
    length_m: number,
): LineSourceAttenuationResult {
    if (distance_m <= 0) throw new RangeError(`distance_m must be > 0, got ${distance_m}`);
    if (length_m <= 0) throw new RangeError(`length_m must be > 0, got ${length_m}`);

    // Atenuação cilíndrica base: 10×log10(r) + 8
    let attenuation_dB = 10 * Math.log10(distance_m) + 8;

    // Correção para linha finita: quando r > L/π, a fonte começa a se comportar
    // como ponto (transição cilíndrica → esférica)
    const transition_m = length_m / Math.PI;
    if (distance_m > transition_m) {
        // Correção adicional: diferença entre atenuações esférica e cilíndrica no ponto de transição
        const extraSph = 20 * Math.log10(distance_m) + 11;
        const extraCyl = 10 * Math.log10(distance_m) + 8;
        attenuation_dB = attenuation_dB + (extraSph - extraCyl) * ((distance_m - transition_m) / distance_m);
    }

    const lp_dB = lw_per_m_dB - attenuation_dB;

    return Object.freeze({ lp_dB, attenuation_dB, source_type: 'line' });
}

// ---------------------------------------------------------------------------
// 3. Atmospheric Absorption (ISO 9613-1)
// ---------------------------------------------------------------------------

interface AtmosphericAbsorptionResult {
    absorption_dB: number;
    alpha_dB_km: number;
    frequency_hz: number;
}

/**
 * Compute atmospheric sound absorption for a given octave band frequency.
 *
 * ISO 9613-1:1993 Seção 6:
 *   A_atm = α × d / 1000  [dB]
 * onde α é em dB/km. Tabela de lookup para bandas de oitava padrão.
 * Interpolação linear em log-f para frequências intermediárias.
 *
 * @param distance_m     - Propagation distance (m, > 0)
 * @param frequency_hz   - Frequency (Hz, > 0; octave band centre preferred)
 * @param _temperature_c  - Air temperature (°C, reserved for future correction)
 * @param _humidity_pct   - Relative humidity (%, reserved for future correction)
 * @returns
 * @throws RangeError if distance_m <= 0 or frequency_hz <= 0
 * @see ISO 9613-1:1993 Table 1
 */
export function atmosphericAbsorption(
    distance_m: number,
    frequency_hz: number,
    _temperature_c: number = 20,
    _humidity_pct: number = 70,
): AtmosphericAbsorptionResult {
    if (distance_m <= 0) throw new RangeError(`distance_m must be > 0, got ${distance_m}`);
    if (frequency_hz <= 0) throw new RangeError(`frequency_hz must be > 0, got ${frequency_hz}`);

    // Interpolação log-linear entre bandas de oitava vizinhas
    const bands = OCTAVE_BANDS_HZ;
    let alpha_dB_km: number;

    if (frequency_hz <= bands[0]!) {
        alpha_dB_km = ALPHA_DB_KM[bands[0]!]!;
    } else if (frequency_hz >= bands[bands.length - 1]!) {
        alpha_dB_km = ALPHA_DB_KM[bands[bands.length - 1]!]!;
    } else {
        // Encontrar banda inferior e superior vizinhas
        let lo = bands[0]!;
        let hi = bands[1]!;
        for (let i = 0; i < bands.length - 1; i++) {
            if (frequency_hz >= bands[i]! && frequency_hz <= bands[i + 1]!) {
                lo = bands[i]!;
                hi = bands[i + 1]!;
                break;
            }
        }
        // Interpolação linear em log(f)
        const t = (Math.log10(frequency_hz) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo));
        alpha_dB_km = ALPHA_DB_KM[lo]! + t * (ALPHA_DB_KM[hi]! - ALPHA_DB_KM[lo]!);
    }

    // A_atm = α [dB/km] × d [m] / 1000 [m/km]
    const absorption_dB = (alpha_dB_km * distance_m) / 1000;

    return Object.freeze({ absorption_dB, alpha_dB_km, frequency_hz });
}

// ---------------------------------------------------------------------------
// 4. Barrier Insertion Loss (Maekawa 1968; ISO 9613-2)
// ---------------------------------------------------------------------------

interface BarrierInsertionResult {
    insertion_loss_dB: number;
    fresnel_number: number;
    path_difference_m: number;
}

/**
 * Compute barrier insertion loss using the Maekawa (1968) thin-barrier model.
 *
 * Número de Fresnel: N = 2δ/λ
 * Diferença de caminho: δ = sqrt((H_b-H_s)² + d_s²) + sqrt((H_b-H_r)² + d_r²) − (d_s + d_r)
 * Velocidade do som c = 340 m/s, λ = c/f
 * Perda de inserção: IL = 10×log10(3 + 20N)
 *
 * @param source_height_m   - Source height above ground (m, >= 0)
 * @param receiver_height_m - Receiver height above ground (m, >= 0)
 * @param barrier_height_m  - Barrier height above ground (m, > 0)
 * @param source_dist_m     - Horizontal distance source to barrier (m, > 0)
 * @param receiver_dist_m   - Horizontal distance barrier to receiver (m, > 0)
 * @param frequency_hz      - Frequency (Hz, > 0)
 * @returns
 * @throws RangeError for non-positive distances or frequency, negative heights, or
 *         barrier below line-of-sight
 * @see Maekawa (1968) Applied Acoustics 1(3):157-173 DOI:10.1016/0003-682X(68)90020-0
 * @see ISO 9613-2:1996
 */
export function barrierInsertion(
    source_height_m: number,
    receiver_height_m: number,
    barrier_height_m: number,
    source_dist_m: number,
    receiver_dist_m: number,
    frequency_hz: number = 1000,
): BarrierInsertionResult {
    if (source_height_m < 0) throw new RangeError(`source_height_m must be >= 0, got ${source_height_m}`);
    if (receiver_height_m < 0) throw new RangeError(`receiver_height_m must be >= 0, got ${receiver_height_m}`);
    if (barrier_height_m <= 0) throw new RangeError(`barrier_height_m must be > 0, got ${barrier_height_m}`);
    if (source_dist_m <= 0) throw new RangeError(`source_dist_m must be > 0, got ${source_dist_m}`);
    if (receiver_dist_m <= 0) throw new RangeError(`receiver_dist_m must be > 0, got ${receiver_dist_m}`);
    if (frequency_hz <= 0) throw new RangeError(`frequency_hz must be > 0, got ${frequency_hz}`);

    const c = 340; // velocidade do som no ar (m/s)
    const lambda = c / frequency_hz;

    // Distâncias ao longo do caminho difratado sobre o topo da barreira
    const dhs = barrier_height_m - source_height_m;
    const dhr = barrier_height_m - receiver_height_m;
    const pathOverBarrier =
        Math.sqrt(dhs * dhs + source_dist_m * source_dist_m) + Math.sqrt(dhr * dhr + receiver_dist_m * receiver_dist_m);
    const directPath = source_dist_m + receiver_dist_m;
    const path_difference_m = pathOverBarrier - directPath;

    // Número de Fresnel N = 2δ/λ
    const fresnel_number = (2 * path_difference_m) / lambda;

    // Modelo Maekawa: IL = 10×log10(3 + 20N), mínimo 0 dB
    const il_raw = 10 * Math.log10(3 + 20 * Math.max(0, fresnel_number));
    const insertion_loss_dB = Math.max(0, il_raw);

    return Object.freeze({ insertion_loss_dB, fresnel_number, path_difference_m });
}

// ---------------------------------------------------------------------------
// 5. Ldn and Lden (EPA 1974; EU Directive 2002/49/EC)
// ---------------------------------------------------------------------------

interface LdnResult {
    ldn_dB: number;
    lden_dB: number;
    day_leq: number;
    evening_leq: number;
    night_leq: number;
}

/**
 * Compute Day-Night Average Sound Level (Ldn) and Day-Evening-Night Level (Lden).
 *
 * Ldn (EPA 1974, 2-period, dia 15h / noite 9h com penalidade +10 dB):
 *   Ldn = 10×log10( (15/24)×10^(Ld/10) + (9/24)×10^((Ln+10)/10) )
 *
 * Lden (EU 2002/49/EC, 3-period, dia 12h / entardecer 4h +5 dB / noite 8h +10 dB):
 *   Lden = 10×log10( (12/24)×10^(Ld/10) + (4/24)×10^((Le+5)/10) + (8/24)×10^((Ln+10)/10) )
 *
 * @param day_leq     - Daytime equivalent sound level (dB, 07:00–22:00 for Ldn / 07:00–19:00 for Lden)
 * @param evening_leq - Evening equivalent sound level (dB, 19:00–23:00, used in Lden only)
 * @param night_leq   - Night-time equivalent sound level (dB, 22:00–07:00 / 23:00–07:00)
 * @returns
 * @see EPA (1974) EPA 550/9-74-004
 * @see EU Directive 2002/49/EC Annex I
 */
export function ldn(day_leq: number, evening_leq: number, night_leq: number): LdnResult {
    // Validação de faixa razoável (ruído ambiental: 20–150 dB)
    for (const [name, val] of [
        ['day_leq', day_leq],
        ['evening_leq', evening_leq],
        ['night_leq', night_leq],
    ] as [string, number][]) {
        if (!Number.isFinite(val)) throw new RangeError(`${name} must be a finite number, got ${val}`);
    }

    // Ldn - duas frações temporais (EPA 1974)
    const ldn_dB =
        10 * Math.log10((15 / 24) * Math.pow(10, day_leq / 10) + (9 / 24) * Math.pow(10, (night_leq + 10) / 10));

    // Lden - três frações temporais com penalidades (EU 2002/49/EC)
    const lden_dB =
        10 *
        Math.log10(
            (12 / 24) * Math.pow(10, day_leq / 10) +
                (4 / 24) * Math.pow(10, (evening_leq + 5) / 10) +
                (8 / 24) * Math.pow(10, (night_leq + 10) / 10),
        );

    return Object.freeze({ ldn_dB, lden_dB, day_leq, evening_leq, night_leq });
}

// ---------------------------------------------------------------------------
// 6. Ground Vibration PPV (USBM RI 8507, Siskind 1980)
// ---------------------------------------------------------------------------

interface GroundVibrationPpvResult {
    ppv_mm_s: number;
    scaled_distance: number;
    k: number;
    n: number;
}

/**
 * Compute Peak Particle Velocity (PPV) from blasting ground vibration.
 *
 * USBM RI 8507 (Siskind et al. 1980) scaled-distance propagation law:
 *   PPV = k × (D / sqrt(W))^(-n)
 *   SD = D / sqrt(W)   [escala de distância em m/kg^0.5]
 *
 * Valores padrão: k = 1140, n = 1.6 (rocha competente, explosivos de desmonte)
 *
 * @param charge_kg  - Maximum instantaneous charge per delay (kg, > 0)
 * @param distance_m - Distance from blast to receiver (m, > 0)
 * @param k   - Site constant (dimensionless, > 0)
 * @param n    - Decay exponent (dimensionless, > 0)
 * @returns
 * @throws RangeError if charge_kg or distance_m are non-positive, or k/n are non-positive
 * @see Siskind et al. (1980) USBM RI 8507
 */
export function groundVibrationPpv(
    charge_kg: number,
    distance_m: number,
    k: number = 1140,
    n: number = 1.6,
): GroundVibrationPpvResult {
    if (charge_kg <= 0) throw new RangeError(`charge_kg must be > 0, got ${charge_kg}`);
    if (distance_m <= 0) throw new RangeError(`distance_m must be > 0, got ${distance_m}`);
    if (k <= 0) throw new RangeError(`k must be > 0, got ${k}`);
    if (n <= 0) throw new RangeError(`n must be > 0, got ${n}`);

    // Distância escalada SD = D / sqrt(W) [m / kg^0.5]
    const scaled_distance = distance_m / Math.sqrt(charge_kg);

    // Velocidade de partícula de pico em mm/s
    const ppv_mm_s = k * Math.pow(scaled_distance, -n);

    return Object.freeze({ ppv_mm_s, scaled_distance, k, n });
}

// ---------------------------------------------------------------------------
// 7. Building Damage Threshold (DIN 4150-3:2016)
// ---------------------------------------------------------------------------

interface BuildingDamageThresholdResult {
    compliant: boolean;
    ppv_limit_mm_s: number;
    margin_mm_s: number;
    structure_type: string;
}

interface DamageLimitBand {
    lo: number;
    hi: number;
    limit: number;
}

/**
 * Check PPV compliance against DIN 4150-3:2016 building damage thresholds.
 *
 * Limites para edificações residenciais (residential) e industriais (industrial)
 * por faixa de frequência (Hz) segundo DIN 4150-3:2016:
 *
 *   |  Faixa Hz  | Residential (mm/s) | Industrial (mm/s) |
 *   |   1–10     |        5           |        20         |
 *   |  10–50     |       15           |        40         |
 *   |  50–100    |       20           |        50         |
 *
 * @param ppv_mm_s          - Measured PPV (mm/s, > 0)
 * @param frequency_hz      - Dominant frequency of vibration (Hz, > 0)
 * @param structure_type - 'residential' | 'industrial'
 * @returns
 * @throws RangeError if ppv_mm_s <= 0 or frequency_hz <= 0 or unknown structure_type
 * @see DIN 4150-3:2016-12; ISEE Blasting Vibration Standards
 */
export function buildingDamageThreshold(
    ppv_mm_s: number,
    frequency_hz: number,
    structure_type: string = 'residential',
): BuildingDamageThresholdResult {
    if (ppv_mm_s <= 0) throw new RangeError(`ppv_mm_s must be > 0, got ${ppv_mm_s}`);
    if (frequency_hz <= 0) throw new RangeError(`frequency_hz must be > 0, got ${frequency_hz}`);
    if (structure_type !== 'residential' && structure_type !== 'industrial') {
        throw new RangeError(`structure_type must be 'residential' or 'industrial', got '${structure_type}'`);
    }

    // Limites DIN 4150-3:2016 por faixa e tipo estrutural [mm/s]
    const limits: Record<string, DamageLimitBand[]> = {
        residential: [
            { lo: 1, hi: 10, limit: 5 },
            { lo: 10, hi: 50, limit: 15 },
            { lo: 50, hi: 100, limit: 20 },
        ],
        industrial: [
            { lo: 1, hi: 10, limit: 20 },
            { lo: 10, hi: 50, limit: 40 },
            { lo: 50, hi: 100, limit: 50 },
        ],
    };

    const bands = limits[structure_type]!;
    // Usar a banda que contém a frequência; fora de faixa: usar a mais próxima
    let ppv_limit_mm_s = bands[bands.length - 1]!.limit;
    for (const band of bands) {
        if (frequency_hz >= band.lo && frequency_hz <= band.hi) {
            ppv_limit_mm_s = band.limit;
            break;
        }
    }
    // Abaixo da banda mínima → usa o limite da primeira banda
    if (frequency_hz < bands[0]!.lo) ppv_limit_mm_s = bands[0]!.limit;

    const compliant = ppv_mm_s <= ppv_limit_mm_s;
    const margin_mm_s = ppv_limit_mm_s - ppv_mm_s;

    return Object.freeze({ compliant, ppv_limit_mm_s, margin_mm_s, structure_type });
}

// ---------------------------------------------------------------------------
// 8. ABNT NBR 10151:2019 Conformance
// ---------------------------------------------------------------------------

interface CnConformanceResult {
    compliant: boolean;
    limit_day: number;
    limit_night: number;
    exceedance_day: number;
    exceedance_night: number;
    zone_type: string;
}

/**
 * Check measured sound level against ABNT NBR 10151:2019 zone limits.
 *
 * Retorna conformidade diurna e noturna separadamente. Para verificação
 * de período único, usar os campos exceedance_day ou exceedance_night.
 *
 * @param measured_dB - Measured equivalent sound level (dB)
 * @param zone_type   - Zone type key from NBR10151_LIMITS
 *   'rural_residential' | 'urban_residential' | 'mixed' | 'commercial' | 'industrial'
 * @returns
 * @throws RangeError if zone_type is not recognised
 * @see ABNT NBR 10151:2019 Tabela 1
 */
export function cnConformance(measured_dB: number, zone_type: string): CnConformanceResult {
    if (!NBR10151_LIMITS[zone_type]) {
        throw new RangeError(
            `zone_type '${zone_type}' not recognised. Valid: ${Object.keys(NBR10151_LIMITS).join(', ')}`,
        );
    }
    if (!Number.isFinite(measured_dB)) throw new RangeError(`measured_dB must be finite, got ${measured_dB}`);

    const [limit_day, limit_night] = NBR10151_LIMITS[zone_type];

    // Ultrapassagem positiva indica violação; negativa indica margem
    const exceedance_day = measured_dB - limit_day;
    const exceedance_night = measured_dB - limit_night;

    // Conforme se não ultrapassar nenhum dos limites (diurno e noturno)
    const compliant = exceedance_day <= 0 && exceedance_night <= 0;

    return Object.freeze({ compliant, limit_day, limit_night, exceedance_day, exceedance_night, zone_type });
}

// ---------------------------------------------------------------------------
// 9. CONAMA 001/1990 Conformance
// ---------------------------------------------------------------------------

interface Conama001ConformanceResult {
    compliant: boolean;
    limit_dB: number;
    exceedance_dB: number;
}

/**
 * Check measured sound level against CONAMA Resolution 001/1990 limits.
 *
 * Classes de zonas (sensível a industrial):
 *   I (áreas de hospitais, escolas) → 50 dB dia / 40 dB noite
 *   II (áreas residenciais urbanas)  → 55 dB dia / 45 dB noite
 *   III (áreas mistas)               → 60 dB dia / 50 dB noite
 *   IV (áreas industriais)           → 70 dB dia / 60 dB noite
 *
 * @param measured_dB - Measured equivalent sound level (dB)
 * @param period      - 'day' | 'night'
 * @param zone_class  - 'I' | 'II' | 'III' | 'IV'
 * @returns
 * @throws RangeError if period or zone_class are unrecognised
 * @see CONAMA Resolução 001/1990; ABNT NBR 10151
 */
export function conama001Conformance(measured_dB: number, period: string, zone_class: string): Conama001ConformanceResult {
    if (!CONAMA001_LIMITS[zone_class]) {
        throw new RangeError(
            `zone_class '${zone_class}' not recognised. Valid: ${Object.keys(CONAMA001_LIMITS).join(', ')}`,
        );
    }
    if (period !== 'day' && period !== 'night') {
        throw new RangeError(`period must be 'day' or 'night', got '${period}'`);
    }
    if (!Number.isFinite(measured_dB)) throw new RangeError(`measured_dB must be finite, got ${measured_dB}`);

    const [limitDay, limitNight] = CONAMA001_LIMITS[zone_class];
    const limit_dB = period === 'day' ? limitDay : limitNight;
    const exceedance_dB = measured_dB - limit_dB;

    return Object.freeze({ compliant: exceedance_dB <= 0, limit_dB, exceedance_dB });
}

// ---------------------------------------------------------------------------
// 10. Octave Band SPL Decomposition (ISO 266:1997)
// ---------------------------------------------------------------------------

interface OctaveBand {
    frequency_hz: number;
    lp_dB: number;
}

interface OctaveBandSplResult {
    bands: ReadonlyArray<OctaveBand>;
    total_check_dB: number;
}

/**
 * Decompose a broadband sound pressure level into standard octave bands
 * assuming equal energy distribution across all bands.
 *
 * Cada banda recebe a mesma parcela de energia:
 *   Lp_i = Lp_total − 10×log10(N_bands)
 * Verificação de energia: soma(10^(Lp_i/10)) ≈ 10^(Lp_total/10)
 *
 * @param broadband_lp_dB - Total broadband sound pressure level (dB)
 * @param octave_fractions - Optional energy fractions per band (must sum to 1.0 ±1%).
 *   If omitted, equal distribution is assumed.
 * @returns
 * @throws RangeError if octave_fractions provided but does not sum to 1.0 ±1%
 * @see ISO 266:1997 Preferred frequencies
 */
export function octaveBandSPL(broadband_lp_dB: number, octave_fractions?: number[]): OctaveBandSplResult {
    if (!Number.isFinite(broadband_lp_dB)) {
        throw new RangeError(`broadband_lp_dB must be finite, got ${broadband_lp_dB}`);
    }

    const N = OCTAVE_BANDS_HZ.length; // 8 bandas de oitava padrão
    let fractions: number[];

    if (octave_fractions !== undefined && octave_fractions !== null) {
        if (!Array.isArray(octave_fractions) || octave_fractions.length !== N) {
            throw new RangeError(`octave_fractions must be an array of ${N} values`);
        }
        const sum = octave_fractions.reduce((s, f) => s + f, 0);
        if (Math.abs(sum - 1.0) > 0.01) {
            throw new RangeError(`octave_fractions must sum to 1.0 (±1%), got ${sum.toFixed(4)}`);
        }
        fractions = octave_fractions;
    } else {
        // Distribuição igual de energia entre as 8 bandas
        fractions = Array(N).fill(1 / N);
    }

    // Lp_i = Lp_total + 10×log10(fração_i) - preserva energia total
    // eslint-disable-next-line
    const totalLinear = Math.pow(10, broadband_lp_dB / 10);
    const bands = OCTAVE_BANDS_HZ.map((frequency_hz, i) => {
        const lp_dB = broadband_lp_dB + 10 * Math.log10(fractions[i]!);
        return Object.freeze({ frequency_hz, lp_dB });
    });

    // Verificação de energia: recalcular nível total a partir das bandas
    const total_check_dB = 10 * Math.log10(bands.reduce((s, b) => s + Math.pow(10, b.lp_dB / 10), 0));

    return Object.freeze({
        bands: Object.freeze(bands),
        total_check_dB,
    }) as OctaveBandSplResult;
}

console.debug('[noisevib:end]', 'app/js/core/simulation/solvers/noiseVibration.js');
