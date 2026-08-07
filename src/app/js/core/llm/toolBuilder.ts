// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: toolBuilder - EcoTools (ferramentas customizadas criadas por IA)
// Status: STUB - implementação completa pendente (CREATE_ECO_TOOL action)

/* ================================================================
   TOOL BUILDER — EcoTools criadas por LLM via CREATE_ECO_TOOL
   ================================================================

   EcoTools são widgets HTML gerados pelo assistente IA (ex: calculadoras,
   formulários customizados) e persistidos no modelo ECO1 via export/import.

   Fluxo:
     LLM → CREATE_ECO_TOOL { name, htmlContent } → createEcoTool()
     → armazenado em _ecoTools[]
     → exportEcoTools() salva no modelo
     → importEcoTools() restaura do modelo

   ================================================================ */

import { generateId } from '../../utils/helpers/id.js';

interface EcoTool {
    id: string;
    name: string;
    description: string;
    htmlContent: string;
    createdAt: string;
    records: Array<any>;
}

let _ecoTools: EcoTool[] = [];

/**
 * Cria uma nova EcoTool a partir de conteúdo HTML gerado pelo LLM.
 * @param name - Nome da ferramenta
 * @param description - Descrição breve
 * @param htmlContent - HTML completo da ferramenta (calculadora, formulário, etc.)
 */
export function createEcoTool(
    name: string,
    description = '',
    htmlContent = '',
): { id: string; name: string; description: string; htmlContent: string; createdAt: string } {
    const tool = {
        id: generateId('ecotool'),
        name: String(name || 'EcoTool').substring(0, 80),
        description: String(description), // sem limite — usado como prompt completo
        htmlContent: String(htmlContent),
        createdAt: new Date().toISOString(),
        records: [] as Array<any>,
    };
    _ecoTools.push(tool);
    return tool;
}

/**
 * Exporta todas as EcoTools para serialização no modelo ECO1.
 * @returns Lista de EcoTools
 */
export function exportEcoTools(): Array<any> {
    return _ecoTools.map((t) => ({ ...t }));
}

/**
 * Importa EcoTools a partir do modelo ECO1.
 * @param tools - Lista de EcoTools restauradas do modelo
 */
export function importEcoTools(tools: Array<any>): void {
    if (!Array.isArray(tools)) return;
    _ecoTools = tools.map((t) => ({
        id: t.id || generateId('ecotool'),
        name: String(t.name || '').substring(0, 80),
        description: String(t.description || ''),
        htmlContent: String(t.htmlContent || ''),
        createdAt: t.createdAt || new Date().toISOString(),
        records: Array.isArray(t.records) ? t.records : [],
    }));
}

/**
 * Retorna todas as EcoTools carregadas.
 */
export function getEcoTools(): Array<any> {
    return _ecoTools;
}

/**
 * Remove uma EcoTool pelo id.
 * @returns true se removida
 */
export function removeEcoTool(id: string): boolean {
    const before = _ecoTools.length;
    _ecoTools = _ecoTools.filter((t) => t.id !== id);
    return _ecoTools.length < before;
}

/**
 * Salva um registro de output de uma EcoTool no modelo.
 * Spread de data ANTES de id/timestamp - impede iframe sobrescrever metadados.
 * @param toolId - campos do formulário ou resultado do cálculo
 */
export function saveEcoToolRecord(toolId: string, data: object): { id: string; timestamp: string } | null {
    if (!toolId || typeof data !== 'object' || data === null) return null;
    const tool = _ecoTools.find((t) => t.id === toolId);
    if (!tool) return null;
    const record = {
        ...data,
        id: generateId('ecorec'),
        timestamp: new Date().toISOString(),
    };
    tool.records.push(record);
    if (tool.records.length > 500) tool.records = tool.records.slice(-500);
    return record;
}

/**
 * Retorna cópia dos registros salvos de uma EcoTool.
 */
export function getEcoToolRecords(toolId: string): Array<any> {
    const tool = _ecoTools.find((t) => t.id === toolId);
    return tool ? [...tool.records] : [];
}

/**
 * Atualiza campos editáveis de uma EcoTool preservando id, records e createdAt.
 * @returns true se atualizado
 */
export function updateEcoTool(
    toolId: string,
    updates: { name?: string; description?: string; htmlContent?: string },
): boolean {
    const tool = _ecoTools.find((t) => t.id === toolId);
    if (!tool) return false;
    if (updates.name !== undefined) tool.name = String(updates.name).substring(0, 80);
    if (updates.description !== undefined) tool.description = String(updates.description);
    if (updates.htmlContent !== undefined) tool.htmlContent = String(updates.htmlContent);
    return true;
}
