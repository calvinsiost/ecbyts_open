// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * UX-68 Calendar Picker State - pure-logic, zero DOM, locale-agnostic.
 * Imutável: toda mutação retorna novo state frozen.
 */

const VALID_MODES = new Set(['single', 'range', 'multi']);
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse 'YYYY-MM-DD' → {year, month, day} (month 0..11). Throws em formato inválido. */
export function parseISO(isoStr: any): { year: number; month: number; day: number } {
    if (typeof isoStr !== 'string') {
        throw new Error(`parseISO: expected string, got ${typeof isoStr}`);
    }
    const m = ISO_RE.exec(isoStr);
    if (!m) throw new Error(`parseISO: invalid ISO date "${isoStr}"`);
    const year = Number(m[1]);
    const month = Number(m[2]) - 1;
    const day = Number(m[3]);
    if (month < 0 || month > 11) throw new Error(`parseISO: month out of range in "${isoStr}"`);
    const dim = getDaysInMonth(year, month);
    if (day < 1 || day > dim) throw new Error(`parseISO: day out of range in "${isoStr}"`);
    return { year, month, day };
}

/** Format (year, month 0..11, day) → 'YYYY-MM-DD'. */
export function formatISO(year: any, month: any, day: any): string {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        throw new Error('formatISO: year/month/day must be integers');
    }
    if (month < 0 || month > 11) throw new Error(`formatISO: month out of range ${month}`);
    const dim = getDaysInMonth(year, month);
    if (day < 1 || day > dim) throw new Error(`formatISO: day out of range ${day}`);
    const yyyy = String(year).padStart(4, '0');
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/** Days in (year, month 0..11). */
export function getDaysInMonth(year: any, month: any): number {
    if (!Number.isInteger(month) || month < 0 || month > 11) {
        throw new Error(`getDaysInMonth: month out of range ${month}`);
    }
    return new Date(year, month + 1, 0).getDate();
}

function isoToOrdinal(iso: any): number {
    const { year, month, day } = parseISO(iso);
    return year * 10000 + month * 100 + day;
}

function cmpISO(a: any, b: any): number {
    return isoToOrdinal(a) - isoToOrdinal(b);
}

function freezeState(s: any): any {
    if (s.multiSelected) Object.freeze(s.multiSelected);
    if (s.disabledDates) Object.freeze(s.disabledDates);
    Object.freeze(s.viewMonth);
    return Object.freeze(s);
}

/**
 * Cria estado inicial frozen do calendário.
 * @param opts
 * @param opts.mode
 * @param opts.weekStartsOn
 * @param opts.minDate
 * @param opts.maxDate
 * @param opts.disabledDates
 * @param opts.viewMonth
 */
export function createCalendarState(
    opts: {
        mode?: 'single' | 'range' | 'multi';
        weekStartsOn?: 0 | 1;
        minDate?: string;
        maxDate?: string;
        disabledDates?: Iterable<string>;
        viewMonth?: { year: number; month: number };
    } = {} as any,
): any {
    const {
        mode = 'single',
        weekStartsOn = 1,
        minDate = null,
        maxDate = null,
        disabledDates = [],
        viewMonth = null,
    } = opts as any;

    if (!VALID_MODES.has(mode)) {
        throw new Error(`createCalendarState: invalid mode "${mode}"`);
    }
    if (weekStartsOn !== 0 && weekStartsOn !== 1) {
        throw new Error(`createCalendarState: weekStartsOn must be 0 or 1`);
    }
    if (minDate !== null) parseISO(minDate);
    if (maxDate !== null) parseISO(maxDate);
    if (minDate && maxDate && cmpISO(minDate, maxDate) > 0) {
        throw new Error(`createCalendarState: minDate > maxDate`);
    }

    const disabledSet = new Set();
    for (const d of disabledDates) {
        parseISO(d);
        disabledSet.add(d);
    }

    let vm;
    if (viewMonth) {
        if (!Number.isInteger(viewMonth.year) || !Number.isInteger(viewMonth.month)) {
            throw new Error('createCalendarState: viewMonth.year/month must be integers');
        }
        if (viewMonth.month < 0 || viewMonth.month > 11) {
            throw new Error(`createCalendarState: viewMonth.month out of range`);
        }
        vm = { year: viewMonth.year, month: viewMonth.month };
    } else {
        const today = new Date();
        vm = { year: today.getFullYear(), month: today.getMonth() };
    }

    return freezeState({
        mode,
        weekStartsOn,
        minDate,
        maxDate,
        disabledDates: disabledSet,
        selectedDate: null,
        rangeStart: null,
        rangeEnd: null,
        multiSelected: new Set(),
        viewMonth: vm,
    });
}

/** Verifica se data está desabilitada (disabledDates OR < min OR > max). */
export function isDateDisabled(state: any, isoDate: any): boolean {
    parseISO(isoDate);
    if (state.disabledDates.has(isoDate)) return true;
    if (state.minDate && cmpISO(isoDate, state.minDate) < 0) return true;
    if (state.maxDate && cmpISO(isoDate, state.maxDate) > 0) return true;
    return false;
}

/** Seleciona data segundo o mode. Throws se disabled. Retorna novo state. */
export function selectDate(state: any, isoDate: any): any {
    parseISO(isoDate);
    if (isDateDisabled(state, isoDate)) {
        throw new Error(`selectDate: date "${isoDate}" is disabled`);
    }
    const next = cloneState(state);
    if (state.mode === 'single') {
        next.selectedDate = isoDate;
    } else if (state.mode === 'multi') {
        const ms = new Set(state.multiSelected);
        if (ms.has(isoDate)) ms.delete(isoDate);
        else ms.add(isoDate);
        next.multiSelected = ms;
    } else if (state.mode === 'range') {
        if (!state.rangeStart || (state.rangeStart && state.rangeEnd)) {
            // 1ª seleção (ou reset após par completo)
            next.rangeStart = isoDate;
            next.rangeEnd = null;
        } else {
            // 2ª seleção: completa range, swap se necessário
            if (cmpISO(isoDate, state.rangeStart) < 0) {
                next.rangeEnd = state.rangeStart;
                next.rangeStart = isoDate;
            } else {
                next.rangeEnd = isoDate;
            }
        }
    }
    return freezeState(next);
}

