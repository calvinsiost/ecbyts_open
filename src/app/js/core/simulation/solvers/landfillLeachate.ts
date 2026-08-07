// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

console.debug('[leachate:load]', 'app/js/core/simulation/solvers/landfillLeachate.js');

/**
 * Landfill Leachate Generation and Migration Solver
 *
 * Módulo de matemática pura para geração e migração de lixiviado em aterros sanitários.
 * Sem dependências de DOM, IDB, Three.js ou fetch - importável no Node.js sem efeitos colaterais.
 *
 * Implements:
 *  - Water balance leachate generation (Fenn et al. 1975)
 *  - Rational method peak flow (Mulvaney 1851)
 *  - Liner breakthrough time via Darcy (Giroud et al. 1992)
 *  - Composite liner leakage Giroud-Bonaparte (1989)
 *  - RCRA mass balance concentration (USEPA 2003)
 *  - Cap infiltration rate (USEPA 1989)
 *  - Biochemical methane potential (Owen et al. 1979)
 *  - Organic loading rate / HRT (Metcalf & Eddy 2014)
 *  - Ogata-Banks 1D ADE with retardation (1961)
 *  - TCLP hazardous waste classification (RCRA 40 CFR Part 261)
 *
 * Academic references:
 *  - Fenn et al. (1975) "Guidance Manual on Treatment of Leachate" EPA-600/2-75-023
 *  - Mulvaney (1851) "On the use of self-registering rain and flood gauges" Trans. Inst. Civil Eng. Ireland 4:1–8
 *  - Giroud et al. (1992) "Leakage through Liners Constructed with Geomembranes" Geotextiles and Geomembranes 11(4):337–354
 *  - Giroud & Bonaparte (1989) "Leakage through Liners Constructed with Geomembranes" Geotextiles and Geomembranes 8(1):27–67
 *  - Buswell & Mueller (1952) "Mechanisms of Methane Fermentation" Ind. Eng. Chem. 44(3):550–552
 *  - Owen et al. (1979) "Bioassay for Monitoring Biochemical Methane Potential" Water Research 13:485–492 DOI:10.1016/0043-1354(79)90345-5
 *  - Metcalf & Eddy (2014) "Wastewater Engineering: Treatment and Resource Recovery" 5th ed. McGraw-Hill
 *  - Ogata & Banks (1961) "A Solution of the Differential Equation of Longitudinal Dispersion in Porous Media" USGS Prof. Paper 411-A
 *  - USEPA RCRA (2003) "Waste Characterization" 40 CFR Part 261 Appendix II
 *  - USEPA (1989) "Technical Guidance Document on Soil Cover Systems" EPA/530-SW-89-047
 */

// ---------------------------------------------------------------------------
// Erfc approximation (Abramowitz & Stegun §7.1.26)
// ---------------------------------------------------------------------------

/**
 * Complementary error function approximation (A&S 7.1.26).
 * Aproximação da função erfc com erro máximo 1.5×10⁻⁷.
 * @param x
 * @returns
 */
function erfc(x: number): number {
    // Lidar com valores negativos: erfc(-x) = 2 - erfc(x)
    if (x < 0) return 2 - erfc(-x);
    const t = 1 / (1 + 0.3275911 * x);
    const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    return poly * Math.exp(-x * x);
}

// ---------------------------------------------------------------------------
// 1. leachateGenerationRate
// ---------------------------------------------------------------------------

interface LeachateGenerationResult {
    leachate_m3_yr: number;
    water_balance_mm_yr: number;
    area_m2: number;
}

/**
 * Water balance leachate generation rate (Fenn et al. 1975).
 *
 * Balanço hídrico simplificado: lixiviado = (precipitação - evapotranspiração) × área × (1 - escoamento superficial).
 *
 * L = (P - ET) × A × (1 - C_runoff) / 1000  [m³/yr]
 *
 * @param precipitation_mm_yr  - Precipitação anual (mm/ano)
 * @param area_m2              - Área da célula de aterro (m²)
 * @param runoffCoefficient          - Coeficiente de escoamento superficial (adimensional)
 * @param evapotranspiration_mm_yr   - Evapotranspiração anual (mm/ano)
 * @returns
 * @throws RangeError Se entradas forem inválidas
 */
