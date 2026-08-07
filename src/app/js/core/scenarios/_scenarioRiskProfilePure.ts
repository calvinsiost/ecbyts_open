// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   SCENARIO RISK PROFILE / TMA POR STAKEHOLDER — pure-logic (CFG-16, TEMA E).

   SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md
     - §2.4 CFG-16 — "Perfil de risco / TMA por stakeholder (investidor 12%,
       regulador 8%). A taxa de desconto vira PRESET POR PERFIL (investidor,
       regulador, social), ALÉM do valor manual. Default = projeto. Testável:
       perfil 'regulador' aplica 8%; 'investidor' aplica 12%, ambos rastreáveis."
     - §5.2 (c) — taxa social/ambiental MENOR que a financeira; a taxa é
       parâmetro configurável, "NUNCA hardcoded como constante imutável".
     - §2.4.0 #1 — faixa validada da taxa de desconto: 0–25%.

   O QUE FALTAVA (verificado no código antes de escrever): a taxa JÁ era
   parâmetro (`ScenarioNpvConfig.discountRate`, default 0.08) — a auditoria da
   spec registra isso como uma das "3 correções de fato". O que não existia era o
   PORQUÊ: um número solto no campo, sem dizer de QUEM é aquela exigência de
   retorno. E o veredito ΔNPV usa UMA taxa, enquanto a mesma obra é avaliada por
   stakeholders que exigem retornos diferentes — o investidor privado não aceita
   o custo de capital que um regulador considera adequado, e nenhum dos dois é
   "o certo": são perguntas diferentes sobre o mesmo fluxo.

   Este módulo dá NOME e FONTE a essa escolha. Cada perfil é um preset curado
   {chave, taxa, taxa ambiental, fonte}, e o resultado carrega qual perfil foi
   aplicado — a rastreabilidade que o critério testável do item pede.

   ─── Procedência dos números (declarada, sem fingir norma que não existe) ───

   Há DUAS origens, e elas não se confundem:

   (a) ÂNCORA EXTERNA — 3,5%/ano é a Social Time Preference Rate do HM Treasury
       Green Book, a taxa de avaliação de projeto público mais citada do mundo, e
       é o que fundamenta os perfis `regulador` (no eixo ambiental) e `social`.
   (b) CURADORIA DO PROJETO — 8% (projeto/regulador) e 12% (investidor) são os
       valores da própria §2.4 CFG-16, coerentes com o default histórico do motor
       (8% = referência Tier-2 BR de mineração, já em `_scenarioNpvPure.ts`).
       São curadoria versionada, NÃO citação de norma externa, e o campo `source`
       diz exatamente isso em vez de vestir um número do projeto com a etiqueta
       de um organismo internacional.

   Essa separação é o ponto do guard-rail §2.4.0 #5 levado a sério: fonte citável
   quando existe, procedência honesta quando a fonte é a própria curadoria.

   ─── `projeto` e `regulador` compartilham 8%, e isso é intencional ───

   Não é duplicação por descuido: são JUSTIFICATIVAS diferentes para o mesmo
   número (o default histórico do motor vs. a taxa que a spec atribui ao
   regulador). Ficam separados porque podem divergir numa revisão de curadoria
   sem que a mudança de um arraste o outro. O que os distingue hoje é o eixo
   ambiental: o regulador aplica a taxa social do Green Book ao ΔECBT; o perfil
   `projeto` mantém uma taxa só, exatamente como o motor sempre fez.

   ─── Faixa validada 0–25% (guard-rail §2.4.0 #1, literal) ───

   Piso 0: taxa negativa inverteria a preferência temporal (o futuro valeria mais
   que o presente) — é outra pergunta, não um ajuste desta. Teto 25%: acima disso
   o horizonte longo é anulado (a 25%/ano o ano 15 vale ~3% do ano 0) e o número
   deixa de ser taxa de atratividade para virar rejeição do projeto. Fora da
   faixa é CLAMPADO, visivelmente.

   ESCOPO DO CLAMP — e por que ele NÃO retroage: a faixa vale para o que ESTE
   módulo resolve (preset + ajuste manual sobre ele). O campo `discountRate` que
   `_scenarioNpvPure.ts` já aceitava continua com a validação que sempre teve
   (> −1): apertá-la agora mudaria o resultado de quem hoje passa 0.30, o que
   seria regressão silenciosa disfarçada de validação. Ampliar aquela guarda é
   decisão à parte, não efeito colateral deste item.

   ZERO DOM, ZERO IO, determinístico. Objetos retornados congelados.
   ================================================================ */

// ───────────────────────────── Faixa validada ─────────────────────────────

/** Piso da taxa de desconto: 0 (§2.4.0 #1). Negativa é outra pergunta. */
export const MIN_DISCOUNT_RATE = 0;

/** Teto da taxa de desconto: 25%/ano (§2.4.0 #1). */
export const MAX_DISCOUNT_RATE = 0.25;

/**
 * Traz uma taxa para dentro da faixa validada 0–25% (§2.4.0 #1).
 *
 * Compartilhado com o catálogo setorial (CFG-17): "a faixa de uma taxa de
 * desconto" é uma decisão só, e ela mora aqui — dois clamps independentes
 * poderiam divergir numa revisão e ninguém notaria.
 *
 * @param rate - Taxa pedida (fração/ano).
 * @returns A taxa dentro de [0, 0.25]; valor não-finito devolve `null` (N3).
 */
export function clampDiscountRate(rate: number | null | undefined): number | null {
    if (typeof rate !== 'number' || !Number.isFinite(rate)) return null;
    return Math.min(MAX_DISCOUNT_RATE, Math.max(MIN_DISCOUNT_RATE, rate));
}

// ───────────────────────────── Catálogo curado ─────────────────────────────

/** Um perfil de risco curado — a TMA de um stakeholder, com procedência. */
export interface RiskProfileDef {
    /** Chave estável do perfil (ex.: 'investidor'). */
    readonly key: string;
    /** Chave i18n do rótulo (convenção de catálogo curado do repo). */
    readonly nameKey: string;
    /** TMA do perfil (fração/ano) — a taxa do eixo financeiro. */
    readonly discountRate: number;
    /**
     * Taxa do eixo AMBIENTAL (ΔECBT) do perfil, quando o perfil distingue as
     * duas (§5.2 c). `null` = o perfil usa uma taxa só, como o motor sempre fez.
     */
    readonly environmentalDiscountRate: number | null;
    /** Procedência do número — âncora externa ou curadoria do projeto. Nunca ''. */
    readonly source: string;
}

const GREEN_BOOK =
    'HM Treasury, The Green Book — Social Time Preference Rate 3,5%/ano (avaliação de projeto público)';
const SPEC_CURADORIA =
    'Curadoria do projeto, versionada — SPEC_SCENARIOS_PROCESS_IMPACT.md §2.4 CFG-16 (8% = referência Tier-2 BR de mineração, o default histórico do motor)';

function profile(
    key: string,
    discountRate: number,
    environmentalDiscountRate: number | null,
    source: string,
): RiskProfileDef {
    return Object.freeze({
        key,
        nameKey: `scenarioRiskProfile.${key}`,
        discountRate,
        environmentalDiscountRate,
        source,
    });
}

/**
 * Perfis de risco curados (N8: o usuário ESCOLHE, e pode ajustar dentro da
 * faixa — nunca parte de uma folha em branco). Congelado.
 */
export const CURATED_RISK_PROFILES: Readonly<Record<string, RiskProfileDef>> = Object.freeze({
    // O default histórico do motor, com uma taxa só nos dois eixos.
    projeto: profile('projeto', 0.08, null, SPEC_CURADORIA),
    // Investidor privado: exige prêmio de risco sobre o custo de capital.
    investidor: profile('investidor', 0.12, null, SPEC_CURADORIA),
    // Regulador: mesma taxa financeira do projeto, mas o eixo AMBIENTAL desconta
    // à taxa social — é a assimetria que a §5.2 (c) descreve.
    regulador: profile('regulador', 0.08, 0.035, `${SPEC_CURADORIA} ; eixo ambiental: ${GREEN_BOOK}`),
    // Avaliação social/pública: taxa social nos DOIS eixos (Green Book).
    social: profile('social', 0.035, 0.035, GREEN_BOOK),
});

/** Versão do catálogo curado — trilha de auditoria da curadoria (N9). */
export const RISK_PROFILE_CATALOG_VERSION = 1;

/** Perfil default: `projeto` — reproduz o comportamento de hoje (§2.4.0 #2). */
export const DEFAULT_RISK_PROFILE_KEY = 'projeto';

/**
 * Resolve uma chave para o perfil curado correspondente.
 *
 * @param key - Chave do perfil pedida pelo chamador.
 * @returns O {@link RiskProfileDef}, ou `null` se a chave não é do catálogo (N8).
 */
export function resolveRiskProfileDef(key?: string | null): RiskProfileDef | null {
    if (typeof key !== 'string') return null;
    const k = key.trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(CURATED_RISK_PROFILES, k)
        ? (CURATED_RISK_PROFILES[k] as RiskProfileDef)
        : null;
}

// ───────────────────────────── Tipos ─────────────────────────────

/** Pedido de perfil de risco (preset + ajuste manual dentro da faixa). */
export interface RiskProfileSpec {
    /** Chave do perfil curado (ex.: 'investidor'). Ausente/desconhecida = default. */
    readonly profile?: string | undefined;
    /**
     * Ajuste MANUAL da taxa (o "além do valor manual" do item), dentro da faixa
     * validada. Vence a taxa do preset — quem digitou um número quis aquele
     * número; o perfil escolhido continua registrado.
     */
    readonly discountRate?: number | undefined;
    /** Ajuste manual da taxa do eixo ambiental, mesma regra. */
    readonly environmentalDiscountRate?: number | undefined;
}

/** Perfil resolvido — a TMA aplicada e de onde ela veio (rastreável, o item). */
export interface ResolvedRiskProfile {
    /** Chave do perfil aplicado (o default quando não se pediu um válido). */
    readonly key: string;
    /** O preset curado por trás da chave (com a `source` citável). */
    readonly profile: RiskProfileDef;
    /** TMA efetivamente aplicada (preset, ou o ajuste manual, já na faixa). */
    readonly discountRate: number;
    /** Taxa ambiental aplicada; `null` = usar a mesma taxa financeira. */
    readonly environmentalDiscountRate: number | null;
    /** Chave pedida pelo chamador; `null` quando não pediu (auditoria). */
    readonly requestedKey: string | null;
    /** Taxa manual pedida; `null` quando não pediu (auditoria). */
    readonly requestedRate: number | null;
    /** `true` quando a chave pedida não está no catálogo (N8 visível). */
    readonly unknownProfile: boolean;
    /** `true` quando um ajuste manual venceu a taxa do preset. */
    readonly custom: boolean;
    /** `true` quando um ajuste manual foi trazido para dentro da faixa. */
    readonly clamped: boolean;
}

// ───────────────────────────── Resolução ─────────────────────────────

/**
 * Resolve o perfil de risco / TMA do cenário (CFG-16).
 *
 * Ordem: ajuste MANUAL (dentro da faixa) > taxa do PRESET > default `projeto`.
 * Perfil desconhecido cai no default com `unknownProfile:true` — nunca inventa
 * um perfil, e nunca falha em silêncio.
 *
 * @param spec - Perfil escolhido e/ou ajuste manual da taxa.
 * @returns {@link ResolvedRiskProfile} congelado, com procedência e ajustes visíveis.
 */
export function resolveRiskProfile(spec?: RiskProfileSpec | undefined): ResolvedRiskProfile {
    const requestedKey = typeof spec?.profile === 'string' ? spec.profile : null;
    const def = resolveRiskProfileDef(spec?.profile);
    const applied = def ?? (CURATED_RISK_PROFILES[DEFAULT_RISK_PROFILE_KEY] as RiskProfileDef);

    const requestedRate = typeof spec?.discountRate === 'number' ? spec.discountRate : null;
    const manual = clampDiscountRate(spec?.discountRate);
    const manualEnv = clampDiscountRate(spec?.environmentalDiscountRate);

    return Object.freeze({
        key: applied.key,
        profile: applied,
        discountRate: manual !== null ? manual : applied.discountRate,
        environmentalDiscountRate: manualEnv !== null ? manualEnv : applied.environmentalDiscountRate,
        requestedKey,
        requestedRate,
        unknownProfile: requestedKey !== null && def === null,
        custom: manual !== null || manualEnv !== null,
        clamped:
            (manual !== null && manual !== requestedRate) ||
            (manualEnv !== null && manualEnv !== spec?.environmentalDiscountRate),
    });
}
