// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   IMPACT TYPE CATALOG — pure-logic (CFG-25, TEMA G).

   SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md
     - §2.4.8 CFG-25 — "Tipos de impacto ampliáveis (hoje 6: água,
       waterStress, rejeito, emissões, energia, empregos). Catálogo curado
       ganha poluentes atmosféricos e efluentes líquidos distintos.
       Data-driven, como subtypes. Testável: `kind` aceita
       `airPollutant`/`effluent` e o delta os contabiliza."
     - §2.4.1 (N9) — o usuário ESCOLHE do catálogo curado; a curadoria
       (registro de um tipo novo) é do admin, versionada.

   O QUE ESTE MÓDULO RESOLVE: os 6 tipos de impacto eram uma UNION FECHADA
   em `_scenarioImpactEnginePure.ts` (`kind: 'water' | 'waterStress' | ...`)
   despachada por um `switch` com goal/indicador/direção cravados em cada
   `case`. Um 7º tipo exigia editar o motor e recompilar. Aqui o catálogo
   vira DADO: cada tipo é uma RECEITA `{ measurer, goal, indicator, direction,
   attributeKey, unit, nameKey, source }` que o motor lê em vez de decidir.
   Registrar um tipo novo é passar uma definição validada — o motor não muda.

   ─── O que é dado e o que continua curado (fronteira N9) ───
   O ALGORITMO de medição (a família `measurer`) continua em código: o dado
   ESCOLHE entre famílias existentes (`waterQuality`, `waterStress`, `land`,
   `ratio`) e parametriza goal/indicador/direção/unidade. Ninguém injeta
   metodologia nova por config — o usuário final nunca reescreve o método
   (N9/N8), e um tipo registrado sem fonte citável é REJEITADO.

   Zero duplicação (N4): as receitas canônicas aqui são exatamente as que o
   `switch` do motor aplicava; o motor passou a LER daqui em vez de repetir.
   `_scenarioPhysicalFactorsPure.ts` também deriva daqui o vocabulário de
   `data.physical` (`attributeKey`), que antes era um segundo mapa paralelo.

   Robustez (N3/N8): definição inválida (forma errada, id colidindo com o
   canônico, goal fora de 1..17, código de indicador incoerente com o goal,
   família desconhecida, sem fonte) é REJEITADA com motivo e NÃO entra no
   catálogo — nunca um tipo pela metade. O canônico é IMUTÁVEL: dado jamais
   sobrescreve um tipo curado.

   ZERO DOM, ZERO IO, determinístico. Todos os retornos são congelados.
   ================================================================ */

// ───────────────────────────── Tipos ─────────────────────────────

/**
 * Famílias de MEDIÇÃO disponíveis — o algoritmo, que vive em código e é
 * escolhido (nunca inventado) pelo dado:
 *
 *  - `waterQuality`  → `measureOds6Water` (carga de efluente contra um VI).
 *  - `waterStress`   → `measureOds6WaterStress` (retirada ÷ recurso renovável).
 *  - `land`          → `measureOds15Land` (razão de área degradada).
 *  - `ratio`         → `measureGenericOds` (sub-indicador fluxo ÷ referência,
 *                       com `direction` dizendo se maior é melhor ou pior).
 */
export type ImpactMeasurerFamily = 'waterQuality' | 'waterStress' | 'land' | 'ratio';

/**
 * De onde sai o CÓDIGO do indicador oficial exposto pelo motor:
 *  - `literal`  → o código declarado na definição, tal e qual.
 *  - `registry` → o `officialIndicator` do registro de ODS para aquele goal,
 *                 caindo no código declarado quando o registro não o traz.
 * Os tipos canônicos preservam exatamente a escolha que o `switch` fazia por
 * `case` (por isso o campo existe: é descrição do que já acontece, não opção nova).
 */
export type ImpactIndicatorResolution = 'literal' | 'registry';

/** Leitura qualitativa do fluxo físico; `null` = a família fixa a leitura. */
export type ImpactFlowDirection = 'lower' | 'higher' | null;