export function leachateGenerationRate(
    precipitation_mm_yr: number,
    area_m2: number,
    runoffCoefficient: number = 0.3,
    evapotranspiration_mm_yr: number = 500,
): LeachateGenerationResult {
    if (!Number.isFinite(precipitation_mm_yr) || precipitation_mm_yr < 0)
        throw new RangeError('precipitation_mm_yr must be a non-negative number');
    if (!Number.isFinite(area_m2) || area_m2 <= 0) throw new RangeError('area_m2 must be a positive number');
    if (!Number.isFinite(runoffCoefficient) || runoffCoefficient < 0 || runoffCoefficient > 1)
        throw new RangeError('runoffCoefficient must be in [0, 1]');
    if (!Number.isFinite(evapotranspiration_mm_yr) || evapotranspiration_mm_yr < 0)
        throw new RangeError('evapotranspiration_mm_yr must be a non-negative number');

    // Balanço hídrico efetivo: precipitação menos evapotranspiração (mm/ano)
    const water_balance_mm_yr = precipitation_mm_yr - evapotranspiration_mm_yr;

    // Lixiviado gerado: apenas precipitação líquida penetra após escoamento superficial
    // Divisão por 1000 converte mm para metros; multiplicando por área resulta em m³
    const leachate_m3_yr = (Math.max(0, water_balance_mm_yr) * area_m2 * (1 - runoffCoefficient)) / 1000;

    return Object.freeze({ leachate_m3_yr, water_balance_mm_yr, area_m2 });
}

// ---------------------------------------------------------------------------
// 2. rationalMethodLeachate
// ---------------------------------------------------------------------------

interface RationalMethodResult {
    peak_flow_m3s: number;
    peak_flow_Ls: number;
    intensity_mm_hr: number;
}

/**
 * Peak leachate flow via rational method (Mulvaney 1851).
 *
 * Vazão de pico: Q = C × i × A / 360 000  [m³/s]
 * Onde i está em mm/hr e A em m². Fator 360 000 = 3.6 × 10⁵ (conversão de unidades).
 *
 * @param precipitation_mm_hr  - Intensidade de precipitação de projeto (mm/hr)
 * @param catchment_area_m2    - Área de contribuição (m²)
 * @param runoffCoeff          - Coeficiente de escoamento (adimensional, 0–1)
 * @returns
 * @throws RangeError
 */
export function rationalMethodLeachate(
    precipitation_mm_hr: number,
    catchment_area_m2: number,
    runoffCoeff: number,
): RationalMethodResult {
    if (!Number.isFinite(precipitation_mm_hr) || precipitation_mm_hr < 0)
        throw new RangeError('precipitation_mm_hr must be a non-negative number');
    if (!Number.isFinite(catchment_area_m2) || catchment_area_m2 <= 0)
        throw new RangeError('catchment_area_m2 must be a positive number');
    if (!Number.isFinite(runoffCoeff) || runoffCoeff < 0 || runoffCoeff > 1)
        throw new RangeError('runoffCoeff must be in [0, 1]');

    // Fórmula racional: Q(m³/s) = C × i(mm/hr) × A(m²) / 360000
    // 1 mm/hr × 1 m² = 1e-3 m/hr × 1 m² = 1e-3 / 3600 m³/s = 1/3.6e6 m³/s per hectare equiv
    const peak_flow_m3s = (runoffCoeff * precipitation_mm_hr * catchment_area_m2) / 3.6e6;
    const peak_flow_Ls = peak_flow_m3s * 1000;

    return Object.freeze({ peak_flow_m3s, peak_flow_Ls, intensity_mm_hr: precipitation_mm_hr });
}

// ---------------------------------------------------------------------------
// 3. linerBreakthroughTime
// ---------------------------------------------------------------------------

interface LinerBreakthroughResult {
    breakthrough_years: number;
    darcy_velocity_m_s: number;
    liner_thickness_m: number;
}

/**
 * Liner breakthrough time via Darcy's law (Giroud et al. 1992).
 *
 * Velocidade de Darcy: v = K × i  [m/s]
 * Tempo de breakthrough: t = L × n / v  [anos]
 *
 * @param liner_thickness_m          - Espessura da camada impermeabilizante (m)
 * @param hydraulic_conductivity_m_s - Condutividade hidráulica (m/s)
 * @param gradient             - Gradiente hidráulico (adimensional)
 * @param porosity             - Porosidade efetiva da liner (adimensional)
 * @returns
 * @throws RangeError
 */
