// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.2.0
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: Environmental Data Governance
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   SNAPSHOT ENGINE — Captura, armazenamento e consulta de snapshots EIS
   Motor de snapshots do Modulo de Proposito.

   Captura snapshots do EIS (score + 6 eixos + contadores) em momentos
   chave: apos acoes do usuario (debounced 60s), diariamente no boot,
   e em imports. Armazena em IndexedDB (offline-first), com opcao de
   sync para Supabase via syncQueue (Phase 3).

   Snapshots sao vinculados ao modelo via modelHash (hash estavel dos
   IDs dos elementos), garantindo separacao multiprojeto.

   Retencao: max 500 snapshots, max 90 dias. Pruning automatico.
   ================================================================ */
import { idbGet, idbSet } from '../../utils/storage/idbStore.js';
import {
    createDeferredIdlePersistence,
    type DeferredIdlePersistenceController,
} from '../../utils/performance/deferredIdlePersistence.js';
import { executeCanonicalEis } from '../eis/canonicalEngine.js';
import { computeOdsOverlay as _computeOdsOverlayCanonical } from '../eis/odsOverlay.js';
import { evaluateEisSqlParity } from '../eis/sqlParity.js';
import { resolveScope, resolveResponsibles, computeScopeHash, enumerateCnpjScopes, enumerateAreaScopes, } from '../eis/eisScopeResolver.js';
import { computeAllSpatialIndicators, computeAreaEIS } from '../eis/spatialIndicators.js';
import { getAllElements } from '../elements/manager.js';
import { getAllCampaigns } from '../campaigns/manager.js';
import { getModelIdSync } from '../io/modelLink.js';
import { ANALYTICS_EVENTS, onAnalyticsEvent } from '../events/analyticsEventBus.js';
import { createLogger } from '../../utils/helpers/logger.js';
const log = createLogger('Purpose');
/**
 * @typedef {Record<string, any>} AnyRecord
 * @typedef {{ eis: number, axes: Record<string, number>, verdict: string, [key: string]: any }} EisResult
 * @typedef {{ id?: string, family?: string, data?: { observations?: Array<unknown>, vertices?: unknown, [key: string]: unknown }, [key: string]: unknown }} PurposeElement
 * @typedef {{ type?: string, modelId?: string, nodeId?: string, elementId?: string, [key: string]: any }} ScopeDescriptor
 * @typedef {{ finalEis?: number, eis?: number, axes?: Record<string, number>, timestamp?: string, [key: string]: any }} SnapshotRecord
 * @typedef {{ result: AnyRecord, timestamp: number }} ScopedCacheEntry
 */
// ================================================================
// CONSTANTS
// ================================================================
const IDB_KEY_PREFIX = 'ecbyts-purpose-snapshots';
const MAX_SNAPSHOTS = 500;
const MAX_AGE_DAYS = 90;
const MAX_AGE_MS = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
// ================================================================
// MODULE STATE
// ================================================================
/** @type {number|null} Score EIS no inicio da sessao (para delta) */
let _sessionStartEis: any = null;
/** @type {number|null} Final score EIS no inicio da sessao (para delta paralelo) */
let _sessionStartFinalScore: any = null;
/** @type {boolean} Flag de boot em andamento (random model) */
let _bootPreparing = false;
/** @type {boolean} Flag de inicializacao concluida */
let _initialized = false;
/** @type {EisResult|null} Cache do ultimo calculo */
let _cachedEisResult: any = null;
/** @type {number} Timestamp do ultimo cache */
let _cachedAt = 0;
/** Cache TTL em ms — evita recalculo frequente no statusbar */
const CACHE_TTL_MS = 5000;
/** Snapshot read cache TTL in ms — evita leituras IDB duplicadas no boot. */
const SNAPSHOT_READ_CACHE_TTL_MS = 5000;
const SNAPSHOT_WRITE_DEBOUNCE_MS = 750;
const SNAPSHOT_WRITE_AFTER_BOOT_DELAY_MS = 30000;
const SNAPSHOT_WRITE_IDLE_TIMEOUT_MS = 3000;
/** @type {Map<string, { snapshots: Array<any>, timestamp: number }>} */
const _snapshotReadCache = new Map();
/** @type {Map<string, Promise<Array<any>>>} */
const _snapshotReadInflight = new Map();
/** @type {Map<string, Array<any>>} */
const _snapshotWriteQueue = new Map();
let _snapshotPersistScheduler: DeferredIdlePersistenceController | null = null;
/**
 * Clamp helper for bounded adjustments.
 * @param {number} v
 * @param {number} min
 * @param {number} max
 */
function _clamp(v: any, min: any, max: any) {
    return Math.max(min, Math.min(max, v));
}
/**
 * Clone snapshot list before exposing cached data.
 * Clona a lista para impedir mutacao externa do cache.
 * @param {Array<any>} snapshots
 * @returns {Array<any>}
 */
function _cloneSnapshots(snapshots: any) {
    if (!Array.isArray(snapshots))
        return [];
    return snapshots.map((snapshot: any) => (snapshot && typeof snapshot === 'object' ? { ...snapshot } : snapshot));
}
/**
 * Read snapshot list with short TTL and in-flight de-duplication.
 * Le uma unica vez por chave durante bursts de boot.
 * @param {string} key
 * @returns {Promise<Array<any>>}
 */
async function _readSnapshotList(key: any) {
    const cached = _snapshotReadCache.get(key);
    if (cached && Date.now() - cached.timestamp < SNAPSHOT_READ_CACHE_TTL_MS) {
        return _cloneSnapshots(cached.snapshots);
    }
    const pending = _snapshotReadInflight.get(key);
    if (pending)
        return _cloneSnapshots(await pending);
    const load = (async () => {
        const value = await idbGet(key);
        return Array.isArray(value) ? value : [];
    })();
    _snapshotReadInflight.set(key, load);
    try {
        const snapshots = await load;
        _writeSnapshotListCache(key, snapshots);
        return _cloneSnapshots(snapshots);
    }
    finally {
        _snapshotReadInflight.delete(key);
    }
}
/**
 * Update snapshot read cache after writes.
 * Atualiza cache apos gravacao para manter leituras coerentes.
 * @param {string} key
 * @param {Array<any>} snapshots
 */
