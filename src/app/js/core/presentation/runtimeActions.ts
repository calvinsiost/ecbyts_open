// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost - AGPL-3.0-only
//
// Presentation Runtime Actions - bridge between presentation steps and real app UI.
/**
 * @param {any} ms
 * @returns {Promise<void>}
 */
function _delay(ms: any) {
    const waitMs = Math.max(0, Number(ms) || 0);
    if (waitMs === 0)
        return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, waitMs));
}
/**
 * @param {any} value
 * @returns {Array<any>}
 */
function _asArray(value: any) {
    return Array.isArray(value) ? value : [];
}
/**
 * @param {any} value
 * @returns {string[]}
 */
function _normalizeFamilyList(value: any) {
    if (value instanceof Set)
        return [...value].map(String).filter(Boolean);
    if (Array.isArray(value))
        return value.map(String).filter(Boolean);
    return [];
}
/**
 * @param {any} ids
 * @returns {string[]}
 */
function _normalizeModalIds(ids: any) {
    if (Array.isArray(ids) && ids.length)
        return ids.map(String);
    return ['family-select-modal', 'eis-dashboard-modal', 'validation-profile-modal-root', 'temporal-analysis-modal'];
}
/**
 * @param {any} elements
 * @param {{preferredFamilies?: any, preferredParameters?: any, minObservations?: number}} [opts]
 * @returns {{elementId: any, familyId: string, parameterId: string, parameterCount: number, observationCount: number}|null}
 */
function _pickTemporalAnalysisCandidate(elements: any, { preferredFamilies = [], preferredParameters = [], minObservations = 3 }: any = {}) {
    const familyRank = new Map(_normalizeFamilyList(preferredFamilies).map((familyId: any, index: any) => [familyId, index]));
    const parameterRank = new Map(_normalizeFamilyList(preferredParameters).map((parameterId: any, index: any) => [parameterId, index]));
    const minObs = Math.max(3, Number(minObservations) || 3);
    const candidates = _asArray(elements)
        .map((element: any) => {
        const observations = _asArray(element?.data?.observations).filter((observation: any) => observation?.parameterId && Number.isFinite(Number(observation.value)));
        if (observations.length < minObs)
            return null;
        const paramCounts = new Map();
        for (const observation of observations) {
            const parameterId = String(observation.parameterId);
            paramCounts.set(parameterId, (paramCounts.get(parameterId) || 0) + 1);
        }
        /** @type {Array<[string, number]>} */
        const parameterEntries = [...paramCounts.entries()];
        const parameterChoice = parameterEntries
            .sort((left: any, right: any) => {
            const leftRank = parameterRank.get(left[0]) ?? Number.MAX_SAFE_INTEGER;
            const rightRank = parameterRank.get(right[0]) ?? Number.MAX_SAFE_INTEGER;
            if (leftRank !== rightRank)
                return leftRank - rightRank;
            if (left[1] !== right[1])
                return right[1] - left[1];
            return left[0].localeCompare(right[0]);
        })
            .at(0);
        if (!parameterChoice)
            return null;
        return {
            elementId: element.id,
            familyId: String(element.family || ''),
            parameterId: parameterChoice[0],
            parameterCount: parameterChoice[1],
            observationCount: observations.length,
        };
    })
        .filter(
    /** @returns {c is {elementId: any, familyId: string, parameterId: string, parameterCount: number, observationCount: number}} @param {any} moduleId */ (c) => Boolean(c))
        .sort((left: any, right: any) => {
        const leftFamilyRank = familyRank.get(left.familyId) ?? Number.MAX_SAFE_INTEGER;
        const rightFamilyRank = familyRank.get(right.familyId) ?? Number.MAX_SAFE_INTEGER;
        if (leftFamilyRank !== rightFamilyRank)
            return leftFamilyRank - rightFamilyRank;
        if (left.parameterCount !== right.parameterCount)
            return right.parameterCount - left.parameterCount;
        if (left.observationCount !== right.observationCount)
            return right.observationCount - left.observationCount;
        return String(left.elementId).localeCompare(String(right.elementId));
    });
    return candidates[0] || null;
}
/**
 * @param {any} moduleId
 * @returns {boolean}
 */
function _setActiveDataStudioModule(moduleId: any) {
    const normalized = String(moduleId || '')
        .trim()
        .toLowerCase();
    if (!normalized)
        return false;
    const btn = (document.querySelector(`[data-ds-module-btn="${normalized}"]`)) as HTMLElement|null;
    if (!btn)
        return false;
    btn.click();
    return true;
}
/**
 * @param {any} id
 * @returns {Promise<void>}
 */
async function _closeKnownModal(id: any) {
    if (!id)
        return;
    if (id === 'family-select-modal') {
        const { closeModal } = await import('../../utils/ui/modals.js' as string);
        closeModal(id);
        return;
    }
    if (id === 'validation-profile-modal-root') {
        const { closeValidationProfileModal } = await import('../../utils/ui/validationProfileModal.js' as string);
        closeValidationProfileModal();
        return;
    }
    const el = document.getElementById(id);
    if (!el)
        return;
    if (id === 'eis-dashboard-modal') {
        el.classList.remove('active');
        return;
    }
    el.classList.remove('active');
    el.classList.add('hidden');
    if (el.style)
        el.style.display = 'none';
    el.setAttribute?.('aria-hidden', 'true');
}
/**
 * @param {any} action
 * @param {any} [ctx]
 * @returns {Promise<void>}
 */
