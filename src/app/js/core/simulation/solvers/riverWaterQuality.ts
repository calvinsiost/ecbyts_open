// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

console.debug('[riverwq:load]', 'app/js/core/simulation/solvers/riverWaterQuality.js');

/**
 * riverWaterQuality.js
 * Pure-math river water quality solvers - no DOM, no IDB, no Three.js, no fetch.
 *
 * Covers: Streeter-Phelps DO sag (1925), reaeration models (OConnor-Dobbins,
 * Churchill, Owen-Gibbs-Edwards), BOD temperature correction (θ=1.047),
 * stream dilution mixing, Carlson TSI (1977), nitrogenous oxygen demand,
 * Vollenweider phosphorus loading (1976), sediment oxygen demand, and
 * CONAMA 357/2005 Class II water quality compliance check.
 *
 * Todas as funções retornam objetos congelados (Object.freeze) e lançam
 * RangeError para entradas inválidas - seguro para uso em Node.js sem side-effects.
 *
 * @module riverWaterQuality
 * @see Streeter & Phelps (1925) USPHS Bull 146
 * @see Chapra (1997) Surface Water Quality Modeling, McGraw-Hill
 * @see Carlson (1977) Limnology & Oceanography 22(2):361-369
 * @see CONAMA Resolução 357/2005
 */

// ---------------------------------------------------------------------------
// 1. streeterPhelpsDoSag - curva de déficit de OD (Streeter & Phelps, 1925)
// ---------------------------------------------------------------------------

interface StreeterPhelpsResult {
    readonly do_mgL: number;
    readonly deficit_mgL: number;
    readonly t_days: number;
    readonly critical_point: boolean;
}

/**
 * Classic Streeter-Phelps dissolved-oxygen sag curve at distance x downstream.
 *
 * Calcula o déficit de oxigênio dissolvido (OD) num ponto x rio abaixo de um
 * lançamento de efluente, usando o modelo clássico de 1925.
 *
 * D(t) = (kd×BOD0)/(kr-kd) × (exp(-kd×t) - exp(-kr×t)) + D0×exp(-kr×t)
 *
 * @param bod0 - BOD inicial após mistura (mg/L)
 * @param do0 - OD inicial após mistura (mg/L)
 * @param doSat - OD de saturação (mg/L)
 * @param kd - taxa de desoxigenação (1/dia)
 * @param kr - taxa de reaeração (1/dia)
 * @param u - velocidade média do rio (m/s → convertida internamente para km/dia)
 * @param x - distância rio abaixo (km)
 * @returns do_mgL, deficit_mgL, t_days, critical_point
 * @throws {RangeError} Se kr === kd (singularidade matemática)
 * @see Streeter & Phelps (1925) USPHS Bull 146
 */
export function streeterPhelpsDoSag(
    bod0: number,
    do0: number,
    doSat: number,
    kd: number,
    kr: number,
    u: number,
    x: number,
): Readonly<StreeterPhelpsResult> {
    if (kr === kd) throw new RangeError('streeterPhelpsDoSag: kr must differ from kd to avoid division by zero');
    if (bod0 < 0) throw new RangeError('streeterPhelpsDoSag: bod0 must be >= 0');
    if (doSat <= 0) throw new RangeError('streeterPhelpsDoSag: doSat must be > 0');
    if (u <= 0) throw new RangeError('streeterPhelpsDoSag: u (velocity) must be > 0');
    if (x < 0) throw new RangeError('streeterPhelpsDoSag: x (distance) must be >= 0');
    if (kd <= 0) throw new RangeError('streeterPhelpsDoSag: kd must be > 0');
    if (kr <= 0) throw new RangeError('streeterPhelpsDoSag: kr must be > 0');

    // Velocidade em km/dia (u em m/s × 86.4)
    const u_km_day = u * 86.4;
    const t = x / u_km_day; // tempo de viagem (dias)

    const D0 = doSat - do0; // déficit inicial

    // Equação de Streeter-Phelps
    const D_t = ((kd * bod0) / (kr - kd)) * (Math.exp(-kd * t) - Math.exp(-kr * t)) + D0 * Math.exp(-kr * t);

    const do_val = doSat - D_t;

    return Object.freeze({
        do_mgL: do_val,
        deficit_mgL: D_t,
        t_days: t,
        critical_point: false,
    });
}

