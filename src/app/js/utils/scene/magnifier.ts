// @ts-check
// Generated from src/app/js/utils/scene/magnifier.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   MAGNIFIER (LUPA) v2 — viewport magnification lens
   ================================================================

   Renderiza uma segunda passada da cena 3D com zoom ampliado
   num overlay circular que segue o mouse com offset.

   ABORDAGEM TECNICA:
   - Overlay CSS segue o mouse com offset (+40px, -40px) para nao
     obstruir o ponto inspecionado. Edge clamping nas bordas.
   - Crosshair CSS marca o ponto exato sendo amplificado.
   - Scissor rect na posicao do overlay (recorta pixels).
   - cam.setViewOffset() para sub-regiao centrada no mouse — mantem
     a mesma projecao/orientacao da vista principal.
   - Labels CSS2D clonados e reposicionados dentro do overlay.
   - Right-click no botao abre context menu com niveis de zoom.
   - pointer-events: none — nao interfere com OrbitControls.

   INTEGRACAO:
   - Registra-se como render hook via addRenderHook()
   - requestRender() direto no mousemove com 30fps throttle

   ================================================================ */
import { createTHREEProxy } from '../../core/three-lazy.js';
const THREE: any = createTHREEProxy();
import { getRenderer, getCamera, getScene, addRenderHook, requestRender } from './setup.js';
import { Z_INDEX } from '../ui/zIndex.js';
import { computeLensScissorRect, computeMagnifiedFrustum, computeLensCropRect } from './_magnifierGeometryPure.js';
// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------
const LS_KEY = 'ecbyts-magnifier-active';
const LS_ZOOM = 'ecbyts-magnifier-zoom';
const DEFAULT_LENS_SIZE = 280;
const ZOOM_LEVELS = [2, 3, 5, 8];
const OFFSET_X = 40; // overlay a direita do cursor
const OFFSET_Y = -40; // overlay acima do cursor
const THROTTLE_MS = 33; // ~30fps cap
// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------
let _active = false;
let _mouseX = 0;
let _mouseY = 0;
let _mouseInCanvas = false;
const _lensSize = DEFAULT_LENS_SIZE;
let _magnification = 3;
/** @type {any} */
let _overlayEl: any = null;
/** @type {any} */
let _crosshairEl: any = null;
/** @type {any} */
let _labelCloneContainer: any = null;
/** @type {any} */
let _menuEl: any = null;
let _initialized = false;
let _lastMoveTime = 0;
// Cached overlay position (CSS px, relative to canvas)
let _overlayCenterX = 0;
let _overlayCenterY = 0;
// Pooled vectors para evitar GC no render loop
let _prevScissor: any = null;
function _getPrevScissor() { if (!_prevScissor) _prevScissor = new THREE.Vector4(); return _prevScissor; }
// ----------------------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------------------
/**
 * Inicializa o magnifier.
 * Cria overlay + crosshair, registra listeners, registra render hook.
 * Deve ser chamado apos initScene() e apos initLabelRenderer().
 */
export function initMagnifier() {
    if (_initialized) return;
    const renderer = getRenderer();
    if (!renderer) {
        console.warn('[magnifier] Renderer not ready — skipping init');
        return;
    }
    const canvas = renderer.domElement;
    const container = canvas.parentElement;
    if (!container) return;
    // Overlay circular (borda visivel)
    _overlayEl = document.createElement('div');
    _overlayEl.id = 'magnifier-overlay';
    container.appendChild(_overlayEl);
    // Container para clones de labels amplificados
    _labelCloneContainer = document.createElement('div');
    _labelCloneContainer.id = 'magnifier-labels';
    _overlayEl.appendChild(_labelCloneContainer);
    // Crosshair - marca o ponto sendo inspecionado
    _crosshairEl = document.createElement('div');
    _crosshairEl.id = 'magnifier-crosshair';
    container.appendChild(_crosshairEl);
    // Mouse listeners no canvas
    canvas.addEventListener('mousemove', _onMouseMove);
    canvas.addEventListener('mouseenter', _onMouseEnter);
    canvas.addEventListener('mouseleave', _onMouseLeave);
    // Right-click: AI image generation (capture phase para interceptar antes de outros menus)
    container.addEventListener('contextmenu', _onContextMenu, { capture: true });
    // Middle-click: recentraliza crosshair (mousedown + pointerdown para cobrir OrbitControls)
    canvas.addEventListener('mousedown', _onMiddleClick);
    canvas.addEventListener('pointerdown', _onMiddlePointerDown);
    // Registra render hook - ULTIMO na cadeia (apos labels, gizmo)
    addRenderHook(_renderMagnifier);
    // Restaura estado persistido
    const savedActive = localStorage.getItem(LS_KEY) || '';
    if (savedActive === '1') {
        _active = true;
        _updateUI();
    }
    const savedZoom = parseInt(localStorage.getItem(LS_ZOOM) || '', 10);
    if (ZOOM_LEVELS.includes(savedZoom)) {
        _magnification = savedZoom;
    }
    _initialized = true;
    console.debug('[magnifier] Initialized (zoom: ' + _magnification + 'x, size: ' + _lensSize + 'px)');
}
// ----------------------------------------------------------------
// TOGGLE
// ----------------------------------------------------------------
/**
 * Alterna o modo lupa on/off.
 * Registrado como window.handleToggleMagnifier.
 */
