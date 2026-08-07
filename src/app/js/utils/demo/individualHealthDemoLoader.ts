// @ts-check
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
// Application: EHS & Mining
/* ================================================================
   DEMO — Individual Health (HEALTH-MON-001 showcase)

   Posiciona um sujeito (humano/cao/gato/planta) em [0,0,0] com:
     - 1 elemento `individual`
     - 1 worker registry entry (LGPD pseudonymized)
     - 3 leituras de biomarcadores ocupacionais (benzene/lead/mercury)
     - 18 leituras de bioquímica clínica (lipid/glycemic/renal/hepatic/
       hemogram/thyroid) — todas em matriz `blood`
     - 6 sinais vitais (PA sis/dia, FC, SpO2, temp, IMC) — confounders.kind='vitals'
     - 4 marcadores ocupacionais NR-7 (audiometria 4kHz E/D, espirometria
       FEV1/FVC) — confounders.kind='occupational', nr_ref='NR-7'
     - 5 marcadores ECG (HR, PR, QRS, QT, QTc) — confounders.kind='ecg'
     - 5 escalas psicossociais NIOSH GJSQ — confounders.kind='psychosocial'
     - 5 NR-trainings (NR-6/9/15/33/35) — confounders.kind='nr_training'
     - 5 vacinas (dT/HepB/Febre Amarela/COVID/Influenza) — confounders.kind='vaccination'
     - 5 antropométricos extendidos (cintura, %gordura, RCQ, massa, %água)
       — confounders.kind='anthropometry'
     - 5 exposições cumulativas (sílica/amianto/BTEX/ruído/chumbo)
       — confounders.kind='cumulative_exposure'
     - 6 EPIs (capacete, oculos, mascara, luvas, botas, protetor auricular)
       posicionados ao redor do individuo

   Loader autonomo — chamado via engine.customLoader ou diretamente.
   ================================================================ */
import { getRangeFor } from '../../core/health/clinicalReferenceRanges.js';
/** @type {((msg: string, type?: string) => void) | null} */
let _cachedShowToast: any = null;
/** @type {((key: string) => string) | null} */
let _cachedT: any = null;
/** @param {unknown} err */
function errorMessage(err: any) {
    return err instanceof Error ? err.message : String(err);
}
async function ensureToast() {
    if (_cachedShowToast)
        return _cachedShowToast;
    try {
        const mod = (await import('../ui/toast.js' as string));
        _cachedShowToast = mod.showToast ?? ((m: any) => console.warn('[individualHealthDemo]', m));
    }
    catch {
        _cachedShowToast = (m: any) => console.warn('[individualHealthDemo]', m);
    }
    return _cachedShowToast;
}
async function ensureT() {
    if (_cachedT)
        return _cachedT;
    try {
        const mod = (await import('../i18n/translations.js' as string));
        _cachedT = mod.t ?? ((k: any) => k);
    }
    catch {
        _cachedT = (k: any) => k;
    }
    return _cachedT;
}
/**
 * Mapping subjectType -> GLB modelId (registered in app/js/config/model-library.js).
 * @type {Record<string, string>}
 */
// Calvin diretiva 2026-05-15: usar variants HQ quando disponíveis.
// Dog/cat não têm HQ no model-library — usam low-poly base.
const SUBJECT_MODEL_ID = Object.freeze({
    human: 'individual_hq',
    dog: 'habitat_dog',
    cat: 'habitat_cat',
    plant: 'habitat_flora_hq',
});
/**
 * Default pseudonym per subject type (LGPD compliance — never use real names).
 * @type {Record<string, string>}
 */
const SUBJECT_DEFAULT_NAME = Object.freeze({
    human: 'SUBJ-001',
    dog: 'DOG-001',
    cat: 'CAT-001',
    plant: 'FLORA-001',
});
/**
 * EPI list canonical (pure helper for tests).
 * Each entry: kind, label, position offset relative to individual at [0,0,0],
 * and protectionFactor (multiplier or attenuation dB for hearing).
 *
 * @returns {Array<{
 *   kind: 'helmet'|'goggles'|'respirator'|'gloves'|'boots'|'hearing',
 *   label: string,
 *   position: {x:number, y:number, z:number},
 *   protectionFactor: number
 * }>}
 */
