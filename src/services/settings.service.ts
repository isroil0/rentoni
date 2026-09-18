import { prisma, type Tx } from '../db/prisma';
import { SETTING_KEYS } from '../config/constants';
import { AuditService, AUDIT_ACTIONS } from './audit.service';

const DEFAULTS: Record<string, string> = {
  [SETTING_KEYS.EXPOSE_EXACT_STOCK]: 'false',
  [SETTING_KEYS.STORE_NAME]: 'Rentoni Shirts',
  [SETTING_KEYS.CURRENCY]: 'USD',
  [SETTING_KEYS.CUSTOMER_CANCEL_WINDOW_HOURS]: '24',
  [SETTING_KEYS.CUSTOMER_RETURN_WINDOW_DAYS]: '14',
};

export const SettingsService = {
  async getRaw(key: string, tx: Tx = prisma): Promise<string> {
    const row = await tx.setting.findUnique({ where: { key } });
    return row?.value ?? DEFAULTS[key] ?? '';
  },

  async getBool(key: string, tx: Tx = prisma): Promise<boolean> {
    return (await this.getRaw(key, tx)).toLowerCase() === 'true';
  },

  async getNumber(key: string, fallback: number, tx: Tx = prisma): Promise<number> {
    const parsed = Number(await this.getRaw(key, tx));
    return Number.isFinite(parsed) ? parsed : fallback;
  },

  /** Whether customer-facing APIs may include exact stock counts. Defaults to false. */
  async exposeExactStock(tx: Tx = prisma): Promise<boolean> {
    return this.getBool(SETTING_KEYS.EXPOSE_EXACT_STOCK, tx);
  },

  async all() {
    const rows = await prisma.setting.findMany({ orderBy: { key: 'asc' } });
    const merged: Record<string, string> = { ...DEFAULTS };
    for (const row of rows) merged[row.key] = row.value;
    return merged;
  },

  async set(key: string, value: string, actor: { userId: number; ip?: string | null }) {
    const before = await prisma.setting.findUnique({ where: { key } });
    const row = await prisma.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
    await AuditService.record({
      userId: actor.userId,
      action: AUDIT_ACTIONS.SETTING_UPDATED,
      entityType: 'Setting',
      entityId: key,
      oldValue: before ? { value: before.value } : null,
      newValue: { value },
      ip: actor.ip ?? null,
    });
    return row;
  },

  async setMany(values: Record<string, string>, actor: { userId: number; ip?: string | null }) {
    for (const [key, value] of Object.entries(values)) {
      await this.set(key, value, actor);
    }
    return this.all();
  },

  DEFAULTS,
};
