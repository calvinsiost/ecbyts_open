// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Plano de Ação Ambiental — núcleo PURO (ACTION-PLAN-001 §4.2, FASE 1).
 *
 * A "ponte PDCA" do ecbyts: transforma um problema detectado (não-conformidade,
 * condicionante de licença, risco CETESB, recomendação de auditoria, cenário ou
 * cadastro manual) numa **Ação** acompanhável com responsável, prazo, prioridade
 * (GUT), máquina de estados (PDCA) e **evidência obrigatória para fechar** —
 * exportável como prova de compliance perante o órgão ambiental.
 *
 * Tudo aqui é DETERMINÍSTICO e SEM EFEITO COLATERAL (sem DOM, sem I/O, sem
 * `Date.now()` interno): quem chama passa "hoje" para os derivados temporais
 * ({@link isOverdue}) e pode passar `id`/`createdAt` p/ reprodutibilidade em teste.
 *
 * Cobre RF-1..RF-9, RF-13 e RF-15 da spec. A persistência na chave `.ecbt` vive
 * em `actionPlanModelState.ts` (espelha `core/erp/erpModelState.ts`). A UI (RF-10)
 * e o wire em io/export·import são FASE 2.
 */

/* ============================================================================
   §4.2 — Tipos (copiados 1:1 da spec ACTION-PLAN-001)
   ========================================================================== */

/** Tipo da causa à qual a ação se vincula (RF-2 — ação nunca órfã). */
export type ActionOriginType =
    | 'nonconformity' // não-conformidade (environmentalComplianceScore / issues)
    | 'permitCondition' // condicionante de licença (environmentalPermitCompliance)
    | 'cetesbRisk' // risco CETESB/CONAMA (risk/cetesb)
    | 'auditRecommendation' // recomendação de auditoria (environmentalAuditScore / investigationQuality)
    | 'scenario' // cenário (scenarios)
    | 'manual'; // criada à mão (exige `cause` textual)

/** Natureza ambiental da ação (RF-7). */
export type ActionType = 'corretiva' | 'preventiva' | 'mitigadora' | 'compensatoria';

/** Escala de severidade CANÔNICA do projeto (reusa findings/issues — NÃO redefinir). */
export type ActionSeverity = 'critical' | 'high' | 'medium' | 'low';

/** Periodicidade de comprovação da condicionante (RF-12, ENV-CONDITIONS-001 A1). */
export type ActionProofPeriodicity =
    | 'diaria'
    | 'semanal'
    | 'mensal'
    | 'trimestral'
    | 'semestral'
    | 'anual'
    | 'evento'
    | 'unica';

/** Aplicabilidade da condicionante (RF-12, ENV-CONDITIONS-001 A3 — §5.3 da spec). */
export type ActionApplicability = 'aplicavel' | 'nao_aplicavel' | 'suspensa';

/**
 * Vínculo com um órgão regulatório (RF-12, ENV-CONDITIONS-001 A16 — §5.1 da spec).
 *
 * Substitui o antigo `Action.agency?: 'CETESB'|'IBAMA'|'municipal'` (enum fechado,
 * não escalava para multinacionais nem para condicionantes que respondem a >1 órgão
 * simultâneo — ex. outorga de água federal DENTRO de uma licença estadual).
 *
 * Modelagem inspirada em sistemas em escala real (§5.1): EPA Facility Registry
 * Service (tabela de junção many-to-many "Program Links") + UK Environment Agency
 * "Lead Regulator Policy" (concorrência de autoridade resolvida por um `role` dentro
 * da mesma lista, não por uma entidade separada). `agencyCode` é string livre
 * (extensível por catálogo à parte) — nunca um enum TypeScript fechado, porque não
 * existe enum global de agências (cada país/estado tem o seu).
 */
export interface RegulatoryLink {
    /** Código livre do órgão: 'CETESB', 'IBAMA', 'ANA', 'US-EPA', 'UK-EA', ... */
    agencyCode: string;
    /** Rótulo humano; resolve via catálogo externo quando ausente. */
    agencyName?: string;
    jurisdictionLevel: 'federal' | 'state' | 'municipal' | 'basin' | 'international';
    /** Exatamente 1 'primary' por condicionante (demais são 'co-regulator'). */
    role: 'primary' | 'co-regulator';
    protocolNumber?: string;
    agencyDeadline?: string;
}

/** Estados da máquina PDCA (RF-3). `atrasada` é derivado, não armazenado. */
export type ActionStatus =
    | 'aberta'
    | 'em_andamento'
    | 'pendente_verificacao'
    | 'concluida'
    | 'verificada'
    | 'cancelada'
    | 'reaberta';

/** Evidência anexada a uma ação (RF-4 — obrigatória p/ fechar). */
export interface ActionEvidence {
    kind: 'foto' | 'laudo' | 'protocolo' | 'relatorio' | 'documento';
    ref: string; // caminho/URL/descrição da evidência
    protocolNumber?: string; // nº de protocolo (condicionante)
    date: string; // ISO-8601
    // Validade própria da evidência (RF-12, ENV-CONDITIONS-001 A8 — §5 item 4):
    // laudo/ART/outorga/MTR pode expirar ANTES do próximo ciclo. Ver
    // {@link hasExpiredEvidence}.
    validUntil?: string; // ISO-8601 (data); ausente = sem validade própria
}

/** Registro datado de uma transição de status (audit trail — RF-3). */
export interface ActionTransition {
    from: ActionStatus;
    to: ActionStatus;
    at: string; // ISO-8601 (timestamp)
    by: string; // autor (rótulo de texto — v1 não-autenticado)
    note?: string;
}

