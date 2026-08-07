// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   INTENT HINT — TRAINING-LMS-OPEN-001 T8.1
   ================================================================
   "Ensino no momento de intenção": em vez de um tour forçado, sugere a
   lição certa na hora certa. Na 1ª abertura de um módulo-chave (mapa em
   core/training/_intentHintMapPure.ts) dispara UM tooltip de 1 passo
   (spotlight + "Existe uma lição sobre isto — Abrir") usando o motor de
   tour JÁ existente (utils/tour/engine.ts, guided tour de 1 step).

   NÃO usa tour multi-passo (anti-pattern nº1 da pesquisa, Appcues) — cada
   entrada do mapa vira um guided tour de exatamente 1 step, registrado
   preguiçosamente na 1ª chamada (idempotente).

   Persistência: localStorage 'ecbyts-intent-hint-<modulo>' (1ª abertura,
   nunca mais reaparece para aquele módulo) — chave e decisão vêm do módulo
   puro; aqui só se lê/escreve localStorage de verdade e se aciona o motor.
   ================================================================ */

import {
    INTENT_HINT_MAP,
    findIntentHintEntry,
    intentHintStorageKey,
    shouldShowIntentHint,
    type IntentHintModuleId,
} from '../../core/training/_intentHintMapPure.js';
import { upsertHintSeen } from '../../core/training/_lmsHintsSeenPure.js';
import { registerGuidedTour, getGuidedTour } from './categories.js';
import { startGuidedTour } from './engine.js';
import { safeSetItem } from '../storage/storageMonitor.js';
import { idbGet, idbSet } from '../storage/idbStore.js';

/** T8.2: mesma chave/formato lido por lmsManager.ts para montar o painel. */
const IDB_HINTS_SEEN = 'ecbyts-lms-hints-seen';

const GUIDED_TOUR_ID_PREFIX = 'intent-hint-';

function _guidedTourIdFor(moduleId: IntentHintModuleId): string {
    return `${GUIDED_TOUR_ID_PREFIX}${moduleId}`;
}

/** Abre o painel de Treinamentos na aba Aprender — mesma entrada usada em
 *  todo o resto do app (trainingReturnContext.ts, datastudio.ts) para voltar
 *  ao módulo de treinamento a partir de qualquer lugar. */
function _openTrainingFromHint(): void {
    try {
        const win = window as unknown as { openLmsModule?: (opts?: unknown) => unknown; handleOpenTraining?: () => unknown };
        const open = win.openLmsModule || win.handleOpenTraining;
        if (typeof open === 'function') open({ activeTab: 'myCourses' });
    } catch (e: unknown) {
        console.debug('[intentHint] open training:', e instanceof Error ? e.message : e);
    }
}

/** Registra (preguiçosamente, 1x) o guided tour de 1 step para um módulo. */
function _ensureGuidedTourRegistered(moduleId: IntentHintModuleId): boolean {
    const entry = findIntentHintEntry(moduleId);
    if (!entry) return false;
    const tourId = _guidedTourIdFor(moduleId);
    if (getGuidedTour(tourId)) return true;
    registerGuidedTour({
        id: tourId,
        categoryId: 'environmental-workflows',
        nameKey: entry.titleKey,
        descKey: entry.bodyKey,
        icon: 'zap',
        difficulty: 'beginner',
        estimatedMinutes: 1,
        prerequisites: {},
        steps: [
            {
                id: `${tourId}-step-1`,
                target: entry.target,
                title: entry.titleKey,
                body: entry.bodyKey,
                position: 'bottom',
                // CTA único do tooltip: "Abrir" leva à lição sugerida no painel
                // de Treinamentos (RF-1 resume-first já resolve qual lição).
                postAction: _openTrainingFromHint,
            },
        ],
    });
    return true;
}

function _hasSeenIntentHint(moduleId: IntentHintModuleId): boolean {
    try {
        return typeof localStorage !== 'undefined' && Boolean(localStorage.getItem(intentHintStorageKey(moduleId)));
    } catch (e: unknown) {
        console.debug('[intentHint] hasSeen:', e instanceof Error ? e.message : e);
        return true; // ambiente sem storage: nunca repetir a interrupção
    }
}

function _markIntentHintSeen(moduleId: IntentHintModuleId): void {
    try {
        safeSetItem(intentHintStorageKey(moduleId), new Date().toISOString());
    } catch (e: unknown) {
        console.debug('[intentHint] markSeen:', e instanceof Error ? e.message : e);
    }
}

/**
 * T8.2: persiste a dica vista em IndexedDB (chave 'ecbyts-lms-hints-seen')
 * para a seção "Dicas que você já viu" do painel de Treinamentos. Best-effort
 * — falha silenciosa (mesmo padrão de _persistEnrollments em lmsManager.ts),
 * nunca bloqueia o fluxo de abertura do módulo.
 */
async function _persistHintSeen(moduleId: IntentHintModuleId, lessonLabel: string): Promise<void> {
    try {
        const current = await idbGet(IDB_HINTS_SEEN);
        const next = upsertHintSeen(current, {
            moduleId,
            lessonLabel,
            seenAt: new Date().toISOString(),
        });
        await idbSet(IDB_HINTS_SEEN, next);
    } catch (e: unknown) {
        console.debug('[intentHint] persistHintSeen:', e instanceof Error ? e.message : e);
    }
}

/**
 * Chamar no handler de abertura de um módulo-chave (ex.: dentro de
 * handleOpenPipelineManager, DEPOIS de a UI do módulo estar visível).
 * Na 1ª abertura real (flag ausente) e fora de um contexto de aula já ativo,
 * marca a flag e dispara o tooltip de 1 passo; nas aberturas seguintes é
 * no-op silencioso.
 *
 * @param moduleId chave do módulo (deve existir em INTENT_HINT_MAP)
 * @param opts.openedFromTrainingContext `true` quando esta abertura já é
 *   parte de um fluxo de aula (ex.: Clique-go do GAC) — suprime a dica para
 *   não sugerir a própria aula da qual o usuário já veio.
 * @returns `true` quando a dica foi de fato disparada nesta chamada.
 */
export function maybeTriggerIntentHint(
    moduleId: IntentHintModuleId,
    opts: { openedFromTrainingContext?: boolean } = {},
): boolean {
    const alreadySeen = _hasSeenIntentHint(moduleId);
    if (!shouldShowIntentHint(moduleId, alreadySeen, Boolean(opts.openedFromTrainingContext))) {
        return false;
    }
    const entry = findIntentHintEntry(moduleId);
    if (!entry || !_ensureGuidedTourRegistered(moduleId)) return false;
    _markIntentHintSeen(moduleId);
    // T8.2: agrega a dica na store consultada pela seção "Dicas que você já
    // viu" — best-effort, não bloqueia o disparo do tooltip.
    void _persistHintSeen(moduleId, entry.lessonLabel);
    // Fire-and-forget: startGuidedTour é assíncrono e falha graciosamente
    // (ui-not-ready/target ausente) sem quebrar o fluxo do handler chamador.
    void startGuidedTour(_guidedTourIdFor(moduleId)).catch((e: unknown) => {
        console.debug('[intentHint] startGuidedTour:', e instanceof Error ? e.message : e);
    });
    return true;
}

/** Exposto para testes/depuração: lista os módulos cobertos pelo mapa. */
export function listIntentHintModules(): readonly IntentHintModuleId[] {
    return INTENT_HINT_MAP.map((entry) => entry.moduleId);
}
