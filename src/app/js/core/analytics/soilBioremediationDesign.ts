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
// Application: EHS & Mining -- Soil Bioremediation Design
// Authorship: Calvin Stefan Iost
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Academic References:
// - USEPA (1995). Bioventing Principles and Practice. Volume I: Bioventing Design.
//   EPA/540/R-95/534A. U.S. Environmental Protection Agency, Cincinnati, OH.
// - Johnson, P.C. et al. (1990). Practical screening models for subsurface air sparging.
//   In: Proceedings of the NWWA/API Conference on Petroleum Hydrocarbons and Organic
//   Chemicals in Ground Water. National Water Well Association, Dublin, OH.
// - Alexander, M. (1994). Biodegradation and Bioremediation.
//   Academic Press, San Diego. ISBN 0-12-049860-X.
// - Monod, J. (1949). The Growth of Bacterial Cultures.
//   Annual Review of Microbiology, 3, 371-394. doi:10.1146/annurev.mi.03.100149.002103
// - Maymo-Gatell, X. et al. (1997). Isolation of a bacterium that reductively
//   dechlorinates tetrachloroethene to ethene. Science, 276(5318), 1568-1571.
//   doi:10.1126/science.276.5318.1568
// - Wiedemeier, T.H. et al. (1999). Natural Attenuation of Fuels and Chlorinated
//   Solvents in the Subsurface. John Wiley & Sons, New York.
// - Hyman, M. & Dupont, R.R. (2001). Groundwater and Soil Remediation: Process
//   Design and Cost Estimating. ASCE Press. ISBN 0-7844-0574-4.

/* ================================================================
   SOIL BIOREMEDIATION DESIGN — Pure mathematical functions for
   bioremediation system design calculations.

   Calculos de projeto de biorremediacao de solo. Zero DOM,
   IndexedDB, rede ou Three.js. Todos os calculos sao
   deterministicos e rastreados a referencias academicas.

   GRUPOS (5 grupos, 22 funcoes exportadas):

   01. BIOVENTING (USEPA 1995)
       bioventingOxygenDemand         — demanda de O2 para bioventing
       bioventingAirflowRate          — vazao de ar necessaria
       bioventingZoneOfInfluence      — raio de influencia (Johnson 1990)
       bioventingTreatmentTime        — tempo de tratamento

   02. LANDFARMING TPH DEGRADATION
       landfarmDegradationRate        — taxa de biodegradacao k (Alexander 1994)
       landfarmTreatmentArea          — area de landfarming necessaria
       tphFirstOrderDecay             — decaimento de primeira ordem
       landfarmNutrientDemand         — demanda de N e P

   03. BIOSTIMULATION (ORC / electron acceptors)
       orcOxygenRelease               — cronograma de liberacao de O2
       electronAcceptorDemand         — demanda de aceitador de eletrons
       monodKinetics                  — cinetica de Monod (1949)
       halfSaturationBTEX             — Km por composto BTEX

   04. BIOAUGMENTATION
       lagPhaseEstimate               — fase lag estimada
       doublingTime                   — tempo de duplicacao microbiano
       bioaugmentationDose            — dose de inoculo
       reductiveDechloration_VC       — fracao de declorinacao redutiva (Maymo-Gatell 1997)

   05. PERFORMANCE MONITORING
       respirationTest                — quociente respiratorio (RQ)
       biosparging_efficiency         — eficiencia de biossparging
       npk_ratio                      — adequacao de N, P, K

   ================================================================ */

// ---------------------------------------------------------------------------
// Constants - referencia de valores padrao
// Constantes de referencia para projeto de biorremediacao
// ---------------------------------------------------------------------------

/**
 * Constantes de referencia para calculos de biorremediacao de solo.
 * Reference constants from USEPA 1995, Alexander 1994, Monod 1949,
 * Wiedemeier 1999, and Hyman & Dupont 2001.
 */
