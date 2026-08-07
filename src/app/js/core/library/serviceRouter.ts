// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   SERVICE ROUTER — Single entry point for Library service requests
   Ponto unico de entrada para rastreamento de billing AI + consulting

   Por que centralizar?
   Desacopla o caminho de billing do tipo de servico — aiService e
   consultingService nao precisam conhecer um ao outro. Telemetria
   e logging futuros ficam em um unico lugar.
   ================================================================ */

import { estimateAiCost, executeAiService } from './aiService.js';
import { buildConsultingProposal } from './consultingService.js';

/**
 * Route a library service request to the appropriate handler.
 * @param {{ type: 'ai_execution'|'consulting_request', specificationId: string, model?: string, maxTokens?: number, userId: string }} req
 * @returns {Promise<{ status: string, cost?: number, currency?: string, confidence?: number, outputId?: string, estimatedHH?: number, totalValue?: number }>}
 */
export async function routeLibraryRequest(req: any) {
    if (!req || typeof req.type !== 'string') {
        throw { code: 'invalid_type', message: 'req.type is required' };
    }

    if (req.type === 'ai_execution') {
        // estimateAiCost is synchronous - used for pre-flight cost display.
        // executeAiService handles metering and returns a full result.
        const result = await executeAiService(req);
        return result;
    }

    if (req.type === 'consulting_request') {
        return buildConsultingProposal(req);
    }

    throw { code: 'invalid_type', message: `Unknown request type: ${req.type}` };
}

export { estimateAiCost };
