// AGPL-3.0-only - ecbyts/ECBT

export interface RemediationGenerationOptions {
    campaigns: number;
    wells: number;
    plumes: number;
    buildings: number;
    siteSize: string;
    contaminationLevel: string;
    includeCosts: boolean;
}

export interface RemediationThresholds {
    reference: string;
    matrix: string;
}

export interface RemediationDefaultOrigin {
    system: string;
    zone: number;
    hemisphere: string;
    easting: number;
    northing: number;
    elevation: number;
}

export interface RemediationReportSkeletonItem {
    title: string;
    type: string;
}

export interface RemediationPreset {
    readonly id: string;
    readonly nameKey: string;
    readonly descriptionKey: string;
    readonly icon: string;
    readonly category: string;
    readonly families: readonly string[];
    readonly generationOptions: RemediationGenerationOptions;
    readonly parameters: readonly string[];
    readonly thresholds: RemediationThresholds;
    readonly defaultOrigin: RemediationDefaultOrigin;
    readonly reportSkeleton: readonly RemediationReportSkeletonItem[];
    readonly tags: readonly string[];
}

export const REMEDIATION = {
    id: 'remediation',
    nameKey: 'preset.remediation',
    descriptionKey: 'preset.remediation_desc',
    icon: '&#9733;',
    category: 'remediation',

    families: ['well', 'plume', 'boundary', 'remediation', 'tank', 'building'],

    generationOptions: {
        campaigns: 16,
        wells: 15,
        plumes: 2,
        buildings: 2,
        siteSize: 'medium',
        contaminationLevel: 'high',
        includeCosts: true,
    },

    parameters: [
        'benzene',
        'toluene',
        'xylenes',
        'tph',
        'tce',
        'pce',
        'vinyl_chloride',
        'pH',
        'conductivity',
        'redox',
        'dissolved_oxygen',
        'iron',
        'manganese',
        'sulfate',
    ],

    thresholds: {
        reference: 'CONAMA 420/2009 + CMA especificas do site',
        matrix: 'groundwater',
    },

    defaultOrigin: {
        system: 'UTM',
        zone: 23,
        hemisphere: 'S',
        easting: 335000,
        northing: 7395000,
        elevation: 740,
    },

    reportSkeleton: [
        { title: 'Introducao', type: 'text' },
        { title: 'Modelo Conceitual Atualizado', type: 'text+image' },
        { title: 'Tecnologia de Remediacao', type: 'text' },
        { title: 'Projeto Executivo', type: 'text+image' },
        { title: 'Monitoramento de Performance', type: 'table' },
        { title: 'Evolucao da Pluma', type: 'image' },
        { title: 'Mapa Potenciometrico', type: 'image' },
        { title: 'Indicadores de Encerramento', type: 'text+table' },
        { title: 'Cronograma e Custos', type: 'table' },
        { title: 'Conclusoes', type: 'text' },
    ],

    tags: ['remediacao', 'pump_treat', 'sve', 'isco', 'prb', 'monitoramento'],
} as const satisfies RemediationPreset;