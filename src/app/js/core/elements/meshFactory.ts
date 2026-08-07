// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// @ts-check
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
   FABRICA DE OBJETOS 3D (MESH FACTORY)
   ================================================================

   Este modulo cria os objetos 3D para cada tipo de elemento.

   PADRAO DE PROJETO: Factory (Fabrica)
   - Um ponto central para criar objetos de diferentes tipos
   - Facilita adicionar novos tipos sem mudar outros codigos
   - Mantem a logica de criacao organizada

   TIPOS DE ELEMENTOS:
   - Pluma: esfera achatada (elipsoide) semi-transparente
   - Poco: cilindro vertical (tubo) ou perfil detalhado com litologia
   - Marcador: esfera solida colorida

   NOVO: Well Profile 3D
   - Quando element.data.profile existe, agenda construcao assincrona
   - Cilindro base eh criado sincronamente (feedback imediato)
   - Profile detalhado (textura litologica + revestimento) substitui depois

   CONCEITOS 3D:
   - Mesh = Geometria + Material
   - Geometria = forma (esfera, cubo, cilindro)
   - Material = aparencia (cor, transparencia, brilho)

   ================================================================ */
import { createTHREEProxy } from '../three-lazy.js';
const THREE: any = createTHREEProxy();
let _GLTFLoader: any = null;
let _MeshoptDecoder: any = null;
async function _loadGLTFDeps() {
    if (_GLTFLoader) return;
    const [gltfMod, meshoptMod] = await Promise.all([
        import('three/addons/loaders/GLTFLoader.js' as string),
        import('three/addons/libs/meshopt_decoder.module.js' as string),
    ]);
    _GLTFLoader = gltfMod.GLTFLoader;
    _MeshoptDecoder = meshoptMod.MeshoptDecoder;
}
import { CONFIG } from '../../config.js';
import { requestRender, getRenderer } from '../../utils/scene/setup.js';
import { yieldToMain } from '../../utils/performance/yielding.js';
import { parseColor, normalizeUVs } from './meshHelpers.js';
import {
    getRiverTubeRadius as _getRiverTubeRadiusPure,
    interpolateTrajectoryPoint3D as _interpolateTrajectoryPoint3D,
    trajectorySlice3D as _trajectorySlice3D,
} from './_trajectoryPure.js';
import {
    resolvePitBoxSpec as _resolvePitBoxSpec,
    resolveDamBoxSpec as _resolveDamBoxSpec,
    resolveBuildingBoxSpec as _resolveBuildingBoxSpec,
} from './_meshFactoryPure.js';
import { wrapWithLOD, familyParticipatesInLOD, disposeLOD } from '../../utils/scene/lodMeshFactory.js';
import { simplifyForLOD } from '../geometry/polygonSimplify.js';
const Three = /** @type {any} */ (THREE);
import { createAreaMesh, createIndividualMesh, createIncidentMesh, createEmissionSourceMesh, createWasteStreamMesh, createEffluentPointMesh, createHabitatMesh, } from './meshESG.js';
import { isFlightRouteData, resolveFlightAltitude, elevateFlightPath } from './families/route/routeFlowGeometry.js';
// Lazy-loaded on first directional-well mesh build to avoid top-level await
/** @type {null|((survey:any) => any)} */
let _minimumCurvature: any = null;
/** @type {null|((lithology:string) => string)} */
let _getLithologyColor: any = null;
async function _loadDirectionalDeps() {
    if (_minimumCurvature)
        return;
    const dynamicImport = /** @type {(path:string) => Promise<any>} */ ((path: any) => import(path));
    const [wm, lm] = await Promise.all([
        dynamicImport('../wells/directional.js'),
        dynamicImport('../geology/wellLithology.js'),
    ]);
    _minimumCurvature = wm.minimumCurvature;
    _getLithologyColor = lm.getLithologyColor;
}
// ----------------------------------------------------------------
// ECBT01: CACHE DE GEOMETRIAS E MATERIAIS
// Evita duplicacao de recursos GPU (VRAM) reutilizando instancias.
// ----------------------------------------------------------------
/** Cache de geometrias unitarias (1x1x1), dimensionadas via mesh.scale */
const _geometryCache = new Map();
/** Cache de materiais por chave composta (cor+transparencia+opacidade+tipo) */
const _materialCache = new Map();
/** Bundle compartilhado de mapas PBR leves para materiais standard/physical */
/** @type {null|{albedo:any, roughness:any, normal:any}} */
let _sharedPbrMaps: any = null;
/** @param {any} rgba */
function _createSolidDataTexture(rgba: any) {
    const texture = new Three.DataTexture(new Uint8Array(rgba), 1, 1, Three.RGBAFormat);
    texture.colorSpace = Three.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
}
function getSharedPbrMaps() {
    if (_sharedPbrMaps)
        return _sharedPbrMaps;
    _sharedPbrMaps = {
        albedo: _createSolidDataTexture([230, 226, 214, 255]),
        roughness: _createSolidDataTexture([172, 172, 172, 255]),
        normal: _createSolidDataTexture([128, 128, 255, 255]),
    };
    return _sharedPbrMaps;
}
// ----------------------------------------------------------------
// ECBT02: CACHE E LOADER DE MODELOS GLTF EXTERNOS
// Carrega modelos de alta qualidade assincronamente, mantendo
// o mesh procedural como fallback ate o GLTF estar pronto.
// Mesmo padrao do scheduleProfileBuild do poco.
// ----------------------------------------------------------------
/** Cache de cenas GLTF por URL (any clonavel) */
const _gltfCache = new Map();
let _gltfLoader: any = null;
async function _ensureGLTFLoader() {
    if (_gltfLoader) return;
    await _loadGLTFDeps();
    _gltfLoader = new _GLTFLoader();
    _gltfLoader.setMeshoptDecoder(_MeshoptDecoder);
}
/**
 * Carrega modelo GLTF de URL externa com cache.
 * @param {string} url - URL do arquivo .gltf ou .glb
 * @returns {Promise<any>} - Clone da cena carregada
 */
/** @param {any} url */
async function _loadGLTFModel(url: any) {
    if (_gltfCache.has(url))
        return _gltfCache.get(url).clone();
    await _ensureGLTFLoader();
    return new Promise((resolve, reject) => {
        _gltfLoader.load(url, 
        /** @param {any} spec */
        (gltf: any) => {
            _gltfCache.set(url, gltf.scene);
            resolve(gltf.scene.clone());
        }, undefined, reject);
    });
}
/**
 * Carrega GLTF com fallback H2 Supabase → H1 local.
 * Aceita {primary, fallback} ou string URL simples.
 * @param {string|{primary:string, fallback:string|null}} spec
 * @returns {Promise<any>}
 */
/** @param {any} spec */
async function _loadGLTFWithFallback(spec: any) {
    if (typeof spec === 'string')
        return _loadGLTFModel(spec);
    if (!spec || typeof spec !== 'object')
        throw new Error('invalid GLTF spec');
    const { primary, fallback } = spec;
    if (primary) {
        try {
            return await _loadGLTFModel(primary);
        }
        catch (err) {
            const error: any = err;
            if (!fallback)
                throw err;
            console.warn(`[meshFactory] GLTF primary failed, falling back to ${fallback}:`, error?.message);
        }
    }
    return _loadGLTFModel(fallback);
}
/**
 * Libera recursivamente todos os recursos GPU de uma cena GLTF.
 * @param {any} scene - Cena ou grupo GLTF
 */
/** @param {any} scene */
function _disposeGLTFScene(scene: any) {
    scene.traverse(
    /** @param {any} element */
    (obj: any) => {
        if (obj.geometry)
            obj.geometry.dispose();
        if (obj.material) {
            if (Array.isArray(obj.material)) {
                obj.material.forEach(
                /** @param {any} url */
                (m: any) => m.dispose());
            }
            else
                obj.material.dispose();
        }
    });
}
/**
 * Agenda a substituicao do mesh procedural por um modelo GLTF externo.
 * Opera em idle para nao bloquear a renderizacao principal.
 * O grupo continua visivel com o mesh procedural durante a carga.
 *
 * @param {any} element - Grupo pai do elemento
 * @param {string|{primary:string,fallback:string|null}} url - URL string OU spec H2+H1 fallback
 * @param {any} element - Elemento completo (para aplicar cor)
 */
/** @param {any} element @param {any} url @param {any} element */
function scheduleGLTFBuild(group: any, url: any, element: any) {
    if (!url)
        return;
    // requestIdleCallback não dispara em runtimes com atividade constante
    // (Playwright, renderização intensiva). rAF + setTimeout garante execução
    // no próximo frame em browser ativo, sem depender de idle.
    /** @param {any} key */
    const schedule = (cb: any) => {
        if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(() => {
                void yieldToMain({ timeoutMs: 0 }).then(cb);
            });
        }
        else {
            setTimeout(cb, 16);
        }
    };
    schedule(async () => {
        try {
            const scene = await _loadGLTFWithFallback(url);
            // Normalizar para bounding box unitaria (mesma logica do scale procedural)
            const box = new Three.Box3().setFromObject(scene);
            const size = new Three.Vector3();
            box.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 0)
                scene.scale.setScalar(1 / maxDim);
            // Aplicar cor customizada do elemento se definida
            if (element?.color) {
                const col = parseColor(element.color);
                if (col !== null) {
                    scene.traverse(
                    /** @param {any} factory */
                    (m: any) => {
                        if (m.isMesh && m.material?.color)
                            m.material.color.set(col);
                    });
                }
            }
            // Aplicar escala-alvo respeitando proporções originais do GLB.
            // Antes: scale.set(x*tsX, y*tsY, z*tsZ) deformava o modelo (ex: poço
            // GLB 1×2×1 escalado com target 0.8×50×0.8 virava tubo 0.8×50×0.8).
            // Agora: scale uniforme baseado na MAIOR dimensão do target, GLB
            // preserva proporções originais.
            const ts = group.userData.gltfTargetScale;
            if (ts) {
                const maxTarget = Math.max(ts.x, ts.y, ts.z);
                const uniformScale = scene.scale.x * maxTarget; // scale.x = 1/maxDim vindo do normalize
                scene.scale.setScalar(uniformScale);
                // Centrar verticalmente como o mesh procedural (yOffset = base do procedural)
                const offset = group.userData.gltfYOffset ?? 0;
                scene.position.y = offset;
            }
            scene.name = 'gltf-model';
            // Remover filho procedural e substituir pelo GLTF
            const proc = group.getObjectByName('procedural-base');
            if (proc) {
                if (proc.geometry)
                    proc.geometry.dispose();
                if (proc.material)
                    proc.material.dispose();
                group.remove(proc);
            }
            group.add(scene);
            group.userData.gltfLoaded = true;
            requestRender();
        }
        catch (err) {
            const error: any = err;
            // Fallback silencioso: mesh procedural permanece
            console.warn('[meshFactory] GLTF load failed, keeping procedural:', error.message);
        }
    });
}
/**
 * Retorna geometria do cache ou cria e armazena.
 * @param {string} key - Identificador unico do tipo de geometria
 * @param {Function} factory - Funcao que cria a geometria se nao existir
 * @returns {any}
 */
/** @param {any} key @param {any} factory */
export function getCachedGeometry(key: any, factory: any) {
    if (!_geometryCache.has(key)) {
        const geom = factory();
        geom.computeBoundingBox();
        geom.computeBoundingSphere();
        _geometryCache.set(key, geom);
    }
    return _geometryCache.get(key);
}
/**
 * Retorna material do cache ou cria e armazena.
 * @param {string} key - Chave composta (cor_transparent_opacity_type)
 * @param {Function} factory - Funcao que cria o material se nao existir
 * @returns {any}
 */
