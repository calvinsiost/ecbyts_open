// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   HEALTH-MON-001 Phase 1 — Módulo de Amostragem de Higiene Industrial
   Referências:
     - Brief & Scala (1975) AIHA J — ajuste de TLV para turnos não-padrão
     - OSHA 29 CFR 1910.1000 — TWA 8h e limite de exposição permissível
     - ACGIH TLVs & BEIs (2024) — fórmula de mistura, WBGT
     - Hewett & Ganser (2007) J. Occup. Hyg. — estatística lognormal UCL95
     - Land (1971) JASA — estatística H para UCL95 em distribuição lognormal
     - OSHA 29 CFR 1910.95 — dose de ruído industrial
     - ISO 9612:2009 — nível equivalente de som (Leq)
     - ISO 7933:2004; ACGIH TLV-WBGT (2024) — estresse por calor
     - USEPA (1992) Dermal Exposure Assessment — fluxo dérmico
     - NIOSH Occupational Exposure Banding (2019) — classificação de controle
     - ISO 5349-1:2001 §B — exposição diária à vibração mão-braço A(8) e soma de energia
     - Diretiva 2002/44/CE (Physical Agents — Vibration) — EAV=2.5, ELV=5.0 m/s²
     - HSE (UK) Hand-Arm Vibration "exposure points" system — pontos = 2·a²·T

   Lógica pura — sem DOM, sem rede, sem Three.js, sem IDB.
   Todos os retornos são Object.freeze().
   Lança RangeError para entradas inválidas.
   ================================================================ */

console.debug('[ihsampling:load]', 'app/js/core/health/industrialHygieneSampling.js');

// ----------------------------------------------------------------
// Constantes de referência interna
// ----------------------------------------------------------------

/** Duração padrão do turno ACGIH/OSHA (horas) */
const STANDARD_SHIFT_H = 8;

/** Período de 24h para cálculo Brief-Scala */
const HOURS_IN_DAY = 24;

/** Fator denominador do modelo Brief-Scala (horas de "descanso" base) */
const BRIEF_SCALA_DENOMINATOR = 16;

/**
 * Tabela de valores H de Land para UCL95 lognormal (Land 1971, Tabela 1).
 * Interpola linearmente entre os pontos tabelados; usa extremos fora do intervalo.
 * Chave = n mínimo, valor = H aproximado.
 */
const LAND_H_TABLE = Object.freeze([
    { n: 3, h: 3.47 },
    { n: 5, h: 2.34 },
    { n: 10, h: 1.6 },
    { n: 20, h: 1.13 },
    { n: 30, h: 0.9 },
]);

/**
 * Busca o valor H de Land para o tamanho amostral n.
 * Usa interpolação linear entre os pontos tabelados.
 * @param n - Tamanho amostral (inteiro ≥ 3)
 * @returns Valor H aproximado
 */
function landH(n: number): number {
    if (n <= (LAND_H_TABLE[0] as { n: number; h: number }).n) {
        return (LAND_H_TABLE[0] as { n: number; h: number }).h;
    }
    const last = LAND_H_TABLE[LAND_H_TABLE.length - 1] as { n: number; h: number };
    if (n >= last.n) return last.h;
    // Interpola linearmente entre os dois pontos vizinhos
    for (let i = 1; i < LAND_H_TABLE.length; i++) {
        const lo = LAND_H_TABLE[i - 1] as { n: number; h: number };
        const hi = LAND_H_TABLE[i] as { n: number; h: number };
        if (n >= lo.n && n <= hi.n) {
            const frac = (n - lo.n) / (hi.n - lo.n);
            return lo.h - frac * (lo.h - hi.h);
        }
    }
    return last.h;
}

// ----------------------------------------------------------------
// Faixas de risco WBGT (ACGIH 2024, trabalho leve, 75% trabalho / 25% descanso)
// ----------------------------------------------------------------
const WBGT_THRESHOLDS = Object.freeze([
    { max: 26, risk: 'low', label: 'Baixo risco térmico' },
    { max: 30, risk: 'moderate', label: 'Risco térmico moderado' },
    { max: 33, risk: 'high', label: 'Risco térmico alto' },
    { max: Infinity, risk: 'very_high', label: 'Risco térmico muito alto' },
]);

