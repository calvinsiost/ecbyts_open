// @ts-check
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
// Application: Environmental Data Governance - EIS Governance Pack
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   EIS Governance Pack — Trilha A (Runtime Imediato)
   Spec: SPEC_EIS_CALCULATOR_DATA_EXPOSURE.md (EIS-CALC-DATA-001)
   ================================================================

   Encapsula o conjunto de dados que alimenta o EIS para uso no
   Calculator e no modal EIS (Trilha A — runtime draft).

   Estrutura principal: EisGovernancePack
   - documents[]          → documentos regulatórios vinculados
   - datasetCollections[] → coleções de dados com pesos
   - campaignGroups[]     → agrupamento superior por campanha
   - axisWeightRules[]    → ponderação diferenciada por eixo/escopo

   Regra de ponderação:
   weighted_axis_score(axis) = Sum(raw * weight) / Sum(weight)

   Prioridade de escopo (maior → menor):
   mixed > document > stamp > element > parameter > matrix > group >
   collection > family > area > campaign > global_default

   ================================================================ */

// ================================================================
// CONSTANTES
// ================================================================

/** Versão canônica do schema do pack. */
export const EIS_GOVERNANCE_PACK_SCHEMA_VERSION = 'eis-governance-pack.v1';

/**
 * Ordem de prioridade de escopo para resolucao de conflito de regras.
 * Indice 0 = maior prioridade.
 */
export const SCOPE_PRIORITY_ORDER = [
    'mixed',
    'document',
    'stamp',
    'element',
    'parameter',
    'matrix',
    'group',
    'collection',
    'family',
    'area',
    'campaign',
    'global_default',
];

// ================================================================
// FUNCAO PRINCIPAL - CRIAR PACK
// ================================================================

interface GovernancePackOptions {
    datasetCollections?: Array<unknown>;
    guidance?: string[];
}

interface EisGovernancePack {
    schemaVersion: string;
    groupingMode: string;
    weightingModel: string;
    documents: unknown[];
    datasetCollections: unknown[];
    campaignGroups: unknown[];
    axisWeightRules: unknown[];
    guidance: string[];
}

/**
 * @typedef {object} GovernancePackOptions
 * @property {Array<any>} [datasetCollections]
 * @property {string[]} [guidance]
 */

/**
 * @typedef {object} EisGovernancePack
 * @property {string} schemaVersion
 * @property {string} groupingMode
 * @property {string} weightingModel
 * @property {Array<any>} documents
 * @property {Array<any>} datasetCollections
 * @property {Array<any>} campaignGroups
 * @property {Array<any>} axisWeightRules
 * @property {string[]} guidance
 */

/**
 * Cria um EisGovernancePack a partir dos dados de runtime do modelo.
 *
 * @param {Array<any>} elements
 * @param {Array<any>} campaigns
 * @param {Array<any>} [documents=[]]
 * @param {Array<any>} [axisWeightRules=[]]
 * @param {GovernancePackOptions} [options={}]
 * @returns {EisGovernancePack}
 */
export function createEisGovernancePack(
    elements: Array<unknown>,
    campaigns: Array<unknown>,
    documents: Array<unknown> = [],
    axisWeightRules: Array<unknown> = [],
    options: GovernancePackOptions = {},
): EisGovernancePack {
    const { datasetCollections = [], guidance = [] } = options;

    // Normalizar entradas - arrays vazios são válidos
    const safeCampaigns = Array.isArray(campaigns) ? campaigns : [];
    const safeDocs = Array.isArray(documents) ? documents : [];
    const safeRules = Array.isArray(axisWeightRules) ? axisWeightRules : [];
    const safeCollections = Array.isArray(datasetCollections) ? datasetCollections : [];

    // Construir campaignGroups a partir das campanhas
    const campaignGroups = _buildCampaignGroups(safeCampaigns, safeCollections);

    const pack: EisGovernancePack = {
        schemaVersion: EIS_GOVERNANCE_PACK_SCHEMA_VERSION,
        groupingMode: 'campaign',
        weightingModel: 'axis_weighted_by_scope_and_document_priority',
        documents: safeDocs,
        datasetCollections: safeCollections,
        campaignGroups,
        axisWeightRules: safeRules,
        guidance: Array.isArray(guidance) ? guidance : [],
    };

    return pack;
}

// ================================================================
// SERIALIZAÇÃO - SNAPSHOT
// ================================================================

interface Snapshot {
    schemaVersion: string;
    createdAt: string;
    pack: EisGovernancePack;
}

/**
 * @typedef {object} Snapshot
 * @property {string} schemaVersion
 * @property {string} createdAt
 * @property {EisGovernancePack} pack
 */

