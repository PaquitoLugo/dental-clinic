import { validatePhoneNumber } from './phoneNumber';

const NAME_PATTERN = /^[\p{L}\p{M}]+(?:[ .'-][\p{L}\p{M}]+)*\.?$/u;
const USERNAME_PATTERN = /^[a-z0-9_.]{4,20}$/;

export const validateProfileName = (value, label, required = false) => {
  const name = value.trim();
  if (!name) return required ? `${label} is required.` : '';
  if (name.length > 50) return `${label} must be 50 characters or fewer.`;
  if (!NAME_PATTERN.test(name)) {
    return `${label} can only contain letters, spaces, apostrophes, periods, and hyphens.`;
  }
  return '';
};

export const validateProfileUsername = (value) => {
  const username = value.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) {
    return 'Username must be 4–20 characters: letters, numbers, dot, or underscore.';
  }
  return '';
};

export const validateProfileMobile = (value, countryCode = 'PH') => {
  const mobile = value.trim();
  if (!mobile) return '';
  return validatePhoneNumber(mobile, countryCode);
};

export const validateProfileBirthdate = (value) => {
  if (!value) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return 'Enter a valid birth date.';
  const [, year, month, day] = match;
  const birthdate = new Date(Number(year), Number(month) - 1, Number(day));
  if (birthdate.getFullYear() !== Number(year)
    || birthdate.getMonth() !== Number(month) - 1
    || birthdate.getDate() !== Number(day)) {
    return 'Enter a valid birth date.';
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return birthdate > today ? 'Birth date cannot be in the future.' : '';
};
