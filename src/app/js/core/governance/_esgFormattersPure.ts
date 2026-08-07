// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   ESG FORMATTERS PURE (Module C extraction)
   ================================================================

   3 helpers de formatação extraídos de core/governance/esgExport.ts:
     - csvEscape: RFC 4180-ish escape para CSV (quote if contains sep/quote/CR/LF).
     - sectionsToPlainText: markdown-light renderer para DocxSection[].
     - sectionsToHtml: HTML renderer com XSS-escape para DocxSection[].

   Reusáveis por outros exporters (assessment, ingestion, libraries)
   que precisem do mesmo escape CSV ou render de seções estruturadas.
   ================================================================ */

/**
 * CSV escape RFC 4180-light: se valor contém o separator OR aspa OR
 * CR OR LF, envolve em aspas e duplica aspas internas. Senão devolve
 * intacto. null/undefined → ''. Coerção via String() para outros tipos.
 */
export function csvEscape(value: unknown, sep: string = ','): string {
    const s = value == null ? '' : String(value);
    if (s.includes(sep) || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

/**
 * Renderiza array de DocxSection-like em texto markdown-light:
 *   # heading
 *
 *   content
 *   [Manual input required]   ← se NÃO autoFilled
 *
 * Separator entre seções: '---'. Pure: não-array → ''.
 */
export function sectionsToPlainText(sections: Array<{ heading: string; content: string; autoFilled?: boolean }>): string {
    if (!Array.isArray(sections)) return '';
    return sections
        .map(
            (s) =>
                `# ${s.heading}\n\n${s.content}\n${s.autoFilled ? '' : '\n[Manual input required]\n'}`,
        )
        .join('\n\n---\n\n');
}

/**
 * Renderiza array de DocxSection-like em HTML com XSS-escape no heading
 * E no content (& < > "). Newlines no content viram <br>. Marker
 * '[manual]' em italic-laranja para seções não-auto-filled.
 *
 * Reuso: usar em outros previews/exporters HTML que recebam sections.
 */
export function sectionsToHtml(sections: Array<any>): string {
    if (!Array.isArray(sections)) return '';
    const escape = (s: any): string =>
        String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    return sections
        .map((s: any) => {
            const bodyHtml = escape(s.content).replace(/\n/g, '<br>');
            const mark = s.autoFilled ? '' : ' <em style="color:#ff9800">[manual]</em>';
            return `<h2>${escape(s.heading)}${mark}</h2>\n<p>${bodyHtml}</p>`;
        })
        .join('\n');
}
