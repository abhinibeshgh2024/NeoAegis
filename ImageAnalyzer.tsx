/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Image, Upload, ShieldAlert, Sliders, RefreshCw,
  BrainCircuit, Database, CheckCircle2, ArrowRight
} from 'lucide-react';
import {
  EmailLabel,
  EmailRecord,
  ImagePredictionResult,
  ImageTrainingSample,
  TrainedModelArtifact
} from './types';
import {
  computeOcrKeywordRisk,
  extractImageTelemetryFromSource,
  generateStarterImageSamples,
  predictImageWithModel
} from './src/lib/imageVisionEngine';
import { analyzeEmailWithModel } from './spamEngine';
import InfoButton from './src/components/InfoButton';

interface ImageAnalyzerProps {
  activeModel?: TrainedModelArtifact | null;
  modelVersion?: number;
  onSendToTrainer?: (sample: ImageTrainingSample) => void;
  onSaveScanToVault?: (record: EmailRecord) => void;
}

export default function ImageAnalyzer({
  activeModel,
  modelVersion = 0,
  onSendToTrainer,
  onSaveScanToVault
}: ImageAnalyzerProps) {
  const [starterPresets, setStarterPresets] = useState<ImageTrainingSample[]>([]);
  const [activeSample, setActiveSample] = useState<ImageTrainingSample | null>(null);
  const [ocrDraft, setOcrDraft] = useState('');
  const [prediction, setPrediction] = useState<ImagePredictionResult | null>(null);
  const [analyzing, setAnalyzing] = useState(true);
  const [feedbackLabel, setFeedbackLabel] = useState<EmailLabel>('phishing');
  const [actionBanner, setActionBanner] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize deterministic canvas-generated presets on mount
  useEffect(() => {
    let mounted = true;
    generateStarterImageSamples().then(generated => {
      if (!mounted) return;
      // Pick 3 representative starters (1 phishing, 1 spam, 1 legitimate) for instant inspection
      const picked = [
        generated.find(g => g.id === 'img-seed-phish-1') || generated[0],
        generated.find(g => g.id === 'img-seed-spam-1') || generated[1],
        generated.find(g => g.id === 'img-seed-legit-1') || generated[2]
      ].filter(Boolean) as ImageTrainingSample[];

      setStarterPresets(picked);
      if (picked.length > 0) {
        const first = picked[0];
        setActiveSample(first);
        setOcrDraft(first.ocrText);
        setFeedbackLabel(first.label);
        setPrediction(
          predictImageWithModel(first.extractedFeatures, first.ocrText, activeModel?.imageUnit)
        );
      }
      setAnalyzing(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Immediately re-score active image whenever user trains, imports, or resets Image Training Unit
  useEffect(() => {
    if (!activeSample) return;
    setPrediction(
      predictImageWithModel(activeSample.extractedFeatures, ocrDraft, activeModel?.imageUnit)
    );
  }, [modelVersion, activeModel]);

  const selectPreset = async (preset: ImageTrainingSample) => {
    setActionBanner(null);
    setAnalyzing(true);
    setActiveSample(preset);
    setOcrDraft(preset.ocrText);
    setFeedbackLabel(preset.label);
    const pred = predictImageWithModel(preset.extractedFeatures, preset.ocrText, activeModel?.imageUnit);
    setPrediction(pred);
    setAnalyzing(false);
  };

  // Real client-side Canvas pixel & edge extraction for uploaded image files
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setActionBanner(null);
    setAnalyzing(true);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const urlStr = String(reader.result || '');
        const analyzed = await extractImageTelemetryFromSource(urlStr, '', file.size);
        const initialPred = predictImageWithModel(
          analyzed.extractedFeatures,
          '',
          activeModel?.imageUnit
        );

        const uploadedSample: ImageTrainingSample = {
          id: `img-up-${Date.now()}`,
          fileName: file.name,
          dataUrl: urlStr,
          width: analyzed.width,
          height: analyzed.height,
          ocrText: '',
          label: initialPred.predictedLabel,
          source: 'inspector',
          extractedFeatures: analyzed.extractedFeatures,
          telemetry: analyzed.telemetry
        };

        setActiveSample(uploadedSample);
        setOcrDraft('');
        setFeedbackLabel(initialPred.predictedLabel);
        setPrediction(initialPred);
      } catch (err) {
        setActionBanner(err instanceof Error ? err.message : 'Unable to parse uploaded image pixels.');
      } finally {
        setAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Recompute OCR feature & model prediction when analyst updates OCR/caption text
  const handleRecomputeWithOcr = async () => {
    if (!activeSample) return;
    setAnalyzing(true);
    try {
      const updated = await extractImageTelemetryFromSource(
        activeSample.dataUrl,
        ocrDraft,
        activeSample.telemetry.fileSizeKb * 1024
      );
      const refreshedSample: ImageTrainingSample = {
        ...activeSample,
        ocrText: ocrDraft,
        extractedFeatures: updated.extractedFeatures,
        telemetry: updated.telemetry
      };
      setActiveSample(refreshedSample);
      setPrediction(
        predictImageWithModel(refreshedSample.extractedFeatures, ocrDraft, activeModel?.imageUnit)
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSendSampleToTrainer = () => {
    if (!activeSample || !onSendToTrainer) return;
    const payload: ImageTrainingSample = {
      ...activeSample,
      id: `insp-${Date.now()}`,
      ocrText: ocrDraft,
      label: feedbackLabel,
      source: 'inspector'
    };
    onSendToTrainer(payload);
    setActionBanner(`Staged "${activeSample.fileName}" labeled as ${feedbackLabel.toUpperCase()} in Trainer.`);
  };

  const handleLogToVault = () => {
    if (!activeSample || !prediction || !onSaveScanToVault) return;
    const { suspiciousCount } = computeOcrKeywordRisk(ocrDraft);
    const bodyText = ocrDraft.trim() || `[Image Scan Telemetry] File: ${activeSample.fileName} (${activeSample.width}x${activeSample.height}, QR=${activeSample.telemetry.qrCodeDetected ? 'Detected' : 'None'})`;
    const headers = `From: visual-inspector@neoaegis.local\nSubject: [Image Scan] ${activeSample.fileName}\nDKIM: None\nSPF: None`;
    const baseAnalysis = analyzeEmailWithModel(`[Image Scan] ${activeSample.fileName}`, bodyText, headers, 'visual-inspector@neoaegis.local');

    const combinedSpam = Math.max(baseAnalysis.metrics.spamScore, prediction.spamScore);
    const combinedPhish = Math.max(baseAnalysis.metrics.phishingLikelihood, prediction.phishingLikelihood);

    const record: EmailRecord = {
      id: `imgscan-${Date.now()}`,
      subject: `[Image Scan] ${activeSample.fileName}`,
      sender: 'image-telemetry@neoaegis.local',
      recipient: 'analyst@neoaegis.local',
      body: bodyText,
      rawHeaders: headers,
      timestamp: new Date().toISOString(),
      isSpam: prediction.predictedLabel !== 'legitimate' || combinedSpam >= 50,
      metrics: {
        ...baseAnalysis.metrics,
        spamScore: combinedSpam,
        phishingLikelihood: combinedPhish,
        imageToTextPayloadRatio: Math.max(65, activeSample.telemetry.edgeTextDensity),
        ocrSuspiciousWordsCount: suspiciousCount,
        qrCodePresenceRisk: activeSample.telemetry.qrCodeDetected,
        visualColorRiskLevel: Math.max(
          activeSample.telemetry.saturationSpike,
          activeSample.telemetry.colorSpectrum.red + activeSample.telemetry.colorSpectrum.yellow
        ),
        defenseRating: Math.max(1, Math.round(100 - combinedSpam * 0.6 - combinedPhish * 0.4))
      }
    };

    onSaveScanToVault(record);
    setActionBanner(`Logged visual scan "${activeSample.fileName}" to your Personal Audit Stream & Vault.`);
  };

  const colorRiskPct = activeSample
    ? Math.min(100, activeSample.telemetry.saturationSpike)
    : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in text-left" id="image-analyzer-view">

      {/* Left panel: Image Upload, Raster Canvas Presets & Training Feedback */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 md:p-6 lg:col-span-5 space-y-5 flex flex-col justify-between shadow-3xs">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <Image className="text-indigo-600 h-5 w-5" />
              <h3 className="text-base font-medium text-slate-900">Image OCR &amp; Telemetry Inspector</h3>
            </div>
            <InfoButton
              title="Image OCR & Telemetry Inspector"
              description="Analyzes actual pixel color channels, saturation spikes, gradient text edge density, binary QR patterns, and OCR keywords using your locally trained Image Training Unit."
              align="right"
            />
          </div>

          {/* Preset selector */}
          <div>
            <span className="text-[11px] font-medium text-slate-500">Quick Inspection Samples</span>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {starterPresets.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectPreset(p)}
                  className={`px-2.5 py-2 text-[11px] rounded-lg border text-left transition cursor-pointer ${
                    activeSample?.id === p.id
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-700 font-semibold'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="block truncate">{p.fileName.replace('.png', '').replace(/_/g, ' ')}</span>
                  <span className="block text-[10px] text-slate-400 capitalize mt-0.5">{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Image Preview */}
          <div className="relative bg-slate-950 border border-slate-200 rounded-xl overflow-hidden aspect-video flex items-center justify-center shadow-xs">
            {analyzing || !activeSample ? (
              <div className="text-center space-y-2">
                <RefreshCw className="h-7 w-7 text-indigo-400 animate-spin mx-auto" />
                <span className="text-xs font-mono text-slate-300">Scanning pixel matrix &amp; edges...</span>
              </div>
            ) : (
              <>
                <img
                  src={activeSample.dataUrl}
                  alt={activeSample.fileName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain bg-white"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 via-slate-950/40 to-transparent p-3 flex items-end justify-between text-[11px] text-white pointer-events-none">
                  <span className="truncate font-medium max-w-[65%]">{activeSample.fileName}</span>
                  <span className="font-mono text-slate-200 tabular-nums">
                    {activeSample.width}&times;{activeSample.height} &middot; {activeSample.telemetry.fileSizeKb} KB
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* File Upload */}
        <div className="space-y-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/*"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-3.5 border-2 border-dashed border-slate-300 bg-white hover:bg-indigo-50/40 hover:border-indigo-400 rounded-xl transition text-center flex flex-col items-center justify-center space-y-1 cursor-pointer"
          >
            <Upload className="h-5 w-5 text-slate-500" />
            <span className="text-xs font-medium text-slate-700">Upload Image File for Pixel &amp; ML Inspection</span>
            <span className="text-[11px] text-slate-500">100% client-side Canvas analysis (PNG, JPG, WEBP)</span>
          </button>

          {/* Direct Workflow: Label & Send to Trainer + Log to Vault */}
          {activeSample && (
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-800">Workflow Actions</span>
                <select
                  value={feedbackLabel}
                  onChange={e => setFeedbackLabel(e.target.value as EmailLabel)}
                  aria-label="Ground truth label for training"
                  className="bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg text-xs font-medium capitalize cursor-pointer"
                >
                  <option value="legitimate">Label: Legitimate</option>
                  <option value="spam">Label: Spam</option>
                  <option value="phishing">Label: Phishing</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {onSendToTrainer && (
                  <button
                    type="button"
                    onClick={handleSendSampleToTrainer}
                    className="py-2 px-3 bg-indigo-600 hover:bg-indigo-750 text-white rounded-full text-xs font-medium transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <BrainCircuit className="w-3.5 h-3.5" />
                    <span>Send to Image Trainer</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
                {onSaveScanToVault && (
                  <button
                    type="button"
                    onClick={handleLogToVault}
                    className="py-2 px-3 bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-full text-xs font-medium transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Database className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Save Scan to Vault</span>
                  </button>
                )}
              </div>

              {actionBanner && (
                <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-[11px] flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{actionBanner}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right panel: Active ML Model Inference + Pixel Telemetry & OCR Extractor */}
      <div className="space-y-6 lg:col-span-7">
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 md:p-6 space-y-5 shadow-3xs">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
            <div className="flex items-center space-x-2">
              <Sliders className="h-5 w-5 text-indigo-600" />
              <h3 className="text-sm font-semibold text-slate-900">Pixel Vision &amp; Trained Image Scoring</h3>
            </div>
            {prediction && (
              <span
                className={`px-3 py-1 text-xs font-mono rounded-full font-semibold ${
                  prediction.spamScore >= 50
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}
              >
                Threat Score: {prediction.spamScore}% ({prediction.predictedLabel.toUpperCase()})
              </span>
            )}
          </div>

          {/* Active Visual ML Engine Inference Box */}
          {prediction && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-slate-600">
                  Visual Engine:{' '}
                  <strong className={prediction.isCustomModel ? 'text-emerald-700' : 'text-indigo-700'}>
                    {prediction.isCustomModel
                      ? `Trained Local Image Unit (${activeModel?.imageUnit?.datasetSize || 0} samples · ${Math.round((activeModel?.imageUnit?.evaluation.accuracy || 0) * 100)}% Test Acc)`
                      : 'Baseline Pixel Heuristics (Train in Trainer → Image Unit)'}
                  </strong>
                </span>
                <span className="font-mono text-[11px] font-semibold text-slate-800 uppercase">
                  Phishing: {prediction.phishingLikelihood}%
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 font-mono text-[11px] tabular-nums">
                <div className="bg-slate-50 border border-slate-200 p-2 rounded-lg text-center">
                  <span className="text-slate-500 block">Legitimate</span>
                  <strong className="text-emerald-700">{(prediction.probabilities.legitimate * 100).toFixed(1)}%</strong>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-2 rounded-lg text-center">
                  <span className="text-slate-500 block">Spam</span>
                  <strong className="text-amber-700">{(prediction.probabilities.spam * 100).toFixed(1)}%</strong>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-2 rounded-lg text-center">
                  <span className="text-slate-500 block">Phishing</span>
                  <strong className="text-red-700">{(prediction.probabilities.phishing * 100).toFixed(1)}%</strong>
                </div>
              </div>

              {prediction.topContributors.length > 0 && (
                <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-mono text-slate-600">
                  <span className="text-slate-400 font-sans">Top Signal Drivers:</span>
                  {prediction.topContributors.slice(0, 4).map(c => (
                    <span key={c.feature}>
                      {c.feature} (<strong className="text-indigo-700">{c.contribution >= 0 ? `+${c.contribution}` : c.contribution}</strong>)
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* OCR Text Input / Extraction Block */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700">Embedded / Extracted Image Text (OCR Buffer)</span>
              <button
                type="button"
                onClick={handleRecomputeWithOcr}
                className="text-[11px] font-medium text-indigo-700 hover:underline cursor-pointer"
              >
                Re-score with OCR Text
              </button>
            </div>
            <textarea
              rows={2}
              value={ocrDraft}
              onChange={e => setOcrDraft(e.target.value)}
              placeholder="Paste or edit visible text from an uploaded screenshot to combine pixel + OCR ML inference..."
              className="w-full bg-white border border-slate-200 p-3 rounded-xl font-mono text-xs text-slate-700 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Measured RGBY Color Spectrum Breakdown */}
          {activeSample && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 tabular-nums">
                <div className="bg-white p-3 rounded-xl border border-slate-200 text-center">
                  <span className="text-[10px] font-mono text-slate-500">RED CHANNEL</span>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div className="bg-red-500 h-full" style={{ width: `${activeSample.telemetry.colorSpectrum.red}%` }} />
                  </div>
                  <span className="text-xs font-mono font-semibold text-slate-800 mt-1 block">
                    {activeSample.telemetry.colorSpectrum.red}%
                  </span>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200 text-center">
                  <span className="text-[10px] font-mono text-slate-500">YELLOW / GOLD</span>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div className="bg-amber-500 h-full" style={{ width: `${activeSample.telemetry.colorSpectrum.yellow}%` }} />
                  </div>
                  <span className="text-xs font-mono font-semibold text-slate-800 mt-1 block">
                    {activeSample.telemetry.colorSpectrum.yellow}%
                  </span>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200 text-center">
                  <span className="text-[10px] font-mono text-slate-500">GREEN CHANNEL</span>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div className="bg-emerald-500 h-full" style={{ width: `${activeSample.telemetry.colorSpectrum.green}%` }} />
                  </div>
                  <span className="text-xs font-mono font-semibold text-slate-800 mt-1 block">
                    {activeSample.telemetry.colorSpectrum.green}%
                  </span>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200 text-center">
                  <span className="text-[10px] font-mono text-slate-500">BLUE CHANNEL</span>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div className="bg-indigo-500 h-full" style={{ width: `${activeSample.telemetry.colorSpectrum.blue}%` }} />
                  </div>
                  <span className="text-xs font-mono font-semibold text-slate-800 mt-1 block">
                    {activeSample.telemetry.colorSpectrum.blue}%
                  </span>
                </div>
              </div>

              {/* Raster Diagnostic Indices */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 tabular-nums">
                <div className="p-3.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-800">Warning Saturation Spike</span>
                  <span className={`text-sm font-mono font-bold ${colorRiskPct > 45 ? 'text-red-600' : 'text-slate-700'}`}>
                    {colorRiskPct}%
                  </span>
                </div>

                <div className="p-3.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-800">Edge / Text Structure Density</span>
                  <span className="text-sm font-mono text-slate-700 font-bold">
                    {activeSample.telemetry.edgeTextDensity}%
                  </span>
                </div>

                <div className="p-3.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-800">QR Binary Pattern Score</span>
                  <span className={`text-sm font-mono font-bold ${activeSample.telemetry.qrPatternScore >= 48 ? 'text-amber-700' : 'text-slate-700'}`}>
                    {activeSample.telemetry.qrPatternScore}%
                  </span>
                </div>

                <div className="p-3.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-800">Luminance Pixel Entropy</span>
                  <span className="text-sm font-mono font-bold text-indigo-700">
                    {activeSample.telemetry.quantizedEntropy}%
                  </span>
                </div>
              </div>

              {activeSample.telemetry.qrCodeDetected && (
                <div className="bg-red-50 border border-red-200 p-3.5 rounded-xl flex items-center justify-between gap-3 text-xs text-red-800">
                  <div className="flex items-center space-x-2.5">
                    <ShieldAlert className="h-4 w-4 text-red-600 shrink-0" />
                    <span className="font-medium text-red-700">
                      High-Contrast QR / Matrix Lure Pattern Detected (Score: {activeSample.telemetry.qrPatternScore}%)
                    </span>
                  </div>
                  <InfoButton
                    title="Quishing Threat Vector"
                    description="Pixel edge-transition analysis detected dense black-and-white binary finder modules characteristic of QR-code phishing lures."
                    align="right"
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
