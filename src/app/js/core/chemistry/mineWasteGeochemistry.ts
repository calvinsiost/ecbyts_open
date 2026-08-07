// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   MINE WASTE GEOCHEMISTRY — Acid-base, oxidation, seepage, AMD risk
   Geoquimica de residuos de mineracao: potencial acido-base, oxidacao
   de pirita, percolacao em barragens, risco de drenagem acida (DAM)

   Pure-math module — no DOM, no IDB, no Three.js, no fetch.
   Todas as funcoes sao puras e importaveis em Node.js sem efeitos colaterais.

   References:
   - Sobek et al. (1978) EPA-600/2-78-054
   - Price (1997) MEND 1.16.1b
   - Williamson & Rimstidt (1994) Geochimica et Cosmochimica Acta 58(24)
   - ICOLD Bulletin 96 (1996)
   - USEPA (1999) Kd Volume I EPA/402-R-99-004A
   - MEND 2.21.4 (Mine Environment Neutral Drainage)
   - Morin & Hutt (1997) Environmental Geochemistry and Mining
   - MEND 2.22.2; 2.22.4
   - Taylor (1937) Journal of the Boston Society of Civil Engineers
   - Renard et al. (1997) USDA AH-703 RUSLE
   - Robertson & Wride (1998) Canadian Geotechnical Journal 35(3)
   ================================================================ */

console.debug('[minewaste:load]', 'app/js/core/chemistry/mineWasteGeochemistry.js');

// ================================================================
// 1. ACID-BASE POTENTIAL (AP/NP)
// Potencial acido-base para classificacao de residuos mineiros
// ================================================================

/**
 * Calculates acid-base potential (AP/NP) for mine waste classification.
 * Calcula o potencial acido-base para classificacao de rejeitos de mineracao.
 *
 * AP = S_total × 31.25  (fator estequiometrico: 1 mol S → 1 mol H2SO4 → 31.25 kg CaCO3/t)
 * NP = (C_carb × 83.33) - (C_org × 5)  (carbonato neutraliza; C organico consome NP)
 *
 * @param {number} total_sulfur_pct - Total sulfur content (% by mass)
 * @param {number} [carbonate_carbon_pct=0] - Carbonate carbon content (% by mass)
 * @param {number} [organic_carbon_pct=0] - Organic carbon content (% by mass)
 * @returns {Readonly<{ap: number, np: number, npap_ratio: number, net_np: number, classification: string}>}
 * @throws {RangeError} if inputs are negative or sulfur > 100
 */
export function acidBasePotential(
    total_sulfur_pct: number,
    carbonate_carbon_pct = 0,
    organic_carbon_pct = 0,
): Readonly<{ ap: number; np: number; npap_ratio: number; net_np: number; classification: string }> {
    if (total_sulfur_pct < 0 || total_sulfur_pct > 100) {
        throw new RangeError(`total_sulfur_pct must be 0-100, got ${total_sulfur_pct}`);
    }
    if (carbonate_carbon_pct < 0 || carbonate_carbon_pct > 100) {
        throw new RangeError(`carbonate_carbon_pct must be 0-100, got ${carbonate_carbon_pct}`);
    }
    if (organic_carbon_pct < 0 || organic_carbon_pct > 100) {
        throw new RangeError(`organic_carbon_pct must be 0-100, got ${organic_carbon_pct}`);
    }

    // Potencial Acido: cada % de S gera 31.25 kg CaCO3/t (Sobek 1978)
    const ap = total_sulfur_pct * 31.25;

    // Potencial de Neutralizacao: carbonato neutraliza, C organico reduce NP
    const np = Math.max(0, carbonate_carbon_pct * 83.33 - organic_carbon_pct * 5);

    // Razao NP:AP - classificacao segundo Price (1997) MEND 1.16.1b
    const npap_ratio = ap > 0 ? np / ap : Infinity;
    const net_np = np - ap;

    // PAG: potencialmente gerador de acido; NAG: nao gerador; uncertain: indeterminado
    let classification: string;
    if (npap_ratio < 1) {
        classification = 'PAG'; // Potentially Acid Generating
    } else if (npap_ratio > 3) {
        classification = 'NAG'; // Non-Acid Generating
    } else {
        classification = 'uncertain'; // Zona de incerteza (1 <= NP/AP <= 3)
    }

    return Object.freeze({ ap, np, npap_ratio, net_np, classification });
}

