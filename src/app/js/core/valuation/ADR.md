# ADR — core/valuation (SPEC_COST_VALUATION_PROVENANCE_CONSOLIDATION)

**Status:** Fase 2 — fachada entregue; binding EIS + GUM uncertainty pendente (Fase 3).
**Owner:** claude - executor
**Created:** 2026-06-02
**Spec:** [`docs/specs/_archived/SPEC_COST_VALUATION_PROVENANCE_CONSOLIDATION.md`](../../../../../docs/specs/_archived/SPEC_COST_VALUATION_PROVENANCE_CONSOLIDATION.md)

## Contexto

Plano doutorado §iv promete "valoração apoiada na proveniência granular dos
registros TUPLAx". Hoje 4 módulos calculam valores econômicos sem trilha
explícita aos registros-fonte. Esta consolidação fecha o descompasso.

## A1 — Fachada (não merge)

**Decisão:** criar `core/valuation/index.ts` como camada acima dos 4 módulos
existentes, sem alterar/mover nenhum deles.

**Alternativa rejeitada:** mesclar os 4 módulos em um único `core/valuation/`.
Razão da rejeição: preserva histórico Git + testes existentes; reduz risco de
regressão; permite rollback trivial; consumidores legacy não precisam migrar.

**Trade-off:** duplicação leve de tipos. Mitigado por re-export central.

## A2 — Binding de proveniência como invariante

**Decisão:** todo `ValuationResult<T>` carrega `provenance: TuplaRef[]`.
`deriveCostFromGranular()` REJEITA input sem trilha (3 error codes).

**Materializa:** "princípio da integridade ascendente" (§4.1 plano doutorado) —
todo número econômico é auditável até o registro granular que o sustenta.

**Custo:** caller deve fornecer `TuplaRecord[]` com `recordId+ponto+timestamp+atributo`.
Sem trilha = sem valoração legítima na fachada (caller pode chamar módulos
delegados diretamente se aceitar auto-declaração — fachada não força legacy).

## A3 — Procedência científica documentada

**Decisão:** cada `ValuationMethod` aponta DOI/ISBN/norma:

| Method                  | Fonte normativa                                               |
| ----------------------- | ------------------------------------------------------------- |
| `IAS37`                 | IAS 37 / CPC 25 (provisões + passivos contingentes)           |
| `VAA`                   | Valorização de Ativo Ambiental (terra)                        |
| `ecosystem-npv`         | Costanza et al. 1997 (Nature) + Natural Capital Protocol 2016 |
| `remediation-cost`      | ABNT NBR 16434 + CETESB DD 038/2017 + CONAMA 420 Anexo II     |
| `health-cost`           | DALY/QALY × CPI (WHO methodology)                             |
| `crf-vpla`              | Matemática financeira clássica (Hirschfeld)                   |
| `psa-lei14119`          | BRASIL Lei 14.119/2021 (PSA)                                  |
| `pnma-poluidor-pagador` | BRASIL Lei 6.938/1981 art. 4º VII                             |

**Razão:** valoração ambiental sem citação ≠ defensável em qualificação +
viola CLAUDE.md "Academic Context" (implementações IP-protegidas exigem DOI/ISBN).

## A4 — Faixa de incerteza (GUM) — Fase 3

**Decisão:** `ValuationResult.uncertainty` é opcional na Fase 2; obrigatório
em consumidores produção (Fase 3).

**Razão:** valoração ambiental é intrinsecamente incerta (parâmetros de
solver, custos unitários, taxa de desconto). Número pontual seria
cientificamente frágil. GUM Tier 1 (`core/uncertainty`) propaga via
formulação clássica.

**Trade-off:** mais complexidade no consumer code. Mitigado por helper
`wrapValuation(value, { uncertainty })` opcional.

## A5 — Separação de `core/billing`

**Decisão:** fachada NÃO importa de `core/billing` (NFSe, $ECBT, splits).

**Razão:** custo ambiental (passivo/ativo) = domínio científico; custo de
serviço (NFSe, ledger) = domínio comercial. Acoplamento criaria dependência
circular conceitual + dificultaria reuso da fachada por consumidores não-billing
(ex: relatórios técnicos, dashboards de fiscalização).

**Interface limpa:** se billing precisar do valor econômico, importa fachada
de valuation (one-way), não vice-versa.

## Implementação Fase 2 (entregue)

- `_types.ts` — interfaces + 17 entradas frozen catalog + 3 type guards
- `_deriveFromGranularPure.ts` — RF4 pure-logic + error codes
- `index.ts` — fachada com wrapValuation + delegations + aggregateValuations
- `tests/valuation-derive-pure.test.mjs` — 32/32 cheap tests

## Implementação Fase 3 (pendente)

- Binding EIS (`integrity: { eis }`) — extrair score dos registros
- GUM uncertainty range — wrap `core/uncertainty` propagation
- Feature flag `VALUATION_PROVENANCE_FACADE` em `config.ts`
- UI badge proveniência em `utils/ui/costAnalysis`
- i18n `valuation.*` keys (EN/PT/ES)

## Referências

- CLAUDE.md "Academic Context" (provenance acadêmica obrigatória)
- Plano doutorado PPGEMP/USP §4.1 (integridade ascendente) + §iv (valoração)
- IAS 37 / CPC 25 (provisões)
- COSTANZA, R. et al. (1997). _Nature_, 387, 253-260.
- Natural Capital Coalition (2016). Natural Capital Protocol.
- BRASIL. Lei 14.119/2021 — PNPSA.
- BRASIL. Lei 6.938/1981 — PNMA.
- JCGM 100:2008 (GUM) — guia ISO incerteza.
