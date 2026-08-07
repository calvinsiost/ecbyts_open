// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ODS (UN SDG) Registry — pure logic foundation (F1 of SPEC_ODS_IMPACT_RISK).
 *
 * Catalog of all 17 UN Sustainable Development Goals with:
 *   - canonical ID (1..17)
 *   - short slug (eg. 'no_poverty', 'agua_e_saneamento')
 *   - icon hint
 *   - default measurability tier in ecbyts (T1 = direct from open data,
 *     T2 = needs field data from the model, T3 = proxy/qualitative,
 *     T0 = currently not measurable here)
 *   - related ecbyts modules (provenance hints for measurers)
 *
 * Anti-requirements honoured (SPEC_ODS_IMPACT_RISK §2):
 *   - N2: registry references the official indicator code but does NOT
 *     replace the UN indicator framework.
 *   - N5: every measurable ODS lists ecbyts-side bases/modules already in
 *     the repo (no new dependencies).
 *   - N3: registry is the catalog ONLY — not a certification seal.
 *
 * Tests live in `tests/ods-registry-pure.test.mjs`.
 */

export type OdsTier = 'T0' | 'T1' | 'T2' | 'T3';

/**
 * - T1: directly computable from open base + deterministic engine
 *       (e.g. CETESB contaminated areas + GAC classification).
 * - T2: needs model-side field data (observations, campaigns) AND can use
 *       Monte Carlo / GUM uncertainty (e.g. plume dispersion → risk).
 * - T3: only proxy or qualitative mapping available; flagged explicitly so
 *       UI never shows it as a direct measurement.
 * - T0: not currently measurable in ecbyts; the entry exists so the UI can
 *       render the 17 ODS but the panel says "não mensurável aqui".
 */

export interface OdsEntry {
    readonly id: number;
    readonly slug: string;
    readonly label_pt: string;
    readonly label_en: string;
    readonly officialIndicator: string | null;
    /** Default tier when measured with the modules below. */
    readonly tier: OdsTier;
    /** ecbyts modules that contribute (provenance hint). */
    readonly modules: ReadonlyArray<string>;
    /** Open bases that contribute (provenance hint). */
    readonly bases: ReadonlyArray<string>;
}

