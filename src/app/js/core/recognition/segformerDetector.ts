// @ts-check
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
   SEGFORMER DETECTOR — Semantic segmentation via SegFormer-B0
   ================================================================

   Segmentacao semantica de imagens aereas usando SegFormer-B0 treinado
   no ADE20K (150 classes). Gera mascara por-pixel com labels semanticos,
   converte para grid de categorias e reutiliza blob pipeline do
   colorAnalysis.js.

   Modelo: Xenova/segformer-b0-finetuned-ade-512-512 (~4-5 MB quantizado)
   CDN: Transformers.js (mesmo ja usado pelo OWL-ViT)

   Vantagens vs OWL-ViT:
   - 14x menor (5MB vs 155MB)
   - Per-pixel segmentation (não bounding boxes)
   - ADE20K classes diretamente relevantes (building, road, tree, water)

   ================================================================ */
import { findBlobs, extractContour, blobToFeature, morphClose, stampAnnotations } from './colorAnalysis.js';
import { importCDN } from '../../utils/helpers/cdnLoader.js';
// ----------------------------------------------------------------
// CDN & MODEL CONFIGURATION
// ----------------------------------------------------------------
const TRANSFORMERS_CDN = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';
const MODEL_NAME = 'Xenova/segformer-b0-finetuned-ade-512-512';
/**
 * ADE20K class index → environmental element family.
 * Mapeamento das 150 classes ADE20K para familias do ecbyts.
 * Classes nao mapeadas (null) sao ignoradas.
 *
 * ADE20K index reference (0-based):
 * 0=wall, 1=building, 2=sky, 3=floor, 4=tree, 5=ceiling,
 * 6=road, 7=bed, 8=windowpane, 9=grass, 10=cabinet, 11=sidewalk,
 * 12=person, 13=earth, 14=door, 15=table, 16=mountain, 17=plant,
 * 18=curtain, 19=chair, 20=car, 21=water, 22=painting, 23=sofa,
 * 24=shelf, 25=house, 26=sea, 27=mirror, 28=rug, 29=field,
 * 30=armchair, 31=seat, 32=fence, 33=desk, 34=rock, 35=wardrobe,
 * 36=lamp, 37=bathtub, 38=railing, 39=cushion, 40=base, 41=box,
 * 42=column, 43=signboard, 44=chest, 45=counter, 46=sand, 47=sink,
 * 48=skyscraper, 49=fireplace, 50=refrigerator, 51=grandstand,
 * 52=path, 53=stairs, 54=runway, 55=case, 56=pool_table, 57=pillow,
 * 58=screen_door, 59=stairway, 60=river, 61=bridge, 62=bookcase,
 * 63=blind, 64=coffee_table, 65=toilet, 66=flower, 67=book,
 * 68=hill, 69=bench, 70=countertop, 71=stove, 72=palm, 73=kitchen_island,
 * 74=computer, 75=swivel_chair, 76=boat, 77=bar, 78=arcade_machine,
 * 79=hovel, 80=bus, 81=towel, 82=light, 83=truck, 84=tower,
 * 85=chandelier, 86=awning, 87=streetlight, 88=booth, 89=television,
 * 90=airplane, 91=dirt_track, 92=apparel, 93=pole, 94=land,
 * 95=bannister, 96=escalator, 97=ottoman, 98=bottle, 99=buffet,
 * 100=poster, 101=stage, 102=van, 103=ship, 104=fountain,
 * 105=conveyer, 106=canopy, 107=washer, 108=plaything, 109=swimming_pool,
 * 110=stool, 111=barrel, 112=basket, 113=waterfall, 114=tent,
 * 115=bag, 116=minibike, 117=cradle, 118=oven, 119=ball,
 * 120=food, 121=step, 122=tank, 123=trade_name, 124=microwave,
 * 125=pot, 126=animal, 127=bicycle, 128=lake, 129=dishwasher,
 * 130=screen, 131=blanket, 132=sculpture, 133=hood, 134=sconce,
 * 135=vase, 136=traffic_light, 137=tray, 138=ashcan, 139=fan,
 * 140=pier, 141=crt_screen, 142=plate, 143=monitor, 144=bulletin_board,
 * 145=shower, 146=radiator, 147=glass, 148=clock, 149=flag
 */
