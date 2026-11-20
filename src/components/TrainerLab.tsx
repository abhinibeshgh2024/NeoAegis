/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  BrainCircuit, Upload, Download, Play, RotateCcw, Plus, Trash2,
  Database, CheckCircle2, AlertTriangle, FileJson, FileSpreadsheet,
  Sliders, Sparkles, Search, Layers, Image as ImageIcon, Eye
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, BarChart, Bar
} from 'recharts';
import {
  EmailLabel,
  EmailRecord,
  TrainingSample,
  ImageTrainingSample,
  EpochTelemetry,
  TrainedModelArtifact,
  LocalPredictionResult,
  ImagePredictionResult
} from '../../types';
import {
  STARTER_TRAINING_CORPUS,
  parseDatasetFileContent,
  trainLocalClassifier,
  clearUserTrainedModel,
  validateAndImportModelJson,
  predictWithModel,
  saveUserTrainedImageUnit
} from '../lib/localMlEngine';
import {
  extractImageTelemetryFromSource,
  generateStarterImageSamples,
  predictImageWithModel,
  trainImageClassifier
} from '../lib/imageVisionEngine';
import InfoButton from './InfoButton';

interface TrainerLabProps {
  currentUserUid: string;
  auditEmails: EmailRecord[];
  activeModel: TrainedModelArtifact | null;
  onModelUpdated: (model: TrainedModelArtifact | null) => void;
  incomingEmailSamples?: TrainingSample[];
  incomingImageSamples?: ImageTrainingSample[];
  preferredUnit?: 'text' | 'image';
}