export const BIOREMEDIATON_CONSTANTS = Object.freeze({
    /** Fração mássica de oxigênio no ar (21%) */
    O2_FRACTION_AIR: 0.21,
    /** Densidade do ar seco ao nível do mar [kg/m³] a 20°C */
    AIR_DENSITY_KG_M3: 1.2,
    /** Razão estequiométrica O2:TPH para oxidação completa de hidrocarbonetos [kg O2 / kg TPH] */
    O2_TPH_STOICHIOMETRIC: 3.5,
    /** Fração de O2 mínima para atividade aeróbica sustentada [volume/volume] */
    O2_MINIMUM_FRACTION: 0.02,
    /** Temperatura de referência para Arrhenius de biodegradação [°C] */
    TEMP_REFERENCE_C: 25,
    /** Coeficiente Q10 para taxa de biodegradação microbiana (duplica a cada 10°C) */
    Q10_BIODEGRADATION: 2.0,
    /** Umidade ótima de solo para biodegradação aeróbica [% capacidade de campo] */
    MOISTURE_OPTIMAL_FRACTION: 0.6,
    /** Taxa padrão de liberação de ORC [mg O2 / kg ORC / day] — Regenesis 2023 */
    ORC_RELEASE_RATE_DEFAULT_MG_KG_DAY: 20.0,
    /** Densidade do solo padrão [kg/m³] — para conversão de unidades */
    SOIL_BULK_DENSITY_DEFAULT_KG_M3: 1600,
    /** Constante de meia saturação de Benzeno [mg/L] — Wiedemeier 1999 Tabela B-4 */
    Km_BENZENE: 1.5,
    /** Constante de meia saturação de Tolueno [mg/L] — Wiedemeier 1999 Tabela B-4 */
    Km_TOLUENE: 2.0,
    /** Constante de meia saturação de Etilbenzeno [mg/L] — Wiedemeier 1999 Tabela B-4 */
    Km_ETHYLBENZENE: 3.0,
    /** Constante de meia saturação de Xilenos [mg/L] — Wiedemeier 1999 Tabela B-4 */
    Km_XYLENES: 5.0,
    /** Razão molar O2 demandada por mol de benzeno oxidado */
    O2_PER_MOL_BENZENE: 15.0 / 2.0,
    /** Razão C:N ótima para landfarming [adimensional] — Alexander 1994 */
    CN_RATIO_OPTIMAL: 25,
    /** Razão C:P ótima para landfarming [adimensional] — Alexander 1994 */
    CP_RATIO_OPTIMAL: 100,
    /** Eficiência mínima de biossparging para aceitação [fração] */
    BIOSPARGING_MIN_EFFICIENCY: 0.3,
    /** RQ de referência para oxidação aeróbica de hidrocarboneto [adimensional] */
    RQ_AEROBIC_HYDROCARBON: 1.0,
});

/**
 * Tabela de constantes de meia saturação de Monod por composto BTEX [mg/L].
 * Valores de Wiedemeier et al. (1999) Tabela B-4 e compilações USEPA.
 */
export const HALF_SATURATION_TABLE = Object.freeze({
    benzene: BIOREMEDIATON_CONSTANTS.Km_BENZENE,
    toluene: BIOREMEDIATON_CONSTANTS.Km_TOLUENE,
    ethylbenzene: BIOREMEDIATON_CONSTANTS.Km_ETHYLBENZENE,
    xylenes: BIOREMEDIATON_CONSTANTS.Km_XYLENES,
    // Aliases em português
    benzeno: BIOREMEDIATON_CONSTANTS.Km_BENZENE,
    tolueno: BIOREMEDIATON_CONSTANTS.Km_TOLUENE,
    etilbenzeno: BIOREMEDIATON_CONSTANTS.Km_ETHYLBENZENE,
    xilenos: BIOREMEDIATON_CONSTANTS.Km_XYLENES,
});

// ---------------------------------------------------------------------------
// 01. BIOVENTING (USEPA 1995)
// ---------------------------------------------------------------------------

/**
 * Calcula a demanda total de oxigênio para bioventing de solo contaminado com TPH.
 * Computa a massa de O2 necessária para biodegradação aeróbica dos hidrocarbonetos.
 *
 * Equação: O2_demand_kg = TPH_kg * stoichiometric_ratio
 * onde TPH_kg = TPH_mg_kg * bulkDensity_kg_m3 * volume_m3 / 1e6
 *
 * @param {number} TPH_mg_kg - Concentração inicial de TPH no solo [mg/kg]
 * @param {number} soilBulkDensity - Densidade aparente do solo [kg/m³]
 * @param {number} porosity - Porosidade efetiva do solo [adimensional, 0-1]
 * @param {number} volume - Volume de solo tratado [m³]
 * @returns {number} Demanda de O2 em [kg]
 * @throws {RangeError} Se porosity estiver fora de [0,1] ou parâmetros negativos
 * @reference USEPA (1995) EPA/540/R-95/534A, Equação 2-1
 */
export function bioventingOxygenDemand(TPH_mg_kg: number, soilBulkDensity: number, porosity: number, volume: number): number {
    if (TPH_mg_kg < 0 || soilBulkDensity <= 0 || volume < 0) {
        throw new RangeError(
            'bioventingOxygenDemand: TPH_mg_kg, soilBulkDensity e volume devem ser >= 0 (density > 0)',
        );
    }
    if (porosity < 0 || porosity > 1) {
        throw new RangeError('bioventingOxygenDemand: porosity deve estar em [0, 1]');
    }
    // Massa de solo no volume [kg] - usa densidade aparente
    const soilMass_kg = soilBulkDensity * volume;
    // Massa de TPH no solo [kg]
    const TPH_kg = (TPH_mg_kg / 1e6) * soilMass_kg;
    // Demanda de O2 [kg] pela razão estequiométrica
    return TPH_kg * BIOREMEDIATON_CONSTANTS.O2_TPH_STOICHIOMETRIC;
}

