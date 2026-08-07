// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   RLS POLICY VALIDATOR (utils/helpers — cross-spec pure-logic)
   ================================================================

   Validador estático de políticas RLS Supabase. Detecta o padrão
   crítico documentado em CLAUDE.md/LESSONS.md (lesson `rls-default-
   deny`):

       CREATE POLICY "..." ON table FOR ALL USING (true);
       -- ↑ sem TO <role> explícito → vaza acesso cross-user

   O incidente 2026-04-10 (`error_reports` hotfix) foi causado por
   exatamente este bug: "Service role full access" com USING(true)
   sem TO clause deixou todo authenticated user ler/escrever todas
   as rows.

   Pure-logic: regex-based parser de migrations SQL. Drop-aware
   (DROP POLICY posterior cancela violação). Sem I/O — caller
   carrega o texto da migration.

   Cross-spec consumers (SEC-HARDENING-001 🟡 PRIORITY):
     - tests/cheap-core-logic.test.mjs (RLS static gate)
     - tests/rls-policy-static-gate.test.mjs (futuro dedicated gate)
     - pre-commit hook validation
     - sec-claude perimeter scan

   Pode ser refinado com cst-sql parser, mas regex cobre 99% dos
   padrões Supabase canônicos.
   ================================================================ */

export const SUPABASE_PRIVILEGED_ROLES: readonly string[] = Object.freeze([
    'service_role',
    'supabase_admin',
    'postgres',
]);

export const ANONYMOUS_AUTHENTICATED_ROLES: readonly string[] = Object.freeze([
    'authenticated',
    'anon',
    'public',
]);

export type PolicyCommand = 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';

export interface ParsedPolicy {
    readonly name: string;
    readonly table: string;
    readonly command: PolicyCommand;
    readonly roles: readonly string[];
    readonly using: string | null;
    readonly withCheck: string | null;
    readonly raw: string;
}

export interface ParsedDrop {
    readonly name: string;
    readonly table: string;
}

export type ViolationCode =
    | 'USING_TRUE_NO_ROLE'
    | 'WITH_CHECK_TRUE_NO_ROLE'
    | 'MISSING_TO_CLAUSE_ON_WRITE'
    | 'OVERLY_BROAD_FOR_ALL_PUBLIC';

export type Severity = 'error' | 'warning' | 'info';

export interface Violation {
    readonly code: ViolationCode;
    readonly severity: Severity;
    readonly policyName: string;
    readonly table: string;
    readonly command: PolicyCommand;
    readonly message: string;
}

const POLICY_REGEX = /CREATE\s+POLICY\s+["']?([^"'\s]+)["']?\s+ON\s+(?:public\.)?["']?([a-zA-Z0-9_]+)["']?([\s\S]*?)(?=;|$)/gi;
const DROP_REGEX = /DROP\s+POLICY(?:\s+IF\s+EXISTS)?\s+["']?([^"'\s]+)["']?\s+ON\s+(?:public\.)?["']?([a-zA-Z0-9_]+)["']?/gi;

const WRITE_COMMANDS: readonly PolicyCommand[] = Object.freeze(['ALL', 'INSERT', 'UPDATE', 'DELETE']);

function extractCommand(body: string): PolicyCommand {
    const m = body.match(/\bFOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\b/i);
    if (!m) return 'ALL';
    return m[1]!.toUpperCase() as PolicyCommand;
}

function extractRoles(body: string): string[] {
    const m = body.match(/\bTO\s+([a-zA-Z0-9_,\s]+?)(?=\s+(?:USING|WITH\s+CHECK)|$)/i);
    if (!m) return [];
    return m[1]!.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

function extractUsing(body: string): string | null {
    const m = body.match(/\bUSING\s*\(([\s\S]*?)\)(?=\s*(?:WITH\s+CHECK|$))/i);
    if (!m) return null;
    return m[1]!.trim();
}

function extractWithCheck(body: string): string | null {
    const m = body.match(/\bWITH\s+CHECK\s*\(([\s\S]*?)\)(?=\s*$)/i);
    if (!m) return null;
    return m[1]!.trim();
}

function isLiteralTrue(expr: string | null): boolean {
    if (!expr) return false;
    const cleaned = expr.replace(/\s+/g, '').toLowerCase();
    return cleaned === 'true' || cleaned === '(true)';
}

function isWriteCommand(cmd: PolicyCommand): boolean {
    return WRITE_COMMANDS.includes(cmd);
}

export function parseCreatePolicies(sqlText: string | null | undefined): ParsedPolicy[] {
    if (typeof sqlText !== 'string' || sqlText.length === 0) return [];
    const policies: ParsedPolicy[] = [];
    POLICY_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = POLICY_REGEX.exec(sqlText)) !== null) {
        const name = match[1]!.trim();
        const table = match[2]!.trim();
        const body = match[3] || '';
        const command = extractCommand(body);
        const roles = extractRoles(body);
        const using = extractUsing(body);
        const withCheck = extractWithCheck(body);
        policies.push(Object.freeze({
            name,
            table,
            command,
            roles: Object.freeze(roles),
            using,
            withCheck,
            raw: match[0],
        }));
    }
    return policies;
}

export function parseDrops(sqlText: string | null | undefined): ParsedDrop[] {
    if (typeof sqlText !== 'string' || sqlText.length === 0) return [];
    const drops: ParsedDrop[] = [];
    DROP_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = DROP_REGEX.exec(sqlText)) !== null) {
        drops.push(Object.freeze({
            name: match[1]!.trim(),
            table: match[2]!.trim(),
        }));
    }
    return drops;
}

