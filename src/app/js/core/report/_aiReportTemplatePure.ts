// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Pure-logic validation + marketplace mapping for AI report custom templates.
// DOM-free, IDB-free, framework-free. Implements SPEC_AI_REPORT_TEMPLATE_MARKETPLACE Fase 1.
// Defense-in-depth per OWASP LLM Prompt Injection Cheat Sheet:
//   placeholder whitelist + role-tag injection scan + length caps. NO tool-calls.

/** Placeholders allowed in custom templates — must match fillTemplate() substitutions. */
export const PLACEHOLDER_WHITELIST: readonly string[] = Object.freeze([
    'tone',
    'elementCount',
    'campaignCount',
    'eisScore',
    'siteName',
    'regulations',
    'familyBreakdown',
    // Data-grounding placeholders (SPEC_AI_REPORT_TEMPLATE_MARKETPLACE Fase 1.5):
    // valores reais extraídos do modelo de forma determinística (não inventados pelo LLM).
    'observationSummary',
    'dateRange',
    'topContaminants',
    'observationTable',
    'exceedanceTable',
    // CETESB-RISK-001 Sub-5.1.3: Anexo F de planilhas oficiais de avaliação de risco.
    // Quando presente, caller substitui por `buildAttachmentsMarkdown(filtered)`
    // de `_cetesbRiskAttachmentsPure.ts` (4 anexos canônicos por cenário receptor).
    'cetesbAttachments',
]);

/** Context keys a template may declare as required (subset of whitelist that maps to model data). */
export const REQUIRED_CONTEXT_KEYS: readonly string[] = Object.freeze([
    'elementCount',
    'campaignCount',
    'eisScore',
    'siteName',
    'regulations',
]);

/** Role-tag / chat-template injection patterns — reject if a template contains any. */
export const ROLE_INJECTION_PATTERNS: readonly RegExp[] = Object.freeze([
    /\bsystem\s*:/i,
    /\bassistant\s*:/i,
    /\bhuman\s*:/i,
    /\buser\s*:/i,
    /<\|im_start\|>/i,
    /<\|im_end\|>/i,
    /<\|system\|>/i,
    /\[INST\]/i,
    /\[\/INST\]/i,
    /<<SYS>>/i,
]);

export const TEMPLATE_LIMITS = Object.freeze({
    name: 80,
    description: 200,
    systemPrompt: 2000,
    userPromptTemplate: 2000,
}) as Readonly<{ name: number; description: number; systemPrompt: number; userPromptTemplate: number }>;

export const MAX_PENDING_TEMPLATES = 5;

