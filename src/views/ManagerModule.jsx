import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

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

const appointmentStatusColor = (status) => {
  switch (status) {
    case 'Pending': return 'border-l-amber-500 bg-amber-50';
    case 'Accepted': return 'border-l-sky-500 bg-sky-50';
    case 'In Queue': return 'border-l-[#4c9a84] bg-[#f0f5f2]';
    case 'In Treatment': return 'border-l-amber-600 bg-amber-50';
    case 'Completed': return 'border-l-emerald-600 bg-emerald-50';
    case 'Rejected': return 'border-l-rose-500 bg-rose-50';
    case 'Checked-in': return 'border-l-blue-500 bg-blue-50';
    default: return 'border-l-[#9aa9a2] bg-[#f5f7f6]';
  }
};

export default function ManagerModule({ services, addService, updateService, deleteService, appointments, currentView }) {
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
          }
          handleCancelFormEdit();
          setModalConfig({ isOpen: false, title: '', message: '', onConfirm: null });
        }
      });
    } else {
      try {
        await addService({
          service_name: finalServiceName,
          category: selectedCategory,
          duration_mins: parseInt(duration),
          price: parseFloat(price),
          service_description: serviceDescription.trim() || null,
          is_active: true
        });
        handleCancelFormEdit();
      } catch (err) {
        setFormError(err.message || 'Failed to save service to Supabase.');
      }
    }
  };

  const confirmDelete = (id) => {
    setModalConfig({
      isOpen: true,
      title: "Remove Service",
      message: "Are you sure to remove this service from Supabase?",
      onConfirm: async () => {
        if (deleteService) {
          await deleteService(id);
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

  async function fetchStaffUsers() {
    setLoadingStaff(true);
    const { data, error } = await supabase.from('staff_users').select('*');
    if (!error && data) setStaffUsers(data);
    setLoadingStaff(false);
  }

  // ---- Patient account verification (accept / reject self-registered patients) ----
  const [patientFilter, setPatientFilter] = useState('Pending');
  const statusOf = (u) => u.account_status || 'Approved';
  const patientAccounts = staffUsers.filter((u) => u.role === 'patient');
  const pendingCount = patientAccounts.filter((u) => statusOf(u) === 'Pending').length;
  const visiblePatients = patientAccounts.filter((u) => patientFilter === 'All' || statusOf(u) === patientFilter);

  const handlePatientDecision = async (account, decision) => {
    let reason = null;
    if (decision === 'Rejected') {
      reason = window.prompt(`Reject ${account.full_name}'s registration?\nOptional reason (shown nowhere else, kept for your records):`, '');
      if (reason === null) return; // cancelled
    } else if (!window.confirm(`Accept ${account.full_name}'s account? They will be able to sign in and book appointments.`)) {
      return;
    }
    const { error } = await supabase
      .from('staff_users')
      .update({ account_status: decision, verified_at: new Date().toISOString(), rejection_reason: reason || null })
      .eq('id', account.id);
    setUserMsg(error ? `Could not update account: ${error.message}` : `${account.full_name}'s account was ${decision === 'Approved' ? 'accepted' : 'rejected'}.`);
    fetchStaffUsers();
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

  const totalRevenue = appointments
    ?.filter(a => a.status === 'Completed')
    ?.reduce((sum, a) => {
      const sName = a.service_name || a.name || a.title;
      const matchedService = activeServices.find(s => s.service_name === sName);
      return sum + (matchedService ? parseFloat(matchedService.price || 0) : 0);
    }, 0) || 0;

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
  const todayKey = dateKey(new Date());

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
        <div className="flex-1 overflow-y-auto space-y-6 p-2">
          <div>
            <h2 className="font-black text-2xl text-[#13241b]">Manager Dashboard</h2>
            <p className="text-xs text-[#607368]">Financial analytics and clinic performance overview.</p>
          </div>
          <div className="grid grid-cols-2 gap-6 max-w-xl">
            <div className="bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs">
              <p className="text-xs font-bold text-[#607368] uppercase tracking-wider">Completed Revenue</p>
              <h3 className="text-3xl font-black text-[#164e43] mt-2">₱{totalRevenue.toLocaleString()}</h3>
            </div>
            <div className="bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs">
              <p className="text-xs font-bold text-[#607368] uppercase tracking-wider">Active Services</p>
              <h3 className="text-3xl font-black text-[#13241b] mt-2">{activeServices.length}</h3>
            </div>
          </div>
        </div>
      )}

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
        <div className="h-full grid grid-cols-12 gap-6 overflow-hidden p-2">
          {/* Left Form: Add / Edit Service */}
          <div className="col-span-4 bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs overflow-y-auto flex flex-col">
            <h3 className="font-black text-lg text-[#13241b] mb-4">
              {formEditingId ? 'Edit Service' : 'Add Clinic Service'}
            </h3>
            <form onSubmit={handleFormSubmit} className="space-y-4 flex-1 flex flex-col justify-between">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#164e43] mb-1">Select Category *</label>
                  <select required value={selectedCategory} onChange={handleCategoryChange} className="w-full border border-[#d4e2dc] rounded-xl p-3 text-xs bg-[#f5f7f6] font-bold">
                    <option value="">-- Choose Category --</option>
                    {categoriesFromDb.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#164e43] mb-1">Service Name *</label>
                  <input type="text" required value={customServiceName} onChange={e => setCustomServiceName(e.target.value)} placeholder="Service Name" className="w-full border border-[#d4e2dc] rounded-xl p-3 text-xs bg-[#f5f7f6] font-bold" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#607368] mb-1">Service Description</label>
                  <textarea
                    rows="3"
                    value={serviceDescription}
                    onChange={e => setServiceDescription(e.target.value)}
                    placeholder="Describe the service for patients"
                    className="w-full resize-y border border-[#d4e2dc] rounded-xl p-3 text-xs bg-[#f5f7f6] text-[#13241b] focus:outline-none focus:border-[#164e43]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#607368] mb-1">Duration (mins)</label>
                    <input type="number" required value={duration} onChange={e => setDuration(e.target.value)} className="w-full border border-[#d4e2dc] rounded-xl p-3 text-xs bg-[#f5f7f6] font-bold" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#607368] mb-1">Price (₱) *</label>
                    <input type="number" required value={price} onChange={e => setPrice(e.target.value)} placeholder="1500" className="w-full border border-[#d4e2dc] rounded-xl p-3 text-xs bg-[#f5f7f6] font-bold" />
                  </div>
                </div>
              </div>
              <button type="submit" className="w-full bg-[#164e43] text-white py-3.5 rounded-xl font-bold text-xs hover:bg-[#0f362e] transition cursor-pointer">
                {formEditingId ? 'Update Service' : '+ Save Service'}
              </button>
            </form>
          </div>

          {/* Right Catalog Table */}
          <div className="col-span-8 bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs flex flex-col overflow-hidden">
            <h3 className="font-black text-lg text-[#13241b] mb-4">Manage Services & Pricing</h3>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#d4e2dc] text-[11px] font-bold text-[#607368] uppercase">
                    <th className="py-3 px-2">Service Title</th>
                    <th className="py-3 px-2">Category</th>
                    <th className="py-3 px-2 text-right">Price (₱)</th>
                    <th className="py-3 px-2 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f5f2] text-xs">
                  {filteredAndSortedServices.map(s => (
                    <tr key={s.id} onClick={() => handleSelectServiceToEdit(s)} className="hover:bg-[#f8faf9] cursor-pointer">
                      <td className="py-3 px-2 font-bold text-[#13241b]">{s.service_name}</td>
                      <td className="py-3 px-2">{s.category}</td>
                      <td className="py-3 px-2 text-right font-black text-[#164e43]">₱{parseFloat(s.price || 0).toLocaleString()}</td>
                      <td className="py-3 px-2 text-center" onClick={e => e.stopPropagation()}>
                        <button type="button" onClick={() => confirmDelete(s.id)} className="bg-red-50 text-red-600 px-3 py-1.5 rounded-lg font-bold text-xs">Remove</button>
                      </td>
                    </tr>
                  ))}
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
            <p className="text-xs text-[#607368]">Verify patient accounts and provision authorized staff.</p>
          </div>

          {userMsg && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3.5 rounded-xl font-bold">
              {userMsg}
            </div>
          )}

          <div className="bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-3">
              <div>
                <h3 className="font-black text-base text-[#13241b]">Patient Account Verification</h3>
                <p className="text-[11px] text-[#607368]">Check each registration's details, then accept or reject the account. Patients can only sign in once accepted.</p>
              </div>
              <div className="flex gap-2">
                {['Pending', 'Approved', 'Rejected', 'All'].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setPatientFilter(f)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold border cursor-pointer ${patientFilter === f ? 'bg-[#164e43] text-white border-[#164e43]' : 'bg-white text-[#40584f] border-[#d4e2dc]'}`}
                  >
                    {f === 'Approved' ? 'Accepted' : f}{f === 'Pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#d4e2dc] text-[11px] font-bold text-[#607368] uppercase">
                    <th className="py-3 px-2">Patient</th>
                    <th className="py-3 px-2">Contact</th>
                    <th className="py-3 px-2">Birth date / Sex</th>
                    <th className="py-3 px-2">Address</th>
                    <th className="py-3 px-2">Status</th>
                    <th className="py-3 px-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f5f2]">
                  {visiblePatients.map((u) => (
                    <tr key={u.id} className="hover:bg-[#f8faf9] align-top">
                      <td className="py-3 px-2"><div className="font-bold text-[#13241b]">{u.full_name}</div><div className="text-[#607368]">@{u.username}</div></td>
                      <td className="py-3 px-2 text-[#607368]"><div>{u.mobile_number || 'N/A'}</div><div>{u.email || ''}</div></td>
                      <td className="py-3 px-2 text-[#607368]">{u.birthdate || 'N/A'}{u.sex ? ` · ${u.sex}` : ''}</td>
                      <td className="py-3 px-2 text-[#607368] max-w-[260px]">{u.complete_address || 'N/A'}</td>
                      <td className="py-3 px-2">
                        <span className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase ${statusOf(u) === 'Pending' ? 'bg-amber-100 text-amber-700' : statusOf(u) === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {statusOf(u) === 'Approved' ? 'Accepted' : statusOf(u)}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right whitespace-nowrap space-x-1.5">
                        {statusOf(u) !== 'Approved' && (
                          <button onClick={() => handlePatientDecision(u, 'Approved')} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl font-bold text-[11px] cursor-pointer">Accept</button>
                        )}
                        {statusOf(u) !== 'Rejected' && (
                          <button onClick={() => handlePatientDecision(u, 'Rejected')} className="bg-white border border-red-200 hover:bg-red-50 text-red-700 px-3 py-1.5 rounded-xl font-bold text-[11px] cursor-pointer">Reject</button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {visiblePatients.length === 0 && (
                    <tr><td colSpan="6" className="py-6 text-center text-gray-400 font-medium">No patient accounts in this list.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

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

    </div>
  );
}