/**
 * Calcula a vazão de ar necessária para suprir a demanda de O2 no bioventing.
 * Considera eficiência de transferência e taxa de biodegradação.
 *
 * Equação: Q = oxygenDemand_kg / (biodegradationRate_day * efficiency * O2_frac_air * rho_air)
 *
 * @param {number} oxygenDemand_kg - Demanda total de O2 [kg]
 * @param {number} biodegradationRate_day - Taxa de biodegradação de primeira ordem [day⁻¹]
 * @param {number} efficiency - Eficiência de transferência de O2 [adimensional, 0-1]
 * @returns {number} Vazão de ar necessária [m³/day]
 * @throws {RangeError} Se efficiency <= 0 ou > 1, ou biodegradationRate <= 0
 * @reference USEPA (1995) EPA/540/R-95/534A, Equação 2-3
 */
export function bioventingAirflowRate(oxygenDemand_kg: number, biodegradationRate_day: number, efficiency: number): number {
    if (oxygenDemand_kg < 0) {
        throw new RangeError('bioventingAirflowRate: oxygenDemand_kg deve ser >= 0');
    }
    if (biodegradationRate_day <= 0) {
        throw new RangeError('bioventingAirflowRate: biodegradationRate_day deve ser > 0');
    }
    if (efficiency <= 0 || efficiency > 1) {
        throw new RangeError('bioventingAirflowRate: efficiency deve estar em (0, 1]');
    }
    // Massa de O2 por m³ de ar [kg/m³]
    const O2_per_m3_air = BIOREMEDIATON_CONSTANTS.O2_FRACTION_AIR * BIOREMEDIATON_CONSTANTS.AIR_DENSITY_KG_M3;
    // Demanda diária de O2 [kg/day]
    const dailyO2_kg = oxygenDemand_kg * biodegradationRate_day;
    // Vazão [m³/day]
    return dailyO2_kg / (efficiency * O2_per_m3_air);
}

/**
 * Calcula o raio de zona de influência de um poço de bioventing.
 * Baseado na equação de Johnson (1990) para fluxo radial em meio poroso.
 *
 * Equação: R = sqrt(k * Q / (pi * pressure_atm * 1e5))
 * (simplificação analítica de fluxo radial compressível)
 *
 * @param {number} permeability_cm2 - Permeabilidade intrínseca do solo [cm²]
 * @param {number} Q - Vazão de ar [m³/day]
 * @param {number} pressure_atm - Pressão de injeção/extração [atm]
 * @returns {number} Raio de zona de influência [m]
 * @throws {RangeError} Se permeability, Q ou pressure forem <= 0
 * @reference Johnson, P.C. et al. (1990). NWWA/API Conference, radial flow model
 */
export function bioventingZoneOfInfluence(permeability_cm2: number, Q: number, pressure_atm: number): number {
    if (permeability_cm2 <= 0) {
        throw new RangeError('bioventingZoneOfInfluence: permeability_cm2 deve ser > 0');
    }
    if (Q <= 0) {
        throw new RangeError('bioventingZoneOfInfluence: Q deve ser > 0');
    }
    if (pressure_atm <= 0) {
        throw new RangeError('bioventingZoneOfInfluence: pressure_atm deve ser > 0');
    }
    // Converter permeabilidade de cm² para m²
    const k_m2 = permeability_cm2 * 1e-4;
    // Converter vazão de m³/day para m³/s
    const Q_m3s = Q / 86400;
    // Pressão em Pa (1 atm = 101325 Pa)
    const P_Pa = pressure_atm * 101325;
    // Raio de influência via modelo radial simplificado (Johnson 1990)
    // R = sqrt(k * Q / (pi * mu * P)) - mu ar ~1.8e-5 Pa.s
    const mu_air = 1.8e-5; // viscosidade dinâmica do ar [Pa.s]
    return Math.sqrt((k_m2 * Q_m3s) / (Math.PI * mu_air * P_Pa));
}

/**
 * Estima o tempo de tratamento por bioventing para atingir concentração alvo.
 * Usa modelo de primeira ordem com taxa de biodegradação constante.
 *
 * Equação: t = -ln(TPH_target / TPH_initial) / k
 *
 * @param {number} TPH_initial - Concentração inicial de TPH [mg/kg]
 * @param {number} TPH_target - Concentração alvo de TPH [mg/kg]
 * @param {number} biodegradationRate - Taxa de biodegradação de primeira ordem [day⁻¹]
 * @returns {number} Tempo de tratamento [days]
 * @throws {RangeError} Se TPH_target >= TPH_initial, TPH valores inválidos, ou k <= 0
 * @reference USEPA (1995) EPA/540/R-95/534A, Equação 2-5
 */
export function bioventingTreatmentTime(TPH_initial: number, TPH_target: number, biodegradationRate: number): number {
    if (TPH_initial <= 0) {
        throw new RangeError('bioventingTreatmentTime: TPH_initial deve ser > 0');
    }
    if (TPH_target <= 0) {
        throw new RangeError('bioventingTreatmentTime: TPH_target deve ser > 0');
    }
    if (TPH_target >= TPH_initial) {
        throw new RangeError('bioventingTreatmentTime: TPH_target deve ser < TPH_initial');
    }
    if (biodegradationRate <= 0) {
        throw new RangeError('bioventingTreatmentTime: biodegradationRate deve ser > 0');
    }
    return -Math.log(TPH_target / TPH_initial) / biodegradationRate;
}

