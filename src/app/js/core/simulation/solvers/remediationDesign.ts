// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Remediation System Design Solver
 *
 * Implements pure-math engineering calculations for:
 *  - Pump-and-treat capture zone geometry (Javandel & Tsang 1986)
 *  - Multi-well spacing optimization
 *  - Pump-and-treat runtime via pore volume flushing (USEPA 1989)
 *  - Air sparging radius of influence (Johnson et al. 1993)
 *  - Soil vapor extraction (SVE) treatment time (USEPA 1991)
 *  - Biostimulation oxygen demand (Wiedemeier et al. 1999)
 *  - Monitored natural attenuation rate from field data (Newell et al. 1996)
 *  - Permeable reactive barrier thickness (Gillham & O'Hannesin 1994)
 *  - Unit cost estimator for five remediation methods (USEPA 2004)
 *
 * Academic references:
 *  - Javandel & Tsang (1986) Water Resources Research 22(6):828-836
 *  - USEPA (1989) "Ground Water Pump and Treat Systems" EPA/600/2-89/062
 *  - Johnson et al. (1993) Ground Water Monitoring & Remediation 13(1):127-135
 *  - USEPA (1991) "Engineering Bulletin: Soil Vapor Extraction" EPA/540/2-91/006
 *  - Wiedemeier et al. (1999) "Natural Attenuation of Fuels and Chlorinated Solvents"
 *    John Wiley & Sons, ISBN 0-471-19749-1
 *  - Newell et al. (1996) BIOCHLOR documentation, USEPA/600/R-96/004
 *  - Gillham & O'Hannesin (1994) Ground Water 32(6):958-967
 *  - USEPA (2004) "Cost and Performance Report for In Situ Remediation"
 */

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/** Seconds per year (Julian year, same as used throughout codebase). */
const SEC_PER_YEAR = 365.25 * 24 * 3600;

/** Seconds per day. */
const SEC_PER_DAY = 24 * 3600;

/** Days per year. */
// eslint-disable-next-line
const DAYS_PER_YEAR = 365.25;

// ---------------------------------------------------------------------------
// 1. Capture zone half-width
// ---------------------------------------------------------------------------

interface CaptureZoneWidthResult {
    readonly y_max_m: number;
    readonly total_width_m: number;
}

/**
 * Pump-and-treat capture zone maximum half-width (Javandel & Tsang 1986).
 *
 * y_max = Q / (2 * π * K * i * b)
 *
 * Derivação: em fluxo regional uniforme, a linha divisória da zona de captura
 * assintota a ±y_max conforme x→−∞ (corrente acima do poço).
 *
 * @param Q_well - Pumping rate (m³/s), > 0
 * @param K - Hydraulic conductivity (m/s), > 0
 * @param i - Hydraulic gradient (dimensionless), > 0
 * @param b - Saturated aquifer thickness (m), > 0
 * @returns y_max_m e total_width_m
 * @throws {RangeError} if any argument is non-positive
 */
export function captureZoneWidth(Q_well: number, K: number, i: number, b: number): Readonly<CaptureZoneWidthResult> {
    if (Q_well <= 0) throw new RangeError(`Q_well must be > 0, got ${Q_well}`);
    if (K <= 0) throw new RangeError(`K must be > 0, got ${K}`);
    if (i <= 0) throw new RangeError(`i must be > 0, got ${i}`);
    if (b <= 0) throw new RangeError(`b must be > 0, got ${b}`);

    const y_max_m = Q_well / (2 * Math.PI * K * i * b);
    return Object.freeze({ y_max_m, total_width_m: 2 * y_max_m });
}

// ---------------------------------------------------------------------------
// 2. Capture zone stagnation points
// ---------------------------------------------------------------------------

interface CaptureZoneLengthResult {
    readonly x_stagnation_m: number;
    readonly x_upstream_m: number;
}

/**
 * Pump-and-treat capture zone stagnation point distances (Javandel & Tsang 1986).
 *
 * Downstream stagnation point: x_s = Q / (2 * π * K * i * b)  (positive, downgradient)
 * Upstream stagnation point:   x_u = -x_s                       (negative, upgradient)
 *
 * Ponto de estagnação: localização onde a velocidade do fluido é zero,
 * definindo o limite da zona de captura ao longo do eixo de fluxo.
 *
 * @param Q_well - Pumping rate (m³/s), > 0
 * @param K - Hydraulic conductivity (m/s), > 0
 * @param i - Hydraulic gradient (dimensionless), > 0
 * @param b - Saturated aquifer thickness (m), > 0
 * @returns x_stagnation_m e x_upstream_m
 * @throws {RangeError} if any argument is non-positive
 */
export function captureZoneLength(Q_well: number, K: number, i: number, b: number): Readonly<CaptureZoneLengthResult> {
    if (Q_well <= 0) throw new RangeError(`Q_well must be > 0, got ${Q_well}`);
    if (K <= 0) throw new RangeError(`K must be > 0, got ${K}`);
    if (i <= 0) throw new RangeError(`i must be > 0, got ${i}`);
    if (b <= 0) throw new RangeError(`b must be > 0, got ${b}`);

    const x_stagnation_m = Q_well / (2 * Math.PI * K * i * b);
    return Object.freeze({ x_stagnation_m, x_upstream_m: -x_stagnation_m });
}

// ---------------------------------------------------------------------------
// 3. Multi-well spacing optimization
// ---------------------------------------------------------------------------

interface WellSpacingResult {
    readonly spacing_m: number;
    readonly Q_per_well: number;
    readonly capture_per_well_m: number;
}

/**
 * Optimal well spacing for n_wells to capture a contaminant plume without gaps.
 *
 * Each well pumps Q_per_well = Q_total / n_wells.
 * The capture half-width per well is y = Q_per_well / (2πKib).
 * Required spacing S = 2 * y ensures adjacent capture zones meet with no gap.
 *
 * Espaçamento de poços: distribuição uniforme para máxima cobertura sem zonas mortas.
 *
 * @param Q_total - Total system pumping rate (m³/s), > 0
 * @param K - Hydraulic conductivity (m/s), > 0
 * @param i - Hydraulic gradient (dimensionless), > 0
 * @param b - Saturated aquifer thickness (m), > 0
 * @param n_wells - Number of extraction wells (integer >= 1)
 * @returns spacing_m, Q_per_well, capture_per_well_m
 * @throws {RangeError} if arguments are invalid
 */
export function wellSpacing(
    Q_total: number,
    K: number,
    i: number,
    b: number,
    n_wells: number,
): Readonly<WellSpacingResult> {
    if (Q_total <= 0) throw new RangeError(`Q_total must be > 0, got ${Q_total}`);
    if (K <= 0) throw new RangeError(`K must be > 0, got ${K}`);
    if (i <= 0) throw new RangeError(`i must be > 0, got ${i}`);
    if (b <= 0) throw new RangeError(`b must be > 0, got ${b}`);
    if (!Number.isInteger(n_wells) || n_wells < 1) {
        throw new RangeError(`n_wells must be an integer >= 1, got ${n_wells}`);
    }

    const Q_per_well = Q_total / n_wells;
    const capture_per_well_m = Q_per_well / (2 * Math.PI * K * i * b);
    const spacing_m = 2 * capture_per_well_m;
    return Object.freeze({ spacing_m, Q_per_well, capture_per_well_m });
}

// ---------------------------------------------------------------------------
// 4. Pump-and-treat runtime
// ---------------------------------------------------------------------------

interface PumpAndTreatRuntimeResult {
    readonly time_years: number;
    readonly time_seconds: number;
    readonly pore_volume_m3: number;
}

/**
 * Pump-and-treat runtime to flush a given number of pore volumes (USEPA 1989).
 *
 * t = poreVolumes * V_plume * n / Q_total
 *
 * Tempo de tratamento por volume de poros: estimativa conservadora que assume
 * mistura completa sem sorção. Na prática, efeitos de cauda (tailing) prolongam
 * o tempo real.
 *
 * @param V_plume - Plume volume (m³), > 0
 * @param n - Effective porosity (0 < n < 1)
 * @param Q_total - Total pumping rate (m³/s), > 0
 * @param poreVolumes - Number of pore volumes to flush, > 0
 * @returns time_years, time_seconds, pore_volume_m3
 * @throws {RangeError} if arguments are invalid
 */
export function pumpAndTreatRuntime(
    V_plume: number,
    n: number,
    Q_total: number,
    poreVolumes: number,
): Readonly<PumpAndTreatRuntimeResult> {
    if (V_plume <= 0) throw new RangeError(`V_plume must be > 0, got ${V_plume}`);
    if (n <= 0 || n >= 1) throw new RangeError(`n (porosity) must be in (0,1), got ${n}`);
    if (Q_total <= 0) throw new RangeError(`Q_total must be > 0, got ${Q_total}`);
    if (poreVolumes <= 0) throw new RangeError(`poreVolumes must be > 0, got ${poreVolumes}`);

    const pore_volume_m3 = V_plume * n;
    const time_seconds = (poreVolumes * pore_volume_m3) / Q_total;
    const time_years = time_seconds / SEC_PER_YEAR;
    return Object.freeze({ time_years, time_seconds, pore_volume_m3 });
}

// ---------------------------------------------------------------------------
// 5. Air sparging radius of influence
// ---------------------------------------------------------------------------

interface AirSpargingRadiusResult {
    readonly radius_m: number;
}

/**
 * Air sparging radius of pressure influence - simplified analytical approximation
 * (Johnson et al. 1993 Ground Water Monitoring & Remediation 13(1):127-135).
 *
 * R = sqrt(Q_air / (π * K_air * (P_atm / depth_m)))
 *
 * Raio de influência: distância radial onde a pressão de ar injetado se iguala
 * à pressão de confinamento do aquífero (aproximação para projeto de campo).
 *
 * @param Q_air - Air injection rate (m³/s at standard conditions), > 0
 * @param K_air - Air conductivity of unsaturated zone (m/s), > 0
 * @param P_atm - Atmospheric pressure (Pa), > 0; typical ~101325
 * @param depth_m - Depth to water table or injection point (m), > 0
 * @returns radius_m
 * @throws {RangeError} if any argument is non-positive
 */
export function airSpargingRadius(
    Q_air: number,
    K_air: number,
    P_atm: number,
    depth_m: number,
): Readonly<AirSpargingRadiusResult> {
    if (Q_air <= 0) throw new RangeError(`Q_air must be > 0, got ${Q_air}`);
    if (K_air <= 0) throw new RangeError(`K_air must be > 0, got ${K_air}`);
    if (P_atm <= 0) throw new RangeError(`P_atm must be > 0, got ${P_atm}`);
    if (depth_m <= 0) throw new RangeError(`depth_m must be > 0, got ${depth_m}`);

    const radius_m = Math.sqrt(Q_air / (Math.PI * K_air * (P_atm / depth_m)));
    return Object.freeze({ radius_m });
}

// ---------------------------------------------------------------------------
// 6. Soil vapor extraction treatment time
// ---------------------------------------------------------------------------

interface SveTreatmentTimeResult {
    readonly time_years: number;
    readonly time_months: number;
    readonly time_days: number;
    readonly mass_to_remove_g: number;
    readonly extraction_rate_g_s: number;
}

/**
 * Soil vapor extraction (SVE) treatment time (USEPA 1991).
 *
 * Mass to remove: M = V_soil * n_a * (C_initial - C_target)  [g]
 * Extraction rate: R = Q_air * C_initial * eta               [g/s]
 * Treatment time:  t = M / R                                  [s]
 *
 * Tempo de tratamento SVE: relação entre massa contaminante a remover e
 * taxa de extração efetiva. eta=1 é ideal; valores típicos de campo: 0.2–0.6.
 *
 * @param V_soil - Soil volume in the treatment zone (m³), > 0
 * @param n_a - Air-filled porosity (dimensionless, 0 < n_a < 1)
 * @param C_initial - Initial vapor concentration in pore air (g/m³), > 0
 * @param C_target - Target residual vapor concentration (g/m³), >= 0, < C_initial
 * @param Q_air - Air extraction rate (m³/s), > 0
 * @param eta - Extraction efficiency (0 < eta <= 1)
 * @returns time_years, time_months, time_days, mass_to_remove_g, extraction_rate_g_s
 * @throws {RangeError} if arguments are invalid
 */
export function sveTreatmentTime(
    V_soil: number,
    n_a: number,
    C_initial: number,
    C_target: number,
    Q_air: number,
    eta: number,
): Readonly<SveTreatmentTimeResult> {
    if (V_soil <= 0) throw new RangeError(`V_soil must be > 0, got ${V_soil}`);
    if (n_a <= 0 || n_a >= 1) throw new RangeError(`n_a must be in (0,1), got ${n_a}`);
    if (C_initial <= 0) throw new RangeError(`C_initial must be > 0, got ${C_initial}`);
    if (C_target < 0) throw new RangeError(`C_target must be >= 0, got ${C_target}`);
    if (C_target >= C_initial) throw new RangeError(`C_target must be < C_initial`);
    if (Q_air <= 0) throw new RangeError(`Q_air must be > 0, got ${Q_air}`);
    if (eta <= 0 || eta > 1) throw new RangeError(`eta must be in (0,1], got ${eta}`);

    // M em gramas (C em g/m³, V em m³, n_a adimensional)
    const mass_to_remove_g = V_soil * n_a * (C_initial - C_target);
    const extraction_rate_g_s = Q_air * C_initial * eta;
    const time_seconds = mass_to_remove_g / extraction_rate_g_s;
    const time_years = time_seconds / SEC_PER_YEAR;
    const time_months = time_years * 12;
    const time_days = time_seconds / SEC_PER_DAY;

    return Object.freeze({ time_years, time_months, time_days, mass_to_remove_g, extraction_rate_g_s });
}

// ---------------------------------------------------------------------------
// 7. Biostimulation oxygen demand
// ---------------------------------------------------------------------------

interface BiostimulationOxygenDemandResult {
    readonly O2_demand_kg: number;
    readonly HC_mass_kg: number;
    readonly O2_HC_ratio: number;
}

/**
 * Theoretical O2 demand for aerobic biodegradation (Wiedemeier et al. 1999).
 *
 * Stoichiometric ratio O2/HC ≈ 3.0 (mass-based, conservative for petroleum).
 * Example: benzene C6H6 + 7.5 O2 → 6 CO2 + 3 H2O (mass ratio ≈ 3.07)
 *
 * O2_demand_kg = C_hydrocarbon_mgL * 1e-6 * V_aquifer_m3 * n * 1000 * 3.0
 *
 * Demanda de oxigênio: quantidade teórica de O2 necessária para biodegradar
 * toda a massa de hidrocarboneto no volume de aquífero afetado.
 *
 * @param C_hydrocarbon_mgL - Average hydrocarbon concentration (mg/L), > 0
 * @param V_aquifer_m3 - Aquifer volume of contaminated zone (m³), > 0
 * @param n - Effective porosity (0 < n < 1)
 * @returns O2_demand_kg, HC_mass_kg, O2_HC_ratio
 * @throws {RangeError} if arguments are invalid
 */
export function biostimulationOxygenDemand(
    C_hydrocarbon_mgL: number,
    V_aquifer_m3: number,
    n: number,
): Readonly<BiostimulationOxygenDemandResult> {
    if (C_hydrocarbon_mgL <= 0) throw new RangeError(`C_hydrocarbon_mgL must be > 0, got ${C_hydrocarbon_mgL}`);
    if (V_aquifer_m3 <= 0) throw new RangeError(`V_aquifer_m3 must be > 0, got ${V_aquifer_m3}`);
    if (n <= 0 || n >= 1) throw new RangeError(`n (porosity) must be in (0,1), got ${n}`);

    // 1 mg/L = 1e-6 kg/L; 1 m³ = 1000 L → 1 mg/L = 1e-3 kg/m³
    const HC_mass_kg = C_hydrocarbon_mgL * 1e-6 * V_aquifer_m3 * n * 1000;
    const O2_HC_ratio = 3.0;
    const O2_demand_kg = HC_mass_kg * O2_HC_ratio;

    return Object.freeze({ O2_demand_kg, HC_mass_kg, O2_HC_ratio });
}

// ---------------------------------------------------------------------------
// 8. MNA first-order attenuation rate
// ---------------------------------------------------------------------------

interface MnaRateResult {
    readonly lambda_per_day: number;
    readonly halfLife_days: number;
}

/**
 * Monitored natural attenuation (MNA) first-order rate from monitoring well data
 * (Newell et al. 1996 BIOCHLOR documentation).
 *
 * lambda = (v / (x2 - x1)) * ln(C1 / C2)   [1/day if v in m/day]
 * Half-life: t_half = ln(2) / lambda         [days]
 *
 * Atenuação natural monitorada: taxa de primeira ordem calculada a partir de
 * concentrações medidas em dois poços ao longo da direção de fluxo.
 * Se C1 == C2, lambda = 0 (sem atenuação detectável).
 *
 * @param C1 - Concentration at upgradient well (mg/L), > 0
 * @param C2 - Concentration at downgradient well (mg/L), > 0
 * @param x1 - Distance of upgradient well from source (m), >= 0
 * @param x2 - Distance of downgradient well from source (m), > x1
 * @param v - Groundwater seepage velocity (m/day), > 0
 * @returns lambda_per_day, halfLife_days
 * @throws {RangeError} if arguments are invalid
 */
export function monitredNaturalAttenuationRate(
    C1: number,
    C2: number,
    x1: number,
    x2: number,
    v: number,
): Readonly<MnaRateResult> {
    if (C1 <= 0) throw new RangeError(`C1 must be > 0, got ${C1}`);
    if (C2 <= 0) throw new RangeError(`C2 must be > 0, got ${C2}`);
    if (x2 <= x1) throw new RangeError(`x2 must be > x1; got x1=${x1}, x2=${x2}`);
    if (v <= 0) throw new RangeError(`v must be > 0, got ${v}`);

    const dx = x2 - x1;

    if (C1 === C2) {
        // Sem atenuação detectável ao longo do trecho
        return Object.freeze({ lambda_per_day: 0, halfLife_days: Infinity });
    }

    const lambda_per_day = (v / dx) * Math.log(C1 / C2);
    const halfLife_days = lambda_per_day > 0 ? Math.log(2) / lambda_per_day : Infinity;

    return Object.freeze({ lambda_per_day, halfLife_days });
}

// ---------------------------------------------------------------------------
// 9. PRB design thickness
// ---------------------------------------------------------------------------

interface PrbThicknessResult {
    readonly thickness_m: number;
}

/**
 * Permeable reactive barrier (PRB) design thickness (Gillham & O'Hannesin 1994).
 *
 * L = -(v / lambda_PRB) * ln(C_out / C_in)
 *
 * Espessura da barreira reativa: dimensionamento baseado na cinética de
 * primeira ordem no meio reativo (zero-valent iron typical: lambda_PRB ~ 1–10/day).
 *
 * @param v - Pore velocity through PRB (m/day), > 0
 * @param C_in - Influent concentration (mg/L), > 0
 * @param C_out - Effluent target concentration (mg/L), > 0, < C_in
 * @param lambda_PRB - First-order degradation rate in PRB (1/day), > 0
 * @returns thickness_m
 * @throws {RangeError} if arguments are invalid
 */
export function permReactiveBarrierThickness(
    v: number,
    C_in: number,
    C_out: number,
    lambda_PRB: number,
): Readonly<PrbThicknessResult> {
    if (v <= 0) throw new RangeError(`v must be > 0, got ${v}`);
    if (C_in <= 0) throw new RangeError(`C_in must be > 0, got ${C_in}`);
    if (C_out <= 0) throw new RangeError(`C_out must be > 0, got ${C_out}`);
    if (C_out >= C_in) throw new RangeError(`C_out must be < C_in`);
    if (lambda_PRB <= 0) throw new RangeError(`lambda_PRB must be > 0, got ${lambda_PRB}`);

    const thickness_m = -(v / lambda_PRB) * Math.log(C_out / C_in);
    return Object.freeze({ thickness_m });
}

// ---------------------------------------------------------------------------
// 10. Remediation cost estimator
// ---------------------------------------------------------------------------

type RemediationMethod = 'pump_and_treat' | 'SVE' | 'MNA' | 'PRB' | 'air_sparging';

interface RemediationCostOptions {
    readonly volume_m3?: number;
    readonly duration_years?: number;
    readonly Q_m3_per_day?: number;
}

interface RemediationCostResult {
    readonly total_USD: number;
    readonly annual_USD: number;
    readonly capex_USD: number;
    readonly opex_USD: number;
    readonly method: string;
}

/**
 * Simplified unit cost estimates for five remediation methods (USEPA 2004).
 *
 * Methods and unit costs (2024 USD):
 *  - 'pump_and_treat': $15/m³/year operating + $50 000 mobilization
 *  - 'SVE':            $20/m³/year + $80 000 mobilization
 *  - 'MNA':            $5 000/year monitoring + $20 000 baseline study
 *  - 'PRB':            $200/m³ installation (one-time; volume = barrier volume)
 *  - 'air_sparging':   $25/m³/year + $60 000 mobilization
 *
 * Estimativa de custo: valores unitários médios nacionais dos EUA (2024).
 * Custos brasileiros tipicamente 60–80% do valor americano (câmbio ajustado).
 *
 * @param method - One of: 'pump_and_treat' | 'SVE' | 'MNA' | 'PRB' | 'air_sparging'
 * @param options - volume_m3, duration_years, Q_m3_per_day
 * @returns total_USD, annual_USD, capex_USD, opex_USD, method
 * @throws {RangeError} if method is unknown or required options are missing/invalid
 */
export function remediationCostEstimate(
    method: RemediationMethod,
    // eslint-disable-next-line
    { volume_m3 = 0, duration_years = 0, Q_m3_per_day = 0 }: RemediationCostOptions = {},
): Readonly<RemediationCostResult> {
    const VALID: readonly RemediationMethod[] = ['pump_and_treat', 'SVE', 'MNA', 'PRB', 'air_sparging'];
    if (!VALID.includes(method)) {
        throw new RangeError(`Unknown method "${method}". Valid: ${VALID.join(', ')}`);
    }

    let capex_USD = 0;
    let annual_USD = 0;

    switch (method) {
        case 'pump_and_treat':
            if (volume_m3 <= 0) throw new RangeError(`volume_m3 must be > 0 for pump_and_treat`);
            if (duration_years <= 0) throw new RangeError(`duration_years must be > 0 for pump_and_treat`);
            capex_USD = 50_000;
            annual_USD = 15 * volume_m3;
            break;

        case 'SVE':
            if (volume_m3 <= 0) throw new RangeError(`volume_m3 must be > 0 for SVE`);
            if (duration_years <= 0) throw new RangeError(`duration_years must be > 0 for SVE`);
            capex_USD = 80_000;
            annual_USD = 20 * volume_m3;
            break;

        case 'MNA':
            if (duration_years <= 0) throw new RangeError(`duration_years must be > 0 for MNA`);
            capex_USD = 20_000; // baseline study
            annual_USD = 5_000; // annual monitoring
            break;

        case 'PRB':
            if (volume_m3 <= 0) throw new RangeError(`volume_m3 must be > 0 for PRB`);
            capex_USD = 200 * volume_m3;
            annual_USD = 0;
            break;

        case 'air_sparging':
            if (volume_m3 <= 0) throw new RangeError(`volume_m3 must be > 0 for air_sparging`);
            if (duration_years <= 0) throw new RangeError(`duration_years must be > 0 for air_sparging`);
            capex_USD = 60_000;
            annual_USD = 25 * volume_m3;
            break;
    }

    const opex_USD = annual_USD * duration_years;
    const total_USD = capex_USD + opex_USD;

    return Object.freeze({ total_USD, annual_USD, capex_USD, opex_USD, method });
}
