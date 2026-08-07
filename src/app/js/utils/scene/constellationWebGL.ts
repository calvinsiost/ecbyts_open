// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   CONSTELLATION WEBGL RENDERER — Three.js graph visualization
   SPEC_CONSTELLATION_HUD_9_75 §4.3 / §Q7

   Renderizador WebGL para o grafo de constelação.
   - Sprites para nós (círculo/quadrado/triângulo/losango)
   - Linhas para arestas (sólida/tracejada/seta/animada)
   - Raycasting para hover/click
   - LOD: switch para Points quando >200 nós visíveis
   - Loop próprio de 60fps com requestAnimationFrame
   ================================================================ */

import { createTHREEProxy } from '../../core/three-lazy.js';
const Three: any = createTHREEProxy();
import { getEdgeType } from '../edges/types.js';
import { Z_INDEX } from '../ui/zIndex.js';

// ──────────────────────────────────────────────────────────────────────
// CONSTANTS
// ──────────────────────────────────────────────────────────────────────

const FAMILY_COLORS = Object.freeze({
    well: '#4FC3F7',
    plume: '#FF7043',
    lake: '#29B6F6',
    river: '#26C6DA',
    spring: '#66BB6A',
    building: '#9E9E9E',
    tank: '#FFA726',
    waste: '#EF5350',
    boundary: '#78909C',
    sensor: '#00BCD4',
    area: '#81C784',
    individual: '#CE93D8',
    incident: '#FF8A65',
    emission_source: '#A1887F',
    waste_stream: '#80CBC4',
    effluent_point: '#90CAF9',
    habitat: '#AED581',
    sample: '#AB47BC',
    marker: '#EF5350',
    stratum: '#8D6E63',
    intangible: '#BA68C8',
    generic: '#B0BEC5',
    default: '#90A4AE',
    campaign: '#FFB300',
    observation: '#FFE082',
});

const NODE_SHAPES = Object.freeze({
    CIRCLE: 'circle',
    SQUARE: 'square',
    TRIANGLE: 'triangle',
    DIAMOND: 'diamond',
});

const LOD_THRESHOLD = 200;
const ANIMATION_SPEED = 0.08;
const ARROW_SIZE = 6;

// ──────────────────────────────────────────────────────────────────────
// TEXTURE CACHE
// ──────────────────────────────────────────────────────────────────────

/** @type {Map<string, any>} */
const _textureCache = new Map();

/**
 * Gera textura Canvas para um shape de nó.
 * @param {string} shape - NODE_SHAPES value
 * @param {string} color - hex color
 * @param {number} [size=64]
 * @returns {any}
 */
function _getShapeTexture(shape: any, color: any, size = 64): any {
    const key = `${shape}:${color}:${size}`;
    if (_textureCache.has(key)) return _textureCache.get(key);

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d canvas context unavailable');
    const cx = size / 2;
    const cy = size / 2;
    const r = size * 0.36;

    // Glow
    const glow = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.6);
    glow.addColorStop(0, color + '50');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);

    // Fill shape
    ctx.fillStyle = color;
    ctx.beginPath();
    switch (shape) {
        case NODE_SHAPES.CIRCLE:
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            break;
        case NODE_SHAPES.SQUARE:
            ctx.rect(cx - r, cy - r, r * 2, r * 2);
            break;
        case NODE_SHAPES.TRIANGLE:
            ctx.moveTo(cx, cy - r);
            ctx.lineTo(cx + r * 0.866, cy + r * 0.5);
            ctx.lineTo(cx - r * 0.866, cy + r * 0.5);
            ctx.closePath();
            break;
        case NODE_SHAPES.DIAMOND:
            ctx.moveTo(cx, cy - r);
            ctx.lineTo(cx + r * 0.7, cy);
            ctx.lineTo(cx, cy + r);
            ctx.lineTo(cx - r * 0.7, cy);
            ctx.closePath();
            break;
    }
    ctx.fill();

    // Highlight ring
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();

    const texture = new Three.CanvasTexture(canvas);
    texture.needsUpdate = true;
    _textureCache.set(key, texture);
    return texture;
}

/**
 * Determina shape do nó baseado em propriedades.
 * @param {any} node
 * @returns {string}
 */
function _resolveNodeShape(node: any): string {
    if (node.isObservation) return NODE_SHAPES.DIAMOND;
    if (node.family === 'campaign') return NODE_SHAPES.SQUARE;
    if (node.type === 'family' || node.shape === 'triangle') return NODE_SHAPES.TRIANGLE;
    return NODE_SHAPES.CIRCLE;
}