async function _executeAction(action: any, _ctx: any = {}) {
    if (!action || typeof action !== 'object')
        return;
    if (action.delayMs != null)
        await _delay(action.delayMs);
    /** @type {any} */
    const win = typeof window !== 'undefined' ? window : null;
    switch (action.type) {
        case 'sleep': {
            await _delay(action.ms ?? action.waitAfterMs ?? 0);
            break;
        }
        case 'close_known_surfaces': {
            const modalIds = _normalizeModalIds(action.ids);
            for (const modalId of modalIds) {
                await _closeKnownModal(modalId);
            }
            break;
        }
        case 'switch_group': {
            const { switchGroup } = await import('../../utils/scene/viewRouter.js' as string);
            await switchGroup(action.group, { skipAuthGate: true });
            break;
        }
        case 'switch_view': {
            const { switchView } = await import('../../utils/scene/viewRouter.js' as string);
            await switchView(action.mode, { skipAuthGate: true });
            break;
        }
        case 'fit_all_elements': {
            const { fitAllElements } = await import('../../utils/scene/controls.js' as string);
            fitAllElements();
            break;
        }
        case 'apply_geology_preset': {
            const mod = await import('../../utils/handlers/geology.js' as string);
            await mod.handleGeoPreset(action.preset || 'presentation');
            break;
        }
        case 'open_random_modal': {
            const { openFamilySelectModal, saveFamilySelection, saveRandomOptions } = await import('../../utils/ui/familySelectModal.js' as string);
            const familyIds = _normalizeFamilyList(action.selectedFamilies);
            if (familyIds.length)
                saveFamilySelection('random', new Set(familyIds));
            if (action.options && typeof action.options === 'object') {
                saveRandomOptions(action.options);
            }
            openFamilySelectModal('random', () => { });
            break;
        }
        case 'open_temporal_analysis': {
            if (typeof win?.handleOpenTemporalAnalysis === 'function') {
                await win.handleOpenTemporalAnalysis();
            }
            const manager = await import('../elements/manager.js' as string);
            const candidate = _pickTemporalAnalysisCandidate(manager.getAllElements(), {
                preferredFamilies: action.preferredFamilies,
                preferredParameters: action.preferredParameters,
                minObservations: action.minObservations,
            });
            if (!candidate)
                break;
            const elementSelect = (document.getElementById('temporal-element-select')) as HTMLInputElement|null;
            if (elementSelect)
                elementSelect.value = candidate.elementId;
            if (typeof win?.handleTemporalElementChange === 'function') {
                await win.handleTemporalElementChange(candidate.elementId);
            }
            const paramSelect = (document.getElementById('temporal-param-select')) as HTMLInputElement|null;
            if (paramSelect)
                paramSelect.value = candidate.parameterId;
            if (typeof win?.handleTemporalParamChange === 'function') {
                await win.handleTemporalParamChange(candidate.parameterId);
            }
            if (action.run !== false && typeof win?.handleRunTemporalAnalysis === 'function') {
                await win.handleRunTemporalAnalysis();
            }
            break;
        }
        case 'datastudio_query': {
            const dataStudio = await import('../../utils/datastudio/index.js' as string);
            const editor = await import('../../utils/datastudio/editor.js' as string);
            await dataStudio.initDataStudio();
            if (action.module)
                _setActiveDataStudioModule(action.module);
            if (typeof action.sql === 'string' && action.sql.trim()) {
                editor.setEditorContent(action.sql);
            }
            if (action.run !== false) {
                await dataStudio.executeQuery();
            }
            if (action.analyticsModule) {
                _setActiveDataStudioModule(action.analyticsModule);
            }
            break;
        }
        case 'datastudio_module': {
            await import('../../utils/datastudio/index.js' as string).then((mod) => mod.initDataStudio());
            _setActiveDataStudioModule(action.module);
            break;
        }
        case 'open_eis_dashboard': {
            const mod = await import('../../utils/handlers/eis.js' as string);
            mod.eisHandlers?.handleOpenEisDashboard?.();
            break;
        }
        case 'open_validation_profiles': {
            const mod = await import('../../utils/handlers/validationHandlers.js' as string);
            await mod.validationHandlers?.handleOpenValidationProfiles?.();
            break;
        }
        case 'call_window_handler': {
            const fnName = String(action.handler || '').trim();
            const fn = fnName && win ? win[fnName] : null;
            if (typeof fn === 'function') {
                await fn(..._asArray(action.args));
            }
            break;
        }
        default:
            console.warn('[presentation/runtime] unknown action', action.type, action);
            break;
    }
    if (action.waitAfterMs != null && action.type !== 'sleep') {
        await _delay(action.waitAfterMs);
    }
}
/**
 * @param {any} step
 * @param {any} [ctx]
 * @returns {Promise<void>}
 */
export async function executeStepRuntime(step: any, ctx: any = {}) {
    const actions = _asArray(step?.runtime?.actions);
    for (const action of actions) {
        await _executeAction(action, ctx);
    }
}
