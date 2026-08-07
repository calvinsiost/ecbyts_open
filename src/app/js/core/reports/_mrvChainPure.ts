// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * MRV formal (Monitoramento → Reporte → Verificação) sobre os cenários GHG
 * existentes — pure logic. micro_activity:ECBYTS-ENERGY-SCENARIOS-001#7.
 *
 * É uma LENTE sobre o inventário GHG Protocol que JÁ existe
 * (core/reports/ghgInventory.ts, Escopos 1/2/3): não recalcula emissão —
 * reconstrói, por fonte de emissão, a CADEIA auditável
 *   dado bruto (observação) → cálculo (fator/GWP) → indicador (tCO2e)
 *   → trilha de auditoria (quem/quando/qual fonte),
 * e classifica cada elo com o status MRV:
 *   monitorado  = há observação bruta registrada;
 *   reportado   = a fonte entra no inventário (escopo declarado + gás válido);
 *   verificado  = TODAS as observações da fonte carregam `data.verified===true`.
 *
 * Alinhamento com a literatura técnica de MRV: "cálculos automatizados a
 * partir dos dados brutos dos processos modelados em cada cenário do gêmeo".
 *
 * NOT: não duplica SCENARIOS-IMPACT-001 (comparador what-if econômico) nem o
 * motor do inventário — consome os MESMOS elements/observations que o
 * ghgInventoryPanel coleta. Sem DOM, sem I/O.
 */

import type { GhgInventoryElement, GhgInventoryObservation, GhgScope } from './ghgInventory.js';

export type MrvLinkStatus = 'ok' | 'pendente';

export type MrvStage = 'monitorado' | 'reportado' | 'verificado' | 'pendente';

export interface MrvAuditEntry {
    /** Quem registrou (obs.data.recordedBy / source), ou null quando ausente. */
    readonly who: string | null;
    /** Quando (obs.date ISO). */
    readonly when: string;
    /** Qual fonte primária do dado (obs.data.dataSource / sourceUnit), ou null. */
    readonly source: string | null;
    readonly verified: boolean;
}

export interface MrvChainRow {
    readonly elementId: string;
    readonly name: string;
    readonly scope: GhgScope | null;
    readonly category: string | null;
    /** ── Elo 1: dado bruto ── */
    readonly obsCount: number;
    readonly gases: readonly string[];
    /** ── Elo 2: cálculo ── */
    readonly withEmissionFactor: number;
    readonly withGwp: number;
    /** ── Elo 3: indicador ── */
    readonly tco2e: number | null;
    /** ── Elo 4: trilha de auditoria ── */
    readonly lastAudit: MrvAuditEntry | null;
    readonly verifiedCount: number;
    /** Status consolidado do MRV desta fonte (o elo mais avançado atingido). */
    readonly stage: MrvStage;
    /** Status por elo da cadeia, na ordem monitorado/reportado/verificado. */
    readonly links: {
        readonly monitorado: MrvLinkStatus;
        readonly reportado: MrvLinkStatus;
        readonly verificado: MrvLinkStatus;
    };
}

export interface MrvSummary {
    readonly totalSources: number;
    readonly monitorado: number;
    readonly reportado: number;
    readonly verificado: number;
    readonly pendente: number;
    readonly totalTCO2e: number;
}

export interface MrvChainVM {
    readonly dataSource: 'real' | 'example';
    readonly rows: readonly MrvChainRow[];
    readonly summary: MrvSummary;
}

const VALID_SCOPES: readonly GhgScope[] = Object.freeze(['1', '2-loc', '2-mb', '3']);