// ----------------------------------------------------------------
// 1. shiftAdjustedTLV - Ajuste de TLV para turno não-padrão
// ----------------------------------------------------------------

/**
 * Adjust TLV for non-standard work shifts.
 *
 * Brief-Scala (1975): TLV_adj = TLV_8h × (8 / hoursWorked) × ((24 - hoursWorked) / 16)
 * OSHA simple:        TLV_adj = TLV_8h × (8 / hoursWorked)
 *
 * @param tlv8h       - TLV de referência para turno de 8h (mg/m³ ou ppm)
 * @param hoursWorked - Duração real do turno em horas (1–24)
 * @param model - Modelo de ajuste
 */
export function shiftAdjustedTLV(
    tlv8h: number,
    hoursWorked: number,
    model: 'brief-scala' | 'osha' = 'brief-scala',
): Readonly<{ tlv_adjusted: number; model: string; hours_worked: number; reduction_factor: number }> {
    if (!Number.isFinite(tlv8h) || tlv8h <= 0) {
        throw new RangeError(`tlv8h deve ser um número positivo finito; recebido: ${tlv8h}`);
    }
    if (!Number.isFinite(hoursWorked) || hoursWorked <= 0 || hoursWorked > HOURS_IN_DAY) {
        throw new RangeError(`hoursWorked deve estar em (0, 24]; recebido: ${hoursWorked}`);
    }
    if (model !== 'brief-scala' && model !== 'osha') {
        throw new RangeError(`model deve ser 'brief-scala' ou 'osha'; recebido: ${model}`);
    }

    let reduction_factor;
    if (model === 'brief-scala') {
        // Fórmula Brief & Scala (1975) AIHA J
        reduction_factor = (STANDARD_SHIFT_H / hoursWorked) * ((HOURS_IN_DAY - hoursWorked) / BRIEF_SCALA_DENOMINATOR);
    } else {
        // OSHA simples: proporcional às horas
        reduction_factor = STANDARD_SHIFT_H / hoursWorked;
    }

    const tlv_adjusted = tlv8h * reduction_factor;
    return Object.freeze({ tlv_adjusted, model, hours_worked: hoursWorked, reduction_factor });
}

// ----------------------------------------------------------------
// 2. timeWeightedAverage - TWA segundo OSHA 29 CFR 1910.1000
// ----------------------------------------------------------------

/**
 * Calculate 8-hour time-weighted average (TWA).
 *
 * TWA = Σ(Cᵢ × tᵢ) / Σtᵢ
 *
 * @param concentrations - Concentrações medidas (mg/m³), array ≥ 1
 * @param durations      - Durações correspondentes em horas, mesma dimensão
 */
export function timeWeightedAverage(
    concentrations: number[],
    durations: number[],
): Readonly<{ twa: number; total_hours: number; n_samples: number }> {
    if (!Array.isArray(concentrations) || !Array.isArray(durations)) {
        throw new RangeError('concentrations e durations devem ser arrays');
    }
    if (concentrations.length !== durations.length) {
        throw new RangeError(
            `concentrations (${concentrations.length}) e durations (${durations.length}) devem ter o mesmo comprimento`,
        );
    }
    if (concentrations.length === 0) {
        throw new RangeError('arrays não podem ser vazios');
    }

    let sumCt = 0;
    let total_hours = 0;
    for (let i = 0; i < concentrations.length; i++) {
        const c = concentrations[i] as number;
        const t = durations[i] as number;
        if (!Number.isFinite(c) || c < 0) {
            throw new RangeError(`concentrations[${i}] inválida: ${c}`);
        }
        if (!Number.isFinite(t) || t <= 0) {
            throw new RangeError(`durations[${i}] deve ser positivo; recebido: ${t}`);
        }
        sumCt += c * t;
        total_hours += t;
    }

    if (total_hours <= 0) {
        throw new RangeError(`total_hours deve ser > 0; calculado: ${total_hours}`);
    }

    const twa = sumCt / total_hours;
    return Object.freeze({ twa, total_hours, n_samples: concentrations.length });
}

// ----------------------------------------------------------------
// 3. mixedExposureIndex - Índice de exposição a misturas (ACGIH 2024)
// ----------------------------------------------------------------