/** @param {any} key @param {any} factory */
export function getCachedMaterial(key: any, factory: any) {
    if (!_materialCache.has(key)) {
        _materialCache.set(key, factory());
    }
    return _materialCache.get(key);
}
// ----------------------------------------------------------------
// FUNCAO PRINCIPAL (FACTORY)
// ----------------------------------------------------------------
/**
 * Cria o mesh 3D apropriado para um elemento.
 * Esta e a funcao principal - decide qual tipo criar.
 *
 * @param {any} mesh - Dados do elemento
 * @param {string} element.family - Tipo do elemento ('plume', 'well', etc)
 * @param {any} element.data - Dados especificos do elemento
 * @returns {any|null} - Objeto 3D criado ou null se tipo desconhecido
 *
 * EXEMPLO:
 *   const mesh = createMesh({
 *     family: 'plume',
 *     data: {
 *       depth: { level: 'shallow' },
 *       shape: { radiusX: 10, radiusY: 8, radiusZ: 4 },
 *       center: { x: 0, y: -7.5, z: 0 }
 *     }
 *   });
 */
/**
 * Disposes a mesh and its resources to free GPU memory.
 * @param {any} mesh - The mesh to dispose
 */
/** @param {any} mesh */
export function disposeMesh(mesh: any) {
    if (!mesh)
        return;
    // PERF-MASTER S2: LOD wrapper dispose path.
    // Three.LOD nao tem dispose proprio - disposeLOD itera levels e
    // libera geometry/material de meshes nao-compartilhados (level 0
    // preservado pois pode ser baseMesh reusado por caller).
    if (mesh.isLOD) {
        disposeLOD(mesh);
        if (typeof mesh.clear === 'function')
            mesh.clear();
        return;
    }
    // Dispose geometry
    if (mesh.geometry) {
        mesh.geometry.dispose();
    }
    // Dispose material(s)
    if (mesh.material) {
        if (Array.isArray(mesh.material)) {
            mesh.material.forEach(
            /** @param {any} m */
            (m: any) => m.dispose());
        }
        else {
            mesh.material.dispose();
        }
    }
    // Dispose GLTF scene se carregado
    if (mesh.userData?.gltfLoaded) {
        const gltfScene = mesh.getObjectByName('gltf-model');
        if (gltfScene)
            _disposeGLTFScene(gltfScene);
    }
    // Remove references
    mesh.clear();
}
/**
 * Updates a mesh's properties (position, scale, rotation, color).
 * Atualiza propriedades de um mesh (posicao, escala, rotacao, cor).
 *
 * @param {any} mesh - The mesh to update
 * @param {any} options - Properties to update
 * options.position - Position {x, y, z}
 * options.scale - Scale {x, y, z}
 * options.rotation - Rotation {x, y, z} in degrees
 * options.color - Color value
 */
/** @param {any} mesh @param {any} options */
export function updateMesh(mesh: any, options: any = {}) {
    if (!mesh)
        return;
    if (options.position) {
        mesh.position.set(options.position.x ?? mesh.position.x, options.position.y ?? mesh.position.y, options.position.z ?? mesh.position.z);
    }
    if (options.scale) {
        mesh.scale.set(options.scale.x ?? mesh.scale.x, options.scale.y ?? mesh.scale.y, options.scale.z ?? mesh.scale.z);
    }
    if (options.rotation) {
        mesh.rotation.x = (options.rotation.x ?? mesh.rotation.x * (180 / Math.PI)) * (Math.PI / 180);
        mesh.rotation.y = (options.rotation.y ?? mesh.rotation.y * (180 / Math.PI)) * (Math.PI / 180);
        mesh.rotation.z = (options.rotation.z ?? mesh.rotation.z * (180 / Math.PI)) * (Math.PI / 180);
    }
    if (options.color !== undefined && mesh.material) {
        const color = parseColor(options.color);
        if (color !== null) {
            if (Array.isArray(mesh.material)) {
                mesh.material.forEach(
                /** @param {any} material */
                (m: any) => m.color.setHex(color));
            }
            else {
                mesh.material.color.setHex(color);
            }
        }
    }
    requestRender();
}
/**
 * Loads an overlay texture from a URL and applies it to a material.
 * Carrega uma textura de overlay a partir de uma URL e aplica a um material.
 *
 * @param {string[]} material - Array of URLs to try (for fallback)
 * @param {any} material - The material to apply the texture to
 * @returns {Promise<any|null>}
 */
/** @param {any} material @param {any} material */
export function loadOverlayTexture(urls: any, material: any) {
    return new Promise((resolve, reject) => {
        const validUrls = (urls || []).filter(
        /** @param {any} element */
        (u: any) => u && typeof u === 'string' && u.trim());
        if (validUrls.length === 0) {
            reject(new Error('No valid URLs provided'));
            return;
        }
        urls = validUrls;
        const loader = new Three.TextureLoader();
        let urlIndex = 0;
        function tryLoad() {
            if (urlIndex >= urls.length) {
                reject(new Error('All URLs failed to load'));
                return;
            }
            const url = urls[urlIndex++];
            loader.load(url, 
            /** @param {any} texture */
            (texture: any) => {
                texture.colorSpace = Three.SRGBColorSpace;
                const _renderer = getRenderer();
                if (_renderer)
                    texture.anisotropy = /** @type {any} */ (_renderer).capabilities.getMaxAnisotropy();
                if (material) {
                    material.map = texture;
                    material.needsUpdate = true;
                }
                requestRender();
                resolve(texture);
            }, undefined, 
            /** @param {any} error */
            (error: any) => {
                console.warn(`[meshFactory] Failed to load texture from ${url}:`, error);
                tryLoad();
            });
        }
        tryLoad();
    });
}
/** @param {any} element */
export function createMesh(element: any) {
    const { data } = element;
    // Telemetry drain (claude - bug 2026-06-14): callers ocasionalmente passam o
    // OBJETO de config da família em vez do id string → `family` virava
    // "[object Object]" no warning. Coage para o id quando possível.
    let family = element?.family;
    if (family && typeof family === 'object') family = family.id ?? family.familyId ?? '';
    family = typeof family === 'string' ? family : String(family ?? '');
    let mesh;
    // Escolhe o criador baseado no tipo
    switch (family) {
        case 'plume':
            mesh = createPlumeMesh(data, element);
            break;
        case 'well':
            mesh = createWellMesh(data, element);
            break;
        case 'marker':
            mesh = createMarkerMesh(data, element);
            break;
        case 'lake':
            mesh = createLakeMesh(data, element);
            break;
        case 'river':
            mesh = createRiverMesh(data, element);
            break;
        case 'building':
            mesh = createBuildingMesh(data, element);
            break;
        case 'tank':
            mesh = createTankMesh(data, element);
            break;
        case 'boundary':
            mesh = createBoundaryMesh(data, element);
            break;
        case 'stratum':
            mesh = createStratumMesh(data, element);
            break;
        case 'spring':
            mesh = createSpringMesh(data, element);
            break;
        case 'sample':
            mesh = createSampleMesh(data, element);
            break;
        // === NOVAS FAMILIAS ESG ===
        case 'area':
            mesh = createAreaMesh(data, element);
            break;
        // WATERSHED-FAMILY-001 (BUG-021, claude - bug 2026-06-15): bacia
        // hidrográfica = área de contribuição que drena para um exutório →
        // renderiza como REGIÃO (área) até ganhar builder dedicado (ex.: viz
        // de fluxo). Segue o MESMO padrão do drain ESG 2026-06-14: família
        // renderável sem builder próprio mapeia p/ builder robusto existente
        // em vez de cair no default → null invisível (o gate
        // meshfactory-family-coverage existe para impedir exatamente isso).
        case 'watershed':
            mesh = createAreaMesh(data, element);
            break;
        case 'individual':
            mesh = createIndividualMesh(data, element);
            break;
        case 'incident':
            mesh = createIncidentMesh(data, element);
            break;
        case 'emission_source':
            mesh = createEmissionSourceMesh(data, element);
            break;
        case 'waste_stream':
            mesh = createWasteStreamMesh(data, element);
            break;
        case 'effluent_point':
            mesh = createEffluentPointMesh(data, element);
            break;
        case 'habitat':
            mesh = createHabitatMesh(data, element);
            break;
        // === GEOLOGICAL/STRUCTURAL FAMILIES ===
        case 'fault':
            mesh = createFaultMesh(data, element);
            break;
        // === UTILITY/GENERIC FAMILIES ===
        case 'blueprint':
            mesh = createBlueprintMesh(data, element);
            break;
        case 'sensor':
            mesh = createSensorMesh(data, element);
            break;
        case 'intangible':
            mesh = createIntangibleMesh(data, element);
            break;
        case 'generic':
            mesh = createGenericMesh(data, element);
            break;
        // === INFRA / CONTENÇÃO + MINERAÇÃO ===
        case 'dam':
            mesh = createDamMesh(data, element);
            break;
        case 'pit':
            mesh = createPitMesh(data, element);
            break;
        // === LINEAR (path-based) ===
        case 'infra_linear':
            mesh = createInfraLinearMesh(data, element);
            break;
        case 'route_flow':
            mesh = createRouteFlowMesh(data, element);
            break;
        // === FAMÍLIAS ESG 2026-04-20 sem builder dedicado (telemetry drain
        // claude - bug 2026-06-14: caíam no default → "Tipo desconhecido" + null
        // invisível). Mapeadas para builders robustos existentes até ganharem
        // geometria própria. treatment_system = vaso de tratamento (tank);
        // vehicle/equipment/atmosphere = box genérico visível na posição. ===
        case 'treatment_system':
            mesh = createTankMesh(data, element);
            break;
        case 'vehicle':
        case 'equipment':
        case 'atmosphere':
        // drone (ECBYTS-ENERGY-SCENARIOS-001#5) chegou ao registro sem builder
        // — mesmo drain de telemetria acima; box genérico até geometria própria.
        case 'drone':
            mesh = createGenericMesh(data, element);
            break;
        // === DRONE / UAV (ENERGY-SCENARIOS-001#5) — aeronave posicionável, sem
        // GLB curado ainda (whitelist de modelo 3D). Builder procedural de
        // quadricóptero: sem ele a família cai no default → null (invisível). ===
        case 'drone':
            mesh = createDroneMesh(data, element);
            break;
        default:
            console.warn(`[meshFactory] Tipo de elemento desconhecido: ${family}`);
            return null;
    }
    // PERF-MASTER S2: opt-in LOD wrap via CONFIG.FEATURES.SCENE_LOD.
    // When off (default), mesh is returned unchanged - zero overhead.
    // When on, families com >=2 thresholds renderizaveis sao envolvidas
    // em Three.LOD; familias bypass (boundary, terrain, single-threshold)
    // recebem skipped:true e seguem como mesh normal.
    if (CONFIG.FEATURES?.SCENE_LOD && mesh && familyParticipatesInLOD(family)) {
        const r = wrapWithLOD(THREE, mesh, family, { element });
        if (r.ok && !r.skipped && r.mesh)
            mesh = r.mesh;
    }
    return _attachCustomAssetIfSupported(mesh, element);
}
/** @param {any} element */
function _extractCustomGLTFUrl(element: any) {
    // Prioridade 1: modelVariantId do model-library (curado, com H2+H1 fallback)
    const variantId = element?.data?.modelVariantId;
    if (variantId && _modelLibraryCache) {
        const entry = _modelLibraryCache.MODEL_LIBRARY?.[variantId];
        if (entry)
            return _modelLibraryCache.resolveGlbUrl(variantId, entry);
    }
    // Prioridade 2: custom3DAsset (upload runtime do usuário, blob URL)
    const asset = element?.data?.custom3DAsset;
    if (!asset?.previewUrl || !asset?.name)
        return null;
    const name = String(asset.name).toLowerCase();
    if (!name.endsWith('.glb') && !name.endsWith('.gltf'))
        return null;
    return asset.previewUrl;
}
// Lazy-load model-library para evitar ciclo de imports
/** @type {any} */
let _modelLibraryCache: any = null;
import('../../config/model-library.js')
    .then((m: any) => {
    _modelLibraryCache = m;
})
    .catch((err: any) => {
    console.warn('[meshFactory] model-library unavailable', err?.message);
});
/** @param {any} baseMesh @param {any} element */
function _attachCustomAssetIfSupported(baseMesh: any, element: any) {
    if (!baseMesh)
        return baseMesh;
    const customUrl = _extractCustomGLTFUrl(element);
    if (!customUrl)
        return baseMesh;
    let wrapper = baseMesh;
    if (!(baseMesh instanceof Three.Group)) {
        wrapper = new Three.Group();
        wrapper.position.copy(baseMesh.position);
        wrapper.rotation.copy(baseMesh.rotation);
        wrapper.scale.copy(baseMesh.scale);
        baseMesh.position.set(0, 0, 0);
        baseMesh.rotation.set(0, 0, 0);
        baseMesh.scale.set(1, 1, 1);
        wrapper.add(baseMesh);
    }
    const proc = wrapper.getObjectByName('procedural-base') || wrapper.children[0];
    if (proc)
        proc.name = 'procedural-base';
    const box = new Three.Box3().setFromObject(proc || wrapper);
    const size = new Three.Vector3();
    box.getSize(size);
    const safeX = Math.max(size.x || 0, 0.5);
    const safeY = Math.max(size.y || 0, 0.5);
    const safeZ = Math.max(size.z || 0, 0.5);
    wrapper.userData.gltfTargetScale = { x: safeX, y: safeY, z: safeZ };
    wrapper.userData.gltfYOffset = (box.min.y || 0) + safeY / 2;
    scheduleGLTFBuild(wrapper, customUrl, element);
    return wrapper;
}
// ----------------------------------------------------------------
// CRIADORES ESPECIFICOS POR TIPO
// ----------------------------------------------------------------
/**
 * Cria mesh de pluma de contaminacao.
 *
 * REPRESENTACAO:
 * - Esfera achatada (elipsoide) semi-transparente
 * - Tamanho varia com a profundidade
 * - Cor varia com o nivel de contaminacao (verde → amarelo → vermelho)
 *
 * @param {any} element - Dados da pluma
 * data.depth - Informacoes de profundidade
 * data.depth.level - Nivel ('shallow', 'middle', 'deep')
 * data.shape - Dimensoes do elipsoide
 * data.center - Posicao central
 * @returns {any}
 */
