import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import PhAddressSelect from './PhAddressSelect';
import { EMPTY_ADDRESS, buildCompleteAddress } from '../lib/phAddress';
import showPasswordIcon from '../assets/forgot-pass-default.png';
import hidePasswordIcon from '../assets/forgot-pass-clicked.png';

const baseInputClass = 'w-full border rounded-xl p-2.5 text-xs font-semibold focus:outline-none transition-colors';
const normalInputClass = 'border-[#d4e2dc] bg-white focus:border-[#164e43]';
const errorInputClass = 'border-red-500 bg-red-50/30 focus:border-red-600';
const labelClass = 'block font-bold text-[#607368] mb-1 text-xs';

const ALLOWED_EMAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'yahoo.com.ph'];

const INITIAL = {
  firstName: '', middleName: '', lastName: '', birthdate: '', sex: '',
  mobileNumber: '', email: '', username: '', password: '', confirmPassword: '',
};

const PLACE_REGEX = /^[\p{L}\p{M}0-9\s.,'’\-()\/&]+$/u;

export default function RegisterModal({ isOpen, onClose, onSuccess }) {
  const [form, setForm] = useState(INITIAL);
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [globalError, setGlobalError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  if (!isOpen) return null;

  const validateField = async (field, value, allValues = form) => {
    switch (field) {
      case 'firstName': {
        const v = value.trim();
        if (!v) return 'First name is required.';
        if (v.length < 2 || v.length > 50) return 'First name must be 2 to 50 characters.';
        if (!/^[A-Za-z\s'\-]+$/.test(v)) return 'First name can only have letters, spaces, hyphens, and apostrophes.';
        return '';
      }
      case 'lastName': {
        const v = value.trim();
        if (!v) return 'Last name is required.';
        if (v.length < 2 || v.length > 50) return 'Last name must be 2 to 50 characters.';
        if (!/^[A-Za-z\s'\-]+$/.test(v)) return 'Last name can only have letters, spaces, hyphens, and apostrophes.';
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
          if (!error && data && data.length > 0) {
            return 'That username is already taken.';
          }
        } catch (err) {
          console.error('Username check error:', err);
        }
        return '';
      }
      case 'birthdate': {
        if (!value) return 'Birthday is required.';
        const birthDateObj = new Date(value);
        const limit = new Date();
        limit.setHours(0, 0, 0, 0);
        limit.setFullYear(limit.getFullYear() - 13);
        if (birthDateObj > limit) return 'You must be at least 13 years old.';
        return '';
      }
      case 'sex':
        if (!value) return 'Please select your sex.';
        return '';
      case 'mobileNumber': {
        const v = value.trim();
        if (!v) return 'Mobile number is required.';
        if (!/^09\d{9}$/.test(v)) {
          return 'Enter an 11-digit mobile number starting with 09 (e.g. 09171234567).';
        }
        return '';
      }
      case 'email': {
        const v = value.trim().toLowerCase();
        if (!v) return ''; // Email is optional, remove if required
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
          return 'Enter a valid email address.';
        }
        const domain = v.split('@')[1];
        if (!ALLOWED_EMAIL_DOMAINS.includes(domain)) {
          return `Only common email providers are allowed (${ALLOWED_EMAIL_DOMAINS.join(', ')}).`;
        }
        try {
          const { data, error } = await supabase.from('staff_users').select('id').eq('email', v).limit(1);
          if (!error && data && data.length > 0) {
            return 'This email address is already registered.';
          }
        } catch (err) {
          console.error('Email DB check error:', err);
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
    if (field === 'mobileNumber') {
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
    setAddress(EMPTY_ADDRESS);
    setErrors({});
    setTouched({});
    setGlobalError('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    onClose();
  };

  const PasswordVisibilityButton = ({ visible, onClick, label }) => (
    <button type="button" onClick={onClick} aria-label={label} aria-pressed={visible} className="absolute inset-y-0 right-2 flex items-center px-1 text-[#20282b] cursor-pointer">
      <img aria-hidden="true" src={visible ? hidePasswordIcon : showPasswordIcon} alt="" className="h-6 w-6 object-contain" />
    </button>
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGlobalError('');

    const newErrors = {};
    for (const field of Object.keys(form)) {
      const err = await validateField(field, form[field]);
      if (err) newErrors[field] = err;
    }

    if (!address.regionCode || !address.cityCode || !(address.barangayName || address.barangayCode)) {
      setGlobalError('Please complete your address (region, city/municipality and barangay).');
    }

    setErrors(newErrors);
    setTouched({
      firstName: true, middleName: true, lastName: true, birthdate: true,
      sex: true, mobileNumber: true, email: true, username: true,
      password: true, confirmPassword: true,
    });

    if (Object.keys(newErrors).length > 0 || (!address.regionCode || !address.cityCode || !(address.barangayName || address.barangayCode))) {
      return;
    }

    setSubmitting(true);
    try {
      const firstName = form.firstName.trim();
      const middleName = form.middleName.trim();
      const lastName = form.lastName.trim();
      const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');
      const username = form.username.trim().toLowerCase();

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
        street: address.street.trim(),
        region_code: address.regionCode,
        region_name: address.regionName,
        province_code: address.provinceCode === '__independent__' ? null : (address.provinceCode || null),
        province_name: address.provinceName || null,
        city_code: address.cityCode,
        city_name: address.cityName,
        barangay_code: address.barangayCode || null,
        barangay_name: address.barangayName,
        complete_address: buildCompleteAddress({ ...address, street: address.street.trim() }),
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
                <input required type="tel" inputMode="numeric" maxLength={11} placeholder="09171234567" className={getInputStyle('mobileNumber')} value={form.mobileNumber} onChange={handleChange('mobileNumber')} onBlur={handleBlur('mobileNumber')} />
                {touched.mobileNumber && errors.mobileNumber && <p className="text-red-500 text-[10px] mt-1 font-semibold">{errors.mobileNumber}</p>}
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input type="email" className={getInputStyle('email')} value={form.email} onChange={handleChange('email')} onBlur={handleBlur('email')} />
                {touched.email && errors.email && <p className="text-red-500 text-[10px] mt-1 font-semibold">{errors.email}</p>}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#164e43]">Address</h4>
            <PhAddressSelect value={address} onChange={setAddress} />
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
            <button type="submit" disabled={submitting} className="bg-[#164e43] hover:bg-[#0f362e] text-white px-8 py-3 rounded-xl font-bold text-xs cursor-pointer disabled:opacity-60">
              {submitting ? 'Submitting...' : 'Submit for verification'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}