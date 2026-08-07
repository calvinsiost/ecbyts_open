// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   BLANK SCENE HINT — pure logic (T7.3 SPEC_COMMERCIAL_READINESS_DOD)
   Decide se o guia visual da cena vazia ("Blank Project") deve
   aparecer e registra a dispensa. Zero DOM, zero imports — testável
   com node --test injetando um storage fake.
   ================================================================ */

/** Chave que registra a dispensa do hint da cena vazia. */
export const BLANK_SCENE_HINT_KEY = 'ecbyts-blank-hint-dismissed';

/** Interface mínima de storage (compatível com localStorage). */
export interface HintStorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

/**
 * O hint só aparece enquanto nunca foi dispensado.
 * Erros de storage (privacy mode / quota) suprimem o hint — nunca
 * reexibir num ambiente onde não conseguiríamos persistir a dispensa.
 */
export function shouldShowBlankSceneHint(storage: HintStorageLike | null | undefined): boolean {
    if (!storage) return false;
    try {
        return storage.getItem(BLANK_SCENE_HINT_KEY) === null;
    } catch {
        return false;
    }
}

/**
 * Marca o hint como dispensado (timestamp ISO). Retorna o valor gravado
 * ou null quando o storage falhou (quota) — falha tolerada em silêncio.
 */
export function markBlankSceneHintDismissed(
    storage: HintStorageLike | null | undefined,
    now: Date = new Date(),
): string | null {
    if (!storage) return null;
    const stamp = now.toISOString();
    try {
        storage.setItem(BLANK_SCENE_HINT_KEY, stamp);
        return stamp;
    } catch {
        return null;
    }
}

/** Ações do hint — ids estáveis mapeando handlers globais existentes. */
export const BLANK_SCENE_HINT_ACTIONS = Object.freeze([
    Object.freeze({ id: 'add-element', handler: 'handleAddElement', arg: 'well' }),
    Object.freeze({ id: 'demo-model', handler: 'handleGenerateRandomModel', arg: null }),
    Object.freeze({ id: 'start-tour', handler: 'handleStartTour', arg: null }),
] as const);
