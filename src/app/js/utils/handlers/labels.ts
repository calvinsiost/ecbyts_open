// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   LABEL HANDLERS — Window.* functions for HTML onclick
   ================================================================

   Handlers para controles de labels 3D no modelo.
   Toggle global, toggle por categoria, modal de configuracao.

   ================================================================ */
import { getLabelConfig, isLabelsEnabled, setLabelsEnabled, setLabelCategoryEnabled, setLabelCategorySetting, setPerElementLabel, resetLabelSettings, } from '../labels/manager.js';
import { setMaxVisible, getMaxVisible, setLeaderMinDistance, getLeaderMinDistance, setNudgeEnabled, getNudgeEnabled, setFamilyPriority, getFamilyPriority, setShowAll, getShowAll, setFamilyDisabled, isFamilyDisabled, getDisabledFamilies, } from '../labels/renderer.js';
import { getAllElements } from '../../core/elements/manager.js';
import { getFamilyName } from '../../core/elements/families.js';
import { escapeHtml } from '../helpers/html.js';
import { openModal, closeModal } from '../ui/modals.js';
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
import { getIcon } from '../ui/icons.js';
import { safeSetItem } from '../storage/storageMonitor.js';
import { createLogger } from '../helpers/logger.js';
const log = createLogger('Labels');
/** @typedef {{ id: string, icon: string, i18nKey: string }} LabelCategoryMeta */
/** @typedef {Record<string, any>} LabelCategoryConfig */
/** @typedef {{ enabled: boolean, categories: Record<string, LabelCategoryConfig> }} LabelConfig */
/** @typedef {{ left: number, top: number, right: number, bottom: number }} RectLike */
type LabelCategoryConfig = Record<string, any>;
type RectLike = { left: number; top: number; right: number; bottom: number };
// ----------------------------------------------------------------
// HANDLERS
// ----------------------------------------------------------------
/**
 * Toggle global de labels 3D.
 */
function handleToggleLabels() {
    const enabled = !isLabelsEnabled();
    setLabelsEnabled(enabled);
    _updateToggleButton(enabled);
    showToast(enabled ? t('labels3dEnabled') : t('labels3dDisabled'), 'info');
}
/**
 * Abre modal de configuracao de labels.
 */
function handleOpenLabelSettings() {
    _renderLabelSettingsModal();
    openModal('labels-modal');
}
/**
 * Fecha modal de labels.
 */
function handleCloseLabelSettings() {
    closeModal('labels-modal');
}
/**
 * Toggle de uma categoria de labels.
 * @param {string} category - 'elementNames'|'observations'|'geology'|'modelTitle'
 */
function handleLabelCategoryToggle(category: string) {
    const config = (getLabelConfig());
    setLabelCategoryEnabled(category, !config.categories?.[category]?.enabled);
    _renderLabelSettingsModal();
}
/**
 * Altera um setting de uma categoria.
 * @param {string} category
 * @param {string} key
 * @param {*} value
 */
function handleLabelSettingChange(category: string, key: string, value: any) {
    setLabelCategorySetting(category, key, value);
}
/**
 * Toggle de label por elemento.
 * @param {string} elementId
 * @param {string} labelType - 'nameLabel'|'obsLabel'
 * @param {boolean} enabled
 */
function handleToggleElementLabel(elementId: string, labelType: string, enabled: boolean) {
    setPerElementLabel(elementId, { [labelType]: enabled });
}
/**
 * Reseta labels para configuracao padrao.
 */