// ================================================================
// 2. ACID GENERATION RATE (pyrite oxidation)
// Taxa de geracao de acido por oxidacao de pirita
// ================================================================

/**
 * Estimates pyrite oxidation rate using Williamson & Rimstidt (1994) simplified form.
 * Estima a taxa de oxidacao da pirita (mecanismo primario de DAM).
 *
 * r = k × S_BET × mass_fraction  (mol/kg waste/s)
 * Meia-vida: tempo para oxidar metade do enxofre disponivel
 *
 * @param {number} pyrite_pct - Pyrite content (% by mass, 0-100)
 * @param {number} surface_area_m2_g - BET surface area (m²/g)
 * @param {number} [rate_constant=1e-9] - Intrinsic rate constant (mol/m²/s)
 * @returns {Readonly<{rate_mol_kg_s: number, rate_mol_kg_yr: number, t_half_sulfur_yr: number}>}
 * @throws {RangeError} if pyrite_pct or surface_area are out of valid range
 */
export function acidGenerationRate(
    pyrite_pct: number,
    surface_area_m2_g: number,
    rate_constant = 1e-9,
): Readonly<{ rate_mol_kg_s: number; rate_mol_kg_yr: number; t_half_sulfur_yr: number }> {
    if (pyrite_pct < 0 || pyrite_pct > 100) {
        throw new RangeError(`pyrite_pct must be 0-100, got ${pyrite_pct}`);
    }
    if (surface_area_m2_g <= 0) {
        throw new RangeError(`surface_area_m2_g must be positive, got ${surface_area_m2_g}`);
    }
    if (rate_constant <= 0) {
        throw new RangeError(`rate_constant must be positive, got ${rate_constant}`);
    }

    // Fracao em massa de pirita (adimensional)
    const mass_fraction = pyrite_pct / 100;

    // Conversao: m²/g → m²/kg (×1000)
    const surface_area_m2_kg = surface_area_m2_g * 1000;

    // Taxa de oxidacao: mol/kg rejeito/s (Williamson & Rimstidt 1994 forma simplificada)
    const rate_mol_kg_s = rate_constant * surface_area_m2_kg * mass_fraction;

    // Conversao para escala anual: 365.25 dias × 86400 s/dia
    const seconds_per_year = 3.15576e7;
    const rate_mol_kg_yr = rate_mol_kg_s * seconds_per_year;

    // Pirita FeS2: massa molar ≈ 120 g/mol; teor de S = 2 mol S / mol FeS2
    const s_mol_kg = mass_fraction * (1000 / 120) * 2;

    // Meia-vida do enxofre (anos) - tempo para oxidar 50% do S disponivel
    const t_half_sulfur_yr = rate_mol_kg_yr > 0 ? (0.5 * s_mol_kg) / rate_mol_kg_yr : Infinity;

    return Object.freeze({ rate_mol_kg_s, rate_mol_kg_yr, t_half_sulfur_yr });
}

// ================================================================
// 3. TAILINGS POND SEEPAGE
// Percolacao em barragem de rejeitos
// ================================================================

/**
 * Calculates seepage flow through a tailings pond liner using Darcy's law.
 * Calcula a percolacao atraves do revestimento de uma bacia de rejeitos (Lei de Darcy).
 *
 * Q = K × i × A, onde i = head / depth (gradiente hidraulico)
 *
 * @param {number} head_m - Hydraulic head (m)
 * @param {number} area_m2 - Pond base area (m²)
 * @param {number} [liner_k_m_s=1e-9] - Liner hydraulic conductivity (m/s)
 * @param {number} [depth_m=5] - Liner thickness (m)
 * @returns {Readonly<{seepage_m3_day: number, darcy_velocity_m_s: number, travel_time_yr: number}>}
 * @throws {RangeError} if head or area are non-positive, or depth is non-positive
 */
