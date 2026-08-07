// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/**
 * Phase Context Builder - RANDOM-REBUILD-V2 Phase C.4.
 *
 * Extracts the large Phase 1 context assembly from randomModel.js into an
 * explicit module with injected runtime dependencies. This keeps the public
 * API stable while removing hidden closure coupling from the build step.
 */
import { RANDOM_MODEL_DEFAULTS } from './constants.js';
import { relativeToUTM, utmToWGS84, wgs84ToUTM, setOrigin } from '../io/geo/coordinates.js';
// RANDOM-COV-001 (spec §8) — flag RANDOM_COV_V2: OFF remove as famílias F1
// (dam/pit/route_flow) do conjunto a gerar (rollback ao comportamento pré-F1).
import { CONFIG } from '../../config.js';
import { resolveRandomCovV2Enabled, applyRandomCovV2ToInclude } from './_randomCovFlagPure.js';
/**
 * Build the shared context used by subsequent random-model phases.
 *
 * @param {Set<string>|null} includeFamilies
 * @param {any} options
 * @param {any} runtime
 * @returns {Promise<any>}
 */
export async function buildPhaseContext(includeFamilies: any, options: any, runtime: any = {}) {
    const { rand, pick, randInt, addElement, siteSizes, contaminationMultipliers, generateCampaignDates, generateSiteMeteorology, computeZoneCentroids, } = runtime;
    if (typeof rand !== 'function' ||
        typeof pick !== 'function' ||
        typeof randInt !== 'function' ||
        typeof addElement !== 'function' ||
        typeof generateCampaignDates !== 'function' ||
        typeof generateSiteMeteorology !== 'function' ||
        typeof computeZoneCentroids !== 'function') {
        throw new Error('buildPhaseContext requires explicit runtime helpers');
    }
    const randRange = rand;
    const randChoice = pick;
    const includeRaw = includeFamilies ||
        new Set([
            'site_project',
            'site_area',
            'site_zone',
            'boundary',
            'stratum',
            'building',
            'plume',
            'well',
            'tank',
            'lake',
            'river',
            'spring',
            'marker',
            'sample',
            'emission_source',
            'waste_stream',
            'effluent_point',
            'area',
            'incident',
            'habitat',
            'individual',
            'sensor',
            'intangible',
            'generic',
            'blueprint',
        ]);
    // RANDOM-COV-001 (RF-1/RF-2, spec §8): flag OFF → famílias F1 fora do
    // include (mesmo se selecionadas). Override de teste: options.randomCovV2
    // boolean explícito vence o CONFIG.
    const randomCovV2 =
        typeof (options as any)?.randomCovV2 === 'boolean'
            ? (options as any).randomCovV2
            : resolveRandomCovV2Enabled(CONFIG);
    const include = applyRandomCovV2ToInclude(includeRaw, randomCovV2);
    const opts = {
        ...RANDOM_MODEL_DEFAULTS.options,
        ...(options || {}),
    };
    const runtimeTuning = {
        contaminationMult: contaminationMultipliers?.[opts.contaminationLevel] || 1.0,
        densityMult: opts.density,
        includeCosts: opts.includeCosts !== false,
    };
    const siteRange = siteSizes?.[opts.siteSize] || siteSizes?.medium || RANDOM_MODEL_DEFAULTS.siteSizes.medium;
    const campaigns = generateCampaignDates(null, opts.campaigns);
    const numCampaigns = campaigns.length;
    const siteMeteo = generateSiteMeteorology();
    const plumeDepths = RANDOM_MODEL_DEFAULTS.plumeDepths;
    /** @type {any} */
    let siteProjectId: any = null;
    /** @type {any[]} */
    const siteAreaIds: any[] = [];
    /** @type {any[]} */
    const siteZoneIds: any[] = [];
    const getSpatialParentId = () => siteZoneIds[0] || siteAreaIds[0] || siteProjectId || null;
    if (include.has('site_project')) {
        siteProjectId = 'site-project-main';
        addElement('site_project', siteProjectId, 'Projeto (Site)', {
            code: `SITE-${randInt(100, 999)}`,
            country: randChoice(['BR', 'US', 'MX', 'AR', 'CL']),
            status: 'active',
        });
    }
    if (include.has('site_area')) {
        const areaDefs = [
            { id: 'site-area-invest', name: 'Area de Investigacao' },
            { id: 'site-area-oper', name: 'Area Operacional' },
            { id: 'site-area-admin', name: 'Administrativo' },
        ];
        areaDefs.forEach((a: any, i: any) => {
            addElement('site_area', a.id, a.name, {
                areaType: i === 0 ? 'investigation' : i === 1 ? 'operations' : 'other',
            }, {
                hierarchy: { parentId: siteProjectId, order: i },
            });
            siteAreaIds.push(a.id);
        });
    }
    if (include.has('site_zone')) {
        const zoneDefs = [
            { id: 'site-zone-ind', name: 'Zona Industrial', parent: siteAreaIds[1] || siteAreaIds[0] || siteProjectId },
            {
                id: 'site-zone-mon',
                name: 'Zona de Monitoramento',
                parent: siteAreaIds[0] || siteAreaIds[1] || siteProjectId,
            },
            { id: 'site-zone-nat', name: 'Zona Natural', parent: siteAreaIds[0] || siteAreaIds[1] || siteProjectId },
        ];
        zoneDefs.forEach((z: any, i: any) => {
            addElement('site_zone', z.id, z.name, {
                zoneType: i === 0 ? 'industrial' : i === 1 ? 'monitoring' : 'natural',
            }, {
                hierarchy: { parentId: z.parent || null, order: i },
            });
            siteZoneIds.push(z.id);
        });
    }
    const zoneForFamily = (family: any) => {
        const industrial = ['building', 'tank', 'emission_source', 'waste_stream', 'area'];
        const monitoring = ['well', 'plume', 'sample', 'marker', 'sensor'];
        const natural = ['lake', 'river', 'spring', 'effluent_point', 'habitat'];
        const nonSpatial = ['incident', 'intangible', 'generic'];
        if (industrial.includes(family))
            return siteZoneIds[0] || siteAreaIds[1] || siteProjectId || null;
        if (monitoring.includes(family))
            return siteZoneIds[1] || siteAreaIds[0] || siteProjectId || null;
        if (natural.includes(family))
            return siteZoneIds[2] || siteAreaIds[0] || siteProjectId || null;
        if (nonSpatial.includes(family))
            return siteAreaIds[2] || siteProjectId || null;
        return siteProjectId || null;
    };
    const zoneOrder: Record<string, any> = {};
    const nextZoneOrder = (family: any) => {
        const zid = zoneForFamily(family);
        if (!zid)
            return 0;
        zoneOrder[zid] = (zoneOrder[zid] || 0) + 1;
        return zoneOrder[zid];
    };
    const hMeta = (family: any) => {
        const pid = zoneForFamily(family);
        return pid ? { hierarchy: { parentId: pid, order: nextZoneOrder(family) } } : {};
    };
    const halfWidth = randRange(siteRange[0], siteRange[1]);
    const halfLength = randRange(siteRange[0], siteRange[1]);
    const S = Math.min(halfWidth, halfLength) / 30;
    const AERIAL_LOCATIONS = [
        { lat: -23.55, lon: -46.63 },
        { lat: -22.91, lon: -43.17 },
        { lat: -19.92, lon: -43.94 },
        { lat: -25.43, lon: -49.27 },
        { lat: -29.97, lon: -51.18 },
        { lat: -12.97, lon: -38.51 },
        { lat: 40.71, lon: -74.0 },
        { lat: 34.05, lon: -118.24 },
        { lat: 29.76, lon: -95.37 },
        { lat: 51.51, lon: -0.12 },
        { lat: 48.86, lon: 2.35 },
        { lat: 52.52, lon: 13.41 },
        { lat: 35.68, lon: 139.69 },
        { lat: 31.23, lon: 121.47 },
        { lat: 22.3, lon: 114.17 },
        { lat: -33.87, lon: 151.21 },
        { lat: 1.35, lon: 103.82 },
        { lat: 25.2, lon: 55.27 },
        { lat: 19.43, lon: -99.13 },
        { lat: -34.6, lon: -58.38 },
    ];
    const loc = randChoice(AERIAL_LOCATIONS);
    const rndLat = loc.lat + randRange(-0.02, 0.02);
    const rndLon = loc.lon + randRange(-0.02, 0.02);
    const utm = wgs84ToUTM({ latitude: rndLat, longitude: rndLon });
    setOrigin({
        easting: utm.easting,
        northing: utm.northing,
        elevation: 0,
        zone: utm.zone,
        hemisphere: utm.hemisphere,
    });
    const eastingEl = (document.getElementById("utm-origin-easting") as any);
    const northingEl = (document.getElementById("utm-origin-northing") as any);
    if (eastingEl)
        eastingEl.value = utm.easting.toFixed(2);
    if (northingEl)
        northingEl.value = utm.northing.toFixed(2);
    // BUG FIX georef (claude - adm 2026-06-11, globo no oceano 25.4S/43.3W):
    // zone/hemisphere TAMBÉM precisam sincronizar — o step "Restoring UTM
    // origin" do buildFullRandomModel relê estes inputs e fazia
    // setOrigin({zone: 23 (default HTML), easting: <de outra zona>}),
    // corrompendo a georreferência de toda localização fora da zona 23
    // (Curitiba/POA z22, Salvador z24, NYC z18, Londres z30, Tóquio z54…)
    // → globo, terreno e overlay aéreo deslocados ~6° por zona de erro.
    const zoneEl = (document.getElementById("utm-zone") as any);
    const hemiEl = (document.getElementById("utm-hemisphere") as any);
    if (zoneEl)
        zoneEl.value = String(utm.zone);
    if (hemiEl)
        hemiEl.value = utm.hemisphere === 'N' ? 'N' : 'S';
    // Âncora de verdade para o farol de georef (geoStatusBeacon.ts):
    // lat/lon REAIS sorteados, independentes do round-trip UTM — permite
    // detectar corrupção de origem (ex: zona sobrescrita) que um check
    // circular (reconverter com a própria zona gravada) jamais pegaria.
    try {
        (globalThis as any).__ecbytsGeoTruth = { lat: rndLat, lon: rndLon, setAt: Date.now() };
    } catch (e: any) {
        console.debug('[phase-context] geo-truth:', e?.message || e);
    }
    const sw = utmToWGS84(relativeToUTM({ x: -halfWidth, y: 0, z: halfLength }));
    const ne = utmToWGS84(relativeToUTM({ x: halfWidth, y: 0, z: -halfLength }));
    const extentM = Math.max(halfWidth, halfLength) * 2;
    const imgSize = Math.min(1024, Math.max(768, Math.floor(extentM * 1.25)));
    const extent = { minX: -halfWidth, maxX: halfWidth, minZ: -halfLength, maxZ: halfLength };
    let overlayUrl: any = null;
    let overlayFallbackUrls: any[] = [];
    if (opts.includeAerialOverlay !== false) {
        const { buildOverlayUrlsFromBbox } = await import('../io/geo/overlayUrls.js' as string);
        const storedProvider = localStorage.getItem('ecbyts-tile-provider') || '';
        const providerIdx = storedProvider != null ? parseInt(storedProvider, 10) : null;
        const overlayResult = await buildOverlayUrlsFromBbox(sw, ne, imgSize, providerIdx != null && Number.isFinite(providerIdx) ? providerIdx : undefined);
        overlayUrl = overlayResult?.overlayUrl || null;
        overlayFallbackUrls = overlayResult?.overlayFallbackUrls || [];
    }
    let detectedZones: any = null;
    let detectedFeatures: any[] = [];
    if (overlayUrl) {
        try {
            const { analyzeByColor } = await import('../recognition/colorAnalysis.js' as string);
            detectedFeatures = (await analyzeByColor(overlayUrl, extent)) || [];
            detectedZones = computeZoneCentroids(detectedFeatures);
        }
        catch (e: any) {
            console.debug('[random] analyzeByColor skipped:', e?.message);
        }
    }
    const industrialCenter = detectedZones?.industrial || { x: -halfWidth * 0.35, z: -halfLength * 0.35 };
    const monitoringCenter = detectedZones?.monitoring || { x: halfWidth * 0.1, z: halfLength * 0.1 };
    const naturalCenter = detectedZones?.natural ||
        detectedZones?.water || { x: halfWidth * 0.35, z: halfLength * 0.35 };
    const zoneSpread = Math.min(halfWidth, halfLength) * 0.25;
    const inZone = (center: any, spread: any) => ({
        x: center.x + randRange(-spread, spread),
        z: center.z + randRange(-spread, spread)
    });
    const clamp = (v: number, limit: number) => Math.max(-limit * 0.9, Math.min(limit * 0.9, v));
    return {
        include,
        opts,
        campaigns,
        numCampaigns,
        siteMeteo,
        plumeDepths,
        siteProjectId,
        siteAreaIds,
        siteZoneIds,
        getSpatialParentId,
        hMeta,
        zoneForFamily,
        halfWidth,
        halfLength,
        S,
        utm,
        rndLat,
        rndLon,
        overlayUrl,
        overlayFallbackUrls,
        extent,
        detectedZones,
        detectedFeatures,
        industrialCenter,
        monitoringCenter,
        naturalCenter,
        zoneSpread,
        inZone,
        clamp,
        randRange,
        randChoice,
        runtimeTuning,
        buildingPositions: [],
        plumePositions: [],
        plumeData: [],
        wellPositions: [],
        lakePosition: null,
        riverMidpoint: null,
        generatedAreas: [],
        edges: [],
    };
}
