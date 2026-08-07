// @ts-check
// Generated from src/app/js/utils/ui/cardRenderers.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT. AGPL-3.0-only.
// Extracted from app/js/utils/ui/lists.js in ARCH-MONO-001 Phase 4.
//
// Pure HTML fragment generators for element / interpolation layer /
// voxel volume cards. Zero module state, zero DOM side effects.
import { t } from '../i18n/translations.js';
import { getIcon } from './icons.js';
import { escapeHtml, escapeAttr } from '../helpers/html.js';
import { isEffectivelyVisible } from '../../core/elements/manager.js';
import { hasFamilyModule } from '../../core/elements/familyModuleRegistry.js';
import { INTERPOLATION_METHODS } from '../../core/interpolation/engine.js';
import { GRID_SIZES } from '../../core/interpolation/manager.js';
import { getRampNames } from '../../core/interpolation/colorRamps.js';
import { countByZone, VADOSE, SATURATED } from '../../core/voxel/engine.js';
import { isVoxelEditing } from '../../core/voxel/editController.js';
/**
 * Render a single element card (used in grouped and ungrouped sections).
 * @param {any} element
 * @param {any} families
 * @param {any} selected
 */
export function renderElementCard( element: any, families: any, selected: any) {
    const family = families[element.family];
    const icon = element.iconClass ? '' : getIcon(family?.icon || 'map-pin', { size: '14px' });
    const effectiveVisible = isEffectivelyVisible(element.id);
    const visibilityIcon = element.visible ? getIcon('eye', { size: '14px' }) : getIcon('eye-off', { size: '14px' });
    const opacityClass = effectiveVisible ? '' : 'opacity-50';
    const selectedClass = selected?.id === element.id ? 'selected' : '';
    const iconClass = element.iconClass ? ` ${element.iconClass}` : '';
    const hasModules = hasFamilyModule(element.family);
    const moduleBtn = hasModules
        ? `
                <button class="element-card-modules"
                        data-cc-call-click="handleOpenFamilyModulePicker|s:${encodeURIComponent(`${element.id}`)}|t" data-cc-stop="1"
                        title="${t('subModules') || 'Sub-modules'}">
                    ${getIcon('layers', { size: '13px' })}
                </button>`
        : '';
    return `
        <div class="element-card ${opacityClass} ${selectedClass}" draggable="true"
             data-element-id="${element.id}"
             data-element-family="${escapeAttr(element.family)}"
             data-cc-call-click="handleSelectElement|s:${encodeURIComponent(`${element.id}`)}">
            <div class="element-card-header">
                <span class="element-card-icon${iconClass}">${icon}</span>
                <span class="element-card-name" title="${escapeAttr(element.name)}">${escapeHtml(element.name)}</span>
                ${moduleBtn}
                <button class="element-card-toggle"
                        data-cc-call-click="handleToggleVisibility|s:${encodeURIComponent(`${element.id}`)}" data-cc-stop="1"
                        title="${element.visible ? 'Hide' : 'Show'}">
                    ${visibilityIcon}
                </button>
                <button class="element-card-delete"
                        data-cc-call-click="handleRemoveElement|s:${encodeURIComponent(`${element.id}`)}" data-cc-stop="1"
                        title="Remove">
                    ${getIcon('x', { size: '12px' })}
                </button>
            </div>${
                element.description
                    ? `
            <div class="element-card-desc" title="${escapeHtml(element.description)}">${escapeHtml(element.description)}</div>`
                    : ''
            }
        </div>
    `;
}
/** Layer type → icon mapping */
export const LAYER_ICONS = {
    terrain: 'mountain',
    water_table: 'droplet',
    contamination: 'alert-triangle',
    custom: 'layers',
};
/**
 * Render a single interpolation layer card with inline controls when selected.
 * @param {any} layer
 * @param {any} selectedLayerId
 */
export function renderLayerCard( layer: any, selectedLayerId: any) {
    const icon = getIcon((LAYER_ICONS as any)[layer.type] || 'layers', { size: '14px' });
    const visIcon = layer.visible ? getIcon('eye', { size: '14px' }) : getIcon('eye-off', { size: '14px' });
    const opClass = layer.visible ? '' : 'opacity-50';
    const isSelected = selectedLayerId === layer.id;
    const selClass = isSelected ? 'selected' : '';
    const inlineControls = isSelected ? renderLayerInlineControls(layer) : '';
    return `
        <div class="element-card ${opClass} ${selClass}"
             data-layer-id="${layer.id}"
             data-cc-call-click="handleSelectLayer|s:${encodeURIComponent(`${layer.id}`)}">
            <div class="element-card-header">
                <span class="element-card-icon">${icon}</span>
                <span class="element-card-name">${escapeHtml(layer.name)}</span>
                <button class="element-card-toggle"
                        data-cc-call-click="handleToggleLayerVisibility|s:${encodeURIComponent(`${layer.id}`)}" data-cc-stop="1"
                        title="${layer.visible ? 'Hide' : 'Show'}">
                    ${visIcon}
                </button>
                <button class="element-card-delete"
                        data-cc-call-click="handleRemoveInterpolationLayer|s:${encodeURIComponent(`${layer.id}`)}" data-cc-stop="1"
                        title="Remove">
                    ${getIcon('x', { size: '12px' })}
                </button>
            </div>
            ${inlineControls}
        </div>
    `;
}
/**
 * Render inline controls for a selected interpolation layer.
 * @param {any} layer
 */
