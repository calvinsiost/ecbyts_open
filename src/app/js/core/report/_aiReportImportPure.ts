// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   AI REPORT IMPORT — F2.5 pure logic for marketplace → IDB copy

   Decide caminho de import (free vs paid) e monta payload IDB-compatible
   a partir de marketplace row. Pure: zero state, zero DOM, zero rede.

   Flow:
   - Marketplace approved row → buildLocalTemplateFromMarketplace → save em IDB
   - Free (price=0) → import direto (no checkout)
   - Paid → precisa checkout completo antes do import (market-v2 royalty engine)
   ================================================================ */

import type { MarketplaceTemplateRow } from './_aiReportBrowsePure.js';

export type ImportPath = 'free' | 'paid_checkout_required' | 'invalid';

export interface LocalTemplate {
    id: string;
    name: string;
    description: string;
    systemPrompt: string;
    userPromptTemplate: string;
    requiredContext: string[];
    defaultTone: string;
    isCustom: true;
    importedFrom?: {
        marketplaceId: string;
        sourceTemplateId: string;
        authorId: string;
        license: string;
        importedAt: string;
    };
}

export interface ImportDecision {
    path: ImportPath;
    /** Reason for invalid path (validation error). */
    reason?: string;
    /** Required confirmation summary when paid. */
    requiresCheckout?: {
        priceEcbt: number;
        royaltyPct: number;
        license: string;
    };
}

/**
 * Determine import path based on row + caller authentication.
 * Pure: returns decision, caller does the action.
 */
export function decideImportPath(
    row: MarketplaceTemplateRow | null | undefined,
    isAuthenticated: boolean = true
): ImportDecision {
    if (!row || typeof row !== 'object') {
        return { path: 'invalid', reason: 'marketplace row required' };
    }
    if (row.status !== 'approved') {
        return { path: 'invalid', reason: `row status=${row.status}, only approved importable` };
    }
    if (!row.body_json || typeof row.body_json !== 'object') {
        return { path: 'invalid', reason: 'body_json missing or invalid' };
    }
    const price = Number(row.price_ecbt);
    if (!Number.isFinite(price) || price < 0) {
        return { path: 'invalid', reason: 'price_ecbt invalid' };
    }
    if (price > 0 && !isAuthenticated) {
        return { path: 'invalid', reason: 'authentication required for paid import' };
    }
    if (price === 0) {
        return { path: 'free' };
    }
    return {
        path: 'paid_checkout_required',
        requiresCheckout: {
            priceEcbt: price,
            royaltyPct: Number(row.royalty_pct) || 0,
            license: row.license || 'agpl-3.0',
        },
    };
}

/**
 * Build LocalTemplate shape from marketplace row.
 * Pure: data transform only. Caller persists via saveCustomTemplate.
 */
export function buildLocalTemplateFromMarketplace(
    row: MarketplaceTemplateRow,
    nowIso: string
): LocalTemplate {
    if (!row || !row.body_json || typeof row.body_json !== 'object') {
        throw new Error('buildLocalTemplateFromMarketplace: row.body_json required');
    }
    const body = row.body_json;
    return {
        id: `imported-${row.id}-${Date.now()}`,
        name: String(row.title || 'Imported Template').slice(0, 80),
        description: String(row.description || '').slice(0, 200),
        systemPrompt: String(body.systemPrompt || '').slice(0, 2000),
        userPromptTemplate: String(body.userPromptTemplate || '').slice(0, 2000),
        requiredContext: Array.isArray(body.requiredContext) ? body.requiredContext : [],
        defaultTone: String(body.defaultTone || 'Technical'),
        isCustom: true,
        importedFrom: {
            marketplaceId: row.id,
            sourceTemplateId: row.source_template_id,
            authorId: row.author_id,
            license: row.license,
            importedAt: nowIso,
        },
    };
}

/**
 * Royalty split calculation (preview before checkout).
 * Author gets royalty_pct, platform gets remainder.
 */
export function computeRoyaltySplit(
    priceEcbt: number,
    royaltyPct: number
): { authorEcbt: number; platformEcbt: number } {
    const price = Number(priceEcbt) || 0;
    const pct = Math.max(0, Math.min(100, Number(royaltyPct) || 0));
    const authorEcbt = Math.round((price * pct) / 100 * 100) / 100;
    const platformEcbt = Math.round((price - authorEcbt) * 100) / 100;
    return { authorEcbt, platformEcbt };
}

/**
 * Validate caller has sufficient $ECBT balance to checkout.
 * Pure check (caller fetches balance separately).
 */
export function canAffordImport(balanceEcbt: number, priceEcbt: number): boolean {
    const balance = Number(balanceEcbt);
    const price = Number(priceEcbt);
    if (!Number.isFinite(balance) || !Number.isFinite(price)) return false;
    return balance >= price;
}
