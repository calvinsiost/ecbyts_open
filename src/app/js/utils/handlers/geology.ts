// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   GEOLOGY HANDLERS — Controles de visualizacao geologica
   Popup de configuracao para camadas estratigraficas, VE,
   overlay aereo e presets de vista subsuperficial.
   ================================================================ */
import { getAllElements, getMeshByElementId } from '../../core/elements/manager.js';
import { requestRender } from '../scene/setup.js';
import { safeSetItem } from '../storage/storageMonitor.js';
const STORAGE_KEY = 'ecbyts-geology-settings';
// Estado local do modulo
const _settings = {
    strataVisible: true,
    autoHideTop: true,
    edgeLines: true,
    verticalExaggeration: 3.0,
    overlayOpacity: 0.5,
};
// ----------------------------------------------------------------
// POPUP TOGGLE
// ----------------------------------------------------------------
/**
 * Abre/fecha o popup de configuracao geologica.
 * Posiciona relativo ao botao clicado (mesmo padrao do labels popup).
 * @param {any} event
 */
export function handleOpenGeologyPopup(event: any) {
    const popup = document.getElementById('geology-quick-popup');
    if (!popup)
        return;
    if (!popup.classList.contains('hidden')) {
        popup.classList.add('hidden');
        return;
    }
    // Fecha outros popups abertos (labels, imagery, viz)
    document
        .querySelectorAll('#labels-quick-popup, #imagery-popup, #viz-quick-popup')
        .forEach((p: any) => p.classList.add('hidden'));
    // Posiciona relativo ao botao
    const btn = event?.currentTarget || document.getElementById('geology-toggle-btn');
    if (btn) {
        const rect = btn.getBoundingClientRect();
        popup.style.position = 'fixed';
        popup.style.left = `${rect.left}px`;
        popup.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    }
    // Sincroniza checkboxes com estado
    const cbVisible: any = document.getElementById("geo-strata-visible");
    const cbAutoHide: any = document.getElementById("geo-auto-hide-top");
    const cbEdges: any = document.getElementById("geo-edge-lines");
    if (cbVisible)
        cbVisible.checked = _settings.strataVisible;
    if (cbAutoHide)
        cbAutoHide.checked = _settings.autoHideTop;
    if (cbEdges)
        cbEdges.checked = _settings.edgeLines;
    // Sincroniza botoes ativos de VE
    _syncBtnGroup(popup, 'Exageracao', _settings.verticalExaggeration);
    _syncBtnGroup(popup, 'Overlay', _settings.overlayOpacity);
    // Renderiza lista dinamica de geology layers
    _renderGeologyLayerList();
    popup.classList.remove('hidden');
    // Fecha ao clicar fora
    const close = (e: any) => {
        if (!popup.contains(e.target) && e.target !== btn) {
            popup.classList.add('hidden');
            document.removeEventListener('mousedown', close);
        }
    };
    setTimeout(() => document.addEventListener('mousedown', close), 50);
}
// ----------------------------------------------------------------
// TOGGLE HANDLERS
// ----------------------------------------------------------------
/**
 * Mostra/esconde camadas geologicas (strata).
 * @param {boolean} visible
 */
export function handleGeoStrataToggle(visible: any) {
    _settings.strataVisible = visible;
    _applyStrataVisibility(visible);
    _persist();
}
/**
 * Habilita/desabilita auto-hide dos strata na vista top.
 * @param {boolean} enabled
 */
export function handleGeoAutoHideTop(enabled: any) {
    _settings.autoHideTop = enabled;
    _persist();
}
/**
 * Mostra/esconde edge lines (bordas entre camadas).
 * @param {boolean} visible
 */
export function handleGeoEdgeLines(visible: any) {
    _settings.edgeLines = visible;
    const strata = getAllElements().filter((e: any) => e.family === 'stratum');
    for (const s of strata) {
        const group = getMeshByElementId(s.id);
        if (!group)
            continue;
        group.traverse((obj: any) => {
            if (obj.isLineSegments)
                obj.visible = visible;
        });
    }
    requestRender();
    _persist();
}
// ----------------------------------------------------------------
// VERTICAL EXAGGERATION
// ----------------------------------------------------------------
/**
 * Define exageracao vertical global (uniforme para todo o modelo).
 * @param {number} ve - Fator de exageracao (1, 2, 3, 5)
 */
