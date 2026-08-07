// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   PPTX → CURSO (glue) — LMS-PPTX-BRIDGE-001 F2

   Camada de IO (browser) que liga o `.pptx` (arquivo do usuário) à conversão
   pure-logic. Responsabilidades:
   1. descompactar o `.pptx` (ZIP `deflate-raw` via `DecompressionStream` nativo —
      mesmo precedente de `core/io/compression.ts`, SEM dependência nova);
   2. extrair o texto dos slides e os `.rels` → `_pptxParsePure.buildNormalizedSlides`;
   3. extrair as imagens (`ppt/media/*`) e REGISTRÁ-LAS no módulo Files, casando cada
      referência de imagem com a URL servida (degradação graciosa se offline/sem login);
   4. montar o `CourseDraft` via `_pptxCoursePure.slidesToCourseDraft` (F1).

   O parser e a conversão são puros (testáveis em Node). Aqui mora só o que precisa
   de browser. `readPptxToSlides` aceita um ArrayBuffer e por isso TAMBÉM roda em
   Node (DecompressionStream existe no Node ≥18) — usável em teste de integração.
   ================================================================ */

import {
    buildNormalizedSlides,
    basename,
    parseThemeColors,
    parsePresentationOrder,
    type RawSlideEntry,
} from '../../core/training/_pptxParsePure.js';
import { slidesToCourseDraft, type NormalizedSlide, type SlidesToCourseOpts } from '../../core/training/_pptxCoursePure.js';
import type { CourseDraft } from '../../core/training/_courseAuthoringPure.js';
import { createLogger } from '../helpers/logger.js';
import { CONFIG } from '../../config.js';

const log = createLogger('PptxCourseImport');

// ---------------------------------------------------------------------------
// ZIP reader (central directory + DecompressionStream) — sem dependência externa
// ---------------------------------------------------------------------------

const SIG_EOCD = 0x06054b50;
const SIG_CDH = 0x02014b50;

/**
 * True se o import de PowerPoint está disponível: (1) a feature flag
 * `LMS_PPTX_IMPORT` está ligada (rollback hatch — false desativa toda a
 * superfície) E (2) o ambiente suporta descompactar ZIP (DecompressionStream
 * nativo). A checagem da flag é defensiva: se CONFIG.FEATURES não existir,
 * trata como ligada (default da spec §8) para não quebrar ambientes de teste.
 */
export function isPptxImportSupported(): boolean {
    const flag = CONFIG?.FEATURES?.LMS_PPTX_IMPORT;
    if (flag === false) return false; // rollback hatch explícito
    return typeof DecompressionStream !== 'undefined' && typeof Response !== 'undefined' && typeof Blob !== 'undefined';
}

/** Infla um bloco `deflate-raw` via DecompressionStream nativo. */
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds);
    const ab = await new Response(stream).arrayBuffer();
    return new Uint8Array(ab);
}

/**
 * Descompacta um ZIP (ArrayBuffer) → Map<nome, bytes>. Suporta os métodos
 * `stored` (0) e `deflate` (8) — os únicos usados por `.pptx`. ZIP64 não é
 * suportado (apresentações nunca chegam a 4 GB).
 */
export async function unzip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
    const bytes = new Uint8Array(buf);
    // Menor que o registro EOCD (22 bytes) não pode ser um ZIP válido.
    if (bytes.length < 22) throw new Error('ZIP inválido: arquivo muito pequeno');
    const view = new DataView(buf);
    // Localiza o End Of Central Directory varrendo do fim (comentário ≤ 65535).
    let eocd = -1;
    const start = bytes.length - 22;
    for (let i = start; i >= 0; i--) {
        if (view.getUint32(i, true) === SIG_EOCD) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0) throw new Error('ZIP inválido: EOCD não encontrado');

    const cdCount = view.getUint16(eocd + 10, true);
    const cdOffset = view.getUint32(eocd + 16, true);
    const decoder = new TextDecoder('utf-8');

    interface CDEntry {
        name: string;
        method: number;
        compSize: number;
        localOffset: number;
    }
    const cdEntries: CDEntry[] = [];
    let p = cdOffset;
    for (let n = 0; n < cdCount; n++) {
        if (p + 46 > bytes.length || view.getUint32(p, true) !== SIG_CDH) break;
        const method = view.getUint16(p + 10, true);
        const compSize = view.getUint32(p + 20, true);
        const nameLen = view.getUint16(p + 28, true);
        const extraLen = view.getUint16(p + 30, true);
        const commentLen = view.getUint16(p + 32, true);
        const localOffset = view.getUint32(p + 42, true);
        const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
        cdEntries.push({ name, method, compSize, localOffset });
        p += 46 + nameLen + extraLen + commentLen;
    }

    const out = new Map<string, Uint8Array>();
    for (const e of cdEntries) {
        // O local header pode ter nome/extra de tamanhos diferentes do central dir.
        const lhNameLen = view.getUint16(e.localOffset + 26, true);
        const lhExtraLen = view.getUint16(e.localOffset + 28, true);
        const dataStart = e.localOffset + 30 + lhNameLen + lhExtraLen;
        const comp = bytes.subarray(dataStart, dataStart + e.compSize);
        if (e.method === 0) out.set(e.name, comp.slice());
        else if (e.method === 8) out.set(e.name, await inflateRaw(comp));
        // outros métodos (raros) são ignorados silenciosamente
    }
    return out;
}