/** @param {any} element @param {any} element */
function createPlumeMesh(data: any, element: any) {
    /**
     * Determina cor baseado na profundidade.
     * Plumas mais rasas sao mais preocupantes (vermelho).
     */
    const depthLevel = data.depth?.level || 'shallow';
    const baseColor = (CONFIG.COLORS.plume as any)[depthLevel] || CONFIG.COLORS.plume.shallow;
    const color = parseColor(element?.color) || baseColor;
    const rx = data.shape?.radiusX || 10;
    const ry = data.shape?.radiusY || 8;
    const rz = data.shape?.radiusZ || 4;
    /**
     * Efeito de krigagem: cascas concentricas com opacidade decrescente.
     * Simula gradiente de concentracao - centro denso, bordas difusas.
     * Cada casca representa uma isossuperficie de concentracao.
     */
    const SHELLS = [
        { frac: 0.25, opacity: 0.65 }, // Nucleo (alta concentracao)
        { frac: 0.5, opacity: 0.4 }, // Zona intermediaria
        { frac: 0.75, opacity: 0.22 }, // Zona de transicao
        { frac: 1.0, opacity: 0.08 }, // Borda difusa (frente da pluma)
    ];
    const group = new Three.Group();
    const sphereGeom = getCachedGeometry('sphere_48', () => new Three.SphereGeometry(1, 48, 48));
    SHELLS.forEach((shell: any) => {
        const matKey = `std_${color}_t_${shell.opacity}_dw0`;
        const material = getCachedMaterial(matKey, () => new Three.MeshStandardMaterial({
            color: color,
            transparent: true,
            opacity: shell.opacity,
            roughness: 0.4,
            side: Three.DoubleSide,
            depthWrite: false,
        }));
        const mesh = new Three.Mesh(sphereGeom, material);
        mesh.scale.set(rx * shell.frac, rz * shell.frac, ry * shell.frac);
        group.add(mesh);
    });
    group.position.set(data.center?.x || 0, data.center?.y || -7.5, data.center?.z || 0);
    return group;
}
/**
 * Cria mesh de poco de monitoramento.
 *
 * REPRESENTACAO:
 * - Se houver profile data: agenda construcao do perfil completo
 * - Inicialmente: cilindro base que sera substituido pelo profile detalhado
 * - Fallback sem profile: cilindro cinza simples permanente
 *
 * NOTA: A construcao do profile 3D eh agendada assincronamente para nao
 * bloquear a criacao inicial do mesh.
 *
 * @param {any} data - Dados do poco
 * data.coordinates - Posicao (easting, northing)
 * data.construction - Dados construtivos (profundidade, diametro)
 * @param {any} element - Elemento completo (para acesso a profile)
 * @returns {any}
 */
/** @param {any} data @param {any} element */
function createWellMesh(data: any, element: any) {
    const depth = data.construction?.totalDepth || 50;
    const radius = 0.4;
    // Cria grupo base (mesmo que nao tenha profile)
    const group = new Three.Group();
    group.name = 'well-mesh-group';
    // Cilindro base (sempre presente inicialmente)
    const geometry = getCachedGeometry('cyl_32', () => new Three.CylinderGeometry(1, 1, 1, 32));
    const wellColor = parseColor(element?.color) || 0x555555;
    const matKey = `std_${wellColor}_o_1`;
    const material = getCachedMaterial(matKey, () => new Three.MeshStandardMaterial({
        color: wellColor,
        roughness: 0.5,
    }));
    const mesh = new Three.Mesh(geometry, material);
    mesh.name = 'well-base-cylinder';
    mesh.scale.set(radius, depth, radius);
    mesh.position.set(0, -depth / 2, 0);
    group.add(mesh);
    // Poço direcional: TubeGeometry com trajetória MCM + litologia (P5p2)
    if (element?.data?.directionalSurvey) {
        group.userData.isDirectional = true;
        const schedule = typeof requestIdleCallback !== 'undefined'
            ? /** @type {(cb:any) => any} */ (requestIdleCallback)
            : /** @type {(cb:any) => any} */ ((cb: any) => setTimeout(cb, 80));
        schedule(async () => {
            try {
                // Remove cilindro base vertical antes de adicionar trajetória direcional
                const baseCyl = group.getObjectByName('well-base-cylinder');
                if (baseCyl) {
                    group.remove(baseCyl);
                    baseCyl.geometry.dispose();
                    baseCyl.material.dispose();
                }
                await _buildDirectionalWellMesh(element, group);
                requestRender();
                window.dispatchEvent(new CustomEvent('wellDirectionalBuilt', {
                    detail: { elementId: element.id },
                }));
            }
            catch (err) {
                console.warn('[meshFactory] Falha ao construir poço direcional:', err);
            }
        });
    }
    else if (element?.data?.profile?.lithologic || element?.data?.profile?.constructive) {
        // Perfil litológico estático - mantém comportamento anterior
        group.userData.hasProfile = true;
        group.userData.elementData = element;
        group.userData.depth = depth;
        scheduleProfileBuild(group, element);
    }
    // Posiciona grupo na coordenada do poco
    const groundY = Number.isFinite(data.coordinates?.elevation) ? data.coordinates.elevation : 0;
    group.position.set(data.coordinates?.easting || 0, groundY - depth / 2, data.coordinates?.northing || 0);
    return group;
}
/**
 * Agenda a construcao assincrona do profile 3D.
 * Nao bloqueia a criacao inicial do mesh.
 */
/** @param {any} group @param {any} element */
function scheduleProfileBuild(group: any, element: any) {
    // Usa requestIdleCallback se disponivel, senao setTimeout
    const schedule = typeof requestIdleCallback !== 'undefined'
        ? /** @type {(cb:any) => any} */ (requestIdleCallback)
        : /** @type {(cb:any) => any} */ ((cb: any) => setTimeout(cb, 50));
    schedule(async () => {
        try {
            const profileModule = await import('./families/well/wellProfile3D.js');
            const profileGroup = profileModule.createWellProfile3D(element);
            if (profileGroup && group.parent) {
                // Remove cilindro base
                const baseCylinder = group.getObjectByName('well-base-cylinder');
                if (baseCylinder) {
                    group.remove(baseCylinder);
                    baseCylinder.geometry.dispose();
                    baseCylinder.material.dispose();
                }
                // Adiciona filhos do profile
                while (profileGroup.children.length > 0) {
                    group.add(profileGroup.children[0]);
                }
                // Marca como atualizado
                group.userData.profileBuilt = true;
                // Dispara evento para atualizacao de cena
                window.dispatchEvent(new CustomEvent('wellProfileBuilt', {
                    detail: { elementId: element.id, group },
                }));
                // Solicita render
                requestRender();
            }
        }
        catch (err) {
            console.warn('[meshFactory] Falha ao construir profile 3D:', err);
            // Mantem cilindro base como fallback
        }
    });
}
/**
 * Cria mesh de marcador generico.
 *
 * REPRESENTACAO:
 * - Esfera solida colorida
 * - Tamanho fixo para boa visibilidade
 * - Cor azul padrao
 *
 * @param {any} element - Dados do marcador
 * data.position - Posicao (x, y, z)
 * @returns {any}
 */
/** @param {any} element @param {any} element */
function createMarkerMesh(data: any, element: any) {
    const geometry = getCachedGeometry('sphere_32', () => new Three.SphereGeometry(1, 32, 32));
    const markerColor = parseColor(element?.color) || 0x3b82f6;
    const matKey = `std_${markerColor}_o_1`;
    const material = getCachedMaterial(matKey, () => new Three.MeshStandardMaterial({
        color: markerColor,
    }));
    const mesh = new Three.Mesh(geometry, material);
    mesh.scale.set(1.5, 1.5, 1.5);
    const baseY = data.position?.y ?? 0;
    mesh.position.set(data.position?.x || 0, baseY + 1.5, data.position?.z || 0);
    return mesh;
}
/**
 * Cria mesh de lago/corpo d'agua.
 *
 * REPRESENTACAO:
 * - Disco achatado (cilindro com altura pequena)
 * - Cor azul-agua
 * - Semi-transparente
 *
 * @param {any} element - Dados do lago
 * data.shape - Dimensoes { radiusX, radiusY }
 * data.position - Posicao { x, y, z }
 * @returns {any}
 */