export async function handleGeoVE(ve: any) {
    _settings.verticalExaggeration = ve;
    try {
        const { changeSetting } = await import('../vizSettings/manager.js' as string);
        changeSetting('verticalExaggeration', ve);
    }
    catch (e: any) {
        console.warn('[Geology] VE change failed:', (e)?.message || e);
    }
    _persist();
}
// ----------------------------------------------------------------
// OVERLAY OPACITY
// ----------------------------------------------------------------
/**
 * Ajusta opacidade do overlay aereo do boundary.
 * @param {number} opacity - 0.0 a 1.0
 */
export function handleGeoOverlay(opacity: any) {
    _settings.overlayOpacity = opacity;
    const boundary = getAllElements().find((e: any) => e.family === 'boundary');
    if (boundary) {
        const mesh = getMeshByElementId(boundary.id);
        if (mesh) {
            mesh.traverse((obj: any) => {
                // Aceita tanto userData.isOverlay (flag explicita) como name='overlay'
                // (padrao do meshFactory que nao seta isOverlay).
                if ((obj.userData?.isOverlay || obj.name === 'overlay') && obj.material) {
                    obj.material.opacity = opacity;
                    obj.material.needsUpdate = true;
                }
            });
        }
    }
    requestRender();
    _persist();
}
// ----------------------------------------------------------------
// PRESETS
// ----------------------------------------------------------------
/**
 * Aplica preset de visualizacao geologica.
 * @param {'surface'|'subsurface'|'cross-section'|'presentation'} preset
 */
export async function handleGeoPreset(preset: any) {
    const presets = {
        surface: { strataVisible: false, autoHideTop: true, ve: 1, overlay: 0.42 },
        subsurface: { strataVisible: true, autoHideTop: true, ve: 5, overlay: 0.24 },
        'cross-section': { strataVisible: true, autoHideTop: false, ve: 3, overlay: 0.18 },
        presentation: { strataVisible: true, autoHideTop: true, ve: 3, overlay: 0.42 },
    };
    const p = (presets as Record<string, any>)[preset];
    if (!p)
        return;
    _settings.strataVisible = p.strataVisible;
    _settings.autoHideTop = p.autoHideTop;
    _settings.verticalExaggeration = p.ve;
    _settings.overlayOpacity = p.overlay;
    _applyStrataVisibility(p.strataVisible);
    handleGeoOverlay(p.overlay);
    await handleGeoVE(p.ve);
    // Aplica vizSettings preset se subsurface
    if (preset === 'subsurface') {
        try {
            const { applyPreset } = await import('../vizSettings/manager.js' as string);
            applyPreset('subsurface');
        }
        catch (e: any) {
            console.debug('[geology] applySubsurfacePreset:', (e)?.message || e);
        }
    }
    _persist();
    // Fecha popup
    document.getElementById('geology-quick-popup')?.classList.add('hidden');
}
// ----------------------------------------------------------------
// AUTO-HIDE TOP - chamado pelo viewRouter quando muda de vista
// ----------------------------------------------------------------
/**
 * Chamado quando a vista muda. Esconde strata automaticamente na vista top
 * se auto-hide estiver habilitado.
 * @param {string} viewName - 'isometric', 'top', 'front', '3d', '2d'
 */
export function onViewChanged(viewName: any) {
    if (!_settings.autoHideTop)
        return;
    if (!_settings.strataVisible)
        return;
    const isTop = viewName === 'top' || viewName === '2d';
    _applyStrataVisibility(!isTop);
}
// ----------------------------------------------------------------
// GEOLOGY LAYERS - lista dinamica no popup
// ----------------------------------------------------------------
/**
 * Popula a lista de geology layers no popup.
 * Chamada cada vez que o popup abre (renderiza em runtime).
 */
