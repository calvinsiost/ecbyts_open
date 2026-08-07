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
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   REPORT MANAGER — Multi-report system with folder hierarchy
   Gerenciador de multiplos relatorios com organizacao por pastas

   Suporta multiplos relatorios organizados em pastas (ate 4 niveis).
   Cada relatorio: { id, folderId, title, content, lastModified }
   Cada pasta:     { id, name, parentId }

   Pasta default "Geral" criada automaticamente na inicializacao.
   Estado mantido em closure do modulo (padrao groups/manager).
   Persistencia via localStorage + export/import do modelo.
   ================================================================ */
// ----------------------------------------------------------------
// MODULE STATE
// Estado do modulo - closure privada
// ----------------------------------------------------------------
import { isEphemeral } from '../storage/storageMonitor.js';
import { idbSet, idbGetWithLegacy, idbDelete } from '../storage/idbStore.js';
import { showToast as _showToastImpl } from '../ui/toast.js';
import {
    createDeferredIdlePersistence,
    type DeferredIdlePersistenceController,
} from '../performance/deferredIdlePersistence.js';
// Adopt own pure helpers (Module C extraction commit eb02f7fd) — folder tree ops.
import {
    computeFolderDepth,
    collectFolderSubtree,
    getChildFolders as _getChildFoldersPure,
    getRootFolders as _getRootFoldersPure,
} from './_folderTreePure.js';
const showToast = _showToastImpl;
const STORAGE_KEY = 'ecbyts-reports';
const MAX_REPORTS = 20;
const MAX_DEPTH = 4;
const REPORT_PERSIST_DEBOUNCE_MS = 1500;
const REPORT_PERSIST_AFTER_BOOT_DELAY_MS = 30000;
const REPORT_PERSIST_IDLE_TIMEOUT_MS = 3000;
/** @type {Array<{id: string, name: string, parentId: string|null}>} */
let folders: any[] = [];
/** @type {Array<{id: string, folderId: string, title: string, content: string, lastModified: string|null}>} */
let reports: any[] = [];
/** @type {string|null} */
let activeReportId: any = null;
/** @type {number} Monotonic counter for unique IDs */
let counter = 0;
let _persistScheduler: DeferredIdlePersistenceController | null = null;
let _lastPersistSignature = '';
// ----------------------------------------------------------------
// ID GENERATION
// Gera IDs unicos monotonico-crescentes
// ----------------------------------------------------------------
/**
 * @private
 * @param {string} prefix
 * @returns {string}
 */
function _nextId(prefix: any) {
    counter++;
    return `${prefix}-${counter}`;
}
// ----------------------------------------------------------------
// INITIALIZATION
// Carrega relatorios salvos no localStorage
// ----------------------------------------------------------------
/**
 * Initialize reports from localStorage.
 * Carrega estado salvo ou cria pasta default com relatorio vazio.
 */
export async function initReport() {
    try {
        const parsed = await idbGetWithLegacy(STORAGE_KEY);
        if (parsed) {
            folders = Array.isArray(parsed.folders) ? parsed.folders : [];
            reports = Array.isArray(parsed.reports) ? parsed.reports : [];
            activeReportId = parsed.activeReportId || null;
            counter = parsed.counter || 0;
            _lastPersistSignature = _getReportPersistSignature();
        }
    } catch (e: any) {
        console.error('Failed to load reports from IDB:', e);
    }
    // Garante pelo menos uma pasta e um relatorio
    if (folders.length === 0) {
        const fId = _nextId('folder');
        folders.push({ id: fId, name: 'Geral', parentId: null });
        if (reports.length === 0) {
            const rId = _nextId('rpt');
            reports.push({ id: rId, folderId: fId, title: '', content: '', lastModified: null });
            activeReportId = rId;
        }
        _persist();
    }
    // Garante que activeReportId aponta para relatorio existente
    if (!activeReportId || !reports.find((r: any) => r.id === activeReportId)) {
        activeReportId = reports.length > 0 ? reports[0].id : null;
        _persist();
    }
}
// ----------------------------------------------------------------
// PERSISTENCE
// Salva estado no localStorage e dispara evento
// ----------------------------------------------------------------
/** @private */
async function _persist() {
    if (!isEphemeral()) {
        _scheduleReportPersist();
    }
    window.dispatchEvent(new CustomEvent('reportChanged'));
}