export function linerBreakthroughTime(
    liner_thickness_m: number,
    hydraulic_conductivity_m_s: number,
    gradient: number = 1.0,
    porosity: number = 0.3,
): LinerBreakthroughResult {
    if (!Number.isFinite(liner_thickness_m) || liner_thickness_m <= 0)
        throw new RangeError('liner_thickness_m must be a positive number');
    if (!Number.isFinite(hydraulic_conductivity_m_s) || hydraulic_conductivity_m_s <= 0)
        throw new RangeError('hydraulic_conductivity_m_s must be a positive number');
    if (!Number.isFinite(gradient) || gradient <= 0) throw new RangeError('gradient must be a positive number');
    if (!Number.isFinite(porosity) || porosity <= 0 || porosity >= 1)
        throw new RangeError('porosity must be in (0, 1)');

    // Velocidade de Darcy (fluxo total por unidade de área)
    const darcy_velocity_m_s = hydraulic_conductivity_m_s * gradient;

    // Velocidade de poro: v_pore = v_darcy / n
    // Tempo de breakthrough em segundos: t = L / v_pore = L × n / v_darcy
    const seconds_per_year = 365.25 * 24 * 3600;
    const breakthrough_s = (liner_thickness_m * porosity) / darcy_velocity_m_s;
    const breakthrough_years = breakthrough_s / seconds_per_year;

    return Object.freeze({ breakthrough_years, darcy_velocity_m_s, liner_thickness_m });
}

// ---------------------------------------------------------------------------
// 4. compositeLinnerLeakage
// ---------------------------------------------------------------------------

interface CompositeLinnerLeakageResult {
    leakage_m3_day: number;
    leakage_per_defect_m3_day: number;
    n_defects: number;
}

/**
 * Composite liner leakage via Giroud-Bonaparte equation (1989).
 *
 * Vazão por defeito: Q = 0.21 × a^0.1 × h^0.9 × K_soil^0.74
 * Onde a = área do defeito (m²), h = carga hidráulica (m), K_soil = condutividade da argila (m/s).
 *
 * @param head_m               - Carga hidráulica sobre a geomembrana (m)
 * @param geomembrane_area_m2  - Área total da geomembrana (m²)
 * @param defect_radius_m       - Raio do defeito circular (m), padrão 5 mm
 * @param n_defects_per_ha          - Número de defeitos por hectare
 * @param k_soil_m_s             - Condutividade da argila compactada (m/s)
 * @returns
 * @throws RangeError
 */
export function compositeLinnerLeakage(
    head_m: number,
    geomembrane_area_m2: number,
    defect_radius_m: number = 0.005,
    n_defects_per_ha: number = 4,
    k_soil_m_s: number = 1e-9,
): CompositeLinnerLeakageResult {
    if (!Number.isFinite(head_m) || head_m < 0) throw new RangeError('head_m must be a non-negative number');
    if (!Number.isFinite(geomembrane_area_m2) || geomembrane_area_m2 <= 0)
        throw new RangeError('geomembrane_area_m2 must be a positive number');
    if (!Number.isFinite(defect_radius_m) || defect_radius_m <= 0)
        throw new RangeError('defect_radius_m must be a positive number');
    if (!Number.isFinite(n_defects_per_ha) || n_defects_per_ha < 0)
        throw new RangeError('n_defects_per_ha must be a non-negative number');
    if (!Number.isFinite(k_soil_m_s) || k_soil_m_s <= 0) throw new RangeError('k_soil_m_s must be a positive number');

    // Área do defeito circular (m²)
    const a_defect = Math.PI * defect_radius_m * defect_radius_m;

    // Número total de defeitos (proporcional à área da geomembrana)
    const n_defects = n_defects_per_ha * (geomembrane_area_m2 / 10000);

    // Vazão por defeito (m³/s) - equação de Giroud-Bonaparte (1989)
    // Q = 0.21 × a^0.1 × h^0.9 × K^0.74
    const seconds_per_day = 86400;
    let q_per_defect_m3s = 0;
    if (head_m > 0) {
        q_per_defect_m3s = 0.21 * Math.pow(a_defect, 0.1) * Math.pow(head_m, 0.9) * Math.pow(k_soil_m_s, 0.74);
    }

    const leakage_per_defect_m3_day = q_per_defect_m3s * seconds_per_day;
    const leakage_m3_day = leakage_per_defect_m3_day * n_defects;

    return Object.freeze({ leakage_m3_day, leakage_per_defect_m3_day, n_defects });
}