function _renderGeologyLayerList() {
    const container = document.getElementById('geo-layer-list');
    if (!container)
        return;
    import('../../core/interpolation/manager.js' as string)
        .then((mod) => {
        const { getAllLayers } = mod;
        const geoLayers = getAllLayers().filter((l: any) => l.type === 'geology');
        if (geoLayers.length === 0) {
            container.innerHTML = '<span style="font-size:10px;color:#666;">Nenhuma camada interpolada</span>';
            return;
        }
        container.innerHTML = geoLayers
            .map((l: any) => `
                <label class="geo-toggle-row" data-layer-id="${l.id}">
                    <input data-field-meta="true" data-field-meta-key="auto-pos:geology:input:L256" type="checkbox" ${l.visible !== false ? 'checked' : ''}
                        data-cc-call-change="handleGeoLayerToggle|s:${encodeURIComponent(`${l.id}`)}|c">
                    <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${l.fixedColor || '#888'};margin-right:4px;"></span>
                    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${l.name?.replace('Geologia: ', '') || l.id}</span>
                </label>`)
            .join('');
    })
        .catch(() => {
        container.innerHTML = '';
    });
}
/**
 * Toggle visibilidade de uma geology layer individual.
 * @param {string} layerId
 * @param {boolean} visible
 */
export function handleGeoLayerToggle(layerId: any, visible: any) {
    import('../../core/interpolation/manager.js' as string)
        .then(({ updateLayer }) => {
        updateLayer(layerId, { visible });
    })
        .catch((_e) => console.debug('[utils/handlers/geology:silent-catch]', _e?.message || _e));
}
/**
 * Toggle contour lines em todas as geology layers.
 * @param {boolean} show
 */
export function handleGeoContoursToggle(show: any) {
    import('../../core/interpolation/manager.js' as string)
        .then((mod) => {
        const { getAllLayers, updateLayer } = mod;
        const geoLayers = getAllLayers().filter((l: any) => l.type === 'geology');
        for (const l of geoLayers) {
            updateLayer(l.id, { showContours: show });
        }
    })
        .catch((_e) => console.debug('[utils/handlers/geology:silent-catch]', _e?.message || _e));
}
// ----------------------------------------------------------------
// INIT - restaura settings do localStorage
// ----------------------------------------------------------------
export function initGeologySettings() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY) || '';
        if (raw) {
            const saved = JSON.parse(raw);
            Object.assign(_settings, saved);
        }
    }
    catch (e: any) {
        console.debug('[geology] init-settings:', (e)?.message || e);
        /* corrupted */
    }
    // Escuta mudanca de vista para auto-hide strata no top
    window.addEventListener('viewChanged', (e) => {
        const mode = (e as any).detail?.mode || '';
        onViewChanged(mode);
    });
}
/**
 * Retorna settings atuais (para modulos externos).
 */
export function getGeologySettings() {
    return { ..._settings };
}
// ----------------------------------------------------------------
// INTERNAL
// ----------------------------------------------------------------
function _applyStrataVisibility(visible: any) {
    const strata = getAllElements().filter((e: any) => e.family === 'stratum');
    for (const s of strata) {
        const group = getMeshByElementId(s.id);
        if (group)
            group.visible = visible;
    }
    requestRender();
}
function _persist() {
    safeSetItem(STORAGE_KEY, JSON.stringify(_settings));
}
function _syncBtnGroup(popup: any, label: any, value: any) {
    const sections = popup.querySelectorAll('.lqp-section');
    for (const sec of sections) {
        const lbl = sec.querySelector('.lqp-label');
        if (!lbl || !lbl.textContent.includes(label))
            continue;
        const btns = sec.querySelectorAll('.lqp-btn');
        btns.forEach((btn: any) => {
            btn.classList.remove('active');
            // Match by text content (e.g., "3x" matches VE 3, "50%" matches overlay 0.5)
            const txt = btn.textContent.trim();
            if (txt === `${value}x` || txt === `${Math.round(value * 100)}%`) {
                btn.classList.add('active');
            }
        });
    }
}