function _buildReportPersistPayload() {
    return {
        folders: folders.map((folder: any) => ({ ...folder })),
        reports: reports.map((report: any) => ({ ...report })),
        activeReportId,
        counter,
    };
}

function _getReportPersistSignature(payload = _buildReportPersistPayload()) {
    try {
        return JSON.stringify(payload);
    } catch {
        return `reports:${folders.length}:${reports.length}:${activeReportId || ''}:${counter}`;
    }
}

function _getReportPersistScheduler() {
    if (!_persistScheduler) {
        _persistScheduler = createDeferredIdlePersistence({
            debounceMs: REPORT_PERSIST_DEBOUNCE_MS,
            bootDelayMs: REPORT_PERSIST_AFTER_BOOT_DELAY_MS,
            idleTimeoutMs: REPORT_PERSIST_IDLE_TIMEOUT_MS,
            flush: _flushReportPersist,
            onError: (error) => {
                console.debug('[utils/report/manager:persist-idle]', (error as any)?.message || error);
            },
        });
    }
    return _persistScheduler;
}

function _scheduleReportPersist() {
    _getReportPersistScheduler().schedule();
}

async function _flushReportPersist() {
    _persistScheduler?.clear();
    const payload = _buildReportPersistPayload();
    const signature = _getReportPersistSignature(payload);
    if (signature === _lastPersistSignature) return true;
    const ok = await idbSet(STORAGE_KEY, payload);
    if (ok) _lastPersistSignature = signature;
    if (!ok) showToast('Storage full. Report data may not persist.', 'warning');
    return ok;
}
// ----------------------------------------------------------------
// LIBRARY EXTENSIBILITY — CONSIST-OBS-001 S4 (modelo B1: declarativo)
// ----------------------------------------------------------------

/**
 * Templates de relatório registrados por libraries (declarativo: id, título,
 * HTML inicial estático e/ou lista de seções nomeadas — SEM código).
 * Map<key, template> com key namespaced `lib:<libraryId>:<templateId>`.
 */
const _libraryReportTemplates = new Map<string, any>();

/**
 * Register a report template from a library manifest (data-only, B1).
 * Registra um template de relatório declarativo de library — consumível por
 * "novo relatório a partir de template" (título + conteúdo HTML inicial são
 * sanitizados pelo fluxo padrão de criação; nenhuma função é aceita).
 *
 * @param {{ id: string, title: string, contentHtml?: string, sections?: string[] }} template
 * @param {string} template
 * @returns {string|null} chave registrada ou null se inválido
 */
export function registerReportTemplate(template: any, libraryId: any) {
    if (!template || typeof template.id !== 'string' || !template.id.trim()) return null;
    if (typeof template.title !== 'string' || !template.title.trim()) return null;
    if (template.contentHtml !== undefined && typeof template.contentHtml !== 'string') return null;
    if (template.sections !== undefined
        && !(Array.isArray(template.sections) && template.sections.every((s: any) => typeof s === 'string'))) {
        return null;
    }
    const key = `lib:${String(libraryId)}:${template.id.trim()}`;
    _libraryReportTemplates.set(key, Object.freeze({
        id: template.id.trim(),
        title: template.title.trim(),
        contentHtml: template.contentHtml || '',
        sections: Object.freeze([...(template.sections || [])]),
        libraryId: String(libraryId),
    }));
    return key;
}

/** Remove um template registrado por library. */
export function unregisterReportTemplate(key: any) {
    return _libraryReportTemplates.delete(String(key));
}

/** Lista templates de library disponíveis (para UI "novo a partir de template"). */
export function getLibraryReportTemplates() {
    return [..._libraryReportTemplates.values()];
}

// ----------------------------------------------------------------
// ACTIVE REPORT - GETTERS / SETTERS
// Compatibilidade: operam no relatorio ativo
// ----------------------------------------------------------------
/**
 * Get active report state (backward-compat shape).
 * @returns {{ id: string, folderId: string, title: string, content: string, lastModified: string|null }}
 */
export function getReport() {
    const active = reports.find((r: any) => r.id === activeReportId);
    if (!active) return { id: '', folderId: '', title: '', content: '', lastModified: null };
    return {
        id: active.id,
        folderId: active.folderId,
        title: active.title,
        content: active.content,
        lastModified: active.lastModified,
    };
}
/**
 * Set active report title.
 * @param {string} title
 */
