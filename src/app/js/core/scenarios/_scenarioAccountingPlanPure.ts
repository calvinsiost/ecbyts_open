// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   SCENARIO ACCOUNTING PLAN — pure-logic (CFG-19, TEMA F).

   SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md
     - §2.4 CFG-19 — "Plano de contas selecionável (BR-DRE / IFRS / US-GAAP).
       IFRS e US-GAAP JÁ EXISTEM em `_statementStandards.ts` mas não são usados
       aqui. Vira opção curada; default = BR-DRE. Testável: padrão=IFRS →
       `buildIncomeStatement('IFRS')` é usado e o mapeamento CAPEX/OPEX segue o
       padrão escolhido."
     - §2.4.0 guard-rail #1 (opções curadas) e #5 (fonte citável).

   ─── O buraco real que o item fecha ───

   Verificado no código antes de escrever: os DOIS pontos do trilho de cenários
   que montam DRE — `_scenarioCapexOpexPure.ts` e `_scenarioImpactEnginePure.ts`
   — chamavam `buildIncomeStatement(ledger, chart, 'BR-DRE')` com a string
   CRAVADA. As outras duas normas existiam na tabela do ERP e eram inalcançáveis
   a partir daqui: uma operação que reporta em IFRS não tinha como pedir a sua.

   ─── O apelido é CURADO, não é parse ───

   A spec escreve os planos pelo nome curto ("BR-DRE / IFRS / US-GAAP") e a
   tabela do ERP usa o id longo ('IFRS-IAS1', 'US-GAAP-ASC220'). Este módulo
   reconcilia os dois com uma TABELA de apelidos curados — não com normalização
   esperta de string. A diferença importa: um `replace(/[^A-Z]/g,'')` aceitaria
   "ifrs!!!" e qualquer lixo que colidisse, e um dia casaria dois planos no
   mesmo id sem ninguém ver. Apelido que não está na tabela não vira plano (N8).

   ─── O que trocar de plano MUDA — e o que NÃO muda ───

   Medido, não suposto (a suíte crava): as três normas projetam os MESMOS
   seletores de conta (COGS, vendas, admin, financeiras, tributos), então sobre
   um mesmo ledger elas dão o MESMO total de CAPEX/OPEX e o MESMO netIncome. O
   que muda é a FACE da demonstração: quantas linhas, com que chaves e com que
   rótulos ("Lucro Bruto" × "Gross profit" × "Gross profit" do multi-step).

   Isso é propriedade do PLANO DE CONTAS (o mesmo `defaultChartBR`), não uma
   falha da seleção — e é também a prova de zero regressão do item. Registrar
   isso aqui evita a leitura errada de que "trocar para IFRS não fez nada":
   fez, e o resultado ser numericamente igual é o esperado enquanto o chart for
   o mesmo. Um chart com contas que os seletores discriminem faria os totais
   divergirem sem tocar neste módulo.

   ZERO DOM, ZERO IO, determinístico. Objetos retornados congelados.
   ================================================================ */

import { STANDARDS, type StandardId, type StatementStandard } from '../erp/_statementStandards.js';

/** Plano de contas default: BR-DRE — o que estava cravado antes do CFG-19. */
export const DEFAULT_ACCOUNTING_PLAN: StandardId = 'BR-DRE';

/** Versão do catálogo curado de planos — trilha de auditoria (N9). */
export const ACCOUNTING_PLAN_CATALOG_VERSION = 1;

/**
 * Apelidos CURADOS → id da norma. Tabela, não heurística (ver cabeçalho): a
 * spec fala "IFRS"/"US-GAAP", a tabela do ERP responde por 'IFRS-IAS1' e
 * 'US-GAAP-ASC220'. Chaves em MAIÚSCULA, já sem separadores, porque a
 * normalização de escrita (caixa, espaço, hífen, underscore) é ortografia, não
 * invenção de dado. Congelado.
 */