/**
 * Calculate combined exposure index for chemical mixtures.
 *
 * Em = Σ(TWA_i / TLV_i)
 * Compliant when Em ≤ 1.
 *
 * @param twas - TWA medidas por substância (mg/m³ ou ppm)
 * @param tlvs - TLV de referência por substância (mesma unidade)
 */
export function mixedExposureIndex(
    twas: number[],
    tlvs: number[],
): Readonly<{ em: number; compliant: boolean; n_substances: number }> {
    if (!Array.isArray(twas) || !Array.isArray(tlvs)) {
        throw new RangeError('twas e tlvs devem ser arrays');
    }
    if (twas.length !== tlvs.length) {
        throw new RangeError(`twas (${twas.length}) e tlvs (${tlvs.length}) devem ter o mesmo comprimento`);
    }
    if (twas.length === 0) {
        throw new RangeError('arrays não podem ser vazios');
    }

    let em = 0;
    for (let i = 0; i < twas.length; i++) {
        const twa = twas[i] as number;
        const tlv = tlvs[i] as number;
        if (!Number.isFinite(twa) || twa < 0) {
            throw new RangeError(`twas[${i}] inválida: ${twa}`);
        }
        if (!Number.isFinite(tlv) || tlv <= 0) {
            throw new RangeError(`tlvs[${i}] deve ser positivo; recebido: ${tlv}`);
        }
        em += twa / tlv;
    }

    return Object.freeze({ em, compliant: em <= 1, n_substances: twas.length });
}

// ----------------------------------------------------------------
// 4. lognormalExposureStats - Estatística lognormal (Hewett & Ganser 2007)
// ----------------------------------------------------------------

/**
 * Fit lognormal distribution to occupational exposure measurements.
 *
 * GM  = exp(mean(ln x))
 * GSD = exp(std(ln x))        - desvio padrão amostral
 * AM  = exp(xbar + s²/2)      - média aritmética estimada
 * UCL95 (Land-H): exp(xbar + s²/2 + H×s/√n)
 * p95 = exp(xbar + 1.645×s)
 *
 * @param measurements - Medições positivas (mg/m³), n ≥ 3
 */
export function lognormalExposureStats(
    measurements: number[],
): Readonly<{ gm: number; gsd: number; am: number; ucl95: number; p95: number; n: number }> {
    if (!Array.isArray(measurements) || measurements.length < 3) {
        throw new RangeError('measurements deve ter pelo menos 3 elementos');
    }
    for (let i = 0; i < measurements.length; i++) {
        if (!Number.isFinite(measurements[i]) || (measurements[i] as number) <= 0) {
            throw new RangeError(`measurements[${i}] deve ser positivo; recebido: ${measurements[i]}`);
        }
    }

    const n = measurements.length;
    const lnVals = measurements.map((x) => Math.log(x));

    // Média e variância amostral dos logaritmos
    const xbar = lnVals.reduce((acc, v) => acc + v, 0) / n;
    const variance = lnVals.reduce((acc, v) => acc + (v - xbar) ** 2, 0) / (n - 1);
    const s = Math.sqrt(variance);

    const gm = Math.exp(xbar);
    const gsd = Math.exp(s);
    const am = Math.exp(xbar + variance / 2);
    const H = landH(n);
    // UCL95 pela aproximação de Land (1971): exp(xbar + s²/2 + H×s/√n)
    const ucl95 = Math.exp(xbar + variance / 2 + (H * s) / Math.sqrt(n));
    const p95 = Math.exp(xbar + 1.645 * s);

    return Object.freeze({ gm, gsd, am, ucl95, p95, n });
}

// ----------------------------------------------------------------
// 5. bayesianExceedanceFraction - Fração de excedência (Hewett & Ganser 2007)
// ----------------------------------------------------------------

/**
 * Estimate exceedance fraction P(X > OEL) using lognormal fit.
 *
 * Simplified: P(X > OEL) = Φ(-(ln(OEL) - xbar) / s)  where Φ is the standard normal CDF.
 * Numerically: P(Z > z) via erfc approximation.
 *
 * @param measurements - Medições positivas (mg/m³), n ≥ 3
 * @param oelFraction - OEL como fração do TLV nominal (1.0 = 100% TLV)
 */
