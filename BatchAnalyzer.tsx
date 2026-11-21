/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  FileSpreadsheet, FileText, ArrowUpDown, CheckCircle,
  XCircle, Upload, Trash2, Activity, BrainCircuit,
  ChevronLeft, ChevronRight, Eye, EyeOff, Mail, ShieldCheck
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
  CollectiveBackendStats,
  contributeSamplesToBackend,
  GRANULAR_TIER_META,
  loadUserBatchReportMeta,
  loadUserBatchRows,
  loadUserTrainedModel,
  mergeBatchRowsByKey,
  parseDatasetFileContentAsync,
  prepareModelVocabCache,
  saveUserBatchReportMeta,
  saveUserBatchRows,
  syncUserWorkspaceToBackend
} from './src/lib/localMlEngine';
import {
  deleteUserDatasetEmail,
  getFirebaseIdTokenSafely,
  saveUserDatasetEmailsBatch
} from './src/lib/firebase';
import InfoButton from './src/components/InfoButton';

interface BatchAnalyzerProps {
  currentUserUid?: string;
  onAddEmailRecords: (records: EmailRecord[]) => void;
  onSendBatchToTrainer?: (samples: TrainingSample[]) => void;
  onCollectiveModelSynced?: (model: TrainedModelArtifact | null, stats: CollectiveBackendStats | null) => void;
  activeModel?: TrainedModelArtifact | null;
  modelVersion?: number;
  syncTick?: number;
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
  source?: 'csv_upload' | 'trainer_sync';
  metrics: ReturnType<typeof analyzeEmailWithModel>['metrics'];
  topContributors?: { feature: string; contribution: number }[];
}

const TIER_ORDER: GranularThreatTier[] = [
  'complete_legitimate',
  'suspicious',
  'spam',
  'highly_spam',
  'phishing',
  'highly_phishing'
];

