// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Storyboard State - pure-logic linear slide model for Presentation Mode.
// UX-33 Phase 1 of SPEC_PRESENTATION_MODE_JOURNEY.
// Zero DOM, zero three.js. Immutable: every setter returns a new frozen state.
// Cada slide é uma "cena" do storyboard com duração, câmera e narração.

export type TransitionKind = 'cut' | 'fade' | 'pan';

export interface Slide {
    id: string;
    title: string;
    durationMs: number;
    cameraState: Record<string, unknown> | null;
    narration: string;
    transition: TransitionKind;
}

export interface StoryboardState {
    title: string;
    slides: readonly Slide[];
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

export interface StoryboardSummary {
    slideCount: number;
    totalDuration: number;
    transitions: Record<string, number>;
}

const VALID_TRANSITIONS = ['cut', 'fade', 'pan'] as const;
export type ValidTransition = (typeof VALID_TRANSITIONS)[number];

function freezeSlide(slide: Partial<Slide> & { id: string }): Slide {
    const transition = (VALID_TRANSITIONS.includes(slide.transition as ValidTransition)
        ? (slide.transition as ValidTransition)
        : 'cut') as TransitionKind;

    return Object.freeze({
        id: String(slide.id),
        title: String(slide.title ?? ''),
        durationMs: Number(slide.durationMs),
        cameraState: slide.cameraState ? Object.freeze({ ...slide.cameraState }) : null,
        narration: String(slide.narration ?? ''),
        transition,
    }) as Slide;
}

function freezeState(title: string, slides: Array<Partial<Slide> & { id: string }>): StoryboardState {
    const frozenSlides = Object.freeze(slides.map(freezeSlide));
    return Object.freeze({ title: String(title ?? ''), slides: frozenSlides }) as StoryboardState;
}

export function createStoryboard({ title = 'Untitled', slides = [] }: { title?: string, slides?: Array<Partial<Slide> & { id: string }> } = {}): StoryboardState {
    if (!Array.isArray(slides)) throw new TypeError('slides must be an array');
    const ids = new Set<string>();
    for (const s of slides) {
        if (!s || typeof s.id !== 'string' || !s.id) {
            throw new Error('every slide must have a non-empty string id');
        }
        if (ids.has(s.id)) throw new Error(`duplicate slide id: ${s.id}`);
        ids.add(s.id);
    }
    return freezeState(title, slides);
}

export function addSlide(state: StoryboardState, slide: Partial<Slide> & { id: string }): StoryboardState {
    if (!slide || typeof slide.id !== 'string' || !slide.id) {
        throw new Error('slide must have a non-empty string id');
    }
    if (state.slides.some((s: Slide) => s.id === slide.id)) {
        throw new Error(`slide id already exists: ${slide.id}`);
    }
    return freezeState(state.title, [...state.slides, slide] as Array<Partial<Slide> & { id: string }>);
}

export function removeSlide(state: StoryboardState, slideId: string): StoryboardState {
    const idx = state.slides.findIndex((s: Slide) => s.id === slideId);
    if (idx < 0) throw new Error(`slide not found: ${slideId}`);
    const next = state.slides.slice();
    next.splice(idx, 1);
    return freezeState(state.title, next as Array<Partial<Slide> & { id: string }>);
}

export function updateSlide(state: StoryboardState, slideId: string, partial: Partial<Slide>): StoryboardState {
    const idx = state.slides.findIndex((s: Slide) => s.id === slideId);
    if (idx < 0) throw new Error(`slide not found: ${slideId}`);
    const current = state.slides[idx];
    if (!current) throw new Error(`slide not found: ${slideId}`);
    const merged: Slide = { ...current, ...partial, id: current.id };
    const next = state.slides.slice();
    next[idx] = merged;
    return freezeState(state.title, next as Array<Partial<Slide> & { id: string }>);
}

export function reorderSlide(state: StoryboardState, slideId: string, newIndex: number): StoryboardState {
    const idx = state.slides.findIndex((s: Slide) => s.id === slideId);
    if (idx < 0) throw new Error(`slide not found: ${slideId}`);
    if (!Number.isInteger(newIndex) || newIndex < 0 || newIndex >= state.slides.length) {
        throw new RangeError(`newIndex out of bounds: ${newIndex}`);
    }
    const next = state.slides.slice();
    const [removed] = next.splice(idx, 1);
    if (!removed) throw new Error(`slide not found: ${slideId}`);
    next.splice(newIndex, 0, removed);
    return freezeState(state.title, next as Array<Partial<Slide> & { id: string }>);
}

export function getTotalDuration(state: StoryboardState): number {
    return state.slides.reduce(
        (acc: number, s: Slide) => acc + (Number(s.durationMs) || 0),
        0,
    );
}

export function getSlideAt(state: StoryboardState, timeMs: number): Slide | null {
    if (state.slides.length === 0) return null;
    if (typeof timeMs !== 'number' || Number.isNaN(timeMs) || timeMs < 0) return null;
    let acc = 0;
    for (const slide of state.slides) {
        const d = Number(slide.durationMs) || 0;
        if (timeMs < acc + d) return slide;
        acc += d;
    }
    return state.slides[state.slides.length - 1] ?? null;
}

export function validateStoryboard(state: StoryboardState | null | undefined): ValidationResult {
    const errors: string[] = [];
    if (!state || !Array.isArray(state.slides)) {
        return { valid: false, errors: ['invalid state shape'] };
    }
    if (state.slides.length === 0) errors.push('storyboard must have at least 1 slide');
    const ids = new Set<string>();
    for (const s of state.slides) {
        if (!s.id || typeof s.id !== 'string') {
            errors.push('slide id missing or not string');
            continue;
        }
        if (ids.has(s.id)) errors.push(`duplicate slide id: ${s.id}`);
        ids.add(s.id);
        if (typeof s.durationMs !== 'number' || !Number.isFinite(s.durationMs) || s.durationMs <= 0) {
            errors.push(`slide ${s.id}: durationMs must be > 0`);
        }
        if (!(VALID_TRANSITIONS.includes(s.transition as any))) {
            errors.push(`slide ${s.id}: invalid transition ${s.transition}`);
        }
    }
    return { valid: errors.length === 0, errors };
}

export function summarizeStoryboard(state: StoryboardState): StoryboardSummary {
    const transitions: Record<string, number> = {};
    for (const s of state.slides) {
        transitions[s.transition] = (transitions[s.transition] || 0) + 1;
    }
    return {
        slideCount: state.slides.length,
        totalDuration: getTotalDuration(state),
        transitions,
    };
}

export const __TRANSITIONS__ = VALID_TRANSITIONS;