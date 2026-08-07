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
// ================================================================
// randomModel.js - Thin public surface for random model generation
// RANDOM-REBUILD-V2 C.7.1 keeps this file as wrappers + re-exports.
// ================================================================
// nextElementCounter vem do leaf ./state.js (quebra o ciclo manager↔randomModel).
// addElement/clearAllElements de manager.js: import dinâmico lazy resolvido 1×
// no topo do async generateRandomModel (mesmo singleton ES, byte-idêntico —
// só um tick antes de qualquer criação; remove a aresta randomModel→manager).
import { nextElementCounter } from './state.js';
import { loadTHREE } from '../three-lazy.js';
let addElement: any;
let clearAllElements: any;
let _mgrLoaded = false;
async function _ensureMgr() {
    if (_mgrLoaded)
        return;
    const m = await import('./manager.js');
    addElement = m.addElement;
    clearAllElements = m.clearAllElements;
    _mgrLoaded = true;
}
import { CONFIG } from '../../config.js';
import { addCampaign, clearCampaigns } from '../campaigns/manager.js';
import { exportCorporateIO } from '../io/modelLink.js';
import { generateId } from '../../utils/helpers/id.js';
import { buildElementCostEntry, buildCampaignCost } from '../ingestion/documents/costCatalog.js';
import { runtimeDate, runtimeNow, runtimeRandom, realNow } from '../random/runtime.js';
import { rand, randInt, pick, scaleWellTiers, GAC_ALL_PARAMS, TIER_INTERMEDIATE_PARAMS, generateCampaignDates, generateSiteMeteorology, varyCampaignMeteo, generateWBS, generateContracts, generateProjectRegistry, } from './randomHelpers.js';
import { buildPhaseContext as _buildPhaseContext } from '../random/phase-context.js';
import { createBoundaryPhase as _createBoundaryPhase } from '../random/phase-structure.js';
import { createBuildingsPhase as _createBuildingsPhase, createPlumesPhase as _createPlumesPhase, createWellsPhase as _createWellsPhase, createOtherElementsPhase as _createOtherElementsPhase, } from '../random/phase-elements.js';
import { seedVisualization as _rmSeedVisualization } from '../random/phase-finalize.js';
import { createFinancialsPhase as _createFinancialsPhase, buildRandomEisGovernancePack as _buildRandomEisGovernancePack, } from '../random/phase-governance.js';
import { createObservationHelperSet as _createObservationHelperSet, generatePlumeTimeline as _generatePlumeTimeline, computeZoneCentroids as _computeZoneCentroids, buildRandomUncertaintyPack as _buildRandomUncertaintyPack, createDefaultElements as _createDefaultElements, } from '../random/_internal.js';
import { FAMILY_PARAMETERS } from '../random/model-catalog.js';
import { RANDOM_MODEL_DEFAULTS } from '../random/constants.js';
import { syntheticTerrainElevation as _syntheticTerrainElevation, generateRiverPath as _generateRiverPath, findRiverSource as _findRiverSource, syntheticWaterTable as _syntheticWaterTable, } from './randomModelTerrain.js';
export { RANDOM_MODEL_DEFAULTS } from '../random/constants.js';
export { PARAMETER_RANGES, FAMILY_PARAMETERS, FAMILY_VARIABLES } from '../random/model-catalog.js';
const SITE_SIZES = RANDOM_MODEL_DEFAULTS.siteSizes;
const CONTAMINATION_MULT = RANDOM_MODEL_DEFAULTS.contaminationMultiplier;
let _contaminationMult = 1.0;
let _densityMult = 1.0;
let _includeCosts = true;
function _bindObservationHelpers() {
    return _createObservationHelperSet({
        contaminationMult: _contaminationMult,
        densityMult: _densityMult,
        includeCosts: _includeCosts,
    });
}
async function _rmBuildContext(includeFamilies: any, options: any) {
    const ctx = await _buildPhaseContext(includeFamilies, options, {
        rand,
        pick,
        randInt,
        addElement,
        siteSizes: SITE_SIZES,
        contaminationMultipliers: CONTAMINATION_MULT,
        generateCampaignDates,
        generateSiteMeteorology,
        computeZoneCentroids: _computeZoneCentroids,
    });
    _contaminationMult = ctx.runtimeTuning?.contaminationMult || 1.0;
    _densityMult = ctx.runtimeTuning?.densityMult || 1.0;
    _includeCosts = ctx.runtimeTuning?.includeCosts !== false;
    return ctx;
}
function _rmCreateBoundary(ctx: any) {
    const { generateObservations } = _bindObservationHelpers();
    return _createBoundaryPhase(ctx, {
        addElement,
        nextElementCounter,
        generateObservations,
        config: CONFIG,
        randInt,
    });
}
function _rmCreateBuildings(ctx: any) {
    return _createBuildingsPhase(ctx, {
        addElement,
        nextElementCounter,
        syntheticTerrainElevation: _syntheticTerrainElevation,
        randomFn: runtimeRandom,
    });
}
function _rmCreatePlumes(ctx: any) {
    const { generateCorrelatedPlumeObs } = _bindObservationHelpers();
    return _createPlumesPhase(ctx, {
        addElement,
        nextElementCounter,
        syntheticTerrainElevation: _syntheticTerrainElevation,
        generatePlumeTimeline: _generatePlumeTimeline,
        generateCorrelatedPlumeObs,
        randomFn: runtimeRandom,
        familyParameters: FAMILY_PARAMETERS,
    });
}
function _rmCreateWells(ctx: any) {
    const { generateObservations, generateCorrelatedWellObs } = _bindObservationHelpers();
    return _createWellsPhase(ctx, {
        addElement,
        nextElementCounter,
        syntheticTerrainElevation: _syntheticTerrainElevation,
        syntheticWaterTable: _syntheticWaterTable,
        runtimeRandom,
        runtimeDate,
        scaleWellTiers,
        generateCorrelatedWellObs,
        generateObservations,
        randInt,
        GAC_ALL_PARAMS,
        TIER_INTERMEDIATE_PARAMS,
    });
}
/** @param {any} ctx */
function _rmCreateOtherElements(ctx: any) {
    const { generateObservations } = _bindObservationHelpers();
    return _createOtherElementsPhase(ctx, {
        addElement,
        nextElementCounter,
        syntheticTerrainElevation: _syntheticTerrainElevation,
        findRiverSource: _findRiverSource,
        generateRiverPath: _generateRiverPath,
        runtimeRandom,
        runtimeDate,
        runtimeNow,
        randInt,
        generateObservations,
    });
}
function _rmCreateFinancials(ctx: any) {
    return _createFinancialsPhase(ctx, {
        buildElementCostEntry,
        buildCampaignCost,
        addCampaign,
        clearCampaigns,
        generateWBS,
        generateContracts,
        generateProjectRegistry,
        varyCampaignMeteo,
        includeCosts: _includeCosts,
    });
}
/**
 * @param {{campaigns?: any[], areas?: any[]}} [opts]
 */
