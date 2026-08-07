// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   SCENARIO SECTOR DISCOUNT-RATE PRESETS — pure-logic (CFG-17, TEMA E).

   SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md
     - §2.4 CFG-17 — "Presets de taxa de desconto por setor (mineração 8%,
       petróleo 12%, utilities 5%). Catálogo curado de taxas por setor,
       selecionável; default = 8% projeto. Testável: setor=petróleo → 12%
       PRÉ-PREENCHIDO (editável dentro da faixa)."
     - §2.4.0 #5 — "toda faixa numérica traz a norma/fonte que a fundamenta —
       mesmo rigor de `source` obrigatório do mapa ODS (§3, Rastreabilidade)."

   ─── O PADRÃO SEGUIDO: `_odsIndicatorMapPure.ts` (precedente do repo) ───

   Naquele módulo cada indicador ODS carrega `{goal, target, indicator, tier,
   source}` e o `tier` é DADO DERIVÁVEL DA FONTE, não constante fixa: a
   classificação IAEG-SDGs muda periodicamente, então o tier que sai de fábrica é
   só o default curado NAQUELA `version`, e um admin o atualiza a partir da fonte
   via override validado — SEM reescrever o módulo.

   Custo de capital por setor é o mesmo tipo de dado, e com força ainda maior:
   ele é REVISADO TODO ANO. Uma taxa setorial cravada em código é garantia de
   ficar velha em silêncio — o número segue lá, plausível, e ninguém percebe que
   envelheceu. Por isso este módulo copia a estrutura inteira do precedente:

     preset curado + `source` por preset  →  SectorRateDef
     override de admin derivado da fonte  →  SectorRateOverride
     registro validado                    →  resolveSectorRateRegistry
     versão como trilha de auditoria      →  SECTOR_RATE_MAP_VERSION

   Com uma diferença deliberada: quando o refresh troca o NÚMERO, ele troca
   também a FONTE. Manter a citação antiga colada num valor novo seria pior que
   não ter fonte — a rastreabilidade apontaria para um documento que não contém
   aquele número. O campo `source` sempre descreve o valor que está de fato no
   campo.

   ─── Procedência dos valores de fábrica (declarada, sem inventar norma) ───

   8% / 12% / 5% são os valores da PRÓPRIA §2.4 CFG-17 — curadoria do projeto,
   versionada, coerente com o default histórico do motor (8% = referência Tier-2
   BR de mineração). NÃO são citação de um levantamento externo, e o `source`
   diz isso com todas as letras.

   Para ATUALIZAR com dado de mercado, a fonte pública canônica é o levantamento
   anual "Cost of Capital by Industry Sector" (A. Damodaran, NYU Stern), revisado
   em janeiro. É por isso que o override existe: o caminho previsto para um número
   de mercado é ENTRAR PELA FONTE, com a citação junto, não ser chutado aqui
   dentro com a etiqueta de um levantamento que ninguém conferiu.

   ─── Escopo: setor sugere a taxa FINANCEIRA, e só ela ───

   O eixo AMBIENTAL não entra aqui. "Quanto o futuro ambiental vale" é pergunta
   de política/stakeholder — é o CFG-16 (`_scenarioRiskProfilePure.ts`), onde ela
   tem âncora citável (Green Book). Setor descreve risco de negócio, não
   preferência social intertemporal; misturar os dois inventaria política a
   partir de dado financeiro.

   ─── Precedência: setor PRÉ-PREENCHE (o verbo é da spec) ───

   Pré-preencher é a forma mais fraca de decidir. Por isso, na cadeia do veredito
   ΔNPV, o setor fica ABAIXO do perfil de stakeholder (CFG-16 — a pergunta mais
   específica: de quem é a exigência de retorno) e ABAIXO da taxa explícita, e
   acima apenas do default do motor. Continua "editável dentro da faixa": um
   ajuste manual vence o preset e é clampado pela MESMA faixa 0–25% do CFG-16
   (uma faixa só para "taxa de desconto", importada de lá — duas cópias poderiam
   divergir numa revisão e ninguém notaria).

   ZERO DOM, ZERO IO, determinístico. Objetos retornados congelados.
   ================================================================ */

