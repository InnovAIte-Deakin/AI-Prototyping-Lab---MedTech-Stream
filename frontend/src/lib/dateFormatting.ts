const DAY_MONTH_YEAR_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
};

export function formatUtcDate(date: string | number | Date): string {
  return new Date(date).toLocaleDateString(undefined, {
    ...DAY_MONTH_YEAR_FORMAT,
    timeZone: 'UTC',
  });
}

export function formatLocalDate(date: string | number | Date): string {
  return new Date(date).toLocaleDateString(undefined, DAY_MONTH_YEAR_FORMAT);
}

