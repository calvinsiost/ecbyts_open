// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   HEALTH-MON-001 — Catálogo de Faixas de Referência Clínica

   Tabela informativa (NÃO regulatória) de faixas de referência para
   exames clínicos de rotina, sinais vitais e marcadores ocupacionais
   NR-7 (audiometria, espirometria) — utilizada pelo demo Individual
   Health para gerar leituras plausíveis e classificá-las.

   Cobertura por categoria:
     - lipid: cholesterol_total, hdl, ldl, triglycerides
     - glycemic: fasting_glucose, hba1c
     - renal: creatinine, urea
     - hepatic: alt, ast, ggt, total_bilirubin
     - hemogram: hemoglobin, hematocrit, leukocytes, platelets
     - thyroid: tsh, free_t4
     - inflammation: crp, esr
     - electrolyte: sodium, potassium, calcium, magnesium
     - vitamin: vitamin_d, vitamin_b12, folate
     - vitals: systolic_bp, diastolic_bp, heart_rate, o2_saturation,
              body_temperature, bmi
     - ecg: ecg_heart_rate_bpm, ecg_pr_interval_ms, ecg_qrs_duration_ms,
            ecg_qt_interval_ms, ecg_qtc_corrected_ms
     - psychosocial: niosh_gjsq_workload, niosh_gjsq_control,
                     niosh_gjsq_social_support, niosh_gjsq_role_conflict,
                     niosh_gjsq_overall_stress
     - nr_training: nr06/nr09/nr15/nr33/nr35 remaining validity days
     - vaccination: tetanus_diphtheria, hepatitis_b, yellow_fever,
                    covid, influenza
     - anthropometry: waist_circumference_cm, body_fat_percent,
                      waist_to_hip_ratio, muscle_mass_kg, body_water_percent
     - cumulative_exposure: silica, asbestos, btex, noise_85db, lead (years)

   Sem DOM, sem rede — catálogo estático frozen.
   ================================================================ */

export interface ClinicalRange {
    biomarkerType: string;
    label_pt: string;
    label_en: string;
    unit: string;
    sampleMatrix: 'urine' | 'blood' | 'exhaled_air' | 'other';
    refMin: number;
    refMax: number;
    category:
        | 'lipid'
        | 'glycemic'
        | 'renal'
        | 'hepatic'
        | 'hemogram'
        | 'thyroid'
        | 'inflammation'
        | 'electrolyte'
        | 'vitamin'
        | 'vitals'
        | 'ecg'
        | 'psychosocial'
        | 'nr_training'
        | 'vaccination'
        | 'anthropometry'
        | 'cumulative_exposure';
}

/**
 * Reference ranges keyed by biomarkerType.
 * Values from standard adult clinical chemistry references (informational only).
 */
