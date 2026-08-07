// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   SCENARIO GWP HORIZON — pure-logic (CFG-28, TEMA G "Impactos/ODS").

   SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md
     - §2.4 CFG-28 — "GWP selecionável: 100 anos (default) vs. 20 anos. Hoje
       GWP-100 fixo. Para metano (RSU/aterro) o GWP-20 muda muito o resultado;
       vira opção curada com fonte IPCC. Testável: GWP=20 → tCO₂e do metano
       ≈ 2,7× o de GWP-100, citável."
     - §2.4.0 #5 — "toda faixa numérica traz a norma/fonte que a fundamenta —
       mesmo rigor de `source` obrigatório do mapa ODS (§3, Rastreabilidade)."

   ─── Por que o horizonte é uma ESCOLHA, e não um detalhe ───

   GWP não é propriedade do gás: é a razão entre o forçamento acumulado do gás e
   o do CO₂ DENTRO DE UMA JANELA. Trocar a janela troca o número — e para o
   metano troca de forma brutal, porque o CH₄ tem vida curta (~12 anos): num
   horizonte de 20 anos quase todo o seu forçamento ainda está lá, num de 100
   anos a maior parte já decaiu. É por isso que o mesmo aterro "emite" ~2,8× mais
   tCO₂e em GWP-20 que em GWP-100 sem que um grama de metano mude.

   O caminho inverso também existe e o catálogo prova: SF₆ e outros gases de vida
   MUITO longa têm GWP-20 MENOR que o GWP-100 (o forçamento deles ainda está se
   acumulando aos 20 anos). Quem tratar horizonte como "fator de correção que
   sempre aumenta" erra o sinal nesses gases.

   ─── O PADRÃO SEGUIDO: `_odsIndicatorMapPure.ts` / `_scenarioSectorRatePure.ts` ───

   Cada fator carrega a PRÓPRIA fonte; um refresh de admin derivado da fonte
   atualiza os números SEM reescrever o módulo; e a `version` é a trilha de
   auditoria da curadoria (N9 — o usuário final escolhe da lista, não edita a
   metodologia). Refresh sem `source` é rejeitado inteiro: número novo com
   citação morta é pior que número sem citação, porque parece rastreável.

   ─── Procedência dos valores de fábrica ───

   IPCC AR6 WGI (2021), Cap. 7, Tabela 7.15 — o par (GWP-20, GWP-100) por gás.
   O par do metano fóssil (82,5 / 29,8) é o que reproduz o "≈ 2,7×" da própria
   cláusula testável do CFG-28: 82,5 / 29,8 = 2,77.

   DIVERGÊNCIA CONHECIDA, declarada em vez de escondida: o módulo de LCA
   (`core/analytics/carbonFootprintLCA.ts`) traz CH₄ fóssil GWP-100 = 27,9,
   citando a tabela do material suplementar (7.SM.7) do MESMO AR6. Os dois
   números circulam na literatura do AR6. Este módulo fica com o par da 7.15
   porque só ele fecha a razão que a spec exige, e o `source` diz de qual tabela
   o número saiu — para que a diferença seja auditável, não uma surpresa. Quem
   precisar unificar troca pelo override, com a citação junto.

   ─── N3 — o que NÃO acontece aqui ───

   Gás fora do catálogo e horizonte fora do catálogo devolvem `factor: null` +
   `semDado: true`. Nenhum dos dois cai no default de 100 anos em silêncio: pedir
   GWP-50 e receber o número de 100 anos sem aviso é exatamente o falso-verde que
   o CFG-21 destapou (o pedido some, o resultado parece legítimo). NÃO pedir
   horizonte nenhum é outra coisa — aí vale o default documentado de 100 anos.

   ZERO DOM, ZERO IO, determinístico. Objetos retornados congelados.
   ================================================================ */

// ───────────────────────────── Faixa validada ─────────────────────────────

