// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   REPORT LIST — Tree view de relatorios organizados por pastas
   Renderiza a arvore de pastas/relatorios no painel inferior
   (tab "Report" do HUD Constellation).

   O editor NAO e mais inicializado aqui — ele vive no overlay.
   A selecao de relatorio no painel inferior abre/atualiza o overlay.
   ================================================================ */
import { t } from '../i18n/translations.js';
import { getActiveReportId, getRootFolders, getChildFolders, getReportsInFolder } from './manager.js';
// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------
let treeContainer: any = null;
/** @type {Set<string>} Expanded folder IDs */
const expandedFolders = new Set();
/** @type {HTMLElement|null} Active context menu */
let activeContextMenu: any = null;
// ----------------------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------------------
/**
 * Initialize the report list tree view inside the given container.
 * Substitui o editor que antes era renderizado no painel inferior.
 *
 * @param {HTMLElement} container - #report-editor-container
 */
export function initReportList(container: any) {
    if (!container) return;
    treeContainer = container;
    container.innerHTML = '';
    container.classList.add('report-tree');
    // Expande todas as pastas raiz por default
    getRootFolders().forEach((f: any) => expandedFolders.add(f.id));
    _buildTree();
    // Escuta mudancas no estado para re-renderizar
    window.addEventListener('reportChanged', () => {
        if (treeContainer) _buildTree();
    });
    // Fecha context menu ao clicar fora
    document.addEventListener('click', _closeContextMenu);
}
/**
 * Force re-render of the tree (called externally after CRUD).
 */
export function updateReportList() {
    if (treeContainer) _buildTree();
}
// ----------------------------------------------------------------
// TREE BUILDER
// ----------------------------------------------------------------
/** @private Reconstroi toda a arvore */
function _buildTree() {
    if (!treeContainer) return;
    treeContainer.innerHTML = '';
    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'report-tree-toolbar';
    const _w = window;
    const addReportBtn = document.createElement('button');
    addReportBtn.className = 'report-tree-toolbar-btn';
    addReportBtn.innerHTML = `+ ${t('reportNewBtn') || 'New Report'}`;
    addReportBtn.onclick = () => {
        // Adiciona no primeiro root folder se nao ha folder ativo
        const folders = getRootFolders();
        const targetId = folders[0]?.id;
        if (targetId) _w.handleAddReport?.(targetId);
    };
    const addFolderBtn = document.createElement('button');
    addFolderBtn.className = 'report-tree-toolbar-btn';
    addFolderBtn.innerHTML = `+ ${t('reportFolderNewBtn') || 'New Folder'}`;
    addFolderBtn.onclick = () => _w.handleAddFolder?.();
    const filterBtn = document.createElement('button');
    filterBtn.className = 'report-tree-toolbar-btn';
    filterBtn.innerHTML = `&#9881; ${t('filterPresetNewBtn') || 'Filters'}`;
    filterBtn.onclick = () => _w.handleOpenFilterPresets?.();
    toolbar.appendChild(addReportBtn);
    toolbar.appendChild(addFolderBtn);
    toolbar.appendChild(filterBtn);
    treeContainer.appendChild(toolbar);
    // Body - area scrollavel
    const body = document.createElement('div');
    body.className = 'report-tree-body';
    // Renderiza pastas raiz
    const rootFolders = getRootFolders();
    rootFolders.forEach((folder: any) => {
        body.appendChild(_buildFolderNode(folder));
    });
    treeContainer.appendChild(body);
}
// ----------------------------------------------------------------
// FOLDER NODE
// ----------------------------------------------------------------
/**
 * Build a folder node with header + children (sub-folders + reports).
 * @private
 * @param {Record<string, any>} folder
 * @returns {HTMLElement}
 */
