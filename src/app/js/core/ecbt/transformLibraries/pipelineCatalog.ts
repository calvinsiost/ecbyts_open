// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ECBT Transform Libraries - Pipeline Catalog (Phase 8)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S8
 *
 * Phase 8 (2026-05-01) - pure-logic catálogo de pipelines salvos.
 * Permite usuário criar coleção nomeada de pipelines reutilizáveis,
 * exportar/importar como JSON e re-aplicar via Phase 3 Pipeline class.
 *
 * Estratégia:
 *   - Catálogo é Map<id, savedPipeline>, persistível como snapshot
 *   - savedPipeline = {id, name, description, stepConfigs, createdAt, updatedAt, tags}
 *   - JSON export tem versão embutida para evolução compatível
 *   - Validação fail-closed em todas as operações de mutação
 *   - Não inicia browser/IDB - caller integra via store de sua escolha
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

const CATALOG_VERSION = 1;
const MAX_NAME_LEN = 120;
const MAX_DESCRIPTION_LEN = 1000;
const MAX_TAGS = 16;
const MAX_TAG_LEN = 32;

/** Identidade do catálogo. */
export const PIPELINE_CATALOG_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 8,
    deliveredAt: '2026-05-01',
    catalogVersion: CATALOG_VERSION,
});

/**
 * Valida + normaliza um savedPipeline antes de inserir.
 *
 * @param {Record<string, any>} input
 * @returns {any} normalized frozen pipeline
 */
export function createSavedPipeline(input: Record<string, any>): any {
    if (!input || typeof input !== 'object') {
        throw new TypeError('input must be object');
    }

    const id = String(input.id || '').trim();
    if (!id) throw new Error('id required');
    if (id.length > 64) throw new Error('id too long (max 64 chars)');

    const name = String(input.name || '').trim();
    if (!name) throw new Error('name required');
    if (name.length > MAX_NAME_LEN) throw new Error(`name exceeds ${MAX_NAME_LEN} chars`);

    const description = input.description ? String(input.description).slice(0, MAX_DESCRIPTION_LEN) : '';

    if (!Array.isArray(input.stepConfigs)) {
        throw new TypeError('stepConfigs must be array');
    }
    const stepConfigs = input.stepConfigs.map((step: any, i: any) => {
        if (!step || typeof step !== 'object') {
            throw new Error(`Step ${i} not an object`);
        }
        const libId = String(step.libraryId || '').trim();
        if (!libId) throw new Error(`Step ${i} has empty libraryId`);
                const out: {libraryId: string, config?: any}= { libraryId: libId };
        if (step.config && typeof step.config === 'object') {
            out.config = { ...step.config };
        }
        return Object.freeze(out);
    });

        let tags: string[]= [];
    if (Array.isArray(input.tags)) {
        tags = input.tags
            .map((t: any) =>
                String(t || '')
                    .trim()
                    .slice(0, MAX_TAG_LEN),
            )
            .filter((t: any) => t.length > 0)
            .slice(0, MAX_TAGS);
    }

    const now = new Date().toISOString();
    return Object.freeze({
        id,
        name,
        description,
        stepConfigs: Object.freeze(stepConfigs),
        tags: Object.freeze(tags),
        createdAt: input.createdAt || now,
        updatedAt: input.updatedAt || now,
    });
}

/**
 * In-memory catálogo de pipelines salvos.
 */
export class PipelineCatalog {
    _byId: Map<string, any>;

    constructor() {
        this._byId = new Map(); // id → savedPipeline
    }

    /**
     * Adiciona pipeline (rejeita se id duplicado).
     */
    add(input: any) {
        const pipeline = createSavedPipeline(input);
        if (this._byId.has(pipeline.id)) {
            throw new Error(`Pipeline id "${pipeline.id}" already exists`);
        }
        this._byId.set(pipeline.id, pipeline);
        return pipeline;
    }