const ADE20K_TO_CATEGORY = new Uint8Array(150);
// Category indices (matching colorAnalysis.js CATEGORY_KEYS order):
// 1=water, 2=vegetation, 3=building_bright, 4=building_dark,
// 5=infrastructure, 6=soil
// Using building_dark (4) for all buildings so they merge correctly
// Buildings
ADE20K_TO_CATEGORY[0] = 4; // wall
ADE20K_TO_CATEGORY[1] = 4; // building
ADE20K_TO_CATEGORY[25] = 4; // house
ADE20K_TO_CATEGORY[48] = 4; // skyscraper
ADE20K_TO_CATEGORY[79] = 4; // hovel
ADE20K_TO_CATEGORY[84] = 4; // tower
// Vegetation
ADE20K_TO_CATEGORY[4] = 2; // tree
ADE20K_TO_CATEGORY[9] = 2; // grass
ADE20K_TO_CATEGORY[17] = 2; // plant
ADE20K_TO_CATEGORY[29] = 2; // field
ADE20K_TO_CATEGORY[66] = 2; // flower
ADE20K_TO_CATEGORY[72] = 2; // palm
// Water
ADE20K_TO_CATEGORY[21] = 1; // water
ADE20K_TO_CATEGORY[26] = 1; // sea
ADE20K_TO_CATEGORY[60] = 1; // river → gets river family in blobToFeature via aspect
ADE20K_TO_CATEGORY[109] = 1; // swimming_pool
ADE20K_TO_CATEGORY[113] = 1; // waterfall
ADE20K_TO_CATEGORY[128] = 1; // lake
// Infrastructure (roads, paths → marker)
ADE20K_TO_CATEGORY[6] = 5; // road
ADE20K_TO_CATEGORY[11] = 5; // sidewalk
ADE20K_TO_CATEGORY[52] = 5; // path
ADE20K_TO_CATEGORY[54] = 5; // runway
ADE20K_TO_CATEGORY[91] = 5; // dirt_track
// Soil / Earth
ADE20K_TO_CATEGORY[13] = 6; // earth
ADE20K_TO_CATEGORY[34] = 6; // rock
ADE20K_TO_CATEGORY[46] = 6; // sand
ADE20K_TO_CATEGORY[68] = 6; // hill
ADE20K_TO_CATEGORY[94] = 6; // land
ADE20K_TO_CATEGORY[16] = 6; // mountain
// Tanks
ADE20K_TO_CATEGORY[111] = 4; // barrel → building (will become tank via shape)
ADE20K_TO_CATEGORY[122] = 4; // tank → building
// Vehicles → infrastructure/marker
ADE20K_TO_CATEGORY[20] = 5; // car
ADE20K_TO_CATEGORY[80] = 5; // bus
ADE20K_TO_CATEGORY[83] = 5; // truck
ADE20K_TO_CATEGORY[102] = 5; // van
// Bridge → infrastructure
ADE20K_TO_CATEGORY[61] = 5; // bridge
ADE20K_TO_CATEGORY[32] = 5; // fence
// ----------------------------------------------------------------
// DETECTOR SINGLETON
// Carregado uma unica vez; reutilizado entre chamadas
// ----------------------------------------------------------------
/** @type {any} */
let _segmenter: any = null;
let _loading = false;
/** @type {any} */
let _transformers: any = null;
// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------
/**
 * Detect features in aerial image using SegFormer semantic segmentation.
 * Usa SegFormer-B0 (ADE20K 150 classes) para segmentacao por-pixel.
 *
 * @param {string} imageDataUrl - Base64 data URL da imagem
 * @param {Object} extent - { minX, maxX, minZ, maxZ }
 * @param {Function} [onProgress] - Callback: { status, message, progress }
 * @returns {Promise<Array>} - DetectedFeature[]
 */
