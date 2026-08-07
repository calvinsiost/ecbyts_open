// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
//
/**
 * savesManager.ts — Gerenciador de saves estilo "pastas e arquivos".
 *
 * Diretiva Calvin 2026-06-02: "criar botões explícitos de salvar e abrir saves,
 * simular pastas e arquivos". Reusa o motor existente `cloud/manager.js`
 * (saveModelToCloud/loadModelsFromCloud/...) e adiciona uma camada de
 * organização client-side: pastas (localStorage) sobre os modelos salvos na
 * nuvem. "Arquivos" = modelos salvos; "pastas" = agrupamento local do usuário.
 *
 * NÃO é um novo backend — apenas uma visão organizada do que já existe.
 */

import {
    loadModelsFromCloud,
    loadModelFromCloud,
    deleteModelFromCloud,
    saveModelToCloud,
} from '../cloud/manager.js';
import { applyModel } from '../../core/io/import.js';
import { showToast } from './toast.js';
import { asyncPrompt, asyncConfirm } from './asyncDialogs.js';
import { escapeHtml, escapeAttr } from '../helpers/html.js';
import { safeSetItem } from '../storage/storageMonitor.js';
import * as authSession from '../auth/session.js';
import { t } from '../i18n/translations.js';

const OVERLAY_ID = 'saves-manager-overlay';
const FOLDERS_KEY = 'ecbyts-saves-folders'; // [{id, name}]
const FILEMAP_KEY = 'ecbyts-saves-file-folder'; // { [modelId]: folderId }

/** @type {string|null} pasta atual (null = raiz) */
let _currentFolderId: string | null = null;

function signalModelChanged(source: string) {
    const CustomEventCtor = (window as any).CustomEvent || globalThis.CustomEvent;
    if (typeof window.dispatchEvent === 'function' && typeof CustomEventCtor === 'function') {
        window.dispatchEvent(new CustomEventCtor('modelChanged', { detail: { source } }));
    }
}

const isLoggedIn = () => {
    // Seam de teste E2E: abre só a UI (saveModelToCloud ainda valida auth no servidor).
    if (typeof window !== 'undefined' && (window as any).__ecbytsTestForceAuth === true) return true;
    try {
        return (authSession as any).isLoggedIn?.() === true;
    } catch {
        return false;
    }
};

/** t() com fallback explícito. */
function tr(key: string, fallback: string): string {
    try {
        const v = t(key);
        return v && v !== key ? v : fallback;
    } catch {
        return fallback;
    }
}