/** @param {any} element @param {any} element */
function createLakeMesh(data: any, element: any) {
    const rx = data.shape?.radiusX || 15;
    const ry = data.shape?.radiusY || 10;
    const geometry = getCachedGeometry('cyl_32', () => new Three.CylinderGeometry(1, 1, 1, 32));
    const lakeColor = parseColor(element?.color) || 0x3b82f6;
    const matKey = `std_${lakeColor}_t_0.6`;
    const material = getCachedMaterial(matKey, () => new Three.MeshStandardMaterial({
        color: lakeColor,
        transparent: true,
        opacity: 0.6,
        roughness: 0.3,
        side: Three.DoubleSide,
    }));
    const mesh = new Three.Mesh(geometry, material);
    mesh.scale.set(rx, 0.5, ry);
    const baseY = data.position?.y ?? 0;
    mesh.position.set(data.position?.x || 0, baseY + 0.25, data.position?.z || 0);
    return mesh;
}
/** @param {any} width */
function _getRiverTubeRadius(width: any) {
    return _getRiverTubeRadiusPure(width);
}
/** @param {any} path @param {any} width */
function _buildRiverTubeGeometry(path: any, width: any) {
    const points = (path || []).map(
    /** @param {any} north */
    (p: any) => new Three.Vector3(p.x, p.y ?? 0, p.z));
    if (points.length < 2)
        return null;
    const curve = new Three.CatmullRomCurve3(points, false, 'centripetal');
    const tubularSegments = Math.max(24, points.length * 8);
    return new Three.TubeGeometry(curve, tubularSegments, _getRiverTubeRadius(width), 10, false);
}
// ----------------------------------------------------------------
// POCO DIRECIONAL - TubeGeometry com segmentos por litologia
// P1-8 P5p2 (SPEC_FAMILY_FAULT_WELLS_DIRECTIONAL)
//
// Ref: Sawaryn & Thorogood (2005) SPE-84246-PA - Minimum Curvature
// Three.js coordinate system: x=East, y=UP (=-TVD), z=North
// ----------------------------------------------------------------
/**
 * Interpola coordenada 3D ao longo da trajetória no MD dado.
 * Busca binária simples entre stations adjacentes.
 *
 * @param {number[]} north - measured depths
 * @param {number[]} north - northings (m)
 * @param {number[]} north - eastings (m)
 * @param {number[]} north - true vertical depths (m)
 * @param {number} north - MD desejado
 * @returns {any} ponto interpolado
 */
/** @param {any} north @param {any} north @param {any} north @param {any} north @param {any} north */
function _interpolateTrajectoryPoint(md: any, north: any, east: any, tvd: any, targetMd: any) {
    const p = _interpolateTrajectoryPoint3D(md, north, east, tvd, targetMd);
    return new Three.Vector3(p.x, p.y, p.z);
}
/**
 * Extrai pontos de trajetória no intervalo [mdTop, mdBottom].
 * Inclui interpolações exatas nas fronteiras.
 *
 * @returns {any[]}
 */
/** @param {any} md @param {any} north @param {any} east @param {any} tvd @param {any} mdTop @param {any} mdBottom */
function _trajectorySlice(md: any, north: any, east: any, tvd: any, mdTop: any, mdBottom: any) {
    return _trajectorySlice3D(md, north, east, tvd, mdTop, mdBottom).map(
        (p: any) => new Three.Vector3(p.x, p.y, p.z),
    );
}
/**
 * Cria Group Three.js de poço direcional com TubeGeometry por segmento litológico.
 * Agendado assincronamente a partir de createWellMesh quando directionalSurvey presente.
 *
 * @param {any} element - elemento ECBT com data.directionalSurvey + data.lithologySegments
 * @param {any} group - grupo existente que receberá os meshes
 */
/** @param {any} element @param {any} group */
async function _buildDirectionalWellMesh(element: any, group: any) {
    await _loadDirectionalDeps();
    const survey = element.data?.directionalSurvey;
    if (!survey)
        return;
    let traj;
    try {
        const minimumCurvature = _minimumCurvature;
        if (!minimumCurvature)
            return;
        traj = minimumCurvature(survey);
    }
    catch (e: any) {
        console.warn('[meshFactory] directional well trajectory error:', e?.message);
        return;
    }
    const { md, north, east, tvd } = traj;
    const totalMD = md[md.length - 1];
    const wellRadius = element.data?.construction?.diameter
        ? element.data.construction.diameter / 2 / 100 // cm → m → scene units
        : 0.35;
    const lithSegments = Array.isArray(element.data?.lithologySegments) ? element.data.lithologySegments : [];
    if (lithSegments.length === 0) {
        // Poço sem litologia - tubo único com cor do elemento
        const allPts = md.map((_: any, i: number) => new Three.Vector3(east[i], -tvd[i], north[i]));
        if (allPts.length < 2)
            return;
        const curve = new Three.CatmullRomCurve3(allPts, false, 'catmullrom');
        const segments = Math.max(32, allPts.length * 6);
        const geo = new Three.TubeGeometry(curve, segments, wellRadius, 12, false);
        const color = parseColor(element.color) ?? 0x888888;
        const mat = getCachedMaterial(`dir_well_${color}`, () => new Three.MeshStandardMaterial({ color, roughness: 0.5 }));
        const tube = new Three.Mesh(geo, mat);
        tube.name = 'well-directional-tube';
        group.add(tube);
        return;
    }
    // Poço com litologia - um tubo por segmento
    for (const seg of lithSegments) {
        const segTop = Math.max(0, seg.mdTop ?? 0);
        const segBot = Math.min(totalMD, seg.mdBottom ?? totalMD);
        if (segBot <= segTop)
            continue;
        const pts = _trajectorySlice(md, north, east, tvd, segTop, segBot);
        if (pts.length < 2)
            continue;
        const curve = new Three.CatmullRomCurve3(pts, false, 'catmullrom');
        const segments = Math.max(8, pts.length * 4);
        const geo = new Three.TubeGeometry(curve, segments, wellRadius, 12, false);
        const hexStr = seg.color ?? (seg.lithology && _getLithologyColor ? _getLithologyColor(seg.lithology) : '#888888');
        const color = parseColor(hexStr) ?? 0x888888;
        const matKey = `dir_lith_${color}`;
        const mat = getCachedMaterial(matKey, () => new Three.MeshStandardMaterial({ color, roughness: 0.6 }));
        const tube = new Three.Mesh(geo, mat);
        tube.name = `well-lith-${seg.lithology ?? 'unknown'}-${Math.round(segTop)}`;
        tube.userData.lithology = seg.lithology;
        tube.userData.mdTop = segTop;
        tube.userData.mdBottom = segBot;
        group.add(tube);
    }
}
/**
 * Cria mesh de rio/linha d'agua.
 *
 * REPRESENTACAO:
 * - Linha tubular (tubo ao longo do caminho)
 * - Cor azul-rio
 * - Largura proporcional ao fluxo
 *
 * @param {any} element - Dados do rio
 * data.path - Array de pontos {x, y, z}
 * data.width - Largura do rio
 * @returns {any}
 */
/** @param {any} element @param {any} element */
function createRiverMesh(data: any, element: any) {
    const path = data.path || [
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 },
    ];
    const width = data.width || 3;
    const geometry = _buildRiverTubeGeometry(path, width);
    if (!geometry)
        return null;
    const riverColor = parseColor(element?.color) || 0x60a5fa;
    const matKey = `std_${riverColor}_t_0.7`;
    const material = getCachedMaterial(matKey, () => new Three.MeshStandardMaterial({
        color: riverColor,
        transparent: true,
        opacity: 0.7,
        roughness: 0.4,
    }));
    const tubeMesh = new Three.Mesh(geometry, material);
    tubeMesh.name = 'river-tube';
    tubeMesh.frustumCulled = false;
    const group = new Three.Group();
    group.name = 'river-mesh-group';
    group.add(tubeMesh);
    return group;
}
/**
 * Cria mesh de edificacao/estrutura.
 *
 * REPRESENTACAO:
 * - Cubo ou forma extrudada
 * - Cor cinza ou definida pelo usuario
 * - Opaca
 *
 * @param {any} element - Dados do edificio
 * data.dimensions - Dimensoes { width, height, depth }
 * data.position - Posicao { x, y, z }
 * @returns {any}
 */
/** @param {any} element @param {any} element */
function createBuildingMesh(data: any, element: any) {
    // Cálculo PURO das dimensões/posição → _meshFactoryPure.ts (números idênticos).
    const spec = _resolveBuildingBoxSpec(data);
    const geometry = getCachedGeometry('box_1', () => new Three.BoxGeometry(1, 1, 1));
    const buildingColor = parseColor(element?.color) || 0x9ca3af;
    const matKey = `std_${buildingColor}_o_1`;
    const material = getCachedMaterial(matKey, () => new Three.MeshStandardMaterial({
        color: buildingColor,
        roughness: 0.8,
    }));
    const mesh = new Three.Mesh(geometry, material);
    mesh.scale.set(spec.length, spec.height, spec.width);
    mesh.position.set(data.position?.x || 0, spec.centerY, data.position?.z || 0);
    return mesh;
}
/**
 * Cria mesh de tanque/reservatorio.
 *
 * REPRESENTACAO:
 * - Cilindro vertical (para tanques verticais)
 * - Ou cubo (para tanques retangulares)
 * - Cor definida pelo tipo de conteudo
 *
 * @param {any} element - Dados do tanque
 * data.type - Tipo ('vertical', 'horizontal', 'rectangular')
 * data.dimensions - Dimensoes
 * data.position - Posicao
 * @returns {any}
 */
/** @param {any} element @param {any} element */
function createTankMesh(data: any, element: any) {
    const type = data.type || 'vertical';
    const dims = data.dimensions || { radius: 3, height: 6 };
    let geometry;
    if (type === 'vertical' || type === 'horizontal') {
        geometry = getCachedGeometry('cyl_16', () => new Three.CylinderGeometry(1, 1, 1, 16));
    }
    else {
        geometry = getCachedGeometry('box_1', () => new Three.BoxGeometry(1, 1, 1));
    }
    const tankColor = parseColor(element?.color) || 0xf59e0b;
    const matKey = `std_${tankColor}_o_1`;
    const material = getCachedMaterial(matKey, () => new Three.MeshStandardMaterial({
        color: tankColor,
        roughness: 0.5,
        metalness: 0.3,
    }));
    const mesh = new Three.Mesh(geometry, material);
    mesh.name = 'procedural-base';
    // Dimensoes e offset vertical relativo ao grupo
    let yOffset: number;
    if (type === 'vertical') {
        mesh.scale.set(dims.radius, dims.height, dims.radius);
        yOffset = dims.height / 2;
    }
    else if (type === 'horizontal') {
        mesh.scale.set(dims.radius, dims.length || 6, dims.radius);
        mesh.rotation.z = Math.PI / 2;
        yOffset = dims.radius;
    }
    else {
        mesh.scale.set(dims.width ?? dims.radius, dims.height, dims.depth ?? dims.radius);
        yOffset = dims.height / 2;
    }
    mesh.position.y = yOffset;
    const group = new Three.Group();
    group.add(mesh);
    group.position.set(data.position?.x || 0, data.position?.y || 0, data.position?.z || 0);
    // Metadados para o GLTF loader aplicar escala e offset corretos
    group.userData.gltfTargetScale = { x: dims.radius, y: dims.height, z: dims.radius };
    group.userData.gltfYOffset = yOffset;
    if (!_extractCustomGLTFUrl(element)) {
        scheduleGLTFBuild(group, CONFIG.GLTF_MODELS?.tank, element);
    }
    return group;
}
/**
 * Cria mesh de limite de area (boundary).
 *
 * REPRESENTACAO:
 * - any com dois filhos:
 *   1. Line 'outline' - contorno laranja fechado
 *   2. Mesh 'overlay' - plano preenchido com textura aerea (se overlayUrl)
 * - Suporta imagem de satelite via loadOverlayTexture
 *
 * @param {any} element - Dados do boundary
 * data.vertices - Array de vertices {x, z}
 * @param {string} [data.overlayUrl] - URL da imagem aerea (data URL ou HTTP)
 * @param {string[]} [data.overlayFallbackUrls] - URLs alternativas
 * @param {number} [data.overlayOpacity=0.42] - Opacidade do overlay
 * @param {any} element - Elemento completo
 * @returns {any}
 */
