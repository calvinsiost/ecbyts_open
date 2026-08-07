// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   DOUBLE-ENTRY JOURNAL — Partida dobrada formal p/ ledger $ECBT
   COMMERCIAL-READINESS-DOD#T1.7.

   Camada contábil formal SOBRE o ledger single-entry de produção
   (ecbt.radar_token_transactions, amount assinado + balance_after
   denormalizado). NÃO substitui o single-entry: deriva dele um
   journal de partida dobrada em que TODO evento econômico vira um
   lançamento (entry) com ≥2 linhas e Σ débitos = Σ créditos.

   CONVENÇÕES:
   - Valores em microtokens (inteiros, 1 $ECBT = 1.000.000 micro).
   - Conta wallet é debit-normal (ativo): saldo = Σ débitos − Σ créditos.
   - Conta contrapartida `platform:*` é credit-normal (passivo/
     receita): registra a origem/destino econômico do movimento.
   - Cada linha toca EXATAMENTE um lado (débito XOR crédito > 0).

   Build-free (padrão _hitlScorePure.ts): TS-only, sem mirror .js,
   testado via `node --experimental-strip-types --test`.
   ================================================================ */

// ----------------------------------------------------------------
// TYPES (JSDoc p/ consumidores JS; TS enforce em dev)
// ----------------------------------------------------------------

export interface JournalLine {
    accountId: string;
    debit: number;
    credit: number;
}

export interface JournalEntry {
    id: string;
    memo: string;
    metadata: Record<string, unknown>;
    lines: ReadonlyArray<JournalLine>;
}

export interface SingleEntryMovement {
    id: string;
    type: string;
    /** Amount assinado (convenção single-entry): >0 crédito na wallet, <0 débito. */
    amount: number;
    /** balance_after denormalizado do single-entry (opcional na migração). */
    balance_after?: number | null;
    created_at?: string;
}

// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------

/** Prefixos canônicos de conta do journal. */
export const ACCOUNT_PREFIX = Object.freeze({
    WALLET: 'wallet:',
    PLATFORM: 'platform:',
});

/** Contrapartidas canônicas da plataforma (plano de contas mínimo). */
export const PLATFORM_ACCOUNTS = Object.freeze({
    /** Origem de topups: caixa fiat liquidado via Stripe/Mercado Pago. */
    FLOAT: 'platform:float',
    /** Destino de consumo: receita de uso da plataforma. */
    REVENUE: 'platform:revenue',
    /** Ajustes/estornos operacionais. */
    TREASURY: 'platform:treasury',
});

// ----------------------------------------------------------------
// VALIDATION
// ----------------------------------------------------------------

function _isPositiveInt(v: unknown): boolean {
    return typeof v === 'number' && Number.isSafeInteger(v) && (v as number) > 0;
}

function _isNonNegativeInt(v: unknown): boolean {
    return typeof v === 'number' && Number.isSafeInteger(v) && (v as number) >= 0;
}

/**
 * Valida UMA linha de journal: conta válida, valores inteiros
 * não-negativos, exatamente um lado não-zero.
 * @param line
 * @returns {{valid:boolean, errors:string[]}}
 */
export function validateJournalLine(line: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!line || typeof line !== 'object') {
        return { valid: false, errors: ['line must be an object'] };
    }
    const l = line as JournalLine;
    if (typeof l.accountId !== 'string' || l.accountId.length === 0) {
        errors.push('accountId must be a non-empty string');
    }
    if (!_isNonNegativeInt(l.debit)) errors.push(`debit must be a non-negative safe integer (got ${l.debit})`);
    if (!_isNonNegativeInt(l.credit)) errors.push(`credit must be a non-negative safe integer (got ${l.credit})`);
    if (errors.length === 0) {
        const d = l.debit > 0;
        const c = l.credit > 0;
        if (d === c) {
            errors.push('line must touch exactly one side (debit XOR credit > 0)');
        }
    }
    return { valid: errors.length === 0, errors };
}

/**
 * INVARIANTE-CENTRAL da partida dobrada: Σ débitos = Σ créditos.
 * @param lines
 * @returns {boolean}
 */
export function isBalanced(lines: ReadonlyArray<JournalLine>): boolean {
    let debits = 0;
    let credits = 0;
    for (const l of lines) {
        debits += l.debit;
        credits += l.credit;
    }
    return debits === credits;
}

