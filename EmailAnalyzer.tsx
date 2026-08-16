/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, ShieldCheck, Mail, FileText, Settings, RefreshCw, 
  HelpCircle, AlertTriangle, AlertCircle, Sparkles, AlertOctagon, CheckCircle2
} from 'lucide-react';
import { analyzeEmail, MOCK_EMAILS } from './spamEngine';
import { EmailRecord, SpamMetrics } from './types';

interface EmailAnalyzerProps {
  onAnalyzeFinished: (record: EmailRecord) => void;
  selectedEmail: EmailRecord | null;
}

export default function EmailAnalyzer({ onAnalyzeFinished, selectedEmail }: EmailAnalyzerProps) {
  // Config state
  const [subject, setSubject] = useState('');
  const [sender, setSender] = useState('');
  const [recipient, setRecipient] = useState('');
  const [body, setBody] = useState('');
  const [headers, setHeaders] = useState('');

  // Active metrics output state
  const [metrics, setMetrics] = useState<SpamMetrics | null>(null);

  // Initialize form when a preset / selected email is updated from dashboard
  useEffect(() => {
    if (selectedEmail) {
      setSubject(selectedEmail.subject);
      setSender(selectedEmail.sender);
      setRecipient(selectedEmail.recipient);
      setBody(selectedEmail.body);
      setHeaders(selectedEmail.rawHeaders);
      
      const res = analyzeEmail(selectedEmail.subject, selectedEmail.body, selectedEmail.rawHeaders);
      setMetrics(res);
    } else if (MOCK_EMAILS.length > 0) {
      // Default to the first mock email
      const first = MOCK_EMAILS[0];
      setSubject(first.subject);
      setSender(first.sender);
      setRecipient(first.recipient);
      setBody(first.body);
      setHeaders(first.rawHeaders);
      setMetrics(first.metrics);
    }
  }, [selectedEmail]);

  // Handle live re-analysis
  const handleAnalyze = () => {
    // Generate headers if empty
    const cleanHeaders = headers || `From: ${sender}\nTo: ${recipient}\nSubject: ${subject}\nDKIM: Pass\nSPF: Pass`;
    const computed = analyzeEmail(subject, body, cleanHeaders);
    setMetrics(computed);

    // callback upward
    const newRecord: EmailRecord = {
      id: selectedEmail?.id || `custom-${Date.now()}`,
      subject,
      sender,
      recipient,
      body,
      rawHeaders: cleanHeaders,
      timestamp: new Date().toISOString(),
      isSpam: computed.spamScore > 50 || computed.phishingLikelihood > 45,
      metrics: computed
    };

    onAnalyzeFinished(newRecord);
  };

  // Load Presets
  const loadPreset = (preset: EmailRecord) => {
    setSubject(preset.subject);
    setSender(preset.sender);
    setRecipient(preset.recipient);
    setBody(preset.body);
    setHeaders(preset.rawHeaders);
    setMetrics(preset.metrics);
    onAnalyzeFinished(preset);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in" id="email-analyzer-view">
      
      {/* Left Input Panel: Standard Composer & Raw Header Editors */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 md:p-6 lg:col-span-6 space-y-4 shadow-3xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div>
            <h3 className="text-base font-display font-semibold text-slate-900 flex items-center space-x-2">
              <Mail className="text-indigo-600 h-5 w-5" />
              <span>Inbound headers & body parser</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Simulate or modify standard header variables to evaluate security scores.
            </p>
          </div>
        </div>

        {/* Preset Selectors */}
        <div>
          <span className="text-[10px] font-mono text-slate-400 uppercase">LOAD SPAM / PHISHING SAMPLES</span>
          <div className="flex flex-wrap gap-2 mt-2">
            {MOCK_EMAILS.map(preset => (
              <button
                key={preset.id}
                onClick={() => loadPreset(preset)}
                className={`px-2.5 py-1.5 text-xs font-mono rounded-lg border transition-all duration-200 ${
                  subject === preset.subject 
                    ? 'border-indigo-200 bg-indigo-50 text-indigo-700 font-bold shadow-2xs' 
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 shadow-3xs'
                }`}
              >
                {preset.id.toUpperCase()}: {preset.subject.substring(0, 15)}...
              </button>
            ))}
          </div>
        </div>

        {/* Input variables */}
        <div className="space-y-3 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-mono text-slate-500 mb-1">STAMPED SENDER (FROM:)</label>
              <input 
                type="text" 
                value={sender} 
                onChange={e => setSender(e.target.value)}
                placeholder="CEO Office <ceo@global-banking.com>"
                className="w-full text-xs font-mono bg-white border border-slate-200 text-slate-800 p-2.5 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono text-slate-500 mb-1">TARGET RECIPIENT (TO:)</label>
              <input 
                type="text" 
                value={recipient} 
                onChange={e => setRecipient(e.target.value)}
                placeholder="employee@agency-enterprise.com"
                className="w-full text-xs font-mono bg-white border border-slate-200 text-slate-800 p-2.5 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-mono text-slate-500 mb-1">SUBJECT LINE</label>
            <input 
              type="text" 
              value={subject} 
              onChange={e => setSubject(e.target.value)}
              placeholder="Action Required: Review bank wires details immediately"
              className="w-full text-xs font-sans font-medium bg-white border border-slate-200 text-slate-800 p-2.5 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono text-slate-500 mb-1">EMAIL BODY CONTENTS</label>
            <textarea 
              rows={7}
              value={body} 
              onChange={e => setBody(e.target.value)}
              placeholder="Please confirm payment transfer credentials..."
              className="w-full text-xs font-sans bg-white border border-slate-200 text-slate-800 p-2.5 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all leading-relaxed"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-[11px] font-mono text-slate-500">RAW SECURITY ENVELOPE HEADERS (DKIM/SPF/RECEPTS)</label>
              <span className="text-[10px] text-indigo-600 font-mono">Modifies score output</span>
            </div>
            <textarea 
              rows={4}
              value={headers} 
              onChange={e => setHeaders(e.target.value)}
              placeholder="Received-SPF: pass..."
              className="w-full text-[11px] font-mono bg-white border border-slate-200 text-slate-800 p-2.5 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
            />
          </div>
        </div>

        <button 
          onClick={handleAnalyze}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-mono rounded-xl transition duration-200 flex items-center justify-center space-x-2 cursor-pointer shadow-xs"
        >
          <RefreshCw className="h-4 w-4" />
          <span>RE-RUN CLASSIFIER ENGINE & EXTRACT METRICS</span>
        </button>

      </div>

      {/* Right Report Panel: Multi-Score Gauges & Interactive Advice */}
      <div className="space-y-6 lg:col-span-6">
        
        {/* Dynamic Risk Meter Card */}
        {metrics && (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 md:p-6 space-y-6 shadow-3xs">
            
            {/* Headers indicators */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center space-x-2">
                <ShieldAlert className={`h-5 w-5 ${metrics.spamScore > 50 ? 'text-red-600' : 'text-emerald-600'}`} />
                <span className="text-sm font-mono font-bold text-slate-900">REAL-TIME SANDBOX THREAT DIAGRAM</span>
              </div>
              <span className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold ${
                metrics.spamScore > 75 ? 'bg-red-50 text-red-600 border border-red-200' :
                metrics.spamScore > 40 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                'bg-emerald-50 text-emerald-600 border border-emerald-200'
              }`}>
                {metrics.spamScore > 50 ? 'SPAM / ATTACK DETECTED' : 'SAFE / CLEAN ENVELOPE'}
              </span>
            </div>

            {/* Double Radial dial bars mock */}
            <div className="grid grid-cols-2 gap-4">
              
              <div className="bg-white p-4 rounded-xl border border-slate-200 text-center flex flex-col items-center justify-center space-y-1 shadow-3xs">
                <span className="text-[10px] font-mono text-slate-400 uppercase">SPAM PROBABILITY</span>
                <div className="relative flex items-center justify-center my-3">
                  {/* Circle outline background */}
                  <div className="w-20 h-20 rounded-full border-4 border-slate-100 bg-slate-50/50 flex items-center justify-center">
                    <span className="text-xl font-display font-bold text-slate-900">{metrics.spamScore}%</span>
                  </div>
                </div>
                <span className="text-[11px] font-mono text-slate-500">Classified Rules Triggered: {metrics.rulesTriggeredCount}</span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 text-center flex flex-col items-center justify-center space-y-1 shadow-3xs">
                <span className="text-[10px] font-mono text-slate-400 uppercase">PHISHING SEVERITY</span>
                <div className="relative flex items-center justify-center my-3">
                  <div className="w-20 h-20 rounded-full border-4 border-slate-100 bg-slate-50/50 flex items-center justify-center">
                    <span className="text-xl font-display font-bold text-red-600">{metrics.phishingLikelihood}%</span>
                  </div>
                </div>
                <span className="text-[11px] font-mono text-slate-500">Sender Grade: Grade {metrics.senderReputationRank}</span>
              </div>

            </div>

            {/* Crucial trigger factors breakdown */}
            <div className="space-y-3">
              <span className="text-[10px] font-mono text-slate-400 uppercase">FAILED SECURITY CRITERIA & FLAG TRIGGERS</span>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
                
                {metrics.financialSensationIndex > 30 && (
                  <div className="flex items-center space-x-2 bg-red-50 text-red-700 p-2.5 rounded-lg border border-red-200">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Financial Solicitation ({metrics.financialSensationIndex}%)</span>
                  </div>
                )}

                {metrics.urgencyCoefficient > 30 && (
                  <div className="flex items-center space-x-2 bg-red-50 text-red-700 p-2.5 rounded-lg border border-red-200">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>System Pressure Pressure ({metrics.urgencyCoefficient}%)</span>
                  </div>
                )}

                {metrics.authorityMimicryIndex > 30 && (
                  <div className="flex items-center space-x-2 bg-amber-50 text-amber-700 p-2.5 rounded-lg border border-amber-200">
                    <AlertOctagon className="h-4 w-4 shrink-0" />
                    <span>Authority Masking ({metrics.authorityMimicryIndex}%)</span>
                  </div>
                )}

                {metrics.mismatchedDomainsCount > 0 && (
                  <div className="flex items-center space-x-2 bg-yellow-50 text-yellow-800 p-2.5 rounded-lg border border-yellow-200">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>Url Domain Divergences ({metrics.mismatchedDomainsCount})</span>
                  </div>
                )}

                {metrics.dkimStatus === 'Fail' && (
                  <div className="flex items-center space-x-2 bg-red-50 text-red-700 p-2.5 rounded-lg border border-red-200">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>DKIM Cryptographic Fail</span>
                  </div>
                )}

                {metrics.spfStatus === 'Fail' && (
                  <div className="flex items-center space-x-2 bg-red-50 text-red-700 p-2.5 rounded-lg border border-red-200">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>SPF Domain Fail</span>
                  </div>
                )}

                {metrics.zeroFontHiddenTextDetected && (
                  <div className="flex items-center space-x-2 bg-red-50 text-red-700 p-2.5 rounded-lg border border-red-200">
                    <Sparkles className="h-4 w-4 shrink-0" />
                    <span>Hidden Zero-Font Text</span>
                  </div>
                )}

                {metrics.senderRecipientDiscrepancy && (
                  <div className="flex items-center space-x-2 bg-amber-50 text-amber-700 p-2.5 rounded-lg border border-amber-200">
                    <HelpCircle className="h-4 w-4 shrink-0" />
                    <span>Generic Impersonation Greeting</span>
                  </div>
                )}

                {metrics.rulesTriggeredCount === 0 && (
                  <div className="flex items-center space-x-2 bg-emerald-50 text-emerald-700 p-2.5 rounded-lg border border-emerald-200 col-span-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>All security rule templates passed with clean parameters.</span>
                  </div>
                )}

              </div>
            </div>

            {/* Recommended Action Center */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2 shadow-3xs">
              <span className="text-[10px] font-mono text-slate-400 uppercase block">RECOMMENDED DEFENSIVE PROTOCOL</span>
              {metrics.spamScore > 75 ? (
                <div className="space-y-2">
                  <p className="text-xs text-red-700 font-sans leading-relaxed">
                    This email exhibits characteristic patterns of a sophisticated social engineering phishing attack. It incorporates structural domain mismatches alongside deceptive financial trigger components.
                  </p>
                  <ul className="text-[11px] font-mono text-slate-500 list-disc list-inside space-y-1">
                    <li>Strictly quarantine the message immediately</li>
                    <li>Do not execute or open any associated invoice files (Risk rating: {metrics.attachmentRiskIndex}%)</li>
                    <li>Route sending IP ({metrics.ipBlacklistMatches > 0 ? 'Blacklisted' : 'Unverified'}) to enterprise block lists</li>
                  </ul>
                </div>
              ) : metrics.spamScore > 40 ? (
                <div className="space-y-2">
                  <p className="text-xs text-amber-800 font-sans leading-relaxed">
                    Suspicious indicators found. This might represent mass marketing spam or standard external correspondence utilizing non-aligned domain envelopes.
                  </p>
                  <ul className="text-[11px] font-mono text-slate-500 list-disc list-inside space-y-1">
                    <li>Inspect hyper-target links before cursor execution</li>
                    <li>Verify sender authenticity using offline secure phone channels</li>
                  </ul>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-emerald-700 font-sans leading-relaxed">
                    The envelope structure is validly signed and authenticated. No anomalous urgencies, authorities mimic, or zero-font bypass mechanisms were indexed.
                  </p>
                  <p className="text-[11px] font-mono text-slate-500">
                    Confidence: High (Overall sandbox resilience score: {metrics.defenseRating}%)
                  </p>
                </div>
              )}
            </div>

          </div>
        )}

      </div>

    </div>
  );
}
