/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Languages, ArrowLeftRight, Copy, Check, Download, AlertTriangle,
  ShieldAlert, ShieldCheck, Sparkles, Eraser, Mail, Eye, EyeOff
} from 'lucide-react';
import { EmailRecord } from '../../types';
import InfoButton from './InfoButton';

interface TranslatorLabProps {
  selectedEmail: EmailRecord | null;
}

type LangCode = 'EN' | 'ES' | 'DE' | 'JA' | 'FR' | 'RU' | 'HI' | 'AR' | 'PT';

interface LangMeta {
  code: LangCode;
  name: string;
  native: string;
}

const LANGUAGES: LangMeta[] = [
  { code: 'EN', name: 'English', native: 'English' },
  { code: 'ES', name: 'Spanish', native: 'Español' },
  { code: 'DE', name: 'German', native: 'Deutsch' },
  { code: 'FR', name: 'French', native: 'Français' },
  { code: 'JA', name: 'Japanese', native: '日本語' },
  { code: 'RU', name: 'Russian', native: 'Русский' },
  { code: 'HI', name: 'Hindi', native: 'हिन्दी' },
  { code: 'AR', name: 'Arabic', native: 'العربية' },
  { code: 'PT', name: 'Portuguese', native: 'Português' }
];

interface ThreatLexiconItem {
  key: string;
  category: 'Urgency' | 'Credentials' | 'Financial' | 'Authority' | 'Action Coercion';
  severity: 'critical' | 'high' | 'medium';
  riskLabel: string;
  terms: Record<LangCode, string[]>;
}

