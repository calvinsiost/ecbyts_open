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
   LLM AGENTS — Persona management for specialized assistants
   ================================================================

   Permite criar agentes especializados com prompts customizados.
   Agentes podem ser especialistas em regulacao, campanhas, SST, etc.

   ARMAZENAMENTO:
   - Agentes do sistema: definidos neste modulo (imutaveis)
   - Agentes do usuario: localStorage (ecbyts_user_agents)
   - Agente ativo: localStorage (ecbyts_active_agent)

   ================================================================ */

import { safeSetItem } from '../../utils/storage/storageMonitor.js';

// ================================================================
// STORAGE KEYS
// ================================================================

const STORAGE_KEY = 'ecbyts_user_agents';
const ACTIVE_AGENT_KEY = 'ecbyts_active_agent';

// ================================================================
// SYSTEM AGENTS - Built-in specialist personas
// Agentes pre-definidos do sistema (nao editaveis pelo usuario)
// ================================================================

export const SYSTEM_AGENTS = [
    {
        id: 'default',
        name: 'General Assistant',
        nameKey: 'defaultAgent',
        description: 'General-purpose environmental data assistant',
        systemPromptAddition: '',
        icon: 'cpu',
        isSystem: true,
    },
    {
        id: 'regulatory-br',
        name: 'Regulatory (BR)',
        nameKey: 'regulatoryBR',
        description:
            'CONAMA, CETESB, IBAMA compliance expert. Brazilian environmental standards: CONAMA 420/2009 (groundwater), 396/2008 (aquifer classification), 430/2011 (effluent discharge); CETESB guiding values; IBAMA enforcement and licensing.',
        systemPromptAddition: `You are an expert in Brazilian environmental regulation and compliance.

REGULATORY FRAMEWORK:
- CONAMA 420/2009: Soil and groundwater quality criteria for contaminated sites
- CONAMA 396/2008: Groundwater classification and quality standards
- CONAMA 430/2011: Effluent discharge standards
- CONAMA 357/2005: Surface water classification
- CETESB: São Paulo state guiding values (prevention, intervention, investigation)
- IBAMA: Federal licensing (LP, LI, LO), EIA/RIMA requirements
- NBR 15.515-1/2/3: Environmental site assessment phases

FOCUS:
- Always cross-reference observations with CONAMA/CETESB limits
- Flag exceedances with specific resolution citations
- Recommend corrective actions per GRI (Gerenciamento de Áreas Contaminadas)
- Consider matrix-specific limits (soil, groundwater, surface water, air)
- Apply CETESB reference values when CONAMA is not specific enough`,
        icon: 'shield',
        isSystem: true,
    },
    {
        id: 'regulatory-us',
        name: 'Regulatory (US)',
        nameKey: 'regulatoryUS',
        description:
            'EPA compliance expert. US standards: MCLs (Safe Drinking Water Act), RCRA, CERCLA/Superfund, Clean Water Act, EPA Regional Screening Levels (RSLs).',
        systemPromptAddition: `You are an expert in US EPA environmental regulation and compliance.

REGULATORY FRAMEWORK:
- Safe Drinking Water Act (SDWA): Maximum Contaminant Levels (MCLs)
- RCRA: Resource Conservation and Recovery Act (hazardous waste management)
- CERCLA/Superfund: Comprehensive response, compensation, liability
- Clean Water Act (CWA): Surface water quality criteria, NPDES permits
- EPA RSLs: Regional Screening Levels for chemical contaminants
- ASTM E1527/E1903: Phase I/II Environmental Site Assessments
- OSHA PELs: Permissible Exposure Limits for workplace air

FOCUS:
- Cross-reference observations with EPA MCLs and RSLs
- Apply risk-based corrective action (RBCA) framework
- Consider exposure pathways (ingestion, inhalation, dermal)
- Reference EPA technical guidance documents
- Flag compounds that exceed screening levels`,
        icon: 'shield',
        isSystem: true,
    },
    {
        id: 'regulatory-intl',
        name: 'Regulatory (Intl)',
        nameKey: 'regulatoryIntl',
        description:
            'International standards expert. WHO guidelines, EU Water Framework Directive, Stockholm Convention on POPs, ISO 14001.',
        systemPromptAddition: `You are an expert in international environmental standards and guidelines.

REGULATORY FRAMEWORK:
- WHO: Drinking water quality guidelines, air quality guidelines
- EU Water Framework Directive (2000/60/EC): Surface and groundwater quality
- EU Groundwater Directive (2006/118/EC): Groundwater quality standards
- Stockholm Convention: Persistent Organic Pollutants (POPs)
- Basel Convention: Transboundary hazardous waste
- ISO 14001: Environmental Management Systems
- ISO 14040/14044: Life Cycle Assessment (LCA)
- GRI Standards: Global Reporting Initiative for sustainability reporting

FOCUS:
- Compare against WHO guideline values
- Apply EU Environmental Quality Standards (EQS)
- Identify POPs and substances of very high concern (SVHC)
- Reference international best practices and BAT (Best Available Techniques)`,
        icon: 'globe',
        isSystem: true,
    },
    {
        id: 'campaign',
        name: 'Campaign Manager',
        nameKey: 'campaignAgent',
        description:
            'Field sampling campaign specialist. Protocols, QA/QC, chain of custody, sampling optimization, decontamination procedures.',
        systemPromptAddition: `You are a field campaign specialist for environmental monitoring.

EXPERTISE:
- Sampling protocols: low-flow groundwater sampling, soil sampling (ASTM D1586)
- Quality Assurance/Quality Control: duplicates, blanks, matrix spikes, RPD limits
- Chain of custody procedures and documentation
- Decontamination procedures between sampling points
- Well purging and stabilization criteria (turbidity, pH, conductivity, DO, ORP)
- Sample preservation and holding times per parameter

FOCUS:
- Suggest optimal sampling points based on spatial coverage
- Recommend appropriate sampling frequency for trend detection
- Validate QA/QC data (flag high RPDs, blank contamination)
- Optimize campaign logistics (sampling order, equipment needs)
- Ensure parameter selection matches investigation objectives`,
        icon: 'calendar',
        isSystem: true,
    },
    {
        id: 'hse',
        name: 'H&S / HSE',
        nameKey: 'hse',
        description:
            'Health, Safety & Environment specialist. NR-15/NR-9 (BR), OSHA (US), ISO 45001, risk assessment, PPE, exposure limits, incident investigation.',
        systemPromptAddition: `You are a Health, Safety & Environment (HSE) specialist.

REGULATORY FRAMEWORK:
- Brazil: NR-15 (insalubridade), NR-9 (PPRA/PGR), NR-7 (PCMSO), NR-6 (EPI)
- USA: OSHA PELs, NIOSH RELs, ACGIH TLVs
- International: ISO 45001 (occupational H&S management), ILO conventions
- GHG Protocol: Scope 1, 2, 3 emissions accounting

FOCUS:
- Evaluate occupational exposure to chemical agents (TWA, STEL, Ceiling)
- Recommend appropriate PPE for field activities
- Assess safety rates: LTIR, frequency rate, severity rate
- Flag H&S incidents and near-misses in campaign data
- Cross-reference workplace air concentrations with OELs
- Evaluate noise exposure against NR-15 / OSHA limits
- Risk assessment matrices (probability x severity)`,
        icon: 'hard-hat',
        isSystem: true,
    },
];

