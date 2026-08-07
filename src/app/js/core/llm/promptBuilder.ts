// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// @ts-check
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
   CONSTRUTOR DE PROMPTS - Gera contexto para o LLM
   ================================================================

   Este módulo constrói o system prompt incluindo o contexto
   atual do modelo (elementos, campanhas, parâmetros).

   O prompt instrui o LLM a:
   1. Interpretar comandos em linguagem natural
   2. Mapear para ações do sistema
   3. Retornar resposta em formato JSON estruturado

   ================================================================ */
import { CONFIG } from '../../config.js';
import { getActiveParameters, isSAOActive } from '../sao/index.js';
import { getAllElements } from '../elements/manager.js';
import { getAllCampaigns } from '../campaigns/manager.js';
import { getEnabledFamilies, getFamilyName } from '../elements/families.js';
import { getActiveAgentPrompt, getActiveAgent, getAgentById } from './agents.js';
import { getActiveToolActions, getActivePromptAdditions } from './chatTools.js';
import { getValidationInfo, getSubscriptionAssertion } from '../../utils/cloud/validation.js';
import { buildFunctionDefinitionsPrompt } from './functions.js';
import { ACTION_REGISTRY, LLM_CATEGORY_TIERS, LLM_CATEGORY_DESCRIPTIONS, handlerToLlmAction, } from '../../utils/api/registry.js';
import { CUSTOM_ACTIONS } from './parser.js';
import { getOrigin, hasOrigin } from '../io/geo/coordinates.js';
import { getPersonalitySettings } from '../../utils/handlers/llmChat.js';
import { sanitizeContextForLlm } from './contextGuardRuntime.js';
/**
 * @typedef {{
 *   name?: string,
 *   elements?: string[],
 *   validatedAt?: string,
 *   displayName?: string,
 *   councilId?: string,
 *   subscriptionActive?: boolean
 * }} PromptObjectLike
 */
// ================================================================
// KNOWLEDGE CONTEXT CACHE
// ================================================================
/** @type {string|null} */
let _knowledgeContextCache: any = null;
/** @type {number} */
let _knowledgeContextTimestamp = 0;
const KNOWLEDGE_CACHE_TTL = 300000; // 5 min
/** @type {object|null} Lazy-loaded vectorLayerOverlay module */
let _vectorLayersMod: any = null;
// Invalida cache quando o origin muda ou libraries change
window.addEventListener('originChanged', () => {
    _knowledgeContextCache = null;
    _knowledgeContextTimestamp = 0;
});
window.addEventListener('vectorLayersChanged', () => {
    _knowledgeContextCache = null;
    _knowledgeContextTimestamp = 0;
});
// ================================================================
// GERADOR DE CONTEXTO
// ================================================================
/**
 * Gera descrição dos elementos existentes no modelo
 * @returns {string}
 */
function getElementsContext(elements: any[]) {
    if (elements.length === 0) {
        return 'Nenhum elemento no modelo.';
    }
    return elements
        .map((el: any) => {
        const obsCount = el.observationCount || 0;
        return `- ${el.siteName} (tipo: ${el.family}, id: ${el.documentNumber}, observações: ${obsCount})`;
    })
        .join('\n');
}
/**
 * Gera descrição das campanhas existentes
 * @returns {string}
 */
function getCampaignsContext(campaigns: any[]) {
    if (campaigns.length === 0) {
        return 'Nenhuma campanha cadastrada.';
    }
    return campaigns
        .map((c: any, index: any) => {
        return `- ${c.siteName} (id: ${c.documentNumber}, número: ${index + 1}, início: ${c.date})`;
    })
        .join('\n');
}
/**
 * Gera lista de parâmetros disponíveis
 * @returns {string}
 */
function getParametersContext() {
    // Use SAO-filtered parameters when active to stay within token limits
    const params = isSAOActive() ? getActiveParameters() : CONFIG.PARAMETERS;
    return params
        .map((p: any) => {
        const unit = CONFIG.UNITS.find((u: any) => u.id === p.defaultUnitId);
        const saoInfo = p.sao ? ` [${p.sao.matrix}/${p.sao.tier}]` : '';
        return `- ${p.name} (id: ${p.id}, unidade: ${unit?.symbol || p.defaultUnitId}${saoInfo})`;
    })
        .join('\n');
}
/**
 * Gera lista de famílias ativas
 * @returns {string}
 */