// ---------------------------------------------------------------------------
// 5. rcraLeachateConcentration
// ---------------------------------------------------------------------------

interface RcraLeachateConcentrationResult {
    concentration_mg_L: number;
    mass_mg: number;
    daf_applied: boolean;
}

/**
 * RCRA leachate concentration via mass balance (USEPA 2003).
 *
 * Balanço de massa: C_lixiviado = (C_resíduo × ρ_resíduo × V_resíduo) / V_lixiviado
 *
 * @param waste_concentration_mg_kg - Concentração no resíduo (mg/kg peso seco)
 * @param waste_density_kg_m3       - Densidade aparente do resíduo (kg/m³)
 * @param leachate_volume_m3        - Volume de lixiviado gerado (m³)
 * @param waste_volume_m3           - Volume de resíduo (m³)
 * @returns
 * @throws RangeError
 */
export function rcraLeachateConcentration(
    waste_concentration_mg_kg: number,
    waste_density_kg_m3: number,
    leachate_volume_m3: number,
    waste_volume_m3: number,
): RcraLeachateConcentrationResult {
    if (!Number.isFinite(waste_concentration_mg_kg) || waste_concentration_mg_kg < 0)
        throw new RangeError('waste_concentration_mg_kg must be a non-negative number');
    if (!Number.isFinite(waste_density_kg_m3) || waste_density_kg_m3 <= 0)
        throw new RangeError('waste_density_kg_m3 must be a positive number');
    if (!Number.isFinite(leachate_volume_m3) || leachate_volume_m3 <= 0)
        throw new RangeError('leachate_volume_m3 must be a positive number');
    if (!Number.isFinite(waste_volume_m3) || waste_volume_m3 <= 0)
        throw new RangeError('waste_volume_m3 must be a positive number');

    // Massa total do contaminante no resíduo (mg)
    const mass_mg = waste_concentration_mg_kg * waste_density_kg_m3 * waste_volume_m3;

    // Concentração no lixiviado (mg/m³ → mg/L dividindo por 1000)
    // 1 m³ = 1000 L
    const concentration_mg_L = mass_mg / (leachate_volume_m3 * 1000);

    return Object.freeze({ concentration_mg_L, mass_mg, daf_applied: false });
}

// ---------------------------------------------------------------------------
// 6. capInfiltrationRate
// ---------------------------------------------------------------------------

interface CapInfiltrationResult {
    infiltration_m_yr: number;
    effectiveness: number;
    cover_conductivity: number;
}

/**
 * Cap infiltration rate through final cover (USEPA 1989).
 *
 * Taxa de infiltração através da cobertura final do aterro.
 * I = K_cap × H_pond + precip × (1 - vegetation_factor) × 0.001  [m/yr]
 * Efetividade: E = 1 - I/P
 *
 * @param precipitation_mm_yr          - Precipitação anual (mm/ano)
 * @param cap_thickness_m              - Espessura da camada de cobertura (m)
 * @param hydraulic_conductivity_cap_m_s - Condutividade hidráulica da cobertura (m/s)
 * @param vegetation_factor       - Fator de redução por vegetação (0–1)
 * @returns
 * @throws RangeError
 */
