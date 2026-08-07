// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   AI REPORT BOT — C5b from SPEC_REPORT_SCRIPTS_LIBRARY
   Gerador de trechos de relatorios ambientais via LLM com templates

   Fluxo:
   1. User abre modal → escolhe template (Introducao, Conclusao, Risco, Sumario Exec)
   2. User escolhe tom (tecnico vs executivo)
   3. Engine coleta contexto do modelo: elementos, campanhas, EIS score
   4. applyTemplate() monta systemPrompt + userMessage preenchendo placeholders
   5. sendFn callback (injection) chama LLM
   6. Resultado vem com watermark IA obrigatorio
   7. User preview → thumbs up/down feedback → inserir no editor

   Dependency injection: sendFn callback preserva testabilidade do core
   (mesmo padrao do translationEngine.js C5a).

   Referencia: docs/specs/features/SPEC_REPORT_SCRIPTS_LIBRARY.md (C5b)
   ================================================================ */

import { idbSet, idbGet } from '../../utils/storage/idbStore.js';
import { createLogger } from '../../utils/helpers/logger.js';
// MOD-LIB-MIG-001 consumers wire — templates declarados por library modules
import { getRegisteredReportTemplates } from '../libraries/registry.js';

const log = createLogger('AiReportBot');

// ── Constants ────────────────────────────────────────────────────────────────

/** IDB key for custom templates persistence */
const IDB_CUSTOM_TEMPLATES_KEY = 'ecbyts-ai-report-custom-templates';

/** IDB key for feedback history (thumbs up/down) */
const IDB_FEEDBACK_KEY = 'ecbyts-ai-report-feedback';

/**
 * Watermark HTML inserted at the start of every AI-generated section.
 * This MUST be visually distinct and never stripped silently - users and
 * reviewers need to identify AI content at a glance.
 */
export const AI_WATERMARK = Object.freeze({
    html: '<div class="ai-generated-marker" data-ai-watermark="true" style="background:rgba(74,158,255,0.08);border-left:3px solid #4a9eff;padding:8px 12px;margin:8px 0;font-size:11px;color:#4a9eff;font-style:italic">Conteúdo gerado por IA — revisar antes de publicar.</div>',
    text: '[Conteúdo gerado por IA — revisar antes de publicar]',
});

/** Supported tone values for template generation */
export const TONES = Object.freeze(['technical', 'executive']);

/**
 * Rate limit: max calls per window. Prevents runaway costs.
 * The user controls concrete enforcement (fail-fast if exceeded).
 */
const RATE_LIMIT = Object.freeze({
    maxCalls: 10,
    windowMs: 60 * 60 * 1000, // 1 hour
});

/** In-memory rate limit tracking — { timestamps: number[] } */
/** @type {{ timestamps: number[] }} */
const _rateLimitState: { timestamps: number[] } = { timestamps: [] };

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} AiReportTemplate
 * @property {string} id - Unique identifier
 * @property {string} name - Display name
 * @property {string} description - Short description
 * @property {string} systemPrompt - Base system prompt (with {{PLACEHOLDERS}})
 * @property {string} userPromptTemplate - User message template (with {{PLACEHOLDERS}})
 * @property {string[]} requiredContext - List of context keys needed ('elements', 'campaigns', 'eis')
 * @property {boolean} [isCustom] - True if user-defined (persisted in IDB)
 */

/**
 * @typedef {Object} ReportContext
 * @property {number} elementCount - Total elements in model
 * @property {Object<string, number>} familyCounts - Count by family (wells, plumes, etc)
 * @property {number} campaignCount - Total sampling campaigns
 * @property {number|null} eisScore - Current EIS score (0-5) if computed
 * @property {string|null} siteName - Site/project name if available
 * @property {string[]} [regulations] - Cited regulations (e.g. ['CONAMA 420', 'CETESB DD-256'])
 */

// ── Built-in templates ──────────────────────────────────────────────────────

/**
 * Four built-in templates covering the core environmental report sections.
 * Each template uses {{placeholders}} that get replaced by applyTemplate().
 */