function getFamiliesContext() {
    const families = getEnabledFamilies();
    return families.map((f: any) => `- ${getFamilyName(f)} (id: ${f})`).join('\n');
}
/**
 * Gera lista de unidades disponíveis
 * @returns {string}
 */
function getUnitsContext() {
    return CONFIG.UNITS.map((u) => `- ${u.symbol} (id: ${u.id}, ${u.name})`).join('\n');
}

function protectPromptText(prompt: string) {
    return sanitizeContextForLlm({ prompt }).safeContext.prompt;
}
// ================================================================
// SYSTEM PROMPT
// ================================================================
/**
 * Constrói o prompt de sistema completo
 * @returns {string}
 */
export function buildSystemPrompt() {
    const { safeContext } = sanitizeContextForLlm({
        elements: getAllElements().map((element: any) => ({
            siteName: element.name,
            family: element.family,
            documentNumber: element.id,
            observationCount: element.data?.observations?.length || 0,
        })),
        campaigns: getAllCampaigns().map((campaign: any) => ({
            siteName: campaign.name,
            documentNumber: campaign.id,
            date: campaign.startDate,
        })),
    });
    const elementsCtx = getElementsContext(safeContext.elements || []);
    const campaignsCtx = getCampaignsContext(safeContext.campaigns || []);
    const parametersCtx = getParametersContext();
    const familiesCtx = getFamiliesContext();
    const unitsCtx = getUnitsContext();
    let basePrompt = `Você é um assistente especializado em hidrogeologia para o sistema ecbyts.
Sua função é interpretar comandos em linguagem natural e convertê-los em ações estruturadas.

═══════════════════════════════════════════════════════════════
CONTEXTO DO MODELO ATUAL
═══════════════════════════════════════════════════════════════

ELEMENTOS NO MODELO:
${elementsCtx}

CAMPANHAS CADASTRADAS:
${campaignsCtx}

PARÂMETROS DISPONÍVEIS:
${parametersCtx}

FAMÍLIAS DE ELEMENTOS ATIVAS:
${familiesCtx}

UNIDADES DISPONÍVEIS:
${unitsCtx}
${_knowledgeContextCache ? `\n${_knowledgeContextCache}` : ''}
═══════════════════════════════════════════════════════════════
AÇÕES DISPONÍVEIS
═══════════════════════════════════════════════════════════════

1. ADD_OBSERVATION - Adicionar observação a um elemento existente
   Parâmetros obrigatórios: elementId, parameterId, value
   Parâmetros opcionais: unitId, campaignId, x, y, z, date

2. ADD_ELEMENT - Criar novo elemento no modelo
   Parâmetros obrigatórios: familyId
   Parâmetros opcionais: name

3. ADD_CAMPAIGN - Criar nova campanha de monitoramento
   Parâmetros opcionais: name, startDate, endDate, color

4. UPDATE_OBSERVATION - Modificar observação existente
   Parâmetros obrigatórios: elementId, observationIndex, field, value

5. UPDATE_ELEMENT - Modificar propriedades de elemento
   Parâmetros obrigatórios: elementId, field, value

6. UPDATE_CAMPAIGN - Modificar campanha existente
   Parâmetros obrigatórios: campaignId, field, value

7. CREATE_ECO_TOOL - Criar nova ferramenta customizada em HTML (EcoTool)
   Parâmetros obrigatórios: name, htmlContent
   Parâmetros opcionais: description
   Gere um formulário HTML completo, ou calculadora interativa, e envie como string escapada no parâmetro htmlContent.

8. LIST_CAPABILITIES - Listar ações disponíveis por categoria
   Parâmetros opcionais: category (nome da categoria, ex: "sensor", "camera", "governance")
   Use quando o usuário perguntar "o que posso fazer com X?" ou "quais ações existem?"
${getToolActionsPrompt()}
${getRegistryActionsPrompt()}

═══════════════════════════════════════════════════════════════
REGRAS DE INTERPRETAÇÃO
═══════════════════════════════════════════════════════════════

1. REFERÊNCIAS A ELEMENTOS:
   - "ponto 3", "poço 3", "PM-03" → busque o elemento pelo número ou nome
   - Se houver ambiguidade, liste as opções em "ambiguities"

2. REFERÊNCIAS A CAMPANHAS:
   - "campanha 4", "campanha de março" → busque pelo número ou nome
   - Campanhas são numeradas a partir de 1

3. PARÂMETROS QUÍMICOS:
   - "benzeno", "BTEX", "pH" → mapeie para o parameterId correto
   - Use a unidade padrão se não especificada

4. VALORES NUMÉRICOS:
   - "10 mg/L" → value: 10, unitId: "mg_L"
   - "50 µg/L" ou "50 ug/L" → value: 50, unitId: "ug_L"
   - Se unidade não especificada, use a padrão do parâmetro

═══════════════════════════════════════════════════════════════
FORMATO DE RESPOSTA (OBRIGATÓRIO)
═══════════════════════════════════════════════════════════════

Responda SEMPRE em JSON válido com esta estrutura:

{
    "understood": true,
    "action": "NOME_DA_ACAO",
    "params": {
        // parâmetros específicos da ação
    },
    "confirmation": "Texto amigável descrevendo a ação para confirmação do usuário",
    "ambiguities": []
}

Se NÃO entender o comando ou precisar de mais informações:

{
    "understood": false,
    "action": null,
    "params": {},
    "confirmation": "Explicação do que não foi entendido ou quais informações faltam",
    "ambiguities": ["lista de pontos ambíguos"]
}

═══════════════════════════════════════════════════════════════
EXEMPLOS
═══════════════════════════════════════════════════════════════

Comando: "adicionar benzeno 10 mg/L no ponto 1 campanha 2"
Resposta:
{
    "understood": true,
    "action": "ADD_OBSERVATION",
    "params": {
        "elementId": "well-1",
        "parameterId": "benzene",
        "value": 10,
        "unitId": "mg_L",
        "campaignId": "campaign-2"
    },
    "confirmation": "Adicionar observação de Benzeno (10 mg/L) ao Poço PM-01, Campanha 2?",
    "ambiguities": []
}

Comando: "criar novo poço de monitoramento chamado PM-CENTRAL"
Resposta:
{
    "understood": true,
    "action": "ADD_ELEMENT",
    "params": {
        "familyId": "well",
        "name": "PM-CENTRAL"
    },
    "confirmation": "Criar novo Poço de Monitoramento com nome 'PM-CENTRAL'?",
    "ambiguities": []
}

Comando: "nova campanha março 2024"
Resposta:
{
    "understood": true,
    "action": "ADD_CAMPAIGN",
    "params": {
        "name": "Campanha Março 2024",
        "startDate": "2024-03-01"
    },
    "confirmation": "Criar nova campanha 'Campanha Março 2024' iniciando em 01/03/2024?",
    "ambiguities": []
}`;
    // Inject active agent specialization
    // Injeta a especializacao do agente ativo no prompt
    const agentPrompt = getActiveAgentPrompt();
    if (agentPrompt) {
        const agentId = getActiveAgent();
        const agent = /** @type {PromptObjectLike|null} */ (getAgentById(agentId));
        const agentName = agent ? agent.name : agentId;
        basePrompt += `

═══════════════════════════════════════════════════════════════
AGENT SPECIALIZATION: ${agentName}
═══════════════════════════════════════════════════════════════

${agentPrompt}`;
    }
    // Inject behavioral tool prompt additions (e.g. Critical Review mode)
    // Injeta instrucoes de ferramentas comportamentais ativas
    const toolPromptAdditions = getActivePromptAdditions();
    if (toolPromptAdditions) {
        basePrompt += `

═══════════════════════════════════════════════════════════════
FERRAMENTAS DE COMPORTAMENTO ATIVAS
═══════════════════════════════════════════════════════════════

${toolPromptAdditions}`;
    }
    // Inject professional validation context
    // Injeta contexto de validacao profissional se presente
    const validationCtx = getProfessionalValidationContext();
    if (validationCtx) {
        basePrompt += `

═══════════════════════════════════════════════════════════════
VALIDAÇÃO PROFISSIONAL
═══════════════════════════════════════════════════════════════

${validationCtx}`;
    }
    // Inject communication style / personality preferences
    basePrompt += _buildPersonalityPrompt();
    return protectPromptText(basePrompt);
}
// ================================================================
// PERSONALITY PROMPT - Communication style preferences
// ================================================================
const _TONE = {
    formal: 'Use formal, professional language. No colloquialisms. Suitable for regulatory reports.',
    friendly: 'Be approachable and helpful while maintaining professional accuracy.',
    didactic: 'Explain concepts clearly. Define technical terms on first use. Use analogies.',
};
const _TECH = {
    1: 'Explain all terms simply. No jargon. Analogies from daily life.',
    2: 'Basic technical terms with brief explanations.',
    3: 'Standard environmental terminology.',
    4: 'Advanced. Assume CONAMA, EPA, hydrogeology knowledge.',
    5: 'Expert-level. Equations, DOI references, method citations.',
};
const _VERB = {
    concise: 'Bullet points. 1-2 sentences max per point. No introductions.',
    balanced: 'Complete info without unnecessary elaboration.',
    detailed: 'Thorough explanations with examples, reasoning, and caveats.',
};
const _LANG = {
    auto: '',
    'pt-BR': 'Always respond in Brazilian Portuguese.',
    'en-US': 'Always respond in English.',
    'es-LA': 'Always respond in Spanish.',
};
const _FOCUS = {
    general: '',
    compliance: 'Prioritize regulatory compliance. Reference CONAMA, CETESB, EPA thresholds.',
    operational: 'Focus on field operations: sampling, equipment, logistics, campaign planning.',
    academic: 'Include academic references (DOI/ISBN). Discuss methodology. Favor reproducibility.',
};
/**
 * Build personality prompt section from user preferences.
 * Returns empty string if all defaults (avoid token waste).
 * @returns {string}
 */
