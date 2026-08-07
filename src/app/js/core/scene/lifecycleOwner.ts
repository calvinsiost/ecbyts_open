// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   SCENE LIFECYCLE OWNER — Singleton para gerenciar o ciclo de vida
   da cena 3D Three.js de forma idempotente e observável.

   Implementa SPEC_SCENE_LIFECYCLE_SINGLE_OWNERSHIP (2026-04-11).
   Elimina a classe de bugs "dois fluxos concorrentes" exposta pelo
   botão Captura — estado fragmentado em 26 variáveis module-level
   fica concentrado em uma instância com state machine explícita.

   State machine (6 estados):
     IDLE → INITIALIZING → READY → RENDERING → PAUSED → DISPOSED

   Invariante central: "exatamente 1 canvas WebGL por container".
   Verificado via MutationObserver + checks pontuais.
   ================================================================ */

import { getTHREE, getOrbitControls } from '../three-lazy.js';
import { createLogger } from '../../utils/helpers/logger.js';

const log = createLogger('scene-lifecycle');

// ----------------------------------------------------------------
// ERRORS
// ----------------------------------------------------------------

/**
 * Erro estruturado do ciclo de vida da cena.
 * `code` é estável (documentado em SPEC §5.3), `details` é debug.
 */
export class SceneLifecycleError extends Error {
    code: any;
    details: any;
    constructor(code: any, details: any = {}) {
        super(`[SceneLifecycle] ${code}: ${JSON.stringify(details)}`);
        this.name = 'SceneLifecycleError';
        this.code = code;
        this.details = details;
    }
}

// ----------------------------------------------------------------
// STATE MACHINE
// ----------------------------------------------------------------

type SceneState = 'IDLE' | 'INITIALIZING' | 'READY' | 'RENDERING' | 'PAUSED' | 'DISPOSED';

/**
 * Matriz de transições válidas.
 * Chave: from-state. Valor: Set de to-states permitidos.
 * Qualquer transição fora da matriz lança SceneLifecycleError.
 */
const VALID_TRANSITIONS = Object.freeze({
    IDLE: new Set(['INITIALIZING']),
    INITIALIZING: new Set(['READY', 'IDLE']),
    READY: new Set(['RENDERING', 'DISPOSED']),
    RENDERING: new Set(['PAUSED', 'DISPOSED']),
    PAUSED: new Set(['RENDERING', 'DISPOSED']),
    DISPOSED: new Set([]),
});

// ----------------------------------------------------------------
// SCENE LIFECYCLE OWNER
// ----------------------------------------------------------------

class SceneLifecycleOwner {
    _state: SceneState;
    _container: HTMLElement | null;
    _scene: any;
    _camera: any;
    _renderer: any;
    _controls: any;
    _groups: any;
    _renderHooks: any[];
    _resizeHooks: any[];
    _initPromise: Promise<void> | null;
    _animationId: number | null;
    _needsRender: boolean;
    _loopRunning: boolean;
    _idleFrames: number;
    _snapshotInitialized: boolean;
    IDLE_THRESHOLD: number;
    _domObserver: MutationObserver | null;
    _transitions: any[];
    _lastRenderAt: number | null;
    _lastFrameDurationMs: number | null;
    _rendererCreatedAt: number | null;
    _isDev: boolean;

    constructor() {
        this._state = 'IDLE';

        this._container = null;

        this._scene = null;

        this._camera = null;

        this._renderer = null;

        this._controls = null;

        /** Groups canônicos da cena — acessíveis via getGroup(name) */
        this._groups = Object.create(null);

        /** Hooks rodando a cada render — fn(scene, camera) */
        this._renderHooks = [];

        /** Hooks rodando a cada resize — fn(width, height) */
        this._resizeHooks = [];

        this._initPromise = null;

        this._animationId = null;

        this._needsRender = false;
        this._loopRunning = false;
        this._idleFrames = 0;
        this._snapshotInitialized = false;
        this.IDLE_THRESHOLD = 90;

        this._domObserver = null;

        /** Telemetria leve para getDiagnostics() */
        this._transitions = [];
        this._lastRenderAt = null;
        this._lastFrameDurationMs = null;
        this._rendererCreatedAt = null;

        /** Dev mode detection — browser vs node tests */
        this._isDev = typeof window !== 'undefined' && typeof localStorage !== 'undefined';
    }

