// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   PPTX → CURSO (pure) — LMS-PPTX-BRIDGE-001 F1

   Converte uma apresentação de PowerPoint JÁ NORMALIZADA (lista de slides com
   texto + níveis de bullet + referências de imagem) num `CourseDraft` do LMS
   (1 slide = 1 lição do tipo 'written'). Reusa 100% o `_courseAuthoringPure`.

   BOUNDARY (ADR A1): esta camada NUNCA vê XML nem ZIP — só `NormalizedSlide[]`.
   A mecânica de descompactar o `.pptx` e parsear o `slideN.xml` é IO de browser
   e vive em `utils/handlers/pptxCourseImport.ts` (glue). Isso mantém o IP testável
   em Node, sem DOM/ZIP.

   FIDELIDADE-PRIMEIRO (ADR A2): por padrão a conversão é 1:1 — preserva ordem,
   título, parágrafos e níveis de bullet sem perder nada. O modo `readability`
   (assertion-evidence, Michael Alley) é opt-in e NÃO-DESTRUTIVO: ele só
   reestrutura parágrafos longos em 1 bullet por frase e EMITE UM AVISO quando um
   slide passa de ~6 bullets — jamais apaga conteúdo (Calvin: "exatamente o mesmo
   conteúdo do curso").

   IMAGENS (ADR: KQ2): as referências de imagem (ex.: 'image1.png') são resolvidas
   por um `imageUrlResolver` injetável. O glue passa um resolver que casa cada ref
   com a URL servida pelo módulo Files; o default `files/<ref>` é só placeholder
   para testes.

   PURE: sem IO/DOM/THREE. Toda saída é um NOVO objeto. Testável isoladamente em
   tests/pptx-course.test.mjs.
   ================================================================ */

import { emptyCourseDraft, addLesson } from './_courseAuthoringPure.js';
import type { CourseDraft, EmptyCourseOpts } from './_courseAuthoringPure.js';

// ---------------------------------------------------------------------------
// Tipos de entrada (modelo de slide normalizado — sem XML/ZIP)
// ---------------------------------------------------------------------------

/** Formatação de UM run de texto (`<a:r>`) — T2.2 fidelidade por run. */
export interface SlideRunFmt {
    text: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    /** tamanho da fonte em pt (sz OOXML ÷ 100). */
    sizePt?: number;
    /** cor sólida do run em hex RRGGBB (sem '#'). */
    color?: string;
}

/** Bullet/numeração de um parágrafo (T2.2), explícito ou herdado de layout/master. */
export interface ParagraphBullet {
    type: 'none' | 'char' | 'autoNum';
    /** caractere do bullet (buChar). */
    char?: string;
    /** tipo da numeração (buAutoNum type, ex. 'arabicPeriod'). */
    numType?: string;
    /** início da numeração (buAutoNum startAt). */
    startAt?: number;
}

/** Um parágrafo de slide com seu nível de indentação (0 = topo). */
export interface SlideParagraph {
    text: string;
    /** nível de bullet (0..N), espelha o atributo `lvl` do OOXML. */
    level: number;
    /** runs com formatação individual (T2.2) — presente só quando agrega informação. */
    runs?: SlideRunFmt[];
    /** alinhamento do parágrafo (algn OOXML: l|ctr|r|just|dist). */
    align?: string;
    /** bullet/numeração resolvido (explícito no pPr ou herdado layout→master). */
    bullet?: ParagraphBullet;
    /** margem esquerda em EMU (marL). */
    marL?: number;
}

/** Geometria absoluta de um shape do slide (T2.3) — EMU, pós-composição de grupos. */
export interface SlideShapeGeometry {
    /** tipo do elemento OOXML de origem. */
    kind: 'sp' | 'pic' | 'graphicFrame';
    /** posição absoluta no slide, em EMU (a:off composto por grpSp). */
    x: number;
    y: number;
    /** dimensões absolutas em EMU (a:ext, escaladas pela composição de grupos). */
    cx: number;
    cy: number;
    /** z-order: ordem de documento no spTree (0 = fundo). */
    z: number;
    /** nome do shape (p:cNvPr name), quando presente. */
    name?: string;
}

/** Um slide normalizado: texto + níveis + referências de mídia. */
export interface NormalizedSlide {
    /** posição 1-based na apresentação. */
    index: number;
    /** placeholder de título do slide, se houver. */
    title?: string;
    paragraphs: SlideParagraph[];
    /** nomes de mídia já resolvidos (ex.: 'image1.png'). */
    imageRefs?: string[];
    /** imagens do slide referenciadas SÓ via rels (T2.6) — assets por referência, fora do corpo da lição. */
    assetRefs?: string[];
    /** vídeos do slide (T2.1): basename da mídia embutida ('media1.mp4') ou URL de vídeo linkado. */
    videoRefs?: string[];
    /** tabelas do slide, já pré-renderizadas em markdown (F4 fidelidade). */
    tables?: string[];
    /** speaker notes do slide (F4 — entram no corpo da lição). */
    notes?: string;
    /** geometria absoluta + z-order dos shapes (T2.3 — habilita preview posicional). */
    shapes?: SlideShapeGeometry[];
    /** fundo do slide (T2.4), próprio ou herdado do layout/master. */
    background?: SlideBackground;
    /** slide oculto na apresentação (`<p:sld show="0">`) — preservado como hidden (T2.7). */
    hidden?: boolean;
}

/** Fundo de um slide (T2.4): imagem full-bleed OU cor sólida, com a origem. */
export interface SlideBackground {
    /** basename da mídia de fundo (ex.: 'image7.jpg'), quando blipFill. */
    imageRef?: string;
    /** cor sólida em hex RRGGBB (sem '#'), quando solidFill. */
    color?: string;
    /** de onde o fundo veio na cadeia de herança. */
    source: 'slide' | 'layout' | 'master';
}

/** Opções de conversão. */
export interface SlidesToCourseOpts {
    ownerId?: string;
    /** id do curso (default derivado do clock). */
    id?: string;
    /** título do curso (default 'Curso importado'). */
    title?: string;
    description?: string;
    category?: string;
    difficulty?: 'beginner' | 'intermediate' | 'advanced';
    language?: string;
    /** ref de imagem → URL final. Default: 'files/' + ref. */
    imageUrlResolver?: (ref: string) => string;
    /** ref de vídeo → URL final (T2.1). Default: URLs passam; mídia vira 'files/' + ref. */
    videoUrlResolver?: (ref: string) => string;
    /** rótulo do link de vídeo na lição (i18n; default pt-BR 'Vídeo'). */
    videoLabel?: string;
    /** modo legibilidade (assertion-evidence) — opt-in, não-destrutivo. */
    readability?: boolean;
    /** palavras por minuto p/ estimativa de duração (default 160). */
    wordsPerMinute?: number;
    /** rótulo da seção de notas do apresentador (i18n; default pt-BR). */
    notesHeading?: string;
    /** clock injetável p/ determinismo em testes. */
    clock?: () => string;
    /** cores cruas do clrScheme do tema (T2.5) — gravadas no resultado como paleta do PPT. */
    themeColors?: Record<string, string>;
}

/** Mapa de quais imagens cada lição referencia (o glue casa com o Files). */
export interface MediaManifestEntry {
    lessonId: string;
    refs: string[];
}

/** Aviso de legibilidade (slide passou do recomendado de bullets). */
export interface ReadabilityWarning {
    /** index 1-based do slide/lição. */
    lessonIndex: number;
    bulletCount: number;
}

/** Resultado da conversão. */
export interface SlidesToCourseResult {
    draft: CourseDraft;
    mediaManifest: MediaManifestEntry[];
    readabilityWarnings: ReadabilityWarning[];
    /** paleta crua do tema do PPT (T2.5) — presente quando o glue extraiu o clrScheme. */
    themeColors?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Limite de legibilidade (assertion-evidence): acima disto, AVISA (não apaga). */
export const MAX_BULLETS_RECOMMENDED = 6;
const DEFAULT_WPM = 160;
const TITLE_MAX_CHARS = 80;

// ---------------------------------------------------------------------------
// Helpers puros (exportados p/ teste granular)
// ---------------------------------------------------------------------------

function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.trim().length > 0;
}

/** Resolver default de imagem (placeholder — o glue injeta o real do Files). */
export function defaultImageResolver(ref: string): string {
    return `files/${String(ref || '').trim()}`;
}

/**
 * Divide um texto em frases (heurística simples: pontuação final seguida de
 * espaço/fim). Usado SÓ no modo legibilidade. Preserva a pontuação na frase.
 * Nunca perde caracteres — a concatenação das frases reconstrói o texto.
 */
export function splitSentences(text: string): string[] {
    const s = String(text || '').trim();
    if (!s) return [];
    // Quebra após . ! ? (e reticências) quando seguidas de espaço.
    const parts = s.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g);
    if (!parts) return [s];
    return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/**
 * Deriva o título da lição a partir do slide:
 * placeholder de título > 1º parágrafo (truncado) > `Slide N`.
 * Retorna também se o título veio do 1º parágrafo (p/ não duplicar no corpo).
 */
export function deriveLessonTitle(slide: NormalizedSlide): { title: string; fromParagraph: boolean } {
    if (isNonEmptyString(slide.title)) {
        return { title: slide.title.trim(), fromParagraph: false };
    }
    const first = slide.paragraphs && slide.paragraphs.find((p) => isNonEmptyString(p.text));
    if (first) {
        const t = first.text.trim();
        const title = t.length > TITLE_MAX_CHARS ? `${t.slice(0, TITLE_MAX_CHARS - 1).trimEnd()}…` : t;
        return { title, fromParagraph: true };
    }
    return { title: `Slide ${slide.index}`, fromParagraph: false };
}

/** Conta palavras (espaço-separadas) de um texto. */
function countWords(text: string): number {
    const s = String(text || '').trim();
    if (!s) return 0;
    return s.split(/\s+/).length;
}

/** Estimativa determinística de minutos: ceil(words / wpm), mínimo 1. */
export function estimateMinutes(words: number, wpm: number = DEFAULT_WPM): number {
    const w = Math.max(0, Math.floor(Number(words) || 0));
    const perMin = Math.max(1, Math.floor(Number(wpm) || DEFAULT_WPM));
    return Math.max(1, Math.ceil(w / perMin));
}

/** Indentação markdown p/ lista aninhada: 2 espaços por nível (clamp ≥0). */
function indentFor(level: number): string {
    const lvl = Math.max(0, Math.floor(Number(level) || 0));
    return '  '.repeat(lvl);
}

interface BuiltSlide {
    markdown: string;
    words: number;
    bulletCount: number;
    refs: string[];
    title: string;
}

/** Renderiza o texto de um parágrafo preservando negrito/itálico por run (T2.2). */
function renderParagraphText(p: SlideParagraph): string {
    if (!Array.isArray(p.runs) || p.runs.length === 0) return p.text;
    return p.runs
        .map((r) => {
            const core = r.text.trim();
            if (!core) return r.text; // só espaço/quebra: preserva como está
            const mark = r.bold && r.italic ? '***' : r.bold ? '**' : r.italic ? '*' : '';
            if (!mark) return r.text;
            const lead = /^\s/.test(r.text) ? ' ' : '';
            const trail = /\s$/.test(r.text) ? ' ' : '';
            return `${lead}${mark}${core}${mark}${trail}`;
        })
        .join('')
        .replace(/\n/g, '<br>')
        .trim();
}

/**
 * Constrói o markdown de UM slide (fidelidade-primeiro). No modo readability,
 * parágrafos com ≥2 frases viram 1 bullet por frase (mesmo nível), sem apagar.
 */
export function buildSlideMarkdown(slide: NormalizedSlide, opts: SlidesToCourseOpts = {}): BuiltSlide {
    const resolver = typeof opts.imageUrlResolver === 'function' ? opts.imageUrlResolver : defaultImageResolver;
    const readability = !!opts.readability;
    const { title, fromParagraph } = deriveLessonTitle(slide);

    const lines: string[] = [`# ${title}`];
    let words = countWords(title);
    let bulletCount = 0;

    const paragraphs = Array.isArray(slide.paragraphs) ? slide.paragraphs : [];
    // Contador de numeração por nível (T2.2 — bullets autoNum viram lista ordenada).
    const autoNumByLevel = new Map<number, number>();
    paragraphs.forEach((p, i) => {
        // Se o título veio do 1º parágrafo, não o repete como bullet (promovido, não perdido).
        if (fromParagraph && i === 0) return;
        if (!isNonEmptyString(p.text)) return;
        const indent = indentFor(p.level);
        words += countWords(p.text);
        // T2.2 — texto com formatação por run (negrito/itálico) quando disponível.
        const rendered = renderParagraphText(p);
        // T2.2 — marcador: numeração (autoNum) com contador por nível; senão '-'.
        let marker = '-';
        if (p.bullet?.type === 'autoNum') {
            const next = (autoNumByLevel.get(p.level) ?? (p.bullet.startAt ?? 1) - 1) + 1;
            autoNumByLevel.set(p.level, next);
            marker = `${next}.`;
        } else {
            autoNumByLevel.delete(p.level);
        }
        const pieces = readability ? splitSentences(rendered) : [rendered.trim()];
        for (const piece of pieces) {
            lines.push(`${indent}${marker} ${piece}`);
            bulletCount += 1;
        }
    });

    // Tabelas (F4): já vêm pré-renderizadas em markdown pelo parser.
    const tables = (Array.isArray(slide.tables) ? slide.tables : []).filter(isNonEmptyString);
    for (const table of tables) {
        lines.push('', table);
        words += countWords(table);
    }

    const refs = (Array.isArray(slide.imageRefs) ? slide.imageRefs : []).filter(isNonEmptyString);
    if (refs.length > 0) {
        lines.push(''); // separa imagens dos bullets
        for (const ref of refs) {
            const alt = title || ref.replace(/\.[a-z0-9]+$/i, '');
            lines.push(`![${alt}](${resolver(ref)})`);
        }
    }

    // Vídeos (T2.1): cada ref vira um link de vídeo na lição (o glue resolve a URL).
    const videoRefs = (Array.isArray(slide.videoRefs) ? slide.videoRefs : []).filter(isNonEmptyString);
    if (videoRefs.length > 0) {
        const vResolver = typeof opts.videoUrlResolver === 'function'
            ? opts.videoUrlResolver
            : (ref: string) => (/^[a-z][a-z0-9+.-]*:/i.test(ref) ? ref : `files/${ref}`);
        lines.push('');
        for (const ref of videoRefs) {
            const name = ref.replace(/\.[a-z0-9]+$/i, '');
            lines.push(`[${opts.videoLabel || 'Vídeo'}: ${name}](${vResolver(ref)})`);
        }
    }

    // Notas do apresentador (F4): entram como seção ao final da lição.
    if (isNonEmptyString(slide.notes)) {
        lines.push('', `## ${opts.notesHeading || 'Notas do apresentador'}`);
        for (const para of slide.notes.split(/\n+/)) {
            const t = para.trim();
            if (t) {
                lines.push(t);
                words += countWords(t);
            }
        }
    }

    return { markdown: lines.join('\n'), words, bulletCount, refs, title };
}

// ---------------------------------------------------------------------------
// Conversão principal
// ---------------------------------------------------------------------------

/**
 * Converte `NormalizedSlide[]` num `CourseDraft` (1 slide = 1 lição 'written').
 * Fidelidade 1:1 por padrão; `readability` opt-in e não-destrutivo.
 *
 * @returns `{ draft, mediaManifest, readabilityWarnings }` — o glue usa o
 *          mediaManifest p/ casar as imagens já extraídas no módulo Files.
 */
export function slidesToCourseDraft(
    slides: NormalizedSlide[],
    opts: SlidesToCourseOpts = {},
): SlidesToCourseResult {
    const clock = typeof opts.clock === 'function' ? opts.clock : undefined;
    const list = Array.isArray(slides) ? slides : [];
    const wpm = Math.max(1, Math.floor(Number(opts.wordsPerMinute) || DEFAULT_WPM));

    const courseOpts: EmptyCourseOpts = {
        title: isNonEmptyString(opts.title) ? opts.title : 'Curso importado',
        description: isNonEmptyString(opts.description) ? opts.description : 'Curso importado de uma apresentação PowerPoint.',
        category: opts.category || 'general',
        difficulty: opts.difficulty || 'beginner',
        language: opts.language || 'pt-BR',
    };
    if (isNonEmptyString(opts.id)) courseOpts.id = opts.id;
    if (clock) courseOpts.clock = clock;
    let draft = emptyCourseDraft(opts.ownerId || 'anonymous', courseOpts);

    const mediaManifest: MediaManifestEntry[] = [];
    const readabilityWarnings: ReadabilityWarning[] = [];

    list.forEach((slide) => {
        const idx = Number(slide?.index) > 0 ? Math.floor(Number(slide.index)) : mediaManifest.length + 1;
        const built = buildSlideMarkdown({ ...slide, index: idx }, opts);
        const lessonId = `lesson-slide-${idx}`;
        draft = addLesson(
            draft,
            {
                id: lessonId,
                type: 'written',
                title: built.title,
                minutes: estimateMinutes(built.words, wpm),
                markdown: built.markdown,
            },
            clock,
        );
        // T2.6 — o manifesto cobre TODOS os assets do slide: os renderizados no
        // corpo (refs) + os referenciados só via rels (assetRefs), sem duplicar.
        const assetOnly = (Array.isArray(slide.assetRefs) ? slide.assetRefs : []).filter(
            (r) => isNonEmptyString(r) && !built.refs.includes(r),
        );
        const allRefs = [...built.refs, ...assetOnly];
        if (allRefs.length > 0) {
            mediaManifest.push({ lessonId, refs: allRefs });
        }
        if (opts.readability && built.bulletCount > MAX_BULLETS_RECOMMENDED) {
            readabilityWarnings.push({ lessonIndex: idx, bulletCount: built.bulletCount });
        }
    });

    const out: SlidesToCourseResult = { draft, mediaManifest, readabilityWarnings };
    // T2.5 — grava a paleta CRUA do tema no resultado do curso importado.
    if (opts.themeColors && Object.keys(opts.themeColors).length > 0) {
        out.themeColors = { ...opts.themeColors };
    }
    return out;
}