export const BUILTIN_TEMPLATES = Object.freeze([
    {
        id: 'introduction',
        name: 'Introdução',
        description: 'Seção de abertura do relatório com contexto do site e escopo',
        systemPrompt:
            'Você é um engenheiro ambiental sênior escrevendo a seção de INTRODUÇÃO de um relatório técnico. ' +
            'Tom: {{tone}}. Idioma: pt-BR. ' +
            'Nunca invente números ou nomes de laboratórios. ' +
            'Use apenas o contexto fornecido. ' +
            'Retorne HTML simples (p, strong, ul) sem markdown.',
        userPromptTemplate:
            'Escreva uma introdução para um relatório ambiental com o seguinte contexto:\n\n' +
            'Site: {{siteName}}\n' +
            'Elementos monitorados: {{elementCount}} ({{familyBreakdown}})\n' +
            'Campanhas de amostragem: {{campaignCount}}\n' +
            'Regulamentações aplicáveis: {{regulations}}\n' +
            'EIS atual: {{eisScore}}\n\n' +
            'A introdução deve: (1) contextualizar o objetivo do estudo, (2) listar o escopo ' +
            'de dados coletados, (3) citar as regulamentações. Máximo 3 parágrafos.',
        requiredContext: ['elementCount', 'campaignCount'],
        figureProviders: [], // Introdução não recebe figuras automaticamente
    },
    {
        id: 'conclusion',
        name: 'Conclusão',
        description: 'Seção de fechamento com síntese dos achados e próximos passos',
        systemPrompt:
            'Você é um engenheiro ambiental sênior escrevendo a seção de CONCLUSÃO de um relatório técnico. ' +
            'Tom: {{tone}}. Idioma: pt-BR. ' +
            'Baseie-se apenas no contexto fornecido. Nunca extrapole. ' +
            'Se o EIS score for baixo (<3), recomende ações corretivas. ' +
            'Retorne HTML simples (p, strong, ul) sem markdown.',
        userPromptTemplate:
            'Escreva uma conclusão para um relatório ambiental com o seguinte contexto:\n\n' +
            'Elementos: {{elementCount}}\n' +
            'Campanhas: {{campaignCount}}\n' +
            'EIS: {{eisScore}}\n' +
            'Regulamentações: {{regulations}}\n\n' +
            'A conclusão deve: (1) sintetizar os principais achados, (2) avaliar conformidade ' +
            'regulatória, (3) listar próximos passos objetivos. Máximo 3 parágrafos.',
        requiredContext: ['elementCount', 'campaignCount'],
        figureProviders: [], // Conclusão não recebe figuras automaticamente
    },
    {
        id: 'risk-analysis',
        name: 'Análise de Risco',
        description: 'Avaliação qualitativa de risco baseada em elementos e EIS',
        systemPrompt:
            'Você é um especialista em análise de risco ambiental escrevendo a seção de ANÁLISE DE RISCO. ' +
            'Tom: {{tone}}. Idioma: pt-BR. ' +
            'Use o EIS score como referência de criticidade: ≥4.5 baixo, 3.5-4.5 moderado, <3.5 alto. ' +
            'Nunca invente dados quantitativos. ' +
            'Retorne HTML simples (p, strong, ul) sem markdown.',
        userPromptTemplate:
            'Escreva uma análise de risco para um site ambiental com o seguinte contexto:\n\n' +
            'Elementos: {{familyBreakdown}}\n' +
            'EIS: {{eisScore}}\n' +
            'Campanhas: {{campaignCount}}\n\n' +
            'A análise deve: (1) classificar o nível de risco global baseado no EIS, ' +
            '(2) identificar os receptores potenciais, (3) propor medidas de mitigação ' +
            'proporcionais ao risco. Máximo 4 parágrafos.',
        requiredContext: ['eisScore'],
        figureProviders: [], // Análise de Risco textual — sem figuras automáticas
    },
    {
        id: 'executive-summary',
        name: 'Resumo Executivo',
        description: 'Síntese de 1 página para tomadores de decisão',
        systemPrompt:
            'Você é um engenheiro ambiental sênior escrevendo o RESUMO EXECUTIVO de um relatório técnico. ' +
            'Tom: executivo (mesmo quando tone={{tone}} — resumo sempre é executivo). Idioma: pt-BR. ' +
            'Máximo 250 palavras. ' +
            'Use apenas dados do contexto. ' +
            'Retorne HTML simples (p, strong, ul) sem markdown.',
        userPromptTemplate:
            'Escreva um resumo executivo com o seguinte contexto:\n\n' +
            'Site: {{siteName}}\n' +
            'Elementos: {{elementCount}}\n' +
            'Campanhas: {{campaignCount}}\n' +
            'EIS: {{eisScore}}\n\n' +
            'O resumo deve: (1) abrir com o status de conformidade em 1 frase, (2) listar ' +
            '3-5 achados principais em bullets, (3) fechar com recomendação de ação. ' +
            'Máximo 250 palavras totais.',
        requiredContext: [],
        figureProviders: [], // Resumo Executivo — sem figuras automáticas
    },
    {
        // CETESB DD 038/2017/C — Relatório de Avaliação Preliminar (Fase I), 12 capítulos.
        id: 'cetesb-avaliacao-preliminar',
        name: 'CETESB — Avaliação Preliminar (Fase I)',
        description: 'Scaffold de 12 capítulos do Relatório de Avaliação Preliminar (GAC, DD 038/2017)',
        systemPrompt:
            'Você é um engenheiro ambiental sênior elaborando um RELATÓRIO DE AVALIAÇÃO PRELIMINAR de área contaminada ' +
            'conforme CETESB DD 038/2017/C e Decreto Estadual SP 59.263/2013 (Gerenciamento de Áreas Contaminadas — GAC). ' +
            'Tom: {{tone}}. Idioma: pt-BR. Use SOMENTE os dados reais fornecidos; NUNCA invente concentrações, datas, ' +
            'nomes de laboratórios ou coordenadas. Onde faltar um dado obrigatório, escreva "[A PREENCHER: <descrição>]" ' +
            'para o Responsável Técnico completar. No Cap. 9 classifique o nível de confiança do MCA 1 (A, B ou C) com ' +
            'justificativa. Estruture em capítulos com <h2>. Retorne HTML (h2, p, strong, ul, ol) sem markdown.',
        userPromptTemplate:
            'Elabore o Relatório de Avaliação Preliminar (CETESB) com os 12 capítulos abaixo, usando os dados reais.\n\n' +
            'DADOS DO MODELO:\nSite: {{siteName}} | Elementos: {{elementCount}} ({{familyBreakdown}}) | ' +
            'Campanhas: {{campaignCount}} | Período: {{dateRange}} | Regulamentações: {{regulations}} | EIS: {{eisScore}}\n' +
            'Observações: {{observationSummary}}\nContaminantes de interesse: {{topContaminants}}\n\n' +
            'ESTRUTURA (um <h2> por capítulo) e CONTEÚDO OBRIGATÓRIO (DD 038/2017 §1.2):\n' +
            '1. Introdução e Objetivos — objetivo da AP, classificação como AS, escopo do GAC.\n' +
            '2. Localização e Dimensões da Área — coordenadas UTM SIRGAS 2000 no centro da área; croqui/planta de localização; dimensões.\n' +
            '3. Aspectos Físicos Ambientais — geologia, geomorfologia, pedologia, hidrogeologia e recursos hídricos regionais e locais; mapas geológico/pedológico/hidrogeológico.\n' +
            '4. Uso e Ocupação da Terra e Ativos a Proteger — raio de 500 m; mapa de uso/ocupação indicando AP, AS, AC (ACI/ACRi/ACRe/ACRu/ACcrítica), AME e AR; bens a proteger (corpos d\'água com classificação) e poços de abastecimento (cadastro DAEE).\n' +
            '5. Caracterização da Área de Estudo — histórico de uso e ocupação (usos pregressos) + uso atual; por tipo de atividade (industrial/armazenamento de resíduos/comercial-serviços/outras): processos, matérias-primas, produtos, resíduos, efluentes e emissões, substâncias químicas associadas, layout atual e pretéritos, drenagem pluvial, registros de acidentes/vazamentos/descartes; plantas das áreas fonte e das fontes potenciais/primárias.\n' +
            '6. Áreas Externas em Gestão de Locais Contaminados — locais contaminados conhecidos/potenciais identificados na CETESB + inspeções; resumos de investigações na vizinhança.\n' +
            '7. Análise Multitemporal de Imagens Aéreas e de Satélite — interpretação do levantamento aerofotogramétrico temporal (raio 500 m) para alterações de uso/ocupação e fontes potenciais.\n' +
            '8. Inspeção da Área de Interesse — processos e atividades verificados in loco; produtos químicos de interesse (COIs) e fontes de contaminação.\n' +
            '9. Modelo Conceitual da Área (MCA 1) — MCA 1 geral + modelos específicos por área fonte (fonte→caminho→receptor); classifique o NÍVEL DE CONFIANÇA (A, B ou C) COM JUSTIFICATIVA.\n' +
            '10. Plano de Investigação Confirmatória — (i) pontos de amostragem em planta por área fonte associados a fontes potenciais e indícios; (ii) métodos de varredura/screening ou justificativa estatística para distribuição probabilística; (iii) justificativas para seleção de COIs, meios amostrados, posição/número/profundidade de pontos, parâmetros e métodos.\n' +
            '11. Considerações Finais — necessidade ou não de prosseguir o GAC (potencial de contaminação solo/água subterrânea).\n' +
            '12. Referências Bibliográficas — inclua CETESB DD 038/2017/C, CETESB DD 256/2016 (Valores Orientadores) e Decreto SP 59.263/2013.\n\n' +
            'AO FINAL, inclua os blocos transversais obrigatórios (§1.2 r-u): fontes de informação consultadas (incl. entrevistados); identificação de TODOS os Responsáveis Legais e do Responsável Técnico (e-mails e endereços); Declaração de Responsabilidade assinada; cópia atualizada (≤3 meses) das matrículas do imóvel. Toda planta deve ser georreferenciada (UTM). Para itens sem dado real, escreva "[A PREENCHER: <descrição>]".',
        requiredContext: ['elementCount'],
        // Figuras DD 038/2017 §1.2: raio 500 m (uso/ocupação + bens a proteger),
        // mapas geológico/pedológico/hidrogeológico, vista 3D do sítio com plumas
        // potenciais, documentação fotográfica de campo.
        figureProviders: ['radius-500m', 'geo-pedo-maps', 'scene-3d', 'photolog'],
    },
    {
        // CETESB DD 038/2017/C — Relatório de Investigação Confirmatória (Fase II), 7 capítulos.
        id: 'cetesb-investigacao-confirmatoria',
        name: 'CETESB — Investigação Confirmatória (Fase II)',
        description: 'Scaffold de 7 capítulos do Relatório de Investigação Confirmatória (GAC, DD 038/2017)',
        systemPrompt:
            'Você é um engenheiro ambiental sênior elaborando um RELATÓRIO DE INVESTIGAÇÃO CONFIRMATÓRIA (Fase II) ' +
            'conforme CETESB DD 038/2017/C e Decreto Estadual SP 59.263/2013 (GAC). Tom: {{tone}}. Idioma: pt-BR. ' +
            'Use SOMENTE dados reais; compare as concentrações com os Valores de Intervenção (VI) da CETESB ' +
            '(DD 256/2016 — Valores Orientadores para Solo e Águas Subterrâneas no Estado de SP) e, quando ' +
            'não houver VI, com os Regional Screening Levels (RSL) da US EPA. NUNCA invente valores. Marque ' +
            '"[A PREENCHER: <descrição>]" onde faltar dado obrigatório. O relatório deve ser CONCLUSIVO sobre a ' +
            'existência de contaminação: classifique como Área Contaminada sob Investigação (ACI) se houver concentração ' +
            'acima do VI, produto em fase livre, perigo, ou resíduo perigoso (art. 28 do Decreto 59.263/2013). ' +
            'Estruture em capítulos com <h2>. Retorne HTML sem markdown.',
        userPromptTemplate:
            'Elabore o Relatório de Investigação Confirmatória (CETESB) com os 7 capítulos abaixo, usando os dados reais.\n\n' +
            'DADOS DO MODELO:\nSite: {{siteName}} | Elementos: {{elementCount}} ({{familyBreakdown}}) | ' +
            'Campanhas: {{campaignCount}} | Período: {{dateRange}} | EIS: {{eisScore}}\n' +
            'Observações: {{observationSummary}}\nExcedências/contaminantes: {{topContaminants}}\n\n' +
            'ESTRUTURA (um <h2> por capítulo) e CONTEÚDO OBRIGATÓRIO (DD 038/2017 §2.1):\n' +
            '1. Introdução e Objetivos — confirmar ou não a contaminação; investigar todas as fontes potenciais/primárias da AP; base legal (art. 23/27 Decreto 59.263/2013).\n' +
            '2. Modelo Conceitual da Área — MCA da Avaliação Preliminar, usado como base do escopo.\n' +
            '3. Escopo da Investigação Confirmatória e Serviços Realizados — justificativa do posicionamento dos pontos de sondagem/coleta (solo, água subterrânea, outros meios); descrição dos métodos de investigação e amostragem; georreferenciamento (UTM SIRGAS 2000) de sondagens, pontos de amostragem, poços de monitoramento, poços de abastecimento e nascentes.\n' +
            '4. Resultados — (a) perfil de cada sondagem: litologia/materiais, espessuras, unidades hidroestratigráficas, profundidade do NA, medições de campo, profundidades de amostragem; (b) seções representativas; (c) geologia/pedologia/hidrogeologia local relacionada à regional; (d) perfil construtivo dos poços; (e) TABELA de poços (NA, fase livre + altura da coluna, cota topográfica, carga hidráulica, condutividade); (f) mapa potenciométrico com direção de fluxo; (g) interpretação das análises químicas vs Valores de Intervenção (VI) CETESB — onde não houver VI, US EPA RSL; concentrações em planta e seções; (h) laudos analíticos assinados (razão social do lab + nº do laudo); (i) cadeias de custódia + ficha de recebimento; (j) documentação fotográfica de campo. Insira tabelas de excedência, mapa potenciométrico e figuras pela barra de ferramentas.\n' +
            '5. Atualização do Modelo Conceitual da Área — MCA 2 (revisão do MCA 1 com os dados confirmatórios).\n' +
            '6. Considerações Finais e Recomendações — conclua EXPLICITAMENTE sobre ACI (art. 28: concentração > VI, fase livre, perigo, ou resíduo perigoso); se ACI, próximos passos: Investigação Detalhada + Avaliação de Risco.\n' +
            '7. Referências Bibliográficas — inclua CETESB DD 038/2017/C, CETESB DD 256/2016 (Valores Orientadores) e Decreto SP 59.263/2013.\n\n' +
            'AO FINAL, inclua os blocos transversais obrigatórios (§2.1 q-s): Declaração de Responsabilidade (modelo ANEXO A) assinada pelos Responsáveis Legal e Técnico; identificação de TODOS os Responsáveis Legais e do Responsável Técnico (art. 18; e-mails e endereços); cópia atualizada (≤3 meses) das matrículas do imóvel. Toda planta deve ser georreferenciada (UTM SIRGAS 2000). Para itens sem dado real, escreva "[A PREENCHER: <descrição>]". Conclua EXPLICITAMENTE se a área deve ser classificada como ACI.',
        requiredContext: ['elementCount'],
        // Figuras DD 038/2017 §2.1: raio 500 m, mapas geo-pedo do entorno, vista 3D
        // com plumas confirmadas, documentação fotográfica de poços/sondagens.
        figureProviders: ['radius-500m', 'geo-pedo-maps', 'scene-3d', 'photolog'],
    },
]);