/** Horizontes de integração curados pelo CFG-28 (os do AR6 Tabela 7.15). */
export type GwpHorizon = 20 | 100;

/** Horizonte default: 100 anos — o comportamento de hoje (zero regressão). */
export const DEFAULT_GWP_HORIZON: GwpHorizon = 100;

/** Os horizontes que o catálogo cobre, para validação e para o seletor da UI. */
export const CURATED_GWP_HORIZONS: readonly GwpHorizon[] = Object.freeze([20, 100]);

/** `true` se `h` é um horizonte curado (20 ou 100) — sem coerção. */
export function isGwpHorizon(h: unknown): h is GwpHorizon {
    return h === 20 || h === 100;
}

// ───────────────────────────── Catálogo curado ─────────────────────────────

/** Um gás do catálogo, com o par de GWP e a fonte DOS DOIS números. */
export interface GwpFactorDef {
    /** Chave estável do gás (ex.: 'ch4Fossil'). */
    readonly gas: string;
    /** Chave i18n do rótulo (convenção de catálogo curado do repo). */
    readonly nameKey: string;
    /** GWP no horizonte de 20 anos (tCO₂e por tonelada de gás). */
    readonly gwp20: number;
    /** GWP no horizonte de 100 anos (tCO₂e por tonelada de gás). */
    readonly gwp100: number;
    /**
     * Procedência DOS NÚMEROS ACIMA. Nunca ''. Trocada junto com os valores
     * quando um refresh de admin os atualiza — fonte que não descreve o número
     * em campo não é rastreabilidade, é decoração.
     */
    readonly source: string;
}

const AR6 =
    'IPCC AR6 WGI (2021), Cap. 7, Tabela 7.15 — GWP-20 e GWP-100 com realimentacoes climate-carbon. Divergencia conhecida: core/analytics/carbonFootprintLCA.ts cita a 7.SM.7 (CH4 fossil GWP-100 = 27,9)';

function gasDef(gas: string, gwp20: number, gwp100: number): GwpFactorDef {
    return Object.freeze({
        gas,
        nameKey: `scenarioGwp.${gas}`,
        gwp20,
        gwp100,
        source: AR6,
    });
}

/**
 * Catálogo curado de gases (N8: o usuário ESCOLHE da lista). Cobre os gases que
 * o cenário RSU/aterro precisa (CO₂, as duas famílias de CH₄, N₂O) mais dois de
 * vida longa que documentam a INVERSÃO do horizonte (GWP-20 < GWP-100).
 * Ampliar exige trazer o par COM a fonte — que é o ponto inteiro deste módulo.
 * Congelado.
 */
export const DEFAULT_GWP_MAP: Readonly<Record<string, GwpFactorDef>> = Object.freeze({
    // Gás de referência: GWP ≡ 1 em qualquer horizonte, por definição.
    co2: gasDef('co2', 1, 1),
    // Metano FÓSSIL — inclui o CO₂ da oxidação do carbono fóssil. É o par que
    // fecha o "≈ 2,7×" da cláusula testável (82,5 / 29,8 = 2,77).
    ch4Fossil: gasDef('ch4Fossil', 82.5, 29.8),
    // Metano BIOGÊNICO (aterro, digestão anaeróbia) — sem a parcela fóssil.
    ch4Bio: gasDef('ch4Bio', 79.7, 27.0),
    // N₂O: vida ~109 anos, o par praticamente não muda entre os horizontes.
    n2o: gasDef('n2o', 273, 273),
    // SF₆: vida ~1000 anos — GWP-20 MENOR que GWP-100 (forçamento ainda subindo).
    sf6: gasDef('sf6', 18300, 25200),
    // HFC-134a: vida ~14 anos — como o CH₄, cai muito do horizonte curto ao longo.
    hfc134a: gasDef('hfc134a', 4144, 1526),
});

