// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// utils/handlers/ledgerSummaryHandler.js
// @ts-check
// Wire-up of P1-93 ledger schema (commit 7a756fbb) into UI.
// window.handleShowLedgerSummary() displays a demo $ECBT ledger summary via toast.

import {
    createLedgerTx,
    summarizeLedger,
    computeAccountBalance,
    reconcileLedger,
} from '../../core/currency/ledgerSchema.js';
import { showToast } from '../ui/toast.js';

function buildDemoTransactions() {
    return [
        createLedgerTx('mint', 1000, 'system', 'user_demo', { memo: 'Welcome bonus' }),
        createLedgerTx('reward', 50, 'system', 'user_demo', { memo: 'Daily login' }),
        createLedgerTx('transfer', 100, 'user_demo', 'library_vendor_a', { memo: 'Library purchase' }),
        createLedgerTx('transfer', 25, 'user_demo', 'consulting_pool', { memo: 'Expert hour' }),
    ];
}

export function handleShowLedgerSummary() {
    const txs = buildDemoTransactions();
    const summary = summarizeLedger(txs);
    const balance = computeAccountBalance('user_demo', txs);
    const reconcile = reconcileLedger(txs);
    const lines = [
        `Demo ledger — user_demo balance: $ECBT ${balance}`,
        `Transactions: ${summary.totalCount} | Accounts: ${summary.uniqueAccounts}`,
        `Conservation: ${reconcile.conservation ? 'OK' : 'BROKEN'}`,
    ];
    showToast(lines.join(' • '), 'info', 6000);
}

export const ledgerSummaryHandlers = { handleShowLedgerSummary };
