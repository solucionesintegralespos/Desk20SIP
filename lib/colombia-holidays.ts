// National public holidays: Ley 51 de 1983, article 1.
// https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=4954
export function colombiaHolidays(year: number): Map<string, string> {
  const holidays = new Map<string, string>();
  const date = (month: number, day: number) => new Date(Date.UTC(year, month - 1, day, 12));
  const add = (day: Date, name: string, transfer = false) => {
    const observed = new Date(day);
    if (transfer) observed.setUTCDate(observed.getUTCDate() + (8 - observed.getUTCDay()) % 7);
    const key = observed.toISOString().slice(0, 10);
    holidays.set(key, holidays.has(key) ? `${holidays.get(key)} · ${name}` : name);
  };
  for (const [month, day, name] of [
    [1, 1, 'Año Nuevo'], [5, 1, 'Día del Trabajo'], [7, 20, 'Independencia de Colombia'],
    [8, 7, 'Batalla de Boyacá'], [12, 8, 'Inmaculada Concepción'], [12, 25, 'Navidad'],
  ] as const) add(date(month, day), name);
  for (const [month, day, name] of [
    [1, 6, 'Reyes Magos'], [3, 19, 'San José'], [6, 29, 'San Pedro y San Pablo'],
    [8, 15, 'Asunción de la Virgen'], [10, 12, 'Día de la Diversidad Étnica y Cultural'],
    [11, 1, 'Todos los Santos'], [11, 11, 'Independencia de Cartagena'],
  ] as const) add(date(month, day), name, true);

  // Gregorian Easter (Meeus/Jones/Butcher), using UTC to avoid timezone shifts.
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const easter = date(Math.floor((h + l - 7 * m + 114) / 31), (h + l - 7 * m + 114) % 31 + 1);
  for (const [offset, name, transfer] of [
    [-3, 'Jueves Santo', false], [-2, 'Viernes Santo', false],
    [39, 'Ascensión del Señor', true], [60, 'Corpus Christi', true], [68, 'Sagrado Corazón de Jesús', true],
  ] as const) {
    const day = new Date(easter);
    day.setUTCDate(day.getUTCDate() + offset);
    add(day, name, transfer);
  }
  return holidays;
}
