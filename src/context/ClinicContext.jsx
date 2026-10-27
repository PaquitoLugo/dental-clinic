import React, { createContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export const ClinicContext = createContext();

export function ClinicProvider({ children }) {
  const [appointments, setAppointments] = useState([]);
  const [services, setServices] = useState([]);
  const [dentists, setDentists] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch all data exclusively from Supabase
  const refreshData = async () => {
    try {
      setLoading(true);
      const [apptsRes, servRes, staffRes] = await Promise.all([
        supabase.from('appointments').select('*').order('appointment_date', { ascending: true }),
        supabase.from('services').select('*'),
        supabase.from('staff_users').select('*').eq('role', 'dentist').is('archived_at', null)
      ]);

      if (apptsRes.error) throw apptsRes.error;
      if (servRes.error) throw servRes.error;
      if (staffRes.error) throw staffRes.error;

      if (apptsRes.data) setAppointments(apptsRes.data);
      if (servRes.data) setServices(servRes.data);
      if (staffRes.data) setDentists(staffRes.data);
    } catch (err) {
      console.error('Supabase fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const createAppointment = async (apptData) => {
    const { error } = await supabase.from('appointments').insert([apptData]);
    if (error) throw error;
    await refreshData();
  };

  const updateAppointmentStatus = async (id, status, queue_number = 0, additionalFields = {}) => {
    const { error } = await supabase
      .from('appointments')
      .update({ status, queue_number, ...additionalFields })
      .eq('id', id);
    if (error) {
      alert('Supabase Error: ' + error.message);
      return false;
    }
    await refreshData();
    return true;
  };

  // Direct Supabase Insert
  // Returns the inserted row, or THROWS on failure so the calling form
  // knows the save did not succeed (and doesn't clear itself).
  const addService = async (serviceData) => {
    const payload = {
      service_name: serviceData.service_name,
      category: serviceData.category,
      duration_mins: parseInt(serviceData.duration_mins || 30),
      price: parseFloat(serviceData.price),
      service_description: serviceData.service_description || null,
      is_active: true
    };

    const { data, error } = await supabase
      .from('services')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      throw error;
    }

    await refreshData();
    return data;
  };

  // Direct Supabase Update (throws on failure)
  const updateService = async (id, updatedData) => {
    const { error } = await supabase
      .from('services')
      .update(updatedData)
      .eq('id', id);

    if (error) {
      console.error('Supabase update error:', error);
      throw error;
    }

    await refreshData();
  };

  // Direct Supabase Soft Delete (sets is_active to false in the database)
  const deleteService = async (id) => {
    const { error } = await supabase
      .from('services')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      console.error('Supabase delete error:', error);
      throw error;
    }

    await refreshData();
  };

  const saveToothChart = async (chartData) => {
    return await supabase
      .from('tooth_charting')
      .upsert([chartData], { onConflict: 'patient_name,tooth_number' });
  };

  const fetchPatientChart = async (patientName) => {
    const { data } = await supabase
      .from('tooth_charting')
      .select('*')
      .eq('patient_name', patientName);
    return data || [];
  };

  return (
    <ClinicContext.Provider
      value={{
        appointments,
        services,
        dentists,
        loading,
        refreshData,
        createAppointment,
        updateAppointmentStatus,
        addService,
        updateService,
        deleteService,
        saveToothChart,
        fetchPatientChart
      }}
    >
      {children}
    </ClinicContext.Provider>
  );
}
