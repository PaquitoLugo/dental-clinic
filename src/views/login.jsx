import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Login({ onLogin }) {
  const [isRegistering, setIsRegistering] = useState(false);
  
  // Login fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  // Registration fields
  const [regFullName, setRegFullName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Handle Login Submission
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

  // Handle Patient Registration Submission
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setIsLoading(true);

    try {
      // Insert new patient with role 'patient'
      const { data, error } = await supabase
        .from('staff_users')
        .insert([
          {
            username: regUsername.trim().toLowerCase(),
            password: regPassword.trim(),
            role: 'patient',
            full_name: regFullName.trim()
          }
        ])
        .select()
        .single();

      if (error) {
        setErrorMsg(error.message || 'Registration failed. Username may already be taken.');
      } else {
        setSuccessMsg('Registration successful! You can now sign in with your credentials.');
        setIsRegistering(false);
        setUsername(regUsername);
        setPassword(regPassword);
      }
    } catch (err) {
      setErrorMsg('An unexpected error occurred during registration.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full w-full flex items-center justify-center p-8">
      <div className="w-[540px] bg-white border border-[#d4e2dc] rounded-3xl p-10 shadow-md">
        
        {/* Header & Branding */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-[#164e43] text-white flex items-center justify-center font-bold text-3xl mx-auto mb-4 shadow-sm">
            🦷
          </div>
          <h2 className="font-black text-3xl text-[#13241b] tracking-tight">
            {isRegistering ? 'Patient Registration' : 'Dental Clinic Portal'}
          </h2>
          <p className="text-sm text-[#607368] mt-2">
            {isRegistering ? 'Create your patient account to book appointments.' : 'Sign in to access your designated workspace.'}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 gap-1.5 bg-[#f0f5f2] p-1.5 rounded-2xl border border-[#d4e2dc] mb-6">
          <button
            type="button"
            onClick={() => { setIsRegistering(false); setErrorMsg(''); setSuccessMsg(''); }}
            className={`py-2.5 text-xs font-bold rounded-xl transition cursor-pointer ${
              !isRegistering ? 'bg-[#164e43] text-white shadow-2xs' : 'text-[#607368] hover:text-[#13241b]'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setIsRegistering(true); setErrorMsg(''); setSuccessMsg(''); }}
            className={`py-2.5 text-xs font-bold rounded-xl transition cursor-pointer ${
              isRegistering ? 'bg-[#164e43] text-white shadow-2xs' : 'text-[#607368] hover:text-[#13241b]'
            }`}
          >
            Register Patient
          </button>
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

        {/* Conditional Forms */}
        {!isRegistering ? (
          /* Sign In Form */
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
              className="w-full bg-[#164e43] hover:bg-[#0f362e] text-white py-4 rounded-2xl font-bold text-sm shadow-sm transition cursor-pointer"
            >
              {isLoading ? 'Signing in...' : 'Sign In to Workspace →'}
            </button>
          </form>
        ) : (
          /* Patient Registration Form */
          <form onSubmit={handleRegisterSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-[#607368] mb-1.5 uppercase tracking-wider">Full Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Maria Santos"
                value={regFullName}
                onChange={e => setRegFullName(e.target.value)}
                className="w-full border border-[#d4e2dc] rounded-2xl p-3.5 text-sm bg-[#f5f7f6] focus:outline-none focus:border-[#164e43]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#607368] mb-1.5 uppercase tracking-wider">Desired Username</label>
              <input
                type="text"
                required
                placeholder="e.g. mariasantos"
                value={regUsername}
                onChange={e => setRegUsername(e.target.value)}
                className="w-full border border-[#d4e2dc] rounded-2xl p-3.5 text-sm bg-[#f5f7f6] focus:outline-none focus:border-[#164e43]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#607368] mb-1.5 uppercase tracking-wider">Password</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={regPassword}
                onChange={e => setRegPassword(e.target.value)}
                className="w-full border border-[#d4e2dc] rounded-2xl p-3.5 text-sm bg-[#f5f7f6] focus:outline-none focus:border-[#164e43]"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#164e43] hover:bg-[#0f362e] text-white py-4 rounded-2xl font-bold text-sm shadow-sm transition cursor-pointer mt-2"
            >
              {isLoading ? 'Creating Account...' : 'Register Patient Account →'}
            </button>
          </form>
        )}

      </div>
    </div>
  );
}