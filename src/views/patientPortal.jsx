import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function PatientPortal({ onRegisterClick, onCheckAppointmentClick }) {
  const [dbServices, setDbServices] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch active dental services directly from Supabase
  useEffect(() => {
    async function fetchPortalServices() {
      setLoading(true);
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('is_active', true);

      if (!error && data) {
        setDbServices(data);
      } else {
        console.error('Error loading dental portal services:', error?.message);
      }
      setLoading(false);
    }

    fetchPortalServices();
  }, []);

  // Group dental services strictly by category from Supabase
  const servicesByCategory = dbServices.reduce((acc, service) => {
    const category = service.category || 'General Dental Services';
    if (!acc[category]) acc[category] = [];
    acc[category].push(service);
    return acc;
  }, {});

  // Category card metadata
  const categoryMeta = {
    'Preventive': {
      icon: '🪥',
      desc: 'Routine oral prophylaxis scaling, deep cleaning, fluoride treatments, and dental sealants.',
      descTag: 'Para sa regular na pagpapalinis, oral evaluation, at proteksyon laban sa pagkasira ng ngipin.'
    },
    'Restorative': {
      icon: '🦷',
      desc: 'Composite fillings, root canal therapy, inlay/onlay restorations, and structural tooth repair.',
      descTag: 'Para sa pasta, gamot sa ugat, at pag-aayos ng mga basag o sirang ngipin.'
    },
    'Prosthodontics': {
      icon: '😁',
      desc: 'Complete removable dentures, partial dentures, porcelain crowns, and fixed bridges.',
      descTag: 'Para sa pustiso at pagpapalit ng mga bawas o kulang na ngipin.'
    },
    'Surgical': {
      icon: '🩺',
      desc: 'Simple tooth extractions, complicated surgical extractions, wisdom tooth odontectomy, and minor oral surgery.',
      descTag: 'Para sa bunot ng ngipin at operasyon sa impacted wisdom tooth.'
    },
    'Orthodontics': {
      icon: '✨',
      desc: 'Traditional metal brackets, ceramic braces adjustment, archwire replacements, and alignment retainers.',
      descTag: 'Para sa pagpapagaling ng sungki, pagpapakabit ng braces, at pag-adjust ng ngipin.'
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#f4f7f6] font-sans text-[#13241b] flex flex-col overflow-y-auto">
      
      {/* Clickable Header Logo to Home */}
      <header className="bg-white border-b border-[#e1ebd7] px-6 py-4 flex items-center justify-between sticky top-0 z-40 shadow-2xs">
        <div 
          onClick={() => window.location.reload()} 
          className="flex items-center gap-3 cursor-pointer hover:opacity-85 transition"
        >
          <div className="w-10 h-10 rounded-full bg-[#164e43] flex items-center justify-center text-white font-black text-xl shadow-xs">
            🦷
          </div>
          <div>
            <h1 className="font-black text-base tracking-tight text-[#13241b]">DENTAL CARE PORTAL</h1>
            <p className="text-[10px] font-bold text-[#607368] uppercase tracking-wider">Patient Scheduler & Charting System</p>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 space-y-6 pb-20">
        
        {/* Hero Action Banner */}
        <div className="bg-white border border-[#d4e2dc] rounded-2xl p-8 shadow-2xs space-y-6">
          <div>
            <h2 className="text-3xl font-black text-[#13241b] tracking-tight uppercase">
              Dental Clinic Online Appointment
            </h2>
            <p className="text-xs text-[#607368] font-medium mt-2">
              Select a dental service category, choose your preferred date and time slot, and register your consultation.
            </p>
          </div>

          <div className="flex flex-wrap gap-4 pt-2">
            <button
              type="button"
              onClick={() => onRegisterClick(null)}
              className="bg-[#164e43] text-white px-6 py-3.5 rounded-xl font-extrabold text-xs shadow-xs hover:bg-[#0f362e] transition cursor-pointer"
            >
              Register an appointment
            </button>

            <button
              type="button"
              onClick={onCheckAppointmentClick}
              className="bg-white border border-[#d4e2dc] text-[#13241b] px-6 py-3.5 rounded-xl font-bold text-xs hover:bg-[#f5f7f6] transition cursor-pointer"
            >
              Check my appointment
            </button>
          </div>
        </div>

        {/* Dental Patient Reminders Box */}
        <div className="bg-[#fffbeb] border-l-4 border-l-amber-500 border border-amber-200/60 rounded-2xl p-6 shadow-2xs space-y-3">
          <h3 className="font-black text-sm text-[#13241b] uppercase tracking-wider">
            Reminders (Mga Paalala):
          </h3>
          <p className="text-xs text-[#4b5563] leading-relaxed">
            Please arrive 10 minutes prior to your scheduled dental appointment time. If you have active tooth pain, swelling, or facial trauma requiring immediate emergency attention, please contact our clinic front desk immediately.
          </p>
          <p className="text-xs text-[#6b7280] italic leading-relaxed pt-1">
            Mangyaring dumating 10 minuto bago ang nakatakdang oras ng appointment. Kung mayroong matinding sakit ng ngipin o pamamaga na nangangailangan ng agarang atensyon, tumawag agad sa aming clinic desk.
          </p>
        </div>

        {/* Categorized Card Modules Grid */}
        <div className="bg-white border border-[#d4e2dc] rounded-2xl p-8 shadow-2xs space-y-6">
          <div>
            <h3 className="text-xs font-bold text-[#607368] uppercase tracking-wider">
              Anong serbisyong dental ang kailangan mo?
            </h3>
          </div>

          {loading ? (
            <div className="py-8 text-center text-xs font-bold text-[#607368]">
              Loading dental service catalog from Supabase...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Object.keys(servicesByCategory).map((catName) => {
                const meta = categoryMeta[catName] || {
                  icon: '🦷',
                  desc: 'General dental consultation and oral health evaluation services.',
                  descTag: 'Para sa pangkalahatang konsultasyon at pangangalaga sa ngipin.'
                };
                const catServices = servicesByCategory[catName];

                return (
                  <div key={catName} className="border border-[#d4e2dc] rounded-2xl p-6 bg-white shadow-2xs flex flex-col justify-between space-y-6">
                    <div className="space-y-3">
                      <div className="text-2xl">{meta.icon}</div>
                      <h4 className="font-black text-xl text-[#13241b]">{catName}</h4>
                      <p className="text-xs font-bold text-[#13241b] leading-relaxed">
                        {meta.desc}
                      </p>
                      <p className="text-[11px] text-[#607368] italic leading-relaxed">
                        {meta.descTag}
                      </p>

                      <div className="pt-3 border-t border-[#f0f5f2] space-y-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[#164e43]">
                          Enclosed Services ({catServices.length}):
                        </span>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {catServices.map((service) => (
                            <div key={service.id} className="bg-[#f8faf9] border border-[#e5ece8] rounded-xl p-3 space-y-1">
                              <div className="flex justify-between items-start gap-2">
                                <span className="font-bold text-xs text-[#13241b]">{service.service_name}</span>
                                {service.price && (
                                  <span className="font-black text-xs text-[#164e43] whitespace-nowrap">
                                    ₱{parseFloat(service.price).toLocaleString()}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-[#607368] leading-tight">
                                {service.service_description || 'Standard dental consultation and procedure.'}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onRegisterClick(catName)}
                      className="w-full bg-[#164e43] text-white py-3.5 rounded-xl font-bold text-xs hover:bg-[#0f362e] transition cursor-pointer shadow-xs"
                    >
                      Select this service category
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-[#fffbeb] border-l-4 border-l-amber-500 border border-amber-200/60 rounded-2xl p-6 shadow-2xs space-y-2">
          <h3 className="font-black text-lg text-[#13241b]">
            Need help booking your appointment?
          </h3>
          <p className="text-xs text-[#4b5563]">
            Ask our dental clinic desk or call our direct hotlines for booking assistance. Do not share your reference code publicly.
          </p>
        </div>

      </main>
    </div>
  );
}