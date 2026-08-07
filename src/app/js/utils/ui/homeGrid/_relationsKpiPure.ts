// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   RELATIONS KPI STRIP — VM dos KPIs científicos para o painel de Relações
   GRAPH-KPI-001 (Calvin 2026-06-14). Consome core/analytics/graphMetrics.

   Traduz o resultado do motor (network science genérico) em cards compactos com
   VALOR formatado + LEITURA AMBIENTAL (hint) + TOM (neutral/warn/critical).
   A leitura ambiental fica aqui (camada de UI), mantendo o motor domain-agnostic
   conforme ADR-GRAPH-METRICS-001 A5.

   Pure: sem DOM. Retorna array frozen de cards.
   ================================================================ */

export type KpiTone = 'neutral' | 'warn' | 'critical';

export interface GraphKpiCard {
    readonly key: string;
    readonly labelKey: string;
    readonly labelFallback: string;
    readonly value: string;
    readonly hintKey: string;
    readonly hintFallback: string;
    readonly tone: KpiTone;
    /** A5: qualificador opcional anexado ao valor (ex.: modularidade "fraca"). */
    readonly valueExtraKey?: string;
    readonly valueExtraFallback?: string;
}

/**
 * A5 (SPEC_RELATIONS_PANEL_KPI_POLISH): rótulo qualitativo da modularidade Q.
 * Newman & Girvan 2004: Q ≳ 0,3 indica estrutura de comunidade significativa;
 * Q ≤ 0 = partição não melhor que aleatória. Evita que "-0,1" pareça erro.
 */
export function qualifyModularity(q: number): { key: string; fallback: string } {
    if (!Number.isFinite(q)) return { key: 'actionsRelations.modularityNone', fallback: '—' };
    if (q >= 0.3) return { key: 'actionsRelations.modularityStrong', fallback: 'forte' };
    if (q >= 0.1) return { key: 'actionsRelations.modularityModerate', fallback: 'moderada' };
    if (q > 0) return { key: 'actionsRelations.modularityWeak', fallback: 'fraca' };
    return { key: 'actionsRelations.modularityNone', fallback: '—' };
}

export interface KpiStripOptions {
    /** Resolve id de nó → nome legível (default: o próprio id). */
    readonly labelOf?: (id: string) => string;
}

/** Formata fração [0,1] como percentual inteiro (ex.: 0.123 → "12%"). */
function fmtPct(x: number): string {
    if (!Number.isFinite(x)) return '0%';
    return `${Math.round(x * 100)}%`;
}

/** Formata número com 1 casa decimal, vírgula decimal (pt-BR). */
function fmtNum1(x: number): string {
    if (!Number.isFinite(x)) return '0';
    return (Math.round(x * 10) / 10).toString().replace('.', ',');
}

/**
 * Constrói os cards de KPI a partir do resultado do motor de métricas.
 * Ordena por relevância de decisão (risco de conectividade primeiro).
 */