export function bayesianExceedanceFraction(
    measurements: number[],
    oelFraction: number = 1.0,
): Readonly<{ exceedance_fraction: number; above_oel_count: number; n: number; oel_used: number }> {
    if (!Array.isArray(measurements) || measurements.length < 3) {
        throw new RangeError('measurements deve ter pelo menos 3 elementos');
    }
    if (!Number.isFinite(oelFraction) || oelFraction <= 0) {
        throw new RangeError(`oelFraction deve ser positivo; recebido: ${oelFraction}`);
    }
    for (let i = 0; i < measurements.length; i++) {
        if (!Number.isFinite(measurements[i]) || (measurements[i] as number) <= 0) {
            throw new RangeError(`measurements[${i}] deve ser positivo; recebido: ${measurements[i]}`);
        }
    }

    const n = measurements.length;
    const lnVals = measurements.map((x) => Math.log(x));
    const xbar = lnVals.reduce((acc, v) => acc + v, 0) / n;
    const variance = lnVals.reduce((acc, v) => acc + (v - xbar) ** 2, 0) / (n - 1);
    const s = Math.sqrt(variance);

    // OEL = mediana geométrica das medições × fração (interpretação simplificada)
    const oel_used = Math.exp(xbar) * oelFraction;
    const z = (Math.log(oel_used) - xbar) / (s || 1e-12);

    // P(X > OEL) = 1 - Φ(z) usando aproximação de erfc: Φ(z) ≈ erfc(-z/√2)/2
    const exceedance_fraction = normalCDFUpper(z);
    const above_oel_count = measurements.filter((x) => x > oel_used).length;

    return Object.freeze({ exceedance_fraction, above_oel_count, n, oel_used });
}

/**
 * P(Z > z) para distribuição normal padrão via aproximação de Abramowitz & Stegun.
 */
function normalCDFUpper(z: number): number {
    // Aproximação racional (A&S 26.2.17): erro < 7.5e-8
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const poly = t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    const phi = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z) * poly;
    return z >= 0 ? phi : 1 - phi;
}

// ----------------------------------------------------------------
// 6. noiseDoesOSHA - Dose de ruído OSHA 29 CFR 1910.95
// ----------------------------------------------------------------

/**
 * Calculate OSHA noise dose for multiple exposure periods.
 *
 * T_i = 8 / 2^((L_i - 90) / 5)   - tempo permissível em horas ao nível L_i dB(A)
 * D   = Σ(C_i / T_i) × 100        - dose em %
 *
 * @param levels    - Níveis de pressão sonora em dB(A) por período
 * @param durations - Duração de exposição em horas por período
 */
export function noiseDoesOSHA(
    levels: number[],
    durations: number[],
): Readonly<{ dose_percent: number; compliant: boolean; n_periods: number }> {
    if (!Array.isArray(levels) || !Array.isArray(durations)) {
        throw new RangeError('levels e durations devem ser arrays');
    }
    if (levels.length !== durations.length) {
        throw new RangeError(
            `levels (${levels.length}) e durations (${durations.length}) devem ter o mesmo comprimento`,
        );
    }
    if (levels.length === 0) {
        throw new RangeError('arrays não podem ser vazios');
    }

    let dose = 0;
    for (let i = 0; i < levels.length; i++) {
        const L = levels[i] as number;
        const C = durations[i] as number;
        if (!Number.isFinite(L) || L < 0) {
            throw new RangeError(`levels[${i}] inválido: ${L}`);
        }
        if (!Number.isFinite(C) || C <= 0) {
            throw new RangeError(`durations[${i}] deve ser positivo; recebido: ${C}`);
        }
        // Tempo permissível OSHA ao nível L (horas)
        const T_i = STANDARD_SHIFT_H / Math.pow(2, (L - 90) / 5);
        dose += C / T_i;
    }

    const dose_percent = dose * 100;
    return Object.freeze({ dose_percent, compliant: dose_percent <= 100, n_periods: levels.length });
}

// ----------------------------------------------------------------
// 7. laeqLeqCalculation - Nível equivalente de som (ISO 9612:2009)
// ----------------------------------------------------------------

/**
 * Calculate energy-equivalent continuous sound level Leq.
 *
 * Leq = 10 × log10(1/T × Σ(tᵢ × 10^(Lᵢ/10)))
 *
 * @param levels    - Níveis de pressão sonora em dB(A)
 * @param durations - Duração de cada período em horas
 */
