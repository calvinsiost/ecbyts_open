// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
//
// Presentation Mode - F2 UI Shell: Modal CRUD + Add Step + profile/preset editor
import {
    createPresentation,
    listPresentations,
    deletePresentation,
    setActivePresentation,
    getPresentation,
    updatePresentation,
    listProfiles,
    applyProfile,
    listVideoExportPresets,
    getSuggestedExportPreset,
    ensureTechnicalStoryExamplePresentation,
    snapshotCamera,
} from '../../core/presentation/index.js';
import { showToast } from './toast.js';
import { Z_INDEX } from './zIndex.js';
import { t } from '../i18n/translations.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';
import { lazyImport } from '../helpers/lazyImport.js';
let _modalEl: any = null;
let _stepModalEl: any = null;
let _onStepSave: any = null;
let _editingPresentationId: any = null;
const DEFAULT_LAUNCH_PROFILE_ID = 'launch_video_technical_environmental';
/**
 * @param {any} str
 */
function _escapeHtml(str: any) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/**
 * @param {any} profileId
 */
function _resolveProfileLabel(profileId: any) {
    const found = /*as:{ label?: string } | undefined*/ listProfiles().find(
        (profile: any) => profile.id === profileId,
    );
    return ((found as any)?.label) || (profileId ? profileId : 'Sem perfil');
}
/**
 * @param {any} presetId
 */
function _resolvePresetLabel(presetId: any) {
    const found = /*as:{ label?: string } | undefined*/ listVideoExportPresets().find(
        (preset: any) => preset.id === presetId,
    );
    return ((found as any)?.label) || (presetId ? presetId : 'Sem preset');
}
/**
 * @param {any} selectedId
 */
function _buildProfileOptionsHtml(selectedId: any) {
    return listProfiles()
        .map((profile: any) => {
            const selected = profile.id === selectedId ? ' selected' : '';
            return `<option value="${profile.id}"${selected}>${_escapeHtml(profile.label)}</option>`;
        })
        .join('');
}
/**
 * @param {any} selectedId
 */