/**
 * Determina layer da aresta (z3a..z3d).
 * @param {any} line - currentLines item
 * @returns {string}
 */
function _resolveEdgeLayer(line: any): string {
    if (line.edge?.layer) return line.edge.layer;
    const edgeType = getEdgeType(line.edge?.type);
    if (!edgeType) return 'z3d';
    switch (edgeType.category) {
        case 'spatial':
            return 'z3a';
        case 'hierarchy':
            return 'z3b';
        default:
            return 'z3d';
    }
}

/**
 * Determina cor da aresta.
 * @param {any} line
 * @returns {string}
 */
function _resolveEdgeColor(line: any): string {
    const edgeType = getEdgeType(line.edge?.type);
    if (!edgeType) return '#607D8B';
    const catColor = /*as:Record<string, string>*/({
        hierarchy: '#673AB7',
        monitoring: '#2196F3',
        impact: '#F44336',
        spatial: '#4CAF50',
        responsibility: '#FF9800',
        compliance: '#607D8B',
    });
    return (catColor as any)[edgeType.category] || '#607D8B';
}

// ──────────────────────────────────────────────────────────────────────
// LABEL HTML OVERLAY
// ──────────────────────────────────────────────────────────────────────

class _LabelOverlay {
    [key: string]: any;
    /** @param {HTMLElement} container */
    constructor(container: any) {
        this.container = container;
        this.divs = new Map(); // id -> HTMLElement
    }

    clear() {
        for (const div of this.divs.values()) {
            div.remove();
        }
        this.divs.clear();
    }

    /**
     * @param {string} id
     * @param {string} text
     * @param {number} x
     * @param {number} y
     * @param {{opacity?:number|string,fontSize?:string,color?:string,display?:string}} [style]
     */
    set(id: any, text: any, x: any, y: any, style: any = {}) {
        let div = this.divs.get(id);
        if (!div) {
            div = document.createElement('div');
            div.className = 'constellation-node-label';
            div.style.position = 'absolute';
            div.style.pointerEvents = 'none';
            div.style.whiteSpace = 'nowrap';
            div.style.fontSize = '9px';
            div.style.fontFamily = 'Inter, system-ui, sans-serif';
            div.style.color = 'rgba(255,255,255,0.65)';
            div.style.textShadow = '0 1px 3px rgba(0,0,0,0.8)';
            div.style.transition = 'opacity 0.15s ease';
            div.style.zIndex = String(Z_INDEX.EXCEPTION_CONSTELLATION_WEBGL_DIV);
            this.container.appendChild(div);
            this.divs.set(id, div);
        }
        div.textContent = text;
        div.style.left = `${x}px`;
        div.style.top = `${y}px`;
        div.style.opacity = style.opacity !== undefined ? String(style.opacity) : '1';
        if (style.fontSize) div.style.fontSize = style.fontSize;
        if (style.color) div.style.color = style.color;
        if (style.display) div.style.display = style.display;
    }

    /** @param {string} id */
    remove(id: any) {
        const div = this.divs.get(id);
        if (div) {
            div.remove();
            this.divs.delete(id);
        }
    }

    /**
     * @param {string} id
     * @param {number} opacity
     */
    setOpacity(id: any, opacity: any) {
        const div = this.divs.get(id);
        if (div) div.style.opacity = String(opacity);
    }
}

// ──────────────────────────────────────────────────────────────────────
// RENDERER CLASS
// ──────────────────────────────────────────────────────────────────────

export class ConstellationWebGLRenderer {
    [key: string]: any;
    /**
     * @param {HTMLElement} container
     * @param {object} [options]
     * @param {'2d'|'3d'} [options.mode='2d']
     * @param {string|null} [options.backgroundColor=null]
     * @param {Function} [options.onNodeHover]
     * @param {Function} [options.onNodeClick]
     * @param {Function} [options.onNodeDoubleClick]
     */
    constructor(container: any, options: any = {}) {
        this.container = container;
        /** @type {any} */
        this.options = {
            mode: '2d',
            backgroundColor: null,
            onNodeHover: null,
            onNodeClick: null,
            onNodeDoubleClick: null,
            ...options,
        };

        this._width = container.clientWidth || 800;
        this._height = container.clientHeight || 160;
        this._running = false;
        this._animationId = null;
        this._dashOffset = 0;
        this._needsRender = true;
        this._panning = false;
        this._rotating = false;
        this._lastPointerX = 0;
        this._lastPointerY = 0;
        this._hoveredNodeId = null;
        this._focusedNodeId = null;
        this._highlighted = new Set();
        this._useLOD = false;
        this._draggingNodeId = null;
        this._dragHasMoved = false;
        this._dragStartX = 0;
        this._dragStartY = 0;
        /** @type {Map<string, Array<{mesh:any, pointIndex:number, lineIndex:number}>>} */
        this._edgeMap = new Map(); // nodeId -> [{mesh, pointIndex}]
        /** @type {any[]} */
        this._animatedEdges = [];

        // Scene
        this.scene = new Three.Scene();
        if (this.options.backgroundColor !== null) {
            this.scene.background = new Three.Color(this.options.backgroundColor);
        }

        // Camera
        this._setupCamera();

        // Renderer
        this.renderer = new Three.WebGLRenderer({
            antialias: true,
            alpha: this.options.backgroundColor === null,
        });
        this.renderer.setPixelRatio(Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2));
        this.renderer.setSize(this._width, this._height);
        this.renderer.domElement.style.width = '100%';
        this.renderer.domElement.style.height = '100%';
        this.renderer.domElement.style.display = 'block';
        this.container.appendChild(this.renderer.domElement);