/** @param {any} element @param {any} element */
function createBoundaryMesh(data: any, element: any) {
    const vertices = data.vertices || [];
    if (vertices.length < 3)
        return null;
    // LOD-aware simplification: se data.lodHint presente, reduz vertices para render.
    // Originais preservados em data.vertices (intocado) + mesh.userData.originalVertices.
    // lodHint = 'HIGH' (default) | 'MEDIUM' (50m) | 'LOW' (500m) | 'SPRITE'
    const lodHint = data.lodHint || 'HIGH';
    const renderVerts = lodHint !== 'HIGH' && vertices.length > 8 ? simplifyForLOD(vertices, lodHint) : vertices;
    const group = new Three.Group();
    const boundaryColor = parseColor(element?.color) || 0xff9900;
    // Stash original para re-LOD posterior sem re-import
    /** @type {any} */ (group).userData = /** @type {any} */ (group).userData || {};
    /** @type {any} */ (group).userData.originalVertices = vertices;
    /** @type {any} */ (group).userData.lodHint = lodHint;
    // 1. Linha de contorno (outline) — usa renderVerts
    const points = renderVerts.map(
    /** @param {any} element */
    (v: any) => new Three.Vector3(v.x, v.y || 0.2, v.z));
    points.push(points[0].clone()); // Fecha o loop
    const lineGeom = new Three.BufferGeometry().setFromPoints(points);
    const lineMatKey = `line_${boundaryColor}`;
    const lineMat = getCachedMaterial(lineMatKey, () => new Three.LineBasicMaterial({
        color: boundaryColor,
        linewidth: 2,
    }));
    const line = new Three.Line(lineGeom, lineMat);
    line.name = 'outline';
    line.frustumCulled = false;
    group.add(line);
    // 2. Plano preenchido — usa renderVerts
    const shape = new Three.Shape();
    shape.moveTo(renderVerts[0].x, renderVerts[0].z);
    for (let i = 1; i < renderVerts.length; i++) {
        shape.lineTo(renderVerts[i].x, renderVerts[i].z);
    }
    shape.closePath();
    const planeGeom = new Three.ShapeGeometry(shape);
    normalizeUVs(planeGeom);
    planeGeom.rotateX(-Math.PI / 2);
    planeGeom.translate(0, 0.1, 0);
    const pbrMaps = getSharedPbrMaps();
    // Cor do fill: usa meta.color do elemento (configurada via dataset color
    // ou import) quando disponível; fallback para bege antigo (compat). Antes
    // sempre bege hardcoded causava boundaries invisíveis em fundo escuro.
    const fillColor = boundaryColor !== 0xff9900 ? boundaryColor : 0xf6f2e8;
    const planeMat = new Three.MeshStandardMaterial({
        color: fillColor,
        map: pbrMaps.albedo,
        roughnessMap: pbrMaps.roughness,
        normalMap: pbrMaps.normal,
        normalScale: new Three.Vector2(0.25, 0.25),
        transparent: true,
        opacity: data.overlayOpacity ?? 0.55,
        side: Three.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
        roughness: 0.95,
        metalness: 0.01,
    });
    // Carrega imagem aerea se URL fornecida
    if (data.overlayUrl) {
        const urls = [data.overlayUrl, ...(data.overlayFallbackUrls || [])];
        // loadOverlayTexture rejeita ('All URLs failed to load') quando TODAS as
        // URLs falham (Supabase Storage fora, CDN lenta, rede ruim, ou config
        // placeholder em dev). A textura aérea é decorativa — o plane já tem cor
        // sólida de fallback. Sem este .catch a rejeição vazava como "Uncaught (in
        // promise)" poluindo o console (claude - adm 2026-06-19, diagnóstico do
        // console do boot). Degrada graciosamente: warn + segue com a cor sólida.
        loadOverlayTexture(urls, planeMat).catch((e: any) => {
            console.debug('[meshFactory:boundary-overlay] textura aérea indisponível, usando cor sólida:', e?.message || e);
        });
    }
    const plane = new Three.Mesh(planeGeom, planeMat);
    plane.name = 'overlay';
    plane.frustumCulled = false;
    plane.userData.isOverlay = true;
    group.add(plane);
    // SPEC_BOUNDARY_3D_LABELS_AUTO — anexa label 3D no centróide do polígono
    // se boundary tem meta.label ou name. Dynamic import evita ciclo
    // elements/manager → meshFactory.
    if ((element?.meta?.label || element?.label || element?.name) && element?.id) {
        import('../../utils/labels/manager.js')
            .then((mod: any) => {
            try {
                mod.attachBoundaryLabel(element.id, group, data, element);
            }
            catch (e) {
                console.debug('[meshFactory:boundary-label]', e instanceof Error ? (e as any).message : e);
            }
        })
            .catch((e: any) => {
            console.debug('[meshFactory:boundary-label-import]', e instanceof Error ? (e as any).message : e);
        });
    }
    return group;
}
/**
 * Cria mesh de estrato geologico.
 *
 * REPRESENTACAO:
 * - Volume 3D entre duas superficies
 * - Ou lamina representativa
 * - Cor baseada no tipo litologico
 *
 * @param {any} element - Dados do estrato
 * data.topology - Top e bottom surfaces
 * data.lithology - Tipo de solo/rocha
 * @returns {any} Grupo com mesh solido + linhas de aresta para distinguir camadas
 */
/** @param {any} element @param {any} element */
function createStratumMesh(data: any, element: any) {
    // Resolve dimensões: extent (do random model) ou dimensions diretas
    const width = data.dimensions?.width || data.extent?.width || 50;
    const depth = data.dimensions?.depth || data.extent?.depth || 50;
    // Espessura e posição Y: prioridade para layer.top/bottom, fallback para dimensions/thickness
    let thickness = data.dimensions?.thickness || 2;
    let posY = data.position?.y ?? -thickness / 2;
    if (data.layer && typeof data.layer.top === 'number' && typeof data.layer.bottom === 'number') {
        thickness = Math.abs(data.layer.bottom - data.layer.top);
        posY = (data.layer.top + data.layer.bottom) / 2;
    }
    const geometry = getCachedGeometry('box_1', () => new Three.BoxGeometry(1, 1, 1));
    // Cor baseada na litologia
    const lithColors = {
        clay: 0x8b4513,
        sand: 0xf4a460,
        gravel: 0xd3d3d3,
        rock: 0x696969,
    };
    // Cor: aceita numero hex direto (CONFIG.STRATA), string hex (#RGB), nome litologico, ou fallback
    const rawColor = data?.color ?? element?.color;
    const stratumColor = (typeof rawColor === 'number' ? rawColor : null) ||
        parseColor(rawColor) ||
        (lithColors as any)[data.lithology] ||
        0x8b4513;
    // Estratos nascem translucidos para permitir leitura do interior do modelo.
    const stratumOpacity = Number.isFinite(data.opacity) ? Math.max(0.12, Math.min(0.8, data.opacity)) : 0.32;
    const matKey = `std_${stratumColor}_t_${stratumOpacity.toFixed(2)}`;
    const material = getCachedMaterial(matKey, () => new Three.MeshStandardMaterial({
        color: stratumColor,
        transparent: true,
        opacity: stratumOpacity,
        depthWrite: false,
        roughness: 0.72,
        metalness: 0.02,
        side: Three.DoubleSide,
    }));
    const mesh = new Three.Mesh(geometry, material);
    mesh.scale.set(width, thickness, depth);
    const posX = data.position?.x || 0;
    const posZ = data.position?.z || 0;
    mesh.position.set(posX, posY, posZ);
    // Edge lines - bordas escuras para distinguir camadas geologicas adjacentes
    const edgeBox = new Three.BoxGeometry(width, thickness, depth);
    const edgesGeo = new Three.EdgesGeometry(edgeBox);
    edgeBox.dispose();
    const edgeColor = new Three.Color(stratumColor).lerp(new Three.Color(0x111111), 0.55).getHex();
    const edgeMat = getCachedMaterial(`line_stratum_edge_${edgeColor}`, () => new Three.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.5 }));
    const edges = new Three.LineSegments(edgesGeo, edgeMat);
    edges.position.set(posX, posY, posZ);
    const group = new Three.Group();
    group.name = 'stratum'; // para vizSettings strata toggle
    group.add(mesh);
    group.add(edges);
    return group;
}
/**
 * Cria mesh de nascente/vertente.
 *
 * REPRESENTACAO:
 * - Pequeno cone/circulo na superficie
 * - Cor azul-clara
 * - Marcador de ponto de agua
 *
 * @param {any} element - Dados da nascente
 * data.position - Posicao {x, y, z}
 * @returns {any}
 */
/** @param {any} element @param {any} element */
function createSpringMesh(data: any, element: any) {
    const geometry = getCachedGeometry('cone_16', () => new Three.ConeGeometry(1, 1, 16));
    const springColor = parseColor(element?.color) || 0x60a5fa;
    const matKey = `std_${springColor}_o_1`;
    const material = getCachedMaterial(matKey, () => new Three.MeshStandardMaterial({
        color: springColor,
        roughness: 0.4,
    }));
    const mesh = new Three.Mesh(geometry, material);
    mesh.scale.set(0.8, 1.5, 0.8);
    mesh.position.set(data.position?.x || 0, (data.position?.y || 0) + 0.75, data.position?.z || 0);
    return mesh;
}
/**
 * Cria mesh de ponto de amostragem.
 *
 * REPRESENTACAO:
 * - Pequena esfera ou diamante
 * - Cor varia com resultado (verde/vermelho/cinza)
 * - Posicao no ponto de coleta
 *
 * @param {any} element - Dados da amostra
 * data.position - Posicao {x, y, z}
 * data.result - Resultado ('positive', 'negative', 'pending')
 * @returns {any}
 */
