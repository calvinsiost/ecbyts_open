// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   AI REPORT PUBLISH — Pure validation for SPEC_AI_REPORT_TEMPLATE_MARKETPLACE F2

   Front-first development (AGENTS.md § UX-First Development):
   - F2 UI (Publish button + modal) entregue PRIMEIRO com este validator pure
   - Backend RPC `publish_ai_report_template` + RLS migration vêm depois (F2.3)

   Reusa whitelist + scans de RF-3 (saveCustomTemplate) para garantir simetria
   client↔server: o que valida local deve passar server-side também.
   ================================================================ */

/** Whitelist canônico de placeholders aceitos em templates AI Report.
 *  Espelho do whitelist de aiReportBot.fillTemplate (linhas 252-260).
 */
export const PUBLISH_PLACEHOLDER_WHITELIST: ReadonlyArray<string> = Object.freeze([
    'tone',
    'elementCount',
    'campaignCount',
    'eisScore',
    'siteName',
    'regulations',
    'familyBreakdown',
    'observationSummary',
    'dateRange',
    'topContaminants',
    'observationTable',
    'exceedanceTable',
]);

/** Role-tag injection patterns (case-insensitive). */
const ROLE_TAG_PATTERNS: ReadonlyArray<RegExp> = Object.freeze([
    /\bsystem\s*:/i,
    /\bassistant\s*:/i,
    /\bhuman\s*:/i,
    /<\|im_start\|>/i,
    /<\|im_end\|>/i,
    /\[INST\]/i,
]);

/** Length caps (caracteres). Espelho de RF-3 saveCustomTemplate. */
export const PUBLISH_LENGTH_CAPS = Object.freeze({
    name: 80,
    description: 200,
    systemPrompt: 2000,
    userPromptTemplate: 2000,
});

/** Limites comerciais para Fase 2 marketplace. */
export const PUBLISH_COMMERCIAL_LIMITS = Object.freeze({
    minPriceEcbt: 0,        // 0 = free template
    maxPriceEcbt: 1_000_000, // teto sanity
    minRoyaltyPct: 0,
    maxRoyaltyPct: 100,
});

export interface AIReportTemplate {
    id: string;
    name: string;
    description?: string;
    systemPrompt: string;
    userPromptTemplate: string;
    requiredContext?: string[];
    defaultTone?: string;
    isCustom?: boolean;
    /** Marketplace flags adicionados em F2 */
    published?: boolean;
    publishedAt?: string;
    marketplaceAssetId?: string;
}

export interface PublishInput {
    template: AIReportTemplate;
    priceEcbt: number;
    royaltyPct: number;
    license?: string; // 'agpl-3.0' | 'cc-by-4.0' | 'proprietary'
}

export interface PublishValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Extract placeholders `{{name}}` from a template string.
 * Pure: regex match, no side effects.
 */
export function extractPlaceholders(text: string): string[] {
    if (typeof text !== 'string') return [];
    const matches = text.match(/\{\{(\w+)\}\}/g) || [];
    return matches.map((m) => m.slice(2, -2));
}

/**
 * Check string for role-tag injection patterns.
 * Returns true if ANY pattern matches.
 */
export function containsRoleTagInjection(text: string): boolean {
    if (typeof text !== 'string') return false;
    return ROLE_TAG_PATTERNS.some((rx) => rx.test(text));
}

/**
 * Validate template structure + placeholders + injection scan + length caps.
 * Defensive: nunca throw, retorna { valid, errors, warnings }.
 */