function handleResetLabelSettings() {
    resetLabelSettings();
    _renderLabelSettingsModal();
    showToast(t('labelResetDone'), 'info');
}
// ----------------------------------------------------------------
// MODAL RENDERING
// ----------------------------------------------------------------
const CATEGORIES = ([
    { id: 'elementNames', icon: 'tag', i18nKey: 'elementNameLabels' },
    { id: 'observations', icon: 'activity', i18nKey: 'observationLabels' },
    { id: 'geology', icon: 'layers', i18nKey: 'geologyLabels' },
    { id: 'modelTitle', icon: 'type', i18nKey: 'modelTitleLabel' },
    { id: 'modelSubtitle', icon: 'filter', i18nKey: 'modelSubtitleLabel' },
]);
function _renderLabelSettingsModal() {
    const body = document.getElementById('labels-modal-body');
    if (!body)
        return;
    const config = (getLabelConfig());
    const cats = config.categories;
    let html = '';
    // Toggle global
    html += `
    <div class="label-settings-global">
        <label class="label-toggle-row">
            <input data-field-meta="true" data-field-meta-key="auto-pos:labels:input:L150" type="checkbox" ${config.enabled ? 'checked' : ''}
                data-cc-change="cc-3d6ef367">
            <span class="label-toggle-text">${t('labels3dEnabled')}</span>
        </label>
    </div>`;
    // Categorias
    for (const cat of CATEGORIES) {
        const c = cats[cat.id];
        const expanded = c.enabled;
        html += `
        <div class="label-category-card ${expanded ? 'expanded' : ''}">
            <div class="label-category-header" data-cc-call-click="handleLabelCategoryToggle|s:${encodeURIComponent(`${cat.id}`)}">
                <span class="label-category-icon">${getIcon(cat.icon)}</span>
                <span class="label-category-name">${t(cat.i18nKey)}</span>
                <label class="label-category-toggle" data-cc-call-click="__noop" data-cc-stop="1">
                    <input data-field-meta="true" data-field-meta-key="auto-pos:labels:input:L167" type="checkbox" ${c.enabled ? 'checked' : ''}
                        data-cc-call-change="handleLabelCategoryToggle|s:${encodeURIComponent(`${cat.id}`)}">
                </label>
            </div>`;
        if (c.enabled) {
            html += `<div class="label-category-body">`;
            html += _renderCategorySettings(cat.id, c);
            html += `</div>`;
        }
        html += `</div>`;
    }
    // Reset button
    html += `
    <div class="label-settings-footer">
        <button class="btn btn-secondary btn-sm" data-cc-action="cc-01b16caa">
            ${getIcon('refresh-cw')} ${t('labelResetDefaults')}
        </button>
    </div>`;
    body.innerHTML = html;
}
/** @param {string} catId @param {LabelCategoryConfig} config */
function _renderCategorySettings(catId: string, config: LabelCategoryConfig) {
    let html = '';
    // Font size
    html += `
    <div class="label-setting-row">
        <label>${t('labelFontSize')}</label>
        <input data-field-meta="true" data-field-meta-key="auto-pos:labels:input:L199" type="range" min="8" max="24" value="${config.fontSize}"
            data-cc-call-input="handleLabelSettingChange|s:${encodeURIComponent(`${catId}`)}|s:fontSize|nv">
        <span class="label-setting-value">${config.fontSize}px</span>
    </div>`;
    // Color
    html += `
    <div class="label-setting-row">
        <label>${t('labelColor')}</label>
        <div class="label-color-options">
            ${catId === 'elementNames'
        ? `
                <label>
                    <input data-field-meta="true" data-field-meta-key="auto-pos:labels:input:L213" type="radio" name="color-${catId}" value="auto"
                        ${config.color === 'auto' ? 'checked' : ''}
                        data-cc-call-change="handleLabelSettingChange|s:${encodeURIComponent(`${catId}`)}|s:color|s:auto">
                    ${t('labelAutoColor')}
                </label>
            `
        : ''}
            <input type="color" value="${config.color === 'auto' ? '#ffffff' : config.color}"
                data-cc-call-change="handleLabelSettingChange|s:${encodeURIComponent(`${catId}`)}|s:color|v">
        </div>
    </div>`;
    // Background
    html += `
    <div class="label-setting-row">
        <label>${t('labelBackground')}</label>
        <select data-field-meta="true" data-field-meta-key="auto-pos:labels:select:L230" data-cc-call-change="handleLabelSettingChange|s:${encodeURIComponent(`${catId}`)}|s:background|v">
            <option value="rgba(0,0,0,0.6)" ${config.background === 'rgba(0,0,0,0.6)' ? 'selected' : ''}>Dark</option>
            <option value="rgba(0,0,0,0.3)" ${config.background === 'rgba(0,0,0,0.3)' ? 'selected' : ''}>Light Dark</option>
            <option value="rgba(255,255,255,0.7)" ${config.background === 'rgba(255,255,255,0.7)' ? 'selected' : ''}>Light</option>
            <option value="transparent" ${config.background === 'transparent' ? 'selected' : ''}>None</option>
        </select>
    </div>`;
    // Category-specific settings
    if (catId === 'observations') {
        html += `
        <div class="label-setting-row">
            <label>
                <input data-field-meta="true" data-field-meta-key="auto-pos:labels:input:L243" type="checkbox" ${config.showUnit ? 'checked' : ''}
                    data-cc-change="cc-983ed0ff">
                ${t('labelShowUnit')}
            </label>
        </div>
        <div class="label-setting-row">
            <label>
                <input data-field-meta="true" data-field-meta-key="auto-pos:labels:input:L250" type="checkbox" ${config.showDate ? 'checked' : ''}
                    data-cc-change="cc-81386efd">
                ${t('labelShowDate')}
            </label>
        </div>`;
    }
    if (catId === 'modelTitle') {
        const anchor = config.anchor || 'top-center';
        html += `
        <div class="label-setting-row">
            <label>${t('modelTitleText')}</label>
            <input data-field-meta="true" data-field-meta-key="auto-pos:labels:input:L261" type="text" value="${config.text || ''}"
                placeholder="${t('modelTitlePlaceholder')}"
                data-cc-change="cc-9ebbd97d">
        </div>
        <div class="label-setting-row">
            <label>${t('modelTitleAnchor')}</label>
            <select data-field-meta="true" data-field-meta-key="auto-pos:labels:select:L270"
                data-cc-change="cc-13df62e3">
                <option value="top-left" ${anchor === 'top-left' ? 'selected' : ''}>${t('modelTitleAnchorTopLeft')}</option>
                <option value="top-center" ${anchor === 'top-center' ? 'selected' : ''}>${t('modelTitleAnchorTopCenter')}</option>
                <option value="top-right" ${anchor === 'top-right' ? 'selected' : ''}>${t('modelTitleAnchorTopRight')}</option>
                <option value="bottom-left" ${anchor === 'bottom-left' ? 'selected' : ''}>${t('modelTitleAnchorBottomLeft')}</option>
                <option value="bottom-center" ${anchor === 'bottom-center' ? 'selected' : ''}>${t('modelTitleAnchorBottomCenter')}</option>
                <option value="bottom-right" ${anchor === 'bottom-right' ? 'selected' : ''}>${t('modelTitleAnchorBottomRight')}</option>
                <option value="world" ${anchor === 'world' ? 'selected' : ''}>${t('modelTitleAnchorWorld')}</option>
            </select>
        </div>`;
    }
    if (catId === 'modelSubtitle') {
        const showActiveFilters = config.showActiveFilters !== false;
        html += `
        <div class="label-setting-row">
            <small>${t('modelSubtitleHint')}</small>
        </div>
        <div class="label-setting-row">
            <label>
                <input data-field-meta="true" data-field-meta-key="auto-pos:labels:input:L300"
                    type="checkbox" ${showActiveFilters ? 'checked' : ''}
                    data-cc-change="cc-be31ce86">
                ${t('modelSubtitleShowActiveFilters')}
            </label>
        </div>
        ${!showActiveFilters
            ? `
        <div class="label-setting-row">
            <label>${t('modelSubtitleCustomText')}</label>
            <input data-field-meta="true" data-field-meta-key="auto-pos:labels:input:L310"
                type="text" value="${config.text || ''}"
                placeholder="${t('modelSubtitlePlaceholder')}"
                data-cc-change="cc-8ce2e53d">
        </div>`
            : ''}`;
    }
    return html;
}
// ----------------------------------------------------------------
// QUICK POPUP - Badge "Aa" no viewport
// ----------------------------------------------------------------
let _popupCloseHandler: any = null;
let _overlayPositioningInit = false;
let _overlayPositionRAF = 0;
let _overlayResizeObserver: any = null;
function _scheduleOverlayPosition() {
    if (_overlayPositionRAF)
        cancelAnimationFrame(_overlayPositionRAF);
    _overlayPositionRAF = requestAnimationFrame(() => {
        _overlayPositionRAF = 0;
        _positionOverlayControls();
    });
}
/**
 * Posiciona badges/popups do viewport de forma programatica, ancorando no
 * #view-controls para evitar sobreposicao com HUD/paineis responsivos.
 */