import {
    clampDiscountRate,
    MAX_DISCOUNT_RATE,
    MIN_DISCOUNT_RATE,
} from './_scenarioRiskProfilePure.js';

// ───────────────────────────── Catálogo curado ─────────────────────────────

/** Um preset setorial de taxa de desconto, com a fonte do seu número. */
export interface SectorRateDef {
    /** Chave estável do setor, sem acento (ex.: 'mineracao'). */
    readonly sector: string;
    /** Chave i18n do rótulo (convenção de catálogo curado do repo). */
    readonly nameKey: string;
    /** Taxa sugerida para o setor (fração/ano), dentro da faixa validada. */
    readonly discountRate: number;
    /**
     * Procedência DO NÚMERO ACIMA. Nunca ''. Trocado junto com o valor quando um
     * refresh de admin o atualiza — fonte que não descreve o número em campo não
     * é rastreabilidade, é decoração.
     */
    readonly source: string;
}

const CURADORIA =
    'Curadoria do projeto, versionada — SPEC_SCENARIOS_PROCESS_IMPACT.md §2.4 CFG-17 (8% = referência Tier-2 BR de mineração, o default histórico do motor). Atualizar com dado de mercado via override, citando o levantamento anual de custo de capital por setor (A. Damodaran, NYU Stern)';

function preset(sector: string, discountRate: number): SectorRateDef {
    return Object.freeze({
        sector,
        nameKey: `scenarioSector.${sector}`,
        discountRate,
        source: CURADORIA,
    });
}

/**
 * Catálogo setorial curado (N8: o usuário ESCOLHE da lista e ajusta dentro da
 * faixa). Cobre exatamente os setores que a §2.4 CFG-17 nomeia — ampliar exige
 * trazer o número COM a fonte, que é o ponto inteiro deste módulo. Congelado.
 */
export const DEFAULT_SECTOR_RATE_MAP: Readonly<Record<string, SectorRateDef>> = Object.freeze({
    // Mineração — o setor-raiz da feature; casa com o default histórico do motor.
    mineracao: preset('mineracao', 0.08),
    // Petróleo & gás — risco de preço de commodity e de reserva mais alto.
    petroleo: preset('petroleo', 0.12),
    // Utilities reguladas — receita estável, custo de capital mais baixo.
    utilities: preset('utilities', 0.05),
});

/** Versão do catálogo curado — trilha de auditoria da curadoria (N9). */
export const SECTOR_RATE_MAP_VERSION = 1;

/** Normaliza escrita (caixa, espaço, acento) sem inventar dado: 'Mineração' → 'mineracao'. */
function normalizeSectorKey(key: string): string {
    return key
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, ''); // marcas diacriticas decompostas pelo NFD
}

/**
 * Resolve uma chave para o preset setorial curado correspondente.
 *
 * @param sector - Chave do setor pedida (aceita acento e caixa livre).
 * @returns O {@link SectorRateDef} de fábrica, ou `null` fora do catálogo (N8).
 */
export function resolveSectorRateDef(sector?: string | null): SectorRateDef | null {
    if (typeof sector !== 'string') return null;
    const key = normalizeSectorKey(sector);
    return Object.prototype.hasOwnProperty.call(DEFAULT_SECTOR_RATE_MAP, key)
        ? (DEFAULT_SECTOR_RATE_MAP[key] as SectorRateDef)
        : null;
}

/** Todos os setores do catálogo (para validação e para o seletor da UI). */
export function listCuratedSectors(): readonly string[] {
    return Object.freeze(Object.keys(DEFAULT_SECTOR_RATE_MAP));
}

// ─────────────────── Refresh de admin derivado da fonte ───────────────────

/**
 * Atualização curada por admin, derivada da fonte (mesmo papel do
 * `OdsTierOverride` no mapa ODS). Deixa a taxa setorial acompanhar a revisão
 * anual de custo de capital SEM reescrever este módulo.
 */
