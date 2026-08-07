// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * CREDENTIALS-VAULT-001 (claude - novaspec, 2026-05-31) — Schema canônico de
 * credenciais inseridas EXCLUSIVAMENTE via painel ecbyts_admin.
 *
 * **DIRETIVA CALVIN 2026-05-31:** "credenciais deverão ser inseridas via
 * ecbyts_admin". TODAS as credenciais externas do sistema (NFS-e, gateways
 * de pagamento, providers de AI, storage, email, mapas) seguem schema
 * canônico aqui definido e são editadas APENAS pelo painel admin.
 *
 * Anti-patterns enforced:
 *   - .env não-`.local` (commitado) é PROIBIDO para credenciais reais
 *   - Hardcoded em src/ é PROIBIDO (lint detecta via secret-scan)
 *   - Frontend NUNCA armazena credencial em texto plano — sempre via Vault
 *     ref `vault://<id>` resolvido server-side (Edge Function)
 *
 * Princípio: schema declarativo + auditoria embutida.
 *   - Cada categoria tem subschema com campos obrigatórios + opcionais
 *   - Cada credencial inserida tem audit trail (quem, quando, hash dos
 *     campos sensíveis para detecção de alteração silenciosa)
 *   - Rotação opcional com data de validade + alerta antecipado
 *
 * Refs:
 *   - SPEC `docs/specs/arch/SPEC_ECBYTSADMIN_MASTER_SEGREGATION.md` §3.4
 *     (G17 NFSe Admin Config — case canônico)
 *   - Anti-pattern CBMD-001 §17.3: certificado A1 NUNCA front-end
 *   - Calvin diretiva 2026-05-31: credenciais via ecbyts_admin
 */

// =============================================================================
// Tipos canônicos
// =============================================================================

/**
 * Categorias canônicas de credenciais que podem ser cadastradas via admin.
 * Expansão exige PR + ADR + entrada no registry (anti-discovery por
 * convenção — controle total).
 */
export type CredentialCategory =
    | 'nfse'              // NFS-e Nacional gov.br (certificado A1 + OAuth)
    | 'payment_gateway'   // MercadoPago + Stripe + outros
    | 'ai_provider'       // OpenAI + Anthropic + Gemini + OpenRouter
    | 'storage'           // Supabase + AWS S3 (caso futuro)
    | 'email'             // SendGrid + provider similar
    | 'map_provider'      // Mapbox + provider similar
    | 'analytics'         // Vercel Analytics + PostHog + similar
    | 'monitoring';       // Sentry + similar

/**
 * Sensibilidade da credencial (drive UI de admin: mascaramento + permissões).
 *   - 'secret': bytes/key — nunca exibir em texto plano após salvar
 *   - 'config': URL/identifier — pode mostrar (não-secreto)
 *   - 'reference': vault ref `vault://<id>` — caso default
 */
export type CredentialSensitivity = 'secret' | 'config' | 'reference';

/**
 * Campo individual no schema da credencial.
 */
export interface CredentialField {
    /** ID único dentro da categoria (kebab-case) */
    readonly key: string;
    /** Label PT-BR para admin UI */
    readonly labelPt: string;
    /** Tipo input UI */
    readonly type: 'text' | 'password' | 'url' | 'vault-upload' | 'select' | 'number' | 'date';
    /** Obrigatório? */
    readonly required: boolean;
    /** Sensibilidade (drive masking) */
    readonly sensitivity: CredentialSensitivity;
    /** Help text contextual */
    readonly helpPt?: string;
    /** Opções (se type=select) */
    readonly options?: ReadonlyArray<string>;
    /** Regex de validação (opcional) */
    readonly pattern?: string;
}

/**
 * Schema completo de uma categoria de credencial.
 */
export interface CredentialSchema {
    readonly category: CredentialCategory;
    readonly displayNamePt: string;
    readonly displayNameEn: string;
    /** Tipo de provider dentro da categoria (caller escolhe via select) */
    readonly providerOptions: ReadonlyArray<string>;
    readonly fields: ReadonlyArray<CredentialField>;
    /** Rotação obrigatória? Se true, validUntilIso é campo required */
    readonly rotationRequired: boolean;
    /** Janela de alerta antes de expirar (dias) */
    readonly rotationWarnDays: number;
    /** Permite múltiplos providers ativos simultaneamente (e.g. múltiplos AI providers)? */
    readonly allowMultiple: boolean;
}