// ---------------------------------------------------------------------------
// 2. criticalDoSag - ponto crítico (mínimo de OD)
// ---------------------------------------------------------------------------

interface CriticalDoSagResult {
    readonly t_critical_days: number;
    readonly do_critical_mgL: number;
    readonly deficit_critical_mgL: number;
    readonly x_critical_km: number | null;
}

/**
 * Find the critical time and minimum dissolved oxygen in the Streeter-Phelps sag.
 *
 * Encontra o ponto de mínimo de OD (momento mais crítico para a vida aquática).
 *
 * t_c = 1/(kr-kd) × ln[ kr/kd × (1 - D0×(kr-kd)/(kd×BOD0)) ]
 *
 * @param bod0 - BOD inicial após mistura (mg/L)
 * @param do0 - OD inicial após mistura (mg/L)
 * @param doSat - OD de saturação (mg/L)
 * @param kd - taxa de desoxigenação (1/dia)
 * @param kr - taxa de reaeração (1/dia)
 * @param u? - velocidade (m/s); se fornecido, calcula x_critical_km
 * @returns t_critical_days, do_critical_mgL, deficit_critical_mgL, x_critical_km
 * @throws {RangeError} Se kr <= kd
 * @see Streeter & Phelps (1925) USPHS Bull 146
 */
export function criticalDoSag(
    bod0: number,
    do0: number,
    doSat: number,
    kd: number,
    kr: number,
    u?: number,
): Readonly<CriticalDoSagResult> {
    if (kr <= kd) throw new RangeError('criticalDoSag: kr must be greater than kd');
    if (bod0 <= 0) throw new RangeError('criticalDoSag: bod0 must be > 0');
    if (doSat <= 0) throw new RangeError('criticalDoSag: doSat must be > 0');
    if (kd <= 0) throw new RangeError('criticalDoSag: kd must be > 0');

    const D0 = doSat - do0;

    // Argumento do logaritmo - precisa ser positivo
    const lnArg = (kr / kd) * (1 - (D0 * (kr - kd)) / (kd * bod0));
    if (lnArg <= 0) throw new RangeError('criticalDoSag: ln argument <= 0 — initial deficit too large for given BOD');

    const t_c = (1 / (kr - kd)) * Math.log(lnArg);
    if (t_c < 0) throw new RangeError('criticalDoSag: critical time is negative — check input parameters');

    // Déficit crítico: D_c = kd×BOD0/kr × exp(-kd×t_c)
    const D_c = ((kd * bod0) / kr) * Math.exp(-kd * t_c);
    const do_c = doSat - D_c;

    // Distância crítica (km) se velocidade fornecida
    let x_critical_km: number | null = null;
    if (u != null && u > 0) {
        x_critical_km = t_c * u * 86.4; // km = dias × km/dia
    }

    return Object.freeze({
        t_critical_days: t_c,
        do_critical_mgL: do_c,
        deficit_critical_mgL: D_c,
        x_critical_km,
    });
}

// ---------------------------------------------------------------------------
// 3. reaeractionCoefficient - coeficiente de reaeração atmosférica
// ---------------------------------------------------------------------------

type ReaerationModel = 'OConnorDobbins' | 'OGE' | 'OwenGibbsEdwards' | 'Churchill';

interface ReaerationCoefficientResult {
    readonly kr_per_day: number;
    readonly model: string;
    readonly depth_m: number;
    readonly velocity_m_s: number;
}

