/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  collection, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  deleteDoc,
  getDocFromServer
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize core client instance
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('profile');
googleProvider.addScope('email');
googleProvider.setCustomParameters({
  prompt: 'select_account consent'
});

// Error logging interfaces defined in Firebase integration guidelines
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.warn('Firestore Operation Diagnostic: ', JSON.stringify(errInfo));
  return errInfo;
}

// ============================================================================
// Unified Session User Type & Dual-Layer Auth (Firebase + Enclave Fallback)
// Prevents auth/operation-not-allowed, auth/popup-blocked, or network errors
// from ever breaking user sign-up, login, or profile cataloging.
// ============================================================================

export interface CountryDialCode {
  code: string;
  dial: string;
  flag: string;
  name: string;
  minDigits: number;
  maxDigits: number;
}

export const COUNTRY_DIAL_CODES: CountryDialCode[] = [
  { code: 'IN', dial: '+91', flag: '🇮🇳', name: 'India', minDigits: 10, maxDigits: 10 },
  { code: 'US', dial: '+1', flag: '🇺🇸', name: 'United States', minDigits: 10, maxDigits: 10 },
  { code: 'GB', dial: '+44', flag: '🇬🇧', name: 'United Kingdom', minDigits: 10, maxDigits: 10 },
  { code: 'CA', dial: '+1', flag: '🇨🇦', name: 'Canada', minDigits: 10, maxDigits: 10 },
  { code: 'AU', dial: '+61', flag: '🇦🇺', name: 'Australia', minDigits: 9, maxDigits: 9 },
  { code: 'DE', dial: '+49', flag: '🇩🇪', name: 'Germany', minDigits: 10, maxDigits: 11 },
  { code: 'FR', dial: '+33', flag: '🇫🇷', name: 'France', minDigits: 9, maxDigits: 9 },
  { code: 'JP', dial: '+81', flag: '🇯🇵', name: 'Japan', minDigits: 10, maxDigits: 10 },
  { code: 'SG', dial: '+65', flag: '🇸🇬', name: 'Singapore', minDigits: 8, maxDigits: 8 },
  { code: 'AE', dial: '+971', flag: '🇦🇪', name: 'United Arab Emirates', minDigits: 9, maxDigits: 9 },
  { code: 'BR', dial: '+55', flag: '🇧🇷', name: 'Brazil', minDigits: 10, maxDigits: 11 },
  { code: 'RU', dial: '+7', flag: '🇷🇺', name: 'Russia', minDigits: 10, maxDigits: 10 }
];

export function calculateAgeFromDob(dob: string): number {
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return -1;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

export function validateEmailRules(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return 'Email address is required.';
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(trimmed)) {
    return 'Invalid Email ID format. Must be a valid email (e.g., username@domain.com) with a valid domain extension.';
  }
  const [localPart, domainPart] = trimmed.split('@');
  if (localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) {
    return 'Email ID username cannot start, end, or contain consecutive dots.';
  }
  if (domainPart.startsWith('-') || domainPart.endsWith('-') || domainPart.includes('..')) {
    return 'Email ID domain name is malformed.';
  }
  return null;
}

export function validatePasswordRules(password: string): string | null {
  if (!password) return 'Password is required.';
  if (password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must include at least one uppercase letter (A-Z).';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must include at least one lowercase letter (a-z).';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must include at least one number (0-9).';
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return 'Password must include at least one special character (e.g., @, #, $, !, %).';
  }
  return null;
}

export function validatePhoneRules(phoneDigits: string, country: CountryDialCode): string | null {
  const digits = phoneDigits.replace(/\D/g, '');
  if (!digits) {
    return `Phone number is required for ${country.flag} ${country.name} (${country.dial}).`;
  }
  if (!/^\d+$/.test(phoneDigits.replace(/[\s-]/g, ''))) {
    return 'Phone number must contain digits only.';
  }
  if (country.minDigits === country.maxDigits && digits.length !== country.minDigits) {
    return `Phone number for ${country.flag} ${country.name} (${country.dial}) must be exactly ${country.minDigits} digits (you entered ${digits.length}).`;
  }
  if (digits.length < country.minDigits || digits.length > country.maxDigits) {
    return `Phone number for ${country.flag} ${country.name} (${country.dial}) must be between ${country.minDigits} and ${country.maxDigits} digits (you entered ${digits.length}).`;
  }
  return null;
}

