// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * UX-76 Markdown Renderer - pure-logic, zero DOM.
 *
 * Subset of CommonMark: headings (h1-h3), paragraphs, bold (**), italic (_),
 * inline code (`), links [label](url), bullet/ordered lists with 2-space
 * nested indentation (up to 4 levels), blockquotes, fenced code blocks,
 * hard breaks.
 *
 * Sanitização: nada do input vira tag HTML. Tudo é escapado. URLs com
 * schemes inseguros (javascript:, data:, vbscript:) são removidas.
 */

const SAFE_URL_RE = /^(https?:|mailto:)/i;
const UNSAFE_URL_RE = /^(javascript:|data:|vbscript:)/i;
const MAX_LIST_DEPTH = 4;

/**
 * Escape HTML especiais.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str: string): string {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Cria nó AST congelado.
 * @param {string} type
 * @param {Record<string, any>} [props]
 * @returns {any}
 */
function node(type: string, props: Record<string, any> = {}): any {
    const n: Record<string, any> = { type, ...props };
    if (Array.isArray(n.children)) Object.freeze(n.children);
    return Object.freeze(n);
}

/**
 * Verifica URL seguro. Throws para schemes perigosos.
 * @param {any} url
 * @returns {string}
 */
function checkUrl(url: any): string {
    const trimmed = String(url || '').trim();
    if (UNSAFE_URL_RE.test(trimmed)) {
        throw new Error(`unsafe-url-scheme: ${trimmed.split(':')[0]}`);
    }
    // Allow relative urls, anchors, http/https/mailto
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('/') || SAFE_URL_RE.test(trimmed)) {
        return trimmed;
    }
    // Reject anything else with scheme-like prefix
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
        throw new Error(`unsafe-url-scheme: ${trimmed.split(':')[0]}`);
    }
    return trimmed;
}

/**
 * Parse inline markdown numa string -> array de nós inline.
 * @param {string} text
 * @returns {any[]}
 */
function parseInline(text: string): any[] {
    const out: any[] = [];
    let i = 0;
    let buf = '';

    const flush = () => {
        if (buf) {
            out.push(node('text', { value: buf }));
            buf = '';
        }
    };

    while (i < text.length) {
        const ch = text[i];

        // Inline code `...`
        if (ch === '`') {
            const end = text.indexOf('`', i + 1);
            if (end !== -1) {
                flush();
                out.push(node('code', { value: text.slice(i + 1, end) }));
                i = end + 1;
                continue;
            }
        }

        // Bold **...**
        if (ch === '*' && text[i + 1] === '*') {
            const end = text.indexOf('**', i + 2);
            if (end !== -1) {
                flush();
                out.push(node('bold', { children: parseInline(text.slice(i + 2, end)) }));
                i = end + 2;
                continue;
            }
        }

        // Italic _..._
        if (ch === '_') {
            const end = text.indexOf('_', i + 1);
            if (end !== -1 && end > i + 1) {
                flush();
                out.push(node('italic', { children: parseInline(text.slice(i + 1, end)) }));
                i = end + 1;
                continue;
            }
        }

        // Link [label](url)
        if (ch === '[') {
            const closeBracket = text.indexOf(']', i + 1);
            if (closeBracket !== -1 && text[closeBracket + 1] === '(') {
                const closeParen = text.indexOf(')', closeBracket + 2);
                if (closeParen !== -1) {
                    const label = text.slice(i + 1, closeBracket);
                    const url = text.slice(closeBracket + 2, closeParen);
                    try {
                        const safe = checkUrl(url);
                        flush();
                        out.push(node('link', { url: safe, children: parseInline(label) }));
                    } catch (_e) {
                        // strip link, keep label as text
                        flush();
                        out.push(node('text', { value: label }));
                    }
                    i = closeParen + 1;
                    continue;
                }
            }
        }

        buf += ch;
        i++;
    }

    flush();
    return out;
}

/**
 * Conta indentação leading (em chars de espaço; tabs como 2).
 * @param {string} line
 * @returns {number}
 */
function indentOf(line: string): number {
    let n = 0;
    for (const c of line) {
        if (c === ' ') n++;
        else if (c === '\t') n += 2;
        else break;
    }
    return n;
}

/**
 * Parse markdown -> AST root.
 * @param {string} text
 * @returns {any}
 */
