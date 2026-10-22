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

  // Active navigation view for users with multiple tabs (like Dentist)
  const [currentView, setCurrentView] = useState(() =>
    authenticatedUser && (authenticatedUser.id === 4 || authenticatedUser.role === 'patient')
      ? 'services'
      : 'dashboard'
  );

  // Handle sign-in callback
  const handleLoginSuccess = (role, fullName, id) => {
    let mappedRole = (role || 'patient').toLowerCase();
    if (id === 1) mappedRole = 'manager';
    else if (id === 2) mappedRole = 'dentist';
    else if (id === 3) mappedRole = 'assistant';
    else if (id === 4) mappedRole = 'patient';

    const userData = { id, role: mappedRole, name: fullName };
    localStorage.setItem('dental_portal_user', JSON.stringify(userData));
    setAuthenticatedUser(userData);
    setCurrentView(mappedRole === 'patient' ? 'services' : 'dashboard');
  };

  // Handle logout with confirmation prompt
  const handleLogout = () => {
    const confirmed = window.confirm('Are you sure you want to sign out of your workspace?');
    if (confirmed) {
      localStorage.removeItem('dental_portal_user');
      setAuthenticatedUser(null);
    }
  };

  // 1. Unauthenticated Index View -> Render Login Form
  if (!authenticatedUser) {
    return (
      <div className="h-screen w-screen bg-[#f5f7f6] flex flex-col overflow-hidden font-sans">
        <main className="flex-1 w-full flex items-center justify-center p-6">
          <Login onLogin={handleLoginSuccess} />
        </main>
      </div>
    );
  }

  const isManager = authenticatedUser.id === 1 || authenticatedUser.role === 'manager';
  const isDentist = authenticatedUser.id === 2 || authenticatedUser.role === 'dentist';
  const isAssistant = authenticatedUser.id === 3 || authenticatedUser.role === 'assistant';
  const isPatient = authenticatedUser.id === 4 || authenticatedUser.role === 'patient';

  return (
    <div className="h-screen w-screen bg-[#f5f7f6] text-[#13241b] flex overflow-hidden font-sans">
      
      {/* 2. Global Persistent Left Sidebar Navigation */}
      <aside className="w-64 bg-white border-r border-[#d4e2dc] flex flex-col justify-between p-6 shrink-0 shadow-2xs z-10">
        <div>
          {/* Brand Logo & Title */}
          <div className="flex items-center gap-3 mb-8 pb-6 border-b border-[#d4e2dc]">
            <div className="w-10 h-10 rounded-xl bg-[#164e43] text-white flex items-center justify-center font-bold text-lg shadow-2xs">
              🦷
            </div>
            <div>
              <h1 className="font-black text-sm leading-tight text-[#13241b]">
                Dental Care Portal
              </h1>
              <p className="text-[10px] text-[#607368] font-bold uppercase tracking-wider">
                System Navigation
              </p>
            </div>
          </div>

          {/* Navigation Links based on Role */}
          <nav className="flex flex-col gap-2">
            {isManager && (
              <>
                <button onClick={() => setCurrentView('dashboard')} className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs transition cursor-pointer ${currentView === 'dashboard' ? 'bg-[#164e43] text-white' : 'text-[#607368] hover:bg-[#f5f7f6]'}`}>
                  📊 Manager Dashboard
                </button>
                <button onClick={() => setCurrentView('calendar')} className={`w-full flex items-center px-4 py-3 rounded-xl font-bold text-xs transition cursor-pointer ${currentView === 'calendar' ? 'bg-[#164e43] text-white' : 'text-[#607368] hover:bg-[#f5f7f6]'}`}>
                  <img src="/sidebar-icons/calendar-icon.png" alt="" className={`appointment-icon ${currentView === 'calendar' ? 'icon-white' : ''}`} />
                  <span>Master calendar</span>
                </button>
                <button onClick={() => setCurrentView('services')} className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs transition cursor-pointer ${currentView === 'services' ? 'bg-[#164e43] text-white' : 'text-[#607368] hover:bg-[#f5f7f6]'}`}>
                  ⚙️ Services Catalog
                </button>
              </>
            )}

            {isDentist && (
              <>
                <button onClick={() => setCurrentView('dashboard')} className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs transition cursor-pointer ${currentView === 'dashboard' ? 'bg-[#164e43] text-white' : 'text-[#607368] hover:bg-[#f5f7f6]'}`}>
                  📊 Dashboard
                </button>
                <button onClick={() => setCurrentView('logs')} className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs transition cursor-pointer ${currentView === 'logs' ? 'bg-[#164e43] text-white' : 'text-[#607368] hover:bg-[#f5f7f6]'}`}>
                  📋 Patient Logs
                </button>
                <button onClick={() => setCurrentView('reports')} className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs transition cursor-pointer ${currentView === 'reports' ? 'bg-[#164e43] text-white' : 'text-[#607368] hover:bg-[#f5f7f6]'}`}>
                  📈 Reports & Analytics
                </button>
                <button onClick={() => setCurrentView('profile')} className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs transition cursor-pointer ${currentView === 'profile' ? 'bg-[#164e43] text-white' : 'text-[#607368] hover:bg-[#f5f7f6]'}`}>
                  👤 Profile
                </button>
              </>
            )}

            {isAssistant && (
              <button onClick={() => setCurrentView('queue')} className="w-full text-left px-4 py-3 rounded-xl font-bold text-xs bg-[#164e43] text-white">
                📋 Patient Queue & Check-in
              </button>
            )}

            {isPatient && (
              <>
                <button
                  onClick={() => setCurrentView('book')}
                  className={`w-full flex items-center px-4 py-3 rounded-xl font-bold text-xs transition cursor-pointer ${
                    currentView === 'book'
                      ? 'bg-[#164e43] text-white'
                      : 'text-[#607368] hover:bg-[#f5f7f6]'
                  }`}
                >
                  <img
                    src="sidebar-icons/calendar-icon.png"
                    alt=""
                    className={`appointment-icon ${currentView === 'book' ? 'icon-white' : ''}`}
                  />
                  <span>Book Appointment</span>
                </button>
                <button
                  onClick={() => setCurrentView('history')}
                  className={`w-full flex items-center px-4 py-3 rounded-xl font-bold text-xs transition cursor-pointer ${
                    currentView === 'history'
                      ? 'bg-[#164e43] text-white'
                      : 'text-[#607368] hover:bg-[#f5f7f6]'
                  }`}
                >
                  <img
                    src="sidebar-icons/folder-icon.png"
                    alt=""
                    className={`appointment-icon ${currentView === 'history' ? 'icon-white' : ''}`}
                  />
                  <span>My Records</span>
                </button>
                <button
                  onClick={() => setCurrentView('services')}
                  className={`w-full flex items-center px-4 py-3 rounded-xl -order-1 font-bold text-xs transition cursor-pointer ${
                    currentView === 'services'
                      ? 'bg-[#164e43] text-white'
                      : 'text-[#607368] hover:bg-[#f5f7f6]'
                  }`}
                >
                  <img
                    src="/sidebar-icons/Services-tab-icon.png"
                    alt=""
                    className={`patient-services-nav-icon ${currentView === 'services' ? 'icon-white' : ''}`}
                  />
                  <span>Services</span>
                </button>
              </>
            )}
          </nav>
        </div>

        {/* User Session & Logout Footer */}
        <div className="border-t border-[#d4e2dc] pt-4 space-y-3">
          <div>
            <span className="text-[10px] text-[#607368] font-bold uppercase tracking-wider block">Logged in as</span>
            <span className="font-black text-xs text-[#13241b] truncate block">{authenticatedUser.name}</span>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 py-2.5 rounded-xl transition cursor-pointer"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* 3. Main System Workspace Viewport */}
      <main className="flex-1 h-full overflow-hidden p-8 flex flex-col">
        {isManager && <ManagerModule {...contextData} currentView={currentView} />}
        {isDentist && (
          <DentistModule 
            {...contextData} 
            updateAppointmentStatus={contextData.updateAppointmentStatus} 
            currentView={currentView} 
            user={authenticatedUser} 
          />
        )}
        {isAssistant && <AssistantModule {...contextData} />}
        {isPatient && <PatientModule {...contextData} currentView={currentView} onViewChange={setCurrentView} user={authenticatedUser} />}
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
