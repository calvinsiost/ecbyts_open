# ADR — `core/risk/cetesb` (CETESB Risk Assessment)

> **SPEC pai:** `docs/specs/features/SPEC_CETESB_RISK_ASSESSMENT.md` (CETESB-RISK-001)
> **Status:** proposed — implementação Fase 0 em curso
> **Data:** 2026-05-30
> **Autor:** claude-adm

## Contexto

O ecbyts compara observações ambientais apenas contra **VI (Valor de Intervenção, CETESB DD 256/2016)**, mas o relatório CETESB DD 038/2017 IC exige conclusão de Investigação Confirmatória com base em **CMA (Concentração Máxima Aceitável)** derivada de avaliação de risco saúde humana. A DD 103/2007/C/E institui — e a DD 038/2017/C torna obrigatória — a planilha CETESB oficial (v4.00, abril 2026) para esse cálculo.

Calvin enviou (2026-05-30) o material completo: Manual do Usuário PDF 55pp + 4 planilhas `.xlsm` (Residentes Urbanos / Rurais / Trabalhadores Com-Ind / Obra Civil). Este ADR documenta as decisões de implementação do motor pure-logic que reproduz a aritmética dessas planilhas para fechar o gap "RBCA/CMA por receptor" do cluster figuras CETESB.

## Decisões

### A1 — Implementação independente das macros VBA proprietárias

**Decisão:** Portar a **lógica documentada no Manual do Usuário** (públicas: equações, parâmetros, fluxograma); **NÃO copiar** código das macros VBA proprietárias dos `.xlsm`.

**Por quê:** licença AGPL-3.0 do ecbyts incompatível com cópia direta de macros CETESB. O Manual é documento técnico público (disponibilizado no portal CETESB), e as equações nele descritas (Johnson & Ettinger 1991, Domenico 1987, ASTM E 2081-00) são literatura científica primária. Implementação independente cumpre AGPL + cita fontes.

**Alternativas consideradas:**

- (a) Bridge para o `.xlsm` via headless Excel: rejeitada — quebra portabilidade (requer Windows + Office), introduz dependência proprietária.
- (b) Wrapper Python/openpyxl que executa a planilha: rejeitada — macros VBA não rodam via openpyxl; ainda há licença das macros.
- (c) Porta da lógica do Manual + cita Manual+DD+papers: **escolhida**.

### A2 — Catálogos `Object.freeze` para integridade dos dados oficiais

**Decisão:** Bases de dados (`MF_DEFAULTS`, `EXP_DEFAULTS`, `FISQUI`, `FAT_TOX`, `RISK_SCENARIOS`) são `Object.freeze` no módulo, expostos via getters readonly.

**Por quê:**

- RNF-1 (determinismo bit-exato) — qualquer hot-patch acidental nos valores quebraria a parity vs planilha oficial.
- Auditabilidade — sentinel `spreadsheet-parity` (ADR-A5) depende dos valores oficiais estarem imutáveis.
- Pattern já consolidado no ecbyts (ex: `core/validation/globalThresholds`, `core/mca/_csmPure` SOURCE_FAMILIES/RECEPTOR_FAMILIES).

**Override do usuário:** apenas via `RiskAssessmentInput.mfOverrides` (campo opcional, sandboxed na chamada — não muta os defaults).

### A3 — Unidades carimbadas no retorno (`cmaUnit`), não inferidas

**Decisão:** `RiskAssessmentResult.cma` é Float64 puro; `cmaUnit` é string explícita (`'mg/kg'` para solo, `'mg/L'` para água, `'µg/m³'` para ar). UI converte se necessário.

**Por quê:**

- O Manual usa unidades diferentes por matriz (solo em mg/kg, água em mg/L, ar em µg/m³). Hardcodar uma unidade única na API esconderia bugs de conversão.
- Padrão já aplicado em `core/uncertainty` (UNC-STRUCTURAL Fase 2) e `core/eis/eisCalculator` — explicitamente carimbar `unit` evita classe de bugs de conversão silenciosa.

### A4 — Fallback gracioso para SQI sem dados na base

**Decisão:** SQI cujo CAS não está em `FISQUI` ou `FAT_TOX` retorna `{cma: NaN, warnings: ['SQI {cas} sem dados toxicológicos na base CETESB v4.00'], ...}` ao invés de lançar exceção.

