// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   PIPELINES / EXECUTOR — Runner async de automações
   Executa PipelineDefinitions nó a nó, emitindo eventos via eventBus.

   Modelo de segurança:
   - _executeAction() usa APENAS _actionRegistry (Map de allowlist)
     NUNCA usa window[name] — impede code injection via XML malicioso
   - _executeCondition() usa APENAS ALLOWED_PATHS — sem eval/Function()
   - _executeApiCall() usa fetch com AbortController e timeout cap 120s

   Limitação conhecida (Fase 1): executor é client-side.
   Tab fechada durante execução = run perdido. Ver ADR.md.
   ================================================================ */

import * as _schemaMod from './schema.js';
const NODE_TYPES = /** @type {any} */ (_schemaMod).NODE_TYPES;
const ALLOWED_PATHS = /** @type {any} */ (_schemaMod).ALLOWED_PATHS;
const createRunId = /** @type {any} */ (_schemaMod).createRunId;
import { saveRunLog } from './registry.js';
import { ANALYTICS_EVENTS, emitAnalyticsEvent } from '../events/analyticsEventBus.js';
import {
    nextNodeId as _nextNodeIdPure,
    interpolatePrevParams as _interpolatePrevParams,
    evaluateConditionOp as _evaluateConditionOp,
} from './_executorPure.js';
import { getHeadlessMeta } from '../../utils/api/registry.js';
import { safeJsonParse } from '../../utils/helpers/safeJsonParse.js';

// ----------------------------------------------------------------
// ACTION REGISTRY - allowlist de ações permitidas
// ----------------------------------------------------------------

/**
 * Map de ações permitidas: name → função.
 * Populado externamente via registerPipelineAction().
 * NUNCA usar window[] diretamente.
 * @type {Map<string, Function>}
 */
const _actionRegistry = new Map();

/**
 * Registra uma ação como permitida para execução em pipelines.
 * Deve ser chamado no init (handlers/index.js).
 *
 * @param {string} name - Nome da ação (ex: 'generateRandomModel')
 * @param {Function} fn - Função a executar
 */
export function registerPipelineAction(name: any, fn: any) {
    if (typeof fn !== 'function') {
        console.warn(`[pipelines/executor] Tentativa de registrar não-função para "${name}"`);
        return;
    }
    _actionRegistry.set(name, fn);
}

/**
 * Retorna todos os nomes de ações registradas.
 * Usado pelo editor para popular o dropdown de ações.
 * @returns {string[]}
 */
export function getRegisteredActions() {
    return [..._actionRegistry.keys()].sort();
}

// ----------------------------------------------------------------
// CONTROLE DE ABORT
// ----------------------------------------------------------------

/** @type {Set<string>} runIds marcados para abort */
const _abortFlags = new Set();

/**
 * Marca um run para ser interrompido na próxima oportunidade.
 * @param {string} runId
 */
export function abortRun(runId: any) {
    _abortFlags.add(runId);
}

// ----------------------------------------------------------------
// CRIAÇÃO DE RUN
// ----------------------------------------------------------------

/**
 * Cria objeto PipelineRun inicial.
 * @param {string} pipelineId
 * @returns {any} PipelineRun
 */
export function createRun(pipelineId: any) {
    return {
        runId: createRunId(),
        pipelineId: pipelineId || '',
        status: 'running',
        currentNodeId: null,
        log: [],
        error: null,
        startedAt: Date.now(),
        endedAt: null,
    };
}

// ----------------------------------------------------------------
// EXECUTOR PRINCIPAL
// ----------------------------------------------------------------

/**
 * Executa um pipeline completo.
 * Caminha pelos nós via edges (sequencial + condicional).
 * Emite eventos PIPELINE_* via eventBus.
 *
 * @param {any} def - Pipeline parsed
 * @param {Object} [options]
 * @param {Function} [options.onProgress] - Callback (run) chamado a cada nó
 * @param {Function} [options.onLog] - Callback (logEntry) para log em tempo real
 * @param {Object} [options.appCtx] - Contexto da app: { elements, campaigns, scenes }
 * @returns {Promise<Object>} PipelineRun finalizado
 */