/**
 * Audit trail por credencial cadastrada (separado do schema).
 */
export interface CredentialAuditEntry {
    /** Vault ref atribuído ao inserir */
    readonly vaultRef: string;
    /** Quando foi inserido/atualizado */
    readonly createdAtIso: string;
    readonly updatedAtIso: string;
    /** User ID do admin que inseriu (Calvin ou delegado MASTER) */
    readonly createdByUserId: string;
    readonly updatedByUserId: string;
    /** Hash SHA-256 dos campos sensíveis (detecta alteração externa) */
    readonly fieldsHash: string;
    /** Validade (se rotationRequired) */
    readonly validUntilIso?: string;
}

// =============================================================================
// Registry canônico — todas as categorias
// =============================================================================

/**
 * Schema NFS-e (categoria: nfse). Já existia em nfseAdminConfigSchema.ts
 * — aqui apenas referência declarativa para Manager Registry universal.
 */
const NFSE_SCHEMA: CredentialSchema = Object.freeze({
    category: 'nfse',
    displayNamePt: 'Nota Fiscal Eletrônica',
    displayNameEn: 'Electronic Invoice (NFS-e)',
    providerOptions: ['national', 'nota-gateway', 'tecnospeed', 'focus-nfe', 'notaas'],
    fields: Object.freeze([
        Object.freeze({
            key: 'provider',
            labelPt: 'Provedor',
            type: 'select' as const,
            required: true,
            sensitivity: 'config' as const,
            options: ['national', 'nota-gateway', 'tecnospeed', 'focus-nfe', 'notaas'],
            helpPt: 'Default: national (NFS-e Nacional gov.br, parceria SEBRAE, custo zero)',
        }),
        Object.freeze({
            key: 'environment',
            labelPt: 'Ambiente',
            type: 'select' as const,
            required: true,
            sensitivity: 'config' as const,
            options: ['sandbox', 'production'],
        }),
        Object.freeze({
            key: 'certificateA1',
            labelPt: 'Certificado A1 (.pfx)',
            type: 'vault-upload' as const,
            required: true,
            sensitivity: 'secret' as const,
            helpPt: 'Upload do .pfx ICP-Brasil. Armazenado server-side via Vault.',
        }),
        Object.freeze({
            key: 'certificatePassword',
            labelPt: 'Senha do certificado A1',
            type: 'password' as const,
            required: true,
            sensitivity: 'secret' as const,
        }),
        Object.freeze({
            key: 'apiTokenOptional',
            labelPt: 'Token API gateway (se aplicável)',
            type: 'password' as const,
            required: false,
            sensitivity: 'secret' as const,
            helpPt: 'Apenas para providers comerciais (Nota Gateway, TecnoSpeed). National usa mTLS.',
        }),
    ]),
    rotationRequired: true, // A1 expira em 1 ano
    rotationWarnDays: 30,
    allowMultiple: false,
});

const PAYMENT_GATEWAY_SCHEMA: CredentialSchema = Object.freeze({
    category: 'payment_gateway',
    displayNamePt: 'Gateway de Pagamento',
    displayNameEn: 'Payment Gateway',
    providerOptions: ['mercadopago', 'stripe', 'pagseguro'],
    fields: Object.freeze([
        Object.freeze({
            key: 'provider',
            labelPt: 'Provedor',
            type: 'select' as const,
            required: true,
            sensitivity: 'config' as const,
            options: ['mercadopago', 'stripe', 'pagseguro'],
        }),
        Object.freeze({
            key: 'environment',
            labelPt: 'Ambiente',
            type: 'select' as const,
            required: true,
            sensitivity: 'config' as const,
            options: ['sandbox', 'production'],
        }),
        Object.freeze({
            key: 'publicKey',
            labelPt: 'Chave pública (publishable key)',
            type: 'text' as const,
            required: true,
            sensitivity: 'config' as const,
            helpPt: 'Aparece no frontend; não é secreta',
        }),
        Object.freeze({
            key: 'secretKey',
            labelPt: 'Chave secreta (server-side only)',
            type: 'password' as const,
            required: true,
            sensitivity: 'secret' as const,
            helpPt: 'NUNCA enviada ao browser. Apenas Edge Functions',
        }),
        Object.freeze({
            key: 'webhookSecret',
            labelPt: 'Webhook signing secret',
            type: 'password' as const,
            required: true,
            sensitivity: 'secret' as const,
            helpPt: 'Usado para validar webhooks vindo do gateway',
        }),
    ]),
    rotationRequired: false,
    rotationWarnDays: 90,
    allowMultiple: true, // pode ter MP + Stripe simultâneos
});

