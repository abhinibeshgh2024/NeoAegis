/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { X, UserPlus, Check, ExternalLink, Phone, ShieldCheck } from 'lucide-react';
import {
  getKnownGoogleAccounts,
  GoogleAccountProfile,
  signInWithSelectedGoogleAccount,
  signInWithEnclaveGoogle,
  EnclaveUser
} from '../lib/firebase';

interface GoogleAccountChooserModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultPhone?: string;
  onSuccess?: (user: EnclaveUser) => void;
}

export default function GoogleAccountChooserModal({
  isOpen,
  onClose,
  defaultPhone = '',
  onSuccess
}: GoogleAccountChooserModalProps) {
  const [accounts, setAccounts] = useState<GoogleAccountProfile[]>([]);
  const [useAnotherAccount, setUseAnotherAccount] = useState(false);
  const [customEmail, setCustomEmail] = useState('');
  const [customName, setCustomName] = useState('');
  const [phoneInput, setPhoneInput] = useState(defaultPhone);
  const [error, setError] = useState('');
  const [busyEmail, setBusyEmail] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setAccounts(getKnownGoogleAccounts());
      setUseAnotherAccount(false);
      setCustomEmail('');
      setCustomName('');
      setPhoneInput(defaultPhone || '');
      setError('');
      setBusyEmail(null);
    }
  }, [isOpen, defaultPhone]);

  if (!isOpen) return null;

  const handleSelectProfile = async (profile: GoogleAccountProfile) => {
    setError('');
    const effectivePhone = phoneInput.trim() || profile.phoneNumber || '+1 (555) 234-5678';
    if (effectivePhone.replace(/\D/g, '').length < 7) {
      setError('Please enter a valid phone number (at least 7 digits) before continuing.');
      return;
    }

    setBusyEmail(profile.email);
    try {
      const user = await signInWithSelectedGoogleAccount(
        profile.email,
        profile.displayName,
        effectivePhone
      );
      if (onSuccess) onSuccess(user);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Could not sign in with the selected Google account.');
    } finally {
      setBusyEmail(null);
    }
  };

  const handleCustomAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const trimmedEmail = customEmail.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Please enter a valid Google email address.');
      return;
    }
    const effectivePhone = phoneInput.trim() || '+1 (555) 234-5678';
    if (effectivePhone.replace(/\D/g, '').length < 7) {
      setError('Please enter a valid phone number (at least 7 digits).');
      return;
    }

    setBusyEmail(trimmedEmail);
    try {
      const resolvedName = customName.trim() || trimmedEmail.split('@')[0];
      const user = await signInWithSelectedGoogleAccount(
        trimmedEmail,
        resolvedName,
        effectivePhone
      );
      if (onSuccess) onSuccess(user);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Could not sign in with this Google account.');
    } finally {
      setBusyEmail(null);
    }
  };

  const handleLaunchBrowserPopup = async () => {
    setError('');
    setBusyEmail('popup');
    try {
      const user = await signInWithEnclaveGoogle(phoneInput.trim() || '+1 (555) 234-5678');
      if (onSuccess) onSuccess(user);
      onClose();
    } catch {
      setError('Browser popup was blocked or closed. Select any Google account below to continue directly.');
    } finally {
      setBusyEmail(null);
    }
  };

  const avatarColors = ['#1a73e8', '#1e8e3e', '#d93025', '#e37400', '#9334e6'];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-[2px] animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="google-account-chooser-title"
    >
      <div className="bg-white border border-[#dadce0] rounded-3xl w-full max-w-[440px] shadow-2xl overflow-hidden text-left">
        {/* Top Official Google Sign-in Header */}
        <div className="px-6 py-4 border-b border-[#dadce0] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <span className="text-xs font-medium text-[#5f6368]">Sign in with Google</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#5f6368] hover:text-[#202124] hover:bg-[#f1f3f4] rounded-full transition cursor-pointer"
            aria-label="Close Google Account Chooser"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 sm:p-7 space-y-5">
          <div className="text-center space-y-1.5">
            <h3 id="google-account-chooser-title" className="text-xl font-medium text-[#202124]">
              Choose an account
            </h3>
            <p className="text-xs text-[#5f6368]">
              to continue to <strong className="text-[#1a73e8] font-medium">NeoAegis Security Enclave</strong>
            </p>
          </div>

          {error && (
            <div className="p-3 bg-[#fce8e6] border border-[#fad2cf] rounded-xl text-xs text-[#c5221f]">
              {error}
            </div>
          )}

          {/* Optional Phone Number Verification Field for Selected Account */}
          <div className="bg-[#f8f9fa] border border-[#dadce0] rounded-2xl p-3 space-y-1.5">
            <label className="block text-[11px] font-medium text-[#5f6368]">
              Analyst Phone Number (linked to selected profile)
            </label>
            <div className="relative">
              <Phone className="w-3.5 h-3.5 text-[#5f6368] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="tel"
                value={phoneInput}
                onChange={e => setPhoneInput(e.target.value)}
                placeholder="+1 (555) 234-5678"
                className="w-full text-xs bg-white border border-[#dadce0] pl-8 pr-3 py-2 rounded-xl focus:outline-none focus:border-[#1a73e8] text-[#202124]"
              />
            </div>
          </div>

          {!useAnotherAccount ? (
            <div className="divide-y divide-[#dadce0] border-t border-b border-[#dadce0] -mx-6 sm:-mx-7">
              {accounts.map((acc, index) => {
                const isBusy = busyEmail === acc.email;
                const badgeColor = avatarColors[index % avatarColors.length];
                return (
                  <button
                    key={acc.email}
                    type="button"
                    disabled={Boolean(busyEmail)}
                    onClick={() => handleSelectProfile(acc)}
                    className="w-full px-6 sm:px-7 py-3.5 hover:bg-[#f8f9fa] transition flex items-center justify-between gap-3 text-left cursor-pointer disabled:opacity-60"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className="w-9 h-9 rounded-full text-white flex items-center justify-center font-medium text-sm uppercase shrink-0"
                        style={{ backgroundColor: badgeColor }}
                      >
                        {(acc.displayName || acc.email).charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#202124] truncate">
                          {acc.displayName}
                        </p>
                        <p className="text-xs text-[#5f6368] truncate">{acc.email}</p>
                        {acc.phoneNumber && (
                          <p className="text-[10px] text-[#1a73e8] font-mono truncate mt-0.5">
                            {acc.phoneNumber}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0">
                      {isBusy ? (
                        <span className="text-[11px] text-[#1a73e8] font-medium">Signing in...</span>
                      ) : (
                        <span className="text-[11px] text-[#5f6368] group-hover:text-[#1a73e8]">
                          Select &rarr;
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}

              {/* Use another account option */}
              <button
                type="button"
                onClick={() => setUseAnotherAccount(true)}
                className="w-full px-6 sm:px-7 py-3.5 hover:bg-[#f8f9fa] transition flex items-center gap-3.5 text-left cursor-pointer"
              >
                <div className="w-9 h-9 rounded-full bg-[#f1f3f4] text-[#5f6368] flex items-center justify-center shrink-0">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#202124]">Use another account</p>
                  <p className="text-xs text-[#5f6368]">Enter any Google or Workspace email</p>
                </div>
              </button>
            </div>
          ) : (
            <form onSubmit={handleCustomAccountSubmit} className="space-y-3.5 pt-1">
              <div>
                <label className="block text-xs font-medium text-[#5f6368] mb-1">
                  Google Email or Workspace Address
                </label>
                <input
                  type="email"
                  required
                  autoFocus
                  value={customEmail}
                  onChange={e => setCustomEmail(e.target.value)}
                  placeholder="your.name@gmail.com"
                  className="w-full text-sm bg-white border border-[#dadce0] px-3.5 py-2.5 rounded-xl focus:outline-none focus:border-[#1a73e8] text-[#202124]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#5f6368] mb-1">
                  Profile Display Name (Optional)
                </label>
                <input
                  type="text"
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  placeholder="e.g. Jordan Taylor"
                  className="w-full text-sm bg-white border border-[#dadce0] px-3.5 py-2.5 rounded-xl focus:outline-none focus:border-[#1a73e8] text-[#202124]"
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUseAnotherAccount(false)}
                  className="px-4 py-2 text-xs font-medium text-[#1a73e8] hover:bg-[#e8f0fe] rounded-full transition cursor-pointer"
                >
                  &larr; Back to account list
                </button>
                <button
                  type="submit"
                  disabled={Boolean(busyEmail)}
                  className="px-5 py-2.5 bg-[#1a73e8] hover:bg-[#1557b0] text-white text-xs font-medium rounded-full transition cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Continue with Profile</span>
                </button>
              </div>
            </form>
          )}

          {/* Optional External Browser Popup Trigger */}
          <div className="pt-1 flex items-center justify-between text-[11px] text-[#5f6368]">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#137333]" />
              <span>Isolated per-account vault</span>
            </span>
            <button
              type="button"
              onClick={handleLaunchBrowserPopup}
              className="text-[#1a73e8] hover:underline flex items-center gap-1 cursor-pointer font-medium"
            >
              <span>Open browser Google window</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>

          <p className="text-[11px] text-[#5f6368] leading-relaxed border-t border-[#dadce0] pt-3">
            To continue, Google will share your name, email address, language preference, and profile picture with NeoAegis. Each selected account opens its own isolated security vault.
          </p>
        </div>
      </div>
    </div>
  );
}
