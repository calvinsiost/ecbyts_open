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
   INSPECTOR HANDLERS
   Handlers para interacoes do usuario com o painel inspetor JSON.

   Cada funcao e registrada em window.* pelo handlers/index.js.
   ================================================================ */
import { showToast } from '../ui/toast.js';
import { createLogger } from '../helpers/logger.js';
import { getDocsHelpLabel, openDocsHelp } from '../docs/helpRouter.js';
const log = createLogger('Inspector');
import { asyncPrompt } from '../ui/asyncDialogs.js';
import { t } from '../i18n/translations.js';
import { getAllElements, updateElement, getMeshByElementId, removeElement, addElement, } from '../../core/elements/manager.js';
import { rebuildBoundaryGeometry, rebuildRiverGeometry, rebuildExtrudedGeometry, } from '../../core/elements/meshFactory.js';
import { getInspectorConfig, setInspectorCollapsed, setSearchQuery, toggleNodeExpanded, expandAll, collapseAll, } from '../inspector/manager.js';
import { renderInspector, initInspectorPanel } from '../inspector/renderer.js';
import { validateEdit, parseInputValue, isReadOnly, isRequired, getElementIndex, getElementSubPath, } from '../inspector/validator.js';
import { buildModel } from '../../core/io/export.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
let _requestUIRefresh: any = null;
/**
 * Inject UI refresh function to avoid circular dependencies.
 * Injeta funcao de refresh de UI para evitar dependencias circulares.
 */
export function setInspectorUpdateAllUI(fn: any) {
    _requestUIRefresh = fn;
}
function requestInspectorUIRefresh(reason = 'inspector.changed') {
    if (!_requestUIRefresh)
        return;
    const domains = [
        UI_INVALIDATION_DOMAINS.INSPECTOR,
        UI_INVALIDATION_DOMAINS.MODEL,
        UI_INVALIDATION_DOMAINS.LISTS,
        UI_INVALIDATION_DOMAINS.SCENE,
        UI_INVALIDATION_DOMAINS.ANALYTICS,
        UI_INVALIDATION_DOMAINS.STATUS,
    ];
    for (const domain of domains)
        _requestUIRefresh(domain, reason);
}
// ----------------------------------------------------------------
// TOGGLE VISIBILITY
// ----------------------------------------------------------------
/**
 * Leva o usuário até a aba onde o painel do inspetor tem caixa.
 *
 * `window.switchConstellationTab` só é publicado quando a barra de abas
 * inicializa — antes disso ele é `undefined`. Um `?.()` aqui devolveria silêncio
 * e o clique voltaria a "não fazer nada", que é o defeito que este código
 * conserta. Então: helper se existir, clique no botão da aba como segundo
 * caminho, e AVISO no console se nenhum dos dois estiver disponível. Degradar é
 * aceitável; degradar sem deixar rastro não é.
 */
function revealInspectorTab() {
    const win = window as any;
    if (typeof win.switchConstellationTab === 'function') {
        win.switchConstellationTab('inspector');
        return true;
    }
    // Segundo caminho: a FUNÇÃO do módulo, não um clique simulado no botão da
    // aba. `botao.click()` foi testado e NÃO funciona — o botão usa delegação
    // `data-cc-action`, que só reage a gesto confiável do navegador (medido
    // 2026-08-07: aba antes e depois do click() programático, inalterada). Foi a
    // mesma armadilha que fez uma bateria automatizada declarar verde enquanto o
    // menu estava morto.
    import('../scene/constellationTable.js' as string)
        .then((mod: any) => mod.switchConstellationTab('inspector'))
        .catch((e: any) => console.warn('[inspector] não foi possível revelar a aba do painel:', e?.message || e));
    return true;
}

/**
 * Toggle inspector panel visibility.
 * Alterna visibilidade do painel inspetor.
 */
