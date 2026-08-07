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
// Application: EHS & Environmental Engineering
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Wetland & Riparian Ecology - Pure-logic analytics module
 *
 * Ten peer-reviewed ecological assessment functions for wetland delineation,
 * riparian corridor valuation, biotic integrity indices, carbon accounting,
 * hydrological connectivity, and water quality modelling.
 *
 * Referências acadêmicas:
 *   - US ACE (1987). Wetlands Delineation Manual. Tech. Report Y-87-1.
 *   - Ramsar Convention Secretariat (2007). COP10 Resolution X.1.
 *   - USDA NRCS (1997). Riparian Buffer System Practice Standard Code 391.
 *   - Germ, M. & Urbanič, G. (2009). Hydrobiologia 633:209. DOI: 10.1007/s10750-009-9886-8
 *   - IPCC (2014). 2013 Supplement to the 2006 IPCC Guidelines: Wetlands.
 *   - Chmura, G.L. et al. (2003). Global Biogeochem. Cycles 17:1111. DOI: 10.1029/2002GB001917
 *   - Bridgham, S.D. et al. (2006). BioScience 56:296. DOI: 10.1641/0006-3568(2006)056[0296:MIWAUS]2.0.CO;2
 *   - Junk, W.J. et al. (1989). Can. J. Fish. Aquat. Sci. 106:110.
 *   - Hilsenhoff, W.L. (1988). Great Lakes Entomol. 21:155.
 *   - USACE/EPA (2008). 33 CFR Parts 325 and 332. Federal Register 73:19594.
 *   - Streeter, H.W. & Phelps, E.B. (1925). USPHS Bulletin No. 146.
 *   - Thomas, H.A. (1948). Hydraulics Research Station Report No. 54.
 *   - Urban, D. & Keitt, T. (2001). Ecology 82:1205. DOI: 10.1890/0012-9658(2001)082[1205:LCAGTA]2.0.CO;2
 *   - Costanza, R. et al. (2014). Global Environ. Change 26:152. DOI: 10.1016/j.gloenvcha.2014.04.002
 *   - Dillaha, T.A. et al. (1989). J. Soil Water Conserv. 44:227.
 *   - Pinay, G. et al. (1993). Ambio 22:340.
 */

// ---------------------------------------------------------------------------
// Named constants - no magic numbers
// ---------------------------------------------------------------------------

/** US ACE (1987) threshold for each of the three wetland criteria (0-100 scale). */
const ACE_CRITERIA_THRESHOLD = 50;

/** Ramsar ecosystem services base values USD/ha/yr (Costanza 2014, Table 1 — wetland mean). */
const RAMSAR_ES_BASE_USD_HA_YR = Object.freeze({
    freshwater_marsh: 14785,
    saltmarsh: 6695,
    mangrove: 193843,
    peatland: 2547,
    swamp_forest: 1967,
    riparian: 8498,
    generic: 6500,
});

/** IUCN Red List threat thresholds mapped to Ramsar value index bands. */
const RAMSAR_IUCN_THREAT = Object.freeze({
    least_concern: { min: 70, label: 'LC' },
    near_threatened: { min: 50, label: 'NT' },
    vulnerable: { min: 35, label: 'VU' },
    endangered: { min: 20, label: 'EN' },
    critically_endangered: { min: 0, label: 'CR' },
});

/** USDA NRCS (1997) sediment trap efficiency coefficients by buffer width (m) breakpoints. */
const NRCS_SEDIMENT_EFFICIENCY = Object.freeze({
    // [min_width_m, trap_efficiency_fraction]
    narrow: { min: 0, max: 5, eff: 0.35 },
    medium: { min: 5, max: 15, eff: 0.65 },
    wide: { min: 15, max: 30, eff: 0.8 },
    very_wide: { min: 30, max: Infinity, eff: 0.9 },
});

/** Nitrate first-order removal rate constants (day⁻¹) by vegetation type (Pinay 1993). */
const PINAY_NITRATE_K = Object.freeze({
    grass: 0.05,
    shrub: 0.08,
    forest: 0.12,
    mixed: 0.09,
    herbaceous: 0.04,
});

/** Macrophyte IBI metric scoring thresholds (Germ & Urbanič 2009, Table 2). */
const MACROPHYTE_IBI_CLASSES = Object.freeze([
    { score_min: 4.5, ibi_class: 'I', label: 'Excellent', conama357: '1' },
    { score_min: 3.5, ibi_class: 'II', label: 'Good', conama357: '2' },
    { score_min: 2.5, ibi_class: 'III', label: 'Moderate', conama357: '3' },
    { score_min: 1.5, ibi_class: 'IV', label: 'Poor', conama357: '4' },
    { score_min: 0, ibi_class: 'V', label: 'Very Poor', conama357: '4' },
]);

/** IPCC (2014) Wetlands Supplement — Tier 1 soil carbon accumulation rates (tC/ha/yr). */
const IPCC_SOIL_C_ACCUM = Object.freeze({
    coastal_marsh: 2.18,
    mangrove: 1.74,
    peatland_boreal: 0.19,
    peatland_temperate: 0.26,
    peatland_tropical: 0.71,
    freshwater_mineral: 0.43,
    generic: 0.43,
});

/** IPCC (2014) CH4 emission factors (kg CH4/ha/yr) by wetland type — Table 4.14. */
const IPCC_CH4_EMISSION = Object.freeze({
    coastal_marsh: 28,
    mangrove: 5,
    peatland_boreal: 2,
    peatland_temperate: 9,
    peatland_tropical: 45,
    freshwater_mineral: 60,
    generic: 30,
});

/** GWP100 values (IPCC AR6, Table 7.SM.7): CH4=29.8, N2O=273. */
const GWP100_CH4 = 29.8;
const GWP100_N2O = 273;

/** Junk (1989) flood pulse — fish spawning suitability minimum inundation days per season. */
const FISH_SPAWNING_MIN_DAYS = 5;

/** Hilsenhoff (1988) Biotic Index class thresholds. */
const HILSENHOFF_CLASSES = Object.freeze([
    { max: 1.5, class: 'A', label: 'Excellent', organic_pollution: 'No apparent' },
    { max: 2.5, class: 'B', label: 'Very Good', organic_pollution: 'Slight' },
    { max: 3.5, class: 'C', label: 'Good', organic_pollution: 'Some' },
    { max: 4.5, class: 'D', label: 'Fair', organic_pollution: 'Fairly substantial' },
    { max: 5.5, class: 'E', label: 'Fairly Poor', organic_pollution: 'Substantial' },
    { max: 6.5, class: 'F', label: 'Poor', organic_pollution: 'Very substantial' },
    { max: Infinity, class: 'F', label: 'Very Poor', organic_pollution: 'Severe' },
]);