function _buildFolderNode(folder: any) {
    const node = document.createElement('div');
    node.className = 'report-tree-folder';
    node.dataset.folderId = folder.id;
    const isExpanded = expandedFolders.has(folder.id);
    const childFolders = getChildFolders(folder.id);
    const folderReports = getReportsInFolder(folder.id);
    // Header
    const header = document.createElement('div');
    header.className = 'report-tree-folder-header';
    header.onclick = (e) => {
        if ((e.target as any)?.closest?.('.report-tree-folder-action-btn')) return;
        _toggleFolder(folder.id);
    };
    header.oncontextmenu = (e) => {
        e.preventDefault();
        _showFolderContextMenu(e, folder);
    };
    // Expand icon
    const icon = document.createElement('span');
    icon.className = `report-tree-folder-icon ${isExpanded ? 'expanded' : ''}`;
    icon.innerHTML = '&#9654;'; // ▶
    // Name
    const name = document.createElement('span');
    name.className = 'report-tree-folder-name';
    name.textContent = folder.name;
    name.ondblclick = (e) => {
        e.stopPropagation();
        _startFolderRename(name, folder);
    };
    // Count
    const count = document.createElement('span');
    count.className = 'report-tree-folder-count';
    count.textContent = `(${folderReports.length})`;
    // Actions (visíveis no hover)
    const actions = document.createElement('div');
    actions.className = 'report-tree-folder-actions';
    const addBtn = document.createElement('button');
    addBtn.className = 'report-tree-folder-action-btn';
    addBtn.title = t('reportNewBtn') || 'New Report';
    addBtn.innerHTML = '+';
    addBtn.onclick = (e) => {
        e.stopPropagation();
        window.handleAddReport?.(folder.id);
    };
    const menuBtn = document.createElement('button');
    menuBtn.className = 'report-tree-folder-action-btn';
    menuBtn.title = 'Menu';
    menuBtn.innerHTML = '&#8230;'; // …
    menuBtn.onclick = (e) => {
        e.stopPropagation();
        _showFolderContextMenu(e, folder);
    };
    actions.appendChild(addBtn);
    actions.appendChild(menuBtn);
    header.appendChild(icon);
    header.appendChild(name);
    header.appendChild(count);
    header.appendChild(actions);
    node.appendChild(header);
    // Children container
    const children = document.createElement('div');
    children.className = `report-tree-children ${isExpanded ? '' : 'collapsed'}`;
    // Sub-folders
    childFolders.forEach((sub: any) => {
        children.appendChild(_buildFolderNode(sub));
    });
    // Reports
    const activeId = getActiveReportId();
    folderReports.forEach((report: any) => {
        children.appendChild(_buildReportItem(report, activeId));
    });
    // Empty state
    if (childFolders.length === 0 && folderReports.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'report-tree-empty';
        empty.textContent = t('reportEmptyFolder') || 'Empty folder';
        children.appendChild(empty);
    }
    node.appendChild(children);
    return node;
}
// ----------------------------------------------------------------
// REPORT ITEM
// ----------------------------------------------------------------
/**
 * Build a report item inside a folder.
 * @private
 * @param {Record<string, any>} report
 * @param {string|null} activeId
 * @returns {HTMLElement}
 */