/** Limpa seleção (mantém viewMonth, mode, etc). */
export function clearSelection(state: any): any {
    const next = cloneState(state);
    next.selectedDate = null;
    next.rangeStart = null;
    next.rangeEnd = null;
    next.multiSelected = new Set();
    return freezeState(next);
}

/** Define viewMonth (year, month 0..11). Throws month fora de range. */
export function setViewMonth(state: any, year: any, month: any): any {
    if (!Number.isInteger(year) || !Number.isInteger(month)) {
        throw new Error('setViewMonth: year/month must be integers');
    }
    if (month < 0 || month > 11) {
        throw new Error(`setViewMonth: month out of range ${month}`);
    }
    const next = cloneState(state);
    next.viewMonth = { year, month };
    return freezeState(next);
}

export function nextMonth(state: any): any {
    const { year, month } = state.viewMonth;
    if (month === 11) return setViewMonth(state, year + 1, 0);
    return setViewMonth(state, year, month + 1);
}

export function prevMonth(state: any): any {
    const { year, month } = state.viewMonth;
    if (month === 0) return setViewMonth(state, year - 1, 11);
    return setViewMonth(state, year, month - 1);
}

export function nextYear(state: any): any {
    return setViewMonth(state, state.viewMonth.year + 1, state.viewMonth.month);
}

export function prevYear(state: any): any {
    return setViewMonth(state, state.viewMonth.year - 1, state.viewMonth.month);
}

/** Verifica se data está selecionada conforme o mode. */
export function isDateSelected(state: any, isoDate: any): boolean {
    parseISO(isoDate);
    if (state.mode === 'single') return state.selectedDate === isoDate;
    if (state.mode === 'multi') return state.multiSelected.has(isoDate);
    if (state.mode === 'range') {
        return state.rangeStart === isoDate || state.rangeEnd === isoDate;
    }
    return false;
}

/** Verifica se data está dentro do range (inclusive endpoints). */
export function isDateInRange(state: any, isoDate: any): boolean {
    parseISO(isoDate);
    if (state.mode !== 'range') return false;
    if (!state.rangeStart || !state.rangeEnd) return false;
    return cmpISO(isoDate, state.rangeStart) >= 0 && cmpISO(isoDate, state.rangeEnd) <= 0;
}

/**
 * Constrói grade 6×7 (42 dias) cobrindo o viewMonth, com dias do mês anterior/próximo
 * preenchendo as bordas. Cada célula: {isoDate, day, inCurrentMonth, isSelected, isInRange, isDisabled, isToday}.
 */
export function getMonthGrid(state: any): any {
    const { year, month } = state.viewMonth;
    const firstDow = new Date(year, month, 1).getDay(); // 0..6 (Sun..Sat)
    const offset = (firstDow - state.weekStartsOn + 7) % 7;

    // Primeira célula do grid (potencialmente do mês anterior)
    const startDate = new Date(year, month, 1 - offset);
    const today = new Date();
    const todayISO = formatISO(today.getFullYear(), today.getMonth(), today.getDate());

    const grid = [];
    for (let row = 0; row < 6; row++) {
        const week = [];
        for (let col = 0; col < 7; col++) {
            const idx = row * 7 + col;
            const d = new Date(startDate);
            d.setDate(startDate.getDate() + idx);
            const cy = d.getFullYear();
            const cm = d.getMonth();
            const cd = d.getDate();
            const iso = formatISO(cy, cm, cd);
            week.push({
                isoDate: iso,
                day: cd,
                inCurrentMonth: cm === month && cy === year,
                isSelected: isDateSelected(state, iso),
                isInRange: isDateInRange(state, iso),
                isDisabled: isDateDisabled(state, iso),
                isToday: iso === todayISO,
            });
        }
        grid.push(week);
    }
    return grid;
}

/** Sumário do estado para HUD/telemetria. */
export function summarizeCalendar(state: any): any {
    let hasSelection = false;
    let selectionCount = 0;
    if (state.mode === 'single') {
        hasSelection = state.selectedDate !== null;
        selectionCount = hasSelection ? 1 : 0;
    } else if (state.mode === 'multi') {
        selectionCount = state.multiSelected.size;
        hasSelection = selectionCount > 0;
    } else if (state.mode === 'range') {
        if (state.rangeStart && state.rangeEnd) {
            hasSelection = true;
            selectionCount = 2;
        } else if (state.rangeStart) {
            hasSelection = true;
            selectionCount = 1;
        }
    }
    return {
        mode: state.mode,
        hasSelection,
        selectionCount,
        viewMonth: { year: state.viewMonth.year, month: state.viewMonth.month },
    };
}

// ---- internal ----

function cloneState(s: any): any {
    return {
        mode: s.mode,
        weekStartsOn: s.weekStartsOn,
        minDate: s.minDate,
        maxDate: s.maxDate,
        disabledDates: s.disabledDates, // Set é frozen via Object.freeze (impede add/del? não — Set ignora freeze. OK porque clonamos em selectDate)
        selectedDate: s.selectedDate,
        rangeStart: s.rangeStart,
        rangeEnd: s.rangeEnd,
        multiSelected: s.multiSelected,
        viewMonth: { year: s.viewMonth.year, month: s.viewMonth.month },
    };
}
