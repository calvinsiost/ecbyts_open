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
// Application: EHS & Mining -- Wetland Hydrology
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Wetland Hydrology - Hydrologic Budget, Retention, ET (FAO-56), Cowardin Classification
 *
 * Módulo puro para modelagem hidrológica de áreas úmidas: balanço hídrico,
 * retenção de nutrientes/poluentes, evapotranspiração de referência (Penman-Monteith
 * FAO-56) e classificação tipológica (Cowardin 1979).
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Allen, R. G., Pereira, L. S., Raes, D., & Smith, M. (1998). Crop
 *     Evapotranspiration - Guidelines for Computing Crop Water Requirements.
 *     FAO Irrigation and Drainage Paper 56. Rome: FAO.
 *     ISBN 92-5-104219-5. (Penman-Monteith ET0)
 *   - Cowardin, L. M., Carter, V., Golet, F. C., & LaRoe, E. T. (1979).
 *     Classification of Wetlands and Deepwater Habitats of the United States.
 *     FWS/OBS-79/31. Washington, DC: USFWS.
 *     (classificação tipológica de áreas úmidas)
 *   - Mitsch, W. J., & Gosselink, J. G. (2007). Wetlands (4th ed.).
 *     Hoboken, NJ: Wiley. ISBN 978-0-471-69967-5.
 *     (balanço hídrico e retenção em wetlands)
 *
 * @module wetlandHydrology
 */

'use strict';

// --- Constantes Penman-Monteith FAO-56 ---
// Constante psicrométrica γ a nível do mar (kPa/°C) - FAO-56 Eq. 8
const PSYCHROMETRIC_CONST = 0.067;

/**
 * Compute wetland hydrologic budget (water balance).
 * Calcula o balanço hídrico de uma área úmida para um período dado.
 *
 * ΔS = P + Q_in − ET − Q_out − S_eepage
 *
 * Todos os termos em mm/período.
 *
 * @param {number} precipitation - Precipitação total no período (mm)
 * @param {number} evapotranspiration - Evapotranspiração total no período (mm)
 * @param {number} inflow - Entrada de água superficial/subsuperficial (mm equivalente)
 * @param {number} outflow - Saída de água superficial/subsuperficial (mm equivalente)
 * @param {number} seepage - Percolação / perda por infiltração profunda (mm)
 * @returns {{ deltaStorage: number, surplus: boolean }}
 *   deltaStorage: variação do armazenamento (mm, positivo = acúmulo)
 *   surplus: true se o wetland está em ganho hídrico líquido
 * @throws {RangeError} Se qualquer parâmetro for negativo
 *
 * Referência: Mitsch & Gosselink (2007) Wetlands, Ch. 4, Eq. 4.1.
 */
export function computeHydrologicBudget(precipitation: number, evapotranspiration: number, inflow: number, outflow: number, seepage: number): { deltaStorage: number, surplus: boolean } {
    if (precipitation < 0 || evapotranspiration < 0 || inflow < 0 || outflow < 0 || seepage < 0) {
        throw new RangeError('computeHydrologicBudget: all terms must be non-negative (mm)');
    }

    // ΔS = entradas − saídas
    const deltaStorage = precipitation + inflow - evapotranspiration - outflow - seepage;
    const surplus = deltaStorage > 0;

    return { deltaStorage, surplus };
}

/**
 * Compute wetland nutrient/pollutant retention efficiency.
 * Calcula a eficiência de retenção de cargas (nutrientes, sedimentos, poluentes)
 * por uma área úmida.
 *
 * Retenção (%) = (carga_entrada − carga_saída) / carga_entrada × 100
 *
 * @param {number} inflowLoad_kg - Carga total entrando no wetland (kg/período)
 * @param {number} outflowLoad_kg - Carga total saindo do wetland (kg/período)
 * @returns {{ retentionPct: number, massRetained_kg: number }}
 * @throws {RangeError} Se inflowLoad for negativo ou outflow exceder inflow
 * @throws {TypeError} Se inflowLoad for zero (divisão impossível)
 *
 * Referência: Mitsch & Gosselink (2007) Wetlands, Ch. 18 - nutrient budgets.
 */
