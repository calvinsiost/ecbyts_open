// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   FISCAL CALENDAR — pure-logic (CFG-20, TEMA F).

   SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md
     - §2.4 CFG-20 — "Período fiscal configurável (hoje jan–dez fixo). Permite
       início de ano fiscal selecionável (ex.: jul–jun, usado por mineradora
       australiana). Default = jan–dez. Testável: período=jul–jun → buckets
       anuais deslocam corretamente."
     - §2.4.0 guard-rail #1 (opções curadas) e #5 (fonte citável).

   ─── O buraco real que o item fecha ───

   Verificado no código antes de escrever: `_scenarioCapexOpexPure.ts` montava a
   janela do ledger como `${ano}-01-01` … `${ano}-12-31`, literalmente. Um
   exercício jul–jun era INEXPRIMÍVEL: os custos de uma mineradora australiana
   caíam em baldes de janeiro a dezembro que não são o exercício dela.

   ─── O ponto perigoso: o RÓTULO do ano fiscal não é universal ───

   Este é o detalhe que faz a diferença entre um módulo correto e um que erra por
   12 meses inteiros. "FY2026" NÃO quer dizer a mesma coisa em toda parte:

     Austrália  FY2026 = 01/07/2025 → 30/06/2026   (rotulado pelo ano do FIM)
     EUA (fed.) FY2026 = 01/10/2025 → 30/09/2026   (rotulado pelo ano do FIM)
     Reino Unido / Índia / Japão
                FY2026 = 01/04/2026 → 31/03/2027   (rotulado pelo ano do INÍCIO)

   Escolher UMA convenção em silêncio deslocaria o exercício inteiro em um ano
   para metade das jurisdições — e o erro seria invisível, porque o total
   continuaria "fechando". Por isso `yearLabel` é PARÂMETRO EXPLÍCITO, declarado
   por calendário curado junto com a sua fonte, em vez de adivinhado.

   Com `startMonth = 1` as duas convenções coincidem (o exercício é o próprio ano
   civil), e é por isso que o default reproduz o comportamento de hoje byte a
   byte, qualquer que seja o `yearLabel`.

   ─── Mês fora de 1..12 é REJEITADO, não clampado ───

   As faixas de POLÍTICA do Tema E (declínio, inflação) se clampam. Mês não é
   política: 13 não é "dezembro com folga", é entrada sem sentido. Clampar daria
   dezembro — uma resposta concreta e errada. Aqui o inválido cai no default COM
   a rejeição visível (`rejected`), que é a resposta honesta.

   ZERO DOM, ZERO IO, determinístico. Objetos retornados congelados.
   ================================================================ */

/** Convenção de rotulagem do ano fiscal (ver cabeçalho — não é universal). */
export type FiscalYearLabel = 'start' | 'end';

/** Mês de início do exercício: 1 = janeiro (default, ano civil). */
export const DEFAULT_FISCAL_START_MONTH = 1;

/** Convenção default: o rótulo é o ano de INÍCIO do exercício. */
export const DEFAULT_FISCAL_YEAR_LABEL: FiscalYearLabel = 'start';

/** Versão do catálogo curado de calendários — trilha de auditoria (N9). */
export const FISCAL_CALENDAR_CATALOG_VERSION = 1;

/** Pedido de calendário fiscal (CFG-20). */
export interface FiscalCalendarSpec {
    /** Mês de início do exercício, 1..12. Default 1 (jan–dez). */
    readonly startMonth?: number | undefined;
    /**
     * O rótulo "FY N" designa o ano de INÍCIO ou o de FIM do exercício.
     * Irrelevante quando `startMonth` é 1 (os dois coincidem).
     */
    readonly yearLabel?: FiscalYearLabel | undefined;
}

/** Calendário fiscal resolvido — o que valeu e o que foi recusado. */
export interface ResolvedFiscalCalendar {
    /** Mês de início em vigor (1..12). */
    readonly startMonth: number;
    /** Convenção de rótulo em vigor. */
    readonly yearLabel: FiscalYearLabel;
    /** `true` quando o exercício é o ano civil (jan–dez) — o caminho de hoje. */
    readonly isCalendarYear: boolean;
    /** Mês pedido; `null` quando não pediu (auditoria). */
    readonly requestedStartMonth: number | null;
    /** Convenção pedida; `null` quando não pediu (auditoria). */
    readonly requestedYearLabel: string | null;
    /**
     * `true` quando algo pedido foi RECUSADO por sair do domínio (mês fora de
     * 1..12, rótulo desconhecido). O default entra no lugar, mas visivelmente.
     */
    readonly rejected: boolean;
    /** Versão do catálogo curado que resolveu (N9). */
    readonly catalogVersion: number;
}

