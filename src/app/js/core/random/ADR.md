# ADR — `core/random/` (Random Model Generation V2 + RANDOM-COV-001)

> **Status:** Active (RANDOM-REBUILD-V2 delivered 2026-04 · RANDOM-COV-001 F1 delivered 2026-06)
> **Atualizado:** 2026-06-19
> **Specs:** [`docs/specs/features/SPEC_RANDOM_MODEL_COVERAGE.md`](../../../../../docs/specs/features/SPEC_RANDOM_MODEL_COVERAGE.md) (RANDOM-COV-001, viva) · `docs/specs/_archived/SPEC_RANDOM_MODULE_REBUILD_V2.md` (histórico)
> **Supersedes:** V1 RANDOM-001 (`SPEC_RANDOM_MODEL_REFACTOR.md`, F1-F7 delivered 2026-04-09)

Este módulo gera o **digital twin sintético** que alimenta o demo e a maioria dos
E2E. Ele é, na prática, um gerador de dados sintéticos para teste — por isso as
decisões da spec viva (RANDOM-COV-001) ancoram-se na literatura de dados
sintéticos, geração procedural determinística e digital twins (ver §A.1/A.2 da
spec). Este ADR documenta primeiro as decisões da expansão RANDOM-COV-001
(seção atual) e preserva, no apêndice histórico, as decisões do rebuild V2
(RANDOM-REBUILD-V2) que continuam vigentes na arquitetura do módulo.

## Contexto

`core/random/` (18 arquivos, ~5.000 LOC) foi reconstruído em V2 (RANDOM-REBUILD-V2)
como uma **state machine pure-logic de 9 fases** (`contracts.ts`:
IDLE→CONTEXT→STRUCTURE→ELEMENTS→OBSERVATIONS→GOVERNANCE→INTERPOLATION→FINALIZED→COMMITTED)
orquestrada por `orchestrator.runRandomOrchestratorV2`, com aleatoriedade e relógio
**injetados** via `runtime.ts` (`globalThis.__ecbytsRandomRuntime`).

---

## Decisões — RANDOM-COV-001 (expansão de cobertura)

### A1 — PRNG único semeado (Mulberry32) é a fundação do determinismo

Toda aleatoriedade do conteúdo passa por `runtimeRandom('model')` → `prng.ts`
(`createSeededRng`, Mulberry32 + seed FNV-1a). Mesmo seed → mesmo modelo.

- **Alternativa rejeitada:** RNG por família/fase. Quebra o replay-hash global e a
  reprodutibilidade (não daria para repetir um bug por seed).
- **Trade-off:** acoplamento ao seed global; aceitável pela reprodutibilidade.
- **Invariante:** gates `random-model-v2.spec.ts` ("fixed-seed replay hash idêntico")
    - `random-orchestrator-parity.spec.ts` ("counter=1"). **Nunca quebrar.**
- **Relógio:** `runtimeNow()` é congelado sob o run (DeterministicDate derivado da
  seed); `realNow()` (via `performance.now()`) é o único relógio real, exclusivo
  para telemetria — nunca para conteúdo.

### A2 — Síntese híbrida (regra + modelo) para realismo

Regras garantem integridade referencial e coerência espacial (poço dentro do
sítio; observação ligada a campanha + parâmetro). A distribuição dos valores deve
ser **ancorada em faixas regulatórias** (VR/VP/VI por matriz), não em `random()*100`.

- **Alternativa rejeitada:** só-regra (concentrações irreais) ou só-modelo (perde
  coerência espacial).
- **Status:** RF-4 entregue — `_concentrationBandsPure.ts`
  (`sampleConcentrationInBand`, bandas reference/prevention/intervention/critical
  ancoradas em VR/VP/VI; teste `tests/random-concentration-bands-pure.test.mjs`).

### A3 — Geração dirigida por cenário (scenario-driven)

Cenários canônicos legíveis ("posto BTEX", "barragem de rejeitos — metais",
"aterro — chorume", "área industrial — solventes") declaram famílias +
contaminantes + matrizes + preset coerentes. Mais interpretável e com melhor
cobertura semântica que geração ad-hoc.

- **Status:** proposto (RANDOM-COV-001 §4.1) — a aba "Cenário" do modal já existe;
  o catálogo declarativo de cenários ainda não foi implementado.

### A4 — CAS por referência, nunca duplicação de tabela

`_casMapPure.ts` resolve `parameterId → CAS` para os contaminantes de substância
única que o gerador emite. Os valores DEVEM coincidir com
`core/chemistry/casDataset.ts` (fonte canônica); o teste
`tests/random-cas-map-pure.test.mjs` cruza cada CAS contra `SUBSTANCE_DATASET`
para impedir drift. Agregados/qualidade-água (TPH/BTEX/VOC/BOD/COD/TSS) → `null`.

- **Motivo:** destrava o motor de risco CETESB (`core/risk/cetesb`) sobre dados
  sintéticos sem duplicar a base toxicológica.

### A5 — E2E por relações metamórficas (problema do oráculo)

