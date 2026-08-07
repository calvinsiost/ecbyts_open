// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

// ARCH-MONO-001 Phase 2: config split - UNITS/PARAMETERS/CUSTOM_FIELDS/OBSERVATION_VARIABLES
// and DEFAULT_FAMILIES moved to app/js/config/ sub-files. Composed here.
import { UNITS } from './config/units.js';
import { PARAMETERS } from './config/parameters.js';
import { CUSTOM_FIELDS } from './config/customFields.js';
import { OBSERVATION_VARIABLES } from './config/observationVariables.js';
export { DEFAULT_FAMILIES } from './config/families.js';
// URL do projeto Supabase do deploy (supabase-config.js gerado no build) —
// usada só para compor fallback de assets em bucket público; a URL real nunca
// fica hardcoded no fonte (leak-scan supabase-url §2.5). Namespace import
// degrada com graça se o supabase-config for antigo/placeholder.
import * as runtimeConfig from './supabase-config.js';
const RUNTIME_SUPABASE_URL: string =
    typeof (runtimeConfig as { SUPABASE_URL?: unknown }).SUPABASE_URL === 'string' &&
    !/placeholder/.test((runtimeConfig as { SUPABASE_URL: string }).SUPABASE_URL)
        ? (runtimeConfig as { SUPABASE_URL: string }).SUPABASE_URL.replace(/\/+$/, '')
        : '';
/* ================================================================
   CONFIGURACOES DA APLICACAO
   ================================================================

   Este arquivo centraliza todas as configuracoes do ecbyts.
   Separar configuracoes facilita ajustes sem mexer na logica.

   ORGANIZACAO:
   1. CONFIG: Configuracoes gerais (versao, prefixos, cores)
   2. FAMILIES: Registro de tipos de elementos

   ================================================================ */

// ----------------------------------------------------------------
// APP VERSION - localStorage migration
// ----------------------------------------------------------------

/**
 * Versao de dados locais. Incrementar quando houver breaking changes
 * na estrutura de dados do localStorage (Category C: modelo, NN, voxel, etc.).
 * NÃO relacionada a CONFIG.VERSION (que é para chaves ECO1).
 */
export const APP_VERSION = '0.0.3758';

/**
 * Build hash injetado automaticamente pelo workflow auto-version-bump.yml
 * a cada push para main. Em dev local permanece 'dev'.
 * Usado pelo version gate para detectar deploys novos independentemente
 * do cache HTTP (funciona mesmo em Bluehost com LiteSpeed cache agressivo).
 */
export const BUILD_HASH = 'e6be2783';

// ----------------------------------------------------------------
// CONFIGURACOES GERAIS
// ----------------------------------------------------------------

/**
 * Objeto principal de configuracoes.
 * Contem valores que controlam o comportamento da aplicacao.
 */
