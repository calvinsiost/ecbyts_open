// @ts-check
// Generated from src/app/js/utils/scene/cursorProjector.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   CURSOR PROJECTOR — Ground plane crosshair + coordinate readout
   ================================================================

   Projeta a posição do cursor no plano do terreno (Y=0) e mostra
   feedback visual: anel sutil (default), crosshair + linha vertical
   (precision), ou nada (hidden/orbit/drag).

   MODOS:
   - default:   anel no ground + atualização de coordenadas
   - precision:  reticle crosshair + projection line + coordenadas
   - hidden:     sem visuais (orbit, drag, etc.)

   COORDENADAS:
   - Local: X/Y/Z da cena Three.js
   - UTM: Easting/Northing/Elevação (quando origem configurada)

   ================================================================ */
import { createTHREEProxy } from '../../core/three-lazy.js';
const THREE: any = createTHREEProxy();
import { getScene, getCamera, getControls, getRenderer, requestRender } from './setup.js';
import { getOrigin, hasOrigin, utmToWGS84 } from '../../core/io/geo/coordinates.js';
import { getViewMode } from './controls.js';
import { showToast } from '../ui/toast.js';
import { safeSetItem } from '../storage/storageMonitor.js';
import { safeJsonParse } from '../helpers/safeJsonParse.js';
// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------
const UPDATE_INTERVAL = 50; // ms — throttle do mousemove
const EPSILON = 0.01; // distância mínima para re-render
const LINE_COLOR = 0x4488aa; // azul-cinza profissional
const RETICLE_COLOR = 0x55bbee; // ciano brilhante para precision
const RING_INNER = 2.7;
const RING_OUTER = 3.0;
const RING_SEGMENTS = 48;
const RETICLE_INNER = 1.8;
const RETICLE_OUTER = 2.0;
const CROSS_ARM_LEN = 1.5; // comprimento dos braços do crosshair
const PROJ_LINE_HEIGHT = 5; // altura da projection line
const SCALE_MIN = 0.5;
const SCALE_MAX = 20;
const LS_KEY_ENABLED = 'ecbyts-cursor-projector';
const LS_KEY_COORD_MODE = 'ecbyts-coord-mode';
const LS_KEY_COORD_DISPLAY = 'ecbyts-coord-display';
// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------
let _initialized = false;
let _enabled = true;
let _mode = 'default'; // 'default' | 'precision' | 'hidden'
let _coordMode: 'local' | 'utm' | 'latlon' = 'local'; // 'local' | 'utm' | 'latlon'
let _pendingShiftCheck = false;
let _lastUpdateTime = 0;
let _orbitActive = false;
let _isEditing = false;
/** @type {'expanded'|'minimized'} */
let _coordDisplayState: 'expanded' | 'minimized' = 'expanded';
// Three.js objects - criados no init, reutilizados por frame
/** @type {any} */
let _cursorGroup: any = null;
/** @type {any} */
let _hoverRing: any = null;
/** @type {any} */
let _projectionLine: any = null;
/** @type {any} */
let _reticle: any = null;
/** @type {any} */
let _crosshairX: any = null; // Modo 2D — linha horizontal
/** @type {any} */
let _crosshairZ: any = null; // Modo 2D — linha vertical
// Pooled temporaries
/** @type {any} */
let _raycaster: any = null;
const _mouse = { x: 0, y: 0 };
/** @type {any} */
let _worldPos: any = null;
/** @type {any} */
let _prevPos: any = null;
// DOM refs
let _coordX: HTMLElement | null = null;
let _coordY: HTMLElement | null = null;
let _coordZ: HTMLElement | null = null;
let _coordDisplay: HTMLElement | null = null;
/** @type {any} */
const _labelSpans = null; // NodeList dos text nodes para label swap
// Cleanup refs
/** @type {any} */
let _container: HTMLElement | null = null;
/** @type {any[]} */
const _cleanupFns: Array<() => void> = [];
// ----------------------------------------------------------------
// THREE.js OBJECT FACTORY
// ----------------------------------------------------------------
/**
 * Cria todos os objetos 3D do cursor projector.
 * Chamado uma vez no init. Geometrias e materiais reutilizados.
 */