// ================================================================
// USER AGENT CRUD - Create, Read, Update, Delete
// Operacoes CRUD para agentes personalizados do usuario
// ================================================================

/**
 * Get all user-created agents from localStorage.
 * Recupera agentes criados pelo usuario.
 *
 * @returns {Array<any>}
 */
export function getUserAgents() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY) || '';
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.error('Error loading user agents:', e);
        return [];
    }
}

/**
 * Save a user agent (create or update).
 * Salva um agente personalizado (cria novo ou atualiza existente).
 *
 * @param {Object} agent - { id, name, description, systemPromptAddition, icon }
 * @returns {Object} The saved agent
 */
export function saveUserAgent(/** @type {any} */ agent: any) {
    const agents = getUserAgents();

    // Generate ID if new
    if (!agent.id) {
        agent.id = 'user-' + Date.now();
    }

    agent.isSystem = false;
    agent.updatedAt = new Date().toISOString();

    const existingIndex = agents.findIndex((/** @type {any} */ a: any) => a.id === agent.id);
    if (existingIndex >= 0) {
        agents[existingIndex] = agent;
    } else {
        agent.createdAt = agent.updatedAt;
        agents.push(agent);
    }

    safeSetItem(STORAGE_KEY, JSON.stringify(agents));
    return agent;
}

