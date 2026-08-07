// @ts-check
// AGPL-3.0-only - ecbyts/ECBT

/** Preset: Cadastro Ambiental Rural (CAR) */
import { t } from '../../../utils/i18n/translations.js';
export const CAR_RURAL = {
    id: 'car_rural',
    nameKey: 'preset.car_rural',
    descriptionKey: 'preset.car_rural_desc',
    icon: '&#9632;',
    category: 'inventory',

    families: ['boundary', 'river', 'lake', 'spring'],

    generationOptions: {
        campaigns: 0,
        wells: 0,
        plumes: 0,
        buildings: 1,
        siteSize: 'large',
        contaminationLevel: 'low',
        includeCosts: false,
    },

    parameters: ['vegetation_cover_pct', 'slope_degrees', 'riparian_width_m', 'soil_type', 'land_use'],

    thresholds: {
        reference: 'Lei 12.651/2012 (Codigo Florestal) + SICAR',
        matrix: 'land',
    },

    defaultOrigin: {
        system: 'UTM',
        zone: 22,
        hemisphere: 'S',
        easting: 600000,
        northing: 7500000,
        elevation: 500,
    },

    reportSkeleton: [
        { title: 'Identificacao do Imovel', type: 'text' },
        { title: 'Perimetro Georreferenciado', type: 'image' },
        { title: t('car.app'), type: 'text+image' },
        { title: t('car.rl'), type: 'text+image' },
        { title: 'Areas Consolidadas', type: 'text+image' },
        { title: 'Uso e Cobertura do Solo', type: 'image' },
        { title: 'Hidrografia', type: 'image' },
        { title: 'Memorial Descritivo', type: 'text' },
    ],

    tags: ['car', 'rural', 'app', 'reserva_legal', 'codigo_florestal', 'sicar'],
};
