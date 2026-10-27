import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { recordActivity } from '../lib/activityLog';

export default function ManagerUserApprovals({ user }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const loadPendingAccounts = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    const { data, error } = await supabase.from('staff_users')
      .select('id, full_name, username, email, mobile_number, birthdate, sex, is_guardian, guardian_name, guardian_relationship, guardian_contact')
      .eq('role', 'patient')
      .ilike('account_status', 'pending')
      .is('archived_at', null)
      .order('full_name', { ascending: true });

    if (error) {
      setErrorMessage(`Could not load pending user approvals: ${error.message}`);
    } else {
      setAccounts(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadPendingAccounts, 0);
    return () => window.clearTimeout(timer);
  }, [loadPendingAccounts]);

  const decideAccount = async (account, decision) => {
    setUpdatingId(account.id);
    setMessage('');
    setErrorMessage('');
    const { data: updatedAccount, error } = await supabase.from('staff_users')
      .update({
        account_status: decision,
        verified_at: decision === 'Approved' ? new Date().toISOString() : null,
      })
      .eq('id', account.id)
      .ilike('account_status', 'pending')
      .select('id')
      .maybeSingle();

    if (error) {
      setErrorMessage(`Could not ${decision === 'Approved' ? 'approve' : 'reject'} ${account.full_name}'s account: ${error.message}`);
      setUpdatingId(null);
      return;
    }
    if (!updatedAccount) {
      setErrorMessage(`${account.full_name}'s account is no longer pending. Refresh the approvals list.`);
      await loadPendingAccounts();
      setUpdatingId(null);
      return;
    }

    const logged = await recordActivity(user, {
      action: `${decision === 'Approved' ? 'Approved' : 'Rejected'} patient account: ${account.full_name}`,
      entityType: 'staff_user',
      entityId: account.id,
    });
    setAccounts((previous) => previous.filter((item) => item.id !== account.id));
    setMessage(logged
      ? `${account.full_name}'s account was ${decision === 'Approved' ? 'approved' : 'rejected'}.`
      : `${account.full_name}'s account was updated, but its activity log could not be recorded.`);
    setUpdatingId(null);
  };

  return (
    <div className="flex-1 overflow-y-auto space-y-6 p-2">
      <header>
        <h2 className="font-black text-2xl text-[#13241b]">User Approvals</h2>
        <p className="mt-1 text-xs text-[#607368]">Review new patient accounts separately from ongoing user management.</p>
      </header>

      {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-bold text-emerald-800">{message}</p>}
      {errorMessage && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs font-bold text-red-800">{errorMessage}</p>}

      <section className="rounded-2xl border border-[#d4e2dc] bg-white p-6 shadow-2xs">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-black text-base text-[#13241b]">Pending patient accounts</h3>
            <p className="text-[11px] text-[#607368]">{accounts.length} awaiting review</p>
          </div>
          <button type="button" onClick={loadPendingAccounts} disabled={loading} className="rounded-xl border border-[#d4e2dc] px-3 py-2 text-xs font-bold text-[#164e43] disabled:opacity-50">
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {loading ? (
          <p className="py-8 text-center text-xs font-semibold text-[#607368]">Loading pending accounts…</p>
        ) : accounts.length === 0 ? (
          <p className="py-8 text-center text-xs font-semibold text-[#607368]">There are no patient accounts awaiting approval.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead>
                <tr className="border-b border-[#d4e2dc] text-[11px] font-bold uppercase text-[#607368]">
                  <th className="px-2 py-3">Patient</th>
                  <th className="px-2 py-3">Contact</th>
                  <th className="px-2 py-3">Birth date / Sex</th>
                  <th className="px-2 py-3">Guardian</th>
                  <th className="px-2 py-3 text-right">Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f5f2]">
                {accounts.map((account) => (
                  <tr key={account.id} className="align-top hover:bg-[#f8faf9]">
                    <td className="px-2 py-3">
                      <div className="font-bold text-[#13241b]">{account.full_name || 'Name not provided'}</div>
                      <div className="text-[#607368]">@{account.username}</div>
                    </td>
                    <td className="px-2 py-3 text-[#607368]">
                      <div>{account.mobile_number || 'No phone number'}</div>
                      <div>{account.email || 'No email'}</div>
                    </td>
                    <td className="px-2 py-3 text-[#607368]">{account.birthdate || 'N/A'}{account.sex ? ` · ${account.sex}` : ''}</td>
                    <td className="px-2 py-3 text-[#607368]">
                      {account.is_guardian
                        ? <>{account.guardian_name || 'Guardian'}{account.guardian_relationship ? ` · ${account.guardian_relationship}` : ''}<div>{account.guardian_contact || ''}</div></>
                        : 'No'}
                    </td>
                    <td className="space-x-2 whitespace-nowrap px-2 py-3 text-right">
                      <button type="button" onClick={() => decideAccount(account, 'Approved')} disabled={updatingId === account.id} className="rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white disabled:opacity-50">
                        {updatingId === account.id ? 'Saving…' : 'Approve'}
                      </button>
                      <button type="button" onClick={() => decideAccount(account, 'Rejected')} disabled={updatingId === account.id} className="rounded-lg border border-red-200 px-3 py-1.5 font-bold text-red-700 disabled:opacity-50">
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