/** Janela inclusiva de datas ISO-8601 de um exercício. */
export interface FiscalPeriod {
    /** Primeiro dia do exercício, `YYYY-MM-DD`. */
    readonly start: string;
    /** Último dia do exercício, `YYYY-MM-DD` (inclusive). */
    readonly end: string;
}

function isInt(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v) && Math.floor(v) === v;
}

/** Último dia do mês (1..12) — via UTC, então ano bissexto sai certo. */
function lastDayOfMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad2(n: number): string {
    return n < 10 ? `0${n}` : `${n}`;
}

/**
 * Resolve o calendário fiscal do cenário (CFG-20).
 *
 * Mês fora de 1..12 (ou não-inteiro) e rótulo desconhecido são RECUSADOS para o
 * default, com `rejected` visível — nunca ajustados para dentro de um limite
 * (ver cabeçalho). Sem pedido nenhum resolve para jan–dez, que reproduz o
 * comportamento pré-CFG-20 exatamente (guard-rail §2.4.0 #2).
 *
 * @param spec - Mês de início e convenção de rótulo pedidos.
 * @returns {@link ResolvedFiscalCalendar} congelada; nunca lança.
 */
export function resolveFiscalCalendar(spec?: FiscalCalendarSpec | null): ResolvedFiscalCalendar {
    const rawMonth = spec?.startMonth;
    const requestedStartMonth = typeof rawMonth === 'number' ? rawMonth : null;
    const monthOk = isInt(rawMonth) && rawMonth >= 1 && rawMonth <= 12;
    const startMonth = monthOk ? (rawMonth as number) : DEFAULT_FISCAL_START_MONTH;

    const rawLabel = spec?.yearLabel;
    const requestedYearLabel = typeof rawLabel === 'string' ? rawLabel : null;
    const labelOk = rawLabel === 'start' || rawLabel === 'end';
    const yearLabel = labelOk ? (rawLabel as FiscalYearLabel) : DEFAULT_FISCAL_YEAR_LABEL;

    const rejected =
        (requestedStartMonth !== null && !monthOk) || (requestedYearLabel !== null && !labelOk);

    return Object.freeze({
        startMonth,
        yearLabel,
        isCalendarYear: startMonth === DEFAULT_FISCAL_START_MONTH,
        requestedStartMonth,
        requestedYearLabel,
        rejected,
        catalogVersion: FISCAL_CALENDAR_CATALOG_VERSION,
    });
}

/**
 * A janela de datas do exercício rotulado `fiscalYear`, sob um calendário.
 *
 * Com `startMonth = 1` devolve `${y}-01-01` … `${y}-12-31` — exatamente as
 * strings que o trilho montava à mão antes do CFG-20 (zero regressão), e as duas
 * convenções de rótulo coincidem.
 *
 * @param fiscalYear - O ano que ROTULA o exercício (ver cabeçalho: não é sempre
 *   o ano em que ele começa).
 * @param calendar - Calendário já resolvido por {@link resolveFiscalCalendar}.
 * @returns {@link FiscalPeriod} congelada, com `start`/`end` inclusivos.
 */
export function fiscalYearPeriod(
    fiscalYear: number,
    calendar: ResolvedFiscalCalendar,
): FiscalPeriod {
    const y = Math.floor(fiscalYear);
    const m = calendar.startMonth;
    if (m === 1) {
        return Object.freeze({ start: `${y}-01-01`, end: `${y}-12-31` });
    }
    // Ano em que o exercício COMEÇA — depende da convenção de rótulo.
    const startYear = calendar.yearLabel === 'start' ? y : y - 1;
    const endYear = startYear + 1;
    const endMonth = m - 1; // fecha no mês anterior ao de início, 12 meses depois
    return Object.freeze({
        start: `${startYear}-${pad2(m)}-01`,
        end: `${endYear}-${pad2(endMonth)}-${pad2(lastDayOfMonth(endYear, endMonth))}`,
    });
}

/**
 * A que exercício pertence uma data ISO — o "deslocamento dos buckets" do item.
 *
 * @param isoDate - Data `YYYY-MM-DD` (ou prefixo compatível).
 * @param calendar - Calendário já resolvido.
 * @returns O ano que ROTULA o exercício dessa data, ou `null` se a data é
 *   ilegível (N3 — não chuta um exercício para uma data que não existe).
 */
