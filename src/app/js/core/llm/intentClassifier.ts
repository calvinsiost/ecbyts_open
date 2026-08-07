// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   API INTENT CLASSIFIER (v1)
   ================================================================

   Canonical intent contract for API execution:
   - understood
   - action
   - params
   - confidence (0..1)
   - ambiguities[]
   - requires_confirmation
   - confirmation_message
   - reasoning_tags[]

   This module keeps model output lightweight and enforces deterministic
   runtime checks before any side-effectful execution.
   ================================================================ */
import { parseResponse, validateActionParams, resolveElementReference, resolveCampaignReference, resolveParameterReference, resolveUnitReference, } from './parser.js';
import { getLlmActionMap, getHeadlessMeta, LLM_CATEGORY_TIERS } from '../../utils/api/registry.js';
import { toFiniteNumber } from '../../utils/helpers/toFiniteNumber.js';
export const INTENT_MIN_CONFIDENCE = 0.75;
/* ----------------------------------------------------------------
   HEURISTIC INTENT FALLBACK (Mobile / Offline / Small-Model Guard)
   ----------------------------------------------------------------
   Classificador deterministico que mapeia texto do usuario para
   acoes canonicas sem depender de LLM. Usado como:
   1. Fallback quando modelo local retorna lixo (JSON parse rate = 0%)
   2. Complemento de normalizacao (zoom_out → ZOOM_OUT)
   3. Camada zero-latencia para dispositivos moveis sem GPU

   O mapa e construido a partir do registry real, gerando aliases
   automaticos (snake_case, lowercase, sem underscores, abreviacoes).
   ---------------------------------------------------------------- */
let _heuristicMap: any = null;
/**
 * Constroi mapa heuristico: variantes de texto → action SCREAMING_SNAKE.
 * Gerado uma vez a partir do ACTION_REGISTRY real.
 * @returns {Map<string, string>}
 */
function getHeuristicMap() {
    if (_heuristicMap)
        return _heuristicMap;
    _heuristicMap = new Map();
    const actionMap = getLlmActionMap();
    for (const [llmAction] of actionMap.entries()) {
        // ZOOM_OUT → zoom_out, zoom out, zoomout, zoom-out
        const lower = llmAction.toLowerCase();
        const variants = [
            [lower, llmAction], // zoom_out
            [lower.replace(/_/g, ' '), llmAction], // zoom out
            [lower.replace(/_/g, ''), llmAction], // zoomout
            [lower.replace(/_/g, '-'), llmAction], // zoom-out
            [llmAction, llmAction], // ZOOM_OUT
        ];
        for (const [key, val] of variants) {
            if (_heuristicMap.has(key) && _heuristicMap.get(key) !== val) {
                console.warn(`[intentClassifier] heuristic collision: "${key}" maps to both "${_heuristicMap.get(key)}" and "${val}"`);
            }
            _heuristicMap.set(key, val);
        }
    }
    return _heuristicMap;
}
/**
 * Tenta classificar intent via heuristica pura (sem LLM).
 * Procura a action mais longa que aparece no texto do usuario.
 * @param {string} userText
 * @returns {{ action: string, confidence: number } | null}
 */
export function heuristicClassify(userText: any) {
    if (!userText)
        return null;
    const text = userText.toLowerCase().trim();
    const map = getHeuristicMap();
    let bestAction = null;
    let bestLen = 0;
    for (const [pattern, action] of map.entries()) {
        if (pattern.length <= bestLen)
            continue;
        // Word-boundary para patterns curtos (evita "add" em "address", "set" em "reset")
        if (pattern.length < 6) {
            const re = new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
            if (!re.test(text))
                continue;
        }
        else if (!text.includes(pattern)) {
            continue;
        }
        bestAction = action;
        bestLen = pattern.length;
    }
    if (!bestAction)
        return null;
    // Confianca baseada em cobertura: quanto do texto e a action?
    const coverage = bestLen / text.length;
    const confidence = Math.min(0.85, 0.45 + coverage * 0.4);
    return { action: bestAction, confidence };
}
/**
 * Normaliza action de modelo local para SCREAMING_SNAKE canonico.
 * Converte zoom_out, open_export_modal, etc. para o action correto.
 * @param {string} rawAction - Action como retornada pelo modelo
 * @returns {string|null} Action SCREAMING_SNAKE ou null se nao encontrada
 */