/** Extract {{placeholder}} keys from a template string (deduped, ignores malformed). */
export function extractPlaceholders(text: unknown): string[] {
    if (typeof text !== 'string' || text.length === 0) return [];
    const found = new Set<string>();
    const re = /\{\{(\w+)\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        if (m[1]) found.add(m[1]);
    }
    return [...found];
}

/** Scan text for role-tag / chat-template injection markers. */
export function scanRoleInjection(text: unknown): { safe: boolean; matched: string[] } {
    if (typeof text !== 'string' || text.length === 0) return { safe: true, matched: [] };
    const matched: string[] = [];
    for (const pattern of ROLE_INJECTION_PATTERNS) {
        if (pattern.test(text)) matched.push(pattern.source);
    }
    return { safe: matched.length === 0, matched };
}

export type TemplateDraft = {
    id?: unknown;
    name?: unknown;
    description?: unknown;
    systemPrompt?: unknown;
    userPromptTemplate?: unknown;
    requiredContext?: unknown;
    defaultTone?: unknown;
};

export type ValidationResult = {
    valid: boolean;
    errors: string[];
};

/** Validate a custom template draft (Fase 1 client-side + Fase 2 server-side reuse). */
export function validateTemplateDraft(draft: TemplateDraft | null | undefined): ValidationResult {
    const errors: string[] = [];
    if (!draft || typeof draft !== 'object') {
        return { valid: false, errors: ['draft ausente ou inválido'] };
    }

    // Required fields
    const name = typeof draft.name === 'string' ? draft.name.trim() : '';
    const systemPrompt = typeof draft.systemPrompt === 'string' ? draft.systemPrompt : '';
    const userPromptTemplate = typeof draft.userPromptTemplate === 'string' ? draft.userPromptTemplate : '';
    if (name.length === 0) errors.push('name é obrigatório');
    if (systemPrompt.length === 0) errors.push('systemPrompt é obrigatório');
    if (userPromptTemplate.length === 0) errors.push('userPromptTemplate é obrigatório');

    // Length caps
    if (name.length > TEMPLATE_LIMITS.name) errors.push(`name excede ${TEMPLATE_LIMITS.name} caracteres`);
    const description = typeof draft.description === 'string' ? draft.description : '';
    if (description.length > TEMPLATE_LIMITS.description) {
        errors.push(`description excede ${TEMPLATE_LIMITS.description} caracteres`);
    }
    if (systemPrompt.length > TEMPLATE_LIMITS.systemPrompt) {
        errors.push(`systemPrompt excede ${TEMPLATE_LIMITS.systemPrompt} caracteres`);
    }
    if (userPromptTemplate.length > TEMPLATE_LIMITS.userPromptTemplate) {
        errors.push(`userPromptTemplate excede ${TEMPLATE_LIMITS.userPromptTemplate} caracteres`);
    }

    // Placeholder whitelist (both prompt fields)
    const placeholders = [
        ...extractPlaceholders(systemPrompt),
        ...extractPlaceholders(userPromptTemplate),
    ];
    const invalidPlaceholders = placeholders.filter((p) => !PLACEHOLDER_WHITELIST.includes(p));
    if (invalidPlaceholders.length > 0) {
        errors.push(
            `placeholder(s) não permitido(s): ${[...new Set(invalidPlaceholders)].join(', ')}. ` +
                `Permitidos: ${PLACEHOLDER_WHITELIST.join(', ')}`,
        );
    }

    // Role-tag injection scan (both prompt fields)
    const sysScan = scanRoleInjection(systemPrompt);
    const userScan = scanRoleInjection(userPromptTemplate);
    if (!sysScan.safe || !userScan.safe) {
        errors.push('template contém marcador de sistema/role não permitido por segurança');
    }

    // defaultTone validation
    if (draft.defaultTone !== undefined && draft.defaultTone !== 'technical' && draft.defaultTone !== 'executive') {
        errors.push("defaultTone deve ser 'technical' ou 'executive'");
    }

    // requiredContext validation (if present, must be subset of REQUIRED_CONTEXT_KEYS)
    if (draft.requiredContext !== undefined) {
        if (!Array.isArray(draft.requiredContext)) {
            errors.push('requiredContext deve ser array');
        } else {
            const invalid = draft.requiredContext.filter(
                (k: unknown) => typeof k !== 'string' || !REQUIRED_CONTEXT_KEYS.includes(k),
            );
            if (invalid.length > 0) {
                errors.push(`requiredContext inválido: ${invalid.join(', ')}`);
            }
        }
    }

    return { valid: errors.length === 0, errors };
}

export type ReportTemplateAsset = {
    assetId: string;
    category: 'report_template';
    name: string;
    description: string;
    systemPrompt: string;
    userPromptTemplate: string;
    requiredContext: string[];
    defaultTone: 'technical' | 'executive';
    authorId: string;
    version: number;
    status: 'pending_review';
};

/** Map a validated local template → marketplace asset (Fase 2 publish). */
export function toMarketplaceAsset(template: TemplateDraft, authorId: unknown): ReportTemplateAsset | null {
    const validation = validateTemplateDraft(template);
    if (!validation.valid) return null;
    const author = typeof authorId === 'string' && authorId.length > 0 ? authorId : 'anonymous';
    const tone: 'technical' | 'executive' = template.defaultTone === 'executive' ? 'executive' : 'technical';
    return {
        assetId: String(template.id ?? ''),
        category: 'report_template',
        name: String(template.name ?? '').trim(),
        description: typeof template.description === 'string' ? template.description : '',
        systemPrompt: String(template.systemPrompt ?? ''),
        userPromptTemplate: String(template.userPromptTemplate ?? ''),
        requiredContext: Array.isArray(template.requiredContext)
            ? (template.requiredContext as unknown[]).filter((k): k is string => typeof k === 'string')
            : [],
        defaultTone: tone,
        authorId: author,
        version: 1,
        status: 'pending_review',
    };
}

export type CustomTemplate = {
    id: string;
    name: string;
    description: string;
    systemPrompt: string;
    userPromptTemplate: string;
    requiredContext: string[];
    defaultTone: 'technical' | 'executive';
    isCustom: true;
    marketplaceAssetId?: string;
    authorId?: string;
    version?: number;
    importedFrom?: string;
};

/** Map a marketplace asset → local custom template (Fase 2 import). */
export function fromMarketplaceAsset(asset: ReportTemplateAsset | null | undefined): CustomTemplate | null {
    if (!asset || typeof asset !== 'object') return null;
    if (asset.category !== 'report_template') return null;
    const tone: 'technical' | 'executive' = asset.defaultTone === 'executive' ? 'executive' : 'technical';
    const template: CustomTemplate = {
        id: String(asset.assetId ?? ''),
        name: String(asset.name ?? '').trim(),
        description: typeof asset.description === 'string' ? asset.description : '',
        systemPrompt: String(asset.systemPrompt ?? ''),
        userPromptTemplate: String(asset.userPromptTemplate ?? ''),
        requiredContext: Array.isArray(asset.requiredContext)
            ? asset.requiredContext.filter((k): k is string => typeof k === 'string')
            : [],
        defaultTone: tone,
        isCustom: true,
        marketplaceAssetId: String(asset.assetId ?? ''),
        version: typeof asset.version === 'number' ? asset.version : 1,
        importedFrom: 'marketplace',
    };
    if (typeof asset.authorId === 'string') {
        template.authorId = asset.authorId;
    }
    return template;
}

/** Check if user can publish another template (max pending limit). */
export function canPublishTemplate(pendingCount: unknown): boolean {
    const n = Number(pendingCount);
    if (!Number.isFinite(n) || n < 0) return true;
    return n < MAX_PENDING_TEMPLATES;
}
