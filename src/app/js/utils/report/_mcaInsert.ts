// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Inserção do MCA (Modelo Conceitual da Área) no relatório — SPEC_MCA Fase B.1.
// Constrói o CSM dos elementos do modelo (core/mca Fase A), insere a seção HTML +
// o diagrama source-pathway-receptor como figura SVG. Reusa o sistema de figuras (P1-9).
import { t } from '../i18n/translations.js';
import { showToast } from '../ui/toast.js';
import { createLogger } from '../helpers/logger.js';
// Side-effect: registra o kind portável `csm` + expõe window.exportMcaEcbt/importMcaEcbt
// quando o MCA é usado (P1-10×P1-11 bridge). applyImport do kind faz lazy-import deste módulo.
import './_mcaPortableKind.js';

const log = createLogger('McaInsert');

/**
 * Gera o MCA a partir do modelo atual e insere no relatório: seção (texto + matriz de
 * linkages) + diagrama SVG fonte→receptor (embutido como figura base64, durável em
 * export PDF/DOCX e na chave .ecbt).
 */
export async function insertMcaIntoReport(): Promise<void> {
    try {
        const [{ getAllElements }, csm]: any = await Promise.all([
            import('../../core/elements/manager.js' as string),
            import('../../core/mca/_csmPure.js' as string),
        ]);
        const els = (typeof getAllElements === 'function' && getAllElements()) || [];
        const model = csm.buildCsmFromElements(els, new Date().toISOString());
        if (model.sources.length === 0 && model.receptors.length === 0) {
            showToast(t('mca.empty') || 'Adicione fontes e/ou receptores ao modelo antes de gerar o MCA.', 'warning');
            return;
        }
        // Classificação GAC (Decreto 59.263) a partir das excedências reais — prepend à seção.
        const gacHtml = await _buildGacHtml(els);
        await insertCsmIntoReport(model, gacHtml);
    } catch (e: any) {
        log.error('insert MCA failed:', e?.message || e);
        showToast(t('mca.failed') || 'Falha ao gerar o Modelo Conceitual da Área.', 'error');
    }
}

/**
 * Computa a classificação GAC (Decreto 59.263) das excedências reais e devolve um
 * snippet HTML. Defensivo: se a coleta/classificação falhar, retorna ''.
 */
async function _buildGacHtml(elements: any[]): Promise<string> {
    try {
        const [{ gatherGroundingData }, gac]: any = await Promise.all([
            import('./_reportGroundingGather.js' as string),
            import('../../core/validation/gacClassification.js' as string),
        ]);
        const { exceedances } = await gatherGroundingData(elements);
        const facts = gac.gacFactsFromExceedances(exceedances);
        const c = gac.classifyGacStatus(facts);
        const esc = (s: unknown) =>
            String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        let html = '';
        if (c.code) {
            html += `<p><strong>Classificação GAC (Decreto SP 59.263/2013):</strong> ${esc(c.code)} — ${esc(c.label)}. <em>${esc(c.rationale)}</em></p>`;
        }
        // Coordenadas UTM SIRGAS 2000 no centro da área (CETESB DD 038/2017, Cap 2 Fase I).
        try {
            const [rb, utm, coords]: any = await Promise.all([
                import('../../core/io/geo/radiusBuffer.js' as string),
                import('../../core/io/geo/areaCentroidUtm.js' as string),
                import('../../core/io/geo/coordinates.js' as string),
            ]);
            const centroid = rb.computeCentroid(elements);
            if (centroid) {
                const origin = typeof coords.hasOrigin === 'function' && coords.hasOrigin() && typeof coords.getEffectiveOrigin === 'function' ? coords.getEffectiveOrigin() : null;
                const u = utm.relativeCentroidToUtm(centroid, origin);
                html += `<p><strong>Coordenadas UTM SIRGAS 2000 (centro da área):</strong> ${esc(utm.formatUtmSirgas(u))}</p>`;
            }
            // Bens a proteger no raio do framework regulatório ativo (TRUST-010 W11 adoption).
            // Default = CETESB DD-038 500m (backward compat); US/EPA = 1609m; EU = 500m; JP = 250m.
            const s = rb.summarizeAroundCentroid(elements, rb.getActiveBufferRadiusM());
            if (s && s.total > 0) {
                const fam = Object.entries(s.byFamily)
                    .map(([f, n]) => `${n} ${f}`)
                    .join(', ');
                html += `<p><strong>Entorno (raio de ${s.radiusM} m):</strong> ${s.total} elemento(s) — ${esc(fam)}.</p>`;
            }
        } catch (re: any) {
            log.debug?.('[mcaInsert:geo]', re?.message || re);
        }
        return html;
    } catch (e: any) {
        log.debug?.('[mcaInsert:gac]', e?.message || e);
        return '';
    }
}

/**
 * Insere um CSM JÁ CONSTRUÍDO no relatório (seção HTML + diagrama SVG como figura).
 * Reusado pela inserção a partir do modelo e pelo import de .ecbt (kind csm).
 * @param model HTML opcional inserido antes da seção (ex: classificação GAC).
 */
export async function insertCsmIntoReport(model: any, prependHtml = ''): Promise<boolean> {
    const [csm, fig]: any = await Promise.all([
        import('../../core/mca/_csmPure.js' as string),
        import('./_reportFigurePure.js' as string),
    ]);
    const sectionHtml = (prependHtml || '') + csm.buildMcaSectionHtml(model);
    const svg = csm.buildCsmDiagramSvg(model);
    const b64 = fig.bytesToBase64(new TextEncoder().encode(svg));
    const figHtml = fig.buildFigureHtml({
        src: `data:image/svg+xml;base64,${b64}`,
        caption: t('mca.diagramCaption') || 'Diagrama do Modelo Conceitual da Área (fonte → caminho → receptor)',
    });
    const ed: any = await import('./editor.js' as string);
    const ok = ed.insertFigureHtml?.(sectionHtml + figHtml);
    if (ok) {
        showToast(t('mca.inserted') || 'Modelo Conceitual da Área inserido no relatório', 'success');
    } else {
        showToast(t('reportFigure.editorClosed') || 'Abra o editor de relatório primeiro.', 'warning');
    }
    return !!ok;
}

if (typeof window !== 'undefined') {
    (window as any).handleInsertMca = insertMcaIntoReport;
}
