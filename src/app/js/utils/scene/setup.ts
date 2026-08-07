// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   CONFIGURACAO DA CENA 3D — thin wrappers sobre SceneLifecycleOwner

   2026-04-11 REFACTOR (SPEC_SCENE_LIFECYCLE §M3):
   Este arquivo era a fonte de todo o estado 3D (26 let module-level,
   init não-idempotente, render loop próprio). Agora é uma camada de
   compatibilidade fina — cada export encaminha para `sceneOwner`
   importado de `core/scene/lifecycleOwner.js`.

   NENHUMA assinatura externa mudou. 12 módulos downstream continuam
   importando e usando as mesmas funções sem modificação.

   Post-processing (_composer, _outlinePass) e quality tiers continuam
   aqui localmente porque são S1/P2 no SPEC (não fazem parte do P1).
   ================================================================ */
import { getTHREE } from '../../core/three-lazy.js';
import { sceneOwner } from '../../core/scene/lifecycleOwner.js';
import { CONFIG } from '../../config.js';
// ----------------------------------------------------------------
// LOCAL STATE - só post-processing e quality tier helpers (S1 deferred)
// ----------------------------------------------------------------
let _composer: any = null;
let _outlinePass: any = null;
let _bloomPass: any = null;
let _outputPass: any = null;
let _postProcessingEnabled = true;
let _lastModelExtent = 200;
let _resizePendingSceneWarned = false;
const LAYOUT_RESIZE_SYNC_DELAY_MS = 220;
// ----------------------------------------------------------------
// HOOKS - forward para sceneOwner
// ----------------------------------------------------------------
/**
 * Registra callback chamado apos cada render frame: fn(scene, camera)
 * @param {fn} fn
 */
export function addRenderHook(fn: any) {
    return sceneOwner.addRenderHook(fn);
}
/**
 * Registra callback chamado apos resize: fn(width, height)
 * @param {fn} fn
 */
export function addResizeHook(fn: any) {
    return sceneOwner.addResizeHook(fn);
}
// ----------------------------------------------------------------
// MODEL EXTENT - helper local (não é estado da cena, é do controls)
// ----------------------------------------------------------------
/**
 * Define extent do modelo para calculo dinamico de near/far.
 * Chamado por controls.js ao posicionar a camera.
 * @param {number} extent
 */
export function setModelExtent(extent: any) {
    _lastModelExtent = extent;
    // Mantido para backward compat - lifecycleOwner não usa este valor
    // porque recalcula near/far via _syncNearFar interno (owner tem seu próprio).
}
// ----------------------------------------------------------------
// INIT - fire-and-forget para sceneOwner
// ----------------------------------------------------------------
/**
 * Inicializa toda a estrutura 3D.
 * Deve ser chamada uma vez quando a aplicacao inicia.
 *
 * 2026-04-11: agora delega para `sceneOwner.initialize(container)`.
 * A chamada é sync do ponto de vista do caller, mas internamente dispara
 * uma promise que completa o ciclo (transição para RENDERING + startLoop).
 * O corpo de criação dos objetos Three.js em lifecycleOwner é 100% sync
 * antes de qualquer await, então getScene/getCamera/getRenderer/etc.
 * funcionam imediatamente após initScene() retornar.
 *
 * Se chamada 2× com o mesmo container, o owner retorna a primeira promise
 * e NÃO cria um segundo canvas (elimina o bug de dois canvases empilhados).
 *
 * @param {HTMLElement} container
 * @returns {Object} - Objetos criados (compat com uso legado)
 */
