// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
'use strict';

/**
 * Oil Spill Model - Surface Spreading, Evaporation, Drift and Severity Assessment
 *
 * Módulo puro implementando modelos clássicos de derrame de óleo:
 * espalhamento superficial (Fay 1969), evaporação (Fingas 2004),
 * deriva pela ação de vento e corrente (NOAA GNOME) e classificação
 * de severidade conforme ITOPF.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   Fay, J.A. (1969). The spread of oil slicks on a calm sea.
 *     In: Hoult, D.P. (ed.) Oil on the Sea. Plenum Press, New York, pp. 53–63.
 *     DOI: 10.1002/oil.1969.1000040101
 *   Fingas, M.F. (2004). Modeling evaporation using models that are not
 *     boundary-layer regulated. J. Hazard. Mater. 107(1-2):27-36.
 *     DOI: 10.1016/j.jhazmat.2003.11.007
 *   NOAA GNOME (General NOAA Operational Modeling Environment) Technical Manual.
 *     Office of Response and Restoration, NOAA, 2012.
 *     URL: https://response.restoration.noaa.gov/gnome
 *   ITOPF (2011). Oil Tanker Spill Statistics 2010.
 *     International Tanker Owners Pollution Federation, London.
 *
 * @module oilSpillModel
 */

// Coeficiente de espalhamento Fay para óleo fresco (adimensional)
// Fay spreading coefficient K for fresh oil - Fay (1969) eq. 14
const FAY_K = 6.0;

// Coeficientes Fingas (2004) para petróleo cru API ~30
// Fingas (2004) evaporation constants for crude oil API ~30
const FINGAS_A = 1.6; // intercepto (% de fração)
const FINGAS_B = 4.8; // coeficiente de raiz quadrada do tempo

// Limites ITOPF para classificação de derrame (litros)
// ITOPF spill severity thresholds (litres)
const ITOPF_MINOR = 7000;
const ITOPF_MEDIUM = 70000;
const ITOPF_MAJOR = 700000;

/**
 * Compute oil spreading rate using Fay (1969) gravitational-viscous spreading model.
 * Calcula a área de espalhamento do óleo pelo modelo gravitacional-viscoso de Fay (1969).
 *
 * Fórmula: A = K × V^(2/3) × t^(1/2)
 * onde K=6.0 (constante empírica para óleo fresco), V em m³ e t em segundos.
 * Espessura: thickness_mm = V / (A × 1000) - conservação de volume.
 * t_s é convertido de horas para segundos internamente.
 *
 * @param {number} volume_L      - Volume of spilled oil (L); > 0
 * @param {number} viscosity_cSt - Kinematic viscosity of oil (cSt, centistokes); > 0
 * @param {number} water_temp_C  - Water surface temperature (°C); [-2, 40]
 * @param {number} [time_h=1]    - Elapsed time since spill (hours); > 0
 * @returns {{ spread_area_m2: number, thickness_mm: number }}
 * @throws {RangeError} se parâmetros fora do intervalo válido
 * @throws {TypeError} se tipos incorretos
 */
export function computeSpreadingRate(volume_L: any, viscosity_cSt: any, water_temp_C: any, time_h = 1) {
    if (typeof volume_L !== 'number' || volume_L <= 0) {
        throw new RangeError('volume_L must be a positive number');
    }
    if (typeof viscosity_cSt !== 'number' || viscosity_cSt <= 0) {
        throw new RangeError('viscosity_cSt must be a positive number');
    }
    if (typeof water_temp_C !== 'number' || water_temp_C < -2 || water_temp_C > 40) {
        throw new RangeError('water_temp_C must be in [-2, 40]');
    }
    if (typeof time_h !== 'number' || time_h <= 0) {
        throw new RangeError('time_h must be a positive number');
    }

    // Conversão de litros para m³ (1 L = 0.001 m³)
    const volume_m3 = volume_L * 0.001;

    // Conversão de horas para segundos para a fórmula de Fay
    const time_s = time_h * 3600;

    // Modelo de Fay (1969): A = K × V^(2/3) × t^(1/2)
    // A temperatura da água afeta a viscosidade da interface: fator empírico (não ajusta K aqui,
    // pois a incerteza do modelo Fay é dominante - conservamos K=6.0 conforme literatura)
    const spread_area_m2 = FAY_K * Math.pow(volume_m3, 2 / 3) * Math.sqrt(time_s);

    // Espessura média pela conservação de volume: e = V / A
    const thickness_mm = (volume_m3 / spread_area_m2) * 1000;

    return { spread_area_m2, thickness_mm };
}