**Por quê:**

- O relatório precisa renderizar parcialmente mesmo se 1 contaminante não estiver na base — bloquear o template inteiro por causa de 1 CAS desconhecido é UX ruim.
- Padrão consistente com `core/validation/rules.getThresholds` que retorna `[]` em vez de throw.
- O `cma: NaN` permite que o consumidor renderize "—" ou "N/A" sem ambiguidade vs `cma: 0`.

**Anti-pattern explícito:** NÃO usar `cma: null` (perde type safety em código TS); NÃO usar `cma: -1` (ambíguo vs concentração real); NÃO throw (quebra o render do relatório).

### A5 — Sentinel `spreadsheet-parity` é **bloqueador de release**

**Decisão:** `tests/cetesb-risk-spreadsheet-parity.test.mjs` — 20 SQIs canônicas × 4 cenários receptor = 80 valores de CMA — deve bater valores das planilhas oficiais com tolerância ≤1% antes da feature flag `CETESB_RISK_ASSESSMENT` ser elevada a default `true`.

**Por quê:**

- A confiabilidade legal/regulatória do motor depende disso. Sem parity verificada, qualquer divergência aparece em relatório técnico submetido à CETESB e expõe o cliente.
- Tolerância de 1% absorve diferenças de arredondamento (double vs Excel double) e ordem das operações; divergências >1% são erros reais de implementação ou de catálogo.
- Bloqueador de release significa: implementação pode ser feita, testes podem rodar, mas a flag fica off até o gate verde. Permite progresso incremental sem comprometer produção.

**SQIs canônicas selecionadas para o gate (preliminar — ratificar contra Anexo D do Manual):**

| #   | CAS       | Substância              | Grupo          |
| --- | --------- | ----------------------- | -------------- |
| 1   | 71-43-2   | Benzeno                 | BTEX           |
| 2   | 108-88-3  | Tolueno                 | BTEX           |
| 3   | 100-41-4  | Etilbenzeno             | BTEX           |
| 4   | 1330-20-7 | Xilenos                 | BTEX           |
| 5   | 79-01-6   | Tricloroetileno (TCE)   | Cloroaromático |
| 6   | 127-18-4  | Tetracloroetileno (PCE) | Cloroaromático |
| 7   | 75-09-2   | Diclorometano           | Cloroaromático |
| 8   | 75-01-4   | Cloreto de vinila       | Cloroaromático |
| 9   | 91-20-3   | Naftaleno               | PAH            |
| 10  | 50-32-8   | Benzo(a)pireno          | PAH            |
| 11  | 7440-43-9 | Cádmio                  | Metal          |
| 12  | 7440-50-8 | Cobre                   | Metal          |
| 13  | 7439-92-1 | Chumbo                  | Metal          |
| 14  | 7439-97-6 | Mercúrio                | Metal          |
| 15  | 7440-02-0 | Níquel                  | Metal          |
| 16  | 7440-66-6 | Zinco                   | Metal          |
| 17  | 7440-47-3 | Cromo                   | Metal          |
| 18  | 7440-38-2 | Arsênio                 | Metaloide      |
| 19  | 8001-58-9 | Creosoto                | Misturas       |
| 20  | 8002-05-9 | Petróleo (TPH)          | Misturas       |

### A6 — Bridge EIS T-axis: bônus 0..2 pts via `eisRiskAssessmentBonus`

**Decisão:** A cobertura de avaliação de risco CETESB do modelo bonifica o eixo **T (Transparência)** do framework EIS TCCCA+T, via função pure-logic `eisRiskAssessmentBonus()` em `core/eis/eisRiskAssessmentBonus.ts`, integrada em `computeTFromObservations()` como 3º parâmetro opcional `riskCoverage`.

**Escala calibrada (3 tiers):**

| Cobertura SQIs com CMA computada | Tier           | Bônus T-axis |
| -------------------------------- | -------------- | ------------ |
| ≥80%                             | `complete`     | +2,0 pts     |
| 50%–80%                          | `partial`      | +1,0 pt      |
| <50%                             | `insufficient` | 0            |
| Input inválido / sem SQIs        | `undefined`    | 0            |