function _positionOverlayControls() {
    const canvas = document.getElementById('canvas-container');
    const mainArea = document.getElementById('main-area');
    const viewControls = document.getElementById('view-controls');
    const labelsBadge = document.getElementById('labels-toggle-badge');
    const popup = document.getElementById('labels-quick-popup');
    const viewModeBadge = document.getElementById('view-mode-badge');
    if (!viewControls || !mainArea)
        return;
    const vcRect = viewControls.getBoundingClientRect();
    const mainRect = mainArea.getBoundingClientRect();
    const isSpatialAnchorVisible = vcRect.width > 0 && vcRect.height > 0;
    let viewBadgePlaced = false;
    /** @param {RectLike} e? @param {RectLike} b */
    const intersects = (a: RectLike, b: RectLike) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const VIEW_BADGE_GAP_FROM_AA = 12;
    const VIEW_BADGE_VERTICAL_OFFSET = 0;
    const POPUP_SIDE_GAP = 10;
    // Badge "Aa" e popup: apenas no canvas/spatial.
    if (canvas && labelsBadge && isSpatialAnchorVisible) {
        const canvasRect = canvas.getBoundingClientRect();
        if (canvasRect.width > 0 && canvasRect.height > 0) {
            const aaGapY = 8;
            const canvasOffsetX = Math.round(canvasRect.left - mainRect.left);
            const canvasOffsetY = Math.round(canvasRect.top - mainRect.top);
            const labelRect = labelsBadge.getBoundingClientRect();
            const labelW = Math.max(28, Math.round(labelRect.width || labelsBadge.offsetWidth || 34));
            const labelH = Math.max(20, Math.round(labelRect.height || labelsBadge.offsetHeight || 28));
            let aaLeftMain = Math.round(vcRect.left - mainRect.left);
            let aaTopMain = Math.round(vcRect.top - mainRect.top - labelH - aaGapY);
            const minAaLeftMain = canvasOffsetX + 8;
            const maxAaLeftMain = canvasOffsetX + Math.round(canvasRect.width) - labelW - 8;
            const minAaTopMain = canvasOffsetY + 8;
            const maxAaTopMain = canvasOffsetY + Math.round(canvasRect.height) - labelH - 8;
            aaLeftMain = Math.min(maxAaLeftMain, Math.max(minAaLeftMain, aaLeftMain));
            aaTopMain = Math.min(maxAaTopMain, Math.max(minAaTopMain, aaTopMain));
            const aaLeftCanvas = aaLeftMain - canvasOffsetX;
            const aaTopCanvas = aaTopMain - canvasOffsetY;
            labelsBadge.style.left = `${Math.round(Math.max(8, aaLeftCanvas))}px`;
            labelsBadge.style.top = `${Math.round(Math.max(8, aaTopCanvas))}px`;
            labelsBadge.style.bottom = 'auto';
            labelsBadge.style.right = 'auto';
            // Botao unico de view: horizontal preferencial ao lado do badge Aa.
            if (viewModeBadge) {
                const vmRect = viewModeBadge.getBoundingClientRect();
                const vmW = Math.max(34, Math.round(vmRect.width || viewModeBadge.offsetWidth || 46));
                const vmH = Math.max(20, Math.round(vmRect.height || viewModeBadge.offsetHeight || 28));
                const gap = VIEW_BADGE_GAP_FROM_AA;
                // Anti-overlap hard guard: never allow view badge to intercept Aa.
                const aaBox = {
                    left: aaLeftMain,
                    top: aaTopMain,
                    right: aaLeftMain + labelW,
                    bottom: aaTopMain + labelH,
                };
                // Keep view badge inside the visible canvas region (in main-area coordinates).
                const minVmLeftMain = canvasOffsetX + 8;
                const minVmTopMain = canvasOffsetY + 8;
                const maxVmLeftMain = Math.max(minVmLeftMain, canvasOffsetX + Math.round(canvasRect.width) - vmW - 8);
                const maxVmTopMain = Math.max(minVmTopMain, canvasOffsetY + Math.round(canvasRect.height) - vmH - 8);
                /** @param {number} left @param {number} top */
                const clampVmPosition = (left: number, top: number) => ({
                    left: Math.min(maxVmLeftMain, Math.max(minVmLeftMain, Math.round(left))),
                    top: Math.min(maxVmTopMain, Math.max(minVmTopMain, Math.round(top))),
                });
                /** @param {number} left @param {number} top */
                const toVmBox = (left: number, top: number) => ({
                    left,
                    top,
                    right: left + vmW,
                    bottom: top + vmH,
                });
                // Explicit fallback order:
                // 1) right of Aa (primary)
                // 2) left of Aa
                // 3) below Aa (last-resort layout fallback)
                const vmCandidates = [
                    { left: aaLeftMain + labelW + gap, top: aaTopMain + VIEW_BADGE_VERTICAL_OFFSET },
                    { left: aaLeftMain - vmW - gap, top: aaTopMain + VIEW_BADGE_VERTICAL_OFFSET },
                    { left: aaLeftMain, top: aaTopMain + labelH + gap },
                ];
                let chosenVmPos = null;
                for (const candidate of vmCandidates) {
                    const pos = clampVmPosition(candidate.left, candidate.top);
                    const box = toVmBox(pos.left, pos.top);
                    if (!intersects(box, aaBox)) {
                        chosenVmPos = pos;
                        break;
                    }
                }
                if (!chosenVmPos) {
                    chosenVmPos = clampVmPosition(aaLeftMain, aaTopMain + labelH + gap);
                }
                let vmLeftMain = chosenVmPos.left;
                let vmTopMain = chosenVmPos.top;
                let vmBox = toVmBox(vmLeftMain, vmTopMain);
                // Hard guard: if clamping still caused overlap, force-separate badges.
                if (intersects(vmBox, aaBox)) {
                    const tryRight = clampVmPosition(aaBox.right + gap, vmTopMain);
                    let tryBox = toVmBox(tryRight.left, tryRight.top);
                    if (!intersects(tryBox, aaBox)) {
                        vmLeftMain = tryRight.left;
                        vmTopMain = tryRight.top;
                        vmBox = tryBox;
                    }
                    else {
                        const tryLeft = clampVmPosition(aaBox.left - vmW - gap, vmTopMain);
                        tryBox = toVmBox(tryLeft.left, tryLeft.top);
                        if (!intersects(tryBox, aaBox)) {
                            vmLeftMain = tryLeft.left;
                            vmTopMain = tryLeft.top;
                            vmBox = tryBox;
                        }
                        else {
                            const tryBelow = clampVmPosition(vmLeftMain, aaBox.bottom + gap);
                            tryBox = toVmBox(tryBelow.left, tryBelow.top);
                            vmLeftMain = tryBelow.left;
                            vmTopMain = tryBelow.top;
                            vmBox = tryBox;
                        }
                    }
                }
                if (intersects(vmBox, aaBox)) {
                    // Extreme narrow scenarios: keep a deterministic non-blocking placement.
                    const forced = clampVmPosition(aaBox.right + gap, aaBox.bottom + gap);
                    vmLeftMain = forced.left;
                    vmTopMain = forced.top;
                }
                viewModeBadge.style.left = `${Math.round(vmLeftMain)}px`;
                viewModeBadge.style.top = `${Math.round(vmTopMain)}px`;
                viewModeBadge.style.bottom = 'auto';
                viewModeBadge.style.right = 'auto';
                viewBadgePlaced = true;
            }
            // Popup ancorado ao Aa com clamp dentro do canvas.
            if (popup && !popup.classList.contains('hidden')) {
                const popupRect = popup.getBoundingClientRect();
                const popupGap = 8;
                // Prefer side anchoring to avoid covering badge hitbox.
                let popupLeft = aaLeftCanvas + labelW + POPUP_SIDE_GAP;
                if (popupLeft + popupRect.width > canvasRect.width - 8) {
                    popupLeft = aaLeftCanvas - popupRect.width - POPUP_SIDE_GAP;
                }
                let popupTop = aaTopCanvas - Math.round((popupRect.height - labelH) / 2);
                const maxLeft = Math.max(8, canvasRect.width - popupRect.width - 8);
                const maxTop = Math.max(8, canvasRect.height - popupRect.height - 8);
                popupLeft = Math.min(maxLeft, Math.max(8, popupLeft));
                popupTop = Math.min(maxTop, Math.max(8, popupTop));
                // Hard guard: popup nunca deve interceptar o clique do badge "Aa".
                const popupBottom = popupTop + popupRect.height;
                const aaBottom = aaTopCanvas + labelH;
                const overlapsAa = popupTop < aaBottom && popupBottom > aaTopCanvas;
                if (overlapsAa) {
                    popupTop = Math.min(maxTop, aaBottom + popupGap);
                }
                popup.style.left = `${Math.round(popupLeft)}px`;
                popup.style.top = `${Math.round(popupTop)}px`;
                popup.style.bottom = 'auto';
                popup.style.right = 'auto';
            }
        }
    }
    // Actions (ou sem ancora espacial): deixa o badge de view no fallback CSS.
    if (viewModeBadge && !viewBadgePlaced) {
        viewModeBadge.style.removeProperty('top');
        viewModeBadge.style.removeProperty('left');
        viewModeBadge.style.removeProperty('right');
        viewModeBadge.style.removeProperty('bottom');
    }
}
function _initOverlayPositioning() {
    if (_overlayPositioningInit)
        return;
    _overlayPositioningInit = true;
    _scheduleOverlayPosition();
    window.addEventListener('resize', _scheduleOverlayPosition, { passive: true });
    window.addEventListener('viewChanged', _scheduleOverlayPosition);
    window.addEventListener('viewModeChanged', _scheduleOverlayPosition);
    if (typeof ResizeObserver === 'undefined')
        return;
    _overlayResizeObserver = new ResizeObserver(_scheduleOverlayPosition);
    ['main-area', 'canvas-container', 'view-controls', 'constellation-hud']
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .forEach((el: any) => {
        if (_overlayResizeObserver && el)
            _overlayResizeObserver.observe(el);
    });
}
/**
 * Abre/fecha o popup rapido de labels ao clicar no badge "Aa".
 */
