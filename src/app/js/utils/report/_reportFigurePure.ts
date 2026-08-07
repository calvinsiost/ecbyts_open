// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Pure helpers para inserção de figuras no relatório (P1-9 Fase 2 / P2 figuras).
// Fontes de figura: módulo Files (imagens carregadas pelo usuário), screenshot 3D e
// gráficos. Este módulo é DOM-free e testável: build de HTML <figure> escapado +
// sanitização de src (anti-XSS) + base64 puro (sem btoa, roda em node + browser).
//
// Por que existe: Calvin pediu que figuras/elementos do report venham adicionalmente
// do módulo "Files". A inserção precisa ser segura (src sanitizado, caption escapada)
// e durável (data URL base64 sobrevive a export PDF/DOCX e à chave .ecbt).

/** Extensões de imagem aceitas para inserção como figura. */
export const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']);

/** Limite de bytes para embutir como data URL (acima disso, avisar — base64 infla ~33%). */
export const MAX_FIGURE_BYTES = 3 * 1024 * 1024; // 3 MB

const _esc = (s: unknown): string =>
    String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

/** True se a metadata de arquivo (extension/mime_type) for de imagem. */
export function isImageFile(meta: any): boolean {
    if (!meta || typeof meta !== 'object') return false;
    const ext = String(meta.extension || '').toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext)) return true;
    const mime = String(meta.mime_type || meta.mimeType || meta.type || '').toLowerCase();
    return mime.startsWith('image/');
}

/**
 * Sanitiza um src de imagem — só permite data URL de imagem raster, https, ou
 * localhost http (dev). Rejeita javascript:/file:/etc. Retorna '' se inválido.
 */