export function toggleMagnifier() {
    _active = !_active;
    _updateUI();
    localStorage.setItem(LS_KEY, _active ? '1' : '0');
    if (_active) requestRender();
}
/**
 * Retorna se o magnifier esta ativo.
 * @returns {boolean}
 */
export function isMagnifierActive() {
    return _active;
}
// ----------------------------------------------------------------
// CONTEXT MENU - selecao de zoom level
// ----------------------------------------------------------------
/**
 * Abre popup de selecao de zoom.
 * Registrado como window.handleMagnifierMenu.
 * @param {Event} event
 */
export function showMagnifierMenu( event: any) {
    event.preventDefault();
    event.stopPropagation();
    // Remove menu anterior
    _closeMenu();
    const btn = document.getElementById('magnifier-toggle-btn');
    if (!btn) return;
    // Cria menu reutilizando CSS .panel-context-menu
    _menuEl = document.createElement('div');
    _menuEl.className = 'panel-context-menu visible';
    _menuEl.style.position = 'fixed';
    _menuEl.style.zIndex = String(Z_INDEX.PANEL_CONTEXT_MENU);
    let html = '';
    for (const z of ZOOM_LEVELS) {
        const active = z === _magnification ? ' active' : '';
        html += '<button class="panel-context-menu-item' + active + '" data-zoom="' + z + '">' + z + 'x</button>';
    }
    html += '<div class="panel-context-menu-sep"></div>';
    html += '<button class="panel-context-menu-item" data-action="report-bug">Reportar Bug</button>';
    _menuEl.innerHTML = html;
    document.body.appendChild(_menuEl);
    // Posicionar acima do botao
    const rect = btn.getBoundingClientRect();
    const menuH = _menuEl.offsetHeight;
    _menuEl.style.left = rect.left + 'px';
    _menuEl.style.top = rect.top - menuH - 4 + 'px';
    // Click em item
    _menuEl.addEventListener(
        'click',
        /** @param {any} e */ (e: any) => {
            if (e.target?.closest('[data-action="report-bug"]')) {
                /** @type {any} */ (window).handleReportBug?.();
                _closeMenu();
                return;
            }
            const item = e.target?.closest('[data-zoom]');
            if (!item) return;
            const z = parseInt(item.dataset.zoom, 10);
            if (ZOOM_LEVELS.includes(z)) {
                _magnification = z;
                localStorage.setItem(LS_ZOOM, String(z));
                if (_active) requestRender();
            }
            _closeMenu();
        },
    );
    // Click fora fecha
    setTimeout(() => {
        document.addEventListener('click', _closeMenu, { once: true });
    }, 0);
}
function _closeMenu() {
    if (_menuEl) {
        _menuEl.remove();
        _menuEl = null;
    }
}
// ----------------------------------------------------------------
// UI STATE
// ----------------------------------------------------------------
function _updateUI() {
    const btn = document.getElementById('magnifier-toggle-btn');
    const container = document.getElementById('canvas-container');
    if (btn) btn.classList.toggle('active', _active);
    if (container) container.classList.toggle('magnifier-active', _active);
    if (_overlayEl) _overlayEl.classList.toggle('active', _active && _mouseInCanvas);
    if (_crosshairEl) _crosshairEl.classList.toggle('active', _active && _mouseInCanvas);
}
// ----------------------------------------------------------------
// MOUSE TRACKING
// ----------------------------------------------------------------
/** @param {any} e */
function _onMouseMove( e: any) {
    if (!_active) return;
    // 30fps throttle
    const now = performance.now();
    if (now - _lastMoveTime < THROTTLE_MS) return;
    _lastMoveTime = now;
    // Usar clientX/clientY + canvasRect para evitar offset errado
    // quando e.target nao e o canvas (label overlay, etc.)
    const renderer = getRenderer();
    if (!renderer) return;
    const canvas = renderer.domElement;
    const canvasRect = canvas.getBoundingClientRect();
    _mouseX = e.clientX - canvasRect.left;
    _mouseY = e.clientY - canvasRect.top;
    _mouseInCanvas = true;
    _repositionOverlay(canvas.clientWidth, canvas.clientHeight);
    _cloneLabels();
    requestRender();
}
/**
 * Reposiciona overlay e crosshair baseado em _mouseX/_mouseY.
 * Extraido de _onMouseMove para reuso pelo middle-click recenter.
 * @param {number} cw - Canvas width (CSS px)
 * @param {number} ch - Canvas height (CSS px)
 */