Um modelo aleatório não tem "saída correta" única. O E2E afirma **relações
metamórficas** (invariantes entre saídas sob transformação de entrada) em vez de
asserts de valor fixo: mesmo seed → hash idêntico; +contaminação → +passivo →
ECBT Score↓; +`route_flow`/arestas → densidade do grafo varia monotonicamente;
siteSize×2 → bounds ~×2.

- **Referência:** metamorphic testing (Chen et al.); ver RANDOM-COV-001 §6.

## Mapa do código (resumo)

| Camada          | Arquivos                                                                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contrato/estado | `contracts.ts` (state machine + validação), `phaseOrchestrator.ts` (grafo de fases)                                                                                           |
| Determinismo    | `prng.ts` (Mulberry32), `runtime.ts` (injeção rng/now/uuid + `realNow`)                                                                                                       |
| Entrada         | `orchestrator.ts` (`runRandomOrchestratorV2`)                                                                                                                                 |
| Dados           | `constants.ts`, `model-catalog.ts` (PARAMETER/FAMILY), `_casMapPure.ts` (RF-3), `_concentrationBandsPure.ts` (RF-4)                                                           |
| Fases           | `phase-context` → `phase-structure` → `phase-site-elements` (maior) / `phase-elements` → `phase-observations` → `phase-governance` → `phase-interpolation` → `phase-finalize` |
| Score/Radar     | `_fineScenarioGeneratorPure.ts` (passivo FIS), `generators/seedRadar*`                                                                                                        |

Detalhe completo (inventário, padrão de inserção `addElement`, mapeamento RF→arquivo,
trechos úteis) em RANDOM-COV-001 §4.1.

## Consequências

- Qualquer expansão (novas famílias, dados) DEVE semear pelo PRNG injetado e manter
  os gates de determinismo verdes (A1).
- Novos `.ts` no módulo entram em `scripts/ts-migration-map.json` junto com o fonte
  (commit atômico — gate `TSM-09` em `tests/ts-migration-ratchet.test.mjs`).

---

# Apêndice histórico — RANDOM-REBUILD-V2

> Decisões do rebuild que continuam vigentes na arquitetura do módulo. Numeração
> H-A1..H-A5 para não colidir com a seção viva RANDOM-COV-001 acima.

This appendix documents the architectural decisions for the rebuild of the
random model generation pipeline into `core/random/`. It focuses on
the non-obvious choices that future maintainers need to understand
before modifying the module.

## H-A1. Why Mulberry32 + FNV-1a inline instead of `seedrandom` npm / `crypto.getRandomValues()`?

**Decision:** Inline Mulberry32 (50 lines) + FNV-1a hashString (15 lines)
in `prng.js`. Zero runtime dependencies.

**Alternatives considered:**

- `seedrandom` npm package — rejected: adds CDN dependency, triggers
  `cdn-version-drift` lesson (2026-04-11 CodeMirror incident). Our
  project is bundler-less; every CDN import is a fragility point.
- `crypto.getRandomValues()` — rejected: not seedable. The entire point
  of V2's determinism contract is reproducibility, which requires a
  seedable PRNG.
- `Math.random()` — rejected: the problem we're solving. Non-seedable,
  machine-dependent.

**Trade-off accepted:**

- Mulberry32 is NOT cryptographically secure. Random model generation
  is pure simulation (not security tokens), so this is fine. Documented
  explicitly in `prng.js` header comment.
- Distribution quality is "good enough for procedural generation"
  (passes basic uniformity check in `tests/random-prng-determinism.test.mjs`
  with mean ~0.5 ± 0.05 on 5000 samples). Not as good as PCG64 but far
  simpler to inline.

**Test vector pinned:**
`hashString('test') === 0xafd071e5` — this value was computed on
Node 22.14 from our implementation. If any future change to FNV-1a
constants or XOR order breaks this test, the commit must include a
migration note in ADR + LESSONS update.

---

## H-A2. State machine vs simple async sequence?

**Decision:** State machine enforced at runtime via `canTransition()`
from `contracts.js`. 9 states, strict forward-only adjacency.

**Alternatives considered:**

- Simple async sequence (`await phaseContext(); await phaseStructure(); …`)
  — rejected: no runtime enforcement of "no phase mutates future phase
  artifacts". The state machine lets us `Object.freeze(ctx.elements)`
  when transitioning `elements_ready → observations_ready`, preventing
  later phases from stomping earlier work.
- Finite state machine library (xstate, robot) — rejected: overkill for
  9 linear states, adds CDN/npm dependency.

**Trade-off accepted:**

- ~50 lines of state machine boilerplate in `orchestrator.js` + `contracts.js`
  vs zero for async sequence. Worth it for:
    - Debuggability: every transition logged via Reporter
    - Parity test anchoring: intermediate states can be asserted
    - Future resumability: if a phase fails, we know exactly which state
      to restart from (not implemented in V2 but this decision keeps
      the door open)

---

## H-A3. Why keep `randomModelTerrain.js` at `core/elements/` instead of moving to `core/random/phases/`?