export const CLINICAL_REFERENCE_RANGES: Readonly<Record<string, ClinicalRange>> = Object.freeze({
    // ---------------- Lipid panel ----------------
    cholesterol_total: Object.freeze({
        biomarkerType: 'cholesterol_total',
        label_pt: 'Colesterol total',
        label_en: 'Total cholesterol',
        unit: 'mg/dL',
        sampleMatrix: 'blood',
        refMin: 100,
        refMax: 200,
        category: 'lipid',
    }),
    hdl: Object.freeze({
        biomarkerType: 'hdl',
        label_pt: 'HDL colesterol',
        label_en: 'HDL cholesterol',
        unit: 'mg/dL',
        sampleMatrix: 'blood',
        refMin: 40,
        refMax: 100,
        category: 'lipid',
    }),
    ldl: Object.freeze({
        biomarkerType: 'ldl',
        label_pt: 'LDL colesterol',
        label_en: 'LDL cholesterol',
        unit: 'mg/dL',
        sampleMatrix: 'blood',
        refMin: 50,
        refMax: 130,
        category: 'lipid',
    }),
    triglycerides: Object.freeze({
        biomarkerType: 'triglycerides',
        label_pt: 'Triglicerídeos',
        label_en: 'Triglycerides',
        unit: 'mg/dL',
        sampleMatrix: 'blood',
        refMin: 40,
        refMax: 150,
        category: 'lipid',
    }),

    // ---------------- Glycemic panel ----------------
    fasting_glucose: Object.freeze({
        biomarkerType: 'fasting_glucose',
        label_pt: 'Glicemia de jejum',
        label_en: 'Fasting glucose',
        unit: 'mg/dL',
        sampleMatrix: 'blood',
        refMin: 70,
        refMax: 99,
        category: 'glycemic',
    }),
    hba1c: Object.freeze({
        biomarkerType: 'hba1c',
        label_pt: 'Hemoglobina glicada',
        label_en: 'Glycated hemoglobin',
        unit: '%',
        sampleMatrix: 'blood',
        refMin: 4.0,
        refMax: 5.7,
        category: 'glycemic',
    }),

    // ---------------- Renal panel ----------------
    creatinine: Object.freeze({
        biomarkerType: 'creatinine',
        label_pt: 'Creatinina',
        label_en: 'Creatinine',
        unit: 'mg/dL',
        sampleMatrix: 'blood',
        refMin: 0.7,
        refMax: 1.3,
        category: 'renal',
    }),
    urea: Object.freeze({
        biomarkerType: 'urea',
        label_pt: 'Ureia',
        label_en: 'Urea',
        unit: 'mg/dL',
        sampleMatrix: 'blood',
        refMin: 15,
        refMax: 40,
        category: 'renal',
    }),

    // ---------------- Hepatic panel ----------------
    alt: Object.freeze({
        biomarkerType: 'alt',
        label_pt: 'ALT (TGP)',
        label_en: 'Alanine aminotransferase',
        unit: 'U/L',
        sampleMatrix: 'blood',
        refMin: 7,
        refMax: 56,
        category: 'hepatic',
    }),
    ast: Object.freeze({
        biomarkerType: 'ast',
        label_pt: 'AST (TGO)',
        label_en: 'Aspartate aminotransferase',
        unit: 'U/L',
        sampleMatrix: 'blood',
        refMin: 10,
        refMax: 40,
        category: 'hepatic',
    }),
    ggt: Object.freeze({
        biomarkerType: 'ggt',
        label_pt: 'Gama-GT',
        label_en: 'Gamma-glutamyl transferase',
        unit: 'U/L',
        sampleMatrix: 'blood',
        refMin: 9,
        refMax: 48,
        category: 'hepatic',
    }),
    total_bilirubin: Object.freeze({
        biomarkerType: 'total_bilirubin',
        label_pt: 'Bilirrubina total',
        label_en: 'Total bilirubin',
        unit: 'mg/dL',
        sampleMatrix: 'blood',
        refMin: 0.1,
        refMax: 1.2,
        category: 'hepatic',
    }),

    // ---------------- Hemogram ----------------
    hemoglobin: Object.freeze({
        biomarkerType: 'hemoglobin',
        label_pt: 'Hemoglobina',
        label_en: 'Hemoglobin',
        unit: 'g/dL',
        sampleMatrix: 'blood',
        refMin: 13.5,
        refMax: 17.5,
        category: 'hemogram',
    }),
    hematocrit: Object.freeze({
        biomarkerType: 'hematocrit',
        label_pt: 'Hematócrito',
        label_en: 'Hematocrit',
        unit: '%',
        sampleMatrix: 'blood',
        refMin: 40,
        refMax: 50,
        category: 'hemogram',
    }),
    leukocytes: Object.freeze({
        biomarkerType: 'leukocytes',
        label_pt: 'Leucócitos',
        label_en: 'Leukocytes',
        unit: '10³/µL',
        sampleMatrix: 'blood',
        refMin: 4,
        refMax: 11,
        category: 'hemogram',
    }),
    platelets: Object.freeze({
        biomarkerType: 'platelets',
        label_pt: 'Plaquetas',
        label_en: 'Platelets',
        unit: '10³/µL',
        sampleMatrix: 'blood',
        refMin: 150,
        refMax: 400,
        category: 'hemogram',
    }),

    // ---------------- Thyroid ----------------
    tsh: Object.freeze({
        biomarkerType: 'tsh',
        label_pt: 'TSH',
        label_en: 'Thyroid-stimulating hormone',
        unit: 'µIU/mL',
        sampleMatrix: 'blood',
        refMin: 0.4,
        refMax: 4.0,
        category: 'thyroid',
    }),
    free_t4: Object.freeze({
        biomarkerType: 'free_t4',
        label_pt: 'T4 livre',
        label_en: 'Free thyroxine',
        unit: 'ng/dL',
        sampleMatrix: 'blood',
        refMin: 0.8,
        refMax: 1.8,
        category: 'thyroid',
    }),

    // ---------------- Inflammation ----------------
    crp: Object.freeze({
        biomarkerType: 'crp',
        label_pt: 'Proteína C reativa',
        label_en: 'C-reactive protein',
        unit: 'mg/L',
        sampleMatrix: 'blood',
        refMin: 0,
        refMax: 3.0,
        category: 'inflammation',
    }),
    esr: Object.freeze({
        biomarkerType: 'esr',
        label_pt: 'VHS (hemossedimentação)',
        label_en: 'Erythrocyte sedimentation rate',
        unit: 'mm/h',
        sampleMatrix: 'blood',
        refMin: 0,
        refMax: 20,
        category: 'inflammation',
    }),

    // ---------------- Electrolytes ----------------
    sodium: Object.freeze({
        biomarkerType: 'sodium',
        label_pt: 'Sódio',
        label_en: 'Sodium',
        unit: 'mEq/L',
        sampleMatrix: 'blood',
        refMin: 135,
        refMax: 145,
        category: 'electrolyte',
    }),
    potassium: Object.freeze({
        biomarkerType: 'potassium',
        label_pt: 'Potássio',
        label_en: 'Potassium',
        unit: 'mEq/L',
        sampleMatrix: 'blood',
        refMin: 3.5,
        refMax: 5.0,
        category: 'electrolyte',
    }),
    calcium: Object.freeze({
        biomarkerType: 'calcium',
        label_pt: 'Cálcio total',
        label_en: 'Total calcium',
        unit: 'mg/dL',
        sampleMatrix: 'blood',
        refMin: 8.5,
        refMax: 10.5,
        category: 'electrolyte',
    }),
    magnesium: Object.freeze({
        biomarkerType: 'magnesium',
        label_pt: 'Magnésio',
        label_en: 'Magnesium',
        unit: 'mg/dL',
        sampleMatrix: 'blood',
        refMin: 1.7,
        refMax: 2.2,
        category: 'electrolyte',
    }),

    // ---------------- Vitamins ----------------
    vitamin_d: Object.freeze({
        biomarkerType: 'vitamin_d',
        label_pt: 'Vitamina D (25-OH)',
        label_en: 'Vitamin D (25-OH)',
        unit: 'ng/mL',
        sampleMatrix: 'blood',
        refMin: 30,
        refMax: 100,
        category: 'vitamin',
    }),
    vitamin_b12: Object.freeze({
        biomarkerType: 'vitamin_b12',
        label_pt: 'Vitamina B12',
        label_en: 'Vitamin B12',
        unit: 'pg/mL',
        sampleMatrix: 'blood',
        refMin: 200,
        refMax: 900,
        category: 'vitamin',
    }),
    folate: Object.freeze({
        biomarkerType: 'folate',
        label_pt: 'Ácido fólico',
        label_en: 'Folate',
        unit: 'ng/mL',
        sampleMatrix: 'blood',
        refMin: 2,
        refMax: 20,
        category: 'vitamin',
    }),

    // ---------------- Vital signs ----------------
    // sampleMatrix='blood' por compatibilidade com schema enum (urine/blood/exhaled_air/other).
    // Differenciado via confounders.kind='vitals' no loader.
    systolic_bp: Object.freeze({
        biomarkerType: 'systolic_bp',
        label_pt: 'Pressão arterial sistólica',
        label_en: 'Systolic blood pressure',
        unit: 'mmHg',
        sampleMatrix: 'blood',
        refMin: 90,
        refMax: 120,
        category: 'vitals',
    }),
    diastolic_bp: Object.freeze({
        biomarkerType: 'diastolic_bp',
        label_pt: 'Pressão arterial diastólica',
        label_en: 'Diastolic blood pressure',
        unit: 'mmHg',
        sampleMatrix: 'blood',
        refMin: 60,
        refMax: 80,
        category: 'vitals',
    }),
    heart_rate: Object.freeze({
        biomarkerType: 'heart_rate',
        label_pt: 'Frequência cardíaca',
        label_en: 'Heart rate',
        unit: 'bpm',
        sampleMatrix: 'blood',
        refMin: 60,
        refMax: 100,
        category: 'vitals',
    }),
    o2_saturation: Object.freeze({
        biomarkerType: 'o2_saturation',
        label_pt: 'Saturação de oxigênio',
        label_en: 'Oxygen saturation',
        unit: '%',
        sampleMatrix: 'blood',
        refMin: 95,
        refMax: 100,
        category: 'vitals',
    }),
    body_temperature: Object.freeze({
        biomarkerType: 'body_temperature',
        label_pt: 'Temperatura corporal',
        label_en: 'Body temperature',
        unit: '°C',
        sampleMatrix: 'blood',
        refMin: 36,
        refMax: 37.5,
        category: 'vitals',
    }),
    bmi: Object.freeze({
        biomarkerType: 'bmi',
        label_pt: 'Índice de massa corporal',
        label_en: 'Body mass index',
        unit: 'kg/m²',
        sampleMatrix: 'blood',
        refMin: 18.5,
        refMax: 24.9,
        category: 'vitals',
    }),

    // ---------------- ECG markers ----------------
    // sampleMatrix='blood' por compatibilidade com schema enum.
    // Differenciado via confounders.kind='ecg' no loader.
    ecg_heart_rate_bpm: Object.freeze({
        biomarkerType: 'ecg_heart_rate_bpm',
        label_pt: 'Frequência cardíaca (ECG)',
        label_en: 'ECG heart rate',
        unit: 'bpm',
        sampleMatrix: 'blood',
        refMin: 40,
        refMax: 100,
        category: 'ecg',
    }),
    ecg_pr_interval_ms: Object.freeze({
        biomarkerType: 'ecg_pr_interval_ms',
        label_pt: 'Intervalo PR (ECG)',
        label_en: 'ECG PR interval',
        unit: 'ms',
        sampleMatrix: 'blood',
        refMin: 120,
        refMax: 200,
        category: 'ecg',
    }),
    ecg_qrs_duration_ms: Object.freeze({
        biomarkerType: 'ecg_qrs_duration_ms',
        label_pt: 'Duração QRS (ECG)',
        label_en: 'ECG QRS duration',
        unit: 'ms',
        sampleMatrix: 'blood',
        refMin: 80,
        refMax: 120,
        category: 'ecg',
    }),
    ecg_qt_interval_ms: Object.freeze({
        biomarkerType: 'ecg_qt_interval_ms',
        label_pt: 'Intervalo QT (ECG)',
        label_en: 'ECG QT interval',
        unit: 'ms',
        sampleMatrix: 'blood',
        refMin: 350,
        refMax: 440,
        category: 'ecg',
    }),
    ecg_qtc_corrected_ms: Object.freeze({
        biomarkerType: 'ecg_qtc_corrected_ms',
        label_pt: 'QT corrigido (QTc Bazett)',
        label_en: 'ECG QTc (Bazett)',
        unit: 'ms',
        sampleMatrix: 'blood',
        refMin: 340,
        refMax: 450,
        category: 'ecg',
    }),

    // ---------------- Psychosocial — NIOSH GJSQ ----------------
    // NIOSH Generic Job Stress Questionnaire (0-100 score por dimensão).
    // Direção do "normal" depende da dimensão (workload<60, control>50, etc).
    // refMin/refMax aqui são os limites do RANGE DE NORMALIDADE (não 0-100).
    niosh_gjsq_workload: Object.freeze({
        biomarkerType: 'niosh_gjsq_workload',
        label_pt: 'NIOSH GJSQ — carga de trabalho',
        label_en: 'NIOSH GJSQ — workload',
        unit: 'score',
        sampleMatrix: 'blood',
        refMin: 0,
        refMax: 60,
        category: 'psychosocial',
    }),
    niosh_gjsq_control: Object.freeze({
        biomarkerType: 'niosh_gjsq_control',
        label_pt: 'NIOSH GJSQ — controle/autonomia',
        label_en: 'NIOSH GJSQ — job control',
        unit: 'score',
        sampleMatrix: 'blood',
        refMin: 50,
        refMax: 100,
        category: 'psychosocial',
    }),
    niosh_gjsq_social_support: Object.freeze({
        biomarkerType: 'niosh_gjsq_social_support',
        label_pt: 'NIOSH GJSQ — suporte social',
        label_en: 'NIOSH GJSQ — social support',
        unit: 'score',
        sampleMatrix: 'blood',
        refMin: 60,
        refMax: 100,
        category: 'psychosocial',
    }),
    niosh_gjsq_role_conflict: Object.freeze({
        biomarkerType: 'niosh_gjsq_role_conflict',
        label_pt: 'NIOSH GJSQ — conflito de papel',
        label_en: 'NIOSH GJSQ — role conflict',
        unit: 'score',
        sampleMatrix: 'blood',
        refMin: 0,
        refMax: 40,
        category: 'psychosocial',
    }),
    niosh_gjsq_overall_stress: Object.freeze({
        biomarkerType: 'niosh_gjsq_overall_stress',
        label_pt: 'NIOSH GJSQ — estresse global',
        label_en: 'NIOSH GJSQ — overall stress',
        unit: 'score',
        sampleMatrix: 'blood',
        refMin: 0,
        refMax: 50,
        category: 'psychosocial',
    }),

    // ---------------- NR training (validity days remaining) ----------------
    // Valor = dias restantes ate vencer. refMax = periodicidade tipica em dias.
    // refMin=30: alerta proativo quando faltam <=30 dias.
    nr06_epi_training_days_left: Object.freeze({
        biomarkerType: 'nr06_epi_training_days_left',
        label_pt: 'NR-6 — Treinamento EPI (dias até vencer)',
        label_en: 'NR-6 PPE training (days remaining)',
        unit: 'days',
        sampleMatrix: 'blood',
        refMin: 30,
        refMax: 365,
        category: 'nr_training',
    }),
    nr09_pgrt_training_days_left: Object.freeze({
        biomarkerType: 'nr09_pgrt_training_days_left',
        label_pt: 'NR-9 — Treinamento PGRT (dias até vencer)',
        label_en: 'NR-9 PGRT training (days remaining)',
        unit: 'days',
        sampleMatrix: 'blood',
        refMin: 30,
        refMax: 365,
        category: 'nr_training',
    }),
    nr15_unhealthy_training_days_left: Object.freeze({
        biomarkerType: 'nr15_unhealthy_training_days_left',
        label_pt: 'NR-15 — Insalubridade (dias até vencer)',
        label_en: 'NR-15 unhealthy work training (days remaining)',
        unit: 'days',
        sampleMatrix: 'blood',
        refMin: 30,
        refMax: 365,
        category: 'nr_training',
    }),
    nr33_confined_space_days_left: Object.freeze({
        biomarkerType: 'nr33_confined_space_days_left',
        label_pt: 'NR-33 — Espaço confinado (dias até vencer)',
        label_en: 'NR-33 confined space (days remaining)',
        unit: 'days',
        sampleMatrix: 'blood',
        refMin: 30,
        refMax: 365,
        category: 'nr_training',
    }),
    nr35_height_work_days_left: Object.freeze({
        biomarkerType: 'nr35_height_work_days_left',
        label_pt: 'NR-35 — Trabalho em altura (dias até vencer)',
        label_en: 'NR-35 height work (days remaining)',
        unit: 'days',
        sampleMatrix: 'blood',
        refMin: 30,
        refMax: 730,
        category: 'nr_training',
    }),

    // ---------------- Vaccination ----------------
    // *_days_since: dias desde a ultima dose. refMin=0, refMax=intervalo do reforco.
    // *_doses_completed: contagem absoluta de doses ate o alvo recomendado.
    vaccine_tetanus_diphtheria_days_since: Object.freeze({
        biomarkerType: 'vaccine_tetanus_diphtheria_days_since',
        label_pt: 'Vacina dT (dias desde última dose)',
        label_en: 'Tetanus-Diphtheria vaccine (days since)',
        unit: 'days',
        sampleMatrix: 'blood',
        refMin: 0,
        refMax: 3650,
        category: 'vaccination',
    }),
    vaccine_hepatitis_b_doses_completed: Object.freeze({
        biomarkerType: 'vaccine_hepatitis_b_doses_completed',
        label_pt: 'Vacina Hepatite B (doses concluídas)',
        label_en: 'Hepatitis B vaccine (doses completed)',
        unit: 'doses',
        sampleMatrix: 'blood',
        refMin: 3,
        refMax: 3,
        category: 'vaccination',
    }),
    vaccine_yellow_fever_days_since: Object.freeze({
        biomarkerType: 'vaccine_yellow_fever_days_since',
        label_pt: 'Vacina Febre Amarela (dias desde última dose)',
        label_en: 'Yellow Fever vaccine (days since)',
        unit: 'days',
        sampleMatrix: 'blood',
        refMin: 0,
        refMax: 3650,
        category: 'vaccination',
    }),
    vaccine_covid_doses_completed: Object.freeze({
        biomarkerType: 'vaccine_covid_doses_completed',
        label_pt: 'Vacina COVID-19 (doses concluídas)',
        label_en: 'COVID-19 vaccine (doses completed)',
        unit: 'doses',
        sampleMatrix: 'blood',
        refMin: 2,
        refMax: 5,
        category: 'vaccination',
    }),
    vaccine_influenza_days_since: Object.freeze({
        biomarkerType: 'vaccine_influenza_days_since',
        label_pt: 'Vacina Influenza (dias desde última dose)',
        label_en: 'Influenza vaccine (days since)',
        unit: 'days',
        sampleMatrix: 'blood',
        refMin: 0,
        refMax: 365,
        category: 'vaccination',
    }),

    // ---------------- Extended anthropometry ----------------
    // Faixas adulto masculino (referencia conservadora).
    // Para feminino, downstream pode override via threshold engine.
    waist_circumference_cm: Object.freeze({
        biomarkerType: 'waist_circumference_cm',
        label_pt: 'Circunferência abdominal',
        label_en: 'Waist circumference',
        unit: 'cm',
        sampleMatrix: 'blood',
        refMin: 60,
        refMax: 94,
        category: 'anthropometry',
    }),
    body_fat_percent: Object.freeze({
        biomarkerType: 'body_fat_percent',
        label_pt: 'Percentual de gordura corporal',
        label_en: 'Body fat percent',
        unit: '%',
        sampleMatrix: 'blood',
        refMin: 8,
        refMax: 20,
        category: 'anthropometry',
    }),
    waist_to_hip_ratio: Object.freeze({
        biomarkerType: 'waist_to_hip_ratio',
        label_pt: 'Relação cintura/quadril',
        label_en: 'Waist-to-hip ratio',
        unit: 'ratio',
        sampleMatrix: 'blood',
        refMin: 0.7,
        refMax: 0.9,
        category: 'anthropometry',
    }),
    muscle_mass_kg: Object.freeze({
        biomarkerType: 'muscle_mass_kg',
        label_pt: 'Massa muscular',
        label_en: 'Muscle mass',
        unit: 'kg',
        sampleMatrix: 'blood',
        refMin: 30,
        refMax: 50,
        category: 'anthropometry',
    }),
    body_water_percent: Object.freeze({
        biomarkerType: 'body_water_percent',
        label_pt: 'Percentual de água corporal',
        label_en: 'Body water percent',
        unit: '%',
        sampleMatrix: 'blood',
        refMin: 50,
        refMax: 65,
        category: 'anthropometry',
    }),

    // ---------------- Cumulative exposure (years) ----------------
    // refMax = limite abaixo do qual o risco e considerado baixo.
    // refMin=0: ausencia de exposicao acumulada.
    cumulative_exposure_silica_years: Object.freeze({
        biomarkerType: 'cumulative_exposure_silica_years',
        label_pt: 'Exposição acumulada — sílica',
        label_en: 'Cumulative exposure — silica',
        unit: 'years',
        sampleMatrix: 'blood',
        refMin: 0,
        refMax: 10,
        category: 'cumulative_exposure',
    }),
    cumulative_exposure_asbestos_years: Object.freeze({
        biomarkerType: 'cumulative_exposure_asbestos_years',
        label_pt: 'Exposição acumulada — amianto',
        label_en: 'Cumulative exposure — asbestos',
        unit: 'years',
        sampleMatrix: 'blood',
        refMin: 0,
        refMax: 1,
        category: 'cumulative_exposure',
    }),
    cumulative_exposure_btex_years: Object.freeze({
        biomarkerType: 'cumulative_exposure_btex_years',
        label_pt: 'Exposição acumulada — BTEX',
        label_en: 'Cumulative exposure — BTEX',
        unit: 'years',
        sampleMatrix: 'blood',
        refMin: 0,
        refMax: 5,
        category: 'cumulative_exposure',
    }),
    cumulative_exposure_noise_years_above_85db: Object.freeze({
        biomarkerType: 'cumulative_exposure_noise_years_above_85db',
        label_pt: 'Exposição acumulada — ruído >85 dB',
        label_en: 'Cumulative exposure — noise >85 dB',
        unit: 'years',
        sampleMatrix: 'blood',
        refMin: 0,
        refMax: 5,
        category: 'cumulative_exposure',
    }),
    cumulative_exposure_lead_years: Object.freeze({
        biomarkerType: 'cumulative_exposure_lead_years',
        label_pt: 'Exposição acumulada — chumbo',
        label_en: 'Cumulative exposure — lead',
        unit: 'years',
        sampleMatrix: 'blood',
        refMin: 0,
        refMax: 10,
        category: 'cumulative_exposure',
    }),
}) as Readonly<Record<string, ClinicalRange>>;

