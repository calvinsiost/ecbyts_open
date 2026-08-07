// This file is part of ecbyts/ECBT. AGPL-3.0-only.
// Extracted from app/js/config.js in ARCH-MONO-001 Phase 2 (monolith split).

export interface CustomField {
    id: string;
    name: string;
    type: 'text' | 'number' | 'select';
    placeholder?: string;
    validForParameters: string[];
    unitId?: string;
    options?: string[];
}

/** Campos customizados associados a parâmetros. */
export const CUSTOM_FIELDS = [
    {
        id: 'cas_number',
        name: 'Número CAS',
        type: 'text',
        placeholder: 'Ex: 71-43-2',
        validForParameters: ['btex', 'tph', 'voc', 'benzene'],
    },
    {
        id: 'sample_depth',
        name: 'Profundidade da Amostra',
        type: 'number',
        unitId: 'm',
        placeholder: 'Ex: 5.5',
        validForParameters: ['pH', 'conductivity', 'temperature', 'redox', 'btex', 'tph', 'voc', 'benzene'],
    },
    {
        id: 'temperature',
        name: 'Temperatura da Amostra',
        type: 'number',
        unitId: 'celsius',
        placeholder: 'Ex: 22.5',
        validForParameters: ['pH', 'conductivity', 'redox'],
    },
    {
        id: 'detection_limit',
        name: 'Limite de Detecção',
        type: 'number',
        placeholder: 'Ex: 0.001',
        validForParameters: ['btex', 'tph', 'voc', 'benzene'],
    },
    {
        id: 'fraction',
        name: 'Fração',
        type: 'select',
        options: ['DRO', 'GRO', 'ORO', 'Total'],
        validForParameters: ['tph'],
    },
    {
        id: 'reference_elevation',
        name: 'Cota de Referência',
        type: 'number',
        unitId: 'm',
        placeholder: 'Ex: 100.5',
        validForParameters: ['water_level'],
    },
    {
        id: 'measurement_method',
        name: 'Método de Medição',
        type: 'select',
        options: ['Medidor eletrônico', 'Fita métrica', 'Transdutor', 'Molinete'],
        validForParameters: ['water_level', 'flow_rate'],
    },
] as const satisfies readonly CustomField[];