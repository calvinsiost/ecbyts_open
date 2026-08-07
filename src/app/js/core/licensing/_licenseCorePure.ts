// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   LICENSE CORE — pure logic (MKT-OWNER-VERIFY-001 F1)

   Primitivas do registro de licenças de modelos pagos:

   1. canonicalManifestFingerprint — sha256 do manifest em JSON canônico
      (sorted keys). F1: identifica OBRA+versão (a entrega paga atual
      devolve o mesmo manifest a todos os compradores); F3 (watermark)
      passará a identificar a CÓPIA. `fingerprint_scope` na tabela
      distingue os dois regimes.

   2. buildBuyerPseudonym — pseudônimo determinístico NÃO-reversível
      por (buyer, asset): nem o produtor vê identidade real (LGPD,
      spec §3/§12). Salt por asset: vazar correlação de um asset não
      correlaciona compras do mesmo comprador em outros assets.

   Pure: sem DOM/rede; digest é injetável (browser usa WebCrypto,
   edge usa Deno crypto, testes usam node:crypto).
   ================================================================ */

export type Sha256Hex = (input: string) => Promise<string> | string;

/** Serialização canônica (sorted keys, estável) — mesma família do
 *  canonicalJson de _aiProvenancePure/componentsHash. */
export function canonicalJson(obj: unknown): string {
    if (obj === null || typeof obj !== 'object') return JSON.stringify(obj) ?? 'null';
    if (Array.isArray(obj)) return `[${obj.map(canonicalJson).join(',')}]`;
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((obj as Record<string, unknown>)[k])}`).join(',')}}`;
}

/**
 * Fingerprint sha256 (hex64) do manifest canônico de uma obra/versão.
 * @param manifest objeto do manifest entregue na compra
 * @param sha256Hex digest injetável
 */
export async function canonicalManifestFingerprint(manifest: unknown, sha256Hex: Sha256Hex): Promise<string> {
    if (manifest == null || typeof manifest !== 'object') {
        throw new Error('manifest must be an object');
    }
    const fp = await sha256Hex(canonicalJson(manifest));
    if (!/^[a-f0-9]{64}$/.test(fp)) throw new Error('sha256Hex must return hex64 lowercase');
    return fp;
}

/**
 * Pseudônimo determinístico do comprador POR ASSET (não-reversível).
 * Formato: `lic-<hex12>` — curto o bastante p/ UI, colisão improvável
 * no universo de licenças de UM asset.
 *
 * @param buyerId  uuid do comprador (NUNCA exibido)
 * @param assetId  uuid do asset (salt de domínio)
 * @param sha256Hex digest injetável
 */
export async function buildBuyerPseudonym(buyerId: string, assetId: string, sha256Hex: Sha256Hex): Promise<string> {
    if (!buyerId || !assetId) throw new Error('buyerId and assetId are required');
    const digest = await sha256Hex(`ecbt-license-pseudonym:${assetId}:${buyerId}`);
    return `lic-${digest.slice(0, 12)}`;
}

/** Shape canônico de uma licença F1 (validação leve p/ consumers). */
export function isLicenseRecord(row: unknown): boolean {
    const r = row as Record<string, unknown>;
    return !!r
        && typeof r.license_id === 'string'
        && typeof r.asset_id === 'string'
        && typeof r.buyer_pseudonym === 'string'
        && /^[a-f0-9]{64}$/.test(String(r.key_fingerprint || ''))
        && (r.fingerprint_scope === 'work_version' || r.fingerprint_scope === 'copy');
}