/** @param {PointerEvent} [e?] */
function handleOpenLabelPopup(e?: PointerEvent) {
    e?.stopPropagation();
    const popup = document.getElementById('labels-quick-popup');
    if (!popup)
        return;
    const isOpen = !popup.classList.contains('hidden');
    if (isOpen) {
        _closeLabelPopup();
        return;
    }
    // Sincroniza estado dos botoes antes de abrir
    _syncPopupState(popup);
    popup.classList.remove('hidden');
    _scheduleOverlayPosition();
    // Click-outside fecha
    _popupCloseHandler = (ev: any) => {
        const target = ev.target as HTMLElement | null;
        if (!popup.contains(target) && target?.id !== 'labels-toggle-badge') {
            _closeLabelPopup();
        }
    };
    const closeHandler = _popupCloseHandler;
    if (closeHandler)
        setTimeout(() => document.addEventListener('pointerdown', closeHandler), 0);
}
function _closeLabelPopup() {
    const popup = document.getElementById('labels-quick-popup');
    if (popup)
        popup.classList.add('hidden');
    if (_popupCloseHandler) {
        document.removeEventListener('pointerdown', _popupCloseHandler);
        _popupCloseHandler = null;
    }
}
/**
 * Altera fontSize de todas as categorias de labels ativas.
 */
