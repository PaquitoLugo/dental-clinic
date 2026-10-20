import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const TODAY = new Date();
const MAX_YEAR = TODAY.getFullYear();
const MAX_MONTH = TODAY.getMonth() + 1;
const MAX_DAY = TODAY.getDate() - 1;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const NAME_REGEX = /^[A-Za-z'-]+$/;

const BIRTH_YEAR_OPTIONS = Array.from({ length: 120 }, (_, i) => MAX_YEAR - i);
const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1);

const emptyForm = {
  firstName: "",
  lastName: "",
  middleName: "",
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
  birthMonth: "",
  birthDay: "",
  birthYear: "",
  street: "",
  regionCode: "",
  cityCode: "",
  barangayCode: "",
};

function isAllowedEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateName(value, label) {
  const trimmed = value.trim();
  if (!trimmed) return `${label} is required.`;
  if (trimmed.length > 50) return `${label} must be 50 characters or fewer.`;
 
  return null;
}

function validate(f, resetBirthdate, emailDomainStatus) {
  const e = {};

  const firstNameErr = validateName(f.firstName, "First name");
  if (firstNameErr) e.firstName = firstNameErr;

  const lastNameErr = validateName(f.lastName, "Last name");
  if (lastNameErr) e.lastName = lastNameErr;

  if (f.middleName.trim()) {
    const middleNameErr = validateName(f.middleName, "Middle name");
    if (middleNameErr) e.middleName = middleNameErr;
  }

  if (!f.username.trim()) e.username = "Username is required.";

  if (!f.email.trim()) {
    e.email = "Email is required.";
  } else if (!isAllowedEmail(f.email)) {
    e.email = "Enter a valid email address.";
  } else if (emailDomainStatus === "checking") {
    e.email = "Checking if the email domain exists...";
  } else if (emailDomainStatus === "invalid") {
    e.email = "This email domain does not exist.";
  }

  if (!f.password) {
    e.password = "Password is required.";
  } else if (!PASSWORD_REGEX.test(f.password)) {
    e.password = "Password needs 8+ characters, uppercase, lowercase, number, and special character.";
  }

  if (!f.confirmPassword) {
    e.confirmPassword = "Please confirm your password.";
  } else if (f.confirmPassword !== f.password) {
    e.confirmPassword = "Passwords do not match.";
  }

  if (!f.birthMonth || !f.birthDay || !f.birthYear) {
    e.birthdate = "Complete birthdate is required.";
  } else {
    const selectedYear = Number(f.birthYear);
    const selectedMonth = Number(f.birthMonth);
    const selectedDay = Number(f.birthDay);
    const selectedDate = new Date(selectedYear, selectedMonth - 1, selectedDay);

    if (
      selectedDate.getFullYear() !== selectedYear ||
      selectedDate.getMonth() !== selectedMonth - 1 ||
      selectedDate.getDate() !== selectedDay
    ) {
      e.birthdate = "Invalid calendar date selected.";
    } else if (selectedDate > TODAY) {
      resetBirthdate();
      e.birthdate = `Birthdate cannot be later than ${MONTHS[MAX_MONTH - 1]} ${MAX_DAY}, ${MAX_YEAR}.`;
    }
  }

  if (!f.street.trim()) e.street = "No. / Block is required.";
  if (!f.regionCode) e.regionCode = "Select a region.";
  if (!f.cityCode) e.cityCode = "Select a city.";
  if (!f.barangayCode) e.barangayCode = "Select a barangay.";

  return e;
}

