// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   LLM FUNCTION CATALOG — Definicoes de funcoes para o system prompt
   Usado pelo agent loop para descrever capacidades ao LLM.

   NAO usa native function_calling (OpenAI/Anthropic) porque o
   router suporta engines browser/local que nao tem essa feature.
   Em vez disso, as definicoes sao injetadas como texto no prompt.
   ================================================================ */

import { getAllWorkflows } from '../workflows/registry.js';
// MOD-LIB-MIG-001 consumers wire — actions declaradas por library modules
import { getRegisteredActions } from '../libraries/registry.js';

/**
 * Funcoes read-only - executam SEM confirmacao do usuario.
 * O agent loop chama automaticamente e retorna o resultado ao LLM.
 */
export const READ_ONLY_FUNCTIONS = [
    {
        name: 'QUERY_STATE',
        description: 'Query the current model state. Returns element count, campaigns, compliance summary.',
        parameters: {
            query: {
                type: 'string',
                enum: ['summary', 'elements', 'campaigns', 'compliance', 'exceedances', 'parameters'],
                required: true,
                description: 'Type of query',
            },
            filter: {
                type: 'object',
                description: 'Optional filter: { familyId, parameterId, campaignId }',
                required: false,
            },
        },
    },
    {
        name: 'QUERY_ELEMENT',
        description: 'Get detailed info about a specific element including all observations grouped by parameter.',
        parameters: {
            elementId: {
                type: 'string',
                required: true,
                description: 'Element ID to query',
            },
        },
    },
    {
        name: 'QUERY_COMPLIANCE',
        description:
            'Check regulatory compliance for a specific parameter across all wells. Returns exceedances, compliance rate, and details.',
        parameters: {
            parameterId: {
                type: 'string',
                required: true,
                description: 'Parameter ID (e.g., benzene, lead)',
            },
            regulation: {
                type: 'string',
                enum: ['CONAMA_420', 'CETESB', 'EPA_MCL'],
                required: false,
                description: 'Regulatory framework (default: CONAMA_420)',
            },
        },
    },
    {
        name: 'QUERY_KNOWLEDGE',
        description:
            'Search the knowledge base for datasets, vector layers, regulatory databases, and other assets. Combines text search with geographic filtering.',
        parameters: {
            query: {
                type: 'string',
                required: false,
                description: 'Text search query (e.g., "groundwater quality", "contamination", "SIGAM")',
            },
            categories: {
                type: 'array',
                required: false,
                description:
                    'Filter by category: vector_layer, raster_tile, terrain_surface, regulatory_db, training_dataset, coastline, transport_infrastructure',
            },
        },
    },
    {
        name: 'LIST_CAPABILITIES',
        description:
            'List available actions by category. Use to discover what commands are available in a specific area (sensor, governance, camera, etc.).',
        parameters: {
            category: {
                type: 'string',
                required: false,
                description:
                    'Category to filter (e.g., sensor, camera, governance, pipelines, issues). Omit for all categories.',
            },
        },
    },
];

/**
 * Funcoes mutantes - requerem confirmacao do usuario.
 */