export function capInfiltrationRate(
    precipitation_mm_yr: number,
    cap_thickness_m: number,
    hydraulic_conductivity_cap_m_s: number,
    vegetation_factor: number = 0.7,
): CapInfiltrationResult {
    if (!Number.isFinite(precipitation_mm_yr) || precipitation_mm_yr < 0)
        throw new RangeError('precipitation_mm_yr must be a non-negative number');
    if (!Number.isFinite(cap_thickness_m) || cap_thickness_m <= 0)
        throw new RangeError('cap_thickness_m must be a positive number');
    if (!Number.isFinite(hydraulic_conductivity_cap_m_s) || hydraulic_conductivity_cap_m_s <= 0)
        throw new RangeError('hydraulic_conductivity_cap_m_s must be a positive number');
    if (!Number.isFinite(vegetation_factor) || vegetation_factor < 0 || vegetation_factor > 1)
        throw new RangeError('vegetation_factor must be in [0, 1]');

    const seconds_per_year = 365.25 * 24 * 3600;

    // Condutividade da cobertura em m/ano
    const k_cap_m_yr = hydraulic_conductivity_cap_m_s * seconds_per_year;

    // Carga piezométrica sobre a cobertura (usamos espessura como proxy conservador)
    const h_pond_m = cap_thickness_m;

    // Parcela de percolação através da cobertura (lei de Darcy)
    const darcy_component_m_yr = k_cap_m_yr * h_pond_m;

    // Parcela de precipitação direta (não interceptada pela vegetação)
    const precip_component_m_yr = (precipitation_mm_yr * (1 - vegetation_factor)) / 1000;

    const infiltration_m_yr = darcy_component_m_yr + precip_component_m_yr;

    // Precipitação em metros/ano
    const precip_m_yr = precipitation_mm_yr / 1000;

    // Efetividade: fração da precipitação que NÃO infiltra
    const effectiveness = precip_m_yr > 0 ? Math.max(0, Math.min(1, 1 - infiltration_m_yr / precip_m_yr)) : 0;

    return Object.freeze({
        infiltration_m_yr,
        effectiveness,
        cover_conductivity: hydraulic_conductivity_cap_m_s,
    });
}

// ---------------------------------------------------------------------------
// 7. methanePotential
// ---------------------------------------------------------------------------

interface MethanePotentialResult {
    methane_m3_per_m3_leachate: number;
    energy_MJ_per_m3: number;
    methane_yield: number;
}

/**
 * Biochemical methane potential (BMP) from leachate (Owen et al. 1979).
 *
 * Potencial bioquímico de metano: V_CH4 = rendimento × SSV × V_reator
 * Recuperação de energia: E = V_CH4 × 35.8 MJ/m³
 *
 * @param vss_g_L        - Sólidos suspensos voláteis do lixiviado (g/L = kg/m³)
 * @param bod_g_L        - Demanda bioquímica de oxigênio (g/L)
 * @param methane_yield - Rendimento de metano (m³ CH4/g SSV, padrão 0.35)
 * @returns
 * @throws RangeError
 */
export function methanePotential(vss_g_L: number, bod_g_L: number, methane_yield: number = 0.35): MethanePotentialResult {
    if (!Number.isFinite(vss_g_L) || vss_g_L < 0) throw new RangeError('vss_g_L must be a non-negative number');
    if (!Number.isFinite(bod_g_L) || bod_g_L < 0) throw new RangeError('bod_g_L must be a non-negative number');
    if (!Number.isFinite(methane_yield) || methane_yield <= 0)
        throw new RangeError('methane_yield must be a positive number');

    // Produção de metano por m³ de lixiviado (m³ CH4/m³ lixiviado)
    // VSS em g/L = g/L × 1000 L/m³ = g/m³ × 1e-3 kg/g = g/m³
    // V_CH4 = methane_yield (m³/g_SSV) × vss (g/L) × 1000 (L/m³)
    // eslint-disable-next-line
    const methane_m3_per_m3_leachate = (methane_yield * vss_g_L * 1000) / 1000;
    // Simplificado: methane_yield (m³ CH4 / g SSV) × vss_g_L (g/L) = m³ CH4 / L
    // Para m³ lixiviado: × 1000 L/m³
    // Reescrevendo: yield_m3_per_g × vss_g_L (g/L) × 1000 (L/m³) / 1000 (normaliza a m³)
    // = yield_m3_per_g × vss_g_L
    // Porém yield padrão 0.35 L CH4/g SSV → converter para m³: 0.35e-3 m³/g
    // Usaremos a convenção Owen (1979): yield em L/g → m³/m³ leachate = yield_L_g × vss_g_L
    const methane_m3_m3 = (methane_yield / 1000) * vss_g_L * 1000; // = methane_yield × vss_g_L

    // Energia contida no metano: 35.8 MJ/m³ CH4 (poder calorífico inferior)
    const energy_MJ_per_m3 = methane_m3_m3 * 35.8;

    return Object.freeze({
        methane_m3_per_m3_leachate: methane_m3_m3,
        energy_MJ_per_m3,
        methane_yield,
    });
}