export function sanitizeImageSrc(src: unknown): string {
    const s = String(src ?? '').trim();
    if (/^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(s)) return s;
    if (/^https:\/\/[^\s"'<>]+$/i.test(s)) return s;
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/[^\s"'<>]*$/i.test(s)) return s;
    return '';
}

/** Codifica bytes em base64 (puro — roda em node + browser, sem btoa/Buffer). */
export function bytesToBase64(bytes: Uint8Array): string {
    const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let out = '';
    const len = bytes.length;
    for (let i = 0; i < len; i += 3) {
        const b0 = bytes[i] as number;
        const has1 = i + 1 < len;
        const has2 = i + 2 < len;
        const b1 = has1 ? (bytes[i + 1] as number) : 0;
        const b2 = has2 ? (bytes[i + 2] as number) : 0;
        out += B64[b0 >> 2];
        out += B64[((b0 & 3) << 4) | (b1 >> 4)];
        out += has1 ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '=';
        out += has2 ? B64[b2 & 63] : '=';
    }
    return out;
}

/** Monta um data URL de imagem a partir de bytes + mime. */
export function bytesToImageDataUrl(bytes: Uint8Array, mime: string): string {
    const m = String(mime || 'image/png').toLowerCase();
    const safeMime = /^image\/(png|jpe?g|webp|gif|svg\+xml)$/.test(m) ? m : 'image/png';
    return `data:${safeMime};base64,${bytesToBase64(bytes)}`;
}

/**
 * Monta o HTML de uma figura para inserir no relatório: <figure> com <img>
 * (src sanitizado) + <figcaption> (escapada). Numeração opcional ("Figura N — ").
 * Retorna '' se o src for inválido (fail-safe — não insere imagem insegura).
 */
export function buildFigureHtml(opts: { src: unknown; caption?: string; alt?: string; figureNumber?: number }): string {
    const safeSrc = sanitizeImageSrc(opts?.src);
    if (!safeSrc) return '';
    const caption = String(opts?.caption || '');
    const alt = String(opts?.alt || caption || 'Figura');
    const prefix = typeof opts?.figureNumber === 'number' && opts.figureNumber > 0 ? `Figura ${opts.figureNumber} — ` : '';
    const captionHtml = caption ? `<figcaption>${_esc(prefix)}${_esc(caption)}</figcaption>` : '';
    // src já sanitizado por allowlist de scheme; alt escapado. contenteditable=false
    // no <figure> evita que o cursor entre na imagem e quebre o markup.
    return `<figure class="report-figure" contenteditable="false"><img src="${safeSrc}" alt="${_esc(alt)}" />${captionHtml}</figure><p></p>`;
}

/**
 * Monta o HTML de uma figura em LAYOUT CORPORATIVO (prancha em HTML): cabeçalho com
 * projeto + nº da figura, imagem emoldurada, legenda numerada e carimbo (responsável,
 * data, marca). Estrutura pura/escapada, embutível no corpo do relatório e durável em
 * export PDF/DOCX. Classes `.report-fc-*` estilizadas em report.css.
 * Retorna '' se o src for inválido (fail-safe).
 */
export function buildCorporateFigureHtml(opts: {
    src: unknown;
    caption?: string;
    alt?: string;
    figureNumber?: number;
    projectName?: string;
    responsible?: string;
    date?: string;
    brand?: string;
    // Origem 3D — opcional. Quando presente, a figura inserida vira clicável e o
    // editor de relatório (delegation handler) navega de volta para o objeto/foto
    // na cena 3D que originou a figura.
    providerId?: string;
    candidateId?: string;
    scope?: {
        elementId?: string | null;
        groupId?: string | null;
        plumeId?: string | null;
        photoId?: string | null;
    } | null;
    figureTypeId?: string | null;
    subset?: Readonly<Record<string, unknown>> | null;
}): string {
    const safeSrc = sanitizeImageSrc(opts?.src);
    if (!safeSrc) return '';
    const caption = String(opts?.caption || '');
    const alt = String(opts?.alt || caption || 'Figura');
    const n = typeof opts?.figureNumber === 'number' && opts.figureNumber > 0 ? opts.figureNumber : 0;
    const numLabel = n > 0 ? `FIGURA ${n}` : 'FIGURA';
    const captionText = n > 0 ? `Figura ${n} — ${caption}` : caption;
    const projectName = String(opts?.projectName || '').trim() || 'Projeto';
    const responsible = String(opts?.responsible || '').trim();
    const date = String(opts?.date || '').trim();
    const brand = String(opts?.brand || 'ecbyts');
    const captionHtml = caption ? `<figcaption class="report-fc-caption">${_esc(captionText)}</figcaption>` : '';
    const stampCells = [
        responsible ? `<span class="report-fc-cell"><strong>Resp.:</strong> ${_esc(responsible)}</span>` : '',
        date ? `<span class="report-fc-cell"><strong>Data:</strong> ${_esc(date)}</span>` : '',
        `<span class="report-fc-cell report-fc-brand">${_esc(brand)}</span>`,
    ].join('');
    // Persiste origem 3D em data-attrs (sobrevive a serialização do editor + .ecbt).
    // CSS adiciona cursor:pointer + outline:focus quando data-figure-provider existe.
    const provId = String(opts?.providerId || '').trim();
    const candId = String(opts?.candidateId || '').trim();
    const scope = opts?.scope || {};
    const figureTypeId = String(opts?.figureTypeId || '').trim();
    const subsetJson = serializeFigureSubset(opts?.subset);
    const dataAttrs = [
        provId ? `data-figure-provider="${_esc(provId)}"` : '',
        candId ? `data-figure-candidate="${_esc(candId)}"` : '',
        figureTypeId ? `data-figure-type="${_esc(figureTypeId)}"` : '',
        subsetJson ? `data-figure-subset="${_esc(subsetJson)}"` : '',
        scope.elementId ? `data-figure-element-id="${_esc(scope.elementId)}"` : '',
        scope.groupId ? `data-figure-group-id="${_esc(scope.groupId)}"` : '',
        scope.plumeId ? `data-figure-plume-id="${_esc(scope.plumeId)}"` : '',
        scope.photoId ? `data-figure-photo-id="${_esc(scope.photoId)}"` : '',
    ].filter(Boolean).join(' ');
    const linkedClass = provId ? ' report-figure-linked' : '';
    const linkedAttrs = provId ? ' role="button" tabindex="0" title="Clique para ir ao modelo 3D"' : '';
    // Botão de edição (✎) no header — só aparece quando a figura carrega providerId
    // (origem rastreável). stopPropagation no click previne disparar o navigate-to-3D.
    const editBtn = provId
        ? `<button type="button" class="report-fc-edit-btn" title="Editar figura (legenda, número, escala, recorte)" aria-label="Editar figura">&#9998;</button>`
        : '';
    return (
        `<figure class="report-figure report-figure-corporate${linkedClass}" contenteditable="false"${dataAttrs ? ' ' + dataAttrs : ''}${linkedAttrs}>` +
        `<div class="report-fc-header"><span class="report-fc-project">${_esc(projectName)}</span>` +
        `<span class="report-fc-number">${_esc(numLabel)}</span>${editBtn}</div>` +
        `<div class="report-fc-img"><img src="${safeSrc}" alt="${_esc(alt)}" /></div>` +
        captionHtml +
        `<div class="report-fc-stamp">${stampCells}</div>` +
        `</figure><p></p>`
    );
}

function serializeFigureSubset(subset: unknown): string {
    if (!subset || typeof subset !== 'object' || Array.isArray(subset)) return '';
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(subset as Record<string, unknown>).sort()) {
        const value = (subset as Record<string, unknown>)[key];
        if (value === null || value === undefined) continue;
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            out[key] = value;
        }
    }
    return Object.keys(out).length ? JSON.stringify(out) : '';
}

/** Mensagem de aviso de tamanho (ou '' se ok). */
export function figureSizeWarning(bytes: number): string {
    if (typeof bytes === 'number' && bytes > MAX_FIGURE_BYTES) {
        const mb = (bytes / (1024 * 1024)).toFixed(1);
        return `Imagem grande (${mb} MB) — pode deixar o relatório pesado.`;
    }
    return '';
}