export const MUTATING_FUNCTIONS = [
    {
        name: 'START_WORKFLOW',
        description: 'Launch a guided environmental workflow. Pre-fill decisions from conversation context.',
        parameters: {
            workflowId: {
                type: 'string',
                required: true,
                description: 'Workflow ID to launch',
            },
            prefill: {
                type: 'object',
                required: false,
                description: 'Pre-fill decisions: { parameterId, campaignId, interpolationMethod, ... }',
            },
        },
    },
    // Calvin 2026-06-10 — paridade com MCP server: avatar pode criar elemento +
    // inserir observações + rodar tour hidromet diretamente.
    {
        name: 'ADD_ELEMENT',
        description:
            'Create a new element (tank, well, plume, lake, boundary, etc.) in the 3D model. Use when user asks to add infrastructure or sampling points.',
        parameters: {
            familyId: {
                type: 'string',
                required: true,
                description:
                    'PDPL-U family: well | plume | lake | river | spring | building | tank | waste | boundary | blueprint | dam | pit',
            },
            name: { type: 'string', required: false, description: 'Optional name/label' },
        },
    },
    {
        name: 'ADD_OBSERVATION',
        description:
            'Add a chemical/environmental measurement (pH, metals, BTEX) to an existing element. Use when user reports new lab results or field readings.',
        parameters: {
            elementId: { type: 'string', required: true, description: 'Target element ID' },
            parameterId: {
                type: 'string',
                required: true,
                description: 'Parameter ID (pH, benzeno, arsenio, cadmio, HCN_ar, H2SO4)',
            },
            value: { type: 'number', required: true, description: 'Numeric measurement' },
            unitId: { type: 'string', required: false, description: 'Unit (mg/L, g/L, mg/m3, pH)' },
            date: { type: 'string', required: false, description: 'Measurement date (YYYY-MM-DD)' },
        },
    },
    {
        name: 'RUN_HYDROMET_TOUR',
        description:
            'Launch the hydrometallurgical OHS guided tour — creates a leaching tank, inserts 5 chemical observations (pH/H2SO4/As/Cd/HCN), applies CONAMA 420 preset, opens emergency workflow. Use when user wants a hands-on demo of OHS + chemistry integration.',
        parameters: {
            language: {
                type: 'string',
                enum: ['pt-BR', 'en-US', 'es-LA'],
                required: false,
                description: 'Tour language (default: current UI locale)',
            },
        },
    },
    // Calvin 2026-06-10: paridade end-to-end "tenho documento X local Y → suba + processa"
    {
        name: 'OPEN_FILE_UPLOAD',
        description:
            'Open the Files panel + trigger native file picker. Use when user says "tenho documento X", "quero subir", "abrir laudo". Browser sandbox: user precisa clicar/arrastar.',
        parameters: {},
    },
    {
        name: 'START_INGESTION_WIZARD',
        description:
            'Open EDD/XLSX/PDF Ingestion Wizard (multi-step: file → mapping → review → confirm). Use após OPEN_FILE_UPLOAD ou quando user pede "carregar dados na tela", "processar planilha de laboratório".',
        parameters: {},
    },
];

/**
 * Verifica se uma acao e read-only (nao requer confirmacao).
 */
export function isReadOnlyAction(actionName: string): boolean {
    return READ_ONLY_FUNCTIONS.some((f) => f.name === actionName);
}

/**
 * Gera texto de definicoes de funcoes para o system prompt.
 * Formato compacto para minimizar tokens.
 */
export function buildFunctionDefinitionsPrompt(): string {
    let text = '';

    // Read-only functions
    text += '\n═ CONSULTAS DE ESTADO (executam automaticamente, sem confirmação) ═\n';
    for (const fn of READ_ONLY_FUNCTIONS) {
        text += `\n${fn.name} — ${fn.description}\n`;
        text += formatParams(fn.parameters);
    }

    // Mutating functions
    text += '\n═ AÇÕES DE WORKFLOW (requerem confirmação) ═\n';
    for (const fn of MUTATING_FUNCTIONS) {
        text += `\n${fn.name} — ${fn.description}\n`;
        text += formatParams(fn.parameters);
    }

    // Available workflows
    const workflows = getAllWorkflows();
    if (workflows.length > 0) {
        text += '\n═ WORKFLOWS DISPONÍVEIS ═\n';
        for (const wf of workflows) {
            text += `- ${wf.id}: ${wf.regulation || 'N/A'}\n`;
        }
    }

    // Library actions (MOD-LIB-MIG-001) — ações declaradas por library
    // modules (manifests B1-validados). O bot invoca o handler_key
    // canônico via dispatch dinâmico já existente.
    try {
        const libActions = getRegisteredActions();
        if (libActions.length > 0) {
            text += '\n═ AÇÕES DA LIBRARY (invocar pelo handler_key, requerem confirmação) ═\n';
            for (const a of libActions) {
                const params = a.params_schema ? ` — params: ${Object.keys(a.params_schema).join(', ')}` : '';
                text += `- ${a.handler_key} (${a.intent})${params}\n`;
            }
        }
    } catch (e: any) {
        console.debug('[functions:library-actions]', e?.message || e);
    }

    text += `\nINSTRUÇÕES MULTI-TURN:
Se precisar de mais dados antes de responder, use QUERY_STATE, QUERY_COMPLIANCE ou QUERY_KNOWLEDGE.
O resultado será retornado automaticamente para você continuar raciocinando.
Máximo 5 consultas por mensagem do usuário.
Para ações que modificam o modelo, retorne como sempre no formato JSON com confirmação.\n`;

    return text;
}

/**
 * Formata parametros de uma funcao para o prompt.
 */
function formatParams(params: any) {
    if (!params) return '';
    const text = '  Params: ';
    const parts = [];
    for (const [key, def] of Object.entries(params)) {
        const d = def as any;
        let s = `${key} (${d.type}`;
        if (d.enum) s += `: ${d.enum.join('|')}`;
        if (d.required) s += ', required';
        s += ')';
        parts.push(s);
    }
    return text + parts.join(', ') + '\n';
}
