// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   SUBTYPE REGISTRY — pure-logic (CFG-06, TEMA B).

   SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md
     - §2.4 CFG-06 — "Registrar subtipo novo sem recompilar (data-driven).
       `subtypes.ts` já é data-driven; falta o MECANISMO DE REGISTRO
       (carregar definição de subtipo de dado/config, não de código).
       Admin/curador adiciona subtipo via tabela de definição versionada;
       usuário só ESCOLHE do catálogo (guard-rail N9)."
     - §2.4.1 (N9) — o usuário escolhe do catálogo, NUNCA reescreve a
       metodologia. Este módulo é a peça de CURADORIA (admin), não de UI
       do usuário final: valida a definição de dado e a promove ao catálogo.

   O QUE FALTAVA: `subtypes.ts` expõe um catálogo CONGELADO em código
   (`PRODUCTION_SUBTYPES`). Adicionar um subtipo hoje = editar aquele
   arquivo e recompilar. Este módulo fecha o gap: recebe definições de
   subtipo vindas de DADO/CONFIG (um array versionado que o admin edita
   fora do código), VALIDA cada uma contra o schema e devolve um catálogo
   EFETIVO = canônico ∪ registrados. Um subtipo válido registrado por dado
   aparece no seletor sem rebuild (o teste do CFG-06).

   Zero duplicação (N4): o schema de subtipo é `ProductionSubtype` de
   `productionSchema.ts`; a base canônica é `PRODUCTION_SUBTYPES` de
   `subtypes.ts`. Este módulo NÃO redefine nem reconhece subtipo por conta
   própria — só valida a forma do dado e mescla.

   Robustez (N3/N8): uma definição inválida (forma errada, id colidindo com
   o catálogo canônico, sem etapas, taxa fora de faixa) é REJEITADA com
   motivo claro e NÃO entra no catálogo — nunca um subtipo pela metade nem
   um 0 forjado. O catálogo canônico é imutável (uma definição de dado nunca
   sobrescreve 'mining'/'petroleum').

   ZERO DOM, ZERO IO, determinístico. Todos os objetos retornados são
   congelados (frozen).
   ================================================================ */

import { PRODUCTION_SUBTYPES } from '../elements/families/production/subtypes.js';
import type {
    ProductionSubtype,
    ProductionCategory,
    IoPort,
} from '../elements/families/production/productionSchema.js';

// ───────────────────────────── Tipos ─────────────────────────────

/** Resultado da validação de UMA definição de subtipo vinda de dado/config. */
export interface SubtypeValidation {
    /** Id do subtipo (quando extraível), para rastreabilidade. */
    readonly id: string | null;
    /** true iff a definição é válida e pode entrar no catálogo. */
    readonly valid: boolean;
    /** Motivos da rejeição (vazio quando `valid`). Mensagens legíveis. */
    readonly errors: readonly string[];
}

/** Catálogo efetivo: canônico ∪ registrados por dado, + proveniência. */
export interface EffectiveSubtypeCatalog {
    /** Mapa id→subtipo (canônico + registrados válidos), congelado. */
    readonly byId: Readonly<Record<string, ProductionSubtype>>;
    /** Ids na ordem: canônicos primeiro (ordem de inserção), depois registrados. */
    readonly ids: readonly string[];
    /** Ids que vieram do catálogo canônico (imutáveis). */
    readonly canonicalIds: readonly string[];
    /** Ids que entraram por dado/config (curadoria admin). */
    readonly registeredIds: readonly string[];
    /** Validações das definições rejeitadas (proveniência da curadoria). */
    readonly rejected: readonly SubtypeValidation[];
}

// ───────────────────────────── Guardas ─────────────────────────────

function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.trim().length > 0;
}

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

/** Uma fração válida é finita em [0, 1] (recovery/yield — mesma faixa da mutação). */
function isValidFraction(v: unknown): v is number {
    return isFiniteNumber(v) && v >= 0 && v <= 1;
}

/** Valida uma porta de IO (id + nameKey + unit são chaves obrigatórias). */
function validatePort(port: unknown, where: string, errors: string[]): void {
    if (!port || typeof port !== 'object') {
        errors.push(`${where}: porta não é um objeto`);
        return;
    }
    const p = port as Partial<IoPort>;
    if (!isNonEmptyString(p.id)) errors.push(`${where}: porta sem 'id'`);
    if (!isNonEmptyString(p.nameKey)) errors.push(`${where}: porta '${String(p.id)}' sem chave i18n 'nameKey'`);
    if (!isNonEmptyString(p.unit)) errors.push(`${where}: porta '${String(p.id)}' sem 'unit'`);
}

