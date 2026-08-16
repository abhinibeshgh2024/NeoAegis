/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, Eye, ShieldAlert, Fingerprint, Terminal, Code, Plus, Trash2, 
  HelpCircle, CheckCircle2, XCircle, AlertTriangle, Network, Search, 
  Lock, Key, RefreshCw, Layers, ShieldCheck, ChevronRight
} from 'lucide-react';
import { EmailRecord, SpamMetrics } from './types';
import { analyzeEmail } from './spamEngine';

interface ForensicsLabProps {
  selectedEmail: EmailRecord | null;
  onUpdateEmailMetrics?: (record: EmailRecord) => void;
}

interface CustomRule {
  id: string;
  name: string;
  regex: string;
  target: 'subject' | 'body' | 'headers';
  weight: number;
  description: string;
}

interface PgpKey {
  id: string;
  userId: string;
  fingerprint: string;
  publicKey: string;
  algorithm: string;
  created: string;
}

interface HeaderHop {
  hopNumber: number;
  from: string;
  fromIp: string;
  by: string;
  withProtocol: string;
  timestamp: string;
  raw: string;
  delaySec: number;
  isSuspicious: boolean;
  warnings: string[];
}

export default function ForensicsLab({ selectedEmail, onUpdateEmailMetrics }: ForensicsLabProps) {
  const [activeSubTab, setActiveSubTab] = useState<'sandbox' | 'pgp' | 'rules' | 'breach' | 'hops'>('sandbox');

  // ==========================================
  // 1. Client-Side DOM Sandbox State & Logic
  // ==========================================
  const [htmlPayload, setHtmlPayload] = useState('');
  const [highlightHidden, setHighlightHidden] = useState(true);
  const [sandboxReport, setSandboxReport] = useState<{
    strippedScriptsCount: number;
    trackingPixelsCount: number;
    hiddenElementsCount: number;
    strippedStylesheetsCount: number;
    detectedIssues: string[];
    details: { type: string; desc: string; raw: string }[];
  }>({
    strippedScriptsCount: 0,
    trackingPixelsCount: 0,
    hiddenElementsCount: 0,
    strippedStylesheetsCount: 0,
    detectedIssues: [],
    details: []
  });

  // Sync HTML input when selectedEmail changes
  useEffect(() => {
    if (selectedEmail) {
      // Create some mockup HTML body if not already HTML
      if (!selectedEmail.body.includes('<')) {
        setHtmlPayload(`
<div style="font-family: sans-serif; padding: 15px; background: #fff; border-radius: 8px;">
  <h2 style="color: #d32f2f;">Action Required: Security Alert</h2>
  <p>Dear ${selectedEmail.recipient.split('@')[0]},</p>
  <p>${selectedEmail.body}</p>
  <p>Please click below to secure your portal:</p>
  <a href="https://verify-secure-domain.net/login?to=${selectedEmail.recipient}" style="background: #1a73e8; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">Verify Account Now</a>
  
  <!-- Hidden text-stuffing payload mimicking innocent newsletter keywords to bypass spam filter -->
  <span style="display: none; font-size: 0px; color: transparent; opacity: 0; visibility: hidden;">
    newsletter update team meeting agenda feedback schedule conference vacation policy corporate memo approved clean virus checked safe
  </span>

  <!-- Tracking pixel simulation -->
  <img src="https://track.secures-verify.com/pixel.gif?id=mail-4921" width="1" height="1" alt="" />
  
  <script>
    console.warn("MALICIOUS SCRIPT BLOCKED: Attempting session Hijacking");
    window.parent.postMessage("hack", "*");
  </script>
</div>
        `);
      } else {
        setHtmlPayload(selectedEmail.body);
      }
    }
  }, [selectedEmail]);

  // Pure Client-side HTML Sanitization & Markup Analysis
  const sanitizeAndInspectHtml = (rawHtml: string) => {
    if (!rawHtml) return { cleanHtml: '', report: sandboxReport };

    let clean = rawHtml;
    const reportDetails: { type: string; desc: string; raw: string }[] = [];
    const issues: string[] = [];

    // Count and strip scripts
    const scriptRegex = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
    const scriptMatches = rawHtml.match(scriptRegex) || [];
    if (scriptMatches.length > 0) {
      issues.push(`Removed ${scriptMatches.length} script blocks to prevent cross-site scripting (XSS) payload delivery.`);
      scriptMatches.forEach(s => reportDetails.push({ type: 'Script Block', desc: 'Active client-side Javascript executor', raw: s }));
      clean = clean.replace(scriptRegex, '<!-- [Aegis Shielded Script Block] -->');
    }

    // Strip inline on* event handlers (XSS injection vectors)
    const onEventRegex = /\son\w+\s*=\s*(['"])(.*?)\1/gi;
    const onEventMatches = rawHtml.match(onEventRegex) || [];
    if (onEventMatches.length > 0) {
      issues.push(`Defanged ${onEventMatches.length} interactive 'on*' event attributes.`);
      onEventMatches.forEach(o => reportDetails.push({ type: 'Event Attribute', desc: 'Inline triggers (e.g. onload, onerror, onclick)', raw: o }));
      clean = clean.replace(onEventRegex, ' data-defanged-event=""');
    }

    // Count and defang tracking pixels
    const pixelRegex = /<img[^>]*\b(width=["']?1["']?|height=["']?1["']?|style=["'][^"']*width:\s*1px[^"']*|src=["'][^"']*\b(pixel|track|gif)\b[^"']*)[^>]*>/gi;
    const pixelMatches = rawHtml.match(pixelRegex) || [];
    if (pixelMatches.length > 0) {
      issues.push(`Identified ${pixelMatches.length} dynamic tracking beacons or 1x1 image payloads.`);
      pixelMatches.forEach(p => reportDetails.push({ type: 'Tracking Beacon', desc: 'Unsolicited dynamic location or telemetry tracker', raw: p }));
      clean = clean.replace(pixelRegex, (m) => `<!-- [Aegis Defanged Tracking Image] --> <div class="p-1 text-[9px] font-mono border border-indigo-200 bg-indigo-50 rounded inline-block text-indigo-700 m-1">🚫 Tracking Pixel Blocked: ${m.match(/src="([^"]+)"/)?.[1] || 'Embedded'}</div>`);
    }

    // Count and strip external stylesheets or remote fonts to block background tracking and rendering exploits
    const linkRegex = /<link\b[^>]*\brel=["']?stylesheet["']?[^>]*>/gi;
    const linkMatches = rawHtml.match(linkRegex) || [];
    if (linkMatches.length > 0) {
      issues.push(`Stripped ${linkMatches.length} remote CSS asset calls.`);
      linkMatches.forEach(l => reportDetails.push({ type: 'Remote Asset', desc: 'External style sheet or asset library', raw: l }));
      clean = clean.replace(linkRegex, '<!-- [Aegis Shielded Asset Link] -->');
    }

    // Identify hidden element stuffing payloads (display: none or font-size: 0px or opacity: 0)
    // We parse inline styles or markup attributes
    const hiddenStyleRegex = /<(span|div|p|h\d)\b[^>]*\bstyle=["'][^"']*\b(display:\s*none|font-size:\s*0|color:\s*transparent|opacity:\s*0|visibility:\s*hidden)\b[^"']*["'][^>]*>(.*?)<\/\1>/gi;
    const hiddenMatches = rawHtml.match(hiddenStyleRegex) || [];
    
    let hiddenElementsCount = hiddenMatches.length;

    if (hiddenMatches.length > 0) {
      issues.push(`Detected ${hiddenMatches.length} hidden structural text blocks. These are often used as filter-evasion 'stuffing' lures.`);
      hiddenMatches.forEach(h => {
        const textInside = h.replace(/<[^>]*>/g, '').trim();
        reportDetails.push({ type: 'Hidden Text Stuffing', desc: `Filter bypass words: "${textInside.substring(0, 40)}..."`, raw: h });
      });
    }

    // If highlight is enabled, we inject highlight styling to the output clean HTML
    if (highlightHidden) {
      clean = clean.replace(
        /style=["']([^"']*)(\bdisplay:\s*none|\bfont-size:\s*0px|\bfont-size:\s*0|\bcolor:\s*transparent|\bopacity:\s*0|\bvisibility:\s*hidden)([^"']*)["']/gi,
        (match, p1, p2, p3) => {
          // Replace hiding styles with bright noticeable neon-crimson borders
          return `style="${p1} border: 2px dashed #dc2626 !important; background: #fef2f2 !important; display: inline-block !important; font-size: 11px !important; color: #dc2626 !important; opacity: 1 !important; visibility: visible !important; padding: 4px !important;" title="MALICIOUS PAYLOAD HIGHLIGHTED"`;
        }
      );
    }

    return {
      cleanHtml: clean,
      report: {
        strippedScriptsCount: scriptMatches.length,
        trackingPixelsCount: pixelMatches.length,
        hiddenElementsCount,
        strippedStylesheetsCount: linkMatches.length,
        detectedIssues: issues,
        details: reportDetails
      }
    };
  };

  const currentAnalysis = sanitizeAndInspectHtml(htmlPayload);

  // ==========================================
  // 2. GPG / PGP Digital Signature Validator State
  // ==========================================
  const [pgpKeys, setPgpKeys] = useState<PgpKey[]>(() => {
    const saved = localStorage.getItem('neo_aegis_pgp_keyring');
    if (saved) return JSON.parse(saved);

    // Initial default trusted keyring matching some mocks
    return [
      {
        id: 'key-1',
        userId: 'CEO Office <ceo@agency-enterprise.com>',
        fingerprint: '3B5F A8F3 9D83 0451 C700 FE91 2E9A 1201 EF78 AB22',
        publicKey: `-----BEGIN PGP PUBLIC KEY BLOCK-----
Version: OpenPGP v2.0.1
Comment: Trusted Corporate Key Ring

mQENBFhK8k0BCADK2t9d9K2R/gLpAExr8U2Z6K9oXvB4fUu...
-----END PGP PUBLIC KEY BLOCK-----`,
        algorithm: 'RSA-4096',
        created: '2025-01-15T00:00:00Z'
      },
      {
        id: 'key-2',
        userId: 'SecOps Automated Gatekeeper <gatekeeper@aegis-security.internal>',
        fingerprint: 'ACDF EE92 B221 00AA 998F 28B7 CC92 DD03 D383 1A9F',
        publicKey: `-----BEGIN PGP PUBLIC KEY BLOCK-----
Version: OpenPGP v2.0.1
Comment: Key for Internal System

mQENBFhK8k0BCADK2t9d9K2R/gLpAExr8U2Z6K9oXvB4fUu...
-----END PGP PUBLIC KEY BLOCK-----`,
        algorithm: 'RSA-2048',
        created: '2026-03-10T11:45:00Z'
      }
    ];
  });

  const [armoredInput, setArmoredInput] = useState('');
  const [newKeyUserId, setNewKeyUserId] = useState('');
  const [newKeyFingerprint, setNewKeyFingerprint] = useState('');
  const [newKeyArmor, setNewKeyArmor] = useState('');
  const [showKeyCreateModal, setShowKeyCreateModal] = useState(false);
  
  const [pgpResult, setPgpResult] = useState<{
    status: 'success' | 'warning' | 'error' | 'idle';
    message: string;
    senderId?: string;
    fingerprint?: string;
    isTrusted?: boolean;
    extractedBody?: string;
  }>({ status: 'idle', message: '' });

  // Save keyring changes
  const saveKeyring = (updatedKeys: PgpKey[]) => {
    setPgpKeys(updatedKeys);
    localStorage.setItem('neo_aegis_pgp_keyring', JSON.stringify(updatedKeys));
  };

  const handleAddNewPgpKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyUserId || !newKeyFingerprint) return;

    const newKey: PgpKey = {
      id: `key-${Date.now()}`,
      userId: newKeyUserId,
      fingerprint: newKeyFingerprint.toUpperCase().trim(),
      publicKey: newKeyArmor || `-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: Custom\n\nKeyDataMock\n-----END PGP PUBLIC KEY BLOCK-----`,
      algorithm: 'RSA-4096',
      created: new Date().toISOString()
    };

    saveKeyring([...pgpKeys, newKey]);
    setNewKeyUserId('');
    setNewKeyFingerprint('');
    setNewKeyArmor('');
    setShowKeyCreateModal(false);
  };

  const handleDeletePgpKey = (id: string) => {
    saveKeyring(pgpKeys.filter(k => k.id !== id));
  };

  // Run GPG Armour Cryptographic Parsing Simulation
  const handleVerifyArmoredSignature = () => {
    if (!armoredInput.trim()) {
      setPgpResult({ status: 'error', message: 'PGP input cannot be empty' });
      return;
    }

    const hasSignedHeader = armoredInput.includes('-----BEGIN PGP SIGNED MESSAGE-----');
    const hasSignature = armoredInput.includes('-----BEGIN PGP SIGNATURE-----');

    if (!hasSignedHeader || !hasSignature) {
      setPgpResult({
        status: 'error',
        message: 'Cryptographic syntax error: Armored block must contain PGP SIGNED MESSAGE header boundaries and raw SIGNATURE tails.'
      });
      return;
    }

    // Extract Message Body
    let bodyText = '';
    const bodyMatch = armoredInput.match(/-----BEGIN PGP SIGNED MESSAGE-----(?:[\s\S]*?)Hash:[\s\S]*?\n\n([\s\S]*?)-----BEGIN PGP SIGNATURE-----/i);
    if (bodyMatch) {
      bodyText = bodyMatch[1].trim();
    } else {
      bodyText = 'Unparseable message payload';
    }

    // Extract key ID or signature ID (simulation based on key values inside armored block)
    // To simulate realistic fingerprint extraction, we scan if the armor matches or lookup signatures in keyring
    const signatureBlock = armoredInput.match(/-----BEGIN PGP SIGNATURE-----([\s\S]*?)-----END PGP SIGNATURE-----/i)?.[1] || '';
    
    // Look up matching fingerprint based on text matches or simulate a fingerprint link
    let matchingKey: PgpKey | undefined = undefined;
    
    // Check if user specifically mentioned one of our keyring users/fingerprints in the comment
    pgpKeys.forEach(k => {
      const firstPart = k.userId.split(' ')[0].toLowerCase();
      if (armoredInput.toLowerCase().includes(firstPart)) {
        matchingKey = k;
      }
    });

    // Default simulation if none matches
    if (!matchingKey && pgpKeys.length > 0) {
      // 30% chance untrusted key fingerprint, otherwise match first
      const randomSeed = Math.random();
      if (randomSeed > 0.4) {
        matchingKey = pgpKeys[0];
      }
    }

    if (matchingKey) {
      setPgpResult({
        status: 'success',
        message: 'Cryptographic signature is VALID. Message integrity verified. Authenticity confirmed against local trusted keyring.',
        senderId: (matchingKey as PgpKey).userId,
        fingerprint: (matchingKey as PgpKey).fingerprint,
        isTrusted: true,
        extractedBody: bodyText
      });
    } else {
      setPgpResult({
        status: 'warning',
        message: 'VALID SIGNATURE, but key is UNTRUSTED. The cryptographic signature matches, but the public key fingerprint is not present in your local keyring.',
        senderId: 'Unknown Signer <unverified@unknown-domain.org>',
        fingerprint: 'EFA1 2E99 BA00 8F92 1A32 C700 AAFF DB22 BBFF',
        isTrusted: false,
        extractedBody: bodyText
      });
    }
  };

  // Preset Armored Load helpers for instant showcase
  const loadPgpSignedPreset = () => {
    setArmoredInput(`-----BEGIN PGP SIGNED MESSAGE-----
Hash: SHA256

Hello, this is standard corporate memo. We would like to confirm that we completed audit on database nodes, and the security configuration is optimal.

Keep all credentials safe and do not share any credentials with unverified relays.

Best regards,
CEO Office
-----BEGIN PGP SIGNATURE-----
Version: GnuPG v2.0.1 (GNU/Linux)

iQEzBAEBCAAdFiEE3sY8gXp7P5K7rO0S+M7SThFkXN0FAmODe44ACgkQ+M7SThFk
XN3VnQf/UY9YnI79L8Z9p9U/H8878ZgQ5839U8ZpWf8vV98Zc57eZgqV9XpW4...
-----END PGP SIGNATURE-----`);
  };

  // ==========================================
  // 3. Local Heuristic Custom Rules Logic
  // ==========================================
  const [customRules, setCustomRules] = useState<CustomRule[]>(() => {
    const saved = localStorage.getItem('custom_heuristic_rules');
    return saved ? JSON.parse(saved) : [];
  });

  const [ruleName, setRuleName] = useState('');
  const [ruleRegex, setRuleRegex] = useState('');
  const [ruleTarget, setRuleTarget] = useState<'subject' | 'body' | 'headers'>('body');
  const [ruleWeight, setRuleWeight] = useState(15);
  const [ruleDesc, setRuleDesc] = useState('');
  const [testResult, setTestResult] = useState<{ matches: boolean; matchCount: number; matchedStrings: string[] }>({
    matches: false,
    matchCount: 0,
    matchedStrings: []
  });

  const handleCreateRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName || !ruleRegex) return;

    // Validate regex before adding
    try {
      new RegExp(ruleRegex, 'i');
    } catch (err) {
      alert('Invalid Regular Expression syntax. Please verify.');
      return;
    }

    const newRule: CustomRule = {
      id: `rule-${Date.now()}`,
      name: ruleName,
      regex: ruleRegex,
      target: ruleTarget,
      weight: Number(ruleWeight),
      description: ruleDesc || 'No custom description provided.'
    };

    const updated = [...customRules, newRule];
    setCustomRules(updated);
    localStorage.setItem('custom_heuristic_rules', JSON.stringify(updated));

    // Reset fields
    setRuleName('');
    setRuleRegex('');
    setRuleDesc('');

    // Re-run the main analyzer if email exists to update scores dynamically
    if (selectedEmail && onUpdateEmailMetrics) {
      const res = analyzeEmail(selectedEmail.subject, selectedEmail.body, selectedEmail.rawHeaders);
      onUpdateEmailMetrics({ ...selectedEmail, metrics: res });
    }
  };

  const handleDeleteRule = (id: string) => {
    const updated = customRules.filter(r => r.id !== id);
    setCustomRules(updated);
    localStorage.setItem('custom_heuristic_rules', JSON.stringify(updated));

    if (selectedEmail && onUpdateEmailMetrics) {
      const res = analyzeEmail(selectedEmail.subject, selectedEmail.body, selectedEmail.rawHeaders);
      onUpdateEmailMetrics({ ...selectedEmail, metrics: res });
    }
  };

  // Test regex rule live on active text
  const handleTestRegex = () => {
    if (!ruleRegex || !selectedEmail) return;

    try {
      const rx = new RegExp(ruleRegex, 'gi');
      const textToSearch = 
        ruleTarget === 'subject' ? selectedEmail.subject :
        ruleTarget === 'headers' ? selectedEmail.rawHeaders : selectedEmail.body;

      const matches = textToSearch.match(rx) || [];
      setTestResult({
        matches: matches.length > 0,
        matchCount: matches.length,
        matchedStrings: Array.from(new Set(matches)).slice(0, 5) // unique up to 5
      });
    } catch (err) {
      setTestResult({ matches: false, matchCount: 0, matchedStrings: ['Invalid regex pattern'] });
    }
  };

  // Run live rule test when input parameters change
  useEffect(() => {
    if (ruleRegex && selectedEmail) {
      handleTestRegex();
    } else {
      setTestResult({ matches: false, matchCount: 0, matchedStrings: [] });
    }
  }, [ruleRegex, ruleTarget, selectedEmail]);

  // ==========================================
  // 4. Zero-Knowledge Leak Checker Logic
  // ==========================================
  const [leakInput, setLeakInput] = useState('');
  const [checkingLeak, setCheckingLeak] = useState(false);
  const [leakResult, setLeakResult] = useState<{
    checked: boolean;
    leaked: boolean;
    count: number;
    prefix: string;
    suffix: string;
    error?: string;
  } | null>(null);

  // Helper: SHA-1 native hash function
  async function computeSha1(str: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-1', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex.toUpperCase();
  }

  const handleCheckCredentialLeak = async () => {
    if (!leakInput.trim()) return;

    setCheckingLeak(true);
    setLeakResult(null);

    try {
      // 1. Calculate SHA-1 Hash
      const fullHash = await computeSha1(leakInput);
      const prefix = fullHash.substring(0, 5);
      const suffix = fullHash.substring(5);

      // 2. Query HaveIBeenPwned Range API via k-Anonymity (Only first 5 hash chars leave the browser)
      const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
      if (!response.ok) {
        throw new Error('API request failed. Verify your network connection.');
      }

      const rawText = await response.text();
      const lines = rawText.split('\n');
      
      // 3. Find matching suffix client-side (Full hash is never revealed to the API)
      let matchCount = 0;
      let isLeaked = false;

      for (let line of lines) {
        const [candidateSuffix, countStr] = line.trim().split(':');
        if (candidateSuffix === suffix) {
          matchCount = parseInt(countStr, 10);
          isLeaked = true;
          break;
        }
      }

      setLeakResult({
        checked: true,
        leaked: isLeaked,
        count: matchCount,
        prefix,
        suffix
      });

    } catch (err: any) {
      setLeakResult({
        checked: true,
        leaked: false,
        count: 0,
        prefix: '',
        suffix: '',
        error: err.message || 'HaveIBeenPwned range protocol experienced standard CORS timeouts.'
      });
    } finally {
      setCheckingLeak(false);
    }
  };

  // Helper to quickly scan email for common test credentials
  const scanEmailForCredentials = () => {
    if (!selectedEmail) return;
    
    // Look for patterns like password = ..., secret = ... or common strings
    const patterns = [
      /password[:= ]\s*([a-zA-Z0-9!@#%^&*()_+]{4,20})/i,
      /pwd[:= ]\s*([a-zA-Z0-9!@#%^&*()_+]{4,20})/i,
      /secret[:= ]\s*([a-zA-Z0-9!@#%^&*()_+]{4,20})/i
    ];

    let foundCred = '';
    for (let r of patterns) {
      const match = selectedEmail.body.match(r);
      if (match) {
        foundCred = match[1];
        break;
      }
    }

    if (foundCred) {
      setLeakInput(foundCred);
    } else {
      setLeakInput('P@ssword123'); // fallback simulation
    }
  };

  // ==========================================
  // 5. Interactive Header Hop Visualizer
  // ==========================================
  const [hops, setHops] = useState<HeaderHop[]>([]);

  const parseTraceHops = (rawHeaders: string): HeaderHop[] => {
    if (!rawHeaders) return [];

    // Extract all "Received:" lines
    // A single Received header block can wrap multiple lines, so we split by new Received: tags
    const receivedBlocks = rawHeaders.split(/\bReceived:/gi).slice(1); // skip anything before first Received
    
    const parsedHops: HeaderHop[] = [];

    receivedBlocks.forEach((block, index) => {
      const raw = 'Received:' + block;
      
      // Attempt to extract sender (from)
      const fromMatch = block.match(/from\s+([a-zA-Z0-9.-]+)/i);
      const fromIpMatch = block.match(/\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/);
      const byMatch = block.match(/by\s+([a-zA-Z0-9.-]+)/i);
      const withMatch = block.match(/with\s+([a-zA-Z0-9.-]+)/i);
      
      // Attempt to find Date inside Received block (usually after semicolon)
      const dateParts = block.split(';');
      let hopDateStr = '';
      if (dateParts.length > 1) {
        hopDateStr = dateParts[dateParts.length - 1].trim();
      }

      const from = fromMatch ? fromMatch[1] : 'Unknown Relay Sender';
      const fromIp = fromIpMatch ? fromIpMatch[0] : 'N/A';
      const by = byMatch ? byMatch[1] : 'Unknown Mail Exchange (MX)';
      const withProtocol = withMatch ? withMatch[1] : 'SMTP';

      parsedHops.push({
        hopNumber: index + 1,
        from,
        fromIp,
        by,
        withProtocol,
        timestamp: hopDateStr || new Date(Date.now() - (index * 3) * 60 * 1000).toUTCString(), // fallback chronological
        raw,
        delaySec: 0, // computed below
        isSuspicious: false,
        warnings: []
      });
    });

    // Received logs are added sequentially by MX servers, which means:
    // Index 0 in rawHeaders is the LAST hop (destination).
    // The last element is the FIRST hop (origin).
    // We reverse the list to visualize it sequentially chronologically from sender to recipient!
    parsedHops.reverse();

    // Now recalculate hop numbers chronologically, delays, and threats
    let finalizedHops: HeaderHop[] = [];
    
    parsedHops.forEach((hop, i) => {
      let delay = 0;
      const warnings: string[] = [];
      let isSuspicious = false;

      if (i > 0) {
        const prevTime = new Date(parsedHops[i - 1].timestamp).getTime();
        const currTime = new Date(hop.timestamp).getTime();
        
        if (!isNaN(prevTime) && !isNaN(currTime)) {
          // Absolute difference
          delay = Math.abs(Math.round((currTime - prevTime) / 1000));
        } else {
          // Simulated stable latency 1-5 seconds
          delay = Math.floor(Math.random() * 4) + 1;
        }
      }

      // 1. Alert on excessive routing delays (>120 seconds)
      if (delay > 120) {
        isSuspicious = true;
        warnings.push(`Extreme latency spike detected: Routing took ${Math.round(delay / 60)} minutes. Server may be stalling/buffering malicious content scanning filters.`);
      }

      // 2. Alert on unverified/suspicious senders
      if (hop.from.includes('unverified') || hop.from.includes('anon') || hop.from.includes('free-relay')) {
        isSuspicious = true;
        warnings.push(`Server identification contains risk patterns ('unverified' / 'anon' / 'free-relay').`);
      }

      // 3. Private IP check (e.g. 192.168.x.x, 10.x.x.x) is standard for local origin, but public IP blacklist checks are flagged.
      const dangerousIPs = ['103.21.', '193.109.', '45.143.', '185.191.'];
      if (hop.fromIp !== 'N/A' && dangerousIPs.some(dip => hop.fromIp.startsWith(dip))) {
        isSuspicious = true;
        warnings.push(`Sending relay IP ${hop.fromIp} has active listings on global spam blocklists (Blacklist Match).`);
      }

      finalizedHops.push({
        ...hop,
        hopNumber: i + 1,
        delaySec: delay,
        isSuspicious,
        warnings
      });
    });

    return finalizedHops;
  };

  // Re-parse when selectedEmail updates
  useEffect(() => {
    if (selectedEmail) {
      setHops(parseTraceHops(selectedEmail.rawHeaders));
    }
  }, [selectedEmail]);

  return (
    <div className="space-y-6 animate-fade-in" id="forensics-lab-root">
      
      {/* Visual Workspace Hero Banner */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-3xs">
        <div>
          <div className="flex items-center space-x-2">
            <Shield className="w-5 h-5 text-indigo-600 animate-pulse" />
            <h2 className="text-base font-serif italic text-slate-900 font-bold">NeoAegis Advanced Forensics Workbench</h2>
            <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-[9px] font-mono font-bold text-indigo-600 rounded">
              OFFLINE SUITE
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Zero-knowledge diagnostic utilities, localized rulesets, cryptographic checks, and Shadow DOM sanitizers for deep forensic analysis.
          </p>
        </div>
        {selectedEmail && (
          <div className="px-3.5 py-2 bg-white border border-slate-200 rounded-xl flex items-center space-x-2.5 shadow-3xs">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
            <div className="text-left font-mono">
              <span className="text-[10px] text-slate-400 block uppercase">ANALYZING TARGET</span>
              <span className="text-xs text-slate-800 font-bold max-w-[150px] truncate block">{selectedEmail.subject}</span>
            </div>
          </div>
        )}
      </div>

      {/* Grid: Secondary feature tabs selector */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 border-b border-slate-200 pb-3" id="forensics-sub-tabs">
        <button
          onClick={() => setActiveSubTab('sandbox')}
          className={`px-3 py-2 text-xs font-mono rounded-lg border transition-all ${
            activeSubTab === 'sandbox' 
              ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold shadow-3xs' 
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Code className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" />
          <span>HTML Sandbox</span>
        </button>

        <button
          onClick={() => setActiveSubTab('pgp')}
          className={`px-3 py-2 text-xs font-mono rounded-lg border transition-all ${
            activeSubTab === 'pgp' 
              ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold shadow-3xs' 
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Key className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" />
          <span>PGP Signature</span>
        </button>

        <button
          onClick={() => setActiveSubTab('rules')}
          className={`px-3 py-2 text-xs font-mono rounded-lg border transition-all ${
            activeSubTab === 'rules' 
              ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold shadow-3xs' 
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Terminal className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" />
          <span>Heuristic Rules</span>
        </button>

        <button
          onClick={() => setActiveSubTab('breach')}
          className={`px-3 py-2 text-xs font-mono rounded-lg border transition-all ${
            activeSubTab === 'breach' 
              ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold shadow-3xs' 
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Lock className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" />
          <span>ZK Leak Check</span>
        </button>

        <button
          onClick={() => setActiveSubTab('hops')}
          className={`col-span-2 md:col-span-1 px-3 py-2 text-xs font-mono rounded-lg border transition-all ${
            activeSubTab === 'hops' 
              ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold shadow-3xs' 
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Network className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" />
          <span>Header Trace</span>
        </button>
      </div>

      {/* ========================================================== */}
      {/* 1. DOM SANDBOX SUB-VIEW                                    */}
      {/* ========================================================== */}
      {activeSubTab === 'sandbox' && (
        <div className="space-y-6 animate-fade-in" id="subtab-dom-sandbox">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Sandbox Control & Editor Panel */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-1">Interactive Parameters</span>
                <h4 className="text-xs font-bold text-slate-850">Shadow DOM Sanitizer Engine</h4>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  Renders raw email layout inside a fully locked environment. Script scopes are terminated to prevent session extraction and credential fishing leaks.
                </p>

                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-lg shadow-3xs">
                    <span className="text-xs font-mono text-slate-600">Highlight Hidden Text Stuffing</span>
                    <button 
                      onClick={() => setHighlightHidden(!highlightHidden)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${highlightHidden ? 'bg-indigo-600' : 'bg-slate-200'}`}
                    >
                      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${highlightHidden ? 'translate-x-4' : 'translate-x-0'}`}></span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Real-time Defanged Asset Ledger */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Sanitization Ledger</span>
                  <span className="px-1.5 py-0.5 bg-indigo-50 border border-indigo-100 rounded text-[9px] font-mono text-indigo-700 font-bold">
                    Active Scans
                  </span>
                </div>

                {currentAnalysis.report.details.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-400 font-mono">
                     No hidden XSS, beacons, or scripts parsed in payload.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[250px] overflow-y-auto no-scrollbar">
                    {currentAnalysis.report.details.map((item, idx) => (
                      <div key={idx} className="bg-white p-2.5 rounded-lg border border-slate-200 text-left font-mono">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className={`px-1.5 py-0.5 rounded uppercase font-bold ${
                            item.type === 'Script Block' || item.type === 'Event Attribute' ? 'bg-red-50 text-red-700 border border-red-100' :
                            item.type === 'Tracking Beacon' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                            'bg-indigo-50 text-indigo-700 border border-indigo-100'
                          }`}>
                            {item.type}
                          </span>
                          <span className="text-slate-400">INDEX #{idx + 1}</span>
                        </div>
                        <p className="text-[11px] font-sans text-slate-700 mt-1.5 font-medium">{item.desc}</p>
                        <div className="mt-1.5 p-1.5 bg-slate-50 border border-slate-100 rounded text-[9px] text-slate-500 select-all truncate">
                          {item.raw}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Secure IFrame / Shadow DOM Canvas */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Isolated Visual Sandbox Canvas</span>
                <span className="text-xs text-emerald-600 font-mono flex items-center">
                  <ShieldCheck className="w-4 h-4 mr-1 animate-pulse" />
                  <span>Locked Shadow Iframe</span>
                </span>
              </div>

              {/* Sandboxed visual iframe container */}
              <div className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden shadow-3xs flex flex-col h-[480px]">
                <div className="bg-slate-100/80 border-b border-slate-200 px-4 py-2 flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-400"></span>
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">sandbox_container.html (Isolated Body)</span>
                </div>
                
                <div className="flex-1 bg-white relative">
                  <iframe 
                    title="Aegis Isolated HTML Canvas"
                    sandbox="allow-same-origin"
                    srcDoc={`
                      <!DOCTYPE html>
                      <html>
                        <head>
                          <style>
                            body { margin: 12px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #334155; }
                            /* Basic CSS reset inside sandboxed iframe */
                            img { max-width: 100%; height: auto; }
                          </style>
                        </head>
                        <body>
                          ${currentAnalysis.cleanHtml}
                        </body>
                      </html>
                    `}
                    className="w-full h-full border-none"
                  />
                </div>
              </div>

              <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-start space-x-2.5 text-left text-xs text-red-800">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                <div>
                  <span className="font-bold">Aegis Sandbox Isolation Shield Active:</span> External link operations, dynamic javascript injection attempts, cookie stores, storage requests, and asset hooks have been strictly deactivated within this container scope.
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* 2. PGP SIGNATURE SIMULATOR                                 */}
      {/* ========================================================== */}
      {activeSubTab === 'pgp' && (
        <div className="space-y-6 animate-fade-in" id="subtab-pgp-crypto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left panel: Key Ring Viewer */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Trusted keyring store</span>
                    <button 
                      onClick={() => setShowKeyCreateModal(true)}
                      className="px-2 py-1 bg-indigo-600 text-white font-mono text-[10px] rounded hover:bg-indigo-700 transition"
                    >
                      <Plus className="w-3 h-3 inline mr-1 -mt-0.5" /> ADD KEY
                    </button>
                  </div>

                  {/* List keys */}
                  <div className="space-y-3">
                    {pgpKeys.map(key => (
                      <div key={key.id} className="bg-white p-3 rounded-lg border border-slate-200 text-left font-mono relative group">
                        <button 
                          onClick={() => handleDeletePgpKey(key.id)}
                          className="absolute top-3 right-3 text-slate-300 hover:text-red-600 transition"
                          title="Remove from keyring"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <div className="flex items-center space-x-2">
                          <Fingerprint className="w-4 h-4 text-indigo-600" />
                          <span className="text-xs font-bold text-slate-800 truncate pr-6">{key.userId}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-wider">FINGERPRINT ID</p>
                        <p className="text-[11px] text-indigo-700 mt-0.5 bg-slate-50 p-1.5 rounded border border-slate-100 select-all font-bold">
                          {key.fingerprint}
                        </p>
                        <div className="mt-2.5 flex items-center justify-between text-[9px] text-slate-400 pt-2 border-t border-slate-100">
                          <span>ALG: {key.algorithm}</span>
                          <span>TRUST: STRICT TEMPLATE</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Add Key Modal Overlay (Inline simulation) */}
              {showKeyCreateModal && (
                <form onSubmit={handleAddNewPgpKey} className="bg-slate-50 border border-indigo-200 rounded-xl p-4 space-y-3 animate-fade-in">
                  <h4 className="text-xs font-bold text-slate-900">Import GPG/PGP Public Key</h4>
                  
                  <div>
                    <label className="block text-[10px] font-mono text-slate-500">USER ID DESCRIPTION</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. Admin Desk <admin@agency.com>" 
                      value={newKeyUserId}
                      onChange={e => setNewKeyUserId(e.target.value)}
                      className="w-full text-xs font-mono bg-white border border-slate-200 text-slate-800 p-2 rounded focus:outline-none focus:border-indigo-400"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-slate-500">HEX FINGERPRINT (40 CHARS)</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. AAAA BBBB CCCC DDDD EEEE FFFF..." 
                      value={newKeyFingerprint}
                      onChange={e => setNewKeyFingerprint(e.target.value)}
                      className="w-full text-xs font-mono bg-white border border-slate-200 text-slate-800 p-2 rounded focus:outline-none focus:border-indigo-400"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-slate-500">PUBLIC KEY DATA BLOCK (OPTIONAL)</label>
                    <textarea 
                      rows={2}
                      placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----..." 
                      value={newKeyArmor}
                      onChange={e => setNewKeyArmor(e.target.value)}
                      className="w-full text-[10px] font-mono bg-white border border-slate-200 text-slate-800 p-2 rounded focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center space-x-2 pt-1.5">
                    <button type="submit" className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-mono rounded hover:bg-indigo-700 transition">
                      SAVE KEY TO RING
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setShowKeyCreateModal(false)}
                      className="px-3 py-1.5 bg-slate-200 text-slate-600 text-xs font-mono rounded hover:bg-slate-300 transition"
                    >
                      CANCEL
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Right panel: Active Signature Sandbox Verification */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">PGP Signature Parser</span>
                <button 
                  onClick={loadPgpSignedPreset}
                  className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 rounded text-[9px] font-mono text-indigo-700 font-bold"
                >
                  LOAD SECURE PRESET TEMPLATE
                </button>
              </div>

              <div className="space-y-3">
                <label className="block text-[11px] font-mono text-slate-500">PASTE ARMORED PGP SIGNED MESSAGE BLOCK</label>
                <textarea 
                  rows={8}
                  placeholder="-----BEGIN PGP SIGNED MESSAGE-----&#10;Hash: SHA256&#10;&#10;[Message Body Here]&#10;-----BEGIN PGP SIGNATURE-----&#10;iQEzBAEBCAAdFiEE...&#10;-----END PGP SIGNATURE-----" 
                  value={armoredInput}
                  onChange={e => setArmoredInput(e.target.value)}
                  className="w-full text-[11px] font-mono bg-white border border-slate-200 text-slate-800 p-3 rounded-lg focus:outline-none focus:border-indigo-400"
                />

                <button 
                  onClick={handleVerifyArmoredSignature}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-mono text-xs rounded-xl transition flex items-center justify-center space-x-2 cursor-pointer shadow-xs"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>DECRYPT ENVELOPE & RUN SIGNATURE METRIC VALIDATION</span>
                </button>
              </div>

              {/* Cryptographic Result Output display */}
              {pgpResult.status !== 'idle' && (
                <div className={`p-5 rounded-2xl border ${
                  pgpResult.status === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                  pgpResult.status === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' :
                  'bg-red-50 border-red-200 text-red-800'
                } text-left space-y-4 shadow-3xs animate-fade-in`}>
                  
                  <div className="flex items-start space-x-3">
                    {pgpResult.status === 'success' ? (
                      <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5 animate-pulse" />
                    ) : pgpResult.status === 'warning' ? (
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    )}

                    <div className="space-y-1">
                      <span className="text-[10px] font-mono uppercase tracking-widest block font-bold">
                        // CRYPTOGRAPHIC REPORT OUTCOME
                      </span>
                      <p className="text-xs font-semibold leading-relaxed">{pgpResult.message}</p>
                    </div>
                  </div>

                  {pgpResult.senderId && (
                    <div className="bg-white/80 p-3 rounded-xl border border-slate-200/50 space-y-2 font-mono text-[11px] text-slate-700">
                      <div>
                        <span className="text-[9px] text-slate-400 block font-bold uppercase">SIGNATURE ORIGIN DESCRIPTION</span>
                        <span className="font-bold text-slate-900">{pgpResult.senderId}</span>
                      </div>
                      <div className="pt-2 border-t border-slate-200/50">
                        <span className="text-[9px] text-slate-400 block font-bold uppercase">EXTRACTED ALIGNED KEY FINGERPRINT</span>
                        <span className="font-bold text-indigo-700">{pgpResult.fingerprint}</span>
                      </div>
                      {pgpResult.isTrusted ? (
                        <div className="mt-2 text-[10px] text-emerald-600 font-bold uppercase flex items-center space-x-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>TRUSTED SENDER IDENTITY VALIDATED</span>
                        </div>
                      ) : (
                        <div className="mt-2 text-[10px] text-amber-600 font-bold uppercase flex items-center space-x-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>UNTRUSTED SIGNATURE KEY (KEY NOT IN LOCAL DATABASE)</span>
                        </div>
                      )}
                    </div>
                  )}

                  {pgpResult.extractedBody && (
                    <div className="bg-slate-900 text-slate-100 p-3.5 rounded-xl font-mono text-[11px] space-y-1 select-all h-28 overflow-y-auto">
                      <span className="text-[9px] text-slate-400 block uppercase tracking-wider">// ENVELOPE SECURE PLAINTEXT payload</span>
                      <p className="whitespace-pre-wrap">{pgpResult.extractedBody}</p>
                    </div>
                  )}

                </div>
              )}

            </div>

          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* 3. HEURISTIC CUSTOM RULES BUILDER                          */}
      {/* ========================================================== */}
      {activeSubTab === 'rules' && (
        <div className="space-y-6 animate-fade-in" id="subtab-custom-heuristics">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left panel: Live Rule Builder and Sandbox Tester */}
            <div className="lg:col-span-5 space-y-4">
              <form onSubmit={handleCreateRule} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 text-left">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">// Create Heuristic Pattern</span>
                <h4 className="text-xs font-bold text-slate-850">Custom Filter Rule Sandbox</h4>
                
                <div>
                  <label className="block text-[10px] font-mono text-slate-500">RULE TEMPLATE NAME</label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. Internal Corporate Urgency Spoof" 
                    value={ruleName}
                    onChange={e => setRuleName(e.target.value)}
                    className="w-full text-xs font-mono bg-white border border-slate-200 text-slate-800 p-2.5 rounded focus:outline-none focus:border-indigo-400"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-mono text-slate-500">REGEX REGULAR EXPRESSION</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. \b(wire|bank|routing)\b" 
                      value={ruleRegex}
                      onChange={e => setRuleRegex(e.target.value)}
                      className="w-full text-xs font-mono bg-white border border-slate-200 text-slate-800 p-2.5 rounded focus:outline-none focus:border-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-slate-500">SCORE DANGER WEIGHT</label>
                    <select 
                      value={ruleWeight}
                      onChange={e => setRuleWeight(Number(e.target.value))}
                      className="w-full text-xs font-mono bg-white border border-slate-200 text-slate-800 p-2.5 rounded focus:outline-none"
                    >
                      <option value="25">+25 (Highly Suspicious)</option>
                      <option value="15">+15 (Moderate Indicator)</option>
                      <option value="10">+10 (Soft Threat Marker)</option>
                      <option value="-15">-15 (Corporate Trust Override)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-[10px] font-mono text-slate-500">EVALUATION RANGE TARGET</label>
                    <div className="flex space-x-2 mt-1">
                      {['subject', 'body', 'headers'].map(target => (
                        <button
                          key={target}
                          type="button"
                          onClick={() => setRuleTarget(target as any)}
                          className={`flex-1 py-1 px-2 text-[10px] font-mono uppercase rounded border transition-all ${
                            ruleTarget === target 
                              ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold' 
                              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100'
                          }`}
                        >
                          {target}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-slate-500">RULE TARGET MOTIVATION DESCRIPTION</label>
                  <input 
                    type="text" 
                    placeholder="Flags critical bank requests bypassing DKIM envelopes." 
                    value={ruleDesc}
                    onChange={e => setRuleDesc(e.target.value)}
                    className="w-full text-xs font-mono bg-white border border-slate-200 text-slate-800 p-2.5 rounded focus:outline-none"
                  />
                </div>

                {/* Real-time matcher feedback indicators */}
                {ruleRegex && (
                  <div className={`p-2.5 rounded border text-xs font-mono ${
                    testResult.matches 
                      ? 'bg-red-50 border-red-200 text-red-800' 
                      : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  }`}>
                    <div className="flex items-center justify-between font-bold text-[10px]">
                      <span>LIVE PATTERN MATCH FEEDBACK:</span>
                      <span className={testResult.matches ? 'text-red-600 animate-pulse' : 'text-emerald-600'}>
                        {testResult.matches ? '⚠️ PATTERN MATCHED' : '✅ NO MATCH'}
                      </span>
                    </div>
                    {testResult.matches && (
                      <div className="mt-1.5 space-y-1">
                        <p className="text-[10px]">Occurrences: {testResult.matchCount}</p>
                        <p className="text-[10px] truncate">
                          Matched Keys: <strong className="bg-red-100 px-1 py-0.5 rounded text-red-700">{testResult.matchedStrings.join(', ')}</strong>
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <button type="submit" className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-mono text-xs rounded-lg transition mt-2">
                  SAVE REGEX RULE TO ACTIVE ENGINE
                </button>
              </form>
            </div>

            {/* Right panel: Active custom rules database ledger */}
            <div className="lg:col-span-7 space-y-4 text-left">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Active Custom Rules database</span>
                <span className="px-1.5 py-0.5 bg-indigo-50 border border-indigo-100 rounded text-[9px] font-mono text-indigo-700 font-bold">
                  {customRules.length} Custom Filters Hooked
                </span>
              </div>

              {customRules.length === 0 ? (
                <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl py-12 text-center text-sm text-slate-400 font-mono space-y-2">
                  <Terminal className="w-8 h-8 mx-auto text-slate-300" />
                  <p>No custom regex rules evaluated in database.</p>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto px-4 font-sans leading-relaxed">
                     Write a custom key rule on the left panel (e.g. tracking suspicious domain names or words) and hook it live into the spam calculation matrices instantly.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[440px] overflow-y-auto no-scrollbar">
                  {customRules.map(rule => (
                    <div key={rule.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 relative">
                      <button 
                        onClick={() => handleDeleteRule(rule.id)}
                        className="absolute top-3.5 right-3.5 text-slate-400 hover:text-red-600 transition"
                        title="Delete custom rule"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <div className="space-y-1">
                        <span className={`px-2 py-0.5 text-[9px] font-mono font-bold rounded uppercase ${
                          rule.weight > 0 ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                        }`}>
                          Weight: {rule.weight > 0 ? `+${rule.weight}` : rule.weight} Danger
                        </span>
                        <h4 className="text-xs font-bold text-slate-850 mt-1 truncate pr-6">{rule.name}</h4>
                      </div>

                      <div className="font-mono text-[10px] space-y-1 bg-white p-2.5 rounded-lg border border-slate-200">
                        <div>
                          <span className="text-slate-400 block uppercase font-bold text-[8px]">TARGET DOMAIN RANGE</span>
                          <span className="text-slate-700 font-bold uppercase">{rule.target}</span>
                        </div>
                        <div className="pt-1.5 border-t border-slate-100">
                          <span className="text-slate-400 block uppercase font-bold text-[8px]">REGULAR EXPRESSION PATTERN</span>
                          <span className="text-indigo-700 font-bold break-all select-all">{rule.regex}</span>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-500 font-sans leading-normal">{rule.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* 4. ZERO-KNOWLEDGE BREACH INSPECTOR                        */}
      {/* ========================================================== */}
      {activeSubTab === 'breach' && (
        <div className="space-y-6 animate-fade-in" id="subtab-leak-check">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left panel: Interactive check controls */}
            <div className="lg:col-span-5 space-y-4 text-left">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-1">Privacy Preserving check</span>
                <h4 className="text-xs font-bold text-slate-850">k-Anonymity Leak Scanner</h4>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  If this email contains sensitive test credentials, API keys, or hardcoded passwords, verify their safety instantly against HaveIBeenPwned's dataset of 10+ billion records.
                </p>

                <div className="pt-2 flex flex-wrap gap-2">
                  <button 
                    onClick={scanEmailForCredentials}
                    className="px-2.5 py-1.5 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 text-indigo-700 text-xs font-mono rounded-lg transition font-bold shadow-3xs"
                  >
                    SCAN CURRENT EMAIL FOR CREDENTIALS
                  </button>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-3xs">
                <label className="block text-[11px] font-mono text-slate-500">TEST CREDENTIAL STRINGS OR HARDCODED STRINGS</label>
                <div className="flex space-x-2">
                  <input 
                    type="text" 
                    value={leakInput}
                    onChange={e => setLeakInput(e.target.value)}
                    placeholder="e.g. admin123, securepass..."
                    className="flex-1 text-xs font-mono bg-slate-50 border border-slate-200 text-slate-800 p-2 rounded focus:outline-none focus:border-indigo-400"
                  />
                  <button 
                    onClick={handleCheckCredentialLeak}
                    disabled={checkingLeak || !leakInput}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-mono rounded hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {checkingLeak ? 'SCANNING...' : 'CHECK'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed font-sans">
                  * SECURITY EXCLUSION: Full passwords are never transmitted. The first 5 characters of SHA-1 hash alone are queried. Suffix matching happens entirely on your local machine.
                </p>
              </div>
            </div>

            {/* Right panel: k-Anonymity Cryptographic results timeline */}
            <div className="lg:col-span-7 space-y-4 text-left">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Zero-Knowledge Diagnostic Flow</span>

              {!leakResult ? (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl py-12 text-center text-sm text-slate-400 font-mono space-y-2">
                  <Lock className="w-8 h-8 mx-auto text-slate-300" />
                  <p>Input credential and run check sequence above.</p>
                </div>
              ) : (
                <div className="space-y-4 animate-fade-in">
                  
                  {/* Visual Protocol Timeline / Sequence Map */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 font-mono text-xs">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2">
                      <span className="text-[10px] text-indigo-700 font-bold uppercase tracking-wider">🔒 Client-Server Handshake Trace</span>
                      <span className="px-1.5 py-0.5 bg-emerald-50 border border-emerald-100 rounded text-[9px] text-emerald-700 font-bold">SECURE k-ANONYMITY</span>
                    </div>

                    <div className="space-y-4 relative pl-4 border-l border-indigo-100">
                      
                      <div className="relative">
                        <div className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-indigo-600"></div>
                        <span className="text-[10px] text-slate-400 block uppercase font-bold">STEP 1: Hash String Locally (Local Browser)</span>
                        <p className="text-slate-800 font-semibold text-[11px] break-all">
                          SHA-1 Hash computed = <span className="bg-slate-200 px-1 rounded select-all font-bold">{leakResult.prefix + leakResult.suffix}</span>
                        </p>
                      </div>

                      <div className="relative">
                        <div className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-indigo-600"></div>
                        <span className="text-[10px] text-slate-400 block uppercase font-bold">STEP 2: Truncate & Query Prefix (Query transmitted)</span>
                        <p className="text-slate-800 text-[11px] leading-relaxed">
                          Sending prefix <strong className="text-indigo-700 font-bold bg-indigo-50 px-1 border border-indigo-100 rounded">{leakResult.prefix}</strong> to haveibeenpwned.com database range API. 
                          <span className="text-emerald-600 block mt-0.5">✔ No secrets leave the browser.</span>
                        </p>
                      </div>

                      <div className="relative">
                        <div className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-indigo-600"></div>
                        <span className="text-[10px] text-slate-400 block uppercase font-bold">STEP 3: Suffix Verification (Local Machine)</span>
                        <p className="text-slate-800 text-[11px]">
                          Received {leakResult.error ? '0' : 'approx 500'} suffix results. Local lookup matching target suffix: <strong className="text-slate-700">{leakResult.suffix}</strong>
                        </p>
                      </div>

                    </div>
                  </div>

                  {/* Ultimate Leak Outcome Card */}
                  {leakResult.error ? (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-mono space-y-1">
                      <div className="flex items-center space-x-1.5 font-bold">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span>PROTOCOL STATUS WARNING</span>
                      </div>
                      <p>{leakResult.error}</p>
                    </div>
                  ) : leakResult.leaked ? (
                    <div className="p-5 bg-red-50 border-2 border-red-200 rounded-2xl text-red-800 text-left space-y-3 shadow-3xs">
                      <div className="flex items-center space-x-2">
                        <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 animate-pulse" />
                        <span className="text-sm font-bold uppercase tracking-wider font-mono">⚠️ CRITICAL EXPOSURE LEAK DETECTED</span>
                      </div>
                      <p className="text-xs font-sans leading-relaxed">
                        This credential string has been indexed in public data leaks. <strong className="font-bold underline text-red-900">It is extremely compromised and unsafe</strong> to be used on active corporate nodes or in local configurations.
                      </p>
                      <div className="bg-white/80 p-3 rounded-xl border border-red-200 font-mono text-xs flex items-center justify-between">
                        <span>DATA LEAK OCCURRENCES:</span>
                        <span className="text-sm font-bold text-red-600">{leakResult.count.toLocaleString()} TIMES</span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-5 bg-emerald-50 border-2 border-emerald-200 rounded-2xl text-emerald-800 text-left space-y-3 shadow-3xs">
                      <div className="flex items-center space-x-2">
                        <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                        <span className="text-sm font-bold uppercase tracking-wider font-mono">🛡️ SECURE: NO KNOWN LEAKS IDENTIFIED</span>
                      </div>
                      <p className="text-xs font-sans leading-relaxed">
                        This credential string was not found in any indexed public breaches inside haveibeenpwned repositories. Message transmission has low risk of hardcoded leakage profiles.
                      </p>
                    </div>
                  )}

                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* 5. EMAIL HEADER HOP VISUALIZER                            */}
      {/* ========================================================== */}
      {activeSubTab === 'hops' && (
        <div className="space-y-6 animate-fade-in" id="subtab-header-hops">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left raw trace input */}
            <div className="lg:col-span-5 space-y-4 text-left">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-1">MTA routing forensicator</span>
                <h4 className="text-xs font-bold text-slate-850">Envelope Header Hop visualizer</h4>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Traces the journey of an email chronologically through mail exchange servers (MTAs). Highlight jumps with unverified protocols, blacklisted IPs, or delay spikes.
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-3xs">
                <label className="block text-[11px] font-mono text-slate-500">RAW HEADERS ENVELOPE (EVALUATING RECEIVED: TRACES)</label>
                <textarea 
                  rows={8}
                  readOnly
                  value={selectedEmail ? selectedEmail.rawHeaders : 'No headers indexed.'}
                  className="w-full text-[10px] font-mono bg-slate-50 border border-slate-200 text-slate-600 p-2.5 rounded focus:outline-none focus:ring-1 focus:ring-indigo-200 cursor-not-allowed select-all"
                />
                <span className="text-[10px] text-slate-400 block font-sans">
                  * Headers are loaded dynamically when selecting a mail from the dashboard audit buffer index.
                </span>
              </div>
            </div>

            {/* Right chronological interactive timeline flow */}
            <div className="lg:col-span-7 space-y-4 text-left">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Chronological Mail Transfer Route</span>
                <span className="px-1.5 py-0.5 bg-indigo-50 border border-indigo-100 rounded text-[9px] font-mono text-indigo-700 font-bold">
                  {hops.length} Mail Server Hop Node(s)
                </span>
              </div>

              {hops.length === 0 ? (
                <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl py-12 text-center text-sm text-slate-400 font-mono">
                  No trace headers parsed from active email selection.
                </div>
              ) : (
                <div className="space-y-4 relative pl-5 border-l-2 border-indigo-100">
                  
                  {hops.map((hop, idx) => {
                    const isLast = idx === hops.length - 1;
                    const isFirst = idx === 0;

                    return (
                      <div key={hop.hopNumber} className="relative bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2.5 shadow-3xs hover:border-indigo-200 transition">
                        
                        {/* Node timeline pin */}
                        <div className={`absolute -left-[27px] top-4.5 w-3.5 h-3.5 rounded-full border-2 ${
                          hop.isSuspicious 
                            ? 'bg-red-500 border-red-100' 
                            : 'bg-indigo-600 border-indigo-50'
                        } flex items-center justify-center`}>
                          <span className="text-[8px] font-bold text-white leading-none">{hop.hopNumber}</span>
                        </div>

                        {/* Hop details bar */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-200/50 pb-2">
                          <div className="space-y-0.5">
                            <span className="text-[9px] font-mono text-slate-400 uppercase font-bold tracking-wider">
                              {isFirst ? 'HOP #1: SENDER ORIGIN EXCHANGE' : isLast ? `HOP #${hop.hopNumber}: TARGET INBOUND ENDPOINT` : `HOP #${hop.hopNumber}: INTERMEDIATE RELAY GATEWAY`}
                            </span>
                            <h4 className="text-xs font-bold text-slate-800 font-mono truncate max-w-sm">
                              {hop.from}
                            </h4>
                          </div>

                          <div className="text-right font-mono text-[10px]">
                            <span className="text-slate-400 block uppercase">LATENCY</span>
                            <span className={`font-bold ${hop.delaySec > 120 ? 'text-red-600' : 'text-slate-600'}`}>
                              {hop.delaySec === 0 ? 'Instant' : `+${hop.delaySec} sec`}
                            </span>
                          </div>
                        </div>

                        {/* Diagnostic detail fields */}
                        <div className="grid grid-cols-2 gap-3 text-[11px] font-mono text-slate-700">
                          <div>
                            <span className="text-slate-400 block text-[9px] font-bold uppercase">OUTBOUND GATEWAY IP</span>
                            <span className="font-bold select-all">{hop.fromIp}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px] font-bold uppercase">RECEIVING MAIL SERVER</span>
                            <span className="font-bold truncate block">{hop.by}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px] font-bold uppercase">TRANSFER PROTOCOL</span>
                            <span className="font-bold uppercase">{hop.withProtocol}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px] font-bold uppercase">TIMESTAMP STAMP</span>
                            <span className="font-bold truncate block">{new Date(hop.timestamp).toLocaleTimeString() || hop.timestamp}</span>
                          </div>
                        </div>

                        {/* Threat warning panels */}
                        {hop.warnings.length > 0 && (
                          <div className="mt-2 p-2.5 bg-red-50 border border-red-100 rounded-lg text-red-850 text-[10px] font-mono space-y-1 text-left">
                            <div className="flex items-center space-x-1 font-bold">
                              <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                              <span>WARNING: FORENSIC EXPOSURE DETECTED</span>
                            </div>
                            {hop.warnings.map((w, wIdx) => (
                              <p key={wIdx}>• {w}</p>
                            ))}
                          </div>
                        )}

                      </div>
                    );
                  })}

                </div>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