export function setReportTitle(title: any) {
    const active = reports.find((r: any) => r.id === activeReportId);
    if (!active) return;
    active.title = title;
    active.lastModified = new Date().toISOString();
    _persist();
}
/**
 * Set active report HTML content.
 * @param {string} html - innerHTML from contenteditable
 */
export function setReportContent(html: any) {
    const active = reports.find((r: any) => r.id === activeReportId);
    if (!active) return;
    active.content = html;
    active.lastModified = new Date().toISOString();
    _persist();
}
// ----------------------------------------------------------------
// SCENE ANCHORS & METRIC ANCHORS
// Extrai ancoras do HTML do relatorio ativo
// ----------------------------------------------------------------
/**
 * Parse active report HTML and extract scene anchor references.
 * @returns {Array<{sceneId: string}>}
 */
export function getSceneAnchors() {
    const active = reports.find((r: any) => r.id === activeReportId);
    if (!active || !active.content) return [];
    const anchors = [];
    const regex = /data-scene-id="([^"]+)"/g;
    let match;
    while ((match = regex.exec(active.content)) !== null) {
        anchors.push({ sceneId: match[1] });
    }
    return anchors;
}
/**
 * Parse active report HTML and extract metric anchor references.
 * Inclui filterPresetId se presente no atributo data-filter-preset.
 *
 * @returns {Array<{metricType: string, filterPresetId?: string}>}
 */
export function getMetricAnchors() {
    const active = reports.find((r: any) => r.id === activeReportId);
    if (!active || !active.content) return [];
    const anchors = [];
    // Captura spans com data-metric-type e opcionalmente data-filter-preset
    const regex = /data-metric-type="([^"]+)"(?:\s+data-filter-preset="([^"]+)")?/g;
    let match;
    while ((match = regex.exec(active.content)) !== null) {
        const anchor: any = { metricType: match[1] };
        if (match[2]) anchor.filterPresetId = match[2];
        anchors.push(anchor);
    }
    return anchors;
}
// ----------------------------------------------------------------
// REPORT CRUD
// Criar, duplicar, remover, mover relatorios
// ----------------------------------------------------------------
/**
 * Get all reports.
 * @returns {Array<AnyRecord>}
 */
export function getAllReports() {
    return [...reports];
}
/**
 * Get report by ID.
 * @param {string} id
 * @returns {AnyRecord|undefined}
 */
export function getReportById(id: any) {
    return reports.find((r: any) => r.id === id);
}
/**
 * Get active report ID.
 * @returns {string|null}
 */
export function getActiveReportId() {
    return activeReportId;
}
/**
 * Add a new report inside a folder.
 * Retorna o relatorio criado ou null se limite atingido.
 *
 * @param {string} folderId - Target folder
 * @param {AnyRecord} [data] - Optional initial data { title, content }
 * @returns {AnyRecord|null}
 */
export function addReport(folderId: any, data: any) {
    if (reports.length >= MAX_REPORTS) return null;
    if (!folders.find((f: any) => f.id === folderId)) return null;
    const id = _nextId('rpt');
    const report = {
        id,
        folderId,
        title: data?.title || '',
        content: data?.content || '',
        lastModified: new Date().toISOString(),
    };
    reports.push(report);
    _persist();
    return report;
}
/**
 * Remove a report by ID.
 * Nao permite remover o ultimo relatorio.
 *
 * @param {string} id
 * @returns {boolean} true if removed
 */
export function removeReport(id: any) {
    if (reports.length <= 1) return false;
    const idx = reports.findIndex((r: any) => r.id === id);
    if (idx === -1) return false;
    reports.splice(idx, 1);
    // Se removeu o ativo, troca para o primeiro disponivel
    if (activeReportId === id) {
        activeReportId = reports[0]?.id || null;
    }
    _persist();
    return true;
}
/**
 * Duplicate a report (same folder).
 * @param {string} id
 * @returns {AnyRecord|null} New report or null if limit reached
 */
export function duplicateReport(id: any) {
    if (reports.length >= MAX_REPORTS) return null;
    const src = reports.find((r: any) => r.id === id);
    if (!src) return null;
    const newId = _nextId('rpt');
    const dup = {
        id: newId,
        folderId: src.folderId,
        title: src.title + ' (copia)',
        content: src.content,
        lastModified: new Date().toISOString(),
    };
    reports.push(dup);
    _persist();
    return dup;
}
/**
 * Set active report.
 * @param {string} id
 * @returns {boolean}
 */
