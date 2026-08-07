// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Registry de PROVEDORES DE FIGURA de relatório — abstração extensível.
//
// Objetivo (diretiva Calvin): a geração automática de figuras do relatório NÃO deve ser
// hard-coded por tipo. Qualquer módulo do ecbyts — atual, futuro, ou implementado por
// usuários — registra um provedor e suas figuras passam a ser descobertas e inseridas
// automaticamente pelo módulo de automação (bot `report_figures`), em QUALQUER relatório,
// para QUALQUER família de elementos e QUALQUER função.
//
// Padrão idêntico ao portable artifacts registry (core/io/portableArtifacts). Pure (sem
// DOM) — cheap-testável. Os provedores em si podem ser browser-coupled (captura de cena
// etc.); o registry apenas os orquestra.
//
// COMO ESTENDER (qualquer feature nova):
//   import { registerFigureProvider } from 'core/report/figureProviderRegistry.js';
//   registerFigureProvider({
//     id: 'minha-figura',
//     label: 'Minha figura',
//     order: 40,                          // ordem de inserção (menor primeiro)
//     isApplicable: (ctx) => /* bool */,  // decide pelos elements/model do ctx
//     generate: async (ctx) => ({ dataUrl, caption }) | null,
//   });

export type ReportFigureContext = {
    elements?: any[];
    model?: any;
    reportId?: string | null;
    [k: string]: unknown;
};

export type GeneratedFigure = { dataUrl: string; caption: string };

/**
 * Candidato de figura = um RECORTE do dataset (ex.: pluma de benzeno · aquífero
 * intermediário · área 2). `scope` carrega o filtro (groupId, elementId, parâmetro…)
 * que `generate` usa para recortar o ctx.
 */
export type FigureCandidate = { candidateId: string; label: string; scope?: any };

export type ReportFigureProvider = {
    id: string;
    label: string;
    order?: number;
    isApplicable: (ctx: ReportFigureContext) => boolean;
    /**
     * OPCIONAL: enumera os recortes/variantes disponíveis (um por slice do dataset). Se
     * ausente, o provedor é uma figura única. Pure (sem efeitos) — usado pela UI de seleção.
     */
    listCandidates?: (ctx: ReportFigureContext) => FigureCandidate[];
    /** Gera a figura; `candidate` define o recorte quando há variantes. */
    generate: (
        ctx: ReportFigureContext,
        candidate?: FigureCandidate,
    ) => Promise<GeneratedFigure | null> | GeneratedFigure | null;
};

const _providers = new Map<string, ReportFigureProvider>();

/** Registra (ou substitui) um provedor de figura. Idempotente por id. */
export function registerFigureProvider(p: ReportFigureProvider): void {
    if (!p || typeof p !== 'object') throw new Error('figureProvider: objeto requerido');
    if (typeof p.id !== 'string' || !p.id) throw new Error('figureProvider: id (string) requerido');
    if (typeof p.isApplicable !== 'function' || typeof p.generate !== 'function') {
        throw new Error(`figureProvider ${p.id}: isApplicable + generate (funções) requeridos`);
    }
    _providers.set(p.id, { ...p, order: p.order ?? 100, label: p.label || p.id });
}

export function getFigureProvider(id: string): ReportFigureProvider | null {
    return _providers.get(id) || null;
}

/** Lista provedores registrados, ordenados por `order` (menor primeiro). */
export function listFigureProviders(): ReportFigureProvider[] {
    return Array.from(_providers.values()).sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
}

/** Limpa o registry (uso em testes). */
export function clearFigureProviders(): void {
    _providers.clear();
}

/** Provedores aplicáveis ao contexto. Erro em isApplicable trata como não-aplicável. */
export function getApplicableProviders(ctx: ReportFigureContext): ReportFigureProvider[] {
    return listFigureProviders().filter((p) => {
        try {
            return !!p.isApplicable(ctx || {});
        } catch (e: any) {
            console.debug('[figureRegistry:isApplicable]', p.id, e?.message || e);
            return false;
        }
    });
}

