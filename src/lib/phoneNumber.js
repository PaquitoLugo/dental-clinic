import { getCountryCallingCode, parsePhoneNumberFromString } from 'libphonenumber-js';

export const getPhoneCallingCode = (countryCode) => {
  try {
    return `+${getCountryCallingCode(countryCode || 'PH')}`;
  } catch {
    return '';
  }
};

export const validatePhoneNumber = (value, countryCode = 'PH') => {
  const phone = value.trim();
  if (!phone) return '';
  if (!/^\d+$/.test(phone)) return 'Phone number can contain numbers only.';
  const parsed = parsePhoneNumberFromString(phone, countryCode || 'PH');
  if (!parsed || !parsed.isValid() || parsed.country !== (countryCode || 'PH')) {
    return `Enter a valid phone number for the selected country (${getPhoneCallingCode(countryCode)}).`;
  }
  return '';
};

export const toNationalPhoneDigits = (value, countryCode = 'PH') => {
  if (!value) return '';
  const parsed = parsePhoneNumberFromString(value, countryCode || 'PH');
  return parsed?.formatNational().replace(/\D/g, '') || value.replace(/\D/g, '');
};