/** A Ação — entidade de nível-modelo (5W2H + GUT + PDCA + VoE). */
export interface Action {
    readonly id: string;
    // 5W2H -------------------------------------------------------------
    title: string; // What  (o quê)
    cause: string; // Why   (por quê / causa-raiz)
    location?: string; // Where (onde / unidade / elementId)
    dueDate: string; // When  (prazo, ISO-8601)
    responsible: string; // Who   (executor — RACI Responsible)
    method?: string; // How   (método / passos)
    cost?: number; // How-much (custo estimado)
    // Vínculo à causa (RF-2) ------------------------------------------
    originType: ActionOriginType;
    originRef?: string; // elementId / scenarioId / findingCategory / conditionId
    // Classificação ---------------------------------------------------
    type: ActionType;
    severity: ActionSeverity;
    // Prioridade GUT (RF-6) -------------------------------------------
    gravity: number; // 1..5
    urgency: number; // 1..5
    trend: number; // 1..5
    gutScore: number; // G×U×T (derivado, 1..125)
    priority: 'Alta' | 'Média' | 'Baixa'; // derivado de gutScore
    // RACI ------------------------------------------------------------
    accountable?: string; // aprovador (1 único)
    consulted?: string[]; // notificados no início (v1: só registro)
    informed?: string[]; // notificados no fechamento (v1: só registro)
    // Workflow / VoE --------------------------------------------------
    status: ActionStatus;
    history: ActionTransition[];
    evidence: ActionEvidence[];
    verifiedBy?: string; // verificador (≠ responsible — RF-5)
    effectivenessReviewDate?: string; // reverificação agendada (Act do PDCA)
    // Agrupador (RF-13) -----------------------------------------------
    planId?: string;
    // Condicionante (RF-12) -------------------------------------------
    licenseNumber?: string;
    // Órgãos regulatórios (RF-12, A16 — §5.1): substitui o antigo `agency`
    // (enum fechado). `agencyDeadline` (abaixo) permanece no nível da Action
    // porque é usado hoje por `isOverdue` sem referência a um órgão específico
    // (ex. condicionante de regime `continua`) — não duplicar essa semântica
    // dentro de cada `RegulatoryLink` seria incorreto; o campo por-órgão em
    // `RegulatoryLink.agencyDeadline` é para quando cada regulador tem prazo
    // próprio divergente (caso raro, ex. co-regulator com prazo diferente do
    // primary), sem afetar o `agencyDeadline` "efetivo" da Action.
    regulators?: RegulatoryLink[];
    phase?: 'LP' | 'LI' | 'LO';
    agencyDeadline?: string;
    proofPeriodicity?: ActionProofPeriodicity;
    // Aplicabilidade (RF-12, A3) — default 'aplicavel' quando ausente.
    applicability?: ActionApplicability;
    applicabilityReason?: string;
    // Regime temporal (RF-12, A7 — §5.1): prazo_fixo tem `agencyDeadline`
    // único; continua é permanente e sua conformidade se avalia por ciclo de
    // `proofPeriodicity`, não por uma data-limite. Campo local temporário —
    // quando a estampa `monitoring_condition` (utils/stamps/types.ts) existir,
    // este campo pode ser sincronizado/substituído por ela sem mudar a
    // assinatura de `isOverdue`.
    monitoringRegime?: 'prazo_fixo' | 'continua';
    // Vínculo a indicador/ODS (RF-12, ENV-CONDITIONS-001 A2) -----------
    // Amarrado no TARGET (ex. '6.3'), não só no goal (6) — GRI "Linking
    // SDGs and GRI Standards". A resolução completa (nome do ODS,
    // officialIndicator) fica para quem CONSOME o campo (via
    // `core/ods/_registryPure.ts:getOds`), não para a criação: este núcleo
    // só valida `odsId` estar no intervalo 1..17 (validação leve, sem
    // importar `_registryPure.ts` aqui para não acoplar o núcleo de Action
    // ao catálogo de ODS).
    odsId?: number;
    odsIndicatorKey?: string;
    // Herança na renovação da licença (RF-12, A10 — §5 item 2) --------
    supersededBy?: string; // id da Action do NOVO ciclo que substitui esta
    licenseRenewalId?: string; // id/protocolo da renovação de LO que gerou o novo ciclo
    // Versionamento do enunciado (RF-12, A14 — §5 item 6) --------------
    revision?: number;
    // Auditabilidade --------------------------------------------------
    readonly createdAt: string;
    updatedAt: string;
}

/** Agrupador opcional Plano/Programa (RF-13). */
export interface Plan {
    readonly id: string;
    name: string;
    kind:
        | 'PGRS'
        | 'PRAD'
        | 'monitoramento'
        | 'emergencia'
        | 'PBA'
        | 'condicionantes-LO'
        | 'generico';
    createdAt: string;
}

/* ============================================================================
   §5.3 — Códigos de erro (mensagens vivem na i18n da spec §7)
   ========================================================================== */

/** Erro de domínio do Plano de Ação, com `code` estável p/ a UI mapear i18n. */
export class ActionPlanError extends Error {
    readonly code: string;
    constructor(code: string, message?: string) {
        super(message ?? code);
        this.name = 'ActionPlanError';
        this.code = code;
    }
}

export const ERR_AP_ORPHAN = 'ERR_AP_ORPHAN';
export const ERR_AP_NO_EVIDENCE = 'ERR_AP_NO_EVIDENCE';
export const ERR_AP_SAME_VERIFIER = 'ERR_AP_SAME_VERIFIER';
export const ERR_AP_INVALID_TRANSITION = 'ERR_AP_INVALID_TRANSITION';
export const ERR_AP_CORRECTIVE_NO_CAUSE = 'ERR_AP_CORRECTIVE_NO_CAUSE';

/* ============================================================================
   Constantes de domínio
   ========================================================================== */

/** Conjunto de origens válidas (RF-2). */
const VALID_ORIGINS: ReadonlySet<ActionOriginType> = new Set<ActionOriginType>([
    'nonconformity',
    'permitCondition',
    'cetesbRisk',
    'auditRecommendation',
    'scenario',
    'manual',
]);

/** Periodicidades de comprovação válidas (RF-12, A1). */
const VALID_PROOF_PERIODICITIES: ReadonlySet<string> = new Set<ActionProofPeriodicity>([
    'diaria',
    'semanal',
    'mensal',
    'trimestral',
    'semestral',
    'anual',
    'evento',
    'unica',
]);

/** Aplicabilidades válidas da condicionante (RF-12, A3). */
const VALID_APPLICABILITY: ReadonlySet<string> = new Set<ActionApplicability>([
    'aplicavel',
    'nao_aplicavel',
    'suspensa',
]);

/** Tabela de transições válidas da máquina PDCA (RF-3, §4.3). */
const VALID_TRANSITIONS: Readonly<Record<ActionStatus, readonly ActionStatus[]>> = Object.freeze({
    aberta: ['em_andamento', 'cancelada'],
    em_andamento: ['pendente_verificacao', 'cancelada'],
    pendente_verificacao: ['concluida', 'em_andamento'],
    concluida: ['verificada', 'reaberta'],
    verificada: ['reaberta'],
    reaberta: ['em_andamento'],
    cancelada: [], // terminal
});

/** Estados em que a ação ainda está "aberta" para fins de `atrasada` (RF-3). */
const OPEN_STATUSES: ReadonlySet<ActionStatus> = new Set<ActionStatus>([
    'aberta',
    'em_andamento',
    'pendente_verificacao',
    'reaberta',
]);

/** Estados que contam como "fechado com sucesso" (exigem evidência — RF-4). */
const CLOSED_OK_STATUSES: ReadonlySet<ActionStatus> = new Set<ActionStatus>([
    'concluida',
    'verificada',
]);

/* ============================================================================
   Helpers internos (puros)
   ========================================================================== */

/** Gera um id estável (UUID quando disponível; senão fallback determinístico-suave). */
function genId(prefix: string): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Texto não-vazio? (trim). */
function isNonEmpty(v: unknown): v is string {
    return typeof v === 'string' && v.trim().length > 0;
}

/** Clampa um inteiro GUT à faixa 1..5 (defensivo; valores fora viram extremo válido). */
function clampGut(n: unknown): number {
    const v = Math.round(Number(n));
    if (!Number.isFinite(v)) return 1;
    if (v < 1) return 1;
    if (v > 5) return 5;
    return v;
}

/**
 * Normaliza `proofPeriodicity` (RF-12, A1): valor fora do enum vira `undefined`
 * em vez de lançar erro — é um campo opcional de condicionante (mesmo padrão de
 * tolerância usado hoje por `severity`/`type`, que caem para default silencioso
 * em vez de rejeitar a ação inteira). Evita quebrar rascunhos vindos de UI/import
 * legados que ainda gravam texto livre em `proofPeriodicity`.
 *
 * @param v - Valor bruto recebido (texto livre ou já no enum).
 * @returns O enum válido, ou `undefined` se `v` estiver ausente/fora do enum.
 */
