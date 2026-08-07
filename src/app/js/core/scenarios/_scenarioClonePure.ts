// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   SCENARIO CLONE — pure-logic (SCENARIOS-IMPACT-001, F1).

   SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md (§2.1 F1,
   §4.2 assinaturas). Fundamento do comparador de cenários: clonar o
   modelo num "cenário" IMUTÁVEL, sem mutar o original — as mutações
   de processo (F2) e a propagação de impacto (F3) operam sobre novas
   cópias, nunca sobre o estado vivo do modelo do usuário.

   ZERO DOM, ZERO IO, determinístico — testável isoladamente.

   Decisões:
   - `ModelState` é o snapshot estrutural mínimo da spec §4.2
     (`{ elements, campaigns, erpFinancial }`) — o projeto não tem um
     tipo-container único de "modelo"; o caller monta o snapshot a
     partir de `getAllElements()`/`getAllCampaigns()`/estado ERP.
   - Cópia profunda via `structuredClone` (Node 22 + browsers
     modernos) — dados puros do modelo (sem funções/DOM).
   - Imutabilidade profunda via `Object.freeze` recursivo: qualquer
     tentativa de mutar o clone lança TypeError em strict mode
     (o app inteiro roda em strict via módulos ES).
   - `id` determinístico: slug do nome + sufixo explícito do caller
     (nenhum contador global escondido — o PRNG/clock ficam fora da
     pure-logic; quem precisa de unicidade passa `opts.id`).
   ================================================================ */

/** Snapshot estrutural mínimo do modelo (spec §4.2). */
export interface ModelState {
    elements: unknown[];
    campaigns: unknown[];
    erpFinancial: unknown;
}

/**
 * Um cenário: cópia profunda CONGELADA do modelo, rotulada, com
 * ponteiro para o cenário-base (spec §2.1 F1).
 */
export interface Scenario {
    /** Identificador único do cenário. */
    readonly id: string;
    /** Nome legível (ex.: "Base", "Alternativo A"). */
    readonly name: string;
    /** Id do cenário-base do qual este deriva (`null` = é o cenário-base). */
    readonly baseScenarioId: string | null;
    /** Snapshot do modelo clonado (profundamente congelado). */
    readonly model: ModelState;
}

/** Opções de clonagem. */
export interface CloneScenarioOptions {
    /** Id explícito (vence o derivado do nome). */
    readonly id?: string;
    /** Ponteiro para o cenário-base (default `null` = este É o base). */
    readonly baseScenarioId?: string | null;
}

/** Congela recursivamente objetos/arrays planos (dados do modelo). */
function deepFreeze<T>(value: T, seen: WeakSet<object> = new WeakSet()): T {
    if (value === null || typeof value !== 'object') return value;
    const obj = value as object;
    if (seen.has(obj)) return value;
    seen.add(obj);
    for (const key of Object.keys(obj)) {
        deepFreeze((obj as Record<string, unknown>)[key], seen);
    }
    Object.freeze(obj);
    return value;
}

/** Slug ASCII minúsculo do nome (fallback 'scenario' quando vazio). */
function slugify(name: string): string {
    const slug = String(name || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || 'scenario';
}

/**
 * Clona um modelo num cenário imutável, sem mutar o original (F1).
 *
 * Garantias (testadas em tests/scenario-clone-pure.test.mjs):
 * - o objeto retornado NÃO compartilha nenhuma referência com `model`
 *   (deep copy via structuredClone);
 * - `model` (original) sai intocado e NÃO é congelado — o freeze é
 *   só da cópia;
 * - o cenário clonado é profundamente congelado (spec §13.2:
 *   objetos `Object.freeze`);
 * - `baseScenarioId` aponta para o cenário-base quando fornecido.
 *
 * @param model  snapshot do modelo (NÃO é alterado nem congelado).
 * @param name   nome legível do cenário.
 * @param opts   id explícito e/ou ponteiro para o cenário-base.
 * @returns cenário imutável com id, nome, ponteiro e modelo clonado.
 */
export function cloneModelToScenario(
    model: ModelState,
    name: string,
    opts: CloneScenarioOptions = {},
): Scenario {
    if (model === null || typeof model !== 'object') {
        throw new Error('cloneModelToScenario: model inválido (esperado objeto ModelState)');
    }
    const cloned = structuredClone({ elements: model.elements, campaigns: model.campaigns, erpFinancial: model.erpFinancial });
    const id = typeof opts.id === 'string' && opts.id.trim() !== '' ? opts.id : `scenario-${slugify(name)}`;
    return Object.freeze({
        id,
        name: String(name ?? ''),
        baseScenarioId: typeof opts.baseScenarioId === 'string' ? opts.baseScenarioId : null,
        model: deepFreeze(cloned),
    });
}
