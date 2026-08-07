// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   LGPD PII REDACTOR (utils/helpers — cross-spec pure-logic)
   ================================================================

   Detecta + mascara dados pessoais (PII) em texto livre. Cobre PII
   brasileira (CPF, CNPJ, telefone) + universal (email, IPv4, credit
   card). Endereça LGPD Art. 7º (tratamento) + Art. 18º (direito ao
   apagamento) — qualquer texto exportado/logado/enviado p/ terceiros
   DEVE passar pelo redactor.

   Cross-spec consumers:
     - supabase/functions/error-ingest (anti-PII leak em error reports)
     - supabase/functions/telemetry-ingest (anti-PII events)
     - core/photolog/* (sanitize captions)
     - utils/errorReporting/* (bug report scrub)
     - utils/helpers/_observabilityReportPure (PII guard refinado)
     - LGPD export (mask PII em exports não autorizados)
     - utils/helpers/_errorNormalizerPure (message sanitization)

   Pure-logic: regex-based + sem I/O. Determinístico. Caller decide
   placeholder format (default '[REDACTED:KIND]') e quais kinds
   incluir/excluir.

   IMPORTANTE: NÃO substitui consent management. Apenas defesa em
   profundidade contra leak acidental.
   ================================================================ */

export type PiiKind = 'cpf' | 'cnpj' | 'email' | 'phone_br' | 'ipv4' | 'credit_card' | 'cep';

export const ALL_PII_KINDS: readonly PiiKind[] = Object.freeze([
    'cpf',
    'cnpj',
    'email',
    'phone_br',
    'ipv4',
    'credit_card',
    'cep',
]);

export const DEFAULT_PLACEHOLDER = '[REDACTED:KIND]';
const PLACEHOLDER_TOKEN = 'KIND';

const CPF_REGEX = /\b(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})\b/g;
const CNPJ_REGEX = /\b(\d{2})\.?(\d{3})\.?(\d{3})\/?(\d{4})-?(\d{2})\b/g;
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_BR_REGEX = /(?:\+55\s?)?(?:\(?\d{2}\)?\s?)?9?\d{4}[-\s]?\d{4}\b/g;
const IPV4_REGEX = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g;
const CREDIT_CARD_REGEX = /\b(?:\d[ -]*?){13,19}\b/g;
const CEP_REGEX = /\b\d{5}-?\d{3}\b/g;

export interface RedactOptions {
    readonly placeholder?: string;
    readonly enabledKinds?: readonly PiiKind[];
    readonly disabledKinds?: readonly PiiKind[];
    readonly preserveCount?: boolean;
}

export interface RedactionReport {
    readonly redactedText: string;
    readonly found: Readonly<Record<PiiKind, number>>;
    readonly totalRedactions: number;
    readonly severity: 'none' | 'low' | 'medium' | 'high';
}

function buildPlaceholder(template: string, kind: PiiKind): string {
    if (typeof template !== 'string' || template.length === 0) {
        return `[REDACTED:${kind}]`;
    }
    return template.replace(PLACEHOLDER_TOKEN, kind);
}

function isKindEnabled(kind: PiiKind, options: RedactOptions | undefined): boolean {
    if (options?.disabledKinds && options.disabledKinds.includes(kind)) return false;
    if (options?.enabledKinds && options.enabledKinds.length > 0) {
        return options.enabledKinds.includes(kind);
    }
    return true;
}

function luhnValid(digitsOnly: string): boolean {
    if (digitsOnly.length < 13 || digitsOnly.length > 19) return false;
    let sum = 0;
    let alt = false;
    for (let i = digitsOnly.length - 1; i >= 0; i--) {
        let n = digitsOnly.charCodeAt(i) - 48;
        if (n < 0 || n > 9) return false;
        if (alt) {
            n *= 2;
            if (n > 9) n -= 9;
        }
        sum += n;
        alt = !alt;
    }
    return sum % 10 === 0;
}

export function detectPiiKinds(text: unknown): readonly PiiKind[] {
    if (typeof text !== 'string' || text.length === 0) return Object.freeze([]);
    const found = new Set<PiiKind>();
    if (CPF_REGEX.test(text)) found.add('cpf');
    if (CNPJ_REGEX.test(text)) found.add('cnpj');
    if (EMAIL_REGEX.test(text)) found.add('email');
    if (PHONE_BR_REGEX.test(text)) found.add('phone_br');
    if (IPV4_REGEX.test(text)) found.add('ipv4');
    if (CEP_REGEX.test(text)) found.add('cep');
    CPF_REGEX.lastIndex = CNPJ_REGEX.lastIndex = EMAIL_REGEX.lastIndex = 0;
    PHONE_BR_REGEX.lastIndex = IPV4_REGEX.lastIndex = CEP_REGEX.lastIndex = 0;
    CREDIT_CARD_REGEX.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CREDIT_CARD_REGEX.exec(text)) !== null) {
        const digits = m[0].replace(/[\s-]/g, '');
        if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) {
            found.add('credit_card');
            break;
        }
    }
    CREDIT_CARD_REGEX.lastIndex = 0;
    return Object.freeze(Array.from(found));
}

