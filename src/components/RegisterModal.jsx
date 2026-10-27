import { useCallback, useEffect, useRef, useState } from 'react';
import { getData as getCountryData } from 'country-list';
import { supabase } from '../lib/supabase';
import PhAddressSelect from './PhAddressSelect';
import { EMPTY_ADDRESS, buildCompleteAddress } from '../lib/phAddress';
import { getStaticPostalCode, lookupPostalCode } from '../lib/postalCode';
import { getPhoneCallingCode, validatePhoneNumber } from '../lib/phoneNumber';
import showPasswordIcon from '../assets/forgot-pass-default.png';
import hidePasswordIcon from '../assets/forgot-pass-clicked.png';

const baseInputClass = 'w-full border rounded-xl p-2.5 text-xs font-semibold focus:outline-none transition-colors';
const normalInputClass = 'border-[#d4e2dc] bg-white focus:border-[#164e43]';
const errorInputClass = 'border-red-500 bg-red-50/30 focus:border-red-600';
const labelClass = 'block font-bold text-[#607368] mb-1 text-xs';

const ALLOWED_EMAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'yahoo.com.ph'];

const COUNTRY_NAMES = new Intl.DisplayNames(['en'], { type: 'region' });
const COUNTRIES = getCountryData()
  .map(({ code, name }) => ({ code, name: COUNTRY_NAMES.of(code) || name }))
  .sort((a, b) => a.name.localeCompare(b.name));
const COUNTRIES_WITH_SUBDIVISIONS = new Set(['US', 'CA', 'AU', 'IN', 'BR', 'MX', 'JP', 'KR', 'CN', 'NZ', 'GB']);

const INITIAL = {
  firstName: '', middleName: '', lastName: '', birthdate: '', sex: '',
  mobileNumber: '', email: '', username: '', password: '', confirmPassword: '',
  isGuardian: false, guardianName: '', guardianRelationship: '', guardianContact: '',
};

const INITIAL_ADDRESS = {
  ...EMPTY_ADDRESS,
  countryCode: 'PH',
  countryName: 'Philippines',
  postalCode: '',
  subdivisionName: '',
};

const subdivisionLabelForCountry = (countryCode) => ({
  US: 'State',
  CA: 'Province',
  AU: 'State / Territory',
  IN: 'State / Union Territory',
  BR: 'State',
  MX: 'State',
  JP: 'Prefecture',
  KR: 'Province / Metropolitan City',
  CN: 'Province',
  NZ: 'Region',
  GB: 'County',
}[countryCode] || 'State / Province / Region');

const postalLabelForCountry = (countryCode) => ({
  US: 'ZIP code',
  GB: 'Postcode',
  IE: 'Eircode',
}[countryCode] || (countryCode === 'CA' || countryCode === 'AU' || countryCode === 'NZ' ? 'Postcode' : 'Postal code'));

const PLACE_REGEX = /^[\p{L}\p{M}0-9\s.,'’()&\x2f-]+$/u;
const PasswordVisibilityButton = ({ visible, onClick, label }) => (
  <button type="button" onClick={onClick} aria-label={label} aria-pressed={visible} className="absolute inset-y-0 right-2 flex items-center px-1 text-[#20282b] cursor-pointer">
    <img aria-hidden="true" src={visible ? hidePasswordIcon : showPasswordIcon} alt="" className="h-6 w-6 object-contain" />
  </button>
);
const normalizeNamePart = (value = '') => value.toLocaleLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\p{L}\p{N}]/gu, '');
const patientIdentityKey = (firstName, lastName) => `${normalizeNamePart(firstName)}:${normalizeNamePart(lastName)}`;

