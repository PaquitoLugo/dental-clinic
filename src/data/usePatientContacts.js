import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { belongsToPatient } from './patientMatch';

/** Loads patient account state for visit logs and resolves account contact details. */
export default function usePatientContacts() {
  const [patients, setPatients] = useState([]);
  useEffect(() => {
    let active = true;
    supabase.from('staff_users').select('id, full_name, mobile_number, archived_at').eq('role', 'patient')
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error('Could not load patient account states:', error.message);
          return;
        }
        setPatients(data || []);
      });
    return () => { active = false; };
  }, []);
  const contactFor = useCallback(
    (appointment) => appointment.contact_number || appointment.mobile_number
      || patients.find((patient) => belongsToPatient(appointment, patient))?.mobile_number || '',
    [patients]
  );
  const isArchivedPatient = useCallback(
    (appointment) => Boolean(patients.find((patient) => belongsToPatient(appointment, patient))?.archived_at),
    [patients]
  );
  return { contactFor, isArchivedPatient };
}