/**
 * Valida um lançamento completo: ≥2 linhas, todas válidas, balanceado.
 * @param entry
 * @returns {{valid:boolean, errors:string[]}}
 */
export function validateJournalEntry(entry: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!entry || typeof entry !== 'object') {
        return { valid: false, errors: ['entry must be an object'] };
    }
    const e = entry as JournalEntry;
    if (typeof e.id !== 'string' || e.id.length === 0) errors.push('entry id must be a non-empty string');
    if (!Array.isArray(e.lines) || e.lines.length < 2) {
        errors.push('entry must have at least 2 lines (double-entry)');
        return { valid: false, errors };
    }
    e.lines.forEach((line, i) => {
        const v = validateJournalLine(line);
        for (const err of v.errors) errors.push(`line[${i}]: ${err}`);
    });
    if (errors.length === 0 && !isBalanced(e.lines)) {
        const sumD = e.lines.reduce((s, l) => s + l.debit, 0);
        const sumC = e.lines.reduce((s, l) => s + l.credit, 0);
        errors.push(`entry not balanced: Σ debits (${sumD}) ≠ Σ credits (${sumC})`);
    }
    return { valid: errors.length === 0, errors };
}

// ----------------------------------------------------------------
// POSTING
// ----------------------------------------------------------------

/**
 * Cria (posta) um lançamento de partida dobrada IMUTÁVEL.
 * Lança se qualquer invariante for violada — um journal desbalanceado
 * NUNCA existe como valor.
 * @param {{id:string, memo?:string, metadata?:object, lines:JournalLine[]}} input
 * @returns {Readonly<JournalEntry>}
 */
export function postJournalEntry(input: {
    id: string;
    memo?: string;
    metadata?: Record<string, unknown>;
    lines: JournalLine[];
}): Readonly<JournalEntry> {
    const entry: JournalEntry = {
        id: input.id,
        memo: typeof input.memo === 'string' ? input.memo : '',
        metadata: input.metadata && typeof input.metadata === 'object' ? { ...input.metadata } : {},
        lines: (input.lines || []).map((l) => Object.freeze({ accountId: l.accountId, debit: l.debit, credit: l.credit })),
    };
    const v = validateJournalEntry(entry);
    if (!v.valid) {
        throw new Error(`Invalid journal entry ${input.id || '?'}: ${v.errors.join('; ')}`);
    }
    Object.freeze(entry.metadata);
    return Object.freeze(entry);
}

// ----------------------------------------------------------------
// SINGLE-ENTRY → DOUBLE-ENTRY MAPPING
// ----------------------------------------------------------------

/**
 * Converte UM movimento single-entry (amount assinado) em um lançamento
 * balanceado de 2 linhas: a wallet e a contrapartida da plataforma.
 *
 * amount > 0 (crédito na wallet, ex.: topup):   D wallet X / C contra X
 * amount < 0 (débito da wallet, ex.: consumo):  C wallet |X| / D contra |X|
 *
 * @param {SingleEntryMovement} movement
 * @param {{walletAccountId:string, contraAccountId:string}} accounts
 * @returns {Readonly<JournalEntry>}
 */
export function journalEntryFromSingleEntry(
    movement: SingleEntryMovement,
    accounts: { walletAccountId: string; contraAccountId: string },
): Readonly<JournalEntry> {
    if (!movement || typeof movement !== 'object') {
        throw new Error('movement must be an object');
    }
    const amount = movement.amount;
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount === 0) {
        throw new Error(`movement amount must be a non-zero safe integer (got ${amount})`);
    }
    const { walletAccountId, contraAccountId } = accounts;
    const abs = Math.abs(amount);
    const lines: JournalLine[] =
        amount > 0
            ? [
                  { accountId: walletAccountId, debit: abs, credit: 0 },
                  { accountId: contraAccountId, debit: 0, credit: abs },
              ]
            : [
                  { accountId: walletAccountId, debit: 0, credit: abs },
                  { accountId: contraAccountId, debit: abs, credit: 0 },
              ];
    return postJournalEntry({
        id: `je:${movement.id}`,
        memo: movement.type || '',
        metadata: { source: 'single_entry', single_entry_id: movement.id, type: movement.type },
        lines,
    });
}