const THREAT_LEXICON: ThreatLexiconItem[] = [
  {
    key: 'urgent',
    category: 'Urgency',
    severity: 'high',
    riskLabel: 'Urgency coercion',
    terms: {
      EN: ['urgent', 'urgently', 'immediate attention'],
      ES: ['urgente', 'urgentemente'],
      DE: ['dringend', 'eilig'],
      FR: ['urgent', 'urgemment'],
      JA: ['緊急', '至急'],
      RU: ['срочно', 'неотложно'],
      HI: ['अति आवश्यक', 'तत्काल'],
      AR: ['عاجل', 'فوري'],
      PT: ['urgente', 'urgentemente']
    }
  },
  {
    key: 'immediately',
    category: 'Urgency',
    severity: 'high',
    riskLabel: 'Immediate action pressure',
    terms: {
      EN: ['immediately', 'right away'],
      ES: ['inmediatamente'],
      DE: ['sofort', 'unverzüglich'],
      FR: ['immédiatement'],
      JA: ['直ちに', 'すぐに'],
      RU: ['немедленно'],
      HI: ['तुरंत'],
      AR: ['فوراً', 'على الفور'],
      PT: ['imediatamente']
    }
  },
  {
    key: 'password',
    category: 'Credentials',
    severity: 'critical',
    riskLabel: 'Password harvesting target',
    terms: {
      EN: ['password', 'passwords', 'passcode'],
      ES: ['contraseña', 'contraseñas', 'clave'],
      DE: ['passwort', 'passwörter', 'kennwort'],
      FR: ['mot de passe', 'mots de passe'],
      JA: ['パスワード', '暗証番号'],
      RU: ['пароль', 'пароли'],
      HI: ['पासवर्ड'],
      AR: ['كلمة المرور', 'كلمة السر'],
      PT: ['senha', 'senhas']
    }
  },
  {
    key: 'credentials',
    category: 'Credentials',
    severity: 'critical',
    riskLabel: 'Credential harvesting lure',
    terms: {
      EN: ['credentials', 'login details'],
      ES: ['credenciales'],
      DE: ['anmeldedaten', 'zugangsdaten'],
      FR: ['identifiants'],
      JA: ['認証情報', 'ログイン情報'],
      RU: ['учетные данные', 'данные для входа'],
      HI: ['क्रेडेंशियल्स', 'लॉगिन विवरण'],
      AR: ['بيانات الاعتماد'],
      PT: ['credenciais']
    }
  },
  {
    key: 'gift_card',
    category: 'Financial',
    severity: 'critical',
    riskLabel: 'BEC gift card extortion',
    terms: {
      EN: ['gift card', 'gift cards', 'gift voucher'],
      ES: ['tarjeta de regalo', 'tarjetas de regalo'],
      DE: ['geschenkkarte', 'geschenkgutschein'],
      FR: ['carte-cadeau', 'carte cadeau'],
      JA: ['ギフトカード'],
      RU: ['подарочная карта'],
      HI: ['गिफ्ट कार्ड'],
      AR: ['بطاقة هدايا'],
      PT: ['cartão-presente', 'vale-presente']
    }
  },
  {
    key: 'wire_transfer',
    category: 'Financial',
    severity: 'critical',
    riskLabel: 'Wire transfer redirection',
    terms: {
      EN: ['wire transfer', 'wire transfers', 'bank transfer'],
      ES: ['transferencia bancaria', 'transferencia'],
      DE: ['banküberweisung', 'überweisung'],
      FR: ['virement bancaire', 'virement'],
      JA: ['電信送金', '銀行振込'],
      RU: ['банковский перевод'],
      HI: ['वायर ट्रांसफर', 'बैंक ट्रांसफर'],
      AR: ['تحويل بنكي'],
      PT: ['transferência bancária']
    }
  },
  {
    key: 'bank_account',
    category: 'Financial',
    severity: 'high',
    riskLabel: 'Bank account targeting',
    terms: {
      EN: ['bank account', 'bank accounts'],
      ES: ['cuenta bancaria'],
      DE: ['bankkonto'],
      FR: ['compte bancaire'],
      JA: ['銀行口座'],
      RU: ['банковский счет'],
      HI: ['बैंक खाता'],
      AR: ['الحساب البنكي'],
      PT: ['conta bancária']
    }
  },
  {
    key: 'invoice',
    category: 'Financial',
    severity: 'high',
    riskLabel: 'Fraudulent invoice lure',
    terms: {
      EN: ['invoice', 'invoices', 'overdue balance'],
      ES: ['factura', 'facturas'],
      DE: ['rechnung', 'rechnungen'],
      FR: ['facture', 'factures'],
      JA: ['請求書'],
      RU: ['счет-фактура', 'счёт на оплату'],
      HI: ['चालान', 'इनवॉइस'],
      AR: ['فاتورة'],
      PT: ['fatura', 'faturas']
    }
  },
  {
    key: 'verify',
    category: 'Action Coercion',
    severity: 'high',
    riskLabel: 'Verification phishing trigger',
    terms: {
      EN: ['verify', 'verified', 'verification', 'confirm'],
      ES: ['verificar', 'confirmar', 'verificación'],
      DE: ['verifizieren', 'bestätigen', 'überprüfen'],
      FR: ['vérifier', 'confirmer', 'vérification'],
      JA: ['確認する', '認証する', '確認'],
      RU: ['подтвердить', 'проверить', 'подтверждение'],
      HI: ['सत्यापित करें', 'पुष्टि करें'],
      AR: ['تحقق', 'تأكيد'],
      PT: ['verificar', 'confirmar']
    }
  },
  {
    key: 'suspended',
    category: 'Authority',
    severity: 'high',
    riskLabel: 'Account suspension scare tactic',
    terms: {
      EN: ['suspended', 'suspend', 'locked', 'restricted'],
      ES: ['suspendido', 'suspendida', 'bloqueada'],
      DE: ['gesperrt', 'ausgesetzt'],
      FR: ['suspendu', 'suspendue', 'bloqué'],
      JA: ['一時停止', '凍結'],
      RU: ['приостановлен', 'заблокирован'],
      HI: ['निलंबित', 'प्रतिबंधित'],
      AR: ['معلق', 'محظور'],
      PT: ['suspenso', 'suspensa', 'bloqueado']
    }
  },
  {
    key: 'click_here',
    category: 'Action Coercion',
    severity: 'medium',
    riskLabel: 'Direct hyperlink coercion',
    terms: {
      EN: ['click here', 'open link'],
      ES: ['haga clic aquí', 'haz clic aquí'],
      DE: ['hier klicken'],
      FR: ['cliquez ici'],
      JA: ['ここをクリック'],
      RU: ['нажмите здесь'],
      HI: ['यहाँ क्लिक करें'],
      AR: ['انقر هنا'],
      PT: ['clique aqui']
    }
  },
  {
    key: 'bank',
    category: 'Financial',
    severity: 'medium',
    riskLabel: 'Financial institution reference',
    terms: {
      EN: ['bank', 'banking'],
      ES: ['banco'],
      DE: ['bank'],
      FR: ['banque'],
      JA: ['銀行'],
      RU: ['банк'],
      HI: ['बैंक'],
      AR: ['بنك'],
      PT: ['banco']
    }
  }
];

interface PhraseLexiconItem {
  terms: Record<LangCode, string[]>;
}

