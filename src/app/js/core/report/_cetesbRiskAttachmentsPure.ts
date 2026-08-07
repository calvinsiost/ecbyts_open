// CETESB-RISK-001 Sub-5.1.1 + Sub-5.1.2 — anexação automática das 4 planilhas
// oficiais CETESB v4.00 como Anexo F do relatório.
//
// Pure-logic: gera os metadados de anexo (URL + nome + descrição + checksum hint)
// para os 4 cenários receptor. Caller (report editor / AI template CETESB IC)
// renderiza HTML/Markdown com os links.
//
// Decisão produto (Sub-5.1.2): **referência URL CETESB ao invés de bundle .xlsm**.
//   - Razão 1: licença .xlsm proprietária CETESB — incompatível com AGPL-3.0
//   - Razão 2: tamanho ~14MB por planilha × 4 = 56MB no bundle (impacto deploy)
//   - Razão 3: versionamento — usuário deve baixar versão atual do portal CETESB
//   - Razão 4: link CETESB carrega autoridade regulatória implícita
//
// Spec: docs/specs/features/SPEC_CETESB_RISK_ASSESSMENT.md
// ADR: core/risk/cetesb/ADR.md (A1: implementação independente)

import type { ScenarioId } from '../risk/cetesb/_riskCatalogPure.js';

/** Metadados de anexo CETESB para Anexo F do relatório. */
export interface CetesbAttachment {
    /** ID do cenário receptor associado. */
    readonly scenarioId: ScenarioId;
    /** Nome humano legível (pt-BR). */
    readonly displayName: string;
    /** Nome do arquivo .xlsm original (referência). */
    readonly fileName: string;
    /** URL oficial do portal CETESB (fonte canônica). */
    readonly officialUrl: string;
    /** Versão da planilha (carimbada). */
    readonly version: string;
    /** Data de vigência da Decisão de Diretoria. */
    readonly ddReference: string;
    /** Descrição curta do escopo do anexo. */
    readonly description: string;
}

/** Versão oficial CETESB v4.00 (abril 2026) — atualizar quando CETESB publicar v4.0X. */
const CETESB_VERSION = 'v4.00 (abril 2026)';
const CETESB_DD = 'CETESB DD 103/2007/C/E + DD 038/2017/C';

/** URL base do portal CETESB onde as planilhas são disponibilizadas. */
const CETESB_PORTAL_BASE = 'https://cetesb.sp.gov.br/areas-contaminadas/planilhas-para-avaliacao-de-risco/';

const ATTACHMENTS: ReadonlyArray<CetesbAttachment> = Object.freeze([
    Object.freeze({
        scenarioId: 'RES_URB' as ScenarioId,
        displayName: 'Planilha CETESB — Cenário Residencial Urbano',
        fileName: 'CETESBRisk-v4.00–ResUrb-Abr2026.xlsm',
        officialUrl: CETESB_PORTAL_BASE,
        version: CETESB_VERSION,
        ddReference: CETESB_DD,
        description: 'Avaliação de risco saúde humana para receptor residencial urbano (criança + adulto).',
    }),
    Object.freeze({
        scenarioId: 'RES_RUR' as ScenarioId,
        displayName: 'Planilha CETESB — Cenário Residencial Rural',
        fileName: 'CETESBRisk-v4.00–ResRural-Abr2026.xlsm',
        officialUrl: CETESB_PORTAL_BASE,
        version: CETESB_VERSION,
        ddReference: CETESB_DD,
        description: 'Avaliação de risco saúde humana para receptor residencial rural (criança + adulto + ingestão de vegetais cultivados).',
    }),
    Object.freeze({
        scenarioId: 'TRAB_COM_IND' as ScenarioId,
        displayName: 'Planilha CETESB — Cenário Trabalhador Comercial/Industrial',
        fileName: 'CETESBRisk-v4.00–TrabComInd-Abr2026.xlsm',
        officialUrl: CETESB_PORTAL_BASE,
        version: CETESB_VERSION,
        ddReference: CETESB_DD,
        description: 'Avaliação de risco saúde humana para trabalhador adulto em ambiente comercial/industrial.',
    }),
    Object.freeze({
        scenarioId: 'TRAB_OBRA_CIV' as ScenarioId,
        displayName: 'Planilha CETESB — Cenário Trabalhador em Obra Civil',
        fileName: 'CETESBRisk-v4.00–TrabObraCiv-Abr2026.xlsm',
        officialUrl: CETESB_PORTAL_BASE,
        version: CETESB_VERSION,
        ddReference: CETESB_DD,
        description: 'Avaliação de risco saúde humana para trabalhador adulto em obra civil (escavação, movimentação de solo).',
    }),
]);

/** Lista imutável dos 4 anexos CETESB. */
export function listCetesbAttachments(): ReadonlyArray<CetesbAttachment> {
    return ATTACHMENTS;
}