// ---------------------------------------------------------------------------
// 8. organicLoadingRate
// ---------------------------------------------------------------------------

interface OrganicLoadingRateResult {
    olr_kg_m3_day: number;
    hrt_days: number;
    cod_load_kg_day: number;
}

/**
 * Organic loading rate and hydraulic retention time (Metcalf & Eddy 2014).
 *
 * OLR = (DQO × Q) / V  [kg DQO/m³/dia]
 * TRH = V / Q  [dias]
 *
 * @param cod_mg_L       - DQO do lixiviado afluente (mg/L)
 * @param flow_m3_day    - Vazão diária de lixiviado (m³/dia)
 * @param reactor_volume_m3 - Volume do reator biológico (m³)
 * @returns
 * @throws RangeError
 */
export function organicLoadingRate(
    cod_mg_L: number,
    flow_m3_day: number,
    reactor_volume_m3: number,
): OrganicLoadingRateResult {
    if (!Number.isFinite(cod_mg_L) || cod_mg_L < 0) throw new RangeError('cod_mg_L must be a non-negative number');
    if (!Number.isFinite(flow_m3_day) || flow_m3_day <= 0)
        throw new RangeError('flow_m3_day must be a positive number');
    if (!Number.isFinite(reactor_volume_m3) || reactor_volume_m3 <= 0)
        throw new RangeError('reactor_volume_m3 must be a positive number');

    // Carga orgânica diária (kg DQO/dia)
    // cod_mg_L × flow_m3_day × 1000 L/m³ / 1e6 mg/kg = cod_mg_L × flow × 1e-3
    const cod_load_kg_day = cod_mg_L * flow_m3_day * 1e-3;

    // Taxa de aplicação orgânica (kg DQO/m³/dia)
    const olr_kg_m3_day = cod_load_kg_day / reactor_volume_m3;

    // Tempo de retenção hidráulica (dias)
    const hrt_days = reactor_volume_m3 / flow_m3_day;

    return Object.freeze({ olr_kg_m3_day, hrt_days, cod_load_kg_day });
}

// ---------------------------------------------------------------------------
// 9. leachateContaminantMigration
// ---------------------------------------------------------------------------

interface LeachateContaminantMigrationResult {
    concentration_mg_L: number;
    pore_volumes: number;
}

/**
 * 1D advection-dispersion equation with retardation - Ogata-Banks (1961).
 *
 * Migração de contaminante no lixiviado com adsorção (retardamento).
 * R×∂C/∂t = D×∂²C/∂x² - v×∂C/∂x
 *
 * Solução analítica:
 * C(x,t) = (C0/2) × [erfc((R×x - v×t) / (2×sqrt(D×R×t))) + exp(v×x/D) × erfc((R×x + v×t) / (2×sqrt(D×R×t)))]
 *
 * @param concentration_mg_L  - Concentração na fonte (mg/L = C0)
 * @param darcy_v_m_day       - Velocidade de Darcy (m/dia)
 * @param dispersivity_m      - Dispersividade longitudinal (m)
 * @param retardation         - Fator de retardamento R (adimensional, ≥1)
 * @param distance_m          - Distância do ponto de monitoramento (m)
 * @param time_days           - Tempo de simulação (dias)
 * @returns
 * @throws RangeError
 */
