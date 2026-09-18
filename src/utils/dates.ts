export type DatePreset = 'today' | 'week' | 'month' | 'year';

export interface DateRange {
  from: Date;
  to: Date;
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Week starts on Monday. */
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

export function startOfMonth(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

export function startOfYear(d: Date): Date {
  const x = startOfMonth(d);
  x.setMonth(0);
  return x;
}

/**
 * Resolves a reporting window from either an explicit from/to pair or a named preset.
 * Defaults to "today".
 */
export function resolveDateRange(input: {
  from?: string | Date;
  to?: string | Date;
  preset?: DatePreset;
  now?: Date;
}): DateRange {
  const now = input.now ?? new Date();

  if (input.from || input.to) {
    const from = input.from ? startOfDay(new Date(input.from)) : startOfDay(now);
    const to = input.to ? endOfDay(new Date(input.to)) : endOfDay(now);
    return { from, to };
  }

  switch (input.preset) {
    case 'week':
      return { from: startOfWeek(now), to: endOfDay(now) };
    case 'month':
      return { from: startOfMonth(now), to: endOfDay(now) };
    case 'year':
      return { from: startOfYear(now), to: endOfDay(now) };
    case 'today':
    default:
      return { from: startOfDay(now), to: endOfDay(now) };
  }
}
