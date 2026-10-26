import React, { useState, useEffect } from 'react';
import bcrypt from 'bcryptjs';
import { supabase } from '../lib/supabase';

export default function ResetPassword({ token, onComplete }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [userId, setUserId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isVerifying, setIsVerifying] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validate token on load
  useEffect(() => {
    async function verifyToken() {
      const { data, error } = await supabase
        .from('staff_users')
        .select('id, reset_token_expires_at')
        .eq('reset_token', token)
        .maybeSingle();

      if (error || !data) {
        setErrorMsg('Invalid or expired password reset link.');
      } else if (new Date(data.reset_token_expires_at) < new Date()) {
        setErrorMsg('This reset link has expired. Please request a new one.');
      } else {
        setUserId(data.id);
      }
      setIsVerifying(false);
    }
    verifyToken();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword.trim(), 6);

      // Update password and clear reset token
      const { error } = await supabase
        .from('staff_users')
        .update({
          password: hashedPassword,
          reset_token: null,
          reset_token_expires_at: null,
        })
        .eq('id', userId);

      if (error) throw error;

      setSuccessMsg('Password updated successfully! Redirecting to login...');
      setTimeout(() => onComplete(), 2500);
    } catch (err) {
      setErrorMsg('Failed to update password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isVerifying) return <div className="text-center p-8">Verifying link...</div>;

  return (
    <div className="h-full w-full flex items-center justify-center p-8">
      <div className="w-[420px] bg-white border border-[#d4e2dc] rounded-3xl p-8 shadow-md">
        <h2 className="font-black text-2xl text-[#13241b] mb-2">Set New Password</h2>
        <p className="text-xs text-[#607368] mb-6 font-medium">Please enter your new password below.</p>

        {errorMsg && <div className="bg-red-50 text-red-700 text-xs p-3 rounded-xl mb-4 font-medium">⚠️ {errorMsg}</div>}
        {successMsg && <div className="bg-green-50 text-green-700 text-xs p-3 rounded-xl mb-4 font-medium">✓ {successMsg}</div>}

        {!successMsg && userId && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-[#607368] mb-1 uppercase">New Password</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full border border-[#d4e2dc] rounded-2xl p-3 text-sm bg-[#f5f7f6]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#607368] mb-1 uppercase">Confirm Password</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full border border-[#d4e2dc] rounded-2xl p-3 text-sm bg-[#f5f7f6]"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-[#164e43] text-white py-3 rounded-2xl font-bold text-xs"
            >
              {isSubmitting ? 'Updating...' : 'Update Password →'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}