export function setActiveReport(id: any) {
    if (!reports.find((r: any) => r.id === id)) return false;
    activeReportId = id;
    _persist();
    return true;
}
/**
 * Move a report to another folder.
 * @param {string} reportId
 * @param {string} targetFolderId
 * @returns {boolean}
 */
export function moveReport(reportId: any, targetFolderId: any) {
    const report = reports.find((r: any) => r.id === reportId);
    if (!report) return false;
    if (!folders.find((f: any) => f.id === targetFolderId)) return false;
    report.folderId = targetFolderId;
    report.lastModified = new Date().toISOString();
    _persist();
    return true;
}
// ----------------------------------------------------------------
// FOLDER CRUD
// Criar, renomear, remover, mover pastas
// ----------------------------------------------------------------
/**
 * Get all folders.
 * @returns {Array<AnyRecord>}
 */
export function getAllFolders() {
    return [...folders];
}
/**
 * Get folder by ID.
 * @param {string} id
 * @returns {AnyRecord|undefined}
 */
export function getFolderById(id: any) {
    return folders.find((f: any) => f.id === id);
}
/**
 * Get root folders (parentId === null).
 * @returns {Array<AnyRecord>}
 */
export function getRootFolders() {
    return _getRootFoldersPure(folders);
}
/**
 * Get child folders of a parent.
 * @param {string} parentId
 * @returns {Array<AnyRecord>}
 */
export function getChildFolders(parentId: any) {
    return _getChildFoldersPure(folders, parentId);
}
/**
 * Get reports inside a specific folder (non-recursive).
 * @param {string} folderId
 * @returns {Array<AnyRecord>}
 */
export function getReportsInFolder(folderId: any) {
    return reports.filter((r: any) => r.folderId === folderId);
}
/**
 * Calculate folder depth (0 = root).
 * @private
 * @param {string|null} parentId
 * @returns {number}
 */
function _getFolderDepth(parentId: any) {
    return computeFolderDepth(folders, parentId, MAX_DEPTH);
}
/**
 * Add a new folder.
 * Retorna a pasta criada ou null se profundidade excede MAX_DEPTH.
 *
 * @param {string} name
 * @param {string|null} [parentId=null]
 * @returns {AnyRecord|null}
 */
export function addFolder(name: any, parentId: any = null) {
    // Valida que parentId existe (se nao for null)
    if (parentId !== null && !folders.find((f: any) => f.id === parentId)) return null;
    // Verifica profundidade
    const depth = _getFolderDepth(parentId) + 1;
    if (depth > MAX_DEPTH) return null;
    const id = _nextId('folder');
    const folder = { id, name: name || 'Nova Pasta', parentId };
    folders.push(folder);
    _persist();
    return folder;
}
/**
 * Remove folder and all sub-folders + reports recursively.
 * @param {string} id
 * @returns {boolean}
 */
export function removeFolder(id: any) {
    const folder = folders.find((f: any) => f.id === id);
    if (!folder) return false;
    // Nao permite remover se e a unica pasta e tem relatorios
    if (folders.length <= 1) return false;
    // Coleta IDs de sub-pastas recursivamente (BFS via _folderTreePure).
    const toRemove = collectFolderSubtree(folders, id);
    // Remove relatorios dessas pastas
    const removedReports = new Set();
    reports = reports.filter((r: any) => {
        if (toRemove.has(r.folderId)) {
            removedReports.add(r.id);
            return false;
        }
        return true;
    });
    // Remove pastas
    folders = folders.filter((f: any) => !toRemove.has(f.id));
    // Se ativo foi removido, troca
    if (removedReports.has(activeReportId)) {
        activeReportId = reports[0]?.id || null;
    }
    // Garante pelo menos uma pasta e relatorio
    if (folders.length === 0) {
        const fId = _nextId('folder');
        folders.push({ id: fId, name: 'Geral', parentId: null });
        if (reports.length === 0) {
            const rId = _nextId('rpt');
            reports.push({ id: rId, folderId: fId, title: '', content: '', lastModified: null });
            activeReportId = rId;
        }
    }
    if (reports.length === 0) {
        const rId = _nextId('rpt');
        reports.push({ id: rId, folderId: folders[0].id, title: '', content: '', lastModified: null });
        activeReportId = rId;
    }
    _persist();
    return true;
}
/**
 * Rename a folder.
 * @param {string} id
 * @param {string} name
 * @returns {boolean}
 */