function normalizeProofPeriodicity(v: unknown): ActionProofPeriodicity | undefined {
    if (typeof v !== 'string') return undefined;
    const trimmed = v.trim();
    return VALID_PROOF_PERIODICITIES.has(trimmed) ? (trimmed as ActionProofPeriodicity) : undefined;
}

/**
 * Normaliza `applicability` (RF-12, A3): default `'aplicavel'` quando ausente
 * ou fora do enum — não quebra dados existentes que nunca tinham este campo.
 *
 * @param v - Valor bruto recebido.
 * @returns O enum válido (default `'aplicavel'`).
 */
function normalizeApplicability(v: unknown): ActionApplicability {
    if (typeof v === 'string') {
        const trimmed = v.trim();
        if (VALID_APPLICABILITY.has(trimmed)) return trimmed as ActionApplicability;
    }
    return 'aplicavel';
}

/**
 * Normaliza `odsId` (RF-12, ENV-CONDITIONS-001 A2): valor fora do intervalo
 * 1..17 (ou não-inteiro) vira `undefined` em vez de lançar erro — mesmo
 * padrão de tolerância de `normalizeProofPeriodicity`. Validação
 * DELIBERADAMENTE leve (só o intervalo do catálogo dos 17 ODS): a resolução
 * completa do ODS (nome, `officialIndicator`, `isClaimedTierHonest`) é
 * responsabilidade de quem CONSOME o campo via `core/ods/_registryPure.ts`
 * — este núcleo não importa `_registryPure.ts` para não acoplar o modelo de
 * Action ao catálogo de ODS.
 *
 * @param v - Valor bruto recebido.
 * @returns Inteiro 1..17, ou `undefined` se ausente/inválido/fora do intervalo.
 */
function normalizeOdsId(v: unknown): number | undefined {
    if (typeof v !== 'number' || !Number.isInteger(v)) return undefined;
    if (v < 1 || v > 17) return undefined;
    return v;
}

/**
 * Infere o `jurisdictionLevel` a partir do código de órgão legado (RF-12, A16).
 * `IBAMA` é o único órgão federal do enum antigo; `municipal` mapeia direto;
 * qualquer outro valor (ex. `CETESB` e demais agências estaduais) cai em
 * `'state'` — cobre o caso concreto do enum fechado anterior sem inventar
 * uma heurística mais ampla do que o dado de entrada suporta.
 *
 * @param oldAgency - Código legado (`CETESB`/`IBAMA`/`municipal`/outro).
 * @returns O nível de jurisdição inferido.
 */
function inferJurisdictionLevel(oldAgency: string): RegulatoryLink['jurisdictionLevel'] {
    if (oldAgency === 'IBAMA') return 'federal';
    if (oldAgency === 'municipal') return 'municipal';
    return 'state';
}

/**
 * Migra o campo legado `agency?: string` para `regulators?: RegulatoryLink[]`
 * (RF-12, ENV-CONDITIONS-001 A16 — §5.1). Função pura de compatibilidade: não
 * quebra dados/chamadas antigas que ainda gravam `agency` em vez de `regulators`.
 *
 * @param oldAgency - Valor legado de `agency` (ou `undefined`).
 * @returns `undefined` se `oldAgency` ausente; senão um array de 1 `RegulatoryLink`
 *   com `role:'primary'` e `jurisdictionLevel` inferido.
 */
export function migrateAgencyToRegulators(oldAgency?: string): RegulatoryLink[] | undefined {
    if (!isNonEmpty(oldAgency)) return undefined;
    const agencyCode = oldAgency.trim();
    return [
        {
            agencyCode,
            role: 'primary',
            jurisdictionLevel: inferJurisdictionLevel(agencyCode),
        },
    ];
}

/**
 * Normaliza uma lista de `RegulatoryLink[]` garantindo EXATAMENTE 1 item com
 * `role==='primary'` (RF-12, A16 — §5.1: "Lead Regulator" único por condicionante).
 * Tolerante, mesmo padrão de `normalizeProofPeriodicity`/`normalizeApplicability`:
 * nunca lança erro, sempre normaliza silenciosamente.
 *
 * - Zero `primary` → o primeiro item da lista vira `primary`.
 * - >1 `primary` → mantém o primeiro `primary` encontrado, rebaixa os demais
 *   (inclusive outros já marcados `primary`) para `co-regulator`.
 * - Lista vazia/ausente → `undefined` (condicionante pode não ter órgão em rascunho).
 *
 * @param regulators - Lista bruta (possivelmente com 0 ou >1 `primary`).
 * @returns Lista normalizada (nova array; não muta a entrada) ou `undefined`.
 */
function normalizeRegulators(regulators: unknown): RegulatoryLink[] | undefined {
    if (!Array.isArray(regulators) || regulators.length === 0) return undefined;
    const list = regulators as RegulatoryLink[];
    const firstPrimaryIdx = list.findIndex((r) => r?.role === 'primary');
    const primaryIdx = firstPrimaryIdx === -1 ? 0 : firstPrimaryIdx;
    return list.map((r, i) => ({ ...r, role: i === primaryIdx ? 'primary' : 'co-regulator' }));
}

/* ============================================================================
   RF-6 — Prioridade GUT (motor NÃO-compensatório: produto, não soma)
   ========================================================================== */

/**
 * Calcula `gutScore = G × U × T` (1..125) e deriva a prioridade.
 * NÃO-compensatório: urgência alta não mascara gravidade baixa, porque o produto
 * cai junto. Faixas (RF-6): Alta ≥ 100, Média 30..99, Baixa < 30.
 *
 * @param gravity - Gravidade 1..5.
 * @param urgency - Urgência 1..5.
 * @param trend - Tendência 1..5.
 * @returns `{ gutScore, priority }`.
 */
export function computeGut(
    gravity: number,
    urgency: number,
    trend: number,
): { gutScore: number; priority: 'Alta' | 'Média' | 'Baixa' } {
    const g = clampGut(gravity);
    const u = clampGut(urgency);
    const t = clampGut(trend);
    const gutScore = g * u * t;
    const priority: 'Alta' | 'Média' | 'Baixa' =
        gutScore >= 100 ? 'Alta' : gutScore >= 30 ? 'Média' : 'Baixa';
    return { gutScore, priority };
}

/* ============================================================================
   RF-8.1 — Normalizador de severidade (entre as duas escalas do app)
   ========================================================================== */

/**
 * Normaliza um valor de severidade para a escala CANÔNICA `critical/high/medium/low`.
 * O app tem duas escalas: `minor/major/critical` (compliance/permit/audit) e a
 * canônica (investigationQuality/greenwashing/issues). Mapeia:
 * `minor → low`, `major → medium`, `critical → critical`. Valor desconhecido → `medium`.
 *
 * @param value - Valor de severidade na escala de origem.
 * @param scale - Escala do `value` (`'minor-major-critical'` ou `'critical-high-medium-low'`).
 * @returns Severidade canônica.
 */
export function normalizeSeverity(
    value: string,
    scale: 'minor-major-critical' | 'critical-high-medium-low',
): ActionSeverity {
    const v = String(value ?? '').toLowerCase().trim();
    if (scale === 'minor-major-critical') {
        if (v === 'minor') return 'low';
        if (v === 'major') return 'medium';
        if (v === 'critical') return 'critical';
        return 'medium';
    }
    // Escala já canônica: aceita o valor se for um dos 4; senão 'medium'.
    if (v === 'critical' || v === 'high' || v === 'medium' || v === 'low') {
        return v as ActionSeverity;
    }
    return 'medium';
}

