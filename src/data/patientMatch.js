// Links appointments to patient accounts. New appointments carry patient_id; older ones only have a typed name,
// so names are compared loosely (case, punctuation and middle initials ignored: "Jestoni E. De Asis" = "Jestoni De Asis").
export const normalizeName = (name = '') =>
  String(name).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 1).join(' ');

export const sameName = (a, b) => {
  const x = normalizeName(a);
  return !!x && x === normalizeName(b);
};

/** patient = { id, full_name } (or { id, name }) */
export const belongsToPatient = (appointment, patient) => {
  if (!appointment || !patient) return false;
  if (appointment.patient_id != null && patient.id != null) return String(appointment.patient_id) === String(patient.id);
  return sameName(appointment.patient_name, patient.full_name || patient.name);
};
