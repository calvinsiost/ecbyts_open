// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   REPORT BUG MODAL - Formulario para usuario reportar bugs
   Modal com tipo, descricao e screenshot opt-in.

   O usuario abre pelo menu "Mais" > "Report Bug".
   Screenshot e capturado automaticamente em background assim que
   html2canvas estiver pronto (CDN e pre-carregado no hover do botao).
   O modal e ocultado brevemente durante a captura para nao aparecer
   no screenshot, depois re-exibido com o preview populado.
   O usuario pode clicar em "Capturar tela" para capturar novamente.
   Envia para Supabase via captureError('bug_report', ...).
   Funciona com ou sem login (anonimo permitido).
   ================================================================ */
import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';
import { showToast } from './toast.js';
import * as reporterModule from '../errorReporting/reporter.js';
const reporter = (reporterModule) as any;
const submitBugReport = /** @type {(payload: any) => Promise<{ok: boolean, id?: string, reason?: string}>} */ (reporter.submitBugReport);
import { prewarmScreenshot } from '../errorReporting/screenshot.js';
import { captureScreen as captureViaEngine } from '../errorReporting/screenCapture.js';
// --- State ---
let _screenshotDataUri: any = null;
/** @type {Array<{name: string, dataUri: string}>} */
let _attachments: any[] = [];
/** @type {object|null} Metadados extras injetados via prefill (ex: code, screen, operation) */
let _prefillMetadata: any = null;
/** @type {number} Token monotonic para invalidar capturas antigas */
let _openSessionToken = 0;
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_SIZE = 2 * 1024 * 1024; // 2MB
// --- Public API ---
/**
 * Open the Report Bug modal.
 * Abre modal de report - captura screenshot em background sem bloquear formulario.
 *
 * @param {{ prefill?: { type?: string, description?: string, metadata?: object } }} options
 *   options.prefill - preenche tipo, descricao e metadados de forma programatica
 *   (usado por handleAppError para abrir o modal ja com contexto do erro)
 */
export async function openReportBugModal(options: any = {}) {
    const openStartedAt = performance.now();
    // Incrementa session token para invalidar capturas/handlers de sessões anteriores
    _openSessionToken++;
    const { prefill } = options;
    let modal = /** @type {any} */ (document.getElementById('report-bug-modal'));
    if (!modal) {
        modal = _createModal();
        document.body.appendChild(modal);
    }
    // Reset form
    const form = (modal.querySelector('.report-bug-form')) as any;
    if (form)
        form.reset();
    _screenshotDataUri = null;
    _attachments = [];
    _prefillMetadata = null;
    _renderAttachmentPreviews();
    // Aplicar prefill se fornecido
    if (prefill) {
        const typeSelect = form?.querySelector('#report-bug-type');
        const descTextarea = form?.querySelector('#report-bug-description');
        if (typeSelect && prefill.type)
            typeSelect.value = prefill.type;
        if (descTextarea && prefill.description)
            descTextarea.value = prefill.description;
        _prefillMetadata = prefill.metadata || null;
    }
    const preview = (modal.querySelector('#report-bug-screenshot-preview')) as any;
    if (preview) {
        preview.src = '';
        preview.style.display = 'none';
    }
    const status = (modal.querySelector('#report-bug-screenshot-status')) as any;
    if (status)
        status.textContent = t('reportBug.screenshotOptional') || 'Click "Capture screen" if needed';
    // Open-first: formulario interativo imediatamente
    modal.style.display = 'flex';
    _focusPrimaryField(modal);
    // PERF 2026-05-02: AUTO-CAPTURE REMOVIDO. html2canvas walk DOM síncrono trava
    // main thread 1-5s mesmo com requestIdleCallback. Usuário reportou que cliques
    // e digitação ficavam unresponsive. Captura agora é 100% opt-in via:
    //   - Botão "Capturar tela" (bloqueio único, esperado pelo usuário)
    //   - Ctrl+V (paste de imagem do clipboard)
    //   - Submit sem screenshot (texto-only, válido)
    // Prewarm CDN em background (sem capturar) - assim primeiro clique em
    // "Capturar" é instantâneo após carregar.
    if (!( /** @type {any} */(window).html2canvas)) {
        prewarmScreenshot();
    }
    _trackTelemetry('navigation', 'report_bug_open_to_interactive_ms', {
        valueMs: Math.round(performance.now() - openStartedAt),
        targetMs: 300,
    });
}
/**
 * Close the Report Bug modal.
 */
