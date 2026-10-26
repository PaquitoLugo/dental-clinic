import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { recordActivity } from '../lib/activityLog';
import { localDateKey } from '../lib/dateUtils';
import ManagerActivityLogs from './ManagerActivityLogs';

const startOfWeek = (date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const dateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatTime = (time = '') => time.slice(0, 5);
const dentistReassignmentStatuses = ['Pending', 'Accepted', 'In Queue'];

const appointmentBadgeStyle = {
  Pending: 'bg-gray-100 text-gray-700',
  Accepted: 'bg-emerald-100 text-emerald-700',
  'In Queue': 'bg-blue-100 text-blue-700',
  'In Treatment': 'bg-amber-100 text-amber-700',
  Completed: 'bg-green-100 text-green-700',
  Rejected: 'bg-red-100 text-red-700',
  Cancelled: 'bg-gray-200 text-gray-700',
};

const appointmentStatusColor = (status) => {
  switch (status) {
    case 'Pending': return 'border-l-amber-500 bg-amber-50';
    case 'Accepted': return 'border-l-sky-500 bg-sky-50';
    case 'In Queue': return 'border-l-[#4c9a84] bg-[#f0f5f2]';
    case 'In Treatment': return 'border-l-amber-600 bg-amber-50';
    case 'Completed': return 'border-l-emerald-600 bg-emerald-50';
    case 'Rejected': return 'border-l-rose-500 bg-rose-50';
    case 'Cancelled': return 'border-l-gray-500 bg-gray-50';
    case 'Checked-in': return 'border-l-blue-500 bg-blue-50';
    default: return 'border-l-[#9aa9a2] bg-[#f5f7f6]';
  }
};

export default function ManagerModule({ services, addService, updateService, deleteService, appointments, refreshData, currentView, user }) {
  // User Management State
  const [staffUsers, setStaffUsers] = useState([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [newDentistName, setNewDentistName] = useState('');
  const [newDentistUsername, setNewDentistUsername] = useState('');
  const [newDentistPassword, setNewDentistPassword] = useState('');
  const [newDentistEmail, setNewDentistEmail] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('dentist');
  const [editingStaff, setEditingStaff] = useState(null);
  const [staffDirectoryTab, setStaffDirectoryTab] = useState('active');
  const [userMsg, setUserMsg] = useState('');
  const [patientFilter, setPatientFilter] = useState('active');
  const [editingPatient, setEditingPatient] = useState(null);
  const [patientForm, setPatientForm] = useState({});
  const [appointmentPatient, setAppointmentPatient] = useState(null);
  const [appointmentDentistDrafts, setAppointmentDentistDrafts] = useState({});
  const [savingAppointmentId, setSavingAppointmentId] = useState(null);
  const [appointmentAssignments, setAppointmentAssignments] = useState({});
  const [appointmentAssignmentError, setAppointmentAssignmentError] = useState('');

  // Form States
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [isCustomService, setIsCustomService] = useState(false);
  const [customServiceName, setCustomServiceName] = useState('');
  const [duration, setDuration] = useState(30);
  const [price, setPrice] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [formError, setFormError] = useState('');

  const [formEditingId, setFormEditingId] = useState(null);

  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [calendarMode, setCalendarMode] = useState('week');
  const [dashboardPeriod, setDashboardPeriod] = useState('week');
  const [staffAttendanceSummary, setStaffAttendanceSummary] = useState({ assistants: 0, dentists: 0, assistantsTimedIn: 0, dentistsTimedIn: 0 });
  const [staffAttendanceError, setStaffAttendanceError] = useState('');
  const [loadingStaffAttendance, setLoadingStaffAttendance] = useState(true);

  const [catalogSearchQuery, setCatalogSearchQuery] = useState('');
  const [catalogFilterCategory, setCatalogFilterCategory] = useState('ALL');
  const [catalogSortPrice, setCatalogSortPrice] = useState('');

  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null
  });

  const activeServices = services.filter(s => s.is_active !== false);
  const inactiveServices = services.filter(s => s.is_active === false);
  const categoriesFromDb = [...new Set(services.map(s => s.category))].filter(Boolean);

  const availableServicesInCategory = inactiveServices
    .filter(s => s.category === selectedCategory)
    .filter((s, i, arr) =>
      arr.findIndex(x => x.service_name.trim().toLowerCase() === s.service_name.trim().toLowerCase()) === i
    );

  const handleCategoryChange = (e) => {
    const cat = e.target.value;
    setSelectedCategory(cat);
    if (!formEditingId) {
      setSelectedService('');
      setIsCustomService(false);
      setCustomServiceName('');
      setServiceDescription('');
    }
    setFormError('');
  };

  const handleServiceChange = (e) => {
    const val = e.target.value;
    setFormError('');
    if (val === 'CUSTOM') {
      setIsCustomService(true);
      setSelectedService('');
      setServiceDescription('');
    } else {
      setIsCustomService(false);
      setSelectedService(val);
      const matched = inactiveServices.find(s => s.service_name === val);
      if (matched) {
        if (matched.price) setPrice(matched.price);
        if (matched.duration_mins) setDuration(matched.duration_mins);
        setServiceDescription(matched.service_description || '');
      }
    }
  };

  const handleSelectServiceToEdit = (s) => {
    setFormEditingId(s.id);
    setSelectedCategory(s.category || '');
    setIsCustomService(true);
    setCustomServiceName(s.service_name || '');
    setDuration(s.duration_mins || 30);
    setPrice(s.price || '');
    setServiceDescription(s.service_description || '');
    setFormError('');
  };

  const handleCancelFormEdit = () => {
    setFormEditingId(null);
    setSelectedCategory('');
    setSelectedService('');
    setIsCustomService(false);
    setCustomServiceName('');
    setDuration(30);
    setPrice('');
    setServiceDescription('');
    setFormError('');
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    const finalServiceName = isCustomService ? customServiceName.trim() : selectedService;
    if (!selectedCategory || !finalServiceName || !price) return;

    if (formEditingId) {
      setModalConfig({
        isOpen: true,
        title: "Update Service",
        message: "Are you sure to save changes to this service in Supabase?",
        onConfirm: async () => {
          if (updateService) {
            await updateService(formEditingId, {
              service_name: finalServiceName,
              category: selectedCategory,
              duration_mins: parseInt(duration),
              price: parseFloat(price),
              service_description: serviceDescription.trim() || null
            });
            await recordActivity(user, {
              action: `Updated service: ${finalServiceName}`,
              entityType: 'service',
              entityId: formEditingId,
              details: { category: selectedCategory, price: parseFloat(price), duration_mins: parseInt(duration) }
            });
          }
          handleCancelFormEdit();
          setModalConfig({ isOpen: false, title: '', message: '', onConfirm: null });
        }
      });
    } else {
      try {
        const created = await addService({
          service_name: finalServiceName,
          category: selectedCategory,
          duration_mins: parseInt(duration),
          price: parseFloat(price),
          service_description: serviceDescription.trim() || null,
          is_active: true
        });
        await recordActivity(user, {
          action: `Added service: ${finalServiceName}`,
          entityType: 'service',
          entityId: created?.id,
          details: { category: selectedCategory, price: parseFloat(price), duration_mins: parseInt(duration) }
        });
        handleCancelFormEdit();
      } catch (err) {
        setFormError(err.message || 'Failed to save service to Supabase.');
      }
    }
  };

  const confirmDelete = (id) => {
    const service = services.find(item => item.id === id);
    setModalConfig({
      isOpen: true,
      title: "Remove Service",
      message: "Are you sure to remove this service from Supabase?",
      onConfirm: async () => {
        if (deleteService) {
          await deleteService(id);
          await recordActivity(user, { action: `Deactivated service: ${service?.service_name || id}`, entityType: 'service', entityId: id });
          if (formEditingId === id) handleCancelFormEdit();
        }
        setModalConfig({ isOpen: false, title: '', message: '', onConfirm: null });
      }
    });
  };

  // Fetch all users when view is 'users'
  useEffect(() => {
    if (currentView === 'users') {
      fetchStaffUsers();
    }
  }, [currentView]);

  useEffect(() => {
    if (currentView !== 'dashboard') return undefined;
    let active = true;

    const fetchStaffAttendance = async () => {
      const today = localDateKey();
      const [staffResult, attendanceResult] = await Promise.all([
        supabase.from('staff_users').select('id, role, account_status').in('role', ['assistant', 'dentist']).is('archived_at', null),
        supabase.from('staff_attendance').select('staff_user_id, clock_in, clock_out').eq('attendance_date', today),
      ]);
      if (!active) return;
      if (staffResult.error || attendanceResult.error) {
        const error = staffResult.error || attendanceResult.error;
        setStaffAttendanceError(`Staff attendance is unavailable: ${error.message}`);
      } else {
        const staff = (staffResult.data || []).filter((member) => !['Pending', 'Rejected'].includes(member.account_status));
        const timedIn = new Set((attendanceResult.data || [])
          .filter((record) => record.clock_in && !record.clock_out)
          .map((record) => String(record.staff_user_id)));
        setStaffAttendanceSummary({
          assistants: staff.filter((member) => member.role === 'assistant').length,
          dentists: staff.filter((member) => member.role === 'dentist').length,
          assistantsTimedIn: staff.filter((member) => member.role === 'assistant' && timedIn.has(String(member.id))).length,
          dentistsTimedIn: staff.filter((member) => member.role === 'dentist' && timedIn.has(String(member.id))).length,
        });
        setStaffAttendanceError('');
      }
      setLoadingStaffAttendance(false);
    };

    fetchStaffAttendance();
    const refreshInterval = window.setInterval(fetchStaffAttendance, 60_000);
    return () => {
      active = false;
      window.clearInterval(refreshInterval);
    };
  }, [currentView]);

  async function fetchStaffUsers() {
    setLoadingStaff(true);
    const { data, error } = await supabase.from('staff_users').select('*');
    if (error) {
      setUserMsg(`Could not load user accounts: ${error.message}`);
    } else {
      setStaffUsers(data || []);
    }
    setLoadingStaff(false);
  }

  const patientAccounts = staffUsers.filter((account) => account.role === 'patient');
  const visiblePatients = patientAccounts.filter((account) =>
    patientFilter === 'archived' ? Boolean(account.archived_at) : !account.archived_at,
  );
  const statusOf = (account) => account.account_status || 'Approved';

  const startEditingPatient = (account) => {
    setEditingPatient(account);
    setPatientForm({
      full_name: account.full_name || '',
      username: account.username || '',
      email: account.email || '',
      mobile_number: account.mobile_number || '',
      birthdate: account.birthdate || '',
      sex: account.sex || '',
      complete_address: account.complete_address || '',
    });
  };

  const handleSavePatient = async (event) => {
    event.preventDefault();
    if (!editingPatient) return;

    const update = {
      full_name: patientForm.full_name.trim(),
      username: patientForm.username.trim().toLowerCase(),
      email: patientForm.email.trim() || null,
      mobile_number: patientForm.mobile_number.trim() || null,
      birthdate: patientForm.birthdate || null,
      sex: patientForm.sex.trim() || null,
      complete_address: patientForm.complete_address.trim() || null,
    };

    const { error } = await supabase.from('staff_users').update(update).eq('id', editingPatient.id);
    if (error) {
      setUserMsg(`Could not update patient account: ${error.message}`);
      return;
    }

    await recordActivity(user, {
      action: `Updated patient account: ${update.full_name}`,
      entityType: 'staff_user',
      entityId: editingPatient.id,
    });
    setEditingPatient(null);
    setUserMsg(`${update.full_name}'s account was updated.`);
    await fetchStaffUsers();
  };

  const setPatientArchived = async (account, archived) => {
    const { error } = await supabase.from('staff_users')
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq('id', account.id);
    if (error) {
      setUserMsg(`Could not ${archived ? 'archive' : 'restore'} patient account: ${error.message}`);
      return;
    }
    await recordActivity(user, {
      action: `${archived ? 'Archived' : 'Restored'} patient account: ${account.full_name}`,
      entityType: 'staff_user',
      entityId: account.id,
    });
    setUserMsg(`${account.full_name}'s account was ${archived ? 'archived' : 'restored'}.`);
    await fetchStaffUsers();
  };

  const handlePatientDecision = async (account, decision) => {
    const { error } = await supabase.from('staff_users')
      .update({
        account_status: decision,
        verified_at: decision === 'Approved' ? new Date().toISOString() : null,
      })
      .eq('id', account.id);
    if (error) {
      setUserMsg(`Could not update ${account.full_name}'s account: ${error.message}`);
      return;
    }
    await recordActivity(user, {
      action: `${decision === 'Approved' ? 'Approved' : 'Rejected'} patient account: ${account.full_name}`,
      entityType: 'staff_user',
      entityId: account.id,
    });
    setUserMsg(`${account.full_name}'s account was ${decision === 'Approved' ? 'accepted' : 'rejected'}.`);
    await fetchStaffUsers();
  };

  const appointmentsForPatient = (account) => appointments.filter((appointment) => (
    (appointment.patient_id != null && String(appointment.patient_id) === String(account.id))
    || (appointment.patient_name || '').trim().toLowerCase() === (account.full_name || '').trim().toLowerCase()
  ));

  const openAppointmentDentistModal = (account) => {
    const patientAppointments = appointmentsForPatient(account);
    setAppointmentPatient(account);
    setAppointmentAssignmentError('');
    setAppointmentDentistDrafts(Object.fromEntries(patientAppointments.map((appointment) => [
      String(appointment.id),
      appointmentAssignments[appointment.id] ?? appointment.assigned_dentist ?? '',
    ])));
  };

  const saveAppointmentDentist = async (appointment) => {
    if (!dentistReassignmentStatuses.includes(appointment.status)) {
      setAppointmentAssignmentError('The assigned dentist can only be changed before treatment begins.');
      return;
    }
    const dentistName = appointmentDentistDrafts[String(appointment.id)] || null;
    setAppointmentAssignmentError('');
    setSavingAppointmentId(appointment.id);
    try {
      const { error } = await supabase.from('appointments')
        .update({ assigned_dentist: dentistName })
        .eq('id', appointment.id)
        .in('status', dentistReassignmentStatuses)
        .select('id')
        .single();
      if (error) throw error;
      await recordActivity(user, {
        action: `Changed dentist for ${appointment.patient_name}'s appointment`,
        entityType: 'appointment',
        entityId: appointment.id,
        details: { assigned_dentist: dentistName },
      });
      setAppointmentAssignments((previous) => ({ ...previous, [appointment.id]: dentistName || '' }));
      await refreshData();
      setUserMsg(`Dentist updated for ${appointment.patient_name}'s appointment.`);
    } catch (error) {
      setAppointmentAssignmentError(`Could not change the appointment dentist: ${error.message}`);
    } finally {
      setSavingAppointmentId(null);
    }
  };

  const resetStaffForm = () => {
    setNewDentistName('');
    setNewDentistUsername('');
    setNewDentistPassword('');
    setNewDentistEmail('');
    setNewStaffRole('dentist');
  };

  const handleRegisterDentist = async (e) => {
    e.preventDefault();
    setUserMsg('');

    try {
      const account = {
        full_name: newDentistName.trim(),
        username: newDentistUsername.trim().toLowerCase(),
        email: newDentistEmail.trim(),
        role: newStaffRole
      };
      if (newDentistPassword.trim()) account.password = newDentistPassword.trim();

      const query = editingStaff
        ? supabase.from('staff_users').update(account).eq('id', editingStaff.id)
        : supabase.from('staff_users').insert([{ ...account, password: newDentistPassword.trim() }]);
      const { error } = await query;

      if (error) throw error;

      await recordActivity(user, {
        action: `${editingStaff ? 'Updated' : 'Created'} ${account.role} account: ${account.full_name}`,
        entityType: 'staff_user', entityId: editingStaff?.id,
        details: { role: account.role }
      });

      setUserMsg(editingStaff ? 'Staff account updated successfully.' : 'Staff account created successfully.');
      setEditingStaff(null);
      resetStaffForm();
      fetchStaffUsers();
    } catch (err) {
      setUserMsg(`Error ${editingStaff ? 'updating' : 'creating'} staff account: ${err.message}`);
    }
  };

  const startEditingStaff = (account) => {
    setEditingStaff(account);
    setNewDentistName(account.full_name || '');
    setNewDentistUsername(account.username || '');
    setNewDentistPassword('');
    setNewDentistEmail(account.email || '');
    setNewStaffRole(account.role === 'assistant' ? 'assistant' : 'dentist');
    setUserMsg('');
  };

  const setStaffArchived = async (account, archived) => {
    const { error } = await supabase.from('staff_users')
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq('id', account.id);
    if (!error) await recordActivity(user, {
      action: `${archived ? 'Archived' : 'Restored'} staff account: ${account.full_name}`,
      entityType: 'staff_user', entityId: account.id
    });
    setUserMsg(error ? `Could not ${archived ? 'archive' : 'restore'} account: ${error.message}` : `${account.full_name}'s account was ${archived ? 'archived' : 'restored'}.`);
    fetchStaffUsers();
  };


  const filteredAndSortedServices = activeServices
    .filter(s => {
      const sName = (s.service_name || '').toLowerCase();
      const matchesSearch = sName.includes(catalogSearchQuery.toLowerCase());
      const matchesCategory = catalogFilterCategory === 'ALL' || s.category === catalogFilterCategory;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      const priceA = parseFloat(a.price || 0);
      const priceB = parseFloat(b.price || 0);
      if (catalogSortPrice === 'asc') return priceA - priceB;
      if (catalogSortPrice === 'desc') return priceB - priceA;
      return 0;
    });

  const dashboardToday = new Date();
  const dashboardStart = dashboardPeriod === 'today'
    ? new Date(dashboardToday.getFullYear(), dashboardToday.getMonth(), dashboardToday.getDate())
    : dashboardPeriod === 'week' ? startOfWeek(dashboardToday) : new Date(dashboardToday.getFullYear(), dashboardToday.getMonth(), 1);
  const dashboardEnd = dashboardPeriod === 'today' ? addDays(dashboardStart, 1)
    : dashboardPeriod === 'week' ? addDays(dashboardStart, 7) : new Date(dashboardToday.getFullYear(), dashboardToday.getMonth() + 1, 1);
  const periodAppointments = appointments.filter(a => a.appointment_date >= dateKey(dashboardStart) && a.appointment_date < dateKey(dashboardEnd));
  const periodCompleted = periodAppointments.filter(a => a.status === 'Completed');
  const servicePrice = a => Number(a.service_price ?? 0);
  const dashboardRevenue = periodCompleted.reduce((sum, a) => sum + servicePrice(a), 0);
  const totalRevenue = dashboardRevenue;
  const chartDays = Array.from({ length: dashboardPeriod === 'today' ? 1 : dashboardPeriod === 'week' ? 7 : dashboardToday.getDate() }, (_, i) => addDays(dashboardStart, i));
  const chartValues = chartDays.map(day => periodCompleted.filter(a => a.appointment_date === dateKey(day)).reduce((sum, a) => sum + servicePrice(a), 0));
  const chartMax = Math.max(...chartValues, 1);
  const todayKey = dateKey(dashboardToday);
  const todaySchedule = appointments
    .filter(a => a.appointment_date === todayKey && !['Pending', 'Rejected', 'Cancelled'].includes(a.status))
    .sort((a, b) => formatTime(a.appointment_time).localeCompare(formatTime(b.appointment_time)));
  const topServices = Object.entries(periodAppointments.reduce((counts, a) => {
    const name = a.service_name || 'Other';
    counts[name] = (counts[name] || 0) + 1;
    return counts;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const weekStart = startOfWeek(calendarDate);
  const calendarDays = calendarMode === 'week'
    ? Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
    : (() => {
      const monthStart = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1);
      const gridStart = startOfWeek(monthStart);
      return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
    })();
  const calendarTitle = calendarMode === 'week'
    ? `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${addDays(weekStart, 6).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const appointmentsByDate = appointments.reduce((grouped, appointment) => {
    if (!grouped[appointment.appointment_date]) grouped[appointment.appointment_date] = [];
    grouped[appointment.appointment_date].push(appointment);
    return grouped;
  }, {});
  Object.values(appointmentsByDate).forEach(dayAppointments => {
    dayAppointments.sort((a, b) => formatTime(a.appointment_time).localeCompare(formatTime(b.appointment_time)));
  });

  const moveCalendar = (direction) => {
    const next = new Date(calendarDate);
    if (calendarMode === 'week') next.setDate(next.getDate() + (7 * direction));
    else next.setMonth(next.getMonth() + direction, 1);
    setCalendarDate(next);
  };

  return (
    <div className="h-full w-full flex flex-col overflow-hidden font-sans relative">
      
      {modalConfig.isOpen && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#d4e2dc] rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4">
            <div>
              <h3 className="font-black text-lg text-[#13241b]">{modalConfig.title}</h3>
              <p className="text-xs text-[#607368] mt-1">{modalConfig.message}</p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={modalConfig.onConfirm}
                className="flex-1 bg-[#164e43] text-white py-2.5 rounded-xl font-bold text-xs hover:bg-[#0f362e] transition cursor-pointer"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setModalConfig({ isOpen: false, title: '', message: '', onConfirm: null })}
                className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-xl font-bold text-xs hover:bg-gray-200 transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {currentView === 'dashboard' && (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-5 p-4 md:p-6">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-black text-3xl text-[#13241b]">Manager dashboard</h2>
              <p className="text-sm text-[#607368]">{dashboardToday.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · Financial analytics and clinic performance</p>
            </div>
            <div className="flex rounded-xl border border-[#d4e2dc] bg-white p-1">
              {['today', 'week', 'month'].map((period, i) => <button key={period} onClick={() => setDashboardPeriod(period)} className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize ${dashboardPeriod === period ? 'bg-[#164e43] text-white' : 'text-[#40564c] hover:bg-[#f5f7f6]'}`}>{['Today', 'This week', 'This month'][i]}</button>)}
            </div>
          </header>
          <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
            <div className="bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs">
              <p className="text-xs font-bold text-[#607368] uppercase tracking-wider">Completed Revenue</p>
              <h3 className="text-3xl font-black text-[#164e43] mt-2">₱{totalRevenue.toLocaleString()}</h3>
            </div>
            <div className="bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs">
              <p className="text-xs font-bold text-[#607368] uppercase tracking-wider">Active Services</p>
              <h3 className="text-3xl font-black text-[#13241b] mt-2">{activeServices.length}</h3>
            </div>
            <div className="bg-white border border-[#d4e2dc] rounded-2xl p-5"><p className="text-sm text-[#71827c]">Appointments</p><h3 className="text-3xl font-black text-[#164e43] mt-2">{periodAppointments.length}</h3></div>
            <div className="bg-white border border-[#d4e2dc] rounded-2xl p-5"><p className="text-sm text-[#71827c]">Pending requests</p><h3 className="text-3xl font-black text-[#164e43] mt-2">{periodAppointments.filter(a => a.status === 'Pending').length}</h3></div>
            <div className="bg-white border border-[#d4e2dc] rounded-2xl p-5"><p className="text-sm text-[#71827c]">In queue now</p><h3 className="text-3xl font-black text-[#164e43] mt-2">{appointments.filter(a => a.appointment_date === todayKey && a.status === 'In Queue').length}</h3></div>
          </div>
          <section className="space-y-3">
            <div>
              <h3 className="font-black text-lg text-[#13241b]">Staff attendance</h3>
              <p className="text-xs text-[#607368]">Active assistants and dentists currently timed in today.</p>
            </div>
            {staffAttendanceError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{staffAttendanceError}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                ['Dentists', staffAttendanceSummary.dentists, staffAttendanceSummary.dentistsTimedIn],
                ['Assistants', staffAttendanceSummary.assistants, staffAttendanceSummary.assistantsTimedIn],
              ].map(([role, total, timedIn]) => (
                <div key={role} className="rounded-2xl border border-[#d4e2dc] bg-white p-5 shadow-2xs">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#607368]">{role}</p>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-3xl font-black text-[#164e43]">{loadingStaffAttendance ? '—' : timedIn}</span>
                    <span className="text-sm text-[#607368]">timed in / {loadingStaffAttendance ? '—' : total} active</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-4">
            <section className="bg-white border border-[#d4e2dc] rounded-2xl p-5 min-h-[300px]"><h3 className="font-black text-xl mb-5">Revenue trend</h3><div className="h-56 flex items-end justify-around gap-2 border-b border-[#e5ece8]">{chartDays.map((day, i) => <div key={dateKey(day)} className="h-full flex-1 flex flex-col justify-end items-center gap-2 min-w-0"><span className="text-[9px] leading-none font-semibold text-[#607368] whitespace-nowrap" title={`₱${chartValues[i].toLocaleString('en-PH')}`}>₱{new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 }).format(chartValues[i])}</span><div title={`₱${chartValues[i].toLocaleString('en-PH')}`} className={`w-full max-w-14 rounded-t-lg border border-[#407368] ${dateKey(day) === todayKey ? 'bg-[#164e43]' : 'bg-[#e2eee9]'}`} style={{ height: `${chartValues[i] ? Math.max((chartValues[i] / chartMax) * 68, 8) : 0}%` }} /><span className="text-xs text-[#71827c]">{dashboardPeriod === 'today' ? 'Today' : dashboardPeriod === 'month' ? day.getDate() : day.toLocaleDateString('en-US', { weekday: 'short' })}</span></div>)}</div></section>
            <section className="bg-white border border-[#d4e2dc] rounded-2xl p-5"><h3 className="font-black text-xl mb-4">Today’s schedule</h3><div className="divide-y divide-[#dce6e2]">{todaySchedule.length ? todaySchedule.map(a => <div key={a.id} className="py-3 flex items-center gap-3"><span className="text-sm text-[#71827c] w-14 shrink-0">{formatTime(a.appointment_time)}</span><div className="min-w-0 flex-1"><p className="font-bold truncate">{a.patient_name || 'Patient'}</p><p className="text-sm text-[#71827c] truncate">{a.service_name || 'Appointment'}{a.assigned_dentist ? ` · Dr. ${a.assigned_dentist}` : ''}</p></div><span className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${appointmentBadgeStyle[a.status] || 'bg-gray-100 text-gray-700'}`}>{a.status}</span></div>) : <p className="py-8 text-sm text-[#71827c]">No appointments scheduled today.</p>}</div></section>
          </div>
          <section className="bg-white border border-[#d4e2dc] rounded-2xl p-5"><h3 className="font-black text-xl mb-4">Top services</h3>{topServices.length ? <div className="space-y-3">{topServices.map(([name, count]) => <div key={name} className="grid grid-cols-[minmax(120px,180px)_1fr_24px] items-center gap-3"><span className="truncate text-sm">{name}</span><div className="h-3 rounded-full bg-[#e2eee9] overflow-hidden"><div className="h-full rounded-full bg-[#164e43]" style={{ width: `${(count / topServices[0][1]) * 100}%` }} /></div><span className="text-sm font-bold">{count}</span></div>)}</div> : <p className="text-sm text-[#71827c]">No appointments in this period.</p>}</section>
        </div>
      )}

      {currentView === 'activity' && <ManagerActivityLogs />}

      {currentView === 'calendar' && (
        <section className="h-full min-h-0 flex flex-col gap-4 overflow-hidden p-2" aria-label="Master appointment calendar">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-black text-2xl text-[#13241b]">Master calendar</h2>
              <p className="text-sm text-[#607368] mt-1">{calendarTitle}</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => moveCalendar(-1)} aria-label="Previous period" className="w-10 h-10 rounded-xl border border-[#d4e2dc] bg-white text-[#164e43] font-bold hover:bg-[#f0f5f2]">‹</button>
              <button type="button" onClick={() => setCalendarDate(new Date())} className="h-10 px-4 rounded-xl border border-[#d4e2dc] bg-white text-[#164e43] text-sm font-bold hover:bg-[#f0f5f2]">Today</button>
              <button type="button" onClick={() => moveCalendar(1)} aria-label="Next period" className="w-10 h-10 rounded-xl border border-[#d4e2dc] bg-white text-[#164e43] font-bold hover:bg-[#f0f5f2]">›</button>
              <div className="ml-2 flex rounded-xl border border-[#d4e2dc] bg-white p-1">
                {['week', 'month'].map(mode => (
                  <button key={mode} type="button" onClick={() => setCalendarMode(mode)} aria-pressed={calendarMode === mode} className={`px-3 py-2 rounded-lg text-sm font-bold capitalize transition ${calendarMode === mode ? 'bg-[#e3ede6] text-[#164e43]' : 'text-[#607368] hover:bg-[#f5f7f6]'}`}>
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          </header>

          <div className="flex-1 min-h-0 bg-white border border-[#d4e2dc] rounded-2xl p-4 flex flex-col overflow-hidden">
            <div className={`grid grid-cols-7 gap-2 mb-2 font-bold text-[#607368] ${calendarMode === 'week' ? 'text-sm' : 'text-xs'}`}>
              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (
                <div key={day} className="px-2">{day.slice(0, 3)}</div>
              ))}
            </div>

            {calendarMode === 'week' ? (
              <div className="flex-1 min-h-0 grid grid-cols-7 gap-2">
                {calendarDays.map(day => {
                  const key = dateKey(day);
                  const dayAppointments = appointmentsByDate[key] || [];
                  return (
                    <div key={key} className={`min-w-0 rounded-xl border p-2 flex flex-col ${key === todayKey ? 'border-[#4c9a84] bg-[#f5f9f7]' : 'border-[#e5ece8] bg-[#f8faf9]'}`}>
                      <div className={`text-base font-black mb-2 ${key === todayKey ? 'text-[#164e43]' : 'text-[#13241b]'}`}>
                        {day.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
                      </div>
                      <div className="flex-1 overflow-y-auto space-y-1.5">
                        {dayAppointments.map(appointment => (
                          <article key={appointment.id} title={`${appointment.patient_name || 'Patient'} · ${appointment.status}`} className={`border-l-4 rounded-md px-2 py-1.5 text-xs leading-tight text-[#13241b] break-words ${appointmentStatusColor(appointment.status)}`}>
                            <span className="font-black">{formatTime(appointment.appointment_time)}</span>{' '}
                            <span>{appointment.patient_name || 'Patient'}</span>
                          </article>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex-1 min-h-0 grid grid-cols-7 grid-rows-6 gap-2 overflow-y-auto">
                {calendarDays.map(day => {
                  const key = dateKey(day);
                  const dayAppointments = appointmentsByDate[key] || [];
                  const isCurrentMonth = day.getMonth() === calendarDate.getMonth();
                  return (
                    <div key={key} className={`min-h-[90px] min-w-0 rounded-xl border p-2 flex flex-col ${key === todayKey ? 'border-[#4c9a84] bg-[#f5f9f7]' : 'border-[#e5ece8] bg-[#f8faf9]'} ${isCurrentMonth ? '' : 'opacity-50'}`}>
                      <div className="text-sm font-black text-[#13241b] mb-1">{day.getDate()}</div>
                      <div className="space-y-1 overflow-y-auto">
                        {dayAppointments.slice(0, 3).map(appointment => (
                          <article key={appointment.id} title={`${appointment.patient_name || 'Patient'} · ${appointment.status}`} className={`border-l-4 rounded px-1.5 py-1 text-xs leading-tight text-[#13241b] break-words ${appointmentStatusColor(appointment.status)}`}>
                            <span className="font-black">{formatTime(appointment.appointment_time)}</span>{' '}
                            <span>{appointment.patient_name || 'Patient'}</span>
                          </article>
                        ))}
                        {dayAppointments.length > 3 && <p className="text-xs font-bold text-[#607368] px-1">+{dayAppointments.length - 3} more</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3 pt-3 border-t border-[#e5ece8] text-xs text-[#607368]">
              {['Pending', 'Accepted', 'In Queue', 'In Treatment', 'Completed', 'Rejected'].map(status => (
                <span key={status} className="inline-flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-sm border-l-4 ${appointmentStatusColor(status)}`} />
                  {status}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      {currentView === 'services' && (
        <div className="h-full grid grid-cols-12 gap-8 overflow-hidden p-2">
          {/* Left Form: Add / Edit Service (fills the full height of the card) */}
          <div className="col-span-5 bg-white border border-[#d4e2dc] rounded-3xl p-8 shadow-2xs overflow-y-auto flex flex-col">
            <div className="mb-6">
              <h3 className="font-black text-2xl text-[#13241b]">
                {formEditingId ? 'Edit Service' : 'Add Clinic Service'}
              </h3>
              <p className="text-sm text-[#607368] mt-1">
                {formEditingId ? 'Update the details below, then save your changes.' : 'Create a new service patients can book.'}
              </p>
            </div>

            <form onSubmit={handleFormSubmit} className="flex-1 flex flex-col gap-5 min-h-0">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3.5 rounded-2xl font-bold">{formError}</div>
              )}

              <div>
                <label className="block text-sm font-bold text-[#164e43] mb-2">Select Category *</label>
                <select required value={selectedCategory} onChange={handleCategoryChange} className="w-full border border-[#d4e2dc] rounded-2xl p-4 text-sm bg-[#f5f7f6] font-bold focus:outline-none focus:border-[#164e43]">
                  <option value="">-- Choose Category --</option>
                  {categoriesFromDb.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-[#164e43] mb-2">Service Name *</label>
                <input type="text" required value={customServiceName} onChange={e => setCustomServiceName(e.target.value)} placeholder="Service Name" className="w-full border border-[#d4e2dc] rounded-2xl p-4 text-sm bg-[#f5f7f6] font-bold focus:outline-none focus:border-[#164e43]" />
              </div>

              {/* Description grows to take all the remaining space */}
              <div className="flex-1 flex flex-col min-h-[160px]">
                <label className="block text-sm font-bold text-[#164e43] mb-2">Service Description</label>
                <textarea
                  value={serviceDescription}
                  onChange={e => setServiceDescription(e.target.value)}
                  placeholder="Describe the service for patients"
                  className="flex-1 w-full min-h-[120px] border border-[#d4e2dc] rounded-2xl p-4 text-sm bg-[#f5f7f6] font-medium resize-none focus:outline-none focus:border-[#164e43]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-[#607368] mb-2">Duration (mins)</label>
                  <input type="number" required value={duration} onChange={e => setDuration(e.target.value)} className="w-full border border-[#d4e2dc] rounded-2xl p-4 text-sm bg-[#f5f7f6] font-bold focus:outline-none focus:border-[#164e43]" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-[#607368] mb-2">Price (₱) *</label>
                  <input type="number" required value={price} onChange={e => setPrice(e.target.value)} placeholder="1500" className="w-full border border-[#d4e2dc] rounded-2xl p-4 text-sm bg-[#f5f7f6] font-bold focus:outline-none focus:border-[#164e43]" />
                </div>
              </div>

              <div className="flex gap-3">
                {formEditingId && (
                  <button type="button" onClick={handleCancelFormEdit} className="px-6 bg-white border border-[#d4e2dc] text-[#13241b] py-4 rounded-2xl font-bold text-sm hover:bg-[#f5f7f6] transition cursor-pointer">
                    Cancel
                  </button>
                )}
                <button type="submit" className="flex-1 bg-[#164e43] text-white py-4 rounded-2xl font-bold text-base hover:bg-[#0f362e] transition cursor-pointer">
                  {formEditingId ? 'Update Service' : '+ Save Service'}
                </button>
              </div>
            </form>
          </div>

          {/* Right Catalog Table */}
          <div className="col-span-7 bg-white border border-[#d4e2dc] rounded-3xl p-8 shadow-2xs flex flex-col overflow-hidden">
            <div className="flex justify-between items-end mb-5">
              <div>
                <h3 className="font-black text-2xl text-[#13241b]">Manage Services &amp; Pricing</h3>
                <p className="text-sm text-[#607368] mt-1">Click a row to edit it in the form.</p>
              </div>
              <span className="bg-[#e3ede6] text-[#164e43] text-sm font-bold px-4 py-1.5 rounded-full border border-[#d4e2dc]">
                {filteredAndSortedServices.length} services
              </span>
            </div>
            <div className="flex-1 overflow-y-auto pr-1">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="border-b border-[#d4e2dc] text-xs font-bold text-[#607368] uppercase tracking-wide">
                    <th className="py-4 px-3">Service Title</th>
                    <th className="py-4 px-3">Category</th>
                    <th className="py-4 px-3 text-right">Price (₱)</th>
                    <th className="py-4 px-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f5f2] text-sm">
                  {filteredAndSortedServices.map(s => (
                    <tr key={s.id} onClick={() => handleSelectServiceToEdit(s)} className={`hover:bg-[#f8faf9] cursor-pointer ${formEditingId === s.id ? 'bg-[#e3ede6]' : ''}`}>
                      <td className="py-5 px-3 font-bold text-[#13241b]">{s.service_name}</td>
                      <td className="py-5 px-3"><span className="bg-[#f0f5f2] text-[#164e43] text-xs font-bold px-3 py-1 rounded-full">{s.category}</span></td>
                      <td className="py-5 px-3 text-right font-black text-[#164e43] text-base">₱{parseFloat(s.price || 0).toLocaleString()}</td>
                      <td className="py-5 px-3 text-center" onClick={e => e.stopPropagation()}>
                        <button type="button" onClick={() => confirmDelete(s.id)} className="bg-red-50 hover:bg-red-100 text-red-600 px-4 py-2 rounded-xl font-bold text-sm cursor-pointer transition">Remove</button>
                      </td>
                    </tr>
                  ))}
                  {filteredAndSortedServices.length === 0 && (
                    <tr><td colSpan="4" className="py-10 text-center text-gray-400 font-medium">No services yet. Add one using the form.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* USER MANAGEMENT & DENTIST REGISTRATION VIEW */}
      {currentView === 'users' && (
        <div className="flex-1 overflow-y-auto space-y-6 p-2">
          <div>
            <h2 className="font-black text-2xl text-[#13241b]">User & Role Management</h2>
            <p className="text-xs text-[#607368]">Provision and manage authorized staff accounts.</p>
          </div>

          {userMsg && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3.5 rounded-xl font-bold">
              {userMsg}
            </div>
          )}

          <section className="bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-black text-base text-[#13241b]">Patient User Management</h3>
                <p className="text-[11px] text-[#607368]">Manage patient accounts and change the dentist assigned to an appointment.</p>
              </div>
              <div className="flex gap-2">
                {[['active', 'Active accounts'], ['archived', 'Archived accounts']].map(([tab, label]) => (
                  <button key={tab} type="button" onClick={() => setPatientFilter(tab)}
                    className={`rounded-full border px-3 py-1.5 text-[11px] font-bold ${patientFilter === tab ? 'border-[#164e43] bg-[#164e43] text-white' : 'border-[#d4e2dc] bg-white text-[#40584f]'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {loadingStaff ? (
              <p className="py-6 text-center text-xs font-bold text-[#607368]">Loading patient accounts…</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#d4e2dc] text-[11px] font-bold uppercase text-[#607368]">
                      <th className="px-2 py-3">Patient</th>
                      <th className="px-2 py-3">Contact</th>
                      <th className="px-2 py-3">Birth date / Sex</th>
                      <th className="px-2 py-3">Appointments</th>
                      <th className="px-2 py-3">Status</th>
                      <th className="px-2 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0f5f2]">
                    {visiblePatients.map((account) => (
                      <tr key={account.id} className="align-top hover:bg-[#f8faf9]">
                        <td className="px-2 py-3"><div className="font-bold text-[#13241b]">{account.full_name}</div><div className="text-[#607368]">@{account.username}</div></td>
                        <td className="px-2 py-3 text-[#607368]"><div>{account.mobile_number || 'N/A'}</div><div>{account.email || ''}</div></td>
                        <td className="px-2 py-3 text-[#607368]">{account.birthdate || 'N/A'}{account.sex ? ` · ${account.sex}` : ''}</td>
                        <td className="px-2 py-3">
                          {appointmentsForPatient(account).length > 0 ? (
                            <button type="button" onClick={() => openAppointmentDentistModal(account)} className="rounded-lg border border-[#d4e2dc] px-3 py-1.5 font-bold text-[#164e43] hover:bg-[#f5f7f6]">
                              Manage ({appointmentsForPatient(account).length})
                            </button>
                          ) : <span className="text-[#607368]">None</span>}
                        </td>
                        <td className="px-2 py-3">
                          <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${statusOf(account) === 'Pending' ? 'bg-amber-100 text-amber-700' : statusOf(account) === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {statusOf(account) === 'Approved' ? 'Accepted' : statusOf(account)}
                          </span>
                        </td>
                        <td className="space-x-1.5 whitespace-nowrap px-2 py-3 text-right">
                          {patientFilter === 'active' && <button type="button" onClick={() => startEditingPatient(account)} className="rounded-lg border border-[#d4e2dc] px-3 py-1.5 font-bold text-[#164e43]">Edit</button>}
                          {patientFilter === 'active' && statusOf(account) !== 'Approved' && <button type="button" onClick={() => handlePatientDecision(account, 'Approved')} className="rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white">Accept</button>}
                          {patientFilter === 'active' && statusOf(account) === 'Pending' && <button type="button" onClick={() => handlePatientDecision(account, 'Rejected')} className="rounded-lg border border-red-200 px-3 py-1.5 font-bold text-red-700">Reject</button>}
                          {patientFilter === 'active' && <button type="button" onClick={() => setPatientArchived(account, true)} className="rounded-lg border border-amber-200 px-3 py-1.5 font-bold text-amber-700">Archive</button>}
                          {patientFilter === 'archived' && <button type="button" onClick={() => setPatientArchived(account, false)} className="rounded-lg border border-emerald-200 px-3 py-1.5 font-bold text-emerald-700">Restore</button>}
                        </td>
                      </tr>
                    ))}
                    {visiblePatients.length === 0 && <tr><td colSpan="6" className="py-6 text-center font-medium text-gray-400">No {patientFilter} patient accounts.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs space-y-4 md:col-span-1">
              <h3 className="font-black text-base text-[#13241b]">Register Staff Account</h3>
              <form onSubmit={handleRegisterDentist} className="space-y-3 text-xs">
                <div>
                  <label className="block font-bold text-[#13241b] mb-1">Full Name *</label>
                  <input type="text" required value={newDentistName} onChange={e => setNewDentistName(e.target.value)} placeholder="Dr. Juan Dela Cruz" className="w-full border border-[#d4e2dc] rounded-xl p-2.5 bg-[#f5f7f6]" />
                </div>
                <div>
                  <label className="block font-bold text-[#13241b] mb-1">Username *</label>
                  <input type="text" required value={newDentistUsername} onChange={e => setNewDentistUsername(e.target.value)} placeholder="drjuan" className="w-full border border-[#d4e2dc] rounded-xl p-2.5 bg-[#f5f7f6]" />
                </div>
                <div>
                  <label className="block font-bold text-[#13241b] mb-1">Password {editingStaff ? '(leave blank to keep current)' : '*'}</label>
                  <input type="password" required={!editingStaff} value={newDentistPassword} onChange={e => setNewDentistPassword(e.target.value)} placeholder="••••••••" className="w-full border border-[#d4e2dc] rounded-xl p-2.5 bg-[#f5f7f6]" />
                </div>
                <div>
                  <label className="block font-bold text-[#13241b] mb-1">Email Address *</label>
                  <input type="email" required value={newDentistEmail} onChange={e => setNewDentistEmail(e.target.value)} placeholder="dentist@clinic.com" className="w-full border border-[#d4e2dc] rounded-xl p-2.5 bg-[#f5f7f6]" />
                </div>
                <div>
                  <label className="block font-bold text-[#13241b] mb-1">Role *</label>
                  <select required value={newStaffRole} onChange={e => setNewStaffRole(e.target.value)} className="w-full border border-[#d4e2dc] rounded-xl p-2.5 bg-[#f5f7f6]">
                    <option value="dentist">Dentist</option>
                    <option value="assistant">Assistant</option>
                  </select>
                </div>
                <button type="submit" className="w-full bg-[#164e43] text-white py-3 rounded-xl font-bold hover:bg-[#0f362e] transition cursor-pointer mt-2">
                  {editingStaff ? 'Save Changes' : 'Add Account'}
                </button>
                {editingStaff && <button type="button" onClick={() => { setEditingStaff(null); resetStaffForm(); }} className="w-full border border-[#d4e2dc] text-[#40584f] py-2.5 rounded-xl font-bold cursor-pointer">Cancel Edit</button>}
              </form>
            </div>

            <div className="bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs md:col-span-2 overflow-hidden flex flex-col">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-black text-base text-[#13241b]">Staff Accounts Directory</h3>
                <div className="flex gap-2">
                  {[['active', 'Active Accounts'], ['archived', 'Archived Accounts']].map(([tab, label]) => (
                    <button key={tab} type="button" onClick={() => setStaffDirectoryTab(tab)} className={`rounded-full border px-3 py-1.5 text-[11px] font-bold cursor-pointer ${staffDirectoryTab === tab ? 'border-[#164e43] bg-[#164e43] text-white' : 'border-[#d4e2dc] bg-white text-[#40584f]'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {loadingStaff ? (
                <div className="py-8 text-center text-xs font-bold text-[#607368]">Loading user accounts...</div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[#d4e2dc] text-[11px] font-bold text-[#607368] uppercase">
                        <th className="py-3 px-2">Name</th>
                        <th className="py-3 px-2">Username</th>
                        <th className="py-3 px-2">Role</th>
                        <th className="py-3 px-2">Email</th>
                        <th className="py-3 px-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f0f5f2]">
                      {staffUsers.filter(u => u.role !== 'patient' && (staffDirectoryTab === 'archived' ? Boolean(u.archived_at) : !u.archived_at)).map(u => (
                        <tr key={u.id} className="hover:bg-[#f8faf9]">
                          <td className="py-3 px-2 font-bold text-[#13241b]">{u.full_name}</td>
                          <td className="py-3 px-2 text-[#607368]">{u.username}</td>
                          <td className="py-3 px-2">
                            <span className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase ${
                              u.role === 'manager' ? 'bg-purple-100 text-purple-700' :
                              u.role === 'dentist' ? 'bg-emerald-100 text-emerald-700' :
                              u.role === 'assistant' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                            }`}>
                              {u.role}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-[#607368]">{u.email || 'N/A'}</td>
                          <td className="py-3 px-2 text-right">
                            <div className="flex justify-end gap-2">
                              {staffDirectoryTab === 'active' && (u.role === 'dentist' || u.role === 'assistant') && <button type="button" onClick={() => startEditingStaff(u)} className="border border-[#d4e2dc] hover:bg-[#f5f7f6] text-[#164e43] px-3 py-1.5 rounded-lg font-bold cursor-pointer">Edit</button>}
                              {staffDirectoryTab === 'active' && u.role !== 'manager' && <button type="button" onClick={() => setStaffArchived(u, true)} className="border border-amber-200 hover:bg-amber-50 text-amber-700 px-3 py-1.5 rounded-lg font-bold cursor-pointer">Archive</button>}
                              {staffDirectoryTab === 'archived' && <button type="button" onClick={() => setStaffArchived(u, false)} className="border border-emerald-200 hover:bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg font-bold cursor-pointer">Restore</button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {staffUsers.filter(u => u.role !== 'patient' && (staffDirectoryTab === 'archived' ? Boolean(u.archived_at) : !u.archived_at)).length === 0 && (
                    <p className="py-6 text-center text-xs font-medium text-gray-400">No {staffDirectoryTab === 'archived' ? 'archived' : 'active'} staff accounts.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {currentView === 'users' && editingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { setEditingStaff(null); resetStaffForm(); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="edit-staff-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 id="edit-staff-title" className="font-black text-lg text-[#13241b]">Edit Staff Account</h3>
              <button type="button" aria-label="Close" onClick={() => { setEditingStaff(null); resetStaffForm(); }} className="text-xl text-[#607368] cursor-pointer">×</button>
            </div>
            <form onSubmit={handleRegisterDentist} className="space-y-3 text-xs">
              <div><label className="mb-1 block font-bold text-[#13241b]">Full Name *</label><input type="text" required value={newDentistName} onChange={e => setNewDentistName(e.target.value)} className="w-full rounded-xl border border-[#d4e2dc] bg-[#f5f7f6] p-2.5" /></div>
              <div><label className="mb-1 block font-bold text-[#13241b]">Username *</label><input type="text" required value={newDentistUsername} onChange={e => setNewDentistUsername(e.target.value)} className="w-full rounded-xl border border-[#d4e2dc] bg-[#f5f7f6] p-2.5" /></div>
              <div><label className="mb-1 block font-bold text-[#13241b]">Password (leave blank to keep current)</label><input type="password" value={newDentistPassword} onChange={e => setNewDentistPassword(e.target.value)} placeholder="••••••••" className="w-full rounded-xl border border-[#d4e2dc] bg-[#f5f7f6] p-2.5" /></div>
              <div><label className="mb-1 block font-bold text-[#13241b]">Email Address *</label><input type="email" required value={newDentistEmail} onChange={e => setNewDentistEmail(e.target.value)} className="w-full rounded-xl border border-[#d4e2dc] bg-[#f5f7f6] p-2.5" /></div>
              <div><label className="mb-1 block font-bold text-[#13241b]">Role *</label><select required value={newStaffRole} onChange={e => setNewStaffRole(e.target.value)} className="w-full rounded-xl border border-[#d4e2dc] bg-[#f5f7f6] p-2.5"><option value="dentist">Dentist</option><option value="assistant">Assistant</option></select></div>
              <button type="submit" className="w-full rounded-xl bg-[#164e43] py-3 font-bold text-white hover:bg-[#0f362e] cursor-pointer">Save Changes</button>
            </form>
          </div>
        </div>
      )}

      {currentView === 'users' && editingPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditingPatient(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="edit-patient-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 id="edit-patient-title" className="font-black text-lg text-[#13241b]">Edit Patient Account</h3>
                <p className="text-xs text-[#607368]">Update patient account details. Appointment dentists are managed separately.</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setEditingPatient(null)} className="text-xl text-[#607368] cursor-pointer">×</button>
            </div>
            <form onSubmit={handleSavePatient} className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-2">
              <label className="font-bold text-[#13241b]">Full name *
                <input required value={patientForm.full_name || ''} onChange={(event) => setPatientForm({ ...patientForm, full_name: event.target.value })} className="mt-1 w-full rounded-xl border border-[#d4e2dc] bg-[#f5f7f6] p-2.5 font-normal" />
              </label>
              <label className="font-bold text-[#13241b]">Username *
                <input required value={patientForm.username || ''} onChange={(event) => setPatientForm({ ...patientForm, username: event.target.value })} className="mt-1 w-full rounded-xl border border-[#d4e2dc] bg-[#f5f7f6] p-2.5 font-normal" />
              </label>
              <label className="font-bold text-[#13241b]">Email
                <input type="email" value={patientForm.email || ''} onChange={(event) => setPatientForm({ ...patientForm, email: event.target.value })} className="mt-1 w-full rounded-xl border border-[#d4e2dc] bg-[#f5f7f6] p-2.5 font-normal" />
              </label>
              <label className="font-bold text-[#13241b]">Mobile number
                <input value={patientForm.mobile_number || ''} onChange={(event) => setPatientForm({ ...patientForm, mobile_number: event.target.value })} className="mt-1 w-full rounded-xl border border-[#d4e2dc] bg-[#f5f7f6] p-2.5 font-normal" />
              </label>
              <label className="font-bold text-[#13241b]">Birth date
                <input type="date" value={patientForm.birthdate || ''} onChange={(event) => setPatientForm({ ...patientForm, birthdate: event.target.value })} className="mt-1 w-full rounded-xl border border-[#d4e2dc] bg-[#f5f7f6] p-2.5 font-normal" />
              </label>
              <label className="font-bold text-[#13241b]">Sex
                <input value={patientForm.sex || ''} onChange={(event) => setPatientForm({ ...patientForm, sex: event.target.value })} className="mt-1 w-full rounded-xl border border-[#d4e2dc] bg-[#f5f7f6] p-2.5 font-normal" />
              </label>
              <label className="font-bold text-[#13241b] sm:col-span-2">Address
                <textarea value={patientForm.complete_address || ''} onChange={(event) => setPatientForm({ ...patientForm, complete_address: event.target.value })} rows="2" className="mt-1 w-full rounded-xl border border-[#d4e2dc] bg-[#f5f7f6] p-2.5 font-normal" />
              </label>
              <div className="flex gap-3 pt-2 sm:col-span-2">
                <button type="submit" className="flex-1 rounded-xl bg-[#164e43] py-3 font-bold text-white hover:bg-[#0f362e] cursor-pointer">Save Patient</button>
                <button type="button" onClick={() => setEditingPatient(null)} className="rounded-xl border border-[#d4e2dc] px-5 py-3 font-bold text-[#40584f] cursor-pointer">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {currentView === 'users' && appointmentPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAppointmentPatient(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="appointment-dentist-title" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 id="appointment-dentist-title" className="font-black text-lg text-[#13241b]">Appointment Dentist</h3>
                <p className="text-xs text-[#607368]">Choose a dentist for {appointmentPatient.full_name}’s appointments. Each change is saved to Supabase.</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setAppointmentPatient(null)} className="text-xl text-[#607368] cursor-pointer">×</button>
            </div>
            {appointmentAssignmentError && (
              <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800">{appointmentAssignmentError}</p>
            )}
            <div className="space-y-3">
              {appointmentsForPatient(appointmentPatient)
                .slice()
                .sort((a, b) => `${a.appointment_date} ${a.appointment_time}`.localeCompare(`${b.appointment_date} ${b.appointment_time}`))
                .map((appointment) => {
                  const dentistValue = appointmentDentistDrafts[String(appointment.id)] ?? appointmentAssignments[appointment.id] ?? appointment.assigned_dentist ?? '';
                  const canReassignDentist = dentistReassignmentStatuses.includes(appointment.status);
                  return (
                    <div key={appointment.id} className="grid grid-cols-1 items-end gap-3 rounded-xl border border-[#d4e2dc] bg-[#f8faf9] p-4 sm:grid-cols-[1fr_1.2fr_auto]">
                      <div>
                        <p className="font-bold text-[#13241b]">{appointment.appointment_date} · {formatTime(appointment.appointment_time)}</p>
                        <p className="text-xs text-[#607368]">{appointment.service_name || 'Appointment'} · {appointment.status}</p>
                        {!canReassignDentist && <p className="mt-1 text-[11px] font-semibold text-amber-800">Dentist changes are locked after treatment starts or the appointment is closed.</p>}
                      </div>
                      {canReassignDentist ? (
                        <>
                          <label className="text-xs font-bold text-[#13241b]">Assigned dentist
                            <select value={dentistValue}
                              onChange={(event) => setAppointmentDentistDrafts((previous) => ({ ...previous, [String(appointment.id)]: event.target.value }))}
                              className="mt-1 w-full rounded-xl border border-[#d4e2dc] bg-white p-2.5">
                              <option value="">Unassigned</option>
                              {staffUsers.filter((staff) => staff.role === 'dentist' && !staff.archived_at).map((dentist) => (
                                <option key={dentist.id} value={dentist.full_name}>{dentist.full_name}</option>
                              ))}
                            </select>
                          </label>
                          <button type="button" onClick={() => saveAppointmentDentist(appointment)}
                            disabled={savingAppointmentId === appointment.id || dentistValue === (appointmentAssignments[appointment.id] ?? appointment.assigned_dentist ?? '')}
                            className="rounded-xl bg-[#164e43] px-4 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
                            {savingAppointmentId === appointment.id ? 'Saving…' : 'Save'}
                          </button>
                        </>
                      ) : (
                        <div className="text-xs">
                          <p className="font-bold text-[#13241b]">Assigned dentist</p>
                          <p className="mt-1 rounded-xl border border-[#e4ebe7] bg-gray-100 p-2.5 text-[#607368]">
                            {appointmentAssignments[appointment.id] ?? appointment.assigned_dentist ?? 'Unassigned'}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
