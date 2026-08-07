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
   TIPOS DE RELACOES (EDGE TYPES)
   ================================================================

   Define os tipos de vinculos/relacoes entre ativos.
   Implementa grafo Any-to-Any para conexoes universais.

   CATEGORIAS:
   - hierarchy: Contencao e hierarquia
   - monitoring: Monitoramento e observacao
   - impact: Impacto e causalidade
   - spatial: Relacoes espaciais
   - responsibility: Responsabilidades
   - compliance: Conformidade regulatoria

   ================================================================ */

// ----------------------------------------------------------------
// CATEGORIAS DE RELACOES
// ----------------------------------------------------------------

export const EDGE_CATEGORIES: Record<string, any> = {
    hierarchy: {
        id: 'hierarchy',
        name: 'Hierarquia',
        description: 'Relacoes de contencao e pertencimento',
        color: '#673AB7', // Roxo
        icon: 'folder-open',
    },
    monitoring: {
        id: 'monitoring',
        name: 'Monitoramento',
        description: 'Relacoes de observacao e medicao',
        color: '#2196F3', // Azul
        icon: 'eye',
    },
    impact: {
        id: 'impact',
        name: 'Impacto',
        description: 'Relacoes de causa e efeito',
        color: '#F44336', // Vermelho
        icon: 'alert-triangle',
    },
    spatial: {
        id: 'spatial',
        name: 'Espacial',
        description: 'Relacoes de proximidade e fluxo',
        color: '#4CAF50', // Verde
        icon: 'map-pin',
    },
    responsibility: {
        id: 'responsibility',
        name: 'Responsabilidade',
        description: 'Relacoes de responsabilidade',
        color: '#FF9800', // Laranja
        icon: 'user',
    },
    compliance: {
        id: 'compliance',
        name: 'Conformidade',
        description: 'Relacoes com normas e regulamentos',
        color: '#607D8B', // Cinza
        icon: 'docs',
    },
};

// ----------------------------------------------------------------
// TIPOS DE RELACOES
// ----------------------------------------------------------------