export function tailingsPondSeepage(
    head_m: number,
    area_m2: number,
    liner_k_m_s = 1e-9,
    depth_m = 5,
): Readonly<{ seepage_m3_day: number; darcy_velocity_m_s: number; travel_time_yr: number }> {
    if (head_m < 0) {
        throw new RangeError(`head_m must be >= 0, got ${head_m}`);
    }
    if (area_m2 <= 0) {
        throw new RangeError(`area_m2 must be positive, got ${area_m2}`);
    }
    if (liner_k_m_s <= 0) {
        throw new RangeError(`liner_k_m_s must be positive, got ${liner_k_m_s}`);
    }
    if (depth_m <= 0) {
        throw new RangeError(`depth_m must be positive, got ${depth_m}`);
    }

    // Gradiente hidraulico adimensional (i = carga / espessura do liner)
    const hydraulic_gradient = head_m / depth_m;

    // Velocidade de Darcy (m/s): v = K × i
    const darcy_velocity_m_s = liner_k_m_s * hydraulic_gradient;

    // Vazao de percolacao (m³/dia): Q = v × A × 86400 s/dia
    const seepage_m3_day = darcy_velocity_m_s * area_m2 * 86400;

    // Tempo de trânsito pelo liner (anos): t = depth / velocity
    const travel_time_yr = darcy_velocity_m_s > 0 ? depth_m / darcy_velocity_m_s / 3.15576e7 : Infinity;

    return Object.freeze({ seepage_m3_day, darcy_velocity_m_s, travel_time_yr });
}

// ================================================================
// 4. HEAVY METAL PARTITIONING (Kd)
// Particao de metais pesados solo-agua
// ================================================================

/**
 * Calculates heavy metal partitioning between dissolved and sorbed phases using Kd.
 * Calcula a particao de metais pesados entre fase dissolvida e sorvida (coeficiente Kd).
 *
 * C_dissolved = C_total / (1 + Kd)  [forma simplificada normalizada por massa]
 *
 * @param {number} total_metal_mg_kg - Total metal concentration (mg/kg dry weight)
 * @param {number} kd_L_kg - Linear partition coefficient (L/kg)
 * @param {number} [pore_water_volume_L_kg=0.3] - Pore water volume ratio (L/kg soil)
 * @returns {Readonly<{c_dissolved_mg_L: number, c_sorbed_mg_kg: number, partition_ratio: number}>}
 * @throws {RangeError} if total_metal or kd are negative
 */
export function heavyMetalPartitioning(
    total_metal_mg_kg: number,
    kd_L_kg: number,
    pore_water_volume_L_kg = 0.3,
): Readonly<{ c_dissolved_mg_L: number; c_sorbed_mg_kg: number; partition_ratio: number }> {
    if (total_metal_mg_kg < 0) {
        throw new RangeError(`total_metal_mg_kg must be >= 0, got ${total_metal_mg_kg}`);
    }
    if (kd_L_kg < 0) {
        throw new RangeError(`kd_L_kg must be >= 0, got ${kd_L_kg}`);
    }
    if (pore_water_volume_L_kg <= 0) {
        throw new RangeError(`pore_water_volume_L_kg must be positive, got ${pore_water_volume_L_kg}`);
    }

    // Concentracao dissolvida (mg/L): forma simplificada USEPA (1999)
    const c_dissolved_mg_L = total_metal_mg_kg / (1 + kd_L_kg);

    // Concentracao sorvida (mg/kg): diferenca entre total e dissolvido (ajustado por volume de poros)
    const c_sorbed_mg_kg = total_metal_mg_kg - c_dissolved_mg_L * pore_water_volume_L_kg;

    // Razao de particao (adimensional): sorvido / dissolvido
    const partition_ratio = c_dissolved_mg_L > 0 ? c_sorbed_mg_kg / c_dissolved_mg_L : Infinity;

    return Object.freeze({ c_dissolved_mg_L, c_sorbed_mg_kg, partition_ratio });
}

// ================================================================
// 5. COVER SYSTEM WATER BALANCE
// Balanco hidrico do sistema de cobertura de rejeitos
// ================================================================