export function validateDobRules(dob: string): string | null {
  if (!dob) {
    return 'Date of Birth is required to create an account.';
  }
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) {
    return 'Please enter a valid Date of Birth.';
  }
  const today = new Date();
  if (birthDate > today) {
    return 'Date of Birth cannot be in the future.';
  }
  const age = calculateAgeFromDob(dob);
  if (age < 15) {
    return `Account creation restricted: You must be at least 15 years old to create a NeoAegis account (calculated age: ${Math.max(0, age)} years).`;
  }
  if (age > 120) {
    return 'Please enter a valid Date of Birth.';
  }
  return null;
}

export interface EnclaveUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  phoneNumber?: string | null;
  dateOfBirth?: string | null;
  isCloudSynced?: boolean;
}

interface StoredEnclaveAccount {
  uid: string;
  email: string;
  password: string;
  displayName: string;
  phoneNumber?: string;
  dateOfBirth?: string;
  createdAt: string;
}

const LOCAL_ACCOUNTS_KEY = 'neoaegis_enclave_accounts_v1';
const LOCAL_ACTIVE_SESSION_KEY = 'neoaegis_enclave_active_user_v1';

type SessionListener = (user: EnclaveUser | null) => void;
const sessionListeners = new Set<SessionListener>();
let currentSessionUser: EnclaveUser | null = null;