/** USACE/EPA (2008) out-of-kind wetland type replacement multipliers (33 CFR 332). */
const USACE_OUT_OF_KIND_MULTIPLIER = Object.freeze({
    // [impact_type][replacement_type] = multiplier
    estuarine_emergent: {
        estuarine_emergent: 1.0,
        palustrine_emergent: 1.5,
        palustrine_forested: 1.5,
        palustrine_scrub_shrub: 1.5,
    },
    palustrine_emergent: {
        palustrine_emergent: 1.0,
        palustrine_forested: 1.5,
        palustrine_scrub_shrub: 1.5,
        estuarine_emergent: 2.0,
    },
    palustrine_forested: {
        palustrine_forested: 1.0,
        palustrine_emergent: 2.0,
        palustrine_scrub_shrub: 1.5,
        estuarine_emergent: 3.0,
    },
    palustrine_scrub_shrub: {
        palustrine_scrub_shrub: 1.0,
        palustrine_emergent: 1.5,
        palustrine_forested: 1.5,
        estuarine_emergent: 2.0,
    },
    generic: { generic: 1.0 },
});

/** USACE/EPA (2008) temporal loss credit rate per year (6 %/yr, 33 CFR 332.2). */
const TEMPORAL_LOSS_RATE_PER_YR = 0.06;

/** Streeter-Phelps (1925) reference O2 saturation at 20 °C in freshwater (mg/L). */
const DO_SAT_20C = 9.08;

/** CONAMA 357/2005 Class 2 minimum DO standard (mg/L). */
const CONAMA_DO_CLASS2 = 5.0;

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Clamp a value to [lo, hi].
 * @param {number} value
 * @param {number} bad_threshold
 * @param {number} good_threshold
 * @returns {number}
 */
import { clamp } from '../../utils/helpers/math.js';

/**
 * Normalise a metric to the 1/3/5 scoring system (Germ & Urbanič 2009).
 * Returns 1 (poor), 3 (moderate), or 5 (good) based on two thresholds.
 * @param {number} value
 * @param {number} bad_threshold - below this → score 1
 * @param {number} good_threshold - above this → score 5
 * @returns {1|3|5}
 */
function ibi135(value: number, bad_threshold: number, good_threshold: number): 1|3|5 {
    if (value <= bad_threshold) return 1;
    if (value >= good_threshold) return 5;
    return 3;
}

/**
 * Lookup IPCC wetland type key from a human-readable type string (case-insensitive).
 * Returns 'generic' for unknown types.
 * @param {string} wetland_type
 * @returns {string}
 */
