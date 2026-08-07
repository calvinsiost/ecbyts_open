// AGPL-3.0-only - ecbyts/ECBT

export interface GACGasStationGenerationOptions {
    campaigns: number;
    wells: number;
    plumes: number;
    buildings: number;
    siteSize: 'small' | 'medium' | 'large';
    contaminationLevel: 'low' | 'medium' | 'high';
    includeCosts: boolean;
}

export interface GACGasStationThresholds {
    reference: string;
    matrix: string;
}

export interface GACGasStationDefaultOrigin {
    system: string;
    zone: number;
    hemisphere: 'N' | 'S';
    easting: number;
    northing: number;
    elevation: number;
}

export interface GACGasStationReportSkeletonItem {
    title: string;
    type: 'text' | 'text+image' | 'table' | 'image' | 'text+table';
}

export interface GACGasStation {
    readonly id: 'gac_gas_station';
    readonly nameKey: 'preset.gac_gas_station';
    readonly descriptionKey: 'preset.gac_gas_station_desc';
    readonly icon: string;
    readonly category: 'gac';
    readonly families: readonly ['well', 'plume', 'boundary', 'tank', 'remediation', 'building'];
    readonly generationOptions: GACGasStationGenerationOptions;
    readonly parameters: readonly [
        'benzene',
        'toluene',
        'ethylbenzene',
        'xylenes',
        'naphthalene',
        'tph',
        'mtbe',
        'pH',
        'conductivity',
        'redox',
        'lead',
        'iron',
        'manganese'
    ];
    readonly thresholds: GACGasStationThresholds;
    readonly defaultOrigin: GACGasStationDefaultOrigin;
    readonly reportSkeleton: readonly GACGasStationReportSkeletonItem[];
    readonly tags: readonly ['gac', 'posto', 'btex', 'conama420', 'cetesb'];
}

export const GAC_GAS_STATION = {
    id: 'gac_gas_station',
    nameKey: 'preset.gac_gas_station',
    descriptionKey: 'preset.gac_gas_station_desc',
    icon: '&#9679;',
    category: 'gac',

    families: ['well', 'plume', 'boundary', 'tank', 'remediation', 'building'],

    generationOptions: {
        campaigns: 8,
        wells: 12,
        plumes: 2,
        buildings: 2,
        siteSize: 'small',
        contaminationLevel: 'medium',
        includeCosts: true,
    },

    parameters: [
        'benzene',
        'toluene',
        'ethylbenzene',
        'xylenes',
        'naphthalene',
        'tph',
        'mtbe',
        'pH',
        'conductivity',
        'redox',
        'lead',
        'iron',
        'manganese',
    ],

    thresholds: {
        reference: 'CONAMA 420/2009 + CETESB DD-256/2016',
        matrix: 'groundwater',
    },

    defaultOrigin: {
        system: 'UTM',
        zone: 23,
        hemisphere: 'S',
        easting: 333500,
        northing: 7394200,
        elevation: 750,
    },

    reportSkeleton: [
        { title: 'Introducao', type: 'text' },
        { title: 'Historico da Area', type: 'text' },
        { title: 'Modelo Conceitual', type: 'text+image' },
        { title: 'Metodologia', type: 'text' },
        { title: 'Resultados Analiticos', type: 'table' },
        { title: 'Mapa Potenciometrico', type: 'image' },
        { title: 'Mapa de Isoconcentracoes', type: 'image' },
        { title: 'Secao Geologica', type: 'image' },
        { title: 'Avaliacao de Risco', type: 'text+table' },
        { title: 'Conclusoes e Recomendacoes', type: 'text' },
    ],

    tags: ['gac', 'posto', 'btex', 'conama420', 'cetesb'],
} as const satisfies GACGasStation;