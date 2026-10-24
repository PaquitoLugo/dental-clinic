import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import PhAddressSelect from './PhAddressSelect';
import { EMPTY_ADDRESS, buildCompleteAddress } from '../lib/phAddress';
import showPasswordIcon from '../assets/forgot-pass-default.png';
import hidePasswordIcon from '../assets/forgot-pass-clicked.png';

const inputClass = 'w-full border border-[#d4e2dc] rounded-xl p-2.5 bg-white text-xs font-semibold focus:outline-none focus:border-[#164e43]';
const labelClass = 'block font-bold text-[#607368] mb-1 text-xs';

const INITIAL = {
  firstName: '', middleName: '', lastName: '', birthdate: '', sex: '',
  mobileNumber: '', email: '', username: '', password: '', confirmPassword: '',
};

/**
 * Patient self-registration.
 * Creates a staff_users row with role 'patient' and account_status 'Pending'.
 * The clinic manager must accept the account (User Management) before the patient can sign in.
 */
export default function RegisterModal({ isOpen, onClose, onSuccess }) {
  const [form, setForm] = useState(INITIAL);
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  if (!isOpen) return null;

  const set = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setError('');
  };

  const today = new Date().toISOString().split('T')[0];

  const handleClose = () => {
    setForm(INITIAL);
    setAddress(EMPTY_ADDRESS);
    setError('');
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
    setError('');

    const username = form.username.trim().toLowerCase();
    const mobile = form.mobileNumber.trim();

    if (!/^[a-z0-9_.]{4,20}$/.test(username)) {
      return setError('Username must be 4-20 characters: letters, numbers, dot or underscore.');
    }
    if (!/^09\d{9}$/.test(mobile)) {
      return setError('Enter an 11-digit mobile number starting with 09 (e.g. 09171234567).');
    }
    if (form.password.length < 6) return setError('Password must be at least 6 characters.');
    if (form.password !== form.confirmPassword) return setError('Passwords do not match.');
    if (!address.regionCode || !address.cityCode || !(address.barangayName || address.barangayCode)) {
      return setError('Please complete your address (region, city/municipality and barangay).');
    }

    setSubmitting(true);
    try {
      // Username must be unique
      const { data: existing, error: lookupError } = await supabase
        .from('staff_users')
        .select('id')
        .eq('username', username)
        .limit(1);
      if (lookupError) throw lookupError;
      if (existing && existing.length > 0) {
        setError('That username is already taken. Please choose another one.');
        return;
      }

      const firstName = form.firstName.trim();
      const middleName = form.middleName.trim();
      const lastName = form.lastName.trim();
      const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');

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
        mobile_number: mobile,
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
      setError(`Registration failed: ${err.message || 'database error'}. If this mentions a missing column, run supabase_migration.sql.`);
    } finally {
      setSubmitting(false);
    }
  };

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

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3.5 rounded-xl font-bold">⚠️ {error}</div>
          )}

          <section className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#164e43]">Personal information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><label className={labelClass}>First name *</label><input required className={inputClass} value={form.firstName} onChange={set('firstName')} /></div>
              <div><label className={labelClass}>Middle name</label><input className={inputClass} value={form.middleName} onChange={set('middleName')} /></div>
              <div><label className={labelClass}>Last name *</label><input required className={inputClass} value={form.lastName} onChange={set('lastName')} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={labelClass}>Birth date *</label><input required type="date" max={today} className={inputClass} value={form.birthdate} onChange={set('birthdate')} /></div>
              <div>
                <label className={labelClass}>Sex *</label>
                <select required className={inputClass} value={form.sex} onChange={set('sex')}>
                  <option value="">Select</option><option value="Male">Male</option><option value="Female">Female</option>
                </select>
              </div>
              <div><label className={labelClass}>Mobile number *</label><input required type="tel" inputMode="numeric" maxLength={11} placeholder="09171234567" className={inputClass} value={form.mobileNumber} onChange={set('mobileNumber')} /></div>
              <div><label className={labelClass}>Email</label><input type="email" className={inputClass} value={form.email} onChange={set('email')} /></div>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#164e43]">Address</h4>
            <PhAddressSelect value={address} onChange={setAddress} />
          </section>

          <section className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#164e43]">Account</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><label className={labelClass}>Username *</label><input required autoComplete="off" className={inputClass} value={form.username} onChange={set('username')} /></div>
              <div>
                <label className={labelClass}>Password *</label>
                <div className="relative">
                  <input required type={showPassword ? 'text' : 'password'} autoComplete="new-password" className={`${inputClass} pr-10`} value={form.password} onChange={set('password')} />
                  <PasswordVisibilityButton visible={showPassword} onClick={() => setShowPassword(value => !value)} label={showPassword ? 'Hide password' : 'Show password'} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Confirm password *</label>
                <div className="relative">
                  <input required type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" className={`${inputClass} pr-10`} value={form.confirmPassword} onChange={set('confirmPassword')} />
                  <PasswordVisibilityButton visible={showConfirmPassword} onClick={() => setShowConfirmPassword(value => !value)} label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'} />
                </div>
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