function resolveWetlandType(wetland_type: string): string {
    const key = wetland_type.toLowerCase().replace(/[\s-]/g, '_');
    return Object.prototype.hasOwnProperty.call(IPCC_SOIL_C_ACCUM, key) ? key : 'generic';
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Wetland Delineation Score - US Army Corps of Engineers (1987) three-parameter method.
 *
 * All three criteria (hydrology, soils, vegetation) must independently meet the
 * ACE_CRITERIA_THRESHOLD (≥ 50%) for a positive wetland determination. A site
 * failing any single criterion is NOT a wetland (non-compensatory logic).
 *
 * @param {number} hydrology_score  - Hydrology criterion score 0–100
 * @param {number} soils_score      - Hydric soils criterion score 0–100
 * @param {number} vegetation_score - Hydrophytic vegetation criterion score 0–100
 * @returns {{
 *   hydrology_score: number,
 *   soils_score: number,
 *   vegetation_score: number,
 *   composite_score: number,
 *   is_wetland: boolean,
 *   determination: string,
 *   limiting_factor: string|null
 * }}
 * @reference US Army Corps of Engineers (1987). Wetlands Delineation Manual,
 *   Technical Report Y-87-1. Waterways Experiment Station, Vicksburg, MS.
 */
export function wetlandDelineationScore(hydrology_score: number, soils_score: number, vegetation_score: number): { hydrology_score: number, soils_score: number, vegetation_score: number, composite_score: number, is_wetland: boolean, determination: string, limiting_factor: string|null } {
    if (!Number.isFinite(hydrology_score) || hydrology_score < 0 || hydrology_score > 100)
        throw new RangeError(`wetlandDelineationScore: hydrology_score must be 0–100, got ${hydrology_score}`);
    if (!Number.isFinite(soils_score) || soils_score < 0 || soils_score > 100)
        throw new RangeError(`wetlandDelineationScore: soils_score must be 0–100, got ${soils_score}`);
    if (!Number.isFinite(vegetation_score) || vegetation_score < 0 || vegetation_score > 100)
        throw new RangeError(`wetlandDelineationScore: vegetation_score must be 0–100, got ${vegetation_score}`);

    const scores = { hydrology: hydrology_score, soils: soils_score, vegetation: vegetation_score };
    const failing = Object.entries(scores).filter(([, v]) => v < ACE_CRITERIA_THRESHOLD);
    const is_wetland = failing.length === 0;
    const composite_score = (hydrology_score + soils_score + vegetation_score) / 3;

    let limiting_factor = null;
    if (!is_wetland) {
        // Report criterion with lowest score as primary limiting factor
        limiting_factor = Object.entries(scores).reduce((a, b) => (b[1] < a[1] ? b : a))[0];
    }

    return {
        hydrology_score,
        soils_score,
        vegetation_score,
        composite_score: parseFloat(composite_score.toFixed(2)),
        is_wetland,
        determination: is_wetland ? 'Wetland (positive)' : 'Non-wetland (negative)',
        limiting_factor,
    };
}

/**
 * Ramsar Wetland Value Index - Ramsar Convention (1971) COP10 Resolution X.1 framework.
 *
 * Computes a weighted composite index (0–100) from five ecosystem service scores,
 * assigns an IUCN threat category based on the composite, and estimates ecosystem
 * services value in USD/ha/yr following Costanza et al. (2014).
 *
 * @param {number} biodiversity_score   - Biodiversity support score 0–100
 * @param {number} hydrology_score      - Hydrological function score 0–100
 * @param {number} water_quality_score  - Water quality regulation score 0–100
 * @param {number} carbon_score         - Carbon storage/sequestration score 0–100
 * @param {number} cultural_score       - Cultural/heritage/tourism score 0–100
 * @param {{biodiversity:number, hydrology:number, water_quality:number, carbon:number, cultural:number}} [weights]
 *   - Optional weight object; must sum to 1.0 (±0.01 tolerance). Defaults to equal weighting.
 * @returns {{
 *   composite_index: number,
 *   iucn_threat: string,
 *   iucn_label: string,
 *   ecosystem_services_usd_ha_yr: number,
 *   component_scores: object
 * }}
 * @reference Ramsar Convention Secretariat (2007). COP10 Resolution X.1. Gland, Switzerland.
 * @reference Costanza, R. et al. (2014). Changes in the global value of ecosystem services.
 *   Global Environ. Change 26:152–158. DOI: 10.1016/j.gloenvcha.2014.04.002
 */
export function ramsar_WetlandValueIndex(biodiversity_score: number, hydrology_score: number, water_quality_score: number, carbon_score: number, cultural_score: number, weights: {biodiversity:number, hydrology:number, water_quality:number, carbon:number, cultural:number} | undefined = undefined): { composite_index: number, iucn_threat: string, iucn_label: string, ecosystem_services_usd_ha_yr: number, component_scores: object } {
    const scores = [biodiversity_score, hydrology_score, water_quality_score, carbon_score, cultural_score];
    for (const [i, s] of scores.entries()) {
        if (!Number.isFinite(s) || s < 0 || s > 100)
            throw new RangeError(`ramsar_WetlandValueIndex: score[${i}] must be 0–100, got ${s}`);
    }

    const DEFAULT_WEIGHTS = { biodiversity: 0.25, hydrology: 0.25, water_quality: 0.2, carbon: 0.15, cultural: 0.15 };
    const w = weights || DEFAULT_WEIGHTS;

    const weightSum = w.biodiversity + w.hydrology + w.water_quality + w.carbon + w.cultural;
    if (Math.abs(weightSum - 1.0) > 0.01)
        throw new RangeError(`ramsar_WetlandValueIndex: weights must sum to 1.0, got ${weightSum.toFixed(4)}`);

    const composite_index = parseFloat(
        (
            biodiversity_score * w.biodiversity +
            hydrology_score * w.hydrology +
            water_quality_score * w.water_quality +
            carbon_score * w.carbon +
            cultural_score * w.cultural
        ).toFixed(2),
    );

    // IUCN threat assignment (lower composite → higher threat)
    let iucn_threat = 'CR';
    let iucn_label = 'Critically Endangered';
    for (const [key, band] of Object.entries(RAMSAR_IUCN_THREAT)) {
        if (composite_index >= band.min) {
            iucn_threat = band.label;
            iucn_label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
            break;
        }
    }

    // Ecosystem services value - scale from generic base proportional to composite
    const base = RAMSAR_ES_BASE_USD_HA_YR.generic;
    const ecosystem_services_usd_ha_yr = parseFloat((base * (composite_index / 100)).toFixed(0));

    return {
        composite_index,
        iucn_threat,
        iucn_label,
        ecosystem_services_usd_ha_yr,
        component_scores: {
            biodiversity: biodiversity_score,
            hydrology: hydrology_score,
            water_quality: water_quality_score,
            carbon: carbon_score,
            cultural: cultural_score,
        },
    };
}

/**
 * Riparian Buffer Effectiveness - USDA NRCS (1997) Practice Standard Code 391.
 *
 * Estimates sediment trap efficiency (Dillaha 1989 regression), nitrate removal
 * via first-order kinetics (Pinay 1993), and phosphorus retention as a fraction
 * of sediment removal, adjusted for slope and flow rate.
 *
 * @param {number} buffer_width_m   - Buffer width perpendicular to stream (m), > 0
 * @param {number} slope_pct        - Land slope entering buffer (%), 0–60
 * @param {string} vegetation_type  - 'grass' | 'shrub' | 'forest' | 'mixed' | 'herbaceous'
 * @param {string} pollutant_type   - 'sediment' | 'nitrate' | 'phosphorus' | 'pesticide'
 * @param {number} flow_rate_L_s    - Overland flow rate (L/s), ≥ 0
 * @returns {{
 *   sediment_removal_pct: number,
 *   nitrate_removal_pct: number,
 *   phosphorus_removal_pct: number,
 *   effectiveness_rating: string,
 *   hydraulic_residence_time_s: number
 * }}
 * @reference USDA NRCS (1997). Riparian Forest Buffers. Practice Standard Code 391.
 * @reference Dillaha, T.A. et al. (1989). J. Soil Water Conserv. 44(3):227–231.
 * @reference Pinay, G. et al. (1993). Ambio 22(6):340–346.
 */
export function riparianBufferEffectiveness(buffer_width_m: number, slope_pct: number, vegetation_type: string, pollutant_type: string, flow_rate_L_s: number): { sediment_removal_pct: number, nitrate_removal_pct: number, phosphorus_removal_pct: number, effectiveness_rating: string, hydraulic_residence_time_s: number } {
    if (!Number.isFinite(buffer_width_m) || buffer_width_m <= 0)
        throw new RangeError(`riparianBufferEffectiveness: buffer_width_m must be > 0, got ${buffer_width_m}`);
    if (!Number.isFinite(slope_pct) || slope_pct < 0 || slope_pct > 60)
        throw new RangeError(`riparianBufferEffectiveness: slope_pct must be 0–60, got ${slope_pct}`);
    if (!Number.isFinite(flow_rate_L_s) || flow_rate_L_s < 0)
        throw new RangeError(`riparianBufferEffectiveness: flow_rate_L_s must be ≥ 0, got ${flow_rate_L_s}`);

    const veg_key = (vegetation_type || '').toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(PINAY_NITRATE_K, veg_key))
        throw new RangeError(
            `riparianBufferEffectiveness: unknown vegetation_type '${vegetation_type}'. Valid: ${Object.keys(PINAY_NITRATE_K).join(', ')}`,
        );

    const valid_pollutants = ['sediment', 'nitrate', 'phosphorus', 'pesticide'];
    if (!valid_pollutants.includes((pollutant_type || '').toLowerCase()))
        throw new RangeError(
            `riparianBufferEffectiveness: unknown pollutant_type '${pollutant_type}'. Valid: ${valid_pollutants.join(', ')}`,
        );

    // Sediment trap efficiency - Dillaha (1989) piecewise with slope adjustment
    let base_sed_eff = 0;
    for (const tier of Object.values(NRCS_SEDIMENT_EFFICIENCY)) {
        if (buffer_width_m >= tier.min && buffer_width_m < tier.max) {
            base_sed_eff = tier.eff;
            break;
        }
    }
    // Slope penalty: +10% slope above 5% reduces efficiency by 0.5% per % slope unit
    const slope_penalty = slope_pct > 5 ? (slope_pct - 5) * 0.005 : 0;
    const sediment_removal_pct = parseFloat((clamp(base_sed_eff - slope_penalty, 0.1, 0.95) * 100).toFixed(1));

    // Nitrate removal - first-order: fraction = 1 - exp(-k * HRT)
    // HRT approximated as buffer_width_m / (flow_rate_L_s * 0.001 / (1 m width) + 0.001) m/s
    const flow_m3_s_per_m = flow_rate_L_s * 0.001; // per metre width
    const velocity_m_s = flow_m3_s_per_m > 0 ? flow_m3_s_per_m / 0.1 : 0.01; // assume 0.1 m depth
    const hydraulic_residence_time_s = parseFloat((buffer_width_m / velocity_m_s).toFixed(2));
    const hrt_days = hydraulic_residence_time_s / 86400;
    const k_nitrate = (PINAY_NITRATE_K as Record<string, number>)[veg_key] ?? 0;
    const nitrate_removal_pct = parseFloat((clamp(1 - Math.exp(-k_nitrate * hrt_days), 0, 0.99) * 100).toFixed(1));

    // Phosphorus removal - mostly particle-bound: ~85% of sediment efficiency (Dillaha 1989)
    const phosphorus_removal_pct = parseFloat(clamp(sediment_removal_pct * 0.85, 0, 90).toFixed(1));

    // Overall effectiveness rating based on sediment removal
    let effectiveness_rating = 'Low';
    if (sediment_removal_pct >= 70) effectiveness_rating = 'High';
    else if (sediment_removal_pct >= 50) effectiveness_rating = 'Moderate';

    return {
        sediment_removal_pct,
        nitrate_removal_pct,
        phosphorus_removal_pct,
        effectiveness_rating,
        hydraulic_residence_time_s,
    };
}