function handleToggleInspector() {
    const config = getInspectorConfig();
    const newCollapsed = !config.collapsed;
    setInspectorCollapsed(newCollapsed);
    // Ensure the docked panel DOM exists before rendering. Garante que o
    // painel exista antes de renderizar — o gatilho visivel da toolbar pode
    // ser clicado antes do boot montar o painel (ou apos um orphan).
    initInspectorPanel();
    renderInspector();
    // O painel só tem caixa dentro da aba `inspector` da constelação: fora dela
    // fica display:flex com 0x0. Sem ativar a aba, este handler alternava o
    // estado e NADA aparecia — o item "Inspetor" do menu Mais parecia morto.
    // Medido em produção 2026-08-07: pelo menu, painel 0x0; pela aba do rodapé,
    // 1528x74. Abrir tem de levar o usuário até onde o painel existe.
    if (!newCollapsed) revealInspectorTab();
    // Close ML Studio panel when inspector expands (mutual exclusion)
    if (!newCollapsed) {
        import('../../core/nn/panelRenderer.js' as string)
            .then((mod: any) => {
            const panel = document.getElementById('nn-side-panel');
            if (panel && panel.classList.contains('visible'))
                mod.closePanel();
        })
            .catch((_e: any) => console.debug('[utils/handlers/inspector:silent-catch]', _e?.message || _e));
    }
    window.dispatchEvent(new CustomEvent('inspectorChanged'));
}
// ----------------------------------------------------------------
// TREE NODE TOGGLE
// ----------------------------------------------------------------
/**
 * Toggle expand/collapse of a tree node.
 * Expande ou colapsa um no da arvore.
 */
function handleToggleNode(path: any) {
    toggleNodeExpanded(path);
    renderInspector();
}
// ----------------------------------------------------------------
// EXPAND / COLLAPSE ALL
// ----------------------------------------------------------------
function handleExpandAllNodes() {
    const model = buildModel();
    expandAll(model, 3);
    renderInspector();
}
function handleCollapseAllNodes() {
    collapseAll();
    renderInspector();
}
// ----------------------------------------------------------------
// INLINE EDITING
// ----------------------------------------------------------------
/**
 * Start editing a value inline.
 * Inicia edicao inline de um valor no inspetor.
 */
function handleStartEdit(path: any) {
    if (isReadOnly(path)) {
        showToast(t('fieldReadOnly') || 'Field is read-only', 'warning');
        return;
    }
    const valueSpan = document.querySelector(`.inspector-value[data-path="${CSS.escape(path)}"]`);
    if (!valueSpan || valueSpan.querySelector('input'))
        return; // Already editing
    const model = buildModel();
    const currentValue = getValueAtPath(model, path);
    if (currentValue !== null && typeof currentValue === 'object')
        return; // Can't inline-edit objects/arrays
    // Create input
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'inspector-edit-input';
    input.value = currentValue === null ? 'null' : String(currentValue);
    input.dataset.path = path;
    input.dataset.originalValue = JSON.stringify(currentValue);
    // Replace content
    valueSpan.textContent = '';
    valueSpan.appendChild(input);
    valueSpan.classList.add('editing');
    input.focus();
    input.select();
    // Event handlers
    input.addEventListener('keydown', (e: any) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
            e.preventDefault();
            handleConfirmEdit(path, input.value);
        }
        else if (e.key === 'Escape') {
            e.preventDefault();
            handleCancelEdit(path);
        }
    });
    input.addEventListener('blur', () => {
        // Confirm on blur (unless already cancelled)
        if (valueSpan.contains(input)) {
            handleConfirmEdit(path, input.value);
        }
    });
}
/**
 * Confirm an edit and apply changes.
 * Confirma edicao e aplica alteracoes ao modelo.
 */
function handleConfirmEdit(path: any, rawValue: any) {
    const valueSpan = document.querySelector(`.inspector-value[data-path="${CSS.escape(path)}"]`);
    const input = (valueSpan?.querySelector('input'));
    if (!input)
        return;
    // Resolve the element from the path
    const elemIdx = getElementIndex(path);
    if (elemIdx === null)
        return; // Only element edits supported
    const elements = getAllElements();
    const element = elements[elemIdx];
    if (!element)
        return;
    const originalValue = JSON.parse(input.dataset.originalValue);
    const { value: parsedValue, error: parseError } = parseInputValue(rawValue, originalValue);
    if (parseError) {
        showEditError(valueSpan, input, parseError);
        return;
    }
    const { valid, error } = validateEdit(path, originalValue, parsedValue);
    if (!valid) {
        showEditError(valueSpan, input, error);
        return;
    }
    // Apply the edit to the resolved element
    applyEdit(element, path, parsedValue);
    // Re-render
    renderInspector();
    requestInspectorUIRefresh('inspector.inline-edit-confirmed');
}
/**
 * Cancel an edit and restore original value.
 * Cancela edicao e restaura valor original.
 */
