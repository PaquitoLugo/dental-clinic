import { useState, useContext, useEffect } from 'react';
import { ClinicContext, ClinicProvider } from './context/ClinicContext';
import PatientModule from './views/PatientModule';
import AssistantModule from './views/AssistantModule';
import DentistModule from './views/DentistModule';
import ManagerModule from './views/ManagerModule';
import Login from './views/login';
import PatientPortal from './views/patientPortal';
import DialogHost, { dialog } from './components/DialogHost';
import useSessionGuard from './data/useSessionGuard';
import ResetPassword from './components/ResetPassword'; // Added ResetPassword import
import { supabase } from './lib/supabase';

const roleForStaff = (staff) => {
  if (staff.id === 1) return 'manager';
  if (staff.id === 2) return 'dentist';
  if (staff.id === 3) return 'assistant';
  if (staff.id === 4) return 'patient';
  return (staff.role || 'patient').toLowerCase();
};

function MainWorkspace({ authenticatedUser, handleLogout, onProfileUpdated }) {
  const contextData = useContext(ClinicContext);
  
  const [currentView, setCurrentView] = useState(() => {
    if (authenticatedUser && (authenticatedUser.id === 4 || authenticatedUser.role === 'patient')) return 'services';
    if (authenticatedUser && (authenticatedUser.id === 3 || authenticatedUser.role === 'assistant')) return 'queue';
    return 'dashboard';
  });

  const isManager = authenticatedUser.id === 1 || authenticatedUser.role === 'manager';
  const isDentist = authenticatedUser.id === 2 || authenticatedUser.role === 'dentist';
  const isAssistant = authenticatedUser.id === 3 || authenticatedUser.role === 'assistant';
  const isPatient = authenticatedUser.id === 4 || authenticatedUser.role === 'patient';

  return (
    <div className="workspace-shell h-dvh min-h-[100svh] w-full bg-[#f5f7f6] text-[#13241b] flex flex-col lg:flex-row overflow-hidden font-sans">
      <aside className="workspace-sidebar w-full lg:w-64 lg:h-full bg-white border-b lg:border-b-0 lg:border-r border-[#d4e2dc] flex flex-row lg:flex-col lg:justify-between px-3 py-2 lg:p-6 shrink-0 shadow-2xs z-10 gap-2">
        <div className="workspace-sidebar-top flex min-w-0 flex-1 items-center gap-3 lg:block">
          <div className="workspace-brand flex items-center gap-2 lg:gap-3 shrink-0 mb-0 pb-0 border-0 lg:mb-8 lg:pb-6 lg:border-b lg:border-[#d4e2dc]">
            <div className="w-10 h-10 rounded-xl bg-[#164e43] text-white flex items-center justify-center font-bold text-lg shadow-2xs">
              🦷
            </div>
            <div>
              <h1 className="font-black text-sm leading-tight text-[#13241b]">
                LumiDent
              </h1>
              <p className="text-[10px] text-[#607368] font-bold uppercase tracking-wider">
                System Navigation
              </p>
            </div>
          </div>

          <nav className="workspace-nav flex min-w-0 flex-1 flex-row gap-1 overflow-x-auto lg:flex-col lg:gap-2 lg:overflow-visible">
            {isManager && (
              <>
                <button 
                  onClick={() => setCurrentView('dashboard')} 
                  className={`w-full flex items-center px-4 py-3 rounded-xl font-bold text-xs transition cursor-pointer ${
                    currentView === 'dashboard' ? 'bg-[#164e43] text-white' : 'text-[#607368] hover:bg-[#f5f7f6]'
                  }`}
                >
                  <span>Manager Dashboard</span>
                </button>
                <button 
                  onClick={() => setCurrentView('calendar')} 
                  className={`w-full flex items-center px-4 py-3 rounded-xl font-bold text-xs transition cursor-pointer ${
                    currentView === 'calendar' ? 'bg-[#164e43] text-white' : 'text-[#607368] hover:bg-[#f5f7f6]'
                  }`}
                >
                  <span>Master Calendar</span>
                </button>
                <button 
                  onClick={() => setCurrentView('services')} 
                  className={`w-full flex items-center px-4 py-3 rounded-xl font-bold text-xs transition cursor-pointer ${
                    currentView === 'services' ? 'bg-[#164e43] text-white' : 'text-[#607368] hover:bg-[#f5f7f6]'
                  }`}
                >
                  <span>Services Catalog</span>
                </button>
                <button 
                  onClick={() => setCurrentView('users')} 
                  className={`w-full flex items-center px-4 py-3 rounded-xl font-bold text-xs transition cursor-pointer ${
                    currentView === 'users' ? 'bg-[#164e43] text-white' : 'text-[#607368] hover:bg-[#f5f7f6]'
                  }`}
                >
                  <span>User Management</span>
                </button>
                <button
                  onClick={() => setCurrentView('activity')}
                  className={`w-full flex items-center px-4 py-3 rounded-xl font-bold text-xs transition cursor-pointer ${
                    currentView === 'activity' ? 'bg-[#164e43] text-white' : 'text-[#607368] hover:bg-[#f5f7f6]'
                  }`}
                >
                  <span>Activity Logs</span>
                </button>
              </>
            )}

            {isDentist && (
              <>
                <button 
                  onClick={() => setCurrentView('dashboard')} 
                  className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs transition cursor-pointer ${
                    currentView === 'dashboard' ? 'bg-[#164e43] text-white' : 'text-[#607368] hover:bg-[#f5f7f6]'
                  }`}
                >
                  📊 Dashboard &amp; Reports
                </button>
                <button 
                  onClick={() => setCurrentView('scheduler')} 
                  className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs transition cursor-pointer ${
                    currentView === 'scheduler' ? 'bg-[#164e43] text-white' : 'text-[#607368] hover:bg-[#f5f7f6]'
                  }`}
                >
                  📅 Availability Scheduler
                </button>
                <button 
                  onClick={() => setCurrentView('logs')} 
                  className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs transition cursor-pointer ${
                    currentView === 'logs' ? 'bg-[#164e43] text-white' : 'text-[#607368] hover:bg-[#f5f7f6]'
                  }`}
                >
                  📋 Patient Logs
                </button>
                <button 
                  onClick={() => setCurrentView('toothchart')} 
                  className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs transition cursor-pointer ${
                    currentView === 'toothchart' ? 'bg-[#164e43] text-white' : 'text-[#607368] hover:bg-[#f5f7f6]'
                  }`}
                >
                  🦷 Patient Tooth Charts
                </button>
                <button 
                  onClick={() => setCurrentView('profile')} 
                  className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs transition cursor-pointer ${
                    currentView === 'profile' ? 'bg-[#164e43] text-white' : 'text-[#607368] hover:bg-[#f5f7f6]'
                  }`}
                >
                  👤 Profile
                </button>
              </>
            )}

            {isAssistant && (
              <>
                <button
                  onClick={() => setCurrentView('queue')}
                  className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs transition cursor-pointer ${
                    currentView === 'queue' ? 'bg-[#164e43] text-white' : 'text-[#607368] hover:bg-[#f5f7f6]'
                  }`}
                >
                  📋 Patient Queue &amp; Check-in
                </button>
                <button
                  onClick={() => setCurrentView('archive')}
                  className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs transition cursor-pointer ${
                    currentView === 'archive' ? 'bg-[#164e43] text-white' : 'text-[#607368] hover:bg-[#f5f7f6]'
                  }`}
                >
                  🗄️ Appointment Archive
                </button>
                <button
                  onClick={() => setCurrentView('profile')}
                  className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs transition cursor-pointer ${
                    currentView === 'profile' ? 'bg-[#164e43] text-white' : 'text-[#607368] hover:bg-[#f5f7f6]'
                  }`}
                >
                  👤 Profile
                </button>
              </>
            )}

            {isPatient && (
              <>
                <button
                  onClick={() => setCurrentView('book')}
                  className={`w-full flex items-center px-4 py-3 rounded-xl font-bold text-xs transition cursor-pointer ${
                    currentView === 'book' ? 'bg-[#164e43] text-white' : 'text-[#607368] hover:bg-[#f5f7f6]'
                  }`}
                >
                  <span>Book Appointment</span>
                </button>
                <button
                  onClick={() => setCurrentView('history')}
                  className={`w-full flex items-center px-4 py-3 rounded-xl font-bold text-xs transition cursor-pointer ${
                    currentView === 'history' ? 'bg-[#164e43] text-white' : 'text-[#607368] hover:bg-[#f5f7f6]'
                  }`}
                >
                  <span>My Records</span>
                </button>
                <button
                  onClick={() => setCurrentView('toothchart')}
                  className={`w-full flex items-center px-4 py-3 rounded-xl font-bold text-xs transition cursor-pointer ${
                    currentView === 'toothchart' ? 'bg-[#164e43] text-white' : 'text-[#607368] hover:bg-[#f5f7f6]'
                  }`}
                >
                  <span>My Tooth Chart</span>
                </button>
                <button
                  onClick={() => setCurrentView('services')}
                  className={`w-full flex items-center px-4 py-3 rounded-xl font-bold text-xs transition cursor-pointer ${
                    currentView === 'services' ? 'bg-[#164e43] text-white' : 'text-[#607368] hover:bg-[#f5f7f6]'
                  }`}
                >
                  <span>Services</span>
                </button>
                <button
                  onClick={() => setCurrentView('profile')}
                  className={`w-full flex items-center px-4 py-3 rounded-xl font-bold text-xs transition cursor-pointer ${
                    currentView === 'profile' ? 'bg-[#164e43] text-white' : 'text-[#607368] hover:bg-[#f5f7f6]'
                  }`}
                >
                  <span>My Profile</span>
                </button>
              </>
            )}
          </nav>
        </div>

        <div className="workspace-user-panel border-0 pt-0 space-y-0 lg:border-t lg:border-[#d4e2dc] lg:pt-4 lg:space-y-3">
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

      <main className="workspace-main min-w-0 min-h-0 flex-1 h-full overflow-hidden p-3 lg:p-8 flex flex-col">
        {isManager && <ManagerModule {...contextData} currentView={currentView} user={authenticatedUser} />}
        {isDentist && (
          <DentistModule 
            {...contextData} 
            updateAppointmentStatus={contextData.updateAppointmentStatus} 
            currentView={currentView} 
            onViewChange={setCurrentView}
            user={authenticatedUser} 
          />
        )}
        {isAssistant && <AssistantModule {...contextData} currentView={currentView} onViewChange={setCurrentView} user={authenticatedUser} onProfileUpdated={onProfileUpdated} />}
        {isPatient && (
          <PatientModule 
            {...contextData} 
            currentView={currentView} 
            onViewChange={setCurrentView} 
            user={authenticatedUser} 
            onProfileUpdated={onProfileUpdated}
          />
        )}
      </main>
    </div>
  );
}

