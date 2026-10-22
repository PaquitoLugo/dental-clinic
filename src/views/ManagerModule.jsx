import React, { useState } from 'react';

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
  // Form States
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [isCustomService, setIsCustomService] = useState(false);
  const [customServiceName, setCustomServiceName] = useState('');
  const [duration, setDuration] = useState(30);
  const [price, setPrice] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [formError, setFormError] = useState('');

  // Direct Form Edit State (Loaded from Table Click)
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

  // Load service into the left form when clicked in the table
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
        <div className="flex-1 overflow-y-auto space-y-6">
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
        <section className="h-full min-h-0 flex flex-col gap-4 overflow-hidden" aria-label="Master appointment calendar">
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
                          <article key={appointment.id} title={`${appointment.patient_name} · ${appointment.service_name || 'Appointment'} · ${appointment.status}`} className={`border-l-4 rounded-md px-2 py-1.5 text-sm leading-tight text-[#13241b] break-words ${appointmentStatusColor(appointment.status)}`}>
                            <span className="font-black">{formatTime(appointment.appointment_time)}</span>{' '}
                            <span>{appointment.patient_name || 'Patient'}</span>
                          </article>
                        ))}
                        {dayAppointments.length === 0 && <span className="text-sm text-[#9aa9a2]">No appointments</span>}
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
                    <div key={key} className={`min-h-[90px] min-w-0 rounded-xl border p-2 flex flex-col ${key === todayKey ? 'border-[#4c9a84] bg-[#f5f9f7]' : 'border-[#e9efec] bg-white'} ${isCurrentMonth ? '' : 'opacity-50'}`}>
                      <div className="text-sm font-black text-[#13241b] mb-1">{day.getDate()}</div>
                      <div className="space-y-1 overflow-y-auto">
                        {dayAppointments.slice(0, 3).map(appointment => (
                          <article key={appointment.id} title={`${appointment.patient_name} · ${appointment.service_name || 'Appointment'} · ${appointment.status}`} className={`border-l-[3px] rounded px-1 py-1 text-xs leading-tight text-[#13241b] break-words ${appointmentStatusColor(appointment.status)}`}>
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
                  <span className={`w-2.5 h-2.5 rounded-sm border-l-[3px] ${appointmentStatusColor(status)}`} />{status}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      {(currentView === 'services' || !currentView) && (
        <div className="h-full grid grid-cols-12 gap-6 overflow-hidden">
          
          {/* Left Form: Add / Edit Service */}
          <div className="col-span-4 bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs overflow-y-auto flex flex-col">
            <div className="flex justify-between items-center mb-1">
              <h3 className="font-black text-lg text-[#13241b]">
                {formEditingId ? 'Edit Service' : 'Add Clinic Service'}
              </h3>
              {formEditingId && (
                <span className="text-[10px] bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">
                  Editing Mode Active
                </span>
              )}
            </div>
            <p className="text-xs text-[#607368] mb-4">
              {formEditingId ? 'Modify service details below or cancel.' : 'Direct database persistence via Supabase.'}
            </p>

            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-xl mb-4 font-bold">
                ⚠️ {formError}
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="space-y-4 flex-1 flex flex-col justify-between">
              <div className="space-y-4">
                
                <div>
                  <label className="block text-xs font-bold text-[#164e43] mb-1">1. Select Category *</label>
                  <select 
                    required 
                    value={selectedCategory} 
                    onChange={handleCategoryChange} 
                    className="w-full border border-[#d4e2dc] rounded-xl p-3 text-xs bg-[#f5f7f6] font-bold text-[#13241b] focus:outline-none focus:border-[#164e43]"
                  >
                    <option value="">-- Choose Category First --</option>
                    {categoriesFromDb.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                {!formEditingId && selectedCategory && (
                  <div>
                    <label className="block text-xs font-bold text-[#164e43] mb-1">2. Select Offered Service *</label>
                    <select 
                      required 
                      value={isCustomService ? 'CUSTOM' : selectedService} 
                      onChange={handleServiceChange} 
                      className="w-full border border-[#d4e2dc] rounded-xl p-3 text-xs bg-[#f5f7f6] font-bold text-[#13241b] focus:outline-none focus:border-[#164e43]"
                    >
                      <option value="">-- Choose Service Under Category --</option>
                      {availableServicesInCategory.map(s => (
                        <option key={s.id} value={s.service_name}>{s.service_name} (₱{s.price})</option>
                      ))}
                      <option value="CUSTOM">+ Custom / Unlisted Service</option>
                    </select>
                  </div>
                )}

                {(isCustomService || formEditingId) && (
                  <div>
                    <label className="block text-xs font-bold text-amber-800 mb-1">Service Name *</label>
                    <input 
                      type="text" 
                      required 
                      value={customServiceName} 
                      onChange={e => setCustomServiceName(e.target.value)} 
                      placeholder="e.g. Specialized Laser Scaling" 
                      className="w-full border border-amber-300 rounded-xl p-3 text-xs bg-amber-50 font-bold text-[#13241b] focus:outline-none focus:border-amber-600" 
                    />
                  </div>
                )}

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

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-[#607368] mb-1">Duration (mins)</label>
                    <input 
                      type="number" 
                      required 
                      value={duration} 
                      onChange={e => setDuration(e.target.value)} 
                      className="w-full border border-[#d4e2dc] rounded-xl p-3 text-xs bg-[#f5f7f6] font-bold focus:outline-none focus:border-[#164e43]" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#607368] mb-1">Price (₱) *</label>
                    <input 
                      type="number" 
                      required 
                      value={price} 
                      onChange={e => setPrice(e.target.value)} 
                      placeholder="1500" 
                      className="w-full border border-[#d4e2dc] rounded-xl p-3 text-xs bg-[#f5f7f6] font-bold focus:outline-none focus:border-[#164e43]" 
                    />
                  </div>
                </div>

              </div>

              {/* Prominent Form Action Buttons */}
              <div className="space-y-2 mt-4">
                <button 
                  type="submit" 
                  disabled={!selectedCategory || (!selectedService && !customServiceName) || !price}
                  className="w-full bg-[#164e43] text-white py-3.5 rounded-xl font-bold text-xs shadow-2xs hover:bg-[#0f362e] transition cursor-pointer disabled:opacity-50"
                >
                  {formEditingId ? 'Update Service in Supabase' : '+ Save Service to Supabase'}
                </button>
                {formEditingId && (
                  <button 
                    type="button" 
                    onClick={handleCancelFormEdit}
                    className="w-full bg-gray-200 text-gray-800 py-3 rounded-xl font-bold text-xs hover:bg-gray-300 transition cursor-pointer border border-gray-300"
                  >
                    Cancel Editing
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Right Catalog Table */}
          <div className="col-span-8 bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs flex flex-col overflow-hidden">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-black text-lg text-[#13241b]">Manage Services & Pricing</h3>
              <span className="text-xs bg-[#e3ede6] text-[#164e43] px-3 py-1 rounded-full font-bold">Supabase Connected</span>
            </div>

            <div className="flex gap-3 mb-4 bg-[#f5f7f6] p-3 rounded-xl border border-[#d4e2dc]">
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-[#607368] uppercase mb-1">Search Service</label>
                <input 
                  type="text"
                  value={catalogSearchQuery}
                  onChange={e => setCatalogSearchQuery(e.target.value)}
                  placeholder="Search by title..."
                  className="w-full border border-[#d4e2dc] rounded-lg p-2 text-xs bg-white font-bold text-[#13241b] focus:outline-none focus:border-[#164e43]"
                />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-[#607368] uppercase mb-1">Filter by Category</label>
                <select 
                  value={catalogFilterCategory} 
                  onChange={e => setCatalogFilterCategory(e.target.value)}
                  className="w-full border border-[#d4e2dc] rounded-lg p-2 text-xs bg-white font-bold text-[#13241b] focus:outline-none focus:border-[#164e43]"
                >
                  <option value="ALL">All Categories</option>
                  {categoriesFromDb.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div className="w-40">
                <label className="block text-[10px] font-bold text-[#607368] uppercase mb-1">Sort by Price</label>
                <select 
                  value={catalogSortPrice} 
                  onChange={e => setCatalogSortPrice(e.target.value)}
                  className="w-full border border-[#d4e2dc] rounded-lg p-2 text-xs bg-white font-bold text-[#13241b] focus:outline-none focus:border-[#164e43]"
                >
                  <option value="">Default Order</option>
                  <option value="asc">Low to High</option>
                  <option value="desc">High to Low</option>
                </select>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#d4e2dc] text-[11px] font-bold text-[#607368] uppercase">
                    <th className="py-3 px-2">Service Title</th>
                    <th className="py-3 px-2">Description</th>
                    <th className="py-3 px-2">Category</th>
                    <th className="py-3 px-2">Duration</th>
                    <th className="py-3 px-2 text-right">Price (₱)</th>
                    <th className="py-3 px-2 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f5f2] text-xs">
                  {filteredAndSortedServices.map(s => {
                    const isSelectedForEdit = formEditingId === s.id;

                    return (
                      <tr 
                        key={s.id} 
                        onClick={() => handleSelectServiceToEdit(s)}
                        className={`transition cursor-pointer ${isSelectedForEdit ? 'bg-[#e3ede6]/80 border-l-4 border-l-[#164e43]' : 'hover:bg-[#f8faf9]'}`}
                        title="Click row to select for editing"
                      >
                        <td className="py-3 px-2 font-bold text-[#13241b]">{s.service_name}</td>
                        <td className="py-3 px-2 text-[#607368] max-w-xs whitespace-pre-wrap">{s.service_description || '—'}</td>
                        <td className="py-3 px-2">
                          <span className="bg-[#f0f5f2] border border-[#d4e2dc] text-[#607368] px-2.5 py-0.5 rounded-md font-semibold text-[11px]">
                            {s.category}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-[#607368]">{s.duration_mins || 30} mins</td>
                        <td className="py-3 px-2 text-right font-black text-[#164e43]">₱{parseFloat(s.price || 0).toLocaleString()}</td>
                        <td className="py-3 px-2 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1.5">
                            <button 
                              type="button"
                              onClick={() => confirmDelete(s.id)}
                              className="bg-red-50 text-red-600 hover:bg-red-600 hover:text-white px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer shadow-2xs"
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}