/**
 * Get the reference range for a given biomarker type.
 */
export function getRangeFor(biomarkerType: string): ClinicalRange | null {
    if (!biomarkerType || typeof biomarkerType !== 'string') return null;
    const entry = (CLINICAL_REFERENCE_RANGES as Record<string, ClinicalRange>)[biomarkerType];
    return entry || null;
}

/**
 * Classify a numeric value against the reference range.
 * Returns 'unknown' if the biomarker type is not catalogued or the value is invalid.
 */
export function classifyValue(biomarkerType: string, value: number): 'low' | 'normal' | 'high' | 'unknown' {
    const range = getRangeFor(biomarkerType);
    if (!range) return 'unknown';
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'unknown';
    if (value < range.refMin) return 'low';
    if (value > range.refMax) return 'high';
    return 'normal';
}

/**
 * List all biomarker entries within a given category.
 */
export function listByCategory(category: string): ClinicalRange[] {
    if (!category || typeof category !== 'string') return [];
    const out: ClinicalRange[] = [];
    for (const key of Object.keys(CLINICAL_REFERENCE_RANGES)) {
        const entry = (CLINICAL_REFERENCE_RANGES as Record<string, ClinicalRange>)[key];
        if (entry && entry.category === category) out.push(entry);
    }
    return out;
}
