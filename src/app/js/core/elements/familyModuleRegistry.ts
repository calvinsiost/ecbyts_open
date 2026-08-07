// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: Family Module Registry
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   FAMILY MODULE REGISTRY — Registro central de sub-modulos
   plugaveis por familia de elemento.

   Cada familia pode ter MULTIPLOS sub-modulos (ex: well pode ter
   "Perfil Construtivo + Litologico" e "Inspecao Fotografica").

   FLUXO:
   1. No boot, cada sub-modulo registra um descriptor leve.
   2. Usuario clica botao "layers" no element card.
   3. Picker mostra sub-modulos disponiveis para a familia.
   4. Usuario seleciona → modal abre → modulo monta via import().
   5. Fechar modal → unmount() limpa DOM e listeners.

   PADRAO: Map-based registry (familyId → descriptor[]).
   ================================================================ */
import { t } from '../../utils/i18n/translations.js';
import { getIcon, hydrateIcons } from '../../utils/ui/icons.js';
import { escapeHtml } from '../../utils/helpers/html.js';
import { lazyImport } from '../../utils/helpers/lazyImport.js';
// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------
/** @type {Map<string, FamilySubModuleDescriptor[]>} familyId → array of sub-module descriptors */
const _registry = new Map();
/** @type {import('./families/_base/FamilyModule.js' as string).FamilyModule|null} Active mounted instance */
let _activeInstance: any = null;
/** @type {string|null} ID of element with active module */
let _activeElementId: any = null;
/** @type {any} Picker DOM element */
let _pickerEl: any = null;
/** @type {any} Modal DOM element */
let _modalEl: any = null;
let _defaultModulesRegistered = false;
// ----------------------------------------------------------------
// TYPES (JSDoc)
// ----------------------------------------------------------------
/**
 * Descriptor de um sub-modulo de familia.
 *
 * @typedef {Object} FamilySubModuleDescriptor
 * @property {string} familyId - ID da familia (ex: 'well')
 * @property {string} moduleId - ID unico do sub-modulo (ex: 'well-profile')
 * @property {string} nameKey - Chave i18n para nome (ex: 'familyModule.wellProfile')
 * @property {string} [icon] - Icone lucide (ex: 'layers')
 * @property {string} [description] - Descricao curta do sub-modulo
 * @property {Function} loader - () => Promise<Module> via import() dinamico
 * @property {string[]} [capabilities] - Ex: ['profile', 'svg-export', 'validation']
 */
// ----------------------------------------------------------------
// REGISTRATION API
// ----------------------------------------------------------------
/**
 * Registra um sub-modulo de familia.
 * Uma familia pode ter multiplos sub-modulos.
 *
 * @param {FamilySubModuleDescriptor} descriptor
 */
