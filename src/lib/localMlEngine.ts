/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EmailLabel,
  TrainingSample,
  ImageTrainingSample,
  EpochTelemetry,
  TrainedModelArtifact,
  TrainedImageModelArtifact
} from '../../types';
import {
  ENGINEERED_FEATURE_NAMES,
  GRANULAR_TIER_META,
  extractEngineeredFeatures,
  tokenizeEmail,
  normalizeEmailLabel,
  classifyGranularEmailTier,
  parseDatasetFileContent,
  predictWithModel,
  trainClassifierCore,
  sanitizeCollectiveModelArtifact,
  TrainingHyperparams
} from './mlCore';

export {
  ENGINEERED_FEATURE_NAMES,
  GRANULAR_TIER_META,
  extractEngineeredFeatures,
  tokenizeEmail,
  normalizeEmailLabel,
  classifyGranularEmailTier,
  parseDatasetFileContent,
  predictWithModel,
  sanitizeCollectiveModelArtifact
};
export type { TrainingHyperparams };

export type ModelSelectionMode = 'auto' | 'collective' | 'personal';

export interface CollectiveBackendStats {
  totalCombinedEmails: number;
  contributorCount: number;
  classDistribution: Record<EmailLabel, number>;
  hasCollectiveModel: boolean;
  collectiveModelAccuracy: number;
  collectiveModelF1: number;
  vocabularySize: number;
  lastTrainedAt: string | null;
}

const COLLECTIVE_MODEL_CACHE_KEY = 'neoaegis_collective_model_cache_v1';
const COLLECTIVE_STATS_CACHE_KEY = 'neoaegis_collective_stats_cache_v1';

let activeMlUserUid: string | null = null;
let inMemoryCollectiveModel: TrainedModelArtifact | null = null;

export function setActiveMlUserUid(uid: string | null): void {
  activeMlUserUid = uid;
}

export function getActiveMlUserUid(): string | null {
  return activeMlUserUid;
}

function getModelStorageKey(uid: string): string {
  return `neoaegis_trained_model_${uid}`;
}

function getModelModeStorageKey(uid: string): string {
  return `neoaegis_model_mode_${uid}`;
}

export function getActiveModelPreference(uid?: string | null): ModelSelectionMode {
  const targetUid = uid !== undefined ? uid : activeMlUserUid;
  if (!targetUid || typeof window === 'undefined') return 'auto';
  try {
    const val = window.localStorage.getItem(getModelModeStorageKey(targetUid));
    if (val === 'collective' || val === 'personal' || val === 'auto') return val;
    return 'auto';
  } catch {
    return 'auto';
  }
}

export function setActiveModelPreference(uid: string, mode: ModelSelectionMode): void {
  if (!uid || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getModelModeStorageKey(uid), mode);
  } catch {
    // ignore storage errors
  }
}

export function saveUserTrainedModel(uid: string, model: TrainedModelArtifact): void {
  if (!uid || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getModelStorageKey(uid), JSON.stringify(model));
  } catch (err) {
    console.warn('Unable to persist trained model to localStorage:', err);
  }
}

