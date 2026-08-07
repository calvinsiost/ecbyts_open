// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

type SupabaseClientLike = {
    from(table: string): any;
    rpc(fn: string, args?: Record<string, unknown>): any;
    schema?(schema: string): SupabaseClientLike;
};

export const WALLET_ERROR_CODES = Object.freeze({
    INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
    RATE_LIMITED: 'RATE_LIMITED',
    WALLET_EXPIRED: 'WALLET_EXPIRED',
    INVALID_INPUT: 'INVALID_INPUT',
    NOT_FOUND: 'NOT_FOUND',
} as const);

export type WalletErrorCode = (typeof WALLET_ERROR_CODES)[keyof typeof WALLET_ERROR_CODES];

export class WalletError extends Error {
    code: string;
    details?: Record<string, unknown>;

    constructor(code: WalletErrorCode | string, message: string, details?: Record<string, unknown>) {
        super(message);
        this.name = 'WalletError';
        this.code = code;
        if (details) {
            this.details = details;
        }
    }
}

let supabaseOverride: SupabaseClientLike | null = null;

export function _setSupabaseForTests(client: SupabaseClientLike | null): void {
    supabaseOverride = client;
}

async function ensureClient(): Promise<SupabaseClientLike> {
    if (supabaseOverride) return supabaseOverride;
    const mod = await import('../../utils/auth/session.js');
    const client = mod.getSupabaseClient() as SupabaseClientLike | null | undefined;
    if (!client) {
        throw new WalletError(WALLET_ERROR_CODES.NOT_FOUND, 'Supabase client nao inicializado.');
    }
    return client;
}

function parseRpcData(data: unknown): any {
    if (typeof data === 'string') {
        try {
            return JSON.parse(data);
        } catch {
            return data;
        }
    }
    return data;
}

function apiSchemaClient(client: SupabaseClientLike): SupabaseClientLike {
    return typeof client.schema === 'function' ? client.schema('api') : client;
}

function walletErrorFromRpc(error: any, fallbackMessage: string): WalletError {
    const message = String(error?.message || error || fallbackMessage);
    const lower = message.toLowerCase();
    if (lower.includes('insufficient_balance')) {
        return new WalletError(WALLET_ERROR_CODES.INSUFFICIENT_BALANCE, message, { supabaseError: error });
    }
    if (lower.includes('rate_limited')) {
        return new WalletError(WALLET_ERROR_CODES.RATE_LIMITED, message, { supabaseError: error });
    }
    if (lower.includes('wallet_expired')) {
        return new WalletError(WALLET_ERROR_CODES.WALLET_EXPIRED, message, { supabaseError: error });
    }
    if (lower.includes('not_found') || lower.includes('forbidden')) {
        return new WalletError(WALLET_ERROR_CODES.NOT_FOUND, message, { supabaseError: error });
    }
    return new WalletError(WALLET_ERROR_CODES.INVALID_INPUT, message, { supabaseError: error });
}

function isNonNegativeInt(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && Math.floor(value) === value;
}

function isPositiveInt(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 && Math.floor(value) === value;
}

export interface RateLimitWallet {
    rateLimitPerSecond: number;
    bucketTokens?: number;
    bucketLastRefillMs?: number;
}

export interface RateLimitResult {
    allowed: boolean;
    tokensAfter: number;
    lastRefill: number;
    retryAfter?: number;
}

