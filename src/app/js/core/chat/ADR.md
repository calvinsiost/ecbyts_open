# ADR — Chat entre usuários com agentes de IA

> Ponteiro para o ADR canônico: [`docs/specs/arch/ADR_USER_CHAT_001.md`](../../../../../docs/specs/arch/ADR_USER_CHAT_001.md)
>
> ADR-USER-CHAT-001 — aprovado pelo Calvin (2026-07-10).
> Cobre: trilhos de tempo real (Changes/Broadcast/Presence), agente como ator
> com rotulagem inquebrável, enforcement de consentimento no banco (RLS + RPC
> `SECURITY DEFINER`).

## Módulos deste diretório

- `_chatModelPure.ts` — modelo de mensagem, validação `author_kind`/`on_behalf_of`/`agent_id`/`trigger`
- `_chatAgentConsentPure.ts` — regra de consentimento RF-6 (espelha o RPC server-side)
- `_chatContextRefPure.ts` — referência de contexto (modelo/sala/elemento)