function _buildPersonalityPrompt() {
    try {
        const p = getPersonalitySettings();
        // Skip if all defaults - saves ~100 tokens
        if (p.tone === 'friendly' &&
            p.technical === 3 &&
            p.verbosity === 'balanced' &&
            p.language === 'auto' &&
            p.focus === 'general') {
            return '';
        }
        let section = '\n\nCOMMUNICATION PREFERENCES:\n';
        const tone: Record<string, string> = _TONE as any;
        const tech: Record<string, string> = _TECH as any;
        const verb: Record<string, string> = _VERB as any;
        const lang: Record<string, string> = _LANG as any;
        const focus: Record<string, string> = _FOCUS as any;
        if (p.tone !== 'friendly')
            section += `Tone: ${tone[p.tone] || ''}\n`;
        if (p.technical !== 3)
            section += `Technical: ${tech[p.technical] || ''}\n`;
        if (p.verbosity !== 'balanced')
            section += `Length: ${verb[p.verbosity] || ''}\n`;
        if (lang[p.language])
            section += `${lang[p.language]}\n`;
        if (focus[p.focus])
            section += `${focus[p.focus]}\n`;
        return section;
    }
    catch (e: any) {
        console.debug('[promptBuilder] buildPersonaSection:', e?.message || e);
        return '';
    }
}
// ================================================================
// LITE PROMPT - Para engines com contexto limitado (browser/local)
// ================================================================
/**
 * Build lightweight prompt for browser/local engines.
 * Modo conversacional - sem JSON, sem acoes estruturadas.
 * Target: ~500-800 tokens (vs ~5K-8K do prompt completo).
 *
 * @returns {string}
 */
