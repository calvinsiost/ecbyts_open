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
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   SAO PARAMETERS — Human Health / Occupational Matrix
   Parametros SAO — Matriz Saude Humana / Ocupacional

   Parametros de saude ocupacional e exposicao humana (~35 itens).
   Inclui: exposicao quimica, ruido/vibracao, calor/radiacao,
   biomonitoramento, vigilancia medica, ergonomia, epidemiologia,
   genotoxicidade, endocrino e omica.

   Regulatory references:
   - NR-15 (Atividades e Operacoes Insalubres)
   - NR-7  (PCMSO — Programa de Controle Medico de Saude Ocupacional)
   - NR-9  (PPRA / PGR — Programa de Gerenciamento de Riscos)
   - ACGIH TLV/BEI (Threshold Limit Values / Biological Exposure Indices)
   - NIOSH REL (Recommended Exposure Limits)
   - ICRP (International Commission on Radiological Protection)
   - CNEN NN-3.01 (Norma de Radioprotecao)
   ================================================================ */

// ---------------------------------------------------------------
// Human Health / Occupational Parameters
// Parametros de Saude Humana / Ocupacional
// ---------------------------------------------------------------

/**
 * Human health and occupational exposure parameters for the SAO taxonomy.
 * Parametros de saude humana e exposicao ocupacional para a taxonomia SAO.
 *
 * Each entry follows the SAO parameter schema:
 *   id, name (PT), names (EN/ES), defaultUnitId, type, category (legacy),
 *   allowedCustomFields, and sao metadata (matrix, tier, subcategory,
 *   regulatoryRefs, scenarios).
 */

/**
 * SAO parameter shape shared across all matrix param files.
 * Local interface to keep this file a self-contained leaf
 * (TS-MIGRATION-001: no cross-leaf re-exports).
 */
export interface SaoParameter {
    readonly id: string;
    readonly name: string;
    readonly names: { readonly en: string; readonly es: string };
    readonly defaultUnitId: string;
    readonly type: string;
    readonly category: string;
    readonly allowedCustomFields: readonly string[];
    readonly sao: {
        readonly matrix: string;
        readonly tier: 'essential' | 'recommended' | 'specialized';
        readonly subcategory: string;
        readonly regulatoryRefs: readonly string[];
        readonly scenarios: readonly string[];
    };
}