/**
 * Compute reaeration coefficient from hydraulic geometry using empirical models.
 *
 * Calcula o coeficiente de reaeração (kr) a partir da profundidade e velocidade
 * do rio, usando modelos empíricos calibrados para rios naturais.
 *
 * @param depth - profundidade média (m)
 * @param velocity - velocidade média (m/s)
 * @param model - modelo a usar
 * @returns kr_per_day, model, depth_m, velocity_m_s
 * @throws {RangeError} Se depth <= 0 ou velocity <= 0
 * @see OConnor & Dobbins (1958) Trans. ASCE
 * @see Chapra (1997) Surface Water Quality Modeling Table 5.1
 */
export function reaeractionCoefficient(
    depth: number,
    velocity: number,
    model: ReaerationModel = 'OConnorDobbins',
): Readonly<ReaerationCoefficientResult> {
    if (depth <= 0) throw new RangeError('reaeractionCoefficient: depth must be > 0');
    if (velocity <= 0) throw new RangeError('reaeractionCoefficient: velocity must be > 0');

    let kr: number;
    if (model === 'OConnorDobbins') {
        // OConnor & Dobbins (1958): kr = 3.93 × u^0.5 / H^1.5
        kr = (3.93 * Math.pow(velocity, 0.5)) / Math.pow(depth, 1.5);
    } else if (model === 'OGE' || model === 'OwenGibbsEdwards') {
        // Owen-Gibbs-Edwards (1964): kr = 5.32 × u^0.67 / H^1.85
        kr = (5.32 * Math.pow(velocity, 0.67)) / Math.pow(depth, 1.85);
    } else if (model === 'Churchill') {
        // Churchill (1962): kr = 5.026 × u^0.969 / H^1.673
        kr = (5.026 * Math.pow(velocity, 0.969)) / Math.pow(depth, 1.673);
    } else {
        throw new RangeError(
            `reaeractionCoefficient: unknown model "${model}". Use 'OConnorDobbins', 'OGE', or 'Churchill'`,
        );
    }

    return Object.freeze({ kr_per_day: kr, model, depth_m: depth, velocity_m_s: velocity });
}

// ---------------------------------------------------------------------------
// 4. bodTemperatureCorrection - correção de DBO e OD saturação por temperatura
// ---------------------------------------------------------------------------

interface BodTemperatureCorrectionResult {
    readonly kd_corrected: number;
    readonly doSat_mgL: number;
    readonly theta: number;
}

/**
 * Correct BOD decay rate and DO saturation for temperature.
 *
 * Corrige a taxa de decaimento da DBO e a saturação de OD para a temperatura
 * do campo usando a fórmula de van't Hoff-Arrhenius (θ=1.047) e
 * Benson-Krause (1984) para saturação.
 *
 * @param bod_20c - taxa kd a 20°C (1/dia)
 * @param temperature - temperatura da água (°C)
 * @returns kd_corrected, doSat_mgL, theta
 * @throws {RangeError} Se temperatura < 0 ou > 40
 * @see Chapra (1997) Eq. 2.3; Benson & Krause (1984) Limnol. Oceanogr.
 */
export function bodTemperatureCorrection(
    bod_20c: number,
    temperature: number,
): Readonly<BodTemperatureCorrectionResult> {
    if (temperature < 0 || temperature > 40)
        throw new RangeError('bodTemperatureCorrection: temperature must be 0–40°C');
    if (bod_20c <= 0) throw new RangeError('bodTemperatureCorrection: bod_20c must be > 0');

    const theta = 1.047;
    // Correção de van't Hoff-Arrhenius: k_T = k_20 × θ^(T-20)
    const kd_corrected = bod_20c * Math.pow(theta, temperature - 20);

    // Saturação de OD pela fórmula simplificada de Benson-Krause (1984)
    // DoSat = 468 / (31.6 + T)  [mg/L, água doce, pressão 1 atm]
    const doSat_mgL = 468 / (31.6 + temperature);

    return Object.freeze({ kd_corrected, doSat_mgL, theta });
}

