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
   CHAT TOOLS — Ferramentas anexaveis ao chat do assistente IA
   ================================================================

   Define as ferramentas analiticas que o usuario pode ativar
   no painel de chat. Quando uma ferramenta esta ativa, o
   system prompt inclui as acoes correspondentes e o LLM pode
   usar essas ferramentas ao interpretar comandos.

   Padrão inspirado no Google Gemini "Ferramentas":
   o usuario clica em "+ Ferramentas" e seleciona quais
   capacidades analiticas o assistente deve ter.

   ================================================================ */

// ================================================================
// TOOL DEFINITIONS
// Cada ferramenta mapeia para acoes do commandExecutor e/ou
// injeta instrucoes adicionais no system prompt.
//
// - actions[]: acoes do commandExecutor habilitadas por esta ferramenta
// - promptAddition: texto injetado no system prompt quando ativa
//   (para ferramentas comportamentais que mudam o estilo de resposta)
// ================================================================

import { generateId } from '../../utils/helpers/id.js';

/** @type {Array<Record<string, any>>} */
export const CHAT_TOOLS = [
    {
        id: 'trends',
        actions: ['ANALYZE_TRENDS'],
        icon: 'trending-up',
        nameKey: 'trendAnalysis',
        descKey: 'trendAnalysisDesc',
    },
    {
        id: 'sampling',
        actions: ['SUGGEST_SAMPLING', 'CLEAR_MARKERS'],
        icon: 'map-pin',
        nameKey: 'optimalSampling',
        descKey: 'optimalSamplingDesc',
    },
    {
        id: 'audit',
        actions: ['RUN_AUDIT'],
        icon: 'shield-check',
        nameKey: 'esgAudit',
        descKey: 'esgAuditDesc',
    },
    {
        id: 'site-research',
        actions: ['SITE_RESEARCH', 'POPULATE_FROM_RESEARCH'],
        icon: 'map-search',
        nameKey: 'siteResearch',
        descKey: 'siteResearchDesc',
        promptAddition: `FERRAMENTA PESQUISA DE ÁREA ATIVA — Fluxo de uso:

1. PESQUISAR: O usuário informa endereço, nome de empresa, lat/lon ou local. Use SITE_RESEARCH.
   Exemplos: "pesquisar Rua Augusta 100 SP", "buscar dados de -23.55 -46.63", "pesquisar posto Shell Ipiranga"

2. INSERIR NO MODELO: Após a pesquisa retornar dados, se o usuário pedir para "inserir dados",
   "popular modelo", "adicionar ao modelo" ou "usar esses dados", use POPULATE_FROM_RESEARCH.
   Esta ação automaticamente:
   - Preenche coordenadas do projeto (lat/lon)
   - Preenche nome e descrição do projeto
   - Cria elementos para corpos d'água, indústrias e áreas sensíveis encontradas

   Exemplos de pedidos do usuário que devem acionar POPULATE_FROM_RESEARCH:
   - "inserir dados no modelo"
   - "popular o modelo com esses dados"
   - "adicionar essas informações"
   - "usar esses dados"
   - "sim, inserir tudo"

IMPORTANTE: Se o usuário pedir para inserir dados mas NÃO fez pesquisa antes, peça que faça a pesquisa primeiro.`,
    },
    {
        id: 'smart-import',
        actions: [],
        icon: 'file-up',
        nameKey: 'smartImport',
        descKey: 'smartImportDesc',
        promptAddition: `FERRAMENTA IMPORTAÇÃO INTELIGENTE ATIVA — O usuário pode importar dados de arquivos CSV, JSON ou GeoJSON.

Quando o usuário mencionar importar dados, carregar arquivo, ou CSV/JSON/GeoJSON:
- Instrua-o a usar o botão de upload no painel da ferramenta
- O sistema analisará a estrutura automaticamente e sugerirá mapeamento de colunas
- O usuário revisará e confirmará a importação

Exemplos: "quero importar dados", "tenho um CSV com observações", "carregar arquivo GeoJSON"`,
        hasUpload: true,
    },
    {
        id: 'workflows',
        actions: ['START_WORKFLOW', 'QUERY_STATE', 'QUERY_ELEMENT', 'QUERY_COMPLIANCE'],
        icon: 'git-branch',
        nameKey: 'workflow.workflows',
        descKey: 'workflowsToolDesc',
        promptAddition: `MODO AGENTIC ATIVO — WORKFLOWS E CONSULTAS DE ESTADO

Você pode consultar o modelo ANTES de responder:
- QUERY_STATE: resumo do modelo (elementos, campanhas, conformidade)
- QUERY_ELEMENT: detalhes de um elemento (observações por parâmetro)
- QUERY_COMPLIANCE: verificação regulatória de um parâmetro

Consultas são executadas automaticamente sem confirmação do usuário.
Use START_WORKFLOW para iniciar workflows guiados com decisões pré-preenchidas.

Workflows disponíveis:
- plume-delineation-conama420: Delineamento de pluma CONAMA 420/2009
- emergency-response-sao: Resposta à Emergência com matrizes SAO/ESH
- risk-assessment-cetesb: Avaliação de Risco CETESB (exposição e conformidade)

Exemplos de uso:
- "Quais poços excedem o limite de Benzeno?" → QUERY_COMPLIANCE com parameterId: "benzene"
- "Mostre um resumo do modelo" → QUERY_STATE com query: "summary"
- "Inicie o delineamento de pluma para Benzeno" → START_WORKFLOW com workflowId: "plume-delineation-conama420", prefill: {parameterId: "benzene"}
- "Avalie o risco para área residencial" → START_WORKFLOW com workflowId: "risk-assessment-cetesb", prefill: {landUse: "residential"}
- "Simule resposta a derramamento químico" → START_WORKFLOW com workflowId: "emergency-response-sao", prefill: {scenario: "chemical_spill"}`,
    },
    {
        id: 'critical-review',
        actions: [],
        icon: 'scale',
        nameKey: 'criticalReview',
        descKey: 'criticalReviewDesc',
        promptAddition: `MODO REVISÃO CRÍTICA ATIVO — Para TODA resposta, além de executar a ação solicitada, você DEVE incluir uma seção "⚖️ Revisão Crítica" ao final com:

1. LIMITAÇÕES: Quais dados estão faltando ou são insuficientes para sustentar a conclusão?
2. CONTRA-ARGUMENTO: Qual seria a interpretação oposta ou alternativa dos mesmos dados?
3. PREMISSAS FRÁGEIS: Quais suposições implícitas podem não se sustentar?
4. VIÉS: Existe risco de viés de confirmação, cherry-picking ou generalização indevida?
5. RECOMENDAÇÃO: O que seria necessário para fortalecer ou refutar esta conclusão?

Seja construtivo mas rigoroso — como um revisor de artigo científico ou perito judicial.
Nunca omita a seção de revisão crítica, mesmo que a ação pareça simples.`,
    },
];

