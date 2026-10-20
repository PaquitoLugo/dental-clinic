import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import RegisterModal from '../components/RegisterModal';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from('staff_users')
        .select('*')
        .eq('username', username.trim().toLowerCase())
        .eq('password', password.trim())
        .single();

      if (error || !data) {
        setErrorMsg('Invalid username or password. Please check your credentials.');
      } else {
        onLogin(data.role, data.full_name, data.id);
      }
    } catch (err) {
      setErrorMsg('Database connection error.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegistrationSuccess = (newUsername, newPassword) => {
    setUsername(newUsername);
    setPassword(newPassword);
    setSuccessMsg('Registration successful! You can now sign in below.');
  };

  return (
    <div className="h-full w-full flex items-center justify-center p-8">
      <div className="w-[480px] bg-white border border-[#d4e2dc] rounded-3xl p-10 shadow-md">
        
        {/* Header Branding */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[#164e43] text-white flex items-center justify-center font-bold text-3xl mx-auto mb-4 shadow-xs">
            🦷
          </div>
          <h2 className="font-black text-3xl text-[#13241b] tracking-tight">Dental Clinic Portal</h2>
          <p className="text-xs font-semibold text-[#607368] mt-2">Sign in to access your workspace portal.</p>
        </div>

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-4 rounded-2xl mb-6 font-medium">
            ⚠️ {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-xs p-4 rounded-2xl mb-6 font-medium">
            ✓ {successMsg}
          </div>
        )}

        {/* Clean Sign In Form */}
        <form onSubmit={handleLoginSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-[#607368] mb-2 uppercase tracking-wider">Username</label>
            <input
              type="text"
              required
              placeholder="Enter your username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full border border-[#d4e2dc] rounded-2xl p-4 text-sm bg-[#f5f7f6] focus:outline-none focus:border-[#164e43]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#607368] mb-2 uppercase tracking-wider">Password</label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-[#d4e2dc] rounded-2xl p-4 text-sm bg-[#f5f7f6] focus:outline-none focus:border-[#164e43]"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-[#164e43] hover:bg-[#0f362e] text-white py-4 rounded-2xl font-bold text-sm shadow-xs transition cursor-pointer"
          >
            {isLoading ? 'Signing in...' : 'Sign In to Workspace →'}
          </button>
        </form>

        {/* Separated Register Button */}
        <div className="mt-8 pt-6 border-t border-[#d4e2dc] text-center">
          <p className="text-xs text-[#607368] mb-2 font-medium">Don't have a patient account yet?</p>
          <button
            type="button"
            onClick={() => setIsRegisterOpen(true)}
            className="w-full bg-[#e3ede6] hover:bg-[#d4e2dc] text-[#164e43] border border-[#d4e2dc] py-3 rounded-2xl text-xs font-bold transition cursor-pointer"
          >
            Register Here
          </button>
        </div>

      </div>

      {/* Full Patient Registration Modal */}
      <RegisterModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        onSuccess={handleRegistrationSuccess}
      />
    </div>
  );
}