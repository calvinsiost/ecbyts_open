// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

export interface Annotation {
    nx: number;
    ny: number;
    family: string;
}

export interface BuildAnnotationFamilyMenuArgs {
    families?: string[];
    familyIcons?: Record<string, unknown>;
    familyLabels?: Record<string, unknown>;
    getIcon?: (name: string, options: { size: string }) => string;
    translate?: (key: string) => string;
}

export interface BuildAnnotationListArgs {
    annotations?: Annotation[];
    familyIcons?: Record<string, unknown>;
    familyLabels?: Record<string, unknown>;
    familyColors?: Record<string, unknown>;
    getIcon?: (name: string, options: { size: string }) => string;
}

export function buildAnnotationFamilyMenuHtml(arg: unknown): string {
    const {
        families = [],
        familyIcons = {},
        familyLabels = {},
        getIcon,
        translate,
    } = (arg as BuildAnnotationFamilyMenuArgs) || {};
    let html = `<div class="panel-context-menu-label">${translate?.('selectFamily') || 'Select family'}</div>`;

    for (const family of families) {
        const iconName = (familyIcons as Record<string, unknown>)[family] as string || 'map-pin';
        const label = (familyLabels as Record<string, unknown>)[family] as string || family;
        html += `<button class="panel-context-menu-item" data-family="${family}">
            ${getIcon?.(iconName, { size: '14px' }) || ''}
            <span>${label}</span>
        </button>`;
    }

    return html;
}

export function buildAnnotationListHtml(arg: unknown): string {
    const {
        annotations = [],
        familyIcons = {},
        familyLabels = {},
        familyColors = {},
        getIcon,
    } = (arg as BuildAnnotationListArgs) || {};
    return annotations
        .map((annotation: Annotation, index: number) => {
            const iconName = (familyIcons as Record<string, unknown>)[annotation.family] as string || 'map-pin';
            const icon = getIcon?.(iconName, { size: '14px' }) || '';
            const label = (familyLabels as Record<string, unknown>)[annotation.family] as string || annotation.family;
            const color = (familyColors as Record<string, unknown>)[annotation.family] as string || '#888';
            const pctX = Math.round(annotation.nx * 100);
            const pctY = Math.round(annotation.ny * 100);

            return `<div class="aerial-annotation-row" style="border-left-color:${color};">
            <span class="annot-index" style="background:${color};">${index + 1}</span>
            <span style="width:16px;height:16px;flex-shrink:0;display:inline-flex;align-items:center;">${icon}</span>
            <span style="flex:1;font-size:12px;">${label}</span>
            <span style="font-size:10px;color:var(--window-muted);">(${pctX}%, ${pctY}%)</span>
            <button class="annot-remove" data-cc-call-click="handleAerialRemoveAnnotation|j:${encodeURIComponent(String(index))}" title="Remove">
                ${getIcon?.('x', { size: '14px' }) || ''}
            </button>
        </div>`;
        })
        .join('');
}

export function addAnnotation(
    annotations: Annotation[] = [],
    family: string,
    nx: number,
    ny: number,
): Annotation[] {
    return [...annotations, { nx, ny, family }];
}

export function removeAnnotationAtIndex(annotations: Annotation[] = [], index: number): Annotation[] {
    if (index < 0 || index >= annotations.length) return [...annotations];
    return annotations.filter((_, currentIndex) => currentIndex !== index);
}

export function clearAnnotations(): Annotation[] {
    return [];
}