export function validatePolicy(policy: ParsedPolicy | null | undefined): Violation[] {
    if (!policy || typeof policy !== 'object') return [];
    const violations: Violation[] = [];
    const noRolesOrPublic =
        policy.roles.length === 0 ||
        policy.roles.some(r => ANONYMOUS_AUTHENTICATED_ROLES.includes(r.toLowerCase()));
    const usingIsTrue = isLiteralTrue(policy.using);
    const withCheckIsTrue = isLiteralTrue(policy.withCheck);
    if (usingIsTrue && noRolesOrPublic && isWriteCommand(policy.command)) {
        violations.push(Object.freeze({
            code: 'USING_TRUE_NO_ROLE',
            severity: 'error' as Severity,
            policyName: policy.name,
            table: policy.table,
            command: policy.command,
            message: `Policy "${policy.name}" on ${policy.table} uses USING(true) for ${policy.command} without restricting TO <role> — leaks cross-user access`,
        }));
    }
    if (withCheckIsTrue && noRolesOrPublic && isWriteCommand(policy.command)) {
        violations.push(Object.freeze({
            code: 'WITH_CHECK_TRUE_NO_ROLE',
            severity: 'error' as Severity,
            policyName: policy.name,
            table: policy.table,
            command: policy.command,
            message: `Policy "${policy.name}" on ${policy.table} has WITH CHECK(true) for ${policy.command} without TO <role>`,
        }));
    }
    if (
        policy.command === 'ALL' &&
        policy.roles.length === 0 &&
        !usingIsTrue
    ) {
        violations.push(Object.freeze({
            code: 'MISSING_TO_CLAUSE_ON_WRITE',
            severity: 'warning' as Severity,
            policyName: policy.name,
            table: policy.table,
            command: policy.command,
            message: `Policy "${policy.name}" on ${policy.table} uses FOR ALL without explicit TO clause — defaults to PUBLIC`,
        }));
    }
    if (
        policy.command === 'ALL' &&
        policy.roles.some(r => r.toLowerCase() === 'public')
    ) {
        violations.push(Object.freeze({
            code: 'OVERLY_BROAD_FOR_ALL_PUBLIC',
            severity: 'error' as Severity,
            policyName: policy.name,
            table: policy.table,
            command: policy.command,
            message: `Policy "${policy.name}" on ${policy.table} grants FOR ALL TO PUBLIC — overly broad`,
        }));
    }
    return violations;
}

export function findViolations(sqlText: string | null | undefined): Violation[] {
    const policies = parseCreatePolicies(sqlText);
    const all: Violation[] = [];
    for (const p of policies) {
        for (const v of validatePolicy(p)) all.push(v);
    }
    return all;
}

export function decideDropAware(
    violations: readonly Violation[],
    drops: readonly ParsedDrop[]
): Violation[] {
    if (!Array.isArray(drops) || drops.length === 0) return violations.slice();
    const droppedKeys = new Set<string>();
    for (const d of drops) {
        droppedKeys.add(`${d.table}::${d.name}`);
    }
    return violations.filter(v => !droppedKeys.has(`${v.table}::${v.policyName}`));
}

export interface SummaryReport {
    readonly totalViolations: number;
    readonly errors: number;
    readonly warnings: number;
    readonly passed: boolean;
    readonly violations: readonly Violation[];
}

export function summarize(violations: readonly Violation[]): SummaryReport {
    let errors = 0;
    let warnings = 0;
    for (const v of violations) {
        if (v.severity === 'error') errors++;
        else if (v.severity === 'warning') warnings++;
    }
    return Object.freeze({
        totalViolations: violations.length,
        errors,
        warnings,
        passed: errors === 0,
        violations: Object.freeze(violations.slice()),
    });
}
