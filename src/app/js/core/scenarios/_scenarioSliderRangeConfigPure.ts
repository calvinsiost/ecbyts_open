// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Curated, versioned per-SUBTYPE slider ranges for the scenario comparator
 * panel (CFG-36). SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md
 * (§2.4.10 CFG-36, guard-rails §2.4.0, NOT N8/N9). Same curated/versioned
 * philosophy as CFG-32 (`_scenarioOdsThresholdConfigPure`) and CFG-24
 * (`_scenarioEcbtConfigPure`).
 *
 * ─── The point ───
 * The three mutation sliders of the comparator panel (throughput, recoveryRate,
 * yield) used HARDCODED ranges, the SAME for every subtype
 * (throughput 100–5000 step 50; recovery 0.5–0.99; yield 0.4–0.95 — see
 * `renderMutationControls` in `scenarioComparatorPanel.ts`). A landfill (RSU)
 * processing ~500 t/d with 60–85% biogas collection and a blast furnace at
 * 94–97% Fe recovery do not live on the same validated band. CFG-36 turns the
 * ranges into parameters that:
 *
 *   - come from the SUBTYPE CATALOG — each subtype carries its own curated,
 *     validated range per lever (the RSU throughput band differs from mining,
 *     which is the spec's testable clause);
 *   - are CURATED and VERSIONED by admin (metodologia), NOT a free-text input
 *     in the end-user UI (NOT N9) — the user only moves the slider inside the
 *     curated band;
 *   - keep the pre-CFG-36 universal band as the per-lever DEFAULT, so any
 *     subtype without a curated entry (or an admin who curates nothing) sees
 *     exactly today's behaviour — zero regression (guard-rail §2.4.0-2).
 *
 * ─── Sources (faixas validadas com fonte citável — §2.4.0) ───
 * Every curated band cites the reference already used by the subtype catalog
 * itself (`core/elements/families/production/subtypes.ts`, CFG-05): EPA LMOP,
 * IPCC 2006 Vol.5, ABREMA, SNIC/ECRA, Gullichsen & Fogelholm, NREL,
 * CONAMA 307/ABRECON, reservoir-engineering literature (ANP/SPE).
 *
 * ─── Known limit (documented, not omitted) ───
 * The panel's throughput label is still a fixed "Vazão (t/h)" string while
 * several subtypes catalogue throughput in other units (bbl/d, t/d, m3/d,
 * MWh/d). The per-subtype throughput bands below are curated in the subtype's
 * OWN catalog unit; the unit-aware label is presentation work outside CFG-36
 * (the panel only offers 'mining'/'petroleum' today, and petroleum keeps the
 * default throughput band precisely because of this — see its entry).
 *
 * Pure — ZERO DOM, ZERO IO, deterministic. All returned objects are frozen.
 */

/** The three mutation levers the panel exposes as sliders. */
export type SliderLever = 'throughput' | 'recoveryRate' | 'yield';

/** A validated slider band for one lever. `min < max`, `step > 0`. */
export interface SliderRange {
    readonly min: number;
    readonly max: number;
    readonly step: number;
}

/** The full set of slider bands for one subtype (one band per lever). */
export interface SliderRangeSet {
    readonly throughput: SliderRange;
    readonly recoveryRate: SliderRange;
    readonly yield: SliderRange;
}

/**
 * The pre-CFG-36 universal band, byte-for-byte the hardcode that
 * `renderMutationControls` used for every subtype. It stays the per-lever
 * DEFAULT: a subtype without a curated entry resolves to exactly today's
 * behaviour (zero regression, guard-rail §2.4.0-2). Frozen.
 */
export const DEFAULT_SLIDER_RANGES: SliderRangeSet = Object.freeze({
    throughput: Object.freeze({ min: 100, max: 5000, step: 50 }),
    recoveryRate: Object.freeze({ min: 0.5, max: 0.99, step: 0.01 }),
    yield: Object.freeze({ min: 0.4, max: 0.95, step: 0.01 }),
});

/**
 * Curated, versioned slider ranges per subtype. `bySubtype` maps a subtype id
 * to a PARTIAL set of bands — any lever absent resolves to
 * {@link DEFAULT_SLIDER_RANGES} (curation is per-lever, never a blank slate,
 * NOT N8). `version` is the audit trail: bumping it records a re-curation
 * (admin/versioned — NOT N9).
 */
export interface SubtypeSliderRangeConfig {
    readonly bySubtype: Readonly<Record<string, Readonly<Partial<SliderRangeSet>>>>;
    readonly version: number;
}

/**
 * The versioned curated catalog (v1). Bands cite the references of the subtype
 * catalog (`subtypes.ts`, CFG-05). Levers omitted fall back to the universal
 * default — documented per entry. Frozen.
 */
export const CURATED_SUBTYPE_SLIDER_RANGES: SubtypeSliderRangeConfig = Object.freeze({
    bySubtype: Object.freeze({
        // Mineração — explicitamente a faixa universal pré-CFG-36 (a tela atual
        // é mineração; zero regressão byte-a-byte).
        mining: Object.freeze({
            throughput: Object.freeze({ min: 100, max: 5000, step: 50 }),
            recoveryRate: Object.freeze({ min: 0.5, max: 0.99, step: 0.01 }),
            yield: Object.freeze({ min: 0.4, max: 0.95, step: 0.01 }),
        }),
        // Petróleo — fator de recuperação de reservatório 20–40% (métodos
        // primário/secundário), até ~60% com recuperação avançada/EOR
        // (literatura de engenharia de reservatórios — ANP/SPE).
        // throughput/yield: default — o catálogo usa bbl/d e o rótulo do painel
        // ainda é fixo "t/h" (limite documentado no cabeçalho); sem fonte
        // curada para o rendimento de refino ainda.
        petroleum: Object.freeze({
            recoveryRate: Object.freeze({ min: 0.2, max: 0.6, step: 0.01 }),
        }),
        // RSU — throughput t/d: aterros de pequenos municípios (~50 t/d) a
        // grandes aterros metropolitanos (~3.000 t/d) — ABREMA, Panorama dos
        // Resíduos Sólidos no Brasil. recoveryRate: eficiência de coleta de
        // gás de aterro 60–85% (US EPA LMOP). yield: eficiência elétrica de
        // motogerador a biogás 30–40% (IPCC 2006 Vol.5 / fabricantes).
        rsu: Object.freeze({
            throughput: Object.freeze({ min: 50, max: 3000, step: 10 }),
            recoveryRate: Object.freeze({ min: 0.6, max: 0.85, step: 0.01 }),
            yield: Object.freeze({ min: 0.3, max: 0.4, step: 0.01 }),
        }),
        // Cimento — throughput t/h: linhas de forno ~2.000–10.000 t/d de
        // clínquer (≈80–420 t/h; SNIC/ECRA), com margem para linhas pequenas.
        // recoveryRate: rendimento mássico cru→clínquer ~0.65 (perda de
        // ignição ~35%) na baixa; moagem final ~0.99 na alta. yield: fator
        // clínquer típico ~65–97% (SNIC/European Cement Research Academy).
        cement: Object.freeze({
            throughput: Object.freeze({ min: 50, max: 600, step: 10 }),
            recoveryRate: Object.freeze({ min: 0.6, max: 0.99, step: 0.01 }),
            yield: Object.freeze({ min: 0.65, max: 0.97, step: 0.01 }),
        }),
        // Papel e celulose — throughput m3/d de madeira: fábricas kraft de
        // grande porte na casa dos milhares de m3/d (default do catálogo 8.000;
        // Gullichsen & Fogelholm, Chemical Pulping). recoveryRate: o slider é
        // por SUBTIPO e o catálogo tem DUAS recuperações — rendimento kraft
        // 42–46% sobre madeira seca (baixa) e eficiência da máquina de papel
        // ~98% (alta); a faixa cobre as duas pontas do processo. yield:
        // eficiência de máquina de papel ~90% (retenção/formação), com folga.
        'pulp-paper': Object.freeze({
            throughput: Object.freeze({ min: 4000, max: 12000, step: 250 }),
            recoveryRate: Object.freeze({ min: 0.4, max: 0.99, step: 0.01 }),
            yield: Object.freeze({ min: 0.8, max: 0.99, step: 0.01 }),
        }),
        // Siderurgia — throughput t/h: alto-fornos/aciarias na casa das
        // centenas de t/h (defaults do catálogo 400–500 t/h). recoveryRate:
        // recuperação de Fe no alto-forno 94–97% (balanço metalúrgico
        // clássico), com folga. yield: rendimento metálico BOF ~89–91%;
        // laminação ~97%.
        steel: Object.freeze({
            throughput: Object.freeze({ min: 100, max: 800, step: 10 }),
            recoveryRate: Object.freeze({ min: 0.9, max: 0.99, step: 0.01 }),
            yield: Object.freeze({ min: 0.85, max: 0.98, step: 0.01 }),
        }),
        // Energia renovável — throughput MWh/d: parques FV de dezenas a
        // centenas de MWh/d (default do catálogo 120). recoveryRate:
        // eficiência de módulo FV ~15–23% (NREL). yield: energia líquida após
        // perdas do sistema (performance ratio ~0.80 → ~16%).
        'renewable-energy': Object.freeze({
            throughput: Object.freeze({ min: 10, max: 500, step: 5 }),
            recoveryRate: Object.freeze({ min: 0.1, max: 0.25, step: 0.01 }),
            yield: Object.freeze({ min: 0.1, max: 0.2, step: 0.01 }),
        }),
        // Construção civil — throughput t/d: canteiros de dezenas a milhares
        // de t/d (default do catálogo 300 t/d na estrutura). recoveryRate:
        // reciclagem de RCD ~70% (CONAMA 307/ABRECON — potencial classe A),
        // faixa 40–90%. yield: aproveitamento de materiais na estrutura
        // (perdas ~5% → ~95%), com folga.
        construction: Object.freeze({
            throughput: Object.freeze({ min: 50, max: 2000, step: 10 }),
            recoveryRate: Object.freeze({ min: 0.4, max: 0.9, step: 0.01 }),
            yield: Object.freeze({ min: 0.85, max: 0.99, step: 0.01 }),
        }),
    }) as Readonly<Record<string, Readonly<Partial<SliderRangeSet>>>>,
    version: 1,
});

/** Partial admin re-curation (any subset of subtypes/levers) — N9: admin-only. */
export interface SubtypeSliderRangeOverride {
    readonly bySubtype?: Readonly<Record<string, Partial<SliderRangeSet>>> | null;
    readonly version?: number;
}

const FRACTION_LEVERS: ReadonlySet<SliderLever> = new Set(['recoveryRate', 'yield']);

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

/**
 * True iff `v` is a usable slider band for `lever`: finite numbers,
 * `0 <= min < max`, `0 < step <= max - min`. Fraction levers
 * (recoveryRate/yield) must additionally stay inside [0,1] — the same
 * physical band the mutation engine enforces.
 */
export function isValidSliderRange(v: unknown, lever: SliderLever): v is SliderRange {
    if (!v || typeof v !== 'object') return false;
    const r = v as Partial<SliderRange>;
    if (!isFiniteNumber(r.min) || !isFiniteNumber(r.max) || !isFiniteNumber(r.step)) return false;
    if (r.min < 0 || r.max <= r.min) return false;
    if (r.step <= 0 || r.step > r.max - r.min) return false;
    if (FRACTION_LEVERS.has(lever) && r.max > 1) return false;
    return true;
}

function freezeRange(r: SliderRange): SliderRange {
    return Object.freeze({ min: r.min, max: r.max, step: r.step });
}

/**
 * Resolve a curated config from an optional admin re-curation, validated
 * against {@link CURATED_SUBTYPE_SLIDER_RANGES}. Each subtype/lever band is
 * validated independently ({@link isValidSliderRange}); an invalid band is
 * DROPPED (the curated/default band wins — never a blank slate, NOT N8) and a
 * subtype id unknown to the curated catalog is ignored (admin re-curates,
 * never invents methodology — NOT N9). Passing nothing returns the curated
 * catalog itself (current curated behaviour).
 *
 * @param override? - Admin-curated partial (e.g. from a versioned config artifact).
 * @returns A frozen {@link SubtypeSliderRangeConfig} safe to feed the panel.
 */
export function resolveSliderRangeConfig(
    override?: SubtypeSliderRangeOverride | null,
): SubtypeSliderRangeConfig {
    if (!override || typeof override !== 'object') return CURATED_SUBTYPE_SLIDER_RANGES;
    const bySubtype: Record<string, Readonly<Partial<SliderRangeSet>>> = {
        ...CURATED_SUBTYPE_SLIDER_RANGES.bySubtype,
    };
    const raw = override.bySubtype;
    if (raw && typeof raw === 'object') {
        for (const subtypeId of Object.keys(raw)) {
            const curated = CURATED_SUBTYPE_SLIDER_RANGES.bySubtype[subtypeId];
            if (!curated) continue; // subtipo fora do catálogo curado: ignorado (N9)
            const candidate = raw[subtypeId];
            if (!candidate || typeof candidate !== 'object') continue;
            const merged: Partial<Record<SliderLever, SliderRange>> = { ...curated };
            for (const lever of ['throughput', 'recoveryRate', 'yield'] as const) {
                const band = (candidate as Partial<SliderRangeSet>)[lever];
                if (band === undefined) continue;
                if (isValidSliderRange(band, lever)) merged[lever] = freezeRange(band);
                // banda inválida: descartada, fica a curada (N8)
            }
            bySubtype[subtypeId] = Object.freeze(merged) as Readonly<Partial<SliderRangeSet>>;
        }
    }
    return Object.freeze({
        bySubtype: Object.freeze(bySubtype) as Readonly<Record<string, Readonly<Partial<SliderRangeSet>>>>,
        version: isFiniteNumber(override.version)
            ? override.version
            : CURATED_SUBTYPE_SLIDER_RANGES.version,
    });
}

/**
 * Resolve the effective slider band set for one subtype: each lever comes from
 * the curated catalog when the subtype has a valid curated band, else from
 * {@link DEFAULT_SLIDER_RANGES} (per-lever fallback — zero regression for
 * anything not curated). Unknown/empty subtype ids resolve to the full
 * default set (today's universal behaviour).
 *
 * @param subtypeId - Id do subtipo (qualquer id do catálogo CFG-05/06).
 * @param config? - Config curada (default: {@link CURATED_SUBTYPE_SLIDER_RANGES}).
 * @returns Um {@link SliderRangeSet} congelado, completo (3 alavancas).
 */
export function resolveSliderRanges(
    subtypeId: string | null | undefined,
    config: SubtypeSliderRangeConfig = CURATED_SUBTYPE_SLIDER_RANGES,
): SliderRangeSet {
    const curated =
        subtypeId && config && typeof config === 'object'
            ? config.bySubtype[subtypeId]
            : undefined;
    const pick = (lever: SliderLever): SliderRange => {
        const band = curated?.[lever];
        return isValidSliderRange(band, lever) ? band : DEFAULT_SLIDER_RANGES[lever];
    };
    return Object.freeze({
        throughput: pick('throughput'),
        recoveryRate: pick('recoveryRate'),
        yield: pick('yield'),
    });
}

/**
 * Clamp a value into a slider band (for honest rendering: the slider position
 * and the printed value must agree even when the scenario's current rate sits
 * outside the subtype's validated band). Non-finite input → `range.min`
 * (never NaN into the DOM).
 */
export function clampToRange(range: SliderRange, value: number): number {
    if (!Number.isFinite(value)) return range.min;
    return Math.min(range.max, Math.max(range.min, value));
}
