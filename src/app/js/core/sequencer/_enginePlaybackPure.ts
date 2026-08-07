// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   SEQUENCER ENGINE PLAYBACK PURE
   (ARCH-MONOLITH-ATOMIZATION-001 — sequencer slice extraction)
   ================================================================

   Matemática PURA de avanço de playback extraída de core/sequencer/
   engine.ts (RAF loop _tick, antes inline e SEM teste).

   Dado o estado de playback (posição atual, velocidade, loop) e o tempo
   decorrido desde o último frame (deltaMs) + a duração total da timeline,
   calcula a PRÓXIMA posição normalizada [0..1] e se o playback terminou.

   Determinística: sem deps de requestAnimationFrame, performance.now(),
   document, state interno ou Three.js. Espelha byte-a-byte o cálculo
   antigo do _tick para garantir comportamento idêntico.
   ================================================================ */

/**
 * Resultado do avanço de um frame de playback.
 * @property nextPosition Próxima posição normalizada [0..1].
 * @property ended `true` quando a timeline chegou ao fim e NÃO está em loop
 *   (o engine deve pausar). Sempre `false` enquanto há mais a tocar ou em loop.
 */
export interface PlaybackAdvance {
    nextPosition: number;
    ended: boolean;
}

/**
 * Avança a posição de playback por um delta de tempo.
 *
 * Espelha exatamente a lógica inline do antigo `_tick`:
 *   const deltaPosition = (deltaMs * speed) / totalDuration;
 *   let newPosition = position + deltaPosition;
 *   if (newPosition >= 1.0) {
 *       if (loop) newPosition = newPosition % 1.0;   // wrap
 *       else      newPosition = 1.0; ended = true;    // clamp + stop
 *   }
 *
 * @param position Posição atual normalizada [0..1].
 * @param deltaMs Tempo decorrido desde o último frame (ms).
 * @param speed Multiplicador de velocidade do playback (1.0 = tempo real).
 * @param totalDuration Duração total da timeline (ms).
 * @param loop Se `true`, faz wrap-around ao passar de 1.0 em vez de parar.
 * @returns `{ nextPosition, ended }`.
 */
export function advancePlaybackPosition(
    position: number,
    deltaMs: number,
    speed: number,
    totalDuration: number,
    loop: boolean,
): PlaybackAdvance {
    const deltaPosition = (deltaMs * speed) / totalDuration;
    let newPosition = position + deltaPosition;
    if (newPosition >= 1.0) {
        if (loop) {
            newPosition = newPosition % 1.0;
        } else {
            return { nextPosition: 1.0, ended: true };
        }
    }
    return { nextPosition: newPosition, ended: false };
}