    /**
     * Atualiza pipeline existente. Preserva createdAt; atualiza updatedAt.
     */
    update(id: any, partial: any) {
        if (!this._byId.has(id)) {
            throw new Error(`Pipeline id "${id}" not found`);
        }
        const existing = this._byId.get(id);
        const merged = createSavedPipeline({
            ...existing,
            ...partial,
            id, // não permitir mudar id
            createdAt: existing.createdAt,
            updatedAt: new Date().toISOString(),
        });
        this._byId.set(id, merged);
        return merged;
    }

    /**
     * Remove pipeline por id. Retorna true se removido, false se não existia.
     */
    remove(id: any) {
        return this._byId.delete(String(id));
    }

    /**
     * Retorna pipeline por id ou null.
     */
    get(id: any) {
        return this._byId.get(String(id)) || null;
    }

    /**
     * Lista todos os pipelines (ordem de inserção).
     */
    list() {
        return [...this._byId.values()];
    }

    /**
     * Retorna pipelines que contêm uma tag.
     */
    findByTag(tag: any) {
        const t = String(tag || '').trim();
        if (!t) return [];
        return [...this._byId.values()].filter((p) => p.tags.includes(t));
    }

    /**
     * Busca por nome (case-insensitive substring).
     */
    findByName(query: any) {
        const q = String(query || '')
            .trim()
            .toLowerCase();
        if (!q) return [];
        return [...this._byId.values()].filter((p) => p.name.toLowerCase().includes(q));
    }

    /**
     * Conta pipelines.
     */
    size() {
        return this._byId.size;
    }

    /**
     * Snapshot para persistência.
     */
    toJSON() {
        return {
            version: CATALOG_VERSION,
            pipelines: [...this._byId.values()],
        };
    }

    /**
     * Restaura catálogo a partir de JSON snapshot.
     * Valida cada pipeline; pula inválidos com erro coletado.
     *
     * @param {Record<string, any>} snapshot
     * @returns {{catalog: PipelineCatalog, errors: Array<{id: string, error: string}>}}
     */
    static fromJSON(snapshot: Record<string, any>) {
        if (!snapshot || typeof snapshot !== 'object') {
            throw new TypeError('snapshot must be object');
        }
        if (snapshot.version !== CATALOG_VERSION) {
            throw new Error(`Unsupported catalog version ${snapshot.version} (expected ${CATALOG_VERSION})`);
        }
        const cat = new PipelineCatalog();
        const errors = [];
        const pipelines = Array.isArray(snapshot.pipelines) ? snapshot.pipelines : [];
        for (const p of pipelines) {
            try {
                cat.add(p);
            } catch (err) {
                errors.push({
                    id: String(p?.id || '<unknown>'),
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }
        return { catalog: cat, errors };
    }

    /**
     * Limpa todos os pipelines.
     */
    clear() {
        this._byId.clear();
    }

    /**
     * Sumário estatístico.
     */
    summary() {
        const tagCounts = new Map();
        let totalSteps = 0;
        for (const p of this._byId.values()) {
            totalSteps += p.stepConfigs.length;
            for (const t of p.tags) {
                tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
            }
        }
        return {
            count: this._byId.size,
            totalSteps,
            tags: [...tagCounts.entries()].sort((a, b) => b[1] - a[1]),
        };
    }
}

/**
 * Cria catálogo factory.
 */
export function createPipelineCatalog() {
    return new PipelineCatalog();
}

/**
 * Module identity export.
 */
export const pipelineCatalogMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 8,
    deliveredAt: '2026-05-01',
    catalogVersion: CATALOG_VERSION,
    limits: {
        nameMaxLen: MAX_NAME_LEN,
        descriptionMaxLen: MAX_DESCRIPTION_LEN,
        maxTags: MAX_TAGS,
        tagMaxLen: MAX_TAG_LEN,
    },
    exports: ['PIPELINE_CATALOG_META', 'createSavedPipeline', 'PipelineCatalog', 'createPipelineCatalog'],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
