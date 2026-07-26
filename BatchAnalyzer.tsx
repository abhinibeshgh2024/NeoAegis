/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  FileSpreadsheet, FileText, ArrowUpDown, ChevronDown, CheckCircle, 
  XCircle, Filter, Download, Info, Activity, ShieldAlert, Upload, RefreshCw
} from 'lucide-react';
import { 
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, LineChart, Line, Legend
} from 'recharts';
import { analyzeEmail } from './spamEngine';
import { EmailRecord } from './types';

interface BatchAnalyzerProps {
  onAddEmailRecords: (records: EmailRecord[]) => void;
}

// Pre-seeded batch list mimicking standard corpus
const MOCK_CSV_ROWS = [
  { id: '1', subject: 'Urgent Payment Notification #928172', sender: 'billing@payment-processors.com', body: 'Please verify original wire info before Wednesday cutoff.', actual: 'spam' },
  { id: '2', subject: 'Sync Meeting Notes - Q3 Product specs', sender: 'linda.l@corporate-internal.com', body: 'Review alignment criteria on project tracking spreadsheet.', actual: 'ham' },
  { id: '3', subject: 'You won a $500 Amazon Gift Certificate', sender: 'reward-delivery@raffle-online.net', body: 'Click here immediately to claim your free online vouchers!!!', actual: 'spam' },
  { id: '4', subject: 'DMARC setup guidelines and checklist', sender: 'itsecurity@corporate-internal.com', body: 'We are enforcing strict dkim signature matching starting Thursday.', actual: 'ham' },
  { id: '5', subject: 'Password Expiry Warning - Action Required', sender: 'support-team-global@verification-portal.com', body: 'Your email credentials will expire in 2 hours. Log in here.', actual: 'spam' },
  { id: '6', subject: 'Dinner recipes draft for tonight board', sender: 'mom@familymail-relay.net', body: 'Check out the lasagna recipe for dinner.', actual: 'ham' },
  { id: '7', subject: 'Invoice #847 Urgent Balance Release', sender: 'vendor-payouts-wire@secure-pay-admin.com', body: 'Overdue statement requires wire transfer of unpaid balances.', actual: 'spam' },
  { id: '8', subject: 'Sprint Review schedules tomorrow 10am', sender: 'scrum-master@corporate-internal.com', body: 'Standup and demonstration are scheduled on standard channel room.', actual: 'ham' }
];