function _repositionOverlay( cw: any, ch: any) {
    const r = _lensSize / 2;
    // --- Posicionar overlay com offset + edge clamping ---
    if (_overlayEl) {
        let cx = _mouseX + OFFSET_X + r;
        let cy = _mouseY + OFFSET_Y - r;
        if (cx + r > cw) cx = _mouseX - OFFSET_X - r;
        if (cx - r < 0) cx = r;
        if (cy - r < 0) cy = r;
        if (cy + r > ch) cy = ch - r;
        _overlayCenterX = cx;
        _overlayCenterY = cy;
        _overlayEl.style.transform = 'translate(' + (cx - r) + 'px, ' + (cy - r) + 'px)';
        if (!_overlayEl.classList.contains('active')) {
            _overlayEl.classList.add('active');
        }
    }
    // --- Crosshair no ponto do mouse ---
    if (_crosshairEl) {
        _crosshairEl.style.transform = 'translate(' + (_mouseX - 10) + 'px, ' + (_mouseY - 10) + 'px)';
        if (!_crosshairEl.classList.contains('active')) {
            _crosshairEl.classList.add('active');
        }
    }
}
function _onMouseEnter() {
    _mouseInCanvas = true;
}
function _onMouseLeave() {
    _mouseInCanvas = false;
    if (_overlayEl) _overlayEl.classList.remove('active');
    if (_crosshairEl) _crosshairEl.classList.remove('active');
    requestRender();
}
// ----------------------------------------------------------------
// LABEL CLONING - mostra labels ampliados dentro do overlay
// ----------------------------------------------------------------
/**
 * Clona labels CSS2D que estao na regiao ampliada e os posiciona
 * dentro do overlay com escala multiplicada.
 *
 * A regiao ampliada no canvas e um retangulo centrado em (_mouseX, _mouseY)
 * com tamanho (canvasW/mag) x (canvasH/mag).
 */
function _cloneLabels() {
    if (!_labelCloneContainer) return;
    // Limpa clones anteriores
    _labelCloneContainer.innerHTML = '';
    const labelOverlay = document.getElementById('label-renderer-overlay');
    if (!labelOverlay) return;
    const labels = labelOverlay.querySelectorAll('.label-2d');
    if (!labels.length) return;
    const renderer = getRenderer();
    if (!renderer) return;
    const canvas = renderer.domElement;
    const canvasRect = canvas.getBoundingClientRect();
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    // Regiao do mundo visivel na lupa (CSS pixels, centrada no mouse)
    const viewW = cw / _magnification;
    const viewH = ch / _magnification;
    const regionLeft = _mouseX - viewW / 2;
    const regionTop = _mouseY - viewH / 2;
    const regionRight = regionLeft + viewW;
    const regionBottom = regionTop + viewH;
    // eslint-disable-next-line
    const r = _lensSize / 2;
    for (const _label of labels) {
        const label = (_label) as HTMLElement;
        if (label.style.display === 'none' || label.style.visibility === 'hidden') continue;
        if (label.style.opacity === '0') continue;
        // Posicao do label no canvas (CSS pixels)
        const rect = label.getBoundingClientRect();
        const lx = rect.left - canvasRect.left + rect.width / 2;
        const ly = rect.top - canvasRect.top + rect.height / 2;
        // Dentro da regiao ampliada?
        if (lx < regionLeft || lx > regionRight || ly < regionTop || ly > regionBottom) continue;
        // Posicao relativa na regiao ampliada (0-1)
        const relX = (lx - regionLeft) / viewW;
        const relY = (ly - regionTop) / viewH;
        // Posicao dentro do overlay (relativa ao overlay, CSS pixels)
        const cloneX = relX * _lensSize;
        const cloneY = relY * _lensSize;
        // Criar clone simplificado
        const clone = document.createElement('div');
        clone.className = 'magnifier-label-clone';
        clone.textContent = label.textContent;
        clone.style.left = cloneX + 'px';
        clone.style.top = cloneY + 'px';
        _labelCloneContainer.appendChild(clone);
    }
}
// ----------------------------------------------------------------
// RIGHT-CLICK - AI image generation modal
// ----------------------------------------------------------------
/**
 * Intercepta contextmenu quando lupa ativa.
 * Capture phase + stopImmediatePropagation impede outros context menus.
 * @param {MouseEvent} e
 */