export function buildEpiList() {
    return [
        { kind: 'helmet', label: 'Capacete', position: { x: 0, y: 2, z: 0 }, protectionFactor: 1.0 },
        { kind: 'goggles', label: 'Oculos', position: { x: 0, y: 1.7, z: 0.3 }, protectionFactor: 0.95 },
        { kind: 'respirator', label: 'Mascara', position: { x: 0, y: 1.5, z: 0.3 }, protectionFactor: 50 },
        { kind: 'gloves', label: 'Luva Esquerda', position: { x: -0.5, y: 1, z: 0 }, protectionFactor: 0.9 },
        { kind: 'gloves', label: 'Luva Direita', position: { x: 0.5, y: 1, z: 0 }, protectionFactor: 0.9 },
        { kind: 'boots', label: 'Bota Esquerda', position: { x: -0.2, y: 0.1, z: 0 }, protectionFactor: 0.95 },
        { kind: 'boots', label: 'Bota Direita', position: { x: 0.2, y: 0.1, z: 0 }, protectionFactor: 0.95 },
        { kind: 'hearing', label: 'Protetor Auricular', position: { x: 0.3, y: 1.65, z: 0 }, protectionFactor: 25 },
    ];
}
/**
 * Build the canonical 3 biomarker readings for the demo.
 * Pure helper to allow unit tests without touching the elements manager.
 *
 * @param {string} workerPseudonym
 * @param {string} sampleDate ISO date (YYYY-MM-DD)
 * @returns {Array<{
 *   biomarkerType: string,
 *   value: number,
 *   unit: string,
 *   sampleMatrix: 'urine'|'blood',
 *   confounders: { ppe_status: 'none'|'partial'|'full' },
 *   workerPseudonym: string,
 *   sampleDate: string
 * }>}
 */
export function buildReadingSpecs(workerPseudonym: any, sampleDate: any) {
    return [
        {
            biomarkerType: 'benzene_muconic_acid_urine',
            value: 0.4,
            unit: 'mg/g_creatinine',
            sampleMatrix: 'urine',
            confounders: { ppe_status: 'partial' },
            workerPseudonym,
            sampleDate,
        },
        {
            biomarkerType: 'lead_blood',
            value: 8,
            unit: 'µg/dL',
            sampleMatrix: 'blood',
            confounders: { ppe_status: 'full' },
            workerPseudonym,
            sampleDate,
        },
        {
            biomarkerType: 'mercury_inorganic_urine',
            value: 22,
            unit: 'µg/g_creatinine',
            sampleMatrix: 'urine',
            confounders: { ppe_status: 'none' },
            workerPseudonym,
            sampleDate,
        },
    ];
}
/**
 * Deterministic hash → integer in range [0, 2^31).
 * Used as PRNG seed derived from workerPseudonym so test values are reproducible.
 * @param {string} input
 * @returns {number}
 */
function seedFromString(input: any) {
    const s = String(input || '');
    let h = 2166136261 >>> 0; // FNV-1a 32-bit offset basis
    for (let i = 0; i < s.length; i += 1) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
}
/**
 * Mulberry32 PRNG — deterministic given the same seed.
 * @param {number} seed
 * @returns {() => number}
 */
function mulberry32(seed: any) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
/**
 * Generate a deterministic plausible value near the center of a reference range.
 * Jitter ± 10% of (refMax - refMin) around the midpoint, clipped inside the range.
 *
 * @param {{refMin:number, refMax:number}} range
 * @param {() => number} range uniform [0,1)
 * @param {number} rand number of decimals to keep (default 2)
 * @returns {number}
 */
function plausibleValue(range: any, rand: any, precision: any = 2) {
    const mid = (range.refMin + range.refMax) / 2;
    const span = range.refMax - range.refMin;
    const jitter = (rand() - 0.5) * span * 0.4; // ±20% of span around midpoint
    let v = mid + jitter;
    if (v < range.refMin)
        v = range.refMin;
    if (v > range.refMax)
        v = range.refMax;
    const factor = Math.pow(10, precision);
    return Math.round(v * factor) / factor;
}
/**
 * Build clinical chemistry readings (lipid + glycemic + renal + hepatic +
 * hemogram + thyroid). All values plausible and inside reference ranges.
 *
 * @param {string} workerPseudonym
 * @param {string} sampleDate ISO date (YYYY-MM-DD)
 * @returns {Array<{
 *   biomarkerType: string,
 *   value: number,
 *   unit: string,
 *   sampleMatrix: 'blood',
 *   confounders: { kind: 'clinical', category: string },
 *   workerPseudonym: string,
 *   sampleDate: string
 * }>}
 */