/**
 * Computes simplified water balance for a mine waste cover system (MEND 2.21.4).
 * Computa o balanco hidrico simplificado para sistema de cobertura de rejeito.
 *
 * Percolacao = P × (1 - runoff_coeff) - PET - deltaStorage
 *
 * @param {number} precipitation_mm - Annual precipitation (mm/yr)
 * @param {number} pet_mm - Potential evapotranspiration (mm/yr)
 * @param {number} [runoff_coeff=0.3] - Surface runoff coefficient (0-1)
 * @param {number} [cover_storage_mm=50] - Cover water storage capacity (mm)
 * @returns {Readonly<{percolation_mm_yr: number, runoff_mm_yr: number, et_mm_yr: number, net_storage_change: number}>}
 * @throws {RangeError} if precipitation or pet are negative, or runoff_coeff is out of range
 */
export function coverSystemWaterBalance(
    precipitation_mm: number,
    pet_mm: number,
    runoff_coeff = 0.3,
    cover_storage_mm = 50,
): Readonly<{ percolation_mm_yr: number; runoff_mm_yr: number; et_mm_yr: number; net_storage_change: number }> {
    if (precipitation_mm < 0) {
        throw new RangeError(`precipitation_mm must be >= 0, got ${precipitation_mm}`);
    }
    if (pet_mm < 0) {
        throw new RangeError(`pet_mm must be >= 0, got ${pet_mm}`);
    }
    if (runoff_coeff < 0 || runoff_coeff > 1) {
        throw new RangeError(`runoff_coeff must be 0-1, got ${runoff_coeff}`);
    }
    if (cover_storage_mm < 0) {
        throw new RangeError(`cover_storage_mm must be >= 0, got ${cover_storage_mm}`);
    }

    // Escoamento superficial (mm/ano)
    const runoff_mm_yr = precipitation_mm * runoff_coeff;

    // Agua disponivel apos escoamento
    const available_mm = precipitation_mm - runoff_mm_yr;

    // Evapotranspiracao real: limitada pela agua disponivel
    const et_mm_yr = Math.min(pet_mm, available_mm);

    // Variacao de armazenamento: limitada pela capacidade do sistema de cobertura
    const potential_storage_change = available_mm - et_mm_yr;
    const net_storage_change = Math.min(potential_storage_change, cover_storage_mm);

    // Percolacao residual (nao pode ser negativa - nao existe percolacao ascendente aqui)
    const percolation_mm_yr = Math.max(0, potential_storage_change - net_storage_change);

    return Object.freeze({ percolation_mm_yr, runoff_mm_yr, et_mm_yr, net_storage_change });
}

// ================================================================
// 6. ARMD RISK INDEX
// Indice de risco de drenagem acida de mineracao (DAM)
// ================================================================

/**
 * Calculates the AMD (Acid Mine Drainage) risk index from geochemical indicators.
 * Calcula o indice de risco de drenagem acida combinando NP/AP, teor de S e pH de pasta.
 *
 * R = w1 × f(NP/AP) + w2 × f(S%) + w3 × f(pH)
 * Cada fator normalizado 0-1; pesos: w1=0.4, w2=0.3, w3=0.3
 *
 * @param {number} npap_ratio - NP/AP ratio (from acidBasePotential)
 * @param {number} sulfur_pct - Total sulfur content (% by mass, 0-100)
 * @param {number} max_paste_pH - Maximum paste pH (0-14)
 * @returns {Readonly<{risk_index: number, risk_class: string, components: Readonly<object>}>}
 * @throws {RangeError} if inputs are outside valid ranges
 */