export function parseMarkdown(text: string): any {
    const src = String(text == null ? '' : text);
    const lines = src.split(/\r?\n/);
    const blocks: any[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i]!;

        // Skip blank lines
        if (line.trim() === '') {
            i++;
            continue;
        }

        // Code block ```
        const fence = line.match(/^```(\w*)\s*$/);
        if (fence) {
            const lang = fence[1] || '';
            const codeLines = [];
            i++;
            let closed = false;
            while (i < lines.length) {
                if (/^```\s*$/.test(lines[i]!)) {
                    closed = true;
                    i++;
                    break;
                }
                codeLines.push(lines[i]!);
                i++;
            }
            if (!closed) {
                throw new Error('unclosed-code-block');
            }
            blocks.push(node('code-block', { lang, value: codeLines.join('\n') }));
            continue;
        }

        // Heading
        const h = line.match(/^(#{1,3})\s+(.*)$/);
        if (h) {
            blocks.push(
                node('heading', {
                    level: h[1]!.length,
                    children: parseInline(h[2]!.trim()),
                }),
            );
            i++;
            continue;
        }

        // Blockquote
        if (/^>\s?/.test(line)) {
            const quoteLines = [];
            while (i < lines.length && /^>\s?/.test(lines[i]!)) {
                quoteLines.push(lines[i]!.replace(/^>\s?/, ''));
                i++;
            }
            const inner = parseMarkdown(quoteLines.join('\n'));
            blocks.push(node('blockquote', { children: inner.children }));
            continue;
        }

        // List (bullet or ordered)
        if (/^(\s*)([-]|\d+\.)\s+/.test(line)) {
            const { listNode, consumed } = parseList(lines, i, 0);
            blocks.push(listNode);
            i += consumed;
            continue;
        }

        // Paragraph (consecutive non-blank, non-block lines)
        const paraLines = [];
        while (i < lines.length) {
            const l = lines[i]!;
            if (l.trim() === '') break;
            if (/^#{1,3}\s+/.test(l)) break;
            if (/^```/.test(l)) break;
            if (/^>\s?/.test(l)) break;
            if (/^(\s*)([-]|\d+\.)\s+/.test(l)) break;
            paraLines.push(l);
            i++;
        }
        if (paraLines.length) {
            blocks.push(
                node('paragraph', {
                    children: parseInline(paraLines.join(' ')),
                }),
            );
        }
    }

    return node('document', { children: blocks });
}

/**
 * Parse uma lista (e nested) começando em lines[start].
 * baseIndent: indentação esperada deste nível.
 * Retorna {listNode, consumed} onde consumed é nº de linhas usadas.
 * @param {string[]} lines
 * @param {number} start
 * @param {number} depth
 * @returns {{listNode: any, consumed: number}}
 */
function parseList(lines: string[], start: number, depth: number): { listNode: any; consumed: number } {
    if (depth >= MAX_LIST_DEPTH) {
        // bail out: trata como parágrafo para evitar overflow
        return {
            listNode: node('paragraph', { children: parseInline(lines[start]!) }),
            consumed: 1,
        };
    }

    const firstLine = lines[start]!;
    const baseIndent = indentOf(firstLine);
    const firstMatch = firstLine.slice(baseIndent).match(/^([-]|\d+\.)\s+(.*)$/);
    if (!firstMatch) {
        return { listNode: node('paragraph', { children: parseInline(firstLine) }), consumed: 1 };
    }
    const ordered = /^\d+\./.test(firstMatch[1]!);

    const items: any[] = [];
    let i = start;

    while (i < lines.length) {
        const line = lines[i]!;
        if (line.trim() === '') {
            // blank line ends list if next line is not continuation
            const next = lines[i + 1];
            if (!next || indentOf(next) < baseIndent) break;
            i++;
            continue;
        }
        const ind = indentOf(line);
        if (ind < baseIndent) break;
        const rest = line.slice(ind);
        const m = rest.match(/^([-]|\d+\.)\s+(.*)$/);
        if (ind === baseIndent && m) {
            const isOrdered = /^\d+\./.test(m[1]!);
            if (isOrdered !== ordered) break;
            const itemContent = m[2]!;
            const children = parseInline(itemContent);
            // Look ahead for nested list
            const nestedChildren = [...children];
            let j = i + 1;
            const nestedBlocks: any[] = [];
            while (j < lines.length) {
                const nl = lines[j]!;
                if (nl.trim() === '') {
                    j++;
                    continue;
                }
                const nind = indentOf(nl);
                if (nind <= baseIndent) break;
                if (nind >= baseIndent + 2 && /^([-]|\d+\.)\s+/.test(nl.slice(nind))) {
                    const sub = parseList(lines, j, depth + 1);
                    nestedBlocks.push(sub.listNode);
                    j += sub.consumed;
                } else {
                    break;
                }
            }
            const itemNode = node('list-item', {
                children: nestedChildren,
                blocks: Object.freeze(nestedBlocks),
            });
            items.push(itemNode);
            i = j;
            continue;
        }
        break;
    }

    return {
        listNode: node('list', { ordered, children: items }),
        consumed: i - start,
    };
}

/**
 * Render AST -> HTML safe.
 * @param {any} ast
 * @returns {string}
 */
export function renderToHtml(ast: any): string {
    if (!ast) return '';
    return renderNode(ast);
}

/** @param {any} n @returns {string} */
function renderNode(n: any): string {
    switch (n.type) {
        case 'document':
            return n.children.map(renderNode).join('\n');
        case 'heading':
            return `<h${n.level}>${(n.children || []).map(renderNode).join('')}</h${n.level}>`;
        case 'paragraph':
            return `<p>${(n.children || []).map(renderNode).join('')}</p>`;
        case 'blockquote':
            return `<blockquote>${(n.children || []).map(renderNode).join('\n')}</blockquote>`;
        case 'code-block': {
            const langAttr = n.lang ? ` class="language-${escapeHtml(n.lang)}"` : '';
            return `<pre><code${langAttr}>${escapeHtml(n.value)}</code></pre>`;
        }
        case 'list': {
            const tag = n.ordered ? 'ol' : 'ul';
            return `<${tag}>${(n.children || []).map(renderNode).join('')}</${tag}>`;
        }
        case 'list-item': {
            const inline = (n.children || []).map(renderNode).join('');
            const blocks = (n.blocks || []).map(renderNode).join('');
            return `<li>${inline}${blocks}</li>`;
        }
        case 'text':
            return escapeHtml(n.value);
        case 'bold':
            return `<strong>${(n.children || []).map(renderNode).join('')}</strong>`;
        case 'italic':
            return `<em>${(n.children || []).map(renderNode).join('')}</em>`;
        case 'code':
            return `<code>${escapeHtml(n.value)}</code>`;
        case 'link':
            return `<a href="${escapeHtml(n.url)}" rel="noopener noreferrer">${(n.children || []).map(renderNode).join('')}</a>`;
        case 'break':
            return '<br>';
        default:
            return '';
    }
}

/**
 * Render AST -> plain text (sem markup).
 * @param {any} ast
 * @returns {string}
 */
export function renderToPlainText(ast: any): string {
    if (!ast) return '';
    return plainNode(ast).trim();
}

/** @param {any} n @returns {string} */
function plainNode(n: any): string {
    switch (n.type) {
        case 'document':
            return (n.children || []).map(plainNode).join('\n\n');
        case 'heading':
        case 'paragraph':
            return (n.children || []).map(plainNode).join('');
        case 'blockquote':
            return (n.children || []).map(plainNode).join('\n');
        case 'code-block':
            return n.value || '';
        case 'list':
            return (n.children || []).map(plainNode).join('\n');
        case 'list-item': {
            const inline = (n.children || []).map(plainNode).join('');
            const blocks = (n.blocks || []).map(plainNode).join('\n');
            return blocks ? `${inline}\n${blocks}` : inline;
        }
        case 'text':
            return n.value || '';
        case 'bold':
        case 'italic':
            return (n.children || []).map(plainNode).join('');
        case 'code':
            return n.value || '';
        case 'link':
            return (n.children || []).map(plainNode).join('');
        case 'break':
            return '\n';
        default:
            return '';
    }
}

/**
 * Extrai todos os links {label, url}.
 * @param {any} ast
 * @returns {Array<{label: string, url: string}>}
 */
export function extractLinks(ast: any): Array<{ label: string; url: string }> {
    const out: Array<{ label: string; url: string }> = [];
    walk(ast, (n: any) => {
        if (n.type === 'link') {
            const label = (n.children || []).map(plainNode).join('');
            out.push({ label, url: n.url });
        }
    });
    return out;
}

/**
 * @param {any} n
 * @param {(node: any) => void} fn
 */
function walk(n: any, fn: (node: any) => void): void {
    if (!n) return;
    fn(n);
    if (Array.isArray(n.children)) n.children.forEach((c: any) => walk(c, fn));
    if (Array.isArray(n.blocks)) n.blocks.forEach((c: any) => walk(c, fn));
}

/**
 * Valida markdown estrutural.
 * @param {string} text
 */
export function validateMarkdown(text: string): { valid: boolean; errors: Array<{ code: string; message: string }> } {
    const errors: Array<{ code: string; message: string }> = [];
    try {
        parseMarkdown(text);
    } catch (e: any) {
        errors.push({ code: e?.message?.split(':')[0] || 'error', message: e?.message || String(e) });
    }
    return { valid: errors.length === 0, errors };
}

/**
 * Estatísticas resumidas.
 * @param {any} ast
 */
export function summarizeMarkdown(ast: any): {
    blockCount: number;
    headingCount: number;
    linkCount: number;
    hasCode: boolean;
    charCount: number;
} {
    let blockCount = 0;
    let headingCount = 0;
    let linkCount = 0;
    let hasCode = false;
    let charCount = 0;
    walk(ast, (n: any) => {
        if (n.type === 'document') return;
        if (['heading', 'paragraph', 'blockquote', 'code-block', 'list'].includes(n.type)) {
            if (n === ast || n.type !== 'list') blockCount++;
        }
        if (n.type === 'heading') headingCount++;
        if (n.type === 'link') linkCount++;
        if (n.type === 'code' || n.type === 'code-block') hasCode = true;
        if (n.type === 'text') charCount += (n.value || '').length;
        if (n.type === 'code' || n.type === 'code-block') charCount += (n.value || '').length;
    });
    return { blockCount, headingCount, linkCount, hasCode, charCount };
}