export function registerFamilyModule(descriptor: any) {
    if (!descriptor?.familyId || !descriptor?.moduleId) {
        throw new Error('FamilySubModuleDescriptor must have familyId and moduleId');
    }
    if (typeof descriptor.loader !== 'function') {
        throw new Error(`FamilyModule "${descriptor.moduleId}": loader must be a function`);
    }
    if (!_registry.has(descriptor.familyId)) {
        _registry.set(descriptor.familyId, []);
    }
    // Evita duplicatas pelo moduleId
    const modules = (_registry.get(descriptor.familyId)) as any[];
    const existing = modules.findIndex((m: any) => m.moduleId === descriptor.moduleId);
    if (existing >= 0) {
        modules[existing] = descriptor;
    }
    else {
        modules.push(descriptor);
    }
}
function ensureDefaultFamilyModulesRegistered() {
    if (_defaultModulesRegistered) return;
    _defaultModulesRegistered = true;
    registerFamilyModule({
        familyId: 'well',
        moduleId: 'well-profile',
        nameKey: 'familyModule.wellProfile',
        icon: 'layers',
        description: 'Constructive + lithologic well profile with SVG rendering',
        capabilities: ['profile', 'svg-export', 'validation', 'editor'],
        loader: () => import('./families/well/WellProfileModule.js' as string),
    });
    registerFamilyModule({
        familyId: 'well',
        moduleId: 'directional-survey',
        nameKey: 'familyModule.directionalSurvey',
        icon: 'navigation',
        description: 'Directional well survey import (LAS 2.0/3.0 + CSV) and trajectory visualization',
        capabilities: ['las-import', 'csv-import', 'trajectory', 'intersection-source'],
        loader: () => import('./families/well/DirectionalSurveyModule.js' as string),
    });
    registerFamilyModule({
        familyId: 'plume',
        moduleId: 'plume-submodules',
        nameKey: 'familyModule.plumeSubmodules',
        icon: 'droplets',
        description: 'Controles de matriz e forma da pluma com aplicacao explicita',
        capabilities: ['matrix', 'shape', 'validation', 'autosave'],
        loader: () => import('./families/plume/PlumeSubmodulesModule.js' as string),
    });
    registerFamilyModule({
        familyId: 'fault',
        moduleId: 'fault-inspector',
        nameKey: 'familyModule.faultInspector',
        icon: 'activity',
        description: 'Strike/dip structural editor + directional well intersection viewer',
        capabilities: ['editor', 'intersection-report'],
        loader: () => import('./families/fault/FaultInspectorModule.js' as string),
    });
    registerFamilyModule({
        familyId: 'watershed',
        moduleId: 'watershed-delineator',
        nameKey: 'familyModule.watershedDelineator',
        icon: 'droplet',
        description: 'Delineação de bacia hidrográfica (D8 + Priority-Flood) a partir do terreno',
        capabilities: ['delineation', 'flow-path', 'accumulation'],
        loader: () => import('./families/watershed/WatershedModule.js' as string),
    });
    // PRODUCTION-AREA-001 — único ponto de registro real (sem index.ts morto).
    registerFamilyModule({
        familyId: 'production_area',
        moduleId: 'production-process',
        nameKey: 'familyModule.productionProcess',
        icon: 'package',
        description: 'Processo produtivo: subtipo (mineração/petróleo) → etapas com entradas/saídas/taxas',
        capabilities: ['subtype-select', 'mass-balance', 'editor'],
        loader: () => import('./families/production/ProductionProcessModule.js' as string),
    });
}
/**
 * Retorna sub-modulos registrados para uma familia.
 *
 * @param {string} familyId
 * @returns {FamilySubModuleDescriptor[]}
 */
export function getModulesForFamily(familyId: any) {
    ensureDefaultFamilyModulesRegistered();
    return _registry.get(familyId) || [];
}
/**
 * Verifica se uma familia tem sub-modulos registrados.
 *
 * @param {string} familyId
 * @returns {boolean}
 */
export function hasFamilyModule(familyId: any) {
    ensureDefaultFamilyModulesRegistered();
    const modules = _registry.get(familyId);
    return modules != null && modules.length > 0;
}
/**
 * Retorna um sub-modulo especifico pelo moduleId.
 *
 * @param {string} moduleId
 * @returns {FamilySubModuleDescriptor|undefined}
 */
export function getModuleById(moduleId: any) {
    ensureDefaultFamilyModulesRegistered();
    for (const modules of _registry.values()) {
        const found = modules.find((m: any) => m.moduleId === moduleId);
        if (found)
            return found;
    }
    return undefined;
}
/**
 * Retorna todos os descriptors registrados (flat).
 *
 * @returns {FamilySubModuleDescriptor[]}
 */
export function getAllFamilyModules() {
    ensureDefaultFamilyModulesRegistered();
    const all = [];
    for (const modules of _registry.values()) {
        all.push(...modules);
    }
    return all;
}
// ----------------------------------------------------------------
// PICKER - Popover com lista de sub-modulos
// ----------------------------------------------------------------
/**
 * Abre picker de sub-modulos ancorado a um botao.
 * Se a familia tem apenas 1 sub-modulo, abre direto o modal.
 *
 * @param {string} elementId - ID do elemento
 * @param {string} familyId - ID da familia
 * @param {HTMLElement} anchorEl - Botao que disparou o picker
 */
