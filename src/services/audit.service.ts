import type { Tx } from '../db/prisma';
import { prisma } from '../db/prisma';

/** Keys that must never be persisted to the audit trail. */
const REDACTED_KEYS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'currentPassword',
  'newPassword',
  'token',
  'accessToken',
  'refreshToken',
  'refreshTokenHash',
  'secret',
  'authorization',
]);

function sanitize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sanitize);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACTED_KEYS.has(k) ? '[REDACTED]' : sanitize(v);
    }
    return out;
  }
  return value;
}

function serialize(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(sanitize(value));
}

export interface AuditInput {
  userId?: number | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  oldValue?: unknown;
  newValue?: unknown;
  ip?: string | null;
}

export const AuditService = {
  /**
   * Records an admin action. Pass the surrounding transaction client so the audit entry
   * is committed atomically with the change it describes.
   */
  async record(input: AuditInput, tx: Tx = prisma) {
    return tx.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId === null || input.entityId === undefined ? null : String(input.entityId),
        oldValue: serialize(input.oldValue),
        newValue: serialize(input.newValue),
        ip: input.ip ?? null,
      },
    });
  },

  async list(params: {
    skip: number;
    take: number;
    userId?: number;
    action?: string;
    entityType?: string;
    entityId?: string;
    from?: Date;
    to?: Date;
  }) {
    const where = {
      ...(params.userId ? { userId: params.userId } : {}),
      ...(params.action ? { action: params.action } : {}),
      ...(params.entityType ? { entityType: params.entityType } : {}),
      ...(params.entityId ? { entityId: params.entityId } : {}),
      ...(params.from || params.to
        ? { createdAt: { ...(params.from ? { gte: params.from } : {}), ...(params.to ? { lte: params.to } : {}) } }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);
    return { items, total };
  },
};

export const AUDIT_ACTIONS = {
  PRODUCT_CREATED: 'PRODUCT_CREATED',
  PRODUCT_UPDATED: 'PRODUCT_UPDATED',
  PRODUCT_DELETED: 'PRODUCT_DELETED',
  CATEGORY_CREATED: 'CATEGORY_CREATED',
  CATEGORY_UPDATED: 'CATEGORY_UPDATED',
  CATEGORY_DELETED: 'CATEGORY_DELETED',
  VARIANT_CREATED: 'VARIANT_CREATED',
  VARIANT_UPDATED: 'VARIANT_UPDATED',
  VARIANT_DELETED: 'VARIANT_DELETED',
  PRICE_CHANGED: 'PRICE_CHANGED',
  IMAGE_ADDED: 'IMAGE_ADDED',
  IMAGE_DELETED: 'IMAGE_DELETED',
  INVENTORY_ADJUSTED: 'INVENTORY_ADJUSTED',
  PURCHASE_CREATED: 'PURCHASE_CREATED',
  PURCHASE_RECEIVED: 'PURCHASE_RECEIVED',
  PURCHASE_CANCELLED: 'PURCHASE_CANCELLED',
  ORDER_CREATED: 'ORDER_CREATED',
  ORDER_COMPLETED: 'ORDER_COMPLETED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
  ORDER_STATUS_CHANGED: 'ORDER_STATUS_CHANGED',
  RETURN_CREATED: 'RETURN_CREATED',
  RETURN_ACCEPTED: 'RETURN_ACCEPTED',
  RETURN_REJECTED: 'RETURN_REJECTED',
  SUPPLIER_CREATED: 'SUPPLIER_CREATED',
  SUPPLIER_UPDATED: 'SUPPLIER_UPDATED',
  SUPPLIER_DELETED: 'SUPPLIER_DELETED',
  CUSTOMER_STATUS_CHANGED: 'CUSTOMER_STATUS_CHANGED',
  SETTING_UPDATED: 'SETTING_UPDATED',
  SUPER_ADMIN_BOOTSTRAPPED: 'SUPER_ADMIN_BOOTSTRAPPED',
} as const;
