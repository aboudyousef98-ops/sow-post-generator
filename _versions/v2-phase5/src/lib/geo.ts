// Nearest-metro resolution for unrecognized regions (Aboud, 2026-09-26):
// when the SF region is neither HOU nor DFW, decide whether the site is closer
// to Dallas or Houston so the right region lead gets tagged and the post shows
// "Corpus Christi – Near Houston". Deterministic first: a small table of Texas
// cities + haversine distance. AI (/api/region) is only the fallback for
// cities not in this table.

export type Metro = 'HOU' | 'DFW';

const DALLAS = { lat: 32.7767, lon: -96.797 };
const HOUSTON = { lat: 29.7604, lon: -95.3698 };

/** Texas cities in/near the service area. Coordinates are city centers (approx). */
const CITIES: Record<string, { lat: number; lon: number }> = {
  'corpus christi': { lat: 27.8006, lon: -97.3964 },
  austin: { lat: 30.2672, lon: -97.7431 },
  'san antonio': { lat: 29.4241, lon: -98.4936 },
  waco: { lat: 31.5493, lon: -97.1467 },
  killeen: { lat: 31.1171, lon: -97.7278 },
  temple: { lat: 31.0982, lon: -97.3428 },
  tyler: { lat: 32.3513, lon: -95.3011 },
  longview: { lat: 32.5007, lon: -94.7405 },
  lufkin: { lat: 31.3382, lon: -94.7291 },
  nacogdoches: { lat: 31.6035, lon: -94.6555 },
  'college station': { lat: 30.628, lon: -96.3344 },
  bryan: { lat: 30.6744, lon: -96.37 },
  victoria: { lat: 28.8053, lon: -97.0036 },
  laredo: { lat: 27.5306, lon: -99.4803 },
  mcallen: { lat: 26.2034, lon: -98.23 },
  brownsville: { lat: 25.9018, lon: -97.4975 },
  harlingen: { lat: 26.1906, lon: -97.6961 },
  galveston: { lat: 29.3013, lon: -94.7977 },
  abilene: { lat: 32.4487, lon: -99.7331 },
  'wichita falls': { lat: 33.9137, lon: -98.4934 },
  amarillo: { lat: 35.222, lon: -101.8313 },
  lubbock: { lat: 33.5779, lon: -101.8552 },
  midland: { lat: 31.9973, lon: -102.0779 },
  odessa: { lat: 31.8457, lon: -102.3676 },
  'el paso': { lat: 31.7619, lon: -106.485 },
  'san angelo': { lat: 31.4638, lon: -100.437 },
  texarkana: { lat: 33.4251, lon: -94.0477 },
  sherman: { lat: 33.6357, lon: -96.6089 },
  corsicana: { lat: 32.0954, lon: -96.4689 },
  palestine: { lat: 31.7621, lon: -95.6308 },
  huntsville: { lat: 30.7235, lon: -95.5508 },
  conroe: { lat: 30.3119, lon: -95.4561 },
  'round rock': { lat: 30.5083, lon: -97.6789 },
  georgetown: { lat: 30.6333, lon: -97.677 },
  'new braunfels': { lat: 29.703, lon: -98.1245 },
  'san marcos': { lat: 29.8833, lon: -97.9414 },
  'port arthur': { lat: 29.885, lon: -93.9399 },
  'port lavaca': { lat: 28.615, lon: -96.6261 },
  'bay city': { lat: 28.9828, lon: -95.9694 },
};

/** Great-circle distance in km. */
function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export interface NearestResult {
  metro: Metro;
  city: string;
}

/**
 * Scan free text (region raw / jurisdiction / address) for a known Texas city
 * and return the closer metro. Longest city-name match wins. Null = unknown
 * (caller may fall back to /api/region).
 */
export function nearestMetro(text: string): NearestResult | null {
  const s = text.toLowerCase();
  let best: { name: string; coords: { lat: number; lon: number } } | null = null;
  for (const [name, coords] of Object.entries(CITIES)) {
    if (new RegExp(`\\b${name}\\b`).test(s) && (!best || name.length > best.name.length)) {
      best = { name, coords };
    }
  }
  if (!best) return null;
  const metro: Metro =
    haversineKm(best.coords, HOUSTON) <= haversineKm(best.coords, DALLAS) ? 'HOU' : 'DFW';
  const city = best.name.replace(/\b\w/g, (c) => c.toUpperCase());
  return { metro, city };
}

export function metroCityName(metro: Metro): string {
  return metro === 'HOU' ? 'Houston' : 'Dallas';
}