function _onContextMenu( e: any) {
    if (!_active || !_mouseInCanvas) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    // BS1 fix: atualizar coordenadas do evento (podem estar stale se sem mousemove)
    const renderer = getRenderer();
    if (!renderer) return;
    const canvas = renderer.domElement;
    const canvasRect = canvas.getBoundingClientRect();
    _mouseX = e.clientX - canvasRect.left;
    _mouseY = e.clientY - canvasRect.top;
    _repositionOverlay(canvas.clientWidth, canvas.clientHeight);
    // Captura async (toDataURL + crop) → abre modal
    _captureMagnifiedRegion()
        .then((imageDataUrl: any) => {
            if (!imageDataUrl) return;
            return import('../ui/aiImageModal.js' as string).then((m: any) => m.openAiImageModal(imageDataUrl));
        })
        .catch((err: any) => console.error('[magnifier] Failed to open AI image modal:', err));
}
// ----------------------------------------------------------------
// MIDDLE-CLICK - recentraliza crosshair
// ----------------------------------------------------------------
/**
 * Middle-click (button=1) recentraliza o crosshair no centro do canvas.
 * @param {MouseEvent} e
 */
function _onMiddleClick( e: any) {
    if (!_active || e.button !== 1) return;
    e.preventDefault();
    _recenterCrosshair();
}
/**
 * Intercepta pointerdown middle para impedir OrbitControls pan.
 * @param {PointerEvent} e
 */
function _onMiddlePointerDown( e: any) {
    if (!_active || e.button !== 1) return;
    e.preventDefault();
    e.stopPropagation();
}
/**
 * Move crosshair e overlay para o centro do canvas.
 */
function _recenterCrosshair() {
    const renderer = getRenderer();
    if (!renderer) return;
    const canvas = renderer.domElement;
    _mouseX = canvas.clientWidth / 2;
    _mouseY = canvas.clientHeight / 2;
    _mouseInCanvas = true;
    _repositionOverlay(canvas.clientWidth, canvas.clientHeight);
    _cloneLabels();
    requestRender();
}
// ----------------------------------------------------------------
// CAPTURE - captura regiao ampliada como data URL
// ----------------------------------------------------------------
/**
 * Captura a regiao ampliada pela lupa como data:image/png;base64,...
 * Faz um render isolado com o mesmo frustum/scissor do _renderMagnifier,
 * depois extrai o pixel rect via toDataURL + offscreen canvas crop.
 *
 * @returns {Promise<string|null>} data URL ou null em caso de erro
 */
