/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  EnclaveUser,
  COUNTRY_DIAL_CODES,
  validateEmailRules,
  validatePasswordRules,
  validatePhoneRules,
  validateDobRules,
  calculateAgeFromDob,
  subscribeToAuthSession,
  signUpWithEnclaveEmail,
  signInWithEnclaveEmail,
  signInWithEnclaveGoogle,
  signOutEnclaveSession,
  fetchEnclaveUserData,
  saveEmailToEnclaveProfile,
  deleteEmailFromEnclaveProfile,
  logExportToEnclaveProfile,
  formatWorkingDuration
} from '../lib/firebase';
import { 
  User, Lock, Mail, LogOut, CheckCircle2, ShieldCheck, Clock, 
  Download, FileSpreadsheet, AlertTriangle, Sparkles, 
  Cpu, Network, GitMerge, FileText, BarChart3, Trash2, Database, Phone, Calendar
} from 'lucide-react';
import { EmailRecord } from '../../types';
import InfoButton from './InfoButton';

interface UserProfileProps {
  selectedEmail: EmailRecord | null;
  scannedEmailsList: EmailRecord[];
  onTriggerRefresh?: () => void;
  initialAuthMode?: 'login' | 'signup';
  workingSeconds?: number;
  emailsParsedCount?: number;
}

// 8-Dimensional Feature Keys for offline Vector Embeddings
const FEATURE_LABELS = [
  'Urgency Coefficient',
  'Financial Lure Indicator',
  'Authority Mimicry',
  'Link/Shortener Density',
  'Credential Harvesting Clues',
  'Social Engineering Sentiment',
  'Syntax Distortion Index',
  'Hidden Text Stuffing'
];