export function openModulePicker(elementId: any, familyId: any, anchorEl: any) {
    const modules = getModulesForFamily(familyId);
    if (modules.length === 0)
        return;
    // Atalho: se so tem 1 sub-modulo, abre direto
    if (modules.length === 1) {
        openModuleModal(elementId, modules[0].moduleId);
        return;
    }
    _closePicker();
    _ensurePickerDOM();
    // Renderiza lista de opcoes
    _pickerEl.innerHTML = modules
        .map((m: any) => `
        <button class="fm-picker__item" data-module-id="${m.moduleId}" data-element-id="${elementId}">
            ${getIcon(m.icon || 'box', { size: '14px' })}
            <span>${t(m.nameKey) || m.moduleId}</span>
        </button>
    `)
        .join('');
    hydrateIcons(_pickerEl);
    // Posiciona ao lado do botao
    const rect = anchorEl.getBoundingClientRect();
    _pickerEl.style.top = `${rect.bottom + 4}px`;
    _pickerEl.style.left = `${rect.left}px`;
    _pickerEl.classList.add('visible');
    // Reposiciona se sair da tela
    requestAnimationFrame(() => {
        const pickerRect = _pickerEl.getBoundingClientRect();
        if (pickerRect.right > window.innerWidth - 8) {
            _pickerEl.style.left = `${window.innerWidth - pickerRect.width - 8}px`;
        }
        if (pickerRect.bottom > window.innerHeight - 8) {
            _pickerEl.style.top = `${rect.top - pickerRect.height - 4}px`;
        }
    });
}
function _ensurePickerDOM() {
    if (_pickerEl)
        return;
    _pickerEl = document.createElement('div');
    _pickerEl.className = 'fm-picker';
    _pickerEl.id = 'family-module-picker';
    document.body.appendChild(_pickerEl);
    // Clique em item do picker
    _pickerEl.addEventListener('click', (e: any) => {
        const item = (e.target as any)?.closest('.fm-picker__item');
        if (!item)
            return;
        const moduleId = item.dataset.moduleId || '';
        const elementId = item.dataset.elementId || '';
        _closePicker();
        openModuleModal(elementId, moduleId);
    });
    // Fechar ao clicar fora
    document.addEventListener('click', (e: any) => {
        if (_pickerEl && !_pickerEl.contains(e.target as any) && !(e.target as any)?.closest('.element-card-modules')) {
            _closePicker();
        }
    });
    // Fechar com Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape')
            _closePicker();
    });
}
function _closePicker() {
    if (_pickerEl)
        _pickerEl.classList.remove('visible');
}
// ----------------------------------------------------------------
// MODAL - Container para sub-modulo montado
// ----------------------------------------------------------------
/**
 * Abre modal com sub-modulo carregado via import().
 *
 * @param {string} elementId - ID do elemento
 * @param {string} moduleId - ID do sub-modulo
 */
export async function openModuleModal(elementId: any, moduleId: any) {
    // REF-SWEEPS RF-2: openModuleModal e chamado fire-and-forget por openModulePicker
    // (atalho de 1 sub-modulo) e pelo click da lista — o import() cru virava
    // 'Uncaught (in promise)'. Sem o manager nao ha elemento para montar o modal.
    const _mgr = await lazyImport('./manager.js', { importer: () => import('./manager.js' as string) });
    if (!_mgr) return;
    const { getElementById } = _mgr;
    const element = getElementById(elementId);
    if (!element)
        return;
    const descriptor = getModuleById(moduleId);
    if (!descriptor)
        return;
    // Desmonta instancia anterior
    unmountActiveFamilyModule();
    _ensureModalDOM();
    // Titulo
    const titleEl = _modalEl.querySelector('.fm-modal__title');
    if (titleEl) {
        titleEl.textContent = `${escapeHtml(element.name)} — ${t(descriptor.nameKey) || descriptor.moduleId}`;
    }
    // Container de conteudo
    const bodyEl = _modalEl.querySelector('.fm-modal__body');
    if (bodyEl)
        bodyEl.innerHTML = '';
    // Mostra modal
    _modalEl.style.display = 'flex';
    try {
        const ModuleClass = await _loadModuleClass(descriptor);
        _activeInstance = new ModuleClass();
        _activeElementId = elementId;
        await _activeInstance.mount(bodyEl, element, { editable: true });
    }
    catch (err: any) {
        console.error(`[FamilyModule] Failed to mount "${moduleId}":`, err);
        if (bodyEl) {
            bodyEl.innerHTML = `<p style="color:var(--red-400);padding:16px;">Error loading module: ${escapeHtml(/** @type {any} */ (err)?.message)}</p>`;
        }
    }
}
/**
 * Fecha modal e desmonta modulo ativo.
 */
