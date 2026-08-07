// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * clusteringEngine.js - Spatial Clustering Engine
 * K-Means and DBSCAN algorithms with Haversine distance metric.
 *
 * Algoritmos de agrupamento espacial usando distancia geodesica de Haversine.
 * Suporta K-Means (centroid-based) e DBSCAN (density-based) para analise
 * de pontos ambientais georeferenciados.
 *
 * Academic references:
 *   - Haversine: R.W. Sinnott, "Virtues of the Haversine", Sky and Telescope 68(2), 1984
 *   - K-Means: MacQueen, J. (1967). Methods for classification and analysis of
 *     multivariate observations. Proc. 5th Berkeley Symp. Math. Stat. Prob., 1:281-297.
 *   - DBSCAN: Ester, M. et al. (1996). A density-based algorithm for discovering
 *     clusters in large spatial databases with noise. KDD-96, pp. 226-231.
 *   - Silhouette: Rousseeuw, P.J. (1987). Silhouettes: a graphical aid to the
 *     interpretation and validation of cluster analysis. J. Comput. Appl. Math. 20:53-65.
 */

type LatLng = { lat: number; lng: number };

// ─── Constants ──────────────────────────────────────────────────────────────

export const CLUSTERING_ALGORITHMS: Readonly<{ KMEANS: string; DBSCAN: string }> = Object.freeze({
    KMEANS: 'kmeans',
    DBSCAN: 'dbscan',
});

/** Earth radius in meters (WGS-84 mean radius) */
const EARTH_RADIUS_M = 6_371_000;

/** Tolerance in meters for bridgeToPdplu proximity match */
const BRIDGE_PROXIMITY_M = 1;

// ─── Haversine Distance ──────────────────────────────────────────────────────

/**
 * Compute geodesic distance between two lat/lng points using the Haversine formula.
 * Retorna distancia em metros entre dois pontos geograficos.
 *
 * @param p1 - First point
 * @param p2 - Second point
 * @returns Distance in meters
 */
export function haversineDistance(p1: LatLng, p2: LatLng): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const dLat = toRad(p2.lat - p1.lat);
    const dLng = toRad(p2.lng - p1.lng);
    const lat1 = toRad(p1.lat);
    const lat2 = toRad(p2.lat);

    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

    return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

// ─── K-Means ─────────────────────────────────────────────────────────────────

/**
 * Run K-Means clustering on a set of geographic points.
 * Agrupa pontos por centroide iterativo usando distancia Haversine.
 *
 * @param points - Input points
 * @param k - Number of clusters
 * @param maxIterations - Maximum iteration cap
 */
export function kMeans(
    points: LatLng[],
    k: number,
    maxIterations: number = 100,
): {
    clusters: Array<{ centroid: LatLng; points: LatLng[] }>;
    iterations: number;
    converged: boolean;
} {
    if (k <= 0 || !points || points.length === 0) {
        return { clusters: [], iterations: 0, converged: true };
    }

    const n = Math.min(k, points.length);

    // Initialize centroids as the first k distinct points
    let centroids: LatLng[] = points.slice(0, n).map((p) => ({ lat: p.lat, lng: p.lng }));

    let assignments: number[] = new Array(points.length).fill(-1);
    let converged = false;
    let iter = 0;

    for (; iter < maxIterations; iter++) {
        // Assign each point to nearest centroid
        const newAssignments = points.map((pt) => {
            let minDist = Infinity;
            let best = 0;
            for (let c = 0; c < centroids.length; c++) {
                const ctr = centroids[c] as LatLng;
                const d = haversineDistance(pt, ctr);
                if (d < minDist) {
                    minDist = d;
                    best = c;
                }
            }
            return best;
        });

        // Check convergence
        converged = newAssignments.every((a, i) => a === assignments[i]);
        assignments = newAssignments;
        if (converged) break;

        // Recompute centroids as mean lat/lng
        const sums = Array.from({ length: n }, () => ({ lat: 0, lng: 0, count: 0 }));
        for (let i = 0; i < points.length; i++) {
            const c = assignments[i] as number;
            const sum = sums[c] as { lat: number; lng: number; count: number };
            const pt = points[i] as LatLng;
            sum.lat += pt.lat;
            sum.lng += pt.lng;
            sum.count += 1;
        }
        centroids = sums.map((s, idx) =>
            s.count > 0
                ? { lat: s.lat / s.count, lng: s.lng / s.count }
                : (centroids[idx] as LatLng),
        );
    }

    // Build cluster objects
    const clusterPoints: Array<Array<LatLng>> = Array.from({ length: n }, () => []);
    for (let i = 0; i < points.length; i++) {
        const a = assignments[i] as number;
        const arr = clusterPoints[a] as Array<LatLng>;
        const pt = points[i] as LatLng;
        arr.push(pt);
    }

    const clusters = centroids.map((centroid, idx) => ({
        centroid,
        points: clusterPoints[idx] as Array<LatLng>,
    }));

    return { clusters, iterations: iter, converged };
}

