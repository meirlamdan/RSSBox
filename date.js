
export function formatDate(ts = Date.now()) {
  const d = new Date(ts);

  const date = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);

  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(d);

  return `${date} ${time}`; // 2025-08-13 13:07
}


export function timeAgo(ts) {
  const rtf = new Intl.RelativeTimeFormat('he', { numeric: 'auto' });
  const diffSec = Math.round((ts - Date.now()) / 1000); // שלילי=עבר
  const units = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['week', 60 * 60 * 24 * 7],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
    ['second', 1],
  ];
  for (const [unit, sec] of units) {
    const v = Math.trunc(diffSec / sec);
    if (v !== 0) return rtf.format(v, unit);
  }
  return 'הרגע';
}



