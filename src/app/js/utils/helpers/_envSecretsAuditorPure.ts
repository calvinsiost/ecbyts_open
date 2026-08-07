// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* global Buffer */
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   ENV SECRETS AUDITOR (utils/helpers — cross-spec pure-logic)
   ================================================================

   Detector de secrets vazados em texto/diff/arquivo. Reconhece:
     - AWS Access Key (AKIA...) + Secret Access Key
     - GitHub PAT (ghp_, gho_, ghu_, ghs_, ghr_)
     - OpenAI API key (sk-...)
     - Anthropic API key (sk-ant-...)
     - Stripe (sk_live_, pk_live_, whsec_)
     - Supabase service_role JWT
     - Google API key (AIza...)
     - Slack tokens (xox[ab])
     - Private keys (-----BEGIN ... PRIVATE KEY-----)
     - Password assignments em .env style

   Cross-spec consumers:
     - pre-commit hook (block commits com secrets)
     - perimeter-scan.mjs P-5 (secrets em arquivos servidos)
     - supabase/functions/error-ingest (sanitize antes log)
     - code review automation
     - LESSONS doc update (auto-redact)

   Pure-logic: regex-based + sem I/O. Determinístico. Caller carrega
   texto via fs.readFile / git diff / etc.

   IMPORTANTE: pattern-matcher, não scanner perfeito. Cobre 90%
   dos secret formats comuns. Caller deve usar entropy check
   adicional para custom tokens.
   ================================================================ */

export type SecretKind =
    | 'aws_access_key'
    | 'aws_secret_key'
    | 'github_pat'
    | 'openai_key'
    | 'anthropic_key'
    | 'stripe_secret'
    | 'stripe_publishable'
    | 'stripe_webhook'
    | 'supabase_service_role'
    | 'supabase_publishable'
    | 'google_api_key'
    | 'slack_token'
    | 'private_key_pem'
    | 'password_assignment'
    | 'generic_high_entropy';

export const ALL_SECRET_KINDS: readonly SecretKind[] = Object.freeze([
    'aws_access_key',
    'aws_secret_key',
    'github_pat',
    'openai_key',
    'anthropic_key',
    'stripe_secret',
    'stripe_publishable',
    'stripe_webhook',
    'supabase_service_role',
    'supabase_publishable',
    'google_api_key',
    'slack_token',
    'private_key_pem',
    'password_assignment',
    'generic_high_entropy',
]);

const PATTERNS: { readonly kind: SecretKind; readonly regex: RegExp; readonly severity: Severity }[] = [
    { kind: 'aws_access_key', regex: /\bAKIA[0-9A-Z]{16}\b/g, severity: 'critical' },
    { kind: 'github_pat', regex: /\bgh[poushr]_[A-Za-z0-9_]{36,}\b/g, severity: 'critical' },
    { kind: 'anthropic_key', regex: /\bsk-ant-[a-zA-Z0-9_-]{40,}\b/g, severity: 'critical' },
    { kind: 'openai_key', regex: /\bsk-[a-zA-Z0-9]{20,48}T3BlbkFJ[a-zA-Z0-9]{20,48}\b/g, severity: 'critical' },
    { kind: 'stripe_secret', regex: /\bsk_live_[a-zA-Z0-9]{24,}\b/g, severity: 'critical' },
    { kind: 'stripe_publishable', regex: /\bpk_live_[a-zA-Z0-9]{24,}\b/g, severity: 'high' },
    { kind: 'stripe_webhook', regex: /\bwhsec_[a-zA-Z0-9]{32,}\b/g, severity: 'critical' },
    { kind: 'supabase_publishable', regex: /\bsb_publishable_[A-Za-z0-9_-]{20,}\b/g, severity: 'low' },
    { kind: 'supabase_service_role', regex: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/g, severity: 'critical' },
    { kind: 'google_api_key', regex: /\bAIza[0-9A-Za-z_-]{35}\b/g, severity: 'critical' },
    { kind: 'slack_token', regex: /\bxox[abrsp]-[A-Za-z0-9-]{10,}\b/g, severity: 'critical' },
];

