// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

import { escapeHtml, escapeAttr } from '../helpers/html.js';
import type { DeckWorkbenchSlide } from './lmsAuthoringDeckModel.js';
import type { LmsAuthoringDeckWorkbenchContext } from './lmsAuthoringDeckWorkbenchTypes.js';

function thumbnailNumber(slide: DeckWorkbenchSlide): string {
    return `<span class="lms-author-slide-strip-number">${escapeHtml(String(slide.displayNumber))}</span>`;
}

export function renderDeckWorkbenchThumbnail(
    slide: DeckWorkbenchSlide,
    context: LmsAuthoringDeckWorkbenchContext,
): string {
    const imageRef = context.imageInfoForSlide(slide).displayRef;
    const label = `Miniatura do slide ${slide.displayNumber}: ${slide.title}`;
    if (imageRef && context.isRenderableImageRef(imageRef)) {
        const loading = slide.displayNumber === 1 ? 'eager' : 'lazy';
        const priority = slide.displayNumber === 1 ? ' fetchpriority="high"' : '';
        return `<img class="lms-author-slide-strip-thumb" src="${escapeAttr(imageRef)}" alt="${escapeAttr(label)}" loading="${loading}"${priority}>
${thumbnailNumber(slide)}`;
    }
    if (imageRef) {
        return `<span class="lms-author-slide-strip-linked" aria-hidden="true"></span>
${thumbnailNumber(slide)}`;
    }
    return thumbnailNumber(slide);
}
