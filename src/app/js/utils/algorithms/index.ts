// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ALGO-LIB-001 — Biblioteca de algoritmos de engenharia (genéricos/infra).
   Ponto único de descoberta. Spec: docs/specs/features/SPEC_ENGINEERING_ALGORITHMS_LIBRARY.md

   F1: vector clocks (item 29) + SIEVE cache (alternativa permissiva ao ARC).
   F2 batch 1: jump consistent hash (8), reservoir sampling (24),
   last-write-wins (33), quorum R+W>N (28).
   F2 batch 2: LFU cache (2), Clock/second-chance (5), consistent hash ring (6),
   sliding window counter (12).
   F2 batch 3 (fecha F2): hedged (17), deadline (18), timing wheel (39),
   DRR (40), content-defined chunking (46), WAL (49).

   RF-5 — RE-EXPORT dos helpers que já existem (NÃO reimplementados), via
   namespace para descoberta unificada sem colisão de nomes. Consumidores:
   `import { tokenBucket, merkle } from 'utils/algorithms'`.
   ================================================================ */

// --- Implementados nesta biblioteca (F1+F2) ---
export * from './vectorClockPure.js';
export * from './sieveCachePure.js';
export * from './jumpHashPure.js';
export * from './reservoirPure.js';
export * from './lwwPure.js';
export * from './quorumPure.js';
export * from './lfuCachePure.js';
export * from './clockCachePure.js';
export * from './consistentHashRing.js';
export * from './slidingWindowCounterPure.js';
export * from './hedgedPure.js';
export * from './deadlinePure.js';
export * from './timingWheel.js';
export * from './drrPure.js';
export * from './contentChunkingPure.js';
export * from './walPure.js';

// --- Recomendações de domínio (ver ALGO_RECOMMENDATIONS_DOMAIN_2026_06_15) ---
export * from './kdTreePure.js'; // R1: índice espacial 2D (nearest/kNN/bbox/raio)
export * from './savitzkyGolayPure.js'; // R7: suavização preservando picos (séries temporais)
export * from './kalman1DPure.js'; // R4: filtro de Kalman 1D (denoise de sensores)

// --- RF-5: aliases namespaced dos helpers já existentes (reuso, sem duplicar) ---
export * as tokenBucket from '../helpers/_rateLimitTokenBucketPure.js'; // item 10
export * as circuitBreaker from '../helpers/_circuitBreakerPure.js'; // item 15
export * as backoff from '../helpers/_backoffJitterPure.js'; // item 14
export * as optimisticLock from '../helpers/_optimisticLockPure.js'; // item 35 (OCC)
export * as merkle from '../../core/crypto/merkle.js'; // item 34
export * as hashChain from '../../core/crypto/hashChain.js'; // item 34