// ---------------------------------------------------------------------------
// 5. streamDilutionMixing - diluição por mistura completa
// ---------------------------------------------------------------------------

interface StreamDilutionMixingResult {
    readonly c_mixed: number;
    readonly q_total: number;
    readonly dilution_factor: number;
}

/**
 * Compute complete-mixing dilution of an effluent in a stream.
 *
 * Calcula a concentração resultante da mistura completa de um efluente com
 * o corpo receptor (balanço de massa simples).
 *
 * c_mix = (q_s×c_s + q_e×c_e) / (q_s + q_e)
 *
 * @param q_stream - vazão do rio (m³/s)
 * @param c_stream - concentração no rio (mg/L ou qualquer unidade)
 * @param q_effluent - vazão do efluente (m³/s)
 * @param c_effluent - concentração no efluente (mesma unidade)
 * @returns c_mixed, q_total, dilution_factor
 * @throws {RangeError} Se vazões forem negativas ou nulas
 * @see Chapra (1997) Surface Water Quality Modeling Eq. 3.1
 */
export function streamDilutionMixing(
    q_stream: number,
    c_stream: number,
    q_effluent: number,
    c_effluent: number,
): Readonly<StreamDilutionMixingResult> {
    if (q_stream < 0) throw new RangeError('streamDilutionMixing: q_stream must be >= 0');
    if (q_effluent <= 0) throw new RangeError('streamDilutionMixing: q_effluent must be > 0');
    if (c_stream < 0) throw new RangeError('streamDilutionMixing: c_stream must be >= 0');
    if (c_effluent < 0) throw new RangeError('streamDilutionMixing: c_effluent must be >= 0');

    const q_total = q_stream + q_effluent;
    const c_mixed = (q_stream * c_stream + q_effluent * c_effluent) / q_total;
    const dilution_factor = q_stream / q_effluent;

    return Object.freeze({ c_mixed, q_total, dilution_factor });
}

// ---------------------------------------------------------------------------
// 6. trophicStateIndex - índice de estado trófico (Carlson, 1977)
// ---------------------------------------------------------------------------

type TsiParameter = 'SD' | 'Chl' | 'TP';

interface TrophicStateIndexResult {
    readonly tsi: number;
    readonly trophic_state: string;
}

/**
 * Carlson Trophic State Index from Secchi depth, chlorophyll-a, or total phosphorus.
 *
 * Classifica o estado trófico do corpo d'água a partir de transparência (disco
 * de Secchi), clorofila-a ou fósforo total usando o índice de Carlson (1977).
 *
 * @param parameter - parâmetro: 'SD' (m), 'Chl' (µg/L), 'TP' (µg/L)
 * @param value - valor medido na unidade correspondente
 * @returns tsi e trophic_state
 * @throws {RangeError} Se parâmetro inválido ou valor <= 0
 * @see Carlson (1977) Limnology & Oceanography 22(2):361-369
 */
export function trophicStateIndex(parameter: TsiParameter, value: number): Readonly<TrophicStateIndexResult> {
    if (value <= 0) throw new RangeError('trophicStateIndex: value must be > 0');

    let tsi: number;
    if (parameter === 'SD') {
        // TSI(SD) = 60 - 14.41×ln(SD_m)
        tsi = 60 - 14.41 * Math.log(value);
    } else if (parameter === 'Chl') {
        // TSI(Chl) = 9.81×ln(chl_µg/L) + 30.6
        tsi = 9.81 * Math.log(value) + 30.6;
    } else if (parameter === 'TP') {
        // TSI(TP) = 14.42×ln(tp_µg/L) + 4.15
        tsi = 14.42 * Math.log(value) + 4.15;
    } else {
        throw new RangeError(`trophicStateIndex: unknown parameter "${parameter}". Use 'SD', 'Chl', or 'TP'`);
    }

    // Classificação: <40 oligotrófico, 40-50 mesotrófico, 50-70 eutrófico, >70 hipereutrófico
    let trophic_state: string;
    if (tsi < 40) trophic_state = 'oligotrophic';
    else if (tsi < 50) trophic_state = 'mesotrophic';
    else if (tsi < 70) trophic_state = 'eutrophic';
    else trophic_state = 'hypereutrophic';

    return Object.freeze({ tsi, trophic_state });
}

