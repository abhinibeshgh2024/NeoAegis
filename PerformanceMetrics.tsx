/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  Target, Mail, Image as ImageIcon, CheckCircle2, XCircle,
  Copy, Check, BarChart3, Grid3X3, Activity
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, LineChart, Line
} from 'recharts';
import { EmailLabel, EmailRecord, TrainedModelArtifact } from './types';
import {
  CollectiveBackendStats,
  loadUserBatchRows,
  loadUserImageAssessments,
  loadUserTrainedModel,
  loadUserTrainerImages,
  loadUserTrainerSamples,
  prepareModelVocabCache
} from './src/lib/localMlEngine';
import { predictImageWithModel } from './src/lib/imageVisionEngine';
import { analyzeEmailWithModel } from './spamEngine';
import InfoButton from './src/components/InfoButton';

interface PerformanceMetricsProps {
  records: EmailRecord[];
  activeModel?: TrainedModelArtifact | null;
  currentUserUid?: string;
  collectiveStats?: CollectiveBackendStats | null;
  syncTick?: number;
}

interface EvaluatedCaseRow {
  id: string;
  title: string;
  sourceType: 'Mail' | 'Image';
  actual: EmailLabel;
  predicted: EmailLabel;
  threatScore: number;
  correct: boolean;
}

const CLASSES: EmailLabel[] = ['legitimate', 'spam', 'phishing'];

function isImageVaultRecord(rec: EmailRecord): boolean {
  return (
    rec.sender === 'image-telemetry@neoaegis.local' ||
    String(rec.subject || '').startsWith('[Image Scan]')
  );
}