export interface SectorRateOverride {
    /** Setor → taxa atualizada (ex.: `{ petroleo: 0.11 }`). */
    readonly bySector?: Readonly<Record<string, number>> | null;
    /**
     * Citação do levantamento de onde as taxas acima vieram. Obrigatória na
     * prática: sem ela o refresh é rejeitado inteiro — número novo sem fonte é
     * exatamente o que este módulo existe para impedir.
     */
    readonly source?: string;
    /** Versão do registro atualizado (trilha de auditoria). */
    readonly version?: number;
}

/** Registro setorial validado, pronto para alimentar {@link resolveSectorRate}. */
export interface SectorRateRegistry {
    /** Só refreshes VÁLIDOS sobrevivem (setor conhecido + taxa na faixa). Congelado. */
    readonly bySector: Readonly<Record<string, number>>;
    /** A fonte do refresh; `null` quando o registro é o de fábrica. */
    readonly source: string | null;
    readonly version: number;
    /** Quantas entradas do refresh foram RECUSADAS (auditoria). */
    readonly rejected: number;
}

/** Registro default: sem refresh, taxas como saíram de fábrica. Congelado. */
export const DEFAULT_SECTOR_RATE_REGISTRY: SectorRateRegistry = Object.freeze({
    bySector: Object.freeze({}) as Readonly<Record<string, number>>,
    source: null,
    version: SECTOR_RATE_MAP_VERSION,
    rejected: 0,
});

/**
 * Resolve um registro setorial validado a partir de um refresh de admin.
 *
 * Rejeita, contando em `rejected`: setor fora do catálogo, taxa não-finita e
 * taxa fora da faixa 0–25%. Uma taxa fora da faixa NÃO é clampada aqui — clampar
 * um dado de fonte inventaria um número que o levantamento não traz; o refresh
 * inteiro daquele setor é descartado e o valor de fábrica permanece.
 *
 * Refresh SEM `source` é rejeitado por inteiro: trocar o número e perder a
 * citação é o pior dos dois mundos (dado novo, rastreabilidade morta).
 * Não passar nada devolve o registro de fábrica (zero regressão, §2.4.0 #2).
 *
 * @param override - Refresh curado por admin, derivado da fonte.
 * @returns {@link SectorRateRegistry} congelado.
 */
export function resolveSectorRateRegistry(
    override?: SectorRateOverride | null,
): SectorRateRegistry {
    if (!override || typeof override !== 'object') return DEFAULT_SECTOR_RATE_REGISTRY;
    const source = typeof override.source === 'string' && override.source.trim() !== '' ? override.source : null;
    const raw = override.bySector;
    if (source === null || !raw || typeof raw !== 'object') {
        return DEFAULT_SECTOR_RATE_REGISTRY;
    }
    const bySector: Record<string, number> = {};
    let rejected = 0;
    for (const key of Object.keys(raw)) {
        const sector = normalizeSectorKey(key);
        const rate = raw[key];
        const known = Object.prototype.hasOwnProperty.call(DEFAULT_SECTOR_RATE_MAP, sector);
        const usable =
            typeof rate === 'number' &&
            Number.isFinite(rate) &&
            rate >= MIN_DISCOUNT_RATE &&
            rate <= MAX_DISCOUNT_RATE;
        if (!known || !usable) {
            rejected += 1;
            continue;
        }
        bySector[sector] = rate as number;
    }
    return Object.freeze({
        bySector: Object.freeze(bySector) as Readonly<Record<string, number>>,
        source,
        version:
            typeof override.version === 'number' && Number.isFinite(override.version)
                ? override.version
                : SECTOR_RATE_MAP_VERSION,
        rejected,
    });
}

// ───────────────────────────── Resolução ─────────────────────────────

/** Pedido de taxa setorial (preset + ajuste manual dentro da faixa). */
export interface SectorRateSpec {
    /** Setor escolhido no catálogo curado. Ausente = nada a pré-preencher. */
    readonly sector?: string | undefined;
    /**
     * Ajuste MANUAL da taxa (o "editável dentro da faixa" do item). Vence o
     * preset; o setor escolhido continua registrado.
     */
    readonly discountRate?: number | undefined;
}