export async function runPipeline(def: any, options: any = {}) {
    const { onProgress, onLog, appCtx = {} } = options;

    if (!def || !def.startNodeId) {
        throw new Error('Pipeline inválido: sem startNodeId');
    }

    const run: any = createRun(def.pipelineId || '');
    const nodeMap = new Map(def.nodes.map((/** @type {any} */ n: any) => [n.id, n]));

    void emitAnalyticsEvent(ANALYTICS_EVENTS.PIPELINE_STARTED, { runId: run.runId, pipelineId: run.pipelineId });

    /** @type {any} */
    let currentNodeId = def.startNodeId;
    let prevResult = null; // $prev.* chaining (P2)

    try {
        while (currentNodeId) {
            // Verificar abort
            if (_abortFlags.has(run.runId)) {
                _abortFlags.delete(run.runId);
                run.status = 'aborted';
                break;
            }

            const node = nodeMap.get(currentNodeId) as any;
            if (!node) break;

            // Ignorar EndEvent (sem type mapeado)
            if (!node.type) {
                currentNodeId = _nextNode(currentNodeId, def.edges, null);
                continue;
            }

            run.currentNodeId = currentNodeId;
            const logEntry: any = { nodeId: currentNodeId, status: 'running', ts: Date.now(), result: null, error: null };
            run.log.push(logEntry);

            void emitAnalyticsEvent(ANALYTICS_EVENTS.PIPELINE_NODE_STARTED, { runId: run.runId, nodeId: currentNodeId });
            if (onProgress) onProgress(run);
            if (onLog) onLog(logEntry);

            let result = null;
            let branch = null;

            try {
                result = await executeNode(node, run, appCtx, prevResult, def);
                // Track prevResult for $prev.* chaining
                if ((result as any)?.result !== undefined) prevResult = (result as any).result;
                else if (result && !(result as any).aborted) prevResult = result;
                // Delay pode retornar aborted:true se a flag foi detectada dentro dele
                if ((result as any)?.aborted) {
                    run.status = 'aborted';
                    run.endedAt = Date.now();
                    if (onProgress) onProgress(run);
                    _abortFlags.delete(run.runId);
                    saveRunLog(run);
                    return run;
                }
                if (node.type === NODE_TYPES.CONDITION) {
                    branch = (result as any)?.branch ?? null;
                }
                logEntry.status = 'completed';
                logEntry.result = result;
            } catch (nodeErr) {
                logEntry.status = 'failed';
                logEntry.error = /** @type {any} */ (nodeErr as any).message;
                run.status = 'failed';
                run.error = `Erro no nó "${node.label || node.id}": ${/** @type {any} */ (nodeErr as any).message}`;
                void emitAnalyticsEvent(ANALYTICS_EVENTS.PIPELINE_FAILED, { runId: run.runId, nodeId: currentNodeId, error: run.error });
                break;
            }

            void emitAnalyticsEvent(ANALYTICS_EVENTS.PIPELINE_NODE_COMPLETED, { runId: run.runId, nodeId: currentNodeId, result });
            if (onLog) onLog({ ...logEntry });

            currentNodeId = _nextNode(currentNodeId, def.edges, branch);
        }

        if (run.status === 'running') {
            run.status = 'completed';
            void emitAnalyticsEvent(ANALYTICS_EVENTS.PIPELINE_COMPLETED, { runId: run.runId, pipelineId: run.pipelineId });
        }
    } catch (err) {
        run.status = 'failed';
        run.error = /** @type {any} */ (err as any).message;
        void emitAnalyticsEvent(ANALYTICS_EVENTS.PIPELINE_FAILED, { runId: run.runId, error: /** @type {any} */ (err as any).message });
    }

    run.endedAt = Date.now();
    if (onProgress) onProgress(run);
    saveRunLog(run);
    _abortFlags.delete(run.runId);

    return run;
}

/**
 * Determina o próximo nó a partir de um nó corrente e das edges.
 * Se branch !== null, filtra edges com edge.branch === branch.
 *
 * @param {string} fromId - Nó atual
 * @param {any[]} edges
 * @param {string|null} branch - 'true', 'false', ou null
 * @returns {string|null} ID do próximo nó, ou null se fim
 */
function _nextNode(fromId: any, edges: any, branch: any) {
    return _nextNodeIdPure(fromId, edges, branch);
}

// ----------------------------------------------------------------
// EXECUÇÃO DE NÓ INDIVIDUAL
// ----------------------------------------------------------------

/**
 * Executa um nó individual. Dispatch por node.type.
 * Exportado para uso nos testes.
 *
 * @param {any} node
 * @param {Object} run - PipelineRun corrente
 * @param {Object} appCtx - { elements, campaigns, scenes }
 * @returns {Promise<any>} Resultado da execução
 */
export async function executeNode(node: any, run: any, appCtx: any = {}, prevResult: any = null, def: any = {}) {
    switch (node.type) {
        case NODE_TYPES.TRIGGER:
            return _executeTrigger(node);
        case NODE_TYPES.ACTION:
            return _executeAction(node, appCtx, prevResult, def);
        case NODE_TYPES.CONDITION:
            return _executeCondition(node, appCtx);
        case NODE_TYPES.DELAY:
            return _executeDelay(node, run);
        case NODE_TYPES.API_CALL:
            return _executeApiCall(node);
        case 'end':
            return { end: true }; // nó terminal BPMN endEvent
        default:
            throw new Error(`Tipo de nó desconhecido: "${node.type}"`);
    }
}