// ── Pure helpers (exported for testing) ──────────────────────────────────────

/**
 * Build a ReportContext from a model snapshot. Pure function - no side effects.
 * The caller passes the elements/campaigns/EIS arrays directly to avoid importing
 * browser-only managers in this core module.
 *
 * @param {Object} snapshot
 * @param {Array<any>} [snapshot.elements] - Elements array
 * @param {Array<any>} [snapshot.campaigns] - Campaigns array
 * @param {number|null} [snapshot.eisScore] - EIS score 0-5
 * @param {string} [snapshot.siteName] - Site name
 * @param {string[]} [snapshot.regulations] - Applicable regulations
 * @returns {ReportContext}
 */
export function buildReportContext(snapshot: any) {
    const { elements = [], campaigns = [], eisScore = null, siteName = null, regulations = [] } = snapshot || {};

        const familyCounts: Record<string, number> = {};
    for (const el of elements) {
        const family = el?.family || 'unknown';
        familyCounts[family] = (familyCounts[family] || 0) + 1;
    }

    return {
        elementCount: elements.length,
        familyCounts,
        campaignCount: campaigns.length,
        eisScore: typeof eisScore === 'number' ? eisScore : null,
        siteName: siteName || null,
        regulations: Array.isArray(regulations) ? regulations : [],
        // Data-grounding (Fase 1.5): strings/tabelas determinísticas computadas pelo
        // handler a partir das observações + motor de excedências (não inventadas).
        observationSummary: snapshot?.observationSummary || '',
        dateRange: snapshot?.dateRange || '',
        topContaminants: snapshot?.topContaminants || '',
        observationTable: snapshot?.observationTable || '',
        exceedanceTable: snapshot?.exceedanceTable || '',
        groundingBlock: snapshot?.groundingBlock || '',
    };
}