export function computeWetlandRetention(inflowLoad_kg: number, outflowLoad_kg: number): { retentionPct: number, massRetained_kg: number } {
    if (inflowLoad_kg < 0 || outflowLoad_kg < 0) {
        throw new RangeError('computeWetlandRetention: loads must be non-negative (kg)');
    }
    if (inflowLoad_kg === 0) {
        throw new TypeError('computeWetlandRetention: inflowLoad_kg must be > 0 to compute retention');
    }
    if (outflowLoad_kg > inflowLoad_kg) {
        throw new RangeError(
            'computeWetlandRetention: outflowLoad cannot exceed inflowLoad ' + '(internal generation not modeled)',
        );
    }

    const massRetained_kg = inflowLoad_kg - outflowLoad_kg;
    const retentionPct = (massRetained_kg / inflowLoad_kg) * 100;

    return { retentionPct, massRetained_kg };
}

/**
 * Compute reference evapotranspiration using Penman-Monteith FAO-56.
 * Calcula a evapotranspiração de referência (ET0) pelo método FAO-56.
 *
 * ET0 = [0.408 × Δ × Rn + γ × (900 / (T+273)) × u2 × (es−ea)]
 *       / [Δ + γ × (1 + 0.34 × u2)]
 *
 * @param {number} netRadiation_W_m2 - Radiação líquida à superfície (W/m²)
 * @param {number} airTemp_C - Temperatura média do ar (°C)
 * @param {number} windSpeed_m_s - Velocidade do vento a 2 m de altura (m/s)
 * @param {number} relHumidity_pct - Umidade relativa do ar (%, 0–100)
 * @returns {number} ET0 em mm/dia
 * @throws {RangeError} Se parâmetros estiverem fora de faixas físicas
 *
 * Referência: Allen et al. (1998) FAO-56, Eq. 6 (p. 24).
 */
export function computeEvapotranspiration(netRadiation_W_m2: number, airTemp_C: number, windSpeed_m_s: number, relHumidity_pct: number): number {
    if (windSpeed_m_s < 0 || relHumidity_pct < 0 || relHumidity_pct > 100) {
        throw new RangeError('computeEvapotranspiration: windSpeed≥0, 0≤relHumidity≤100');
    }
    if (airTemp_C < -50 || airTemp_C > 60) {
        throw new RangeError('computeEvapotranspiration: airTemp_C must be between -50 and 60 °C');
    }

    // Pressão de saturação do vapor (kPa) - FAO-56 Eq. 11
    const es = 0.6108 * Math.exp((17.27 * airTemp_C) / (airTemp_C + 237.3));
    // Pressão atual do vapor (kPa) - FAO-56 Eq. 17
    const ea = (relHumidity_pct / 100) * es;

    // Declividade da curva de pressão de saturação (kPa/°C) - FAO-56 Eq. 13
    const delta = (4098 * es) / Math.pow(airTemp_C + 237.3, 2);

    // Converter radiação de W/m² para MJ/m²/dia (1 W/m² = 0.0864 MJ/m²/dia)
    const Rn_MJ = netRadiation_W_m2 * 0.0864;

    const gamma = PSYCHROMETRIC_CONST;

    // Numerador: componente de energia + componente aerodinâmica
    const numerator = 0.408 * delta * Rn_MJ + gamma * (900 / (airTemp_C + 273)) * windSpeed_m_s * (es - ea);

    // Denominador: coeficiente de resistência superficial
    const denominator = delta + gamma * (1 + 0.34 * windSpeed_m_s);

    const et0 = numerator / denominator;

    // ET0 pode ser ligeiramente negativa em condições extremas (madrugada com orvalho)
    // retornamos 0 como limite físico inferior
    return Math.max(0, et0);
}

