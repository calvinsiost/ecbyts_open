// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   CONSTELLATION PERSISTENCE — layouts salvos do grafo de constelação
   SPEC_CONSTELLATION_HUD_9_75 §13 · KEY-FIRST-001 F2

   KEY-FIRST (SPEC_KEY_FIRST_DATA_LOCALITY §4-F2): o layout é config visual
   DO MODELO do usuário — a fonte primária é a CHAVE ECBT
   (model.constellation.layouts[] via exportConstellationLayouts/
   importConstellationLayouts), NÃO o Supabase. O wire com a tabela
   constellation_layouts foi REMOVIDO neste item (a tabela fica morta no
   banco — não-destrutivo, SPEC §5/§8). localStorage continua como CACHE
   RÁPIDO entre reloads do mesmo browser; a chave vence sempre (importar
   uma chave SUBSTITUI o store). Compartilhar layout entre usuários =
   futuro opt-in via réplica (SPEC §4-F2).
   ================================================================ */
import { createLogger } from '../../utils/helpers/logger.js';
import {
    newLayoutId,
    normalizeLayout,
    upsertLayout,
    summarizeLayouts,
    toKeyPayload,
    fromKeyPayload,
    type ConstellationLayoutRecord,
} from './_layoutsStorePure.js';
const _log = createLogger('constellation:persistence');
// Cache rápido entre reloads (NÃO é a fonte da verdade — a chave ECBT é).
const LOCALSTORAGE_KEY = 'ecbyts-constellation-layouts-v3';
// Chave do formato antigo (layout único pré-F2) — hidratada uma vez como
// migração silenciosa, nunca mais gravada.
const LEGACY_LOCALSTORAGE_KEY = 'ecbyts-constellation-layout-v2';

// Store do modelo vivo. Fonte primária: a chave ECBT (import substitui).
let layouts: ConstellationLayoutRecord[] = [];
let hydrated = false;

function _storage(): any {
    try {
        return (globalThis as any).localStorage ?? null;
    } catch {
        return null; // node/test sem localStorage — cache simplesmente ausente
    }
}

function _persistCache() {
    const ls = _storage();
    if (!ls) return;
    try {
        ls.setItem(LOCALSTORAGE_KEY, JSON.stringify(toKeyPayload(layouts)));
    } catch (e: any) {
        _log.warn('cache localStorage save failed', e?.message);
    }
}

/** Hidrata o store do cache localStorage (1× por sessão, só se o import da
 *  chave ainda não populou). Tolera formato novo (v3) e legado (v2 único). */
function _hydrate() {
    if (hydrated) return;
    hydrated = true;
    const ls = _storage();
    if (!ls) return;
    try {
        const raw = ls.getItem(LOCALSTORAGE_KEY);
        if (raw) {
            layouts = fromKeyPayload(JSON.parse(raw));
            return;
        }
        const legacy = ls.getItem(LEGACY_LOCALSTORAGE_KEY);
        if (legacy) {
            const rec = normalizeLayout(JSON.parse(legacy), { id: 'local' });
            if (rec) layouts = [rec];
        }
    } catch (e: any) {
        _log.warn('cache localStorage load failed', e?.message);
    }
}

// ----------------------------------------------------------------
// Public API — mesmos shapes de antes do F2 (callers intactos)
// ----------------------------------------------------------------
/**
 * Save current layout to the model store (+ localStorage cache).
 * @param {Object} params
 * @param {string} params.name - layout display name
 * @param {string} params.layoutType - 'force-directed' | 'hierarchical' | 'circular' | 'spatial' | 'manual'
 * @param {Object} params.nodePositions - { [nodeId]: { x, y } }
 * @param {Object} [params.viewState] - { zoom, pan, filters, ... }
 * @param {string|null} [params.layoutId] - if provided, updates existing record
 * @returns {Promise<{ok:boolean, id?:string, error?:string}>}
 */
export async function saveConstellationLayout({ name, layoutType, nodePositions, viewState = {}, layoutId = null }: any) {
    _hydrate();
    const now = new Date().toISOString();
    const result = upsertLayout(layouts, { id: layoutId, name, layoutType, nodePositions, viewState }, {
        now,
        genId: () => newLayoutId(Date.now(), Math.random()),
    });
    layouts = result.list;
    _persistCache();
    _log.debug('Layout saved to model store', result.id);
    return { ok: true, id: result.id };
}
/**
 * Load list of saved layouts (mais recente primeiro).
 * @returns {Promise<Array<{id:string,name:string,layout_type:string,created_at:string}>>}
 */
export async function listConstellationLayouts() {
    _hydrate();
    return summarizeLayouts(layouts);
}
/**
 * Load a single layout by ID.
 * @param {string} layoutId
 * @returns {Promise<{ok:boolean, layout?:object, error?:string}>}
 */
export async function getConstellationLayout(layoutId: any) {
    _hydrate();
    const found = layouts.find((l) => l.id === layoutId);
    if (!found) return { ok: false, error: 'not found' };
    return { ok: true, layout: { ...found } };
}
/**
 * Delete a saved layout.
 * @param {string} layoutId
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
export async function deleteConstellationLayout(layoutId: any) {
    _hydrate();
    const before = layouts.length;
    layouts = layouts.filter((l) => l.id !== layoutId);
    if (layouts.length === before) return { ok: false, error: 'not found' };
    _persistCache();
    return { ok: true };
}

// ----------------------------------------------------------------
// KEY-FIRST: ponte com a chave ECBT (core/io/export.ts + import.ts)
// ----------------------------------------------------------------
/** Seção model.constellation da chave: {version, layouts[]}. */
export function exportConstellationLayouts() {
    _hydrate();
    return toKeyPayload(layouts);
}
/** Import da chave SUBSTITUI o store (a chave é a verdade — I1/I4 key-wins)
 *  e regrava o cache. Tolera payload ausente/velho (chaves antigas sem a
 *  seção importam como vazio — forward-compat). */
export function importConstellationLayouts(data: any) {
    layouts = fromKeyPayload(data, { now: new Date().toISOString() });
    hydrated = true; // a chave já populou: não hidratar do cache por cima
    _persistCache();
}
/** Teste/higiene: esvazia o store e o cache (não usado em produção). */
export function _resetConstellationLayoutsForTests() {
    layouts = [];
    hydrated = false;
    const ls = _storage();
    if (ls) {
        try {
            ls.removeItem(LOCALSTORAGE_KEY);
            ls.removeItem(LEGACY_LOCALSTORAGE_KEY);
        } catch (e: any) {
            console.debug('[constellation:persistence] reset cache best-effort', (e as any)?.message || e);
        }
    }
}