function _createObjects(THREE: any) {
    _cursorGroup = new THREE.Group();
    _cursorGroup.name = 'cursorProjector';
    _cursorGroup.renderOrder = 999;
    // --- Hover Ring (default mode) ---
    const ringGeo = new THREE.RingGeometry(RING_INNER, RING_OUTER, RING_SEGMENTS);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
        color: LINE_COLOR,
        transparent: true,
        opacity: 0.15,
        depthWrite: false,
        side: THREE.FrontSide,
    });
    _hoverRing = new THREE.Mesh(ringGeo, ringMat);
    _hoverRing.visible = false;
    _cursorGroup.add(_hoverRing);
    // --- Projection Line (precision mode) ---
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, PROJ_LINE_HEIGHT, 0),
        new THREE.Vector3(0, 0, 0),
    ]);
    const lineMat = new THREE.LineBasicMaterial({
        color: LINE_COLOR,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
    });
    _projectionLine = new THREE.Line(lineGeo, lineMat);
    _projectionLine.visible = false;
    _cursorGroup.add(_projectionLine);
    // --- Targeting Reticle (precision mode) ---
    _reticle = new THREE.Group();
    _reticle.name = 'reticle';
    const retRingGeo = new THREE.RingGeometry(RETICLE_INNER, RETICLE_OUTER, RING_SEGMENTS);
    retRingGeo.rotateX(-Math.PI / 2);
    const retRingMat = new THREE.MeshBasicMaterial({
        color: RETICLE_COLOR,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        side: THREE.FrontSide,
    });
    _reticle.add(new THREE.Mesh(retRingGeo, retRingMat));
    // 4 crosshair arms (+X, -X, +Z, -Z)
    const armMat = new THREE.LineBasicMaterial({
        color: RETICLE_COLOR,
        transparent: true,
        opacity: 0.5,
    });
    const armStart = RETICLE_OUTER;
    const armEnd = RETICLE_OUTER + CROSS_ARM_LEN;
    const arms = [
        [new THREE.Vector3(armStart, 0, 0), new THREE.Vector3(armEnd, 0, 0)],
        [new THREE.Vector3(-armStart, 0, 0), new THREE.Vector3(-armEnd, 0, 0)],
        [new THREE.Vector3(0, 0, armStart), new THREE.Vector3(0, 0, armEnd)],
        [new THREE.Vector3(0, 0, -armStart), new THREE.Vector3(0, 0, -armEnd)],
    ];
    for (const pts of arms) {
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        _reticle.add(new THREE.Line(geo, armMat));
    }
    _reticle.visible = false;
    _cursorGroup.add(_reticle);
    // --- Crosshair 2D (modo top-down, substitui ring) ---
    const crossMat = new THREE.LineBasicMaterial({
        color: LINE_COLOR,
        transparent: true,
        opacity: 0.25,
    });
    const halfLen = 3; // escala adaptada no update
    const xPts = [new THREE.Vector3(-halfLen, 0, 0), new THREE.Vector3(halfLen, 0, 0)];
    const zPts = [new THREE.Vector3(0, 0, -halfLen), new THREE.Vector3(0, 0, halfLen)];
    _crosshairX = new THREE.Line(new THREE.BufferGeometry().setFromPoints(xPts), crossMat);
    _crosshairZ = new THREE.Line(new THREE.BufferGeometry().setFromPoints(zPts), crossMat.clone());
    _crosshairX.visible = false;
    _crosshairZ.visible = false;
    _cursorGroup.add(_crosshairX);
    _cursorGroup.add(_crosshairZ);
    // Raycaster proprio (nao compartilhado com picker)
    _raycaster = new THREE.Raycaster();
}
// ----------------------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------------------
/**
 * Inicializa o cursor projector.
 * Cria objetos 3D, registra event listeners, adiciona a cena.
 *
 * @param {HTMLElement} canvasContainer - O container do canvas Three.js
 */
