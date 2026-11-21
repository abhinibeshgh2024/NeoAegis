/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  FileSpreadsheet, FileText, ArrowUpDown, CheckCircle,
  XCircle, Upload, RotateCcw, Trash2, Activity, BrainCircuit
} from 'lucide-react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend
} from 'recharts';
import { analyzeEmailWithModel } from './spamEngine';
import {
  EmailLabel,
  EmailRecord,
  GranularThreatTier,
  TrainedModelArtifact,
  TrainingSample
} from './types';
import {
  classifyGranularEmailTier,
  GRANULAR_TIER_META,
  loadUserBatchRows,
  parseDatasetFileContent,
  saveUserBatchRows
} from './src/lib/localMlEngine';
import InfoButton from './src/components/InfoButton';

interface BatchAnalyzerProps {
  currentUserUid?: string;
  onAddEmailRecords: (records: EmailRecord[]) => void;
  onSendBatchToTrainer?: (samples: TrainingSample[]) => void;
  activeModel?: TrainedModelArtifact | null;
  modelVersion?: number;
}

export interface PersistedBatchRow {
  id: string;
  subject: string;
  sender: string;
  body: string;
  rawHeaders?: string;
  actual: 'spam' | 'ham';
  actualLabel: EmailLabel;
  granularTier: GranularThreatTier;
  predicted: 'spam' | 'ham';
  predictedLabel: EmailLabel;
  score: number;
  phishingLikelihood: number;
  spf: 'Pass' | 'Fail' | 'None';
  dkim: 'Pass' | 'Fail' | 'None';
  source?: 'default' | 'csv_upload' | 'trainer_sync';
  metrics: ReturnType<typeof analyzeEmailWithModel>['metrics'];
}

const DEFAULT_BATCH_SEED: {
  id: string;
  subject: string;
  sender: string;
  body: string;
  actualLabel: EmailLabel;
}[] = [
  { id: '1', subject: 'Urgent Payment Notification #928172', sender: 'billing@payment-processors.com', body: 'Please verify original wire info before Wednesday cutoff.', actualLabel: 'phishing' },
  { id: '2', subject: 'Sync Meeting Notes - Q3 Product specs', sender: 'linda.l@corporate-internal.com', body: 'Review alignment criteria on project tracking spreadsheet.', actualLabel: 'legitimate' },
  { id: '3', subject: 'You won a $500 Amazon Gift Certificate', sender: 'reward-delivery@raffle-online.net', body: 'Click here immediately to claim your free online vouchers!!!', actualLabel: 'spam' },
  { id: '4', subject: 'DMARC setup guidelines and checklist', sender: 'itsecurity@corporate-internal.com', body: 'We are enforcing strict dkim signature matching starting Thursday.', actualLabel: 'legitimate' },
  { id: '5', subject: 'Password Expiry Warning - Action Required', sender: 'support-team-global@verification-portal.com', body: 'Your email credentials will expire in 2 hours. Log in here.', actualLabel: 'phishing' },
  { id: '6', subject: 'Dinner recipes draft for tonight board', sender: 'mom@familymail-relay.net', body: 'Check out the lasagna recipe for dinner.', actualLabel: 'legitimate' },
  { id: '7', subject: 'Invoice #847 Urgent Balance Release', sender: 'vendor-payouts-wire@secure-pay-admin.com', body: 'Overdue statement requires wire transfer of unpaid balances.', actualLabel: 'phishing' },
  { id: '8', subject: 'Sprint Review schedules tomorrow 10am', sender: 'scrum-master@corporate-internal.com', body: 'Standup and demonstration are scheduled on standard channel room.', actualLabel: 'legitimate' }
];