// ─── DBSCAN ──────────────────────────────────────────────────────────────────

/**
 * Return indices of all points within epsilonMeters of the query point.
 * Consulta de vizinhanca para DBSCAN usando distancia Haversine.
 *
 * @param points
 * @param idx - Query point index
 * @param epsilonMeters
 * @returns Neighbor indices (including idx itself)
 */
function _regionQuery(points: LatLng[], idx: number, epsilonMeters: number): number[] {
    const neighbors: number[] = [];
    const queryPt = points[idx] as LatLng;
    for (let i = 0; i < points.length; i++) {
        const cur = points[i] as LatLng;
        if (haversineDistance(queryPt, cur) <= epsilonMeters) {
            neighbors.push(i);
        }
    }
    return neighbors;
}

/**
 * DBSCAN density-based spatial clustering.
 * Agrupamento por densidade - robusto a ruido e clusters de forma arbitraria.
 *
 * @param points - Input points
 * @param epsilonMeters - Neighborhood radius in meters
 * @param minPoints - Minimum points to form a dense region (core point)
 */
export function dbscan(
    points: LatLng[],
    epsilonMeters: number,
    minPoints: number,
): { clusters: Array<{ id: number; points: LatLng[] }>; noise: LatLng[] } {
    if (!points || points.length === 0) {
        return { clusters: [], noise: [] };
    }

    const UNVISITED = 0;
    const NOISE = -1;
    const labels = new Array(points.length).fill(UNVISITED);
    let clusterId = 0;

    for (let i = 0; i < points.length; i++) {
        if (labels[i] !== UNVISITED) continue;

        const neighbors = _regionQuery(points, i, epsilonMeters);

        if (neighbors.length < minPoints) {
            labels[i] = NOISE;
            continue;
        }

        // Start new cluster
        clusterId++;
        labels[i] = clusterId;

        // Seed set - use queue for BFS expansion
        const seedSet = neighbors.filter((n) => n !== i);

        for (let si = 0; si < seedSet.length; si++) {
            const q = seedSet[si] as number;

            if (labels[q] === NOISE) {
                labels[q] = clusterId; // border point — assign to cluster
            }
            if (labels[q] !== UNVISITED) continue;

            labels[q] = clusterId;

            const qNeighbors = _regionQuery(points, q, epsilonMeters);
            if (qNeighbors.length >= minPoints) {
                // q is a core point - expand
                for (const nb of qNeighbors) {
                    if (!seedSet.includes(nb)) {
                        seedSet.push(nb);
                    }
                }
            }
        }
    }

    // Collect results
    const clusterMap = new Map<number, Array<LatLng>>();
    const noise: Array<LatLng> = [];

    for (let i = 0; i < points.length; i++) {
        const pt = points[i] as LatLng;
        const lab = labels[i] as number;
        if (lab === NOISE) {
            noise.push(pt);
        } else {
            if (!clusterMap.has(lab)) clusterMap.set(lab, []);
            const arr = clusterMap.get(lab);
            if (arr) arr.push(pt);
        }
    }

    const clusters = Array.from(clusterMap.entries()).map(([id, pts]) => ({
        id,
        points: pts,
    }));

    return { clusters, noise };
}

// ─── Silhouette Score ─────────────────────────────────────────────────────────

/**
 * Compute silhouette score for a single point.
 * Medida de coesao e separacao para validacao da qualidade do cluster.
 * Range: -1 (wrong cluster) to +1 (well clustered). 0 = on border.
 *
 * @param point - The point to evaluate
 * @param ownClusterPoints - All points in the same cluster (including point itself)
 * @param otherClusters - Array of point arrays from other clusters
 * @returns Silhouette score in [-1, 1]
 */
export function silhouetteScore(
    point: LatLng,
    ownClusterPoints: LatLng[],
    otherClusters: Array<LatLng[]>,
): number {
    const others = ownClusterPoints.filter((p) => !(p.lat === point.lat && p.lng === point.lng));

    if (others.length === 0) return 0; // Single-point cluster

    // a = mean intra-cluster distance
    const a = others.reduce((sum, p) => sum + haversineDistance(point, p), 0) / others.length;

    if (!otherClusters || otherClusters.length === 0) return 0;

    // b = minimum mean distance to any other cluster
    let b = Infinity;
    for (const cluster of otherClusters) {
        if (cluster.length === 0) continue;
        const meanDist = cluster.reduce((sum, p) => sum + haversineDistance(point, p), 0) / cluster.length;
        if (meanDist < b) b = meanDist;
    }

    if (!isFinite(b)) return 0;

    const maxAB = Math.max(a, b);
    if (maxAB === 0) return 0;

    return (b - a) / maxAB;
}

