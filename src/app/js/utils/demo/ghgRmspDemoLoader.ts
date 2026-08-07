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
// @since v0.1.6

/* ================================================================
   GHG RMSP DEMO LOADER

   Demo case "GEE RMSP": importa subset GeoJSON com os 39 municipios
   da Regiao Metropolitana de Sao Paulo, gera observacoes sinteticas
   plausiveis de emissoes GEE (Escopos 1/2-loc/3) e abre o painel
   GHG Inventory com as 8 tabelas oficiais populadas.

   Spec: docs/specs/features/SPEC_GHG_PROTOCOL_INVENTARIO_RESUMO.md §4.3

   Fluxo:
   1. Fetch /assets/geo/ibge/municipios/rmsp-municipios.geojson
   2. Importa via importGeoJSONObject() (boundary elements)
   3. Gera 6 emission_source por municipio (escopos 1/2-loc/3,
      6 sub-categorias) com observacoes embarcadas em data.observations
   4. Habilita feature flag GHG_INVENTORY_REPORT em runtime
   5. Abre openGhgInventoryPanel()

   Fatores de emissao per-capita calibrados para ordem de grandeza
   brasileira (~2.5 tCO2eq/hab/ano sem uso solo).
   ================================================================ */

// ----------------------------------------------------------------
// Lazy module access — toast.js + translations.js sao JS legacy
// (ainda nao migrados para TS). Dynamic import com variable path
// evita unresolved import no tsc strict.
// ----------------------------------------------------------------

type ToastType = 'success' | 'error' | 'warning' | 'info';
type ShowToast = (msg: string, type?: ToastType) => void;
type TFn = (key: string) => string;

let _cachedShowToast: ShowToast | null = null;
let _cachedT: TFn | null = null;

async function ensureToast(): Promise<ShowToast> {
    if (_cachedShowToast) return _cachedShowToast;
    try {
        const toastPath = '../ui/toast.js';
        const mod = (await import(/* @vite-ignore */ toastPath)) as { showToast?: ShowToast };
        _cachedShowToast = mod.showToast ?? ((m, _type) => console.warn('[ghgRmspDemo]', m));
    } catch {
        _cachedShowToast = (m) => console.warn('[ghgRmspDemo]', m);
    }
    return _cachedShowToast;
}

async function ensureT(): Promise<TFn> {
    if (_cachedT) return _cachedT;
    try {
        const translationsPath = '../i18n/translations.js';
        const mod = (await import(/* @vite-ignore */ translationsPath)) as { t?: TFn };
        _cachedT = mod.t ?? ((k: string) => k);
    } catch {
        _cachedT = (k: string) => k;
    }
    return _cachedT;
}

function toast(msg: string, type?: ToastType): void {
    if (_cachedShowToast) {
        _cachedShowToast(msg, type);
        return;
    }
    void ensureToast().then((fn) => fn(msg, type));
}

function t(key: string): string {
    return _cachedT ? _cachedT(key) : key;
}

const RMSP_GEOJSON_PATH = '/assets/geo/ibge/municipios/rmsp-municipios.geojson';

/**
 * Per-capita emission factors (tCO2eq/hab/ano).
 * Base brasileira: ~2.5 tCO2eq/hab/ano (sem uso solo). Calibrado para
 * gerar inventario plausivel totalizando ~50-80 Mt CO2eq para RMSP
 * (~22M habitantes).
 */
interface ScopeFactors {
    readonly [category: string]: number;
}

interface EmissionFactors {
    readonly scope1: ScopeFactors;
    readonly scope2_loc: ScopeFactors;
    readonly scope3: ScopeFactors;
}

const EF_PER_CAPITA: EmissionFactors = {
    scope1: {
        combustao_estacionaria: 0.45, // residencial GLP/GN
        combustao_movel: 1.2, // frota veicular
        emissoes_fugitivas: 0.05, // HFCs refrigeracao
    },
    scope2_loc: {
        eletricidade_localizacao: 0.11, // ~1500 kWh/hab x 0.0743 tCO2/MWh SIN
    },
    scope3: {
        residuos_operacao: 0.3, // aterros CH4
        viagens_negocios: 0.4, // comercial/servicos
    },
};

interface SectorMultiplier {
    readonly industrial: number;
    readonly services: number;
}

/**
 * Multiplicador setorial por municipio. Industrial alto = ABC paulista,
 * services alto = centro financeiro SP/Barueri. Default 1.0 para outros.
 */
