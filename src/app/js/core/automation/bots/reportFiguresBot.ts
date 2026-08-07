// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Report Figures Bot — automação genérica de figuras de relatório. NÃO conhece tipos de
 * figura específicos: itera TODOS os provedores registrados no figureProviderRegistry e
 * insere as figuras aplicáveis no relatório ativo. Built-ins (raio 500 m, cena 3D/plumas,
 * mapas geo/pedo das Libraries) auto-registram via utils/report/figureProviders; features
 * futuras (inclusive de usuários) registram os seus e aparecem aqui sem alterar o bot.
 *
 * Reage ao evento 'report_figures_requested'.
 *
 * @module core/automation/bots/reportFiguresBot
 */
import { createLogger } from '../../../utils/helpers/logger.js';
const log = createLogger('reportFiguresBot');

export const reportFiguresBot = {
    name: 'Figuras do Relatório',
    description: 'Insere automaticamente as figuras dos provedores registrados (raio 500 m, plumas, mapas geo/pedo, e futuras) no relatório ativo',
    defaultConfig: {
        enabled: true,
    },
    /**
     * @param {string} eventType
     * @param {{elements?: any[], model?: any, reportId?: string, providers?: string[]}} payload
     * @param {object} _config
     */
    onEvent: async (eventType: any, payload: any, _config: any) => {
        if (eventType !== 'report_figures_requested') return;

        let elements = payload?.elements;
        if (!Array.isArray(elements)) {
            try {
                const { getAllElements }: any = await import('../../elements/manager.js' as string);
                elements = getAllElements?.() || [];
            } catch (e: any) {
                log.error('elements load failed:', e?.message || e);
                elements = [];
            }
        }

        // Side-effect: registra os provedores built-in (idempotente).
        await import('../../../utils/report/figureProviders.js' as string);
        const { generateAllFigures }: any = await import('../../report/figureProviderRegistry.js' as string);
        const { insertReportFigure }: any = await import('../../../utils/report/_reportFigureInsert.js' as string);

        const ctx = { elements, model: payload?.model, reportId: payload?.reportId };
        const allFigures = await generateAllFigures(ctx);
        // Filtro por template: se o caller passou uma lista de providers,
        // só insere figuras cujo providerId está nela. Templates não-DD-38
        // (Introdução, Conclusão, Resumo, Análise de Risco) declaram
        // figureProviders=[] → nenhuma figura. Sem filtro = todas applicable.
        const providerFilter = Array.isArray(payload?.providers) ? new Set(payload.providers) : null;
        const figures = providerFilter
            ? allFigures.filter((f: any) => providerFilter.has(f.providerId))
            : allFigures;

        const inserted: string[] = [];
        for (const fig of figures) {
            try {
                const ok = await insertReportFigure(fig.dataUrl, fig.caption, undefined, {
                    providerId: fig.providerId,
                    scope: fig.scope || null,
                });
                if (ok) inserted.push(fig.providerId);
            } catch (e: any) {
                log.error(`insert figure ${fig.providerId} failed:`, e?.message || e);
            }
        }

        try {
            const { showToast }: any = await import('../../../utils/ui/toast.js' as string);
            showToast(
                inserted.length
                    ? `Figuras inseridas no relatório: ${inserted.join(', ')}`
                    : 'Nenhuma figura aplicável — abra o editor de relatório e carregue dados/camadas.',
                inserted.length ? 'success' : 'warning',
            );
        } catch (e: any) {
            console.debug('[reportFiguresBot] toast:', e?.message || e);
        }
        return { action: inserted.length ? 'figures_inserted' : 'no_figures', figures: inserted };
    },
};