/** @param {number|string} size @param {HTMLElement|null} btn */
function handleLabelQuickSize(size: any, btn: HTMLElement | null) {
    const clamped = Math.max(8, Math.min(24, Number(size)));
    if (!Number.isFinite(clamped))
        return;
    const categories = ['elementNames', 'observations', 'geology', 'modelTitle'];
    for (const cat of categories) {
        setLabelCategorySetting(cat, 'fontSize', clamped);
    }
    if (btn) {
        const group = btn.parentElement;
        if (group) {
            group.querySelectorAll('.lqp-btn').forEach((b: any) => b.classList.remove('active'));
            btn.classList.add('active');
        }
    }
}
/**
 * Altera densidade (max labels visiveis).
 */
/** @param {number|string} n @param {HTMLElement} btn */
function handleLabelQuickDensity(n: any, btn: HTMLElement) {
    setMaxVisible(Number(n));
    safeSetItem('ecbyts-label-density', String(n));
    const group = btn.parentElement;
    if (group) {
        group.querySelectorAll('.lqp-btn').forEach((b: any) => b.classList.remove('active'));
        btn.classList.add('active');
    }
}
/**
 * Ajusta distancia minima para desenhar links label -> elemento.
 */
/** @param {number|string} n @param {HTMLElement|null} btn */
function handleLabelLinkDistance(n: any, btn: HTMLElement | null) {
    setLeaderMinDistance(Number(n));
    safeSetItem('ecbyts-label-leader-min-dist', String(n));
    const group = btn?.parentElement;
    if (group) {
        group.querySelectorAll('.lqp-btn').forEach((b: any) => b.classList.remove('active'));
        btn.classList.add('active');
    }
}
/**
 * Liga/desliga labels via popup.
 */