/**
 * @param {string} imageDataUrl
 * @param {any} extent
 * @param {Function} [onProgress]
 * @param {any[]} [annotations]
 * @param {any} [options]
 */
export async function analyzeWithSegFormer(imageDataUrl: any, extent: any, onProgress: any, annotations: any = [], options: any = {}) {
    // Step 1: Load Transformers.js from CDN
    if (!_transformers) {
        _notify(onProgress, 'loading', 'Loading ML engine...', 0);
        _transformers = await importCDN(TRANSFORMERS_CDN, { name: 'Transformers.js' });
        if (_transformers.env)
            _transformers.env.allowLocalModels = false;
    }
    // Step 2: Load SegFormer model (~4-5 MB quantized)
    if (!_segmenter) {
        if (_loading)
            throw new Error('Model is already loading. Please wait.');
        _loading = true;
        _notify(onProgress, 'downloading', 'Downloading segmentation model...', 0);
        try {
            _segmenter = await _transformers.pipeline('image-segmentation', MODEL_NAME, {
                quantized: true,
                progress_callback: (data: any) => {
                    if (data.status === 'progress' && typeof data.progress === 'number') {
                        const pct = Math.round(data.progress);
                        _notify(onProgress, 'downloading', `Downloading model... ${pct}%`, pct);
                    }
                    else if (data.status === 'done') {
                        _notify(onProgress, 'downloading', 'Model ready', 100);
                    }
                },
            });
        }
        catch (err: any) {
            _segmenter = null;
            throw new Error(`Failed to load segmentation model: ${err?.message}`, { cause: err });
        }
        finally {
            _loading = false;
        }
    }
    // Step 3: Run semantic segmentation
    _notify(onProgress, 'inference', 'Segmenting image...', -1);
    const results = await _segmenter(imageDataUrl);
    // Step 4: Build category grid from segment masks
    _notify(onProgress, 'processing', 'Analyzing segments...', -1);
    const ANALYSIS_SIZE = 512;
    const grid = _buildGrid(results, ANALYSIS_SIZE);
    // Step 4b: Stamp user annotations onto grid
    // Injeta anotacoes do usuario como disco de pixels classificados
    stampAnnotations(grid, ANALYSIS_SIZE, annotations);
    // Step 5: Morphological close on buildings only
    const darkIdx = 4; // building_dark category index
    const buildingSet = new Set([darkIdx]);
    const closedGrid = morphClose(grid, ANALYSIS_SIZE, ANALYSIS_SIZE, buildingSet);
    // Step 6: Find blobs and convert to features
    const { blobs, blobGrid } = findBlobs(closedGrid, ANALYSIS_SIZE, ANALYSIS_SIZE);
    const totalPixels = ANALYSIS_SIZE * ANALYSIS_SIZE;
    // Extract pixel-accurate contour polygons for each blob
    blobs.forEach((blob, i: number) => {
        blob.contour = extractContour(blobGrid, i + 1, blob, ANALYSIS_SIZE, ANALYSIS_SIZE);
    });
    const features = blobs
        .map((b: any) => {
        const f = blobToFeature(b, ANALYSIS_SIZE, ANALYSIS_SIZE, extent, totalPixels);
        // blobToFeature (colorAnalysis.ts) infers a return union where one
        // branch lacks sourceMethod; widen locally to allow the assignment.
        if (f)
            (f as typeof f & { sourceMethod?: string }).sourceMethod = 'segformer';
        return f;
    })
        .filter((f: any) => f !== null);
    // Sort by confidence descending, limit to 30
    features.sort((a: any, b: any) => b.confidence - a.confidence);
    const limited = features.slice(0, 30);
    // Vectorization Engine: retorna grid junto com features se pedido
    if (options.returnGrid) {
        return { features: limited, grid: closedGrid };
    }
    return limited;
}
/**
 * Check if SegFormer model is already loaded (cached in memory).
 * @returns {boolean}
 */
export function isSegFormerLoaded() {
    return _segmenter !== null;
}
/**
 * Debug function - run SegFormer and return raw model output info.
 * Usado para diagnostico durante desenvolvimento.
 * @param {string} imageDataUrl
 * @returns {Promise<Object>} - Debug info
 */
