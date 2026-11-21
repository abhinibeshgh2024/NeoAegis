/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { Target, Mail, Image as ImageIcon } from 'lucide-react';
import { EmailLabel, EmailRecord, TrainedModelArtifact } from './types';
import {
  CollectiveBackendStats,
  loadUserBatchRows,
  loadUserImageAssessments,
  loadUserTrainerImages,
  loadUserTrainerSamples
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

interface RealAccuracyBreakdown {
  mailCorrect: number;
  mailTotal: number;
  mailAccuracyPct: number | null;
  imageCorrect: number;
  imageTotal: number;
  imageAccuracyPct: number | null;
  totalCorrect: number;
  totalAssessments: number;
  overallAccuracyPct: number | null;
}

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
  const accuracy = useMemo<RealAccuracyBreakdown>(() => {
    // 1. REAL MAIL ASSESSMENTS — strictly ONLY mails parsed/assessed by THIS signed-in user
    const seenMails = new Set<string>();
    let mailCorrect = 0;
    let mailTotal = 0;

    const evaluateMail = (
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
      const res = analyzeEmailWithModel(subject, body, headers, sender);
      const predThreat = res.metrics.spamScore >= 50 || res.metrics.phishingLikelihood >= 55;
      const predictedLabel: EmailLabel = res.modelPrediction
        ? res.modelPrediction.predictedLabel
        : predThreat
        ? res.metrics.phishingLikelihood >= 55
          ? 'phishing'
          : 'spam'
        : 'legitimate';

      mailTotal++;
      if (predictedLabel === actualLabel) {
        mailCorrect++;
      }
    };

    if (currentUserUid) {
      // Mails parsed via Batch CSV Auditor for this user
      const batchRows = loadUserBatchRows(currentUserUid) || [];
      for (const row of batchRows) {
        const lbl: EmailLabel =
          row.actualLabel || (row.actual === 'ham' ? 'legitimate' : 'spam');
        evaluateMail(
          row.subject || '(No Subject)',
          row.body || '',
          row.sender || 'unknown@sender.org',
          row.rawHeaders,
          lbl
        );
      }

      // Mails parsed & confirmed via Mail Body Scanner / Trainer dataset for this user
      const trainerSamples = loadUserTrainerSamples(currentUserUid) || [];
      for (const sample of trainerSamples) {
        evaluateMail(
          sample.subject,
          sample.body,
          sample.sender,
          sample.rawHeaders,
          sample.label
        );
      }
    }

    // Labeled Mail Body Scanner / Vault records belonging to this user
    for (const rec of records) {
      if (isImageVaultRecord(rec)) continue;
      if (!rec.groundTruthLabel) continue;
      evaluateMail(
        rec.subject,
        rec.body,
        rec.sender,
        rec.rawHeaders,
        rec.groundTruthLabel
      );
    }

    // 2. REAL IMAGE ASSESSMENTS — strictly ONLY images assessed/staged by THIS signed-in user
    const seenImages = new Set<string>();
    let imageCorrect = 0;
    let imageTotal = 0;

    if (currentUserUid) {
      const assessedImages = loadUserImageAssessments(currentUserUid) || [];
      const trainerImages = loadUserTrainerImages(currentUserUid) || [];
      const allUserImages = [...assessedImages, ...trainerImages];

      for (const img of allUserImages) {
        const key = String(img.fileName || img.id || '').trim().toLowerCase();
        if (!key || seenImages.has(key)) continue;
        seenImages.add(key);

        const pred = predictImageWithModel(
          img.extractedFeatures,
          img.ocrText,
          activeModel?.imageUnit
        );
        imageTotal++;
        if (pred.predictedLabel === img.label) {
          imageCorrect++;
        }
      }
    }

    // Labeled [Image Scan] Vault records belonging to this user
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
      imageTotal++;
      if (predictedLabel === rec.groundTruthLabel) {
        imageCorrect++;
      }
    }

    const totalCorrect = mailCorrect + imageCorrect;
    const totalAssessments = mailTotal + imageTotal;

    const mailAccuracyPct =
      mailTotal > 0 ? Number(((mailCorrect / mailTotal) * 100).toFixed(1)) : null;
    const imageAccuracyPct =
      imageTotal > 0 ? Number(((imageCorrect / imageTotal) * 100).toFixed(1)) : null;
    const overallAccuracyPct =
      totalAssessments > 0
        ? Number(((totalCorrect / totalAssessments) * 100).toFixed(1))
        : null;

    return {
      mailCorrect,
      mailTotal,
      mailAccuracyPct,
      imageCorrect,
      imageTotal,
      imageAccuracyPct,
      totalCorrect,
      totalAssessments,
      overallAccuracyPct
    };
  }, [records, activeModel, currentUserUid, syncTick]);

  return (
    <div className="space-y-6 animate-fade-in" id="performance-tab">
      {/* Overall Calculated Accuracy Card */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 md:p-8 shadow-3xs space-y-6">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2.5">
            <Target className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-medium text-slate-900">Overall Accuracy</h2>
          </div>
          <InfoButton
            title="Real Overall Accuracy"
            description="Calculated strictly from your own parsed Mail Assessments and Image Assessments using live active model predictions."
            align="right"
          />
        </div>

        <div className="text-center py-4 space-y-3 tabular-nums">
          <div className="text-5xl md:text-6xl font-bold font-mono tracking-tight text-emerald-700">
            {accuracy.overallAccuracyPct !== null ? `${accuracy.overallAccuracyPct.toFixed(1)}%` : '0.0%'}
          </div>
          <p className="text-xs font-mono text-slate-600">
            {accuracy.totalAssessments > 0
              ? `${accuracy.totalCorrect} / ${accuracy.totalAssessments} correct across your Mail & Image assessments`
              : '0 / 0 of your parsed Mail & Image assessments evaluated yet'}
          </p>

          <div className="max-w-md mx-auto w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-emerald-600 h-full transition-all duration-300"
              style={{ width: `${accuracy.overallAccuracyPct ?? 0}%` }}
            />
          </div>
        </div>

        {/* Component Breakdown: Mail Assessments + Image Assessments */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 tabular-nums">
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-slate-700">
                <Mail className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-medium">Mail Assessments</span>
              </div>
              <span className="text-xs font-mono text-slate-500 block">
                {accuracy.mailCorrect} / {accuracy.mailTotal} correct
              </span>
            </div>
            <span className="text-2xl font-semibold font-mono text-indigo-700">
              {accuracy.mailAccuracyPct !== null ? `${accuracy.mailAccuracyPct.toFixed(1)}%` : '—'}
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-slate-700">
                <ImageIcon className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-medium">Image Assessments</span>
              </div>
              <span className="text-xs font-mono text-slate-500 block">
                {accuracy.imageCorrect} / {accuracy.imageTotal} correct
              </span>
            </div>
            <span className="text-2xl font-semibold font-mono text-emerald-700">
              {accuracy.imageAccuracyPct !== null ? `${accuracy.imageAccuracyPct.toFixed(1)}%` : '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