export function initScene(container: any) {
    // Fire promise - sceneOwner cria os objetos sincronamente, .then() agenda startLoop
    sceneOwner.initialize(container).catch((err) => {
        // Log estruturado - não silenciar (M8)
        console.debug('[ecbyts:setup.js] sceneOwner.initialize failed:', err?.message || err);
    });
    // Getters do owner já funcionam porque _doInitialize roda sync até o primeiro await (não tem)
    return {
        scene: sceneOwner.getScene(),
        camera: sceneOwner.getCamera(),
        renderer: sceneOwner.getRenderer(),
        controls: sceneOwner.getControls(),
        elementsGroup: sceneOwner.getGroup('elements'),
    };
}
// ----------------------------------------------------------------
// GETTERS - forward para sceneOwner
// ----------------------------------------------------------------
/** @returns {any} */
export function getScene() {
    return sceneOwner.getScene();
}
/** @returns {any} */
export function getCamera() {
    return sceneOwner.getCamera();
}
/** @returns {any} */
export function getRenderer() {
    return sceneOwner.getRenderer();
}
// ----------------------------------------------------------------
// RENDER LOOP - forward para sceneOwner (restaurado: migração dropou
// estes exports públicos → 23 importadores quebraram em runtime)
// ----------------------------------------------------------------
/** Solicita redesenho no próximo frame. */
export function requestRender() {
    sceneOwner.requestRender();
}
/** Acorda o loop se pausado. */
export function wakeRenderLoop() {
    sceneOwner.resumeLoop();
}
/** @returns {import('three/addons/controls/OrbitControls.js' as string).OrbitControls} */
export function getControls() {
    return sceneOwner.getControls();
}
/** @returns {any} */
export function getElementsGroup() {
    return sceneOwner.getGroup('elements');
}
/** @returns {any} */
export function getEditHandlesGroup() {
    return sceneOwner.getGroup('editHandles');
}
/** @returns {any} */
export function getInterpolationGroup() {
    return sceneOwner.getGroup('interpolation');
}
/** @returns {any} */
export function getVoxelGroup() {
    return sceneOwner.getGroup('voxel');
}
/** @returns {any} */
export function getIssuesGroup() {
    return sceneOwner.getGroup('issues');
}
/** @returns {any} */
export function getPhotoMarkersGroup() {
    return sceneOwner.getGroup('photoMarkers');
}
// ----------------------------------------------------------------
// QUALITY TIERS - mantido local (S1 pode migrar depois)
// ----------------------------------------------------------------
/**
 * Aplica um tier de qualidade ao renderer (Low/Medium/High).
 * @param {string} tierName - 'LOW' | 'MEDIUM' | 'HIGH'
 */
export function applyQualityTier(tierName: any) {
    const THREE: any = getTHREE();
    const tier = (CONFIG as any).QUALITY_TIERS?.[tierName];
    const renderer = sceneOwner.getRenderer();
    if (!tier || !renderer) return;
    renderer.setPixelRatio(tier.pixelRatio);
    renderer.shadowMap.enabled = tier.shadows;
    if (tier.shadows && tier.shadowMapType) {
        renderer.shadowMap.type = (THREE as any)[tier.shadowMapType] ?? THREE.PCFSoftShadowMap;
        renderer.shadowMap.needsUpdate = true;
    }
    _postProcessingEnabled = tier.postProcessing && (CONFIG as any).POST_PROCESSING?.ENABLED;
    if (_bloomPass) {
        _bloomPass.enabled = _postProcessingEnabled && tierName !== 'LOW';
    }
    try {
        localStorage.setItem('ecbyts-quality-tier', tierName);
    } catch (err: any) {
        // Quota cheia - não crítico, mantém tier só em memória
        console.debug('[ecbyts:setup.js] quality tier persist failed:', err?.message || err);
    }
    sceneOwner.requestRender();
}
/** @returns {string} */
export function getCurrentQualityTier() {
    try {
        return localStorage.getItem('ecbyts-quality-tier') || 'HIGH';
    } catch (err: any) {
        console.debug('[ecbyts:setup.js] quality tier read failed:', err?.message || err);
        return 'HIGH';
    }
}
// ----------------------------------------------------------------
// OUTLINE SELECTION
// ----------------------------------------------------------------
/** @param {any[]} meshes */
export function setOutlineSelection(meshes: any) {
    if (_outlinePass) _outlinePass.selectedObjects = meshes;
    sceneOwner.requestRender();
}
export function clearOutlineSelection() {
    if (_outlinePass) _outlinePass.selectedObjects = [];
    sceneOwner.requestRender();
}
/**
 * Inicializa o pipeline de post-processing (EffectComposer + OutlinePass).
 * Mantido local - S1 pode migrar para lifecycleOwner mais tarde.
 */