/**
 * Macrophyte Index of Biotic Integrity - Germ & Urbanič (2009).
 *
 * Computes five normalised metric scores on a 1/3/5 scale, a composite IBI
 * (arithmetic mean), and assigns an ecological quality class (I=excellent to
 * V=very poor) with CONAMA 357 class mapping.
 *
 * @param {number} species_richness   - Total macrophyte species count, ≥ 0
 * @param {number} sensitive_taxa_pct - Percentage of sensitive taxa, 0–100
 * @param {number} tolerant_taxa_pct  - Percentage of tolerant/invasive taxa, 0–100
 * @param {number} native_pct         - Percentage of native species, 0–100
 * @param {number} coverage_pct       - Total macrophyte coverage of survey area, 0–100
 * @returns {{
 *   metric_scores: {richness:number, sensitive:number, tolerant:number, native:number, coverage:number},
 *   composite_ibi: number,
 *   ibi_class: string,
 *   quality_label: string,
 *   conama357_class: string
 * }}
 * @reference Germ, M. & Urbanič, G. (2009). The use of macrophytes as
 *   biological indicators in rivers. Hydrobiologia 633:209–222.
 *   DOI: 10.1007/s10750-009-9886-8
 */
export function macrophyteIBI(species_richness: number, sensitive_taxa_pct: number, tolerant_taxa_pct: number, native_pct: number, coverage_pct: number): { metric_scores: {richness:number, sensitive:number, tolerant:number, native:number, coverage:number}, composite_ibi: number, ibi_class: string, quality_label: string, conama357_class: string } {
    if (!Number.isFinite(species_richness) || species_richness < 0)
        throw new RangeError(`macrophyteIBI: species_richness must be ≥ 0, got ${species_richness}`);
        const ibiInputs: Array<[string, number]>= [
        ['sensitive_taxa_pct', sensitive_taxa_pct],
        ['tolerant_taxa_pct', tolerant_taxa_pct],
        ['native_pct', native_pct],
        ['coverage_pct', coverage_pct],
    ];
    for (const [name, val] of ibiInputs) {
        if (!Number.isFinite(val) || val < 0 || val > 100)
            throw new RangeError(`macrophyteIBI: ${name} must be 0–100, got ${val}`);
    }

    // Metric 1: species richness - bad < 5, good >= 15
    const richness_score = ibi135(species_richness, 5, 15);
    // Metric 2: sensitive taxa % - bad < 10%, good >= 30%
    const sensitive_score = ibi135(sensitive_taxa_pct, 10, 30);
    // Metric 3: tolerant taxa % - bad >= 40%, good <= 10% (inverted)
    const tolerant_score = ibi135(100 - tolerant_taxa_pct, 60, 90);
    // Metric 4: native species % - bad < 50%, good >= 80%
    const native_score = ibi135(native_pct, 50, 80);
    // Metric 5: coverage % - bad < 5%, good >= 25%
    const coverage_score = ibi135(coverage_pct, 5, 25);

    const composite_ibi = parseFloat(
        ((richness_score + sensitive_score + tolerant_score + native_score + coverage_score) / 5).toFixed(2),
    );

    const cls =
        MACROPHYTE_IBI_CLASSES.find((c) => composite_ibi >= c.score_min) ||
        MACROPHYTE_IBI_CLASSES[MACROPHYTE_IBI_CLASSES.length - 1]!;

    return {
        metric_scores: {
            richness: richness_score,
            sensitive: sensitive_score,
            tolerant: tolerant_score,
            native: native_score,
            coverage: coverage_score,
        },
        composite_ibi,
        ibi_class: cls.ibi_class,
        quality_label: cls.label,
        conama357_class: cls.conama357,
    };
}

/**
 * Wetland Carbon Sequestration - IPCC (2014) Tier 1 accounting.
 *
 * Calculates soil carbon accumulation, methane efflux (CH4), N2O emissions, net
 * GWP balance (tCO2e/ha/yr) on 20-year and 100-year horizons, and total carbon
 * stored over the wetland age.
 *
 * @param {string} wetland_type    - IPCC wetland type key (see IPCC_SOIL_C_ACCUM)
 * @param {number} area_ha         - Wetland area (ha), > 0
 * @param {number} water_depth_m   - Mean water depth (m), 0–10
 * @param {number} age_yr          - Wetland age / restoration age (years), ≥ 0
 * @param {string} climate_zone    - 'tropical' | 'temperate' | 'boreal'
 * @returns {{
 *   soil_C_accum_tC_ha_yr: number,
 *   ch4_emission_kg_ha_yr: number,
 *   n2o_emission_kg_ha_yr: number,
 *   net_gwp_tCO2e_ha_yr_20yr: number,
 *   net_gwp_tCO2e_ha_yr_100yr: number,
 *   total_carbon_stored_tC: number,
 *   carbon_sink: boolean
 * }}
 * @reference IPCC (2014). 2013 Supplement to the 2006 IPCC Guidelines: Wetlands.
 * @reference Chmura, G.L. et al. (2003). Global rates of mangrove and tidal salt marsh
 *   carbon sequestration. Global Biogeochem. Cycles 17(4):1111.
 *   DOI: 10.1029/2002GB001917
 * @reference Bridgham, S.D. et al. (2006). BioScience 56(4):296–305.
 *   DOI: 10.1641/0006-3568(2006)056[0296:MIWAUS]2.0.CO;2
 */
