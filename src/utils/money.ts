/**
 * Money is persisted as integer minor units (cents) and exposed over the API as
 * major units (e.g. 30 or 30.5). All conversion happens at the HTTP boundary.
 */

export function toMinor(major: number): number {
  return Math.round(major * 100);
}

export function toMajor(minor: number): number {
  return Math.round(minor) / 100;
}

/** Rounds to cents; used for proportional splits (e.g. distributing an order discount). */
export function round(value: number): number {
  return Math.round(value);
}