/** @param {any} element @param {any} element */
function createSampleMesh(data: any, element: any) {
    const geometry = getCachedGeometry('octa_1', () => new Three.OctahedronGeometry(1));
    // Cor baseada no resultado
    const resultColors = {
        positive: 0xef4444, // Vermelho
        negative: 0x22c55e, // Verde
        pending: 0x9ca3af, // Cinza
    };
    const sampleColor = parseColor(element?.color) || (resultColors as any)[data.result] || 0x9ca3af;
    const matKey = `std_${sampleColor}_o_1`;
    const material = getCachedMaterial(matKey, () => new Three.MeshStandardMaterial({
        color: sampleColor,
        roughness: 0.5,
    }));
    const mesh = new Three.Mesh(geometry, material);
    mesh.scale.set(0.5, 0.5, 0.5);
    const baseY = data.position?.y ?? 0;
    mesh.position.set(data.position?.x || 0, baseY + 0.5, data.position?.z || 0);
    return mesh;
}
// ----------------------------------------------------------------
// CRIADORES PARA FAMILIAS GEOLOGICAS/ESTRUTURAIS
// ----------------------------------------------------------------
/**
 * Cria mesh de falha geologica (plano semi-transparente).
 *
 * REPRESENTACAO:
 * - Plano fino rotacionado pelo strike e dip
 * - Semi-transparente vermelho escuro
 * - Espessura fixa de 0.5 unidades
 *
 * @param {any} data - Dados da falha
 * data.strikeAngle - Direcao do strike em graus (0-360)
 * data.dipAngle - Angulo de mergulho em graus (0-90)
 * data.length - Comprimento da falha em metros
 * data.depth - Profundidade da falha em metros
 * @param {any} element - Elemento completo
 * @returns {any}
 */
/** @param {any} data @param {any} element */
function createFaultMesh(data: any, element: any) {
    const length = data.length || 100;
    const depth = data.depth || 50;
    const strikeAngle = data.strikeAngle || 0;
    const dipAngle = data.dipAngle ?? 60;
    const geometry = new Three.BoxGeometry(length, depth, 0.5);
    const faultColor = parseColor(element?.color) || 0x8b0000;
    const matKey = `fault_${faultColor}_t`;
    const material = getCachedMaterial(matKey, () => new Three.MeshStandardMaterial({
        color: faultColor,
        transparent: true,
        opacity: 0.5,
        side: Three.DoubleSide,
        roughness: 0.7,
    }));
    const mesh = new Three.Mesh(geometry, material);
    // Rotacao: strike (Y) e dip (Z local apos strike)
    const DEG = Math.PI / 180;
    mesh.rotation.y = strikeAngle * DEG;
    mesh.rotation.z = (90 - dipAngle) * DEG;
    // Posiciona com centro deslocado para baixo
    const cx = data.coordinates?.easting || 0;
    const cz = data.coordinates?.northing || 0;
    mesh.position.set(cx, -depth / 2, cz);
    return mesh;
}
// ----------------------------------------------------------------
// CRIADORES PARA FAMILIAS UTILITARIAS/GENERICAS
// ----------------------------------------------------------------
/**
 * Cria mesh de blueprint/espacial (importacao CAD/GIS).
 *
 * REPRESENTACAO:
 * - Linha de contorno no plano horizontal
 * - Similar ao boundary mas sem overlay de imagem
 * - Usado para footprints importados de DXF
 *
 * @param {any} element - Dados do blueprint
 * data.vertices - Array de vertices {x, z}
 * @returns {any}
 */
/** @param {any} element @param {any} element */
function createBlueprintMesh(data: any, element: any) {
    const vertices = data.vertices || [];
    if (vertices.length < 3)
        return null;
    const group = new Three.Group();
    group.name = 'blueprint-mesh-group';
    const blueprintColor = parseColor(element?.color) || 0x3b82f6;
    // Linha de contorno (outline)
    const points = vertices.map(
    /** @param {any} element */
    (v: any) => new Three.Vector3(v.x, 0.1, v.z));
    points.push(points[0].clone()); // Fecha o loop
    const lineGeom = new Three.BufferGeometry().setFromPoints(points);
    const lineMatKey = `line_${blueprintColor}`;
    const lineMat = getCachedMaterial(lineMatKey, () => new Three.LineBasicMaterial({
        color: blueprintColor,
        linewidth: 2,
    }));
    const line = new Three.Line(lineGeom, lineMat);
    line.name = 'outline';
    line.frustumCulled = false;
    group.add(line);
    // Plano preenchido semi-transparente
    const shape = new Three.Shape();
    shape.moveTo(vertices[0].x, vertices[0].z);
    for (let i = 1; i < vertices.length; i++) {
        shape.lineTo(vertices[i].x, vertices[i].z);
    }
    shape.closePath();
    const planeGeom = new Three.ShapeGeometry(shape);
    normalizeUVs(planeGeom);
    planeGeom.rotateX(-Math.PI / 2);
    planeGeom.translate(0, 0.05, 0);
    const planeMatKey = `basic_${blueprintColor}_t_0.15`;
    const planeMat = getCachedMaterial(planeMatKey, () => new Three.MeshBasicMaterial({
        color: blueprintColor,
        transparent: true,
        opacity: 0.15,
        side: Three.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
    }));
    const plane = new Three.Mesh(planeGeom, planeMat);
    plane.name = 'fill';
    plane.frustumCulled = false;
    group.add(plane);
    return group;
}
/**
 * Cria mesh de sensor IoT.
 *
 * REPRESENTACAO:
 * - Pequena torre/estacao com base e antena
 * - Cor azul tecnologica
 *
 * @param {any} element - Dados do sensor
 * data.position - Posicao {x, y, z}
 * @returns {any}
 */
/** @param {any} element @param {any} element */
function createSensorMesh(data: any, element: any) {
    const group = new Three.Group();
    group.name = 'sensor-mesh-group';
    const sensorColor = parseColor(element?.color) || 0x0ea5e9;
    _buildSensorBase(group, sensorColor);
    _buildSensorAntenna(group);
    group.position.set(data.position?.x || 0, data.position?.y || 0, data.position?.z || 0);
    return group;
}
/** @param {any} group  @param {number} color */
function _buildSensorBase(group: any, color: any) {
    const geom = getCachedGeometry('cyl_16', () => new Three.CylinderGeometry(1, 1, 1, 16));
    const mat = getCachedMaterial(`std_${color}_o_1`, () => new Three.MeshStandardMaterial({
        color,
        roughness: 0.4,
        metalness: 0.3,
    }));
    const base = new Three.Mesh(geom, mat);
    base.scale.set(0.3, 0.6, 0.3);
    base.position.y = 0.3;
    group.add(base);
}
/** @param {any} group */
function _buildSensorAntenna(group: any) {
    const antennaGeom = getCachedGeometry('cyl_8', () => new Three.CylinderGeometry(1, 1, 1, 8));
    const antennaColor = 0x64748b; // Cinza fixo — haste metalica neutra, independente da cor do sensor
    const antennaMat = getCachedMaterial(`std_${antennaColor}_o_1`, () => new Three.MeshStandardMaterial({ color: antennaColor, roughness: 0.5 }));
    const antenna = new Three.Mesh(antennaGeom, antennaMat);
    antenna.scale.set(0.05, 0.8, 0.05);
    antenna.position.y = 1.0;
    group.add(antenna);
    const tipGeom = getCachedGeometry('sphere_16', () => new Three.SphereGeometry(1, 16, 16));
    const tipColor = 0xef4444; // Vermelho fixo — indicador de ativo/alerta, cor de sinal universal
    const tipMat = getCachedMaterial(`std_${tipColor}_o_1`, () => new Three.MeshStandardMaterial({
        color: tipColor,
        emissive: tipColor,
        emissiveIntensity: 0.3,
    }));
    const tip = new Three.Mesh(tipGeom, tipMat);
    tip.scale.set(0.1, 0.1, 0.1);
    tip.position.y = 1.4;
    tip.name = 'sensor-tip';
    group.add(tip);
}
/**
 * Cria mesh para elemento intangivel (ativo nao-fisico).
 *
 * REPRESENTACAO:
 * - Diamante/flutuante etereo
 * - Cor roxa/ciano com brilho
 * - Indica elemento conceitual/nao fisico
 *
 * @param {any} element - Dados do elemento
 * data.position - Posicao {x, y, z}
 * @returns {any}
 */
/** @param {any} element @param {any} element */
function createIntangibleMesh(data: any, element: any) {
    const geometry = getCachedGeometry('octa_1', () => new Three.OctahedronGeometry(1));
    const intangibleColor = parseColor(element?.color) || 0xa855f7;
    const matKey = `std_${intangibleColor}_t_0.7`;
    const material = getCachedMaterial(matKey, () => new Three.MeshStandardMaterial({
        color: intangibleColor,
        transparent: true,
        opacity: 0.7,
        emissive: intangibleColor,
        emissiveIntensity: 0.2,
        roughness: 0.2,
    }));
    const mesh = new Three.Mesh(geometry, material);
    mesh.name = 'intangible-mesh';
    mesh.scale.set(0.8, 1.2, 0.8);
    mesh.position.set(data.position?.x || 0, (data.position?.y || 0) + 0.6, data.position?.z || 0);
    return mesh;
}
/**
 * Cria mesh para elemento generico.
 *
 * REPRESENTACAO:
 * - Cubo simples como representacao generica
 * - Cor cinza ou definida pelo usuario
 * - Usado quando nao ha um tipo especifico
 *
 * @param {any} element - Dados do elemento
 * data.position - Posicao {x, y, z}
 * @returns {any}
 */
/** @param {any} element @param {any} element */
function createGenericMesh(data: any, element: any) {
    const geometry = getCachedGeometry('box_1', () => new Three.BoxGeometry(1, 1, 1));
    const genericColor = parseColor(element?.color) || 0x6b7280;
    const matKey = `std_${genericColor}_o_1`;
    const material = getCachedMaterial(matKey, () => new Three.MeshStandardMaterial({
        color: genericColor,
        roughness: 0.6,
    }));
    const mesh = new Three.Mesh(geometry, material);
    mesh.name = 'generic-mesh';
    mesh.scale.set(0.8, 0.8, 0.8);
    mesh.position.set(data.position?.x || 0, (data.position?.y || 0) + 0.4, data.position?.z || 0);
    return mesh;
}
/** Altura de pairagem do drone (m) — leitura visual de "aeronave", não altitude de rota. */
const DRONE_HOVER_Y = 1.2;
/** Braços do quadricóptero, em unidades locais do grupo (x, z). */
const DRONE_ROTOR_OFFSETS = [
    { x: -0.45, z: -0.45 },
    { x: 0.45, z: -0.45 },
    { x: -0.45, z: 0.45 },
    { x: 0.45, z: 0.45 },
];
/**
 * Cria mesh para drone / UAV (ENERGY-SCENARIOS-001#5).
 *
 * REPRESENTACAO:
 * - Fuselagem achatada + 4 discos de rotor nos cantos = quadricoptero legivel
 *   em zoom de cena, ate existir GLB curado (hoje na whitelist sem modelo 3D).
 * - Pairando acima do solo (DRONE_HOVER_Y) — offset aplicado SO na posicao do
 *   grupo, sem mutar data.position (rebuild via PATCH nao empilha altura, mesma
 *   disciplina de elevateFlightPath).
 * - Ciano por default: mesma familia visual da flight_route que o drone percorre.
 *
 * @param {any} data - data.position {x, y, z}
 * @param {any} element - element.color opcional
 * @returns {any}
 */