export function validateTemplateForPublish(template: unknown): PublishValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!template || typeof template !== 'object') {
        return { valid: false, errors: ['template must be object'], warnings: [] };
    }
    const t = template as Partial<AIReportTemplate>;

    // Required fields
    if (typeof t.id !== 'string' || !t.id) errors.push('template.id obrigatório (string não-vazia)');
    if (typeof t.name !== 'string' || !t.name) errors.push('template.name obrigatório');
    if (typeof t.systemPrompt !== 'string' || !t.systemPrompt) {
        errors.push('template.systemPrompt obrigatório');
    }
    if (typeof t.userPromptTemplate !== 'string' || !t.userPromptTemplate) {
        errors.push('template.userPromptTemplate obrigatório');
    }

    // Length caps
    if (typeof t.name === 'string' && t.name.length > PUBLISH_LENGTH_CAPS.name) {
        errors.push(`name excede ${PUBLISH_LENGTH_CAPS.name} chars (atual: ${t.name.length})`);
    }
    if (typeof t.description === 'string' && t.description.length > PUBLISH_LENGTH_CAPS.description) {
        errors.push(`description excede ${PUBLISH_LENGTH_CAPS.description} chars`);
    }
    if (typeof t.systemPrompt === 'string' && t.systemPrompt.length > PUBLISH_LENGTH_CAPS.systemPrompt) {
        errors.push(`systemPrompt excede ${PUBLISH_LENGTH_CAPS.systemPrompt} chars`);
    }
    if (typeof t.userPromptTemplate === 'string' && t.userPromptTemplate.length > PUBLISH_LENGTH_CAPS.userPromptTemplate) {
        errors.push(`userPromptTemplate excede ${PUBLISH_LENGTH_CAPS.userPromptTemplate} chars`);
    }

    // Role-tag injection
    if (typeof t.systemPrompt === 'string' && containsRoleTagInjection(t.systemPrompt)) {
        errors.push('systemPrompt contém padrão de role-tag injection (system:, assistant:, [INST], etc)');
    }
    if (typeof t.userPromptTemplate === 'string' && containsRoleTagInjection(t.userPromptTemplate)) {
        errors.push('userPromptTemplate contém padrão de role-tag injection');
    }

    // Placeholder whitelist
    const wl = new Set(PUBLISH_PLACEHOLDER_WHITELIST);
    const allPlaceholders = new Set([
        ...extractPlaceholders(t.systemPrompt || ''),
        ...extractPlaceholders(t.userPromptTemplate || ''),
    ]);
    const unknown = [...allPlaceholders].filter((p) => !wl.has(p));
    if (unknown.length > 0) {
        errors.push(
            `placeholder(s) fora do whitelist: ${unknown.join(', ')}. Permitidos: ${PUBLISH_PLACEHOLDER_WHITELIST.join(', ')}`
        );
    }

    // Already published guard (would create duplicate asset)
    if (t.published === true) {
        errors.push('template já está publicado — use updateMarketplaceTemplate ao invés de publishTemplate');
    }

    // Empty body warning (best-practice nudge)
    if (typeof t.description === 'string' && t.description.length < 20) {
        warnings.push('description curta (<20 chars) — descreva melhor para descoberta no marketplace');
    }
    if (allPlaceholders.size === 0) {
        warnings.push('template não usa placeholders — saída será sempre idêntica ao texto fixo');
    }

    return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate full publish input (template + comerciais).
 */
export function validatePublishInput(input: unknown): PublishValidationResult {
    if (!input || typeof input !== 'object') {
        return { valid: false, errors: ['input must be object'], warnings: [] };
    }
    const i = input as Partial<PublishInput>;
    const templateResult = validateTemplateForPublish(i.template);
    const errors = [...templateResult.errors];
    const warnings = [...templateResult.warnings];

    // Price validation
    if (typeof i.priceEcbt !== 'number' || !Number.isFinite(i.priceEcbt)) {
        errors.push('priceEcbt obrigatório (number finito; 0 = template grátis)');
    } else if (i.priceEcbt < PUBLISH_COMMERCIAL_LIMITS.minPriceEcbt) {
        errors.push(`priceEcbt mínimo: ${PUBLISH_COMMERCIAL_LIMITS.minPriceEcbt}`);
    } else if (i.priceEcbt > PUBLISH_COMMERCIAL_LIMITS.maxPriceEcbt) {
        errors.push(`priceEcbt máximo: ${PUBLISH_COMMERCIAL_LIMITS.maxPriceEcbt}`);
    }

    // Royalty validation
    if (typeof i.royaltyPct !== 'number' || !Number.isFinite(i.royaltyPct)) {
        errors.push('royaltyPct obrigatório (number finito 0..100)');
    } else if (i.royaltyPct < PUBLISH_COMMERCIAL_LIMITS.minRoyaltyPct || i.royaltyPct > PUBLISH_COMMERCIAL_LIMITS.maxRoyaltyPct) {
        errors.push(`royaltyPct deve estar em [0, 100] (atual: ${i.royaltyPct})`);
    }

    // License default warning
    if (i.license && !['agpl-3.0', 'cc-by-4.0', 'proprietary'].includes(i.license)) {
        warnings.push(`license '${i.license}' não-canônica; recomendado: agpl-3.0 | cc-by-4.0 | proprietary`);
    }

    return { valid: errors.length === 0, errors, warnings };
}

/**
 * Build marketplace asset payload from validated template + commercial params.
 * Stub for F2.3 server-side `publish_ai_report_template` RPC.
 */
export function buildMarketplaceAssetPayload(input: PublishInput, nowIso: string, authorId: string) {
    return {
        kind: 'report_template',
        title: input.template.name,
        description: input.template.description || '',
        body_json: {
            systemPrompt: input.template.systemPrompt,
            userPromptTemplate: input.template.userPromptTemplate,
            requiredContext: input.template.requiredContext || [],
            defaultTone: input.template.defaultTone || 'Technical',
            sourceTemplateId: input.template.id,
        },
        price_ecbt: input.priceEcbt,
        royalty_pct: input.royaltyPct,
        license: input.license || 'agpl-3.0',
        author_id: authorId,
        status: 'pending_review',
        created_at: nowIso,
    };
}