// ---------------------------------------------------------------------------
// PPTX → slides normalizados (Node-testável: só ArrayBuffer)
// ---------------------------------------------------------------------------

/** Resultado de `readPptxToSlides`: slides + bytes das mídias por basename. */
export interface PptxReadResult {
    slides: NormalizedSlide[];
    media: Map<string, Uint8Array>;
    /** cores cruas do clrScheme do theme1.xml (T2.5) — vazio se não há tema. */
    themeColors: Record<string, string>;
}

/**
 * Lê o `.pptx` (ArrayBuffer) → `{ slides, media }`. Não toca DOM nem Files —
 * por isso roda em Node (teste de integração) e no browser.
 */
export async function readPptxToSlides(buf: ArrayBuffer): Promise<PptxReadResult> {
    const files = await unzip(buf);
    const decoder = new TextDecoder('utf-8');

    const slideEntries: RawSlideEntry[] = [];
    for (const [name, data] of files) {
        if (!/^ppt\/slides\/slide\d+\.xml$/i.test(name)) continue;
        const relsName = `ppt/slides/_rels/${basename(name)}.rels`;
        const relsBytes = files.get(relsName);
        const relsXml = relsBytes ? decoder.decode(relsBytes) : '';
        // Notas do apresentador: o .rels do slide aponta para notesSlideN.xml.
        const notesTarget = /Target="([^"]*notesSlides\/notesSlide\d+\.xml)"/i.exec(relsXml)?.[1];
        let notesXml = '';
        if (notesTarget) {
            const notesName = `ppt/${notesTarget.replace(/^\.\.\//, '')}`;
            const notesBytes = files.get(notesName) || files.get(`ppt/notesSlides/${basename(notesTarget)}`);
            if (notesBytes) notesXml = decoder.decode(notesBytes);
        }
        slideEntries.push({ path: name, slideXml: decoder.decode(data), relsXml, notesXml });
    }
    // T2.7 — ordem real dos slides pelo sldIdLst do presentation.xml (não por
    // nome de arquivo). Sem presentation.xml/rels, o build cai no fallback por número.
    const presBytes = files.get('ppt/presentation.xml');
    const presRelsBytes = files.get('ppt/_rels/presentation.xml.rels');
    const order =
        presBytes && presRelsBytes
            ? parsePresentationOrder(decoder.decode(presBytes), decoder.decode(presRelsBytes))
            : [];
    const slides = buildNormalizedSlides(slideEntries, order);

    const media = new Map<string, Uint8Array>();
    for (const [name, data] of files) {
        if (/^ppt\/media\//i.test(name)) media.set(basename(name), data);
    }

    // T2.5 — paleta crua do tema efetivo (theme1.xml é o do 1º master).
    const themeBytes = files.get('ppt/theme/theme1.xml');
    const themeColors = themeBytes ? parseThemeColors(decoder.decode(themeBytes)) : {};
    return { slides, media, themeColors };
}

// ---------------------------------------------------------------------------
// Import completo (browser): pptx → CourseDraft com imagens no Files
// ---------------------------------------------------------------------------

/** MIME por extensão de imagem (fallback octet-stream). */
function mimeForImage(ref: string): string {
    const ext = (ref.split('.').pop() || '').toLowerCase();
    const map: Record<string, string> = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        webp: 'image/webp',
        bmp: 'image/bmp',
        svg: 'image/svg+xml',
        tiff: 'image/tiff',
    };
    return map[ext] || 'application/octet-stream';
}

/** Resumo do import (consumido pela UI p/ o toast). */
export interface PptxImportSummary {
    slideCount: number;
    /** imagens enviadas ao módulo Files (logado). */
    imagesInFiles: number;
    /** imagens embutidas na lição como data URI (offline — sempre aparecem). */
    imagesEmbedded: number;
    /** referências de imagem sem bytes (quebradas). */
    imagesPending: number;
    /** assets de imagem importados SÓ por referência via rels (T2.6 — não renderizados na lição). */
    assetsByReference: number;
    readabilityWarnings: number;
}