/** Receita completa de UM tipo de impacto (o que o motor lê por rota). */
export interface ImpactTypeDefinition {
    /** Id estável usado em `ProcessCharacteristic.kind` (ex.: 'water'). */
    readonly id: string;
    /** Família de medição (algoritmo curado que o dado escolhe). */
    readonly measurer: ImpactMeasurerFamily;
    /** Objetivo de Desenvolvimento Sustentável afetado (1..17). */
    readonly goal: number;
    /** Código oficial do indicador (ex.: '6.4.2'), coerente com `goal`. */
    readonly indicator: string;
    /** Como resolver o código exposto (ver {@link ImpactIndicatorResolution}). */
    readonly indicatorResolution: ImpactIndicatorResolution;
    /**
     * Direção da leitura do fluxo, consumida pela família `ratio`
     * (`lower` = mais fluxo é pior). `null` nas famílias que já fixam a
     * leitura internamente (`waterQuality`, `waterStress`, `land`).
     */
    readonly direction: ImpactFlowDirection;
    /**
     * Chave do vocabulário de `data.physical` no elemento real (CFG-02) de
     * onde sai o fator por unidade — ex.: 'waterIntensity'. A referência do
     * medidor é lida em `${attributeKey}Reference`.
     */
    readonly attributeKey: string;
    /** Unidade física do fator (ex.: 'm3/unidade'), para rótulo e auditoria. */
    readonly unit: string;
    /** Chave i18n do nome exibido (zero string cravada na UI). */
    readonly nameKey: string;
    /** Fonte citável do tipo — obrigatória, é a PROCEDÊNCIA do CFG-25. */
    readonly source: string;
}

/** Ids canônicos — os 6 tipos que o motor já media antes do CFG-25. */
export type CanonicalImpactTypeId =
    | 'water'
    | 'waterStress'
    | 'tailings'
    | 'emissions'
    | 'energy'
    | 'jobs';

/**
 * Id de tipo de impacto aceito por `ProcessCharacteristic.kind`. O `& {}`
 * mantém o autocompletar dos 6 canônicos SEM fechar o conjunto — é
 * exatamente isso que o CFG-25 pede (ampliável por dado).
 */
export type ImpactTypeId = CanonicalImpactTypeId | (string & {});

/** Resultado da validação de UMA definição vinda de dado/config. */
export interface ImpactTypeValidation {
    /** Id do tipo (quando extraível), para rastreabilidade. */
    readonly id: string | null;
    /** true iff a definição é válida e pode entrar no catálogo. */
    readonly valid: boolean;
    /** Motivos da rejeição (vazio quando `valid`). Mensagens legíveis. */
    readonly errors: readonly string[];
}

/** Procedência de um tipo presente no catálogo efetivo (CFG-25). */
export interface ImpactTypeProvenance {
    /** 'canonical' = curado em código (imutável); 'registered' = veio de dado. */
    readonly origin: 'canonical' | 'registered';
    /** Fonte citável declarada pelo tipo. */
    readonly source: string;
    /** Versão da curadoria que admitiu o tipo (auditoria). */
    readonly version: number;
}

/** Catálogo efetivo: canônico ∪ registrados por dado, + procedência. */
export interface EffectiveImpactTypeCatalog {
    /** Mapa id→receita (canônico + registrados válidos), congelado. */
    readonly byId: Readonly<Record<string, ImpactTypeDefinition>>;
    /** Ids na ordem: canônicos primeiro, depois registrados. */
    readonly ids: readonly string[];
    /** Ids do catálogo canônico (imutáveis). */
    readonly canonicalIds: readonly string[];
    /** Ids que entraram por dado/config (curadoria admin). */
    readonly registeredIds: readonly string[];
    /** Validações das definições rejeitadas (procedência da curadoria). */
    readonly rejected: readonly ImpactTypeValidation[];
    /** Versão da curadoria aplicada aos registrados (auditoria). */
    readonly version: number;
}

