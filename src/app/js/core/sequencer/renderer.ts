// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   SEQUENCER RENDERER — UI for Action Bar + Timeline
   Renderiza a barra de acao (clusters + scenes) e a timeline
   com controles de playback (play/pause/seek/speed).

   Layout:
   ┌──────────────────────────────────────────────────┐
   │  ▶ ■  0:00 ━━━●━━━━━━━━━━━━━ 0:30   1x ▼  🎬  │ timeline
   │       ◇────◇────────◇───────◇                   │ keyframes
   ├──────────────────────────────────────────────────┤
   │  [A+] [B+] [C+] [Scene1+]                       │ action bar
   └──────────────────────────────────────────────────┘
   ================================================================ */
import { t } from '../../utils/i18n/translations.js';
// REFATORACAO (pattern §4.1): le estado/CRUD da folha ./state.js em vez
// de ./manager.js (quebra renderer→manager). As acoes do engine vem do
// registry de ./state.js (quebra renderer→engine). As funcoes de camera
// de controls.js sao carregadas via `await import()` dinamico (quebra
// renderer→utils/scene/controls).
import {
    getItems,
    getKeyframes,
    getLanes,
    getPlayback,
    addKeyframe,
    removeKeyframe,
    moveKeyframe,
    moveKeyframeToLane,
    updateKeyframe,
    createLane,
    deleteLane,
    renameLane,
    setPlaybackSpeed,
    setPlaybackLoop,
    onChange,
    getEngineActions,
} from './state.js';
import { getIcon } from '../../utils/ui/icons.js';
import { getRenderer, requestRender } from '../../utils/scene/setup.js';
import { toFiniteNumber } from '../../utils/helpers/toFiniteNumber.js';
import { lazyImport } from '../../utils/helpers/lazyImport.js';
// ----------------------------------------------------------------
// ENGINE ACTIONS — via registry de state.js (quebra renderer→engine).
// engine.js se auto-registra no load; handlers/sequencer.js importa
// engine.js estaticamente, garantindo registro antes de initStoryboardUI.
// ----------------------------------------------------------------
function _eng(): any {
    return getEngineActions();
}
/** @param {string} itemId @param {number} [durationMs] */
function play() {
    return _eng().play();
}
function pause() {
    return _eng().pause();
}
function stop() {
    return _eng().stop();
}
/** @param {number} position */
function seek(position: any) {
    return _eng().seek(position);
}
/** @param {string} itemId @param {number} [durationMs] */
function flyToItem(itemId: any, durationMs: any) {
    return _eng().flyToItem(itemId, durationMs);
}
/** @param {string} keyframeId @param {number} [durationMs] */
function flyToKeyframe(keyframeId: any, durationMs: any) {
    return _eng().flyToKeyframe(keyframeId, durationMs);
}
/** @param {Function} callback */
function onTick(callback: any) {
    return _eng().onTick(callback);
}
// ----------------------------------------------------------------
// LAZY CONTROLS MODULE — dynamic import (quebra edge → controls.js)
// ----------------------------------------------------------------
/** @type {Promise<any>|null} */
let _controlsPromise: any = null;
/** @returns {Promise<any>} */
function _loadControls() {
    // REF-SWEEPS RF-2: lazyImport NUNCA rejeita (retorna null). O import() cru aqui
    // era o pior caso da varredura — rodava no TOPO DO MODULO (_loadControls() logo
    // abaixo, fire-and-forget): com o chunk fora do ar virava 'Uncaught (in promise)'
    // ja no boot E o promise REJEITADO ficava cacheado em _controlsPromise,
    // contaminando todo `await _loadControls()` posterior. Em falha limpamos o cache
    // para que a proxima chamada (ou o retry na reconexao) tente de novo.
    if (!_controlsPromise) {
        _controlsPromise = lazyImport('../../utils/scene/controls.js', {
            importer: () => import('../../utils/scene/controls.js' as string),
        }).then((mod: any) => {
            if (!mod) _controlsPromise = null;
            return mod;
        });
    }
    return _controlsPromise;
}
void _loadControls();
// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------
const CONTAINER_ID = 'storyboard';
const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4];
// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------
/** @type {any} */
let _container: any = null;
/** @type {any} */
let _activeItemId: any = null;
let _isDraggingScrubber = false;
/** @type {any} */
let _unsubscribeTick: any = null;
/** @type {any} */
let _unsubscribeChange: any = null;
let _thumbnails: Record<string, any> = {}; // itemId → dataURL
let _isCapturing = false; // lock para evitar captura concorrente
/** @type {any} */
let _thumbDebounce: any = null; // debounce para recaptura
let _videoBotMode = false; // modo Bot IA inline
const THUMB_SIZE = 80; // pixels (square crop)
function _captureThumbnailsAfterPaint() {
    requestAnimationFrame(() => {
        requestAnimationFrame(() => _captureThumbnails());
    });
}
// ----------------------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------------------
/**
 * Inicializa o renderer do storyboard.
 * Cria o container HTML e registra listeners.
 */
