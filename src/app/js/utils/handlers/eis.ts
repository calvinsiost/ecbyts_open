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
/**
 * EIS Dashboard Handlers
 * Handlers para o dashboard interativo do Environmental Integrity Score.
 *
 * Abre um modal com gauge circular, radar chart (Chart.js) e sliders
 * para cálculo interativo do EIS nos 6 eixos 3CTA+.
 *
 * O multiplicador de credencial é computado automaticamente a partir
 * das observações do modelo (carimbo por leitura), não por seleção manual.
 */
import './eisProfilePortable.js'; // side-effect: registra kind 'eis_profile' (P1-10)
// HUD-UX-PAIN-DRAIN-001 W1.5 (D19): formatter κ canônico compartilhado
import { formatKappa } from '../ui/_hudCardTooltipsPure.js';
import * as eisCalculatorModule from '../../core/eis/eisCalculator.js';
import * as formulaRegistryModule from '../../core/eis/formulaRegistry.js';
import * as qualityExtensionsModule from '../../core/eis/qualityExtensions.js';
import * as eisScopeResolverModule from '../../core/eis/eisScopeResolver.js';
import * as snapshotEngineModule from '../../core/purpose/snapshotEngine.js';
import * as modelLinkModule from '../../core/io/modelLink.js';
import * as elementsManagerModule from '../../core/elements/manager.js';
import * as campaignsManagerModule from '../../core/campaigns/manager.js';
import * as unitsCatalogModule from '../../core/units/catalog.js';
import * as configModule from '../../config.js';
import * as translationsModule from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';
import { showToast } from '../ui/toast.js';
import { safeSetItem } from '../storage/storageMonitor.js';
import { createLogger } from '../helpers/logger.js';
import * as eisCustomProfileUtilsModule from './eisCustomProfileUtils.js';
import * as eisCorrectionWorkbenchModule from './eisCorrectionWorkbench.js';
import * as eisCustomScoreBuilderModule from './eisCustomScoreBuilder.js';
import * as eisCustomProfileStoreModule from './eisCustomProfileStore.js';
import * as eisCustomRendererModule from './eisCustomRenderer.js';
import * as uncertaintyBadgeModule from '../ui/components/uncertaintyBadge.js';
import * as eisDashboardRendererModule from './eisDashboardRenderer.js';
import * as eisDashboardVisualsModule from './eisDashboardVisuals.js';
import * as eisOdsPanelRendererModule from './eisOdsPanelRenderer.js';
import * as eisHudStateBuilderModule from './eisHudStateBuilder.js';
import * as eisDashboardDetailStateModule from './eisDashboardDetailState.js';
import * as eisCanvasUtilsModule from './eisCanvasUtils.js';
import { wireEisShareButton } from './eisShareButton.js';
// Wave ZZZ1 P2 PoC: pure-logic tooltips (SPEC_UI_REUSE_OPTIMIZATION_PROGRAM)
import { buildAutoTooltipPure as _pureBuildAutoTooltip } from './_eisTooltipsPure.js';
import { scoreToSpatialColor as _scoreToColor } from './_eisSpatialColorPure.js';
const log = createLogger('EIS');
/** @typedef {Record<string, any>} AnyRecord */
const window = (globalThis.window);
const document = (globalThis.document);
const localStorage = (globalThis.localStorage);
// eslint-disable-next-line
const CustomEvent = (globalThis.CustomEvent);
const Event = (globalThis.Event);
const { EisCalculator, EIS_AXES, EIS_DEFAULT_WEIGHTS, EIS_CREDENTIAL_LABELS, EIS_VERDICTS, EIS_CUSTOM_TEMPLATES } = (eisCalculatorModule);
const { listEisFormulas, getEisFormula, validateFormulaRef } = (formulaRegistryModule);
const { computeQualityExtensionsFromObservations, classifyObservationForEis } = (qualityExtensionsModule);
const { enumerateCnpjScopes, enumerateAreaScopes, resolveScope } = (eisScopeResolverModule);
const { computeScopedEIS, computeSimplifiedEIS } = (snapshotEngineModule);
const { getModelIdSync } = (modelLinkModule);
const { getAllElements } = (elementsManagerModule);
const { getAllCampaigns, getCampaignCompleteness } = (campaignsManagerModule);
const { UNITS } = (unitsCatalogModule);
const { CONFIG } = (configModule);
const { t, getCurrentLanguage } = (translationsModule);
const { buildDefaultAxesForCustomProfile, buildPublishGuardIssues, createCustomProfile, defaultVerdictBands, getCurrentUserLabel, getCustomVerdictFromBands, markCustomDirty, newIsoNow, pushCustomAudit, validatePublishProfile, } = (eisCustomProfileUtilsModule);
const { applyBatchCorrection, openCorrectionWorkbench, refreshCorrectionWorkbench } = (eisCorrectionWorkbenchModule);
const { addCustomAxis, compareCustomWithBaseline, copyDefaultCustomProfile, createBlankCustomProfile, deleteCustomProfile, duplicateCustomProfile, editCustomAxis, editSelectedCustomTemplate, focusCustomPublishIssue, publishCustomProfile, removeCustomAxis, renameCustomProfile, saveCustomProfile, selectCustomProfile, setCustomBands, setCustomVetoEnabled, setCustomVetoMin, updateCustomSliderValue, } = (eisCustomScoreBuilderModule);
const { createTemplate: createCustomTemplate, fetchTemplateRows, mapApiTemplateRowsToProfiles, normalizeStoredCustomProfiles, publishTemplate: publishCustomTemplate, updateTemplate: updateCustomTemplate, } = (eisCustomProfileStoreModule);
const { buildCustomComparePanelHtml, buildCustomEditorHtml, buildCustomModeSectionHtml } = (eisCustomRendererModule);
const { renderUncertaintyBadge, wireUncertaintyBadge } = (uncertaintyBadgeModule);
const { buildAxisDetailBarsHtml, buildAxisDetailCardHtml, buildAxisProblemsHtml, buildContributionBarsHtml, buildImprovementListHtml, buildRingTooltipHtml, } = (eisDashboardRendererModule);
const { buildScaleStripHtml, computeRingChartLayout, computeScaleStripState } = (eisDashboardVisualsModule);
const { buildExtended10Scores, buildOdsDrillDownHtml, buildOdsPanelHtml, buildParallelIndicatorsHtml, buildQualityExtensionsHtml, ensureOdsDrillDownModal, getActiveOdsOverlay, getActiveParallelIndicators, } = (eisOdsPanelRendererModule);
// eslint-disable-next-line
const { collectHudScores, computeHudVisualizationState } = (eisHudStateBuilderModule);
const { buildAxisDetailViewModel, buildRingTooltipModel, buildVerdictDisplayState } = (eisDashboardDetailStateModule);
const { getCanvasPointerPosition, hitTestRingSegment, toggleExpandedAxis } = (eisCanvasUtilsModule);
// ================================================================
// MODULE STATE
// Estado do dashboard - chart instance e calculadora
// ================================================================
const calculator = new EisCalculator();
let radarChart: any = null;
let currentMode: any = 'geometric';
let cachedCredInfo: any = null;
let cachedCpResult: any = null;
/** Resultados de auto-cálculo por eixo (null = indisponível) */
const cachedAutoResults: any = { T: null, A: null, Cp: null, Ty: null, Cs: null, Cm: null };
/** Global Compliance cached result */
let cachedGcResult: any = null;
/**
 * Radar transparency cache — Calvin diretiva 2026-05-14:
 * EIS T axis recebe bônus 0..+1.0 do % de slices públicas no radar.
 * Load async via fire-and-forget no compute path, cache hits subsequentes.
 * @type {{ projectId: string|null, data: any, loadedAt: number, inflight: boolean }}
 */
const cachedRadarTransparency = { projectId: null, data: null, loadedAt: 0, inflight: false };
const RADAR_TRANSPARENCY_TTL_MS = 60_000; // 1 min — radar slices mudam raramente
function _refreshRadarTransparencyAsync() {
    if (cachedRadarTransparency.inflight)
        return;
    const now = Date.now();
    if (now - cachedRadarTransparency.loadedAt < RADAR_TRANSPARENCY_TTL_MS)
        return;
    cachedRadarTransparency.inflight = true;
    (async () => {
        try {
            const registryMod = (await import('../../core/models/registry.js' as string));
            const activeModel = await registryMod.getActiveModel?.();
            const projectId = activeModel?.id ||
                (typeof window !== 'undefined' && (window).__currentProjectId) ||
                null;
            if (!projectId) {
                cachedRadarTransparency.data = null;
                return;
            }
            const helperMod = (await import('../../core/radar/transparencyHelper.js' as string));
            const data = await helperMod.loadRadarTransparencyForProject(projectId);
            cachedRadarTransparency.projectId = projectId;
            cachedRadarTransparency.data = data;
            cachedRadarTransparency.loadedAt = Date.now();
        }
        catch (e: any) {
            console.debug('[eis:radarTransparency] skip:', (e)?.message || e);
        }
        finally {
            cachedRadarTransparency.inflight = false;
        }
    })();
}
/** Estado do toggle AUTO/MANUAL por eixo (true = auto ativado) */
const autoEnabled = ({
    T: false,
    A: false,
    Cp: false,
    Ty: false,
    Cs: false,
    Cm: false,
});
/** @type {'model'|'cnpj'|'area'} Escopo ativo do dashboard */
let currentScopeType = 'model';
/** @type {string|null} ID do escopo selecionado (nodeId para CNPJ, elementId para area) */
let currentScopeId: any = null;
/** @type {any} Resultado do escopo ativo (computeScopedEIS output) */
let currentScopedResult: any = null;
let _weightedSqlBridge: any = null;
/** Perfil custom ativo */
let activeCustomProfile: any = null;
/** Perfis custom salvos (carregados do localStorage) */
let customProfiles: any[] = [];
const customBuilderState = {
    get activeProfile() {
        return activeCustomProfile;
    },
    set activeProfile(value) {
        activeCustomProfile = value;
    },
    get customProfiles() {
        return customProfiles;
    },
    set customProfiles(value) {
        customProfiles = value;
    },
};
/** Ultimo resultado do modo custom (para compare panel) */
let _lastCustomResult: any = null;
/** Chave localStorage para perfis custom */
const CUSTOM_PROFILES_KEY = 'ecbyts-eis-custom-profiles';
const EIS_TEMPLATES_API = '/api/eis-templates';
/** Modo de visualização do painel EIS: 'core_6' | 'extended_10' */
const EIS_VIEW_MODE_KEY = 'ecbyts-eis-view-mode';
let _eisViewMode = 'core_6';
// ================================================================
// AXIS METADATA
// Nomes descritivos dos eixos para exibição no dashboard
// ================================================================
const AXIS_META = ({
    T: { key: 'eis.axis_T', fallback: 'Transparency' },
    A: { key: 'eis.axis_A', fallback: 'Accuracy' },
    Cp: { key: 'eis.axis_Cp', fallback: 'Completeness' },
    Ty: { key: 'eis.axis_Ty', fallback: 'Timeliness' },
    Cs: { key: 'eis.axis_Cs', fallback: 'Consistency' },
    Cm: { key: 'eis.axis_Cm', fallback: 'Comparability' },
});
const EIS_EXTENDED_AXES = (['T', 'A', 'Cp', 'Ty', 'Cs', 'Cm', 'V', 'U', 'Unc', 'Ex']);
const EIS_EXTENDED_DEFAULT_WEIGHTS = ({ V: 1, U: 1, Unc: 1, Ex: 1 });
function _canonicalFormulaRefForAxis( axisId: any) {
    return `eis.axis.${axisId}.v1`;
}
function _formulaOptionsForAxis( axisId: any) {
    const isCanonicalAxis = EIS_AXES.includes(axisId);
    const axisOptions = listEisFormulas()
        .filter((f: any) => f?.kind === 'axis' && !f?.deprecated)
        .filter((f: any) => (isCanonicalAxis ? f?.axis === axisId : true))
        .map((f: any) => ({ id: f.id, label: f.id }));
    if (!isCanonicalAxis)
        return [];
    if (axisOptions.length === 0) {
        return [{ id: _canonicalFormulaRefForAxis(axisId), label: _canonicalFormulaRefForAxis(axisId) }];
    }
    return axisOptions;
}
function _normalizeAxisFormulaRef( axisId: any, rawRef: any) {
    const ref = String(rawRef || '').trim();
    if (!ref)
        return EIS_AXES.includes(axisId) ? _canonicalFormulaRefForAxis(axisId) : '';
    // Backward compatibility: old alias format.
    if (ref === `eis-default:${axisId}`) {
        return _canonicalFormulaRefForAxis(axisId);
    }
    return ref;
}
function _validateAxisFormulaSelection( axisId: any, rawRef: any) {
    const formulaRef = _normalizeAxisFormulaRef(axisId, rawRef);
    const validation = validateFormulaRef(formulaRef);
    if (!validation.ok)
        return { ok: false, error: validation.error, formulaRef };
    const def = getEisFormula(formulaRef);
    if (!def || def.kind !== 'axis') {
        return { ok: false, error: `formula_ref must be axis formula: ${formulaRef}`, formulaRef };
    }
    if (EIS_AXES.includes(axisId) && def.axis !== axisId) {
        return {
            ok: false,
            error: `formula_ref axis mismatch: expected ${axisId}, got ${def.axis}`,
            formulaRef,
        };
    }
    return { ok: true, formulaRef, def };
}
// ================================================================
// COLOR & CANVAS HELPERS
// Gradiente contínuo de cor por score e setup HiDPI para canvas
// ================================================================
/**
 * Converte score EIS (0-5) em cor CSS via gradiente contínuo de 5 stops.
 * Diferente de getVerdictColor() que retorna 3 cores categóricas (verdict).
 * @param {number} score - 0.0 a 5.0
 * @returns {string} CSS rgb() color
 */
function scoreToColor( score: any) {
    if (!Number.isFinite(score))
        return 'rgb(239,68,68)';
    const s = Math.max(0, Math.min(5, score));
    const stops = ([
        [0, [239, 68, 68]], // red
        [1.5, [249, 115, 22]], // orange
        [2.5, [234, 179, 8]], // yellow
        [3.5, [34, 197, 94]], // green
        [5, [5, 150, 105]], // teal
    ]);
    let lo: any = stops[0], hi: any = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
        if (s >= (stops[i] as any)[0] && s <= (stops[i + 1] as any)[0]) {
            lo = stops[i];
            hi = stops[i + 1];
            break;
        }
    }
    const t = lo[0] === hi[0] ? 0 : (s - lo[0]) / (hi[0] - lo[0]);
    const r = Math.round(lo[1][0] + (hi[1][0] - lo[1][0]) * t);
    const g = Math.round(lo[1][1] + (hi[1][1] - lo[1][1]) * t);
    const b = Math.round(lo[1][2] + (hi[1][2] - lo[1][2]) * t);
    return `rgb(${r},${g},${b})`;
}
/**
 * Configura canvas para HiDPI (retina). Escala uma única vez.
 * Reutilizável por renderRingChart e updateEisStatusBadge.
 * @param {any} canvas
 * @returns {any}
 */