export const EDGE_TYPES: Record<string, any> = {
    // === HIERARQUIA ===
    contains: {
        id: 'contains',
        category: 'hierarchy',
        name: 'Contem',
        description: 'Contencao hierarquica (pai -> filho)',
        icon: 'folder-open',
        direction: 'parent_to_child',
        bidirectional: false,
        inverse: 'contained_in',
        validSources: ['area', 'building', 'habitat'],
        validTargets: ['*'], // Qualquer familia
        properties: {
            level: { type: 'number', label: 'Nivel hierarquico' },
        },
    },
    contained_in: {
        id: 'contained_in',
        category: 'hierarchy',
        name: 'Contido em',
        description: 'Pertencimento (filho -> pai)',
        icon: 'download',
        direction: 'child_to_parent',
        bidirectional: false,
        inverse: 'contains',
        validSources: ['*'],
        validTargets: ['area', 'building', 'habitat'],
        properties: {},
    },

    // === MONITORAMENTO ===
    monitors: {
        id: 'monitors',
        category: 'monitoring',
        name: 'Monitora',
        description: 'Ponto monitora alvo (poco -> pluma)',
        icon: 'radar',
        direction: 'monitor_to_target',
        bidirectional: false,
        inverse: 'monitored_by',
        validSources: ['well', 'sample', 'emission_source', 'effluent_point'],
        validTargets: ['plume', 'area', 'habitat', 'river', 'lake'],
        properties: {
            frequency: {
                type: 'enum',
                label: 'Frequencia',
                options: ['daily', 'weekly', 'monthly', 'quarterly', 'annual'],
            },
            startDate: { type: 'date', label: 'Inicio' },
        },
    },
    monitored_by: {
        id: 'monitored_by',
        category: 'monitoring',
        name: 'Monitorado por',
        description: 'Alvo monitorado por ponto',
        icon: 'target',
        direction: 'target_to_monitor',
        bidirectional: false,
        inverse: 'monitors',
        validSources: ['plume', 'area', 'habitat', 'river', 'lake'],
        validTargets: ['well', 'sample', 'emission_source', 'effluent_point'],
        properties: {},
    },
    observed_at: {
        id: 'observed_at',
        category: 'monitoring',
        name: 'Observado em',
        description: 'Avistamento de individuo em local',
        icon: 'search',
        direction: 'individual_to_location',
        bidirectional: false,
        validSources: ['individual'],
        validTargets: ['area', 'habitat', 'well', 'sample'],
        properties: {
            observationDate: { type: 'date', label: 'Data' },
            observer: { type: 'string', label: 'Observador' },
            count: { type: 'number', label: 'Quantidade' },
        },
    },

    // === IMPACTO ===
    impacts: {
        id: 'impacts',
        category: 'impact',
        name: 'Impacta',
        description: 'Fonte impacta alvo',
        icon: 'alert-triangle',
        direction: 'source_to_affected',
        bidirectional: false,
        inverse: 'impacted_by',
        validSources: ['tank', 'emission_source', 'effluent_point', 'waste_stream', 'plume'],
        validTargets: ['area', 'habitat', 'river', 'lake', 'well', 'spring'],
        properties: {
            impactType: {
                type: 'enum',
                label: 'Tipo',
                options: ['contamination', 'noise', 'visual', 'thermal', 'ecological'],
            },
            severity: { type: 'enum', label: 'Severidade', options: ['low', 'medium', 'high', 'critical'] },
        },
    },
    impacted_by: {
        id: 'impacted_by',
        category: 'impact',
        name: 'Impactado por',
        description: 'Alvo impactado por fonte',
        icon: 'target',
        direction: 'affected_to_source',
        bidirectional: false,
        inverse: 'impacts',
        validSources: ['area', 'habitat', 'river', 'lake', 'well', 'spring'],
        validTargets: ['tank', 'emission_source', 'effluent_point', 'waste_stream', 'plume'],
        properties: {},
    },
    causes: {
        id: 'causes',
        category: 'impact',
        name: 'Causa',
        description: 'Relacao de causalidade',
        icon: 'arrow-right',
        direction: 'cause_to_effect',
        bidirectional: false,
        inverse: 'caused_by',
        validSources: ['tank', 'incident', 'emission_source'],
        validTargets: ['plume', 'incident', 'area'],
        properties: {
            mechanism: { type: 'string', label: 'Mecanismo' },
            confidence: { type: 'enum', label: 'Confianca', options: ['low', 'medium', 'high', 'confirmed'] },
        },
    },
    caused_by: {
        id: 'caused_by',
        category: 'impact',
        name: 'Causado por',
        description: 'Efeito causado por fonte',
        icon: 'arrow-left',
        direction: 'effect_to_cause',
        bidirectional: false,
        inverse: 'causes',
        validSources: ['plume', 'incident', 'area'],
        validTargets: ['tank', 'incident', 'emission_source'],
        properties: {},
    },
    mitigates: {
        id: 'mitigates',
        category: 'impact',
        name: 'Mitiga',
        description: 'Acao que mitiga impacto',
        icon: 'shield',
        direction: 'action_to_impact',
        bidirectional: false,
        validSources: ['well', 'area', 'habitat'],
        validTargets: ['plume', 'emission_source', 'effluent_point'],
        properties: {
            effectiveness: { type: 'enum', label: 'Efetividade', options: ['low', 'medium', 'high'] },
            startDate: { type: 'date', label: 'Inicio' },
        },
    },

    // === ESPACIAL ===
    adjacent_to: {
        id: 'adjacent_to',
        category: 'spatial',
        name: 'Adjacente a',
        description: 'Adjacencia espacial (bidirecional)',
        icon: 'arrow-left-right',
        direction: 'symmetric',
        bidirectional: true,
        validSources: ['*'],
        validTargets: ['*'],
        properties: {
            distance: { type: 'number', label: 'Distancia (m)' },
            boundary: { type: 'enum', label: 'Tipo limite', options: ['shared', 'near', 'buffer'] },
        },
    },
    upstream_of: {
        id: 'upstream_of',
        category: 'spatial',
        name: 'A montante de',
        description: 'Relacao de fluxo (montante -> jusante)',
        icon: 'arrow-up-right',
        direction: 'upstream_to_downstream',
        bidirectional: false,
        inverse: 'downstream_of',
        validSources: ['spring', 'river', 'well', 'effluent_point'],
        validTargets: ['river', 'lake', 'well', 'area'],
        properties: {
            flowDistance: { type: 'number', label: 'Distancia de fluxo (m)' },
        },
    },
    downstream_of: {
        id: 'downstream_of',
        category: 'spatial',
        name: 'A jusante de',
        description: 'Relacao de fluxo (jusante -> montante)',
        icon: 'arrow-down-left',
        direction: 'downstream_to_upstream',
        bidirectional: false,
        inverse: 'upstream_of',
        validSources: ['river', 'lake', 'well', 'area'],
        validTargets: ['spring', 'river', 'well', 'effluent_point'],
        properties: {},
    },

    // === RESPONSABILIDADE ===
    responsible_for: {
        id: 'responsible_for',
        category: 'responsibility',
        name: 'Responsavel por',
        description: 'Individuo responsavel por ativo',
        icon: 'user',
        direction: 'individual_to_asset',
        bidirectional: false,
        inverse: 'responsibility_of',
        validSources: ['individual'],
        validTargets: ['area', 'well', 'tank', 'emission_source', 'effluent_point', 'waste_stream', 'habitat'],
        properties: {
            role: { type: 'string', label: 'Funcao' },
            startDate: { type: 'date', label: 'Inicio' },
            endDate: { type: 'date', label: 'Fim' },
        },
    },
    responsibility_of: {
        id: 'responsibility_of',
        category: 'responsibility',
        name: 'Responsabilidade de',
        description: 'Ativo sob responsabilidade de individuo',
        icon: 'building',
        direction: 'asset_to_individual',
        bidirectional: false,
        inverse: 'responsible_for',
        validSources: ['area', 'well', 'tank', 'emission_source', 'effluent_point', 'waste_stream', 'habitat'],
        validTargets: ['individual'],
        properties: {},
    },
    involved_in: {
        id: 'involved_in',
        category: 'responsibility',
        name: 'Envolvido em',
        description: 'Individuo envolvido em incidente',
        icon: 'siren',
        direction: 'individual_to_incident',
        bidirectional: false,
        validSources: ['individual'],
        validTargets: ['incident'],
        properties: {
            role: { type: 'enum', label: 'Papel', options: ['victim', 'witness', 'first_responder', 'investigator'] },
            injuryType: { type: 'string', label: 'Tipo de lesao' },
        },
    },
    occurred_in: {
        id: 'occurred_in',
        category: 'responsibility',
        name: 'Ocorreu em',
        description: 'Incidente ocorreu em local',
        icon: 'map-pin',
        direction: 'incident_to_location',
        bidirectional: false,
        validSources: ['incident'],
        validTargets: ['area', 'building', 'well', 'tank'],
        properties: {
            exactLocation: { type: 'string', label: 'Local exato' },
        },
    },
    inhabits: {
        id: 'inhabits',
        category: 'responsibility',
        name: 'Habita',
        description: 'Individuo habita habitat',
        icon: 'home',
        direction: 'individual_to_habitat',
        bidirectional: false,
        validSources: ['individual'],
        validTargets: ['habitat', 'area'],
        properties: {
            status: { type: 'enum', label: 'Status', options: ['resident', 'transient', 'breeding', 'foraging'] },
            seasonality: {
                type: 'enum',
                label: 'Sazonalidade',
                options: ['year_round', 'breeding', 'wintering', 'migratory'],
            },
        },
    },

    // === CONFORMIDADE ===
    complies_with: {
        id: 'complies_with',
        category: 'compliance',
        name: 'Conforme com',
        description: 'Ativo conforme com norma',
        icon: 'check-circle',
        direction: 'asset_to_regulation',
        bidirectional: false,
        validSources: ['*'],
        validTargets: ['*'], // Regulamentos sao representados como estampas
        properties: {
            norm: { type: 'string', label: 'Norma' },
            article: { type: 'string', label: 'Artigo' },
            status: { type: 'enum', label: 'Status', options: ['compliant', 'non_compliant', 'pending', 'exempt'] },
            verificationDate: { type: 'date', label: 'Data de verificacao' },
        },
    },

    // === GOVERNANCA ===
    governed_by: {
        id: 'governed_by',
        category: 'compliance',
        name: 'Governado por',
        description: 'Elemento vinculado a contrato de governanca',
        icon: 'docs',
        direction: 'element_to_contract',
        bidirectional: false,
        validSources: ['*'],
        validTargets: ['*'],
        properties: {
            contractId: { type: 'string', label: 'ID do Contrato' },
            role: { type: 'enum', label: 'Papel', options: ['subject', 'beneficiary', 'guarantor'] },
            effectiveDate: { type: 'date', label: 'Data de vigencia' },
        },
    },

    // ----------------------------------------------------------------
    // OPERATIONAL EDGES (2026-04 batch) - asset ⇄ sensor + remediation + pipeline
    // ----------------------------------------------------------------
    // Added 2026-04-12 to close tests/edge-types-links.test.mjs. Contracts:
    //   instrumented_by : asset    → sensor       (inverse: instruments)
    //   managed_by_remediation: target → remediation (inverse: acts_on)
    //   feeds_pipeline  : well|sensor → any (data pipeline integration)
    instrumented_by: {
        id: 'instrumented_by',
        category: 'monitoring',
        name: 'Instrumentado por',
        description: 'Ativo instrumentado por sensor de medição',
        icon: 'activity',
        direction: 'asset_to_sensor',
        bidirectional: false,
        inverse: 'instruments',
        validSources: [
            'well',
            'tank',
            'building',
            'remediation',
            'spring',
            'river',
            'lake',
            'boundary',
            'waste',
            'plume',
        ],
        validTargets: ['sensor'],
        properties: {
            installDate: { type: 'date', label: 'Data de instalação' },
            channel: { type: 'string', label: 'Canal' },
        },
    },
    instruments: {
        id: 'instruments',
        category: 'monitoring',
        name: 'Instrumenta',
        description: 'Sensor instrumenta ativo',
        icon: 'cpu',
        direction: 'sensor_to_asset',
        bidirectional: false,
        inverse: 'instrumented_by',
        validSources: ['sensor'],
        validTargets: [
            'well',
            'tank',
            'building',
            'remediation',
            'spring',
            'river',
            'lake',
            'boundary',
            'waste',
            'plume',
        ],
        properties: {},
    },
    managed_by_remediation: {
        id: 'managed_by_remediation',
        category: 'impact',
        name: 'Gerenciado por remediação',
        description: 'Ativo/plume sob ação de sistema de remediação',
        icon: 'shield-check',
        direction: 'target_to_remediation',
        bidirectional: false,
        inverse: 'acts_on',
        validSources: ['well', 'plume', 'area', 'waste', 'tank', 'spring', 'river', 'lake'],
        validTargets: ['remediation'],
        properties: {
            startDate: { type: 'date', label: 'Início do tratamento' },
            endDate: { type: 'date', label: 'Fim estimado' },
            effectiveness: {
                type: 'enum',
                label: 'Efetividade',
                options: ['low', 'medium', 'high', 'pending'],
            },
        },
    },
    acts_on: {
        id: 'acts_on',
        category: 'impact',
        name: 'Atua em',
        description: 'Sistema de remediação atua em ativo/plume',
        icon: 'target',
        direction: 'remediation_to_target',
        bidirectional: false,
        inverse: 'managed_by_remediation',
        validSources: ['remediation'],
        validTargets: ['well', 'plume', 'area', 'waste', 'tank', 'spring', 'river', 'lake'],
        properties: {},
    },
    feeds_pipeline: {
        id: 'feeds_pipeline',
        category: 'monitoring',
        name: 'Alimenta pipeline',
        description: 'Sensor ou poço alimenta data pipeline de processamento',
        icon: 'git-branch',
        direction: 'source_to_pipeline',
        bidirectional: false,
        inverse: null,
        validSources: ['sensor', 'well', 'sample', 'emission_source', 'effluent_point'],
        validTargets: ['*'],
        properties: {
            pipelineId: { type: 'string', label: 'ID do pipeline' },
            cadence: {
                type: 'enum',
                label: 'Cadência',
                options: ['realtime', 'hourly', 'daily', 'on_demand'],
            },
        },
    },
};

