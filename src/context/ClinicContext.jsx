import React, { createContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export const ClinicContext = createContext();

export function ClinicProvider({ children }) {
  const [appointments, setAppointments] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

  const refreshData = async () => {
    try {
      setLoading(true);
      const [apptsRes, servRes] = await Promise.all([
        supabase.from('appointments').select('*').order('appointment_date', { ascending: true }),
        supabase.from('services').select('*').eq('is_active', true)
      ]);

      if (apptsRes.data) setAppointments(apptsRes.data);
      if (servRes.data) setServices(servRes.data);
    } catch (err) {
      console.error('Error fetching data from Supabase:', err);
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

  const addService = async (serviceData) => {
    const { error } = await supabase.from('services').insert([serviceData]);
    if (!error) await refreshData();
  };

  const updateService = async (id, updatedFields) => {
    const { error } = await supabase
      .from('services')
      .update(updatedFields)
      .eq('id', id);
    if (!error) await refreshData();
  };

  const deleteService = async (id) => {
    const { error } = await supabase
      .from('services')
      .delete()
      .eq('id', id);
    if (!error) await refreshData();
  };

  return (
    <ClinicContext.Provider value={{
      appointments,
      services,
      loading,
      refreshData,
      createAppointment,
      updateAppointmentStatus,
      saveToothChart,
      fetchPatientChart,
      addService,
      updateService,
      deleteService
    }}>
      {children}
    </ClinicContext.Provider>
  );
}