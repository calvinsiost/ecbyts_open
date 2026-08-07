// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   SCENARIO MCF — Fator de Correção de Metano por tipo de disposição
   (CFG-29, TEMA G, domínio RSU/aterro).

   SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md
     - §2.4 CFG-29 — "MCF (fator de correção de metano, IPCC) configurável —
       crítico p/ RSU/aterro. Hoje ausente. Adiciona MCF como parâmetro dentro
       de faixa IPCC (por tipo de aterro), default conforme tier de aterro
       gerenciado. Testável: MCF=0.4 vs 1.0 muda a emissão de metano do cenário
       RSU, com fonte IPCC."
     - §2.4.0 #5 — toda faixa numérica traz a norma/fonte que a fundamenta.

   ─── O que o MCF é, e por que ele NÃO é um "ajuste fino" ───

   O potencial de geração de metano de um resíduo (L₀ / DDOC) supõe degradação
   ANAERÓBIA. Um local de disposição raramente é 100% anaeróbio: lixão raso arejado
   por cima degrada boa parte da matéria orgânica aerobicamente — e degradação
   aeróbia produz CO₂, não CH₄. O MCF é a fração do resíduo que de fato segue a
   rota anaeróbia, e por isso multiplica DIRETO a emissão de metano.

   A consequência prática é contra-intuitiva e vale registrar: pelo MCF, o
   ATERRO BEM GERENCIADO (anaeróbio, MCF 1,0) gera MAIS metano bruto que o lixão
   raso (MCF 0,4) — 2,5× mais. O ganho ambiental do aterro gerenciado não está
   aqui; está na CAPTURA do gás (CFG-30) e no controle de chorume/vetores.
   Quem ler o MCF como "nota de qualidade do aterro" inverte o sinal.

   ─── O PADRÃO SEGUIDO: `_scenarioSectorRatePure.ts` (CFG-17) ───

   Catálogo curado + `source` por valor, refresh de admin derivado da fonte,
   `version` como trilha de auditoria (N9), e "editável dentro da faixa": um
   ajuste manual vence o preset e é clampado na faixa física. Refresh sem
   `source` é rejeitado inteiro.

   Uma distinção deliberada, herdada do CFG-17: ajuste MANUAL é clampado (o
   número é do usuário, e a faixa é física); refresh de ADMIN fora da faixa é
   RECUSADO, não clampado — clampar um dado de fonte inventaria um número que a
   norma não traz e o venderia com a citação dela.

   ─── Procedência dos valores de fábrica ───

   IPCC (2006), Diretrizes para Inventários Nacionais de GEE, Vol. 5 (Resíduos),
   Cap. 3 (Disposição de Resíduos Sólidos), Tabela 3.1 — valores default de MCF
   por categoria de local de disposição (SWDS). São os mesmos valores mantidos
   pelo Refinamento de 2019.

   ─── N3 — o que NÃO acontece aqui ───

   Categoria fora do catálogo devolve `mcf: null` + `semDado: true`. NÃO cai no
   1,0 do aterro gerenciado em silêncio: pedir "aterro semi-aeróbio profundo" e
   receber MCF 1,0 sem aviso produziria uma emissão 2× a real com cara de
   legítima — o falso-verde que o CFG-21 destapou. NÃO pedir categoria nenhuma é
   outra coisa: aí vale o default documentado do item (aterro gerenciado
   anaeróbio), e o resultado marca `defaulted` para que a escolha fique visível.

   ZERO DOM, ZERO IO, determinístico. Objetos retornados congelados.
   ================================================================ */

// ───────────────────────────── Faixa validada ─────────────────────────────

/**
 * Piso do MCF: 0 — nenhuma fração do resíduo segue a rota anaeróbia (nenhum
 * metano de degradação). Abaixo disso o fator deixaria de ser uma fração.
 */
export const MIN_MCF = 0;

/** Teto do MCF: 1 — degradação 100% anaeróbia (o aterro gerenciado da Tabela 3.1). */
export const MAX_MCF = 1;

