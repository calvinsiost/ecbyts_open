// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   PHOTO GALLERY — Grid thumbnails + Lightbox viewer
   Galeria de fotos do PhotoLog com grid e visualizador fullscreen.

   - Grid de thumbnails com lazy-load de IDB
   - Lightbox com navegacao prev/next e metadata overlay
   - Filtros por elemento, status de sync
   - Keyboard: setas + Esc
   ================================================================ */
import { getAllPhotos, getPhotosByElement, getPhotoBlob, getPhotoThumb, deletePhoto, getPhotoStats, } from '../../core/photolog/manager.js';
import { getElementById } from '../../core/elements/manager.js';
import { showToast } from './toast.js';
import { asyncConfirm } from './asyncDialogs.js';
import { t as _t } from '../i18n/translations.js';
const t = (_t) as (key: string, params?: any) => string;
import { escapeHtml, escapeAttr } from '../helpers/html.js';
const GALLERY_ID = 'photolog-gallery-modal';
const LIGHTBOX_ID = 'photolog-lightbox';
// URLs criados via createObjectURL - revoke on cleanup
const _objectUrls: Set<string> = new Set();
/** @type {{photos: any[], filterElementId: string|null, filterStatus: string|null, lightboxIndex: number}} */
const _gState: any = {
    photos: [] as any[],
    filterElementId: null,
    filterStatus: null,
    lightboxIndex: -1,
};
// ─── Gallery Grid ───────────────────────────────────────────
/**
 * Opens the photo gallery modal.
 * @param {Object} [opts]
 * @param {string} [opts.elementId] - Filter to specific element
 */
export function openPhotoGallery(opts: any = {}) {
    _gState.filterElementId = opts.elementId || null;
    _gState.filterStatus = null;
    let modal: any = document.getElementById(GALLERY_ID);
    if (!modal) {
        modal = _buildGallery();
        document.body.appendChild(modal);
    }
    _refreshGallery();
    modal.style.display = 'flex';
    modal._keyHandler = (e: any) => {
        if (e.key === 'Escape') {
            if (_gState.lightboxIndex >= 0)
                closeLightbox();
            else
                closePhotoGallery();
        }
    };
    document.addEventListener('keydown', modal._keyHandler);
}
/**
 * Closes the photo gallery.
 */