/** Lookup por scenarioId. Retorna null se cenário desconhecido. */
export function getCetesbAttachment(scenarioId: string): CetesbAttachment | null {
    return ATTACHMENTS.find((a) => a.scenarioId === scenarioId) || null;
}

/**
 * Filtra anexos pelos cenários realmente utilizados no relatório.
 * Anexar TODAS as 4 planilhas quando o relatório usa apenas 1 cenário é overhead.
 */
export function filterCetesbAttachments(
    scenariosUsed: ReadonlyArray<string>,
): ReadonlyArray<CetesbAttachment> {
    if (!Array.isArray(scenariosUsed) || scenariosUsed.length === 0) return ATTACHMENTS;
    const usedSet = new Set(scenariosUsed);
    return ATTACHMENTS.filter((a) => usedSet.has(a.scenarioId));
}

/**
 * Gera bloco HTML para inserção no relatório (Anexo F).
 * XSS-safe: textContent equivalente (sem interpolação de user input).
 */
export function buildAttachmentsHtml(
    attachments: ReadonlyArray<CetesbAttachment> = ATTACHMENTS,
): string {
    if (!attachments.length) return '';
    const items = attachments
        .map((a) => {
            const safeUrl = String(a.officialUrl).replace(/"/g, '&quot;');
            const safeName = String(a.displayName).replace(/</g, '&lt;');
            const safeFile = String(a.fileName).replace(/</g, '&lt;');
            const safeDesc = String(a.description).replace(/</g, '&lt;');
            return `<li class="cetesb-attachment">
    <a href="${safeUrl}" target="_blank" rel="noopener noreferrer"><strong>${safeName}</strong></a>
    <div class="cetesb-attachment-meta">
        <span class="cetesb-attachment-file">${safeFile}</span>
        <span class="cetesb-attachment-version">${a.version}</span>
    </div>
    <p class="cetesb-attachment-desc">${safeDesc}</p>
</li>`;
        })
        .join('\n');
    return `<section class="cetesb-attachments-block">
<h2>Anexo F — Planilhas Oficiais de Avaliação de Risco CETESB</h2>
<p class="cetesb-attachments-intro">Fonte regulatória: ${CETESB_DD}. Versão: ${CETESB_VERSION}.</p>
<ul class="cetesb-attachments-list">
${items}
</ul>
<p class="cetesb-attachments-note"><em>Nota: por questões de licenciamento, os arquivos <code>.xlsm</code> não são distribuídos pelo ecbyts. Baixe a versão atual diretamente do portal CETESB para garantir parity de versão regulatória.</em></p>
</section>`;
}

/** Gera bloco Markdown para inserção em report Markdown. */
export function buildAttachmentsMarkdown(
    attachments: ReadonlyArray<CetesbAttachment> = ATTACHMENTS,
): string {
    if (!attachments.length) return '';
    const items = attachments
        .map(
            (a) =>
                `- **[${a.displayName}](${a.officialUrl})** \`${a.fileName}\` (${a.version})\n  ${a.description}`,
        )
        .join('\n');
    return `## Anexo F — Planilhas Oficiais de Avaliação de Risco CETESB

Fonte regulatória: ${CETESB_DD}. Versão: ${CETESB_VERSION}.

${items}

> _Nota: por questões de licenciamento, os arquivos \`.xlsm\` não são distribuídos pelo ecbyts. Baixe a versão atual diretamente do portal CETESB para garantir parity de versão regulatória._`;
}

/** Constantes públicas para auditoria/uso externo. */
export const CETESB_ATTACHMENTS_META = Object.freeze({
    version: CETESB_VERSION,
    ddReference: CETESB_DD,
    portalBase: CETESB_PORTAL_BASE,
    count: ATTACHMENTS.length,
});

/**
 * Render do placeholder `{{cetesbAttachments}}` no template AI Report (Sub-5.1.3).
 *
 * Wire: `_aiReportTemplatePure.PLACEHOLDER_WHITELIST` inclui `cetesbAttachments`.
 * Caller (template renderer) chama esta função quando o context tem
 * `flags.includeCetesbAttachments=true` E o relatório usou ao menos 1 cenário CETESB.
 *
 * Comportamento:
 *   - flag false ou ausente → string vazia (placeholder vira "")
 *   - flag true + scenariosUsed[] → Markdown filtrado pelos cenários usados
 *   - flag true + scenariosUsed vazio → Markdown com TODOS os 4 anexos
 *
 * Anti-XSS / anti-confusão: nunca retorna HTML cru — sempre Markdown estruturado
 * que o pipeline de render do template processa (escape downstream).
 */
export function renderCetesbAttachmentsPlaceholder(
    flags: { includeCetesbAttachments?: boolean } | null | undefined,
    scenariosUsed: ReadonlyArray<string> = [],
): string {
    if (!flags || flags.includeCetesbAttachments !== true) return '';
    const filtered = filterCetesbAttachments(scenariosUsed);
    return buildAttachmentsMarkdown(filtered);
}