export function armdRiskIndex(
    npap_ratio: number,
    sulfur_pct: number,
    max_paste_pH: number,
): Readonly<{ risk_index: number; risk_class: string; components: Readonly<object> }> {
    if (npap_ratio < 0) {
        throw new RangeError(`npap_ratio must be >= 0, got ${npap_ratio}`);
    }
    if (sulfur_pct < 0 || sulfur_pct > 100) {
        throw new RangeError(`sulfur_pct must be 0-100, got ${sulfur_pct}`);
    }
    if (max_paste_pH < 0 || max_paste_pH > 14) {
        throw new RangeError(`max_paste_pH must be 0-14, got ${max_paste_pH}`);
    }

    // Fator NP/AP: alto NP/AP = baixo risco → f_npap = 1/(1+npap_ratio), normalizado 0-1
    const npap_clamped = Math.min(npap_ratio, 5);
    const f_npap = 1 - npap_clamped / 5; // 0 = NAG (baixo risco), 1 = PAG (alto risco)

    // Fator enxofre: mais S = mais risco; escala 0-10% como intervalo tipico
    const f_sulfur = Math.min(sulfur_pct / 10, 1.0);

    // Fator pH: pH baixo = mais risco; (7 - pH) normalizado pelo maximo (7)
    const ph_deficit = Math.max(0, 7 - max_paste_pH);
    const f_ph = Math.min(ph_deficit / 7, 1.0);

    // Indice ponderado (Morin & Hutt 1997)
    const risk_index = 0.4 * f_npap + 0.3 * f_sulfur + 0.3 * f_ph;

    // Classificacao de risco: low < 0.33, moderate 0.33-0.66, high > 0.66
    let risk_class: string;
    if (risk_index < 0.33) {
        risk_class = 'low';
    } else if (risk_index < 0.66) {
        risk_class = 'moderate';
    } else {
        risk_class = 'high';
    }

    const components = Object.freeze({
        f_npap,
        f_sulfur,
        f_ph,
        weight_npap: 0.4,
        weight_sulfur: 0.3,
        weight_ph: 0.3,
    });

    return Object.freeze({ risk_index, risk_class, components });
}

// ================================================================
// 7. METAL LEACHING FLUX
// Fluxo de lixiviacao de metais
// ================================================================

/**
 * Calculates annual metal leaching flux from a contaminated area.
 * Calcula o fluxo anual de lixiviacao de metais de uma area contaminada.
 *
 * F = C × Q × 3.15e7 s/yr / 1e6 (mg→kg) = kg/yr
 *
 * @param {number} concentration_mg_L - Metal concentration in leachate (mg/L)
 * @param {number} flow_L_s - Leachate flow rate (L/s)
 * @param {number} area_m2 - Source area (m²)
 * @returns {Readonly<{flux_kg_yr: number, flux_kg_m2_yr: number, load_kg_yr: number}>}
 * @throws {RangeError} if concentration or flow are negative, or area is non-positive
 */
export function metalLeachingFlux(
    concentration_mg_L: number,
    flow_L_s: number,
    area_m2: number,
): Readonly<{ flux_kg_yr: number; flux_kg_m2_yr: number; load_kg_yr: number }> {
    if (concentration_mg_L < 0) {
        throw new RangeError(`concentration_mg_L must be >= 0, got ${concentration_mg_L}`);
    }
    if (flow_L_s < 0) {
        throw new RangeError(`flow_L_s must be >= 0, got ${flow_L_s}`);
    }
    if (area_m2 <= 0) {
        throw new RangeError(`area_m2 must be positive, got ${area_m2}`);
    }

    const seconds_per_year = 3.15e7; // aproximacao padrao MEND 2.22.2

    // Carga anual (kg/ano): C [mg/L] × Q [L/s] × t [s/ano] ÷ 10^6 [mg→kg]
    const flux_kg_yr = (concentration_mg_L * flow_L_s * seconds_per_year) / 1e6;

    // Fluxo normalizado por area (kg/m²/ano)
    const flux_kg_m2_yr = flux_kg_yr / area_m2;

    // Carga total (sinonimo de flux para compatibilidade com MEND 2.22.2)
    const load_kg_yr = flux_kg_yr;

    return Object.freeze({ flux_kg_yr, flux_kg_m2_yr, load_kg_yr });
}

// ================================================================
// 8. STABILITY SAFETY FACTOR (slope stability)
// Fator de seguranca de estabilidade de taludes
// ================================================================

/**
 * Calculates slope stability safety factor using Taylor (1937) infinite slope model.
 * Calcula o fator de seguranca de talude pelo modelo de talude infinito de Taylor (1937).
 *
 * FS = (c + γ·z·cos²β·tanφ) / (γ·z·sinβ·cosβ)
 *
 * @param {number} cohesion_kPa - Soil cohesion (kPa)
 * @param {number} friction_angle_deg - Internal friction angle (degrees)
 * @param {number} slope_height_m - Slope height (m)
 * @param {number} slope_angle_deg - Slope angle from horizontal (degrees)
 * @param {number} [unit_weight_kN_m3=18] - Soil unit weight (kN/m³)
 * @returns {Readonly<{fs: number, stable: boolean, slope_angle_deg: number, c_kPa: number}>}
 * @throws {RangeError} if inputs are out of valid geotechnical ranges
 */
