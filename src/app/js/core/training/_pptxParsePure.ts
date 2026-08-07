// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   PPTX PARSE (pure) — LMS-PPTX-BRIDGE-001 F2 (núcleo)

   Parser pure-logic do XML de um slide PowerPoint (OOXML / PresentationML).
   Recebe STRINGS (o XML de `ppt/slides/slideN.xml` e o de seu `.rels`) e devolve
   um `NormalizedSlide` consumível pela camada F1 (`_pptxCoursePure`).

   BOUNDARY (ADR A1): aqui NÃO há ZIP nem DOM — só parsing de string. A
   descompactação do `.pptx` e o IO do browser vivem em
   `utils/handlers/pptxCourseImport.ts`. Isso mantém o parser 100% testável em
   Node, sem `DOMParser` nem dependência externa.

   HEURÍSTICA: usa regex sobre a estrutura previsível do XML do PowerPoint
   (shapes irmãos em `<p:spTree>`). Extrai:
   - parágrafos `<a:p>` → texto (concat dos `<a:t>`) + nível (`<a:pPr lvl="N">`);
   - título: shape com placeholder `type="title|ctrTitle"` (não duplica no corpo);
   - imagens: `r:embed="rIdN"` dos `<a:blip>`, resolvidos via `.rels` → mídia.

   Grupos de shape (`<p:grpSp>`) aninhados são um caso de borda aceito (raro em
   apresentações típicas); o usuário revisa/edita após importar (fidelidade-first
   com revisão, ver spec §NOT).
   ================================================================ */

import type { NormalizedSlide, SlideParagraph, SlideRunFmt, ParagraphBullet, SlideShapeGeometry, SlideBackground } from './_pptxCoursePure.js';

// ---------------------------------------------------------------------------
// Helpers de string (puros)
// ---------------------------------------------------------------------------

/** Desfaz o escape XML básico + entidades numéricas (&#NN; / &#xHH;). */
export function xmlUnescape(s: string): string {
    return String(s || '')
        .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => safeFromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_m, d) => safeFromCodePoint(parseInt(d, 10)))
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&'); // por último (evita re-decodificar)
}

function safeFromCodePoint(cp: number): string {
    if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return '';
    try {
        return String.fromCodePoint(cp);
    } catch {
        return '';
    }
}

/** Concatena o texto de todos os `<a:t>…</a:t>` de um bloco XML (desescapado). */
function extractRunText(block: string): string {
    const out: string[] = [];
    const re = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block)) !== null) {
        out.push(xmlUnescape(m[1] ?? ''));
    }
    return out.join('');
}

/** Nível de bullet de um `<a:p>` (lê `lvl` do primeiro `<a:pPr>`; default 0). */
function paragraphLevel(paragraphBlock: string): number {
    const m = /<a:pPr\b[^>]*\blvl="(\d+)"/.exec(paragraphBlock);
    return m ? Math.max(0, parseInt(m[1] ?? '0', 10) || 0) : 0;
}

/** Extrai a formatação de UM run `<a:r>` (rPr: b/i/u, sz, cor sólida) — T2.2. */
function runFormat(runBlock: string): SlideRunFmt {
    const fmt: SlideRunFmt = { text: extractRunText(runBlock) };
    // atributos (grupo 1) + filhos (grupo 2, quando não self-closing)
    const rprM = /<a:rPr\b([^>]*?)(?:\/>|>([\s\S]*?)<\/a:rPr>)/.exec(runBlock);
    if (!rprM) return fmt;
    const rpr = `${rprM[1] ?? ''} ${rprM[2] ?? ''}`;
    if (/\bb="1"/.test(rpr)) fmt.bold = true;
    if (/\bi="1"/.test(rpr)) fmt.italic = true;
    if (/\bu="(?!none)[^"]+"/.test(rpr)) fmt.underline = true;
    const sz = /\bsz="(\d+)"/.exec(rpr);
    if (sz) fmt.sizePt = parseInt(sz[1] ?? '0', 10) / 100;
    const color = /<a:solidFill>\s*<a:srgbClr\b[^>]*\bval="([0-9a-fA-F]{6})"/.exec(rpr);
    if (color && color[1]) fmt.color = color[1].toUpperCase();
    return fmt;
}