/**
 * Format a family breakdown as a human-readable string.
 * Example: { wells: 8, plumes: 3 } → "8 poços, 3 plumas"
 *
 * @param {Object<string, number>} familyCounts
 * @returns {string}
 */
export function formatFamilyBreakdown(familyCounts: any) {
    if (!familyCounts || typeof familyCounts !== 'object') return '';
        const labels: Record<string,string> = {
        well: 'poço(s)',
        plume: 'pluma(s)',
        lake: 'lago(s)',
        river: 'rio(s)',
        spring: 'nascente(s)',
        building: 'edificação(ões)',
        tank: 'tanque(s)',
        waste: 'resíduo(s)',
        boundary: 'limite(s)',
        blueprint: 'blueprint(s)',
        remediation: 'sistema(s) de remediação',
    };
    return Object.entries(familyCounts)
        .filter(([, count]) => (count as any) > 0)
        .map(([family, count]) => `${count} ${labels[family] || family}`)
        .join(', ');
}

/**
 * Replace {{placeholders}} in a template string with context values.
 * Missing values are replaced with sensible defaults ('N/A', etc).
 *
 * @param {string} template - Template with {{placeholders}}
 * @param {ReportContext} context - Context data
 * @param {string} tone - 'technical' or 'executive'
 * @returns {string}
 */
