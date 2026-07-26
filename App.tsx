/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  LayoutDashboard, Mail, Image, FileSpreadsheet, Radio, Bot, Gauge,
  ShieldAlert, ShieldCheck, Activity, Sparkles, Clock, AlertTriangle, 
  Settings, Shield, ChevronRight, CheckCircle2, XCircle
} from 'lucide-react';
import Dashboard from './Dashboard';
import EmailAnalyzer from './EmailAnalyzer';
import ImageAnalyzer from './ImageAnalyzer';
import BatchAnalyzer from './BatchAnalyzer';
import AlertManager from './AlertManager';
import ChatAssistant from './ChatAssistant';
import PerformanceMetrics from './PerformanceMetrics';
import { MOCK_EMAILS } from './spamEngine';
import { EmailRecord, AlertNotification } from './types';

// Prepopulate standard active incoming alerts
const INITIAL_ALERTS: AlertNotification[] = [
  {
    id: 'alert-init-1',
    timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    sender: 'accounts-verify-block@secure-banking-support.xyz',
    subject: 'CRITICAL ALERT: Security suspend block on your payment accounts. Verify details immediately.',
    type: 'credential_harvesting',
    severity: 'critical',
    resolved: false,
    details: 'Impersonating generic financial support team. Body includes unaligned domains point directly to unverified phishing single-sign-on redirect servers.'
  },
  {
    id: 'alert-init-2',
    timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    sender: 'chief-officer-hr@executive-staff-direct.com',
    subject: 'URGENT: Desk assistant help needed. Purchase Steam and iTunes gift cards',
    type: 'impersonation',
    severity: 'high',
    resolved: false,
    details: 'Business Email Compromise (BEC) CEO forgery strategy. High administrative authority tags seeking bypass clearance metrics.'
  }
];

