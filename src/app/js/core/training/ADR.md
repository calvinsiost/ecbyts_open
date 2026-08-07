# ADR — Módulo de Treinamento (LMS) e Ponte PowerPoint → Curso

> Architectural Decision Record do `core/training/`. Cobre o motor de quiz, a
> autoria de cursos e a ponte de importação de PowerPoint (LMS-PPTX-BRIDGE-001).
> Especificações relacionadas: `docs/specs/_archived/SPEC_LMS_PPTX_COURSE_BRIDGE_DONE.md`,
> `docs/specs/features/SPEC_LMS_INTERACTIVE_ASSESSMENT.md` e o guia do usuário
> `docs/guides/POWERPOINT_PARA_CURSO_GUIA.md`.

## Contexto

O módulo de treinamento (LMS) é o e-learning interno do ecbyts: cursos, lições,
quizzes interativos e progresso persistido offline. Boa parte do conteúdo de
treinamento já existe como apresentações `.pptx` (aulas, onboarding regulatório).
Reescrever cada apresentação à mão como curso seria caro e propenso a erro — daí
a ponte LMS-PPTX-BRIDGE: importar um `.pptx` e gerar um rascunho de curso com
fidelidade 1:1 (cada slide vira uma lição).

A lógica pura vive em `core/training/` (algoritmos, sem DOM); o wire de UI vive em
`utils/ui/lmsAuthoringModal.ts` e o IO de browser em
`utils/handlers/pptxCourseImport.ts`.

## A1 — Pure-logic separada do IO de browser (ADR principal)

**Decisão:** a conversão PPTX → curso é dividida em camadas puras testáveis sem
browser, com o IO isolado num único glue handler.

- `_pptxParsePure.ts` — parser OOXML do slide (texto, níveis de bullet, imagens
  via regex), sem ZIP/DOM. Recebe XML cru, devolve slides normalizados.
- `_pptxCoursePure.ts` — recebe slides normalizados e monta um `CourseDraft`
  (1 slide = 1 lição), com modo de legibilidade opcional não-destrutivo e um
  `imageUrlResolver` injetável (a hospedagem de imagem é decidida pelo chamador).
- `utils/handlers/pptxCourseImport.ts` — única camada de IO: descompacta o `.pptx`
  (ZIP `deflate-raw` via `DecompressionStream` nativo, sem dependência externa),
  extrai mídias e chama as funções puras. `readPptxToSlides()` aceita um
  `ArrayBuffer`, então também roda em Node (testável).

**Alternativas consideradas:** (a) biblioteca npm de parsing de PPTX — rejeitada
por trazer dependência pesada e licença a auditar (ver
`docs/INTEGRATION_ROADMAP.md`); (b) parsing no servidor — rejeitado por exigir
upload do arquivo do usuário (privacidade) quando o navegador já descompacta
localmente via API nativa.

**Trade-off:** o parser por regex de OOXML é mais simples e auditável que um
parser XML completo, ao custo de cobrir um subconjunto do formato — suficiente
para texto, bullets, imagens, tabelas e notas, que são o que o fluxo de curso
precisa.

## A2 — Fidelidade 1:1 por padrão; legibilidade é opt-in não-destrutivo

**Decisão:** por padrão, o texto do slide entra integral na lição (fidelidade
1:1) — o usuário revisa, edita e publica. O "modo legibilidade"
(assertion-evidence) é opcional e **não-destrutivo**: nunca descarta conteúdo,
apenas reorganiza a apresentação.

**Racional:** o autor do curso é o dono da verdade pedagógica; a ferramenta não
deve decidir o que cortar. Reescrita automática destrutiva quebraria a
auditabilidade exigida pelo contexto acadêmico (USP) — o curso precisa rastrear
de volta ao slide de origem.

## A3 — Imagens hospedadas no módulo Files; chave .ecbt leve

