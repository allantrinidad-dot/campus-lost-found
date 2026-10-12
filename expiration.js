function isExpired(item, today = new Date()) {
  const dateValue = item?.postedAt || (item?.date ? (/^\d{4}-\d{2}-\d{2}$/.test(item.date) ? `${item.date}T12:00:00` : item.date) : null);
  if (!dateValue) return false;

  const postedAt = new Date(dateValue).getTime();
  const todayTime = new Date(today).getTime();
  if (!Number.isFinite(postedAt) || !Number.isFinite(todayTime) || postedAt > todayTime) return false;

  return Math.floor((todayTime - postedAt) / 86400000) >= 30;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { isExpired };
if (typeof globalThis !== 'undefined') globalThis.isExpired = isExpired;