/** Mapa severidade canônica → seed de Gravidade (GUT) 1..5. */
function severityToGravitySeed(sev: ActionSeverity): number {
    switch (sev) {
        case 'critical':
            return 5;
        case 'high':
            return 4;
        case 'medium':
            return 3;
        case 'low':
            return 2;
        default:
            return 3;
    }
}

/* ============================================================================
   RF-1 / RF-2 / RF-7 — createAction (valida órfã / corretiva / 5W2H mínimos)
   ========================================================================== */

/**
 * Entrada aceita por {@link createAction} (campos opcionais ganham default).
 * Aceita também o campo legado `agency` (RF-12, A16 — §5.1): quem ainda chama
 * `createAction` no formato antigo (`agency: 'CETESB'|'IBAMA'|'municipal'`)
 * continua funcionando — é migrado automaticamente para `regulators` quando
 * este não vier preenchido no draft.
 */
export type CreateActionInput = Partial<Action> & {
    /** @deprecated Campo legado — use `regulators`. Migrado automaticamente. */
    agency?: string;
};

/**
 * Cria uma Ação validada e normalizada.
 *
 * Regras:
 * - RF-1: exige `title` + `dueDate` + `responsible` + `cause` (5W2H mínimos).
 * - RF-2: exige `originType` válido; `manual` exige `cause` textual (já coberto por RF-1).
 * - RF-7: `type === 'corretiva'` exige `cause` (causa-raiz — também já coberto por RF-1,
 *   mas validado explicitamente com o código de erro próprio).
 * - GUT (RF-6) é (re)calculado a partir de gravity/urgency/trend.
 *
 * `id`/`createdAt`/`updatedAt` podem ser passados (reprodutibilidade em teste) ou
 * são gerados. Retorna um objeto novo (não muta a entrada).
 *
 * @param draft - Rascunho da ação.
 * @returns A Ação criada (status `aberta`, history/evidence iniciados).
 * @throws {ActionPlanError} ERR_AP_ORPHAN / ERR_AP_CORRECTIVE_NO_CAUSE.
 */
export function createAction(draft: CreateActionInput): Action {
    const d = draft ?? {};

    // RF-2 — origem obrigatória e válida.
    if (!d.originType || !VALID_ORIGINS.has(d.originType)) {
        throw new ActionPlanError(
            ERR_AP_ORPHAN,
            'Toda ação precisa de uma causa: vincule a um problema (originType válido).',
        );
    }

    // RF-1 — 5W2H mínimos (title + dueDate + responsible + cause).
    if (!isNonEmpty(d.title) || !isNonEmpty(d.dueDate) || !isNonEmpty(d.responsible)) {
        throw new ActionPlanError(
            ERR_AP_ORPHAN,
            'Ação exige título, prazo e responsável (5W2H mínimos).',
        );
    }
    if (!isNonEmpty(d.cause)) {
        // Para `manual`, RF-2 reforça a causa textual; para os demais, RF-1.
        throw new ActionPlanError(
            ERR_AP_ORPHAN,
            'Ação exige a causa (por quê / causa-raiz).',
        );
    }

    const type: ActionType = d.type ?? 'corretiva';

    // RF-7 — corretiva exige causa-raiz (código de erro próprio).
    if (type === 'corretiva' && !isNonEmpty(d.cause)) {
        throw new ActionPlanError(
            ERR_AP_CORRECTIVE_NO_CAUSE,
            'Ação corretiva exige a causa-raiz preenchida (por quê).',
        );
    }

    const severity: ActionSeverity = d.severity ?? 'medium';
    const gravity = clampGut(d.gravity ?? severityToGravitySeed(severity));
    const urgency = clampGut(d.urgency ?? 3);
    const trend = clampGut(d.trend ?? 3);
    const { gutScore, priority } = computeGut(gravity, urgency, trend);

    // RF-12 (A1/A3) — enums da condicionante: periodicidade fora do enum vira
    // undefined (tolerante); applicability sempre tem default 'aplicavel'.
    const proofPeriodicity = normalizeProofPeriodicity(d.proofPeriodicity);
    const applicability = normalizeApplicability(d.applicability);

    // RF-12 (A2) — vínculo a indicador/ODS: odsId fora de 1..17 vira undefined
    // (tolerante, mesmo padrão acima); odsIndicatorKey é texto livre amarrado
    // ao TARGET (ex. '6.3'), só é mantido quando há um odsId válido junto
    // (indicador sem ODS não faz sentido semântico).
    const odsId = normalizeOdsId(d.odsId);
    const odsIndicatorKey = odsId !== undefined && isNonEmpty(d.odsIndicatorKey)
        ? d.odsIndicatorKey.trim()
        : undefined;

    // RF-12 (A16, §5.1) — regulators: se vier `regulators` explícito, normaliza
    // (garante exatamente 1 `primary`); senão migra o campo legado `agency`
    // automaticamente. Se nenhum dos dois vier, fica undefined (condicionante
    // pode não ter órgão definido ainda em rascunho).
    const regulators = Array.isArray(d.regulators)
        ? normalizeRegulators(d.regulators)
        : migrateAgencyToRegulators(d.agency);

    const now = isNonEmpty(d.createdAt) ? d.createdAt : new Date().toISOString();

    return {
        id: isNonEmpty(d.id) ? d.id : genId('act'),
        title: d.title.trim(),
        cause: d.cause.trim(),
        ...(d.location !== undefined ? { location: d.location } : {}),
        dueDate: d.dueDate.trim(),
        responsible: d.responsible.trim(),
        ...(d.method !== undefined ? { method: d.method } : {}),
        ...(typeof d.cost === 'number' && Number.isFinite(d.cost) ? { cost: d.cost } : {}),
        originType: d.originType,
        ...(d.originRef !== undefined ? { originRef: d.originRef } : {}),
        type,
        severity,
        gravity,
        urgency,
        trend,
        gutScore,
        priority,
        ...(d.accountable !== undefined ? { accountable: d.accountable } : {}),
        ...(Array.isArray(d.consulted) ? { consulted: [...d.consulted] } : {}),
        ...(Array.isArray(d.informed) ? { informed: [...d.informed] } : {}),
        status: 'aberta',
        history: [],
        evidence: Array.isArray(d.evidence) ? [...d.evidence] : [],
        ...(d.verifiedBy !== undefined ? { verifiedBy: d.verifiedBy } : {}),
        ...(d.effectivenessReviewDate !== undefined ? { effectivenessReviewDate: d.effectivenessReviewDate } : {}),
        ...(d.planId !== undefined ? { planId: d.planId } : {}),
        ...(d.licenseNumber !== undefined ? { licenseNumber: d.licenseNumber } : {}),
        ...(regulators !== undefined ? { regulators } : {}),
        ...(d.phase !== undefined ? { phase: d.phase } : {}),
        ...(d.agencyDeadline !== undefined ? { agencyDeadline: d.agencyDeadline } : {}),
        ...(proofPeriodicity !== undefined ? { proofPeriodicity } : {}),
        applicability,
        ...(d.applicabilityReason !== undefined ? { applicabilityReason: d.applicabilityReason } : {}),
        ...(d.monitoringRegime !== undefined ? { monitoringRegime: d.monitoringRegime } : {}),
        ...(odsId !== undefined ? { odsId } : {}),
        ...(odsIndicatorKey !== undefined ? { odsIndicatorKey } : {}),
        ...(d.supersededBy !== undefined ? { supersededBy: d.supersededBy } : {}),
        ...(d.licenseRenewalId !== undefined ? { licenseRenewalId: d.licenseRenewalId } : {}),
        ...(typeof d.revision === 'number' && Number.isFinite(d.revision) ? { revision: d.revision } : {}),
        createdAt: now,
        updatedAt: now,
    };
}

