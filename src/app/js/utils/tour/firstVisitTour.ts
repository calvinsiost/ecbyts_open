// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   FIRST VISIT TOUR — controle de exibicao do tour de boas-vindas
   Gerencia a chave localStorage que registra se o tour ja foi visto.
   ================================================================ */

import { welcomeTour } from './tours/welcome-tour.js';

/** Chave canonica que registra primeira visita concluida ou dispensada. */
export const FIRST_VISIT_KEY = 'ecbyts-first-visit';
export const FIRST_VISIT_PERSONA_KEY = 'ecbyts-persona';
export const FIRST_VISIT_PERSONAS = Object.freeze(['engineer', 'regulator', 'consultant']);
const LEGACY_WELCOME_TOUR_KEY = 'ecbyts-tour-welcome-seen';
const LEGACY_WELCOME_SCREEN_KEY = 'ecbyts-welcome-shown';

/**
 * Normaliza persona para o conjunto canonico da primeira visita.
 */
export function normalizeFirstVisitPersona(
    persona: unknown,
): 'engineer' | 'regulator' | 'consultant' | null {
    return typeof persona === 'string' && FIRST_VISIT_PERSONAS.includes(persona)
        ? (persona as 'engineer' | 'regulator' | 'consultant')
        : null;
}

/**
 * Le a persona persistida para personalizacao leve do onboarding.
 */
export function getStoredFirstVisitPersona(): 'engineer' | 'regulator' | 'consultant' | null {
    try {
        return normalizeFirstVisitPersona(localStorage.getItem(FIRST_VISIT_PERSONA_KEY));
    } catch (e) {
        console.debug('[firstVisitTour] getPersona:', (e as any)?.message || e);
        return null;
    }
}

/**
 * Persiste persona valida ou remove a chave quando usuario pula a escolha.
 */
export function setStoredFirstVisitPersona(
    persona: unknown,
): 'engineer' | 'regulator' | 'consultant' | null {
    const normalized = normalizeFirstVisitPersona(persona);
    try {
        if (normalized) {
            localStorage.setItem(FIRST_VISIT_PERSONA_KEY, normalized);
        } else {
            localStorage.removeItem(FIRST_VISIT_PERSONA_KEY);
        }
    } catch (e) {
        console.debug('[firstVisitTour] setPersona:', (e as any)?.message || e);
    }
    return normalized;
}

/**
 * Verifica se o usuario ja viu o tour de boas-vindas.
 * Retorna true em caso de erro (evita re-exibicao em ambientes sem storage).
 */
export function hasSeenWelcomeTour(): boolean {
    try {
        return (
            !!localStorage.getItem(FIRST_VISIT_KEY) ||
            localStorage.getItem(LEGACY_WELCOME_TOUR_KEY) === '1' ||
            localStorage.getItem(LEGACY_WELCOME_SCREEN_KEY) === 'true'
        );
    } catch (e) {
        console.debug('[firstVisitTour] hasSeen:', (e as any)?.message || e);
        return true;
    }
}

/**
 * Marca o tour de boas-vindas como visto no localStorage.
 * Falhas silenciosas por quota sao toleradas.
 */
export function markWelcomeTourSeen() {
    try {
        const stamp = new Date().toISOString();
        localStorage.setItem(FIRST_VISIT_KEY, stamp);
        localStorage.setItem(LEGACY_WELCOME_TOUR_KEY, '1');
        localStorage.setItem(LEGACY_WELCOME_SCREEN_KEY, 'true');
    } catch (e) {
        console.debug('[firstVisitTour] markSeen:', (e as any)?.message || e);
        // quota exceeded - ignorar silenciosamente
    }
}

/**
 * Retorna true se o tour de boas-vindas deve ser exibido.
 */
export function shouldShowWelcomeTour(): boolean {
    return !hasSeenWelcomeTour();
}

export { welcomeTour };