function createDroneMesh(data: any, element: any) {
    const group = new Three.Group();
    group.name = 'drone-mesh-group';
    const droneColor = parseColor(element?.color) || 0x22d3ee;
    const bodyGeom = getCachedGeometry('box_1', () => new Three.BoxGeometry(1, 1, 1));
    const bodyMat = getCachedMaterial(`std_${droneColor}_o_1`, () => new Three.MeshStandardMaterial({
        color: droneColor,
        roughness: 0.4,
        metalness: 0.3,
    }));
    const body = new Three.Mesh(bodyGeom, bodyMat);
    body.name = 'drone-body';
    body.scale.set(0.6, 0.18, 0.6);
    group.add(body);
    _buildDroneRotors(group);
    group.position.set(
        data.position?.x || 0,
        (data.position?.y || 0) + DRONE_HOVER_Y,
        data.position?.z || 0,
    );
    return group;
}
/** @param {any} group */
function _buildDroneRotors(group: any) {
    const geom = getCachedGeometry('cyl_16', () => new Three.CylinderGeometry(1, 1, 1, 16));
    const rotorColor = 0x475569; // Cinza-ardosia fixo — braco/helice, independente da cor do drone
    const mat = getCachedMaterial(`std_${rotorColor}_o_1`, () => new Three.MeshStandardMaterial({ color: rotorColor, roughness: 0.5 }));
    for (const offset of DRONE_ROTOR_OFFSETS) {
        const rotor = new Three.Mesh(geom, mat);
        rotor.scale.set(0.32, 0.03, 0.32);
        rotor.position.set(offset.x, 0.12, offset.z);
        group.add(rotor);
    }
}
/**
 * Infra linear mesh — estrutura linear genérica de infraestrutura (rodovia,
 * ferrovia, duto, cabo, esteira, gasoduto). Path-based via data.path com
 * largura customizável. Cor cinza-asfalto por default.
 *
 * data.path [{x,y,z}] — pontos de controle (LinearPathStrategy)
 * data.width — largura da via (default 4m, range 1-50m típico)
 *
 * TRUST-001 #3 promotion (2026-05-30).
 */
function createInfraLinearMesh(data: any, element: any) {
    const path = data.path || [
        { x: -20, y: 0, z: 0 },
        { x: 20, y: 0, z: 0 },
    ];
    const width = Math.max(0.1, Number(data?.width) || 4);
    const geometry = _buildRiverTubeGeometry(path, width);
    if (!geometry)
        return null;
    const infraColor = parseColor(element?.color) || 0x607d8b;
    const material = getCachedMaterial(`std_${infraColor}_r07_m02`, () => new Three.MeshStandardMaterial({
        color: infraColor,
        roughness: 0.7,
        metalness: 0.2,
    }));
    const tubeMesh = new Three.Mesh(geometry, material);
    tubeMesh.name = 'infra-linear-tube';
    tubeMesh.frustumCulled = false;
    const group = new Three.Group();
    group.name = 'infra-linear-mesh-group';
    group.add(tubeMesh);
    return group;
}
/**
 * Route flow mesh — rota direcional (amostragem, transporte, fluxo). Path-
 * based via data.path com largura menor (representa traçado, não estrutura).
 * Cor amarelo-sinalização por default. Backward-compat com data.points.
 *
 * data.path [{x,y,z}] — waypoints (LinearPathStrategy)
 * data.width — largura visual (default 1.5m)
 *
 * TRUST-001 #3 promotion (2026-05-30).
 */
function createRouteFlowMesh(data: any, element: any) {
    const basePath = data.path || data.points || [
        { x: -20, y: 0, z: 0 },
        { x: 20, y: 0, z: 0 },
    ];
    // ECBYTS-ENERGY-SCENARIOS-001#5 — flight_route renderiza ELEVADA (3D):
    // path deslocado em Y por flight_properties.altitude_m (não muta data.path,
    // senão o rebuild empilharia altitude a cada PATCH) + cor ciano distinta
    // das rotas terrestres (amarelo-sinalização).
    const isFlight = isFlightRouteData(data);
    const path = isFlight ? elevateFlightPath(basePath, resolveFlightAltitude(data)) : basePath;
    const width = Math.max(0.1, Number(data?.width) || 1.5);
    const geometry = _buildRiverTubeGeometry(path, width);
    if (!geometry)
        return null;
    const routeColor = parseColor(element?.color) || (isFlight ? 0x29b6f6 : 0xfbc02d);
    const material = getCachedMaterial(`std_${routeColor}_r05_m01`, () => new Three.MeshStandardMaterial({
        color: routeColor,
        roughness: 0.5,
        metalness: 0.1,
    }));
    const tubeMesh = new Three.Mesh(geometry, material);
    tubeMesh.name = 'route-flow-tube';
    tubeMesh.frustumCulled = false;
    const group = new Three.Group();
    group.name = 'route-flow-mesh-group';
    group.add(tubeMesh);
    // Normaliza data.path para LinearPathStrategy futura (se vier de data.points
    // legacy, espelha em data.path para a strategy editar).
    if (!data.path && data.points)
        data.path = data.points;
    return group;
}
/**
 * Pit mesh — escavação a céu aberto (open-pit mine, pedreira). Footprint
 * poligonal extrudado PARA BAIXO (Y negativo) representando a cava. Compatível
 * com PolygonStrategy (data.vertices) + backward-compat (data.dimensions).
 *
 * data.vertices [{x,y,z}] — borda superior da cava na cota 0 (PolygonStrategy)
 * data.depth — profundidade (default 20m, range 5-500m típico)
 * data.dimensions {length, width, depth} — legacy (caixa)
 *
 * TRUST-001 #3 promotion (2026-05-30).
 */
function createPitMesh(data: any, element: any) {
    const pitColor = parseColor(element?.color) || 0x8d6e63;
    const depth = Math.max(0.1, Number(data?.depth) || 20);
    const baseY = data.position?.y ?? 0;
    const material = getCachedMaterial(`std_${pitColor}_r09_m00`, () => new Three.MeshStandardMaterial({
        color: pitColor,
        roughness: 0.95,
        metalness: 0.0,
        side: Three.DoubleSide,
    }));
    // Caminho 1 — polígono explícito (PolygonStrategy): borda superior
    if (Array.isArray(data?.vertices) && data.vertices.length >= 3) {
        const verts = data.vertices;
        const shape = new Three.Shape();
        shape.moveTo(verts[0].x, verts[0].z);
        for (let i = 1; i < verts.length; i++) {
            shape.lineTo(verts[i].x, verts[i].z);
        }
        shape.closePath();
        const geom = new Three.ExtrudeGeometry(shape, {
            depth,
            bevelEnabled: false,
            curveSegments: 1,
        });
        // ExtrudeGeometry sai no plano XY com profundidade em +Z. Rotacionar
        // +90° em X coloca o footprint no plano XZ; em seguida transladar Y
        // para baixo coloca a borda superior na cota baseY e o fundo em baseY-depth.
        geom.rotateX(Math.PI / 2);
        geom.translate(0, -depth, 0);
        normalizeUVs(geom);
        const mesh = new Three.Mesh(geom, material);
        mesh.name = 'pit-mesh';
        mesh.position.set(data.position?.x || 0, baseY, data.position?.z || 0);
        return mesh;
    }
    // Caminho 2 — legado: caixa por dimensões. length=eixo X, width=eixo Z,
    // depth=eixo Y. Posicionada com topo na cota baseY (centro em baseY-depth/2).
    // Cálculo PURO das dimensões/posição → _meshFactoryPure.ts (números idênticos).
    const spec = _resolvePitBoxSpec(data);
    const geometry = new Three.BoxGeometry(spec.length, spec.height, spec.width);
    const mesh = new Three.Mesh(geometry, material);
    mesh.name = 'pit-mesh';
    mesh.position.set(data.position?.x || 0, spec.centerY, data.position?.z || 0);
    return mesh;
}
/**
 * Dam mesh — barragem de contenção (água/rejeitos). Footprint poligonal
 * extrudado verticalmente. Compatível com PolygonStrategy (data.vertices)
 * + backward-compat para criação por dimensões (data.dimensions).
 *
 * data.vertices [{x,y,z}] — footprint na base (PolygonStrategy)
 * data.height — altura da crista (default 5m, range 3-50m típico)
 * data.dimensions {length, width, height} — legacy (retângulo)
 *
 * TRUST-001 #3 promotion (2026-05-29).
 */
function createDamMesh(data: any, element: any) {
    const damColor = parseColor(element?.color) || 0x9e9e9e;
    const height = Math.max(0.1, Number(data?.height) || 5);
    const baseY = data.position?.y ?? 0;
    const buildExtrudedFromShape = (shape: any) => {
        const geom = new Three.ExtrudeGeometry(shape, {
            depth: height,
            bevelEnabled: false,
            curveSegments: 1,
        });
        geom.rotateX(-Math.PI / 2);
        normalizeUVs(geom);
        return geom;
    };
    const material = getCachedMaterial(`std_${damColor}_r08_m01`, () => new Three.MeshStandardMaterial({
        color: damColor,
        roughness: 0.8,
        metalness: 0.1,
    }));
    // Caminho 1 — polígono explícito (PolygonStrategy): footprint na base
    if (Array.isArray(data?.vertices) && data.vertices.length >= 3) {
        const verts = data.vertices;
        const shape = new Three.Shape();
        shape.moveTo(verts[0].x, verts[0].z);
        for (let i = 1; i < verts.length; i++) {
            shape.lineTo(verts[i].x, verts[i].z);
        }
        shape.closePath();
        const geom = buildExtrudedFromShape(shape);
        const mesh = new Three.Mesh(geom, material);
        mesh.name = 'dam-mesh';
        mesh.position.set(data.position?.x || 0, baseY, data.position?.z || 0);
        return mesh;
    }
    // Caminho 2 — legado: retângulo por dimensões. Crista linear: length=eixo X,
    // width=espessura (eixo Z). Reproduz barragem-de-terra simples.
    // Cálculo PURO das dimensões/posição → _meshFactoryPure.ts (números idênticos).
    const spec = _resolveDamBoxSpec(data);
    const geometry = new Three.BoxGeometry(spec.length, spec.height, spec.width);
    const mesh = new Three.Mesh(geometry, material);
    mesh.name = 'dam-mesh';
    mesh.position.set(data.position?.x || 0, spec.centerY, data.position?.z || 0);
    return mesh;
}
/**
 * Helper compartilhado por area/habitat rebuilders: gera ShapeGeometry
 * normalizada (UVs + rotação para plano XZ) a partir de vértices 2D.
 * area e habitat são meshes simples (não Group); reusam exatamente o mesmo
 * shape pipeline do createAreaMesh/createHabitatMesh.
 */
function _buildPolygonShapeGeometry(vertices: any) {
    const shape = new Three.Shape();
    shape.moveTo(vertices[0].x, vertices[0].z);
    for (let i = 1; i < vertices.length; i++) {
        shape.lineTo(vertices[i].x, vertices[i].z);
    }
    shape.closePath();
    const geom = new Three.ShapeGeometry(shape);
    geom.rotateX(-Math.PI / 2);
    return geom;
}
/**
 * Reconstrói geometria de area in-place após vertex edit. area é Three.Mesh
 * direto (não Group) → swap mesh.geometry.
 *
 * Closing gap descoberto em 2026-05-29 (commit 84acfd9a/9a TRUST-001 #3
 * dam promotion): rebuildBoundaryGeometry era silent no-op para area
 * porque buscava children 'outline'/'overlay' inexistentes em Mesh simples.
 */
export function rebuildAreaMesh(mesh: any, vertices: any, _data: any) {
    if (!mesh || !vertices || vertices.length < 3)
        return;
    if (!mesh.geometry || mesh.geometry.type !== 'ShapeGeometry')
        return;
    const geom = _buildPolygonShapeGeometry(vertices);
    if (mesh.geometry)
        mesh.geometry.dispose();
    mesh.geometry = geom;
}
/**
 * Reconstrói geometria de habitat in-place. Mesma estrutura visual que area
 * (Mesh com ShapeGeometry). Closing gap mesma origem que rebuildAreaMesh.
 */
