// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Pure-logic extraction (ARCH-MONOLITH-ATOMIZATION-001, llm sub-activity).
// Third pure slice carved out of utils/handlers/llmChat.ts (~2467 LOC),
// after _llmChatVoicePure.ts (voice/STT) and _llmTokenMeterPure.ts (meter math).
//
// Strategy: extract the DOM-free / network-free decision logic that maps a
// provider `usage` object (Anthropic/OpenAI/legacy shapes) into the list of
// token charges the caller must record via addTokenUsage(), plus the
// browser/local streaming token estimation heuristic. Caller keeps all side
// effects (addTokenUsage + metering import); this module is pure math only.
//
// Behavior-identical to the previous inline logic at llmChat.ts sendLLMMessage
// (cloud branch) and sendLLMMessageStreaming.
//
// Spec NOT:
// - NÃO referenciar document/window/localStorage/navigator aqui
// - NÃO importar quota/metering — pure decision only
// - NÃO chamar addTokenUsage — apenas DESCREVE as cobranças (caller executa)
// - NÃO tocar core/llm/ — extração só do handler de UI
// - NÃO emoji

/** A single token charge instruction the caller forwards to addTokenUsage(). */
export interface TokenCharge {
    /** Token count (always > 0). */
    count: number;
    /** Charge type — drives the metering multiplier (input cheaper than output). */
    type: 'input' | 'output';
    /** Model/engine hint passed through to the metering engine, or undefined. */
    model?: string;
}

/**
 * Raw provider usage object as returned by the LLM pipeline.
 * Field names vary by provider:
 *   - Anthropic: input_tokens / output_tokens
 *   - OpenAI (chat): prompt_tokens / completion_tokens
 *   - Some providers only expose total_tokens.
 */
export interface ProviderUsage {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    input_tokens?: unknown;
    output_tokens?: unknown;
    total_tokens?: unknown;
}

/**
 * Coerce an arbitrary value to a non-negative finite token count.
 * Anything non-numeric, negative, NaN or Infinity collapses to 0 — matching
 * the inline `usage.x || 0` guard that previously gated each addTokenUsage call.
 *
 * @param value - candidate token count
 * @returns a finite number >= 0
 */
function toTokenCount(value: unknown): number {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return n;
}

/**
 * Resolve which token counts to charge as input vs output from a provider
 * usage object, mirroring the cloud-engine branch of sendLLMMessage.
 *
 * Rules (order-preserving, behavior-identical to the previous inline code):
 *   1. inTok  = prompt_tokens || input_tokens || 0
 *   2. outTok = completion_tokens || output_tokens || 0
 *   3. emit an input charge if inTok > 0, then an output charge if outTok > 0
 *   4. FALLBACK: if BOTH are 0 but total_tokens > 0, charge the total as
 *      'output' (the pricier side) to avoid under-pricing.
 *
 * The model hint is attached to every emitted charge. A null/empty usage
 * yields an empty array (caller records nothing).
 *
 * @param usage - provider usage object (any shape) or null/undefined
 * @param modelHint? - model/engine id for the metering multiplier
 * @returns frozen, ordered list of charges the caller must record
 */
export function resolveUsageCharges(
    usage: ProviderUsage | null | undefined,
    modelHint?: string | null,
): ReadonlyArray<TokenCharge> {
    if (!usage || typeof usage !== 'object') return Object.freeze([]);
    const model = typeof modelHint === 'string' && modelHint ? modelHint : undefined;
    const inTok = toTokenCount((usage as ProviderUsage).prompt_tokens) || toTokenCount((usage as ProviderUsage).input_tokens);
    const outTok =
        toTokenCount((usage as ProviderUsage).completion_tokens) || toTokenCount((usage as ProviderUsage).output_tokens);
    const charges: TokenCharge[] = [];
    if (inTok > 0) charges.push(Object.freeze({ count: inTok, type: 'input', model }) as TokenCharge);
    if (outTok > 0) charges.push(Object.freeze({ count: outTok, type: 'output', model }) as TokenCharge);
    // Fallback: provider only gave a grand total — bill as output (most expensive).
    if (inTok === 0 && outTok === 0) {
        const total = toTokenCount((usage as ProviderUsage).total_tokens);
        if (total > 0) charges.push(Object.freeze({ count: total, type: 'output', model }) as TokenCharge);
    }
    return Object.freeze(charges);
}

/** Average characters per token used by the streaming estimation heuristic. */
export const CHARS_PER_TOKEN = 4;

/**
 * Estimate token usage for browser/local streaming engines that do not report
 * a usage object. Mirrors the inline `Math.ceil((msg.length + content.length) / 4)`
 * heuristic in sendLLMMessageStreaming.
 *
 * Non-string inputs contribute 0 length. Result is a non-negative integer.
 *
 * @param promptText - the user message text
 * @param responseText - the accumulated streamed response text
 * @returns estimated token count (>= 0, integer)
 */
export function estimateStreamingTokens(promptText: unknown, responseText: unknown): number {
    const a = typeof promptText === 'string' ? promptText.length : 0;
    const b = typeof responseText === 'string' ? responseText.length : 0;
    const chars = a + b;
    if (chars <= 0) return 0;
    return Math.ceil(chars / CHARS_PER_TOKEN);
}
