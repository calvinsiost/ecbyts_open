// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Authorship: Calvin Stefan Iost
/* ================================================================
   LIBRARIES EIC + SCOPE PURE — Environmental Integrity Credit domain
   Lógica pura extraída de libraries.ts (ARCH-MONOLITH-ATOMIZATION-001):
   agregação de portfólio EIC, rótulos de classe/verificação/validade,
   classificação Bronze, e (de)serialização de chaves de escopo.

   Sem DOM, sem state mutável, sem efeitos colaterais. Todas as funções
   recebem dados e retornam dados/strings determinísticos.
   ================================================================ */

export interface EicPortfolioSummary {
    held: number;
    listed: number;
    retired: number;
}

export interface CreditScope {
    type?: string;
    nodeId?: string | null;
    cnpj?: string | null;
    elementId?: string | null;
}

export interface ParsedScope {
    type: string;
    nodeId?: string | null;
    cnpj?: string | null;
    elementId?: string | null;
}

/**
 * Agrega quantidades de créditos EIC por status (held/listed/retired),
 * arredondando a 2 casas decimais.
 */
export function summarizeEicPortfolio(items: any[]): EicPortfolioSummary {
    const acc = { held: 0, listed: 0, retired: 0 };
    for (const item of items || []) {
        const amount = Number(item?.amount || 0);
        if (item?.status === 'listed') acc.listed += amount;
        else if (item?.status === 'retired') acc.retired += amount;
        else acc.held += amount;
    }
    return {
        held: Math.round(acc.held * 100) / 100,
        listed: Math.round(acc.listed * 100) / 100,
        retired: Math.round(acc.retired * 100) / 100,
    };
}

/** Rótulo do método de verificação do crédito (Auditor vs Automático). */
export function eicVerificationLabel(item: any): string {
    const method = String(item?.verification_method || item?.verificationMethod || '').toLowerCase();
    return method === 'auditor' ? 'Auditor' : 'Automatico';
}

/**
 * Formata uma data ISO/Date para pt-BR. Self-contained (não depende de
 * Intl locale availability) para manter o módulo determinístico em testes.
 */
export function formatScopeShortDate(value: any): string {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

/**
 * Rótulo de validade do crédito (data de expiração formatada, ou '-').
 * Aceita um formatador injetável; default = formatScopeShortDate (puro).
 */
export function eicValidityLabel(item: any, formatDate: (v: any) => string = formatScopeShortDate): string {
    const expiresAt = item?.expires_at || item?.expiresAt;
    return expiresAt ? formatDate(expiresAt) : '-';
}

/** True quando o crédito é de classe Bronze (uso interno, não listável). */
export function isBronzeCredit(item: any): boolean {
    const q = String(item?.quality_class || item?.qualityClass || '').toLowerCase();
    return q === 'eic-bronze';
}

/** Texto explicativo do significado da classe de qualidade EIC. */
export function eicClassMeaning(qualityClass: any): string {
    const q = String(qualityClass || '').toLowerCase();
    if (q === 'eic-gold') return 'Gold: listavel pleno (auditor + contrato completo).';
    if (q === 'eic-silver') return 'Silver: listavel com sinalizacao de risco (sem auditor).';
    return 'Bronze: uso interno, nao listavel externamente.';
}

/** Serializa um escopo de crédito em chave canônica "type:node:cnpj:element". */
export function scopeKey(scope: CreditScope = {}): string {
    const type = String(scope?.type || 'model');
    const node = String(scope?.nodeId || '');
    const cnpj = String(scope?.cnpj || '');
    const element = String(scope?.elementId || '');
    return `${type}:${node}:${cnpj}:${element}`;
}

/** Rótulo legível de um escopo de crédito. */
export function scopeLabel(scope: CreditScope = {}): string {
    const type = String(scope?.type || 'model');
    if (type === 'cnpj') return `CNPJ ${scope?.cnpj || '-'} (${scope?.nodeId || 'scope'})`;
    if (type === 'area') return `Area ${scope?.elementId || '-'}`;
    return 'Modelo inteiro';
}

/** Desserializa uma chave de escopo de volta para objeto estruturado. */
export function parseScopeKey(key: any): ParsedScope {
    const [type = 'model', nodeId = '', cnpj = '', elementId = ''] = String(key || '').split(':');
    if (type === 'cnpj') return { type, nodeId: nodeId || null, cnpj: cnpj || null };
    if (type === 'area') return { type, elementId: elementId || null };
    return { type: 'model' };
}