export function buildLitePrompt() {
    const elements = getAllElements();
    const campaigns = getAllCampaigns();
    const families = getEnabledFamilies();
    const elemCount = elements.length;
    const campCount = campaigns.length;
    // Gera resumo compacto de tipos de elementos presentes
    const familySet = [...new Set(elements.map((e: any) => e.family))];
    const familySummary = familySet.length > 0 ? `\n  Tipos presentes: ${familySet.map((f: any) => getFamilyName(f)).join(', ')}` : '';
    let prompt = `Você é um assistente especializado em monitoramento ambiental para o sistema ecbyts.

CONTEXTO:
- Elementos no modelo: ${elemCount}${familySummary}
- Campanhas cadastradas: ${campCount}
- Famílias de elementos ativas: ${families.length}

INSTRUÇÕES:
1. Responda em linguagem natural, amigável e em português
2. Você pode discutir técnicas de monitoramento, parâmetros ambientais, regulamentação (CONAMA, CETESB, EPA) e boas práticas
3. Se o usuário pedir para executar ações no modelo (adicionar elementos, observações, campanhas), explique que essas ações requerem o modo Cloud — oriente a trocar nas configurações
4. Mantenha respostas concisas e práticas`;
    // Injeta especializacao de agente (versao compacta)
    const agentPrompt = getActiveAgentPrompt();
    if (agentPrompt) {
        const agentId = getActiveAgent();
        const agent = /** @type {PromptObjectLike|null} */ (getAgentById(agentId));
        const agentName = agent ? agent.name : agentId;
        prompt += `\n\nESPECIALIZAÇÃO (${agentName}):\n${agentPrompt}`;
    }
    // Personality (compacto para lite prompt)
    prompt += _buildPersonalityPrompt();
    return protectPromptText(prompt);
}
// ================================================================
// PROFESSIONAL VALIDATION CONTEXT
// ================================================================
/**
 * Build professional validation context for the system prompt.
 * Gera contexto de validacao profissional para o prompt.
 *
 * @returns {string|null} - Contexto ou null se nao aplicavel
 */