// ───────────────────── Catálogo canônico (curado) ─────────────────────

const ODS_BR = 'https://odsbrasil.gov.br/objetivo/objetivo?n=';

function canonical(
    id: CanonicalImpactTypeId,
    measurer: ImpactMeasurerFamily,
    goal: number,
    indicator: string,
    indicatorResolution: ImpactIndicatorResolution,
    direction: ImpactFlowDirection,
    attributeKey: string,
    unit: string,
): ImpactTypeDefinition {
    return Object.freeze({
        id,
        measurer,
        goal,
        indicator,
        indicatorResolution,
        direction,
        attributeKey,
        unit,
        nameKey: `scenario.impactType.${id}`,
        source: `${ODS_BR}${goal}`,
    });
}

/**
 * Os 6 tipos que o motor já media — cada campo reproduz o `case` que o
 * `switch` de `measureRouteOds` aplicava (mesma família, mesmo goal, mesmo
 * código de indicador, mesma direção). É a base IMUTÁVEL do catálogo: dado
 * nunca sobrescreve nenhum destes.
 */
export const CANONICAL_IMPACT_TYPES: Readonly<
    Record<CanonicalImpactTypeId, ImpactTypeDefinition>
> = Object.freeze({
    // Qualidade da água: carga de efluente medida contra um VI (ODS 6.3.2).
    water: canonical('water', 'waterQuality', 6, '6.3.2', 'literal', 'lower', 'waterIntensity', 'm3/unidade'),
    // Estresse hídrico: retirada ÷ recurso renovável (ODS 6.4.2).
    waterStress: canonical('waterStress', 'waterStress', 6, '6.4.2', 'literal', 'lower', 'waterIntensity', 'm3/unidade'),
    // Rejeito: razão de área/solo degradado (ODS 15.3.1).
    tailings: canonical('tailings', 'land', 15, '15.3.1', 'literal', 'lower', 'tailingsFactor', 't/unidade'),
    // Emissões de GEE: razão fluxo ÷ referência, mais é pior (ODS 13).
    emissions: canonical('emissions', 'ratio', 13, '13.2.2', 'registry', 'lower', 'emissionsIntensity', 'tCO2e/unidade'),
    // Energia: razão fluxo ÷ referência, mais é melhor na leitura do medidor (ODS 7).
    energy: canonical('energy', 'ratio', 7, '7.3.1', 'registry', 'higher', 'energyIntensity', 'MWh/unidade'),
    // Empregos: razão fluxo ÷ referência, mais é melhor (ODS 8).
    jobs: canonical('jobs', 'ratio', 8, '8.5.1', 'registry', 'higher', 'jobsPerUnit', 'postos/unidade'),
});

/**
 * Versão da curadoria canônica. Subi-la é a trilha de auditoria de qualquer
 * mudança nas receitas acima (NOT N9).
 */
export const IMPACT_TYPE_CATALOG_VERSION = 1;

/**
 * Pacote de extensão do CFG-25 entregue como DADO, não como `case` novo no
 * motor: poluentes atmosféricos e efluentes líquidos distintos (o 5º e o 4º
 * impacto do TG citados na spec). Passar este array a
 * {@link buildEffectiveImpactTypeCatalog} basta para o motor medi-los e para
 * o delta contabilizá-los — nenhuma linha do motor conhece estes ids.
 *
 * Os códigos são distintos dos canônicos de propósito: `effluent` mede o
 * esgoto tratado com segurança (6.3.1), separado da qualidade ambiental do
 * corpo d'água que `water` já mede (6.3.2); `airPollutant` mede material
 * particulado fino (11.6.2), separado do GEE que `emissions` mede.
 */