/** @param {HTMLElement} btn */
function handleLabelQuickToggle(btn: HTMLElement) {
    const enabled = !isLabelsEnabled();
    setLabelsEnabled(enabled);
    _updateToggleButton(enabled);
    _updateBadgeState(enabled);
    btn.textContent = enabled ? t('labelOff') || 'Desligar' : t('labelOn') || 'Ligar';
}
/**
 * Toggle redistribuicao (nudge) de labels via popup.
 */
/** @param {HTMLElement|null} btn */
function handleLabelQuickNudge(btn: HTMLElement | null) {
    const newState = !getNudgeEnabled();
    setNudgeEnabled(newState);
    // W4.1 (D04): default agora é ON — desligar precisa persistir '0'
    // explícito (remover a chave voltaria ao default ligado no reload).
    if (newState) {
        safeSetItem('ecbyts-label-nudge', '1');
    }
    else {
        try {
            safeSetItem('ecbyts-label-nudge', '0');
        }
        catch (err: any) {
            log.debug('Remove label-nudge ignored', err?.message);
        }
    }
    if (btn)
        btn.classList.toggle('active', newState);
}
/**
 * Toggle "Mostrar Todos" - forca todas labels visiveis (pula declutter).
 */
/** @param {HTMLElement|null} btn */
function handleLabelShowAll(btn: HTMLElement | null) {
    const newState = !getShowAll();
    setShowAll(newState);
    if (newState) {
        safeSetItem('ecbyts-label-show-all', '1');
    }
    else {
        try {
            localStorage.removeItem('ecbyts-label-show-all');
        }
        catch (err: any) {
            log.debug('Remove label-show-all ignored', err?.message);
        }
    }
    if (btn)
        btn.classList.toggle('active', newState);
}
/**
 * Toggle visibilidade de labels de uma familia especifica.
 */
/** @param {string} familyId */
function handleLabelFamilyToggle(familyId: string) {
    const isDisabled = isFamilyDisabled(familyId);
    setFamilyDisabled(familyId, !isDisabled);
    // Persistir
    const disabled = getDisabledFamilies();
    if (disabled.length > 0) {
        safeSetItem('ecbyts-label-disabled-families', JSON.stringify(disabled));
    }
    else {
        try {
            localStorage.removeItem('ecbyts-label-disabled-families');
        }
        catch (err: any) {
            log.debug('Remove label-disabled-families ignored', err?.message);
        }
    }
    // Re-renderiza lista no popup
    const popup = document.getElementById('labels-quick-popup');
    if (popup) {
        const list = _getModelFamilyOrder();
        _renderPriorityList(popup, list);
    }
}
/**
 * Move uma familia na lista de prioridade.
 * @param {string} familyId
 * @param {number} direction - -1 (sobe) ou +1 (desce)
 */