export function fillTemplate(template: any, context: any, tone: any) {
    if (!template || typeof template !== 'string') return '';
    const ctx = (context || {} as any);
        const substitutions: Record<string, string> = {
        tone: tone === 'executive' ? 'executivo' : 'técnico',
        elementCount: String(ctx.elementCount ?? 0),
        campaignCount: String(ctx.campaignCount ?? 0),
        eisScore: ctx.eisScore !== null && ctx.eisScore !== undefined ? ctx.eisScore.toFixed(2) : 'N/A',
        siteName: ctx.siteName || 'Site sem nome',
        regulations: Array.isArray(ctx.regulations) && ctx.regulations.length > 0 ? ctx.regulations.join(', ') : 'N/A',
        familyBreakdown: formatFamilyBreakdown(ctx.familyCounts) || 'Nenhum elemento cadastrado',
        // Data-grounding (Fase 1.5) — valores reais extraídos do modelo.
        observationSummary: ctx.observationSummary || 'Nenhuma observação registrada no modelo.',
        dateRange: ctx.dateRange || 'N/A',
        topContaminants: ctx.topContaminants || 'Nenhum parâmetro excede os limites avaliados.',
        observationTable: ctx.observationTable || '',
        exceedanceTable: ctx.exceedanceTable || '',
    };
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) =>
        substitutions[key] !== undefined ? substitutions[key] : match,
    );
}