// ─── Evaluate Clustering ─────────────────────────────────────────────────────

/**
 * Compute aggregate quality metrics for a clustering result.
 * Avalia qualidade global do agrupamento com silhueta media e estatisticas.
 *
 * @param clusters
 * @param algorithm - Algorithm identifier (CLUSTERING_ALGORITHMS)
 */
export function evaluateClustering(
    clusters: Array<{ centroid?: LatLng; points: LatLng[] }>,
    algorithm: string,
): {
    clusterCount: number;
    totalPoints: number;
    meanClusterSize: number;
    silhouetteScores: number[];
    meanSilhouette: number;
    algorithm: string;
} {
    const clusterCount = clusters.length;
    const totalPoints = clusters.reduce((sum, c) => sum + c.points.length, 0);
    const meanClusterSize = clusterCount > 0 ? totalPoints / clusterCount : 0;

    const silhouetteScores: number[] = [];

    if (clusterCount >= 2) {
        const allPointArrays = clusters.map((c) => c.points);

        for (let ci = 0; ci < clusters.length; ci++) {
            const cluster = clusters[ci] as { points: LatLng[] };
            const ownPoints = cluster.points;
            const otherPointArrays = allPointArrays.filter((_, idx) => idx !== ci);

            for (const pt of ownPoints) {
                silhouetteScores.push(silhouetteScore(pt, ownPoints, otherPointArrays));
            }
        }
    }

    const meanSilhouette =
        silhouetteScores.length > 0 ? silhouetteScores.reduce((s, v) => s + v, 0) / silhouetteScores.length : 0;

    return {
        clusterCount,
        totalPoints,
        meanClusterSize,
        silhouetteScores,
        meanSilhouette,
        algorithm,
    };
}

// ─── Bridge to PDPLU ─────────────────────────────────────────────────────────

/**
 * Map cluster points back to PDPLU element IDs by nearest-neighbor match.
 * Associa clusters a elementos PDPLU por proximidade geografica (<=1m).
 *
 * @param clusters
 * @param elements
 */
export function bridgeToPdplu(
    clusters: Array<{ centroid?: LatLng; points: LatLng[]; id?: number }>,
    elements: Array<{ id: string; lat?: number; lng?: number; position?: LatLng }>,
): Array<{
    clusterId: number | string;
    elementIds: string[];
    centroid: LatLng;
    boundingBox: { minLat: number; maxLat: number; minLng: number; maxLng: number };
}> {
    if (!clusters || !elements) return [];

    // Normalize element positions
    const elementsWithCoords = elements
        .map((el) => {
            const lat = el.lat ?? el.position?.lat;
            const lng = el.lng ?? el.position?.lng;
            if (lat == null || lng == null) return null;
            return { id: el.id, lat, lng };
        })
        .filter(Boolean) as Array<{ id: string; lat: number; lng: number }>;

    return clusters.map((cluster, idx) => {
        const clusterId = cluster.id ?? idx;
        const pts = cluster.points;

        // Compute centroid from cluster points
        const centroid =
            cluster.centroid ??
            (pts.length > 0
                ? {
                      lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
                      lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length,
                  }
                : { lat: 0, lng: 0 });

        // Compute bounding box
        const boundingBox =
            pts.length > 0
                ? {
                      minLat: Math.min(...pts.map((p) => p.lat)),
                      maxLat: Math.max(...pts.map((p) => p.lat)),
                      minLng: Math.min(...pts.map((p) => p.lng)),
                      maxLng: Math.max(...pts.map((p) => p.lng)),
                  }
                : { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 };

        // Match each cluster point to nearest element within BRIDGE_PROXIMITY_M
        const elementIds: string[] = [];
        for (const pt of pts) {
            let bestId: string | null = null;
            let bestDist = BRIDGE_PROXIMITY_M;

            for (const el of elementsWithCoords) {
                const d = haversineDistance(pt, el);
                if (d <= bestDist) {
                    bestDist = d;
                    bestId = el.id;
                }
            }

            if (bestId !== null && !elementIds.includes(bestId)) {
                elementIds.push(bestId);
            }
        }

        return { clusterId, elementIds, centroid, boundingBox };
    });
}