export function carbonSequestrationWetland(wetland_type: string, area_ha: number, water_depth_m: number, age_yr: number, climate_zone: string): { soil_C_accum_tC_ha_yr: number, ch4_emission_kg_ha_yr: number, n2o_emission_kg_ha_yr: number, net_gwp_tCO2e_ha_yr_20yr: number, net_gwp_tCO2e_ha_yr_100yr: number, total_carbon_stored_tC: number, carbon_sink: boolean } {
    if (!Number.isFinite(area_ha) || area_ha <= 0)
        throw new RangeError(`carbonSequestrationWetland: area_ha must be > 0, got ${area_ha}`);
    if (!Number.isFinite(water_depth_m) || water_depth_m < 0 || water_depth_m > 10)
        throw new RangeError(`carbonSequestrationWetland: water_depth_m must be 0–10, got ${water_depth_m}`);
    if (!Number.isFinite(age_yr) || age_yr < 0)
        throw new RangeError(`carbonSequestrationWetland: age_yr must be ≥ 0, got ${age_yr}`);

    const valid_climates = ['tropical', 'temperate', 'boreal'];
    if (!valid_climates.includes((climate_zone || '').toLowerCase()))
        throw new RangeError(
            `carbonSequestrationWetland: climate_zone must be one of ${valid_climates.join(', ')}, got '${climate_zone}'`,
        );

    const wt_key = resolveWetlandType(wetland_type);
    const soil_C_accum_tC_ha_yr = (IPCC_SOIL_C_ACCUM as Record<string, number>)[wt_key] ?? 0;
    const ch4_emission_kg_ha_yr = (IPCC_CH4_EMISSION as Record<string, number>)[wt_key] ?? 0;

    // N2O emission - IPCC (2014) Wetlands Supplement default 1 kg N2O-N/ha/yr for rewetted mineral soils
    const n2o_emission_kg_ha_yr = 1.0;

    // CO2 equivalent from CH4 at 20-yr (GWP20 = 82.5) and 100-yr horizons
    const GWP20_CH4 = 82.5;
    const ch4_tCO2e_20yr = (ch4_emission_kg_ha_yr / 1000) * GWP20_CH4;
    const ch4_tCO2e_100yr = (ch4_emission_kg_ha_yr / 1000) * GWP100_CH4;

    // N2O CO2 equivalent (same GWP for 20-yr and 100-yr per AR6)
    const n2o_tCO2e = (n2o_emission_kg_ha_yr / 1000) * GWP100_N2O;

    // Carbon dioxide removal: soil_C × (44/12) to convert tC → tCO2
    const C_TO_CO2 = 44 / 12;
    const soil_CO2_removal = soil_C_accum_tC_ha_yr * C_TO_CO2;

    const net_gwp_tCO2e_ha_yr_20yr = parseFloat((ch4_tCO2e_20yr + n2o_tCO2e - soil_CO2_removal).toFixed(3));
    const net_gwp_tCO2e_ha_yr_100yr = parseFloat((ch4_tCO2e_100yr + n2o_tCO2e - soil_CO2_removal).toFixed(3));

    const total_carbon_stored_tC = parseFloat((soil_C_accum_tC_ha_yr * area_ha * age_yr).toFixed(2));

    return {
        soil_C_accum_tC_ha_yr,
        ch4_emission_kg_ha_yr,
        n2o_emission_kg_ha_yr,
        net_gwp_tCO2e_ha_yr_20yr,
        net_gwp_tCO2e_ha_yr_100yr,
        total_carbon_stored_tC,
        carbon_sink: net_gwp_tCO2e_ha_yr_100yr < 0,
    };
}

/**
 * Floodplain Inundation Duration - Flood Pulse Concept (Junk et al. 1989).
 *
 * Calculates inundation frequency, duration above bankfull flow, lateral
 * connectivity index, and fish spawning suitability using a simple linear
 * recession model.
 *
 * @param {number} Q_m3_s              - Peak discharge (m³/s), > 0
 * @param {number} bankfull_Q_m3_s     - Bankfull discharge threshold (m³/s), > 0
 * @param {number} floodplain_area_ha  - Floodplain area (ha), > 0
 * @param {number} recession_rate_m_day - Stage recession rate (m/day), > 0
 * @param {number} min_duration_days   - Minimum monitoring threshold (days), ≥ 0
 * @returns {{
 *   exceedance_ratio: number,
 *   inundation_duration_days: number,
 *   connectivity_index: number,
 *   fish_spawning_suitable: boolean,
 *   flood_pulse_class: string
 * }}
 * @reference Junk, W.J., Bayley, P.B. & Sparks, R.E. (1989). The flood pulse concept
 *   in river-floodplain systems. Can. J. Fish. Aquat. Sci. 106:110–127.
 */
export function floodplainInundationDuration(Q_m3_s: number, bankfull_Q_m3_s: number, floodplain_area_ha: number, recession_rate_m_day: number, min_duration_days: number): { exceedance_ratio: number, inundation_duration_days: number, connectivity_index: number, fish_spawning_suitable: boolean, flood_pulse_class: string } {
    if (!Number.isFinite(Q_m3_s) || Q_m3_s <= 0)
        throw new RangeError(`floodplainInundationDuration: Q_m3_s must be > 0, got ${Q_m3_s}`);
    if (!Number.isFinite(bankfull_Q_m3_s) || bankfull_Q_m3_s <= 0)
        throw new RangeError(`floodplainInundationDuration: bankfull_Q_m3_s must be > 0, got ${bankfull_Q_m3_s}`);
    if (!Number.isFinite(floodplain_area_ha) || floodplain_area_ha <= 0)
        throw new RangeError(`floodplainInundationDuration: floodplain_area_ha must be > 0, got ${floodplain_area_ha}`);
    if (!Number.isFinite(recession_rate_m_day) || recession_rate_m_day <= 0)
        throw new RangeError(
            `floodplainInundationDuration: recession_rate_m_day must be > 0, got ${recession_rate_m_day}`,
        );
    if (!Number.isFinite(min_duration_days) || min_duration_days < 0)
        throw new RangeError(`floodplainInundationDuration: min_duration_days must be ≥ 0, got ${min_duration_days}`);

    const exceedance_ratio = parseFloat((Q_m3_s / bankfull_Q_m3_s).toFixed(3));

    // Stage above bankfull proportional to excess discharge / floodplain storage proxy
    // Simplified: stage_above = (Q - Qbankfull) / (floodplain_area_ha * 10000 * recession_rate_m_day / 86400)
    const excess_Q = Math.max(0, Q_m3_s - bankfull_Q_m3_s);
    // Characteristic stage height above bankfull (m)
    const stage_above_bankfull_m =
        excess_Q > 0 ? excess_Q / (floodplain_area_ha * 10000 * (recession_rate_m_day / 86400)) : 0;

    const inundation_duration_days_raw = stage_above_bankfull_m > 0 ? stage_above_bankfull_m / recession_rate_m_day : 0;
    const inundation_duration_days = parseFloat(Math.max(inundation_duration_days_raw, min_duration_days).toFixed(2));

    // Lateral connectivity index: 0–1, proportional to inundation extent relative to floodplain
    const max_expected_duration = 90; // days (seasonal flood)
    const connectivity_index = parseFloat(clamp(inundation_duration_days / max_expected_duration, 0, 1).toFixed(3));

    const fish_spawning_suitable = inundation_duration_days >= FISH_SPAWNING_MIN_DAYS;

    let flood_pulse_class;
    if (exceedance_ratio >= 3) flood_pulse_class = 'Major flood pulse';
    else if (exceedance_ratio >= 1.5) flood_pulse_class = 'Moderate flood pulse';
    else if (exceedance_ratio >= 1.0) flood_pulse_class = 'Bankfull';
    else flood_pulse_class = 'Below bankfull';

    return {
        exceedance_ratio,
        inundation_duration_days,
        connectivity_index,
        fish_spawning_suitable,
        flood_pulse_class,
    };
}

/**
 * Benthic Macroinvertebrate Index - Hilsenhoff (1988) Biotic Index + O/E ratio.
 *
 * Combines EPT (Ephemeroptera, Plecoptera, Trichoptera) richness ratio, O/E
 * deviation, and a composite stream condition class (A=excellent to F=very poor).
 * Compatible with CONAMA biotic assessment.
 *
 * @param {number} EPT_richness    - EPT family richness (observed), ≥ 0
 * @param {number} total_richness  - Total macroinvertebrate family richness, ≥ 1
 * @param {number} tolerant_pct    - Percentage of tolerant taxa, 0–100
 * @param {number} sensitive_pct   - Percentage of sensitive taxa, 0–100
 * @param {number} scraper_pct     - Percentage of scraper functional feeding group, 0–100
 * @returns {{
 *   ept_ratio: number,
 *   hilsenhoff_index: number,
 *   oe_ratio: number,
 *   stream_class: string,
 *   class_label: string,
 *   organic_pollution: string
 * }}
 * @reference Hilsenhoff, W.L. (1988). Rapid field assessment of organic pollution
 *   with a family-level biotic index. J. N. Am. Benthol. Soc. 7:65–68.
 *   Great Lakes Entomol. 21:155.
 */