function _buildReportItem(report: any, activeId: any) {
    const item = document.createElement('div');
    item.className = `report-tree-item ${report.id === activeId ? 'active' : ''}`;
    item.dataset.reportId = report.id;
    item.onclick = (e) => {
        if ((e.target as any)?.closest?.('.report-tree-item-action-btn')) return;
        window.handleSwitchReport?.(report.id);
    };
    item.oncontextmenu = (e) => {
        e.preventDefault();
        _showReportContextMenu(e, report);
    };
    // Row: title + actions
    const row = document.createElement('div');
    row.className = 'report-tree-item-row';
    const title = document.createElement('span');
    title.className = 'report-tree-item-title';
    title.textContent = report.title || t('reportUntitled') || 'Untitled Report';
    const actions = document.createElement('div');
    actions.className = 'report-tree-item-actions';
    const dupBtn = document.createElement('button');
    dupBtn.className = 'report-tree-item-action-btn';
    dupBtn.title = t('reportDuplicate') || 'Duplicate';
    dupBtn.innerHTML = '&#9851;'; // ♻ (copy icon alternative)
    dupBtn.onclick = (e) => {
        e.stopPropagation();
        window.handleDuplicateReport?.(report.id);
    };
    const delBtn = document.createElement('button');
    delBtn.className = 'report-tree-item-action-btn';
    delBtn.title = t('reportRemove') || 'Delete';
    delBtn.innerHTML = '&#10005;'; // ✕
    delBtn.onclick = (e) => {
        e.stopPropagation();
        window.handleRemoveReport?.(report.id);
    };
    actions.appendChild(dupBtn);
    actions.appendChild(delBtn);
    row.appendChild(title);
    row.appendChild(actions);
    item.appendChild(row);
    // Meta line: date
    if (report.lastModified) {
        const meta = document.createElement('div');
        meta.className = 'report-tree-item-meta';
        const d = new Date(report.lastModified);
        meta.textContent =
            d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        item.appendChild(meta);
    }
    // Preview: first ~60 chars stripped HTML
    if (report.content) {
        const preview = document.createElement('div');
        preview.className = 'report-tree-item-preview';
        const tmp = document.createElement('div');
        tmp.innerHTML = report.content;
        const text = tmp.textContent || '';
        preview.textContent = text.slice(0, 80);
        item.appendChild(preview);
    }
    return item;
}
// ----------------------------------------------------------------
// FOLDER EXPAND/COLLAPSE
// ----------------------------------------------------------------
/** @private Toggle folder expanded state */
function _toggleFolder(folderId: any) {
    if (expandedFolders.has(folderId)) {
        expandedFolders.delete(folderId);
    } else {
        expandedFolders.add(folderId);
    }
    _buildTree();
}
// ----------------------------------------------------------------
// INLINE FOLDER RENAME
// ----------------------------------------------------------------
/** @private Start inline editing of folder name */
function _startFolderRename(nameEl: any, folder: any) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'report-tree-folder-name-input';
    input.value = folder.name;
    const finish = () => {
        const newName = input.value.trim();
        if (newName && newName !== folder.name) {
            window.handleRenameFolder?.(folder.id, newName);
        } else {
            _buildTree(); // revert
        }
    };
    input.onblur = finish;
    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            input.blur();
        }
        if (e.key === 'Escape') {
            input.value = folder.name;
            input.blur();
        }
    };
    nameEl.replaceWith(input);
    input.focus();
    input.select();
}
// ----------------------------------------------------------------
// CONTEXT MENUS
// ----------------------------------------------------------------
/** @private Close any open context menu */
function _closeContextMenu() {
    if (activeContextMenu) {
        activeContextMenu.remove();
        activeContextMenu = null;
    }
}
/**
 * Show context menu for a folder.
 * @private
 */
function _showFolderContextMenu(e: any, folder: any) {
    _closeContextMenu();
    const _w = window;
    const menu = document.createElement('div');
    menu.className = 'report-tree-context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    const items = [
        { label: t('reportNewBtn') || 'New Report', action: () => _w.handleAddReport?.(folder.id) },
        { label: t('reportFolderNewBtn') || 'New Sub-folder', action: () => _w.handleAddFolder?.(folder.id) },
        {
            label: t('reportFolderRename') || 'Rename',
            action: () => {
                _closeContextMenu();
                const nameEl = treeContainer?.querySelector(`[data-folder-id="${folder.id}"] .report-tree-folder-name`);
                if (nameEl) _startFolderRename(nameEl, folder);
            },
        },
        { label: t('reportDeleteFolder') || 'Delete Folder', action: () => _w.handleRemoveFolder?.(folder.id) },
    ];
    items.forEach((item: any) => {
        const btn = document.createElement('div');
        btn.className = 'report-tree-context-menu-item';
        btn.textContent = item.label;
        btn.onclick = () => {
            item.action();
            _closeContextMenu();
        };
        menu.appendChild(btn);
    });
    document.body.appendChild(menu);
    activeContextMenu = menu;
}
/**
 * Show context menu for a report.
 * @private
 */
function _showReportContextMenu(e: any, report: any) {
    _closeContextMenu();
    const _w = window;
    const menu = document.createElement('div');
    menu.className = 'report-tree-context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    const items = [
        { label: t('reportDuplicate') || 'Duplicate', action: () => _w.handleDuplicateReport?.(report.id) },
        { label: t('reportRemove') || 'Delete', action: () => _w.handleRemoveReport?.(report.id) },
    ];
    items.forEach((item: any) => {
        const btn = document.createElement('div');
        btn.className = 'report-tree-context-menu-item';
        btn.textContent = item.label;
        btn.onclick = () => {
            item.action();
            _closeContextMenu();
        };
        menu.appendChild(btn);
    });
    document.body.appendChild(menu);
    activeContextMenu = menu;
}