/**
 * Categoria default (§2.4 CFG-29: "default conforme tier de aterro gerenciado").
 * MCF 1,0 é também o comportamento de HOJE — sem MCF, a conta aplica o potencial
 * anaeróbio inteiro, que é exatamente multiplicar por 1 (zero regressão).
 */
export const DEFAULT_MCF_CATEGORY = 'managedAnaerobic';

/** Traz um MCF manual para a faixa física (§ MIN/MAX_MCF). */
export function clampMcf(mcf?: number | null): number | null {
    if (typeof mcf !== 'number' || !Number.isFinite(mcf)) return null;
    return Math.min(MAX_MCF, Math.max(MIN_MCF, mcf));
}

// ───────────────────────────── Catálogo curado ─────────────────────────────

/** Uma categoria de local de disposição, com o MCF e a fonte DAQUELE número. */
export interface McfCategoryDef {
    /** Chave estável da categoria (ex.: 'unmanagedShallow'). */
    readonly category: string;
    /** Chave i18n do rótulo (convenção de catálogo curado do repo). */
    readonly nameKey: string;
    /** Fator de correção de metano (fração 0..1). */
    readonly mcf: number;
    /** Critério físico que define a categoria na norma (profundidade, aeração). */
    readonly criterion: string;
    /**
     * Procedência DO NÚMERO ACIMA. Nunca ''. Trocada junto com o valor quando um
     * refresh de admin o atualiza — fonte que não descreve o número em campo não
     * é rastreabilidade, é decoração.
     */
    readonly source: string;
}

const IPCC_2006 =
    'IPCC (2006), Diretrizes para Inventarios Nacionais de GEE, Vol.5 (Residuos), Cap.3 (SWDS), Tabela 3.1 — valores default de MCF por categoria de local de disposicao; mantidos no Refinamento de 2019';

function mcfDef(category: string, mcf: number, criterion: string): McfCategoryDef {
    return Object.freeze({
        category,
        nameKey: `scenarioMcf.${category}`,
        mcf,
        criterion,
        source: IPCC_2006,
    });
}

/**
 * Catálogo curado de categorias de disposição (N8: o usuário ESCOLHE da lista e
 * ajusta dentro da faixa). Cobre as cinco categorias da Tabela 3.1. Ampliar
 * exige trazer o número COM a fonte — o ponto inteiro deste módulo. Congelado.
 */
export const DEFAULT_MCF_MAP: Readonly<Record<string, McfCategoryDef>> = Object.freeze({
    // Aterro gerenciado anaeróbio — cobertura, compactação, sem aeração.
    managedAnaerobic: mcfDef(
        'managedAnaerobic',
        1.0,
        'Aterro gerenciado anaerobio: cobertura de material, compactacao mecanica e nivelamento',
    ),
    // Aterro gerenciado SEMI-aeróbio — estrutura de aeração passiva projetada.
    managedSemiAerobic: mcfDef(
        'managedSemiAerobic',
        0.5,
        'Aterro gerenciado semi-aerobio: estrutura permeavel ao ar, drenagem de chorume e ventilacao de gas projetadas',
    ),
    // Lixão PROFUNDO (≥ 5 m) e/ou lençol freático alto — quase todo anaeróbio.
    unmanagedDeep: mcfDef(
        'unmanagedDeep',
        0.8,
        'Local nao gerenciado profundo: >= 5 m de residuo e/ou lencol freatico alto',
    ),
    // Lixão RASO (< 5 m) — arejado por cima, boa parte degrada aerobicamente.
    unmanagedShallow: mcfDef(
        'unmanagedShallow',
        0.4,
        'Local nao gerenciado raso: < 5 m de residuo',
    ),
    // Local sem categoria determinada — o default conservador da própria norma.
    uncategorised: mcfDef(
        'uncategorised',
        0.6,
        'Local de disposicao nao categorizado: usado quando o tipo do local nao pode ser determinado',
    ),
});

