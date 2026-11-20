/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  ShieldAlert, Mail, RefreshCw, HelpCircle, AlertTriangle,
  AlertCircle, Sparkles, AlertOctagon, CheckCircle2, BrainCircuit
} from 'lucide-react';
import { analyzeEmailWithModel, MOCK_EMAILS } from './spamEngine';
import { EmailLabel, EmailRecord, SpamMetrics, TrainedModelArtifact, LocalPredictionResult, TrainingSample } from './types';
import InfoButton from './src/components/InfoButton';

interface EmailAnalyzerProps {
  onAnalyzeFinished: (record: EmailRecord) => void;
  selectedEmail: EmailRecord | null;
  activeModel?: TrainedModelArtifact | null;
  modelVersion?: number;
  onSendToTrainer?: (sample: TrainingSample) => void;
}

export default function EmailAnalyzer({ onAnalyzeFinished, selectedEmail, activeModel, modelVersion = 0, onSendToTrainer }: EmailAnalyzerProps) {
  // Config state
  const [subject, setSubject] = useState('');
  const [sender, setSender] = useState('');
  const [recipient, setRecipient] = useState('');
  const [body, setBody] = useState('');
  const [headers, setHeaders] = useState('');

  // Active metrics output state
  const [metrics, setMetrics] = useState<SpamMetrics | null>(null);
  const [modelPrediction, setModelPrediction] = useState<LocalPredictionResult | null>(null);
  const [trainerFeedbackLabel, setTrainerFeedbackLabel] = useState<EmailLabel>('phishing');
  const [trainerSentBanner, setTrainerSentBanner] = useState<string | null>(null);

  // Initialize form when a preset / selected email is updated from dashboard
  useEffect(() => {
    if (selectedEmail) {
      setSubject(selectedEmail.subject);
      setSender(selectedEmail.sender);
      setRecipient(selectedEmail.recipient);
      setBody(selectedEmail.body);
      setHeaders(selectedEmail.rawHeaders);

      const res = analyzeEmailWithModel(selectedEmail.subject, selectedEmail.body, selectedEmail.rawHeaders, selectedEmail.sender);
      setMetrics(res.metrics);
      setModelPrediction(res.modelPrediction);
    } else if (MOCK_EMAILS.length > 0) {
      const first = MOCK_EMAILS[0];
      setSubject(first.subject);
      setSender(first.sender);
      setRecipient(first.recipient);
      setBody(first.body);
      setHeaders(first.rawHeaders);
      const res = analyzeEmailWithModel(first.subject, first.body, first.rawHeaders, first.sender);
      setMetrics(res.metrics);
      setModelPrediction(res.modelPrediction);
    }
  }, [selectedEmail]);

  // Re-evaluate immediately when user trains, imports, or resets their local ML model
  useEffect(() => {
    if (!subject && !body) return;
    const cleanHeaders = headers || `From: ${sender}\nTo: ${recipient}\nSubject: ${subject}\nDKIM: Pass\nSPF: Pass`;
    const res = analyzeEmailWithModel(subject, body, cleanHeaders, sender);
    setMetrics(res.metrics);
    setModelPrediction(res.modelPrediction);
  }, [modelVersion, activeModel]);

  // Handle live re-analysis
  const handleAnalyze = () => {
    const cleanHeaders = headers || `From: ${sender}\nTo: ${recipient}\nSubject: ${subject}\nDKIM: Pass\nSPF: Pass`;
    const res = analyzeEmailWithModel(subject, body, cleanHeaders, sender);
    setMetrics(res.metrics);
    setModelPrediction(res.modelPrediction);

    const newRecord: EmailRecord = {
      id: selectedEmail?.id || `custom-${Date.now()}`,
      subject,
      sender,
      recipient,
      body,
      rawHeaders: cleanHeaders,
      timestamp: new Date().toISOString(),
      isSpam: res.metrics.spamScore > 50 || res.metrics.phishingLikelihood > 45,
      metrics: res.metrics
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
    const res = analyzeEmailWithModel(preset.subject, preset.body, preset.rawHeaders, preset.sender);
    setMetrics(res.metrics);
    setModelPrediction(res.modelPrediction);
    onAnalyzeFinished({
      ...preset,
      isSpam: res.metrics.spamScore > 50 || res.metrics.phishingLikelihood > 45,
      metrics: res.metrics
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in" id="email-analyzer-view">
      
      {/* Left Input Panel: Standard Composer & Raw Header Editors */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 md:p-6 lg:col-span-6 space-y-4 shadow-3xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center space-x-2">
            <Mail className="text-indigo-600 h-5 w-5" />
            <h3 className="text-base font-display font-semibold text-slate-900">Inbound Headers & Body Parser</h3>
            <InfoButton
              title="Inbound Headers & Body Parser"
              description="Simulate, edit, or load sample emails and header variables (From, To, Subject, Body, SPF/DKIM) to compute 34-point security scores."
              align="left"
            />
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
              <label className="block text-[11px] font-mono text-slate-500">RAW SECURITY ENVELOPE HEADERS (DKIM/SPF/RECEIVED)</label>
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
          <span>RE-RUN CLASSIFIER ENGINE &amp; EXTRACT METRICS</span>
        </button>

        {onSendToTrainer && (
          <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-700">Feedback Label:</span>
              <select
                value={trainerFeedbackLabel}
                onChange={e => setTrainerFeedbackLabel(e.target.value as EmailLabel)}
                aria-label="Ground truth label for Trainer"
                className="bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
              >
                <option value="legitimate">Legitimate</option>
                <option value="spam">Spam</option>
                <option value="phishing">Phishing</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!subject.trim() && !body.trim()) return;
                onSendToTrainer({
                  id: `scan-fb-${Date.now()}`,
                  subject: subject || '(No Subject)',
                  body,
                  sender: sender || 'unknown@sender.org',
                  rawHeaders: headers,
                  label: trainerFeedbackLabel,
                  source: 'manual'
                });
                setTrainerSentBanner(`Sent "${subject.slice(0, 28) || 'Message'}..." (${trainerFeedbackLabel}) to Trainer.`);
                setTimeout(() => setTrainerSentBanner(null), 3000);
              }}
              className="px-3.5 py-2 bg-slate-50 hover:bg-indigo-50 text-indigo-700 border border-slate-200 rounded-full text-xs font-medium transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <BrainCircuit className="w-3.5 h-3.5" />
              <span>Send to Trainer Dataset</span>
            </button>
          </div>
        )}

        {trainerSentBanner && (
          <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{trainerSentBanner}</span>
          </div>
        )}

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
                <span className="text-sm font-medium text-slate-900">Sandbox Threat Assessment</span>
                <InfoButton
                  title="Sandbox Threat Assessment"
                  description="Evaluates spam probability, phishing severity, triggered heuristic rules, and sender reputation grade in real time."
                  align="left"
                />
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                metrics.spamScore > 75 ? 'bg-red-50 text-red-600 border border-red-200' :
                metrics.spamScore > 40 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                'bg-emerald-50 text-emerald-600 border border-emerald-200'
              }`}>
                {metrics.spamScore > 50 ? 'Threat Detected' : 'Clean Envelope'}
              </span>
            </div>

            {/* Active Local Model Inference Strip */}
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 text-xs space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-slate-500 font-medium">
                  Inference Engine:{' '}
                  <strong className={modelPrediction ? 'text-emerald-700' : 'text-indigo-700'}>
                    {modelPrediction ? 'Custom Trained Local Model' : 'Baseline Heuristic Weights'}
                  </strong>
                </span>
                {modelPrediction && (
                  <span className="font-mono text-[11px] uppercase font-semibold text-slate-800">
                    Class: {modelPrediction.predictedLabel} ({Math.round((modelPrediction.probabilities[modelPrediction.predictedLabel] || 0) * 100)}%)
                  </span>
                )}
              </div>
              {modelPrediction && modelPrediction.topContributors.length > 0 && (
                <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-mono text-slate-600">
                  {modelPrediction.topContributors.slice(0, 4).map(c => (
                    <span key={c.feature}>
                      {c.feature}: <strong className="text-indigo-700">{c.contribution >= 0 ? `+${c.contribution}` : c.contribution}</strong>
                    </span>
                  ))}
                </div>
              )}
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
                    <span>Urgency Pressure ({metrics.urgencyCoefficient}%)</span>
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
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-800">Recommended Defensive Protocol</span>
                <InfoButton
                  title="Recommended Defensive Protocol"
                  description={
                    metrics.spamScore > 75
                      ? 'High-risk social engineering patterns with domain mismatches or financial triggers detected. Quarantine immediately and block sending IP.'
                      : metrics.spamScore > 40
                      ? 'Suspicious indicators or non-aligned envelope headers detected. Verify sender out-of-band before clicking links.'
                      : 'Envelope structure is authenticated with high defense confidence and zero hidden bypass indicators.'
                  }
                  align="right"
                />
              </div>
              {metrics.spamScore > 75 ? (
                <ul className="text-[11px] font-mono text-slate-600 list-disc list-inside space-y-1">
                  <li>Quarantine message immediately</li>
                  <li>Block attachment execution (Risk: {metrics.attachmentRiskIndex}%)</li>
                  <li>Add IP ({metrics.ipBlacklistMatches > 0 ? 'Blacklisted' : 'Unverified'}) to blocklist</li>
                </ul>
              ) : metrics.spamScore > 40 ? (
                <ul className="text-[11px] font-mono text-slate-600 list-disc list-inside space-y-1">
                  <li>Inspect target URLs before opening</li>
                  <li>Verify sender identity out-of-band</li>
                </ul>
              ) : (
                <p className="text-xs text-emerald-700 font-medium">
                  Low Risk &bull; Defense Confidence: {metrics.defenseRating}%
                </p>
              )}
            </div>

          </div>
        )}

      </div>

    </div>
  );
}