export default function TrainerLab({
  currentUserUid,
  auditEmails,
  activeModel,
  onModelUpdated,
  incomingEmailSamples = [],
  incomingImageSamples = [],
  preferredUnit
}: TrainerLabProps) {
  // Active Unit Mode inside Trainer: Text & Header Unit vs Image Training Unit
  const [trainerUnit, setTrainerUnit] = useState<'text' | 'image'>(preferredUnit || 'text');

  useEffect(() => {
    if (preferredUnit) {
      setTrainerUnit(preferredUnit);
    }
  }, [preferredUnit]);

  // Text Dataset Staging State
  const [samples, setSamples] = useState<TrainingSample[]>(() => [...STARTER_TRAINING_CORPUS]);
  const [labelFilter, setLabelFilter] = useState<'all' | EmailLabel>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddSample, setShowAddSample] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newSender, setNewSender] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newLabel, setNewLabel] = useState<EmailLabel>('phishing');

  // Image Dataset Staging State
  const [imageSamples, setImageSamples] = useState<ImageTrainingSample[]>([]);
  const [imageFilter, setImageFilter] = useState<'all' | EmailLabel>('all');
  const [imageSearch, setImageSearch] = useState('');
  const [uploadImageLabel, setUploadImageLabel] = useState<EmailLabel>('phishing');
  const [uploadImageOcr, setUploadImageOcr] = useState('');
  const [imageProbeSample, setImageProbeSample] = useState<ImageTrainingSample | null>(null);
  const [imageProbeOcr, setImageProbeOcr] = useState('');
  const [imageProbeResult, setImageProbeResult] = useState<ImagePredictionResult | null>(null);

  // Shared Training Hyperparameters
  const [trainSplitPct, setTrainSplitPct] = useState<number>(80);
  const [learningRate, setLearningRate] = useState<number>(0.25);
  const [smoothingLambda, setSmoothingLambda] = useState<number>(0.01);
  const [epochs, setEpochs] = useState<number>(40);

  // Training Execution & Live Telemetry
  const [isTraining, setIsTraining] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState(0);
  const [liveHistory, setLiveHistory] = useState<EpochTelemetry[]>(
    () => activeModel?.history || []
  );
  const [liveImageHistory, setLiveImageHistory] = useState<EpochTelemetry[]>(
    () => activeModel?.imageUnit?.history || []
  );
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Weight Inspector Tab
  const [inspectorClass, setInspectorClass] = useState<EmailLabel>('phishing');

  // Quick Text Inference Sandbox inside Trainer
  const [probeSubject, setProbeSubject] = useState('Urgent: Verify corporate wire instructions within 24 hours');
  const [probeSender, setProbeSender] = useState('finance-verify@secures-portal.xyz');
  const [probeBody, setProbeBody] = useState('Dear customer, immediately confirm your bank routing credentials to avoid account suspension.');
  const [probeResult, setProbeResult] = useState<LocalPredictionResult | null>(null);

  const datasetFileRef = useRef<HTMLInputElement>(null);
  const modelImportRef = useRef<HTMLInputElement>(null);
  const imageUploadRef = useRef<HTMLInputElement>(null);
  const imageProbeRef = useRef<HTMLInputElement>(null);

  // Seed 12 canvas-generated starter images on mount for Image Training Unit
  useEffect(() => {
    let mounted = true;
    generateStarterImageSamples().then(starterImgs => {
      if (!mounted) return;
      setImageSamples(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const additions = starterImgs.filter(s => !existingIds.has(s.id));
        return [...prev, ...additions];
      });
      if (starterImgs.length > 0) {
        setImageProbeSample(prev => prev || starterImgs[8] || starterImgs[0]);
        setImageProbeOcr(prev => prev || starterImgs[8]?.ocrText || starterImgs[0].ocrText);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Merge incoming email samples sent from Mail Body Scanner
  useEffect(() => {
    if (incomingEmailSamples.length === 0) return;
    setSamples(prev => {
      const existing = new Set(prev.map(s => s.id));
      const newOnes = incomingEmailSamples.filter(s => !existing.has(s.id));
      return newOnes.length > 0 ? [...newOnes, ...prev] : prev;
    });
  }, [incomingEmailSamples]);

  // Merge incoming image samples sent from Image OCR Inspector
  useEffect(() => {
    if (incomingImageSamples.length === 0) return;
    setImageSamples(prev => {
      const existing = new Set(prev.map(s => s.id));
      const newOnes = incomingImageSamples.filter(s => !existing.has(s.id));
      return newOnes.length > 0 ? [...newOnes, ...prev] : prev;
    });
  }, [incomingImageSamples]);

  const hasTrainedTextUnit = Boolean(
    activeModel && (activeModel.datasetSize > 0 || activeModel.vocabulary.length > 0)
  );
  const activeImageUnit = activeModel?.imageUnit || null;

  // Text class counts
  const classCounts = useMemo(() => {
    const counts = { legitimate: 0, spam: 0, phishing: 0 };
    samples.forEach(s => {
      counts[s.label]++;
    });
    return counts;
  }, [samples]);

  // Image class counts
  const imageClassCounts = useMemo(() => {
    const counts = { legitimate: 0, spam: 0, phishing: 0 };
    imageSamples.forEach(s => {
      counts[s.label]++;
    });
    return counts;
  }, [imageSamples]);

  // Filtered text table rows
  const filteredSamples = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return samples.filter(s => {
      if (labelFilter !== 'all' && s.label !== labelFilter) return false;
      if (!q) return true;
      return (
        s.subject.toLowerCase().includes(q) ||
        s.sender.toLowerCase().includes(q) ||
        s.body.toLowerCase().includes(q)
      );
    });
  }, [samples, labelFilter, searchQuery]);

  // Filtered image rows
  const filteredImageSamples = useMemo(() => {
    const q = imageSearch.trim().toLowerCase();
    return imageSamples.filter(s => {
      if (imageFilter !== 'all' && s.label !== imageFilter) return false;
      if (!q) return true;
      return (
        s.fileName.toLowerCase().includes(q) ||
        s.ocrText.toLowerCase().includes(q)
      );
    });
  }, [imageSamples, imageFilter, imageSearch]);

  // Active chart history depends on active unit
  const chartHistory =
    trainerUnit === 'text'
      ? isTraining
        ? liveHistory
        : hasTrainedTextUnit && activeModel?.history.length
        ? activeModel.history
        : liveHistory
      : isTraining
      ? liveImageHistory
      : activeImageUnit?.history || liveImageHistory;

  const latestTelemetry = chartHistory.length > 0 ? chartHistory[chartHistory.length - 1] : null;

  // Upload CSV or JSON text dataset
  const handleDatasetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatusMessage(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = String(ev.target?.result || '');
        const parsed = parseDatasetFileContent(text, file.name);
        if (parsed.length === 0) {
          setStatusMessage({
            type: 'error',
            text: 'No valid records found. Ensure your CSV/JSON includes subject, body, sender, and label fields.'
          });
          return;
        }
        setSamples(prev => [...parsed, ...prev]);
        setStatusMessage({
          type: 'success',
          text: `Ingested ${parsed.length} labeled text samples from "${file.name}".`
        });
      } catch (err: any) {
        setStatusMessage({
          type: 'error',
          text: err?.message || 'Failed to parse dataset file.'
        });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Upload real images into the Image Training Unit (supports multiple selection)
  const handleUploadTrainingImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    setStatusMessage(null);

    const files: File[] = Array.from(fileList);
    const added: ImageTrainingSample[] = [];
    let failedCount = 0;

    for (let idx = 0; idx < files.length; idx++) {
      const file = files[idx];
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('File read error'));
          reader.readAsDataURL(file);
        });

        const parsed = await extractImageTelemetryFromSource(dataUrl, uploadImageOcr, file.size);
        added.push({
          id: `img-train-${Date.now()}-${idx}`,
          fileName: file.name,
          dataUrl,
          width: parsed.width,
          height: parsed.height,
          ocrText: uploadImageOcr.trim(),
          label: uploadImageLabel,
          source: 'upload',
          extractedFeatures: parsed.extractedFeatures,
          telemetry: parsed.telemetry
        });
      } catch {
        failedCount++;
      }
    }

    if (added.length > 0) {
      setImageSamples(prev => [...added, ...prev]);
      setUploadImageOcr('');
      setStatusMessage({
        type: 'success',
        text: `Ingested ${added.length} labeled image(s) (${uploadImageLabel}) with real Canvas pixel features extracted.${failedCount ? ` (${failedCount} skipped)` : ''}`
      });
    } else if (failedCount > 0) {
      setStatusMessage({
        type: 'error',
        text: 'Could not decode the selected image file(s). Ensure valid PNG, JPG, or WEBP format.'
      });
    }
    e.target.value = '';
  };

  // Import samples directly from user's Personal Audit Stream
  const handleImportFromAuditStream = () => {
    setStatusMessage(null);
    if (auditEmails.length === 0) {
      setStatusMessage({
        type: 'error',
        text: 'Your Personal Audit Stream is currently empty. Scan emails first or load the starter corpus.'
      });
      return;
    }

    const existingSubjects = new Set(samples.map(s => `${s.subject}::${s.sender}`.toLowerCase()));
    const imported: TrainingSample[] = [];

    auditEmails.forEach(mail => {
      const key = `${mail.subject}::${mail.sender}`.toLowerCase();
      if (existingSubjects.has(key)) return;
      const inferredLabel: EmailLabel =
        mail.metrics.phishingLikelihood >= 55
          ? 'phishing'
          : mail.isSpam || mail.metrics.spamScore >= 50
          ? 'spam'
          : 'legitimate';

      imported.push({
        id: `audit-${mail.id}-${Date.now()}`,
        subject: mail.subject,
        body: mail.body,
        sender: mail.sender,
        rawHeaders: mail.rawHeaders,
        label: inferredLabel,
        source: 'audit_stream'
      });
    });

    if (imported.length === 0) {
      setStatusMessage({
        type: 'success',
        text: 'All emails from your Personal Audit Stream are already staged in the training set.'
      });
      return;
    }

    setSamples(prev => [...imported, ...prev]);
    setStatusMessage({
      type: 'success',
      text: `Imported ${imported.length} sample(s) from your Personal Audit Stream. Re-label any row below before training.`
    });
  };

  const handleLoadStarterCorpus = () => {
    const existingIds = new Set(samples.map(s => s.id));
    const missing = STARTER_TRAINING_CORPUS.filter(s => !existingIds.has(s.id));
    if (missing.length === 0) {
      setSamples([...STARTER_TRAINING_CORPUS]);
    } else {
      setSamples(prev => [...prev, ...missing]);
    }
    setStatusMessage({
      type: 'success',
      text: 'Loaded 24 balanced starter text training samples (legitimate, spam, phishing).'
    });
  };

  const handleLoadStarterImages = async () => {
    const starterImgs = await generateStarterImageSamples();
    setImageSamples(prev => {
      const existingIds = new Set(prev.map(s => s.id));
      const missing = starterImgs.filter(s => !existingIds.has(s.id));
      return missing.length === 0 ? [...starterImgs] : [...prev, ...missing];
    });
    setStatusMessage({
      type: 'success',
      text: 'Loaded 12 starter raster image samples (invoices, QR phishing lures, spam flyers, corporate diagrams).'
    });
  };

  const handleDownloadSampleTemplate = () => {
    const header = 'subject,body,sender,label';
    const rows = STARTER_TRAINING_CORPUS.slice(0, 6).map(s => {
      const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
      return [esc(s.subject), esc(s.body), esc(s.sender), esc(s.label)].join(',');
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'neoaegis_training_dataset_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleAddManualSample = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim() || !newBody.trim()) return;
    const item: TrainingSample = {
      id: `manual-${Date.now()}`,
      subject: newSubject.trim(),
      sender: newSender.trim() || 'analyst@organization.com',
      body: newBody.trim(),
      label: newLabel,
      source: 'manual'
    };
    setSamples(prev => [item, ...prev]);
    setNewSubject('');
    setNewSender('');
    setNewBody('');
    setShowAddSample(false);
    setStatusMessage({ type: 'success', text: `Added manual sample labeled "${newLabel}".` });
  };

  const handleUpdateSampleLabel = (id: string, updatedLabel: EmailLabel) => {
    setSamples(prev => prev.map(s => (s.id === id ? { ...s, label: updatedLabel } : s)));
  };

  const handleRemoveSample = (id: string) => {
    setSamples(prev => prev.filter(s => s.id !== id));
  };

  const handleUpdateImageLabel = (id: string, updatedLabel: EmailLabel) => {
    setImageSamples(prev => prev.map(s => (s.id === id ? { ...s, label: updatedLabel } : s)));
  };

  const handleUpdateImageOcr = async (id: string, newOcr: string) => {
    const target = imageSamples.find(s => s.id === id);
    if (!target) return;
    try {
      const refreshed = await extractImageTelemetryFromSource(
        target.dataUrl,
        newOcr,
        target.telemetry.fileSizeKb * 1024
      );
      setImageSamples(prev =>
        prev.map(s =>
          s.id === id
            ? {
                ...s,
                ocrText: newOcr,
                extractedFeatures: refreshed.extractedFeatures,
                telemetry: refreshed.telemetry
              }
            : s
        )
      );
    } catch {
      setImageSamples(prev => prev.map(s => (s.id === id ? { ...s, ocrText: newOcr } : s)));
    }
  };

  const handleRemoveImageSample = (id: string) => {
    setImageSamples(prev => prev.filter(s => s.id !== id));
  };

  // Run 100% client-side Text ML training
  const handleTrainTextModel = async () => {
    setStatusMessage(null);
    if (samples.length < 4) {
      setStatusMessage({ type: 'error', text: 'Add at least 4 labeled emails before training the Text Unit.' });
      return;
    }

    setIsTraining(true);
    setTrainingProgress(0);
    setLiveHistory([]);
    setProbeResult(null);

    try {
      const trained = await trainLocalClassifier(
        samples,
        currentUserUid,
        {
          trainSplitRatio: trainSplitPct / 100,
          learningRate,
          smoothingLambda,
          epochs
        },
        (pct, telemetry) => {
          setTrainingProgress(pct);
          setLiveHistory(prev => [...prev, telemetry]);
        },
        activeModel?.imageUnit
      );

      onModelUpdated(trained);
      setStatusMessage({
        type: 'success',
        text: `Text Classifier trained (${trained.vocabularySize} tokens, ${(trained.evaluation.accuracy * 100).toFixed(1)}% test accuracy) and activated across all scanners.`
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Text model training failed.' });
    } finally {
      setIsTraining(false);
    }
  };

  // Run 100% client-side Image ML training
  const handleTrainImageModel = async () => {
    setStatusMessage(null);
    if (imageSamples.length < 4) {
      setStatusMessage({
        type: 'error',
        text: 'Add at least 4 labeled images before training the Image Training Unit.'
      });
      return;
    }

    setIsTraining(true);
    setTrainingProgress(0);
    setLiveImageHistory([]);
    setImageProbeResult(null);

    try {
      const trainedImg = await trainImageClassifier(
        imageSamples,
        {
          trainSplitRatio: trainSplitPct / 100,
          learningRate,
          smoothingLambda,
          epochs
        },
        (pct, telemetry) => {
          setTrainingProgress(pct);
          setLiveImageHistory(prev => [...prev, telemetry]);
        }
      );

      const mergedArtifact = saveUserTrainedImageUnit(currentUserUid, trainedImg);
      onModelUpdated(mergedArtifact);
      setStatusMessage({
        type: 'success',
        text: `Image Training Unit converged (${trainedImg.datasetSize} images, ${(trainedImg.evaluation.accuracy * 100).toFixed(1)}% test accuracy, ${(trainedImg.evaluation.f1Score * 100).toFixed(1)}% F1) and activated in Image OCR Inspector.`
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Image model training failed.' });
    } finally {
      setIsTraining(false);
    }
  };

  // Train unified Text + Image workflow together in one click
  const handleTrainFullSuite = async () => {
    setStatusMessage(null);
    if (samples.length < 4 || imageSamples.length < 4) {
      setStatusMessage({
        type: 'error',
        text: 'Both Text (>=4 emails) and Image (>=4 images) datasets are required for unified training.'
      });
      return;
    }

    setIsTraining(true);
    setTrainingProgress(0);
    setLiveHistory([]);
    setLiveImageHistory([]);
    setProbeResult(null);
    setImageProbeResult(null);

    try {
      const trainedImg = await trainImageClassifier(
        imageSamples,
        {
          trainSplitRatio: trainSplitPct / 100,
          learningRate,
          smoothingLambda,
          epochs
        },
        (pct, telemetry) => {
          setTrainingProgress(Math.round(pct * 0.5));
          setLiveImageHistory(prev => [...prev, telemetry]);
        }
      );

      const trainedFull = await trainLocalClassifier(
        samples,
        currentUserUid,
        {
          trainSplitRatio: trainSplitPct / 100,
          learningRate,
          smoothingLambda,
          epochs
        },
        (pct, telemetry) => {
          setTrainingProgress(50 + Math.round(pct * 0.5));
          setLiveHistory(prev => [...prev, telemetry]);
        },
        trainedImg
      );

      onModelUpdated(trainedFull);
      setStatusMessage({
        type: 'success',
        text: `Full Suite Trained! Text Acc: ${(trainedFull.evaluation.accuracy * 100).toFixed(1)}% | Image Acc: ${(trainedImg.evaluation.accuracy * 100).toFixed(1)}%. Both active across NeoAegis.`
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Unified training failed.' });
    } finally {
      setIsTraining(false);
    }
  };

  // Export trained model JSON (includes both Text + Image Unit weights)
  const handleExportModelJson = () => {
    if (!activeModel) return;
    const blob = new Blob([JSON.stringify(activeModel, null, 2)], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `neoaegis_local_model_${currentUserUid.slice(0, 8)}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Import trained model JSON
  const handleImportModelJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatusMessage(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = validateAndImportModelJson(String(ev.target?.result || ''), currentUserUid);
        setLiveHistory(imported.history || []);
        setLiveImageHistory(imported.imageUnit?.history || []);
        onModelUpdated(imported);
        setStatusMessage({
          type: 'success',
          text: `Imported local model (${imported.vocabularySize} text tokens${imported.imageUnit ? ` + Image Unit (${imported.imageUnit.datasetSize} images)` : ''}) into your isolated profile.`
        });
      } catch (err: any) {
        setStatusMessage({
          type: 'error',
          text: err?.message || 'Invalid model JSON file.'
        });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Reset to baseline heuristic weights
  const handleResetBaseline = () => {
    clearUserTrainedModel(currentUserUid);
    onModelUpdated(null);
    setProbeResult(null);
    setImageProbeResult(null);
    setLiveHistory([]);
    setLiveImageHistory([]);
    setStatusMessage({
      type: 'success',
      text: 'Cleared custom text & image weights for your profile. Baseline heuristic engines are now active.'
    });
  };

  // Probe active text model
  const handleRunProbe = () => {
    if (!activeModel || !hasTrainedTextUnit) {
      setStatusMessage({
        type: 'error',
        text: 'Train or import the Text & Header Unit first to inspect per-token model inference.'
      });
      return;
    }
    const res = predictWithModel(probeSubject, probeBody, probeSender, `From: ${probeSender}`, activeModel);
    setProbeResult(res);
  };

  // Probe active image model
  const handleRunImageProbe = async () => {
    if (!imageProbeSample) return;
    const refreshed = await extractImageTelemetryFromSource(
      imageProbeSample.dataUrl,
      imageProbeOcr,
      imageProbeSample.telemetry.fileSizeKb * 1024
    );
    const res = predictImageWithModel(refreshed.extractedFeatures, imageProbeOcr, activeImageUnit);
    setImageProbeResult(res);
  };

  const handleUploadImageProbeFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = String(reader.result || '');
        const parsed = await extractImageTelemetryFromSource(dataUrl, imageProbeOcr, file.size);
        const probeObj: ImageTrainingSample = {
          id: `probe-${Date.now()}`,
          fileName: file.name,
          dataUrl,
          width: parsed.width,
          height: parsed.height,
          ocrText: imageProbeOcr,
          label: 'phishing',
          source: 'upload',
          extractedFeatures: parsed.extractedFeatures,
          telemetry: parsed.telemetry
        };
        setImageProbeSample(probeObj);
        setImageProbeResult(predictImageWithModel(parsed.extractedFeatures, imageProbeOcr, activeImageUnit));
      } catch (err: any) {
        setStatusMessage({ type: 'error', text: err?.message || 'Could not probe uploaded image.' });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Engineered feature weights chart data
  const engineeredWeightsChartData = useMemo(() => {
    if (!activeModel || !hasTrainedTextUnit) return [];
    return activeModel.engineeredFeatureNames.map((name, idx) => ({
      feature: name.replace(' Keyword Density', '').replace(' Signal', '').replace(' & Credential Mimicry', '').replace(' Indicators', ''),
      Legitimate: Number((activeModel.weights[0][idx] || 0).toFixed(3)),
      Spam: Number((activeModel.weights[1][idx] || 0).toFixed(3)),
      Phishing: Number((activeModel.weights[2][idx] || 0).toFixed(3))
    }));
  }, [activeModel, hasTrainedTextUnit]);

  const activeStageCount = trainerUnit === 'text' ? samples.length : imageSamples.length;
  const trainCountPreview = Math.max(1, Math.round((activeStageCount * trainSplitPct) / 100));
  const testCountPreview = Math.max(0, activeStageCount - trainCountPreview);

  return (
    <div className="space-y-6 animate-fade-in text-left" id="trainer-studio-view">

      {/* 1. Studio Header & Active Model Persistence Bar */}
      <div className="bg-[#f8f9fa] border border-[#dadce0] rounded-2xl p-5 flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-[#1a73e8]" />
              <h2 className="text-base font-medium text-[#202124]">Local ML Model &amp; Image Training Studio</h2>
              <InfoButton
                title="100% Client-Side ML & Vision Training"
                description="Trains both a TF-IDF + Security Feature Text Classifier and an HTML5 Canvas Visual/Image Classifier locally in your browser. Trained weights power Mail Body Scanner, Image OCR Inspector, Batch CSV Auditor, Overview Dashboard, and Accuracy & F1 Matrix."
                align="left"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#5f6368] tabular-nums">
              <span>
                Text Engine:{' '}
                <strong className={hasTrainedTextUnit ? 'text-[#137333]' : 'text-[#1a73e8]'}>
                  {hasTrainedTextUnit
                    ? `Trained (${activeModel?.vocabularySize} tokens · ${((activeModel?.evaluation.accuracy || 0) * 100).toFixed(1)}% Acc)`
                    : 'Baseline Heuristics'}
                </strong>
              </span>
              <span aria-hidden="true">&middot;</span>
              <span>
                Image Unit:{' '}
                <strong className={activeImageUnit ? 'text-[#137333]' : 'text-[#1a73e8]'}>
                  {activeImageUnit
                    ? `Trained (${activeImageUnit.datasetSize} imgs · ${(activeImageUnit.evaluation.accuracy * 100).toFixed(1)}% Acc)`
                    : 'Baseline Pixel Heuristics'}
                </strong>
              </span>
            </div>
          </div>

          {/* Model Persistence Actions: Export / Import / Reset */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={modelImportRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportModelJson}
              className="hidden"
            />

            <button
              type="button"
              onClick={handleExportModelJson}
              disabled={!activeModel}
              className="px-3.5 py-2 bg-white hover:bg-[#f1f3f4] disabled:opacity-45 text-[#3c4043] border border-[#dadce0] rounded-full text-xs font-medium transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5 text-[#1a73e8]" />
              <span>Export Weights (.json)</span>
            </button>

            <button
              type="button"
              onClick={() => modelImportRef.current?.click()}
              className="px-3.5 py-2 bg-white hover:bg-[#f1f3f4] text-[#3c4043] border border-[#dadce0] rounded-full text-xs font-medium transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <FileJson className="w-3.5 h-3.5 text-[#1e8e3e]" />
              <span>Import Weights (.json)</span>
            </button>

            <button
              type="button"
              onClick={handleResetBaseline}
              disabled={!activeModel}
              className="px-3.5 py-2 bg-white hover:bg-[#fce8e6] disabled:opacity-45 text-[#d93025] border border-[#dadce0] rounded-full text-xs font-medium transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Baseline</span>
            </button>
          </div>
        </div>

        {/* Unit Selector Bar + Unified Full-Suite Train Button */}
        <div className="pt-3 border-t border-[#dadce0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-white border border-[#dadce0] rounded-full w-fit" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={trainerUnit === 'text'}
              onClick={() => setTrainerUnit('text')}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                trainerUnit === 'text'
                  ? 'bg-[#e8f0fe] text-[#1967d2]'
                  : 'text-[#5f6368] hover:text-[#202124]'
              }`}
              id="trainer-unit-tab-text"
            >
              <BrainCircuit className="w-3.5 h-3.5" />
              <span>Text &amp; Header Unit ({samples.length})</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={trainerUnit === 'image'}
              onClick={() => setTrainerUnit('image')}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                trainerUnit === 'image'
                  ? 'bg-[#e8f0fe] text-[#1967d2]'
                  : 'text-[#5f6368] hover:text-[#202124]'
              }`}
              id="trainer-unit-tab-image"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Image Training Unit ({imageSamples.length})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleTrainFullSuite}
            disabled={isTraining || samples.length < 4 || imageSamples.length < 4}
            className="px-4 py-2 bg-[#137333] hover:bg-[#0d652d] disabled:opacity-45 text-white text-xs font-medium rounded-full transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            id="train-full-suite-btn"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Train Full Pipeline (Text + Image)</span>
          </button>
        </div>
      </div>

      {/* Inline Status / Error Banner */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
            statusMessage.type === 'error'
              ? 'bg-[#fce8e6] border-[#fad2cf] text-[#c5221f]'
              : 'bg-[#e6f4ea] border-[#a8dab5] text-[#137333]'
          }`}
        >
          {statusMessage.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* 2. Training Controls & Live Telemetry Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left: Hyperparameter Controls & Active Unit Train CTA */}
        <div className="lg:col-span-5 bg-[#f8f9fa] border border-[#dadce0] rounded-2xl p-5 space-y-5">
          <div className="flex items-center justify-between border-b border-[#dadce0] pb-3">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#1a73e8]" />
              <h3 className="text-sm font-medium text-[#202124]">
                {trainerUnit === 'image' ? 'Image Unit Hyperparameters' : 'Text Model Hyperparameters'}
              </h3>
            </div>
            <InfoButton
              title="Training Hyperparameters"
              description="Configure stratified train/test split ratio, gradient descent learning rate, L2 regularization penalty, and optimization epochs."
              align="right"
            />
          </div>

          <div className="space-y-4 text-xs">
            {/* Train/Test Split */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-medium text-[#3c4043]">Train / Test Split Ratio</label>
                <span className="font-mono text-[#1a73e8] tabular-nums font-medium">
                  {trainSplitPct}% / {100 - trainSplitPct}% ({trainCountPreview} / {testCountPreview})
                </span>
              </div>
              <input
                type="range"
                min={50}
                max={90}
                step={5}
                value={trainSplitPct}
                onChange={e => setTrainSplitPct(Number(e.target.value))}
                className="w-full accent-[#1a73e8] cursor-pointer"
              />
            </div>

            {/* Learning Rate */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-medium text-[#3c4043]">Learning Rate (&eta;)</label>
                <span className="font-mono text-[#1a73e8] tabular-nums font-medium">{learningRate.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0.05}
                max={1.0}
                step={0.05}
                value={learningRate}
                onChange={e => setLearningRate(Number(e.target.value))}
                className="w-full accent-[#1a73e8] cursor-pointer"
              />
            </div>

            {/* Smoothing / L2 Regularization */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-medium text-[#3c4043]">Smoothing &amp; L2 Penalty (&lambda;)</label>
                <span className="font-mono text-[#1a73e8] tabular-nums font-medium">{smoothingLambda.toFixed(3)}</span>
              </div>
              <input
                type="range"
                min={0.001}
                max={0.1}
                step={0.003}
                value={smoothingLambda}
                onChange={e => setSmoothingLambda(Number(e.target.value))}
                className="w-full accent-[#1a73e8] cursor-pointer"
              />
            </div>

            {/* Epochs */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-medium text-[#3c4043]">Optimization Epochs</label>
                <span className="font-mono text-[#1a73e8] tabular-nums font-medium">{epochs} epochs</span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={epochs}
                onChange={e => setEpochs(Number(e.target.value))}
                className="w-full accent-[#1a73e8] cursor-pointer"
              />
            </div>
          </div>

          {/* Dataset Mix Preview */}
          <div className="bg-white border border-[#dadce0] rounded-xl p-3.5 grid grid-cols-3 gap-2 text-center text-xs tabular-nums">
            <div>
              <span className="text-[11px] text-[#5f6368] block">Legitimate</span>
              <span className="text-base font-semibold text-[#137333]">
                {trainerUnit === 'text' ? classCounts.legitimate : imageClassCounts.legitimate}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-[#5f6368] block">Spam</span>
              <span className="text-base font-semibold text-[#e37400]">
                {trainerUnit === 'text' ? classCounts.spam : imageClassCounts.spam}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-[#5f6368] block">Phishing</span>
              <span className="text-base font-semibold text-[#d93025]">
                {trainerUnit === 'text' ? classCounts.phishing : imageClassCounts.phishing}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={trainerUnit === 'text' ? handleTrainTextModel : handleTrainImageModel}
            disabled={isTraining || activeStageCount < 4}
            className="w-full py-3 bg-[#1a73e8] hover:bg-[#1557b0] disabled:opacity-50 text-white text-xs font-medium rounded-full transition flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
            id="train-active-unit-btn"
          >
            <Play className="w-4 h-4" />
            <span>
              {isTraining
                ? `Training (${trainingProgress}%)...`
                : trainerUnit === 'image'
                ? 'Train Image Unit'
                : 'Train Text Model'}
            </span>
          </button>
        </div>

        {/* Right: Live Training Progress, Epoch Loss & Accuracy Telemetry */}
        <div className="lg:col-span-7 bg-[#f8f9fa] border border-[#dadce0] rounded-2xl p-5 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between border-b border-[#dadce0] pb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#1e8e3e]" />
              <h3 className="text-sm font-medium text-[#202124]">
                {trainerUnit === 'image' ? 'Image Unit Training Telemetry' : 'Text Model Training Telemetry'}
              </h3>
            </div>
            <InfoButton
              title="Epoch Telemetry"
              description="Streams cross-entropy loss decay alongside training and held-out test split accuracy across epochs."
              align="right"
            />
          </div>

          {/* Live Progress Bar & Current Epoch Readout */}
          <div className="bg-white border border-[#dadce0] rounded-xl p-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums">
              <span className="font-medium text-[#202124]">
                {isTraining
                  ? `Running Epoch ${latestTelemetry?.epoch || 1} of ${epochs}`
                  : chartHistory.length > 0
                  ? `Converged at Epoch ${chartHistory.length}`
                  : 'Ready to Train'}
              </span>
              <div className="flex items-center gap-3 font-mono text-[11px] text-[#5f6368]">
                <span>Loss: <strong className="text-[#d93025]">{latestTelemetry ? latestTelemetry.trainLoss.toFixed(4) : '--'}</strong></span>
                <span>Train: <strong className="text-[#1a73e8]">{latestTelemetry ? `${latestTelemetry.trainAccuracy}%` : '--'}</strong></span>
                <span>Test: <strong className="text-[#137333]">{latestTelemetry ? `${latestTelemetry.testAccuracy}%` : '--'}</strong></span>
              </div>
            </div>

            <div className="w-full h-2.5 bg-[#f1f3f4] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#1a73e8] transition-all duration-150"
                style={{
                  width: `${
                    isTraining
                      ? trainingProgress
                      : chartHistory.length > 0
                      ? 100
                      : 0
                  }%`
                }}
              />
            </div>
          </div>

          {/* Epoch Loss & Accuracy Chart */}
          <div className="h-56 w-full bg-white border border-[#dadce0] rounded-xl p-3">
            {chartHistory.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartHistory} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#dadce0" />
                  <XAxis dataKey="epoch" stroke="#5f6368" fontSize={11} />
                  <YAxis yAxisId="acc" domain={[0, 100]} stroke="#1e8e3e" fontSize={11} />
                  <YAxis yAxisId="loss" orientation="right" stroke="#d93025" fontSize={11} />
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#dadce0', fontSize: '11px', borderRadius: '10px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Line yAxisId="acc" type="monotone" dataKey="trainAccuracy" name="Train Acc (%)" stroke="#1a73e8" strokeWidth={2} dot={false} />
                  <Line yAxisId="acc" type="monotone" dataKey="testAccuracy" name="Test Acc (%)" stroke="#1e8e3e" strokeWidth={2} dot={false} />
                  <Line yAxisId="loss" type="monotone" dataKey="trainLoss" name="Cross-Entropy Loss" stroke="#d93025" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-xs text-[#5f6368] gap-2">
                {trainerUnit === 'image' ? (
                  <ImageIcon className="w-7 h-7 text-[#80868b]" />
                ) : (
                  <BrainCircuit className="w-7 h-7 text-[#80868b]" />
                )}
                <span>
                  Click {trainerUnit === 'image' ? 'Train Image Unit' : 'Train Text Model'} to stream epoch convergence metrics.
                </span>
              </div>
            )}
          </div>

          {/* Vocabulary / Feature & Evaluation Stats Strip */}
          {trainerUnit === 'text' ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs tabular-nums">
              <div className="bg-white border border-[#dadce0] rounded-xl p-3">
                <span className="text-[11px] text-[#5f6368] block">Vocabulary Tokens</span>
                <span className="text-base font-semibold text-[#202124] font-mono">
                  {hasTrainedTextUnit ? activeModel?.vocabularySize : 0}
                </span>
              </div>
              <div className="bg-white border border-[#dadce0] rounded-xl p-3">
                <span className="text-[11px] text-[#5f6368] block">Held-Out F1 Score</span>
                <span className="text-base font-semibold text-[#1a73e8] font-mono">
                  {hasTrainedTextUnit && activeModel ? `${(activeModel.evaluation.f1Score * 100).toFixed(1)}%` : '--'}
                </span>
              </div>
              <div className="bg-white border border-[#dadce0] rounded-xl p-3">
                <span className="text-[11px] text-[#5f6368] block">Precision / Recall</span>
                <span className="text-base font-semibold text-[#137333] font-mono">
                  {hasTrainedTextUnit && activeModel
                    ? `${(activeModel.evaluation.precision * 100).toFixed(0)}% / ${(activeModel.evaluation.recall * 100).toFixed(0)}%`
                    : '--'}
                </span>
              </div>
              <div className="bg-white border border-[#dadce0] rounded-xl p-3">
                <span className="text-[11px] text-[#5f6368] block">ROC AUC</span>
                <span className="text-base font-semibold text-[#e37400] font-mono">
                  {hasTrainedTextUnit && activeModel ? activeModel.evaluation.rocAUC.toFixed(3) : '--'}
                </span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs tabular-nums">
              <div className="bg-white border border-[#dadce0] rounded-xl p-3">
                <span className="text-[11px] text-[#5f6368] block">Visual + OCR Dims</span>
                <span className="text-base font-semibold text-[#202124] font-mono">
                  {activeImageUnit ? 8 + activeImageUnit.ocrVocabulary.length : 8}
                </span>
              </div>
              <div className="bg-white border border-[#dadce0] rounded-xl p-3">
                <span className="text-[11px] text-[#5f6368] block">Image F1 Score</span>
                <span className="text-base font-semibold text-[#1a73e8] font-mono">
                  {activeImageUnit ? `${(activeImageUnit.evaluation.f1Score * 100).toFixed(1)}%` : '--'}
                </span>
              </div>
              <div className="bg-white border border-[#dadce0] rounded-xl p-3">
                <span className="text-[11px] text-[#5f6368] block">Precision / Recall</span>
                <span className="text-base font-semibold text-[#137333] font-mono">
                  {activeImageUnit
                    ? `${(activeImageUnit.evaluation.precision * 100).toFixed(0)}% / ${(activeImageUnit.evaluation.recall * 100).toFixed(0)}%`
                    : '--'}
                </span>
              </div>
              <div className="bg-white border border-[#dadce0] rounded-xl p-3">
                <span className="text-[11px] text-[#5f6368] block">Image ROC AUC</span>
                <span className="text-base font-semibold text-[#e37400] font-mono">
                  {activeImageUnit ? activeImageUnit.evaluation.rocAUC.toFixed(3) : '--'}
                </span>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ============================================================================ */}
      {/* TEXT UNIT SECTION: Learned Weights + Quick Text Probe + Text Dataset Staging */}
      {/* ============================================================================ */}
      {trainerUnit === 'text' && (
        <>
          {hasTrainedTextUnit && activeModel && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 bg-white border border-[#dadce0] rounded-2xl p-5 space-y-5">
                <div className="flex items-center justify-between border-b border-[#dadce0] pb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#1a73e8]" />
                    <h3 className="text-sm font-medium text-[#202124]">Learned Security Feature &amp; Token Weights</h3>
                  </div>
                  <InfoButton
                    title="Learned Model Weights"
                    description="Shows how gradient descent weighted the 7 security indicators and top TF-IDF unigram/bigram tokens across Legitimate, Spam, and Phishing classes."
                    align="right"
                  />
                </div>

                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={engineeredWeightsChartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#dadce0" />
                      <XAxis dataKey="feature" stroke="#5f6368" fontSize={10} />
                      <YAxis stroke="#5f6368" fontSize={10} />
                      <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#dadce0', fontSize: '11px', borderRadius: '10px' }} />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Bar dataKey="Legitimate" fill="#1e8e3e" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="Spam" fill="#e37400" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="Phishing" fill="#d93025" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-3 pt-2 border-t border-[#f1f3f4]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-[#202124]">Top Weighted Vocabulary Tokens &amp; Bigrams</span>
                    <div className="flex items-center gap-1 bg-[#f1f3f4] p-1 rounded-full text-xs">
                      {(['phishing', 'spam', 'legitimate'] as EmailLabel[]).map(cls => (
                        <button
                          key={cls}
                          type="button"
                          onClick={() => setInspectorClass(cls)}
                          className={`px-3 py-1 rounded-full font-medium capitalize transition cursor-pointer ${
                            inspectorClass === cls
                              ? 'bg-white text-[#1a73e8] shadow-2xs'
                              : 'text-[#5f6368] hover:text-[#202124]'
                          }`}
                        >
                          {cls}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono tabular-nums">
                    {activeModel.topTokensByClass[inspectorClass].map(item => (
                      <div
                        key={item.token}
                        className="bg-[#f8f9fa] border border-[#dadce0] px-2.5 py-2 rounded-lg flex items-center justify-between gap-2"
                      >
                        <span className="truncate text-[#202124]" title={item.token}>{item.token}</span>
                        <span className={item.weight >= 0 ? 'text-[#1a73e8] font-semibold' : 'text-[#5f6368]'}>
                          {item.weight >= 0 ? `+${item.weight.toFixed(2)}` : item.weight.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 bg-white border border-[#dadce0] rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-[#dadce0] pb-3">
                  <h3 className="text-sm font-medium text-[#202124]">Quick Text Model Inference Probe</h3>
                  <InfoButton
                    title="Quick Model Inference Probe"
                    description="Test any sample subject, sender, and body directly against your trained text model and inspect class probabilities."
                    align="right"
                  />
                </div>

                <div className="space-y-2.5 text-xs">
                  <div>
                    <label className="block text-[11px] font-medium text-[#5f6368] mb-1">Sender Address</label>
                    <input
                      type="text"
                      value={probeSender}
                      onChange={e => setProbeSender(e.target.value)}
                      className="w-full bg-[#f8f9fa] border border-[#dadce0] px-3 py-2 rounded-xl font-mono text-xs focus:outline-none focus:border-[#1a73e8]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#5f6368] mb-1">Subject</label>
                    <input
                      type="text"
                      value={probeSubject}
                      onChange={e => setProbeSubject(e.target.value)}
                      className="w-full bg-[#f8f9fa] border border-[#dadce0] px-3 py-2 rounded-xl text-xs focus:outline-none focus:border-[#1a73e8]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#5f6368] mb-1">Body</label>
                    <textarea
                      rows={3}
                      value={probeBody}
                      onChange={e => setProbeBody(e.target.value)}
                      className="w-full bg-[#f8f9fa] border border-[#dadce0] px-3 py-2 rounded-xl text-xs focus:outline-none focus:border-[#1a73e8]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleRunProbe}
                    className="w-full py-2.5 bg-[#1a73e8] hover:bg-[#1557b0] text-white text-xs font-medium rounded-full transition cursor-pointer"
                  >
                    Score with Trained Text Model
                  </button>
                </div>

                {probeResult && (
                  <div className="bg-[#f8f9fa] border border-[#dadce0] rounded-xl p-3.5 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[#5f6368]">Predicted Class:</span>
                      <span
                        className={`font-semibold uppercase ${
                          probeResult.predictedLabel === 'phishing'
                            ? 'text-[#d93025]'
                            : probeResult.predictedLabel === 'spam'
                            ? 'text-[#e37400]'
                            : 'text-[#137333]'
                        }`}
                      >
                        {probeResult.predictedLabel}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 font-mono text-[11px] tabular-nums">
                      <div className="bg-white border border-[#dadce0] p-2 rounded-lg text-center">
                        <span className="text-[#5f6368] block">Legit</span>
                        <strong className="text-[#137333]">{(probeResult.probabilities.legitimate * 100).toFixed(1)}%</strong>
                      </div>
                      <div className="bg-white border border-[#dadce0] p-2 rounded-lg text-center">
                        <span className="text-[#5f6368] block">Spam</span>
                        <strong className="text-[#e37400]">{(probeResult.probabilities.spam * 100).toFixed(1)}%</strong>
                      </div>
                      <div className="bg-white border border-[#dadce0] p-2 rounded-lg text-center">
                        <span className="text-[#5f6368] block">Phishing</span>
                        <strong className="text-[#d93025]">{(probeResult.probabilities.phishing * 100).toFixed(1)}%</strong>
                      </div>
                    </div>

                    {probeResult.topContributors.length > 0 && (
                      <div className="pt-2 border-t border-[#dadce0] space-y-1">
                        <span className="text-[11px] text-[#5f6368] block">Key Contributing Features:</span>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-[#202124]">
                          {probeResult.topContributors.slice(0, 4).map(c => (
                            <span key={c.feature}>
                              {c.feature} ({c.contribution >= 0 ? `+${c.contribution}` : c.contribution})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Text Dataset Staging Table */}
          <div className="bg-white border border-[#dadce0] rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-[#dadce0] bg-[#f8f9fa] space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-[#1a73e8]" />
                  <h3 className="text-sm font-medium text-[#202124]">
                    Text Training Dataset Staging ({samples.length} samples)
                  </h3>
                  <InfoButton
                    title="Dataset Ingestion & Re-Labeling"
                    description="Upload .csv or .json datasets (subject, body, sender, label), import emails from your Personal Audit Stream, or re-label any row inline before training."
                    align="left"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={datasetFileRef}
                    type="file"
                    accept=".csv,.json,text/csv,application/json"
                    onChange={handleDatasetUpload}
                    className="hidden"
                  />

                  <button
                    type="button"
                    onClick={() => datasetFileRef.current?.click()}
                    className="px-3.5 py-2 bg-[#1a73e8] hover:bg-[#1557b0] text-white text-xs font-medium rounded-full transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload CSV / JSON</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleImportFromAuditStream}
                    className="px-3.5 py-2 bg-white hover:bg-[#e8f0fe] text-[#1a73e8] border border-[#dadce0] text-xs font-medium rounded-full transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Import Audit Stream ({auditEmails.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleLoadStarterCorpus}
                    className="px-3 py-2 bg-white hover:bg-[#f1f3f4] text-[#3c4043] border border-[#dadce0] text-xs font-medium rounded-full transition cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Load Starter Corpus
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowAddSample(prev => !prev)}
                    className="px-3 py-2 bg-white hover:bg-[#f1f3f4] text-[#3c4043] border border-[#dadce0] text-xs font-medium rounded-full transition flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Sample</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadSampleTemplate}
                    className="px-3 py-2 bg-white hover:bg-[#f1f3f4] text-[#5f6368] border border-[#dadce0] text-xs font-medium rounded-full transition flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                    title="Download sample CSV schema template"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-[#1e8e3e]" />
                    <span>Template CSV</span>
                  </button>

                  {samples.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSamples([])}
                      className="px-3 py-2 bg-white hover:bg-[#fce8e6] text-[#d93025] border border-[#dadce0] text-xs font-medium rounded-full transition cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Clear All
                    </button>
                  )}
                </div>
              </div>

              {showAddSample && (
                <form onSubmit={handleAddManualSample} className="bg-white border border-[#dadce0] rounded-xl p-4 space-y-3 text-xs">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <input
                      type="text"
                      required
                      value={newSubject}
                      onChange={e => setNewSubject(e.target.value)}
                      placeholder="Email subject..."
                      className="bg-[#f8f9fa] border border-[#dadce0] px-3 py-2 rounded-lg focus:outline-none focus:border-[#1a73e8]"
                    />
                    <input
                      type="text"
                      value={newSender}
                      onChange={e => setNewSender(e.target.value)}
                      placeholder="sender@domain.com"
                      className="bg-[#f8f9fa] border border-[#dadce0] px-3 py-2 rounded-lg font-mono focus:outline-none focus:border-[#1a73e8]"
                    />
                    <select
                      value={newLabel}
                      onChange={e => setNewLabel(e.target.value as EmailLabel)}
                      className="bg-[#f8f9fa] border border-[#dadce0] px-3 py-2 rounded-lg focus:outline-none focus:border-[#1a73e8]"
                    >
                      <option value="legitimate">Label: Legitimate</option>
                      <option value="spam">Label: Spam</option>
                      <option value="phishing">Label: Phishing</option>
                    </select>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      required
                      value={newBody}
                      onChange={e => setNewBody(e.target.value)}
                      placeholder="Email body content..."
                      className="flex-1 bg-[#f8f9fa] border border-[#dadce0] px-3 py-2 rounded-lg focus:outline-none focus:border-[#1a73e8]"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-[#1a73e8] hover:bg-[#1557b0] text-white font-medium rounded-full transition cursor-pointer shrink-0"
                    >
                      Stage Sample
                    </button>
                  </div>
                </form>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1 bg-white p-1 rounded-full border border-[#dadce0] text-xs">
                  {(['all', 'legitimate', 'spam', 'phishing'] as const).map(f => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setLabelFilter(f)}
                      className={`px-3 py-1 rounded-full font-medium capitalize transition cursor-pointer ${
                        labelFilter === f ? 'bg-[#e8f0fe] text-[#1967d2]' : 'text-[#5f6368] hover:text-[#202124]'
                      }`}
                    >
                      {f === 'all' ? `All (${samples.length})` : `${f} (${classCounts[f]})`}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-[#5f6368] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Filter staged samples..."
                    className="w-full bg-white border border-[#dadce0] pl-8 pr-3 py-1.5 rounded-full text-xs focus:outline-none focus:border-[#1a73e8]"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
              <table className="w-full text-left text-xs text-[#3c4043]">
                <thead className="bg-[#f8f9fa] text-[#5f6368] border-b border-[#dadce0] font-medium sticky top-0">
                  <tr>
                    <th className="py-2.5 px-4">Subject &amp; Excerpt</th>
                    <th className="py-2.5 px-4">Sender</th>
                    <th className="py-2.5 px-4">Source</th>
                    <th className="py-2.5 px-4">Class Label</th>
                    <th className="py-2.5 px-4 text-right">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f3f4]">
                  {filteredSamples.map(sample => (
                    <tr key={sample.id} className="hover:bg-[#f8f9fa] transition">
                      <td className="py-2.5 px-4 max-w-xs">
                        <div className="font-medium text-[#202124] truncate">{sample.subject}</div>
                        <div className="text-[11px] text-[#5f6368] truncate">{sample.body}</div>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[11px] text-[#5f6368] max-w-[170px] truncate">
                        {sample.sender}
                      </td>
                      <td className="py-2.5 px-4 text-[11px] text-[#5f6368] capitalize whitespace-nowrap">
                        {sample.source === 'audit_stream' ? 'Audit Stream' : sample.source || 'upload'}
                      </td>
                      <td className="py-2.5 px-4">
                        <select
                          value={sample.label}
                          onChange={e => handleUpdateSampleLabel(sample.id, e.target.value as EmailLabel)}
                          aria-label={`Label for ${sample.subject}`}
                          className={`text-xs font-medium px-2.5 py-1 rounded-lg border cursor-pointer focus:outline-none ${
                            sample.label === 'phishing'
                              ? 'bg-[#fce8e6] border-[#fad2cf] text-[#c5221f]'
                              : sample.label === 'spam'
                              ? 'bg-[#fef7e0] border-[#fde293] text-[#b06000]'
                              : 'bg-[#e6f4ea] border-[#a8dab5] text-[#137333]'
                          }`}
                        >
                          <option value="legitimate">legitimate</option>
                          <option value="spam">spam</option>
                          <option value="phishing">phishing</option>
                        </select>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveSample(sample.id)}
                          className="p-1.5 text-[#5f6368] hover:text-[#d93025] rounded-full hover:bg-[#fce8e6] transition cursor-pointer"
                          title="Remove sample"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredSamples.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-[#5f6368]">
                        No training samples staged. Upload a CSV/JSON file, import from your Audit Stream, or load the starter corpus.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ============================================================================ */}
      {/* IMAGE TRAINING UNIT SECTION: Visual Weights + Image Probe + Image Dataset    */}
      {/* ============================================================================ */}
      {trainerUnit === 'image' && (
        <div className="space-y-6" id="image-training-unit">

          {/* Learned Visual Weights + Image Inference Probe */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Visual Pixel Weight Importance Bar Chart */}
            <div className="lg:col-span-7 bg-white border border-[#dadce0] rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#dadce0] pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#1a73e8]" />
                  <h3 className="text-sm font-medium text-[#202124]">
                    Learned Visual Pixel &amp; OCR Feature Weights
                  </h3>
                </div>
                <InfoButton
                  title="Visual Pixel Feature Weights"
                  description="Shows how the Image Training Unit weights Red/Yellow/Blue ratios, saturation spikes, gradient text edges, QR binary finder patterns, pixel entropy, and OCR keywords across classes."
                  align="right"
                />
              </div>

              {activeImageUnit ? (
                <>
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={activeImageUnit.featureImportance} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#dadce0" />
                        <XAxis dataKey="feature" stroke="#5f6368" fontSize={10} />
                        <YAxis stroke="#5f6368" fontSize={10} />
                        <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#dadce0', fontSize: '11px', borderRadius: '10px' }} />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        <Bar dataKey="legitimate" name="Legitimate" fill="#1e8e3e" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="spam" name="Spam" fill="#e37400" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="phishing" name="Phishing" fill="#d93025" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Compact Held-out Image Test Summary */}
                  <div className="grid grid-cols-3 gap-2 text-xs text-center tabular-nums pt-2 border-t border-[#f1f3f4]">
                    <div className="bg-[#f8f9fa] border border-[#dadce0] p-2.5 rounded-xl">
                      <span className="text-[11px] text-[#5f6368] block">Held-Out Test Samples</span>
                      <strong className="text-sm font-mono text-[#202124]">{activeImageUnit.evaluation.testCount}</strong>
                    </div>
                    <div className="bg-[#f8f9fa] border border-[#dadce0] p-2.5 rounded-xl">
                      <span className="text-[11px] text-[#5f6368] block">Image Test Accuracy</span>
                      <strong className="text-sm font-mono text-[#137333]">{(activeImageUnit.evaluation.accuracy * 100).toFixed(1)}%</strong>
                    </div>
                    <div className="bg-[#f8f9fa] border border-[#dadce0] p-2.5 rounded-xl">
                      <span className="text-[11px] text-[#5f6368] block">OCR Vocabulary</span>
                      <strong className="text-sm font-mono text-[#1a73e8]">{activeImageUnit.ocrVocabulary.length} tokens</strong>
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-56 flex flex-col items-center justify-center text-xs text-[#5f6368] gap-2 bg-[#f8f9fa] border border-[#dadce0] rounded-xl p-6 text-center">
                  <ImageIcon className="w-7 h-7 text-[#1a73e8]" />
                  <span>Train the Image Unit to inspect learned Red/Yellow/Edge/QR visual classification weights.</span>
                </div>
              )}
            </div>

            {/* Right: Live Image Inference Probe */}
            <div className="lg:col-span-5 bg-white border border-[#dadce0] rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#dadce0] pb-3">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-[#1a73e8]" />
                  <h3 className="text-sm font-medium text-[#202124]">Quick Image Inference Probe</h3>
                </div>
                <InfoButton
                  title="Quick Image Inference Probe"
                  description="Upload any screenshot, flyer, or invoice image (with optional OCR text) to test predictions from your trained Image Training Unit."
                  align="right"
                />
              </div>

              <input
                ref={imageProbeRef}
                type="file"
                accept="image/*"
                onChange={handleUploadImageProbeFile}
                className="hidden"
              />

              {imageProbeSample && (
                <div className="flex items-center gap-3 bg-[#f8f9fa] border border-[#dadce0] p-2.5 rounded-xl">
                  <img
                    src={imageProbeSample.dataUrl}
                    alt={imageProbeSample.fileName}
                    className="w-20 h-14 object-cover rounded-lg border border-[#dadce0] bg-white shrink-0"
                  />
                  <div className="min-w-0 flex-1 text-xs">
                    <p className="font-medium text-[#202124] truncate">{imageProbeSample.fileName}</p>
                    <p className="text-[11px] font-mono text-[#5f6368] tabular-nums">
                      R:{imageProbeSample.telemetry.colorSpectrum.red}% Y:{imageProbeSample.telemetry.colorSpectrum.yellow}% QR:{imageProbeSample.telemetry.qrPatternScore}%
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => imageProbeRef.current?.click()}
                    className="px-3 py-1.5 bg-white hover:bg-[#e8f0fe] text-[#1a73e8] border border-[#dadce0] rounded-full text-[11px] font-medium cursor-pointer shrink-0"
                  >
                    Upload Probe
                  </button>
                </div>
              )}

              <div className="text-xs space-y-2">
                <label className="block text-[11px] font-medium text-[#5f6368]">Optional OCR / Visual Caption Text</label>
                <textarea
                  rows={2}
                  value={imageProbeOcr}
                  onChange={e => setImageProbeOcr(e.target.value)}
                  placeholder="Optional text visible inside image..."
                  className="w-full bg-[#f8f9fa] border border-[#dadce0] px-3 py-2 rounded-xl text-xs focus:outline-none focus:border-[#1a73e8]"
                />
                <button
                  type="button"
                  onClick={handleRunImageProbe}
                  disabled={!imageProbeSample}
                  className="w-full py-2.5 bg-[#1a73e8] hover:bg-[#1557b0] disabled:opacity-50 text-white text-xs font-medium rounded-full transition cursor-pointer"
                >
                  {activeImageUnit ? 'Score with Trained Image Unit' : 'Score with Pixel Heuristics'}
                </button>
              </div>

              {imageProbeResult && (
                <div className="bg-[#f8f9fa] border border-[#dadce0] rounded-xl p-3.5 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[#5f6368]">Predicted Class:</span>
                    <span
                      className={`font-semibold uppercase ${
                        imageProbeResult.predictedLabel === 'phishing'
                          ? 'text-[#d93025]'
                          : imageProbeResult.predictedLabel === 'spam'
                          ? 'text-[#e37400]'
                          : 'text-[#137333]'
                      }`}
                    >
                      {imageProbeResult.predictedLabel} ({imageProbeResult.spamScore}% Risk)
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 font-mono text-[11px] tabular-nums">
                    <div className="bg-white border border-[#dadce0] p-2 rounded-lg text-center">
                      <span className="text-[#5f6368] block">Legit</span>
                      <strong className="text-[#137333]">{(imageProbeResult.probabilities.legitimate * 100).toFixed(1)}%</strong>
                    </div>
                    <div className="bg-white border border-[#dadce0] p-2 rounded-lg text-center">
                      <span className="text-[#5f6368] block">Spam</span>
                      <strong className="text-[#e37400]">{(imageProbeResult.probabilities.spam * 100).toFixed(1)}%</strong>
                    </div>
                    <div className="bg-white border border-[#dadce0] p-2 rounded-lg text-center">
                      <span className="text-[#5f6368] block">Phishing</span>
                      <strong className="text-[#d93025]">{(imageProbeResult.probabilities.phishing * 100).toFixed(1)}%</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Image Training Dataset Ingestion & Staging Table */}
          <div className="bg-white border border-[#dadce0] rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-[#dadce0] bg-[#f8f9fa] space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-[#1a73e8]" />
                  <h3 className="text-sm font-medium text-[#202124]">
                    Image Dataset Staging ({imageSamples.length} images)
                  </h3>
                  <InfoButton
                    title="Image Dataset Staging"
                    description="Upload PNG/JPG/WEBP email flyers or screenshots with a target class label. HTML5 Canvas pixel extraction runs locally to compute RGBY channels, saturation spikes, gradient edge density, and QR binary patterns."
                    align="left"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={imageUploadRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleUploadTrainingImages}
                    className="hidden"
                  />

                  <select
                    value={uploadImageLabel}
                    onChange={e => setUploadImageLabel(e.target.value as EmailLabel)}
                    aria-label="Default class label for uploaded images"
                    className="text-xs font-medium bg-white border border-[#dadce0] px-3 py-2 rounded-full cursor-pointer"
                  >
                    <option value="legitimate">Upload as: Legitimate</option>
                    <option value="spam">Upload as: Spam</option>
                    <option value="phishing">Upload as: Phishing</option>
                  </select>

                  <input
                    type="text"
                    value={uploadImageOcr}
                    onChange={e => setUploadImageOcr(e.target.value)}
                    placeholder="Optional OCR text caption..."
                    className="text-xs bg-white border border-[#dadce0] px-3 py-2 rounded-full w-48 focus:outline-none focus:border-[#1a73e8]"
                  />

                  <button
                    type="button"
                    onClick={() => imageUploadRef.current?.click()}
                    className="px-3.5 py-2 bg-[#1a73e8] hover:bg-[#1557b0] text-white text-xs font-medium rounded-full transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Images</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleLoadStarterImages}
                    className="px-3 py-2 bg-white hover:bg-[#f1f3f4] text-[#3c4043] border border-[#dadce0] text-xs font-medium rounded-full transition cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Load 12 Starter Images
                  </button>

                  {imageSamples.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setImageSamples([])}
                      className="px-3 py-2 bg-white hover:bg-[#fce8e6] text-[#d93025] border border-[#dadce0] text-xs font-medium rounded-full transition cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Clear Images
                    </button>
                  )}
                </div>
              </div>

              {/* Filter & Search Toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1 bg-white p-1 rounded-full border border-[#dadce0] text-xs">
                  {(['all', 'legitimate', 'spam', 'phishing'] as const).map(f => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setImageFilter(f)}
                      className={`px-3 py-1 rounded-full font-medium capitalize transition cursor-pointer ${
                        imageFilter === f ? 'bg-[#e8f0fe] text-[#1967d2]' : 'text-[#5f6368] hover:text-[#202124]'
                      }`}
                    >
                      {f === 'all' ? `All (${imageSamples.length})` : `${f} (${imageClassCounts[f]})`}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-[#5f6368] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={imageSearch}
                    onChange={e => setImageSearch(e.target.value)}
                    placeholder="Filter staged images..."
                    className="w-full bg-white border border-[#dadce0] pl-8 pr-3 py-1.5 rounded-full text-xs focus:outline-none focus:border-[#1a73e8]"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-left text-xs text-[#3c4043] tabular-nums">
                <thead className="bg-[#f8f9fa] text-[#5f6368] border-b border-[#dadce0] font-medium sticky top-0">
                  <tr>
                    <th className="py-2.5 px-4">Preview &amp; File</th>
                    <th className="py-2.5 px-4">Pixel Vision Telemetry</th>
                    <th className="py-2.5 px-4">OCR Text Hint</th>
                    <th className="py-2.5 px-4">Class Label</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f3f4]">
                  {filteredImageSamples.map(img => (
                    <tr key={img.id} className="hover:bg-[#f8f9fa] transition">
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={img.dataUrl}
                            alt={img.fileName}
                            className="w-16 h-10 object-cover rounded-lg border border-[#dadce0] bg-white shrink-0"
                          />
                          <div className="min-w-0 max-w-[170px]">
                            <div className="font-medium text-[#202124] truncate">{img.fileName}</div>
                            <div className="text-[10px] font-mono text-[#5f6368]">
                              {img.width}&times;{img.height} &middot; {img.source}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[11px] text-[#5f6368] whitespace-nowrap">
                        R:{img.telemetry.colorSpectrum.red}% Y:{img.telemetry.colorSpectrum.yellow}% B:{img.telemetry.colorSpectrum.blue}%
                        <div className="text-[10px] text-[#80868b]">
                          Edge:{img.telemetry.edgeTextDensity}% &middot; QR:{img.telemetry.qrPatternScore}% &middot; Ent:{img.telemetry.quantizedEntropy}%
                        </div>
                      </td>
                      <td className="py-2.5 px-4 min-w-[200px]">
                        <input
                          type="text"
                          value={img.ocrText}
                          onChange={e => handleUpdateImageOcr(img.id, e.target.value)}
                          placeholder="Add OCR text..."
                          className="w-full bg-[#f8f9fa] border border-[#dadce0] px-2.5 py-1 rounded-lg text-[11px] focus:outline-none focus:border-[#1a73e8]"
                        />
                      </td>
                      <td className="py-2.5 px-4">
                        <select
                          value={img.label}
                          onChange={e => handleUpdateImageLabel(img.id, e.target.value as EmailLabel)}
                          aria-label={`Label for ${img.fileName}`}
                          className={`text-xs font-medium px-2.5 py-1 rounded-lg border cursor-pointer focus:outline-none ${
                            img.label === 'phishing'
                              ? 'bg-[#fce8e6] border-[#fad2cf] text-[#c5221f]'
                              : img.label === 'spam'
                              ? 'bg-[#fef7e0] border-[#fde293] text-[#b06000]'
                              : 'bg-[#e6f4ea] border-[#a8dab5] text-[#137333]'
                          }`}
                        >
                          <option value="legitimate">legitimate</option>
                          <option value="spam">spam</option>
                          <option value="phishing">phishing</option>
                        </select>
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setImageProbeSample(img);
                            setImageProbeOcr(img.ocrText);
                            setImageProbeResult(
                              predictImageWithModel(img.extractedFeatures, img.ocrText, activeImageUnit)
                            );
                          }}
                          className="px-2 py-1 text-[11px] text-[#1a73e8] hover:bg-[#e8f0fe] rounded-full mr-1 cursor-pointer"
                          title="Load into Image Inference Probe"
                        >
                          Probe
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveImageSample(img.id)}
                          className="p-1.5 text-[#5f6368] hover:text-[#d93025] rounded-full hover:bg-[#fce8e6] transition cursor-pointer"
                          title="Remove image sample"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredImageSamples.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-[#5f6368]">
                        No training images staged. Upload PNG/JPG/WEBP images or load the 12 starter visual samples.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
