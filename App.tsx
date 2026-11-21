/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, Mail, Image, FileSpreadsheet, BrainCircuit, Bot, Gauge,
  ShieldCheck, Activity, Sparkles, Clock, AlertTriangle, 
  Settings, Shield, ChevronRight, CheckCircle2, XCircle, User, LogIn, UserPlus, LogOut, Lock, X,
  Menu, Info, Database, Phone, Moon, Sun, Calendar
} from 'lucide-react';
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
  fetchUserDatasetEmails,
  getFirebaseIdTokenSafely,
  saveEmailToEnclaveProfile,
  saveUserDatasetEmailsBatch,
  getUserPortalStats,
  incrementUserEmailsParsed,
  incrementUserWorkingSeconds,
  formatWorkingDuration
} from './src/lib/firebase';
import {
  CollectiveBackendStats,
  classifyGranularEmailTier,
  contributeSamplesToBackend,
  contributeImagesToBackend,
  fetchCollectiveModelFromBackend,
  fetchUserWorkspaceFromBackend,
  loadUserActiveInspectorImage,
  loadUserBatchReportMeta,
  loadUserBatchRows,
  loadUserImageAssessments,
  loadUserTrainedModel,
  loadUserTrainerImages,
  loadUserTrainerSamples,
  mergeBatchRowsByKey,
  mergeImagesByKey,
  mergeSamplesByKey,
  saveUserActiveInspectorImage,
  saveUserBatchReportMeta,
  saveUserBatchRows,
  saveUserImageAssessment,
  saveUserTrainerImages,
  saveUserTrainerSamples,
  setActiveMlUserUid,
  syncUserWorkspaceToBackend
} from './src/lib/localMlEngine';
import Dashboard from './Dashboard';
import EmailAnalyzer from './EmailAnalyzer';
import ImageAnalyzer from './ImageAnalyzer';
import BatchAnalyzer from './BatchAnalyzer';
import ChatAssistant from './ChatAssistant';
import PerformanceMetrics from './PerformanceMetrics';
import TrainerLab from './src/components/TrainerLab';
import UserProfile from './src/components/UserProfile';
import AboutSection, { NeoAegisSymbol } from './src/components/AboutSection';
import InfoButton from './src/components/InfoButton';
import { analyzeEmailWithModel } from './spamEngine';
import { EmailRecord, TrainedModelArtifact, TrainingSample, ImageTrainingSample } from './types';

type PortalTab = 'dashboard' | 'email' | 'image' | 'batch' | 'rag' | 'metrics' | 'trainer' | 'profile' | 'about';