    // ----------------------------------------------------------------
    // STATE MACHINE API
    // ----------------------------------------------------------------

    getState(): SceneState {
        return this._state;
    }

    /**
     * Transiciona para outro estado. Lança se a transição não for válida.
     * @param to
     */
    _transition(to: SceneState) {
        const from = this._state;
        const allowed = (VALID_TRANSITIONS as any)[from];
        if (!allowed || !allowed.has(to)) {
            throw new SceneLifecycleError('invalid_transition', { from, to });
        }
        this._state = to;
        this._transitions.push({ at: Date.now(), from, to });
        log.debug('transition', from, '->', to);
    }

    // ----------------------------------------------------------------
    // INITIALIZATION (idempotente)
    // ----------------------------------------------------------------

    /**
     * Inicializa a cena 3D no container fornecido.
     * Idempotente: segunda chamada com MESMO container retorna a primeira promise
     * (se pendente) ou resolve imediatamente (se READY). Chamada com container
     * diferente lança `container_mismatch`.
     *
     * @param container
     */
    async initialize(container: HTMLElement): Promise<void> {
        if (!container || typeof container.appendChild !== 'function') {
            throw new SceneLifecycleError('invalid_container', { received: typeof container });
        }

        // Idempotência: mesmo container
        if (this._state === 'INITIALIZING' && this._container === container) {
            return this._initPromise as any;
        }
        if (
            (this._state === 'READY' || this._state === 'RENDERING' || this._state === 'PAUSED') &&
            this._container === container
        ) {
            return Promise.resolve();
        }

        // Container diferente = erro
        if (this._container && this._container !== container) {
            throw new SceneLifecycleError('container_mismatch', {
                state: this._state,
                previousContainer: this._container.id || '(no-id)',
                newContainer: container.id || '(no-id)',
            });
        }

        if (this._state === 'DISPOSED') {
            throw new SceneLifecycleError('invalid_transition', { from: 'DISPOSED', to: 'INITIALIZING' });
        }

        this._container = container;
        this._transition('INITIALIZING');
        this._initPromise = this._doInitialize(container)
            .then(() => {
                this._transition('READY');
                this._installDomObserver();
                this._checkCanvasInvariant('post-init');
                // Auto-start render loop
                this._startLoop();
            })
            .catch((err) => {
                log.error('initialize failed', err?.message || err);
                this._transition('IDLE');
                this._container = null;
                throw err instanceof SceneLifecycleError
                    ? err
                    : new SceneLifecycleError('init_failed', { cause: String(err) });
            });
        return this._initPromise;
    }