// ---------------------------------------------------------------------------
// 7. nitrogenOxygenDemand - demanda nitrogenada de oxigênio
// ---------------------------------------------------------------------------

interface NitrogenOxygenDemandResult {
    readonly nbod_mgL: number;
    readonly cbod_ultimate_estimate: number | null;
    readonly total_od: number;
}

/**
 * Compute nitrogenous BOD and total oxygen demand from TKN and NOx.
 *
 * Calcula a demanda de oxigênio nitrogenada (NBOD) a partir do nitrogênio
 * Kjeldahl total (TKN) e a DBO carbonácea última a partir da DBO5.
 *
 * NBOD = 4.57 × (TKN - NOx)  [g O₂/g N]
 *
 * @param tkn - nitrogênio Kjeldahl total (mg/L N)
 * @param nox - nitrogênio oxidado (nitrato+nitrito, mg/L N)
 * @param bod5? - DBO5 (mg/L); se fornecido, estima CBOD última
 * @param kd - taxa de decaimento DBO (1/dia); padrão 0.23
 * @returns nbod_mgL, cbod_ultimate_estimate, total_od
 * @throws {RangeError} Se TKN < NOx (mais oxidado do que Kjeldahl - impossível)
 * @see Chapra (1997) Surface Water Quality Modeling Chapter 21
 */
export function nitrogenOxygenDemand(
    tkn: number,
    nox: number,
    bod5?: number,
    kd = 0.23,
): Readonly<NitrogenOxygenDemandResult> {
    if (tkn < 0) throw new RangeError('nitrogenOxygenDemand: TKN must be >= 0');
    if (nox < 0) throw new RangeError('nitrogenOxygenDemand: NOx must be >= 0');
    if (nox > tkn) throw new RangeError('nitrogenOxygenDemand: NOx cannot exceed TKN');

    // Nitrogênio disponível para nitrificação: TKN_oxidável = TKN - NOx
    const n_available = tkn - nox;
    const nbod_mgL = 4.57 * n_available;

    // DBO carbonácea última: BOD_u = BOD5 / (1 - exp(-k×5))
    let cbod_ultimate_estimate: number | null = null;
    if (bod5 != null && bod5 >= 0) {
        cbod_ultimate_estimate = bod5 / (1 - Math.exp(-kd * 5));
    }

    const total_od = nbod_mgL + (cbod_ultimate_estimate ?? 0);

    return Object.freeze({ nbod_mgL, cbod_ultimate_estimate, total_od });
}

// ---------------------------------------------------------------------------
// 8. phosphorusLoadReduction - modelo de Vollenweider (1976)
// ---------------------------------------------------------------------------

interface PhosphorusLoadReductionResult {
    readonly loading_current: number;
    readonly loading_target: number;
    readonly reduction_fraction: number;
    readonly c_predicted_mgL: number;
}

/**
 * Simplified Vollenweider phosphorus loading model for lakes/reservoirs.
 *
 * Estima a fração de redução de carga de fósforo necessária para atingir
 * uma concentração-alvo no corpo d'água, usando o modelo de Vollenweider (1976).
 *
 * @param loading_kgyr - carga atual de fósforo (kg/ano)
 * @param q_m3yr - vazão de saída (m³/ano)
 * @param c_target_mgL - concentração-alvo de P (mg/L)
 * @returns loading_current, loading_target, reduction_fraction, c_predicted_mgL
 * @throws {RangeError} Se cargas ou vazão forem <= 0
 * @see Vollenweider (1976) J. Fish. Res. Board Can. 33(6):1195-1207
 */