function _writeSnapshotListCache(key: any, snapshots: any) {
    _snapshotReadCache.set(key, {
        snapshots: _cloneSnapshots(snapshots),
        timestamp: Date.now(),
    });
}

async function _flushSnapshotWriteQueue() {
    if (_snapshotWriteQueue.size === 0)
        return true;
    const entries = Array.from(_snapshotWriteQueue.entries());
    _snapshotWriteQueue.clear();
    for (const [key, snapshots] of entries) {
        try {
            const ok = await idbSet(key, _cloneSnapshots(snapshots));
            if (!ok) {
                log.warn('Failed to persist queued snapshots:', key);
                _snapshotWriteQueue.set(key, snapshots);
            }
        } catch (e: any) {
            const err = (e) as any;
            log.warn('Failed to persist queued snapshots:', err?.message);
            _snapshotWriteQueue.set(key, snapshots);
        }
    }
    return _snapshotWriteQueue.size === 0;
}

function _getSnapshotPersistScheduler() {
    if (!_snapshotPersistScheduler) {
        _snapshotPersistScheduler = createDeferredIdlePersistence({
            debounceMs: SNAPSHOT_WRITE_DEBOUNCE_MS,
            bootDelayMs: SNAPSHOT_WRITE_AFTER_BOOT_DELAY_MS,
            idleTimeoutMs: SNAPSHOT_WRITE_IDLE_TIMEOUT_MS,
            flush: _flushSnapshotWriteQueue,
            onError: (error) => {
                log.warn('Failed to flush queued snapshots:', (error as any)?.message || error);
            },
        });
    }
    return _snapshotPersistScheduler;
}

function _scheduleSnapshotWriteFlush() {
    _getSnapshotPersistScheduler().schedule();
}

function _queueSnapshotListWrite(key: any, snapshots: any) {
    const cloned = _cloneSnapshots(snapshots);
    _writeSnapshotListCache(key, cloned);
    _snapshotWriteQueue.set(key, cloned);
    _scheduleSnapshotWriteFlush();
}
/**
 * Flatten observations from all elements.
 * @param {Array<any>} elements
 * @returns {Array<any>}
 */