// ----------------------------------------------------------------
// EXECUTORES POR TIPO
// ----------------------------------------------------------------

/**
 * Trigger - resolves imediatamente (manual).
 * @param {any} node
 */
async function _executeTrigger(node: any) {
    // triggerType 'manual' → no-op; 'eventBus' → já disparado externamente
    return { triggerType: node.config?.triggerType || 'manual' };
}

/**
 * Action - usa allowlist _actionRegistry. NUNCA window[].
 * P2: Suporta modo headless, guard destrutivo, e $prev.* chaining.
 *
 * @param {any} node
 * @param {Object} appCtx - { elements, campaigns, scenes }
 * @param {any} prevResult - Resultado do nó anterior (para $prev.*)
 * @param {Object} def - Pipeline definition (para allowDestructive flag)
 */
async function _executeAction(node: any, appCtx: any = {}, prevResult: any = null, /** @type {any} */ def: any = {}) {
    const actionName = node.config?.action;
    if (!actionName) throw new Error('Nó action sem campo "action" configurado');

    const fn = _actionRegistry.get(actionName);
    if (!fn) {
        throw new Error(`Action not allowed: "${actionName}". Registre via registerPipelineAction().`);
    }

    // --- P2: Headless metadata check ---
    const meta = getHeadlessMeta(actionName);

    // RED-C2: Destructive guard - block unless pipeline has allowDestructive
    if (meta?.destructive && !def.allowDestructive) {
        console.warn(`[pipelines/executor] BLOCKED: destructive action "${actionName}" requires allowDestructive flag`);
        return { action: actionName, error: 'destructive_blocked' };
    }

    const rawParams = node.config?.params || {};
    const hasParams = Object.keys(rawParams).length > 0;

    if (!hasParams) {
        // No params configured - fall through to original UI behavior
        const result = await fn();
        return { action: actionName, result };
    }

    // --- $prev.* interpolation (extraído _interpolatePrevParams) ---
    const params: Record<string, any> = _interpolatePrevParams(rawParams, prevResult);

    // --- Headless execution ---
    params._headless = true;
    params._appCtx = appCtx;

    try {
        const result = await fn(params);
        return { action: actionName, result };
    } catch (err) {
        console.error(`[pipelines/executor] Action error: ${actionName} —`, /** @type {any} */ (err as any).message);
        return { action: actionName, error: /** @type {any} */ (err as any).message };
    }
}

/**
 * Condition - ALLOWED_PATHS + operator switch. Sem eval.
 * @param {any} node
 * @param {Object} appCtx
 * @returns {Promise<{branch: string}>} branch: 'true' ou 'false'
 */
async function _executeCondition(node: any, appCtx: any) {
    const { subject, operator, value } = node.config || {};

    if (!subject) throw new Error('Condition sem "subject" configurado');
    if (!operator) throw new Error('Condition sem "operator" configurado');

    const resolver = ALLOWED_PATHS[subject];
    if (!resolver) {
        throw new Error(`Condition subject não permitido: "${subject}"`);
    }

    const leftVal = resolver(appCtx);
    const rightVal = Number(value);

    const result = _evaluateConditionOp(operator, leftVal, rightVal);
    return /** @type {any} */ ({ branch: result ? 'true' : 'false', leftVal, rightVal });
}

/**
 * Delay - aguarda N ms (setTimeout promisificado).
 * @param {any} node
 */
async function _executeDelay(node: any, /** @type {any} */ run: any) {
    const ms = Math.max(0, Math.min(Number(node.config?.ms || 0), 300000)); // cap 5min
    const TICK = 50; // checar abort a cada 50ms
    let elapsed = 0;
    while (elapsed < ms) {
        if (run && _abortFlags.has(run.runId)) {
            // Não deletar a flag aqui - o loop principal de runPipeline a consome
            return { delayed: elapsed, aborted: true };
        }
        await new Promise((resolve) => setTimeout(resolve, Math.min(TICK, ms - elapsed)));
        elapsed += TICK;
    }
    return { delayed: elapsed };
}

/**
 * API Call - fetch com AbortController e timeout configurável.
 * Timeout default: 30s, cap: 120s.
 * @param {any} node
 */
async function _executeApiCall(node: any) {
    const { url, method = 'GET', body, timeoutMs } = node.config || {};
    if (!url) throw new Error('Nó api_call sem "url" configurado');

    const timeout = Math.min(Number(timeoutMs || 30000), 120000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
        /** @type {any} */
        const opts: any = {
            method: (method || 'GET').toUpperCase(),
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
        };
        if (body && opts.method !== 'GET') {
            opts.body = typeof body === 'string' ? body : JSON.stringify(body);
        }

        const resp = await fetch(url, opts);
        const text = await resp.text();

        const data = safeJsonParse(text, text);

        return { status: resp.status, ok: resp.ok, data };
    } finally {
        clearTimeout(timer);
    }
}