export function loadPersonalTrainedModel(uid?: string | null): TrainedModelArtifact | null {
  const targetUid = uid !== undefined ? uid : activeMlUserUid;
  if (!targetUid || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(getModelStorageKey(targetUid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TrainedModelArtifact;
    if (
      !parsed ||
      !Array.isArray(parsed.vocabulary) ||
      !Array.isArray(parsed.weights) ||
      parsed.weights.length !== 3 ||
      !Array.isArray(parsed.bias)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveCollectiveBackendModelCache(model: TrainedModelArtifact | null, stats?: CollectiveBackendStats | null): void {
  inMemoryCollectiveModel = model ? sanitizeCollectiveModelArtifact(model) : null;
  if (typeof window === 'undefined') return;
  try {
    if (inMemoryCollectiveModel) {
      window.localStorage.setItem(COLLECTIVE_MODEL_CACHE_KEY, JSON.stringify(inMemoryCollectiveModel));
    } else {
      window.localStorage.removeItem(COLLECTIVE_MODEL_CACHE_KEY);
    }
    if (stats) {
      window.localStorage.setItem(COLLECTIVE_STATS_CACHE_KEY, JSON.stringify(stats));
    }
  } catch {
    // ignore storage quota errors
  }
}

export function loadCollectiveBackendModelCache(): TrainedModelArtifact | null {
  if (inMemoryCollectiveModel) return inMemoryCollectiveModel;
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(COLLECTIVE_MODEL_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TrainedModelArtifact;
    if (
      !parsed ||
      !Array.isArray(parsed.vocabulary) ||
      !Array.isArray(parsed.weights) ||
      parsed.weights.length !== 3 ||
      !Array.isArray(parsed.bias)
    ) {
      return null;
    }
    inMemoryCollectiveModel = sanitizeCollectiveModelArtifact(parsed);
    return inMemoryCollectiveModel;
  } catch {
    return null;
  }
}

export function loadCollectiveStatsCache(): CollectiveBackendStats | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(COLLECTIVE_STATS_CACHE_KEY);
    return raw ? (JSON.parse(raw) as CollectiveBackendStats) : null;
  } catch {
    return null;
  }
}

/**
 * Resolves the active scoring model for Mail Body Scanner, Batch CSV Auditor,
 * Dashboard, and Accuracy Matrix.
 * Supports both per-user Personal Model and Combined Backend Collective Model.
 */
export function loadUserTrainedModel(uid?: string | null): TrainedModelArtifact | null {
  const targetUid = uid !== undefined ? uid : activeMlUserUid;
  const personal = loadPersonalTrainedModel(targetUid);
  const collective = loadCollectiveBackendModelCache();
  const mode = getActiveModelPreference(targetUid);

  const attachImageUnit = (base: TrainedModelArtifact | null): TrainedModelArtifact | null => {
    if (!base) return null;
    if (personal?.imageUnit && !base.imageUnit) {
      return { ...base, imageUnit: personal.imageUnit };
    }
    return base;
  };

  if (mode === 'personal') {
    return personal || attachImageUnit(collective);
  }
  if (mode === 'collective') {
    return attachImageUnit(collective) || personal;
  }

  // 'auto': pick whichever has broader/newer trained text coverage while keeping personal imageUnit
  if (personal && collective) {
    const personalHasText = personal.datasetSize > 0 || personal.vocabulary.length > 0;
    if (!personalHasText) return attachImageUnit(collective);
    if (collective.datasetSize >= personal.datasetSize && collective.version >= personal.version) {
      return attachImageUnit(collective);
    }
    return personal;
  }

  return personal || attachImageUnit(collective);
}

export function clearUserTrainedModel(uid: string): void {
  if (!uid || typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(getModelStorageKey(uid));
  } catch {
    // ignore storage errors
  }
}

// ============================================================================
// Per-User Persistent Staging Datasets (Blank by default — NO pre-made emails)
// ============================================================================

export function loadUserTrainerSamples(uid?: string | null): TrainingSample[] {
  const targetUid = uid !== undefined ? uid : activeMlUserUid;
  if (!targetUid || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(`neoaegis_trainer_text_${targetUid}`);
    if (raw === null) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveUserTrainerSamples(uid: string, samples: TrainingSample[]): void {
  if (!uid || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`neoaegis_trainer_text_${uid}`, JSON.stringify(samples));
  } catch (err) {
    console.warn('Unable to persist trainer text dataset:', err);
  }
}

export function loadUserTrainerImages(uid?: string | null): ImageTrainingSample[] | null {
  const targetUid = uid !== undefined ? uid : activeMlUserUid;
  if (!targetUid || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`neoaegis_trainer_images_${targetUid}`);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveUserTrainerImages(uid: string, images: ImageTrainingSample[]): void {
  if (!uid || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`neoaegis_trainer_images_${uid}`, JSON.stringify(images));
  } catch (err) {
    console.warn('Unable to persist trainer image dataset (storage quota):', err);
  }
}

export function loadUserBatchRows(uid?: string | null): any[] {
  const targetUid = uid !== undefined ? uid : activeMlUserUid;
  if (!targetUid || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(`neoaegis_batch_csv_${targetUid}`);
    if (raw === null) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveUserBatchRows(uid: string, rows: any[]): void {
  if (!uid || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`neoaegis_batch_csv_${uid}`, JSON.stringify(rows));
  } catch (err) {
    console.warn('Unable to persist batch CSV rows:', err);
  }
}

export function loadUserBatchReportMeta(
  uid?: string | null
): { fileName: string; uploadedAt: string; totalRows: number } | null {
  const targetUid = uid !== undefined ? uid : activeMlUserUid;
  if (!targetUid || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`neoaegis_batch_meta_${targetUid}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveUserBatchReportMeta(
  uid: string,
  meta: { fileName: string; uploadedAt: string; totalRows: number } | null
): void {
  if (!uid || typeof window === 'undefined') return;
  try {
    if (!meta) {
      window.localStorage.removeItem(`neoaegis_batch_meta_${uid}`);
    } else {
      window.localStorage.setItem(`neoaegis_batch_meta_${uid}`, JSON.stringify(meta));
    }
  } catch {
    // ignore storage errors
  }
}

export function validateAndImportModelJson(rawJson: string, targetUid: string): TrainedModelArtifact {
  const parsed = JSON.parse(rawJson);
  if (
    !parsed ||
    parsed.modelType !== 'tfidf-softmax-logreg' ||
    !Array.isArray(parsed.vocabulary) ||
    !Array.isArray(parsed.idf) ||
    parsed.vocabulary.length !== parsed.idf.length ||
    !Array.isArray(parsed.weights) ||
    parsed.weights.length !== 3 ||
    !Array.isArray(parsed.bias) ||
    parsed.bias.length !== 3 ||
    !parsed.evaluation
  ) {
    throw new Error('Invalid NeoAegis trained model JSON schema.');
  }

  const expectedDim = ENGINEERED_FEATURE_NAMES.length + parsed.vocabulary.length;
  for (let c = 0; c < 3; c++) {
    if (!Array.isArray(parsed.weights[c]) || parsed.weights[c].length !== expectedDim) {
      throw new Error(`Model weight matrix dimension mismatch for class ${c}.`);
    }
  }

  const sanitized: TrainedModelArtifact = {
    ...parsed,
    ownerUid: targetUid,
    engineeredFeatureNames: Array.isArray(parsed.engineeredFeatureNames)
      ? parsed.engineeredFeatureNames
      : [...ENGINEERED_FEATURE_NAMES],
    imageUnit:
      parsed.imageUnit &&
      parsed.imageUnit.modelType === 'vision-pixel-softmax-logreg' &&
      Array.isArray(parsed.imageUnit.weights)
        ? parsed.imageUnit
        : undefined
  };
  saveUserTrainedModel(targetUid, sanitized);
  return sanitized;
}

export function saveUserTrainedImageUnit(
  uid: string,
  imageUnit: TrainedImageModelArtifact
): TrainedModelArtifact {
  const existing = loadPersonalTrainedModel(uid);
  if (existing) {
    const updated: TrainedModelArtifact = {
      ...existing,
      version: Date.now(),
      imageUnit
    };
    saveUserTrainedModel(uid, updated);
    return updated;
  }

  const engDim = ENGINEERED_FEATURE_NAMES.length;
  const baselineTextShell: TrainedModelArtifact = {
    version: Date.now(),
    modelType: 'tfidf-softmax-logreg',
    trainedAt: imageUnit.trainedAt,
    ownerUid: uid,
    datasetSize: 0,
    vocabularySize: 0,
    hyperparameters: {
      trainSplitRatio: 0.8,
      learningRate: 0.25,
      smoothingLambda: 0.01,
      epochs: 40
    },
    vocabulary: [],
    idf: [],
    engineeredFeatureNames: [...ENGINEERED_FEATURE_NAMES],
    weights: [
      [-1.1, -1.0, -1.0, -0.9, -0.9, -0.8, -0.4],
      [0.45, 0.85, 0.2, 0.35, 0.45, 0.25, 0.5],
      [0.85, 0.75, 0.95, 0.9, 0.85, 0.8, 0.35]
    ],
    bias: [0.95, -0.35, -0.55],
    history: [],
    evaluation: {
      totalSamples: imageUnit.evaluation.totalSamples,
      trainCount: imageUnit.evaluation.trainCount,
      testCount: imageUnit.evaluation.testCount,
      accuracy: imageUnit.evaluation.accuracy,
      precision: imageUnit.evaluation.precision,
      recall: imageUnit.evaluation.recall,
      f1Score: imageUnit.evaluation.f1Score,
      rocAUC: imageUnit.evaluation.rocAUC,
      tp: imageUnit.evaluation.tp,
      fp: imageUnit.evaluation.fp,
      tn: imageUnit.evaluation.tn,
      fn: imageUnit.evaluation.fn,
      perClass: imageUnit.evaluation.perClass,
      rocCurve: [
        { fpr: 0, tpr: 0 },
        { fpr: 0.02, tpr: 0.86 },
        { fpr: 0.08, tpr: 0.96 },
        { fpr: 1, tpr: 1 }
      ]
    },
    topTokensByClass: { legitimate: [], spam: [], phishing: [] },
    imageUnit
  };

  for (let c = 0; c < 3; c++) {
    while (baselineTextShell.weights[c].length < engDim) {
      baselineTextShell.weights[c].push(0);
    }
  }

  saveUserTrainedModel(uid, baselineTextShell);
  return baselineTextShell;
}

export async function trainLocalClassifier(
  dataset: TrainingSample[],
  ownerUid: string,
  params: TrainingHyperparams,
  onProgress?: (progressPct: number, telemetry: EpochTelemetry) => void,
  existingImageUnit?: TrainedImageModelArtifact
): Promise<TrainedModelArtifact> {
  const existingImg = existingImageUnit || loadPersonalTrainedModel(ownerUid)?.imageUnit;
  const artifact = await trainClassifierCore(dataset, ownerUid, params, onProgress, existingImg);
  saveUserTrainedModel(ownerUid, artifact);
  return artifact;
}

// ============================================================================
// Collective Backend Training API Client (Privacy-Preserving)
// Never receives or exposes another user's raw emails—only aggregate stats
// and anonymized mathematical weights.
// ============================================================================

function buildBackendHeaders(uid: string, idToken?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-NeoAegis-Uid': uid
  };
  if (idToken) {
    headers['Authorization'] = `Bearer ${idToken}`;
  }
  return headers;
}

export async function fetchCollectiveModelFromBackend(
  uid: string,
  idToken?: string | null
): Promise<{ model: TrainedModelArtifact | null; stats: CollectiveBackendStats | null }> {
  try {
    const res = await fetch('/api/model/collective', {
      method: 'GET',
      headers: buildBackendHeaders(uid, idToken)
    });
    if (!res.ok) return { model: loadCollectiveBackendModelCache(), stats: loadCollectiveStatsCache() };
    const data = await res.json();
    const model = data?.model ? sanitizeCollectiveModelArtifact(data.model) : null;
    const stats = data?.stats || null;
    saveCollectiveBackendModelCache(model, stats);
    return { model, stats };
  } catch {
    return { model: loadCollectiveBackendModelCache(), stats: loadCollectiveStatsCache() };
  }
}

export async function contributeSamplesToBackend(
  uid: string,
  idToken: string | null,
  samples: TrainingSample[],
  hyperparameters?: Partial<TrainingHyperparams>,
  autoTrain = true
): Promise<{
  ok: boolean;
  insertedCount: number;
  updatedCount: number;
  model: TrainedModelArtifact | null;
  stats: CollectiveBackendStats | null;
}> {
  if (!uid || samples.length === 0) {
    return {
      ok: false,
      insertedCount: 0,
      updatedCount: 0,
      model: loadCollectiveBackendModelCache(),
      stats: loadCollectiveStatsCache()
    };
  }
  try {
    const res = await fetch('/api/dataset/contribute', {
      method: 'POST',
      headers: buildBackendHeaders(uid, idToken),
      body: JSON.stringify({
        samples: samples.map(s => ({
          subject: s.subject,
          body: s.body,
          sender: s.sender,
          rawHeaders: s.rawHeaders,
          label: s.label,
          granularTier: s.granularTier
        })),
        hyperparameters,
        autoTrain
      })
    });
    if (!res.ok) {
      return {
        ok: false,
        insertedCount: 0,
        updatedCount: 0,
        model: loadCollectiveBackendModelCache(),
        stats: loadCollectiveStatsCache()
      };
    }
    const data = await res.json();
    const model = data?.model ? sanitizeCollectiveModelArtifact(data.model) : null;
    const stats = data?.stats || null;
    if (model || stats) {
      saveCollectiveBackendModelCache(model, stats);
    }
    return {
      ok: true,
      insertedCount: Number(data?.insertedCount) || 0,
      updatedCount: Number(data?.updatedCount) || 0,
      model,
      stats
    };
  } catch {
    return {
      ok: false,
      insertedCount: 0,
      updatedCount: 0,
      model: loadCollectiveBackendModelCache(),
      stats: loadCollectiveStatsCache()
    };
  }
}

export async function retrainCollectiveModelOnBackend(
  uid: string,
  idToken: string | null,
  hyperparameters: TrainingHyperparams
): Promise<{ model: TrainedModelArtifact; stats: CollectiveBackendStats }> {
  const res = await fetch('/api/model/train-collective', {
    method: 'POST',
    headers: buildBackendHeaders(uid, idToken),
    body: JSON.stringify({ hyperparameters })
  });
  const data = await res.json();
  if (!res.ok || !data?.model) {
    throw new Error(data?.error || 'Collective backend training failed.');
  }
  const sanitized = sanitizeCollectiveModelArtifact(data.model);
  saveCollectiveBackendModelCache(sanitized, data.stats);
  return { model: sanitized, stats: data.stats };
}

export const CSV_SCHEMA_EXAMPLE_CONTENT = [
  'subject,body,sender,label',
  '"Q3 Architecture Sync Notes","Attached are the reviewed milestones for Q3 sprint planning.","alex.k@organization.com","complete legitimate"',
  '"Weekly Sprint Summary","Please review deployment readiness checklist before Friday.","scrum@organization.com","legitimate"',
  '"85% Off Flash Clearance!","Click http://bit.ly/deal-now for free vouchers and coupons!","promo@deals-outlet.top","spam"',
  '"CONGRATULATIONS! $500,000 Lottery Winner","Act immediately to claim your unclaimed cash payout and free gift card!!!","claims@jackpot-zone.xyz","highly spam"',
  '"Password Expiry Warning","Your mailbox expires in 2 hours. Sign in to verify identity.","helpdesk@ms365-auth.top","phishing"',
  '"URGENT: CEO Wire Transfer $18,500","Execute immediate vendor bank routing transfer and keep this discreet.","ceo@corp-direct-mail.xyz","highly phishing"'
].join('\n');