export function buildRandomEisGovernancePack(opts: any) {
    const { campaigns = /** @type {any[]} */ ([]), areas = /** @type {any[]} */ ([]) } = opts || {};
    return _buildRandomEisGovernancePack(/** @type {any} */ ({ campaigns, areas }), {
        generateId,
    });
}
export function buildRandomUncertaintyPack() {
    return _buildRandomUncertaintyPack();
}
function _resolveRunId(options: unknown): number {
    const root = (typeof window !== 'undefined' ? window : globalThis) as Record<string, unknown>;
    // Fix #1: if orchestrator already assigned a runId, reuse it instead of
    // incrementing the global counter again for the same logical run.
    const injectedRunId = options && typeof options === 'object' ? (options as Record<string, unknown>).__orchestratorRunId : null;
    let randomRunId;
    if (typeof injectedRunId === 'number' && injectedRunId > 0) {
        randomRunId = injectedRunId;
    }
    else {
        root.__ecbytsRandomRunCount = Number(root.__ecbytsRandomRunCount || 0) + 1;
        randomRunId = root.__ecbytsRandomRunCount;
    }
    return Number(randomRunId);
}

function _makePhaseTimer() {
    let phaseStartedAt = realNow();
    return () => {
        const now = realNow();
        const d = now - phaseStartedAt;
        phaseStartedAt = now;
        return d;
    };
}