**Decisão:** ao importar, as imagens dos slides são enviadas ao módulo Files do
app (não embutidas como data-URI gigante no rascunho). Ao exportar como chave
`.ecbt`, `_courseImageHostingPure.ts` mantém a chave leve referenciando os
arquivos hospedados em vez de carregar os bytes.

**Trade-off:** o curso passa a depender do módulo Files para as imagens
(acoplamento), mas evita rascunhos e chaves multi-MB que estourariam
localStorage/IDB e a chave portável.

## A4 — Feature flag com rollback hatch real (LMS_PPTX_IMPORT)

**Decisão:** a ponte é controlada por `CONFIG.FEATURES.LMS_PPTX_IMPORT`
(default `true`, feature madura e em uso). O rollback é **efetivo de ponta a
ponta**, não cosmético: `isPptxImportSupported()` (em
`utils/handlers/pptxCourseImport.ts`) retorna `false` quando a flag está `false`,
e o `lmsAuthoringModal` já consulta essa função antes de qualquer import — então
desligar a flag degrada o botão para no-op silencioso (toast "não suportado") sem
tocar o resto do LMS.

**Racional:** a checagem da flag fica na MESMA função que já checava o suporte do
ambiente (`DecompressionStream`), garantindo um único ponto de verdade. A
checagem é defensiva (`CONFIG?.FEATURES?.LMS_PPTX_IMPORT`): se `CONFIG.FEATURES`
não existir (ambiente de teste), trata como ligada para não quebrar.

**Procedimento de rollback testado:** setar `LMS_PPTX_IMPORT: false` em
`config.ts` → o botão "Importar de PowerPoint" passa a exibir o toast de
indisponibilidade e não dispara a conversão; nenhum outro fluxo do LMS é
afetado.

---

# ADR — Autoria de Curso (COURSE-AUTHORING-001)

> Decisões arquiteturais da autoria de curso no LMS (`_courseAuthoringPure.ts` +
> editor `utils/ui/lmsAuthoringModal.ts` + store `utils/ui/lmsAuthoringStore.ts`).
> Spec: `docs/specs/features/SPEC_LMS_COURSE_AUTHORING.md` §10. As cinco decisões
> abaixo (A1-A5) correspondem 1:1 às decisões A1-A5 da spec.

## Contexto

Até esta feature o LMS só tinha cursos **first-party congelados**
(`TRAINING_CATALOG_SEED` em `lmsContent.ts`, `status: 'published'` fixo): o
usuário consome cursos mas não cria nem edita os seus. A autoria abre essa porta
reusando 100% da engenharia já existente (os 12 tipos de lição, os graders puros,
o player, as tabelas de progresso/certificado). O núcleo é **pure-logic**
(`_courseAuthoringPure`) — sem DOM/IO/THREE — para ser testável isoladamente e
auditável (contexto acadêmico USP).

## A1 — Draft mutável separado do seed frozen

**Decisão:** a entidade autorável é `CourseDraft`/`LessonDraft` — um shape
**mutável/draftável** distinto do `SeedTraining`/`SeedLesson` de `lmsContent.ts`
(que é frozen, `status: 'published'` fixo, estritamente first-party). Todas as
edições (`addLesson`/`removeLesson`/`reorderLesson`/`updateLesson`/
`updateCourseMeta`) são **imutáveis**: retornam um NOVO objeto, nunca mutam a
entrada, recomputando `order` 1..N e `updatedAt`.

**Racional:** separar o conteúdo curado da equipe (confiável, congelado) do
conteúdo do usuário (em rascunho, editável) evita que um curso autorado
contamine o catálogo first-party. A imutabilidade casa com o padrão pure-APIs do
resto de `core/` e habilita undo/redo trivial no editor.

**Trade-off:** dois shapes paralelos (`SeedLesson` vs `LessonDraft`) em vez de um
só — o `LessonDraft` torna todos os campos por-tipo opcionais (preenchidos
conforme o autor avança), enquanto o seed os exige preenchidos.

## A2 — Publish-gate não-compensatório