// ----------------------------------------------------------------
// FUNCOES AUXILIARES
// ----------------------------------------------------------------

/**
 * Obtem tipo de relacao por ID.
 * @param {string} typeId - ID do tipo
 * @returns {any}
 */
export function getEdgeType(typeId: string): any {
    return (EDGE_TYPES as any)[typeId] || null;
}

/**
 * Obtem tipos de relacao por categoria.
 * @param {string} category - ID da categoria
 * @returns {Object[]}
 */
export function getEdgeTypesByCategory(category: string): Object[] {
    return Object.values(EDGE_TYPES).filter((t) => t.category === category);
}

/**
 * Obtem tipos de relacao validos para uma familia de origem.
 * @param {string} sourceFamily - Familia do elemento origem
 * @returns {Object[]}
 */
export function getValidEdgeTypesForSource(sourceFamily: string): Object[] {
    return Object.values(EDGE_TYPES).filter((edgeType: any) => {
        if (edgeType.validSources.includes('*')) return true;
        return edgeType.validSources.includes(sourceFamily);
    });
}

/**
 * Obtem tipos de relacao validos para uma familia de destino.
 * @param {string} targetFamily - Familia do elemento destino
 * @returns {Object[]}
 */
export function getValidEdgeTypesForTarget(targetFamily: string): Object[] {
    return Object.values(EDGE_TYPES).filter((edgeType: any) => {
        if (edgeType.validTargets.includes('*')) return true;
        return edgeType.validTargets.includes(targetFamily);
    });
}

/**
 * Verifica se uma relacao e valida entre duas familias.
 * @param {string} typeId - ID do tipo de relacao
 * @param {string} sourceFamily - Familia do elemento origem
 * @param {string} targetFamily - Familia do elemento destino
 * @returns {boolean}
 */
export function isValidEdge(typeId: string, sourceFamily: string, targetFamily: string): boolean {
    const edgeType = getEdgeType(typeId);
    if (!edgeType) return false;

    const sourceValid = edgeType.validSources.includes('*') || edgeType.validSources.includes(sourceFamily);
    const targetValid = edgeType.validTargets.includes('*') || edgeType.validTargets.includes(targetFamily);

    return sourceValid && targetValid;
}

/**
 * Obtem o tipo inverso de uma relacao.
 * @param {string} typeId - ID do tipo
 * @returns {string|null}
 */
export function getInverseEdgeType(typeId: string): string | null {
    const edgeType = getEdgeType(typeId);
    return edgeType?.inverse || null;
}

/**
 * Verifica se tipo de relacao e bidirecional.
 * @param {string} typeId - ID do tipo
 * @returns {boolean}
 */
export function isBidirectional(typeId: string): boolean {
    const edgeType = getEdgeType(typeId);
    return edgeType?.bidirectional || false;
}
