export const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export function formatMinutesToClock(min: number): string {
  const totalMin = Math.round(min);
  const h24 = Math.floor(totalMin / 60) % 24;
  const m = ((totalMin % 60) + 60) % 60;
  return `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatMetricValue(val: number, unit: string): string {
  if (!Number.isFinite(val)) return '-';
  if (unit === '$') {
    return `$${Math.round(val).toLocaleString('en-US')}`;
  }
  if (unit === 'share') {
    return `${(val * 100).toFixed(1)}%`;
  }
  if (unit === 'min' || unit === 'seats') {
    return val.toFixed(1);
  }
  return val.toFixed(1);
}

export function formatSignedDelta(delta: number, unit: string): string {
  if (!Number.isFinite(delta)) return '-';
  const sign = delta > 0 ? '+' : delta < 0 ? '-' : '';
  const abs = Math.abs(delta);
  if (unit === '$') {
    return `${sign}$${Math.round(abs).toLocaleString('en-US')}`;
  }
  if (unit === 'share') {
    return `${sign}${(abs * 100).toFixed(1)} pp`;
  }
  return `${sign}${abs.toFixed(1)}`;
}
