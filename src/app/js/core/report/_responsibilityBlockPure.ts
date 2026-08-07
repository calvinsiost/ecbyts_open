// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Bloco de Responsáveis + Declaração de Responsabilidade (CETESB DD 038/2017/C +
// Decreto SP 59.263/2013). Seção obrigatória dos relatórios de Avaliação Preliminar
// (itens s/t) e Investigação Confirmatória (itens q/r): identificação dos Responsáveis
// Legal e Técnico (nome/e-mail/endereço) + Declaração de Responsabilidade assinada.
//
// Pure-logic: monta o scaffold HTML escapado, com marcadores "[A PREENCHER: …]" para os
// campos não fornecidos (o Responsável Técnico completa no editor). DOM-free, testável.

export type Responsible = { name?: string; email?: string; address?: string; registro?: string };
export type ResponsibilityData = { legal?: Responsible; technical?: Responsible; declarationDate?: string };

const _esc = (s: unknown): string =>
    String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

/** Campo: valor escapado se fornecido, senão marcador [A PREENCHER: label]. */
function _field(value: unknown, label: string): string {
    const v = value != null && String(value).trim() !== '' ? String(value).trim() : '';
    return v ? _esc(v) : `[A PREENCHER: ${_esc(label)}]`;
}

/** Texto canônico da Declaração de Responsabilidade (CETESB/Decreto 59.263). */
export const DECLARATION_TEXT =
    'Declaramos, sob as penas da lei, que as informações prestadas neste relatório são ' +
    'verdadeiras e que os serviços foram executados em conformidade com as normas técnicas ' +
    'aplicáveis e a legislação ambiental vigente (CETESB DD 038/2017/C; Decreto Estadual SP ' +
    '59.263/2013).';

/**
 * Monta o bloco HTML "Responsáveis e Declaração de Responsabilidade" para o relatório.
 * Campos ausentes viram marcadores [A PREENCHER: …]. Sempre inclui o texto da declaração
 * e as linhas de assinatura.
 */
export function buildResponsibilityBlockHtml(data?: ResponsibilityData): string {
    const d = data || {};
    const legal = d.legal || {};
    const tech = d.technical || {};
    return (
        '<h2>Responsáveis e Declaração de Responsabilidade</h2>' +
        '<h3>Responsável Legal</h3>' +
        `<p>Nome: ${_field(legal.name, 'nome do responsável legal')}<br />` +
        `E-mail: ${_field(legal.email, 'e-mail')}<br />` +
        `Endereço: ${_field(legal.address, 'endereço completo')}</p>` +
        '<h3>Responsável Técnico</h3>' +
        `<p>Nome: ${_field(tech.name, 'nome do responsável técnico')}<br />` +
        `Registro profissional (CREA/CRQ): ${_field(tech.registro, 'registro profissional')}<br />` +
        `E-mail: ${_field(tech.email, 'e-mail')}<br />` +
        `Endereço: ${_field(tech.address, 'endereço completo')}</p>` +
        '<h3>Declaração de Responsabilidade</h3>' +
        `<p>${_esc(DECLARATION_TEXT)}</p>` +
        `<p>Data: ${_field(d.declarationDate, 'data')}</p>` +
        '<p>_________________________________<br />Responsável Legal</p>' +
        '<p>_________________________________<br />Responsável Técnico</p>'
    );
}
