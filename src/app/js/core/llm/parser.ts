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
   PARSER DE RESPOSTAS - Interpreta JSON do LLM
   ================================================================

   Este módulo parse as respostas do LLM e valida os comandos
   antes de enviá-los para execução.

   FUNÇÕES:
   - Extrair JSON de texto misto
   - Validar estrutura da resposta
   - Resolver referências (ponto 3 → well-3)

   ================================================================ */
import { getAllElements } from '../elements/manager.js';
import { getAllCampaigns } from '../campaigns/manager.js';
import { CONFIG } from '../../config.js';
import { getLlmActionMap } from '../../utils/api/registry.js';
/**
 * @typedef {Record<string, any>} ParsedLLMResponse
 * @typedef {Record<string, any>} LLMActionParams
 */
// ================================================================
// AÇÕES VÁLIDAS
// ================================================================
/**
 * Acoes com handlers custom no commandExecutor (logica complexa).
 * Estas tem prioridade sobre o dispatch dinamico do registry.
 */
export const CUSTOM_ACTIONS = new Set([
    'ADD_OBSERVATION',
    'ADD_ELEMENT',
    'ADD_CAMPAIGN',
    'UPDATE_OBSERVATION',
    'UPDATE_ELEMENT',
    'UPDATE_CAMPAIGN',
    'ANALYZE_TRENDS',
    'SUGGEST_SAMPLING',
    'RUN_AUDIT',
    'CLEAR_MARKERS',
    'SITE_RESEARCH',
    'POPULATE_FROM_RESEARCH',
    'ADD_MESSAGE',
    // Agentic LLM - state queries (read-only, sem confirmacao)
    'QUERY_STATE',
    'QUERY_ELEMENT',
    'QUERY_COMPLIANCE',
    'QUERY_KNOWLEDGE',
    // Agentic LLM - workflow trigger
    'START_WORKFLOW',
    // EcoTools - creation via LLM
    'CREATE_ECO_TOOL',
    // Meta-acao - discovery de acoes por categoria
    'LIST_CAPABILITIES',
]);
/**
 * Retorna Set com todas as acoes validas: custom + registry.
 * @returns {Set<string>}
 */
export function getValidActions() {
    const llmMap = getLlmActionMap();
    const all = new Set(CUSTOM_ACTIONS);
    for (const key of llmMap.keys()) {
        all.add(key);
    }
    return all;
}
/** @deprecated Use getValidActions() — mantido para backward compat */
export const VALID_ACTIONS = [...CUSTOM_ACTIONS];
// ================================================================
// PARSER PRINCIPAL
// ================================================================
/**
 * Parse a resposta do LLM
 * @param {string} content - Conteúdo retornado pelo LLM
 * @returns {Object} - { success, data, error }
 */
export function parseResponse(content: string): any {
    if (!content || typeof content !== 'string') {
        return {
            success: false,
            error: 'Resposta vazia do LLM',
            data: null,
        };
    }
    try {
        // Tenta fazer parse direto
        const parsed = JSON.parse(content.trim());
        return validateParsedResponse(parsed);
    }
    catch (_e) {
        // Tenta extrair JSON de texto misto
        return extractJSON(content);
    }
}
/**
 * Extrai JSON de texto que pode conter markdown ou texto adicional.
 * Se nao encontrar JSON valido, trata como resposta conversacional.
 * Lida com JSON truncado (cortado por limite de tokens do LLM).
 *
 * @param {string} text - Texto com possível JSON embutido
 * @returns {Object}
 */
function extractJSON(text: string): any {
    // Remove markdown code blocks se houver
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    // Tenta encontrar objeto JSON completo
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[0]);
            return validateParsedResponse(parsed);
        }
        catch (_e) {
            // JSON incompleto - tenta reparar adicionando chaves faltantes
            const repaired = tryRepairJSON(jsonMatch[0]);
            if (repaired) {
                return validateParsedResponse(repaired);
            }
        }
    }
    // RECUPERAÇÃO: Tenta extrair campos de JSON truncado via regex
    // Isso cobre o caso onde o LLM retorna JSON cortado sem } final
    if (cleaned.includes('"confirmation"') || cleaned.includes('"understood"')) {
        const recovered = recoverFromTruncatedJSON(cleaned);
        if (recovered) {
            return { success: true, data: recovered };
        }
    }
    // FALLBACK: Se não encontrou JSON, trata como resposta conversacional
    // Isso acontece quando o LLM responde em texto livre (ex: "me ajude a avaliar")
    // Em vez de erro, retorna como mensagem não-entendida para exibição amigável
    const friendlyText = stripJSONArtifacts(text.trim());
    if (friendlyText.length > 0) {
        return {
            success: true,
            data: {
                understood: false,
                action: null,
                params: {},
                confirmation: friendlyText,
                ambiguities: [],
            },
        };
    }
    return {
        success: false,
        error: 'Resposta vazia do LLM',
        data: null,
        raw: text,
    };
}
/**
 * Tenta reparar JSON incompleto adicionando chaves faltantes.
 * Quando o LLM é cortado por limite de tokens, o JSON pode ficar
 * com chaves abertas sem fechar.
 *
 * @param {string} jsonStr - JSON possivelmente incompleto
 * @returns {Object|null} - Objeto parseado ou null
 */