export function buildGraphKpiStripVM(result: any, opts: KpiStripOptions = {}): ReadonlyArray<GraphKpiCard> {
    if (!result || typeof result !== 'object') return Object.freeze([]);
    const labelOf = typeof opts.labelOf === 'function' ? opts.labelOf : (id: string) => id;
    const cards: GraphKpiCard[] = [];

    // 1. Tamanho do grafo (sempre)
    cards.push(
        Object.freeze({
            key: 'size',
            labelKey: 'actionsRelations.kpiSize',
            labelFallback: 'Nós e relações',
            value: `${result.nodeCount} · ${result.edgeCount}`,
            hintKey: 'actionsRelations.kpiSizeHint',
            hintFallback: 'Elementos e vínculos no grafo do modelo.',
            tone: 'neutral',
        }),
    );

    // 2. Pontos de articulação — elo único do CSM (mais acionável)
    const artic = result.connectivityRisk?.articulationPoints || [];
    if (artic.length > 0) {
        const names = artic.slice(0, 3).map((id: string) => labelOf(id)).join(', ');
        cards.push(
            Object.freeze({
                key: 'articulation',
                labelKey: 'actionsRelations.kpiArticulation',
                labelFallback: 'Pontos de articulação',
                value: `${artic.length}${names ? ` · ${names}` : ''}`,
                hintKey: 'actionsRelations.kpiArticulationHint',
                hintFallback: 'Elo único: se este dado falhar, desconecta o modelo (ponto único de falha).',
                tone: 'critical',
            }),
        );
    }

    // 3. Pontes — relação crítica única
    const bridges = result.connectivityRisk?.bridges || [];
    if (bridges.length > 0) {
        cards.push(
            Object.freeze({
                key: 'bridges',
                labelKey: 'actionsRelations.kpiBridges',
                labelFallback: 'Pontes (relações críticas)',
                value: String(bridges.length),
                hintKey: 'actionsRelations.kpiBridgesHint',
                hintFallback: 'Relações cuja remoção isola parte do modelo.',
                tone: 'warn',
            }),
        );
    }

    // 4. Componentes conexos — partes isoladas
    const comp = result.components || { count: 0, isolatedCount: 0 };
    if (comp.count > 1) {
        cards.push(
            Object.freeze({
                key: 'components',
                labelKey: 'actionsRelations.kpiComponents',
                labelFallback: 'Partes isoladas',
                value: `${comp.count}${comp.isolatedCount ? ` · ${comp.isolatedCount} solto(s)` : ''}`,
                hintKey: 'actionsRelations.kpiComponentsHint',
                hintFallback: 'O modelo tem subgrafos sem ligação — pode ser lacuna de dado.',
                tone: 'warn',
            }),
        );
    }

    // 5. Caminho crítico (betweenness) — quem concentra a passagem
    if (result.betweenness && !result.betweenness.skipped && result.betweenness.top?.length > 0) {
        const topB = result.betweenness.top[0];
        if (topB.score > 0) {
            cards.push(
                Object.freeze({
                    key: 'betweenness',
                    labelKey: 'actionsRelations.kpiBetweenness',
                    labelFallback: 'Caminho crítico',
                    value: `${labelOf(topB.id)} · ${fmtPct(topB.score)}`,
                    hintKey: 'actionsRelations.kpiBetweennessHint',
                    hintFallback: 'Elemento que concentra a passagem entre os demais (intermediação).',
                    tone: 'neutral',
                }),
            );
        }
    }

    // 6. Hub (grau) — elemento mais conectado
    const deg = result.degree;
    if (deg && deg.topByDegree?.length > 0) {
        const hub = deg.topByDegree[0];
        cards.push(
            Object.freeze({
                key: 'degree',
                labelKey: 'actionsRelations.kpiDegree',
                labelFallback: 'Mais conectado',
                value: `${labelOf(hub.id)} · ${hub.score}`,
                hintKey: 'actionsRelations.kpiDegreeHint',
                hintFallback: `Grau médio do modelo: ${fmtNum1(deg.mean)}.`,
                tone: 'neutral',
            }),
        );
    }

    // 7. Densidade
    cards.push(
        Object.freeze({
            key: 'density',
            labelKey: 'actionsRelations.kpiDensity',
            labelFallback: 'Densidade',
            value: fmtPct(result.density || 0),
            hintKey: 'actionsRelations.kpiDensityHint',
            hintFallback: 'Quão interligado é o modelo (relações reais ÷ possíveis).',
            tone: 'neutral',
        }),
    );

    // 8. Coesão local (clustering)
    cards.push(
        Object.freeze({
            key: 'clustering',
            labelKey: 'actionsRelations.kpiClustering',
            labelFallback: 'Coesão local',
            value: fmtPct(result.clusteringGlobal || 0),
            hintKey: 'actionsRelations.kpiClusteringHint',
            hintFallback: 'Tendência de os vizinhos de um nó também se ligarem (agrupamento).',
            tone: 'neutral',
        }),
    );

    // 9. Diâmetro (se calculado)
    if (result.spread && !result.spread.skipped && result.spread.diameter > 0) {
        cards.push(
            Object.freeze({
                key: 'diameter',
                labelKey: 'actionsRelations.kpiDiameter',
                labelFallback: 'Diâmetro',
                value: `${result.spread.diameter}`,
                hintKey: 'actionsRelations.kpiDiameterHint',
                hintFallback: `Maior distância entre dois elementos. Caminho médio ${fmtNum1(result.spread.averagePathLength)}.`,
                tone: 'neutral',
            }),
        );
    }

    // 10. Modularidade (se houver partição) — A5: + rótulo qualitativo
    if (typeof result.modularity === 'number') {
        const qual = qualifyModularity(result.modularity);
        cards.push(
            Object.freeze({
                key: 'modularity',
                labelKey: 'actionsRelations.kpiModularity',
                labelFallback: 'Modularidade',
                value: fmtNum1(result.modularity),
                hintKey: 'actionsRelations.kpiModularityHint',
                hintFallback: 'Quão bem o modelo se separa em zonas/famílias (comunidades).',
                tone: 'neutral',
                valueExtraKey: qual.key,
                valueExtraFallback: qual.fallback,
            }),
        );
    }

    return Object.freeze(cards);
}

/** Tom agregado do grafo (para um indicador-resumo): pior tom presente. */
export function resolveStripWorstTone(cards: ReadonlyArray<GraphKpiCard>): KpiTone {
    let worst: KpiTone = 'neutral';
    for (const c of cards) {
        if (c.tone === 'critical') return 'critical';
        if (c.tone === 'warn') worst = 'warn';
    }
    return worst;
}