// ── Persistência de pastas (client-side) ──────────────────────────
function _loadFolders(): Array<{ id: string; name: string }> {
    try {
        const raw = localStorage.getItem(FOLDERS_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr.filter((f) => f && f.id && typeof f.name === 'string') : [];
    } catch {
        return [];
    }
}
function _saveFolders(folders: Array<any>) {
    safeSetItem(FOLDERS_KEY, JSON.stringify(folders));
}
function _loadFileMap(): Record<string, string> {
    try {
        const raw = localStorage.getItem(FILEMAP_KEY);
        const obj = raw ? JSON.parse(raw) : {};
        return obj && typeof obj === 'object' ? obj : {};
    } catch {
        return {};
    }
}
function _saveFileMap(map: Record<string, string>) {
    safeSetItem(FILEMAP_KEY, JSON.stringify(map));
}

function _genId() {
    return 'fld-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}

// ── Overlay ───────────────────────────────────────────────────────
function _getOverlay(): HTMLElement {
    _injectStyles();
    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.className = 'saves-overlay';
        overlay.addEventListener('click', (e: any) => {
            if (e.target === overlay) _close();
        });
        document.body.appendChild(overlay);
    }
    return overlay;
}

/** CSS autocontido — sem arquivo externo nem edição de index.html. */
function _injectStyles() {
    if (document.getElementById('saves-manager-styles')) return;
    const style = document.createElement('style');
    style.id = 'saves-manager-styles';
    style.textContent = `
        .saves-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.6);
            backdrop-filter:blur(4px); z-index:9000; justify-content:center; align-items:center; padding:24px; }
        .saves-overlay.active { display:flex; }
        .saves-dialog { background:var(--neutral-100,#1b252e); color:var(--neutral-800,#c5cdd5);
            border:1px solid var(--neutral-300); border-radius:var(--radius-lg,10px);
            width:min(900px,96vw); max-height:88vh; display:flex; flex-direction:column;
            box-shadow:0 24px 70px rgba(4,10,18,0.4); overflow:hidden; }
        .saves-head { display:flex; align-items:center; justify-content:space-between;
            padding:14px 18px; border-bottom:1px solid var(--neutral-300); }
        .saves-head h3 { margin:0; font-size:var(--text-md,16px); font-weight:600; color:var(--neutral-800); }
        .saves-close { background:transparent; border:0; color:var(--neutral-600); font-size:24px;
            line-height:1; cursor:pointer; width:32px; height:32px; border-radius:6px; }
        .saves-close:hover { background:var(--neutral-200); color:var(--neutral-800); }
        .saves-toolbar { display:flex; align-items:center; justify-content:space-between; gap:12px;
            padding:10px 18px; border-bottom:1px solid var(--neutral-200); flex-wrap:wrap; }
        .saves-breadcrumb { font-size:var(--text-sm,13px); color:var(--neutral-700); display:flex; align-items:center; gap:6px; }
        .saves-crumb { background:transparent; border:0; color:var(--primary-500); cursor:pointer; font:inherit; padding:0; }
        .saves-crumb:hover { text-decoration:underline; }
        .saves-crumb-current { font-weight:600; color:var(--neutral-800); }
        .saves-crumb-sep { color:var(--neutral-500); }
        .saves-toolbar-actions { display:flex; gap:8px; flex-wrap:wrap; }
        .saves-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:10px;
            padding:16px 18px; overflow-y:auto; align-content:start; }
        .saves-tile { display:flex; flex-direction:column; gap:4px; padding:12px; border-radius:var(--radius-md,8px);
            border:1px solid var(--neutral-300); background:var(--neutral-200,#222e3a); min-height:88px; position:relative; }
        .saves-tile--folder { cursor:pointer; }
        .saves-tile--folder:hover { border-color:var(--primary-300); background:var(--primary-50); }
        .saves-tile-icon { font-size:22px; line-height:1; }
        .saves-tile-name { font-size:var(--text-sm,13px); font-weight:600; color:var(--neutral-800);
            overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .saves-tile--file .saves-tile-name { cursor:pointer; }
        .saves-tile--file .saves-tile-name:hover { color:var(--primary-500); text-decoration:underline; }
        .saves-tile-meta { font-size:var(--text-xs,11px); color:var(--neutral-500); }
        .saves-tile-actions { display:flex; align-items:center; gap:6px; margin-top:6px; flex-wrap:wrap; }
        .saves-mini { border:1px solid var(--neutral-300); background:var(--neutral-100); color:var(--neutral-700);
            border-radius:6px; padding:3px 8px; font-size:var(--text-xs,11px); cursor:pointer; }
        .saves-mini:hover { border-color:var(--primary-300); color:var(--primary-500); }
        .saves-open { font-weight:600; }
        .saves-del:hover { border-color:#b91c1c; color:#ef4444; }
        .saves-move { border:1px solid var(--neutral-300); background:var(--neutral-100); color:var(--neutral-700);
            border-radius:6px; padding:2px 4px; font-size:var(--text-xs,11px); max-width:110px; }
        .saves-empty { grid-column:1/-1; text-align:center; color:var(--neutral-500); padding:32px 16px; font-size:var(--text-sm,13px); }
        .saves-loading { padding:48px; text-align:center; color:var(--neutral-600); }
    `;
    document.head.appendChild(style);
}
function _close() {
    document.getElementById(OVERLAY_ID)?.classList.remove('active');
}

// ── Entrada pública ───────────────────────────────────────────────
/** Abre o gerenciador de saves (botão "Abrir saves"). */
export async function openSavesManager() {
    if (!isLoggedIn()) {
        showToast(tr('saves.loginFirst', 'Faça login para acessar seus saves na nuvem.'), 'warning');
        (window as any).handleOpenAuthModal?.();
        return;
    }
    const overlay = _getOverlay();
    overlay.classList.add('active');
    overlay.innerHTML = `<div class="saves-dialog"><div class="saves-loading">${escapeHtml(
        tr('saves.loading', 'Carregando seus saves...'),
    )}</div></div>`;
    await _refresh();
}

/** Salva o modelo atual (botão "Salvar"). Pergunta o nome e grava na nuvem. */
export async function quickSaveCurrentModel() {
    if (!isLoggedIn()) {
        showToast(tr('saves.loginToSave', 'Faça login para salvar na nuvem.'), 'warning');
        (window as any).handleOpenAuthModal?.();
        return;
    }
    const suggested =
        (window as any).getHomeHeaderState?.().modelName || (window as any).__activeModelLabel || '';
    const name = await asyncPrompt(
        tr('saves.namePrompt', 'Nome do save:'),
        suggested || tr('saves.untitled', 'Modelo sem título'),
    );
    if (!name || !name.trim()) return;
    try {
        const result = await saveModelToCloud(name.trim(), '');
        // Atribui à pasta atual, se o explorer estiver aberto numa pasta
        const newId = result?.id || result?.model?.id;
        if (newId && _currentFolderId) {
            const map = _loadFileMap();
            map[newId] = _currentFolderId;
            _saveFileMap(map);
        }
        showToast(tr('saves.saved', 'Modelo salvo.'), 'success');
        if (document.getElementById(OVERLAY_ID)?.classList.contains('active')) await _refresh();
    } catch (e: any) {
        showToast(tr('saves.saveError', 'Erro ao salvar: ') + (e?.message || e), 'error');
    }
}

// ── Render ────────────────────────────────────────────────────────
async function _refresh() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    let models: any[];
    const testSaves = typeof window !== 'undefined' ? (window as any).__ecbytsTestSaves : null;
    if (Array.isArray(testSaves)) {
        // Seam E2E: arquivos de teste sem depender da nuvem (jornada de UI).
        overlay.innerHTML = _renderExplorer(testSaves);
        _wire(overlay);
        return;
    }
    try {
        models = (await loadModelsFromCloud()) || [];
    } catch (e: any) {
        // Falha de rede não esconde a UI: mostra as pastas (localStorage) + sem arquivos.
        console.debug('[savesManager] loadModels:', e?.message || e);
        showToast(tr('saves.loadError', 'Não foi possível carregar os saves.'), 'warning');
        models = [];
    }
    overlay.innerHTML = _renderExplorer(models);
    _wire(overlay);
    requestAnimationFrame(() => (window as any).hydrateIcons?.());
}

