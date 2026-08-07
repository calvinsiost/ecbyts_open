// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Natural Asset Benchmarks — catálogo seed (R$/m²) com fontes científicas.
 *
 * Calvin D1 2026-06-08: "incluir benchmarkings pesquisar estudos online +
 * usuários poderão carregar os seus via libraries".
 *
 * Pure-logic: zero side-effects, frozen output, deterministic.
 *
 * Pesquisa em `.runtime/research/natural-asset-benchmarks-2026-06-08.md`:
 *  - TEEB 2010 (UNEP) — wetlands ~16k USD/ha/yr serviços ambientais totais
 *  - ESVD 2020 (es-partnership) — 4.042 records, mediana wetland ~6.5k Int$/ha/yr
 *  - SEEA EA 2021 (UN) — framework adotado UNSC março 2021
 *  - INCRA 2024 — terra rural BR média R$ 22.951/ha (R$ 2,30/m²)
 *  - BNDES Fundo Clima 2026-05 — Mata Atlântica restauração R$ 14.500/ha
 *  - Lei 9.985/2000 + Dec 6.848/2009 — SNUC compensação ambiental
 *  - Lei 12.651/2012 — APP nascentes/cursos d'água
 *  - ANA Res. 1.245/2024 — outorga hídrica R$ 0,10/m³
 *
 * Conversão USD → BRL: 5,5 R$/USD (média 2024-2026 conservador).
 * Valor presente equivalente em R$/m² (não anuidade — capitalizado 20 anos).
 *
 * Defaults "expected" são CONSERVADORES — usuário deve calibrar via Libraries
 * marketplace ou window.__ecbtNaturalAssetCatalog para contexto específico.
 */

import type { NaturalAssetCatalog } from './_naturalAssetsPure.js';

// ----------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------

export type FamilyKey =
    | 'boundary'
    | 'habitat'
    | 'site_area'
    | 'area'
    | 'river'
    | 'lake'
    | 'spring'
    | 'individual';

export type SeedTier = 'conservative' | 'expected' | 'optimistic';

export interface BenchmarkRecord {
    readonly family: FamilyKey;
    /** R$/m² — limite inferior conservador (P10 estimado). */
    readonly low: number;
    /** R$/m² — valor central recomendado (mediana ponderada). */
    readonly expected: number;
    /** R$/m² — limite superior otimista (P90 estimado). */
    readonly high: number;
    /** Citação curta para audit trail Bloco F. */
    readonly source: string;
    /** Referência completa rastreável (URL/DOI/lei). */
    readonly ref: string;
    /** Justificativa metodológica em PT-BR (1-2 linhas). */
    readonly rationale: string;
}

export interface SeedCatalogOptions {
    readonly tier?: SeedTier;
    /** Override fracional global (0.5 = 50% do seed). */
    readonly scale?: number;
}

// ----------------------------------------------------------------
// REGISTRY — valores em R$/m² (capitalizados 20 anos)
// ----------------------------------------------------------------

const REGISTRY: ReadonlyArray<BenchmarkRecord> = Object.freeze([
    Object.freeze({
        family: 'boundary',
        low: 5,
        expected: 15,
        high: 50,
        source: 'SNUC Lei 9.985/2000 + INCRA terra rural 2024',
        ref: 'Lei 9.985/2000; Dec 6.848/2009; INCRA SNCR 2024',
        rationale:
            'Área protegida = terra rural (R$ 2,30/m² INCRA) + premium compensação SNUC mínima 0,5%.',
    }),
    Object.freeze({
        family: 'habitat',
        low: 8,
        expected: 25,
        high: 80,
        source: 'WWF Living Planet + ESVD 2020 biodiversity',
        ref: 'es-partnership.org ESVD 2020; WWF Living Planet Report',
        rationale:
            'Habitat biodiversidade ~5k USD/ha/yr × 20 anos × 5,5 R$/USD ÷ 10⁴ = R$ 5,5/m²/ano cap.',
    }),
    Object.freeze({
        family: 'site_area',
        low: 1,
        expected: 3,
        high: 10,
        source: 'INCRA terra rural média BR 2024',
        ref: 'CNN Brasil/INCRA SNCR 2024 — média R$ 22.951/ha',
        rationale: 'Site genérico ≈ valor terra rural média BR (R$ 2,30/m² INCRA).',
    }),
    Object.freeze({
        family: 'area',
        low: 3,
        expected: 8,
        high: 25,
        source: 'BNDES Fundo Clima 2026-05 Mata Atlântica',
        ref: 'BNDES Agência Notícias 2026-05-29; R$ 87,2M / 6.000ha = R$ 1,45/m² custo',
        rationale:
            'Área verde recuperada = custo restauração BNDES R$ 1,45/m² × multiplicador serviços ~5×.',
    }),
    Object.freeze({
        family: 'river',
        low: 10,
        expected: 30,
        high: 100,
        source: 'TEEB 2010 Wetlands + ANA Res. 1.245/2024',
        ref: 'TEEB Water and Wetlands (UNEP/CBD); ANA Res. 1.245/2024',
        rationale: 'TEEB wetlands ~16k USD/ha/yr × 5,5 × 20 anos ÷ 10⁴ = R$ 17,6/m²/ano cap.',
    }),
    Object.freeze({
        family: 'lake',
        low: 8,
        expected: 20,
        high: 80,
        source: 'TEEB 2010 Wetlands + ESVD 2020',
        ref: 'TEEB Water and Wetlands; ESVD 2020 inland wetlands mediana',
        rationale: 'Lake serviços ~70% river (sem fluxo) — TEEB 2010 flood + nutrient cycling.',
    }),
    Object.freeze({
        family: 'spring',
        low: 20,
        expected: 60,
        high: 200,
        source: 'TEEB high-value + Lei 12.651/2012 APP',
        ref: 'TEEB ESVD mangrove 217k Int$/ha/yr (extremo); Código Florestal 12.651/2012',
        rationale: 'Nascente = APP obrigatória (50m raio) + serviços críticos água — premium 2× river.',
    }),
    Object.freeze({
        family: 'individual',
        low: 50,
        expected: 150,
        high: 500,
        source: 'TEEB carbon stock + biodiversidade unitária',
        ref: 'TEEB 2010 carbon valuation; IPCC AR6 social cost of carbon ~190 USD/tCO2',
        rationale:
            'Árvore/fauna unitária = R$/elemento (não /m²) — carbon stock + valor biodiversidade.',
    }),
]);

