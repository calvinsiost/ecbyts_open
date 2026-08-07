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
   VALIDATION PROFILE ENGINE
   ================================================================

   Perfis plugaveis de validacao por JSON.
   - Built-ins carregados de /profiles/*.json
   - Perfis customizados persistidos em IDB
   - Validacao batch pura (sem side effects)

   ================================================================ */

import { CONFIG } from '../../config.js';
import { convert } from '../units/converter.js';
import { idbGetWithLegacy, idbSet } from '../../utils/storage/idbStore.js';
import { calculateStats, detectOutlierIQR, detectOutlierZScore } from './rules.js';
import { toFiniteNumber } from '../../utils/helpers/toFiniteNumber.js';

const STORAGE_KEY = 'ecbyts-validation-profiles';
const ACTIVE_IDS_KEY = 'ecbyts-validation-profile-active-ids';
// KEY-FIRST-001 F3 (SPEC_KEY_FIRST_DATA_LOCALITY §4-F3): o perfil de validação
// é CONFIG DO PROJETO do usuário — a fonte primária é a CHAVE ECBT
// (model.validationProfiles), NÃO o Supabase. O wire de sync com a tabela
// de perfis do caso privado foi REMOVIDO neste item (a tabela fica morta —
// não-destrutivo; perfis PUBLICADOS na Library são catálogo cloud-native e
// seguem na nuvem). O localStorage abaixo é CACHE SYNC p/ o export
// (buildModel é síncrono e o backing IDB é async) — nunca fonte da verdade:
// importar uma chave SUBSTITUI o estado (key-wins, I4).
const CACHE_KEY = 'ecbyts-validation-profiles-cache-v1';

const BUILTIN_FILES = ['./profiles/cetesb-dd256.json', './profiles/conama-420.json'];

/** @type {any[]} */
let _builtins: any = [];
let _builtinsLoaded = false;
/** @type {any[]} */
let _customProfiles: any = [];
let _customLoaded = false;
/** @type {any} */
let _lastValidationResults: any = null;
// Espelho em memória dos IDs ativos (para o export sync da chave); null =
// ainda não carregado nesta sessão.
let _activeIdsCache: string[] | null = null;

function _cacheStorage(): any {
    try {
        return (globalThis as any).localStorage ?? null;
    } catch {
        return null; // node/test sem localStorage — cache simplesmente ausente
    }
}

function _persistCache() {
    const ls = _cacheStorage();
    if (!ls) return;
    try {
        ls.setItem(CACHE_KEY, JSON.stringify({ version: 1, customProfiles: _customProfiles, activeIds: _activeIdsCache ?? [] }));
    } catch (e: any) {
        console.debug('[profileEngine:cache-save]', e?.message || e);
    }
}

