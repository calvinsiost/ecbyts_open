// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   SWIPE HANDLER — Touch/pointer/keyboard navigation between groups
   Manipulador de gestos para navegacao horizontal entre grupos

   Responsavel por: touch, pointer drag, keyboard (arrows, Ctrl+1/2/3)
   Conflito OrbitControls: swipe desabilitado no pane 'model'
   ================================================================ */

const SWIPE_THRESHOLD_PX = 50;
const VELOCITY_THRESHOLD = 0.3; // px/ms
const DIRECTION_LOCK_PX = 10;
const RUBBER_BAND_MAX = 60;

let _track: any = null;
let _container: any = null;
let _navTabs: any[] = [];
let _indicator: any = null;
let _groupCount = 0;
let _currentIndex = 0;
let _switchGroupFn: any = null;
let _groups: any[] = [];

// Drag state
let _dragging = false;
let _startX = 0;
let _startY = 0;
let _startTime = 0;
let _deltaX = 0;
let _directionLocked = false; // true = horizontal locked
let _directionAborted = false; // true = vertical detected, abort swipe

/**
 * Initialize swipe handler.
 * Configura gestos no container e keyboard global.
 * @param opts.track - #swipe-track element
 * @param opts.container - #swipe-container element
 * @param opts.nav - #swipe-nav element
 * @param opts.groups - group IDs in order
 * @param opts.switchGroup - callback(groupId) to switch groups
 */
export function initSwipeHandler({
    track,
    container,
    nav,
    groups,
    switchGroup,
}: {
    track: HTMLElement;
    container: HTMLElement;
    nav: HTMLElement;
    groups: string[];
    switchGroup: Function;
}) {
    _track = track;
    _container = container;
    _groups = groups;
    _groupCount = groups.length;
    _switchGroupFn = switchGroup;

    if (nav) {
        _navTabs = Array.from(nav.querySelectorAll('.swipe-nav-tab'));
        _indicator = nav.querySelector('.swipe-nav-indicator');
        _navTabs.forEach((tab, i) => {
            tab.addEventListener('click', () => _onTabClick(i));
        });
    }

    // Touch events on container
    container.addEventListener('touchstart', _onTouchStart, { passive: true });
    container.addEventListener('touchmove', _onTouchMove, { passive: false });
    container.addEventListener('touchend', _onTouchEnd, { passive: true });

    // Pointer events for desktop drag
    container.addEventListener('pointerdown', _onPointerDown);

    // Keyboard
    document.addEventListener('keydown', _onKeyDown);

    _updateTrackPosition(false);
    _updateIndicator();
}

/**
 * Set the active group index externally (e.g., from viewRouter).
 * Atualiza posicao sem trigger de callback.
 */
export function setActiveIndex(index: number, animate = true) {
    if (index < 0 || index >= _groupCount) return;
    _currentIndex = index;
    _updateTrackPosition(animate);
    _updateIndicator();
    _updateTabStates();
    _updatePaneStates();
}

export function getActiveIndex(): number {
    return _currentIndex;
}

// --- Tab click ---

function _onTabClick(index: any) {
    if (index === _currentIndex) return;
    _currentIndex = index;
    _updateTrackPosition(true);
    _updateIndicator();
    _updateTabStates();
    _updatePaneStates();
    if (_switchGroupFn) _switchGroupFn(_groups[index]);
}

// --- Touch handling ---

function _onTouchStart(e: any) {
    if (_isModelPane()) return; // no swipe on model pane content
    const touch = e.touches[0];
    _startDrag(touch.clientX, touch.clientY);
}

function _onTouchMove(e: any) {
    if (!_dragging || _directionAborted) return;
    const touch = e.touches[0];
    const dx = touch.clientX - _startX;
    const dy = touch.clientY - _startY;

    if (!_directionLocked && !_directionAborted) {
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > DIRECTION_LOCK_PX) {
            _directionAborted = true;
            _endDrag();
            return;
        }
        if (Math.abs(dx) > DIRECTION_LOCK_PX) {
            _directionLocked = true;
        }
    }

    if (_directionLocked) {
        e.preventDefault(); // prevent vertical scroll
        _deltaX = dx;
        _applyDragOffset(dx);
    }
}

function _onTouchEnd() {
    if (!_dragging) return;
    _finalizeDrag();
}

// --- Pointer (desktop drag) ---

function _onPointerDown(e: any) {
    if (_isModelPane()) return;
    if (e.button !== 0) return; // left button only

    // Skip interactive elements - pointer capture blocks click propagation to children
    // Nao capturar pointer em botoes, links, cards, inputs etc - click nao chegaria
    // Calvin 2026-06-06/07: add relations panel (sunburst canvas, tree rows, view btns,
    // breadcrumb, list items, diagram canvas) — pointer capture estava engolindo clicks.
    const interactive = e.target.closest(
        'button, a, [role="button"], .home-card, .home-quick-item, input, select, textarea, [contenteditable],' +
        ' .relations-sunburst-canvas, .relations-tree-row, .relations-item, .relations-view-btn,' +
        ' .relations-crumb, .relations-diagram-canvas',
    );
    if (interactive) return;

    // In Data Studio, only allow swipe from left edge (40px) - use container-relative X
    if (_groups[_currentIndex] === 'datastudio') {
        const relX = e.clientX - _container.getBoundingClientRect().left;
        if (relX > 40) return;
    }

    _container.setPointerCapture(e.pointerId);
    _container.addEventListener('pointermove', _onPointerMove);
    _container.addEventListener('pointerup', _onPointerUp);
    _container.addEventListener('pointercancel', _onPointerCancel);
    _startDrag(e.clientX, e.clientY);
}