function handleCancelEdit(_path: any) {
    // Simply re-render to restore
    renderInspector();
}
/**
 * Show an error on the edit input.
 * Mostra erro no campo de edicao.
 */
function showEditError(valueSpan: any, input: any, errorMsg: any) {
    valueSpan.classList.add('error');
    input.title = errorMsg;
    input.classList.add('inspector-input-error');
    // Remove error state after 2 seconds
    setTimeout(() => {
        valueSpan.classList.remove('error');
        input.classList.remove('inspector-input-error');
        input.title = '';
    }, 2000);
}
// ----------------------------------------------------------------
// EDIT APPLICATION (data → model → 3D)
// ----------------------------------------------------------------
/**
 * Apply an edit to the element and sync with 3D viewport.
 * Aplica edicao ao elemento e sincroniza com viewport 3D.
 */
function applyEdit(element: any, path: any, newValue: any) {
    // Parse element sub-path: "model.elements.3.data.center.x" → ["data", "center", "x"]
    const parts = getElementSubPath(path);
    if (parts.length === 0)
        return;
    // Top-level element fields (name, label, color, visible)
    const topField = parts[0];
    if (!topField)
        return;
    if (parts.length === 1 && topField !== 'data') {
        updateElement(element.id, { [topField]: newValue });
        // Color change: rebuild mesh to apply
        if (topField === 'color') {
            rebuildElementMesh(element);
        }
        return;
    }
    // Deep path into data: clone data and set value
    if (parts[0] !== 'data' || parts.length < 2)
        return;
    const newData = structuredClone(element.data);
    setDeepValue(newData, parts.slice(1), newValue); // Skip "data"
    updateElement(element.id, { data: newData });
    // Determine if mesh needs rebuild based on what changed
    const subPath = parts.slice(1).join('.');
    if (needsMeshRebuild(element.family, subPath)) {
        rebuildElementMesh(element);
    }
}
/**
 * Set a value deep inside an object using a path array.
 * Define valor profundo em um objeto usando array de caminho.
 */
function setDeepValue(obj: any, pathParts: any, value: any) {
    let current = obj;
    for (let i = 0; i < pathParts.length - 1; i++) {
        const key = pathParts[i];
        if (current[key] === undefined || current[key] === null) {
            // Create intermediate object/array
            const nextKey = pathParts[i + 1];
            current[key] = /^\d+$/.test(nextKey) ? [] : {};
        }
        current = current[key];
    }
    const lastKey = pathParts[pathParts.length - 1];
    current[lastKey] = value;
}
/**
 * Check if a data sub-path change requires mesh rebuild.
 * Verifica se alteracao em sub-caminho requer reconstrucao do mesh.
 */
function needsMeshRebuild(family: any, subPath: any) {
    // Position / geometry fields that affect 3D
    const geometryPatterns = [
        'center.',
        'position.',
        'coordinates.',
        'shape.',
        'vertices',
        'path',
        'width',
        'height',
        'depth',
        'footprint.',
        'dimensions.',
        'rotation.',
    ];
    return geometryPatterns.some((p: any) => subPath.startsWith(p) || subPath.includes('.' + p));
}
/**
 * Rebuild the 3D mesh for an element after data changes.
 * Reconstroi mesh 3D de um elemento apos alteracoes nos dados.
 */
function rebuildElementMesh(element: any) {
    const oldMesh = getMeshByElementId(element.id);
    if (!oldMesh)
        return;
    // In-place geometry rebuild for vertex-based families
    if (element.family === 'boundary' && element.data.vertices) {
        rebuildBoundaryGeometry(oldMesh, element.data.vertices, element.data);
        return;
    }
    if (element.family === 'river' && element.data.path) {
        rebuildRiverGeometry(oldMesh, element.data.path, element.data.width || 4);
        return;
    }
    if ((element.family === 'building' || element.family === 'tank') && element.data.vertices) {
        rebuildExtrudedGeometry(oldMesh, element.data.vertices, element.data);
        return;
    }
    // For other families: full rebuild via remove + re-add
    // This correctly updates meshMap in manager.js
    const { id, family, name, data, _visible, color, label, iconClass, stamps, messages } = element;
    removeElement(id);
    addElement(family, id, name, data, { stamps, messages, color, label, iconClass });
}
// ----------------------------------------------------------------
// PATH UTILITIES
// ----------------------------------------------------------------
/**
 * Get a value from an object by dot-separated path.
 * Obtem valor de um objeto pelo caminho separado por pontos.
 */