export function buildClinicalChemistryReadings(workerPseudonym: any, sampleDate: any) {
    const rand = mulberry32(seedFromString(workerPseudonym + ':clinical'));
    const types = [
        // lipid (4)
        'cholesterol_total',
        'hdl',
        'ldl',
        'triglycerides',
        // glycemic (2)
        'fasting_glucose',
        'hba1c',
        // renal (2)
        'creatinine',
        'urea',
        // hepatic (4)
        'alt',
        'ast',
        'ggt',
        'total_bilirubin',
        // hemogram (4)
        'hemoglobin',
        'hematocrit',
        'leukocytes',
        'platelets',
        // thyroid (2)
        'tsh',
        'free_t4',
    ];
    const out = [];
    for (const biomarkerType of types) {
        const range = getRangeFor(biomarkerType);
        if (!range)
            continue;
        const precision = range.refMax < 10 ? 2 : range.refMax < 100 ? 1 : 0;
        const value = plausibleValue(range, rand, precision);
        out.push({
            biomarkerType,
            value,
            unit: range.unit,
            sampleMatrix: ('blood'),
            confounders: { kind: ('clinical'), category: String(range.category) },
            workerPseudonym,
            sampleDate,
        });
    }
    return out;
}
/**
 * Build vital sign readings (BP sys/dia, HR, SpO2, temp, BMI).
 * Stored as schema readings with sampleMatrix='blood' (enum-compatible) +
 * confounders.kind='vitals' to differentiate downstream consumers.
 *
 * @param {string} workerPseudonym
 * @param {string} sampleDate ISO date (YYYY-MM-DD)
 * @returns {Array<{
 *   biomarkerType: string,
 *   value: number,
 *   unit: string,
 *   sampleMatrix: 'blood',
 *   confounders: { kind: 'vitals', category: 'vitals' },
 *   workerPseudonym: string,
 *   sampleDate: string
 * }>}
 */
export function buildVitalSignsReadings(workerPseudonym: any, sampleDate: any) {
    const rand = mulberry32(seedFromString(workerPseudonym + ':vitals'));
    const types = ['systolic_bp', 'diastolic_bp', 'heart_rate', 'o2_saturation', 'body_temperature', 'bmi'];
    const out = [];
    for (const biomarkerType of types) {
        const range = getRangeFor(biomarkerType);
        if (!range)
            continue;
        const precision = biomarkerType === 'body_temperature' || biomarkerType === 'bmi' ? 1 : 0;
        const value = plausibleValue(range, rand, precision);
        out.push({
            biomarkerType,
            value,
            unit: range.unit,
            sampleMatrix: ('blood'),
            confounders: { kind: ('vitals'), category: ('vitals') },
            workerPseudonym,
            sampleDate,
        });
    }
    return out;
}
/**
 * Build NR-7 occupational exam readings (audiometry, spirometry).
 * Brazil's NR-7 (Programa de Controle Médico de Saúde Ocupacional)
 * mandates periodic audiometric and pulmonary exams for exposed workers.
 *
 * @param {string} workerPseudonym
 * @param {string} sampleDate ISO date (YYYY-MM-DD)
 * @returns {Array<{
 *   biomarkerType: string,
 *   value: number,
 *   unit: string,
 *   sampleMatrix: 'blood',
 *   confounders: { kind: 'occupational', nr_ref: 'NR-7' },
 *   workerPseudonym: string,
 *   sampleDate: string
 * }>}
 */