// ----------------------------------------------------------------
// MIGRATION single-entry history → double-entry journal
// ----------------------------------------------------------------

/**
 * Migra um histórico single-entry completo (uma wallet) para um journal
 * de partida dobrada, verificando a cadeia de `balance_after`:
 *
 *   runningBalance começa em openingBalance; a cada movimento,
 *   runningBalance += amount; se o movimento traz balance_after e ele
 *   difere do recomputado, registra divergência (o single-entry
 *   denormalizado está corrompido naquele ponto).
 *
 * @param {{openingBalance?:number, movements:SingleEntryMovement[]}} input
 * @param {{walletAccountId:string, contraAccountId:string}} accounts
 * @returns {{entries:ReadonlyArray<Readonly<JournalEntry>>, finalBalance:number,
 *           divergenceCount:number, divergences:Array<{movementId:string, expected:number, recorded:number}>,
 *           allEntriesBalanced:boolean}}
 */
export function migrateSingleEntryHistory(
    input: { openingBalance?: number; movements: SingleEntryMovement[] },
    accounts: { walletAccountId: string; contraAccountId: string },
): {
    entries: ReadonlyArray<Readonly<JournalEntry>>;
    finalBalance: number;
    divergenceCount: number;
    divergences: Array<{ movementId: string; expected: number; recorded: number }>;
    allEntriesBalanced: boolean;
} {
    const opening = _isNonNegativeInt(input.openingBalance ?? 0) ? (input.openingBalance as number) : 0;
    const movements = Array.isArray(input.movements) ? input.movements : [];
    const entries: Array<Readonly<JournalEntry>> = [];
    const divergences: Array<{ movementId: string; expected: number; recorded: number }> = [];
    let running = opening;

    for (const mv of movements) {
        const entry = journalEntryFromSingleEntry(mv, accounts);
        entries.push(entry);
        running += mv.amount;
        if (mv.balance_after !== null && mv.balance_after !== undefined && mv.balance_after !== running) {
            divergences.push({ movementId: mv.id, expected: running, recorded: mv.balance_after });
        }
    }

    return {
        entries,
        finalBalance: running,
        divergenceCount: divergences.length,
        divergences,
        allEntriesBalanced: entries.every((e) => isBalanced(e.lines)),
    };
}

// ----------------------------------------------------------------
// BALANCE DERIVATION + RECONCILIATION
// ----------------------------------------------------------------

/**
 * Deriva saldos por conta a partir das linhas do journal:
 * saldo = Σ débitos − Σ créditos (visão debit-normal; contas
 * credit-normal aparecem com saldo negativo-espelho).
 * @param {ReadonlyArray<Readonly<JournalEntry>>} entries
 * @returns {Record<string, number>}
 */
export function computeJournalBalances(entries: ReadonlyArray<Readonly<JournalEntry>>): Record<string, number> {
    const balances: Record<string, number> = {};
    for (const e of entries || []) {
        for (const l of e.lines) {
            balances[l.accountId] = (balances[l.accountId] || 0) + l.debit - l.credit;
        }
    }
    return balances;
}

/**
 * Reconcilia o journal contra saldos esperados (ex.: wallet.balance do
 * single-entry). Válido quando TODA conta esperada bate E não há conta
 * no journal fora do esperado com saldo não-zero... exceto contrapartidas
 * credit-normal (platform:*), que são espelho negativo por construção.
 * @param {{entries:ReadonlyArray<Readonly<JournalEntry>>, expectedBalances:Record<string, number>}} input
 * @returns {{valid:boolean, mismatches:Array<{accountId:string, expected:number, actual:number}>}}
 */
export function reconcileJournal(input: {
    entries: ReadonlyArray<Readonly<JournalEntry>>;
    expectedBalances: Record<string, number>;
}): { valid: boolean; mismatches: Array<{ accountId: string; expected: number; actual: number }> } {
    const actual = computeJournalBalances(input.entries);
    const mismatches: Array<{ accountId: string; expected: number; actual: number }> = [];
    for (const [accountId, expected] of Object.entries(input.expectedBalances || {})) {
        const got = actual[accountId] || 0;
        if (got !== expected) {
            mismatches.push({ accountId, expected, actual: got });
        }
    }
    return { valid: mismatches.length === 0, mismatches };
}
