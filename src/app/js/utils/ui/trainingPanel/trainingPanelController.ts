// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   TRAINING PANEL - embedded Training Module LMS shell.

   The panel separates learner work from teacher work:
   - "Estou cursando": courses where the user is enrolled as a learner.
   - "Aulas salvas": courses authored/imported by the user as a teacher.
   - "Catalogo": courses available for enrollment.
   - "Certificados": issued learner certificates.
   ================================================================ */
import { createLogger } from '../../helpers/logger.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../../sharing/deepLinkUrlSync.js';
import { findIntentHintEntry } from '../../../core/training/_intentHintMapPure.js';
import {
    type TrainingPanelDataInput,
    type TrainingPanelState,
    type TrainingTabId,
    cloneTrainingPanelState,
    highlightedTrainingTab,
    isInstructorModeEnabled,
    isTrainingTabId,
    normalizeTrainingPanelData,
    renderTrainingActiveTab,
    renderTrainingPanelShell,
    renderTrainingTabsHtml,
    setInstructorModeEnabled,
    trainingPanelLabel,
} from './trainingPanelRenderers.js';

export { isInstructorModeEnabled, setInstructorModeEnabled } from './trainingPanelRenderers.js';

const log = createLogger('TrainingPanel');

type TrainingActionDetail = { action: string; id: string | null; tab: TrainingTabId };
type TrainingActionHandler = (detail: TrainingActionDetail) => void;

interface TrainingPanelOptions {
    readonly data?: TrainingPanelDataInput;
    readonly activeTab?: string;
    readonly onAction?: TrainingActionHandler;
}

interface LmsAuthoringModule {
    readonly openCourseAuthoringModal?: (
        courseId?: string,
        options?: { readonly initialFocus?: string; readonly startAction?: string },
    ) => unknown;
}

declare global {
    interface Window {
        closeTrainingPanel?: () => void;
        closeLmsModule?: () => void;
    }
}

/** @type {HTMLElement|null} */
let _panelEl: HTMLElement | null = null;
/** @type {HTMLElement|null} */
let _scrimEl: HTMLElement | null = null;
let _activeTab: TrainingTabId = 'myCourses';
/** @type {((detail: {action: string, id: string|null, tab: string}) => void)|null} */
let _onAction: TrainingActionHandler | null = null;
/** @type {TrainingPanelState} */
let _state = normalizeTrainingPanelData();
/** @type {Array<{ element: HTMLElement, inert: boolean, inertAttr: string|null, ariaHidden: string|null }>} */
let _backgroundIsolationStack: Array<{
    element: HTMLElement;
    inert: boolean;
    inertAttr: string | null;
    ariaHidden: string | null;
}> = [];

function _clonePanelState(): TrainingPanelState {
    return cloneTrainingPanelState(_state);
}

/** @param {string} tabId */
function _isKnownTab(tabId: unknown): tabId is TrainingTabId {
    return isTrainingTabId(tabId);
}

