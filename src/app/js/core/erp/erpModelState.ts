// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ERP/DRE model state — persistable singleton (Calvin 2026-06-21: "guardar na
 * chave .ecbt sempre").
 *
 * Os lançamentos contábeis (receita/tributos/financeiro/depreciação) que o
 * RANDOM gera para fechar a DRE completa (ERP-DRE-001) eram publicados só em
 * `window.__ecbtRandomDreEntries` — VOLÁTIL: perdiam-se ao salvar/recarregar a
 * chave. Este store guarda-os em memória do app (módulo-singleton, padrão dos
 * demais estados — cf. `aerialClassifierState`) para que viajem DENTRO da
 * chave .ecbt e sejam restaurados ao abrir.
 *
 * - O random (phase-governance) grava aqui via {@link setErpEntries}.
 * - O Score (ecbtScorePanel) lê aqui via {@link getErpEntries}.
 * - O export (io/export) serializa via {@link exportErpFinancial}.
 * - O import (io/import) restaura via {@link importErpFinancial}.
 *
 * As funções {@link exportErpFinancial}/{@link importErpFinancial} são puras o
 * suficiente para teste de round-trip: leem/gravam o store e fazem só cópia
 * defensiva — sem DOM, sem I/O.
 */

import type { JournalEntry } from './_journalPure.js';
import {
    emptyRegistries,
    sanitizeRegistries,
    type ErpRegistries,
} from './_erpRegistriesPure.js';
import { createAccount, type Account } from './_chartOfAccountsPure.js';

/**
 * Versão do schema do payload `model.financial` (forward-compat).
 * v1 → só `erpEntries`. v2 → `+registries` (RF-4). v3 → `+customAccounts`
 * (plano de contas editável — RF-11).
 */
export const ERP_FINANCIAL_SCHEMA_VERSION = 3;

/** Formato serializado guardado em `model.financial` dentro da chave .ecbt. */
export interface ErpFinancialPayload {
    /** Versão do schema (para migrações futuras). */
    readonly schemaVersion: number;
    /** Lançamentos contábeis da DRE gerados/persistidos. */
    readonly erpEntries: JournalEntry[];
    /** Cadastros mínimos (parceiros/produtos/centros de custo — RF-4). */
    readonly registries: ErpRegistries;
    /** Contas adicionadas pelo usuário ao plano de contas (RF-11). */
    readonly customAccounts: Account[];
}

/** Estado do módulo: lançamentos do ERP/DRE (vazio até o random gerar/importar). */
let erpEntries: JournalEntry[] = [];

/** Estado do módulo: cadastros do ERP (vazios até o usuário cadastrar/importar). */
let erpRegistries: ErpRegistries = emptyRegistries();

/** Estado do módulo: contas customizadas do plano (vazias até editar/importar — RF-11). */
let erpCustomAccounts: Account[] = [];

/** Saneia um payload de contas customizadas, descartando linhas malformadas. */
function sanitizeCustomAccounts(raw: unknown): Account[] {
    if (!Array.isArray(raw)) return [];
    const out: Account[] = [];
    for (const row of raw) {
        try {
            out.push(
                createAccount(row as Parameters<typeof createAccount>[0]),
            );
        } catch (e) {
            console.debug('[erp/modelState] malformed account skipped', (e as Error)?.message || e);
        }
    }
    return out;
}

/**
 * Retorna os lançamentos do ERP/DRE atualmente em memória.
 * Devolve a referência viva (callers não devem mutar in-place).
 *
 * @returns Os lançamentos persistíveis (array vazio se nada gerado/importado).
 */
export function getErpEntries(): JournalEntry[] {
    return erpEntries;
}

/**
 * Grava os lançamentos do ERP/DRE no store.
 * Faz cópia defensiva do array (mas preserva os entries congelados).
 *
 * @param entries - Lançamentos a guardar (não-array vira lista vazia).
 */
export function setErpEntries(entries: readonly JournalEntry[] | null | undefined): void {
    erpEntries = Array.isArray(entries) ? [...entries] : [];
}

/**
 * Limpa os lançamentos do ERP/DRE (ex.: ao iniciar import de modelo novo).
 * NÃO toca nos cadastros — use {@link clearErpRegistries} para isso.
 */
export function clearErpEntries(): void {
    erpEntries = [];
}

/**
 * Retorna os cadastros (parceiros/produtos/centros de custo) em memória (RF-4).
 *
 * @returns Os cadastros persistíveis (todos vazios até cadastrar/importar).
 */
export function getErpRegistries(): ErpRegistries {
    return erpRegistries;
}

/**
 * Grava os cadastros do ERP no store, saneando/validando o payload (RF-4).
 * Linhas malformadas são descartadas (forward-compat).
 *
 * @param registries - Cadastros a guardar (não-objeto vira vazios).
 */
export function setErpRegistries(registries: unknown): void {
    erpRegistries = sanitizeRegistries(registries);
}

/**
 * Limpa os cadastros do ERP (ex.: ao abrir uma chave sem cadastros).
 */
export function clearErpRegistries(): void {
    erpRegistries = emptyRegistries();
}

/**
 * Retorna as contas customizadas do plano de contas em memória (RF-11).
 *
 * @returns As contas adicionadas pelo usuário (vazio até editar/importar).
 */
export function getErpCustomAccounts(): Account[] {
    return erpCustomAccounts;
}

/**
 * Grava as contas customizadas do plano, saneando/validando cada uma (RF-11).
 * Linhas malformadas são descartadas (forward-compat).
 *
 * @param accounts - Contas a guardar (não-array vira lista vazia).
 */
export function setErpCustomAccounts(accounts: unknown): void {
    erpCustomAccounts = sanitizeCustomAccounts(accounts);
}

/**
 * Limpa as contas customizadas do plano (ex.: ao abrir chave sem o campo).
 */
export function clearErpCustomAccounts(): void {
    erpCustomAccounts = [];
}

/**
 * Exporta o estado financeiro do ERP/DRE para serialização na chave .ecbt.
 * Pura: lê o store e retorna um payload com cópia defensiva.
 *
 * @returns Payload `{ schemaVersion, erpEntries, registries, customAccounts }`.
 */
export function exportErpFinancial(): ErpFinancialPayload {
    return {
        schemaVersion: ERP_FINANCIAL_SCHEMA_VERSION,
        erpEntries: [...erpEntries],
        registries: sanitizeRegistries(erpRegistries),
        customAccounts: [...erpCustomAccounts],
    };
}

/**
 * Importa o estado financeiro do ERP/DRE de um payload da chave .ecbt.
 * Forward-compat: payload ausente/malformado deixa os stores vazios (não quebra
 * chaves antigas sem `financial`, v1 sem `registries`, ou v2 sem `customAccounts`).
 *
 * @param payload - O objeto `model.financial` da chave (pode ser undefined).
 */
export function importErpFinancial(
    payload:
        | { erpEntries?: unknown; registries?: unknown; customAccounts?: unknown }
        | null
        | undefined,
): void {
    const entries =
        payload && Array.isArray((payload as ErpFinancialPayload).erpEntries)
            ? ((payload as ErpFinancialPayload).erpEntries as JournalEntry[])
            : [];
    setErpEntries(entries);
    // v1 → sem `registries`: sanitizeRegistries(undefined) devolve vazios.
    setErpRegistries(payload ? (payload as ErpFinancialPayload).registries : undefined);
    // v2 → sem `customAccounts`: sanitizeCustomAccounts(undefined) devolve [].
    setErpCustomAccounts(payload ? (payload as ErpFinancialPayload).customAccounts : undefined);
}