export function laeqLeqCalculation(
    levels: number[],
    durations: number[],
): Readonly<{ leq: number; total_duration_h: number; n_measurements: number }> {
    if (!Array.isArray(levels) || !Array.isArray(durations)) {
        throw new RangeError('levels e durations devem ser arrays');
    }
    if (levels.length !== durations.length) {
        throw new RangeError(
            `levels (${levels.length}) e durations (${durations.length}) devem ter o mesmo comprimento`,
        );
    }
    if (levels.length === 0) {
        throw new RangeError('arrays não podem ser vazios');
    }

    let sumEnergy = 0;
    let total_duration_h = 0;
    for (let i = 0; i < levels.length; i++) {
        const L = levels[i] as number;
        const t = durations[i] as number;
        if (!Number.isFinite(L)) {
            throw new RangeError(`levels[${i}] inválido: ${L}`);
        }
        if (!Number.isFinite(t) || t <= 0) {
            throw new RangeError(`durations[${i}] deve ser positivo; recebido: ${t}`);
        }
        sumEnergy += t * Math.pow(10, L / 10);
        total_duration_h += t;
    }

    const leq = 10 * Math.log10(sumEnergy / total_duration_h);
    return Object.freeze({ leq, total_duration_h, n_measurements: levels.length });
}

// ----------------------------------------------------------------
// 8. heatStressWBGT - Índice WBGT de estresse térmico (ACGIH 2024)
// ----------------------------------------------------------------

/**
 * Calculate Wet Bulb Globe Temperature (WBGT) heat stress index.
 *
 * Indoor:  WBGT = 0.7×Twet + 0.3×Tglobe
 * Outdoor: WBGT = 0.7×Twet + 0.2×Tglobe + 0.1×Tdry
 *
 * @param twet    - Temperatura de bulbo úmido (°C)
 * @param tglobe  - Temperatura de globo (°C)
 * @param tdry    - Temperatura de bulbo seco (°C)
 * @param outdoor - Se verdadeiro usa a fórmula outdoor com Tdry
 */
export function heatStressWBGT(
    twet: number,
    tglobe: number,
    tdry: number,
    outdoor: boolean = false,
): Readonly<{ wbgt: number; risk: string; tlv_wbgt_reference: number }> {
    for (const [name, val] of [
        ['twet', twet],
        ['tglobe', tglobe],
        ['tdry', tdry],
    ] as Array<[string, number]>) {
        if (!Number.isFinite(val)) {
            throw new RangeError(`${name} deve ser um número finito; recebido: ${val}`);
        }
    }

    const wbgt = outdoor ? 0.7 * twet + 0.2 * tglobe + 0.1 * tdry : 0.7 * twet + 0.3 * tglobe;

    const tier = WBGT_THRESHOLDS.find((t) => wbgt < t.max);
    const risk = tier ? tier.risk : 'very_high';

    // Limiar TLV de referência para a faixa encontrada
    const tlv_wbgt_reference = (WBGT_THRESHOLDS[WBGT_THRESHOLDS.length - 2] as { max: number }).max; // 33°C (high/very_high boundary)

    return Object.freeze({ wbgt, risk, tlv_wbgt_reference });
}

// ----------------------------------------------------------------
// 9. skinPermeabilityFlux - Absorção dérmica (USEPA 1992)
// ----------------------------------------------------------------

/**
 * Calculate dermal absorption from skin permeability coefficient.
 *
 * Fluxo:    J = Kp × C_air   (mg/cm²/h)
 * Dose abs: D = J × area × duration   (mg)
 *
 * @param concentration_air - Concentração no ar (mg/m³)
 * @param kp                - Coeficiente de permeabilidade dérmica (cm/h)
 * @param area_cm2          - Área de pele exposta (cm²)
 * @param duration_h        - Duração da exposição (h)
 */
