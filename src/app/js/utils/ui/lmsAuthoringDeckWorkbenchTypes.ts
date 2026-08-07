// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

import type { CourseDraft } from '../../core/training/_courseAuthoringPure.js';
import type { DeckWorkbenchSlide, DeckWorkbenchVisibleSlides } from './lmsAuthoringDeckModel.js';
import type { TrainingSlideAppOptionsInput } from './trainingSlideAppOptionsTypes.js';

export type TeachingPlan = unknown;

export interface DeckWorkbenchImageInfo {
    readonly rawRef: string;
    readonly displayRef: string;
    readonly fileId: string;
    readonly status: 'linked' | 'loading' | 'ready' | 'failed' | 'none';
    readonly filename: string;
}

export interface DeckWorkbenchImageStats {
    readonly total: number;
    readonly withImage: number;
    readonly renderable: number;
    readonly linkedOnly: number;
    readonly missing: number;
}

export interface DeckWorkbenchReadiness {
    readonly state: string;
    readonly counts: { readonly pronto: number; readonly total: number };
}

export interface LmsAuthoringDeckWorkbenchContext {
    readonly selectedEditableElementId?: string | null;
    readonly translate: (key: string, fallback: string) => string;
    readonly courseDraftStatusLabel: (status: CourseDraft['status']) => string;
    readonly readinessForDraft: (draft: CourseDraft) => DeckWorkbenchReadiness;
    readonly readinessStateLabel: (state: DeckWorkbenchReadiness['state']) => string;
    readonly renderClassReadyBlock: (draft: CourseDraft) => string;
    readonly imageInfoForSlide: (slide: DeckWorkbenchSlide | undefined) => DeckWorkbenchImageInfo;
    readonly imageStatsForSlides: (slides: readonly DeckWorkbenchSlide[]) => DeckWorkbenchImageStats;
    readonly isRenderableImageRef: (ref: string) => boolean;
    readonly assetFileName: (ref: string) => string;
    readonly teachingPlanToPanelData: (plan: TeachingPlan) => TrainingSlideAppOptionsInput;
}

export interface RenderDeckWorkbenchOptions {
    readonly draft: CourseDraft;
    readonly slides: readonly DeckWorkbenchSlide[];
    readonly currentIndex: number;
    readonly visibleSlides: DeckWorkbenchVisibleSlides;
    readonly context: LmsAuthoringDeckWorkbenchContext;
}

export type PlanSuggestion = Record<string, unknown>;

export function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

export function text(value: unknown): string {
    return String(value || '').trim();
}

export function planSuggestions(plan: TeachingPlan): readonly PlanSuggestion[] {
    const suggestions = asRecord(plan).suggestions;
    return Array.isArray(suggestions)
        ? suggestions.filter((item): item is PlanSuggestion => Boolean(item && typeof item === 'object'))
        : [];
}
