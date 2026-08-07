// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   LEDGER SCHEMA — Pure $ECBT double-entry transaction schema
   Schema puro para transacoes do livro-razao $ECBT (double-entry).

   Modulo sem efeitos colaterais: criacao, validacao, computacao
   de saldo, reconciliacao e sumarizacao de transacoes.
   ================================================================ */

/**
 * Tipos canonicos de transacao no ledger.
 * @type {Readonly<{DEBIT:string, CREDIT:string, TRANSFER:string, MINT:string, BURN:string, REWARD:string}>}
 */
export const TX_TYPES = Object.freeze({
    DEBIT: 'debit',
    CREDIT: 'credit',
    TRANSFER: 'transfer',
    MINT: 'mint',
    BURN: 'burn',
    REWARD: 'reward',
});

/**
 * Tipos canonicos de conta no ledger.
 * @type {Readonly<{USER:string, SYSTEM:string, ESCROW:string, TREASURY:string}>}
 */
export const ACCOUNT_TYPES = Object.freeze({
    USER: 'user',
    SYSTEM: 'system',
    ESCROW: 'escrow',
    TREASURY: 'treasury',
});

const VALID_TX_TYPES = new Set<string>(Object.values(TX_TYPES));

function assertValidTxType(type: string): void {
    if (!VALID_TX_TYPES.has(type)) {
        throw new Error(`Invalid transaction type: ${type}`);
    }
}

function assertValidTxAmount(amount: number): void {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        throw new Error(`Invalid amount: ${amount} (must be positive finite number)`);
    }
}

function assertTransferAccounts(type: string, fromAccount: string|null, toAccount: string|null): void {
    if (type === TX_TYPES.TRANSFER && (!fromAccount || !toAccount)) {
        throw new Error('Transfer requires both fromAccount and toAccount');
    }
}

function buildTxCore(type: string, amount: number, fromAccount: string|null, toAccount: string|null): Record<string, unknown> {
    return {
        type,
        amount,
        fromAccount: fromAccount || null,
        toAccount: toAccount || null,
        currency: 'ECBT',
    };
}

