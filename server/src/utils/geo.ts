import { log } from './log.js';

interface GeoResult {
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  timezone: string | null;
}

const geoCache = new Map<string, { result: GeoResult; expiry: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Private/reserved IPs — skip lookup
const PRIVATE_IPS = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|fc00:|fe80:|localhost)/;

export async function getIPLocation(ip: string): Promise<GeoResult> {
  if (!ip || ip === 'unknown') {
    return { city: null, region: null, country: null, countryCode: null, timezone: null };
  }

  if (PRIVATE_IPS.test(ip)) {
    return { city: 'Local', region: null, country: null, countryCode: null, timezone: null };
  }

  const cached = geoCache.get(ip);
  if (cached && cached.expiry > Date.now()) {
    return cached.result;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,timezone`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { city: null, region: null, country: null, countryCode: null, timezone: null };
    }

    const data = await res.json();
    if (data.status !== 'success') {
      return { city: null, region: null, country: null, countryCode: null, timezone: null };
    }

    const result: GeoResult = {
      city: data.city || null,
      region: data.regionName || null,
      country: data.country || null,
      countryCode: data.countryCode || null,
      timezone: data.timezone || null,
    };

    geoCache.set(ip, { result, expiry: Date.now() + CACHE_TTL });
    return result;
  } catch (err) {
    log.warn('IP geolocation failed', { ip, error: String(err) });
    return { city: null, region: null, country: null, countryCode: null, timezone: null };
  }
}

export function formatLocation(geo: GeoResult): string {
  const parts: string[] = [];
  if (geo.city) parts.push(geo.city);
  if (geo.region && geo.region !== geo.city) parts.push(geo.region);
  if (geo.country) parts.push(geo.country);
  return parts.join(', ') || 'Unknown location';
}