export interface PptxImportResult {
    draft: CourseDraft;
    summary: PptxImportSummary;
    /** paleta crua do tema do PPT (T2.5), quando o deck tem theme1.xml. */
    themeColors?: Record<string, string>;
}

/**
 * Importa um `.pptx` (File do browser) → `{ draft, summary }`. Registra as imagens
 * referenciadas no módulo Files e casa cada referência com a URL servida. Se o
 * registro falhar (offline/sem login), a imagem fica como placeholder `files/<ref>`
 * e é contada em `imagesPending` (o texto do curso é importado integralmente —
 * fidelidade-first).
 */
export async function importPptxToCourseDraft(
    file: File,
    opts: SlidesToCourseOpts = {},
): Promise<PptxImportResult> {
    if (!isPptxImportSupported()) {
        throw new Error('Ambiente sem suporte a DecompressionStream — importação de .pptx indisponível.');
    }
    const buf = await file.arrayBuffer();
    const { slides, media, themeColors } = await readPptxToSlides(buf);

    // Conjunto de imagens efetivamente referenciadas pelas lições (renderizadas)
    // + assets por referência (T2.6 — só via rels, nunca embutidos no curso).
    const rendered = new Set<string>();
    for (const s of slides) for (const r of s.imageRefs || []) rendered.add(r);
    const referenced = new Set<string>(rendered);
    for (const s of slides) for (const r of s.assetRefs || []) referenced.add(r);

    const urlByRef = new Map<string, string>();
    let imagesInFiles = 0;
    let imagesEmbedded = 0;
    let imagesPending = 0;
    let assetsByReference = 0;

    if (referenced.size > 0) {
        // Importa o Files sob demanda (mantém o handler enxuto se não houver imagem).
        let register: any = null;
        let getDownloadUrl: any = null;
        try {
            const fm: any = await import('../files/fileManager.js' as string);
            register = fm.register;
            getDownloadUrl = fm.getDownloadUrl;
        } catch (e: any) {
            log.debug('files module indisponível:', e?.message || e);
        }
        for (const ref of referenced) {
            const bytes = media.get(ref);
            if (!bytes) {
                imagesPending++; // referência sem bytes (quebrada)
                continue;
            }
            // 1) Preferência: módulo Files (logado) — não incha a chave .ecbt.
            let placed = false;
            if (register) {
                try {
                    const imgFile = new File([bytes as BlobPart], ref, { type: mimeForImage(ref) });
                    const res: any = await register(imgFile, { source: 'pptx-import', tags: ['pptx', 'course-image'] });
                    const id = res?.ok ? res.data?.id : null;
                    if (id && getDownloadUrl) {
                        const urlRes: any = await getDownloadUrl(id);
                        const url = urlRes?.ok ? urlRes.data?.url : null;
                        if (url) {
                            urlByRef.set(ref, url);
                            imagesInFiles++;
                            placed = true;
                        }
                    }
                } catch (e: any) {
                    log.debug('register image failed:', ref, e?.message || e);
                }
            }
            // 2) Fallback: embute a imagem como data URI — assim ela SEMPRE aparece
            //    na lição (offline/sem login), preservando a fidelidade visual do slide.
            //    T2.6: SÓ para imagens renderizadas no corpo — asset por referência
            //    nunca vira binário dentro do curso (volume de decks reais: 80+ mídias).
            if (!placed) {
                if (rendered.has(ref)) {
                    urlByRef.set(ref, bytesToDataUri(bytes, mimeForImage(ref)));
                    imagesEmbedded++;
                } else {
                    assetsByReference++;
                }
            } else if (!rendered.has(ref)) {
                assetsByReference++;
            }
        }
    }

    const courseTitle = opts.title || stripExt(file.name) || 'Curso importado';
    const result = slidesToCourseDraft(slides, {
        ...opts,
        title: courseTitle,
        themeColors,
        imageUrlResolver: (ref: string) => urlByRef.get(ref) || `files/${ref}`,
    });

    const importResult: PptxImportResult = {
        draft: result.draft,
        summary: {
            slideCount: slides.length,
            imagesInFiles,
            imagesEmbedded,
            imagesPending,
            assetsByReference,
            readabilityWarnings: result.readabilityWarnings.length,
        },
    };
    if (result.themeColors) importResult.themeColors = result.themeColors;
    return importResult;
}

/** Remove a extensão de um nome de arquivo (`Módulo 01.pptx` → `Módulo 01`). */
function stripExt(name: string): string {
    return String(name || '').replace(/\.[a-z0-9]+$/i, '').trim();
}

/** Converte bytes em data URI base64 (chunked p/ não estourar a pilha do btoa). */
function bytesToDataUri(bytes: Uint8Array, mime: string): string {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
    }
    return `data:${mime};base64,${btoa(binary)}`;
}