function _readCache(): any {
    const ls = _cacheStorage();
    if (!ls) return null;
    try {
        const raw = ls.getItem(CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e: any) {
        console.debug('[profileEngine:cache-load]', e?.message || e);
        return null;
    }
}

/**
 * Lista perfis disponiveis (built-in + custom).
 * / List available validation profiles.
 *
 * @returns {Promise<Array<Object>>}
 */
export async function listValidationProfiles() {
    await _ensureLoaded();
    return [..._builtins, ..._customProfiles].map(_clone);
}

/**
 * Retorna perfil por ID.
 * / Get profile by ID.
 *
 * @param {string} profileId
 * @returns {Promise<Object|null>}
 */
export async function getValidationProfile(profileId: any) {
    await _ensureLoaded();
    const found = [..._builtins, ..._customProfiles].find((p: any) => p.id === profileId);
    return found ? _clone(found) : null;
}

/**
 * Persiste perfil customizado.
 * / Save custom validation profile.
 *
 * @param {Object} profile
 * @returns {Promise<Object>} Perfil salvo
 */
export async function saveCustomProfile(profile: any) {
    await _ensureLoaded();
    const normalized = _normalizeProfile(profile);
    _assertProfile(normalized);

    if (_builtins.some((p: any) => p.id === normalized.id)) {
        throw new Error(`Profile ID collision with builtin: ${normalized.id}`);
    }

    const idx = _customProfiles.findIndex((p: any) => p.id === normalized.id);
    if (idx >= 0) {
        _customProfiles[idx] = normalized;
    } else {
        _customProfiles.push(normalized);
    }

    await idbSet(STORAGE_KEY, _customProfiles);
    _persistCache(); // F3: cache sync p/ a chave (o wire Supabase foi removido)

    return _clone(normalized);
}

/**
 * Remove perfil customizado.
 * / Delete custom profile by ID.
 *
 * @param {string} profileId
 * @returns {Promise<boolean>}
 */
export async function deleteCustomProfile(profileId: any) {
    await _ensureLoaded();
    const before = _customProfiles.length;
    _customProfiles = _customProfiles.filter((p: any) => p.id !== profileId);
    if (_customProfiles.length === before) return false;
    await idbSet(STORAGE_KEY, _customProfiles);
    _persistCache(); // F3: idem delete — sem sync para a nuvem
    return true;
}

/**
 * Define IDs ativos de perfis.
 * / Set active profile IDs.
 *
 * @param {string[]} profileIds
 * @returns {Promise<void>}
 */
export async function setActiveProfileIds(profileIds: any) {
    const ids = Array.isArray(profileIds)
        ? [...new Set(profileIds.map((v) => String(v || '').trim()).filter(Boolean))]
        : [];
    await idbSet(ACTIVE_IDS_KEY, ids);
    _activeIdsCache = ids; // espelho p/ export sync da chave (F3)
    _persistCache();
}

/**
 * Retorna IDs de perfis ativos, com migração legacy localStorage -> IDB.
 * / Get active profile IDs with legacy migration.
 *
 * @returns {Promise<string[]>}
 */
export async function getActiveProfileIds() {
    // F3: o espelho em memória é o estado mais fresco (set/import o mantêm);
    // null = sessão nova, ainda não carregado → lê do IDB
    if (_activeIdsCache !== null) return [..._activeIdsCache];
    const saved = await idbGetWithLegacy(ACTIVE_IDS_KEY);
    const ids = Array.isArray(saved) ? saved.filter((v) => typeof v === 'string') : [];
    _activeIdsCache = ids; // espelho p/ export sync da chave (F3)
    return ids;
}

/**
 * Valida lote de observacoes usando um perfil.
 * / Validate observation batch with selected profile.
 *
 * @param {Array<Object>} observations
 * @param {string|Object} profileRef - ID do perfil ou objeto de perfil
 * @param {Object} [options]
 * @param {boolean} [options.includeWarnings=true]
 * @returns {Promise<{profileId:string,violations:Array<any>,interventionCandidates:Array<any>,summary:Object}>}
 */
export async function validateBatchWithProfile(observations: any, profileRef: any, options: any = {}) {
    const includeWarnings = options.includeWarnings !== false;
    const profile = (await _resolveProfile(profileRef) as any);
    if (!profile) {
        throw new Error('Validation profile not found');
    }

    const rows = Array.isArray(observations) ? observations : [];
    const byParam = _groupByParameter(rows);
    const violations = [];
    const interventionCandidates = [];

    for (const row of rows) {
        const context = _normalizeObservation(row);
        for (const rule of profile.rules || []) {
            const result = (_runRule(rule, context, byParam) as any);
            if (!result) continue;
            if (result.severity === 'warning' && !includeWarnings) continue;

            const violation = {
                profileId: profile.id,
                profileName: profile.name,
                ruleId: rule.ruleId || '',
                ruleType: rule.type,
                severity: result.severity || 'warning',
                message: result.message || '',
                elementId: context.elementId || null,
                observationId: context.id || null,
                campaignId: context.campaignId || null,
                parameterId: context.parameterId || null,
                measuredValue: Number.isFinite(context.value) ? context.value : null,
                thresholdValue: Number.isFinite(result.thresholdValue) ? result.thresholdValue : null,
                unit: result.unit || context.unitId || null,
                metadata: result.metadata || {},
            };

            violations.push(violation);
            if (violation.severity === 'intervention' || violation.severity === 'critical') {
                interventionCandidates.push({
                    ...violation,
                    title: `${context.parameterId || 'parameter'} exceeds threshold`,
                    description: violation.message,
                });
            }
        }
    }

    const summary = _buildSummary(rows.length, violations);
    const payload = {
        profileId: profile.id,
        violations,
        interventionCandidates,
        summary,
    };
    _lastValidationResults = _clone(payload);
    return payload;
}

/**
 * Obtem ultimo resultado de validacao em memoria.
 * / Get latest validation results from memory.
 *
 * @returns {Object|null}
 */
export function getLastValidationResults() {
    return _lastValidationResults ? _clone(_lastValidationResults) : null;
}

async function _ensureLoaded() {
    if (!_builtinsLoaded) {
        _builtins = await _loadBuiltins();
        _builtinsLoaded = true;
    }
    if (!_customLoaded) {
        const stored = await idbGetWithLegacy(STORAGE_KEY);
        _customProfiles = Array.isArray(stored)
            ? stored.map(_normalizeProfile).filter((p: any) => _isProfileValid(p))
            : [];
        _customLoaded = true;
    }
    if (_activeIdsCache === null) {
        // F3: carrega os IDs ativos junto — o export sync da chave precisa do
        // estado completo em memória sem novo await (buildModel é síncrono)
        const saved = await idbGetWithLegacy(ACTIVE_IDS_KEY);
        _activeIdsCache = Array.isArray(saved) ? saved.filter((v) => typeof v === 'string') : [];
    }
    _persistCache(); // mantém o cache sync fresco para o export da chave (F3)
}

async function _loadBuiltins() {
    const profiles = [];
    for (const relPath of BUILTIN_FILES) {
        try {
            const url = new URL(relPath, import.meta.url);
            const res = await fetch(url);
            if (!res.ok) continue;
            const json = await res.json();
            const normalized = _normalizeProfile(json);
            if (_isProfileValid(normalized)) {
                profiles.push(normalized);
            }
        } catch (e) {
            console.debug('[profileEngine] loadProfile:', (e as any)?.message || e);
            // no-op
        }
    }
    return profiles;
}

async function _resolveProfile(/** @type {any} */ profileRef: any) {
    if (profileRef && typeof profileRef === 'object') {
        return _normalizeProfile(profileRef);
    }
    const profileId = String(profileRef || '').trim();
    if (!profileId) return null;
    return getValidationProfile(profileId);
}

function _runRule(/** @type {any} */ rule: any, /** @type {any} */ obs: any, /** @type {any} */ groupedByParam: any) {
    if (!rule || typeof rule !== 'object') return null;
    switch (rule.type) {
        case 'threshold':
            return _runThresholdRule(rule, obs);
        case 'required_field':
            return _runRequiredFieldRule(rule, obs);
        case 'unit_check':
            return _runUnitCheckRule(rule, obs);
        case 'outlier_zscore':
            return _runOutlierZScoreRule(rule, obs, groupedByParam);
        case 'outlier_iqr':
            return _runOutlierIQRRule(rule, obs, groupedByParam);
        default:
            return null;
    }
}

function _runThresholdRule(/** @type {any} */ rule: any, /** @type {any} */ obs: any) {
    if (!Number.isFinite(obs.value)) return null;
    if (rule.parameterId && rule.parameterId !== obs.parameterId) return null;
    if (rule.casNumber && rule.casNumber !== obs.parameter?.casNumber) return null;
    if (rule.matrix && rule.matrix !== obs.matrix) return null;

    const thresholds = Array.isArray(rule.thresholds) ? rule.thresholds : [];
    if (thresholds.length === 0) return null;

    const targetUnit = thresholds[0].unit || obs.unitId;
    const converted = convert(obs.value, obs.unitId, targetUnit);
    if (!converted.success) {
        return {
            severity: 'warning',
            message: 'Unit conversion failed for threshold check',
            unit: obs.unitId,
        };
    }

    const sorted = [...thresholds].sort((a, b) => Number(b.value) - Number(a.value));
    for (const th of sorted) {
        if (!Number.isFinite(th.value)) continue;
        if (converted.value! >= th.value) {
            const severity = th.severity || _severityByType(th.type);
            return {
                severity,
                message: `Exceeded ${String(th.type || 'threshold').toUpperCase()}: ${converted.value!.toFixed(3)} > ${th.value} ${th.unit}`,
                thresholdValue: th.value,
                unit: th.unit || targetUnit,
                metadata: { thresholdType: th.type || 'custom' },
            };
        }
    }
    return null;
}

function _runRequiredFieldRule(/** @type {any} */ rule: any, /** @type {any} */ obs: any) {
    const value = _getByPath(obs, rule.field);
    if (value === null || value === undefined || value === '') {
        return {
            severity: 'warning',
            message: `Required field missing: ${rule.field || '(unknown)'}`,
        };
    }
    return null;
}

function _runUnitCheckRule(/** @type {any} */ rule: any, /** @type {any} */ obs: any) {
    if (rule.parameterId && rule.parameterId !== obs.parameterId) return null;
    const allowed = Array.isArray(rule.allowedUnits) ? rule.allowedUnits : [];
    if (allowed.length === 0) return null;
    if (!allowed.includes(obs.unitId)) {
        return {
            severity: 'warning',
            message: `Unit ${obs.unitId || '(none)'} not allowed. Expected: ${allowed.join(', ')}`,
            unit: obs.unitId,
        };
    }
    return null;
}

function _runOutlierZScoreRule(/** @type {any} */ rule: any, /** @type {any} */ obs: any, /** @type {any} */ groupedByParam: any) {
    if (!Number.isFinite(obs.value) || !obs.parameterId) return null;
    const values = groupedByParam.get(obs.parameterId) || [];
    const stats = calculateStats(values);
    const threshold = toFiniteNumber(rule.threshold, 3);
    const result = detectOutlierZScore(obs.value, stats.mean, stats.stdDev, threshold);
    if (!result) return null;
    return {
        severity: 'warning',
        message: result.message,
        metadata: { method: 'zscore', zscore: result.zscore },
    };
}

function _runOutlierIQRRule(/** @type {any} */ rule: any, /** @type {any} */ obs: any, /** @type {any} */ groupedByParam: any) {
    if (!Number.isFinite(obs.value) || !obs.parameterId) return null;
    const values = groupedByParam.get(obs.parameterId) || [];
    const stats = calculateStats(values);
    const factor = toFiniteNumber(rule.factor, 1.5);
    const result = detectOutlierIQR(obs.value, stats.q1, stats.q3, factor);
    if (!result) return null;
    return {
        severity: 'warning',
        message: result.message,
        metadata: { method: 'iqr', lowerBound: result.lowerBound, upperBound: result.upperBound },
    };
}

function _groupByParameter(/** @type {any[]} */ observations: any) {
    const byParam = new Map();
    for (const row of observations) {
        const obs = _normalizeObservation(row);
        if (!obs.parameterId || !Number.isFinite(obs.value)) continue;
        const arr = byParam.get(obs.parameterId) || [];
        arr.push(obs.value);
        byParam.set(obs.parameterId, arr);
    }
    return byParam;
}

function _normalizeObservation(/** @type {any} */ row: any) {
    const parameterId = row.parameterId || row.parameter?.id || null;
    const fromConfig = parameterId
        ? (CONFIG.PARAMETERS as any[]).find((/** @type {any} */ p: any) => p.id === parameterId)
        : null;
    return {
        id: row.id || row.observationId || null,
        elementId: row.elementId || null,
        campaignId: row.campaignId || null,
        parameterId,
        parameter: row.parameter || fromConfig || null,
        value: Number(row.value),
        unitId: row.unitId || fromConfig?.defaultUnitId || 'none',
        matrix: row.matrix || row.parameter?.matrix || 'groundwater',
    };
}

function _buildSummary(/** @type {number} */ totalObs: any, /** @type {any[]} */ violations: any) {
    /** @type {Record<string, number>} */
    const bySeverity: any = { info: 0, warning: 0, prevention: 0, intervention: 0, critical: 0 };
    for (const v of violations) {
        bySeverity[v.severity] = (bySeverity[v.severity] || 0) + 1;
    }
    return {
        totalObservations: totalObs,
        totalViolations: violations.length,
        bySeverity,
    };
}

function _normalizeProfile(/** @type {any} */ profile: any) {
    const rules = Array.isArray(profile?.rules)
        ? profile.rules.filter((/** @type {any} */ r: any) => r && typeof r === 'object')
        : [];
    return {
        id: String(profile?.id || '').trim(),
        name: String(profile?.name || '').trim(),
        version: String(profile?.version || '1.0').trim(),
        jurisdiction: String(profile?.jurisdiction || '').trim(),
        matrices: Array.isArray(profile?.matrices) ? profile.matrices.map((/** @type {any} */ v: any) => String(v)) : [],
        rules,
    };
}

function _assertProfile(/** @type {any} */ profile: any) {
    if (!_isProfileValid(profile)) {
        throw new Error('Invalid validation profile');
    }
}

function _isProfileValid(/** @type {any} */ profile: any) {
    return !!(profile && profile.id && profile.name && Array.isArray(profile.rules));
}

function _severityByType(/** @type {string} */ type: any) {
    if (type === 'vi' || type === 'cma') return 'intervention';
    if (type === 'vp') return 'prevention';
    if (type === 'vr') return 'warning';
    return 'warning';
}

function _getByPath(/** @type {any} */ obj: any, /** @type {string} */ path: any) {
    if (!path || typeof path !== 'string') return undefined;
    const parts = path.split('.');
    let current = obj;
    for (const key of parts) {
        if (!current || typeof current !== 'object') return undefined;
        current = current[key];
    }
    return current;
}

function _clone(/** @type {any} */ value: any) {
    return JSON.parse(JSON.stringify(value));
}

// ----------------------------------------------------------------
// KEY-FIRST F3: ponte com a chave ECBT (core/io/export.ts + import.ts)
// ----------------------------------------------------------------
/**
 * Seção model.validationProfiles da chave: {version, customProfiles, activeIds}.
 * SYNC (buildModel é síncrono): usa a memória se o engine já carregou; senão
 * o cache localStorage; senão UNDEFINED — export.ts OMITE a seção nesse caso
 * (nunca clobber: exportar sem ter carregado não pode apagar o que a chave
 * anterior guardava). Built-ins NÃO viajam: são do app, não do usuário.
 */
export function exportValidationProfiles() {
    if (_customLoaded) {
        return {
            version: 1,
            customProfiles: _clone(_customProfiles),
            activeIds: _activeIdsCache ? [..._activeIdsCache] : [],
        };
    }
    const cache = _readCache();
    if (cache && Array.isArray(cache.customProfiles)) {
        return {
            version: 1,
            customProfiles: cache.customProfiles,
            activeIds: Array.isArray(cache.activeIds) ? cache.activeIds : [],
        };
    }
    return undefined;
}

/**
 * Import da chave SUBSTITUI o estado local (a chave é a verdade — I1/I4
 * key-wins): regrava IDB + cache. Perfis com colisão de id com built-in são
 * DESCARTADOS (o built-in vence — ele é do app). Tolera payload ausente/
 * malformado (registros ruins são pulados, nunca quebram o import).
 * @param {any} data - model.validationProfiles
 */
export async function importValidationProfiles(data: any) {
    if (!_builtinsLoaded) {
        _builtins = await _loadBuiltins();
        _builtinsLoaded = true;
    }
    const list = Array.isArray(data?.customProfiles) ? data.customProfiles : [];
    const cleaned = [];
    for (const raw of list) {
        try {
            const normalized = _normalizeProfile(raw);
            if (!_isProfileValid(normalized)) continue;
            if (_builtins.some((b: any) => b.id === normalized.id)) continue; // built-in vence
            cleaned.push(normalized);
        } catch (e: any) {
            console.debug('[profileEngine:import-profile]', e?.message || e);
        }
    }
    _customProfiles = cleaned;
    _customLoaded = true;
    await idbSet(STORAGE_KEY, _customProfiles);
    if (Array.isArray(data?.activeIds)) {
        _activeIdsCache = [...new Set<string>(data.activeIds.filter((v: any) => typeof v === 'string' && v.trim()))];
        await idbSet(ACTIVE_IDS_KEY, _activeIdsCache);
    }
    _persistCache();
}

/** Teste/higiene: esvazia estado em memória + cache (não usado em produção;
 *  o IDB fica a cargo do teste via fake-idb). */
export function _resetValidationProfilesForTests() {
    _customProfiles = [];
    _customLoaded = false;
    _activeIdsCache = null;
    _lastValidationResults = null;
    const ls = _cacheStorage();
    if (ls) {
        try {
            ls.removeItem(CACHE_KEY);
        } catch (e: any) {
            console.debug('[profileEngine:reset-cache]', e?.message || e);
        }
    }
}
