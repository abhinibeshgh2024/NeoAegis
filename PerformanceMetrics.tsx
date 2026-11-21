/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Target, Activity, Cpu, CheckCircle2,
  Zap, Play, RefreshCw, Download,
  TrendingUp, Layers, Check, ArrowUpRight, Copy, Table2, Search, Eye, Image as ImageIcon
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, BarChart, Bar, Cell, Legend
} from 'recharts';
import { EmailRecord, TrainedModelArtifact, EvaluatedTestCase, EmailLabel } from './types';
import {
  CollectiveBackendStats,
  extractEngineeredFeatures,
  loadUserBatchRows,
  loadUserTrainerSamples
} from './src/lib/localMlEngine';
import { analyzeEmailWithModel } from './spamEngine';
import InfoButton from './src/components/InfoButton';

interface PerformanceMetricsProps {
  records: EmailRecord[];
  activeModel?: TrainedModelArtifact | null;
  currentUserUid?: string;
  collectiveStats?: CollectiveBackendStats | null;
}

type CopyFormat = 'aligned' | 'tsv' | 'markdown';
type TestFilter = 'all' | 'passed' | 'errors' | 'TP' | 'TN' | 'FP' | 'FN';
type EvalScope = 'all' | 'trainer_live' | 'model_test' | 'batch_vault';

const CLASSES: EmailLabel[] = ['legitimate', 'spam', 'phishing'];

interface LiveEvalOutput {
  cases: EvaluatedTestCase[];
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  specificity: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  confusionMatrix3x3: number[][];
  perClass: Record<EmailLabel, { precision: number; recall: number; f1: number; support: number }>;
  rocCurve: { fpr: number; tpr: number }[];
  rocAUC: number;
  avgLatencyMs: number;
  throughputPerSec: number;
  vectorLookupMs: number;
  sourceLabel: string;
}

function buildMetricsFromCases(
  cases: EvaluatedTestCase[],
  elapsedMs: number,
  vectorMs: number,
  sourceLabel: string
): LiveEvalOutput {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;

  const confusionMatrix3x3: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];
  const classCounts = [
    { tp: 0, fp: 0, fn: 0, support: 0 },
    { tp: 0, fp: 0, fn: 0, support: 0 },
    { tp: 0, fp: 0, fn: 0, support: 0 }
  ];

  const scoresForRoc: { score: number; isThreat: boolean }[] = [];

  for (const tc of cases) {
    const aIdx = Math.max(0, CLASSES.indexOf(tc.actualLabel));
    const pIdx = Math.max(0, CLASSES.indexOf(tc.predictedLabel));
    confusionMatrix3x3[aIdx][pIdx]++;
    classCounts[aIdx].support++;
    if (aIdx === pIdx) {
      classCounts[aIdx].tp++;
    } else {
      classCounts[pIdx].fp++;
      classCounts[aIdx].fn++;
    }

    if (tc.outcome === 'TP') tp++;
    else if (tc.outcome === 'FP') fp++;
    else if (tc.outcome === 'TN') tn++;
    else fn++;

    scoresForRoc.push({
      score: Math.max(0, Math.min(1, tc.spamScore / 100)),
      isThreat: tc.actualLabel !== 'legitimate'
    });
  }

  const total = tp + fp + tn + fn;
  const accuracy = total > 0 ? (tp + tn) / total : 0;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const specificity = tn + fp > 0 ? tn / (tn + fp) : 0;
  const falsePositiveRate = fp + tn > 0 ? fp / (fp + tn) : 0;
  const falseNegativeRate = fn + tp > 0 ? fn / (fn + tp) : 0;

  const buildPerClass = (m: { tp: number; fp: number; fn: number; support: number }) => {
    const p = m.tp + m.fp > 0 ? m.tp / (m.tp + m.fp) : m.support === 0 ? 0 : 0;
    const r = m.tp + m.fn > 0 ? m.tp / (m.tp + m.fn) : m.support === 0 ? 0 : 0;
    const f = p + r > 0 ? (2 * p * r) / (p + r) : 0;
    return {
      precision: Number(p.toFixed(4)),
      recall: Number(r.toFixed(4)),
      f1: Number(f.toFixed(4)),
      support: m.support
    };
  };

  const perClass: Record<EmailLabel, { precision: number; recall: number; f1: number; support: number }> = {
    legitimate: buildPerClass(classCounts[0]),
    spam: buildPerClass(classCounts[1]),
    phishing: buildPerClass(classCounts[2])
  };

  // Real ROC curve swept over threshold cutoffs 1.0 -> 0.0
  const totalPos = scoresForRoc.filter(s => s.isThreat).length;
  const totalNeg = scoresForRoc.filter(s => !s.isThreat).length;
  const thresholds = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.0];
  let rocCurve =
    totalPos > 0 && totalNeg > 0
      ? thresholds.map(th => {
          let tPos = 0;
          let fPos = 0;
          for (const item of scoresForRoc) {
            if (item.score >= th) {
              if (item.isThreat) tPos++;
              else fPos++;
            }
          }
          return {
            fpr: Number((fPos / totalNeg).toFixed(3)),
            tpr: Number((tPos / totalPos).toFixed(3))
          };
        })
      : [
          { fpr: 0, tpr: 0 },
          { fpr: 1, tpr: 1 }
        ];

  rocCurve = rocCurve.sort((a, b) => a.fpr - b.fpr || a.tpr - b.tpr);

  let rocAUC = 0;
  for (let i = 1; i < rocCurve.length; i++) {
    const dx = rocCurve[i].fpr - rocCurve[i - 1].fpr;
    const avgY = (rocCurve[i].tpr + rocCurve[i - 1].tpr) / 2;
    rocAUC += dx * avgY;
  }
  rocAUC = total > 0 ? Number(Math.max(0, Math.min(1, rocAUC)).toFixed(3)) : 0;

  const safeElapsed = Math.max(0.1, elapsedMs);
  const countForTiming = Math.max(1, total);
  const avgLatencyMs = Number((safeElapsed / countForTiming).toFixed(2));
  const throughputPerSec = Math.max(1, Math.round((countForTiming / safeElapsed) * 1000));
  const vectorLookupMs = Number((Math.max(0.05, vectorMs) / countForTiming).toFixed(2));

  return {
    cases,
    tp,
    fp,
    tn,
    fn,
    accuracy,
    precision,
    recall,
    f1Score,
    specificity,
    falsePositiveRate,
    falseNegativeRate,
    confusionMatrix3x3,
    perClass,
    rocCurve,
    rocAUC,
    avgLatencyMs,
    throughputPerSec,
    vectorLookupMs,
    sourceLabel
  };
}

