// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import { normalizeTrainingSlideAppOptions } from './trainingSlideAppOptionsModel.js';
import { fallbackMessage } from './trainingSlideAppOptionsSummary.js';
import type {
    NormalizedTrainingSlideAppOption,
    TrainingSlideAppOptionActionResult,
    TrainingSlideAppOptionInput,
    TrainingSlideAppOptionsRenderConfig,
} from './trainingSlideAppOptionsTypes.js';

export function resolveTrainingSlideWindow(
    windowRef: TrainingSlideAppOptionsRenderConfig['windowRef'],
): (Window & Record<string, unknown>) | Record<string, unknown> | null {
    if (windowRef) return windowRef;
    if (typeof window !== 'undefined') return window as unknown as Window & Record<string, unknown>;
    return null;
}

export function showTrainingSlideOptionToast(
    win: (Window & Record<string, unknown>) | Record<string, unknown> | null,
    message: string,
    type: 'info' | 'warning',
): void {
    const fn = win && typeof win.showToast === 'function' ? win.showToast : null;
    if (fn) (fn as (message: string, type?: string) => void)(message, type);
}

function resolveHandler(
    win: (Window & Record<string, unknown>) | Record<string, unknown> | null,
    handlerName: string,
): ((...args: readonly unknown[]) => unknown) | null {
    if (!win || !handlerName) return null;
    const candidate = win[handlerName];
    return typeof candidate === 'function' ? (candidate as (...args: readonly unknown[]) => unknown) : null;
}

function openExternalUrl(
    win: (Window & Record<string, unknown>) | Record<string, unknown> | null,
    url: string,
): boolean {
    if (!url) return false;
    const opener = win && typeof win.open === 'function' ? win.open : null;
    if (!opener) return false;
    (opener as (url: string, target?: string, features?: string) => unknown)(url, '_blank', 'noopener');
    return true;
}

function actionArgs(option: NormalizedTrainingSlideAppOption, localPayload?: unknown): readonly unknown[] {
    if (option.args.length > 0) {
        return localPayload === undefined ? option.args : [...option.args, localPayload];
    }
    if (localPayload !== undefined) return [localPayload];
    return option.payload === undefined ? [] : [option.payload];
}

export async function runNormalizedTrainingSlideAppOption(
    option: NormalizedTrainingSlideAppOption,
    config: TrainingSlideAppOptionsRenderConfig,
    localPayload?: unknown,
): Promise<TrainingSlideAppOptionActionResult> {
    const win = resolveTrainingSlideWindow(config.windowRef);
    const handler = resolveHandler(win, option.handlerName);
    if (handler) {
        await Promise.resolve(handler(...actionArgs(option, localPayload)));
        return {
            ok: true,
            id: option.id,
            type: option.type,
            mode: 'handler',
            handlerName: option.handlerName,
            message: `Acao enviada para window.${option.handlerName}.`,
        };
    }
    if (option.type === 'resource' && option.url && openExternalUrl(win, option.url)) {
        return {
            ok: true,
            id: option.id,
            type: option.type,
            mode: 'resource',
            handlerName: option.handlerName,
            message: fallbackMessage(option),
        };
    }
    return {
        ok: false,
        id: option.id,
        type: option.type,
        mode: option.type === 'poll' || option.type === 'reveal' || option.type === 'snapshot' ? 'local' : 'fallback',
        handlerName: option.handlerName,
        message: fallbackMessage(option),
    };
}

export async function runTrainingSlideAppOption(
    option: TrainingSlideAppOptionInput,
    config: TrainingSlideAppOptionsRenderConfig = {},
): Promise<TrainingSlideAppOptionActionResult> {
    const normalized = normalizeTrainingSlideAppOptions([option])[0];
    if (!normalized) {
        return {
            ok: false,
            id: '',
            type: 'open-handler',
            mode: 'fallback',
            handlerName: '',
            message: 'Opcao invalida.',
        };
    }
    return runNormalizedTrainingSlideAppOption(normalized, config);
}
