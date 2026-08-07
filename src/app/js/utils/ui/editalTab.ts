// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Edital Tab — wire DOM (SPEC_EDITAL_PIPELINE-001 §6, micro #8).
 *
 * Aba/painel "Edital" no composer do workbench: checklist de conformidade
 * visual (status OK/PARCIAL/FALTA/NAO_APLICAVEL colorido + evidencia) e
 * secao de gaps de documentos satelites com prazos retro-calculados e
 * vencidos em destaque.
 *
 * Camada thin wire sobre o RelatorioConformidade produzido pela camada pura
 * (acad core/funding, micro #5/#7) via POST /api/edital/conformidade. Os
 * tipos abaixo espelham o lock de API da spec §5.2 — mantidos locais para o
 * modulo ser self-contained (sem dependencia do repo acad neste build).
 *
 * Responsabilidades wire (apenas):
 *   1. Mount/update DOM a partir de EditalData (textContent — XSS-safe)
 *   2. Botao "re-executar conformidade" dispatcha custom event; quem escuta
 *      re-roda o check (wire NAO sabe sobre API/state — idem complianceBanner)
 *
 * A11y (obrigatorio nesta micro, spec §9): teclado via <button> nativo,
 * foco visivel, labels acessiveis, status transmitido por TEXTO (nao so cor,
 * WCAG 1.4.1), contraste >=4.5:1 via tokens WCAG-AA de styles.css. Zero
 * emojis na UI. Zero hex hardcoded — somente design tokens.
 */

export type EditalStatusConformidade = 'OK' | 'PARCIAL' | 'FALTA' | 'NAO_APLICAVEL';

export interface EditalItemConformidade {
    requisitoId: string;
    status: EditalStatusConformidade;
    texto?: string;
    onde?: string;
    evidencia?: string;
    obrigatorio?: boolean;
}

export interface EditalGap {
    documento: string;
    prazoLimite: string;
    vencido: boolean;
    motivo: string;
}

export interface EditalData {
    editalId: string;
    titulo?: string;
    projectId?: string;
    geradoEm?: string;
    itens: EditalItemConformidade[];
    gaps: EditalGap[];
    prontoParaSubmeter: boolean;
}

export const EDITAL_RERUN_EVENT = 'edital:rerun-conformidade';

const STYLE_ID = 'edital-tab-style';

const STATUS_LABEL: Record<EditalStatusConformidade, string> = {
    OK: 'OK',
    PARCIAL: 'Parcial',
    FALTA: 'Falta',
    NAO_APLICAVEL: 'N/A',
};

const STATUS_CLASS: Record<EditalStatusConformidade, string> = {
    OK: 'edital-status--ok',
    PARCIAL: 'edital-status--parcial',
    FALTA: 'edital-status--falta',
    NAO_APLICAVEL: 'edital-status--na',
};

const CSS = `
.edital-tab { display: flex; flex-direction: column; gap: 16px; padding: 16px; color: var(--text-primary); }
.edital-tab__header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; border-bottom: 2px solid var(--border-color); padding-bottom: 12px; }
.edital-tab__title { margin: 0; font-size: 20px; font-weight: 700; }
.edital-tab__meta { margin: 4px 0 0; font-size: 12px; color: var(--text-secondary); }
.edital-tab__gate { border: 1px solid; border-radius: 6px; padding: 6px 12px; font-size: 13px; font-weight: 700; background: var(--ecbt-surface-sunken); }
.edital-tab__gate--ok { color: var(--success); border-color: var(--success); }
.edital-tab__gate--blocked { color: var(--error); border-color: var(--error); }
.edital-tab__summary { display: flex; gap: 8px; flex-wrap: wrap; }
.edital-tab__count { border: 1px solid var(--border-color); border-radius: 999px; padding: 2px 10px; font-size: 12px; font-weight: 600; }
.edital-tab__count--ok { color: var(--success); border-color: var(--success); }
.edital-tab__count--parcial { color: var(--warning); border-color: var(--warning); }
.edital-tab__count--falta { color: var(--error); border-color: var(--error); }
.edital-tab__count--na { color: var(--text-secondary); }
.edital-tab__rerun { align-self: flex-start; border: 1px solid var(--border-color); background: var(--ecbt-surface-raised); color: var(--text-primary); border-radius: 6px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; }
.edital-tab__rerun:hover { border-color: var(--text-secondary); }
.edital-tab__rerun:focus-visible { outline: 2px solid var(--text-primary); outline-offset: 2px; }
.edital-tab__sectiontitle { margin: 0 0 8px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-secondary); }
.edital-tab__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.edital-tab__item { display: flex; gap: 12px; border: 1px solid var(--border-color); border-left-width: 4px; border-radius: 6px; padding: 10px 12px; background: var(--ecbt-surface-raised); }
.edital-tab__item--ok { border-left-color: var(--success); }
.edital-tab__item--parcial { border-left-color: var(--warning); }
.edital-tab__item--falta { border-left-color: var(--error); }
.edital-tab__item--na { border-left-color: var(--text-secondary); }
.edital-tab__status { flex: 0 0 auto; min-width: 64px; text-align: center; align-self: flex-start; border-radius: 4px; padding: 2px 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; background: var(--ecbt-surface-sunken); }
.edital-status--ok { color: var(--success); }
.edital-status--parcial { color: var(--warning); }
.edital-status--falta { color: var(--error); }
.edital-status--na { color: var(--text-secondary); }
.edital-tab__itembody { flex: 1 1 auto; min-width: 0; }
.edital-tab__req { margin: 0; font-size: 13px; }
.edital-tab__reqid { font-weight: 700; }
.edital-tab__obrig { color: var(--error); font-weight: 700; }
.edital-tab__onde { margin: 2px 0 0; font-size: 12px; color: var(--text-secondary); }
.edital-tab__evidencia { margin: 6px 0 0; padding: 6px 10px; border-left: 3px solid var(--border-color); background: var(--ecbt-surface-sunken); font-size: 12px; font-style: italic; color: var(--text-secondary); }
.edital-tab__gap { display: flex; flex-direction: column; gap: 2px; border: 1px solid var(--border-color); border-left-width: 4px; border-left-color: var(--warning); border-radius: 6px; padding: 10px 12px; background: var(--ecbt-surface-raised); }
.edital-tab__gap--vencido { border-left-color: var(--error); }
.edital-tab__gaphead { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.edital-tab__gapdoc { font-size: 13px; font-weight: 700; }
.edital-tab__gapdeadline { font-size: 12px; color: var(--text-secondary); }
.edital-tab__gapflag { font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--error); }
.edital-tab__gapmotivo { margin: 4px 0 0; font-size: 12px; color: var(--text-secondary); }
.edital-tab__empty { margin: 0; color: var(--text-secondary); font-size: 13px; }
`;

function _isValidEditalData(data: unknown): data is EditalData {
    if (!data || typeof data !== 'object') return false;
    const d = data as Partial<EditalData>;
    return typeof d.editalId === 'string' && d.editalId.length > 0 && Array.isArray(d.itens) && Array.isArray(d.gaps);
}

function _formatDate(iso: string | undefined): string {
    if (!iso) return '\u2014';
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return iso;
    try {
        return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(parsed);
    } catch {
        return iso;
    }
}

function _ensureStyles(doc: Document): void {
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    doc.head.appendChild(style);
}

function _el(doc: Document, tag: string, className: string, text?: string): HTMLElement {
    const node = doc.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function _buildHeader(doc: Document, data: EditalData): HTMLElement {
    const header = _el(doc, 'header', 'edital-tab__header');

    const titleBlock = _el(doc, 'div', 'edital-tab__titleblock');
    titleBlock.appendChild(_el(doc, 'h2', 'edital-tab__title', data.titulo || data.editalId));
    const metaParts = [`Edital ${data.editalId}`];
    if (data.geradoEm) metaParts.push(`verificado em ${_formatDate(data.geradoEm)}`);
    titleBlock.appendChild(_el(doc, 'p', 'edital-tab__meta', metaParts.join(' \u00B7 ')));
    header.appendChild(titleBlock);

    const gate = _el(
        doc,
        'span',
        data.prontoParaSubmeter ? 'edital-tab__gate edital-tab__gate--ok' : 'edital-tab__gate edital-tab__gate--blocked',
        data.prontoParaSubmeter ? 'Pronto para submeter' : 'Pendencias bloqueiam a submissao',
    );
    gate.setAttribute('role', 'status');
    header.appendChild(gate);

    return header;
}

function _buildSummary(doc: Document, itens: EditalItemConformidade[]): HTMLElement {
    const counts: Record<EditalStatusConformidade, number> = { OK: 0, PARCIAL: 0, FALTA: 0, NAO_APLICAVEL: 0 };
    for (const item of itens) {
        if (counts[item.status] !== undefined) counts[item.status] += 1;
    }
    const summary = _el(doc, 'div', 'edital-tab__summary');
    summary.setAttribute('aria-label', 'Resumo da conformidade');
    const rows: Array<[EditalStatusConformidade, string]> = [
        ['OK', 'edital-tab__count--ok'],
        ['PARCIAL', 'edital-tab__count--parcial'],
        ['FALTA', 'edital-tab__count--falta'],
        ['NAO_APLICAVEL', 'edital-tab__count--na'],
    ];
    for (const [status, cls] of rows) {
        summary.appendChild(_el(doc, 'span', `edital-tab__count ${cls}`, `${counts[status]} ${STATUS_LABEL[status]}`));
    }
    return summary;
}

function _buildRerunButton(doc: Document, data: EditalData): HTMLButtonElement {
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'edital-tab__rerun';
    btn.textContent = 'Re-executar conformidade';
    btn.addEventListener('click', () => {
        doc.dispatchEvent(
            new CustomEvent(EDITAL_RERUN_EVENT, {
                detail: { editalId: data.editalId, projectId: data.projectId ?? null },
            }),
        );
    });
    return btn;
}

function _buildChecklist(doc: Document, itens: EditalItemConformidade[]): HTMLElement {
    const section = _el(doc, 'section', 'edital-tab__section');
    const heading = _el(doc, 'h3', 'edital-tab__sectiontitle', 'Checklist de conformidade');
    const headingId = 'edital-tab-checklist-title';
    heading.id = headingId;
    section.appendChild(heading);

    if (itens.length === 0) {
        section.appendChild(_el(doc, 'p', 'edital-tab__empty', 'Nenhum requisito verificado ainda.'));
        return section;
    }

    const list = _el(doc, 'ul', 'edital-tab__list');
    list.setAttribute('role', 'list');
    list.setAttribute('aria-labelledby', headingId);

    for (const item of itens) {
        const itemClass = `edital-tab__item edital-tab__item--${STATUS_CLASS[item.status].replace('edital-status--', '')}`;
        const li = _el(doc, 'li', itemClass);

        li.appendChild(_el(doc, 'span', `edital-tab__status ${STATUS_CLASS[item.status]}`, STATUS_LABEL[item.status]));

        const body = _el(doc, 'div', 'edital-tab__itembody');

        const req = _el(doc, 'p', 'edital-tab__req');
        const reqId = _el(doc, 'span', 'edital-tab__reqid', item.requisitoId);
        req.appendChild(reqId);
        if (item.texto) req.appendChild(doc.createTextNode(` \u2014 ${item.texto}`));
        if (item.obrigatorio && item.status === 'FALTA') {
            req.appendChild(doc.createTextNode(' '));
            req.appendChild(_el(doc, 'span', 'edital-tab__obrig', '(obrigatorio)'));
        }
        body.appendChild(req);

        if (item.onde) body.appendChild(_el(doc, 'p', 'edital-tab__onde', `Onde: ${item.onde}`));
        if (item.evidencia) body.appendChild(_el(doc, 'blockquote', 'edital-tab__evidencia', item.evidencia));

        li.appendChild(body);
        list.appendChild(li);
    }

    section.appendChild(list);
    return section;
}

function _buildGaps(doc: Document, gaps: EditalGap[]): HTMLElement {
    const section = _el(doc, 'section', 'edital-tab__section');
    const heading = _el(doc, 'h3', 'edital-tab__sectiontitle', 'Gaps \u2014 documentos satelites');
    const headingId = 'edital-tab-gaps-title';
    heading.id = headingId;
    section.appendChild(heading);

    if (gaps.length === 0) {
        section.appendChild(_el(doc, 'p', 'edital-tab__empty', 'Nenhum gap de documento satelite.'));
        return section;
    }

    const list = _el(doc, 'ul', 'edital-tab__list');
    list.setAttribute('role', 'list');
    list.setAttribute('aria-labelledby', headingId);

    for (const gap of gaps) {
        const li = _el(doc, 'li', gap.vencido ? 'edital-tab__gap edital-tab__gap--vencido' : 'edital-tab__gap');

        const head = _el(doc, 'div', 'edital-tab__gaphead');
        head.appendChild(_el(doc, 'span', 'edital-tab__gapdoc', gap.documento));
        head.appendChild(_el(doc, 'span', 'edital-tab__gapdeadline', `Prazo: ${_formatDate(gap.prazoLimite)}`));
        if (gap.vencido) head.appendChild(_el(doc, 'span', 'edital-tab__gapflag', 'Vencido'));
        li.appendChild(head);

        if (gap.motivo) li.appendChild(_el(doc, 'p', 'edital-tab__gapmotivo', gap.motivo));

        list.appendChild(li);
    }

    section.appendChild(list);
    return section;
}

/**
 * Renderiza/atualiza a aba "Edital" dentro de `container`. Idempotente:
 * limpa o container e remont a partir de `editalData`. Dados nulos/invalidos
 * renderizam empty-state (fail-loud visual, nunca conteudo inventado).
 */
export function renderEditalTab(container: HTMLElement | null | undefined, editalData: EditalData | null | undefined): void {
    if (!container) return;
    const doc = container.ownerDocument;
    _ensureStyles(doc);
    container.textContent = '';

    if (!_isValidEditalData(editalData)) {
        const root = _el(doc, 'div', 'edital-tab');
        root.appendChild(_el(doc, 'p', 'edital-tab__empty', 'Nenhum relatorio de conformidade disponivel. Execute a verificacao de conformidade do edital.'));
        container.appendChild(root);
        return;
    }

    const data = editalData;
    const root = _el(doc, 'div', 'edital-tab');
    root.appendChild(_buildHeader(doc, data));
    root.appendChild(_buildSummary(doc, data.itens));
    root.appendChild(_buildRerunButton(doc, data));
    root.appendChild(_buildChecklist(doc, data.itens));
    root.appendChild(_buildGaps(doc, data.gaps));
    container.appendChild(root);
}