export function fiscalYearOf(isoDate: string, calendar: ResolvedFiscalCalendar): number | null {
    if (typeof isoDate !== 'string') return null;
    const match = /^(\d{4})-(\d{2})/.exec(isoDate.trim());
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (!Number.isFinite(year) || month < 1 || month > 12) return null;
    const m = calendar.startMonth;
    if (m === 1) return year;
    if (calendar.yearLabel === 'start') return month >= m ? year : year - 1;
    return month >= m ? year + 1 : year;
}

/**
 * A menor janela que cobre TODOS os exercícios dados — e também as datas âncora
 * que o chamador precisa ver dentro dela.
 *
 * As âncoras existem por uma razão medida, não por precaução vaga: o adaptador
 * de custos do ERP carimba cada lançamento em `${fiscalYear}-12-31`. Num
 * calendário rotulado pelo FIM (Austrália, jul–jun), o exercício FY2026 termina
 * em 30/06/2026 e esse carimbo cai FORA dele — e `buildLedger` descartaria o
 * lançamento em silêncio, zerando um custo que existe. Unir as âncoras à janela
 * é o que impede essa perda muda.
 *
 * @param fiscalYears - Anos que rotulam os exercícios a cobrir.
 * @param calendar - Calendário já resolvido.
 * @param anchors - Datas ISO que a janela DEVE conter (ex.: os carimbos do ERP).
 * @returns {@link FiscalPeriod} congelada cobrindo tudo; `null` se não há ano.
 */
export function fiscalSpanCovering(
    fiscalYears: readonly number[],
    calendar: ResolvedFiscalCalendar,
    anchors: readonly string[] = [],
): FiscalPeriod | null {
    const years = fiscalYears.filter((y) => Number.isFinite(y));
    if (years.length === 0) return null;
    let start: string | null = null;
    let end: string | null = null;
    for (const y of years) {
        const p = fiscalYearPeriod(y, calendar);
        if (start === null || p.start < start) start = p.start;
        if (end === null || p.end > end) end = p.end;
    }
    for (const a of anchors) {
        if (typeof a !== 'string' || a.length === 0) continue;
        if (start === null || a < start) start = a;
        if (end === null || a > end) end = a;
    }
    return Object.freeze({ start: start as string, end: end as string });
}

// ───────────────── Ano fiscal de FALLBACK (CFG-21) ─────────────────

/**
 * O ano fiscal a usar quando um dado NÃO declara o seu (CFG-21).
 *
 * `year === null` é o estado que dá nome ao item: sem fallback declarado, NÃO
 * existe ano — e quem consome deve responder `semDado`, não escolher um.
 */
export interface ResolvedFallbackFiscalYear {
    /** O ano declarado, ou `null` = não há fallback (N3 — o item). */
    readonly year: number | null;
    /** `true` quando o chamador declarou um ano utilizável. */
    readonly declared: boolean;
    /** Ano pedido; `null` quando não pediu (auditoria). */
    readonly requested: number | null;
    /** `true` quando um ano FOI pedido e saiu do domínio (auditoria). */
    readonly rejected: boolean;
}

/**
 * Resolve o ano fiscal de fallback (CFG-21).
 *
 * ─── Por que `null` e não "o ano corrente" ───
 *
 * A spec sugeria "passa a ser o ano corrente". Este módulo é declaradamente
 * ZERO IO e determinístico: um `new Date().getFullYear()` aqui dentro faria a
 * MESMA entrada produzir resultados diferentes em 31/12 e 01/01, e quebraria
 * toda a reprodutibilidade em que os testes de zero-regressão se apoiam. Pior:
 * um custo sem ano passaria a ser carimbado com um ano que ninguém declarou —
 * a mesma fabricação do 2026 cravado, só que móvel e mais difícil de flagrar.
 *
 * O ano corrente continua disponível, e melhor: quem está na borda impura passa
 * `resolveFallbackFiscalYear(new Date().getFullYear())`. Aí a premissa é DELE,
 * explícita e auditável — que é exatamente o que o N3 pede.
 *
 * Domínio: inteiro finito e positivo. Fora dele é RECUSADO (não clampado): um
 * ano não tem "faixa razoável" a que se ajustar, e ajustar 0 para 1 daria uma
 * data concreta e absurda.
 *
 * @param value - Ano de fallback declarado pelo chamador.
 * @returns {@link ResolvedFallbackFiscalYear} congelada; `year: null` = semDado.
 */
