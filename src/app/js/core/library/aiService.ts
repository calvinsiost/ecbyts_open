// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   AI SERVICE — Cost estimation and execution routing for library AI
   Estimativa de custo e execucao de servicos de IA para a Library

   Pricing ref (ECBT per 1M tokens, 2026-04-11):
     GPT-4o=50, GPT-4o-mini=3, gemini-flash=2, claude-haiku=1.5, self-hosted=0
   Confidence threshold: 0.70 — abaixo disso retorna human_review_required
   Nao usa browser APIs — pure logic importavel em Node test runner.
   ================================================================ */

// @ts-ignore - cross-directory .js import unresolvable in quarantine isolation
import { generateId } from '../../utils/helpers/id.js';

/**
 * Price table in ECBT per 1 million tokens.
 */
const PRICE_PER_MILLION: Record<string, number> = {
    'gpt-4o': 50,
    'gpt-4o-mini': 3,
    'gemini-flash': 2,
    'claude-haiku': 1.5,
    'self-hosted': 0,
};

/** Fallback confidence when no real execution is available (simulated). */
const SIMULATED_CONFIDENCE = 0.85;

/** Minimum confidence required to return 'completed'. */
const CONFIDENCE_THRESHOLD = 0.7;

/**
 * Estimate cost for an AI service request.
 * @param params
 */
export function estimateAiCost({ model = 'gpt-4o-mini', maxTokens = 0 }: { model?: string; maxTokens?: number } = {}): {
    cost: number;
    currency: 'ECBT';
    estimatedTokens: number;
} {
    const pricePerMillion = (PRICE_PER_MILLION[model] ?? PRICE_PER_MILLION['gpt-4o-mini']) as number;
    const estimatedTokens = maxTokens;
    const cost = (estimatedTokens / 1_000_000) * pricePerMillion;
    return { cost, currency: 'ECBT', estimatedTokens };
}

/**
 * Execute an AI service request (simulated - real execution delegates to core/llm).
 * Records usage via metering quota (fire-and-forget, no await).
 * @param req
 */
export async function executeAiService(req: {
    specificationId: string;
    model?: string;
    maxTokens?: number;
    userId: string;
}): Promise<{ status: string; cost: number; outputId: string; confidence: number }> {
    const { model = 'gpt-4o-mini', maxTokens = 0 } = req;
    const { cost, estimatedTokens } = estimateAiCost({ model, maxTokens });

    // Fire-and-forget metering - importado dinamicamente para nao criar dependencia
    // de browser/IDB em ambientes de teste.
    // F2 CREDITS_TOKEN_METERING: passa {model, type:'output'} para o motor de pricing
    // aplicar multipliers Claude-pattern (Haiku 1× / Sonnet 3× / Opus 5× × output 5×).
    // estimatedTokens é o total que será respondido (output), input já capturado nas request anterior.
    try {
        // @ts-ignore - cross-directory .js dynamic import unresolvable in quarantine isolation
        const { recordUsage } = await import('../metering/quota.js');
        recordUsage('llm_tokens', estimatedTokens, { model, type: 'output' });
    } catch (e: any) {
        console.debug('[aiService] metering:', e?.message || e);
        // Metering opcional - nao bloqueia execucao
    }

    const confidence = SIMULATED_CONFIDENCE;
    const status = confidence < CONFIDENCE_THRESHOLD ? 'human_review_required' : 'completed';
    const outputId = generateId('lib-ai');

    return { status, cost, outputId, confidence };
}