/**
 * Classify wetland type using Cowardin (1979) USFWS system.
 * Classifica o tipo de área úmida de acordo com Cowardin et al. (1979).
 *
 * Regras de classificação:
 *   - estuary: salinidade > 0.5 ppt (influência marinha/estuarina)
 *   - bog: alimentado por chuva (hydrology='rain-fed') + presença de sphagnum
 *   - fen: alimentado por água subterrânea (hydrology='groundwater-fed')
 *   - swamp: vegetação lenhosa dominante (vegetation='woody')
 *   - marsh: vegetação emergente em água doce (padrão)
 *
 * @param {'rain-fed'|'groundwater-fed'|'surface-flow'|'tidal'} hydrology - Fonte hídrica dominante
 * @param {number} salinity_ppt - Salinidade da água (ppt = g/kg)
 * @param {'emergent'|'woody'|'sphagnum'|'submerged'|'floating'} vegetation - Tipo de vegetação dominante
 * @returns {{ type: 'marsh'|'swamp'|'bog'|'fen'|'estuary' }}
 * @throws {RangeError} Se salinity for negativa
 *
 * Referência: Cowardin et al. (1979) FWS/OBS-79/31, Classification System.
 */
export function classifyWetlandType(hydrology: 'rain-fed'|'groundwater-fed'|'surface-flow'|'tidal', salinity_ppt: number, vegetation: 'emergent'|'woody'|'sphagnum'|'submerged'|'floating'): { type: 'marsh'|'swamp'|'bog'|'fen'|'estuary' } {
    if (salinity_ppt < 0) {
        throw new RangeError('classifyWetlandType: salinity_ppt must be ≥ 0');
    }

    // Estuário: influência salina (mar, mangue, marisma)
    if (salinity_ppt > 0.5) {
        return { type: 'estuary' };
    }

    // Bog (turfeira ácida): alimentado exclusivamente por chuva + sphagnum
    if (hydrology === 'rain-fed' && vegetation === 'sphagnum') {
        return { type: 'bog' };
    }

    // Fen (turfeira básica): alimentado por água subterrânea rica em minerais
    if (hydrology === 'groundwater-fed') {
        return { type: 'fen' };
    }

    // Swamp: vegetação arbórea/arbustiva (cipreste, árvores de várzea)
    if (vegetation === 'woody') {
        return { type: 'swamp' };
    }

    // Marsh: vegetação emergente herbácea em água doce (padrão)
    return { type: 'marsh' };
}

/**
 * Compute wetland water budget (Mitsch & Gosselink 2015).
 * Calcula o balanço hídrico de uma área úmida com termos de troca.
 *
 * ΔS = P - ET + Qin + Qgw
 * storage_m3 = (net_change_mm / 1000) × area_ha × 10000
 *
 * @param {number} precipitation_mm - Precipitação no período (mm)
 * @param {number} evapotranspiration_mm - Evapotranspiração no período (mm)
 * @param {number} surface_inflow_m3 - Entrada de água superficial (m³)
 * @param {number} groundwater_exchange_m3 - Troca com aquífero (m³, pode ser negativo = perdas)
 * @param {number} area_ha - Área da wetland (ha)
 * @returns {{ net_change_mm: number, storage_m3: number }}
 * @throws {RangeError} Se precipitation, evapotranspiration ou area_ha forem negativos
 * @throws {TypeError} Se area_ha for zero
 *
 * Referência: Mitsch, W. J., & Gosselink, J. G. (2015). Wetlands (5th ed.).
 *   Hoboken, NJ: Wiley. ISBN 9781118676820.
 */
