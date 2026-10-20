import React, { useState, useContext } from 'react';
import { ClinicContext, ClinicProvider } from './context/ClinicContext';
import PatientModule from './views/PatientModule';
import AssistantModule from './views/AssistantModule';
import DentistModule from './views/DentistModule';
import ManagerModule from './views/ManagerModule';
import Login from './views/login';

function DentalPortalApp() {
  const contextData = useContext(ClinicContext);
  
  // Restore authenticated user session
  const [authenticatedUser, setAuthenticatedUser] = useState(() => {
    const savedUser = localStorage.getItem('dental_portal_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  // Handle sign-in callback
  const handleLoginSuccess = (role, fullName, id) => {
    let mappedRole = (role || 'patient').toLowerCase();
    
    // Explicit override for pre-seeded IDs
    if (id === 1) mappedRole = 'manager';
    else if (id === 2) mappedRole = 'dentist';
    else if (id === 3) mappedRole = 'assistant';
    else if (id === 4) mappedRole = 'patient';

    const userData = { id, role: mappedRole, name: fullName };

    localStorage.setItem('dental_portal_user', JSON.stringify(userData));
    setAuthenticatedUser(userData);
  };

  // Handle logout with confirmation prompt
  const handleLogout = () => {
    const confirmed = window.confirm('Are you sure you want to sign out of your workspace?');
    if (confirmed) {
      localStorage.removeItem('dental_portal_user');
      setAuthenticatedUser(null);
    }
  };

  // 1. Unauthenticated Index View -> Render Login/Register Form
  if (!authenticatedUser) {
    return (
      <div className="h-screen w-screen bg-[#f5f7f6] flex flex-col overflow-hidden font-sans">
        <main className="flex-1 w-full flex items-center justify-center p-6">
          <Login onLogin={handleLoginSuccess} />
        </main>
      </div>
    );
  }

  // Determine user workspace title badge
  const isManager = authenticatedUser.id === 1 || authenticatedUser.role === 'manager';
  const isDentist = authenticatedUser.id === 2 || authenticatedUser.role === 'dentist';
  const isAssistant = authenticatedUser.id === 3 || authenticatedUser.role === 'assistant';
  const isPatient = authenticatedUser.id === 4 || authenticatedUser.role === 'patient';

  // 2. Authenticated View -> Render Workspace Header and Dedicated Module
  return (
    <div className="h-screen w-screen bg-[#f5f7f6] text-[#13241b] flex flex-col overflow-hidden font-sans">
      
      {/* 1080p Widescreen Header */}
      <header className="h-16 bg-white border-b border-[#d4e2dc] px-8 flex justify-between items-center shrink-0 z-10 shadow-2xs">
        
        {/* Brand Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#164e43] text-white flex items-center justify-center font-bold text-lg shadow-2xs">
            🦷
          </div>
          <div>
            <h1 className="font-black text-base leading-tight tracking-tight text-[#13241b]">
              Dental Care Portal
            </h1>
            <p className="text-[11px] text-[#607368] font-bold uppercase tracking-wider">
              Workspace · {authenticatedUser.name}
            </p>
          </div>
        </div>

        {/* Workspace Badge & Logout Controls */}
        <div className="flex items-center gap-4">
          <div className="bg-[#e3ede6] border border-[#d4e2dc] px-4 py-1.5 rounded-xl flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#164e43] animate-pulse"></span>
            <span className="text-xs font-bold text-[#164e43]">
              {isManager && 'Clinic Manager Workspace'}
              {isDentist && 'Dentist Charting Workspace'}
              {isAssistant && 'Dental Assistant Queue'}
              {isPatient && 'Patient Self-Service Portal'}
            </span>
          </div>

          <div className="flex items-center gap-3 pl-3 border-l border-[#d4e2dc]">
            <span className="text-xs font-bold text-[#13241b]">
              👤 {authenticatedUser.name}
            </span>
            <button 
              onClick={handleLogout}
              className="text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-3.5 py-1.5 rounded-xl transition cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>

      </header>

      {/* Main Viewport Content */}
      <main className="flex-1 w-full max-w-[1840px] mx-auto p-6 overflow-hidden">
        {isManager && <ManagerModule {...contextData} />}
        {isDentist && <DentistModule {...contextData} />}
        {isAssistant && <AssistantModule {...contextData} />}
        {isPatient && <PatientModule {...contextData} user={authenticatedUser} />}
      </main>

    </div>
  );
}

export default function App() {
  return (
    <ClinicProvider>
      <DentalPortalApp />
    </ClinicProvider>
  );
}