function _collectObservations(elements: any) {
    const out = [];
    for (const el of elements || []) {
        if (!Array.isArray(el?.data?.observations))
            continue;
        for (const obs of el.data.observations)
            out.push(obs);
    }
    return out;
}
const _ODS_V2_AXES = [
    {
        id: 'ODS1',
        title: 'No Poverty',
        families: new Set(['cost_center', 'corporate_io', 'boundary', 'building']),
        parameters: new Set(['social_investment', 'social_spend', 'cost_social', 'cost_total', 'community_support']),
        impactProfile: { reading: 0.35, element: 0.25, project: 0.2, work: 0.0, cost: 0.2 },
    },
    {
        id: 'ODS2',
        title: 'Zero Hunger',
        families: new Set(['boundary', 'sample', 'well', 'lake', 'river']),
        parameters: new Set([
            'ph',
            'conductivity',
            'toc',
            'tom',
            'soil_quality',
            'water_quality',
            'nitrate',
            'ammonia',
        ]),
        impactProfile: { reading: 0.45, element: 0.2, project: 0.15, work: 0.0, cost: 0.2 },
    },
    {
        id: 'ODS3',
        title: 'Good Health and Well-being',
        families: new Set(['sensor', 'building', 'boundary', 'well']),
        parameters: new Set(['ltir', 'frequency_rate', 'severity_rate', 'near_miss', 'noise_exposure', 'pm25', 'pm10']),
        impactProfile: { reading: 0.4, element: 0.2, project: 0.1, work: 0.2, cost: 0.1 },
    },
    {
        id: 'ODS4',
        title: 'Quality Education',
        families: new Set(['corporate_io', 'building', 'boundary']),
        parameters: new Set(['training_hours', 'training_completion', 'certification_rate', 'education_spend']),
        impactProfile: { reading: 0.3, element: 0.15, project: 0.2, work: 0.2, cost: 0.15 },
    },
    {
        id: 'ODS5',
        title: 'Gender Equality',
        families: new Set(['corporate_io', 'building', 'boundary']),
        parameters: new Set(['gender_ratio', 'diversity_index', 'female_participation', 'inclusion_score']),
        impactProfile: { reading: 0.3, element: 0.15, project: 0.2, work: 0.2, cost: 0.15 },
    },
    {
        id: 'ODS6',
        title: 'Clean Water and Sanitation',
        families: new Set(['well', 'lake', 'river', 'spring', 'boundary']),
        parameters: new Set(['ph', 'conductivity', 'bod', 'cod', 'tss', 'water_level', 'benzene', 'pfos', 'pfoa']),
        impactProfile: { reading: 0.5, element: 0.2, project: 0.1, work: 0.0, cost: 0.2 },
    },
    {
        id: 'ODS7',
        title: 'Affordable and Clean Energy',
        families: new Set(['building', 'sensor', 'tank', 'corporate_io']),
        parameters: new Set([
            'consumo_eletricidade_kwh',
            'energy_intensity',
            'renewable_share',
            'consumo_gas_natural_m3',
            'consumo_diesel_b14_l',
        ]),
        impactProfile: { reading: 0.45, element: 0.15, project: 0.1, work: 0.0, cost: 0.3 },
    },
    {
        id: 'ODS8',
        title: 'Decent Work and Economic Growth',
        families: new Set(['building', 'boundary', 'corporate_io', 'cost_center']),
        parameters: new Set(['productivity_index', 'frequency_rate', 'severity_rate', 'actual_cost', 'budget_cost']),
        impactProfile: { reading: 0.35, element: 0.15, project: 0.15, work: 0.2, cost: 0.15 },
    },
    {
        id: 'ODS9',
        title: 'Industry, Innovation and Infrastructure',
        families: new Set(['building', 'tank', 'boundary', 'blueprint', 'sensor']),
        parameters: new Set(['flow_rate', 'temperature', 'pressure', 'vibration', 'asset_health', 'integrity_index']),
        impactProfile: { reading: 0.45, element: 0.25, project: 0.1, work: 0.0, cost: 0.2 },
    },
    {
        id: 'ODS10',
        title: 'Reduced Inequalities',
        families: new Set(['boundary', 'corporate_io', 'cost_center']),
        parameters: new Set(['coverage_equity', 'investment_equity', 'social_gap_index']),
        impactProfile: { reading: 0.3, element: 0.2, project: 0.2, work: 0.0, cost: 0.3 },
    },
    {
        id: 'ODS11',
        title: 'Sustainable Cities and Communities',
        families: new Set(['building', 'boundary', 'waste', 'river', 'lake']),
        parameters: new Set([
            'noise_exposure',
            'frequency_rate',
            'severity_rate',
            'ltir',
            'urban_risk',
            'response_time',
        ]),
        impactProfile: { reading: 0.4, element: 0.25, project: 0.15, work: 0.1, cost: 0.1 },
    },
    {
        id: 'ODS12',
        title: 'Responsible Consumption and Production',
        families: new Set(['waste', 'tank', 'remediation', 'cost_center']),
        parameters: new Set(['waste_total', 'waste_hazardous', 'waste_recycled_pct', 'tph', 'voc', 'mass_balance']),
        impactProfile: { reading: 0.45, element: 0.2, project: 0.05, work: 0.0, cost: 0.3 },
    },
    {
        id: 'ODS13',
        title: 'Climate Action',
        families: new Set(['building', 'sensor', 'corporate_io']),
        parameters: new Set([
            'ghg_scope1',
            'ghg_scope2',
            'consumo_diesel_b14_l',
            'consumo_eletricidade_kwh',
            'consumo_gas_natural_m3',
            'consumo_gasolina_c27_l',
            'emission_intensity',
        ]),
        impactProfile: { reading: 0.5, element: 0.1, project: 0.1, work: 0.0, cost: 0.3 },
    },
    {
        id: 'ODS14',
        title: 'Life Below Water',
        families: new Set(['lake', 'river', 'spring', 'plume', 'well']),
        parameters: new Set(['pfos', 'pfoa', 'pfas_total', 'pah_total', 'benzo_a_pyrene', 'naphthalene', 'bod', 'cod']),
        impactProfile: { reading: 0.5, element: 0.2, project: 0.1, work: 0.0, cost: 0.2 },
    },
    {
        id: 'ODS15',
        title: 'Life on Land',
        families: new Set(['boundary', 'waste', 'remediation', 'plume', 'sample']),
        parameters: new Set([
            'toc',
            'tom',
            'clay_fraction',
            'silt_fraction',
            'sand_fine',
            'sand_medium',
            'sand_coarse',
            'grain_size',
            'species_count',
            'protected_area',
            'biodiversity_index',
        ]),
        impactProfile: { reading: 0.5, element: 0.25, project: 0.1, work: 0.0, cost: 0.15 },
    },
    {
        id: 'ODS16',
        title: 'Peace, Justice and Strong Institutions',
        families: new Set(['access_control', 'corporate_io', 'boundary', 'building']),
        parameters: new Set(['traceability_ratio', 'audit_trail', 'governance_incident', 'dispute_resolution']),
        impactProfile: { reading: 0.3, element: 0.2, project: 0.15, work: 0.15, cost: 0.2 },
    },
    {
        id: 'ODS17',
        title: 'Partnerships for the Goals',
        families: new Set(['contracts', 'corporate_io', 'boundary', 'building']),
        parameters: new Set([
            'partnership_execution',
            'integration_health',
            'shared_deliverables',
            'stakeholder_engagement',
        ]),
        impactProfile: { reading: 0.3, element: 0.2, project: 0.2, work: 0.1, cost: 0.2 },
    },
];
/** @param {unknown} v */
function _normalizeKey(v: any) {
    return String(v || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_');
}
/** @param {AnyRecord} obs */
function _extractParameterKey(obs: any) {
    return _normalizeKey(obs?.parameterId || obs?.parameter || obs?.name || obs?.parameterName || obs?.metric);
}
/** @param {unknown} v */
function _toNum(v: any) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}
/** @param {Array<AnyRecord>} readings */
function _computeFreshnessRatio(readings: any) {
    if (!Array.isArray(readings) || readings.length === 0)
        return 0;
    const now = Date.now();
    let validDates = 0;
    let fresh = 0;
    for (const obs of readings) {
        if (!obs?.date)
            continue;
        const t = new Date(obs.date).getTime();
        if (!Number.isFinite(t))
            continue;
        validDates++;
        const ageDays = (now - t) / 86_400_000;
        if (ageDays <= 180)
            fresh++;
    }
    if (validDates === 0)
        return 0;
    return _clamp(fresh / validDates, 0, 1);
}
/** @param {AnyRecord} obs */
function _extractObsCampaignId(obs: any) {
    return (obs?.campaignId || obs?.campaign_id || obs?.campaign || obs?.meta?.campaignId || obs?.meta?.campaign_id || null);
}
/** @param {Array<AnyRecord>} readings */
function _computeUncertaintyQualityRatio(readings: any) {
    if (!Array.isArray(readings) || readings.length === 0)
        return 0;
    let withUncertainty = 0;
    let lowRelative = 0;
    for (const obs of readings) {
        const unc = _toNum(obs?.uncertainty);
        if (unc == null)
            continue;
        withUncertainty++;
        const value = _toNum(obs?.value ?? obs?.reading) || 1;
        const rel = Math.abs(unc) <= 1 ? Math.abs(unc) : Math.abs(unc) / Math.max(Math.abs(value), 1e-6);
        if (rel <= 0.5)
            lowRelative++;
    }
    if (withUncertainty === 0)
        return 0;
    return _clamp(lowRelative / withUncertainty, 0, 1);
}
/** @param {Array<AnyRecord>} readings */
function _computeTraceabilityRatio(readings: any) {
    if (!Array.isArray(readings) || readings.length === 0)
        return 0;
    let traced = 0;
    for (const obs of readings) {
        if (obs?.createdBy || obs?.author || obs?.meta?.author || obs?.meta?.source)
            traced++;
    }
    return _clamp(traced / readings.length, 0, 1);
}
/**
 * @param {number} eligibleElements
 * @param {number} totalElements
 * @param {number} eligibleReadings
 * @param {number} totalReadings
 * @param {number} eligibleCampaigns
 * @param {number} totalCampaigns
 */