        // Groups
        this.edgesGroup = new Three.Group();
        this.nodesGroup = new Three.Group();
        this.arrowGroup = new Three.Group();
        this.lodGroup = new Three.Group();
        this.scene.add(this.edgesGroup);
        this.scene.add(this.nodesGroup);
        this.scene.add(this.arrowGroup);
        this.scene.add(this.lodGroup);

        // Raycaster
        this.raycaster = new Three.Raycaster();
        this.raycaster.params.Sprite = { threshold: 0.1 };
        this.mouse = new Three.Vector2();

        // Data
        /** @type {any[]} */
        this.nodeData = [];
        /** @type {any[]} */
        this.lineData = [];
        /** @type {Map<string, any>} */
        this.nodeMap = new Map(); // id -> node data
        /** @type {Map<string, any>} */
        this.spriteMap = new Map(); // id -> Sprite

        // Labels
        this._labels = new _LabelOverlay(container);

        // Tooltip
        /** @type {HTMLDivElement|null} */
        this._tooltip = document.createElement('div');
        this._tooltip.className = 'constellation-tooltip';
        this._tooltip.style.display = 'none';
        this.container.appendChild(this._tooltip);

        // Loading
        /** @type {HTMLDivElement|null} */
        this._spinner = document.createElement('div');
        this._spinner.className = 'constellation-loading';
        this._spinner.style.display = 'none';
        this.container.appendChild(this._spinner);

        // Events
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerDown = this._onPointerDown.bind(this);
        this._onPointerUp = this._onPointerUp.bind(this);
        this._onDoubleClick = this._onDoubleClick.bind(this);
        this._onWheel = this._onWheel.bind(this);
        this._bindEvents();