const SECTOR_MULT: Readonly<Record<string, SectorMultiplier>> = {
    'São Paulo': { industrial: 0.8, services: 1.3 },
    Guarulhos: { industrial: 1.5, services: 1.0 },
    'São Bernardo do Campo': { industrial: 1.8, services: 1.0 },
    'Santo André': { industrial: 1.4, services: 1.0 },
    Diadema: { industrial: 1.6, services: 0.9 },
    Mauá: { industrial: 1.5, services: 0.9 },
    'São Caetano do Sul': { industrial: 1.4, services: 1.0 },
    Osasco: { industrial: 1.0, services: 1.2 },
    Barueri: { industrial: 0.8, services: 1.3 },
};

/**
 * Populacao IBGE estimada 2024 (mil habitantes) para 39 municipios RMSP.
 * Municipios ausentes usam fallback 50 mil habitantes.
 */
const POP_2024: Readonly<Record<string, number>> = {
    'São Paulo': 11451,
    Guarulhos: 1311,
    'São Bernardo do Campo': 815,
    'Santo André': 720,
    Osasco: 700,
    Diadema: 392,
    Mauá: 432,
    'Mogi das Cruzes': 432,
    Carapicuíba: 386,
    Suzano: 297,
    Itaquaquecetuba: 369,
    'Taboão da Serra': 271,
    Barueri: 264,
    'Embu das Artes': 234,
    'São Caetano do Sul': 153,
    Cotia: 240,
    Itapevi: 222,
    'Ferraz de Vasconcelos': 178,
    'Francisco Morato': 156,
    'Itapecerica da Serra': 156,
    'Ribeirão Pires': 113,
    Mairiporã: 96,
    Jandira: 121,
    Caieiras: 99,
    'Embu-Guaçu': 67,
    'Santana de Parnaíba': 138,
    Cajamar: 78,
    Poá: 117,
    'Franco da Rocha': 145,
    Arujá: 90,
    'Vargem Grande Paulista': 53,
    'Santa Isabel': 60,
    'Rio Grande da Serra': 49,
    'Biritiba-Mirim': 30,
    Salesópolis: 16,
    Juquitiba: 30,
    'São Lourenço da Serra': 15,
    Guararema: 30,
    'Pirapora do Bom Jesus': 18,
};

interface SourceTemplateEntry {
    readonly scope: string;
    readonly cat: string;
    readonly ef: number;
    readonly useMult: 'industrial' | 'services' | null;
}

interface GeoJSONFeature {
    type: string;
    properties: Record<string, unknown> & {
        family?: string;
        name?: string;
        NM_MUN?: string;
        CD_MUN?: string;
        code?: string;
    };
    geometry: unknown;
}

interface GeoJSONFeatureCollection {
    type: string;
    features: GeoJSONFeature[];
}

interface ImportResult {
    elements: ReadonlyArray<{
        readonly id: string;
        readonly family: string;
        readonly name: string;
        readonly data: unknown;
    }>;
    warnings: string[];
}

export interface LoadGhgRmspDemoResult {
    readonly municipios: number;
    readonly fontes: number;
    readonly totalCO2e: number;
}

/**
 * Carrega demo case GEE RMSP completo.
 *
 * Pode ser invocado diretamente (window.handleLoadGhgRmspDemo) ou via
 * engine.js custom loader (quando registrado).
 */
