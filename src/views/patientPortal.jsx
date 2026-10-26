import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import RegisterModal from '../components/RegisterModal';

// Public landing page. There is no public booking: patients create an account, the manager verifies it,
// and appointments are then booked from inside the patient workspace.
export default function PatientPortal({ onLoginClick }) {
  const [dbServices, setDbServices] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [registeredMsg, setRegisteredMsg] = useState('');

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
      
      {/* TOP HEADER BAR */}
      <header className="w-full bg-white border-b border-[#d4e2dc] px-8 py-4 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#164e43] text-white flex items-center justify-center font-bold text-lg shadow-2xs">
            🦷
          </div>
          <div>
            <h1 className="font-black text-sm leading-tight text-[#13241b]">
              LumiDent
            </h1>
            <p className="text-[10px] text-[#607368] font-bold uppercase tracking-wider">
              PATIENT SCHEDULER & CHARTING SYSTEM
            </p>
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={() => onLoginClick && onLoginClick()}
            className="bg-white border border-[#d4e2dc] text-[#164e43] hover:bg-[#f5f7f6] px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs"
          >
            Sign In
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 space-y-6 pb-20">
        
        {/* Hero Action Banner */}
        <div className="bg-white border border-[#d4e2dc] rounded-2xl p-8 shadow-2xs space-y-6">
          <div>
            <h2 className="text-3xl font-black text-[#13241b] tracking-tight uppercase">
              LumiDent Online Appointment Testing
            </h2>
            <p className="text-xs text-[#607368] font-medium mt-2">
              Browse our services, create a patient account and, once the clinic has verified it, book your appointment online.
            </p>
          </div>

          {registeredMsg && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-xs p-4 rounded-2xl font-medium">
              ✓ {registeredMsg}
            </div>
          )}

          <div className="flex flex-wrap gap-4 pt-2">
            <button
              type="button"
              onClick={() => setIsRegisterOpen(true)}
              className="bg-[#164e43] text-white px-6 py-3.5 rounded-xl font-extrabold text-xs shadow-xs hover:bg-[#0f362e] transition cursor-pointer"
            >
              Create a patient account
            </button>

            <button
              type="button"
              onClick={() => onLoginClick && onLoginClick()}
              className="bg-white border border-[#d4e2dc] text-[#13241b] px-6 py-3.5 rounded-xl font-bold text-xs hover:bg-[#f5f7f6] transition cursor-pointer"
            >
              Sign in to book an appointment
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
              {Object.entries(servicesByCategory).map(([categoryName, catServices]) => {
                const meta = categoryMeta[categoryName] || {
                  icon: '🦷',
                  desc: 'Specialized dental care services.',
                  descTag: 'Serbisyong dental.'
                };
                return (
                  <div key={categoryName} className="border border-[#d4e2dc] rounded-2xl p-6 bg-[#f8faf9] space-y-4 shadow-2xs">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{meta.icon}</span>
                      <h4 className="font-black text-base text-[#13241b]">{categoryName}</h4>
                    </div>
                    <p className="text-xs text-[#607368]">{meta.desc}</p>
                    <p className="text-[11px] text-[#6b7280] italic">{meta.descTag}</p>
                    <div className="border-t border-[#d4e2dc] pt-3 space-y-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#164e43]">
                        Enclosed Services ({catServices.length}):
                      </span>
                      <ul className="space-y-1 text-xs">
                        {catServices.map(s => (
                          <li key={s.id} className="flex justify-between items-center bg-white p-2 rounded-xl border border-[#d4e2dc]">
                            <span className="font-bold text-[#13241b]">{s.service_name}</span>
                            <span className="font-extrabold text-[#164e43]">₱{s.price}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
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

      <RegisterModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        onSuccess={() => setRegisteredMsg('Registration submitted! The clinic manager will verify your details. You can sign in once your account has been accepted.')}
      />
    </div>
  );
}