function getProfessionalValidationContext() {
    const validation = /** @type {PromptObjectLike|null} */ (getValidationInfo());
    if (!validation)
        return null;
    const validatedElements = validation.elements || [];
    if (validatedElements.length === 0)
        return null;
    const dateStr = validation.validatedAt
        ? new Date(validation.validatedAt).toLocaleDateString('pt-BR')
        : 'desconhecida';
    // ATTEST-001 (E5) — a linha "Assinatura ativa: Sim" vinha de um BOOLEANO
    // congelado no ato da validacao, que viajava no .ecbt e seguia afirmando
    // atividade para sempre. Estado agora e DERIVADO de datas; sem verificacao
    // server-side (RF-7) o prompt afirma a OBSERVACAO e sua data, nunca "ativo".
    const subscription = getSubscriptionAssertion();
    return `Este modelo possui VALIDAÇÃO PROFISSIONAL.
Profissional responsável: ${validation.displayName} (${validation.councilId})
Data da validação: ${dateStr}
Situação da assinatura: ${subscription.label}

Elementos com selo profissional: ${validatedElements.join(', ')}

REGRAS ESPECIAIS PARA DADOS VALIDADOS:
1. Dados em elementos validados têm MAIOR CONFIABILIDADE — priorize-os em análises
2. Se houver conflito entre dados validados e não-validados, sinalize e dê preferência aos validados
3. Ao sugerir ações, indique quando um dado validado será afetado
4. Em análises de tendência, destaque que séries validadas têm respaldo técnico
5. A situação da assinatura acima é a CONSTATADA NA DATA INDICADA, não uma verificação
   em tempo real: nunca afirme que a assinatura está ativa agora. Se a constatação for
   antiga ou não confirmada, informe que a validação pode estar desatualizada`;
}
// ================================================================
// KNOWLEDGE REPOSITORY - Contexto de ativos disponiveis
// ================================================================
/**
 * Consulta o Supabase knowledge_assets para a area do projeto atual.
 * Retorna string formatada para injecao no system prompt.
 * Cache de 5 min, invalida em originChanged.
 *
 * @returns {Promise<string>} - Contexto formatado ou string vazia
 */