export function renameFolder(id: any, name: any) {
    const folder = folders.find((f: any) => f.id === id);
    if (!folder) return false;
    folder.name = name;
    _persist();
    return true;
}
/**
 * Check if targetId is a descendant of folderId.
 * Previne loop ao mover pasta para dentro de si mesma.
 * @private
 * @param {string} folderId
 * @param {string|null} targetId
 */
function _isDescendant(folderId: any, targetId: any) {
    /** @type {string|null} */
    let current = targetId;
    while (current !== null) {
        if (current === folderId) return true;
        const f = folders.find((fo: any) => fo.id === current);
        if (!f) break;
        current = f.parentId;
    }
    return false;
}
/**
 * Move a folder to a new parent.
 * Bloqueia se target e descendente (loop detection).
 *
 * @param {string} folderId
 * @param {string|null} targetParentId - null = root
 * @returns {boolean}
 */
export function moveFolder(folderId: any, targetParentId: any) {
    const folder = folders.find((f: any) => f.id === folderId);
    if (!folder) return false;
    if (folderId === targetParentId) return false;
    // Valida target existe
    if (targetParentId !== null && !folders.find((f: any) => f.id === targetParentId)) return false;
    // Loop detection
    if (targetParentId !== null && _isDescendant(folderId, targetParentId)) return false;
    // Verifica profundidade resultante
    const newDepth = _getFolderDepth(targetParentId) + 1;
    if (newDepth > MAX_DEPTH) return false;
    folder.parentId = targetParentId;
    _persist();
    return true;
}
// ----------------------------------------------------------------
// EXPORT / IMPORT
// Serializa e restaura relatorios no modelo
// ----------------------------------------------------------------
/**
 * Export all reports/folders for model serialization.
 * Retorna null se nao ha relatorios com conteudo.
 *
 * @returns {AnyRecord|null}
 */
export function exportReport() {
    const hasContent = reports.some((r: any) => r.title || r.content);
    if (!hasContent) return null;
    return {
        folders: folders.map((f: any) => ({ ...f })),
        reports: reports.map((r: any) => ({ ...r })),
        activeReportId,
        counter,
    };
}
/**
 * Import reports from model data.
 * Aceita novo formato { folders, reports } ou formato legado { title, content }.
 *
 * @param {AnyRecord} data - Report data from model
 */
export function importReport(data: any) {
    if (!data) return;
    if (Array.isArray(data.folders) && Array.isArray(data.reports)) {
        // Novo formato multi-report
        folders = data.folders.map((f: any) => ({
            id: f.id,
            name: f.name,
            parentId: f.parentId ?? null,
        }));
        reports = data.reports.map((r: any) => ({
            id: r.id,
            folderId: r.folderId,
            title: r.title || '',
            content: r.content || '',
            lastModified: r.lastModified || null,
        }));
        activeReportId = data.activeReportId || (reports[0]?.id ?? null);
        counter = data.counter || 0;
    } else if (data.title !== undefined || data.content !== undefined) {
        // Formato legado single-report - converte para novo formato
        folders = [];
        reports = [];
        counter = 0;
        const fId = _nextId('folder');
        folders.push({ id: fId, name: 'Geral', parentId: null });
        const rId = _nextId('rpt');
        reports.push({
            id: rId,
            folderId: fId,
            title: data.title || '',
            content: data.content || '',
            lastModified: data.lastModified || null,
        });
        activeReportId = rId;
    }
    // Garante estado minimo
    if (folders.length === 0) {
        const fId = _nextId('folder');
        folders.push({ id: fId, name: 'Geral', parentId: null });
    }
    if (reports.length === 0) {
        const rId = _nextId('rpt');
        reports.push({ id: rId, folderId: folders[0].id, title: '', content: '', lastModified: null });
        activeReportId = rId;
    }
    _persist();
}
/**
 * Clear all reports.
 * Limpa tudo e recria pasta default.
 */