**Decisão:** `validateCourseForPublish(draft)` é um gate de publicação que coleta
**todos** os erros (não para no primeiro) e só aprova com `errors.length === 0`:
título/descrição não-vazios, ≥1 lição, ids de lição únicos, e cada lição válida
para o **seu tipo** (quiz exige ≥1 pergunta com ≥1 opção correta; video exige
URL; case exige `caseId`; etc.). `transitionCourseStatus(draft, 'publish')` SÓ
publica se o gate passar — caso contrário devolve `ok:false` com os erros e
**não** muda o status.

**Racional:** um curso-lixo (0 lições, quiz sem resposta correta) emitiria
certificado inválido. O gate é **não-compensatório** (um campo bom não compensa
um campo faltante) — mesmo princípio do `_severityPure`/`_integrity` do codebase.
Erros carregam `field` + `code` (machine-readable, i18n-able) para a UI mostrar
por campo.

## A3 — Versionamento imutável (supersession)

**Decisão:** despublicar um curso publicado NÃO o edita in-place — cria uma
**nova versão draft** (`version+1`, `id` com sufixo `@vN`, `status:'draft'`,
`supersededBy:null`) e marca a versão publicada anterior como supersedida
(`supersededBy → id` da nova versão). Espelha `core/compliance/_supersessionPure`
(RF11/ADR A8).

**Racional:** um aluno matriculado num curso publicado continua na versão que
começou — editar embaixo dele quebraria a trilha de aprendizado e a integridade
do certificado já em progresso. Versões imutáveis preservam a auditabilidade.

**Trade-off:** acúmulo de versões (cada despublicar gera uma nova) — mitigado por
arquivamento (A5) das versões antigas.

## A4 — Trust-tier anti-fraude do certificado

**Decisão:** `deriveCourseTrustTier(draft)` deriva o tier do certificado da
**proveniência** do curso: `first_party` → `verified_first_party`;
`user_authored` → `self_attested`. Um curso que o próprio usuário criou E
corrige **não** pode emitir certificado como "verificado" (conflito de interesse:
autor = avaliador). O certificado (B3, `_certHashPure`) carrega o tier; a
UI/servidor rotula o autorado como "autoatestado".

**Racional:** é o blind-spot mais importante (spec §5.3). Sem o tier, qualquer um
criaria um curso trivial e auto-emitiria uma credencial "verificada" — fraude.
`mergeAuthoredIntoCatalog` reforça: em colisão de id, o first-party SEMPRE vence
(um autorado nunca sobrescreve um first-party).

## A5 — Soft-delete + feature flag de rollback

**Decisão (soft-delete):** excluir um curso é `archive` (`status:'archived'`),
nunca hard-delete. Certificados já emitidos são intocáveis; matrículas existentes
preservadas. A state machine tem `archive`/`restore` além de `publish`/`unpublish`.

**Decisão (rollback):** a feature é controlada por
`CONFIG.FEATURES.COURSE_AUTHORING` (default `true`). O rollback é **efetivo de
ponta a ponta** (não cosmético), mesmo precedente da A6/LMS_PPTX_IMPORT:
`isCourseAuthoringEnabled()` (em `utils/ui/lmsAuthoringModal.ts`) consulta a flag
de forma defensiva (`CONFIG?.FEATURES?.COURSE_AUTHORING !== false`). Quando
`false`, há **duas camadas de defesa**: (1) `_injectCreateCourseButton()` em
`lmsManager.ts` não injeta o botão "Criar curso"; (2) `openCourseAuthoringModal()`
degrada para no-op silencioso (toast "em rollout") — cobrindo também chamada
programática/deep-link. O consumo de cursos seed segue 100% intacto.

**Procedimento de rollback testado:** setar `COURSE_AUTHORING: false` em
`config.ts` → o botão "Criar curso" some do painel LMS e o editor não abre;
nenhum outro fluxo do LMS é afetado. Gate gate-proven-non-no-op:
`tests/course-authoring-flag.test.mjs`.