/**
 * Validate that a template's required context is present in the model snapshot.
 *
 * @param {AiReportTemplate} template
 * @param {ReportContext} context
 * @returns {{ ok: boolean, missing: string[] }}
 */
export function validateContext(template: any, context: any) {
    const required = Array.isArray(template?.requiredContext) ? template.requiredContext : [];
    const missing = [];
    for (const key of required) {
        const value = (context as any)?.[key];
        if (value === undefined || value === null || value === 0) {
            missing.push(key);
        }
    }
    return { ok: missing.length === 0, missing };
}

/**
 * Prepend the AI watermark to generated HTML content.
 * NEVER skip the watermark - transparency is non-negotiable for AI-generated content.
 *
 * @param {string} content - Raw LLM output (HTML)
 * @returns {string}
 */
export function applyWatermark(content: any) {
    if (!content || typeof content !== 'string') return AI_WATERMARK.html;
    // If already watermarked, don't double-stamp
    if (content.includes('data-ai-watermark="true"')) return content;
    return AI_WATERMARK.html + content;
}

/**
 * Check if a call is allowed under the rate limit.
 * Side effect: prunes expired timestamps from _rateLimitState.
 *
 * @param {number} [now=Date.now()]
 * @returns {{ allowed: boolean, remaining: number, resetAt: number }}
 */
export function checkRateLimit(now = Date.now()) {
    const cutoff = now - RATE_LIMIT.windowMs;
    _rateLimitState.timestamps = _rateLimitState.timestamps.filter((t) => t > cutoff);
    const used = _rateLimitState.timestamps.length;
    const remaining = Math.max(0, RATE_LIMIT.maxCalls - used);
    const allowed = used < RATE_LIMIT.maxCalls;
    const oldest = _rateLimitState.timestamps[0] || now;
    return { allowed, remaining, resetAt: oldest + RATE_LIMIT.windowMs };
}

/**
 * Record a rate limit consumption. Call after successful generation.
 */
export function recordRateLimitCall(now = Date.now()) {
    _rateLimitState.timestamps.push(now!);
}

/**
 * Reset rate limit (for testing).
 */
export function _resetRateLimit() {
    _rateLimitState.timestamps = [];
}

// ── Custom templates (IDB persistence) ──────────────────────────────────────

/**
 * Save a custom template to IDB.
 *
 * @param {AiReportTemplate} template
 * @returns {Promise<AiReportTemplate>}
 */