// ---------------------------------------------------------------------------
// 02. LANDFARMING TPH DEGRADATION
// ---------------------------------------------------------------------------

/**
 * Calcula a taxa de biodegradação de TPH em landfarming considerando
 * temperatura, umidade e proporção de nutrientes (Alexander 1994).
 * Usa fator Q10 para temperatura e função de penalidade para umidade.
 *
 * k_bio = k_ref * Q10^((T-Tref)/10) * f(moisture) * f(nutrients)
 *
 * @param {number} temp_C - Temperatura do solo [°C]
 * @param {number} moisture - Umidade como fração da capacidade de campo [0-1]
 * @param {number} nutrientRatio - Fator de adequação de nutrientes C:N:P [adimensional, 0-1]
 * @returns {number} Taxa de biodegradação k_bio [day⁻¹]
 * @throws {RangeError} Se moisture ou nutrientRatio estiverem fora de [0,1]
 * @reference Alexander, M. (1994). Biodegradation and Bioremediation, Cap. 4
 */
export function landfarmDegradationRate(temp_C: number, moisture: number, nutrientRatio: number): number {
    if (moisture < 0 || moisture > 1) {
        throw new RangeError('landfarmDegradationRate: moisture deve estar em [0, 1]');
    }
    if (nutrientRatio < 0 || nutrientRatio > 1) {
        throw new RangeError('landfarmDegradationRate: nutrientRatio deve estar em [0, 1]');
    }
    // Taxa de referência a 25°C com condições ótimas [day⁻¹] - Alexander 1994
    const k_ref = 0.05;
    // Fator de temperatura (Q10 = 2.0)
    const tempFactor = Math.pow(
        BIOREMEDIATON_CONSTANTS.Q10_BIODEGRADATION,
        (temp_C - BIOREMEDIATON_CONSTANTS.TEMP_REFERENCE_C) / 10,
    );
    // Fator de umidade: ótimo a 60% CC, penalidade parabólica (Alexander 1994)
    const optMoisture = BIOREMEDIATON_CONSTANTS.MOISTURE_OPTIMAL_FRACTION;
    const moistureFactor = Math.max(0, 1 - Math.pow((moisture - optMoisture) / optMoisture, 2));
    // k_bio resultante
    return k_ref * tempFactor * moistureFactor * nutrientRatio;
}

/**
 * Calcula a área de landfarming necessária para tratamento de solo contaminado.
 * Considera profundidade máxima de camada e taxa de carregamento de solo.
 *
 * Area = volume_m3 / (maxDepth * loadingRate)
 * onde loadingRate é a fração efetiva de ocupação por camada [adimensional]
 *
 * @param {number} volume_m3 - Volume de solo contaminado a tratar [m³]
 * @param {number} maxDepth - Profundidade máxima da camada de landfarming [m]
 * @param {number} loadingRate - Taxa de carregamento efetiva [adimensional, 0-1]
 * @returns {number} Área de landfarming [m²]
 * @throws {RangeError} Se parâmetros forem inválidos
 * @reference USEPA (1994). Engineering Bulletin: Landfarming. EPA/540/S-94/500
 */
export function landfarmTreatmentArea(volume_m3: number, maxDepth: number, loadingRate: number): number {
    if (volume_m3 < 0) {
        throw new RangeError('landfarmTreatmentArea: volume_m3 deve ser >= 0');
    }
    if (maxDepth <= 0) {
        throw new RangeError('landfarmTreatmentArea: maxDepth deve ser > 0');
    }
    if (loadingRate <= 0 || loadingRate > 1) {
        throw new RangeError('landfarmTreatmentArea: loadingRate deve estar em (0, 1]');
    }
    return volume_m3 / (maxDepth * loadingRate);
}

/**
 * Calcula a concentração de TPH após degradação de primeira ordem.
 * Equação de decaimento exponencial clássica.
 *
 * C(t) = C0 * exp(-k * t)
 *
 * @param {number} TPH0 - Concentração inicial de TPH [mg/kg]
 * @param {number} k_bio - Taxa de biodegradação de primeira ordem [day⁻¹]
 * @param {number} time_days - Tempo de tratamento [days]
 * @returns {number} Concentração de TPH no tempo t [mg/kg]
 * @throws {RangeError} Se TPH0 < 0, k_bio <= 0, ou time_days < 0
 * @reference Alexander, M. (1994). Biodegradation and Bioremediation, Equação 3.1
 */