export function phosphorusLoadReduction(
    loading_kgyr: number,
    q_m3yr: number,
    c_target_mgL: number,
): Readonly<PhosphorusLoadReductionResult> {
    if (loading_kgyr <= 0) throw new RangeError('phosphorusLoadReduction: loading_kgyr must be > 0');
    if (q_m3yr <= 0) throw new RangeError('phosphorusLoadReduction: q_m3yr must be > 0');
    if (c_target_mgL <= 0) throw new RangeError('phosphorusLoadReduction: c_target_mgL must be > 0');

    // Concentração prevista: c = L/Q  (balanço de massa simplificado)
    // L em g/m³ = kg/m³ × 1000 = (kg/ano) / (m³/ano) × 1e6 µg/L = mg/m³
    // c (mg/L) = loading_kgyr (kg/ano) × 1e6 (µg/kg) / q_m3yr (m³/ano) / 1000 (L/m³)
    const c_predicted_mgL = (loading_kgyr * 1e6) / (q_m3yr * 1000);

    // Carga-alvo: loading_target = c_target × Q
    const loading_target = (c_target_mgL * q_m3yr * 1000) / 1e6; // kg/ano

    // Fração de redução necessária
    const reduction_fraction = Math.max(0, (loading_kgyr - loading_target) / loading_kgyr);

    return Object.freeze({
        loading_current: loading_kgyr,
        loading_target,
        reduction_fraction,
        c_predicted_mgL,
    });
}

// ---------------------------------------------------------------------------
// 9. sedimentOxygenDemand - demanda de oxigênio dos sedimentos (SOD)
// ---------------------------------------------------------------------------

interface SedimentOxygenDemandResult {
    readonly depletion_rate_mgL_day: number;
    readonly days_to_2mgL: number;
    readonly volume_m3: number;
}

/**
 * Compute dissolved oxygen depletion rate from sediment oxygen demand.
 *
 * Calcula a taxa de consumo de OD na coluna d'água causado pela demanda
 * de oxigênio nos sedimentos (SOD), típico de rios com acúmulo de matéria orgânica.
 *
 * dDO/dt = -SOD × A / (V × 1000)  [mg/L/dia]
 *
 * @param sod - demanda de oxigênio do sedimento (g/m²/dia)
 * @param area_m2 - área do fundo (m²)
 * @param depth_m - profundidade média (m)
 * @param _flow_m3s - vazão (m³/s); usada para calcular volume dinâmico se > 0
 * @returns depletion_rate_mgL_day, days_to_2mgL, volume_m3
 * @throws {RangeError} Se SOD, área ou profundidade forem <= 0
 * @see Chapra (1997) Surface Water Quality Modeling Chapter 22
 * @see USEPA (2000) Nutrient Criteria Technical Guidance Manual
 */
export function sedimentOxygenDemand(
    sod: number,
    area_m2: number,
    depth_m: number,
    _flow_m3s: number,
): Readonly<SedimentOxygenDemandResult> {
    if (sod <= 0) throw new RangeError('sedimentOxygenDemand: sod must be > 0');
    if (area_m2 <= 0) throw new RangeError('sedimentOxygenDemand: area_m2 must be > 0');
    if (depth_m <= 0) throw new RangeError('sedimentOxygenDemand: depth_m must be > 0');

    // Volume do trecho (m³)
    const volume_m3 = area_m2 * depth_m;

    // Taxa de depleção: dDO/dt = SOD × A / V  [g/m²/dia × m² / m³ = g/m³/dia = mg/L/dia]
    const depletion_rate_mgL_day = (sod * area_m2) / volume_m3; // = sod / depth_m

    // Dias para atingir 2 mg/L a partir de OD saturado a 20°C (~9.1 mg/L)
    const do_initial = 9.1; // mg/L — saturação típica a 20°C
    const do_critical = 2.0; // mg/L — limiar de hipóxia grave
    const days_to_2mgL = depletion_rate_mgL_day > 0 ? (do_initial - do_critical) / depletion_rate_mgL_day : Infinity;

    return Object.freeze({ depletion_rate_mgL_day, days_to_2mgL, volume_m3 });
}

