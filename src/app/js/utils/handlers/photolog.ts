// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   PHOTOLOG HANDLERS — Window handlers for PhotoLog feature
   Handlers globais para registro fotografico PDPLU.

   Expoe funcoes no window.* para onclick do HTML.
   ================================================================ */
import { openPhotoLogModal, closePhotoLogModal } from '../ui/photoLogModal.js';
import { openPhotoGallery, closePhotoGallery, closeLightbox } from '../ui/photoGallery.js';
import { syncPendingPhotos, getPhotoStats, setPhotologUpdateAllUI } from '../../core/photolog/manager.js';
import { showToast } from '../ui/toast.js';
import * as _photologManagerModule from '../../core/photolog/manager.js';
import * as _photologExifModule from '../../core/photolog/exif.js';
import * as _photologVisionModule from '../../core/photolog/visionAnalyzer.js';
import { getAllElements, addElement as _addElement } from '../../core/elements/manager.js';
import { createLogger } from '../helpers/logger.js';
import { t } from '../i18n/translations.js';
import { isCapabilityEnabled } from '../../config/libraryCategories.js';
const log = createLogger('Photolog');
// Expose modules for E2E test access (Playwright page.evaluate)
window.__photologManager = _photologManagerModule;
window.__photologExif = _photologExifModule;
window.__photologVision = _photologVisionModule;
window.__testGetAllElements = getAllElements;
window.__testAddElement = _addElement;
// Cascade: limpa fotos quando elemento e removido
window.addEventListener('ecbt:elementRemoved', async (e: any) => {
    const elementId = e.detail?.id;
    if (elementId) {
        try {
            const { deletePhotosByElement } = await import('../../core/photolog/manager.js' as string);
            await deletePhotosByElement(elementId);
        } catch (e: any) {
            console.debug('[handlers/photolog] deletePhotos:', e?.message || e);
            /* photolog nao carregado */
        }
    }
});
/**
 * Injeta callback de invalidacao de UI apos operacoes.
 * @param {(...args: any[]) => any} fn
 */
export function setPhotologHandlerUpdateAllUI(fn: any) {
    setPhotologUpdateAllUI(fn);
}
/**
 * Opens the photo gallery (global or filtered by element).
 * @param {string} [elementId] - optional element filter
 */
function handleOpenPhotoLog(elementId: any) {
    // MOD-LIB-MIG-001 M2 — respeita o toggle do Library Hub. Default = enabled.
    if (!isCapabilityEnabled('photolog')) {
        showToast(
            t('library.capabilityDisabled')
                || 'Este módulo está desativado no Library Hub. Reative para usar.',
            'warning',
        );
        return;
    }
    openPhotoGallery({ elementId: elementId || undefined });
}
/**
 * Opens the capture modal for a specific element.
 * @param {string} [elementId] - pre-selected element
 */
function handleCapturePhoto(elementId: any) {
    openPhotoLogModal({ elementId: elementId || undefined });
}
/**
 * Opens the capture modal in upload mode.
 * @param {string} [elementId]
 */
function handleUploadPhoto(elementId: any) {
    openPhotoLogModal({ elementId: elementId || undefined });
}
/** Closes the capture modal. */
function handleClosePhotoLogModal() {
    closePhotoLogModal();
}
/** Closes the gallery. */
function handleClosePhotoGallery() {
    closePhotoGallery();
}
/** Closes the lightbox viewer. */
function handleCloseLightbox() {
    closeLightbox();
}
/** Toggles 3D photo markers visibility. */
async function handleTogglePhotoMarkers() {
    try {
        const mod = await import('../../core/photolog/photoMarker.js' as string);
        const current = mod.getPhotoMarkersVisible();
        mod.setPhotoMarkersVisible(!current);
    } catch (err: any) {
        log.error('Failed to toggle photo markers', err?.message);
    }
}
/**
 * Analyzes a photo with AI vision.
 * @param {string} photoId
 */
async function handleAnalyzePhoto(photoId: any) {
    try {
        const { analyzePhoto } = await import('../../core/photolog/visionAnalyzer.js' as string);
        const result = await analyzePhoto(photoId);
        if (result.ok) {
            showToast('Analise IA concluida', 'success');
        } else {
            showToast(`Analise falhou: ${result.error}`, 'error');
        }
        return result;
    } catch (err: any) {
        log.error('AI photo analysis failed', err?.message);
        showToast('Erro na analise IA', 'error');
        return { ok: false, error: err?.message };
    }
}
/**
 * Manually triggers sync of pending photos.
 */
async function handleSyncPhotos() {
    showToast('Sincronizando fotos...', 'info');
    const result = await syncPendingPhotos();
    if (result.ok) {
        const msg = `Fotos sincronizadas: ${result.synced} OK, ${result.failed} falhas`;
        showToast(msg, result.failed > 0 ? 'warning' : 'success');
    } else {
        showToast('Erro na sincronizacao — verifique sua conexao', 'error');
    }
}
/**
 * Returns photo stats (programmatic access via window).
 * @returns {Object} stats
 */
function handleGetPhotoStats() {
    return getPhotoStats();
}
/**
 * Toggles Offline Field Mode and refreshes the statusbar badge.
 * Alterna o Modo Campo Offline e atualiza o badge do statusbar.
 */
async function handleToggleFieldMode() {
    try {
        const { toggleFieldMode } = await import('../storage/offlineFieldMode.js' as string);
        const forced = toggleFieldMode();
        const { renderFieldModeBadge } = await import('../ui/fieldModeBadge.js' as string);
        renderFieldModeBadge();
        showToast(forced ? t('fieldModeToggledOn') : t('fieldModeToggledOff'), forced ? 'warning' : 'success');
    } catch (err: any) {
        log.error('Failed to toggle field mode', err?.message);
    }
}
export const photologHandlers = {
    handleOpenPhotoLog,
    handleCapturePhoto,
    handleUploadPhoto,
    handleClosePhotoLogModal,
    handleClosePhotoGallery,
    handleCloseLightbox,
    handleTogglePhotoMarkers,
    handleAnalyzePhoto,
    handleSyncPhotos,
    handleGetPhotoStats,
    handleToggleFieldMode,
};