export const HUMANA_PARAMETERS: readonly SaoParameter[] = [
    // =============================================================
    //  1. CHEMICAL EXPOSURE — Exposicao Quimica
    //  Limites de exposicao ocupacional a agentes quimicos.
    // =============================================================

    {
        id: 'twa_8h',
        name: 'Concentracao Media Ponderada (TWA-8h)',
        names: { en: 'Time-Weighted Average Concentration (TWA-8h)', es: 'Concentracion Media Ponderada (TWA-8h)' },
        defaultUnitId: 'mg_m3',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'essential',
            subcategory: 'chemical_exposure',
            regulatoryRefs: ['NR-15', 'ACGIH TLV-TWA'],
            scenarios: ['chemical_accident', 'mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'stel',
        name: 'Limite de Exposicao de Curta Duracao (STEL)',
        names: { en: 'Short-Term Exposure Limit (STEL)', es: 'Limite de Exposicion de Corta Duracion (STEL)' },
        defaultUnitId: 'mg_m3',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'recommended',
            subcategory: 'chemical_exposure',
            regulatoryRefs: ['ACGIH TLV-STEL', 'NR-15'],
            scenarios: ['chemical_accident', 'mining_operations'],
        },
    },
    {
        id: 'ceiling_value',
        name: 'Valor Teto (Ceiling)',
        names: { en: 'Ceiling Value', es: 'Valor Techo (Ceiling)' },
        defaultUnitId: 'mg_m3',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'recommended',
            subcategory: 'chemical_exposure',
            regulatoryRefs: ['ACGIH TLV-C', 'NR-15 Anexo 11'],
            scenarios: ['chemical_accident'],
        },
    },

    // =============================================================
    //  2. NOISE & VIBRATION — Ruido e Vibracao
    //  Monitoramento de ruido ocupacional e vibracao mecanica.
    // =============================================================

    {
        id: 'nps_dba',
        name: 'Nivel de Pressao Sonora NPS dB(A)',
        names: { en: 'Sound Pressure Level SPL dB(A)', es: 'Nivel de Presion Sonora NPS dB(A)' },
        defaultUnitId: 'dBA',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'essential',
            subcategory: 'noise_vibration',
            regulatoryRefs: ['NR-15 Anexo 1', 'NHO-01'],
            scenarios: ['mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'leq',
        name: 'Nivel Equivalente de Ruido (Leq)',
        names: { en: 'Equivalent Noise Level (Leq)', es: 'Nivel Equivalente de Ruido (Leq)' },
        defaultUnitId: 'dBA',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'essential',
            subcategory: 'noise_vibration',
            regulatoryRefs: ['NHO-01', 'ISO 9612'],
            scenarios: ['mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'noise_dose',
        name: 'Dose de Ruido',
        names: { en: 'Noise Dose', es: 'Dosis de Ruido' },
        defaultUnitId: 'dose_pct',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'essential',
            subcategory: 'noise_vibration',
            regulatoryRefs: ['NR-15 Anexo 1', 'NHO-01'],
            scenarios: ['mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'lex_8h',
        name: 'Nivel de Exposicao Normalizado (Lex,8h)',
        names: { en: 'Normalized Exposure Level (Lex,8h)', es: 'Nivel de Exposicion Normalizado (Lex,8h)' },
        defaultUnitId: 'dBA',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'recommended',
            subcategory: 'noise_vibration',
            regulatoryRefs: ['NHO-01', 'ISO 9612'],
            scenarios: ['mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'hand_arm_vibration',
        name: 'Vibracao Mao-Braco (ahv)',
        names: { en: 'Hand-Arm Vibration (ahv)', es: 'Vibracion Mano-Brazo (ahv)' },
        defaultUnitId: 'mm_s2',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'recommended',
            subcategory: 'noise_vibration',
            regulatoryRefs: ['NHO-10', 'ISO 5349-1'],
            scenarios: ['mining_operations'],
        },
    },
    {
        id: 'whole_body_vibration',
        name: 'Vibracao de Corpo Inteiro (aren)',
        names: { en: 'Whole-Body Vibration (aren)', es: 'Vibracion de Cuerpo Entero (aren)' },
        defaultUnitId: 'mm_s2',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'recommended',
            subcategory: 'noise_vibration',
            regulatoryRefs: ['NHO-09', 'ISO 2631-1'],
            scenarios: ['mining_operations'],
        },
    },

    // =============================================================
    //  3. HEAT & RADIATION — Calor e Radiacao
    //  Estresse termico e exposicao a radiacao ionizante.
    // =============================================================

    {
        id: 'ibutg_wbgt',
        name: 'Indice IBUTG / WBGT',
        names: { en: 'WBGT Index', es: 'Indice WBGT / IBUTG' },
        defaultUnitId: 'celsius',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'essential',
            subcategory: 'heat_radiation',
            regulatoryRefs: ['NR-15 Anexo 3', 'ISO 7243'],
            scenarios: ['mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'metabolic_rate',
        name: 'Taxa Metabolica',
        names: { en: 'Metabolic Rate', es: 'Tasa Metabolica' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'recommended',
            subcategory: 'heat_radiation',
            regulatoryRefs: ['NR-15 Anexo 3', 'ISO 8996'],
            scenarios: ['mining_operations'],
        },
    },
    {
        id: 'radiation_dose_msv',
        name: 'Dose de Radiacao Efetiva',
        names: { en: 'Effective Radiation Dose', es: 'Dosis de Radiacion Efectiva' },
        defaultUnitId: 'mSv',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'recommended',
            subcategory: 'heat_radiation',
            regulatoryRefs: ['CNEN NN-3.01', 'ICRP 103'],
            scenarios: ['nuclear_radiological'],
        },
    },
    {
        id: 'radon_activity',
        name: 'Atividade de Radonio (Rn-222)',
        names: { en: 'Radon Activity (Rn-222)', es: 'Actividad de Radon (Rn-222)' },
        defaultUnitId: 'Bq_m3',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'recommended',
            subcategory: 'heat_radiation',
            regulatoryRefs: ['WHO Radon Handbook', 'CNEN NN-3.01'],
            scenarios: ['nuclear_radiological', 'mining_operations'],
        },
    },

    // =============================================================
    //  4. BIOMONITORING — Biomonitoramento
    //  Indicadores biologicos de exposicao (IBE) em sangue e urina.
    // =============================================================

    {
        id: 'pbb_lead_blood',
        name: 'Chumbo no Sangue (PbB)',
        names: { en: 'Blood Lead (PbB)', es: 'Plomo en Sangre (PbB)' },
        defaultUnitId: 'ug_dL',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'essential',
            subcategory: 'biomonitoring',
            regulatoryRefs: ['NR-7 Quadro 1', 'ACGIH BEI'],
            scenarios: ['mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'cdu_cadmium_urine',
        name: 'Cadmio na Urina (CdU)',
        names: { en: 'Urinary Cadmium (CdU)', es: 'Cadmio en Orina (CdU)' },
        defaultUnitId: 'ug_g_crea',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'essential',
            subcategory: 'biomonitoring',
            regulatoryRefs: ['NR-7 Quadro 1', 'ACGIH BEI'],
            scenarios: ['mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'hg_blood',
        name: 'Mercurio no Sangue (Hg-S)',
        names: { en: 'Blood Mercury (Hg-S)', es: 'Mercurio en Sangre (Hg-S)' },
        defaultUnitId: 'ug_dL',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'essential',
            subcategory: 'biomonitoring',
            regulatoryRefs: ['NR-7 Quadro 1', 'ACGIH BEI'],
            scenarios: ['mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'hg_urine',
        name: 'Mercurio na Urina (Hg-U)',
        names: { en: 'Urinary Mercury (Hg-U)', es: 'Mercurio en Orina (Hg-U)' },
        defaultUnitId: 'ug_g_crea',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'essential',
            subcategory: 'biomonitoring',
            regulatoryRefs: ['NR-7 Quadro 1', 'ACGIH BEI'],
            scenarios: ['mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'spma_benzene',
        name: 'Acido S-fenilmercapturico (SPMA — Benzeno)',
        names: { en: 'S-Phenylmercapturic Acid (SPMA — Benzene)', es: 'Acido S-fenilmercapturico (SPMA — Benceno)' },
        defaultUnitId: 'ug_g_crea',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'essential',
            subcategory: 'biomonitoring',
            regulatoryRefs: ['NR-7 Quadro 1', 'ACGIH BEI'],
            scenarios: ['chemical_accident', 'routine_monitoring'],
        },
    },
    {
        id: 'cholinesterase',
        name: 'Colinesterase Plasmatica',
        names: { en: 'Plasma Cholinesterase', es: 'Colinesterasa Plasmatica' },
        defaultUnitId: 'percent',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'essential',
            subcategory: 'biomonitoring',
            regulatoryRefs: ['NR-7 Quadro 1'],
            scenarios: ['chemical_accident', 'routine_monitoring'],
        },
    },
    {
        id: 'cohb_percent',
        name: 'Carboxihemoglobina (COHb%)',
        names: { en: 'Carboxyhemoglobin (COHb%)', es: 'Carboxihemoglobina (COHb%)' },
        defaultUnitId: 'percent',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'essential',
            subcategory: 'biomonitoring',
            regulatoryRefs: ['NR-7 Quadro 1', 'ACGIH BEI'],
            scenarios: ['chemical_accident', 'routine_monitoring'],
        },
    },
    {
        id: 'as_urine',
        name: 'Arsenio na Urina (As-U)',
        names: { en: 'Urinary Arsenic (As-U)', es: 'Arsenico en Orina (As-U)' },
        defaultUnitId: 'ug_g_crea',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'recommended',
            subcategory: 'biomonitoring',
            regulatoryRefs: ['NR-7 Quadro 1', 'ACGIH BEI'],
            scenarios: ['mining_operations'],
        },
    },
    {
        id: 'cr_urine',
        name: 'Cromo na Urina (Cr-U)',
        names: { en: 'Urinary Chromium (Cr-U)', es: 'Cromo en Orina (Cr-U)' },
        defaultUnitId: 'ug_g_crea',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'recommended',
            subcategory: 'biomonitoring',
            regulatoryRefs: ['NR-7 Quadro 1', 'ACGIH BEI'],
            scenarios: ['mining_operations'],
        },
    },

    // =============================================================
    //  5. MEDICAL SURVEILLANCE — Vigilancia Medica
    //  Exames ocupacionais periodicos e taxas de acidentalidade.
    // =============================================================

    {
        id: 'spirometry_fvc',
        name: 'Espirometria — Capacidade Vital Forcada (CVF)',
        names: { en: 'Spirometry — Forced Vital Capacity (FVC)', es: 'Espirometria — Capacidad Vital Forzada (CVF)' },
        defaultUnitId: 'percent',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'essential',
            subcategory: 'medical_surveillance',
            regulatoryRefs: ['NR-7', 'ATS/ERS 2019'],
            scenarios: ['mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'spirometry_fev1',
        name: 'Espirometria — Volume Expiratorio Forcado (VEF1)',
        names: {
            en: 'Spirometry — Forced Expiratory Volume (FEV1)',
            es: 'Espirometria — Volumen Espiratorio Forzado (VEF1)',
        },
        defaultUnitId: 'percent',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'essential',
            subcategory: 'medical_surveillance',
            regulatoryRefs: ['NR-7', 'ATS/ERS 2019'],
            scenarios: ['mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'spirometry_ratio',
        name: 'Espirometria — Relacao VEF1/CVF',
        names: { en: 'Spirometry — FEV1/FVC Ratio', es: 'Espirometria — Relacion VEF1/CVF' },
        defaultUnitId: 'percent',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'recommended',
            subcategory: 'medical_surveillance',
            regulatoryRefs: ['NR-7', 'ATS/ERS 2019'],
            scenarios: ['mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'audiometry',
        name: 'Audiometria Tonal Liminar',
        names: { en: 'Pure Tone Threshold Audiometry', es: 'Audiometria Tonal Liminar' },
        defaultUnitId: 'dBA',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'essential',
            subcategory: 'medical_surveillance',
            regulatoryRefs: ['NR-7', 'Portaria 19/1998'],
            scenarios: ['mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'accident_rate_tf',
        name: 'Taxa de Frequencia de Acidentes (TF)',
        names: { en: 'Accident Frequency Rate (TF)', es: 'Tasa de Frecuencia de Accidentes (TF)' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'essential',
            subcategory: 'medical_surveillance',
            regulatoryRefs: ['NBR 14280', 'NR-4'],
            scenarios: ['mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'accident_rate_tg',
        name: 'Taxa de Gravidade de Acidentes (TG)',
        names: { en: 'Accident Severity Rate (TG)', es: 'Tasa de Gravedad de Accidentes (TG)' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'essential',
            subcategory: 'medical_surveillance',
            regulatoryRefs: ['NBR 14280', 'NR-4'],
            scenarios: ['mining_operations', 'routine_monitoring'],
        },
    },

    // =============================================================
    //  6. ERGONOMICS — Ergonomia
    //  Avaliacao de riscos ergonomicos e biomecânicos.
    // =============================================================

    {
        id: 'rula_score',
        name: 'Pontuacao RULA (Rapid Upper Limb Assessment)',
        names: { en: 'RULA Score (Rapid Upper Limb Assessment)', es: 'Puntuacion RULA (Rapid Upper Limb Assessment)' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'recommended',
            subcategory: 'ergonomics',
            regulatoryRefs: ['NR-17', 'McAtamney & Corlett 1993'],
            scenarios: ['routine_monitoring'],
        },
    },
    {
        id: 'reba_score',
        name: 'Pontuacao REBA (Rapid Entire Body Assessment)',
        names: {
            en: 'REBA Score (Rapid Entire Body Assessment)',
            es: 'Puntuacion REBA (Rapid Entire Body Assessment)',
        },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'recommended',
            subcategory: 'ergonomics',
            regulatoryRefs: ['NR-17', 'Hignett & McAtamney 2000'],
            scenarios: ['routine_monitoring'],
        },
    },

    // =============================================================
    //  7. EPIDEMIOLOGY — Epidemiologia
    //  Indicadores epidemiologicos ocupacionais e ambientais.
    // =============================================================

    {
        id: 'incidence_rate',
        name: 'Taxa de Incidencia',
        names: { en: 'Incidence Rate', es: 'Tasa de Incidencia' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'recommended',
            subcategory: 'epidemiology',
            regulatoryRefs: ['MS/SVS', 'OMS/WHO'],
            scenarios: ['chemical_accident', 'nuclear_radiological', 'routine_monitoring'],
        },
    },
    {
        id: 'prevalence_rate',
        name: 'Taxa de Prevalencia',
        names: { en: 'Prevalence Rate', es: 'Tasa de Prevalencia' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'recommended',
            subcategory: 'epidemiology',
            regulatoryRefs: ['MS/SVS', 'OMS/WHO'],
            scenarios: ['chemical_accident', 'nuclear_radiological', 'routine_monitoring'],
        },
    },
    {
        id: 'smr',
        name: 'Razao de Mortalidade Padronizada (SMR)',
        names: { en: 'Standardized Mortality Ratio (SMR)', es: 'Razon de Mortalidad Estandarizada (SMR)' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'specialized',
            subcategory: 'epidemiology',
            regulatoryRefs: ['OMS/WHO', 'IARC'],
            scenarios: ['nuclear_radiological'],
        },
    },

    // =============================================================
    //  8. GENOTOXICITY — Genotoxicidade
    //  Biomarcadores de dano genetico por exposicao ambiental.
    // =============================================================

    {
        id: 'comet_assay',
        name: 'Ensaio Cometa (Dano ao DNA)',
        names: { en: 'Comet Assay (DNA Damage)', es: 'Ensayo Cometa (Dano al ADN)' },
        defaultUnitId: 'percent',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'specialized',
            subcategory: 'genotoxicity',
            regulatoryRefs: ['OECD TG 489'],
            scenarios: ['chemical_accident', 'nuclear_radiological'],
        },
    },
    {
        id: 'micronucleus',
        name: 'Teste de Micronucleos',
        names: { en: 'Micronucleus Test', es: 'Prueba de Micronucleos' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'specialized',
            subcategory: 'genotoxicity',
            regulatoryRefs: ['OECD TG 487'],
            scenarios: ['chemical_accident', 'nuclear_radiological'],
        },
    },
    {
        id: 'chromosomal_aberrations',
        name: 'Aberracoes Cromossomicas',
        names: { en: 'Chromosomal Aberrations', es: 'Aberraciones Cromosomicas' },
        defaultUnitId: 'percent',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'specialized',
            subcategory: 'genotoxicity',
            regulatoryRefs: ['OECD TG 473'],
            scenarios: ['nuclear_radiological'],
        },
    },
    {
        id: 'oh_dg_8',
        name: '8-Hidroxi-2-desoxiguanosina (8-OHdG)',
        names: { en: '8-Hydroxy-2-deoxyguanosine (8-OHdG)', es: '8-Hidroxi-2-desoxiguanosina (8-OHdG)' },
        defaultUnitId: 'ug_g_crea',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'specialized',
            subcategory: 'genotoxicity',
            regulatoryRefs: ['IARC Biomarkers'],
            scenarios: ['chemical_accident', 'nuclear_radiological'],
        },
    },

    // =============================================================
    //  9. ENDOCRINE — Disruptores Endocrinos
    //  Marcadores hormonais para avaliacao de exposicao a
    //  desreguladores endocrinos ambientais.
    // =============================================================

    {
        id: 'tsh',
        name: 'Hormonio Tireoestimulante (TSH)',
        names: { en: 'Thyroid-Stimulating Hormone (TSH)', es: 'Hormona Estimulante de la Tiroides (TSH)' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'specialized',
            subcategory: 'endocrine',
            regulatoryRefs: ['WHO/UNEP EDC', 'NR-7'],
            scenarios: ['chemical_accident', 'nuclear_radiological'],
        },
    },
    {
        id: 'cortisol',
        name: 'Cortisol Serico',
        names: { en: 'Serum Cortisol', es: 'Cortisol Serico' },
        defaultUnitId: 'ug_dL',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'specialized',
            subcategory: 'endocrine',
            regulatoryRefs: ['WHO/UNEP EDC'],
            scenarios: ['chemical_accident'],
        },
    },

    // =============================================================
    //  10. OMICS — Multi-Omica Ambiental
    //  Tecnologias avancadas de biologia molecular para
    //  avaliacao de efeitos ambientais na saude humana.
    // =============================================================

    {
        id: 'gwas_score',
        name: 'Estudo de Associacao Genomica (GWAS)',
        names: { en: 'Genome-Wide Association Study (GWAS)', es: 'Estudio de Asociacion Genomica (GWAS)' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'specialized',
            subcategory: 'omics',
            regulatoryRefs: ['NHGRI/EBI GWAS Catalog'],
            scenarios: ['nuclear_radiological'],
        },
    },
    {
        id: 'transcriptomics_rnaseq',
        name: 'Transcriptomica (RNA-seq)',
        names: { en: 'Transcriptomics (RNA-seq)', es: 'Transcriptomica (RNA-seq)' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'specialized',
            subcategory: 'omics',
            regulatoryRefs: ['ENCODE Project'],
            scenarios: ['chemical_accident', 'nuclear_radiological'],
        },
    },
    {
        id: 'metabolomics',
        name: 'Metabolomica (Perfil Metabolico)',
        names: { en: 'Metabolomics (Metabolic Profile)', es: 'Metabolomica (Perfil Metabolico)' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'safety',
        allowedCustomFields: [],
        sao: {
            matrix: 'humana',
            tier: 'specialized',
            subcategory: 'omics',
            regulatoryRefs: ['Human Metabolome Database'],
            scenarios: ['chemical_accident'],
        },
    },
];
