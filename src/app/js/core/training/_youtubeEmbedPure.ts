// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   YOUTUBE EMBED — pure logic (Training Module LMS, Fase C vídeo)

   Parse de URL do YouTube (todas as formas comuns) → videoId estável,
   e construção de URL de embed PRIVACY-ENHANCED (youtube-nocookie.com:
   não grava cookies de tracking até o play, recomendado LGPD/GDPR).

   Aceita: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID,
   youtube.com/shorts/ID, youtube.com/live/ID, e o ID nu (11 chars).
   Rejeita qualquer host não-YouTube (anti-SSRF/clickjacking — o player
   só embeda YouTube; outros provedores ficam fora desta capacidade).

   Pure: sem DOM, sem rede. Testável via node:test.
   ================================================================ */

/** videoId do YouTube: 11 chars [A-Za-z0-9_-]. */
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

const YT_HOSTS = new Set([
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'youtube-nocookie.com',
    'www.youtube-nocookie.com',
    'youtu.be',
]);

/**
 * Extrai o videoId de uma URL do YouTube (ou de um ID nu).
 * @returns videoId (11 chars) ou null se não for YouTube válido.
 */
function isAllowedProtocol(protocol: string): boolean {
    return protocol === 'https:' || protocol === 'http:';
}

function extractFromShortUrl(url: URL): string | null {
    const id = url.pathname.split('/').filter(Boolean)[0];
    return id && VIDEO_ID_RE.test(id) ? id : null;
}

function extractFromStandardUrl(url: URL): string | null {
    const v = url.searchParams.get('v');
    if (v && VIDEO_ID_RE.test(v)) return v;
    const segs = url.pathname.split('/').filter(Boolean);
    const kind = segs[0];
    const seg1 = segs[1];
    if (segs.length >= 2 && kind && ['embed', 'shorts', 'live', 'v'].includes(kind)) {
        return seg1 && VIDEO_ID_RE.test(seg1) ? seg1 : null;
    }
    return null;
}

export function parseYouTubeId(input: unknown): string | null {
    if (typeof input !== 'string') return null;
    const raw = input.trim();
    if (!raw) return null;

    // ID nu
    if (VIDEO_ID_RE.test(raw)) return raw;

    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return null;
    }
    if (!isAllowedProtocol(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    if (!YT_HOSTS.has(host)) return null;

    if (host === 'youtu.be') return extractFromShortUrl(url);
    return extractFromStandardUrl(url);
}

/** True se a entrada é uma URL/ID de YouTube parseável. */
export function isYouTubeUrl(input: unknown): boolean {
    return parseYouTubeId(input) !== null;
}

export interface EmbedOptions {
    /** segundo inicial (deep-link de timestamp). */
    readonly startSeconds?: number;
    /** não autoplay por padrão (consentimento/UX). */
    readonly autoplay?: boolean;
}

/**
 * URL de embed privacy-enhanced (youtube-nocookie). Retorna null se a
 * entrada não for YouTube válido — o caller NÃO deve embedar nesse caso.
 */
export function buildYouTubeEmbedUrl(input: unknown, opts: EmbedOptions = {}): string | null {
    const id = parseYouTubeId(input);
    if (!id) return null;
    const params = new URLSearchParams({
        rel: '0', // não sugere vídeos de outros canais ao fim
        modestbranding: '1',
        playsinline: '1',
    });
    if (opts.autoplay) params.set('autoplay', '1');
    const start = Number(opts.startSeconds);
    if (Number.isFinite(start) && start > 0) params.set('start', String(Math.floor(start)));
    return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
}

/** URL de thumbnail (hqdefault) para cards/preview, ou null. */
export function youTubeThumbnailUrl(input: unknown): string | null {
    const id = parseYouTubeId(input);
    return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}