export function closeReportBugModal() {
    // Invalida qualquer captura em andamento da sessao anterior
    _openSessionToken++;
    const modal = (document.getElementById('report-bug-modal')) as any;
    if (modal)
        modal.style.display = 'none';
    _screenshotDataUri = null;
    _attachments = [];
    _prefillMetadata = null;
}
// --- Internal ---
function _createModal() {
    const modal = document.createElement('div');
    modal.id = 'report-bug-modal';
    modal.className = 'report-bug-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', t('reportBug.title') || 'Report Bug');
    modal.innerHTML = `
        <div class="report-bug-dialog">
            <div class="report-bug-header">
                <span class="report-bug-title">${escapeHtml(t('reportBug.title') || 'Report Bug')}</span>
                <button class="report-bug-close" id="report-bug-close" type="button" aria-label="Close">&times;</button>
            </div>
            <form class="report-bug-form">
                <div class="report-bug-field">
                    <label for="report-bug-type">${escapeHtml(t('reportBug.type') || 'Type')}</label>
                    <select data-field-meta="true" data-field-meta-key="auto:report-bug-type" id="report-bug-type" required>
                        <option value="bug">${escapeHtml(t('reportBug.typeBug') || 'Bug')}</option>
                        <option value="suggestion">${escapeHtml(t('reportBug.typeSuggestion') || 'Suggestion')}</option>
                        <option value="other">${escapeHtml(t('reportBug.typeOther') || 'Other')}</option>
                    </select>
                </div>
                <div class="report-bug-field">
                    <label for="report-bug-description">${escapeHtml(t('reportBug.description') || 'Description')}</label>
                    <textarea data-field-meta="true" data-field-meta-key="auto:report-bug-description" id="report-bug-description" rows="5" required
                        minlength="10" maxlength="5000"
                        placeholder="${escapeHtml(t('reportBug.descriptionPlaceholder') || 'Describe the issue...')}"></textarea>
                </div>
                <div class="report-bug-field">
                    <div class="report-bug-screenshot-row">
                        <button type="button" class="report-bug-capture-btn" id="report-bug-capture-native-btn"
                            title="${escapeHtml(t('reportBug.captureNativeHint') || 'Capture exactly what you see (recommended)')}">
                            ${escapeHtml(t('reportBug.captureNative') || 'Capture screen (recommended)')}
                        </button>
                        <button type="button" class="report-bug-capture-btn report-bug-capture-btn-secondary" id="report-bug-capture-btn"
                            title="${escapeHtml(t('reportBug.captureAppHint') || 'Capture only the app DOM (no permission prompt)')}">
                            ${escapeHtml(t('reportBug.captureApp') || 'Capture app only')}
                        </button>
                        <span id="report-bug-screenshot-status" class="report-bug-screenshot-status"></span>
                    </div>
                    <img id="report-bug-screenshot-preview" class="report-bug-screenshot-preview"
                        alt="Screenshot preview" style="display: none;">
                    <input type="hidden" id="report-bug-include-screenshot" value="0">
                    <input type="hidden" id="report-bug-screenshot-engine" value="">
                    <label class="report-bug-replay-toggle" title="${escapeHtml(t('reportBug.replayHint') || 'Captures DOM mutations + clicks for debugging. PII auto-masked.')}">
                        <input type="checkbox" id="report-bug-include-replay">
                        <span>${escapeHtml(t('reportBug.replayToggle') || 'Include session replay (last 30s)')}</span>
                    </label>
                </div>
                <div class="report-bug-field">
                    <label>${escapeHtml(t('reportBug.attachImages') || 'Attach images')}</label>
                    <div class="report-bug-attach-area" id="report-bug-attach-area">
                        <input type="file" id="report-bug-file-input" accept="image/*" multiple
                            style="display:none;">
                        <button type="button" class="report-bug-attach-btn" id="report-bug-attach-btn">
                            + ${escapeHtml(t('reportBug.addImage') || 'Add image')}
                        </button>
                        <span class="report-bug-attach-hint">${escapeHtml(t('reportBug.attachHint') || 'Max 3 images, 2MB each')}</span>
                    </div>
                    <div class="report-bug-attach-previews" id="report-bug-attach-previews"></div>
                </div>
                <div class="report-bug-actions">
                    <button type="button" class="report-bug-cancel" id="report-bug-cancel">
                        ${escapeHtml(t('cancel') || 'Cancel')}
                    </button>
                    <button type="submit" class="report-bug-submit" id="report-bug-submit">
                        ${escapeHtml(t('reportBug.send') || 'Send Report')}
                    </button>
                </div>
            </form>
        </div>
    `;
    // Event listeners
    (modal.querySelector('#report-bug-close') as any).addEventListener('click', closeReportBugModal);
    (modal.querySelector('#report-bug-cancel') as any).addEventListener('click', closeReportBugModal);
    // Captura de tela opt-in - duas opções (Sprint 2/3 2026-05-02):
    // - Native (getDisplayMedia): captura exatamente o que o usuário vê,
    //   incluindo browser chrome, WebGL real, dev tools etc.
    //   Requer prompt de permissão do browser.
    // - App-only (modern-screenshot ou html2canvas): captura só o DOM do app,
    //   sem prompt. Útil quando native não é suportado ou foi negado.
    const captureBtn = (modal.querySelector('#report-bug-capture-btn')) as any;
    captureBtn.addEventListener('click', () => _handleCaptureScreenshot(modal, _openSessionToken, 'app'));
    const captureNativeBtn = (modal.querySelector('#report-bug-capture-native-btn')) as any;
    if (captureNativeBtn) {
        captureNativeBtn.addEventListener('click', () => _handleCaptureScreenshot(modal, _openSessionToken, 'native'));
    }
    // Attachment file input
    const fileInput = (modal.querySelector('#report-bug-file-input')) as any;
    (modal.querySelector('#report-bug-attach-btn') as any).addEventListener('click', () => {
        if (_attachments.length >= MAX_ATTACHMENTS) {
            showToast(t('reportBug.maxAttachments') || `Maximum ${MAX_ATTACHMENTS} images`, 'warning');
            return;
        }
        fileInput.click();
    });
    fileInput.addEventListener('change', _handleFileSelect);
    // Sprint 3 (2026-05-02) - session replay opt-in toggle. Quando marcado,
    // habilita rrweb para começar a gravar (lazy-load via CDN). No submit,
    // o reporter anexa o buffer automaticamente via _collectBuffers().
    const replayToggle = (modal.querySelector('#report-bug-include-replay')) as any;
    if (replayToggle) {
        replayToggle.addEventListener('change', async (e: any) => {
            try {
                const sr = await import('../errorReporting/sessionReplay.js' as string);
                if (e.target.checked) {
                    const ok = await sr.enableSessionReplay();
                    if (!ok) {
                        e.target.checked = false;
                        showToast(t('reportBug.replayDisabled') || 'Session replay unavailable', 'warning');
                    }
                }
                else {
                    sr.disableSessionReplay();
                }
            }
            catch (err: any) {
                console.debug('[reportBug] replay-toggle:', /** @type {any} */ (err)?.message || err);
                e.target.checked = false;
            }
        });
    }
    // Fechar ao clicar no overlay
    modal.addEventListener('click', (/** @type {any} */ e) => {
        if (e.target === modal)
            closeReportBugModal();
    });
    // Clipboard paste - Ctrl+V cola imagem diretamente como attachment ou screenshot
    modal.addEventListener('paste', _handlePaste);
    // Submit
    (modal.querySelector('.report-bug-form') as any).addEventListener('submit', async (e: any) => {
        e.preventDefault();
        await _handleSubmit();
    });
    return modal;
}
/**
 * @param {any} modal
 */
