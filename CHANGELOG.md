# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-08-05

Salto do **núcleo científico** para um **app offline executável (Modo
Convidado)**: quem clona agora consegue `build` + `run` e ver o ecbyts no
navegador, sem backend, sem login e sem chaves.

Leap from the **scientific core** to an **executable offline app (Guest
Mode)**: cloning now lets you build, run and see ecbyts in the browser with
no backend, no login and no keys.

### Added

- **Guest Mode**: the app boots with a placeholder Supabase config, bypasses
  the invite gate, shows a persistent "Guest Mode" banner and degrades every
  `/api/*` feature with a visible notice instead of failing silently.
- **Runnable public package**: generated `README.md`, `.env.example`,
  `.nvmrc`, `.gitignore` and `package.json` (with `serve` as a
  devDependency and `engines.node` pinned to 22.14.0).
- **Synthetic demo dataset** under `app/data/demo/` (a valid ECBT type-A key
  plus plain JSON) — 100% synthetic, no real names, e-mails or client data.
- **Missing-build detector**: a clear `ERR_BUILD_MISSING` screen when the app
  is started before `npm run build`.
- **Governance**: `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`
  (Contributor Covenant 2.1), issue/PR templates and a GitHub Actions CI
  workflow (install + build + test on Node 22.14.0).

### Security

- **Publish-by-allowlist**: only allowlisted directories reach this public
  repository; a blocking **leak-scan** rejects any secret, token, personal
  data, real e-mail or local machine path before publication.
- Backend, payments/subscriptions, invite/auth logic, telemetry and error
  reporting are **excluded from the public source** by design.

[Unreleased]: https://github.com/calvinsiost/ecbyts_open/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/calvinsiost/ecbyts_open/releases/tag/v0.3.0