const RAW_ENTRIES: ReadonlyArray<OdsEntry> = [
    {
        id: 1,
        slug: 'erradicacao_pobreza',
        label_pt: 'Erradicação da Pobreza',
        label_en: 'No Poverty',
        officialIndicator: '1.5.2',
        tier: 'T2',
        modules: ['analytics/economics', 'governance/wbs', 'ods/measurers/generic'],
        bases: ['ibge/municipalities'],
    },
    {
        id: 2,
        slug: 'fome_zero',
        label_pt: 'Fome Zero e Agricultura Sustentável',
        label_en: 'Zero Hunger',
        officialIndicator: '2.4.1',
        tier: 'T3',
        modules: ['governance/wbs', 'ods/measurers/generic'],
        bases: ['ibge/municipalities'],
    },
    {
        id: 3,
        slug: 'saude_bem_estar',
        label_pt: 'Saúde e Bem-Estar',
        label_en: 'Good Health and Well-Being',
        officialIndicator: '3.9.1',
        tier: 'T2',
        modules: ['simulation/solvers/gaussianPlume', 'health', 'validation'],
        bases: ['cetesb/areas_contaminadas', 'inmet/estacoes'],
    },
    {
        id: 4,
        slug: 'educacao_qualidade',
        label_pt: 'Educação de Qualidade',
        label_en: 'Quality Education',
        officialIndicator: '4.7.1',
        tier: 'T3',
        modules: ['governance/wbs', 'ods/measurers/generic'],
        bases: [],
    },
    {
        id: 5,
        slug: 'igualdade_genero',
        label_pt: 'Igualdade de Gênero',
        label_en: 'Gender Equality',
        officialIndicator: '5.5.2',
        tier: 'T2',
        modules: ['governance/wbs', 'ods/measurers/generic'],
        bases: [],
    },
    {
        id: 6,
        slug: 'agua_saneamento',
        label_pt: 'Água Potável e Saneamento',
        label_en: 'Clean Water and Sanitation',
        officialIndicator: '6.3.2',
        tier: 'T1',
        modules: ['validation', 'simulation/solvers/theisThiem', 'interpolation'],
        bases: ['ana/qualidade_agua', 'ana/outorgas', 'ana/rios', 'ana/massas_dagua'],
    },
    {
        id: 7,
        slug: 'energia_acessivel',
        label_pt: 'Energia Acessível e Limpa',
        label_en: 'Affordable and Clean Energy',
        officialIndicator: '7.2.1',
        tier: 'T2',
        modules: ['analytics/economics', 'constants', 'ods/measurers/generic'],
        bases: [],
    },
    {
        id: 8,
        slug: 'trabalho_decente',
        label_pt: 'Trabalho Decente e Crescimento Econômico',
        label_en: 'Decent Work and Economic Growth',
        officialIndicator: '8.8.1',
        tier: 'T2',
        modules: ['health', 'eis'],
        bases: [],
    },
    {
        id: 9,
        slug: 'industria_inovacao',
        label_pt: 'Indústria, Inovação e Infraestrutura',
        label_en: 'Industry, Innovation and Infrastructure',
        officialIndicator: '9.5.1',
        tier: 'T2',
        modules: ['governance/wbs', 'analytics/economics', 'ods/measurers/generic'],
        bases: ['artesp/malha_rodoviaria'],
    },
    {
        id: 10,
        slug: 'reducao_desigualdades',
        label_pt: 'Redução das Desigualdades',
        label_en: 'Reduced Inequalities',
        officialIndicator: '10.2.1',
        tier: 'T2',
        modules: ['governance/wbs', 'analytics/economics', 'ods/measurers/generic'],
        bases: ['ibge/municipalities'],
    },
    {
        id: 11,
        slug: 'cidades_sustentaveis',
        label_pt: 'Cidades e Comunidades Sustentáveis',
        label_en: 'Sustainable Cities and Communities',
        officialIndicator: '11.6.2',
        tier: 'T1',
        modules: ['validation', 'simulation/solvers/gaussianPlume'],
        bases: ['cetesb/areas_contaminadas', 'inmet/estacoes', 'ibge/municipalities'],
    },
    {
        id: 12,
        slug: 'consumo_responsavel',
        label_pt: 'Consumo e Produção Responsáveis',
        label_en: 'Responsible Consumption and Production',
        officialIndicator: '12.4.2',
        tier: 'T2',
        modules: ['analytics/economics', 'audit'],
        bases: ['cetesb/areas_contaminadas'],
    },
    {
        id: 13,
        slug: 'acao_clima',
        label_pt: 'Ação Contra a Mudança Global do Clima',
        label_en: 'Climate Action',
        officialIndicator: '13.1.1',
        tier: 'T2',
        modules: ['constants', 'simulation/solvers/usleRusle'],
        bases: ['inmet/estacoes', 'ibama/prodes', 'ibama/deter'],
    },
    {
        id: 14,
        slug: 'vida_agua',
        label_pt: 'Vida na Água',
        label_en: 'Life Below Water',
        officialIndicator: '14.1.1',
        tier: 'T1',
        modules: ['validation'],
        bases: ['ana/massas_dagua', 'ana/qualidade_agua', 'ana/ish'],
    },
    {
        id: 15,
        slug: 'vida_terrestre',
        label_pt: 'Vida Terrestre',
        label_en: 'Life on Land',
        officialIndicator: '15.3.1',
        tier: 'T1',
        modules: ['simulation/solvers/usleRusle', 'interpolation'],
        bases: ['ibama/prodes', 'ibama/deter', 'icmbio/ucs', 'ibge/pedologia'],
    },
    {
        id: 16,
        slug: 'paz_justica',
        label_pt: 'Paz, Justiça e Instituições Eficazes',
        label_en: 'Peace, Justice and Strong Institutions',
        officialIndicator: '16.6.1',
        tier: 'T2',
        modules: ['governance', 'crypto', 'ods/measurers/generic'],
        bases: [],
    },
    {
        id: 17,
        slug: 'parcerias_objetivos',
        label_pt: 'Parcerias e Meios de Implementação',
        label_en: 'Partnerships for the Goals',
        officialIndicator: '17.16.1',
        tier: 'T1',
        modules: ['radar', 'forum', 'governance'],
        bases: [],
    },
];

/** Frozen, deeply immutable ODS registry. Built once at module load. */
export const ODS_REGISTRY: ReadonlyArray<Readonly<OdsEntry>> = Object.freeze(
    RAW_ENTRIES.map((e) =>
        Object.freeze({
            ...e,
            modules: Object.freeze([...e.modules]),
            bases: Object.freeze([...e.bases]),
        }) as OdsEntry,
    ),
);

/** Lookup by ODS id (1..17). Returns undefined when out of range. */
export function getOds(id: number): OdsEntry | undefined {
    if (!Number.isFinite(id)) return undefined;
    const truncated = Math.trunc(id);
    if (truncated < 1 || truncated > 17) return undefined;
    return ODS_REGISTRY[truncated - 1];
}

/** Lookup by slug. Returns undefined when no match. */
export function getOdsBySlug(slug: string): OdsEntry | undefined {
    if (typeof slug !== 'string' || !slug) return undefined;
    return ODS_REGISTRY.find((e) => e.slug === slug);
}

/** Subset of currently-measurable ODS (Tier != 'T0'). */
export function getMeasurableOds(): ReadonlyArray<OdsEntry> {
    return ODS_REGISTRY.filter((e) => e.tier !== 'T0');
}

/** Counts by tier — useful for the audit dashboard. */
export function countByTier(): Readonly<Record<OdsTier, number>> {
    const out: Record<OdsTier, number> = { T0: 0, T1: 0, T2: 0, T3: 0 };
    for (const e of ODS_REGISTRY) out[e.tier]++;
    return Object.freeze(out);
}

/**
 * Anti-N1 / honesty gate: returns true iff the registry tier matches or is
 * better (higher precision) than the claimed tier. UI can call this before
 * displaying any user-claimed precision to prevent T3 being shown as T1.
 */
export function isClaimedTierHonest(odsId: number, claimedTier: OdsTier): boolean {
    const entry = getOds(odsId);
    if (!entry) return false;
    const order: Record<OdsTier, number> = { T0: 0, T3: 1, T2: 2, T1: 3 };
    return order[claimedTier] <= order[entry.tier];
}
