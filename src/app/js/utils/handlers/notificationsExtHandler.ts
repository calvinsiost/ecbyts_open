// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// utils/handlers/notificationsExtHandler.js
// Wire-up of P1-31 extended notifications types into UI.
// window.handleShowNotificationCategories() - shows categories + types + delivery channels.

import {
    NOTIFICATION_CATEGORIES,
    DELIVERY_CHANNELS,
    EXTENDED_TYPE_MAP,
    getDefaultEnabledTypes,
} from '../../core/notifications/extendedTypes.js';
import { showToast } from '../ui/toast.js';

export function handleShowNotificationCategories() {
    const types = Object.keys(EXTENDED_TYPE_MAP);
    const enabled = getDefaultEnabledTypes();
    const lines = [
        `Notifications — ${NOTIFICATION_CATEGORIES.length} categories, ${types.length} types`,
        `Channels: ${DELIVERY_CHANNELS.join(', ')}`,
        `Default enabled: ${enabled.length} types`,
    ];
    showToast(lines.join(' • '), 'info', 7000);
}

export const notificationsExtHandlers = { handleShowNotificationCategories };