export const CFG25_IMPACT_TYPE_EXTENSION: readonly ImpactTypeDefinition[] = Object.freeze([
    Object.freeze({
        id: 'effluent',
        measurer: 'ratio' as ImpactMeasurerFamily,
        goal: 6,
        indicator: '6.3.1',
        indicatorResolution: 'literal' as ImpactIndicatorResolution,
        direction: 'lower' as ImpactFlowDirection,
        attributeKey: 'effluentIntensity',
        unit: 'm3/unidade',
        nameKey: 'scenario.impactType.effluent',
        source: `${ODS_BR}6`,
    }),
    Object.freeze({
        id: 'airPollutant',
        measurer: 'ratio' as ImpactMeasurerFamily,
        goal: 11,
        indicator: '11.6.2',
        indicatorResolution: 'literal' as ImpactIndicatorResolution,
        direction: 'lower' as ImpactFlowDirection,
        attributeKey: 'airPollutantIntensity',
        unit: 'kg/unidade',
        nameKey: 'scenario.impactType.airPollutant',
        source: `${ODS_BR}11`,
    }),
]);

// ───────────────────────────── Guardas ─────────────────────────────

const MEASURER_FAMILIES: ReadonlySet<string> = new Set<string>([
    'waterQuality',
    'waterStress',
    'land',
    'ratio',
]);

/** Código oficial de indicador: goal.target.serial, ex. '6.4.2', '1.a.2'. */
const INDICATOR_CODE = /^(\d{1,2})\.[0-9a-z]+\.\d{1,2}$/;

function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.trim().length > 0;
}

// ───────────────────────────── API pública ─────────────────────────────

/**
 * Valida UMA definição de tipo de impacto vinda de dado/config (CFG-25). Uma
 * definição válida tem: id não-vazio que NÃO colide com o canônico (imutável);
 * `measurer` entre as famílias curadas; `goal` inteiro em 1..17; `indicator`
 * no formato oficial e com o goal COERENTE com o campo `goal`; `direction`
 * declarada quando a família é `ratio`; `attributeKey`, `unit`, `nameKey`
 * (chave i18n) e `source` (fonte citável — a procedência que o CFG-25 exige).
 *
 * Não muta nada, não lê IO — apenas inspeciona a forma do dado.
 *
 * @param def - Definição candidata (unknown: vem de dado/config externo).
 * @returns Validação congelada com `valid` + `errors` legíveis + `id`.
 */
export function validateImpactTypeDefinition(def: unknown): ImpactTypeValidation {
    if (!def || typeof def !== 'object') {
        return Object.freeze({
            id: null,
            valid: false,
            errors: Object.freeze(['definição não é um objeto']) as readonly string[],
        });
    }
    const d = def as Partial<ImpactTypeDefinition>;
    const id = isNonEmptyString(d.id) ? d.id : null;
    const errors: string[] = [];

    if (!isNonEmptyString(d.id)) {
        errors.push("definição sem 'id' não-vazio");
    } else if (Object.prototype.hasOwnProperty.call(CANONICAL_IMPACT_TYPES, d.id)) {
        errors.push(`id '${d.id}' colide com um tipo canônico (imutável) — escolha um id novo`);
    }

    if (!isNonEmptyString(d.measurer) || !MEASURER_FAMILIES.has(d.measurer)) {
        errors.push(
            `'measurer' deve ser uma família curada (${Array.from(MEASURER_FAMILIES).join(', ')}) — ` +
                'o dado escolhe o algoritmo, não o define',
        );
    }

    const goalOk =
        typeof d.goal === 'number' && Number.isInteger(d.goal) && d.goal >= 1 && d.goal <= 17;
    if (!goalOk) errors.push("'goal' deve ser um ODS inteiro entre 1 e 17");

    if (!isNonEmptyString(d.indicator) || !INDICATOR_CODE.test(d.indicator)) {
        errors.push("'indicator' deve ser um código oficial no formato 'goal.target.serial' (ex.: '6.3.1')");
    } else if (goalOk && Number(d.indicator.split('.')[0]) !== d.goal) {
        errors.push(`'indicator' ${d.indicator} não pertence ao ODS ${String(d.goal)}`);
    }

    if (d.indicatorResolution !== 'literal' && d.indicatorResolution !== 'registry') {
        errors.push("'indicatorResolution' deve ser 'literal' ou 'registry'");
    }

    if (d.measurer === 'ratio') {
        if (d.direction !== 'lower' && d.direction !== 'higher') {
            errors.push("família 'ratio' exige 'direction' 'lower' ou 'higher'");
        }
    } else if (d.direction !== null && d.direction !== 'lower' && d.direction !== 'higher') {
        errors.push("'direction' deve ser 'lower', 'higher' ou null");
    }

    if (!isNonEmptyString(d.attributeKey)) {
        errors.push("definição sem 'attributeKey' (vocabulário de `data.physical` do elemento)");
    }
    if (!isNonEmptyString(d.unit)) errors.push("definição sem 'unit' (unidade física do fator)");
    if (!isNonEmptyString(d.nameKey)) {
        errors.push("definição sem chave i18n 'nameKey' (zero string cravada)");
    }
    if (!isNonEmptyString(d.source)) {
        errors.push("definição sem 'source' citável — a procedência do tipo é obrigatória (CFG-25)");
    }

    return Object.freeze({
        id,
        valid: errors.length === 0,
        errors: Object.freeze(errors) as readonly string[],
    });
}