export function clearReport() {
    folders = [];
    reports = [];
    activeReportId = null;
    counter = 0;
    try {
        idbDelete(STORAGE_KEY).catch((_e) => console.debug('[utils/report/manager:silent-catch]', _e?.message || _e));
        localStorage.removeItem('ecbyts-report'); // limpa chave legada
    } catch (e: any) {
        console.debug('[utils/report/manager:silent-catch]', e?.message || e);
    }
    // Recria estado minimo
    const fId = _nextId('folder');
    folders.push({ id: fId, name: 'Geral', parentId: null });
    const rId = _nextId('rpt');
    reports.push({ id: rId, folderId: fId, title: '', content: '', lastModified: null });
    activeReportId = rId;
    _persist();
}
// ----------------------------------------------------------------
// RANDOM REPORT GENERATION
// Gera relatorio simplificado para modelo aleatorio
// ----------------------------------------------------------------
/**
 * Generate a simplified environmental report for the random model.
 * Cria pasta "Geral" com 1 relatorio estruturado com ancoras de cena.
 *
 * @param {Array<AnyRecord>} scenes - Created scenes array [{id, name}]
 * @param {Array<AnyRecord>} elements - All elements in the model
 * @param {Array<AnyRecord>} campaigns - Created campaigns [{name, startDate}]
 */
