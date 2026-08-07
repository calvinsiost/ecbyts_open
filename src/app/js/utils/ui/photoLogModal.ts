// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   PHOTOLOG MODAL — Capture / Upload / Clipboard photo dialog
   Modal de captura fotografica para o registro PDPLU.

   Tres modos: camera (getUserMedia), upload (file input), clipboard (paste).
   Preview de thumbnail, seletor de elemento, descricao, GPS auto.
   ================================================================ */

import { captureFromClipboard } from '../../core/photolog/capture.js';
import { addPhoto } from '../../core/photolog/manager.js';
import { photoSaveErrorMessage } from '../../core/photolog/_saveErrorMessagePure.js';
import { photoElementOptionLabel } from '../../core/photolog/_elementOptionLabelPure.js';
import { photoGpsCoordsLabel } from '../../core/photolog/_gpsCoordsLabelPure.js';
import { photoSaveDisabled } from '../../core/photolog/_saveDisabledPure.js';
import { getAllElements } from '../../core/elements/manager.js';
import { showToast } from './toast.js';
import { t as _t } from '../i18n/translations.js';
import { createDeepLinkShareButton } from '../sharing/_deepLinkShareButton.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';
const t = (_t as (key: string, fallback?: string) => string);

const MODAL_ID = 'photolog-capture-modal';

/** GPS coordinates extracted from EXIF or Geolocation API. */
interface PhotoGps {
    lat: number;
    lng: number;
    accuracy: number;
}

const _state: {
    blob: Blob | null,
    previewUrl: string | null,
    elementId: string | null,
    gps: PhotoGps | null,
    activeStream: MediaStream | null,
    captureSource: string | null,
} = {
    blob: null,
    previewUrl: null,
    elementId: null,
    gps: null,
    activeStream: null,
    captureSource: null,
};

/** Modal overlay element with attached event handlers (private fields). */
type PhotoLogModalEl = HTMLDivElement & {
    _pasteHandler?: ((e: ClipboardEvent) => void) | null;
    _keyHandler?: ((e: KeyboardEvent) => void) | null;
};

/**
 * Opens the PhotoLog capture modal.
 * @param {{ elementId?: string }} [opts]
 */
export function openPhotoLogModal(opts: { elementId?: string } = {}) {
    _cleanup();
    _state.elementId = opts.elementId || null;

    let modal = document.getElementById(MODAL_ID) as PhotoLogModalEl | null;
    if (!modal) {
        modal = _buildModal();
        document.body.appendChild(modal);
        // DEEP-LINK-TOOLS-001 Sprint 2 — botão Compartilhar (DRY: mesmo
        // pattern de simulationPanel — insertBefore close no .ecbt-header).
        // Payload null porque PhotoLog opera sobre fotos do modelo atual
        // (state seeding deferido para Sprint 3).
        try {
            const header = modal.querySelector('.ecbt-header');
            const close = modal.querySelector('.ecbt-close');
            if (header && close) {
                const shareButton = createDeepLinkShareButton({
                    toolId: 'photolog',
                    getPayload: () => null,
                    toast: showToast,
                });
                header.insertBefore(shareButton, close);
            }
        } catch (e: unknown) {
            console.debug('[photoLogModal:share-button] wire failed', (e instanceof Error ? e.message : e));
        }
    }

    _populateElementDropdown();
    _updatePreview();
    _updateSaveButton();
    modal.style.display = 'flex';
    // Sprint 3 (Calvin 2026-06-03): URL = estado em tempo real
    syncDeepLinkUrl('photolog');

    // Paste listener
    modal._pasteHandler = (e: ClipboardEvent) => {
        const blob = captureFromClipboard(e);
        if (blob) {
            e.preventDefault();
            _setBlob(blob);
        }
    };
    document.addEventListener('paste', modal._pasteHandler);

    // Escape to close
    modal._keyHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') closePhotoLogModal();
    };
    document.addEventListener('keydown', modal._keyHandler);
}

/**
 * Closes the PhotoLog capture modal and cleans up resources.
 */
