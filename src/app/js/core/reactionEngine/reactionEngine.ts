/**
 * Reaction Engine - Event-driven rule engine (SPEC_REACTION_ENGINE_V1).
 *
 * Processes event triggers and fires configured reactions/actions in response.
 * Pure logic module: no browser APIs, no DOM, no network.
 *
 * Key concepts:
 *   Trigger  - event type + condition predicate
 *   Reaction - action identifier + params to execute when trigger fires
 *   Rule     - trigger + reaction pair with optional debounce/cooldown/priority
 *
 * AGPL-3.0-only - Copyright (C) 2026 ecbyts contributors.
 *
 * @module core/reactionEngine/reactionEngine
 */

// ── Constants ─────────────────────────────────────────────────────────────────

/** Schema version for rule validation and migration guards. */
export const REACTION_SCHEMA_VERSION = '1.0';

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validate a rule object against the REACTION_ENGINE_V1 schema.
 *
 * @param rule - Rule to validate
 * @returns
 */
export function validateRule(rule: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!rule || typeof rule !== 'object') {
        errors.push('rule must be a non-null object');
        return { valid: false, errors };
    }

    // id
    if (!rule.id || typeof rule.id !== 'string' || rule.id.trim() === '') {
        errors.push('rule.id must be a non-empty string');
    }

    // trigger
    if (!rule.trigger || typeof rule.trigger !== 'object') {
        errors.push('rule.trigger must be an object');
    } else {
        if (!rule.trigger.eventType || typeof rule.trigger.eventType !== 'string') {
            errors.push('rule.trigger.eventType must be a non-empty string');
        }
        if (rule.trigger.condition !== undefined && typeof rule.trigger.condition !== 'function') {
            errors.push('rule.trigger.condition must be a function when provided');
        }
    }

    // reaction
    if (!rule.reaction || typeof rule.reaction !== 'object') {
        errors.push('rule.reaction must be an object');
    } else {
        if (!rule.reaction.action || typeof rule.reaction.action !== 'string') {
            errors.push('rule.reaction.action must be a non-empty string');
        }
    }

    // opts (all optional, check types when present)
    if (rule.opts !== undefined) {
        if (typeof rule.opts !== 'object' || rule.opts === null) {
            errors.push('rule.opts must be an object when provided');
        } else {
            if (rule.opts.priority !== undefined && typeof rule.opts.priority !== 'number') {
                errors.push('rule.opts.priority must be a number');
            }
            if (
                rule.opts.cooldownMs !== undefined &&
                (typeof rule.opts.cooldownMs !== 'number' || rule.opts.cooldownMs < 0)
            ) {
                errors.push('rule.opts.cooldownMs must be a non-negative number');
            }
            if (
                rule.opts.maxFires !== undefined &&
                (typeof rule.opts.maxFires !== 'number' || rule.opts.maxFires < 0)
            ) {
                errors.push('rule.opts.maxFires must be a non-negative number');
            }
            if (rule.opts.enabled !== undefined && typeof rule.opts.enabled !== 'boolean') {
                errors.push('rule.opts.enabled must be a boolean');
            }
        }
    }

    return { valid: errors.length === 0, errors };
}

// ── Engine Factory ────────────────────────────────────────────────────────────

/**
 * Create a new reaction engine with the given rules.
 *
 * @param initialRules - Initial rules array
 * @returns Engine instance
 */