export default function App() {
  // Check for resetToken inside the App component
  const urlParams = new URLSearchParams(window.location.search);
  const resetToken = urlParams.get('resetToken');

  const [authenticatedUser, setAuthenticatedUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const [portalView, setPortalView] = useState('portal');

  useEffect(() => {
    let active = true;
    supabase.auth.getSession()
      .then(async ({ data, error }) => {
        if (error) throw error;
        const session = data.session;
        if (!session) {
          localStorage.removeItem('dental_portal_user');
          if (active) setAuthenticatedUser(null);
          return;
        }

        const { data: staff, error: staffError } = await supabase.from('staff_users')
          .select('id, role, full_name, archived_at, account_status')
          .eq('auth_user_id', session.user.id)
          .maybeSingle();
        if (staffError) throw staffError;
        const accountStatus = String(staff?.account_status || 'approved').toLowerCase();
        if (!staff || staff.archived_at || ['pending', 'rejected'].includes(accountStatus)) {
          await supabase.auth.signOut();
          localStorage.removeItem('dental_portal_user');
          if (active) setAuthenticatedUser(null);
          return;
        }

        const userData = { id: staff.id, role: roleForStaff(staff), name: staff.full_name };
        localStorage.setItem('dental_portal_user', JSON.stringify(userData));
        if (active) setAuthenticatedUser(userData);
      })
      .catch(async (error) => {
        console.error('Could not restore the signed-in session:', error);
        localStorage.removeItem('dental_portal_user');
        try {
          const { error: signOutError } = await supabase.auth.signOut();
          if (signOutError) console.error('Could not clear the Supabase session:', signOutError);
        } catch (signOutError) {
          console.error('Could not clear the Supabase session:', signOutError);
        }
        if (active) setAuthenticatedUser(null);
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });

    return () => { active = false; };
  }, []);

  const handleLoginSuccess = (role, fullName, id) => {
    const userData = { id, role: roleForStaff({ id, role }), name: fullName };
    localStorage.setItem('dental_portal_user', JSON.stringify(userData));
    setAuthenticatedUser(userData);
  };

  const handleLogout = async () => {
    const confirmed = await dialog.confirm('Are you sure you want to sign out of your workspace?', { title: 'Sign out', confirmText: 'Sign Out' });
    if (confirmed) {
      try {
        const { error } = await supabase.auth.signOut();
        if (error) console.error('Could not fully sign out of Supabase Auth:', error);
      } catch (error) {
        console.error('Could not fully sign out of Supabase Auth:', error);
      }
      localStorage.removeItem('dental_portal_user');
      setAuthenticatedUser(null);
      setPortalView('portal');
    }
  };

  const handleForcedLogout = async (reason) => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) console.error('Could not fully sign out of Supabase Auth:', error);
    } catch (error) {
      console.error('Could not fully sign out of Supabase Auth:', error);
    }
    localStorage.removeItem('dental_portal_user');
    setAuthenticatedUser(null);
    setPortalView('login');
    await dialog.alert(
      reason === 'archived'
        ? 'Your account has been archived by the clinic manager, so you have been signed out. Please contact the clinic if you think this is a mistake.'
        : reason === 'missing'
          ? 'Your account no longer exists, so you have been signed out.'
          : 'Your account is no longer active, so you have been signed out.',
      { title: 'Signed out', variant: 'warning' }
    );
  };

  const handleProfileUpdated = (profile) => {
    setAuthenticatedUser((currentUser) => {
      if (!currentUser) return currentUser;
      const updatedUser = { ...currentUser, name: profile.full_name || currentUser.name };
      localStorage.setItem('dental_portal_user', JSON.stringify(updatedUser));
      return updatedUser;
    });
  };

  useSessionGuard(authenticatedUser, handleForcedLogout);

  // Render ResetPassword view if a resetToken exists in URL
  if (resetToken) {
    return (
      <ResetPassword 
        token={resetToken} 
        onComplete={() => {
          window.history.replaceState({}, document.title, window.location.pathname);
          window.location.reload();
        }} 
      />
    );
  }

  return (
    <ClinicProvider>
      <div className="min-h-screen w-full bg-[#f4f7f6] overflow-y-auto">
        {!authReady ? (
          <div className="min-h-screen flex items-center justify-center text-sm font-bold text-[#607368]">Restoring your secure session…</div>
        ) : authenticatedUser ? (
          <MainWorkspace authenticatedUser={authenticatedUser} handleLogout={handleLogout} onProfileUpdated={handleProfileUpdated} />
        ) : (
          <>
            {portalView === 'portal' && (
              <PatientPortal onLoginClick={() => setPortalView('login')} />
            )}

            {portalView === 'login' && (
              <div className="min-h-screen w-full flex items-center justify-center p-6 relative">
                <button
                  type="button"
                  onClick={() => setPortalView('portal')}
                  className="absolute top-6 left-6 text-xs font-bold text-[#164e43] bg-white border border-[#d4e2dc] px-4 py-2.5 rounded-xl hover:bg-[#f5f7f6] transition cursor-pointer shadow-2xs"
                >
                  ← Back to Portal
                </button>
                <Login onLogin={handleLoginSuccess} />
              </div>
            )}
          </>
        )}
      </div>
      <DialogHost />
    </ClinicProvider>
  );
}