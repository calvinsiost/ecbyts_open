# ecbyts_open — future versions (planned, not shipped)

This file documents what is **planned** for the public repository, so the
Guest Mode banner and the .env.example have somewhere honest to point to.
It intentionally contains **no setup instructions** — none of the items
below can be configured in the current version.

## Planned

- **Backend opt-in (Supabase):** run the app against your own Supabase
  project — login, sync and persistence beyond the browser. The current
  version ignores real credentials by design.
- **Bring-your-own AI keys:** enable the LLM features (chat, smart import,
  AI voice) with your own provider keys.
- **Content-Security-Policy hardening** for the locally served app (v0.4+).
- **Docker / devcontainer** one-command setup (v0.4+).

## Not planned

- Payments/subscriptions in the public repository.
- Multi-user / roles / RLS in local mode.

Until then: everything that works today is listed in the README section
"Guest Mode — what works without a backend".