export function createReactionEngine(initialRules: any[] = []): any {
    /** ruleId → normalized rule */
    const _rules: Map<string, any> = new Map();

    /** ruleId → last fired timestamp (ms) */
    const _lastFired: Map<string, number> = new Map();

    /** ruleId → total fires count */
    const _fireCounts: Map<string, number> = new Map();

    /** ruleIds currently disabled at runtime */
    const _disabled: Set<string> = new Set();

    /** Running totals for getStats() */
    let _totalFired = 0;
    let _totalSkipped = 0;

    /**
     * Normalize a raw rule: apply defaults for opts.
     * @param rule
     * @returns Normalized rule
     */
    function _normalize(rule: any): any {
        return {
            id: rule.id,
            trigger: {
                eventType: rule.trigger.eventType,
                condition: typeof rule.trigger.condition === 'function' ? rule.trigger.condition : () => true,
            },
            reaction: {
                action: rule.reaction.action,
                params: rule.reaction.params ?? {},
            },
            opts: {
                priority: rule.opts?.priority ?? 0,
                cooldownMs: rule.opts?.cooldownMs ?? 0,
                maxFires: rule.opts?.maxFires ?? 0,
                enabled: rule.opts?.enabled !== false, // default true
            },
        };
    }

    // Seed initial rules
    for (const rule of initialRules) {
        const { valid, errors } = validateRule(rule);
        if (!valid) {
            throw new Error(`Invalid rule "${rule?.id}": ${errors.join('; ')}`);
        }
        if (_rules.has(rule.id)) {
            throw new Error(`Duplicate rule id: "${rule.id}"`);
        }
        _rules.set(rule.id, _normalize(rule));
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    /**
     * Process an event: match rules, apply guards, fire reactions.
     *
     * Rules are evaluated in descending priority order (highest first).
     *
     * @param eventType - Event type string
     * @param payload - Event payload passed to condition + reaction
     * @returns
     */
    function process(
        eventType: string,
        payload: any = {},
    ): {
        fired: Array<{ ruleId: string; action: string; payload: any }>;
        skipped: Array<{ ruleId: string; reason: string }>;
    } {
        const fired: Array<{ ruleId: string; action: string; payload: any }> = [];
        const skipped: Array<{ ruleId: string; reason: string }> = [];
        const now = Date.now();

        // Collect matching rules (exact match OR wildcard '*')
        const candidates: any[] = [];
        for (const [, rule] of _rules) {
            const et = rule.trigger.eventType;
            if (et === eventType || et === '*') {
                candidates.push(rule);
            }
        }

        // Sort by priority descending (stable: insertion order preserved for ties)
        candidates.sort((a, b) => b.opts.priority - a.opts.priority);

        for (const rule of candidates) {
            const ruleId = rule.id;

            // Guard: runtime-disabled
            if (_disabled.has(ruleId)) {
                skipped.push({ ruleId, reason: 'disabled' });
                _totalSkipped++;
                continue;
            }

            // Guard: opts.enabled false
            if (!rule.opts.enabled) {
                skipped.push({ ruleId, reason: 'disabled' });
                _totalSkipped++;
                continue;
            }

            // Guard: maxFires exceeded
            const fires = _fireCounts.get(ruleId) ?? 0;
            if (rule.opts.maxFires > 0 && fires >= rule.opts.maxFires) {
                skipped.push({ ruleId, reason: 'max_fires_reached' });
                _totalSkipped++;
                continue;
            }

            // Guard: cooldown
            if (rule.opts.cooldownMs > 0) {
                const last = _lastFired.get(ruleId) ?? 0;
                if (now - last < rule.opts.cooldownMs) {
                    skipped.push({ ruleId, reason: 'cooldown' });
                    _totalSkipped++;
                    continue;
                }
            }

            // Guard: condition predicate
            let conditionPassed: boolean;
            try {
                conditionPassed = !!rule.trigger.condition(payload);
            } catch {
                conditionPassed = false;
            }
            if (!conditionPassed) {
                skipped.push({ ruleId, reason: 'condition_false' });
                _totalSkipped++;
                continue;
            }

            // Fire
            _lastFired.set(ruleId, now);
            _fireCounts.set(ruleId, fires + 1);
            _totalFired++;

            fired.push({
                ruleId,
                action: rule.reaction.action,
                payload: rule.reaction.params,
            });
        }

        return { fired, skipped };
    }

    /**
     * Add a new rule to the engine. Throws if id is duplicate or rule is invalid.
     *
     * @param rule - Rule object
     */
    function addRule(rule: any): void {
        const { valid, errors } = validateRule(rule);
        if (!valid) {
            throw new Error(`Invalid rule "${rule?.id}": ${errors.join('; ')}`);
        }
        if (_rules.has(rule.id)) {
            throw new Error(`Duplicate rule id: "${rule.id}"`);
        }
        _rules.set(rule.id, _normalize(rule));
    }

    /**
     * Remove a rule by id.
     *
     * @param ruleId
     * @returns true if removed, false if not found
     */
    function removeRule(ruleId: string): boolean {
        if (!_rules.has(ruleId)) return false;
        _rules.delete(ruleId);
        _lastFired.delete(ruleId);
        _fireCounts.delete(ruleId);
        _disabled.delete(ruleId);
        return true;
    }

    /**
     * Disable a rule at runtime (rule remains in registry, will be skipped).
     *
     * @param ruleId
     */
    function disableRule(ruleId: string): void {
        _disabled.add(ruleId);
    }

    /**
     * Re-enable a previously disabled rule.
     *
     * @param ruleId
     */
    function enableRule(ruleId: string): void {
        _disabled.delete(ruleId);
    }

    /**
     * Get aggregate statistics for the engine.
     *
     * @returns
     */
    function getStats(): { total_fired: number; total_skipped: number; rules_count: number } {
        return {
            total_fired: _totalFired,
            total_skipped: _totalSkipped,
            rules_count: _rules.size,
        };
    }

    return { process, addRule, removeRule, disableRule, enableRule, getStats };
}
