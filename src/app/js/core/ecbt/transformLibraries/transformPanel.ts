// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ECBT Transform Libraries - Phase 6 browser panel contract.
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md S4.
 *
 * This module is intentionally self-contained: callers opt in through
 * initTransformLibraryPanel(), which installs the window handlers and renders
 * a lightweight side panel for library discovery, pipeline ordering, preview,
 * apply, save, undo, and CLI export.
 */
import { applyTransform } from './engine.js';
import { buildHierarchicalDiff, formatDiffTreeText, summarizeDiff } from './diffViewer.js';
import { createPipeline, serializePipeline } from './pipeline.js';
import { getLibrary, isRegistryFrozen, listLibraries, listLibraryTags, registerLibrary } from './registry.js';
import { buildLibraryListItems, buildPipelineSteps, formatLibraryBadge, searchLibraries, validatePipelineConfig, } from './uiHelpers.js';
import { addProvenanceDefaults } from './official/addProvenanceDefaults.js';
import { deduplicateObservations } from './official/deduplicateObservations.js';
import { sortCampaignsByDate } from './official/sortCampaignsByDate.js';
const PANEL_ID = 'ecbt-transform-panel';
const STYLE_ID = 'ecbt-transform-panel-style';
const DEFAULT_INPUT = './model.json';
const DEFAULT_OUTPUT = './model-transformed.json';
const OFFICIAL_LIBRARIES = Object.freeze([sortCampaignsByDate, deduplicateObservations, addProvenanceDefaults]);
/**
 * @typedef {{ libraryId: string, config: Record<string, any> }} PipelineStep
 * @typedef {{
 *   documentRef: any,
 *   windowRef: any,
 *   getModel: any,
 *   applyModel: any,
 *   savePipeline: any,
 *   localStorageRef: any,
 * }} TransformDeps
 * @typedef {{
 *   activeTab: string,
 *   query: string,
 *   tag: string,
 *   selectedLibraryId: string,
 *   selectedConfig: Record<string, any>,
 *   pipelineSteps: Array<PipelineStep>,
 *   lastPreview: any,
 *   lastSnapshot: any,
 *   lastApplied: any,
 *   savedPipeline: any,
 *   deps: TransformDeps,
 * }} TransformState
 */
/** @type {TransformState} */
const state: any = {
    activeTab: 'libraries',
    query: '',
    tag: '',
    selectedLibraryId: '',
    selectedConfig: {},
    pipelineSteps: [],
    lastPreview: null,
    lastSnapshot: null,
    lastApplied: null,
    savedPipeline: null,
    deps: {
        documentRef: null,
        windowRef: null,
        getModel: null,
        applyModel: null,
        savePipeline: null,
        localStorageRef: null,
    },
};
/**
 * @param {any} value
 * @returns {any}
 */
function cloneJson(value: any) {
    if (value == null)
        return value;
    try {
        return JSON.parse(JSON.stringify(value));
    }
    catch (error: any) {
        console.debug('[transformPanel] cloneJson:', error?.message || error);
        return value;
    }
}
/**
 * @param {any} value
 * @returns {string}
 */
function safeString(value: any) {
    return typeof value === 'string' ? value : '';
}
/**
 * @param {any} value
 * @returns {string}
 */
