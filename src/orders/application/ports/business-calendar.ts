export const BUSINESS_CALENDAR = Symbol('BUSINESS_CALENDAR');

/** Business days (they may start at a time other than midnight) in the business timezone. */
export interface BusinessCalendar {
  /** Business date (YYYY-MM-DD) in progress right now. */
  today(): Promise<string>;
  /** UTC bounds [start, end) covering the business dates from..to, both inclusive. */
  bounds(from: string, to: string): Promise<{ start: Date; end: Date }>;
}
