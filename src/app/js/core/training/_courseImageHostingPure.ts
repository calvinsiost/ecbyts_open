// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   COURSE IMAGE HOSTING (pure) — LMS-PPTX-BRIDGE-001 F6 (chave leve)

   Um curso "fiel ao slide" embute a imagem de cada slide como DATA URI no
   markdown da lição (~5 MB no Módulo 01). Isso é ótimo para usar/editar offline,
   mas pesado demais para uma chave .ecbt compartilhável (chaves devem ser leves —
   imagens pertencem ao módulo Files).

   Estas funções PURAS fazem a ponte: coletam os data URIs embutidos (para o glue
   hospedá-los no Files) e RELINKAM o markdown trocando cada data URI pela URL
   hospedada — produzindo um curso "leve" cujo `.ecbt` cabe numa chave.

   PURE: sem IO/DOM/Files. O upload em si é responsabilidade do glue (utils/ui/
   lmsAuthoringModal), que injeta o mapa data-URI → URL. Testável isoladamente.
   ================================================================ */

/** Uma lição com markdown (subconjunto de LessonDraft suficiente p/ relink). */
export interface MarkdownLesson {
    id: string;
    markdown?: string | null;
    [k: string]: unknown;
}

/** Uma imagem embutida encontrada no markdown das lições. */
export interface EmbeddedImage {
    /** o data URI completo (data:image/...;base64,...). */
    dataUri: string;
    /** MIME extraído (ex.: 'image/jpeg'). */
    mime: string;
    /** nº de lições que referenciam este data URI. */
    refCount: number;
    /** tamanho aproximado em bytes (decodificado do base64). */
    approxBytes: number;
}

const DATA_URI_RE = /data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/gi;

/** Tamanho aproximado em bytes de um payload base64 (4 chars ≈ 3 bytes). */
function base64Bytes(b64: string): number {
    const len = b64.length;
    const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((len * 3) / 4) - padding);
}

/**
 * Coleta os data URIs de imagem ÚNICOS embutidos no markdown das lições.
 * Dedup por data URI; conta refs e estima bytes. Ordem estável (1ª ocorrência).
 */
export function collectEmbeddedImages(lessons: MarkdownLesson[]): EmbeddedImage[] {
    const byUri = new Map<string, EmbeddedImage>();
    const order: string[] = [];
    for (const lesson of Array.isArray(lessons) ? lessons : []) {
        const md = typeof lesson?.markdown === 'string' ? lesson.markdown : '';
        if (!md) continue;
        DATA_URI_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = DATA_URI_RE.exec(md)) !== null) {
            const dataUri = m[0];
            const mime = (m[1] || 'image/*').toLowerCase();
            const b64 = m[2] || '';
            const existing = byUri.get(dataUri);
            if (existing) {
                existing.refCount += 1;
            } else {
                byUri.set(dataUri, { dataUri, mime, refCount: 1, approxBytes: base64Bytes(b64) });
                order.push(dataUri);
            }
        }
    }
    return order.map((u) => byUri.get(u)!);
}

/** Soma os bytes aproximados das imagens embutidas (peso que sai da chave ao hospedar). */
export function embeddedImageWeight(lessons: MarkdownLesson[]): number {
    return collectEmbeddedImages(lessons).reduce((a, img) => a + img.approxBytes, 0);
}

/**
 * Relinka o markdown das lições trocando cada data URI pela URL hospedada do mapa.
 * data URIs sem entrada no mapa são preservados (não quebra a lição). Retorna NOVAS
 * lições (não muta a entrada). `replacedCount` = nº de data URIs distintos trocados.
 */
export function relinkImages(
    lessons: MarkdownLesson[],
    urlByDataUri: Map<string, string> | Record<string, string>,
): { lessons: MarkdownLesson[]; replacedCount: number; remainingCount: number } {
    const get = (k: string): string | undefined =>
        urlByDataUri instanceof Map ? urlByDataUri.get(k) : (urlByDataUri as Record<string, string>)[k];
    const replaced = new Set<string>();
    const remaining = new Set<string>();
    const out = (Array.isArray(lessons) ? lessons : []).map((lesson) => {
        const md = typeof lesson?.markdown === 'string' ? lesson.markdown : '';
        if (!md) return { ...lesson };
        const nextMd = md.replace(DATA_URI_RE, (full) => {
            const url = get(full);
            if (url) {
                replaced.add(full);
                return url;
            }
            remaining.add(full);
            return full;
        });
        return { ...lesson, markdown: nextMd };
    });
    return { lessons: out, replacedCount: replaced.size, remainingCount: remaining.size };
}
