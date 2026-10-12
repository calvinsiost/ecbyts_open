# ecbyts — Open Architecture for Trusted Environmental and Occupational Digital Twins

[![License: AGPL-3.0-only](https://img.shields.io/badge/License-AGPL--3.0--only-success)](./LICENSE)

**ecbyts** is an open-source platform for environmental and occupational
digital twins. It models monitoring campaigns (wells, boundaries, sensors,
observations) as a 3D scene in the browser, encodes every model into a
portable, verifiable **ECBT key** (formats A/B/C — simple, blockchain-chained,
compressed), and ships the scientific core (ODS/SDG indicators, HITL scoring,
metrological uncertainty) as citable, testable modules.

This public repository runs entirely **without a backend** — see
[Guest Mode](#guest-mode-what-works-without-a-backend) below.

> ### ⚠️ Beta — expect rough edges, and please report them
>
> ecbyts is under **active development and open beta testing**. Features may
> change, and you will find bugs. That is expected at this stage — and finding
> them is genuinely useful.
>
> **Report a bug:**
>
> - **In the app** — "More" → **Report a bug**, which captures the technical
>   context automatically (fastest and most useful for us)
> - **On GitHub** — open an [issue](https://github.com/calvinsiost/ecbyts_open/issues)
>   describing what you did, what you expected and what happened
>
> Reports are triaged and fixed as soon as possible. For security
> vulnerabilities, do **not** open a public issue — follow
> [SECURITY.md](./SECURITY.md) instead.

## Prerequisites

- **Node.js 22.14+** (pinned in [.nvmrc](./.nvmrc); `nvm use` picks it up)
- **Git**

## Quick start (clone → install → build → run)

```bash
git clone https://github.com/calvinsiost/ecbyts_open
cd ecbyts_open
npm install
npm run build     # REQUIRED before the first start — compiles src/ to app/js/
npm start         # serves the app on http://localhost:4000
```

Then open **http://localhost:4000** in an evergreen browser.

> The build step is mandatory: `app/js/` is generated output and is not
> committed. If you skip it, the app shows an `ERR_BUILD_MISSING` screen
> telling you to run `npm run build`.

## Guest Mode — what works without a backend

The app boots in **Guest Mode** (persistent banner) when the Supabase
config is a placeholder — which is always the case in this repository.

**Works fully offline/local:**

- 3D scene: create/edit elements (wells, boundaries, buildings, tanks, …)
- Observations, campaigns, families, hierarchy and the data panels
- ECBT key export/import (formats A/B/C) — your whole model in one string
- Bundled demo dataset — see [Demo dataset](#demo-dataset) below
- Local persistence only (IndexedDB / localStorage in your browser)

**Needs a backend (disabled by design in Guest Mode):**

- Login / accounts / sync between devices
- AI features (LLM chat, smart import, AI voice)
- Any `/api/*` server feature — the UI shows a notice instead of failing

There is intentionally **no instruction here for wiring your own backend**;
that path is planned, not shipped — see [docs/future-versions.md](./docs/future-versions.md).

## Demo dataset

A 100% synthetic example scenario lives in [`app/data/demo/`](./app/data/demo/):

- `guest-demo.ecokey` — a valid ECBT type-A key (3 monitoring wells with
  pH/benzene observations + site boundary)
- `guest-demo.model.json` — the same scenario as plain, inspectable JSON

The fastest way in: click **"Load example"** in the Guest Mode banner — one
click loads the scenario into the 3D scene. You can also use the app's
**Import** flow (paste the key or open the file).
No real names, emails or client data — everything is synthetic.

## Troubleshooting

| Symptom | Cause / fix |
| ------- | ----------- |
| `ERR_BUILD_MISSING` screen on load | You ran `npm start` before `npm run build`. Run the build once, then start again. |
| Port 4000 already in use | Start on another port: `npx --no-install serve app -l 4001` (or stop the other process). |
| `npm install` / build fails with syntax errors | Node version too old. Requires **22.14+** — check `node --version`, use `nvm use` (reads .nvmrc). |
| 404 responses on `/api/*` in the console | Expected by design: there is no backend in Guest Mode. The UI degrades with a notice; nothing is broken. |
| 404 responses on a few `/js/utils/{telemetry,errorReporting}/*.js` and `pendingPaymentResumeModal.js` | Also expected: these backend-only modules are excluded from the open package and every `import()` of them is wrapped in a catch. The app boots and runs normally — this is degradation, not a broken build. |
| Login / AI buttons show "disabled in Guest Mode" | Also by design — see [Guest Mode](#guest-mode-what-works-without-a-backend). |

## Modules (scientific core)

- **core/scores/** — HITL scoring algorithm (_hitlScorePure, _turnBudgetPure)
- **core/chat/** — RF-10 context_ref validator (_chatContextRefPure)
- **core/ods/** — ODS/SDG indicators (251 UN indicators, impact aggregator)
- **core/io/** — ECBT key format encoder/decoder (A/B/C)
- **core/presentation/** — ECBT segment

Some modules are Guest Mode stubs (same signature, feature disabled) — see
the header comment inside each stub.

```bash
npm test   # runs the published test suite
```

## License — AGPL-3.0-only (note on section 13)

This project is licensed under the **GNU AGPL v3.0 only** — see
[LICENSE](./LICENSE). Mind **AGPL section 13 (network use)**: if you modify
ecbyts and let users interact with it **over a network**, you must offer
those users the complete corresponding source of your modified version.
Running it locally for yourself carries no such obligation.

**Source of truth:** the [LICENSE](./LICENSE) file is the authoritative legal
text. This section is a high-level summary, **not legal advice**.

## Contributing

Contributions that improve the accessibility and transparency of environmental
science are welcome. Read [CONTRIBUTING.md](./CONTRIBUTING.md) first; report
vulnerabilities privately via [SECURITY.md](./SECURITY.md); participation is
governed by the [Code of Conduct](./CODE_OF_CONDUCT.md).

1. Fork the repository and create a branch (`git checkout -b feat/your-feature`)
2. Keep the bilingual comment style (English headers, Portuguese explanations)
3. Build and test locally (`npm run build && npm test`, then `npm start`)
4. Open a Pull Request using the `feat(scope): description` convention

## Glossary

| Term | Meaning |
| ---- | ------- |
| **PDPL-U** | The core organizing model for environmental data: **P**oint, **D**ate, **P**arameter, **R**eading (Leitura), **U**nit |
| **ECBT key** | Portable alphanumeric encoding of a whole model — type A (plain), B (chained/notarized), C (compressed) |
| **Plume** | 3D volume of contaminated groundwater or soil |
| **Monitoring well** | Vertical borehole used to sample groundwater |
| **Observation** | A measurement (parameter + value + unit) at a point in time |
| **Campaign** | A field sampling event with date, team and observations |
| **Stamp / Edge** | Compliance tag attached to an element / directed relationship between two elements |
| **CONAMA / CETESB / IBAMA** | Brazilian environmental bodies: national council, São Paulo state agency, federal enforcement |
| **EIS** | EnviroTech Integrity Score — composite integrity metric |
| **tCO₂e** | Tonnes of CO₂ equivalent (greenhouse-gas unit) |

## Citation

> Iost, C. S. *Environmental Digital Twin* (Version 1.0.0).
> https://github.com/calvinsiost/ecbyts_open

## Research context

ecbyts is independent research software. It supports a doctoral research
project for which the author is currently seeking admission — **no
institutional affiliation is claimed or implied**.

INPI (Brazil): software registration "Ecbyts" no. 512026002102-2;
trademark "ECBYTS" no. 943244064.

## Third-party trademarks

The names below are trademarks of their respective owners and appear in this
repository **only** to describe data interoperability (import/export formats
and field mappings). **ecbyts is not affiliated with, endorsed by, or
sponsored by any of these companies.**

- ArcGIS
- ArchiCAD
- AutoCAD
- BIM 360
- DrillGuide
- EQuIS
- Esri
- ESdat
- gINT
- Google Earth
- IFC
- Leapfrog
- Mapbox
- Navisworks
- QGIS
- Revit
- RockWorks
- Surfer
- Tableau
- Visual MODFLOW
- Vulcan
- among others

---

## Português (resumo)

O **ecbyts** é uma plataforma open-source de gêmeos digitais ambientais e
ocupacionais. Este repositório público roda **sem backend** (Modo Convidado).

> ### ⚠️ Beta — bugs são esperados, e reportá-los ajuda
>
> O ecbyts está em **desenvolvimento ativo e teste beta aberto**.
> Funcionalidades podem mudar e você vai encontrar bugs — isso é esperado
> nesta fase, e encontrá-los é genuinamente útil.
>
> **Como reportar:** no app, em **"Mais" → "Reportar Bug"** (captura o
> contexto técnico automaticamente, é o caminho mais rápido); ou abra uma
> [issue no GitHub](https://github.com/calvinsiost/ecbyts_open/issues)
> contando o que fez, o que esperava e o que aconteceu. Os relatos são
> triados e corrigidos o quanto antes. Para **vulnerabilidades de segurança**,
> não abra issue pública — siga o [SECURITY.md](./SECURITY.md).

**Pré-requisitos:** Node.js 22.14+ (fixado no `.nvmrc`) e Git.

**Passo a passo:**

```bash
git clone https://github.com/calvinsiost/ecbyts_open
cd ecbyts_open
npm install
npm run build   # OBRIGATÓRIO antes do primeiro start
npm start       # abre em http://localhost:4000
```

**O que funciona no Modo Convidado:** cena 3D, elementos, observações,
exportar/importar chaves ECBT, dataset de exemplo em `app/data/demo/`
(clique em **"Carregar exemplo"** no banner do Modo Convidado, ou use o fluxo
de Import), persistência local no navegador.

**O que precisa de backend (desligado por design):** login, sincronização e
recursos de IA. Os 404 em `/api/*` no console são esperados — a interface
avisa em vez de quebrar. O plano de backend opt-in está em
[docs/future-versions.md](./docs/future-versions.md).

**Problemas comuns:** tela `ERR_BUILD_MISSING` = rode `npm run build`;
porta 4000 ocupada = `npx --no-install serve app -l 4001`; erro de sintaxe
no build = versão do Node abaixo de 22.14.

**Licença:** AGPL-3.0-only — atenção à **seção 13 (uso em rede)**: quem
disponibiliza uma versão modificada via rede deve oferecer o código-fonte
correspondente aos usuários. O arquivo `LICENSE` é o texto jurídico
autoritativo; este resumo **não é consultoria jurídica**.

**Como contribuir:** leia o [CONTRIBUTING.md](./CONTRIBUTING.md); reporte
vulnerabilidades de forma privada conforme o [SECURITY.md](./SECURITY.md).

**Contexto de pesquisa:** o ecbyts é software de pesquisa independente. Apoia
um projeto de doutorado cuja admissão está sendo pleiteada — **não se afirma
nem se subentende vínculo institucional**.

**Marcas de terceiros:** ArcGIS, ArchiCAD, AutoCAD, BIM 360, DrillGuide,
EQuIS, Esri, ESdat, gINT, Google Earth, IFC, Leapfrog, Mapbox, Navisworks,
QGIS, Revit, RockWorks, Surfer, Tableau, Visual MODFLOW, Vulcan, entre
outras, são marcas de seus respectivos titulares e aparecem **apenas** para
descrever interoperabilidade de dados. O ecbyts não é afiliado, endossado ou
patrocinado por nenhuma dessas empresas.