export function tphFirstOrderDecay(TPH0: number, k_bio: number, time_days: number): number {
    if (TPH0 < 0) {
        throw new RangeError('tphFirstOrderDecay: TPH0 deve ser >= 0');
    }
    if (k_bio <= 0) {
        throw new RangeError('tphFirstOrderDecay: k_bio deve ser > 0');
    }
    if (time_days < 0) {
        throw new RangeError('tphFirstOrderDecay: time_days deve ser >= 0');
    }
    return TPH0 * Math.exp(-k_bio * time_days);
}

/**
 * Calcula a demanda de nutrientes (N e P) para landfarming de solo com TPH.
 * Baseado nas razões C:N e C:P ótimas para atividade microbiana aeróbica.
 *
 * Pressupõe que o C disponível é proporcional ao TPH: C_kg = TPH_kg * 0.85
 * (fração de carbono médio em hidrocarbonetos de petróleo - Alexander 1994)
 *
 * @param {number} TPH_kg - Massa de TPH a ser degradada [kg]
 * @param {number} CN_ratio - Razão C:N desejada [adimensional]
 * @param {number} CP_ratio - Razão C:P desejada [adimensional]
 * @returns {{N_kg: number, P_kg: number}} Demanda de N e P em [kg]
 * @throws {RangeError} Se TPH_kg < 0 ou razões <= 0
 * @reference Alexander, M. (1994). Biodegradation and Bioremediation, Cap. 6
 */
export function landfarmNutrientDemand(TPH_kg: number, CN_ratio: number, CP_ratio: number): {N_kg: number, P_kg: number} {
    if (TPH_kg < 0) {
        throw new RangeError('landfarmNutrientDemand: TPH_kg deve ser >= 0');
    }
    if (CN_ratio <= 0) {
        throw new RangeError('landfarmNutrientDemand: CN_ratio deve ser > 0');
    }
    if (CP_ratio <= 0) {
        throw new RangeError('landfarmNutrientDemand: CP_ratio deve ser > 0');
    }
    // Fração de carbono nos hidrocarbonetos de petróleo (~85%)
    const C_fraction = 0.85;
    const C_kg = TPH_kg * C_fraction;
    return {
        N_kg: C_kg / CN_ratio,
        P_kg: C_kg / CP_ratio,
    };
}

// ---------------------------------------------------------------------------
// 03. BIOSTIMULATION (ORC / electron acceptors)
// ---------------------------------------------------------------------------

/**
 * Gera cronograma de liberação de oxigênio de compostos ORC (Oxygen Release Compounds).
 * Modela liberação exponencial decrescente ao longo do tempo.
 *
 * @param {number} mass_kg - Massa de ORC aplicada [kg]
 * @param {number} releaseRate_mg_O2_per_kg_per_day - Taxa de liberação [mg O2 / kg ORC / day]
 * @returns {Array<{day: number, O2_released_mg: number, cumulative_mg: number}>} Cronograma diário por 365 dias
 * @throws {RangeError} Se mass_kg <= 0 ou releaseRate <= 0
 * @reference USEPA (1999). In Situ Groundwater Bioremediation Using ORC. EPA/600/R-99/029
 */
export function orcOxygenRelease(mass_kg: number, releaseRate_mg_O2_per_kg_per_day: number): Array<{day: number, O2_released_mg: number, cumulative_mg: number}> {
    if (mass_kg <= 0) {
        throw new RangeError('orcOxygenRelease: mass_kg deve ser > 0');
    }
    if (releaseRate_mg_O2_per_kg_per_day <= 0) {
        throw new RangeError('orcOxygenRelease: releaseRate deve ser > 0');
    }
    const schedule = [];
    let cumulative = 0;
    const mass_g = mass_kg * 1000;
    // Decaimento exponencial da taxa de liberação ao longo do tempo
    // half-life típico de ORC ~180 dias (Regenesis data)
    const halfLife_days = 180;
    const decayConst = Math.LN2 / halfLife_days;
    for (let day = 1; day <= 365; day++) {
        const rate_today = releaseRate_mg_O2_per_kg_per_day * Math.exp(-decayConst * (day - 1));
        const released = rate_today * mass_g;
        cumulative += released;
        schedule.push({ day, O2_released_mg: released, cumulative_mg: cumulative });
    }
    return schedule;
}

/**
 * Calcula a demanda de aceitador de elétrons para degradação de BTEX.
 * Suporta pathways aeróbico (O2), nítrico (NO3), e sulfato-redutor (SO4).
 *
 * @param {number} BTEX_mg_L - Concentração de BTEX na pluma [mg/L]
 * @param {number} plume_volume_m3 - Volume da pluma contaminada [m³]
 * @param {string} pathway - Via metabólica: 'aerobic'|'nitrate'|'sulfate'
 * @returns {number} Massa de aceitador de elétrons necessária [kg]
 * @throws {RangeError} Se concentração ou volume forem negativos
 * @throws {TypeError} Se pathway for desconhecido
 * @reference Wiedemeier et al. (1999). Natural Attenuation, Tabela 3-2
 */