export default function App() {
  const [currentTab, setCurrentTab] = useState<'dashboard' | 'email' | 'image' | 'batch' | 'alerts' | 'rag' | 'metrics'>('dashboard');
  
  // All analyzed email records stored in memory
  const [emails, setEmails] = useState<EmailRecord[]>(MOCK_EMAILS);
  const [selectedEmail, setSelectedEmail] = useState<EmailRecord | null>(MOCK_EMAILS[0]);
  
  // Real-time alerts state
  const [alerts, setAlerts] = useState<AlertNotification[]>(INITIAL_ALERTS);
  
  // HUD intrusion warning notification slide-over
  const [flashingIntrusion, setFlashingIntrusion] = useState<AlertNotification | null>(null);

  // Trigger alert from simulator
  const handleTriggerGlobalAlert = (newAlert: AlertNotification) => {
    setAlerts(prev => [newAlert, ...prev]);
    setFlashingIntrusion(newAlert);
  };

  // Mark alerts resolved
  const handleResolveAlert = (id: string) => {
    setAlerts(prev => prev.map(al => al.id === id ? { ...al, resolved: true } : al));
    if (flashingIntrusion?.id === id) {
      setFlashingIntrusion(null);
    }
  };

  // Add dynamically parsed email from custom edits or batch uploads
  const handleAddNewEmails = (newRecords: EmailRecord[]) => {
    setEmails(prev => {
      // Avoid duplicate subjects or keys
      const filtered = prev.filter(p => !newRecords.some(nr => nr.subject === p.subject));
      return [...newRecords, ...filtered];
    });
    setSelectedEmail(newRecords[0]);
  };

  const handleSingleEmailAnalyzed = (record: EmailRecord) => {
    setEmails(prev => {
      const exists = prev.some(p => p.id === record.id);
      if (exists) {
        return prev.map(p => p.id === record.id ? record : p);
      }
      return [record, ...prev];
    });
    setSelectedEmail(record);
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-slate-300 font-sans antialiased relative overflow-x-hidden">
      
      {/* Dynamic alert flasher overlay banner */}
      {flashingIntrusion && (
        <div className="bg-red-950/95 border-b border-slate-800 p-4 sticky top-0 z-50 animate-fade-in flex items-center justify-between shadow-2xl backdrop-blur-md">
          <div className="flex items-center space-x-3.5">
            <div className="p-2 bg-red-500/20 text-red-500 rounded-lg animate-pulse">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-mono text-red-400 font-bold uppercase tracking-widest block">// CRITICAL CAMPAIGN INTRUSION DETECTED</span>
              <p className="text-xs font-semibold text-white mt-0.5">{flashingIntrusion.subject}</p>
              <p className="text-[11px] text-slate-300 font-mono mt-0.5 font-serif italic">Origin domain matches: {flashingIntrusion.sender}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button 
              onClick={() => {
                setCurrentTab('alerts');
                setFlashingIntrusion(null);
              }}
              className="px-3.5 py-1.5 bg-red-800 hover:bg-red-700 text-white font-mono text-2xs rounded-lg transition"
            >
              INVESTIGATE ATTACK
            </button>
            <button 
              onClick={() => setFlashingIntrusion(null)}
              className="p-1.5 text-slate-400 hover:text-white transition"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Container Layout */}
      <div className="max-w-7xl mx-auto px-4 py-6 md:py-8 space-y-6">
        
        {/* Navigation / Header Frame */}
        <header className="flex flex-col md:flex-row md:items-center justify-between p-6 bg-[#0c0c0e] border border-slate-800 rounded-3xl gap-4" id="main-header">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 bg-indigo-600 rounded-xl flex items-center justify-center font-serif text-2xl font-bold text-white shadow-lg shadow-indigo-950/40">
              S
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-serif italic text-white tracking-tight leading-none">
                  Aegis Sentinel v2.6
                </h1>
                <span className="px-2 py-0.5 bg-indigo-500/10 border border-slate-850 text-[9px] font-mono text-indigo-400 rounded">
                  Enterprise Sandbox
                </span>
              </div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-indigo-400 font-semibold mt-1">
                Advanced Localized Threat Detection & SECURE AUDITING
              </p>
            </div>
          </div>

          {/* Quick HUD Metrics */}
          <div className="flex items-center space-x-3 text-xs font-mono">
            <div className="flex gap-2">
              <span className="px-2 py-1 bg-red-950/40 border border-red-500/40 text-red-400 text-[10px] rounded uppercase font-bold">
                {alerts.filter(a => !a.resolved).length} Alerts
              </span>
              <span className="px-2 py-1 bg-emerald-950/40 border border-emerald-500/40 text-emerald-400 text-[10px] rounded uppercase font-bold animate-pulse">
                AI Core Active
              </span>
            </div>
            <div className="h-6 w-[1px] bg-slate-800"></div>
            <div className="bg-[#09090b]/80 border border-slate-800/80 px-3 py-1.5 rounded-xl flex items-center space-x-2 text-slate-400">
              <Clock className="h-3.5 w-3.5" />
              <span>CLOCK: {new Date().toLocaleTimeString()}</span>
            </div>
          </div>
        </header>

        {/* Tab Switcher Grid */}
        <div className="bg-[#0c0c0e] border border-slate-800 rounded-2xl p-1.5 flex flex-wrap gap-1" id="tab-controls-root">
          <button
            onClick={() => setCurrentTab('dashboard')}
            className={`px-4 py-3 text-xs font-mono rounded-xl transition duration-150 flex items-center space-x-2 border ${
              currentTab === 'dashboard' ? 'bg-indigo-950/45 text-indigo-400 border-indigo-500/30 font-medium' : 'text-slate-400 hover:text-white hover:bg-[#09090b]/60 border-transparent'
            }`}
          >
            <LayoutDashboard className="h-4 w-4" />
            <span>Telemetry Dashboard</span>
          </button>

          <button
            onClick={() => setCurrentTab('email')}
            className={`px-4 py-3 text-xs font-mono rounded-xl transition duration-150 flex items-center space-x-2 border ${
              currentTab === 'email' ? 'bg-indigo-950/45 text-indigo-400 border-indigo-500/30 font-medium' : 'text-slate-400 hover:text-white hover:bg-[#09090b]/60 border-transparent'
            }`}
          >
            <Mail className="h-4 w-4" />
            <span>Raw Body Scanner</span>
          </button>

          <button
            onClick={() => setCurrentTab('image')}
            className={`px-4 py-3 text-xs font-mono rounded-xl transition duration-150 flex items-center space-x-2 border ${
              currentTab === 'image' ? 'bg-indigo-950/45 text-indigo-400 border-indigo-500/30 font-medium' : 'text-slate-400 hover:text-white hover:bg-[#09090b]/60 border-transparent'
            }`}
          >
            <Image className="h-4 w-4" />
            <span>Spam Image OCR</span>
          </button>

          <button
            onClick={() => setCurrentTab('batch')}
            className={`px-4 py-3 text-xs font-mono rounded-xl transition duration-150 flex items-center space-x-2 border ${
              currentTab === 'batch' ? 'bg-indigo-950/45 text-indigo-400 border-indigo-500/30 font-medium' : 'text-slate-400 hover:text-white hover:bg-[#09090b]/60 border-transparent'
            }`}
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Batch CSV Auditor</span>
          </button>

          <button
            onClick={() => setCurrentTab('alerts')}
            className={`px-4 py-3 text-xs font-mono rounded-xl transition duration-150 flex items-center space-x-2 border relative ${
              currentTab === 'alerts' ? 'bg-indigo-950/45 text-indigo-400 border-indigo-500/30 font-medium' : 'text-slate-400 hover:text-white hover:bg-[#09090b]/60 border-transparent'
            }`}
          >
            <Radio className="h-4 w-4" />
            <span>Real-time Alerts Feed</span>
            {alerts.filter(a => !a.resolved).length > 0 && (
              <span className="w-2 h-2 rounded-full bg-red-500 absolute top-2 right-2 animate-ping"></span>
            )}
          </button>

          <button
            onClick={() => setCurrentTab('rag')}
            className={`px-4 py-3 text-xs font-mono rounded-xl transition duration-150 flex items-center space-x-2 border ${
              currentTab === 'rag' ? 'bg-indigo-950/45 text-indigo-400 border-indigo-500/30 font-medium' : 'text-slate-400 hover:text-white hover:bg-[#09090b]/60 border-transparent'
            }`}
          >
            <Bot className="h-4 w-4 text-indigo-400" />
            <span className="font-serif italic text-indigo-300">SecOps RAG Copilot</span>
          </button>

          <button
            onClick={() => setCurrentTab('metrics')}
            className={`px-4 py-3 text-xs font-mono rounded-xl transition duration-150 flex items-center space-x-2 border ${
              currentTab === 'metrics' ? 'bg-indigo-950/45 text-emerald-400 border-emerald-500/30 font-medium' : 'text-slate-400 hover:text-white hover:bg-[#09090b]/60 border-transparent'
            }`}
          >
            <Gauge className="h-4 w-4 text-emerald-400" />
            <span className="font-serif italic text-emerald-300">Accuracy & F1 Matrix</span>
          </button>
        </div>

        {/* Content Wrapper + Side element splitter */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Main workspace container based on active Tab selection */}
          <div className="lg:col-span-8 bg-[#0c0c0e] border border-slate-800 p-6 rounded-3xl min-h-[500px]">
            {currentTab === 'dashboard' && (
              <Dashboard 
                records={emails} 
                selectedEmail={selectedEmail} 
                onSelectEmail={setSelectedEmail} 
              />
            )}

            {currentTab === 'email' && (
              <EmailAnalyzer 
                selectedEmail={selectedEmail} 
                onAnalyzeFinished={handleSingleEmailAnalyzed} 
              />
            )}

            {currentTab === 'image' && (
              <ImageAnalyzer />
            )}

            {currentTab === 'batch' && (
              <BatchAnalyzer 
                onAddEmailRecords={handleAddNewEmails} 
              />
            )}

            {currentTab === 'alerts' && (
              <AlertManager 
                alerts={alerts} 
                onTriggerGlobalAlert={handleTriggerGlobalAlert} 
                onResolveAlert={handleResolveAlert} 
              />
            )}

            {currentTab === 'rag' && (
              <ChatAssistant />
            )}

            {currentTab === 'metrics' && (
              <PerformanceMetrics records={emails} />
            )}
          </div>

           {/* Right quick list bar: Inbound stream index */}
          <aside className="lg:col-span-4 bg-[#0c0c0e] border border-slate-800 p-5 rounded-3xl max-h-[700px] overflow-y-auto space-y-4">
            
            <div>
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest block mb-2">// AUDIT BUFFER FEED</span>
              <p className="text-2xs text-slate-400">
                Click any indexed mail payload underneath to trigger complete dynamic metric updates in Dashboard.
              </p>
            </div>

            <div className="space-y-2">
              {emails.map(mail => {
                const isActive = selectedEmail?.id === mail.id;
                
                return (
                  <div 
                    key={mail.id}
                    onClick={() => {
                      setSelectedEmail(mail);
                      // Auto route back to dashboard or mail if elsewhere to view immediately!
                      if (currentTab !== 'dashboard' && currentTab !== 'email') {
                        setCurrentTab('dashboard');
                      }
                    }}
                    className={`p-3.5 rounded-xl border text-left transition duration-150 cursor-pointer ${
                      isActive 
                        ? 'bg-indigo-950/30 border-indigo-500/40' 
                        : 'bg-[#09090b]/80 border-slate-850 hover:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono font-bold text-slate-500">{mail.id.toUpperCase()}</span>
                      <span className={`px-2 py-0.5 rounded text-[8px] font-mono font-bold uppercase ${
                        mail.metrics.spamScore > 50 
                          ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}>
                        Score: {mail.metrics.spamScore}%
                      </span>
                    </div>

                    <h4 className="text-xs font-sans font-medium text-white mt-2 truncate">{mail.subject}</h4>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">{mail.sender}</p>

                    <div className="mt-2.5 pt-2 border-t border-slate-800/40 flex items-center justify-between text-[9px] text-slate-500 font-mono">
                      <span>{new Date(mail.timestamp).toLocaleTimeString()}</span>
                      <span className="text-slate-400 font-medium flex items-center hover:text-white">
                        <span>Details</span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

          </aside>

        </div>

      </div>

      {/* Real-Time Footer Ticker */}
      <div className="w-full bg-[#0c0c0e] border-t border-slate-850 flex items-center h-12 px-6 overflow-hidden mt-12">
        <div className="max-w-7xl mx-auto w-full flex items-center gap-4 whitespace-nowrap overflow-x-auto no-scrollbar py-1">
          <span className="px-2 py-0.5 bg-indigo-950/40 border border-indigo-500/40 text-indigo-400 text-[10px] rounded font-bold uppercase tracking-wider font-mono">Live Alerts</span>
          <span className="text-slate-400 text-[11px] font-medium font-mono leading-none">
            [14:22:01] <span className="text-red-400 font-bold">BLOCKED</span> Phishing attempt from support@am-security.ru — 
            [14:22:15] <span className="text-indigo-400 font-bold">BATCH UPDATE</span> CSV Analysis for 'Q4_Client_List' finished — 
            [14:23:02] <span className="text-amber-400 font-bold">SENSORY WARNING</span> Anomalous tone detected in mail header
          </span>
        </div>
      </div>

      <footer className="footer max-w-7xl mx-auto py-8 px-4 text-center text-xs font-mono text-slate-500">
        <p>&copy; 2026 Aegis Sentinel &bull; Ultra Secure Local Spam & Phishing Radar Ecosystem.</p>
        <p className="mt-1">Built with React & Tailwind CSS. Fully standalone sandbox verification.</p>
      </footer>

    </div>
  );
}