/**
 * Serializa um EisGovernancePack para snapshot JSON-safe.
 *
 * @param {EisGovernancePack} pack
 * @returns {Snapshot}
 */
export function packToSnapshot(pack: EisGovernancePack): Snapshot {
    if (!pack || typeof pack !== 'object') {
        throw new Error('[EIS GovernancePack] packToSnapshot: pack inválido (null/undefined).');
    }
    if (pack.schemaVersion !== EIS_GOVERNANCE_PACK_SCHEMA_VERSION) {
        throw new Error(
            `[EIS GovernancePack] packToSnapshot: schemaVersion incorreta. ` +
                `Esperado: '${EIS_GOVERNANCE_PACK_SCHEMA_VERSION}', recebido: '${pack.schemaVersion}'.`,
        );
    }

    return {
        schemaVersion: EIS_GOVERNANCE_PACK_SCHEMA_VERSION,
        createdAt: new Date().toISOString(),
        pack: _deepClone(pack),
    };
}

/**
 * Restaura um EisGovernancePack a partir de um snapshot serializado.
 *
 * @param {Snapshot} snapshot
 * @returns {EisGovernancePack}
 */
export function snapshotToPack(snapshot: Snapshot): EisGovernancePack {
    if (!snapshot || typeof snapshot !== 'object') {
        throw new Error('[EIS GovernancePack] snapshotToPack: snapshot inválido.');
    }
    if (snapshot.schemaVersion !== EIS_GOVERNANCE_PACK_SCHEMA_VERSION) {
        throw new Error(
            `[EIS GovernancePack] snapshotToPack: schemaVersion incompatível. ` +
                `Esperado: '${EIS_GOVERNANCE_PACK_SCHEMA_VERSION}', recebido: '${snapshot.schemaVersion}'.`,
        );
    }
    if (!snapshot.pack || typeof snapshot.pack !== 'object') {
        throw new Error('[EIS GovernancePack] snapshotToPack: snapshot.pack ausente.');
    }

    return _deepClone(snapshot.pack);
}

// ================================================================
// VALIDAÇÃO
// ================================================================

interface PackValidation {
    valid: boolean;
    errors: string[];
}

/**
 * @typedef {object} PackValidation
 * @property {boolean} valid
 * @property {string[]} errors
 */

/**
 * Valida a integridade de um EisGovernancePack.
 *
 * @param {EisGovernancePack} pack
 * @returns {PackValidation}
 */
