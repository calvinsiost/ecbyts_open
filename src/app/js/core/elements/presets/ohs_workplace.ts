// @ts-check
// AGPL-3.0-only - ecbyts/ECBT

/** Preset: PGR/PCMSO — Saude e Seguranca Ocupacional */
import { t } from '../../../utils/i18n/translations.js';
export const OHS_WORKPLACE = {
    id: 'ohs_workplace',
    nameKey: 'preset.ohs_workplace',
    descriptionKey: 'preset.ohs_workplace_desc',
    icon: '&#9651;',
    category: 'safety',

    families: ['boundary', 'building'],

    generationOptions: {
        campaigns: 4,
        wells: 0,
        plumes: 0,
        buildings: 6,
        siteSize: 'medium',
        contaminationLevel: 'low',
        includeCosts: false,
    },

    parameters: [
        'noise_dba',
        'heat_ibutg',
        'vibration',
        'benzene_ppm',
        'toluene_ppm',
        'dust_mg_m3',
        'illuminance_lux',
        'ionizing_radiation',
    ],

    thresholds: {
        reference: 'NR-1 (PGR), NR-7 (PCMSO), NR-9, NR-15 (Atividades Insalubres)',
        matrix: 'workplace',
    },

    defaultOrigin: {
        system: 'UTM',
        zone: 23,
        hemisphere: 'S',
        easting: 345000,
        northing: 7396000,
        elevation: 760,
    },

    reportSkeleton: [
        { title: 'Identificacao da Empresa', type: 'text' },
        { title: 'Descricao dos Processos', type: 'text' },
        { title: 'Inventario de Perigos', type: 'table' },
        { title: t('ohs.riskAssessment'), type: 'text+table' },
        { title: 'Mapa de Ruido', type: 'image' },
        { title: 'Mapa de Agentes Quimicos', type: 'image' },
        { title: 'Plano de Acao', type: 'table' },
        { title: t('ohs.biologicalMonitoring'), type: 'table' },
        { title: 'Cronograma', type: 'table' },
    ],

    tags: ['pgr', 'pcmso', 'ltcat', 'nr15', 'saude_ocupacional', 'seguranca'],
};