const PHRASE_LEXICON: PhraseLexiconItem[] = [
  {
    terms: {
      EN: ['dear customer'],
      ES: ['estimado cliente'],
      DE: ['sehr geehrter kunde'],
      FR: ['cher client'],
      JA: ['お客様各位'],
      RU: ['уважаемый клиент'],
      HI: ['प्रिय ग्राहक'],
      AR: ['عزيزي العميل'],
      PT: ['caro cliente', 'prezado cliente']
    }
  },
  {
    terms: {
      EN: ['dear user'],
      ES: ['estimado usuario'],
      DE: ['sehr geehrter benutzer'],
      FR: ['cher utilisateur'],
      JA: ['ユーザー様'],
      RU: ['уважаемый пользователь'],
      HI: ['प्रिय उपयोगकर्ता'],
      AR: ['عزيزي المستخدم'],
      PT: ['prezado usuário']
    }
  },
  {
    terms: {
      EN: ['security compliance desk'],
      ES: ['departamento de cumplimiento de seguridad'],
      DE: ['sicherheits-compliance-abteilung'],
      FR: ['bureau de conformité de sécurité'],
      JA: ['セキュリティコンプライアンス窓口'],
      RU: ['отдел контроля безопасности'],
      HI: ['सुरक्षा अनुपालन डेस्क'],
      AR: ['مكتب الامتثال الأمني'],
      PT: ['central de conformidade de segurança']
    }
  },
  {
    terms: {
      EN: ['security alert'],
      ES: ['alerta de seguridad'],
      DE: ['sicherheitswarnung'],
      FR: ['alerte de sécurité'],
      JA: ['セキュリティ警告'],
      RU: ['предупреждение безопасности'],
      HI: ['सुरक्षा चेतावनी'],
      AR: ['تنبيه أمني'],
      PT: ['alerta de segurança']
    }
  },
  {
    terms: {
      EN: ['due to unusual login attempts'],
      ES: ['debido a intentos de inicio de sesión inusuales'],
      DE: ['aufgrund ungewöhnlicher anmeldeversuche'],
      FR: ['en raison de tentatives de connexion inhabituelles'],
      JA: ['不審なログイン試行が検出されたため'],
      RU: ['из-за подозрительных попыток входа'],
      HI: ['असामान्य लॉगिन प्रयासों के कारण'],
      AR: ['بسبب محاولات تسجيل دخول غير عادية'],
      PT: ['devido a tentativas de login incomuns']
    }
  },
  {
    terms: {
      EN: ['to avoid permanent'],
      ES: ['para evitar una restricción permanente de'],
      DE: ['um eine dauerhafte einschränkung zu vermeiden'],
      FR: ['pour éviter une restriction permanente'],
      JA: ['永久的な制限を回避するために'],
      RU: ['чтобы избежать постоянной блокировки'],
      HI: ['स्थायी प्रतिबंध से बचने के लिए'],
      AR: ['لتجنب التقييد الدائم'],
      PT: ['para evitar restrição permanente']
    }
  },
  {
    terms: {
      EN: ['login attempts', 'login attempt'],
      ES: ['intentos de acceso'],
      DE: ['anmeldeversuche'],
      FR: ['tentatives de connexion'],
      JA: ['ログイン試行'],
      RU: ['попытки входа'],
      HI: ['लॉगिन प्रयास'],
      AR: ['محاولات تسجيل الدخول'],
      PT: ['tentativas de login']
    }
  },
  {
    terms: {
      EN: ['your corporate'],
      ES: ['su corporativa'],
      DE: ['ihr unternehmens-'],
      FR: ['votre entreprise'],
      JA: ['貴社の'],
      RU: ['ваш корпоративный'],
      HI: ['आपका कॉर्पोरेट'],
      AR: ['الخاص بشركتك'],
      PT: ['sua corporativa']
    }
  },
  {
    terms: {
      EN: ['has been'],
      ES: ['ha sido'],
      DE: ['wurde'],
      FR: ['a été'],
      JA: ['されました'],
      RU: ['был'],
      HI: ['कर दिया गया है'],
      AR: ['تم'],
      PT: ['foi']
    }
  },
  {
    terms: {
      EN: ['best regards'],
      ES: ['atentamente'],
      DE: ['mit freundlichen grüßen'],
      FR: ['cordialement'],
      JA: ['よろしくお願いいたします'],
      RU: ['с уважением'],
      HI: ['सादर'],
      AR: ['مع أطيب التحيات'],
      PT: ['atenciosamente']
    }
  },
  {
    terms: {
      EN: ['thank you'],
      ES: ['gracias'],
      DE: ['vielen dank'],
      FR: ['merci'],
      JA: ['ありがとうございます'],
      RU: ['спасибо'],
      HI: ['धन्यवाद'],
      AR: ['شكراً لك'],
      PT: ['obrigado']
    }
  },
  {
    terms: {
      EN: ['sincerely'],
      ES: ['sinceramente'],
      DE: ['hochachtungsvoll'],
      FR: ['sincèrement'],
      JA: ['敬具'],
      RU: ['искренне'],
      HI: ['भवदीय'],
      AR: ['المخلص'],
      PT: ['sinceramente']
    }
  },
  {
    terms: {
      EN: ['please'],
      ES: ['por favor'],
      DE: ['bitte'],
      FR: ['veuillez'],
      JA: ['どうか'],
      RU: ['пожалуйста'],
      HI: ['कृपया'],
      AR: ['يرجى'],
      PT: ['por favor']
    }
  },
  {
    terms: {
      EN: ['notice'],
      ES: ['aviso'],
      DE: ['mitteilung'],
      FR: ['avis'],
      JA: ['通知'],
      RU: ['уведомление'],
      HI: ['सूचना'],
      AR: ['إشعار'],
      PT: ['aviso']
    }
  },
  {
    terms: {
      EN: ['payment'],
      ES: ['pago'],
      DE: ['zahlung'],
      FR: ['paiement'],
      JA: ['支払い'],
      RU: ['платеж'],
      HI: ['भुगतान'],
      AR: ['دفع'],
      PT: ['pagamento']
    }
  },
  {
    terms: {
      EN: ['account'],
      ES: ['cuenta'],
      DE: ['konto'],
      FR: ['compte'],
      JA: ['アカウント'],
      RU: ['аккаунт'],
      HI: ['खाता'],
      AR: ['حساب'],
      PT: ['conta']
    }
  },
  {
    terms: {
      EN: ['restriction'],
      ES: ['restricción'],
      DE: ['einschränkung'],
      FR: ['restriction'],
      JA: ['制限'],
      RU: ['ограничение'],
      HI: ['प्रतिबंध'],
      AR: ['تقييد'],
      PT: ['restrição']
    }
  },
  {
    terms: {
      EN: ['your'],
      ES: ['su'],
      DE: ['ihr'],
      FR: ['votre'],
      JA: ['あなたの'],
      RU: ['ваш'],
      HI: ['आपका'],
      AR: ['الخاص بك'],
      PT: ['seu']
    }
  },
  {
    terms: {
      EN: ['hello'],
      ES: ['hola'],
      DE: ['hallo'],
      FR: ['bonjour'],
      JA: ['こんにちは'],
      RU: ['здравствуйте'],
      HI: ['नमस्ते'],
      AR: ['مرحباً'],
      PT: ['olá']
    }
  },
  {
    terms: {
      EN: ['and'],
      ES: ['y'],
      DE: ['und'],
      FR: ['et'],
      JA: ['および'],
      RU: ['и'],
      HI: ['और'],
      AR: ['و'],
      PT: ['e']
    }
  },
  {
    terms: {
      EN: ['or'],
      ES: ['o'],
      DE: ['oder'],
      FR: ['ou'],
      JA: ['または'],
      RU: ['или'],
      HI: ['या'],
      AR: ['أو'],
      PT: ['ou']
    }
  }
];