/** Bullet explícito do `<a:pPr>` de um parágrafo (buNone/buChar/buAutoNum), ou null. */
export function parseExplicitBullet(paragraphBlock: string): ParagraphBullet | null {
    const pprM = /<a:pPr\b[^>]*?(?:\/>|>([\s\S]*?)<\/a:pPr>)/.exec(paragraphBlock);
    const ppr = pprM?.[1] ?? '';
    if (/<a:buNone\s*\/>/.test(ppr)) return { type: 'none' };
    const auto = /<a:buAutoNum\b([^>]*)\/>/.exec(ppr);
    if (auto) {
        const attrs = auto[1] ?? '';
        const b: ParagraphBullet = { type: 'autoNum' };
        const t = /\btype="([^"]+)"/.exec(attrs);
        if (t && t[1]) b.numType = t[1];
        const s = /\bstartAt="(\d+)"/.exec(attrs);
        if (s) b.startAt = parseInt(s[1] ?? '1', 10) || 1;
        return b;
    }
    const ch = /<a:buChar\b[^>]*\bchar="([^"]*)"/.exec(ppr);
    if (ch) return { type: 'char', char: xmlUnescape(ch[1] ?? '') };
    return null;
}

/** True se runs[] agrega informação além do texto plano (formatação/quebra). */
function runsWorthEmitting(runs: SlideRunFmt[]): boolean {
    return runs.some(
        (r) =>
            r.bold || r.italic || r.underline || r.sizePt !== undefined || r.color !== undefined || r.text.includes('\n'),
    );
}

/** Herança de bullet por nível (T2.2): lookup nos `lvlNpPr` de um bloco de estilo. */
export function bulletFromStyleBlock(styleBlock: string, lvl: number): ParagraphBullet | null {
    const n = Math.max(0, lvl) + 1; // lvl 0 → a:lvl1pPr
    const re = new RegExp(`<a:lvl${n}pPr\\b[\\s\\S]*?</a:lvl${n}pPr>`);
    const m = re.exec(String(styleBlock || ''));
    if (!m) return null;
    // Reusa o parser de pPr: o conteúdo do lvlNpPr tem a mesma gramática de bullet.
    return parseExplicitBullet(`<a:pPr>${m[0]}</a:pPr>`);
}

/**
 * Resolve o bullet HERDADO de um parágrafo sem bullet explícito (T2.2):
 * lstStyle do placeholder no LAYOUT → txStyles do MASTER (bodyStyle p/ corpo,
 * titleStyle p/ título, otherStyle no resto). Retorna null se nada define.
 */