export function stabilitySafetyFactor(
    cohesion_kPa: number,
    friction_angle_deg: number,
    slope_height_m: number,
    slope_angle_deg: number,
    unit_weight_kN_m3 = 18,
): Readonly<{ fs: number; stable: boolean; slope_angle_deg: number; c_kPa: number }> {
    if (cohesion_kPa < 0) {
        throw new RangeError(`cohesion_kPa must be >= 0, got ${cohesion_kPa}`);
    }
    if (friction_angle_deg < 0 || friction_angle_deg > 90) {
        throw new RangeError(`friction_angle_deg must be 0-90, got ${friction_angle_deg}`);
    }
    if (slope_height_m <= 0) {
        throw new RangeError(`slope_height_m must be positive, got ${slope_height_m}`);
    }
    if (slope_angle_deg <= 0 || slope_angle_deg >= 90) {
        throw new RangeError(`slope_angle_deg must be > 0 and < 90, got ${slope_angle_deg}`);
    }
    if (unit_weight_kN_m3 <= 0) {
        throw new RangeError(`unit_weight_kN_m3 must be positive, got ${unit_weight_kN_m3}`);
    }

    // Conversao de graus para radianos
    const beta = (slope_angle_deg * Math.PI) / 180;
    const phi = (friction_angle_deg * Math.PI) / 180;

    const z = slope_height_m;
    const gamma = unit_weight_kN_m3;

    // Resistencia ao cisalhamento: coesao + componente friccional (numerador)
    const shear_resistance = cohesion_kPa + gamma * z * Math.cos(beta) * Math.cos(beta) * Math.tan(phi);

    // Forca motriz: componente de cisalhamento do peso proprio (denominador)
    const driving_force = gamma * z * Math.sin(beta) * Math.cos(beta);

    // Fator de seguranca (minimo aceitavel: FS >= 1.5 segundo pratica de mineracao)
    const fs = driving_force > 0 ? shear_resistance / driving_force : Infinity;
    const stable = fs >= 1.5;

    return Object.freeze({ fs, stable, slope_angle_deg, c_kPa: cohesion_kPa });
}

// ================================================================
// 9. EROSION POTENTIAL (RUSLE)
// Potencial de erosao pela Equacao Universal de Perda de Solo Revisada
// ================================================================

/**
 * Estimates soil loss using RUSLE (Revised Universal Soil Loss Equation).
 * Estima a perda de solo pela EUPS Revisada (Renard et al. 1997 USDA AH-703).
 *
 * A = R × K × LS × C × P  (t/ha/yr)
 * LS = (L/22.13)^0.4 × (sin(S_deg)/0.0896)^1.3
 *
 * @param {number} erodibility_K - Soil erodibility factor K (t·ha·h / ha·MJ·mm)
 * @param {number} rainfall_R - Rainfall erosivity factor R (MJ·mm / ha·h·yr)
 * @param {number} slope_S - Slope steepness (degrees)
 * @param {number} slope_length_m - Slope length (m)
 * @param {number} [cover_factor_C=0.5] - Cover and management factor C (0-1)
 * @returns {Readonly<{soil_loss_t_ha_yr: number, ls_factor: number, cover_factor_C: number}>}
 * @throws {RangeError} if inputs are out of valid ranges
 */
