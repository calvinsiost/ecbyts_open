// AGPL-3.0-only - ecbyts/ECBT

export interface GACIndustrialGenerationOptions {
    campaigns: number;
    wells: number;
    plumes: number;
    buildings: number;
    siteSize: string;
    contaminationLevel: string;
    includeCosts: boolean;
}

export interface GACIndustrialThresholds {
    reference: string;
    matrix: string;
}

export interface GACIndustrialDefaultOrigin {
    system: string;
    zone: number;
    hemisphere: string;
    easting: number;
    northing: number;
    elevation: number;
}

export interface GACIndustrialReportSkeletonItem {
    title: string;
    type: string;
}

export interface GACIndustrialPreset {
    readonly id: string;
    readonly nameKey: string;
    readonly descriptionKey: string;
    readonly icon: string;
    readonly category: string;
    readonly families: readonly string[];
    readonly generationOptions: GACIndustrialGenerationOptions;
    readonly parameters: readonly string[];
    readonly thresholds: GACIndustrialThresholds;
    readonly defaultOrigin: GACIndustrialDefaultOrigin;
    readonly reportSkeleton: readonly GACIndustrialReportSkeletonItem[];
    readonly tags: readonly string[];
}

/** Preset: GAC — Planta Industrial (Solventes Clorados) */
export const GAC_INDUSTRIAL = {
    id: 'gac_industrial',
    nameKey: 'preset.gac_industrial',
    descriptionKey: 'preset.gac_industrial_desc',
    icon: '&#9650;',
    category: 'gac',

    families: ['well', 'plume', 'boundary', 'building', 'remediation', 'waste'],

    generationOptions: {
        campaigns: 12,
        wells: 20,
        plumes: 3,
        buildings: 4,
        siteSize: 'medium',
        contaminationLevel: 'high',
        includeCosts: true,
    },

    parameters: [
        'tce',
        'pce',
        'dce_11',
        'dce_12',
        'vinyl_chloride',
        'benzene',
        'toluene',
        'xylenes',
        'pH',
        'conductivity',
        'redox',
        'dissolved_oxygen',
        'chromium',
        'lead',
        'cadmium',
        'nickel',
    ],

    thresholds: {
        reference: 'CONAMA 420/2009 + CETESB DD-256/2016',
        matrix: 'groundwater',
    },

    defaultOrigin: {
        system: 'UTM',
        zone: 23,
        hemisphere: 'S',
        easting: 340000,
        northing: 7400000,
        elevation: 720,
    },

    reportSkeleton: [
        { title: 'Introducao', type: 'text' },
        { title: 'Historico Industrial', type: 'text' },
        { title: 'Modelo Conceitual', type: 'text+image' },
        { title: 'Investigacao Detalhada', type: 'text' },
        { title: 'Resultados Analiticos', type: 'table' },
        { title: 'Mapa Potenciometrico', type: 'image' },
        { title: 'Delineacao de Pluma DNAPL', type: 'image' },
        { title: 'Cross-Section Hidrogeologica', type: 'image' },
        { title: 'Analise de Risco ACBR', type: 'text+table' },
        { title: 'Plano de Intervencao', type: 'text' },
        { title: 'Conclusoes', type: 'text' },
    ],

    tags: ['gac', 'industria', 'solventes', 'clorados', 'dnapl', 'conama420'],
} as const satisfies GACIndustrialPreset;