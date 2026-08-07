// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

const MANIFEST_URL = './assets/docs/videos/docs-videos.manifest.json';

export interface VideoManifestItem {
    sectionId: string;
    title: string;
    description: string;
    poster?: string | null;
    publicUrl?: string | null;
    url?: string | null;
}

export interface VideoManifest {
    items?: VideoManifestItem[];
}

function escapeHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => {
        switch (ch) {
            case '&':
                return '&amp;';
            case '<':
                return '&lt;';
            case '>':
                return '&gt;';
            case '"':
                return '&quot;';
            case "'":
                return '&#39;';
            default:
                return ch;
        }
    });
}

function firstScreenshotAfter(anchor: unknown): HTMLElement | null {
    const anchorElement = anchor as HTMLElement | null;
    let node = anchorElement?.nextElementSibling as HTMLElement | null;
    while (node && !/^H2$/i.test(node.tagName)) {
        if (node.classList?.contains('doc-screenshot')) return node;
        node = node.nextElementSibling as HTMLElement | null;
    }
    return null;
}

function buildVideoCard(item: unknown): HTMLElement {
    const videoItem = item as VideoManifestItem;
    const card = document.createElement('section');
    card.className = 'docs-video-card';
    card.dataset.docsVideoSection = videoItem.sectionId;
    card.innerHTML = `
        <div class="docs-video-copy">
            <p class="docs-video-eyebrow">Video guia</p>
            <h3>${escapeHtml(videoItem.title)}</h3>
            <p>${escapeHtml(videoItem.description)}</p>
        </div>
        <div class="docs-video-frame">
            <video controls preload="metadata" poster="${escapeHtml(videoItem.poster || '')}">
                <source src="${escapeHtml(videoItem.publicUrl || videoItem.url || '')}" type="video/mp4">
            </video>
        </div>
        <a class="docs-video-open" href="${escapeHtml(videoItem.publicUrl || videoItem.url || '#')}" target="_blank" rel="noopener">Abrir video em nova aba</a>
    `;
    return card;
}

function insertVideo(item: unknown): void {
    const videoItem = item as VideoManifestItem;
    if (!videoItem?.sectionId || !videoItem.publicUrl) return;
    const sectionSelector = String(videoItem.sectionId).replace(/["\\]/g, '\\{{ITEM_CONTENT}}');
    if (document.querySelector(`[data-docs-video-section="${sectionSelector}"]`)) return;

    const anchor = document.getElementById(videoItem.sectionId);
    if (!anchor) return;

    const screenshot = firstScreenshotAfter(anchor);
    const card = buildVideoCard(videoItem);
    if (screenshot) {
        screenshot.insertAdjacentElement('afterend', card);
    } else {
        anchor.insertAdjacentElement('afterend', card);
    }
}

async function initDocsVideoEmbeds(): Promise<void> {
    try {
        const response = await fetch(MANIFEST_URL, { cache: 'no-cache' });
        if (!response.ok) return;
        const manifest = (await response.json()) as VideoManifest;
        for (const item of manifest.items || []) {
            insertVideo(item);
        }
    } catch (err) {
        console.warn('[docs] video manifest unavailable:', (err as Error)?.message || err);
    }
}

initDocsVideoEmbeds();