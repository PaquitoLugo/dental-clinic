import React, { createContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export const ClinicContext = createContext();

export function ClinicProvider({ children }) {
  const [appointments, setAppointments] = useState([]);
  const [services, setServices] = useState([]);
  const [dentists, setDentists] = useState([]);
  const [loading, setLoading] = useState(true);

  const refreshData = async () => {
    try {
      setLoading(true);
      const [apptsRes, servRes, staffRes] = await Promise.all([
        supabase.from('appointments').select('*').order('appointment_date', { ascending: true }),
        supabase.from('services').select('*').eq('is_active', true),
        supabase.from('staff_users').select('*').eq('role', 'dentist')
      ]);

      if (apptsRes.data) setAppointments(apptsRes.data);
      if (servRes.data) setServices(servRes.data);
      if (staffRes.data) setDentists(staffRes.data);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const createAppointment = async (apptData) => {
    const { error } = await supabase.from('appointments').insert([apptData]);
    if (!error) await refreshData();
  };

  const updateAppointmentStatus = async (id, status, queue_number = 0) => {
    const { error } = await supabase
      .from('appointments')
      .update({ status, queue_number })
      .eq('id', id);
    if (!error) await refreshData();
  };

  const saveToothChart = async (chartData) => {
    return await supabase.from('tooth_charting').upsert([chartData], { onConflict: 'patient_name,tooth_number' });
  };

  const fetchPatientChart = async (patientName) => {
    const { data } = await supabase
      .from('tooth_charting')
      .select('*')
      .eq('patient_name', patientName);
    return data || [];
  };

  return (
    <ClinicContext.Provider value={{
      appointments,
      services,
      dentists,
      loading,
      refreshData,
      createAppointment,
      updateAppointmentStatus,
      saveToothChart,
      fetchPatientChart
    }}>
      {children}
    </ClinicContext.Provider>
  );
}