export default function UserProfile({ selectedEmail, scannedEmailsList, onTriggerRefresh, initialAuthMode, workingSeconds = 0, emailsParsedCount = 0 }: UserProfileProps) {
  const [user, setUser] = useState<EnclaveUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Authentication Fields
  const [isSignUp, setIsSignUp] = useState(initialAuthMode === 'signup');

  useEffect(() => {
    if (initialAuthMode) {
      setIsSignUp(initialAuthMode === 'signup');
    }
  }, [initialAuthMode]);
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState('IN');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');

  const selectedCountry =
    COUNTRY_DIAL_CODES.find(c => c.code === countryCode) || COUNTRY_DIAL_CODES[0];

  // Profile data fetched from Firestore / Enclave Vault
  const [userEmails, setUserEmails] = useState<any[]>([]);
  const [userExports, setUserExports] = useState<any[]>([]);
  const [dbLoading, setDbLoading] = useState(false);

  // Semantic Similarity / Embedding State
  const [activeVector, setActiveVector] = useState<number[]>([]);
  const [semanticMatches, setSemanticMatches] = useState<{ email: any; similarity: number; cluster: string }[]>([]);

  // Handle Authentication Status change
  useEffect(() => {
    const unsubscribe = subscribeToAuthSession((currentUser) => {
      setUser(currentUser);
      setLoading(false);
      if (currentUser) {
        fetchUserData(currentUser.uid);
      } else {
        setUserEmails([]);
        setUserExports([]);
      }
    });
    return unsubscribe;
  }, []);

  // Sync semantic embeddings when selected email updates
  useEffect(() => {
    if (selectedEmail && selectedEmail.body) {
      calculateLocalEmbeddings(selectedEmail.body, selectedEmail.subject);
    }
  }, [selectedEmail]);

  // Fetch saved records for logged-in user with zero-error fallback
  const fetchUserData = async (uid: string) => {
    setDbLoading(true);
    try {
      const { emails, exports } = await fetchEnclaveUserData(uid);
      setUserEmails(emails);
      setUserExports(exports);
    } finally {
      setDbLoading(false);
    }
  };

  // Log File Download / Export in User Profile History
  const logDataExport = async (fileName: string, recordCount: number, fileType: 'JSON' | 'CSV' | 'PDF') => {
    if (!user) return;
    await logExportToEnclaveProfile(user.uid, fileName, recordCount, fileType);
    await fetchUserData(user.uid);
    if (onTriggerRefresh) onTriggerRefresh();
  };

  // Sign up credentials check and validation
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');

    const emailErr = validateEmailRules(email);
    if (emailErr) {
      setAuthError(emailErr);
      return;
    }

    const phoneErr = validatePhoneRules(phoneNumber, selectedCountry);
    if (phoneErr) {
      setAuthError(phoneErr);
      return;
    }

    if (isSignUp) {
      const dobErr = validateDobRules(dateOfBirth);
      if (dobErr) {
        setAuthError(dobErr);
        return;
      }

      const passErr = validatePasswordRules(password);
      if (passErr) {
        setAuthError(passErr);
        return;
      }
    } else if (!password || password.length < 6) {
      setAuthError('Please enter your password.');
      return;
    }

    const formattedPhoneWithCode = `${selectedCountry.dial} ${phoneNumber.replace(/\D/g, '')}`;

    try {
      if (isSignUp) {
        await signUpWithEnclaveEmail(email, password, displayName, formattedPhoneWithCode, dateOfBirth);
        setAuthSuccess('Registration successful! Welcome to the secure enclave.');
      } else {
        await signInWithEnclaveEmail(email, password, formattedPhoneWithCode);
        setAuthSuccess('Sign in successful. Synchronizing secure files...');
      }
      setEmail('');
      setPhoneNumber('');
      setDateOfBirth('');
      setPassword('');
      setDisplayName('');
    } catch (err: any) {
      setAuthError(err.message || 'Authentication sequence failed.');
    }
  };

  // Firebase-based Google OAuth Login
  const handleGoogleSignIn = async () => {
    setAuthError('');
    setAuthSuccess('');
    try {
      const digits = phoneNumber.replace(/\D/g, '');
      const formattedPhone = digits ? `${selectedCountry.dial} ${digits}` : undefined;
      await signInWithEnclaveGoogle(formattedPhone);
      setAuthSuccess('Google session authorized and synced securely.');
    } catch (err: any) {
      setAuthError(err.message || 'Google authentication failed.');
    }
  };

  // Sign out session
  const handleLogout = async () => {
    await signOutEnclaveSession();
    setAuthSuccess('Logged out successfully.');
  };

  // Delete an individual saved record in Profile
  const deleteSavedEmailRecord = async (docId: string) => {
    if (!user) return;
    await deleteEmailFromEnclaveProfile(user.uid, docId);
    await fetchUserData(user.uid);
    if (onTriggerRefresh) onTriggerRefresh();
  };

  // Save the currently active analysis metrics to the User's Profile
  const saveSelectedEmailToProfile = async () => {
    if (!user || !selectedEmail) return;
    await saveEmailToEnclaveProfile(user.uid, selectedEmail);
    await fetchUserData(user.uid);
    if (onTriggerRefresh) onTriggerRefresh();
    setAuthSuccess('Email score and payload successfully cataloged in your secure profile!');
    setTimeout(() => setAuthSuccess(''), 4000);
  };

  // Export User Profile lists to a downloadable CSV / JSON file
  const handleDownloadReport = (type: 'JSON' | 'CSV') => {
    if (userEmails.length === 0) return;

    let content = '';
    let fileName = `neoaegis-threat-audit-${Date.now()}`;

    if (type === 'JSON') {
      content = JSON.stringify(userEmails, null, 2);
      fileName += '.json';
    } else {
      // CSV Export
      const headers = ['ID', 'Subject', 'Sender', 'Date', 'Spam Score', 'Phishing Likelihood'];
      const rows = userEmails.map(e => [
        `"${e.id}"`,
        `"${e.subject.replace(/"/g, '""')}"`,
        `"${e.sender}"`,
        `"${e.date}"`,
        e.spamScore,
        e.phishingLikelihood
      ]);
      content = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      fileName += '.csv';
    }

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Log this export to Firestore as required
    logDataExport(fileName, userEmails.length, type);
  };

  // ==========================================
  // Local Quantized Embedding & Cosine Similarity Matcher
  // ==========================================
  const calculateLocalEmbeddings = (bodyText: string, subjectText: string) => {
    const combined = (subjectText + ' ' + bodyText).toLowerCase();

    // 1. Generate 8-Dimensional Feature Weights (0.0 to 1.0) based on regex density
    const v = [
      /\b(urgent|immediate|action required|suspend|expired)\b/i.test(combined) ? 0.9 : 0.1, // Urgency
      /\b(invoice|bank|payment|wire|transfer|funds|balance)\b/i.test(combined) ? 0.85 : 0.15, // Financial
      /\b(ceo|director|president|admin|hr|executive|supervisor)\b/i.test(combined) ? 0.8 : 0.2, // Authority
      /(https?:\/\/[^\s]+)/g.test(combined) ? 0.95 : 0.05, // Link Density
      /\b(login|password|verify|credentials|authenticate|account)\b/i.test(combined) ? 0.9 : 0.1, // Credential Harvesting
      /\b(help|favor|task|confidential|discreet|secret)\b/i.test(combined) ? 0.75 : 0.25, // Social Engineering
      /[A-Z]{3,}/.test(subjectText) || /\b(!!|\?\?)\b/.test(combined) ? 0.7 : 0.3, // Syntax Distortion
      /style=["'][^"']*display:\s*none/i.test(combined) || /display:\s*none/i.test(combined) ? 1.0 : 0.0 // Hidden text stuffing
    ];

    setActiveVector(v);

    // 2. Compute Cosine Similarity against scanned historical database emails
    if (scannedEmailsList.length === 0) return;

    const matches: { email: any; similarity: number; cluster: string }[] = [];

    scannedEmailsList.forEach(histMail => {
      // Create comparison vector for historical email
      const hCombined = (histMail.subject + ' ' + histMail.body).toLowerCase();
      const hV = [
        /\b(urgent|immediate|action required|suspend|expired)\b/i.test(hCombined) ? 0.9 : 0.1,
        /\b(invoice|bank|payment|wire|transfer|funds|balance)\b/i.test(hCombined) ? 0.85 : 0.15,
        /\b(ceo|director|president|admin|hr|executive|supervisor)\b/i.test(hCombined) ? 0.8 : 0.2,
        /(https?:\/\/[^\s]+)/g.test(hCombined) ? 0.95 : 0.05,
        /\b(login|password|verify|credentials|authenticate|account)\b/i.test(hCombined) ? 0.9 : 0.1,
        /\b(help|favor|task|confidential|discreet|secret)\b/i.test(hCombined) ? 0.75 : 0.25,
        /[A-Z]{3,}/.test(histMail.subject) || /\b(!!|\?\?)\b/.test(hCombined) ? 0.7 : 0.3,
        /style=["'][^"']*display:\s*none/i.test(hCombined) || /display:\s*none/i.test(hCombined) ? 1.0 : 0.0
      ];

      // Math for Cosine Similarity: Dot Product / (Magnitude A * Magnitude B)
      let dotProduct = 0;
      let magA = 0;
      let magB = 0;

      for (let i = 0; i < 8; i++) {
        dotProduct += v[i] * hV[i];
        magA += v[i] * v[i];
        magB += hV[i] * hV[i];
      }

      magA = Math.sqrt(magA);
      magB = Math.sqrt(magB);

      const similarity = magA && magB ? Math.round((dotProduct / (magA * magB)) * 100) : 0;

      // Assign Cluster category based on dominant feature dimension
      let dominantIndex = 0;
      let maxVal = 0;
      for (let i = 0; i < 8; i++) {
        if (v[i] > maxVal) {
          maxVal = v[i];
          dominantIndex = i;
        }
      }

      const clusters = [
        'Cluster Alpha: Temporal Urgency Stuffing',
        'Cluster Beta: Financial Settlement/Lure Vectors',
        'Cluster Gamma: Impersonation & BEC Authority',
        'Cluster Delta: Hyperlink / Payload Delivery',
        'Cluster Epsilon: Account Credential Harvesting',
        'Cluster Zeta: Cognitive/Social Engineering',
        'Cluster Eta: Syntactic Capitalization Distortion',
        'Cluster Theta: Font-stuffed Sandbox Evasion'
      ];

      matches.push({
        email: histMail,
        similarity,
        cluster: clusters[dominantIndex]
      });
    });

    // Sort by highest similarity
    matches.sort((a, b) => b.similarity - a.similarity);
    setSemanticMatches(matches.slice(0, 3)); // show top 3 semantic matches
  };

  return (
    <div className="space-y-6 animate-fade-in" id="user-profile-enclave">
      
      {/* Header Info block */}
      <div className="bg-[#f8f9fa] border border-[#dadce0] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-2.5">
          <User className="w-5 h-5 text-[#1a73e8]" />
          <h2 className="text-base font-medium text-[#202124]">Analyst Profile Enclave</h2>
          <InfoButton
            title="Analyst Profile Enclave"
            description="Your isolated cloud vault for storing tested email records, threat scores, session telemetry, semantic vector clusters, and export logs."
            align="left"
          />
          <span className="px-2.5 py-0.5 bg-[#e6f4ea] text-[11px] font-medium text-[#137333] rounded-full">
            Cloud Sync Active
          </span>
        </div>
        {user && (
          <button 
            onClick={handleLogout}
            className="px-4 py-1.5 bg-white border border-[#dadce0] hover:bg-[#fce8e6] text-[#3c4043] hover:text-[#d93025] text-xs font-medium rounded-full transition flex items-center space-x-2 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        )}
      </div>

      {/* Auth State Feedback Alerts */}
      {authError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{authError}</span>
        </div>
      )}
      {authSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{authSuccess}</span>
        </div>
      )}

      {/* ========================================================== */}
      {/* AUTHENTICATION OVERLAY / FORM IF NOT LOGGED IN             */}
      {/* ========================================================== */}
      {!user && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 bg-white border border-[#dadce0] rounded-2xl p-6">
          
          <div className="md:col-span-5 space-y-4 text-left flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-[#1a73e8]">Authorization Gateway</h3>
                <InfoButton
                  title="Zero-Trust Isolation"
                  description="Data is isolated by UID server-side. Cross-user queries are blocked and session keys terminate immediately on sign out."
                  align="left"
                />
              </div>

              {/* Google POPUP sign-in */}
              <button
                onClick={handleGoogleSignIn}
                className="w-full py-2.5 bg-[#1a73e8] hover:bg-[#1557b0] text-white font-medium text-xs rounded-full transition flex items-center justify-center space-x-2 shadow-2xs cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Continue with Google</span>
              </button>
            </div>
          </div>

          <div className="md:col-span-7 border-t md:border-t-0 md:border-l border-slate-200 pt-6 md:pt-0 md:pl-6">
            <form onSubmit={handleAuthSubmit} className="space-y-4 text-left">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                  {isSignUp ? 'REGISTER ANALYST' : 'LOG IN TO VAULT'}
                </span>
                <button
                  type="button"
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-xs text-indigo-600 hover:underline font-bold"
                >
                  {isSignUp ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
                </button>
              </div>

              {isSignUp && (
                <div>
                  <label className="block text-[11px] font-mono text-slate-500 mb-1">ANALYST DISPNAME (OPTIONAL)</label>
                  <input 
                    type="text"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="e.g. Threat Analyst Alpha"
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-200 p-2.5 rounded-lg focus:outline-none focus:border-indigo-400"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-mono text-slate-500 mb-1">AUTHORIZED CORPORATE EMAIL</label>
                <input 
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@domain.com"
                  className="w-full text-xs font-mono bg-slate-50 border border-slate-200 p-2.5 rounded-lg focus:outline-none focus:border-indigo-400"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-mono text-slate-500">ANALYST PHONE NUMBER (WITH COUNTRY CODE)</label>
                  <span className="text-[10px] font-mono text-indigo-600">
                    {selectedCountry.minDigits} digits required
                  </span>
                </div>
                <div className="flex items-stretch gap-2">
                  <select
                    value={countryCode}
                    onChange={e => setCountryCode(e.target.value)}
                    aria-label="Country code selector"
                    className="text-xs font-mono bg-slate-50 border border-slate-200 px-2.5 py-2.5 rounded-lg focus:outline-none focus:border-indigo-400 cursor-pointer shrink-0"
                  >
                    {COUNTRY_DIAL_CODES.map(c => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.dial} ({c.code})
                      </option>
                    ))}
                  </select>
                  <input 
                    type="tel"
                    required
                    value={phoneNumber}
                    onChange={e => setPhoneNumber(e.target.value.replace(/[^\d\s-]/g, ''))}
                    placeholder={'9'.repeat(selectedCountry.minDigits)}
                    maxLength={selectedCountry.maxDigits + 3}
                    className="flex-1 text-xs font-mono bg-slate-50 border border-slate-200 p-2.5 rounded-lg focus:outline-none focus:border-indigo-400"
                  />
                </div>
              </div>

              {isSignUp && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-mono text-slate-500">DATE OF BIRTH (MINIMUM AGE 15+)</label>
                    {dateOfBirth && (
                      <span className={`text-[10px] font-mono font-bold ${
                        calculateAgeFromDob(dateOfBirth) >= 15 ? 'text-emerald-600' : 'text-red-600'
                      }`}>
                        Age: {Math.max(0, calculateAgeFromDob(dateOfBirth))} yrs
                      </span>
                    )}
                  </div>
                  <input
                    type="date"
                    required
                    value={dateOfBirth}
                    max={new Date().toISOString().split('T')[0]}
                    onChange={e => setDateOfBirth(e.target.value)}
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-200 p-2.5 rounded-lg focus:outline-none focus:border-indigo-400"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-mono text-slate-500 mb-1">
                  {isSignUp ? 'SECURE PASSWORD (8+ CHARS, UPPER, LOWER, DIGIT & SYMBOL)' : 'SECURE ENCLAVE PASSWORD'}
                </label>
                <input 
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full text-xs font-mono bg-slate-50 border border-slate-200 p-2.5 rounded-lg focus:outline-none focus:border-indigo-400"
                />
              </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-[#1a73e8] hover:bg-[#1557b0] text-white font-medium text-xs rounded-full transition shadow-2xs cursor-pointer"
                >
                  {isSignUp ? 'Create Enclave Account' : 'Sign In & Authorize'}
                </button>
              </form>
            </div>

          </div>
        )}

      {/* ========================================================== */}
      {/* LOGGED IN USER INTERFACE (DASHBOARD VAULT)                 */}
      {/* ========================================================== */}
      {user && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left panel: Profile HUD + Semantic Vector Clustering */}
          <div className="lg:col-span-6 space-y-6">
            
            {/* 1. Secure user profile & HUD metrics */}
            <div className="bg-white border border-[#dadce0] rounded-2xl p-5 md:p-6 space-y-4 text-left">
              <div className="flex items-center justify-between border-b border-[#dadce0] pb-3">
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div className="w-10 h-10 bg-[#e8f0fe] border border-[#aecbfa] rounded-full flex items-center justify-center font-medium text-[#1967d2] shrink-0">
                    {user.displayName?.charAt(0).toUpperCase() || 'A'}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-medium text-[#202124] truncate">{user.displayName || 'Security Analyst'}</h4>
                    <span className="text-[10px] font-mono text-[#5f6368] block truncate">{user.email}</span>
                    {user.phoneNumber && (
                      <span className="text-[10px] font-mono text-[#1a73e8] flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3" />
                        <span>{user.phoneNumber}</span>
                      </span>
                    )}
                    {user.dateOfBirth && (
                      <span className="text-[10px] font-mono text-[#5f6368] flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3 h-3" />
                        <span>DOB: {user.dateOfBirth} ({calculateAgeFromDob(user.dateOfBirth)} yrs)</span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <InfoButton
                    title="Analyst Vault Telemetry"
                    description="Displays your verified enclave credentials, saved records, cumulative working duration, parsed emails, and export counts."
                    align="right"
                  />
                </div>
              </div>

              {/* Quick action: Sync current metrics */}
              {selectedEmail && (
                <div className="p-3 bg-[#e8f0fe]/60 border border-[#aecbfa] rounded-xl flex items-center justify-between gap-3 text-xs">
                  <div className="space-y-0.5 text-left min-w-0">
                    <span className="text-[10px] text-[#1967d2] font-medium block">Active Selection</span>
                    <span className="font-medium text-[#202124] truncate block">{selectedEmail.subject}</span>
                  </div>
                  <button
                    onClick={saveSelectedEmailToProfile}
                    className="px-3.5 py-1.5 bg-[#1a73e8] hover:bg-[#1557b0] text-white font-medium text-[11px] rounded-full transition shrink-0 cursor-pointer"
                  >
                    Save to Vault
                  </button>
                </div>
              )}

              {/* HUD statistics metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                <div className="bg-[#f8f9fa] border border-[#dadce0] p-3 rounded-xl text-left">
                  <span className="text-[10px] text-[#5f6368] block font-medium">Saved Data</span>
                  <span className="text-base font-medium text-[#1a73e8]">{userEmails.length + userExports.length} Items</span>
                </div>
                <div className="bg-[#f8f9fa] border border-[#dadce0] p-3 rounded-xl text-left">
                  <span className="text-[10px] text-[#5f6368] block font-medium">Working Hours</span>
                  <span className="text-base font-medium text-[#137333] font-mono">{formatWorkingDuration(workingSeconds)}</span>
                </div>
                <div className="bg-[#f8f9fa] border border-[#dadce0] p-3 rounded-xl text-left">
                  <span className="text-[10px] text-[#5f6368] block font-medium">Emails Parsed</span>
                  <span className="text-base font-medium text-[#202124]">{Math.max(emailsParsedCount, userEmails.length)}</span>
                </div>
                <div className="bg-[#f8f9fa] border border-[#dadce0] p-3 rounded-xl text-left">
                  <span className="text-[10px] text-[#5f6368] block font-medium">Export Files</span>
                  <span className="text-base font-medium text-[#b06000]">{userExports.length}</span>
                </div>
              </div>

              {/* CSV/JSON Download options */}
              {userEmails.length > 0 && (
                <div className="flex space-x-2 pt-2">
                  <button
                    onClick={() => handleDownloadReport('CSV')}
                    className="flex-1 py-2 bg-[#1a73e8] hover:bg-[#1557b0] text-white font-medium text-xs rounded-full transition flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export CSV</span>
                  </button>
                  <button
                    onClick={() => handleDownloadReport('JSON')}
                    className="flex-1 py-2 bg-[#f8f9fa] border border-[#dadce0] hover:bg-[#f1f3f4] text-[#3c4043] font-medium text-xs rounded-full transition flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Download JSON</span>
                  </button>
                </div>
              )}
            </div>

            {/* 2. Client-Side Quantized Embeddings clustering */}
            <div className="bg-white border border-[#dadce0] rounded-2xl p-5 md:p-6 space-y-4 text-left">
              <div className="flex items-center justify-between border-b border-[#dadce0] pb-3">
                <div className="flex items-center space-x-2">
                  <Cpu className="w-4 h-4 text-[#1a73e8]" />
                  <h3 className="text-sm font-medium text-[#202124]">Semantic Vector Clustering</h3>
                  <InfoButton
                    title="Semantic Vector Clustering"
                    description="Generates an 8-dimensional mathematical vector embedding representing the active email's linguistic profile and computes cosine similarity clusters locally."
                    align="left"
                  />
                </div>
                <span className="px-2 py-0.5 bg-[#e8f0fe] rounded-full text-[10px] font-medium text-[#1967d2]">
                  8-D Embedder
                </span>
              </div>

              {activeVector.length === 0 ? (
                <p className="text-xs text-[#5f6368] py-4 text-center">
                  Select an email to compute its 8-D semantic threat vector.
                </p>
              ) : (
                <div className="space-y-4 animate-fade-in">
                  {/* Embedded Vector Map */}
                  <div className="bg-[#f8f9fa] border border-[#dadce0] p-3.5 rounded-xl space-y-2">
                    <span className="text-[10px] font-medium text-[#5f6368] uppercase block">Quantized Feature Vector</span>
                    <div className="flex items-center space-x-1 bg-white p-2 border border-[#dadce0] rounded-lg overflow-x-auto">
                      {activeVector.map((val, idx) => (
                        <div key={idx} className="flex-1 text-center border-r last:border-r-0 border-[#f1f3f4] px-1 font-mono text-[10px]">
                          <span className="text-[#5f6368] block text-[8px]">D{idx+1}</span>
                          <span className="font-semibold text-[#1a73e8]">{val.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Similarity matches */}
                  <div className="space-y-2">
                    <span className="text-[11px] font-medium text-[#5f6368] block">Top Semantic Matches</span>
                    {semanticMatches.length === 0 ? (
                      <p className="text-xs text-[#5f6368]">No comparison records in vault yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {semanticMatches.map((match, idx) => (
                          <div key={idx} className="bg-[#f8f9fa] border border-[#dadce0] p-3 rounded-xl flex items-center justify-between gap-3">
                            <div className="space-y-0.5 text-left min-w-0 flex-1">
                              <span className="text-[10px] font-medium text-[#1a73e8] block">{match.cluster}</span>
                              <h4 className="text-xs font-medium text-[#202124] truncate">{match.email.subject}</h4>
                            </div>
                            <div className="text-right font-mono shrink-0">
                              <span className={`text-xs font-semibold ${match.similarity > 75 ? 'text-[#d93025]' : 'text-[#5f6368]'}`}>{match.similarity}% Match</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Right panel: Firestore saved indices and export logs */}
          <div className="lg:col-span-6 space-y-6">

            {/* 1. Live Scanned emails history list */}
            <div className="bg-white border border-[#dadce0] rounded-2xl p-5 md:p-6 space-y-4 text-left">
              <div className="flex items-center justify-between border-b border-[#dadce0] pb-2.5">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-[#1a73e8]" />
                  <h3 className="text-sm font-medium text-[#202124]">Scanned History Audit Trail</h3>
                  <InfoButton
                    title="Scanned History Audit Trail"
                    description="Cloud-synced history of emails analyzed and saved strictly under your user ID."
                    align="right"
                  />
                </div>
                <span className="text-[11px] font-medium text-[#5f6368]">{userEmails.length} saved</span>
              </div>

              {dbLoading ? (
                <div className="text-center py-10 text-xs text-[#5f6368]">
                   Loading records...
                </div>
              ) : userEmails.length === 0 ? (
                <div className="text-center py-10 text-xs text-[#5f6368] space-y-2">
                  <Mail className="w-6 h-6 mx-auto text-[#80868b]" />
                  <p>No saved emails in vault yet.</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[300px] overflow-y-auto no-scrollbar">
                  {userEmails.map((emailItem) => (
                    <div key={emailItem.docId} className="bg-[#f8f9fa] border border-[#dadce0] rounded-xl p-3 flex items-start justify-between gap-3 transition hover:border-[#1a73e8]">
                      <div className="space-y-1 text-left min-w-0 flex-1">
                        <div className="flex items-center space-x-1.5 flex-wrap">
                          <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${
                            emailItem.spamScore > 65 ? 'bg-[#fce8e6] text-[#c5221f]' : 'bg-[#e6f4ea] text-[#137333]'
                          }`}>
                            Score: {emailItem.spamScore}%
                          </span>
                          <span className="text-[11px] font-mono text-[#5f6368] truncate max-w-[160px]">{emailItem.sender}</span>
                        </div>
                        <h4 className="text-xs font-medium text-[#202124] truncate">{emailItem.subject}</h4>
                        <span className="text-[10px] text-[#5f6368] block">{new Date(emailItem.createdAt).toLocaleDateString()}</span>
                      </div>

                      <button
                        onClick={() => deleteSavedEmailRecord(emailItem.docId)}
                        className="p-1.5 text-[#5f6368] hover:text-[#d93025] rounded-full hover:bg-[#fce8e6] transition cursor-pointer"
                        title="Delete catalog record"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 2. Download/Export log trace */}
            <div className="bg-white border border-[#dadce0] rounded-2xl p-5 md:p-6 space-y-4 text-left">
              <div className="flex items-center justify-between border-b border-[#dadce0] pb-2.5">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#1e8e3e]" />
                  <h3 className="text-sm font-medium text-[#202124]">Download & Export Ledger</h3>
                  <InfoButton
                    title="Download & Export Ledger"
                    description="Immutable audit log of CSV, JSON, and Markdown forensic reports exported during your sessions."
                    align="right"
                  />
                </div>
                <span className="text-[11px] font-medium text-[#5f6368]">{userExports.length} files</span>
              </div>

              {userExports.length === 0 ? (
                <p className="text-xs text-[#5f6368] text-center py-6">No exports logged yet.</p>
              ) : (
                <div className="space-y-2 max-h-[220px] overflow-y-auto no-scrollbar">
                  {userExports.map((exp) => (
                    <div key={exp.id} className="bg-[#f8f9fa] border border-[#dadce0] p-2.5 rounded-xl flex items-center justify-between text-xs">
                      <div className="space-y-0.5 text-left truncate flex-1 pr-3">
                        <div className="flex items-center space-x-1.5">
                          <span className="px-2 py-0.5 bg-[#e8eaed] text-[#3c4043] text-[10px] rounded-full font-medium">{exp.fileType}</span>
                          <span className="text-xs font-medium text-[#202124] truncate block max-w-[180px]">{exp.fileName}</span>
                        </div>
                        <span className="text-[10px] text-[#5f6368] block">{new Date(exp.createdAt).toLocaleString()}</span>
                      </div>
                      <span className="text-[11px] font-medium text-[#1a73e8] shrink-0">{exp.recordCount} Items</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

        </div>
      )}

    </div>
  );
}