/** Taxa setorial resolvida — o número a pré-preencher e de onde ele veio. */
export interface ResolvedSectorRate {
    /** Setor aplicado; `null` quando nenhum setor válido foi escolhido. */
    readonly sector: string | null;
    /** Preset curado por trás do setor; `null` sem setor. */
    readonly preset: SectorRateDef | null;
    /**
     * Taxa a pré-preencher. `null` = NÃO HÁ o que sugerir (N3) — ausência de
     * setor não vira 8% forjado; quem decide o default é o motor, não este mapa.
     */
    readonly discountRate: number | null;
    /** Fonte do número acima (a do refresh quando houve um); `null` sem taxa. */
    readonly source: string | null;
    /** Setor pedido; `null` quando não pediu (auditoria). */
    readonly requestedSector: string | null;
    /** Taxa manual pedida; `null` quando não pediu (auditoria). */
    readonly requestedRate: number | null;
    /** `true` quando o setor pedido não está no catálogo (N8 visível). */
    readonly unknownSector: boolean;
    /** `true` quando um ajuste manual venceu a taxa do preset. */
    readonly custom: boolean;
    /** `true` quando o ajuste manual foi trazido para dentro da faixa. */
    readonly clamped: boolean;
    /** `true` quando a taxa veio de um refresh de admin, não de fábrica. */
    readonly refreshed: boolean;
    /** Versão do catálogo/registro efetivamente aplicado. */
    readonly version: number;
}

/**
 * Resolve a taxa de desconto sugerida por setor (CFG-17).
 *
 * Ordem: ajuste MANUAL (dentro da faixa) > taxa do REFRESH de admin > taxa de
 * FÁBRICA do preset. Sem setor válido, `discountRate` é `null` — o módulo não
 * tem o que sugerir e não inventa (N3); o default de 8% é decisão do motor.
 *
 * @param spec - Setor escolhido e/ou ajuste manual da taxa.
 * @param registry - Registro de refresh; omitido = taxas de fábrica.
 * @returns {@link ResolvedSectorRate} congelado, com procedência e ajustes visíveis.
 */
export function resolveSectorRate(
    spec?: SectorRateSpec | undefined,
    registry?: SectorRateRegistry | null,
): ResolvedSectorRate {
    const requestedSector = typeof spec?.sector === 'string' ? spec.sector : null;
    const def = resolveSectorRateDef(spec?.sector);
    const reg = registry ?? DEFAULT_SECTOR_RATE_REGISTRY;

    const requestedRate = typeof spec?.discountRate === 'number' ? spec.discountRate : null;
    const manual = clampDiscountRate(spec?.discountRate);

    // Taxa de fábrica, possivelmente atualizada pelo refresh de admin — e a
    // fonte acompanha o número, não o preset de origem.
    let baseRate: number | null = null;
    let source: string | null = null;
    let refreshed = false;
    if (def !== null) {
        const fresh = Object.prototype.hasOwnProperty.call(reg.bySector, def.sector)
            ? (reg.bySector[def.sector] as number)
            : null;
        refreshed = fresh !== null && fresh !== def.discountRate;
        baseRate = fresh !== null ? fresh : def.discountRate;
        source = refreshed ? reg.source : def.source;
    }

    const rate = manual !== null ? manual : baseRate;
    // Taxa digitada pelo usuário NÃO herda a citação do preset: aquele número é
    // dele, e atribuí-lo à fonte seria falsear a rastreabilidade. Sem taxa,
    // também não há fonte a exibir.
    const rateSource = manual === null && baseRate !== null ? source : null;
    return Object.freeze({
        sector: def === null ? null : def.sector,
        preset: def,
        discountRate: rate,
        source: rateSource,
        requestedSector,
        requestedRate,
        unknownSector: requestedSector !== null && def === null,
        custom: manual !== null,
        clamped: manual !== null && manual !== requestedRate,
        refreshed,
        version: reg.version,
    });
}