function _renderExplorer(models: any[]): string {
    const folders = _loadFolders();
    const fileMap = _loadFileMap();
    const currentFolder = folders.find((f) => f.id === _currentFolderId) || null;

    // arquivos da visão atual
    const visibleModels = models.filter((m) => {
        const fid = fileMap[m.id] || null;
        return fid === _currentFolderId;
    });

    const folderTiles =
        _currentFolderId === null
            ? folders
                  .map((f) => {
                      const count = models.filter((m) => fileMap[m.id] === f.id).length;
                      return `
                <div class="saves-tile saves-tile--folder" data-saves-action="open-folder" data-folder-id="${escapeAttr(f.id)}" role="button" tabindex="0">
                    <span class="saves-tile-icon" aria-hidden="true">&#128193;</span>
                    <span class="saves-tile-name">${escapeHtml(f.name)}</span>
                    <span class="saves-tile-meta">${count} ${escapeHtml(tr('saves.items', 'itens'))}</span>
                    <span class="saves-tile-actions">
                        <button class="saves-mini" data-saves-action="rename-folder" data-folder-id="${escapeAttr(f.id)}" title="${escapeAttr(tr('saves.rename', 'Renomear'))}">&#9998;</button>
                        <button class="saves-mini" data-saves-action="delete-folder" data-folder-id="${escapeAttr(f.id)}" title="${escapeAttr(tr('saves.deleteFolder', 'Excluir pasta'))}">&times;</button>
                    </span>
                </div>`;
                  })
                  .join('')
            : '';

    const folderOptions = (sel: string | null) =>
        `<option value="">${escapeHtml(tr('saves.noFolder', '(sem pasta)'))}</option>` +
        folders
            .map(
                (f) =>
                    `<option value="${escapeAttr(f.id)}" ${f.id === sel ? 'selected' : ''}>${escapeHtml(f.name)}</option>`,
            )
            .join('');

    const fileTiles = visibleModels
        .map((m) => {
            const date = m.updated_at ? new Date(m.updated_at).toLocaleDateString('pt-BR') : '';
            const fid = fileMap[m.id] || '';
            return `
            <div class="saves-tile saves-tile--file" data-model-id="${escapeAttr(m.id)}">
                <span class="saves-tile-icon" aria-hidden="true">&#128196;</span>
                <span class="saves-tile-name" data-saves-action="open-file" data-model-id="${escapeAttr(m.id)}" role="button" tabindex="0" title="${escapeAttr(tr('saves.openFile', 'Abrir este save'))}">${escapeHtml(m.name || tr('saves.untitled', 'Sem título'))}</span>
                <span class="saves-tile-meta">${m.element_count || 0} ${escapeHtml(tr('saves.elements', 'elementos'))} · ${date}</span>
                <span class="saves-tile-actions">
                    <button class="saves-mini saves-open" data-saves-action="open-file" data-model-id="${escapeAttr(m.id)}" title="${escapeAttr(tr('saves.openFile', 'Abrir'))}">${escapeHtml(tr('saves.open', 'Abrir'))}</button>
                    <select class="saves-move" data-saves-action="move-file" data-model-id="${escapeAttr(m.id)}" title="${escapeAttr(tr('saves.moveTo', 'Mover para pasta'))}">${folderOptions(fid)}</select>
                    <button class="saves-mini saves-del" data-saves-action="delete-file" data-model-id="${escapeAttr(m.id)}" data-name="${escapeAttr(m.name || '')}" title="${escapeAttr(tr('saves.delete', 'Excluir'))}">&times;</button>
                </span>
            </div>`;
        })
        .join('');

    const emptyMsg =
        folderTiles || fileTiles
            ? ''
            : `<p class="saves-empty">${escapeHtml(tr('saves.emptyHere', 'Nada por aqui ainda. Salve o modelo atual ou crie uma pasta.'))}</p>`;

    const breadcrumb = currentFolder
        ? `<button class="saves-crumb" data-saves-action="open-folder" data-folder-id="">${escapeHtml(tr('saves.home', 'Início'))}</button> <span class="saves-crumb-sep">/</span> <span class="saves-crumb-current">${escapeHtml(currentFolder.name)}</span>`
        : `<span class="saves-crumb-current">${escapeHtml(tr('saves.home', 'Início'))}</span>`;

    return `
    <div class="saves-dialog" role="dialog" aria-modal="true" aria-label="${escapeAttr(tr('saves.title', 'Meus Saves'))}">
        <div class="saves-head">
            <h3>${escapeHtml(tr('saves.title', 'Meus Saves'))}</h3>
            <button class="saves-close" data-saves-action="close" aria-label="${escapeAttr(tr('saves.close', 'Fechar'))}">&times;</button>
        </div>
        <div class="saves-toolbar">
            <div class="saves-breadcrumb">${breadcrumb}</div>
            <div class="saves-toolbar-actions">
                <button class="btn btn-sm" data-saves-action="new-folder">&#128193; ${escapeHtml(tr('saves.newFolder', 'Nova pasta'))}</button>
                <button class="btn btn-sm btn-primary" data-saves-action="save-here">&#128190; ${escapeHtml(tr('saves.saveCurrent', 'Salvar modelo atual'))}</button>
            </div>
        </div>
        <div class="saves-grid">
            ${folderTiles}
            ${fileTiles}
            ${emptyMsg}
        </div>
    </div>`;
}