function _focusPrimaryField(modal: any) {
    const desc = modal?.querySelector('#report-bug-description');
    if (!(desc instanceof HTMLTextAreaElement))
        return;
    requestAnimationFrame(() => {
        if (!_isModalVisible(modal))
            return;
        desc.focus({ preventScroll: true });
    });
}
/**
 * @param {any} modal
 */
function _isModalVisible(modal: any) {
    return Boolean(modal && modal.style.display === 'flex' && modal.isConnected);
}
/**
 * @param {any} token
 * @param {any} modal
 */
function _isSessionActive(token: any, modal: any) {
    return token === _openSessionToken && _isModalVisible(modal);
}
/**
 * @param {any} modal
 * @param {any} sessionToken
 * @param {any} mode
 */
async function _handleCaptureScreenshot(modal: any, sessionToken: any, mode: any = "app") {
    const captureBtn = (modal.querySelector('#report-bug-capture-btn')) as any;
    const captureNativeBtn = (modal.querySelector('#report-bug-capture-native-btn')) as any;
    const status = (modal.querySelector('#report-bug-screenshot-status')) as any;
    const preview = (modal.querySelector('#report-bug-screenshot-preview')) as any;
    const hiddenInput = (modal.querySelector('#report-bug-include-screenshot')) as any;
    const engineInput = (modal.querySelector('#report-bug-screenshot-engine')) as any;
    /**
     * @param {any} target
     */
    const setBusy = (busy: any) => {
        if (captureBtn)
            captureBtn.disabled = busy;
        if (captureNativeBtn)
            captureNativeBtn.disabled = busy;
    };
    setBusy(true);
    if (status)
        status.textContent = t('reportBug.capturingScreen') || 'Capturing...';
    // Sprint 2 (2026-05-02): captura via engine selecionado.
    // - mode='native' → getDisplayMedia (exatamente o que o usuário vê)
    // - mode='app' → modern-screenshot (3-5x faster), fallback html2canvas
    /** @type {any} */ let captured: any;
    /** @type {any} */ let engineUsed: any;
    if (mode === 'native') {
        // BUG-a949be21: getDisplayMedia captura a tela/aba real (incl. este
        // modal se ele estiver visível por cima) — sem excludeSelectors como
        // no modo 'app', então o modal precisa se esconder ANTES do prompt
        // (o usuário ainda vê a página normalmente por trás dele) e voltar
        // logo após o frame ser capturado.
        const prevVisibility = modal.style.visibility;
        modal.style.visibility = 'hidden';
        let result;
        try {
            result = await captureViaEngine({ mode: 'native' });
        } finally {
            modal.style.visibility = prevVisibility;
        }
        captured = result.dataUri;
        engineUsed = result.engine;
        if (!captured && _isSessionActive(sessionToken, modal)) {
            // Native cancelado ou sem suporte - fallback automático para app DOM
            // B2: includeConfidential=true é legítimo AQUI — captura iniciada
            // pelo usuário com preview no modal antes do envio (consentimento).
            const fb = await captureViaEngine({
                mode: 'auto',
                excludeSelectors: ['#report-bug-modal'],
                includeConfidential: true,
            });
            captured = fb.dataUri;
            engineUsed = fb.engine;
        }
    }
    else {
        const result = await captureViaEngine({
            mode: 'auto',
            excludeSelectors: ['#report-bug-modal'],
            includeConfidential: true,
        });
        captured = result.dataUri;
        engineUsed = result.engine;
    }
    if (!_isSessionActive(sessionToken, modal))
        return;
    _screenshotDataUri = captured;
    if (captured && preview) {
        preview.src = captured;
        preview.style.display = 'block';
    }
    if (hiddenInput)
        hiddenInput.value = captured ? '1' : '0';
    if (engineInput)
        engineInput.value = engineUsed || '';
    if (status) {
        status.textContent = captured
            ? `${t('reportBug.screenshotReady') || 'Screenshot captured'} (${engineUsed || '?'})`
            : t('reportBug.screenshotFailed') || 'Screenshot unavailable';
    }
    setBusy(false);
    if (captureBtn)
        captureBtn.textContent = t('reportBug.recaptureApp') || 'Retake (app)';
    if (captureNativeBtn)
        captureNativeBtn.textContent = t('reportBug.recaptureNative') || 'Retake (screen)';
}
// _autoCapture removido (PERF 2026-05-02). html2canvas é síncrono no DOM walk
// e bloqueia interação. Captura agora 100% opt-in via botão/paste.
/**
 * @param {any} target
 * @param {any} target
 * @param {any} target
 */