function evaluateBatchRow(
  raw: {
    id: string;
    subject: string;
    sender: string;
    body: string;
    rawHeaders?: string;
    actualLabel?: EmailLabel;
    actual?: 'spam' | 'ham';
    granularTier?: GranularThreatTier;
    source?: 'csv_upload' | 'trainer_sync' | string;
  },
  modelOverride?: TrainedModelArtifact | null,
  vocabCacheOverride?: Map<string, number>
): PersistedBatchRow {
  const headers = raw.rawHeaders || `From: ${raw.sender}\nDKIM: Pass\nSPF: Pass`;
  const res = analyzeEmailWithModel(raw.subject, raw.body, headers, raw.sender, modelOverride, vocabCacheOverride);
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
    predictedLabel,
    res.metrics.spamScore,
    res.metrics.phishingLikelihood
  );

  const normalizedSource: 'csv_upload' | 'trainer_sync' =
    raw.source === 'trainer_sync' ? 'trainer_sync' : 'csv_upload';

  return {
    id: raw.id,
    subject: raw.subject,
    sender: raw.sender,
    body: raw.body,
    rawHeaders: headers,
    actual,
    actualLabel,
    granularTier: tierInfo.granularTier,
    predicted,
    predictedLabel,
    score: res.metrics.spamScore,
    phishingLikelihood: res.metrics.phishingLikelihood,
    spf: res.metrics.spfStatus,
    dkim: res.metrics.dkimStatus,
    source: normalizedSource,
    metrics: res.metrics,
    topContributors: res.modelPrediction?.topContributors
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
  onCollectiveModelSynced,
  activeModel,
  modelVersion = 0,
  syncTick = 0
}: BatchAnalyzerProps) {
  const buildInitialRows = (uid?: string): PersistedBatchRow[] => {
    const saved = uid ? loadUserBatchRows(uid) : null;
    if (saved && saved.length > 0) {
      const model = activeModel !== undefined ? activeModel : loadUserTrainedModel(uid);
      const vocabMap = prepareModelVocabCache(model);
      return saved.map(r => (r.metrics && r.predictedLabel ? r : evaluateBatchRow(r, model, vocabMap)));
    }
    return [];
  };

  const [emails, setEmails] = useState<PersistedBatchRow[]>(() => buildInitialRows(currentUserUid));
  const [batchMeta, setBatchMeta] = useState<{ fileName: string; uploadedAt: string; totalRows: number } | null>(() =>
    currentUserUid ? loadUserBatchReportMeta(currentUserUid) : null
  );
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [isSyncingUpload, setIsSyncingUpload] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ pct: number; stage: string } | null>(null);
  const [tablePage, setTablePage] = useState<number>(1);
  const TABLE_PAGE_SIZE = 50;

  // Category report filtering + Each-by-Each inspector state
  const [reportCategoryFilter, setReportCategoryFilter] = useState<'all' | EmailLabel>('all');
  const [reportTierFilter, setReportTierFilter] = useState<'all' | GranularThreatTier>('all');
  const [showEachByEach, setShowEachByEach] = useState<boolean>(true);
  const [inspectorIndex, setInspectorIndex] = useState<number>(0);

  const loadedUidRef = useRef<string | undefined>(currentUserUid);
  const loadedSyncTickRef = useRef<number | undefined>(syncTick);

  // Hydrate cleanly on user UID change; merge additively on async vault sync so uploaded rows never vanish
  useEffect(() => {
    const uidChanged = loadedUidRef.current !== currentUserUid;
    const syncChanged = loadedSyncTickRef.current !== syncTick;
    if (!uidChanged && !syncChanged) return;
    loadedUidRef.current = currentUserUid;
    loadedSyncTickRef.current = syncTick;

    const hydrated = buildInitialRows(currentUserUid);
    if (uidChanged) {
      setEmails(hydrated);
      setBatchMeta(currentUserUid ? loadUserBatchReportMeta(currentUserUid) : null);
      setReportCategoryFilter('all');
      setReportTierFilter('all');
      setInspectorIndex(0);
      setTablePage(1);
    } else {
      setEmails(prev => {
        const merged = mergeBatchRowsByKey(prev, hydrated);
        if (currentUserUid) {
          saveUserBatchRows(currentUserUid, merged);
        }
        return merged;
      });
      setBatchMeta(prevMeta => prevMeta || (currentUserUid ? loadUserBatchReportMeta(currentUserUid) : null));
    }
  }, [currentUserUid, syncTick]);

  // Persist batch rows asynchronously to IndexedDB whenever modified (debounced for 50k+ arrays)
  useEffect(() => {
    if (!currentUserUid) return;
    const timer = setTimeout(() => {
      saveUserBatchRows(currentUserUid, emails);
    }, 120);
    return () => clearTimeout(timer);
  }, [emails, currentUserUid]);

  // Cooperative chunked rescore when model updates so 50k rows never freeze UI thread
  const lastScoredModelSigRef = useRef<string>('');
  useEffect(() => {
    const sig = `${modelVersion}:${activeModel?.version || 0}`;
    if (lastScoredModelSigRef.current === sig) return;
    lastScoredModelSigRef.current = sig;

    let cancelled = false;
    const runRescore = async () => {
      const modelToUse = activeModel !== undefined ? activeModel : loadUserTrainedModel(currentUserUid);
      const vocabMap = prepareModelVocabCache(modelToUse);
      setEmails(prev => {
        if (prev.length === 0) return prev;
        if (prev.length <= 800) {
          return prev.map(r => evaluateBatchRow(r, modelToUse, vocabMap));
        }
        // For huge 50k datasets, schedule cooperative chunked rescore right after return
        setTimeout(async () => {
          const snapshot = prev;
          const rescored: PersistedBatchRow[] = new Array(snapshot.length);
          const CHUNK = 1200;
          for (let i = 0; i < snapshot.length; i++) {
            if (cancelled) return;
            rescored[i] = evaluateBatchRow(snapshot[i], modelToUse, vocabMap);
            if (i > 0 && i % CHUNK === 0) {
              await new Promise(r => setTimeout(r, 0));
            }
          }
          if (!cancelled) {
            setEmails(rescored);
          }
        }, 0);
        return prev;
      });
    };
    void runRescore();
    return () => {
      cancelled = true;
    };
  }, [modelVersion, activeModel, currentUserUid]);

  const [sortField, setSortField] = useState<'subject' | 'score' | 'id'>('score');
  const [sortAsc, setSortAsc] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'spam' | 'ham' | 'fn' | 'fp'>('all');

  // Category Breakdown for on-screen Batch CSV Category Report
  const reportSummary = useMemo(() => {
    const byPredictedClass: Record<EmailLabel, number> = { legitimate: 0, spam: 0, phishing: 0 };
    const byActualClass: Record<EmailLabel, number> = { legitimate: 0, spam: 0, phishing: 0 };
    const byTier: Record<GranularThreatTier, number> = {
      complete_legitimate: 0,
      suspicious: 0,
      spam: 0,
      highly_spam: 0,
      phishing: 0,
      highly_phishing: 0
    };

    emails.forEach(row => {
      byPredictedClass[row.predictedLabel] = (byPredictedClass[row.predictedLabel] || 0) + 1;
      byActualClass[row.actualLabel] = (byActualClass[row.actualLabel] || 0) + 1;
      byTier[row.granularTier] = (byTier[row.granularTier] || 0) + 1;
    });

    return { byPredictedClass, byActualClass, byTier };
  }, [emails]);

  // Filtered emails for Each-by-Each Inspector (driven by clickable Category & Tier Report cards)
  const reportFilteredEmails = useMemo(() => {
    return emails.filter(row => {
      if (reportCategoryFilter !== 'all' && row.predictedLabel !== reportCategoryFilter) return false;
      if (reportTierFilter !== 'all' && row.granularTier !== reportTierFilter) return false;
      return true;
    });
  }, [emails, reportCategoryFilter, reportTierFilter]);

  useEffect(() => {
    if (inspectorIndex >= reportFilteredEmails.length) {
      setInspectorIndex(Math.max(0, reportFilteredEmails.length - 1));
    }
  }, [reportFilteredEmails.length, inspectorIndex]);

  const activeInspectedEmail = reportFilteredEmails[inspectorIndex] || null;

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

  const totalTablePages = Math.max(1, Math.ceil(filteredEmails.length / TABLE_PAGE_SIZE));
  const safeTablePage = Math.min(tablePage, totalTablePages);
  const paginatedEmails = useMemo(() => {
    const start = (safeTablePage - 1) * TABLE_PAGE_SIZE;
    return filteredEmails.slice(start, start + TABLE_PAGE_SIZE);
  }, [filteredEmails, safeTablePage]);

  useEffect(() => {
    setTablePage(1);
  }, [filterType, sortField, sortAsc]);

  // Real ROC curve evaluated across thresholds 100..0 using actual continuous scores
  const rocCurvePoints = useMemo(() => {
    if (emails.length === 0) {
      return [
        { fpr: 0, tpr: 0 },
        { fpr: 100, tpr: 100 }
      ];
    }
    let posTotal = 0;
    let negTotal = 0;
    for (let i = 0; i < emails.length; i++) {
      if (emails[i].actual === 'spam') posTotal++;
      else negTotal++;
    }
    posTotal = posTotal || 1;
    negTotal = negTotal || 1;
    const thresholds = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0];
    const tpCounts = new Array(thresholds.length).fill(0);
    const fpCounts = new Array(thresholds.length).fill(0);
    for (let i = 0; i < emails.length; i++) {
      const e = emails[i];
      for (let t = 0; t < thresholds.length; t++) {
        if (e.score >= thresholds[t]) {
          if (e.actual === 'spam') tpCounts[t]++;
          else fpCounts[t]++;
        }
      }
    }
    const pts = thresholds.map((_th, t) => ({
      fpr: Number(((fpCounts[t] / negTotal) * 100).toFixed(1)),
      tpr: Number(((tpCounts[t] / posTotal) * 100).toFixed(1))
    }));
    return pts.sort((a, b) => a.fpr - b.fpr || a.tpr - b.tpr);
  }, [emails]);

  // Dynamic CSV/JSON Upload handler -> Non-blocking chunked parsing + scoring + IndexedDB & Collective ML Engine
  const handleCSVUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIsSyncingUpload(true);
    setUploadNotice(null);
    setUploadProgress({ pct: 2, stage: `Reading "${file.name}"...` });

    try {
      const text = await file.text();
      const parsed = await parseDatasetFileContentAsync(text, file.name, (pct, parsedCount) => {
        setUploadProgress({
          pct: Math.max(5, Math.round(pct * 0.4)),
          stage: `Parsing CSV rows cleanly (${parsedCount.toLocaleString()} parsed)...`
        });
      });

      if (parsed.length === 0) {
        setUploadNotice('No valid email rows found in uploaded file. Expected columns: subject, body, sender, label.');
        return;
      }

      const stamp = Date.now();
      const trainingSamples: TrainingSample[] = parsed.map((sample, idx) => ({
        ...sample,
        id: `csv-${stamp}-${idx}`
      }));

      // 1. Score all uploaded rows cooperatively on cached model + vocabMap so browser stays smooth at 60fps
      let scoringModel = activeModel !== undefined ? activeModel : loadUserTrainedModel(currentUserUid);
      let vocabMap = prepareModelVocabCache(scoringModel);
      const evaluatedBatch: PersistedBatchRow[] = new Array(trainingSamples.length);
      const SCORE_CHUNK = 1200;

      for (let i = 0; i < trainingSamples.length; i++) {
        const sample = trainingSamples[i];
        evaluatedBatch[i] = evaluateBatchRow(
          {
            id: sample.id,
            subject: sample.subject,
            sender: sample.sender,
            body: sample.body,
            rawHeaders: sample.rawHeaders,
            actualLabel: sample.label,
            granularTier: sample.granularTier,
            source: 'csv_upload'
          },
          scoringModel,
          vocabMap
        );
        if (i > 0 && i % SCORE_CHUNK === 0) {
          const pct = 40 + Math.round((i / trainingSamples.length) * 30);
          setUploadProgress({
            pct,
            stage: `Scoring emails (${i.toLocaleString()} / ${trainingSamples.length.toLocaleString()})...`
          });
          await new Promise(r => setTimeout(r, 0));
        }
      }

      const nextAllRows = mergeBatchRowsByKey(evaluatedBatch, emails);
      setEmails(nextAllRows);
      setTablePage(1);

      const meta = {
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
        totalRows: nextAllRows.length
      };
      setBatchMeta(meta);

      // 2. Persist immediately to local IndexedDB + chunked Backend Workspace
      let syncedStats: CollectiveBackendStats | null = null;
      let syncedModel: TrainedModelArtifact | null = scoringModel || null;
      if (currentUserUid) {
        saveUserBatchRows(currentUserUid, nextAllRows);
        saveUserBatchReportMeta(currentUserUid, meta);
        const idToken = await getFirebaseIdTokenSafely();

        setUploadProgress({
          pct: 72,
          stage: `Syncing ${trainingSamples.length.toLocaleString()} rows in chunks & training collective model...`
        });

        const backendRes = await contributeSamplesToBackend(
          currentUserUid,
          idToken,
          trainingSamples,
          undefined,
          true,
          (uploaded, totalCount) => {
            const subPct = 72 + Math.round((uploaded / Math.max(1, totalCount)) * 22);
            setUploadProgress({
              pct: Math.min(94, subPct),
              stage: `Syncing chunk ${uploaded.toLocaleString()} / ${totalCount.toLocaleString()} to backend corpus...`
            });
          }
        );

        await syncUserWorkspaceToBackend(currentUserUid, idToken, {
          batchRows: nextAllRows,
          batchMeta: meta
        });

        await saveUserDatasetEmailsBatch(
          currentUserUid,
          evaluatedBatch.slice(0, 250).map(r => ({
            id: r.id,
            subject: r.subject,
            sender: r.sender,
            body: r.body,
            rawHeaders: r.rawHeaders || `From: ${r.sender}`,
            label: r.actualLabel,
            granularTier: r.granularTier,
            spamScore: r.score,
            phishingLikelihood: r.phishingLikelihood,
            source: 'csv_upload'
          }))
        );

        if (backendRes.ok) {
          syncedModel = backendRes.model || loadUserTrainedModel(currentUserUid);
          syncedStats = backendRes.stats;
          onCollectiveModelSynced?.(syncedModel, syncedStats);
        }
      }

      setUploadProgress({ pct: 98, stage: 'Updating personal audit vault...' });
      await new Promise(r => setTimeout(r, 0));

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

      setReportCategoryFilter('all');
      setReportTierFilter('all');
      setShowEachByEach(true);
      setInspectorIndex(0);

      let catLeg = 0;
      let catSpam = 0;
      let catPhish = 0;
      for (let i = 0; i < evaluatedBatch.length; i++) {
        const lbl = evaluatedBatch[i].predictedLabel;
        if (lbl === 'legitimate') catLeg++;
        else if (lbl === 'spam') catSpam++;
        else catPhish++;
      }
      setUploadNotice(
        `Uploaded "${file.name}" (${evaluatedBatch.length.toLocaleString()} emails): ${catLeg.toLocaleString()} Legitimate, ${catSpam.toLocaleString()} Spam, ${catPhish.toLocaleString()} Phishing. Saved privately to your Vault${syncedStats ? ` & synced to Collective Backend Model (${syncedStats.totalCombinedEmails.toLocaleString()} combined emails)` : ''}.`
      );
    } catch (err: any) {
      setUploadNotice(err?.message || 'Failed to parse uploaded CSV file.');
    } finally {
      setUploadProgress(null);
      setIsSyncingUpload(false);
    }
  };

  const handleClearBatch = async () => {
    setEmails([]);
    setBatchMeta(null);
    if (currentUserUid) {
      saveUserBatchRows(currentUserUid, []);
      saveUserBatchReportMeta(currentUserUid, null);
      const idToken = await getFirebaseIdTokenSafely();
      await syncUserWorkspaceToBackend(currentUserUid, idToken, {
        batchRows: [],
        batchMeta: null
      });
    }
    setReportCategoryFilter('all');
    setReportTierFilter('all');
    setInspectorIndex(0);
    setUploadNotice('Cleared your Batch CSV workspace view.');
  };

  const handleRemoveBatchRow = async (id: string) => {
    const nextRows = emails.filter(r => r.id !== id);
    setEmails(nextRows);
    if (currentUserUid) {
      saveUserBatchRows(currentUserUid, nextRows);
      const idToken = await getFirebaseIdTokenSafely();
      await syncUserWorkspaceToBackend(currentUserUid, idToken, {
        batchRows: nextRows
      });
      await deleteUserDatasetEmail(currentUserUid, id);
    }
  };

  const handleInspectRowEachByEach = (rowId: string) => {
    setReportCategoryFilter('all');
    setReportTierFilter('all');
    const idx = emails.findIndex(e => e.id === rowId);
    if (idx >= 0) {
      setInspectorIndex(idx);
      setShowEachByEach(true);
    }
  };

  const handleStageUploadedToTrainer = () => {
    if (!onSendBatchToTrainer || emails.length === 0) return;
    const samplesToStage: TrainingSample[] = emails.map((row, idx) => ({
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

  const activeEngineLabel = useMemo(() => {
    if (!activeModel || (activeModel.datasetSize === 0 && activeModel.vocabulary.length === 0)) {
      return 'Baseline Heuristics';
    }
    if (activeModel.ownerUid === 'collective-backend') {
      return `Collective Backend Model (${activeModel.datasetSize} combined msgs · ${(activeModel.evaluation.accuracy * 100).toFixed(1)}% Acc)`;
    }
    return `Personal Trained Model (${activeModel.datasetSize} msgs · ${(activeModel.evaluation.accuracy * 100).toFixed(1)}% Acc)`;
  }, [activeModel]);

  return (
    <div className="space-y-6 animate-fade-in" id="csv-batch-tab">
      {/* 1. Header Information & CSV Upload Bar */}
      <div className="bg-[#f8f9fa] border border-[#dadce0] rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <FileSpreadsheet className="text-[#1a73e8] h-5 w-5" />
            <h3 className="text-base font-medium text-[#202124]">Batch CSV Audit Workspace</h3>
            <InfoButton
              title="Batch CSV Audit Workspace"
              description="Upload CSV/JSON email datasets to generate an instant category report, inspect each email one-by-one, persist records strictly to your private profile, and improve the collective ML classifier."
              align="left"
            />
          </div>
          <p className="text-xs text-[#5f6368] tabular-nums">
            Your Stored Batch Dataset: <strong className="text-[#202124]">{total} emails</strong>
            {batchMeta?.fileName ? ` · Latest: ${batchMeta.fileName}` : ''}
          </p>
        </div>

        {/* File actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs text-[#5f6368]">
            Model:{' '}
            <strong className={activeModel && (activeModel.datasetSize > 0 || activeModel.vocabulary.length > 0) ? 'text-[#137333]' : 'text-[#1a73e8]'}>
              {activeEngineLabel}
            </strong>
          </span>

          <label className="cursor-pointer bg-[#1a73e8] hover:bg-[#1557b0] text-white font-medium text-xs px-4 py-2 rounded-full flex items-center space-x-2 transition shadow-2xs">
            <Upload className="h-3.5 w-3.5" />
            <span>{isSyncingUpload ? 'Uploading & Training...' : 'Upload Email CSV'}</span>
            <input
              type="file"
              accept=".csv,.json"
              onChange={handleCSVUpload}
              disabled={isSyncingUpload}
              className="hidden"
            />
          </label>

          {onSendBatchToTrainer && emails.length > 0 && (
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

          {emails.length > 0 && (
            <button
              type="button"
              onClick={handleClearBatch}
              className="px-3.5 py-2 bg-white hover:bg-[#fce8e6] text-[#d93025] border border-[#dadce0] rounded-full text-xs font-medium transition flex items-center gap-1.5 cursor-pointer"
              title="Clear saved batch dataset view"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear Batch</span>
            </button>
          )}
        </div>
      </div>

      {uploadProgress && (
        <div className="p-4 bg-white border border-[#1a73e8]/40 rounded-xl space-y-2 shadow-2xs" id="batch-upload-progress">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-[#1a73e8]">{uploadProgress.stage}</span>
            <span className="font-mono font-semibold text-[#1a73e8]">{uploadProgress.pct}%</span>
          </div>
          <div className="w-full h-2 bg-[#e8f0fe] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#1a73e8] transition-all duration-150"
              style={{ width: `${uploadProgress.pct}%` }}
            />
          </div>
        </div>
      )}

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

      {/* Empty Blank State (No Pre-Made Emails) */}
      {emails.length === 0 ? (
        <div className="bg-white border border-dashed border-[#dadce0] rounded-2xl p-10 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-[#e8f0fe] text-[#1a73e8] flex items-center justify-center mx-auto">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h4 className="text-sm font-medium text-[#202124]">Your Batch CSV Dataset Starts Blank</h4>
            <p className="text-xs text-[#5f6368] leading-relaxed">
              Upload any CSV or JSON email file (with <code className="font-mono text-[#1a73e8]">subject, body, sender, label</code>) to generate a full category breakdown report, inspect emails one-by-one, save them to your private Vault, and train the backend model.
            </p>
          </div>
          <label className="inline-flex cursor-pointer bg-[#1a73e8] hover:bg-[#1557b0] text-white font-medium text-xs px-5 py-2.5 rounded-full items-center space-x-2 transition shadow-2xs">
            <Upload className="h-4 w-4" />
            <span>Upload Your First CSV / JSON Dataset</span>
            <input
              type="file"
              accept=".csv,.json"
              onChange={handleCSVUpload}
              disabled={isSyncingUpload}
              className="hidden"
            />
          </label>
        </div>
      ) : (
        <>
          {/* 2. ON-SCREEN BATCH CSV CATEGORY REPORT + EACH-BY-EACH INSPECTOR */}
          <div className="bg-white border border-[#dadce0] rounded-2xl p-5 sm:p-6 space-y-5" id="batch-category-report">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#dadce0]">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-[#137333]" />
                  <h4 className="text-sm sm:text-base font-medium text-[#202124]">
                    Batch CSV Category Report {batchMeta?.fileName ? `— ${batchMeta.fileName}` : ''}
                  </h4>
                  <InfoButton
                    title="Generated CSV Category Report"
                    description="Summarizes predicted and actual email counts across core categories (Legitimate, Spam, Phishing) and 6 granular threat tiers. Click any category card to filter the each-by-each email viewer."
                    align="left"
                  />
                </div>
                <p className="text-xs text-[#5f6368] tabular-nums">
                  Evaluated <strong>{total}</strong> email(s) &middot; Accuracy: <strong className="text-[#137333]">{accuracy}%</strong> &middot; Precision: <strong className="text-[#1a73e8]">{precision}%</strong> &middot; Recall: <strong className="text-[#1e8e3e]">{recall}%</strong>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(reportCategoryFilter !== 'all' || reportTierFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setReportCategoryFilter('all');
                      setReportTierFilter('all');
                      setInspectorIndex(0);
                    }}
                    className="px-3 py-1.5 bg-[#f8f9fa] hover:bg-[#f1f3f4] text-[#1a73e8] border border-[#dadce0] rounded-full text-xs font-medium cursor-pointer"
                  >
                    Clear Filter ({total})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowEachByEach(prev => !prev)}
                  className={`px-4 py-2 rounded-full text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
                    showEachByEach
                      ? 'bg-[#e8f0fe] text-[#1967d2] border border-[#aecbfa]'
                      : 'bg-[#1a73e8] text-white hover:bg-[#1557b0]'
                  }`}
                  id="toggle-each-by-each-btn"
                >
                  {showEachByEach ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showEachByEach ? 'Hide Each-by-Each Viewer' : `Show Emails Each-by-Each (${reportFilteredEmails.length})`}</span>
                </button>
              </div>
            </div>

            {/* Primary 3-Category Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 tabular-nums">
              <button
                type="button"
                onClick={() => {
                  setReportCategoryFilter(prev => (prev === 'legitimate' ? 'all' : 'legitimate'));
                  setReportTierFilter('all');
                  setInspectorIndex(0);
                  setShowEachByEach(true);
                }}
                className={`p-4 rounded-xl border text-left transition cursor-pointer ${
                  reportCategoryFilter === 'legitimate'
                    ? 'bg-[#e6f4ea] border-[#137333] ring-2 ring-[#137333]/30'
                    : 'bg-[#e6f4ea]/60 border-[#a8dab5] hover:bg-[#e6f4ea]'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-medium text-[#137333]">
                  <span>Legitimate Emails</span>
                  <span>{((reportSummary.byPredictedClass.legitimate / Math.max(1, total)) * 100).toFixed(1)}%</span>
                </div>
                <div className="text-2xl font-semibold font-mono text-[#137333] mt-1">
                  {reportSummary.byPredictedClass.legitimate}
                </div>
                <span className="text-[11px] text-[#137333]/80 block mt-0.5">
                  Labeled Legit: {reportSummary.byActualClass.legitimate}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setReportCategoryFilter(prev => (prev === 'spam' ? 'all' : 'spam'));
                  setReportTierFilter('all');
                  setInspectorIndex(0);
                  setShowEachByEach(true);
                }}
                className={`p-4 rounded-xl border text-left transition cursor-pointer ${
                  reportCategoryFilter === 'spam'
                    ? 'bg-[#fef7e0] border-[#b06000] ring-2 ring-[#b06000]/30'
                    : 'bg-[#fef7e0]/60 border-[#fde293] hover:bg-[#fef7e0]'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-medium text-[#b06000]">
                  <span>Spam Emails</span>
                  <span>{((reportSummary.byPredictedClass.spam / Math.max(1, total)) * 100).toFixed(1)}%</span>
                </div>
                <div className="text-2xl font-semibold font-mono text-[#b06000] mt-1">
                  {reportSummary.byPredictedClass.spam}
                </div>
                <span className="text-[11px] text-[#b06000]/80 block mt-0.5">
                  Labeled Spam: {reportSummary.byActualClass.spam}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setReportCategoryFilter(prev => (prev === 'phishing' ? 'all' : 'phishing'));
                  setReportTierFilter('all');
                  setInspectorIndex(0);
                  setShowEachByEach(true);
                }}
                className={`p-4 rounded-xl border text-left transition cursor-pointer ${
                  reportCategoryFilter === 'phishing'
                    ? 'bg-[#fce8e6] border-[#c5221f] ring-2 ring-[#c5221f]/30'
                    : 'bg-[#fce8e6]/60 border-[#fad2cf] hover:bg-[#fce8e6]'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-medium text-[#c5221f]">
                  <span>Phishing Emails</span>
                  <span>{((reportSummary.byPredictedClass.phishing / Math.max(1, total)) * 100).toFixed(1)}%</span>
                </div>
                <div className="text-2xl font-semibold font-mono text-[#c5221f] mt-1">
                  {reportSummary.byPredictedClass.phishing}
                </div>
                <span className="text-[11px] text-[#c5221f]/80 block mt-0.5">
                  Labeled Phishing: {reportSummary.byActualClass.phishing}
                </span>
              </button>
            </div>

            {/* 6 Granular Severity Tier Breakdown Cards */}
            <div className="space-y-2">
              <span className="text-xs font-medium text-[#5f6368] block">
                Granular Risk Category Distribution (Click any tier to step through those emails)
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 tabular-nums">
                {TIER_ORDER.map(tier => {
                  const count = reportSummary.byTier[tier] || 0;
                  const pct = ((count / Math.max(1, total)) * 100).toFixed(0);
                  const active = reportTierFilter === tier;
                  return (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => {
                        setReportTierFilter(prev => (prev === tier ? 'all' : tier));
                        setReportCategoryFilter('all');
                        setInspectorIndex(0);
                        setShowEachByEach(true);
                      }}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                        active
                          ? 'ring-2 ring-[#1a73e8] border-[#1a73e8] bg-[#e8f0fe]/40'
                          : 'bg-[#f8f9fa] border-[#dadce0] hover:bg-[#f1f3f4]'
                      }`}
                    >
                      <span className="text-[10px] font-medium text-[#5f6368] block truncate">
                        {GRANULAR_TIER_META[tier].label}
                      </span>
                      <div className="flex items-baseline justify-between mt-1">
                        <span className="text-lg font-semibold font-mono text-[#202124]">{count}</span>
                        <span className="text-[10px] font-mono text-[#5f6368]">{pct}%</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Interactive Each-by-Each Email Viewer */}
            {showEachByEach && (
              <div className="bg-[#f8f9fa] border border-[#dadce0] rounded-2xl p-4 sm:p-5 space-y-4" id="each-by-each-email-viewer">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#dadce0] pb-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-[#202124]">
                    <Mail className="w-4 h-4 text-[#1a73e8]" />
                    <span>
                      Each-by-Each Email Inspector
                      {reportCategoryFilter !== 'all' ? ` · Category: ${reportCategoryFilter}` : ''}
                      {reportTierFilter !== 'all' ? ` · Tier: ${GRANULAR_TIER_META[reportTierFilter].label}` : ''}
                    </span>
                  </div>

                  {reportFilteredEmails.length > 0 && (
                    <div className="flex items-center gap-2 tabular-nums">
                      <button
                        type="button"
                        onClick={() => setInspectorIndex(i => Math.max(0, i - 1))}
                        disabled={inspectorIndex <= 0}
                        className="px-3 py-1.5 bg-white hover:bg-[#f1f3f4] disabled:opacity-40 border border-[#dadce0] rounded-full text-xs font-medium flex items-center gap-1 cursor-pointer"
                        id="each-prev-btn"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>Previous</span>
                      </button>
                      <span className="text-xs font-mono text-[#202124] px-2">
                        Email <strong>{inspectorIndex + 1}</strong> of <strong>{reportFilteredEmails.length}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => setInspectorIndex(i => Math.min(reportFilteredEmails.length - 1, i + 1))}
                        disabled={inspectorIndex >= reportFilteredEmails.length - 1}
                        className="px-3 py-1.5 bg-white hover:bg-[#f1f3f4] disabled:opacity-40 border border-[#dadce0] rounded-full text-xs font-medium flex items-center gap-1 cursor-pointer"
                        id="each-next-btn"
                      >
                        <span>Next</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {activeInspectedEmail ? (
                  <div className="bg-white border border-[#dadce0] rounded-xl p-4 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <h5 className="text-sm font-medium text-[#202124] break-words">
                          {activeInspectedEmail.subject}
                        </h5>
                        <p className="text-xs font-mono text-[#5f6368] break-all">
                          From: {activeInspectedEmail.sender}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <span className={`px-2.5 py-1 rounded-full border text-[11px] font-medium ${getTierBadgeStyle(activeInspectedEmail.granularTier)}`}>
                          {GRANULAR_TIER_META[activeInspectedEmail.granularTier].label}
                        </span>
                        <span className={`px-2.5 py-1 rounded-full text-[11px] uppercase font-semibold ${
                          activeInspectedEmail.predictedLabel === 'phishing'
                            ? 'bg-[#fce8e6] text-[#c5221f]'
                            : activeInspectedEmail.predictedLabel === 'spam'
                            ? 'bg-[#fef7e0] text-[#b06000]'
                            : 'bg-[#e6f4ea] text-[#137333]'
                        }`}>
                          Predicted: {activeInspectedEmail.predictedLabel}
                        </span>
                        <span className="px-2.5 py-1 rounded-full bg-[#f1f3f4] text-[#3c4043] text-[11px] uppercase font-medium">
                          Actual: {activeInspectedEmail.actualLabel}
                        </span>
                      </div>
                    </div>

                    {/* Key Metrics Strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs tabular-nums">
                      <div className="bg-[#f8f9fa] border border-[#dadce0] rounded-lg p-2.5">
                        <span className="text-[10px] text-[#5f6368] block">Spam Risk Score</span>
                        <strong className={`text-sm font-mono ${activeInspectedEmail.score >= 50 ? 'text-[#d93025]' : 'text-[#137333]'}`}>
                          {activeInspectedEmail.score}%
                        </strong>
                      </div>
                      <div className="bg-[#f8f9fa] border border-[#dadce0] rounded-lg p-2.5">
                        <span className="text-[10px] text-[#5f6368] block">Phishing Likelihood</span>
                        <strong className={`text-sm font-mono ${activeInspectedEmail.phishingLikelihood >= 55 ? 'text-[#d93025]' : 'text-[#202124]'}`}>
                          {activeInspectedEmail.phishingLikelihood}%
                        </strong>
                      </div>
                      <div className="bg-[#f8f9fa] border border-[#dadce0] rounded-lg p-2.5">
                        <span className="text-[10px] text-[#5f6368] block">SPF / DKIM</span>
                        <strong className="text-xs font-mono text-[#202124]">
                          {activeInspectedEmail.spf} / {activeInspectedEmail.dkim}
                        </strong>
                      </div>
                      <div className="bg-[#f8f9fa] border border-[#dadce0] rounded-lg p-2.5">
                        <span className="text-[10px] text-[#5f6368] block">Outcome</span>
                        <strong className={`text-xs font-mono ${activeInspectedEmail.actual === activeInspectedEmail.predicted ? 'text-[#137333]' : 'text-[#d93025]'}`}>
                          {activeInspectedEmail.actual === activeInspectedEmail.predicted ? 'MATCH (Accurate)' : 'MISMATCH'}
                        </strong>
                      </div>
                    </div>

                    {/* Full Email Body */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-medium text-[#5f6368] block">Email Body Content</span>
                      <div className="bg-[#f8f9fa] border border-[#dadce0] rounded-xl p-3.5 text-xs text-[#202124] whitespace-pre-wrap leading-relaxed max-h-44 overflow-y-auto">
                        {activeInspectedEmail.body || '(Empty message body)'}
                      </div>
                    </div>

                    {/* Top Model Signals */}
                    {activeInspectedEmail.topContributors && activeInspectedEmail.topContributors.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#f1f3f4] text-[11px] font-mono">
                        <span className="text-[#5f6368] font-sans font-medium">Top Model Signals:</span>
                        {activeInspectedEmail.topContributors.slice(0, 5).map(c => (
                          <span key={c.feature} className="px-2 py-0.5 bg-[#e8f0fe] text-[#1967d2] rounded-md">
                            {c.feature}: {c.contribution >= 0 ? `+${c.contribution}` : c.contribution}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-white border border-[#dadce0] rounded-xl p-6 text-center text-xs text-[#5f6368]">
                    No emails match the active category filter. Click "Clear Filter" above to view all uploaded emails.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3. Model Confusion Matrix & ROC plots */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
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

          {/* 4. Interactive CSV Row Table layout */}
          <div className="bg-white border border-[#dadce0] rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-[#dadce0] flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#f8f9fa]">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium text-[#202124]">Row Scan Record Inventory</h4>
                <InfoButton
                  title="Row Scan Record Inventory"
                  description="Click any row's Inspect button to jump directly to it in the each-by-each viewer, or sort/filter uploaded records."
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
                    <th className="py-3 px-4 text-center">Outcome</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f3f4]">
                  {paginatedEmails.map(row => {
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
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleInspectRowEachByEach(row.id)}
                            className="px-2 py-1 text-[11px] text-[#1a73e8] hover:bg-[#e8f0fe] rounded-full mr-1 cursor-pointer"
                            title="Inspect in each-by-each viewer"
                          >
                            Inspect
                          </button>
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

            {filteredEmails.length > TABLE_PAGE_SIZE && (
              <div className="px-5 py-3 border-t border-[#dadce0] bg-[#f8f9fa] flex flex-wrap items-center justify-between gap-3 text-xs">
                <span className="text-[#5f6368] tabular-nums">
                  Showing{' '}
                  <strong className="text-[#202124]">
                    {((safeTablePage - 1) * TABLE_PAGE_SIZE + 1).toLocaleString()}
                  </strong>
                  {' '}to{' '}
                  <strong className="text-[#202124]">
                    {Math.min(safeTablePage * TABLE_PAGE_SIZE, filteredEmails.length).toLocaleString()}
                  </strong>
                  {' '}of{' '}
                  <strong className="text-[#202124]">{filteredEmails.length.toLocaleString()}</strong> rows
                </span>
                <div className="flex items-center gap-1.5 tabular-nums">
                  <button
                    type="button"
                    onClick={() => setTablePage(1)}
                    disabled={safeTablePage <= 1}
                    className="px-2.5 py-1 bg-white hover:bg-[#f1f3f4] disabled:opacity-40 border border-[#dadce0] rounded-full font-medium cursor-pointer"
                  >
                    First
                  </button>
                  <button
                    type="button"
                    onClick={() => setTablePage(p => Math.max(1, p - 1))}
                    disabled={safeTablePage <= 1}
                    className="px-3 py-1 bg-white hover:bg-[#f1f3f4] disabled:opacity-40 border border-[#dadce0] rounded-full font-medium flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Prev</span>
                  </button>
                  <span className="px-2 font-mono text-[#202124]">
                    Page <strong>{safeTablePage}</strong> / {totalTablePages.toLocaleString()}
                  </span>
                  <button
                    type="button"
                    onClick={() => setTablePage(p => Math.min(totalTablePages, p + 1))}
                    disabled={safeTablePage >= totalTablePages}
                    className="px-3 py-1 bg-white hover:bg-[#f1f3f4] disabled:opacity-40 border border-[#dadce0] rounded-full font-medium flex items-center gap-1 cursor-pointer"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTablePage(totalTablePages)}
                    disabled={safeTablePage >= totalTablePages}
                    className="px-2.5 py-1 bg-white hover:bg-[#f1f3f4] disabled:opacity-40 border border-[#dadce0] rounded-full font-medium cursor-pointer"
                  >
                    Last
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