const CURATED_ALIASES: Readonly<Record<string, StandardId>> = Object.freeze({
    BRDRE: 'BR-DRE',
    BR: 'BR-DRE',
    DRE: 'BR-DRE',
    BRGAAP: 'BR-DRE',
    IFRS: 'IFRS-IAS1',
    IFRSIAS1: 'IFRS-IAS1',
    IAS1: 'IFRS-IAS1',
    USGAAP: 'US-GAAP-ASC220',
    USGAAPASC220: 'US-GAAP-ASC220',
    ASC220: 'US-GAAP-ASC220',
});

/** Plano de contas resolvido — a norma em vigor e a sua procedência. */
export interface ResolvedAccountingPlan {
    /** Id da norma em vigor, aceito por `buildIncomeStatement`. */
    readonly id: StandardId;
    /** Rótulo humano da norma (vem da tabela do ERP, não redigitado aqui). */
    readonly label: string;
    /** Procedência citável da norma (CFG-19 — nunca ''). */
    readonly source: string;
    /** Id/apelido pedido pelo chamador; `null` quando não pediu (auditoria). */
    readonly requested: string | null;
    /** `true` quando um plano FOI pedido e não está no catálogo curado (N8). */
    readonly unknown: boolean;
    /** `true` quando a norma em vigor é o default BR-DRE (o caminho de hoje). */
    readonly isDefault: boolean;
    /** Versão do catálogo curado que resolveu (N9). */
    readonly catalogVersion: number;
}

/** Normaliza a ESCRITA do pedido (caixa/separadores), sem adivinhar conteúdo. */
function normalizeKey(raw: string): string {
    return raw.trim().toUpperCase().replace(/[\s\-_.]/g, '');
}

/**
 * Resolve o plano de contas do cenário (CFG-19).
 *
 * Aceita o id da norma ('IFRS-IAS1') ou um apelido curado ('IFRS'). Ausente,
 * vazio ou fora do catálogo cai no default BR-DRE — que reproduz exatamente a
 * string cravada de antes (guard-rail §2.4.0 #2, zero regressão) — e, quando o
 * plano FOI pedido e não existe, `unknown` deixa o descarte VISÍVEL em vez de
 * fingir que o usuário escolheu BR-DRE.
 *
 * @param plan - Id da norma ou apelido curado; qualquer caixa.
 * @returns {@link ResolvedAccountingPlan} congelada; nunca lança.
 */
export function resolveAccountingPlan(plan?: string | null): ResolvedAccountingPlan {
    const requested = typeof plan === 'string' && plan.trim().length > 0 ? plan : null;
    const key = requested === null ? null : normalizeKey(requested);
    const direct =
        key !== null && Object.prototype.hasOwnProperty.call(CURATED_ALIASES, key)
            ? (CURATED_ALIASES[key] as StandardId)
            : null;
    const id = direct ?? DEFAULT_ACCOUNTING_PLAN;
    const std = STANDARDS[id] as StatementStandard;
    return Object.freeze({
        id,
        label: std.label,
        source: std.source,
        requested,
        unknown: requested !== null && direct === null,
        isDefault: id === DEFAULT_ACCOUNTING_PLAN,
        catalogVersion: ACCOUNTING_PLAN_CATALOG_VERSION,
    });
}

/** Uma opção de plano para um seletor — id, rótulo e procedência. */
export interface AccountingPlanOption {
    readonly id: StandardId;
    readonly label: string;
    readonly source: string;
}

/**
 * Os planos oferecíveis, em ordem estável, cada um com procedência declarada.
 *
 * É a metade "escolher entre opções curadas" do guard-rail §2.4.0 #1: a tela
 * oferece ESTA lista, não um campo de texto livre.
 *
 * @returns Opções congeladas, com o default (BR-DRE) primeiro.
 */
export function listAccountingPlans(): readonly AccountingPlanOption[] {
    const ids = Object.keys(STANDARDS) as StandardId[];
    const ordered = [
        DEFAULT_ACCOUNTING_PLAN,
        ...ids.filter((id) => id !== DEFAULT_ACCOUNTING_PLAN).sort(),
    ];
    return Object.freeze(
        ordered.map((id) => {
            const std = STANDARDS[id] as StatementStandard;
            return Object.freeze({ id, label: std.label, source: std.source });
        }),
    ) as readonly AccountingPlanOption[];
}