function _computeSignalRatios(eligibleElements: any, totalElements: any, eligibleReadings: any, totalReadings: any, eligibleCampaigns: any, totalCampaigns: any) {
    return {
        elementCoverage: totalElements > 0 ? _clamp(eligibleElements / totalElements, 0, 1) : 0,
        readingCoverage: totalReadings > 0 ? _clamp(eligibleReadings / totalReadings, 0, 1) : 0,
        campaignCoverage: totalCampaigns > 0 ? _clamp(eligibleCampaigns / totalCampaigns, 0, 1) : 0,
    };
}
/**
 * @param {number} coverage01
 * @param {number} confidenceScore5
 * @param {boolean} hasAnySignal
 */
function _computeEvidenceLevel(coverage01: any, confidenceScore5: any, hasAnySignal: any) {
    if (!hasAnySignal)
        return 'none';
    if (coverage01 < 0.25 || confidenceScore5 < 2)
        return 'low';
    if (coverage01 <= 0.6)
        return 'medium';
    return confidenceScore5 >= 3.5 ? 'high' : 'medium';
}
/**
 * Compute ODS monitoring overlay - wrapper para o módulo canônico
 * em core/eis/odsOverlay.js. Preserva assinatura posicional histórica.
 * @param {Array<any>} elements
 * @param {Array<any>} observations
 * @param {Array<any>} campaigns
 * @returns overlay conforme SPEC_EIS_ODS_MONITORING_PACK
 */
export function computeOdsOverlay(elements: any, observations: any, campaigns = []) {
    return _computeOdsOverlayCanonical(elements || [], observations || [], campaigns || []);
}
/**
 * Normalize stamps from observation payload.
 * Supports string stamps and object stamps with common keys.
 *
 * @param {any} obs
 * @returns {string[]}
 */
function _extractStampCodes(obs: any) {
    const raw = obs?.stamps || obs?.meta?.stamps || [];
    if (!Array.isArray(raw))
        return [];
    const codes = [];
    for (const s of raw) {
        if (typeof s === 'string') {
            codes.push(s.toUpperCase());
        }
        else if (s && typeof s === 'object') {
            const code = s.code || s.type || s.id || s.stamp;
            if (typeof code === 'string')
                codes.push(code.toUpperCase());
        }
    }
    return codes;
}
/**
 * Compute governance overlay in a model parallel to raw factual score.
 * Returns bounded score adjustment + contextual flags without overriding raw facts.
 *
 * @param {Array<any>} observations
 * @returns {{ adjustment: number, flags: Object, counts: Object, notes: string[] }}
 */
export function computeGovernanceOverlay(observations: any) {
    const POSITIVE = new Set([
        'PROVENANCE_VERIFIED',
        'QA_PASSED',
        'UNIT_NORMALIZED',
        'TAXONOMY_MAPPED',
        'OUTLIER_REVIEWED',
    ]);
    const NEGATIVE = new Set(['QA_FAILED', 'DUPLICATE_SUSPECT', 'DUPLICATE_CONFIRMED']);
    let positive = 0;
    let negative = 0;
    let exceptional = 0;
    for (const obs of observations || []) {
        const codes = _extractStampCodes(obs);
        for (const c of codes) {
            if (POSITIVE.has(c))
                positive++;
            if (NEGATIVE.has(c))
                negative++;
            if (c === 'REGULATORY_EXCEPTION')
                exceptional++;
        }
    }
    // Governance model is parallel: bounded and transparent, never masks factual score.
    // Positive evidence helps slightly; negative evidence penalizes more strongly.
    const rawAdj = positive * 0.02 - negative * 0.04;
    const adjustment = _clamp(Number(rawAdj.toFixed(3)), -0.3, 0.3);
    const notes = [];
    if (exceptional > 0) {
        notes.push('Exceptional regulatory context detected; interpret timeliness/accuracy with context.');
    }
    if (negative > 0) {
        notes.push('Governance issues detected in stamps (QA failure and/or duplicates).');
    }
    return {
        adjustment,
        flags: { exceptionalContext: exceptional > 0 },
        counts: { positive, negative, exceptional, observations: observations?.length || 0 },
        notes,
    };
}
/**
 * Compute confidence envelope for EIS interpretation.
 * Returns numeric confidence (0..1) + qualitative level.
 *
 * @param {Array<any>} observations
 * @param {{negative:number}} governanceCounts
 * @returns {{ score: number, level: 'low'|'medium'|'high', factors: Object }}
 */
export function computeEisConfidence(observations: any, governanceCounts = { negative: 0 }) {
    const obs = observations || [];
    const n = obs.length;
    if (n === 0) {
        return {
            score: 0.2,
            level: 'low',
            factors: { sampleSize: 0, missingDateRatio: 1, missingUnitRatio: 1, negativeStampRatio: 0 },
        };
    }
    let missingDate = 0;
    let missingUnit = 0;
    for (const o of obs) {
        if (!o?.date || Number.isNaN(new Date(o.date).getTime()))
            missingDate++;
        if (!o?.unitId)
            missingUnit++;
    }
    const sampleFactor = _clamp(n / 50, 0, 1);
    const missingDateRatio = missingDate / n;
    const missingUnitRatio = missingUnit / n;
    const negativeStampRatio = _clamp((governanceCounts?.negative || 0) / Math.max(n, 1), 0, 1);
    // Weighted confidence model (simple v1):
    // + sample size, - missing fields, - governance negatives.
    const score = _clamp(Number((0.35 * sampleFactor +
        0.25 * (1 - missingDateRatio) +
        0.25 * (1 - missingUnitRatio) +
        0.15 * (1 - negativeStampRatio)).toFixed(3)), 0, 1);
    const level = score >= 0.75 ? 'high' : score >= 0.5 ? 'medium' : 'low';
    return {
        score,
        level,
        factors: { sampleSize: n, missingDateRatio, missingUnitRatio, negativeStampRatio },
    };
}
// ================================================================
// MODEL HASH - Identificador estavel do modelo para separar projetos
// ================================================================
/**
 * Compute a stable hash from element IDs.
 * Calcula hash estavel dos IDs dos elementos para vincular snapshots ao modelo.
 *
 * Usa concatenacao ordenada dos IDs + simple hash (djb2).
 * Retorna string hex de 8 chars.
 *
 * @returns {string} Hash hex do modelo atual
 */