const SAMPLE_PAYLOADS: Array<{ id: string; label: string; sourceHint: LangCode; text: string }> = [
  {
    id: 'en-bec',
    label: 'BEC Bank Suspension (EN)',
    sourceHint: 'EN',
    text: 'Dear Customer,\nURGENT NOTICE: Your corporate bank account has been suspended due to unusual login attempts. Please verify your password and credentials immediately or click here to avoid permanent wire transfer and invoice restriction.\nBest regards,\nSecurity Compliance Desk'
  },
  {
    id: 'es-phish',
    label: 'Spanish Banking Lure (ES)',
    sourceHint: 'ES',
    text: 'Estimado cliente,\nAVISO URGENTE: Su cuenta bancaria ha sido suspendida debido a intentos de inicio de sesión inusuales. Por favor verifique su contraseña y credenciales inmediatamente o haga clic aquí para evitar una restricción permanente.\nAtentamente,\nDepartamento de Cumplimiento de Seguridad'
  },
  {
    id: 'de-invoice',
    label: 'German Invoice Scam (DE)',
    sourceHint: 'DE',
    text: 'Sehr geehrter Kunde,\nDRINGEND Mitteilung: Ihr Bankkonto wurde gesperrt aufgrund ungewöhnlicher Anmeldeversuche. Bitte verifizieren Sie Ihr Passwort und Anmeldedaten sofort oder hier klicken für Rechnung und Banküberweisung.\nMit freundlichen Grüßen,\nSicherheits-Compliance-Abteilung'
  },
  {
    id: 'ru-alert',
    label: 'Russian Credential Lure (RU)',
    sourceHint: 'RU',
    text: 'Уважаемый клиент,\nСРОЧНО уведомление: Ваш банковский счет был приостановлен из-за подозрительных попыток входа. Пожалуйста подтвердить пароль и учетные данные немедленно или нажмите здесь.\nС уважением,\nОтдел контроля безопасности'
  }
];

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPattern(term: string, lang: LangCode): RegExp {
  const escaped = escapeRegex(term);
  // Non-Latin scripts (JA, HI, AR, RU) don't always align cleanly with ASCII \b word boundaries
  if (lang === 'JA' || lang === 'HI' || lang === 'AR' || lang === 'RU') {
    return new RegExp(escaped, 'gi');
  }
  return new RegExp(`\\b${escaped}\\b`, 'gi');
}