export function generateRandomReport(scenes: any, elements: any, campaigns: any) {
    // Limpa estado e recria
    folders = [];
    reports = [];
    counter = 0;
    const fId = _nextId('folder');
    folders.push({ id: fId, name: 'Geral', parentId: null });
    const rId = _nextId('rpt');
    const projectName = (document.getElementById("project-name") as any)?.value || 'Projeto Demo';
    // Conta elementos por familia
    const counts: any = {};
    elements.forEach((el: any) => {
        const fam = el.familyId || 'unknown';
        counts[fam] = (counts[fam] || 0) + 1;
    });
    // Helper para criar ancoras de cena no HTML
    /**
     * @param {string} sceneId
     * @param {string} sceneName
     */
    const anchor = (sceneId: any, sceneName: any) =>
        `<span class="report-scene-anchor" data-scene-id="${sceneId}" contenteditable="false">&#9654; [Scene: ${sceneName}]</span>`;
    // Monta lista de campanhas
    const campaignList =
        campaigns.length > 0
            ? campaigns.map((c: any) => `<li>${c.name} — ${c.startDate || ''}</li>`).join('\n')
            : '<li>Nenhuma campanha registrada</li>';
    // Descricao de elementos
    const elementSummary = Object.entries(counts)
        .map(([fam, n]: [string, any]) => `${n} ${fam}${n > 1 ? 's' : ''}`)
        .join(', ');
    // Monta ancoras conforme cenas disponiveis
    const sceneAnchorMap: any = {};
    scenes.forEach((s: any) => {
        sceneAnchorMap[s.name] = s.id;
    });
    const baseAnchor = sceneAnchorMap['Linha de Base'] ? anchor(sceneAnchorMap['Linha de Base'], 'Linha de Base') : '';
    const evolAnchor = sceneAnchorMap['Evolucao'] ? anchor(sceneAnchorMap['Evolucao'], 'Evolucao') : '';
    const atualAnchor = sceneAnchorMap['Estado Atual'] ? anchor(sceneAnchorMap['Estado Atual'], 'Estado Atual') : '';
    const plumeCount = counts['plume'] || 0;
    const wellCount = counts['well'] || 0;
    const lakeCount = counts['lake'] || 0;
    const riverCount = counts['river'] || 0;
    const buildingCount = counts['building'] || 0;
    const tankCount = counts['tank'] || 0;
    const boundaryCount = counts['boundary'] || 0;
    const totalElements = elements.length;
    const topAnchor = sceneAnchorMap['Vista Superior']
        ? anchor(sceneAnchorMap['Vista Superior'], 'Vista Superior')
        : sceneAnchorMap['Top']
          ? anchor(sceneAnchorMap['Top'], 'Top')
          : '';
    const frontAnchor = sceneAnchorMap['Vista Frontal']
        ? anchor(sceneAnchorMap['Vista Frontal'], 'Vista Frontal')
        : sceneAnchorMap['Front']
          ? anchor(sceneAnchorMap['Front'], 'Front')
          : '';
    const reportDate = new Date().toISOString().slice(0, 10);
    const html = `<h1>Relatorio de Investigacao Ambiental</h1>
<h3>${projectName}</h3>
<p><em>Data de emissao: ${reportDate}</em></p>

<hr>

<h2>1. Introducao</h2>
<p>Este relatorio apresenta os resultados da investigacao ambiental conduzida na area de estudo do projeto <strong>${projectName}</strong>. O objetivo principal e caracterizar as condicoes ambientais do local, identificar possiveis fontes de contaminacao e avaliar os riscos associados a saude humana e ao meio ambiente.</p>
<p>O modelo digital ambiental contempla <strong>${totalElements}</strong> elementos (${elementSummary || 'diversos tipos'}), distribuidos na area de estudo conforme o levantamento de campo e dados historicos disponiveis.</p>
<p>O escopo do trabalho inclui: (i) levantamento de dados primarios e secundarios, (ii) amostragem de solo e agua subterranea, (iii) modelagem conceitual do site, e (iv) avaliacao de risco preliminar.</p>

<h2>2. Caracterizacao da Area</h2>
${baseAnchor ? '<p>' + baseAnchor + '</p>' : ''}

<h3>2.1 Localizacao e Contexto</h3>
<p>A area de estudo compreende uma zona ${plumeCount > 0 ? 'com evidencias de contaminacao' : 'monitorada'} inserida em contexto ${buildingCount > 0 ? 'urbano-industrial' : 'ambiental'}, com area delimitada por ${boundaryCount} perimetro${boundaryCount !== 1 ? 's' : ''} de estudo.</p>
${topAnchor ? '<p>' + topAnchor + '</p>' : ''}
<p>O contexto hidrogeologico da regiao indica a presenca de aquifero livre com fluxo predominante no sentido ${['norte-sul', 'nordeste-sudoeste', 'leste-oeste', 'noroeste-sudeste'][Math.floor(Math.random() * 4)]}, conforme evidenciado pelas medidas de nivel d'agua nos pocos de monitoramento.</p>

<h3>2.2 Infraestrutura Existente</h3>
<p>Foram identificados no local:</p>
<ul>
<li><strong>${wellCount}</strong> poco${wellCount !== 1 ? 's' : ''} de monitoramento instalados para acompanhamento da qualidade das aguas subterraneas</li>
${tankCount > 0 ? '<li><strong>' + tankCount + '</strong> tanque' + (tankCount > 1 ? 's' : '') + ' de armazenamento (potenciais fontes de contaminacao)</li>' : ''}
${buildingCount > 0 ? '<li><strong>' + buildingCount + '</strong> edificacao' + (buildingCount > 1 ? 'oes' : '') + ' na area de influencia</li>' : ''}
${lakeCount > 0 ? '<li><strong>' + lakeCount + '</strong> corpo' + (lakeCount > 1 ? 's' : '') + " d'agua superficial" + (lakeCount > 1 ? 'is' : '') + '</li>' : ''}
${riverCount > 0 ? '<li><strong>' + riverCount + '</strong> curso' + (riverCount > 1 ? 's' : '') + " d'agua</li>" : ''}
</ul>

<h3>2.3 Historico de Campanhas</h3>
<p>Foram realizadas <strong>${campaigns.length}</strong> campanhas de amostragem no periodo de monitoramento:</p>
<ul>
${campaignList}
</ul>
<p>As campanhas seguiram os procedimentos estabelecidos na norma ABNT NBR 15847 para amostragem de agua subterranea e ABNT NBR 15492 para sondagens de reconhecimento.</p>

<h2>3. Modelo Conceitual</h2>
${frontAnchor ? '<p>' + frontAnchor + '</p>' : ''}
<p>O modelo conceitual do site foi elaborado com base nos dados coletados durante as campanhas de investigacao e considera os seguintes aspectos:</p>
<ul>
<li><strong>Fonte:</strong> ${tankCount > 0 ? 'Possiveis vazamentos nos tanques de armazenamento identificados na area' : plumeCount > 0 ? 'Fonte primaria de contaminacao associada as atividades historicas no local' : 'Nenhuma fonte ativa de contaminacao identificada'}</li>
<li><strong>Mecanismo de transporte:</strong> Dispersao e adveccao pela agua subterranea, com possivel contribuicao da infiltracao pluvial</li>
<li><strong>Receptores:</strong> ${wellCount > 0 ? 'Pocos de monitoramento e potenciais receptores ecologicos a jusante' : 'Ecossistemas aquaticos adjacentes'}</li>
</ul>

<h2>4. Resultados Analiticos</h2>
${evolAnchor ? '<p>' + evolAnchor + '</p>' : ''}

<h3>4.1 Agua Subterranea</h3>
<p>${plumeCount > 0 ? 'Foram identificadas <strong>' + plumeCount + '</strong> pluma' + (plumeCount > 1 ? 's' : '') + ' de contaminacao na area de estudo, com extensao variavel conforme o tipo de contaminante.' : 'Nao foram identificadas plumas de contaminacao significativas nos resultados analiticos.'}</p>
<p>Os resultados analiticos das campanhas de monitoramento indicam ${plumeCount > 0 ? 'tendencia de atenuacao natural dos contaminantes ao longo do tempo, com reducao gradual das concentracoes nos pocos sentinela' : 'condicoes estaveis dentro dos padroes de referencia estabelecidos pela legislacao vigente (CONAMA 420/2009)'}.</p>

<h3>4.2 Evolucao Temporal</h3>
<p>Os dados de monitoramento dos <strong>${wellCount}</strong> poco${wellCount !== 1 ? 's' : ''} demonstram ${campaigns.length >= 5 ? 'tendencia consistente de melhoria nos parametros monitorados' : 'necessidade de continuidade do monitoramento para avaliacao de tendencias'}, permitindo avaliar a evolucao temporal das concentracoes.</p>
${plumeCount > 0 ? '<blockquote>Nota: Os valores de referencia utilizados sao os estabelecidos pela Resolucao CONAMA 420/2009 e pelos valores orientadores da CETESB (2021) para uso do solo e agua subterranea.</blockquote>' : ''}

<h2>5. Avaliacao de Risco</h2>
<p>A avaliacao de risco preliminar foi conduzida considerando os cenarios de exposicao aplicaveis ao uso atual e futuro da area:</p>
<ul>
<li><strong>Cenario 1:</strong> Contato direto com solo — ${plumeCount > 0 ? 'risco moderado' : 'risco baixo'}</li>
<li><strong>Cenario 2:</strong> Ingestao de agua subterranea — ${plumeCount > 0 ? 'risco elevado (necessita intervencao)' : 'risco aceitavel'}</li>
<li><strong>Cenario 3:</strong> Inalacao de vapores — ${plumeCount > 0 ? 'risco moderado' : 'risco insignificante'}</li>
</ul>

<h2>6. Conclusoes e Recomendacoes</h2>
${atualAnchor ? '<p>' + atualAnchor + '</p>' : ''}
<p>Com base nos resultados obtidos ao longo das <strong>${campaigns.length}</strong> campanhas de monitoramento, conclui-se que:</p>
<ul>
<li>A rede de monitoramento com ${wellCount} poco${wellCount !== 1 ? 's' : ''} e adequada para acompanhamento das condicoes ambientais do local.</li>
<li>${plumeCount > 0 ? 'As plumas de contaminacao apresentam tendencia de reducao, indicando eficacia dos processos de atenuacao natural.' : 'Os parametros monitorados se encontram dentro dos valores de referencia aplicaveis (CONAMA 420/2009).'}</li>
<li>${tankCount > 0 ? 'Os tanques de armazenamento identificados devem ser objeto de inspecao periodica para prevencao de novos vazamentos.' : 'Nao foram identificadas novas fontes potenciais de contaminacao na area.'}</li>
<li>Recomenda-se a continuidade do programa de monitoramento com frequencia ${campaigns.length >= 3 ? 'semestral' : 'trimestral'}.</li>
</ul>

<h3>6.1 Proximos Passos</h3>
<ol>
<li>Manter o programa de monitoramento com coleta ${campaigns.length >= 3 ? 'semestral' : 'trimestral'} de amostras de agua subterranea</li>
<li>${plumeCount > 0 ? 'Avaliar a necessidade de implantacao de sistema de remediacao ativa na area das plumas' : 'Continuar o acompanhamento para confirmacao da estabilidade dos resultados'}</li>
<li>Atualizar o modelo conceitual do site com os dados das proximas campanhas</li>
<li>Elaborar relatorio de acompanhamento apos proxima campanha de amostragem</li>
</ol>

<hr>
<p><em>Documento gerado automaticamente pelo modelo digital ambiental ecbyts v0.1.0-beta. Os dados apresentados sao hipoteticos e para fins de demonstracao.</em></p>`;
    reports.push({
        id: rId,
        folderId: fId,
        title: `Relatorio — ${projectName}`,
        content: html,
        lastModified: new Date().toISOString(),
    });
    activeReportId = rId;
    _persist();
}