export function buildOccupationalExamsReadings(workerPseudonym: any, sampleDate: any) {
    const rand = mulberry32(seedFromString(workerPseudonym + ':occupational'));
    // Plausible normal-range values:
    //   audiometry 4kHz loss: 0-15 dB normal hearing
    //   spirometry FEV1 %predicted: 80-120% normal
    //   spirometry FVC %predicted: 80-120% normal
    const audioRange = { refMin: 0, refMax: 15 };
    const spiroRange = { refMin: 80, refMax: 120 };
    const entries = [
        { biomarkerType: 'audiometry_db_loss_4khz_right', unit: 'dB', range: audioRange, precision: 0 },
        { biomarkerType: 'audiometry_db_loss_4khz_left', unit: 'dB', range: audioRange, precision: 0 },
        { biomarkerType: 'spirometry_fev1_percent_predicted', unit: '%', range: spiroRange, precision: 1 },
        { biomarkerType: 'spirometry_fvc_percent_predicted', unit: '%', range: spiroRange, precision: 1 },
    ];
    return entries.map((e: any) => ({
        biomarkerType: e.biomarkerType,
        value: plausibleValue(e.range, rand, e.precision),
        unit: e.unit,
        sampleMatrix: ('blood'),
        confounders: { kind: ('occupational'), nr_ref: ('NR-7') },
        workerPseudonym,
        sampleDate,
    }));
}
/**
 * Build ECG marker readings (HR, PR, QRS, QT, QTc).
 * Stored as schema readings with sampleMatrix='blood' (enum-compatible) +
 * confounders.kind='ecg' to differentiate downstream consumers.
 *
 * @param {string} workerPseudonym
 * @param {string} sampleDate ISO date (YYYY-MM-DD)
 * @returns {Array<{
 *   biomarkerType: string,
 *   value: number,
 *   unit: string,
 *   sampleMatrix: 'blood',
 *   confounders: { kind: 'ecg' },
 *   workerPseudonym: string,
 *   sampleDate: string
 * }>}
 */
export function buildEcgReadings(workerPseudonym: any, sampleDate: any) {
    const rand = mulberry32(seedFromString(workerPseudonym + ':ecg'));
    const types = [
        'ecg_heart_rate_bpm',
        'ecg_pr_interval_ms',
        'ecg_qrs_duration_ms',
        'ecg_qt_interval_ms',
        'ecg_qtc_corrected_ms',
    ];
    const out = [];
    for (const biomarkerType of types) {
        const range = getRangeFor(biomarkerType);
        if (!range)
            continue;
        const value = plausibleValue(range, rand, 0);
        out.push({
            biomarkerType,
            value,
            unit: range.unit,
            sampleMatrix: ('blood'),
            confounders: { kind: ('ecg') },
            workerPseudonym,
            sampleDate,
        });
    }
    return out;
}
/**
 * Build NIOSH Generic Job Stress Questionnaire (psychosocial) readings.
 * 5 dimensions on 0-100 score scale. Each dimension has its own "normal"
 * direction encoded in the reference range (workload<60, control>50, etc).
 *
 * @param {string} workerPseudonym
 * @param {string} sampleDate ISO date (YYYY-MM-DD)
 * @returns {Array<{
 *   biomarkerType: string,
 *   value: number,
 *   unit: string,
 *   sampleMatrix: 'blood',
 *   confounders: { kind: 'psychosocial', instrument: 'NIOSH-GJSQ' },
 *   workerPseudonym: string,
 *   sampleDate: string
 * }>}
 */
export function buildPsychosocialReadings(workerPseudonym: any, sampleDate: any) {
    const rand = mulberry32(seedFromString(workerPseudonym + ':psychosocial'));
    const types = [
        'niosh_gjsq_workload',
        'niosh_gjsq_control',
        'niosh_gjsq_social_support',
        'niosh_gjsq_role_conflict',
        'niosh_gjsq_overall_stress',
    ];
    const out = [];
    for (const biomarkerType of types) {
        const range = getRangeFor(biomarkerType);
        if (!range)
            continue;
        const value = plausibleValue(range, rand, 0);
        out.push({
            biomarkerType,
            value,
            unit: range.unit,
            sampleMatrix: ('blood'),
            confounders: {
                kind: ('psychosocial'),
                instrument: ('NIOSH-GJSQ'),
            },
            workerPseudonym,
            sampleDate,
        });
    }
    return out;
}
/**
 * Build Brazilian NR training certification readings — values are
 * remaining validity days. Uses explicit deterministic values (not PRNG)
 * to surface realistic alert scenarios: NR-33 = 50 days from expiry.
 *
 * @param {string} workerPseudonym
 * @param {string} sampleDate ISO date (YYYY-MM-DD)
 * @returns {Array<{
 *   biomarkerType: string,
 *   value: number,
 *   unit: string,
 *   sampleMatrix: 'blood',
 *   confounders: { kind: 'nr_training', regulation: 'BR-NR' },
 *   workerPseudonym: string,
 *   sampleDate: string
 * }>}
 */
