# ADR — core/hydrology (WATERSHED-FAMILY-001 / R3)

**Status:** Accepted · **Data:** 2026-06-15 · **Autor:** claude - executor
**Spec:** [SPEC_WATERSHED_FAMILY](../../../../../docs/specs/features/SPEC_WATERSHED_FAMILY.md)

## Contexto

A plataforma já cacheia grades de elevação (terreno) mas não derivava nenhuma
informação hidrológica delas. O brief de recomendações de algoritmos (R3) e a
diretiva do Calvin pediram uma família `watershed` (bacia hidrográfica) amarrada
a um algoritmo de hidrologia de terreno. Precisávamos de: direção de escoamento,
acumulação de fluxo e delineação da bacia que drena para um exutório.

## A1 — Algoritmo: D8 + Priority-Flood (não D-infinity nem MFD)

**Decisão:** D8 (O'Callaghan & Mark 1984) para direção de fluxo + Priority-Flood
(Barnes, Lehman & Mulla 2014) para preencher depressões.

**Alternativas:** D-infinity (Tarboton 1997, fluxo fracionado), MFD (multiple
flow direction). **Trade-off:** D8 é o padrão de fato (WhiteboxTools/RichDEM o
suportam), simples, determinístico e suficiente para delineação de bacia. D-inf/MFD
dão fluxo mais suave em encostas mas complicam a delineação discreta. **D8 fica;
D-inf é candidato a F-futuro se a acurácia exigir.**

## A2 — Pure-logic, engine-agnostic (grade em array linear)

**Decisão:** o motor (`_d8FlowPure`, `_watershedPure`) opera sobre `{width, height,
elevation[]}` row-major, sem DOM/THREE/rede. Saídas são `Int8Array`/`Float64Array`/
`Uint8Array` cruas. O render 3D e a UI consomem isso adiante.

**Razão:** testabilidade (cheap tests vs DEM sintético verificável à mão),
reuso e separação core (IP científico) vs utils (UI). Segue o precedente de
`core/geology` (wellMeshSpec engine-agnostic).

## A3 — Priority-Flood vs sinks: preencher, não remover

**Decisão:** depressões são PREENCHIDAS (água transborda pela borda mais baixa),
não tratadas como sumidouros internos. Garante que toda célula interna tenha
caminho até a borda. Flats (áreas planas após preenchimento) são roteados pelo
vizinho de menor cota preenchida (desempate determinístico).

**Limitação conhecida:** o roteamento de flats é simplificado (não usa o gradiente
de "distância ao exutório" de Garbrecht & Martz 1997). Suficiente para DEMs de
sítio; F-futuro pode refinar. Documentado para reprodutibilidade acadêmica.

## A4 — Família ↔ algoritmo via sub-módulo pure-logic (`_watershedBindingPure`)

**Decisão:** a amarração família `watershed` ↔ motor é um módulo pure-logic
(`core/elements/families/watershed/_watershedBindingPure`) que compõe o motor e é
cheap-testado. O `WatershedModule` (FamilyModule, UI) é uma casca fina que consome
o binding. Registro canônico em `familyModuleRegistry.ts` (inline, padrão dos
demais; o `index.ts` paralelo segue o precedente de `fault/`).

**Razão:** mantém a lógica testável fora do DOM; a UI (F2) só renderiza o resultado.

## A5 — Exutório (pour point) em coordenadas de célula

**Decisão:** o ponto de exutório é dado em coordenadas de célula (pourX, pourY)
da grade. A conversão de coordenadas geográficas/cena → célula é responsabilidade
da camada de UI (F2), não do motor.

**Razão:** o motor permanece agnóstico a CRS/projeção; a UI já tem o projetor de
cursor e o picker de mapa para mapear clique → célula.

## Consequências

- ✅ Hidrologia de terreno testável e reprodutível (cheap tests vs DEM sintético).
- ✅ Aproveita grades de elevação já cacheadas (sem dado novo).
- ⚠️ Roteamento de flats simplificado (A3) — refino é F-futuro.
- ⚠️ Render 3D da máscara/talvegue + seleção interativa do exutório = F2 (requer
  validação Pixels-Over-DOM).

## Referências

- O'Callaghan & Mark 1984, "The extraction of drainage networks from digital
  elevation data" (Computer Vision, Graphics, and Image Processing 28).
- Barnes, Lehman & Mulla 2014, "Priority-flood: An optimal depression-filling and
  watershed-labeling algorithm for digital elevation models" (Computers & Geosciences 62).
- Tarboton 1997 (D-infinity, alternativa); Garbrecht & Martz 1997 (flat routing).
