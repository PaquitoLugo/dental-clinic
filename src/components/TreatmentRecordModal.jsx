import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { recordActivity } from '../lib/activityLog';

const fieldClass = 'w-full border border-[#d4e2dc] rounded-xl p-3 text-xs bg-[#f5f7f6] focus:outline-none focus:border-[#164e43]';
const labelClass = 'block text-xs font-bold text-[#13241b] mb-1';

/**
 * Doctor's treatment notes / prescription for one appointment.
 *  - canEdit true  (dentist): form, saved to treatment_records
 *  - canEdit false (assistant / patient): read-only view
 */
export default function TreatmentRecordModal({ appointment, record, canEdit = false, issuedBy = '', activityUser, onClose, onSaved }) {
  const [notes, setNotes] = useState(record?.notes || '');
  const [prescription, setPrescription] = useState(record?.prescription || '');
  const [followUp, setFollowUp] = useState(record?.follow_up || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async (e) => {
    e.preventDefault();
    if (!notes.trim() && !prescription.trim()) {
      setError('Enter treatment notes or a prescription. At least one is required before this visit can be marked as done.');
      return;
    }
    setSaving(true);
    setError('');
    const now = new Date().toISOString();
    const { error: err } = await supabase.from('treatment_records').upsert({
      appointment_id: String(appointment.id),
      patient_name: appointment.patient_name,
      dentist_name: issuedBy || appointment.assigned_dentist || null,
      notes: notes.trim() || null,
      prescription: prescription.trim() || null,
      follow_up: followUp.trim() || null,
      issued_at: record?.issued_at || now,
      updated_at: now,
    }, { onConflict: 'appointment_id' });
    setSaving(false);
    if (err) {
      setError(`Could not save: ${err.message}. If the table is missing, run supabase_migration.sql.`);
      return;
    }
    await recordActivity(activityUser, {
      action: `${record ? 'Updated' : 'Issued'} treatment record for ${appointment.patient_name}`,
      entityType: 'treatment_record', entityId: appointment.id,
      details: { service_name: appointment.service_name }
    });
    onSaved?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl border border-[#d4e2dc] shadow-xl">
        <div className="flex items-start justify-between p-6 border-b border-[#d4e2dc]">
          <div>
            <h3 className="font-black text-lg text-[#13241b]">Treatment Notes &amp; Prescription</h3>
            <p className="text-xs text-[#607368] mt-1">
              {appointment.patient_name} · {appointment.service_name} · {appointment.appointment_date}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-[#607368] hover:text-[#13241b] font-black text-lg cursor-pointer px-2">×</button>
        </div>

        {canEdit ? (
          <form onSubmit={save} className="p-6 space-y-4">
            {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-xl font-bold">⚠️ {error}</div>}
            <div>
              <label className={labelClass}>Treatment notes (procedure done, findings)</label>
              <textarea rows={4} className={fieldClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Simple extraction of tooth 36 under local anesthesia. No complications." />
            </div>
            <div>
              <label className={labelClass}>Prescription</label>
              <textarea rows={4} className={fieldClass} value={prescription} onChange={(e) => setPrescription(e.target.value)} placeholder={'e.g. Amoxicillin 500 mg, 1 capsule every 8 hours for 7 days\nMefenamic acid 500 mg every 6 hours as needed for pain'} />
            </div>
            <div>
              <label className={labelClass}>Follow-up / aftercare (optional)</label>
              <input className={fieldClass} value={followUp} onChange={(e) => setFollowUp(e.target.value)} placeholder="e.g. Return in 1 week for check-up" />
            </div>
            <div className="flex gap-3 pt-2 border-t border-[#f0f5f2]">
              <button type="button" onClick={onClose} className="bg-white border border-[#d4e2dc] text-[#13241b] px-5 py-2.5 rounded-xl font-bold text-xs cursor-pointer">Cancel</button>
              <button type="submit" disabled={saving} className="bg-[#164e43] hover:bg-[#0f362e] text-white px-6 py-2.5 rounded-xl font-bold text-xs cursor-pointer disabled:opacity-60">
                {saving ? 'Saving...' : record ? 'Update record' : 'Issue record'}
              </button>
            </div>
          </form>
        ) : (
          <div className="p-6 space-y-4 text-xs">
            {record ? (
              <>
                {[['Treatment notes', record.notes], ['Prescription', record.prescription], ['Follow-up / aftercare', record.follow_up]].map(([title, text]) => (
                  <div key={title}>
                    <span className="block font-bold text-[#607368] mb-1">{title}</span>
                    <p className="whitespace-pre-wrap bg-[#f8faf9] border border-[#e5ece8] rounded-xl p-3 text-[#13241b]">{text || 'None'}</p>
                  </div>
                ))}
                <p className="text-[11px] text-[#607368]">
                  Issued by {record.dentist_name || 'the dentist'} on {new Date(record.issued_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </>
            ) : (
              <p className="text-[#607368]">The dentist has not issued notes or a prescription for this visit yet.</p>
            )}
            <button type="button" onClick={onClose} className="bg-[#164e43] text-white px-5 py-2.5 rounded-xl font-bold text-xs cursor-pointer">Close</button>
          </div>
        )}
      </div>
    </div>
  );
}
