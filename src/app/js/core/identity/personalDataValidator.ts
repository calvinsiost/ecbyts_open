// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PERSONAL DATA VALIDATOR — SPEC_PERSONAL_ENVIRONMENT_IDENTITY

   Pure helpers para ambiente pessoal:
   - CPF validator (dígitos verificadores oficiais)
   - CNPJ validator (algoritmo Receita Federal)
   - Phone mask BR
   - CEP mask BR
   - Credit card masking (only last 4 visible)
   - Address validation (required fields)
   - Security badge status (password strength + 2FA)

   IMPORTANTE: nunca armazenar PII em localStorage/cookies — só em
   Supabase user_personal_data com RLS.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────

export const TAX_ID_TYPES = Object.freeze(['cpf', 'cnpj']);

export const CARD_BRANDS = Object.freeze(['visa', 'mastercard', 'amex', 'elo', 'hipercard', 'other']);

export const ADDRESS_REQUIRED_FIELDS = Object.freeze(['addressLine1', 'city', 'state', 'zipCode', 'country']);

export const SECURITY_LEVELS = Object.freeze(['weak', 'medium', 'strong']);

// ──────────────────────────────────────────────────────────────────────
// CPF validator (11 dígitos + 2 verificadores)
// ──────────────────────────────────────────────────────────────────────

/**
 * Valida CPF brasileiro usando algoritmo oficial.
 */
export function isValidCPF(cpf: string): boolean {
    if (typeof cpf !== 'string') return false;
    const digits = cpf.replace(/\D/g, '');
    if (digits.length !== 11) return false;
    // Rejeita dígitos iguais (111.111.111-11 etc)
    if (/^(\d)\1{10}$/.test(digits)) return false;

    // Primeiro DV
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(digits[i] as string, 10) * (10 - i);
    let dv1 = 11 - (sum % 11);
    if (dv1 >= 10) dv1 = 0;
    if (dv1 !== parseInt(digits[9] as string, 10)) return false;

    // Segundo DV
    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(digits[i] as string, 10) * (11 - i);
    let dv2 = 11 - (sum % 11);
    if (dv2 >= 10) dv2 = 0;
    return dv2 === parseInt(digits[10] as string, 10);
}

// ──────────────────────────────────────────────────────────────────────
// CNPJ validator (14 dígitos + 2 verificadores)
// ──────────────────────────────────────────────────────────────────────

/**
 * Valida CNPJ brasileiro.
 */
export function isValidCNPJ(cnpj: string): boolean {
    if (typeof cnpj !== 'string') return false;
    const digits = cnpj.replace(/\D/g, '');
    if (digits.length !== 14) return false;
    if (/^(\d)\1{13}$/.test(digits)) return false;

    const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    let sum = 0;
    for (let i = 0; i < 12; i++) sum += parseInt(digits[i] as string, 10) * (weights1[i] as number);
    let dv1 = sum % 11;
    dv1 = dv1 < 2 ? 0 : 11 - dv1;
    if (dv1 !== parseInt(digits[12] as string, 10)) return false;

    sum = 0;
    for (let i = 0; i < 13; i++) sum += parseInt(digits[i] as string, 10) * (weights2[i] as number);
    let dv2 = sum % 11;
    dv2 = dv2 < 2 ? 0 : 11 - dv2;
    return dv2 === parseInt(digits[13] as string, 10);
}

// ──────────────────────────────────────────────────────────────────────
// Tax ID detector
// ──────────────────────────────────────────────────────────────────────

export function detectTaxIdType(taxId: string): 'cpf' | 'cnpj' | 'invalid' {
    if (typeof taxId !== 'string') return 'invalid';
    const digits = taxId.replace(/\D/g, '');
    if (digits.length === 11) return isValidCPF(taxId) ? 'cpf' : 'invalid';
    if (digits.length === 14) return isValidCNPJ(taxId) ? 'cnpj' : 'invalid';
    return 'invalid';
}

// ──────────────────────────────────────────────────────────────────────
// Masks BR
// ──────────────────────────────────────────────────────────────────────

