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
import ForensicsLab from './ForensicsLab';
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
  const [currentTab, setCurrentTab] = useState<'dashboard' | 'email' | 'image' | 'batch' | 'alerts' | 'rag' | 'metrics' | 'forensics'>('dashboard');
  
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
    <div className="min-h-screen bg-slate-50 text-slate-700 font-sans antialiased relative overflow-x-hidden">
      
      {/* Dynamic alert flasher overlay banner */}
      {flashingIntrusion && (
        <div className="bg-red-50 border-b border-red-200 p-4 sticky top-0 z-50 animate-fade-in flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm backdrop-blur-md">
          <div className="flex items-start sm:items-center space-x-3.5">
            <div className="p-2 bg-red-100 text-red-600 rounded-lg animate-pulse">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-mono text-red-500 font-bold uppercase tracking-widest block">// CRITICAL CAMPAIGN INTRUSION DETECTED</span>
              <p className="text-xs font-semibold text-slate-900 mt-0.5">{flashingIntrusion.subject}</p>
              <p className="text-[11px] text-slate-600 font-mono mt-0.5 font-serif italic">Origin domain matches: {flashingIntrusion.sender}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
            <button 
              onClick={() => {
                setCurrentTab('alerts');
                setFlashingIntrusion(null);
              }}
              className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white font-mono text-xs rounded-lg transition shadow-xs"
            >
              INVESTIGATE ATTACK
            </button>
            <button 
              onClick={() => setFlashingIntrusion(null)}
              className="px-2.5 py-1.5 text-slate-500 hover:text-slate-800 transition text-xs font-medium"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Container Layout */}
      <div className="max-w-7xl mx-auto px-4 py-6 md:py-8 space-y-6">
        
        {/* Navigation / Header Frame */}
        <header className="flex flex-col md:flex-row md:items-center justify-between p-6 bg-white border border-slate-200 rounded-3xl gap-4 shadow-2xs" id="main-header">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 bg-indigo-600 rounded-xl flex items-center justify-center font-serif text-2xl font-bold text-white shadow-sm">
              N
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-serif italic text-slate-900 tracking-tight leading-none">
                  NeoAegis
                </h1>
                <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-[9px] font-mono text-indigo-600 rounded">
                  Enterprise Sandbox
                </span>
              </div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-indigo-600 font-semibold mt-1">
                Advanced Mail Analyzer and Assistant
              </p>
            </div>
          </div>

          {/* Quick HUD Metrics */}
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
            <div className="flex gap-2">
              <span className="px-2 py-1 bg-red-50 border border-red-200 text-red-600 text-[10px] rounded uppercase font-bold">
                {alerts.filter(a => !a.resolved).length} Alerts
              </span>
              <span className="px-2 py-1 bg-emerald-50 border border-emerald-200 text-emerald-600 text-[10px] rounded uppercase font-bold animate-pulse">
                AI Core Active
              </span>
            </div>
            <div className="h-6 w-[1px] bg-slate-200 hidden sm:block"></div>
            <div className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl flex items-center space-x-2 text-slate-600">
              <Clock className="h-3.5 w-3.5" />
              <span>CLOCK: {new Date().toLocaleTimeString()}</span>
            </div>
          </div>
        </header>

        {/* Tab Switcher Grid - Horizontal scroll on Mobile/Tablets, Elegant Wrap on Desktop */}
        <div className="bg-white border border-slate-200 rounded-2xl p-1.5 flex flex-nowrap overflow-x-auto lg:flex-wrap gap-1.5 scrollbar-none shadow-2xs" id="tab-controls-root">
          <button
            onClick={() => setCurrentTab('dashboard')}
            className={`px-4 py-2.5 text-xs font-mono rounded-xl transition duration-150 flex items-center space-x-2 border shrink-0 ${
              currentTab === 'dashboard' 
                ? 'bg-indigo-50 text-indigo-700 border-indigo-100 font-semibold shadow-2xs' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border-transparent'
            }`}
          >
            <LayoutDashboard className="h-4 w-4" />
            <span>Telemetry Dashboard</span>
          </button>

          <button
            onClick={() => setCurrentTab('email')}
            className={`px-4 py-2.5 text-xs font-mono rounded-xl transition duration-150 flex items-center space-x-2 border shrink-0 ${
              currentTab === 'email' 
                ? 'bg-indigo-50 text-indigo-700 border-indigo-100 font-semibold shadow-2xs' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border-transparent'
            }`}
          >
            <Mail className="h-4 w-4" />
            <span>Raw Body Scanner</span>
          </button>

          <button
            onClick={() => setCurrentTab('image')}
            className={`px-4 py-2.5 text-xs font-mono rounded-xl transition duration-150 flex items-center space-x-2 border shrink-0 ${
              currentTab === 'image' 
                ? 'bg-indigo-50 text-indigo-700 border-indigo-100 font-semibold shadow-2xs' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border-transparent'
            }`}
          >
            <Image className="h-4 w-4" />
            <span>Spam Image OCR</span>
          </button>

          <button
            onClick={() => setCurrentTab('batch')}
            className={`px-4 py-2.5 text-xs font-mono rounded-xl transition duration-150 flex items-center space-x-2 border shrink-0 ${
              currentTab === 'batch' 
                ? 'bg-indigo-50 text-indigo-700 border-indigo-100 font-semibold shadow-2xs' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border-transparent'
            }`}
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Batch CSV Auditor</span>
          </button>

          <button
            onClick={() => setCurrentTab('alerts')}
            className={`px-4 py-2.5 text-xs font-mono rounded-xl transition duration-150 flex items-center space-x-2 border relative shrink-0 ${
              currentTab === 'alerts' 
                ? 'bg-indigo-50 text-indigo-700 border-indigo-100 font-semibold shadow-2xs' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border-transparent'
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
            className={`px-4 py-2.5 text-xs font-mono rounded-xl transition duration-150 flex items-center space-x-2 border shrink-0 ${
              currentTab === 'rag' 
                ? 'bg-indigo-50 text-indigo-700 border-indigo-100 font-semibold shadow-2xs' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border-transparent'
            }`}
          >
            <Bot className="h-4 w-4 text-indigo-600" />
            <span className="font-serif italic text-indigo-700">SecOps RAG Copilot</span>
          </button>

          <button
            onClick={() => setCurrentTab('metrics')}
            className={`px-4 py-2.5 text-xs font-mono rounded-xl transition duration-150 flex items-center space-x-2 border shrink-0 ${
              currentTab === 'metrics' 
                ? 'bg-emerald-50 text-emerald-700 border-emerald-100 font-semibold shadow-2xs' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border-transparent'
            }`}
          >
            <Gauge className="h-4 w-4 text-emerald-600" />
            <span className="font-serif italic text-emerald-700">Accuracy & F1 Matrix</span>
          </button>

          <button
            onClick={() => setCurrentTab('forensics')}
            className={`px-4 py-2.5 text-xs font-mono rounded-xl transition duration-150 flex items-center space-x-2 border shrink-0 ${
              currentTab === 'forensics' 
                ? 'bg-indigo-50 text-indigo-700 border-indigo-100 font-semibold shadow-2xs' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border-transparent'
            }`}
          >
            <Shield className="h-4 w-4 text-indigo-600 animate-pulse" />
            <span className="font-serif italic text-indigo-700">Forensics Lab</span>
          </button>
        </div>

        {/* Content Wrapper + Side element splitter */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Main workspace container based on active Tab selection */}
          <div className="lg:col-span-8 bg-white border border-slate-200 p-5 md:p-6 rounded-3xl min-h-[500px] shadow-2xs">
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

            {currentTab === 'forensics' && (
              <ForensicsLab 
                selectedEmail={selectedEmail} 
                onUpdateEmailMetrics={handleSingleEmailAnalyzed}
              />
            )}
          </div>

           {/* Right quick list bar: Inbound stream index */}
          <aside className="lg:col-span-4 bg-white border border-slate-200 p-5 rounded-3xl max-h-[700px] overflow-y-auto space-y-4 shadow-2xs">
            
            <div>
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block mb-2">// AUDIT BUFFER FEED</span>
              <p className="text-xs text-slate-500">
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
                        ? 'bg-indigo-50/50 border-indigo-200' 
                        : 'bg-slate-50 border-slate-100 hover:bg-slate-100/50 hover:border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono font-bold text-slate-400">{mail.id.toUpperCase()}</span>
                      <span className={`px-2 py-0.5 rounded text-[8px] font-mono font-bold uppercase ${
                        mail.metrics.spamScore > 50 
                          ? 'bg-red-50 text-red-600 border border-red-100' 
                          : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                      }`}>
                        Score: {mail.metrics.spamScore}%
                      </span>
                    </div>

                    <h4 className="text-xs font-sans font-medium text-slate-850 mt-2 truncate">{mail.subject}</h4>
                    <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">{mail.sender}</p>

                    <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[9px] text-slate-400 font-mono">
                      <span>{new Date(mail.timestamp).toLocaleTimeString()}</span>
                      <span className="text-slate-500 font-medium flex items-center hover:text-slate-800">
                        <span>Details</span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
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
      <div className="w-full bg-white border-t border-slate-200 flex items-center h-12 px-6 overflow-hidden mt-12 shadow-2xs">
        <div className="max-w-7xl mx-auto w-full flex items-center gap-4 whitespace-nowrap overflow-x-auto no-scrollbar py-1">
          <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] rounded font-bold uppercase tracking-wider font-mono">Live Alerts</span>
          <span className="text-slate-600 text-[11px] font-medium font-mono leading-none">
            [14:22:01] <span className="text-red-600 font-bold">BLOCKED</span> Phishing attempt from support@am-security.ru — 
            [14:22:15] <span className="text-indigo-600 font-bold">BATCH UPDATE</span> CSV Analysis for 'Q4_Client_List' finished — 
            [14:23:02] <span className="text-amber-600 font-bold">SENSORY WARNING</span> Anomalous tone detected in mail header
          </span>
        </div>
      </div>

      <footer className="footer max-w-7xl mx-auto py-8 px-4 text-center text-xs font-mono text-slate-400">
        <p>&copy; 2026 NeoAegis &bull; Advanced Mail Analyzer and Assistant.</p>
        <p className="mt-1">Built with React & Tailwind CSS. Fully standalone sandbox verification.</p>
      </footer>

    </div>
  );
}