export default function RegisterModal({ isOpen, onClose, onSuccess }) {
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [futureDateError, setFutureDateError] = useState(false);
  const [emailDomainStatus, setEmailDomainStatus] = useState("idle");

  const [regionsList, setRegionsList] = useState([]);
  const [citiesList, setCitiesList] = useState([]);
  const [barangaysList, setBarangaysList] = useState([]);

  const [loadingRegions, setLoadingRegions] = useState(true);
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadingBarangays, setLoadingBarangays] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    setErrors(
      validate(form, () => {
        setForm((f) => ({ ...f, birthMonth: "", birthDay: "", birthYear: "" }));
        setFutureDateError(true);
      }, emailDomainStatus)
    );
  }, [form, emailDomainStatus]);

  useEffect(() => {
    const email = form.email.trim();
    if (!isAllowedEmail(email)) {
      setEmailDomainStatus("idle");
      return;
    }

    const domain = email.split("@")[1].toLowerCase();
    setEmailDomainStatus("checking");

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`);
        const data = await res.json();
        if (cancelled) return;
        const hasMx = Array.isArray(data.Answer) && data.Answer.some((a) => a.type === 15);
        setEmailDomainStatus(hasMx ? "valid" : "invalid");
      } catch (err) {
        if (!cancelled) setEmailDomainStatus("error");
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.email]);

  useEffect(() => {
    async function fetchRegions() {
      try {
        const res = await fetch("https://psgc.cloud/api/regions");
        const data = await res.json();
        setRegionsList(data);
      } catch (err) {
        console.error("Failed to fetch regions:", err);
      } finally {
        setLoadingRegions(false);
      }
    }
    if (isOpen) fetchRegions();
  }, [isOpen]);

  const update = (key) => (ev) => {
    setForm((f) => ({ ...f, [key]: ev.target.value }));
    setTouched((t) => ({ ...t, [key]: true }));
    if (key.startsWith("birth")) setFutureDateError(false);
  };

  const markTouched = (key) => () => {
    setTouched((t) => ({ ...t, [key]: true }));
  };

  const handleRegionChange = async (ev) => {
    const regionCode = ev.target.value;
    setForm((f) => ({ ...f, regionCode, cityCode: "", barangayCode: "" }));
    setTouched((t) => ({ ...t, regionCode: true, cityCode: false, barangayCode: false }));
    setCitiesList([]);
    setBarangaysList([]);
    if (!regionCode) return;

    setLoadingCities(true);
    try {
      const cityRes = await fetch(`https://psgc.cloud/api/regions/${regionCode}/cities-municipalities`);
      const cityData = await cityRes.json();
      setCitiesList(cityData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingCities(false);
    }
  };

  const handleCityChange = async (ev) => {
    const cityCode = ev.target.value;
    setForm((f) => ({ ...f, cityCode, barangayCode: "" }));
    setTouched((t) => ({ ...t, cityCode: true, barangayCode: false }));
    setBarangaysList([]);
    if (!cityCode) return;

    setLoadingBarangays(true);
    try {
      const res = await fetch(`https://psgc.cloud/api/cities-municipalities/${cityCode}/barangays`);
      const data = await res.json();
      setBarangaysList(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingBarangays(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setSubmitError("");
    const allTouched = Object.keys(emptyForm).reduce((acc, k) => ({ ...acc, [k]: true }), {});
    setTouched(allTouched);

    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    const fullName = `${form.firstName.trim()} ${form.middleName.trim()} ${form.lastName.trim()}`.replace(/\s+/g, " ");

    try {
      const { error } = await supabase.from('staff_users').insert([
        {
          username: form.username.trim().toLowerCase(),
          password: form.password.trim(),
          role: 'patient',
          full_name: fullName
        }
      ]);

      if (error) {
        setSubmitError(error.message || "Registration failed. Username may be taken.");
      } else {
        onSuccess(form.username, form.password);
        onClose();
      }
    } catch (err) {
      setSubmitError("Unexpected registration error.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const isMaxYear = Number(form.birthYear) === MAX_YEAR;
  const isMaxMonth = isMaxYear && Number(form.birthMonth) === MAX_MONTH;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-2xl p-8 shadow-2xl relative my-8 max-h-[90vh] overflow-y-auto border border-[#d4e2dc]">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 font-bold text-xl cursor-pointer"
        >
          ✕
        </button>

        <div className="border-b border-[#f3e8ff] pb-4 mb-6">
          <h2 className="text-2xl font-black text-[#164e43]">Patient Registration</h2>
          <p className="text-xs font-semibold text-[#607368] mt-1">Please fill out all required details below to create your patient account.</p>
        </div>

        {submitError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-xl mb-4 font-bold">
            ⚠️ {submitError}
          </div>
        )}

        <form onSubmit={handleRegisterSubmit} className="space-y-4 text-xs">
          {/* Names */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-bold text-[#13241b] mb-1">First Name *</label>
              <input className="w-full border border-[#d4e2dc] rounded-xl p-2.5 bg-[#f5f7f6] outline-none" value={form.firstName} onChange={update("firstName")} onBlur={markTouched("firstName")} />
              {touched.firstName && errors.firstName && <span className="text-[10px] text-red-600">{errors.firstName}</span>}
            </div>
            <div>
              <label className="block font-bold text-[#13241b] mb-1">Last Name *</label>
              <input className="w-full border border-[#d4e2dc] rounded-xl p-2.5 bg-[#f5f7f6] outline-none" value={form.lastName} onChange={update("lastName")} onBlur={markTouched("lastName")} />
              {touched.lastName && errors.lastName && <span className="text-[10px] text-red-600">{errors.lastName}</span>}
            </div>
            <div>
              <label className="block font-bold text-[#13241b] mb-1">Middle Name</label>
              <input className="w-full border border-[#d4e2dc] rounded-xl p-2.5 bg-[#f5f7f6] outline-none" value={form.middleName} onChange={update("middleName")} onBlur={markTouched("middleName")} />
              {touched.middleName && errors.middleName && <span className="text-[10px] text-red-600">{errors.middleName}</span>}
            </div>
          </div>

          {/* Credentials */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-[#13241b] mb-1">Username *</label>
              <input className="w-full border border-[#d4e2dc] rounded-xl p-2.5 bg-[#f5f7f6] outline-none" value={form.username} onChange={update("username")} onBlur={markTouched("username")} />
              {touched.username && errors.username && <span className="text-[10px] text-red-600">{errors.username}</span>}
            </div>
            <div>
              <label className="block font-bold text-[#13241b] mb-1">Email *</label>
              <input type="email" className="w-full border border-[#d4e2dc] rounded-xl p-2.5 bg-[#f5f7f6] outline-none" value={form.email} onChange={update("email")} onBlur={markTouched("email")} />
              {touched.email && errors.email && <span className="text-[10px] text-red-600">{errors.email}</span>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-[#13241b] mb-1">Password *</label>
              <input type="password" className="w-full border border-[#d4e2dc] rounded-xl p-2.5 bg-[#f5f7f6] outline-none" value={form.password} onChange={update("password")} onBlur={markTouched("password")} />
              {touched.password && errors.password && <span className="text-[10px] text-red-600">{errors.password}</span>}
            </div>
            <div>
              <label className="block font-bold text-[#13241b] mb-1">Confirm Password *</label>
              <input type="password" className="w-full border border-[#d4e2dc] rounded-xl p-2.5 bg-[#f5f7f6] outline-none" value={form.confirmPassword} onChange={update("confirmPassword")} onBlur={markTouched("confirmPassword")} />
              {touched.confirmPassword && errors.confirmPassword && <span className="text-[10px] text-red-600">{errors.confirmPassword}</span>}
            </div>
          </div>

          {/* Birthdate */}
          <div>
            <label className="block font-bold text-[#13241b] mb-1">Birthdate *</label>
            <div className="grid grid-cols-3 gap-2">
              <select className="border border-[#d4e2dc] rounded-xl p-2.5 bg-[#f5f7f6]" value={form.birthMonth} onChange={update("birthMonth")} onBlur={markTouched("birthMonth")}>
                <option value="">Month</option>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1} disabled={isMaxYear && (i + 1) > MAX_MONTH}>{m}</option>
                ))}
              </select>
              <select className="border border-[#d4e2dc] rounded-xl p-2.5 bg-[#f5f7f6]" value={form.birthDay} onChange={update("birthDay")} onBlur={markTouched("birthDay")}>
                <option value="">Day</option>
                {DAY_OPTIONS.map((d) => (
                  <option key={d} value={d} disabled={isMaxMonth && d > MAX_DAY}>{d}</option>
                ))}
              </select>
              <select className="border border-[#d4e2dc] rounded-xl p-2.5 bg-[#f5f7f6]" value={form.birthYear} onChange={update("birthYear")} onBlur={markTouched("birthYear")}>
                <option value="">Year</option>
                {BIRTH_YEAR_OPTIONS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            {(touched.birthMonth || touched.birthDay || touched.birthYear) && errors.birthdate && (
              <span className="text-[10px] text-red-600 mt-1 block">{errors.birthdate}</span>
            )}
          </div>

          {/* Address */}
          <div className="bg-[#f8faf9] border border-[#d4e2dc] rounded-2xl p-4 space-y-3">
            <span className="font-bold text-[#164e43] block text-xs">Address Information</span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-[#13241b] mb-1">No. / Block *</label>
                <input className="w-full border border-[#d4e2dc] rounded-xl p-2 bg-white" value={form.street} onChange={update("street")} onBlur={markTouched("street")} />
                {touched.street && errors.street && <span className="text-[10px] text-red-600">{errors.street}</span>}
              </div>
              <div>
                <label className="block font-bold text-[#13241b] mb-1">Region *</label>
                <select className="w-full border border-[#d4e2dc] rounded-xl p-2 bg-white" value={form.regionCode} onChange={handleRegionChange} disabled={loadingRegions}>
                  <option value="">{loadingRegions ? "Loading..." : "Select Region"}</option>
                  {regionsList.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
                </select>
                {touched.regionCode && errors.regionCode && <span className="text-[10px] text-red-600">{errors.regionCode}</span>}
              </div>
              <div>
                <label className="block font-bold text-[#13241b] mb-1">City *</label>
                <select className="w-full border border-[#d4e2dc] rounded-xl p-2 bg-white" value={form.cityCode} onChange={handleCityChange} disabled={!form.regionCode || loadingCities}>
                  <option value="">{loadingCities ? "Loading..." : "Select City"}</option>
                  {citiesList.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
                {touched.cityCode && errors.cityCode && <span className="text-[10px] text-red-600">{errors.cityCode}</span>}
              </div>
              <div>
                <label className="block font-bold text-[#13241b] mb-1">Barangay *</label>
                <select className="w-full border border-[#d4e2dc] rounded-xl p-2 bg-white" value={form.barangayCode} onChange={update("barangayCode")} disabled={!form.cityCode || loadingBarangays}>
                  <option value="">{loadingBarangays ? "Loading..." : "Select Barangay"}</option>
                  {barangaysList.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
                </select>
                {touched.barangayCode && errors.barangayCode && <span className="text-[10px] text-red-600">{errors.barangayCode}</span>}
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-[#164e43] text-white py-3.5 rounded-2xl font-bold text-sm hover:bg-[#0f362e] transition cursor-pointer mt-4"
          >
            {isSubmitting ? "Submitting Registration..." : "Complete Registration"}
          </button>
        </form>
      </div>
    </div>
  );
}