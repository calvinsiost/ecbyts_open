// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   SQL ENGINE — sql.js (SQLite WASM) wrapper
   Motor SQL — wrapper do sql.js para queries client-side

   Carrega sql.js via CDN, cria DB in-memory, popula tabelas do modelo.
   Suporta multiplos modelos simultaneos (max 5) via coluna model_id.
   ================================================================ */
import { importCDN, loadScriptCDN } from '../helpers/cdnLoader.js';
import { loadUncertaintyHubState } from '../../core/uncertainty/hubStore.js';
const MAX_MODELS = 5;
const SQL_JS_VERSION = '1.11.0';
const SQL_JS_CDN = `https://cdn.jsdelivr.net/npm/sql.js@${SQL_JS_VERSION}/dist`;
/** @type {any} */
let _db: any = null;
/** @type {Map<string, string>} */
const _loadedModels = new Map(); // model_id -> model name
/**
 * Initialize sql.js WASM and create in-memory database.
 * Carrega WASM via CDN (~1.4MB), cria DB com schema.
 */
export async function initSqlEngine() {
    if (_db) return;
    // sql.js via CDN - UMD script sets window.initSqlJs
    // loadScriptCDN returns void; access via window after load
    await loadScriptCDN(`${SQL_JS_CDN}/sql-wasm.js`, {
        name: 'sql.js',
        timeout: 30000,
        globalVar: 'initSqlJs',
    }).catch(async () => {
        // Fallback: try esm.sh (ESM build)
        const mod = await importCDN(`https://esm.sh/sql.js@${SQL_JS_VERSION}`, {
            name: 'sql.js-esm',
            timeout: 30000,
        });
        window.initSqlJs = mod.default || mod;
    });
    const _w = window;
    if (typeof _w.initSqlJs !== 'function') {
        throw new Error('sql.js failed to load from CDN');
    }
    const SQL = await _w.initSqlJs({
        locateFile: (file: any) => `${SQL_JS_CDN}/${file}`,
    });
    _db = new SQL.Database();
    _createSchema();
}
/**
 * Execute SQL query and return results.
 * @param {string} sql - SQL query string
 * @returns {Array<{columns: string[], values: any[][]}>}
 */
export function exec(sql: any) {
    if (!_db) throw new Error('SQL engine not initialized');
    return _db.exec(sql);
}
/**
 * Load current in-memory model data into SQLite.
 * Carrega o modelo ativo (em memoria) sem precisar de Supabase.
 */
export async function loadCurrentModelData() {
    if (!_db) return;
    try {
        const { buildModel } = await import('../../core/io/export.js' as string);
        const model = buildModel();
        if (!model) return;
        const modelId = model.modelId || 'current';
        const modelName = model.project?.name || 'Current Model';
        // Remove previous current model data if reloading
        if (_loadedModels.has(modelId)) {
            _removeModelData(modelId);
        }
        await _insertModelData(modelId, modelName, model);
    } catch (e: any) {
        // Never bubble up - the calling _safeInit would swallow the error
        // silently and skip refreshSchema(), leaving the sidebar empty even
        // though the DB may be partially populated. Log + return so the UI
        // pipeline still fires refreshSchema against whatever data was
        // inserted before the failure.
        const _e = e;
        console.debug('[ecbyts:datastudio] loadCurrentModelData failed:', _e?.message || _e, _e?.stack);
    }
}
/**
 * Load a cloud model from Supabase into SQLite.
 * @param {string} supabaseModelId - UUID of the model in Supabase
 * @returns {Promise<boolean>} success
 */
export async function loadCloudModel(supabaseModelId: any) {
    if (!_db) return false;
    if (_loadedModels.size >= MAX_MODELS) {
        throw new Error(`Maximum ${MAX_MODELS} models allowed simultaneously`);
    }
    const { loadModelFromCloud } = await import('../cloud/manager.js' as string);
    const modelData = await loadModelFromCloud(supabaseModelId);
    if (!modelData) return false;
    const modelId = modelData.modelId || supabaseModelId;
    const modelName = modelData.project?.name || `Cloud Model`;
    if (_loadedModels.has(modelId)) {
        _removeModelData(modelId);
    }
    await _insertModelData(modelId, modelName, modelData);
    return true;
}
/**
 * Remove a model's data from SQLite.
 * @param {string} modelId
 */