export function closePhotoLogModal() {
    const modal = document.getElementById(MODAL_ID) as PhotoLogModalEl | null;
    if (!modal) return;

    // Sprint 3 (Calvin 2026-06-03): limpa ?tools=photolog do address bar
    clearDeepLinkUrl();

    if (modal._pasteHandler) {
        document.removeEventListener('paste', modal._pasteHandler);
        modal._pasteHandler = null;
    }
    if (modal._keyHandler) {
        document.removeEventListener('keydown', modal._keyHandler);
        modal._keyHandler = null;
    }

    _stopCamera();
    _cleanup();
    modal.style.display = 'none';
}

// ─── Build UI ───────────────────────────────────────────────

function _buildModal() {
    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'ecbt-overlay';
    modal.style.display = 'none';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    modal.innerHTML = `
        <div class="ecbt-dialog ecbt-dialog--md">
            <div class="ecbt-header">
                <h3 class="ecbt-title" id="photolog-modal-title">${t('photolog.title', 'Registro Fotografico')}</h3>
                <button class="ecbt-close" data-cc-action="cc-425bfedf" title="Fechar" aria-label="Fechar">&times;</button>
            </div>
            <div class="ecbt-form">
                <!-- Source buttons -->
                <div class="photolog-source-buttons">
                    <button class="photolog-source-btn" id="photolog-btn-camera" data-cc-action="cc-476e389c">
                        &#9673; ${t('photolog.capture', 'Tirar Foto')}
                    </button>
                    <button class="photolog-source-btn" id="photolog-btn-upload" data-cc-action="cc-ac56b089">
                        &#9650; ${t('photolog.upload', 'Enviar Foto')}
                    </button>
                    <button class="photolog-source-btn" id="photolog-btn-paste">
                        &#9634; ${t('photolog.paste', 'Colar')}
                    </button>
                    <input type="file" id="photolog-file-input" accept="image/*" style="display:none;"
                        data-cc-change="cc-953cd3b8">
                </div>

                <!-- Camera preview / captured image preview -->
                <div id="photolog-preview-area" class="photolog-preview-area">
                    <video id="photolog-video" class="photolog-preview-video" playsinline aria-label="${t('photolog.cameraPreview', 'Previa da camera')}"></video>
                    <img id="photolog-preview-img" class="photolog-preview-img" alt="${t('photolog.previewAlt', 'Previa da foto capturada')}">
                    <span id="photolog-preview-placeholder" class="photolog-preview-placeholder">
                        ${t('photolog.noPhotos', 'Nenhuma foto ainda')}
                    </span>
                    <button id="photolog-shutter-btn" class="photolog-shutter-btn" data-cc-action="cc-da3d3cba"></button>
                </div>

                <!-- GPS indicator -->
                <div id="photolog-gps-info" class="photolog-gps-info">
                    GPS: <span id="photolog-gps-coords"></span>
                </div>

                <!-- Element selector -->
                <div class="ecbt-field">
                    <label for="photolog-element-select">
                        ${t('photolog.linkedTo', 'Vinculado a')}
                    </label>
                    <select data-field-meta="true" data-field-meta-key="auto:photolog-element-select" id="photolog-element-select" data-cc-change="cc-23f0b573">
                        <option value="">-- Selecionar elemento --</option>
                    </select>
                </div>

                <!-- Description -->
                <div class="ecbt-field">
                    <label for="photolog-description">
                        ${t('photolog.description', 'Descricao')}
                    </label>
                    <input data-field-meta="true" data-field-meta-key="auto:photolog-description" type="text" id="photolog-description" maxlength="500"
                        placeholder="${t('photolog.photoDescriptionPlaceholder')}">
                </div>

                <!-- Actions -->
                <div class="ecbt-actions">
                    <button class="ecbt-btn ecbt-btn--cancel" data-cc-action="cc-425bfedf">Cancelar</button>
                    <button class="ecbt-btn ecbt-btn--primary" id="photolog-save-btn" disabled data-cc-action="cc-6cfbf172">
                        ${t('photolog.save', 'Salvar')}
                    </button>
                </div>
            </div>
        </div>
    `;

    // Clique no overlay fecha
    modal.addEventListener('click', (e: MouseEvent) => {
        if (e.target === modal) closePhotoLogModal();
    });

    return modal;
}