export default function PerformanceMetrics({
  records,
  activeModel,
  currentUserUid,
  syncTick = 0
}: PerformanceMetricsProps) {
  const [tableFilter, setTableFilter] = useState<'all' | 'mail' | 'image' | 'mismatch'>('all');
  const [tablePage, setTablePage] = useState<number>(1);
  const PAGE_SIZE = 50;
  const [copiedText, setCopiedText] = useState(false);

  const analytics = useMemo(() => {
    const cases: EvaluatedCaseRow[] = [];
    const seenMails = new Set<string>();
    const seenImages = new Set<string>();
    const resolvedModel = activeModel !== undefined ? activeModel : loadUserTrainedModel(currentUserUid);
    const vocabCache = prepareModelVocabCache(resolvedModel);

    let mailCorrect = 0;
    let mailTotal = 0;
    let imageCorrect = 0;
    let imageTotal = 0;

    // 1. Evaluate ONLY this user's own Mail Assessments
    const evaluateMail = (
      id: string,
      subject: string,
      body: string,
      sender: string,
      rawHeaders: string | undefined,
      actualLabel: EmailLabel
    ) => {
      const key = `${String(subject || '').trim().toLowerCase()}::${String(sender || '').trim().toLowerCase()}`;
      if (seenMails.has(key)) return;
      seenMails.add(key);

      const headers = rawHeaders || `From: ${sender}\nDKIM: Pass\nSPF: Pass`;
      const res = analyzeEmailWithModel(subject, body, headers, sender, resolvedModel, vocabCache);
      const predThreat = res.metrics.spamScore >= 50 || res.metrics.phishingLikelihood >= 55;
      const predictedLabel: EmailLabel = res.modelPrediction
        ? res.modelPrediction.predictedLabel
        : predThreat
        ? res.metrics.phishingLikelihood >= 55
          ? 'phishing'
          : 'spam'
        : 'legitimate';

      const threatScore = Math.max(res.metrics.spamScore, res.metrics.phishingLikelihood);
      const correct = predictedLabel === actualLabel;

      mailTotal++;
      if (correct) mailCorrect++;

      cases.push({
        id,
        title: subject || '(No Subject)',
        sourceType: 'Mail',
        actual: actualLabel,
        predicted: predictedLabel,
        threatScore,
        correct
      });
    };

    if (currentUserUid) {
      const batchRows = loadUserBatchRows(currentUserUid) || [];
      for (const row of batchRows) {
        const lbl: EmailLabel =
          row.actualLabel || (row.actual === 'ham' ? 'legitimate' : 'spam');
        evaluateMail(
          row.id || `batch-${mailTotal + 1}`,
          row.subject || '(No Subject)',
          row.body || '',
          row.sender || 'unknown@sender.org',
          row.rawHeaders,
          lbl
        );
      }

      const trainerSamples = loadUserTrainerSamples(currentUserUid) || [];
      for (const sample of trainerSamples) {
        evaluateMail(
          sample.id || `trn-${mailTotal + 1}`,
          sample.subject,
          sample.body,
          sample.sender,
          sample.rawHeaders,
          sample.label
        );
      }
    }

    for (const rec of records) {
      if (isImageVaultRecord(rec) || !rec.groundTruthLabel) continue;
      evaluateMail(
        rec.id,
        rec.subject,
        rec.body,
        rec.sender,
        rec.rawHeaders,
        rec.groundTruthLabel
      );
    }

    // 2. Evaluate ONLY this user's own Image Assessments
    if (currentUserUid) {
      const assessedImages = loadUserImageAssessments(currentUserUid) || [];
      const trainerImages = loadUserTrainerImages(currentUserUid) || [];
      for (const img of [...assessedImages, ...trainerImages]) {
        const key = String(img.fileName || img.id || '').trim().toLowerCase();
        if (!key || seenImages.has(key)) continue;
        seenImages.add(key);

        const pred = predictImageWithModel(
          img.extractedFeatures,
          img.ocrText,
          activeModel?.imageUnit
        );
        const threatScore = Math.max(pred.spamScore, pred.phishingLikelihood);
        const correct = pred.predictedLabel === img.label;
        imageTotal++;
        if (correct) imageCorrect++;

        cases.push({
          id: img.id,
          title: img.fileName || 'Uploaded Image',
          sourceType: 'Image',
          actual: img.label,
          predicted: pred.predictedLabel,
          threatScore,
          correct
        });
      }
    }

    for (const rec of records) {
      if (!isImageVaultRecord(rec) || !rec.groundTruthLabel) continue;
      const cleanName = String(rec.subject || '').replace(/^\[Image Scan\]\s*/i, '').trim().toLowerCase();
      if (!cleanName || seenImages.has(cleanName)) continue;
      seenImages.add(cleanName);

      const predictedLabel: EmailLabel =
        rec.metrics.phishingLikelihood >= 55
          ? 'phishing'
          : rec.metrics.spamScore >= 50
          ? 'spam'
          : 'legitimate';
      const threatScore = Math.max(rec.metrics.spamScore, rec.metrics.phishingLikelihood);
      const correct = predictedLabel === rec.groundTruthLabel;
      imageTotal++;
      if (correct) imageCorrect++;

      cases.push({
        id: rec.id,
        title: rec.subject,
        sourceType: 'Image',
        actual: rec.groundTruthLabel,
        predicted: predictedLabel,
        threatScore,
        correct
      });
    }

    // 3. Build 3x3 Multi-Class Confusion Matrix & Per-Class Precision/Recall/F1
    const matrix3x3: Record<EmailLabel, Record<EmailLabel, number>> = {
      legitimate: { legitimate: 0, spam: 0, phishing: 0 },
      spam: { legitimate: 0, spam: 0, phishing: 0 },
      phishing: { legitimate: 0, spam: 0, phishing: 0 }
    };

    let tp = 0;
    let fp = 0;
    let tn = 0;
    let fn = 0;

    for (const c of cases) {
      matrix3x3[c.actual][c.predicted]++;
      const actualThreat = c.actual !== 'legitimate';
      const predThreat = c.predicted !== 'legitimate';
      if (actualThreat && predThreat) tp++;
      else if (!actualThreat && predThreat) fp++;
      else if (!actualThreat && !predThreat) tn++;
      else fn++;
    }

    const perClass = CLASSES.map(cls => {
      const truePos = matrix3x3[cls][cls];
      let predictedTotal = 0;
      let actualTotal = 0;
      for (const other of CLASSES) {
        predictedTotal += matrix3x3[other][cls];
        actualTotal += matrix3x3[cls][other];
      }
      const precision = predictedTotal > 0 ? (truePos / predictedTotal) * 100 : 0;
      const recall = actualTotal > 0 ? (truePos / actualTotal) * 100 : 0;
      const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
      return {
        key: cls,
        name: cls.charAt(0).toUpperCase() + cls.slice(1),
        precision: Number(precision.toFixed(1)),
        recall: Number(recall.toFixed(1)),
        f1: Number(f1.toFixed(1)),
        support: actualTotal,
        correct: truePos
      };
    });

    const activeClasses = perClass.filter(c => c.support > 0);
    const divisor = activeClasses.length || 1;
    const macroPrecision =
      activeClasses.length > 0
        ? Number((activeClasses.reduce((s, c) => s + c.precision, 0) / divisor).toFixed(1))
        : 0;
    const macroRecall =
      activeClasses.length > 0
        ? Number((activeClasses.reduce((s, c) => s + c.recall, 0) / divisor).toFixed(1))
        : 0;
    const macroF1 =
      activeClasses.length > 0
        ? Number((activeClasses.reduce((s, c) => s + c.f1, 0) / divisor).toFixed(1))
        : 0;

    const totalCorrect = mailCorrect + imageCorrect;
    const totalAssessments = mailTotal + imageTotal;
    const overallAccuracyPct =
      totalAssessments > 0 ? Number(((totalCorrect / totalAssessments) * 100).toFixed(1)) : 0;
    const mailAccuracyPct =
      mailTotal > 0 ? Number(((mailCorrect / mailTotal) * 100).toFixed(1)) : null;
    const imageAccuracyPct =
      imageTotal > 0 ? Number(((imageCorrect / imageTotal) * 100).toFixed(1)) : null;

    // 4. Real ROC Curve & Trapezoidal AUC from evaluated items
    const thresholds = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0];
    const threatCases = cases.filter(c => c.actual !== 'legitimate');
    const cleanCases = cases.filter(c => c.actual === 'legitimate');
    const rocPoints =
      cases.length > 0 && threatCases.length > 0 && cleanCases.length > 0
        ? thresholds
            .map(th => {
              const tPos = threatCases.filter(c => c.threatScore >= th).length;
              const fPos = cleanCases.filter(c => c.threatScore >= th).length;
              return {
                fpr: Number(((fPos / cleanCases.length) * 100).toFixed(1)),
                tpr: Number(((tPos / threatCases.length) * 100).toFixed(1))
              };
            })
            .sort((a, b) => a.fpr - b.fpr || a.tpr - b.tpr)
        : [
            { fpr: 0, tpr: 0 },
            { fpr: 100, tpr: totalAssessments > 0 ? 100 : 0 }
          ];

    let aucArea = 0;
    for (let i = 1; i < rocPoints.length; i++) {
      const dx = (rocPoints[i].fpr - rocPoints[i - 1].fpr) / 100;
      const avgY = ((rocPoints[i].tpr + rocPoints[i - 1].tpr) / 2) / 100;
      aucArea += dx * avgY;
    }
    const rocAUC =
      cases.length > 0 && threatCases.length > 0 && cleanCases.length > 0
        ? Number(Math.max(0.5, Math.min(1, aucArea)).toFixed(3))
        : totalAssessments > 0
        ? Number((overallAccuracyPct / 100).toFixed(3))
        : 0;

    // Overall benchmark bar graph series
    const summaryBars = [
      { metric: 'Overall Acc', score: overallAccuracyPct },
      { metric: 'Precision', score: macroPrecision },
      { metric: 'Recall', score: macroRecall },
      { metric: 'F1 Score', score: macroF1 },
      { metric: 'ROC AUC', score: Number((rocAUC * 100).toFixed(1)) },
      { metric: 'Mail Acc', score: mailAccuracyPct ?? 0 },
      { metric: 'Image Acc', score: imageAccuracyPct ?? 0 }
    ];

    const fprPct = fp + tn > 0 ? Number(((fp / (fp + tn)) * 100).toFixed(1)) : 0;
    const detectionRatePct = tp + fn > 0 ? Number(((tp / (tp + fn)) * 100).toFixed(1)) : 0;

    return {
      cases,
      mailCorrect,
      mailTotal,
      mailAccuracyPct,
      imageCorrect,
      imageTotal,
      imageAccuracyPct,
      totalCorrect,
      totalAssessments,
      overallAccuracyPct,
      macroPrecision,
      macroRecall,
      macroF1,
      rocAUC,
      rocPoints,
      matrix3x3,
      perClass,
      summaryBars,
      tp,
      fp,
      tn,
      fn,
      fprPct,
      detectionRatePct
    };
  }, [records, activeModel, currentUserUid, syncTick]);

  const filteredCases = useMemo(() => {
    return analytics.cases.filter(c => {
      if (tableFilter === 'mail') return c.sourceType === 'Mail';
      if (tableFilter === 'image') return c.sourceType === 'Image';
      if (tableFilter === 'mismatch') return !c.correct;
      return true;
    });
  }, [analytics.cases, tableFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredCases.length / PAGE_SIZE));
  const safePage = Math.min(tablePage, totalPages);
  const paginatedCases = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredCases.slice(start, start + PAGE_SIZE);
  }, [filteredCases, safePage]);

  const handleCopyTableAsText = async () => {
    const maxCopyRows = 5000;
    const rowsToCopy = filteredCases.slice(0, maxCopyRows);
    const headerLines = [
      `NeoAegis Accuracy & Confusion Matrix Report`,
      `Overall Accuracy: ${analytics.overallAccuracyPct.toFixed(1)}% (${analytics.totalCorrect}/${analytics.totalAssessments})`,
      `Precision: ${analytics.macroPrecision.toFixed(1)}% | Recall: ${analytics.macroRecall.toFixed(1)}% | F1: ${analytics.macroF1.toFixed(1)}% | ROC AUC: ${analytics.rocAUC.toFixed(3)}`,
      `Binary Matrix -> TP: ${analytics.tp}, FP: ${analytics.fp}, TN: ${analytics.tn}, FN: ${analytics.fn}`,
      filteredCases.length > maxCopyRows ? `(Note: Showing first ${maxCopyRows.toLocaleString()} of ${filteredCases.length.toLocaleString()} rows)` : '',
      `---`,
      `#\tType\tTitle\tActual\tPredicted\tThreatScore\tVerdict`
    ].filter(Boolean);
    const rowLines = rowsToCopy.map((c, idx) =>
      `${idx + 1}\t${c.sourceType}\t${c.title}\t${c.actual}\t${c.predicted}\t${c.threatScore}%\t${c.correct ? 'CORRECT' : 'MISMATCH'}`
    );
    const fullText = [...headerLines, ...rowLines].join('\n');

    try {
      await navigator.clipboard.writeText(fullText);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2500);
    } catch {
      // Fallback textarea copy if clipboard API unavailable
      const ta = document.createElement('textarea');
      ta.value = fullText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2500);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in" id="performance-tab">
      {/* 1. Overall Calculated Accuracy Banner + Mail / Image Breakdown */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-3xs space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2.5">
            <Target className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-medium text-slate-900">
              Overall Accuracy, Precision &amp; Confusion Matrix
            </h2>
          </div>
          <InfoButton
            title="Real User-Scoped Performance"
            description="Every accuracy score, bar graph, confusion matrix cell, ROC curve, and test case row is calculated live from ONLY your own parsed Mail & Image assessments."
            align="right"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 text-center space-y-2 tabular-nums">
            <span className="text-xs font-medium text-slate-500 block">
              Combined Overall Accuracy (Mails + Images)
            </span>
            <div className="text-4xl font-bold font-mono text-emerald-700">
              {analytics.totalAssessments > 0 ? `${analytics.overallAccuracyPct.toFixed(1)}%` : '0.0%'}
            </div>
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-600 h-full transition-all duration-300"
                style={{ width: `${analytics.overallAccuracyPct}%` }}
              />
            </div>
            <span className="text-[11px] font-mono text-slate-500 block">
              {analytics.totalCorrect} / {analytics.totalAssessments} of your assessments matched ground truth
            </span>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4 tabular-nums">
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-slate-700">
                  <Mail className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-medium">Mail Assessments</span>
                </div>
                <span className="text-xs font-mono text-slate-500 block">
                  {analytics.mailCorrect} / {analytics.mailTotal} correct
                </span>
              </div>
              <span className="text-2xl font-semibold font-mono text-indigo-700">
                {analytics.mailAccuracyPct !== null ? `${analytics.mailAccuracyPct.toFixed(1)}%` : '—'}
              </span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-slate-700">
                  <ImageIcon className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-medium">Image Assessments</span>
                </div>
                <span className="text-xs font-mono text-slate-500 block">
                  {analytics.imageCorrect} / {analytics.imageTotal} correct
                </span>
              </div>
              <span className="text-2xl font-semibold font-mono text-emerald-700">
                {analytics.imageAccuracyPct !== null ? `${analytics.imageAccuracyPct.toFixed(1)}%` : '—'}
              </span>
            </div>

            {/* KPI Mini Strip */}
            <div className="sm:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                <span className="text-[11px] text-slate-500 block">Precision</span>
                <span className="text-lg font-bold font-mono text-indigo-700">
                  {analytics.macroPrecision.toFixed(1)}%
                </span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                <span className="text-[11px] text-slate-500 block">Recall</span>
                <span className="text-lg font-bold font-mono text-sky-700">
                  {analytics.macroRecall.toFixed(1)}%
                </span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                <span className="text-[11px] text-slate-500 block">F1 Score</span>
                <span className="text-lg font-bold font-mono text-emerald-700">
                  {analytics.macroF1.toFixed(1)}%
                </span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                <span className="text-[11px] text-slate-500 block">ROC AUC</span>
                <span className="text-lg font-bold font-mono text-amber-700">
                  {analytics.rocAUC.toFixed(3)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Bar Graphs Section: Overall Metrics & Per-Class Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 lg:col-span-6 space-y-4 shadow-3xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-medium text-slate-900">Overall Performance Benchmark (%)</h3>
            </div>
            <InfoButton
              title="Overall Performance Benchmark"
              description="Side-by-side comparison of Accuracy, Macro Precision, Recall, F1 Score, ROC AUC, and Mail/Image modal accuracy computed from your evaluated records."
              align="right"
            />
          </div>
          <div className="h-[270px] w-full bg-white border border-slate-200 rounded-xl p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.summaryBars} margin={{ top: 10, right: 16, left: -12, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="metric" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#475569' }} unit="%" />
                <Tooltip
                  contentStyle={{ borderRadius: '10px', borderColor: '#cbd5e1', fontSize: '12px' }}
                  formatter={(v: any) => [`${v}%`, 'Score']}
                />
                <Bar dataKey="score" name="Performance (%)" fill="#4f46e5" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 lg:col-span-6 space-y-4 shadow-3xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-medium text-slate-900">Per-Class Precision, Recall &amp; F1 (%)</h3>
            </div>
            <InfoButton
              title="Per-Class Breakdown"
              description="Measures precision, recall, and F1 separately for Legitimate, Spam, and Phishing items in your dataset."
              align="right"
            />
          </div>
          <div className="h-[270px] w-full bg-white border border-slate-200 rounded-xl p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.perClass} margin={{ top: 10, right: 16, left: -12, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#475569' }} unit="%" />
                <Tooltip contentStyle={{ borderRadius: '10px', borderColor: '#cbd5e1', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="precision" name="Precision %" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                <Bar dataKey="recall" name="Recall %" fill="#0284c7" radius={[4, 4, 0, 0]} />
                <Bar dataKey="f1" name="F1 %" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 3. Class Volume Bar Chart + ROC Curve */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 lg:col-span-6 space-y-4 shadow-3xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-sky-600" />
              <h3 className="text-sm font-medium text-slate-900">Class Volume vs Correct Matches</h3>
            </div>
          </div>
          <div className="h-[250px] w-full bg-white border border-slate-200 rounded-xl p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.perClass} margin={{ top: 10, right: 16, left: -12, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#475569' }} />
                <Tooltip contentStyle={{ borderRadius: '10px', borderColor: '#cbd5e1', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="support" name="Total Assessed" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="correct" name="Correctly Classified" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 lg:col-span-6 space-y-4 shadow-3xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-600" />
              <h3 className="text-sm font-medium text-slate-900">
                ROC Curve (AUC: <span className="font-mono text-indigo-700">{analytics.rocAUC.toFixed(3)}</span>)
              </h3>
            </div>
          </div>
          <div className="h-[250px] w-full bg-white border border-slate-200 rounded-xl p-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics.rocPoints} margin={{ top: 10, right: 16, left: -12, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="fpr" type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis dataKey="tpr" type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: '#475569' }} />
                <Tooltip contentStyle={{ borderRadius: '10px', borderColor: '#cbd5e1', fontSize: '12px' }} />
                <Line type="monotone" dataKey="tpr" name="True Positive Rate %" stroke="#4f46e5" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 4. Confusion Matrices (3x3 Multi-Class Matrix & 2x2 Binary Matrix) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 lg:col-span-7 space-y-4 shadow-3xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Grid3X3 className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-medium text-slate-900">Multi-Class Confusion Matrix (Actual vs Predicted)</h3>
            </div>
          </div>
          <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl p-3">
            <table className="w-full text-xs text-center border-collapse tabular-nums">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <th className="p-2.5 text-left font-medium">Actual \ Predicted</th>
                  <th className="p-2.5 font-medium text-emerald-800">Legitimate</th>
                  <th className="p-2.5 font-medium text-amber-800">Spam</th>
                  <th className="p-2.5 font-medium text-rose-800">Phishing</th>
                  <th className="p-2.5 font-medium text-slate-600">Support</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono">
                {CLASSES.map(actualCls => {
                  const rowTotal =
                    analytics.matrix3x3[actualCls].legitimate +
                    analytics.matrix3x3[actualCls].spam +
                    analytics.matrix3x3[actualCls].phishing;
                  return (
                    <tr key={actualCls}>
                      <td className="p-2.5 text-left font-sans font-medium text-slate-800 capitalize bg-slate-50">
                        Actual {actualCls}
                      </td>
                      {CLASSES.map(predCls => {
                        const val = analytics.matrix3x3[actualCls][predCls];
                        const isDiag = actualCls === predCls;
                        return (
                          <td
                            key={predCls}
                            className={`p-3 font-semibold ${
                              isDiag
                                ? 'bg-emerald-50 text-emerald-800'
                                : val > 0
                                ? 'bg-rose-50 text-rose-700'
                                : 'text-slate-400'
                            }`}
                          >
                            {val}
                          </td>
                        );
                      })}
                      <td className="p-2.5 text-slate-600 bg-slate-50">{rowTotal}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 lg:col-span-5 space-y-4 shadow-3xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Grid3X3 className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-medium text-slate-900">Binary Threat Matrix (Threat vs Clean)</h3>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 tabular-nums font-mono">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <span className="text-[11px] font-sans font-medium text-emerald-800 block">True Positive (TP)</span>
              <span className="text-2xl font-bold text-emerald-700 block mt-1">{analytics.tp}</span>
              <span className="text-[10px] font-sans text-emerald-700">Threats caught accurately</span>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <span className="text-[11px] font-sans font-medium text-amber-800 block">False Positive (FP)</span>
              <span className="text-2xl font-bold text-amber-700 block mt-1">{analytics.fp}</span>
              <span className="text-[10px] font-sans text-amber-700">Clean flagged as threat</span>
            </div>
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
              <span className="text-[11px] font-sans font-medium text-rose-800 block">False Negative (FN)</span>
              <span className="text-2xl font-bold text-rose-700 block mt-1">{analytics.fn}</span>
              <span className="text-[10px] font-sans text-rose-700">Threats missed</span>
            </div>
            <div className="bg-sky-50 border border-sky-200 rounded-xl p-4">
              <span className="text-[11px] font-sans font-medium text-sky-800 block">True Negative (TN)</span>
              <span className="text-2xl font-bold text-sky-700 block mt-1">{analytics.tn}</span>
              <span className="text-[10px] font-sans text-sky-700">Legitimate cleared</span>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between text-xs font-mono text-slate-600 tabular-nums">
            <span>Threat Detection Rate: <strong className="text-emerald-700">{analytics.detectionRatePct}%</strong></span>
            <span>False Alarm Rate: <strong className="text-amber-700">{analytics.fprPct}%</strong></span>
          </div>
        </div>
      </div>

      {/* 5. Copyable Test Case Table */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 shadow-3xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-sm font-medium text-slate-900">
              Assessed Test Case Breakdown ({filteredCases.length} records)
            </h3>
            <p className="text-xs text-slate-500">
              Includes only your own parsed Mail &amp; Image assessments. Copyable as formatted plain text.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-full p-1 text-xs">
              {([
                { id: 'all', label: `All (${analytics.cases.length})` },
                { id: 'mail', label: `Mails (${analytics.mailTotal})` },
                { id: 'image', label: `Images (${analytics.imageTotal})` },
                { id: 'mismatch', label: `Errors (${analytics.cases.filter(c => !c.correct).length})` }
              ] as const).map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setTableFilter(tab.id);
                    setTablePage(1);
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition cursor-pointer ${
                    tableFilter === tab.id
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleCopyTableAsText}
              disabled={filteredCases.length === 0}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-45 text-white rounded-full text-xs font-medium transition flex items-center gap-1.5 cursor-pointer"
              id="copy-test-cases-btn"
            >
              {copiedText ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedText ? 'Copied to Clipboard!' : 'Copy Table as Text'}</span>
            </button>
          </div>
        </div>

        {filteredCases.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
            No assessed mails or images found in your workspace yet. Upload a CSV in Batch CSV Auditor / Trainer, scan an email in Mail Body Scanner, or inspect an image in Image OCR Inspector to populate your real metrics, bar charts, confusion matrix, and test table.
          </div>
        ) : (
          <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl max-h-[380px] overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-100 text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="p-3 font-medium">#</th>
                  <th className="p-3 font-medium">Type</th>
                  <th className="p-3 font-medium">Subject / File Name</th>
                  <th className="p-3 font-medium">Ground Truth</th>
                  <th className="p-3 font-medium">Predicted</th>
                  <th className="p-3 font-medium text-right">Threat Score</th>
                  <th className="p-3 font-medium text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {paginatedCases.map((row, idx) => {
                  const rowNum = (safePage - 1) * PAGE_SIZE + idx + 1;
                  return (
                  <tr key={`${row.sourceType}-${row.id}-${rowNum}`} className="hover:bg-slate-50">
                    <td className="p-3 font-mono text-slate-500">{rowNum}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                          row.sourceType === 'Mail'
                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {row.sourceType}
                      </span>
                    </td>
                    <td className="p-3 text-slate-900 font-medium max-w-[260px] truncate">{row.title}</td>
                    <td className="p-3 capitalize font-mono text-slate-700">{row.actual}</td>
                    <td className="p-3 capitalize font-mono text-slate-700">{row.predicted}</td>
                    <td className="p-3 text-right font-mono tabular-nums">{row.threatScore}%</td>
                    <td className="p-3 text-center">
                      {row.correct ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-medium">
                          <CheckCircle2 className="w-3 h-3" />
                          Correct
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-medium">
                          <XCircle className="w-3 h-3" />
                          Mismatch
                        </span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filteredCases.length > PAGE_SIZE && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-slate-600 tabular-nums">
            <span>
              Showing <strong>{((safePage - 1) * PAGE_SIZE + 1).toLocaleString()}</strong>–
              <strong>{Math.min(safePage * PAGE_SIZE, filteredCases.length).toLocaleString()}</strong> of{' '}
              <strong>{filteredCases.length.toLocaleString()}</strong> rows
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setTablePage(p => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="px-3 py-1 bg-white hover:bg-slate-100 disabled:opacity-40 border border-slate-200 rounded-full font-medium cursor-pointer"
              >
                Prev
              </button>
              <span className="px-2 font-mono">
                Page <strong>{safePage}</strong> / {totalPages.toLocaleString()}
              </span>
              <button
                type="button"
                onClick={() => setTablePage(p => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="px-3 py-1 bg-white hover:bg-slate-100 disabled:opacity-40 border border-slate-200 rounded-full font-medium cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