export function checkRateLimit(
    wallet: RateLimitWallet | null | undefined,
    cost: number,
    nowMs: number,
): Readonly<RateLimitResult> {
    if (!wallet || typeof wallet !== 'object') {
        throw new WalletError(WALLET_ERROR_CODES.INVALID_INPUT, 'wallet invalido.');
    }
    if (!isPositiveInt(wallet.rateLimitPerSecond)) {
        throw new WalletError(WALLET_ERROR_CODES.INVALID_INPUT, 'rateLimitPerSecond deve ser inteiro positivo.');
    }
    if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0) {
        throw new WalletError(WALLET_ERROR_CODES.INVALID_INPUT, 'cost deve ser numero nao-negativo.');
    }
    if (typeof nowMs !== 'number' || !Number.isFinite(nowMs) || nowMs < 0) {
        throw new WalletError(WALLET_ERROR_CODES.INVALID_INPUT, 'nowMs deve ser timestamp em ms >= 0.');
    }

    const capacity = wallet.rateLimitPerSecond;
    const ratePerSecond = wallet.rateLimitPerSecond;
    const prevTokens =
        typeof wallet.bucketTokens === 'number' && Number.isFinite(wallet.bucketTokens) ? wallet.bucketTokens : capacity;
    const lastRefillMs =
        typeof wallet.bucketLastRefillMs === 'number' && Number.isFinite(wallet.bucketLastRefillMs)
            ? wallet.bucketLastRefillMs
            : nowMs;

    const elapsedSeconds = Math.max(0, (nowMs - lastRefillMs) / 1000);
    const refilled = Math.min(capacity, prevTokens + elapsedSeconds * ratePerSecond);

    if (cost === 0) {
        return Object.freeze({
            allowed: true,
            tokensAfter: refilled,
            lastRefill: nowMs,
        });
    }

    if (refilled >= cost) {
        return Object.freeze({
            allowed: true,
            tokensAfter: refilled - cost,
            lastRefill: nowMs,
        });
    }

    const deficit = cost - refilled;
    const retryAfter = deficit / ratePerSecond;
    return Object.freeze({
        allowed: false,
        tokensAfter: refilled,
        lastRefill: nowMs,
        retryAfter,
    });
}

export interface ExpiringWallet {
    expiresAt?: number | null;
}

export function isExpired(wallet: ExpiringWallet | null | undefined, nowMs: number): boolean {
    if (!wallet) return false;
    const exp = wallet.expiresAt;
    if (exp === null || exp === undefined) return false;
    if (!Number.isFinite(exp)) return false;
    return nowMs > exp;
}

export interface BalanceWallet {
    balance?: number;
}

export function getRemainingCap(wallet: BalanceWallet | null | undefined): number {
    if (!wallet) return 0;
    return typeof wallet.balance === 'number' && Number.isFinite(wallet.balance) ? wallet.balance : 0;
}

export interface CreateWalletInput {
    grantId: string;
    contractedTotal: number;
    ratePerSecond: number;
    maxPerRequest: number;
    expiresAt?: string | number | null;
}

export interface FrozenWallet extends RateLimitWallet, ExpiringWallet, BalanceWallet {
    id: string;
    grantId: string;
    balance: number;
    contractedTotal: number;
    consumedTotal: number;
    rateLimitPerSecond: number;
    maxTokensPerRequest: number;
    expiresAt: number | null;
    bucketTokens: number;
    bucketLastRefillMs: number;
    createdAt: number;
}

export async function createWallet(input: CreateWalletInput): Promise<Readonly<FrozenWallet>> {
    if (!input || typeof input !== 'object') {
        throw new WalletError(WALLET_ERROR_CODES.INVALID_INPUT, 'input invalido.');
    }
    const { grantId, contractedTotal, ratePerSecond, maxPerRequest, expiresAt } = input;

    if (!grantId || typeof grantId !== 'string') {
        throw new WalletError(WALLET_ERROR_CODES.INVALID_INPUT, 'grantId obrigatorio (string).');
    }
    if (!isNonNegativeInt(contractedTotal)) {
        throw new WalletError(WALLET_ERROR_CODES.INVALID_INPUT, 'contractedTotal deve ser inteiro >= 0.');
    }
    if (!isPositiveInt(ratePerSecond)) {
        throw new WalletError(WALLET_ERROR_CODES.INVALID_INPUT, 'ratePerSecond deve ser inteiro > 0.');
    }
    if (!isPositiveInt(maxPerRequest)) {
        throw new WalletError(WALLET_ERROR_CODES.INVALID_INPUT, 'maxPerRequest deve ser inteiro > 0.');
    }

    const client = await ensureClient();
    const nowMs = Date.now();
    const expiresAtIso =
        expiresAt === null || expiresAt === undefined
            ? null
            : typeof expiresAt === 'string'
              ? expiresAt
              : new Date(expiresAt).toISOString();

    const { data, error } = await client.rpc('radar_token_create_wallet', {
        p_grant_id: grantId,
        p_contracted_total: contractedTotal,
        p_rate_limit_per_second: ratePerSecond,
        p_max_tokens_per_request: maxPerRequest,
        p_expires_at: expiresAtIso,
    });

    if (error) {
        throw walletErrorFromRpc(error, 'Falha ao criar wallet.');
    }

    const result = parseRpcData(data);
    return freezeWallet(result?.wallet || result, nowMs);
}

