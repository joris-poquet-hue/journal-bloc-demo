export function getTodayIsoDate() {
  return toIsoDate(new Date());
}

export function shiftIsoDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

export function formatIsoDate(value: string) {
  if (isIsoDateTime(value)) {
    return formatIsoDate(value.slice(0, 10));
  }

  if (!isValidIsoDate(value)) {
    return value;
  }

  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

export function isValidIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const [, year, month, day] = match;
  const isoDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  return (
    isoDate.getUTCFullYear() === Number(year) &&
    isoDate.getUTCMonth() === Number(month) - 1 &&
    isoDate.getUTCDate() === Number(day)
  );
}

function isIsoDateTime(value: string) {
  return /^(\d{4})-(\d{2})-(\d{2})T/.test(value);
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}