function _str(v: unknown): string | null {
    return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function _gasOf(obs: GhgInventoryObservation): string | null {
    const p = typeof obs.parameterId === 'string' ? obs.parameterId : '';
    return p.startsWith('gas:') && p.length > 4 ? p.slice(4) : null;
}

/** co2e da observação: prioriza data.co2e explícito, senão value × gwp. */
export function observationCo2e(obs: GhgInventoryObservation): number | null {
    const d = obs.data;
    if (d && typeof d.co2e === 'number' && Number.isFinite(d.co2e)) return d.co2e;
    if (
        typeof obs.value === 'number' &&
        Number.isFinite(obs.value) &&
        d &&
        typeof d.gwp === 'number' &&
        Number.isFinite(d.gwp)
    ) {
        return obs.value * d.gwp;
    }
    return null;
}

function _stageOf(links: MrvChainRow['links'], obsCount: number): MrvStage {
    if (links.verificado === 'ok') return 'verificado';
    if (links.reportado === 'ok') return 'reportado';
    if (obsCount > 0) return 'monitorado';
    return 'pendente';
}

/**
 * Monta a linha MRV de UMA fonte de emissão a partir das SUAS observações.
 */
export function buildMrvRow(el: GhgInventoryElement, obsList: readonly GhgInventoryObservation[]): MrvChainRow {
    const scopeRaw = el.data?.ghgScope;
    const scope = VALID_SCOPES.includes(scopeRaw as GhgScope) ? (scopeRaw as GhgScope) : null;
    const gases = Array.from(new Set(obsList.map(_gasOf).filter((g): g is string => g !== null)));
    const withEmissionFactor = obsList.filter(
        (o) => typeof o.data?.emissionFactor === 'number' && Number.isFinite(o.data.emissionFactor),
    ).length;
    const withGwp = obsList.filter((o) => typeof o.data?.gwp === 'number' && Number.isFinite(o.data.gwp)).length;
    const co2eParts = obsList.map(observationCo2e).filter((v): v is number => v !== null);
    // N3 honesto: sem NENHUMA parcela calculável → indicador "sem dado" (null), nunca 0 forjado.
    const tco2e = co2eParts.length > 0 ? co2eParts.reduce((a, b) => a + b, 0) : null;
    const verifiedCount = obsList.filter((o) => o.data?.verified === true).length;
    const sorted = [...obsList].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const last = sorted.length > 0 ? sorted[sorted.length - 1]! : null;
    const lastAudit: MrvAuditEntry | null = last
        ? {
              who: _str(last.data?.['recordedBy']) ?? _str(last.data?.['author']),
              when: String(last.date ?? ''),
              source: _str(last.data?.['dataSource']) ?? _str(last.data?.['source']) ?? _str(last.data?.sourceUnit),
              verified: last.data?.verified === true,
          }
        : null;
    const links = {
        monitorado: (obsList.length > 0 ? 'ok' : 'pendente') as MrvLinkStatus,
        // reportado = a fonte é agregável pelo inventário: escopo válido + gás reconhecível.
        reportado: (obsList.length > 0 && scope !== null && gases.length > 0 ? 'ok' : 'pendente') as MrvLinkStatus,
        verificado: (obsList.length > 0 && verifiedCount === obsList.length ? 'ok' : 'pendente') as MrvLinkStatus,
    };
    return {
        elementId: el.id,
        name: el.name || el.id,
        scope,
        category: _str(el.data?.ghgCategory) ?? null,
        obsCount: obsList.length,
        gases,
        withEmissionFactor,
        withGwp,
        tco2e,
        lastAudit,
        verifiedCount,
        stage: _stageOf(links, obsList.length),
        links,
    };
}

/**
 * Dataset de EXEMPLO rotulado (cenário ilustrativo de biomassa/GHG) — usado
 * apenas quando o modelo não tem fonte de emissão; a tela mostra badge
 * "exemplo" (mesmo padrão honesto do comparador de cenários).
 */
export function buildExampleMrvInput(): {
    readonly elements: readonly GhgInventoryElement[];
    readonly observations: readonly GhgInventoryObservation[];
} {
    const elements: GhgInventoryElement[] = [
        {
            id: 'example:pyrolysis',
            family: 'emission_source',
            name: 'Pirólise de resíduo de biomassa (combustão estacionária)',
            data: { ghgScope: '1', ghgCategory: 'combustao_estacionaria' },
        },
        {
            id: 'example:grid',
            family: 'emission_source',
            name: 'Energia elétrica da unidade (rede SIN)',
            data: { ghgScope: '2-loc', ghgCategory: 'eletricidade_localizacao' },
        },
        {
            id: 'example:logistics',
            family: 'emission_source',
            name: 'Transporte fluvial do caroço (upstream)',
            data: { ghgScope: '3', ghgCategory: 'transporte_upstream' },
        },
    ];
    const observations: GhgInventoryObservation[] = [
        {
            id: 'example:obs1',
            elementId: 'example:pyrolysis',
            parameterId: 'gas:CO2',
            value: 128.4,
            unit: 't',
            date: '2026-05-12',
            data: {
                emissionFactor: 1.62,
                gwp: 1,
                co2e: 128.4,
                sourceQuantity: 79.3,
                sourceUnit: 't caroço seco',
                verified: true,
                recordedBy: 'sensor: balança + termopar reator',
                dataSource: 'medição contínua do piloto',
            },
        },
        {
            id: 'example:obs2',
            elementId: 'example:pyrolysis',
            parameterId: 'gas:CH4',
            value: 0.42,
            unit: 't',
            date: '2026-05-12',
            data: {
                emissionFactor: 0.0053,
                gwp: 27.9,
                co2e: 11.72,
                verified: true,
                recordedBy: 'sensor: analisador de gases',
                dataSource: 'medição contínua do piloto',
            },
        },
        {
            id: 'example:obs3',
            elementId: 'example:grid',
            parameterId: 'gas:CO2',
            value: 14.9,
            unit: 't',
            date: '2026-05-31',
            data: {
                emissionFactor: 0.0385,
                gwp: 1,
                co2e: 14.9,
                verified: false,
                recordedBy: 'fatura concessionária',
                dataSource: 'fator MCTI 2026 (SIN)',
            },
        },
        {
            id: 'example:obs4',
            elementId: 'example:logistics',
            parameterId: 'gas:CO2',
            value: 6.1,
            unit: 't',
            date: '2026-05-20',
            data: {
                emissionFactor: 3.17,
                gwp: 1,
                co2e: 6.1,
                verified: false,
                recordedBy: 'romaneio de carga',
                dataSource: 'diesel fluvial (L) × fator IPCC',
            },
        },
    ];
    return { elements, observations };
}

/**
 * VM completo da view MRV: uma linha por fonte de emissão + resumo. Recebe
 * os MESMOS elements/observations do trilho do inventário GHG (reuso, não
 * motor novo). Sem fonte real → dataset de exemplo de biomassa rotulado.
 */
export function buildMrvChainVM(
    elements: readonly GhgInventoryElement[] | null | undefined,
    observations: readonly GhgInventoryObservation[] | null | undefined,
): MrvChainVM {
    let els = (Array.isArray(elements) ? elements : []).filter((e) => e && e.family === 'emission_source');
    let obs = Array.isArray(observations) ? observations : [];
    let dataSource: 'real' | 'example' = 'real';
    if (els.length === 0) {
        const example = buildExampleMrvInput();
        els = [...example.elements];
        obs = [...example.observations];
        dataSource = 'example';
    }
    const byElement = new Map<string, GhgInventoryObservation[]>();
    for (const o of obs) {
        if (!o || typeof o.elementId !== 'string') continue;
        const list = byElement.get(o.elementId);
        if (list) list.push(o);
        else byElement.set(o.elementId, [o]);
    }
    const rows = els.map((el) => buildMrvRow(el, byElement.get(el.id) ?? []));
    const totalParts = rows.map((r) => r.tco2e).filter((v): v is number => v !== null);
    const summary: MrvSummary = {
        totalSources: rows.length,
        monitorado: rows.filter((r) => r.links.monitorado === 'ok').length,
        reportado: rows.filter((r) => r.links.reportado === 'ok').length,
        verificado: rows.filter((r) => r.links.verificado === 'ok').length,
        pendente: rows.filter((r) => r.stage === 'pendente').length,
        totalTCO2e: totalParts.reduce((a, b) => a + b, 0),
    };
    return { dataSource, rows, summary };
}