export function renderLayerInlineControls( layer: any) {
    // Method dropdown
    const methodOptions = Object.values(INTERPOLATION_METHODS)
        .map((m: any) => `<option value="${m.id}" ${layer.method === m.id ? 'selected' : ''}>${m.name}</option>`)
        .join('');
    // Grid size dropdown
    const gridOptions = GRID_SIZES.map(
        (g: any) =>
            `<option value="${g.cols}" ${layer.gridSize?.cols === g.cols ? 'selected' : ''}>${g.label}</option>`,
    ).join('');
    // Color ramp dropdown
    const rampNames = getRampNames();
    const rampOptions = rampNames
        .map((name: any) => `<option value="${name}" ${layer.colorRamp === name ? 'selected' : ''}>${name}</option>`)
        .join('');
    // Stats
    const stats = layer.stats
        ? `<div class="layer-inline-stats">Min: ${layer.stats.min.toFixed(1)} | Max: ${layer.stats.max.toFixed(1)} | Avg: ${layer.stats.mean.toFixed(1)}</div>`
        : '';
    const contourControls = ['water_table', 'terrain', 'contamination'].includes(layer.type)
        ? `
            <div class="layer-control-row">
                <label>${layer.type === 'contamination' ? 'Isolines' : 'Contours'}</label>
                <input data-field-meta="true" data-field-meta-key="auto-pos:cardRenderers:input:L134" type="checkbox"
                       ${layer.showContours ? 'checked' : ''}
                       data-cc-call-change="handleToggleInterpolationContours|s:${encodeURIComponent(`${layer.id}`)}">
            </div>
            <div class="layer-control-row">
                <label>Contour Density</label>
                <select data-field-meta="true" data-field-meta-key="auto-pos:cardRenderers:select:L140" data-cc-call-change="handleChangeInterpolationContourDensity|s:${encodeURIComponent(`${layer.id}`)}|v">
                    <option value="low" ${layer.contourDensity === 'low' ? 'selected' : ''}>Low</option>
                    <option value="medium" ${layer.contourDensity !== 'low' && layer.contourDensity !== 'high' ? 'selected' : ''}>Medium</option>
                    <option value="high" ${layer.contourDensity === 'high' ? 'selected' : ''}>High</option>
                </select>
            </div>
            <div class="layer-control-row">
                <label>${layer.type === 'water_table' ? 'Contour Labels' : 'Line Labels'}</label>
                <input data-field-meta="true" data-field-meta-key="auto-pos:cardRenderers:input:L148" type="checkbox"
                       ${layer.showContourLabels ? 'checked' : ''}
                       data-cc-call-change="handleToggleInterpolationContourLabels|s:${encodeURIComponent(`${layer.id}`)}">
            </div>
    `
        : '';
    return `
        <div class="layer-inline-controls" data-cc-call-click="__noop" data-cc-stop="1">
            <div class="layer-control-row">
                <label>${t('interpolationMethod') || 'Method'}</label>
                <select data-field-meta="true" data-field-meta-key="auto-pos:cardRenderers:select:L159" data-cc-call-change="handleChangeInterpolationMethodAndRefresh|s:${encodeURIComponent(`${layer.id}`)}|v">
                    ${methodOptions}
                </select>
            </div>
            <div class="layer-control-row">
                <label>${t('interpolationGridSize') || 'Grid'}</label>
                <select data-field-meta="true" data-field-meta-key="auto-pos:cardRenderers:select:L165" data-cc-call-change="handleChangeInterpolationGridSize|s:${encodeURIComponent(`${layer.id}`)}|v">
                    ${gridOptions}
                </select>
            </div>
            <div class="layer-control-row">
                <label>${t('interpolationColorRamp') || 'Palette'}</label>
                <select data-field-meta="true" data-field-meta-key="auto-pos:cardRenderers:select:L171" data-cc-call-change="handleChangeInterpolationColorRamp|s:${encodeURIComponent(`${layer.id}`)}|v">
                    ${rampOptions}
                </select>
            </div>
            <div class="layer-control-row">
                <label>${t('interpolationOpacity') || 'Opacity'}</label>
                <input data-field-meta="true" data-field-meta-key="auto-pos:cardRenderers:input:L177" type="range" min="0" max="1" step="0.05"
                       value="${layer.opacity ?? 0.85}"
                       data-cc-call-input="handleChangeInterpolationOpacity|s:${encodeURIComponent(`${layer.id}`)}|v">
            </div>
            <div class="layer-control-row">
                <button class="btn btn-sm ${layer.wireframe ? 'active' : ''}"
                        data-cc-call-click="handleToggleWireframe|s:${encodeURIComponent(`${layer.id}`)}">
                    ${getIcon('grid', { size: '12px' })} Wireframe
                </button>
                <button class="btn btn-sm"
                        data-cc-call-click="handleRefreshInterpolationLayer|s:${encodeURIComponent(`${layer.id}`)}">
                    ${getIcon('refresh-cw', { size: '12px' })} Refresh
                </button>
            </div>
            ${contourControls}
            ${stats}
        </div>
    `;
}
/**
 * Render a single voxel volume card with inline controls when selected.
 * @param {any} volume
 * @param {any} selectedVolumeId
 */
