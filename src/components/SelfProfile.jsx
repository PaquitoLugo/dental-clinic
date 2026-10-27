import { useEffect, useState } from 'react';
import { getData as getCountryData } from 'country-list';
import { supabase } from '../lib/supabase';

const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
const countries = getCountryData()
  .map(({ code, name }) => ({ code, name: countryNames.of(code) || name }))
  .sort((a, b) => a.name.localeCompare(b.name));
const inputClass = 'mt-1 w-full rounded-xl border border-[#d4e2dc] bg-white p-2.5 text-sm focus:border-[#164e43] focus:outline-none';
const profileFields = 'id, role, first_name, middle_name, last_name, full_name, username, email, mobile_number, birthdate, sex, complete_address, country_code, country_name, postal_code';

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
  mobile_number: profile.mobile_number || '',
  birthdate: profile.birthdate || '',
  sex: profile.sex || '',
  complete_address: profile.complete_address || '',
  country_code: profile.country_code || 'PH',
  postal_code: profile.postal_code || '',
});

export default function SelfProfile({ user, role, onSaved }) {
  const [form, setForm] = useState(null);
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

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form || !user?.id) return;

    const firstName = form.first_name.trim();
    const middleName = form.middle_name.trim();
    const lastName = form.last_name.trim();
    if (!firstName || !lastName) {
      setErrorMessage('First and last name are required.');
      return;
    }
    const username = form.username.trim().toLowerCase();
    if (!/^[a-z0-9_.]{4,20}$/.test(username)) {
      setErrorMessage('Username must be 4–20 characters: letters, numbers, dot, or underscore.');
      return;
    }

    setSaving(true);
    setMessage('');
    setErrorMessage('');
    try {
      const country = countries.find((item) => item.code === form.country_code);
      const update = {
        first_name: firstName,
        middle_name: middleName || null,
        last_name: lastName,
        full_name: [firstName, middleName, lastName].filter(Boolean).join(' '),
        username,
        email: form.email.trim() || null,
        mobile_number: form.mobile_number.trim() || null,
        birthdate: form.birthdate || null,
        sex: form.sex || null,
        complete_address: form.complete_address.trim() || null,
        country_code: form.country_code || null,
        country_name: country?.name || null,
        postal_code: form.postal_code.trim() || null,
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
      setMessage('Your profile was updated.');
      onSaved?.(data);
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
      <form onSubmit={handleSubmit} className="max-w-3xl space-y-4 rounded-2xl border border-[#d4e2dc] bg-white p-6 shadow-2xs">
        {errorMessage && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800">{errorMessage}</p>}
        {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">{message}</p>}
        {form && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-xs font-bold text-[#40584f]">First name *
                <input required autoComplete="given-name" className={inputClass} value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} />
              </label>
              <label className="text-xs font-bold text-[#40584f]">Middle name
                <input autoComplete="additional-name" className={inputClass} value={form.middle_name} onChange={(event) => setForm({ ...form, middle_name: event.target.value })} />
              </label>
              <label className="text-xs font-bold text-[#40584f]">Last name *
                <input required autoComplete="family-name" className={inputClass} value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} />
              </label>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-[#40584f]">Username *
                <input required autoComplete="username" className={inputClass} value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
              </label>
              <label className="text-xs font-bold text-[#40584f]">Email
                <input type="email" autoComplete="email" className={inputClass} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
              </label>
              <label className="text-xs font-bold text-[#40584f]">Mobile number
                <input type="tel" autoComplete="tel" className={inputClass} value={form.mobile_number} onChange={(event) => setForm({ ...form, mobile_number: event.target.value })} />
              </label>
              <label className="text-xs font-bold text-[#40584f]">Birth date
                <input type="date" autoComplete="bday" className={inputClass} value={form.birthdate} onChange={(event) => setForm({ ...form, birthdate: event.target.value })} />
              </label>
              <label className="text-xs font-bold text-[#40584f]">Sex
                <select className={inputClass} value={form.sex} onChange={(event) => setForm({ ...form, sex: event.target.value })}>
                  <option value="">Select</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </label>
              <label className="text-xs font-bold text-[#40584f]">Country
                <select className={inputClass} value={form.country_code} onChange={(event) => setForm({ ...form, country_code: event.target.value })}>
                  {countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold text-[#40584f]">Postal code
                <input autoComplete="postal-code" className={inputClass} value={form.postal_code} onChange={(event) => setForm({ ...form, postal_code: event.target.value })} />
              </label>
            </div>
            <label className="block text-xs font-bold text-[#40584f]">Address
              <textarea autoComplete="street-address" rows="3" className={inputClass} value={form.complete_address} onChange={(event) => setForm({ ...form, complete_address: event.target.value })} />
            </label>
            <button type="submit" disabled={saving} className="rounded-xl bg-[#164e43] px-5 py-3 text-xs font-bold text-white hover:bg-[#0f362e] disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? 'Saving…' : 'Save Profile'}
            </button>
          </>
        )}
      </form>
    </section>
  );
}