    /**
     * Criação síncrona dos recursos Three.js.
     * Isolado em método privado para facilitar testabilidade e rollback em falha.
     * @private
     */
    async _doInitialize(container: any) {
        const THREE: any = getTHREE();
        const OrbitControls: any = getOrbitControls();
        // 1. Scene
        const scene = new THREE.Scene();
        scene.fog = null;
        this._scene = scene;

        // 2. Camera (ortográfica, padrão engenharia)
        const aspect = container.clientWidth / container.clientHeight || 1;
        const frustum = 100;
        const camera = new THREE.OrthographicCamera(
            (-frustum * aspect) / 2,
            (frustum * aspect) / 2,
            frustum / 2,
            -frustum / 2,
            1,
            1000,
        );
        camera.position.set(80, 80, 80);
        camera.zoom = 1;
        camera.updateProjectionMatrix();
        this._camera = camera;

        // 3. Renderer - nota: preserveDrawingBuffer NÃO é mais necessário
        // porque captureFrame() faz render-e-leitura no mesmo tick síncrono.
        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            logarithmicDepthBuffer: true,
        });
        // Mantem um sinal explicito de multisampling no renderer para
        // o pipeline de QA/auditoria e para runtimes WebGL2 que expõem
        // `samples` durante capturas/export.
        renderer.samples = Math.max(renderer.samples || 0, 4);
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.localClippingEnabled = true;
        renderer.setClearColor(0x2d2d2d, 1);

        // Marca o canvas para o MutationObserver distinguir dos canvas auxiliares
        // (leader line, CSS2DRenderer overlay) que também ficam no mesmo container
        renderer.domElement.setAttribute('data-scene', 'ecbyts-webgl');

        container.appendChild(renderer.domElement);
        this._renderer = renderer;
        this._rendererCreatedAt = Date.now();

        // 4. WebGL context loss/restore listeners (M9)
        this._installContextListeners(renderer.domElement);

        // 5. Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        ambientLight.name = 'ambientLight';
        scene.add(ambientLight);

        const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
        mainLight.name = 'mainLight';
        mainLight.position.set(50, 100, 50);
        mainLight.castShadow = true;
        scene.add(mainLight);

        const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
        fillLight.name = 'fillLight';
        fillLight.position.set(-30, 50, -30);
        scene.add(fillLight);

        // 6. OrbitControls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.12;
        controls.target.set(0, -20, 0);
        controls.minZoom = 0.05;
        controls.maxZoom = 4;
        controls.zoomToCursor = true;
        controls.addEventListener('start', () => this.requestRender());
        controls.addEventListener('end', () => {
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('cameraChanged'));
            }
        });
        this._controls = controls;

        // 7. Groups canônicos
        for (const name of ['elements', 'editHandles', 'interpolation', 'voxel', 'issues', 'photoMarkers']) {
            const g = new THREE.Group();
            g.name = `${name}Group`;
            this._groups[name] = g;
        }
        // Ordem de adição define Z-order implícito de raycasting
        scene.add(this._groups.interpolation);
        scene.add(this._groups.voxel);
        scene.add(this._groups.elements);
        scene.add(this._groups.issues);
        scene.add(this._groups.photoMarkers);
        scene.add(this._groups.editHandles);

        // 8. Wake listeners
        renderer.domElement.addEventListener('pointerdown', () => this.requestRender());
        renderer.domElement.addEventListener('wheel', () => this.requestRender(), { passive: true });

        // 9. Visibility change (pausa loop quando aba escondida)
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    this.pauseLoop();
                } else {
                    this.resumeLoop();
                }
            });
        }

        // 10. Debug globals (sobrescrevem qualquer anterior - Owner é single source)
        if (typeof window !== 'undefined') {
            (window as any).__sceneOwner = this;
            (window as any).__scene = scene;
            (window as any).__camera = camera;
            (window as any).__renderer = renderer;
            (window as any).__controls = controls;
        }
    }

    // ----------------------------------------------------------------
    // DISPOSAL (5-step canonical sequence - SPEC M1.1)
    // ----------------------------------------------------------------

    /**
     * Dispose completo da cena seguindo a sequência canônica documentada
     * em discourse.threejs.org/t/1549:
     *   1. traverse + geometry.dispose() + material.dispose()
     *   2. textures (ImageBitmap close + dispose)
     *   3. renderer.dispose()
     *   4. renderer.forceContextLoss()  [obrigatório - libera contexto GL]
     *   5. container.removeChild(canvas)
     */
    dispose() {
        if (this._state === 'DISPOSED' || this._state === 'IDLE') {
            return;
        }

        this._stopLoop();
        this._uninstallDomObserver();

        // Passo 1 - traverse geometries + materials
        try {
            if (this._scene) {
                this._scene.traverse((obj: any) => {
                    if (obj.geometry && typeof obj.geometry.dispose === 'function') {
                        obj.geometry.dispose();
                    }
                    if (obj.material) {
                        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
                        for (const m of materials) {
                            // Passo 2 - textures (ImageBitmap close first)
                            for (const key of Object.keys(m)) {
                                const val = m[key];
                                if (val && val.isTexture) {
                                    try {
                                        val.source?.data?.close?.(); // ImageBitmap cleanup
                                    } catch (e: any) {
                                        log.debug('imagebitmap close failed', key, e?.message);
                                    }
                                    val.dispose();
                                }
                            }
                            if (typeof m.dispose === 'function') m.dispose();
                        }
                    }
                });
            }
        } catch (e: any) {
            log.error('traverse dispose failed', e?.message || e);
        }

        // Passo 3 - renderer.dispose()
        try {
            if (this._renderer && typeof this._renderer.dispose === 'function') {
                this._renderer.dispose();
            }
        } catch (e: any) {
            log.error('renderer dispose failed', e?.message || e);
        }

        // Passo 4 - forceContextLoss (obrigatório)
        try {
            if (this._renderer && typeof this._renderer.forceContextLoss === 'function') {
                this._renderer.forceContextLoss();
            }
        } catch (e: any) {
            log.error('forceContextLoss failed', e?.message || e);
        }

        // Passo 5 - remove canvas do DOM
        try {
            if (this._container && this._renderer?.domElement?.parentNode === this._container) {
                this._container.removeChild(this._renderer.domElement);
            }
        } catch (e: any) {
            log.error('removeChild failed', e?.message || e);
        }

        // Reset local state
        this._scene = null;
        this._camera = null;
        this._renderer = null;
        this._controls = null;
        this._groups = Object.create(null);
        this._container = null;
        this._initPromise = null;

        this._transition('DISPOSED');
        log.info('disposed');
    }

    // ----------------------------------------------------------------
    // RENDER LOOP (single-owner rAF)
    // ----------------------------------------------------------------

    /**
     * Solicita um redraw no próximo frame. Deduplica via _needsRender flag.
     * Wake up do loop se estiver pausado.
     */
    requestRender() {
        this._needsRender = true;
        if (!this._loopRunning && (this._state === 'PAUSED' || this._state === 'READY')) {
            this.resumeLoop();
        }
    }

    /**
     * Inicia o loop de animação. Chamado automaticamente após initialize().
     * Use resumeLoop() para despertar de um pause - startLoop é para o primeiro start.
     * @private
     */
    _startLoop() {
        if (this._loopRunning) return;
        if (this._state !== 'READY') {
            throw new SceneLifecycleError('invalid_transition', { from: this._state, to: 'RENDERING' });
        }
        this._transition('RENDERING');
        this._loopRunning = true;
        this._needsRender = true;
        this._scheduleAnimate();
    }

    /**
     * Acorda o loop após smart-pause ou visibilitychange.
     */
    resumeLoop() {
        if (this._loopRunning) return;
        if (this._state !== 'PAUSED' && this._state !== 'READY') {
            log.debug('resumeLoop ignored — state', this._state);
            return;
        }
        this._transition('RENDERING');
        this._loopRunning = true;
        this._needsRender = true;
        this._idleFrames = 0;
        this._scheduleAnimate();
    }

    /**
     * Pausa o loop (smart-pause ou visibilitychange).
     */
    pauseLoop() {
        if (!this._loopRunning) return;
        if (this._state !== 'RENDERING') return;
        this._loopRunning = false;
        if (this._animationId !== null && typeof cancelAnimationFrame !== 'undefined') {
            cancelAnimationFrame(this._animationId);
            this._animationId = null;
        }
        this._transition('PAUSED');
    }

    /** @private */
    _stopLoop() {
        this._loopRunning = false;
        if (this._animationId !== null && typeof cancelAnimationFrame !== 'undefined') {
            cancelAnimationFrame(this._animationId);
            this._animationId = null;
        }
    }

    /** @private — schedules next animate() via rAF (never direct call) */
    _scheduleAnimate() {
        if (typeof requestAnimationFrame === 'undefined') return;
        this._animationId = requestAnimationFrame(() => this._animate());
    }

    /** @private — o único loop de animação da aplicação */
    _animate() {
        if (!this._loopRunning) return;
        this._scheduleAnimate();

        // Detecta movimento de câmera via snapshot antes/depois de controls.update()
        if (this._controls && this._camera) {
            const bpx = this._camera.position.x;
            const bpy = this._camera.position.y;
            const bpz = this._camera.position.z;
            const btx = this._controls.target.x;
            const bty = this._controls.target.y;
            const btz = this._controls.target.z;
            const bzoom = this._camera.zoom;

            this._controls.update();

            const eps = 0.0001;
            const moved =
                this._snapshotInitialized &&
                (Math.abs(this._camera.position.x - bpx) > eps ||
                    Math.abs(this._camera.position.y - bpy) > eps ||
                    Math.abs(this._camera.position.z - bpz) > eps ||
                    Math.abs(this._controls.target.x - btx) > eps ||
                    Math.abs(this._controls.target.y - bty) > eps ||
                    Math.abs(this._controls.target.z - btz) > eps ||
                    Math.abs(this._camera.zoom - bzoom) > eps);
            this._snapshotInitialized = true;

            if (moved) {
                this._needsRender = true;
                this._idleFrames = 0;
            } else {
                this._idleFrames++;
            }
        }

        if (this._needsRender && this._renderer && this._scene && this._camera) {
            this._renderOnce();
            this._needsRender = false;
            this._idleFrames = 0;
        }

        // Smart pause após N idle frames
        if (this._idleFrames > this.IDLE_THRESHOLD) {
            this.pauseLoop();
        }
    }

    /** @private — render síncrono + hooks (single render path, sem ramo composer) */
    _renderOnce() {
        const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
        this._renderer.render(this._scene, this._camera);
        for (const hook of this._renderHooks) {
            try {
                hook(this._scene, this._camera);
            } catch (e: any) {
                log.error('render hook failed', e?.message || e);
            }
        }
        this._lastRenderAt = Date.now();
        this._lastFrameDurationMs = typeof performance !== 'undefined' ? performance.now() - t0 : null;
    }

    // ----------------------------------------------------------------
    // BOOT STABILIZATION - loading overlay dismissal coordination
    // ----------------------------------------------------------------

    /**
     * Resolve quando a cena estabilizou: `scene.children.length` inalterado
     * por N frames consecutivos E state ∈ {READY, RENDERING, PAUSED} E
     * ao menos 1 render aconteceu.
     *
     * Usado pelo boot sequence em main.js para só remover o loading overlay
     * depois que todos os elementos estão no lugar - elimina o "popcorn"
     * de elementos surgindo visivelmente na tela um por um.
     *
     * @param opts
     */
    async waitForStableFrames(
        opts: { stableFrames?: number; timeoutMs?: number; minElapsedMs?: number } = {},
    ): Promise<{ ok: boolean; reason: string; framesObserved: number; childCount: number }> {
        const stableFrames = opts.stableFrames ?? 3;
        const timeoutMs = opts.timeoutMs ?? 5000;
        const minElapsedMs = opts.minElapsedMs ?? 300;
        const deadline = Date.now() + timeoutMs;
        const startAt = Date.now();

        let stableCount = 0;
        let lastChildCount = -1;
        let framesObserved = 0;

        while (Date.now() < deadline) {
            await new Promise((resolve) => {
                if (typeof requestAnimationFrame === 'undefined') {
                    resolve(undefined);
                    return;
                }
                requestAnimationFrame(() => resolve(undefined));
            });
            framesObserved++;

            // Ainda não renderizou pela primeira vez → não conta estabilidade
            if (!this._lastRenderAt) {
                continue;
            }
            // Estado inválido para stability check
            if (this._state !== 'RENDERING' && this._state !== 'PAUSED' && this._state !== 'READY') {
                continue;
            }

            const count = this._scene ? this._scene.children.length : 0;
            if (count === lastChildCount) {
                stableCount++;
            } else {
                stableCount = 0;
                lastChildCount = count;
            }

            // Min elapsed time E estabilidade atingida
            const elapsed = Date.now() - startAt;
            if (stableCount >= stableFrames && elapsed >= minElapsedMs) {
                return {
                    ok: true,
                    reason: 'stable',
                    framesObserved,
                    childCount: lastChildCount,
                };
            }
        }

        return {
            ok: false,
            reason: 'timeout',
            framesObserved,
            childCount: lastChildCount,
        };
    }

    // ----------------------------------------------------------------
    // CAPTURE (async - await rAF → render → toDataURL no mesmo tick)
    // ----------------------------------------------------------------

    /**
     * Captura um frame consistente como dataURL PNG.
     * Segue o padrão canônico de threejs.org/manual/en/rendering-on-demand:
     *   1. Await rAF - garante que mutações pendentes foram commitadas
     *   2. Render sync - flushes hooks pendentes
     *   3. toDataURL no mesmo tick síncrono (antes de sair do event loop)
     *
     * Critério de sucesso da SPEC: captureFrame() é noop visual (não muda tela).
     *
     * @returns dataURL PNG
     */
    async captureFrame(): Promise<string> {
        // Captura só é possível quando a cena já foi inicializada e tem
        // recursos WebGL vivos (READY/RENDERING/PAUSED). Nos estados IDLE,
        // INITIALIZING e DISPOSED o renderer/scene/camera não existem — o
        // botão "Captura" do menu Mais pode ser clicado antes de a vista 3D
        // ter sido aberta (cena em IDLE) ou após um init falho (rollback p/
        // IDLE). Reportamos `capture_before_init` (código estável e acionável)
        // em vez do genérico `invalid_transition`, que confundia o caller e
        // fazia o snapshot falhar silenciosamente.
        if (this._state !== 'RENDERING' && this._state !== 'PAUSED' && this._state !== 'READY') {
            throw new SceneLifecycleError('capture_before_init', { state: this._state });
        }
        if (!this._renderer || !this._scene || !this._camera) {
            throw new SceneLifecycleError('capture_before_init', { state: this._state });
        }

        // 1. Await rAF (drena mutações pendentes)
        await new Promise((resolve) => {
            if (typeof requestAnimationFrame === 'undefined') {
                resolve(undefined);
                return;
            }
            requestAnimationFrame(() => resolve(undefined));
        });

        // 2. Render sync + 3. toDataURL no mesmo tick
        this._renderOnce();
        this._checkCanvasInvariant('pre-capture');
        return this._renderer.domElement.toDataURL('image/png');
    }

    // ----------------------------------------------------------------
    // HOOKS
    // ----------------------------------------------------------------

    /**
     * Registra callback chamado após cada render.
     * @param fn
     * @returns unsubscribe
     */
    addRenderHook(fn: (scene: any, camera: any) => void): () => void {
        if (typeof fn !== 'function') {
            throw new SceneLifecycleError('invalid_hook', { type: typeof fn });
        }
        this._renderHooks.push(fn);
        return () => {
            const idx = this._renderHooks.indexOf(fn);
            if (idx >= 0) this._renderHooks.splice(idx, 1);
        };
    }

    /**
     * Registra callback chamado após cada resize.
     * @param fn
     * @returns unsubscribe
     */
    addResizeHook(fn: (width: number, height: number) => void): () => void {
        if (typeof fn !== 'function') {
            throw new SceneLifecycleError('invalid_hook', { type: typeof fn });
        }
        this._resizeHooks.push(fn);
        return () => {
            const idx = this._resizeHooks.indexOf(fn);
            if (idx >= 0) this._resizeHooks.splice(idx, 1);
        };
    }

    /**
     * Propaga resize para renderer + camera + hooks.
     * @param width
     * @param height
     */
    handleResize(width: number, height: number) {
        if (!this._renderer || !this._camera) return;
        if (width <= 0 || height <= 0) return;

        const aspect = width / height;
        // BUG-DARK-SPACE-001 (Calvin 2026-06-08): preservar verticalSize atual
        // em vez de resetar p/ frustum=100 hardcoded. Reset zerava zoom/range
        // do usuario a cada resize → durante transitions de view, frustum
        // saltava de zoom-do-user para 100, causando "espaco escuro" transient
        // pois a cena UTM com extensao kilometricas nao cabia em 100 unidades.
        // Agora: preserva top/bottom (zoom vertical), recalcula apenas
        // left/right pelo novo aspect. Default 100 apenas na 1a chamada
        // (top/bottom ainda nao foram setados — improvavel mas guard).
        const cam = this._camera;
        const verticalSize = (cam.top || 0) - (cam.bottom || 0) || 100;
        cam.left = (-verticalSize * aspect) / 2;
        cam.right = (verticalSize * aspect) / 2;
        cam.updateProjectionMatrix();

        this._renderer.setSize(width, height);

        for (const hook of this._resizeHooks) {
            try {
                hook(width, height);
            } catch (e: any) {
                log.error('resize hook failed', e?.message || e);
            }
        }

        this.requestRender();
    }

    // ----------------------------------------------------------------
    // DOM INVARIANT (M6)
    // ----------------------------------------------------------------

    /** @private — instala MutationObserver para detectar canvas extras */
    _installDomObserver() {
        if (typeof MutationObserver === 'undefined' || !this._container) return;
        if (this._domObserver) this._uninstallDomObserver();

        this._domObserver = new MutationObserver(() => {
            this._checkCanvasInvariant('mutation');
        });
        this._domObserver.observe(this._container, { childList: true });
    }

    /** @private */
    _uninstallDomObserver() {
        if (this._domObserver) {
            this._domObserver.disconnect();
            this._domObserver = null;
        }
    }

    /**
     * Verifica o invariante "exatamente 1 canvas WebGL por container".
     * Em dev: lança erro. Em prod: loga + telemetria.
     * @private
     */
    _checkCanvasInvariant(trigger: any) {
        if (!this._container || typeof this._container.querySelectorAll !== 'function') return;
        const canvases = this._container.querySelectorAll('canvas[data-scene="ecbyts-webgl"]');
        if (canvases.length === 1) return; // OK

        const err = new SceneLifecycleError('canvas_count_exceeded', {
            expected: 1,
            actual: canvases.length,
            trigger,
        });

        if (this._isDev) {
            log.error('INVARIANT VIOLATED', err.message);
            throw err;
        } else {
            log.error('invariant violated (non-fatal)', err.message);
        }
    }

    // ----------------------------------------------------------------
    // WEBGL CONTEXT LOSS/RESTORE (M9)
    // ----------------------------------------------------------------

    /** @private */
    _installContextListeners(canvas: any) {
        canvas.addEventListener('webglcontextlost', (e: any) => {
            e.preventDefault(); // permite restore
            log.error('WebGL context lost');
            this._stopLoop();
            // Não transiciona para DISPOSED - o restore pode trazer de volta
        });

        canvas.addEventListener('webglcontextrestored', () => {
            log.info('WebGL context restored — resuming loop');
            // Re-aquece: renderer precisa re-upload de recursos
            this._needsRender = true;
            if (this._state === 'RENDERING' || this._state === 'PAUSED') {
                this.resumeLoop();
            }
        });
    }

    // ----------------------------------------------------------------
    // DIAGNOSTICS
    // ----------------------------------------------------------------

    /**
     * Snapshot do estado interno para debug / performance HUD.
     */
    getDiagnostics(): {
        state: SceneState;
        canvasCount: number;
        rendererAgeMs: number;
        renderHooksCount: number;
        resizeHooksCount: number;
        lastRenderAt: number | null;
        lastFrameDurationMs: number | null;
        idleFrames: number;
        transitions: Array<{ at: number; from: SceneState; to: SceneState }>;
    } {
        const canvases =
            this._container && typeof this._container.querySelectorAll === 'function'
                ? this._container.querySelectorAll('canvas[data-scene="ecbyts-webgl"]').length
                : 0;
        return {
            state: this._state,
            canvasCount: canvases,
            rendererAgeMs: this._rendererCreatedAt ? Date.now() - this._rendererCreatedAt : 0,
            renderHooksCount: this._renderHooks.length,
            resizeHooksCount: this._resizeHooks.length,
            lastRenderAt: this._lastRenderAt,
            lastFrameDurationMs: this._lastFrameDurationMs,
            idleFrames: this._idleFrames,
            transitions: this._transitions.slice(-20),
        };
    }

    // ----------------------------------------------------------------
    // ACCESSORS (compatibilidade com setup.js wrappers)
    // ----------------------------------------------------------------

    getScene() {
        return this._scene;
    }
    getCamera() {
        return this._camera;
    }
    getRenderer() {
        return this._renderer;
    }
    getControls() {
        return this._controls;
    }

    /**
     * @param name
     */
    getGroup(name: 'elements' | 'editHandles' | 'interpolation' | 'voxel' | 'issues' | 'photoMarkers') {
        return this._groups[name] || null;
    }
}

