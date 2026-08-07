// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// @ts-check
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   IMAGERY HANDLER — Badge de troca de imagem aerea/satelite
   ================================================================

   Controle flutuante no viewport 3D para trocar o provedor de tiles
   (Sentinel-2, OpenStreetMap) ou enviar imagem personalizada.
   Aplica-se ao overlay do boundary E a terrain layers.

   Padrao identico ao labels badge (#labels-toggle-badge).

   ================================================================ */
import { t } from '../i18n/translations.js';
import { createLogger } from '../helpers/logger.js';
import { lazyImport } from '../helpers/lazyImport.js';
const log = createLogger('Imagery');
// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------
let _currentProvider = _readStoredProvider();
let _customImageUrl: any = null;
let _customKeyActive = false;
let _customSectionOpen = false;
let _popupCloseHandler: any = null;
let _isApplying = false;
let _pendingCustomProvider = 'mapbox';
let _pendingCustomKey = '';
/** Fonte selecionada para geração de terreno: 'auto' (web) ou 'manual' */
let _terrainSource = 'auto';
// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
function _readStoredProvider() {
    try {
        const stored = localStorage.getItem('ecbyts-tile-provider') || '';
        if (stored != null) {
            const idx = parseInt(stored, 10);
            return Number.isFinite(idx) && idx >= 0 ? idx : 0;
        }
    }
    catch (e: any) {
        console.debug('[imagery] readStoredProvider:', (e)?.message || e);
        /* noop */
    }
    return 0;
}
function _readStoredKey() {
    try {
        return localStorage.getItem('ecbyts-mapbox-key') || '';
    }
    catch (e: any) {
        console.debug('[imagery] readStoredKey:', (e)?.message || e);
        return '';
    }
}
function _readStoredCustomKey(providerName: any) {
    try {
        return localStorage.getItem(`ecbyts-imagery-key-${providerName}`) || '';
    }
    catch (e: any) {
        console.debug('[imagery] readStoredCustomKey:', (e)?.message || e);
        return '';
    }
}
function _readStoredOutputSize() {
    try {
        const v = parseInt(localStorage.getItem('ecbyts-imagery-output-size') || '', 10);
        return [256, 512, 1024].includes(v) ? v : 512;
    }
    catch (e: any) {
        console.debug('[imagery] readStoredOutputSize:', (e)?.message || e);
        return 512;
    }
}
async function _saveOutputSize(size: any) {
    try {
        const { safeSetItem } = await import('../storage/storageMonitor.js' as string);
        safeSetItem('ecbyts-imagery-output-size', String(size));
    }
    catch (e: any) {
        console.debug('[imagery] saveOutputSize safeSet failed, fallback to raw:', (e)?.message || e);
        try {
            localStorage.setItem('ecbyts-imagery-output-size', String(size));
        }
        catch (e2: any) {
            console.debug('[imagery] saveOutputSize raw setItem failed:', (e2)?.message || e2);
            /* noop */
        }
    }
}
async function _saveProvider(idx: any) {
    try {
        const { safeSetItem } = await import('../storage/storageMonitor.js' as string);
        safeSetItem('ecbyts-tile-provider', String(idx));
    }
    catch (e: any) {
        console.debug('[imagery] saveProvider safeSet failed, fallback to raw:', (e)?.message || e);
        try {
            localStorage.setItem('ecbyts-tile-provider', String(idx));
        }
        catch (e2: any) {
            console.debug('[imagery] saveProvider raw setItem failed:', (e2)?.message || e2);
            /* noop */
        }
    }
}
async function _saveCustomKey(providerName: any,key: any) {
    try {
        const { safeSetItem } = await import('../storage/storageMonitor.js' as string);
        safeSetItem(`ecbyts-imagery-key-${providerName}`, key);
    }
    catch (e: any) {
        console.debug('[imagery] saveCustomKey safeSet failed, fallback to raw:', (e)?.message || e);
        try {
            localStorage.setItem(`ecbyts-imagery-key-${providerName}`, key);
        }
        catch (e2: any) {
            console.debug('[imagery] saveCustomKey raw setItem failed:', (e2)?.message || e2);
            /* noop */
        }
    }
}
async function _saveKey(key: any) {
    try {
        const { safeSetItem } = await import('../storage/storageMonitor.js' as string);
        safeSetItem('ecbyts-mapbox-key', key);
    }
    catch (e: any) {
        console.debug('[imagery] saveKey safeSet failed, fallback to raw:', (e)?.message || e);
        try {
            localStorage.setItem('ecbyts-mapbox-key', key);
        }
        catch (e2: any) {
            console.debug('[imagery] saveKey raw setItem failed:', (e2)?.message || e2);
            /* noop */
        }
    }
}
// ----------------------------------------------------------------
// IDB IMAGE CACHE - evita re-fetch de tiles no mesmo bbox/provider
// ----------------------------------------------------------------
/** Gera cache key para IDB baseado no provider + bbox arredondado */
function _idbCacheKey(providerIdx: any,sw: any,ne: any,size: any) {
    return `ecbyts-imagery-${providerIdx}-${sw.latitude.toFixed(4)}_${sw.longitude.toFixed(4)}_${ne.latitude.toFixed(4)}_${ne.longitude.toFixed(4)}_${size}`;
}
function _normalizeImageryResult(entry: any) {
    if (typeof entry === 'string') {
        return entry
            ? {
                overlayUrl: entry,
                overlayFallbackUrls: [],
            }
            : {
                overlayUrl: '',
                overlayFallbackUrls: [],
            };
    }
    if (!entry || typeof entry !== 'object') {
        return {
            overlayUrl: '',
            overlayFallbackUrls: [],
        };
    }
    return {
        overlayUrl: typeof entry.overlayUrl === 'string' ? entry.overlayUrl : '',
        overlayFallbackUrls: Array.isArray(entry.overlayFallbackUrls)
            ? entry.overlayFallbackUrls.filter((url: any) => typeof url === 'string' && url.trim())
            : [],
    };
}
/**
 * Busca imagem do IDB cache ou faz stitch remoto e salva no IDB.
 * @param {number} providerIdx - indice do provider
 * @param {Object} sw - southwest WGS84
 * @param {Object} ne - northeast WGS84
 * @param {number} imgSize - tamanho de saida
 * @param {boolean} [forceRefresh=false] - ignora cache e refaz fetch
 * @returns {Promise<{ overlayUrl: string, overlayFallbackUrls: string[] }>}
 */
async function _fetchOrCacheImagery(providerIdx: any,sw: any,ne: any,imgSize: any,forceRefresh = false) {
    const { idbGet, idbSet } = await import('../storage/idbStore.js' as string);
    const cacheKey = _idbCacheKey(providerIdx, sw, ne, imgSize);
    // Tenta IDB cache primeiro (se nao e refresh)
    if (!forceRefresh) {
        const cached = await idbGet(cacheKey);
        if (cached) {
            console.info(`[Imagery] IDB cache hit: ${cacheKey.substring(0, 40)}...`);
            return _normalizeImageryResult(cached);
        }
    }
    // Fetch remoto com cadeia completa de fallback.
    // Isso evita que a UI morra quando o provider selecionado falha
    // (ex: DNS/CORS do provider livre), preservando overlay e textura do terrain.
    const { buildOverlayUrlsFromBbox } = await import('../../core/io/geo/overlayUrls.js' as string);
    const imageryResult = _normalizeImageryResult(await buildOverlayUrlsFromBbox(sw, ne, imgSize, providerIdx));
    // Salva no IDB para proxima vez
    if (imageryResult.overlayUrl) {
        await idbSet(cacheKey, imageryResult);
        _idbCacheKeys.add(cacheKey);
    }
    return imageryResult;
}
/** Rastreia cache keys para limpeza seletiva */
const _idbCacheKeys = new Set();
/**
 * Limpa cache IDB de imagery para o provider atual.
 */
async function _clearImageryCache() {
    const { idbDelete } = await import('../storage/idbStore.js' as string);
    for (const key of _idbCacheKeys) {
        await idbDelete(key);
    }
    _idbCacheKeys.clear();
}
// ----------------------------------------------------------------
// POPUP
// ----------------------------------------------------------------
/**
 * Abre/fecha o popup de selecao de imagery provider.
 * Padrao identico ao handleOpenLabelPopup em labels.js.
 */
function handleOpenImageryPopup(e: any) {
    e?.stopPropagation();
    const popup = document.getElementById('imagery-quick-popup');
    if (!popup)
        return;
    const isOpen = !popup.classList.contains('hidden');
    if (isOpen) {
        _closePopup();
        return;
    }
    _renderPopup(popup);
    popup.classList.remove('hidden');
    // Click-outside fecha (setTimeout evita auto-close imediato)
    _popupCloseHandler = (ev: any) => {
        if (!popup.contains(ev.target) && ev.target.id !== 'imagery-toggle-badge') {
            _closePopup();
        }
    };
    setTimeout(() => document.addEventListener('pointerdown', _popupCloseHandler), 0);
}
function _closePopup() {
    const popup = document.getElementById('imagery-quick-popup');
    if (popup)
        popup.classList.add('hidden');
    if (_popupCloseHandler) {
        document.removeEventListener('pointerdown', _popupCloseHandler);
        _popupCloseHandler = null;
    }
}
async function _renderPopup(popup: any) {
    // REF-SWEEPS RF-2: _renderPopup e chamado fire-and-forget (toggle do badge e
    // handleToggleImageryCustomSection) — os import() crus aqui viravam
    // 'Uncaught (in promise)' com o chunk fora do ar. tileStitcher e ESSENCIAL para
    // montar a lista de provedores: sem ele o popup nao tem conteudo util, entao
    // renderizamos um aviso em vez de abrir um popup vazio/estagnado.
    const _tiles = await lazyImport('../../core/io/geo/tileStitcher.js', { importer: () => import('../../core/io/geo/tileStitcher.js' as string) });
    if (!_tiles) {
        popup.innerHTML = `<div class="iqp-section"><span class="iqp-label">${t('imageryUnavailable') || 'Imagem de satelite indisponivel (dependencia offline)'}</span></div>`;
        return;
    }
    const { TILE_PROVIDERS } = _tiles;
    const header = t('imagerySettings') || 'Imagem de Satelite';
    const uploadLabel = t('imageryUpload') || 'Enviar Imagem';
    const customLabel = t('imageryCustom') || 'Imagem Personalizada';
    const customProvLabel = t('imageryCustomProvider') || 'Provedor com Chave';
    const apiKeyLabel = t('imageryApiKey') || 'Chave API';
    const applyLabel = t('imageryApplyKey') || 'Aplicar';
    // Badge CSS class por tipo de licença
    function _licenseBadgeClass(license: any) {
        if (!license)
            return 'iqp-badge-neutral';
        const l = license.toLowerCase();
        if (l.includes('public domain') || l.startsWith('cc by 4'))
            return 'iqp-badge-green';
        if (l.includes('odbl') || l.includes('cc by'))
            return 'iqp-badge-green';
        return 'iqp-badge-yellow';
    }
    let html = `<div class="iqp-section"><span class="iqp-label">${header}</span></div>`;
    // Providers gratuitos (sem chave)
    TILE_PROVIDERS.filter((p: any) => !p.requiresKey).forEach((p: any, _i: any) => {
        // Índice real no array completo para handleSelectImageryProvider
        const idx = TILE_PROVIDERS.indexOf(p);
        const active = !_customImageUrl && !_customKeyActive && _currentProvider === idx;
        const circle = active ? '&#9679;' : '&#9675;';
        const refreshBtn = active
            ? ` <button class="iqp-refresh-btn" data-cc-call-click="handleRefreshImagery" data-cc-stop="1" title="Refresh">&#8635;</button>`
            : '';
        const licBadge = p.license
            ? `<span class="iqp-license-badge ${_licenseBadgeClass(p.license)}">${p.license}</span>`
            : '';
        const resBadge = p.resolution ? `<span class="iqp-res-badge">${p.resolution}</span>` : '';
        html += `<div class="iqp-provider${active ? ' active' : ''}"
                      data-cc-call-click="handleSelectImageryProvider|j:${encodeURIComponent(String(idx))}"
                      role="menuitemradio" aria-checked="${active}">
                    <span class="iqp-radio">${circle}</span>
                    <span class="iqp-provider-name">${p.name}</span>
                    ${licBadge}${resBadge}${refreshBtn}
                 </div>`;
    });
    // Custom image ativo
    if (_customImageUrl) {
        html += `<div class="iqp-provider active" role="menuitemradio" aria-checked="true">
                    <span class="iqp-radio">&#9679;</span>
                    <span>${customLabel}</span>
                 </div>`;
    }
    // Custom key provider ativo
    if (_customKeyActive) {
        html += `<div class="iqp-provider active" role="menuitemradio" aria-checked="true">
                    <span class="iqp-radio">&#9679;</span>
                    <span>Mapbox Satellite</span>
                 </div>`;
    }
    html += '<div class="iqp-divider"></div>';
    // Secao colapsavel: Provedor com Chave
    const arrow = _customSectionOpen ? '&#9662;' : '&#9656;';
    const savedMapboxKey = _readStoredKey();
    const _savedStadiaKey = _readStoredCustomKey('stadia');
    html += `<div class="iqp-disclosure" data-cc-action="cc-54afc682">
                <span class="iqp-disclosure-arrow">${arrow}</span>
                <span>${customProvLabel}</span>
             </div>`;
    html += `<div class="iqp-custom-section${_customSectionOpen ? '' : ' collapsed'}">
                <select data-field-meta="true" data-field-meta-key="auto:iqp-custom-provider-select" class="iqp-provider-select" id="iqp-custom-provider-select"
                        data-cc-change="cc-8d98e461">
                    <option value="mapbox">Mapbox Satellite (zoom 22)</option>
                    <option value="stadia">Stadia Maps Satellite (zoom 20)</option>
                </select>
                <input data-field-meta="true" data-field-meta-key="auto:iqp-api-key-input" type="text" class="iqp-key-input" id="iqp-api-key-input"
                       placeholder="${apiKeyLabel}" value="${savedMapboxKey}"
                       spellcheck="false" autocomplete="off">
                <button class="iqp-apply-btn" data-cc-action="cc-e690c910">
                    ${applyLabel}
                </button>
             </div>`;
    html += '<div class="iqp-divider"></div>';
    // Upload custom
    html += `<label class="iqp-upload-btn" role="button" tabindex="0">
                <span class="icon" data-icon="upload" data-icon-size="12px"></span>
                ${uploadLabel}
                <input type="file" accept="image/*"
                       data-cc-change="cc-41a6654c"
                       style="display:none;">
             </label>`;
    // ── Terreno ──────────────────────────────────────────────
    // Secao OPCIONAL: sem o chunk, o popup segue sem a linha de terreno.
    const _interp = await lazyImport('../../core/interpolation/manager.js', { importer: () => import('../../core/interpolation/manager.js' as string) });
    const terrain = (_interp?.getAllLayers?.().find((l: any) => l.type === 'terrain') || null);
    // Sincroniza _terrainSource com o terreno existente ao abrir pela primeira vez
    if (terrain && _terrainSource === 'auto' && terrain.dataSource === 'manual') {
        _terrainSource = 'manual';
    }
    const gridCols = terrain?.gridSize?.cols || 64;
    const tLabel = t('imageryTerrain') || 'Terreno';
    const isManual = _terrainSource === 'manual';
    const btnLabel = terrain
        ? t('imageryRegenerateTerrain') || 'Re-gerar'
        : isManual
            ? t('imageryOpenPanel') || 'Abrir Painel'
            : t('imageryGenerateTerrain') || 'Gerar Terreno';
    html += '<div class="iqp-divider"></div>';
    html += `<div class="iqp-section"><span class="iqp-label">${tLabel}</span></div>`;
    // Seletor de fonte: Web / Manual
    html += `<div class="iqp-terrain-source">
                <button class="iqp-tsrc${!isManual ? ' active' : ''}" data-cc-action="cc-496a9629">Web</button>
                <button class="iqp-tsrc${isManual ? ' active' : ''}" data-cc-action="cc-31f2ba9c">Manual</button>
             </div>`;
    // Grade + botão principal
    html += `<div class="iqp-terrain-row">
                <select data-field-meta="true" data-field-meta-key="auto:iqp-terrain-grid-select" class="iqp-terrain-grid" id="iqp-terrain-grid-select">
                    <option value="32"${gridCols === 32 ? ' selected' : ''}>32&times;32</option>
                    <option value="64"${gridCols === 64 ? ' selected' : ''}>64&times;64</option>
                    <option value="128"${gridCols === 128 ? ' selected' : ''}>128&times;128</option>
                    <option value="256"${gridCols === 256 ? ' selected' : ''}>256&times;256</option>
                </select>
                <button class="iqp-terrain-btn" data-cc-action="cc-bce5a1d2">${btnLabel}</button>
             </div>`;
    if (terrain) {
        // Status: fonte, pontos e elevação mín/máx
        const srcLabel = terrain.dataSource === 'manual' ? 'Manual' : 'Web';
        const pts = terrain.sourcePoints?.length || 0;
        const elev = terrain.stats ? `${terrain.stats.min.toFixed(1)}m / ${terrain.stats.max.toFixed(1)}m` : '—';
        html += `<div class="iqp-terrain-status">${srcLabel} &middot; ${pts} pts &middot; ${elev}</div>`;
        // Controles rápidos
        const visOn = terrain.visible !== false;
        const ctrOn = !!terrain.showContours;
        const lblOn = !!terrain.showContourLabels;
        const dens = terrain.contourDensity || 'medium';
        html += `<div class="iqp-terrain-ctrl">
                    <button class="iqp-tctl${visOn ? ' on' : ''}" title="${visOn ? 'Ocultar' : 'Mostrar'}" data-cc-call-click="handleToggleTerrainVisibilityFromImagery|s:${encodeURIComponent(`${terrain.id}`)}">${visOn ? '&#9679;' : '&#9675;'} Vis.</button>
                    <button class="iqp-tctl${ctrOn ? ' on' : ''}" title="${t('imagery.contourLines')}" data-cc-call-click="handleToggleTerrainContoursFromImagery|s:${encodeURIComponent(`${terrain.id}`)}">Curvas</button>
                    ${ctrOn
            ? `<select data-field-meta="true" data-field-meta-key="auto-pos:imagery:select:L385" class="iqp-terrain-density" data-cc-call-change="handleTerrainContourDensityFromImagery|s:${encodeURIComponent(`${terrain.id}`)}|v">
                        <option value="low"${dens === 'low' ? ' selected' : ''}>baixa</option>
                        <option value="medium"${dens !== 'low' && dens !== 'high' ? ' selected' : ''}>m&#233;dia</option>
                        <option value="high"${dens === 'high' ? ' selected' : ''}>alta</option>
                    </select>
                    <button class="iqp-tctl${lblOn ? ' on' : ''}" title="${t('imagery.labels')}" data-cc-call-click="handleToggleTerrainContourLabelsFromImagery|s:${encodeURIComponent(`${terrain.id}`)}">AB</button>`
            : ''}
                 </div>`;
        // Controles de imagem: toggle satellite + opacity
        const satOn = terrain.textureMode === 'satellite';
        const tOpacity = terrain.opacity ?? 0.85;
        html += `<div class="iqp-terrain-ctrl">
                    <button class="iqp-tctl${satOn ? ' on' : ''}" title="${satOn ? 'Desativar sat&#233;lite' : 'Ativar sat&#233;lite'}" data-cc-call-click="handleToggleTerrainSatelliteFromImagery|s:${encodeURIComponent(`${terrain.id}`)}">${satOn ? '&#9679;' : '&#9675;'} Sat.</button>
                    <label class="iqp-opacity-label" title="Opacidade do terreno texturizado">
                        Terreno ${Math.round(tOpacity * 100)}%
                        <input data-field-meta="true" data-field-meta-key="auto-pos:imagery:input:L401" type="range" class="iqp-opacity-slider" min="0" max="1" step="0.05"
                               value="${tOpacity}"
                               data-cc-call-input="handleTerrainOpacityFromImagery|s:${encodeURIComponent(`${terrain.id}`)}|v">
                    </label>
                 </div>`;
        // Footer: configurações completas + remover
        html += `<div class="iqp-terrain-footer">
                    <button class="iqp-terrain-link" data-cc-action="cc-b566c3e8">&#8599; Config.</button>
                    <button class="iqp-terrain-remove" data-cc-call-click="handleRemoveTerrainFromImagery|s:${encodeURIComponent(`${terrain.id}`)}">&#215; Remover</button>
                 </div>`;
    }
    // ── Overlay Boundary ─────────────────────────────────────
    // Secao OPCIONAL: sem o chunk, o popup segue sem a lista de overlays.
    // getMeshByElementId so e usado dentro do loop abaixo, que nao roda com [].
    const _elems = await lazyImport('../../core/elements/manager.js', { importer: () => import('../../core/elements/manager.js' as string) });
    const getMeshByElementId = _elems?.getMeshByElementId;
    const boundaries = (_elems?.getAllElements?.() || []).filter((e: any) => e.family === 'boundary' && e.data?.overlayUrl);
    if (boundaries.length > 0) {
        const ovLabel = t('imageryOverlay') || 'Overlay Boundary';
        html += '<div class="iqp-divider"></div>';
        html += `<div class="iqp-section"><span class="iqp-label">${ovLabel}</span></div>`;
        for (const b of boundaries) {
            const mesh = getMeshByElementId(b.id);
            const overlay = mesh?.getObjectByName('overlay');
            const ovVis = overlay ? overlay.visible : true;
            const ovOp = overlay?.material?.opacity ?? b.data.overlayOpacity ?? 0.85;
            const bName = b.name || b.id.slice(0, 8);
            html += `<div class="iqp-terrain-ctrl">
                        <button class="iqp-tctl${ovVis ? ' on' : ''}" title="${ovVis ? 'Ocultar overlay' : 'Mostrar overlay'}" data-cc-call-click="handleToggleBoundaryOverlayFromImagery|s:${encodeURIComponent(`${b.id}`)}">${ovVis ? '&#9679;' : '&#9675;'} ${bName}</button>
                        <label class="iqp-opacity-label" title="Opacidade do overlay da imagem a&#233;rea">
                            Overlay ${Math.round(ovOp * 100)}%
                            <input data-field-meta="true" data-field-meta-key="auto-pos:imagery:input:L430" type="range" class="iqp-opacity-slider" min="0" max="1" step="0.05"
                                   value="${ovOp.toFixed(2)}"
                                   data-cc-call-input="handleBoundaryOverlayOpacityFromImagery|s:${encodeURIComponent(`${b.id}`)}|v">
                        </label>
                     </div>`;
        }
    }
    // ── Camadas Vetoriais ─────────────────────────────────────
    // Secao OPCIONAL: sem o chunk, o popup segue sem as camadas vetoriais.
    const _vec = await lazyImport('../../core/io/geo/vectorLayerOverlay.js', { importer: () => import('../../core/io/geo/vectorLayerOverlay.js' as string) });
    const vlLayers = _vec?.getVectorLayersList?.() || [];
    if (vlLayers.length > 0) {
        const vlLabel = t('vectorLayers') || 'Camadas Vetoriais';
        html += '<div class="iqp-divider"></div>';
        html += `<div class="iqp-section"><span class="iqp-label">${vlLabel}</span></div>`;
        for (const vl of vlLayers) {
            const style = vl.style || {};
            const color = style.stroke || '#0066cc';
            const dot = vl.visible ? '&#9679;' : '&#9675;';
            const cls = vl.visible ? ' on' : '';
            const srcBadge = vl.source === 'api' ? '<span class="iqp-vl-badge">API</span>' : '';
            html += `<div class="iqp-vl-row${cls}" data-cc-call-click="handleToggleVectorLayerVisibility|s:${encodeURIComponent(`${vl.id}`)}">
                        <span class="iqp-vl-swatch" style="background:${color}"></span>
                        <span class="iqp-vl-name">${vl.name}</span>
                        ${srcBadge}
                        <span class="iqp-vl-check">${dot}</span>
                     </div>`;
        }
    }
    // Rodapé: botão de configuração completa
    const configureLabel = t('imageryConfigureBtn') || 'Configurar';
    html += `<div class="iqp-divider"></div>
             <div class="iqp-footer">
                 <button class="iqp-settings-btn" data-cc-call-click="handleOpenImagerySettings" data-cc-stop="1">
                     &#9656; ${configureLabel}
                 </button>
             </div>`;
    popup.innerHTML = html;
}
// ----------------------------------------------------------------
// IMAGERY SETTINGS MODAL
// ----------------------------------------------------------------
/**
 * Abre o modal de configurações completas de imagery.
 */
async function handleOpenImagerySettings() {
    _closePopup();
    const modal: any = document.getElementById('imagery-settings-modal');
    if (!modal)
        return;
    await _renderImageryModal(modal);
    modal.classList.add('active');
}
/**
 * Fecha o modal de configurações de imagery.
 */
function handleCloseImagerySettings() {
    const modal: any = document.getElementById('imagery-settings-modal');
    if (modal)
        modal.classList.remove('active');
}
/**
 * Atualiza o input de chave API ao trocar o provider no dropdown do popup.
 * @param {string} providerKey - 'mapbox' ou 'stadia'
 */
function handleImageryCustomProviderChange(providerKey: any) {
    const input: any = (document.getElementById('iqp-api-key-input'));
    if (!input)
        return;
    input.value = providerKey === 'stadia' ? _readStoredCustomKey('stadia') : _readStoredKey();
}
/**
 * Renderiza o conteúdo do modal de Imagery Settings.
 * @param {HTMLElement} modal
 */
async function _renderImageryModal(modal: any) {
    const { TILE_PROVIDERS } = await import('../../core/io/geo/tileStitcher.js' as string);
    const currentOutputSize = _readStoredOutputSize();
    const savedMapboxKey = _readStoredKey();
    const savedStadiaKey = _readStoredCustomKey('stadia');
    const titleLabel = t('imageryModalTitle') || 'Imagery Settings';
    const qualityLabel = t('imageryQualityLabel') || 'Qualidade de Sa&#237;da';
    const keyNoteMapbox = 'Uso sujeito aos <a href="https://www.mapbox.com/legal/tos" target="_blank" rel="noopener">Termos de Servi&#231;o Mapbox</a>. Chave armazenada localmente.';
    const keyNoteStadia = 'Uso sujeito aos <a href="https://stadiamaps.com/terms-of-service/" target="_blank" rel="noopener">Termos de Servi&#231;o Stadia Maps</a>. O dom&#237;nio deve ser registrado no painel Stadia. Chave armazenada localmente.';
    function _badgeClass(license: any) {
        if (!license)
            return 'ims-badge-neutral';
        const l = license.toLowerCase();
        if (l.includes('public domain') || l.startsWith('cc by 4') || l.startsWith('odbl'))
            return 'ims-badge-green';
        if (l.includes('cc by'))
            return 'ims-badge-green';
        return 'ims-badge-yellow';
    }
    // Tabela de providers gratuitos
    let providerRows = '';
    TILE_PROVIDERS.filter((p: any) => !p.requiresKey).forEach((p: any) => {
        const idx = TILE_PROVIDERS.indexOf(p);
        const active = !_customImageUrl && !_customKeyActive && _currentProvider === idx;
        const circle = active ? '&#9679;' : '&#9675;';
        providerRows += `<tr class="ims-provider-row${active ? ' active' : ''}"
                             data-cc-call-click="handleSelectImageryProviderAndClose|j:${encodeURIComponent(String(idx))}"
                             role="row" style="cursor:pointer">
            <td class="ims-radio">${circle}</td>
            <td class="ims-name">${p.name}</td>
            <td><a class="ims-license-badge ${_badgeClass(p.license)}"
                   href="${p.licenseUrl || '#'}" target="_blank" rel="noopener"
                   data-cc-call-click="__noop" data-cc-stop="1">${p.license || '—'}</a></td>
            <td class="ims-resolution">${p.resolution || '—'}</td>
            <td class="ims-coverage">${p.coverage || '—'}</td>
        </tr>`;
    });
    // Aviso ESRI
    const esriWarning = `<p class="ims-warn-note">
        &#9888; ESRI World Imagery: o endpoint legacy &#233; acessado sem token para desenvolvimento e
        fins acad&#234;micos. Consulte os <a href="https://www.esri.com/en-us/legal/terms/full-master-agreement"
        target="_blank" rel="noopener">Termos Esri</a> antes de usar em produ&#231;&#227;o comercial.
    </p>`;
    const html = `
        <div class="modal-header">
            <span id="imagery-modal-title" class="modal-title">${titleLabel}</span>
            <button class="modal-close-btn" data-cc-action="cc-579f14bd" aria-label="${t('common.close')}">&#215;</button>
        </div>
        <div class="modal-body ims-body">

            <div class="ims-section-label">${t('imagerySettings') || 'Imagem de Sat&#233;lite'}</div>
            <table class="ims-provider-table" role="grid" aria-label="Provedores de imagery">
                <thead>
                    <tr>
                        <th></th>
                        <th>Nome</th>
                        <th>Licen&#231;a</th>
                        <th>Resolu&#231;&#227;o</th>
                        <th>Cobertura</th>
                    </tr>
                </thead>
                <tbody>${providerRows}</tbody>
            </table>
            ${esriWarning}

            <div class="ims-divider"></div>

            <div class="ims-section-label">${t('imageryCustomProvider') || 'Provedor com Chave API'}</div>
            <select data-field-meta="true" data-field-meta-key="auto:ims-custom-provider-select" class="ims-key-select" id="ims-custom-provider-select"
                    data-cc-change="cc-de1f84c1">
                <option value="mapbox">Mapbox Satellite (zoom 22)</option>
                <option value="stadia">Stadia Maps Satellite (zoom 20)</option>
            </select>
            <input data-field-meta="true" data-field-meta-key="auto:ims-api-key-input" type="text" class="ims-key-input" id="ims-api-key-input"
                   placeholder="${t('imageryApiKey') || 'Chave API'}"
                   value="${savedMapboxKey}"
                   spellcheck="false" autocomplete="off">
            <p class="ims-license-note" id="ims-license-note">${keyNoteMapbox}</p>
            <button class="ims-apply-btn" data-cc-action="cc-09e3c527">
                ${t('imageryApplyKey') || 'Aplicar'}
            </button>

            <div class="ims-divider"></div>

            <div class="ims-section-label">${qualityLabel}</div>
            <div class="ims-quality-options">
                <label class="ims-quality-opt">
                    <input data-field-meta="true" data-field-meta-key="auto-name:ims-output-size" type="radio" name="ims-output-size" value="256"
                           ${currentOutputSize === 256 ? 'checked' : ''}
                           data-cc-change="cc-410c991a"> 256px
                </label>
                <label class="ims-quality-opt">
                    <input data-field-meta="true" data-field-meta-key="auto-name:ims-output-size" type="radio" name="ims-output-size" value="512"
                           ${currentOutputSize === 512 ? 'checked' : ''}
                           data-cc-change="cc-7ce514f5"> 512px
                </label>
                <label class="ims-quality-opt">
                    <input data-field-meta="true" data-field-meta-key="auto-name:ims-output-size" type="radio" name="ims-output-size" value="1024"
                           ${currentOutputSize === 1024 ? 'checked' : ''}
                           data-cc-change="cc-fb97bce0"> 1024px
                </label>
            </div>
            <p class="ims-quality-hint">mais r&#225;pido &#8592; 256 &middot; 512 &middot; 1024 &#8594; mais n&#237;tido</p>

        </div>
        <div class="modal-footer">
            <button class="btn-secondary" data-cc-action="cc-579f14bd">
                ${t('close') || 'Fechar'}
            </button>
        </div>`;
    // Guarda estado para uso nos handlers do modal
    modal._keyNoteMapbox = keyNoteMapbox;
    modal._keyNoteStadia = keyNoteStadia;
    modal._savedMapboxKey = savedMapboxKey;
    modal._savedStadiaKey = savedStadiaKey;
    modal.querySelector('.modal-box').innerHTML = html;
}
/**
 * Atualiza input de chave e nota de licença ao trocar provider no modal.
 * @param {string} providerKey - 'mapbox' ou 'stadia'
 */
function handleImsProviderSelectChange(providerKey: any) {
    const modal: any = (document.getElementById('imagery-settings-modal'));
    const input: any = (document.getElementById('ims-api-key-input'));
    const note: any = document.getElementById('ims-license-note');
    if (!input || !note || !modal)
        return;
    if (providerKey === 'stadia') {
        input.value = modal._savedStadiaKey || '';
        note.innerHTML = modal._keyNoteStadia || '';
    }
    else {
        input.value = modal._savedMapboxKey || '';
        note.innerHTML = modal._keyNoteMapbox || '';
    }
}
/**
 * Salva outputSize escolhido no modal.
 * @param {number} size
 */
async function handleImsOutputSizeChange(size: any) {
    await _saveOutputSize(size);
}
/**
 * Aplica provider com chave a partir do modal.
 */
async function handleImsApplyCustomProvider() {
    const select: any = (document.getElementById('ims-custom-provider-select'));
    const input: any = (document.getElementById('ims-api-key-input'));
    if (!select || !input)
        return;
    const providerKey = select.value;
    const apiKey = input.value.trim();
    if (!apiKey) {
        const { showToast } = await import('../ui/toast.js' as string);
        showToast(t('imageryApiKey') || 'Insira a chave API', 'warning');
        return;
    }
    // Salva chave no localStorage
    if (providerKey === 'stadia') {
        await _saveCustomKey('stadia', apiKey);
    }
    else {
        await _saveKey(apiKey);
    }
    handleCloseImagerySettings();
    // Delega para handleApplyCustomProvider com o provider correto
    _pendingCustomProvider = providerKey;
    _pendingCustomKey = apiKey;
    await _applyCustomProviderByKey(providerKey, apiKey);
}
// ----------------------------------------------------------------
// PROVIDER SWITCH
// ----------------------------------------------------------------
/**
 * Troca o provedor de tiles e re-aplica overlay no boundary + terrain layers.
 * @param {number} idx - Index do provider em TILE_PROVIDERS
 */
/**
 * CC-S1 B3 artesanal (CCC-001 Fase 11) — wrapper "seleciona e fecha" usado
 * pelos cards de provider (era multi-call inline: select; close).
 */
async function handleSelectImageryProviderAndClose(idx: any) {
    await handleSelectImageryProvider(idx);
    handleCloseImagerySettings();
}

async function handleSelectImageryProvider(idx: any) {
    if (_isApplying)
        return;
    _isApplying = true;
    _customImageUrl = null;
    _customKeyActive = false;
    _currentProvider = idx;
    _saveProvider(idx);
    const badge = document.getElementById('imagery-toggle-badge');
    if (badge)
        badge.classList.add('iqp-loading');
    const { showToast } = await import('../ui/toast.js' as string);
    showToast(t('imageryApplying') || 'Aplicando imagem...', 'info');
    try {
        // Limpa cache de tiles para forcar re-fetch com novo provider
        const { clearTileCache } = await import('../../core/io/geo/tileStitcher.js' as string);
        const { TILE_PROVIDERS } = await import('../../core/io/geo/tileStitcher.js' as string);
        clearTileCache();
        const boundaryResult = await _applyProviderToBoundaries(idx);
        const terrainResult = await _applyProviderToTerrainLayers(idx);
        const fallbackOnlyCount = (boundaryResult?.fallbackOnlyCount || 0) + (terrainResult?.fallbackOnlyCount || 0);
        const providerName = TILE_PROVIDERS[idx]?.name || `Provider ${idx}`;
        if (fallbackOnlyCount > 0) {
            showToast(`${providerName}: ${t('imageryProviderFallbackOnly') || 'provider unavailable here; using configured fallback'}`, 'warning');
        }
        else {
            showToast(t('imageryApplied') || 'Imagem atualizada', 'success');
        }
    }
    catch (err: any) {
        log.error('Provider switch failed', (err).message);
        showToast((err).message || 'Erro ao trocar imagem', 'error');
    }
    finally {
        _isApplying = false;
        if (badge)
            badge.classList.remove('iqp-loading');
        _closePopup();
    }
}
async function _applyProviderToBoundaries(providerIdx: any,forceRefresh = false) {
    const { getAllElements, getMeshByElementId } = await import('../../core/elements/manager.js' as string);
    const { loadOverlayTexture } = await import('../../core/elements/meshFactory.js' as string);
    const { utmToWGS84, relativeToUTM } = await import('../../core/io/geo/coordinates.js' as string);
    const { requestRender } = await import('../scene/setup.js' as string);
    const boundaries = getAllElements().filter((e: any) => e.family === 'boundary' && e.data?.vertices?.length >= 3);
    let appliedCount = 0;
    let fallbackOnlyCount = 0;
    for (const boundary of boundaries) {
        const vs = boundary.data.vertices;
        const xs = vs.map((v: any) => v.x);
        const zs = vs.map((v: any) => v.z);
        const halfW = (Math.max(...xs) - Math.min(...xs)) / 2;
        const halfL = (Math.max(...zs) - Math.min(...zs)) / 2;
        const extentM = Math.max(halfW, halfL) * 2;
        const imgSize = Math.min(256, Math.max(128, Math.floor(extentM / 2)));
        const sw = utmToWGS84(relativeToUTM({ x: Math.min(...xs), y: 0, z: Math.max(...zs) }));
        const ne = utmToWGS84(relativeToUTM({ x: Math.max(...xs), y: 0, z: Math.min(...zs) }));
        // Usa cache IDB ou faz fetch remoto
        const { overlayUrl, overlayFallbackUrls } = await _fetchOrCacheImagery(providerIdx, sw, ne, imgSize, forceRefresh);
        if (!overlayUrl) {
            log.warn(`Provider ${providerIdx} returned empty for boundary ${boundary.id}`);
            const { showToast } = await import('../ui/toast.js' as string);
            const { TILE_PROVIDERS } = await import('../../core/io/geo/tileStitcher.js' as string);
            const name = TILE_PROVIDERS[providerIdx]?.name || `Provider ${providerIdx}`;
            showToast(`${name}: ${t('imageryNoBoundary') || 'failed to fetch tiles'}`, 'warning');
            continue;
        }
        boundary.data.overlayUrl = overlayUrl;
        boundary.data.overlayFallbackUrls = overlayFallbackUrls;
        if (!overlayUrl.startsWith('data:'))
            fallbackOnlyCount += 1;
        const mesh = getMeshByElementId(boundary.id);
        if (mesh) {
            const overlay = mesh.getObjectByName('overlay');
            if (overlay && overlay.material) {
                // Descarta textura antiga para liberar GPU e forcar refresh
                if (overlay.material.map) {
                    overlay.material.map.dispose();
                    overlay.material.map = null;
                    overlay.material.needsUpdate = true;
                }
                await loadOverlayTexture([overlayUrl, ...overlayFallbackUrls], overlay.material);
                appliedCount += 1;
                console.info(`[Imagery] Boundary ${boundary.id} overlay reloaded`);
            }
            else {
                log.warn(`Boundary ${boundary.id}: no overlay child or material`);
            }
        }
        else {
            log.warn(`Boundary ${boundary.id}: mesh not found`);
        }
    }
    requestRender();
    return { appliedCount, fallbackOnlyCount };
}
async function _applyProviderToTerrainLayers(providerIdx: any,forceRefresh = false) {
    const { getAllLayers, getLayerMesh, updateLayer } = await import('../../core/interpolation/manager.js' as string);
    const { applySatelliteTexture } = await import('../../core/interpolation/surfaceBuilder.js' as string);
    const { utmToWGS84, relativeToUTM } = await import('../../core/io/geo/coordinates.js' as string);
    const { requestRender } = await import('../scene/setup.js' as string);
    const layers = (getAllLayers().filter((l: any) => l.textureMode === 'satellite'));
    let appliedCount = 0;
    let fallbackOnlyCount = 0;
    if (layers.length === 0)
        return { appliedCount, fallbackOnlyCount };
    for (const layer of layers) {
        const mesh = (getLayerMesh(layer.id));
        if (!mesh)
            continue;
        const bounds = layer.bounds;
        if (!bounds)
            continue;
        const sw = utmToWGS84(relativeToUTM({ x: bounds.minX, y: 0, z: bounds.maxZ }));
        const ne = utmToWGS84(relativeToUTM({ x: bounds.maxX, y: 0, z: bounds.minZ }));
        const { overlayUrl, overlayFallbackUrls } = await _fetchOrCacheImagery(providerIdx, sw, ne, 256, forceRefresh);
        if (!overlayUrl) {
            log.warn(`Provider ${providerIdx} failed for terrain ${layer.id}`);
            continue;
        }
        // Descarta textura antiga do terrain mesh
        if (mesh.material?.map) {
            mesh.material.map.dispose();
            mesh.material.map = null;
            mesh.material.needsUpdate = true;
        }
        layer.satelliteUrls = [overlayUrl, ...overlayFallbackUrls];
        if (!overlayUrl.startsWith('data:'))
            fallbackOnlyCount += 1;
        const textureApplied = await applySatelliteTexture(mesh, layer.satelliteUrls);
        if (!textureApplied) {
            layer.satelliteUrls = null;
            updateLayer(layer.id, { textureMode: 'colorRamp' });
        }
        else {
            appliedCount += 1;
        }
    }
    requestRender();
    return { appliedCount, fallbackOnlyCount };
}
// ----------------------------------------------------------------
// CUSTOM IMAGE UPLOAD
// ----------------------------------------------------------------
/**
 * Upload de imagem local como overlay do boundary.
 * @param {HTMLInputElement} input - File input element
 */
async function handleUploadCustomImagery(input: any) {
    const file = input?.files?.[0];
    if (!file || !file.type.startsWith('image/')) {
        const { showToast } = await import('../ui/toast.js' as string);
        showToast('Selecione um arquivo de imagem (JPG, PNG)', 'error');
        return;
    }
    _isApplying = true;
    const badge = document.getElementById('imagery-toggle-badge');
    if (badge)
        badge.classList.add('iqp-loading');
    try {
        const blobUrl = URL.createObjectURL(file);
        _customImageUrl = blobUrl;
        const { getAllElements, getMeshByElementId } = await import('../../core/elements/manager.js' as string);
        const { loadOverlayTexture } = await import('../../core/elements/meshFactory.js' as string);
        const { requestRender } = await import('../scene/setup.js' as string);
        const boundaries = getAllElements().filter((e: any) => e.family === 'boundary' && e.data?.vertices?.length >= 3);
        for (const boundary of boundaries) {
            boundary.data.overlayUrl = blobUrl;
            const mesh = getMeshByElementId(boundary.id);
            if (mesh) {
                const overlay = mesh.getObjectByName('overlay');
                if (overlay && overlay.material) {
                    await loadOverlayTexture([blobUrl], overlay.material);
                }
            }
        }
        // Aplica tambem aos terrain layers com textura de satelite
        // eslint-disable-next-line
        const { getAllLayers, getLayerMesh, updateLayer } = await import('../../core/interpolation/manager.js' as string);
        const { applySatelliteTexture } = await import('../../core/interpolation/surfaceBuilder.js' as string);
        const terrainLayers = (getAllLayers().filter((l: any) => l.textureMode === 'satellite'));
        for (const layer of terrainLayers) {
            const tMesh = (getLayerMesh(layer.id));
            if (tMesh) {
                if (tMesh.material?.map) {
                    tMesh.material.map.dispose();
                    tMesh.material.map = null;
                }
                layer.satelliteUrls = [blobUrl];
                applySatelliteTexture(tMesh, [blobUrl]);
            }
        }
        requestRender();
        const { showToast } = await import('../ui/toast.js' as string);
        showToast(`Imagem "${file.name}" aplicada`, 'success');
    }
    catch (err: any) {
        log.error('Custom image upload failed', (err).message);
        const { showToast } = await import('../ui/toast.js' as string);
        showToast('Erro ao aplicar imagem', 'error');
    }
    finally {
        _isApplying = false;
        if (badge)
            badge.classList.remove('iqp-loading');
        _closePopup();
    }
}
// ----------------------------------------------------------------
// REFRESH
// ----------------------------------------------------------------
/**
 * Re-stitch imagery from current provider, clearing cache.
 * Forca re-download dos tiles (util quando tiles foram atualizados no servidor).
 */
async function handleRefreshImagery() {
    if (_isApplying)
        return;
    _isApplying = true;
    const badge = document.getElementById('imagery-toggle-badge');
    if (badge)
        badge.classList.add('iqp-loading');
    const { showToast } = await import('../ui/toast.js' as string);
    showToast(t('imageryApplying') || 'Aplicando imagem...', 'info');
    try {
        // Limpa caches in-memory E IDB para forcar re-download completo
        const { clearTileCache } = await import('../../core/io/geo/tileStitcher.js' as string);
        clearTileCache();
        await _clearImageryCache();
        await _applyProviderToBoundaries(_currentProvider, true);
        await _applyProviderToTerrainLayers(_currentProvider, true);
        showToast(t('imageryApplied') || 'Imagem atualizada', 'success');
    }
    catch (err: any) {
        log.error('Imagery refresh failed', (err).message);
        showToast((err).message || 'Erro ao atualizar', 'error');
    }
    finally {
        _isApplying = false;
        if (badge)
            badge.classList.remove('iqp-loading');
        _closePopup();
    }
}
// ----------------------------------------------------------------
// CUSTOM PROVIDER (API KEY)
// ----------------------------------------------------------------
/** Templates de URL para providers com chave API, indexados por nome curto */
const CUSTOM_PROVIDERS = {
    mapbox: {
        name: 'Mapbox Satellite',
        urlTemplate: 'https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token={key}',
        maxZoom: 22,
        license: 'Mapbox ToS',
        licenseUrl: 'https://www.mapbox.com/legal/tos',
    },
    stadia: {
        name: 'Stadia Maps Satellite',
        urlTemplate: 'https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}@2x.jpg?api_key={key}',
        maxZoom: 20,
        license: 'Stadia Maps ToS',
        licenseUrl: 'https://stadiamaps.com/terms-of-service/',
    },
};
/**
 * Aplica provider com chave API (usado pelo modal e pelo popup).
 * @param {string} providerKey - 'mapbox' ou 'stadia'
 * @param {string} apiKey - chave API do usuário
 */
async function _applyCustomProviderByKey(providerKey: any,apiKey: any) {
    const provider = (CUSTOM_PROVIDERS as Record<string,any>)[providerKey];
    if (!provider)
        return;
    _isApplying = true;
    const badge = document.getElementById('imagery-toggle-badge');
    if (badge)
        badge.classList.add('iqp-loading');
    const { showToast } = await import('../ui/toast.js' as string);
    showToast(t('imageryApplying') || 'Aplicando imagem...', 'info');
    const outputSize = _readStoredOutputSize();
    try {
        const url = provider.urlTemplate.replace('{key}', apiKey);
        const { clearTileCache, stitchTilesWithCustomUrl } = await import('../../core/io/geo/tileStitcher.js' as string);
        clearTileCache();
        const { getAllElements, getMeshByElementId } = await import('../../core/elements/manager.js' as string);
        const { loadOverlayTexture } = await import('../../core/elements/meshFactory.js' as string);
        const { utmToWGS84, relativeToUTM } = await import('../../core/io/geo/coordinates.js' as string);
        const { requestRender } = await import('../scene/setup.js' as string);
        const boundaries = getAllElements().filter((e: any) => e.family === 'boundary' && e.data?.vertices?.length >= 3);
        let success = false;
        for (const boundary of boundaries) {
            const vs = boundary.data.vertices;
            const xs = vs.map((v: any) => v.x);
            const zs = vs.map((v: any) => v.z);
            const extentM = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
            const imgSize = Math.min(outputSize, Math.max(128, Math.floor(extentM / 2)));
            const sw = utmToWGS84(relativeToUTM({ x: Math.min(...xs), y: 0, z: Math.max(...zs) }));
            const ne = utmToWGS84(relativeToUTM({ x: Math.max(...xs), y: 0, z: Math.min(...zs) }));
            const newUrl = await stitchTilesWithCustomUrl(url, provider.maxZoom, sw, ne, imgSize);
            if (!newUrl) {
                showToast(`${provider.name}: chave inválida ou fetch falhou`, 'error');
                continue;
            }
            boundary.data.overlayUrl = newUrl;
            const mesh = getMeshByElementId(boundary.id);
            if (mesh) {
                const overlay = mesh.getObjectByName('overlay');
                if (overlay?.material) {
                    if (overlay.material.map) {
                        overlay.material.map.dispose();
                        overlay.material.map = null;
                    }
                    await loadOverlayTexture([newUrl], overlay.material);
                }
            }
            success = true;
        }
        // Aplica em terrain layers
        const { getAllLayers, getLayerMesh, updateLayer } = await import('../../core/interpolation/manager.js' as string);
        const { applySatelliteTexture } = await import('../../core/interpolation/surfaceBuilder.js' as string);
        const terrainLayers = (getAllLayers().filter((l: any) => l.textureMode === 'satellite'));
        for (const layer of terrainLayers) {
            const tMesh = (getLayerMesh(layer.id));
            if (!tMesh || !layer.bounds)
                continue;
            const sw = utmToWGS84(relativeToUTM({ x: layer.bounds.minX, y: 0, z: layer.bounds.maxZ }));
            const ne = utmToWGS84(relativeToUTM({ x: layer.bounds.maxX, y: 0, z: layer.bounds.minZ }));
            const newUrl = await stitchTilesWithCustomUrl(url, provider.maxZoom, sw, ne, outputSize);
            if (!newUrl)
                continue;
            layer.textureUrl = newUrl;
            layer.satelliteUrls = [newUrl];
            const textureApplied = await applySatelliteTexture(tMesh, [newUrl]);
            if (textureApplied) {
                success = true;
            }
            else {
                layer.satelliteUrls = null;
                updateLayer(layer.id, { textureMode: 'colorRamp' });
            }
        }
        _customKeyActive = success;
        _customImageUrl = null;
        requestRender();
        if (success) {
            showToast(`${provider.name} aplicado`, 'success');
        }
    }
    catch (err: any) {
        const { showToast: st } = await import('../ui/toast.js' as string);
        st(`Erro: ${(err).message}`, 'error');
        log.error('Custom provider key application failed', (err).message);
    }
    finally {
        _isApplying = false;
        const b = document.getElementById('imagery-toggle-badge');
        if (b)
            b.classList.remove('iqp-loading');
    }
}
/**
 * Toggle disclosure section for custom provider API key.
 */
function handleToggleImageryCustomSection() {
    _customSectionOpen = !_customSectionOpen;
    const popup = document.getElementById('imagery-quick-popup');
    if (popup)
        _renderPopup(popup);
}
/**
 * Apply custom provider with user-supplied API key (from popup).
 */
async function handleApplyCustomProvider() {
    const select: any = (document.getElementById('iqp-custom-provider-select'));
    const input: any = (document.getElementById('iqp-api-key-input'));
    if (!select || !input)
        return;
    const providerKey = select.value;
    const apiKey = input.value.trim();
    if (!apiKey) {
        const { showToast } = await import('../ui/toast.js' as string);
        showToast(t('imageryApiKey') || 'Insira a chave API', 'warning');
        return;
    }
    // Persiste chave pelo provider correto
    if (providerKey === 'stadia') {
        await _saveCustomKey('stadia', apiKey);
    }
    else {
        await _saveKey(apiKey);
    }
    _closePopup();
    await _applyCustomProviderByKey(providerKey, apiKey);
}
// ----------------------------------------------------------------
// TERRAIN
// ----------------------------------------------------------------
/** Re-renderiza o popup sem fechar (atualiza estado do terreno). */
async function _refreshPopup() {
    const popup = document.getElementById('imagery-quick-popup');
    if (popup && !popup.classList.contains('hidden'))
        await _renderPopup(popup);
}
/** Atualiza fonte selecionada e re-renderiza. */
async function handleTerrainSourceChangeFromImagery(value: any) {
    _terrainSource = value === 'manual' ? 'manual' : 'auto';
    await _refreshPopup();
}
/**
 * Gera ou re-gera camada de terreno.
 * - Sem terreno + Web → createTerrainLayer auto
 * - Sem terreno + Manual → abre painel de interpolação
 * - Com terreno → atualiza gridSize e re-computa
 */
async function handleAddTerrainFromImagery() {
    const sel: any = document.getElementById('iqp-terrain-grid-select');
    const size = sel ? parseInt(sel.value, 10) : 64;
    const gridSize = { cols: size, rows: size };
    try {
        const { getAllLayers, createTerrainLayer, updateLayer, recomputeLayer } = await import('../../core/interpolation/manager.js' as string);
        const terrain = (getAllLayers().find((l: any) => l.type === 'terrain') || null);
        const { applyTerrainElevationToElements } = await import('../../core/interpolation/manager.js' as string);
        if (terrain) {
            // Re-gera: atualiza gridSize (e fonte se mudou) e recomputa
            const changes: any = { gridSize };
            if (_terrainSource !== terrain.dataSource) {
                changes.dataSource = _terrainSource;
                if (_terrainSource === 'auto')
                    changes.sourcePoints = null; // força re-fetch
            }
            updateLayer(terrain.id, changes);
            await recomputeLayer(terrain.id);
            try {
                applyTerrainElevationToElements();
            }
            catch (err: any) {
                log.debug('Terrain elevation application ignored', (err)?.message);
            }
            await _refreshPopup();
        }
        else if (_terrainSource === 'manual') {
            // Sem terreno + manual → redireciona ao painel
            _closePopup();
            if ((window).handleOpenInterpolationPanel)
                (window).handleOpenInterpolationPanel();
        }
        else {
            // Sem terreno + web → cria novo
            await createTerrainLayer({ dataSource: 'auto', gridSize });
            try {
                applyTerrainElevationToElements();
            }
            catch (err: any) {
                log.debug('Terrain elevation application ignored', (err)?.message);
            }
            _closePopup();
        }
    }
    catch (err: any) {
        log.error('Terrain generation failed', (err).message);
        if ((window).showToast)
            (window).showToast((err).message || 'Erro ao gerar terreno', 'error');
    }
}
/** Importa handlers de interpolação (exportados como objeto). */
async function _getInterpHandlers() {
    const mod = await import('./interpolation.js' as string);
    return mod.interpolationHandlers;
}
/** Alterna visibilidade da camada de terreno. */
async function handleToggleTerrainVisibilityFromImagery(id: any) {
    try {
        const h = await _getInterpHandlers();
        h.handleToggleLayerVisibility(id);
    }
    catch (err: any) {
        log.error('Toggle visibility failed', (err).message);
    }
    await _refreshPopup();
}
/** Alterna curvas de nível. */
async function handleToggleTerrainContoursFromImagery(id: any) {
    try {
        const h = await _getInterpHandlers();
        h.handleToggleInterpolationContours(id);
    }
    catch (err: any) {
        log.error('Toggle contours failed', (err).message);
    }
    await _refreshPopup();
}
/** Altera densidade das curvas de nível. */
async function handleTerrainContourDensityFromImagery(id: any,density: any) {
    try {
        const h = await _getInterpHandlers();
        h.handleChangeInterpolationContourDensity(id, density);
    }
    catch (err: any) {
        log.error('Contour density change failed', (err).message);
    }
    await _refreshPopup();
}
/** Alterna rótulos das curvas de nível. */
async function handleToggleTerrainContourLabelsFromImagery(id: any) {
    try {
        const h = await _getInterpHandlers();
        h.handleToggleInterpolationContourLabels(id);
    }
    catch (err: any) {
        log.error('Toggle contour labels failed', (err).message);
    }
    await _refreshPopup();
}
/** Remove a camada de terreno. */
async function handleRemoveTerrainFromImagery(id: any) {
    try {
        const h = await _getInterpHandlers();
        h.handleRemoveInterpolationLayer(id);
    }
    catch (err: any) {
        log.error('Remove terrain failed', (err).message);
    }
    _terrainSource = 'auto'; // reset fonte ao remover
    await _refreshPopup();
}
/** Abre o painel completo de interpolação e fecha o popup de imagery. */
async function handleOpenTerrainSettingsFromImagery() {
    _closePopup();
    if (window.handleOpenInterpolationPanel)
        window.handleOpenInterpolationPanel();
}
// ----------------------------------------------------------------
// TERRAIN IMAGE CONTROLS - toggle satellite + opacity
// ----------------------------------------------------------------
/** Alterna textureMode do terreno entre satellite e colorRamp. */
async function handleToggleTerrainSatelliteFromImagery(id: any) {
    try {
        const { getAllLayers, updateLayer } = await import('../../core/interpolation/manager.js' as string);
        const layer = (getAllLayers().find((l: any) => l.id === id));
        if (!layer)
            return;
        const newMode = layer.textureMode === 'satellite' ? 'colorRamp' : 'satellite';
        updateLayer(id, { textureMode: newMode });
    }
    catch (err: any) {
        log.error('Toggle satellite failed', (err).message);
    }
    await _refreshPopup();
}
/** Atualiza opacity de uma terrain layer. */
async function handleTerrainOpacityFromImagery(id: any,value: any) {
    try {
        const { updateLayer } = await import('../../core/interpolation/manager.js' as string);
        updateLayer(id, { opacity: parseFloat(value) });
    }
    catch (err: any) {
        log.error('Terrain opacity change failed', (err).message);
    }
}
// ----------------------------------------------------------------
// BOUNDARY OVERLAY CONTROLS - toggle + opacity
// ----------------------------------------------------------------
/** Alterna visibilidade do overlay mesh de um boundary. */
async function handleToggleBoundaryOverlayFromImagery(id: any) {
    try {
        const { getMeshByElementId } = await import('../../core/elements/manager.js' as string);
        const { requestRender } = await import('../scene/setup.js' as string);
        const mesh = getMeshByElementId(id);
        const overlay = mesh?.getObjectByName('overlay');
        if (overlay) {
            overlay.visible = !overlay.visible;
            requestRender();
        }
    }
    catch (err: any) {
        log.error('Toggle boundary overlay failed', (err).message);
    }
    await _refreshPopup();
}
/** Atualiza opacity do overlay mesh de um boundary. */
async function handleBoundaryOverlayOpacityFromImagery(id: any,value: any) {
    try {
        const { setBoundaryOverlayOpacity } = await import('../../core/elements/boundaryOverlayRuntime.js' as string);
        setBoundaryOverlayOpacity(id, value);
    }
    catch (err: any) {
        log.error('Boundary overlay opacity failed', (err).message);
    }
}
// ----------------------------------------------------------------
// VECTOR LAYERS - toggle de visibilidade
// ----------------------------------------------------------------
/** Alterna visibilidade de uma camada vetorial e re-renderiza popup. */
async function handleToggleVectorLayerVisibility(layerId: any) {
    try {
        const { setVectorLayerVisible, isVectorLayerVisible } = await import('../../core/io/geo/vectorLayerOverlay.js' as string);
        const current = isVectorLayerVisible(layerId);
        setVectorLayerVisible(layerId, !current);
    }
    catch (err: any) {
        log.error('Toggle vector layer failed', (err).message);
    }
    await _refreshPopup();
}
// ----------------------------------------------------------------
// EXPORT
// ----------------------------------------------------------------
export const imageryHandlers = {
    handleOpenImageryPopup,
    handleSelectImageryProvider,
    handleSelectImageryProviderAndClose,
    handleUploadCustomImagery,
    handleToggleImageryCustomSection,
    handleApplyCustomProvider,
    handleRefreshImagery,
    handleAddTerrainFromImagery,
    handleTerrainSourceChangeFromImagery,
    handleToggleTerrainVisibilityFromImagery,
    handleToggleTerrainContoursFromImagery,
    handleTerrainContourDensityFromImagery,
    handleToggleTerrainContourLabelsFromImagery,
    handleRemoveTerrainFromImagery,
    handleOpenTerrainSettingsFromImagery,
    // Terrain image controls
    handleToggleTerrainSatelliteFromImagery,
    handleTerrainOpacityFromImagery,
    // Boundary overlay controls
    handleToggleBoundaryOverlayFromImagery,
    handleBoundaryOverlayOpacityFromImagery,
    // Vector layers
    handleToggleVectorLayerVisibility,
    // Modal de configurações completas
    handleOpenImagerySettings,
    handleCloseImagerySettings,
    handleImageryCustomProviderChange,
    handleImsProviderSelectChange,
    handleImsOutputSizeChange,
    handleImsApplyCustomProvider,
};