const AI_PROVIDER_SCHEMA: CredentialSchema = Object.freeze({
    category: 'ai_provider',
    displayNamePt: 'Provedor de IA (LLM)',
    displayNameEn: 'AI Provider (LLM)',
    providerOptions: ['openai', 'anthropic', 'gemini', 'openrouter', 'ollama-local'],
    fields: Object.freeze([
        Object.freeze({
            key: 'provider',
            labelPt: 'Provedor',
            type: 'select' as const,
            required: true,
            sensitivity: 'config' as const,
            options: ['openai', 'anthropic', 'gemini', 'openrouter', 'ollama-local'],
        }),
        Object.freeze({
            key: 'apiKey',
            labelPt: 'API Key',
            type: 'password' as const,
            required: true,
            sensitivity: 'secret' as const,
            helpPt: 'Bearer token. Ollama local pode usar string vazia.',
        }),
        Object.freeze({
            key: 'baseUrl',
            labelPt: 'Base URL (opcional override)',
            type: 'url' as const,
            required: false,
            sensitivity: 'config' as const,
            helpPt: 'Padrão por provider. Override para proxy/custom endpoint.',
        }),
        Object.freeze({
            key: 'defaultModel',
            labelPt: 'Modelo default',
            type: 'text' as const,
            required: false,
            sensitivity: 'config' as const,
            helpPt: 'Ex: gpt-4o-mini, claude-haiku-4-5, gemini-2.0-flash',
        }),
        Object.freeze({
            key: 'monthlyBudgetUsd',
            labelPt: 'Orçamento mensal USD (alerta)',
            type: 'number' as const,
            required: false,
            sensitivity: 'config' as const,
        }),
    ]),
    rotationRequired: false,
    rotationWarnDays: 180,
    allowMultiple: true,
});

const STORAGE_SCHEMA: CredentialSchema = Object.freeze({
    category: 'storage',
    displayNamePt: 'Storage Externo',
    displayNameEn: 'External Storage',
    providerOptions: ['supabase-storage', 'aws-s3', 'cloudflare-r2'],
    fields: Object.freeze([
        Object.freeze({
            key: 'provider',
            labelPt: 'Provedor',
            type: 'select' as const,
            required: true,
            sensitivity: 'config' as const,
            options: ['supabase-storage', 'aws-s3', 'cloudflare-r2'],
        }),
        Object.freeze({
            key: 'bucketName',
            labelPt: 'Bucket/Container',
            type: 'text' as const,
            required: true,
            sensitivity: 'config' as const,
        }),
        Object.freeze({
            key: 'accessKey',
            labelPt: 'Access Key',
            type: 'password' as const,
            required: true,
            sensitivity: 'secret' as const,
        }),
        Object.freeze({
            key: 'secretKey',
            labelPt: 'Secret Key',
            type: 'password' as const,
            required: true,
            sensitivity: 'secret' as const,
        }),
        Object.freeze({
            key: 'region',
            labelPt: 'Região',
            type: 'text' as const,
            required: false,
            sensitivity: 'config' as const,
        }),
    ]),
    rotationRequired: false,
    rotationWarnDays: 180,
    allowMultiple: true,
});