export function erosionPotential(
    erodibility_K: number,
    rainfall_R: number,
    slope_S: number,
    slope_length_m: number,
    cover_factor_C = 0.5,
): Readonly<{ soil_loss_t_ha_yr: number; ls_factor: number; cover_factor_C: number }> {
    if (erodibility_K < 0) {
        throw new RangeError(`erodibility_K must be >= 0, got ${erodibility_K}`);
    }
    if (rainfall_R < 0) {
        throw new RangeError(`rainfall_R must be >= 0, got ${rainfall_R}`);
    }
    if (slope_S < 0 || slope_S >= 90) {
        throw new RangeError(`slope_S must be 0-89 degrees, got ${slope_S}`);
    }
    if (slope_length_m <= 0) {
        throw new RangeError(`slope_length_m must be positive, got ${slope_length_m}`);
    }
    if (cover_factor_C < 0 || cover_factor_C > 1) {
        throw new RangeError(`cover_factor_C must be 0-1, got ${cover_factor_C}`);
    }

    // Fator LS: combinacao de comprimento e inclinacao do talude (RUSLE eq. 3.1)
    const slope_rad = (slope_S * Math.PI) / 180;
    const ls_length = Math.pow(slope_length_m / 22.13, 0.4);
    const ls_slope = Math.pow(Math.sin(slope_rad) / 0.0896, 1.3);
    const ls_factor = ls_length * ls_slope;

    // Fator de pratica de controle P = 1.0 (sem pratica especifica de controle)
    const P = 1.0;

    // Perda de solo anual (t/ha/ano): produto dos 5 fatores RUSLE
    const soil_loss_t_ha_yr = rainfall_R * erodibility_K * ls_factor * cover_factor_C * P;

    return Object.freeze({ soil_loss_t_ha_yr, ls_factor, cover_factor_C });
}

// ================================================================
// 10. TAILINGS LIQUEFACTION INDEX
// Indice de liquefacao de rejeitos
// ================================================================

/**
 * Estimates liquefaction susceptibility of tailings using Robertson & Wride (1998).
 * Estima a susceptibilidade a liquefacao de rejeitos (Robertson & Wride 1998).
 *
 * CRR = 0.833 × (Dr/100)² + 0.05  para Dr < 80%
 * FS_liq = CRR / CSR
 *
 * @param {number} void_ratio - Current void ratio (dimensionless, > 0)
 * @param {number} relative_density_pct - Relative density Dr (%, 0-100)
 * @param {number} fines_content_pct - Fines content (%, 0-100)
 * @param {number} [csr=0.2] - Cyclic Stress Ratio induced by earthquake
 * @returns {Readonly<{fs_liq: number, liquefaction_susceptible: boolean, crr: number, csr: number}>}
 * @throws {RangeError} if inputs are out of valid geotechnical ranges
 */
export function tailingsLiquefactionIndex(
    void_ratio: number,
    relative_density_pct: number,
    fines_content_pct: number,
    csr = 0.2,
): Readonly<{ fs_liq: number; liquefaction_susceptible: boolean; crr: number; csr: number }> {
    if (void_ratio <= 0) {
        throw new RangeError(`void_ratio must be positive, got ${void_ratio}`);
    }
    if (relative_density_pct < 0 || relative_density_pct > 100) {
        throw new RangeError(`relative_density_pct must be 0-100, got ${relative_density_pct}`);
    }
    if (fines_content_pct < 0 || fines_content_pct > 100) {
        throw new RangeError(`fines_content_pct must be 0-100, got ${fines_content_pct}`);
    }
    if (csr <= 0) {
        throw new RangeError(`csr must be positive, got ${csr}`);
    }

    const Dr = relative_density_pct;

    // CRR (Cyclic Resistance Ratio): Robertson & Wride (1998) eq. simplificada
    let crr: number;
    if (Dr < 80) {
        crr = 0.833 * Math.pow(Dr / 100, 2) + 0.05;
    } else {
        // Para Dr >= 80%: material mais denso, CRR estimado por extrapolacao
        crr = 0.833 * Math.pow(80 / 100, 2) + 0.05 + (Dr - 80) * 0.01;
    }

    // Correcao para alto teor de finos (rejeitos de mineracao tipicamente > 50% finos)
    if (fines_content_pct > 35) {
        const fc_correction = 1.0 - (fines_content_pct - 35) * 0.004;
        crr = crr * Math.max(fc_correction, 0.6);
    }

    // Fator de seguranca contra liquefacao: FS = CRR / CSR
    const fs_liq = crr / csr;

    // Susceptivel a liquefacao se FS < 1.0 (Robertson & Wride 1998)
    const liquefaction_susceptible = fs_liq < 1.0;

    return Object.freeze({ fs_liq, liquefaction_susceptible, crr, csr });
}

console.debug('[minewaste:end]', 'app/js/core/chemistry/mineWasteGeochemistry.js');