function setupHiDPI( canvas: any) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    if (canvas.dataset.scaled !== '1') {
        canvas.dataset.logicalW = canvas.width;
        canvas.dataset.logicalH = canvas.height;
        canvas.width = canvas.width * dpr;
        canvas.height = canvas.height * dpr;
        canvas.style.width = canvas.dataset.logicalW + 'px';
        canvas.style.height = canvas.dataset.logicalH + 'px';
        ctx.scale(dpr, dpr);
        canvas.dataset.scaled = '1';
    }
    return {
        ctx,
        W: parseInt(canvas.dataset.logicalW),
        H: parseInt(canvas.dataset.logicalH),
    };
}
/** Segmentos do ring chart para hit detection (Batch 2) */
let ringSegments: any[] = [];
/** Referência ao marker da scale strip para updates rápidos */
let _scaleStripMarker: any = null;
let _scaleStripValue: any = null;
let _scaleStripInitialized = false;
/** F1: Ring interaction state */
let _ringHoverAxis: any = null;
let _ringListenersAttached = false;
/** F2: Expanded axis detail */
let _expandedAxis: any = null;
/** Campaign details cache (com details[] para Cp drill-down) */
let cachedCampaignDetails: any = null;
/** Cached observations enriched with element info */
let cachedAllObs: any = null;
/** Ãšltimo resultado do recalculate (para tooltip/detail/improvement) */
let _lastResult: any = null;
let _lastScores: any = null;
let _lastUncertainty: any = null;
let _eisOpenedAt = 0;
let _customOpenedAt = 0;
const _manualAxisOverrides: any = ({
    T: false,
    A: false,
    Cp: false,
    Ty: false,
    Cs: false,
    Cm: false,
});
const _manualAxisValues: any = ({ T: 3, A: 3, Cp: 3, Ty: 3, Cs: 3, Cm: 3 });
function _getViewportBucket() {
    const w = Number(window?.innerWidth || 0);
    if (w <= 480)
        return 'mobile';
    if (w <= 1024)
        return 'tablet';
    return 'desktop';
}
function _trackEisUxEvent( target: any, metadata: any = {}) {
    import('../telemetry/tracker.js' as string)
        .then(({ trackEvent }: any) => {
        trackEvent('navigation', target, {
            viewport: _getViewportBucket(),
            ...metadata,
        });
    })
        .catch((_e: any) => console.debug('[utils/handlers/eis:silent-catch]', _e?.message || _e));
}
// ================================================================
// PUBLIC HANDLERS
// ================================================================
/**
 * Open the EIS dashboard modal.
 * Abre o modal, computa credencial agregada das leituras e inicializa UI.
 */
function handleOpenEisDashboard() {
    const modal = document.getElementById('eis-dashboard-modal');
    if (!modal)
        return;
    // Restore view mode from localStorage
    try {
        const saved = localStorage.getItem(EIS_VIEW_MODE_KEY) || '';
        if (saved === 'core_6' || saved === 'extended_10')
            _eisViewMode = saved;
    }
    catch (e: any) {
        console.debug('[eis] restore-view-mode:', e?.message || e); /* original silent */
    }
    _applyViewMode();
    modal.classList.add('active');
    wireEisShareButton(modal);
    _eisOpenedAt = Date.now();
    _trackEisUxEvent('eis_opened', {
        mode: currentMode === 'custom' ? 'custom' : 'core',
        source: 'eis-dashboard',
    });
    // Reset scale strip state for fresh render
    _scaleStripMarker = null;
    _scaleStripValue = null;
    _scaleStripInitialized = false;
    // Coleta dados do modelo uma vez (performance)
    const elements = getAllElements();
    const allObs = collectAllObservations();
    cachedAllObs = allObs;
    const campaigns = getAllCampaigns();
    // Tentativa assíncrona de obter agregado oficial SQL do api-server.
    // Não bloqueia o modal; fallback permanece runtime.
    _loadWeightedSqlSource()
        .then(() => {
        try {
            recalculate();
        }
        catch (e: any) {
            console.debug('[eis] recalculatePost:', e?.message || e);
            // no-op: cálculos síncronos já foram executados.
        }
    })
        .catch((err: any) => console.warn('[handlers/eis] loadWeightedSqlSource failed:', err));
    // Credencial agregada
    cachedCredInfo = EisCalculator.computeAggregateCredential(allObs);
    // Auto-cálculo de todos os eixos
    const campaignStats = campaigns.map((c: any) => getCampaignCompleteness(c.id, elements));
    cachedCampaignDetails = campaignStats;
    cachedCpResult = EisCalculator.computeCpFromCampaigns(campaignStats);
    cachedAutoResults.Cp = cachedCpResult;
    cachedAutoResults.T = EisCalculator.computeTFromObservations(allObs, cachedRadarTransparency.data);
    cachedAutoResults.A = EisCalculator.computeAFromModel(elements, allObs);
    cachedAutoResults.Ty = EisCalculator.computeTyFromObservations(allObs);
    cachedAutoResults.Cs = EisCalculator.computeCsFromObservations(allObs, UNITS);
    cachedAutoResults.Cm = EisCalculator.computeCmFromObservations(allObs, CONFIG.PARAMETERS);
    // Global Compliance (GC) - async computation
    try {
        Promise.all([
            import('../../core/validation/globalCompliance.js' as string),
            import('../../core/validation/globalThresholds.js' as string),
        ])
            .then(([{ computeGlobalCompliance }, { JURISDICTIONS }]) => {
            cachedGcResult = computeGlobalCompliance((allObs));
            window.__ecbyts_gc_jurisdictions = { JURISDICTIONS };
            _renderGcSection();
        })
            .catch((e: any) => {
            console.debug('[eis:global-compliance]', e?.message || e);
            cachedGcResult = null;
        });
    }
    catch {
        cachedGcResult = null;
    }
    // Ativa AUTO por default onde dados disponíveis
    for (const axis of EIS_AXES) {
        const hasAuto = (cachedAutoResults as any)[axis] != null;
        (autoEnabled as any)[axis] = hasAuto && !_manualAxisOverrides[axis];
    }
    // Carrega perfis custom do localStorage
    loadCustomProfiles();
    // Inicializa UI conforme modo
    if (currentMode === 'custom') {
        renderCustomModeUI();
    }
    // Standard sliders are now inline in contribution bars - no separate render needed
    // Scope selector - injetado dinamicamente
    currentScopeType = 'model';
    currentScopeId = null;
    currentScopedResult = null;
    _renderScopeSelector();
    initRingInteraction();
    recalculate();
    _renderGcSection();
    _renderOdsPanelForActiveScope();
    _renderParallelIndicatorsForActiveScope();
    _renderQualityExtensionsForActiveScope();
}
async function _loadWeightedSqlSource() {
    const modelId = getModelIdSync() || '';
    const url = modelId ? `/api/eis-weighted?model_id=${encodeURIComponent(modelId)}` : '/api/eis-weighted';
    const fallback = { success: true, data: { available: false, source: 'runtime', reason: 'fallback' } };
    const safeFetchUrl = new URL('../api/safeFetch.js', import.meta.url).href;
    const { safeFetchJson } = (await import(safeFetchUrl));
    const payload = await safeFetchJson(url, { fallback, tag: 'eis:weighted-source', timeoutMs: 4000 });
    const data = payload?.data || payload || null;
    if (!data || data.available !== true || data.source !== 'sql') {
        _weightedSqlBridge = null;
        return null;
    }
    _weightedSqlBridge = {
        source: 'sql',
        sqlScore: Number(data.sql_score ?? 0),
        runtimeScore: Number(data.runtime_score ?? 0),
        delta: Number(data.delta ?? 0),
        updatedAt: data.updated_at || null,
    };
    return _weightedSqlBridge;
}
/**
 * Render the Global Compliance (GC) companion indicator section.
 * Displayed below the 6 standard sliders in the EIS dashboard.
 */
