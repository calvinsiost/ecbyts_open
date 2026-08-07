// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   ISSUE MARKER — 3D Geometries by Severity
   ================================================================

   Cria marcadores Three.js para issues no viewport 3D.
   Geometria e cor variam por severidade (ADR decision #5).
   Marcadores usam userData para identificacao pelo picker.

   ================================================================ */
import { createTHREEProxy } from '../three-lazy.js';
const THREE: any = createTHREEProxy();
import { getIssue, getVisibleIssueIds } from './manager.js';
// --- Constants -------------------------------------------------------
const SEVERITY_CONFIG: Record<string, { color: number; createGeometry: () => any }> = {
    low: {
        color: 0x3498db,
        createGeometry: () => new THREE.SphereGeometry(0.3, 16, 12),
    },
    medium: {
        color: 0xf39c12,
        createGeometry: () => new THREE.CylinderGeometry(0.3, 0.3, 0.8, 16),
    },
    high: {
        color: 0xe74c3c,
        createGeometry: () => new THREE.ConeGeometry(0.4, 1.0, 16),
    },
    critical: {
        color: 0x8e44ad,
        createGeometry: () => new THREE.OctahedronGeometry(0.5),
    },
};
const RESOLVED_COLOR = 0x95a5a6;
const HOVER_SCALE = 1.3;
const BOUNTY_RING_COLOR = 0xffd700; // gold ring for unclaimed bounties
const BOUNTY_RING_SEGMENTS = 32;
// --- State -----------------------------------------------------------
/** @type {any} */
let _issuesGroup: any = null;
/** @type {Map<string, any>} issueId -> mesh */
const _markers = new Map();
/** Animation frame ID for critical pulse */
/** @type {any} */
let _pulseAnimId: any = null;
// --- Public API ------------------------------------------------------
/**
 * Set the Three.js group where markers will be added.
 * Called from scene/setup.js during initialization.
 * @param {any} group
 */
export function setIssuesGroup(group: any) {
    _issuesGroup = group;
}
/**
 * Create a 3D marker mesh for an issue.
 * @param {any} issue
 * @returns {any}
 */
export function createMarkerMesh(issue: any) {
    if (!_issuesGroup)
        return null;
    const isResolved = issue.status === 'resolved' || issue.status === 'wontfix';
    const config = SEVERITY_CONFIG[issue.severity] || SEVERITY_CONFIG.medium!;
    const geometry = config.createGeometry();
    const material = new THREE.MeshLambertMaterial({
        color: isResolved ? RESOLVED_COLOR : config.color,
        transparent: true,
        opacity: isResolved ? 0.5 : 0.9,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(issue.position.x || 0, (issue.position.y || 0) + 0.5, // slight elevation above ground
    issue.position.z || 0);
    // Metadata for picker identification
    mesh.userData = {
        type: 'issue-marker',
        issueId: issue.id,
        severity: issue.severity,
        bountyTier: issue.bounty?.tier || null,
    };
    mesh.name = `issue-${issue.id}`;
    // Bounty visual enhancements
    if (issue.type === 'bounty' && issue.bounty && !isResolved) {
        if (issue.status === 'open') {
            // Unclaimed bounty: gold wireframe ring
            const ringGeo = new THREE.RingGeometry(0.6, 0.7, BOUNTY_RING_SEGMENTS);
            const ringMat = new THREE.MeshBasicMaterial({
                color: BOUNTY_RING_COLOR,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.6,
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = -Math.PI / 2; // horizontal ring
            ring.userData._bountyRing = true;
            mesh.add(ring);
        }
        else if (issue.status === 'in_progress') {
            // Claimed bounty: emissive glow
            material.emissive = new THREE.Color(config.color);
            material.emissiveIntensity = 0.25;
        }
    }
    _issuesGroup.add(mesh);
    _markers.set(issue.id, mesh);
    return mesh;
}
/**
 * Update marker visibility.
 * @param {string} issueId
 * @param {boolean} visible
 */
export function updateMarkerVisibility(issueId: any, visible: any) {
    const mesh = _markers.get(issueId);
    if (mesh)
        mesh.visible = visible;
}
/**
 * Update marker appearance after issue state change.
 * @param {string} issueId
 */
export function updateMarkerAppearance(issueId: any) {
    const mesh = _markers.get(issueId);
    const issue = getIssue(issueId);
    if (!mesh || !issue)
        return;
    const isResolved = issue.status === 'resolved' || issue.status === 'wontfix';
    const config = SEVERITY_CONFIG[issue.severity] || SEVERITY_CONFIG.medium!;
    mesh.material.color.setHex(isResolved ? RESOLVED_COLOR : config.color);
    mesh.material.opacity = isResolved ? 0.5 : 0.9;
    mesh.material.needsUpdate = true;
}
/**
 * Remove a single marker from the scene.
 * @param {string} issueId
 */
export function removeMarker(issueId: any) {
    const mesh = _markers.get(issueId);
    if (!mesh)
        return;
    _disposeMeshDeep(mesh);
    if (_issuesGroup)
        _issuesGroup.remove(mesh);
    _markers.delete(issueId);
}
/**
 * Rebuild all markers from current issue state.
 * Caps at MAX_VISIBLE_MARKERS for performance.
 */
export function refreshAllMarkers() {
    if (!_issuesGroup)
        return;
    // Stop pulse animation before rebuild
    if (_pulseAnimId) {
        cancelAnimationFrame(_pulseAnimId);
        _pulseAnimId = null;
    }
    // Remove all existing markers
    for (const [_id, mesh] of _markers) {
        _disposeMeshDeep(mesh);
        _issuesGroup.remove(mesh);
    }
    _markers.clear();
    // Recreate visible markers
    const visibleIds = getVisibleIssueIds();
    for (const id of visibleIds) {
        const issue = getIssue(id);
        if (issue)
            createMarkerMesh(issue);
    }
    // Start pulse animation for bounty rings
    _startPulseAnimation();
}
/** Pulse animation for bounty rings (scale oscillation) */
function _startPulseAnimation() {
    let hasBountyRings = false;
    for (const [, mesh] of _markers) {
        if (mesh.children?.some((c: any) => c.userData?._bountyRing)) {
            hasBountyRings = true;
            break;
        }
    }
    if (!hasBountyRings)
        return;
    function pulse() {
        const t = Date.now() * 0.003;
        const s = 1.0 + 0.2 * Math.sin(t);
        for (const [, mesh] of _markers) {
            for (const child of mesh.children) {
                if (child.userData?._bountyRing) {
                    child.scale.set(s, s, 1);
                }
            }
        }
        _pulseAnimId = requestAnimationFrame(pulse);
    }
    _pulseAnimId = requestAnimationFrame(pulse);
}
/** Dispose mesh and all children geometries/materials
 * @param {any} mesh
 */
function _disposeMeshDeep(mesh: any) {
    mesh.geometry?.dispose();
    mesh.material?.dispose();
    if (mesh.children) {
        for (const child of mesh.children) {
            child.geometry?.dispose();
            child.material?.dispose();
        }
    }
}
/**
 * Highlight a marker (hover effect).
 * @param {string} issueId
 * @param {boolean} highlight
 */
export function highlightMarker(issueId: any, highlight: any) {
    const mesh = _markers.get(issueId);
    if (!mesh)
        return;
    const scale = highlight ? HOVER_SCALE : 1.0;
    mesh.scale.set(scale, scale, scale);
}
/**
 * Get the 3D position of a marker.
 * @param {string} issueId
 * @returns {{x: number, y: number, z: number}|null}
 */
export function getMarkerPosition(issueId: any) {
    const mesh = _markers.get(issueId);
    if (!mesh)
        return null;
    return { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z };
}
/**
 * Get marker count (for diagnostics).
 * @returns {number}
 */
export function getMarkerCount() {
    return _markers.size;
}
/**
 * Dispose all markers and cleanup.
 */
export function disposeAllMarkers() {
    if (_pulseAnimId) {
        cancelAnimationFrame(_pulseAnimId);
        _pulseAnimId = null;
    }
    for (const [_id, mesh] of _markers) {
        _disposeMeshDeep(mesh);
        if (_issuesGroup)
            _issuesGroup.remove(mesh);
    }
    _markers.clear();
}