export async function initCursorProjector(canvasContainer: HTMLElement) {
    if (!canvasContainer) {
        console.warn('[cursorProjector] canvasContainer is null — skipping init');
        return;
    }
    // Guard: re-init
    if (_initialized) destroyCursorProjector();
    _container = canvasContainer;
    // THREE importado estaticamente no topo do módulo
    // Estado persistido
    const savedEnabled = localStorage.getItem(LS_KEY_ENABLED) || '';
    _enabled = savedEnabled !== 'disabled';
    const savedMode = localStorage.getItem(LS_KEY_COORD_MODE) || '';
    // H-011 (HUD Audit 2026-06-05, claude - ui): smart default. Quando usuário
    // nunca escolheu modo de coordenada, parte de 'latlon' se há origem do
    // projeto definida (formato Lat/Lon é universalmente reconhecível —
    // Google Maps). Caso contrário, fallback 'local' (X/Y/Z relativos).
    // Sem este default, usuário leigo via números UTM gigantes confusos.
    const validMode = ['local', 'utm', 'latlon'].includes(savedMode);
    _coordMode = validMode
        ? (savedMode as 'local' | 'utm' | 'latlon')
        : hasOrigin()
          ? 'latlon'
          : 'local';
    // Pooled vectors
    _worldPos = new THREE.Vector3();
    _prevPos = new THREE.Vector3();
    // Cria objetos 3D
    _createObjects(THREE);
    // Ground plane (Y=0, normal para cima)
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    // DOM refs para coordenadas
    _coordX = document.getElementById('coord-x');
    _coordY = document.getElementById('coord-y');
    _coordZ = document.getElementById('coord-z');
    _coordDisplay = document.getElementById('coord-display');
    // Adiciona grupo a cena
    const scene = getScene();
    if (scene) scene.add(_cursorGroup);
    // Atualiza botao toggle
    _updateToggleButton();
    // Inicializa botão minimize da barra de coordenadas
    _initCoordDisplayMinimize();
    // --- Event Listeners ---
    // mousemove - fluxo principal
    const onMouseMove = (e: MouseEvent) => {
        const now = Date.now();
        if (now - _lastUpdateTime < UPDATE_INTERVAL) return;
        _lastUpdateTime = now;
        if (!_enabled || _mode === 'hidden' || _orbitActive || _isEditing) {
            _hideAll();
            return;
        }
        // Shift re-check apos focus
        if (_pendingShiftCheck) {
            _pendingShiftCheck = false;
            _mode = e.shiftKey ? 'precision' : 'default';
        }
        // NDC conversion
        const renderer = getRenderer();
        if (!renderer) return;
        const rect = renderer.domElement.getBoundingClientRect();
        _mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        _mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        // Raycast
        const camera = getCamera();
        if (!camera) return;
        _raycaster.setFromCamera(_mouse, camera);
        // Intersecção com ground plane Y=0
        const hit = _raycaster.ray.intersectPlane(groundPlane, _worldPos);
        if (!hit) {
            _hideAll();
            return;
        }
        // Epsilon check - so renderiza se posição mudou
        if (_worldPos.distanceTo(_prevPos) < EPSILON) return;
        _prevPos.copy(_worldPos);
        // Atualiza coordenadas no DOM
        _updateCoordDisplay();
        // Atualiza visuais
        const viewMode = getViewMode();
        const is2D = viewMode === '2d';
        const zoom = camera.zoom || 1;
        const scale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, 1 / zoom));
        if (is2D) {
            // Modo 2D: crosshair lines
            _hoverRing.visible = false;
            _projectionLine.visible = false;
            _reticle.visible = false;
            const crossScale = 6 / zoom;
            _crosshairX.position.set(_worldPos.x, 0.001, _worldPos.z);
            _crosshairZ.position.set(_worldPos.x, 0.001, _worldPos.z);
            _crosshairX.scale.setScalar(crossScale / 3);
            _crosshairZ.scale.setScalar(crossScale / 3);
            const precisionOpacity = _mode === 'precision' ? 0.4 : 0.25;
            _crosshairX.material.opacity = precisionOpacity;
            _crosshairZ.material.opacity = precisionOpacity;
            _crosshairX.visible = true;
            _crosshairZ.visible = true;
        } else {
            // Modo 3D
            _crosshairX.visible = false;
            _crosshairZ.visible = false;
            // Hover ring
            _hoverRing.position.set(_worldPos.x, 0.001, _worldPos.z);
            _hoverRing.scale.setScalar(scale);
            _hoverRing.visible = true;
            // Precision mode
            if (_mode === 'precision') {
                _reticle.position.set(_worldPos.x, 0.002, _worldPos.z);
                _reticle.scale.setScalar(scale);
                _reticle.visible = true;
                // Projection line
                const positions = _projectionLine.geometry.attributes.position.array;
                positions[0] = _worldPos.x;
                positions[1] = _worldPos.y + PROJ_LINE_HEIGHT * scale;
                positions[2] = _worldPos.z;
                positions[3] = _worldPos.x;
                positions[4] = 0;
                positions[5] = _worldPos.z;
                _projectionLine.geometry.attributes.position.needsUpdate = true;
                _projectionLine.visible = true;
            } else {
                _reticle.visible = false;
                _projectionLine.visible = false;
            }
        }
        requestRender();
    };
    // mouseleave
    const onMouseLeave = () => {
        _hideAll();
        _clearCoords();
    };
    // Shift key - precision mode toggle
    const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Shift' && _enabled) _mode = 'precision';
    };
    const onKeyUp = (e: KeyboardEvent) => {
        if (e.key === 'Shift') _mode = 'default';
    };
    // OrbitControls - atualiza coords com o target durante orbit/pan
    const controls = getControls();
    if (controls?.addEventListener) {
        const onControlStart = () => {
            _orbitActive = true;
        };
        const onControlEnd = () => {
            _orbitActive = false;
        };
        // Atualiza coord display com o ponto alvo da câmera enquanto rotaciona
        const onControlChange = () => {
            if (!_orbitActive || !controls.target) return;
            _updateCoordDisplay(controls.target);
        };
        controls.addEventListener('start', onControlStart);
        controls.addEventListener('end', onControlEnd);
        controls.addEventListener('change', onControlChange);
        _cleanupFns.push(() => {
            controls.removeEventListener('start', onControlStart);
            controls.removeEventListener('end', onControlEnd);
            controls.removeEventListener('change', onControlChange);
        });
    }
    // View mode change
    const onViewModeChanged = () => {
        _hideAll(); // Reset visuais no cambio de modo
    };
    // Visibility/blur fallbacks
    const onVisChange = () => {
        if (document.hidden) _hideAll();
    };
    const onBlur = () => {
        _hideAll();
    };
    const onFocus = () => {
        _pendingShiftCheck = true;
    };
    // Coord display click - ciclo local → utm → latlon → local
    const onCoordClick = (e: MouseEvent) => {
        // Ignorar cliques no header ou botões
        if ((e.target as Element | null)?.closest('#coord-display-header')) return;
        e.preventDefault();
        if (!hasOrigin()) {
            showToast('Configure a origem UTM primeiro', 'warning');
            return;
        }
        const cycle: Array<'local' | 'utm' | 'latlon'> = ['local', 'utm', 'latlon'];
        const idx = cycle.indexOf(_coordMode);
        _coordMode = cycle[(idx + 1) % cycle.length] || 'local';
        safeSetItem(LS_KEY_COORD_MODE, _coordMode);
        _updateCoordLabels();
        _updateCoordDisplay();
    };
    // Shape editing - esconde cursor durante edicao de shapes
    const onShapeEditChanged = (e: Event) => {
        _isEditing = !!(e as CustomEvent).detail?.editing;
        if (_isEditing) {
            _hideAll();
            _clearCoords();
        }
    };
    // Register listeners
    const container = _container;
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseleave', onMouseLeave);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('viewModeChanged', onViewModeChanged);
    window.addEventListener('shapeEditChanged', onShapeEditChanged);
    document.addEventListener('visibilitychange', onVisChange);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    // Adicionar listener ao content em vez do display completo
    const contentDiv = document.getElementById('coord-display-content');
    if (contentDiv) contentDiv.addEventListener('click', onCoordClick);
    // Cleanup registry
    _cleanupFns.push(() => {
        container.removeEventListener('mousemove', onMouseMove);
        container.removeEventListener('mouseleave', onMouseLeave);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('viewModeChanged', onViewModeChanged);
        window.removeEventListener('shapeEditChanged', onShapeEditChanged);
        document.removeEventListener('visibilitychange', onVisChange);
        window.removeEventListener('blur', onBlur);
        window.removeEventListener('focus', onFocus);
        if (contentDiv) contentDiv.removeEventListener('click', onCoordClick);
    });
    _updateCoordLabels();
    _initialized = true;
}
// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------
/**
 * Habilita ou desabilita o cursor projector.
 * Usado por dragController (drag start/end) e OrbitControls.
 *
 * @param {boolean} enabled
 */