function escapeHtml(value: any) {
    return safeString(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
/**
 * @param {any} value
 * @returns {string}
 */
function compactJson(value: any) {
    try {
        return JSON.stringify(value || {});
    }
    catch (error: any) {
        console.debug('[transformPanel] compactJson:', error?.message || error);
        return '{}';
    }
}
/**
 * @param {any} raw
 * @returns {Record<string, any>}
 */
function parseConfig(raw: any) {
    const text = safeString(raw).trim();
    if (text === '')
        return {};
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new TypeError('config must be a JSON object');
    }
    return parsed;
}
function getDocument() {
    return state.deps.documentRef || (typeof document !== 'undefined' ? document : null);
}
function getWindow() {
    return state.deps.windowRef || (typeof window !== 'undefined' ? window : null);
}
function getLocalStorage() {
    return state.deps.localStorageRef || getWindow()?.localStorage || null;
}
/**
 * @param {any} modelId
 * @returns {Promise<any>}
 */
async function resolveModel(modelId: any) {
    if (typeof state.deps.getModel === 'function') {
        return (state.deps as any).getModel(modelId);
    }
    const win = getWindow();
    if (win?.__ecbtTransformModel)
        return win.__ecbtTransformModel;
    if (typeof win?.buildModel === 'function')
        return win.buildModel();
    return null;
}
/**
 * @param {any} model
 * @param {any} meta
 * @returns {Promise<boolean>}
 */
async function persistModel(model: any, meta: any) {
    if (typeof state.deps.applyModel === 'function') {
        await (state.deps as any).applyModel(model, meta);
        return true;
    }
    const win = getWindow();
    if (win) {
        win.__ecbtTransformModel = model;
        return true;
    }
    return false;
}
/**
 * @param {any} libraryId
 * @param {any} config
 * @returns {Array<PipelineStep>}
 */
function getSelectedSteps(libraryId: any, config: any) {
    if (Array.isArray(state.pipelineSteps) && state.pipelineSteps.length > 0) {
        return state.pipelineSteps.map((step: any) => ({
            libraryId: step.libraryId,
            config: step.config && typeof step.config === 'object' ? { ...step.config } : {},
        }));
    }
    if (!libraryId)
        return [];
    return [{ libraryId, config: config && typeof config === 'object' ? { ...config } : {} }];
}
/**
 * @param {any} steps
 * @returns {any}
 */
function validateKnownSteps(steps: any) {
    return validatePipelineConfig(steps, { getLibrary });
}
/**
 * @param {any} code
 * @param {any} message
 * @param {any} [details]
 * @returns {any}
 */
function buildErrorResult(code: any, message: any, details: any = {}) {
    return {
        ok: false,
        model: null,
        audit: null,
        audits: [],
        errors: [{ code, message, details }],
        diff: null,
        summaryLines: [],
    };
}
export function bootstrapTransformPanelLibraries() {
    /** @type {string[]} */
    const warnings = [];
    for (const library of OFFICIAL_LIBRARIES) {
        if (getLibrary(library.id))
            continue;
        if (isRegistryFrozen()) {
            warnings.push(`registry frozen before official library registration: ${library.id}`);
            continue;
        }
        try {
            registerLibrary(library);
        }
        catch (error: any) {
            const err = error;
            if (!String(err?.message || '').includes('already registered')) {
                warnings.push(error instanceof Error ? error.message : String(error));
            }
        }
    }
    return { libraries: listLibraries(), warnings };
}
/**
 * @param {any} modelId
 * @param {any} libraryId
 * @param {any} [config]
 * @returns {Promise<any>}
 */
export async function handlePreviewTransform(modelId: any, libraryId: any, config: any = {}) {
    bootstrapTransformPanelLibraries();
    const model = await resolveModel(modelId);
    if (!model || typeof model !== 'object' || Array.isArray(model)) {
        return buildErrorResult('MODEL_NOT_AVAILABLE', 'No ECBT model is available for transform preview', { modelId });
    }
    const steps = getSelectedSteps(libraryId, config);
    if (steps.length === 0) {
        return buildErrorResult('NO_TRANSFORM_SELECTED', 'Select at least one transform library', { modelId });
    }
    const validation = validateKnownSteps(steps);
    if (!validation.valid) {
        return buildErrorResult('INVALID_PIPELINE', 'Transform pipeline is invalid', validation);
    }
    const before = cloneJson(model);
    /** @type {any} */
    let result;
    if (steps.length === 1) {
        const library = getLibrary(steps[0]!.libraryId);
        if (!library) {
            return buildErrorResult('UNKNOWN_LIBRARY', `library not registered: ${steps[0]!.libraryId}`, { steps });
        }
        result = await Promise.resolve(applyTransform(before, library, steps[0].config));
    }
    else {
        const pipeline = createPipeline(steps);
        result = await pipeline.run(before);
    }
    const after = result.model || before;
    const diff = buildHierarchicalDiff(before, after);
    const preview = {
        ok: !Array.isArray((result as any).errors) || (result as any).errors.length === 0,
        model: after,
        audit: (result as any).audit || null,
        audits: (result as any).audits || ((result as any).audit ? [(result as any).audit] : []),
        errors: (result as any).errors || [],
        telemetry: (result as any).telemetry || null,
        warnings: validation.warnings,
        diff,
        diffText: formatDiffTreeText(diff),
        summaryLines: summarizeDiff(diff),
        steps,
    };
    state.lastPreview = preview;
    renderTransformPanel();
    return preview;
}
/**
 * @param {any} modelId
 * @param {any} libraryId
 * @param {any} [config]
 * @returns {Promise<any>}
 */
export async function handleApplyTransform(modelId: any, libraryId: any, config: any = {}) {
    const model = await resolveModel(modelId);
    if (!model || typeof model !== 'object' || Array.isArray(model)) {
        return buildErrorResult('MODEL_NOT_AVAILABLE', 'No ECBT model is available for transform apply', { modelId });
    }
    const preview = await handlePreviewTransform(modelId, libraryId, config);
    if (!preview.ok)
        return preview;
    state.lastSnapshot = cloneJson(model);
    state.lastApplied = {
        modelId,
        appliedAt: new Date().toISOString(),
        steps: (preview as any).steps,
        diff: preview.diff,
    };
    await persistModel(preview.model, { source: 'ecbt-transform-panel', modelId, steps: (preview as any).steps });
    renderTransformPanel();
    return { ...preview, applied: true };
}
/**
 * @param {any} modelId
 * @param {any[]} [stepConfigs]
 * @returns {Promise<any>}
 */
export async function handleComposeTransforms(modelId: any, stepConfigs: any = []) {
    state.pipelineSteps = Array.isArray(stepConfigs)
        ? stepConfigs.map((step: any) => ({
            libraryId: String(step?.libraryId || ''),
            config: step?.config && typeof step.config === 'object' ? { ...step.config } : {},
        }))
        : [];
    /** @type {any} */
    const first = state.pipelineSteps[0];
    return handlePreviewTransform(modelId, first?.libraryId || '', first?.config || {});
}
/**
 * @param {any} [modelId]
 * @returns {Promise<any>}
 */
export async function handleUndoTransform(modelId: any) {
    if (!state.lastSnapshot) {
        return buildErrorResult('NO_SNAPSHOT', 'No transform snapshot is available to restore', { modelId });
    }
    const snapshot = cloneJson(state.lastSnapshot);
    await persistModel(snapshot, { source: 'ecbt-transform-panel-undo', modelId });
    state.lastSnapshot = null;
    state.lastPreview = null;
    renderTransformPanel();
    return { ok: true, model: snapshot, restored: true, errors: [] };
}
/**
 * @param {any[]} [steps]
 * @param {Record<string, any>} [options]
 * @returns {string}
 */
export function buildTransformCliCommand(steps: any = state.pipelineSteps, options: any = {}) {
    const safeSteps = Array.isArray(steps) && steps.length > 0
        ? steps
        : getSelectedSteps(state.selectedLibraryId, state.selectedConfig);
    const input = escapeCliArg(options.input || DEFAULT_INPUT);
    const output = escapeCliArg(options.output || DEFAULT_OUTPUT);
    if (safeSteps.length === 1) {
        const step = safeSteps[0];
        const config = compactJson(step.config || {});
        return `node scripts/ecbt-transform.mjs --input ${input} --apply ${escapeCliArg(step.libraryId)} --config ${escapeCliArg(config)} --output ${output}`;
    }
    const pipelinePath = escapeCliArg(options.pipeline || './pipeline.json');
    return `node scripts/ecbt-transform.mjs --input ${input} --pipeline ${pipelinePath} --output ${output}`;
}
/**
 * @param {any} value
 * @returns {string}
 */
function escapeCliArg(value: any) {
    const text = String(value ?? '');
    if (/^[A-Za-z0-9_./:@-]+$/.test(text))
        return text;
    return `'${text.replaceAll("'", "''")}'`;
}
export function saveCurrentPipeline() {
    const steps = state.pipelineSteps.length > 0
        ? state.pipelineSteps
        : getSelectedSteps(state.selectedLibraryId, state.selectedConfig);
    const pipeline = serializePipeline(createPipeline(steps), { source: 'ecbt-transform-panel' });
    state.savedPipeline = pipeline;
    if (typeof state.deps.savePipeline === 'function') {
        state.deps.savePipeline(pipeline);
    }
    else {
        try {
            getLocalStorage()?.setItem('ecbt-transform-panel:lastPipeline', JSON.stringify(pipeline));
        }
        catch (error: any) {
            console.debug('[transformPanel] saveCurrentPipeline:', error?.message || error);
        }
    }
    renderTransformPanel();
    return pipeline;
}
/**
 * @param {any} doc
 */
function ensureStyles(doc: any) {
    if (!doc?.createElement || !doc?.head || doc.getElementById?.(STYLE_ID))
        return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        #${PANEL_ID} {
            position: fixed;
            top: 48px;
            right: 0;
            bottom: 0;
            width: min(420px, 96vw);
            z-index: 80;
            background: var(--surface-1, #101820);
            color: var(--text-color, #eef2f7);
            border-left: 1px solid var(--border-color, #2d3a46);
            box-shadow: -8px 0 24px rgba(0, 0, 0, 0.24);
            display: flex;
            flex-direction: column;
            font: 13px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        #${PANEL_ID}[hidden] { display: none; }
        #${PANEL_ID} .ecbt-transform-header,
        #${PANEL_ID} .ecbt-transform-actions {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 12px;
            border-bottom: 1px solid var(--border-color, #2d3a46);
        }
        #${PANEL_ID} .ecbt-transform-title { flex: 1; font-weight: 700; }
        #${PANEL_ID} .ecbt-transform-tabs { display: flex; border-bottom: 1px solid var(--border-color, #2d3a46); }
        #${PANEL_ID} button,
        #${PANEL_ID} select,
        #${PANEL_ID} input,
        #${PANEL_ID} textarea {
            font: inherit;
        }
        #${PANEL_ID} button {
            border: 1px solid var(--border-color, #2d3a46);
            background: var(--surface-2, #182430);
            color: inherit;
            border-radius: 6px;
            padding: 5px 8px;
            cursor: pointer;
        }
        #${PANEL_ID} button[aria-selected="true"],
        #${PANEL_ID} button[data-primary="true"] {
            border-color: var(--accent, #38bdf8);
        }
        #${PANEL_ID} .ecbt-transform-tabs button {
            flex: 1;
            border: 0;
            border-radius: 0;
            border-right: 1px solid var(--border-color, #2d3a46);
        }
        #${PANEL_ID} .ecbt-transform-body { overflow: auto; padding: 12px; flex: 1; }
        #${PANEL_ID} .ecbt-transform-toolbar { display: grid; grid-template-columns: 1fr auto; gap: 8px; margin-bottom: 10px; }
        #${PANEL_ID} input,
        #${PANEL_ID} select,
        #${PANEL_ID} textarea {
            width: 100%;
            box-sizing: border-box;
            border: 1px solid var(--border-color, #2d3a46);
            border-radius: 6px;
            background: var(--surface-0, #0b1117);
            color: inherit;
            padding: 7px 8px;
        }
        #${PANEL_ID} .ecbt-transform-list { display: grid; gap: 8px; }
        #${PANEL_ID} .ecbt-transform-card {
            border: 1px solid var(--border-color, #2d3a46);
            border-radius: 8px;
            padding: 9px;
            background: var(--surface-2, #182430);
        }
        #${PANEL_ID} .ecbt-transform-card h4 { margin: 0 0 4px; font-size: 13px; }
        #${PANEL_ID} .ecbt-transform-muted { color: var(--text-muted, #9aa9b7); }
        #${PANEL_ID} .ecbt-transform-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
        #${PANEL_ID} .ecbt-transform-tag { border: 1px solid var(--border-color, #2d3a46); border-radius: 999px; padding: 1px 6px; }
        #${PANEL_ID} .ecbt-transform-config { min-height: 86px; resize: vertical; margin-top: 8px; }
        #${PANEL_ID} pre { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; }
    `;
    doc.head.appendChild(style);
}
/**
 * @param {any} doc
 * @returns {any}
 */
function ensurePanel(doc: any) {
    if (!doc?.createElement || !doc?.body)
        return null;
    ensureStyles(doc);
    let panel = doc.getElementById?.(PANEL_ID);
    if (!panel) {
        panel = doc.createElement('aside');
        panel.id = PANEL_ID;
        panel.setAttribute('role', 'complementary');
        panel.setAttribute('aria-label', 'ECBT transform libraries');
        doc.body.appendChild(panel);
    }
    if (!panel.dataset?.bound) {
        bindPanelEvents(panel);
        if (panel.dataset)
            panel.dataset.bound = '1';
    }
    return panel;
}
/**
 * @param {any} panel
 */
function bindPanelEvents(panel: any) {
    panel.addEventListener?.("click", (event: any) => {
        const target = event.target?.closest?.('[data-action]');
        if (!target)
            return;
        const action = target.getAttribute('data-action');
        if (action === 'close') {
            panel.hidden = true;
            return;
        }
        if (action === 'tab') {
            state.activeTab = target.getAttribute('data-tab') || 'libraries';
            renderTransformPanel();
            return;
        }
        if (action === 'select-library') {
            state.selectedLibraryId = target.getAttribute('data-library-id') || '';
            state.activeTab = 'libraries';
            renderTransformPanel();
            return;
        }
        if (action === 'add-step') {
            const libraryId = state.selectedLibraryId || target.getAttribute('data-library-id') || '';
            if (libraryId)
                state.pipelineSteps.push({ libraryId, config: { ...state.selectedConfig } });
            state.activeTab = 'pipeline';
            renderTransformPanel();
            return;
        }
        if (action === 'remove-step') {
            const index = Number(target.getAttribute('data-index'));
            if (Number.isInteger(index))
                state.pipelineSteps.splice(index, 1);
            renderTransformPanel();
            return;
        }
        if (action === 'move-step') {
            const index = Number(target.getAttribute('data-index'));
            const delta = Number(target.getAttribute('data-delta'));
            const next = index + delta;
            if (Number.isInteger(index) && Number.isInteger(next) && next >= 0 && next < state.pipelineSteps.length) {
                const [step] = state.pipelineSteps.splice(index, 1);
                state.pipelineSteps.splice(next, 0, step);
            }
            renderTransformPanel();
            return;
        }
        if (action === 'preview') {
            handlePreviewTransform(undefined, state.selectedLibraryId, state.selectedConfig);
            return;
        }
        if (action === 'apply') {
            handleApplyTransform(undefined, state.selectedLibraryId, state.selectedConfig);
            return;
        }
        if (action === 'save-pipeline') {
            saveCurrentPipeline();
            return;
        }
        if (action === 'undo') {
            handleUndoTransform(state.lastApplied?.modelId);
            return;
        }
        if (action === 'export-cli') {
            state.lastPreview = {
                ok: true,
                diffText: buildTransformCliCommand(),
                summaryLines: ['CLI command exported'],
                errors: [],
            };
            state.activeTab = 'preview';
            renderTransformPanel();
        }
    });
    panel.addEventListener?.("input", (event: any) => {
        const target = event.target;
        const action = target?.getAttribute?.('data-action');
        if (action === 'search') {
            state.query = target.value || '';
            renderTransformPanel();
            return;
        }
        if (action === 'config') {
            try {
                state.selectedConfig = parseConfig(target.value);
                target.removeAttribute?.('aria-invalid');
            }
            catch (error: any) {
                console.debug('[transformPanel] parseConfig:', error?.message || error);
                target.setAttribute?.('aria-invalid', 'true');
            }
        }
    });
    panel.addEventListener?.("change", (event: any) => {
        const target = event.target;
        if (target?.getAttribute?.('data-action') === 'tag-filter') {
            state.tag = target.value || '';
            renderTransformPanel();
        }
    });
}
export function renderTransformPanel() {
    const doc = getDocument();
    if (!doc)
        return null;
    const panel = ensurePanel(doc);
    if (!panel)
        return null;
    panel.hidden = false;
    bootstrapTransformPanelLibraries();
    const libraries = listLibraries();
    if (!state.selectedLibraryId && libraries[0])
        state.selectedLibraryId = libraries[0].id;
    panel.innerHTML = `
        <div class="ecbt-transform-header">
            <div class="ecbt-transform-title">Transform Libraries</div>
            <button type="button" data-action="close" aria-label="Close transform panel">Close</button>
        </div>
        <div class="ecbt-transform-tabs" role="tablist" aria-label="Transform library tabs">
            ${renderTabButton('libraries', 'Libraries')}
            ${renderTabButton('pipeline', 'Pipeline')}
            ${renderTabButton('preview', 'Preview')}
        </div>
        <div class="ecbt-transform-body">
            ${renderActiveTab()}
        </div>
        <div class="ecbt-transform-actions">
            <button type="button" data-action="preview">Preview</button>
            <button type="button" data-action="apply" data-primary="true">Apply</button>
            <button type="button" data-action="save-pipeline">Save Pipeline</button>
            <button type="button" data-action="undo">Undo</button>
            <button type="button" data-action="export-cli">Export</button>
        </div>
    `;
    return panel;
}
/**
 * @param {any} tab
 * @param {any} label
 * @returns {string}
 */
function renderTabButton(tab: any, label: any) {
    const selected = state.activeTab === tab ? 'true' : 'false';
    return `<button type="button" role="tab" aria-selected="${selected}" data-action="tab" data-tab="${tab}">${label}</button>`;
}
function renderActiveTab() {
    if (state.activeTab === 'pipeline')
        return renderPipelineTab();
    if (state.activeTab === 'preview')
        return renderPreviewTab();
    return renderLibrariesTab();
}
function renderLibrariesTab() {
    const tagOptions = Array.from(listLibraryTags()).sort();
    let visible = searchLibraries(listLibraries(), state.query);
    if (state.tag)
        visible = visible.filter((/** @type {any} */ lib) => Array.isArray(lib.tags) && lib.tags.includes(state.tag));
    const items = buildLibraryListItems(visible, { sortBy: 'name' });
    const selected = getLibrary(state.selectedLibraryId);
    return `
        <div class="ecbt-transform-toolbar">
            <input type="search" data-action="search" aria-label="Search transform libraries" value="${escapeHtml(state.query)}" placeholder="Search libraries">
            <select data-action="tag-filter" aria-label="Filter transform libraries by tag">
                <option value="">All tags</option>
                ${tagOptions.map((tag: any) => `<option value="${escapeHtml(tag)}" ${tag === state.tag ? 'selected' : ''}>${escapeHtml(tag)}</option>`).join('')}
            </select>
        </div>
        <div class="ecbt-transform-list" data-testid="transform-library-list">
            ${items.map(renderLibraryCard).join('') || '<div class="ecbt-transform-muted">No libraries match the current filter.</div>'}
        </div>
        ${selected ? renderSelectedLibrary(selected) : ''}
    `;
}
/**
 * @param {any} item
 * @returns {string}
 */
function renderLibraryCard(item: any) {
    const selected = item.id === state.selectedLibraryId ? 'true' : 'false';
    return `
        <section class="ecbt-transform-card" data-library-id="${escapeHtml(item.id)}" aria-selected="${selected}">
            <h4>${escapeHtml(item.name)}</h4>
            <div class="ecbt-transform-muted">${escapeHtml(item.description)}</div>
            <div class="ecbt-transform-tags">
                <span class="ecbt-transform-tag">${escapeHtml(item.type)}</span>
                <span class="ecbt-transform-tag">${escapeHtml(item.version)}</span>
                ${item.tags.map((tag: any) => `<span class="ecbt-transform-tag">${escapeHtml(tag)}</span>`).join('')}
            </div>
            <button type="button" data-action="select-library" data-library-id="${escapeHtml(item.id)}">Select</button>
        </section>
    `;
}
/**
 * @param {any} library
 * @returns {string}
 */
function renderSelectedLibrary(library: any) {
    return `
        <section class="ecbt-transform-card" data-testid="selected-transform-library">
            <h4>Selected: ${escapeHtml(library.name || library.id)}</h4>
            <div class="ecbt-transform-muted">${escapeHtml(library.description || '')}</div>
            <div class="ecbt-transform-tags">
                <span class="ecbt-transform-tag">${escapeHtml(formatLibraryBadge(library))}</span>
                ${(library.tags || []).map((tag: any) => `<span class="ecbt-transform-tag">${escapeHtml(tag)}</span>`).join('')}
            </div>
            <textarea class="ecbt-transform-config" data-action="config" aria-label="Transform config JSON">${escapeHtml(compactJson(state.selectedConfig))}</textarea>
            <button type="button" data-action="add-step" data-library-id="${escapeHtml(library.id)}">Add to Pipeline</button>
        </section>
    `;
}
function renderPipelineTab() {
    const steps = buildPipelineSteps({ steps: state.pipelineSteps });
    const validation = validateKnownSteps(state.pipelineSteps);
    return `
        <div class="ecbt-transform-muted">${state.pipelineSteps.length} step(s) selected.</div>
        ${validation.errors.length > 0 ? `<pre>${escapeHtml(JSON.stringify(validation.errors, null, 2))}</pre>` : ''}
        <div class="ecbt-transform-list" data-testid="transform-pipeline-list">
            ${steps.map(renderPipelineStep).join('') || '<div class="ecbt-transform-muted">Add a library to start a pipeline.</div>'}
        </div>
    `;
}
/**
 * @param {any} step
 * @returns {string}
 */
function renderPipelineStep(step: any) {
    return `
        <section class="ecbt-transform-card">
            <h4>${step.index + 1}. ${escapeHtml(step.libraryId)}</h4>
            <div class="ecbt-transform-muted">Config keys: ${step.configKeys.map(escapeHtml).join(', ') || 'none'}</div>
            <button type="button" data-action="move-step" data-index="${step.index}" data-delta="-1">Up</button>
            <button type="button" data-action="move-step" data-index="${step.index}" data-delta="1">Down</button>
            <button type="button" data-action="remove-step" data-index="${step.index}">Remove</button>
        </section>
    `;
}
function renderPreviewTab() {
    if (!state.lastPreview) {
        return '<div class="ecbt-transform-muted">Run Preview to inspect the before/after diff.</div>';
    }
    /** @type {any} */
    const lastPreview = state.lastPreview;
    const status = lastPreview.ok ? 'Ready' : 'Blocked';
    /** @type {any[]} */
    const lines = lastPreview.summaryLines || [];
    const errorText = lastPreview.errors?.length ? JSON.stringify(lastPreview.errors, null, 2) : '';
    return `
        <section class="ecbt-transform-card">
            <h4>${status}</h4>
            <div>${lines.map((line: any) => `<div>${escapeHtml(line)}</div>`).join('')}</div>
        </section>
        ${errorText ? `<pre>${escapeHtml(errorText)}</pre>` : ''}
        <pre data-testid="transform-diff-preview">${escapeHtml(lastPreview.diffText || '')}</pre>
    `;
}
/**
 * @param {Record<string, any>} [options]
 * @returns {any}
 */
export function handleOpenTransformPanel(options: any = {}) {
    if (options && typeof options === 'object') {
        initTransformLibraryPanel(options);
    }
    else {
        initTransformLibraryPanel();
    }
    state.activeTab = 'libraries';
    return renderTransformPanel();
}
/**
 * @param {Record<string, any>} [options]
 * @returns {any}
 */
export function initTransformLibraryPanel(options: any = {}) {
    bootstrapTransformPanelLibraries();
    state.deps = {
        ...state.deps,
        documentRef: options.documentRef || state.deps.documentRef,
        windowRef: options.windowRef || state.deps.windowRef,
        getModel: options.getModel || state.deps.getModel,
        applyModel: options.applyModel || state.deps.applyModel,
        savePipeline: options.savePipeline || state.deps.savePipeline,
        localStorageRef: options.localStorageRef || state.deps.localStorageRef,
    };
    if (Array.isArray(options.pipelineSteps)) {
        state.pipelineSteps = options.pipelineSteps.map((step: any) => ({
            libraryId: String(step?.libraryId || ''),
            config: step?.config && typeof step.config === 'object' ? { ...step.config } : {}
        }));
    }
    if (options.selectedLibraryId)
        state.selectedLibraryId = String(options.selectedLibraryId);
    if (options.selectedConfig && typeof options.selectedConfig === 'object') {
        state.selectedConfig = { ...options.selectedConfig };
    }
    const win = getWindow();
    if (win) {
        win.handleOpenTransformPanel = handleOpenTransformPanel;
        win.handlePreviewTransform = handlePreviewTransform;
        win.handleApplyTransform = handleApplyTransform;
        win.handleComposeTransforms = handleComposeTransforms;
        win.handleUndoTransform = handleUndoTransform;
    }
    return {
        open: handleOpenTransformPanel,
        preview: handlePreviewTransform,
        apply: handleApplyTransform,
        compose: handleComposeTransforms,
        undo: handleUndoTransform,
        render: renderTransformPanel,
        getState: () => ({
            activeTab: state.activeTab,
            selectedLibraryId: state.selectedLibraryId,
            pipelineSteps: cloneJson(state.pipelineSteps),
            lastPreview: state.lastPreview,
            lastApplied: state.lastApplied,
            savedPipeline: state.savedPipeline,
        }),
    };
}
export const ecbtTransformPanelMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES',
    phase: 6,
    deliveredAt: '2026-05-02',
    exports: [
        'bootstrapTransformPanelLibraries',
        'initTransformLibraryPanel',
        'handleOpenTransformPanel',
        'handlePreviewTransform',
        'handleApplyTransform',
        'handleComposeTransforms',
        'handleUndoTransform',
        'renderTransformPanel',
        'buildTransformCliCommand',
    ],
    browserHandlers: [
        'window.handleOpenTransformPanel',
        'window.handlePreviewTransform',
        'window.handleApplyTransform',
        'window.handleComposeTransforms',
        'window.handleUndoTransform',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