async function _captureMagnifiedRegion() {
    const renderer = getRenderer();
    const cam = getCamera();
    const scene = getScene();
    if (!renderer || !cam || !scene) return null;
    const canvas = renderer.domElement;
    const pixelRatio = renderer.getPixelRatio();
    const canvasW = canvas.clientWidth;
    const canvasH = canvas.clientHeight;
    if (canvasW <= 0 || canvasH <= 0) return null;
    // --- Salvar estado original ---
    const oLeft = cam.left;
    const oRight = cam.right;
    const oTop = cam.top;
    const oBottom = cam.bottom;
    const prevScissorTest = renderer.getScissorTest();
    const savedScissor = new THREE.Vector4();
    renderer.getScissor(savedScissor);
    const savedViewport = new THREE.Vector4();
    renderer.getViewport(savedViewport);
    // --- Scissor + Viewport (mesma logica de _renderMagnifier) ---
    const glCanvasH = canvas.height;
    const { sx, sy, sw, sh } = computeLensScissorRect({
        lensSize: _lensSize,
        overlayCenterX: _overlayCenterX,
        overlayCenterY: _overlayCenterY,
        pixelRatio,
        glCanvasH,
    });
    renderer.setScissorTest(true);
    renderer.setScissor(sx, sy, sw, sh);
    renderer.setViewport(sx, sy, sw, sh);
    // --- Frustum centrado no mouse, ampliado ---
    const frustum = computeMagnifiedFrustum({
        mouseX: _mouseX,
        mouseY: _mouseY,
        canvasW,
        canvasH,
        left: oLeft,
        right: oRight,
        top: oTop,
        bottom: oBottom,
        magnification: _magnification,
    });
    cam.left = frustum.left;
    cam.right = frustum.right;
    cam.top = frustum.top;
    cam.bottom = frustum.bottom;
    cam.updateProjectionMatrix();
    renderer.render(scene, cam);
    // --- Restaurar estado ---
    cam.left = oLeft;
    cam.right = oRight;
    cam.top = oTop;
    cam.bottom = oBottom;
    cam.updateProjectionMatrix();
    renderer.setScissorTest(prevScissorTest);
    renderer.setScissor(savedScissor);
    renderer.setViewport(savedViewport);
    // --- Extrair pixels via toDataURL + crop ---
    try {
        const fullDataUrl = canvas.toDataURL('image/png');
        // Crop: coordenadas na imagem (toDataURL retorna top-to-bottom, GL e bottom-to-top)
        const { cropX, cropY, cropW, cropH } = computeLensCropRect({ sx, sy, sw, sh, glCanvasH });
        const offscreen = document.createElement('canvas');
        offscreen.width = cropW;
        offscreen.height = cropH;
        const ctx = (offscreen.getContext('2d')) as CanvasRenderingContext2D;
        const img = new Image();
        return new Promise((resolve: any) => {
            img.onload = () => {
                ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
                resolve(offscreen.toDataURL('image/png'));
            };
            img.onerror = () => {
                console.warn('[magnifier] Failed to crop captured region');
                resolve(fullDataUrl); // fallback: imagem completa
            };
            img.src = fullDataUrl;
        });
    } catch (err: any) {
        // BS2: canvas tainted por cross-origin image
        console.warn('[magnifier] toDataURL failed (cross-origin?):', err?.message);
        return null;
    }
}
// ----------------------------------------------------------------
// RENDER HOOK - segunda passada com setViewOffset
// ----------------------------------------------------------------
/**
 * Render hook chamado apos cada frame do render principal.
 * Renderiza a cena ampliada na posicao do overlay,
 * com setViewOffset centrado no ponto do mouse.
 *
 * @param {any} scene
 * @param {any} cam
 */
function _renderMagnifier( scene: any, cam: any) {
    if (!_active || !_mouseInCanvas || !_overlayEl) return;
    const renderer = getRenderer();
    if (!renderer) return;
    const canvas = renderer.domElement;
    const pixelRatio = renderer.getPixelRatio();
    const canvasW = canvas.clientWidth;
    const canvasH = canvas.clientHeight;
    if (canvasW <= 0 || canvasH <= 0) return;
    // --- Salvar estado original ---
    const oLeft = cam.left;
    const oRight = cam.right;
    const oTop = cam.top;
    const oBottom = cam.bottom;
    const prevScissorTest = renderer.getScissorTest();
    renderer.getScissor(_getPrevScissor());
    const prevViewport = new THREE.Vector4();
    renderer.getViewport(prevViewport);
    // --- Scissor + Viewport na posicao do overlay ---
    const glCanvasH = canvas.height;
    const { sx, sy, sw, sh } = computeLensScissorRect({
        lensSize: _lensSize,
        overlayCenterX: _overlayCenterX,
        overlayCenterY: _overlayCenterY,
        pixelRatio,
        glCanvasH,
    });
    renderer.setScissorTest(true);
    renderer.setScissor(sx, sy, sw, sh);
    renderer.setViewport(sx, sy, sw, sh);
    // --- Frustum: centrado no mouse, ampliado ---
    // O viewport agora e o quadrado do overlay. Precisamos que a camera
    // mostre a regiao centrada no mouse com magnification.
    // Para OrthographicCamera: left/right/top/bottom definem o mundo visivel.
    // Na camera original, a regiao visivel e (oRight-oLeft) x (oTop-oBottom)
    // em world units (ja escalado por zoom).
    // Queremos mostrar 1/mag dessa regiao, centrada no ponto do mouse.
    const frustum = computeMagnifiedFrustum({
        mouseX: _mouseX,
        mouseY: _mouseY,
        canvasW,
        canvasH,
        left: oLeft,
        right: oRight,
        top: oTop,
        bottom: oBottom,
        magnification: _magnification,
    });
    cam.left = frustum.left;
    cam.right = frustum.right;
    cam.top = frustum.top;
    cam.bottom = frustum.bottom;
    cam.updateProjectionMatrix();
    renderer.render(scene, cam);
    // --- Restaurar ---
    cam.left = oLeft;
    cam.right = oRight;
    cam.top = oTop;
    cam.bottom = oBottom;
    cam.updateProjectionMatrix();
    renderer.setScissorTest(prevScissorTest);
    renderer.setScissor(_getPrevScissor());
    renderer.setViewport(prevViewport);
}
