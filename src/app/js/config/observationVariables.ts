// This file is part of ecbyts/ECBT. AGPL-3.0-only.
// Extracted from app/js/config.js in ARCH-MONO-001 Phase 2 (monolith split).

/** Variáveis de observação (matriz, fração, etc). */
export const OBSERVATION_VARIABLES = [
    // --- Matrix flags (boolean 0/1, adimensional) ---
    // Indica qual compartimento ambiental foi amostrado
    {
        id: 'is_matrix_water',
        name: 'Matriz: Água',
        type: 'boolean',
        defaultValue: 0,
        unitId: 'none',
        group: 'matrix',
    },
    {
        id: 'is_matrix_soil',
        name: 'Matriz: Solo',
        type: 'boolean',
        defaultValue: 0,
        unitId: 'none',
        group: 'matrix',
    },
    { id: 'is_matrix_air', name: 'Matriz: Ar', type: 'boolean', defaultValue: 0, unitId: 'none', group: 'matrix' },
    {
        id: 'is_matrix_biota',
        name: 'Matriz: Biota',
        type: 'boolean',
        defaultValue: 0,
        unitId: 'none',
        group: 'matrix',
    },
    {
        id: 'is_matrix_human',
        name: 'Matriz: Humana',
        type: 'boolean',
        defaultValue: 0,
        unitId: 'none',
        group: 'matrix',
    },
    {
        id: 'is_matrix_geotechnical',
        name: 'Matriz: Geotécnico',
        type: 'boolean',
        defaultValue: 0,
        unitId: 'none',
        group: 'matrix',
    },
    {
        id: 'is_matrix_remote_sensing',
        name: 'Matriz: Sens. Remoto',
        type: 'boolean',
        defaultValue: 0,
        unitId: 'none',
        group: 'matrix',
    },
    {
        id: 'is_matrix_climatology',
        name: 'Matriz: Climatologia',
        type: 'boolean',
        defaultValue: 0,
        unitId: 'none',
        group: 'matrix',
    },
    {
        id: 'is_matrix_resilience',
        name: 'Matriz: Resiliência',
        type: 'boolean',
        defaultValue: 0,
        unitId: 'none',
        group: 'matrix',
    },

    // --- Categorical sampling variables ---
    // Fracao da amostra: total (sem filtragem) ou dissolvida (filtrada 0.45um)
    {
        id: 'fraction',
        name: 'Fração',
        type: 'select',
        options: ['total', 'dissolved', 'suspended', 'volatile', 'extractable'],
        defaultValue: 'total',
        unitId: 'none',
        group: 'sampling',
    },
    // Tipo de coleta: pontual, composta, continua ou passiva
    {
        id: 'sample_type',
        name: 'Tipo de Amostra',
        type: 'select',
        options: ['grab', 'composite', 'continuous', 'passive'],
        defaultValue: 'grab',
        unitId: 'none',
        group: 'sampling',
    },
    // Preservacao da amostra antes da analise
    {
        id: 'preservation',
        name: 'Preservação',
        type: 'select',
        options: ['none', 'refrigerated', 'acidified', 'frozen', 'chemical'],
        defaultValue: 'none',
        unitId: 'none',
        group: 'sampling',
    },

    // --- OHS (Occupational Health & Safety) variables ---
    // Via de exposicao ocupacional: inalacao, dermica, ingestao, ruido, radiacao
    {
        id: 'exposure_route',
        name: 'Via de Exposição',
        type: 'select',
        options: ['inhalation', 'dermal', 'ingestion', 'noise', 'radiation', 'vibration'],
        defaultValue: null,
        unitId: 'none',
        group: 'ohs',
    },
    // Tipo de amostra OHS: pessoal, area, biologica, exame medico
    {
        id: 'sample_type_ohs',
        name: 'Tipo Amostra OHS',
        type: 'select',
        options: ['personal', 'area', 'biological', 'medical'],
        defaultValue: null,
        unitId: 'none',
        group: 'ohs',
    },
    // Matriz biologica para biomonitoramento
    {
        id: 'biological_matrix',
        name: 'Matriz Biológica',
        type: 'select',
        options: ['blood', 'urine', 'hair', 'saliva', 'exhaled_air'],
        defaultValue: null,
        unitId: 'none',
        group: 'ohs',
    },
    // Referencia ao GHE (Grupo Homogeneo de Exposicao) - ID do grupo
    { id: 'ghe_id', name: 'GHE', type: 'text', defaultValue: null, unitId: 'none', group: 'ohs' },
    // Referencia ao trabalhador - ID do element individual
    { id: 'worker_id', name: 'Trabalhador ID', type: 'text', defaultValue: null, unitId: 'none', group: 'ohs' },
    // Status de uso de EPI durante a medicao
    {
        id: 'ppe_status',
        name: 'Status EPI',
        type: 'select',
        options: ['none', 'partial', 'full'],
        defaultValue: null,
        unitId: 'none',
        group: 'ohs',
    },
    // Duracao da exposicao em horas
    { id: 'duration_hours', name: 'Duração (h)', type: 'text', defaultValue: null, unitId: 'h', group: 'ohs' },
    // TWA-8h calculado ou fornecido
    { id: 'twa_8h', name: 'TWA-8h', type: 'text', defaultValue: null, unitId: 'none', group: 'ohs' },
    // Valor do OEL usado como referencia
    { id: 'oel_reference', name: 'OEL Referência', type: 'text', defaultValue: null, unitId: 'none', group: 'ohs' },
    // Fonte do limite ocupacional
    {
        id: 'oel_source',
        name: 'Fonte OEL',
        type: 'select',
        options: ['ACGIH', 'NR-15', 'NIOSH', 'OSHA', 'custom'],
        defaultValue: null,
        unitId: 'none',
        group: 'ohs',
    },
];