export async function initPostProcessing() {
    const THREE: any = getTHREE();
    const renderer = sceneOwner.getRenderer();
    const scene = sceneOwner.getScene();
    const camera = sceneOwner.getCamera();
    if (!renderer || !scene || !camera) return;
    if (!(CONFIG as any).POST_PROCESSING?.ENABLED) return;
    try {
        const [{ EffectComposer }, { RenderPass }, { OutlinePass }, { UnrealBloomPass }, { OutputPass }] =
            await Promise.all([
                import('three/addons/postprocessing/EffectComposer.js' as string),
                import('three/addons/postprocessing/RenderPass.js' as string),
                import('three/addons/postprocessing/OutlinePass.js' as string),
                import('three/addons/postprocessing/UnrealBloomPass.js' as string),
                import('three/addons/postprocessing/OutputPass.js' as string),
            ]);
        _composer = new EffectComposer(renderer);
        _composer.addPass(new RenderPass(scene, camera));
        const canvas = renderer.domElement;
        _outlinePass = new OutlinePass(new THREE.Vector2(canvas.clientWidth, canvas.clientHeight), scene, camera);
        _outlinePass.edgeStrength = 3.0;
        _outlinePass.edgeGlow = 0.5;
        _outlinePass.edgeThickness = 1.5;
        _outlinePass.visibleEdgeColor.set(0x4488ff);
        _outlinePass.hiddenEdgeColor.set(0xff8844);
        _outlinePass.pulsePeriod = 0;
        _composer.addPass(_outlinePass);
        // Bloom pass - disabled by default until viz settings enable it
        _bloomPass = new UnrealBloomPass(
            new THREE.Vector2(canvas.clientWidth, canvas.clientHeight),
            0.5, // strength
            0.4, // radius
            0.85,
        );
        _bloomPass.enabled = false;
        _composer.addPass(_bloomPass);
        // SAOPass removed 2026-04-26: addon was never bundled (404 every boot)
        // and the pass was dead code (enabled = false, no toggle UI). Restore via
        // app/lib/three/examples/jsm/postprocessing/SAOPass.js if AO becomes needed.
        _outputPass = new OutputPass();
        _composer.addPass(_outputPass);
        // Instala render hook que usa _composer quando enabled
        sceneOwner.addRenderHook((_s: any, _c: any) => {
            if (_postProcessingEnabled && _composer) {
                _composer.render();
            }
        });
        console.debug('[scene] Post-processing initialized (OutlinePass + Bloom + Output)');
    } catch (err: any) {
        console.warn('[scene] Post-processing addons not available, using fallback rendering:', err?.message || err);
        _composer = null;
        _outlinePass = null;
        _bloomPass = null;
        _outputPass = null;
    }
}
// ----------------------------------------------------------------
// BLOOM CONTROLS
// ----------------------------------------------------------------
/** @param {boolean} enabled */
export function setBloomEnabled(enabled: any) {
    if (_bloomPass) _bloomPass.enabled = !!enabled;
    sceneOwner.requestRender();
}
/** @param {number} intensity */
export function setBloomIntensity(intensity: any) {
    if (_bloomPass) _bloomPass.strength = Math.max(0, Number(intensity) || 0);
    sceneOwner.requestRender();
}
// ----------------------------------------------------------------
// BACKLIGHT (RIM LIGHT)
// ----------------------------------------------------------------
function _getOrCreateBacklight() {
    const THREE: any = getTHREE();
    const scene = sceneOwner.getScene();
    if (!scene) return null;
    let light = scene.getObjectByName('backlight');
    if (!light) {
        light = new THREE.DirectionalLight(0xffffff, 0.6);
        light.name = 'backlight';
        light.position.set(0, 10, -50);
        light.target.position.set(0, 0, 0);
        light.castShadow = false;
        scene.add(light);
        scene.add(light.target);
    }
    return light;
}
/** @param {boolean} enabled */
export function setBacklightEnabled(enabled: any) {
    const light = _getOrCreateBacklight();
    if (light) light.visible = !!enabled;
    sceneOwner.requestRender();
}
/** @param {number} intensity */
export function setBacklightIntensity(intensity: any) {
    const light = _getOrCreateBacklight();
    if (light) light.intensity = Math.max(0, Number(intensity) || 0);
    sceneOwner.requestRender();
}
// ----------------------------------------------------------------
// RESIZE
// ----------------------------------------------------------------
/**
 * Ajusta camera e renderer quando o container muda de tamanho.
 * @param {HTMLElement} container
 */
export function handleResize(container: any) {
    if (!container) return;
    const width = container.clientWidth || 0;
    const height = container.clientHeight || 0;
    if (width <= 0 || height <= 0) return;
    if (!sceneOwner.getRenderer() || !sceneOwner.getCamera()) {
        if (!_resizePendingSceneWarned) {
            _resizePendingSceneWarned = true;
            console.warn('[scene] Ignoring resize before scene initialization is complete');
        }
        return;
    }
    _resizePendingSceneWarned = false;
    sceneOwner.handleResize(width, height);
    if (_composer) _composer.setSize(width, height);
}
/**
 * Backward-compat no-op (restaurado: migração dropou este export). O loop é
 * auto-gerenciado por sceneOwner._startLoop() após initialize resolver.
 */
export function animate() {
    // No-op: sceneOwner._startLoop() é chamado automaticamente após initialize resolver
}
/**
 * Agenda sync de resize após transição de layout (restaurado: migração dropou
 * este export público — constellation.js + constellationTable.js o importam).
 * @param {HTMLElement} container
 * @param {number} delayMs
 * @param {any} transitionTarget
 */
export function scheduleResizeSync(container: any, delayMs: any = LAYOUT_RESIZE_SYNC_DELAY_MS, transitionTarget: any = null) {
    if (!container) return;
    const sync = () => handleResize(container);
    requestAnimationFrame(sync);
    window.setTimeout(sync, Math.max(0, delayMs));
    if (transitionTarget?.addEventListener) {
        const onTransitionEnd = (event: any) => {
            if (event?.target !== transitionTarget) return;
            if (event?.propertyName && event.propertyName !== 'height') return;
            sync();
        };
        transitionTarget.addEventListener('transitionend', onTransitionEnd, { once: true });
    }
}