const SUPABASE_JWT_REGEX = /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const PRIVATE_KEY_REGEX = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const AWS_SECRET_REGEX = /\b(?:aws_secret_access_key|aws_secret|secret_access_key)\s*[=:]\s*['"]?([A-Za-z0-9/+=]{40})['"]?/gi;
const PASSWORD_ASSIGN_REGEX = /\b(password|passwd|pwd|secret|api[_-]?key|token)\s*[=:]\s*['"]([^'"]{8,})['"]/gi;

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface SecretMatch {
    readonly kind: SecretKind;
    readonly severity: Severity;
    readonly index: number;
    readonly length: number;
    readonly snippet: string;
}

export interface DetectionReport {
    readonly matches: readonly SecretMatch[];
    readonly counts: Readonly<Record<SecretKind, number>>;
    readonly totalMatches: number;
    readonly worstSeverity: Severity | 'none';
    readonly passed: boolean;
}

export interface GateVerdict {
    readonly action: 'allow' | 'block' | 'review';
    readonly reason: string;
}

function makeSnippet(match: string, kind: SecretKind): string {
    if (kind === 'private_key_pem') return `[PEM ${match.length} bytes]`;
    if (match.length <= 12) return `${match.slice(0, 4)}…`;
    return `${match.slice(0, 6)}…${match.slice(-4)}`;
}

function emptyCounts(): Record<SecretKind, number> {
    return {
        aws_access_key: 0,
        aws_secret_key: 0,
        github_pat: 0,
        openai_key: 0,
        anthropic_key: 0,
        stripe_secret: 0,
        stripe_publishable: 0,
        stripe_webhook: 0,
        supabase_service_role: 0,
        supabase_publishable: 0,
        google_api_key: 0,
        slack_token: 0,
        private_key_pem: 0,
        password_assignment: 0,
        generic_high_entropy: 0,
    };
}

function severityRank(s: Severity | 'none'): number {
    switch (s) {
        case 'critical':
            return 4;
        case 'high':
            return 3;
        case 'medium':
            return 2;
        case 'low':
            return 1;
        default:
            return 0;
    }
}

function worstOf(a: Severity | 'none', b: Severity | 'none'): Severity | 'none' {
    return severityRank(a) >= severityRank(b) ? a : b;
}

function pushMatch(
    matches: SecretMatch[],
    counts: Record<SecretKind, number>,
    kind: SecretKind,
    severity: Severity,
    text: string,
    regex: RegExp
): void {
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
        matches.push(Object.freeze({
            kind,
            severity,
            index: m.index,
            length: m[0].length,
            snippet: makeSnippet(m[0], kind),
        }));
        counts[kind]++;
    }
    regex.lastIndex = 0;
}

function looksLikeSupabaseJwt(jwt: string): { match: boolean; severity: Severity; kind: SecretKind } {
    const parts = jwt.split('.');
    if (parts.length !== 3) return { match: false, severity: 'low', kind: 'supabase_service_role' };
    try {
        const payloadJson = Buffer.from(parts[1]!, 'base64').toString('utf8');
        const payload = JSON.parse(payloadJson);
        if (payload && typeof payload === 'object') {
            const role = (payload as Record<string, unknown>).role;
            if (role === 'service_role') {
                return { match: true, severity: 'critical', kind: 'supabase_service_role' };
            }
            if (role === 'anon' || role === 'authenticated') {
                return { match: true, severity: 'low', kind: 'supabase_publishable' };
            }
        }
    } catch (e) {
        // not a parseable JWT; ignore
        console.debug('[envSecretsAuditor:jwtParse]', (e as any)?.message || e);
    }
    return { match: false, severity: 'low', kind: 'supabase_service_role' };
}