export function initStoryboardUI() {
    _container = document.getElementById(CONTAINER_ID);
    if (!_container) return; // Container deve existir no HTML (constellation view)
    // Evitar dupla inicializacao
    if (_container.dataset.initialized) {
        render();
        return;
    }
    _container.dataset.initialized = 'true';
    _container.className = 'storyboard';
    // Delegated events
    _container.addEventListener('click', _handleClick);
    _container.addEventListener('mousedown', _handleMouseDown);
    _container.addEventListener('dblclick', _handleDblClick);
    _container.addEventListener('contextmenu', _handleContextMenu);
    _container.addEventListener('keydown', _handleKeyDown);
    // Listen for state changes (debounced thumbnail refresh)
    _unsubscribeChange = onChange(() => {
        render();
        clearTimeout(_thumbDebounce);
        _thumbDebounce = setTimeout(() => _captureThumbnails(), 1000);
    });
    _unsubscribeTick = onTick((info: any) => _updatePlaybackUI(info));
    render();
    _captureThumbnailsAfterPaint();
}
/**
 * Remove o renderer e limpa listeners.
 */
export function destroyStoryboardUI() {
    if (_unsubscribeChange) _unsubscribeChange();
    if (_unsubscribeTick) _unsubscribeTick();
    _dismissPopover();
    if (_container) {
        _container.removeEventListener('click', _handleClick);
        _container.removeEventListener('mousedown', _handleMouseDown);
        _container.removeEventListener('dblclick', _handleDblClick);
        _container.removeEventListener('contextmenu', _handleContextMenu);
        _container.removeEventListener('keydown', _handleKeyDown);
        _container.innerHTML = '';
    }
}
// ----------------------------------------------------------------
// RENDER
// ----------------------------------------------------------------
/**
 * Renderiza o storyboard completo (action bar + timeline).
 */