export function skinPermeabilityFlux(
    concentration_air: number,
    kp: number,
    area_cm2: number,
    duration_h: number,
): Readonly<{ flux_mg_cm2_h: number; dose_mg: number; notation: string }> {
    if (!Number.isFinite(concentration_air) || concentration_air < 0) {
        throw new RangeError(`concentration_air deve ser não-negativo; recebido: ${concentration_air}`);
    }
    if (!Number.isFinite(kp) || kp < 0) {
        throw new RangeError(`kp deve ser não-negativo; recebido: ${kp}`);
    }
    if (!Number.isFinite(area_cm2) || area_cm2 <= 0) {
        throw new RangeError(`area_cm2 deve ser positivo; recebido: ${area_cm2}`);
    }
    if (!Number.isFinite(duration_h) || duration_h <= 0) {
        throw new RangeError(`duration_h deve ser positivo; recebido: ${duration_h}`);
    }

    // Conversão: concentração em mg/m³ → mg/cm³ (÷ 1e6)
    const concentration_cm3 = concentration_air / 1e6;
    const flux_mg_cm2_h = kp * concentration_cm3;
    const dose_mg = flux_mg_cm2_h * area_cm2 * duration_h;

    return Object.freeze({ flux_mg_cm2_h, dose_mg, notation: 'skin' });
}

// ----------------------------------------------------------------
// 10. occupationalExposureBanding - Faixas de controle (NIOSH 2019)
// ----------------------------------------------------------------

/** Definição das faixas OEB segundo TLV simplificado em ppm */
const OEB_BANDS_PPM = Object.freeze([
    {
        band: 'OEB5',
        min: 0,
        max: 0.5,
        label: 'Muito alta potência — controle máximo (isolamento/HEPA)',
        containment_level: 5,
    },
    { band: 'OEB4', min: 0.5, max: 5, label: 'Alta potência — contenção fechada', containment_level: 4 },
    {
        band: 'OEB3',
        min: 5,
        max: 50,
        label: 'Potência moderada — sistema fechado com ventilação LEV',
        containment_level: 3,
    },
    {
        band: 'OEB2',
        min: 50,
        max: 500,
        label: 'Baixa potência — ventilação geral com controles de engenharia',
        containment_level: 2,
    },
    {
        band: 'OEB1',
        min: 500,
        max: Infinity,
        label: 'Potência muito baixa — controles administrativos básicos',
        containment_level: 1,
    },
]);

/**
 * Classify a substance into an Occupational Exposure Band (OEB).
 *
 * Limites simplificados baseados em TLV (ppm):
 *   OEB5 (<0.5 ppm), OEB4 (0.5–5), OEB3 (5–50), OEB2 (50–500), OEB1 (>500)
 *
 * @param tlv   - Valor limite de exposição (ppm ou µg/m³ conforme units)
 * @param units - Unidade do TLV fornecido
 */
export function occupationalExposureBanding(
    tlv: number,
    units: 'ppm' | 'ug_m3' = 'ppm',
): Readonly<{ band: string; label: string; containment_level: number }> {
    if (!Number.isFinite(tlv) || tlv < 0) {
        throw new RangeError(`tlv deve ser não-negativo; recebido: ${tlv}`);
    }
    if (units !== 'ppm' && units !== 'ug_m3') {
        throw new RangeError(`units deve ser 'ppm' ou 'ug_m3'; recebido: ${units}`);
    }

    // Converte µg/m³ → ppm de forma aproximada (MW=100 g/mol padrão, 25°C, 1atm)
    // ppm ≈ µg/m³ × (24.45 / MW) com MW=100 → fator ~0.2445
    // Simplificação conservadora: 1 ppm ~ 4.1 µg/m³ (médio) → ppm = ug_m3 / 4.1
    const tlv_ppm = units === 'ug_m3' ? tlv / 4.1 : tlv;

    const tier = OEB_BANDS_PPM.find((b) => tlv_ppm >= b.min && tlv_ppm < b.max);
    const result = tier || (OEB_BANDS_PPM[OEB_BANDS_PPM.length - 1] as { band: string; label: string; containment_level: number });

    return Object.freeze({ band: result.band, label: result.label, containment_level: result.containment_level });
}

// ----------------------------------------------------------------
// 11. handArmDailyVibrationA8 - Exposição diária mão-braço A(8) multi-operação
//     ISO 5349-1:2001 §B + Diretiva 2002/44/CE + sistema de pontos HSE
// ----------------------------------------------------------------

/** Valor de ação de exposição (EAV) mão-braço, Diretiva 2002/44/CE (m/s²) */
const HAV_EAV_MS2 = 2.5;
/** Valor limite de exposição (ELV) mão-braço, Diretiva 2002/44/CE (m/s²) */
const HAV_ELV_MS2 = 5.0;