export async function saveCustomTemplate(template: any) {
    if (!template || !template.id || !template.name) {
        throw new Error('saveCustomTemplate: template must have id and name');
    }
    if (!template.systemPrompt || !template.userPromptTemplate) {
        throw new Error('saveCustomTemplate: template must have systemPrompt and userPromptTemplate');
    }
    const list = (await idbGet(IDB_CUSTOM_TEMPLATES_KEY)) || [];
    const existing = Array.isArray(list) ? list : [];
    const idx = existing.findIndex((t) => t.id === template.id);
    const toSave = { ...template, isCustom: true };
    if (idx >= 0) existing[idx] = toSave;
    else existing.push(toSave);
    await idbSet(IDB_CUSTOM_TEMPLATES_KEY, existing);
    log.info('Saved custom template: %s', template.id);
    return toSave;
}

/**
 * Get all custom templates from IDB.
 *
 * @returns {Promise<AiReportTemplate[]>}
 */
export async function getCustomTemplates() {
    try {
        const list = await idbGet(IDB_CUSTOM_TEMPLATES_KEY);
        return Array.isArray(list) ? list : [];
    } catch (err: any) {
        log.warn('Failed to load custom templates: %s', err?.message);
        return [];
    }
}

/**
 * Delete a custom template by ID.
 *
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteCustomTemplate(id: any) {
    const list = (await idbGet(IDB_CUSTOM_TEMPLATES_KEY)) || [];
    const existing = Array.isArray(list) ? list : [];
    const filtered = existing.filter((t) => t.id !== id);
    if (filtered.length === existing.length) return false;
    await idbSet(IDB_CUSTOM_TEMPLATES_KEY, filtered);
    return true;
}

// ── Library templates (MOD-LIB-MIG-001 consumers wire) ──────────────────────
// Templates declarados por library modules (manifests validados pelo B1
// trust model) entram no mesmo seletor dos built-in/custom. O markdown do
// manifest vira o userPromptTemplate; os bindings são os placeholders
// canônicos do data grounding ({{observationSummary}}, {{exceedanceTable}},
// etc). systemPrompt padronizado anti-alucinação — módulo da library NUNCA
// injeta system prompt próprio (seria vetor de prompt injection).

const LIBRARY_TEMPLATE_SYSTEM_PROMPT =
    'Você é um engenheiro ambiental sênior preenchendo um template de relatório técnico. ' +
    'Tom: {{tone}}. Idioma: pt-BR. ' +
    'Nunca invente números, nomes de laboratórios ou dados ausentes — use "[A PREENCHER]". ' +
    'Use apenas o contexto fornecido. ' +
    'Siga a estrutura de seções do template à risca. ' +
    'Retorne HTML simples (h2, p, strong, ul, table) sem markdown.';

/**
 * Adapt library-registered report templates to the AiReportTemplate shape.
 * Defensivo: registry indisponível (boot parcial/teste node) → lista vazia.
 *
 * @returns {AiReportTemplate[]}
 */
export function getLibraryTemplates(): any[] {
    try {
        const declared = getRegisteredReportTemplates();
        return declared.map((t: any) => ({
            id: `lib:${t.id}`,
            name: `${t.name}`,
            description: 'Template da Library (manifest declarativo validado)',
            systemPrompt: LIBRARY_TEMPLATE_SYSTEM_PROMPT,
            userPromptTemplate: String(t.markdown || ''),
            requiredContext: [],
            figureProviders: [],
            isLibraryTemplate: true,
        }));
    } catch (err: any) {
        log.warn('Failed to load library templates: %s', err?.message);
        return [];
    }
}

/**
 * Get all available templates (built-in + library + custom).
 *
 * @returns {Promise<AiReportTemplate[]>}
 */
export async function getAllTemplates() {
    const custom = await getCustomTemplates();
    return [...BUILTIN_TEMPLATES, ...getLibraryTemplates(), ...custom];
}

/**
 * Find a template by ID across built-in + library + custom.
 *
 * @param {string} id
 * @returns {Promise<AiReportTemplate|null>}
 */
export async function getTemplateById(id: any) {
    const builtin = BUILTIN_TEMPLATES.find((t) => t.id === id);
    if (builtin) return builtin;
    const lib = getLibraryTemplates().find((t) => t.id === id);
    if (lib) return lib;
    const custom = await getCustomTemplates();
    return custom.find((t) => t.id === id) || null;
}

// ── Feedback persistence (thumbs up/down) ────────────────────────────────────

/**
 * Record user feedback on a generated report section.
 *
 * @param {Object} feedback
 * @param {string} feedback.templateId
 * @param {'up'|'down'} feedback.thumbs
 * @param {string} [feedback.comment]
 * @returns {Promise<void>}
 */
export async function recordFeedback(feedback: any) {
    const history = (await idbGet(IDB_FEEDBACK_KEY)) || [];
    const list = Array.isArray(history) ? history : [];
    list.push({
        ...feedback,
        timestamp: new Date().toISOString(),
    });
    // Cap at 1000 entries
    const trimmed = list.slice(-1000);
    await idbSet(IDB_FEEDBACK_KEY, trimmed);
}