function _computeModelHash() {
    const elements = getAllElements();
    if (!elements || elements.length === 0)
        return '00000000';
    const ids = elements
        .map((e: any) => e.id)
        .sort()
        .join('|');
    // djb2 hash - deterministic, fast, good distribution
    let hash = 5381;
    for (let i = 0; i < ids.length; i++) {
        hash = ((hash << 5) + hash + ids.charCodeAt(i)) | 0;
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}
/**
 * Get the IDB key for the current model.
 * Retorna a chave IDB para os snapshots do modelo atual.
 * @returns {string}
 */
function _getIdbKey() {
    return `${IDB_KEY_PREFIX}-${_computeModelHash()}`;
}
// ================================================================
// EIS CALCULATION - Heuristica simplificada (fonte unica de verdade)
// ================================================================
/**
 * Compute simplified EIS from elements and campaigns (pure function).
 * Calcula EIS simplificado a partir de elementos e campanhas.
 * Funcao pura - usada tanto pelo snapshotEngine quanto pelo homeGrid.
 *
 * @param {Array<any>} elements - Lista de elementos do modelo
 * @param {Array<any>} campaigns - Lista de campanhas
 * @returns {EisResult}
 */
export function computeSimplifiedEIS(elements: any, campaigns: any) {
    if (!elements || elements.length === 0) {
        return {
            eis: 0,
            baseScore: 0,
            governanceAdjustment: 0,
            finalScore: 0,
            aggregationSource: 'runtime',
            confidence: { score: 0.2, level: 'low', factors: { sampleSize: 0 } },
            axes: { T: 0, A: 0, Cp: 0, Ty: 0, Cs: 0, Cm: 0 },
            verdict: 'Critical Data',
            finalVerdict: 'Critical Data',
            governanceFlags: { exceptionalContext: false },
            odsOverlay: computeOdsOverlay([], [], []),
            explanation: ['No elements available for EIS computation.'],
        };
    }
    const canonical = executeCanonicalEis(elements, campaigns, { mode: 'geometric', credentialLevel: 'common' });
    const axes = canonical.axes || { T: 0, A: 0, Cp: 0, Ty: 0, Cs: 0, Cm: 0 };
    const baseScore = Number(canonical.eis || 0);
    const observations = _collectObservations(elements);
    const governance = computeGovernanceOverlay(observations);
    const confidence = computeEisConfidence(observations, /** @type {{ negative: number }} */ (governance.counts));
    const odsOverlay = computeOdsOverlay(elements, observations, campaigns);
    const finalScore = _clamp(Number((baseScore + governance.adjustment).toFixed(2)), 0, 5);
    const sqlParity = evaluateEisSqlParity(canonical);
    const verdict = baseScore >= 4.5 ? 'Audit Ready' : baseScore >= 3.5 ? 'Management Ready' : 'Critical Data';
    const finalVerdict = finalScore >= 4.5 ? 'Audit Ready' : finalScore >= 3.5 ? 'Management Ready' : 'Critical Data';
    const explanation = [
        `Base score derived from factual model data: ${baseScore.toFixed(2)}`,
        `Governance adjustment (bounded): ${governance.adjustment >= 0 ? '+' : ''}${governance.adjustment.toFixed(2)}`,
        `Confidence level: ${confidence.level} (${confidence.score.toFixed(2)})`,
        `SQL parity emulation: ${sqlParity.matched ? 'match' : 'drift'} (Δ=${sqlParity.delta.toFixed(2)})`,
    ];
    if (governance.notes.length)
        explanation.push(...governance.notes);
    // Backward compatibility: `eis` keeps existing consumers working.
    return {
        eis: Number(baseScore.toFixed(2)),
        baseScore: Number(baseScore.toFixed(2)),
        governanceAdjustment: governance.adjustment,
        finalScore,
        aggregationSource: 'runtime',
        sqlParity,
        confidence,
        axes,
        verdict,
        finalVerdict,
        governanceFlags: governance.flags,
        odsOverlay,
        explanation,
        formulaModel: canonical.formulaModel || 'calculator-canonical-v1',
        aggregateFormulaRef: canonical.aggregateFormulaRef || 'eis.aggregate.geometric_weighted.v1',
        axisFormulaRefs: canonical.axisFormulaRefs || {},
        axisTrace: canonical.axisTrace || {},
    };
}
/**
 * Calculate current EIS with caching.
 * Calcula EIS atual com cache de 5s para evitar recalculo frequente.
 *
 * @returns {EisResult}
 */
function _calculateCurrentEIS() {
    const now = Date.now();
    if (_cachedEisResult && now - _cachedAt < CACHE_TTL_MS) {
        return _cachedEisResult;
    }
    const result = computeSimplifiedEIS(getAllElements(), getAllCampaigns());
    _cachedEisResult = result;
    _cachedAt = now;
    return result;
}
// ================================================================
// SNAPSHOT CRUD
// ================================================================
/**
 * Capture an EIS snapshot and store in IndexedDB.
 * Captura snapshot do EIS e armazena em IndexedDB.
 *
 * @param {'action'|'daily'|'import'|'manual'} trigger - Tipo de trigger
 * @param {string|null} [triggerAction=null] - Handler que disparou (ex: 'handleAddObservation')
 * @returns {Promise<Object|null>} Snapshot capturado ou null se skip
 */
export async function captureSnapshot(trigger = 'action', triggerAction = null) {
    // Guard: skip durante boot de modelo random
    if (_bootPreparing) {
        log.debug('Snapshot skipped — boot preparing');
        return null;
    }
    const elements = getAllElements();
    if (!elements || elements.length === 0)
        return null;
    const current = _calculateCurrentEIS();
    const { eis, baseScore, governanceAdjustment, finalScore, confidence, axes, verdict, finalVerdict, odsOverlay } = current;
    const campaigns = getAllCampaigns();
    let id;
    try {
        id = crypto.randomUUID();
    }
    catch {
        id = `snap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
    const snapshot = {
        id,
        timestamp: new Date().toISOString(),
        trigger,
        triggerAction,
        modelId: getModelIdSync() || null,
        modelHash: _computeModelHash(),
        scope: null,
        eis: Math.round(eis * 100) / 100,
        baseEis: typeof baseScore === 'number' ? Math.round(baseScore * 100) / 100 : Math.round(eis * 100) / 100,
        governanceAdjustment: typeof governanceAdjustment === 'number' ? Math.round(governanceAdjustment * 1000) / 1000 : 0,
        finalEis: typeof finalScore === 'number' ? Math.round(finalScore * 100) / 100 : Math.round(eis * 100) / 100,
        aggregationSource: current?.aggregationSource || 'runtime',
        confidenceScore: typeof confidence?.score === 'number' ? confidence.score : null,
        confidenceLevel: confidence?.level || null,
        odsSummary: {
            version: odsOverlay?.version || 'ods-v2',
            composite: typeof odsOverlay?.composite === 'number' ? odsOverlay.composite : 0,
            coverage: typeof odsOverlay?.coverage === 'number' ? odsOverlay.coverage : 0,
            confidenceScore: typeof odsOverlay?.confidence?.score === 'number' ? odsOverlay.confidence.score : null,
            confidenceLevel: odsOverlay?.confidence?.level || null,
        },
        axes,
        verdict,
        finalVerdict: finalVerdict || verdict,
        elementCount: elements.length,
        observationCount: elements.reduce((sum: any, e: any) => sum + (e.data?.observations?.length || 0), 0),
        campaignCount: campaigns.length,
    };
    // Persist to IDB
    try {
        const key = _getIdbKey();
        const existing = await _readSnapshotList(key);
        existing.push(snapshot);
        // Prune: remove old + over limit
        const pruned = _prune(existing);
        _queueSnapshotListWrite(key, pruned);
        log.debug(`Snapshot captured: ${trigger}/${triggerAction} EIS=${snapshot.eis}`);
    }
    catch (e: any) {
        const err = (e) as any;
        log.warn('Failed to persist snapshot:', err?.message);
    }
    return snapshot;
}
/**
 * Prune snapshots: remove older than 90 days, cap at 500.
 * Poda snapshots: remove antigos (90 dias) e excedentes (500).
 *
 * @param {Array<SnapshotRecord>} snapshots - Lista de snapshots
 * @returns {Array<SnapshotRecord>} Lista podada
 */
function _prune(snapshots: any) {
    const cutoff = Date.now() - MAX_AGE_MS;
    let filtered = snapshots.filter((s: any) => new Date(String(s.timestamp || '')).getTime() > cutoff);
    if (filtered.length > MAX_SNAPSHOTS) {
        filtered = filtered.slice(filtered.length - MAX_SNAPSHOTS);
    }
    return filtered;
}
/**
 * Resolve comparable score from snapshot.
 * Prefers finalEis when available, falls back to legacy eis.
 * @param {SnapshotRecord} snapshot
 * @returns {number}
 */
function _getSnapshotScore(snapshot: any) {
    if (!snapshot || typeof snapshot !== 'object')
        return 0;
    if (typeof snapshot.finalEis === 'number')
        return snapshot.finalEis;
    return typeof snapshot.eis === 'number' ? snapshot.eis : 0;
}
/**
 * Get snapshots for a time window.
 * Retorna snapshots dentro de uma janela de tempo.
 *
 * @param {'1d'|'7d'|'30d'|'all'} [timeWindow='7d'] - Janela de tempo
 * @returns {Promise<Array<SnapshotRecord>>} Snapshots filtrados, ordenados por timestamp
 */
export async function getSnapshots(timeWindow = '7d') {
    try {
        const key = _getIdbKey();
        const all = await _readSnapshotList(key);
        if (timeWindow === 'all')
            return all;
        const msMap: any = { '1d': 86_400_000, '7d': 604_800_000, '30d': 2_592_000_000 };
        const ms = msMap[timeWindow] || 604_800_000;
        const cutoff = Date.now() - ms;
        return all.filter((s: any) => new Date(String(s.timestamp || '')).getTime() > cutoff);
    }
    catch {
        return [];
    }
}
/**
 * Compute EIS delta for a time window.
 * Calcula delta do EIS em uma janela de tempo.
 *
 * Retorna a diferenca entre o snapshot mais recente e o mais antigo
 * dentro da janela, para o score global e para cada eixo.
 *
 * @param {'1d'|'7d'|'30d'|'all'} [timeWindow='7d'] - Janela de tempo
 * @returns {Promise<{
 *   deltaEis: number,
 *   deltaAxes: Object.<string, number>,
 *   startSnapshot: Object|null,
 *   endSnapshot: Object|null,
 *   period: string
 * }>}
 */
export async function computeDelta(timeWindow = '7d') {
    const snapshots = await getSnapshots(timeWindow);
    const empty = {
        deltaEis: 0,
        deltaAxes: { T: 0, A: 0, Cp: 0, Ty: 0, Cs: 0, Cm: 0 },
        startSnapshot: null,
        endSnapshot: null,
        period: timeWindow,
    };
    if (snapshots.length < 2)
        return empty;
    const start = snapshots[0];
    const end = snapshots[snapshots.length - 1];
    const deltaAxes: Record<string, number> = {};
    for (const axis of ['T', 'A', 'Cp', 'Ty', 'Cs', 'Cm']) {
        deltaAxes[axis] = Math.round(((end.axes?.[axis] || 0) - (start.axes?.[axis] || 0)) * 100) / 100;
    }
    return {
        deltaEis: Math.round((_getSnapshotScore(end) - _getSnapshotScore(start)) * 100) / 100,
        deltaAxes,
        startSnapshot: start,
        endSnapshot: end,
        period: timeWindow,
    };
}
/**
 * Check and capture daily snapshot if none exists for today.
 * Verifica se ha snapshot para hoje; se nao, captura automaticamente.
 *
 * @returns {Promise<boolean>} true se capturou novo snapshot
 */
export async function checkDailySnapshot() {
    try {
        const key = _getIdbKey();
        const all = await _readSnapshotList(key);
        const today = new Date().toLocaleDateString();
        const hasToday = all.some((s: any) => {
            try {
                return new Date(String(s.timestamp || '')).toLocaleDateString() === today;
            }
            catch {
                return false;
            }
        });
        if (!hasToday && getAllElements().length > 0) {
            await captureSnapshot('daily', null);
            return true;
        }
        return false;
    }
    catch {
        return false;
    }
}
// ================================================================
// SCOPED EIS - Calculo e armazenamento por escopo (CNPJ / area)
// ================================================================
/** @type {Map<string, ScopedCacheEntry>} Cache por escopo */
const _scopedCaches = new Map();
/**
 * Compute EIS for a specific scope.
 * Resolve escopo, calcula 3CTA+ filtrado + indicadores espaciais (para areas).
 *
 * @param {ScopeDescriptor|null} scope - Scope descriptor ({ type, modelId, nodeId?, elementId? })
 * @returns {AnyRecord}
 */
export function computeScopedEIS(scope: any) {
    if (!scope)
        return _emptyScopedResult(scope);
    // Cache check (TTL 5s)
    const cacheKey = computeScopeHash(scope);
    const cached = _scopedCaches.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.result;
    }
    const allElements = getAllElements();
    const allCampaigns = getAllCampaigns();
    const { elements, campaigns } = resolveScope(scope, allElements, allCampaigns);
    if (elements.length === 0)
        return _emptyScopedResult(scope);
    // 3CTA+ EIS
    const { eis, baseScore, governanceAdjustment, finalScore, aggregationSource, sqlParity, confidence, axes, verdict, finalVerdict, odsOverlay, } = computeSimplifiedEIS(elements, campaigns);
    // Indicadores espaciais (somente para areas com boundary)
    /** @type {AnyRecord|null} */
    let spatialIndicators = null;
    let areaEIS = null;
    if (scope.type === 'area') {
        const areaEl = allElements.find((e: any) => e.id === scope.elementId);
        if (areaEl?.data?.vertices) {
            spatialIndicators = computeAllSpatialIndicators(elements, areaEl.data.vertices);
            areaEIS = computeAreaEIS(eis, spatialIndicators.composite);
        }
    }
    // Responsaveis (com heranca)
    const responsibles = resolveResponsibles(scope, allElements);
    const result = {
        eis,
        baseScore: typeof baseScore === 'number' ? baseScore : eis,
        governanceAdjustment: typeof governanceAdjustment === 'number' ? governanceAdjustment : 0,
        finalScore: typeof finalScore === 'number' ? finalScore : eis,
        aggregationSource: aggregationSource || 'runtime',
        sqlParity: sqlParity || null,
        confidence: confidence || null,
        axes,
        verdict,
        finalVerdict: finalVerdict || verdict,
        odsOverlay,
        spatialIndicators,
        areaEIS,
        responsibles,
        scope,
        elementCount: elements.length,
        observationCount: elements.reduce(
        /**
         * @param {number} s
         * @param {PurposeElement} e
         */
        (s, e) => s + (e.data?.observations?.length || 0), 0),
    };
    _scopedCaches.set(cacheKey, { result, timestamp: Date.now() });
    return result;
}
/**
 * Compute EIS for all active scopes (all CNPJs + all areas).
 * Retorna Map com todas as combinacoes de escopo ativas.
 *
 * @returns {Map<string, Object>} scopeHash → scopedResult
 */
export function getAllScopeEIS() {
    const allElements = getAllElements();
    const results = new Map();
    // CNPJs
    for (const scope of enumerateCnpjScopes()) {
        const hash = computeScopeHash(scope);
        results.set(hash, computeScopedEIS(scope));
    }
    // Areas
    for (const scope of enumerateAreaScopes(allElements)) {
        const hash = computeScopeHash(scope);
        results.set(hash, computeScopedEIS(scope));
    }
    return results;
}
/**
 * Capture a scoped snapshot and store in IndexedDB.
 * Snapshot inclui scope, modelId, indicadores espaciais e responsaveis.
 *
 * @param {ScopeDescriptor|null} scope - Scope descriptor
 * @param {'action'|'daily'|'import'|'manual'} trigger
 * @param {string|null} [triggerAction=null]
 * @returns {Promise<Object|null>}
 */
export async function captureScopedSnapshot(scope: any, trigger = 'action', triggerAction = null) {
    if (_bootPreparing || !scope)
        return null;
    const result = computeScopedEIS(scope);
    if (result.elementCount === 0)
        return null;
    let id;
    try {
        id = crypto.randomUUID();
    }
    catch {
        id = `snap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
    const snapshot = {
        id,
        timestamp: new Date().toISOString(),
        trigger,
        triggerAction,
        modelId: getModelIdSync() || _computeModelHash(),
        modelHash: _computeModelHash(),
        scope,
        eis: Math.round(result.eis * 100) / 100,
        axes: result.axes,
        verdict: result.verdict,
        spatialIndicators: result.spatialIndicators
            ? {
                IS1: result.spatialIndicators.IS1.score,
                IS2: result.spatialIndicators.IS2.score,
                IS3: result.spatialIndicators.IS3.score,
                IS4: result.spatialIndicators.IS4.score,
                IS5: result.spatialIndicators.IS5.score,
                IS6: result.spatialIndicators.IS6.score,
                IS7: result.spatialIndicators.IS7.score,
                composite: result.spatialIndicators.composite,
            }
            : null,
        areaEIS: result.areaEIS,
        aggregationSource: result.aggregationSource || 'runtime',
        responsibles: {
            legal: result.responsibles.legal
                ? { name: result.responsibles.legal.name, registry: result.responsibles.legal.registry }
                : null,
            technical: result.responsibles.technical
                ? { name: result.responsibles.technical.name, registry: result.responsibles.technical.registry }
                : null,
            data: result.responsibles.data
                ? { name: result.responsibles.data.name, registry: result.responsibles.data.registry }
                : null,
        },
        elementCount: result.elementCount,
        observationCount: result.observationCount,
        campaignCount: 0,
    };
    try {
        const key = _getScopedIdbKey(scope);
        const existing = await _readSnapshotList(key);
        existing.push(snapshot);
        const pruned = _prune(existing);
        _queueSnapshotListWrite(key, pruned);
        log.debug(`Scoped snapshot captured: ${scope.type}/${trigger} EIS=${snapshot.eis}`);
    }
    catch (e: any) {
        const err = (e) as any;
        log.warn('Failed to persist scoped snapshot:', err?.message);
    }
    return snapshot;
}
/**
 * Get scoped snapshots for a time window.
 * @param {ScopeDescriptor|null} scope - Scope descriptor
 * @param {'1d'|'7d'|'30d'|'all'} [timeWindow='7d']
 * @returns {Promise<Array<SnapshotRecord>>}
 */
export async function getScopedSnapshots(scope: any, timeWindow = '7d') {
    if (!scope)
        return [];
    try {
        const key = _getScopedIdbKey(scope);
        const all = await _readSnapshotList(key);
        if (timeWindow === 'all')
            return all;
        const msMap: any = { '1d': 86_400_000, '7d': 604_800_000, '30d': 2_592_000_000 };
        const ms = msMap[timeWindow] || 604_800_000;
        const cutoff = Date.now() - ms;
        return all.filter((s: any) => new Date(String(s.timestamp || '')).getTime() > cutoff);
    }
    catch {
        return [];
    }
}
/**
 * Invalidate scoped caches.
 * Limpa caches de todos os escopos.
 */
export function invalidateScopedCaches() {
    _scopedCaches.clear();
}
/**
 * Build IDB key for a scoped snapshot collection.
 * @param {ScopeDescriptor|null} scope
 * @returns {string}
 */
function _getScopedIdbKey(scope: any) {
    const modelKey = getModelIdSync() || _computeModelHash();
    if (!scope || scope.type === 'model')
        return `${IDB_KEY_PREFIX}-${modelKey}`;
    const scopeId = scope.type === 'cnpj' ? scope.nodeId : scope.elementId;
    return `${IDB_KEY_PREFIX}-${modelKey}-${scope.type}-${scopeId || 'unknown'}`;
}
/**
 * Build empty scoped result.
 * @param {ScopeDescriptor|null} scope
 * @returns {AnyRecord}
 */
function _emptyScopedResult(scope: any) {
    return {
        eis: 0,
        baseScore: 0,
        governanceAdjustment: 0,
        finalScore: 0,
        aggregationSource: 'runtime',
        sqlParity: null,
        confidence: { score: 0.2, level: 'low', factors: { sampleSize: 0 } },
        axes: { T: 0, A: 0, Cp: 0, Ty: 0, Cs: 0, Cm: 0 },
        verdict: 'Critical Data',
        finalVerdict: 'Critical Data',
        odsOverlay: computeOdsOverlay([], [], []),
        spatialIndicators: null,
        areaEIS: null,
        responsibles: { legal: null, technical: null, data: null },
        scope,
        elementCount: 0,
        observationCount: 0,
    };
}
// ================================================================
// SESSION STATE - Gerencia EIS de inicio de sessao
// ================================================================
/**
 * Get session start EIS score.
 * Retorna o score EIS do inicio da sessao.
 * @returns {number|null}
 */
export function getSessionStartEis() {
    return _sessionStartEis;
}
/**
 * Get current EIS calculation (cached).
 * Retorna o calculo EIS atual (cacheado com TTL de 5s).
 * @returns {EisResult}
 */
export function getCurrentEIS() {
    return _calculateCurrentEIS();
}
/**
 * Get session EIS delta.
 * Retorna o delta do EIS desde o inicio da sessao.
 * @returns {number}
 */
export function getSessionDelta() {
    if (_sessionStartEis === null)
        return 0;
    const current = _calculateCurrentEIS();
    return Math.round((current.eis - _sessionStartEis) * 100) / 100;
}
/**
 * Get session EIS delta using final score (base + governance overlay).
 * Retorna o delta do score final desde o inicio da sessao.
 * @returns {number}
 */
export function getSessionDeltaFinal() {
    if (_sessionStartFinalScore === null)
        return 0;
    const current = _calculateCurrentEIS();
    const currentFinal = typeof current.finalScore === 'number' ? current.finalScore : current.eis;
    return Math.round((currentFinal - _sessionStartFinalScore) * 100) / 100;
}
/**
 * Invalidate cached EIS result.
 * Invalida o cache para forcar recalculo no proximo acesso.
 */
export function invalidateCache() {
    _cachedEisResult = null;
    _cachedAt = 0;
    _scopedCaches.clear();
}
// ================================================================
// INITIALIZATION
// ================================================================
/**
 * Initialize the snapshot engine.
 * Inicializa o motor de snapshots: grava EIS da sessao, registra listener,
 * e captura snapshot diario se necessario.
 *
 * Deve ser chamado apos initHomeGrid() e registerAllHandlers().
 */
export async function initSnapshotEngine() {
    if (_initialized)
        return;
    _initialized = true;
    // Grava EIS do inicio da sessao
    const initial = _calculateCurrentEIS();
    _sessionStartEis = initial.eis;
    _sessionStartFinalScore = typeof initial.finalScore === 'number' ? initial.finalScore : initial.eis;
    // Registra listener para snapshot trigger (debounced pelos handlers)
    try {
        await onAnalyticsEvent(ANALYTICS_EVENTS.EIS_SNAPSHOT_TRIGGER, async (payload: unknown) => {
            const eventPayload = (payload) as any;
            await captureSnapshot('action', eventPayload?.triggerAction || null);
        });
    }
    catch (e: any) {
        console.debug('[purpose/snapshotEngine] analytics-listener:', e?.message || e);
    }
    // Captura snapshot diario se necessario (async, nao bloqueia boot)
    checkDailySnapshot().catch((_e: any) => console.debug('[core/purpose/snapshotEngine:silent-catch]', _e?.message || _e));
    log.info('Snapshot engine initialized, session EIS:', _sessionStartEis, 'session final EIS:', _sessionStartFinalScore);
}
/**
 * Set boot preparing flag.
 * Define flag de boot em andamento (skip snapshots durante random model).
 * @param {boolean} preparing
 */
export function setBootPreparing(preparing: any) {
    _bootPreparing = preparing === true;
}
