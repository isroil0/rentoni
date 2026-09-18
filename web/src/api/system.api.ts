import { api } from '@/lib/apiClient';
import type { AuditLogEntry, Settings } from './types';

export const SystemApi = {
  getSettings: () => api.get<Settings>('/admin/settings'),
  /** Only keys the backend actually understands are ever sent from the settings screen. */
  updateSettings: (settings: Settings) => api.put<Settings>('/admin/settings', { settings }),

  auditLogs: (
    query: {
      page?: number;
      limit?: number;
      userId?: number;
      action?: string;
      entityType?: string;
      entityId?: string;
      from?: string;
      to?: string;
    } = {},
  ) => api.list<AuditLogEntry>('/admin/audit-logs', query),
};