function buildLedgerTxOptions(options: Record<string, unknown>): Record<string, unknown> {
    return {
        id: typeof options.id === 'string' && options.id
            ? options.id
            : `tx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        timestamp: typeof options.timestamp === 'string' && options.timestamp
            ? options.timestamp
            : new Date().toISOString(),
        memo: typeof options.memo === 'string' ? options.memo : '',
        metadata: options.metadata && typeof options.metadata === 'object' && !Array.isArray(options.metadata)
            ? { ...(options.metadata as Record<string, unknown>) }
            : {},
        status: typeof options.status === 'string' && options.status ? options.status : 'pending',
    };
}

function mergeExtraOptions(tx: Record<string, unknown>, options: Record<string, unknown>): void {
    for (const k of Object.keys(options)) {
        if (!(k in tx)) tx[k] = options[k];
    }
}

/**
 * Cria transacao imutavel do ledger.
 * @param {string} type - Tipo (TX_TYPES.*)
 * @param {number} amount - Quantia positiva em $ECBT
 * @param {string|null} fromAccount - Conta origem (null permitido para mint/reward)
 * @param {string|null} toAccount - Conta destino (null permitido para burn)
 * @param {any} [options] - Campos adicionais (id, timestamp, memo, metadata, status)
 * @returns {Readonly<object>} Transacao congelada
 */
export function createLedgerTx(
    type: string,
    amount: number,
    fromAccount: string|null,
    toAccount: string|null,
    options: Record<string, unknown> = {},
): Readonly<object> {
    assertValidTxType(type);
    assertValidTxAmount(amount);
    assertTransferAccounts(type, fromAccount, toAccount);

    const tx: Record<string, unknown> = {
        ...buildTxCore(type, amount, fromAccount, toAccount),
        ...buildLedgerTxOptions(options),
    };
    mergeExtraOptions(tx, options);
    if (tx.metadata && typeof tx.metadata === 'object') Object.freeze(tx.metadata);
    return Object.freeze(tx);
}

function validateTxType(tx: Record<string, unknown>, errors: string[]): void {
    if (!VALID_TX_TYPES.has(tx.type as string)) {
        errors.push(`invalid type: ${tx.type}`);
    }
}

function validateTxAmount(tx: Record<string, unknown>, errors: string[]): void {
    if (typeof tx.amount !== 'number' || !Number.isFinite(tx.amount) || (tx.amount as number) <= 0) {
        errors.push('amount must be positive finite number');
    }
}

function validateTxTransfer(tx: Record<string, unknown>, errors: string[]): void {
    if (tx.type !== TX_TYPES.TRANSFER) return;
    if (!tx.fromAccount || !tx.toAccount) {
        errors.push('transfer requires fromAccount and toAccount');
    } else if (tx.fromAccount === tx.toAccount) {
        errors.push('transfer fromAccount and toAccount must differ');
    }
}

function validateTxMint(tx: Record<string, unknown>, errors: string[]): void {
    if (tx.type === TX_TYPES.MINT && tx.fromAccount !== ACCOUNT_TYPES.SYSTEM) {
        errors.push('mint must use SYSTEM as fromAccount');
    }
}

function validateTxBurn(tx: Record<string, unknown>, errors: string[]): void {
    if (tx.type === TX_TYPES.BURN && tx.toAccount !== ACCOUNT_TYPES.SYSTEM) {
        errors.push('burn must use SYSTEM as toAccount');
    }
}

/**
 * Valida transacao.
 * @param {any} tx - Transacao a validar
 * @returns {{valid:boolean, errors:string[]}}
 */
export function validateTx(tx: unknown): {valid:boolean, errors:string[]} {
    const errors: string[] = [];
    if (!tx || typeof tx !== 'object') {
        return { valid: false, errors: ['tx must be an object'] };
    }
    const txObj = tx as Record<string, unknown>;
    validateTxType(txObj, errors);
    validateTxAmount(txObj, errors);
    validateTxTransfer(txObj, errors);
    validateTxMint(txObj, errors);
    validateTxBurn(txObj, errors);
    return { valid: errors.length === 0, errors };
}

/**
 * Calcula saldo de uma conta a partir de uma lista de transacoes.
 * Convencao: credit/mint/reward/transfer-to soma; debit/burn/transfer-from subtrai.
 * @param {string} accountId
 * @param {Array<any>} transactions
 * @returns {number}
 */
export function computeAccountBalance(accountId: string, transactions: Array<any>): number {
    if (!Array.isArray(transactions)) return 0;
    let balance = 0;
    for (const tx of transactions) {
        if (!tx || typeof tx !== 'object') continue;
        const amt = Number(tx.amount) || 0;
        switch (tx.type) {
            case TX_TYPES.CREDIT:
            case TX_TYPES.REWARD:
                if (tx.toAccount === accountId) balance += amt;
                break;
            case TX_TYPES.DEBIT:
                if (tx.fromAccount === accountId) balance -= amt;
                break;
            case TX_TYPES.MINT:
                if (tx.toAccount === accountId) balance += amt;
                break;
            case TX_TYPES.BURN:
                if (tx.fromAccount === accountId) balance -= amt;
                break;
            case TX_TYPES.TRANSFER:
                if (tx.toAccount === accountId) balance += amt;
                if (tx.fromAccount === accountId) balance -= amt;
                break;
            default:
                break;
        }
    }
    return balance;
}

/**
 * Aplica transacoes em ordem cronologica retornando saldos finais.
 * Lanca se conta de usuario/escrow ficar negativa (system/treasury podem).
 * @param {Object<string, number>} initialBalances
 * @param {Array<any>} number>
 * @returns {Object<string, number>}
 */
export function applyTransactions(initialBalances: Record<string, number>, transactions: Array<any>): Record<string, number> {
    const balances = { ...(initialBalances || {}) };
    if (!Array.isArray(transactions)) return balances;

    const sorted = [...transactions].sort((a: any, b: any) => {
        const ta = new Date(a.timestamp || 0).getTime();
        const tb = new Date(b.timestamp || 0).getTime();
        return ta - tb;
    });

    const isSystemAccount = (acct: any) =>
        acct === ACCOUNT_TYPES.SYSTEM ||
        acct === ACCOUNT_TYPES.TREASURY ||
        (typeof acct === 'string' && (acct.startsWith('system') || acct.startsWith('treasury')));

    const debit = (acct: any, amt: any) => {
        if (!acct) return;
        const next = (balances[acct] || 0) - amt;
        if (next < 0 && !isSystemAccount(acct)) {
            throw new Error(`Negative balance not allowed for account ${acct}: ${next}`);
        }
        balances[acct] = next;
    };
    const credit = (acct: any, amt: any) => {
        if (!acct) return;
        balances[acct] = (balances[acct] || 0) + amt;
    };

    for (const tx of sorted) {
        const v = validateTx(tx);
        if (!v.valid) {
            throw new Error(`Invalid transaction ${tx?.id || '?'}: ${v.errors.join(', ')}`);
        }
        const amt = tx.amount;
        switch (tx.type) {
            case TX_TYPES.CREDIT:
            case TX_TYPES.REWARD:
                credit(tx.toAccount, amt);
                break;
            case TX_TYPES.DEBIT:
                debit(tx.fromAccount, amt);
                break;
            case TX_TYPES.MINT:
                credit(tx.toAccount, amt);
                break;
            case TX_TYPES.BURN:
                debit(tx.fromAccount, amt);
                break;
            case TX_TYPES.TRANSFER:
                debit(tx.fromAccount, amt);
                credit(tx.toAccount, amt);
                break;
            default:
                break;
        }
    }
    return balances;
}

/**
 * Reconcilia o ledger verificando invariante de conservacao.
 * @param {Array<any>} transactions
 * @returns {{valid:boolean, totalMinted:number, totalBurned:number, sumOfBalances:number, conservation:boolean}}
 */
export function reconcileLedger(transactions: Array<any>): {valid:boolean, totalMinted:number, totalBurned:number, sumOfBalances:number, conservation:boolean} {
    let totalMinted = 0;
    let totalBurned = 0;
    const accountSet = new Set<string>();

    if (Array.isArray(transactions)) {
        for (const tx of transactions) {
            if (!tx) continue;
            if (tx.type === TX_TYPES.MINT) totalMinted += Number(tx.amount) || 0;
            if (tx.type === TX_TYPES.BURN) totalBurned += Number(tx.amount) || 0;
            if (tx.fromAccount) accountSet.add(tx.fromAccount);
            if (tx.toAccount) accountSet.add(tx.toAccount);
        }
    }

    let sumOfBalances = 0;
    for (const acct of accountSet) {
        if (acct === ACCOUNT_TYPES.SYSTEM) continue; // exclude system sink/source
        sumOfBalances += computeAccountBalance(acct, transactions);
    }

    const conservation = totalMinted - totalBurned === sumOfBalances;
    return {
        valid: conservation,
        totalMinted,
        totalBurned,
        sumOfBalances,
        conservation,
    };
}

/**
 * Filtra transacoes envolvendo uma conta especifica.
 * @param {Array<any>} transactions
 * @param {string} accountId
 * @returns {Array<object>}
 */
export function filterTransactionsByAccount(transactions: Array<any>, accountId: string): Array<object> {
    if (!Array.isArray(transactions) || !accountId) return [];
    return transactions.filter(
        (tx: any) => tx && (tx.fromAccount === accountId || tx.toAccount === accountId),
    );
}

/**
 * Sumariza estatisticas do ledger.
 * @param {Array<any>} transactions
 * @returns {{totalCount:number, byType:Object, dateRange:{from:string|null,to:string|null}, uniqueAccounts:number}}
 */
export function summarizeLedger(transactions: Array<any>): {totalCount:number, byType:Object, dateRange:{from:string|null,to:string|null}, uniqueAccounts:number} {
        const byType: Record<string, {count:number,totalAmount:number}>= {};
    const accountSet = new Set<string>();
    let from = null;
    let to = null;
    const list = Array.isArray(transactions) ? transactions : [];

    for (const tx of list) {
        if (!tx) continue;
        const type = tx.type || 'unknown';
        if (!byType[type]) byType[type] = { count: 0, totalAmount: 0 };
        byType[type].count += 1;
        byType[type].totalAmount += Number(tx.amount) || 0;
        if (tx.fromAccount) accountSet.add(tx.fromAccount);
        if (tx.toAccount) accountSet.add(tx.toAccount);
        const ts = tx.timestamp;
        if (ts) {
            if (!from || ts < from) from = ts;
            if (!to || ts > to) to = ts;
        }
    }

    return {
        totalCount: list.length,
        byType,
        dateRange: { from, to },
        uniqueAccounts: accountSet.size,
    };
}
