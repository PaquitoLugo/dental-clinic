import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { belongsToPatient } from './patientMatch';

/** Returns contactFor(appointment): the number saved on the appointment, else the patient account's mobile number. */
export default function usePatientContacts() {
  const [patients, setPatients] = useState([]);
  useEffect(() => {
    supabase.from('staff_users').select('id, full_name, mobile_number').eq('role', 'patient')
      .then(({ data }) => setPatients(data || []));
  }, []);
  return useCallback(
    (a) => a.contact_number || a.mobile_number || patients.find((p) => belongsToPatient(a, p))?.mobile_number || '',
    [patients]
  );
}