/* ============================================================================
   RF-8 / RF-8.1 — createActionFromFinding (mapa 1:1 ou adaptador por origem)
   ========================================================================== */

/** Shape de entrada de {@link createActionFromFinding} (finding OU score/classe agregada). */
export interface FindingSource {
    // Shape de finding 1:1 (investigationQuality / greenwashing):
    severity?: ActionSeverity | 'minor' | 'major';
    category?: string;
    finding?: string;
    recommendation?: string;
    elementId?: string;
    // Campos de score/classe agregada (fontes não-finding → adaptador):
    severityClass?: 'minor' | 'major' | 'critical';
    score?: number;
    outcome?: string;
}

/** Origens cujo shape de entrada é um finding 1:1 (não passam pelo adaptador). */
const FINDING_SHAPE_ORIGINS: ReadonlySet<ActionOriginType> = new Set<ActionOriginType>([
    'auditRecommendation', // investigationQuality
    'manual',
    'scenario',
]);

/**
 * Cria uma Ação pré-preenchida a partir de uma origem de problema (RF-8).
 *
 * O comportamento depende de `originType` (NÃO é mapa 1:1 universal):
 *  - **Finding 1:1** (`auditRecommendation`/`manual`/`scenario`, vindo de
 *    investigationQuality/greenwashing): mapeia o shape
 *    `{ severity, category, finding, recommendation?, elementId? }` →
 *    `recommendation → method (How)`, `finding → title + cause`,
 *    `elementId → location/originRef`, `severity → seed de gravity`.
 *  - **Adaptador** (`nonconformity`/`permitCondition`/`cetesbRisk`): a fonte é
 *    score/classe agregada — normaliza a escala `minor/major/critical → canônica`
 *    (RF-8.1) e **sintetiza** `cause`/`method` a partir do score/classe.
 *
 * **Proibido redefinir** taxonomia de severidade/categoria — só mapeia/normaliza.
 *
 * @param source - Finding (1:1) ou score/classe agregada (adaptador).
 * @param originType - Tipo da causa (RF-2) — decide o caminho.
 * @returns A Ação pré-preenchida e validada (passa por {@link createAction}).
 */
export function createActionFromFinding(
    source: FindingSource,
    originType: ActionOriginType,
): Action {
    const s = source ?? {};
    const isFindingShape = FINDING_SHAPE_ORIGINS.has(originType);

    let severity: ActionSeverity;
    let title: string;
    let cause: string;
    let method: string | undefined;
    let location: string | undefined;
    let originRef: string | undefined;

    if (isFindingShape) {
        // Caminho 1:1 (RF-8) — severidade já na escala canônica (ou normalizável).
        severity = normalizeSeverity(String(s.severity ?? 'medium'), 'critical-high-medium-low');
        const findingText = isNonEmpty(s.finding) ? s.finding : (s.category ?? 'Problema detectado');
        title = findingText;
        cause = findingText;
        method = isNonEmpty(s.recommendation) ? s.recommendation : undefined;
        location = s.elementId;
        originRef = s.elementId ?? s.category;
    } else {
        // Caminho ADAPTADOR (RF-8/RF-8.1) — score/classe agregada, escala minor/major/critical.
        const cls = s.severityClass ?? (s.severity as 'minor' | 'major' | undefined) ?? 'major';
        severity = normalizeSeverity(String(cls), 'minor-major-critical');
        const label = labelForAdapterOrigin(originType);
        const detail = isNonEmpty(s.finding)
            ? s.finding
            : isNonEmpty(s.outcome)
              ? s.outcome
              : isNonEmpty(s.category)
                ? s.category
                : label;
        title = `${label}: ${detail}`;
        // Sintetiza causa a partir da classe/score (NÃO é mapa 1:1).
        cause = synthesizeCause(originType, cls, s.score, detail);
        method = isNonEmpty(s.recommendation)
            ? s.recommendation
            : synthesizeMethod(originType);
        location = s.elementId;
        originRef = s.elementId ?? s.category;
    }

    const type = defaultTypeForOrigin(originType);
    const gravity = severityToGravitySeed(severity);

    return createAction({
        title,
        cause,
        ...(method !== undefined ? { method } : {}),
        ...(location !== undefined ? { location } : {}),
        originType,
        ...(originRef !== undefined ? { originRef } : {}),
        type,
        severity,
        gravity,
        // dueDate/responsible são preenchidos pelo usuário no modal (FASE 2); aqui
        // damos defaults seguros para a ação ser válida (placeholder editável).
        dueDate: defaultDueDate(),
        responsible: 'A definir',
    });
}

/** Rótulo humano da origem que entra via adaptador. */
function labelForAdapterOrigin(originType: ActionOriginType): string {
    switch (originType) {
        case 'nonconformity':
            return 'Não-conformidade';
        case 'permitCondition':
            return 'Condicionante de licença';
        case 'cetesbRisk':
            return 'Risco CETESB';
        default:
            return 'Achado';
    }
}

/** Sintetiza a causa-raiz textual para origens de score/classe agregada (adaptador). */
function synthesizeCause(
    originType: ActionOriginType,
    cls: string,
    score: number | undefined,
    detail: string,
): string {
    const scorePart =
        typeof score === 'number' && Number.isFinite(score) ? ` (índice ${score})` : '';
    return `Classe de severidade "${cls}"${scorePart} apontada por ${labelForAdapterOrigin(
        originType,
    )}: ${detail}.`;
}

/** Sintetiza o método/passos padrão para origens de score/classe agregada (adaptador). */
function synthesizeMethod(originType: ActionOriginType): string {
    switch (originType) {
        case 'permitCondition':
            return 'Atender à condicionante e protocolar comprovação junto ao órgão ambiental.';
        case 'cetesbRisk':
            return 'Avaliar e mitigar o risco conforme procedimento ambiental aplicável.';
        case 'nonconformity':
        default:
            return 'Analisar causa-raiz e implementar ação corretiva com evidência documental.';
    }
}

/** Tipo de ação sugerido por origem (RF-7 — sugestão, não trava). */
function defaultTypeForOrigin(originType: ActionOriginType): ActionType {
    switch (originType) {
        case 'nonconformity':
        case 'auditRecommendation':
            return 'corretiva';
        case 'cetesbRisk':
            return 'preventiva';
        case 'scenario':
            return 'mitigadora';
        case 'permitCondition':
        case 'manual':
        default:
            return 'corretiva';
    }
}

/** Prazo default (placeholder editável): hoje + 30 dias, em ISO date (UTC). */
function defaultDueDate(): string {
    const now = Date.now();
    const due = new Date(now + 30 * 24 * 60 * 60 * 1000);
    return due.toISOString().slice(0, 10);
}

/* ============================================================================
   RF-3 / RF-4 — transitionStatus (máquina de estados PDCA + evidência)
   ========================================================================== */