export function resolveInheritedBullet(
    lvl: number,
    phType: string | null,
    layoutXml?: string,
    masterXml?: string,
): ParagraphBullet | null {
    // 1) layout: lstStyle do shape com o MESMO placeholder type.
    if (layoutXml) {
        const shapes = String(layoutXml).match(/<p:sp\b[\s\S]*?<\/p:sp>/g) || [];
        for (const shape of shapes) {
            const t = placeholderType(shape);
            const match = phType ? t === phType : t === null;
            if (!match) continue;
            const lst = /<a:lstStyle\b[\s\S]*?<\/a:lstStyle>/.exec(shape)?.[0];
            if (lst) {
                const b = bulletFromStyleBlock(lst, lvl);
                if (b) return b;
            }
        }
    }
    // 2) master: txStyles por família de placeholder.
    if (masterXml) {
        const isTitle = isTitlePlaceholder(phType);
        const isBody = phType === 'body' || phType === 'subTitle' || phType === null;
        const tag = isTitle ? 'p:titleStyle' : isBody ? 'p:bodyStyle' : 'p:otherStyle';
        const block = new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`).exec(String(masterXml))?.[0];
        if (block) {
            const b = bulletFromStyleBlock(block, lvl);
            if (b) return b;
        }
    }
    return null;
}

/** Contexto de herança layout/master p/ parsing (T2.2/T2.4). */
export interface SlideInheritContext {
    layoutXml?: string;
    masterXml?: string;
}

/** Extrai os parágrafos (texto + nível + runs/align/bullet/marL) de um bloco XML. */
export function extractParagraphs(
    xml: string,
    inherit?: SlideInheritContext,
    phType: string | null = null,
): SlideParagraph[] {
    const paras: SlideParagraph[] = [];
    const re = /<a:p\b[\s\S]*?<\/a:p>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
        const block = m[0];
        // T2.2 — sequência de runs (<a:r>) e quebras (<a:br/>) na ordem.
        const runs: SlideRunFmt[] = [];
        const tokenRe = /<a:r\b[\s\S]*?<\/a:r>|<a:br\s*\/>/g;
        let tk: RegExpExecArray | null;
        while ((tk = tokenRe.exec(block)) !== null) {
            if (tk[0].startsWith('<a:br')) {
                const last = runs[runs.length - 1];
                if (last) last.text += '\n';
                else runs.push({ text: '\n' });
            } else {
                runs.push(runFormat(tk[0]));
            }
        }
        const text = (runs.length > 0 ? runs.map((r) => r.text).join('') : extractRunText(block)).trim();
        if (text.length === 0) continue; // ignora parágrafos vazios
        const level = paragraphLevel(block);
        const para: SlideParagraph = { text, level };
        if (runs.length > 0 && runsWorthEmitting(runs)) para.runs = runs;
        const ppr = /<a:pPr\b[^>]*/.exec(block)?.[0] ?? '';
        const algn = /\balgn="([^"]+)"/.exec(ppr);
        if (algn && algn[1]) para.align = algn[1];
        const marL = /\bmarL="(\d+)"/.exec(ppr);
        if (marL) para.marL = parseInt(marL[1] ?? '0', 10) || 0;
        const bullet =
            parseExplicitBullet(block) ??
            (inherit ? resolveInheritedBullet(level, phType, inherit.layoutXml, inherit.masterXml) : null);
        if (bullet) para.bullet = bullet;
        paras.push(para);
    }
    return paras;
}

/** Tipo do placeholder de um shape (`<p:ph type="...">`), ou null. */
function placeholderType(shapeXml: string): string | null {
    const m = /<p:ph\b[^>]*\btype="([^"]+)"/.exec(shapeXml);
    return m ? (m[1] ?? null) : null;
}

/** True se o tipo de placeholder denota um TÍTULO de slide. */
function isTitlePlaceholder(type: string | null): boolean {
    return type === 'title' || type === 'ctrTitle';
}

// ---------------------------------------------------------------------------
// Parsing de slide + rels
// ---------------------------------------------------------------------------

/** Resultado do parsing cru de um slide (antes de resolver mídia). */
export interface ParsedSlideRaw {
    title?: string;
    paragraphs: SlideParagraph[];
    /** rIds dos `<a:blip r:embed="rIdN">` na ordem de ocorrência. */
    embedIds: string[];
    /** rIds dos `<p:video>/<a:videoFile r:link="rIdN">` na ordem (T2.1). */
    videoIds: string[];
    /** tabelas do slide já convertidas em markdown (F4 fidelidade). */
    tables: string[];
}

/** Monta uma tabela markdown a partir de linhas de células (pad + escape de `|`). */
function buildMarkdownTable(rows: string[][]): string {
    if (rows.length === 0) return '';
    const cols = Math.max(...rows.map((r) => r.length));
    if (cols === 0) return '';
    const esc = (c: string) => String(c || '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
    const pad = (r: string[]) => {
        const out = r.slice();
        while (out.length < cols) out.push('');
        return out;
    };
    const header = pad(rows[0] ?? []);
    const lines = [
        `| ${header.map(esc).join(' | ')} |`,
        `| ${header.map(() => '---').join(' | ')} |`,
    ];
    for (let i = 1; i < rows.length; i++) {
        lines.push(`| ${pad(rows[i] ?? []).map(esc).join(' | ')} |`);
    }
    return lines.join('\n');
}

/** Extrai as tabelas (`<a:tbl>`) de um slide e as converte em markdown. */
export function parseTablesFromXml(xml: string): string[] {
    const tables: string[] = [];
    const tblRe = /<a:tbl\b[\s\S]*?<\/a:tbl>/g;
    let tm: RegExpExecArray | null;
    while ((tm = tblRe.exec(String(xml || ''))) !== null) {
        const rows: string[][] = [];
        const trRe = /<a:tr\b[\s\S]*?<\/a:tr>/g;
        let rm: RegExpExecArray | null;
        while ((rm = trRe.exec(tm[0])) !== null) {
            const cells: string[] = [];
            const tcRe = /<a:tc\b[\s\S]*?<\/a:tc>/g;
            let cm: RegExpExecArray | null;
            while ((cm = tcRe.exec(rm[0])) !== null) {
                cells.push(extractRunText(cm[0]).trim());
            }
            if (cells.length > 0) rows.push(cells);
        }
        const md = buildMarkdownTable(rows);
        if (md) tables.push(md);
    }
    return tables;
}

/** Extrai o texto das notas do apresentador (notesSlideN.xml), sem o nº do slide. */
export function extractNotesText(notesXml: string): string {
    const paras = extractParagraphs(String(notesXml || ''));
    return paras
        .map((p) => p.text.trim())
        .filter((t) => t && !/^\d{1,3}$/.test(t))
        .join('\n')
        .trim();
}

/**
 * Faz o parsing do XML de um slide → `{ title?, paragraphs[], embedIds[] }`.
 * Shape com placeholder de título vira `title` e NÃO entra no corpo (sem duplicar).
 */
export function parseSlideXml(xml: string, inherit?: SlideInheritContext): ParsedSlideRaw {
    const src = String(xml || '');
    // Shapes de texto irmãos no spTree. Não-guloso captura cada <p:sp>…</p:sp>.
    const shapeRe = /<p:sp\b[\s\S]*?<\/p:sp>/g;
    const shapes = src.match(shapeRe) || [];

    let title: string | undefined;
    const body: SlideParagraph[] = [];

    if (shapes.length > 0) {
        for (const shape of shapes) {
            const phType = placeholderType(shape);
            const isTitle = isTitlePlaceholder(phType);
            const paras = extractParagraphs(shape, inherit, phType);
            if (isTitle && title === undefined) {
                const titleText = paras.map((p) => p.text).join(' ').trim();
                if (titleText) title = titleText;
                // título não vai para o corpo
            } else {
                for (const p of paras) body.push(p);
            }
        }
    } else {
        // Sem shapes reconhecíveis: extrai todos os parágrafos do slide inteiro.
        for (const p of extractParagraphs(src, inherit)) body.push(p);
    }

    // Imagens: r:embed dos blips, na ordem.
    const embedIds: string[] = [];
    const blipRe = /<a:blip\b[^>]*\br:embed="([^"]+)"/g;
    let bm: RegExpExecArray | null;
    while ((bm = blipRe.exec(src)) !== null) {
        if (bm[1]) embedIds.push(bm[1]);
    }

    // Vídeos (T2.1): `<p:video>` (nvPr) referencia a mídia via `<a:videoFile r:link>`.
    const videoIds: string[] = [];
    const videoRe = /<a:videoFile\b[^>]*\br:link="([^"]+)"/g;
    let vm: RegExpExecArray | null;
    while ((vm = videoRe.exec(src)) !== null) {
        if (vm[1] && !videoIds.includes(vm[1])) videoIds.push(vm[1]);
    }

    const tables = parseTablesFromXml(src);
    return title === undefined
        ? { paragraphs: body, embedIds, videoIds, tables }
        : { title, paragraphs: body, embedIds, videoIds, tables };
}

/**
 * Faz o parsing do `.rels` de um slide → Map<rId, basename da mídia>.
 * Só inclui relationships cujo Target aponta para `media/` (imagens).
 */
export function parseRelsXml(xml: string): Map<string, string> {
    const map = new Map<string, string>();
    const re = /<Relationship\b[^>]*>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(String(xml || ''))) !== null) {
        const tag = m[0];
        const id = /\bId="([^"]+)"/.exec(tag)?.[1];
        const target = /\bTarget="([^"]+)"/.exec(tag)?.[1];
        if (!id || !target) continue;
        if (!/media\//i.test(target)) continue;
        map.set(id, basename(target));
    }
    return map;
}

/**
 * Faz o parsing do `.rels` de um slide → Map<rId, Target CRU> (todas as
 * relationships, sem filtro). Usado p/ vídeos (T2.1): mídia embutida
 * (`../media/media1.mp4`) resolve para o basename; vídeo LINKADO
 * (TargetMode="External", URL) preserva o Target completo.
 */
export function parseRelsTargets(xml: string): Map<string, string> {
    const map = new Map<string, string>();
    const re = /<Relationship\b[^>]*>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(String(xml || ''))) !== null) {
        const tag = m[0];
        const id = /\bId="([^"]+)"/.exec(tag)?.[1];
        const target = /\bTarget="([^"]+)"/.exec(tag)?.[1];
        if (!id || !target) continue;
        map.set(id, target);
    }
    return map;
}

/** Extensões de mídia tratadas como IMAGEM (T2.6 — separa de vídeo/áudio no rels). */
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg|tiff?|emf|wmf)$/i;

/** Último segmento de um caminho (ignora `../`, `/`, `\`). */
export function basename(p: string): string {
    const s = String(p || '').replace(/\\/g, '/');
    const i = s.lastIndexOf('/');
    return i >= 0 ? s.slice(i + 1) : s;
}

/** Extrai o número do slide de um caminho `ppt/slides/slide12.xml` → 12 (0 se falhar). */
export function slideNumberFromPath(path: string): number {
    const m = /slide(\d+)\.xml$/i.exec(String(path || ''));
    return m ? parseInt(m[1] ?? '0', 10) || 0 : 0;
}

// ---------------------------------------------------------------------------
// T2.3 — Geometria (a:off/a:ext em EMU), z-order e composição de grupos grpSp
// ---------------------------------------------------------------------------

/** Transform afim simples (sem rotação): abs = t + pos·s, por eixo. */
interface GeomTransform {
    tx: number;
    ty: number;
    sx: number;
    sy: number;
}

const IDENTITY_TRANSFORM: GeomTransform = { tx: 0, ty: 0, sx: 1, sy: 1 };

/** Lê o primeiro `<a:xfrm>`/`<p:xfrm>` de um bloco: off/ext (+ chOff/chExt p/ grupos). */
function parseXfrm(block: string): {
    off?: { x: number; y: number };
    ext?: { cx: number; cy: number };
    chOff?: { x: number; y: number };
    chExt?: { cx: number; cy: number };
} | null {
    const xfrm = /<(?:a|p):xfrm\b[\s\S]*?<\/(?:a|p):xfrm>/.exec(block)?.[0];
    if (!xfrm) return null;
    const num = (s: string | undefined) => parseInt(s ?? '0', 10) || 0;
    const out: ReturnType<typeof parseXfrm> = {};
    const off = /<a:off\b[^>]*\bx="(-?\d+)"[^>]*\by="(-?\d+)"/.exec(xfrm);
    if (off) out!.off = { x: num(off[1]), y: num(off[2]) };
    const ext = /<a:ext\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/.exec(xfrm);
    if (ext) out!.ext = { cx: num(ext[1]), cy: num(ext[2]) };
    const chOff = /<a:chOff\b[^>]*\bx="(-?\d+)"[^>]*\by="(-?\d+)"/.exec(xfrm);
    if (chOff) out!.chOff = { x: num(chOff[1]), y: num(chOff[2]) };
    const chExt = /<a:chExt\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/.exec(xfrm);
    if (chExt) out!.chExt = { cx: num(chExt[1]), cy: num(chExt[2]) };
    return out;
}

/** Nome do shape (`<p:cNvPr name="...">`), ou undefined. */
function shapeName(block: string): string | undefined {
    const m = /<p:cNvPr\b[^>]*\bname="([^"]*)"/.exec(block);
    const name = m ? xmlUnescape(m[1] ?? '') : '';
    return name || undefined;
}

/**
 * Scanner balanceado: devolve os elementos de 1º nível de um segmento XML entre
 * os tipos pedidos, na ordem do documento (conta abre/fecha do MESMO tag p/
 * suportar `grpSp` aninhado).
 */
function topLevelElements(xml: string, tags: string[]): Array<{ tag: string; content: string }> {
    const out: Array<{ tag: string; content: string }> = [];
    const openRe = new RegExp(`<p:(${tags.join('|')})\\b`, 'g');
    let m: RegExpExecArray | null;
    while ((m = openRe.exec(xml)) !== null) {
        const tag = m[1] as string;
        // \b evita casar prefixos (ex.: `<p:sp` × `<p:spPr`/`<p:spTree`).
        const nestedRe = new RegExp(`<p:${tag}\\b|</p:${tag}>`, 'g');
        const closeTag = `</p:${tag}>`;
        let depth = 1;
        let pos = m.index + `<p:${tag}`.length;
        nestedRe.lastIndex = pos;
        let n: RegExpExecArray | null;
        while (depth > 0) {
            n = nestedRe.exec(xml);
            if (!n) return out; // XML truncado: aborta com o que há
            if (n[0] === closeTag) depth--;
            else depth++;
            pos = n.index + n[0].length;
        }
        out.push({ tag, content: xml.slice(m.index, pos) });
        openRe.lastIndex = pos; // não re-visita o interior do elemento
    }
    return out;
}

/** Remove o segmento do PRÓPRIO xfrm do grupo p/ não confundi-lo com o dos filhos. */
function groupInner(groupContent: string): string {
    // conteúdo após o fim do <p:grpSpPr> (que carrega o xfrm do grupo)
    const gp = /<p:grpSpPr\b[\s\S]*?<\/p:grpSpPr>/.exec(groupContent);
    if (!gp) return groupContent;
    return groupContent.slice((gp.index ?? 0) + gp[0].length);
}

/**
 * Extrai a geometria absoluta (EMU) + z-order dos shapes de um slide (T2.3).
 * Grupos (`grpSp`) são compostos: filho absoluto = off do grupo +
 * (posição do filho − chOff) × (ext/chExt), recursivamente.
 */
export function extractShapeGeometry(xml: string): SlideShapeGeometry[] {
    const src = String(xml || '');
    const spTree = /<p:spTree\b[\s\S]*<\/p:spTree>/.exec(src)?.[0] ?? src;
    const shapes: SlideShapeGeometry[] = [];
    let z = 0;

    const walk = (segment: string, t: GeomTransform): void => {
        for (const el of topLevelElements(segment, ['sp', 'pic', 'graphicFrame', 'grpSp'])) {
            const xf = parseXfrm(el.content);
            if (el.tag === 'grpSp') {
                if (xf?.off && xf.ext && xf.chOff && xf.chExt && xf.chExt.cx > 0 && xf.chExt.cy > 0) {
                    const sx = (t.sx * xf.ext.cx) / xf.chExt.cx;
                    const sy = (t.sy * xf.ext.cy) / xf.chExt.cy;
                    const child: GeomTransform = {
                        sx,
                        sy,
                        tx: t.tx + t.sx * xf.off.x - xf.chOff.x * sx,
                        ty: t.ty + t.sy * xf.off.y - xf.chOff.y * sy,
                    };
                    walk(groupInner(el.content), child);
                } else {
                    // grupo sem transform completo: propaga o transform do pai
                    walk(groupInner(el.content), t);
                }
                continue;
            }
            if (!xf?.off || !xf.ext) continue; // shape sem geometria explícita
            const geom: SlideShapeGeometry = {
                kind: el.tag as 'sp' | 'pic' | 'graphicFrame',
                x: Math.round(t.tx + t.sx * xf.off.x),
                y: Math.round(t.ty + t.sy * xf.off.y),
                cx: Math.round(t.sx * xf.ext.cx),
                cy: Math.round(t.sy * xf.ext.cy),
                z: z++,
            };
            const name = shapeName(el.content);
            if (name) geom.name = name;
            shapes.push(geom);
        }
    };
    walk(spTree, IDENTITY_TRANSFORM);
    return shapes;
}

// ---------------------------------------------------------------------------
// T2.4 — Fundo do slide (próprio ou herdado do layout/master)
// ---------------------------------------------------------------------------

/** Extrai o fundo de UM part (`<p:bg>`): imagem (blip via rels) ou cor sólida. */
function backgroundFromPart(xml: string, relsXml: string): { imageRef?: string; color?: string } | null {
    const bg = /<p:bg\b[\s\S]*?<\/p:bg>/.exec(String(xml || ''))?.[0];
    if (!bg) return null;
    const embed = /<a:blip\b[^>]*\br:embed="([^"]+)"/.exec(bg)?.[1];
    if (embed) {
        const rels = parseRelsXml(relsXml || '');
        const ref = rels.get(embed);
        if (ref) return { imageRef: ref };
    }
    const color = /<a:solidFill>\s*<a:srgbClr\b[^>]*\bval="([0-9a-fA-F]{6})"/.exec(bg)?.[1];
    if (color) return { color: color.toUpperCase() };
    return null; // bg com tema/gradiente não-suportado: cai para o próximo da cadeia
}

/**
 * Resolve o fundo EFETIVO de um slide (T2.4): slide → layout → master (o
 * primeiro `<p:bg>` resolvível vence). A capa full-bleed que só existe no
 * layout/master deixa de ser invisível ao import.
 */
export function resolveSlideBackground(entry: RawSlideEntry): SlideBackground | null {
    const chain: Array<{ xml?: string; rels?: string; source: SlideBackground['source'] }> = [
        { xml: entry.slideXml, rels: entry.relsXml ?? '', source: 'slide' },
        { xml: entry.layoutXml ?? '', rels: entry.layoutRelsXml ?? '', source: 'layout' },
        { xml: entry.masterXml ?? '', rels: entry.masterRelsXml ?? '', source: 'master' },
    ];
    for (const part of chain) {
        if (!part.xml) continue;
        const found = backgroundFromPart(part.xml, part.rels || '');
        if (!found) continue;
        const bg: SlideBackground = { source: part.source };
        if (found.imageRef) bg.imageRef = found.imageRef;
        if (found.color) bg.color = found.color;
        return bg;
    }
    return null;
}

// ---------------------------------------------------------------------------
// T2.5 — Tema: cores cruas do clrScheme (theme1.xml)
// ---------------------------------------------------------------------------

/** Slots de cor de um `<a:clrScheme>` (ECMA-376 §20.1.6.2), na ordem canônica. */
const CLR_SCHEME_SLOTS = [
    'dk1', 'lt1', 'dk2', 'lt2',
    'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6',
    'hlink', 'folHlink',
] as const;

/**
 * Extrai as cores CRUAS do `<a:clrScheme>` de um theme1.xml (T2.5):
 * `{ dk1: 'RRGGBB', …, accent1: …, hlink: …, folHlink: … }`.
 * Resolve `<a:srgbClr val>` direto e `<a:sysClr lastClr>` (dk1/lt1 típicos).
 * Slots ausentes/não-resolvíveis são omitidos. Objeto vazio se não há clrScheme.
 */
export function parseThemeColors(themeXml: string): Record<string, string> {
    const out: Record<string, string> = {};
    const scheme = /<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/.exec(String(themeXml || ''))?.[0];
    if (!scheme) return out;
    for (const slot of CLR_SCHEME_SLOTS) {
        const block = new RegExp(`<a:${slot}>([\\s\\S]*?)</a:${slot}>`).exec(scheme)?.[1];
        if (!block) continue;
        const srgb = /<a:srgbClr\b[^>]*\bval="([0-9a-fA-F]{6})"/.exec(block)?.[1];
        const sys = srgb ? undefined : /<a:sysClr\b[^>]*\blastClr="([0-9a-fA-F]{6})"/.exec(block)?.[1];
        const hex = srgb || sys;
        if (hex) out[slot] = hex.toUpperCase();
    }
    return out;
}

// ---------------------------------------------------------------------------
// T2.7 — Ordem real dos slides pelo sldIdLst do presentation.xml
// ---------------------------------------------------------------------------

/**
 * Extrai a ordem dos slides do `ppt/presentation.xml` (T2.7): lê o `<p:sldIdLst>`
 * na ordem do documento, resolvendo cada `<p:sldId r:id="rIdN">` para o alvo
 * `slides/slideN.xml` via o `.rels` da apresentação. Devolve os caminhos
 * `ppt/slides/slideN.xml` NA ORDEM REAL (não alfabética por nome de arquivo).
 * Vazio se não houver sldIdLst ou rels — o chamador cai no fallback por número.
 */
export function parsePresentationOrder(presentationXml: string, presentationRelsXml: string): string[] {
    const lst = /<p:sldIdLst\b[\s\S]*?<\/p:sldIdLst>/.exec(String(presentationXml || ''))?.[0];
    if (!lst) return [];
    const rels = parseRelsTargets(presentationRelsXml || '');
    const order: string[] = [];
    const re = /<p:sldId\b[^>]*\br:id="([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(lst)) !== null) {
        const rid = m[1];
        if (!rid) continue;
        const target = rels.get(rid);
        if (!target) continue;
        // Target típico: 'slides/slideN.xml' (relativo a ppt/). Normaliza p/ o
        // mesmo formato de RawSlideEntry.path ('ppt/slides/slideN.xml').
        const norm = target.replace(/^\.\.\//, '').replace(/^\/+/, '');
        const path = /^ppt\//i.test(norm) ? norm : `ppt/${norm}`;
        order.push(path);
    }
    return order;
}

/** True se o slide está OCULTO na apresentação (`<p:sld ... show="0">`) — T2.7. */
export function isSlideHidden(slideXml: string): boolean {
    const root = /<p:sld\b[^>]*>/.exec(String(slideXml || ''))?.[0] ?? '';
    return /\bshow="0"/.test(root);
}

// ---------------------------------------------------------------------------
// Orquestração: entradas brutas → NormalizedSlide[]
// ---------------------------------------------------------------------------

/** Entrada bruta de um slide (preparada pelo glue a partir do ZIP). */
export interface RawSlideEntry {
    /** caminho `ppt/slides/slideN.xml` (usado p/ ordenar). */
    path: string;
    slideXml: string;
    /** XML do `.rels` do slide (pode ser vazio). */
    relsXml?: string;
    /** XML das notas do apresentador deste slide (notesSlideN.xml), se houver. */
    notesXml?: string;
    /** XML do slideLayout do slide (herança T2.2/T2.4), se houver. */
    layoutXml?: string;
    /** XML do `.rels` do layout (T2.4 — resolve mídia de fundo). */
    layoutRelsXml?: string;
    /** XML do slideMaster do slide (herança T2.2/T2.4), se houver. */
    masterXml?: string;
    /** XML do `.rels` do master (T2.4). */
    masterRelsXml?: string;
}

/**
 * Converte as entradas brutas de slide em `NormalizedSlide[]`. A ordem segue o
 * `sldIdLst` do presentation.xml quando `order` (caminhos na ordem real) é dado
 * (T2.7); senão cai no fallback por número do slide (slide1, slide2, …). Resolve
 * cada `r:embed` para o basename da mídia via o `.rels` correspondente; embeds
 * sem rels viram a própria rId (o glue decide o fallback). `index` é reatribuído
 * 1..N na ordem final; slides ocultos (`show="0"`) são preservados como hidden.
 */
export function buildNormalizedSlides(entries: RawSlideEntry[], order?: string[]): NormalizedSlide[] {
    const filtered = (Array.isArray(entries) ? entries : []).filter((e) => e && typeof e.slideXml === 'string');
    let list: RawSlideEntry[];
    if (Array.isArray(order) && order.length > 0) {
        // T2.7 — ordem canônica do sldIdLst. Slides presentes no ZIP mas ausentes
        // do sldIdLst (raro) vão para o fim, ordenados por número (determinístico).
        const rank = new Map(order.map((p, i) => [p, i]));
        list = filtered
            .slice()
            .sort(
                (a, b) =>
                    (rank.has(a.path) ? (rank.get(a.path) as number) : Number.MAX_SAFE_INTEGER) -
                        (rank.has(b.path) ? (rank.get(b.path) as number) : Number.MAX_SAFE_INTEGER) ||
                    slideNumberFromPath(a.path) - slideNumberFromPath(b.path),
            );
    } else {
        list = filtered.slice().sort((a, b) => slideNumberFromPath(a.path) - slideNumberFromPath(b.path));
    }

    return list.map((entry, i) => {
        const inherit: SlideInheritContext = {};
        if (entry.layoutXml) inherit.layoutXml = entry.layoutXml;
        if (entry.masterXml) inherit.masterXml = entry.masterXml;
        const raw = parseSlideXml(entry.slideXml, inherit);
        const rels = parseRelsXml(entry.relsXml || '');
        const imageRefs = raw.embedIds.map((rid) => rels.get(rid) || rid).filter((r) => !!r);
        // T2.6 — assets por referência: TODA mídia de imagem do .rels do slide
        // que o scan de blips não capturou (SmartArt, fills exóticos, svgBlip…)
        // entra como asset do slide, sem embutir binário no curso.
        const assetRefs: string[] = [];
        for (const target of rels.values()) {
            if (!IMAGE_EXT_RE.test(target)) continue;
            if (imageRefs.includes(target) || assetRefs.includes(target)) continue;
            assetRefs.push(target);
        }
        // Vídeos (T2.1): mídia embutida → basename; link externo → Target cru (URL).
        const allTargets = parseRelsTargets(entry.relsXml || '');
        const videoRefs = raw.videoIds
            .map((rid) => {
                const target = allTargets.get(rid);
                if (!target) return rid;
                return /media\//i.test(target) ? basename(target) : target;
            })
            .filter((r) => !!r);
        const slide: NormalizedSlide = {
            index: i + 1,
            paragraphs: raw.paragraphs,
            imageRefs,
        };
        if (videoRefs.length > 0) slide.videoRefs = videoRefs;
        if (assetRefs.length > 0) slide.assetRefs = assetRefs;
        if (raw.title !== undefined) slide.title = raw.title;
        if (raw.tables.length > 0) slide.tables = raw.tables;
        // T2.3 — geometria absoluta + z-order (composição de grpSp incluída).
        const shapes = extractShapeGeometry(entry.slideXml);
        if (shapes.length > 0) slide.shapes = shapes;
        // T2.4 — fundo efetivo (slide → layout → master). Imagem de fundo entra
        // na FRENTE de imageRefs p/ o glue registrar/exibir (capa full-bleed).
        const background = resolveSlideBackground(entry);
        if (background) {
            slide.background = background;
            if (background.imageRef && !imageRefs.includes(background.imageRef)) {
                imageRefs.unshift(background.imageRef);
            }
        }
        const notes = extractNotesText(entry.notesXml || '');
        if (notes) slide.notes = notes;
        // T2.7 — slide oculto na apresentação preservado como hidden.
        if (isSlideHidden(entry.slideXml)) slide.hidden = true;
        return slide;
    });
}