// ---------------------------------------------------------------------------
// 10. waterQualityComplianceCheck - verificação CONAMA 357/2005 Classe II
// ---------------------------------------------------------------------------

interface WaterQualityStandards {
    readonly do_min_mgL?: number;
    readonly turbidity_max_ntu?: number;
    readonly ph_min?: number;
    readonly ph_max?: number;
    readonly temp_max_c?: number;
}

interface ViolationEntry {
    readonly parameter: string;
    readonly value: number;
    readonly standard: string;
    readonly exceeded_by: number;
}

interface WaterQualityComplianceResult {
    readonly compliant: boolean;
    readonly violations: readonly Readonly<ViolationEntry>[];
}

/**
 * Check water quality parameters against CONAMA 357/2005 Class II standards.
 *
 * Verifica se os parâmetros medidos atendem aos padrões mínimos de qualidade
 * da água estabelecidos pelo CONAMA 357/2005 para rios de Classe II
 * (uso para abastecimento após tratamento convencional, irrigação, recreação).
 *
 * Padrões padrão (Classe II):
 *   - OD >= 5 mg/L
 *   - Turbidez <= 100 NTU
 *   - pH 6–9
 *   - Temperatura <= 30°C
 *
 * @param do_mgL - oxigênio dissolvido medido (mg/L)
 * @param turbidity_ntu - turbidez medida (NTU)
 * @param ph - pH medido (adimensional)
 * @param temperature_c - temperatura medida (°C)
 * @param standards - padrões customizados (sobrepõe CONAMA defaults)
 * @returns compliant e violations
 * @see CONAMA Resolução 357/2005 Artigo 15 (Classe II)
 * @see USEPA Water Quality Standards Handbook (2014)
 */
export function waterQualityComplianceCheck(
    do_mgL: number,
    turbidity_ntu: number,
    ph: number,
    temperature_c: number,
    standards: WaterQualityStandards = {},
): Readonly<WaterQualityComplianceResult> {
    const std = {
        do_min_mgL: standards.do_min_mgL ?? 5,
        turbidity_max_ntu: standards.turbidity_max_ntu ?? 100,
        ph_min: standards.ph_min ?? 6,
        ph_max: standards.ph_max ?? 9,
        temp_max_c: standards.temp_max_c ?? 30,
    };

    const violations: ViolationEntry[] = [];

    if (do_mgL < std.do_min_mgL) {
        violations.push({
            parameter: 'DO',
            value: do_mgL,
            standard: `>= ${std.do_min_mgL} mg/L`,
            exceeded_by: std.do_min_mgL - do_mgL,
        });
    }
    if (turbidity_ntu > std.turbidity_max_ntu) {
        violations.push({
            parameter: 'turbidity',
            value: turbidity_ntu,
            standard: `<= ${std.turbidity_max_ntu} NTU`,
            exceeded_by: turbidity_ntu - std.turbidity_max_ntu,
        });
    }
    if (ph < std.ph_min) {
        violations.push({
            parameter: 'pH',
            value: ph,
            standard: `>= ${std.ph_min}`,
            exceeded_by: std.ph_min - ph,
        });
    }
    if (ph > std.ph_max) {
        violations.push({
            parameter: 'pH',
            value: ph,
            standard: `<= ${std.ph_max}`,
            exceeded_by: ph - std.ph_max,
        });
    }
    if (temperature_c > std.temp_max_c) {
        violations.push({
            parameter: 'temperature',
            value: temperature_c,
            standard: `<= ${std.temp_max_c} °C`,
            exceeded_by: temperature_c - std.temp_max_c,
        });
    }

    return Object.freeze({
        compliant: violations.length === 0,
        violations: Object.freeze(violations.map((v) => Object.freeze(v))),
    });
}

console.debug('[riverwq:end]', 'app/js/core/simulation/solvers/riverWaterQuality.js');
