import { useCallback, useEffect, useState } from 'react';
import { getData as getCountryData } from 'country-list';
import { supabase } from '../lib/supabase';
import PhAddressSelect from './PhAddressSelect';
import { EMPTY_ADDRESS, buildCompleteAddress } from '../lib/phAddress';
import { getStaticPostalCode, lookupPostalCode } from '../lib/postalCode';
import { getPhoneCallingCode, toNationalPhoneDigits } from '../lib/phoneNumber';
import {
  validateProfileBirthdate,
  validateProfileMobile,
  validateProfileName,
  validateProfileUsername,
} from '../lib/profileValidation';

const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
const countries = getCountryData()
  .map(({ code, name }) => ({ code, name: countryNames.of(code) || name }))
  .sort((a, b) => a.name.localeCompare(b.name));
const inputClass = 'mt-1 w-full rounded-xl border border-[#d4e2dc] bg-white p-2.5 text-sm focus:border-[#164e43] focus:outline-none';
const labelClass = 'block text-xs font-bold text-[#40584f]';
const profileFields = 'id, role, first_name, middle_name, last_name, full_name, username, email, mobile_number, birthdate, sex, complete_address, country_code, country_name, postal_code, street, region_code, region_name, province_code, province_name, city_code, city_name, barangay_code, barangay_name, is_guardian, guardian_name, guardian_relationship, guardian_contact';
const countriesWithSubdivisions = new Set(['US', 'CA', 'AU', 'IN', 'BR', 'MX', 'JP', 'KR', 'CN', 'NZ', 'GB']);
const subdivisionLabel = (countryCode) => ({
  US: 'State', CA: 'Province', AU: 'State / Territory', IN: 'State / Union Territory',
  BR: 'State', MX: 'State', JP: 'Prefecture', KR: 'Province / Metropolitan City',
  CN: 'Province', NZ: 'Region', GB: 'County',
}[countryCode] || 'State / Province / Region');
const postalLabel = (countryCode) => ({
  US: 'ZIP code', GB: 'Postcode', IE: 'Eircode',
}[countryCode] || (['CA', 'AU', 'NZ'].includes(countryCode) ? 'Postcode' : 'Postal code'));

const nameParts = (profile) => {
  const parts = (profile.full_name || '').trim().split(/\s+/).filter(Boolean);
  return {
    first_name: profile.first_name || parts[0] || '',
    middle_name: profile.middle_name || (parts.length > 2 ? parts.slice(1, -1).join(' ') : ''),
    last_name: profile.last_name || (parts.length > 1 ? parts[parts.length - 1] : ''),
  };
};

const toForm = (profile) => ({
  ...nameParts(profile),
  username: profile.username || '',
  email: profile.email || '',
  mobile_number: toNationalPhoneDigits(profile.mobile_number || '', profile.country_code || 'PH'),
  birthdate: profile.birthdate || '',
  sex: profile.sex || '',
  complete_address: profile.complete_address || '',
  country_code: profile.country_code || 'PH',
  postal_code: profile.postal_code || '',
  is_guardian: Boolean(profile.is_guardian),
  guardian_name: profile.guardian_name || '',
  guardian_relationship: profile.guardian_relationship || '',
  guardian_contact: toNationalPhoneDigits(profile.guardian_contact || '', profile.country_code || 'PH'),
});

const toAddress = (profile) => ({
  ...EMPTY_ADDRESS,
  street: profile.street || '',
  regionCode: profile.region_code || '',
  regionName: profile.region_name || '',
  provinceCode: profile.province_code || '',
  provinceName: profile.province_name || '',
  cityCode: profile.city_code || '',
  cityName: profile.city_name || '',
  barangayCode: profile.barangay_code || '',
  barangayName: profile.barangay_name || '',
  countryCode: profile.country_code || 'PH',
  countryName: profile.country_name || countries.find((country) => country.code === (profile.country_code || 'PH'))?.name || 'Philippines',
  subdivisionName: profile.country_code && profile.country_code !== 'PH' ? profile.region_name || '' : '',
  postalCode: profile.postal_code || '',
});