export function buildNrTrainingReadings(workerPseudonym: any, sampleDate: any) {
    /** @type {Array<{biomarkerType: string, value: number}>} */
    const entries = [
        { biomarkerType: 'nr06_epi_training_days_left', value: 200 },
        { biomarkerType: 'nr09_pgrt_training_days_left', value: 300 },
        { biomarkerType: 'nr15_unhealthy_training_days_left', value: 100 },
        // NR-33 confined space — propositadamente proximo do vencimento (alerta)
        { biomarkerType: 'nr33_confined_space_days_left', value: 50 },
        { biomarkerType: 'nr35_height_work_days_left', value: 500 },
    ];
    const out = [];
    for (const e of entries) {
        const range = getRangeFor(e.biomarkerType);
        if (!range)
            continue;
        out.push({
            biomarkerType: e.biomarkerType,
            value: e.value,
            unit: range.unit,
            sampleMatrix: ('blood'),
            confounders: {
                kind: ('nr_training'),
                regulation: ('BR-NR'),
            },
            workerPseudonym,
            sampleDate,
        });
    }
    return out;
}
/**
 * Build vaccination history readings. Two value types:
 *   - *_days_since: dias desde a ultima dose
 *   - *_doses_completed: contagem absoluta de doses
 *
 * @param {string} workerPseudonym
 * @param {string} sampleDate ISO date (YYYY-MM-DD)
 * @returns {Array<{
 *   biomarkerType: string,
 *   value: number,
 *   unit: string,
 *   sampleMatrix: 'blood',
 *   confounders: { kind: 'vaccination' },
 *   workerPseudonym: string,
 *   sampleDate: string
 * }>}
 */
export function buildVaccinationReadings(workerPseudonym: any, sampleDate: any) {
    /** @type {Array<{biomarkerType: string, value: number}>} */
    const entries = [
        // Reforco a cada 10 anos — 1500 dias ~ 4 anos desde a ultima dose
        { biomarkerType: 'vaccine_tetanus_diphtheria_days_since', value: 1500 },
        // Esquema completo (3 doses)
        { biomarkerType: 'vaccine_hepatitis_b_doses_completed', value: 3 },
        // Reforco a cada 10 anos — 800 dias ~ 2 anos
        { biomarkerType: 'vaccine_yellow_fever_days_since', value: 800 },
        // COVID-19 — 3 doses (primaria + reforco)
        { biomarkerType: 'vaccine_covid_doses_completed', value: 3 },
        // Influenza anual — 180 dias (campanha do ano corrente)
        { biomarkerType: 'vaccine_influenza_days_since', value: 180 },
    ];
    const out = [];
    for (const e of entries) {
        const range = getRangeFor(e.biomarkerType);
        if (!range)
            continue;
        out.push({
            biomarkerType: e.biomarkerType,
            value: e.value,
            unit: range.unit,
            sampleMatrix: ('blood'),
            confounders: { kind: ('vaccination') },
            workerPseudonym,
            sampleDate,
        });
    }
    return out;
}
/**
 * Build extended anthropometry readings (cintura, %gordura, RCQ, massa
 * muscular, %agua corporal). Faixas adulto masculino conservadoras.
 *
 * @param {string} workerPseudonym
 * @param {string} sampleDate ISO date (YYYY-MM-DD)
 * @returns {Array<{
 *   biomarkerType: string,
 *   value: number,
 *   unit: string,
 *   sampleMatrix: 'blood',
 *   confounders: { kind: 'anthropometry' },
 *   workerPseudonym: string,
 *   sampleDate: string
 * }>}
 */