export function render() {
    if (!_container) return;
    const items = getItems();
    const keyframes = getKeyframes();
    const playback = getPlayback();
    // Empty state - mostrar botao de refresh para o usuario
    if (items.length === 0) {
        _container.classList.add('visible');
        _container.innerHTML = `<div class="sb-empty-state">
            <span class="sb-empty-msg">${t('sequencer.emptyStateMsg')}</span>
            <button class="sb-btn" data-action="refresh-items" aria-label="${t('sequencer.refreshAriaLabel')}">
                ${getIcon('refresh-cw', { size: '14px' })} Refresh
            </button>
        </div>`;
        return;
    }
    _container.classList.add('visible');
    const hasKeyframes = keyframes.length > 0;
    if (_videoBotMode) {
        _container.innerHTML = _renderVideoBotUI(keyframes, playback);
    } else {
        _container.innerHTML = `
            ${hasKeyframes ? _renderTimeline(keyframes, playback) : ''}
            ${_renderActionBar(items)}
        `;
    }
}
// ----------------------------------------------------------------
// ACTION BAR - Clusters + Scenes
// ----------------------------------------------------------------
function _renderActionBar(items: any[]) {
    const cards = items
        .map((/** @type {any} */ item) => {
            const isActive = item.id === _activeItemId;
            const icon = getIcon(item.icon || 'map-pin', { size: '16px' });
            const count = item.elementIds ? item.elementIds.length : '';
            const badge = count ? `<span class="sb-badge">${count}</span>` : '';
            const itemIdAttr = _escapeAttr(item.id);
            const itemNameText = _escapeHtml(item.name || '');
            const itemNameAttr = _escapeAttr(item.name || '');
            const thumb = _thumbnails[item.id]
                ? `<img class="sb-card-thumb" src="${_thumbnails[item.id]}" alt="" draggable="false">`
                : `<div class="sb-card-thumb sb-card-thumb-placeholder" style="background:${item.color}20;">
                   ${icon}
               </div>`;
            return `
            <div class="sb-card${isActive ? ' active' : ''}"
                 data-action="fly-to-item" data-item-id="${itemIdAttr}"
                 style="border-color:${item.color};" title="${itemNameAttr}">
                ${thumb}
                <div class="sb-card-info">
                    <div class="sb-card-name">${itemNameText}</div>
                    ${badge}
                </div>
                <button class="sb-card-add" data-action="add-keyframe"
                        data-item-id="${itemIdAttr}" title="${t('sequencer.addKeyframeTooltip')}"
                        aria-label="${t('sequencer.addToTimeline', { item: itemNameAttr })}">
                    ${getIcon('plus', { size: '12px' })}
                </button>
            </div>
        `;
        })
        .join('');
    return `<div class="sb-action-bar">${cards}</div>`;
}
// ----------------------------------------------------------------
// TIMELINE - Playback controls + scrubber + keyframe markers
// ----------------------------------------------------------------
function _renderTimeline(keyframes: any[], playback: any) {
    const pos = playback.position;
    const pct = (pos * 100).toFixed(1);
    const totalDuration =
        Number.isFinite(playback.totalDuration) && playback.totalDuration >= 0 ? playback.totalDuration : 0;
    const elapsed = _formatTime((pos * totalDuration) / 1000);
    const total = _formatTime(totalDuration / 1000);
    const playIcon = playback.playing ? 'pause' : 'play';
    const speed = toFiniteNumber(playback.speed, 1);
    const speedLabel = speed === 1 ? '1x' : `${speed}x`;
    const lanes = getLanes();
    // Renderiza as raias com seus respectivos keyframes
    const laneRows = lanes
        .slice()
        .sort((a, b: any) => a.order - b.order)
        .map((lane: any) => {
            const laneKfs = keyframes.filter((/** @type {any} */ kf) => (kf.laneId || 'lane-default') === lane.id);
            const canDelete = lanes.length > 1;
            const laneIdAttr = _escapeAttr(lane.id);
            const laneNameText = _escapeHtml(lane.name);
            const markers = laneKfs
                .map((/** @type {any} */ kf) => {
                    const item = getItems().find((it: any) => it.id === kf.itemId);
                    const color = item ? item.color : '#666';
                    const isActive = _activeItemId && kf.itemId === _activeItemId;
                    const left = (kf.position * 100).toFixed(1);
                    const markerIdAttr = _escapeAttr(kf.id);
                    const markerTitle = _escapeAttr(item ? item.name : kf.id);
                    const kfIndex = keyframes.indexOf(kf) + 1;
                    const ariaKf = _escapeAttr(`Keyframe ${kfIndex} - ${item ? item.name : kf.id}`);
                    return `<div class="sb-kf-marker${isActive ? ' active' : ''}"
                             style="left:${left}%;background:${color};"
                             data-action="seek-keyframe" data-kf-id="${markerIdAttr}"
                             data-lane-id="${laneIdAttr}"
                             title="${markerTitle}" tabindex="0" role="button"
                             aria-label="${ariaKf}">
                            <button class="sb-kf-delete" data-action="remove-keyframe"
                                    data-kf-id="${markerIdAttr}" title="${t('sequencer.removeTooltip')}"
                                    aria-label="${t('sequencer.removeKeyframe', { index: kfIndex })}">
                                ${getIcon('x', { size: '8px' })}
                            </button>
                        </div>`;
                })
                .join('');
            return `<div class="sb-lane-row" data-lane-id="${laneIdAttr}">
                <div class="sb-lane-label" style="border-left:3px solid ${lane.color};">
                    <span class="sb-lane-name" data-action="rename-lane" data-lane-id="${laneIdAttr}"
                          title="${t('sequencer.renameLaneTooltip')}">${laneNameText}</span>
                    ${
                        canDelete
                            ? `<button class="sb-lane-del-btn" data-action="delete-lane"
                            data-lane-id="${laneIdAttr}" title="${t('sequencer.removeLaneTooltip')}">&#215;</button>`
                            : ''
                    }
                </div>
                <div class="sb-lane-track">
                    <div class="sb-scrubber-fill" style="width:${pct}%"></div>
                    ${markers}
                </div>
            </div>`;
        })
        .join('');
    // Bot IA button (video generation)
    const _generating = _isVideoGenerating();
    const videoBtnClass = _generating ? ' active' : '';
    return `
        <div class="sb-timeline">
            <div class="sb-controls">
                <button class="sb-btn" data-action="play" title="${t('sequencer.playPause')}" aria-label="${playback.playing ? t('sequencer.pauseAriaLabel') : t('sequencer.playAriaLabel')}">
                    ${getIcon(playIcon, { size: '14px' })}
                </button>
                <button class="sb-btn" data-action="stop" title="${t('sequencer.stopTooltip')}" aria-label="${t('sequencer.stopAriaLabel')}">
                    ${getIcon('square', { size: '14px' })}
                </button>
                <span class="sb-time">${elapsed} / ${total}</span>
                <div class="sb-scrubber-wrap" data-action="scrub">
                    <div class="sb-tracks-container">
                        <div class="sb-cursor-line" style="left:${pct}%"></div>
                        ${laneRows}
                    </div>
                    <div class="sb-lane-add-row">
                        <button class="sb-lane-add-btn" data-action="create-lane" title="${t('sequencer.newLaneTooltip')}">
                            ${t('sequencer.addLaneButton')}
                        </button>
                    </div>
                </div>
                <button class="sb-btn sb-speed" data-action="cycle-speed" title="${t('sequencer.speedTooltip')}" aria-label="${t('sequencer.speedLabel', { label: speedLabel })}">
                    ${speedLabel}
                </button>
                <button class="sb-btn sb-loop${playback.loop ? ' active' : ''}"
                        data-action="toggle-loop" title="${t('sequencer.loopTooltip')}" aria-label="${t('sequencer.loopLabel', { status: playback.loop ? 'on' : 'off' })}">
                    ${getIcon('repeat', { size: '14px' })}
                </button>
                <button class="sb-btn sb-video-btn${videoBtnClass}"
                        data-action="open-video-bot" title="${t('sequencer.videoBotTooltip')}" aria-label="${t('sequencer.generateVideoAriaLabel')}">
                    ${getIcon('film', { size: '14px' })}
                </button>
            </div>
        </div>
    `;
}
// ----------------------------------------------------------------
// VIDEO BOT - Inline UI (substituiu o painel flutuante)
// ----------------------------------------------------------------
function _renderVideoBotUI(keyframes: any[], playback: any) {
    const kfCount = keyframes.length;
    const totalSec = Math.max(1, Math.round(playback.totalDuration / 1000));
    const estFrames = Math.max(totalSec, 2);
    const estTime = Math.ceil(estFrames * 1.5);
    const isGen = !!window._ecbytsVideoGenerating;
    if (kfCount < 2) {
        return `
            <div class="sb-videobot">
                <div class="sb-videobot-row">
                    <button class="sb-btn" data-action="close-video-bot">
                        ${getIcon('arrow-left', { size: '14px' })}
                    </button>
                    <span class="sb-videobot-msg">
                        Adicione pelo menos 2 keyframes (botao + nos cards) para gerar video.
                    </span>
                </div>
            </div>`;
    }
    if (isGen) {
        return `
            <div class="sb-videobot">
                <div class="sb-videobot-row">
                    <button class="sb-btn" data-action="cancel-video-gen">
                        ${getIcon('x', { size: '14px' })}
                    </button>
                    <div class="sb-videobot-progress-wrap">
                        <div class="sb-video-progress"><div class="sb-video-progress-fill" id="sb-vb-progress"></div></div>
                        <span class="sb-videobot-status" id="sb-vb-status">${t('sequencer.videoBotStarting')}</span>
                    </div>
                </div>
            </div>`;
    }
    // Le key Runway salva na sessao para pre-preencher
    const savedRunwayKey = _escapeAttr(sessionStorage.getItem('ecbyts_video_key') || '');
    return `
        <div class="sb-videobot">
            <div class="sb-videobot-row">
                <button class="sb-btn" data-action="close-video-bot" title="${t('sequencer.backTooltip')}">
                    ${getIcon('arrow-left', { size: '14px' })}
                </button>
                <textarea data-field-meta="true" data-field-meta-key="auto:sb-vb-prompt" class="sb-videobot-prompt" id="sb-vb-prompt" rows="2"
                          placeholder="${t('sequencer.videoDescriptionPlaceholder')}"></textarea>
                <select data-field-meta="true" data-field-meta-key="auto:sb-vb-style" id="sb-vb-style" class="sb-videobot-select">
                    <option value="photorealistic">${t('sequencer.stylePhotorealistic')}</option>
                    <option value="technical">${t('sequencer.styleTechnical')}</option>
                    <option value="artistic">${t('sequencer.styleArtistic')}</option>
                </select>
                <select data-field-meta="true" data-field-meta-key="auto:sb-vb-vidprovider" id="sb-vb-vidprovider" class="sb-videobot-select"
                        data-cc-change="cc-8b3eb71a">
                    <option value="veo3">${t('sequencer.providerVeo3')}</option>
                    <option value="runway">${t('sequencer.providerRunway')}</option>
                </select>
                <button class="sb-btn" data-cc-action="cc-9e38a2b9" title="${t('sequencer.configureApiKeysTooltip')}">
                    ${getIcon('settings', { size: '12px' })}
                </button>
                <button class="sb-btn sb-videobot-gen" data-action="start-video-gen">
                    ${getIcon('play', { size: '12px' })} ${t('sequencer.generateButton')}
                </button>
            </div>
            <input data-field-meta="true" data-field-meta-key="auto:sb-vb-runway-key" id="sb-vb-runway-key" type="password" class="sb-videobot-prompt"
                   autocomplete="off" spellcheck="false"
                   placeholder="${t('sequencer.runwayKeyPlaceholder')}" value="${savedRunwayKey}"
                   style="display:none;font-size:11px;padding:3px 6px;"
                   data-cc-input="cc-899a33e1">
            <div class="sb-videobot-meta">${t('sequencer.videoBotMeta', { kfCount, totalSec, estTime })}</div>
        </div>`;
}
// ----------------------------------------------------------------
// EVENT HANDLING - Delegated
// ----------------------------------------------------------------
function _handleClick(e: any) {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action || '';
    switch (action) {
        case 'fly-to-item': {
            const itemId = target.dataset.itemId || '';
            _activeItemId = itemId;
            flyToItem(itemId, undefined)
                .then(() => {
                    _captureThumbnailsAfterPaint();
                })
                .catch((err: any) => console.warn('[sequencer/renderer] flyToItem failed:', err));
            render();
            break;
        }
        case 'add-keyframe': {
            e.stopPropagation(); // previne fly-to-item do card pai
            const itemId = target.dataset.itemId || '';
            addKeyframe(itemId);
            render();
            import('../../utils/ui/toast.js' as string)
                .then(({ showToast }) => {
                    showToast(t('sequencer.keyframeAdded'), 'success', 3000);
                })
                .catch((err) => console.warn('[sequencer/renderer] import toast failed:', err));
            break;
        }
        case 'remove-keyframe': {
            e.stopPropagation(); // previne seek-keyframe do marker pai
            const kfId = target.dataset.kfId || '';
            const kfBackup = getKeyframes().find((k: any) => k.id === kfId);
            removeKeyframe(kfId);
            render();
            if (kfBackup) {
                import('../../utils/ui/toast.js' as string)
                    .then(({ showToast }) => {
                        showToast(t('sequencer.keyframeRemoved'), 'info', 6000, {
                            action: {
                                label: t('common.undo'),
                                onClick: () => {
                                    addKeyframe(kfBackup.itemId, {
                                        position: kfBackup.position,
                                        duration: kfBackup.duration,
                                        transition: kfBackup.transition,
                                        easing: kfBackup.easing,
                                        annotation: kfBackup.annotation,
                                        laneId: kfBackup.laneId,
                                        cameraOverride: kfBackup.cameraOverride,
                                    });
                                    render();
                                },
                            },
                        });
                    })
                    .catch((err) => console.warn('[sequencer/renderer] import toast failed:', err));
            }
            break;
        }
        case 'play':
            getPlayback().playing ? pause() : play();
            render();
            break;
        case 'stop':
            stop();
            render();
            break;
        case 'seek-keyframe': {
            const kfId = target.dataset.kfId || '';
            flyToKeyframe(kfId, undefined);
            render();
            break;
        }
        case 'cycle-speed': {
            const current = getPlayback().speed;
            const idx = SPEED_OPTIONS.indexOf(current);
            const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
            setPlaybackSpeed(next);
            render();
            break;
        }
        case 'toggle-loop': {
            setPlaybackLoop(!getPlayback().loop);
            render();
            break;
        }
        case 'open-video-bot':
            _videoBotMode = true;
            _dismissPopover();
            render();
            break;
        case 'close-video-bot':
            _videoBotMode = false;
            render();
            break;
        case 'start-video-gen':
            _startVideoGeneration();
            break;
        case 'cancel-video-gen':
            _cancelVideoGeneration();
            break;
        case 'create-lane': {
            createLane();
            render();
            break;
        }
        case 'delete-lane': {
            const laneId = target.dataset.laneId || '';
            if (laneId) {
                const laneKfs = getKeyframes().filter((kf: any) => (kf.laneId || 'lane-default') === laneId);
                if (laneKfs.length > 0) {
                    import('../../utils/ui/asyncDialogs.js' as string)
                        .then(({ asyncConfirm }) => {
                            asyncConfirm(t('sequencer.deleteLaneConfirm', { count: laneKfs.length }))
                                .then((ok: any) => {
                                    if (ok) {
                                        deleteLane(laneId);
                                        render();
                                    }
                                })
                                .catch((err: any) =>
                                    console.warn('[sequencer/renderer] asyncConfirm failed:', err),
                                );
                        })
                        .catch((err) => console.warn('[sequencer/renderer] import asyncDialogs failed:', err));
                } else {
                    deleteLane(laneId);
                    render();
                }
            }
            break;
        }
        case 'rename-lane': {
            const laneId = target.dataset.laneId || '';
            if (laneId) _startRenameInline(target, laneId);
            break;
        }
        case 'refresh-items':
            window.handleRefreshStoryboard?.();
            break;
    }
}
function _handleMouseDown(e: any) {
    // Keyframe drag - horizontal (posicao) e vertical (mudar raia)
    const kfMarker = e.target.closest('.sb-kf-marker');
    if (kfMarker && !e.target.closest('.sb-kf-delete')) {
        const kfId = kfMarker.dataset.kfId || '';
        const scrubWrap = _container.querySelector('[data-action="scrub"]');
        if (!scrubWrap) return;
        const startLaneId = kfMarker.dataset.laneId || '';
        let hasMoved = false;
        let currentLaneId = startLaneId;
        const onMove = (ev: any) => {
            hasMoved = true;
            // Atualizar posicao horizontal
            const tracksContainer = scrubWrap.querySelector('.sb-tracks-container');
            const refRect = tracksContainer
                ? tracksContainer.getBoundingClientRect()
                : scrubWrap.getBoundingClientRect();
            const newPos = Math.max(0, Math.min(1, (ev.clientX - refRect.left) / refRect.width));
            moveKeyframe(kfId, newPos);
            kfMarker.style.left = (newPos * 100).toFixed(1) + '%';
            // Detectar mudanca de raia pelo Y
            const laneRows = scrubWrap.querySelectorAll('.sb-lane-row');
            for (const row of laneRows) {
                const rowRect = row.getBoundingClientRect();
                if (ev.clientY >= rowRect.top && ev.clientY <= rowRect.bottom) {
                    const newLaneId = row.dataset.laneId || '';
                    if (newLaneId && newLaneId !== currentLaneId) {
                        currentLaneId = newLaneId;
                        moveKeyframeToLane(kfId, newLaneId);
                    }
                    break;
                }
            }
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (hasMoved) render();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return;
    }
    // Scrubber drag
    const scrubWrap = e.target.closest('[data-action="scrub"]');
    if (!scrubWrap) return;
    _isDraggingScrubber = true;
    _scrubToEvent(e, scrubWrap);
    const onMove = (ev: any) => {
        if (_isDraggingScrubber) _scrubToEvent(ev, scrubWrap);
    };
    const onUp = () => {
        _isDraggingScrubber = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}
function _handleDblClick(e: any) {
    // Double-click on keyframe marker = edit popover (consistent with right-click)
    const marker = e.target.closest('.sb-kf-marker');
    if (marker) {
        e.preventDefault();
        const kfId = marker.dataset.kfId || '';
        const rect = marker.getBoundingClientRect();
        _showKeyframePopover(kfId, rect);
        return;
    }
    // Double-click on action bar card = add keyframe for this item
    const card = e.target.closest('[data-action="fly-to-item"]');
    if (!card) return;
    const itemId = card.dataset.itemId || '';
    addKeyframe(itemId);
    render();
    import('../../utils/ui/toast.js' as string)
        .then(({ showToast }) => {
            showToast(t('sequencer.keyframeAdded'), 'success', 3000);
        })
        .catch((err) => console.warn('[sequencer/renderer] import toast failed:', err));
}
function _handleContextMenu(e: any) {
    // Right-click on keyframe marker = edit popover
    const marker = e.target.closest('.sb-kf-marker');
    if (!marker) return;
    e.preventDefault();
    const kfId = marker.dataset.kfId || '';
    const rect = marker.getBoundingClientRect();
    _showKeyframePopover(kfId, rect);
}
function _handleKeyDown(e: any) {
    // Enter/Space on focused keyframe marker = open edit popover
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const marker = e.target.closest('.sb-kf-marker');
    if (!marker) return;
    e.preventDefault();
    const kfId = marker.dataset.kfId || '';
    const rect = marker.getBoundingClientRect();
    _showKeyframePopover(kfId, rect);
}
function _scrubToEvent(e: any, wrap: any) {
    // Usar o container das raias como referencia horizontal se disponivel
    const tracksContainer = wrap.querySelector('.sb-tracks-container');
    const refEl = tracksContainer || wrap;
    const rect = refEl.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seek(x);
}
// ----------------------------------------------------------------
// KEYFRAME EDIT POPOVER
// ----------------------------------------------------------------
function _showKeyframePopover(kfId: any, anchorRect: any) {
    _dismissPopover();
    const kf = getKeyframes().find((k: any) => k.id === kfId);
    if (!kf) return;
    const popover = document.createElement('div');
    popover.className = 'sb-kf-popover';
    popover.style.left = `${anchorRect.left}px`;
    popover.style.bottom = `${window.innerHeight - anchorRect.top + 8}px`;
    const easings = ['linear', 'ease-in', 'ease-out', 'ease-in-out'];
    const durationValue = toFiniteNumber(kf.duration, 3000);
    const transitionValue = toFiniteNumber(kf.transition, 1000);
    const annotationValue = _escapeAttr(kf.annotation || '');
    const keyframeIdAttr = _escapeAttr(kf.id);
    popover.innerHTML = `
        <div class="sb-kf-popover-title">${t('sequencer.keyframePopoverTitle')}</div>
        <label class="sb-kf-popover-field">
            ${t('sequencer.durationMsLabel')}
            <input data-field-meta="true" data-field-meta-key="auto-pos:renderer:input:L679" type="number" data-field="duration" value="${durationValue}" min="500" step="500">
        </label>
        <label class="sb-kf-popover-field">
            ${t('sequencer.transitionMsLabel')}
            <input data-field-meta="true" data-field-meta-key="auto-pos:renderer:input:L683" type="number" data-field="transition" value="${transitionValue}" min="200" step="200">
        </label>
        <label class="sb-kf-popover-field">
            ${t('sequencer.easingLabel')}
            <select data-field-meta="true" data-field-meta-key="auto-pos:renderer:select:L687" data-field="easing">
                ${easings.map((e: any) => `<option value="${e}"${kf.easing === e ? ' selected' : ''}>${e}</option>`).join('')}
            </select>
        </label>
        <label class="sb-kf-popover-field">
            ${t('sequencer.annotationLabel')}
            <input data-field-meta="true" data-field-meta-key="auto-pos:renderer:input:L693" type="text" data-field="annotation" value="${annotationValue}" maxlength="100"
                   placeholder="${t('sequencer.optionalNotePlaceholder')}">
        </label>
        <div class="sb-kf-popover-actions">
            <button class="sb-btn" data-action="apply-kf-edit" data-kf-id="${keyframeIdAttr}">${t('common.apply')}</button>
        </div>
    `;
    document.body.appendChild(popover);
    // Direct click handler for Apply (outside _container delegation scope)
    const applyBtn = popover.querySelector('[data-action="apply-kf-edit"]');
    if (applyBtn) {
        applyBtn.addEventListener('click', () => _applyKeyframeEdit(kfId));
    }
    // Click-outside dismissal
    setTimeout(() => {
        document.addEventListener('mousedown', _dismissPopoverOnOutside);
    }, 0);
}
function _applyKeyframeEdit(kfId: any) {
    const popover = document.querySelector('.sb-kf-popover');
    if (!popover) return;
    /** @type {Record<string, any>} */
    const updates: Record<string, any> = {};
    popover.querySelectorAll('[data-field]').forEach((input: any) => {
        const field = input.dataset.field || '';
        updates[field] = input.type === 'number' ? Number(input.value) : input.value;
    });
    updateKeyframe(kfId, updates);
    _dismissPopover();
    render();
}
function _dismissPopover() {
    const existing = document.querySelector('.sb-kf-popover');
    if (existing) existing.remove();
    document.removeEventListener('mousedown', _dismissPopoverOnOutside);
}
function _dismissPopoverOnOutside(e: any) {
    const popover = document.querySelector('.sb-kf-popover');
    if (popover && !popover.contains(e.target)) {
        _dismissPopover();
    }
}
// ----------------------------------------------------------------
// LANE INLINE RENAME
// ----------------------------------------------------------------
function _startRenameInline(spanEl: any, laneId: any) {
    const currentName = spanEl.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'sb-lane-rename-input';
    input.value = currentName;
    input.maxLength = 40;
    spanEl.replaceWith(input);
    input.focus();
    input.select();
    const commit = () => {
        const newName = input.value.trim();
        if (newName) renameLane(laneId, newName);
        render();
    };
    input.addEventListener('blur', commit, { once: true });
    input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
            ev.preventDefault();
            input.blur();
        }
        if (ev.key === 'Escape') {
            input.removeEventListener('blur', commit);
            render();
        }
    });
}
// ----------------------------------------------------------------
// VIDEO BOT - Start / Cancel (inline, sem painel flutuante)
// ----------------------------------------------------------------
async function _startVideoGeneration() {
    const style = _container?.querySelector('#sb-vb-style')?.value || 'photorealistic';
    const customPrompt = _container?.querySelector('#sb-vb-prompt')?.value || '';
    const videoProvider = _container?.querySelector('#sb-vb-vidprovider')?.value || 'veo3';
    const videoKey = sessionStorage.getItem('ecbyts_video_key') || undefined;
    window._ecbytsVideoGenerating = true;
    render(); // mostra UI de progresso inline
    try {
        const { generateTimelineVideo, onProgress } = await import('./videoBot.js' as string);
        const unsub = onProgress((info: any) => {
            const fill = _container?.querySelector('#sb-vb-progress');
            const status = _container?.querySelector('#sb-vb-status');
            if (fill) fill.style.width = `${info.percent || 0}%`;
            if (status) status.textContent = info.message || `${info.stage}...`;
        });
        const result = await generateTimelineVideo({
            style,
            resolution: '720p',
            fps: 12,
            customPrompt,
            interpolated: true,
            videoProvider,
            videoKey,
        });
        unsub();
        let savedToFiles = false;
        let savedLocally = false;
        let providerTag = videoProvider;
        if (result?.videoBlob) {
            const filename = `ecbyts-video-${Date.now()}.${result.videoExt || 'mp4'}`;
            const videoFile = new File([result.videoBlob], filename, {
                type: result.videoBlob.type || 'video/mp4',
            });
            providerTag = String(result?.config?.provider || videoProvider || 'veo3').toLowerCase();
            try {
                const { getCurrentUser } = await import('../../utils/auth/session.js' as string);
                const user = getCurrentUser();
                const statusEl = _container?.querySelector('#sb-vb-status');
                if (statusEl) statusEl.textContent = t('sequencer.savingToFiles');
                if (user?.id) {
                    const { register } = await import('../../utils/files/fileManager.js' as string);
                    const { FILE_SOURCE } = await import('../../utils/files/fileConstants.js' as string);
                    const reg = await register(videoFile, {
                        source: FILE_SOURCE.AUTOMATION,
                        tags: ['video', 'ai-generated', providerTag],
                    });
                    if (reg.ok) {
                        savedToFiles = true;
                        try {
                            const { renderFilesPanel } = await import('../../utils/files/filePanel.js' as string);
                            renderFilesPanel();
                        } catch (e: any) {
                            console.debug(
                                '[sequencer] render-files-panel-after-register:',
                                e?.message || e,
                            ); /* original ignore */
                        }
                    } else {
                        console.warn('[sequencer] files_register_failed', reg.error, reg.code);
                    }
                } else {
                    const { saveLocalGeneratedVideo } = await import('../../utils/files/localGeneratedFiles.js' as string);
                    const localRes = await saveLocalGeneratedVideo(videoFile, {
                        provider: providerTag,
                        tags: ['video', 'ai-generated', providerTag],
                    });
                    if (localRes.ok) {
                        savedLocally = true;
                        try {
                            const { renderFilesPanel } = await import('../../utils/files/filePanel.js' as string);
                            renderFilesPanel();
                        } catch (e: any) {
                            console.debug(
                                '[sequencer] render-files-panel-after-local-save:',
                                e?.message || e,
                            ); /* original ignore */
                        }
                    } else {
                        console.warn('[sequencer] files_local_save_failed', localRes.error);
                    }
                }
            } catch (filesErr: any) {
                console.warn('[sequencer] files_save_skipped', filesErr.message);
            }
            const url = URL.createObjectURL(result.videoBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
        const { showToast } = await import('../../utils/ui/toast.js' as string);
        const providerLabel = providerTag === 'runway' ? 'Runway Gen-3' : 'Google Veo 3';
        if (savedToFiles) {
            showToast(t('sequencer.videoGeneratedSavedAndDownloaded', { provider: providerLabel }), 'success');
        } else if (savedLocally) {
            showToast(t('sequencer.videoGeneratedSavedLocallyAndDownloaded', { provider: providerLabel }), 'success');
        } else {
            showToast(t('sequencer.videoGeneratedDownloaded', { provider: providerLabel }), 'success');
        }
    } catch (err: any) {
        try {
            const { showToast } = await import('../../utils/ui/toast.js' as string);
            showToast(t('common.errorWithMessage', { message: err.message }), 'error');
        } catch (e: any) {
            console.debug('[sequencer] error-toast-fallback:', e?.message || e); /* original ignore */
        }
    } finally {
        window._ecbytsVideoGenerating = false;
        _videoBotMode = false;
        render();
    }
}
function _cancelVideoGeneration() {
    import('./videoBot.js' as string)
        .then(({ cancelGeneration }) => {
            cancelGeneration();
        })
        .catch((_e) => console.debug('[core/sequencer/renderer:silent-catch]', _e?.message || _e));
    window._ecbytsVideoGenerating = false;
    _videoBotMode = false;
    render();
}
// ----------------------------------------------------------------
// UI UPDATE - Called by engine tick (lightweight, no re-render)
// ----------------------------------------------------------------
function _updatePlaybackUI(info: any) {
    if (!_container) return;
    // Atualizar todas as fills (uma por raia) e o cursor line
    const pct = (info.position * 100).toFixed(1) + '%';
    _container.querySelectorAll('.sb-scrubber-fill').forEach((fill: any) => {
        fill.style.width = pct;
    });
    const cursorLine = _container.querySelector('.sb-cursor-line');
    if (cursorLine) cursorLine.style.left = pct;
    // Compatibilidade: thumb legado (caso exista)
    const thumb = _container.querySelector('.sb-scrubber-thumb');
    if (thumb) thumb.style.left = pct;
    const timeEl = _container.querySelector('.sb-time');
    if (timeEl) {
        const playback = getPlayback();
        const elapsed = _formatTime((info.position * playback.totalDuration) / 1000);
        const total = _formatTime(playback.totalDuration / 1000);
        timeEl.textContent = `${elapsed} / ${total}`;
    }
    // Update active card highlight
    if (info.activeKeyframe) {
        const newActiveId = info.activeKeyframe.itemId;
        if (newActiveId !== _activeItemId) {
            _activeItemId = newActiveId;
            _updateActiveCard();
        }
    }
}
function _updateActiveCard() {
    if (!_container) return;
    const cards = _container.querySelectorAll('.sb-card');
    cards.forEach((card: any) => {
        card.classList.toggle('active', card.dataset.itemId === _activeItemId);
    });
}
// ----------------------------------------------------------------
// THUMBNAIL CAPTURE - Screenshot de cada item
// ----------------------------------------------------------------
async function _captureThumbnails() {
    if (_isCapturing) return;
    const items = getItems();
    if (items.length === 0) return;
    const renderer = getRenderer();
    if (!renderer || !renderer.domElement) return;
    _isCapturing = true;
    const ctrl = await _loadControls();
    if (!ctrl) { _isCapturing = false; return; } // chunk de controls fora do ar — aborta a captura
    const originalCamera = ctrl.getCameraState();
    const offscreen = document.createElement('canvas');
    offscreen.width = THUMB_SIZE;
    offscreen.height = THUMB_SIZE;
    const ctx: any = offscreen.getContext("2d");
    for (const item of items) {
        if (_thumbnails[item.id]) continue; // ja capturado
        if (!item.cameraState) continue;
        // Posicionar camera na vista do item
        ctrl.setCameraState(item.cameraState);
        requestRender();
        // Esperar um frame para o render completar
        await new Promise((r) => requestAnimationFrame(r));
        // Crop quadrado do centro do canvas
        const src = renderer.domElement;
        const size = Math.min(src.width, src.height);
        const sx = (src.width - size) / 2;
        const sy = (src.height - size) / 2;
        ctx.clearRect(0, 0, THUMB_SIZE, THUMB_SIZE);
        ctx.drawImage(src, sx, sy, size, size, 0, 0, THUMB_SIZE, THUMB_SIZE);
        _thumbnails[item.id] = offscreen.toDataURL('image/jpeg', 0.65);
    }
    // Restaurar camera original
    ctrl.setCameraState(originalCamera);
    requestRender();
    _isCapturing = false;
    // Re-render para mostrar thumbnails
    render();
}
/**
 * Forca recaptura de thumbnails (chamado apos mudanca de cena).
 */
export function refreshThumbnails() {
    _thumbnails = {};
    _captureThumbnails();
}
// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
const _ESCAPE_MAP: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};
function _escapeHtml(value: any) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => _ESCAPE_MAP[ch] || ch);
}
function _escapeAttr(value: any) {
    return _escapeHtml(value);
}
function _formatTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}
function _isVideoGenerating() {
    return !!window._ecbytsVideoGenerating;
}