export default function SelfProfile({ user, role, onSaved, onCancel, beforeSave }) {
  const [form, setForm] = useState(null);
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [subdivisionOptions, setSubdivisionOptions] = useState([]);
  const [subdivisionError, setSubdivisionError] = useState('');
  const [postalMessage, setPostalMessage] = useState('');
  const [loading, setLoading] = useState(Boolean(user?.id));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState(user?.id ? '' : 'Could not identify your account. Please sign in again.');

  useEffect(() => {
    let active = true;
    if (!user?.id) return () => { active = false; };

    supabase.from('staff_users')
      .select(profileFields)
      .eq('id', user.id)
      .eq('role', role)
      .single()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setErrorMessage(`Could not load your profile: ${error.message}`);
        } else {
          setForm(toForm(data));
          setAddress(toAddress(data));
        }
        setLoading(false);
      })
      .catch((error) => {
        if (!active) return;
        setErrorMessage(`Could not load your profile: ${error.message}`);
        setLoading(false);
      });

    return () => { active = false; };
  }, [role, user?.id]);

  useEffect(() => {
    if (!address.countryCode || address.countryCode === 'PH') {
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    const timeoutId = window.setTimeout(() => controller.abort(), 8000);
    fetch('https://countriesnow.space/api/v0.1/countries/states', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: address.countryName }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        if (result.error) throw new Error(result.msg || 'Could not load region options.');
        return (Array.isArray(result.data?.states) ? result.data.states : [])
          .filter((state) => state?.name)
          .map((state) => state.name)
          .sort((a, b) => a.localeCompare(b));
      })
      .then((options) => {
        if (active) {
          setSubdivisionOptions(options);
          setSubdivisionError('');
        }
      })
      .catch((error) => {
        if (active) {
          if (error.name !== 'AbortError') console.error('Could not load country subdivisions:', error);
          setSubdivisionError('Could not load region options. Please enter the region manually.');
        }
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
      });

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [address.countryCode, address.countryName]);

  const handlePostalLookup = useCallback(async () => {
    if (!address.countryCode || !address.cityName.trim()) {
      setPostalMessage('Select a city first to look up its postal code.');
      return;
    }
    setPostalMessage('Looking up postal code…');
    try {
      const postalCode = await lookupPostalCode({
        city: address.cityName.trim(),
        region: address.countryCode === 'PH' ? address.provinceName || address.regionName : address.subdivisionName,
        parentRegion: address.countryCode === 'PH' && address.provinceName ? address.regionName : '',
        country: address.countryName,
        countryCode: address.countryCode,
        regionCode: address.countryCode === 'PH' ? address.regionCode : '',
      });
      const fallback = postalCode || getStaticPostalCode({
        countryCode: address.countryCode,
        regionCode: address.regionCode,
        regionName: address.countryCode === 'PH' ? address.regionName : address.subdivisionName,
        city: address.cityName,
      });
      setAddress((previous) => ({ ...previous, postalCode: fallback || previous.postalCode }));
      setPostalMessage(fallback ? 'Postal code found for the selected region and city.' : 'No postal code is available for this region and city yet.');
    } catch (error) {
      console.error('Could not look up postal code:', error);
      const fallback = getStaticPostalCode({
        countryCode: address.countryCode,
        regionCode: address.regionCode,
        regionName: address.countryCode === 'PH' ? address.regionName : address.subdivisionName,
        city: address.cityName,
      });
      setAddress((previous) => ({ ...previous, postalCode: fallback || previous.postalCode }));
      setPostalMessage(fallback ? 'Lookup unavailable; using saved local postal-code data.' : 'Postal code could not be fetched for this region and city.');
    }
  }, [
    address.cityName,
    address.countryCode,
    address.countryName,
    address.provinceName,
    address.regionCode,
    address.regionName,
    address.subdivisionName,
  ]);

  useEffect(() => {
    if (address.countryCode !== 'PH' || !address.cityCode) return undefined;
    const timer = window.setTimeout(() => handlePostalLookup(), 0);
    return () => window.clearTimeout(timer);
  }, [address.cityCode, address.countryCode, handlePostalLookup]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form || !user?.id) return;

    const firstName = form.first_name.trim();
    const middleName = form.middle_name.trim();
    const lastName = form.last_name.trim();
    const username = form.username.trim().toLowerCase();
    const validationError = validateProfileName(firstName, 'First name', true)
      || validateProfileName(middleName, 'Middle name')
      || validateProfileName(lastName, 'Last name', true)
      || validateProfileUsername(username)
      || validateProfileMobile(form.mobile_number, address.countryCode)
      || validateProfileBirthdate(form.birthdate);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }
    if (!form.mobile_number.trim() || !form.birthdate || !form.sex) {
      setErrorMessage('Mobile number, birth date, and sex are required.');
      return;
    }
    if (role === 'patient' && form.is_guardian) {
      const guardianError = validateProfileName(form.guardian_name, 'Guardian full name', true)
        || (!form.guardian_relationship.trim() ? 'Guardian relationship is required.' : '')
        || validateProfileMobile(form.guardian_contact, address.countryCode)
        || (!form.guardian_contact.trim() ? 'Guardian contact number is required.' : '');
      if (guardianError) {
        setErrorMessage(guardianError);
        return;
      }
    }
    const isPhilippines = address.countryCode === 'PH';
    const requiresSubdivision = !isPhilippines && (
      subdivisionOptions.length > 0
      || subdivisionError
      || countriesWithSubdivisions.has(address.countryCode)
    );
    const missingAddress = !address.countryCode || !address.street.trim() || (
      isPhilippines
        ? !address.regionCode || !address.cityCode || !(address.barangayName || address.barangayCode)
        : !address.cityName.trim() || (requiresSubdivision && !address.subdivisionName.trim())
    );
    if (missingAddress) {
      setErrorMessage(isPhilippines
        ? 'Please complete your address (street, region, city/municipality, and barangay).'
        : 'Please complete your address (street, city, and the required state, province, or region).');
      return;
    }
    if (form.birthdate) {
      const minimumDate = new Date();
      minimumDate.setHours(0, 0, 0, 0);
      minimumDate.setFullYear(minimumDate.getFullYear() - 13);
      if (!(role === 'patient' && form.is_guardian) && new Date(`${form.birthdate}T00:00:00`) > minimumDate) {
        setErrorMessage('You must be at least 13 years old unless registering as a guardian.');
        return;
      }
    }

    setSaving(true);
    setMessage('');
    setErrorMessage('');
    try {
      if (beforeSave) {
        const blocked = await beforeSave();
        if (blocked) {
          setErrorMessage(typeof blocked === 'string' ? blocked : 'Profile update could not be completed.');
          return;
        }
      }
      const country = countries.find((item) => item.code === address.countryCode);
      const countryAddress = isPhilippines
        ? { ...address, street: address.street.trim(), postalCode: address.postalCode.trim() }
        : {
          ...EMPTY_ADDRESS,
          street: address.street.trim(),
          regionName: address.subdivisionName.trim(),
          cityName: address.cityName.trim(),
          postalCode: address.postalCode.trim(),
          countryName: address.countryName,
        };
      const completeAddress = isPhilippines
        ? [buildCompleteAddress(countryAddress), address.postalCode.trim(), address.countryName].filter(Boolean).join(', ')
        : [
          countryAddress.street,
          address.subdivisionName.trim(),
          address.cityName.trim(),
          address.postalCode.trim(),
          address.countryName,
        ].filter(Boolean).join(', ');
      const update = {
        first_name: firstName,
        middle_name: middleName || null,
        last_name: lastName,
        full_name: [firstName, middleName, lastName].filter(Boolean).join(' '),
        username,
        mobile_number: form.mobile_number.trim(),
        birthdate: form.birthdate,
        sex: form.sex,
        is_guardian: role === 'patient' && form.is_guardian,
        guardian_name: role === 'patient' && form.is_guardian ? form.guardian_name.trim() : null,
        guardian_relationship: role === 'patient' && form.is_guardian ? form.guardian_relationship.trim() : null,
        guardian_contact: role === 'patient' && form.is_guardian ? form.guardian_contact.trim() : null,
        street: countryAddress.street,
        region_code: isPhilippines ? address.regionCode || null : null,
        region_name: isPhilippines ? address.regionName || null : address.subdivisionName.trim() || null,
        province_code: isPhilippines && address.provinceCode !== '__independent__' ? address.provinceCode || null : null,
        province_name: isPhilippines ? address.provinceName || null : null,
        city_code: isPhilippines ? address.cityCode || null : null,
        city_name: isPhilippines ? address.cityName || null : address.cityName.trim(),
        barangay_code: isPhilippines ? address.barangayCode || null : null,
        barangay_name: isPhilippines ? address.barangayName || null : null,
        complete_address: completeAddress,
        country_code: address.countryCode || null,
        country_name: country?.name || null,
        postal_code: address.postalCode.trim() || null,
      };
      const { data: existingUser, error: usernameError } = await supabase.from('staff_users')
        .select('id')
        .eq('username', username)
        .neq('id', user.id)
        .limit(1)
        .maybeSingle();
      if (usernameError) throw new Error(`Could not verify username availability: ${usernameError.message}`);
      if (existingUser) throw new Error('That username is already taken.');

      const { data, error } = await supabase.from('staff_users')
        .update(update)
        .eq('id', user.id)
        .eq('role', role)
        .select(profileFields)
        .single();
      if (error) throw error;

      setForm(toForm(data));
      setAddress(toAddress(data));
      await onSaved?.(data);
      const { error: metadataError } = await supabase.auth.updateUser({
        data: { staff_user_id: data.id, role: data.role, full_name: data.full_name },
      });
      if (metadataError) {
        console.error('Profile saved, but Supabase Auth metadata was not refreshed:', metadataError);
        setMessage('Profile saved, but the display name may remain out of date until your next sign-in.');
      } else {
        setMessage('Your profile was updated.');
      }
    } catch (error) {
      setErrorMessage(`Could not save your profile: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="rounded-2xl border border-[#d4e2dc] bg-white p-6 text-sm font-semibold text-[#607368]">Loading profile…</p>;
  }

  return (
    <section className="h-full overflow-y-auto">
      <div className="mb-5">
        <h2 className="text-2xl font-black text-[#13241b]">My Profile</h2>
        <p className="mt-1 text-xs text-[#607368]">View and update your personal information.</p>
      </div>
      <form onSubmit={handleSubmit} className="max-w-3xl space-y-6 rounded-2xl border border-[#d4e2dc] bg-white p-6 shadow-2xs">
        {errorMessage && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800">{errorMessage}</p>}
        {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">{message}</p>}
        {form && (
          <>
            <section className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-[#164e43]">Personal information</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className={labelClass}>First name *
                  <input required maxLength={50} autoComplete="given-name" className={inputClass} value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} />
                </label>
                <label className={labelClass}>Middle name
                  <input maxLength={50} autoComplete="additional-name" className={inputClass} value={form.middle_name} onChange={(event) => setForm({ ...form, middle_name: event.target.value })} />
                </label>
                <label className={labelClass}>Last name *
                  <input required maxLength={50} autoComplete="family-name" className={inputClass} value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} />
                </label>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className={labelClass}>Birth date *
                  <input required type="date" max={new Date().toISOString().slice(0, 10)} autoComplete="bday" className={inputClass} value={form.birthdate} onChange={(event) => setForm({ ...form, birthdate: event.target.value })} />
                </label>
                <label className={labelClass}>Sex *
                  <select required className={inputClass} value={form.sex} onChange={(event) => setForm({ ...form, sex: event.target.value })}>
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </label>
                <label className={labelClass}>Mobile number *
                  <div className="flex items-center gap-2">
                    <span className="rounded-xl border border-[#d4e2dc] bg-[#f5f7f6] px-3 py-2.5 text-xs font-bold text-[#607368]">{getPhoneCallingCode(address.countryCode)}</span>
                    <input required type="tel" inputMode="numeric" maxLength={15} autoComplete="tel-national" placeholder="Enter your national number" className={inputClass} value={form.mobile_number} onChange={(event) => setForm({ ...form, mobile_number: event.target.value.replace(/\D/g, '') })} />
                  </div>
                </label>
                <label className={labelClass}>Email
                  <input type="email" maxLength={254} autoComplete="email" readOnly aria-readonly="true" className={`${inputClass} bg-[#f5f7f6] text-[#607368]`} value={form.email} />
                  <span className="mt-1 block font-normal">Email addresses can’t be changed from your profile.</span>
                </label>
              </div>
            </section>

            {role === 'patient' && (
              <section className="space-y-3 rounded-2xl border border-[#d4e2dc] bg-[#f5faf7] p-4">
                <label className="flex items-start gap-3 text-sm font-black text-[#164e43]">
                  <input
                    type="checkbox"
                    checked={form.is_guardian}
                    onChange={(event) => setForm({
                      ...form,
                      is_guardian: event.target.checked,
                      ...(event.target.checked ? {} : { guardian_name: '', guardian_relationship: '', guardian_contact: '' }),
                    })}
                    className="mt-0.5 h-5 w-5 accent-[#164e43]"
                  />
                  I am a guardian
                </label>
                <p className="text-xs text-[#40584f]">Use this if you are registering or managing the account for a child or another patient.</p>
                {form.is_guardian && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className={labelClass}>Guardian full name *
                      <input required maxLength={100} autoComplete="name" className={inputClass} value={form.guardian_name} onChange={(event) => setForm({ ...form, guardian_name: event.target.value })} />
                    </label>
                    <label className={labelClass}>Relationship to patient *
                      <input required maxLength={50} placeholder="e.g. Parent" className={inputClass} value={form.guardian_relationship} onChange={(event) => setForm({ ...form, guardian_relationship: event.target.value })} />
                    </label>
                    <label className={labelClass}>Guardian contact number *
                      <div className="flex items-center gap-2">
                        <span className="rounded-xl border border-[#d4e2dc] bg-[#f5f7f6] px-3 py-2.5 text-xs font-bold text-[#607368]">{getPhoneCallingCode(address.countryCode)}</span>
                        <input required type="tel" inputMode="numeric" maxLength={15} autoComplete="tel-national" placeholder="Enter national number" className={inputClass} value={form.guardian_contact} onChange={(event) => setForm({ ...form, guardian_contact: event.target.value.replace(/\D/g, '') })} />
                      </div>
                    </label>
                  </div>
                )}
              </section>
            )}

            <section className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-[#164e43]">Account</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className={labelClass}>Username *
                  <input required minLength={4} maxLength={20} autoComplete="username" className={inputClass} value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
                </label>
                <p className="text-xs font-semibold text-[#607368]">Password changes are managed through the password reset flow.</p>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-[#164e43]">Address</h3>
              <label className={labelClass}>Country *
                <select
                  required
                  className={inputClass}
                  value={address.countryCode}
                  onChange={(event) => {
                    const country = countries.find((item) => item.code === event.target.value);
                    setAddress({
                      ...EMPTY_ADDRESS,
                      countryCode: country?.code || '',
                      countryName: country?.name || '',
                      postalCode: '',
                      subdivisionName: '',
                    });
                    setSubdivisionOptions([]);
                    setSubdivisionError('');
                    setPostalMessage('');
                  }}
                >
                  <option value="">Select country</option>
                  {countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
                </select>
              </label>
              {address.countryCode === 'PH' ? (
                <PhAddressSelect value={address} onChange={setAddress} />
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(subdivisionOptions.length > 0 || subdivisionError || countriesWithSubdivisions.has(address.countryCode)) && (
                    <label className={labelClass}>{subdivisionLabel(address.countryCode)} *
                      {subdivisionOptions.length > 0 ? (
                        <select required className={inputClass} value={address.subdivisionName} onChange={(event) => setAddress({ ...address, subdivisionName: event.target.value })}>
                          <option value="">Select region</option>
                          {subdivisionOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      ) : (
                        <input required className={inputClass} value={address.subdivisionName} onChange={(event) => setAddress({ ...address, subdivisionName: event.target.value })} />
                      )}
                      {subdivisionError && <span className="mt-1 block font-normal text-amber-700">{subdivisionError}</span>}
                    </label>
                  )}
                  <label className={labelClass}>City / Town *
                    <input required autoComplete="address-level2" className={inputClass} value={address.cityName} onChange={(event) => setAddress({ ...address, cityName: event.target.value })} onBlur={handlePostalLookup} />
                  </label>
                  <label className={`${labelClass} sm:col-span-2`}>House No. / Street *
                    <input required autoComplete="address-line1" className={inputClass} value={address.street} onChange={(event) => setAddress({ ...address, street: event.target.value })} />
                  </label>
                </div>
              )}
              <label className={labelClass}>{postalLabel(address.countryCode)}
                <input readOnly aria-readonly="true" autoComplete="postal-code" className={`${inputClass} bg-[#f5f7f6] text-[#607368]`} value={address.postalCode} placeholder="Auto-filled from region and city" />
              </label>
              {postalMessage && <p role="status" className="text-[10px] font-semibold text-[#607368]">{postalMessage}</p>}
              <button type="button" onClick={handlePostalLookup} className="text-xs font-bold text-[#164e43] underline">Look up postal code</button>
              <p className="text-[10px] text-[#607368]">Postal lookup results use OpenStreetMap data.</p>
            </section>

            <div className="flex gap-3">
              {onCancel && (
                <button type="button" onClick={onCancel} disabled={saving} className="rounded-xl border border-[#d4e2dc] bg-white px-5 py-3 text-xs font-bold text-[#40584f] disabled:opacity-60">
                  Cancel
                </button>
              )}
              <button type="submit" disabled={saving} className="rounded-xl bg-[#164e43] px-5 py-3 text-xs font-bold text-white hover:bg-[#0f362e] disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? 'Saving…' : 'Save Profile'}
              </button>
            </div>
          </>
        )}
      </form>
    </section>
  );
}