function detectLanguage(text: string): LangCode {
  if (!text.trim()) return 'EN';
  if (/[\u3040-\u30ff\u4e00-\u9faf]/.test(text)) return 'JA';
  if (/[\u0400-\u04FF]/.test(text)) return 'RU';
  if (/[\u0900-\u097F]/.test(text)) return 'HI';
  if (/[\u0600-\u06FF]/.test(text)) return 'AR';

  const lower = text.toLowerCase();
  const score: Record<LangCode, number> = {
    EN: 0, ES: 0, DE: 0, FR: 0, JA: 0, RU: 0, HI: 0, AR: 0, PT: 0
  };

  const heuristics: Array<{ lang: LangCode; patterns: RegExp[] }> = [
    { lang: 'ES', patterns: [/\bestimado\b/, /\bcuenta\b/, /\bcontraseña\b/, /\bverifique\b/, /\batentamente\b/, /\bhaga clic\b/] },
    { lang: 'DE', patterns: [/\bsehr geehrter\b/, /\bpasswort\b/, /\brechnung\b/, /\bbitte\b/, /\bgesperrt\b/, /\bmit freundlichen grüßen\b/] },
    { lang: 'FR', patterns: [/\bcher client\b/, /\bmot de passe\b/, /\bveuillez\b/, /\bcliquez ici\b/, /\bcordialement\b/, /\bvirement\b/] },
    { lang: 'PT', patterns: [/\bprezado\b/, /\bsenha\b/, /\bconta bancária\b/, /\bclique aqui\b/, /\batenciosamente\b/, /\bobrigado\b/] },
    { lang: 'EN', patterns: [/\bdear\b/, /\bpassword\b/, /\byour\b/, /\baccount\b/, /\bplease\b/, /\bverify\b/, /\burgent\b/] }
  ];

  heuristics.forEach(h => {
    h.patterns.forEach(rx => {
      if (rx.test(lower)) score[h.lang] += 1;
    });
  });

  let best: LangCode = 'EN';
  let bestScore = -1;
  (['EN', 'ES', 'DE', 'FR', 'PT'] as LangCode[]).forEach(l => {
    if (score[l] > bestScore) {
      bestScore = score[l];
      best = l;
    }
  });

  return best;
}

interface DetectedThreatItem {
  key: string;
  category: ThreatLexiconItem['category'];
  severity: ThreatLexiconItem['severity'];
  riskLabel: string;
  matchedSource: string;
  translatedTarget: string;
}