/** Congela a receita validada antes de entrar no catálogo. */
function freezeDefinition(def: ImpactTypeDefinition): ImpactTypeDefinition {
    return Object.freeze({
        id: def.id,
        measurer: def.measurer,
        goal: def.goal,
        indicator: def.indicator,
        indicatorResolution: def.indicatorResolution,
        direction: def.direction ?? null,
        attributeKey: def.attributeKey,
        unit: def.unit,
        nameKey: def.nameKey,
        source: def.source,
    });
}

/**
 * Constrói o catálogo EFETIVO de tipos de impacto = canônico ∪ definições
 * registradas por dado/config VÁLIDAS (CFG-25). É o mecanismo de registro que
 * faltava: o admin/curador passa um array de receitas (vindo de uma tabela
 * versionada, não de código), este módulo valida cada uma e a promove — o
 * motor mede o tipo novo SEM rebuild.
 *
 * - O catálogo canônico é sempre incluído e NUNCA sobrescrito (imutável).
 * - Definições inválidas ficam em `rejected` com o motivo e não entram (N3).
 * - Ids registrados duplicados: a PRIMEIRA válida vence; as demais são
 *   rejeitadas (registro determinístico, sem clobber silencioso).
 *
 * @param registered - Receitas candidatas vindas de dado/config (default []).
 * @param options - `version` da curadoria (auditoria; default a canônica).
 * @returns Catálogo efetivo congelado com `byId`, `ids`, procedência e rejeições.
 */
export function buildEffectiveImpactTypeCatalog(
    registered: ReadonlyArray<unknown> = [],
    options: { readonly version?: number } = {},
): EffectiveImpactTypeCatalog {
    const byId: Record<string, ImpactTypeDefinition> = {};
    const canonicalIds: string[] = [];
    for (const [id, def] of Object.entries(CANONICAL_IMPACT_TYPES)) {
        byId[id] = def;
        canonicalIds.push(id);
    }

    const registeredIds: string[] = [];
    const rejected: ImpactTypeValidation[] = [];
    const list = Array.isArray(registered) ? registered : [];
    for (const def of list) {
        const validation = validateImpactTypeDefinition(def);
        if (!validation.valid || validation.id === null) {
            rejected.push(validation);
            continue;
        }
        if (Object.prototype.hasOwnProperty.call(byId, validation.id)) {
            rejected.push(
                Object.freeze({
                    id: validation.id,
                    valid: false,
                    errors: Object.freeze([
                        `id '${validation.id}' já registrado — a primeira definição válida vence`,
                    ]) as readonly string[],
                }),
            );
            continue;
        }
        byId[validation.id] = freezeDefinition(def as ImpactTypeDefinition);
        registeredIds.push(validation.id);
    }

    const version =
        typeof options.version === 'number' && Number.isFinite(options.version)
            ? options.version
            : IMPACT_TYPE_CATALOG_VERSION;

    return Object.freeze({
        byId: Object.freeze(byId),
        ids: Object.freeze([...canonicalIds, ...registeredIds]) as readonly string[],
        canonicalIds: Object.freeze(canonicalIds) as readonly string[],
        registeredIds: Object.freeze(registeredIds) as readonly string[],
        rejected: Object.freeze(rejected) as readonly ImpactTypeValidation[],
        version,
    });
}