const EMAIL_SCHEMA: CredentialSchema = Object.freeze({
    category: 'email',
    displayNamePt: 'Provedor de Email',
    displayNameEn: 'Email Provider',
    providerOptions: ['sendgrid', 'aws-ses', 'mailgun', 'postmark'],
    fields: Object.freeze([
        Object.freeze({
            key: 'provider',
            labelPt: 'Provedor',
            type: 'select' as const,
            required: true,
            sensitivity: 'config' as const,
            options: ['sendgrid', 'aws-ses', 'mailgun', 'postmark'],
        }),
        Object.freeze({
            key: 'apiKey',
            labelPt: 'API Key',
            type: 'password' as const,
            required: true,
            sensitivity: 'secret' as const,
        }),
        Object.freeze({
            key: 'fromAddress',
            labelPt: 'From address (verified)',
            type: 'text' as const,
            required: true,
            sensitivity: 'config' as const,
            pattern: '^[^@]+@[^@]+\\.[^@]+$',
        }),
        Object.freeze({
            key: 'replyTo',
            labelPt: 'Reply-to (opcional)',
            type: 'text' as const,
            required: false,
            sensitivity: 'config' as const,
        }),
    ]),
    rotationRequired: false,
    rotationWarnDays: 180,
    allowMultiple: false,
});

const MAP_PROVIDER_SCHEMA: CredentialSchema = Object.freeze({
    category: 'map_provider',
    displayNamePt: 'Provedor de Mapas',
    displayNameEn: 'Map Provider',
    providerOptions: ['mapbox', 'maptiler', 'google-maps'],
    fields: Object.freeze([
        Object.freeze({
            key: 'provider',
            labelPt: 'Provedor',
            type: 'select' as const,
            required: true,
            sensitivity: 'config' as const,
            options: ['mapbox', 'maptiler', 'google-maps'],
        }),
        Object.freeze({
            key: 'apiKey',
            labelPt: 'API Key',
            type: 'password' as const,
            required: true,
            sensitivity: 'secret' as const,
        }),
        Object.freeze({
            key: 'styleUrl',
            labelPt: 'Style URL (opcional)',
            type: 'url' as const,
            required: false,
            sensitivity: 'config' as const,
        }),
    ]),
    rotationRequired: false,
    rotationWarnDays: 365,
    allowMultiple: false,
});

const ANALYTICS_SCHEMA: CredentialSchema = Object.freeze({
    category: 'analytics',
    displayNamePt: 'Analytics',
    displayNameEn: 'Analytics',
    providerOptions: ['vercel-analytics', 'posthog', 'plausible'],
    fields: Object.freeze([
        Object.freeze({
            key: 'provider',
            labelPt: 'Provedor',
            type: 'select' as const,
            required: true,
            sensitivity: 'config' as const,
            options: ['vercel-analytics', 'posthog', 'plausible'],
        }),
        Object.freeze({
            key: 'projectId',
            labelPt: 'Project ID / Site ID',
            type: 'text' as const,
            required: true,
            sensitivity: 'config' as const,
        }),
        Object.freeze({
            key: 'apiKey',
            labelPt: 'API Key (opcional)',
            type: 'password' as const,
            required: false,
            sensitivity: 'secret' as const,
        }),
    ]),
    rotationRequired: false,
    rotationWarnDays: 365,
    allowMultiple: false,
});

const MONITORING_SCHEMA: CredentialSchema = Object.freeze({
    category: 'monitoring',
    displayNamePt: 'Monitoramento de Erros',
    displayNameEn: 'Error Monitoring',
    providerOptions: ['sentry', 'rollbar', 'bugsnag'],
    fields: Object.freeze([
        Object.freeze({
            key: 'provider',
            labelPt: 'Provedor',
            type: 'select' as const,
            required: true,
            sensitivity: 'config' as const,
            options: ['sentry', 'rollbar', 'bugsnag'],
        }),
        Object.freeze({
            key: 'dsn',
            labelPt: 'DSN / Token',
            type: 'password' as const,
            required: true,
            sensitivity: 'secret' as const,
        }),
        Object.freeze({
            key: 'environment',
            labelPt: 'Environment tag',
            type: 'text' as const,
            required: false,
            sensitivity: 'config' as const,
            helpPt: 'Ex: production, staging, development',
        }),
    ]),
    rotationRequired: false,
    rotationWarnDays: 365,
    allowMultiple: false,
});

// =============================================================================
// Registry canônico (frozen)
// =============================================================================

export const CREDENTIAL_SCHEMAS_REGISTRY: Readonly<Record<CredentialCategory, CredentialSchema>> = Object.freeze({
    nfse: NFSE_SCHEMA,
    payment_gateway: PAYMENT_GATEWAY_SCHEMA,
    ai_provider: AI_PROVIDER_SCHEMA,
    storage: STORAGE_SCHEMA,
    email: EMAIL_SCHEMA,
    map_provider: MAP_PROVIDER_SCHEMA,
    analytics: ANALYTICS_SCHEMA,
    monitoring: MONITORING_SCHEMA,
});