export const CONFIG = {
    /**
     * Versao atual da aplicacao.
     * Usada na geracao de chaves de exportacao.
     */
    VERSION: '1.0.0',

    /**
     * Versao das chaves com blockchain.
     * ECBT tipo B inclui hash-chain, assinatura digital e Merkle Tree.
     */
    VERSION_BLOCKCHAIN: '1.0.0',

    /**
     * Feature flags para rollout gradual de modulos em desenvolvimento.
     * Default: true para itens estaveis de roadmap, exceto IFC (condicional).
     */
    FEATURES: {
        VALIDATION_PROFILES: true,
        DOMAIN_VALIDATORS: true,
        SPATIAL_HIERARCHY: true,
        ISSUES_3D: true,
        GEOML_MAPS: true,
        BROADCAST_SYNC: true,
        FIRST_JOURNEY_LOADING_TIPS: true,
        FIRST_JOURNEY_IMPORT_ROUTING: true,
        FIRST_JOURNEY_SAVE_STATUS: true,
        FIRST_JOURNEY_TAB_CONFLICT_PROMPT: true,
        ENABLE_DATASTUDIO_ANALYTICS: true,
        EQUIPMENT_HUD_V1: true,
        // Painel Relações UX v2 (RELATIONS-UX-001). LIGADO 2026-06-14 (Calvin
        // "sim" — rollout): badge acionável + legenda não-só-cor + contraste +
        // conexões direcionais + grafo denso colapsado/rotulado + grafo sempre
        // nasce com o MÁXIMO de elementos (modelo completo, selecionado destacado).
        RELATIONS_PANEL_UX_V2: true,
        ADVANCED_GEOREF_ENGINE: false,
        IFC_IMPORT: false,
        INVITE_ONLY: true,
        // Modo Convidado (ECBYTS-OPEN-LOCAL-001 F1, spec §8.1). A flag é o
        // rollback hatch: true = o modo PODE ativar, mas ele só liga de fato
        // quando supabase-config.js é placeholder/ausente (detectGuestMode em
        // main/guestGate.ts) — com config real o comportamento é idêntico ao
        // atual. false = nunca ativa, mesmo com placeholder (behavior privado
        // preservado).
        GUEST_MODE: true,
        // Convites em lote / modo turma (INVITE-BATCH-001). Ligado 2026-06-11:
        // RPC create_batch_invite deployado + aba Turmas no ecbytsadmin (1167511).
        // On: welcome screen mostra mensagens especificas de codigo TURM-.
        INVITE_BATCH: true,
        UNC_STRUCTURAL_V3_EXPORT: false,
        // Reputation & Royalty Cascade (SPEC_REPUTATION_ROYALTY_CASCADE_BUILD).
        // Off: assets tratados como "Standard" sem metadados de lineage/royalty.
        // On: habilita badges de reputação + cálculo de cascata de royalties.
        enable_reputation_engine: false,
        // EIS Drift Alerts admin panel (SPEC_EIS_DRIFT_ALERTS_ADMIN).
        // Off: drift admin button no-ops. On: admin-gated drift dashboard.
        FLAG_EIS_DRIFT_ALERTS_ADMIN: true,
        // Multi-Model Tabs (SPEC_MULTI_MODEL_TABS, item 9.81 do roadmap).
        // Off: app single-model, chaves IDB globais (comportamento legado).
        // On: habilita tab bar, migration one-shot, namespace model:{id}:*.
        // Ligado por Calvin 2026-05-31 — feature pronta (SPEC_MULTI_MODEL_TABS ✅ done 2026-04-20).
        MULTI_MODEL: true,
        // Home Redesign V2 (SPEC_HOME_REDESIGN_3COL, item 9.80 do roadmap).
        // REWRITE 2026-04-16: clean reimplementation, zero DOM mutation.
        HOME_REDESIGN_V2: true,
        // Deep-Link Tools Sharing (SPEC_DEEP_LINK_TOOLS_SHARING, DEEP-LINK-TOOLS-001).
        // Default ON (decisão arquitetural A5): compartilhamento é a feature,
        // flag é rollback hatch — não A/B test. Toggle false suprime applyDeepLink()
        // no boot (URL ?tools=… vira no-op silencioso, ?key= e demais continuam).
        DEEP_LINK_ENABLED: true,
        // HUD card tooltips (HUD-UX-PAIN-DRAIN-001 W2 / F5 da spec-mãe).
        // On: hover/touch/keyboard tooltips nos 6 cards do geo-hud.
        // Off: rollback hatch — initHudCardTooltips() vira no-op.
        HUD_TOOLTIPS: true,
        // Balance badge na statusbar (CBMD-001 F3, claude - ui 2026-06-11).
        // D1 HOMOLOGADA: Calvin 2026-06-11 "1 ligar" (chat claude - ui) — ON.
        BALANCE_BADGE: true,
        // Balance Hub modal (CBMD-001 F4, SPEC_CUSTOMER_BALANCE_METERING_DISPLAY §8).
        // Off restaura o comportamento legacy: badge simples (F3, BALANCE_BADGE)
        // sem Hub. Decisão pura em utils/ui/_balanceHubFlagPure.ts
        // (resolveBalanceHubMode): override de runtime via localStorage
        // 'ecbyts-feature-overrides' (spec §8.2) vence o CONFIG; ausência/valor
        // não-boolean → legacy (default OFF defensivo). É esse override que
        // habilita o Hub em dev/sandbox e nos gates E2E — sem tocar nesta flag.
        //
        // ⚠️ SEGUE false. O flip tem DOIS gates; só um está satisfeito.
        //
        // GATE A — técnico (a11y): ✅ SATISFEITO (CBMD-001-BACKLOG-DOD #13).
        //   Medido 2026-08-06 por axe-core 4.12.1 via Playwright/chromium
        //   (tests/e2e/cbmd-001-balance-a11y-gate.spec.ts; a categoria
        //   Accessibility do Lighthouse é 100% axe-core, então medimos as mesmas
        //   regras direto, escopadas em #balance-badge + #balance-hub-overlay).
        //   Score = 100/100 (66/66 regras WCAG 2.1 AA aplicáveis, 0 violações,
        //   0 violações best-practice) nas 4 superfícies: badge, Hub/Saldos,
        //   Hub/Histórico, Hub/Alertas. Os 3 `incomplete` do axe (color-contrast
        //   em glifos curtos) foram resolvidos à mão com o motor do repo sobre o
        //   fundo composto: 7,10:1 / 9,03:1 / 9,03:1 — todos ≥ 4,5. Evidência:
        //   .runtime/cbmd-a11y/axe-report.json + screenshots.
        //
        // GATE B — jurídico (LGPD): ⛔ PENDENTE — é ele que bloqueia o flip.
        //   docs/specs/arch/SPEC_LGPD_LIA_BALANCE_ALERTS.md §6.3 é explícita:
        //   produção NÃO deve ser ativada antes de (1) revisão jurídica por
        //   advogado externo — a designar, (2) aprovação do controlador — sem
        //   data, (3) designação de DPO — pendente (Calvin é DPO interino desde
        //   2026-06-29). "Para sandbox/dev está OK" — daí o override de runtime.
        //   Ver também CBMD-001-BACKLOG-DOD #5.
        //
        // Portanto: NÃO flipar por ter score de a11y verde. Quem for flipar
        // precisa das 3 aprovações da tabela §6.3 registradas na própria LIA.
        BALANCE_HUB_ENABLED: false,
        // Bars UX Remediation (SPEC_UI_BARS_UX_REMEDIATION / UI-BARS-001).
        // On: statusbar desafogada (de-dup "Pronto", legal colapsado em ⓘ,
        // contraste ≥4.5:1), #toolbar resíduo display:none, rails com aria/tooltip,
        // touch targets ≥24px. Gate operacional = classe `bars-ux-v2` no <body>
        // (index.html); rollback = remover a classe. Auditoria fonte: 0f076c94.
        BARS_UX_V2: true,
        // IP Data Consolidation Remote (SPEC_IP_DATA_CONSOLIDATION_CLI_TO_SUPABASE).
        // Off: app usa APENAS assets locais (camadas geo gitignored faltam
        //      em produção) e consts hardcoded (comportamento legado).
        // On: consumer vectorLayerOverlay Fonte 4 — asset local 404 →
        //     edge ip-data-fetch (JWT + tier gate + signed URL) p/ usuários
        //     logados; anônimo mantém comportamento legado (mediação IP).
        // Ligado 2026-06-11 (claude - novaspec, dono da frente por Calvin
        // "vc será dono dessa frente... seguir com todas as etapas"):
        // backend provado live por scripts/ip-data-remote-smoke.mjs —
        // CORE GO 5/5 + GEO GO 2/2 (signed URL entregando bytes reais).
        // Rollback hatch: flag false → fallback automático ao legado.
        IP_DATA_REMOTE: true,
        // MKT-OWNER-VERIFY-001 (SPEC_MARKETPLACE_PAID_MODEL_OWNER_VERIFICATION).
        // Off (default — aguarda decisões Calvin D1-D4 §15 da spec): UI de
        //   consent no checkout, aviso no card e painel "Minhas Obras"
        //   ocultos. O REGISTRO de licenças no edge library-download grava
        //   independente da flag (dado retroativo valioso — spec §8/ADR A4).
        // On: ativa as superfícies de UI (F1 consent+aviso, F2 painel).
        // Ligada 2026-06-26 (Calvin aprovou: feature pronta — motor F1/F2
        //   testado e validado em pixels; texto LGPD-safe revisado/OK).
        MARKETPLACE_OWNER_VERIFY: true,
        // Training Module LMS (SPEC_TRAINING_MODULE_LMS, reativada 2026-06-13).
        // On (default): módulo e-learning ALCANÇÁVEL — o painel abre com o
        //   catálogo seed (curso de onboarding de conformidade), matrícula +
        //   leitura + quiz + progresso persistido offline (IDB). Sync Supabase
        //   é Fase D. Rollback hatch: flag false → openLmsModule vira toast
        //   "em rollout" e o painel não é alimentado.
        ENABLE_LMS_MODULE: true,
        // LMS-PPTX-BRIDGE-001 (importar .pptx como curso: 1 slide = 1 lição,
        //   imagens enviadas ao módulo Files). On (default): o botão "Importar
        //   de PowerPoint" no editor de cursos descompacta o .pptx e monta o
        //   CourseDraft. Rollback hatch: flag false → isPptxImportSupported()
        //   retorna false, o botão não dispara o import (degrada para no-op
        //   silencioso) e a UI pode ocultar a ação. Spec:
        //   docs/specs/features/SPEC_LMS_PPTX_COURSE_BRIDGE.md §8 Rollback.
        LMS_PPTX_IMPORT: true,
        // COURSE-AUTHORING-001 (autoria de curso no LMS: criar/editar cursos).
        //   On (default): o botão "Criar aula" no cabeçalho do painel LMS abre
        //   o editor (lmsAuthoringModal) — CourseDraft, publish-gate, trust-tier,
        //   versionamento imutável. Rollback hatch EFETIVO (não cosmético):
        //   isCourseAuthoringEnabled() (em utils/ui/lmsAuthoringModal.ts) retorna
        //   false → o botão não é injetado E openCourseAuthoringModal() degrada
        //   para no-op silencioso (toast "em rollout"), sem tocar o resto do LMS
        //   (consumo de cursos seed segue funcionando). Mesmo precedente de
        //   isPptxImportSupported()/LMS_PPTX_IMPORT (ADR A6). Checagem defensiva
        //   (CONFIG?.FEATURES?.COURSE_AUTHORING === false desativa). Spec:
        //   docs/specs/features/SPEC_LMS_COURSE_AUTHORING.md §8 Rollback.
        COURSE_AUTHORING: true,
        // PIPELINE-PACK-CUSTOMIZATION-WORKBENCH.
        // On (default): mostra o painel "O que voce encontrara neste processo",
        // edicao de modulo equivalente, score, auditoria visual e export/import
        // de chave .ecbt dentro do editor de Pipelines. Rollback hatch efetivo:
        // false faz o editor abrir apenas o diagrama nativo legado, sem montar
        // o Workbench novo. A flag existe para expor a UI nova com desligamento
        // seguro por runtime/localStorage, conforme spec do Pipeline Pack.
        PIPELINE_PACK_WORKBENCH: true,
        // GAC-DD38 Normative Coverage (GAC-DD38-NORMATIVE-COVERAGE-001,
        // SPEC_GAC_DD38_NORMATIVE_COVERAGE §11 Rollback). ON (default) —
        // APROVADA por Calvin via ecosystem_registry (status aprovada-pelo-calvin;
        // executado 2026-07-01 por claude-adm): expõe a Base DD-038 no Workbench
        // do Pipeline GAC (secoes normativas, criterios de decisao, checklists).
        // Lastro: score local pipelines.gac-dd38.pdf-coverage 1000/1000, bateria
        // Pipeline/GAC 161/161 verde, 15/15 criterios, 12 templates, 35 checklists,
        // export/import .ecbt sanitizado (spec §16.1). Rollback hatch EFETIVO:
        // false → buildPipelinePackWorkbenchViewModel recebe baseDd038Enabled=false
        // (wire em utils/ui/pipelineEditor.ts) e o painel Base DD-038 degrada para
        // "desativada" SEM tocar o fluxograma GAC nem o Pipeline Pack (spec §11.2).
        GAC_DD38_NORMATIVE_COVERAGE: true,
        // ECBT-CRYPT-001 (SPEC_ECBT_KEY_ENCRYPTION_BY_RADAR_PROFILE §8 Rollback).
        //   Chave ECBT Tipo D = criptografada por perfil de stakeholder do radar
        //   (envelope multi-recipient JWE-style; só perfis autorizados decifram).
        //   Default OFF (decisão da spec §8 + NOT-9): emissão de Tipo D é opt-in
        //   explícito até DoD verde + Calvin aprovar default-flip — NUNCA emitir
        //   silenciosamente. Rollback hatch EFETIVO (não cosmético):
        //   isTypeDEncryptionSupported() (em core/io/typeD.ts) retorna false →
        //   encodeKeyTypeD() lança erro actionable e NÃO produz chave cifrada.
        //   A DECODIFICAÇÃO de Tipo D fica SEMPRE habilitada (spec §8: evitar
        //   bricking de chaves já emitidas). Mesmo precedente de
        //   isPptxImportSupported()/LMS_PPTX_IMPORT.
        ECBT_TYPE_D_ENCRYPTION: false,
        // V3 Phase 1: Hero Launchpad KPIs (EIS/VPL/PDPLU/Conformidade)
        // via Calculator seeds. Default off - rollout incremental.
        // Spec: docs/specs/features/SPEC_HOME_REDESIGN_3COL_V3.md
        LAUNCHPAD_V3_HERO: false,
        LAUNCHPAD_V3_FEED: false,
        LAUNCHPAD_V3_PANELS: false,
        // Integrity aggregate KPI. Gated per ADR-INTEGRITY-001 §Publish
        // Gate: only turns on after academic-peer-review-approved AND
        // field-site-validation-complete. When false, hero shows the
        // three components separately (Compliance% + Signed% + U%).
        // Cheap test in tests/launchpad-v3-decisions.test.mjs blocks
        // hardcoding this flag to true without the gate satisfied.
        LAUNCHPAD_V3_INTEGRITY_AGGREGATE: false,
        // Personal Environment Identity (SPEC_PERSONAL_ENVIRONMENT_IDENTITY)
        PERSONAL_ENVIRONMENT_CARD: true,
        // Project Tab Bar (SPEC_PROJECT_TABS_IMPLEMENTATION Phase 1).
        // Off: sem barra de abas de projeto (comportamento legado).
        // On: barra de abas persistente acima do title-bar, pure-logic via
        //     core/projectTabs/tabRegistry, persistência localStorage Phase 1.
        // DEFAULT ON (Calvin diretiva 2026-05-31 final): app organiza modelos
        // por abas por default. Funcionalidade end-to-end garantida por
        // SPEC_TAB_MODEL_SWITCH_INTEGRATION (8/8 fases entregues).
        PROJECT_TABS: true,
        // Tab Model Switch Integration (TAB-MODEL-SWITCH-001).
        // Default false: keeps legacy tab behavior while snapshot/restore gates
        // finish. Enable with runtime feature-flag override after 175/175 tests
        // and DoD validation.
        TAB_MODEL_SWITCH: false,
        // File Drop Intent Dialog (FILE-DROP-INTENT-001).
        // On (default): drop de arquivo na tela do app ou no painel ecby abre
        //     dialog de intenção — Adicionar a Files? Abrir wizard (tuplas)?
        //     Nada acontece sem confirmação (anti auto-import).
        // Off: rollback hatch — drop no #files-drop-zone volta ao registro
        //     direto legado; tela/ecby deixam de aceitar drop.
        // Spec: docs/specs/features/SPEC_FILE_DROP_INTENT_DIALOG.md
        FILE_DROP_INTENT: true,
        // Surya OCR ingestion engine (ENV-INGEST-SURYA-001, spec §8 Rollback + §14 DoD).
        // Default OFF (anti-regression — spec RF5 + success criterion §1.3): the
        // neuro-symbolic pipeline in core/ingestion/documents/ runs UNCHANGED while
        // this flag is off. The pure gate `shouldRunSurya()` in
        // core/ingestion/documents/surya/_suryaAuditPure.ts reads THIS key and
        // returns { run:false } unless it is STRICTLY === true (missing/undefined/
        // non-boolean → no-run). So the flag IS the rollback hatch: false (or
        // absent) ⇒ Surya wizard opt-in never offered, edge proxy never called,
        // legacy ingestion intact. Flipping true is gated on Calvin D1-D4 (§15)
        // and F3+ wire — keep OFF until then.
        INGESTION_SURYA_ENABLED: false,
        // Model Baseline Compliance Preset (COMPLIANCE-PRESET-001, spec §8 Rollback).
        // Rollback hatch EFETIVO (não cosmético): a flag controla TODA a superfície
        // de UI do preset de conformidade (banner persistente na aba Preset +
        // seletor + modal Detalhes + bindings manager). Quando `false`,
        // initComplianceUi() degrada para no-op silencioso — o módulo não monta,
        // não seleciona o preset default e não registra listeners; o resto do app
        // (cálculos com defaults) segue funcionando sem regressão (spec §8 + N5).
        // DEFAULT ON: spec §15 D4-rev (Calvin 2026-06-11, chat claude-ui) homologou
        // "preset mais restritivo sempre ligado por default". A flag é a alça de
        // rollback (não um A/B test default-OFF) — mesmo precedente de
        // LMS_PPTX_IMPORT / COURSE_AUTHORING (ADR A6). Checagem defensiva:
        // só desliga com `CONFIG?.FEATURES?.COMPLIANCE_PRESET_ENABLED === false`.
        COMPLIANCE_PRESET_ENABLED: true,
        // Plano de Ação Ambiental (ACTION-PLAN-001) — ponte PDCA "achou problema
        // → resolve e comprova". OFF por default (spec §8 Rollback): a FASE 1 é só
        // o núcleo puro + persistência na chave .ecbt; a UI (aba `action-plan` no
        // constellation + botões "Criar ação corretiva") vem na FASE 2 atrás desta
        // flag. Com a flag off, a aba não aparece e nenhum botão de geração é
        // renderizado; a persistência é forward-compat (dados ficam inertes, não
        // apagados). Checagem defensiva: só liga com FEATURES.ACTION_PLAN === true.
        ACTION_PLAN: false,
        // Field metadata wrapper (FIELD-META-001).
        // Off: wrapFieldWithMeta/autoWrapFieldsWithMeta return no-op cleanup.
        FIELD_META_V1: true,
        // Scene LOD (PERF-MASTER-001 S2 - SPEC_PERFORMANCE_PROGRAM §S2).
        // Off (default): mesh tradicional sem swap por distancia (comportamento legado).
        // On: meshFactory envolve mesh em THREE.LOD com niveis HIGH/MEDIUM/LOW/SPRITE
        //     resolvidos de DEFAULT_LOD_CONFIG por familia. Three.js calcula switch
        //     no render loop via lod.update(camera).
        // Rollout incremental - manter off ate validacao em fixture grande.
        SCENE_LOD: false,
        // GHG Protocol Inventory Report (SPEC_GHG_PROTOCOL_INVENTARIO_RESUMO).
        // FINDING-011 (UI/UX Audit 2026-06-04, claude - ui): flip false→true.
        // Calvin diretiva 2026-06-03 "finalizar gwp com verbatim ipcc baixando
        // os pdf dos cadernos todos, dando ao usuário a opção de selecionar
        // qual versão quer utilizar" — implementação completa entregue (AR3
        // TAR + AR4 + AR5 + AR6 verbatim Tables IPCC), seletor de versão no
        // header do painel, deep-link ?tools=ghg-inventory wire. Manter flag
        // off tornava o trabalho inalcançável pelo usuário (silent toast
        // warning + return null). Habilita 8 tabelas oficiais (T1..T8 +
        // capa) + export XLSX/PDF/DOCX + deep-link compartilhamento.
        GHG_INVENTORY_REPORT: true,
        // Originator Lineage Royalty (ORIG-ROY-001). OFF por default: o cascade de
        // royalty de originador é COMPUTADO/previsto mas NÃO credita o ledger real
        // até Calvin habilitar (envolve dinheiro + Stripe payout). On: creditOriginator
        // Royalties move saldo no ecbtLedger.
        ORIGINATOR_ROYALTY: false,
        // Library Community Data Enrichment (SPEC_LIBRARY_COMMUNITY_ENRICHMENT_9_68).
        // On (default): "Suggest Enrichment" button no Inspector + camadas 3D
        //   da comunidade carregam. Off: botão oculto + scene.add das camadas
        //   é pulado (rollback total da UI Must-Have).
        COMMUNITY_ENRICHMENT: true,
        // Readings panel detach/dock context menu (SPEC_READINGS_DETACH_MENU).
        // On (default): right-click on #constellation-hud / readings matrix
        // shows a dedicated "Destacar (flutuante)" / "Encaixar (dock)" item
        // wired to the existing floatConstellation/dockConstellation infra.
        // Off: suppresses the dedicated item (generic panel menu unaffected).
        READINGS_DETACH_MENU: true,
        // Consistency Admin Panel (SPEC_CONSISTENCY_OBSERVABILITY_PROGRAM S2).
        // Off (default): admin modal does not surface the "Consistência do
        //   Sistema" section. On: section renders veredito JSON from
        //   .runtime/consistency-veredict.json (via fetch in dev / inline
        //   payload in production). Rollout requires Visual Quality Gate.
        // Flipped ON 2026-06-09 — UI-first regra Calvin: badge no statusbar
        // (consistencyStatusBadge.ts) + painel completo (consistencyPanel.ts)
        // já wired. Flag controla apenas visibilidade do badge + panel.
        CONSISTENCY_ADMIN_PANEL: true,
        // PERF-CWV-FIELD-001: coleta local de INP/LCP/CLS + Long Animation
        // Frames por rota para gates Playwright. Local-only; nao envia rede.
        PERF_FIELD_WEB_VITALS: true,
        // CONSIST-OBS-001 B4: enforcement de unidade na fronteira de entrada
        // de observação (bot IA ADD_OBSERVATION + wizard de ingestão EDD).
        // 'warn' (default — DECISÃO Calvin 2026-06-11 "opt-in"): número sem
        //   unidade passa com warning agregado + enriquecimento _unitMeta.
        // 'strict' (opt-in): rejeita número nu / unidade fora do catálogo.
        // Promoção a strict-default: reavaliar quando warnings de produção
        // mostrarem volume baixo de imports legados sem unidade.
        UNIT_INPUT_ENFORCEMENT: 'warn',
        // CETESB Risk Assessment motor (SPEC_CETESB_RISK_ASSESSMENT — CETESB-RISK-001).
        // Off (default): API pública core/risk/cetesb existe mas wires de UI
        //   (painel MCA coluna CMA, placeholder {{cmaTable}} no template
        //   AI Report IC) ficam dormantes; chamadas window.* permanecem
        //   funcionais para teste/dev.
        // On: ativa wires visíveis. Promoção a default true bloqueada por
        //   sentinel spreadsheet-parity gate (RF-1.7, 20 SQIs × 4 cenários
        //   ≤1% vs planilhas oficiais CETESB v4.00).
        CETESB_RISK_ASSESSMENT: false,

        // Radar Inverted Openness Monetization (SPEC_RADAR_INVERTED_OPENNESS_MONETIZATION).
        // Off (default): activateRadar consome radar_slot via checkAndConsume para
        //   todo broadcast (comportamento atual uniforme).
        // On: broadcasts com perfil "complete" (families===\'*\' AND sections===\'*\')
        //   E sem slice restritivo BYPASS checkAndConsume (publicação aberta gratuita).
        //   Recortes (include/exclude/redaction/temporal/spatial/billing) seguem
        //   consumindo slot.
        // Verbatim Calvin: "100% de gratuidade para liberação de 100% e pago
        //   apenas se limitar o recorte de publicação."
        // Promoção a default true bloqueada por: Fase 2b (gate flip em manager.ts)
        //   + Fase 3 (edge function server-side autoritativa) — F1 pure-logic
        //   classifier já entregue em core/radar/_invertedMonetizationPure.ts.
        RADAR_INVERTED_MONETIZATION: false,

        // Valuation Provenance Facade (SPEC_COST_VALUATION_PROVENANCE_CONSOLIDATION).
        // Off (default): consumidores legacy chamam os 4 módulos diretamente
        //   (analytics/environmentalLiabilityValuation, impact/impactEstimator,
        //   financial/projectValuation, analytics/economics/costRollup) — sem
        //   binding de proveniência TUPLAx.
        // On: consumidores migram para core/valuation/index.ts (fachada) que
        //   força provenance: TuplaRef[] em todo ValuationResult. Materializa
        //   §4.1 plano doutorado (integridade ascendente — todo número
        //   econômico auditável até registro granular).
        // Promoção a default true bloqueada por: Fase 3 completa (EIS binding
        //   + GUM uncertainty + UI badge + i18n) + migração consumidores legacy
        //   (utils/ui/costAnalysis, relatórios).
        VALUATION_PROVENANCE_FACADE: false,
        // ERP / DRE consolidado (SPEC_ERP_SIMPLE_MODULES_AND_CONSOLIDATED_DRE — ERP-DRE-001).
        // ON POR PADRÃO (Calvin 2026-06-21: "ela deve estar ligada sempre"; validada
        //   em pixels via preview — tabela BR/IFRS/US-GAAP + troca de padrão + drilldown).
        // ON: o PASSIVO do ECBT Score vem da cadeia contábil de partida dobrada
        //   (core/erp/_costEntryAdapterPure → buildLedger → buildIncomeStatement →
        //   toFinancialEntries) — DRE auditável, rastreável até o lançamento, e a aba
        //   DRE fica sempre visível no painel do Score.
        // MUDANÇA DELIBERADA NO SCORE (Calvin escolheu "jeito contábil correto"):
        //   CAPEX passa a ser ATIVO imobilizado (não passivo imediato), então o V_net
        //   muda vs. o legado capex+opex — é o tratamento contábil correto. Diferença
        //   travada pelo sentinel tests/erp-score-onoff-sentinel.test.mjs.
        // OFF (rollback): desligar restaura o caminho legado buildCostRollup() sem
        //   tocar o core. A flag é a única chave de troca de origem.
        ERP_DRE: true,
        // User Chat with LLM Agents (USER-CHAT-LLM-001, SPEC_USER_CHAT_WITH_LLM_AGENTS).
        //   Chat em tempo real entre usuários onde o AGENTE de IA de cada usuário
        //   participa com a identidade do dono, sempre rotulado "Agente de [Nome]".
        //   DEFAULT OFF (spec §8): a feature só liga após validação em pixels +
        //   wire de realtime/RLS deployado. Fase 1 (este flag) entrega só o núcleo
        //   pure-logic (core/chat/_chatModelPure, _chatAgentConsentPure) + schema
        //   SQL (migration 20260621120001_user_chat_llm_agents.sql, NÃO aplicada).
        //   Realtime/UI/wire Supabase = Fase 2. Rollback hatch: flag false → painel
        //   de chat indisponível na UI (quando a Fase 2 existir).
        USER_CHAT_LLM: false,
        // Scenarios — What-If process impact comparator (SCENARIOS-IMPACT-001,
        //   SPEC_SCENARIOS_PROCESS_IMPACT.md §8 Rollback). DEFAULT ON: motor
        //   de álgebra COMPLETO (CFG-01..04 dados reais, CFG-05 subtipos,
        //   CFG-07/08 multi-cenário, CFG-34 tornado, CFG-38 export XLSX/MD).
        //   Ligado em 2026-07-23 (ECBYTS-ENERGY-SCENARIOS-001#4).
        //   Rollback hatch EFETIVO: flag false
        //   → o trigger "Cenários"
        //   NÃO é injetado no header do painel ECBT Score e
        //   openScenarioComparatorPanel fica inalcançável pela UI. Mesmo
        //   precedente do trigger DRE flag-gated (ERP_DRE).
        SCENARIOS: true,
        // TRL / Maturidade tecnológica por cenário (ECBYTS-ENERGY-SCENARIOS-001 #6).
        // ON (default): item "Maturidade TRL" no menu de análises abre o painel
        //   com timeline TRL atual→alvo por rota + critérios de passagem editáveis
        //   (core/scenarios/_trlMaturityPure). View aditiva/read-only sobre
        //   data.trl dos elementos; sem fonte real cai em exemplo ROTULADO (biomassa).
        // OFF (rollback): item do menu avisa via toast e o painel fica inalcançável.
        TRL_MATURITY: true,
        // MRV formal sobre os cenários GHG existentes (ECBYTS-ENERGY-SCENARIOS-001 #7).
        // ON (default): item "MRV (GHG)" no menu de análises abre a LENTE
        //   dado bruto → cálculo → indicador → trilha de auditoria por fonte de
        //   emissão (core/reports/_mrvChainPure) — reusa os MESMOS
        //   emission_sources/observations do inventário GHG Protocol; nenhum
        //   motor novo. Sem fonte real cai em exemplo ROTULADO (biomassa).
        // OFF (rollback): item do menu avisa via toast e o painel fica inalcançável.
        MRV_VIEW: true,
        // Cobertura do Modelo Random v2 (RANDOM-COV-001, SPEC_RANDOM_MODEL_COVERAGE
        // §8 Rollback). DEFAULT OFF no rollout; liga após validação.
        // Off (rollback): o gerador volta ao comportamento pré-F1 — as famílias
        //   dam/pit/route_flow são ignoradas mesmo se selecionadas, observações
        //   NÃO carregam CAS e a concentração-base volta ao range plano min..max
        //   (sem ancoragem nas bandas regulatórias VR/VP/VI).
        // On: RF-1 (dam+pit), RF-2 (route_flow), RF-3 (CAS nas observações) e
        //   RF-4 (bandas VR/VP/VI) ativos. Decisão pura em
        //   core/random/_randomCovFlagPure.ts (resolveRandomCovV2Enabled);
        //   override de teste via runtime.randomCovV2 / options.randomCovV2
        //   (boolean explícito vence o CONFIG).
        RANDOM_COV_V2: false,
        // INSTANT-SHELL-001 (SPEC_INSTANT_SHELL_PROGRESSIVE_BOOT).
        // Default OFF (Calvin approval 2026-06-29): F1-F4 may be built behind this
        // flag; the actual flip to ON is reserved for Calvin's pixel validation.
        // OFF: legacy blocking boot (overlay waits for random model generation).
        // ON: reveal empty 3D shell + menus in ≤2s and generate the demo model in
        //     background with a discreet non-blocking indicator.
        INSTANT_SHELL_BOOT: false,
    },

    /**
     * Remote admin panel (ecbytsadmin) base URL. When set, client
     * fetches runtime feature flags from
     * `${ADMIN_URL}/api/runtime-flags/public` on boot. Empty disables
     * remote fetch (localStorage + URL params still work). Override
     * via localStorage 'ecbyts-admin-url' for per-environment testing.
     */
    ADMIN_URL: '',

    /**
     * Habilita RBAC por tipo de acao (canDo/actionOverrides).
     * Quando false, apenas o papel de area e verificado (comportamento anterior).
     * Quando true, regras podem conter actionOverrides por acao (deny/grant).
     */
    ENABLE_ACTION_RBAC: true,

    /**
     * Habilita o modulo de Organizacoes (Auth Fase 4).
     * Quando false, toda a logica de org e bypassed - zero impacto no app.
     * Quando true, usuarios podem criar orgs, convidar membros, compartilhar workspace.
     */
    ENABLE_ORGS: false,

    /**
     * Nivel de log padrao para o logger (createLogger).
     * Niveis: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT'
     * Override via localStorage: ecbyts-log-level (global) ou ecbyts-log-level:ModuleName (per-module).
     */
    LOG_LEVEL: 'WARN',

    /**
     * Override de nivel por modulo. Keys = PascalCase passado ao createLogger().
     * Ex: { Interpolation: 'DEBUG', Auth: 'ERROR' }
     */
    LOG_LEVELS: {},

    /**
     * Fallback institucional para fluxos admin enquanto o registry remoto
     * (`ecbyts_admin` -> /admin/config) ainda nao esta disponivel.
     */
    PLATFORM_ADMIN_EMAIL_FALLBACK: 'founder@ecbyts.com',

    /**
     * Emails de administradores da plataforma.
     * Fonte definitiva: `ecbyts_admin` / perfis Supabase. O config estatico
     * nao deve expor emails pessoais; testes/dev podem injetar admins em runtime.
     */
    PLATFORM_ADMINS: [],

    /**
     * Prefixo das chaves de exportacao.
     * Todas as chaves comecam com "ECBT." (ex: ECBT.A0000001-PWM-...)
     */
    KEY_PREFIX: 'ECBT',

    /**
     * Versao hex das chaves (7 digitos hex, sem tipo).
     * Tipo (A/B/C) e adicionado pelo encoder conforme formato.
     */
    KEY_VERSION_HEX: '0000001',

    /**
     * Tipos de chave: prefixo hex que identifica o formato.
     * A = simples, B = blockchain, C = comprimido, D = criptografada por perfil radar
     * (SPEC ECBT-CRYPT-001 — envelope encryption multi-recipient JWE-style).
     */
    KEY_TYPES: { SIMPLE: 'A', BLOCKCHAIN: 'B', COMPRESSED: 'C', ENCRYPTED: 'D' },

    /**
     * Configuracoes do modulo Blockchain (opcional).
     * O usuario pode habilitar/desabilitar na exportacao.
     */
    // ----------------------------------------------------------------
    // DATA OWNER - Camada de ownership transferível sobre ECBT
    // Dois modos: off-chain (Supabase, privado) e on-chain (NFT Base L2)
    // ----------------------------------------------------------------
    OWNERSHIP: {
        /** Habilita o módulo de Data Owner no fluxo de exportação. */
        ENABLED: true,

        /** Base L2 Testnet (Sepolia) = 84532; Mainnet = 8453 */
        BASE_CHAIN_ID: 84532,

        /** RPC da rede Base */
        BASE_RPC_URL: 'https://sepolia.base.org',

        /**
         * Endereço do contrato ECBTOwnership (ERC-721) deployado na Base.
         * Deixar vazio ('') desabilita modo público na UI.
         * Preencher após deploy via Remix IDE.
         */
        CONTRACT_ADDRESS: '',

        /** Nome da tabela Supabase para registros off-chain */
        SUPABASE_TABLE: 'ownership_records',

        /** EIP-712 domain — chainId é injetado dinamicamente em runtime */
        EIP712_DOMAIN: {
            name: 'ecbyts Data Ownership',
            version: '1',
        },
    },

    // ----------------------------------------------------------------
    // CURRENCY - $ECBT internal currency system
    // Moeda interna da plataforma. Todas as transacoes sao denominadas
    // em $ECBT e convertidas para fiat no checkout.
    // ----------------------------------------------------------------
    CURRENCY: {
        /** Habilita o sistema $ECBT na UI (wallet, checkout, precos). */
        ENABLED: true,

        /** Peg fixo: 1 $ECBT = PEG_USD dolares americanos. */
        PEG_USD: 0.01,

        /** Unidade interna: 1 $ECBT = MICRO_UNIT microtokens (armazenamento em BIGINT). */
        MICRO_UNIT: 1_000_000,

        /** Moedas fiat suportadas no checkout. */
        SUPPORTED_CURRENCIES: ['BRL', 'USD', 'EUR', 'BTC'],

        /** Tempo de validade da taxa de cambio no checkout (ms). */
        RATE_LOCK_TTL: 10 * 60 * 1000, // 10 minutos

        /** Cache TTL para taxas de cambio (ms). */
        RATES_CACHE_TTL: 5 * 60 * 1000, // 5 minutos

        /** Tabela Supabase de taxas de cambio. */
        RATES_TABLE: 'ecbt_exchange_rates',
    },

    // ----------------------------------------------------------------
    // GEOML - Interpolação clássica automatizada (Fase 1)
    // ----------------------------------------------------------------
    GEOML: {
        /** Auto-trigger ao adicionar/atualizar campanha. Default: false (opt-in). */
        AUTO_TRIGGER: false,
        /** Mínimo de pontos para disparar auto-trigger. */
        AUTO_TRIGGER_MIN_POINTS: 3,
        /** Número de layers verticais para grid 3D (extrusão a partir do grid 2D). */
        ISOSURFACE_LAYERS: 8,
        /** Expoente de decaimento vertical (0 = sem decaimento, 1 = linear, >1 = rápido). */
        ISOSURFACE_DECAY: 0.5,
    },

    // ----------------------------------------------------------------
    // QUALITY TIERS - Niveis de qualidade de renderizacao (Low/Medium/High)
    // Controlam pixelRatio, sombras, e post-processing em runtime.
    // Antialias NAO muda em runtime (opcao do constructor WebGLRenderer).
    // ----------------------------------------------------------------
    QUALITY_TIERS: {
        LOW: { pixelRatio: 1.0, shadows: false, shadowMapType: null, postProcessing: false, maxLabels: 20 },
        MEDIUM: {
            pixelRatio: Math.min((typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1, 1.5),
            shadows: true,
            shadowMapType: 'BasicShadowMap',
            postProcessing: true,
            maxLabels: 40,
        },
        HIGH: {
            pixelRatio: Math.min((typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1, 2),
            shadows: true,
            shadowMapType: 'PCFSoftShadowMap',
            postProcessing: true,
            maxLabels: 80,
        },
    },

    // ----------------------------------------------------------------
    // POST-PROCESSING - EffectComposer pipeline (OutlinePass, etc.)
    // ----------------------------------------------------------------
    POST_PROCESSING: {
        ENABLED: true,
        OUTLINE: true,
    },

    BLOCKCHAIN: {
        /**
         * Se o modulo blockchain esta habilitado por padrao.
         * Quando false, exporta como ECBT tipo A (simples).
         * Quando true, exporta como ECBT tipo B (blockchain com verificacao).
         */
        ENABLED_BY_DEFAULT: false,

        /**
         * Algoritmo de chaves criptograficas.
         * ECDSA P-256 e padrao e seguro.
         */
        KEY_ALGORITHM: {
            name: 'ECDSA',
            namedCurve: 'P-256',
        },

        /**
         * Algoritmo de hash.
         */
        HASH_ALGORITHM: 'SHA-256',

        /**
         * Tamanhos dos campos na chave ECBT blockchain (tipo B).
         */
        FIELD_LENGTHS: {
            KEY_ID: 8, // ID da chave publica (hex)
            PREV_HASH: 12, // Hash da versao anterior (Base64URL)
            MERKLE_ROOT: 16, // Raiz Merkle (Base64URL)
            SIGNATURE: 64, // Assinatura ECDSA (Base64URL)
        },
    },

    /**
     * URLs de modelos GLTF externos para substituicao progressiva das
     * geometrias procedurais. Licenca CC0 (Poly Haven). Sem atribuicao obrigatoria.
     * Formato: GLTF com arquivos separados (.gltf + .bin + texturas).
     * O meshFactory carrega assincronamente (fallback procedural durante a carga).
     */
    GLTF_MODELS: {
        // Tanque de GLP vertical - forma cilindrica adequada para tank family
        // Slug: propane_tank | Poly Haven CC0 | self-hosted (local), Supabase bucket fallback
        tank: {
            primary: '/assets/models/propane_tank.glb',
            // Bucket público do projeto do deploy; null quando o runtime não
            // tem Supabase configurado (meshFactory trata como "sem fallback").
            fallback: RUNTIME_SUPABASE_URL
                ? RUNTIME_SUPABASE_URL + '/storage/v1/object/public/models-3d/propane_tank.glb'
                : null,
        },
    },

    /**
     * Paleta de cores para diferentes elementos 3D.
     * Valores em hexadecimal para uso com Three.js.
     */
    COLORS: {
        /**
         * Cores das plumas de contaminacao por profundidade.
         * Cores mais quentes (vermelho) = mais superficial
         * Cores mais frias (amarelo) = mais profundo
         */
        plume: {
            shallow: 0xff6b6b, // Vermelho - raso (0-15m)
            middle: 0xffa94d, // Laranja - medio (15-40m)
            deep: 0xffd43b, // Amarelo - profundo (40-80m)
        },

        /**
         * Cores para corpos d'agua.
         */
        water: {
            lake: 0x4a90d9, // Azul escuro - lagos
            river: 0x5fa8d3, // Azul claro - rios
        },

        /**
         * Cores das camadas geologicas.
         * Baseadas em cores realistas de cada tipo de solo/rocha.
         */
        geology: {
            topsoil: 0x8b4513, // Marrom - solo superficial
            sand: 0xf4a460, // Bege - areia/cascalho
            clay: 0x708090, // Cinza - argila
            sandstone: 0xdeb887, // Bege claro - arenito
            shale: 0x2f4f4f, // Cinza escuro - folhelho
            limestone: 0xd3d3d3, // Cinza claro - calcario
        },
    },

    /**
     * Definicao das camadas estratigraficas (geologicas).
     * Cada camada tem:
     * - id: identificador unico
     * - name: nome para exibicao
     * - top: profundidade do topo (negativo = abaixo do solo)
     * - bottom: profundidade da base
     * - color: cor em hexadecimal
     */
    STRATA: [
        {
            id: 'topsoil',
            name: 'Topsoil', // Solo superficial
            top: 0,
            bottom: -3,
            color: 0x8b4513,
        },
        {
            id: 'sand',
            name: 'Sand/Gravel', // Areia e cascalho (aquifero)
            top: -3,
            bottom: -15,
            color: 0xf4a460,
        },
        {
            id: 'clay',
            name: 'Clay', // Argila (aquitarde)
            top: -15,
            bottom: -19,
            color: 0x708090,
        },
        {
            id: 'sandstone',
            name: 'Sandstone', // Arenito (aquifero)
            top: -19,
            bottom: -40,
            color: 0xdeb887,
        },
        {
            id: 'shale',
            name: 'Shale', // Folhelho (aquitarde)
            top: -40,
            bottom: -45,
            color: 0x2f4f4f,
        },
        {
            id: 'limestone',
            name: 'Limestone', // Calcario (aquifero carstico)
            top: -45,
            bottom: -80,
            color: 0xd3d3d3,
        },
    ],

    /**
     * Catálogo de unidades disponíveis.
     * type: 'SI' para Sistema Internacional, 'custom' para personalizadas
     * dimension: categoria dimensional para conversão
     * toBase: multiplicador para converter para unidade base da dimensão
     * offset: offset para conversões (ex: temperatura)
     */
    UNITS,

    /**
     * Catálogo de parâmetros de medição.
     * Cada parâmetro tem uma unidade padrão e campos customizados associados.
     */
    PARAMETERS,

    /**
     * Campos customizados que podem ser associados a parâmetros.
     * Aparecem dinamicamente baseado no parâmetro selecionado.
     */
    CUSTOM_FIELDS,

    /**
     * Observation variables - metadata about the sample/measurement context.
     * Variaveis de observacao descrevem contexto da amostra (matriz, fracao, etc.).
     * Usuarios podem adicionar variaveis customizadas alem das predefinidas.
     *
     * type: 'boolean' (0/1 checkbox), 'select' (dropdown), 'text' (free input)
     * group: agrupamento visual (matrix, sampling)
     */
    OBSERVATION_VARIABLES,
};

// ----------------------------------------------------------------
// REGISTRO DE FAMILIAS DE ELEMENTOS
// ----------------------------------------------------------------

/**
 * Categorias de constantes definidas pelo usuario.
 * Cada entrada tem um id (interno) e uma labelKey (chave i18n).
 */
export const CONSTANT_CATEGORIES = [
    { id: 'emission', labelKey: 'emissionFactor' },
    { id: 'uncertainty', labelKey: 'uncertaintyFactor' },
    { id: 'equipment', labelKey: 'equipmentPrecision' },
    { id: 'conversion', labelKey: 'conversionFactor' },
    { id: 'custom', labelKey: 'customConstant' },
];

// Injeta no CONFIG para acesso via window
(CONFIG as any).CONSTANT_CATEGORIES = CONSTANT_CATEGORIES;

// DEFAULT_FAMILIES re-exported at top from './config/families.js'.