/**
 * Calcula a exposição diária à vibração mão-braço A(8) combinando várias
 * operações/ferramentas num mesmo turno (ISO 5349-1:2001 Anexo B).
 *
 * Para cada operação i:
 *   exposição parcial   A_i(8) = a_hv,i × sqrt(T_i / T_0)    com T_0 = 8 h
 *   pontos HSE          P_i    = 2 × a_hv,i² × T_i           (T_i em horas)
 *
 * Combinação (soma de energia):
 *   A(8) = sqrt( Σ A_i(8)² )
 *   P    = Σ P_i           (equivale a: A(8) = 2.5 × sqrt(P / 100))
 *
 * Classificação Diretiva 2002/44/CE:
 *   A(8) < 2.5  → below_eav  (sem ação)
 *   2.5 ≤ A(8) < 5.0 → action  (EAV — medidas preventivas; 100 pontos = EAV)
 *   A(8) ≥ 5.0  → limit  (ELV excedido; 400 pontos = ELV)
 *
 * Também devolve o tempo restante até atingir EAV/ELV à exposição agregada
 * equivalente: T_to_X = T_0 × (X / A(8))²  (horas), útil para limitar o turno.
 *
 * @param accelerations_ms2 - a_hv ponderado em frequência por operação (m/s²)
 * @param durations_h       - Duração de cada operação no turno (horas)
 */
export function handArmDailyVibrationA8(
    accelerations_ms2: number[],
    durations_h: number[],
): Readonly<{
    a8: number;
    points: number;
    classification: 'below_eav' | 'action' | 'limit';
    eav: number;
    elv: number;
    n_operations: number;
    time_to_eav_h: number | null;
    time_to_elv_h: number | null;
}> {
    if (!Array.isArray(accelerations_ms2) || !Array.isArray(durations_h)) {
        throw new RangeError('accelerations_ms2 e durations_h devem ser arrays');
    }
    if (accelerations_ms2.length !== durations_h.length) {
        throw new RangeError(
            `accelerations_ms2 (${accelerations_ms2.length}) e durations_h (${durations_h.length}) devem ter o mesmo comprimento`,
        );
    }
    if (accelerations_ms2.length === 0) {
        throw new RangeError('arrays não podem ser vazios');
    }

    let sumPartialSquared = 0; // Σ A_i(8)²
    let points = 0; // Σ P_i
    for (let i = 0; i < accelerations_ms2.length; i++) {
        const a = accelerations_ms2[i] as number;
        const T = durations_h[i] as number;
        if (!Number.isFinite(a) || a < 0) {
            throw new RangeError(`accelerations_ms2[${i}] deve ser não-negativo; recebido: ${a}`);
        }
        if (!Number.isFinite(T) || T < 0) {
            throw new RangeError(`durations_h[${i}] deve ser não-negativo; recebido: ${T}`);
        }
        const partial = a * Math.sqrt(T / STANDARD_SHIFT_H); // A_i(8)
        sumPartialSquared += partial * partial;
        points += 2 * a * a * T; // pontos HSE
    }

    const a8 = Math.sqrt(sumPartialSquared);

    let classification: 'below_eav' | 'action' | 'limit';
    if (a8 < HAV_EAV_MS2) classification = 'below_eav';
    else if (a8 < HAV_ELV_MS2) classification = 'action';
    else classification = 'limit';

    // Tempo agregado equivalente até atingir EAV/ELV à mesma a_hv equivalente.
    // A_hv,eq²·T_eq/T0 = A(8)² ⇒ tempo p/ X = T0·(X/A(8))².
    const time_to_eav_h = a8 > 0 ? STANDARD_SHIFT_H * Math.pow(HAV_EAV_MS2 / a8, 2) : null;
    const time_to_elv_h = a8 > 0 ? STANDARD_SHIFT_H * Math.pow(HAV_ELV_MS2 / a8, 2) : null;

    return Object.freeze({
        a8,
        points,
        classification,
        eav: HAV_EAV_MS2,
        elv: HAV_ELV_MS2,
        n_operations: accelerations_ms2.length,
        time_to_eav_h,
        time_to_elv_h,
    });
}

console.debug('[ihsampling:end]', 'app/js/core/health/industrialHygieneSampling.js');