/**
 * Avança a ação na máquina de estados PDCA (RF-3), bloqueando pulos de etapa e
 * exigindo ≥1 evidência para fechar (RF-4). Grava a transição datada no histórico.
 *
 * Pureza: retorna uma **nova** ação (não muta a entrada). O timestamp pode ser
 * fixado via `at` (reprodutibilidade em teste); senão usa o relógio.
 *
 * @param action - Ação atual.
 * @param to - Novo status desejado.
 * @param by - Autor da transição (rótulo de texto).
 * @param note? - Nota opcional.
 * @param at? - Timestamp ISO opcional (default: agora).
 * @returns A ação com o novo status + transição no histórico.
 * @throws {ActionPlanError} ERR_AP_INVALID_TRANSITION / ERR_AP_NO_EVIDENCE.
 */
export function transitionStatus(
    action: Action,
    to: ActionStatus,
    by: string,
    note?: string,
    at?: string,
): Action {
    const from = action.status;
    const allowed = VALID_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
        throw new ActionPlanError(
            ERR_AP_INVALID_TRANSITION,
            `Transição inválida: ${from} → ${to}. Siga a ordem do ciclo (PDCA).`,
        );
    }

    // RF-4 — fechar (concluida/verificada) exige ≥1 evidência.
    if (CLOSED_OK_STATUSES.has(to) && (action.evidence?.length ?? 0) < 1) {
        throw new ActionPlanError(
            ERR_AP_NO_EVIDENCE,
            'Não dá para concluir sem prova: anexe ao menos uma evidência.',
        );
    }

    const stamp = isNonEmpty(at) ? at : new Date().toISOString();
    const transition: ActionTransition = {
        from,
        to,
        at: stamp,
        by,
        ...(note !== undefined ? { note } : {}),
    };

    return {
        ...action,
        status: to,
        history: [...action.history, transition],
        updatedAt: stamp,
    };
}

/* ============================================================================
   RF-5 — verifyAction (VoE: verificador ≠ responsável)
   ========================================================================== */

/**
 * A evidência mais recente da ação está vencida (RF-12, ENV-CONDITIONS-001
 * A8 — §5 item 4)? Laudo/ART/outorga/MTR pode expirar ANTES do próximo ciclo
 * de comprovação — nesse caso a condicionante deve ser tratada como
 * reaberta/pendente mesmo sem um novo `agencyDeadline` vencido. "Mais
 * recente" = maior `date` (ISO) entre as evidências anexadas; evidências
 * sem `validUntil` nunca expiram (comportamento legado preservado).
 *
 * Função pura auxiliar — não muta nem transiciona a ação; quem chama decide
 * o que fazer com o resultado (ex. bloquear `verifyAction`, ou reabrir via
 * {@link transitionStatus}).
 *
 * @param action - Ação a avaliar.
 * @param today - "Hoje" em ISO date `YYYY-MM-DD` (pureza — sem `Date.now`).
 * @returns true se a evidência mais recente tem `validUntil` no passado.
 */
export function hasExpiredEvidence(action: Action, today: string): boolean {
    if (!isNonEmpty(today) || !Array.isArray(action.evidence) || action.evidence.length === 0) {
        return false;
    }
    const mostRecent = [...action.evidence].sort((a, b) =>
        String(b.date ?? '').localeCompare(String(a.date ?? '')),
    )[0];
    if (!mostRecent || !isNonEmpty(mostRecent.validUntil)) return false;
    return mostRecent.validUntil.slice(0, 10) < today.slice(0, 10);
}

/**
 * Verificação de Eficácia (VoE — RF-5): leva uma ação `concluida` a `verificada`,
 * exigindo que o `verifier` seja DIFERENTE do `responsible` (a mesma pessoa não
 * pode executar e verificar a própria ação). Agenda a reverificação (Act do PDCA).
 *
 * Reusa {@link transitionStatus} para gravar a transição no histórico (RF-3).
 *
 * RF-12 (A8) — se `today` for informado e a evidência mais recente estiver
 * vencida ({@link hasExpiredEvidence}), a verificação é RECUSADA: a ação vai
 * para `reaberta` (via `concluida → reaberta`, transição já permitida pela
 * máquina PDCA) em vez de `verificada` — mesmo sem novo `agencyDeadline`
 * vencido, evidência expirada nunca pode fechar o ciclo como válido.
 *
 * @param action - Ação `concluida` (com evidência).
 * @param verifier - Quem verifica (≠ `action.responsible`).
 * @param reviewDate? - Data de reverificação agendada (ISO, opcional).
 * @param at? - Timestamp ISO opcional (default: agora).
 * @param today? - "Hoje" em ISO date, para checar evidência vencida (A8).
 * @returns A ação `verificada` (ou `reaberta` se evidência vencida).
 * @throws {ActionPlanError} ERR_AP_SAME_VERIFIER / ERR_AP_INVALID_TRANSITION.
 */
export function verifyAction(
    action: Action,
    verifier: string,
    reviewDate?: string,
    at?: string,
    today?: string,
): Action {
    if (!isNonEmpty(verifier) || verifier.trim() === action.responsible.trim()) {
        throw new ActionPlanError(
            ERR_AP_SAME_VERIFIER,
            'Quem executou a ação não pode verificá-la. A verificação precisa de uma segunda pessoa.',
        );
    }

    if (isNonEmpty(today) && hasExpiredEvidence(action, today)) {
        return transitionStatus(
            action,
            'reaberta',
            verifier,
            'Evidência vencida (validUntil expirado) — condicionante reaberta em vez de verificada.',
            at,
        );
    }

    const verified = transitionStatus(action, 'verificada', verifier, 'VoE', at);
    const resolvedReviewDate = isNonEmpty(reviewDate) ? reviewDate : verified.effectivenessReviewDate;
    return {
        ...verified,
        verifiedBy: verifier.trim(),
        ...(resolvedReviewDate !== undefined ? { effectivenessReviewDate: resolvedReviewDate } : {}),
    };
}

/* ============================================================================
   `atrasada` derivado (RF-3) — passa "hoje" (pureza, sem Date.now interno)
   ========================================================================== */

/**
 * A ação está atrasada? Derivado (RF-3): `dueDate` < hoje E status ainda aberto
 * (não `concluida`/`verificada`/`cancelada`). NÃO é estado armazenado.
 *
 * Edge-case A7 (ENV-CONDITIONS-001 §5.1) — condicionante CONTÍNUA sem prazo:
 * quando `action.monitoringRegime === 'continua'` e `agencyDeadline` está
 * vazio/ausente, a ausência de data NÃO é falso-atraso (uma condicionante
 * permanente é válida sem `agencyDeadline` por definição). A conformidade da
 * contínua deveria ser avaliada pelo ÚLTIMO ciclo de comprovação dentro de
 * `proofPeriodicity` — mas este núcleo ainda não recebe o "último ciclo"
 * (viria de `evidence`/estampa `monitoring_condition`, fora do escopo desta
 * função). LIMITAÇÃO HONESTA: sem esse dado, retornamos `false` (não-vencida)
 * em vez de arriscar um falso-ATRASO por ausência de dado — o inverso do
 * princípio anti-falso-verde do projeto, mas com o mesmo espírito: nunca
 * inferir um estado negativo (aqui, "atrasada") a partir da mera ausência de
 * informação.
 *
 * @param action - Ação a avaliar.
 * @param today - "Hoje" em ISO date `YYYY-MM-DD` (passado pelo chamador — pureza).
 * @returns true se atrasada.
 */