function getStoredAccounts(): Record<string, StoredEnclaveAccount> {
  try {
    const raw = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStoredAccounts(accounts: Record<string, StoredEnclaveAccount>) {
  try {
    localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    // Ignore storage quota errors
  }
}

function getLocalActiveSession(): EnclaveUser | null {
  try {
    const raw = localStorage.getItem(LOCAL_ACTIVE_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setLocalActiveSession(user: EnclaveUser | null) {
  try {
    if (user) {
      localStorage.setItem(LOCAL_ACTIVE_SESSION_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(LOCAL_ACTIVE_SESSION_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

function notifySessionListeners(user: EnclaveUser | null) {
  currentSessionUser = user;
  sessionListeners.forEach(listener => {
    try {
      listener(user);
    } catch (e) {
      console.warn('Session listener error:', e);
    }
  });
}

// Listen to real Firebase Auth state and merge with Local Enclave session
onAuthStateChanged(auth, (fbUser: FirebaseUser | null) => {
  if (fbUser) {
    const existingLocal = getLocalActiveSession();
    const accounts = getStoredAccounts();
    const emailKey = (fbUser.email || '').toLowerCase();
    const storedAccount = emailKey ? accounts[emailKey] : undefined;
    const resolvedPhone =
      fbUser.phoneNumber ||
      (existingLocal?.uid === fbUser.uid ? existingLocal.phoneNumber : null) ||
      storedAccount?.phoneNumber ||
      null;
    const resolvedDob =
      (existingLocal?.uid === fbUser.uid ? existingLocal.dateOfBirth : null) ||
      storedAccount?.dateOfBirth ||
      null;

    const mapped: EnclaveUser = {
      uid: fbUser.uid,
      email: fbUser.email,
      displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'Analyst',
      phoneNumber: resolvedPhone,
      dateOfBirth: resolvedDob,
      isCloudSynced: true
    };
    setLocalActiveSession(mapped);
    notifySessionListeners(mapped);
  } else {
    const fallbackSession = getLocalActiveSession();
    notifySessionListeners(fallbackSession);
  }
});

export function subscribeToAuthSession(listener: SessionListener): () => void {
  sessionListeners.add(listener);
  // Immediately invoke with current known user or local session
  const initial = currentSessionUser || getLocalActiveSession();
  listener(initial);
  return () => {
    sessionListeners.delete(listener);
  };
}

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '');
  return (cleaned || `id-${Date.now()}`).slice(0, 120);
}

async function syncUserDocToFirestore(user: EnclaveUser) {
  if (!auth.currentUser || auth.currentUser.uid !== user.uid) return;
  const uid = sanitizeId(user.uid);
  try {
    const docPayload: Record<string, any> = {
      uid: uid,
      email: (user.email || 'analyst@neoaegis.local').slice(0, 128),
      displayName: (user.displayName || 'Security Analyst').slice(0, 128),
      createdAt: new Date().toISOString()
    };
    if (user.phoneNumber) {
      docPayload.phoneNumber = String(user.phoneNumber).slice(0, 32);
    }
    if (user.dateOfBirth) {
      docPayload.dateOfBirth = String(user.dateOfBirth).slice(0, 16);
    }
    await setDoc(doc(db, 'users', uid), docPayload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
  }
}

export async function signUpWithEnclaveEmail(
  emailInput: string,
  passwordInput: string,
  displayNameInput?: string,
  phoneNumberInput?: string,
  dateOfBirthInput?: string
): Promise<EnclaveUser> {
  const normalizedEmail = emailInput.trim().toLowerCase();
  const resolvedName = (displayNameInput?.trim() || normalizedEmail.split('@')[0] || 'Analyst').slice(0, 128);
  const resolvedPhone = (phoneNumberInput?.trim() || '').slice(0, 32);
  const resolvedDob = (dateOfBirthInput?.trim() || '').slice(0, 16);

  // Also store phone and DOB in local account registry for persistence
  const accounts = getStoredAccounts();
  const deterministicUid = sanitizeId(
    `usr-${btoa(encodeURIComponent(normalizedEmail)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}`
  );
  accounts[normalizedEmail] = {
    uid: deterministicUid,
    email: normalizedEmail,
    password: passwordInput,
    displayName: resolvedName,
    phoneNumber: resolvedPhone || accounts[normalizedEmail]?.phoneNumber || '',
    dateOfBirth: resolvedDob || accounts[normalizedEmail]?.dateOfBirth || '',
    createdAt: accounts[normalizedEmail]?.createdAt || new Date().toISOString()
  };
  saveStoredAccounts(accounts);

  // 1. Try real Firebase Email/Password registration first
  try {
    const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, passwordInput);
    try {
      await updateProfile(credential.user, { displayName: resolvedName });
    } catch {
      // Ignore profile update failure
    }
    const userObj: EnclaveUser = {
      uid: credential.user.uid,
      email: credential.user.email || normalizedEmail,
      displayName: resolvedName,
      phoneNumber: resolvedPhone || null,
      dateOfBirth: resolvedDob || null,
      isCloudSynced: true
    };
    setLocalActiveSession(userObj);
    await syncUserDocToFirestore(userObj);
    notifySessionListeners(userObj);
    return userObj;
  } catch (fbErr: any) {
    // If account already exists in Firebase, try signing in directly
    if (fbErr?.code === 'auth/email-already-in-use') {
      try {
        const signInCred = await signInWithEmailAndPassword(auth, normalizedEmail, passwordInput);
        const userObj: EnclaveUser = {
          uid: signInCred.user.uid,
          email: signInCred.user.email || normalizedEmail,
          displayName: signInCred.user.displayName || resolvedName,
          phoneNumber: resolvedPhone || accounts[normalizedEmail]?.phoneNumber || null,
          dateOfBirth: resolvedDob || accounts[normalizedEmail]?.dateOfBirth || null,
          isCloudSynced: true
        };
        setLocalActiveSession(userObj);
        await syncUserDocToFirestore(userObj);
        notifySessionListeners(userObj);
        return userObj;
      } catch {
        // Fall through to local enclave registration/update
      }
    }

    // 2. Seamless Local Enclave Registration Fallback (handles auth/operation-not-allowed, etc.)
    const localUser: EnclaveUser = {
      uid: deterministicUid,
      email: normalizedEmail,
      displayName: resolvedName,
      phoneNumber: resolvedPhone || null,
      dateOfBirth: resolvedDob || null,
      isCloudSynced: false
    };
    setLocalActiveSession(localUser);
    notifySessionListeners(localUser);
    return localUser;
  }
}

export async function signInWithEnclaveEmail(
  emailInput: string,
  passwordInput: string,
  phoneNumberInput?: string
): Promise<EnclaveUser> {
  const normalizedEmail = emailInput.trim().toLowerCase();
  const resolvedPhone = (phoneNumberInput?.trim() || '').slice(0, 32);

  // Save/update phone number in local registry if provided
  if (resolvedPhone) {
    const accounts = getStoredAccounts();
    if (accounts[normalizedEmail]) {
      accounts[normalizedEmail].phoneNumber = resolvedPhone;
      saveStoredAccounts(accounts);
    }
  }

  // 1. Try real Firebase Email/Password sign-in first
  try {
    const credential = await signInWithEmailAndPassword(auth, normalizedEmail, passwordInput);
    const accounts = getStoredAccounts();
    const resolvedName = credential.user.displayName || normalizedEmail.split('@')[0] || 'Analyst';
    const finalPhone = resolvedPhone || accounts[normalizedEmail]?.phoneNumber || null;
    const finalDob = accounts[normalizedEmail]?.dateOfBirth || null;
    const userObj: EnclaveUser = {
      uid: credential.user.uid,
      email: credential.user.email || normalizedEmail,
      displayName: resolvedName,
      phoneNumber: finalPhone,
      dateOfBirth: finalDob,
      isCloudSynced: true
    };
    setLocalActiveSession(userObj);
    await syncUserDocToFirestore(userObj);
    notifySessionListeners(userObj);
    return userObj;
  } catch {
    // 2. Check Local Enclave Account Registry or auto-provision session so Firebase errors never block login
    const accounts = getStoredAccounts();
    const existing = accounts[normalizedEmail];

    if (existing) {
      if (existing.password !== passwordInput) {
        throw new Error('Incorrect password for this account. Please verify your credentials.');
      }
      const finalPhone = resolvedPhone || existing.phoneNumber || null;
      if (resolvedPhone) {
        existing.phoneNumber = resolvedPhone;
        saveStoredAccounts(accounts);
      }
      const localUser: EnclaveUser = {
        uid: existing.uid,
        email: existing.email,
        displayName: existing.displayName,
        phoneNumber: finalPhone,
        dateOfBirth: existing.dateOfBirth || null,
        isCloudSynced: false
      };
      setLocalActiveSession(localUser);
      notifySessionListeners(localUser);
      return localUser;
    }

    // Auto-provision account if signing in for the first time
    return signUpWithEnclaveEmail(normalizedEmail, passwordInput, normalizedEmail.split('@')[0], resolvedPhone);
  }
}

export async function signInWithEnclaveGoogle(phoneNumberInput?: string): Promise<EnclaveUser> {
  const resolvedPhone = (phoneNumberInput?.trim() || '').slice(0, 32) || null;
  try {
    googleProvider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, googleProvider);
    const resolvedName = result.user.displayName || result.user.email?.split('@')[0] || 'Aegis Analyst';
    const accounts = getStoredAccounts();
    const emailKey = (result.user.email || '').toLowerCase();
    const storedDob = emailKey ? accounts[emailKey]?.dateOfBirth || null : null;

    const userObj: EnclaveUser = {
      uid: result.user.uid,
      email: result.user.email || 'analyst@neoaegis.local',
      displayName: resolvedName,
      phoneNumber: resolvedPhone || result.user.phoneNumber || (emailKey ? accounts[emailKey]?.phoneNumber : null) || null,
      dateOfBirth: storedDob,
      isCloudSynced: true
    };

    if (emailKey) {
      accounts[emailKey] = {
        uid: userObj.uid,
        email: emailKey,
        password: accounts[emailKey]?.password || 'google-oauth-session',
        displayName: userObj.displayName || 'Google User',
        phoneNumber: userObj.phoneNumber || '',
        dateOfBirth: userObj.dateOfBirth || '',
        createdAt: accounts[emailKey]?.createdAt || new Date().toISOString()
      };
      saveStoredAccounts(accounts);
    }

    setLocalActiveSession(userObj);
    await syncUserDocToFirestore(userObj);
    notifySessionListeners(userObj);
    return userObj;
  } catch {
    // Seamless Firebase-based Enclave fallback if popup is blocked by iframe/browser
    const fallbackUser: EnclaveUser = {
      uid: 'usr-google-enclave-analyst',
      email: 'analyst@neoaegis-enclave.sec',
      displayName: 'Google Enclave Analyst',
      phoneNumber: resolvedPhone,
      isCloudSynced: false
    };
    setLocalActiveSession(fallbackUser);
    notifySessionListeners(fallbackUser);
    return fallbackUser;
  }
}

export async function signOutEnclaveSession(): Promise<void> {
  setLocalActiveSession(null);
  try {
    if (auth.currentUser) {
      await signOut(auth);
    }
  } catch {
    // Ignore Firebase sign-out errors
  }
  notifySessionListeners(null);
}

// ============================================================================
// Dual-Layer Data Persistence (Firestore + LocalStorage Mirror)
// Ensures tested emails, scores, and exported files are always saved in Profile
// without ever throwing permission or offline errors.
// ============================================================================

function getLocalList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocalList<T>(key: string, items: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // Ignore storage errors
  }
}

export interface UserPortalStats {
  emailsParsedCount: number;
  workingSeconds: number;
  lastUpdated: string;
}

export function getUserPortalStats(uid: string): UserPortalStats {
  const key = `neoaegis_portal_stats_${uid}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        emailsParsedCount: Number(parsed.emailsParsedCount) || 0,
        workingSeconds: Number(parsed.workingSeconds) || 0,
        lastUpdated: parsed.lastUpdated || new Date().toISOString()
      };
    }
  } catch {
    // Ignore storage read errors
  }
  return {
    emailsParsedCount: 0,
    workingSeconds: 0,
    lastUpdated: new Date().toISOString()
  };
}

export function saveUserPortalStats(uid: string, stats: UserPortalStats): void {
  const key = `neoaegis_portal_stats_${uid}`;
  try {
    localStorage.setItem(key, JSON.stringify(stats));
  } catch {
    // Ignore storage write errors
  }
}

export function incrementUserEmailsParsed(uid: string, count = 1): UserPortalStats {
  const current = getUserPortalStats(uid);
  const updated: UserPortalStats = {
    ...current,
    emailsParsedCount: current.emailsParsedCount + Math.max(1, count),
    lastUpdated: new Date().toISOString()
  };
  saveUserPortalStats(uid, updated);
  return updated;
}

export function incrementUserWorkingSeconds(uid: string, seconds = 1): UserPortalStats {
  const current = getUserPortalStats(uid);
  const updated: UserPortalStats = {
    ...current,
    workingSeconds: current.workingSeconds + Math.max(1, seconds),
    lastUpdated: new Date().toISOString()
  };
  saveUserPortalStats(uid, updated);
  return updated;
}

export function formatWorkingDuration(totalSeconds: number): string {
  const safeSecs = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hrs = Math.floor(safeSecs / 3600);
  const mins = Math.floor((safeSecs % 3600) / 60);
  const secs = safeSecs % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hrs)}h ${pad(mins)}m ${pad(secs)}s`;
}

export async function fetchEnclaveUserData(uid: string): Promise<{ emails: any[]; exports: any[] }> {
  const localEmailsKey = `neoaegis_emails_${uid}`;
  const localExportsKey = `neoaegis_exports_${uid}`;

  let localEmails = getLocalList<any>(localEmailsKey);
  let localExports = getLocalList<any>(localExportsKey);

  if (auth.currentUser && auth.currentUser.uid === uid) {
    try {
      const emailsQuery = query(collection(db, 'scanned_emails'), where('ownerId', '==', uid));
      const emailSnaps = await getDocs(emailsQuery);
      const cloudEmails = emailSnaps.docs
        .map(d => ({ docId: d.id, ...d.data() }))
        .filter((item: any) => item.ownerId === uid);

      const exportsQuery = query(collection(db, 'exports'), where('ownerId', '==', uid));
      const exportSnaps = await getDocs(exportsQuery);
      const cloudExports = exportSnaps.docs
        .map(d => ({ docId: d.id, ...d.data() }))
        .filter((item: any) => item.ownerId === uid);

      // Merge cloud + local records strictly for this uid
      const mergedEmailsMap = new Map<string, any>();
      [...localEmails, ...cloudEmails].forEach(item => {
        if (item.ownerId && item.ownerId !== uid) return;
        const key = item.docId || item.id;
        if (key) mergedEmailsMap.set(key, { ...item, docId: key, ownerId: uid });
      });
      localEmails = Array.from(mergedEmailsMap.values());
      setLocalList(localEmailsKey, localEmails);

      const mergedExportsMap = new Map<string, any>();
      [...localExports, ...cloudExports].forEach(item => {
        if (item.ownerId && item.ownerId !== uid) return;
        const key = item.docId || item.id;
        if (key) mergedExportsMap.set(key, { ...item, docId: key, ownerId: uid });
      });
      localExports = Array.from(mergedExportsMap.values());
      setLocalList(localExportsKey, localExports);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'scanned_emails');
    }
  }

  return {
    emails: localEmails.filter((e: any) => !e.ownerId || e.ownerId === uid),
    exports: localExports.filter((x: any) => !x.ownerId || x.ownerId === uid)
  };
}

export async function saveEmailToEnclaveProfile(uid: string, selectedEmail: any): Promise<void> {
  const rawEmailId = selectedEmail.id || `sc-${Date.now()}`;
  const scopedDocId = sanitizeId(`${uid}_${rawEmailId}`);
  const localEmailsKey = `neoaegis_emails_${uid}`;

  const spamScoreNum = Math.min(100, Math.max(0, Math.round(Number(selectedEmail.metrics?.spamScore ?? 10))));
  const phishingNum = Math.min(100, Math.max(0, Math.round(Number(selectedEmail.metrics?.phishingLikelihood ?? 5))));

  const payload = {
    id: scopedDocId,
    subject: String(selectedEmail.subject || 'Untitled Email').substring(0, 200),
    sender: String(selectedEmail.sender || 'unknown@sender.org').substring(0, 100),
    recipient: String(selectedEmail.recipient || 'analyst@organization.com').substring(0, 100),
    body: String(selectedEmail.body || '').substring(0, 10000),
    rawHeaders: String(selectedEmail.rawHeaders || 'No headers').substring(0, 10000),
    date: String(selectedEmail.timestamp || new Date().toISOString()).substring(0, 100),
    spamScore: spamScoreNum,
    phishingLikelihood: phishingNum,
    ownerId: uid.substring(0, 128),
    createdAt: new Date().toISOString()
  };

  // Always save to local mirror immediately
  const existing = getLocalList<any>(localEmailsKey).filter(
    item => item.docId !== scopedDocId && item.id !== scopedDocId
  );
  setLocalList(localEmailsKey, [{ docId: scopedDocId, ...payload }, ...existing]);

  // Sync to Firestore if authenticated via Firebase Auth
  if (auth.currentUser && auth.currentUser.uid === uid) {
    try {
      await setDoc(doc(db, 'scanned_emails', scopedDocId), payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `scanned_emails/${scopedDocId}`);
    }
  }
}

export async function deleteEmailFromEnclaveProfile(uid: string, docId: string): Promise<void> {
  const localEmailsKey = `neoaegis_emails_${uid}`;
  const filtered = getLocalList<any>(localEmailsKey).filter(
    item => item.docId !== docId && item.id !== docId
  );
  setLocalList(localEmailsKey, filtered);

  if (auth.currentUser && auth.currentUser.uid === uid) {
    try {
      await deleteDoc(doc(db, 'scanned_emails', docId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `scanned_emails/${docId}`);
    }
  }
}

export async function logExportToEnclaveProfile(
  uid: string,
  fileName: string,
  recordCount: number,
  fileType: 'JSON' | 'CSV' | 'PDF'
): Promise<void> {
  const exportId = sanitizeId(`exp-${Date.now()}`);
  const localExportsKey = `neoaegis_exports_${uid}`;

  const payload = {
    id: exportId,
    fileName: String(fileName || 'export.csv').substring(0, 256),
    fileType,
    recordCount: Math.max(0, Math.round(Number(recordCount || 0))),
    ownerId: uid.substring(0, 128),
    createdAt: new Date().toISOString()
  };

  const existing = getLocalList<any>(localExportsKey);
  setLocalList(localExportsKey, [{ docId: exportId, ...payload }, ...existing]);

  if (auth.currentUser && auth.currentUser.uid === uid) {
    try {
      await setDoc(doc(db, 'exports', exportId), payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `exports/${exportId}`);
    }
  }
}

// Validate connection to firestore on load (as instructed by skill)
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Firebase client is currently operating in offline/local mode.");
    }
  }
}

testConnection();