export function setCursorEnabled(enabled: boolean) {
    _enabled = !!enabled;
    if (!_enabled) _hideAll();
}
/**
 * Define o modo visual do cursor.
 *
 * @param {'default'|'precision'|'hidden'} mode
 */
/**
 * Define o modo de exibição de coordenadas: 'local' (X/Y/Z relativos),
 * 'utm' (Easting/Northing/Elev), 'latlon' (graus decimais).
 *
 * Calvin 2026-05-14: ao importar dados GIS, default 'latlon' é mais
 * útil que 'local' (coords relativos não dizem nada ao usuário GIS).
 *
 * @param {'local'|'utm'|'latlon'} mode
 */
export function setCoordMode(mode: 'local' | 'utm' | 'latlon') {
    if (!['local', 'utm', 'latlon'].includes(mode)) return;
    _coordMode = mode;
    safeSetItem(LS_KEY_COORD_MODE, mode);
    _updateCoordLabels();
    _updateCoordDisplay();
}
export function setCursorMode(mode: 'default' | 'precision' | 'hidden') {
    if (mode !== 'default' && mode !== 'precision' && mode !== 'hidden') return;
    _mode = mode;
    if (mode === 'hidden') _hideAll();
}
/**
 * Retorna a ultima posicao de intersecao com o ground plane.
 *
 * @returns {any|null}
 */
