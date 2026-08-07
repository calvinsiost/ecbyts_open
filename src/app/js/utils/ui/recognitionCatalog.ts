// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * SPEC_FC04_RECOGNITION_SURFACING (claude - novaspec, 2026-06-02) —
 * recognitionAdapter consumindo RegistryCatalog para `core/recognition`.
 *
 * Surfacа as 4 estratégias de vectorização registradas (vegetation,
 * building, roads, water) — Strategy Pattern em
 * `core/recognition/vectorization/strategies.ts`. Cada uma processa
 * uma máscara binária + RGB e retorna feições estruturadas
 * (poligonos/linhas conforme classe).
 *
 * Honesto: módulos `core/recognition/` adicionais (CLIP, SAM,
 * SLIC, YOLOS, samgeo — 25 arquivos) NÃO estão num registry único;
 * são módulos individuais sem metadado canônico. Surfacar todos
 * seria FC futuro (recognition module discovery via filesystem +
 * Meta exports patterns como `core/analytics`).
 *
 * Adaptador FINO (~30 LOC): mapeia STRATEGIES Record → RegistryEntry[].
 *
 * Refs:
 *   - SPEC `docs/specs/frontier/SPEC_FC04_RECOGNITION_SURFACING.md`
 *   - Abstração: `docs/specs/frontier/SPEC_REGISTRY_CATALOG.md`
 *   - Registry: `core/recognition/vectorization/strategies.ts:657 STRATEGIES`
 *   - SAM/CLIP best practices: zero-shot remote sensing F1 ~0.65 IoU ~0.49
 */

import { openRegistryCatalog, type RegistryEntry } from './registryCatalog.js';
import { t } from '../i18n/translations.js';

/**
 * Metadado curado por estratégia. Não vive no registry (strategies
 * só expõem `process` function), então o adapter enriquece com
 * informação descritiva para o catálogo (descrição + algoritmo +
 * paper de referência).
 *
 * Frozen para invariante. Atualizar quando nova strategy for
 * adicionada em `vectorization/strategies.ts`.
 */
export const RECOGNITION_STRATEGY_META = Object.freeze({
    vegetation: Object.freeze({
        description: 'Watershed + low-epsilon RDP → contornos orgânicos para vegetação',
        algorithm: 'Watershed + Ramer-Douglas-Peucker',
        ref: 'Suzuki & Abe (1985) — Topological structural analysis',
    }),
    building: Object.freeze({
        description: 'Canny + morphology + minAreaRect/approxPolyDP → bordas ortogonais 90°',
        algorithm: 'Canny + minAreaRect',
        ref: 'Canny (1986) — Computational approach to edge detection',
    }),
    roads: Object.freeze({
        description: 'Skeletonização + centerline → LineString para vias',
        algorithm: 'Morphological skeleton + centerline extraction',
        ref: 'Lam, Lee, Suen (1992) — Thinning methodologies survey',
    }),
    water: Object.freeze({
        description: 'Morfologia suave + aspect ratio → classifica lake vs river',
        algorithm: 'Morphological smoothing + shape descriptors',
        ref: 'Serra (1982) — Image analysis and mathematical morphology',
    }),
});

/**
 * Adaptador puro: STRATEGIES Record → RegistryEntry[].
 * Conforme contrato `RegistryAdapter<Record<string, any>>`.
 *
 * Mapeamento:
 *   - id: strategy key (vegetation/building/roads/water)
 *   - label: strategy key (sem i18n por enquanto — adicionar futuramente)
 *   - group: 'vectorization' (única categoria atual; expandir quando
 *           outros sub-systems forem surfaceados — CLIP, SAM, etc.)
 *   - meta: {description, algorithm, hasProcessFn} de RECOGNITION_STRATEGY_META
 *           + flag indicando se a fn está realmente plugada (defesa
 *           contra registry incompleto)
 *   - ref: ref bibliográfica do algoritmo (procedência citável FORCE11)
 */
export function recognitionAdapter(
    strategies: Record<string, { process?: Function }> | null | undefined,
): RegistryEntry[] {
    if (!strategies || typeof strategies !== 'object') return [];
    const out: RegistryEntry[] = [];
    for (const key of Object.keys(strategies)) {
        if (typeof key !== 'string' || key.length === 0) continue;
        const s = strategies[key];
        const meta = (RECOGNITION_STRATEGY_META as any)[key] || {
            description: '',
            algorithm: '',
            ref: '',
        };
        const hasProcessFn = !!s && typeof s.process === 'function';
        out.push({
            id: key,
            label: key,
            group: 'vectorization',
            meta: {
                description: meta.description || '',
                algorithm: meta.algorithm || '',
                hasProcessFn,
            },
            ref: meta.ref || '',
        });
    }
    return out;
}

/**
 * Abre catálogo de estratégias de recognition. Lazy-load do registry.
 *
 * RF1 ("Entrada de UI") — catálogo cumpre como descobribilidade.
 * RF3 ("Resultado conversível em elementos/anotações") — fica fora
 * do escopo do catálogo; ação por entrada (onOpen) pode ser
 * acoplada em sessão futura via opts passando handler que invoke
 * `core/recognition/vectorization/engine.ts:vectorize()`.
 */
export async function openRecognitionCatalog(): Promise<void> {
    try {
        const mod = (await import('/js/core/recognition/vectorization/strategies.js' as any)) as any;
        const strategies: Record<string, any> = mod?.STRATEGIES || {};
        const entries = recognitionAdapter(strategies);
        const title = (t ? t('recognitionCatalog.title') : '')
            || `Catálogo de reconhecimento (${entries.length})`;
        openRegistryCatalog({
            entries,
            title,
            csvFilename: 'recognition-strategies',
        });
    }
    catch (e: any) {
        console.debug('[recognitionCatalog] open failed', e?.message || e);
    }
}
