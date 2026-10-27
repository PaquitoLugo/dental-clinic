import React, { useState, useEffect } from 'react';
import bcrypt from 'bcryptjs';
import { supabase } from '../lib/supabase';

export default function ResetPassword({ token, onComplete }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [userId, setUserId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isVerifying, setIsVerifying] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. Validate token on load
  useEffect(() => {
    async function verifyToken() {
      // Early exit if no token is present in URL
      if (!token) {
        setErrorMsg('No reset token provided.');
        setIsVerifying(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('staff_users')
          .select('id, reset_token_expires_at')
          .eq('reset_token', token)
          .maybeSingle();

        if (error || !data) {
          setErrorMsg('Invalid or expired password reset link.');
        } else if (new Date(data.reset_token_expires_at) < new Date()) {
          setErrorMsg('This reset link has expired. Please request a new one from the login page.');
        } else {
          setUserId(data.id);
        }
      } catch (err) {
        setErrorMsg('Failed to verify reset link.');
      } finally {
        setIsVerifying(false);
      }
    }

    verifyToken();
  }, [token]);

  // 2. Password Reset Submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(''); // Clear previous error messages
    setSuccessMsg('');

    if (!newPassword) {
      setErrorMsg('Password is required.');
      return;
    }
    if (newPassword.length < 12) {
      setErrorMsg('Password must be at least 12 characters.');
      return;
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      setErrorMsg('Password must include uppercase, lowercase, number, and special character.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    if (!userId) {
      setErrorMsg('Invalid session. Please request a new link.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Hash new password using bcrypt
      const hashedPassword = await bcrypt.hash(newPassword.trim(), 6);

      // Update password and clear the reset token in Supabase
      const { error } = await supabase
        .from('staff_users')
        .update({
          password: hashedPassword,
          reset_token: null,
          reset_token_expires_at: null,
        })
        .eq('id', userId);

      if (error) throw error;

      setSuccessMsg('Password updated successfully! Redirecting to sign in...');
      setTimeout(() => onComplete(), 2500);
    } catch (err) {
      setErrorMsg('Failed to update password. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-8 bg-[#f5f7f6]">
      <div className="w-[420px] bg-white border border-[#d4e2dc] rounded-3xl p-8 shadow-md">
        
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-[#164e43] text-white flex items-center justify-center font-bold text-2xl mx-auto mb-3 shadow-xs">
            🔑
          </div>
          <h2 className="font-black text-2xl text-[#13241b] tracking-tight">Set New Password</h2>
          <p className="text-xs font-semibold text-[#607368] mt-1">
            {isVerifying ? 'Verifying your reset link...' : 'Please enter your new password below.'}
          </p>
        </div>

        {/* Loading Spinner / State */}
        {isVerifying ? (
          <div className="py-8 text-center text-xs font-bold text-[#607368] animate-pulse">
            Checking token validity...
          </div>
        ) : (
          <>
            {errorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3.5 rounded-2xl mb-4 font-medium">
                ⚠️ {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="bg-green-50 border border-green-200 text-green-700 text-xs p-3.5 rounded-2xl mb-4 font-medium">
                ✓ {successMsg}
              </div>
            )}

            {!successMsg && userId && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#607368] mb-1.5 uppercase tracking-wider">New Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="••••••••"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="w-full border border-[#d4e2dc] rounded-2xl p-3.5 pr-12 text-sm bg-[#f5f7f6] focus:outline-none focus:border-[#164e43]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-[#607368] hover:text-[#164e43] p-1 cursor-pointer"
                    >
                      {showPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#607368] mb-1.5 uppercase tracking-wider">Confirm Password</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full border border-[#d4e2dc] rounded-2xl p-3.5 text-sm bg-[#f5f7f6] focus:outline-none focus:border-[#164e43]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-[#164e43] hover:bg-[#0f362e] text-white py-3.5 rounded-2xl font-bold text-xs shadow-xs transition cursor-pointer"
                >
                  {isSubmitting ? 'Updating Password...' : 'Update Password →'}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}