**Por quê:** o framework TCCCA+T já bonifica T por radar (público %) e credencial agregada de observações. Avaliação de risco CETESB completa demonstra rigor adicional (CETESB DD 103/2007/C/E + USEPA RAGS Part A 1989) — relatório com CMA computada para ampla cobertura é mais defensível em juízo (CONAMA 420 § Auditabilidade) e justifica recompensa T-axis.

**Composição com bonus existentes (clamp em 5):**

```
T_score = base(credencial 1-5)
        + 0..0.5 (tracedRatio ≥90%)
        + 0..1.0 (radar transparency ratio)
        + 0..2.0 (riskAssessmentBonus tier)
        clamp [0, 5]
```

**Defensivos:** 6 gates anti-input-inválido (null/undefined, totalSqis≤0/negativo, sqisWithCma negativo, NaN/Infinity, coverage>1 clamp). Lazy `require` evita ciclo `eis<->risk` no boot. `Object.freeze` em 5+ retornos preserva imutabilidade pós-cálculo.

**Trade-off aceito:** acoplamento `eis ← risk` (eis depende de risk para o bônus). Mitigado por: (a) lazy require, (b) parâmetro opcional (callers existentes não quebram), (c) defensivos retornam 0 silenciosamente se módulo risk não estiver disponível.

**Rationale auditável:** cada retorno carrega `rationale` human-readable citando "CETESB DD 103/2007 + RAGS Part A" — registro persistido permite review de bônus a posteriori (governança G1 audit trail).

**Implementado:** Sub-5.2.1 (`19f157d4`) + Sub-5.2.2 (`5c8eb7a4`). Sentinels: 23/23 (bonus) + 10/10 (wire) = **33/33 verdes**.

## Consequências

**Positivas:**

- Implementação totalmente testável (cheap tests + sentinel parity).
- Auditável para conformidade CETESB.
- Reutiliza padrões já consolidados (`_csmPure`, `globalThresholds`, kind portátil).
- Funciona offline (sem dependência das macros VBA / Excel / Windows).

**Negativas:**

- Catálogos `FISQUI` / `FAT_TOX` têm que ser **manualmente verificados** vs Anexo D do Manual a cada release v4.0X CETESB (não há feed automático).
- Manutenção: nova versão da planilha CETESB exige bump do `source: 'CETESB DD 103/2007/C/E v4.00'` + rerun do parity gate.
- Custo: ~80h-120h Fase 0+1 (catálogos + motor + parity), depois manutenção ≤8h/ano.

**Riscos mitigados:**

- Risco: divergência silenciosa vs planilha oficial → mitigado por sentinel parity (A5).
- Risco: hot-patch acidental de constantes oficiais → mitigado por Object.freeze (A2).
- Risco: licença AGPL-3.0 vs macros proprietárias → mitigado por implementação independente (A1).
- Risco: SQI desconhecido quebra relatório → mitigado por fallback gracioso (A4).

## Fontes citadas

- CETESB. Manual do Usuário — Planilhas para Avaliação de Risco em Áreas Contaminadas sob Investigação. Companhia Ambiental do Estado de São Paulo, abril 2026. <https://www.cetesb.sp.gov.br/cetesb/qualidade_ambiental/areas_contaminadas/planilhas_para_avaliacao_de_risco>
- CETESB. Decisão de Diretoria n. 103/2007/C/E, de 22 jun. 2007.
- CETESB. Decisão de Diretoria n. 038/2017/C, de 07 fev. 2017.
- Johnson, P. C.; Ettinger, R. A. _Environmental Science & Technology_ v.25 n.8, p.1445–1452, 1991. DOI:10.1021/es00020a013
- Domenico, P. A. _Journal of Hydrology_ v.91 n.1-2, p.49–58, 1987. DOI:10.1016/0022-1694(87)90127-2
- ASTM E 2081-00. _Standard Guide for Risk-Based Corrective Action_. ASTM International, 2001.
- US EPA. Regional Screening Levels (RSL). <https://www.epa.gov/risk/regional-screening-levels-rsls>
- US EPA. Integrated Risk Information System (IRIS). <https://www.epa.gov/iris>