/** Versão do catálogo curado — trilha de auditoria da curadoria (N9). */
export const MCF_MAP_VERSION = 1;

/** Normaliza escrita (caixa, espaço, separador, acento) sem inventar dado. */
function normalizeCategoryKey(key: string): string {
    return key
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // marcas diacriticas decompostas pelo NFD
        .replace(/[\s_-]+/g, '');
}

/**
 * Índice normalizado → chave canônica do catálogo (montado uma vez).
 *
 * Semente SEM PROTÓTIPO (`Object.create(null)`): com um `{}` comum, a chave
 * 'constructor' — que já chega minúscula e por isso ATRAVESSA a normalização —
 * resolveria para `Object.prototype.constructor` em vez de `undefined`, e o
 * resolvedor seguiria adiante com uma "categoria" que não existe. Sem protótipo,
 * a única forma de achar algo aqui é a categoria estar de fato no catálogo.
 */
const CATEGORY_ALIAS: Readonly<Record<string, string>> = Object.freeze(
    Object.keys(DEFAULT_MCF_MAP).reduce<Record<string, string>>(
        (acc, category) => {
            acc[normalizeCategoryKey(category)] = category;
            return acc;
        },
        Object.create(null) as Record<string, string>,
    ),
);

/**
 * Resolve uma chave para a categoria curada correspondente.
 *
 * @param category - Chave pedida (aceita caixa, acento e separador livres).
 * @returns O {@link McfCategoryDef} de fábrica, ou `null` fora do catálogo (N8).
 */
export function resolveMcfCategoryDef(category?: string | null): McfCategoryDef | null {
    if (typeof category !== 'string') return null;
    const canonical = CATEGORY_ALIAS[normalizeCategoryKey(category)];
    return canonical === undefined ? null : (DEFAULT_MCF_MAP[canonical] as McfCategoryDef);
}

/** Todas as categorias do catálogo (para validação e para o seletor da UI). */
export function listCuratedMcfCategories(): readonly string[] {
    return Object.freeze(Object.keys(DEFAULT_MCF_MAP));
}

// ─────────────────── Refresh de admin derivado da fonte ───────────────────

/**
 * Atualização curada por admin, derivada da fonte (mesmo papel do
 * `SectorRateOverride` do CFG-17). Deixa o catálogo acompanhar uma revisão do
 * IPCC — ou uma tabela nacional de MCF — SEM reescrever este módulo.
 */
export interface McfOverride {
    /** Categoria → MCF atualizado (ex.: `{ uncategorised: 0.55 }`). */
    readonly byCategory?: Readonly<Record<string, number>> | null;
    /**
     * Citação de onde os números acima vieram. Obrigatória na prática: sem ela o
     * refresh é rejeitado inteiro — valor novo sem fonte é exatamente o que este
     * módulo existe para impedir.
     */
    readonly source?: string;
    /** Versão do registro atualizado (trilha de auditoria). */
    readonly version?: number;
}

/** Registro de MCF validado, pronto para alimentar {@link resolveMcf}. */
export interface McfRegistry {
    /** Só refreshes VÁLIDOS sobrevivem (categoria conhecida + MCF na faixa). Congelado. */
    readonly byCategory: Readonly<Record<string, number>>;
    /** A fonte do refresh; `null` quando o registro é o de fábrica. */
    readonly source: string | null;
    readonly version: number;
    /** Quantas entradas do refresh foram RECUSADAS (auditoria). */
    readonly rejected: number;
}

/** Registro default: sem refresh, MCF como saíram de fábrica. Congelado. */
export const DEFAULT_MCF_REGISTRY: McfRegistry = Object.freeze({
    byCategory: Object.freeze({}) as Readonly<Record<string, number>>,
    source: null,
    version: MCF_MAP_VERSION,
    rejected: 0,
});

