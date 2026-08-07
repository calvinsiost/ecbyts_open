// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Authorship: Calvin Stefan Iost
/* ================================================================
   PROJECT REGISTRY PURE — fiscal/corporate registry domain
   Lógica pura extraída de project.ts (ARCH-MONOLITH-ATOMIZATION-001):
   catálogo de tipos de cadastro + máscara de input + validação de
   dígito verificador (CPF/CNPJ) + mascaramento de exibição PII.

   Sem DOM, sem state mutável, sem efeitos colaterais. Apenas string-in /
   string-out + check-digit math determinístico.
   ================================================================ */

export type RegistryTypeId =
    | 'cnpj'
    | 'cpf'
    | 'ein'
    | 'vat'
    | 'duns'
    | 'rfc'
    | 'cuit'
    | 'rut'
    | 'nit'
    | 'other';

export interface RegistryTypeEntry {
    readonly id: RegistryTypeId;
    readonly label: string;
    readonly placeholder: string;
    readonly personal: boolean;
}

export interface RegistryValidation {
    valid: boolean;
    message: string;
}

/**
 * Catálogo de tipos de cadastro fiscal/corporativo (Brazil-first).
 * Frozen — consumidores tratam como read-only.
 */
export const REGISTRY_TYPES: ReadonlyArray<RegistryTypeEntry> = Object.freeze([
    { id: 'cnpj', label: 'CNPJ (BR)', placeholder: 'XX.XXX.XXX/XXXX-XX', personal: false },
    { id: 'cpf', label: 'CPF (BR)', placeholder: 'XXX.XXX.XXX-XX', personal: true },
    { id: 'ein', label: 'EIN (US)', placeholder: 'XX-XXXXXXX', personal: false },
    { id: 'vat', label: 'VAT (EU)', placeholder: 'XX000000000', personal: false },
    { id: 'duns', label: 'DUNS', placeholder: '00-000-0000', personal: false },
    { id: 'rfc', label: 'RFC (MX)', placeholder: 'AAAA000000XXX', personal: false },
    { id: 'cuit', label: 'CUIT (AR)', placeholder: 'XX-XXXXXXXX-X', personal: false },
    { id: 'rut', label: 'RUT (CL)', placeholder: 'XXXXXXXX-X', personal: false },
    { id: 'nit', label: 'NIT (CO)', placeholder: 'XXXXXXXXX-X', personal: false },
    { id: 'other', label: 'Other / Custom', placeholder: '', personal: false },
]) as ReadonlyArray<RegistryTypeEntry>;

/**
 * Aplica máscara de formatação ao número de cadastro conforme o tipo.
 * @param type - Registry type ID
 * @param raw  - Raw user input
 * @returns Formatted string
 */
export function applyRegistryMask(type: string, raw: string): string {
    const safeRaw = String(raw ?? '');
    const d = safeRaw.replace(/\D/g, '');
    switch (type) {
        case 'cnpj': {
            let v = d.slice(0, 14);
            if (v.length > 12)
                v =
                    v.slice(0, 2) +
                    '.' +
                    v.slice(2, 5) +
                    '.' +
                    v.slice(5, 8) +
                    '/' +
                    v.slice(8, 12) +
                    '-' +
                    v.slice(12);
            else if (v.length > 8) v = v.slice(0, 2) + '.' + v.slice(2, 5) + '.' + v.slice(5, 8) + '/' + v.slice(8);
            else if (v.length > 5) v = v.slice(0, 2) + '.' + v.slice(2, 5) + '.' + v.slice(5);
            else if (v.length > 2) v = v.slice(0, 2) + '.' + v.slice(2);
            return v;
        }
        case 'cpf': {
            let v = d.slice(0, 11);
            if (v.length > 9) v = v.slice(0, 3) + '.' + v.slice(3, 6) + '.' + v.slice(6, 9) + '-' + v.slice(9);
            else if (v.length > 6) v = v.slice(0, 3) + '.' + v.slice(3, 6) + '.' + v.slice(6);
            else if (v.length > 3) v = v.slice(0, 3) + '.' + v.slice(3);
            return v;
        }
        case 'ein': {
            let v = d.slice(0, 9);
            if (v.length > 2) v = v.slice(0, 2) + '-' + v.slice(2);
            return v;
        }
        case 'duns': {
            let v = d.slice(0, 9);
            if (v.length > 5) v = v.slice(0, 2) + '-' + v.slice(2, 5) + '-' + v.slice(5);
            else if (v.length > 2) v = v.slice(0, 2) + '-' + v.slice(2);
            return v;
        }
        case 'cuit': {
            let v = d.slice(0, 11);
            if (v.length > 10) v = v.slice(0, 2) + '-' + v.slice(2, 10) + '-' + v.slice(10);
            else if (v.length > 2) v = v.slice(0, 2) + '-' + v.slice(2);
            return v;
        }
        default:
            return safeRaw.slice(0, 30);
    }
}