export function electronAcceptorDemand(BTEX_mg_L: number, plume_volume_m3: number, pathway: string): number {
    if (BTEX_mg_L < 0) {
        throw new RangeError('electronAcceptorDemand: BTEX_mg_L deve ser >= 0');
    }
    if (plume_volume_m3 < 0) {
        throw new RangeError('electronAcceptorDemand: plume_volume_m3 deve ser >= 0');
    }
    // Razão estequiométrica [kg aceitador / kg BTEX] por pathway -- Wiedemeier 1999
        const stoichiometry: Record<string, number>= Object.freeze({
        aerobic: 3.14, // O2: oxidacao aerobica de benzeno C6H6 + 7.5 O2 -> ...
        nitrate: 4.9, // NO3-: desnitrificacao (Wiedemeier 1999 Tabela 3-2)
        sulfate: 4.7, // SO4(2-): sulfato-reducao (Wiedemeier 1999 Tabela 3-2)
    });
    if (!Object.prototype.hasOwnProperty.call(stoichiometry, pathway)) {
        throw new TypeError(
            `electronAcceptorDemand: pathway '${pathway}' desconhecido. Use 'aerobic', 'nitrate' ou 'sulfate'`,
        );
    }
    // Converter concentracao x volume -> massa total BTEX [kg]
    const plume_volume_L = plume_volume_m3 * 1000;
    const BTEX_mass_kg = (BTEX_mg_L * plume_volume_L) / 1e6;
    return BTEX_mass_kg * (stoichiometry[pathway] as number);
}

/**
 * Calcula a taxa de degradação microbiana pela equação de Monod (1949).
 * Taxa de consumo de substrato = Vmax * S / (Km + S)
 *
 * @param {number} substrate_mg_L - Concentração de substrato [mg/L]
 * @param {number} Vmax - Taxa máxima de degradação [mg/L/day]
 * @param {number} Km - Constante de meia saturação [mg/L]
 * @returns {number} Taxa de degradação [mg/L/day]
 * @throws {RangeError} Se substrate_mg_L < 0, Vmax <= 0, ou Km <= 0
 * @reference Monod, J. (1949). Ann. Rev. Microbiology, 3, 371-394. doi:10.1146/annurev.mi.03.100149.002103
 */
export function monodKinetics(substrate_mg_L: number, Vmax: number, Km: number): number {
    if (substrate_mg_L < 0) {
        throw new RangeError('monodKinetics: substrate_mg_L deve ser >= 0');
    }
    if (Vmax <= 0) {
        throw new RangeError('monodKinetics: Vmax deve ser > 0');
    }
    if (Km <= 0) {
        throw new RangeError('monodKinetics: Km deve ser > 0');
    }
    return (Vmax * substrate_mg_L) / (Km + substrate_mg_L);
}

/**
 * Retorna a constante de meia saturação de Monod (Km) para um composto BTEX.
 * Valores de Wiedemeier et al. (1999) Tabela B-4.
 *
 * @param {string} compound - Nome do composto: 'benzene'|'toluene'|'ethylbenzene'|'xylenes'
 *                            ou aliases em português: 'benzeno'|'tolueno'|'etilbenzeno'|'xilenos'
 * @returns {number} Km [mg/L]
 * @throws {TypeError} Se o composto não for reconhecido
 * @reference Wiedemeier, T.H. et al. (1999). Natural Attenuation, Tabela B-4
 */
export function halfSaturationBTEX(compound: string): number {
    const key = typeof compound === 'string' ? compound.toLowerCase().trim() : '';
    const table = (HALF_SATURATION_TABLE as Record<string, number>);
    if (!Object.prototype.hasOwnProperty.call(table, key)) {
        throw new TypeError(
            `halfSaturationBTEX: composto '${compound}' nao reconhecido. ` +
                `Use: benzene, toluene, ethylbenzene, xylenes (ou equivalentes em PT)`,
        );
    }
    return table[key] as number;
}

// ---------------------------------------------------------------------------
// 04. BIOAUGMENTATION
// ---------------------------------------------------------------------------

/**
 * Estima a duração da fase lag na bioaugmentação.
 * A fase lag aumenta quando a densidade do inóculo está muito abaixo da densidade alvo.
 *
 * lag_days = base_lag * (targetDegradationRate / inoculumDensity_ratio)^0.5
 * onde inoculumDensity_ratio = inoculumDensity / biomass_CFU_mL
 *
 * @param {number} biomass_CFU_mL - Biomassa inicial no solo [UFC/mL]
 * @param {number} targetDegradationRate - Taxa de degradação alvo [day⁻¹]
 * @param {number} inoculumDensity - Densidade do inóculo aplicado [UFC/mL]
 * @returns {number} Fase lag estimada [days]
 * @throws {RangeError} Se biomass ou inoculumDensity forem <= 0
 * @reference Hyman & Dupont (2001). Groundwater and Soil Remediation, Cap. 8
 */