export function renderVolumeCard( volume: any, selectedVolumeId: any) {
    const icon = getIcon('box', { size: '14px' });
    const visIcon = volume.visible ? getIcon('eye', { size: '14px' }) : getIcon('eye-off', { size: '14px' });
    const opClass = volume.visible ? '' : 'opacity-50';
    const isSelected = selectedVolumeId === volume.id;
    const selClass = isSelected ? 'selected' : '';
    const modeBadge = volume.mode === 'voxels' ? 'Voxels' : 'Solid';
    let zoneInfo = '';
    if (volume.grid && volume.dims) {
        const vadoseN = countByZone(volume.grid, VADOSE);
        const saturatedN = countByZone(volume.grid, SATURATED);
        zoneInfo = `<span class="volume-card-zones">${(vadoseN + saturatedN).toLocaleString()}</span>`;
    }
    const inlineControls = isSelected ? renderVolumeInlineControls(volume) : '';
    return `
        <div class="element-card ${opClass} ${selClass}"
             data-volume-id="${volume.id}"
             data-cc-call-click="handleSelectVolume|s:${encodeURIComponent(`${volume.id}`)}">
            <div class="element-card-header">
                <span class="element-card-icon">${icon}</span>
                <span class="element-card-name">${escapeHtml(volume.name)}</span>
                <span class="volume-mode-badge">${modeBadge}</span>
                ${zoneInfo}
                <button class="element-card-toggle"
                        data-cc-call-click="handleToggleVoxelVisible|s:${encodeURIComponent(`${volume.id}`)}" data-cc-stop="1"
                        title="${volume.visible ? 'Hide' : 'Show'}">
                    ${visIcon}
                </button>
                <button class="element-card-delete"
                        data-cc-call-click="handleRemoveVoxelVolume|s:${encodeURIComponent(`${volume.id}`)}" data-cc-stop="1"
                        title="Remove">
                    ${getIcon('x', { size: '12px' })}
                </button>
            </div>
            ${inlineControls}
        </div>
    `;
}
/**
 * Render inline controls for a selected voxel volume.
 * @param {any} volume
 */
export function renderVolumeInlineControls( volume: any) {
    const editing = isVoxelEditing();
    const modeOptions = ['solid', 'voxels']
        .map((m: any) => `<button class="volume-mode-btn ${volume.mode === m ? 'active' : ''}"
                 data-cc-call-click="handleSetVolumeMode|s:${encodeURIComponent(`${volume.id}`)}|s:${encodeURIComponent(`${m}`)}" data-cc-stop="1">
            ${m === 'solid' ? t('voxelSolid') || 'Solid' : t('voxelExploded') || 'Voxels'}
        </button>`,
        )
        .join('');
    return `
        <div class="volume-inline-controls" data-cc-call-click="__noop" data-cc-stop="1">
            <div class="volume-control-row">
                <label>Mode</label>
                <div class="volume-mode-group">${modeOptions}</div>
            </div>
            <div class="volume-control-row">
                <label>${t('voxelResolution') || 'Res'}</label>
                <input data-field-meta="true" data-field-meta-key="auto-pos:cardRenderers:input:L261" type="range" min="1" max="10" step="1" value="${volume.resolution}"
                       data-cc-call-change="handleSetVoxelResolutionForVolume|s:${encodeURIComponent(`${volume.id}`)}|v">
                <span class="volume-res-label">${volume.resolution}m</span>
            </div>
            <div class="volume-control-row">
                <label>${t('voxelOpacity') || 'Op'}</label>
                <input data-field-meta="true" data-field-meta-key="auto-pos:cardRenderers:input:L267" type="range" min="0" max="100" step="5"
                       value="${Math.round((volume.opacity || 0.6) * 100)}"
                       data-cc-call-input="handleSetVolumeOpacityById|s:${encodeURIComponent(`${volume.id}`)}|v">
            </div>
            <div class="volume-control-row">
                <button class="btn btn-sm" data-cc-action="cc-becc7e89">
                    ${getIcon('refresh-cw', { size: '12px' })} ${t('recomputeVoxels') || 'Recompute'}
                </button>
                <button class="btn btn-sm ${editing ? 'active' : ''}"
                        data-cc-call-click="${editing ? 'handleExitVoxelEdit' : `handleEnterVoxelEdit|s:${encodeURIComponent(`${volume.id}`)}`}">
                    ${getIcon('edit', { size: '12px' })} ${editing ? 'Exit Edit' : t('editVoxels') || 'Edit Voxels'}
                </button>
            </div>
        </div>
    `;
}