/**
 * O catálogo com APENAS os 6 tipos canônicos — o default que reproduz, campo a
 * campo, o comportamento do motor antes do CFG-25 (zero regressão).
 */
export const DEFAULT_IMPACT_TYPE_CATALOG: EffectiveImpactTypeCatalog =
    buildEffectiveImpactTypeCatalog();

/**
 * Receita de um tipo no catálogo efetivo, ou `null` quando o id é desconhecido.
 * `null` é o "sem dado" honesto do CFG-25: o motor não inventa medição para um
 * tipo que ninguém curou (N3).
 *
 * @param catalog - Catálogo efetivo (de {@link buildEffectiveImpactTypeCatalog}).
 * @param id - Id do tipo declarado pela rota (`characteristic.kind`).
 */
export function resolveImpactType(
    catalog: EffectiveImpactTypeCatalog | null | undefined,
    id: string | null | undefined,
): ImpactTypeDefinition | null {
    if (!isNonEmptyString(id)) return null;
    const cat = catalog ?? DEFAULT_IMPACT_TYPE_CATALOG;
    return cat.byId[id] ?? null;
}

/**
 * Guard-rail N9 do lado do usuário: ele só ESCOLHE tipos que o catálogo curado
 * conhece (canônico ∪ registrado).
 */
export function isValidImpactType(
    catalog: EffectiveImpactTypeCatalog | null | undefined,
    id: string | null | undefined,
): boolean {
    return resolveImpactType(catalog, id) !== null;
}

/**
 * Procedência de um tipo do catálogo efetivo (CFG-25): se é canônico (curado em
 * código, imutável) ou registrado por dado, com a fonte citável e a versão da
 * curadoria. `null` quando o id não está no catálogo.
 *
 * @param catalog - Catálogo efetivo.
 * @param id - Id do tipo.
 */
export function impactTypeProvenance(
    catalog: EffectiveImpactTypeCatalog | null | undefined,
    id: string | null | undefined,
): ImpactTypeProvenance | null {
    const cat = catalog ?? DEFAULT_IMPACT_TYPE_CATALOG;
    const def = resolveImpactType(cat, id);
    if (!def) return null;
    const origin = cat.canonicalIds.includes(def.id) ? 'canonical' : 'registered';
    return Object.freeze({
        origin: origin as 'canonical' | 'registered',
        source: def.source,
        version: origin === 'canonical' ? IMPACT_TYPE_CATALOG_VERSION : cat.version,
    });
}

/**
 * Vocabulário de `data.physical` do catálogo: id do tipo → chave do atributo
 * do elemento (CFG-02). `_scenarioPhysicalFactorsPure.ts` consome ESTE mapa em
 * vez de manter um segundo mapa paralelo (N4).
 *
 * @param catalog - Catálogo efetivo; omitido → só os canônicos.
 */
export function impactAttributeKeys(
    catalog: EffectiveImpactTypeCatalog | null | undefined = DEFAULT_IMPACT_TYPE_CATALOG,
): Readonly<Record<string, string>> {
    const cat = catalog ?? DEFAULT_IMPACT_TYPE_CATALOG;
    const out: Record<string, string> = {};
    for (const id of cat.ids) {
        const def = cat.byId[id];
        if (def) out[id] = def.attributeKey;
    }
    return Object.freeze(out);
}
