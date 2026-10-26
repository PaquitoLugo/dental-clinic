import { PH_REGIONS } from '../data/phAddressData';

/**
 * Address helpers.
 *
 * Regions, provinces and cities/municipalities come from the bundled PSGC dataset, so the lists are
 * always complete (the live API was missing entries, in particular independent / highly urbanized
 * cities such as Cebu City, Davao City, Baguio or Zamboanga City that sit directly under a region
 * instead of under a province). Barangays (~42,000 rows) are loaded from the live PSGC APIs on demand,
 * and the UI falls back to manual entry if both APIs fail.
 */

export const INDEPENDENT = '__independent__';

const toItem = ([code, name]) => ({ code, name });

export const getRegions = () => PH_REGIONS.map(({ code, name }) => ({ code, name }));

const findRegion = (regionCode) => PH_REGIONS.find((r) => r.code === regionCode);

/** Provinces of a region. Includes a pseudo-province for cities that belong to no province. */
export const getProvinces = (regionCode) => {
  const region = findRegion(regionCode);
  if (!region) return [];
  const list = region.provinces.map(({ code, name }) => ({ code, name }));
  if (region.provinces.length > 0 && region.cities.length > 0) {
    list.push({ code: INDEPENDENT, name: 'Independent / Highly Urbanized Cities' });
  }
  return list;
};

/** A region like NCR has no provinces; its cities are listed directly. */
export const regionHasProvinces = (regionCode) => (findRegion(regionCode)?.provinces.length || 0) > 0;

export const getCities = (regionCode, provinceCode) => {
  const region = findRegion(regionCode);
  if (!region) return [];
  if (!region.provinces.length || provinceCode === INDEPENDENT) return region.cities.map(toItem);
  const province = region.provinces.find((p) => p.code === provinceCode);
  return province ? province.cities.map(toItem) : [];
};

const barangayCache = new Map();

async function fetchJson(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Returns [] when every source fails, so the caller can switch to a manual text field. */
export async function getBarangays(cityCode) {
  if (!cityCode) return [];
  if (barangayCache.has(cityCode)) return barangayCache.get(cityCode);

  const sources = [
    `https://psgc.gitlab.io/api/cities-municipalities/${cityCode}/barangays/`,
    `https://psgc.cloud/api/cities-municipalities/${cityCode}/barangays`,
  ];

  for (const url of sources) {
    try {
      const data = await fetchJson(url);
      const rows = (Array.isArray(data) ? data : data?.data || [])
        .filter((b) => b && b.code && b.name)
        .map((b) => ({ code: String(b.code), name: b.name }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      if (rows.length > 0) {
        barangayCache.set(cityCode, rows);
        return rows;
      }
    } catch (err) {
      console.warn('Barangay source failed:', url, err.message);
    }
  }
  return [];
}

export const buildCompleteAddress = (a) =>
  [a.street, a.barangayName, a.cityName, a.provinceName, a.regionName].filter(Boolean).join(', ');

export const EMPTY_ADDRESS = {
  street: '',
  regionCode: '', regionName: '',
  provinceCode: '', provinceName: '',
  cityCode: '', cityName: '',
  barangayCode: '', barangayName: '',
};