function _onPointerMove(e: any) {
    if (!_dragging || _directionAborted) return;
    const dx = e.clientX - _startX;
    const dy = e.clientY - _startY;

    if (!_directionLocked && !_directionAborted) {
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > DIRECTION_LOCK_PX) {
            _directionAborted = true;
            _endDrag();
            return;
        }
        if (Math.abs(dx) > DIRECTION_LOCK_PX) {
            _directionLocked = true;
        }
    }

    if (_directionLocked) {
        _deltaX = dx;
        _applyDragOffset(dx);
    }
}

function _cleanupPointer(e: any) {
    try {
        _container.releasePointerCapture(e.pointerId);
    } catch (err) {
        console.debug('[swipeHandler] releasePointer:', (err as any)?.message || err);
        /* */
    }
    _container.removeEventListener('pointermove', _onPointerMove);
    _container.removeEventListener('pointerup', _onPointerUp);
    _container.removeEventListener('pointercancel', _onPointerCancel);
}

function _onPointerUp(e: any) {
    _cleanupPointer(e);
    if (!_dragging) return;
    _finalizeDrag();
}

function _onPointerCancel(e: any) {
    _cleanupPointer(e);
    _endDrag();
    _updateTrackPosition(true);
}

// --- Keyboard ---

function _onKeyDown(e: any) {
    // Skip when focused on editable elements (inputs, textareas, contenteditable)
    const active: any = document.activeElement;
    const tag = active?.tagName;
    const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || active?.isContentEditable;
    if (isEditable) return;

    // Ctrl+1/2/3 for group switching
    if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= _groupCount) {
            e.preventDefault();
            _onTabClick(num - 1);
            return;
        }
    }

    // Arrow keys when nav tab is focused
    if (document.activeElement?.classList.contains('swipe-nav-tab')) {
        if (e.key === 'ArrowRight' && _currentIndex < _groupCount - 1) {
            e.preventDefault();
            _onTabClick(_currentIndex + 1);
            _navTabs[_currentIndex]?.focus();
        } else if (e.key === 'ArrowLeft' && _currentIndex > 0) {
            e.preventDefault();
            _onTabClick(_currentIndex - 1);
            _navTabs[_currentIndex]?.focus();
        }
    }
}

// --- Drag helpers ---

function _startDrag(x: any, y: any) {
    _dragging = true;
    _directionLocked = false;
    _directionAborted = false;
    _deltaX = 0;
    _startX = x;
    _startY = y;
    _startTime = performance.now();
    if (_track) _track.classList.add('swipe-dragging');
}

function _endDrag() {
    _dragging = false;
    _directionLocked = false;
    if (_track) _track.classList.remove('swipe-dragging');
}

function _finalizeDrag() {
    const elapsed = performance.now() - _startTime;
    const velocity = Math.abs(_deltaX) / elapsed;
    const absDx = Math.abs(_deltaX);

    let newIndex = _currentIndex;

    if (absDx > SWIPE_THRESHOLD_PX || velocity > VELOCITY_THRESHOLD) {
        if (_deltaX > 0 && _currentIndex > 0) {
            newIndex = _currentIndex - 1; // swipe right → previous
        } else if (_deltaX < 0 && _currentIndex < _groupCount - 1) {
            newIndex = _currentIndex + 1; // swipe left → next
        }
    }

    _endDrag();

    if (newIndex !== _currentIndex) {
        _currentIndex = newIndex;
        if (_switchGroupFn) _switchGroupFn(_groups[newIndex]);
    }

    _updateTrackPosition(true);
    _updateIndicator();
    _updateTabStates();
    _updatePaneStates();
}

function _applyDragOffset(dx: any) {
    if (!_track) return;
    const baseOffset = -_currentIndex * (100 / _groupCount);

    // Rubber band at edges
    let adjustedDx = dx;
    if ((_currentIndex === 0 && dx > 0) || (_currentIndex === _groupCount - 1 && dx < 0)) {
        adjustedDx = dx * (RUBBER_BAND_MAX / (RUBBER_BAND_MAX + Math.abs(dx)));
    }

    const pxPercent = (adjustedDx / _container.offsetWidth) * (100 / _groupCount);
    _track.style.transform = `translateX(${baseOffset + pxPercent}%)`;
}

// --- UI updates ---

function _updateTrackPosition(animate: any) {
    if (!_track) return;
    const offset = -_currentIndex * (100 / _groupCount);
    if (!animate) _track.classList.add('swipe-dragging');
    _track.style.transform = `translateX(${offset}%)`;
    if (!animate) {
        // Force reflow then re-enable transitions
        void _track.offsetHeight;
        requestAnimationFrame(() => _track.classList.remove('swipe-dragging'));
    }
}

function _updateIndicator() {
    if (!_indicator || !_navTabs.length) return;
    const tab = _navTabs[_currentIndex];
    if (!tab) return;
    const nav = tab.parentElement;
    if (!nav) return;
    const tabRect = tab.getBoundingClientRect();
    const navRect = nav.getBoundingClientRect();
    _indicator.style.width = `${tabRect.width}px`;
    _indicator.style.transform = `translateX(${tabRect.left - navRect.left}px)`;
}

function _updateTabStates() {
    _navTabs.forEach((tab, i) => {
        tab.setAttribute('aria-selected', i === _currentIndex ? 'true' : 'false');
    });
}

function _updatePaneStates() {
    if (!_track) return;
    const panes = _track.querySelectorAll('.swipe-pane');
    panes.forEach((pane: any, i: any) => {
        pane.classList.toggle('swipe-pane--active', i === _currentIndex);
    });
}

function _isModelPane() {
    return _groups[_currentIndex] === 'model';
}