function getValueAtPath(obj: any, path: any) {
    const parts = path.split('.');
    if (parts[0] === 'model')
        parts.shift();
    let current = obj;
    for (const part of parts) {
        if (current === null || current === undefined)
            return undefined;
        current = current[part];
    }
    return current;
}
// ----------------------------------------------------------------
// COPY PATH
// ----------------------------------------------------------------
function handleCopyPath(path: any) {
    try {
        navigator.clipboard.writeText(path);
        showToast(t('pathCopied') || 'Path copied', 'success');
    }
    catch (err: any) {
        log.debug('Clipboard API failed, using fallback', err?.message);
        const ta = document.createElement('textarea');
        ta.value = path;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast(t('pathCopied') || 'Path copied', 'success');
    }
}
// ----------------------------------------------------------------
// SEARCH
// ----------------------------------------------------------------
function handleInspectorSearch(query: any) {
    setSearchQuery(query);
    renderInspector();
}
// ----------------------------------------------------------------
// CONTEXT MENU (add/delete items)
// ----------------------------------------------------------------
/**
 * Show context menu for a tree node.
 * Exibe menu de contexto para um no da arvore.
 */
function handleInspectorContextMenu(event: any, path: any, type: any) {
    // Remove existing context menu
    const existing = document.querySelector('.inspector-context-menu');
    if (existing)
        existing.remove();
    const menu = document.createElement('div');
    menu.className = 'inspector-context-menu';
    const items = [];
    // Copy path
    items.push(`<button class="inspector-ctx-item" data-action="copy">${t('copyPath') || 'Copy Path'}</button>`);
    // Plume family: Generate Animation
    const elemIdx = getElementIndex(path);
    if (elemIdx !== null) {
        const el = getAllElements()[elemIdx];
        if (el?.family === 'plume') {
            items.push(`<button class="inspector-ctx-item" data-action="generate-plume-anim" data-element-id="${el.id}">${t('plumeAnimation.generateAnimation') || 'Generate Animation'}</button>`);
        }
    }
    // Array: add item
    if (type === 'array') {
        items.push(`<button class="inspector-ctx-item" data-action="add-item">${t('addItem') || 'Add Item'}</button>`);
    }
    // Object: add key
    if (type === 'object') {
        items.push(`<button class="inspector-ctx-item" data-action="add-key">${t('addKey') || 'Add Key'}</button>`);
    }
    // Delete (if not required)
    if (!isRequired(path)) {
        items.push(`<button class="inspector-ctx-item inspector-ctx-danger" data-action="delete">${t('deleteNode') || 'Delete'}</button>`);
    }
    // Help + Report Bug
    items.push(`<div class="inspector-context-menu-sep"></div>`);
    items.push(`<button class="inspector-ctx-item" data-action="docs-help">${getDocsHelpLabel()}</button>`);
    items.push(`<button class="inspector-ctx-item" data-action="report-bug">${t('reportBug.menuItem') || 'Reportar Bug'}</button>`);
    menu.innerHTML = items.join('');
    // Position at cursor
    menu.style.left = event.clientX + 'px';
    menu.style.top = event.clientY + 'px';
    document.body.appendChild(menu);
    // Auto-reposition if off-screen
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth)
        menu.style.left = window.innerWidth - rect.width - 8 + 'px';
    if (rect.bottom > window.innerHeight)
        menu.style.top = window.innerHeight - rect.height - 8 + 'px';
    // Handle clicks
    menu.addEventListener('click', (e: any) => {
        const btn = (e.target)?.closest?.('.inspector-ctx-item');
        if (!btn)
            return;
        const action = btn.dataset.action || '';
        if (action === 'copy')
            handleCopyPath(path);
        else if (action === 'add-item')
            handleInspectorAddItem(path);
        else if (action === 'add-key')
            handleInspectorAddKey(path);
        else if (action === 'delete')
            handleInspectorDeleteItem(path);
        else if (action === 'generate-plume-anim') {
            const elId = btn.dataset.elementId || '';
            const w = (window);
            if (elId && typeof w.handleOpenPlumeAnimationDialog === 'function') {
                w.handleOpenPlumeAnimationDialog(elId);
            }
        }
        else if (action === 'docs-help') {
            openDocsHelp('elements');
        }
        else if (action === 'report-bug') {
            (window).handleReportBug?.();
        }
        menu.remove();
    });
    // Close on outside click
    const closeMenu = (e: any) => {
        if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
}
// ----------------------------------------------------------------
// ADD / DELETE ITEMS
// ----------------------------------------------------------------
function handleInspectorAddItem(path: any) {
    const elemIdx = getElementIndex(path);
    if (elemIdx === null)
        return;
    const element = getAllElements()[elemIdx];
    if (!element)
        return;
    const model = buildModel();
    const arr = getValueAtPath(model, path);
    if (!Array.isArray(arr))
        return;
    // Default value: empty object if array has objects, empty string otherwise
    const defaultValue = arr.length > 0 && typeof arr[0] === 'object' ? {} : '';
    const subParts = getElementSubPath(path);
    if (subParts[0] !== 'data' || subParts.length < 2)
        return;
    const newData = structuredClone(element.data);
    const dataParts = subParts.slice(1); // skip "data"
    const target = dataParts.length > 0 ? getDeepRef(newData, dataParts) : newData;
    if (Array.isArray(target)) {
        target.push(defaultValue);
        updateElement(element.id, { data: newData });
        renderInspector();
        requestInspectorUIRefresh('inspector.array-item-added');
    }
}
async function handleInspectorAddKey(path: any) {
    const keyName = await asyncPrompt(t('enterKeyName') || 'Enter key name:');
    if (!keyName || !keyName.trim())
        return;
    const elemIdx = getElementIndex(path);
    if (elemIdx === null)
        return;
    const element = getAllElements()[elemIdx];
    if (!element)
        return;
    const subParts = getElementSubPath(path);
    if (subParts[0] !== 'data' || subParts.length < 1)
        return;
    const newData = structuredClone(element.data);
    const dataParts = subParts.slice(1);
    const target = dataParts.length > 0 ? getDeepRef(newData, dataParts) : newData;
    if (target && typeof target === 'object' && !Array.isArray(target)) {
        target[keyName.trim()] = '';
        updateElement(element.id, { data: newData });
        renderInspector();
        requestInspectorUIRefresh('inspector.object-key-added');
    }
}
function handleInspectorDeleteItem(path: any) {
    if (isRequired(path)) {
        showToast(t('fieldRequired') || 'Field is required', 'warning');
        return;
    }
    const elemIdx = getElementIndex(path);
    if (elemIdx === null)
        return;
    const element = getAllElements()[elemIdx];
    if (!element)
        return;
    const subParts = getElementSubPath(path);
    if (subParts[0] !== 'data' || subParts.length < 2)
        return;
    const dataParts = subParts.slice(1);
    const newData = structuredClone(element.data);
    const parentParts = dataParts.slice(0, -1);
    const lastKey = dataParts[dataParts.length - 1];
    if (!lastKey)
        return;
    const parent = parentParts.length > 0 ? getDeepRef(newData, parentParts) : newData;
    if (Array.isArray(parent)) {
        const idx = parseInt(lastKey, 10);
        if (!isNaN(idx) && idx >= 0 && idx < parent.length) {
            parent.splice(idx, 1);
        }
    }
    else if (parent && typeof parent === 'object') {
        delete parent[lastKey];
    }
    updateElement(element.id, { data: newData });
    renderInspector();
    requestInspectorUIRefresh('inspector.item-deleted');
}
/**
 * Get a deep reference into an object by path parts.
 * Obtem referencia profunda em um objeto por partes do caminho.
 */
function getDeepRef(obj: any, parts: any) {
    let current = obj;
    for (const part of parts) {
        if (current === null || current === undefined)
            return undefined;
        current = current[part];
    }
    return current;
}
// ----------------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------------
export const inspectorHandlers = {
    handleToggleInspector,
    handleToggleNode,
    handleStartEdit,
    handleConfirmEdit,
    handleCancelEdit,
    handleExpandAllNodes,
    handleCollapseAllNodes,
    handleInspectorSearch,
    handleCopyPath,
    handleInspectorContextMenu,
    handleInspectorAddItem,
    handleInspectorAddKey,
    handleInspectorDeleteItem,
};