function _renderGcSection() {
    // Find or create GC container
    const slidersContainer = document.getElementById('eis-sliders-container');
    if (!slidersContainer)
        return;
    let gcEl = document.getElementById('eis-gc-section');
    if (!gcEl) {
        gcEl = document.createElement('div');
        gcEl.id = 'eis-gc-section';
        gcEl.style.cssText =
            'margin-top:12px;padding-top:12px;border-top:1px solid var(--eis-border, rgba(99,102,241,0.2));';
        slidersContainer.parentNode?.insertBefore(gcEl, slidersContainer.nextSibling);
    }
    if (!cachedGcResult) {
        gcEl.innerHTML = `<div style="display:flex;align-items:center;gap:8px;color:var(--eis-muted,rgba(255,255,255,0.5));font-size:11px;">
            <span style="font-weight:600;font-size:12px;">GLOBAL COMPLIANCE</span>
            <span>&#8212; No CAS-mapped observations</span>
        </div>`;
        return;
    }
    const gc = cachedGcResult;
    const scoreColor = gc.score >= 4
        ? 'var(--eis-green,#22c55e)'
        : gc.score >= 3
            ? 'var(--eis-yellow,#eab308)'
            : 'var(--eis-red,#ef4444)';
    const dots = Array.from({ length: 5 }, (_, i) => `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${i < gc.score ? scoreColor : 'rgba(255,255,255,0.15)'};margin-right:2px;"></span>`).join('');
    let detailRows = '';
    const { JURISDICTIONS: _jurisdictions } = window.__ecbyts_gc_jurisdictions || {};
    if (gc.jurisdictionResults) {
        for (const [jId, jr] of Object.entries(gc.jurisdictionResults) as [string, any][]) {
            if (jr.total === 0)
                continue;
            const statusIcon = jr.sitePass ? '&#10003;' : '&#10007;';
            const statusColor = jr.sitePass ? 'var(--eis-green,#22c55e)' : 'var(--eis-red,#ef4444)';
            const failedText = jr.failedSubstances.length > 0
                ? jr.failedSubstances
                    .map((cas: any) => {
                    const sub = gc.substanceResults?.[cas]?.[jId];
                    const param = CONFIG.PARAMETERS.find((p: any) => p.casNumber === cas);
                    const name = param ? param.name || param.id : cas;
                    return sub ? `${name} (${sub.value.toFixed(1)} > ${sub.threshold} ${sub.unit})` : name;
                })
                    .join(', ')
                : '&#8212;';
            const jName = jId.replace('_', ' ');
            detailRows += `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <td style="padding:3px 6px;font-size:11px;">${jName}</td>
                <td style="padding:3px 6px;color:${statusColor};font-size:12px;">${statusIcon} ${jr.sitePass ? 'PASS' : 'FAIL'}</td>
                <td style="padding:3px 6px;font-size:11px;color:var(--eis-muted,rgba(255,255,255,0.5));">${failedText}</td>
            </tr>`;
        }
    }
    gcEl.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <span style="font-weight:600;font-size:12px;color:var(--eis-text,rgba(255,255,255,0.87));">GLOBAL COMPLIANCE</span>
            <span style="font-size:11px;color:var(--eis-muted);">AUTO</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
            <span>${dots}</span>
            <span style="font-size:14px;font-weight:700;color:${scoreColor};">${gc.score}.0 / 5.0</span>
            <span style="font-size:11px;color:var(--eis-muted);">${gc.passedJurisdictions} / ${gc.totalJurisdictions} jurisdictions pass</span>
        </div>
        <div style="font-size:11px;color:var(--eis-muted);margin-bottom:6px;">${gc.verdict} &#8226; ${gc.assessedSubstances} substance(s) assessed</div>
        <details style="margin-top:4px;">
            <summary style="cursor:pointer;font-size:11px;color:var(--eis-accent,#6366f1);">Details</summary>
            <table style="width:100%;border-collapse:collapse;margin-top:6px;">
                <thead><tr>
                    <th style="text-align:left;padding:3px 6px;font-size:10px;color:var(--eis-muted);">Jurisdiction</th>
                    <th style="text-align:left;padding:3px 6px;font-size:10px;color:var(--eis-muted);">Status</th>
                    <th style="text-align:left;padding:3px 6px;font-size:10px;color:var(--eis-muted);">Failed Substances</th>
                </tr></thead>
                <tbody>${detailRows}</tbody>
            </table>
        </details>
        <div style="margin-top:8px;font-size:10px;color:var(--eis-muted);font-style:italic;">Informational only — not legal advice</div>
    `;
}
/**
 * Close the EIS dashboard modal.
 * Fecha o modal e destroi a instância do Chart.js para evitar leaks.
 */
/**
 * Refresh EIS dashboard data without closing the modal.
 * Recomputa todos os caches e re-renderiza.
 */
function handleRefreshEisDashboard() {
    const elements = getAllElements();
    const allObs = collectAllObservations();
    cachedAllObs = allObs;
    const campaigns = getAllCampaigns();
    cachedCredInfo = EisCalculator.computeAggregateCredential(allObs);
    const campaignStats = campaigns.map((c: any) => getCampaignCompleteness(c.id, elements));
    cachedCampaignDetails = campaignStats;
    cachedCpResult = EisCalculator.computeCpFromCampaigns(campaignStats);
    cachedAutoResults.Cp = cachedCpResult;
    cachedAutoResults.T = EisCalculator.computeTFromObservations(allObs, cachedRadarTransparency.data);
    cachedAutoResults.A = EisCalculator.computeAFromModel(elements, allObs);
    cachedAutoResults.Ty = EisCalculator.computeTyFromObservations(allObs);
    cachedAutoResults.Cs = EisCalculator.computeCsFromObservations(allObs, UNITS);
    cachedAutoResults.Cm = EisCalculator.computeCmFromObservations(allObs, CONFIG.PARAMETERS);
    for (const axis of EIS_AXES) {
        const hasAuto = (cachedAutoResults as any)[axis] != null;
        (autoEnabled as any)[axis] = hasAuto && !_manualAxisOverrides[axis];
    }
    _barsSliderDragging = false;
    recalculate();
    updateEisStatusBadge();
    _renderOdsPanelForActiveScope();
    _renderParallelIndicatorsForActiveScope();
    _renderQualityExtensionsForActiveScope();
}
function handleCloseEisDashboard() {
    if (currentMode === 'custom' && activeCustomProfile?.isDirty) {
        const elapsedMs = _customOpenedAt > 0 ? Math.max(0, Date.now() - _customOpenedAt) : null;
        _trackEisUxEvent('eis_custom_dropoff_before_save', {
            mode: 'custom',
            profileId: activeCustomProfile?.id || null,
            elapsedMs,
        });
    }
    const modal = document.getElementById('eis-dashboard-modal');
    if (modal)
        modal.classList.remove('active');
    destroyRadarChart();
    cleanupRingInteraction();
    cachedCredInfo = null;
    cachedCpResult = null;
    _lastResult = null;
    _lastScores = null;
    // Reset scale strip state for full re-render on next open
    _scaleStripMarker = null;
    _scaleStripValue = null;
    _scaleStripInitialized = false;
    _customOpenedAt = 0;
    for (const axis of EIS_AXES) {
        (cachedAutoResults as any)[axis] = null;
    }
}
/**
 * Handle click on modal overlay to close.
 * Fecha se o clique foi no overlay (não no conteúdo do modal).
 * @param {MouseEvent} e
 */
function handleEisOverlayClick( e: any) {
    if (e.target.id === 'eis-dashboard-modal') {
        handleCloseEisDashboard();
    }
}
/**
 * Handle mode toggle between geometric and veto.
 * Alterna o modo de cálculo e recalcula imediatamente.
 * @param {'geometric'|'veto'} mode
 */
function handleEisModeChange( mode: any) {
    currentMode = mode;
    const btns = document.querySelectorAll('.eis-mode-btn');
    btns.forEach((btn: any) => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    // Alterna entre UI padrão e custom
    const standardSection = document.getElementById('eis-standard-section');
    const customSection = document.getElementById('eis-custom-section');
    if (mode === 'custom') {
        if (standardSection)
            standardSection.style.display = 'none';
        if (customSection)
            customSection.style.display = '';
        renderCustomModeUI();
    }
    else {
        if (standardSection)
            standardSection.style.display = '';
        if (customSection)
            customSection.style.display = 'none';
    }
    recalculate();
    updateEisStatusBadge();
}
/**
 * Shortcut UX: open Advanced settings and switch directly to Custom mode.
 * Reduces friction to reach Custom Builder.
 */
function handleEisOpenCustomBuilder() {
    const advanced: any = document.getElementById('eis-advanced-section');
    if (advanced && typeof advanced.open !== 'undefined') {
        advanced.open = true;
    }
    handleEisModeChange('custom');
    if (_customOpenedAt <= 0)
        _customOpenedAt = Date.now();
    const timeToCustomMs = _eisOpenedAt > 0 ? Math.max(0, Date.now() - _eisOpenedAt) : null;
    _trackEisUxEvent('eis_custom_opened', {
        mode: 'custom',
        source: 'eis-shortcut',
        timeToCustomMs,
    });
    const customSection = document.getElementById('eis-custom-section');
    customSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
/**
 * Handle slider input for any axis.
 * Atualiza o valor exibido e recalcula em tempo real.
 * @param {string} axis - Eixo que mudou (T, A, Cp, Ty, Cs, Cm)
 */
function handleEisSliderInput( axis: any) {
    const slider = document.getElementById(`eis-slider-${axis}`);
    const valueEl = document.getElementById(`eis-value-${axis}`);
    if (slider && valueEl) {
        valueEl.textContent = slider.value;
    }
    recalculate();
    updateEisStatusBadge();
}
/**
 * Reset all sliders to default value (3).
 * Reseta todos os eixos para 3 e recalcula.
 */
function handleEisResetDefaults() {
    for (const axis of EIS_AXES) {
        // Eixos em AUTO não resetam
        if ((autoEnabled as any)[axis] && (cachedAutoResults as any)[axis])
            continue;
        const slider = document.getElementById(`eis-slider-${axis}`);
        const valueEl = document.getElementById(`eis-value-${axis}`);
        if (slider)
            slider.value = 3;
        if (valueEl)
            valueEl.textContent = '3';
    }
    currentMode = 'geometric';
    const btns = document.querySelectorAll('.eis-mode-btn');
    btns.forEach((btn: any) => btn.classList.toggle('active', btn.dataset.mode === 'geometric'));
    const standardSection = document.getElementById('eis-standard-section');
    const customSection = document.getElementById('eis-custom-section');
    if (standardSection)
        standardSection.style.display = '';
    if (customSection)
        customSection.style.display = 'none';
    recalculate();
    updateEisStatusBadge();
}
// ================================================================
// PRIVATE - DATA COLLECTION
// Coleta observações de todos os elementos do modelo
// ================================================================
/**
 * Collect all observations from all elements in the current model.
 * Coleta todas as observações de todos os elementos para cálculo agregado.
 * @returns {Array<Object>}
 */
function collectAllObservations() {
    const elements = getAllElements();
    const allObs = [];
    for (const el of elements) {
        if (Array.isArray(el?.data?.observations)) {
            for (const obs of el.data.observations) {
                allObs.push({ ...obs, _elementId: el.id, _elementName: el.data?.name || el.id });
            }
        }
    }
    return allObs;
}
function _getObservationsForActiveScope() {
    if (currentScopeType === 'model' || !currentScopeId)
        return collectAllObservations();
    const allElements = getAllElements();
    const allCampaigns = getAllCampaigns();
    const modelId = getModelIdSync();
    const scope = currentScopeType === 'cnpj'
        ? { type: 'cnpj', nodeId: currentScopeId, cnpj: '', modelId }
        : { type: 'area', elementId: currentScopeId, modelId };
    const { elements } = resolveScope(scope, allElements, allCampaigns);
    const obs = [];
    for (const el of elements || []) {
        if (!Array.isArray(el?.data?.observations))
            continue;
        for (const o of el.data.observations)
            obs.push({ ...o, _elementId: el.id, _elementName: el.data?.name || el.id });
    }
    return obs;
}
function _computeQualityExtensions( observations: any) {
    return computeQualityExtensionsFromObservations(observations, { rpdThreshold: 30, rsdThreshold: 20 });
}
function _buildExtended10Scores( baseScores: any) {
    const q = _computeQualityExtensions(_getObservationsForActiveScope());
    return buildExtended10Scores(baseScores, q);
}
function _applyViewMode() {
    const panel = document.getElementById('eis-quality-extensions');
    const isExtended = _eisViewMode === 'extended_10';
    if (panel)
        panel.style.display = isExtended ? '' : 'none';
    // Sync toggle button states
    const btnCore = document.getElementById('eis-view-core-btn');
    const btnExt = document.getElementById('eis-view-ext-btn');
    if (btnCore)
        btnCore.classList.toggle('active', !isExtended);
    if (btnExt)
        btnExt.classList.toggle('active', isExtended);
}
function _renderQualityExtensionsForActiveScope() {
    const panel = document.getElementById('eis-quality-extensions');
    if (!panel)
        return;
    // Always populate; _applyViewMode controls visibility
    if (_eisViewMode !== 'extended_10') {
        _applyViewMode();
        return;
    }
    const q = _computeQualityExtensions(_getObservationsForActiveScope());
    panel.innerHTML = buildQualityExtensionsHtml(q, { translate: t });
}
/**
 * Alterna entre os modos de visualização do EIS: 'core_6' | 'extended_10'.
 * Persiste escolha no localStorage e sincroniza UI.
 * @param {string} mode
 */
function handleEisToggleView( mode: any) {
    if (mode !== 'core_6' && mode !== 'extended_10')
        return;
    _eisViewMode = mode;
    try {
        localStorage.setItem(EIS_VIEW_MODE_KEY, mode);
    }
    catch (e: any) {
        console.debug('[eis] save-view-mode-quota:', e?.message || e); /* original: quota exceeded — state already updated in memory */
    }
    _applyViewMode();
    if (mode === 'extended_10') {
        _renderQualityExtensionsForActiveScope();
    }
}
function handleEisOpenCorrectionWorkbench( issue: any = 'validity') {
    openCorrectionWorkbench(issue, {
        translate: t,
        getElements: getAllElements,
        classifyObservation: (observation: any) => classifyObservationForEis(observation, { rpdThreshold: 30, rsdThreshold: 20 }),
    });
}
function handleEisRefreshCorrectionWorkbench( issue: any = 'validity') {
    refreshCorrectionWorkbench(issue, {
        translate: t,
        getElements: getAllElements,
        classifyObservation: (observation: any) => classifyObservationForEis(observation, { rpdThreshold: 30, rsdThreshold: 20 }),
    });
}
async function handleEisApplyBatchCorrection( issue: any = 'validity') {
    await applyBatchCorrection(issue, {
        translate: t,
        getElements: getAllElements,
        classifyObservation: (observation: any) => classifyObservationForEis(observation, { rpdThreshold: 30, rsdThreshold: 20 }),
        onRecalculate: recalculate,
        onRenderQualityExtensions: _renderQualityExtensionsForActiveScope,
        onTrackEisUxEvent: _trackEisUxEvent,
    });
}
// ================================================================
// PRIVATE - CALCULATION & UI UPDATE
// Recálculo central que atualiza gauge, radar e veredito
// ================================================================
/**
 * Read slider values, calculate EIS, and update all UI elements.
 * Suporta modos geometric/veto (com AUTO/MANUAL por eixo) e custom.
 */
function _readStandardScores() {
    const scores: any = {};
    for (const axis of EIS_AXES) {
        const autoResult = (cachedAutoResults as any)[axis];
        if ((autoEnabled as any)[axis] && autoResult) {
            scores[axis] = autoResult.score;
        } else {
            const inlineSlider = document.querySelector(`.eis-contrib-slider[data-axis="${axis}"]`);
            const stdSlider = document.getElementById(`eis-slider-${axis}`);
            scores[axis] = inlineSlider
                ? parseInt((inlineSlider as any).value, 10)
                : stdSlider
                    ? parseInt((stdSlider as any).value, 10)
                    : (_manualAxisValues[axis] ?? 3);
            _manualAxisValues[axis] = scores[axis];
        }
    }
    return scores;
}

function _buildAxesUValues(scores: any) {
    const axesUValues: any = {};
    for (const axis of EIS_AXES) {
        axesUValues[axis] = { value: scores[axis], u: 0.5, type: 'absolute', k: 2 };
    }
    return axesUValues;
}

function _storeUncertaintyFromResult(result: any) {
    _lastUncertainty = {
        className: result?.uncertaintyClass || 'grey',
        metrics: result?.qualityMetrics || null,
        policy: result?.uncertaintyPolicy || null,
    };
}

function _updateStandardDashboard(result: any, scores: any, credMultiplier: number) {
    _lastResult = result;
    _lastScores = { ...scores };
    _storeUncertaintyFromResult(result);
    const extendedScores = _buildExtended10Scores(result.adjustedScores);
    const extendedWeights = { ...calculator.weights, ...EIS_EXTENDED_DEFAULT_WEIGHTS };
    renderRingChart(result.eis, extendedScores, extendedWeights, result.verdict, result.vetoed === true, EIS_EXTENDED_AXES);
    renderContributionBars(extendedScores, extendedWeights, EIS_EXTENDED_AXES);
    updateVerdict(result);
    updateCredentialInfo(cachedCredInfo);
    if (_expandedAxis) renderAxisDetail(_expandedAxis);
    renderImprovementList(scores, calculator.weights, credMultiplier, EIS_AXES);
    _renderOdsPanelForActiveScope();
    _renderParallelIndicatorsForActiveScope();
    _renderQualityExtensionsForActiveScope();
}

function recalculate() {
    if (currentMode === 'custom') {
        _lastUncertainty = null;
        recalculateCustom();
        return;
    }
    const scores = _readStandardScores();
    try {
        const credMultiplier = cachedCredInfo ? cachedCredInfo.multiplier : 1.0;
        const axesUValues = _buildAxesUValues(scores);
        const result: any = calculator.calculateWithUncertainty(axesUValues, currentMode as any, 'common', credMultiplier, {
            matrix: _inferActiveMatrix(),
            ndMethod: 'auto',
        });
        result.aggregationSource = _weightedSqlBridge?.source === 'sql' ? 'sql' : result.aggregationSource || 'runtime';
        _updateStandardDashboard(result, scores, credMultiplier);
    } catch (err: any) {
        log.error('Dashboard recalculation failed', err.message);
    }
}
function _collectMatrixCounts(elements: any[]) {
    const counts = new Map();
    for (const el of elements) {
        const observations = el?.data?.observations;
        if (!Array.isArray(observations)) continue;
        for (const obs of observations) {
            const raw = obs?.sample_matrix || obs?.matrix || obs?.sampleMatrix || null;
            const key = String(raw || '').trim().toLowerCase();
            if (!key) continue;
            counts.set(key, (counts.get(key) || 0) + 1);
        }
    }
    return counts;
}

function _pickMostFrequentMatrix(counts: Map<string, number>) {
    if (counts.size === 0) return 'default';
    return [...counts.entries()].sort((a: any, b: any) => b[1] - a[1])[0]?.[0] || 'default';
}

function _inferActiveMatrix() {
    try {
        const elements = getAllElements() || [];
        const counts = _collectMatrixCounts(elements);
        return _pickMostFrequentMatrix(counts);
    } catch {
        return 'default';
    }
}
/**
 * Resolve ODS overlay for current scope context.
 * Thin wrapper - pure logic em eisOdsPanelRenderer.js (P0-1 seam).
 * @returns {Object|null}
 */
function _getActiveOdsOverlay() {
    return getActiveOdsOverlay({
        currentScopeType,
        currentScopedResult,
        computeModelOverlay: () => computeSimplifiedEIS(getAllElements(), getAllCampaigns()),
    });
}
/**
 * Render ODS panel in EIS modal.
 * Thin wrapper - delega construcao de HTML para eisOdsPanelRenderer.js (P0-1 seam).
 * @param {Object|null} overlay
 */
function _renderOdsPanel( overlay: any) {
    const panel = document.getElementById('eis-ods-panel');
    if (!panel)
        return;
    const { visible, html } = buildOdsPanelHtml(overlay, { escapeHtml, getCurrentLanguage });
    if (!visible) {
        panel.innerHTML = '';
        panel.style.display = 'none';
        return;
    }
    panel.style.display = '';
    panel.innerHTML = html;
    // Wire drill-down - click no card abre modal com breakdown SPEC §7
    panel.querySelectorAll('.eis-ods-card').forEach((card: any) => {
        card.addEventListener('click', () => {
            const id = card.dataset.odsId || '';
            const axis = overlay.axes?.[id];
            if (axis)
                _openOdsDrillDown(id, axis, overlay);
        });
    });
}
/**
 * Abre modal de drill-down para um ODS específico - SPEC §7 "dados usados no cálculo".
 * Thin wrapper - delega construcao de HTML para eisOdsPanelRenderer.js (P0-1 seam).
 * @param {string} id       eixo (ODS1..ODS17)
 * @param {Object} axis     resultado do eixo (incluindo notes[])
 * @param {Object} overlay  contexto do overlay pai
 */
function _openOdsDrillDown( id: any, axis: any, overlay: any) {
    const modal = ensureOdsDrillDownModal({ doc: document });
    modal.innerHTML = buildOdsDrillDownHtml({ id, axis, overlay, escapeHtml });
    modal.hidden = false;
    modal.querySelector('.eis-ods-drill-close')?.addEventListener('click', () => {
        modal.hidden = true;
    });
}
/**
 * Render ODS panel using the active scope context.
 */
function _renderOdsPanelForActiveScope() {
    _renderOdsPanel(_getActiveOdsOverlay());
}
/**
 * Resolve factual phase-1 indicators for active scope.
 * Thin wrapper - pure logic em eisOdsPanelRenderer.js (P0-1 seam).
 * @returns {{baseScore:number, governanceAdjustment:number, finalScore:number, confidence?:{score:number,level:string}}|null}
 */
function _getActiveParallelIndicators() {
    return getActiveParallelIndicators({
        currentScopeType,
        currentScopedResult,
        computeModelResult: () => computeSimplifiedEIS(getAllElements(), getAllCampaigns()),
        weightedSqlBridge: _weightedSqlBridge,
    });
}
/**
 * Render phase-1 parallel indicators visibly on ring card.
 * Thin wrapper - HTML construido em eisOdsPanelRenderer.js (P0-1 seam).
 */
function _renderParallelIndicatorsForActiveScope() {
    const container = document.getElementById('eis-parallel-indicators');
    if (!container)
        return;
    container.innerHTML = buildParallelIndicatorsHtml(_getActiveParallelIndicators(), { escapeHtml });
}
/**
 * Aplica badge AUTO no slider de um eixo.
 * @param {string} axis
 * @param {Object} autoResult
 */
function applyAutoBadge( axis: any, autoResult: any) {
    const slider = document.getElementById(`eis-slider-${axis}`);
    const valueEl = document.getElementById(`eis-value-${axis}`);
    if (slider) {
        slider.value = Math.round(autoResult.score);
        slider.disabled = true;
    }
    if (valueEl) {
        const tooltip = buildAutoTooltip(axis, autoResult);
        valueEl.innerHTML = `${Math.round(autoResult.score)} <span class="eis-auto-badge" title="${tooltip}">${t('eis.auto') || 'AUTO'}</span>`;
    }
}
/**
 * Remove badge AUTO de um eixo (modo manual).
 * @param {string} axis
 */
function _clearAutoBadge( axis: any) {
    const slider = document.getElementById(`eis-slider-${axis}`);
    const valueEl = document.getElementById(`eis-value-${axis}`);
    if (slider)
        slider.disabled = false;
    if (valueEl && valueEl.querySelector('.eis-auto-badge')) {
        valueEl.textContent = slider ? slider.value : '3';
    }
}
/**
 * Constrói tooltip descritivo para badge AUTO de cada eixo.
 * @param {string} axis
 * @param {Object} result
 * @returns {string}
 */
function buildAutoTooltip( axis: any, result: any) {
    return _pureBuildAutoTooltip(axis, result, t);
}
/**
 * Recálculo para modo Custom.
 * Lê sliders dinâmicos dos eixos custom e calcula via calculateCustom().
 */
function _renderEmptyCustomDashboard(verdict?: string, vetoed?: boolean) {
    _lastCustomResult = null;
    renderRingChart(0, {}, {}, verdict || '', vetoed || false, EIS_EXTENDED_AXES);
    renderContributionBars({}, {}, EIS_EXTENDED_AXES);
    _renderCustomComparePanel();
}

function _readCustomScores(enabledAxes: any[]) {
    const axisScores: Record<string, number> = {};
    for (const ax of enabledAxes) {
        const slider = document.getElementById(`eis-custom-slider-${ax.id}`);
        axisScores[ax.id] = slider ? parseInt((slider as any).value, 10) : (_manualAxisValues[ax.id] ?? 3);
        _manualAxisValues[ax.id] = axisScores[ax.id];
    }
    return axisScores;
}

function _applyCustomVetoRule(finalResult: any, axisScores: Record<string, number>, profile: any) {
    if (!profile?.veto?.enabled) return finalResult;
    const minAxis = Math.max(1, Math.min(5, Number(profile?.veto?.minAxis || 2)));
    const hasCriticalAxis = Object.values(axisScores).some((v: any) => Number(v) <= minAxis);
    if (!hasCriticalAxis) return finalResult;
    return { ...finalResult, eis: 0, vetoed: true, verdict: 'Critical Data' };
}

function _updateCustomDashboard(
    result: any,
    axisScores: Record<string, number>,
    axisWeights: Record<string, number>,
    axisOrder: string[],
) {
    let finalResult: any = { ...result, aggregationSource: (result as any).aggregationSource || 'runtime' };
    finalResult = _applyCustomVetoRule(finalResult, axisScores, activeCustomProfile);
    finalResult.verdict = _getCustomVerdictFromBands(finalResult.eis, activeCustomProfile?.verdictBands);
    _lastCustomResult = finalResult;
    renderRingChart(finalResult.eis, axisScores, axisWeights, finalResult.verdict, finalResult.vetoed === true, axisOrder);
    renderContributionBars(axisScores, axisWeights, axisOrder);
    updateVerdict(finalResult);
    _renderCustomComparePanel();
}

function recalculateCustom() {
    if (!activeCustomProfile?.axes || activeCustomProfile.axes.length < 2) {
        _renderEmptyCustomDashboard();
        return;
    }
    const enabledAxes = activeCustomProfile.axes.filter((ax: any) => ax?.enabled !== false);
    if (enabledAxes.length < 2) {
        _renderEmptyCustomDashboard('Critical Data', true);
        return;
    }
    const axisWeights: Record<string, number> = {};
    const axisOrder: string[] = [];
    for (const ax of enabledAxes) {
        axisWeights[ax.id] = ax.weight;
        axisOrder.push(ax.id);
    }
    const axisScores = _readCustomScores(enabledAxes);
    try {
        const result = calculator.calculateCustom(axisScores, axisWeights);
        _updateCustomDashboard(result, axisScores, axisWeights, axisOrder);
    } catch (err: any) {
        _lastCustomResult = null;
        log.error('Custom profile calculation failed', err.message);
    }
}
/**
 * Update the verdict badge display.
 * Atualiza o badge de veredito com cor, emoji e descrição.
 * @param {any} result
 */
function updateVerdict( result: any) {
    const badge = document.getElementById('eis-verdict-badge');
    const desc = document.getElementById('eis-verdict-desc');
    const vetoBadge = document.getElementById('eis-vetoed-badge');
    const uncertaintyContainer = document.getElementById('eis-uncertainty-container');
    const sourceBadge = document.getElementById('eis-source-badge');
    const verdictState = buildVerdictDisplayState({
        result,
        lastUncertainty: _lastUncertainty,
        getVerdictClass,
        getVerdictObject,
        renderUncertaintyBadge,
    });
    if (badge) {
        badge.textContent = verdictState.badgeText;
        badge.className = verdictState.badgeClassName;
    }
    if (desc) {
        desc.textContent = verdictState.descText;
    }
    if (sourceBadge) {
        sourceBadge.className = verdictState.sourceBadgeClassName;
        sourceBadge.textContent = verdictState.sourceBadgeText;
    }
    if (vetoBadge) {
        vetoBadge.classList.toggle('visible', verdictState.vetoVisible);
    }
    if (uncertaintyContainer) {
        uncertaintyContainer.innerHTML = verdictState.uncertaintyHtml;
        if (verdictState.uncertaintyHtml) {
            wireUncertaintyBadge('eis-uncertainty');
        }
    }
    // Mount the universal feedback widget on the last NN output (EIS card).
    // The EIS score IS the last NN output per F4.5 Outcome Reporter - this
    // is where the user's "this model is good / bad" signal is captured for
    // F4.6 RLHF calibration. Fire-and-forget dynamic import because
    // updateVerdict is sync; we don't await. Idempotent: mountFeedbackBar
    // replaces prior content on each render so multiple EIS recomputes
    // don't stack widgets.
    import('../ui/components/likeDislikeBar.js' as string)
        .then((mod: any) => mod.mountFeedbackBar('feedback-mount-eis-modal', 'eis-modal', { variant: 'default' }))
        .catch((e: any) => console.debug('[eis:feedback-mount]', e?.message || e));
}
/**
 * Update the credential info display (read-only, computed from data).
 * Renderiza o multiplicador agregado, contagem e breakdown por nível.
 * @param {{ multiplier: number, count: number, breakdown: Object }|null} credInfo
 */
function updateCredentialInfo( credInfo: any) {
    const container = document.getElementById('eis-credential-info');
    if (!container)
        return;
    if (!credInfo || credInfo.count === 0) {
        container.innerHTML = `
            <span class="eis-cred-mult">1.00Ã—</span>
            <span class="eis-cred-count">${t('eis.credential_none') || 'No readings'}</span>
        `;
        return;
    }
    // Monta string de breakdown por nível
    const parts = [];
    for (const [level, count] of Object.entries(credInfo.breakdown)) {
        const label = EIS_CREDENTIAL_LABELS[level] || level;
        parts.push(`${count} ${label}`);
    }
    container.innerHTML = `
        <span class="eis-cred-mult">${credInfo.multiplier.toFixed(2)}Ã—</span>
        <span class="eis-cred-count">${credInfo.count} ${t('eis.readings') || 'readings'}</span>
        <span class="eis-cred-breakdown">${parts.join(' · ')}</span>
    `;
}
// ================================================================
// PRIVATE - STANDARD SLIDERS (AUTO/MANUAL TOGGLE)
// Renderiza sliders com toggle por eixo
// ================================================================
/**
 * Renderiza os sliders padrão com botão toggle AUTO/MANUAL por eixo.
 * Substitui o conteúdo do container de sliders.
 */
function _buildSliderRowHtml(axis: string, meta: any, weight: number, hasAuto: boolean, isAuto: boolean) {
    const label = t(meta.key) || meta.fallback;
    const autoButton = hasAuto
        ? `<button class="eis-auto-toggle ${isAuto ? 'active' : ''}" data-cc-call-click="handleEisAutoToggle|s:${encodeURIComponent(`${axis}`)}" title="${isAuto ? t('eis.switch_manual') || 'Switch to Manual' : t('eis.switch_auto') || 'Switch to Auto'}">${isAuto ? 'AUTO' : 'MANUAL'}</button>`
        : '<span class="eis-auto-toggle disabled">MANUAL</span>';
    return `
        <div class="eis-slider-row" data-axis="${axis}">
            <div class="eis-slider-header">
                <span class="eis-slider-label">${axis} — ${label}</span>
                <span class="eis-slider-weight">${t('eis.weight') || 'w'}=${weight}</span>
                ${autoButton}
            </div>
            <div class="eis-slider-control">
                <input data-field-meta="true" data-field-meta-key="auto-tpl:eis:input:L1469" type="range" id="eis-slider-${axis}" min="1" max="5" step="1" value="3"
                    class="eis-slider" ${isAuto ? 'disabled' : ''}
                    data-cc-call-input="handleEisSliderInput|s:${encodeURIComponent(`${axis}`)}">
                <span class="eis-slider-value" id="eis-value-${axis}">3</span>
            </div>
        </div>`;
}

function _applyAutoBadgesToSliders() {
    for (const axis of EIS_AXES) {
        if ((autoEnabled as any)[axis] && (cachedAutoResults as any)[axis]) {
            applyAutoBadge(axis, (cachedAutoResults as any)[axis]);
        }
    }
}

function _renderStandardSliders() {
    const container = document.getElementById('eis-sliders-container');
    if (!container) return;
    let html = '';
    for (const axis of EIS_AXES) {
        const meta = AXIS_META[axis];
        const weight = EIS_DEFAULT_WEIGHTS[axis];
        const hasAuto = (cachedAutoResults as any)[axis] != null;
        const isAuto = (autoEnabled as any)[axis] && hasAuto;
        html += _buildSliderRowHtml(axis, meta, weight, hasAuto, isAuto);
    }
    container.innerHTML = html;
    _applyAutoBadgesToSliders();
}
/**
 * Toggle AUTO/MANUAL para um eixo.
 * @param {string} axis
 */
function handleEisAutoToggle( axis: any) {
    if (!(cachedAutoResults as any)[axis])
        return;
    (autoEnabled as any)[axis] = !(autoEnabled as any)[axis];
    _manualAxisOverrides[axis] = !(autoEnabled as any)[axis];
    const btn = document.querySelector(`.eis-slider-row[data-axis="${axis}"] .eis-auto-toggle`);
    if (btn) {
        btn.classList.toggle('active', (autoEnabled as any)[axis]);
        btn.textContent = (autoEnabled as any)[axis] ? 'AUTO' : 'MANUAL';
        (btn as HTMLElement).title = (autoEnabled as any)[axis]
            ? t('eis.switch_manual') || 'Switch to Manual'
            : t('eis.switch_auto') || 'Switch to Auto';
    }
    recalculate();
    updateEisStatusBadge();
}
// ================================================================
// PRIVATE - CUSTOM MODE UI
// Perfis custom, editor de eixos, sliders dinâmicos
// ================================================================
function _newIsoNow() {
    return newIsoNow();
}
function _getCurrentUserLabel() {
    return getCurrentUserLabel(window?.currentUser);
}
function _defaultVerdictBands() {
    return defaultVerdictBands(EIS_VERDICTS);
}
function _createCustomProfile({ id, name, basedOn = 'default', axes = [] }: any) {
    return createCustomProfile({
        id,
        name,
        basedOn,
        axes,
        actor: _getCurrentUserLabel(),
        nowIso: _newIsoNow(),
        verdictBands: _defaultVerdictBands(),
    });
}
function _pushCustomAudit( profile: any, action: any, details: any = '') {
    pushCustomAudit(profile, action, details, { actor: _getCurrentUserLabel(), nowIso: _newIsoNow() });
}
function _buildDefaultAxesForCustomProfile() {
    return buildDefaultAxesForCustomProfile({
        axes: EIS_EXTENDED_AXES,
        axisMeta: AXIS_META,
        translate: t,
        defaultWeights: EIS_DEFAULT_WEIGHTS,
        extendedDefaultWeights: EIS_EXTENDED_DEFAULT_WEIGHTS,
        canonicalFormulaRefForAxis: _canonicalFormulaRefForAxis,
        canonicalAxes: EIS_AXES,
    });
}
function _markCustomDirty( action: any, details: any = '') {
    markCustomDirty(activeCustomProfile, action, details, { actor: _getCurrentUserLabel(), nowIso: _newIsoNow() });
}
function _getCurrentBaselineForCompare() {
    const scoped = _getActiveParallelIndicators();
    if (scoped && Number.isFinite(scoped.baseScore)) {
        return Number(scoped.baseScore);
    }
    const modelResult = computeSimplifiedEIS(getAllElements(), getAllCampaigns());
    return Number(modelResult?.baseScore || modelResult?.eis || 0);
}
function _getCustomVerdictFromBands( score: any, bands: any) {
    return getCustomVerdictFromBands(score, bands);
}
function _validatePublishProfile( profile: any) {
    return validatePublishProfile(profile, {
        canonicalAxes: EIS_AXES,
        normalizeAxisFormulaRef: _normalizeAxisFormulaRef,
        validateAxisFormulaSelection: _validateAxisFormulaSelection,
    });
}
function _buildPublishGuardIssues( profile: any) {
    return buildPublishGuardIssues(profile, {
        canonicalAxes: EIS_AXES,
        normalizeAxisFormulaRef: _normalizeAxisFormulaRef,
        validateAxisFormulaSelection: _validateAxisFormulaSelection,
    });
}
async function _apiFetchTemplates() {
    return fetchTemplateRows({
        apiUrl: EIS_TEMPLATES_API,
        currentUserLabel: _getCurrentUserLabel(),
        fetchImpl: fetch,
    });
}
async function _apiCreateTemplate( profile: any) {
    return createCustomTemplate(profile, {
        apiUrl: EIS_TEMPLATES_API,
        currentUserLabel: _getCurrentUserLabel(),
        fetchImpl: fetch,
    });
}
async function _apiUpdateTemplate( profile: any) {
    return updateCustomTemplate(profile, {
        apiUrl: EIS_TEMPLATES_API,
        currentUserLabel: _getCurrentUserLabel(),
        fetchImpl: fetch,
    });
}
async function _apiPublishTemplate( profile: any) {
    return publishCustomTemplate(profile, {
        apiUrl: EIS_TEMPLATES_API,
        currentUserLabel: _getCurrentUserLabel(),
        fetchImpl: fetch,
    });
}
/**
 * Carrega perfis custom do localStorage.
 */
function loadCustomProfiles() {
    try {
        const raw = localStorage.getItem(CUSTOM_PROFILES_KEY) || '';
        const parsed = raw ? JSON.parse(raw) : [];
        customProfiles = normalizeStoredCustomProfiles(parsed, {
            defaultVerdictBands: _defaultVerdictBands,
        });
    }
    catch {
        customProfiles = [];
    }
    // Best effort API sync (does not block modal rendering).
    _apiFetchTemplates()
        .then((rows: any) => {
        if (!rows || rows.length === 0)
            return;
        const mapped = mapApiTemplateRowsToProfiles(rows, {
            currentUserLabel: _getCurrentUserLabel(),
            defaultVerdictBands: _defaultVerdictBands,
        });
        // API is source of truth when available.
        customProfiles = mapped;
        safeSetItem(CUSTOM_PROFILES_KEY, JSON.stringify(customProfiles));
        if (currentMode === 'custom') {
            renderCustomModeUI();
            recalculate();
        }
    })
        .catch((_e: any) => console.debug('[utils/handlers/eis:silent-catch]', _e?.message || _e));
}
/**
 * Salva perfis custom no localStorage.
 */
function saveCustomProfiles() {
    safeSetItem(CUSTOM_PROFILES_KEY, JSON.stringify(customProfiles));
}
/**
 * Renderiza a UI completa do modo custom.
 */
function renderCustomModeUI() {
    const section = document.getElementById('eis-custom-section');
    if (!section)
        return;
    section.innerHTML = buildCustomModeSectionHtml({
        templates: EIS_CUSTOM_TEMPLATES,
        customProfiles,
        activeProfileId: activeCustomProfile?.id || '',
        translate: t,
        escapeHtml,
    });
    if (activeCustomProfile)
        renderCustomEditor();
}
/**
 * Renderiza o editor de eixos do perfil custom ativo.
 */
function renderCustomEditor() {
    const editor = document.getElementById('eis-custom-editor');
    if (!editor)
        return;
    editor.innerHTML = buildCustomEditorHtml({
        activeProfile: activeCustomProfile,
        translate: t,
        escapeHtml,
        buildPublishGuardIssues: _buildPublishGuardIssues,
        getFormulaUiState: (axisId: any, rawFormulaRef: any) => {
            const options = _formulaOptionsForAxis(axisId);
            const selectedFormula = _normalizeAxisFormulaRef(axisId, rawFormulaRef || '');
            if (selectedFormula && !options.some((option: any) => option.id === selectedFormula)) {
                options.unshift({ id: selectedFormula, label: `${selectedFormula} (legacy)` });
            }
            const bounds = getEisFormula(selectedFormula)?.paramsBounds || {};
            const boundsSummary = Object.keys(bounds).length
                ? Object.entries(bounds)
                    .map(([key, value]: any) => `${key}:${Number(value?.min)}..${Number(value?.max)}`)
                    .join(' | ')
                : 'n/a';
            return { options, selectedFormula, boundsSummary };
        },
    });
    _renderCustomComparePanel();
}
/**
 * Seleciona um perfil custom pelo ID.
 * @param {string} profileId
 */
function handleEisCustomProfileSelect( profileId: any) {
    selectCustomProfile(profileId, {
        state: customBuilderState,
        templates: EIS_CUSTOM_TEMPLATES,
        renderCustomEditor,
        recalculate,
    });
}
/**
 * Cria novo perfil custom vazio com 10 eixos default.
 */
function handleEisCustomNewProfile() {
    createBlankCustomProfile({
        state: customBuilderState,
        createProfile: _createCustomProfile,
        buildDefaultAxes: _buildDefaultAxesForCustomProfile,
        saveCustomProfiles,
        renderCustomModeUI,
        recalculate,
        translate: t,
    });
}
/**
 * Cria perfil custom copiando o EIS padrão estendido (10 eixos).
 */
function handleEisCustomCopyDefaultProfile() {
    copyDefaultCustomProfile({
        state: customBuilderState,
        createProfile: _createCustomProfile,
        buildDefaultAxes: _buildDefaultAxesForCustomProfile,
        saveCustomProfiles,
        renderCustomModeUI,
        recalculate,
        translate: t,
    });
}
/**
 * Duplica o perfil ativo como novo perfil editável.
 */
function handleEisCustomDuplicateProfile() {
    duplicateCustomProfile({
        state: customBuilderState,
        pushAudit: _pushCustomAudit,
        saveCustomProfiles,
        renderCustomModeUI,
        recalculate,
        nowIso: _newIsoNow,
    });
}
function handleEisCustomEditSelectedTemplate() {
    editSelectedCustomTemplate({
        state: customBuilderState,
        pushAudit: _pushCustomAudit,
        saveCustomProfiles,
        renderCustomModeUI,
        recalculate,
        nowIso: _newIsoNow,
    });
}
/**
 * Deleta o perfil custom ativo (não permite deletar templates).
 */
function handleEisCustomDeleteProfile() {
    deleteCustomProfile({
        state: customBuilderState,
        saveCustomProfiles,
        renderCustomModeUI,
        recalculate,
        apiDelete: (apiId: any) => fetch(`${EIS_TEMPLATES_API}/${encodeURIComponent(apiId)}`, {
            method: 'DELETE',
            credentials: 'same-origin',
        }),
    });
}
function handleEisCustomVetoToggle( enabled: any) {
    setCustomVetoEnabled({
        state: customBuilderState,
        enabled,
        markDirty: _markCustomDirty,
        renderCustomEditor,
        recalculate,
    });
}
function handleEisCustomVetoMin( value: any) {
    setCustomVetoMin({
        state: customBuilderState,
        value,
        markDirty: _markCustomDirty,
        renderCustomEditor,
        recalculate,
    });
}
function handleEisCustomBandsEdit( kind: any, value: any) {
    setCustomBands({
        state: customBuilderState,
        kind,
        value,
        defaultVerdictBands: _defaultVerdictBands,
        markDirty: _markCustomDirty,
        renderCustomEditor,
        recalculate,
    });
}
function handleEisCustomPublishProfile() {
    return publishCustomProfile({
        state: customBuilderState,
        validatePublishProfile: _validatePublishProfile,
        translate: t,
        showToast,
        nowIso: _newIsoNow,
        pushAudit: _pushCustomAudit,
        trackEvent: _trackEisUxEvent,
        saveProfile: handleEisCustomSaveProfile,
        apiPublishTemplate: _apiPublishTemplate,
        saveCustomProfiles,
        renderCustomModeUI,
    });
}
function handleEisCustomCompareWithBaseline() {
    compareCustomWithBaseline({ renderComparePanel: _renderCustomComparePanel });
}
function _renderCustomComparePanel( forceShow: any = false) {
    const panel = document.getElementById('eis-custom-compare-panel');
    if (!panel)
        return;
    panel.innerHTML = buildCustomComparePanelHtml({
        activeProfile: activeCustomProfile,
        currentMode,
        lastCustomResult: _lastCustomResult,
        baseline: _getCurrentBaselineForCompare(),
        escapeHtml,
        forceShow,
    });
}
/**
 * Renomeia o perfil custom ativo.
 * @param {string} name
 */
function handleEisCustomRenameProfile( name: any) {
    renameCustomProfile({
        state: customBuilderState,
        name,
        markDirty: _markCustomDirty,
        renderCustomEditor,
    });
}
/**
 * Edita uma propriedade de um eixo custom.
 * @param {number} index
 * @param {string} prop - 'name' ou 'weight'
 * @param {string} value
 */
function handleEisCustomAxisEdit( index: any, prop: any, value: any) {
    editCustomAxis({
        state: customBuilderState,
        index,
        prop,
        value,
        validateAxisFormulaSelection: _validateAxisFormulaSelection,
        showToast,
        markDirty: _markCustomDirty,
        renderCustomEditor,
        recalculate,
    });
}
/**
 * Adiciona novo eixo ao perfil custom ativo.
 */
function handleEisCustomAddAxis() {
    addCustomAxis({
        state: customBuilderState,
        translate: t,
        markDirty: _markCustomDirty,
        renderCustomEditor,
        recalculate,
        nowMs: () => Date.now(),
    });
}
/**
 * Remove um eixo do perfil custom (mín 2).
 * @param {number} index
 */
function handleEisCustomRemoveAxis( index: any) {
    removeCustomAxis({
        state: customBuilderState,
        index,
        markDirty: _markCustomDirty,
        renderCustomEditor,
        recalculate,
    });
}
/**
 * Handler de slider custom individual.
 * @param {number} axisIndex
 */
function handleEisFocusPublishIssue( axisIndex: any) {
    focusCustomPublishIssue(axisIndex);
}
function handleEisCustomSliderInput( axisId: any) {
    updateCustomSliderValue(axisId, {
        recalculate,
        updateStatusBadge: updateEisStatusBadge,
    });
}
/**
 * Salva perfil custom ativo no localStorage.
 */
function handleEisCustomSaveProfile() {
    saveCustomProfile({
        state: customBuilderState,
        defaultVerdictBands: _defaultVerdictBands,
        nowIso: _newIsoNow,
        pushAudit: _pushCustomAudit,
        saveCustomProfiles,
        trackEvent: _trackEisUxEvent,
        renderComparePanel: _renderCustomComparePanel,
        renderCustomEditor,
        apiCreateTemplate: _apiCreateTemplate,
        apiUpdateTemplate: _apiUpdateTemplate,
    });
}
/**
 * Atualiza radar Chart.js para eixos custom (recria labels).
 * @param {Object} result - Resultado de calculateCustom()
 */
function _updateRadarChartCustom( result: any) {
    if (!radarChart)
        return;
    const axes = activeCustomProfile?.axes || [];
    const labels = axes.map((ax: any) => ax.name);
    const data = axes.map((ax: any) => result.scores[ax.id] || 3);
    radarChart.data.labels = labels;
    radarChart.data.datasets[0].data = data;
    const color = getVerdictColor(result.eis);
    radarChart.data.datasets[0].borderColor = color;
    radarChart.data.datasets[0].backgroundColor = color.replace(')', ', 0.12)').replace('rgb', 'rgba');
    radarChart.data.datasets[0].pointBackgroundColor = color;
    radarChart.update('none');
}
// ================================================================
// PRIVATE - RADAR CHART (Chart.js)
// Gráfico radar com os 6 eixos 3CTA+
// ================================================================
/**
 * Initialize the Chart.js radar chart.
 * Cria o gráfico radar se Chart.js estiver disponível.
 */
function _initRadarChart() {
    const ChartCtor = (globalThis as any).Chart;
    if (typeof ChartCtor === 'undefined') {
        log.warn('Chart.js not loaded — radar chart disabled');
        return;
    }
    destroyRadarChart();
    const canvas = document.getElementById('eis-radar-canvas');
    if (!canvas)
        return;
    const ctx = (canvas as HTMLCanvasElement).getContext('2d');
    radarChart = new ChartCtor(ctx, {
        type: 'radar',
        data: {
            labels: EIS_AXES.map((a: any) => a),
            datasets: [
                {
                    label: 'EIS',
                    data: EIS_AXES.map(() => 3),
                    backgroundColor: 'rgba(99, 102, 241, 0.15)',
                    borderColor: 'rgba(99, 102, 241, 0.7)',
                    borderWidth: 2,
                    pointBackgroundColor: '#6366f1',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
            },
            scales: {
                r: {
                    min: 0,
                    max: 5,
                    ticks: {
                        stepSize: 1,
                        color: 'rgba(255,255,255,0.35)',
                        backdropColor: 'transparent',
                        font: { size: 10 },
                    },
                    grid: {
                        color: 'rgba(255,255,255,0.06)',
                    },
                    angleLines: {
                        color: 'rgba(255,255,255,0.08)',
                    },
                    pointLabels: {
                        color: 'rgba(255,255,255,0.7)',
                        font: { size: 12, weight: '600' },
                    },
                },
            },
            animation: {
                duration: 400,
            },
        },
    });
}
/**
 * Update radar chart data with new scores.
 * Atualiza os dados do radar e muda a cor conforme o veredito.
 * @param {Object.<string, number>} adjustedScores
 */
function _updateRadarChart( adjustedScores: any) {
    if (!radarChart)
        return;
    const data = EIS_AXES.map((axis: any) => adjustedScores[axis]);
    radarChart.data.datasets[0].data = data;
    const avg = data.reduce((s: any, v: any) => s + v, 0) / data.length;
    const color = getVerdictColor(avg);
    radarChart.data.datasets[0].borderColor = color;
    radarChart.data.datasets[0].backgroundColor = color.replace(')', ', 0.12)').replace('rgb', 'rgba');
    radarChart.data.datasets[0].pointBackgroundColor = color;
    radarChart.update('none');
}
/**
 * Destroy the radar chart instance.
 * Limpa a instância para evitar memory leaks.
 */
function destroyRadarChart() {
    if (radarChart) {
        radarChart.destroy();
        radarChart = null;
    }
}
/**
 * Inicializa listeners de interação no canvas do ring chart.
 * Chamado uma vez em handleOpenEisDashboard.
 */
function initRingInteraction() {
    const canvas = document.getElementById('eis-ring-canvas');
    if (!canvas || _ringListenersAttached)
        return;
    canvas.style.cursor = 'pointer';
    canvas.addEventListener('mousemove', _onRingMouseMove);
    canvas.addEventListener('mouseleave', _onRingMouseLeave);
    canvas.addEventListener('click', _onRingClick);
    _ringListenersAttached = true;
    // Expose for improvement list onclick
    window._eisExpandAxis = (axis: any) => {
        _expandedAxis = toggleExpandedAxis(_expandedAxis, axis);
        renderAxisDetail(_expandedAxis);
    };
    // Expose for inline slider bars
    window._eisBarSliderInput = (axis: any, value: any) => {
        const v = parseInt(value, 10);
        if ((autoEnabled as any)[axis])
            return;
        _manualAxisValues[axis] = v;
        _manualAxisOverrides[axis] = true;
        // Update hidden standard slider if it exists
        const stdSlider = document.getElementById(`eis-slider-${axis}`);
        if (stdSlider)
            stdSlider.value = v;
        recalculate();
        updateEisStatusBadge();
    };
    window._eisBarDragStart = () => {
        _barsSliderDragging = true;
    };
    window._eisBarDragEnd = () => {
        _barsSliderDragging = false;
        recalculate();
    };
    window._eisBarAutoToggle = (axis: any) => {
        handleEisAutoToggle(axis);
        _barsSliderDragging = false; // Force full rebuild
        recalculate();
    };
    // Drill-down actions: navigate to problematic elements
    window._eisGoToElement = (elementId: any) => {
        if (!elementId)
            return;
        // 1. Select element (highlights 3D mesh, updates UI)
        if (typeof window.handleSelectElement === 'function') {
            window.handleSelectElement(elementId);
        }
        // 2. Zoom camera to element
        if (typeof window.handleZoomToElement === 'function') {
            window.handleZoomToElement(elementId);
        }
        // 3. Ensure right panel is visible + switch to elements tab
        if (typeof window.restorePanel === 'function') {
            (window.restorePanel as any)('properties', 'elements');
        }
    };
    window._eisOpenDataEntry = (campaignId: any, elementId: any) => {
        if (typeof window.handleOpenDataEntryMatrix === 'function') {
            (window.handleOpenDataEntryMatrix as any)({ campaignId, elementId });
        }
    };
}
function _onRingMouseMove( e: any) {
    const canvas = e.target;
    const { x: mx, y: my } = getCanvasPointerPosition(canvas, e);
    const hit = hitTestRingSegment(ringSegments, mx, my);
    const tooltip = document.getElementById('eis-ring-tooltip');
    if (!tooltip)
        return;
    if (hit) {
        const axis = hit.axis;
        if (_ringHoverAxis !== axis) {
            _ringHoverAxis = axis;
            const autoResult = (cachedAutoResults as any)[axis];
            const tooltipModel = buildRingTooltipModel({
                axis,
                axisMeta: AXIS_META,
                translate: t,
                adjustedScores: _lastResult?.adjustedScores || {},
                fallbackScores: _lastScores || {},
                weights: calculator.weights,
                autoResult,
                isAuto: !!((autoEnabled as any)[axis] && autoResult),
                buildAutoTooltip,
                scoreToColor,
            });
            tooltip.innerHTML = buildRingTooltipHtml({
                ...tooltipModel,
                escapeHtml,
            });
        }
        tooltip.style.display = 'block';
        tooltip.style.left = e.clientX + 14 + 'px';
        tooltip.style.top = e.clientY - 10 + 'px';
    }
    else {
        _ringHoverAxis = null;
        tooltip.style.display = 'none';
    }
}
function _onRingMouseLeave() {
    _ringHoverAxis = null;
    const tooltip = document.getElementById('eis-ring-tooltip');
    if (tooltip)
        tooltip.style.display = 'none';
}
function _onRingClick( e: any) {
    const canvas = e.target;
    const { x: mx, y: my } = getCanvasPointerPosition(canvas, e);
    const hit = hitTestRingSegment(ringSegments, mx, my);
    if (hit) {
        _expandedAxis = toggleExpandedAxis(_expandedAxis, hit.axis);
        renderAxisDetail(_expandedAxis);
    }
}
/**
 * Cleanup ring interaction listeners.
 * Chamado em handleCloseEisDashboard.
 */
function cleanupRingInteraction() {
    const canvas = document.getElementById('eis-ring-canvas');
    if (canvas) {
        canvas.removeEventListener('mousemove', _onRingMouseMove);
        canvas.removeEventListener('mouseleave', _onRingMouseLeave);
        canvas.removeEventListener('click', _onRingClick);
    }
    _ringListenersAttached = false;
    _ringHoverAxis = null;
    _expandedAxis = null;
}
// ================================================================
// PRIVATE - F2: AXIS DETAIL CARD
// Card expandível com breakdown do eixo (sub-componentes + what-if)
// ================================================================
/**
 * Render axis detail card. Se axis===null, limpa o container.
 * @param {string|null} sourceKind
 */
function _axisDetailSourceHtml(sourceKind: any, sourceText: any) {
    if (sourceKind === 'auto')
        return `<span style="color:var(--eis-accent)">${t('eis.source_auto') || 'AUTO'}</span>: ${escapeHtml(sourceText)}`;
    return escapeHtml(sourceText);
}

function _axisDetailWhatIfHtml(whatIf: any) {
    if (!whatIf) return '';
    return `
        <div class="eis-axis-detail-whatif">
            ${t('eis.what_if') || 'If improved to'} <b>${whatIf.targetScore.toFixed(1)}</b>
            &#8594; ${t('eis.eis_changes') || 'EIS changes to'} <b>${whatIf.projectedEIS.toFixed(2)}</b>
            (<span class="delta">+${whatIf.delta.toFixed(2)}</span>)
        </div>`;
}

function _axisDetailProblemsHtml(detailState: any, axis: any) {
    if (detailState.fixCount > 0) {
        return buildAxisProblemsHtml({
            problems: detailState.problems,
            fixCount: detailState.fixCount,
            axis,
            translate: t,
            escapeHtml,
        });
    }
    if (detailState.showAutoHint) {
        return `<div class="eis-problems-hint">${t('eis.set_auto_hint') || 'Set axis to AUTO to see data issues'}</div>`;
    }
    return '';
}

function renderAxisDetail(axis: any) {
    const container = document.getElementById('eis-axis-detail');
    if (!container) return;
    const autoResult = axis ? (cachedAutoResults as any)[axis] : null;
    const detailState = buildAxisDetailViewModel({
        axis,
        currentMode,
        axisMeta: AXIS_META,
        translate: t,
        adjustedScores: _lastResult?.adjustedScores || {},
        fallbackScores: _lastScores || {},
        weights: calculator.weights,
        autoResult,
        isAuto: !!(axis && (autoEnabled as any)[axis] && autoResult),
        scoreToColor,
        lastScores: _lastScores,
        credMultiplier: cachedCredInfo ? cachedCredInfo.multiplier : 1.0,
        computeImpactIfImproved: EisCalculator.computeImpactIfImproved,
        cachedAllObs,
        elements: getAllElements(),
        campaignDetails: cachedCampaignDetails,
        units: UNITS,
        parameters: CONFIG.PARAMETERS,
        collectAxisProblems: EisCalculator.collectAxisProblems,
        buildAutoTooltip,
    });
    if (detailState.clear) {
        container.innerHTML = '';
        return;
    }
    const sourceHTML = _axisDetailSourceHtml(detailState.sourceKind, detailState.sourceText);
    const barsHTML = detailState.bars.length
        ? buildAxisDetailBarsHtml({ bars: detailState.bars, scoreToColor, escapeHtml })
        : '';
    const whatIfHTML = _axisDetailWhatIfHtml(detailState.whatIf);
    const problemsHTML = _axisDetailProblemsHtml(detailState, axis);
    container.innerHTML = buildAxisDetailCardHtml({
        axis,
        label: detailState.label,
        score: detailState.score,
        scoreColor: detailState.scoreColor,
        desc: detailState.desc,
        sourceHtml: sourceHTML,
        barsHtml: barsHTML,
        whatIfHtml: whatIfHTML,
        problemsHtml: problemsHTML,
        escapeHtml,
    });
}
// ================================================================
// PRIVATE - F3: IMPROVEMENT PRIORITY LIST
// Top 3 actions ranked by impact on EIS
// ================================================================
/**
 * Render ranked improvement list showing top 3 most impactful actions.
/**
 * Render ranked improvement list showing top 3 most impactful actions.
 * @param {Object.<string, number>} scores
 * @param {Object.<string, number>} weights
 * @param {number} credMult
 * @param {string[]|null} axisOrder
 */
function renderImprovementList( scores: any, weights: any, credMult: any, axisOrder: any = null) {
    const container = document.getElementById('eis-improve-list');
    if (!container)
        return;
    if (currentMode === 'custom') {
        container.innerHTML = '';
        return;
    }
    const axes = axisOrder || Object.keys(scores);
    const impacts = [];
    for (const axis of axes) {
        const score = scores[axis] || 3;
        if (score >= 5)
            continue;
        const impact = EisCalculator.computeImpactIfImproved(scores, weights, axis, credMult, currentMode as any);
        if (impact.delta > 0) {
            impacts.push(impact);
        }
    }
    impacts.sort((a: any, b: any) => b.delta - a.delta);
    const top3 = impacts.slice(0, 3);
    if (top3.length === 0) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = buildImprovementListHtml({
        improvements: top3.map((impact: any) => {
            const meta = (AXIS_META as any)[impact.axis];
            return {
                ...impact,
                label: meta ? t(meta.key) || meta.fallback : impact.axis,
                hint: t(`eis.improve_${impact.axis}`) || '',
            };
        }),
        translate: t,
        escapeHtml,
    });
}
function _drawRingSegment(ctx: any, segment: any, centerX: number, centerY: number, innerRadius: number, outerRadius: number) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, outerRadius, segment.startAngle, segment.endAngle);
    ctx.arc(centerX, centerY, innerRadius, segment.endAngle, segment.startAngle, true);
    ctx.closePath();
    ctx.fillStyle = segment.fillColor;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(centerX, centerY, innerRadius + 2, segment.startAngle, segment.endAngle);
    ctx.strokeStyle = segment.verdictColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    for (const tick of segment.thresholdTicks) {
        ctx.beginPath();
        ctx.moveTo(tick.x1, tick.y1);
        ctx.lineTo(tick.x2, tick.y2);
        ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = 'bold 10px "JetBrains Mono", Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(segment.axis, segment.labelPoint.x, segment.labelPoint.y);
    if (segment.scoreLabel) {
        ctx.font = 'bold 12px "JetBrains Mono", Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillText(segment.scoreLabel.text, segment.scoreLabel.x + 1, segment.scoreLabel.y + 1);
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.fillText(segment.scoreLabel.text, segment.scoreLabel.x, segment.scoreLabel.y);
    }
}

function _drawRadarOverlay(ctx: any, radarGridRings: any[], radarPolygon: any[], centerColor: string) {
    if (radarGridRings.length === 0 || radarPolygon.length === 0) return;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 0.5;
    for (const ringPoints of radarGridRings) {
        ctx.beginPath();
        for (let index = 0; index <= ringPoints.length; index++) {
            const point = ringPoints[index % ringPoints.length];
            if (!point) continue;
            index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y);
        }
        ctx.closePath();
        ctx.stroke();
    }
    ctx.beginPath();
    for (let index = 0; index < radarPolygon.length; index++) {
        const point = radarPolygon[index];
        if (!point) continue;
        index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y);
    }
    ctx.closePath();
    ctx.fillStyle = centerColor.replace('rgb', 'rgba').replace(')', ',0.12)');
    ctx.fill();
    ctx.strokeStyle = centerColor;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.4;
    ctx.stroke();
    ctx.globalAlpha = 1;
}

function renderRingChart(eisScore: any, scores: any, weights: any, verdictLabel: any, vetoed: any, axisOrder: any = null) {
    const canvas = document.getElementById('eis-ring-canvas');
    if (!canvas) return;
    const { ctx, W, H } = setupHiDPI(canvas as any);
    ctx.clearRect(0, 0, W, H);
    const chartLayout = computeRingChartLayout({
        width: W,
        height: H,
        scores,
        weights,
        axisOrder,
        eisScore,
        verdictLabel,
        vetoed,
        scoreToColor,
        getVerdictColor,
    });
    if (!chartLayout.hasData) return;
    const PI2 = Math.PI * 2;
    const { centerX, centerY, innerRadius, outerRadius, referenceRadius, centerRadius, centerColor, cleanedVerdict, centerScoreText, ariaLabel, radarGridRings, radarPolygon, segments, interactiveSegments } = chartLayout as any;
    ringSegments = interactiveSegments;
    ctx.strokeStyle = 'rgba(5, 150, 105, 0.10)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(centerX, centerY, referenceRadius, 0, PI2);
    ctx.stroke();
    for (const segment of segments) {
        _drawRingSegment(ctx, segment, centerX, centerY, innerRadius, outerRadius);
    }
    ctx.beginPath();
    ctx.arc(centerX, centerY, centerRadius, 0, PI2);
    ctx.fillStyle = 'rgba(10, 12, 20, 0.95)';
    ctx.fill();
    ctx.strokeStyle = centerColor;
    ctx.lineWidth = 2;
    ctx.stroke();
    _drawRadarOverlay(ctx, radarGridRings, radarPolygon, centerColor);
    ctx.fillStyle = centerColor;
    ctx.font = 'bold 26px "JetBrains Mono", Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(centerScoreText, centerX, centerY - 6);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '10px "JetBrains Mono", Consolas, monospace';
    ctx.fillText(cleanedVerdict, centerX, centerY + 10);
    if (vetoed) {
        ctx.fillStyle = 'rgba(239,68,68,0.9)';
        ctx.font = 'bold 9px "JetBrains Mono", Consolas, monospace';
        ctx.fillText(t('eis.vetoed_label') || 'VETOED', centerX, centerY + 22);
    }
    canvas.setAttribute('aria-label', ariaLabel);
}
function _renderScaleStrip( eisScore: any) {
    const container = document.getElementById('eis-scale-strip');
    if (!container)
        return;
    const scaleStripState = computeScaleStripState({
        eisScore,
        markerColor: scoreToColor(eisScore),
        managementReadyMin: EIS_VERDICTS.MANAGEMENT_READY.min,
        auditReadyMin: EIS_VERDICTS.AUDIT_READY.min,
    });
    if (!scaleStripState.visible) {
        container.style.display = 'none';
        return;
    }
    container.style.display = '';
    // Fast path: update marker only after first render
    if (_scaleStripInitialized && _scaleStripMarker && _scaleStripValue) {
        _scaleStripMarker.style.left = scaleStripState.leftPct + '%';
        _scaleStripMarker.style.color = scaleStripState.markerColor;
        _scaleStripValue.textContent = scaleStripState.valueText;
        _scaleStripValue.style.color = scaleStripState.markerColor;
        return;
    }
    container.innerHTML = buildScaleStripHtml(scaleStripState);
    _scaleStripMarker = container.querySelector('.eis-scale-marker');
    _scaleStripValue = container.querySelector('.eis-scale-marker-value');
    _scaleStripInitialized = true;
}
// ================================================================
// PRIVATE - CONTRIBUTION BARS
// Barras horizontais individuais por eixo (score + peso visual)
// ================================================================
/**
 * Render horizontal bars per axis showing individual score with row height proportional to weight.
 * Honesto: mostra score real por eixo sem fabricar soma linear de um cálculo geométrico.
 * @param {Object.<string, number>} scores - Scores ajustados por eixo
 * @param {Object.<string, number>} weights - Pesos por eixo
 * @param {string[]|null} axisOrder - Ordem. Se null, usa Object.keys(scores)
 */
/** Flag to prevent innerHTML rebuild during slider drag */
let _barsSliderDragging = false;
/**
 * Render contribution bars with inline sliders and visual status indicators.
 * Sliders are embedded - no separate slider section needed.
 * During drag, uses update-in-place to avoid losing slider focus.
 */
function renderContributionBars( scores: any, weights: any, axisOrder: any = null) {
    const container = document.getElementById('eis-contribution-bars');
    if (!container)
        return;
    const axes = axisOrder || Object.keys(scores);
    if (axes.length === 0) {
        container.innerHTML = '';
        return;
    }
    // Update-in-place during drag (don't rebuild innerHTML)
    if (_barsSliderDragging) {
        for (const axis of axes) {
            const score = scores[axis] || 0;
            const fillEl = container.querySelector(`.eis-contrib-fill[data-axis="${axis}"]`);
            const scoreEl = container.querySelector(`.eis-contrib-score[data-axis="${axis}"]`);
            const rowEl = container.querySelector(`.eis-contrib-row[data-axis="${axis}"]`);
            if (fillEl) {
                fillEl.style.width = Math.min(100, Math.max(0, (score / 5) * 100)) + '%';
                fillEl.style.background = scoreToColor(score);
            }
            if (scoreEl) {
                scoreEl.textContent = score.toFixed(1);
                scoreEl.style.color = scoreToColor(score);
            }
            if (rowEl) {
                rowEl.className =
                    'eis-contrib-row' + (score < 3 ? ' eis-contrib-warn' : score >= 4 ? ' eis-contrib-good' : '');
            }
        }
        return;
    }
    container.innerHTML = buildContributionBarsHtml({
        axes,
        scores,
        weights,
        autoResults: cachedAutoResults,
        autoEnabled,
        scoreToColor,
    });
}
// Utilitários de cor e classificação do veredito
// ================================================================
/**
 * Get CSS color for a given EIS score.
 * @param {number} eis
 * @returns {string} CSS color string
 */
function getVerdictColor( eis: any) {
    if (eis >= 4.5)
        return 'rgb(34, 197, 94)';
    if (eis >= 3.5)
        return 'rgb(234, 179, 8)';
    return 'rgb(239, 68, 68)';
}
/**
 * Get CSS class name for verdict badge.
 * @param {number} eis
 * @returns {string}
 */
function getVerdictClass( eis: any) {
    if (eis >= 4.5)
        return 'green';
    if (eis >= 3.5)
        return 'yellow';
    return 'red';
}
/**
 * Get verdict object for a score.
 * @param {number} eis
 * @returns {Object|null}
 */
function getVerdictObject( eis: any) {
    if (eis >= 4.5)
        return EIS_VERDICTS.AUDIT_READY;
    if (eis >= 3.5)
        return EIS_VERDICTS.MANAGEMENT_READY;
    return EIS_VERDICTS.CRITICAL_DATA;
}
// ================================================================
// HUD MINI RADAR
// Mini radar hexagonal desenhado em canvas, visível no geo-hud
// ================================================================
/** Ãšltimos scores usados para o mini radar (default 3 para cada eixo) */
let _hudScores: any = ({ T: 3, A: 3, Cp: 3, Ty: 3, Cs: 3, Cm: 3 });
// HUD-CARDS-REDESIGN-001 F2 (Calvin 2026-06-10): trend arrow vs snapshot
// anterior — popula em cada paint.
let _lastEisScoreForTrend: number | null = null;
const _kappaForHud = 1.0; // confiança epistêmica (penalizada por dados antigos/cobertura baixa)
/**
 * Update the EIS HUD mini radar canvas.
 * Desenha hexagono radar com score central e cor do veredito.
 * Chamado pelo ciclo de render do HUD EIS apos mudancas no modelo.
 */
function _computeHudScores(isDashboardOpen: boolean, elements: any[], allObs: any[]) {
    const scores: any = {};
    if (isDashboardOpen) {
        for (const axis of EIS_AXES) {
            const autoResult = (cachedAutoResults as any)[axis];
            if ((autoEnabled as any)[axis] && autoResult) {
                scores[axis] = autoResult.score;
            } else {
                const slider = document.getElementById(`eis-slider-${axis}`);
                scores[axis] = slider ? parseInt((slider as any).value, 10) : (_manualAxisValues[axis] ?? 3);
                _manualAxisValues[axis] = scores[axis];
            }
        }
    } else {
        const campaigns = getAllCampaigns();
        const campaignStats = campaigns.map((c: any) => getCampaignCompleteness(c.id, elements));
        const cpAuto = EisCalculator.computeCpFromCampaigns(campaignStats);
        const tAuto = EisCalculator.computeTFromObservations(allObs, cachedRadarTransparency.data);
        const aAuto = EisCalculator.computeAFromModel(elements, allObs);
        const tyAuto = EisCalculator.computeTyFromObservations(allObs);
        const csAuto = EisCalculator.computeCsFromObservations(allObs, UNITS);
        const cmAuto = EisCalculator.computeCmFromObservations(allObs, CONFIG.PARAMETERS);
        scores.T = tAuto ? tAuto.score : _hudScores.T;
        scores.A = aAuto ? aAuto.score : _hudScores.A;
        scores.Cp = cpAuto ? cpAuto.score : _hudScores.Cp;
        scores.Ty = tyAuto ? tyAuto.score : _hudScores.Ty;
        scores.Cs = csAuto ? csAuto.score : _hudScores.Cs;
        scores.Cm = cmAuto ? cmAuto.score : _hudScores.Cm;
    }
    return scores;
}

function _computeHudEis(scores: any, isDashboardOpen: boolean, multiplier: number) {
    let eisScore = 3.0;
    let adjustedScores: any = scores;
    const effectiveMode = currentMode === 'custom' ? 'geometric' : currentMode;
    try {
        if (currentMode === 'custom' && isDashboardOpen && activeCustomProfile && activeCustomProfile.axes?.length >= 2) {
            const axisScores: Record<string, number> = {};
            const axisWeights: Record<string, number> = {};
            const enabledAxes = activeCustomProfile.axes.filter((ax: any) => ax?.enabled !== false);
            for (const ax of enabledAxes) {
                const slider = document.getElementById(`eis-custom-slider-${ax.id}`);
                axisScores[ax.id] = slider ? parseInt((slider as any).value, 10) : (_manualAxisValues[ax.id] ?? 3);
                _manualAxisValues[ax.id] = axisScores[ax.id];
                axisWeights[ax.id] = ax.weight;
            }
            if (enabledAxes.length >= 2) {
                const result = calculator.calculateCustom(axisScores, axisWeights);
                eisScore = result.eis;
                for (const axis of EIS_AXES) adjustedScores[axis] = eisScore;
            }
        } else {
            const result = calculator.calculate(scores as any, effectiveMode, 'common', multiplier);
            eisScore = result.eis;
            adjustedScores = result.adjustedScores;
        }
    } catch (err: any) {
        log.debug('EIS validation error ignored', err?.message);
    }
    return { eisScore, adjustedScores };
}

function _drawHudBackground(ctx: any, W: number, H: number, color: string) {
    ctx.fillStyle = 'rgba(15, 20, 30, 0.85)';
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 8);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(1, 1, W - 2, H - 2, 8);
    ctx.stroke();
}

function _drawHudPolygonAndDots(ctx: any, cx: number, cy: number, R: number, color: string, adjustedScores: any, axisAngles: number[]) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const axis = EIS_AXES[i] as string;
        const angle = axisAngles[i] ?? 0;
        const val = Math.min(adjustedScores[axis] || 3, 5);
        const r = (val / 5) * R;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = color.replace('rgb', 'rgba').replace(')', ', 0.18)');
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
        const axis = EIS_AXES[i] as string;
        const angle = axisAngles[i] ?? 0;
        const val = Math.min(adjustedScores[axis] || 3, 5);
        const r = (val / 5) * R;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
    }
}

function _drawHudAxisLabels(ctx: any, cx: number, cy: number, R: number, axisAngles: number[], availH: number) {
    ctx.font = 'bold 8px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 6; i++) {
        const lr = R + Math.max(8, R * 0.25);
        const angle = axisAngles[i] ?? 0;
        const axis = EIS_AXES[i] as string;
        const x = cx + lr * Math.cos(angle);
        const y = Math.max(6, Math.min(cy + lr * Math.sin(angle), availH - 4));
        ctx.fillText(axis, x, y);
    }
}

function _drawHudHexagon(ctx: any, cx: number, cy: number, R: number, color: string, adjustedScores: any, axisAngles: number[], availH: number) {
    for (let ring = 1; ring <= 5; ring++) {
        const r = (ring / 5) * R;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = axisAngles[i] ?? 0;
            const x = cx + r * Math.cos(angle);
            const y = cy + r * Math.sin(angle);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        const angle = axisAngles[i] ?? 0;
        ctx.lineTo(cx + R * Math.cos(angle), cy + R * Math.sin(angle));
        ctx.stroke();
    }
    _drawHudPolygonAndDots(ctx, cx, cy, R, color, adjustedScores, axisAngles);
    _drawHudAxisLabels(ctx, cx, cy, R, axisAngles, availH);
}
function _computeHudTrend(eisScore: number) {
    let trendGlyph = '\u2014';
    let trendColor = 'rgba(148,163,184,0.85)';
    if (_lastEisScoreForTrend !== null) {
        const delta = eisScore - _lastEisScoreForTrend;
        if (delta >= 0.1) { trendGlyph = '\u25B2'; trendColor = 'rgb(34,197,94)'; }
        else if (delta <= -0.1) { trendGlyph = '\u25BC'; trendColor = 'rgb(239,68,68)'; }
    }
    _lastEisScoreForTrend = eisScore;
    return { trendGlyph, trendColor };
}

function _drawHudCenterText(ctx: any, cx: number, cy: number, W: number, R: number, availH: number, color: string, eisScore: number) {
    const scoreFont = Math.max(11, Math.min(20, Math.round(Math.min(W, availH) * 0.16)));
    ctx.font = `bold ${scoreFont}px "JetBrains Mono", Consolas, monospace`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(eisScore.toFixed(1), cx, cy - 5);
    const { trendGlyph, trendColor } = _computeHudTrend(eisScore);
    ctx.font = 'bold 10px sans-serif';
    ctx.fillStyle = trendColor;
    ctx.fillText(trendGlyph, Math.min(cx + Math.max(14, R * 0.8), W - 8), cy - 5);
    const modeLabels: Record<string, string> = { geometric: 'GEO', veto: 'VETO', custom: 'CUST' };
    const modeColors: Record<string, string> = {
        geometric: 'rgba(130,200,255,0.85)',
        veto: 'rgba(255,80,80,0.9)',
        custom: 'rgba(80,220,180,0.9)',
    };
    const modeLabel = modeLabels[currentMode] || 'GEO';
    ctx.font = 'bold 9px sans-serif';
    ctx.fillStyle = modeColors[currentMode] || modeColors.geometric;
    ctx.fillText(modeLabel, cx, cy + Math.max(9, Math.round(scoreFont * 0.7)));
    return { trendGlyph, modeLabel, modeColors };
}

function _drawHudFooter(ctx: any, W: number, H: number, color: string, eisScore: number, modeLabel: string, modeColors: Record<string, string>) {
    ctx.font = '600 7px "JetBrains Mono", Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.66)';
    ctx.fillText('3CTA+', W / 2, H - 22);
    const bbX = 8;
    const bbW = W - 16;
    const bbY = H - 14;
    const bbH = 4;
    ctx.fillStyle = 'rgba(148,163,184,0.18)';
    ctx.fillRect(bbX, bbY, bbW, bbH);
    ctx.fillStyle = 'rgba(234,179,8,0.85)';
    ctx.fillRect(bbX + (3.5 / 5) * bbW - 0.5, bbY - 1, 1, bbH + 2);
    ctx.fillStyle = 'rgba(34,197,94,0.85)';
    ctx.fillRect(bbX + (4.5 / 5) * bbW - 0.5, bbY - 1, 1, bbH + 2);
    const valPct = Math.max(0, Math.min(1, eisScore / 5));
    ctx.fillStyle = color;
    ctx.fillRect(bbX, bbY, bbW * valPct, bbH);
    ctx.font = '600 8px "JetBrains Mono", Consolas, monospace';
    ctx.fillStyle = modeColors[currentMode] || modeColors.geometric;
    ctx.textAlign = 'left';
    ctx.fillText(modeLabel, bbX, H - 4);
    ctx.fillStyle = 'rgba(255,255,255,0.66)';
    ctx.textAlign = 'right';
    ctx.fillText(formatKappa(_kappaForHud), W - bbX, H - 4);
    ctx.textAlign = 'center';
}

function _setHudTitle(canvas: any, eisScore: number, trendGlyph: string, modeLabel: string) {
    (canvas as HTMLElement).dataset.hudEisScore = eisScore.toFixed(2);
    const semantic = 'Model EIS card (3CTA+ composite, not area-scoped)';
    canvas.title = `${semantic}. EIS ${eisScore.toFixed(2)} ${trendGlyph}. ` +
        `Mode ${modeLabel}, ${formatKappa(_kappaForHud)}. ` +
        `Thresholds: \u22654.5 verde, 3.5-4.5 amarelo, <3.5 vermelho. ` +
        `Click to open EIS Dashboard.`;
    canvas.setAttribute('aria-label',
        `EIS ${eisScore.toFixed(2)} ${trendGlyph}, mode ${modeLabel}, ${formatKappa(_kappaForHud)}, ` +
        `${eisScore >= 4.5 ? 'confi\u00e1vel' : eisScore >= 3.5 ? 'verificar evid\u00eancias' : 'dados insuficientes'}.`,
    );
}

function updateEisStatusBadge() {
    _refreshRadarTransparencyAsync();
    const canvas = document.getElementById('eis-hud-canvas');
    if (!canvas) return;
    const { ctx, W, H } = setupHiDPI(canvas);
    const FOOTER_H = 26;
    const availH = H - FOOTER_H;
    const cx = W / 2;
    const cy = availH / 2 + 2;
    const R = Math.min(W, availH) * 0.32;
    ctx.clearRect(0, 0, W, H);
    const elements = getAllElements();
    const allObs = collectAllObservations();
    const credInfo = EisCalculator.computeAggregateCredential(allObs);
    const multiplier = credInfo.multiplier;
    const dashboardModal = document.getElementById('eis-dashboard-modal');
    const isDashboardOpen = !!(dashboardModal && dashboardModal.classList.contains('active'));
    const scores = _computeHudScores(isDashboardOpen, elements, allObs);
    _hudScores = { ...scores };
    const { eisScore, adjustedScores } = _computeHudEis(scores, isDashboardOpen, multiplier);
    const color = getVerdictColor(eisScore);
    _drawHudBackground(ctx, W, H, color);
    const angleOffset = -Math.PI / 2;
    const step = (2 * Math.PI) / 6;
    const axisAngles = EIS_AXES.map((_: any, i: any) => angleOffset + i * step);
    _drawHudHexagon(ctx, cx, cy, R, color, adjustedScores, axisAngles, availH);
    const { trendGlyph, modeLabel, modeColors } = _drawHudCenterText(ctx, cx, cy, W, R, availH, color, eisScore);
    _drawHudFooter(ctx, W, H, color, eisScore, modeLabel, modeColors);
    _setHudTitle(canvas, eisScore, trendGlyph, modeLabel);
}
// ================================================================
// EXPORTS
// ================================================================
// ================================================================
// SCOPE SELECTOR - Seletor de escopo (Modelo / CNPJ / Area)
// ================================================================
/** Nomes dos indicadores espaciais IS1-IS7 */
const IS_NAMES = ['is1', 'is2', 'is3', 'is4', 'is5', 'is6', 'is7'];
/**
 * Render the scope selector tabs and inject into the modal.
 * Injetado dinamicamente antes do eis-body no modal.
 */
function _renderScopeSelector() {
    const modal = document.querySelector('.eis-modal');
    if (!modal)
        return;
    // Remove seletor anterior se existir
    const existing = modal.querySelector('.purpose-scope-tabs');
    if (existing)
        existing.remove();
    const existingList = modal.querySelector('.purpose-scope-list-container');
    if (existingList)
        existingList.remove();
    const existingSpatial = modal.querySelector('.purpose-spatial-panel');
    if (existingSpatial)
        existingSpatial.remove();
    const existingResp = modal.querySelector('.purpose-responsibles');
    if (existingResp)
        existingResp.remove();
    const modelId = getModelIdSync();
    const modelBadge = modelId
        ? `<span class="purpose-model-badge" title="${escapeHtml(modelId)}">${escapeHtml(modelId.slice(0, 8))}</span>`
        : '';
    const tabs = document.createElement('div');
    tabs.className = 'purpose-scope-tabs';
    tabs.innerHTML = `
        <button class="purpose-scope-tab ${currentScopeType === 'model' ? 'active' : ''}"
                data-cc-action="cc-8592d6b0">
            ${t('eis.scope_model') || 'Model'} ${modelBadge}
        </button>
        <button class="purpose-scope-tab ${currentScopeType === 'cnpj' ? 'active' : ''}"
                data-cc-action="cc-5a92390c">
            ${t('eis.scope_by_cnpj') || 'By CNPJ'}
        </button>
        <button class="purpose-scope-tab ${currentScopeType === 'area' ? 'active' : ''}"
                data-cc-action="cc-48461eea">
            ${t('eis.scope_by_area') || 'By Study Area'}
        </button>
    `;
    // Insere apos o header, antes do body
    const body = modal.querySelector('.eis-body');
    if (body) {
        modal.insertBefore(tabs, body);
    }
}
/**
 * Handle scope tab change.
 * Troca de aba no seletor de escopo.
 *
 * @param {string} scopeType - 'model', 'cnpj', ou 'area'
 */
function handleEisScopeChange( scopeType: any) {
    currentScopeType = scopeType;
    currentScopeId = null;
    currentScopedResult = null;
    // Atualiza tabs
    const tabs = document.querySelectorAll('.purpose-scope-tab');
    tabs.forEach((tab: any) => {
        const type = tab.textContent.includes('CNPJ')
            ? 'cnpj'
            : tab.textContent.includes(t('eis.scope_by_area') || 'Area')
                ? 'area'
                : 'model';
        tab.classList.toggle('active', type === scopeType);
    });
    if (scopeType === 'model') {
        _removeScopeListAndPanels();
        recalculate();
        return;
    }
    _renderScopedList(scopeType);
}
/**
 * Handle selection of a specific scope item (CNPJ or area).
 * @param {string} scopeType
 * @param {string} scopeId
 */
function handleEisScopeItemSelect( scopeType: any, scopeId: any) {
    currentScopeId = scopeId;
    const modelId = getModelIdSync();
    const scope = scopeType === 'cnpj'
        ? { type: 'cnpj', nodeId: scopeId, cnpj: '', modelId }
        : { type: 'area', elementId: scopeId, modelId };
    currentScopedResult = computeScopedEIS(scope);
    // Atualiza item ativo na lista
    const items = document.querySelectorAll('.purpose-scope-item');
    items.forEach((item: any) => item.classList.toggle('active', item.dataset.scopeId === scopeId));
    // Renderiza responsaveis e indicadores espaciais
    _renderResponsiblesHeader(currentScopedResult.responsibles);
    if (scopeType === 'area' && currentScopedResult.spatialIndicators) {
        _renderSpatialIndicatorsPanel(currentScopedResult.spatialIndicators);
    }
    else {
        _removeSpatialPanel();
    }
    // Atualiza ring e barras com os scores do escopo
    _updateDashboardWithScopedResult(currentScopedResult);
}
/**
 * Render the list of CNPJ nodes or study areas.
 * @param {string} item - 'cnpj' ou 'area'
 */
function _buildScopeItemHtml(item: any, scopeType: any, modelId: any, currentScopeId: any) {
    const scope = scopeType === 'cnpj'
        ? { type: 'cnpj', nodeId: item.nodeId, cnpj: item.cnpj, modelId }
        : { type: 'area', elementId: item.elementId, modelId };
    const result = computeScopedEIS(scope);
    const id = scopeType === 'cnpj' ? item.nodeId : item.elementId;
    const badgeClass = _verdictBadgeClass(result.verdict);
    const displayScore = scopeType === 'area' && result.areaEIS != null ? result.areaEIS.toFixed(2) : result.eis.toFixed(2);
    const detail = scopeType === 'cnpj'
        ? escapeHtml(item.cnpj || '')
        : `${result.elementCount} ${t('eis.elements_count') || 'elements'}`;
    return `
        <div class="purpose-scope-item ${currentScopeId === id ? 'active' : ''}"
             data-scope-id="${escapeHtml(id)}"
             data-cc-call-click="handleEisScopeItemSelect|s:${encodeURIComponent(`${scopeType}`)}|s:${encodeURIComponent(`${escapeHtml(id)}`)}">
            <div class="purpose-scope-item-info">
                <div class="purpose-scope-item-name">${escapeHtml(item.name || id)}</div>
                <div class="purpose-scope-item-detail">${detail}</div>
            </div>
            <span class="purpose-eis-badge ${badgeClass}">
                <span class="purpose-eis-badge-dot" style="background: currentColor"></span>
                ${displayScore}
            </span>
        </div>`;
}

function _renderScopedList(scopeType: any) {
    _removeScopeListAndPanels();
    const modal = document.querySelector('.eis-modal');
    const body = modal?.querySelector('.eis-body');
    if (!modal || !body) return;
    const container = document.createElement('div');
    container.className = 'purpose-scope-list-container';
    const items = scopeType === 'cnpj' ? enumerateCnpjScopes() : enumerateAreaScopes(getAllElements());
    if (items.length === 0) {
        const emptyKey = scopeType === 'cnpj' ? 'eis.scope_no_cnpj' : 'eis.scope_no_areas';
        container.innerHTML = `<div class="purpose-scope-empty">${t(emptyKey) || 'None found'}</div>`;
        modal.insertBefore(container, body);
        return;
    }
    const modelId = getModelIdSync();
    let listHtml = '<div class="purpose-scope-list">';
    for (const item of items) {
        listHtml += _buildScopeItemHtml(item, scopeType, modelId, currentScopeId);
    }
    listHtml += '</div>';
    container.innerHTML = listHtml;
    modal.insertBefore(container, body);
}
/**
 * Render the responsibles header.
 * @param {{ legal: Object|null, technical: Object|null, data: Object|null }} responsibles
 */
function _renderResponsiblesHeader( responsibles: any) {
    const modal = document.querySelector('.eis-modal');
    if (!modal)
        return;
    const existing = modal.querySelector('.purpose-responsibles');
    if (existing)
        existing.remove();
    if (!responsibles)
        return;
    const { legal, technical, data } = responsibles;
    if (!legal && !technical && !data)
        return;
    const div = document.createElement('div');
    div.className = 'purpose-responsibles';
    const roles = [
        { key: 'legal', label: t('eis.responsible_legal') || 'Legal', data: legal },
        { key: 'technical', label: t('eis.responsible_technical') || 'Technical', data: technical },
        { key: 'data', label: t('eis.responsible_data') || 'Data', data: data },
    ];
    div.innerHTML = roles
        .map((r: any) => {
        if (!r.data)
            return '';
        return `<div class="purpose-responsible-item">
            <span class="purpose-responsible-role">${escapeHtml(r.label)}</span>
            <span class="purpose-responsible-name">${escapeHtml(r.data.name || '—')}</span>
        </div>`;
    })
        .join('');
    const body = modal.querySelector('.eis-body');
    if (body)
        modal.insertBefore(div, body);
}
/**
 * Render the spatial indicators panel (IS1-IS7).
 * @param {Object} spatialIndicators
 */
function _renderSpatialIndicatorsPanel( spatialIndicators: any) {
    _removeSpatialPanel();
    const modal = document.querySelector('.eis-modal');
    const body = modal?.querySelector('.eis-body');
    if (!modal || !body)
        return;
    const panel = document.createElement('div');
    panel.className = 'purpose-spatial-panel';
    const title = t('eis.spatial_indicators') || 'Spatial Indicators';
    const compositeLabel = t('eis.is_composite') || 'Composite';
    let rows = '';
    for (const key of IS_NAMES) {
        const upper = key.toUpperCase();
        const data = spatialIndicators[upper];
        if (!data)
            continue;
        const score = data.score || 0;
        const label = t(`eis.${key}`) || key;
        const color = _scoreToColor(score);
        const isCritical = score <= 2 ? ' purpose-spatial-critical' : '';
        rows += `<div class="purpose-spatial-row">
            <span class="purpose-spatial-label${isCritical}">${escapeHtml(label)}</span>
            <div class="purpose-spatial-bar">
                <div class="purpose-spatial-fill" style="width: ${(score / 5) * 100}%; background: ${color}"></div>
            </div>
            <span class="purpose-spatial-score${isCritical}">${score}</span>
        </div>`;
    }
    // Composite
    const compositeScore = spatialIndicators.composite || 0;
    const compositeColor = _scoreToColor(compositeScore);
    rows += `<div class="purpose-spatial-row" style="margin-top: 4px; padding-top: 4px; border-top: 1px solid var(--border-1, #333)">
        <span class="purpose-spatial-label" style="font-weight: 600">${escapeHtml(compositeLabel)}</span>
        <div class="purpose-spatial-bar">
            <div class="purpose-spatial-fill" style="width: ${(compositeScore / 5) * 100}%; background: ${compositeColor}"></div>
        </div>
        <span class="purpose-spatial-score" style="font-weight: 700">${compositeScore.toFixed(1)}</span>
    </div>`;
    panel.innerHTML = `<div class="purpose-spatial-title">${escapeHtml(title)}</div><div class="purpose-spatial-grid">${rows}</div>`;
    body.parentNode?.insertBefore(panel, body.nextSibling);
}
/**
 * Update the main dashboard ring/bars with scoped result.
 * Atualiza o ring chart e as contribution bars com scores do escopo.
 * @param {Object} result - Output de computeScopedEIS()
 */
function _updateDashboardWithScopedResult( result: any) {
    if (!result || !result.axes)
        return;
    // Atualiza sliders/barras com scores do escopo
    for (const axis of EIS_AXES) {
        const score = result.axes[axis] || 0;
        const inlineSlider = document.querySelector(`.eis-contrib-slider[data-axis="${axis}"]`);
        if (inlineSlider) {
            inlineSlider.value = Math.round(score);
            inlineSlider.dispatchEvent(new Event('input'));
        }
    }
    // Dispara recalculate para atualizar o ring
    recalculate();
    _renderOdsPanel(result.odsOverlay || null);
    _renderParallelIndicatorsForActiveScope();
    _renderQualityExtensionsForActiveScope();
}
/**
 * Get the CSS badge class for a verdict.
 * @param {string} verdict
 * @returns {string}
 */
function _verdictBadgeClass( verdict: any) {
    if (verdict === 'Audit Ready')
        return 'purpose-eis-badge--high';
    if (verdict === 'Management Ready')
        return 'purpose-eis-badge--medium';
    return 'purpose-eis-badge--low';
}
/**
 * Remove scope list, spatial panel, and responsibles from modal.
 */
function _removeScopeListAndPanels() {
    const modal = document.querySelector('.eis-modal');
    if (!modal)
        return;
    const list = modal.querySelector('.purpose-scope-list-container');
    if (list)
        list.remove();
    _removeSpatialPanel();
    const resp = modal.querySelector('.purpose-responsibles');
    if (resp)
        resp.remove();
}
/**
 * Remove spatial indicators panel.
 */
function _removeSpatialPanel() {
    const panel = document.querySelector('.purpose-spatial-panel');
    if (panel)
        panel.remove();
}
// ================================================================
// HEATMAP - Coloracao dos boundaries por verdict EIS
// ================================================================
/** @type {boolean} Flag de heatmap ativo */
let _heatmapActive = false;
/** @type {Map<string, number>} Cores originais dos boundaries */
const _originalBoundaryColors = new Map();
/**
 * Toggle the EIS heatmap on boundaries.
 * Tinge o material do mesh de cada boundary com a cor do verdict EIS.
 */
function handleEisToggleHeatmap() {
    _heatmapActive = !_heatmapActive;
    if (_heatmapActive) {
        _applyEisHeatmap();
    }
    else {
        _removeEisHeatmap();
    }
}
/**
 * Apply EIS heatmap colors to all boundary meshes.
 */
function _applyEisHeatmap() {
    try {
        const elements = getAllElements();
        const modelId = getModelIdSync();
        const boundaries = elements.filter((e: any) => e.family === 'boundary');
        const getMesh = window.getMeshByElementId;
        if (!getMesh)
            return;
        for (const boundary of boundaries) {
            const mesh = getMesh(boundary.id);
            if (!mesh)
                continue;
            const scope = { type: 'area', elementId: boundary.id, modelId };
            const result = computeScopedEIS(scope);
            const score = result.areaEIS != null ? result.areaEIS : result.eis;
            const color = score >= 4.5 ? 0x22c55e : score >= 3.5 ? 0xf59e0b : 0xef4444;
            mesh.traverse((child: any) => {
                if (child.isMesh && child.material) {
                    if (!_originalBoundaryColors.has(boundary.id)) {
                        _originalBoundaryColors.set(boundary.id, child.material.color?.getHex?.() || 0xffffff);
                    }
                    child.material.color?.setHex?.(color);
                    child.material.opacity = Math.min(0.6, 0.2 + result.elementCount * 0.05);
                    child.material.needsUpdate = true;
                }
            });
        }
    }
    catch (e: any) {
        log.warn('Heatmap apply failed:', e?.message);
    }
}
/**
 * Remove EIS heatmap and restore original boundary colors.
 */
function _removeEisHeatmap() {
    try {
        const getMesh = window.getMeshByElementId;
        if (!getMesh)
            return;
        for (const [boundaryId, originalColor] of _originalBoundaryColors) {
            const mesh = getMesh(boundaryId);
            if (!mesh)
                continue;
            mesh.traverse((child: any) => {
                if (child.isMesh && child.material) {
                    child.material.color?.setHex?.(originalColor);
                    child.material.opacity = 0.85;
                    child.material.needsUpdate = true;
                }
            });
        }
        _originalBoundaryColors.clear();
    }
    catch (e: any) {
        log.warn('Heatmap remove failed:', e?.message);
    }
}
/**
 * Toggle the EIS 3D area labels.
 */
function handleEisToggleAreaLabels() {
    try {
        const { setLabelCategoryEnabled, syncLabels: doSync } = window;
        if (typeof setLabelCategoryEnabled === 'function') {
            setLabelCategoryEnabled('eisScore', true);
            if (typeof doSync === 'function')
                doSync();
        }
    }
    catch (e: any) {
        log.warn('EIS area labels toggle failed:', e?.message);
    }
}
// ================================================================
// EXPORTS
// ================================================================
export const eisHandlers = {
    handleOpenEisDashboard,
    handleRefreshEisDashboard,
    handleCloseEisDashboard,
    handleEisOverlayClick,
    handleEisModeChange,
    handleEisOpenCustomBuilder,
    handleEisSliderInput,
    handleEisResetDefaults,
    handleEisAutoToggle,
    handleEisCustomProfileSelect,
    handleEisCustomNewProfile,
    handleEisCustomCopyDefaultProfile,
    handleEisCustomEditSelectedTemplate,
    handleEisCustomDuplicateProfile,
    handleEisCustomDeleteProfile,
    handleEisCustomRenameProfile,
    handleEisCustomAxisEdit,
    handleEisCustomAddAxis,
    handleEisCustomRemoveAxis,
    handleEisCustomSliderInput,
    handleEisCustomVetoToggle,
    handleEisCustomVetoMin,
    handleEisCustomBandsEdit,
    handleEisCustomPublishProfile,
    handleEisCustomCompareWithBaseline,
    handleEisCustomSaveProfile,
    handleEisFocusPublishIssue,
    handleEisOpenCorrectionWorkbench,
    handleEisRefreshCorrectionWorkbench,
    handleEisApplyBatchCorrection,
    updateEisStatusBadge,
    // Scoped EIS handlers
    handleEisScopeChange,
    handleEisScopeItemSelect,
    handleEisToggleHeatmap,
    handleEisToggleAreaLabels,
    handleEisToggleView,
};