export function closePhotoGallery() {
    closeLightbox();
    const modal = (document.getElementById(GALLERY_ID)) as any;
    if (!modal)
        return;
    if (modal._keyHandler) {
        document.removeEventListener('keydown', modal._keyHandler);
        modal._keyHandler = null;
    }
    _revokeAllUrls();
    modal.style.display = 'none';
}
function _buildGallery() {
    const modal = document.createElement('div');
    modal.id = GALLERY_ID;
    modal.className = 'ecbt-overlay';
    modal.style.display = 'none';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
        <div class="photolog-gallery-dialog">
            <div class="ecbt-header">
                <h3 class="ecbt-title">${t('photolog.gallery', 'Galeria de Fotos')}</h3>
                <button class="ecbt-close" data-cc-action="cc-fffa01bc" title="${t('common.close')}" aria-label="${t('common.close')}">&times;</button>
            </div>
            <div class="ecbt-filters">
                <select id="photolog-gallery-filter-el" class="photolog-filter-el" data-cc-change="cc-123af425">
                    <option value="">Todos os elementos</option>
                </select>
                <select id="photolog-gallery-filter-status" class="photolog-filter-status" data-cc-change="cc-123af425">
                    <option value="">Todos os status</option>
                    <option value="local">&#9675; Local</option>
                    <option value="synced">&#9679; Sincronizado</option>
                    <option value="failed">! Falhou</option>
                    <option value="unresolvable">? Indisponivel</option>
                </select>
                <span id="photolog-gallery-stats" class="ecbt-stat"></span>
            </div>
            <div id="photolog-gallery-grid" class="photolog-gallery-grid">
            </div>
        </div>
    `;
    modal.addEventListener('click', (e: any) => {
        if (e.target === modal)
            closePhotoGallery();
    });
    return modal;
}
async function _refreshGallery() {
    const photos = _gState.filterElementId ? getPhotosByElement(_gState.filterElementId) : getAllPhotos();
    _gState.photos = _gState.filterStatus
        ? photos.filter((p: any) => p.syncStatus === _gState.filterStatus)
        : photos;
    // Populate element filter
    const elSelect = document.getElementById('photolog-gallery-filter-el');
    if (elSelect) {
        const seen = new Set();
        const options = ['<option value="">Todos os elementos</option>'];
        for (const p of photos) {
            if (!seen.has(p.elementId)) {
                seen.add(p.elementId);
                const el = getElementById(p.elementId);
                const name = el ? el.name || el.id : p.elementId;
                const selected = p.elementId === _gState.filterElementId ? ' selected' : '';
                options.push(`<option value="${p.elementId}"${selected}>${name}</option>`);
            }
        }
        elSelect.innerHTML = options.join('');
    }
    // Stats
    const stats = getPhotoStats();
    const statsEl = document.getElementById('photolog-gallery-stats');
    if (statsEl) {
        const sizeMB = (stats.totalBytes / (1024 * 1024)).toFixed(1);
        statsEl.textContent = t('photoGallery.photosMB', { count: _gState.photos.length, size: sizeMB });
        if (stats.storageWarning) {
            statsEl.style.color = 'var(--color-warning, #f0ad4e)';
        }
    }
    // Render grid
    const grid = document.getElementById('photolog-gallery-grid');
    if (!grid)
        return;
    _revokeAllUrls();
    grid.innerHTML = '';
    if (!_gState.photos.length) {
        grid.innerHTML = `<div class="ecbt-empty photolog-gallery-empty">
            ${t('photolog.noPhotos', 'Nenhuma foto ainda')}
        </div>`;
        return;
    }
    for (let i = 0; i < _gState.photos.length; i++) {
        const photo = _gState.photos[i];
        const card = document.createElement('div');
        card.className = 'photolog-gallery-card';
        card.onclick = () => _openLightbox(i);
        const imgWrap = document.createElement('div');
        imgWrap.className = 'photolog-gallery-card-img';
        const img = document.createElement('img');
        img.alt = photo.description || photo.filename;
        img.loading = 'lazy';
        // Carrega thumbnail de forma assincrona
        _loadThumbForImg(photo, img);
        imgWrap.appendChild(img);
        card.appendChild(imgWrap);
        // Meta footer
        const meta = document.createElement('div');
        meta.className = 'photolog-gallery-card-meta';
        const el = getElementById(photo.elementId);
        const elName = el ? el.name || el.id : photo.elementId;
        meta.innerHTML = `<span class="photolog-gallery-card-name">${escapeHtml(elName)}</span>
            <span>${_syncBadge(photo.syncStatus)}</span>`;
        card.appendChild(meta);
        grid.appendChild(card);
    }
}
/**
 * @param {any} photo
 * @param {any} img
 */
async function _loadThumbForImg(photo: any, img: any) {
    try {
        const thumb = await getPhotoThumb(photo.id);
        if (thumb) {
            const url = URL.createObjectURL(thumb);
            _objectUrls.add(url);
            img.src = url;
        }
        else {
            img.style.background = '#222';
            img.alt = 'Foto indisponivel';
        }
    }
    catch (e: any) {
        console.debug('[photoGallery] loadImg:', /** @type {any} */ (e)?.message || e);
        img.style.background = '#222';
    }
}
/** @param {string} status */
function _syncBadge(status: any) {
    switch (status) {
        case 'synced':
            return `<span class="photolog-sync-badge--synced" title="${t('photoGallery.synced')}">&#9679;</span>`;
        case 'local':
        case 'syncing':
            return `<span class="photolog-sync-badge--local" title="${t('photoGallery.local')}">&#9675;</span>`;
        case 'failed':
            return `<span class="photolog-sync-badge--failed" title="${t('photoGallery.failed')}">!</span>`;
        case 'unresolvable':
            return `<span class="photolog-sync-badge--unresolvable" title="${t('photoGallery.unavailable')}">?</span>`;
        default:
            return '';
    }
}
// ─── Lightbox ───────────────────────────────────────────────
/** @param {number} index */
async function _openLightbox(index: any) {
    _gState.lightboxIndex = index;
    const photo = _gState.photos[index];
    if (!photo)
        return;
    let lb: any = document.getElementById(LIGHTBOX_ID);
    if (!lb) {
        lb = document.createElement('div') as any;
        lb.id = LIGHTBOX_ID;
        lb.className = 'photolog-lightbox';
        document.body.appendChild(lb);
        lb._navHandler = (e: any) => {
            if (e.key === 'ArrowLeft')
                _navLightbox(-1);
            else if (e.key === 'ArrowRight')
                _navLightbox(1);
            else if (e.key === 'Escape')
                closeLightbox();
        };
        document.addEventListener('keydown', lb._navHandler);
    }
    const total = _gState.photos.length;
    const el = getElementById(photo.elementId);
    const elName = el ? el.name || el.id : photo.elementId;
    const dateStr = photo.timestamp ? new Date(photo.timestamp).toLocaleString() : '';
    const gpsStr = photo.gps ? `GPS: ${photo.gps.lat.toFixed(6)}, ${photo.gps.lng.toFixed(6)}` : '';
    lb.innerHTML = `
        <div class="photolog-lightbox-nav">
            <button class="photolog-lightbox-nav-btn" data-cc-action="cc-fd0cada0" ${index <= 0 ? 'disabled' : ''}>&#9664; Prev</button>
            <span>${index + 1} / ${total}</span>
            <button class="photolog-lightbox-nav-btn" data-cc-action="cc-a22dbd15" ${index >= total - 1 ? 'disabled' : ''}>Next &#9654;</button>
            <button class="photolog-lightbox-nav-btn" data-cc-action="cc-f6a1e39b">&times;</button>
        </div>
        <div class="photolog-lightbox-viewport">
            <img id="photolog-lightbox-img" class="photolog-lightbox-img" alt="${escapeAttr(photo.description || photo.filename)}">
        </div>
        <div class="photolog-lightbox-meta">
            <div>
                <strong>${escapeHtml(elName)}</strong> — ${escapeHtml(photo.description || photo.filename)}<br>
                <span class="photolog-lightbox-meta-sub">${dateStr} ${gpsStr ? '&mdash; ' + gpsStr : ''}</span>
            </div>
            <div class="photolog-lightbox-actions">
                <span>${_syncBadge(photo.syncStatus)} ${_syncLabel(photo.syncStatus)}</span>
                <button class="photolog-lightbox-action-btn photolog-lightbox-action-btn--accent" id="photolog-ai-analyze-btn" data-cc-call-click="_photogalleryAnalyze|s:${encodeURIComponent(`${photo.id}`)}">&#9881; ${t('photoGallery.analyzeAI')}</button>
                <button class="photolog-lightbox-action-btn photolog-lightbox-action-btn--danger" data-cc-call-click="_photogalleryDelete|s:${encodeURIComponent(`${photo.id}`)}|s:${encodeURIComponent(`${photo.elementId}`)}">${t('delete')}</button>
            </div>
        </div>
        <div id="photolog-ai-result" class="photolog-ai-result"></div>
    `;
    // Carrega imagem full-size
    const img = (document.getElementById('photolog-lightbox-img')) as any;
    try {
        const blob = await getPhotoBlob(photo.id);
        if (blob && img) {
            const url = URL.createObjectURL(blob);
            _objectUrls.add(url);
            img.src = url;
        }
        else if (img) {
            img.alt = 'Foto indisponivel';
            img.style.background = '#222';
        }
    }
    catch (e: any) {
        console.debug('[photoGallery] objectUrl:', /** @type {any} */ (e)?.message || e);
        /* sem blob */
    }
    // Mostra analise em cache se existir
    _showCachedAnalysis(photo);
}
/** Shows cached AI analysis in the lightbox if available */
/** @param {any} photo */
function _showCachedAnalysis(photo: any) {
    const panel = document.getElementById('photolog-ai-result');
    if (!panel)
        return;
    if (photo._visionAnalysis) {
        panel.style.display = 'block';
        panel.innerHTML = _renderAnalysis(photo._visionAnalysis);
    }
    else {
        panel.style.display = 'none';
    }
}
/** Renders structured AI analysis as HTML */
/** @param {any} cached */
function _renderAnalysis(cached: any) {
    const a = cached.analysis;
    if (!a)
        return '';
    /** @type {Record<string, string>} */
    const condClass: any = { good: 'good', fair: 'fair', poor: 'poor', critical: 'critical' };
    /** @type {Record<string, string>} */
    const sevClass: any = { info: 'info', low: 'low', medium: 'medium', high: 'high', critical: 'critical' };
    let html = `<div class="photolog-ai-header">
        <strong>Analise IA</strong>
        <span class="photolog-ai-header-meta">${cached.provider || ''} ${cached.model || ''} — ${new Date(cached.timestamp).toLocaleString()}</span>
    </div>`;
    // Resumo + condicao
    html += `<div class="photolog-ai-summary">
        <span class="photolog-ai-condition photolog-ai-condition--${condClass[a.condition] || 'info'}">${a.condition?.toUpperCase()}</span>
        ${escapeHtml(a.summary)}
    </div>`;
    // Observacoes
    if (a.observations?.length) {
        html += `<div class="photolog-ai-section-title">Observacoes:</div><ul class="photolog-ai-list">`;
        for (const obs of a.observations) {
            html += `<li>
                <span class="photolog-ai-sev--${sevClass[obs.severity] || 'info'}">&#9679;</span>
                <strong>[${escapeHtml(obs.category)}]</strong> ${escapeHtml(obs.description)}
                ${obs.location ? `<span class="photolog-ai-location"> — ${escapeHtml(obs.location)}</span>` : ''}
            </li>`;
        }
        html += '</ul>';
    }
    // Riscos
    if (a.risks?.length) {
        html += `<div class="photolog-ai-section-title">Riscos:</div><ul class="photolog-ai-list">`;
        for (const risk of a.risks) {
            html += `<li>
                <span class="photolog-ai-sev--${sevClass[risk.severity] || 'info'}">&#9650;</span>
                <strong>[${escapeHtml(risk.type)}]</strong> ${escapeHtml(risk.description)}
                ${risk.recommendation ? `<br><span class="photolog-ai-recommendation">&#8594; ${escapeHtml(risk.recommendation)}</span>` : ''}
            </li>`;
        }
        html += '</ul>';
    }
    // Recomendacoes
    if (a.recommendations?.length) {
        html += `<div class="photolog-ai-section-title">Recomendacoes:</div><ol class="photolog-ai-list">`;
        for (const rec of a.recommendations) {
            html += `<li>${escapeHtml(rec)}</li>`;
        }
        html += '</ol>';
    }
    // Flags regulatorias
    if (a.regulatoryFlags?.length) {
        html += `<div class="photolog-ai-section-title">Alertas Regulatorios:</div>`;
        for (const flag of a.regulatoryFlags) {
            const fClass = flag.severity === 'violation' ? 'violation' : flag.severity === 'warning' ? 'warning' : 'info';
            html += `<div class="photolog-ai-reg-flag photolog-ai-reg-flag--${fClass}">
                <strong>${escapeHtml(flag.regulation)}</strong>: ${escapeHtml(flag.issue)}
            </div>`;
        }
    }
    // Elementos PDPLU identificados
    if (a.pdpluElements?.length) {
        html += `<div class="photolog-ai-section-title">Elementos PDPLU: ${a.pdpluElements.map((e: any) => `<span class="photolog-ai-pdplu-tag">${escapeHtml(e)}</span>`).join('')}</div>`;
    }
    return html;
}
export function closeLightbox() {
    const lb = (document.getElementById(LIGHTBOX_ID)) as any;
    if (!lb)
        return;
    if (lb._navHandler) {
        document.removeEventListener('keydown', lb._navHandler);
        lb._navHandler = null;
    }
    lb.remove();
    _gState.lightboxIndex = -1;
}
/** @param {number} delta */
function _navLightbox(delta: any) {
    const next = _gState.lightboxIndex + delta;
    if (next >= 0 && next < _gState.photos.length) {
        _openLightbox(next);
    }
}
/** @param {string} status */
function _syncLabel(status: any) {
    switch (status) {
        case 'synced':
            return t('photolog.synced', 'Sincronizado');
        case 'local':
            return t('photolog.syncPending', 'Pendente');
        case 'syncing':
            return 'Sincronizando...';
        case 'failed':
            return t('photolog.syncFailed', 'Falhou');
        case 'unresolvable':
            return 'Indisponivel';
        default:
            return '';
    }
}
/**
 * @param {string} photoId
 * @param {string} elementId
 */
async function _handleDelete(photoId: any, elementId: any) {
    const ok = await asyncConfirm(t('photolog.deleteConfirm') || 'Excluir esta foto?', {
        confirmLabel: t('delete') || 'Excluir',
        cancelLabel: t('cancel') || 'Cancelar',
        destructive: true,
    } as any);
    if (!ok)
        return;
    const result = await deletePhoto(photoId, elementId);
    if (result.ok) {
        showToast(t('photoGallery.photoDeleted'), 'success');
        closeLightbox();
        _refreshGallery();
    }
    else {
        showToast(t('photoGallery.photoDeleteError'), 'error');
    }
}
/** @param {string} photoId */
async function _handleAnalyze(photoId: any) {
    const btn = (document.getElementById('photolog-ai-analyze-btn')) as any;
    const panel = document.getElementById('photolog-ai-result');
    if (!panel)
        return;
    // Loading state
    if (btn) {
        btn.disabled = true;
        btn.textContent = t('common.analyzing');
    }
    panel.style.display = 'block';
    panel.innerHTML = `<div class="photolog-ai-status">&#9881; ${t('photoGallery.analyzingImage')}</div>`;
    try {
        const { analyzePhoto, isVisionAvailable } = await import('../../core/photolog/visionAnalyzer.js' as string);
        if (!isVisionAvailable()) {
            panel.innerHTML =
                '<div class="photolog-ai-warning">Chave de API nao configurada. <button class="photolog-ai-config-btn" data-cc-action="cc-9e38a2b9">&#9881; Configurar API</button></div>';
            if (btn) {
                btn.disabled = false;
                btn.textContent = `&#9881; ${t('photoGallery.analyzeAI')}`;
            }
            return;
        }
        const result = await analyzePhoto(photoId);
        if (result.ok) {
            showToast(t('photoGallery.analysisCompleted'), 'success');
            panel.innerHTML = _renderAnalysis({
                analysis: result.analysis,
                provider: result.provider,
                model: result.model,
                timestamp: result.timestamp,
            });
        }
        else {
            if (result.error === 'no_api_key') {
                panel.innerHTML = `<div class="photolog-ai-error">${t('photoGallery.apiKeyNotConfigured')} <button class="photolog-ai-config-btn" data-cc-action="cc-9e38a2b9">&#9881; ${t('photoGallery.configureAPI')}</button></div>`;
            }
            else {
                panel.innerHTML = `<div class="photolog-ai-error">Erro: ${escapeHtml(result.error)}</div>`;
            }
        }
    }
    catch (err: any) {
        panel.innerHTML = `<div class="photolog-ai-error">Erro: ${escapeHtml(/** @type {any} */ (err).message)}</div>`;
    }
    if (btn) {
        btn.disabled = false;
        btn.textContent = `&#9881; ${t('photoGallery.analyzeAI')}`;
    }
}
function _revokeAllUrls() {
    for (const url of _objectUrls) {
        URL.revokeObjectURL(url);
    }
    _objectUrls.clear();
}
// ─── Window handlers (internos - handlers publicos registrados em handlers/photolog.js) ──
/** @type {any} */ (window)._photogalleryNav = (delta: any) => _navLightbox(delta);
(window as any)._photogalleryDelete = (photoId: any, elementId: string) => _handleDelete(photoId, elementId);
/** @type {any} */ (window)._photogalleryAnalyze = (photoId: any) => _handleAnalyze(photoId);
/** @type {any} */ (window)._photogalleryFilterChanged = () => {
    const elSelect = (document.getElementById('photolog-gallery-filter-el')) as any;
    const statusSelect = (document.getElementById('photolog-gallery-filter-status')) as any;
    _gState.filterElementId = elSelect?.value || null;
    _gState.filterStatus = statusSelect?.value || null;
    _refreshGallery();
};
