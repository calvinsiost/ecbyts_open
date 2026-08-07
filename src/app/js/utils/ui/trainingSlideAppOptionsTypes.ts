// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import type { ModuleViewContext } from '../../core/training/moduleViewContextPure.js';

export const TRAINING_SLIDE_APP_OPTION_TYPES = ['open-handler', 'snapshot', 'poll', 'reveal', 'resource'] as const;

export type TrainingSlideAppOptionType = (typeof TRAINING_SLIDE_APP_OPTION_TYPES)[number];

export interface TrainingSlideAppOptionInput {
    readonly id?: string | number;
    readonly key?: string | number;
    readonly type?: string;
    readonly title?: string;
    readonly label?: string;
    readonly description?: string;
    readonly handler?: string;
    readonly openHandler?: string;
    readonly handlerName?: string;
    readonly actionLabel?: string;
    readonly modelPresetId?: string | number;
    readonly presetId?: string | number;
    readonly adapterId?: string;
    readonly surfaceType?: string;
    readonly fallbackAssetId?: string;
    readonly snapshotAssetId?: string;
    readonly target?: unknown;
    readonly args?: readonly unknown[];
    readonly handlerArgs?: readonly unknown[];
    readonly payload?: unknown;
    readonly fallback?: unknown;
    readonly fallbackText?: string;
    readonly url?: string;
    readonly href?: string;
    readonly resourceUrl?: string;
    readonly imageUrl?: string;
    readonly snapshotUrl?: string;
    readonly question?: string;
    readonly choices?: readonly string[];
    readonly pollOptions?: readonly string[];
    readonly options?: readonly string[];
    readonly revealText?: string;
    readonly revealedText?: string;
    readonly answer?: string;
    readonly meta?: readonly string[];
}

export type TrainingSlideAppOptionsInput =
    | readonly TrainingSlideAppOptionInput[]
    | {
          readonly id?: string | number;
          readonly slideId?: string | number;
          readonly slideNumber?: string | number;
          readonly title?: string;
          readonly intro?: string;
          readonly description?: string;
          readonly teacherGuide?: readonly string[];
          readonly guide?: readonly string[];
          readonly journey?: readonly string[];
          readonly options?: readonly TrainingSlideAppOptionInput[];
          readonly appOptions?: readonly TrainingSlideAppOptionInput[];
          readonly app_options?: readonly TrainingSlideAppOptionInput[];
      };

export interface NormalizedTrainingSlideAppOption {
    readonly id: string;
    readonly type: TrainingSlideAppOptionType;
    readonly title: string;
    readonly description: string;
    readonly handlerName: string;
    readonly modelPresetId: string;
    readonly adapterId: string;
    readonly surfaceType: string;
    readonly actionLabel: string;
    readonly args: readonly unknown[];
    readonly payload: unknown;
    readonly fallbackAssetId: string;
    readonly fallbackText: string;
    readonly url: string;
    readonly imageUrl: string;
    readonly question: string;
    readonly choices: readonly string[];
    readonly revealText: string;
    readonly meta: readonly string[];
    readonly moduleContext: ModuleViewContext | null;
    readonly moduleContextStatus: string;
    readonly moduleContextSummary: Readonly<Record<string, string>> | null;
}

export interface TrainingSlideAppOptionsRenderConfig {
    readonly documentRef?: Document;
    readonly windowRef?: (Window & Record<string, unknown>) | Record<string, unknown>;
    readonly onAction?: (result: TrainingSlideAppOptionActionResult, option: NormalizedTrainingSlideAppOption) => void;
    readonly onFallback?: (
        result: TrainingSlideAppOptionActionResult,
        option: NormalizedTrainingSlideAppOption,
    ) => void;
}

export interface TrainingSlideAppOptionActionResult {
    readonly ok: boolean;
    readonly id: string;
    readonly type: TrainingSlideAppOptionType;
    readonly mode: 'handler' | 'fallback' | 'local' | 'resource';
    readonly handlerName: string;
    readonly message: string;
}

export interface TrainingSlideAppOptionProfessorSummary {
    readonly destinationLabel: string;
    readonly reasonLabel: string;
    readonly presetStatusLabel: string;
    readonly returnLabel: string;
    readonly fallbackLabel: string;
}