function _buildPresetOptionsHtml(selectedId: any) {
    return listVideoExportPresets()
        .map((preset: any) => {
            const selected = preset.id === selectedId ? ' selected' : '';
            return `<option value="${preset.id}"${selected}>${_escapeHtml(preset.label)}</option>`;
        })
        .join('');
}
function _generateStepId() {
    return `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}
function _ensureDefaultPresentationExample() {
    try {
        return ensureTechnicalStoryExamplePresentation();
    } catch (error: any) {
        console.warn('[presentationModal] failed to ensure default example', error);
        return null;
    }
}
/**
 * @param {any} step
 */
function _formatStepTiming(step: any) {
    const duration = Math.max(0.1, Number(step?.duration) || 3);
    const transitionDuration = Math.max(0, Number(step?.transitionDuration) || 1.5);
    return `${duration.toFixed(1)}s cena · ${transitionDuration.toFixed(1)}s transicao`;
}
/**
 * @param {any} step
 */
function _resolveStepAudioLabel(step: any) {
    const type = step?.audio?.type;
    if (!type) return 'Sem audio';
    if (type === 'tts') return `TTS${step?.audio?.lang ? ` ${step.audio.lang}` : ''}`;
    if (type === 'upload') return 'Audio enviado';
    return String(type);
}
function _captureCurrentCameraState() {
    const w = window;
    const camera = w?.__ecbtCamera || null;
    const controls = w?.__ecbtControls || null;
    if (!camera) return null;
    return snapshotCamera(camera, controls);
}
/**
 * @param {any} data
 * @param {any} existingLayout
 */
function _buildStepLayoutFromModalData(data: any,existingLayout = null) {
    const baseLayout =
        existingLayout && typeof existingLayout === 'object'
            ? { ...(existingLayout as any) }
            : {
                  caption_zone: 'lower-mid',
                  caption_align: 'left',
                  desktop_safe: true,
                  mobile_safe: true,
              };
    return {
        ...baseLayout,
        frame_clip_mode: data.frameClipMode || baseLayout.frame_clip_mode || 'auto',
        frame_clip_rect: data.frameClipRect || null,
    };
}
/**
 * @param {any} data
 * @param {any} previousAudio
 */
function _buildStepAudioFromModalData(data: any, previousAudio: any = null) {
    if (data.audioType === 'none') return null;
    if (data.audioType === 'upload') {
        if (previousAudio?.type === 'upload') return { ...(previousAudio as any) };
        return { type: 'upload', filename: '' };
    }
    return {
        ...(previousAudio && typeof previousAudio === 'object' ? previousAudio : {}),
        type: 'tts',
        text: data.ttsText,
        lang: data.lang,
    };
}
/**
 * @param {any} presentation
 */
function _buildStepRowsHtml(presentation: any) {
    const steps = Array.isArray(presentation?.steps) ? presentation.steps : [];
    if (!steps.length) {
        return `
            <div class="presentation-step-row presentation-step-row--empty">
                Esta apresentacao ainda nao tem passos. Use "+ Passo" para montar o roteiro.
            </div>
        `;
    }
    return steps
        .map((step: any, index: any) => {
            const annotation = String(step?.annotation || '').trim();
            return `
                <div class="presentation-step-row" data-step-id="${step.id}">
                    <div class="presentation-step-row__info">
                        <div class="presentation-step-row__title">${index + 1}. ${_escapeHtml(step?.label || 'Untitled')}</div>
                        <div class="presentation-step-row__meta">
                            ${_escapeHtml(_formatStepTiming(step))} · ${_escapeHtml(_resolveStepAudioLabel(step))}
                        </div>
                        ${annotation ? `<div class="presentation-step-row__annotation">${_escapeHtml(annotation)}</div>` : ''}
                    </div>
                    <div class="presentation-step-row__actions">
                        <button type="button" class="presentation-btn presentation-btn--sm" data-action="edit-step" data-id="${presentation.id}" data-step-id="${step.id}">
                            Editar
                        </button>
                        <button type="button" class="presentation-btn presentation-btn--sm" data-action="move-step-up" data-id="${presentation.id}" data-step-index="${index}" ${index === 0 ? 'disabled' : ''}>
                            ↑
                        </button>
                        <button type="button" class="presentation-btn presentation-btn--sm" data-action="move-step-down" data-id="${presentation.id}" data-step-index="${index}" ${index === steps.length - 1 ? 'disabled' : ''}>
                            ↓
                        </button>
                        <button type="button" class="presentation-btn presentation-btn--sm presentation-btn--danger" data-action="remove-step" data-id="${presentation.id}" data-step-id="${step.id}">
                            Excluir
                        </button>
                    </div>
                </div>
            `;
        })
        .join('');
}
/**
 * @param {any} presentation
 */
function _normalizePresentationForEditor(presentation: any) {
    const profileId = presentation?.profileId || DEFAULT_LAUNCH_PROFILE_ID;
    return {
        ...presentation,
        profileId,
        videoPresetId: presentation?.videoPresetId || getSuggestedExportPreset(profileId),
    };
}
/**
 * @param {any} presentation
 */
function _renderPresentationEditor(presentation: any) {
    const normalized = _normalizePresentationForEditor(presentation);
    return `
        <div class="presentation-card__editor">
            <div class="presentation-card__editor-section">
                <div class="presentation-card__editor-heading">Configuracao</div>
                <label class="presentation-field">
                    <span class="presentation-field__label">Titulo</span>
                    <input data-field-meta="true" data-field-meta-key="auto-pos:presentationModal:input:L188"
                        type="text"
                        class="presentation-field__input"
                        data-editor-title
                        maxlength="200"
                        value="${_escapeHtml(normalized.title || '')}"
                    >
                </label>
                <div class="presentation-field__row">
                    <label class="presentation-field">
                        <span class="presentation-field__label">Perfil narrativo</span>
                        <select data-field-meta="true" data-field-meta-key="auto-pos:presentationModal:select:L199" class="presentation-field__input" data-editor-profile>
                            ${_buildProfileOptionsHtml(normalized.profileId)}
                        </select>
                    </label>
                    <label class="presentation-field">
                        <span class="presentation-field__label">Preset de video</span>
                        <select data-field-meta="true" data-field-meta-key="auto-pos:presentationModal:select:L205" class="presentation-field__input" data-editor-preset>
                            ${_buildPresetOptionsHtml(normalized.videoPresetId)}
                        </select>
                    </label>
                </div>
            </div>
            <div class="presentation-card__editor-section">
                <div class="presentation-card__editor-heading-row">
                    <div>
                        <div class="presentation-card__editor-heading">Passos do roteiro</div>
                        <div class="presentation-card__editor-copy">
                            Agora o editar ajusta o roteiro de verdade: passos, ordem, duracao e texto. Para trocar a camera, use Record e recapture o passo.
                        </div>
                    </div>
                    <button type="button" class="presentation-btn presentation-btn--sm presentation-btn--primary" data-action="add-step" data-id="${presentation.id}">
                        + Passo
                    </button>
                </div>
                <div class="presentation-step-list">
                    ${_buildStepRowsHtml(normalized)}
                </div>
            </div>
            <div class="presentation-card__editor-actions">
                <button type="button" class="presentation-btn presentation-btn--primary presentation-btn--sm" data-action="save-settings" data-id="${presentation.id}">
                    Salvar
                </button>
                <button type="button" class="presentation-btn presentation-btn--sm" data-action="cancel-settings" data-id="${presentation.id}">
                    Cancelar
                </button>
            </div>
        </div>
    `;
}
function _createModal() {
    if (_modalEl) return _modalEl;
    const el = document.createElement('div');
    el.id = 'presentation-modal';
    el.className = 'presentation-modal presentation-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Presentation Mode');
    el.innerHTML = `
        <div class="presentation-modal__panel">
            <div class="presentation-modal__header">
                <span class="presentation-modal__title">Presentation Mode</span>
                <button type="button" class="presentation-modal__close" aria-label="Fechar">x</button>
            </div>
            <div class="presentation-modal__body">
                <div class="presentation-modal__list" id="presentation-list"></div>
                <div class="presentation-modal__empty" id="presentation-empty" style="display:none;">
                    <p>${t('presentation.noPresentations') || 'Voce nao tem apresentacoes.'}</p>
                </div>
            </div>
            <div class="presentation-modal__footer">
                <button type="button" class="presentation-btn presentation-btn--primary" id="presentation-btn-new">
                    + ${t('presentation.new') || 'Nova apresentacao'}
                </button>
                <button type="button" class="presentation-btn" id="presentation-btn-import">
                    Importar
                </button>
            </div>
        </div>
    `;
    (el.querySelector('.presentation-modal__close') as any).addEventListener('click', closePresentationModal);
    el.addEventListener('click', (event: any) => {
        if (event.target === el) closePresentationModal();
    });
    (el.querySelector('#presentation-btn-new') as any).addEventListener('click', () => {
        closePresentationModal();
        _openNewPrompt();
    });
    (el.querySelector('#presentation-btn-import') as any).addEventListener('click', () => {
        showToast(t('presentation.importNotImplemented') || 'Importar em breve', 'info');
    });
    document.body.appendChild(el);
    _modalEl = el;
    return el;
}
async function _openNewPrompt() {
    // Fix v14ui: always open the title prompt; defer model/camera checks to step capture.
    // This guarantees the presentation journey is reachable via UI-only interactions
    // without relying on getAllElements() state sync timing.
    const camera = window?.__ecbtCamera || null;
    if (!camera) {
        showToast(t('presentation.noCameraHint') || 'Dica: carregue um modelo 3D antes de capturar passos.', 'info');
    }
    // REF-SWEEPS RF-2: _openNewPrompt roda fire-and-forget no click de
    // #presentation-btn-new — import() cru virava 'Uncaught (in promise)'.
    const _dlg = await lazyImport('./asyncDialogs.js', { importer: () => import('./asyncDialogs.js' as string) });
    if (!_dlg) return;
    const { asyncPrompt } = _dlg;
    const title = await asyncPrompt(t('presentation.newPrompt') || 'Titulo da apresentacao:', '', {
        confirmLabel: t('presentation.create') || 'Criar',
        cancelLabel: t('cancel') || 'Cancelar',
        placeholder: t('presentation.titlePlaceholder') || 'Ex: Tour de monitoramento',
    });
    if (!title || !title.trim()) return;
    const presentation = createPresentation(title.trim(), '', {
        profileId: DEFAULT_LAUNCH_PROFILE_ID,
    });
    setActivePresentation(presentation.id);
    closePresentationModal();
    // A apresentacao JA foi criada acima; se os chunks de gravacao cairem, avisamos
    // em vez de deixar o usuario achando que o modo Record ficou ativo.
    const _rec = await lazyImport('../../core/presentation/index.js', { importer: () => import('../../core/presentation/index.js' as string) });
    const _hud = await lazyImport('./presentationRecorderHud.js', { importer: () => import('./presentationRecorderHud.js' as string) });
    if (!_rec || !_hud) {
        showToast(t('presentation.recordUnavailable') || 'Apresentacao criada, mas o modo Record esta indisponivel', 'warning');
        return;
    }
    _rec.startRecording(presentation.id);
    showToast(
        t('presentation.created') || 'Apresentacao criada com preset launch video. Modo Record ativado',
        'success',
    );
    _hud.openRecorderHud(presentation);
}
/**
 * @param {any} id
 */
function _savePresentationSettings(id: any) {
    const presentation = getPresentation(id);
    if (!presentation || !_modalEl) return;
    const card = _modalEl.querySelector(`.presentation-card[data-id="${id}"]`);
    if (!card) return;
    const title = card.querySelector('[data-editor-title]')?.value?.trim() || presentation.title || 'Untitled';
    const profileId = card.querySelector('[data-editor-profile]')?.value || DEFAULT_LAUNCH_PROFILE_ID;
    const presetId = card.querySelector('[data-editor-preset]')?.value || getSuggestedExportPreset(profileId);
    const profiled = applyProfile(presentation, profileId);
    profiled.title = title;
    profiled.videoPresetId = presetId;
    updatePresentation(id, profiled);
    _editingPresentationId = null;
    _renderList();
    showToast('Perfil e preset atualizados', 'success');
}
/**
 * @param {any} id
 * @param {any} updater
 */
function _upsertPresentationSteps(id: any,updater: any) {
    const presentation = getPresentation(id);
    if (!presentation) return null;
    const steps = Array.isArray(presentation.steps)
        ? presentation.steps.map((step: any) => ({
              ...step,
          }))
        : [];
    const nextSteps = updater(steps, presentation);
    if (!Array.isArray(nextSteps)) return presentation;
    return updatePresentation(id, { steps: nextSteps });
}
/**
 * @param {any} id
 */
function _openAddStepEditor(id: any) {
    const cameraState = _captureCurrentCameraState();
    if (!cameraState) {
        showToast('Abra o modelo antes de adicionar um passo.', 'warning');
        return;
    }
    setStepModalCallback((data: any) => {
        const updated = _upsertPresentationSteps(id, (steps: any) => [
            ...steps,
            {
                id: _generateStepId(),
                label: data.label,
                annotation: data.annotation,
                camera: cameraState,
                duration: data.duration,
                transitionDuration: data.transitionDuration,
                transitionEase: data.transitionEase,
                audio: _buildStepAudioFromModalData(data, null),
                temporalT: data.temporalT,
                layout: _buildStepLayoutFromModalData(data, null),
            },
        ]);
        if (!updated) return;
        _editingPresentationId = id;
        _renderList();
        showToast('Passo adicionado ao roteiro.', 'success');
    });
    openStepModal({
        modalTitle: 'Adicionar passo',
        saveLabel: 'Adicionar passo',
    });
}
/**
 * @param {any} id
 * @param {any} stepId
 */
function _openEditStepEditor(id: any,stepId: any) {
    const presentation = getPresentation(id);
    const step = /*as:any*/ presentation?.steps?.find((item: any) => item.id === stepId);
    if (!presentation || !step) return;
    setStepModalCallback((data: any) => {
        const updated = _upsertPresentationSteps(id, (steps: any) =>
            steps.map((item: any) =>
                item.id === stepId
                    ? {
                          ...item,
                          label: data.label,
                          annotation: data.annotation,
                          duration: data.duration,
                          transitionDuration: data.transitionDuration,
                          transitionEase: data.transitionEase,
                          audio: _buildStepAudioFromModalData(data, item.audio),
                          temporalT: data.temporalT,
                          layout: _buildStepLayoutFromModalData(data, item.layout),
                      }
                    : item,
            ),
        );
        if (!updated) return;
        _editingPresentationId = id;
        _renderList();
        showToast('Passo atualizado.', 'success');
    });
    openStepModal({
        modalTitle: 'Editar passo',
        saveLabel: 'Salvar alteracoes',
        label: step.label || '',
        annotation: step.annotation || '',
        duration: step.duration || 3,
        transitionDuration: step.transitionDuration || 1.5,
        transitionEase: step.transitionEase || 'cubic',
        audioType: step?.audio?.type === 'upload' ? 'upload' : step?.audio?.type === 'tts' ? 'tts' : 'none',
        ttsText: step?.audio?.text || '',
        lang: step?.audio?.lang || 'pt-BR',
        temporalT: step?.temporalT ?? null,
        frameClipMode: step?.layout?.frame_clip_mode || 'auto',
        frameClipRect: step?.layout?.frame_clip_rect || null,
        layout: step?.layout || null,
    });
}
/**
 * @param {any} id
 * @param {any} stepId
 */
async function _removePresentationStep(id: any,stepId: any) {
    const { asyncConfirm } = await import('./asyncDialogs.js' as string);
    const confirmed = await asyncConfirm('Excluir este passo do roteiro?', {
        danger: true,
        confirmLabel: t('delete') || 'Excluir',
        cancelLabel: t('cancel') || 'Cancelar',
    });
    if (!confirmed) return;
    const updated = _upsertPresentationSteps(id, (steps: any) =>
        steps.filter((step: any) => step.id !== stepId),
    );
    if (!updated) return;
    _editingPresentationId = id;
    _renderList();
    showToast('Passo removido.', 'success');
}
/**
 * @param {any} id
 * @param {any} fromIndex
 * @param {any} direction
 */
function _movePresentationStep(id: any,fromIndex: any,direction: any) {
    const numericIndex = Number(fromIndex);
    if (!Number.isInteger(numericIndex)) return;
    const updated = _upsertPresentationSteps(id, (steps: any) => {
        const toIndex = numericIndex + direction;
        if (numericIndex < 0 || numericIndex >= steps.length) return steps;
        if (toIndex < 0 || toIndex >= steps.length) return steps;
        const reordered = [...steps];
        const [moved] = reordered.splice(numericIndex, 1);
        reordered.splice(toIndex, 0, moved);
        return reordered;
    });
    if (!updated) return;
    _editingPresentationId = id;
    _renderList();
}
/**
 * @param {any} card
 */
function _syncEditorPresetForCard(card: any) {
    if (!card) return;
    const profileSelect = card.querySelector('[data-editor-profile]');
    const presetSelect = card.querySelector('[data-editor-preset]');
    if (!profileSelect || !presetSelect) return;
    presetSelect.value = getSuggestedExportPreset(profileSelect.value);
}
/**
 * @param {any} container
 */
function _bindListEvents(container: any) {
    container.querySelectorAll('[data-action]').forEach((btn: any) => {
        btn.addEventListener('click', async (event: any) => {
            event.preventDefault();
            event.stopPropagation();
            const id = btn.getAttribute('data-id');
            const action = btn.getAttribute('data-action');
            if (action === 'play') {
                closePresentationModal();
                const { openPlayer } = await import('./presentationPlayer.js' as string);
                openPlayer(id);
                return;
            }
            if (action === 'record') {
                const { isVideoRecordingAvailable, isScreenRecordingAvailable, detectSupportedMime } =
                    await import('../../core/presentation/index.js' as string);
                if (!isVideoRecordingAvailable() && !isScreenRecordingAvailable()) {
                    showToast(
                        t('presentation.video.unavailable') || 'Gravacao de video indisponivel neste navegador',
                        'warning',
                    );
                    return;
                }
                const mime = detectSupportedMime();
                const willBeMp4 = mime?.includes('mp4');
                if (!willBeMp4) {
                    showToast(
                        t('presentation.video.formatWarnWebm') ||
                            'Seu navegador grava em .webm. Para MP4 use Safari ou converta depois.',
                        'info',
                    );
                }
                closePresentationModal();
                const { openPlayer } = await import('./presentationPlayer.js' as string);
                openPlayer(id, { recordVideo: true, captureMode: isScreenRecordingAvailable() ? 'screen' : 'canvas' });
                return;
            }
            if (action === 'edit') {
                _editingPresentationId = _editingPresentationId === id ? null : id;
                _renderList();
                return;
            }
            if (action === 'add-step') {
                _openAddStepEditor(id);
                return;
            }
            if (action === 'edit-step') {
                _openEditStepEditor(id, btn.getAttribute('data-step-id'));
                return;
            }
            if (action === 'move-step-up') {
                _movePresentationStep(id, btn.getAttribute('data-step-index'), -1);
                return;
            }
            if (action === 'move-step-down') {
                _movePresentationStep(id, btn.getAttribute('data-step-index'), 1);
                return;
            }
            if (action === 'remove-step') {
                await _removePresentationStep(id, btn.getAttribute('data-step-id'));
                return;
            }
            if (action === 'save-settings') {
                _savePresentationSettings(id);
                return;
            }
            if (action === 'cancel-settings') {
                _editingPresentationId = null;
                _renderList();
                return;
            }
            if (action === 'delete') {
                const { asyncConfirm } = await import('./asyncDialogs.js' as string);
                const confirmed = await asyncConfirm(t('presentation.confirmDelete') || 'Excluir esta apresentacao?', {
                    danger: true,
                    confirmLabel: t('delete') || 'Excluir',
                    cancelLabel: t('cancel') || 'Cancelar',
                });
                if (confirmed) {
                    deletePresentation(id);
                    if (_editingPresentationId === id) _editingPresentationId = null;
                    _renderList();
                    showToast(t('presentation.deleted') || 'Apresentacao excluida', 'success');
                }
            }
        });
    });
    container.querySelectorAll('[data-editor-profile]').forEach((select: any) => {
        select.addEventListener('change', () => {
            const card = select.closest('.presentation-card');
            _syncEditorPresetForCard(card);
        });
    });
}
function _renderList() {
    const list = listPresentations();
    const container = _modalEl.querySelector('#presentation-list');
    const empty = _modalEl.querySelector('#presentation-empty');
    if (!list.length) {
        container.innerHTML = '';
        container.style.display = 'none';
        empty.style.display = 'block';
        return;
    }
    container.style.display = 'flex';
    empty.style.display = 'none';
    container.innerHTML = list
        .map((presentation: any) => {
            const normalized = _normalizePresentationForEditor(presentation);
            const stepCount = normalized.steps?.length || 0;
            const totalSec = (normalized.steps || []).reduce(
                (sum: any, step: any) =>
                    sum + (step.duration || 3) + (step.transitionDuration || 1.5),
                0,
            );
            const min = Math.floor(totalSec / 60);
            const sec = Math.floor(totalSec % 60);
            const timeStr = min > 0 ? `${min}:${String(sec).padStart(2, '0')}` : `${sec}s`;
            const dateStr = normalized.createdAt ? new Date(normalized.createdAt).toLocaleDateString('pt-BR') : '';
            const editing = _editingPresentationId === normalized.id;
            return `
                <div class="presentation-card" data-id="${normalized.id}">
                    <div class="presentation-card__info">
                        <div class="presentation-card__title">▶ ${_escapeHtml(normalized.title)}</div>
                        <div class="presentation-card__meta">
                            ${stepCount} ${t('presentation.steps') || 'passos'} - ${timeStr} - ${dateStr}
                        </div>
                        <div class="presentation-card__badges">
                            <span class="presentation-chip">${_escapeHtml(_resolveProfileLabel(normalized.profileId))}</span>
                            <span class="presentation-chip presentation-chip--muted">${_escapeHtml(_resolvePresetLabel(normalized.videoPresetId))}</span>
                        </div>
                    </div>
                    <div class="presentation-card__actions">
                        <button type="button" class="presentation-btn presentation-btn--sm presentation-btn--play" data-action="play" data-id="${normalized.id}" title="${t('presentation.play') || 'Reproduzir'}">▶</button>
                        <button type="button" class="presentation-btn presentation-btn--sm presentation-btn--record" data-action="record" data-id="${normalized.id}" title="${t('presentation.video.record') || 'Reproduzir + gravar video'}">&#x25CF;REC</button>
                        <button type="button" class="presentation-btn presentation-btn--sm presentation-btn--edit" data-action="edit" data-id="${normalized.id}" title="Editar roteiro e configuracao">✎</button>
                        <button type="button" class="presentation-btn presentation-btn--sm presentation-btn--delete" data-action="delete" data-id="${normalized.id}" title="${t('delete') || 'Excluir'}">&#x1F5D1;</button>
                    </div>
                    ${editing ? _renderPresentationEditor(normalized) : ''}
                </div>
            `;
        })
        .join('');
    _bindListEvents(container);
}
export function openPresentationModal() {
    _createModal();
    _ensureDefaultPresentationExample();
    _renderList();
    _modalEl.style.display = 'flex';
    _modalEl.setAttribute('aria-hidden', 'false');
    syncDeepLinkUrl('presentation');
}
export function closePresentationModal() {
    if (_modalEl) {
        _editingPresentationId = null;
        _modalEl.style.display = 'none';
        _modalEl.setAttribute('aria-hidden', 'true');
    }
    clearDeepLinkUrl();
}
function _createStepModal() {
    if (_stepModalEl) return _stepModalEl;
    const el = document.createElement('div');
    el.id = 'presentation-step-modal';
    el.className = 'presentation-modal presentation-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = `
        <div class="presentation-modal__panel presentation-modal__panel--step">
            <div class="presentation-modal__header">
                <span class="presentation-modal__title">${t('presentation.addStep') || 'Adicionar passo'}</span>
                <button type="button" class="presentation-modal__close" aria-label="Fechar">x</button>
            </div>
            <div class="presentation-modal__body">
                <label class="presentation-field">
                    <span class="presentation-field__label">${t('presentation.stepLabel') || 'Titulo do passo'}</span>
                    <input data-field-meta="true" data-field-meta-key="auto-pos:presentationModal:input:L665" type="text" class="presentation-field__input" id="step-label" maxlength="200" placeholder="${t('presentation.stepLabelPlaceholder') || 'Vista geral do plume'}">
                </label>
                <label class="presentation-field">
                    <span class="presentation-field__label">${t('presentation.annotation') || 'Anotacao opcional'}</span>
                    <textarea data-field-meta="true" data-field-meta-key="auto-pos:presentationModal:textarea:L669" class="presentation-field__input presentation-field__input--area" id="step-annotation" rows="2" placeholder="Area: 12ha · familia plume"></textarea>
                </label>
                <div class="presentation-field__row">
                    <label class="presentation-field">
                        <span class="presentation-field__label">${t('presentation.duration') || 'Duracao (s)'}</span>
                        <input data-field-meta="true" data-field-meta-key="auto-pos:presentationModal:input:L674" type="number" class="presentation-field__input" id="step-duration" value="3.0" min="0.1" max="120" step="0.1">
                    </label>
                    <label class="presentation-field">
                        <span class="presentation-field__label">${t('presentation.transition') || 'Transicao (s)'}</span>
                        <input data-field-meta="true" data-field-meta-key="auto-pos:presentationModal:input:L678" type="number" class="presentation-field__input" id="step-transition" value="1.5" min="0" max="30" step="0.1">
                    </label>
                    <label class="presentation-field">
                        <span class="presentation-field__label">${t('presentation.ease') || 'Easing'}</span>
                        <select data-field-meta="true" data-field-meta-key="auto-pos:presentationModal:select:L682" class="presentation-field__input" id="step-ease">
                            <option value="cubic">cubic</option>
                            <option value="linear">linear</option>
                            <option value="easeInOut">easeInOut</option>
                        </select>
                    </label>
                </div>
                <div class="presentation-field">
                    <span class="presentation-field__label">${t('presentation.audio') || 'Audio'}</span>
                    <div class="presentation-radio-group">
                        <label class="presentation-radio">
                            <input data-field-meta="true" data-field-meta-key="auto-pos:presentationModal:input:L693" type="radio" name="step-audio-type" value="tts" checked>
                            <span>TTS</span>
                        </label>
                        <label class="presentation-radio">
                            <input data-field-meta="true" data-field-meta-key="auto-pos:presentationModal:input:L697" type="radio" name="step-audio-type" value="upload">
                            <span>${t('presentation.upload') || 'Upload'}</span>
                        </label>
                        <label class="presentation-radio">
                            <input data-field-meta="true" data-field-meta-key="auto-pos:presentationModal:input:L701" type="radio" name="step-audio-type" value="none">
                            <span>${t('presentation.none') || 'Nenhum'}</span>
                        </label>
                    </div>
                </div>
                <label class="presentation-field" id="step-tts-field">
                    <span class="presentation-field__label">${t('presentation.ttsText') || 'Texto TTS'}</span>
                    <textarea data-field-meta="true" data-field-meta-key="auto-pos:presentationModal:textarea:L708" class="presentation-field__input presentation-field__input--area" id="step-tts-text" rows="2" placeholder="Esta e a vista geral do site..."></textarea>
                </label>
                <div class="presentation-field__row">
                    <label class="presentation-field">
                        <span class="presentation-field__label">${t('presentation.lang') || 'Idioma'}</span>
                        <select data-field-meta="true" data-field-meta-key="auto-pos:presentationModal:select:L713" class="presentation-field__input" id="step-lang">
                            <option value="pt-BR">pt-BR</option>
                            <option value="en-US">en-US</option>
                            <option value="es-LA">es-LA</option>
                        </select>
                    </label>
                    <label class="presentation-field">
                        <span class="presentation-field__label">${t('presentation.temporal') || 'Time slider t'}</span>
                        <input data-field-meta="true" data-field-meta-key="auto-pos:presentationModal:input:L721" type="number" class="presentation-field__input" id="step-temporal" value="" min="0" max="1" step="0.01" placeholder="0.0-1.0">
                    </label>
                </div>
                <label class="presentation-field">
                    <span class="presentation-field__label">${t('presentation.launch.frame.clip') || 'Clip do frame'}</span>
                    <select data-field-meta="true" data-field-meta-key="auto-pos:presentationModal:select:L726" class="presentation-field__input" id="step-frame-clip-mode">
                        <option value="auto">${t('presentation.auto') || 'Auto'}</option>
                        <option value="full">${t('presentation.none') || 'Nenhum'}</option>
                        <option value="focus">${t('presentation.launch.focus.rect') || 'Retangulo de foco'}</option>
                        <option value="center">${t('presentation.center') || 'Centro'}</option>
                        <option value="left-pane">${t('presentation.leftPane') || 'Painel esquerdo'}</option>
                        <option value="right-pane">${t('presentation.rightPane') || 'Painel direito'}</option>
                        <option value="top">${t('presentation.top') || 'Topo'}</option>
                        <option value="bottom">${t('presentation.bottom') || 'Base'}</option>
                        <option value="custom">${t('presentation.custom') || 'Personalizado'}</option>
                    </select>
                </label>
                <div class="presentation-field__hint" id="step-frame-clip-hint">
                    ${
                        t('presentation.launch.frame.clip.hint') ||
                        'Auto usa o retangulo de foco quando existir. Use Personalizado para salvar um crop normalizado 0-1 no proprio passo.'
                    }
                </div>
                <div class="presentation-field" id="step-frame-clip-custom" style="display:none;">
                    <span class="presentation-field__label">${t('presentation.launch.frame.clip.custom') || 'Retangulo personalizado (0-1)'}</span>
                    <div class="presentation-field__grid presentation-field__grid--quad">
                        <label class="presentation-field">
                            <span class="presentation-field__label">x</span>
                            <input data-field-meta="true" data-field-meta-key="auto-pos:presentationModal:input:L749" type="number" class="presentation-field__input" id="step-frame-clip-x" min="0" max="1" step="0.01" value="0.14">
                        </label>
                        <label class="presentation-field">
                            <span class="presentation-field__label">y</span>
                            <input data-field-meta="true" data-field-meta-key="auto-pos:presentationModal:input:L753" type="number" class="presentation-field__input" id="step-frame-clip-y" min="0" max="1" step="0.01" value="0.14">
                        </label>
                        <label class="presentation-field">
                            <span class="presentation-field__label">w</span>
                            <input data-field-meta="true" data-field-meta-key="auto-pos:presentationModal:input:L757" type="number" class="presentation-field__input" id="step-frame-clip-w" min="0.08" max="1" step="0.01" value="0.72">
                        </label>
                        <label class="presentation-field">
                            <span class="presentation-field__label">h</span>
                            <input data-field-meta="true" data-field-meta-key="auto-pos:presentationModal:input:L761" type="number" class="presentation-field__input" id="step-frame-clip-h" min="0.08" max="1" step="0.01" value="0.72">
                        </label>
                    </div>
                </div>
            </div>
            <div class="presentation-modal__footer">
                <button type="button" class="presentation-btn" id="step-btn-cancel">${t('cancel') || 'Cancelar'}</button>
                <button type="button" class="presentation-btn presentation-btn--primary" id="step-btn-save">${t('presentation.saveStep') || 'Salvar passo'}</button>
            </div>
        </div>
    `;
    (el.querySelector('.presentation-modal__close') as any).addEventListener('click', closeStepModal);
    (el.querySelector('#step-btn-cancel') as any).addEventListener('click', closeStepModal);
    el.addEventListener('click', (event: any) => {
        if (event.target === el) closeStepModal();
    });
    el.querySelectorAll('input[name="step-audio-type"]').forEach((radio: any) => {
        radio.addEventListener('change', () => {
            const ttsField: any = el.querySelector('#step-tts-field');
            ttsField.style.display = radio.value === 'tts' ? 'block' : 'none';
        });
    });
    (el.querySelector('#step-frame-clip-mode') as any).addEventListener('change', () => _syncFrameClipUi(el));
    (el.querySelector('#step-btn-save') as any).addEventListener('click', () => {
        const frameClipMode = (el.querySelector('#step-frame-clip-mode') as any).value;
        const frameClipRect =
            frameClipMode === 'custom'
                ? {
                      x: _clampRange((el.querySelector('#step-frame-clip-x') as any).value, 0, 1, 0.14),
                      y: _clampRange((el.querySelector('#step-frame-clip-y') as any).value, 0, 1, 0.14),
                      w: _clampRange((el.querySelector('#step-frame-clip-w') as any).value, 0.08, 1, 0.72),
                      h: _clampRange((el.querySelector('#step-frame-clip-h') as any).value, 0.08, 1, 0.72),
                  }
                : null;
        const data = {
            label: (el.querySelector('#step-label') as any).value.trim() || 'Untitled',
            annotation: (el.querySelector('#step-annotation') as any).value.trim(),
            duration: parseFloat((el.querySelector('#step-duration') as any).value) || 3.0,
            transitionDuration: parseFloat((el.querySelector('#step-transition') as any).value) || 1.5,
            transitionEase: (el.querySelector('#step-ease') as any).value,
            audioType: (el.querySelector('input[name="step-audio-type"]:checked') as any).value,
            ttsText: (el.querySelector('#step-tts-text') as any).value.trim(),
            lang: (el.querySelector('#step-lang') as any).value,
            temporalT:
                (el.querySelector('#step-temporal') as any).value !== ''
                    ? parseFloat((el.querySelector('#step-temporal') as any).value)
                    : null,
            frameClipMode,
            frameClipRect,
            layout: {
                frame_clip_mode: frameClipMode,
                frame_clip_rect: frameClipRect,
            },
        };
        if (_onStepSave) _onStepSave(data);
        closeStepModal();
    });
    document.body.appendChild(el);
    _stepModalEl = el;
    return el;
}
/**
 * @param {any} options
 */
export function openStepModal(options: any = {}) {
    _createStepModal();
    if (_stepModalEl.parentElement === document.body) {
        document.body.appendChild(_stepModalEl);
    }
    _stepModalEl.style.zIndex = String(Z_INDEX.EXCEPTION_PRESENTATION_STEP_MODAL);
    const fallbackFrameClipRect = { x: 0.14, y: 0.14, w: 0.72, h: 0.72 };
    const frameClipRect =
        options.frameClipRect && typeof options.frameClipRect === 'object'
            ? options.frameClipRect
            : options.layout?.frame_clip_rect && typeof options.layout.frame_clip_rect === 'object'
              ? options.layout.frame_clip_rect
              : fallbackFrameClipRect;
    const defaults: any = {
        label: '',
        annotation: '',
        duration: 3.0,
        transitionDuration: 1.5,
        transitionEase: 'cubic',
        audioType: 'tts',
        ttsText: '',
        lang: 'pt-BR',
        temporalT: null,
        ...options,
        frameClipMode: options.frameClipMode || options.layout?.frame_clip_mode || 'auto',
        frameClipRect,
    };
    const modalTitle = defaults.modalTitle || t('presentation.addStep') || 'Adicionar passo';
    const saveLabel = defaults.saveLabel || t('presentation.saveStep') || 'Salvar passo';
    _stepModalEl.querySelector('.presentation-modal__title').textContent = modalTitle;
    _stepModalEl.querySelector('#step-btn-save').textContent = saveLabel;
    _stepModalEl.querySelector('#step-label').value = defaults.label;
    _stepModalEl.querySelector('#step-annotation').value = defaults.annotation;
    _stepModalEl.querySelector('#step-duration').value = defaults.duration;
    _stepModalEl.querySelector('#step-transition').value = defaults.transitionDuration;
    _stepModalEl.querySelector('#step-ease').value = defaults.transitionEase;
    /*as:any*/ _stepModalEl.querySelector(`input[name="step-audio-type"][value="${defaults.audioType}"]`).checked =
        true;
    _stepModalEl.querySelector('#step-tts-text').value = defaults.ttsText;
    _stepModalEl.querySelector('#step-lang').value = defaults.lang;
    _stepModalEl.querySelector('#step-temporal').value = defaults.temporalT !== null ? defaults.temporalT : '';
    _stepModalEl.querySelector('#step-frame-clip-mode').value = defaults.frameClipMode;
    _stepModalEl.querySelector('#step-frame-clip-x').value = defaults.frameClipRect.x;
    _stepModalEl.querySelector('#step-frame-clip-y').value = defaults.frameClipRect.y;
    _stepModalEl.querySelector('#step-frame-clip-w').value = defaults.frameClipRect.w;
    _stepModalEl.querySelector('#step-frame-clip-h').value = defaults.frameClipRect.h;
    _stepModalEl.querySelector('#step-tts-field').style.display = defaults.audioType === 'tts' ? 'block' : 'none';
    _syncFrameClipUi(_stepModalEl);
    _stepModalEl.style.display = 'flex';
    _stepModalEl.setAttribute('aria-hidden', 'false');
    _stepModalEl.querySelector('#step-label').focus();
}
export function closeStepModal() {
    if (_stepModalEl) {
        _stepModalEl.style.display = 'none';
        _stepModalEl.setAttribute('aria-hidden', 'true');
    }
}
/**
 * @param {any} cb
 */
export function setStepModalCallback(cb: any) {
    _onStepSave = cb;
}
/**
 * @param {any} el
 */
function _syncFrameClipUi(el: any) {
    const mode = el.querySelector('#step-frame-clip-mode')?.value || 'auto';
    const customWrap = el.querySelector('#step-frame-clip-custom');
    if (customWrap) customWrap.style.display = mode === 'custom' ? 'flex' : 'none';
}
/**
 * @param {any} value
 * @param {any} min
 * @param {any} max
 * @param {any} fallback
 */
function _clampRange(value: any,min: any,max: any,fallback = min) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}