export default function App() {
  const [currentTab, setCurrentTab] = useState<PortalTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showGatewayAbout, setShowGatewayAbout] = useState(false);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('neoaegis_theme') === 'dark';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('neoaegis_theme', darkMode ? 'dark' : 'light');
    } catch {
      // ignore storage errors
    }
  }, [darkMode]);

  // Auth & Per-User Isolation State
  const [currentUser, setCurrentUser] = useState<EnclaveUser | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [headerEmail, setHeaderEmail] = useState('');
  const [headerCountryCode, setHeaderCountryCode] = useState('IN');
  const [headerPhone, setHeaderPhone] = useState('');
  const [headerDob, setHeaderDob] = useState('');
  const [headerPassword, setHeaderPassword] = useState('');
  const [headerDisplayName, setHeaderDisplayName] = useState('');
  const [headerAuthError, setHeaderAuthError] = useState('');
  const [headerAuthBusy, setHeaderAuthBusy] = useState(false);
  const authDropdownRef = useRef<HTMLDivElement>(null);

  const selectedHeaderCountry =
    COUNTRY_DIAL_CODES.find(c => c.code === headerCountryCode) || COUNTRY_DIAL_CODES[0];

  // Per-User Isolated Emails, Local ML Model & Telemetry State
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<EmailRecord | null>(null);
  const [savedDataCount, setSavedDataCount] = useState<number>(0);
  const [emailsParsedCount, setEmailsParsedCount] = useState<number>(0);
  const [workingSeconds, setWorkingSeconds] = useState<number>(0);
  const [activeModel, setActiveModel] = useState<TrainedModelArtifact | null>(null);
  const [collectiveStats, setCollectiveStats] = useState<CollectiveBackendStats | null>(null);
  const [modelVersion, setModelVersion] = useState<number>(0);
  const [incomingEmailSamples, setIncomingEmailSamples] = useState<TrainingSample[]>([]);
  const [incomingImageSamples, setIncomingImageSamples] = useState<ImageTrainingSample[]>([]);
  const [preferredTrainerUnit, setPreferredTrainerUnit] = useState<'text' | 'image'>('text');
  const [vaultSyncTick, setVaultSyncTick] = useState<number>(0);

  // Load strict per-user isolated records, private uploaded datasets & collective backend model
  const syncUserIsolatedVault = async (uid: string) => {
    const stats = getUserPortalStats(uid);
    setWorkingSeconds(stats.workingSeconds);

    // 1. Fetch collective backend model + aggregate stats AND this user's own private backend workspace
    const idToken = await getFirebaseIdTokenSafely();
    const [{ stats: backendStats }, remoteWorkspace] = await Promise.all([
      fetchCollectiveModelFromBackend(uid, idToken),
      fetchUserWorkspaceFromBackend(uid, idToken)
    ]);
    if (backendStats) {
      setCollectiveStats(backendStats);
    }

    if (remoteWorkspace) {
      if (Array.isArray(remoteWorkspace.trainerSamples) && remoteWorkspace.trainerSamples.length > 0) {
        const mergedSamples = mergeSamplesByKey(loadUserTrainerSamples(uid), remoteWorkspace.trainerSamples);
        saveUserTrainerSamples(uid, mergedSamples);
      }
      if (Array.isArray(remoteWorkspace.trainerImages) && remoteWorkspace.trainerImages.length > 0) {
        const mergedImgs = mergeImagesByKey(loadUserTrainerImages(uid) || [], remoteWorkspace.trainerImages);
        saveUserTrainerImages(uid, mergedImgs);
      }
      if (Array.isArray(remoteWorkspace.batchRows) && remoteWorkspace.batchRows.length > 0) {
        const mergedBatch = mergeBatchRowsByKey(loadUserBatchRows(uid), remoteWorkspace.batchRows);
        saveUserBatchRows(uid, mergedBatch);
      }
      if (remoteWorkspace.batchMeta && !loadUserBatchReportMeta(uid)) {
        saveUserBatchReportMeta(uid, remoteWorkspace.batchMeta);
      }
      if (Array.isArray(remoteWorkspace.imageAssessments) && remoteWorkspace.imageAssessments.length > 0) {
        for (const a of remoteWorkspace.imageAssessments) {
          saveUserImageAssessment(uid, a);
        }
      }
      if (remoteWorkspace.activeInspectorImage && !loadUserActiveInspectorImage(uid)) {
        saveUserActiveInspectorImage(uid, remoteWorkspace.activeInspectorImage);
      }
    }

    // 2. Hydrate this user's private persisted dataset emails from Firestore strictly matching ownerId == uid
    const cloudDatasetDocs = await fetchUserDatasetEmails(uid);
    if (cloudDatasetDocs.length > 0) {
      const existingTrainer = loadUserTrainerSamples(uid);
      const trainerKeySet = new Set(
        existingTrainer.map(s => `${String(s.subject).trim().toLowerCase()}::${String(s.sender).trim().toLowerCase()}`)
      );
      const hydratedTrainerAdditions: TrainingSample[] = [];
      for (const doc of cloudDatasetDocs) {
        const key = `${String(doc.subject).trim().toLowerCase()}::${String(doc.sender).trim().toLowerCase()}`;
        if (!trainerKeySet.has(key)) {
          trainerKeySet.add(key);
          hydratedTrainerAdditions.push({
            id: doc.id,
            subject: doc.subject,
            sender: doc.sender,
            body: doc.body,
            rawHeaders: doc.rawHeaders,
            label: doc.label,
            granularTier: doc.granularTier,
            source: doc.source === 'audit_stream' ? 'audit_stream' : doc.source === 'manual' ? 'manual' : 'upload'
          });
        }
      }
      if (hydratedTrainerAdditions.length > 0) {
        saveUserTrainerSamples(uid, [...hydratedTrainerAdditions, ...existingTrainer]);
      }

      const existingBatch = loadUserBatchRows(uid) || [];
      const batchKeySet = new Set(
        existingBatch.map((b: any) => `${String(b.subject).trim().toLowerCase()}::${String(b.sender).trim().toLowerCase()}`)
      );
      const hydratedBatchAdditions: any[] = [];
      for (const doc of cloudDatasetDocs) {
        const key = `${String(doc.subject).trim().toLowerCase()}::${String(doc.sender).trim().toLowerCase()}`;
        if (!batchKeySet.has(key)) {
          batchKeySet.add(key);
          hydratedBatchAdditions.push({
            id: doc.id,
            subject: doc.subject,
            sender: doc.sender,
            body: doc.body,
            rawHeaders: doc.rawHeaders,
            actualLabel: doc.label,
            actual: doc.label === 'legitimate' ? 'ham' : 'spam',
            granularTier: doc.granularTier,
            source: doc.source
          });
        }
      }
      if (hydratedBatchAdditions.length > 0) {
        saveUserBatchRows(uid, [...hydratedBatchAdditions, ...existingBatch]);
      }

      // If collective backend corpus is empty (e.g. cold restart), backfill this user's saved samples automatically
      if (!backendStats || backendStats.totalCombinedEmails === 0) {
        const backfillSamples: TrainingSample[] = cloudDatasetDocs.map(doc => ({
          id: doc.id,
          subject: doc.subject,
          sender: doc.sender,
          body: doc.body,
          rawHeaders: doc.rawHeaders,
          label: doc.label,
          granularTier: doc.granularTier,
          source: 'upload'
        }));
        const synced = await contributeSamplesToBackend(uid, idToken, backfillSamples, undefined, true);
        if (synced.stats) setCollectiveStats(synced.stats);
      }
    }

    const resolvedModel = loadUserTrainedModel(uid);
    setActiveModel(resolvedModel);
    setModelVersion(v => v + 1);

    // 3. Hydrate Personal Audit Stream & Exports strictly for this uid
    const datasetLabelLookup = new Map<string, TrainingSample['label']>();
    for (const s of loadUserTrainerSamples(uid)) {
      datasetLabelLookup.set(`${String(s.subject).trim().toLowerCase()}::${String(s.sender).trim().toLowerCase()}`, s.label);
    }
    for (const doc of cloudDatasetDocs) {
      datasetLabelLookup.set(`${String(doc.subject).trim().toLowerCase()}::${String(doc.sender).trim().toLowerCase()}`, doc.label);
    }

    const { emails: savedEmails, exports: savedExports } = await fetchEnclaveUserData(uid);
    const reconstructedRecords: EmailRecord[] = savedEmails.map((item: any) => {
      if (item.fullRecord && item.fullRecord.metrics) {
        const rec = item.fullRecord as EmailRecord;
        const fresh = analyzeEmailWithModel(rec.subject, rec.body, rec.rawHeaders, rec.sender);
        const key = `${String(rec.subject).trim().toLowerCase()}::${String(rec.sender).trim().toLowerCase()}`;
        const inferredTruth = rec.groundTruthLabel || datasetLabelLookup.get(key);
        return {
          ...rec,
          ...(inferredTruth ? { groundTruthLabel: inferredTruth } : {}),
          isSpam: fresh.metrics.spamScore > 50 || fresh.metrics.phishingLikelihood > 45,
          metrics: fresh.metrics
        };
      }
      const fallbackBody = item.body || item.bodySnippet || item.subject || '';
      const senderAddr = item.sender || 'unknown@sender.org';
      const rawHeaders = item.rawHeaders || `From: ${senderAddr}\nReceived: by neoaegis.local; SPF=pass; DKIM=pass`;
      const analyzed = analyzeEmailWithModel(item.subject || '', fallbackBody, rawHeaders, senderAddr).metrics;
      const key = `${String(item.subject || '').trim().toLowerCase()}::${String(senderAddr).trim().toLowerCase()}`;
      const inferredTruth = datasetLabelLookup.get(key);
      return {
        id: item.id || item.docId || `mail-${Date.now()}`,
        subject: item.subject || 'Untitled Message',
        sender: senderAddr,
        recipient: item.recipient || 'analyst@neoaegis.local',
        timestamp: item.date || item.createdAt || new Date().toISOString(),
        body: fallbackBody,
        rawHeaders,
        ...(inferredTruth ? { groundTruthLabel: inferredTruth } : {}),
        isSpam: analyzed.spamScore > 50 || analyzed.phishingLikelihood > 45,
        metrics: analyzed
      };
    });

    setEmails(prev => {
      const existingIds = new Set(reconstructedRecords.map(r => `${r.subject.toLowerCase()}::${r.sender.toLowerCase()}`));
      const extraInMemory = prev.filter(p => !existingIds.has(`${p.subject.toLowerCase()}::${p.sender.toLowerCase()}`));
      return [...extraInMemory, ...reconstructedRecords];
    });
    setSelectedEmail(prev => {
      if (prev) return prev;
      return reconstructedRecords[0] || null;
    });

    const totalSaved = savedEmails.length + savedExports.length + cloudDatasetDocs.length;
    setSavedDataCount(totalSaved);
    setEmailsParsedCount(Math.max(stats.emailsParsedCount, reconstructedRecords.length));
    setVaultSyncTick(t => t + 1);
  };

  useEffect(() => {
    const unsubscribe = subscribeToAuthSession((u) => {
      setCurrentUser(u);
      setAuthInitialized(true);
      if (u) {
        setAuthMenuOpen(false);
        setHeaderAuthError('');
        setActiveMlUserUid(u.uid);
        setActiveModel(loadUserTrainedModel(u.uid));
        setModelVersion(v => v + 1);
        syncUserIsolatedVault(u.uid);
      } else {
        // Strict isolation: clear all user data and active model immediately on sign-out
        setActiveMlUserUid(null);
        setActiveModel(null);
        setCollectiveStats(null);
        setModelVersion(v => v + 1);
        setEmails([]);
        setSelectedEmail(null);
        setSavedDataCount(0);
        setEmailsParsedCount(0);
        setWorkingSeconds(0);
        setIncomingEmailSamples([]);
        setIncomingImageSamples([]);
        setVaultSyncTick(0);
      }
    });
    return unsubscribe;
  }, []);

  // Re-score vault emails immediately whenever user trains, imports, or switches local/collective ML weights
  const handleModelUpdated = (nextModel: TrainedModelArtifact | null) => {
    setActiveModel(nextModel);
    setModelVersion(v => v + 1);

    setEmails(prev => {
      const updated = prev.map(mail => {
        const reMetrics = analyzeEmailWithModel(mail.subject, mail.body, mail.rawHeaders, mail.sender).metrics;
        return {
          ...mail,
          isSpam: reMetrics.spamScore > 50 || reMetrics.phishingLikelihood > 45,
          metrics: reMetrics
        };
      });
      setSelectedEmail(curr => {
        if (!curr) return updated[0] || null;
        return updated.find(u => u.id === curr.id) || updated[0] || null;
      });
      return updated;
    });
  };

  const handleCollectiveModelSynced = (
    collectiveModel: TrainedModelArtifact | null,
    stats: CollectiveBackendStats | null
  ) => {
    if (stats) {
      setCollectiveStats(stats);
    }
    const resolved = loadUserTrainedModel(currentUser?.uid) || collectiveModel;
    handleModelUpdated(resolved);
  };

  // Per-user Working Hours Duration live tracker (increments every second while logged in)
  useEffect(() => {
    if (!currentUser) return;
    const timer = setInterval(() => {
      const updated = incrementUserWorkingSeconds(currentUser.uid, 1);
      setWorkingSeconds(updated.workingSeconds);
    }, 1000);
    return () => clearInterval(timer);
  }, [currentUser]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (authDropdownRef.current && !authDropdownRef.current.contains(event.target as Node)) {
        setAuthMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleHeaderEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setHeaderAuthError('');

    const emailErr = validateEmailRules(headerEmail);
    if (emailErr) {
      setHeaderAuthError(emailErr);
      return;
    }

    const phoneErr = validatePhoneRules(headerPhone, selectedHeaderCountry);
    if (phoneErr) {
      setHeaderAuthError(phoneErr);
      return;
    }

    if (authMode === 'signup') {
      const dobErr = validateDobRules(headerDob);
      if (dobErr) {
        setHeaderAuthError(dobErr);
        return;
      }

      const passErr = validatePasswordRules(headerPassword);
      if (passErr) {
        setHeaderAuthError(passErr);
        return;
      }
    } else if (!headerPassword || headerPassword.length < 6) {
      setHeaderAuthError('Please enter your password.');
      return;
    }

    const formattedPhoneWithCode = `${selectedHeaderCountry.dial} ${headerPhone.replace(/\D/g, '')}`;

    setHeaderAuthBusy(true);
    try {
      if (authMode === 'signup') {
        await signUpWithEnclaveEmail(
          headerEmail,
          headerPassword,
          headerDisplayName,
          formattedPhoneWithCode,
          headerDob
        );
      } else {
        await signInWithEnclaveEmail(headerEmail, headerPassword, formattedPhoneWithCode);
      }
      setHeaderEmail('');
      setHeaderPhone('');
      setHeaderDob('');
      setHeaderPassword('');
      setHeaderDisplayName('');
      setAuthMenuOpen(false);
    } catch (err: any) {
      setHeaderAuthError(err.message || 'Authentication failed.');
    } finally {
      setHeaderAuthBusy(false);
    }
  };

  const handleHeaderGoogleSignIn = async () => {
    setHeaderAuthError('');
    setHeaderAuthBusy(true);
    try {
      const digits = headerPhone.replace(/\D/g, '');
      const formattedPhone = digits ? `${selectedHeaderCountry.dial} ${digits}` : undefined;
      await signInWithEnclaveGoogle(formattedPhone);
      setAuthMenuOpen(false);
    } catch (err: any) {
      setHeaderAuthError(err.message || 'Google sign-in failed.');
    } finally {
      setHeaderAuthBusy(false);
    }
  };

  const handleHeaderLogout = async () => {
    await signOutEnclaveSession();
    setAuthMenuOpen(false);
    setMobileMenuOpen(false);
  };

  // Add dynamically parsed email from batch uploads and persist strictly to current user's profile
  const handleAddNewEmails = async (newRecords: EmailRecord[]) => {
    if (newRecords.length === 0) return;
    setEmails(prev => {
      const filtered = prev.filter(p => !newRecords.some(nr => nr.subject === p.subject && nr.sender === p.sender));
      return [...newRecords, ...filtered];
    });
    setSelectedEmail(newRecords[0]);

    if (currentUser) {
      const updatedStats = incrementUserEmailsParsed(currentUser.uid, newRecords.length);
      setEmailsParsedCount(updatedStats.emailsParsedCount);
      for (const rec of newRecords) {
        await saveEmailToEnclaveProfile(currentUser.uid, rec);
      }
      await syncUserIsolatedVault(currentUser.uid);
    }
  };

  // Sync confirmed CSV dataset rows from Trainer into both Personal Audit Vault & Batch CSV Auditor
  const handleArchiveTrainerCsvEmails = async (samples: TrainingSample[]) => {
    if (!currentUser || samples.length === 0) return;

    const evaluatedRecords: EmailRecord[] = samples.map((s, idx) => {
      const headers = s.rawHeaders || `From: ${s.sender}\nDKIM: Pass\nSPF: Pass`;
      const res = analyzeEmailWithModel(s.subject, s.body, headers, s.sender);
      const tierInfo = classifyGranularEmailTier(
        s.subject,
        s.body,
        s.sender,
        headers,
        s.granularTier || s.label,
        res.metrics.spamScore,
        res.metrics.phishingLikelihood
      );
      return {
        id: s.id || `trncsv-${Date.now()}-${idx}`,
        subject: s.subject,
        sender: s.sender,
        recipient: currentUser.email || 'analyst@neoaegis.local',
        body: s.body,
        rawHeaders: headers,
        timestamp: new Date().toISOString(),
        isSpam: res.metrics.spamScore >= 50 || res.metrics.phishingLikelihood >= 55,
        groundTruthLabel: s.label,
        granularTier: s.granularTier || tierInfo.granularTier,
        metrics: res.metrics
      };
    });

    // Append into persisted Batch CSV Auditor rows FIRST so syncUserIsolatedVault merges cleanly
    const existingBatch = loadUserBatchRows(currentUser.uid) || [];
    const existingKeys = new Set(existingBatch.map((b: any) => `${String(b.subject).toLowerCase()}::${String(b.sender).toLowerCase()}`));
    const newBatchRows = evaluatedRecords
      .filter(r => !existingKeys.has(`${r.subject.toLowerCase()}::${r.sender.toLowerCase()}`))
      .map(r => ({
        id: r.id,
        subject: r.subject,
        sender: r.sender,
        body: r.body,
        rawHeaders: r.rawHeaders,
        actualLabel: r.groundTruthLabel || 'spam',
        actual: (r.groundTruthLabel || 'spam') === 'legitimate' ? 'ham' : 'spam',
        granularTier: r.granularTier,
        source: 'trainer_sync'
      }));

    if (newBatchRows.length > 0) {
      const mergedBatch = [...newBatchRows, ...existingBatch];
      saveUserBatchRows(currentUser.uid, mergedBatch);
      const idToken = await getFirebaseIdTokenSafely();
      await syncUserWorkspaceToBackend(currentUser.uid, idToken, {
        batchRows: mergedBatch
      });
    }

    await handleAddNewEmails(evaluatedRecords);
  };

  // Single email analyzed: save strictly to current user's profile and increment parsed counter
  const handleSingleEmailAnalyzed = async (record: EmailRecord) => {
    setEmails(prev => {
      const exists = prev.some(p => p.id === record.id);
      if (exists) {
        return prev.map(p => p.id === record.id ? record : p);
      }
      return [record, ...prev];
    });
    setSelectedEmail(record);

    if (currentUser) {
      const updatedStats = incrementUserEmailsParsed(currentUser.uid, 1);
      setEmailsParsedCount(updatedStats.emailsParsedCount);
      await saveEmailToEnclaveProfile(currentUser.uid, record);
      await syncUserIsolatedVault(currentUser.uid);
    }
  };

  const navItems: { id: PortalTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }[] = [
    { id: 'dashboard', label: 'Overview Dashboard', icon: LayoutDashboard },
    { id: 'email', label: 'Mail Body Scanner', icon: Mail },
    { id: 'image', label: 'Image OCR Inspector', icon: Image },
    { id: 'batch', label: 'Batch CSV Auditor', icon: FileSpreadsheet },
    { id: 'rag', label: 'SecOps RAG Assistant', icon: Bot },
    { id: 'metrics', label: 'Accuracy & F1 Matrix', icon: Gauge },
    { id: 'trainer', label: 'Trainer', icon: BrainCircuit },
    { id: 'profile', label: 'Profile Enclave', icon: User },
    { id: 'about', label: 'About NeoAegis', icon: Info }
  ];

  // ============================================================================
  // MANDATORY INITIAL SIGN UP / LOGIN GATEWAY BEFORE PORTAL OPENS
  // ============================================================================
  if (authInitialized && !currentUser) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] text-[#202124] font-sans antialiased flex flex-col justify-between" id="auth-gateway-screen">
        {/* Google 4-color signature top bar */}
        <div className="w-full h-1.5 flex shrink-0">
          <div className="w-1/4 bg-[#4285F4]"></div>
          <div className="w-1/4 bg-[#EA4335]"></div>
          <div className="w-1/4 bg-[#FBBC05]"></div>
          <div className="w-1/4 bg-[#34A853]"></div>
        </div>

        {/* Gateway Top Brand Bar */}
        <header className="w-full bg-white border-b border-[#dadce0] px-4 sm:px-8 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <NeoAegisSymbol size="md" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg sm:text-xl font-medium text-[#202124] tracking-tight">NeoAegis</span>
                  <span className="px-2.5 py-0.5 bg-[#e8f0fe] text-[#1967d2] text-[11px] font-medium rounded-full">
                    Zero-Trust Portal
                  </span>
                </div>
                <p className="text-xs text-[#5f6368]">
                  Advanced Mail Assessment, Decision and Sandbox Apparatus
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDarkMode(prev => !prev)}
                className="px-3.5 py-2 bg-[#f8f9fa] hover:bg-[#e8f0fe] text-[#3c4043] border border-[#dadce0] rounded-full text-xs font-medium transition flex items-center gap-1.5 cursor-pointer"
                title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                aria-label="Toggle dark mode"
              >
                {darkMode ? <Sun className="w-3.5 h-3.5 text-[#fbbc04]" /> : <Moon className="w-3.5 h-3.5 text-[#1a73e8]" />}
                <span className="hidden sm:inline">{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowGatewayAbout(prev => !prev)}
                className="px-4 py-2 bg-[#f8f9fa] hover:bg-[#e8f0fe] text-[#1a73e8] border border-[#dadce0] rounded-full text-xs font-medium transition flex items-center gap-1.5 cursor-pointer"
              >
                <Info className="w-3.5 h-3.5" />
                <span>{showGatewayAbout ? 'Back to Sign In' : 'About NeoAegis'}</span>
              </button>
            </div>
          </div>
        </header>

        {/* Main Gateway Body */}
        <main className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 md:py-12 flex-1 flex items-center">
          {showGatewayAbout ? (
            <div className="w-full bg-white border border-[#dadce0] rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
              <div className="flex items-center justify-between border-b border-[#dadce0] pb-4">
                <span className="text-xs font-medium text-[#1967d2] uppercase tracking-wider">
                  Software Overview & Mission
                </span>
                <button
                  type="button"
                  onClick={() => setShowGatewayAbout(false)}
                  className="px-4 py-1.5 bg-[#1a73e8] hover:bg-[#1557b0] text-white text-xs font-medium rounded-full transition cursor-pointer"
                >
                  Proceed to Login / Sign Up &rarr;
                </button>
              </div>
              <AboutSection />
            </div>
          ) : (
            <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              
              {/* Left Column: Dedicated Project Identity, Per-User Isolation Guarantee & Aim */}
              <div className="lg:col-span-7 space-y-6 text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#e8f0fe] text-[#1967d2] rounded-full text-xs font-medium">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Analyst Authentication Gateway</span>
                </div>

                <div className="flex items-start gap-4">
                  <NeoAegisSymbol size="lg" />
                  <div>
                    <div className="flex items-center gap-2">
                      <h1 className="text-2xl sm:text-3xl font-medium text-[#202124] tracking-tight">
                        NeoAegis Security Enclave
                      </h1>
                      <InfoButton
                        title="About NeoAegis Enclave"
                        description="Sign in or create a personal analyst account to access the portal. Every user operates in an isolated UID-keyed vault so saved emails, threat scores, and session hours remain private."
                        align="left"
                      />
                    </div>
                    <p className="text-sm text-[#1a73e8] font-medium mt-1">
                      Advanced Mail Assessment, Decision and Sandbox Apparatus
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2">
                  <div className="bg-white border border-[#dadce0] rounded-2xl p-4 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-[#e8f0fe] text-[#1a73e8] flex items-center justify-center shrink-0">
                        <Lock className="w-4 h-4" />
                      </div>
                      <h3 className="text-xs font-medium text-[#202124] truncate">Strict Data Isolation</h3>
                    </div>
                    <InfoButton
                      title="Strict Data Isolation"
                      description="Other users' emails and exports are never shown. Your data is keyed exclusively to your authenticated UID."
                      align="left"
                    />
                  </div>

                  <div className="bg-white border border-[#dadce0] rounded-2xl p-4 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-[#e6f4ea] text-[#137333] flex items-center justify-center shrink-0">
                        <Clock className="w-4 h-4" />
                      </div>
                      <h3 className="text-xs font-medium text-[#202124] truncate">Live Telemetry</h3>
                    </div>
                    <InfoButton
                      title="Live Telemetry"
                      description="Automatically tracks your personal Saved Data, Working Hours Duration, and Emails Parsed."
                      align="left"
                    />
                  </div>

                  <div className="bg-white border border-[#dadce0] rounded-2xl p-4 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-[#fef7e0] text-[#b06000] flex items-center justify-center shrink-0">
                        <Shield className="w-4 h-4" />
                      </div>
                      <h3 className="text-xs font-medium text-[#202124] truncate">34-Vector Sandbox</h3>
                    </div>
                    <InfoButton
                      title="34-Vector Sandbox"
                      description="Client-side email analysis, OCR inspection, local ML model trainer, and 8-D semantic clustering."
                      align="right"
                    />
                  </div>
                </div>
              </div>

              {/* Right Column: Google Account Style Login / Sign Up Card */}
              <div className="lg:col-span-5 bg-white border border-[#dadce0] rounded-3xl p-6 sm:p-8 shadow-sm text-left">
                <div className="flex items-center justify-between pb-4 mb-5 border-b border-[#dadce0]">
                  <div className="flex items-center gap-1 p-1 bg-[#f1f3f4] rounded-full w-full">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('login');
                        setHeaderAuthError('');
                      }}
                      className={`flex-1 py-2 text-xs font-medium rounded-full transition cursor-pointer ${
                        authMode === 'login'
                          ? 'bg-white text-[#1a73e8] shadow-2xs'
                          : 'text-[#5f6368] hover:text-[#202124]'
                      }`}
                    >
                      Sign in
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('signup');
                        setHeaderAuthError('');
                      }}
                      className={`flex-1 py-2 text-xs font-medium rounded-full transition cursor-pointer ${
                        authMode === 'signup'
                          ? 'bg-white text-[#1a73e8] shadow-2xs'
                          : 'text-[#5f6368] hover:text-[#202124]'
                      }`}
                    >
                      Sign up
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3 mb-5">
                  <NeoAegisSymbol size="sm" />
                  <h2 className="text-lg font-medium text-[#202124]">
                    {authMode === 'signup' ? 'Create your NeoAegis Account' : 'Sign in to NeoAegis'}
                  </h2>
                </div>

                {headerAuthError && (
                  <div className="mb-4 p-3 bg-[#fce8e6] border border-[#fad2cf] rounded-xl text-[#c5221f] text-xs flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-[#d93025] shrink-0 mt-0.5" />
                    <span>{headerAuthError}</span>
                  </div>
                )}

                <form onSubmit={handleHeaderEmailAuth} className="space-y-4">
                  {authMode === 'signup' && (
                    <div>
                      <label className="block text-xs font-medium text-[#5f6368] mb-1">
                        Analyst Full Name
                      </label>
                      <input
                        type="text"
                        value={headerDisplayName}
                        onChange={e => setHeaderDisplayName(e.target.value)}
                        placeholder="e.g. Alex Mercer"
                        className="w-full text-sm bg-white border border-[#dadce0] px-3.5 py-2.5 rounded-xl focus:outline-none focus:border-[#1a73e8] focus:ring-2 focus:ring-[#e8f0fe] text-[#202124]"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-[#5f6368] mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={headerEmail}
                      onChange={e => setHeaderEmail(e.target.value)}
                      placeholder="analyst@organization.com"
                      className="w-full text-sm bg-white border border-[#dadce0] px-3.5 py-2.5 rounded-xl focus:outline-none focus:border-[#1a73e8] focus:ring-2 focus:ring-[#e8f0fe] text-[#202124]"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-[#5f6368]">
                        Phone Number (with Country Code)
                      </label>
                      <span className="text-[10px] font-mono text-[#1a73e8]">
                        Requires {selectedHeaderCountry.minDigits === selectedHeaderCountry.maxDigits
                          ? `${selectedHeaderCountry.minDigits} digits`
                          : `${selectedHeaderCountry.minDigits}-${selectedHeaderCountry.maxDigits} digits`}
                      </span>
                    </div>
                    <div className="flex items-stretch gap-2">
                      <select
                        value={headerCountryCode}
                        onChange={e => setHeaderCountryCode(e.target.value)}
                        aria-label="Country code selector"
                        className="text-xs font-medium bg-[#f8f9fa] border border-[#dadce0] px-2.5 py-2.5 rounded-xl focus:outline-none focus:border-[#1a73e8] text-[#202124] cursor-pointer shrink-0"
                      >
                        {COUNTRY_DIAL_CODES.map(c => (
                          <option key={c.code} value={c.code}>
                            {c.flag} {c.dial} ({c.code})
                          </option>
                        ))}
                      </select>

                      <div className="relative flex-1">
                        <Phone className="w-4 h-4 text-[#5f6368] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="tel"
                          required
                          value={headerPhone}
                          onChange={e => setHeaderPhone(e.target.value.replace(/[^\d\s-]/g, ''))}
                          placeholder={`${'9'.repeat(selectedHeaderCountry.minDigits)}`}
                          maxLength={selectedHeaderCountry.maxDigits + 3}
                          className="w-full text-sm font-mono bg-white border border-[#dadce0] pl-9 pr-3 py-2.5 rounded-xl focus:outline-none focus:border-[#1a73e8] focus:ring-2 focus:ring-[#e8f0fe] text-[#202124]"
                        />
                      </div>
                    </div>
                  </div>

                  {authMode === 'signup' && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-[#5f6368]">
                          Date of Birth (Minimum Age: 15+ Years)
                        </label>
                        {headerDob && (
                          <span
                            className={`text-[10px] font-mono font-medium ${
                              calculateAgeFromDob(headerDob) >= 15
                                ? 'text-[#137333]'
                                : 'text-[#d93025]'
                            }`}
                          >
                            Age: {Math.max(0, calculateAgeFromDob(headerDob))} yrs
                            {calculateAgeFromDob(headerDob) < 15 ? ' (Restricted < 15)' : ' (Eligible)'}
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <Calendar className="w-4 h-4 text-[#5f6368] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="date"
                          required
                          value={headerDob}
                          max={new Date().toISOString().split('T')[0]}
                          onChange={e => setHeaderDob(e.target.value)}
                          className="w-full text-sm bg-white border border-[#dadce0] pl-10 pr-3.5 py-2.5 rounded-xl focus:outline-none focus:border-[#1a73e8] focus:ring-2 focus:ring-[#e8f0fe] text-[#202124]"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-[#5f6368] mb-1">
                      {authMode === 'signup'
                        ? 'Password (8+ chars, Uppercase, Lowercase, Digit & Symbol)'
                        : 'Password'}
                    </label>
                    <input
                      type="password"
                      required
                      value={headerPassword}
                      onChange={e => setHeaderPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full text-sm bg-white border border-[#dadce0] px-3.5 py-2.5 rounded-xl focus:outline-none focus:border-[#1a73e8] focus:ring-2 focus:ring-[#e8f0fe] text-[#202124]"
                    />
                    {authMode === 'signup' && headerPassword && (
                      <div className="grid grid-cols-2 gap-1 mt-2 text-[10px]">
                        <span className={headerPassword.length >= 8 ? 'text-[#137333]' : 'text-[#5f6368]'}>
                          {headerPassword.length >= 8 ? '✓' : '○'} 8+ Characters
                        </span>
                        <span className={/[A-Z]/.test(headerPassword) && /[a-z]/.test(headerPassword) ? 'text-[#137333]' : 'text-[#5f6368]'}>
                          {/[A-Z]/.test(headerPassword) && /[a-z]/.test(headerPassword) ? '✓' : '○'} Upper &amp; Lowercase
                        </span>
                        <span className={/[0-9]/.test(headerPassword) ? 'text-[#137333]' : 'text-[#5f6368]'}>
                          {/[0-9]/.test(headerPassword) ? '✓' : '○'} At least 1 Number
                        </span>
                        <span className={/[^A-Za-z0-9]/.test(headerPassword) ? 'text-[#137333]' : 'text-[#5f6368]'}>
                          {/[^A-Za-z0-9]/.test(headerPassword) ? '✓' : '○'} Special Symbol (!@#$)
                        </span>
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={headerAuthBusy}
                    className="w-full py-3 bg-[#1a73e8] hover:bg-[#1557b0] disabled:opacity-50 text-white text-xs font-medium rounded-full transition cursor-pointer shadow-2xs"
                  >
                    {headerAuthBusy
                      ? 'Authorizing Session...'
                      : authMode === 'signup'
                      ? 'Create Account & Open Portal'
                      : 'Sign In & Open Portal'}
                  </button>
                </form>

                <div className="my-4 flex items-center gap-3">
                  <div className="h-[1px] flex-1 bg-[#dadce0]"></div>
                  <span className="text-xs text-[#5f6368]">or</span>
                  <div className="h-[1px] flex-1 bg-[#dadce0]"></div>
                </div>

                <button
                  type="button"
                  disabled={headerAuthBusy}
                  onClick={handleHeaderGoogleSignIn}
                  className="w-full py-2.5 bg-white hover:bg-[#f8f9fa] border border-[#dadce0] text-[#3c4043] text-xs font-medium rounded-full transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  <span>Continue with Google</span>
                </button>
              </div>

            </div>
          )}
        </main>

        <footer className="w-full bg-white border-t border-[#dadce0] py-4 px-4 sm:px-8 text-xs text-[#5f6368]">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <p>&copy; 2026 NeoAegis &bull; Advanced Mail Assessment, Decision and Sandbox Apparatus</p>
            <p className="text-[#80868b]">Per-User Isolated Enclave &bull; Zero-Trust Verification</p>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-[#202124] font-sans antialiased relative overflow-x-hidden flex flex-col">
      
      {/* Google 4-color signature top bar */}
      <div className="w-full h-1 flex shrink-0">
        <div className="w-1/4 bg-[#4285F4]"></div>
        <div className="w-1/4 bg-[#EA4335]"></div>
        <div className="w-1/4 bg-[#FBBC05]"></div>
        <div className="w-1/4 bg-[#34A853]"></div>
      </div>

      {/* ============================================================================ */}
      {/* MOBILE VERTICAL SLIDING MENU BAR (DRAWER)                                    */}
      {/* ============================================================================ */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" id="mobile-sliding-menu">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Sliding Left Vertical Drawer */}
          <div className="relative w-76 max-w-[85vw] bg-white h-full shadow-2xl border-r border-[#dadce0] flex flex-col justify-between z-10 overflow-y-auto">
            <div>
              {/* Drawer Top Brand Header */}
              <div className="p-4 border-b border-[#dadce0] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <NeoAegisSymbol size="sm" />
                  <div className="min-w-0">
                    <h2 className="text-base font-medium text-[#202124] truncate">NeoAegis</h2>
                    <p className="text-[10px] text-[#5f6368] truncate">Security Sandbox Portal</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 text-[#5f6368] hover:text-[#202124] hover:bg-[#f1f3f4] rounded-full transition cursor-pointer"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Per-User Telemetry Summary inside Mobile Drawer */}
              <div className="p-3.5 bg-[#f8f9fa] border-b border-[#dadce0] space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#5f6368] flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-[#1a73e8]" />
                    <span>Saved Data</span>
                  </span>
                  <span className="font-medium text-[#1a73e8]">{savedDataCount} items</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#5f6368] flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#137333]" />
                    <span>Working Hours</span>
                  </span>
                  <span className="font-mono font-medium text-[#137333]">{formatWorkingDuration(workingSeconds)}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#5f6368] flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-[#b06000]" />
                    <span>Emails Parsed</span>
                  </span>
                  <span className="font-medium text-[#202124]">{emailsParsedCount}</span>
                </div>
                <div className="pt-1 border-t border-[#dadce0] flex items-center justify-between text-[11px]">
                  <span className="text-[#5f6368] flex items-center gap-1.5">
                    {darkMode ? <Sun className="w-3.5 h-3.5 text-[#fbbc04]" /> : <Moon className="w-3.5 h-3.5 text-[#1a73e8]" />}
                    <span>Appearance</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setDarkMode(prev => !prev)}
                    className="px-2.5 py-1 bg-white border border-[#dadce0] rounded-full text-[10px] font-medium text-[#1a73e8] cursor-pointer"
                  >
                    {darkMode ? 'Switch to Light' : 'Switch to Dark'}
                  </button>
                </div>
              </div>

              {/* Vertical Feature List */}
              <nav className="p-3 flex flex-col space-y-1" aria-label="Mobile vertical features navigation">
                <span className="px-3 py-1 text-[10px] font-medium text-[#5f6368] uppercase tracking-wider">
                  Portal Features
                </span>
                {navItems.map(item => {
                  const IconComponent = item.icon;
                  const active = currentTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setCurrentTab(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-medium transition flex items-center justify-between cursor-pointer ${
                        active
                          ? 'bg-[#e8f0fe] text-[#1967d2]'
                          : 'text-[#3c4043] hover:bg-[#f1f3f4]'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <IconComponent className="w-4 h-4 shrink-0" />
                        <span>{item.label}</span>
                      </span>
                      {item.badge !== undefined && item.badge > 0 && (
                        <span className="px-2 py-0.5 text-[10px] bg-[#fce8e6] text-[#c5221f] rounded-full font-medium">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Drawer Footer: User Info & Sign Out */}
            {currentUser && (
              <div className="p-4 border-t border-[#dadce0] bg-[#f8f9fa] space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-[#1a73e8] text-white flex items-center justify-center font-medium text-xs uppercase shrink-0">
                    {(currentUser.displayName || currentUser.email || 'A').charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-[#202124] truncate">
                      {currentUser.displayName || currentUser.email?.split('@')[0]}
                    </p>
                    <p className="text-[11px] text-[#5f6368] truncate">{currentUser.email}</p>
                    {currentUser.phoneNumber && (
                      <p className="text-[10px] text-[#1a73e8] font-mono truncate">{currentUser.phoneNumber}</p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleHeaderLogout}
                  className="w-full py-2 bg-white hover:bg-[#fce8e6] text-[#d93025] border border-[#dadce0] rounded-full text-xs font-medium transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out of Portal</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Google Sites / Workspace Sticky Top Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-[#dadce0]" id="main-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          {/* Left: Hamburger Sliding Menu Button (Mobile/Phone) + Dedicated NeoAegis Symbol & Brand Name */}
          <div className="flex items-center space-x-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-1 text-[#5f6368] hover:text-[#202124] hover:bg-[#f1f3f4] rounded-full transition cursor-pointer shrink-0"
              aria-label="Open vertical features menu"
              id="mobile-menu-trigger"
            >
              <Menu className="w-5 h-5" />
            </button>

            <NeoAegisSymbol size="md" />

            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h1 className="text-lg sm:text-xl font-medium text-[#202124] tracking-tight leading-none truncate">
                  NeoAegis
                </h1>
                <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 bg-[#e8f0fe] text-[#1967d2] text-[11px] font-medium rounded-full">
                  Workspace Security
                </span>
              </div>
              <p className="text-xs text-[#5f6368] font-normal mt-0.5 truncate">
                Advanced Mail Assessment, Decision and Sandbox Apparatus
              </p>
            </div>
          </div>

          {/* Right Corner Header: Overall Per-User Telemetry Pills + User Session Controls */}
          <div className="flex items-center justify-end gap-2.5 text-xs relative shrink-0" ref={authDropdownRef}>
            {/* Overall Project Telemetry Strip (Saved Data, Working Hours, Emails Parsed) */}
            <div className="hidden xl:flex items-center gap-3 px-3.5 py-1.5 bg-[#f8f9fa] border border-[#dadce0] rounded-full text-[#5f6368]">
              <span className="flex items-center gap-1.5" title="Total Saved Data in your personal vault">
                <Database className="w-3.5 h-3.5 text-[#1a73e8]" />
                <span>Saved Data: <strong className="text-[#202124] font-medium">{savedDataCount}</strong></span>
              </span>
              <span className="text-[#dadce0]">|</span>
              <span className="flex items-center gap-1.5" title="Your cumulative Working Hours Duration">
                <Clock className="w-3.5 h-3.5 text-[#137333]" />
                <span>Working Hours: <strong className="text-[#137333] font-mono font-medium">{formatWorkingDuration(workingSeconds)}</strong></span>
              </span>
              <span className="text-[#dadce0]">|</span>
              <span className="flex items-center gap-1.5" title="Total Emails Parsed under your profile">
                <Mail className="w-3.5 h-3.5 text-[#b06000]" />
                <span>Emails Parsed: <strong className="text-[#202124] font-medium">{emailsParsedCount}</strong></span>
              </span>
            </div>

            {/* Dark Mode Toggle Button in Header */}
            <button
              type="button"
              onClick={() => setDarkMode(prev => !prev)}
              className="px-3 py-1.5 bg-[#f8f9fa] hover:bg-[#e8f0fe] text-[#3c4043] border border-[#dadce0] rounded-full text-xs font-medium transition flex items-center gap-1.5 cursor-pointer"
              title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label="Toggle dark mode"
              id="header-dark-mode-toggle"
            >
              {darkMode ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-[#fbbc04]" />
                  <span className="hidden md:inline">Light Mode</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-[#1a73e8]" />
                  <span className="hidden md:inline">Dark Mode</span>
                </>
              )}
            </button>

            {currentUser && (
              <div className="flex items-center gap-2" id="header-user-session">
                <button
                  type="button"
                  onClick={() => setCurrentTab('profile')}
                  className="flex items-center gap-2.5 pl-1.5 pr-3 py-1 bg-white hover:bg-[#f8f9fa] border border-[#dadce0] rounded-full transition cursor-pointer text-left"
                  title="Open Secure Profile Enclave"
                >
                  <div className="w-7 h-7 rounded-full bg-[#1a73e8] text-white flex items-center justify-center font-medium text-xs uppercase shrink-0">
                    {(currentUser.displayName || currentUser.email || 'A').charAt(0)}
                  </div>
                  <div className="hidden sm:block max-w-[155px]">
                    <p className="text-xs font-medium text-[#202124] truncate leading-tight">
                      {currentUser.displayName || currentUser.email?.split('@')[0] || 'Analyst'}
                    </p>
                    <p className="text-[10px] text-[#1e8e3e] truncate leading-tight font-medium">
                      {currentUser.phoneNumber ? currentUser.phoneNumber : 'Isolated Vault'}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleHeaderLogout}
                  className="px-3 py-2 bg-white hover:bg-[#fce8e6] text-[#5f6368] hover:text-[#d93025] border border-[#dadce0] hover:border-[#fad2cf] rounded-full text-xs font-medium transition flex items-center gap-1.5 cursor-pointer"
                  title="Sign out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Sign out</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Compact Overall Telemetry Bar for Mobile / Tablet / Medium Desktop */}
        <div className="xl:hidden bg-[#f8f9fa] border-t border-[#dadce0] px-4 py-1.5">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 text-[11px] text-[#5f6368] overflow-x-auto no-scrollbar whitespace-nowrap">
            <span className="flex items-center gap-1">
              <Database className="w-3 h-3 text-[#1a73e8]" />
              <span>Saved Data: <strong className="text-[#202124] font-medium">{savedDataCount}</strong></span>
            </span>
            <span className="text-[#dadce0]">&bull;</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-[#137333]" />
              <span>Working Hours: <strong className="text-[#137333] font-mono font-medium">{formatWorkingDuration(workingSeconds)}</strong></span>
            </span>
            <span className="text-[#dadce0]">&bull;</span>
            <span className="flex items-center gap-1">
              <Mail className="w-3 h-3 text-[#b06000]" />
              <span>Emails Parsed: <strong className="text-[#202124] font-medium">{emailsParsedCount}</strong></span>
            </span>
          </div>
        </div>

        {/* Desktop Horizontal Navigation Bar (Hidden on Phone where Vertical Sliding Menu is used) */}
        <div className="hidden lg:block bg-white border-t border-[#f1f3f4]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center overflow-x-auto no-scrollbar gap-1 py-1.5" id="tab-controls-root">
            {navItems.map(item => {
              const IconComponent = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentTab(item.id)}
                  className={`px-3.5 py-2 text-xs font-medium rounded-full transition duration-150 flex items-center space-x-2 relative shrink-0 cursor-pointer ${
                    currentTab === item.id 
                      ? 'bg-[#e8f0fe] text-[#1967d2]' 
                      : 'text-[#5f6368] hover:text-[#202124] hover:bg-[#f1f3f4]'
                  }`}
                >
                  <IconComponent className="h-4 w-4" />
                  <span>{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="w-2 h-2 rounded-full bg-[#ea4335] ml-1"></span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Container Layout */}
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 md:py-8 flex-1">
        
        {/* Content Wrapper + Side element splitter */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Main workspace container based on active Tab selection */}
          <div className="lg:col-span-8 bg-white border border-[#dadce0] p-5 md:p-6 rounded-2xl min-h-[500px]">
            {currentTab === 'dashboard' && (
              <Dashboard 
                records={emails} 
                selectedEmail={selectedEmail} 
                onSelectEmail={setSelectedEmail}
                savedDataCount={savedDataCount}
                formattedWorkingDuration={formatWorkingDuration(workingSeconds)}
                emailsParsedCount={emailsParsedCount}
                currentUserUid={currentUser?.uid}
                activeModel={activeModel}
                onExportLogged={() => {
                  if (currentUser) {
                    syncUserIsolatedVault(currentUser.uid);
                  }
                }}
              />
            )}

            {currentTab === 'email' && (
              <EmailAnalyzer 
                selectedEmail={selectedEmail} 
                onAnalyzeFinished={handleSingleEmailAnalyzed}
                activeModel={activeModel}
                modelVersion={modelVersion}
                onSendToTrainer={async (sample) => {
                  setIncomingEmailSamples(prev => [sample, ...prev]);
                  if (currentUser) {
                    const current = loadUserTrainerSamples(currentUser.uid);
                    if (!current.some(s => s.id === sample.id)) {
                      saveUserTrainerSamples(currentUser.uid, [sample, ...current]);
                    }
                    const tierInfo = classifyGranularEmailTier(
                      sample.subject,
                      sample.body,
                      sample.sender,
                      sample.rawHeaders || '',
                      sample.granularTier || sample.label
                    );
                    await saveUserDatasetEmailsBatch(currentUser.uid, [
                      {
                        id: sample.id,
                        subject: sample.subject,
                        sender: sample.sender,
                        body: sample.body,
                        rawHeaders: sample.rawHeaders || `From: ${sample.sender}`,
                        label: sample.label,
                        granularTier: sample.granularTier || tierInfo.granularTier,
                        spamScore: 0,
                        phishingLikelihood: 0,
                        source: 'audit_stream'
                      }
                    ]);
                    const idToken = await getFirebaseIdTokenSafely();
                    const synced = await contributeSamplesToBackend(
                      currentUser.uid,
                      idToken,
                      [sample],
                      undefined,
                      true
                    );
                    handleCollectiveModelSynced(synced.model, synced.stats);
                  }
                  setPreferredTrainerUnit('text');
                }}
              />
            )}

            {currentTab === 'image' && (
              <ImageAnalyzer
                currentUserUid={currentUser?.uid}
                syncTick={vaultSyncTick}
                activeModel={activeModel}
                modelVersion={modelVersion}
                onSendToTrainer={async (imgSample) => {
                  setIncomingImageSamples(prev => [imgSample, ...prev]);
                  if (currentUser) {
                    const existingImgs = loadUserTrainerImages(currentUser.uid) || [];
                    const mergedImgs = mergeImagesByKey([imgSample], existingImgs);
                    saveUserTrainerImages(currentUser.uid, mergedImgs);
                    saveUserImageAssessment(currentUser.uid, imgSample);
                    const idToken = await getFirebaseIdTokenSafely();
                    await syncUserWorkspaceToBackend(currentUser.uid, idToken, {
                      trainerImages: mergedImgs,
                      imageAssessments: loadUserImageAssessments(currentUser.uid)
                    });
                    const synced = await contributeImagesToBackend(
                      currentUser.uid,
                      idToken,
                      [imgSample],
                      undefined,
                      true
                    );
                    if (synced.ok) {
                      handleCollectiveModelSynced(null, synced.stats);
                    }
                  }
                  setPreferredTrainerUnit('image');
                }}
                onRecordImageAssessment={async (imgSample) => {
                  if (currentUser) {
                    saveUserImageAssessment(currentUser.uid, imgSample);
                    const idToken = await getFirebaseIdTokenSafely();
                    await syncUserWorkspaceToBackend(currentUser.uid, idToken, {
                      imageAssessments: loadUserImageAssessments(currentUser.uid)
                    });
                    const synced = await contributeImagesToBackend(
                      currentUser.uid,
                      idToken,
                      [imgSample],
                      undefined,
                      true
                    );
                    if (synced.ok) {
                      handleCollectiveModelSynced(null, synced.stats);
                    }
                  }
                }}
                onSaveScanToVault={handleSingleEmailAnalyzed}
              />
            )}

            {currentTab === 'batch' && (
              <BatchAnalyzer 
                currentUserUid={currentUser?.uid}
                onAddEmailRecords={handleAddNewEmails}
                onCollectiveModelSynced={handleCollectiveModelSynced}
                onSendBatchToTrainer={async (batchSamples) => {
                  setIncomingEmailSamples(prev => [...batchSamples, ...prev]);
                  if (currentUser) {
                    const current = loadUserTrainerSamples(currentUser.uid);
                    const existingIds = new Set(current.map(s => s.id));
                    const additions = batchSamples.filter(s => !existingIds.has(s.id));
                    if (additions.length > 0) {
                      saveUserTrainerSamples(currentUser.uid, [...additions, ...current]);
                    }
                    const idToken = await getFirebaseIdTokenSafely();
                    const synced = await contributeSamplesToBackend(
                      currentUser.uid,
                      idToken,
                      batchSamples,
                      undefined,
                      true
                    );
                    handleCollectiveModelSynced(synced.model, synced.stats);
                  }
                  setPreferredTrainerUnit('text');
                  setCurrentTab('trainer');
                }}
                activeModel={activeModel}
                modelVersion={modelVersion}
                syncTick={vaultSyncTick}
              />
            )}

            {currentTab === 'rag' && (
              <ChatAssistant />
            )}

            {currentTab === 'metrics' && (
              <PerformanceMetrics 
                records={emails}
                activeModel={activeModel}
                currentUserUid={currentUser?.uid}
                collectiveStats={collectiveStats}
                syncTick={vaultSyncTick}
              />
            )}

            {currentTab === 'trainer' && currentUser && (
              <TrainerLab
                currentUserUid={currentUser.uid}
                auditEmails={emails}
                activeModel={activeModel}
                onModelUpdated={handleModelUpdated}
                incomingEmailSamples={incomingEmailSamples}
                incomingImageSamples={incomingImageSamples}
                preferredUnit={preferredTrainerUnit}
                onArchiveUploadedCsvEmails={handleArchiveTrainerCsvEmails}
                collectiveStats={collectiveStats}
                onCollectiveModelSynced={handleCollectiveModelSynced}
                syncTick={vaultSyncTick}
              />
            )}

            {currentTab === 'profile' && (
              <UserProfile 
                selectedEmail={selectedEmail} 
                scannedEmailsList={emails}
                initialAuthMode={authMode}
                workingSeconds={workingSeconds}
                emailsParsedCount={emailsParsedCount}
                onTriggerRefresh={async () => {
                  if (currentUser) {
                    await syncUserIsolatedVault(currentUser.uid);
                  }
                }}
              />
            )}

            {currentTab === 'about' && (
              <AboutSection
                savedDataCount={savedDataCount}
                formattedWorkingDuration={formatWorkingDuration(workingSeconds)}
                emailsParsedCount={emailsParsedCount}
                userEmail={currentUser?.email}
              />
            )}
          </div>

          {/* Right quick list bar: Personal Isolated Inbound Audit Stream */}
          <aside className="lg:col-span-4 bg-white border border-[#dadce0] p-5 rounded-2xl max-h-[720px] overflow-y-auto space-y-4">
            
            <div className="border-b border-[#f1f3f4] pb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-sm font-medium text-[#202124] truncate">Personal Audit Stream</h2>
                <InfoButton
                  title="Personal Audit Stream"
                  description={`Isolated to ${currentUser?.email || 'your account'}. Other users' records and telemetry are never displayed.`}
                  align="left"
                />
              </div>
              <span className="px-2 py-0.5 bg-[#e8f0fe] text-[#1967d2] rounded-full text-[11px] font-medium shrink-0">
                {emails.length} messages
              </span>
            </div>

            {emails.length === 0 ? (
              <div className="p-6 bg-[#f8f9fa] border border-[#dadce0] rounded-xl text-center space-y-3">
                <Mail className="w-7 h-7 text-[#1a73e8] mx-auto" />
                <div className="space-y-1">
                  <h3 className="text-xs font-medium text-[#202124]">Blank Personal Stream</h3>
                  <p className="text-[11px] text-[#5f6368] leading-relaxed">
                    Your private vault starts completely empty with zero pre-made emails. Scan a message in <strong className="text-[#202124]">Mail Body Scanner</strong> or upload a CSV in <strong className="text-[#202124]">Batch CSV Auditor</strong>.
                  </p>
                </div>
                <div className="flex flex-col gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setCurrentTab('email')}
                    className="w-full py-2 bg-[#1a73e8] hover:bg-[#1557b0] text-white text-xs font-medium rounded-full transition cursor-pointer"
                  >
                    Open Mail Body Scanner
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentTab('batch')}
                    className="w-full py-2 bg-white hover:bg-[#e8f0fe] text-[#1a73e8] border border-[#dadce0] text-xs font-medium rounded-full transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Upload Batch CSV</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {emails.map(mail => {
                  const isActive = selectedEmail?.id === mail.id;
                  
                  return (
                    <div 
                      key={mail.id}
                      onClick={() => {
                        setSelectedEmail(mail);
                        if (currentTab !== 'dashboard' && currentTab !== 'email') {
                          setCurrentTab('dashboard');
                        }
                      }}
                      className={`p-3.5 rounded-xl border text-left transition duration-150 cursor-pointer ${
                        isActive 
                          ? 'bg-[#e8f0fe]/60 border-[#1a73e8]' 
                          : 'bg-white border-[#dadce0] hover:bg-[#f8f9fa]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-mono font-medium text-[#5f6368]">{mail.id.toUpperCase()}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          mail.metrics.spamScore > 50 
                            ? 'bg-[#fce8e6] text-[#c5221f]' 
                            : 'bg-[#e6f4ea] text-[#137333]'
                        }`}>
                          Risk: {mail.metrics.spamScore}%
                        </span>
                      </div>

                      <h4 className="text-xs font-medium text-[#202124] mt-1.5 truncate">{mail.subject}</h4>
                      <p className="text-[11px] text-[#5f6368] mt-0.5 truncate">{mail.sender}</p>

                      <div className="mt-2.5 pt-2 border-t border-[#f1f3f4] flex items-center justify-between text-[11px] text-[#5f6368]">
                        <span>{new Date(mail.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="text-[#1a73e8] font-medium flex items-center">
                          <span>Inspect</span>
                          <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </aside>

        </div>

      </main>

      {/* Google Sites Style Clean Footer & Live Status Bar */}
      <div className="w-full bg-white border-t border-[#dadce0] mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-[#f1f3f4] text-xs">
          <div className="flex items-center gap-3 overflow-x-auto no-scrollbar w-full sm:w-auto whitespace-nowrap">
            <span className="px-2.5 py-0.5 bg-[#e8f0fe] text-[#1967d2] text-[11px] rounded-full font-medium">
              Personal Telemetry
            </span>
            <span className="text-[#5f6368] text-xs truncate">
              Saved Data: <strong className="text-[#1a73e8] font-medium">{savedDataCount} items</strong> &middot; 
              Working Duration: <strong className="text-[#137333] font-mono font-medium">{formatWorkingDuration(workingSeconds)}</strong> &middot; 
              Emails Parsed: <strong className="text-[#202124] font-medium">{emailsParsedCount}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setCurrentTab('about')}
            className="text-xs text-[#1a73e8] hover:underline font-medium shrink-0 cursor-pointer"
          >
            About NeoAegis &amp; Software Aim &rarr;
          </button>
        </div>

        <footer className="max-w-7xl mx-auto py-6 px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#5f6368]">
          <div className="flex items-center gap-2">
            <NeoAegisSymbol size="sm" />
            <p>&copy; 2026 NeoAegis &bull; Advanced Mail Assessment, Decision and Sandbox Apparatus</p>
          </div>
          <p className="text-[#80868b]">Google Workspace Security Design &bull; Per-User Isolated Sandbox</p>
        </footer>
      </div>

    </div>
  );
}