export async function getKnowledgeContext() {
    // Cache hit
    if (_knowledgeContextCache && Date.now() - _knowledgeContextTimestamp < KNOWLEDGE_CACHE_TTL) {
        return _knowledgeContextCache;
    }
    // Lazy-load vectorLayerOverlay for installed layers context
    if (!_vectorLayersMod) {
        try {
            _vectorLayersMod = await import('../io/geo/vectorLayerOverlay.js');
        }
        catch (e: any) {
            console.debug('[promptBuilder] vectorLayers lazy-load:', e?.message || e);
            /* silent */
        }
    }
    if (!hasOrigin()) {
        // No project origin - still report installed layers if any
        const layerCtx = _getInstalledLayersContext();
        return layerCtx || '';
    }
    try {
        // ../../ (não ../../../): este módulo está em app/js/core/llm/ —
        // 3 níveis subiam até app/ raiz → 404 /supabase-config.js no boot real.
        const cfgPath = /** @type {string} */ ('../../supabase-config.js');
        const { getSupabaseClient } = /** @type {any} */ (await import(/** @type {any} */ (cfgPath)));
        const supabase = getSupabaseClient();
        if (!supabase)
            return '';
        const origin = getOrigin();
        const { utmToWGS84 } = await import('../io/geo/coordinates.js');
        const wgs84 = utmToWGS84(origin);
        const { data, error } = await supabase.rpc('query_knowledge_for_area', {
            p_lon: wgs84.longitude,
            p_lat: wgs84.latitude,
            p_radius_km: 50,
        });
        if (error || !data || data.length === 0)
            return '';
        // Limitar a top 5 assets no prompt (economia de tokens).
        // Para busca completa, o LLM pode usar QUERY_KNOWLEDGE.
        const topAssets = data.slice(0, 5);
        // Agrupa por categoria
        const groups: Record<string, any[]> = {};
        for (const asset of topAssets) {
            const cat = asset.asset_category;
            if (!groups[cat])
                groups[cat] = [];
            groups[cat].push(asset);
        }
        /** @type {Record<string, string>} */
        const LABELS = {
            vector_layer: 'Camadas vetoriais',
            raster_tile: 'Imagens satelite',
            terrain_surface: 'Terreno/elevacao',
            regulatory_db: 'Normas regulatorias',
            training_dataset: 'Datasets ML',
            coastline: 'Referencia',
            transport_infrastructure: 'Infraestrutura rodoviaria',
        };
        let ctx = 'ATIVOS DE CONHECIMENTO DISPONIVEIS PARA ESTA AREA:\n';
        for (const [cat, assets] of Object.entries(groups)) {
            const label = (LABELS as Record<string, string>)[cat] || cat;
            const items = (assets as any[]).map((a: any) => {
                const count = a.feature_count
                    ? ` (${a.feature_count > 1000 ? Math.round(a.feature_count / 1000) + 'K' : a.feature_count})`
                    : '';
                return `${a.name}${count}`;
            });
            ctx += `- ${label}: ${items.join(', ')}\n`;
        }
        // Nota: top 5 no prompt; use QUERY_KNOWLEDGE para busca completa
        if (data.length > 5) {
            ctx += `(Mostrando top 5 de ${data.length}. Use QUERY_KNOWLEDGE para busca detalhada.)\n`;
        }
        // Append installed vector layers from the marketplace
        ctx += _getInstalledLayersContext();
        _knowledgeContextCache = ctx;
        _knowledgeContextTimestamp = Date.now();
        return ctx;
    }
    catch (e: any) {
        console.debug('[promptBuilder] supabaseCtx:', e?.message || e);
        // Even if Supabase fails, still report installed layers
        try {
            const layerCtx = _getInstalledLayersContext();
            if (layerCtx) {
                _knowledgeContextCache = layerCtx;
                _knowledgeContextTimestamp = Date.now();
                return layerCtx;
            }
        }
        catch (e2: any) {
            console.debug('[promptBuilder] layersCtx:', e2?.message || e2);
            /* silent */
        }
        return '';
    }
}
/**
 * Build a context string describing installed/loaded vector layers.
 * This tells the LLM what the user currently sees on the map.
 */