        // Start
        this._start();
    }

    // ----------------------------------------------------------------
    // CAMERA
    // ----------------------------------------------------------------

    _setupCamera() {
        if (this.options.mode === '3d') {
            this.camera = new Three.PerspectiveCamera(45, this._width / Math.max(this._height, 1), 1, 2000);
            this.camera.position.set(0, 0, 400);
        } else {
            this.camera = new Three.OrthographicCamera(0, this._width, this._height, 0, 1, 1000);
            this.camera.position.set(this._width / 2, this._height / 2, 100);
            this.camera.lookAt(this._width / 2, this._height / 2, 0);
        }
        this._target = new Three.Vector3(this._width / 2, this._height / 2, 0);
    }

    _updateCamera() {
        if (this.options.mode === '3d') {
            this.camera.aspect = this._width / Math.max(this._height, 1);
        } else {
            const cx = this.camera.position.x;
            const cy = this.camera.position.y;
            const hw = this._width / 2 / this.camera.zoom;
            const hh = this._height / 2 / this.camera.zoom;
            this.camera.left = cx - hw;
            this.camera.right = cx + hw;
            this.camera.top = cy + hh;
            this.camera.bottom = cy - hh;
        }
        this.camera.updateProjectionMatrix();
    }

    // ----------------------------------------------------------------
    // LIFECYCLE
    // ----------------------------------------------------------------

    _start() {
        if (this._running) return;
        this._running = true;
        this._animate();
    }

    _stop() {
        this._running = false;
        if (this._animationId !== null) {
            cancelAnimationFrame(this._animationId);
            this._animationId = null;
        }
    }

    _animate() {
        if (!this._running) return;
        this._animationId = requestAnimationFrame(() => this._animate());

        // Animate dashed edges
        if (this._animatedEdges && this._animatedEdges.length > 0) {
            this._dashOffset -= ANIMATION_SPEED;
            for (const mat of this._animatedEdges) {
                if (mat.dashOffset !== undefined) {
                    mat.dashOffset = this._dashOffset;
                }
            }
            this._needsRender = true;
        }

        if (this._needsRender) {
            this.renderer.render(this.scene, this.camera);
            this._updateLabels();
            this._needsRender = false;
        }
    }

    requestRender() {
        this._needsRender = true;
    }

    /**
     * PERF-G5: Pause animation loop when panel is collapsed/hidden.
     * Safe to call multiple times (idempotent).
     */
    freezeSimulation() {
        if (this._running) {
            this._stop();
        }
    }

    /**
     * PERF-G5: Resume animation loop when panel becomes visible.
     * Safe to call even if already running (idempotent).
     */
    resumeSimulation() {
        if (!this._running) {
            this._running = true;
            this._needsRender = true;
            this._animationId = requestAnimationFrame(() => this._animate());
        }
    }

    // ----------------------------------------------------------------
    // LAYOUT
    // ----------------------------------------------------------------

    /**
     * Recebe nodes/lines no mesmo formato do canvas 2D.
     * @param {Array<Object>} nodes - currentNodes
     * @param {Array<Object>} lines - currentLines
     */
    /**
     * @param {any[]} nodes
     * @param {any[]} lines
     */
    setLayout(nodes: any, lines: any) {
        this.nodeData = nodes || [];
        this.lineData = lines || [];
        this.nodeMap.clear();
        for (const n of this.nodeData) {
            if (n.id) this.nodeMap.set(n.id, n);
        }
        this._rebuild();
    }

    _rebuild() {
        this._disposeSceneObjects();
        this._labels.clear();
        this.spriteMap.clear();
        /** @type {any[]} */
        this._animatedEdges = [];
        this._edgeMap.clear();

        const count = this.nodeData.length;
        this._useLOD = count > LOD_THRESHOLD;

        if (this._useLOD) {
            this._buildLODNodes();
        } else {
            this._buildSprites();
        }

        this._buildEdges();
        this.requestRender();
    }

    _disposeSceneObjects() {
        /** @param {any} wx */
        const disposeObj = (obj: any) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                for (const m of mats) m.dispose();
            }
        };

        while (this.nodesGroup.children.length) {
            const c = this.nodesGroup.children[0];
            disposeObj(c);
            this.nodesGroup.remove(c);
        }
        while (this.edgesGroup.children.length) {
            const c = this.edgesGroup.children[0];
            disposeObj(c);
            this.edgesGroup.remove(c);
        }
        while (this.arrowGroup.children.length) {
            const c = this.arrowGroup.children[0];
            disposeObj(c);
            this.arrowGroup.remove(c);
        }
        while (this.lodGroup.children.length) {
            const c = this.lodGroup.children[0];
            disposeObj(c);
            this.lodGroup.remove(c);
        }
    }

    // ----------------------------------------------------------------
    // NODES - Sprites
    // ----------------------------------------------------------------

    _buildSprites() {
        for (const node of this.nodeData) {
            const shape = _resolveNodeShape(node);
            const color = (FAMILY_COLORS as Record<string, string>)[node.family] || FAMILY_COLORS.default;
            const texture = _getShapeTexture(shape, color);
            const material = new Three.SpriteMaterial({
                map: texture,
                transparent: true,
                opacity: 1,
                depthWrite: false,
            });
            const sprite = new Three.Sprite(material);

            const r = node.radius || 8;
            sprite.scale.set(r * 2.5, r * 2.5, 1);
            sprite.position.set(node.x || 0, this._height - (node.y || 0), (node.level || 0) * 0.5);
            sprite.userData = { nodeId: node.id, node };

            this.nodesGroup.add(sprite);
            this.spriteMap.set(node.id, sprite);

            // Label
            if (node.name && !node.isObservation && (node.level || 0) < 3) {
                this._labels.set(node.id, node.name, 0, 0, { opacity: 1, fontSize: node.level >= 2 ? '7px' : '9px' });
            }
        }
    }

    // ----------------------------------------------------------------
    // NODES - LOD (Points)
    // ----------------------------------------------------------------

    _buildLODNodes() {
        const positions = new Float32Array(this.nodeData.length * 3);
        const colors = new Float32Array(this.nodeData.length * 3);
        const sizes = new Float32Array(this.nodeData.length);

        for (let i = 0; i < this.nodeData.length; i++) {
            const node = this.nodeData[i];
            const ix = i * 3;
            positions[ix] = node.x || 0;
            positions[ix + 1] = this._height - (node.y || 0);
            positions[ix + 2] = (node.level || 0) * 0.5;

            const hex = (FAMILY_COLORS as Record<string, string>)[node.family] || FAMILY_COLORS.default;
            const c = new Three.Color(hex);
            colors[ix] = c.r;
            colors[ix + 1] = c.g;
            colors[ix + 2] = c.b;

            sizes[i] = (node.radius || 8) * 2;
        }

        const geometry = new Three.BufferGeometry();
        geometry.setAttribute('position', new Three.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new Three.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new Three.BufferAttribute(sizes, 1));

        // Circular point texture
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.beginPath();
        ctx.arc(16, 16, 14, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        const tex = new Three.CanvasTexture(canvas);

        const material = new Three.PointsMaterial({
            size: 1,
            vertexColors: true,
            map: tex,
            transparent: true,
            alphaTest: 0.1,
            sizeAttenuation: true,
            depthWrite: false,
        });

        const points = new Three.Points(geometry, material);
        this.lodGroup.add(points);
    }

    // ----------------------------------------------------------------
    // EDGES
    // ----------------------------------------------------------------

    _buildEdges() {
        this._edgeMap.clear();
        for (let i = 0; i < this.lineData.length; i++) {
            const line = this.lineData[i];
            const layer = _resolveEdgeLayer(line);
            const colorHex = _resolveEdgeColor(line);
            const isDeep = (line.level || 0) >= 2;
            const isL3 = line.level === 3;
            const opacity = isL3 ? 0.12 : isDeep ? 0.18 : 0.3;
            const lineWidth = isL3 ? 0.5 : isDeep ? 0.8 : 1.5;

            const fx = line.from?.x ?? 0;
            const fy = this._height - (line.from?.y ?? 0);
            const tx = line.to?.x ?? 0;
            const ty = this._height - (line.to?.y ?? 0);

            const points = [new Three.Vector3(fx, fy, 0), new Three.Vector3(tx, ty, 0)];
            const geometry = new Three.BufferGeometry().setFromPoints(points);

            // Suggested / IA edges → animated dashed
            const isSuggested = line.edge?.isSuggested || line.edge?.aiSuggested;
            const isTemporal = layer === 'z3c';

            let mesh;
            if (isSuggested) {
                const mat = new Three.LineDashedMaterial({
                    color: new Three.Color(colorHex),
                    transparent: true,
                    opacity: 0.6,
                    dashSize: 6,
                    gapSize: 4,
                    linewidth: 1,
                });
                mesh = new Three.Line(geometry, mat);
                mesh.computeLineDistances();
                this.edgesGroup.add(mesh);
                this._animatedEdges.push(mat);
            } else if (layer === 'z3a') {
                // Spatial → dashed
                const mat = new Three.LineDashedMaterial({
                    color: new Three.Color(colorHex),
                    transparent: true,
                    opacity,
                    dashSize: isL3 ? 2 : isDeep ? 3 : 4,
                    gapSize: isL3 ? 3 : isDeep ? 4 : 4,
                    linewidth: lineWidth,
                });
                mesh = new Three.Line(geometry, mat);
                mesh.computeLineDistances();
                this.edgesGroup.add(mesh);
            } else {
                // Solid line
                const mat = new Three.LineBasicMaterial({
                    color: new Three.Color(colorHex),
                    transparent: true,
                    opacity,
                    linewidth: lineWidth,
                });
                mesh = new Three.Line(geometry, mat);
                this.edgesGroup.add(mesh);
            }

            // Register edges for drag updates
            const fromId = line.from?.id || line.edge?.sourceId;
            const toId = line.to?.id || line.edge?.targetId;
            if (fromId) {
                if (!this._edgeMap.has(fromId)) this._edgeMap.set(fromId, []);
                this._edgeMap.get(fromId)?.push({ mesh, pointIndex: 0, lineIndex: i });
            }
            if (toId) {
                if (!this._edgeMap.has(toId)) this._edgeMap.set(toId, []);
                this._edgeMap.get(toId)?.push({ mesh, pointIndex: 1, lineIndex: i });
            }

            // Arrow for temporal edges
            if (isTemporal || line.edge?.type === 'temporal') {
                this._addArrow(fx, fy, tx, ty, colorHex, opacity, isL3);
            }
        }
    }

    /**
     * Update edge geometries connected to a node after drag.
     * @param {string} wx
     * @param {number} wx - world x
     * @param {number} wx - world y
     * @private
     */
    _updateEdgesForNode(nodeId: any, wx: any, wy: any) {
        const edges = this._edgeMap.get(nodeId);
        if (!edges) return;
        for (const { mesh, pointIndex, lineIndex } of edges) {
            const line = this.lineData[lineIndex];
            if (!line) continue;
            // Update lineData coordinates
            if (pointIndex === 0) {
                line.from = { ...line.from, x: wx, y: wy };
            } else {
                line.to = { ...line.to, x: wx, y: wy };
            }
            // Update geometry
            const posAttr = mesh.geometry.attributes.position;
            if (posAttr) {
                const x3 = wx;
                const y3 = this._height - wy;
                posAttr.setXYZ(pointIndex, x3, y3, 0);
                posAttr.needsUpdate = true;
            }
        }
    }

    /**
     * @param {number} fx
     * @param {number} fy
     * @param {number} tx
     * @param {number} ty
     * @param {string} colorHex
     * @param {number} opacity
     * @param {boolean} isSmall
     */
    _addArrow(fx: any, fy: any, tx: any, ty: any, colorHex: any, opacity: any, isSmall: any) {
        const size = isSmall ? 3 : ARROW_SIZE;
        const geometry = new Three.ConeGeometry(size * 0.4, size, 4);
        const material = new Three.MeshBasicMaterial({
            color: new Three.Color(colorHex),
            transparent: true,
            opacity: opacity + 0.2,
            depthWrite: false,
        });
        const arrow = new Three.Mesh(geometry, material);

        const t = 0.65;
        const ax = fx + (tx - fx) * t;
        const ay = fy + (ty - fy) * t;
        arrow.position.set(ax, ay, 0);

        const angle = Math.atan2(ty - fy, tx - fx);
        arrow.rotation.z = -Math.PI / 2 + angle;

        this.arrowGroup.add(arrow);
    }

    // ----------------------------------------------------------------
    // LABELS POSITION UPDATE
    // ----------------------------------------------------------------

    _updateLabels() {
        if (this._useLOD) {
            this._labels.clear();
            return;
        }
        for (const [id, sprite] of this.spriteMap) {
            const pos = sprite.position.clone();
            pos.project(this.camera);
            const x = (pos.x * 0.5 + 0.5) * this._width;
            const y = (-pos.y * 0.5 + 0.5) * this._height;
            const node = this.nodeMap.get(id);
            if (!node) continue;

            const r = (node.radius || 8) * 1.2;
            const display = this._highlighted.size > 0 && !this._highlighted.has(id) ? 'none' : 'block';
            this._labels.set(id, node.name || '', x, y + r + 2, {
                display,
                fontSize: (node.level || 0) >= 2 ? '7px' : '9px',
            });
        }
    }

    // ----------------------------------------------------------------
    // INTERACTION
    // ----------------------------------------------------------------

    _bindEvents() {
        const canvas = this.renderer.domElement;
        canvas.addEventListener('pointermove', this._onPointerMove);
        canvas.addEventListener('pointerdown', this._onPointerDown);
        canvas.addEventListener('pointerup', this._onPointerUp);
        canvas.addEventListener('dblclick', this._onDoubleClick);
        canvas.addEventListener('wheel', this._onWheel, { passive: false });
        canvas.addEventListener('contextmenu', (/** @type {MouseEvent} */ e: any) => e.preventDefault());
    }

    _unbindEvents() {
        const canvas = this.renderer.domElement;
        if (!canvas) return;
        canvas.removeEventListener('pointermove', this._onPointerMove);
        canvas.removeEventListener('pointerdown', this._onPointerDown);
        canvas.removeEventListener('pointerup', this._onPointerUp);
        canvas.removeEventListener('dblclick', this._onDoubleClick);
        canvas.removeEventListener('wheel', this._onWheel);
    }

    /** @param {PointerEvent|MouseEvent} e */
    _getNodeAtEvent(e: any) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        this.mouse.set(mx, my);

        if (this._useLOD) {
            return null;
        }

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.nodesGroup.children, false);
        if (intersects.length > 0) {
            return intersects[0].object.userData?.node || null;
        }
        return null;
    }

    /** @param {PointerEvent|MouseEvent} e */
    _screenToWorld(e: any) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        const vec = new Three.Vector3(ndcX, ndcY, 0).unproject(this.camera);
        return { x: vec.x, y: this._height - vec.y };
    }

    /** @param {PointerEvent} e */
    _onPointerMove(e: any) {
        if (this._panning) {
            const dx = e.clientX - this._lastPointerX;
            const dy = e.clientY - this._lastPointerY;
            const panScale = 1 / this.camera.zoom;
            this.camera.position.x -= dx * panScale;
            this.camera.position.y += dy * panScale;
            this._target.x -= dx * panScale;
            this._target.y += dy * panScale;
            this.camera.lookAt(this._target);
            this._needsRender = true;
        } else if (this._rotating && this.options.mode === '3d') {
            const dx = e.clientX - this._lastPointerX;
            // eslint-disable-next-line
            const dy = e.clientY - this._lastPointerY;
            const rotSpeed = 0.005;
            this.camera.position.x =
                this.camera.position.x * Math.cos(-dx * rotSpeed) - this.camera.position.z * Math.sin(-dx * rotSpeed);
            this.camera.position.z =
                this.camera.position.x * Math.sin(-dx * rotSpeed) + this.camera.position.z * Math.cos(-dx * rotSpeed);
            this.camera.lookAt(this._target);
            this._needsRender = true;
        } else if (this._draggingNodeId) {
            const world = this._screenToWorld(e);
            const node = this.nodeMap.get(this._draggingNodeId);
            if (node) {
                node.x = world.x;
                node.y = world.y;
                const sprite = this.spriteMap.get(this._draggingNodeId);
                if (sprite) {
                    sprite.position.set(world.x, this._height - world.y, 0);
                }
                this._updateEdgesForNode(this._draggingNodeId, world.x, world.y);
                this._needsRender = true;
            }
            const moveDist = Math.hypot(e.clientX - this._dragStartX, e.clientY - this._dragStartY);
            if (moveDist > 3) this._dragHasMoved = true;
        } else {
            const node = this._getNodeAtEvent(e);
            const nodeId = node?.id || null;
            if (this._hoveredNodeId !== nodeId) {
                this._hoveredNodeId = nodeId;
                this._updateHoverState();
                this._needsRender = true;
            }
            if (node && !this._panning && !this._rotating) {
                this._showTooltip(node, e.clientX, e.clientY);
                this.renderer.domElement.style.cursor = 'grab';
            } else {
                this._hideTooltip();
                this.renderer.domElement.style.cursor = this._panning ? 'grabbing' : 'default';
            }
            if (typeof this.options.onNodeHover === 'function') {
                (this.options.onNodeHover as Function)(node);
            }
        }
        this._lastPointerX = e.clientX;
        this._lastPointerY = e.clientY;
    }

    /** @param {PointerEvent} e */
    _onPointerDown(e: any) {
        if (e.button === 1) {
            // Middle click → pan
            this._panning = true;
            this._lastPointerX = e.clientX;
            this._lastPointerY = e.clientY;
            this.renderer.domElement.setPointerCapture(e.pointerId);
        } else if (e.button === 2 && this.options.mode === '3d') {
            // Right click → rotate (3D only)
            this._rotating = true;
            this._lastPointerX = e.clientX;
            this._lastPointerY = e.clientY;
            this.renderer.domElement.setPointerCapture(e.pointerId);
        } else if (e.button === 0) {
            // Left click → start potential drag or select
            const node = this._getNodeAtEvent(e);
            if (node) {
                this._draggingNodeId = node.id;
                this._dragHasMoved = false;
                this._dragStartX = e.clientX;
                this._dragStartY = e.clientY;
                this.renderer.domElement.setPointerCapture(e.pointerId);
                this.renderer.domElement.style.cursor = 'grabbing';
            }
        }
    }

    /** @param {PointerEvent} e */
    _onPointerUp(e: any) {
        this._panning = false;
        this._rotating = false;
        if (this.renderer.domElement.hasPointerCapture(e.pointerId)) {
            this.renderer.domElement.releasePointerCapture(e.pointerId);
        }
        if (this._draggingNodeId) {
            const nodeId = this._draggingNodeId;
            if (!this._dragHasMoved && typeof this.options.onNodeClick === 'function') {
                const node = this.nodeMap.get(nodeId);
                if (node) (this.options.onNodeClick as Function)(nodeId, node);
            }
            this._draggingNodeId = null;
            this._dragHasMoved = false;
            this.renderer.domElement.style.cursor = 'default';
        }
    }

    /** @param {MouseEvent} e */
    _onDoubleClick(e: any) {
        const node = this._getNodeAtEvent(e);
        if (node) {
            this.focusNode(node.id);
            if (typeof this.options.onNodeDoubleClick === 'function') {
                (this.options.onNodeDoubleClick as Function)(node.id, node);
            }
        }
    }

    /** @param {WheelEvent} e */
    _onWheel(e: any) {
        e.preventDefault();
        const zoomSpeed = 0.001;
        const factor = 1 - e.deltaY * zoomSpeed;
        this.camera.zoom = Math.max(0.1, Math.min(10, this.camera.zoom * factor));
        this.camera.updateProjectionMatrix();
        this._needsRender = true;
    }

    _updateHoverState() {
        for (const [id, sprite] of this.spriteMap) {
            const isHovered = id === this._hoveredNodeId;
            const scaleBase = (this.nodeMap.get(id)?.radius || 8) * 2.5;
            const targetScale = isHovered ? scaleBase * 1.2 : scaleBase;
            sprite.scale.set(targetScale, targetScale, 1);
            sprite.material.opacity = this._getNodeOpacity(id);
        }
    }

    /** @param {string} nodeId */
    _getNodeOpacity(nodeId: any) {
        if (this._highlighted.size === 0) return 1;
        return this._highlighted.has(nodeId) ? 1 : 0.15;
    }

    // ----------------------------------------------------------------
    // TOOLTIP
    // ----------------------------------------------------------------

    /**
     * @param {any} node
     * @param {number} clientX
     * @param {number} clientY
     */
    _showTooltip(node: any, clientX: any, clientY: any) {
        if (!this._tooltip) return;
        const rect = this.container.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        this._tooltip.style.left = `${x + 12}px`;
        this._tooltip.style.top = `${y + 12}px`;
        this._tooltip.style.display = 'block';

        const familyLabel = node.family || '';
        const levelLabel = node.level !== undefined ? `L${node.level}` : '';
        const parts = [node.name || node.id];
        if (familyLabel) parts.push(familyLabel);
        if (levelLabel) parts.push(levelLabel);
        if (node.obsCount) parts.push(`${node.obsCount} obs`);
        this._tooltip.textContent = parts.join(' · ');
    }

    _hideTooltip() {
        if (!this._tooltip) return;
        this._tooltip.style.display = 'none';
    }

    // ----------------------------------------------------------------
    // FOCUS + HIGHLIGHT
    // ----------------------------------------------------------------

    /**
     * Move câmera para focar no nó.
     * @param {string} nodeId
     */
    focusNode(nodeId: any) {
        const node = this.nodeMap.get(nodeId);
        if (!node) return;
        const tx = node.x || 0;
        const ty = this._height - (node.y || 0);

        this._target.set(tx, ty, 0);
        this.camera.position.x = tx;
        this.camera.position.y = ty;
        this.camera.lookAt(this._target);
        this._updateCamera();
        this._needsRender = true;

        this._highlight1Hop(nodeId);
    }

    /** @param {string} nodeId */
    _highlight1Hop(nodeId: any) {
        this._highlighted.clear();
        this._highlighted.add(nodeId);

        for (const line of this.lineData) {
            const fromId = line.edge?.sourceId;
            const toId = line.edge?.targetId;
            if (fromId === nodeId) this._highlighted.add(toId);
            if (toId === nodeId) this._highlighted.add(fromId);
        }

        for (const [id, sprite] of this.spriteMap) {
            sprite.material.opacity = this._getNodeOpacity(id);
        }
        for (const edge of this.edgesGroup.children) {
            if (edge.material) edge.material.opacity = 0.08;
        }
        this._needsRender = true;
    }

    resetHighlight() {
        this._highlighted.clear();
        for (const sprite of this.spriteMap.values()) {
            sprite.material.opacity = 1;
        }
        for (const edge of this.edgesGroup.children) {
            if (edge.material) edge.material.opacity = edge.userData?.baseOpacity || 0.3;
        }
        this._needsRender = true;
    }

    // ----------------------------------------------------------------
    // RESIZE
    // ----------------------------------------------------------------

    /**
     * @param {number} width
     * @param {number} height
     */
    resize(width: any, height: any) {
        if (width <= 0 || height <= 0) return;
        this._width = width;
        this._height = height;
        this.renderer.setSize(width, height);
        this._updateCamera();
        this._needsRender = true;
    }

    // ----------------------------------------------------------------
    // LOADING
    // ----------------------------------------------------------------

    showLoading() {
        if (!this._spinner) return;
        this._spinner.style.display = 'block';
    }

    hideLoading() {
        if (!this._spinner) return;
        this._spinner.style.display = 'none';
    }

    // ----------------------------------------------------------------
    // DESTROY
    // ----------------------------------------------------------------

    destroy() {
        this._stop();
        this._unbindEvents();
        this._disposeSceneObjects();
        this._labels.clear();

        if (this._tooltip) {
            this._tooltip.remove();
            this._tooltip = null;
        }
        if (this._spinner) {
            this._spinner.remove();
            this._spinner = null;
        }
        if (this.renderer) {
            this.renderer.dispose();
            if (this.renderer.domElement.parentNode) {
                this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
            }
            this.renderer = null;
        }
        this.scene = null;
        this.camera = null;
    }
}