export function buildAnthropometryReadings(workerPseudonym: any, sampleDate: any) {
    const rand = mulberry32(seedFromString(workerPseudonym + ':anthropometry'));
    const types = [
        'waist_circumference_cm',
        'body_fat_percent',
        'waist_to_hip_ratio',
        'muscle_mass_kg',
        'body_water_percent',
    ];
    const out = [];
    for (const biomarkerType of types) {
        const range = getRangeFor(biomarkerType);
        if (!range)
            continue;
        // RCQ usa precisao 2 (0.85), demais inteiro ou 1 decimal
        const precision = biomarkerType === 'waist_to_hip_ratio' ? 2 : 1;
        const value = plausibleValue(range, rand, precision);
        out.push({
            biomarkerType,
            value,
            unit: range.unit,
            sampleMatrix: ('blood'),
            confounders: { kind: ('anthropometry') },
            workerPseudonym,
            sampleDate,
        });
    }
    return out;
}
/**
 * Build cumulative exposure history readings — total years of exposure
 * to specific occupational agents. Critical for chronic disease risk
 * (silicose, mesotelioma, leucemia, NIHL, saturnismo).
 *
 * @param {string} workerPseudonym
 * @param {string} sampleDate ISO date (YYYY-MM-DD)
 * @returns {Array<{
 *   biomarkerType: string,
 *   value: number,
 *   unit: string,
 *   sampleMatrix: 'blood',
 *   confounders: { kind: 'cumulative_exposure' },
 *   workerPseudonym: string,
 *   sampleDate: string
 * }>}
 */
export function buildCumulativeExposureReadings(workerPseudonym: any, sampleDate: any) {
    const rand = mulberry32(seedFromString(workerPseudonym + ':cumulative_exposure'));
    const types = [
        'cumulative_exposure_silica_years',
        'cumulative_exposure_asbestos_years',
        'cumulative_exposure_btex_years',
        'cumulative_exposure_noise_years_above_85db',
        'cumulative_exposure_lead_years',
    ];
    const out = [];
    for (const biomarkerType of types) {
        const range = getRangeFor(biomarkerType);
        if (!range)
            continue;
        const value = plausibleValue(range, rand, 1);
        out.push({
            biomarkerType,
            value,
            unit: range.unit,
            sampleMatrix: ('blood'),
            confounders: { kind: ('cumulative_exposure') },
            workerPseudonym,
            sampleDate,
        });
    }
    return out;
}
/**
 * Carrega o demo Individual Health.
 *
 * @param {{ subjectType?: 'human'|'dog'|'cat'|'plant', name?: string }} [options]
 * @returns {Promise<{ subjectId: string, workerId: string|null, readingCount: number, epiCount: number }>}
 */