function _trackTelemetry(eventType: any, target: any, metadata: any) {
    import('../telemetry/tracker.js' as string)
        .then(({ trackEvent }) => {
        trackEvent(eventType, target, {
            source: 'report-bug-modal',
            ...metadata,
        });
    })
        .catch((/** @type {any} */ _e) => console.debug('[utils/ui/reportBugModal:silent-catch]', _e?.message || _e));
}
/**
 * Cola imagem da area de transferencia (Ctrl+V) como attachment.
 * Se a captura automatica ainda nao ocorreu, usa como screenshot principal.
 * @param {ClipboardEvent} e
 */
function _handlePaste(e: any) {
    const items = [...(e.clipboardData?.items || [])];
    const imageItem = items.find((/** @type {any} */ item) => item.type.startsWith('image/'));
    if (!imageItem)
        return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file)
        return;
    // Se ainda sem screenshot: usar como captura de tela principal
    if (!_screenshotDataUri) {
        const reader = new FileReader();
        reader.onload = () => {
            _screenshotDataUri = reader.result;
            const preview = (document.getElementById('report-bug-screenshot-preview')) as any;
            const hiddenInput = (document.getElementById('report-bug-include-screenshot')) as any;
            const status = (document.getElementById('report-bug-screenshot-status')) as any;
            const captureBtn = (document.getElementById('report-bug-capture-btn')) as any;
            if (preview) {
                preview.src = reader.result;
                preview.style.display = 'block';
            }
            if (hiddenInput)
                hiddenInput.value = '1';
            if (status)
                status.textContent = t('reportBug.screenshotReady') || 'Screenshot captured';
            if (captureBtn) {
                captureBtn.disabled = false;
                captureBtn.textContent = t('reportBug.recaptureScreen') || 'Retake';
            }
            showToast(t('reportBug.screenshotPasted') || 'Screenshot pasted', 'success');
        };
        reader.readAsDataURL(file);
        return;
    }
    // Ja tem screenshot: adicionar como attachment extra
    if (_attachments.length >= MAX_ATTACHMENTS) {
        showToast(t('reportBug.maxAttachments') || `Maximum ${MAX_ATTACHMENTS} images`, 'warning');
        return;
    }
    const reader = new FileReader();
    reader.onload = () => {
        _attachments.push({ name: 'pasted-image.png', dataUri: /** @type {string} */ (reader.result) });
        _renderAttachmentPreviews();
        showToast(t('reportBug.imagePasted') || 'Image added', 'success');
    };
    reader.readAsDataURL(file);
}
/**
 * @param {any} e
 */
