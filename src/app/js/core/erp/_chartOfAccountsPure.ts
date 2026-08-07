// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Chart of accounts — pure logic (ERP-DRE-001 §4.1, M1).
 *
 * Defines the {@link Account} type with the THREE dimensions the spec (§1.4)
 * needs to project a single ledger into three reporting standards (BR-DRE,
 * IFRS-IAS1, US-GAAP-ASC220) — and to be ready for IFRS 18 (2027) without
 * rework:
 *
 *   1. `rootType`     — ativo | passivo | patrimonio | receita | despesa
 *   2. `function`     — cost_of_sales | selling | admin | other  (by-function P&L)
 *   3. `nature`       — personnel | depreciation | materials | services | other
 *   4. `ifrsCategory` — operating | investing | financing      (IFRS 18 categories)
 *
 * Group accounts (`isGroup=true`) aggregate; only leaf accounts
 * (`isGroup=false`) may receive postings (RF-1). Pure — no DOM, no I/O.
 */

/** Root classification of an account (CPC 26 / Lei 6.404/76). */
export type RootType = 'ativo' | 'passivo' | 'patrimonio' | 'receita' | 'despesa';

/** P&L function dimension (IFRS/US GAAP "by function" presentation). */
export type AccountFunction = 'cost_of_sales' | 'selling' | 'admin' | 'other';

/** Expense nature dimension (IAS 1 §104 note / ASU 2024-03 disaggregation). */
export type AccountNature =
    | 'personnel'
    | 'depreciation'
    | 'materials'
    | 'services'
    | 'other';

/** IFRS 18 (2027) category for operating/investing/financing subtotals. */
export type IfrsCategory = 'operating' | 'investing' | 'financing';

export interface Account {
    /** Stable unique identifier. */
    readonly id: string;
    /** Human-readable name. */
    readonly name: string;
    /** Root classification. */
    readonly rootType: RootType;
    /** true = Group (aggregates); false = leaf/ledger (receives postings). */
    readonly isGroup: boolean;
    /** Parent account id (null/undefined for root accounts). */
    readonly parentId?: string | null;
    /** P&L function dimension (optional). */
    readonly function?: AccountFunction;
    /** Expense/revenue nature dimension (optional). */
    readonly nature?: AccountNature;
    /** IFRS 18 category dimension (optional). */
    readonly ifrsCategory?: IfrsCategory;
}

const ROOT_TYPES: ReadonlySet<RootType> = new Set([
    'ativo',
    'passivo',
    'patrimonio',
    'receita',
    'despesa',
]);

/**
 * Build a frozen {@link Account} from a partial draft, validating the root type.
 *
 * @param draft - Account fields; `id`, `name` and `rootType` are required.
 * @returns A frozen, immutable account.
 * @throws {RangeError} if `rootType` is not one of the five valid roots.
 * @throws {TypeError} if `id` or `name` is missing/empty.
 */
export function createAccount(draft: {
    id: string;
    name: string;
    rootType: RootType;
    isGroup?: boolean;
    parentId?: string | null;
    function?: AccountFunction;
    nature?: AccountNature;
    ifrsCategory?: IfrsCategory;
}): Account {
    if (!draft || typeof draft !== 'object') {
        throw new TypeError('createAccount: draft is required');
    }
    if (typeof draft.id !== 'string' || draft.id.length === 0) {
        throw new TypeError('createAccount: id is required');
    }
    if (typeof draft.name !== 'string' || draft.name.length === 0) {
        throw new TypeError('createAccount: name is required');
    }
    if (!ROOT_TYPES.has(draft.rootType)) {
        throw new RangeError(`createAccount: invalid rootType "${draft.rootType}"`);
    }
    const account: Account = {
        id: draft.id,
        name: draft.name,
        rootType: draft.rootType,
        isGroup: draft.isGroup === true,
        parentId: draft.parentId ?? null,
        ...(draft.function ? { function: draft.function } : {}),
        ...(draft.nature ? { nature: draft.nature } : {}),
        ...(draft.ifrsCategory ? { ifrsCategory: draft.ifrsCategory } : {}),
    };
    return Object.freeze(account);
}

/**
 * Whether an account is a leaf (ledger) account that may receive postings.
 *
 * @param account - The account to test.
 * @returns true iff `isGroup === false`.
 */
export function isLeaf(account: Account): boolean {
    return !!account && account.isGroup === false;
}

export interface ChartValidationResult {
    readonly valid: boolean;
    readonly errors: readonly string[];
}

/**
 * Validate a chart of accounts: ids unique, parents exist, no cycles, and every
 * referenced parent is a Group (only leaves are postable — RF-1).
 *
 * @param accounts - The full list of accounts.
 * @returns A frozen result with `valid` and a list of human-readable `errors`.
 */
