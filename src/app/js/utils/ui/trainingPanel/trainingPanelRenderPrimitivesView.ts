// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

import { escapeHtml, escapeAttr } from '../../helpers/html.js';
import { t } from '../../i18n/translations.js';

export type TrainingItemRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is TrainingItemRecord {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeTrainingPanelItems(items: unknown): TrainingItemRecord[] {
    return Array.isArray(items) ? items.filter(isRecord) : [];
}

export function trainingPanelLabel(key: string, fallback: string): string {
    const value = t(key);
    return value && value !== key ? value : fallback;
}

export function text(value: unknown, fallback = ''): string {
    return escapeHtml(String(value ?? fallback));
}

export function attr(value: unknown, fallback = ''): string {
    return escapeAttr(String(value ?? fallback));
}

export function itemId(item: TrainingItemRecord, fallback: string): string {
    return String(item.id || item.training_id || item.certificate_id || fallback);
}

export function formatMeta(items: readonly unknown[]): string {
    const safeItems = items
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)
        .map((item) => `<span>${escapeHtml(item)}</span>`);
    return safeItems.length ? `<div class="training-card-meta">${safeItems.join('')}</div>` : '';
}

export function statusLabel(status: unknown): string {
    const normalized = String(status || 'draft').trim().toLowerCase();
    return trainingPanelLabel(`trainingPanel.status.${normalized}`, normalized || 'draft');
}

export function statusKey(status: unknown): string {
    const normalized = String(status || 'draft').trim().toLowerCase();
    return normalized.replace(/[^a-z0-9_-]+/g, '-') || 'draft';
}

export function difficultyLabel(difficulty: unknown): string {
    const normalized = String(difficulty || '').trim().toLowerCase();
    if (!normalized) return '';
    return trainingPanelLabel(`trainingPanel.difficulty.${normalized}`, normalized);
}

export function pricingLabel(pricing: unknown): string {
    const normalized = String(pricing || 'free').trim();
    if (normalized === 'free') return trainingPanelLabel('trainingPanel.pricing.free', 'Free');
    return trainingPanelLabel(`trainingPanel.pricing.${normalized}`, normalized);
}

/**
 * TRAINING-LEARNER-MIN-001 RF-3 — modalidades NUNCA como token cru na UI.
 * Mapeia tokens de sistema ("video", "written", "order-investigation", ...)
 * para rótulos humanos via i18n; fallback humanizado (hífens viram espaço,
 * inicial maiúscula) para tokens ainda sem chave.
 */
const CONTENT_TYPE_ALIASES: Record<string, string> = Object.freeze({
    written: 'text',
    markdown: 'text',
    reading: 'text',
});

export function contentTypeLabel(type: unknown): string {
    const normalized = String(type ?? '').trim().toLowerCase();
    if (!normalized) return '';
    const key = CONTENT_TYPE_ALIASES[normalized] || normalized;
    const humanized = normalized.replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase());
    return trainingPanelLabel(`trainingPanel.contentType.${key}`, humanized);
}

export function contentTypeLabels(types: unknown): string {
    const list = Array.isArray(types)
        ? types
        : typeof types === 'string'
          ? types.split(',')
          : [];
    return [...new Set(list.map(contentTypeLabel).filter(Boolean))].join(', ');
}

export function lessonCountLabel(count: unknown): string {
    const n = Math.max(0, Math.round(Number(count) || 0));
    const singular = trainingPanelLabel('trainingPanel.lessonSingular', 'lesson');
    const plural = trainingPanelLabel('trainingPanel.lessonPlural', 'lessons');
    return `${n} ${n === 1 ? singular : plural}`;
}

export function shortDate(value: unknown): string {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
        try {
            return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit' });
        } catch {
            return raw.slice(0, 10);
        }
    }
    return raw.slice(0, 24);
}

export function coercePercent(value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
}

export function renderActionButton(action: string, id: string, label: string, variant = 'primary'): string {
    const actionAttr = attr(action);
    const idAttr = attr(id);
    const labelAttr = attr(label);
    return `
        <button class="training-action-btn ${variant}" type="button"
            aria-label="${labelAttr}"
            data-training-action="${actionAttr}" data-training-id="${idAttr}">
            ${text(label)}
        </button>
    `;
}

export function renderTabContainer(title: string, contentHtml: string): string {
    const titleAttr = attr(title);
    return `
        <div class="training-tab-section" role="region" aria-label="${titleAttr}">
            <div class="training-tab-header">${escapeHtml(title)}</div>
            <div class="training-tab-content">${contentHtml}</div>
        </div>
    `;
}

export function renderEmptyState(title: string, message: string, detail = '', ctaHtml = ''): string {
    // TRAINING-LEARNER-MIN-001 RF-8f: sem o "+" órfão decorativo — o empty
    // state comunica por texto (status + o que a área faz + 1 saída).
    // T7.4: 4º parâmetro opcional injeta 1 CTA único (renderActionButton ou
    // link) reaproveitando o mesmo padrão canônico — não reintroduz ícone.
    return `
        <div class="training-empty-state">
            <div class="training-empty-title">${text(title)}</div>
            <div class="training-empty-subtitle">${text(message)}</div>
            ${detail ? `<div class="training-empty-detail">${text(detail)}</div>` : ''}
            ${ctaHtml ? `<div class="training-empty-actions">${ctaHtml}</div>` : ''}
        </div>
    `;
}