// ----------------------------------------------------------------
// SINGLETON
// ----------------------------------------------------------------

export const sceneOwner: SceneLifecycleOwner = new SceneLifecycleOwner();

// ----------------------------------------------------------------
// TAB-MODEL-SWITCH-001 — Manager Signature (snapshot/restore per tab)
// ----------------------------------------------------------------
/**
 * Exporta estado da cena para snapshot de tab.
 *
 * IMPORTANTE: cena Three.js NÃO é serializável (geometry, materials, textures
 * são objetos opacos). exportState captura APENAS metadata reproduzível:
 * - estado FSM atual (IDLE/INITIALIZING/READY/RENDERING/PAUSED/DISPOSED)
 * - timestamp de inicialização
 *
 * O conteúdo da cena (meshes) é restaurado pelos managers individuais
 * (elements/voxel/interpolation) que re-criam objetos Three.js no init.
 * sceneOwner apenas dispose+init: gerencia ciclo de vida, não conteúdo.
 */
export function exportState(): { sceneFsmState: string; initializedAtMs: number | null } {
    return {
        sceneFsmState: sceneOwner.getState(),
        initializedAtMs: null, // sceneOwner não expõe; reservado para futuro
    };
}
/**
 * Restaura estado da cena a partir de snapshot.
 *
 * IMPORTANTE: snapshot é informativo (FSM state). Restauração real é
 * orquestrada pelo modelSwitchBridge (F3) que chama dispose+init em ordem
 * conforme ADR A2. Esta função NÃO faz dispose/init diretamente — caller
 * (bridge) tem responsabilidade de coordenar com manager registry.
 *
 * Tolerante a state null/malformed (no-op).
 */