export function validateChart(accounts: readonly Account[]): ChartValidationResult {
    const errors: string[] = [];
    const byId = new Map<string, Account>();
    for (const acc of accounts) {
        if (byId.has(acc.id)) {
            errors.push(`Duplicate account id "${acc.id}"`);
        }
        byId.set(acc.id, acc);
    }
    for (const acc of accounts) {
        if (acc.parentId == null) continue;
        const parent = byId.get(acc.parentId);
        if (!parent) {
            errors.push(`Account "${acc.id}" references missing parent "${acc.parentId}"`);
            continue;
        }
        if (!parent.isGroup) {
            errors.push(
                `Account "${acc.id}" has a leaf account "${acc.parentId}" as parent (parents must be Group)`,
            );
        }
        if (parent.rootType !== acc.rootType) {
            errors.push(
                `Account "${acc.id}" (${acc.rootType}) differs in rootType from parent "${acc.parentId}" (${parent.rootType})`,
            );
        }
    }
    // Cycle detection (parent chain).
    for (const acc of accounts) {
        const seen = new Set<string>();
        let cursor: Account | undefined = acc;
        while (cursor && cursor.parentId != null) {
            if (seen.has(cursor.id)) {
                errors.push(`Cycle detected in parent chain at account "${acc.id}"`);
                break;
            }
            seen.add(cursor.id);
            cursor = byId.get(cursor.parentId);
        }
    }
    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

/**
 * Assert that a posting target account exists and is a leaf (postable).
 *
 * @param accountId - The account id referenced by a posting.
 * @param accounts - The chart of accounts (or a Map indexed by id).
 * @returns The resolved leaf account.
 * @throws {Error} ERR_DRE_LEAF_ONLY if the account is a Group or missing.
 */
export function assertPostable(
    accountId: string,
    accounts: readonly Account[] | ReadonlyMap<string, Account>,
): Account {
    const account =
        accounts instanceof Map
            ? accounts.get(accountId)
            : (accounts as readonly Account[]).find((a) => a.id === accountId);
    if (!account) {
        throw new Error(`ERR_DRE_LEAF_ONLY: account "${accountId}" not found`);
    }
    if (account.isGroup) {
        throw new Error(`ERR_DRE_LEAF_ONLY: account "${accountId}" is a Group; only leaf accounts accept postings`);
    }
    return account;
}

/**
 * A minimal but representative Brazilian chart of accounts (RF-11), covering all
 * five roots plus the function/nature/ifrsCategory dimensions used by the
 * income-statement engine. Returned frozen.
 *
 * @returns A frozen array of accounts (Groups + leaves).
 */
export function defaultChartBR(): readonly Account[] {
    const list: Account[] = [
        // ---- Ativo ----
        createAccount({ id: 'A', name: 'Ativo', rootType: 'ativo', isGroup: true }),
        createAccount({ id: 'A.1', name: 'Caixa e Equivalentes', rootType: 'ativo', parentId: 'A', ifrsCategory: 'operating' }),
        createAccount({ id: 'A.2', name: 'Clientes a Receber', rootType: 'ativo', parentId: 'A', ifrsCategory: 'operating' }),
        createAccount({ id: 'A.3', name: 'Imobilizado', rootType: 'ativo', parentId: 'A', ifrsCategory: 'investing' }),
        // ---- Passivo ----
        createAccount({ id: 'P', name: 'Passivo', rootType: 'passivo', isGroup: true }),
        createAccount({ id: 'P.1', name: 'Fornecedores', rootType: 'passivo', parentId: 'P', ifrsCategory: 'operating' }),
        createAccount({ id: 'P.2', name: 'Empréstimos', rootType: 'passivo', parentId: 'P', ifrsCategory: 'financing' }),
        createAccount({ id: 'P.3', name: 'Tributos a Recolher', rootType: 'passivo', parentId: 'P', ifrsCategory: 'operating' }),
        // ---- Patrimônio ----
        createAccount({ id: 'PL', name: 'Patrimônio Líquido', rootType: 'patrimonio', isGroup: true }),
        createAccount({ id: 'PL.1', name: 'Capital Social', rootType: 'patrimonio', parentId: 'PL' }),
        // ---- Receita ----
        createAccount({ id: 'R', name: 'Receita', rootType: 'receita', isGroup: true }),
        createAccount({ id: 'R.1', name: 'Receita de Vendas/Serviços', rootType: 'receita', parentId: 'R', ifrsCategory: 'operating' }),
        createAccount({ id: 'R.9', name: 'Receitas Financeiras', rootType: 'receita', parentId: 'R', ifrsCategory: 'financing' }),
        // ---- Despesa ----
        createAccount({ id: 'D', name: 'Despesa', rootType: 'despesa', isGroup: true }),
        createAccount({ id: 'D.0', name: 'Deduções de Receita (ICMS/ISS/PIS/COFINS)', rootType: 'despesa', parentId: 'D', function: 'other', nature: 'other', ifrsCategory: 'operating' }),
        createAccount({ id: 'D.1', name: 'CMV/CPV/CSV', rootType: 'despesa', parentId: 'D', function: 'cost_of_sales', nature: 'materials', ifrsCategory: 'operating' }),
        createAccount({ id: 'D.2', name: 'Despesas com Vendas', rootType: 'despesa', parentId: 'D', function: 'selling', nature: 'services', ifrsCategory: 'operating' }),
        createAccount({ id: 'D.3', name: 'Despesas Administrativas', rootType: 'despesa', parentId: 'D', function: 'admin', nature: 'personnel', ifrsCategory: 'operating' }),
        createAccount({ id: 'D.4', name: 'Depreciação e Amortização', rootType: 'despesa', parentId: 'D', function: 'admin', nature: 'depreciation', ifrsCategory: 'operating' }),
        createAccount({ id: 'D.8', name: 'Despesas Financeiras', rootType: 'despesa', parentId: 'D', function: 'other', nature: 'other', ifrsCategory: 'financing' }),
        createAccount({ id: 'D.9', name: 'IR e CSLL', rootType: 'despesa', parentId: 'D', function: 'other', nature: 'other', ifrsCategory: 'operating' }),
    ];
    return Object.freeze(list);
}

/**
 * Compute the effective chart of accounts (RF-11): the {@link defaultChartBR}
 * with the user's custom accounts overlaid. A custom account with the same id as
 * a default one overrides it; new ids are appended. The result preserves the
 * default ordering, then trailing new customs.
 *
 * @param custom - User-added/overridden accounts (may be empty).
 * @returns A frozen merged chart.
 */
export function effectiveChart(custom: readonly Account[] = []): readonly Account[] {
    if (!custom || custom.length === 0) return defaultChartBR();
    const overrides = new Map(custom.map((a) => [a.id, a]));
    const merged: Account[] = [];
    const seen = new Set<string>();
    for (const base of defaultChartBR()) {
        merged.push(overrides.get(base.id) ?? base);
        seen.add(base.id);
    }
    for (const acc of custom) {
        if (!seen.has(acc.id)) {
            merged.push(acc);
            seen.add(acc.id);
        }
    }
    return Object.freeze(merged);
}

/**
 * Append a custom account to an existing chart (RF-11), immutably. Validates the
 * draft via {@link createAccount} and then re-validates the whole chart so the
 * new account does not break referential integrity (unknown parent, leaf parent,
 * rootType mismatch, duplicate id).
 *
 * @param chart - The current chart of accounts.
 * @param draft - The account to add (same shape as {@link createAccount}).
 * @returns A frozen `{ chart, error }`: the new chart on success (error null), or
 *   the original chart + an error message on failure.
 */
export function addAccountToChart(
    chart: readonly Account[],
    draft: Parameters<typeof createAccount>[0],
): { readonly chart: readonly Account[]; readonly error: string | null } {
    let account: Account;
    try {
        account = createAccount(draft);
    } catch (e) {
        return Object.freeze({ chart: Object.freeze([...chart]), error: (e as Error).message });
    }
    const next = [...chart, account];
    const validation = validateChart(next);
    if (!validation.valid) {
        return Object.freeze({ chart: Object.freeze([...chart]), error: validation.errors[0] ?? 'ERR_CHART_INVALID' });
    }
    return Object.freeze({ chart: Object.freeze(next), error: null });
}

/**
 * Remove an account from a chart by id (RF-11), immutably. Refuses to remove an
 * account that still has children (would orphan them) and refuses an unknown id.
 *
 * @param chart - The current chart of accounts.
 * @param id - The id of the account to remove.
 * @returns A frozen `{ chart, error }` (see {@link addAccountToChart}).
 */
export function removeAccountFromChart(
    chart: readonly Account[],
    id: string,
): { readonly chart: readonly Account[]; readonly error: string | null } {
    if (!chart.some((a) => a.id === id)) {
        return Object.freeze({ chart: Object.freeze([...chart]), error: `ERR_CHART_NOT_FOUND: "${id}"` });
    }
    if (chart.some((a) => a.parentId === id)) {
        return Object.freeze({ chart: Object.freeze([...chart]), error: `ERR_CHART_HAS_CHILDREN: "${id}"` });
    }
    return Object.freeze({ chart: Object.freeze(chart.filter((a) => a.id !== id)), error: null });
}
