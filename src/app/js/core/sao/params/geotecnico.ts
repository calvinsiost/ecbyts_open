// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// app/js/core/sao/params/geotecnico.ts
// SAO PARAMS - Geotechnical Matrix
// Parametros SAO - Matriz Geotecnica
//
// Variaveis geotecnicas, piezometricas, inclinometricas, geodesicas e
// sismicas para avaliacao ambiental transversal.
/**
 * Regulatory reference: either a free-form string (e.g. "ABNT NBR 6484")
 * or a structured tuple { agency, standard } used in some SAO datasets.
 */
export type SaoRegulatoryRef = string | { readonly agency: string; readonly standard: string };

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
        readonly regulatoryRefs: readonly SaoRegulatoryRef[];
        readonly scenarios: readonly string[];
    };
}

/**
 * Geotechnical matrix parameters for the SAO taxonomy.
 * ~25 parameters covering piezometry, soil resistance, inclinometry,
 * tailings characterization, geodetic topography, and seismicity.
 */
export const GEOTECNICO_PARAMETERS: readonly SaoParameter[] = [
    // ================================================================
    // PIEZOMETRY — Piezometria
    // Monitoramento de pressao de poros e nivel d'agua em piezometros
    // ================================================================
    {
        id: 'pore_pressure_u',
        name: 'Pressao de Poros (u)',
        names: { en: 'Pore Pressure (u)', es: 'Presion de Poros (u)' },
        defaultUnitId: 'kPa',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['sensor_depth', 'piezometer_type', 'reading_method'],
        sao: {
            matrix: 'geotecnico',
            tier: 'essential',
            subcategory: 'piezometry',
            regulatoryRefs: ['ABNT NBR 6484', 'ICOLD Bulletin 153'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    {
        id: 'piezometric_level',
        name: 'Nivel Piezometrico',
        names: { en: 'Piezometric Level', es: 'Nivel Piezometrico' },
        defaultUnitId: 'm',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['reference_elevation', 'sensor_depth', 'reading_method'],
        sao: {
            matrix: 'geotecnico',
            tier: 'essential',
            subcategory: 'piezometry',
            regulatoryRefs: ['ABNT NBR 6484', 'ANM Portaria 70.389/2017'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    {
        id: 'pore_pressure_ratio_ru',
        name: 'Razao de Pressao de Poros (ru)',
        names: { en: 'Pore Pressure Ratio (ru)', es: 'Relacion de Presion de Poros (ru)' },
        defaultUnitId: 'decimal',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['sensor_depth', 'effective_overburden'],
        sao: {
            matrix: 'geotecnico',
            tier: 'essential',
            subcategory: 'piezometry',
            regulatoryRefs: ['ICOLD Bulletin 153'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    {
        id: 'effective_stress',
        name: 'Tensao Efetiva',
        names: { en: 'Effective Stress', es: 'Tension Efectiva' },
        defaultUnitId: 'kPa',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['depth', 'total_stress', 'pore_pressure'],
        sao: {
            matrix: 'geotecnico',
            tier: 'recommended',
            subcategory: 'piezometry',
            regulatoryRefs: ['ABNT NBR 6484'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    {
        id: 'hydraulic_gradient',
        name: 'Gradiente Hidraulico',
        names: { en: 'Hydraulic Gradient', es: 'Gradiente Hidraulico' },
        defaultUnitId: 'decimal',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['piezometer_pair', 'distance'],
        sao: {
            matrix: 'geotecnico',
            tier: 'recommended',
            subcategory: 'piezometry',
            regulatoryRefs: ['ABNT NBR 6484', 'ANM Portaria 70.389/2017'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    {
        id: 'saturated_hydraulic_conductivity',
        name: 'Condutividade Hidraulica Saturada (Ksat)',
        names: { en: 'Saturated Hydraulic Conductivity (Ksat)', es: 'Conductividad Hidraulica Saturada (Ksat)' },
        defaultUnitId: 'cm_s',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['test_method', 'depth', 'temperature'],
        sao: {
            matrix: 'geotecnico',
            tier: 'recommended',
            subcategory: 'piezometry',
            regulatoryRefs: ['ABNT NBR 14545', 'ASTM D5084'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    {
        id: 'consolidation_coefficient_cv',
        name: 'Coeficiente de Adensamento (cv)',
        names: { en: 'Coefficient of Consolidation (cv)', es: 'Coeficiente de Consolidacion (cv)' },
        defaultUnitId: 'm2_s',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['stress_range', 'test_method'],
        sao: {
            matrix: 'geotecnico',
            tier: 'recommended',
            subcategory: 'piezometry',
            regulatoryRefs: ['ABNT NBR 12007', 'ASTM D2435'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    // ================================================================
    // RESISTANCE — Resistencia
    // Ensaios de campo e laboratorio para parametros de resistencia
    // ================================================================
    {
        id: 'spt_n',
        name: 'SPT N (Indice de Resistencia a Penetracao)',
        names: {
            en: 'SPT N (Standard Penetration Resistance Index)',
            es: 'SPT N (Indice de Resistencia a la Penetracion)',
        },
        defaultUnitId: 'blows_30cm',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['depth', 'energy_ratio', 'hammer_type'],
        sao: {
            matrix: 'geotecnico',
            tier: 'essential',
            subcategory: 'resistance',
            regulatoryRefs: ['ABNT NBR 6484', 'ASTM D1586'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    {
        id: 'effective_cohesion',
        name: "Coesao Efetiva (c')",
        names: { en: "Effective Cohesion (c')", es: "Cohesion Efectiva (c')" },
        defaultUnitId: 'kPa',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['test_type', 'confining_pressure', 'sample_depth'],
        sao: {
            matrix: 'geotecnico',
            tier: 'essential',
            subcategory: 'resistance',
            regulatoryRefs: ['ABNT NBR 12770', 'ASTM D7181'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    {
        id: 'friction_angle',
        name: "Angulo de Atrito Efetivo (phi')",
        names: { en: "Effective Friction Angle (phi')", es: "Angulo de Friccion Efectivo (phi')" },
        defaultUnitId: 'degrees',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['test_type', 'confining_pressure', 'sample_depth'],
        sao: {
            matrix: 'geotecnico',
            tier: 'essential',
            subcategory: 'resistance',
            regulatoryRefs: ['ABNT NBR 12770', 'ASTM D7181'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    {
        id: 'undrained_shear_strength',
        name: 'Resistencia ao Cisalhamento Nao Drenada (Su)',
        names: { en: 'Undrained Shear Strength (Su)', es: 'Resistencia al Corte No Drenada (Su)' },
        defaultUnitId: 'kPa',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['test_type', 'sample_depth', 'strain_rate'],
        sao: {
            matrix: 'geotecnico',
            tier: 'essential',
            subcategory: 'resistance',
            regulatoryRefs: ['ABNT NBR 12770', 'ASTM D2850'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    {
        id: 'cpt_qc',
        name: 'CPT Resistencia de Ponta (qc)',
        names: { en: 'CPT Tip Resistance (qc)', es: 'CPT Resistencia de Punta (qc)' },
        defaultUnitId: 'MPa',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['depth', 'cone_area', 'penetration_rate'],
        sao: {
            matrix: 'geotecnico',
            tier: 'recommended',
            subcategory: 'resistance',
            regulatoryRefs: ['ABNT NBR 12069', 'ASTM D5778'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    {
        id: 'cpt_fs',
        name: 'CPT Atrito Lateral (fs)',
        names: { en: 'CPT Sleeve Friction (fs)', es: 'CPT Friccion Lateral (fs)' },
        defaultUnitId: 'kPa',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['depth', 'sleeve_area', 'penetration_rate'],
        sao: {
            matrix: 'geotecnico',
            tier: 'recommended',
            subcategory: 'resistance',
            regulatoryRefs: ['ABNT NBR 12069', 'ASTM D5778'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    {
        id: 'cpt_u2',
        name: 'CPT Poropressao (u2)',
        names: { en: 'CPT Pore Pressure (u2)', es: 'CPT Presion de Poros (u2)' },
        defaultUnitId: 'kPa',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['depth', 'filter_position'],
        sao: {
            matrix: 'geotecnico',
            tier: 'recommended',
            subcategory: 'resistance',
            regulatoryRefs: ['ABNT NBR 12069', 'ASTM D5778'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    {
        id: 'vane_shear_strength',
        name: 'Resistencia Palheta (Vane Test)',
        names: { en: 'Vane Shear Strength', es: 'Resistencia al Corte con Veleta' },
        defaultUnitId: 'kPa',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['depth', 'vane_size', 'remolded_value'],
        sao: {
            matrix: 'geotecnico',
            tier: 'recommended',
            subcategory: 'resistance',
            regulatoryRefs: ['ABNT NBR 10905', 'ASTM D2573'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    {
        id: 'overconsolidation_ratio',
        name: 'Razao de Sobreadensamento (OCR)',
        names: { en: 'Overconsolidation Ratio (OCR)', es: 'Relacion de Sobreconsolidacion (OCR)' },
        defaultUnitId: 'decimal',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['preconsolidation_pressure', 'current_stress'],
        sao: {
            matrix: 'geotecnico',
            tier: 'recommended',
            subcategory: 'resistance',
            regulatoryRefs: ['ABNT NBR 12007', 'ASTM D2435'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    // ================================================================
    // INCLINOMETRY — Inclinometria
    // Monitoramento de deslocamentos laterais em taludes e aterros
    // ================================================================
    {
        id: 'cumulative_displacement',
        name: 'Deslocamento Acumulado',
        names: { en: 'Cumulative Displacement', es: 'Desplazamiento Acumulado' },
        defaultUnitId: 'mm',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['depth', 'direction', 'reference_date'],
        sao: {
            matrix: 'geotecnico',
            tier: 'essential',
            subcategory: 'inclinometry',
            regulatoryRefs: ['ANM Portaria 70.389/2017', 'ABNT NBR 11682'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    {
        id: 'displacement_rate',
        name: 'Taxa de Deslocamento',
        names: { en: 'Displacement Rate', es: 'Tasa de Desplazamiento' },
        defaultUnitId: 'mm_day_rate',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['depth', 'direction', 'alert_threshold'],
        sao: {
            matrix: 'geotecnico',
            tier: 'essential',
            subcategory: 'inclinometry',
            regulatoryRefs: ['ANM Portaria 70.389/2017', 'ABNT NBR 11682'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    {
        id: 'rupture_surface_depth',
        name: 'Profundidade da Superficie de Ruptura',
        names: { en: 'Failure Surface Depth', es: 'Profundidad de la Superficie de Rotura' },
        defaultUnitId: 'm',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['identification_method', 'shear_zone_thickness'],
        sao: {
            matrix: 'geotecnico',
            tier: 'essential',
            subcategory: 'inclinometry',
            regulatoryRefs: ['ANM Portaria 70.389/2017', 'ABNT NBR 11682'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    // ================================================================
    // TAILINGS — Rejeitos
    // Caracterizacao fisica e mecanica de rejeitos de mineracao
    // ================================================================
    {
        id: 'pulp_density',
        name: 'Densidade de Polpa',
        names: { en: 'Pulp Density', es: 'Densidad de Pulpa' },
        defaultUnitId: 'g_cm3',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['sample_point', 'temperature'],
        sao: {
            matrix: 'geotecnico',
            tier: 'essential',
            subcategory: 'tailings',
            regulatoryRefs: ['ANM Portaria 70.389/2017'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    {
        id: 'solids_content',
        name: 'Teor de Solidos',
        names: { en: 'Solids Content', es: 'Contenido de Solidos' },
        defaultUnitId: 'percent',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['sample_point', 'drying_method'],
        sao: {
            matrix: 'geotecnico',
            tier: 'essential',
            subcategory: 'tailings',
            regulatoryRefs: ['ANM Portaria 70.389/2017'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    {
        id: 'saturation_degree',
        name: 'Grau de Saturacao',
        names: { en: 'Degree of Saturation', es: 'Grado de Saturacion' },
        defaultUnitId: 'percent',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['sample_depth', 'void_ratio'],
        sao: {
            matrix: 'geotecnico',
            tier: 'essential',
            subcategory: 'tailings',
            regulatoryRefs: ['ABNT NBR 6457'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    {
        id: 'grain_size_distribution',
        name: 'Granulometria (D10-D90)',
        names: { en: 'Grain Size Distribution (D10-D90)', es: 'Granulometria (D10-D90)' },
        defaultUnitId: 'mm',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['d10', 'd30', 'd50', 'd60', 'd90', 'uniformity_coefficient'],
        sao: {
            matrix: 'geotecnico',
            tier: 'essential',
            subcategory: 'tailings',
            regulatoryRefs: ['ABNT NBR 7181', 'ASTM D6913'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    {
        id: 'liquid_limit',
        name: 'Limite de Liquidez (LL)',
        names: { en: 'Liquid Limit (LL)', es: 'Limite Liquido (LL)' },
        defaultUnitId: 'percent',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['test_method'],
        sao: {
            matrix: 'geotecnico',
            tier: 'recommended',
            subcategory: 'tailings',
            regulatoryRefs: ['ABNT NBR 6459', 'ASTM D4318'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    {
        id: 'plastic_limit',
        name: 'Limite de Plasticidade (LP)',
        names: { en: 'Plastic Limit (LP)', es: 'Limite Plastico (LP)' },
        defaultUnitId: 'percent',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['test_method'],
        sao: {
            matrix: 'geotecnico',
            tier: 'recommended',
            subcategory: 'tailings',
            regulatoryRefs: ['ABNT NBR 7180', 'ASTM D4318'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    {
        id: 'void_ratio',
        name: 'Indice de Vazios (e)',
        names: { en: 'Void Ratio (e)', es: 'Relacion de Vacios (e)' },
        defaultUnitId: 'decimal',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['sample_depth', 'stress_level'],
        sao: {
            matrix: 'geotecnico',
            tier: 'recommended',
            subcategory: 'tailings',
            regulatoryRefs: ['ABNT NBR 6457'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    {
        id: 'angle_of_repose',
        name: 'Angulo de Repouso',
        names: { en: 'Angle of Repose', es: 'Angulo de Reposo' },
        defaultUnitId: 'degrees',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['material_type', 'moisture_content'],
        sao: {
            matrix: 'geotecnico',
            tier: 'recommended',
            subcategory: 'tailings',
            regulatoryRefs: ['ABNT NBR 11682'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    {
        id: 'shear_wave_velocity',
        name: 'Velocidade de Onda Cisalhante (Vs)',
        names: { en: 'Shear Wave Velocity (Vs)', es: 'Velocidad de Onda de Corte (Vs)' },
        defaultUnitId: 'm_s',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['depth', 'test_method'],
        sao: {
            matrix: 'geotecnico',
            tier: 'recommended',
            subcategory: 'tailings',
            regulatoryRefs: ['ASTM D7400'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    {
        id: 'csr_crr_liquefaction',
        name: 'CSR/CRR Liquefacao',
        names: { en: 'CSR/CRR Liquefaction', es: 'CSR/CRR Licuefaccion' },
        defaultUnitId: 'decimal',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['depth', 'earthquake_magnitude', 'correction_factors'],
        sao: {
            matrix: 'geotecnico',
            tier: 'recommended',
            subcategory: 'tailings',
            regulatoryRefs: ['ICOLD Bulletin 155', 'Seed & Idriss 1971'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    {
        id: 'residual_strength',
        name: 'Resistencia Residual',
        names: { en: 'Residual Strength', es: 'Resistencia Residual' },
        defaultUnitId: 'kPa',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['test_type', 'strain_level', 'sample_depth'],
        sao: {
            matrix: 'geotecnico',
            tier: 'recommended',
            subcategory: 'tailings',
            regulatoryRefs: ['ABNT NBR 12770', 'ASTM D6467'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    // ================================================================
    // TOPOGRAPHY — Topografia
    // Monitoramento geodesico de deslocamentos superficiais
    // ================================================================
    {
        id: 'gnss_3d_displacement',
        name: 'Deslocamento 3D GNSS',
        names: { en: 'GNSS 3D Displacement', es: 'Desplazamiento 3D GNSS' },
        defaultUnitId: 'mm',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['direction_x', 'direction_y', 'direction_z', 'reference_epoch'],
        sao: {
            matrix: 'geotecnico',
            tier: 'essential',
            subcategory: 'topography',
            regulatoryRefs: ['ANM Portaria 70.389/2017', 'IBGE PPP'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    // ================================================================
    // SEISMICITY — Sismicidade
    // Monitoramento sismologico e vibracao induzida
    // ================================================================
    {
        id: 'peak_ground_acceleration',
        name: 'Aceleracao de Pico do Solo (PGA)',
        names: { en: 'Peak Ground Acceleration (PGA)', es: 'Aceleracion Maxima del Suelo (PGA)' },
        defaultUnitId: 'g_accel',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['station_id', 'component', 'event_distance'],
        sao: {
            matrix: 'geotecnico',
            tier: 'recommended',
            subcategory: 'seismicity',
            regulatoryRefs: ['ABNT NBR 15421', 'USGS ShakeMap'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    {
        id: 'local_magnitude',
        name: 'Magnitude Local (ML)',
        names: { en: 'Local Magnitude (ML)', es: 'Magnitud Local (ML)' },
        defaultUnitId: 'decimal',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['epicenter_lat', 'epicenter_lon', 'focal_depth'],
        sao: {
            matrix: 'geotecnico',
            tier: 'recommended',
            subcategory: 'seismicity',
            regulatoryRefs: ['SBGf', 'USGS'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    {
        id: 'insar_displacement',
        name: 'Deslocamento Diferencial InSAR',
        names: { en: 'InSAR Differential Displacement', es: 'Desplazamiento Diferencial InSAR' },
        defaultUnitId: 'mm_year_rate',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['satellite', 'look_angle', 'temporal_baseline'],
        sao: {
            matrix: 'geotecnico',
            tier: 'recommended',
            subcategory: 'seismicity',
            regulatoryRefs: ['ANM Portaria 70.389/2017'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    {
        id: 'seismicity_frequency',
        name: 'Frequencia Sismica',
        names: { en: 'Seismic Frequency', es: 'Frecuencia Sismica' },
        defaultUnitId: 'decimal',
        type: 'SI',
        category: 'hydrogeology',
        allowedCustomFields: ['magnitude_threshold', 'monitoring_period', 'area_radius_km'],
        sao: {
            matrix: 'geotecnico',
            tier: 'recommended',
            subcategory: 'seismicity',
            regulatoryRefs: ['SBGf', 'ANM Portaria 70.389/2017'],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
];
