/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  EnclaveUser,
  subscribeToAuthSession,
  signUpWithEnclaveEmail,
  signInWithEnclaveEmail,
  signInWithEnclaveGoogle,
  signOutEnclaveSession,
  fetchEnclaveUserData,
  saveEmailToEnclaveProfile,
  deleteEmailFromEnclaveProfile,
  logExportToEnclaveProfile
} from '../lib/firebase';
import { 
  User, Lock, Mail, LogOut, CheckCircle2, ShieldCheck, Clock, 
  Download, FileSpreadsheet, AlertTriangle, Languages, Sparkles, 
  Cpu, Network, GitMerge, FileText, BarChart3, Trash2, Database, Phone
} from 'lucide-react';
import { EmailRecord } from '../../types';
import { formatWorkingDuration } from '../lib/firebase';
import GoogleAccountChooserModal from './GoogleAccountChooserModal';

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
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [googleChooserOpen, setGoogleChooserOpen] = useState(false);

  // Profile data fetched from Firestore / Enclave Vault
  const [userEmails, setUserEmails] = useState<any[]>([]);
  const [userExports, setUserExports] = useState<any[]>([]);
  const [dbLoading, setDbLoading] = useState(false);

  // Translation Module State
  const [translateText, setTranslateText] = useState(
    'Dear Customer,\nURGENT NOTICE: Your corporate bank account has been suspended due to unusual login attempts. Please verify your password and account credentials immediately or click here to avoid permanent wire transfer and invoice restriction.\nBest regards,\nSecurity Compliance Desk'
  );
  const [targetLanguage, setTargetLanguage] = useState<'ES' | 'DE' | 'JA' | 'FR' | 'RU' | 'HI'>('ES');
  const [translatedOutput, setTranslatedOutput] = useState('');
  const [detectedRisks, setDetectedRisks] = useState<string[]>([]);
  const [translationCopied, setTranslationCopied] = useState(false);

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

  // Sync translation source text when selected email updates
  useEffect(() => {
    if (selectedEmail && selectedEmail.body) {
      setTranslateText(selectedEmail.body);
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

    if (!email || !phoneNumber || !password) {
      setAuthError('Email, Phone Number, and Password fields are mandatory.');
      return;
    }

    if (phoneNumber.replace(/\D/g, '').length < 7) {
      setAuthError('Please enter a valid Phone Number (at least 7 digits).');
      return;
    }

    if (password.length < 6) {
      setAuthError('Password must be at least 6 characters for cryptographic safety.');
      return;
    }

    try {
      if (isSignUp) {
        await signUpWithEnclaveEmail(email, password, displayName, phoneNumber);
        setAuthSuccess('Registration successful! Welcome to the secure enclave.');
      } else {
        await signInWithEnclaveEmail(email, password, phoneNumber);
        setAuthSuccess('Sign in successful. Synchronizing secure files...');
      }
      setEmail('');
      setPhoneNumber('');
      setPassword('');
      setDisplayName('');
    } catch (err: any) {
      setAuthError(err.message || 'Authentication sequence failed.');
    }
  };

  // Google OAuth Login (opens Google Account Selection Tab/Modal)
  const handleGoogleSignIn = () => {
    setAuthError('');
    setAuthSuccess('');
    setGoogleChooserOpen(true);
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
  // In-Browser Language Translation Engine
  // ==========================================
  const runBrowserTranslation = (sourceInput: string, lang: 'ES' | 'DE' | 'JA' | 'FR' | 'RU' | 'HI') => {
    const raw = sourceInput.trim();
    if (!raw) {
      setTranslatedOutput('');
      setDetectedRisks([]);
      return;
    }

    const risksFound: string[] = [];

    // Threat / Adversarial Multi-Lingual Lexicon (flagged as security indicators)
    const threatLexicon: Array<{
      en: string;
      regex: RegExp;
      translations: Record<'ES' | 'DE' | 'JA' | 'FR' | 'RU' | 'HI', string>;
      riskLabel: string;
    }> = [
      {
        en: 'urgent',
        regex: /\burgent(ly)?\b/gi,
        translations: { ES: 'urgente', DE: 'dringend', JA: '緊急', FR: 'urgent', RU: 'срочно', HI: 'अति आवश्यक' },
        riskLabel: 'Urgency coercion keyword'
      },
      {
        en: 'immediately',
        regex: /\bimmediately\b/gi,
        translations: { ES: 'inmediatamente', DE: 'sofort', JA: '直ちに', FR: 'immédiatement', RU: 'немедленно', HI: 'तुरंत' },
        riskLabel: 'Immediate action pressure'
      },
      {
        en: 'password',
        regex: /\bpasswords?\b/gi,
        translations: { ES: 'contraseña', DE: 'Passwort', JA: 'パスワード', FR: 'mot de passe', RU: 'пароль', HI: 'पासवर्ड' },
        riskLabel: 'Credential harvesting target (Password)'
      },
      {
        en: 'credentials',
        regex: /\bcredentials\b/gi,
        translations: { ES: 'credenciales', DE: 'Anmeldedaten', JA: '認証情報', FR: 'identifiants', RU: 'учетные данные', HI: 'क्रेडेंशियल्स' },
        riskLabel: 'Authentication credential request'
      },
      {
        en: 'gift card',
        regex: /\bgift\s*cards?\b/gi,
        translations: { ES: 'tarjeta de regalo', DE: 'Geschenkkarte', JA: 'ギフトカード', FR: 'carte-cadeau', RU: 'подарочная карта', HI: 'गिफ्ट कार्ड' },
        riskLabel: 'BEC gift card extortion lure'
      },
      {
        en: 'wire transfer',
        regex: /\bwire\s*transfers?\b/gi,
        translations: { ES: 'transferencia bancaria', DE: 'Banküberweisung', JA: '電信送金', FR: 'virement bancaire', RU: 'банковский перевод', HI: 'वायर ट्रांसफर' },
        riskLabel: 'Financial wire redirection'
      },
      {
        en: 'bank account',
        regex: /\bbank\s*accounts?\b/gi,
        translations: { ES: 'cuenta bancaria', DE: 'Bankkonto', JA: '銀行口座', FR: 'compte bancaire', RU: 'банковский счет', HI: 'बैंक खाता' },
        riskLabel: 'Banking account target'
      },
      {
        en: 'bank',
        regex: /\bbanks?\b/gi,
        translations: { ES: 'banco', DE: 'Bank', JA: '銀行', FR: 'banque', RU: 'банк', HI: 'बैंक' },
        riskLabel: 'Financial institution reference'
      },
      {
        en: 'invoice',
        regex: /\binvoices?\b/gi,
        translations: { ES: 'factura', DE: 'Rechnung', JA: '請求書', FR: 'facture', RU: 'счет-фактура', HI: 'चालान (इनवॉइस)' },
        riskLabel: 'Invoice fraud lure'
      },
      {
        en: 'verify',
        regex: /\bverif(y|ied|ication)\b/gi,
        translations: { ES: 'verificar', DE: 'verifizieren', JA: '確認・認証する', FR: 'vérifier', RU: 'подтвердить', HI: 'सत्यापित करें' },
        riskLabel: 'Verification phishing trigger'
      },
      {
        en: 'suspended',
        regex: /\bsuspend(ed|ing)?\b/gi,
        translations: { ES: 'suspendido', DE: 'gesperrt', JA: '一時停止', FR: 'suspendu', RU: 'приостановлен', HI: 'निलंबित' },
        riskLabel: 'Account suspension scare tactic'
      },
      {
        en: 'click here',
        regex: /\bclick\s*here\b/gi,
        translations: { ES: 'haga clic aquí', DE: 'hier klicken', JA: 'ここをクリック', FR: 'cliquez ici', RU: 'нажмите здесь', HI: 'यहाँ क्लिक करें' },
        riskLabel: 'Direct hyperlink call-to-action'
      }
    ];

    // Comprehensive phrase & vocabulary translation table for natural readable output
    const phraseDictionary: Array<{
      regex: RegExp;
      translations: Record<'ES' | 'DE' | 'JA' | 'FR' | 'RU' | 'HI', string>;
    }> = [
      {
        regex: /\bdear\s+customer\b/gi,
        translations: { ES: 'Estimado cliente', DE: 'Sehr geehrter Kunde', JA: 'お客様各位', FR: 'Cher client', RU: 'Уважаемый клиент', HI: 'प्रिय ग्राहक' }
      },
      {
        regex: /\bdear\s+user\b/gi,
        translations: { ES: 'Estimado usuario', DE: 'Sehr geehrter Benutzer', JA: 'ユーザー様', FR: 'Cher utilisateur', RU: 'Уважаемый пользователь', HI: 'प्रिय उपयोगकर्ता' }
      },
      {
        regex: /\bdear\b/gi,
        translations: { ES: 'Estimado/a', DE: 'Sehr geehrte(r)', JA: '親愛なる', FR: 'Cher/Chère', RU: 'Уважаемый', HI: 'प्रिय' }
      },
      {
        regex: /\bhello\b/gi,
        translations: { ES: 'Hola', DE: 'Hallo', JA: 'こんにちは', FR: 'Bonjour', RU: 'Здравствуйте', HI: 'नमस्ते' }
      },
      {
        regex: /\bnotice\b/gi,
        translations: { ES: 'aviso', DE: 'Mitteilung', JA: '通知', FR: 'avis', RU: 'уведомление', HI: 'सूचना' }
      },
      {
        regex: /\byour\s+corporate\b/gi,
        translations: { ES: 'su corporativa', DE: 'Ihr Unternehmens-', JA: '貴社の', FR: 'votre entreprise', RU: 'ваш корпоративный', HI: 'आपका कॉर्पोरेट' }
      },
      {
        regex: /\byour\b/gi,
        translations: { ES: 'su', DE: 'Ihr', JA: 'あなたの', FR: 'votre', RU: 'ваш', HI: 'आपका' }
      },
      {
        regex: /\bhas\s+been\b/gi,
        translations: { ES: 'ha sido', DE: 'wurde', JA: 'されました：', FR: 'a été', RU: 'был', HI: 'कर दिया गया है' }
      },
      {
        regex: /\bdue\s+to\s+unusual\s+login\s+attempts\b/gi,
        translations: {
          ES: 'debido a intentos de inicio de sesión inusuales',
          DE: 'aufgrund ungewöhnlicher Anmeldeversuche',
          JA: '不審なログイン試行が検出されたため',
          FR: 'en raison de tentatives de connexion inhabituelles',
          RU: 'из-за подозрительных попыток входа',
          HI: 'असामान्य लॉगिन प्रयासों के कारण'
        }
      },
      {
        regex: /\blogin\s+attempts?\b/gi,
        translations: { ES: 'intentos de acceso', DE: 'Anmeldeversuche', JA: 'ログイン試行', FR: 'tentatives de connexion', RU: 'попытки входа', HI: 'लॉगिन प्रयास' }
      },
      {
        regex: /\bplease\b/gi,
        translations: { ES: 'Por favor', DE: 'Bitte', JA: 'どうか', FR: 'Veuillez', RU: 'Пожалуйста', HI: 'कृपया' }
      },
      {
        regex: /\band\b/gi,
        translations: { ES: 'y', DE: 'und', JA: 'および', FR: 'et', RU: 'и', HI: 'और' }
      },
      {
        regex: /\bor\b/gi,
        translations: { ES: 'o', DE: 'oder', JA: 'または', FR: 'ou', RU: 'или', HI: 'या' }
      },
      {
        regex: /\bto\s+avoid\s+permanent\b/gi,
        translations: {
          ES: 'para evitar una restricción permanente de',
          DE: 'um eine dauerhafte Einschränkung zu vermeiden von',
          JA: '永久的な制限を回避するために',
          FR: 'pour éviter une restriction permanente de',
          RU: 'чтобы избежать постоянной блокировки',
          HI: 'स्थायी प्रतिबंध से बचने के लिए'
        }
      },
      {
        regex: /\brestriction\b/gi,
        translations: { ES: 'restricción', DE: 'Einschränkung', JA: '制限', FR: 'restriction', RU: 'ограничение', HI: 'प्रतिबंध' }
      },
      {
        regex: /\baccount\b/gi,
        translations: { ES: 'cuenta', DE: 'Konto', JA: 'アカウント', FR: 'compte', RU: 'аккаунт', HI: 'खाता' }
      },
      {
        regex: /\bsecurity\s+compliance\s+desk\b/gi,
        translations: {
          ES: 'Departamento de Cumplimiento de Seguridad',
          DE: 'Sicherheits-Compliance-Abteilung',
          JA: 'セキュリティコンプライアンス窓口',
          FR: 'Bureau de Conformité de Sécurité',
          RU: 'Отдел контроля безопасности',
          HI: 'सुरक्षा अनुपालन डेस्क'
        }
      },
      {
        regex: /\bbest\s+regards\b/gi,
        translations: { ES: 'Atentamente', DE: 'Mit freundlichen Grüßen', JA: 'よろしくお願いいたします', FR: 'Cordialement', RU: 'С уважением', HI: 'सादर' }
      },
      {
        regex: /\bsincerely\b/gi,
        translations: { ES: 'Sinceramente', DE: 'Hochachtungsvoll', JA: '敬具', FR: 'Sincèrement', RU: 'Искренне Ваш', HI: 'भवदीय' }
      },
      {
        regex: /\bthank\s+you\b/gi,
        translations: { ES: 'Gracias', DE: 'Vielen Dank', JA: 'ありがとうございます', FR: 'Merci', RU: 'Спасибо', HI: 'धन्यवाद' }
      },
      {
        regex: /\bpayment\b/gi,
        translations: { ES: 'pago', DE: 'Zahlung', JA: '支払い', FR: 'paiement', RU: 'платеж', HI: 'भुगतान' }
      },
      {
        regex: /\bsecurity\s+alert\b/gi,
        translations: { ES: 'alerta de seguridad', DE: 'Sicherheitswarnung', JA: 'セキュリティ警告', FR: 'alerte de sécurité', RU: 'предупреждение безопасности', HI: 'सुरक्षा चेतावनी' }
      }
    ];

    let workingText = raw;

    // 1. Scan & translate high-risk adversarial tokens first
    threatLexicon.forEach(item => {
      if (item.regex.test(workingText)) {
        const targetTerm = item.translations[lang];
        risksFound.push(`${item.riskLabel}: "${item.en.toUpperCase()}" → "${targetTerm}"`);
        workingText = workingText.replace(item.regex, `[⚠️ ${targetTerm.toUpperCase()}]`);
      }
    });

    // 2. Translate conversational phrases & common email vocabulary
    phraseDictionary.forEach(entry => {
      workingText = workingText.replace(entry.regex, entry.translations[lang]);
    });

    const langMeta: Record<'ES' | 'DE' | 'JA' | 'FR' | 'RU' | 'HI', { name: string; header: string; footer: string }> = {
      ES: {
        name: 'Spanish (Español)',
        header: '── Traducción Local en Navegador (Español) ──',
        footer: '✓ Traducción ejecutada 100% en el navegador sin enviar datos a servidores externos.'
      },
      DE: {
        name: 'German (Deutsch)',
        header: '── Lokale Browser-Übersetzung (Deutsch) ──',
        footer: '✓ Übersetzung vollständig lokal im Browser ohne externe API-Aufrufe durchgeführt.'
      },
      JA: {
        name: 'Japanese (日本語)',
        header: '── ブラウザ内ローカル翻訳 (日本語) ──',
        footer: '✓ 外部APIへのデータ送信なしでブラウザ内で安全に翻訳されました。'
      },
      FR: {
        name: 'French (Français)',
        header: '── Traduction Locale dans le Navigateur (Français) ──',
        footer: '✓ Traduction sécurisée effectuée localement sans fuite de données réseau.'
      },
      RU: {
        name: 'Russian (Русский)',
        header: '── Локальный перевод в браузере (Русский) ──',
        footer: '✓ Перевод выполнен локально в изолированной среде браузера.'
      },
      HI: {
        name: 'Hindi (हिन्दी)',
        header: '── इन-ब्राउज़र लोकल अनुवाद (हिन्दी) ──',
        footer: '✓ बिना किसी बाहरी नेटवर्क कॉल के ब्राउज़र में सुरक्षित रूप से अनुवादित।'
      }
    };

    const meta = langMeta[lang];
    const finalOutput = `${meta.header}\n\n${workingText}\n\n${meta.footer}`;

    setTranslatedOutput(finalOutput);
    setDetectedRisks(risksFound);
  };

  const handleLocalTranslation = () => {
    runBrowserTranslation(translateText, targetLanguage);
  };

  // Auto-run translation when targetLanguage changes if there is already text
  useEffect(() => {
    if (translateText.trim()) {
      runBrowserTranslation(translateText, targetLanguage);
    }
  }, [targetLanguage]);

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
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-3xs">
        <div>
          <div className="flex items-center space-x-2">
            <User className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-serif italic text-slate-900 font-bold">Secure Analyst Profile Enclave</h2>
            <span className="px-2 py-0.5 bg-amber-50 border border-amber-100 text-[9px] font-mono font-bold text-amber-700 rounded">
              CLOUD SYNC ACTIVE
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Sign-up or authenticate with Google popup to catalog tested email records, threat scores, and download history securely on Firestore.
          </p>
        </div>
        {user && (
          <button 
            onClick={handleLogout}
            className="px-3.5 py-1.5 bg-slate-100 border border-slate-200 hover:bg-slate-200 text-slate-700 font-mono text-xs rounded-xl transition flex items-center space-x-2 shadow-3xs cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>DISCONNECT SESSION</span>
          </button>
        )}
      </div>

      {/* Auth State Feedback Alerts */}
      {authError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-mono flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{authError}</span>
        </div>
      )}
      {authSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-mono flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{authSuccess}</span>
        </div>
      )}

      {/* ========================================================== */}
      {/* AUTHENTICATION OVERLAY / FORM IF NOT LOGGED IN             */}
      {/* ========================================================== */}
      {!user && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs">
          
          <div className="md:col-span-5 space-y-4 text-left">
            <h3 className="text-sm font-bold font-mono text-indigo-700 uppercase tracking-wider">// SECURE AUTHORIZATION GATEWAY</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Create an account or sign in to activate Firestore persistence. Protecting your checked indices guarantees audit-trails and historic metric trends remain saved.
            </p>
            
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2 text-[11px] text-slate-500 font-sans leading-relaxed">
              <span className="font-bold text-slate-800 block mb-1">🔐 ABAC Zero-Trust Safeguards</span>
              <p>• Data is isolated by UID server-side.</p>
              <p>• Cross-user queries are blocked at the router layer.</p>
              <p>• Instant session key termination upon sign out.</p>
            </div>

            {/* Google POPUP sign-in */}
            <button
              onClick={handleGoogleSignIn}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-mono text-xs rounded-xl transition flex items-center justify-center space-x-2 shadow-xs cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
              <span>CONTINUE WITH GOOGLE SECURE AUTH</span>
            </button>
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
                <label className="block text-[11px] font-mono text-slate-500 mb-1">ANALYST PHONE NUMBER</label>
                <input 
                  type="tel"
                  required
                  value={phoneNumber}
                  onChange={e => setPhoneNumber(e.target.value)}
                  placeholder="+1 (555) 234-5678"
                  className="w-full text-xs font-mono bg-slate-50 border border-slate-200 p-2.5 rounded-lg focus:outline-none focus:border-indigo-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-500 mb-1">SECURE ENCLAVE PASSWORD (6+ CHARACTERS)</label>
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
          
          {/* Left panel: Active email translator and semantic clustering map */}
          <div className="lg:col-span-6 space-y-6">
            
            {/* 1. Offline Translator Shield */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 space-y-4 text-left">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center space-x-2">
                  <Languages className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-sm font-medium text-slate-850">In-Browser Language Translation</h3>
                </div>
                <span className="px-2.5 py-0.5 bg-emerald-50 rounded-full text-[10px] text-emerald-700 font-medium">
                  Local Translate
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-normal">
                Translate foreign phishing lures and emails into localized target structures safely inside your browser, eliminating external translation API data leaks.
              </p>

              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[11px] font-medium text-slate-500">Target Language Selection</label>
                    <div className="flex items-center gap-2">
                      {selectedEmail && (
                        <button
                          type="button"
                          onClick={() => {
                            setTranslateText(selectedEmail.body);
                            runBrowserTranslation(selectedEmail.body, targetLanguage);
                          }}
                          className="text-[11px] text-[#1a73e8] hover:underline font-medium cursor-pointer"
                        >
                          Load Selected Email
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const sample = 'Dear Customer,\nURGENT NOTICE: Your corporate bank account has been suspended due to unusual login attempts. Please verify your password and credentials immediately or click here to avoid permanent wire transfer and invoice restriction.\nBest regards,\nSecurity Compliance Desk';
                          setTranslateText(sample);
                          runBrowserTranslation(sample, targetLanguage);
                        }}
                        className="text-[11px] text-slate-500 hover:text-slate-800 hover:underline font-medium cursor-pointer"
                      >
                        Load Sample Payload
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                    {([
                      { id: 'ES', label: 'Español (ES)' },
                      { id: 'DE', label: 'Deutsch (DE)' },
                      { id: 'JA', label: '日本語 (JA)' },
                      { id: 'FR', label: 'Français (FR)' },
                      { id: 'RU', label: 'Русский (RU)' },
                      { id: 'HI', label: 'हिन्दी (HI)' }
                    ] as const).map(lang => (
                      <button
                        key={lang.id}
                        type="button"
                        onClick={() => setTargetLanguage(lang.id)}
                        className={`py-1.5 px-2 text-xs font-medium rounded-full border transition-all cursor-pointer ${
                          targetLanguage === lang.id 
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                            : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {lang.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-medium text-slate-500">Payload Source Text</label>
                    {translateText && (
                      <button
                        type="button"
                        onClick={() => {
                          setTranslateText('');
                          setTranslatedOutput('');
                          setDetectedRisks([]);
                        }}
                        className="text-[11px] text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <textarea 
                    rows={4}
                    value={translateText}
                    onChange={e => setTranslateText(e.target.value)}
                    placeholder="Enter multi-lingual email body content to translate..."
                    className="w-full text-xs font-sans bg-slate-50 border border-slate-200 text-slate-700 p-3 rounded-xl focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleLocalTranslation}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded-full transition shadow-2xs cursor-pointer"
                >
                  Translate Payload Locally ({targetLanguage})
                </button>

                {translatedOutput && (
                  <div className="space-y-2 pt-2 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-slate-500 block">Secure Translated Output ({targetLanguage})</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(translatedOutput);
                          setTranslationCopied(true);
                          setTimeout(() => setTranslationCopied(false), 2000);
                        }}
                        className="text-[11px] text-[#1a73e8] hover:underline font-medium cursor-pointer"
                      >
                        {translationCopied ? 'Copied!' : 'Copy Translation'}
                      </button>
                    </div>
                    <div className="bg-[#f8f9fa] border border-[#dadce0] text-[#202124] p-3.5 rounded-xl font-mono text-[11px] whitespace-pre-wrap select-all leading-relaxed">
                      {translatedOutput}
                    </div>

                    {detectedRisks.length > 0 && (
                      <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-850 text-[11px] space-y-1">
                        <div className="flex items-center space-x-1.5 font-medium mb-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                          <span>Multi-Lingual Threat Markers Flagged ({detectedRisks.length})</span>
                        </div>
                        {detectedRisks.map((risk, idx) => (
                          <p key={idx}>• {risk}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 2. Client-Side Quantized Embeddings clustering */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 md:p-6 shadow-2xs space-y-4 text-left">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center space-x-2">
                  <Cpu className="w-5 h-5 text-indigo-600 animate-pulse" />
                  <h3 className="text-sm font-bold font-mono text-slate-850">Client-Side Semantic Vector Clustering</h3>
                </div>
                <span className="px-1.5 py-0.5 bg-indigo-50 border border-indigo-100 rounded text-[9px] font-mono text-indigo-700 font-bold">
                  8-D EMBEDDER
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-normal">
                Generates a mathematical 8-dimensional vector embedding natively representing email linguistic profiles, and calculates semantic cluster matches instantly.
              </p>

              {activeVector.length > 0 && (
                <div className="space-y-4 animate-fade-in">
                  
                  {/* Embedded Vector Map */}
                  <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl space-y-2">
                    <span className="text-[9px] font-mono text-slate-400 uppercase font-bold block">// QUANTIZED FEATURE VECTOR PATTERN</span>
                    <div className="flex items-center space-x-1 bg-white p-2 border border-slate-100 rounded-lg overflow-x-auto">
                      {activeVector.map((val, idx) => (
                        <div key={idx} className="flex-1 text-center border-r last:border-r-0 border-slate-100 px-1 font-mono text-[10px]">
                          <span className="text-slate-400 block text-[8px]">D{idx+1}</span>
                          <span className="font-bold text-indigo-700">{val.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Similarity matches */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-mono text-slate-400 uppercase block">Top Semantic Threat matches in database</span>
                    {semanticMatches.length === 0 ? (
                      <p className="text-xs text-slate-400 font-mono italic">No semantic comparison models configured.</p>
                    ) : (
                      <div className="space-y-2">
                        {semanticMatches.map((match, idx) => (
                          <div key={idx} className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex items-center justify-between gap-3">
                            <div className="space-y-1 text-left min-w-0 flex-1">
                              <span className="text-[9px] font-mono font-bold text-indigo-600 block uppercase">{match.cluster}</span>
                              <h4 className="text-xs font-semibold text-slate-800 truncate font-mono">{match.email.subject}</h4>
                            </div>
                            <div className="text-right font-mono shrink-0">
                              <span className="text-[8px] text-slate-400 block uppercase">SIMILARITY</span>
                              <span className={`text-xs font-bold ${match.similarity > 75 ? 'text-red-600' : 'text-slate-600'}`}>{match.similarity}% Match</span>
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

          {/* Right panel: Firestore saved indices, export buttons, and logs */}
          <div className="lg:col-span-6 space-y-6">
            
            {/* 1. Secure user profile & HUD metrics */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 md:p-6 shadow-2xs space-y-4 text-left">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center space-x-2.5">
                  <div className="w-10 h-10 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center font-bold font-mono text-indigo-700">
                    {user.displayName?.charAt(0).toUpperCase() || 'A'}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">{user.displayName || 'Security Analyst'}</h4>
                    <span className="text-[10px] font-mono text-slate-400 block">{user.email}</span>
                    {user.phoneNumber && (
                      <span className="text-[10px] font-mono text-[#1a73e8] flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3" />
                        <span>{user.phoneNumber}</span>
                      </span>
                    )}
                  </div>
                </div>
                <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-[9px] font-mono text-indigo-600 rounded-lg font-bold">
                  VERIFIED ENCLAVE
                </span>
              </div>

              {/* Quick action: Sync current metrics */}
              {selectedEmail && (
                <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-between gap-3 text-xs">
                  <div className="space-y-0.5 text-left">
                    <span className="text-[9px] text-indigo-600 uppercase font-mono block">Selected active mail</span>
                    <span className="font-bold text-slate-850 truncate block max-w-[200px]">{selectedEmail.subject}</span>
                  </div>
                  <button
                    onClick={saveSelectedEmailToProfile}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-mono text-[10px] rounded-lg transition font-bold"
                  >
                    CATALOG THREAT TO PROFILE
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
                    className="flex-1 py-2 bg-slate-900 hover:bg-slate-800 text-white font-mono text-xs rounded-xl transition flex items-center justify-center space-x-2 cursor-pointer shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>EXPORT DATA TO CSV</span>
                  </button>
                  <button
                    onClick={() => handleDownloadReport('JSON')}
                    className="flex-1 py-2 bg-slate-100 border border-slate-200 hover:bg-slate-200 text-slate-700 font-mono text-xs rounded-xl transition flex items-center justify-center space-x-2 cursor-pointer shadow-3xs"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>DOWNLOAD JSON</span>
                  </button>
                </div>
              )}
            </div>

            {/* 2. Live Scanned emails history list */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 md:p-6 shadow-2xs space-y-4 text-left">
              <span className="text-[10px] font-mono text-slate-400 uppercase block tracking-wider border-b border-slate-150 pb-2">
                📂 Live Scanned History Audit Trail (Firestore Sync)
              </span>

              {dbLoading ? (
                <div className="text-center py-10 text-xs font-mono text-slate-400 animate-pulse">
                   Querying secure cloud records...
                </div>
              ) : userEmails.length === 0 ? (
                <div className="text-center py-10 text-xs font-mono text-slate-400 space-y-2">
                  <Mail className="w-6 h-6 mx-auto text-slate-300" />
                  <p>Your cloud history log is empty.</p>
                  <p className="text-[10px] font-sans text-slate-400">Scan any email on the left dashboard and click "Catalog Threat to Profile" to begin.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto no-scrollbar">
                  {userEmails.map((emailItem) => (
                    <div key={emailItem.docId} className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-start justify-between gap-3 relative group transition hover:border-indigo-100">
                      
                      <div className="space-y-1 font-mono text-left min-w-0 flex-1">
                        <div className="flex items-center space-x-1.5 flex-wrap">
                          <span className={`px-1.5 py-0.5 text-[8px] font-bold rounded uppercase ${
                            emailItem.spamScore > 65 ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                          }`}>
                            Score: {emailItem.spamScore} SPAM
                          </span>
                          <span className="text-[9px] text-slate-400 truncate max-w-[120px]">{emailItem.sender}</span>
                        </div>
                        <h4 className="text-xs font-semibold text-slate-800 truncate">{emailItem.subject}</h4>
                        <span className="text-[9px] text-slate-400 block">{new Date(emailItem.createdAt).toLocaleDateString()}</span>
                      </div>

                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => deleteSavedEmailRecord(emailItem.docId)}
                          className="p-1.5 text-slate-300 hover:text-red-600 rounded-lg transition"
                          title="Delete catalog record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Download/Export log trace */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 md:p-6 shadow-2xs space-y-4 text-left">
              <span className="text-[10px] font-mono text-slate-400 uppercase block tracking-wider border-b border-slate-150 pb-2">
                📋 Download & Export Ledger (Immutable Logs)
              </span>

              {userExports.length === 0 ? (
                <p className="text-xs text-slate-400 font-mono text-center py-6">No historical exports registered.</p>
              ) : (
                <div className="space-y-2 max-h-[200px] overflow-y-auto no-scrollbar">
                  {userExports.map((exp) => (
                    <div key={exp.id} className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl flex items-center justify-between text-xs font-mono">
                      <div className="space-y-0.5 text-left truncate flex-1 pr-3">
                        <div className="flex items-center space-x-1.5">
                          <span className="px-1.5 py-0.5 bg-slate-200 text-slate-700 text-[8px] rounded uppercase font-bold">{exp.fileType}</span>
                          <span className="text-[10px] font-bold text-slate-800 truncate block max-w-[150px]">{exp.fileName}</span>
                        </div>
                        <span className="text-[9px] text-slate-400 block">{new Date(exp.createdAt).toLocaleString()}</span>
                      </div>
                      <span className="text-[10px] font-bold text-indigo-700">{exp.recordCount} Items</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

        </div>
      )}

      <GoogleAccountChooserModal
        isOpen={googleChooserOpen}
        onClose={() => setGoogleChooserOpen(false)}
        defaultPhone={phoneNumber}
        onSuccess={() => {
          setAuthSuccess('Google account selected and session synced securely.');
        }}
      />

    </div>
  );
}