export function maskValue(value: string, kind: PiiKind, placeholder?: string): string {
    // eslint-disable-next-line
    const safe = typeof value === 'string' ? value : '';
    return buildPlaceholder(placeholder ?? DEFAULT_PLACEHOLDER, kind);
}

export function redactPii(text: unknown, options?: RedactOptions): string {
    if (typeof text !== 'string' || text.length === 0) return '';
    const placeholder = options?.placeholder ?? DEFAULT_PLACEHOLDER;
    let out = text;
    if (isKindEnabled('cnpj', options)) {
        out = out.replace(CNPJ_REGEX, () => buildPlaceholder(placeholder, 'cnpj'));
    }
    if (isKindEnabled('cpf', options)) {
        out = out.replace(CPF_REGEX, () => buildPlaceholder(placeholder, 'cpf'));
    }
    if (isKindEnabled('email', options)) {
        out = out.replace(EMAIL_REGEX, () => buildPlaceholder(placeholder, 'email'));
    }
    if (isKindEnabled('credit_card', options)) {
        out = out.replace(CREDIT_CARD_REGEX, match => {
            const digits = match.replace(/[\s-]/g, '');
            return luhnValid(digits) ? buildPlaceholder(placeholder, 'credit_card') : match;
        });
    }
    if (isKindEnabled('phone_br', options)) {
        out = out.replace(PHONE_BR_REGEX, () => buildPlaceholder(placeholder, 'phone_br'));
    }
    if (isKindEnabled('cep', options)) {
        out = out.replace(CEP_REGEX, () => buildPlaceholder(placeholder, 'cep'));
    }
    if (isKindEnabled('ipv4', options)) {
        out = out.replace(IPV4_REGEX, () => buildPlaceholder(placeholder, 'ipv4'));
    }
    return out;
}

function countMatches(text: string, regex: RegExp, validator?: (m: string) => boolean): number {
    regex.lastIndex = 0;
    let count = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
        if (!validator || validator(m[0])) count++;
    }
    regex.lastIndex = 0;
    return count;
}

export function decideRedaction(text: unknown, options?: RedactOptions): RedactionReport {
    if (typeof text !== 'string' || text.length === 0) {
        return Object.freeze({
            redactedText: '',
            found: Object.freeze({
                cpf: 0,
                cnpj: 0,
                email: 0,
                phone_br: 0,
                ipv4: 0,
                credit_card: 0,
                cep: 0,
            }) as Readonly<Record<PiiKind, number>>,
            totalRedactions: 0,
            severity: 'none' as const,
        });
    }
    const found: Record<PiiKind, number> = {
        cpf: isKindEnabled('cpf', options) ? countMatches(text, CPF_REGEX) : 0,
        cnpj: isKindEnabled('cnpj', options) ? countMatches(text, CNPJ_REGEX) : 0,
        email: isKindEnabled('email', options) ? countMatches(text, EMAIL_REGEX) : 0,
        phone_br: isKindEnabled('phone_br', options) ? countMatches(text, PHONE_BR_REGEX) : 0,
        ipv4: isKindEnabled('ipv4', options) ? countMatches(text, IPV4_REGEX) : 0,
        credit_card: isKindEnabled('credit_card', options)
            ? countMatches(text, CREDIT_CARD_REGEX, m => luhnValid(m.replace(/[\s-]/g, '')))
            : 0,
        cep: isKindEnabled('cep', options) ? countMatches(text, CEP_REGEX) : 0,
    };
    const totalRedactions = Object.values(found).reduce((a, b) => a + b, 0);
    let severity: RedactionReport['severity'];
    if (totalRedactions === 0) severity = 'none';
    else if (found.credit_card > 0 || found.cpf > 0) severity = 'high';
    else if (found.cnpj > 0 || found.email > 0 || found.phone_br > 0) severity = 'medium';
    else severity = 'low';
    return Object.freeze({
        redactedText: redactPii(text, options),
        found: Object.freeze(found) as Readonly<Record<PiiKind, number>>,
        totalRedactions,
        severity,
    });
}