// ================================================================
// USER CUSTOM TOOLS - Ferramentas criadas pelo usuario
// Cada ferramenta customizada injeta um promptAddition no LLM.
// Nao tem actions[] (comandos), apenas instrucoes de comportamento.
// ================================================================

/** @type {Array<Record<string, any>>} */
let _userTools: any = [];

/**
 * Add a user-defined custom tool.
 * Cria uma ferramenta personalizada do usuario.
 *
 * @param {Record<string, any>} toolDef - { name, description, prompt, icon? }
 * @returns {Object} The created tool
 */
export function addUserTool(toolDef: any) {
    const id = generateId('user');
    const tool = {
        id,
        actions: [],
        icon: toolDef.icon || 'wrench',
        nameKey: null,
        descKey: null,
        name: toolDef.name || 'Custom Tool',
        description: toolDef.description || '',
        promptAddition: toolDef.prompt || '',
        isUserTool: true,
    };
    _userTools.push(tool);
    return tool;
}

/**
 * Update a user-defined custom tool.
 * @param {string} toolId
 * @param {Record<string, any>} updates - { name?, description?, prompt?, icon? }
 * @returns {Object|null}
 */
export function updateUserTool(toolId: any, updates: any) {
    const tool = _userTools.find((t: any) => t.id === toolId);
    if (!tool) return null;
    if (updates.name !== undefined) tool.name = updates.name;
    if (updates.description !== undefined) tool.description = updates.description;
    if (updates.prompt !== undefined) tool.promptAddition = updates.prompt;
    if (updates.icon !== undefined) tool.icon = updates.icon;
    return tool;
}

