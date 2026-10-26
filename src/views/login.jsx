import React, { useState } from 'react';
import bcrypt from 'bcryptjs';
import { supabase } from '../lib/supabase';
import RegisterModal from '../components/RegisterModal';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false); // State to toggle visibility
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
      // 1. Fetch the account by username only
      const { data, error } = await supabase
        .from('staff_users')
        .select('*')
        .eq('username', username.trim().toLowerCase())
        .maybeSingle();

      // If user doesn't exist or query failed
      if (error || !data) {
        setErrorMsg('Invalid username or password. Please check your credentials.');
        return;
      }

      // 2. Compare the entered password with the stored hash
      const isPasswordValid = await bcrypt.compare(password.trim(), data.password);

      if (!isPasswordValid) {
        setErrorMsg('Invalid username or password. Please check your credentials.');
        return;
      }

      // 3. Handle account status checks
      if (data.archived_at) {
        setErrorMsg('This account is archived. Please contact the clinic manager for assistance.');
      } else {
        const status = data.account_status || 'Approved';
        if (status === 'Pending') {
          setErrorMsg('Your account is still waiting for verification by the clinic manager. Please try again later.');
        } else if (status === 'Rejected') {
          setErrorMsg('Your registration was not approved. Please contact the clinic for assistance.');
        } else {
          onLogin(data.role, data.full_name, data.id);
        }
      }
    } catch (err) {
      setErrorMsg('Database connection error.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegistrationSuccess = (newUsername) => {
    setUsername(newUsername);
    setPassword('');
    setSuccessMsg('Registration submitted! The clinic manager will verify your details. You can sign in once your account is approved.');
  };

  return (
    <div className="h-full w-full flex items-center justify-center p-8">
      <div className="w-[480px] bg-white border border-[#d4e2dc] rounded-3xl p-10 shadow-md">
        
        {/* Header Branding */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[#164e43] text-white flex items-center justify-center font-bold text-3xl mx-auto mb-4 shadow-xs">
            🦷
          </div>
          <h2 className="font-black text-3xl text-[#13241b] tracking-tight">LumiDent</h2>
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
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-[#d4e2dc] rounded-2xl p-4 pr-12 text-sm bg-[#f5f7f6] focus:outline-none focus:border-[#164e43]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#607368] hover:text-[#164e43] transition focus:outline-none cursor-pointer p-1"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  /* Eye Slash (Hide) Icon */
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  /* Eye (Show) Icon */
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12c1.349-4.39 5.385-7.5 9.964-7.5s8.615 3.11 9.964 7.5c-1.349 4.39-5.385 7.5-9.964 7.5s-8.615-3.11-9.964-7.5z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
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
          <p className="text-xs text-[#607368] mb-2 font-medium">New patient? Create an account for verification.</p>
          <button
            type="button"
            onClick={() => setIsRegisterOpen(true)}
            className="w-full bg-[#e3ede6] hover:bg-[#d4e2dc] text-[#164e43] border border-[#d4e2dc] py-3 rounded-2xl text-xs font-bold transition cursor-pointer"
          >
            Register as a Patient
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