/**
 * Resolve um registro de MCF validado a partir de um refresh de admin.
 *
 * Rejeita, contando em `rejected`: categoria fora do catálogo, MCF não-finito e
 * MCF fora da faixa 0–1. Um valor fora da faixa NÃO é clampado aqui — clampar um
 * dado de fonte inventaria um número que a norma não traz; o refresh daquela
 * categoria é descartado e o valor de fábrica permanece.
 *
 * Refresh SEM `source` é rejeitado por inteiro. Não passar nada devolve o
 * registro de fábrica (zero regressão, §2.4.0 #2).
 *
 * @param override - Refresh curado por admin, derivado da fonte.
 * @returns {@link McfRegistry} congelado.
 */
export function resolveMcfRegistry(override?: McfOverride | null): McfRegistry {
    if (!override || typeof override !== 'object') return DEFAULT_MCF_REGISTRY;
    const source =
        typeof override.source === 'string' && override.source.trim() !== '' ? override.source : null;
    const raw = override.byCategory;
    if (source === null || !raw || typeof raw !== 'object') return DEFAULT_MCF_REGISTRY;

    const byCategory: Record<string, number> = {};
    let rejected = 0;
    for (const key of Object.keys(raw)) {
        const canonical = CATEGORY_ALIAS[normalizeCategoryKey(key)];
        const mcf = raw[key];
        const usable =
            typeof mcf === 'number' && Number.isFinite(mcf) && mcf >= MIN_MCF && mcf <= MAX_MCF;
        if (canonical === undefined || !usable) {
            rejected += 1;
            continue;
        }
        byCategory[canonical] = mcf as number;
    }
    return Object.freeze({
        byCategory: Object.freeze(byCategory) as Readonly<Record<string, number>>,
        source,
        version:
            typeof override.version === 'number' && Number.isFinite(override.version)
                ? override.version
                : MCF_MAP_VERSION,
        rejected,
    });
}

// ───────────────────────────── Resolução ─────────────────────────────

/** Pedido de MCF (categoria do catálogo + ajuste manual dentro da faixa). */
export interface McfSpec {
    /**
     * Categoria do local de disposição. AUSENTE = usa o default documentado
     * (aterro gerenciado anaeróbio). PRESENTE e fora do catálogo = pedido
     * impossível → semDado (N3), nunca o default em silêncio.
     */
    readonly category?: string | undefined;
    /**
     * Ajuste MANUAL do MCF (o "dentro de faixa IPCC" do item). Vence o preset; a
     * categoria escolhida continua registrada.
     */
    readonly mcf?: number | undefined;
}

/** MCF resolvido — o fator a aplicar e de onde ele veio. */
export interface ResolvedMcf {
    /** Categoria aplicada; `null` quando a categoria pedida não é curada. */
    readonly category: string | null;
    /** Definição curada por trás da categoria; `null` sem categoria válida. */
    readonly def: McfCategoryDef | null;
    /**
     * O fator 0..1 a multiplicar pelo potencial de metano. `null` = semDado (N3):
     * categoria pedida e desconhecida. Nunca um default silencioso.
     */
    readonly mcf: number | null;
    /** Fonte do número acima (a do refresh quando houve um); `null` sem fator ou
     *  quando o número é um ajuste manual do usuário. */
    readonly source: string | null;
    /** true sempre que não há fator honesto a aplicar. */
    readonly semDado: boolean;
    /** Categoria pedida; `null` quando não pediu (auditoria). */
    readonly requestedCategory: string | null;
    /** MCF manual pedido; `null` quando não pediu (auditoria). */
    readonly requestedMcf: number | null;
    /** `true` quando a categoria pedida não está no catálogo (N8/N3 visível). */
    readonly unknownCategory: boolean;
    /** `true` quando NINGUÉM pediu categoria e o default do item foi aplicado. */
    readonly defaulted: boolean;
    /** `true` quando um ajuste manual venceu o MCF do preset. */
    readonly custom: boolean;
    /** `true` quando o ajuste manual foi trazido para dentro da faixa 0–1. */
    readonly clamped: boolean;
    /** `true` quando o fator veio de um refresh de admin, não de fábrica. */
    readonly refreshed: boolean;
    /** Versão do catálogo/registro efetivamente aplicado. */
    readonly version: number;
}