export function isOverdue(action: Action, today: string): boolean {
    if (!OPEN_STATUSES.has(action.status)) return false;
    if (!isNonEmpty(today)) return false;

    // A7 — contínua sem agencyDeadline: nunca falso-atraso por ausência de data.
    if (action.monitoringRegime === 'continua' && !isNonEmpty(action.agencyDeadline)) {
        return false;
    }

    if (!isNonEmpty(action.dueDate)) return false;
    // Compara as datas como ISO (YYYY-MM-DD ordena lexicograficamente).
    return action.dueDate.slice(0, 10) < today.slice(0, 10);
}

/* ============================================================================
   RF-15 — computeCycleKpi (% com ação / % no prazo / % verificada)
   ========================================================================== */

/**
 * KPI de fechamento de ciclo (RF-15 — indicador-suporte, NÃO monetário):
 *  - `coverage`: % de problemas (findings) que já têm ≥1 ação vinculada.
 *  - `onTime`: % de ações NÃO atrasadas (relativo a `today`).
 *  - `verified`: % de ações com eficácia verificada (status `verificada`).
 *
 * Frações em 0..1 (a UI formata como %). Conjuntos vazios devolvem 0 (sem divisão
 * por zero). A cobertura casa finding↔ação por `originRef` quando o finding expõe
 * `elementId`/`category`; ações sem match não contam para a cobertura.
 *
 * @param findings - Lista de findings/problemas (shape flexível).
 * @param actions - Lista de ações.
 * @param today - "Hoje" em ISO date (para `onTime`).
 * @returns `{ coverage, onTime, verified }` (frações 0..1).
 */
export function computeCycleKpi(
    findings: Array<{ elementId?: string; category?: string; id?: string }> | unknown[],
    actions: Action[],
    today: string,
): { coverage: number; onTime: number; verified: number } {
    const acts = Array.isArray(actions) ? actions : [];
    const probs = Array.isArray(findings) ? findings : [];

    // Refs que JÁ têm ação (RF-2: toda ação tem originRef ou ao menos originType).
    const coveredRefs = new Set<string>();
    for (const a of acts) {
        if (isNonEmpty(a.originRef)) coveredRefs.add(a.originRef);
    }

    let covered = 0;
    for (const f of probs) {
        const ref =
            (f as { elementId?: string }).elementId ??
            (f as { category?: string }).category ??
            (f as { id?: string }).id;
        if (isNonEmpty(ref) && coveredRefs.has(ref)) covered += 1;
    }

    const coverage = probs.length > 0 ? covered / probs.length : 0;

    const onTimeCount = acts.filter((a) => !isOverdue(a, today)).length;
    const onTime = acts.length > 0 ? onTimeCount / acts.length : 0;

    const verifiedCount = acts.filter((a) => a.status === 'verificada').length;
    const verified = acts.length > 0 ? verifiedCount / acts.length : 0;

    return { coverage, onTime, verified };
}

/* ============================================================================
   RF-13 — Plano (agrupador opcional) + % de conclusão (média PONDERADA
   por gutScore das ações — ver SPEC_ACTION_PLAN.md §RF-13 "Testável")
   ========================================================================== */

/**
 * Cria um Plano/Programa agrupador (RF-13). `id`/`createdAt` podem ser passados
 * (reprodutibilidade em teste) ou são gerados.
 *
 * @param draft - Rascunho do plano (`name` exigido; `kind` default `generico`).
 * @returns O Plano criado.
 */
export function createPlan(draft: Partial<Plan>): Plan {
    const d = draft ?? {};
    if (!isNonEmpty(d.name)) {
        throw new ActionPlanError(ERR_AP_ORPHAN, 'Plano exige um nome.');
    }
    return {
        id: isNonEmpty(d.id) ? d.id : genId('plan'),
        name: d.name.trim(),
        kind: d.kind ?? 'generico',
        createdAt: isNonEmpty(d.createdAt) ? d.createdAt : new Date().toISOString(),
    };
}

/**
 * % de conclusão de um plano (RF-13): média PONDERADA do progresso das ações
 * do plano, com peso = `gutScore` (G×U×T, RF-6 — 1..125) de cada ação. Cada
 * ação contribui `gutScore` (peso) × {1 se `verificada`/`concluida`, 0 caso
 * contrário}; `cancelada` é ignorada (não entra nem no numerador nem no
 * denominador). Plano sem ações (ou todas canceladas) = 0.
 *
 * Ponderar por `gutScore` em vez de média simples evita que uma ação trivial
 * (baixa gravidade/urgência/tendência) "valha" o mesmo que uma ação crítica
 * no cronograma consolidado do plano — ex. um PGRS com 1 ação crítica aberta
 * (gutScore alto) e 9 ações triviais concluídas (gutScore baixo) deve
 * reportar conclusão BAIXA, não 90%.
 *
 * @param planId - Id do plano.
 * @param actions - Todas as ações (filtra por `planId`).
 * @returns Fração 0..1 de conclusão ponderada por gutScore.
 */
export function computePlanCompletion(planId: string, actions: Action[]): number {
    const acts = (Array.isArray(actions) ? actions : []).filter(
        (a) => a.planId === planId && a.status !== 'cancelada',
    );
    if (acts.length === 0) return 0;
    const totalWeight = acts.reduce((sum, a) => sum + (a.gutScore || 0), 0);
    // Defesa: se todas as ações tiverem gutScore 0/ausente (não deveria
    // ocorrer — gutScore é derivado de gravity/urgency/trend 1..5, sempre
    // >=1 — mas o núcleo é defensivo contra dados legados/externos),
    // cai para média simples em vez de dividir por zero.
    if (totalWeight <= 0) {
        const done = acts.filter((a) => CLOSED_OK_STATUSES.has(a.status)).length;
        return done / acts.length;
    }
    const doneWeight = acts.reduce(
        (sum, a) => sum + (CLOSED_OK_STATUSES.has(a.status) ? a.gutScore || 0 : 0),
        0,
    );
    return doneWeight / totalWeight;
}

/* ============================================================================
   RF-12/RF-13 — inheritConditionsOnRenewal (A10 — herança na renovação da LO)
   ========================================================================== */

/**
 * Resultado da herança de condicionantes na renovação da LO (A10): o novo
 * `Plan` agrupador + as `Action`s clonadas para o novo ciclo.
 */
export interface RenewalInheritanceResult {
    newPlan: Plan;
    inheritedActions: Action[];
}

/**
 * Clona UMA condicionante para o novo ciclo da LO renovada (helper de
 * {@link inheritConditionsOnRenewal}). Copia os campos 5W2H/GUT/RF-12 que
 * descrevem O QUÊ deve ser monitorado; zera `history`/`evidence` (não
 * passados ao `createAction`, então nascem `[]`); aponta `supersededBy` para
 * o `id` da condicionante antiga e `licenseRenewalId` para a nova licença.
 *
 * @param old - Condicionante do plano antigo a clonar.
 * @param newPlanId - Id do novo `Plan` (destino da clonagem).
 * @param newLicenseNumber - Número/protocolo da LO renovada.
 * @param stamp - Timestamp ISO da renovação (reprodutibilidade em teste).
 * @returns A nova `Action` (novo ciclo, `status:'aberta'`).
 */