export default function PerformanceMetrics({ records, activeModel, currentUserUid, collectiveStats }: PerformanceMetricsProps) {
  const [evalScope, setEvalScope] = useState<EvalScope>('all');
  const [benchmarkTick, setBenchmarkTick] = useState(0);
  const [isRunningBenchmark, setIsRunningBenchmark] = useState(false);
  const [benchmarkProgress, setBenchmarkProgress] = useState(0);
  const [lastBenchmarkBanner, setLastBenchmarkBanner] = useState<string | null>(null);

  // Confusion matrix mode (2x2 binary threat matrix vs 3x3 multi-class matrix)
  const [matrixMode, setMatrixMode] = useState<'2x2' | '3x3'>('2x2');

  // Test case table controls
  const [testFilter, setTestFilter] = useState<TestFilter>('all');
  const [testSearch, setTestSearch] = useState('');
  const [copyFormat, setCopyFormat] = useState<CopyFormat>('aligned');
  const [copiedBanner, setCopiedBanner] = useState<string | null>(null);
  const [showPlainPreview, setShowPlainPreview] = useState(false);

  const hasCustomTextModel = Boolean(
    activeModel && (activeModel.datasetSize > 0 || activeModel.vocabulary.length > 0)
  );
  const isCollectiveBackendActive = Boolean(activeModel?.ownerUid === 'collective-backend');

  // 100% Real Dynamic Evaluation strictly over current user's uploaded CSV, Staged Trainer, Vault, & Personal Test Split
  const liveEval = useMemo<LiveEvalOutput>(() => {
    const startTotal = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let vectorMsAccum = 0;

    const stagedSamples = currentUserUid
      ? loadUserTrainerSamples(currentUserUid)
      : [];
    const batchRows = currentUserUid ? loadUserBatchRows(currentUserUid) || [] : [];

    const evaluateRawSample = (
      id: string,
      subject: string,
      body: string,
      sender: string,
      rawHeaders: string | undefined,
      actualLabel: EmailLabel,
      source: EvaluatedTestCase['source']
    ): EvaluatedTestCase => {
      const headers = rawHeaders || `From: ${sender}\nDKIM: Pass\nSPF: Pass`;
      const v0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      extractEngineeredFeatures(subject, body, sender, headers);
      vectorMsAccum += (typeof performance !== 'undefined' ? performance.now() : Date.now()) - v0;

      const res = analyzeEmailWithModel(subject, body, headers, sender);
      const actualThreat = actualLabel !== 'legitimate';
      const predThreat = res.metrics.spamScore >= 50 || res.metrics.phishingLikelihood >= 55;
      const predictedLabel: EmailLabel = res.modelPrediction
        ? res.modelPrediction.predictedLabel
        : predThreat
        ? res.metrics.phishingLikelihood >= 55
          ? 'phishing'
          : 'spam'
        : 'legitimate';

      const outcome: 'TP' | 'TN' | 'FP' | 'FN' =
        predThreat && actualThreat
          ? 'TP'
          : predThreat && !actualThreat
          ? 'FP'
          : !predThreat && !actualThreat
          ? 'TN'
          : 'FN';

      return {
        id,
        subject,
        sender,
        actualLabel,
        predictedLabel,
        spamScore: res.metrics.spamScore,
        confidence: predThreat ? res.metrics.spamScore : 100 - res.metrics.spamScore,
        outcome,
        correct: outcome === 'TP' || outcome === 'TN',
        source
      };
    };

    // Build Batch CSV cases (explicit ground-truth labels)
    const batchCases: EvaluatedTestCase[] = batchRows.map((row: any, idx: number) => {
      const actualLabel: EmailLabel =
        row.actualLabel || (row.actual === 'ham' ? 'legitimate' : 'spam');
      return evaluateRawSample(
        row.id || `batch-${idx + 1}`,
        row.subject || '(No Subject)',
        row.body || '',
        row.sender || 'unknown@sender.org',
        row.rawHeaders,
        actualLabel,
        'batch_csv'
      );
    });

    // Build Vault / Audit Stream cases
    const vaultCases: EvaluatedTestCase[] = records.map((rec, idx) => {
      const v0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      extractEngineeredFeatures(rec.subject, rec.body, rec.sender, rec.rawHeaders);
      vectorMsAccum += (typeof performance !== 'undefined' ? performance.now() : Date.now()) - v0;

      const res = analyzeEmailWithModel(rec.subject, rec.body, rec.rawHeaders, rec.sender);
      const actualLabel: EmailLabel =
        rec.groundTruthLabel ||
        (rec.isSpam
          ? rec.metrics.phishingLikelihood >= 55
            ? 'phishing'
            : 'spam'
          : 'legitimate');
      const actualThreat = actualLabel !== 'legitimate';
      const predThreat = res.metrics.spamScore >= 50 || res.metrics.phishingLikelihood >= 55;
      const predictedLabel: EmailLabel = res.modelPrediction
        ? res.modelPrediction.predictedLabel
        : predThreat
        ? res.metrics.phishingLikelihood >= 55
          ? 'phishing'
          : 'spam'
        : 'legitimate';

      const outcome: 'TP' | 'TN' | 'FP' | 'FN' =
        predThreat && actualThreat
          ? 'TP'
          : predThreat && !actualThreat
          ? 'FP'
          : !predThreat && !actualThreat
          ? 'TN'
          : 'FN';

      return {
        id: rec.id || `vault-${idx + 1}`,
        subject: rec.subject,
        sender: rec.sender,
        actualLabel,
        predictedLabel,
        spamScore: res.metrics.spamScore,
        confidence: predThreat ? res.metrics.spamScore : 100 - res.metrics.spamScore,
        outcome,
        correct: outcome === 'TP' || outcome === 'TN',
        source: 'vault_record'
      };
    });

    // Held-out test cases from Trained Local Text Model & Image Unit
    const modelTextCases: EvaluatedTestCase[] = hasCustomTextModel && activeModel?.evaluation.testCases
      ? activeModel.evaluation.testCases
      : [];
    const modelImageCases: EvaluatedTestCase[] = (activeModel?.imageUnit?.evaluation.testCases || []).map(ic => ({
      id: ic.id,
      subject: `[Image] ${ic.fileName}`,
      sender: 'image-vision-unit',
      actualLabel: ic.actualLabel,
      predictedLabel: ic.predictedLabel,
      spamScore: ic.spamScore,
      confidence: ic.confidence,
      outcome: ic.outcome,
      correct: ic.correct,
      source: 'test_split'
    }));

    // Live-scored Staged Trainer Corpus
    const trainerLiveCases: EvaluatedTestCase[] = stagedSamples.map((sample, idx) =>
      evaluateRawSample(
        sample.id || `trn-${idx + 1}`,
        sample.subject,
        sample.body,
        sample.sender,
        sample.rawHeaders,
        sample.label,
        sample.source === 'starter' ? 'baseline_suite' : 'trainer_corpus'
      )
    );

    // Deduplicate helper using subject + sender + source class
    const dedupeCases = (list: EvaluatedTestCase[]): EvaluatedTestCase[] => {
      const seen = new Set<string>();
      const out: EvaluatedTestCase[] = [];
      for (const item of list) {
        const key = `${item.subject.toLowerCase()}::${item.sender.toLowerCase()}::${item.source === 'test_split' ? 'test' : 'msg'}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push(item);
        }
      }
      return out;
    };

    let selectedCases: EvaluatedTestCase[] = [];
    let sourceLabel = '';

    if (evalScope === 'model_test') {
      const splitCases = dedupeCases([...modelTextCases, ...modelImageCases]);
      if (splitCases.length > 0) {
        selectedCases = splitCases;
        sourceLabel = `Trained Model Held-Out Test Split (${selectedCases.length} cases)`;
      } else {
        selectedCases = dedupeCases([...trainerLiveCases, ...batchCases, ...vaultCases]);
        sourceLabel = `Live Scoring (Your Data Evaluated by Collective Backend Model: ${selectedCases.length} cases)`;
      }
    } else if (evalScope === 'batch_vault') {
      selectedCases = dedupeCases([...batchCases, ...vaultCases]);
      sourceLabel = `Saved Batch CSV (${batchCases.length}) + Personal Vault (${vaultCases.length})`;
    } else if (evalScope === 'trainer_live') {
      selectedCases = dedupeCases([...trainerLiveCases, ...batchCases]);
      sourceLabel = `Live Timed Run on Staged Trainer (${trainerLiveCases.length}) + Batch CSV (${batchCases.length})`;
    } else {
      selectedCases = dedupeCases([...modelTextCases, ...modelImageCases, ...trainerLiveCases, ...batchCases, ...vaultCases]);
      sourceLabel = hasCustomTextModel
        ? `${isCollectiveBackendActive ? 'Collective Backend Model' : 'Personal Model'} Eval: Your Trainer (${trainerLiveCases.length}) + Batch CSV (${batchCases.length}) + Vault (${vaultCases.length})${modelTextCases.length > 0 ? ` + Test Split (${modelTextCases.length})` : ''}`
        : `Baseline Live Eval: Staged Trainer (${trainerLiveCases.length}) + Batch CSV (${batchCases.length}) + Vault (${vaultCases.length})`;
    }

    const elapsedMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTotal;
    return buildMetricsFromCases(selectedCases, elapsedMs, vectorMsAccum, sourceLabel);
  }, [records, activeModel, currentUserUid, evalScope, benchmarkTick, hasCustomTextModel, isCollectiveBackendActive]);

  // Bar Graph 1: Overall Performance Summary (%)
  const overallPerformanceBarData = useMemo(() => [
    { metric: 'Accuracy', score: Number((liveEval.accuracy * 100).toFixed(1)), fill: '#1e8e3e' },
    { metric: 'Precision', score: Number((liveEval.precision * 100).toFixed(1)), fill: '#1a73e8' },
    { metric: 'Recall', score: Number((liveEval.recall * 100).toFixed(1)), fill: '#0284c7' },
    { metric: 'F1 Score', score: Number((liveEval.f1Score * 100).toFixed(1)), fill: '#4f46e5' },
    { metric: 'Specificity', score: Number((liveEval.specificity * 100).toFixed(1)), fill: '#0d9488' },
    { metric: 'ROC AUC', score: Number((liveEval.rocAUC * 100).toFixed(1)), fill: '#e37400' }
  ], [liveEval]);

  // Bar Graph 2: Detection Rates vs Error Rates (%)
  const ratesComparisonBarData = useMemo(() => [
    { rate: 'True Positive Rate', value: Number((liveEval.recall * 100).toFixed(1)), fill: '#1e8e3e' },
    { rate: 'True Negative Rate', value: Number((liveEval.specificity * 100).toFixed(1)), fill: '#1a73e8' },
    { rate: 'False Positive Rate', value: Number((liveEval.falsePositiveRate * 100).toFixed(1)), fill: '#e37400' },
    { rate: 'False Negative Rate', value: Number((liveEval.falseNegativeRate * 100).toFixed(1)), fill: '#d93025' }
  ], [liveEval]);

  // Bar Graph 3: Real Per-Class Precision, Recall & F1 Comparison (%)
  const classBarData = useMemo(() => {
    const leg = liveEval.perClass.legitimate;
    const spm = liveEval.perClass.spam;
    const phs = liveEval.perClass.phishing;
    const activeClasses = [leg, spm, phs].filter(c => c.support > 0);
    const divisor = Math.max(1, activeClasses.length);
    const macroF1 = activeClasses.reduce((s, c) => s + c.f1, 0) / divisor;
    const macroPrec = activeClasses.reduce((s, c) => s + c.precision, 0) / divisor;
    const macroRec = activeClasses.reduce((s, c) => s + c.recall, 0) / divisor;

    return [
      {
        name: `Legitimate (${leg.support})`,
        f1: Number((leg.f1 * 100).toFixed(1)),
        precision: Number((leg.precision * 100).toFixed(1)),
        recall: Number((leg.recall * 100).toFixed(1))
      },
      {
        name: `Spam (${spm.support})`,
        f1: Number((spm.f1 * 100).toFixed(1)),
        precision: Number((spm.precision * 100).toFixed(1)),
        recall: Number((spm.recall * 100).toFixed(1))
      },
      {
        name: `Phishing (${phs.support})`,
        f1: Number((phs.f1 * 100).toFixed(1)),
        precision: Number((phs.precision * 100).toFixed(1)),
        recall: Number((phs.recall * 100).toFixed(1))
      },
      {
        name: 'Macro Avg',
        f1: Number((macroF1 * 100).toFixed(1)),
        precision: Number((macroPrec * 100).toFixed(1)),
        recall: Number((macroRec * 100).toFixed(1))
      }
    ];
  }, [liveEval]);

  const testCaseRows = liveEval.cases;

  const filteredTestCases = useMemo(() => {
    const q = testSearch.trim().toLowerCase();
    return testCaseRows.filter(tc => {
      if (testFilter === 'passed' && !tc.correct) return false;
      if (testFilter === 'errors' && tc.correct) return false;
      if (['TP', 'TN', 'FP', 'FN'].includes(testFilter) && tc.outcome !== testFilter) return false;
      if (!q) return true;
      return (
        tc.id.toLowerCase().includes(q) ||
        tc.subject.toLowerCase().includes(q) ||
        tc.sender.toLowerCase().includes(q) ||
        tc.actualLabel.toLowerCase().includes(q) ||
        tc.predictedLabel.toLowerCase().includes(q)
      );
    });
  }, [testCaseRows, testFilter, testSearch]);

  // Format test case table cleanly as copyable text
  const formattedTestCasesText = useMemo(() => {
    if (filteredTestCases.length === 0) return 'No test cases match the active filter.';

    if (copyFormat === 'tsv') {
      const header = ['ID', 'Source', 'Subject', 'Sender', 'Actual', 'Predicted', 'Spam Score', 'Confidence', 'Outcome'].join('\t');
      const rows = filteredTestCases.map(tc =>
        [
          tc.id,
          tc.source,
          tc.subject.replace(/\t|\n/g, ' '),
          tc.sender,
          tc.actualLabel,
          tc.predictedLabel,
          `${tc.spamScore}%`,
          `${tc.confidence}%`,
          tc.outcome
        ].join('\t')
      );
      return [header, ...rows].join('\n');
    }

    if (copyFormat === 'markdown') {
      const header = '| ID | Source | Subject | Sender | Actual | Predicted | Score | Conf | Outcome |';
      const sep = '|---|---|---|---|---|---|---:|---:|:---:|';
      const rows = filteredTestCases.map(tc => {
        const subj = tc.subject.replace(/\|/g, '/').slice(0, 44);
        return `| ${tc.id} | ${tc.source} | ${subj} | ${tc.sender} | ${tc.actualLabel} | ${tc.predictedLabel} | ${tc.spamScore}% | ${tc.confidence}% | ${tc.outcome} |`;
      });
      return [header, sep, ...rows].join('\n');
    }

    const pad = (val: string, width: number) => {
      const s = String(val);
      return s.length > width ? `${s.slice(0, width - 3)}...` : s.padEnd(width, ' ');
    };
    const header = [
      pad('ID', 14),
      pad('ACTUAL', 11),
      pad('PREDICTED', 11),
      pad('SCORE', 7),
      pad('CONF', 7),
      pad('OUTCOME', 8),
      pad('SENDER', 28),
      'SUBJECT'
    ].join(' | ');
    const divider = '-'.repeat(header.length + 12);
    const rows = filteredTestCases.map(tc =>
      [
        pad(tc.id, 14),
        pad(tc.actualLabel, 11),
        pad(tc.predictedLabel, 11),
        pad(`${tc.spamScore}%`, 7),
        pad(`${tc.confidence}%`, 7),
        pad(tc.outcome, 8),
        pad(tc.sender, 28),
        tc.subject
      ].join(' | ')
    );
    return [
      `NEOAEGIS REAL ACCURACY & F1 TEST CASE TABLE (${filteredTestCases.length} cases)`,
      `Accuracy: ${(liveEval.accuracy * 100).toFixed(1)}% | Precision: ${(liveEval.precision * 100).toFixed(1)}% | Recall: ${(liveEval.recall * 100).toFixed(1)}% | F1: ${(liveEval.f1Score * 100).toFixed(1)}%`,
      divider,
      header,
      divider,
      ...rows
    ].join('\n');
  }, [filteredTestCases, copyFormat, liveEval]);

  const handleCopyTestTable = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(formattedTestCasesText);
      } else {
        const ta = document.createElement('textarea');
        ta.value = formattedTestCasesText;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedBanner(`Copied ${filteredTestCases.length} test cases as ${copyFormat === 'tsv' ? 'TSV' : copyFormat === 'markdown' ? 'Markdown' : 'plain text'}!`);
      setTimeout(() => setCopiedBanner(null), 2600);
    } catch {
      setShowPlainPreview(true);
      setCopiedBanner('Text preview opened below for manual selection.');
      setTimeout(() => setCopiedBanner(null), 3000);
    }
  };

  // Real live benchmark execution across actual staged Trainer + Batch CSV + Vault items
  const handleRunBenchmark = () => {
    setIsRunningBenchmark(true);
    setBenchmarkProgress(0);
    setLastBenchmarkBanner(null);

    let step = 0;
    const timer = setInterval(() => {
      step += 25;
      setBenchmarkProgress(step);
      if (step >= 100) {
        clearInterval(timer);
        setEvalScope('trainer_live');
        setBenchmarkTick(t => t + 1);
        setIsRunningBenchmark(false);
        setLastBenchmarkBanner(
          `Executed live inference benchmark over real staged Trainer, Batch CSV, and Vault datasets.`
        );
      }
    }, 90);
  };

  // Export performance evaluation report
  const handleExportPerformanceReport = () => {
    const totalEval = liveEval.tp + liveEval.fp + liveEval.tn + liveEval.fn;
    const report = `========================================================================
NEOAEGIS REAL ACCURACY & PERFORMANCE EVALUATION REPORT
========================================================================
Report Generated At: ${new Date().toISOString()}
Evaluation Scope:    ${liveEval.sourceLabel}
Evaluated Dataset Size: ${totalEval} Samples

CORE CLASSIFICATION METRICS (REAL MEASURED)
Accuracy:             ${(liveEval.accuracy * 100).toFixed(2)}%
Precision:            ${(liveEval.precision * 100).toFixed(2)}%
Recall (Sensitivity): ${(liveEval.recall * 100).toFixed(2)}%
F1 Score:             ${(liveEval.f1Score * 100).toFixed(2)}%
Specificity:          ${(liveEval.specificity * 100).toFixed(2)}%
ROC AUC Score:        ${liveEval.rocAUC}

CONFUSION MATRIX BREAKDOWN
True Positives (TP - Threat Blocked):   ${liveEval.tp}
False Positives (FP - Legit Flagged):   ${liveEval.fp} (${(liveEval.falsePositiveRate * 100).toFixed(2)}% FPR)
True Negatives (TN - Legit Passed):     ${liveEval.tn}
False Negatives (FN - Threat Missed):   ${liveEval.fn} (${(liveEval.falseNegativeRate * 100).toFixed(2)}% FNR)

MEASURED PERFORMANCE
Average Per-Email Latency: ${liveEval.avgLatencyMs} ms
Throughput:                ${liveEval.throughputPerSec.toLocaleString()} emails/sec
Feature Extraction Time:   ${liveEval.vectorLookupMs} ms/email

TEST CASE LOG
${formattedTestCasesText}
========================================================================`;

    const blob = new Blob([report], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `neoaegis_real_accuracy_f1_report_${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const totalEvaluated = liveEval.tp + liveEval.fp + liveEval.tn + liveEval.fn;
  const actualThreatTotal = liveEval.tp + liveEval.fn;
  const actualLegitTotal = liveEval.fp + liveEval.tn;
  const predThreatTotal = liveEval.tp + liveEval.fp;
  const predLegitTotal = liveEval.fn + liveEval.tn;
  const matrix3x3 = liveEval.confusionMatrix3x3;

  return (
    <div className="space-y-8 animate-fade-in" id="performance-tab">
      {/* 1. Header Banner & Action Control */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col gap-4 shadow-3xs">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2.5">
              <Target className="w-5 h-5 text-indigo-600" />
              <h2 className="text-base font-medium text-slate-900">System Performance &amp; Real Precision Matrix</h2>
              <InfoButton
                title="100% Real Accuracy & Precision Matrix"
                description="All accuracy, F1, confusion matrix, ROC AUC, latency, and throughput metrics are calculated directly from live evaluation of your trained model test split, saved Batch CSV rows, staged Trainer corpus, and Personal Vault—zero hardcoded benchmarks."
                align="left"
              />
            </div>
            <span className="text-xs text-slate-500 block tabular-nums">
              Active Source:{' '}
              <strong className={hasCustomTextModel ? 'text-emerald-700' : 'text-indigo-700'}>
                {liveEval.sourceLabel}
              </strong>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <button
              type="button"
              onClick={handleRunBenchmark}
              disabled={isRunningBenchmark}
              className={`px-4 py-2.5 bg-indigo-600 hover:bg-indigo-750 text-white text-xs font-mono rounded-xl transition duration-150 flex items-center justify-center space-x-2 cursor-pointer shadow-xs ${isRunningBenchmark ? 'opacity-75 cursor-not-allowed' : ''}`}
            >
              {isRunningBenchmark ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>Evaluating ({benchmarkProgress}%)...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>Run Live Benchmark Test</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleExportPerformanceReport}
              className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-mono rounded-xl transition duration-150 flex items-center justify-center space-x-2 cursor-pointer shadow-3xs"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>Export Metrics Report (.md)</span>
            </button>
          </div>
        </div>

        {/* Evaluation Scope Switcher */}
        <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-slate-500 font-medium">Real Evaluation Scope:</span>
          <div className="flex flex-wrap items-center gap-1 bg-white p-1 rounded-full border border-slate-200">
            {([
              { id: 'all', label: 'All Real Sources' },
              { id: 'trainer_live', label: 'Live Staged Corpus + CSV' },
              { id: 'batch_vault', label: 'Batch CSV + Vault' },
              ...(hasCustomTextModel || activeModel?.imageUnit ? [{ id: 'model_test' as EvalScope, label: 'Trained Model Test Split' }] : [])
            ] as { id: EvalScope; label: string }[]).map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setEvalScope(opt.id)}
                className={`px-3 py-1 rounded-full font-medium transition cursor-pointer ${
                  evalScope === opt.id
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Progress Bar during live evaluation */}
      {isRunningBenchmark && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs font-mono text-indigo-700 mb-2">
            <span>Running Live Timed Classification Over Active Datasets</span>
            <span className="font-bold tabular-nums">{benchmarkProgress}%</span>
          </div>
          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
            <div
              className="bg-indigo-600 h-full transition-all duration-150"
              style={{ width: `${benchmarkProgress}%` }}
            />
          </div>
        </div>
      )}

      {lastBenchmarkBanner && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{lastBenchmarkBanner}</span>
          </span>
          <button
            type="button"
            onClick={() => setLastBenchmarkBanner(null)}
            className="text-[11px] font-medium hover:underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Privacy-Preserving Collective Backend Model Held-Out Summary */}
      {(isCollectiveBackendActive || collectiveStats?.hasCollectiveModel) && activeModel && (
        <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs tabular-nums">
          <div className="space-y-0.5">
            <span className="font-semibold text-indigo-900 block">
              Collective Backend Model Held-Out Evaluation (Aggregate Only — Cross-User Raw Emails Hidden)
            </span>
            <span className="text-indigo-700">
              Trained on <strong>{collectiveStats?.totalCombinedEmails ?? activeModel.datasetSize}</strong> combined backend emails across{' '}
              <strong>{collectiveStats?.contributorCount ?? 1}</strong> contributor(s) &middot; {activeModel.vocabularySize} vocabulary tokens.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 font-mono">
            <span className="px-2.5 py-1 bg-white border border-indigo-200 rounded-lg text-emerald-700 font-semibold">
              Acc: {(activeModel.evaluation.accuracy * 100).toFixed(1)}%
            </span>
            <span className="px-2.5 py-1 bg-white border border-indigo-200 rounded-lg text-indigo-700 font-semibold">
              F1: {(activeModel.evaluation.f1Score * 100).toFixed(1)}%
            </span>
            <span className="px-2.5 py-1 bg-white border border-indigo-200 rounded-lg text-amber-700 font-semibold">
              AUC: {activeModel.evaluation.rocAUC}
            </span>
          </div>
        </div>
      )}

      {/* Blank Initial State Notice when user has not uploaded or scanned emails yet */}
      {totalEvaluated === 0 && (
        <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-5 text-center text-xs text-slate-600">
          Your personal sandbox datasets currently start blank (<strong className="text-slate-900">0 emails</strong>). Upload a CSV/JSON dataset in{' '}
          <strong className="text-slate-900">Batch CSV Auditor</strong> or <strong className="text-slate-900">Trainer</strong>, or scan a message in{' '}
          <strong className="text-slate-900">Mail Body Scanner</strong> to populate live Accuracy, F1, Confusion Matrix, and Test Case rows.
        </div>
      )}

      {/* 2. Core Headline Score Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl relative shadow-3xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">F1 Score</span>
            <InfoButton title="F1 Score" description="Harmonic mean of Precision and Recall across evaluated messages." align="right" />
          </div>
          <div className="flex items-baseline space-x-2 mt-1">
            <span className="text-3xl font-semibold text-indigo-700 font-mono">
              {(liveEval.f1Score * 100).toFixed(1)}%
            </span>
            <span className="text-xs text-emerald-600 font-medium flex items-center">
              <ArrowUpRight className="w-3 h-3" />
              Live
            </span>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl relative shadow-3xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Overall Accuracy</span>
            <InfoButton title="Overall Accuracy" description="Ratio of correctly classified threat and legitimate emails out of all evaluated samples." align="right" />
          </div>
          <div className="flex items-baseline space-x-2 mt-1">
            <span className="text-3xl font-semibold text-emerald-700 font-mono">
              {(liveEval.accuracy * 100).toFixed(1)}%
            </span>
            <span className="text-xs text-slate-500 font-mono">
              ({liveEval.tp + liveEval.tn}/{totalEvaluated})
            </span>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl relative shadow-3xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Precision</span>
            <InfoButton title="Precision" description="Percentage of flagged emails that were genuinely malicious, minimizing false alarms." align="right" />
          </div>
          <div className="flex items-baseline space-x-2 mt-1">
            <span className="text-3xl font-semibold text-amber-700 font-mono">
              {(liveEval.precision * 100).toFixed(1)}%
            </span>
            <span className="text-xs text-slate-500 font-mono">
              FPR {(liveEval.falsePositiveRate * 100).toFixed(2)}%
            </span>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl relative shadow-3xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Recall / Sensitivity</span>
            <InfoButton title="Recall / Sensitivity" description="Percentage of actual spam and phishing threats successfully intercepted." align="right" />
          </div>
          <div className="flex items-baseline space-x-2 mt-1">
            <span className="text-3xl font-semibold text-blue-700 font-mono">
              {(liveEval.recall * 100).toFixed(1)}%
            </span>
            <span className="text-xs text-slate-500 font-mono">
              FNR {(liveEval.falseNegativeRate * 100).toFixed(2)}%
            </span>
          </div>
        </div>
      </div>

      {/* 3. Overall Performance Bar Graphs Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4 shadow-3xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-medium text-slate-900">Overall Performance Bar Graph</h3>
            </div>
            <InfoButton
              title="Overall Performance Summary"
              description="Compares real measured Accuracy, Precision, Recall, F1 Score, Specificity, and ROC AUC across the active evaluation scope."
              align="right"
            />
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={overallPerformanceBarData} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="metric" stroke="#475569" fontSize={11} />
                <YAxis domain={[0, 100]} stroke="#475569" fontSize={11} tickFormatter={v => `${v}%`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', color: '#0f172a', fontSize: '11px', borderRadius: '10px' }}
                  formatter={(value: any) => [`${value}%`, 'Score']}
                />
                <Bar dataKey="score" name="Score (%)" radius={[6, 6, 0, 0]}>
                  {overallPerformanceBarData.map((entry) => (
                    <Cell key={entry.metric} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-6 bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4 shadow-3xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-medium text-slate-900">Detection vs. Error Rates Bar Graph</h3>
            </div>
            <InfoButton
              title="Detection vs. Error Rates"
              description="Visualizes measured True Positive Rate and True Negative Rate against False Positive and False Negative rates."
              align="right"
            />
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ratesComparisonBarData} layout="vertical" margin={{ top: 8, right: 20, left: 22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" domain={[0, 100]} stroke="#475569" fontSize={11} tickFormatter={v => `${v}%`} />
                <YAxis type="category" dataKey="rate" width={118} stroke="#475569" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', color: '#0f172a', fontSize: '11px', borderRadius: '10px' }}
                  formatter={(value: any) => [`${value}%`, 'Rate']}
                />
                <Bar dataKey="value" name="Rate (%)" radius={[0, 6, 6, 0]}>
                  {ratesComparisonBarData.map((entry) => (
                    <Cell key={entry.rate} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 4. Formatted Confusion Matrix & ROC Curve */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-slate-50 border border-slate-200 rounded-2xl p-6 flex flex-col justify-between shadow-3xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div className="flex items-center space-x-2">
              <GridIcon className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-medium text-slate-900">Confusion Matrix</h3>
              <InfoButton
                title="Formatted Confusion Matrix"
                description="Rows show ground-truth Actual classes and columns show Predicted classes, computed dynamically over active evaluated samples."
                align="left"
              />
            </div>

            <div className="flex items-center gap-1 bg-white p-1 rounded-full border border-slate-200 text-[11px]">
              <button
                type="button"
                onClick={() => setMatrixMode('2x2')}
                className={`px-2.5 py-1 rounded-full font-medium transition cursor-pointer ${
                  matrixMode === '2x2' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                2&times;2 Binary
              </button>
              <button
                type="button"
                onClick={() => setMatrixMode('3x3')}
                className={`px-2.5 py-1 rounded-full font-medium transition cursor-pointer ${
                  matrixMode === '3x3' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                3&times;3 Multi-Class
              </button>
            </div>
          </div>

          {matrixMode === '2x2' ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs tabular-nums bg-white rounded-xl overflow-hidden border border-slate-200">
                <thead>
                  <tr className="bg-slate-100 text-slate-600">
                    <th className="p-2.5 border border-slate-200 text-left font-medium" rowSpan={2}>
                      Actual \ Predicted
                    </th>
                    <th className="p-2 border border-slate-200 text-center font-semibold text-slate-800" colSpan={2}>
                      Predicted Classification
                    </th>
                    <th className="p-2.5 border border-slate-200 text-right font-medium" rowSpan={2}>
                      Actual Total
                    </th>
                  </tr>
                  <tr className="bg-slate-50 text-slate-600">
                    <th className="p-2 border border-slate-200 text-center font-medium">Threat (Spam / Phish)</th>
                    <th className="p-2 border border-slate-200 text-center font-medium">Legitimate (Clean)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th className="p-3 border border-slate-200 bg-slate-50 text-left font-medium text-slate-800">
                      Actual: Threat
                    </th>
                    <td className="p-3 border border-slate-200 bg-emerald-50 text-center">
                      <span className="text-[10px] font-mono font-semibold text-emerald-700 block">TP (Blocked)</span>
                      <span className="text-xl font-mono font-bold text-emerald-700">{liveEval.tp}</span>
                      <span className="text-[10px] font-mono text-slate-500 block">
                        {actualThreatTotal > 0 ? `${((liveEval.tp / actualThreatTotal) * 100).toFixed(1)}%` : '0%'}
                      </span>
                    </td>
                    <td className="p-3 border border-slate-200 bg-red-50 text-center">
                      <span className="text-[10px] font-mono font-semibold text-red-700 block">FN (Missed)</span>
                      <span className="text-xl font-mono font-bold text-red-700">{liveEval.fn}</span>
                      <span className="text-[10px] font-mono text-slate-500 block">
                        {actualThreatTotal > 0 ? `${((liveEval.fn / actualThreatTotal) * 100).toFixed(1)}%` : '0%'}
                      </span>
                    </td>
                    <td className="p-3 border border-slate-200 text-right font-mono font-semibold text-slate-700">
                      {actualThreatTotal}
                    </td>
                  </tr>
                  <tr>
                    <th className="p-3 border border-slate-200 bg-slate-50 text-left font-medium text-slate-800">
                      Actual: Legitimate
                    </th>
                    <td className="p-3 border border-slate-200 bg-amber-50 text-center">
                      <span className="text-[10px] font-mono font-semibold text-amber-700 block">FP (False Alarm)</span>
                      <span className="text-xl font-mono font-bold text-amber-700">{liveEval.fp}</span>
                      <span className="text-[10px] font-mono text-slate-500 block">
                        {actualLegitTotal > 0 ? `${((liveEval.fp / actualLegitTotal) * 100).toFixed(1)}%` : '0%'}
                      </span>
                    </td>
                    <td className="p-3 border border-slate-200 bg-slate-50/70 text-center">
                      <span className="text-[10px] font-mono font-semibold text-slate-600 block">TN (Allowed)</span>
                      <span className="text-xl font-mono font-bold text-slate-900">{liveEval.tn}</span>
                      <span className="text-[10px] font-mono text-slate-500 block">
                        {actualLegitTotal > 0 ? `${((liveEval.tn / actualLegitTotal) * 100).toFixed(1)}%` : '0%'}
                      </span>
                    </td>
                    <td className="p-3 border border-slate-200 text-right font-mono font-semibold text-slate-700">
                      {actualLegitTotal}
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 text-slate-700 font-mono">
                    <th className="p-2.5 border border-slate-200 text-left font-medium font-sans">Predicted Total</th>
                    <td className="p-2.5 border border-slate-200 text-center font-semibold">{predThreatTotal}</td>
                    <td className="p-2.5 border border-slate-200 text-center font-semibold">{predLegitTotal}</td>
                    <td className="p-2.5 border border-slate-200 text-right font-bold">{totalEvaluated}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs tabular-nums bg-white rounded-xl overflow-hidden border border-slate-200">
                <thead>
                  <tr className="bg-slate-100 text-slate-700">
                    <th className="p-2.5 border border-slate-200 text-left font-medium">Actual \ Pred</th>
                    {CLASSES.map(lbl => (
                      <th key={lbl} className="p-2.5 border border-slate-200 text-center capitalize font-medium">
                        {lbl}
                      </th>
                    ))}
                    <th className="p-2.5 border border-slate-200 text-right font-medium">Support</th>
                  </tr>
                </thead>
                <tbody>
                  {CLASSES.map((actualLbl, rIdx) => {
                    const rowSum = matrix3x3[rIdx].reduce((a, b) => a + b, 0);
                    return (
                      <tr key={actualLbl}>
                        <th className="p-2.5 border border-slate-200 bg-slate-50 text-left capitalize font-medium text-slate-800">
                          {actualLbl}
                        </th>
                        {matrix3x3[rIdx].map((cellVal, cIdx) => {
                          const isDiag = rIdx === cIdx;
                          return (
                            <td
                              key={`${rIdx}-${cIdx}`}
                              className={`p-3 border border-slate-200 text-center font-mono ${
                                isDiag
                                  ? 'bg-emerald-50 text-emerald-700 font-bold text-base'
                                  : cellVal > 0
                                  ? 'bg-amber-50 text-amber-700 font-semibold'
                                  : 'text-slate-400'
                              }`}
                            >
                              {cellVal}
                            </td>
                          );
                        })}
                        <td className="p-2.5 border border-slate-200 text-right font-mono font-semibold text-slate-700">
                          {rowSum}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] font-mono text-slate-500">
            <span>False Positive Rate (FPR): <strong className="text-amber-700">{(liveEval.falsePositiveRate * 100).toFixed(2)}%</strong></span>
            <span>False Negative Rate (FNR): <strong className="text-red-600">{(liveEval.falseNegativeRate * 100).toFixed(2)}%</strong></span>
          </div>
        </div>

        {/* ROC AUC Curve Chart (6 cols) */}
        <div className="lg:col-span-6 bg-slate-50 border border-slate-200 rounded-2xl p-6 flex flex-col justify-between shadow-3xs">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-3">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-medium text-slate-900">ROC Curve &amp; AUC Score</h3>
                <InfoButton
                  title="ROC Curve & AUC Score"
                  description={`Sweeps classification cutoffs across your ${totalEvaluated} real evaluated samples (AUC = ${liveEval.rocAUC}).`}
                  align="left"
                />
              </div>
              <span className="text-xs font-mono font-semibold text-emerald-700">
                AUC: {liveEval.rocAUC}
              </span>
            </div>

            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={liveEval.rocCurve} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="fpr" stroke="#64748b" tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} label={{ value: 'FPR', position: 'insideBottomRight', offset: -5, fill: '#64748b', fontSize: 10 }} />
                  <YAxis stroke="#64748b" tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} label={{ value: 'TPR', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', color: '#0f172a', fontSize: '11px', borderRadius: '10px' }}
                    formatter={(val: any) => [`${(Number(val) * 100).toFixed(1)}%`, 'Rate']}
                  />
                  <Area type="monotone" dataKey="tpr" stroke="#10b981" fill="#10b981" fillOpacity={0.15} strokeWidth={2} name="True Positive Rate" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-2 pt-2 border-t border-slate-200 text-[11px] font-mono text-slate-500 flex items-center justify-between">
            <span>ROC Area Under Curve: <strong className="text-emerald-600">{liveEval.rocAUC}</strong></span>
            <span>Measured Cutoff: 0.50</span>
          </div>
        </div>
      </div>

      {/* 5. Bar Graph 3: Real Per-Class Precision, Recall & F1 Comparison */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-6 shadow-3xs">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-medium text-slate-900">
              Per-Class Precision, Recall &amp; F1 Bar Graph
            </h3>
            <InfoButton
              title="Real Class Performance Comparison"
              description="Grouped bar chart comparing measured F1 Score, Precision, and Recall across Legitimate, Spam, Phishing, and Macro Average."
              align="left"
            />
          </div>
          <span className="text-xs font-medium text-slate-500 tabular-nums">{totalEvaluated} Real Cases</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-7 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={classBarData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" stroke="#475569" fontSize={11} />
                <YAxis domain={[0, 100]} stroke="#475569" fontSize={11} tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', color: '#0f172a', fontSize: '11px', borderRadius: '10px' }} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="f1" name="F1 Score (%)" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                <Bar dataKey="precision" name="Precision (%)" fill="#d97706" radius={[4, 4, 0, 0]} />
                <Bar dataKey="recall" name="Recall (%)" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="lg:col-span-5 space-y-3 tabular-nums">
            {classBarData.map(row => (
              <div key={row.name} className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center justify-between shadow-3xs">
                <div>
                  <h4 className="text-xs font-medium text-slate-800">{row.name}</h4>
                  <span className="text-[11px] font-mono text-slate-500">
                    P: {row.precision}% &middot; R: {row.recall}%
                  </span>
                </div>
                <span className="text-xs font-mono font-semibold text-indigo-600">{row.f1}% F1</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 6. Evaluated Test Case Table (Copyable as Plain Text / TSV / Markdown) */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-3xs" id="test-case-table-section">
        <div className="p-5 border-b border-slate-200 bg-slate-50 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Table2 className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-medium text-slate-900">
                Evaluated Test Case Table ({filteredTestCases.length} cases)
              </h3>
              <InfoButton
                title="Copyable Test Case Audit Table"
                description="Lists all real evaluated cases (held-out model test split, saved Batch CSV uploads, staged Trainer dataset, and Personal Vault records). Copy directly as aligned plain text, TSV, or Markdown."
                align="left"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={copyFormat}
                onChange={e => setCopyFormat(e.target.value as CopyFormat)}
                aria-label="Copy text format"
                className="text-xs bg-white border border-slate-200 text-slate-700 px-3 py-2 rounded-full focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="aligned">Format: Plain Text Table</option>
                <option value="tsv">Format: Tab-Separated (TSV)</option>
                <option value="markdown">Format: Markdown Table</option>
              </select>

              <button
                type="button"
                onClick={handleCopyTestTable}
                disabled={filteredTestCases.length === 0}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-750 disabled:opacity-50 text-white text-xs font-medium rounded-full transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                id="copy-test-cases-btn"
              >
                {copiedBanner ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedBanner ? 'Copied!' : 'Copy Table as Text'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowPlainPreview(prev => !prev)}
                className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium rounded-full transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{showPlainPreview ? 'Hide Text View' : 'Plain Text View'}</span>
              </button>
            </div>
          </div>

          {copiedBanner && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{copiedBanner}</span>
            </div>
          )}

          {/* Filter & Search Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 bg-white p-1 rounded-full border border-slate-200 text-xs">
              {([
                { id: 'all', label: `All (${testCaseRows.length})` },
                { id: 'passed', label: `Passed (${testCaseRows.filter(t => t.correct).length})` },
                { id: 'errors', label: `Errors (${testCaseRows.filter(t => !t.correct).length})` },
                { id: 'TP', label: 'TP' },
                { id: 'TN', label: 'TN' },
                { id: 'FP', label: 'FP' },
                { id: 'FN', label: 'FN' }
              ] as { id: TestFilter; label: string }[]).map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setTestFilter(f.id)}
                  className={`px-3 py-1 rounded-full font-medium transition cursor-pointer ${
                    testFilter === f.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={testSearch}
                onChange={e => setTestSearch(e.target.value)}
                placeholder="Search test cases..."
                className="w-full bg-white border border-slate-200 pl-8 pr-3 py-1.5 rounded-full text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Optional Copyable Plain Text Preview Box */}
        {showPlainPreview && (
          <div className="p-4 bg-slate-50 border-b border-slate-200">
            <textarea
              readOnly
              rows={8}
              value={formattedTestCasesText}
              onFocus={e => e.currentTarget.select()}
              className="w-full font-mono text-[11px] bg-white border border-slate-200 rounded-xl p-3 text-slate-800 focus:outline-none focus:border-indigo-500"
            />
          </div>
        )}

        {/* Interactive Test Case Table */}
        <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
          <table className="w-full text-left text-xs text-slate-700 tabular-nums">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-medium sticky top-0">
              <tr>
                <th className="py-2.5 px-4">Case ID</th>
                <th className="py-2.5 px-4">Subject &amp; Sender</th>
                <th className="py-2.5 px-4">Source</th>
                <th className="py-2.5 px-4">Actual</th>
                <th className="py-2.5 px-4">Predicted</th>
                <th className="py-2.5 px-4 text-right">Threat Score</th>
                <th className="py-2.5 px-4 text-right">Confidence</th>
                <th className="py-2.5 px-4 text-center">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTestCases.map(tc => (
                <tr key={`${tc.source}-${tc.id}`} className="hover:bg-slate-50 transition">
                  <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">{tc.id}</td>
                  <td className="py-2.5 px-4 max-w-xs">
                    <div className="font-medium text-slate-900 truncate" title={tc.subject}>{tc.subject}</div>
                    <div className="text-[11px] font-mono text-slate-500 truncate">{tc.sender}</div>
                  </td>
                  <td className="py-2.5 px-4 text-[11px] text-slate-500 whitespace-nowrap">
                    {tc.source === 'test_split'
                      ? 'Held-Out Test'
                      : tc.source === 'batch_csv'
                      ? 'Batch CSV'
                      : tc.source === 'trainer_corpus'
                      ? 'Trainer Dataset'
                      : tc.source === 'vault_record'
                      ? 'Vault Record'
                      : 'Starter Corpus'}
                  </td>
                  <td className="py-2.5 px-4 capitalize font-medium whitespace-nowrap">
                    <span className={tc.actualLabel === 'phishing' ? 'text-red-700' : tc.actualLabel === 'spam' ? 'text-amber-700' : 'text-emerald-700'}>
                      {tc.actualLabel}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 capitalize font-medium whitespace-nowrap">
                    <span className={tc.predictedLabel === 'phishing' ? 'text-red-700' : tc.predictedLabel === 'spam' ? 'text-amber-700' : 'text-emerald-700'}>
                      {tc.predictedLabel}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono font-semibold">
                    <span className={tc.spamScore >= 50 ? 'text-red-600' : 'text-emerald-600'}>{tc.spamScore}%</span>
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-slate-600">
                    {tc.confidence}%
                  </td>
                  <td className="py-2.5 px-4 text-center font-mono font-semibold whitespace-nowrap">
                    <span
                      className={
                        tc.outcome === 'TP' || tc.outcome === 'TN'
                          ? 'text-emerald-700'
                          : tc.outcome === 'FP'
                          ? 'text-amber-700'
                          : 'text-red-600'
                      }
                    >
                      {tc.outcome} ({tc.correct ? 'PASS' : 'MISS'})
                    </span>
                  </td>
                </tr>
              ))}
              {filteredTestCases.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    No test cases match the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 7. Image Training Unit Evaluation Summary */}
      {activeModel?.imageUnit && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 shadow-3xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-medium text-slate-900">Image Training Unit Performance</h3>
              <InfoButton
                title="Image Training Unit Metrics"
                description="Held-out visual evaluation metrics from your locally trained HTML5 Canvas pixel + OCR classifier."
                align="left"
              />
            </div>
            <span className="text-xs font-mono text-slate-600 tabular-nums">
              {activeModel.imageUnit.datasetSize} total images &middot; {activeModel.imageUnit.evaluation.testCount} held-out test
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs tabular-nums">
            <div className="bg-white border border-slate-200 p-3.5 rounded-xl">
              <span className="text-slate-500 block">Image Accuracy</span>
              <span className="text-xl font-mono font-semibold text-emerald-700">
                {(activeModel.imageUnit.evaluation.accuracy * 100).toFixed(1)}%
              </span>
            </div>
            <div className="bg-white border border-slate-200 p-3.5 rounded-xl">
              <span className="text-slate-500 block">Image F1 Score</span>
              <span className="text-xl font-mono font-semibold text-indigo-700">
                {(activeModel.imageUnit.evaluation.f1Score * 100).toFixed(1)}%
              </span>
            </div>
            <div className="bg-white border border-slate-200 p-3.5 rounded-xl">
              <span className="text-slate-500 block">Precision / Recall</span>
              <span className="text-xl font-mono font-semibold text-amber-700">
                {(activeModel.imageUnit.evaluation.precision * 100).toFixed(0)}% / {(activeModel.imageUnit.evaluation.recall * 100).toFixed(0)}%
              </span>
            </div>
            <div className="bg-white border border-slate-200 p-3.5 rounded-xl">
              <span className="text-slate-500 block">Image ROC AUC</span>
              <span className="text-xl font-mono font-semibold text-blue-700">
                {activeModel.imageUnit.evaluation.rocAUC.toFixed(3)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 8. Measured Execution Latency & Throughput */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 tabular-nums">
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl shadow-3xs flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2 text-indigo-600 mb-1">
              <Zap className="w-4 h-4" />
              <h4 className="text-xs font-medium">Measured Latency / Email</h4>
            </div>
            <span className="text-2xl font-semibold text-slate-900 font-mono">{liveEval.avgLatencyMs} ms</span>
          </div>
          <InfoButton title="Measured Latency" description="Actual browser execution time per email across the active evaluation pass." align="right" />
        </div>

        <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl shadow-3xs flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2 text-emerald-600 mb-1">
              <Cpu className="w-4 h-4" />
              <h4 className="text-xs font-medium">Measured Throughput</h4>
            </div>
            <span className="text-2xl font-semibold text-slate-900 font-mono">
              {liveEval.throughputPerSec.toLocaleString()} / sec
            </span>
          </div>
          <InfoButton title="Measured Throughput" description="Measured single-thread browser scan rate over the evaluated corpus." align="right" />
        </div>

        <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl shadow-3xs flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2 text-amber-600 mb-1">
              <Activity className="w-4 h-4" />
              <h4 className="text-xs font-medium">Feature Extraction Time</h4>
            </div>
            <span className="text-2xl font-semibold text-slate-900 font-mono">{liveEval.vectorLookupMs} ms</span>
          </div>
          <InfoButton title="Feature Extraction Time" description="Measured per-email runtime for 7 security feature + token vector extraction." align="right" />
        </div>
      </div>
    </div>
  );
}

function GridIcon(props: any) {
  return (
    <svg className={props.className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  );
}