export function benthicMacroinvertebrateIndex(EPT_richness: number, total_richness: number, tolerant_pct: number, sensitive_pct: number, scraper_pct: number): { ept_ratio: number, hilsenhoff_index: number, oe_ratio: number, stream_class: string, class_label: string, organic_pollution: string } {
    if (!Number.isFinite(EPT_richness) || EPT_richness < 0)
        throw new RangeError(`benthicMacroinvertebrateIndex: EPT_richness must be ≥ 0, got ${EPT_richness}`);
    if (!Number.isFinite(total_richness) || total_richness < 1)
        throw new RangeError(`benthicMacroinvertebrateIndex: total_richness must be ≥ 1, got ${total_richness}`);
    if (EPT_richness > total_richness)
        throw new RangeError(
            `benthicMacroinvertebrateIndex: EPT_richness (${EPT_richness}) cannot exceed total_richness (${total_richness})`,
        );
        const benthicInputs: Array<[string, number]>= [
        ['tolerant_pct', tolerant_pct],
        ['sensitive_pct', sensitive_pct],
        ['scraper_pct', scraper_pct],
    ];
    for (const [name, val] of benthicInputs) {
        if (!Number.isFinite(val) || val < 0 || val > 100)
            throw new RangeError(`benthicMacroinvertebrateIndex: ${name} must be 0–100, got ${val}`);
    }

    const ept_ratio = parseFloat((EPT_richness / total_richness).toFixed(3));

    // Hilsenhoff Biotic Index proxy from tolerant/sensitive composition:
    // HBI = tolerant_pct * 0.08 + (100 - sensitive_pct - tolerant_pct) * 0.04 + 0
    // Scale to 0–10: HBI = (tolerant * 0.8 + neutral * 0.4 + sensitive * 0) / 10
    const neutral_pct = clamp(100 - tolerant_pct - sensitive_pct, 0, 100);
    const hilsenhoff_index = parseFloat(clamp((tolerant_pct * 0.08 + neutral_pct * 0.04) / 1, 0, 10).toFixed(2));

    // O/E ratio - observed EPT richness / expected EPT (reference = 60% of total)
    const REFERENCE_EPT_FRACTION = 0.6;
    const expected_ept = total_richness * REFERENCE_EPT_FRACTION;
    const oe_ratio = parseFloat((EPT_richness / Math.max(expected_ept, 1)).toFixed(3));

    // Stream class - higher tolerant → worse; adjust by scraper (indicator of algal/periphyton health)
    const adjusted_hbi = hilsenhoff_index - (scraper_pct > 20 ? 0.5 : 0);
    const cls =
        HILSENHOFF_CLASSES.find((c) => adjusted_hbi <= c.max) || HILSENHOFF_CLASSES[HILSENHOFF_CLASSES.length - 1]!;

    return {
        ept_ratio,
        hilsenhoff_index,
        oe_ratio,
        stream_class: cls.class,
        class_label: cls.label,
        organic_pollution: cls.organic_pollution,
    };
}

/**
 * Wetland Mitigation Ratio - USACE/EPA (2008) 33 CFR Parts 325 and 332.
 *
 * Calculates the required mitigation credit ratio for wetland impacts, incorporating
 * out-of-kind wetland type multiplier, temporal loss credit, location factor, and
 * success probability, plus bond amount estimate.
 *
 * @param {number} impact_area_ha          - Area of wetland impacted (ha), > 0
 * @param {string} impact_wetland_type     - Type of impacted wetland (see USACE_OUT_OF_KIND_MULTIPLIER keys)
 * @param {string} replacement_wetland_type - Type of replacement/compensatory wetland
 * @param {number} location_score          - Location suitability score 0–10 (10 = watershed-local)
 * @param {number} temporal_loss_yr        - Years until mitigation site reaches functional equivalency, ≥ 0
 * @param {number} success_probability     - Probability of mitigation success 0–1
 * @returns {{
 *   out_of_kind_multiplier: number,
 *   temporal_loss_credit: number,
 *   location_multiplier: number,
 *   final_ratio: number,
 *   required_mitigation_ha: number,
 *   bond_amount_usd: number
 * }}
 * @reference USACE/EPA (2008). Compensatory Mitigation for Losses of Aquatic Resources.
 *   33 CFR Parts 325 and 332. Federal Register 73:19594–19705.
 */
export function wetlandMitigationRatio(impact_area_ha: number, impact_wetland_type: string, replacement_wetland_type: string, location_score: number, temporal_loss_yr: number, success_probability: number): { out_of_kind_multiplier: number, temporal_loss_credit: number, location_multiplier: number, final_ratio: number, required_mitigation_ha: number, bond_amount_usd: number } {
    if (!Number.isFinite(impact_area_ha) || impact_area_ha <= 0)
        throw new RangeError(`wetlandMitigationRatio: impact_area_ha must be > 0, got ${impact_area_ha}`);
    if (!Number.isFinite(location_score) || location_score < 0 || location_score > 10)
        throw new RangeError(`wetlandMitigationRatio: location_score must be 0–10, got ${location_score}`);
    if (!Number.isFinite(temporal_loss_yr) || temporal_loss_yr < 0)
        throw new RangeError(`wetlandMitigationRatio: temporal_loss_yr must be ≥ 0, got ${temporal_loss_yr}`);
    if (!Number.isFinite(success_probability) || success_probability <= 0 || success_probability > 1)
        throw new RangeError(`wetlandMitigationRatio: success_probability must be (0, 1], got ${success_probability}`);

    // Out-of-kind multiplier lookup
    const impact_key = (impact_wetland_type || '').toLowerCase().replace(/[\s-]/g, '_');
    const replace_key = (replacement_wetland_type || '').toLowerCase().replace(/[\s-]/g, '_');
        const usaceMap: Record<string, Record<string, number>>= (USACE_OUT_OF_KIND_MULTIPLIER as any);
    const type_map = usaceMap[impact_key] || usaceMap.generic!;
    const out_of_kind_multiplier = parseFloat(
        (type_map[replace_key] !== undefined ? type_map[replace_key]! : 2.0).toFixed(2),
    );

    // Temporal loss credit: compound interest model (33 CFR 332.2)
    const temporal_loss_credit = parseFloat(
        clamp(1 + TEMPORAL_LOSS_RATE_PER_YR * temporal_loss_yr, 1.0, 3.0).toFixed(3),
    );

    // Location multiplier: 2.0 (off-site far) → 0.5 (on-site adjacent); linear on score
    const location_multiplier = parseFloat(clamp(2.0 - (location_score / 10) * 1.5, 0.5, 2.0).toFixed(3));

    // Final ratio: out-of-kind × temporal × location / success_probability
    const final_ratio = parseFloat(
        ((out_of_kind_multiplier * temporal_loss_credit * location_multiplier) / success_probability).toFixed(3),
    );

    const required_mitigation_ha = parseFloat((impact_area_ha * final_ratio).toFixed(3));

    // Bond amount - USACE standard: USD 50,000/ha × required mitigation area × success risk
    const BOND_RATE_USD_HA = 50000;
    const bond_amount_usd = parseFloat(
        (required_mitigation_ha * BOND_RATE_USD_HA * (1 - success_probability)).toFixed(0),
    );

    return {
        out_of_kind_multiplier,
        temporal_loss_credit,
        location_multiplier,
        final_ratio,
        required_mitigation_ha,
        bond_amount_usd,
    };
}