export function validatePack(pack: unknown): PackValidation {
    /** @type {string[]} */
    const errors: string[] = [];

    if (!pack || typeof pack !== 'object') {
        return { valid: false, errors: ['pack deve ser um objeto não-nulo.'] };
    }
    const p = pack as EisGovernancePack;

    // Schema version
    if (p.schemaVersion !== EIS_GOVERNANCE_PACK_SCHEMA_VERSION) {
        errors.push(
            `schemaVersion inválida: '${p.schemaVersion}'. ` + `Esperado: '${EIS_GOVERNANCE_PACK_SCHEMA_VERSION}'.`,
        );
    }

    // Campos de modo
    if (p.groupingMode !== 'campaign') {
        errors.push(`groupingMode inválido: '${p.groupingMode}'. Esperado: 'campaign'.`);
    }
    if (p.weightingModel !== 'axis_weighted_by_scope_and_document_priority') {
        errors.push(`weightingModel inválido: '${p.weightingModel}'.`);
    }

    // Arrays obrigatórios
    /** @type {Array<'documents'|'datasetCollections'|'campaignGroups'|'axisWeightRules'>} */
    const arrayFields = ['documents', 'datasetCollections', 'campaignGroups', 'axisWeightRules'] as const;
    for (const field of arrayFields) {
        if (!Array.isArray(p[field])) {
            errors.push(`'${field}' deve ser um array. Recebido: ${typeof p[field]}.`);
        }
    }
    if (!Array.isArray(p.guidance)) {
        errors.push(`'guidance' deve ser um array. Recebido: ${typeof p.guidance}.`);
    }

    // Validar cada AxisWeightRule
    if (Array.isArray(p.axisWeightRules)) {
        p.axisWeightRules.forEach((rule: unknown, i: number) => {
            const prefix = `axisWeightRules[${i}]`;
            const r = rule as Record<string, unknown>;
            if (!r || typeof r !== 'object') {
                errors.push(`${prefix}: deve ser objeto.`);
                return;
            }
            if (!r.id || typeof r.id !== 'string') {
                errors.push(`${prefix}.id: string obrigatória.`);
            }
            if (!r.axisKey || typeof r.axisKey !== 'string') {
                errors.push(`${prefix}.axisKey: string obrigatória.`);
            }
            if (!r.scope || typeof r.scope !== 'object') {
                errors.push(`${prefix}.scope: objeto obrigatório.`);
            } else {
                const s = r.scope as Record<string, unknown>;
                if (!s.type) errors.push(`${prefix}.scope.type: obrigatório.`);
                if (s.value == null) errors.push(`${prefix}.scope.value: obrigatório.`);
            }
            if (!r.weight || typeof r.weight !== 'object') {
                errors.push(`${prefix}.weight: objeto obrigatório.`);
            } else {
                const w = r.weight as Record<string, unknown>;
                if (typeof w.numerator !== 'number' || w.numerator <= 0) {
                    errors.push(`${prefix}.weight.numerator: número positivo obrigatório.`);
                }
                if (typeof w.denominator !== 'number' || w.denominator <= 0) {
                    errors.push(`${prefix}.weight.denominator: número positivo obrigatório.`);
                }
                if (typeof w.normalized !== 'number' || w.normalized < 0) {
                    errors.push(`${prefix}.weight.normalized: número >= 0 obrigatório.`);
                }
            }
            if (!r.rationale || typeof r.rationale !== 'string') {
                errors.push(`${prefix}.rationale: string obrigatória.`);
            }
        });
    }

    // Validar cada DatasetCollection
    if (Array.isArray(p.datasetCollections)) {
        p.datasetCollections.forEach((col: unknown, i: number) => {
            const prefix = `datasetCollections[${i}]`;
            const c = col as Record<string, unknown>;
            if (!c || typeof c !== 'object') {
                errors.push(`${prefix}: deve ser objeto.`);
                return;
            }
            if (!c.id || typeof c.id !== 'string') {
                errors.push(`${prefix}.id: string obrigatória.`);
            }
            if (!c.name || typeof c.name !== 'string') {
                errors.push(`${prefix}.name: string obrigatória.`);
            }
            if (!c.scope || typeof c.scope !== 'object') {
                errors.push(`${prefix}.scope: objeto obrigatório.`);
            }
            if (!c.weight || typeof c.weight !== 'object') {
                errors.push(`${prefix}.weight: objeto obrigatório.`);
            } else {
                const w = c.weight as Record<string, unknown>;
                if (typeof w.numerator !== 'number' || w.numerator <= 0) {
                    errors.push(`${prefix}.weight.numerator: número positivo obrigatório.`);
                }
                if (typeof w.denominator !== 'number' || w.denominator <= 0) {
                    errors.push(`${prefix}.weight.denominator: número positivo obrigatório.`);
                }
                if (typeof w.normalized !== 'number' || w.normalized < 0) {
                    errors.push(`${prefix}.weight.normalized: número >= 0 obrigatório.`);
                }
            }
        });
    }

    return { valid: errors.length === 0, errors };
}

// ================================================================
// AGREGAÇÃO PONDERADA
// ================================================================

interface DataPoint {
    scopeType: string;
    scopeValue: string;
    rawScore: number;
}

/**
 * @typedef {object} DataPoint
 * @property {string} scopeType
 * @property {string} scopeValue
 * @property {number} rawScore
 */

/**
 * Aplica ponderação diferenciada para um eixo EIS usando as regras do pack.
 */
/**
 * @param {EisGovernancePack|null} pack
 * @param {string} targetAxis
 * @param {DataPoint[]} [dataPoints=[]]
 * @returns {number}
 */
export function applyWeightedAggregation(
    pack: EisGovernancePack | null,
    targetAxis: string,
    dataPoints: DataPoint[] = [],
): number {
    if (!pack || !targetAxis) return 0;
    if (!Array.isArray(dataPoints) || dataPoints.length === 0) return 0;

    // Coletar regras aplicáveis ao eixo alvo
    const rules = Array.isArray(pack.axisWeightRules)
        ? pack.axisWeightRules.filter((r: unknown) => (r as Record<string, unknown>).axisKey === targetAxis)
        : [];

    // Construir mapa de peso por escopo (scopeType:scopeValue → weight.normalized)
    const weightMap = _buildWeightMap(rules);

    let weightedSum = 0;
    let weightSum = 0;

    for (const point of dataPoints) {
        const raw = typeof point.rawScore === 'number' ? point.rawScore : 0;
        const weight = _resolveWeight(weightMap, point.scopeType, point.scopeValue, rules);

        weightedSum += raw * weight;
        weightSum += weight;
    }

    if (weightSum === 0) return 0;

    const result = weightedSum / weightSum;
    // Clampar ao intervalo válido do EIS
    return parseFloat(Math.max(0, Math.min(5, result)).toFixed(4));
}

// ================================================================
// HELPERS INTERNOS
// ================================================================

/**
 * Constrói um mapa de peso por chave de escopo composta.
 */
/**
 * @param {Array<any>} rules
 * @returns {Map<string, number>}
 */
