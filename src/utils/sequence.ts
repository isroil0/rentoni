import type { Tx } from '../db/prisma';

/**
 * Race-safe document numbering. The UPDATE is atomic inside the caller's transaction,
 * so two concurrent orders can never receive the same number.
 */
export async function nextSequence(tx: Tx, key: string): Promise<number> {
  await tx.$executeRaw`
    INSERT INTO number_sequences ("key", "value") VALUES (${key}, 0)
    ON CONFLICT("key") DO NOTHING
  `;
  await tx.$executeRaw`UPDATE number_sequences SET "value" = "value" + 1 WHERE "key" = ${key}`;
  const rows = await tx.$queryRaw<
    { value: number }[]
  >`SELECT "value" FROM number_sequences WHERE "key" = ${key}`;
  return rows[0]?.value ?? 1;
}

function datePart(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

export async function nextDocumentNumber(
  tx: Tx,
  key: string,
  prefix: string,
  now = new Date(),
): Promise<string> {
  const n = await nextSequence(tx, key);
  return `${prefix}-${datePart(now)}-${String(n).padStart(5, '0')}`;
}