const BY_FAMILY: ReadonlyMap<string, BenchmarkRecord> = (() => {
    const map = new Map<string, BenchmarkRecord>();
    for (const r of REGISTRY) map.set(r.family, r);
    return map;
})();

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/**
 * Lista todos os benchmarks (cópia frozen para auditoria/UI).
 */
export function listBenchmarks(): ReadonlyArray<BenchmarkRecord> {
    return REGISTRY;
}

/**
 * Retorna benchmark de uma família, ou null se não conhecida.
 */
export function getBenchmark(family: string): BenchmarkRecord | null {
    if (!family) return null;
    return BY_FAMILY.get(String(family).toLowerCase()) ?? null;
}

/**
 * Constrói um NaturalAssetCatalog a partir do seed, escolhendo tier
 * (conservative/expected/optimistic) e aplicando scale opcional.
 *
 * Default: tier='expected', scale=1.0.
 *
 * O catálogo retornado é diretamente consumível por extractNaturalAssets().
 */
export function buildSeedCatalog(options: SeedCatalogOptions = {}): NaturalAssetCatalog {
    const tier = options.tier ?? 'expected';
    const scale = Number.isFinite(options.scale) && (options.scale ?? 0) > 0 ? (options.scale as number) : 1.0;
    const out: Record<string, number | string> = {};
    for (const rec of REGISTRY) {
        const raw =
            tier === 'conservative' ? rec.low : tier === 'optimistic' ? rec.high : rec.expected;
        out[rec.family] = Math.round(raw * scale * 100) / 100; // 2 decimais
    }
    out.defaultCurrency = 'BRL';
    return Object.freeze(out) as NaturalAssetCatalog;
}

/**
 * Formata citação curta PT-BR para audit trail Bloco F.
 * Ex: "boundary: SNUC Lei 9.985/2000 + INCRA terra rural 2024 (R$ 15/m² expected)"
 */
export function formatBenchmarkCitation(
    family: string,
    tier: SeedTier = 'expected',
): string {
    const rec = getBenchmark(family);
    if (!rec) return `${family}: sem benchmark seed`;
    const value = tier === 'conservative' ? rec.low : tier === 'optimistic' ? rec.high : rec.expected;
    return `${family}: ${rec.source} (R$ ${value}/m² ${tier})`;
}

/**
 * Resumo agregado para banner UI — total estimado por hectare,
 * útil para "tooltip explicativo" antes do usuário customizar.
 */
export interface SeedSummary {
    readonly tier: SeedTier;
    readonly familyCount: number;
    readonly avgPerM2: number;
    readonly minPerM2: number;
    readonly maxPerM2: number;
    readonly sourcesUsed: ReadonlyArray<string>;
}

export function summarizeSeed(tier: SeedTier = 'expected'): SeedSummary {
    const values: number[] = [];
    const sources: string[] = [];
    for (const rec of REGISTRY) {
        const v = tier === 'conservative' ? rec.low : tier === 'optimistic' ? rec.high : rec.expected;
        values.push(v);
        sources.push(rec.source);
    }
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = values.length > 0 ? sum / values.length : 0;
    return Object.freeze({
        tier,
        familyCount: REGISTRY.length,
        avgPerM2: Math.round(avg * 100) / 100,
        minPerM2: Math.min(...values),
        maxPerM2: Math.max(...values),
        sourcesUsed: Object.freeze(sources),
    });
}