export function detectSecrets(text: unknown): DetectionReport {
    const counts = emptyCounts();
    const matches: SecretMatch[] = [];
    if (typeof text !== 'string' || text.length === 0) {
        return Object.freeze({
            matches: Object.freeze([]),
            counts: Object.freeze(counts) as Readonly<Record<SecretKind, number>>,
            totalMatches: 0,
            worstSeverity: 'none' as const,
            passed: true,
        });
    }
    for (const p of PATTERNS) {
        pushMatch(matches, counts, p.kind, p.severity, text, p.regex);
    }
    PRIVATE_KEY_REGEX.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PRIVATE_KEY_REGEX.exec(text)) !== null) {
        matches.push(Object.freeze({
            kind: 'private_key_pem' as SecretKind,
            severity: 'critical' as Severity,
            index: m.index,
            length: m[0].length,
            snippet: makeSnippet(m[0], 'private_key_pem'),
        }));
        counts.private_key_pem++;
    }
    PRIVATE_KEY_REGEX.lastIndex = 0;
    AWS_SECRET_REGEX.lastIndex = 0;
    while ((m = AWS_SECRET_REGEX.exec(text)) !== null) {
        matches.push(Object.freeze({
            kind: 'aws_secret_key' as SecretKind,
            severity: 'critical' as Severity,
            index: m.index,
            length: m[0].length,
            snippet: makeSnippet(m[0], 'aws_secret_key'),
        }));
        counts.aws_secret_key++;
    }
    AWS_SECRET_REGEX.lastIndex = 0;
    PASSWORD_ASSIGN_REGEX.lastIndex = 0;
    while ((m = PASSWORD_ASSIGN_REGEX.exec(text)) !== null) {
        matches.push(Object.freeze({
            kind: 'password_assignment' as SecretKind,
            severity: 'high' as Severity,
            index: m.index,
            length: m[0].length,
            snippet: makeSnippet(m[0], 'password_assignment'),
        }));
        counts.password_assignment++;
    }
    PASSWORD_ASSIGN_REGEX.lastIndex = 0;
    SUPABASE_JWT_REGEX.lastIndex = 0;
    while ((m = SUPABASE_JWT_REGEX.exec(text)) !== null) {
        const verdict = looksLikeSupabaseJwt(m[0]);
        if (verdict.match) {
            matches.push(Object.freeze({
                kind: verdict.kind,
                severity: verdict.severity,
                index: m.index,
                length: m[0].length,
                snippet: makeSnippet(m[0], verdict.kind),
            }));
            counts[verdict.kind]++;
        }
    }
    SUPABASE_JWT_REGEX.lastIndex = 0;
    let worst: Severity | 'none' = 'none';
    for (const mm of matches) worst = worstOf(worst, mm.severity);
    return Object.freeze({
        matches: Object.freeze(matches),
        counts: Object.freeze(counts) as Readonly<Record<SecretKind, number>>,
        totalMatches: matches.length,
        worstSeverity: worst,
        passed: matches.length === 0,
    });
}

export function redactSecrets(text: unknown, placeholder: string = '[REDACTED:SECRET]'): string {
    if (typeof text !== 'string' || text.length === 0) return '';
    let out = text;
    for (const p of PATTERNS) {
        out = out.replace(p.regex, placeholder);
    }
    out = out.replace(PRIVATE_KEY_REGEX, placeholder);
    out = out.replace(AWS_SECRET_REGEX, placeholder);
    out = out.replace(PASSWORD_ASSIGN_REGEX, placeholder);
    out = out.replace(SUPABASE_JWT_REGEX, jwt => {
        const v = looksLikeSupabaseJwt(jwt);
        return v.match ? placeholder : jwt;
    });
    return out;
}

export function decideCommitGate(report: DetectionReport | null | undefined): GateVerdict {
    if (!report || typeof report !== 'object') {
        return Object.freeze({ action: 'allow' as const, reason: 'no_report' });
    }
    if (report.totalMatches === 0) {
        return Object.freeze({ action: 'allow' as const, reason: 'no_secrets_detected' });
    }
    if (report.worstSeverity === 'critical') {
        return Object.freeze({ action: 'block' as const, reason: 'critical_secret_present' });
    }
    if (report.worstSeverity === 'high') {
        return Object.freeze({ action: 'block' as const, reason: 'high_severity_secret_present' });
    }
    if (report.worstSeverity === 'medium') {
        return Object.freeze({ action: 'review' as const, reason: 'medium_severity_requires_review' });
    }
    return Object.freeze({ action: 'review' as const, reason: 'low_severity_requires_review' });
}

export function scanEnvFileAssignments(text: unknown): readonly { readonly key: string; readonly hasSecret: boolean }[] {
    if (typeof text !== 'string' || text.length === 0) return Object.freeze([]);
    const lines = text.split(/\r?\n/);
    const results: { key: string; hasSecret: boolean }[] = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
        const detection = detectSecrets(value);
        results.push({ key, hasSecret: detection.totalMatches > 0 });
    }
    return Object.freeze(results.map(r => Object.freeze(r)));
}