export function rebuildHabitatMesh(mesh: any, vertices: any, _data: any) {
    if (!mesh || !vertices || vertices.length < 3)
        return;
    if (!mesh.geometry || mesh.geometry.type !== 'ShapeGeometry')
        return;
    const geom = _buildPolygonShapeGeometry(vertices);
    if (mesh.geometry)
        mesh.geometry.dispose();
    mesh.geometry = geom;
}
/**
 * Reconstrói geometria de blueprint in-place. blueprint é Three.Group com
 * children 'outline' (Line) e 'fill' (Mesh) — ambos precisam swap.
 */
export function rebuildBlueprintMesh(group: any, vertices: any, _data: any) {
    if (!group || !vertices || vertices.length < 3)
        return;
    // 1. outline (LineLoop)
    const outline = group.getObjectByName ? group.getObjectByName('outline') : null;
    if (outline) {
        const points = vertices.map((v: any) => new Three.Vector3(v.x, 0.1, v.z));
        points.push(points[0].clone());
        if (outline.geometry)
            outline.geometry.dispose();
        outline.geometry = new Three.BufferGeometry().setFromPoints(points);
    }
    // 2. fill (Mesh com ShapeGeometry)
    const fill = group.getObjectByName ? group.getObjectByName('fill') : null;
    if (fill) {
        const shape = new Three.Shape();
        shape.moveTo(vertices[0].x, vertices[0].z);
        for (let i = 1; i < vertices.length; i++) {
            shape.lineTo(vertices[i].x, vertices[i].z);
        }
        shape.closePath();
        const planeGeom = new Three.ShapeGeometry(shape);
        normalizeUVs(planeGeom);
        planeGeom.rotateX(-Math.PI / 2);
        planeGeom.translate(0, 0.05, 0);
        if (fill.geometry)
            fill.geometry.dispose();
        fill.geometry = planeGeom;
    }
}
/**
 * Reconstrói geometria de infra_linear in-place. Para mesh criado pelo
 * createInfraLinearMesh (Group com child 'infra-linear-tube').
 */
export function rebuildInfraLinearGeometry(group: any, path: any, data: any) {
    if (!group || !path || path.length < 2)
        return;
    const tubeMesh = group.getObjectByName ? group.getObjectByName('infra-linear-tube') : null;
    if (!tubeMesh)
        return;
    const width = Math.max(0.1, Number(data?.width) || 4);
    const newGeom = _buildRiverTubeGeometry(path, width);
    if (!newGeom)
        return;
    if (tubeMesh.geometry)
        tubeMesh.geometry.dispose();
    tubeMesh.geometry = newGeom;
}
/**
 * Reconstrói geometria de route_flow in-place. Para mesh criado pelo
 * createRouteFlowMesh (Group com child 'route-flow-tube').
 */
export function rebuildRouteFlowGeometry(group: any, path: any, data: any) {
    if (!group || !path || path.length < 2)
        return;
    const tubeMesh = group.getObjectByName ? group.getObjectByName('route-flow-tube') : null;
    if (!tubeMesh)
        return;
    const width = Math.max(0.1, Number(data?.width) || 1.5);
    // flight_route: mesma elevação do create — rebuild via edit/PATCH mantém a
    // rota no ar (elevateFlightPath é puro, não empilha altitude no data.path).
    const renderPath = isFlightRouteData(data) ? elevateFlightPath(path, resolveFlightAltitude(data)) : path;
    const newGeom = _buildRiverTubeGeometry(renderPath, width);
    if (!newGeom)
        return;
    if (tubeMesh.geometry)
        tubeMesh.geometry.dispose();
    tubeMesh.geometry = newGeom;
}
/**
 * Reconstrói geometria de pit in-place (sem recriar mesh). Para pit criado
 * via PolygonStrategy (data.vertices) — substitui a ExtrudeGeometry quando
 * vértices mudam. No-op para pit legacy (Box).
 *
 * @param {any} mesh - Three.Mesh com ExtrudeGeometry
 * @param {Array<{x:number, y?:number, z:number}>} vertices
 * @param {any} vertices - element.data (lê depth; default 20)
 */
export function rebuildPitGeometry(mesh: any, vertices: any, data: any) {
    if (!mesh || !vertices || vertices.length < 3)
        return;
    if (!mesh.geometry || mesh.geometry.type !== 'ExtrudeGeometry')
        return;
    const depth = Math.max(0.1, Number(data?.depth) || 20);
    const shape = new Three.Shape();
    shape.moveTo(vertices[0].x, vertices[0].z);
    for (let i = 1; i < vertices.length; i++) {
        shape.lineTo(vertices[i].x, vertices[i].z);
    }
    shape.closePath();
    const geom = new Three.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: false,
        curveSegments: 1,
    });
    geom.rotateX(Math.PI / 2);
    geom.translate(0, -depth, 0);
    normalizeUVs(geom);
    if (mesh.geometry)
        mesh.geometry.dispose();
    mesh.geometry = geom;
}
/**
 * Reconstrói geometria de dam in-place (sem recriar mesh).
 * Para dam criado via PolygonStrategy (data.vertices) — substitui a
 * ExtrudeGeometry quando vértices mudam. No-op para dam legacy (Box).
 *
 * @param {any} mesh - Three.Mesh com ExtrudeGeometry
 * @param {Array<{x:number, y?:number, z:number}>} vertices
 * @param {any} vertices - element.data (lê height; default 5)
 */
export function rebuildDamGeometry(mesh: any, vertices: any, data: any) {
    if (!mesh || !vertices || vertices.length < 3)
        return;
    // Só rebuilda se for o path PolygonStrategy (mesh único com ExtrudeGeometry).
    // Path legacy (Box por dimensions) NÃO usa vertices — não roda PolygonStrategy.
    if (!mesh.geometry || mesh.geometry.type !== 'ExtrudeGeometry')
        return;
    const height = Math.max(0.1, Number(data?.height) || 5);
    const shape = new Three.Shape();
    shape.moveTo(vertices[0].x, vertices[0].z);
    for (let i = 1; i < vertices.length; i++) {
        shape.lineTo(vertices[i].x, vertices[i].z);
    }
    shape.closePath();
    const geom = new Three.ExtrudeGeometry(shape, {
        depth: height,
        bevelEnabled: false,
        curveSegments: 1,
    });
    geom.rotateX(-Math.PI / 2);
    normalizeUVs(geom);
    if (mesh.geometry)
        mesh.geometry.dispose();
    mesh.geometry = geom;
}
/**
 * Reconstrói geometria de boundary in-place (sem recriar mesh).
 * Usado pelo shape editor para atualizar durante arrasto de pontos.
 *
 * @param {any} _data - Grupo do boundary
 * @param {Array<{x:number, y?:number, z:number}>} vertices - Vértices do boundary
 * @param {object} vertices - Dados do elemento (overlayOpacity, etc.)
 */
/** @param {any} _data @param {any} vertices @param {any} vertices */
export function rebuildBoundaryGeometry(group: any, vertices: any, _data: any) {
    if (!group || !vertices || vertices.length < 3)
        return;
    // 1. Reconstrói outline (Line)
    const outline = group.getObjectByName('outline');
    if (outline) {
        const points = vertices.map(
        /** @param {any} path */
        (v: any) => new Three.Vector3(v.x, v.y || 0.2, v.z));
        points.push(points[0].clone()); // Fecha o loop
        if (outline.geometry)
            outline.geometry.dispose();
        outline.geometry = new Three.BufferGeometry().setFromPoints(points);
    }
    // 2. Reconstrói overlay (ShapeGeometry preenchido)
    const overlay = group.getObjectByName('overlay');
    if (overlay) {
        const shape = new Three.Shape();
        shape.moveTo(vertices[0].x, vertices[0].z);
        for (let i = 1; i < vertices.length; i++) {
            shape.lineTo(vertices[i].x, vertices[i].z);
        }
        shape.closePath();
        if (overlay.geometry)
            overlay.geometry.dispose();
        const planeGeom = new Three.ShapeGeometry(shape);
        // Normaliza UVs para [0,1] e rotaciona para plano horizontal
        normalizeUVs(planeGeom);
        planeGeom.rotateX(-Math.PI / 2);
        planeGeom.translate(0, 0.1, 0);
        overlay.geometry = planeGeom;
    }
}
/**
 * Reconstrói geometria de rio in-place (sem recriar mesh).
 * Usado pelo shape editor para atualizar durante arrasto de pontos.
 *
 * @param {any} path - Grupo do rio
 * @param {Array<{x:number, y?:number, z:number}>} path - Pontos do caminho
 * @param {number} width - Largura do rio
 */
/** @param {any} path @param {any} path @param {any} width */
export function rebuildRiverGeometry(group: any, path: any, width: any) {
    if (!group || !path || path.length < 2)
        return;
    const tubeMesh = group.getObjectByName('river-tube');
    if (!tubeMesh)
        return;
    const nextGeometry = _buildRiverTubeGeometry(path, width);
    if (!nextGeometry)
        return;
    // Descarta geometria antiga e cria nova
    if (tubeMesh.geometry)
        tubeMesh.geometry.dispose();
    tubeMesh.geometry = nextGeometry;
    requestRender();
}
/**
 * Reconstrói geometria extrudada (building/tank) in-place.
 * Usado pelo shape editor para atualizar durante arrasto de pontos.
 *
 * @param {any} data - Grupo do elemento
 * @param {Array<{x:number, y?:number, z:number}>} vertices - Vértices da base
 * @param {any} vertices - Dados do elemento (height, etc)
 */
/** @param {any} data @param {any} vertices @param {any} vertices */
export function rebuildExtrudedGeometry(group: any, vertices: any, data: any) {
    if (!group || !vertices || vertices.length < 3)
        return;
    const topMesh = group.getObjectByName('top');
    const sidesMesh = group.getObjectByName('sides');
    // Cria shape a partir dos vértices
    const shape = new Three.Shape();
    shape.moveTo(vertices[0].x, vertices[0].z);
    for (let i = 1; i < vertices.length; i++) {
        shape.lineTo(vertices[i].x, vertices[i].z);
    }
    shape.closePath();
    const height = data?.height || 5;
    // Reconstrói topo (se existir)
    if (topMesh) {
        if (topMesh.geometry)
            topMesh.geometry.dispose();
        const topShape = new Three.Shape();
        topShape.moveTo(vertices[0].x, vertices[0].z);
        for (let i = 1; i < vertices.length; i++) {
            topShape.lineTo(vertices[i].x, vertices[i].z);
        }
        topShape.closePath();
        topMesh.geometry = new Three.ShapeGeometry(topShape);
        normalizeUVs(topMesh.geometry);
        topMesh.geometry.rotateX(-Math.PI / 2);
        topMesh.position.y = height;
    }
    // Reconstrói lados (se existir)
    if (sidesMesh) {
        if (sidesMesh.geometry)
            sidesMesh.geometry.dispose();
        const extrudeSettings = {
            depth: height,
            bevelEnabled: false,
        };
        sidesMesh.geometry = new Three.ExtrudeGeometry(shape, extrudeSettings);
        sidesMesh.geometry.rotateX(-Math.PI / 2);
    }
    requestRender();
}
//# sourceMappingURL=meshFactory.js.map
