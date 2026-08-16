/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, AreaChart, Area
} from 'recharts';
import { 
  ShieldAlert, ShieldCheck, Activity, Award, CheckCircle, XCircle, 
  AlertTriangle, Key, Terminal, BarChart4, Compass, Info, FileSpreadsheet,
  Download, FileText
} from 'lucide-react';
import { EmailRecord, SpamMetrics } from './types';

interface DashboardProps {
  records: EmailRecord[];
  selectedEmail: EmailRecord | null;
  onSelectEmail: (email: EmailRecord) => void;
}

export default function Dashboard({ records, selectedEmail, onSelectEmail }: DashboardProps) {
  const [activeMetricTab, setActiveMetricTab] = useState<'all' | 'critical' | 'technical'>('all');

  // Overall calculations
  const totalAnalyzed = records.length;
  const spamCount = records.filter(r => r.isSpam).length;
  const avgSpamScore = totalAnalyzed > 0 
    ? Math.round(records.reduce((acc, r) => acc + r.metrics.spamScore, 0) / totalAnalyzed) 
    : 0;
  const avgPhishingScore = totalAnalyzed > 0 
    ? Math.round(records.reduce((acc, r) => acc + r.metrics.phishingLikelihood, 0) / totalAnalyzed) 
    : 0;
  const avgDefense = totalAnalyzed > 0 
    ? Math.round(records.reduce((acc, r) => acc + r.metrics.defenseRating, 0) / totalAnalyzed) 
    : 0;

  // Recharts chart data 
  const aggregateScoreData = records.map(r => ({
    name: r.subject.substring(0, 20) + '...',
    'Spam Score': r.metrics.spamScore,
    'Phishing Likelihood': r.metrics.phishingLikelihood,
    'Defense Rating': r.metrics.defenseRating,
  }));

  // Target current metrics
  const activeMetrics: SpamMetrics = selectedEmail?.metrics || records[0]?.metrics || {
    spamScore: 45,
    phishingLikelihood: 35,
    senderReputationRank: 'C',
    keywordDangerDensity: 40,
    urgencyCoefficient: 50,
    financialSensationIndex: 25,
    authorityMimicryIndex: 30,
    subjectSentimentDivergence: 10,
    capitalizationRatio: 12,
    punctuationExaggerationIndex: 20,
    unusualHoursTrigger: false,
    suspiciousLinkCount: 1,
    mismatchedDomainsCount: 1,
    shortenedUrlsCount: 0,
    trackingPixelsDetected: 1,
    ipBlacklistMatches: 0,
    dkimStatus: 'Pass',
    spfStatus: 'Pass',
    dmarcComplianceScore: 80,
    inboundHopCount: 2,
    relayServerRiskIndex: 30,
    imageToTextPayloadRatio: 0,
    ocrSuspiciousWordsCount: 0,
    qrCodePresenceRisk: false,
    visualColorRiskLevel: 0,
    metadataAgeOfImageDays: 0,
    messageEntropy: 45,
    zeroFontHiddenTextDetected: false,
    senderRecipientDiscrepancy: false,
    attachmentRiskIndex: 0,
    vectorSimilarityScore: 24,
    rulesEvaluatedCount: 37,
    rulesTriggeredCount: 4,
    defenseRating: 75
  };

  // High-danger vector metrics formatting for radar
  const radarMetricsData = [
    { subject: 'Financial Lure', A: activeMetrics.financialSensationIndex, fullMark: 100 },
    { subject: 'Urgency Pressure', A: activeMetrics.urgencyCoefficient, fullMark: 100 },
    { subject: 'Authority Mimic', A: activeMetrics.authorityMimicryIndex, fullMark: 100 },
    { subject: 'Density Rating', A: activeMetrics.keywordDangerDensity, fullMark: 100 },
    { subject: 'Link Spying', A: activeMetrics.suspiciousLinkCount * 30 > 100 ? 100 : activeMetrics.suspiciousLinkCount * 30, fullMark: 100 },
    { subject: 'Vector Similarity', A: activeMetrics.vectorSimilarityScore, fullMark: 100 },
  ];

  // Helper lists to display exactly 30+ distinct indicators in a structured interactive metric table
  const all34MetricsDefinitions = [
    { key: 'spamScore', label: 'Spam Score Index', value: `${activeMetrics.spamScore}%`, desc: 'Probability the email is generic unsolicited folder junk content.', cat: 'critical' },
    { key: 'phishingLikelihood', label: 'Phishing Likelihood', value: `${activeMetrics.phishingLikelihood}%`, desc: 'Potential of social engineering targeted credentials harvesting.', cat: 'critical' },
    { key: 'senderReputationRank', label: 'Sender Reputation Rank', value: activeMetrics.senderReputationRank, desc: 'Heuristic assessment score computed on historical domain records.', cat: 'critical' },
    { key: 'keywordDangerDensity', label: 'Lexical Threat Density', value: `${activeMetrics.keywordDangerDensity}%`, desc: 'Ratio of words flagged on spam dictionaries against total length.', cat: 'critical' },
    { key: 'urgencyCoefficient', label: 'Urgency Factor Index', value: `${activeMetrics.urgencyCoefficient}%`, desc: 'Presence of artificial scarcity or immediate system lockout scares.', cat: 'critical' },
    { key: 'financialSensationIndex', label: 'Financial Sensation Score', value: `${activeMetrics.financialSensationIndex}%`, desc: 'Focus on wire transfers, refunds, cash payments or accounting terminology.', cat: 'critical' },
    { key: 'authorityMimicryIndex', label: 'Authority Impersonation Rank', value: `${activeMetrics.authorityMimicryIndex}%`, desc: 'Use of high administrative titles, support reps, or federal departments.', cat: 'critical' },
    { key: 'subjectSentimentDivergence', label: 'Subject-Body Divergence', value: `${activeMetrics.subjectSentimentDivergence}%`, desc: 'Divergence rating of innocent header title vs deceptive actual body text.', cat: 'critical' },
    { key: 'capitalizationRatio', label: 'Capitalization Content Ratio', value: `${activeMetrics.capitalizationRatio}%`, desc: 'Intensity of words written in absolute uppercase letters.', cat: 'critical' },
    { key: 'punctuationExaggerationIndex', label: 'Punctuation Volume Rank', value: `${activeMetrics.punctuationExaggerationIndex}%`, desc: 'Frequency counts of excessive symbols like "!!!" or "$$$" inside the text.', cat: 'critical' },
    { key: 'unusualHoursTrigger', label: 'Abnormal Sending Window', value: activeMetrics.unusualHoursTrigger ? 'Active' : 'Neutral', desc: 'Alert flags for transmission during high risk sleep-hours (1-4 AM).', cat: 'critical' },
    { key: 'suspiciousLinkCount', label: 'Unverified Link Count', value: activeMetrics.suspiciousLinkCount, desc: 'Hyperlinks pointing to non-standard, randomized domain structures.', cat: 'technical' },
    { key: 'mismatchedDomainsCount', label: 'Mismatched Target Domains', value: activeMetrics.mismatchedDomainsCount, desc: 'Anchor link URLs pointing to hostnames differing from actual sender.', cat: 'technical' },
    { key: 'shortenedUrlsCount', label: 'Hidden Redirect Services', value: activeMetrics.shortenedUrlsCount, desc: 'Use of tinyurl or bitly domains hiding original script destination.', cat: 'technical' },
    { key: 'trackingPixelsDetected', label: 'HTML Tracker Footprint', value: activeMetrics.trackingPixelsDetected, desc: 'Transparent 1x1 image payloads parsing mail status back to sender servers.', cat: 'technical' },
    { key: 'ipBlacklistMatches', label: 'IP Blacklist Match Count', value: activeMetrics.ipBlacklistMatches, desc: 'Matches against established threat lists storing spamming servers.', cat: 'technical' },
    { key: 'dkimStatus', label: 'DKIM Signature Match', value: activeMetrics.dkimStatus, desc: 'DomainKeys Identified Mail cryptographic signature authenticity status.', cat: 'technical' },
    { key: 'spfStatus', label: 'SPF Domain Verification', value: activeMetrics.spfStatus, desc: 'Sender Policy Framework verification matching source server DNS alignment.', cat: 'technical' },
    { key: 'dmarcComplianceScore', label: 'DMARC Protocol Alignment', value: `${activeMetrics.dmarcComplianceScore}%`, desc: 'Compliance level enforcing DKIM & SPF coordinated rejection rules.', cat: 'technical' },
    { key: 'inboundHopCount', label: 'Mail Server Inbound Hops', value: activeMetrics.inboundHopCount, desc: 'Total hops traversing relay gateways from origin to target server.', cat: 'technical' },
    { key: 'relayServerRiskIndex', label: 'Relay Country Threat Risk', value: `${activeMetrics.relayServerRiskIndex}%`, desc: 'Regional server risk indexing based on registered spam origin charts.', cat: 'technical' },
    { key: 'imageToTextPayloadRatio', label: 'Graphic-to-Text Payload Ratio', value: `${activeMetrics.imageToTextPayloadRatio}%`, desc: 'Percentage of message layout occupied by HTML canvas or raw image codes.', cat: 'technical' },
    { key: 'ocrSuspiciousWordsCount', label: 'Optical Text Threat Count', value: activeMetrics.ocrSuspiciousWordsCount, desc: 'Hazardous trigger keywords extracted inside attachment image content.', cat: 'technical' },
    { key: 'qrCodePresenceRisk', label: 'QR Scan Redirect Risk', value: activeMetrics.qrCodePresenceRisk ? 'Detected' : 'None', desc: 'Scan code matrix payloads redirecting recipient off sandbox environments.', cat: 'critical' },
    { key: 'visualColorRiskLevel', label: 'Visual Warning Color Index', value: `${activeMetrics.visualColorRiskLevel}%`, desc: 'High saturation of danger markers (pure red/golden overlays) in attached image.', cat: 'technical' },
    { key: 'metadataAgeOfImageDays', label: 'Visual Asset Creation Age', value: activeMetrics.metadataAgeOfImageDays > 0 ? `${activeMetrics.metadataAgeOfImageDays} days` : 'Undefined', desc: 'Number of days elapsed since graphic design generation metadata stamped.', cat: 'technical' },
    { key: 'messageEntropy', label: 'Message Text Entropy Ratio', value: `${activeMetrics.messageEntropy}%`, desc: 'Level of character permutation chaos used to dilute statistical keyword filters.', cat: 'technical' },
    { key: 'zeroFontHiddenTextDetected', label: 'Zero-Font Style Insertion', value: activeMetrics.zeroFontHiddenTextDetected ? 'Detected' : 'None', desc: 'Use of CSS display:none layers hiding layout text dictionaries.', cat: 'technical' },
    { key: 'senderRecipientDiscrepancy', label: 'Addressee Impersonation', value: activeMetrics.senderRecipientDiscrepancy ? 'Active' : 'Neutral', desc: 'Use of unaligned receiver placeholder greetings (Dear Customer / Valued Partner).', cat: 'critical' },
    { key: 'attachmentRiskIndex', label: 'Attachment Poison Index', value: `${activeMetrics.attachmentRiskIndex}%`, desc: 'Malware profile checking document payloads (executables, dangerous zip archives).', cat: 'critical' },
    { key: 'vectorSimilarityScore', label: 'Cosine Vector Alignment', value: `${activeMetrics.vectorSimilarityScore}%`, desc: 'Mathematical similarity distance mapping against standard sample threats.', cat: 'technical' },
    { key: 'rulesEvaluatedCount', label: 'Total Inspection Checklist', value: activeMetrics.rulesEvaluatedCount, desc: 'Total automated defensive parser instructions run on email package.', cat: 'technical' },
    { key: 'rulesTriggeredCount', label: 'Alert Failures Triggered', value: activeMetrics.rulesTriggeredCount, desc: 'Defensive markers tripped on incoming verification analysis.', cat: 'critical' },
    { key: 'defenseRating', label: 'System Defiance Coefficient', value: `${activeMetrics.defenseRating}%`, desc: 'Resilience index quantifying mail client safety threshold outcome.', cat: 'critical' }
  ];

  const filteredMetrics = all34MetricsDefinitions.filter(m => {
    if (activeMetricTab === 'all') return true;
    return m.cat === activeMetricTab;
  });

  // Function to export all catalog emails as CSV
  const handleExportAllCSV = () => {
    const headers = ["ID", "Subject", "Sender", "Recipient", "Timestamp", "Spam Score", "Phishing Likelihood", "Is Spam", "DKIM", "SPF"];
    const rows = records.map(r => [
      r.id,
      `"${r.subject.replace(/"/g, '""')}"`,
      `"${r.sender}"`,
      `"${r.recipient}"`,
      r.timestamp,
      r.metrics.spamScore,
      r.metrics.phishingLikelihood,
      r.isSpam ? "YES" : "NO",
      r.metrics.dkimStatus,
      r.metrics.spfStatus
    ]);
    
    // Format rows correctly with line endings
    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n" 
      + rows.map(e => e.join(",")).join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `neoaegis_threat_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Function to export selected email incident dossier
  const handleExportIncidentDossier = () => {
    const target = selectedEmail || records[0];
    if (!target) return;
    
    const reportContent = `========================================================================
🛡️ NEOAEGIS FORENSIC INCIDENT DOSSIER
========================================================================
Generated At: ${new Date().toISOString()}
Target ID: ${target.id.toUpperCase()}
Incidency Level: ${target.isSpam ? 'CRITICAL - SPAM/PHISHING FLAG ACTIVE' : 'SECURE - SANITIZED METRICS'}

------------------------------------------------------------------------
📧 HEADER INFORMATION
------------------------------------------------------------------------
Subject: ${target.subject}
Sender: ${target.sender}
Recipient: ${target.recipient}
Timestamp: ${target.timestamp}

------------------------------------------------------------------------
🔍 PRIMARY SPECTRUM RISK ASSESSMENT
------------------------------------------------------------------------
Spam Probability Index:     ${target.metrics.spamScore}%
Phishing Likelihood Index: ${target.metrics.phishingLikelihood}%
Relay server Country Threat: ${target.metrics.relayServerRiskIndex}%
System Defiance Rating:    ${target.metrics.defenseRating}% (Defense Resilience)

------------------------------------------------------------------------
🛡️ TRUST & VERIFICATION PROTOCOLS
------------------------------------------------------------------------
DKIM Signature status: ${target.metrics.dkimStatus}
SPF DNS matching protocol: ${target.metrics.spfStatus}
DMARC alignment percentage: ${target.metrics.dmarcComplianceScore}%
Inbound Mail Relay Hops: ${target.metrics.inboundHopCount} hops

------------------------------------------------------------------------
📜 AUTOMATED CHECKLIST RULES REPORT
------------------------------------------------------------------------
Total Rules Evaluated: ${target.metrics.rulesEvaluatedCount}
Rules Triggered / Violated: ${target.metrics.rulesTriggeredCount}

--- Suspicious Indicators Flagged ---
* Keyword Danger Density: ${target.metrics.keywordDangerDensity}%
* Urgency Pressure level: ${target.metrics.urgencyCoefficient}%
* Authority Mimicry Factor: ${target.metrics.authorityMimicryIndex}%
* Unverified domain links: ${target.metrics.suspiciousLinkCount}
* Tracking footings detected: ${target.metrics.trackingPixelsDetected}
* Image payload OCR danger score: ${target.metrics.ocrSuspiciousWordsCount}
* Hidden zero-font layer active: ${target.metrics.zeroFontHiddenTextDetected ? 'YES' : 'NO'}

------------------------------------------------------------------------
📄 RAW BODY EXCERPT
------------------------------------------------------------------------
${target.body}

========================================================================
End Forensic Dossier. CONFIDENTIAL. For immediate SOC retention.
========================================================================`;

    const blob = new Blob([reportContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `neoaegis_incident_${target.id}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 animate-fade-in" id="dashboard-tab">

      {/* Exporting & Reporting Action Panel */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-serif italic text-slate-900">Security Forensic Reporting</h3>
          <p className="text-xs text-slate-500 mt-1">Export executive audit buffer records or download dynamic diagnostic dossiers.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <button 
            onClick={handleExportIncidentDossier}
            className="flex-1 md:flex-none px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100/80 text-indigo-700 border border-indigo-200 text-xs font-mono rounded-xl transition duration-150 flex items-center justify-center space-x-2 cursor-pointer shadow-2xs"
          >
            <FileText className="w-4 h-4" />
            <span>Export Selected Dossier (.md)</span>
          </button>
          
          <button 
            onClick={handleExportAllCSV}
            className="flex-1 md:flex-none px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-mono rounded-xl transition duration-150 flex items-center justify-center space-x-2 cursor-pointer shadow-2xs"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export Full Audit CSV (.csv)</span>
          </button>
        </div>
      </div>
      
      {/* 1. Statistics Cards Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl relative overflow-hidden" id="card-total-analyzed">
          <div className="absolute top-0 right-0 bg-indigo-50 text-indigo-600 px-3 py-1 text-[10px] font-mono rounded-bl-xl border-l border-b border-slate-200">
            METRIC 01
          </div>
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Inbound Audited</p>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-serif italic text-slate-900">{totalAnalyzed}</span>
            <span className="text-xs text-slate-500 font-mono">emails parsed</span>
          </div>
          <div className="mt-4 flex items-center space-x-1.5 text-[11px] text-indigo-600 font-mono">
            <Activity className="h-3.5 w-3.5 animate-pulse text-indigo-500" />
            <span>Active client-side mail interceptor running</span>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl relative overflow-hidden" id="card-spam-rate">
          <div className="absolute top-0 right-0 bg-red-50 text-red-600 px-3 py-1 text-[10px] font-mono rounded-bl-xl border-l border-b border-slate-200">
            METRIC 02
          </div>
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Spam & Phishing Flagged</p>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-serif italic text-red-600">{spamCount}</span>
            <span className="text-xs text-slate-500 font-mono">({totalAnalyzed > 0 ? Math.round((spamCount/totalAnalyzed)*100) : 0}%)</span>
          </div>
          <div className="mt-4 flex items-center space-x-1.5 text-[11px] text-red-600 font-mono">
            <ShieldAlert className="h-3.5 w-3.5 text-red-500" />
            <span>Blocked & quarantined automatically</span>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl relative overflow-hidden" id="card-avg-threat">
          <div className="absolute top-0 right-0 bg-amber-50 text-amber-700 px-3 py-1 text-[10px] font-mono rounded-bl-xl border-l border-b border-slate-200">
            METRIC 03
          </div>
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Average Threat Score</p>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-serif italic text-amber-600 underline decoration-1 underline-offset-4">{avgSpamScore}%</span>
            <span className="text-xs text-slate-500 font-mono font-serif italic">unstable</span>
          </div>
          <div className="mt-4 flex items-center space-x-1.5 text-[11px] text-amber-600 font-mono">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            <span>Phishing likelihood average: {avgPhishingScore}%</span>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl relative overflow-hidden" id="card-defense-index">
          <div className="absolute top-0 right-0 bg-emerald-50 text-emerald-700 px-3 py-1 text-[10px] font-mono rounded-bl-xl border-l border-b border-slate-200">
            METRIC 04
          </div>
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Infrastructure Defense Rating</p>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-serif italic text-emerald-600">Verified</span>
            <span className="text-xs text-slate-500 font-mono">({avgDefense}% resilience)</span>
          </div>
          <div className="mt-4 flex items-center space-x-1.5 text-[11px] text-emerald-600 font-mono">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            <span>Full sandbox quarantine active</span>
          </div>
        </div>

      </div>

      {/* 2. Visual Analytics Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Chart: Inbound Threat Spikes */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 lg:col-span-7 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-serif italic text-slate-900 flex items-center space-x-2">
                  <BarChart4 className="w-4 h-4 text-indigo-600" />
                  <span>Inbound Mail Metrics Distribution</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">Cross-analyzing critical indices across current sandbox elements</p>
              </div>
              <span className="px-2 py-0.5 text-[10px] font-mono text-indigo-600 border border-slate-200 rounded-md bg-indigo-50 uppercase">
                Dynamic Graph
              </span>
            </div>

            <div className="w-full h-72 text-xs font-mono">
              {totalAnalyzed > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={aggregateScoreData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorSpam" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorPhish" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" stroke="#64748b" />
                    <YAxis stroke="#64748b" domain={[0, 100]} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', color: '#0f172a' }}
                      itemStyle={{ color: '#475569' }}
                    />
                    <Legend />
                    <Area type="monotone" dataKey="Spam Score" stroke="#ef4444" fillOpacity={1} fill="url(#colorSpam)" />
                    <Area type="monotone" dataKey="Phishing Likelihood" stroke="#f59e0b" fillOpacity={1} fill="url(#colorPhish)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400">
                  Inject/Audit emails to stream visual metrics
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Chart: Current Focus Deep Vector Radar */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 lg:col-span-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-serif italic text-slate-900 flex items-center space-x-2">
                  <Compass className="w-4 h-4 text-amber-600" />
                  <span>Threat Lure Vector Profiling</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">Multi-dimensional vector parsing of the active target email</p>
              </div>
              <span className="px-2 py-0.5 text-[10px] font-mono text-amber-600 border border-slate-200 rounded-md bg-amber-50 uppercase">
                Radar
              </span>
            </div>

            <div className="w-full h-72 text-xs font-mono flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarMetricsData}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="subject" stroke="#475569" />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#cbd5e1" />
                  <Radar name="Active Target Metrics" dataKey="A" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} />
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', color: '#0f172a' }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="text-center pt-2 border-t border-slate-200">
            <span className="text-xs text-slate-500 font-mono">
              Active Focus: <span className="text-amber-600 font-medium font-sans">{selectedEmail ? selectedEmail.subject.substring(0, 30) + '...' : 'Default Sandbox Profile'}</span>
            </span>
          </div>
        </div>

      </div>

      {/* 3. The 30+ Metrics Directory & Analyzer Inventory */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 pb-6 border-b border-slate-200">
          <div>
            <h3 className="text-base font-serif italic text-slate-900 flex items-center space-x-2">
              <Terminal className="text-indigo-600 h-5 w-5" />
              <span>Diagnostic Telemetry Directory (34 Dynamic Metrics Evaluated)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Select an email in the side elements to check live localized heuristic and algorithmic values computed recursively.
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-1 mt-4 md:mt-0 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button 
              onClick={() => setActiveMetricTab('all')}
              className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-all duration-200 ${activeMetricTab === 'all' ? 'bg-white text-indigo-600 border border-indigo-100 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'}`}>
              All 34
            </button>
            <button 
              onClick={() => setActiveMetricTab('critical')}
              className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-all duration-200 ${activeMetricTab === 'critical' ? 'bg-white text-indigo-600 border border-indigo-100 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'}`}>
              Threat Vectors (14)
            </button>
            <button 
              onClick={() => setActiveMetricTab('technical')}
              className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-all duration-200 ${activeMetricTab === 'technical' ? 'bg-white text-indigo-600 border border-indigo-100 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'}`}>
              Technical Alignment (20)
            </button>
          </div>
        </div>

        {/* Dense metric cards bento-grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4" id="metrics-dense-bento">
          {filteredMetrics.map((met, index) => {
            const isDanger = typeof met.value === 'string' && (met.value.includes('Fail') || parseInt(met.value, 10) > 70 || met.value === 'Active');
            const isSuccess = typeof met.value === 'string' && (met.value.includes('Pass') || met.value === 'A' || (met.key === 'defenseRating' && parseInt(met.value, 10) > 70));
            const isWarning = typeof met.value === 'string' && (met.value === 'B' || met.value === 'C' || (parseInt(met.value, 10) > 30 && parseInt(met.value, 10) <= 70));

            return (
              <div 
                key={met.key} 
                className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 hover:border-indigo-400 transition-all duration-300 flex flex-col justify-between group shadow-3xs"
                id={`metric-item-${met.key}`}
              >
                <div>
                  <div className="flex items-start justify-between">
                    <span className="text-xs font-mono text-slate-400 group-hover:text-indigo-600 transition-colors">
                      M-{index+1 < 10 ? '0'+(index+1) : index+1}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono font-bold ${
                      isDanger ? 'bg-red-50 text-red-600 border border-red-200' :
                      isSuccess ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' :
                      isWarning ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                      'bg-slate-200 text-slate-700'
                    }`}>
                      {met.value}
                    </span>
                  </div>
                  <h4 className="text-xs font-mono font-medium text-slate-800 mt-2">{met.label}</h4>
                  <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">{met.desc}</p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-200/55 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span>Scope: Local Sandbox</span>
                  <span className="opacity-0 group-hover:opacity-100 text-indigo-600 transition-opacity flex items-center space-x-0.5">
                    <Info className="w-3 h-3" />
                    <span>Algorithmic</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