/** Versão do catálogo curado — trilha de auditoria da curadoria (N9). */
export const GWP_MAP_VERSION = 1;

/** Normaliza escrita (caixa, espaço, separador) sem inventar dado: 'CH4-fossil' → 'ch4fossil'. */
function normalizeGasKey(key: string): string {
    return key.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

/**
 * Índice normalizado → chave canônica do catálogo (montado uma vez).
 *
 * Semente SEM PROTÓTIPO (`Object.create(null)`): com um `{}` comum, a chave
 * 'constructor' — que já chega minúscula e por isso ATRAVESSA a normalização —
 * resolveria para `Object.prototype.constructor` em vez de `undefined`, e o
 * resolvedor seguiria adiante com um "gás" que não existe. Sem protótipo, a
 * única forma de achar algo aqui é o gás estar de fato no catálogo.
 */
const GAS_ALIAS: Readonly<Record<string, string>> = Object.freeze(
    Object.keys(DEFAULT_GWP_MAP).reduce<Record<string, string>>(
        (acc, gas) => {
            acc[normalizeGasKey(gas)] = gas;
            return acc;
        },
        Object.create(null) as Record<string, string>,
    ),
);

/**
 * Resolve uma chave para o gás curado correspondente.
 *
 * @param gas - Chave do gás pedida (aceita caixa e separador livres).
 * @returns O {@link GwpFactorDef} de fábrica, ou `null` fora do catálogo (N8).
 */
export function resolveGwpFactorDef(gas?: string | null): GwpFactorDef | null {
    if (typeof gas !== 'string') return null;
    const canonical = GAS_ALIAS[normalizeGasKey(gas)];
    return canonical === undefined ? null : (DEFAULT_GWP_MAP[canonical] as GwpFactorDef);
}

/** Todos os gases do catálogo (para validação e para o seletor da UI). */
export function listCuratedGases(): readonly string[] {
    return Object.freeze(Object.keys(DEFAULT_GWP_MAP));
}

// ─────────────────── Refresh de admin derivado da fonte ───────────────────

/** Um par de GWP atualizado pela fonte (ambos opcionais — atualiza-se o que mudou). */
export interface GwpPairOverride {
    readonly gwp20?: number;
    readonly gwp100?: number;
}

/**
 * Atualização curada por admin, derivada da fonte (mesmo papel do
 * `SectorRateOverride` do CFG-17). Deixa o catálogo acompanhar uma revisão do
 * IPCC — ou unificar com a 7.SM.7 — SEM reescrever este módulo.
 */
export interface GwpOverride {
    /** Gás → par atualizado (ex.: `{ ch4Fossil: { gwp100: 27.9 } }`). */
    readonly byGas?: Readonly<Record<string, GwpPairOverride>> | null;
    /**
     * Citação de onde os números acima vieram. Obrigatória na prática: sem ela o
     * refresh é rejeitado inteiro — valor novo sem fonte é exatamente o que este
     * módulo existe para impedir.
     */
    readonly source?: string;
    /** Versão do registro atualizado (trilha de auditoria). */
    readonly version?: number;
}

/** Registro de GWP validado, pronto para alimentar {@link resolveGwp}. */
export interface GwpRegistry {
    /** Só refreshes VÁLIDOS sobrevivem (gás conhecido + GWP finito e > 0). Congelado. */
    readonly byGas: Readonly<Record<string, GwpPairOverride>>;
    /** A fonte do refresh; `null` quando o registro é o de fábrica. */
    readonly source: string | null;
    readonly version: number;
    /** Quantas entradas do refresh foram RECUSADAS (auditoria). */
    readonly rejected: number;
}

/** Registro default: sem refresh, GWP como saíram de fábrica. Congelado. */
export const DEFAULT_GWP_REGISTRY: GwpRegistry = Object.freeze({
    byGas: Object.freeze({}) as Readonly<Record<string, GwpPairOverride>>,
    source: null,
    version: GWP_MAP_VERSION,
    rejected: 0,
});

/** GWP utilizável: finito e estritamente positivo (0 ou negativo não é GWP). */
function usableGwp(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/**
 * Resolve um registro de GWP validado a partir de um refresh de admin.
 *
 * Rejeita, contando em `rejected`: gás fora do catálogo, entrada sem nenhum GWP
 * utilizável, e valores não-finitos ou ≤ 0. Um valor inválido NÃO é coagido —
 * coagir um dado de fonte inventaria um número que o relatório não traz; a
 * entrada daquele gás é descartada e o valor de fábrica permanece.
 *
 * Refresh SEM `source` é rejeitado por inteiro. Não passar nada devolve o
 * registro de fábrica (zero regressão, §2.4.0 #2).
 *
 * @param override - Refresh curado por admin, derivado da fonte.
 * @returns {@link GwpRegistry} congelado.
 */
export function resolveGwpRegistry(override?: GwpOverride | null): GwpRegistry {
    if (!override || typeof override !== 'object') return DEFAULT_GWP_REGISTRY;
    const source =
        typeof override.source === 'string' && override.source.trim() !== '' ? override.source : null;
    const raw = override.byGas;
    if (source === null || !raw || typeof raw !== 'object') return DEFAULT_GWP_REGISTRY;

    const byGas: Record<string, GwpPairOverride> = {};
    let rejected = 0;
    for (const key of Object.keys(raw)) {
        const canonical = GAS_ALIAS[normalizeGasKey(key)];
        const pair = raw[key];
        if (canonical === undefined || !pair || typeof pair !== 'object') {
            rejected += 1;
            continue;
        }
        const next: { gwp20?: number; gwp100?: number } = {};
        if (usableGwp(pair.gwp20)) next.gwp20 = pair.gwp20;
        if (usableGwp(pair.gwp100)) next.gwp100 = pair.gwp100;
        // Entrada que não traz NENHUM número utilizável não é atualização.
        if (next.gwp20 === undefined && next.gwp100 === undefined) {
            rejected += 1;
            continue;
        }
        byGas[canonical] = Object.freeze(next);
    }
    return Object.freeze({
        byGas: Object.freeze(byGas) as Readonly<Record<string, GwpPairOverride>>,
        source,
        version:
            typeof override.version === 'number' && Number.isFinite(override.version)
                ? override.version
                : GWP_MAP_VERSION,
        rejected,
    });
}

// ───────────────────────────── Resolução ─────────────────────────────

/** Pedido de GWP: qual gás, em qual horizonte. */
export interface GwpSpec {
    /** Gás escolhido no catálogo curado. */
    readonly gas?: string | undefined;
    /**
     * Horizonte de integração. AUSENTE = usa o default de 100 anos (documentado).
     * PRESENTE mas fora de {20, 100} = pedido impossível → semDado (N3), nunca o
     * default em silêncio.
     */
    readonly horizon?: number | undefined;
}

/** GWP resolvido — o fator a aplicar e de onde ele veio. */
export interface ResolvedGwp {
    /** Gás aplicado; `null` quando nenhum gás válido foi escolhido. */
    readonly gas: string | null;
    /** Definição curada por trás do gás; `null` sem gás válido. */
    readonly def: GwpFactorDef | null;
    /** Horizonte aplicado; `null` quando o horizonte pedido não é curado. */
    readonly horizon: GwpHorizon | null;
    /**
     * O fator tCO₂e/t de gás. `null` = semDado (N3): gás desconhecido OU
     * horizonte não curado. Nunca um default silencioso.
     */
    readonly factor: number | null;
    /** Fonte do número acima (a do refresh quando houve um); `null` sem fator. */
    readonly source: string | null;
    /** true sempre que não há fator honesto a aplicar. */
    readonly semDado: boolean;
    /** Gás pedido; `null` quando não pediu (auditoria). */
    readonly requestedGas: string | null;
    /** Horizonte pedido; `null` quando não pediu (auditoria). */
    readonly requestedHorizon: number | null;
    /** `true` quando o gás pedido não está no catálogo (N8 visível). */
    readonly unknownGas: boolean;
    /** `true` quando o horizonte pedido existe mas não é curado (N3 visível). */
    readonly unknownHorizon: boolean;
    /** `true` quando o fator veio de um refresh de admin, não de fábrica. */
    readonly refreshed: boolean;
    /** Versão do catálogo/registro efetivamente aplicado. */
    readonly version: number;
}

/**
 * Resolve o fator GWP de um gás no horizonte pedido (CFG-28).
 *
 * Horizonte AUSENTE → 100 anos (o default do item, comportamento de hoje).
 * Horizonte presente e não curado → `factor: null` + `unknownHorizon`, JAMAIS o
 * default: engolir o pedido e devolver outro horizonte produziria um tCO₂e
 * plausível e errado, sem rastro (o falso-verde do CFG-21).
 *
 * @param spec - Gás escolhido e horizonte pedido.
 * @param registry - Registro de refresh; omitido = valores de fábrica.
 * @returns {@link ResolvedGwp} congelado, com procedência e recusas visíveis.
 */
export function resolveGwp(spec?: GwpSpec | undefined, registry?: GwpRegistry | null): ResolvedGwp {
    const requestedGas = typeof spec?.gas === 'string' ? spec.gas : null;
    const requestedHorizon = typeof spec?.horizon === 'number' ? spec.horizon : null;
    const def = resolveGwpFactorDef(spec?.gas);
    const reg = registry ?? DEFAULT_GWP_REGISTRY;

    // Horizonte: ausente vale o default; presente-e-não-curado é pedido impossível.
    const asked = spec?.horizon;
    const horizonMissing = asked === undefined || asked === null;
    const horizon: GwpHorizon | null = horizonMissing
        ? DEFAULT_GWP_HORIZON
        : isGwpHorizon(asked)
          ? asked
          : null;
    const unknownHorizon = horizon === null;

    let factor: number | null = null;
    let source: string | null = null;
    let refreshed = false;
    if (def !== null && horizon !== null) {
        const fresh = Object.prototype.hasOwnProperty.call(reg.byGas, def.gas)
            ? (reg.byGas[def.gas] as GwpPairOverride)
            : null;
        const shipped = horizon === 20 ? def.gwp20 : def.gwp100;
        const updated = fresh === null ? undefined : horizon === 20 ? fresh.gwp20 : fresh.gwp100;
        refreshed = updated !== undefined && updated !== shipped;
        factor = updated !== undefined ? updated : shipped;
        // A fonte acompanha o NÚMERO em campo, não o preset de origem.
        source = refreshed ? reg.source : def.source;
    }

    return Object.freeze({
        gas: def === null ? null : def.gas,
        def,
        horizon,
        factor,
        source: factor === null ? null : source,
        semDado: factor === null,
        requestedGas,
        requestedHorizon,
        unknownGas: requestedGas !== null && def === null,
        unknownHorizon,
        refreshed,
        version: reg.version,
    });
}

/**
 * Converte uma massa de gás em tCO₂e pelo GWP resolvido.
 *
 * @param massT - Massa do gás (toneladas). Não-finita ou negativa → `null`.
 * @param resolved - GWP já resolvido por {@link resolveGwp}.
 * @returns tCO₂e, ou `null` quando falta o fator ou a massa (N3 — a ausência
 *   ATRAVESSA a conta em vez de virar zero).
 */
export function toCO2e(massT: number, resolved: ResolvedGwp): number | null {
    if (resolved.factor === null) return null;
    if (typeof massT !== 'number' || !Number.isFinite(massT) || massT < 0) return null;
    return massT * resolved.factor;
}