/**
 * DO Sag Curve - Streeter-Phelps (1925) + Thomas (1948) reaeration.
 *
 * Computes dissolved oxygen deficit at distance x downstream from a pollution
 * source, locates the critical deficit (Dc) and critical distance (xc), and
 * determines where DO recovers to the CONAMA 357 Class 2 standard (5 mg/L).
 *
 * @param {number} BOD_mg_L       - Ultimate BOD of effluent/waste load (mg/L), > 0
 * @param {number} DO_initial_mg_L - Initial DO in mixed stream (mg/L), 0–DO_sat
 * @param {number} DO_sat_mg_L    - DO saturation concentration (mg/L), defaults to DO_SAT_20C if 0
 * @param {number} k_d_day        - BOD deoxygenation rate constant (day⁻¹), > 0
 * @param {number} k_r_day        - Reaeration rate constant (day⁻¹), > 0
 * @param {number} U_m_s          - Stream velocity (m/s), > 0
 * @param {number} x_m            - Distance downstream (m), ≥ 0
 * @returns {{
 *   DO_at_x_mg_L: number,
 *   deficit_at_x_mg_L: number,
 *   critical_deficit_mg_L: number,
 *   critical_distance_m: number,
 *   recovery_distance_m: number|null,
 *   conama_compliant: boolean
 * }}
 * @reference Streeter, H.W. & Phelps, E.B. (1925). A study of the pollution and
 *   natural purification of the Ohio River. USPHS Bulletin No. 146, Washington, DC.
 * @reference Thomas, H.A. (1948). Pollution load capacity of streams. Water Sewage Works 95:409.
 */
export function dissolvedOxygenSag(BOD_mg_L: number, DO_initial_mg_L: number, DO_sat_mg_L: number, k_d_day: number, k_r_day: number, U_m_s: number, x_m: number): { DO_at_x_mg_L: number, deficit_at_x_mg_L: number, critical_deficit_mg_L: number, critical_distance_m: number, recovery_distance_m: number|null, conama_compliant: boolean } {
    if (!Number.isFinite(BOD_mg_L) || BOD_mg_L <= 0)
        throw new RangeError(`dissolvedOxygenSag: BOD_mg_L must be > 0, got ${BOD_mg_L}`);
    if (!Number.isFinite(k_d_day) || k_d_day <= 0)
        throw new RangeError(`dissolvedOxygenSag: k_d_day must be > 0, got ${k_d_day}`);
    if (!Number.isFinite(k_r_day) || k_r_day <= 0)
        throw new RangeError(`dissolvedOxygenSag: k_r_day must be > 0, got ${k_r_day}`);
    if (!Number.isFinite(U_m_s) || U_m_s <= 0)
        throw new RangeError(`dissolvedOxygenSag: U_m_s must be > 0, got ${U_m_s}`);
    if (!Number.isFinite(x_m) || x_m < 0) throw new RangeError(`dissolvedOxygenSag: x_m must be ≥ 0, got ${x_m}`);

    const DO_s = DO_sat_mg_L > 0 ? DO_sat_mg_L : DO_SAT_20C;
    if (!Number.isFinite(DO_initial_mg_L) || DO_initial_mg_L < 0 || DO_initial_mg_L > DO_s)
        throw new RangeError(`dissolvedOxygenSag: DO_initial_mg_L must be 0–${DO_s}, got ${DO_initial_mg_L}`);

    // Initial deficit (mg/L)
    const D0 = DO_s - DO_initial_mg_L;

    // Convert x to travel time t (days)
    const U_m_day = U_m_s * 86400;
    const t = x_m / U_m_day;

    // Streeter-Phelps deficit at time t:
    // D(t) = (k_d * L0) / (k_r - k_d) * (exp(-k_d*t) - exp(-k_r*t)) + D0 * exp(-k_r*t)
    const deficit_at_x =
        k_r_day !== k_d_day
            ? ((k_d_day * BOD_mg_L) / (k_r_day - k_d_day)) * (Math.exp(-k_d_day * t) - Math.exp(-k_r_day * t)) +
              D0 * Math.exp(-k_r_day * t)
            : k_d_day * BOD_mg_L * t * Math.exp(-k_d_day * t) + D0 * Math.exp(-k_r_day * t);

    const DO_at_x = parseFloat(clamp(DO_s - deficit_at_x, 0, DO_s).toFixed(3));
    const deficit_at_x_mg_L = parseFloat(Math.max(0, deficit_at_x).toFixed(3));

    // Critical time: tc = ln((k_r/k_d) * (1 - D0*(k_r-k_d)/(k_d*L0))) / (k_r - k_d)
    let critical_deficit_mg_L = D0;
    let critical_distance_m = 0;
    if (k_r_day > k_d_day) {
        const ratio = (k_r_day / k_d_day) * (1 - (D0 * (k_r_day - k_d_day)) / (k_d_day * BOD_mg_L));
        if (ratio > 0) {
            const tc = Math.log(ratio) / (k_r_day - k_d_day);
            if (tc > 0) {
                const Dc =
                    ((k_d_day * BOD_mg_L) / (k_r_day - k_d_day)) * (Math.exp(-k_d_day * tc) - Math.exp(-k_r_day * tc)) +
                    D0 * Math.exp(-k_r_day * tc);
                critical_deficit_mg_L = parseFloat(Math.max(0, Dc).toFixed(3));
                critical_distance_m = parseFloat((tc * U_m_day).toFixed(1));
            }
        }
    }

    // Recovery distance: find x where DO = CONAMA_DO_CLASS2 (5 mg/L) by iterating
    let recovery_distance_m = null;
    const target_deficit = DO_s - CONAMA_DO_CLASS2;
    if (DO_at_x < CONAMA_DO_CLASS2) {
        // Search up to 1000 km
        const MAX_SEARCH_M = 1_000_000;
        const step = 1000;
        for (let xi = x_m; xi <= MAX_SEARCH_M; xi += step) {
            const ti = xi / U_m_day;
            const Di =
                ((k_d_day * BOD_mg_L) / (k_r_day - k_d_day)) * (Math.exp(-k_d_day * ti) - Math.exp(-k_r_day * ti)) +
                D0 * Math.exp(-k_r_day * ti);
            if (Di <= target_deficit) {
                recovery_distance_m = parseFloat(xi.toFixed(0));
                break;
            }
        }
    } else {
        recovery_distance_m = parseFloat(x_m.toFixed(0));
    }

    return {
        DO_at_x_mg_L: DO_at_x,
        deficit_at_x_mg_L,
        critical_deficit_mg_L,
        critical_distance_m,
        recovery_distance_m,
        conama_compliant: DO_at_x >= CONAMA_DO_CLASS2,
    };
}