function handleLabelFamilyPriority(familyId: string, direction: number) {
    if (direction !== -1 && direction !== 1)
        return;
    const list = _getModelFamilyOrder();
    const idx = list.indexOf(familyId);
    if (idx === -1)
        return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= list.length)
        return;
    // Swap
    [list[idx], list[newIdx]] = [list[newIdx], list[idx]];
    setFamilyPriority(list);
    safeSetItem('ecbyts-label-family-priority', JSON.stringify(list));
    // Re-renderiza a lista no popup
    const popup = document.getElementById('labels-quick-popup');
    if (popup)
        _renderPriorityList(popup, list);
}
/** Familias excluidas da lista de prioridade (sem labels) */
const _SKIP_PRIORITY = (new Set(['intangible', 'generic', 'boundary', 'blueprint', 'area']));
/**
 * Retorna a lista ordenada de familias do modelo atual,
 * mesclada com a prioridade salva.
 */
function _getModelFamilyOrder() {
    const elements = getAllElements();
    const modelFamilies = (new Set());
    for (const el of elements) {
        if (el.family && !_SKIP_PRIORITY.has(el.family)) {
            modelFamilies.add(el.family);
        }
    }
    // Mescla com prioridade salva: manter ordem salva, adicionar novas ao final
    const saved = getFamilyPriority();
    const ordered = ([]);
    for (const f of saved) {
        if (modelFamilies.has(f)) {
            ordered.push(f);
            modelFamilies.delete(f);
        }
    }
    // Familias novas (nao salvas) ao final
    for (const f of modelFamilies) {
        ordered.push(f);
    }
    return ordered;
}
/**
 * Renderiza a lista de prioridade no popup.
 */
/** @param {Element} popup @param {string[]} list */
function _renderPriorityList(popup: Element, list: string[]) {
    const container = popup.querySelector('#lqp-priority-list');
    if (!container)
        return;
    const disabled = isFamilyDisabled;
    container.innerHTML = list
        .map((familyId: string, i: number) => {
        const safeId = escapeHtml(familyId);
        const safeName = escapeHtml(getFamilyName(familyId) || familyId);
        const isOff = disabled(familyId);
        return `<div class="lqp-priority-row${isOff ? ' lqp-family-off' : ''}">
            <button class="lqp-priority-toggle${isOff ? '' : ' active'}" data-family="${safeId}" aria-label="Toggle ${safeName}">&#9679;</button>
            <div class="lqp-priority-arrows">
                <button class="lqp-priority-arrow" data-family="${safeId}" data-dir="-1" aria-label="Move up">&#9650;</button>
                <button class="lqp-priority-arrow" data-family="${safeId}" data-dir="1" aria-label="Move down">&#9660;</button>
            </div>
            <span class="lqp-priority-rank">${i + 1}.</span>
            <span class="lqp-priority-name">${safeName}</span>
        </div>`;
    })
        .join('');
    // Event delegation
    container.querySelectorAll('.lqp-priority-arrow').forEach((btn: any) => {
        const button = btn as HTMLElement;
        button.onclick = () => handleLabelFamilyPriority(button.dataset.family || '', parseInt(button.dataset.dir || '0'));
    });
    container.querySelectorAll('.lqp-priority-toggle').forEach((btn: any) => {
        const button = btn as HTMLElement;
        button.onclick = () => handleLabelFamilyToggle(button.dataset.family || '');
    });
}
/** @param {boolean} enabled */
function _updateBadgeState(enabled: boolean) {
    const badge = document.getElementById('labels-toggle-badge');
    if (badge)
        badge.classList.toggle('inactive', !enabled);
}
/** @param {Element} popup */
function _syncPopupState(popup: Element) {
    const config = (getLabelConfig());
    const enabled = config.enabled;
    const fontSize = config.categories?.elementNames?.fontSize || 11;
    const density = getMaxVisible();
    const linkDist = getLeaderMinDistance();
    // Sincroniza botoes de tamanho (via data-size attribute)
    popup.querySelectorAll('[data-size]').forEach((b: any) => {
        const button = b as HTMLElement;
        button.classList.toggle('active', parseInt(button.dataset.size || '') === fontSize);
    });
    // Sincroniza botoes de densidade (via data-density attribute)
    const densityMap = [10, 25, 40];
    const closestDensity = densityMap.reduce((prev, curr) => Math.abs(curr - density) < Math.abs(prev - density) ? curr : prev);
    popup.querySelectorAll('[data-density]').forEach((b: any) => {
        const button = b as HTMLElement;
        button.classList.toggle('active', parseInt(button.dataset.density || '') === closestDensity);
    });
    // Sincroniza botoes de distancia minima dos links
    const linkDistMap = [8, 12, 18];
    const closestLinkDist = linkDistMap.reduce((prev, curr) => Math.abs(curr - linkDist) < Math.abs(prev - linkDist) ? curr : prev);
    popup.querySelectorAll('[data-link-dist]').forEach((b: any) => {
        const button = b as HTMLElement;
        button.classList.toggle('active', parseInt(button.dataset.linkDist || '') === closestLinkDist);
    });
    // Renderiza lista de prioridade de familias
    const familyOrder = _getModelFamilyOrder();
    _renderPriorityList(popup, familyOrder);
    // Sincroniza botao show-all
    const showAllBtn = popup.querySelector('.lqp-show-all');
    if (showAllBtn) {
        showAllBtn.classList.toggle('active', getShowAll());
    }
    // Sincroniza botao nudge
    const nudgeBtn = popup.querySelector('.lqp-nudge');
    if (nudgeBtn) {
        nudgeBtn.classList.toggle('active', getNudgeEnabled());
    }
    // Sincroniza botao toggle
    const toggleBtn = popup.querySelector('.lqp-toggle');
    if (toggleBtn) {
        toggleBtn.textContent = enabled ? t('labelOff') || 'Desligar' : t('labelOn') || 'Ligar';
    }
    _updateBadgeState(enabled);
}
/**
 * Restaura densidade, nudge e prioridade salvos no localStorage.
 */