/**
 * Remove a user-defined custom tool.
 * @param {string} toolId
 * @returns {boolean}
 */
export function removeUserTool(toolId: any) {
    const idx = _userTools.findIndex((t: any) => t.id === toolId);
    if (idx === -1) return false;
    _userTools.splice(idx, 1);
    _activeTools.delete(toolId);
    return true;
}

/**
 * Get all user-defined custom tools.
 * @returns {Object[]}
 */
export function getUserTools() {
    return [..._userTools];
}

/**
 * Get ALL tools: built-in + user-defined.
 * Retorna todas as ferramentas (sistema + usuario).
 * @returns {Array<Record<string, any>>}
 */
export function getAllTools() {
    return [...CHAT_TOOLS, ..._userTools];
}

/**
 * Import user tools from saved data (e.g. from model file).
 * @param {Array<Record<string, any>>} tools
 */
export function importUserTools(tools: any) {
    if (!Array.isArray(tools)) return;
    _userTools = tools.map(/** @param {any} t */ (t) => ({
        id: t.id || 'user-' + Date.now(),
        actions: [],
        icon: t.icon || 'wrench',
        nameKey: null,
        descKey: null,
        name: t.name || 'Custom Tool',
        description: t.description || '',
        promptAddition: t.promptAddition || t.prompt || '',
        isUserTool: true,
    }));
}

/**
 * Export user tools for serialization.
 * @returns {Object[]}
 */
export function exportUserTools() {
    return _userTools.map((t: any) => ({
        id: t.id,
        icon: t.icon,
        name: t.name,
        description: t.description,
        promptAddition: t.promptAddition,
    }));
}

// ================================================================
// STATE - Ferramentas ativas na sessao atual
// ================================================================

const _activeTools = new Set();

/**
 * Check if a tool is active.
 * Verifica se uma ferramenta esta ativa no chat.
 *
 * @param {string} toolId - Tool identifier
 * @returns {boolean}
 */
export function isToolActive(toolId: any) {
    return _activeTools.has(toolId);
}

/**
 * Toggle a tool on/off.
 * Liga ou desliga uma ferramenta no chat.
 *
 * @param {string} toolId - Tool identifier
 * @returns {boolean} New state (true = active)
 */
export function toggleTool(toolId: any) {
    if (_activeTools.has(toolId)) {
        _activeTools.delete(toolId);
        return false;
    } else {
        _activeTools.add(toolId);
        return true;
    }
}

/**
 * Get all active tool IDs.
 * Retorna os IDs de todas as ferramentas ativas.
 *
 * @returns {string[]}
 */
export function getActiveTools() {
    return [..._activeTools];
}

/**
 * Get all action names enabled by active tools.
 * Retorna os nomes das acoes habilitadas pelas ferramentas ativas.
 * Usado pelo promptBuilder para incluir apenas acoes relevantes.
 *
 * @returns {string[]}
 */
export function getActiveToolActions() {
    const all = getAllTools();
    const actions = [];
    for (const tool of all) {
        if (_activeTools.has(tool.id)) {
            actions.push(...tool.actions);
        }
    }
    return actions;
}

/**
 * Get prompt additions from active behavioral tools.
 * Retorna textos de prompt adicionais de ferramentas comportamentais ativas.
 * Inclui ferramentas built-in E customizadas do usuario.
 *
 * @returns {string} Combined prompt additions (empty string if none)
 */
export function getActivePromptAdditions() {
    const all = getAllTools();
    const additions = [];
    for (const tool of all) {
        if (_activeTools.has(tool.id) && tool.promptAddition) {
            additions.push(tool.promptAddition);
        }
    }
    return additions.join('\n\n');
}

/**
 * Get tool definition by ID (built-in or user).
 * @param {string} toolId
 * @returns {Object|undefined}
 */
export function getToolById(toolId: any) {
    return getAllTools().find((t) => t.id === toolId);
}