// ── Eventos (delegação) ───────────────────────────────────────────
function _wire(overlay: HTMLElement) {
    const onAction = async (target: HTMLElement) => {
        const action = target.getAttribute('data-saves-action');
        const folderId = target.getAttribute('data-folder-id');
        const modelId = target.getAttribute('data-model-id');
        switch (action) {
            case 'close':
                _close();
                break;
            case 'open-folder':
                _currentFolderId = folderId || null;
                await _refresh();
                break;
            case 'open-file':
                if (modelId) await _openFile(modelId);
                break;
            case 'delete-file':
                if (modelId) await _deleteFile(modelId, target.getAttribute('data-name') || '');
                break;
            case 'new-folder':
                await _newFolder();
                break;
            case 'rename-folder':
                if (folderId) await _renameFolder(folderId);
                break;
            case 'delete-folder':
                if (folderId) await _deleteFolder(folderId);
                break;
            case 'save-here':
                await quickSaveCurrentModel();
                break;
        }
    };
    overlay.addEventListener('click', (e: any) => {
        const target = e.target?.closest('[data-saves-action]');
        if (target && target.tagName !== 'SELECT') {
            e.preventDefault();
            void onAction(target);
        }
    });
    overlay.addEventListener('keydown', (e: any) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const target = e.target?.closest('[data-saves-action][role="button"]');
        if (target) {
            e.preventDefault();
            void onAction(target);
        }
    });
    overlay.addEventListener('change', (e: any) => {
        const sel = e.target?.closest('select[data-saves-action="move-file"]');
        if (!sel) return;
        const modelId = sel.getAttribute('data-model-id');
        if (modelId) void _moveFile(modelId, sel.value || null);
    });
}

