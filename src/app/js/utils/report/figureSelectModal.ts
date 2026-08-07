// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Modal de SELEÇÃO de figuras do relatório. Resolve "como o usuário escolhe quais figuras":
// enumera os candidatos (recortes do dataset) de todos os provedores registrados — ex.
// "Raio 500 m — Área 2", "Pluma — Benzeno · Área 2" — com checkboxes; o usuário marca e
// insere as selecionadas, cada uma em layout corporativo. Substitui o "auto tudo".
import { t } from '../i18n/translations.js';
import { showToast } from '../ui/toast.js';
import { escapeHtml } from '../helpers/html.js';
import { createLogger } from '../helpers/logger.js';
import { buildFigureSelectCatalogView } from './_figureSelectCatalogPure.js';

const log = createLogger('FigureSelect');
let _overlay: HTMLElement | null = null;

function _close(): void {
    if (_overlay) {
        _overlay.remove();
        _overlay = null;
    }
}

/** Abre o seletor de figuras (candidatos por provedor, com checkboxes). */
export async function openFigureSelectModal(): Promise<void> {
    let candidates: any[] = [];
    const ctx: any = { elements: [], photos: [], campaigns: [], groups: [] };
    try {
        const { getAllElements }: any = await import('../../core/elements/manager.js' as string);
        ctx.elements = getAllElements?.() || [];
        try {
            const cm: any = await import('../../core/campaigns/manager.js' as string);
            ctx.campaigns = cm.getAllCampaigns?.() || [];
        } catch (ce: any) {
            console.debug('[figSel:campaigns]', ce?.message || ce);
        }
        try {
            const gm: any = await import('../groups/manager.js' as string);
            ctx.groups = gm.getElementGroups?.() || [];
        } catch (ge: any) {
            console.debug('[figSel:groups]', ge?.message || ge);
        }
        try {
            const pl: any = await import('../../core/photolog/manager.js' as string);
            ctx.photos = pl.getAllPhotos?.() || [];
        } catch (pe: any) {
            console.debug('[figSel:photos]', pe?.message || pe);
        }
        await import('./figureProviders.js' as string); // registra built-ins (idempotente)
        const { enumerateFigureCandidates }: any = await import('../../core/report/figureProviderRegistry.js' as string);
        candidates = enumerateFigureCandidates(ctx);
    } catch (e: any) {
        log.error('enumerate candidates failed:', e?.message || e);
        showToast(t('figSel.error') || 'Falha ao listar figuras disponíveis.', 'error');
        return;
    }
    if (!candidates.length) {
        showToast(t('figSel.none') || 'Nenhuma figura disponível para o modelo atual.', 'info');
        return;
    }

    const catalogView = buildFigureSelectCatalogView(candidates, ctx);
    candidates = Array.from(catalogView.candidates);

    // Agrupa candidatos por provedor (providerLabel).
    const byProvider = new Map<string, any[]>();
    for (const c of candidates) {
        const k = c.providerLabel || c.providerId;
        if (!byProvider.has(k)) byProvider.set(k, []);
        byProvider.get(k)!.push(c);
    }
    let idx = 0;
    const groupsHtml = Array.from(byProvider.entries())
        .map(([provLabel, cands]) => {
            const rows = cands
                .map((c) => {
                    const i = idx++;
                    const checked = c.defaultChecked ? 'checked' : '';
                    const catalogMeta = c.catalogFigureTypeId
                        ? `<small class="report-figsel-catalog-meta">${escapeHtml(c.catalogFigureTypeId)} - ${escapeHtml(c.catalogRegulatoryLabel || '')}</small>`
                        : '';
                    return (
                        `<label class="report-figsel-row">` +
                        `<input type="checkbox" class="report-figsel-cb" data-i="${i}" data-provider="${escapeHtml(c.providerId)}" data-candidate="${escapeHtml(c.candidateId)}" data-figure-type="${escapeHtml(c.catalogFigureTypeId || '')}" ${checked} />` +
                        `<span>${escapeHtml(c.label)}${catalogMeta}</span></label>`
                    );
                })
                .join('');
            return `<div class="report-figsel-group"><div class="report-figsel-group-title">${escapeHtml(provLabel)}</div>${rows}</div>`;
        })
        .join('');
    const catalogGapsHtml = catalogView.gaps.length
        ? `<div class="report-figsel-group report-figsel-catalog-gaps">` +
          `<div class="report-figsel-group-title">Catalogo DD-038 pendente</div>` +
          catalogView.gaps
              .map((gap) => {
                  const reason =
                      gap.reason === 'missing-model-data'
                          ? 'dados insuficientes no modelo'
                          : 'sem renderizador conectado';
                  return (
                      `<label class="report-figsel-row report-figsel-row-disabled" title="${escapeHtml(reason)}">` +
                      `<input type="checkbox" disabled />` +
                      `<span>${escapeHtml(gap.label)}<small class="report-figsel-catalog-meta">${escapeHtml(reason)}</small></span></label>`
                  );
              })
              .join('') +
          `</div>`
        : '';

    _close();
    _overlay = document.createElement('div');
    _overlay.className = 'async-dialog-overlay report-figsel-overlay';
    _overlay.setAttribute('role', 'dialog');
    _overlay.setAttribute('aria-modal', 'true');
    _overlay.setAttribute('aria-label', t('figSel.title') || 'Selecionar figuras');
    _overlay.innerHTML = `
        <div class="async-dialog report-figsel-dialog">
            <div class="report-figsel-header">
                <span class="report-figsel-title">${escapeHtml(t('figSel.title') || 'Selecionar figuras do relatório')}</span>
                <button type="button" class="report-figsel-close" aria-label="${escapeHtml(t('close') || 'Fechar')}">&times;</button>
            </div>
            <p class="report-figsel-hint">${escapeHtml(t('figSel.hint') || 'Marque os recortes a inserir (cada um vira uma figura em layout corporativo).')}</p>
            <div class="report-figsel-body">${groupsHtml}${catalogGapsHtml}</div>
            <div class="report-figsel-actions">
                <button type="button" class="btn btn-sm report-figsel-none">${escapeHtml(t('figSel.clear') || 'Limpar')}</button>
                <button type="button" class="btn btn-sm report-figsel-all">${escapeHtml(t('figSel.all') || 'Todas')}</button>
                <button type="button" class="btn btn-primary btn-sm report-figsel-insert">${escapeHtml(t('figSel.insert') || 'Inserir selecionadas')}</button>
            </div>
        </div>`;
    document.body.appendChild(_overlay);

    const cbs = () => Array.from(_overlay?.querySelectorAll('.report-figsel-cb:not(:disabled)') || []) as HTMLInputElement[];
    _overlay.querySelector('.report-figsel-close')?.addEventListener('click', _close);
    _overlay.addEventListener('click', (e: any) => {
        if (e.target === _overlay) _close();
    });
    _overlay.querySelector('.report-figsel-none')?.addEventListener('click', () => cbs().forEach((c) => (c.checked = false)));
    _overlay.querySelector('.report-figsel-all')?.addEventListener('click', () => cbs().forEach((c) => (c.checked = true)));
    _overlay.querySelector('.report-figsel-insert')?.addEventListener('click', () => _insertSelected(ctx, candidates));
}

