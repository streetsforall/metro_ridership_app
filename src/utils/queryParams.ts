export function parseMonthParam(value: string): Date | null {
  const [yearStr, monthStr] = value.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) return null;
  return new Date(year, month - 1);
}

export function formatMonthParam(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export const dayOfWeekToParam: Record<string, string> = {
  est_wkday_ridership: 'wkday',
  est_sat_ridership: 'sat',
  est_sun_ridership: 'sun',
};

export const paramToDayOfWeek: Record<string, string> = {
  wkday: 'est_wkday_ridership',
  sat: 'est_sat_ridership',
  sun: 'est_sun_ridership',
};

export function parseModesFromParams(params: URLSearchParams): string[] {
  const modes: string[] = [];
  if (params.get('buses') !== '0') modes.push('bus');
  if (params.get('trains') !== '0') modes.push('train');
  return modes;
}