/**
 * Formata CPF: 000.000.000-00
 */
export function formatCPF(cpf: string): string {
    if (typeof cpf !== 'string') return '';
    const d = cpf.replace(/\D/g, '').slice(0, 11).padStart(11, '•').replace(/•/g, '');
    return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2}).*$/, '$1.$2.$3-$4');
}

/**
 * Formata CNPJ: 00.000.000/0000-00
 */
export function formatCNPJ(cnpj: string): string {
    if (typeof cnpj !== 'string') return '';
    const d = cnpj.replace(/\D/g, '').slice(0, 14);
    return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*$/, '$1.$2.$3/$4-$5');
}

/**
 * Formata CEP: 00000-000
 */
export function formatCEP(cep: string): string {
    if (typeof cep !== 'string') return '';
    const d = cep.replace(/\D/g, '').slice(0, 8);
    if (d.length <= 5) return d;
    return d.replace(/^(\d{5})(\d+)$/, '$1-$2');
}

/**
 * Formata telefone BR: (00) 00000-0000 ou (00) 0000-0000
 */
export function formatPhoneBR(phone: string): string {
    if (typeof phone !== 'string') return '';
    const d = phone.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// ──────────────────────────────────────────────────────────────────────
// Card masking (never expose beyond last 4)
// ──────────────────────────────────────────────────────────────────────

/**
 * @returns "•••• •••• •••• 4242"
 */
export function maskCardNumber(last4: string): string {
    const clean = String(last4 || '')
        .replace(/\D/g, '')
        .slice(-4);
    if (clean.length !== 4) return '';
    return `•••• •••• •••• ${clean}`;
}

export function isValidCardBrand(brand: string): boolean {
    return CARD_BRANDS.includes(String(brand || '').toLowerCase());
}

// ──────────────────────────────────────────────────────────────────────
// Address validation
// ──────────────────────────────────────────────────────────────────────

export function validateAddress(address: object): { valid: boolean; missing: string[] } {
    const missing: string[] = [];
    if (!address || typeof address !== 'object') {
        return { valid: false, missing: [...ADDRESS_REQUIRED_FIELDS] };
    }
    for (const field of ADDRESS_REQUIRED_FIELDS) {
        const a = address as Record<string, unknown>;
        if (!a[field] || String(a[field]).trim() === '') {
            missing.push(field);
        }
    }
    return { valid: missing.length === 0, missing };
}

// ──────────────────────────────────────────────────────────────────────
// Security badge status
// ──────────────────────────────────────────────────────────────────────

/**
 * Computa nível de segurança baseado em password strength + 2FA.
 */
export function computeSecurityLevel(input: {
    passwordScore?: number;
    has2FA?: boolean;
    hasPasskey?: boolean;
}): 'weak' | 'medium' | 'strong' {
    if (!input || typeof input !== 'object') return 'weak';
    const score = Number(input.passwordScore) || 0;
    const has2FA = Boolean(input.has2FA);
    const hasPasskey = Boolean(input.hasPasskey);

    if (hasPasskey) return 'strong';
    if (has2FA && score >= 3) return 'strong';
    if (score >= 4) return 'medium';
    if (score >= 3 || has2FA) return 'medium';
    return 'weak';
}

/**
 * Badge color + label para UI.
 */
export function getSecurityBadge(level: string): { color: string; label: string } {
    if (level === 'strong') return { color: '#2ecc71', label: 'Seguro' };
    if (level === 'medium') return { color: '#f1c40f', label: 'Médio' };
    return { color: '#e74c3c', label: 'Fraco' };
}

// ──────────────────────────────────────────────────────────────────────
// Initials (avatar fallback)
// ──────────────────────────────────────────────────────────────────────

/**
 * Extrai até 2 iniciais de um nome completo.
 */
export function extractInitials(fullName: string): string {
    if (typeof fullName !== 'string') return '??';
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '??';
    if (parts.length === 1) return (parts[0] as string)[0]!.toUpperCase();
    return ((parts[0] as string)[0]! + (parts[parts.length - 1] as string)[0]!).toUpperCase();
}