export function normalizeActionName(rawAction: any) {
    if (!rawAction)
        return null;
    const map = getHeuristicMap();
    const lower = rawAction.toLowerCase();
    // Direct lookup (covers snake, spaced, joined, dashed variants)
    const direct = map.get(lower) || map.get(rawAction);
    if (direct)
        return direct;
    // camelCase → SCREAMING_SNAKE (zoomOut → zoom_out → ZOOM_OUT)
    const fromCamel = lower.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
    const camelResult = map.get(fromCamel);
    if (camelResult)
        return camelResult;
    // Strip handle prefix (handleZoomOut → zoomout)
    const stripped = lower.startsWith('handle') ? lower.slice(6) : null;
    if (stripped) {
        const strippedResult = map.get(stripped);
        if (strippedResult)
            return strippedResult;
        // handleZoomOut → zoom_out via camel split
        const strippedCamel = stripped.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
        const strippedCamelResult = map.get(strippedCamel);
        if (strippedCamelResult)
            return strippedCamelResult;
    }
    return null;
}
const PARAM_ALIASES = {
    element: 'elementId',
    element_id: 'elementId',
    campaign: 'campaignId',
    campaign_id: 'campaignId',
    parameter: 'parameterId',
    parameter_id: 'parameterId',
    unit: 'unitId',
    unit_id: 'unitId',
    index: 'observationIndex',
    obsindex: 'observationIndex',
    obs_index: 'observationIndex',
    reading: 'readingIndex',
    reading_index: 'readingIndex',
    point: 'elementId',
    well: 'elementId',
    campaign_name: 'campaignId',
    campaign_ref: 'campaignId',
};
function clamp01(v: any) {
    const n = Number(v);
    if (!Number.isFinite(n))
        return 0;
    if (n < 0)
        return 0;
    if (n > 1)
        return 1;
    return n;
}
function getCategoryTier(category: unknown) {
    const tierMap = (LLM_CATEGORY_TIERS) as Record<string, number>;
    return tierMap[String(category)] || 3;
}
function getAllowedTierActionMap(maxTier = 2) {
    const full = getLlmActionMap();
    const filtered = new Map();
    for (const [llmAction, entry] of full.entries()) {
        const tier = getCategoryTier(entry.cat);
        if (tier <= maxTier) {
            filtered.set(llmAction, entry);
        }
    }
    return filtered;
}
function splitRegistryParams(params: any[] = []) {
    const required = [];
    const optional = [];
    for (const p of params) {
        if (p.endsWith('?'))
            optional.push(p.slice(0, -1));
        else
            required.push(p);
    }
    return { required, optional };
}
export function getTierActionCatalog(maxTier = 2) {
    const out = [];
    const actionMap = getAllowedTierActionMap(maxTier);
    for (const [action, entry] of actionMap.entries()) {
        const { required, optional } = splitRegistryParams(entry.params || []);
        const meta = getHeadlessMeta(entry.name) || {};
        out.push({
            action,
            handler: entry.name,
            category: entry.cat,
            tier: getCategoryTier(entry.cat),
            requiredParams: required,
            optionalParams: optional,
            destructive: !!meta.destructive,
        });
    }
    return out;
}
function normalizeParams(params: any = {}) {
    /** @type {Record<string, any>} */
    const out: any = {};
    for (const [k, v] of Object.entries(params || {}) as [string, any][]) {
        const key = String((PARAM_ALIASES as any)[k] || k);
        if (typeof v === 'string') {
            const trimmed = v.trim();
            // Numeric coercion for common scalar params.
            if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
                out[key] = Number(trimmed);
            }
            else if (trimmed === 'true') {
                out[key] = true;
            }
            else if (trimmed === 'false') {
                out[key] = false;
            }
            else {
                out[key] = trimmed;
            }
        }
        else {
            out[key] = v;
        }
    }
    return out;
}
function extractElementHint(text = '') {
    const t = String(text);
    const direct = t.match(/\b([A-Z]{1,4}-\d{1,3})\b/i);
    if (direct)
        return direct[1];
    const point = t.match(/\b(?:ponto|poco|po[oç]o|well)\s+(\d{1,3})\b/i);
    if (point)
        return `PM-${point[1]}`;
    return null;
}
function extractCampaignHint(text = '') {
    const t = String(text);
    const direct = t.match(/\b(?:campanha|campaign)\s*[- ]?(\d{1,3})\b/i);
    if (direct)
        return `campaign-${direct[1]}`;
    const month = t.match(/\b(janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/i);
    if (month)
        return month[1];
    return null;
}
function applyFamilyNormalizers(action: any, params: any, userText = '') {
    const normalized = { ...(params || {}) };
    const text = String(userText || '');
    const maybeSetElement = () => {
        if (normalized.elementId)
            return;
        const hint = extractElementHint(text);
        if (!hint)
            return;
        const element = resolveElementReference(hint);
        normalized.elementId = element?.id || hint;
    };
    const maybeSetCampaign = () => {
        if (normalized.campaignId)
            return;
        const hint = extractCampaignHint(text);
        if (!hint)
            return;
        const campaign = resolveCampaignReference(hint);
        normalized.campaignId = campaign?.id || hint;
    };
    const maybeSetParameter = () => {
        if (!normalized.parameterId && text) {
            const p = resolveParameterReference(text);
            if (p)
                normalized.parameterId = p.id;
        }
        if (normalized.parameterId) {
            const p = resolveParameterReference(normalized.parameterId);
            if (p)
                normalized.parameterId = p.id;
        }
    };
    const maybeSetUnit = () => {
        if (!normalized.unitId)
            return;
        const unit = resolveUnitReference(normalized.unitId);
        if (unit)
            normalized.unitId = unit.id;
    };
    const observationActions = new Set([
        'ADD_OBSERVATION',
        'OBSERVATION_CHANGE',
        'REMOVE_OBSERVATION',
        'OBSERVATION_PARAMETER_CHANGE',
        'READING_CHANGE',
    ]);
    const elementActions = new Set([
        'ADD_ELEMENT',
        'REMOVE_ELEMENT',
        'SELECT_ELEMENT',
        'TOGGLE_VISIBILITY',
        'ELEMENT_FIELD_CHANGE',
        'ELEMENT_TRANSFORM',
    ]);
    const campaignActions = new Set(['CAMPAIGN_CHANGE', 'REMOVE_CAMPAIGN', 'CAMPAIGN_VISIBILITY']);
    const sensorActions = new Set([
        'FETCH_SENSOR_DATA',
        'SET_SENSOR_API_KEY',
        'SENSOR_FIELD_CHANGE',
        'SENSOR_PARAMETER_TOGGLE',
        'SENSOR_TO_OBSERVATION',
        'SENSOR_ENDPOINT_CHANGE',
        'SENSOR_PROFILE_CHANGE',
        'SENSOR_EVAL_CHANGE',
        'FETCH_SENSOR_DATA_SILENT',
        'TOGGLE_AUTO_REFRESH',
        'AUTO_REFRESH_INTERVAL_CHANGE',
    ]);
    const governanceActions = new Set([
        'EDIT_CONTRACT',
        'REMOVE_CONTRACT',
        'ADD_CONTRACT_PARTY',
        'REMOVE_CONTRACT_PARTY',
        'UPDATE_CONTRACT_PARTY',
        'ADD_DISBURSEMENT',
        'LINK_ELEMENT_TO_CONTRACT',
        'UNLINK_ELEMENT_FROM_CONTRACT',
        'FILE_INSURANCE_CLAIM',
    ]);
    if (observationActions.has(action)) {
        maybeSetElement();
        maybeSetCampaign();
        maybeSetParameter();
        maybeSetUnit();
        if (normalized.index !== undefined && normalized.observationIndex === undefined) {
            normalized.observationIndex = normalized.index;
        }
        if (normalized.obsIndex !== undefined && normalized.observationIndex === undefined) {
            normalized.observationIndex = normalized.obsIndex;
        }
    }
    if (elementActions.has(action)) {
        maybeSetElement();
    }
    if (campaignActions.has(action)) {
        maybeSetCampaign();
    }
    if (sensorActions.has(action)) {
        maybeSetElement();
    }
    if (governanceActions.has(action)) {
        maybeSetElement();
        maybeSetCampaign();
    }
    return normalized;
}
function buildClarificationMessage(action: any, ambiguities: any, fallback = '') {
    if (ambiguities.length > 0) {
        return `Preciso confirmar antes de executar ${action}: ${ambiguities.join('; ')}`;
    }
    if (fallback)
        return fallback;
    return `Pode confirmar a acao ${action}?`;
}
function deriveConfidence({
    parsedSuccess,
    understood,
    hasAction,
    validationErrors,
    ambiguities,
    destructive,
}: any) {
    let c = 0.15;
    if (parsedSuccess)
        c += 0.35;
    if (understood)
        c += 0.25;
    if (hasAction)
        c += 0.2;
    c -= Math.min(validationErrors.length, 3) * 0.18;
    c -= Math.min(ambiguities.length, 3) * 0.12;
    // Destructive actions require stricter confidence by design.
    if (destructive)
        c -= 0.05;
    return clamp01(c);
}
/**
 * Classifies user text + model response into canonical intent output.
 * @param {string} userText
 * @param {{ llmContent?: string, maxTier?: number }} [context]
 */
export function classifyApiIntent(userText: string, context: { llmContent?: string; maxTier?: number } = {}) {
    const llmContent = context.llmContent || '';
    const maxTier = toFiniteNumber(context.maxTier, 2);
    const allowedMap = getAllowedTierActionMap(maxTier);
    const parsed = parseResponse(llmContent);
    if (!parsed.success) {
        // Fallback heuristico: tenta classificar direto do texto do usuario
        // quando o modelo local retorna lixo (comum em modelos < 1B ou degenerados).
        const heuristic = heuristicClassify(userText);
        if (heuristic && heuristic.confidence >= INTENT_MIN_CONFIDENCE && allowedMap.has(heuristic.action)) {
            const hParams = applyFamilyNormalizers(heuristic.action, normalizeParams({}), userText);
            const hValidation = validateActionParams(heuristic.action, hParams);
            const _hDestructive = !!getHeadlessMeta(allowedMap.get(heuristic.action).name)?.destructive;
            return {
                understood: true,
                action: heuristic.action,
                params: hValidation.valid ? hValidation.resolvedParams : hParams,
                confidence: heuristic.confidence,
                ambiguities: hValidation.errors || [],
                requires_confirmation: true, // Heuristica sempre pede confirmacao
                confirmation_message: `Entendi como ${heuristic.action}. Confirma?`,
                reasoning_tags: ['heuristic_fallback', 'llm_parse_failed'],
                user_text: userText,
            };
        }
        return {
            understood: false,
            action: null,
            params: {},
            confidence: 0.1,
            ambiguities: ['Resposta do modelo nao parseavel em JSON canonico'],
            requires_confirmation: true,
            confirmation_message: parsed.data?.confirmation ||
                parsed.error ||
                'Nao consegui interpretar o pedido. Pode reformular em uma frase objetiva?',
            reasoning_tags: ['parse_failed'],
            user_text: userText,
        };
    }
    const data = parsed.data || {};
    // Normaliza action: aceita zoom_out, open-export-modal, etc. e converte para SCREAMING_SNAKE
    const rawAction = data.action || null;
    const action = rawAction ? normalizeActionName(rawAction) || rawAction : null;
    const params = applyFamilyNormalizers(action, normalizeParams(data.params || {}), userText);
    const ambiguities = Array.isArray(data.ambiguities) ? [...data.ambiguities] : [];
    const allowedEntry = action ? allowedMap.get(action) : null;
    if (action && !allowedEntry) {
        ambiguities.push(`Acao ${action} fora do escopo Tier 1/2`);
    }
    const preValidation = action ? validateActionParams(action, params) : { valid: false, errors: [] };
    if (!preValidation.valid) {
        ambiguities.push(...preValidation.errors);
    }
    const destructive = !!(allowedEntry && getHeadlessMeta(allowedEntry.name)?.destructive);
    const confidence = deriveConfidence({
        parsedSuccess: parsed.success,
        understood: !!data.understood,
        hasAction: !!action,
        validationErrors: preValidation.errors || [],
        ambiguities,
        destructive,
    });
    const requiresConfirmation = !data.understood ||
        !action ||
        !allowedEntry ||
        ambiguities.length > 0 ||
        confidence < INTENT_MIN_CONFIDENCE ||
        destructive;
    return {
        understood: !!data.understood && !!action && !!allowedEntry,
        action: action && allowedEntry ? action : null,
        params: preValidation.valid ? (preValidation as any).resolvedParams : params,
        confidence,
        ambiguities,
        requires_confirmation: requiresConfirmation,
        confirmation_message: buildClarificationMessage(action || 'acao', ambiguities, data.confirmation || 'Pode confirmar essa acao?'),
        reasoning_tags: [
            'canonical_intent_v1',
            'tier12_scope',
            destructive ? 'destructive_action' : 'non_destructive_action',
            parsed.success ? 'parsed_json' : 'parse_fallback',
        ],
        user_text: userText,
    };
}
/**
 * Deterministic validation and normalization layer before execution.
 * @param {any} decision - Canonical decision from classifyApiIntent()
 * @param {any} [runtimeState]
 * @returns {any} ExecutableDecision | NeedsConfirmation
 */
export function validateAndNormalizeIntent(decision: any, runtimeState: { maxTier?: number } = {}) {
    const maxTier = toFiniteNumber(runtimeState.maxTier, 2);
    const allowedMap = getAllowedTierActionMap(maxTier);
    if (!decision || !decision.action) {
        return {
            type: 'needs_confirmation',
            understood: false,
            action: null,
            params: {},
            confidence: clamp01(decision?.confidence),
            ambiguities: decision?.ambiguities || ['Nenhuma acao inferida'],
            message: decision?.confirmation_message || 'Nao consegui mapear para uma acao valida. Pode detalhar melhor?',
            requires_confirmation: true,
            can_confirm_execute: false,
        };
    }
    const entry = allowedMap.get(decision.action);
    if (!entry) {
        return {
            type: 'needs_confirmation',
            understood: false,
            action: null,
            params: {},
            confidence: clamp01(decision.confidence),
            ambiguities: [...(decision.ambiguities || []), `Acao ${decision.action} fora do Tier 1/2`],
            message: `Nao posso executar ${decision.action} neste escopo (Tier 1/2).`,
            requires_confirmation: true,
            can_confirm_execute: false,
        };
    }
    const normalized = applyFamilyNormalizers(decision.action, normalizeParams(decision.params || {}), decision.user_text);
    const validation = validateActionParams(decision.action, normalized);
    const destructive = !!getHeadlessMeta(entry.name)?.destructive;
    const confidence = clamp01(decision.confidence);
    const mergedAmbiguities = [...(decision.ambiguities || []), ...(validation.errors || [])];
    // Clarification path: do not enqueue pending execution.
    if (!validation.valid || mergedAmbiguities.length > 0 || confidence < INTENT_MIN_CONFIDENCE) {
        return {
            type: 'needs_confirmation',
            understood: false,
            action: decision.action,
            params: normalized,
            confidence,
            ambiguities: mergedAmbiguities,
            message: buildClarificationMessage(decision.action, mergedAmbiguities, decision.confirmation_message || 'Preciso confirmar alguns pontos.'),
            requires_confirmation: true,
            can_confirm_execute: false,
        };
    }
    if (destructive || decision.requires_confirmation) {
        return {
            type: 'confirmable',
            understood: true,
            action: decision.action,
            params: { ...validation.resolvedParams },
            confidence,
            ambiguities: [],
            message: decision.confirmation_message || `Confirmar execucao de ${decision.action}?`,
            requires_confirmation: true,
            can_confirm_execute: true,
            destructive,
        };
    }
    return {
        type: 'executable',
        understood: true,
        action: decision.action,
        params: { ...validation.resolvedParams },
        confidence,
        ambiguities: [],
        message: decision.confirmation_message || `${decision.action} pronto para executar`,
        requires_confirmation: false,
        can_confirm_execute: false,
        destructive: false,
    };
}