export function getCursorWorldPosition() {
    if (!_initialized || !_worldPos) return null;
    return _worldPos.clone();
}
/**
 * Toggle habilita/desabilita o cursor projector.
 * Chamado pelo botao no view-controls.
 */
export function toggleCursorProjector() {
    _enabled = !_enabled;
    safeSetItem(LS_KEY_ENABLED, _enabled ? 'enabled' : 'disabled');
    if (!_enabled) _hideAll();
    _updateToggleButton();
    showToast(_enabled ? 'Cursor projector ativado' : 'Cursor projector desativado', 'info');
}
/**
 * Remove todos os objetos, listeners, e reseta estado.
 */
export function destroyCursorProjector() {
    // Remove listeners
    for (const fn of _cleanupFns) fn();
    _cleanupFns.length = 0;
    // Remove da cena
    const scene = getScene();
    if (scene && _cursorGroup) scene.remove(_cursorGroup);
    // Dispose geometries/materials
    if (_cursorGroup) {
        _cursorGroup.traverse((obj: any) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach((m: any) => m.dispose());
                } else {
                    obj.material.dispose();
                }
            }
        });
    }
    _cursorGroup = null;
    _hoverRing = null;
    _projectionLine = null;
    _reticle = null;
    _crosshairX = null;
    _crosshairZ = null;
    _raycaster = null;
    _worldPos = null;
    _prevPos = null;
    _coordX = null;
    _coordY = null;
    _coordZ = null;
    _coordDisplay = null;
    _container = null;
    _initialized = false;
    _orbitActive = false;
    _isEditing = false;
    _mode = 'default';
}
// ----------------------------------------------------------------
// INTERNAL HELPERS
// ----------------------------------------------------------------
/** Esconde todos os visuais 3D. */
function _hideAll() {
    if (_hoverRing) _hoverRing.visible = false;
    if (_projectionLine) _projectionLine.visible = false;
    if (_reticle) _reticle.visible = false;
    if (_crosshairX) _crosshairX.visible = false;
    if (_crosshairZ) _crosshairZ.visible = false;
}
/** Limpa o display de coordenadas. */
function _clearCoords() {
    if (_coordX) _coordX.textContent = '-.--';
    if (_coordY) _coordY.textContent = '-.--';
    if (_coordZ) _coordZ.textContent = '-.--';
}
/**
 * Atualiza o display de coordenadas baseado no modo.
 * @param {any} [pos?] - posição a usar; padrão: _worldPos (cursor)
 */
