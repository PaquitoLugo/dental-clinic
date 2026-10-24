import React, { useEffect, useMemo, useState } from 'react';
import {
  getRegions, getProvinces, getCities, getBarangays,
  regionHasProvinces, INDEPENDENT, EMPTY_ADDRESS,
} from '../lib/phAddress';

const selectClass = 'w-full border border-[#d4e2dc] rounded-xl p-2.5 bg-white text-xs font-semibold disabled:bg-gray-50 disabled:text-gray-400';
const labelClass = 'block font-bold text-[#607368] mb-1 text-xs';

/**
 * Cascading Region > Province > City/Municipality > Barangay selector.
 * value:    { street, regionCode, regionName, provinceCode, provinceName, cityCode, cityName, barangayCode, barangayName }
 * onChange: receives the full updated address object.
 */
export default function PhAddressSelect({ value, onChange, required = true }) {
  const addr = { ...EMPTY_ADDRESS, ...(value || {}) };
  const [barangays, setBarangays] = useState([]);
  const [loadingBarangays, setLoadingBarangays] = useState(false);

  const regions = useMemo(() => getRegions(), []);
  const provinces = useMemo(() => getProvinces(addr.regionCode), [addr.regionCode]);
  const showProvince = regionHasProvinces(addr.regionCode);
  const cities = useMemo(() => getCities(addr.regionCode, addr.provinceCode), [addr.regionCode, addr.provinceCode]);

  // Load barangays whenever the city changes
  useEffect(() => {
    let cancelled = false;
    setBarangays([]);
    if (!addr.cityCode) return undefined;
    setLoadingBarangays(true);
    getBarangays(addr.cityCode).then((rows) => {
      if (cancelled) return;
      setBarangays(rows);
      setLoadingBarangays(false);
    });
    return () => { cancelled = true; };
  }, [addr.cityCode]);

  const update = (patch) => onChange({ ...addr, ...patch });
  const nameOf = (list, code) => list.find((x) => x.code === code)?.name || '';

  const handleRegion = (code) =>
    update({
      regionCode: code, regionName: nameOf(regions, code),
      provinceCode: '', provinceName: '', cityCode: '', cityName: '', barangayCode: '', barangayName: '',
    });

  const handleProvince = (code) =>
    update({
      provinceCode: code, provinceName: code === INDEPENDENT ? '' : nameOf(provinces, code),
      cityCode: '', cityName: '', barangayCode: '', barangayName: '',
    });

  const handleCity = (code) =>
    update({ cityCode: code, cityName: nameOf(cities, code), barangayCode: '', barangayName: '' });

  const handleBarangay = (code) =>
    update({ barangayCode: code, barangayName: nameOf(barangays, code) });

  const barangayListMissing = addr.cityCode && !loadingBarangays && barangays.length === 0;
  const star = required ? ' *' : '';
  const provinceReady = !showProvince || !!addr.provinceCode;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="sm:col-span-2">
        <label className={labelClass}>House No. / Street{star}</label>
        <input
          className={selectClass}
          value={addr.street}
          required={required}
          placeholder="e.g. 123 Rizal St."
          onChange={(e) => update({ street: e.target.value })}
        />
      </div>

      <div>
        <label className={labelClass}>Region{star}</label>
        <select className={selectClass} value={addr.regionCode} required={required} onChange={(e) => handleRegion(e.target.value)}>
          <option value="">Select Region</option>
          {regions.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
        </select>
      </div>

      {showProvince ? (
        <div>
          <label className={labelClass}>Province{star}</label>
          <select
            className={selectClass}
            value={addr.provinceCode}
            required={required}
            disabled={!addr.regionCode}
            onChange={(e) => handleProvince(e.target.value)}
          >
            <option value="">Select Province</option>
            {provinces.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
        </div>
      ) : (
        <div className="hidden sm:block" />
      )}

      <div>
        <label className={labelClass}>City / Municipality{star}</label>
        <select
          className={selectClass}
          value={addr.cityCode}
          required={required}
          disabled={!addr.regionCode || !provinceReady}
          onChange={(e) => handleCity(e.target.value)}
        >
          <option value="">Select City / Municipality</option>
          {cities.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
      </div>

      <div>
        <label className={labelClass}>Barangay{star}</label>
        {barangayListMissing ? (
          <input
            className={selectClass}
            value={addr.barangayName}
            required={required}
            placeholder="Type your barangay"
            onChange={(e) => update({ barangayCode: '', barangayName: e.target.value })}
          />
        ) : (
          <select
            className={selectClass}
            value={addr.barangayCode}
            required={required}
            disabled={!addr.cityCode || loadingBarangays}
            onChange={(e) => handleBarangay(e.target.value)}
          >
            <option value="">{loadingBarangays ? 'Loading barangays...' : 'Select Barangay'}</option>
            {barangays.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
          </select>
        )}
        {barangayListMissing && (
          <p className="text-[10px] text-amber-700 font-semibold mt-1">
            The barangay list could not be loaded, so please type it in manually.
          </p>
        )}
      </div>
    </div>
  );
}