export async function loadGhgRmspDemo(): Promise<LoadGhgRmspDemoResult> {
    // Pre-load legacy JS dependencies (toast + translations).
    await Promise.all([ensureToast(), ensureT()]);

    toast(
        t('demo.ghgRmsp.loading') ||
            'Carregando RMSP — 39 municipios + inventario GEE...',
        'info',
    );

    // ----------------------------------------------------------------
    // 1. Fetch shapefile subset (GeoJSON pre-built)
    // ----------------------------------------------------------------
    let geojson: GeoJSONFeatureCollection;
    try {
        const resp = await fetch(RMSP_GEOJSON_PATH);
        if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + resp.statusText);
        geojson = (await resp.json()) as GeoJSONFeatureCollection;
    } catch (err) {
        const msg = (err as { message?: string })?.message || String(err);
        toast(
            'Subset RMSP nao encontrado em ' +
                RMSP_GEOJSON_PATH +
                '. Rode: node scripts/build-rmsp-subset.mjs (' +
                msg +
                ')',
            'error',
        );
        throw err;
    }

    if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
        const e = new Error('rmsp-municipios.geojson invalido: esperado FeatureCollection');
        toast(e.message, 'error');
        throw e;
    }

    // ----------------------------------------------------------------
    // 2. Marcar features como boundary (para importGeoJSONObject inferir
    //    family correta) e converter via importGeoJSONObject
    // ----------------------------------------------------------------
    for (const f of geojson.features) {
        if (!f.properties) f.properties = {};
        f.properties.family = 'boundary';
        // Nome canonico priorizando NM_MUN (IBGE) com fallback
        f.properties.name = f.properties.NM_MUN || f.properties.name || 'municipio-sem-nome';
    }

    // Garante origem geográfica em SP centro (-23.55, -46.63) — UTM 23S.
    // Sem isso, polígonos convertidos via wgs84ToRelative caem MUITO longe
    // da origem efetiva (fallback UTM 31N) e nunca aparecem em viewport.
    interface CoordsModule {
        hasOrigin: () => boolean;
        wgs84ToUTM: (latLon: {
            latitude: number;
            longitude: number;
            elevation?: number;
        }) => { easting: number; northing: number; zone: number; hemisphere: string };
        setOrigin: (origin: {
            easting: number;
            northing: number;
            elevation: number;
            zone: number;
            hemisphere: string;
        }) => void;
    }
    const coordsMod = (await import('../../core/io/geo/coordinates.js')) as unknown as CoordsModule;
    if (!coordsMod.hasOrigin()) {
        const spCenter = { latitude: -23.55, longitude: -46.63, elevation: 760 };
        const utm = coordsMod.wgs84ToUTM(spCenter);
        coordsMod.setOrigin({
            easting: utm.easting,
            northing: utm.northing,
            elevation: spCenter.elevation,
            zone: utm.zone,
            hemisphere: utm.hemisphere,
        });
    }

    type ImportGeoJSONObjectFn = (gj: GeoJSONFeatureCollection) => ImportResult;
    const geoMod = (await import('../../core/io/formats/geojson.js')) as unknown as {
        importGeoJSONObject: ImportGeoJSONObjectFn;
    };
    const importResult: ImportResult = geoMod.importGeoJSONObject(geojson);

    if (importResult.warnings && importResult.warnings.length > 0) {
        console.debug('[demo:ghgRmsp] geojson warnings:', importResult.warnings);
    }

    // ----------------------------------------------------------------
    // 3. Adicionar boundaries via batch
    // ----------------------------------------------------------------
    interface BatchItem {
        readonly family: string;
        readonly id?: string;
        readonly name: string;
        readonly data: unknown;
        readonly meta: { readonly label: string; readonly color?: string };
    }
    type AddElementsBatchFn = (items: ReadonlyArray<BatchItem>, opts: { chunkSize: number }) => Promise<unknown>;
    const elementsMod = (await import('../../core/elements/manager.js')) as unknown as {
        addElementsBatch: AddElementsBatchFn;
    };
    const addElementsBatch = elementsMod.addElementsBatch;
    // Mapa de centroides (nome do município → posição 3D relativa) para
    // posicionar emission_sources dentro da área de cada município.
    const centroidByName = new Map<string, { x: number; y: number; z: number }>();
    // SPEC_GIS_AUTO_COLOR_DATASET: cor automatica do dataset RMSP via FNV-1a
    // hash do datasetId estavel 'rmsp-2024'. Substitui '#3b82f6' hardcoded.
    type DatasetColorsMod = { assignDatasetColor: (id: string) => string };
    const datasetColorsMod = (await import('../../core/symbology/datasetColors.js')) as unknown as DatasetColorsMod;
    const rmspColor = datasetColorsMod.assignDatasetColor('rmsp-2024');
    const boundaryItems: BatchItem[] = importResult.elements.map((el) => {
        const verts = ((el.data as { vertices?: ReadonlyArray<{ x?: number; y?: number; z?: number }> })?.vertices) || [];
        if (verts.length > 0) {
            let sx = 0,
                sy = 0,
                sz = 0;
            for (const v of verts) {
                sx += v.x || 0;
                sy += v.y || 0;
                sz += v.z || 0;
            }
            centroidByName.set(el.name, {
                x: sx / verts.length,
                y: sy / verts.length,
                z: sz / verts.length,
            });
        }
        return {
            family: el.family,
            id: el.id,
            name: el.name,
            data: el.data,
            meta: { label: el.name, color: rmspColor },
        };
    });
    await addElementsBatch(boundaryItems, { chunkSize: 10 });

    // ----------------------------------------------------------------
    // 4. Para cada municipio gerar 6 emission_source (1 por subcategoria)
    //    com observacoes embarcadas em data.observations[]
    //    (formato consumido por ghgInventoryPanel.js linha 116)
    // ----------------------------------------------------------------
    const SOURCES_TEMPLATE: readonly SourceTemplateEntry[] = [
        {
            scope: '1',
            cat: 'combustao_estacionaria',
            ef: EF_PER_CAPITA.scope1['combustao_estacionaria'] ?? 0,
            useMult: 'industrial',
        },
        { scope: '1', cat: 'combustao_movel', ef: EF_PER_CAPITA.scope1['combustao_movel'] ?? 0, useMult: null },
        {
            scope: '1',
            cat: 'emissoes_fugitivas',
            ef: EF_PER_CAPITA.scope1['emissoes_fugitivas'] ?? 0,
            useMult: 'industrial',
        },
        {
            scope: '2-loc',
            cat: 'eletricidade_localizacao',
            ef: EF_PER_CAPITA.scope2_loc['eletricidade_localizacao'] ?? 0,
            useMult: null,
        },
        { scope: '3', cat: 'residuos_operacao', ef: EF_PER_CAPITA.scope3['residuos_operacao'] ?? 0, useMult: null },
        {
            scope: '3',
            cat: 'viagens_negocios',
            ef: EF_PER_CAPITA.scope3['viagens_negocios'] ?? 0,
            useMult: 'services',
        },
    ];

    const emissionItems: BatchItem[] = [];
    let totalCO2e = 0;
    const inventoryYear = new Date().getFullYear();
    const obsDate = inventoryYear + '-12-31';

    // Offset radial das 6 fontes em torno do centróide do município (m).
    // Distribuição hexagonal raio 800m — individualiza visualmente sem sair
    // da área urbana.
    const RADIUS_M = 800;

    for (const feature of geojson.features) {
        const nmMun = String(feature.properties.NM_MUN || feature.properties.name || 'sem-nome');
        const cdMun = String(feature.properties.CD_MUN || feature.properties.code || nmMun);
        const popK = POP_2024[nmMun] || 50;
        const pop = popK * 1000;
        const sectMult = SECTOR_MULT[nmMun] || { industrial: 1.0, services: 1.0 };
        const center = centroidByName.get(nmMun) || { x: 0, y: 0, z: 0 };

        for (let i = 0; i < SOURCES_TEMPLATE.length; i++) {
            const s = SOURCES_TEMPLATE[i]!;
            const mult = s.useMult ? sectMult[s.useMult] : 1.0;
            // EF esta em tCO2eq/hab/ano, pop em habitantes -> co2eTon em tCO2eq.
            const co2eTon = pop * s.ef * mult;
            const sourceId = 'em-rmsp-' + cdMun + '-esc' + s.scope.replace('-', '') + '-' + s.cat;
            // Posição: centroide do município + offset hexagonal por fonte
            const angle = (i / SOURCES_TEMPLATE.length) * 2 * Math.PI;
            const position = {
                x: center.x + RADIUS_M * Math.cos(angle),
                y: (center.y || 0) + 5,
                z: center.z + RADIUS_M * Math.sin(angle),
            };

            emissionItems.push({
                family: 'emission_source',
                id: sourceId,
                name: nmMun + ' — Escopo ' + s.scope + ' / ' + s.cat,
                data: {
                    position,
                    ghgScope: s.scope,
                    ghgCategory: s.cat,
                    organizationalUnit: nmMun,
                    biogenic: false,
                    municipio: nmMun,
                    cdMun,
                    populacao: pop,
                    // Observacoes embarcadas (consumido por ghgInventoryPanel
                    // linha 116: el.data.observations || [])
                    observations: [
                        {
                            id: 'obs-' + sourceId + '-co2',
                            parameterId: 'gas:CO2',
                            value: co2eTon,
                            unit: 't',
                            date: obsDate,
                            data: {
                                emissionFactor: s.ef,
                                gwp: 1, // CO2 GWP-100 AR6
                                co2e: co2eTon,
                                sourceQuantity: pop,
                                sourceUnit: 'hab',
                                verified: false,
                                sectorMultiplier: mult,
                            },
                        },
                    ],
                },
                meta: { label: nmMun + ' E' + s.scope },
            });
            totalCO2e += co2eTon;
        }
    }

    await addElementsBatch(emissionItems, { chunkSize: 50 });

    // ----------------------------------------------------------------
    // 4.5. Auto-zoom para enquadrar APENAS os boundaries RMSP recém-importados.
    //
    // SPEC_CAMERA_FIT_TO_DATASET (2026-05-14):
    //   Antes usávamos fitAllElements(), que combinava bbox de TODOS os
    //   elementos. Quando coexistia random model (wells PM-01..PM-22 perto
    //   da origem) + RMSP (boundaries a ~100km de distância), a câmera
    //   recuava para enquadrar o conjunto e os polígonos RMSP viravam
    //   linhas finas sub-pixel.
    //
    //   Agora passamos os IDs dos boundaries explicitamente — câmera ignora
    //   random model e dataset RMSP ocupa o viewport.
    // ----------------------------------------------------------------
    try {
        interface ControlsModule {
            fitCameraToElementIds?: (
                ids: ReadonlyArray<string>,
                opts?: { padding?: number; durationMs?: number },
            ) => Promise<boolean>;
            fitAllElements?: () => void;
        }
        const ctrlPath = '../scene/controls.js';
        const ctrlMod = (await import(/* @vite-ignore */ ctrlPath)) as unknown as ControlsModule;
        const boundaryIds: string[] = boundaryItems
            .map((b) => b.id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0);
        if (typeof ctrlMod.fitCameraToElementIds === 'function' && boundaryIds.length > 0) {
            await ctrlMod.fitCameraToElementIds(boundaryIds, { padding: 0.15 });
        } else if (typeof ctrlMod.fitAllElements === 'function') {
            // Fallback se a função nova ainda não estiver carregada.
            ctrlMod.fitAllElements();
        }
    } catch (err) {
        console.debug('[demo:ghgRmsp] fit subset falhou:', (err as { message?: string })?.message || err);
    }

    // ----------------------------------------------------------------
    // 4.6. Out-of-viewport banner — SPEC_GIS_OUT_OF_VIEWPORT_BANNER
    //      Se a câmera ainda estiver longe (ex: usuário deu Ctrl-Z após
    //      fit ou estava com auto-fit desligado), exibe banner com CTA
    //      "Centralizar nos dados".
    // ----------------------------------------------------------------
    try {
        interface BannerModule {
            checkAndShowOutOfViewportBanner?: (opts: {
                datasetId: string;
                importedElements: ReadonlyArray<unknown>;
                threshold?: number;
            }) => Promise<unknown>;
        }
        const bannerPath = '../ui/outOfViewportBanner.js';
        const bannerMod = (await import(/* @vite-ignore */ bannerPath)) as unknown as BannerModule;
        if (typeof bannerMod.checkAndShowOutOfViewportBanner === 'function') {
            // Defer one frame so fitAllElements has had a chance to update the
            // camera matrix before we measure the distance.
            setTimeout(() => {
                void bannerMod.checkAndShowOutOfViewportBanner?.({
                    datasetId: 'ghg-rmsp-2024',
                    importedElements: [...boundaryItems, ...emissionItems],
                });
            }, 100);
        }
    } catch (err) {
        console.debug(
            '[demo:ghgRmsp] outOfViewportBanner falhou:',
            (err as { message?: string })?.message || err,
        );
    }

    // ----------------------------------------------------------------
    // 5. Habilitar feature flag em runtime (sem persistir em config.js)
    // ----------------------------------------------------------------
    const configMod = (await import('../../config.js')) as unknown as {
        CONFIG: { FEATURES?: { GHG_INVENTORY_REPORT?: boolean } };
    };
    const CONFIG = configMod.CONFIG;
    CONFIG.FEATURES = CONFIG.FEATURES || {};
    CONFIG.FEATURES.GHG_INVENTORY_REPORT = true;

    // ----------------------------------------------------------------
    // 6. Abrir painel GHG Inventory
    // ----------------------------------------------------------------
    type OpenGhgInventoryPanelFn = (opts: {
        inventoryYear: number;
        gwpVersion: 'AR6' | 'AR5' | 'AR4';
    }) => Promise<unknown>;
    const panelMod = (await import('../ui/ghgInventoryPanel.js')) as unknown as {
        openGhgInventoryPanel: OpenGhgInventoryPanelFn;
    };
    await panelMod.openGhgInventoryPanel({ inventoryYear, gwpVersion: 'AR6' });

    const totalMt = (totalCO2e / 1e6).toFixed(2);
    toast(
        'GHG RMSP carregado: ' +
            geojson.features.length +
            ' municipios, ' +
            emissionItems.length +
            ' fontes, total ~' +
            totalMt +
            ' MtCO2eq',
        'success',
    );

    return {
        municipios: geojson.features.length,
        fontes: emissionItems.length,
        totalCO2e,
    };
}