export function lagPhaseEstimate(biomass_CFU_mL: number, targetDegradationRate: number, inoculumDensity: number): number {
    if (biomass_CFU_mL <= 0) {
        throw new RangeError('lagPhaseEstimate: biomass_CFU_mL deve ser > 0');
    }
    if (targetDegradationRate <= 0) {
        throw new RangeError('lagPhaseEstimate: targetDegradationRate deve ser > 0');
    }
    if (inoculumDensity <= 0) {
        throw new RangeError('lagPhaseEstimate: inoculumDensity deve ser > 0');
    }
    // Fase lag base de 2 dias com condições ótimas (literatura bioaugmentação)
    const baseLag_days = 2.0;
    // Razão de densidade: quanto menor a razão, maior a fase lag
    const densityRatio = inoculumDensity / biomass_CFU_mL;
    // Fator de escala baseado na taxa de degradação alvo vs capacidade imediata
    const scaleFactor = Math.sqrt(targetDegradationRate / Math.min(densityRatio, 1.0));
    return baseLag_days * scaleFactor;
}

/**
 * Calcula o tempo de duplicação microbiano pelo modelo de Monod.
 *
 * t_double = ln(2) / mu = ln(2) * (Km + S) / (mu_max * S)
 *
 * @param {number} mu_max - Taxa máxima de crescimento específico [h⁻¹]
 * @param {number} substrate - Concentração de substrato [mg/L]
 * @param {number} Km - Constante de meia saturação [mg/L]
 * @returns {number} Tempo de duplicação [hours]
 * @throws {RangeError} Se mu_max <= 0, substrate < 0, ou Km <= 0
 * @reference Monod, J. (1949). Ann. Rev. Microbiology, 3, 371-394
 */
export function doublingTime(mu_max: number, substrate: number, Km: number): number {
    if (mu_max <= 0) {
        throw new RangeError('doublingTime: mu_max deve ser > 0');
    }
    if (substrate < 0) {
        throw new RangeError('doublingTime: substrate deve ser >= 0');
    }
    if (Km <= 0) {
        throw new RangeError('doublingTime: Km deve ser > 0');
    }
    if (substrate === 0) return Infinity;
    const mu_actual = (mu_max * substrate) / (Km + substrate);
    return Math.LN2 / mu_actual;
}

/**
 * Calcula o volume de inóculo necessário para bioaugmentação de pluma.
 *
 * Volume_inoculum = (plume_volume_L * targetCFU_mL) / inoculumCFU_mL
 *
 * @param {number} plume_volume_L - Volume da pluma a ser tratada [L]
 * @param {number} targetCFU_mL - Densidade microbiana alvo no aquífero [UFC/mL]
 * @param {number} inoculumCFU_mL - Densidade do inóculo concentrado [UFC/mL]
 * @returns {number} Volume de inóculo necessário [L]
 * @throws {RangeError} Se plume_volume_L < 0 ou densidades <= 0
 * @reference Hyman & Dupont (2001). Groundwater and Soil Remediation, Cap. 8
 */
export function bioaugmentationDose(plume_volume_L: number, targetCFU_mL: number, inoculumCFU_mL: number): number {
    if (plume_volume_L < 0) {
        throw new RangeError('bioaugmentationDose: plume_volume_L deve ser >= 0');
    }
    if (targetCFU_mL <= 0) {
        throw new RangeError('bioaugmentationDose: targetCFU_mL deve ser > 0');
    }
    if (inoculumCFU_mL <= 0) {
        throw new RangeError('bioaugmentationDose: inoculumCFU_mL deve ser > 0');
    }
    return (plume_volume_L * targetCFU_mL) / inoculumCFU_mL;
}

/**
 * Calcula a fração de declorinação redutiva completa em plumas de PCE/TCE/cDCE/VC.
 * Uma alta concentração de VC (cloreto de vinila) indica progresso INCOMPLETO da
 * declorinação - o VC acumula quando a população de Dehalococcoides é insuficiente.
 *
 * completion = 1 - VC_fraction
 * onde VC_fraction = VC_mg_L / (PCE_mg_L + cDCE_mg_L + VC_mg_L)
 * (ajustado por peso molecular para equivalência molar)
 *
 * @param {number} PCE_mg_L - Concentração de PCE (tetracloroeteno) [mg/L]
 * @param {number} cDCE_mg_L - Concentração de cDCE (cis-1,2-dicloroeteno) [mg/L]
 * @param {number} VC_mg_L - Concentração de VC (cloreto de vinila) [mg/L]
 * @returns {number} Fração de completude da declorinação [0-1]
 * @throws {RangeError} Se qualquer concentração for negativa
 * @reference Maymo-Gatell, X. et al. (1997). Science, 276, 1568-1571. doi:10.1126/science.276.5318.1568
 */
export function reductiveDechloration_VC(PCE_mg_L: number, cDCE_mg_L: number, VC_mg_L: number): number {
    if (PCE_mg_L < 0 || cDCE_mg_L < 0 || VC_mg_L < 0) {
        throw new RangeError('reductiveDechloration_VC: todas as concentrações devem ser >= 0');
    }
    const total = PCE_mg_L + cDCE_mg_L + VC_mg_L;
    if (total === 0) return 1.0; // Sem contaminante = declorinação completa
    // Fração de VC indica acúmulo de produto parcial (declorinação incompleta)
    const VC_fraction = VC_mg_L / total;
    return Math.max(0, 1 - VC_fraction);
}

