// Sunrise and sunset worked out on the page (NOAA's formulas), for when the
// forecast has none (Google not answering), and the golden hours.

const rad = Math.PI / 180;

// Sunrise and sunset (ms) on `date` ("YYYY-MM-DD", the place's day) at
// lat / lon, or null near the poles when the sun doesn't rise or set.
export function sunTimes(date, lat, lon) {
  const noonUtc = Date.parse(date + 'T12:00:00Z');
  const n = (noonUtc - Date.UTC(2000, 0, 1, 12)) / 86_400_000 - lon / 360;
  const M = (357.5291 + 0.98560028 * n) % 360;
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const L = (M + C + 180 + 102.9372) % 360;
  const transit = 2451545 + n + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * L * rad);
  const decl = Math.asin(Math.sin(L * rad) * Math.sin(23.44 * rad));
  const cosH = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(decl)) / (Math.cos(lat * rad) * Math.cos(decl));
  if (cosH < -1 || cosH > 1) return null;
  const H = Math.acos(cosH) / rad / 360;
  const toMs = jd => Math.round((jd - 2440587.5) * 86_400_000);
  return { sunrise: toMs(transit - H), sunset: toMs(transit + H) };
}

// The golden hours: the hour after sunrise and the hour before sunset.
export const goldenHours = ({ sunrise, sunset }) => ({ morning: [sunrise, sunrise + 3_600_000], evening: [sunset - 3_600_000, sunset] });

// How far through the day the sun is now (0 at sunrise, 1 at sunset), or
// null at night.
export function sunProgress({ sunrise, sunset }, now) {
  if (!(now >= sunrise && now <= sunset)) return null;
  return (now - sunrise) / (sunset - sunrise);
}