function _handleFileSelect(e: any) {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // Reset para permitir re-selecao do mesmo arquivo
    for (const file of files as any[]) {
        if (_attachments.length >= MAX_ATTACHMENTS) {
            showToast(t('reportBug.maxAttachments') || `Maximum ${MAX_ATTACHMENTS} images`, 'warning');
            break;
        }
        if (!file.type.startsWith('image/')) {
            showToast(t('reportBug.onlyImages') || 'Only image files are accepted', 'warning');
            continue;
        }
        if (file.size > MAX_ATTACHMENT_SIZE) {
            showToast(t('reportBug.fileTooLarge') || 'File too large (max 2MB)', 'warning');
            continue;
        }
        const reader = new FileReader();
        reader.onload = () => {
            _attachments.push({ name: file.name, dataUri: /** @type {string} */ (reader.result) });
            _renderAttachmentPreviews();
        };
        reader.readAsDataURL(file);
    }
}
/**
 * @param {any} index
 */
function _removeAttachment(index: any) {
    _attachments.splice(index, 1);
    _renderAttachmentPreviews();
}
function _renderAttachmentPreviews() {
    const container = (document.getElementById('report-bug-attach-previews')) as any;
    if (!container)
        return;
    container.innerHTML = '';
    _attachments.forEach((/** @type {any} */ att, i: any) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'report-bug-attach-thumb';
        const img = document.createElement('img');
        img.src = att.dataUri;
        img.alt = escapeHtml(att.name);
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'report-bug-attach-remove';
        removeBtn.textContent = '\u00D7';
        removeBtn.setAttribute('aria-label', 'Remove');
        removeBtn.addEventListener('click', () => _removeAttachment(i));
        wrapper.appendChild(img);
        wrapper.appendChild(removeBtn);
        container.appendChild(wrapper);
    });
    // Atualizar visibilidade do botao "Add"
    const addBtn = (document.getElementById('report-bug-attach-btn')) as any;
    if (addBtn) {
        addBtn.style.display = _attachments.length >= MAX_ATTACHMENTS ? 'none' : '';
    }
}
async function _handleSubmit() {
    const typeSelect = (document.getElementById('report-bug-type')) as any;
    const descArea = (document.getElementById('report-bug-description')) as any;
    const includeScreenshot = (document.getElementById('report-bug-include-screenshot')) as any;
    const submitBtn = (document.getElementById('report-bug-submit')) as any;
    const description = descArea?.value?.trim();
    if (!description || description.length < 10) {
        showToast(t('reportBug.descriptionTooShort') || 'Please provide more detail (min 10 characters)', 'warning');
        return;
    }
    // Desabilitar botao durante envio
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = t('reportBug.sending') || 'Sending...';
    }
    try {
        const screenshotData = includeScreenshot?.value === '1' && _screenshotDataUri ? _screenshotDataUri : null;
        const engineEl = (document.getElementById('report-bug-screenshot-engine')) as any;
        const screenshotEngine = engineEl?.value || null;
        const subType = typeSelect?.value || 'bug';
        // Phase 3 (2026-04-10): use dedicated submitBugReport path (structured
        // payload → bug_reports table). subType/severity mapping: 'bug'→medium,
        // 'suggestion'→low, 'crash'→high, 'other'→medium. Prefill metadata
        // (code, screen, operation, correlationId) merged into metadata bag.
        const severityMap = ({
            bug: 'medium',
            crash: 'high',
            suggestion: 'low',
            other: 'medium',
        }) as Record<string, string>;
        const severity = severityMap[subType] || 'medium';
        // Title: first 80 chars of description as fallback
        const title = description.slice(0, 80) + (description.length > 80 ? '…' : '');
        const result = await submitBugReport({
            title,
            description,
            severity,
            affected_area: 'other',
            metadata: {
                sub_type: subType,
                screenshot_engine: screenshotEngine,
                ...(typeof _prefillMetadata === 'object' && _prefillMetadata !== null ? _prefillMetadata : {}),
            },
            screenshotBase64: screenshotData,
            attachments: _attachments.map((/** @type {any} */ a) => a.dataUri),
        });
        if (result.ok) {
            showToast(t('reportBug.sent') || 'Report sent. Thank you!', 'success');
            closeReportBugModal();
        }
        else {
            console.error('[ecbyts:reportBug] Submit failed:', /** @type {any} */ (result).reason);
            showToast(t('reportBug.sendFailed') || 'Failed to send report. Please try again.', 'error');
        }
    }
    catch (err: any) {
        console.error('[ecbyts:reportBug] Submit failed:', err);
        showToast(t('reportBug.sendFailed') || 'Failed to send report. Please try again.', 'error');
    }
    finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = t('reportBug.send') || 'Send Report';
        }
    }
}