/**
 * Delete a user agent.
 * Exclui um agente personalizado.
 *
 * @param {string} agentId - Agent identifier
 */
export function deleteUserAgent(agentId: any) {
    const agents = getUserAgents().filter((/** @type {any} */ a: any) => a.id !== agentId);
    safeSetItem(STORAGE_KEY, JSON.stringify(agents));

    // If deleted agent was active, reset to default
    if (getActiveAgent() === agentId) {
        setActiveAgent('default');
    }
}

// ================================================================
// ALL AGENTS - Merge system + user agents
// ================================================================

/**
 * Get all agents (system + user).
 * Retorna todos os agentes (sistema + usuario).
 *
 * @returns {Array<any>}
 */
export function getAllAgents() {
    return [...SYSTEM_AGENTS, ...getUserAgents()];
}

/**
 * Get a specific agent by ID.
 * Busca um agente pelo ID.
 *
 * @param {string} agentId - Agent identifier
 * @returns {Object|null}
 */
export function getAgentById(agentId: any) {
    return getAllAgents().find((/** @type {any} */ a) => a.id === agentId) || null;
}

// ================================================================
// ACTIVE AGENT - Selection and persistence
// ================================================================

/**
 * Get the active agent ID.
 * Retorna o ID do agente ativo.
 *
 * @returns {string}
 */
export function getActiveAgent() {
    return localStorage.getItem(ACTIVE_AGENT_KEY) || 'default';
}

/**
 * Set the active agent.
 * Define o agente ativo.
 *
 * @param {string} agentId - Agent identifier
 */
export function setActiveAgent(agentId: any) {
    safeSetItem(ACTIVE_AGENT_KEY, agentId);
}

/**
 * Get the active agent's prompt addition.
 * Retorna o prompt de especializacao do agente ativo.
 *
 * @returns {string} The systemPromptAddition or empty string
 */
export function getActiveAgentPrompt() {
    const agentId = getActiveAgent();
    if (!agentId || agentId === 'default') return '';

    const agent = /** @type {any} */ (getAgentById(agentId));
    return agent?.systemPromptAddition || '';
}

// ================================================================
// EXPORT / IMPORT - Share agent configs as JSON
// ================================================================

/**
 * Export an agent as JSON string.
 * Exporta um agente como string JSON.
 *
 * @param {string} agentId - Agent identifier
 * @returns {string} JSON string
 */
/** @returns {string|null} */
export function exportAgent(/** @type {string} */ agentId: any) {
    const agent = getAgentById(agentId);
    if (!agent) return null;

    // Remove system flag for portability
    /** @type {any} */
    const exportData = { ...agent };
    delete exportData.isSystem;
    exportData.exportedAt = new Date().toISOString();
    exportData.source = 'ecbyts';

    return JSON.stringify(exportData, null, 2);
}

/**
 * Import an agent from JSON string.
 * Importa um agente a partir de string JSON.
 *
 * @param {string} jsonString - JSON agent data
 * @returns {Object} The imported agent
 */
export function importAgent(jsonString: any) {
    const agent = JSON.parse(jsonString);

    // Validate required fields
    if (!agent.name || !agent.systemPromptAddition) {
        throw new Error('Agent must have name and systemPromptAddition');
    }

    // Generate new ID to avoid conflicts
    agent.id = 'imported-' + Date.now();
    agent.isSystem = false;
    agent.importedAt = new Date().toISOString();

    return saveUserAgent(agent);
}