function _getInstalledLayersContext() {
    try {
        // Lazy-import to avoid circular dependency
        /** @type {any} */ const mod = _vectorLayersMod;
        if (!mod)
            return '';
        const layers = mod.getVectorLayersList();
        if (!layers || layers.length === 0)
            return '';
        const loaded = layers.filter((l: any) => l.loaded);
        const visible = layers.filter((l: any) => l.visible);
        if (loaded.length === 0 && visible.length === 0)
            return '';
        let ctx = '\nCAMADAS VETORIAIS INSTALADAS:\n';
        for (const l of layers) {
            const status = l.loaded
                ? `${l.featureCount.toLocaleString()} features [${l.sourceUsed || '?'}]`
                : l.loading
                    ? 'carregando...'
                    : 'disponivel';
            const vis = l.visible ? ' (visivel)' : '';
            ctx += `- ${l.name}: ${status}${vis}\n`;
        }
        return ctx;
    }
    catch (e: any) {
        console.debug('[promptBuilder] installedLayers:', e?.message || e);
        return '';
    }
}
// ================================================================
// HELPERS
// ================================================================
// ================================================================
// REGISTRY ACTIONS - Catalogo auto-gerado de acoes do registry
// ================================================================
/**
 * Gera secao do prompt com acoes do registry agrupadas por categoria.
 * Tier 1: sempre incluido. Tier 2: incluido se ha cena 3D.
 * Tier 3: nunca incluido (disponivel via LIST_CAPABILITIES).
 *
 * Filtra acoes que ja sao custom (ADD_ELEMENT, ADD_OBSERVATION, etc.)
 * para evitar duplicatas no prompt.
 *
 * @returns {string}
 */
function getRegistryActionsPrompt() {
    // Agrupa por categoria
    const byCategory: Record<string, any[]> = {};
    for (const entry of ACTION_REGISTRY) {
        const cat = entry.cat;
        if (!byCategory[cat])
            byCategory[cat] = [];
        byCategory[cat].push(entry);
    }
    let prompt = '';
    let actionCount = 0;
    for (const [cat, entries] of Object.entries(byCategory)) {
        const tier = /** @type {Record<string, number>} */ (LLM_CATEGORY_TIERS)[cat] || 3;
        // Tier 3: pular (disponivel via LIST_CAPABILITIES)
        if (tier === 3)
            continue;
        // Filtra acoes que ja sao custom handlers (evita duplicata)
        const filtered = (entries as any[]).filter((e: any) => {
            const llmName = handlerToLlmAction(e.name);
            return !CUSTOM_ACTIONS.has(llmName);
        });
        if (filtered.length === 0)
            continue;
        const desc = /** @type {Record<string, string>} */ (LLM_CATEGORY_DESCRIPTIONS)[cat] || cat;
        prompt += `\n── ${cat.toUpperCase()} ── ${desc}\n`;
        for (const e of filtered) {
            const llmName = handlerToLlmAction(e.name);
            const paramStr = e.params.length > 0 ? `(${e.params.join(', ')})` : '(sem params)';
            prompt += `   ${llmName} ${paramStr}\n`;
            actionCount++;
        }
    }
    if (actionCount === 0)
        return '';
    return `
═ AÇÕES ADICIONAIS (${actionCount} ações, use o nome exato como "action") ═
Para IDs de elementos, use os IDs listados acima em ELEMENTOS ATUAIS.
${prompt}
Para descobrir mais ações em outras categorias, use LIST_CAPABILITIES com category.`;
}
// ================================================================
// TOOL ACTIONS - Acoes condicionais baseadas em ferramentas ativas
// ================================================================
/**
 * Builds prompt section for tool-based actions.
 * Gera a secao do prompt com as acoes das ferramentas ativas.
 * Se nenhuma ferramenta estiver ativa, retorna string vazia.
 *
 * @returns {string}
 */