export function closeModuleModal() {
    unmountActiveFamilyModule();
    if (_modalEl)
        _modalEl.style.display = 'none';
}
function _ensureModalDOM() {
    if (_modalEl)
        return;
    _modalEl = document.createElement('div');
    // B2 migração 2026-05-29: .modal-overlay → .ecbt-overlay (fm-modal namespace preservado).
    _modalEl.className = 'ecbt-overlay fm-modal';
    _modalEl.style.display = 'none';
    _modalEl.id = 'family-module-modal';
    _modalEl.innerHTML = `
        <div class="fm-modal__container">
            <div class="fm-modal__header">
                <span class="fm-modal__title"></span>
                <button class="fm-modal__close" title="Close">
                    ${getIcon('x', { size: '16px' })}
                </button>
            </div>
            <div class="fm-modal__body"></div>
        </div>
    `;
    document.body.appendChild(_modalEl);
    hydrateIcons(_modalEl);
    // Fechar com botao X
    _modalEl.querySelector('.fm-modal__close')?.addEventListener('click', () => {
        closeModuleModal();
    });
    // Fechar ao clicar no overlay
    _modalEl.addEventListener('click', (e: any) => {
        if (e.target === _modalEl)
            closeModuleModal();
    });
    // Fechar com Escape
    _modalEl.addEventListener('keydown', (e: any) => {
        if (e.key === 'Escape')
            closeModuleModal();
    });
}
// ----------------------------------------------------------------
// LIFECYCLE ORCHESTRATION
// ----------------------------------------------------------------
/**
 * Atualiza modulo ativo com novos dados do elemento.
 *
 * @param {any} element - Elemento com dados atualizados
 */
export function updateFamilyModule(element: any) {
    if (!_activeInstance || !element?.id || element.id !== _activeElementId)
        return;
    try {
        _activeInstance.update(element);
    }
    catch (err: any) {
        console.error(`[FamilyModule] Update failed for "${element.id}":`, err);
    }
}
/**
 * Desmonta modulo de familia ativo.
 */
export function unmountActiveFamilyModule() {
    if (_activeInstance) {
        try {
            _activeInstance.unmount();
        }
        catch (err: any) {
            console.error(`[FamilyModule] Unmount failed for "${_activeElementId}":`, err);
        }
        _activeInstance = null;
        _activeElementId = null;
    }
}
/**
 * Retorna instancia ativa, se existir.
 *
 * @returns {import('./families/_base/FamilyModule.js' as string).FamilyModule|null}
 */
export function getActiveInstance() {
    return _activeInstance;
}
// ----------------------------------------------------------------
// INTERNAL: Module Loading
// ----------------------------------------------------------------
/**
 * Carrega classe do modulo via import() dinamico.
 *
 * @param {FamilySubModuleDescriptor} descriptor
 * @returns {Promise<typeof import('./families/_base/FamilyModule.js' as string).FamilyModule>}
 */
async function _loadModuleClass(descriptor: any) {
    const module = await descriptor.loader();
    const ModuleClass = module.default || module.Module;
    if (!ModuleClass) {
        throw new Error(`Module "${descriptor.moduleId}" must have a default export`);
    }
    return ModuleClass;
}
