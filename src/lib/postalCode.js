const PH_NCR_REGION_CODE = '1300000000';

const STATIC_POSTAL_CODES = new Map([
  [`PH|${PH_NCR_REGION_CODE}|city of caloocan`, '1400'],
  [`PH|${PH_NCR_REGION_CODE}|city of las pinas`, '1740'],
  [`PH|${PH_NCR_REGION_CODE}|city of makati`, '1200'],
  [`PH|${PH_NCR_REGION_CODE}|city of malabon`, '1470'],
  [`PH|${PH_NCR_REGION_CODE}|city of mandaluyong`, '1550'],
  [`PH|${PH_NCR_REGION_CODE}|city of manila`, '1000'],
  [`PH|${PH_NCR_REGION_CODE}|city of marikina`, '1800'],
  [`PH|${PH_NCR_REGION_CODE}|city of muntinlupa`, '1770'],
  [`PH|${PH_NCR_REGION_CODE}|city of navotas`, '1485'],
  [`PH|${PH_NCR_REGION_CODE}|city of paranaque`, '1700'],
  [`PH|${PH_NCR_REGION_CODE}|city of pasig`, '1600'],
  [`PH|${PH_NCR_REGION_CODE}|city of san juan`, '1500'],
  [`PH|${PH_NCR_REGION_CODE}|city of taguig`, '1630'],
  [`PH|${PH_NCR_REGION_CODE}|city of valenzuela`, '1440'],
  [`PH|${PH_NCR_REGION_CODE}|pasay city`, '1300'],
  [`PH|${PH_NCR_REGION_CODE}|pateros`, '1620'],
  [`PH|${PH_NCR_REGION_CODE}|quezon city`, '1100'],
]);

const normalize = (value = '') => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

export const getStaticPostalCode = ({ countryCode, regionCode, regionName, city }) => {
  const regionKey = regionCode || normalize(regionName);
  return STATIC_POSTAL_CODES.get(`${countryCode}|${regionKey}|${normalize(city)}`) || '';
};

const postalCodeCache = new Map();
let lastLookupAt = 0;

const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export async function lookupPostalCode({ city, region, parentRegion, country, countryCode, regionCode }) {
  const key = [countryCode, regionCode || region, parentRegion, city].map(normalize).join('|');
  if (postalCodeCache.has(key)) return postalCodeCache.get(key);

  const delay = Math.max(0, 1100 - (Date.now() - lastLookupAt));
  if (delay) await wait(delay);

  const endpoint = import.meta.env.VITE_POSTAL_LOOKUP_ENDPOINT || 'https://nominatim.openstreetmap.org/search';
  const params = new URLSearchParams({
    city,
    country,
    countrycodes: countryCode.toLowerCase(),
    format: 'jsonv2',
    addressdetails: '1',
    limit: '1',
  });
  if (region) params.set('state', region);
  if (parentRegion && normalize(parentRegion) !== normalize(region)) params.set('county', parentRegion);

  lastLookupAt = Date.now();
  const response = await fetch(`${endpoint}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    referrerPolicy: 'strict-origin-when-cross-origin',
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Postal lookup service returned HTTP ${response.status}.`);

  const results = await response.json();
  const postalCode = results?.[0]?.address?.postcode || '';
  if (postalCode) postalCodeCache.set(key, postalCode);
  return postalCode;
}
