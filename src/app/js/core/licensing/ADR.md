# ADR — core/licensing (MKT-OWNER-VERIFY-001)

**Status:** F1 implementado (núcleo) · 2026-06-12 · dono: claude - novaspec
**Spec:** docs/specs/features/SPEC_MARKETPLACE_PAID_MODEL_OWNER_VERIFICATION.md

## A1 — Fingerprint por obra/versão (F1) antes de por cópia (F3)

Auditoria do fluxo real (2026-06-12): `library-download` entrega o
**manifest JSON idêntico** a todos os compradores — não há chave ECBT-B
individual na entrega. Decisão: F1 registra `sha256(manifest canônico)`
com `fingerprint_scope='work_version'`; a personalização por cópia
(watermark de `license_id` assinado) é F3/RF-8 e usará `scope='copy'`.
Alternativa rejeitada: gerar chave ECBT-B por compra já em F1 — mudaria o
formato de entrega do marketplace inteiro num passo só (risco alto, e o
valor do painel do produtor F2 já existe com lookup de licenças).

## A2 — Pseudônimo determinístico com salt por asset

`lic-<sha256(domain:assetId:buyerId)[0..12]>`. Não-reversível, estável
(mesma licença re-renderiza igual), e o salt por asset impede correlação
de compras do mesmo usuário entre assets (LGPD minimização). Nem o
produtor vê identidade real — identificação só por via legal (spec D3).

## A3 — INSERT de licença apenas via service role

A tabela tem RLS FORCE com SELECT para author/buyer; INSERT acontece só
no edge `library-download` (service role) no momento da entrega paga,
idempotente por `purchase_id unique`. Cliente NUNCA grava licença.

## A4 — consent_at nullable até D1

O registro de licenças começa antes do consent UI (RF-2 aguarda redação
D1 do Calvin) — dado retroativo é valioso e o comprador já aceita os
Termos gerais na compra. Quando RF-2 ativar, `consent_text_hash` +
`consent_at` passam a ser obrigatórios no fluxo (gate no edge).

## A5 — Disputes append-only

`license_disputes` espelha o padrão audit G1: autor INSERT+SELECT das
próprias; UPDATE de status só por admin/service role. O veredito vai
CONGELADO (`verdict_frozen` jsonb) — a disputa referencia o estado no
momento da abertura, imune a re-verificações posteriores.