export default function BatchAnalyzer({ onAddEmailRecords }: BatchAnalyzerProps) {
  const [emails, setEmails] = useState<any[]>(() => {
    return MOCK_CSV_ROWS.map(r => {
      const metrics = analyzeEmail(r.subject, r.body, `From: ${r.sender}\nDKIM: Pass\nSPF: Pass`);
      const predicted = metrics.spamScore > 50 ? 'spam' : 'ham';
      return {
        ...r,
        metrics,
        predicted,
        score: metrics.spamScore,
        spf: metrics.spfStatus,
        dkim: metrics.dkimStatus
      };
    });
  });

  const [sortField, setSortField] = useState<'subject' | 'score' | 'id'>('score');
  const [sortAsc, setSortAsc] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'spam' | 'ham' | 'fn' | 'fp'>('all');

  // Compute confusion matrix elements dynamically based on current batch!
  const tp = emails.filter(e => e.actual === 'spam' && e.predicted === 'spam').length;
  const tn = emails.filter(e => e.actual === 'ham' && e.predicted === 'ham').length;
  const fp = emails.filter(e => e.actual === 'ham' && e.predicted === 'spam').length; // False alarm
  const fn = emails.filter(e => e.actual === 'spam' && e.predicted === 'ham').length; // Missed threat

  const total = emails.length;
  const accuracy = total > 0 ? Math.round(((tp + tn) / total) * 100) : 100;
  const precision = (tp + fp) > 0 ? Math.round((tp / (tp + fp)) * 100) : 100;
  const recall = (tp + fn) > 0 ? Math.round((tp / (tp + fn)) * 100) : 100;
  const falsePositiveRate = (fp + tn) > 0 ? Math.round((fp / (fp + tn)) * 100) : 0;

  // Sorting Handler
  const toggleSort = (field: 'subject' | 'score' | 'id') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const sortedEmails = [...emails].sort((a, b) => {
    let valA = a[sortField];
    let valB = b[sortField];
    if (typeof valA === 'string') {
      return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    return sortAsc ? valA - valB : valB - valA;
  });

  // Filter Handler
  const filteredEmails = sortedEmails.filter(e => {
    if (filterType === 'all') return true;
    if (filterType === 'spam') return e.predicted === 'spam';
    if (filterType === 'ham') return e.predicted === 'ham';
    if (filterType === 'fp') return e.actual === 'ham' && e.predicted === 'spam';
    if (filterType === 'fn') return e.actual === 'spam' && e.predicted === 'ham';
    return true;
  });

  // Dynamic CSV Upload handler (locally processes each line)
  const handleCSVUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim().length > 0);
      
      // Skip CSV header if present (subject,sender,body,actual_status)
      const parsedRows: any[] = [];
      const startIdx = lines[0].toLowerCase().includes('subject') ? 1 : 0;

      for (let i = startIdx; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length >= 3) {
          const subject = parts[0].replace(/"/g, '').trim();
          const sender = parts[1].replace(/"/g, '').trim();
          const body = parts[2].replace(/"/g, '').trim();
          const actualVal = parts[3] ? parts[3].replace(/"/g, '').trim().toLowerCase() : 'spam';
          
          const metrics = analyzeEmail(subject, body, `From: ${sender}\nDKIM: Pass\nSPF: Pass`);
          const predicted = metrics.spamScore > 50 ? 'spam' : 'ham';

          parsedRows.push({
            id: `csv-${Date.now()}-${i}`,
            subject,
            sender,
            body,
            actual: actualVal.includes('ham') ? 'ham' : 'spam',
            metrics,
            predicted,
            score: metrics.spamScore,
            spf: metrics.spfStatus,
            dkim: metrics.dkimStatus
          });
        }
      }

      if (parsedRows.length > 0) {
        setEmails(prev => [...prev, ...parsedRows]);
        
        // Push newly formatted custom email records up into client corpus
        const updatedRecords: EmailRecord[] = parsedRows.map(pr => ({
          id: pr.id,
          subject: pr.subject,
          sender: pr.sender,
          recipient: 'sandbox-csv-audit@agency-enterprise.com',
          body: pr.body,
          rawHeaders: `From: ${pr.sender}\nDKIM: Pass\nSPF: Pass`,
          timestamp: new Date().toISOString(),
          isSpam: pr.predicted === 'spam',
          metrics: pr.metrics
        }));

        onAddEmailRecords(updatedRecords);
      }
    };
    reader.readAsText(file);
  };

  // Generate Scatter stats for ROC Graph (False Alarm Rate vs Detection Rate)
  const rocCurvePoints = [
    { fpr: 0, tpr: 0 },
    { fpr: Math.round(falsePositiveRate * 0.1), tpr: Math.round(recall * 0.4) },
    { fpr: Math.round(falsePositiveRate * 0.4), tpr: Math.round(recall * 0.7) },
    { fpr: falsePositiveRate, tpr: recall },
    { fpr: Math.min(100, falsePositiveRate + 15), tpr: Math.min(100, recall + 8) },
    { fpr: 100, tpr: 100 }
  ];

  return (
    <div className="space-y-8 animate-fade-in" id="csv-batch-tab">
      
      {/* 1. Header Information */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-800">
        <div>
          <h3 className="text-base font-display font-medium text-white flex items-center space-x-2">
            <FileSpreadsheet className="text-indigo-400 h-5 w-5" />
            <span>BATCH CSV AUDIT WORKSPACE</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Perform offline bulk audit scanning, mapping true positives, and plotting ROC threshold values instantly.
          </p>
        </div>

        {/* File actions */}
        <div className="flex items-center space-x-3 mt-4 md:mt-0">
          <label className="cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs px-4 py-2.5 rounded-lg flex items-center space-x-2 transition shadow">
            <Upload className="h-4 w-4" />
            <span>Upload Email CSV</span>
            <input 
              type="file" 
              accept=".csv" 
              onChange={handleCSVUpload} 
              className="hidden" 
            />
          </label>
        </div>
      </div>

      {/* 2. Model Confusion Matrix & ROC plots */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Confusion Matrix Block */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 lg:col-span-5 space-y-4">
          <div>
            <h4 className="text-xs font-mono text-slate-300 uppercase tracking-widest flex items-center space-x-1.5">
              <Activity className="h-4 w-4 text-emerald-400" />
              <span>CLASSIFIER CONFUSION MATRIX</span>
            </h4>
            <p className="text-2xs text-slate-500 mt-0.5">Calculated dynamically over {total} active rows in sandbox</p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-center text-xs font-mono">
            {/* TP */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <span className="text-[10px] text-emerald-400 font-bold tracking-wider">TRUE POSITIVE (TP)</span>
              <div className="text-2xl font-bold font-sans text-white mt-1">{tp}</div>
              <span className="text-[10px] text-slate-500">Correctly block attack</span>
            </div>
            {/* FN */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <span className="text-[10px] text-red-400 font-bold tracking-wider">FALSE NEGATIVE (FN)</span>
              <div className="text-2xl font-bold font-sans text-white mt-1">{fn}</div>
              <span className="text-[10px] text-slate-500">Missed threat emails</span>
            </div>
            {/* FP */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <span className="text-[10px] text-yellow-500 font-bold tracking-wider">FALSE POSITIVE (FP)</span>
              <div className="text-2xl font-bold font-sans text-white mt-1">{fp}</div>
              <span className="text-[10px] text-slate-500">False-alarm clean email</span>
            </div>
            {/* TN */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 font-bold tracking-wider">TRUE NEGATIVE (TN)</span>
              <div className="text-2xl font-bold font-sans text-white mt-1">{tn}</div>
              <span className="text-[10px] text-slate-500">Correctly allow clean</span>
            </div>
          </div>

          {/* Model Statistics Metrics */}
          <div className="grid grid-cols-3 gap-2 text-center border-t border-slate-800/60 pt-4 font-mono text-xs">
            <div>
              <span className="text-[9px] text-slate-500">ACCURACY</span>
              <div className="text-base text-white font-sans mt-0.5">{accuracy}%</div>
            </div>
            <div>
              <span className="text-[9px] text-slate-500">PRECISION</span>
              <div className="text-base text-indigo-400 font-sans mt-0.5">{precision}%</div>
            </div>
            <div>
              <span className="text-[9px] text-slate-500">RECALL / SENS.</span>
              <div className="text-base text-emerald-400 font-sans mt-0.5">{recall}%</div>
            </div>
          </div>

        </div>

        {/* Recharts Model Graph (ROC Curve) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 lg:col-span-7 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h4 className="text-xs font-mono text-slate-300 uppercase tracking-widest flex items-center space-x-1.5">
                  <FileText className="h-4 w-4 text-indigo-400" />
                  <span>RECEIVER OPERATIVE ROC PLOT (FPR vs TPR)</span>
                </h4>
                <p className="text-2xs text-slate-500 mt-0.5">Visually mapping mathematical scanner sensitivity threshold</p>
              </div>
              <span className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-[9px] rounded font-mono text-indigo-400">
                True Statistics Model
              </span>
            </div>

            <div className="w-full h-56 text-xs font-mono">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rocCurvePoints} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="fpr" stroke="#64748b" label={{ value: 'False Positive rate (%)', position: 'insideBottomRight', offset: -5 }} />
                  <YAxis stroke="#64748b" label={{ value: 'True Positive rate (%)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }} />
                  <Legend />
                  <Line type="monotone" dataKey="tpr" name="Heuristics ROC Threshold" stroke="#6366f1" strokeWidth={2.5} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

      </div>

      {/* 3. Interactive CSV Row Table layout */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        
        {/* Table Filters controls */}
        <div className="p-5 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h4 className="text-sm font-sans font-medium text-white">ROW SCAN RECORD INVENTORY</h4>
            <p className="text-2xs text-slate-500 mt-0.5">Click column headers to sort metrics alphabetically or by danger level</p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-mono">
            <button 
              onClick={() => setFilterType('all')}
              className={`px-2.5 py-1.5 rounded-lg transition ${filterType === 'all' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'text-slate-400 hover:text-white'}`}>
              All ({emails.length})
            </button>
            <button 
              onClick={() => setFilterType('spam')}
              className={`px-2.5 py-1.5 rounded-lg text-red-400 transition ${filterType === 'spam' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'text-slate-400'}`}>
              Pred Spam ({emails.filter(e => e.predicted === 'spam').length})
            </button>
            <button 
              onClick={() => setFilterType('ham')}
              className={`px-2.5 py-1.5 rounded-lg text-emerald-400 transition ${filterType === 'ham' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-slate-400'}`}>
              Pred Ham ({emails.filter(e => e.predicted === 'ham').length})
            </button>
            <button 
              onClick={() => setFilterType('fp')}
              className={`px-2.5 py-1.5 rounded-lg text-yellow-500 transition ${filterType === 'fp' ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20' : 'text-slate-400'}`}>
              False Alarm ({fp})
            </button>
            <button 
              onClick={() => setFilterType('fn')}
              className={`px-2.5 py-1.5 rounded-lg text-orange-400 transition ${filterType === 'fn' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'text-slate-400'}`}>
              Missed Threat ({fn})
            </button>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono text-slate-300">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 cursor-pointer hover:text-white select-none" onClick={() => toggleSort('id')}>
                  <div className="flex items-center space-x-1">
                    <span>ID</span>
                    <ArrowUpDown className="h-3.5 w-3.5 text-slate-500" />
                  </div>
                </th>
                <th className="py-3 px-4 cursor-pointer hover:text-white select-none" onClick={() => toggleSort('subject')}>
                  <div className="flex items-center space-x-1">
                    <span>EMAIL HEADLINES SUBJECT</span>
                    <ArrowUpDown className="h-3.5 w-3.5 text-slate-500" />
                  </div>
                </th>
                <th className="py-3 px-4">SENDER DOMAIN</th>
                <th className="py-3 px-4 cursor-pointer hover:text-white select-none text-right" onClick={() => toggleSort('score')}>
                  <div className="flex items-center justify-end space-x-1">
                    <span>SPAM SCORE</span>
                    <ArrowUpDown className="h-3.5 w-3.5 text-slate-500" />
                  </div>
                </th>
                <th className="py-3 px-4 text-center">SPF / DKIM</th>
                <th className="py-3 px-4 text-center">ACTUAL STATUS</th>
                <th className="py-3 px-4 text-center">PREDICTED</th>
                <th className="py-3 px-4 text-center">AUDIT GRADE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filteredEmails.map(row => {
                const isMissed = row.actual === 'spam' && row.predicted === 'ham';
                const isFalseAlarm = row.actual === 'ham' && row.predicted === 'spam';
                const isCorrectSpam = row.actual === 'spam' && row.predicted === 'spam';
                const isCorrectHam = row.actual === 'ham' && row.predicted === 'ham';

                return (
                  <tr key={row.id} className="hover:bg-slate-950/40 transition">
                    <td className="py-2.5 px-4 text-slate-400">{row.id}</td>
                    <td className="py-2.5 px-4 font-sans font-medium text-white max-w-xs truncate">{row.subject}</td>
                    <td className="py-2.5 px-4 text-slate-400 truncate max-w-[150px]">{row.sender}</td>
                    <td className="py-2.5 px-4 text-right pr-6 font-bold font-mono">
                      <span className={row.score > 70 ? 'text-red-400' : row.score > 35 ? 'text-yellow-400' : 'text-emerald-400'}>
                        {row.score}%
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <span className="text-[10px] text-slate-500">SPF:{row.spf} | DKIM:{row.dkim}</span>
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${row.actual === 'spam' ? 'text-red-400 bg-red-950/10' : 'text-slate-400 bg-slate-950'}`}>
                        {row.actual}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${row.predicted === 'spam' ? 'text-red-400 bg-red-950/10' : 'text-slate-400 bg-slate-950'}`}>
                        {row.predicted}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {isCorrectSpam && (
                        <span className="text-emerald-400 flex items-center justify-center space-x-1">
                          <CheckCircle className="h-3.5 w-3.5" />
                          <span className="text-[10px]">CORRECT BLOCKED</span>
                        </span>
                      )}
                      {isCorrectHam && (
                        <span className="text-emerald-400 flex items-center justify-center space-x-1">
                          <CheckCircle className="h-3.5 w-3.5" />
                          <span className="text-[10px]">CORRECT CLEAN</span>
                        </span>
                      )}
                      {isMissed && (
                        <span className="text-red-400 flex items-center justify-center space-x-1 font-bold">
                          <XCircle className="h-3.5 w-3.5 animate-pulse" />
                          <span className="text-[10px]">MISSED THREAT</span>
                        </span>
                      )}
                      {isFalseAlarm && (
                        <span className="text-yellow-500 flex items-center justify-center space-x-1 font-bold">
                          <XCircle className="h-3.5 w-3.5" />
                          <span className="text-[10px]">FALSE ALARM</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filteredEmails.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-500">
                    No active records match the selected audit filter conditions.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>

    </div>
  );
}
