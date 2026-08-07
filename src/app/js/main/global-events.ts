// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import { UI_INVALIDATION_DOMAINS } from './uiInvalidationRegistry.js';
import { installDataHandlerDelegation } from './dataHandlerDelegation.js';
import { installFileDropIntent } from '../utils/handlers/files.js';

export function setupGlobalEventListeners(
{ handleResize, showToast, isEditing, getEditMode, exitGizmoMode, exitEditMode, getSelectedVertexIndex, setGizmoMode, toggleGizmoSpace, toggleGizmoShapeEdit, toggleSnap, getSelectedElement, getAllElements, updateLanguageSelector, applyTranslations, refreshAutoLabelNames, invalidateUI, updateGlobe, refreshGeoLayers, updateConstellation, updateStatusBar, scheduleSessionSave, scheduleCameraSave, renderVizSettings, renderInspector, handleFileInputChange, handleKeyInputChange, updateAuthUI, translate }: any) {
    if (typeof window === 'undefined' || typeof document === 'undefined')
        return;
    // CSP hardening (SEC item 2): delegação global de data-handler — substitui
    // handlers inline data-cc-action="cc-fe2b6b62" por data-handler="handleX".
    installDataHandlerDelegation();
    // FILE-DROP-INTENT-001: drop de arquivo na tela/painel ecby abre dialog
    // de intenção (Files? wizard?) — flag FILE_DROP_INTENT, no-op quando off.
    installFileDropIntent();
    let resizeTimer: any;
    let prevAuthUser: any = null;
    const invalidate = (domain: string = UI_INVALIDATION_DOMAINS.FULL, reason = 'global-event') => {
        if (typeof invalidateUI === 'function') {
            invalidateUI(domain, reason);
        }
    };
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            handleResize(document.getElementById('canvas-container'));
        }, 100);
    });
    window.addEventListener('ecbyts:loading-stuck', (/** @type {any} */ e) => {
        const elapsedSec = Math.max(1, Math.round(((e as any)?.detail?.elapsedMs || 0) / 1000));
        showToast(`Operacao cancelada por timeout (${elapsedSec}s).`, 'warning');
    });
    document.addEventListener('keydown', (e) => {
        const active = (document.activeElement) as any;
        const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
        if (e.key === 'Escape') {
            const tourTooltip = document.getElementById('tour-tooltip');
            if (tourTooltip && tourTooltip.style.display !== 'none') {
                e.preventDefault();
                window.handleExitTour?.();
                return;
            }
            const demoOverlay = document.getElementById('demo-overlay');
            if (demoOverlay && demoOverlay.style.display !== 'none') {
                e.preventDefault();
                window.handleExitDemo?.();
                return;
            }
        }
        if (e.key === 'Escape' && isEditing()) {
            e.preventDefault();
            if (getEditMode() === 'gizmo')
                exitGizmoMode();
            else
                exitEditMode();
            return;
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput && isEditing()) {
            e.preventDefault();
            if (getEditMode() === 'gizmo') {
                window.handleDeleteEditingElement?.();
            }
            else {
                const hasVertex = getSelectedVertexIndex() >= 0;
                if (hasVertex) {
                    window.handleDeleteSelectedVertex?.();
                }
                else {
                    window.handleDeleteEditingElement?.();
                }
            }
            return;
        }
        if (e.key === 'Enter' && !isInput && isEditing()) {
            e.preventDefault();
            if (getEditMode() === 'draw') {
                window.handleToggleDrawMode?.();
            }
            else {
                window.handleExitShapeEdit?.();
            }
            return;
        }
        if (getEditMode() === 'gizmo' && !isInput && !e.ctrlKey && !e.altKey) {
            if (e.key === 'w' || e.key === 'W') {
                e.preventDefault();
                setGizmoMode('translate');
                return;
            }
            if (e.key === 'e' || e.key === 'E') {
                e.preventDefault();
                setGizmoMode('rotate');
                return;
            }
            if (e.key === 'r' || e.key === 'R') {
                e.preventDefault();
                setGizmoMode('scale');
                return;
            }
            if (e.key === 'x' || e.key === 'X') {
                e.preventDefault();
                toggleGizmoSpace();
                return;
            }
        }
        if ((e.key === 'g' || e.key === 'G') && !isInput && !e.ctrlKey && !e.altKey && isEditing()) {
            e.preventDefault();
            toggleGizmoShapeEdit();
            return;
        }
        if ((e.key === 's' || e.key === 'S') && !isInput && !e.ctrlKey && !e.altKey && isEditing()) {
            e.preventDefault();
            toggleSnap();
            const snapBtn = document.getElementById('edit-ribbon-snap-btn');
            if (snapBtn)
                snapBtn.classList.toggle('active');
            return;
        }
        if ((e.key === 'd' || e.key === 'D') &&
            !isInput &&
            !e.ctrlKey &&
            !e.altKey &&
            isEditing() &&
            getEditMode() !== 'gizmo') {
            e.preventDefault();
            window.handleToggleDrawMode?.();
            return;
        }
        if ((e.key === 'r' || e.key === 'R') &&
            !isInput &&
            !e.ctrlKey &&
            !e.altKey &&
            isEditing() &&
            getEditMode() !== 'gizmo') {
            e.preventDefault();
            window.handleResetShape?.();
            return;
        }
        if ((e.key === 'f' || e.key === 'F') && !isInput && !e.ctrlKey && !e.altKey && !isEditing()) {
            e.preventDefault();
            const sel = getSelectedElement();
            if (sel)
                window.handleZoomToElement?.(sel.id);
            return;
        }
        if (e.key === 'h' && !isInput && !e.ctrlKey && !e.altKey && !e.shiftKey && !isEditing()) {
            e.preventDefault();
            const sel = getSelectedElement();
            if (sel && sel.visible !== false)
                window.handleToggleVisibility?.(sel.id);
            return;
        }
        if (e.key === 'H' && e.shiftKey && !isInput && !e.ctrlKey && !e.altKey && !isEditing()) {
            e.preventDefault();
            const hidden = getAllElements().filter((el: any) => el.visible === false);
            for (const el of hidden) {
                window.handleToggleVisibility?.(el.id);
            }
            return;
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput && !isEditing()) {
            e.preventDefault();
            const sel = getSelectedElement();
            if (sel)
                window.handleRemoveElement?.(sel.id);
            return;
        }
        if (e.key === 'F11' && !isInput) {
            e.preventDefault();
            document.body.classList.toggle('zen-mode');
            return;
        }
        if (e.ctrlKey && e.shiftKey && e.key === 'F' && !isInput) {
            e.preventDefault();
            window.handleToggleFocusMode?.();
            return;
        }
        if (e.ctrlKey && e.shiftKey && e.key === 'S' && !isInput) {
            e.preventDefault();
            window.handleCaptureSnapshot?.();
            return;
        }
        if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
            if (isInput)
                return;
            e.preventDefault();
            window.handleUndo?.();
        }
        if (e.ctrlKey && (e.key === 'y' || (e.key === 'Z' && e.shiftKey))) {
            if (isInput)
                return;
            e.preventDefault();
            window.handleRedo?.();
        }
        if (e.ctrlKey && e.key === 'c') {
            if (isInput)
                return;
            e.preventDefault();
            window.handleCopyElement?.();
        }
        if (e.ctrlKey && e.key === 'v') {
            if (isInput)
                return;
            e.preventDefault();
            window.handlePasteElement?.();
        }
        if (e.ctrlKey && e.key === 'j') {
            if (isInput)
                return;
            e.preventDefault();
            window.handleToggleInspector?.();
        }
    });
    window.addEventListener('languageChanged', () => {
        updateLanguageSelector();
        applyTranslations();
        refreshAutoLabelNames();
        invalidate('full', 'languageChanged');
    });
    window.addEventListener('familiesChanged', () => invalidate('model', 'familiesChanged'));
    window.addEventListener('fieldsChanged', () => invalidate('model', 'fieldsChanged'));
    window.addEventListener('modelChanged', () => invalidate('model', 'modelChanged'));
    window.addEventListener('saoChanged', () => invalidate('analytics', 'saoChanged'));
    window.addEventListener('tickerChanged', () => invalidate('ticker', 'tickerChanged'));
    window.addEventListener('calculatorChanged', () => invalidate('analytics', 'calculatorChanged'));
    window.addEventListener('interpolationChanged', () => invalidate('scene', 'interpolationChanged'));
    window.addEventListener('voxelChanged', () => invalidate('scene', 'voxelChanged'));
    window.addEventListener('groupsChanged', () => invalidate('model', 'groupsChanged'));
    window.addEventListener('reportChanged', () => invalidate('lists', 'reportChanged'));
    window.addEventListener('librariesChanged', () => invalidate('model', 'librariesChanged'));
    window.addEventListener('nnChanged', () => invalidate('analytics', 'nnChanged'));
    window.addEventListener('originChanged', (/** @type {any} */ e) => {
        updateGlobe();
        if ((e as any).detail?.oldOrigin && (e as any).detail?.newOrigin) {
            import('../core/io/geo/coordinates.js' as string).then((mod) => {
                mod.reProjectAllElements((e as any).detail.oldOrigin, (e as any).detail.newOrigin);
                invalidate('model', 'originChanged:reproject');
            }).catch((err: any) => console.debug('[global-events:lazy-geo-reproject:silent-catch]', err?.message || err));
        }
        refreshGeoLayers().catch((err: any) => console.error('[main] refreshGeoLayers failed:', err));
    });
    window.addEventListener('edgesChanged', () => updateConstellation(getSelectedElement()));
    window.addEventListener('shapeEditChanged', () => updateStatusBar());
    window.addEventListener('viewModeChanged', () => scheduleSessionSave());
    window.addEventListener('panelLayoutChanged', () => scheduleSessionSave());
    window.addEventListener('cameraChanged', () => {
        scheduleSessionSave();
        scheduleCameraSave();
    });
    window.addEventListener('vizSettingsChanged', () => renderVizSettings());
    window.addEventListener('inspectorChanged', () => renderInspector());
    window.addEventListener('selectionChanged', () => renderInspector());
    document.getElementById('import-file')?.addEventListener('change', handleFileInputChange);
    document.getElementById('import-key-input')?.addEventListener('input', handleKeyInputChange);
    window.addEventListener('authChanged', () => {
        updateAuthUI();
        invalidate('auth', 'authChanged');
        import('../utils/auth/session.js' as string).then(({ getCurrentUser }) => {
            /** @type {any} */
            const user = getCurrentUser();
            if (user && !prevAuthUser) {
                const name = user.user_metadata?.display_name || user.email?.split('@')[0] || '';
                const msg = name
                    ? (translate('welcomeBackToast') || 'Welcome back, {name}!').replace('{name}', name)
                    : translate('welcomeBackGeneric') || 'Welcome back!';
                showToast(msg, 'info');
                import('../utils/cloud/manager.js' as string)
                    .then((mod) => mod.loadAutosaveLanes())
                    .catch((_e) => console.debug('[main:silent-catch]', _e?.message || _e));
            }
            prevAuthUser = user || null;
        }).catch((err: any) => console.debug('[global-events:lazy-auth-session:silent-catch]', err?.message || err));
    });
    window.addEventListener('apiBridgeUpdate', () => invalidate('full', 'apiBridgeUpdate'));
    window.addEventListener('tabChanged', () => invalidate('full', 'tabChanged'));
}