/**
 * Gera a figura DEFAULT de cada provedor aplicável (sem recorte). Caminho "auto rápido".
 * Cada provedor isolado. Retorna na ordem de `order`.
 */
export async function generateAllFigures(
    ctx: ReportFigureContext,
): Promise<Array<GeneratedFigure & { providerId: string; scope?: any }>> {
    const out: Array<GeneratedFigure & { providerId: string; scope?: any }> = [];
    for (const p of getApplicableProviders(ctx)) {
        try {
            const fig = await p.generate(ctx || {});
            if (fig && typeof fig.dataUrl === 'string' && fig.dataUrl) {
                out.push({
                    dataUrl: fig.dataUrl,
                    caption: fig.caption || p.label || p.id,
                    providerId: p.id,
                    scope: (fig as any).scope || undefined,
                });
            }
        } catch (e: any) {
            console.debug('[figureRegistry:generate]', p.id, e?.message || e);
        }
    }
    return out;
}

export type EnumeratedCandidate = {
    providerId: string;
    providerLabel: string;
    candidateId: string;
    label: string;
    scope?: any;
};

/**
 * Enumera TODOS os candidatos de figura (recortes) dos provedores aplicáveis — para a UI
 * de seleção. Provedor sem `listCandidates` rende 1 candidato (a figura única). Pure.
 */
export function enumerateFigureCandidates(ctx: ReportFigureContext): EnumeratedCandidate[] {
    const out: EnumeratedCandidate[] = [];
    for (const p of getApplicableProviders(ctx)) {
        let cands: FigureCandidate[] | null = null;
        if (typeof p.listCandidates === 'function') {
            try {
                cands = p.listCandidates(ctx || {});
            } catch (e: any) {
                console.debug('[figureRegistry:listCandidates]', p.id, e?.message || e);
            }
        }
        if (Array.isArray(cands) && cands.length) {
            for (const c of cands) {
                out.push({ providerId: p.id, providerLabel: p.label, candidateId: String(c.candidateId), label: c.label || c.candidateId, scope: c.scope });
            }
        } else {
            out.push({ providerId: p.id, providerLabel: p.label, candidateId: '', label: p.label });
        }
    }
    return out;
}

/**
 * Gera as figuras SELECIONADAS pelo usuário. `selection` = [{providerId, candidateId}].
 * Resolve o candidato (para o scope) e chama generate(ctx, candidate). Cada item isolado.
 */
export async function generateSelectedFigures(
    ctx: ReportFigureContext,
    selection: Array<{ providerId: string; candidateId?: string }>,
): Promise<Array<GeneratedFigure & { providerId: string; candidateId: string; scope?: any }>> {
    const out: Array<GeneratedFigure & { providerId: string; candidateId: string; scope?: any }> = [];
    for (const sel of selection || []) {
        const p = getFigureProvider(sel?.providerId);
        if (!p) continue;
        let candidate: FigureCandidate | undefined;
        if (sel.candidateId && typeof p.listCandidates === 'function') {
            try {
                candidate = (p.listCandidates(ctx || {}) || []).find((c) => String(c.candidateId) === String(sel.candidateId));
            } catch (e: any) {
                console.debug('[figureRegistry:resolveCandidate]', p.id, e?.message || e);
            }
        }
        try {
            const fig = await p.generate(ctx || {}, candidate);
            if (fig && typeof fig.dataUrl === 'string' && fig.dataUrl) {
                out.push({
                    dataUrl: fig.dataUrl,
                    caption: fig.caption || candidate?.label || p.label,
                    providerId: p.id,
                    candidateId: sel.candidateId || '',
                    scope: (fig as any).scope || candidate?.scope || undefined,
                });
            }
        } catch (e: any) {
            console.debug('[figureRegistry:generateSelected]', p.id, e?.message || e);
        }
    }
    return out;
}
