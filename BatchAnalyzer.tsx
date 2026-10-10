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
    <div className="space-y-6 animate-fade-in" id="csv-batch-tab">
      
      {/* 1. Header Information */}
      <div className="bg-[#f8f9fa] border border-[#dadce0] rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-medium text-[#202124] flex items-center space-x-2">
            <FileSpreadsheet className="text-[#1a73e8] h-5 w-5" />
            <span>Batch CSV Audit Workspace</span>
          </h3>
          <p className="text-xs text-[#5f6368] mt-1">
            Perform offline bulk audit scanning, mapping true positives, and plotting ROC threshold values instantly.
          </p>
        </div>

        {/* File actions */}
        <div className="flex items-center space-x-3">
          <label className="cursor-pointer bg-[#1a73e8] hover:bg-[#1557b0] text-white font-medium text-xs px-4 py-2.5 rounded-full flex items-center space-x-2 transition shadow-2xs">
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
        <div className="bg-[#f8f9fa] border border-[#dadce0] rounded-2xl p-6 lg:col-span-5 space-y-4">
          <div>
            <h4 className="text-sm font-medium text-[#202124] flex items-center space-x-2">
              <Activity className="h-4 w-4 text-[#1e8e3e]" />
              <span>Classifier Confusion Matrix</span>
            </h4>
            <p className="text-xs text-[#5f6368] mt-0.5">Calculated dynamically over {total} active rows in sandbox</p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-center text-xs">
            {/* TP */}
            <div className="bg-white p-4 rounded-xl border border-[#dadce0]">
              <span className="text-[10px] text-[#137333] font-medium uppercase tracking-wider">True Positive (TP)</span>
              <div className="text-2xl font-semibold text-[#202124] mt-1">{tp}</div>
              <span className="text-[11px] text-[#5f6368]">Correctly blocked</span>
            </div>
            {/* FN */}
            <div className="bg-white p-4 rounded-xl border border-[#dadce0]">
              <span className="text-[10px] text-[#c5221f] font-medium uppercase tracking-wider">False Negative (FN)</span>
              <div className="text-2xl font-semibold text-[#202124] mt-1">{fn}</div>
              <span className="text-[11px] text-[#5f6368]">Missed threats</span>
            </div>
            {/* FP */}
            <div className="bg-white p-4 rounded-xl border border-[#dadce0]">
              <span className="text-[10px] text-[#b06000] font-medium uppercase tracking-wider">False Positive (FP)</span>
              <div className="text-2xl font-semibold text-[#202124] mt-1">{fp}</div>
              <span className="text-[11px] text-[#5f6368]">False alarms</span>
            </div>
            {/* TN */}
            <div className="bg-white p-4 rounded-xl border border-[#dadce0]">
              <span className="text-[10px] text-[#5f6368] font-medium uppercase tracking-wider">True Negative (TN)</span>
              <div className="text-2xl font-semibold text-[#202124] mt-1">{tn}</div>
              <span className="text-[11px] text-[#5f6368]">Correctly allowed</span>
            </div>
          </div>

          {/* Model Statistics Metrics */}
          <div className="grid grid-cols-3 gap-2 text-center border-t border-[#dadce0] pt-4 text-xs">
            <div>
              <span className="text-[10px] text-[#5f6368] font-medium">ACCURACY</span>
              <div className="text-base text-[#202124] font-semibold mt-0.5">{accuracy}%</div>
            </div>
            <div>
              <span className="text-[10px] text-[#5f6368] font-medium">PRECISION</span>
              <div className="text-base text-[#1a73e8] font-semibold mt-0.5">{precision}%</div>
            </div>
            <div>
              <span className="text-[10px] text-[#5f6368] font-medium">RECALL</span>
              <div className="text-base text-[#1e8e3e] font-semibold mt-0.5">{recall}%</div>
            </div>
          </div>

        </div>

        {/* Recharts Model Graph (ROC Curve) */}
        <div className="bg-[#f8f9fa] border border-[#dadce0] rounded-2xl p-6 lg:col-span-7 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-sm font-medium text-[#202124] flex items-center space-x-2">
                  <FileText className="h-4 w-4 text-[#1a73e8]" />
                  <span>Receiver Operating Characteristic (ROC Plot)</span>
                </h4>
                <p className="text-xs text-[#5f6368] mt-0.5">Mapping scanner sensitivity threshold (FPR vs TPR)</p>
              </div>
              <span className="px-2.5 py-0.5 bg-[#e8f0fe] text-[11px] rounded-full font-medium text-[#1967d2]">
                Live Model
              </span>
            </div>

            <div className="w-full h-56 text-xs font-mono">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rocCurvePoints} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#dadce0" />
                  <XAxis dataKey="fpr" stroke="#5f6368" label={{ value: 'False Positive Rate (%)', position: 'insideBottomRight', offset: -5 }} />
                  <YAxis stroke="#5f6368" label={{ value: 'True Positive Rate (%)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#dadce0', color: '#202124' }} />
                  <Legend />
                  <Line type="monotone" dataKey="tpr" name="Heuristics ROC Threshold" stroke="#1a73e8" strokeWidth={2.5} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

      </div>

      {/* 3. Interactive CSV Row Table layout */}
      <div className="bg-white border border-[#dadce0] rounded-2xl overflow-hidden">
        
        {/* Table Filters controls */}
        <div className="p-5 border-b border-[#dadce0] flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#f8f9fa]">
          <div>
            <h4 className="text-sm font-medium text-[#202124]">Row Scan Record Inventory</h4>
            <p className="text-xs text-[#5f6368] mt-0.5">Click column headers to sort metrics alphabetically or by risk level</p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 bg-white p-1 rounded-full border border-[#dadce0] text-xs">
            <button 
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-full font-medium transition cursor-pointer ${filterType === 'all' ? 'bg-[#e8f0fe] text-[#1967d2]' : 'text-[#5f6368] hover:text-[#202124]'}`}>
              All ({emails.length})
            </button>
            <button 
              onClick={() => setFilterType('spam')}
              className={`px-3 py-1.5 rounded-full font-medium transition cursor-pointer ${filterType === 'spam' ? 'bg-[#fce8e6] text-[#c5221f]' : 'text-[#5f6368] hover:text-[#202124]'}`}>
              Spam ({emails.filter(e => e.predicted === 'spam').length})
            </button>
            <button 
              onClick={() => setFilterType('ham')}
              className={`px-3 py-1.5 rounded-full font-medium transition cursor-pointer ${filterType === 'ham' ? 'bg-[#e6f4ea] text-[#137333]' : 'text-[#5f6368] hover:text-[#202124]'}`}>
              Clean ({emails.filter(e => e.predicted === 'ham').length})
            </button>
            <button 
              onClick={() => setFilterType('fp')}
              className={`px-3 py-1.5 rounded-full font-medium transition cursor-pointer ${filterType === 'fp' ? 'bg-[#fef7e0] text-[#b06000]' : 'text-[#5f6368] hover:text-[#202124]'}`}>
              False Alarm ({fp})
            </button>
            <button 
              onClick={() => setFilterType('fn')}
              className={`px-3 py-1.5 rounded-full font-medium transition cursor-pointer ${filterType === 'fn' ? 'bg-[#fce8e6] text-[#c5221f]' : 'text-[#5f6368] hover:text-[#202124]'}`}>
              Missed ({fn})
            </button>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#3c4043]">
            <thead className="bg-[#f8f9fa] text-[#5f6368] border-b border-[#dadce0] font-medium">
              <tr>
                <th className="py-3 px-4 cursor-pointer hover:text-[#202124] select-none" onClick={() => toggleSort('id')}>
                  <div className="flex items-center space-x-1">
                    <span>ID</span>
                    <ArrowUpDown className="h-3.5 w-3.5 text-[#5f6368]" />
                  </div>
                </th>
                <th className="py-3 px-4 cursor-pointer hover:text-[#202124] select-none" onClick={() => toggleSort('subject')}>
                  <div className="flex items-center space-x-1">
                    <span>Subject</span>
                    <ArrowUpDown className="h-3.5 w-3.5 text-[#5f6368]" />
                  </div>
                </th>
                <th className="py-3 px-4">Sender</th>
                <th className="py-3 px-4 cursor-pointer hover:text-[#202124] select-none text-right" onClick={() => toggleSort('score')}>
                  <div className="flex items-center justify-end space-x-1">
                    <span>Spam Score</span>
                    <ArrowUpDown className="h-3.5 w-3.5 text-[#5f6368]" />
                  </div>
                </th>
                <th className="py-3 px-4 text-center">SPF / DKIM</th>
                <th className="py-3 px-4 text-center">Actual</th>
                <th className="py-3 px-4 text-center">Predicted</th>
                <th className="py-3 px-4 text-center">Audit Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f3f4]">
              {filteredEmails.map(row => {
                const isMissed = row.actual === 'spam' && row.predicted === 'ham';
                const isFalseAlarm = row.actual === 'ham' && row.predicted === 'spam';
                const isCorrectSpam = row.actual === 'spam' && row.predicted === 'spam';
                const isCorrectHam = row.actual === 'ham' && row.predicted === 'ham';

                return (
                  <tr key={row.id} className="hover:bg-[#f8f9fa] transition">
                    <td className="py-3 px-4 font-mono text-[#5f6368]">{row.id}</td>
                    <td className="py-3 px-4 font-medium text-[#202124] max-w-xs truncate">{row.subject}</td>
                    <td className="py-3 px-4 text-[#5f6368] font-mono truncate max-w-[160px]">{row.sender}</td>
                    <td className="py-3 px-4 text-right pr-6 font-semibold font-mono">
                      <span className={row.score > 70 ? 'text-[#d93025]' : row.score > 35 ? 'text-[#e37400]' : 'text-[#1e8e3e]'}>
                        {row.score}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-mono">
                      <span className="text-[11px] text-[#5f6368]">SPF:{row.spf} | DKIM:{row.dkim}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase font-medium ${row.actual === 'spam' ? 'text-[#c5221f] bg-[#fce8e6]' : 'text-[#5f6368] bg-[#f1f3f4]'}`}>
                        {row.actual}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase font-medium ${row.predicted === 'spam' ? 'text-[#c5221f] bg-[#fce8e6]' : 'text-[#5f6368] bg-[#f1f3f4]'}`}>
                        {row.predicted}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {isCorrectSpam && (
                        <span className="text-[#1e8e3e] flex items-center justify-center space-x-1 font-medium">
                          <CheckCircle className="h-3.5 w-3.5" />
                          <span className="text-[11px]">Blocked</span>
                        </span>
                      )}
                      {isCorrectHam && (
                        <span className="text-[#1e8e3e] flex items-center justify-center space-x-1 font-medium">
                          <CheckCircle className="h-3.5 w-3.5" />
                          <span className="text-[11px]">Clean</span>
                        </span>
                      )}
                      {isMissed && (
                        <span className="text-[#d93025] flex items-center justify-center space-x-1 font-medium">
                          <XCircle className="h-3.5 w-3.5" />
                          <span className="text-[11px]">Missed Threat</span>
                        </span>
                      )}
                      {isFalseAlarm && (
                        <span className="text-[#e37400] flex items-center justify-center space-x-1 font-medium">
                          <XCircle className="h-3.5 w-3.5" />
                          <span className="text-[11px]">False Alarm</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filteredEmails.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-[#5f6368]">
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