// ---------------------------------------------------------------------------
// 05. PERFORMANCE MONITORING
// ---------------------------------------------------------------------------

/**
 * Calcula o Quociente Respiratório (QR/RQ) a partir de dados de teste de respiração.
 * RQ = CO2 produzido / O2 consumido
 * Para hidrocarbonetos aeróbicos: RQ ≈ 1.0
 * Para compostos mais oxidados (ex: ácido acético): RQ > 1.0
 * Para lipídios: RQ < 1.0
 *
 * @param {number} O2_consumed_mg_L - O2 consumido no intervalo [mg/L]
 * @param {number} CO2_produced_mg_L - CO2 produzido no intervalo [mg/L]
 * @returns {number} Quociente Respiratório [adimensional]
 * @throws {RangeError} Se O2_consumed <= 0 ou CO2_produced < 0
 * @reference USEPA (1995) EPA/540/R-95/534A, Seção 4 - field respiration tests
 */
export function respirationTest(O2_consumed_mg_L: number, CO2_produced_mg_L: number): number {
    if (O2_consumed_mg_L <= 0) {
        throw new RangeError('respirationTest: O2_consumed_mg_L deve ser > 0');
    }
    if (CO2_produced_mg_L < 0) {
        throw new RangeError('respirationTest: CO2_produced_mg_L deve ser >= 0');
    }
    return CO2_produced_mg_L / O2_consumed_mg_L;
}

/**
 * Calcula a eficiência do biossparging comparando a taxa de reaeração com
 * a demanda biológica de oxigênio.
 *
 * efficiency = (reaeration_mg_L_day / demand_mg_L_day) * 100
 * Limitado a 100% no máximo.
 *
 * @param {number} reaeration_mg_L_day - Taxa de transferência de O2 via sparging [mg/L/day]
 * @param {number} demand_mg_L_day - Demanda biológica de O2 [mg/L/day]
 * @returns {number} Eficiência do biossparging [%]
 * @throws {RangeError} Se reaeration < 0 ou demand <= 0
 * @reference USEPA (1994). How to Evaluate Alternative Cleanup Technologies. EPA 542-B-94-003
 */
export function biosparging_efficiency(reaeration_mg_L_day: number, demand_mg_L_day: number): number {
    if (reaeration_mg_L_day < 0) {
        throw new RangeError('biosparging_efficiency: reaeration_mg_L_day deve ser >= 0');
    }
    if (demand_mg_L_day <= 0) {
        throw new RangeError('biosparging_efficiency: demand_mg_L_day deve ser > 0');
    }
    const eff = (reaeration_mg_L_day / demand_mg_L_day) * 100;
    return Math.min(eff, 100);
}

/**
 * Avalia a adequação de nutrientes N, P e K no solo para biodegradação microbiana.
 * Critérios baseados em limites de deficiência para biorremediação (Alexander 1994).
 *
 * Limites de adequação: N ≥ 10 ppm, P ≥ 1 ppm, K ≥ 50 ppm
 *
 * @param {number} N_ppm - Concentração de Nitrogênio disponível [ppm = mg/kg]
 * @param {number} P_ppm - Concentração de Fósforo disponível [ppm = mg/kg]
 * @param {number} K_ppm - Concentração de Potássio disponível [ppm = mg/kg]
 * @returns {string} 'adequate' | 'N-deficient' | 'P-deficient' | 'K-deficient' | 'NP-deficient' | 'NK-deficient' | 'PK-deficient' | 'NPK-deficient'
 * @throws {RangeError} Se qualquer concentração for negativa
 * @reference Alexander, M. (1994). Biodegradation and Bioremediation, Cap. 6
 */
export function npk_ratio(N_ppm: number, P_ppm: number, K_ppm: number): string {
    if (N_ppm < 0 || P_ppm < 0 || K_ppm < 0) {
        throw new RangeError('npk_ratio: N_ppm, P_ppm e K_ppm devem ser >= 0');
    }
    // Limites mínimos para biorremediação efetiva (Alexander 1994)
    const N_MIN = 10;
    const P_MIN = 1;
    const K_MIN = 50;
    const nDeficient = N_ppm < N_MIN;
    const pDeficient = P_ppm < P_MIN;
    const kDeficient = K_ppm < K_MIN;
    if (!nDeficient && !pDeficient && !kDeficient) return 'adequate';
    const parts = [];
    if (nDeficient) parts.push('N');
    if (pDeficient) parts.push('P');
    if (kDeficient) parts.push('K');
    return parts.join('') + '-deficient';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const soilBioremediationDesignMeta = {
    name: 'soilBioremediationDesign',
    description: 'Soil Bioremediation Design',
    category: 'analytics',
    familyTags: ['soil', 'remediation', 'hydrocarbon'],
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
