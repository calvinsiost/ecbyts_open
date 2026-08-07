// @ts-check
// AGPL-3.0-only - ecbyts/ECBT

/** Preset: Inventario de Emissoes GEE (GHG Protocol) */
import { t } from '../../../utils/i18n/translations.js';

export const GHG_INVENTORY = {
    id: 'ghg_inventory',
    nameKey: 'preset.ghg_inventory',
    descriptionKey: 'preset.ghg_inventory_desc',
    icon: '&#9670;',
    category: 'inventory',

    families: ['boundary', 'building', 'tank'],

    generationOptions: {
        campaigns: 3,
        wells: 0,
        plumes: 0,
        buildings: 5,
        siteSize: 'large',
        contaminationLevel: 'low',
        includeCosts: false,
    },

    parameters: [
        'co2',
        'ch4',
        'n2o',
        'hfc',
        'pfc',
        'sf6',
        'fuel_diesel',
        'fuel_gasoline',
        'fuel_lpg',
        'fuel_natural_gas',
        'electricity_kwh',
    ],

    thresholds: {
        reference: 'GHG Protocol Corporate Standard + PBGHGP',
        matrix: 'atmospheric',
    },

    defaultOrigin: {
        system: 'UTM',
        zone: 23,
        hemisphere: 'S',
        easting: 350000,
        northing: 7390000,
        elevation: 800,
    },

    reportSkeleton: [
        { title: 'Sumario Executivo', type: 'text' },
        { title: 'Limites Organizacionais', type: 'text' },
        { title: 'Limites Operacionais', type: 'text' },
        { title: t('ghg.scope1'), type: 'table' },
        { title: t('ghg.scope2'), type: 'table' },
        { title: t('ghg.scope3'), type: 'table' },
        { title: 'Fatores de Emissao', type: 'table' },
        { title: 'Comparativo Ano-Base', type: 'text+table' },
        { title: 'Metas e Compromissos', type: 'text' },
    ],

    tags: ['ghg', 'gee', 'emissoes', 'carbono', 'esg', 'ghgprotocol'],
};