async function _insertSelected(ctx: any, candidates: any[]): Promise<void> {
    const selection = (Array.from(_overlay?.querySelectorAll('.report-figsel-cb:checked') || []) as HTMLInputElement[]).map((cb) => ({
        providerId: cb.getAttribute('data-provider') || '',
        candidateId: cb.getAttribute('data-candidate') || '',
        index: Number(cb.getAttribute('data-i') || '-1'),
    }));
    if (!selection.length) {
        showToast(t('figSel.pickOne') || 'Selecione ao menos uma figura.', 'warning');
        return;
    }
    try {
        const { generateSelectedFigures }: any = await import('../../core/report/figureProviderRegistry.js' as string);
        const { insertReportFigure }: any = await import('./_reportFigureInsert.js' as string);
        const figures = await generateSelectedFigures(ctx, selection);
        const selectedByKey = new Map<string, any>(
            selection.map((item) => {
                const candidate = candidates[item.index] || {};
                return [`${item.providerId}::${item.candidateId}`, candidate];
            }),
        );
        let n = 0;
        for (const f of figures) {
            const selected: any = selectedByKey.get(`${f.providerId}::${f.candidateId}`) || {};
            if (await insertReportFigure(f.dataUrl, {
                caption: f.caption,
                figureTypeId: selected.catalogFigureTypeId || null,
                subset: selected.catalogSubset || {},
                origin: {
                    providerId: f.providerId,
                    candidateId: f.candidateId,
                    scope: f.scope || null,
                },
            })) n++;
        }
        showToast(
            n ? `${n} ${t('figSel.inserted') || 'figura(s) inserida(s) no relatório'}` : t('figSel.insertFailed') || 'Abra o editor de relatório primeiro.',
            n ? 'success' : 'warning',
        );
        if (n) _close();
    } catch (e: any) {
        log.error('insert selected failed:', e?.message || e);
        showToast(t('figSel.insertFailed') || 'Falha ao inserir as figuras.', 'error');
    }
}

if (typeof window !== 'undefined') {
    (window as any).openFigureSelectModal = openFigureSelectModal;
}