export function leachateContaminantMigration(
    concentration_mg_L: number,
    darcy_v_m_day: number,
    dispersivity_m: number,
    retardation: number,
    distance_m: number,
    time_days: number,
): LeachateContaminantMigrationResult {
    if (!Number.isFinite(concentration_mg_L) || concentration_mg_L < 0)
        throw new RangeError('concentration_mg_L must be a non-negative number');
    if (!Number.isFinite(darcy_v_m_day) || darcy_v_m_day <= 0)
        throw new RangeError('darcy_v_m_day must be a positive number');
    if (!Number.isFinite(dispersivity_m) || dispersivity_m <= 0)
        throw new RangeError('dispersivity_m must be a positive number');
    if (!Number.isFinite(retardation) || retardation < 1) throw new RangeError('retardation must be >= 1');
    if (!Number.isFinite(distance_m) || distance_m <= 0) throw new RangeError('distance_m must be a positive number');
    if (!Number.isFinite(time_days) || time_days <= 0) throw new RangeError('time_days must be a positive number');

    // Coeficiente de dispersão mecânica: D = v × alpha_L  [m²/dia]
    const D = darcy_v_m_day * dispersivity_m;
    const v = darcy_v_m_day;
    const R = retardation;
    const x = distance_m;
    const t = time_days;

    // Pore volumes = v×t / (R×x) - número de volumes de poro que passaram pelo ponto
    const pore_volumes = (v * t) / (R * x);

    // Argumento para erfc (termos numerador da solução de Ogata-Banks)
    const sqrt_DRt = Math.sqrt(D * R * t);
    const arg1 = (R * x - v * t) / (2 * sqrt_DRt);
    const arg2 = (R * x + v * t) / (2 * sqrt_DRt);

    // Segundo termo da solução: exp(v×x/D) pode ser numericamente grande - limitar para evitar overflow
    const exp_term = Math.exp(Math.min((v * x) / D, 709)); // 709 ≈ ln(Number.MAX_VALUE)

    const C = (concentration_mg_L / 2) * (erfc(arg1) + exp_term * erfc(arg2));

    // Concentração não pode ser maior que a fonte nem negativa
    const c_clamped = Math.max(0, Math.min(C, concentration_mg_L));

    return Object.freeze({ concentration_mg_L: c_clamped, pore_volumes });
}

// ---------------------------------------------------------------------------
// 10. hazardousWasteClassification
// ---------------------------------------------------------------------------

/**
 * TCLP thresholds per RCRA 40 CFR Part 261 Appendix II.
 * Limites de concentração para classificação de resíduo perigoso (mg/L).
 */
export const TCLP_THRESHOLDS_MG_L: Readonly<Record<string, number>> = Object.freeze({
    arsenic: 5,
    barium: 100,
    cadmium: 1,
    chromium: 5,
    lead: 5,
    mercury: 0.2,
    selenium: 1,
    silver: 5,
});

interface TCLPResultItem {
    constituent: string;
    concentration_mg_L: number;
}

interface TCLPViolation {
    constituent: string;
    measured: number;
    threshold: number;
}

interface HazardousWasteClassificationResult {
    hazardous: boolean;
    violations: ReadonlyArray<TCLPViolation>;
}

/**
 * TCLP hazardous waste classification (RCRA 40 CFR Part 261).
 *
 * Classificação de resíduo perigoso baseada nos resultados do ensaio TCLP.
 * Resíduo é perigoso se qualquer constituinte exceder o limite regulatório.
 *
 * @param tclp_results
 *        - Resultados do ensaio TCLP (constituinte + concentração mg/L)
 * @returns
 * @throws RangeError
 */
export function hazardousWasteClassification(tclp_results: TCLPResultItem[]): HazardousWasteClassificationResult {
    if (!Array.isArray(tclp_results) || tclp_results.length === 0)
        throw new RangeError('tclp_results must be a non-empty array');

    const violations: TCLPViolation[] = [];

    for (const item of tclp_results) {
        if (typeof item.constituent !== 'string' || !Number.isFinite(item.concentration_mg_L))
            throw new RangeError(
                'Each tclp_results item must have constituent (string) and concentration_mg_L (number)',
            );

        const key = item.constituent.toLowerCase().trim();
        const threshold = TCLP_THRESHOLDS_MG_L[key];

        if (threshold !== undefined && item.concentration_mg_L > threshold) {
            violations.push(
                Object.freeze({
                    constituent: item.constituent,
                    measured: item.concentration_mg_L,
                    threshold,
                }),
            );
        }
    }

    return Object.freeze({
        hazardous: violations.length > 0,
        violations: Object.freeze(violations),
    }) as HazardousWasteClassificationResult;
}

console.debug('[leachate:end]', 'app/js/core/simulation/solvers/landfillLeachate.js');