export default function TranslatorLab({ selectedEmail }: TranslatorLabProps) {
  const [sourceText, setSourceText] = useState<string>(SAMPLE_PAYLOADS[0].text);
  const [sourceLang, setSourceLang] = useState<'AUTO' | LangCode>('AUTO');
  const [targetLang, setTargetLang] = useState<LangCode>('ES');
  const [highlightMarkers, setHighlightMarkers] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (selectedEmail?.body) {
      setSourceText(selectedEmail.body);
    }
  }, [selectedEmail]);

  const effectiveSourceLang: LangCode = useMemo(() => {
    if (sourceLang !== 'AUTO') return sourceLang;
    return detectLanguage(sourceText);
  }, [sourceLang, sourceText]);

  const translationResult = useMemo(() => {
    const raw = sourceText.trim();
    if (!raw) {
      return {
        output: '',
        threats: [] as DetectedThreatItem[],
        riskScore: 0
      };
    }

    let working = raw;
    const foundThreats: DetectedThreatItem[] = [];

    // 1. Replace Threat Lexicon matches (source -> target)
    THREAT_LEXICON.forEach(item => {
      const candidateTerms = item.terms[effectiveSourceLang] || item.terms.EN;
      const targetTerm = item.terms[targetLang]?.[0] || item.terms.EN[0];

      let matched = false;
      let matchedText = candidateTerms[0];

      candidateTerms.forEach(term => {
        const rx = buildPattern(term, effectiveSourceLang);
        if (rx.test(working)) {
          matched = true;
          matchedText = term;
          working = working.replace(rx, highlightMarkers ? `[${targetTerm.toUpperCase()}]` : targetTerm);
        }
      });

      if (matched) {
        foundThreats.push({
          key: item.key,
          category: item.category,
          severity: item.severity,
          riskLabel: item.riskLabel,
          matchedSource: matchedText,
          translatedTarget: targetTerm
        });
      }
    });

    // 2. Replace Phrase Lexicon matches (source -> target)
    PHRASE_LEXICON.forEach(entry => {
      const candidateTerms = entry.terms[effectiveSourceLang] || entry.terms.EN;
      const targetTerm = entry.terms[targetLang]?.[0] || entry.terms.EN[0];

      candidateTerms.forEach(term => {
        const rx = buildPattern(term, effectiveSourceLang);
        working = working.replace(rx, targetTerm);
      });
    });

    const criticalCount = foundThreats.filter(t => t.severity === 'critical').length;
    const highCount = foundThreats.filter(t => t.severity === 'high').length;
    const riskScore = Math.min(100, criticalCount * 28 + highCount * 16 + foundThreats.length * 6);

    return {
      output: working,
      threats: foundThreats,
      riskScore
    };
  }, [sourceText, effectiveSourceLang, targetLang, highlightMarkers]);

  const handleSwapLanguages = () => {
    if (!translationResult.output) return;
    const prevEffective = effectiveSourceLang;
    const cleanOutput = translationResult.output.replace(/\[([^\]]+)\]/g, '$1');
    setSourceText(cleanOutput);
    setSourceLang(targetLang);
    setTargetLang(prevEffective);
  };

  const handleCopy = () => {
    if (!translationResult.output) return;
    navigator.clipboard?.writeText(translationResult.output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadReport = () => {
    if (!translationResult.output) return;
    const content = [
      'NEOAEGIS LOCAL PAYLOAD TRANSLATION REPORT',
      `Generated: ${new Date().toISOString()}`,
      `Source Language: ${effectiveSourceLang}${sourceLang === 'AUTO' ? ' (Auto-detected)' : ''}`,
      `Target Language: ${targetLang}`,
      `Adversarial Lure Density: ${translationResult.riskScore}%`,
      '',
      '--- SOURCE PAYLOAD ---',
      sourceText,
      '',
      '--- TRANSLATED OUTPUT ---',
      translationResult.output,
      '',
      `--- DETECTED THREAT MARKERS (${translationResult.threats.length}) ---`,
      ...translationResult.threats.map(t => `[${t.severity.toUpperCase()}] ${t.category} — ${t.riskLabel}: "${t.matchedSource}" -> "${t.translatedTarget}"`)
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `neoaegis_translation_${effectiveSourceLang}_to_${targetLang}_${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const wordCount = sourceText.trim() ? sourceText.trim().split(/\s+/).length : 0;

  return (
    <div className="space-y-6 animate-fade-in text-left" id="translator-lab-tab">
      {/* Header Bar */}
      <div className="bg-[#f8f9fa] border border-[#dadce0] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#e8f0fe] text-[#1a73e8] flex items-center justify-center shrink-0">
            <Languages className="w-5 h-5" />
          </div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-medium text-[#202124]">Payload Translator</h2>
            <InfoButton
              title="Payload Translator"
              description="Bidirectional in-browser translation workbench. Automatically detects foreign phishing scripts, translates lures without external API leakage, and flags embedded social-engineering trigger terms."
              align="left"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2.5 py-1 bg-[#e6f4ea] text-[#137333] rounded-full text-[11px] font-medium">
            Zero-Egress Local Engine
          </span>
          <button
            type="button"
            onClick={() => setHighlightMarkers(prev => !prev)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition flex items-center gap-1.5 cursor-pointer ${
              highlightMarkers
                ? 'bg-[#e8f0fe] border-[#aecbfa] text-[#1967d2]'
                : 'bg-white border-[#dadce0] text-[#5f6368] hover:text-[#202124]'
            }`}
          >
            {highlightMarkers ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>{highlightMarkers ? 'Markers Highlighted' : 'Plain Translation'}</span>
          </button>
        </div>
      </div>

      {/* Quick Presets & Active Email Loader */}
      <div className="bg-white border border-[#dadce0] rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[#202124]">Payload Presets</span>
            <InfoButton
              title="Payload Presets"
              description="Load multi-lingual phishing samples or import the currently active email body from your Personal Audit Stream."
              align="left"
            />
          </div>
          {selectedEmail && (
            <button
              type="button"
              onClick={() => {
                setSourceLang('AUTO');
                setSourceText(selectedEmail.body);
              }}
              className="px-3 py-1.5 bg-[#e8f0fe] hover:bg-[#d2e3fc] text-[#1967d2] rounded-full text-xs font-medium transition flex items-center gap-1.5 cursor-pointer"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Load Selected Email</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {SAMPLE_PAYLOADS.map(sample => (
            <button
              key={sample.id}
              type="button"
              onClick={() => {
                setSourceLang('AUTO');
                setSourceText(sample.text);
                if (sample.sourceHint !== 'EN') {
                  setTargetLang('EN');
                }
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition cursor-pointer ${
                sourceText === sample.text
                  ? 'bg-[#e8f0fe] border-[#aecbfa] text-[#1967d2]'
                  : 'bg-[#f8f9fa] border-[#dadce0] text-[#3c4043] hover:bg-[#f1f3f4]'
              }`}
            >
              {sample.label}
            </button>
          ))}
        </div>
      </div>

      {/* Language Direction Bar */}
      <div className="bg-white border border-[#dadce0] rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex-1 flex items-center gap-2">
          <label className="text-xs font-medium text-[#5f6368] shrink-0">From</label>
          <select
            value={sourceLang}
            onChange={e => setSourceLang(e.target.value as 'AUTO' | LangCode)}
            className="flex-1 text-xs font-medium bg-[#f8f9fa] border border-[#dadce0] px-3 py-2 rounded-xl text-[#202124] focus:outline-none focus:border-[#1a73e8] cursor-pointer"
            aria-label="Source language"
          >
            <option value="AUTO">Auto-Detect ({effectiveSourceLang})</option>
            {LANGUAGES.map(l => (
              <option key={l.code} value={l.code}>
                {l.name} ({l.native})
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleSwapLanguages}
          title="Swap source and target languages"
          className="self-center p-2.5 bg-[#f8f9fa] hover:bg-[#e8f0fe] border border-[#dadce0] text-[#1a73e8] rounded-full transition cursor-pointer shrink-0"
        >
          <ArrowLeftRight className="w-4 h-4" />
        </button>

        <div className="flex-1 flex items-center gap-2">
          <label className="text-xs font-medium text-[#5f6368] shrink-0">To</label>
          <select
            value={targetLang}
            onChange={e => setTargetLang(e.target.value as LangCode)}
            className="flex-1 text-xs font-medium bg-[#f8f9fa] border border-[#dadce0] px-3 py-2 rounded-xl text-[#202124] focus:outline-none focus:border-[#1a73e8] cursor-pointer"
            aria-label="Target language"
          >
            {LANGUAGES.map(l => (
              <option key={l.code} value={l.code}>
                {l.name} ({l.native})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Dual Pane Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Source Input Pane */}
        <div className="lg:col-span-6 bg-white border border-[#dadce0] rounded-2xl p-4 sm:p-5 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between border-b border-[#f1f3f4] pb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[#202124]">Source Payload</span>
              <span className="px-2 py-0.5 bg-[#e8f0fe] text-[#1967d2] rounded-full text-[10px] font-medium">
                {effectiveSourceLang}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-[#5f6368]">{wordCount} words</span>
              {sourceText && (
                <button
                  type="button"
                  onClick={() => setSourceText('')}
                  className="p-1.5 text-[#5f6368] hover:text-[#d93025] rounded-full hover:bg-[#fce8e6] transition cursor-pointer"
                  title="Clear input"
                >
                  <Eraser className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <textarea
            rows={9}
            value={sourceText}
            onChange={e => setSourceText(e.target.value)}
            placeholder="Paste or type email content in English, Spanish, German, French, Japanese, Russian, Hindi, Arabic, or Portuguese..."
            className="w-full flex-1 text-xs sm:text-sm bg-[#f8f9fa] border border-[#dadce0] text-[#202124] p-3.5 rounded-xl focus:outline-none focus:border-[#1a73e8] leading-relaxed resize-none"
          />
        </div>

        {/* Translated Output Pane */}
        <div className="lg:col-span-6 bg-[#f8f9fa] border border-[#dadce0] rounded-2xl p-4 sm:p-5 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between border-b border-[#dadce0] pb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[#202124]">Translated Output</span>
              <span className="px-2 py-0.5 bg-[#e6f4ea] text-[#137333] rounded-full text-[10px] font-medium">
                {targetLang}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleCopy}
                disabled={!translationResult.output}
                className="px-2.5 py-1 bg-white hover:bg-[#e8f0fe] disabled:opacity-40 border border-[#dadce0] text-[#1a73e8] rounded-full text-[11px] font-medium transition flex items-center gap-1 cursor-pointer"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadReport}
                disabled={!translationResult.output}
                className="px-2.5 py-1 bg-white hover:bg-[#f1f3f4] disabled:opacity-40 border border-[#dadce0] text-[#3c4043] rounded-full text-[11px] font-medium transition flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3 h-3" />
                <span>Report</span>
              </button>
            </div>
          </div>

          <div
            dir={targetLang === 'AR' ? 'rtl' : 'ltr'}
            className="flex-1 min-h-[195px] bg-white border border-[#dadce0] text-[#202124] p-3.5 rounded-xl text-xs sm:text-sm whitespace-pre-wrap leading-relaxed select-all overflow-y-auto"
          >
            {translationResult.output || (
              <span className="text-[#80868b]">Enter source text to translate locally.</span>
            )}
          </div>
        </div>
      </div>

      {/* Threat Marker Analysis Card */}
      <div className="bg-white border border-[#dadce0] rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f1f3f4] pb-3">
          <div className="flex items-center gap-2">
            {translationResult.riskScore > 50 ? (
              <ShieldAlert className="w-4 h-4 text-[#d93025]" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-[#1e8e3e]" />
            )}
            <h3 className="text-sm font-medium text-[#202124]">
              Adversarial Lure Detection ({translationResult.threats.length})
            </h3>
            <InfoButton
              title="Adversarial Lure Detection"
              description="Cross-lingual lexical scanner that extracts social engineering triggers (urgency, credential harvesting, financial wire terms) alongside their translated equivalents."
              align="left"
            />
          </div>

          <span
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              translationResult.riskScore >= 60
                ? 'bg-[#fce8e6] text-[#c5221f]'
                : translationResult.riskScore >= 25
                ? 'bg-[#fef7e0] text-[#b06000]'
                : 'bg-[#e6f4ea] text-[#137333]'
            }`}
          >
            Lure Density: {translationResult.riskScore}%
          </span>
        </div>

        {translationResult.threats.length === 0 ? (
          <div className="p-4 bg-[#f8f9fa] border border-[#dadce0] rounded-xl text-xs text-[#5f6368] flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#1e8e3e]" />
            <span>No known multi-lingual phishing triggers matched in current text.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {translationResult.threats.map(threat => (
              <div
                key={threat.key}
                className="bg-[#f8f9fa] border border-[#dadce0] rounded-xl p-3 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-medium text-[#5f6368] uppercase">
                    {threat.category}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase ${
                      threat.severity === 'critical'
                        ? 'bg-[#fce8e6] text-[#c5221f]'
                        : threat.severity === 'high'
                        ? 'bg-[#fef7e0] text-[#b06000]'
                        : 'bg-[#e8f0fe] text-[#1967d2]'
                    }`}
                  >
                    {threat.severity}
                  </span>
                </div>
                <p className="text-xs font-medium text-[#202124] flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#d93025] shrink-0" />
                  <span>{threat.riskLabel}</span>
                </p>
                <div className="text-[11px] font-mono text-[#5f6368] bg-white border border-[#dadce0] rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2">
                  <span className="truncate">&ldquo;{threat.matchedSource}&rdquo;</span>
                  <span className="text-[#1a73e8] shrink-0">&rarr;</span>
                  <span className="truncate font-medium text-[#202124]">&ldquo;{threat.translatedTarget}&rdquo;</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