/** Valida as taxas de uma etapa: throughput > 0; recovery/yield frações [0,1]. */
function validateRates(rates: unknown, where: string, errors: string[]): void {
    if (rates === undefined || rates === null) return; // taxas são opcionais por etapa (schema)
    if (typeof rates !== 'object') {
        errors.push(`${where}: 'rates' não é um objeto`);
        return;
    }
    const r = rates as { throughput?: unknown; recoveryRate?: unknown; yield?: unknown };
    if (r.throughput !== undefined) {
        const t = r.throughput as { value?: unknown; unit?: unknown };
        if (!t || typeof t !== 'object' || !isFiniteNumber(t.value) || !isNonEmptyString(t.unit)) {
            errors.push(`${where}: 'throughput' exige { value: número finito, unit: string }`);
        } else if ((t.value as number) < 0) {
            errors.push(`${where}: 'throughput.value' não pode ser negativo`);
        }
    }
    if (r.recoveryRate !== undefined && !isValidFraction(r.recoveryRate)) {
        errors.push(`${where}: 'recoveryRate' fora da faixa [0, 1]`);
    }
    if (r.yield !== undefined) {
        const y = r.yield as { value?: unknown; unit?: unknown };
        if (!y || typeof y !== 'object' || !isFiniteNumber(y.value) || !isNonEmptyString(y.unit)) {
            errors.push(`${where}: 'yield' exige { value: número finito, unit: string }`);
        }
    }
}

/** Valida UMA categoria (etapa) do subtipo. */
function validateCategory(cat: unknown, idx: number, errors: string[]): void {
    const where = `categoria[${idx}]`;
    if (!cat || typeof cat !== 'object') {
        errors.push(`${where}: não é um objeto`);
        return;
    }
    const c = cat as Partial<ProductionCategory>;
    if (!isNonEmptyString(c.id)) errors.push(`${where}: sem 'id'`);
    if (!isNonEmptyString(c.nameKey)) errors.push(`${where} '${String(c.id)}': sem chave i18n 'nameKey'`);
    if (!isFiniteNumber(c.order)) errors.push(`${where} '${String(c.id)}': 'order' deve ser número finito`);
    if (!Array.isArray(c.inputs)) errors.push(`${where} '${String(c.id)}': 'inputs' deve ser array`);
    else c.inputs.forEach((p, i) => validatePort(p, `${where} '${String(c.id)}'.inputs[${i}]`, errors));
    if (!Array.isArray(c.outputs)) errors.push(`${where} '${String(c.id)}': 'outputs' deve ser array`);
    else c.outputs.forEach((p, i) => validatePort(p, `${where} '${String(c.id)}'.outputs[${i}]`, errors));
    validateRates(c.rates, `${where} '${String(c.id)}'.rates`, errors);
}

// ───────────────────────────── API pública ─────────────────────────────

/**
 * Valida UMA definição de subtipo vinda de dado/config (CFG-06). Uma definição
 * válida tem: id não-vazio que NÃO colide com o catálogo canônico (imutável),
 * `nameKey` (chave i18n — N: zero string hardcoded), `icon`, e ≥ 1 categoria bem
 * formada (portas com id/nameKey/unit; taxas dentro das faixas físicas).
 *
 * Não muta nada, não lê IO — apenas inspeciona a forma do dado.
 *
 * @param def - Definição candidata (unknown: vem de dado/config externo).
 * @returns Validação congelada com `valid` + `errors` legíveis + `id`.
 */
export function validateSubtypeDefinition(def: unknown): SubtypeValidation {
    const errors: string[] = [];
    const id =
        def && typeof def === 'object' && isNonEmptyString((def as { id?: unknown }).id)
            ? ((def as { id: string }).id)
            : null;

    if (!def || typeof def !== 'object') {
        return Object.freeze({ id: null, valid: false, errors: Object.freeze(['definição não é um objeto']) });
    }
    const d = def as Partial<ProductionSubtype>;

    if (!isNonEmptyString(d.id)) {
        errors.push("definição sem 'id' não-vazio");
    } else if (Object.prototype.hasOwnProperty.call(PRODUCTION_SUBTYPES, d.id)) {
        // O catálogo canônico é imutável: dado NUNCA sobrescreve 'mining'/'petroleum'.
        errors.push(`id '${d.id}' colide com um subtipo canônico (imutável) — escolha um id novo`);
    }
    if (!isNonEmptyString(d.nameKey)) errors.push("definição sem chave i18n 'nameKey' (zero string hardcoded)");
    if (!isNonEmptyString(d.icon)) errors.push("definição sem 'icon'");
    if (!Array.isArray(d.categories) || d.categories.length === 0) {
        errors.push("definição precisa de ao menos uma etapa em 'categories'");
    } else {
        d.categories.forEach((cat, i) => validateCategory(cat, i, errors));
    }

    return Object.freeze({
        id,
        valid: errors.length === 0,
        errors: Object.freeze(errors) as readonly string[],
    });
}