function evaluateBatchRow(raw: {
  id: string;
  subject: string;
  sender: string;
  body: string;
  rawHeaders?: string;
  actualLabel?: EmailLabel;
  actual?: 'spam' | 'ham';
  granularTier?: GranularThreatTier;
  source?: 'default' | 'csv_upload' | 'trainer_sync';
}): PersistedBatchRow {
  const headers = raw.rawHeaders || `From: ${raw.sender}\nDKIM: Pass\nSPF: Pass`;
  const res = analyzeEmailWithModel(raw.subject, raw.body, headers, raw.sender);
  const actualLabel: EmailLabel =
    raw.actualLabel ||
    (raw.actual === 'ham' ? 'legitimate' : 'spam');
  const actual: 'spam' | 'ham' = actualLabel === 'legitimate' ? 'ham' : 'spam';

  const predictedThreat = res.metrics.spamScore >= 50 || res.metrics.phishingLikelihood >= 55;
  const predicted: 'spam' | 'ham' = predictedThreat ? 'spam' : 'ham';
  const predictedLabel: EmailLabel = res.modelPrediction
    ? res.modelPrediction.predictedLabel
    : predictedThreat
    ? res.metrics.phishingLikelihood >= 55
      ? 'phishing'
      : 'spam'
    : 'legitimate';

  const tierInfo = classifyGranularEmailTier(
    raw.subject,
    raw.body,
    raw.sender,
    headers,
    raw.granularTier || actualLabel,
    res.metrics.spamScore,
    res.metrics.phishingLikelihood
  );

  return {
    id: raw.id,
    subject: raw.subject,
    sender: raw.sender,
    body: raw.body,
    rawHeaders: headers,
    actual,
    actualLabel,
    granularTier: raw.granularTier || tierInfo.granularTier,
    predicted,
    predictedLabel,
    score: res.metrics.spamScore,
    phishingLikelihood: res.metrics.phishingLikelihood,
    spf: res.metrics.spfStatus,
    dkim: res.metrics.dkimStatus,
    source: raw.source || 'default',
    metrics: res.metrics
  };
}

function getTierBadgeStyle(tier: GranularThreatTier): string {
  switch (tier) {
    case 'complete_legitimate':
      return 'bg-[#e6f4ea] text-[#137333] border-[#a8dab5]';
    case 'suspicious':
      return 'bg-[#e8f0fe] text-[#1967d2] border-[#aecbfa]';
    case 'spam':
      return 'bg-[#fef7e0] text-[#b06000] border-[#fde293]';
    case 'highly_spam':
      return 'bg-[#fef7e0] text-[#b06000] border-[#e37400] font-semibold';
    case 'phishing':
      return 'bg-[#fce8e6] text-[#c5221f] border-[#fad2cf]';
    case 'highly_phishing':
      return 'bg-[#fce8e6] text-[#c5221f] border-[#d93025] font-semibold';
  }
}