function tryRepairJSON(jsonStr: string): any {
    // Conta chaves abertas vs fechadas
    let depth = 0;
    let inString = false;
    let escape = false;
    for (const ch of jsonStr) {
        if (escape) {
            escape = false;
            continue;
        }
        if (ch === '\\') {
            escape = true;
            continue;
        }
        if (ch === '"') {
            inString = !inString;
            continue;
        }
        if (inString)
            continue;
        if (ch === '{')
            depth++;
        if (ch === '}')
            depth--;
    }
    // Fecha chaves faltantes
    if (depth > 0) {
        // Remove trailing comma ou texto incompleto antes de fechar
        let repaired = jsonStr.replace(/,\s*"[^"]*"?\s*:\s*"?[^"}]*$/, '');
        // Se terminou no meio de uma string, fecha-a
        if (inString)
            repaired += '"';
        for (let i = 0; i < depth; i++)
            repaired += '}';
        try {
            return JSON.parse(repaired);
        }
        catch (_e) {
            // Segundo tentativa: remove ultima propriedade incompleta
            const lastComplete = jsonStr.lastIndexOf('",');
            if (lastComplete > 0) {
                let simpler = jsonStr.substring(0, lastComplete + 1);
                // Fecha chaves
                let d2 = 0;
                let inStr2 = false;
                let esc2 = false;
                for (const ch of simpler) {
                    if (esc2) {
                        esc2 = false;
                        continue;
                    }
                    if (ch === '\\') {
                        esc2 = true;
                        continue;
                    }
                    if (ch === '"') {
                        inStr2 = !inStr2;
                        continue;
                    }
                    if (inStr2)
                        continue;
                    if (ch === '{')
                        d2++;
                    if (ch === '}')
                        d2--;
                }
                for (let i = 0; i < d2; i++)
                    simpler += '}';
                try {
                    return JSON.parse(simpler);
                }
                catch (_e2) {
                    console.debug('[core/llm/parser:silent-catch]', (_e2 as any)?.message || _e2);
                }
            }
        }
    }
    return null;
}
/**
 * Recupera dados de um JSON truncado extraindo campos via regex.
 * Quando o JSON nao pode ser reparado, extrai o que conseguir.
 *
 * @param {string} text - Texto com JSON truncado
 * @returns {Object|null} - Dados recuperados ou null
 */
function recoverFromTruncatedJSON(text: string): any {
    // Extrai "confirmation" - o campo mais importante para o usuario
    const confirmMatch = text.match(/"confirmation"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/);
    if (!confirmMatch)
        return null;
    const confirmation = ((confirmMatch[1] as string | undefined) || '').replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
    if (!confirmation)
        return null;
    // Extrai "understood"
    const understoodMatch = text.match(/"understood"\s*:\s*(true|false)/);
    const understood = understoodMatch ? understoodMatch[1] === 'true' : false;
    // Extrai "action"
    const actionMatch = text.match(/"action"\s*:\s*"([A-Z_]+)"/);
    const action = understood && actionMatch ? actionMatch[1] : null;
    return {
        understood,
        action: understood ? action : null,
        params: {},
        confirmation,
        ambiguities: [],
    };
}
/**
 * Remove artefatos JSON de texto para exibição amigável.
 * Se o texto parece ser JSON bruto, tenta extrair conteúdo legível.
 *
 * @param {string} text - Texto possivelmente com sintaxe JSON
 * @returns {string} - Texto limpo
 */
function stripJSONArtifacts(text: string) {
    if (!text.startsWith('{'))
        return text;
    // Tenta extrair valor de "confirmation" com regex simples
    const confirmMatch = text.match(/"confirmation"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/);
    const confirmation: string = (confirmMatch?.[1] as string | undefined) || '';
    if (confirmation.trim().length > 10) {
        return confirmation.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
    }
    // Remove prefixo JSON e sufixo, mantém texto legível
    return text
        .replace(/^\{\s*"understood"\s*:\s*(true|false)\s*,?\s*/i, '')
        .replace(/"action"\s*:\s*(null|"[^"]*")\s*,?\s*/i, '')
        .replace(/"params"\s*:\s*\{\s*\}\s*,?\s*/i, '')
        .replace(/"confirmation"\s*:\s*"?/i, '')
        .replace(/"?\s*,?\s*"ambiguities"\s*:\s*\[.*$/i, '')
        .replace(/["{}[\]]+$/g, '')
        .trim() || text;
}
/**
 * Valida a estrutura da resposta parseada
 * @param {ParsedLLMResponse} parsed - Objeto parseado
 * @returns {Object}
 */
function validateParsedResponse(parsed: any) {
    // Verifica campos obrigatórios
    if (typeof parsed.understood !== 'boolean') {
        return {
            success: false,
            error: 'Campo "understood" não encontrado ou inválido',
            data: parsed,
        };
    }
    // Se não entendeu, retorna como sucesso (o LLM precisa de mais info)
    if (!parsed.understood) {
        return {
            success: true,
            data: {
                understood: false,
                action: null,
                params: {},
                confirmation: parsed.confirmation || 'Não foi possível interpretar o comando.',
                ambiguities: parsed.ambiguities || [],
                confidence: typeof parsed.confidence === 'number' ? parsed.confidence : undefined,
                requires_confirmation: typeof parsed.requires_confirmation === 'boolean' ? parsed.requires_confirmation : undefined,
                reasoning_tags: Array.isArray(parsed.reasoning_tags) ? parsed.reasoning_tags : undefined,
            },
        };
    }
    // Valida ação - aceita custom + registry actions
    if (!parsed.action || !getValidActions().has(parsed.action)) {
        return {
            success: false,
            error: `Ação inválida: ${parsed.action}`,
            data: parsed,
        };
    }
    // Valida params
    if (!parsed.params || typeof parsed.params !== 'object') {
        return {
            success: false,
            error: 'Parâmetros não encontrados',
            data: parsed,
        };
    }
    return {
        success: true,
        data: {
            understood: true,
            action: parsed.action,
            params: parsed.params,
            confirmation: parsed.confirmation || 'Executar ação?',
            ambiguities: parsed.ambiguities || [],
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : undefined,
            requires_confirmation: typeof parsed.requires_confirmation === 'boolean' ? parsed.requires_confirmation : undefined,
            reasoning_tags: Array.isArray(parsed.reasoning_tags) ? parsed.reasoning_tags : undefined,
        },
    };
}
// ================================================================
// RESOLUÇÃO DE REFERÊNCIAS
// ================================================================
/**
 * Resolve referência a elemento por nome ou número
 * @param {string} reference - "ponto 3", "PM-01", etc.
 * @returns {Record<string, any>|null} - Elemento encontrado ou null
 */
export function resolveElementReference(reference: string) {
    const elements = /** @type {Array<any>} */ (getAllElements());
    if (elements.length === 0)
        return null;
    const ref = String(reference).toLowerCase().trim();
    // Tenta match exato por ID
    let found = elements.find((e) => e.id.toLowerCase() === ref);
    if (found)
        return found;
    // Tenta match por nome
    found = elements.find((e) => e.name.toLowerCase() === ref);
    if (found)
        return found;
    // Tenta match parcial por nome
    found = elements.find((e) => e.name.toLowerCase().includes(ref));
    if (found)
        return found;
    // Tenta extrair número ("ponto 3", "poço 3")
    const numMatch = ref.match(/(\d+)/);
    if (numMatch) {
        const num = parseInt(numMatch[1] || '0', 10);
        // Busca por índice (1-based)
        if (num > 0 && num <= elements.length) {
            return elements[num - 1];
        }
        // Busca por ID contendo o número
        found = elements.find((e) => e.id.includes(`-${num}`) || e.id.endsWith(String(num)));
        if (found)
            return found;
    }
    return null;
}
/**
 * Resolve referência a campanha por nome ou número
 * @param {string} reference - "campanha 4", "março 2024", etc.
 * @returns {Record<string, any>|null}
 */
export function resolveCampaignReference(reference: string) {
    const campaigns = /** @type {Array<any>} */ (getAllCampaigns());
    if (campaigns.length === 0)
        return null;
    const ref = String(reference).toLowerCase().trim();
    // Tenta match exato por ID
    let found = campaigns.find((c) => c.id.toLowerCase() === ref);
    if (found)
        return found;
    // Tenta match por nome
    found = campaigns.find((c) => c.name.toLowerCase() === ref);
    if (found)
        return found;
    // Tenta match parcial
    found = campaigns.find((c) => c.name.toLowerCase().includes(ref));
    if (found)
        return found;
    // Tenta extrair número
    const numMatch = ref.match(/(\d+)/);
    if (numMatch) {
        const num = parseInt(numMatch[1] || '0', 10);
        // Busca por índice (1-based)
        if (num > 0 && num <= campaigns.length) {
            return campaigns[num - 1];
        }
        // Busca por ID
        found = campaigns.find((c) => c.id === `campaign-${num}`);
        if (found)
            return found;
    }
    return null;
}
/**
 * Resolve referência a parâmetro
 * @param {string} reference - "benzeno", "pH", "BTEX"
 * @returns {Record<string, any>|null}
 */
export function resolveParameterReference(reference: string) {
    const ref = String(reference).toLowerCase().trim();
    const parameters = /** @type {Array<any>} */ (CONFIG.PARAMETERS);
    // Match exato por ID
    let found = parameters.find((p) => p.id.toLowerCase() === ref);
    if (found)
        return found;
    // Match por nome
    found = parameters.find((p) => p.name.toLowerCase() === ref);
    if (found)
        return found;
    // Match parcial
    found = parameters.find((p) => p.name.toLowerCase().includes(ref) || p.id.toLowerCase().includes(ref));
    if (found)
        return found;
    return null;
}
/**
 * Resolve referência a unidade
 * @param {string} reference - "mg/L", "ug_L", etc.
 * @returns {Record<string, any>|null}
 */
export function resolveUnitReference(reference: string) {
    const ref = String(reference)
        .toLowerCase()
        .trim()
        .replace('µ', 'u') // Normaliza micro
        .replace('/', '_'); // Normaliza barra
    const units = /** @type {Array<any>} */ (CONFIG.UNITS);
    // Match por ID
    let found = units.find((u) => u.id.toLowerCase() === ref);
    if (found)
        return found;
    // Match por símbolo
    const refSymbol = String(reference).trim();
    found = units.find((u) => u.symbol === refSymbol);
    if (found)
        return found;
    // Match parcial
    found = units.find((u) => u.id.toLowerCase().includes(ref) || u.symbol.toLowerCase().includes(ref));
    if (found)
        return found;
    return null;
}
// ================================================================
// VALIDAÇÃO DE PARÂMETROS POR AÇÃO
// ================================================================
/**
 * Valida parâmetros para uma ação específica
 * @param {string} action - Nome da ação
 * @param {LLMActionParams} params - Parâmetros a validar
 * @returns {Object} - { valid, errors, resolvedParams }
 */
export function validateActionParams(action: string, params: any) {
    const errors = [];
    /** @type {LLMActionParams} */
    const resolved = { ...params };
    switch (action) {
        case 'ADD_OBSERVATION':
            // Resolve elemento
            if (params.elementId) {
                const element = resolveElementReference(params.elementId);
                if (element) {
                    resolved.elementId = element.id;
                    resolved._elementName = element.name;
                }
                else {
                    errors.push(`Elemento não encontrado: ${params.elementId}`);
                }
            }
            else {
                errors.push('elementId é obrigatório');
            }
            // Resolve parâmetro
            if (params.parameterId) {
                const param = resolveParameterReference(params.parameterId);
                if (param) {
                    resolved.parameterId = param.id;
                    resolved._parameterName = param.name;
                    // Se unidade não especificada, usa padrão
                    if (!params.unitId) {
                        resolved.unitId = param.defaultUnitId;
                    }
                }
                else {
                    errors.push(`Parâmetro não encontrado: ${params.parameterId}`);
                }
            }
            else {
                errors.push('parameterId é obrigatório');
            }
            // Resolve campanha (opcional)
            if (params.campaignId) {
                const campaign = resolveCampaignReference(params.campaignId);
                if (campaign) {
                    resolved.campaignId = campaign.id;
                    resolved._campaignName = campaign.name;
                }
                else {
                    errors.push(`Campanha não encontrada: ${params.campaignId}`);
                }
            }
            // Resolve unidade
            if (params.unitId) {
                const unit = resolveUnitReference(params.unitId);
                if (unit) {
                    resolved.unitId = unit.id;
                }
                else {
                    errors.push(`Unidade não encontrada: ${params.unitId}`);
                }
            }
            // Valida valor
            if (params.value === undefined || params.value === null) {
                errors.push('value é obrigatório');
            }
            break;
        case 'ADD_ELEMENT':
            if (!params.familyId) {
                errors.push('familyId é obrigatório');
            }
            break;
        case 'ADD_CAMPAIGN':
            // Todos os campos são opcionais
            break;
        case 'UPDATE_OBSERVATION':
            if (!params.elementId)
                errors.push('elementId é obrigatório');
            if (params.observationIndex === undefined)
                errors.push('observationIndex é obrigatório');
            if (!params.field)
                errors.push('field é obrigatório');
            if (params.value === undefined)
                errors.push('value é obrigatório');
            break;
        case 'UPDATE_ELEMENT':
            if (!params.elementId)
                errors.push('elementId é obrigatório');
            if (!params.field)
                errors.push('field é obrigatório');
            if (params.value === undefined)
                errors.push('value é obrigatório');
            break;
        case 'UPDATE_CAMPAIGN':
            if (!params.campaignId)
                errors.push('campaignId é obrigatório');
            if (!params.field)
                errors.push('field é obrigatório');
            if (params.value === undefined)
                errors.push('value é obrigatório');
            break;
        case 'ANALYZE_TRENDS':
            // Optional: elementId, parameterId (if user wants specific element)
            if (params.elementId) {
                const element = resolveElementReference(params.elementId);
                if (element) {
                    resolved.elementId = element.id;
                }
                else {
                    errors.push(`Elemento não encontrado: ${params.elementId}`);
                }
            }
            break;
        case 'SUGGEST_SAMPLING':
            // Optional: count (number of points to suggest)
            break;
        case 'RUN_AUDIT':
            // Optional: reportText (text to analyze)
            break;
        case 'CLEAR_MARKERS':
            // No params needed
            break;
        case 'SITE_RESEARCH':
            // Needs at least address or lat/lon
            if (!params.address && !params.query && !params.lat) {
                errors.push('Informe um endereço, nome de empresa ou coordenadas (lat/lon)');
            }
            break;
        case 'POPULATE_FROM_RESEARCH':
            // Uses last research report - optional filter params
            // categories: array of categories to import (waterBodies, industries, sensitiveSites)
            // includeCoordinates: boolean to set project coordinates
            break;
        case 'ADD_MESSAGE':
            if (!params.elementId)
                errors.push('elementId é obrigatório');
            if (!params.content)
                errors.push('content é obrigatório');
            break;
        // Agentic LLM - state queries
        case 'QUERY_STATE':
            if (!params.query) {
                resolved.query = 'summary';
            }
            break;
        case 'QUERY_ELEMENT':
            if (!params.elementId)
                errors.push('elementId é obrigatório');
            else {
                const qel = resolveElementReference(params.elementId);
                if (qel)
                    resolved.elementId = qel.id;
                else
                    errors.push(`Elemento não encontrado: ${params.elementId}`);
            }
            break;
        case 'QUERY_COMPLIANCE':
            if (!params.parameterId)
                errors.push('parameterId é obrigatório');
            else {
                const qp = resolveParameterReference(params.parameterId);
                if (qp)
                    resolved.parameterId = qp.id;
                else
                    errors.push(`Parâmetro não encontrado: ${params.parameterId}`);
            }
            break;
        // Agentic LLM - workflow trigger
        case 'START_WORKFLOW':
            if (!params.workflowId)
                errors.push('workflowId é obrigatório');
            break;
        case 'CREATE_ECO_TOOL':
            if (!params.name)
                errors.push('name é obrigatório');
            if (!params.htmlContent)
                errors.push('htmlContent é obrigatório');
            break;
        case 'LIST_CAPABILITIES':
            // Optional: category (string)
            break;
        default: {
            // Registry-dispatched action: validacao leve de params presentes
            const llmMap = getLlmActionMap();
            const entry = llmMap.get(action);
            if (entry) {
                for (const p of /** @type {any} */ (entry).params) {
                    // Params com ? sao opcionais (ex: 'sensorId?')
                    if (p.endsWith('?'))
                        continue;
                    if (params[p] === undefined) {
                        errors.push(`${p} é obrigatório`);
                    }
                }
            }
            break;
        }
    }
    return {
        valid: errors.length === 0,
        errors,
        resolvedParams: resolved,
    };
}
//# sourceMappingURL=parser.js.map
