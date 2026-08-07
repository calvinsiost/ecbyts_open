// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Module/Handler Context Menu Dispatcher — F2 extension pure-logic
// (SPEC_MODULE_PROVENANCE_LIBRARIES_NAV)
//
// Pure dispatcher que recebe um item do menu (output de
// `buildModuleMenuItems`) + um registry de handlers e retorna um plano
// de execução `{action, handlerRef, payload, allowed, reasonKey}`. NÃO
// executa o handler em si — apenas resolve o que executar; o consumer
// F3 (browser-side) invoca o handler resolvido.
//
// Por que pure-logic separada do array builder:
// - Builder (F2) decide QUAIS itens aparecem; dispatcher decide
//   COMO invocar (resolução de capability + autorização).
// - Cheap-testável sem DOM. Path-isolation safe (NEW file).
//
// Princípios:
// - Default-deny: action desconhecido → not allowed.
// - Capability check separada de handler resolution.
// - NUNCA invoca side-effects (consumer decide).

/** Whitelist de actions reconhecidos. Default-deny enforça. */
const KNOWN_ACTIONS = Object.freeze([
    'handleOpenLibrariesForModule',
    'handleShowModuleProvenance',
    'handleExportModuleSbom',
]);

/**
 * Resolve capabilities de um módulo a partir de registries.
 *
 * @param {string} moduleId
 * @param {{libraryRegistry?: Map|Object, provenanceStore?: Object}} registries
 * @returns {{canOpenLibraries:boolean, canShowProvenance:boolean, moduleInLibrary:boolean, moduleHasProvenance:boolean}}
 */
export function resolveModuleCapabilities(moduleId: any, registries: any) {
    if (typeof moduleId !== 'string' || moduleId === '') {
        throw new TypeError('resolveModuleCapabilities: moduleId required');
    }
    const r = registries || {};
    const libReg = r.libraryRegistry;
    const provStore = r.provenanceStore;
    let inLibrary = false;
    if (libReg) {
        if (typeof libReg.has === 'function') inLibrary = Boolean(libReg.has(moduleId));
        else if (typeof libReg === 'object') inLibrary = Object.prototype.hasOwnProperty.call(libReg, moduleId);
    }
    let hasProv = false;
    if (provStore && provStore.regions) {
        // Provenance store usa convenção `module:<id>:<role>` (do F1).
        const prefix = `module:${moduleId}:`;
        for (const regionId of Object.keys(provStore.regions)) {
            if (regionId.startsWith(prefix)) {
                hasProv = true;
                break;
            }
        }
    }
    return {
        canOpenLibraries: inLibrary,
        canShowProvenance: hasProv,
        moduleInLibrary: inLibrary,
        moduleHasProvenance: hasProv,
    };
}

/**
 * Planeja a execução de um item de menu. Não executa — retorna o
 * `handlerRef` (nome simbólico do window.* handler) + payload + flag
 * `allowed` para o consumer dispatchar via lookup ou window[handlerRef].
 *
 * @param {{id:string, action:string, payload:Object, disabled?:boolean}} item
 * @param {{handlerWhitelist?: Set<string>}} [opts]
 * @returns {{action:string, handlerRef:string|null, payload:Object,
 *   allowed:boolean, reasonKey:string|null}}
 */
export function planMenuDispatch(item: any, opts: any) {
    if (!item || typeof item !== 'object') {
        throw new TypeError('planMenuDispatch: item must be object');
    }
    const action = String(item.action || '');
    const payload = item.payload || {};
    if (!action) {
        return { action: '', handlerRef: null, payload, allowed: false, reasonKey: 'module.prov.dispatch.noAction' };
    }
    if (item.disabled === true) {
        return { action, handlerRef: null, payload, allowed: false, reasonKey: 'module.prov.dispatch.disabled' };
    }
    if (!KNOWN_ACTIONS.includes(action)) {
        return { action, handlerRef: null, payload, allowed: false, reasonKey: 'module.prov.dispatch.unknownAction' };
    }
    const whitelist = opts && opts.handlerWhitelist;
    if (whitelist) {
        const set = whitelist instanceof Set ? whitelist : new Set(Array.isArray(whitelist) ? whitelist : []);
        if (!set.has(action)) {
            return {
                action,
                handlerRef: null,
                payload,
                allowed: false,
                reasonKey: 'module.prov.dispatch.notInWhitelist',
            };
        }
    }
    if (!payload || typeof payload !== 'object' || !payload.moduleId) {
        return { action, handlerRef: null, payload, allowed: false, reasonKey: 'module.prov.dispatch.missingModuleId' };
    }
    return { action, handlerRef: action, payload, allowed: true, reasonKey: null };
}

/**
 * Combina capabilities + builder output em uma lista de itens com
 * `disabled` real (mantém visível p/ descoberta — UX rule do F2).
 *
 * @param {Array<{id:string, labelKey:string, action:string, disabled:boolean, payload:Object}>} rawItems
 * @param {{canOpenLibraries:boolean, canShowProvenance:boolean}} capabilities
 * @returns {Array}
 */
export function applyCapabilitiesToMenu(rawItems: any, capabilities: any) {
    if (!Array.isArray(rawItems)) {
        throw new TypeError('applyCapabilitiesToMenu: rawItems must be array');
    }
    const caps = capabilities || {};
    return rawItems.map((item: any) => {
        if (!item || typeof item !== 'object') return item;
        if (item.id === 'open-libraries') {
            return { ...item, disabled: item.disabled === true || !caps.canOpenLibraries };
        }
        if (item.id === 'show-provenance') {
            return { ...item, disabled: item.disabled === true || !caps.canShowProvenance };
        }
        return item;
    });
}

/** Lista pública dos actions conhecidos (útil em testes/consumer). */
export const MODULE_DISPATCH_ACTIONS = KNOWN_ACTIONS;