async function _persistUncertaintyPack(uncertaintyPack: unknown): Promise<void> {
    try {
        const { saveUncertaintyHubState } = await import('../uncertainty/hubStore.js');
        await saveUncertaintyHubState(uncertaintyPack);
    }
    catch (err: unknown) {
        const message = err && typeof err === 'object' && 'message' in err ? (err as { message: unknown }).message : err;
        console.warn('[randomModel] uncertainty-hub persist failed:', message);
    }
}

export async function generateRandomModel(
includeFamilies: any = null, options: any = null) {
    await _ensureMgr(); // resolve addElement/clearAllElements antes de qualquer helper
    await loadTHREE(); // mesh creation (createBoundaryMesh etc) needs three.js loaded
    const randomRunId = _resolveRunId(options);
    // realNow(): runtimeNow() é congelado pelo runtime determinístico do
    // orchestrator (seed → fixedNow) — durationMs saía SEMPRE 0ms e a
    // geração era caixa-preta de ~11s no boot logado (console real 2026-06-11).
    const randomStartedAt = realNow();
    const phaseMs = _makePhaseTimer();
    console.debug('[randomModel] run:start', {
        runId: randomRunId,
        includeFamilies: includeFamilies instanceof Set ? includeFamilies.size : 'all',
        options: options || null,
    });
    clearAllElements();
    const ctx = await _rmBuildContext(includeFamilies, options);
    console.debug('[randomModel] Phase 1: context built', { families: ctx.include?.size, durationMs: phaseMs() });
    _rmCreateBoundary(ctx);
    console.debug('[randomModel] Phase 2: boundary created', { durationMs: phaseMs() });
    _rmCreateBuildings(ctx);
    _rmCreatePlumes(ctx);
    console.debug('[randomModel] Phase 3: buildings + plumes', { durationMs: phaseMs() });
    _rmCreateWells(ctx);
    console.debug('[randomModel] Phase 4: wells created', { count: ctx.wellPositions.length, durationMs: phaseMs() });
    _rmCreateOtherElements(ctx);
    console.debug('[randomModel] Phase 5: other elements', { durationMs: phaseMs() });
    _rmCreateFinancials(ctx);
    console.debug('[randomModel] Phase 6: financials seeded', { durationMs: phaseMs() });
    _rmSeedVisualization(ctx);
    console.debug('[randomModel] Phase 7: visualization ready', { durationMs: phaseMs() });
    const eisGovernancePack = buildRandomEisGovernancePack({
        campaigns: ctx.campaigns,
        areas: ctx.generatedAreas,
    });
    const uncertaintyPack = buildRandomUncertaintyPack();
    await _persistUncertaintyPack(uncertaintyPack);
    const result = {
        campaigns: ctx.campaigns,
        edges: ctx.edges,
        areas: ctx.generatedAreas,
        financial: (ctx as any).financial,
        corporateIO: exportCorporateIO(),
        eisGovernancePack,
        uncertaintyPack,
    };
    console.debug('[randomModel] run:finish', {
        runId: randomRunId,
        durationMs: realNow() - randomStartedAt,
        campaignCount: ctx.campaigns?.length || 0,
        edgeCount: ctx.edges?.length || 0,
    });
    return result;
}
export async function createDefaultElements() {
    await _ensureMgr();
    return _createDefaultElements(addElement);
}
//# sourceMappingURL=randomModel.js.map