export default function RegisterModal({ isOpen, onClose, onSuccess }) {
  const [form, setForm] = useState(INITIAL);
  const [address, setAddress] = useState(INITIAL_ADDRESS);
  const [subdivisionOptions, setSubdivisionOptions] = useState([]);
  const [subdivisionStatus, setSubdivisionStatus] = useState({ loading: false, error: '' });
  const [postalLookupStatus, setPostalLookupStatus] = useState({ loading: false, message: '' });
  const postalLookupGeneration = useRef(0);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [globalError, setGlobalError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const updateAddress = (patch) => {
    const next = { ...address, ...patch };
    const locationChanged = [
      'countryCode', 'countryName', 'regionCode', 'provinceCode',
      'cityCode', 'cityName', 'barangayCode', 'barangayName', 'subdivisionName',
    ].some((field) => address[field] !== next[field]);

    if (locationChanged) {
      postalLookupGeneration.current += 1;
      const staticPostalCode = getStaticPostalCode({
        countryCode: next.countryCode,
        regionCode: next.regionCode,
        regionName: next.countryCode === 'PH' ? next.regionName : next.subdivisionName,
        city: next.cityName,
      });
      next.postalCode = staticPostalCode;
      setPostalLookupStatus({
        loading: false,
        message: staticPostalCode ? 'Using saved postal-code data for the selected region and city.' : '',
      });
    }

    setAddress(next);
  };

  const handlePostalLookup = useCallback(async () => {
    if (!address.countryCode || !address.cityName.trim()) {
      setPostalLookupStatus({ loading: false, message: 'Select a city first to look up its postal code.' });
      return;
    }

    setPostalLookupStatus({ loading: true, message: 'Looking up postal code…' });
    const requestGeneration = postalLookupGeneration.current;
    try {
      const region = address.countryCode === 'PH'
        ? (address.provinceName || address.regionName).trim()
        : address.subdivisionName.trim();
      const parentRegion = address.countryCode === 'PH' && address.provinceName
        ? address.regionName.trim()
        : '';
      const postalCode = await lookupPostalCode({
        city: address.cityName.trim(),
        region,
        parentRegion,
        country: address.countryName,
        countryCode: address.countryCode,
        regionCode: address.countryCode === 'PH' ? address.regionCode : '',
        cityCode: address.countryCode === 'PH' ? address.cityCode : '',
      });
      if (requestGeneration !== postalLookupGeneration.current) return;
      if (postalCode) {
        setAddress((previous) => ({ ...previous, postalCode }));
        setPostalLookupStatus({ loading: false, message: 'Postal code found for the selected region and city.' });
      } else {
        const fallback = getStaticPostalCode({
          countryCode: address.countryCode,
          regionCode: address.regionCode,
          regionName: address.countryCode === 'PH' ? address.regionName : address.subdivisionName,
          city: address.cityName,
        });
        if (fallback) {
          setAddress((previous) => ({ ...previous, postalCode: fallback }));
          setPostalLookupStatus({ loading: false, message: 'Using the saved local postal-code data for this region and city.' });
        } else {
          setPostalLookupStatus({ loading: false, message: 'No postal code is available for this region and city yet.' });
        }
      }
    } catch (error) {
      if (requestGeneration !== postalLookupGeneration.current) return;
      console.error('Could not look up postal code:', error);
      const fallback = getStaticPostalCode({
        countryCode: address.countryCode,
        regionCode: address.regionCode,
        regionName: address.countryCode === 'PH' ? address.regionName : address.subdivisionName,
        city: address.cityName,
      });
      if (fallback) {
        setAddress((previous) => ({ ...previous, postalCode: fallback }));
        setPostalLookupStatus({ loading: false, message: 'Lookup unavailable; using saved local postal-code data.' });
      } else {
        setPostalLookupStatus({ loading: false, message: 'Postal code could not be fetched for this region and city.' });
      }
    }
  }, [
    address.cityName,
    address.cityCode,
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
  }, [address.cityCode, address.countryCode, address.countryName, address.regionCode, address.regionName, handlePostalLookup]);

  useEffect(() => {
    if (!address.countryCode || address.countryCode === 'PH') return undefined;

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
        if (result.error) throw new Error(result.msg || 'Country subdivision lookup failed.');
        const states = Array.isArray(result.data?.states) ? result.data.states : [];
        return states
          .filter((state) => state?.name)
          .map((state) => state.name)
          .sort((a, b) => a.localeCompare(b));
      })
      .then((states) => {
        if (!active) return;
        setSubdivisionOptions(states);
        setSubdivisionStatus({ loading: false, error: '' });
      })
      .catch((error) => {
        if (!active) return;
        console.error('Could not load country subdivisions:', error);
        setSubdivisionStatus({ loading: false, error: 'Could not load region options. Please enter the region manually.' });
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [address.countryCode, address.countryName]);

  if (!isOpen) return null;

  const validateField = async (field, value, allValues = form) => {
    switch (field) {
      case 'firstName': {
        const v = value.trim();
        if (!v) return 'First name is required.';
        if (v.length < 2 || v.length > 50) return 'First name must be 2 to 50 characters.';
        if (!/^[A-Za-z\s'-]+$/.test(v)) return 'First name can only have letters, spaces, hyphens, and apostrophes.';
        return '';
      }
      case 'lastName': {
        const v = value.trim();
        if (!v) return 'Last name is required.';
        if (v.length < 2 || v.length > 50) return 'Last name must be 2 to 50 characters.';
        if (!/^[A-Za-z\s'-]+$/.test(v)) return 'Last name can only have letters, spaces, hyphens, and apostrophes.';
        return '';
      }
      case 'middleName': {
        const v = value.trim();
        if (v !== '' && !/^[A-Za-z]\.?$/.test(v) && (v.length > 50 || !PLACE_REGEX.test(v))) {
          return 'Middle name format is invalid.';
        }
        return '';
      }
      case 'username': {
        const v = value.trim().toLowerCase();
        if (!v) return 'Username is required.';
        if (!/^[a-z0-9_.]{4,20}$/.test(v)) {
          return 'Username must be 4-20 characters: letters, numbers, dot or underscore.';
        }
        try {
          const { data, error } = await supabase.from('staff_users').select('id').eq('username', v).limit(1);
          if (error) return `Could not verify username availability: ${error.message}`;
          if (!error && data && data.length > 0) {
            return 'That username is already taken.';
          }
        } catch (error) {
          return `Could not verify username availability: ${error.message}`;
        }
        return '';
      }
      case 'birthdate': {
        if (!value) return 'Birthday is required.';
        const birthDateObj = new Date(value);
        const limit = new Date();
        limit.setHours(0, 0, 0, 0);
        limit.setFullYear(limit.getFullYear() - 13);
        if (!allValues.isGuardian && birthDateObj > limit) return 'You must be at least 13 years old.';
        return '';
      }
      case 'sex':
        if (!value) return 'Please select your sex.';
        return '';
      case 'mobileNumber': {
        const v = value.trim();
        if (!v) return 'Mobile number is required.';
        return validatePhoneNumber(v, address.countryCode);
      }
      case 'guardianName':
      case 'guardianRelationship':
        if (allValues.isGuardian && !value.trim()) return 'This field is required when registering as a guardian.';
        return '';
      case 'guardianContact': {
        if (!allValues.isGuardian) return '';
        if (!value.trim()) return 'This field is required when registering as a guardian.';
        return validatePhoneNumber(value.trim(), address.countryCode);
      }
      case 'email': {
        const v = value.trim().toLowerCase();
        if (!v) return ''; // Email is optional, remove if required
        if (v.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
          return 'Enter a valid email address.';
        }
        const [localPart, domain] = v.split('@');
        if (!ALLOWED_EMAIL_DOMAINS.includes(domain)) {
          return `Only common email providers are allowed (${ALLOWED_EMAIL_DOMAINS.join(', ')}).`;
        }
        if (domain === 'gmail.com') {
          const [gmailName, ...plusTags] = localPart.split('+');
          if (
            gmailName.length > 30
            || !/^[a-z0-9]+(?:\.[a-z0-9]+)*$/.test(gmailName)
            || plusTags.length > 1
            || (plusTags.length === 1 && !/^[a-z0-9-]+$/.test(plusTags[0]))
          ) {
            return 'Enter a valid Gmail address.';
          }
        }
        try {
          const { data, error } = await supabase.from('staff_users').select('id').eq('email', v).limit(1);
          if (error) return `Could not verify email availability: ${error.message}`;
          if (!error && data && data.length > 0) {
            return 'This email address is already registered.';
          }
        } catch (error) {
          return `Could not verify email availability: ${error.message}`;
        }
        return '';
      }
      case 'password': {
        if (!value) return 'Password is required.';
        if (value.length < 12) return 'Password must be at least 12 characters.';
        if (!/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/[0-9]/.test(value) || !/[^A-Za-z0-9]/.test(value)) {
          return 'Password must include uppercase, lowercase, number, and special character.';
        }
        return '';
      }
      case 'confirmPassword': {
        if (!value) return 'Please confirm your password.';
        if (value !== allValues.password) return 'The passwords do not match.';
        return '';
      }
      default:
        return '';
    }
  };

  const handleChange = (field) => (e) => {
    let value = e.target.value;
    if (field === 'mobileNumber' || field === 'guardianContact') {
      value = value.replace(/\D/g, '');
    }

    const updatedForm = { ...form, [field]: value };
    setForm(updatedForm);
    setGlobalError('');

    if (touched[field]) {
      validateField(field, value, updatedForm).then((errMsg) => {
        setErrors((prev) => ({ ...prev, [field]: errMsg }));
      });
    }

    if (field === 'password' && touched.confirmPassword) {
      validateField('confirmPassword', form.confirmPassword, updatedForm).then((confirmErr) => {
        setErrors((prev) => ({ ...prev, confirmPassword: confirmErr }));
      });
    }
  };

  const handleBlur = (field) => async () => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const errMsg = await validateField(field, form[field]);
    setErrors((prev) => ({ ...prev, [field]: errMsg }));
  };

  const today = new Date().toISOString().split('T')[0];

  const handleClose = () => {
    setForm(INITIAL);
    setAddress(INITIAL_ADDRESS);
    postalLookupGeneration.current += 1;
    setPostalLookupStatus({ loading: false, message: '' });
    setSubdivisionOptions([]);
    setSubdivisionStatus({ loading: false, error: '' });
    setErrors({});
    setTouched({});
    setGlobalError('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGlobalError('');

    const isPhilippines = address.countryCode === 'PH';
    const requiresSubdivision = !isPhilippines && (
      subdivisionOptions.length > 0
      || subdivisionStatus.error
      || COUNTRIES_WITH_SUBDIVISIONS.has(address.countryCode)
    );
    const missingAddress = !address.countryCode || !address.street.trim() || (
      isPhilippines
        ? !address.regionCode || !address.cityCode || !(address.barangayName || address.barangayCode)
        : !address.cityName.trim() || (requiresSubdivision && !address.subdivisionName.trim())
    );

    const newErrors = {};
    for (const field of Object.keys(form)) {
      const err = await validateField(field, form[field]);
      if (err) newErrors[field] = err;
    }

    if (missingAddress) {
      setGlobalError(isPhilippines
        ? 'Please complete your address (street, region, city/municipality and barangay).'
        : 'Please complete your address (street, city, and the required state, province, or region).');
    }

    setErrors(newErrors);
    setTouched({
      firstName: true, middleName: true, lastName: true, birthdate: true,
      sex: true, mobileNumber: true, email: true, username: true,
      password: true, confirmPassword: true, guardianName: true,
      guardianRelationship: true, guardianContact: true,
    });

    if (Object.keys(newErrors).length > 0 || missingAddress || subdivisionStatus.loading) {
      return;
    }

    setSubmitting(true);
    try {
      const firstName = form.firstName.trim();
      const middleName = form.middleName.trim();
      const lastName = form.lastName.trim();
      const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');
      const username = form.username.trim().toLowerCase();

      const { data: existingPatients, error: duplicateCheckError } = await supabase.from('staff_users')
        .select('id, full_name, first_name, last_name, birthdate')
        .eq('role', 'patient')
        .eq('birthdate', form.birthdate);
      if (duplicateCheckError) throw new Error(`Could not verify whether this patient account already exists: ${duplicateCheckError.message}`);

      const submittedIdentity = patientIdentityKey(firstName, lastName);
      const duplicatePatient = (existingPatients || []).find((account) => {
        const nameParts = (account.full_name || '').trim().split(/\s+/);
        const existingFirstName = account.first_name?.trim() || nameParts[0] || '';
        const existingLastName = account.last_name?.trim() || nameParts[nameParts.length - 1] || '';
        return patientIdentityKey(existingFirstName, existingLastName) === submittedIdentity;
      });
      if (duplicatePatient) {
        setGlobalError('A patient account with the same first name, last name, and birth date already exists. Please sign in to the existing account or contact the clinic.');
        return;
      }

      const countryAddress = isPhilippines
        ? {
          ...address,
          street: address.street.trim(),
          postalCode: address.postalCode.trim(),
        }
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
          countryAddress.subdivisionName || address.subdivisionName.trim(),
          countryAddress.cityName,
          countryAddress.postalCode,
          address.countryName,
        ].filter(Boolean).join(', ');

      const { error: insertError } = await supabase.from('staff_users').insert([{
        full_name: fullName,
        first_name: firstName,
        middle_name: middleName,
        last_name: lastName,
        username,
        password: form.password,
        email: form.email.trim() || null,
        role: 'patient',
        account_status: 'Pending',
        mobile_number: form.mobileNumber.trim(),
        sex: form.sex,
        birthdate: form.birthdate,
        is_guardian: form.isGuardian,
        guardian_name: form.isGuardian ? form.guardianName.trim() : null,
        guardian_relationship: form.isGuardian ? form.guardianRelationship.trim() : null,
        guardian_contact: form.isGuardian ? form.guardianContact.trim() : null,
        country_code: address.countryCode,
        country_name: address.countryName,
        postal_code: address.postalCode.trim() || null,
        street: countryAddress.street,
        region_code: isPhilippines ? address.regionCode : null,
        region_name: isPhilippines ? address.regionName : address.subdivisionName.trim() || null,
        province_code: isPhilippines && address.provinceCode !== '__independent__' ? (address.provinceCode || null) : null,
        province_name: isPhilippines ? (address.provinceName || null) : null,
        city_code: isPhilippines ? address.cityCode : null,
        city_name: isPhilippines ? address.cityName : address.cityName.trim(),
        barangay_code: isPhilippines ? (address.barangayCode || null) : null,
        barangay_name: isPhilippines ? (address.barangayName || null) : null,
        complete_address: completeAddress,
      }]);
      if (insertError) throw insertError;

      onSuccess?.(username, form.password);
      handleClose();
    } catch (err) {
      console.error('Patient registration failed:', err);
      setGlobalError(`Registration failed: ${err.message || 'database error'}.`);
    } finally {
      setSubmitting(false);
    }
  };

  const getInputStyle = (field) => `${baseInputClass} ${touched[field] && errors[field] ? errorInputClass : normalInputClass}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl border border-[#d4e2dc] shadow-xl">
        <div className="flex items-start justify-between p-6 border-b border-[#d4e2dc] sticky top-0 bg-white z-10">
          <div>
            <h3 className="font-black text-xl text-[#13241b]">Create a Patient Account</h3>
            <p className="text-xs text-[#607368] mt-1">
              The clinic will verify your details before you can sign in and book appointments.
            </p>
          </div>
          <button type="button" onClick={handleClose} className="text-[#607368] hover:text-[#13241b] font-black text-lg cursor-pointer px-2">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6" noValidate>
          {globalError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3.5 rounded-xl font-bold">⚠️ {globalError}</div>
          )}

          <section className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#164e43]">Personal information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>First name *</label>
                <input required className={getInputStyle('firstName')} value={form.firstName} onChange={handleChange('firstName')} onBlur={handleBlur('firstName')} />
                {touched.firstName && errors.firstName && <p className="text-red-500 text-[10px] mt-1 font-semibold">{errors.firstName}</p>}
              </div>
              <div>
                <label className={labelClass}>Middle name</label>
                <input className={getInputStyle('middleName')} value={form.middleName} onChange={handleChange('middleName')} onBlur={handleBlur('middleName')} />
                {touched.middleName && errors.middleName && <p className="text-red-500 text-[10px] mt-1 font-semibold">{errors.middleName}</p>}
              </div>
              <div>
                <label className={labelClass}>Last name *</label>
                <input required className={getInputStyle('lastName')} value={form.lastName} onChange={handleChange('lastName')} onBlur={handleBlur('lastName')} />
                {touched.lastName && errors.lastName && <p className="text-red-500 text-[10px] mt-1 font-semibold">{errors.lastName}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Birth date *</label>
                <input required type="date" max={today} className={getInputStyle('birthdate')} value={form.birthdate} onChange={handleChange('birthdate')} onBlur={handleBlur('birthdate')} />
                {touched.birthdate && errors.birthdate && <p className="text-red-500 text-[10px] mt-1 font-semibold">{errors.birthdate}</p>}
              </div>
              <div>
                <label className={labelClass}>Sex *</label>
                <select required className={getInputStyle('sex')} value={form.sex} onChange={handleChange('sex')} onBlur={handleBlur('sex')}>
                  <option value="">Select</option><option value="Male">Male</option><option value="Female">Female</option>
                </select>
                {touched.sex && errors.sex && <p className="text-red-500 text-[10px] mt-1 font-semibold">{errors.sex}</p>}
              </div>
              <div>
                <label className={labelClass}>Mobile number *</label>
                <div className="flex items-center gap-2">
                  <span className="rounded-xl border border-[#d4e2dc] bg-[#f5f7f6] px-3 py-2.5 text-xs font-bold text-[#607368]">{getPhoneCallingCode(address.countryCode)}</span>
                  <input required type="tel" inputMode="numeric" maxLength={address.countryCode === 'PH' ? 10 : 15} pattern={address.countryCode === 'PH' ? '9[0-9]{9}' : undefined} autoComplete="tel-national" placeholder={address.countryCode === 'PH' ? '9XXXXXXXXX' : 'Enter your national number'} className={getInputStyle('mobileNumber')} value={form.mobileNumber} onChange={handleChange('mobileNumber')} onBlur={handleBlur('mobileNumber')} />
                </div>
                <p className="text-[10px] text-[#607368] mt-1">Enter the number for the selected country, without the country calling code.</p>
                {touched.mobileNumber && errors.mobileNumber && <p className="text-red-500 text-[10px] mt-1 font-semibold">{errors.mobileNumber}</p>}
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input type="email" maxLength={254} autoComplete="email" className={getInputStyle('email')} value={form.email} onChange={handleChange('email')} onBlur={handleBlur('email')} />
                {touched.email && errors.email && <p className="text-red-500 text-[10px] mt-1 font-semibold">{errors.email}</p>}
              </div>
            </div>
          </section>

          <section className={`rounded-2xl border-2 p-4 transition-colors ${form.isGuardian ? 'border-[#164e43] bg-[#eaf4ef] shadow-sm' : 'border-[#164e43] bg-[#f5faf7] shadow-sm'}`}>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isGuardian}
                onChange={(e) => {
                  const updatedForm = { ...form, isGuardian: e.target.checked };
                  setForm(updatedForm);
                  setGlobalError('');
                  if (touched.birthdate) {
                    validateField('birthdate', form.birthdate, updatedForm).then((errMsg) => {
                      setErrors((prev) => ({ ...prev, birthdate: errMsg }));
                    });
                  }
                }}
                className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-gray-400 text-[#164e43] accent-[#164e43]"
              />
              <span className="block">
                <span className="block text-sm font-black uppercase tracking-wide text-[#164e43]">I am a guardian</span>
                <span className="mt-1 block text-xs font-medium text-[#40584f]">Registering a child or another patient? Select this to add your guardian contact information.</span>
              </span>
            </label>
            {form.isGuardian && (
              <div className="mt-4 rounded-xl border border-[#bcd7ca] bg-white p-4 space-y-3">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-[#164e43]">Guardian Information</h4>
                  <p className="text-[11px] text-[#607368] mt-1">Provide your contact information as the patient’s guardian.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Guardian full name *</label>
                    <input
                      required={form.isGuardian}
                      autoComplete="name"
                      className={getInputStyle('guardianName')}
                      value={form.guardianName}
                      onChange={handleChange('guardianName')}
                      onBlur={handleBlur('guardianName')}
                    />
                    {touched.guardianName && errors.guardianName && <p className="text-red-500 text-[10px] mt-1 font-semibold">{errors.guardianName}</p>}
                  </div>
                  <div>
                    <label className={labelClass}>Relationship to patient *</label>
                    <input
                      required={form.isGuardian}
                      placeholder="e.g. Parent"
                      className={getInputStyle('guardianRelationship')}
                      value={form.guardianRelationship}
                      onChange={handleChange('guardianRelationship')}
                      onBlur={handleBlur('guardianRelationship')}
                    />
                    {touched.guardianRelationship && errors.guardianRelationship && <p className="text-red-500 text-[10px] mt-1 font-semibold">{errors.guardianRelationship}</p>}
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Guardian contact number *</label>
                    <div className="flex items-center gap-2">
                      <span className="rounded-xl border border-[#d4e2dc] bg-[#f5f7f6] px-3 py-2.5 text-xs font-bold text-[#607368]">{getPhoneCallingCode(address.countryCode)}</span>
                      <input
                        required={form.isGuardian}
                        type="tel"
                        inputMode="numeric"
                        maxLength={address.countryCode === 'PH' ? 10 : 15}
                        pattern={address.countryCode === 'PH' ? '9[0-9]{9}' : undefined}
                        autoComplete="tel-national"
                        placeholder={address.countryCode === 'PH' ? '9XXXXXXXXX' : 'Enter national number'}
                        className={getInputStyle('guardianContact')}
                        value={form.guardianContact}
                        onChange={handleChange('guardianContact')}
                        onBlur={handleBlur('guardianContact')}
                      />
                    </div>
                    {touched.guardianContact && errors.guardianContact && <p className="text-red-500 text-[10px] mt-1 font-semibold">{errors.guardianContact}</p>}
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#164e43]">Address</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Country *</label>
                <select
                  required
                  className={`${baseInputClass} ${normalInputClass}`}
                  value={address.countryCode}
                  onChange={(event) => {
                    const country = COUNTRIES.find((item) => item.code === event.target.value);
                    updateAddress({
                      ...INITIAL_ADDRESS,
                      countryCode: country?.code || '',
                      countryName: country?.code === 'PH' ? 'Philippines' : (country?.name || ''),
                    });
                    setSubdivisionOptions([]);
                    setSubdivisionStatus({ loading: Boolean(country?.code && country.code !== 'PH'), error: '' });
                    setGlobalError('');
                  }}
                >
                  <option value="">Select country</option>
                  {COUNTRIES.map((country) => (
                    <option key={country.code} value={country.code}>{country.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {address.countryCode === 'PH' ? (
              <PhAddressSelect value={address} onChange={updateAddress} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(subdivisionOptions.length > 0 || subdivisionStatus.loading || subdivisionStatus.error || COUNTRIES_WITH_SUBDIVISIONS.has(address.countryCode)) && (
                  <div>
                    <label className={labelClass}>{subdivisionLabelForCountry(address.countryCode)}{subdivisionOptions.length > 0 || subdivisionStatus.error || COUNTRIES_WITH_SUBDIVISIONS.has(address.countryCode) ? ' *' : ''}</label>
                    {subdivisionOptions.length > 0 ? (
                      <select
                        required
                        className={`${baseInputClass} ${normalInputClass}`}
                        value={address.subdivisionName}
                        disabled={subdivisionStatus.loading}
                        onChange={(event) => updateAddress({ subdivisionName: event.target.value })}
                      >
                        <option value="">{subdivisionStatus.loading ? 'Loading...' : 'Select region'}</option>
                        {subdivisionOptions.map((subdivision) => (
                          <option key={subdivision} value={subdivision}>{subdivision}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        required={Boolean(subdivisionStatus.error) || COUNTRIES_WITH_SUBDIVISIONS.has(address.countryCode)}
                        autoComplete="address-level1"
                        className={`${baseInputClass} ${normalInputClass}`}
                        value={address.subdivisionName}
                        disabled={subdivisionStatus.loading}
                        onChange={(event) => updateAddress({ subdivisionName: event.target.value })}
                      />
                    )}
                    {subdivisionStatus.error && <p className="mt-1 text-[10px] font-semibold text-amber-700">{subdivisionStatus.error}</p>}
                  </div>
                )}
                <div>
                  <label className={labelClass}>City / Town *</label>
                  <input
                    required
                    autoComplete="address-level2"
                    className={`${baseInputClass} ${normalInputClass}`}
                    value={address.cityName}
                    onChange={(event) => updateAddress({ cityName: event.target.value })}
                    onBlur={handlePostalLookup}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>House No. / Street *</label>
                  <input
                    required
                    autoComplete="address-line1"
                    className={`${baseInputClass} ${normalInputClass}`}
                    value={address.street}
                    onChange={(event) => updateAddress({ street: event.target.value })}
                  />
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>{postalLabelForCountry(address.countryCode)}</label>
                <input
                  autoComplete="postal-code"
                  className={`${baseInputClass} ${normalInputClass} bg-gray-50`}
                  value={address.postalCode}
                  readOnly
                  aria-readonly="true"
                  placeholder={postalLookupStatus.loading ? 'Looking up…' : 'Auto-filled from region and city'}
                />
                {postalLookupStatus.message && <p role="status" className="mt-1 text-[10px] font-semibold text-[#607368]">{postalLookupStatus.message}</p>}
              </div>
            </div>
            <p className="text-[10px] text-[#607368]">
              Postal lookup results use OpenStreetMap data. <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
            </p>
          </section>

          <section className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#164e43]">Account</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Username *</label>
                <input required autoComplete="off" className={getInputStyle('username')} value={form.username} onChange={handleChange('username')} onBlur={handleBlur('username')} />
                {touched.username && errors.username && <p className="text-red-500 text-[10px] mt-1 font-semibold">{errors.username}</p>}
              </div>
              <div>
                <label className={labelClass}>Password *</label>
                <div className="relative">
                  <input required type={showPassword ? 'text' : 'password'} autoComplete="new-password" className={`${getInputStyle('password')} pr-10`} value={form.password} onChange={handleChange('password')} onBlur={handleBlur('password')} />
                  <PasswordVisibilityButton visible={showPassword} onClick={() => setShowPassword(v => !v)} label={showPassword ? 'Hide password' : 'Show password'} />
                </div>
                {touched.password && errors.password && <p className="text-red-500 text-[10px] mt-1 font-semibold">{errors.password}</p>}
              </div>
              <div>
                <label className={labelClass}>Confirm password *</label>
                <div className="relative">
                  <input required type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" className={`${getInputStyle('confirmPassword')} pr-10`} value={form.confirmPassword} onChange={handleChange('confirmPassword')} onBlur={handleBlur('confirmPassword')} />
                  <PasswordVisibilityButton visible={showConfirmPassword} onClick={() => setShowConfirmPassword(v => !v)} label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'} />
                </div>
                {touched.confirmPassword && errors.confirmPassword && <p className="text-red-500 text-[10px] mt-1 font-semibold">{errors.confirmPassword}</p>}
              </div>
            </div>
          </section>

          <div className="flex gap-3 pt-2 border-t border-[#f0f5f2]">
            <button type="button" onClick={handleClose} className="bg-white border border-[#d4e2dc] text-[#13241b] px-6 py-3 rounded-xl font-bold text-xs cursor-pointer">Cancel</button>
            <button type="submit" disabled={submitting || subdivisionStatus.loading} className="bg-[#164e43] hover:bg-[#0f362e] text-white px-8 py-3 rounded-xl font-bold text-xs cursor-pointer disabled:opacity-60">
              {submitting ? 'Submitting...' : subdivisionStatus.loading ? 'Loading address options...' : 'Submit for verification'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}