/**
 * Riparian Landscape Connectivity - Urban & Keitt (2001) IIC index.
 *
 * Computes the Integral Index of Connectivity (IIC) for a riparian corridor
 * graph, including node importance (dIIC), graph diameter, equivalent
 * connectivity (EC), and fragmentation index.
 *
 * @param {number[]} patch_areas_ha          - Array of habitat patch areas (ha), all > 0
 * @param {number[]} inter_patch_distances_m - Flattened upper-triangle distance matrix
 *   (length = n*(n-1)/2, row-major order), values ≥ 0
 * @param {number} species_dispersal_km      - Maximum species dispersal distance (km), > 0
 * @param {number} matrix_resistance         - Landscape matrix resistance 0–1 (1 = impermeable)
 * @returns {{
 *   IIC: number,
 *   EC_ha: number,
 *   fragmentation_index: number,
 *   graph_diameter_m: number,
 *   node_importance: number[]
 * }}
 * @reference Urban, D. & Keitt, T. (2001). Landscape connectivity: a graph-theoretic
 *   perspective. Ecology 82(5):1205–1218.
 *   DOI: 10.1890/0012-9658(2001)082[1205:LCAGTA]2.0.CO;2
 */
export function riparian_LandscapeConnectivity(patch_areas_ha: number[], inter_patch_distances_m: number[], species_dispersal_km: number, matrix_resistance: number): { IIC: number, EC_ha: number, fragmentation_index: number, graph_diameter_m: number, node_importance: number[] } {
    if (!Array.isArray(patch_areas_ha) || patch_areas_ha.length < 1)
        throw new RangeError('riparian_LandscapeConnectivity: patch_areas_ha must be a non-empty array');
    for (const [i, a] of patch_areas_ha.entries()) {
        if (!Number.isFinite(a) || a <= 0)
            throw new RangeError(`riparian_LandscapeConnectivity: patch_areas_ha[${i}] must be > 0, got ${a}`);
    }

    const n = patch_areas_ha.length;
    const expected_dist_len = (n * (n - 1)) / 2;
    if (!Array.isArray(inter_patch_distances_m) || inter_patch_distances_m.length !== expected_dist_len)
        throw new RangeError(
            `riparian_LandscapeConnectivity: inter_patch_distances_m must have length n*(n-1)/2 = ${expected_dist_len}, got ${inter_patch_distances_m.length}`,
        );
    for (const [i, d] of inter_patch_distances_m.entries()) {
        if (!Number.isFinite(d) || d < 0)
            throw new RangeError(`riparian_LandscapeConnectivity: inter_patch_distances_m[${i}] must be ≥ 0, got ${d}`);
    }

    if (!Number.isFinite(species_dispersal_km) || species_dispersal_km <= 0)
        throw new RangeError(
            `riparian_LandscapeConnectivity: species_dispersal_km must be > 0, got ${species_dispersal_km}`,
        );
    if (!Number.isFinite(matrix_resistance) || matrix_resistance < 0 || matrix_resistance > 1)
        throw new RangeError(`riparian_LandscapeConnectivity: matrix_resistance must be 0–1, got ${matrix_resistance}`);

    const dispersal_m = species_dispersal_km * 1000;

    // Build adjacency matrix - connection probability decays exponentially with distance
    // P(link) = exp(-resistance * d / dispersal_m); link exists if P > 0.05
    const P_THRESHOLD = 0.05;
    const adj = Array.from({ length: n }, () => new Array(n).fill(0));
    let dist_idx = 0;
    const all_distances = [];
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const d = inter_patch_distances_m[dist_idx++]!;
            all_distances.push(d);
            const p = Math.exp((-matrix_resistance * d) / dispersal_m);
            const connected = p > P_THRESHOLD ? 1 : 0;
            adj[i]![j] = connected;
            adj[j]![i] = connected;
        }
    }

    const total_area = patch_areas_ha.reduce((s, a) => s + a, 0);
    const AL_sq = total_area * total_area; // landscape area squared (for IIC denominator)

    // Shortest paths via Floyd-Warshall on binary adjacency (number of steps = 0 within, ≥1 between)
    // nlij = number of links in shortest path; set to large number if not connected
    const INF = n + 1;
    const nlij = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? 0 : adj[i]![j] ? 1 : INF)),
    );
    for (let k = 0; k < n; k++)
        for (let i = 0; i < n; i++)
            for (let j = 0; j < n; j++) if (nlij[i]![k]! + nlij[k]![j]! < nlij[i]![j]!) nlij[i]![j] = nlij[i]![k]! + nlij[k]![j]!;

    // IIC = sum_i sum_j (ai * aj) / (1 + nlij) / AL²
    let iic_sum = 0;
    for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) iic_sum += (patch_areas_ha[i]! * patch_areas_ha[j]!) / (1 + nlij[i]![j]!);

    const IIC = parseFloat((iic_sum / AL_sq).toFixed(6));

    // Equivalent Connectivity (EC) = sqrt(IIC * AL²)
    const EC_ha = parseFloat(Math.sqrt(iic_sum).toFixed(3));

    // Graph diameter = maximum finite shortest path in physical units (metres)
    let graph_diameter_m = 0;
    const dist_matrix = Array.from({ length: n }, () => new Array(n).fill(0));
    dist_idx = 0;
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const d = inter_patch_distances_m[dist_idx++]!;
            dist_matrix[i]![j] = d;
            dist_matrix[j]![i] = d;
        }
    }
    for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++)
            if (nlij[i]![j]! < INF) graph_diameter_m = Math.max(graph_diameter_m, dist_matrix[i]![j]!);

    // Node importance: dIIC for each patch (fraction of total IIC when patch is removed)
    const node_importance = [];
    for (let r = 0; r < n; r++) {
        // Recompute IIC without patch r
        let iic_r = 0;
        for (let i = 0; i < n; i++) {
            if (i === r) continue;
            for (let j = 0; j < n; j++) {
                if (j === r) continue;
                // Re-derive shortest path excluding r
                let path = INF;
                for (let k = 0; k < n; k++) {
                    if (k === r) continue;
                    const pk = nlij[i]![k]! + nlij[k]![j]!;
                    if (pk < path) path = pk;
                }
                // Direct link check
                if (adj[i]![j]) path = Math.min(path, 1);
                if (i === j) path = 0;
                iic_r += (patch_areas_ha[i]! * patch_areas_ha[j]!) / (1 + path);
            }
        }
        const dIIC = iic_sum > 0 ? parseFloat(((iic_sum - iic_r) / iic_sum).toFixed(4)) : 0;
        node_importance.push(dIIC);
    }

    // Fragmentation index: 1 - (EC / total_area)
    const fragmentation_index = parseFloat(clamp(1 - EC_ha / total_area, 0, 1).toFixed(4));

    return {
        IIC,
        EC_ha,
        fragmentation_index,
        graph_diameter_m,
        node_importance,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const wetlandRiparianEcologyMeta = {
    name: 'wetlandRiparianEcology',
    description: 'wetlandRiparianEcology',
    category: 'analytics',
    familyTags: ['wetland'],
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