async function _openFile(modelId: string) {
    try {
        const model = await loadModelFromCloud(modelId);
        await applyModel(model);
        signalModelChanged('saves-open-file');
        showToast(tr('saves.opened', 'Save aberto.'), 'success');
        _close();
    } catch (e: any) {
        showToast(tr('saves.openError', 'Erro ao abrir: ') + (e?.message || e), 'error');
    }
}

async function _deleteFile(modelId: string, name: string) {
    const ok = await asyncConfirm(tr('saves.confirmDelete', 'Excluir o save') + ` "${name}"?`);
    if (!ok) return;
    try {
        await deleteModelFromCloud(modelId);
        const map = _loadFileMap();
        delete map[modelId];
        _saveFileMap(map);
        showToast(tr('saves.deleted', 'Save excluído.'), 'info');
        await _refresh();
    } catch (e: any) {
        showToast(tr('saves.deleteError', 'Erro ao excluir: ') + (e?.message || e), 'error');
    }
}

function _moveFile(modelId: string, folderId: string | null) {
    const map = _loadFileMap();
    if (folderId) map[modelId] = folderId;
    else delete map[modelId];
    _saveFileMap(map);
    void _refresh();
}

async function _newFolder() {
    const name = await asyncPrompt(tr('saves.newFolderPrompt', 'Nome da nova pasta:'), '');
    if (!name || !name.trim()) return;
    const folders = _loadFolders();
    folders.push({ id: _genId(), name: name.trim() });
    _saveFolders(folders);
    await _refresh();
}

async function _renameFolder(folderId: string) {
    const folders = _loadFolders();
    const folder = folders.find((f) => f.id === folderId);
    if (!folder) return;
    const name = await asyncPrompt(tr('saves.renamePrompt', 'Novo nome da pasta:'), folder.name);
    if (!name || !name.trim()) return;
    folder.name = name.trim();
    _saveFolders(folders);
    await _refresh();
}

async function _deleteFolder(folderId: string) {
    const ok = await asyncConfirm(
        tr('saves.confirmDeleteFolder', 'Excluir esta pasta? Os saves dentro dela voltam para o Início.'),
    );
    if (!ok) return;
    _saveFolders(_loadFolders().filter((f) => f.id !== folderId));
    const map = _loadFileMap();
    for (const k of Object.keys(map)) if (map[k] === folderId) delete map[k];
    _saveFileMap(map);
    if (_currentFolderId === folderId) _currentFolderId = null;
    await _refresh();
}

// ── Registro de handlers globais ─────────────────────────────────
if (typeof window !== 'undefined') {
    (window as any).handleOpenSavesManager = openSavesManager;
    (window as any).handleQuickSaveModel = quickSaveCurrentModel;
}
