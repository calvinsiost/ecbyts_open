// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * flowStatusHelpers.ts - Pure logic for the Actions "where are we in the flow"
 * status stepper (5 fixed blocks: input, processamento, validacao, relatorio,
 * comunicacao).
 *
 * ACTIONS-FLOW-001 FS-1 (claude-adm 2026-07-02).
 *
 * EN: PURE LOGIC, no DOM, no network, no module state — mirrors the DI pattern
 *     of homeCompletenessHelpers.ts/homeSuggested.ts. `computeFlowStatus(deps)`
 *     derives the `input` block from the existing `computeCompleteness(deps)`
 *     engine (real signal, not a proxy) and applies a dependency rule to the
 *     4 downstream blocks: a block is `bloqueado` unless its upstream neighbor
 *     is `concluido`, in which case it defaults to `em_andamento` (conservative
 *     default) until a real per-stage signal is wired (`getPipelineRuns`,
 *     `getResolvedFindings`, `getExports`, `getShares` — all optional DI hooks,
 *     `undefined` return = "no signal yet"). Also implements the regression
 *     rule from spec §5.2: if an upstream block stops being `concluido`, every
 *     downstream block must fall back to `bloqueado`/`nao_iniciado` — never
 *     stay "green" over an invalidated upstream stage.
 *
 * PT (leigo): calcula o estado dos 5 blocos do fluxograma "onde estamos" da
 *     aba Actions. O bloco INPUT usa o mesmo motor de completude que já existe
 *     (não é um chute). Os outros 4 blocos, nesta atividade, só sabem a regra
 *     de dependência (bloqueado se o anterior não estiver concluído); os
 *     sinais reais de cada etapa entram via os hooks opcionais quando existir
 *     uma fonte honesta (ver FS-2 abaixo). Se uma etapa anterior "regride"
 *     (deixa de estar concluída), as etapas seguintes voltam a ficar
 *     bloqueadas — nunca ficam "verdes" em cima de algo que mudou.
 *
 * FS-2 (claude-adm 2026-07-02) — investigação de sinais reais por etapa
 * (spec §5.1/§6, ver subsistemas apontados em §2): resultado é 1 sinal real
 * (RELATORIO) + 3 lacunas honestas documentadas (PROCESSAMENTO, VALIDACAO,
 * COMUNICACAO não têm hoje uma fonte persistida e síncrona acessível):
 *
 * - PROCESSAMENTO — `core/simulation/executor.ts::executeSimulation` roda o
 *   solver e retorna `{model, channel, elapsedMs, signature}` na hora, mas
 *   NÃO persiste nenhum registro de "última simulação rodada" em nenhum
 *   store/módulo (nem module-state, nem IDB/localStorage). Sem um marcador
 *   persistido hoje, `getPipelineRuns` fica sem fonte honesta — inventar um
 *   novo mecanismo de persistência é escopo maior (fora desta atividade).
 *   `getPipelineRuns` continua opcional/`undefined` (default conservador).
 * - VALIDACAO — `core/audit/investigationQuality.ts` (+ `greenwashing.ts`,
 *   `benford.ts`) só expõe funções puras que RECALCULAM findings a partir do
 *   modelo a cada chamada; não existe um store de findings com status
 *   resolvido/pendente (o `core/issues/manager.ts` tem status `open`/
 *   `resolved`, mas é o domínio de issues/bounty do usuário, não de achados
 *   de auditoria ambiental — usá-lo seria um proxy enganoso de domínio
 *   errado). `core/io/validator.ts` valida o payload ECBT no import, não os
 *   achados de investigação. Sem fonte honesta hoje — `getResolvedFindings`
 *   continua opcional/`undefined`.
 * - RELATORIO — SINAL REAL IMPLEMENTADO. `utils/report/manager.ts::
 *   getAllReports()` é síncrono e lê o store de relatórios persistido em IDB
 *   (`STORAGE_KEY = 'ecbyts-reports'`); cada item tem `{title, content,
 *   lastModified}`. `hasGeneratedReportContent(reports)` (abaixo) decide, de
 *   forma pura, se algum relatório tem conteúdo real preenchido (mesmo
 *   critério honesto já usado por `exportReport()`/`exportActiveReportEcbt`
 *   no próprio manager: `title || content` não vazio) — quem fizer o wiring
 *   (fora deste escopo — módulo com efeitos) passa
 *   `getExports: () => hasGeneratedReportContent(getAllReports())`.
 * - COMUNICACAO — `core/notifications/*` é o motor de notificações IN-APP
 *   recebidas pelo usuário (domínio errado: não é "eu compartilhei o
 *   relatório"). `utils/cloud/manager.ts::shareModel`/`getSharedModels` é o
 *   único mecanismo real de compartilhamento, mas é assíncrono, requer
 *   cliente Supabase autenticado, e `getSharedModels()` lista o que foi
 *   compartilhado COM o usuário — não o que o usuário compartilhou. Não há
 *   hoje uma função síncrona e honesta compatível com `() => boolean` — sem
 *   fonte honesta, `getShares` continua opcional/`undefined`.
 */

import { computeCompleteness, type CompletenessGap } from './homeCompletenessHelpers.js';

/**
 * `homeCompletenessHelpers.ts` keeps its `ModelElement`/`CompletenessDeps`
 * shapes private (not exported) — reuse them structurally via
 * `Parameters<typeof computeCompleteness>` instead of duplicating the shape
 * here, so the two files can never drift apart silently.
 */
type _CompletenessDeps = Parameters<typeof computeCompleteness>[0];
type _GetElements = NonNullable<NonNullable<_CompletenessDeps>['getElements']>;
type _GetCampaigns = NonNullable<NonNullable<_CompletenessDeps>['getCampaigns']>;

/** Estado fechado de um bloco do fluxograma (evita falso-verde — spec §3). */
export type FlowBlockState = 'nao_iniciado' | 'em_andamento' | 'concluido' | 'pendencia' | 'bloqueado';

/** Um bloco do fluxograma linear de 5 etapas. */
export interface FlowBlock {
    /** Identificador estável do bloco (uma das 5 etapas fixas). */
    id: 'input' | 'processamento' | 'validacao' | 'relatorio' | 'comunicacao';
    /** Rótulo curto para exibição (i18n fica a cargo do chamador — FS-7). */
    label: string;
    /** Estado atual do bloco. */
    state: FlowBlockState;
    /** Texto de status (copy por tempo verbal — ver spec §4). */
    statusText: string;
    /** Lacunas acionáveis associadas ao bloco (rollup, não 1 bloco por gap). */
    gaps: CompletenessGap[];
    /** Handler CSP-safe para o clique acionável do bloco (FS-5), se houver. */
    handler?: string;
}

/**
 * Dependências injetadas para `computeFlowStatus`. As de PROCESSAMENTO em
 * diante são opcionais e retornam `undefined` quando ainda não há sinal real
 * (FS-2 as implementa); até lá o default conservador de dependência decide.
 */
export interface FlowStatusDeps {
    /** Elementos do modelo (repassado a `computeCompleteness`). */
    getElements?: _GetElements;
    /** Campanhas do modelo (repassado a `computeCompleteness`). */
    getCampaigns?: _GetCampaigns;
    /** Tradutor i18n (repassado a `computeCompleteness`). */
    t?: (key: string) => string;
    /**
     * Sinal real do bloco PROCESSAMENTO (FS-2). `true` = concluído,
     * `false` = ainda não, `undefined` = sem sinal ainda (default conservador).
     */
    getPipelineRuns?: () => boolean | undefined;
    /**
     * Sinal real do bloco VALIDACAO (FS-2). Mesma convenção acima.
     *
     * SEM FONTE HONESTA HOJE: não existe um store persistido de findings de
     * auditoria/investigação com status resolvido/pendente (ver nota FS-2 no
     * topo do arquivo). Continua `undefined` até existir uma fonte real.
     */
    getResolvedFindings?: () => boolean | undefined;
    /**
     * Sinal real do bloco RELATORIO (FS-2). Mesma convenção acima.
     *
     * FONTE REAL DISPONÍVEL: `hasGeneratedReportContent(getAllReports())`,
     * onde `getAllReports` vem de `utils/report/manager.ts` (store IDB
     * síncrono). Quem instanciar `computeFlowStatus` fora deste módulo pode
     * passar `() => hasGeneratedReportContent(getAllReports())`.
     */
    getExports?: () => boolean | undefined;
    /**
     * Sinal real do bloco COMUNICACAO (FS-2). Mesma convenção acima.
     *
     * SEM FONTE HONESTA HOJE: o único mecanismo real de compartilhamento
     * (`utils/cloud/manager.ts::shareModel`/`getSharedModels`) é assíncrono,
     * requer autenticação cloud, e lista compartilhamentos recebidos — não
     * enviados (ver nota FS-2 no topo do arquivo). Continua `undefined` até
     * existir uma fonte real síncrona.
     */
    getShares?: () => boolean | undefined;
}

/** Formato mínimo de um relatório do store de `utils/report/manager.ts`,
 * suficiente para decidir se há conteúdo real gerado (ver `hasGeneratedReportContent`). */
export interface ReportLike {
    title?: string;
    content?: string;
}

/**
 * Decide, de forma pura, se existe evidência real de relatório gerado: pelo
 * menos um item da lista com `title` ou `content` não vazio (mesmo critério
 * honesto já usado por `exportReport()` em `utils/report/manager.ts` — não é
 * um proxy novo, é a mesma regra da fonte real).
 *
 * @param reports Snapshot de `getAllReports()` (ou equivalente), injetado
 *     pelo chamador — este módulo não importa `utils/report/manager.ts`
 *     diretamente (módulo com estado/efeitos, fora do escopo pure-logic).
 */
export function hasGeneratedReportContent(reports: ReportLike[] | null | undefined): boolean {
    if (!Array.isArray(reports)) return false;
    return reports.some((r) => Boolean(r?.title?.trim()) || Boolean(r?.content?.trim()));
}

/** Resultado de `computeFlowStatus`: os 5 blocos na ordem do fluxo. */
export interface FlowStatusResult {
    blocks: FlowBlock[];
}

/** Chaves i18n para os rótulos dos 5 blocos (FS-7 — copy por tempo verbal). */
const BLOCK_LABEL_KEYS: Record<FlowBlock['id'], string> = {
    input: 'flowBlock.input',
    processamento: 'flowBlock.processamento',
    validacao: 'flowBlock.validacao',
    relatorio: 'flowBlock.relatorio',
    comunicacao: 'flowBlock.comunicacao',
};

const _identityT = (key: string): string => key;

/** Resolve o rótulo de um bloco via i18n `t()` com fallback para a chave. */
function _blockLabel(id: FlowBlock['id'], t: (key: string) => string): string {
    return t(BLOCK_LABEL_KEYS[id]) || id;
}

/**
 * Deriva o estado do bloco INPUT a partir do resultado real de
 * `computeCompleteness` (não é proxy — spec DoD item 2).
 *
 * Regras (spec §6 FS-1):
 * - 0 elementos (gap `no-elements`) → `nao_iniciado`.
 * - com elementos e sem gaps de dados → `concluido`.
 * - com elementos e gap `missing-coords`/`single-campaign` → `pendencia`.
 * - com elementos e outros gaps (ex.: sem observações) → também `pendencia`
 *   (qualquer gap acionável além do estado vazio inicial vira pendência).
 *
 * @param deps Dependências repassadas a `computeCompleteness`.
 */
function _computeInputBlock(deps: FlowStatusDeps): FlowBlock {
    const t = typeof deps.t === 'function' ? deps.t : _identityT;
    const check = computeCompleteness({
        ...(deps.getElements ? { getElements: deps.getElements } : {}),
        ...(deps.getCampaigns ? { getCampaigns: deps.getCampaigns } : {}),
        ...(deps.t ? { t: deps.t } : {}),
    });

    const hasNoElementsGap = check.gaps.some((g) => g.id === 'no-elements');
    let state: FlowBlockState;
    let statusText: string;

    if (hasNoElementsGap) {
        state = 'nao_iniciado';
        statusText = t('flowBlock.input.nao_iniciado') || 'Not started: import your first data';
    } else if (check.gaps.length === 0) {
        state = 'concluido';
        statusText = t('flowBlock.input.concluido') || 'Input data complete';
    } else {
        state = 'pendencia';
        statusText = check.gaps[0]?.msg ?? (t('flowBlock.input.pendencia') || 'Input with pending items');
    }

    const handler = check.gaps[0]?.handler;
    return {
        id: 'input',
        label: _blockLabel('input', t),
        state,
        statusText,
        gaps: check.gaps,
        ...(handler ? { handler } : {}),
    };
}

/**
 * Resolve o estado de um bloco a jusante (PROCESSAMENTO..COMUNICACAO) que
 * ainda não tem sinal real próprio (FS-2 os adiciona depois).
 *
 * Regra de dependência (spec §6 FS-2 / DoD): `bloqueado` se o bloco anterior
 * não estiver `concluido`; se o anterior está `concluido`, default
 * conservador `em_andamento` (nunca assume `concluido` sem sinal positivo —
 * evita falso-verde por ausência, padrão catalogado na memória do time).
 *
 * @param id Identificador do bloco a resolver.
 * @param upstreamState Estado do bloco imediatamente anterior no fluxo.
 * @param signal Sinal real opcional (`true`/`false`/`undefined`) vindo de DI.
 */
function _resolveDownstreamBlock(
    id: FlowBlock['id'],
    upstreamState: FlowBlockState,
    signal: boolean | undefined,
    t: (key: string) => string = _identityT,
): FlowBlock {
    const label = _blockLabel(id, t);

    if (upstreamState !== 'concluido') {
        return {
            id,
            label,
            state: 'bloqueado',
            statusText: t('flowBlock.status.bloqueado') || 'Blocked: complete the previous step',
            gaps: [],
        };
    }

    if (signal === true) {
        return {
            id,
            label,
            state: 'concluido',
            statusText: t(`flowBlock.${id}.concluido`) || `${label} completed`,
            gaps: [],
        };
    }
    if (signal === false) {
        return {
            id,
            label,
            state: 'em_andamento',
            statusText: t(`flowBlock.${id}.em_andamento`) || `${label} in progress`,
            gaps: [],
        };
    }

    // signal === undefined: sem sinal ainda (FS-2 não implementado para este
    // bloco) — default conservador, etapa anterior liberou o caminho.
    return {
        id,
        label,
        state: 'em_andamento',
        statusText: t(`flowBlock.${id}.em_andamento`) || `${label} in progress`,
        gaps: [],
    };
}

/**
 * Calcula o estado dos 5 blocos fixos do fluxograma da aba Actions:
 * `input` -> `processamento` -> `validacao` -> `relatorio` -> `comunicacao`.
 *
 * Implementa a regra de REGRESSÃO (spec §5.2): como cada bloco a jusante é
 * recalculado a partir do estado JÁ RESOLVIDO do bloco anterior nesta mesma
 * chamada (não de um cache), se o bloco upstream regredir de `concluido`
 * para qualquer outro estado, todos os blocos a jusante automaticamente
 * recomputam para `bloqueado` — nunca ficam "verdes" sobre uma etapa
 * invalidada. Chamar esta função novamente após qualquer mudança no modelo
 * (import, nova campanha, reprocessamento) é o suficiente para refletir a
 * regressão; não há estado próprio guardado entre chamadas.
 *
 * @param deps Dependências injetadas (ver `FlowStatusDeps`).
 */
export function computeFlowStatus(deps: FlowStatusDeps = {}): FlowStatusResult {
    const t = typeof deps.t === 'function' ? deps.t : _identityT;
    const inputBlock = _computeInputBlock(deps);
    const processamentoBlock = _resolveDownstreamBlock(
        'processamento',
        inputBlock.state,
        deps.getPipelineRuns?.(),
        t,
    );
    const validacaoBlock = _resolveDownstreamBlock(
        'validacao',
        processamentoBlock.state,
        deps.getResolvedFindings?.(),
        t,
    );
    const relatorioBlock = _resolveDownstreamBlock(
        'relatorio',
        validacaoBlock.state,
        deps.getExports?.(),
        t,
    );
    const comunicacaoBlock = _resolveDownstreamBlock(
        'comunicacao',
        relatorioBlock.state,
        deps.getShares?.(),
        t,
    );

    return {
        blocks: [inputBlock, processamentoBlock, validacaoBlock, relatorioBlock, comunicacaoBlock],
    };
}