export function unloadModel(modelId: any) {
    _removeModelData(modelId);
}
/**
 * @returns {number} Number of loaded models
 */
export function getLoadedModelCount() {
    return _loadedModels.size;
}
/**
 * @returns {Array<{id: string, name: string}>} Loaded models
 */
export function getLoadedModels() {
    return Array.from(_loadedModels.entries()).map(([id, name]) => ({ id, name }));
}
/**
 * Get table schema for the Data Studio schema panel.
 * @returns {Array<{name: string, columns: string[]}>}
 */
export function getSchema() {
    if (!_db) return [];
    const tables = _db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    if (!tables.length) return [];
    return tables[0].values.map((entry: any) => {
        const tableName = entry[0];
        const safeName = String(tableName).replace(/"/g, '""');
        const info = _db.exec(`PRAGMA table_info("${safeName}")`);
        const columns = info.length ? info[0].values.map((row: any) => row[1]) : [];
        return { name: tableName, columns };
    });
}
// --- Internal ---
function _createSchema() {
    _db.run(`
        CREATE TABLE IF NOT EXISTS models (
            model_id TEXT PRIMARY KEY,
            name TEXT,
            description TEXT,
            element_count INTEGER DEFAULT 0,
            campaign_count INTEGER DEFAULT 0,
            schema_version INTEGER,
            ecbyts_version TEXT,
            timestamp TEXT
        );

        CREATE TABLE IF NOT EXISTS elements (
            model_id TEXT NOT NULL,
            id TEXT NOT NULL,
            name TEXT,
            family TEXT,
            visible INTEGER DEFAULT 1,
            x REAL,
            y REAL,
            z REAL,
            color TEXT,
            parent_id TEXT,
            PRIMARY KEY (model_id, id)
        );

        CREATE TABLE IF NOT EXISTS observations (
            model_id TEXT NOT NULL,
            element_id TEXT NOT NULL,
            parameter TEXT,
            date TEXT,
            reading REAL,
            unit TEXT,
            x REAL,
            y REAL,
            z REAL
        );

        CREATE TABLE IF NOT EXISTS campaigns (
            model_id TEXT NOT NULL,
            id TEXT NOT NULL,
            name TEXT,
            start_date TEXT,
            end_date TEXT,
            color TEXT,
            visible INTEGER DEFAULT 1,
            PRIMARY KEY (model_id, id)
        );

        CREATE TABLE IF NOT EXISTS edges (
            model_id TEXT NOT NULL,
            from_id TEXT NOT NULL,
            to_id TEXT NOT NULL,
            type TEXT
        );

        CREATE TABLE IF NOT EXISTS scenes (
            model_id TEXT NOT NULL,
            id TEXT NOT NULL,
            name TEXT,
            description TEXT,
            PRIMARY KEY (model_id, id)
        );

        CREATE TABLE IF NOT EXISTS families (
            model_id TEXT NOT NULL,
            id TEXT NOT NULL,
            name TEXT,
            color TEXT,
            icon TEXT,
            meta_json TEXT,
            PRIMARY KEY (model_id, id)
        );

        CREATE TABLE IF NOT EXISTS contracts (
            model_id TEXT NOT NULL,
            id TEXT NOT NULL,
            type TEXT,
            name TEXT,
            value REAL,
            currency TEXT,
            start_date TEXT,
            end_date TEXT,
            meta_json TEXT,
            PRIMARY KEY (model_id, id)
        );

        CREATE TABLE IF NOT EXISTS wbs (
            model_id TEXT NOT NULL,
            id TEXT NOT NULL,
            parent_id TEXT,
            name TEXT,
            level INTEGER,
            cost REAL,
            meta_json TEXT,
            PRIMARY KEY (model_id, id)
        );

        CREATE TABLE IF NOT EXISTS project_registry (
            model_id TEXT NOT NULL,
            id TEXT NOT NULL,
            name TEXT,
            status TEXT,
            meta_json TEXT,
            PRIMARY KEY (model_id, id)
        );

        CREATE TABLE IF NOT EXISTS cost_centers (
            model_id TEXT NOT NULL,
            id TEXT NOT NULL,
            code TEXT,
            name TEXT,
            type TEXT,
            meta_json TEXT,
            PRIMARY KEY (model_id, id)
        );

        CREATE TABLE IF NOT EXISTS groups (
            model_id TEXT NOT NULL,
            id TEXT NOT NULL,
            name TEXT,
            type TEXT,
            member_count INTEGER,
            meta_json TEXT,
            PRIMARY KEY (model_id, id)
        );

        CREATE TABLE IF NOT EXISTS user_constants (
            model_id TEXT NOT NULL,
            id TEXT NOT NULL,
            name TEXT,
            value REAL,
            unit TEXT,
            category TEXT,
            meta_json TEXT,
            PRIMARY KEY (model_id, id)
        );

        CREATE TABLE IF NOT EXISTS user_tools (
            model_id TEXT NOT NULL,
            id TEXT NOT NULL,
            name TEXT,
            description TEXT,
            meta_json TEXT,
            PRIMARY KEY (model_id, id)
        );

        CREATE TABLE IF NOT EXISTS eco_tools (
            model_id TEXT NOT NULL,
            id TEXT NOT NULL,
            name TEXT,
            description TEXT,
            meta_json TEXT,
            PRIMARY KEY (model_id, id)
        );

        CREATE TABLE IF NOT EXISTS libraries (
            model_id TEXT NOT NULL,
            id TEXT NOT NULL,
            name TEXT,
            version TEXT,
            installed INTEGER,
            meta_json TEXT,
            PRIMARY KEY (model_id, id)
        );

        CREATE TABLE IF NOT EXISTS networks (
            model_id TEXT NOT NULL,
            id TEXT NOT NULL,
            name TEXT,
            type TEXT,
            trained INTEGER,
            meta_json TEXT,
            PRIMARY KEY (model_id, id)
        );

        CREATE TABLE IF NOT EXISTS interpolation_layers (
            model_id TEXT NOT NULL,
            id TEXT NOT NULL,
            name TEXT,
            method TEXT,
            parameter TEXT,
            meta_json TEXT,
            PRIMARY KEY (model_id, id)
        );

        CREATE TABLE IF NOT EXISTS storyboard_keyframes (
            model_id TEXT NOT NULL,
            idx INTEGER NOT NULL,
            time REAL,
            action TEXT,
            meta_json TEXT,
            PRIMARY KEY (model_id, idx)
        );

        CREATE TABLE IF NOT EXISTS labels (
            model_id TEXT NOT NULL,
            element_id TEXT,
            text TEXT,
            visible INTEGER DEFAULT 1,
            meta_json TEXT
        );

        CREATE TABLE IF NOT EXISTS taxonomy_bindings (
            model_id TEXT NOT NULL,
            element_id TEXT,
            taxonomy TEXT,
            field TEXT,
            value TEXT,
            meta_json TEXT
        );

        CREATE TABLE IF NOT EXISTS filter_presets (
            model_id TEXT NOT NULL,
            id TEXT NOT NULL,
            name TEXT,
            filter_type TEXT,
            meta_json TEXT,
            PRIMARY KEY (model_id, id)
        );

        CREATE TABLE IF NOT EXISTS model_links (
            model_id TEXT NOT NULL,
            id TEXT NOT NULL,
            target_model_id TEXT,
            relation TEXT,
            meta_json TEXT,
            PRIMARY KEY (model_id, id)
        );

        CREATE TABLE IF NOT EXISTS project_areas (
            model_id TEXT NOT NULL,
            id TEXT NOT NULL,
            name TEXT,
            type TEXT,
            meta_json TEXT,
            PRIMARY KEY (model_id, id)
        );

        CREATE TABLE IF NOT EXISTS ticker_metrics (
            model_id TEXT NOT NULL,
            idx INTEGER NOT NULL,
            metric_id TEXT,
            label TEXT,
            value TEXT,
            meta_json TEXT,
            PRIMARY KEY (model_id, idx)
        );

        CREATE TABLE IF NOT EXISTS model_meta (
            model_id TEXT NOT NULL,
            section TEXT NOT NULL,
            payload_json TEXT,
            PRIMARY KEY (model_id, section)
        );

        CREATE TABLE IF NOT EXISTS uncertainty_hub_state (
            model_id TEXT PRIMARY KEY,
            matrix TEXT,
            project_id TEXT,
            coverage REAL,
            k_default REAL,
            monte_carlo_samples INTEGER,
            q2q_label TEXT,
            exceedance_prob REAL,
            policy_source TEXT,
            decision_action TEXT,
            optimization_selected_count INTEGER,
            executed_at TEXT,
            ecbt_saved_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_elements_model ON elements(model_id);
        CREATE INDEX IF NOT EXISTS idx_observations_model_element ON observations(model_id, element_id);
        CREATE INDEX IF NOT EXISTS idx_observations_parameter ON observations(parameter);
        CREATE INDEX IF NOT EXISTS idx_campaigns_model ON campaigns(model_id);
        CREATE INDEX IF NOT EXISTS idx_edges_model ON edges(model_id);
        CREATE INDEX IF NOT EXISTS idx_wbs_parent ON wbs(model_id, parent_id);
        CREATE INDEX IF NOT EXISTS idx_labels_element ON labels(model_id, element_id);
        CREATE INDEX IF NOT EXISTS idx_taxonomy_element ON taxonomy_bindings(model_id, element_id);
    `);
}
async function _insertModelData(
    modelId: any,
    modelName: string,
    model: any,
) {
    const elements = model.elements || [];
    const campaigns = model.campaigns || [];
    const edges = model.edges || [];
    const scenes = model.scenes || [];
    // Insert model record
    _db.run(
        'INSERT OR REPLACE INTO models (model_id, name, description, element_count, campaign_count, schema_version, ecbyts_version, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
            modelId,
            modelName,
            model.project?.description || '',
            elements.length,
            campaigns.length,
            model.schemaVersion ?? null,
            model.ecbyts ?? null,
            model.timestamp ?? null,
        ],
    );
    // Mark model as loaded immediately after models INSERT succeeds.
    // Previously this ran at end-of-function; if any downstream section threw,
    // _safeInit caught the error and refreshSchema() never fired even though
    // tables were populated - symptom: sidebar empty, all data present.
    _loadedModels.set(modelId, modelName);
    // Insert elements + observations (try/finally to prevent WASM heap leak)
    const stmtEl = _db.prepare(
        'INSERT OR REPLACE INTO elements (model_id, id, name, family, visible, x, y, z, color, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const stmtObs = _db.prepare(
        'INSERT INTO observations (model_id, element_id, parameter, date, reading, unit, x, y, z) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    // Fix 2026-04-11 (click-everything finding): sql.js rejects `undefined` in
    // binds with "Wrong API use : tried to bind a value of an unknown type
    // (undefined)". Wrap every bind row with _safeBind which maps undefined → null.
    // Caused by model elements with missing id/parentId/etc fields in edge cases.
    const _safeBind = (arr: any) => arr.map((v: any) => (v === undefined ? null : v));
    try {
        for (const el of elements) {
            const pos = el.data?.position || {};
            stmtEl.run(
                _safeBind([
                    modelId,
                    el.id ?? null,
                    el.name || '',
                    el.family || '',
                    el.visible !== false ? 1 : 0,
                    pos.x ?? null,
                    pos.y ?? null,
                    pos.z ?? null,
                    el.data?.color || el.meta?.color || '',
                    el.parentId || null,
                ]),
            );
            const obs = el.data?.observations || [];
            for (const o of obs) {
                stmtObs.run(
                    _safeBind([
                        modelId,
                        el.id ?? null,
                        o.parameterId || o.parameter || '',
                        o.date || '',
                        o.value ?? o.reading ?? null,
                        o.unit || '',
                        o.x ?? pos.x ?? null,
                        o.y ?? pos.y ?? null,
                        o.z ?? pos.z ?? null,
                    ]),
                );
            }
        }
    } finally {
        stmtEl.free();
        stmtObs.free();
    }
    // Insert campaigns
    if (campaigns.length) {
        const stmtCamp = _db.prepare(
            'INSERT OR REPLACE INTO campaigns (model_id, id, name, start_date, end_date, color, visible) VALUES (?, ?, ?, ?, ?, ?, ?)',
        );
        try {
            for (const c of campaigns) {
                stmtCamp.run(
                    _safeBind([
                        modelId,
                        c.id ?? null,
                        c.name || '',
                        c.startDate || '',
                        c.endDate || '',
                        c.color || '',
                        c.visible !== false ? 1 : 0,
                    ]),
                );
            }
        } finally {
            stmtCamp.free();
        }
    }
    // Insert edges. Skip rows with missing from/to - the schema has NOT NULL
    // constraints on those FK columns. Inserting null would crash with
    // "NOT NULL constraint failed: edges.from_id" (run 7 click-everything finding).
    // Edges without both endpoints aren't queryable in joins anyway.
    if (edges.length) {
        const stmtEdge = _db.prepare('INSERT INTO edges (model_id, from_id, to_id, type) VALUES (?, ?, ?, ?)');
        try {
            for (const e of edges) {
                if (e.from == null || e.to == null) continue;
                stmtEdge.run(_safeBind([modelId, e.from, e.to, e.type || '']));
            }
        } finally {
            stmtEdge.free();
        }
    }
    // Insert scenes
    if (scenes.length) {
        const stmtScene = _db.prepare(
            'INSERT OR REPLACE INTO scenes (model_id, id, name, description) VALUES (?, ?, ?, ?)',
        );
        try {
            for (const s of scenes) {
                stmtScene.run(_safeBind([modelId, s.id ?? null, s.name || '', s.description || '']));
            }
        } finally {
            stmtScene.free();
        }
    }
    // ----------------------------------------------------------------
    // Payload expansion - populate all ECBT key sections into tables
    // (schema 2026-04-15: map buildModel() completo para SQL)
    //
    // Each section wrapped in _safeSection so a single malformed export
    // shape cannot abort the full model load. Errors log with section
    // name via console.warn for diagnostics.
    // ----------------------------------------------------------------
    const _safeSection = (name: any, fn: () => void) => {
        try {
            fn();
        } catch (e: any) {
            console.warn(`[ecbyts:datastudio] section "${name}" skipped:`, e?.message || e);
        }
    };
    const _toRows = (data: any) => {
        if (Array.isArray(data)) return data;
        if (data && typeof data === 'object') {
            return Object.entries(data).map(([k, v]) =>
                v && typeof v === 'object' ? { id: (v as any).id ?? k, ...v } : { id: k, value: v },
            );
        }
        return [];
    };
    const _json = (obj: any) => {
        try {
            return obj == null ? null : JSON.stringify(obj);
        } catch (e: any) {
            console.debug('[sqlEngine] json-stringify:', e?.message || e);
            return null;
        }
    };
    const _bulkInsert = (
        table: any,
        sql: string,
        rows: any[],
        mapRow: (row: any) => any[],
    ) => {
        if (!rows || !rows.length) return;
        /** @type {any} */
        let stmt = null;
        try {
            stmt = _db.prepare(sql);
            for (const row of rows) {
                try {
                    stmt.run(_safeBind(mapRow(row)));
                } catch (e: any) {
                    console.debug(`[ecbyts:datastudio] ${table} row skipped:`, e?.message);
                }
            }
        } catch (e: any) {
            console.warn(`[ecbyts:datastudio] ${table} bulk insert failed:`, e?.message || e);
        } finally {
            try {
                stmt?.free();
            } catch (e: any) {
                console.debug('[sqlEngine] stmt-free:', e?.message || e);
                /* noop */
            }
        }
    };
    // families (model.families → object map)
    _bulkInsert(
        'families',
        'INSERT OR REPLACE INTO families (model_id, id, name, color, icon, meta_json) VALUES (?, ?, ?, ?, ?, ?)',
        _toRows(model.families),
        (/** @type {any} */ f) => [modelId, f.id ?? '', f.name || f.label || '', f.color || '', f.icon || '', _json(f)],
    );
    // contracts
    _bulkInsert(
        'contracts',
        'INSERT OR REPLACE INTO contracts (model_id, id, type, name, value, currency, start_date, end_date, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        _toRows(model.contracts),
        (/** @type {any} */ c) => [
            modelId,
            c.id ?? '',
            c.type || '',
            c.name || c.title || '',
            Number.isFinite(Number(c.value)) ? Number(c.value) : null,
            c.currency || '',
            c.startDate || c.start_date || '',
            c.endDate || c.end_date || '',
            _json(c),
        ],
    );
    // wbs
    _bulkInsert(
        'wbs',
        'INSERT OR REPLACE INTO wbs (model_id, id, parent_id, name, level, cost, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
        _toRows(model.wbs),
        (/** @type {any} */ w) => [
            modelId,
            w.id ?? '',
            w.parentId || w.parent_id || null,
            w.name || '',
            Number.isInteger(w.level) ? w.level : null,
            Number.isFinite(Number(w.cost)) ? Number(w.cost) : null,
            _json(w),
        ],
    );
    // project_registry
    _bulkInsert(
        'project_registry',
        'INSERT OR REPLACE INTO project_registry (model_id, id, name, status, meta_json) VALUES (?, ?, ?, ?, ?)',
        _toRows(model.projectRegistry),
        (/** @type {any} */ p) => [modelId, p.id ?? '', p.name || '', p.status || '', _json(p)],
    );
    // cost_centers
    _bulkInsert(
        'cost_centers',
        'INSERT OR REPLACE INTO cost_centers (model_id, id, code, name, type, meta_json) VALUES (?, ?, ?, ?, ?, ?)',
        _toRows(model.costCenters),
        (/** @type {any} */ c) => [modelId, c.id ?? '', c.code || '', c.name || '', c.type || '', _json(c)],
    );
    // groups
    _bulkInsert(
        'groups',
        'INSERT OR REPLACE INTO groups (model_id, id, name, type, member_count, meta_json) VALUES (?, ?, ?, ?, ?, ?)',
        _toRows(model.groups),
        (/** @type {any} */ g) => [
            modelId,
            g.id ?? '',
            g.name || '',
            g.type || '',
            Array.isArray(g.members) ? g.members.length : null,
            _json(g),
        ],
    );
    // user_constants
    _bulkInsert(
        'user_constants',
        'INSERT OR REPLACE INTO user_constants (model_id, id, name, value, unit, category, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
        _toRows(model.userConstants),
        (/** @type {any} */ k) => [
            modelId,
            k.id ?? '',
            k.name || '',
            Number.isFinite(Number(k.value)) ? Number(k.value) : null,
            k.unit || '',
            k.category || '',
            _json(k),
        ],
    );
    // user_tools
    _bulkInsert(
        'user_tools',
        'INSERT OR REPLACE INTO user_tools (model_id, id, name, description, meta_json) VALUES (?, ?, ?, ?, ?)',
        _toRows(model.userTools),
        (/** @type {any} */ t) => [modelId, t.id ?? '', t.name || '', t.description || '', _json(t)],
    );
    // eco_tools
    _bulkInsert(
        'eco_tools',
        'INSERT OR REPLACE INTO eco_tools (model_id, id, name, description, meta_json) VALUES (?, ?, ?, ?, ?)',
        _toRows(model.ecoTools),
        (/** @type {any} */ t) => [modelId, t.id ?? '', t.name || '', t.description || '', _json(t)],
    );
    // libraries
    _bulkInsert(
        'libraries',
        'INSERT OR REPLACE INTO libraries (model_id, id, name, version, installed, meta_json) VALUES (?, ?, ?, ?, ?, ?)',
        _toRows(model.libraries),
        (l) => [modelId, l.id ?? '', l.name || '', l.version || '', l.installed !== false ? 1 : 0, _json(l)],
    );
    // networks (nn)
    const nnRows = Array.isArray(model.nn?.networks)
        ? model.nn.networks
        : Array.isArray(model.nn)
          ? model.nn
          : _toRows(model.nn);
    _bulkInsert(
        'networks',
        'INSERT OR REPLACE INTO networks (model_id, id, name, type, trained, meta_json) VALUES (?, ?, ?, ?, ?, ?)',
        nnRows,
        (n) => [modelId, n.id ?? '', n.name || '', n.type || n.kind || '', n.trained ? 1 : 0, _json(n)],
    );
    // interpolation_layers
    const interpLayers = Array.isArray(model.interpolation?.layers)
        ? model.interpolation.layers
        : _toRows(model.interpolation);
    _bulkInsert(
        'interpolation_layers',
        'INSERT OR REPLACE INTO interpolation_layers (model_id, id, name, method, parameter, meta_json) VALUES (?, ?, ?, ?, ?, ?)',
        interpLayers,
        (l) => [
            modelId,
            l.id ?? '',
            l.name || '',
            l.method || l.algorithm || '',
            l.parameter || l.param || '',
            _json(l),
        ],
    );
    // storyboard_keyframes
    const kfs = Array.isArray(model.storyboard?.keyframes) ? model.storyboard.keyframes : [];
    _bulkInsert(
        'storyboard_keyframes',
        'INSERT OR REPLACE INTO storyboard_keyframes (model_id, idx, time, action, meta_json) VALUES (?, ?, ?, ?, ?)',
        kfs.map((k: any, i: any) => ({
            ...k,
            idx: i,
        })),
        (/** @type {any} */ k) => [
            modelId,
            k.idx,
            Number.isFinite(Number(k.time)) ? Number(k.time) : null,
            k.action || k.type || '',
            _json(k),
        ],
    );
    // labels
    _bulkInsert(
        'labels',
        'INSERT INTO labels (model_id, element_id, text, visible, meta_json) VALUES (?, ?, ?, ?, ?)',
        _toRows(model.labels),
        (l) => [
            modelId,
            l.elementId || l.element_id || l.id || null,
            l.text || l.content || '',
            l.visible !== false ? 1 : 0,
            _json(l),
        ],
    );
    // taxonomy_bindings
    _bulkInsert(
        'taxonomy_bindings',
        'INSERT INTO taxonomy_bindings (model_id, element_id, taxonomy, field, value, meta_json) VALUES (?, ?, ?, ?, ?, ?)',
        _toRows(model.taxonomyBindings),
        (b) => [
            modelId,
            b.elementId || b.element_id || null,
            b.taxonomy || b.taxonomyId || '',
            b.field || b.fieldId || '',
            b.value != null ? String(b.value) : '',
            _json(b),
        ],
    );
    // filter_presets
    _bulkInsert(
        'filter_presets',
        'INSERT OR REPLACE INTO filter_presets (model_id, id, name, filter_type, meta_json) VALUES (?, ?, ?, ?, ?)',
        _toRows(model.filterPresets),
        (p) => [modelId, p.id ?? '', p.name || '', p.type || p.filterType || '', _json(p)],
    );
    // model_links
    _bulkInsert(
        'model_links',
        'INSERT OR REPLACE INTO model_links (model_id, id, target_model_id, relation, meta_json) VALUES (?, ?, ?, ?, ?)',
        _toRows(model.modelLinks),
        (l) => [
            modelId,
            l.id ?? '',
            l.targetModelId || l.target_model_id || l.modelId || '',
            l.relation || l.type || '',
            _json(l),
        ],
    );
    // project_areas
    _bulkInsert(
        'project_areas',
        'INSERT OR REPLACE INTO project_areas (model_id, id, name, type, meta_json) VALUES (?, ?, ?, ?, ?)',
        _toRows(model.project?.areas),
        (a) => [modelId, a.id ?? '', a.name || '', a.type || '', _json(a)],
    );
    // ticker_metrics
    const tickerRows = Array.isArray(model.ticker?.metrics) ? model.ticker.metrics : [];
    _bulkInsert(
        'ticker_metrics',
        'INSERT OR REPLACE INTO ticker_metrics (model_id, idx, metric_id, label, value, meta_json) VALUES (?, ?, ?, ?, ?, ?)',
        tickerRows.map((m: any, i: any) => ({
            ...m,
            idx: i,
        })),
        (/** @type {any} */ m) => [
            modelId,
            m.idx,
            m.id || m.metricId || '',
            m.label || '',
            m.value != null ? String(m.value) : '',
            _json(m),
        ],
    );
    // model_meta - singletons (complex nested config)
    const metaSections = {
        project: model.project,
        coordinate: model.coordinate,
        view: model.view,
        sao: model.sao,
        macState: model.macState,
        calculator: model.calculator,
        access: model.access,
        report: model.report,
        classifier: model.classifier,
        professionalValidation: model.professionalValidation,
        corporateIO: model.corporateIO,
        storyboardHeader: model.storyboard ? { ...model.storyboard, keyframes: undefined } : null,
        tickerHeader: model.ticker ? { ...model.ticker, metrics: undefined } : null,
        nnHeader: model.nn && !Array.isArray(model.nn) ? { ...model.nn, networks: undefined } : null,
        interpolationHeader:
            model.interpolation && !Array.isArray(model.interpolation)
                ? { ...model.interpolation, layers: undefined }
                : null,
    };
    _safeSection('model_meta', () => {
        let stmtMeta = null;
        try {
            stmtMeta = _db.prepare(
                'INSERT OR REPLACE INTO model_meta (model_id, section, payload_json) VALUES (?, ?, ?)',
            );
            for (const [section, payload] of Object.entries(metaSections)) {
                if (payload == null) continue;
                const json = _json(payload);
                if (!json) continue;
                try {
                    stmtMeta.run([modelId, section, json]);
                } catch (e: any) {
                    console.debug(`[ecbyts:datastudio] model_meta section "${section}" skipped:`, e?.message);
                }
            }
        } finally {
            try {
                stmtMeta?.free();
            } catch (e: any) {
                console.debug('[sqlEngine] stmtMeta-free:', e?.message || e);
                /* noop */
            }
        }
    });
    // Insert uncertainty hub snapshot (IDB-backed state)
    try {
        const hubState = await loadUncertaintyHubState();
        const pd = hubState?.policyDraft || {};
        const lr = hubState?.lastResults || {};
        const q2q = hubState?.q2qInput || {};
        const di = hubState?.decisionInput || {};
        const selectedCount = Array.isArray(lr?.optimization?.selected) ? lr.optimization.selected.length : 0;
        _db.run(
            `INSERT OR REPLACE INTO uncertainty_hub_state (
                model_id, matrix, project_id, coverage, k_default, monte_carlo_samples,
                q2q_label, exceedance_prob, policy_source, decision_action, optimization_selected_count,
                executed_at, ecbt_saved_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                modelId,
                pd.matrix || 'groundwater',
                pd.project_id || null,
                Number.isFinite(Number(pd.coverage)) ? Number(pd.coverage) : null,
                Number.isFinite(Number(pd.k_default)) ? Number(pd.k_default) : null,
                Number.isFinite(Number(pd.monte_carlo_samples)) ? Number(pd.monte_carlo_samples) : null,
                q2q.label || null,
                Number.isFinite(Number(di.exceedanceProb)) ? Number(di.exceedanceProb) : null,
                lr?.propagation?.policy_source || null,
                lr?.decision?.action || null,
                selectedCount,
                lr?.executedAt || null,
                hubState?.ecbt?.savedAt || null,
            ],
        );
    } catch (e: any) {
        console.warn('[ecbyts:datastudio] uncertainty_hub_state snapshot skipped:', e?.message || e);
    }
    // _loadedModels.set already called right after the models INSERT.
}
function _removeModelData(modelId: string) {
    if (!_db) return;
    const tables = [
        'models',
        'elements',
        'observations',
        'campaigns',
        'edges',
        'scenes',
        'families',
        'contracts',
        'wbs',
        'project_registry',
        'cost_centers',
        'groups',
        'user_constants',
        'user_tools',
        'eco_tools',
        'libraries',
        'networks',
        'interpolation_layers',
        'storyboard_keyframes',
        'labels',
        'taxonomy_bindings',
        'filter_presets',
        'model_links',
        'project_areas',
        'ticker_metrics',
        'model_meta',
        'uncertainty_hub_state',
    ];
    for (const table of tables) {
        _db.run(`DELETE FROM ${table} WHERE model_id = ?`, [modelId]);
    }
    _loadedModels.delete(modelId);
}