function _updateCoordDisplay(pos?: any) {
    if (!_coordX || !_coordY || !_coordZ) return;
    const p = pos || _worldPos;
    if (!p) return;
    if ((_coordMode === 'utm' || _coordMode === 'latlon') && hasOrigin()) {
        const origin = getOrigin();
        const absE = origin.easting + p.x;
        const absN = origin.northing - p.z;
        const absElev = (origin.elevation || 0) + p.y;
        if (_coordMode === 'utm') {
            _coordX.textContent = absE.toFixed(2);
            _coordY.textContent = absN.toFixed(2);
            _coordZ.textContent = absElev.toFixed(2);
        } else {
            // latlon - converte UTM → WGS84
            const wgs = utmToWGS84({
                easting: absE,
                northing: absN,
                zone: origin.zone,
                hemisphere: origin.hemisphere,
            });
            _coordX.textContent = wgs.latitude.toFixed(6);
            _coordY.textContent = wgs.longitude.toFixed(6);
            _coordZ.textContent = absElev.toFixed(2);
        }
    } else {
        _coordX.textContent = p.x.toFixed(2);
        _coordY.textContent = p.y.toFixed(2);
        _coordZ.textContent = p.z.toFixed(2);
    }
}
/** Atualiza as labels X/Y/Z vs E/N/Elev no coord-display. */
function _updateCoordLabels() {
    if (!_coordDisplay) return;
    // H-011 (HUD Audit 2026-06-05, claude - ui): adiciona unidades explícitas
    // (m para distâncias, ° para graus geográficos) + tooltip explicativo +
    // cursor pointer para affordance de clique. Para usuário leigo, números
    // sem unit causam confusão (Nielsen H6 Recognition + WCAG 3.3.2 Labels).
    const labelTriple =
        _coordMode === 'utm' && hasOrigin()
            ? ['E: ', ' m | N: ', ' m | Elev: ', ' m']
            : _coordMode === 'latlon' && hasOrigin()
              ? ['Lat: ', '° | Lon: ', '° | Elev: ', ' m']
              : ['X: ', ' m | Y: ', ' m | Z: ', ' m'];
    const labels = [labelTriple[0], labelTriple[1], labelTriple[2]];
    const suffix = labelTriple[3];
    // Atualizar apenas o conteúdo, preservando a estrutura header+content
    const contentDiv = document.getElementById('coord-display-content');
    const html =
        `${labels[0]}<span id="coord-x">${_coordX?.textContent || '-.--'}</span>` +
        `${labels[1]}<span id="coord-y">${_coordY?.textContent || '-.--'}</span>` +
        `${labels[2]}<span id="coord-z">${_coordZ?.textContent || '-.--'}</span>${suffix}`;
    if (contentDiv) {
        contentDiv.innerHTML = html;
        contentDiv.style.cursor = 'pointer';
        contentDiv.title = hasOrigin()
            ? 'Clique para alternar entre Lat/Lon (mapa), UTM (técnico) e X/Y/Z (local)'
            : 'Defina a origem do projeto para alternar para Lat/Lon ou UTM';
    } else {
        // Fallback para estrutura antiga (sem header)
        _coordDisplay.innerHTML = html;
        _coordDisplay.style.cursor = 'pointer';
        _coordDisplay.title = 'Clique para alternar modo de coordenadas';
    }
    // Re-cache DOM refs
    _coordX = document.getElementById('coord-x');
    _coordY = document.getElementById('coord-y');
    _coordZ = document.getElementById('coord-z');
    window.dispatchEvent(
        new CustomEvent('coordDisplayStateChanged', {
            detail: { state: _coordDisplayState, mode: _coordMode },
        }),
    );
}
/** Atualiza o estado visual do botao toggle. */
function _updateToggleButton() {
    const btn = document.getElementById('cursor-projector-btn');
    if (!btn) return;
    btn.classList.toggle('view-btn-active', _enabled);
    btn.classList.toggle('active', _enabled);
    btn.title = _enabled ? 'Cursor Projector (ativo)' : 'Cursor Projector (inativo)';
}
// ----------------------------------------------------------------
// COORD-DISPLAY MINIMIZE / EXPAND
// ----------------------------------------------------------------
/** Inicializa o botão de minimize da barra de coordenadas. */
function _initCoordDisplayMinimize() {
    // Carregar estado salvo
    try {
        const state = safeJsonParse<any>(localStorage.getItem(LS_KEY_COORD_DISPLAY), null, 'cursor-projector-coord-state');
        if (state) _coordDisplayState = state.minimized ? 'minimized' : 'expanded';
    } catch (e: any) {
        console.debug('[cursor-projector] coord state load:', e?.message || e);
    }
    // Aplicar estado inicial
    _applyCoordDisplayState();
    // Adicionar listener ao botão
    const btnMin = document.getElementById('coord-display-minimize');
    if (btnMin) {
        btnMin.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleCoordDisplayMinimize();
        });
    }
    // Permitir expandir ao clicar no header quando minimizado
    const header = document.getElementById('coord-display-header');
    if (header) {
        header.addEventListener('click', (/** @type {any} */ e) => {
            if (e?.target?.closest?.('.coord-display-btn')) return;
            if (_coordDisplayState === 'minimized') {
                toggleCoordDisplayMinimize();
            }
        });
        // Drag to reposition
        if (!header.dataset.dragBound) {
            _attachCoordDrag(header);
            header.addEventListener('dblclick', () => {
                const display = document.getElementById('coord-display');
                if (display) {
                    display.style.left = '';
                    display.style.top = '';
                    display.style.right = '';
                    display.style.bottom = '';
                    _saveCoordDisplayState();
                }
            });
            header.dataset.dragBound = '1';
        }
    }
    // Restore saved position
    try {
        const state = safeJsonParse<any>(localStorage.getItem(LS_KEY_COORD_DISPLAY), null, 'cursor-projector-coord-pos');
        if (state) {
            const display = document.getElementById('coord-display');
            if (display && state.left != null) {
                display.style.left = `${state.left}px`;
                display.style.top = `${state.top}px`;
                display.style.right = 'auto';
                display.style.bottom = 'auto';
            }
        }
    } catch (e: any) {
        console.debug('[cursor-projector] coord pos restore:', e?.message || e);
    }
}
/** Aplica o estado atual (minimized/expanded) à barra de coordenadas. */
function _applyCoordDisplayState() {
    const display = document.getElementById('coord-display');
    const btnMin = document.getElementById('coord-display-minimize');
    if (!display) return;
    display.classList.toggle('coord-display-minimized', _coordDisplayState === 'minimized');
    if (btnMin) {
        btnMin.innerHTML = _coordDisplayState === 'minimized' ? '&#9654;' : '&#9472;';
        btnMin.title = _coordDisplayState === 'minimized' ? 'Expand' : 'Minimize';
    }
    // Notifica HUDs acoplados para recalcular posicionamento.
    window.dispatchEvent(
        new CustomEvent('coordDisplayStateChanged', {
            detail: { state: _coordDisplayState },
        }),
    );
}
/** Drag para reposicionar coord-display. */
/** @param {any} header */
function _attachCoordDrag(header: HTMLElement) {
    let dragging = false;
    let startX = 0,
        startY = 0,
        startLeft = 0,
        startTop = 0;
    const onMove = (e: MouseEvent | TouchEvent) => {
        if (!dragging) return;
        e.preventDefault();
        const pt = 'touches' in e ? e.touches[0] : e;
        if (!pt) return;
        const display = document.getElementById('coord-display');
        if (!display) return;
        const parent = display.offsetParent || document.body;
        const maxL = Math.max(0, parent.clientWidth - display.offsetWidth);
        const maxT = Math.max(0, parent.clientHeight - display.offsetHeight);
        display.style.left = `${Math.round(Math.min(maxL, Math.max(0, startLeft + pt.clientX - startX)))}px`;
        display.style.top = `${Math.round(Math.min(maxT, Math.max(0, startTop + pt.clientY - startY)))}px`;
        display.style.right = 'auto';
        display.style.bottom = 'auto';
    };
    const onUp = () => {
        if (!dragging) return;
        dragging = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onUp);
        _saveCoordDisplayState();
    };
    header.addEventListener('mousedown', (e: MouseEvent) => {
        if (e.button !== 0) return;
        if ((e.target as Element | null)?.closest('.coord-display-btn')) return;
        e.preventDefault();
        e.stopPropagation();
        const display = document.getElementById('coord-display');
        if (!display) return;
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = display.offsetLeft;
        startTop = display.offsetTop;
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
    header.addEventListener(
        'touchstart',
        (e: TouchEvent) => {
            if ((e.target as Element | null)?.closest('.coord-display-btn')) return;
            e.preventDefault();
            e.stopPropagation();
            const display = document.getElementById('coord-display');
            if (!display) return;
            const pt = e.touches[0];
            if (!pt) return;
            dragging = true;
            startX = pt.clientX;
            startY = pt.clientY;
            startLeft = display.offsetLeft;
            startTop = display.offsetTop;
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onUp);
        },
        { passive: false },
    );
}
/** Salva o estado atual no localStorage. */
function _saveCoordDisplayState() {
    try {
        const display = document.getElementById('coord-display');
        /** @type {{left?: number, top?: number}} */
        const pos: { left?: number; top?: number } = {};
        if (display && display.style.left) {
            pos.left = display.offsetLeft;
            pos.top = display.offsetTop;
        }
        safeSetItem(
            LS_KEY_COORD_DISPLAY,
            JSON.stringify({
                minimized: _coordDisplayState === 'minimized',
                ...pos,
            }),
        );
    } catch (e: any) {
        console.debug('[cursor-projector] coord pos persist:', e?.message || e);
    }
}
/**
 * Alterna entre expanded e minimized na barra de coordenadas.
 * Pode ser chamada globalmente via window.toggleCoordDisplayMinimize()
 */
export function toggleCoordDisplayMinimize() {
    _coordDisplayState = _coordDisplayState === 'minimized' ? 'expanded' : 'minimized';
    _applyCoordDisplayState();
    _saveCoordDisplayState();
}
/**
 * Expande a barra de coordenadas.
 */
export function expandCoordDisplay() {
    _coordDisplayState = 'expanded';
    _applyCoordDisplayState();
    _saveCoordDisplayState();
}
/**
 * Minimiza a barra de coordenadas.
 */
export function minimizeCoordDisplay() {
    _coordDisplayState = 'minimized';
    _applyCoordDisplayState();
    _saveCoordDisplayState();
}
/**
 * Retorna o estado atual da barra de coordenadas.
 * @returns {'expanded'|'minimized'}
 */
export function getCoordDisplayState() {
    return _coordDisplayState;
}
//# sourceMappingURL=cursorProjector.js.map