export async function debugSegFormer(imageDataUrl: any) {
    // Ensure model is loaded
    if (!_transformers) {
        _transformers = await import(/* webpackIgnore: true */ TRANSFORMERS_CDN);
        _transformers.env.allowLocalModels = false;
    }
    if (!_segmenter) {
        _segmenter = await _transformers.pipeline('image-segmentation', MODEL_NAME, { quantized: true });
    }
    const results = await _segmenter(imageDataUrl);
    const segInfo = (results || []).map((seg: any) => ({
        label: seg.label,
        score: seg.score,
        hasMask: !!seg.mask,
        maskWidth: seg.mask?.width,
        maskHeight: seg.mask?.height,
        maskChannels: seg.mask?.channels,
        maskDataLen: seg.mask?.data?.length,
        maskDataType: seg.mask?.data?.constructor?.name,
        maskSample: seg.mask?.data ? Array.from(seg.mask.data.slice(0, 20)) : null,
        parsedIdx: _parseADE20KLabel(seg.label),
        mappedCategory: _parseADE20KLabel(seg.label) >= 0 ? ADE20K_TO_CATEGORY[_parseADE20KLabel(seg.label)] : -1
    }));
    return {
        totalSegments: results?.length || 0,
        segments: segInfo,
        isArray: Array.isArray(results),
        resultType: typeof results,
        resultKeys: results && !Array.isArray(results) ? Object.keys(results) : null,
    };
}
// ----------------------------------------------------------------
// GRID BUILDER - Convert segmentation masks to category grid
// Converte mascaras de segmentacao para grid de categorias
// ----------------------------------------------------------------
/**
 * Build Uint8Array category grid from SegFormer output.
 * Semantic segmentation retorna mascaras binarias (0/255) por classe,
 * sem score por segmento (score=null). Cada pixel pertence a exatamente
 * uma classe - a ultima mascara com valor 255 ganha.
 *
 * @param {any[]} results - Segmenter output: [{ score, label, mask: RawImage }]
 * @param {number} size - Target grid size (512)
 * @returns {Uint8Array} - Category grid
 */
function _buildGrid(results: any, size: any) {
    const total = size * size;
    const grid = new Uint8Array(total);
    // Priority order: process mapped categories, later entries overwrite earlier
    // This is correct for semantic segmentation where masks are exclusive
    for (const segment of results) {
        // Parse ADE20K label to get class index
        const classIdx = _parseADE20KLabel(segment.label);
        if (classIdx < 0 || classIdx >= 150)
            continue;
        const category = ADE20K_TO_CATEGORY[classIdx];
        if (category === 0)
            continue; // Unmapped class — skip
        const mask = segment.mask;
        if (!mask || !mask.data)
            continue;
        // Mask dimensions may differ from ANALYSIS_SIZE - need to resample
        const maskW = mask.width || size;
        const maskH = mask.height || size;
        const channels = mask.channels || 1;
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                // Map grid coords to mask coords
                const mx = Math.floor((x * maskW) / size);
                const my = Math.floor((y * maskH) / size);
                const maskIdx = my * maskW + mx;
                // Mask is binary: 0=not this class, 255=this class
                const maskVal = channels === 1 ? mask.data[maskIdx] : mask.data[maskIdx * channels];
                if (maskVal > 128) {
                    grid[y * size + x] = category!;
                }
            }
        }
    }
    return grid;
}
/**
 * Parse ADE20K label string to get class index.
 * Labels come as "label_N" where N is the ADE20K index.
 * Sometimes they come as just the name - we handle both.
 *
 * @param {string} label - e.g. "building", "label_1", "tree"
 * @returns {number} - ADE20K class index (0-149) or -1
 */