function _buildWeightMap(rules: Array<unknown>): Map<string, number> {
    const map = new Map<string, number>();

    // Ordenar por prioridade decrescente (menor índice = maior prioridade)
    const sorted = [...rules].sort((a: unknown, b: unknown) => {
        const pa = SCOPE_PRIORITY_ORDER.indexOf(((a as Record<string, unknown>).scope as Record<string, unknown>)?.type as string);
        const pb = SCOPE_PRIORITY_ORDER.indexOf(((b as Record<string, unknown>).scope as Record<string, unknown>)?.type as string);
        const ia = pa === -1 ? SCOPE_PRIORITY_ORDER.length : pa;
        const ib = pb === -1 ? SCOPE_PRIORITY_ORDER.length : pb;
        return ia - ib;
    });

    for (const rule of sorted) {
        const r = rule as Record<string, unknown>;
        if (!r.scope) continue;
        const s = r.scope as Record<string, unknown>;
        const key = `${s.type}:${s.value}`;
        if (!map.has(key)) {
            map.set(key, (r.weight as Record<string, number>)?.normalized ?? 1);
        }
    }

    return map;
}

/**
 * Resolve o peso para um ponto de dados dado seu escopo.
 */
/**
 * @param {Map<string, number>} weightMap
 * @param {string} number>
 * @param {string} scopeType
 * @param {Array<any>} scopeValue
 * @returns {number}
 */
function _resolveWeight(
    weightMap: Map<string, number>,
    scopeType: string,
    scopeValue: string,
    rules: Array<unknown>,
): number {
    const exactKey = `${scopeType}:${scopeValue}`;
    if (weightMap.has(exactKey)) {
        return weightMap.get(exactKey) ?? 1;
    }

    // Fallback: regra global_default para o eixo
    const globalKey = 'global_default:global';
    if (weightMap.has(globalKey)) {
        return weightMap.get(globalKey) ?? 1;
    }

    // Buscar qualquer global_default
    const globalRule = rules.find((r: unknown) => ((r as Record<string, unknown>).scope as Record<string, unknown>)?.type === 'global_default');
    if (globalRule) {
        return ((globalRule as Record<string, unknown>).weight as Record<string, number>)?.normalized ?? 1;
    }

    // Sem regra: peso neutro 1 (média simples)
    return 1;
}

interface CampaignGroup {
    id: string;
    type: string;
    campaignId: string;
    campaignName: string;
    campaignDate: string | null;
    collectionIds: string[];
    weightedPrioritySummary: string;
}

/**
 * @typedef {object} CampaignGroup
 * @property {string} id
 * @property {string} type
 * @property {string} campaignId
 * @property {string} campaignName
 * @property {string|null} campaignDate
 * @property {string[]} collectionIds
 * @property {string} weightedPrioritySummary
 */

/**
 * Constrói grupos de campanha a partir das campanhas e coleções disponíveis.
 */
/**
 * @param {Array<any>} campaigns
 * @param {Array<any>} collections
 * @returns {CampaignGroup[]}
 */
function _buildCampaignGroups(campaigns: Array<unknown>, collections: Array<unknown>): CampaignGroup[] {
    return campaigns.map((campaign: unknown) => {
        const c = campaign as Record<string, unknown>;
        const campaignId = (c.id as string) || '';
        const linkedCollectionIds = collections
            .filter((col: unknown) => (col as Record<string, unknown>).campaignId === campaignId)
            .map((col: unknown) => (col as Record<string, unknown>).id as string);

        return {
            id: `csg-${campaignId}`,
            type: 'campaign_super_group',
            campaignId,
            campaignName: (c.name as string) || (c.title as string) || campaignId,
            campaignDate: (c.date as string) || (c.startDate as string) || null,
            collectionIds: linkedCollectionIds,
            weightedPrioritySummary: _buildPrioritySummary(linkedCollectionIds, collections),
        };
    });
}

/**
 * Gera um resumo textual de prioridade para um grupo de campanha.
 */
/**
 * @param {string[]} collectionIds
 * @param {Array<any>} allCollections
 * @returns {string}
 */
function _buildPrioritySummary(collectionIds: string[], allCollections: Array<unknown>): string {
    if (collectionIds.length === 0) return 'no collections';
    const weights = collectionIds
        .map((id) => {
            const col = allCollections.find((c: unknown) => (c as Record<string, unknown>).id === id);
            return ((col as Record<string, unknown>)?.weight as Record<string, number>)?.normalized ?? 1;
        })
        .join(', ');
    return `${collectionIds.length} collection(s), weights: ${weights}`;
}

/**
 * Deep clone de um objeto JSON-safe (sem funções, Date normalizado para ISO string).
 */
/**
 * @template T
 * @param {T} obj
 * @returns {T}
 */
function _deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}