**Decision:** Leave `randomModelTerrain.js` (168 lines) where it was
extracted by ARCH-MONO-001 Phase 9a. It becomes a direct dependency
of `phase-context.js` via import path `../../elements/randomModelTerrain.js`.

**Alternatives considered:**

- Move it to `core/random/phases/phase-terrain.js` or `core/random/terrain.js`
  — rejected: would require touching every import site (tests, phase-context,
  possibly randomModel.js) for zero correctness gain. It's a leaf pure-math
  module; physical location doesn't affect behavior.

**Trade-off accepted:**

- Minor inconsistency in the directory tree (terrain helper lives one
  directory over from where it's consumed). Documented here so it
  doesn't look like an accidental mispath.

---

## H-A4. Why barrel re-export for `RANDOM_MODEL_DEFAULTS` in `randomModel.js`?

**Decision:** `randomModel.js` keeps `export { RANDOM_MODEL_DEFAULTS } from '../random/constants.js'`
so the 42+ existing callers (96 preset tests, 34 defaults tests,
internal subfunctions) don't need any edit.

**Alternatives considered:**

- Update all callers to import directly from `core/random/constants.js`
  — rejected: churn ratio is unfavorable (~150 call sites updated for
  an aesthetic improvement). The re-export pattern is the same one
  that worked for `config.js` in ARCH-MONO-001 Phase 2.
- Delete the export and break callers — rejected: violates the "barrel
  preserves APIs" rule validated in ARCH-MONO-001.

**Trade-off accepted:**

- Two sources of truth (constants.js is canonical, randomModel.js is
  re-export). Mitigated by `tests/random-model-defaults.test.mjs`
  integrity check that asserts the re-export exists.

---

## H-A5. Rollout completion and legacy flag removal

**Decision:** `CONFIG.FEATURES.RANDOM_ORCHESTRATOR_V2` defaulted to
`false` through Phase A + B + C, was flipped to `true` for Phase D.1
after parity + E2E gates were green, and was then removed entirely in
Phase D.2 once the cleanup surface was bounded.

**Current status (2026-04-14):** repo-side D.2 is landed. `config.js`
no longer ships the feature flag, `orchestrator.js` no longer exports
the gate helper, and both runtime entrypoints (`boot-random` and
`manual-random`) route straight to `runRandomOrchestratorV2()`.

**Rollback triggers (any one = immediate action):**

1. Any E2E journey in `tests/e2e/random-model-v2.spec.ts` goes red in CI.
2. User report of "black viewport" or "missing elements" within 24h of the cleanup.
3. `tests/e2e/random-orchestrator-parity.spec.ts` goes red.
4. Random run duration regresses >15% vs Phase A baseline.
5. Any parent span in `tests/e2e/scene-hud-journeys.spec.ts` exceeds baseline + 10%.
6. User reports camera not respecting `preserve_boot_camera` policy.

**Rollback procedure after D.2:**

1. Revert the D.2 cleanup commit (bounded to `config.js`, `orchestrator.js`,
   `main/random-boot.js`, and `handlers/elements.js`).
2. Push to main for a normal deploy.
3. Version Gate force-update rolls out within ~1h (meta-tag cache bust).
4. Re-open a bounded rollback gate only if new evidence justifies it.

**Operational metric:**

- Supabase error reports tagged `random`
- Failed E2E runs in CI on main
- User reports on ecbyts.com or www.ecbt.ai

After the cleanup lands, the safety net shifts from a flag to bounded
always-on gates (`tests/random-orchestrator-rollout.test.mjs` +
`tests/random-orchestrator-d2-complete.test.mjs`) plus the parity/E2E
matrix.

---

## Phase A+C.1 delivered 2026-04-11

What landed in the initial commit block:

- `prng.js` — Mulberry32 + FNV-1a hashString + deriveSeed helpers (14 tests)
- `contracts.js` — Phase enum, canTransition state machine, validateScenarioInput (16 tests)
- `reporter.js` — createReporter with phase timings + warnings + back-compat lifecycle array (10 tests)
- `constants.js` — RANDOM_MODEL_DEFAULTS moved from randomModel.js (preserving frozen + all 34 existing tests)
- `ADR.md` — this file

**Test counts after Phase A + C.1:**

- PRNG determinism: 17/17
- Contracts + Reporter: 23/23
- Random model defaults: 38/38 (was 34, +4 new integrity checks for constants.js path)
- Random model audit: 16/16 (untouched)
- Random model calibration: 15/15 (untouched)

**File changes:**

- `app/js/core/elements/randomModel.js`: 3226 → 3160 lines (−66)
- `app/js/core/random/` created with 5 files totaling ~700 lines
- Net code: +634 new lines, but shifted from monolith to small focused modules

**Still to deliver in Phase B/C.2-C.7/D:**

- Ownership cleanup (camera/background single-writer)
- Phase sub-files (`phase-*.js`) — moves `_rm*` functions
- E2E spec `tests/e2e/random-model-v2.spec.ts`
- Feature flag flip + soak + legacy removal