/**
 * Lista todas as categorias canônicas (ordem determinística).
 */
export function listCredentialCategories(): ReadonlyArray<CredentialCategory> {
    return Object.freeze([
        'nfse',
        'payment_gateway',
        'ai_provider',
        'storage',
        'email',
        'map_provider',
        'analytics',
        'monitoring',
    ]);
}

/**
 * Lookup schema por categoria.
 */
export function getSchemaForCategory(category: CredentialCategory): CredentialSchema | null {
    return CREDENTIAL_SCHEMAS_REGISTRY[category] || null;
}

// =============================================================================
// Validação
// =============================================================================

export interface CredentialPayload {
    category: CredentialCategory;
    provider: string;
    fields: Record<string, string | number>;
    vaultRef?: string;
    validUntilIso?: string;
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

/**
 * Valida payload de credencial contra schema canônico da categoria.
 * Defesa em profundidade: caller (admin painel) deve validar no frontend,
 * mas Edge Function REVALIDA antes de salvar no Vault.
 */
export function validateCredentialPayload(payload: CredentialPayload | null | undefined): ValidationResult {
    const errors: string[] = [];
    if (!payload || typeof payload !== 'object') {
        return { valid: false, errors: ['payload_null'] };
    }
    if (!payload.category) {
        errors.push('missing_category');
        return { valid: false, errors };
    }
    const schema = getSchemaForCategory(payload.category);
    if (!schema) {
        errors.push(`unknown_category:${payload.category}`);
        return { valid: false, errors };
    }
    if (!payload.provider || !schema.providerOptions.includes(payload.provider)) {
        errors.push(`invalid_provider:${payload.provider}`);
    }
    const fields = payload.fields || {};
    for (const fieldSchema of schema.fields) {
        const value = fields[fieldSchema.key];
        if (fieldSchema.required && (value === undefined || value === null || value === '')) {
            errors.push(`missing_required_field:${fieldSchema.key}`);
            continue;
        }
        if (value !== undefined && fieldSchema.pattern) {
            const re = new RegExp(fieldSchema.pattern);
            if (typeof value !== 'string' || !re.test(value)) {
                errors.push(`invalid_format:${fieldSchema.key}`);
            }
        }
        if (value !== undefined && fieldSchema.options && !fieldSchema.options.includes(String(value))) {
            errors.push(`invalid_option:${fieldSchema.key}`);
        }
    }
    if (schema.rotationRequired && !payload.validUntilIso) {
        errors.push('missing_validUntilIso');
    }
    return { valid: errors.length === 0, errors };
}

/**
 * Helper: lista campos sensíveis (secrets) de uma categoria — usado pelo
 * admin painel para mascarar exibição após salvar.
 */
export function getSensitiveFieldKeys(category: CredentialCategory): ReadonlyArray<string> {
    const schema = getSchemaForCategory(category);
    if (!schema) return [];
    return Object.freeze(
        schema.fields.filter((f) => f.sensitivity === 'secret').map((f) => f.key),
    );
}

/**
 * Estatísticas para admin dashboard.
 */
export interface RegistryStats {
    totalCategories: number;
    totalFields: number;
    totalSecretFields: number;
    rotationRequiredCount: number;
    multiAllowedCount: number;
    categories: ReadonlyArray<CredentialCategory>;
}

export function getRegistryStats(): RegistryStats {
    const categories = listCredentialCategories();
    let totalFields = 0;
    let totalSecretFields = 0;
    let rotationRequiredCount = 0;
    let multiAllowedCount = 0;
    for (const cat of categories) {
        const s = CREDENTIAL_SCHEMAS_REGISTRY[cat];
        totalFields += s.fields.length;
        totalSecretFields += s.fields.filter((f) => f.sensitivity === 'secret').length;
        if (s.rotationRequired) rotationRequiredCount++;
        if (s.allowMultiple) multiAllowedCount++;
    }
    return {
        totalCategories: categories.length,
        totalFields,
        totalSecretFields,
        rotationRequiredCount,
        multiAllowedCount,
        categories,
    };
}