function _ensureTrainingPanelStyles() {
    if (typeof document === 'undefined') return;
    if (document.querySelector('link[data-training-panel-css="true"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('../../../../css/training-panel.css', import.meta.url).href;
    link.setAttribute('data-training-panel-css', 'true');
    document.head.appendChild(link);
}

function _ensureTrainingPanelScrim() {
    if (typeof document === 'undefined') return;
    if (_scrimEl && document.body.contains(_scrimEl)) return;
    const scrim = document.createElement('div');
    scrim.id = 'training-panel-scrim';
    scrim.className = 'training-panel-scrim';
    scrim.setAttribute('aria-hidden', 'true');
    document.body.appendChild(scrim);
    _scrimEl = scrim;
}

function _removeTrainingPanelScrim() {
    _scrimEl?.remove();
    _scrimEl = null;
}

function _applyTrainingBackgroundIsolation() {
    if (typeof document === 'undefined') return;
    _restoreTrainingBackgroundIsolation();
    const protectedNodes = new Set([_panelEl, _scrimEl].filter(Boolean));
    _backgroundIsolationStack = Array.from(document.body.children)
        .filter((element) => !protectedNodes.has(element as HTMLElement) && !_isTrainingOwnedOverlay(element))
        .map((element) => {
            const htmlElement = element as HTMLElement;
            return {
                element: htmlElement,
                inert: Boolean(htmlElement.inert),
                inertAttr: htmlElement.getAttribute('inert'),
                ariaHidden: htmlElement.getAttribute('aria-hidden'),
            };
        });
    const active = document.activeElement;
    if (
        _panelEl &&
        active instanceof HTMLElement &&
        _backgroundIsolationStack.some((entry) => entry.element.contains(active))
    ) {
        if (!_panelEl.hasAttribute('tabindex')) _panelEl.tabIndex = -1;
        try {
            _panelEl.focus({ preventScroll: true });
        } catch (error) {
            console.debug('[trainingPanel] focus-before-isolation:', error);
            _panelEl.focus?.();
        }
        if (document.activeElement === active) active.blur();
    }
    for (const entry of _backgroundIsolationStack) {
        entry.element.inert = true;
        entry.element.setAttribute('inert', '');
        entry.element.setAttribute('aria-hidden', 'true');
    }
}

function _isTrainingOwnedOverlay(element: Element | null): boolean {
    if (!element) return false;
    if (element.id === 'lms-authoring-overlay') return true;
    if (element.id === 'lms-author-preview-overlay') return true;
    if (element.id === 'lms-present-overlay') return true;
    if (element.classList?.contains('ecbt-overlay')) return true;
    return Boolean(element.querySelector?.('.lms-author'));
}

function _restoreTrainingBackgroundIsolation() {
    if (!_backgroundIsolationStack.length) return;
    for (const entry of _backgroundIsolationStack) {
        if (!entry?.element) continue;
        entry.element.inert = entry.inert;
        if (entry.inertAttr == null) entry.element.removeAttribute('inert');
        else entry.element.setAttribute('inert', entry.inertAttr);
        if (entry.ariaHidden == null) entry.element.removeAttribute('aria-hidden');
        else entry.element.setAttribute('aria-hidden', entry.ariaHidden);
    }
    _backgroundIsolationStack = [];
}

function _syncPanelMode() {
    const teacherFocus = _activeTab === 'createdCourses';
    _panelEl?.classList.toggle('training-panel--teacher-focus', teacherFocus);
    _scrimEl?.classList.toggle('training-panel-scrim--teacher-focus', teacherFocus);
}

/**
 * Replaces the panel data and rerenders the open panel, if any.
 * @param {TrainingPanelDataInput} [data]
 * @returns {Object}
 */
export function setTrainingPanelData(data: TrainingPanelDataInput = {}): TrainingPanelState {
    _state = normalizeTrainingPanelData(data);
    if (_panelEl && document.body.contains(_panelEl)) {
        _renderTabs();
        _renderActiveTab();
    }
    return _clonePanelState();
}

/**
 * Returns a shallow copy of the current panel data.
 * @returns {Object}
 */
export function getTrainingPanelState(): TrainingPanelState {
    return _clonePanelState();
}

/**
 * Open the Training Module LMS panel.
 * @param {TrainingPanelOptions} [options]
 * @returns {HTMLElement} The panel element
 */
export function openTrainingPanel(options: TrainingPanelOptions = {}): HTMLElement {
    if (typeof window !== 'undefined') {
        window.closeTrainingPanel = closeTrainingPanel;
        window.closeLmsModule = window.closeLmsModule || closeTrainingPanel;
    }
    if (options && typeof options === 'object') {
        if (options.data) setTrainingPanelData(options.data);
        if (options.activeTab && _isKnownTab(options.activeTab)) _activeTab = options.activeTab;
        if (typeof options.onAction === 'function') _onAction = options.onAction;
    }
    // TRAINING-LEARNER-MIN-001 RF-5: entrar explicitamente na aba do professor
    // ("Aulas salvas") é trabalho de instrutor — liga o switch persistido para a
    // aba ficar visível no tablist (evita estado órfão: conteúdo sem aba).
    if (_activeTab === 'createdCourses' && !isInstructorModeEnabled()) setInstructorModeEnabled(true);
    syncDeepLinkUrl('training');
    _ensureTrainingPanelScrim();
    if (_panelEl && document.body.contains(_panelEl)) {
        _syncPanelMode();
        _syncInstructorToggle();
        _applyTrainingBackgroundIsolation();
        _renderTabs();
        _renderActiveTab();
        return _panelEl;
    }
    _ensureTrainingPanelStyles();
    _panelEl = document.createElement('div');
    _panelEl.id = 'training-panel';
    _panelEl.className = 'training-panel';
    _panelEl.setAttribute('role', 'complementary');
    _panelEl.setAttribute('aria-label', trainingPanelLabel('trainingPanel.title', 'Training'));
    _panelEl.innerHTML = _renderPanelShell();
    _syncPanelMode();
    document.body.appendChild(_panelEl);
    _applyTrainingBackgroundIsolation();
    _attachEventListeners();
    _renderActiveTab();
    log.info('Training panel opened');
    return _panelEl;
}

export function closeTrainingPanel() {
    if (_panelEl) {
        _panelEl.remove();
        _panelEl = null;
        _removeTrainingPanelScrim();
        _restoreTrainingBackgroundIsolation();
        clearDeepLinkUrl();
    }
}

export function isTrainingPanelOpen() {
    return _panelEl !== null && document.body.contains(_panelEl);
}

/**
 * TRAINING-LMS-GAPS-001#8: aba ativa corrente do painel. Permite a callers de
 * re-entrada (openLmsModule sem activeTab com o painel JÁ aberto) preservarem
 * a aba em que o usuário está — sem isto, o fallback do lmsManager sobrescrevia
 * a aba do professor ("Aulas salvas") de volta para "Aprender" quando o
 * instrutor ainda não tinha rascunhos salvos.
 */
export function getActiveTrainingTab(): TrainingTabId {
    return _activeTab;
}

function _renderTabsHtml(): string {
    return renderTrainingTabsHtml(_activeTab, _state);
}

function _renderTabs() {
    const tabs = _panelEl?.querySelector('.training-panel-tabs');
    if (!tabs) return;
    tabs.innerHTML = _renderTabsHtml();
    _attachTabListeners();
}

function _renderPanelShell() {
    return renderTrainingPanelShell(_activeTab, _state);
}

function _renderActiveTab() {
    const body = _panelEl?.querySelector('#training-panel-body');
    if (!body) return;
    _syncPanelMode();
    body.innerHTML = renderTrainingActiveTab(_activeTab, _state);
}

/** @param {string|null} tabId */
function _setActiveTab(tabId: string | null): void {
    if (!tabId || !_isKnownTab(tabId)) return;
    _activeTab = tabId;
    _syncPanelMode();
    _syncTabButtons();
    _renderActiveTab();
}

function _syncTabButtons() {
    // RF-5: catálogo é sub-visão de "Aprender" quando a aba não está visível.
    const highlighted = highlightedTrainingTab(_activeTab, isInstructorModeEnabled());
    _panelEl?.querySelectorAll<HTMLElement>('.training-tab-btn').forEach((btn) => {
        const active = btn.getAttribute('data-tab') === highlighted;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
}

// --- TRAINING-LEARNER-MIN-001 RF-5: switch "Modo instrutor" -------------------

function _syncInstructorToggle() {
    _panelEl
        ?.querySelector('.training-instructor-toggle')
        ?.setAttribute('aria-checked', isInstructorModeEnabled() ? 'true' : 'false');
}

function _toggleInstructorMode() {
    const next = !isInstructorModeEnabled();
    setInstructorModeEnabled(next);
    // Desligar o modo enquanto a aba do professor está ativa → volta ao "Aprender".
    if (!next && _activeTab === 'createdCourses') _activeTab = 'myCourses';
    _syncInstructorToggle();
    _renderTabs();
    _syncPanelMode();
    _renderActiveTab();
}

/**
 * RF-2: feedback imediato do "Inscrever-se" — o botão entra em loading
 * (disabled + aria-busy + rótulo "Inscrevendo…") até o manager re-renderizar o
 * painel com o novo estado ("Começar lição 1").
 */
function _markEnrollLoading(button: HTMLButtonElement) {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = trainingPanelLabel('trainingPanel.action.enrolling', 'Enrolling...');
}

/** @param {string} action @param {string|null} id */
function _emitAction(action: string | null, id: string | null): void {
    if (!action) return;
    const detail = { action, id, tab: _activeTab };
    if (typeof _onAction === 'function') _onAction(detail);
    else void _fallbackTeacherAction(detail);
    _panelEl?.dispatchEvent(new CustomEvent('training-panel:action', { bubbles: true, detail }));
}

async function _fallbackTeacherAction(detail: { action: string; id: string | null; tab: string }) {
    const { action, id } = detail;
    if (action !== 'create-course' && action !== 'open-class-file' && action !== 'edit' && action !== 'start-class') return;
    try {
        const mod = (await import('../lmsAuthoringModal.js')) as LmsAuthoringModule;
        if (action === 'create-course') {
            return mod.openCourseAuthoringModal?.();
        }
        if (action === 'open-class-file') {
            return mod.openCourseAuthoringModal?.(undefined, { startAction: 'import-key' });
        }
        if (action === 'edit' && id) {
            return mod.openCourseAuthoringModal?.(id, { initialFocus: 'deck' });
        }
        if (action === 'start-class' && id) {
            return mod.openCourseAuthoringModal?.(id, { initialFocus: 'deck', startAction: 'present' });
        }
    } catch (error: unknown) {
        console.debug('[trainingPanel] fallback action:', error instanceof Error ? error.message : error);
    }
}

function _attachTabListeners() {
    _panelEl?.querySelectorAll<HTMLElement>('.training-tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => _setActiveTab(btn.getAttribute('data-tab')));
        btn.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            _setActiveTab(btn.getAttribute('data-tab'));
        });
    });
}

function _attachEventListeners() {
    if (!_panelEl) return;
    const closeBtn = _panelEl.querySelector('.training-panel-close');
    closeBtn?.addEventListener('click', closeTrainingPanel);
    closeBtn?.addEventListener('keydown', (event: Event) => {
        const keyboardEvent = event as KeyboardEvent;
        if (keyboardEvent.key !== 'Enter' && keyboardEvent.key !== ' ') return;
        keyboardEvent.preventDefault();
        closeTrainingPanel();
    });
    _attachTabListeners();
    _panelEl.querySelector('.training-instructor-toggle')?.addEventListener('click', _toggleInstructorMode);
    _panelEl.addEventListener('click', (event: MouseEvent) => {
        const eventTarget = event.target instanceof Element ? event.target : null;
        const target = eventTarget?.closest<HTMLElement>('[data-training-action]');
        if (!target) return;
        const action = target.getAttribute('data-training-action');
        const id = target.getAttribute('data-training-id');
        if (_handlePanelNavAction(action, id)) return;
        if (action === 'enroll' && target instanceof HTMLButtonElement) _markEnrollLoading(target);
        _emitAction(action, id);
    });
    _panelEl.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const eventTarget = event.target instanceof Element ? event.target : null;
        const target = eventTarget?.closest<HTMLElement>('[role="button"][data-training-action]');
        if (!target) return;
        event.preventDefault();
        const action = target.getAttribute('data-training-action');
        const id = target.getAttribute('data-training-id');
        if (_handlePanelNavAction(action, id)) return;
        _emitAction(action, id);
    });
}

/**
 * RF-1/RF-5: navegações internas do painel (Aprender ⇄ Catálogo) resolvidas no
 * controller — não são ações de dados, não vão ao lmsManager.
 *
 * T8.2: 'open-module' (seção "Dicas que você já viu") reabre o módulo-chave
 * de origem da dica (ex.: Pipelines) chamando de novo o mesmo handler
 * window.<handlerName> já usado pela abertura real — sem depender de uma
 * lição/curso enrolável específico, que a dica não necessariamente tem.
 */
function _handlePanelNavAction(action: string | null, id: string | null = null): boolean {
    if (action === 'show-catalog') {
        _setActiveTab('catalog');
        return true;
    }
    if (action === 'back-to-learning') {
        _setActiveTab('myCourses');
        return true;
    }
    if (action === 'open-module' && id) {
        const entry = findIntentHintEntry(id);
        const fn = entry ? (window as unknown as Record<string, unknown>)[entry.handlerName] : null;
        if (typeof fn === 'function') {
            try {
                (fn as () => unknown)();
            } catch (error: unknown) {
                console.debug('[trainingPanel] open-module:', error instanceof Error ? error.message : error);
            }
        }
        return true;
    }
    return false;
}