function restoreLabelDensity() {
    _initOverlayPositioning();
    const saved = localStorage.getItem('ecbyts-label-density') || '';
    if (saved) {
        const n = parseInt(saved, 10);
        if (n >= 5 && n <= 100)
            setMaxVisible(n);
    }
    // Restaura distancia minima das leader lines
    const savedLinkDist = localStorage.getItem('ecbyts-label-leader-min-dist') || '';
    if (savedLinkDist) {
        const n = parseInt(savedLinkDist, 10);
        if (n >= 4 && n <= 40)
            setLeaderMinDistance(n);
    }
    // Restaura nudge — HUD-UX-PAIN-DRAIN-001 W4.1 (D04): default LIGADO.
    // O reposicionamento anti-colisão já existia mas era opt-in escondido →
    // labels PM-XX sobrepostos ilegíveis no centro do modelo. '0' desliga
    // explicitamente (perf budget: MAX_NUDGE 15/frame, 3 steps).
    setNudgeEnabled(localStorage.getItem('ecbyts-label-nudge') !== '0');
    // Restaura show-all
    if (localStorage.getItem('ecbyts-label-show-all') === '1') {
        setShowAll(true);
    }
    // Restaura prioridade de familias
    const savedPriority = localStorage.getItem('ecbyts-label-family-priority') || '';
    if (savedPriority) {
        try {
            const parsed = JSON.parse(savedPriority);
            if (Array.isArray(parsed)) {
                setFamilyPriority(parsed.filter((f) => typeof f === 'string' && f.length < 64));
            }
        }
        catch (err: any) {
            log.debug('Invalid label-family-priority JSON ignored', err?.message);
        }
    }
    // Restaura familias desativadas
    const savedDisabled = localStorage.getItem('ecbyts-label-disabled-families') || '';
    if (savedDisabled) {
        try {
            const parsed = JSON.parse(savedDisabled);
            if (Array.isArray(parsed)) {
                for (const f of parsed) {
                    if (typeof f === 'string' && f.length < 64)
                        setFamilyDisabled(f, true);
                }
            }
        }
        catch (err: any) {
            log.debug('Invalid label-disabled-families JSON ignored', err?.message);
        }
    }
    // Sincroniza badge
    _updateBadgeState(isLabelsEnabled());
    _scheduleOverlayPosition();
}
// ----------------------------------------------------------------
// UI HELPERS
// ----------------------------------------------------------------
/** @param {boolean} enabled */
function _updateToggleButton(enabled: boolean) {
    const btn = document.getElementById('toggle-labels-btn');
    if (btn) {
        btn.classList.toggle('active', enabled);
    }
}
// ----------------------------------------------------------------
// EXPORT
// ----------------------------------------------------------------
export { restoreLabelDensity };
export const labelHandlers = {
    handleToggleLabels,
    handleOpenLabelSettings,
    handleCloseLabelSettings,
    handleLabelCategoryToggle,
    handleLabelSettingChange,
    handleToggleElementLabel,
    handleResetLabelSettings,
    handleOpenLabelPopup,
    handleLabelQuickSize,
    handleLabelQuickDensity,
    handleLabelLinkDistance,
    handleLabelQuickToggle,
    handleLabelQuickNudge,
    handleLabelShowAll,
    handleLabelFamilyToggle,
    handleLabelFamilyPriority,
    restoreLabelDensity,
};
//# sourceMappingURL=labels.js.map
//# sourceMappingURL=labels.js.map
//# sourceMappingURL=labels.js.map
//# sourceMappingURL=labels.js.map