export function resolveFallbackFiscalYear(value?: number | null): ResolvedFallbackFiscalYear {
    const requested = typeof value === 'number' ? value : null;
    const ok = isInt(value) && (value as number) > 0;
    return Object.freeze({
        year: ok ? (value as number) : null,
        declared: ok,
        requested,
        rejected: requested !== null && !ok,
    });
}

/** Um calendário fiscal curado de uma jurisdição, com procedência. */
export interface CuratedFiscalCalendar {
    /** Id estável do preset. */
    readonly id: string;
    /** Rótulo humano (ex.: 'Austrália — jul–jun'). */
    readonly label: string;
    readonly startMonth: number;
    readonly yearLabel: FiscalYearLabel;
    /** Fonte citável da regra (guard-rail §2.4.0 #5). Nunca ''. */
    readonly source: string;
}

/**
 * Calendários fiscais curados. A seleção segue o DOMÍNIO da feature (mineração
 * com operação internacional) e a própria spec, que cita a mineradora
 * australiana como caso. Cada um traz a sua convenção de rótulo declarada,
 * porque ela varia por jurisdição (ver cabeçalho). Congelado.
 */
export const CURATED_FISCAL_CALENDARS: readonly CuratedFiscalCalendar[] = Object.freeze([
    Object.freeze({
        id: 'BR',
        label: 'Brasil — jan–dez (ano civil)',
        startMonth: 1,
        yearLabel: 'start' as FiscalYearLabel,
        source:
            'Lei nº 6.404/1976, Art. 175 — o exercício social tem duração de 1 (um) ano; ' +
            'a prática brasileira o faz coincidir com o ano civil — ' +
            'https://www.planalto.gov.br/ccivil_03/leis/l6404consol.htm',
    }),
    Object.freeze({
        id: 'AU',
        label: 'Austrália — jul–jun',
        startMonth: 7,
        yearLabel: 'end' as FiscalYearLabel,
        source:
            'Australian Taxation Office — o "income year" vai de 1 de julho a 30 de junho e ' +
            'é designado pelo ano do seu TÉRMINO (FY2026 = 01/07/2025–30/06/2026) — ' +
            'https://www.ato.gov.au/',
    }),
    Object.freeze({
        id: 'UK',
        label: 'Reino Unido — abr–mar',
        startMonth: 4,
        yearLabel: 'start' as FiscalYearLabel,
        source:
            'HM Government — o financial year do setor público/corporate britânico vai de ' +
            '1 de abril a 31 de março — https://www.gov.uk/ · ATENÇÃO: o ano fiscal PESSOAL ' +
            'do Reino Unido é 6 de abril–5 de abril e NÃO é este calendário.',
    }),
    Object.freeze({
        id: 'IN',
        label: 'Índia — abr–mar',
        startMonth: 4,
        yearLabel: 'start' as FiscalYearLabel,
        source:
            'Government of India — o financial year vai de 1 de abril a 31 de março ' +
            '(FY 2026-27 começa em 01/04/2026) — https://www.indiabudget.gov.in/',
    }),
    Object.freeze({
        id: 'JP',
        label: 'Japão — abr–mar',
        startMonth: 4,
        yearLabel: 'start' as FiscalYearLabel,
        source:
            'Ministry of Finance Japan — o fiscal year vai de 1 de abril a 31 de março — ' +
            'https://www.mof.go.jp/english/',
    }),
    Object.freeze({
        id: 'US-FED',
        label: 'EUA (federal) — out–set',
        startMonth: 10,
        yearLabel: 'end' as FiscalYearLabel,
        source:
            'U.S. Government — o federal fiscal year vai de 1 de outubro a 30 de setembro e ' +
            'é designado pelo ano do seu TÉRMINO (FY2026 = 01/10/2025–30/09/2026) — ' +
            'https://www.gao.gov/ · NOTA: empresas nos EUA escolhem o próprio exercício; ' +
            'este preset é o federal, não uma regra corporativa.',
    }),
]);

/**
 * Resolve um preset curado pelo id (ex.: `'AU'`), já com a sua convenção.
 *
 * @param id - Id do preset; qualquer caixa.
 * @returns O calendário resolvido do preset, ou `null` se o id não é curado
 *   (N8 — o chamador decide o que fazer, este módulo não inventa jurisdição).
 */
export function resolveCuratedFiscalCalendar(id?: string | null): ResolvedFiscalCalendar | null {
    if (typeof id !== 'string') return null;
    const key = id.trim().toUpperCase();
    const found = CURATED_FISCAL_CALENDARS.find((c) => c.id === key);
    if (!found) return null;
    return resolveFiscalCalendar({ startMonth: found.startMonth, yearLabel: found.yearLabel });
}