// ─── Camera ─────────────────────────────────────────────────

/**
 * Starts camera capture in the modal preview area.
 */
async function _startCamera() {
    _stopCamera();
    _state.blob = null;
    _updatePreview();

    if (!navigator.mediaDevices?.getUserMedia) {
        showToast(t('photolog.cameraError', 'Camera nao disponivel'), 'warning');
        return;
    }

    const video = document.getElementById('photolog-video') as HTMLVideoElement | null;
    const shutter = document.getElementById('photolog-shutter-btn') as HTMLButtonElement | null;
    const placeholder = document.getElementById('photolog-preview-placeholder') as HTMLElement | null;
    if (!video) return;

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1920 } },
        });
        _state.activeStream = stream;
        video.srcObject = stream;
        video.style.display = 'block';
        if (shutter) shutter.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
        await video.play();
    } catch (err: unknown) {
        const msg =
            (err instanceof Error && err.name === 'NotAllowedError')
                ? 'Permissao de camera negada'
                : t('photolog.cameraError', 'Camera nao disponivel');
        showToast(msg, 'warning');
        _stopCamera();
    }
}

/** Captures current frame from video and sets as blob. */
async function _captureFrame() {
    const video = document.getElementById('photolog-video') as HTMLVideoElement | null;
    if (!video || !_state.activeStream) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);

    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    _stopCamera();
    _setBlob(blob, 'camera');
}

/** Stops all camera tracks. */
function _stopCamera() {
    if (_state.activeStream) {
        _state.activeStream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
        _state.activeStream = null;
    }
    const video = document.getElementById('photolog-video') as HTMLVideoElement | null;
    if (video) {
        video.srcObject = null;
        video.style.display = 'none';
    }
    const shutter = document.getElementById('photolog-shutter-btn') as HTMLButtonElement | null;
    if (shutter) shutter.style.display = 'none';
}

// ─── State helpers ──────────���───────────────────────────────

/**
 * @param blob the image blob (may be null if capture failed)
 * @param source? capture source identifier
 */
function _setBlob(blob: Blob | null, source?: string) {
    _state.blob = blob;
    _state.captureSource = source || 'upload';
    _tryExtractGps(blob);
    _updatePreview();
    _updateSaveButton();
}

/**
 * @param blob the image blob to extract EXIF GPS from
 */
async function _tryExtractGps(blob: Blob | null) {
    _state.gps = null;
    try {
        const { extractExifBasic } = await import('../../core/photolog/exif.js');
        if (!blob) throw new Error('no blob');
        const buffer = await blob.arrayBuffer();
        const exif = extractExifBasic(buffer);
        if (exif.gps) {
            _state.gps = { ...exif.gps, accuracy: 0 };
            _showGps(exif.gps);
            return;
        }
    } catch (e: unknown) {
        console.debug('[photoLogModal] exif:', (e instanceof Error ? e.message : e));
        /* sem EXIF */
    }

    // Fallback: Geolocation API com timeout 5s
    if (navigator.geolocation) {
        try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('timeout')), 5000);
                navigator.geolocation.getCurrentPosition(
                    (p: GeolocationPosition) => {
                        clearTimeout(timer);
                        resolve(p);
                    },
                    (e: GeolocationPositionError) => {
                        clearTimeout(timer);
                        reject(e);
                    },
                    { enableHighAccuracy: true, timeout: 5000 },
                );
            });
            _state.gps = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
            };
            _showGps(_state.gps);
        } catch (e: unknown) {
            console.debug('[photoLogModal] geolocation:', (e instanceof Error ? e.message : e));
            /* sem GPS */
        }
    }
}

/**
 * @param gps coordinates to display (lat/lng)
 */
function _showGps(gps: { lat: number; lng: number }) {
    const el = document.getElementById('photolog-gps-info') as HTMLElement | null;
    const coords = document.getElementById('photolog-gps-coords') as HTMLElement | null;
    if (el && coords && gps) {
        coords.textContent = photoGpsCoordsLabel(gps);
        el.style.display = 'block';
    }
}

