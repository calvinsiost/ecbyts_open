// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Module Provenance Capture (F3 publish flow) for
// SPEC_MODULE_PROVENANCE_LIBRARIES_NAV. Hand-authored R1-safe — registra
// proveniência developed/validated quando módulo é publicado/atualizado.
//
// Spec NOT:
// - NÃO reimplementar recordModuleProvenance (delega F1)
// - NÃO criar novo store provenance (caller injeta)
// - NÃO emoji em strings
// - NÃO accountability órfã (aiOperatedByUser obrigatório quando actor=ai BP3)

import { recordModuleProvenance, exportModuleSbom } from './moduleProvenance.js';

export type CaptureRole = 'developed' | 'validated';
export type CaptureActor = 'human' | 'ai';

export interface CaptureInput {
    store: any;
    moduleId: string;
    role: CaptureRole;
    actor: CaptureActor;
    byUser: string;
    aiSystem?: string;
    aiVersion?: string;
    aiOperatedByUser?: string;
    action?: string;
}

interface ValidationResult {
    valid: boolean;
    reason?: string;
}

const VALID_ROLES: ReadonlySet<string> = new Set(['developed', 'validated']);
const VALID_ACTORS: ReadonlySet<string> = new Set(['human', 'ai']);

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}

function validateRequiredFields(input: any): ValidationResult {
    if (!isNonEmptyString(input.moduleId)) {
        return { valid: false, reason: 'missing-moduleId' };
    }
    if (!VALID_ROLES.has(input.role)) {
        return { valid: false, reason: 'invalid-role' };
    }
    if (!VALID_ACTORS.has(input.actor)) {
        return { valid: false, reason: 'invalid-actor' };
    }
    if (!isNonEmptyString(input.byUser)) {
        return { valid: false, reason: 'missing-byUser-accountability' };
    }
    return { valid: true };
}

function validateAiFields(input: any): ValidationResult {
    if (input.actor !== 'ai') {
        return { valid: true };
    }
    if (!isNonEmptyString(input.aiSystem)) {
        return { valid: false, reason: 'missing-aiSystem' };
    }
    if (!isNonEmptyString(input.aiOperatedByUser)) {
        return { valid: false, reason: 'missing-aiOperatedByUser-BP3-violation' };
    }
    return { valid: true };
}

/**
 * Valida input antes de registrar — fail-fast para accountability.
 */
export function validateCaptureInput(input: any): ValidationResult {
    if (!input || typeof input !== 'object') return { valid: false, reason: 'missing-input' };
    if (!input.store) return { valid: false, reason: 'missing-store' };

    const required = validateRequiredFields(input);
    if (!required.valid) return required;

    return validateAiFields(input);
}

/**
 * Captura proveniência developed quando módulo é publicado.
 */
export function captureModulePublish(input: Omit<CaptureInput, 'role'>): any {
    const full: any = { ...input, role: 'developed' as const, action: input?.action || 'publish' };
    const v = validateCaptureInput(full);
    if (!v.valid) {
        console.debug('[moduleProvenanceCapture:publish] invalid:', v.reason);
        return null;
    }
    try {
        return recordModuleProvenance(full.store, full.moduleId, full);
    } catch (e: any) {
        console.debug('[moduleProvenanceCapture:publish]', e?.message || e);
        return null;
    }
}

/**
 * Captura proveniência validated quando módulo é revisado/aprovado.
 */
export function captureModuleValidation(input: Omit<CaptureInput, 'role'>): any {
    const full: any = { ...input, role: 'validated' as const, action: input?.action || 'validate' };
    const v = validateCaptureInput(full);
    if (!v.valid) {
        console.debug('[moduleProvenanceCapture:validate] invalid:', v.reason);
        return null;
    }
    try {
        return recordModuleProvenance(full.store, full.moduleId, full);
    } catch (e: any) {
        console.debug('[moduleProvenanceCapture:validate]', e?.message || e);
        return null;
    }
}

/**
 * Auto-parse Co-Authored-By trailer + captura developed (BP2 DCO).
 */
export function captureFromCommitTrailers(input: {
    store: any;
    moduleId: string;
    commitMessage: string;
    defaultByUser: string;
}): any[] {
    if (!input?.commitMessage || typeof input.commitMessage !== 'string') return [];
    const captures: any[] = [];
    const lines = input.commitMessage.split(/\r?\n/);
    const trailerRe = /^Co-Authored-By:\s*(.+?)\s*<(.+?)>\s*$/i;
    for (const line of lines) {
        const m = line.match(trailerRe);
        if (!m) continue;
        const name = (m[1] as string).trim();
        // eslint-disable-next-line
        const email = (m[2] as string).trim();
        const isAi = /claude|gpt|gemini|openai|anthropic|kimi|deepseek/i.test(name);
        const captureInput: any = {
            store: input.store,
            moduleId: input.moduleId,
            role: 'developed',
            actor: isAi ? 'ai' : 'human',
            byUser: input.defaultByUser,
            action: 'commit-trailer-parse',
        };
        if (isAi) {
            captureInput.aiSystem = name;
            captureInput.aiOperatedByUser = input.defaultByUser;
        } else {
            captureInput.byUser = name;
        }
        const result = captureModulePublish(captureInput);
        if (result) captures.push(result);
    }
    return captures;
}

/**
 * Export SBOM para módulo (BP4 mini-SBOM).
 */
export function exportModuleProvenanceSbom(input: { store: any; moduleId: string; format?: 'json' | 'spdx' }): any {
    if (!input?.store || !input?.moduleId) return null;
    try {
        return exportModuleSbom(input.store, input.moduleId, { format: input.format || 'json' } as any);
    } catch (e: any) {
        console.debug('[moduleProvenanceCapture:sbom]', e?.message || e);
        return null;
    }
}