/** Congela profundamente uma categoria validada (imutabilidade do catálogo). */
function freezeCategory(cat: ProductionCategory): ProductionCategory {
    return Object.freeze({
        ...cat,
        inputs: Object.freeze(cat.inputs.map((p) => Object.freeze({ ...p }))) as IoPort[],
        outputs: Object.freeze(cat.outputs.map((p) => Object.freeze({ ...p }))) as IoPort[],
        rates: Object.freeze({ ...cat.rates }),
    });
}

/** Congela profundamente um subtipo validado antes de entrar no catálogo. */
function freezeSubtype(def: ProductionSubtype): ProductionSubtype {
    return Object.freeze({
        ...def,
        categories: Object.freeze(def.categories.map(freezeCategory)) as ProductionCategory[],
    });
}

/**
 * Constrói o catálogo EFETIVO de subtipos = canônico ∪ definições registradas
 * por dado/config VÁLIDAS (CFG-06). É o mecanismo de registro que faltava:
 * o admin/curador passa um array de definições (vindo de uma tabela versionada,
 * não de código) e este módulo valida cada uma e a promove ao catálogo. Um
 * subtipo válido registrado aqui aparece no seletor SEM rebuild.
 *
 * - O catálogo canônico é sempre incluído e NUNCA sobrescrito (imutável).
 * - Definições inválidas são descartadas (não entram) e ficam em `rejected`
 *   com o motivo — proveniência da curadoria, nunca um subtipo pela metade (N3).
 * - Definições registradas duplicadas (mesmo id) — a PRIMEIRA válida vence; as
 *   demais entram em `rejected` (registro determinístico, sem clobber silencioso).
 *
 * @param registered - Definições candidatas vindas de dado/config (default []).
 * @returns Catálogo efetivo congelado com `byId`, `ids`, proveniência e rejeições.
 */
export function buildEffectiveSubtypeCatalog(
    registered: ReadonlyArray<unknown> = [],
): EffectiveSubtypeCatalog {
    const byId: Record<string, ProductionSubtype> = {};
    const canonicalIds: string[] = [];
    // Base canônica (ordem de inserção do registry congelado).
    for (const [id, subtype] of Object.entries(PRODUCTION_SUBTYPES)) {
        byId[id] = subtype;
        canonicalIds.push(id);
    }

    const registeredIds: string[] = [];
    const rejected: SubtypeValidation[] = [];
    const list = Array.isArray(registered) ? registered : [];
    for (const def of list) {
        const validation = validateSubtypeDefinition(def);
        if (!validation.valid || validation.id === null) {
            rejected.push(validation);
            continue;
        }
        if (Object.prototype.hasOwnProperty.call(byId, validation.id)) {
            // Colisão com canônico (já barrada na validação) ou com um registrado
            // anterior — a primeira definição válida vence, esta é rejeitada.
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
        byId[validation.id] = freezeSubtype(def as ProductionSubtype);
        registeredIds.push(validation.id);
    }

    return Object.freeze({
        byId: Object.freeze(byId),
        ids: Object.freeze([...canonicalIds, ...registeredIds]) as readonly string[],
        canonicalIds: Object.freeze(canonicalIds) as readonly string[],
        registeredIds: Object.freeze(registeredIds) as readonly string[],
        rejected: Object.freeze(rejected) as readonly SubtypeValidation[],
    });
}

/**
 * Verdadeiro se `id` existe no catálogo EFETIVO (canônico ∪ registrado). É o
 * guard-rail N9 do lado do usuário: ele só ESCOLHE ids que o catálogo (curado)
 * conhece. Complementa `isValidSubtype()` de `subtypes.ts` estendendo-o aos
 * subtipos registrados por dado.
 *
 * @param catalog - Catálogo efetivo (de {@link buildEffectiveSubtypeCatalog}).
 * @param id - Id candidato escolhido pelo usuário.
 */
export function isValidEffectiveSubtype(
    catalog: EffectiveSubtypeCatalog,
    id: string | null | undefined,
): boolean {
    if (!isNonEmptyString(id)) return false;
    return Object.prototype.hasOwnProperty.call(catalog.byId, id);
}
