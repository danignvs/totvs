/**
 * Calculates the Easter date for a given year using the Meeus/Jones/Butcher algorithm.
 * Returns a Date object representing Easter Sunday in local time.
 */
export function getEasterDate(year: number): Date {
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
  const L = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * L) / 451);
  const month = Math.floor((h + L - 7 * m + 114) / 31);
  const day = ((h + L - 7 * m + 114) % 31) + 1;
  
  // Month is 1-indexed in the formula, JS Date uses 0-indexed month (month - 1)
  return new Date(year, month - 1, day);
}

export interface HolidayCheck {
  isHoliday: boolean;
  reason?: string;
}

/**
 * Checks if a given date is a weekend or a holiday in Brazil / Rio de Janeiro (City and State).
 */
export function checkHolidayOrWeekend(date: Date): HolidayCheck {
  const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { isHoliday: true, reason: "Final de Semana" };
  }

  const year = date.getFullYear();
  const month = date.getMonth(); // 0-11
  const day = date.getDate();

  // 1. Fixed National Holidays (Brazil)
  if (month === 0 && day === 1) return { isHoliday: true, reason: "Ano Novo (Confraternização Universal)" };
  if (month === 3 && day === 21) return { isHoliday: true, reason: "Tiradentes" };
  if (month === 4 && day === 1) return { isHoliday: true, reason: "Dia do Trabalho" };
  if (month === 8 && day === 7) return { isHoliday: true, reason: "Independência do Brasil" };
  if (month === 9 && day === 12) return { isHoliday: true, reason: "Nossa Senhora Aparecida" };
  if (month === 10 && day === 2) return { isHoliday: true, reason: "Finados" };
  if (month === 10 && day === 15) return { isHoliday: true, reason: "Proclamação da República" };
  if (month === 10 && day === 20) return { isHoliday: true, reason: "Dia Nacional de Zumbi e da Consciência Negra" };
  if (month === 11 && day === 25) return { isHoliday: true, reason: "Natal" };

  // 2. Fixed State & Municipal Holidays (Rio de Janeiro State and City)
  if (month === 0 && day === 20) return { isHoliday: true, reason: "Dia de São Sebastião (Padroeiro do Rio)" };
  if (month === 3 && day === 23) return { isHoliday: true, reason: "Dia de São Jorge (Feriado Estadual RJ)" };

  // 3. Movable Holidays (dependent on Easter)
  const easter = getEasterDate(year);
  
  // Reset hours to compare dates precisely
  const cleanDate = new Date(year, month, day).getTime();
  const cleanEaster = new Date(easter.getFullYear(), easter.getMonth(), easter.getDate()).getTime();
  
  const diffTime = cleanDate - cleanEaster;
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === -48) return { isHoliday: true, reason: "Segunda-feira de Carnaval" };
  if (diffDays === -47) return { isHoliday: true, reason: "Terça-feira de Carnaval" };
  if (diffDays === -46) return { isHoliday: true, reason: "Quarta-feira de Cinzas (Ponto Facultativo)" };
  if (diffDays === -2) return { isHoliday: true, reason: "Sexta-feira Santa (Paixão de Cristo)" };
  if (diffDays === 0) return { isHoliday: true, reason: "Domingo de Páscoa" };
  if (diffDays === 60) return { isHoliday: true, reason: "Corpus Christi" };

  return { isHoliday: false };
}

/**
 * Format Date to YYYY-MM-DD
 */
export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parses YYYY-MM-DD string to Date object
 */
export function parseDateKey(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Returns a list of dates between start and end (inclusive) excluding weekends and holidays
 */
export function getWorkingDaysInRange(startDateStr: string, endDateStr: string): string[] {
  const start = parseDateKey(startDateStr);
  const end = parseDateKey(endDateStr);
  const days: string[] = [];
  
  const current = new Date(start);
  while (current <= end) {
    const check = checkHolidayOrWeekend(current);
    if (!check.isHoliday) {
      days.push(formatDateKey(current));
    }
    current.setDate(current.getDate() + 1);
  }
  return days;
}