function cloneConditionForRenewal(
    old: Action,
    newPlanId: string,
    newLicenseNumber: string,
    stamp: string,
): Action {
    return createAction({
        title: old.title,
        cause: old.cause,
        ...(old.location !== undefined ? { location: old.location } : {}),
        dueDate: old.dueDate,
        responsible: old.responsible,
        ...(old.method !== undefined ? { method: old.method } : {}),
        originType: 'permitCondition',
        ...(old.originRef !== undefined ? { originRef: old.originRef } : {}),
        type: old.type,
        severity: old.severity,
        gravity: old.gravity,
        urgency: old.urgency,
        trend: old.trend,
        ...(old.accountable !== undefined ? { accountable: old.accountable } : {}),
        planId: newPlanId,
        licenseNumber: newLicenseNumber,
        ...(old.regulators !== undefined ? { regulators: old.regulators } : {}),
        ...(old.phase !== undefined ? { phase: old.phase } : {}),
        ...(old.agencyDeadline !== undefined ? { agencyDeadline: old.agencyDeadline } : {}),
        ...(old.proofPeriodicity !== undefined ? { proofPeriodicity: old.proofPeriodicity } : {}),
        ...(old.applicability !== undefined ? { applicability: old.applicability } : {}),
        ...(old.monitoringRegime !== undefined ? { monitoringRegime: old.monitoringRegime } : {}),
        ...(old.odsId !== undefined ? { odsId: old.odsId } : {}),
        ...(old.odsIndicatorKey !== undefined ? { odsIndicatorKey: old.odsIndicatorKey } : {}),
        // Evidência/history do novo ciclo começam vazios (createAction já
        // zera history sempre; evidence só é copiado se explicitamente
        // passado — aqui NÃO passamos `old.evidence`, então fica []).
        supersededBy: old.id,
        licenseRenewalId: newLicenseNumber,
        createdAt: stamp,
    });
}

/**
 * Herda as condicionantes (`Action`s com `originType==='permitCondition'`) de
 * um `Plan` de licença ao renovar a LO (RF-12, ENV-CONDITIONS-001 A10 — §5
 * item 2). `Plan` (agrupador, `kind`) não contém as `Action`s embutidas —
 * elas vivem à parte, ligadas por `planId` (mesmo shape de
 * {@link computePlanCompletion}) — por isso a função recebe `oldPlanActions`
 * explicitamente em vez de só `oldPlan`.
 *
 * Cria um novo `Plan` (`kind:'condicionantes-LO'`, mesmo `name` do antigo) e
 * clona cada condicionante do plano antigo para o novo ciclo via
 * {@link cloneConditionForRenewal} (zera history/evidence, preserva
 * originRef, seta supersededBy/licenseRenewalId — ver doc do helper).
 *
 * Não muta `oldPlanActions`; ações que não são `permitCondition` ou que
 * pertencem a outro `planId` são ignoradas (não clonadas).
 *
 * @param oldPlan - Plano da licença anterior (`kind==='condicionantes-LO'`).
 * @param oldPlanActions - TODAS as ações (o filtro por `planId` é interno).
 * @param newLicenseNumber - Número/protocolo da LO renovada.
 * @param now? - Timestamp ISO opcional (reprodutibilidade em teste).
 * @returns O novo `Plan` + as `Action`s herdadas (novo ciclo).
 */
export function inheritConditionsOnRenewal(
    oldPlan: Plan,
    oldPlanActions: Action[],
    newLicenseNumber: string,
    now?: string,
): RenewalInheritanceResult {
    const stamp = isNonEmpty(now) ? now : new Date().toISOString();
    const newPlan = createPlan({ name: oldPlan.name, kind: 'condicionantes-LO', createdAt: stamp });

    const oldConditions = (Array.isArray(oldPlanActions) ? oldPlanActions : []).filter(
        (a) => a.planId === oldPlan.id && a.originType === 'permitCondition',
    );

    const inheritedActions = oldConditions.map((old) =>
        cloneConditionForRenewal(old, newPlan.id, newLicenseNumber, stamp),
    );

    return { newPlan, inheritedActions };
}

/* ============================================================================
   RF-12 — reviseAction (A14 — versionamento do enunciado)
   ========================================================================== */

/** Campos que, ao mudar, contam como "edição do enunciado" (RF-12, A14). */
export type ReviseActionChanges = Partial<
    Pick<Action, 'title' | 'method' | 'agencyDeadline' | 'cause' | 'dueDate'>
>;

/**
 * Edita o "enunciado" de uma condicionante (RF-12, ENV-CONDITIONS-001 A14 —
 * §5 item 6): o órgão pode alterar o texto/parâmetro/prazo de uma
 * condicionante já existente FORA do fluxo normal de {@link transitionStatus}
 * (que só cobre transições de status, não edição de conteúdo). "Editar o
 * enunciado" = mudar `title`/`method`/`agencyDeadline`/`cause`/`dueDate` —
 * os campos que descrevem O QUÊ deve ser feito e ATÉ QUANDO, não o workflow.
 *
 * Incrementa `revision` (default 0 → 1 na primeira revisão) e registra uma
 * entrada em `history` documentando o que mudou (nota lista os campos
 * alterados de forma legível, ex. `"title: 'A' -> 'B'"`), sem passar pela
 * máquina de estados PDCA (o `status` da ação NÃO muda por uma revisão).
 *
 * Retorna uma NOVA ação (pureza); ignora chaves de `changes` cujo valor seja
 * igual ao atual (não gera entrada de history vazia/redundante). Se nenhum
 * campo mudou de fato, retorna a ação original sem incrementar `revision`.
 *
 * @param action - Ação (condicionante) a revisar.
 * @param changes - Campos alterados do enunciado (subset de `title`/`method`/
 *   `agencyDeadline`/`cause`/`dueDate`).
 * @param at - Timestamp ISO da revisão (reprodutibilidade em teste).
 * @param reason? - Motivo da revisão (ex. "órgão alterou parâmetro do laudo").
 * @param by? - Autor da revisão (rótulo de texto — default `'orgao'`).
 * @returns A ação revisada (`revision` incrementado + entrada no `history`).
 */
export function reviseAction(
    action: Action,
    changes: ReviseActionChanges,
    at: string,
    reason?: string,
    by?: string,
): Action {
    const c = changes ?? {};
    const entries = Object.entries(c) as Array<[keyof ReviseActionChanges, string | undefined]>;
    const changedEntries = entries.filter(
        ([key, value]) => value !== undefined && action[key] !== value,
    );
    if (changedEntries.length === 0) return action;

    const stamp = isNonEmpty(at) ? at : new Date().toISOString();
    const summary = changedEntries
        .map(([key, value]) => `${key}: '${action[key] ?? ''}' -> '${value}'`)
        .join('; ');
    const note = isNonEmpty(reason) ? `Revisão do enunciado (${reason}): ${summary}` : `Revisão do enunciado: ${summary}`;

    const transition: ActionTransition = {
        from: action.status,
        to: action.status, // revisão de enunciado não muda o status (não é PDCA).
        at: stamp,
        by: isNonEmpty(by) ? by : 'orgao',
        note,
    };

    return {
        ...action,
        ...Object.fromEntries(changedEntries),
        revision: (action.revision ?? 0) + 1,
        history: [...action.history, transition],
        updatedAt: stamp,
    };
}