/**
 * Valida um número de cadastro conforme as regras do tipo.
 * CPF/CNPJ usam dígito verificador (módulo 11). EIN só checa tamanho.
 * @param type  - Registry type ID
 * @param value - Already masked string
 * @returns { valid, message }
 */
export function validateRegistry(type: string, value: string): RegistryValidation {
    const d = String(value ?? '').replace(/\D/g, '');
    if (!d) return { valid: true, message: '' };
    switch (type) {
        case 'cnpj': {
            if (d.length !== 14) return { valid: false, message: 'cnpjLength' };
            if (/^(\d)\1+$/.test(d)) return { valid: false, message: 'cnpjInvalid' };
            const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
            let s = 0;
            for (let i = 0; i < 12; i++) s += parseInt(d[i] || '0', 10) * (w1[i] || 0);
            let r = s % 11;
            const c1 = r < 2 ? 0 : 11 - r;
            if (parseInt(d[12] || '0', 10) !== c1) return { valid: false, message: 'cnpjInvalid' };
            const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
            s = 0;
            for (let i = 0; i < 13; i++) s += parseInt(d[i] || '0', 10) * (w2[i] || 0);
            r = s % 11;
            const c2 = r < 2 ? 0 : 11 - r;
            if (parseInt(d[13] || '0', 10) !== c2) return { valid: false, message: 'cnpjInvalid' };
            return { valid: true, message: '' };
        }
        case 'cpf': {
            if (d.length !== 11) return { valid: false, message: 'cpfLength' };
            if (/^(\d)\1+$/.test(d)) return { valid: false, message: 'cpfInvalid' };
            let s = 0;
            for (let i = 0; i < 9; i++) s += parseInt(d[i] || '0', 10) * (10 - i);
            let r = (s * 10) % 11;
            const c1 = r >= 10 ? 0 : r;
            if (parseInt(d[9] || '0', 10) !== c1) return { valid: false, message: 'cpfInvalid' };
            s = 0;
            for (let i = 0; i < 10; i++) s += parseInt(d[i] || '0', 10) * (11 - i);
            r = (s * 10) % 11;
            const c2 = r >= 10 ? 0 : r;
            if (parseInt(d[10] || '0', 10) !== c2) return { valid: false, message: 'cpfInvalid' };
            return { valid: true, message: '' };
        }
        case 'ein':
            return d.length === 9 ? { valid: true, message: '' } : { valid: false, message: 'einLength' };
        default:
            return { valid: true, message: '' };
    }
}

/**
 * Mascara números pessoais de cadastro para exibição (PII).
 * CPF: mostra ***.***. ***-XX (últimos 2 dígitos). Não-pessoais: completo.
 * @param type   - Registry type ID
 * @param value  - Full registry number
 * @returns Masked or full display string
 */
export function maskPersonalRegistry(type: string, value: string): string {
    if (!value || !String(value).trim()) return '';
    const entry = REGISTRY_TYPES.find((r) => r.id === type);
    if (!entry?.personal) return String(value);
    const d = String(value).replace(/\D/g, '');
    if (type === 'cpf' && d.length >= 2) {
        return `***.***. ***-${d.slice(-2)}`;
    }
    return '***';
}
