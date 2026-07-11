// holidays-data.ts — French public holidays (static data)

export interface Holiday {
  /** ISO date YYYY-MM-DD */
  date: string;
  label: string;
}

/**
 * Returns French public holidays for a given year.
 * Covers fixed-date holidays + Easter-based moveable feasts.
 */
export function getFrenchHolidays(year: number): Holiday[] {
  // Easter Sunday (Anonymous Gregorian algorithm)
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const easterMonth = Math.floor((h + l - 7 * m + 114) / 31); // 1-based
  const easterDay = ((h + l - 7 * m + 114) % 31) + 1;

  const easter = new Date(year, easterMonth - 1, easterDay);

  const addDays = (base: Date, days: number): string => {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const fmt = (month: number, day: number): string =>
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return [
    { date: fmt(1, 1),   label: 'Jour de l\'an' },
    { date: addDays(easter, 1),  label: 'Lundi de Pâques' },
    { date: fmt(5, 1),   label: 'Fête du Travail' },
    { date: fmt(5, 8),   label: 'Victoire 1945' },
    { date: addDays(easter, 39), label: 'Ascension' },
    { date: addDays(easter, 50), label: 'Lundi de Pentecôte' },
    { date: fmt(7, 14),  label: 'Fête Nationale' },
    { date: fmt(8, 15),  label: 'Assomption' },
    { date: fmt(11, 1),  label: 'Toussaint' },
    { date: fmt(11, 11), label: 'Armistice' },
    { date: fmt(12, 25), label: 'Noël' },
  ];
}

/** Quick lookup: is a given ISO date a French public holiday? */
export function isFrenchHoliday(isoDate: string, year?: number): boolean {
  const y = year ?? parseInt(isoDate.slice(0, 4), 10);
  return getFrenchHolidays(y).some((h) => h.date === isoDate);
}