export async function loadIndividualHealthDemo(options: any = {}) {
    const subjectType = options.subjectType || 'human';
    const name = options.name || (SUBJECT_DEFAULT_NAME as Record<string, any>)[subjectType] || 'SUBJ-001';
    const modelId = (SUBJECT_MODEL_ID as Record<string, any>)[subjectType] || SUBJECT_MODEL_ID.human;
    await Promise.all([ensureToast(), ensureT()]);
    const toast = _cachedShowToast || (() => { });
    const t = _cachedT || ((k: any) => k);
    // Step 1 — Deep clear (Calvin 2026-05-15: "criar novo modelo não limpa
    // terreno nem remove surfaces"). Limpa elementos + surfaces + aerial +
    // origem geo + autosave IDB. Mesmo pattern do GHG RMSP demo.
    try {
        const engineMod = (await import('./engine.js' as string));
        if (typeof engineMod.deepClearForDemoTakeover === 'function') {
            await engineMod.deepClearForDemoTakeover();
        }
    }
    catch (err: any) {
        console.debug('[individualHealthDemo] deepClear skipped:', errorMessage(err));
    }
    try {
        const coordsMod = (await import('../../core/io/geo/coordinates.js' as string));
        if (typeof coordsMod.clearOrigin === 'function') {
            coordsMod.clearOrigin();
        }
    }
    catch (err: any) {
        console.debug('[individualHealthDemo] clearOrigin skipped:', errorMessage(err));
    }
    // Step 2 — Adicionar o sujeito (family individual) em [0,0,0]
    const elementsMod = (await import('../../core/elements/manager.js' as string));
    const addElement = elementsMod.addElement;
    const ppeList = buildEpiList();
    const subjectId = `demo-subject-${subjectType}-${Date.now()}`;
    // Pré-construir observations a partir dos readings ANTES do addElement,
    // para que apareçam no inspector imediatamente (Calvin 2026-05-15:
    // "sem observation no individual").
    const sampleDate = new Date().toISOString().slice(0, 10);
    const preReadings = [
        ...buildReadingSpecs(name, sampleDate),
        ...buildClinicalChemistryReadings(name, sampleDate),
        ...buildVitalSignsReadings(name, sampleDate),
        ...buildOccupationalExamsReadings(name, sampleDate),
        ...buildEcgReadings(name, sampleDate),
        ...buildPsychosocialReadings(name, sampleDate),
        ...buildNrTrainingReadings(name, sampleDate),
        ...buildVaccinationReadings(name, sampleDate),
        ...buildAnthropometryReadings(name, sampleDate),
        ...buildCumulativeExposureReadings(name, sampleDate),
    ];
    const observationsForElement = preReadings.map((r: any, idx: any) => {
        const confounders = (r.confounders || {});
        return {
            id: `obs-${subjectId}-${idx}`,
            parameterId: r.biomarkerType,
            value: r.value,
            unitId: r.unit,
            unit: r.unit,
            date: r.sampleDate,
            sampleMatrix: r.sampleMatrix,
            confounders,
            meta: {
                kind: confounders.kind || 'biomarker',
                workerPseudonym: r.workerPseudonym,
            },
        };
    });
    addElement('individual', subjectId, name, {
        position: { x: 0, y: 0, z: 0 },
        // Calvin 2026-05-15: "não vejo o individuo em .glb" — meshFactory
        // procura `data.modelVariantId` (não `modelId`) para resolver via
        // model-library + H2 Supabase Storage.
        modelVariantId: modelId,
        modelId, // mantido para legacy / observações
        subjectType,
        observations: observationsForElement,
        // Sumario PPE agregado consumido pelo painel de saude (HUD/EIS)
        ppe_summary: {
            helmet: true,
            goggles: true,
            respirator: true,
            gloves: true,
            boots: true,
            hearing: true,
            count: ppeList.length,
        },
    }, { label: name });
    // Step 3 — Criar worker registry + persist readings via schema/healthStore
    // (preReadings já construído antes de addElement para popular observations).
    const projectId = `demo-individual-health-${subjectType}`;
    let workerId = null;
    let readingCount = 0;
    try {
        const schemaMod = (await import('../../core/health/schema.js' as string));
        const worker = schemaMod.createWorker({
            pseudonym: name,
            projectId,
            consentHash: 'demo-consent',
            role: 'subject',
        });
        workerId = worker.id;
        const readings = preReadings.map((spec: any) => schemaMod.createReading({
            workerPseudonym: spec.workerPseudonym,
            biomarkerType: spec.biomarkerType,
            value: spec.value,
            unit: spec.unit,
            sampleDate: spec.sampleDate,
            sampleMatrix: spec.sampleMatrix,
            confounders: spec.confounders,
            elementId: subjectId,
        }));
        // Persiste em IDB via healthStore (no-op silencioso se IDB indisponivel)
        try {
            const storeMod = (await import('../../core/health/healthStore.js' as string));
            if (typeof storeMod.saveWorker === 'function') {
                await storeMod.saveWorker(worker);
            }
            if (typeof storeMod.saveReading === 'function') {
                for (const r of readings) {
                    await storeMod.saveReading(r);
                }
            }
            readingCount = readings.length;
        }
        catch (err: any) {
            console.debug('[individualHealthDemo] healthStore unavailable:', errorMessage(err));
            readingCount = readings.length;
        }
    }
    catch (err: any) {
        console.warn('[individualHealthDemo] health schema failed:', errorMessage(err));
    }
    // Step 4 — Criar grupos para organizar a árvore (Calvin 2026-05-15:
    // "árvore de elementos está bagunçada"). 2 grupos: "Avaliação Individual"
    // contém o subject; "Equipamentos EPI" contém os 8 EPI.
    let subjectGroupId: string | null;
    let ppeGroupId = null;
    try {
        const groupsMod = (await import('../groups/manager.js' as string));
        if (typeof groupsMod.addElementGroup === 'function') {
            const subjectGroup = groupsMod.addElementGroup({
                name: t('demoSubjectGroupName') || `Avaliação Individual (${subjectType})`,
                color: '#3b82f6',
            });
            subjectGroupId = subjectGroup.id;
            const ppeGroup = groupsMod.addElementGroup({
                name: t('demoPpeGroupName') || 'Equipamentos de Proteção (EPI)',
                color: '#f59e0b',
            });
            ppeGroupId = ppeGroup.id;
            if (typeof groupsMod.setElementGroup === 'function') {
                groupsMod.setElementGroup(subjectId, subjectGroupId);
            }
        }
    }
    catch (err: any) {
        console.debug('[individualHealthDemo] group setup skipped:', errorMessage(err));
    }
    // Step 5 — Adicionar 8 EPIs (par luvas + par botas) + observations
    // (Calvin 2026-05-15: "equipments estão sem observations").
    // Cada EPI tem 4 observations: certificado CA, validade, fabricante, inspeção.
    let epiCount = 0;
    const inspectionDate = sampleDate;
    const manufactureDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10); // 1 ano atrás
    const expiryDate = new Date(Date.now() + 730 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10); // 2 anos à frente
    const CA_NUMBERS = {
        helmet: 'CA-12345',
        goggles: 'CA-23456',
        respirator: 'CA-34567',
        gloves: 'CA-45678',
        boots: 'CA-56789',
        hearing: 'CA-67890',
    };
    const MANUFACTURERS = {
        helmet: 'MSA',
        goggles: '3M',
        respirator: '3M',
        gloves: 'Ansell',
        boots: 'Bracol',
        hearing: '3M',
    };
    for (const epi of ppeList) {
        const epiId = `${subjectId}-ppe-${epi.kind}-${epiCount}`;
        const caNumber = (CA_NUMBERS as Record<string, any>)[epi.kind] || 'CA-00000';
        const manufacturer = (MANUFACTURERS as Record<string, any>)[epi.kind] || 'N/A';
        const epiObservations = [
            {
                id: `obs-${epiId}-ca`,
                parameterId: 'ppe_ca_certificate',
                value: caNumber,
                unit: 'text',
                date: inspectionDate,
                meta: { kind: 'ppe_metadata', source: 'MTE-Brazil' },
            },
            {
                id: `obs-${epiId}-manufacture`,
                parameterId: 'ppe_manufacture_date',
                value: manufactureDate,
                unit: 'date',
                date: inspectionDate,
                meta: { kind: 'ppe_metadata', manufacturer },
            },
            {
                id: `obs-${epiId}-expiry`,
                parameterId: 'ppe_expiry_date',
                value: expiryDate,
                unit: 'date',
                date: inspectionDate,
                meta: { kind: 'ppe_metadata' },
            },
            {
                id: `obs-${epiId}-inspection`,
                parameterId: 'ppe_last_inspection',
                value: inspectionDate,
                unit: 'date',
                date: inspectionDate,
                meta: { kind: 'ppe_inspection', status: 'OK', inspector: 'demo' },
            },
            {
                id: `obs-${epiId}-protection`,
                parameterId: 'ppe_protection_factor',
                value: epi.protectionFactor,
                unit: epi.kind === 'hearing' ? 'dB' : 'ratio',
                date: inspectionDate,
                meta: { kind: 'ppe_metadata' },
            },
        ];
        addElement('equipment', epiId, epi.label, {
            position: epi.position,
            ppe_kind: epi.kind,
            protectionFactor: epi.protectionFactor,
            wornBy: subjectId,
            ca_certificate: caNumber,
            manufacturer,
            manufactureDate,
            expiryDate,
            observations: epiObservations,
        }, { label: epi.label });
        // Atribuir ao grupo PPE
        try {
            const groupsMod = (await import('../groups/manager.js' as string));
            if (ppeGroupId && typeof groupsMod.setElementGroup === 'function') {
                groupsMod.setElementGroup(epiId, ppeGroupId);
            }
        }
        catch (_e: any) {
            console.debug('[individualHealthDemo] ppe group assign skipped:', errorMessage(_e));
        }
        epiCount += 1;
    }
    const baseMsg = t('demoIndividualHealthLoaded') || `Demo Individual Health carregada (${subjectType})`;
    const msg = `${baseMsg} — ${readingCount} leituras`;
    toast(msg, 'success');
    // UX flow contínuo: abrir Health Alerts Widget após 1.5s para mostrar
    // o resultado dos avaliadores (NR-33 50d / cumulative_exposure / etc).
    // Calvin diretiva 2026-05-15: demo deve fluir até o output final.
    try {
        setTimeout(() => {
            const fn = (window).handleOpenHealthAlertsWidget;
            if (typeof fn === 'function') {
                fn();
            }
        }, 1500);
    }
    catch (err: any) {
        console.debug('[individualHealthDemo] alerts widget auto-open skipped:', errorMessage(err));
    }
    return { subjectId, workerId, readingCount, epiCount };
}