/**
 * Get feedback stats across all templates.
 *
 * @returns {Promise<{total: number, up: number, down: number, byTemplate: Object<string, {up: number, down: number}>}>}
 */
export async function getFeedbackStats() {
    const history = (await idbGet(IDB_FEEDBACK_KEY)) || [];
    const list = Array.isArray(history) ? history : [];
    /** @type {Record<string, { up: number, down: number }>} */
    const byTemplate: Record<string, { up: number; down: number }> = {};
    let up = 0;
    let down = 0;
    for (const entry of list) {
        if (entry.thumbs === 'up') up++;
        else if (entry.thumbs === 'down') down++;
        const tid = entry.templateId || 'unknown';
        if (!byTemplate[tid]) byTemplate[tid] = { up: 0, down: 0 };
        if (entry.thumbs === 'up') byTemplate[tid].up++;
        if (entry.thumbs === 'down') byTemplate[tid].down++;
    }
    return { total: list.length, up, down, byTemplate };
}

// ── Main API ─────────────────────────────────────────────────────────────────

/**
 * Generate a report section using the specified template and tone.
 *
 * @param {Object} options
 * @param {string} options.templateId - Template ID (built-in or custom)
 * @param {ReportContext} options.context - Report context from buildReportContext()
 * @param {'technical'|'executive'} [options.tone='technical']
 * @param {(systemPrompt: string, userPrompt: string) => Promise<string>} options.sendFn
 *   - Callback that wraps core/llm/client.js sendMessage(). Injected for testability.
 * @param {(event: {current: number, total: number, phase: string, detail?: string}) => void} [options.onProgress]
 *   - Optional callback for progress updates. 3 phases: preparing, callingLlm, applyingWatermark.
 * @returns {Promise<{content: string, rawContent: string, templateId: string, tone: string, tokensUsed: number}>}
 */
export async function generateReportSection(options: any) {
    const { templateId, context, tone = 'technical', sendFn, onProgress } = options || {};
    const emit = typeof onProgress === 'function' ? onProgress : () => {};

    if (!templateId) throw new Error('generateReportSection: templateId required');
    if (!context) throw new Error('generateReportSection: context required');
    if (typeof sendFn !== 'function') throw new Error('generateReportSection: sendFn callback required');
    if (!TONES.includes(tone)) throw new Error(`generateReportSection: tone must be one of ${TONES.join(', ')}`);

    emit({ current: 1, total: 3, phase: 'preparing' });

    // Rate limit check
    const rl = checkRateLimit();
    if (!rl.allowed) {
        throw new Error(
            `Rate limit exceeded (${RATE_LIMIT.maxCalls}/hour). Reset at ${new Date(rl.resetAt).toLocaleTimeString()}`,
        );
    }

    // Load template
    const template = await getTemplateById(templateId);
    if (!template) throw new Error(`Template not found: ${templateId}`);

    // Validate required context
    const validation = validateContext(template, context);
    if (!validation.ok) {
        throw new Error(`Missing required context: ${validation.missing.join(', ')}`);
    }

    // Fill placeholders
    const filledSystem = fillTemplate(template.systemPrompt, context, tone);
    // Data-grounding (Fase 1.5): prefixa o bloco de dados reais + instrução
    // anti-alucinação ao system prompt, mesmo que o template não referencie os
    // novos placeholders. Garante que o LLM use SOMENTE os números do modelo.
    const grounding = typeof context?.groundingBlock === 'string' ? context.groundingBlock.trim() : '';
    const systemPrompt = grounding ? `${filledSystem}\n\n${grounding}` : filledSystem;
    const userPrompt = fillTemplate(template.userPromptTemplate, context, tone);

    log.info('Generating report section: template=%s tone=%s', templateId, tone);

    emit({ current: 2, total: 3, phase: 'callingLlm', detail: template.name });

    // Call LLM via injected callback
    const rawContent = await sendFn(systemPrompt, userPrompt);

    emit({ current: 3, total: 3, phase: 'applyingWatermark' });

    // Apply watermark (MANDATORY - never skip)
    const content = applyWatermark(rawContent || '');

    // Record rate limit consumption
    recordRateLimitCall();

    const tokensEstimated = Math.ceil((systemPrompt.length + userPrompt.length) / 4);

    return {
        content,
        rawContent: rawContent || '',
        templateId,
        tone,
        tokensUsed: tokensEstimated,
    };
}