export default function BatchAnalyzer({
  currentUserUid,
  onAddEmailRecords,
  onSendBatchToTrainer,
  activeModel,
  modelVersion = 0
}: BatchAnalyzerProps) {
  const buildInitialRows = (uid?: string): PersistedBatchRow[] => {
    const saved = uid ? loadUserBatchRows(uid) : null;
    if (saved && saved.length > 0) {
      return saved.map(r => evaluateBatchRow(r));
    }
    return DEFAULT_BATCH_SEED.map(r => evaluateBatchRow({ ...r, source: 'default' }));
  };

  const [emails, setEmails] = useState<PersistedBatchRow[]>(() => buildInitialRows(currentUserUid));
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const loadedUidRef = useRef<string | undefined>(currentUserUid);

  // Hydrate cleanly if user UID changes
  useEffect(() => {
    if (loadedUidRef.current === currentUserUid) return;
    loadedUidRef.current = currentUserUid;
    setEmails(buildInitialRows(currentUserUid));
  }, [currentUserUid]);

  // Persist batch rows for current user across tab navigation & reloads
  useEffect(() => {
    if (!currentUserUid) return;
    saveUserBatchRows(currentUserUid, emails);
  }, [emails, currentUserUid]);

  // Immediately re-score all rows whenever user trains, imports, or resets their local ML model
  useEffect(() => {
    setEmails(prev => prev.map(r => evaluateBatchRow(r)));
  }, [modelVersion, activeModel]);

  const [sortField, setSortField] = useState<'subject' | 'score' | 'id'>('score');
  const [sortAsc, setSortAsc] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'spam' | 'ham' | 'fn' | 'fp'>('all');

  // Real confusion matrix elements computed over active batch rows
  const tp = emails.filter(e => e.actual === 'spam' && e.predicted === 'spam').length;
  const tn = emails.filter(e => e.actual === 'ham' && e.predicted === 'ham').length;
  const fp = emails.filter(e => e.actual === 'ham' && e.predicted === 'spam').length;
  const fn = emails.filter(e => e.actual === 'spam' && e.predicted === 'ham').length;

  const total = emails.length;
  const accuracy = total > 0 ? Number((((tp + tn) / total) * 100).toFixed(1)) : 0;
  const precision = tp + fp > 0 ? Number(((tp / (tp + fp)) * 100).toFixed(1)) : 0;
  const recall = tp + fn > 0 ? Number(((tp / (tp + fn)) * 100).toFixed(1)) : 0;
  const falsePositiveRate = fp + tn > 0 ? Number(((fp / (fp + tn)) * 100).toFixed(1)) : 0;

  // Sorting Handler
  const toggleSort = (field: 'subject' | 'score' | 'id') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const sortedEmails = useMemo(() => {
    return [...emails].sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];
      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortAsc ? Number(valA) - Number(valB) : Number(valB) - Number(valA);
    });
  }, [emails, sortField, sortAsc]);

  // Filter Handler
  const filteredEmails = useMemo(() => {
    return sortedEmails.filter(e => {
      if (filterType === 'all') return true;
      if (filterType === 'spam') return e.predicted === 'spam';
      if (filterType === 'ham') return e.predicted === 'ham';
      if (filterType === 'fp') return e.actual === 'ham' && e.predicted === 'spam';
      if (filterType === 'fn') return e.actual === 'spam' && e.predicted === 'ham';
      return true;
    });
  }, [sortedEmails, filterType]);

  // Real ROC curve evaluated across thresholds 100..0 using actual continuous scores
  const rocCurvePoints = useMemo(() => {
    if (emails.length === 0) {
      return [
        { fpr: 0, tpr: 0 },
        { fpr: 100, tpr: 100 }
      ];
    }
    const posTotal = emails.filter(e => e.actual === 'spam').length || 1;
    const negTotal = emails.filter(e => e.actual === 'ham').length || 1;
    const thresholds = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0];
    const pts = thresholds.map(th => {
      const tPos = emails.filter(e => e.actual === 'spam' && e.score >= th).length;
      const fPos = emails.filter(e => e.actual === 'ham' && e.score >= th).length;
      return {
        fpr: Number(((fPos / negTotal) * 100).toFixed(1)),
        tpr: Number(((tPos / posTotal) * 100).toFixed(1))
      };
    });
    return pts.sort((a, b) => a.fpr - b.fpr || a.tpr - b.tpr);
  }, [emails]);

  // Dynamic CSV Upload handler (RFC parser + persistent storage + Vault archival)
  const handleCSVUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = String(e.target?.result || '');
        const parsed = parseDatasetFileContent(text, file.name);
        if (parsed.length === 0) {
          setUploadNotice('No valid email rows found in uploaded CSV. Expected columns: subject, body, sender, label.');
          return;
        }

        const evaluatedBatch: PersistedBatchRow[] = parsed.map((sample, idx) =>
          evaluateBatchRow({
            id: `csv-${Date.now()}-${idx}`,
            subject: sample.subject,
            sender: sample.sender,
            body: sample.body,
            rawHeaders: sample.rawHeaders,
            actualLabel: sample.label,
            granularTier: sample.granularTier,
            source: 'csv_upload'
          })
        );

        setEmails(prev => [...evaluatedBatch, ...prev]);

        const updatedRecords: EmailRecord[] = evaluatedBatch.map(pr => ({
          id: pr.id,
          subject: pr.subject,
          sender: pr.sender,
          recipient: 'sandbox-csv-audit@agency-enterprise.com',
          body: pr.body,
          rawHeaders: pr.rawHeaders || `From: ${pr.sender}\nDKIM: Pass\nSPF: Pass`,
          timestamp: new Date().toISOString(),
          isSpam: pr.predicted === 'spam',
          groundTruthLabel: pr.actualLabel,
          granularTier: pr.granularTier,
          metrics: pr.metrics
        }));

        onAddEmailRecords(updatedRecords);
        setUploadNotice(`Saved ${evaluatedBatch.length} email(s) from "${file.name}" into Batch Auditor & Personal Vault.`);
      } catch (err: any) {
        setUploadNotice(err?.message || 'Failed to parse uploaded CSV file.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleResetDefaultBatch = () => {
    const defaults = DEFAULT_BATCH_SEED.map(r => evaluateBatchRow({ ...r, source: 'default' }));
    setEmails(defaults);
    setUploadNotice('Restored default 8-email batch baseline.');
  };

  const handleRemoveBatchRow = (id: string) => {
    setEmails(prev => prev.filter(r => r.id !== id));
  };

  const uploadedCount = emails.filter(e => e.source === 'csv_upload' || e.source === 'trainer_sync').length;

  const handleStageUploadedToTrainer = () => {
    if (!onSendBatchToTrainer) return;
    const customRows = emails.filter(e => e.source === 'csv_upload' || e.source === 'trainer_sync');
    const targetRows = customRows.length > 0 ? customRows : emails;
    const samplesToStage: TrainingSample[] = targetRows.map((row, idx) => ({
      id: `batch-trn-${row.id || idx}`,
      subject: row.subject,
      body: row.body,
      sender: row.sender,
      rawHeaders: row.rawHeaders,
      label: row.actualLabel,
      granularTier: row.granularTier,
      evaluatedScore: row.score,
      evaluatedPhishingScore: row.phishingLikelihood,
      source: 'upload'
    }));
    onSendBatchToTrainer(samplesToStage);
  };

  return (
    <div className="space-y-6 animate-fade-in" id="csv-batch-tab">
      {/* 1. Header Information */}
      <div className="bg-[#f8f9fa] border border-[#dadce0] rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <FileSpreadsheet className="text-[#1a73e8] h-5 w-5" />
            <h3 className="text-base font-medium text-[#202124]">Batch CSV Audit Workspace</h3>
            <InfoButton
              title="Batch CSV Audit Workspace"
              description="Upload CSV email datasets to run offline bulk scanning, evaluate true/false positives, and persist audited rows across sessions."
              align="left"
            />
          </div>
          <p className="text-xs text-[#5f6368] tabular-nums">
            Active Dataset: <strong className="text-[#202124]">{total} emails</strong> ({uploadedCount} uploaded/synced)
          </p>
        </div>

        {/* File actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs text-[#5f6368]">
            Model:{' '}
            <strong className={activeModel && (activeModel.datasetSize > 0 || activeModel.vocabulary.length > 0) ? 'text-[#137333]' : 'text-[#1a73e8]'}>
              {activeModel && (activeModel.datasetSize > 0 || activeModel.vocabulary.length > 0)
                ? 'Trained Local Model'
                : 'Baseline Heuristics'}
            </strong>
          </span>

          <label className="cursor-pointer bg-[#1a73e8] hover:bg-[#1557b0] text-white font-medium text-xs px-4 py-2 rounded-full flex items-center space-x-2 transition shadow-2xs">
            <Upload className="h-3.5 w-3.5" />
            <span>Upload Email CSV</span>
            <input
              type="file"
              accept=".csv,.json"
              onChange={handleCSVUpload}
              className="hidden"
            />
          </label>

          {onSendBatchToTrainer && uploadedCount > 0 && (
            <button
              type="button"
              onClick={handleStageUploadedToTrainer}
              className="px-3.5 py-2 bg-[#137333] hover:bg-[#0d652d] text-white rounded-full text-xs font-medium transition flex items-center gap-1.5 cursor-pointer"
              title="Stage uploaded batch CSV emails into the ML Trainer"
            >
              <BrainCircuit className="h-3.5 w-3.5" />
              <span>Send CSV to Trainer</span>
            </button>
          )}

          {uploadedCount > 0 && (
            <button
              type="button"
              onClick={handleResetDefaultBatch}
              className="px-3.5 py-2 bg-white hover:bg-[#f1f3f4] text-[#5f6368] border border-[#dadce0] rounded-full text-xs font-medium transition flex items-center gap-1.5 cursor-pointer"
              title="Reset to default 8-email batch"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset Batch</span>
            </button>
          )}
        </div>
      </div>

      {uploadNotice && (
        <div className="p-3 bg-[#e8f0fe] border border-[#aecbfa] rounded-xl text-xs text-[#1967d2] flex items-center justify-between gap-2">
          <span>{uploadNotice}</span>
          <button
            type="button"
            onClick={() => setUploadNotice(null)}
            className="text-[11px] font-medium hover:underline cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 2. Model Confusion Matrix & ROC plots */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Confusion Matrix Block */}
        <div className="bg-[#f8f9fa] border border-[#dadce0] rounded-2xl p-6 lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Activity className="h-4 w-4 text-[#1e8e3e]" />
              <h4 className="text-sm font-medium text-[#202124]">Classifier Confusion Matrix</h4>
            </div>
            <InfoButton
              title="Classifier Confusion Matrix"
              description={`Calculated dynamically over ${total} saved rows in your Batch CSV sandbox, comparing predicted classifications against ground-truth labels.`}
              align="right"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 text-center text-xs tabular-nums">
            <div className="bg-white p-4 rounded-xl border border-[#dadce0]">
              <span className="text-[10px] text-[#137333] font-medium uppercase tracking-wider">True Positive (TP)</span>
              <div className="text-2xl font-semibold text-[#202124] mt-1">{tp}</div>
              <span className="text-[11px] text-[#5f6368]">Correctly blocked</span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-[#dadce0]">
              <span className="text-[10px] text-[#c5221f] font-medium uppercase tracking-wider">False Negative (FN)</span>
              <div className="text-2xl font-semibold text-[#202124] mt-1">{fn}</div>
              <span className="text-[11px] text-[#5f6368]">Missed threats</span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-[#dadce0]">
              <span className="text-[10px] text-[#b06000] font-medium uppercase tracking-wider">False Positive (FP)</span>
              <div className="text-2xl font-semibold text-[#202124] mt-1">{fp}</div>
              <span className="text-[11px] text-[#5f6368]">False alarms</span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-[#dadce0]">
              <span className="text-[10px] text-[#5f6368] font-medium uppercase tracking-wider">True Negative (TN)</span>
              <div className="text-2xl font-semibold text-[#202124] mt-1">{tn}</div>
              <span className="text-[11px] text-[#5f6368]">Correctly allowed</span>
            </div>
          </div>

          {/* Model Statistics Metrics */}
          <div className="grid grid-cols-3 gap-2 text-center border-t border-[#dadce0] pt-4 text-xs tabular-nums">
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

        {/* Recharts Model Graph (Real Threshold ROC Curve) */}
        <div className="bg-[#f8f9fa] border border-[#dadce0] rounded-2xl p-6 lg:col-span-7 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <FileText className="h-4 w-4 text-[#1a73e8]" />
                <h4 className="text-sm font-medium text-[#202124]">Receiver Operating Characteristic (ROC Plot)</h4>
                <InfoButton
                  title="ROC Threshold Plot"
                  description="Sweeps real threat score thresholds (0%–100%) across your persisted batch rows to plot True Positive Rate (TPR) against False Positive Rate (FPR)."
                  align="left"
                />
              </div>
              <span className="px-2.5 py-0.5 bg-[#e8f0fe] text-[11px] rounded-full font-medium text-[#1967d2] tabular-nums">
                FPR: {falsePositiveRate}%
              </span>
            </div>

            <div className="w-full h-56 text-xs font-mono">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rocCurvePoints} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#dadce0" />
                  <XAxis dataKey="fpr" stroke="#5f6368" label={{ value: 'False Positive Rate (%)', position: 'insideBottomRight', offset: -5 }} />
                  <YAxis domain={[0, 100]} stroke="#5f6368" label={{ value: 'True Positive Rate (%)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#dadce0', color: '#202124' }} />
                  <Legend />
                  <Line type="monotone" dataKey="tpr" name="Measured Batch ROC" stroke="#1a73e8" strokeWidth={2.5} activeDot={{ r: 6 }} />
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
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-[#202124]">Row Scan Record Inventory</h4>
            <InfoButton
              title="Row Scan Record Inventory"
              description="Click column headers (ID, Subject, Spam Score) to sort records or filter by outcome. Uploaded rows stay persisted per profile."
              align="left"
            />
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
              Threat ({emails.filter(e => e.predicted === 'spam').length})
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
        <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
          <table className="w-full text-left text-xs text-[#3c4043] tabular-nums">
            <thead className="bg-[#f8f9fa] text-[#5f6368] border-b border-[#dadce0] font-medium sticky top-0">
              <tr>
                <th className="py-3 px-4 cursor-pointer hover:text-[#202124] select-none" onClick={() => toggleSort('subject')}>
                  <div className="flex items-center space-x-1">
                    <span>Subject &amp; Sender</span>
                    <ArrowUpDown className="h-3.5 w-3.5 text-[#5f6368]" />
                  </div>
                </th>
                <th className="py-3 px-4 cursor-pointer hover:text-[#202124] select-none text-right" onClick={() => toggleSort('score')}>
                  <div className="flex items-center justify-end space-x-1">
                    <span>Risk Score</span>
                    <ArrowUpDown className="h-3.5 w-3.5 text-[#5f6368]" />
                  </div>
                </th>
                <th className="py-3 px-4">Granular Tier</th>
                <th className="py-3 px-4 text-center">Actual</th>
                <th className="py-3 px-4 text-center">Predicted</th>
                <th className="py-3 px-4 text-center">Audit Outcome</th>
                <th className="py-3 px-3 text-right">Del</th>
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
                    <td className="py-3 px-4 max-w-xs">
                      <div className="font-medium text-[#202124] truncate">{row.subject}</div>
                      <div className="text-[11px] text-[#5f6368] font-mono truncate">{row.sender}</div>
                    </td>
                    <td className="py-3 px-4 text-right font-semibold font-mono">
                      <span className={row.score > 70 ? 'text-[#d93025]' : row.score > 35 ? 'text-[#e37400]' : 'text-[#1e8e3e]'}>
                        {row.score}%
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-md border text-[10px] font-medium ${getTierBadgeStyle(row.granularTier)}`}>
                        {GRANULAR_TIER_META[row.granularTier].label}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-medium ${
                        row.actualLabel === 'phishing'
                          ? 'text-[#c5221f] bg-[#fce8e6]'
                          : row.actualLabel === 'spam'
                          ? 'text-[#b06000] bg-[#fef7e0]'
                          : 'text-[#137333] bg-[#e6f4ea]'
                      }`}>
                        {row.actualLabel}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-medium ${
                        row.predictedLabel === 'phishing'
                          ? 'text-[#c5221f] bg-[#fce8e6]'
                          : row.predictedLabel === 'spam'
                          ? 'text-[#b06000] bg-[#fef7e0]'
                          : 'text-[#137333] bg-[#e6f4ea]'
                      }`}>
                        {row.predictedLabel}
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
                    <td className="py-3 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveBatchRow(row.id)}
                        className="p-1 text-[#5f6368] hover:text-[#d93025] rounded-full hover:bg-[#fce8e6] transition cursor-pointer"
                        title="Remove row"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredEmails.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#5f6368]">
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