function _parseADE20KLabel(label: any) {
    if (!label)
        return -1;
    // Try "label_N" format first
    const match = label.match(/label_(\d+)/);
    if (match)
        return parseInt(match[1]);
    // Try exact name match from known ADE20K classes
    const nameMap = {
        wall: 0,
        building: 1,
        sky: 2,
        floor: 3,
        tree: 4,
        ceiling: 5,
        road: 6,
        bed: 7,
        windowpane: 8,
        grass: 9,
        cabinet: 10,
        sidewalk: 11,
        person: 12,
        earth: 13,
        door: 14,
        table: 15,
        mountain: 16,
        plant: 17,
        curtain: 18,
        chair: 19,
        car: 20,
        water: 21,
        painting: 22,
        sofa: 23,
        shelf: 24,
        house: 25,
        sea: 26,
        mirror: 27,
        rug: 28,
        field: 29,
        armchair: 30,
        seat: 31,
        fence: 32,
        desk: 33,
        rock: 34,
        wardrobe: 35,
        lamp: 36,
        bathtub: 37,
        railing: 38,
        cushion: 39,
        base: 40,
        box: 41,
        column: 42,
        signboard: 43,
        chest: 44,
        counter: 45,
        sand: 46,
        sink: 47,
        skyscraper: 48,
        fireplace: 49,
        refrigerator: 50,
        grandstand: 51,
        path: 52,
        stairs: 53,
        runway: 54,
        case: 55,
        'pool table': 56,
        pillow: 57,
        'screen door': 58,
        stairway: 59,
        river: 60,
        bridge: 61,
        bookcase: 62,
        blind: 63,
        'coffee table': 64,
        toilet: 65,
        flower: 66,
        book: 67,
        hill: 68,
        bench: 69,
        countertop: 70,
        stove: 71,
        palm: 72,
        'kitchen island': 73,
        computer: 74,
        'swivel chair': 75,
        boat: 76,
        bar: 77,
        'arcade machine': 78,
        hovel: 79,
        bus: 80,
        towel: 81,
        light: 82,
        truck: 83,
        tower: 84,
        chandelier: 85,
        awning: 86,
        streetlight: 87,
        booth: 88,
        television: 89,
        airplane: 90,
        'dirt track': 91,
        apparel: 92,
        pole: 93,
        land: 94,
        bannister: 95,
        escalator: 96,
        ottoman: 97,
        bottle: 98,
        buffet: 99,
        poster: 100,
        stage: 101,
        van: 102,
        ship: 103,
        fountain: 104,
        'conveyer belt': 105,
        canopy: 106,
        washer: 107,
        plaything: 108,
        'swimming pool': 109,
        stool: 110,
        barrel: 111,
        basket: 112,
        waterfall: 113,
        tent: 114,
        bag: 115,
        minibike: 116,
        cradle: 117,
        oven: 118,
        ball: 119,
        food: 120,
        step: 121,
        tank: 122,
        'trade name': 123,
        microwave: 124,
        pot: 125,
        animal: 126,
        bicycle: 127,
        lake: 128,
        dishwasher: 129,
        screen: 130,
        blanket: 131,
        sculpture: 132,
        hood: 133,
        sconce: 134,
        vase: 135,
        'traffic light': 136,
        tray: 137,
        ashcan: 138,
        fan: 139,
        pier: 140,
        'crt screen': 141,
        plate: 142,
        monitor: 143,
        'bulletin board': 144,
        shower: 145,
        radiator: 146,
        glass: 147,
        clock: 148,
        flag: 149,
    };
    const lower = label.toLowerCase().trim();
    const map = nameMap;
    if (lower in map)
        return (map as Record<string,any>)[lower];
    // Partial match - handle underscore vs space variants
    const normalized = lower.replace(/_/g, ' ');
    if (normalized in map)
        return (map as Record<string,any>)[normalized];
    return -1;
}
// ----------------------------------------------------------------
// UTILITIES
// ----------------------------------------------------------------
/**
 * Notify progress callback if provided.
 * @param {Function | null | undefined} cb
 * @param {string} status
 * @param {string} message
 * @param {number} progress - 0-100 or -1 for indeterminate
 */
function _notify(cb: any, status: any, message: any, progress: any) {
    if (cb)
        cb({ status, message, progress });
}