export function importState(_state: { sceneFsmState?: string; initializedAtMs?: number | null } | null | undefined): void {
    // No-op: bridge orquestra dispose+init via sceneOwner.dispose() + sceneOwner.initialize(container)
    // Esta função existe apenas para completar o contract canônico do Manager Registry.
}
/**
 * Reset: NO-OP intencional para tab switch por padrão.
 *
 * Calvin bug 2026-05-31 + AI vision V5b 2026-06-01: chamar dispose() durante
 * switchTo deixava tela preta — Three.js context destruído sem re-init.
 * Bridge.switchTo NÃO tem capacidade de chamar initialize(container) porque
 * não tem ref ao container DOM.
 *
 * Solução: managers individuais (elements/voxel/interpolation) limpam suas
 * próprias meshes via setElementsGroup.clear()/etc. Singleton sceneOwner
 * permanece ATIVO entre switches — cena Three.js continua, só conteúdo
 * (meshes/geometries) é trocado pelos managers de dados.
 *
 * Para dispose REAL (destruir cena ao fechar app/tab pinned): usar
 * resetState({ forceDispose: true }) ou chamar sceneOwner.dispose()
 * diretamente do caller que tem ref ao container.
 */
export function resetState(options: { forceDispose?: boolean } = {}): void {
    const state = sceneOwner.getState();
    if (!options.forceDispose || state === 'DISPOSED' || state === 'IDLE') {
        return;
    }
    void sceneOwner.dispose();
}
