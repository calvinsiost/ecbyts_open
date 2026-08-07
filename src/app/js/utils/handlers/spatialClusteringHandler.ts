// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// utils/handlers/spatialClusteringHandler.js
// Wire-up of P1-58 spatial clustering engine into UI.
// (window as any).handleShowSpatialClustering() - demo k-means + DBSCAN on synthetic SP points.
import { kMeans, dbscan, haversineDistance } from '../../core/spatial/clusteringEngine.js';
import { showToast } from '../ui/toast.js';
function buildDemoPoints() {
    return [
        { lat: -23.55, lng: -46.63 },
        { lat: -23.56, lng: -46.64 },
        { lat: -23.55, lng: -46.65 },
        { lat: -23.65, lng: -46.55 },
        { lat: -23.66, lng: -46.56 },
        { lat: -23.7, lng: -46.7 },
        { lat: -23.71, lng: -46.71 },
        { lat: -23.69, lng: -46.69 },
    ];
}
export function handleShowSpatialClustering() {
    const points = buildDemoPoints();
    const km = kMeans(points, 3);
    const db = dbscan(points, 5000, 2);
    const dist = haversineDistance(points[0]!, points[5]!).toFixed(0);
    const lines = [
        `Spatial clustering demo — ${points.length} pontos SP`,
        `K-Means(k=3): ${km.clusters.length} clusters em ${km.iterations} iter (${km.converged ? 'conv' : 'no-conv'})`,
        `DBSCAN(ε=5km,min=2): ${db.clusters.length} clusters, ${db.noise.length} noise | Δ p1↔p6=${dist}m`,
    ];
    showToast(lines.join(' • '), 'info', 7000);
}
export const spatialClusteringHandlers = { handleShowSpatialClustering };