function _updatePreview() {
    const img = document.getElementById('photolog-preview-img') as HTMLImageElement | null;
    const placeholder = document.getElementById('photolog-preview-placeholder') as HTMLElement | null;
    const gpsInfo = document.getElementById('photolog-gps-info') as HTMLElement | null;

    if (_state.previewUrl) {
        URL.revokeObjectURL(_state.previewUrl);
        _state.previewUrl = null;
    }

    if (_state.blob && img) {
        _state.previewUrl = URL.createObjectURL(_state.blob);
        img.src = _state.previewUrl;
        img.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
    } else {
        if (img) {
            img.style.display = 'none';
            img.src = '';
        }
        if (placeholder) placeholder.style.display = 'block';
        if (gpsInfo) gpsInfo.style.display = 'none';
    }
}

function _updateSaveButton() {
    const btn = document.getElementById('photolog-save-btn') as HTMLButtonElement | null;
    const select = document.getElementById('photolog-element-select') as HTMLSelectElement | null;
    if (btn) {
        btn.disabled = photoSaveDisabled({
            hasBlob: _state.blob,
            selectValue: select?.value,
            elementId: _state.elementId,
        });
    }
}

function _populateElementDropdown() {
    const select = document.getElementById('photolog-element-select') as HTMLSelectElement | null;
    if (!select) return;

    const elements = getAllElements();
    select.innerHTML = '<option value="">-- Selecionar elemento --</option>';
    for (const el of elements) {
        const opt = document.createElement('option');
        opt.value = el.id;
        opt.textContent = photoElementOptionLabel(el);
        if (el.id === _state.elementId) opt.selected = true;
        select.appendChild(opt);
    }

    // Se pre-selecionado, desabilita dropdown
    if (_state.elementId) {
        select.disabled = true;
    } else {
        select.disabled = false;
    }
}

function _cleanup() {
    _stopCamera();
    if (_state.previewUrl) {
        URL.revokeObjectURL(_state.previewUrl);
        _state.previewUrl = null;
    }
    _state.blob = null;
    _state.gps = null;
    _state.captureSource = null;
}

// ─── Save ────��──────────────────────────────────────────────

async function _save() {
    const select = document.getElementById('photolog-element-select') as HTMLSelectElement | null;
    const descInput = document.getElementById('photolog-description') as HTMLInputElement | null;
    const elementId = _state.elementId || select?.value;

    if (!_state.blob || !elementId) {
        showToast('Selecione um elemento e capture uma foto', 'warning');
        return;
    }

    const saveBtn = document.getElementById('photolog-save-btn') as HTMLButtonElement | null;
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Salvando...';
    }

    const result = await addPhoto(elementId, _state.blob, {
        captureSource: _state.captureSource || 'upload',
        description: descInput?.value || '',
        gps: _state.gps,
    });

    if (result.ok) {
        showToast(t('photolog.saved', 'Foto salva'), 'success');
        closePhotoLogModal();
    } else {
        const msg = photoSaveErrorMessage(result.error);
        showToast(msg, 'error');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = t('photolog.save', 'Salvar');
        }
    }
}

// ─── Window handlers (registered via photolog handler) ──────

// Estas funcoes sao atribuidas ao window no handler de registro.
// Window augmentation: declara os handlers globais com tipos DOM corretos
// (substitui os antigos casts soltos sobre o objeto window).
declare global {
    interface Window {
        _photologCameraCapture?: () => void;
        _photologShutter?: () => void;
        _photologFileSelected?: (input: HTMLInputElement | null) => void;
        _photologElementChanged?: (select: HTMLSelectElement | null) => void;
        _photologSave?: () => void;
    }
}

window._photologCameraCapture = () => _startCamera();
window._photologShutter = () => _captureFrame();
window._photologFileSelected = (input: HTMLInputElement | null) => {
    const file = input?.files?.[0];
    if (file && file.type.startsWith('image/')) {
        _setBlob(file, 'upload');
    }
    if (input) input.value = '';
};
window._photologElementChanged = (select: HTMLSelectElement | null) => {
    _state.elementId = select?.value || null;
    _updateSaveButton();
};
window._photologSave = () => _save();