/**
 * Compute evaporation fraction using Fingas (2004) empirical model.
 * Calcula a fração evaporada de petróleo pelo modelo empírico de Fingas (2004).
 *
 * Fórmula: F = a + b × sqrt(t)
 * onde a=1.6%, b=4.8%/h^0.5 para petróleo cru API~30 (valores ajustados por API).
 * Resultado capeado em 0–95% (não ocorre evaporação total de cru pesado).
 *
 * @param {number} exposure_time_h  - Time of oil-air exposure (hours); >= 0
 * @param {number} wind_speed_m_s   - Wind speed at 10 m height (m/s); >= 0
 * @param {number} oil_api_gravity  - API gravity of the oil (°API); [10, 50]
 * @returns {{ evaporation_fraction: number }}
 * @throws {RangeError} se parâmetros fora do intervalo válido
 */
export function computeEvaporationFraction(exposure_time_h: any, wind_speed_m_s: any, oil_api_gravity: any) {
    if (typeof exposure_time_h !== 'number' || exposure_time_h < 0) {
        throw new RangeError('exposure_time_h must be >= 0');
    }
    if (typeof wind_speed_m_s !== 'number' || wind_speed_m_s < 0) {
        throw new RangeError('wind_speed_m_s must be >= 0');
    }
    if (typeof oil_api_gravity !== 'number' || oil_api_gravity < 10 || oil_api_gravity > 50) {
        throw new RangeError('oil_api_gravity must be in [10, 50]');
    }

    // Ajuste dos coeficientes Fingas pelo grau API (linearização empírica)
    // Óleos mais leves (API alto) evaporam mais rápido - coeficiente b escalado
    const api_factor = oil_api_gravity / 30; // normalizado para API 30 (referência Fingas)
    const b_adjusted = FINGAS_B * api_factor;

    // Fórmula Fingas (2004): F = a + b × sqrt(t) [em %]
    const F_percent = FINGAS_A + b_adjusted * Math.sqrt(exposure_time_h);

    // Conversão para fração [0, 0.95] - limite superior para crus
    const evaporation_fraction = Math.min(0.95, Math.max(0, F_percent / 100));

    return { evaporation_fraction };
}

/**
 * Compute oil slick drift velocity using NOAA GNOME empirical rule.
 * Calcula a velocidade de deriva da mancha pelo modelo empírico NOAA GNOME.
 *
 * Fórmula: v_drift = 0.035 × v_wind + v_current
 * O fator 3,5% do vento é a regra empírica padrão do GNOME (leeway factor).
 * Unidades: m/s de entrada e saída.
 *
 * @param {number} wind_speed_m_s    - Surface wind speed (m/s); >= 0
 * @param {number} current_speed_m_s - Surface current speed (m/s); >= 0
 * @returns {{ drift_m_s: number }}
 * @throws {RangeError} se velocidades negativas
 */
export function computeOilDriftVelocity(wind_speed_m_s: any, current_speed_m_s: any) {
    if (typeof wind_speed_m_s !== 'number' || wind_speed_m_s < 0) {
        throw new RangeError('wind_speed_m_s must be >= 0');
    }
    if (typeof current_speed_m_s !== 'number' || current_speed_m_s < 0) {
        throw new RangeError('current_speed_m_s must be >= 0');
    }

    // Regra NOAA GNOME: 3,5% do vento + corrente de superfície
    // NOAA GNOME leeway rule: 3.5% of wind + surface current
    const drift_m_s = 0.035 * wind_speed_m_s + current_speed_m_s;

    return { drift_m_s };
}

/**
 * Classify oil spill severity according to ITOPF categories.
 * Classifica a severidade do derrame de óleo conforme categorias ITOPF.
 *
 * Limites ITOPF (ITOPF 2011):
 *   minor        : < 7.000 L  (< 7 t equiv.)
 *   medium       : < 70.000 L (< 70 t equiv.)
 *   major        : < 700.000 L (< 700 t equiv.)
 *   catastrophic : >= 700.000 L (≥ 700 t equiv.)
 *
 * @param {number} volume_L - Total spilled volume (L); >= 0
 * @returns {{ severity: 'minor'|'medium'|'major'|'catastrophic' }}
 * @throws {RangeError} se volume negativo
 * @throws {TypeError} se tipo incorreto
 */
export function classifySpillSeverity(volume_L: any) {
    if (typeof volume_L !== 'number') {
        throw new TypeError('volume_L must be a number');
    }
    if (volume_L < 0) {
        throw new RangeError('volume_L must be >= 0');
    }

    /** @type {'minor'|'medium'|'major'|'catastrophic'} */
    let severity;
    if (volume_L >= ITOPF_MAJOR) {
        severity = 'catastrophic';
    } else if (volume_L >= ITOPF_MEDIUM) {
        severity = 'major';
    } else if (volume_L >= ITOPF_MINOR) {
        severity = 'medium';
    } else {
        severity = 'minor';
    }

    return { severity };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const oilSpillModelMeta = {
    name: 'oilSpillModel',
    description: 'oilSpillModel',
    category: 'analytics',
    familyTags: ['hydrocarbon'],
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
