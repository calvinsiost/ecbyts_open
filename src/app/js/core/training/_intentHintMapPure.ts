// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   INTENT HINT MAP (pure) — TRAINING-LMS-OPEN-001 T8.1
   ================================================================
   "Ensino no momento de intenção": em vez de forçar um tour completo,
   o app sugere UMA lição no instante em que o aluno abre um módulo-chave
   pela 1ª vez (ex.: abriu Pipelines pela 1ª vez -> dica de 1 tooltip
   apontando a lição do fluxo GAC/DD38).

   Este módulo é PURO: só declara o mapa módulo -> lição/handler e as
   funções de decisão (achar entrada, decidir se deve mostrar). Nenhum
   acesso a DOM/localStorage/window — os call-sites (utils/tour/intentHint.ts)
   leem localStorage e chamam o motor de tour real.
   ================================================================ */

/** Identificador de módulo-chave coberto pela dica de intenção. */
export type IntentHintModuleId = string;

/** Uma entrada do mapa módulo -> lição sugerida. */
export interface IntentHintEntry {
    /** Chave do módulo (usada na flag localStorage `ecbyts-intent-hint-<modulo>`). */
    readonly moduleId: IntentHintModuleId;
    /** Nome do handler real de abertura do módulo (ex.: 'handleOpenPipelineManager').
     *  Documenta a ligação com o handler existente — usado pelo cheap test para
     *  provar que o módulo citado no mapa corresponde a um handler de verdade. */
    readonly handlerName: string;
    /** Seletor CSS do elemento a destacar (spotlight) quando a dica aparece. */
    readonly target: string;
    /** Chave i18n do título do tooltip de 1 passo. */
    readonly titleKey: string;
    /** Chave i18n do corpo do tooltip de 1 passo. */
    readonly bodyKey: string;
    /** Label legível da lição sugerida (fallback caso i18n falhe), usado também
     *  na seção "Dicas que você já viu" (T8.2). */
    readonly lessonLabel: string;
}

/**
 * Mapa módulo-chave -> lição sugerida (T8.1). Congelado: adicionar um módulo
 * novo é editar esta lista, nunca mutá-la em runtime.
 */
export const INTENT_HINT_MAP: readonly IntentHintEntry[] = Object.freeze([
    Object.freeze({
        moduleId: 'pipelines',
        handlerName: 'handleOpenPipelineManager',
        target: '[data-handler="handleOpenPipelineManager"]',
        titleKey: 'intentHint.pipelines.title',
        bodyKey: 'intentHint.pipelines.body',
        lessonLabel: 'Fluxo GAC/DD-38',
    }),
    Object.freeze({
        moduleId: 'datastudio',
        handlerName: 'handleOpenDataStudio',
        target: '#datastudio-container',
        titleKey: 'intentHint.datastudio.title',
        bodyKey: 'intentHint.datastudio.body',
        lessonLabel: 'Cadeia digital de dados',
    }),
]);

/** Prefixo canônico da flag localStorage por módulo (T8.1). */
export const INTENT_HINT_STORAGE_PREFIX = 'ecbyts-intent-hint-';

/** Monta a chave localStorage `ecbyts-intent-hint-<modulo>` para um módulo. */
export function intentHintStorageKey(moduleId: IntentHintModuleId): string {
    return `${INTENT_HINT_STORAGE_PREFIX}${moduleId}`;
}

/** Busca a entrada do mapa para um módulo, ou `undefined` se não coberto. */
export function findIntentHintEntry(moduleId: IntentHintModuleId): IntentHintEntry | undefined {
    return INTENT_HINT_MAP.find((entry) => entry.moduleId === moduleId);
}

/**
 * Decide se a dica de intenção deve aparecer: só existe entrada coberta,
 * ainda não foi vista (flag localStorage ausente) e a abertura NÃO veio de
 * dentro de um contexto de aula já ativo (ex.: o próprio Clique-go do GAC
 * abrindo Pipelines não deve re-sugerir a aula da qual ele já veio).
 *
 * @param moduleId módulo que acabou de abrir
 * @param alreadySeen `true` quando a flag `ecbyts-intent-hint-<modulo>` já existe
 * @param openedFromTrainingContext `true` quando a abertura já carrega contexto
 *   de retorno à aula (trainingContext.hasContext) — suprime a dica.
 */
export function shouldShowIntentHint(
    moduleId: IntentHintModuleId,
    alreadySeen: boolean,
    openedFromTrainingContext = false,
): boolean {
    if (openedFromTrainingContext) return false;
    if (alreadySeen) return false;
    return Boolean(findIntentHintEntry(moduleId));
}

Object.freeze(intentHintStorageKey);
Object.freeze(findIntentHintEntry);
Object.freeze(shouldShowIntentHint);
