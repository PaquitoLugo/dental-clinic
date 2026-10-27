import { useState } from 'react';
import emailjs from '@emailjs/browser';
import { supabase } from '../lib/supabase';
import RegisterModal from '../components/RegisterModal';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState(''); // Serves as Username or Email
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);

  // Forgot Password Modal State
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  // 1. LOGIN HANDLER (Supports both Username and Email)
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setIsLoading(true);

    try {
      const inputVal = username.trim().toLowerCase();
      const { data, error } = await supabase.functions.invoke('staff-login', {
        body: { username: inputVal, password: password.trim() },
      });

      if (error || !data) {
        throw new Error(error?.message || 'Authentication service is unavailable.');
      }

      if (!data.ok) {
        const messages = {
          INVALID_CREDENTIALS: 'Invalid username/email or password. Please check your credentials.',
          ARCHIVED: 'This account is archived. Please contact the clinic manager for assistance.',
          PENDING: 'Your account is still waiting for verification by the clinic manager. Please try again later.',
          REJECTED: 'Your registration was not approved. Please contact the clinic for assistance.',
          RATE_LIMITED: 'Too many sign-in attempts. Please wait 15 minutes before trying again.',
        };
        setErrorMsg(messages[data.code] || 'Authentication service is unavailable. Please try again later.');
        return;
      }

      const { error: sessionError } = await supabase.auth.setSession(data.session);
      if (sessionError) throw sessionError;
      onLogin(data.user.role, data.user.full_name, data.user.id);
    } catch (err) {
      console.error('Staff sign-in failed:', err);
      setErrorMsg('Sign-in is temporarily unavailable. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  // 2. FORGOT PASSWORD HANDLER (Sends reset token link to user email)
  const handleSendResetLink = async (e) => {
    e.preventDefault();
    setForgotError('');
    setForgotSuccess('');
    setIsResetting(true);

    try {
      const inputVal = resetEmail.trim().toLowerCase();

      // Find user by email or username
      const { data: user, error } = await supabase
        .from('staff_users')
        .select('id, email, username, full_name')
        .or(`email.eq.${inputVal},username.eq.${inputVal}`)
        .maybeSingle();

      if (error || !user || !user.email) {
        setForgotError('No account found with that username or email, or no email address is attached to this account.');
        return;
      }

      // Generate token and 15-minute expiration timestamp
      const resetToken = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      // Save token to Supabase
      const { error: updateError } = await supabase
        .from('staff_users')
        .update({
          reset_token: resetToken,
          reset_token_expires_at: expiresAt
        })
        .eq('id', user.id);

      if (updateError) throw updateError;

      // Construct Reset Link
      const resetLink = `${window.location.origin}?resetToken=${resetToken}`;

      // Send Email via EmailJS
      const response = await emailjs.send(
        'service_0cds2eo',
        'template_5svch7f',
        {
          to_email: user.email,
          to_name: user.full_name || user.username,
          reset_link: resetLink,
        },
        'zuGkiLgb_lQ8-D6fJ'
      );

      console.log('EMAILJS SUCCESS:', response.status, response.text);
      setForgotSuccess(`Reset link sent to ${user.email}! Please check your inbox.`);
      setTimeout(() => {
        setIsForgotOpen(false);
        setResetEmail('');
        setForgotSuccess('');
      }, 4000);
    } catch (err) {
      console.error('EMAILJS ERROR DETAILS:', err);
      const detail = err?.text || err?.message || 'Check browser console for details.';
      setForgotError(`Failed to send email: ${detail}`);
    } finally {
      setIsResetting(false);
    }
  };

  const handleRegistrationSuccess = (newUsername) => {
    setUsername(newUsername);
    setPassword('');
    setSuccessMsg('Registration submitted! The clinic manager will verify your details. You can sign in once your account is approved.');
  };

  return (
    <div className="min-h-full w-full flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-[480px] bg-white border border-[#d4e2dc] rounded-2xl sm:rounded-3xl p-6 sm:p-10 shadow-md">
        
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
            <label className="block text-xs font-bold text-[#607368] mb-2 uppercase tracking-wider">
              Username or Email
            </label>
            <input
              type="text"
              required
              placeholder="Enter your username or email"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full border border-[#d4e2dc] rounded-2xl p-4 text-sm bg-[#f5f7f6] focus:outline-none focus:border-[#164e43]"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-xs font-bold text-[#607368] uppercase tracking-wider">Password</label>
            </div>
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
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
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
                        <button
                type="button"
                onClick={() => {
                  setForgotError('');
                  setForgotSuccess('');
                  setIsForgotOpen(true);
                }}
                className="text-xs font-bold text-[#164e43] hover:underline cursor-pointer"
              >
                Forgot password?
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

      {/* Forgot Password Modal */}
      {isForgotOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-[#d4e2dc] rounded-2xl sm:rounded-3xl p-5 sm:p-8 w-full max-w-[420px] max-h-[90dvh] overflow-y-auto shadow-xl relative">
            <button
              onClick={() => setIsForgotOpen(false)}
              className="absolute right-6 top-6 text-[#607368] hover:text-[#13241b] text-xl font-bold cursor-pointer"
            >
              ✕
            </button>

            <h3 className="text-xl font-black text-[#13241b] mb-1">Reset Password</h3>
            <p className="text-xs text-[#607368] mb-6 font-medium">
              Enter your email address or username. We will send a link to reset your password.
            </p>

            {forgotError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-xl mb-4 font-medium">
                ⚠️ {forgotError}
              </div>
            )}

            {forgotSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-700 text-xs p-3 rounded-xl mb-4 font-medium">
                ✓ {forgotSuccess}
              </div>
            )}

            <form onSubmit={handleSendResetLink} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#607368] mb-1 uppercase tracking-wider">Email or Username</label>
                <input
                  type="text"
                  required
                  placeholder="name@example.com or username"
                  value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                  className="w-full border border-[#d4e2dc] rounded-2xl p-3 text-sm bg-[#f5f7f6] focus:outline-none focus:border-[#164e43]"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsForgotOpen(false)}
                  className="w-1/2 bg-[#f5f7f6] hover:bg-[#e3ede6] text-[#607368] font-bold py-3 rounded-2xl text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isResetting}
                  className="w-1/2 bg-[#164e43] hover:bg-[#0f362e] text-white font-bold py-3 rounded-2xl text-xs transition cursor-pointer"
                >
                  {isResetting ? 'Sending Link...' : 'Send Reset Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Full Patient Registration Modal */}
      <RegisterModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        onSuccess={handleRegistrationSuccess}
      />
    </div>
  );
}