export async function creditWallet(
    walletId: string,
    amount: number,
    paymentIntentId?: string,
): Promise<{ balance: number; transactionId: string }> {
    if (!walletId || typeof walletId !== 'string') {
        throw new WalletError(WALLET_ERROR_CODES.INVALID_INPUT, 'walletId obrigatorio (string).');
    }
    if (!isPositiveInt(amount)) {
        throw new WalletError(WALLET_ERROR_CODES.INVALID_INPUT, 'amount deve ser inteiro > 0.');
    }

    const client = await ensureClient();

    const { data, error } = await client.rpc('radar_token_credit_wallet', {
        p_wallet_id: walletId,
        p_amount: amount,
        p_payment_intent_id: paymentIntentId || null,
    });

    if (error) {
        throw walletErrorFromRpc(error, 'Falha ao creditar wallet.');
    }

    const result = parseRpcData(data) || {};
    return { balance: Number(result.balance || 0), transactionId: String(result.transactionId || result.transaction_id) };
}

export async function debitWallet(
    walletId: string,
    amount: number,
    endpoint: string,
    metadata?: Record<string, unknown>,
): Promise<{ balance: number; allowed: true; transactionId: string }> {
    if (!walletId || typeof walletId !== 'string') {
        throw new WalletError(WALLET_ERROR_CODES.INVALID_INPUT, 'walletId obrigatorio (string).');
    }
    if (!isPositiveInt(amount)) {
        throw new WalletError(WALLET_ERROR_CODES.INVALID_INPUT, 'amount deve ser inteiro > 0.');
    }
    if (!endpoint || typeof endpoint !== 'string') {
        throw new WalletError(WALLET_ERROR_CODES.INVALID_INPUT, 'endpoint obrigatorio (string).');
    }

    const client = apiSchemaClient(await ensureClient());
    const { data, error } = await client.rpc('radar_token_debit_wallet', {
        p_wallet_id: walletId,
        p_amount: amount,
        p_endpoint: endpoint,
        p_metadata: metadata || {},
    });

    if (error) {
        throw walletErrorFromRpc(error, 'Falha ao debitar wallet.');
    }

    const result = parseRpcData(data) || {};
    return {
        balance: Number(result.balance || 0),
        allowed: true,
        transactionId: String(result.transactionId || result.transaction_id),
    };
}

function freezeWallet(row: Record<string, unknown>, nowMs: number): Readonly<FrozenWallet> {
    const expiresAt = row.expires_at ? Date.parse(String(row.expires_at)) : null;
    const lastRefill = row.bucket_last_refill ? Date.parse(String(row.bucket_last_refill)) : nowMs;
    const createdAt = row.created_at ? Date.parse(String(row.created_at)) : nowMs;

    return Object.freeze({
        id: String(row.id || ''),
        grantId: String(row.grant_id || ''),
        balance: Number(row.balance || 0),
        contractedTotal: Number(row.contracted_total || 0),
        consumedTotal: Number(row.consumed_total || 0),
        rateLimitPerSecond: Number(row.rate_limit_per_second || 1),
        maxTokensPerRequest: Number(row.max_tokens_per_request || 1),
        expiresAt: expiresAt !== null && Number.isFinite(expiresAt) ? expiresAt : null,
        bucketTokens: Number(row.bucket_tokens || 0),
        bucketLastRefillMs: Number.isFinite(lastRefill) ? lastRefill : nowMs,
        createdAt: Number.isFinite(createdAt) ? createdAt : nowMs,
    });
}