export function computeWetlandWaterBudget(precipitation_mm: number, evapotranspiration_mm: number, surface_inflow_m3: number, groundwater_exchange_m3: number, area_ha: number): { net_change_mm: number, storage_m3: number } {
    if (precipitation_mm < 0 || evapotranspiration_mm < 0) {
        throw new RangeError('computeWetlandWaterBudget: precipitation e evapotranspiration devem ser ≥ 0');
    }
    if (area_ha < 0) {
        throw new RangeError('computeWetlandWaterBudget: area_ha deve ser ≥ 0');
    }
    if (area_ha === 0) {
        throw new TypeError('computeWetlandWaterBudget: area_ha deve ser > 0');
    }

    // Converter inflows de m³ para mm equivalente sobre a área
    const area_m2 = area_ha * 10000;
    const inflow_mm = (surface_inflow_m3 / area_m2) * 1000;
    const gw_mm = (groundwater_exchange_m3 / area_m2) * 1000;

    // Balanço hídrico: ΔS = P - ET + Qin + Qgw (todos em mm)
    const net_change_mm = precipitation_mm - evapotranspiration_mm + inflow_mm + gw_mm;

    // Converter resultado de volta para m³
    const storage_m3 = (net_change_mm / 1000) * area_m2;

    return { net_change_mm, storage_m3 };
}

/**
 * Compute wetland hydroperiod and classify inundation regime.
 * Calcula o hidroperíodo (fração do tempo inundada) e classifica o regime.
 *
 * hydroperiod_pct = (days_inundated / total_days) × 100
 * Permanent: ≥ 80% | Seasonal: 30–80% | Temporary: < 30%
 *
 * @param {number} days_inundated - Dias com inundação no período
 * @param {number} total_days - Total de dias do período observado
 * @returns {{ hydroperiod_pct: number, classification: 'permanent'|'seasonal'|'temporary' }}
 * @throws {RangeError} Se dias_inundados > total_dias ou valores negativos
 * @throws {TypeError} Se total_days for zero
 *
 * Referência: Mitsch & Gosselink (2015) Wetlands (5th ed.), Ch. 3 - Wetland Hydrology.
 */
export function computeHydroperiod(days_inundated: number, total_days: number): { hydroperiod_pct: number, classification: 'permanent'|'seasonal'|'temporary' } {
    if (days_inundated < 0 || total_days < 0) {
        throw new RangeError('computeHydroperiod: dias não podem ser negativos');
    }
    if (total_days === 0) {
        throw new TypeError('computeHydroperiod: total_days deve ser > 0');
    }
    if (days_inundated > total_days) {
        throw new RangeError('computeHydroperiod: days_inundated não pode exceder total_days');
    }

    const hydroperiod_pct = (days_inundated / total_days) * 100;

    // Classificação por regime de inundação
        let classification: 'permanent'|'seasonal'|'temporary';
    if (hydroperiod_pct >= 80) {
        classification = 'permanent';
    } else if (hydroperiod_pct >= 30) {
        classification = 'seasonal';
    } else {
        classification = 'temporary';
    }

    return { hydroperiod_pct, classification };
}

/**
 * Compute wetland flood attenuation (peak flow reduction).
 * Calcula o amortecimento de cheias pela wetland usando relação de orifício.
 *
 * Qout = outlet_coef × sqrt(storage / 1000)
 * attenuation_pct = (Qin - Qout) / Qin × 100
 *
 * @param {number} peak_inflow_m3_s - Vazão de pico na entrada (m³/s)
 * @param {number} storage_volume_m3 - Volume de armazenamento da wetland (m³)
 * @param {number} outlet_coefficient - Coeficiente de descarga do exutório (adimensional)
 * @returns {{ peak_outflow_m3_s: number, attenuation_pct: number }}
 * @throws {RangeError} Se parâmetros forem negativos
 * @throws {TypeError} Se peak_inflow for zero (impossível calcular atenuação relativa)
 *
 * Referência: Mitsch & Gosselink (2015) Wetlands (5th ed.), Ch. 4 - Hydrologic Processes.
 */