/**
 * Resolve o fator de correção de metano (CFG-29).
 *
 * Ordem: ajuste MANUAL (clampado na faixa 0–1) > MCF do REFRESH de admin > MCF
 * de FÁBRICA da categoria. Categoria AUSENTE → default do item (aterro
 * gerenciado anaeróbio, MCF 1,0 — o comportamento de hoje), marcado em
 * `defaulted`. Categoria PRESENTE e fora do catálogo → `mcf: null`, JAMAIS o
 * default: engolir o pedido produziria uma emissão plausível e errada.
 *
 * @param spec - Categoria escolhida e/ou ajuste manual do MCF.
 * @param registry - Registro de refresh; omitido = valores de fábrica.
 * @returns {@link ResolvedMcf} congelado, com procedência e recusas visíveis.
 */
export function resolveMcf(spec?: McfSpec | undefined, registry?: McfRegistry | null): ResolvedMcf {
    const requestedCategory = typeof spec?.category === 'string' ? spec.category : null;
    const asked = spec?.category;
    const categoryMissing = asked === undefined || asked === null;
    const def = categoryMissing
        ? (DEFAULT_MCF_MAP[DEFAULT_MCF_CATEGORY] as McfCategoryDef)
        : resolveMcfCategoryDef(asked);
    const reg = registry ?? DEFAULT_MCF_REGISTRY;

    const requestedMcf = typeof spec?.mcf === 'number' ? spec.mcf : null;
    const manual = clampMcf(spec?.mcf);

    // MCF de fábrica, possivelmente atualizado pelo refresh — e a fonte
    // acompanha o número, não o preset de origem.
    let baseMcf: number | null = null;
    let source: string | null = null;
    let refreshed = false;
    if (def !== null) {
        const fresh = Object.prototype.hasOwnProperty.call(reg.byCategory, def.category)
            ? (reg.byCategory[def.category] as number)
            : null;
        refreshed = fresh !== null && fresh !== def.mcf;
        baseMcf = fresh !== null ? fresh : def.mcf;
        source = refreshed ? reg.source : def.source;
    }

    const mcf = manual !== null ? manual : baseMcf;
    // MCF digitado pelo usuário NÃO herda a citação do preset: aquele número é
    // dele, e atribuí-lo à norma seria falsear a rastreabilidade (CFG-17).
    const mcfSource = manual === null && baseMcf !== null ? source : null;

    return Object.freeze({
        category: def === null ? null : def.category,
        def,
        mcf,
        source: mcfSource,
        semDado: mcf === null,
        requestedCategory,
        requestedMcf,
        unknownCategory: requestedCategory !== null && def === null,
        defaulted: categoryMissing,
        custom: manual !== null,
        clamped: manual !== null && manual !== requestedMcf,
        refreshed,
        version: reg.version,
    });
}

/**
 * Aplica o MCF ao potencial de geração de metano do local.
 *
 * @param methanePotentialT - Metano que o resíduo geraria em degradação 100%
 *   anaeróbia (t CH₄). Não-finito ou negativo → `null`.
 * @param resolved - MCF já resolvido por {@link resolveMcf}.
 * @returns Metano gerado (t CH₄), ou `null` quando falta o fator ou o potencial
 *   (N3 — a ausência ATRAVESSA a conta em vez de virar zero).
 */
export function applyMcf(methanePotentialT: number, resolved: ResolvedMcf): number | null {
    if (resolved.mcf === null) return null;
    if (
        typeof methanePotentialT !== 'number' ||
        !Number.isFinite(methanePotentialT) ||
        methanePotentialT < 0
    ) {
        return null;
    }
    return methanePotentialT * resolved.mcf;
}