function getToolActionsPrompt() {
    const activeActions = getActiveToolActions();
    if (activeActions.length === 0)
        return '';
    /** @type {Record<string, string>} */
    const TOOL_ACTION_DEFS = {
        ANALYZE_TRENDS: `
7. ANALYZE_TRENDS - Analisar tendências temporais das observações
   Executa regressão linear, Mann-Kendall e Sen's Slope em todas as séries ou uma específica
   Parâmetros opcionais: elementId (para analisar apenas um elemento), parameterId
   Exemplos: "analisar tendências", "qual a tendência do benzeno no PM-01?"`,
        SUGGEST_SAMPLING: `
8. SUGGEST_SAMPLING - Sugerir pontos ótimos para nova campanha de amostragem
   Calcula cobertura espacial e identifica lacunas na malha de monitoramento
   Parâmetros opcionais: count (número de pontos, default 5)
   Exemplos: "onde devo instalar novos poços?", "sugerir pontos de amostragem"`,
        CLEAR_MARKERS: `
   CLEAR_MARKERS - Remover marcadores de recomendação da cena 3D
   Sem parâmetros. Exemplos: "limpar marcadores", "remover pontos sugeridos"`,
        RUN_AUDIT: `
9. RUN_AUDIT - Executar auditoria ESG anti-greenwashing
   Roda testes estatísticos (Benford), verifica qualidade da investigação e analisa alegações
   Parâmetros opcionais: reportText (texto do relatório para analisar alegações)
   Exemplos: "auditar os dados", "verificar qualidade dos dados", "rodar auditoria ESG"`,
        SITE_RESEARCH: `
10. SITE_RESEARCH - Pesquisar dados públicos de uma área para modelo conceitual
   Consulta Nominatim (geocodificação), IBGE (município) e Overpass (entorno)
   Parâmetros: address (endereço ou nome), lat, lon, radius (metros, default 1000)
   Exemplos: "pesquisar área na Rua Augusta 100, São Paulo", "buscar dados de -23.55, -46.63", "pesquisar entorno do posto Shell Ipiranga"`,
        POPULATE_FROM_RESEARCH: `
11. POPULATE_FROM_RESEARCH - Inserir dados da pesquisa no modelo
   Usa o resultado da última SITE_RESEARCH para popular o modelo automaticamente.
   Cria elementos (corpos d'água, indústrias, áreas sensíveis), preenche coordenadas e dados do projeto.
   Parâmetros opcionais: categories (array: "waterBodies", "industries", "sensitiveSites"), includeCoordinates (boolean), mode ("append" ou "replace")
   IMPORTANTE: mode default é "append" (adiciona sem apagar). Só use mode:"replace" se o usuário pedir explicitamente para substituir/limpar o modelo.
   Exemplos: "inserir dados no modelo", "popular modelo", "adicionar ao modelo", "usar esses dados"`,
    };
    let section = '\n═ FERRAMENTAS ATIVAS ═\n';
    for (const action of activeActions) {
        if ((TOOL_ACTION_DEFS as Record<string, string>)[action]) {
            section += (TOOL_ACTION_DEFS as Record<string, string>)[action];
        }
    }
    return section;
}
/**
 * Formata a mensagem do usuário para envio
 * @param {string} userInput - Texto digitado pelo usuário
 * @returns {string}
 */
export function formatUserMessage(userInput: string) {
    return `Comando do usuário: "${userInput}"

Analise o comando acima e retorne a resposta em formato JSON conforme instruído.`;
}
/**
 * Gera resumo do contexto atual (para debug)
 * @returns {Object}
 */
export function getContextSummary() {
    return {
        elements: getAllElements().length,
        campaigns: getAllCampaigns().length,
        parameters: CONFIG.PARAMETERS.length,
        families: getEnabledFamilies().length,
    };
}
// ================================================================
// AGENTIC PROMPT - Estende o prompt completo com function calling
// ================================================================
/**
 * Constroi prompt agentic com definicoes de funcoes.
 * Usado pelo agent loop para multi-turn reasoning.
 * Inclui funcoes QUERY_STATE, QUERY_COMPLIANCE, START_WORKFLOW.
 *
 * @returns {string}
 */
export function buildAgenticPrompt() {
    let prompt = buildSystemPrompt();
    // Adiciona secao de funcoes agenticas
    const functionsSection = buildFunctionDefinitionsPrompt();
    prompt += `

═══════════════════════════════════════════════════════════════
MODO AGENTIC — CONSULTAS E WORKFLOWS
═══════════════════════════════════════════════════════════════

Você pode consultar o estado do modelo ANTES de responder.
Consultas de estado (QUERY_*) são executadas automaticamente sem confirmação.
Retorne uma consulta como action normal em JSON — o resultado será fornecido para você continuar.

${functionsSection}`;
    return prompt;
}
//# sourceMappingURL=promptBuilder.js.map