export function computeWetlandFloodAttenuation(peak_inflow_m3_s: number, storage_volume_m3: number, outlet_coefficient: number): { peak_outflow_m3_s: number, attenuation_pct: number } {
    if (peak_inflow_m3_s < 0 || storage_volume_m3 < 0 || outlet_coefficient < 0) {
        throw new RangeError('computeWetlandFloodAttenuation: parâmetros devem ser ≥ 0');
    }
    if (peak_inflow_m3_s === 0) {
        throw new TypeError('computeWetlandFloodAttenuation: peak_inflow_m3_s deve ser > 0');
    }

    // Vazão de saída via relação de orifício simplificada
    const peak_outflow_m3_s = outlet_coefficient * Math.sqrt(storage_volume_m3 / 1000);

    // A vazão de saída não pode exceder a de entrada (conservação de massa)
    const bounded_outflow = Math.min(peak_outflow_m3_s, peak_inflow_m3_s);

    const attenuation_pct = ((peak_inflow_m3_s - bounded_outflow) / peak_inflow_m3_s) * 100;

    return { peak_outflow_m3_s: bounded_outflow, attenuation_pct };
}

/**
 * Classify wetland ecosystem function based on composite indicators.
 * Classifica a funcionalidade ecossistêmica da wetland por score composto.
 *
 * Score = média simples de três indicadores normalizados [0,1]:
 *   - hidroperíodo (>= 60% → 1.0, >= 30% → 0.5, < 30% → 0.0)
 *   - cobertura vegetal (>= 70% → 1.0, >= 40% → 0.5, < 40% → 0.0)
 *   - qualidade da água (0–10 escala)
 *
 * Limiares: pristine ≥ 0.85, reference ≥ 0.65, functional ≥ 0.40,
 *   impaired ≥ 0.20, degraded < 0.20
 *
 * @param {number} hydroperiod_pct - Hidroperíodo (%, 0–100)
 * @param {number} vegetation_cover_pct - Cobertura vegetal nativa (%, 0–100)
 * @param {number} water_quality_index - Índice de qualidade da água (0–10)
 * @returns {{ function_class: 'degraded'|'impaired'|'functional'|'reference' }}
 * @throws {RangeError} Se parâmetros estiverem fora dos intervalos válidos
 *
 * Referência: Mitsch & Gosselink (2015) Wetlands (5th ed.), Ch. 16 - Wetland Values.
 */
export function classifyWetlandFunction(hydroperiod_pct: number, vegetation_cover_pct: number, water_quality_index: number): { function_class: 'degraded'|'impaired'|'functional'|'reference' } {
    if (hydroperiod_pct < 0 || hydroperiod_pct > 100) {
        throw new RangeError('classifyWetlandFunction: hydroperiod_pct deve ser 0–100');
    }
    if (vegetation_cover_pct < 0 || vegetation_cover_pct > 100) {
        throw new RangeError('classifyWetlandFunction: vegetation_cover_pct deve ser 0–100');
    }
    if (water_quality_index < 0 || water_quality_index > 10) {
        throw new RangeError('classifyWetlandFunction: water_quality_index deve ser 0–10');
    }

    // Normalização de cada indicador para escala [0, 1]
    const hydro_score = hydroperiod_pct >= 60 ? 1.0 : hydroperiod_pct >= 30 ? 0.5 : 0.0;
    const veg_score = vegetation_cover_pct >= 70 ? 1.0 : vegetation_cover_pct >= 40 ? 0.5 : 0.0;
    const wq_score = water_quality_index / 10;

    const composite = (hydro_score + veg_score + wq_score) / 3;

        let function_class: 'reference'|'functional'|'impaired'|'degraded';
    if (composite >= 0.85) {
        function_class = 'reference';
    } else if (composite >= 0.65) {
        function_class = 'reference';
    } else if (composite >= 0.4) {
        function_class = 'functional';
    } else if (composite >= 0.15) {
        function_class = 'impaired';
    } else {
        function_class = 'degraded';
    }

    return { function_class };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const wetlandHydrologyMeta = {
    name: 'wetlandHydrology',
    description: 'Wetland Hydrology',
    category: 'analytics',
    familyTags: ['wetland', 'hydrogeology'],
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
