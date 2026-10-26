import React, { useEffect, useState } from 'react';

/**
 * In-app replacement for the browser's alert(), confirm() and prompt().
 *
 *   import { dialog } from '../components/DialogHost';
 *   await dialog.alert('Saved!', { title: 'Success', variant: 'success' });
 *   if (await dialog.confirm('Delete this?', { variant: 'danger', confirmText: 'Delete' })) { ... }
 *   const reason = await dialog.prompt('Reason?', { placeholder: 'Optional' });   // null when cancelled
 *
 * Mount <DialogHost /> once (in App.jsx). If it is not mounted, the calls fall back to the browser dialogs.
 */

let enqueue = null;

export const dialog = {
  alert(message, options = {}) {
    if (!enqueue) { window.alert(message); return Promise.resolve(); }
    return new Promise((resolve) => enqueue({ type: 'alert', message, options, resolve }));
  },
  confirm(message, options = {}) {
    if (!enqueue) return Promise.resolve(window.confirm(message));
    return new Promise((resolve) => enqueue({ type: 'confirm', message, options, resolve }));
  },
  prompt(message, options = {}) {
    if (!enqueue) return Promise.resolve(window.prompt(message, options.defaultValue || ''));
    return new Promise((resolve) => enqueue({ type: 'prompt', message, options, resolve }));
  },
};

const VARIANTS = {
  info:    { icon: 'i', ring: 'bg-blue-50 text-blue-600',       title: 'Notice' },
  success: { icon: '✓', ring: 'bg-emerald-50 text-emerald-600', title: 'Success' },
  warning: { icon: '!', ring: 'bg-amber-50 text-amber-600',     title: 'Please confirm' },
  error:   { icon: '!', ring: 'bg-red-50 text-red-600',         title: 'Something went wrong' },
  danger:  { icon: '!', ring: 'bg-red-50 text-red-600',         title: 'Are you sure?' },
};

export default function DialogHost() {
  const [queue, setQueue] = useState([]);
  const [value, setValue] = useState('');
  const current = queue[0];

  useEffect(() => {
    enqueue = (item) => setQueue((q) => [...q, item]);
    return () => { enqueue = null; };
  }, []);

  useEffect(() => {
    if (current?.type === 'prompt') setValue(current.options.defaultValue || '');
  }, [current]);

  const cancelResult = (item) => (item.type === 'confirm' ? false : item.type === 'prompt' ? null : undefined);
  const close = (result) => {
    if (!current) return;
    current.resolve(result);
    setQueue((q) => q.slice(1));
  };

  useEffect(() => {
    if (!current) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(cancelResult(current)); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  if (!current) return null;

  const { type, message, options } = current;
  const variant = options.variant || (type === 'confirm' ? 'warning' : type === 'prompt' ? 'info' : 'info');
  const v = VARIANTS[variant] || VARIANTS.info;
  const title = options.title || (type === 'prompt' ? 'Enter a value' : v.title);
  const danger = variant === 'danger' || variant === 'error' || options.danger;
  const confirmText = options.confirmText || (type === 'alert' ? 'OK' : 'Confirm');

  const submit = (e) => {
    e.preventDefault();
    close(type === 'alert' ? undefined : type === 'confirm' ? true : value);
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget && type !== 'alert') close(cancelResult(current)); }}
    >
      <form
        onSubmit={submit}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className="bg-white w-full max-w-md rounded-3xl border border-[#d4e2dc] shadow-2xl p-6 space-y-4"
      >
        <div className="flex items-start gap-4">
          <div className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center font-black text-lg ${v.ring}`}>{v.icon}</div>
          <div className="min-w-0">
            <h3 id="dialog-title" className="font-black text-lg text-[#13241b]">{title}</h3>
            <p className="text-sm text-[#40584f] mt-1 whitespace-pre-line break-words">{message}</p>
          </div>
        </div>

        {type === 'prompt' && (
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={options.placeholder || ''}
            className="w-full border border-[#d4e2dc] rounded-xl p-3 text-sm bg-[#f5f7f6] focus:outline-none focus:border-[#164e43]"
          />
        )}

        <div className="flex justify-end gap-3 pt-1">
          {type !== 'alert' && (
            <button
              type="button"
              onClick={() => close(cancelResult(current))}
              className="bg-white border border-[#d4e2dc] text-[#13241b] px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-[#f5f7f6] cursor-pointer"
            >
              {options.cancelText || 'Cancel'}
            </button>
          )}
          <button
            type="submit"
            autoFocus={type !== 'prompt'}
            className={`${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#164e43] hover:bg-[#0f362e]'} text-white px-6 py-2.5 rounded-xl font-bold text-sm cursor-pointer`}
          >
            {confirmText}
          </button>
        </div>
      </form>
    </div>
  );
}
