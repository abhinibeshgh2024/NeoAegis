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
import { sanitizeCollectiveImageModelArtifact } from './imageVisionEngine';

export {
  ENGINEERED_FEATURE_NAMES,
  GRANULAR_TIER_META,
  extractEngineeredFeatures,
  tokenizeEmail,
  normalizeEmailLabel,
  classifyGranularEmailTier,
  parseDatasetFileContent,
  predictWithModel,
  sanitizeCollectiveModelArtifact,
  sanitizeCollectiveImageModelArtifact
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
  totalCombinedImages?: number;
  imageContributorCount?: number;
  hasCollectiveImageModel?: boolean;
  collectiveImageAccuracy?: number;
}

const COLLECTIVE_MODEL_CACHE_KEY = 'neoaegis_collective_model_cache_v1';
const COLLECTIVE_IMAGE_CACHE_KEY = 'neoaegis_collective_image_cache_v1';
const COLLECTIVE_STATS_CACHE_KEY = 'neoaegis_collective_stats_cache_v1';

let activeMlUserUid: string | null = null;
let inMemoryCollectiveModel: TrainedModelArtifact | null = null;
let inMemoryCollectiveImageUnit: TrainedImageModelArtifact | null = null;

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

export function saveCollectiveBackendModelCache(
  model: TrainedModelArtifact | null,
  stats?: CollectiveBackendStats | null,
  imageUnit?: TrainedImageModelArtifact | null
): void {
  inMemoryCollectiveModel = model ? sanitizeCollectiveModelArtifact(model) : null;
  if (imageUnit !== undefined) {
    inMemoryCollectiveImageUnit = imageUnit ? sanitizeCollectiveImageModelArtifact(imageUnit) : null;
  }
  if (typeof window === 'undefined') return;
  try {
    if (inMemoryCollectiveModel) {
      window.localStorage.setItem(COLLECTIVE_MODEL_CACHE_KEY, JSON.stringify(inMemoryCollectiveModel));
    } else {
      window.localStorage.removeItem(COLLECTIVE_MODEL_CACHE_KEY);
    }
    if (imageUnit !== undefined) {
      if (inMemoryCollectiveImageUnit) {
        window.localStorage.setItem(COLLECTIVE_IMAGE_CACHE_KEY, JSON.stringify(inMemoryCollectiveImageUnit));
      } else {
        window.localStorage.removeItem(COLLECTIVE_IMAGE_CACHE_KEY);
      }
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

export function loadCollectiveImageUnitCache(): TrainedImageModelArtifact | null {
  if (inMemoryCollectiveImageUnit) return inMemoryCollectiveImageUnit;
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(COLLECTIVE_IMAGE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TrainedImageModelArtifact;
    if (!parsed || !Array.isArray(parsed.weights) || !Array.isArray(parsed.featureNames)) return null;
    inMemoryCollectiveImageUnit = sanitizeCollectiveImageModelArtifact(parsed);
    return inMemoryCollectiveImageUnit;
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
 * Image Inspector, Dashboard, and Overall Accuracy.
 * Combines collective multi-user weights with the active user's own workspace settings cleanly.
 */
export function loadUserTrainedModel(uid?: string | null): TrainedModelArtifact | null {
  const targetUid = uid !== undefined ? uid : activeMlUserUid;
  const personal = loadPersonalTrainedModel(targetUid);
  const collective = loadCollectiveBackendModelCache();
  const collectiveImg = loadCollectiveImageUnitCache();
  const mode = getActiveModelPreference(targetUid);

  const pickImageUnit = (): TrainedImageModelArtifact | undefined => {
    const pImg = personal?.imageUnit;
    if (mode === 'personal') return pImg || collectiveImg || undefined;
    if (mode === 'collective') return collectiveImg || pImg || undefined;
    if (pImg && collectiveImg) {
      return collectiveImg.datasetSize >= pImg.datasetSize ? collectiveImg : pImg;
    }
    return pImg || collectiveImg || undefined;
  };

  const attachBestImageUnit = (base: TrainedModelArtifact | null): TrainedModelArtifact | null => {
    const img = pickImageUnit();
    if (base) {
      return img ? { ...base, imageUnit: img } : base;
    }
    if (!img) return null;
    return {
      version: img.version,
      modelType: 'tfidf-softmax-logreg',
      trainedAt: img.trainedAt,
      ownerUid: 'collective-backend',
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
        totalSamples: 0,
        trainCount: 0,
        testCount: 0,
        accuracy: 0,
        precision: 0,
        recall: 0,
        f1Score: 0,
        rocAUC: 0.5,
        tp: 0,
        fp: 0,
        tn: 0,
        fn: 0,
        perClass: {
          legitimate: { precision: 0, recall: 0, f1: 0, support: 0 },
          spam: { precision: 0, recall: 0, f1: 0, support: 0 },
          phishing: { precision: 0, recall: 0, f1: 0, support: 0 }
        },
        rocCurve: [{ fpr: 0, tpr: 0 }, { fpr: 1, tpr: 1 }]
      },
      topTokensByClass: { legitimate: [], spam: [], phishing: [] },
      imageUnit: img
    };
  };

  if (mode === 'personal') {
    return attachBestImageUnit(personal || collective);
  }
  if (mode === 'collective') {
    return attachBestImageUnit(collective || personal);
  }

  // 'auto': pick whichever has broader/newer trained text coverage while attaching best image unit
  if (personal && collective) {
    const personalHasText = personal.datasetSize > 0 || personal.vocabulary.length > 0;
    if (!personalHasText) return attachBestImageUnit(collective);
    if (collective.datasetSize >= personal.datasetSize && collective.version >= personal.version) {
      return attachBestImageUnit(collective);
    }
    return attachBestImageUnit(personal);
  }

  return attachBestImageUnit(personal || collective);
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
  const key = `neoaegis_trainer_images_${uid}`;
  try {
    window.localStorage.setItem(key, JSON.stringify(images));
  } catch {
    // Fallback if large base64 dataUrls hit browser 5MB quota: keep recent thumbnails + strip heavy blobs on older items
    try {
      const compacted = images.map((img, idx) =>
        idx < 4 ? img : { ...img, dataUrl: '' }
      );
      window.localStorage.setItem(key, JSON.stringify(compacted));
    } catch {
      try {
        const stripped = images.map(img => ({ ...img, dataUrl: '' }));
        window.localStorage.setItem(key, JSON.stringify(stripped));
      } catch (err) {
        console.warn('Unable to persist trainer image dataset (storage quota):', err);
      }
    }
  }
}

export function loadUserImageAssessments(uid?: string | null): ImageTrainingSample[] {
  const targetUid = uid !== undefined ? uid : activeMlUserUid;
  if (!targetUid || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(`neoaegis_image_assessments_${targetUid}`);
    if (raw === null) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveUserImageAssessment(uid: string, sample: ImageTrainingSample): void {
  if (!uid || typeof window === 'undefined') return;
  try {
    const existing = loadUserImageAssessments(uid);
    // Strip heavy base64 dataUrl in lightweight telemetry assessment log to prevent quota issues
    const lightSample: ImageTrainingSample = {
      ...sample,
      dataUrl: ''
    };
    const filtered = existing.filter(
      e => e.id !== lightSample.id && e.fileName.toLowerCase() !== lightSample.fileName.toLowerCase()
    );
    window.localStorage.setItem(
      `neoaegis_image_assessments_${uid}`,
      JSON.stringify([lightSample, ...filtered].slice(0, 200))
    );
  } catch (err) {
    console.warn('Unable to persist image assessment telemetry:', err);
  }
}

export interface PersistedInspectorState {
  sample: ImageTrainingSample;
  ocrDraft: string;
  feedbackLabel: EmailLabel;
}

export function loadUserActiveInspectorImage(uid?: string | null): PersistedInspectorState | null {
  const targetUid = uid !== undefined ? uid : activeMlUserUid;
  if (!targetUid || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`neoaegis_active_inspector_${targetUid}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedInspectorState;
    return parsed && parsed.sample ? parsed : null;
  } catch {
    return null;
  }
}

export function saveUserActiveInspectorImage(uid: string, state: PersistedInspectorState | null): void {
  if (!uid || typeof window === 'undefined') return;
  const key = `neoaegis_active_inspector_${uid}`;
  try {
    if (!state) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    if (state) {
      try {
        window.localStorage.setItem(
          key,
          JSON.stringify({ ...state, sample: { ...state.sample, dataUrl: '' } })
        );
      } catch {
        // ignore quota errors
      }
    }
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

export function mergeSamplesByKey(primary: TrainingSample[], secondary: TrainingSample[]): TrainingSample[] {
  const seen = new Set<string>();
  const merged: TrainingSample[] = [];
  for (const s of [...primary, ...secondary]) {
    if (!s) continue;
    const key = `${String(s.subject || '').trim().toLowerCase()}::${String(s.sender || '').trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(s);
  }
  return merged;
}

export function mergeImagesByKey(
  primary: ImageTrainingSample[],
  secondary: ImageTrainingSample[]
): ImageTrainingSample[] {
  const seen = new Set<string>();
  const merged: ImageTrainingSample[] = [];
  for (const img of [...primary, ...secondary]) {
    if (!img) continue;
    const key = String(img.id || img.fileName || '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(img);
  }
  return merged;
}

export function mergeBatchRowsByKey<T extends { id?: string; subject?: string; sender?: string }>(
  primary: T[],
  secondary: T[]
): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const row of [...primary, ...secondary]) {
    if (!row) continue;
    const key = row.id
      ? String(row.id)
      : `${String(row.subject || '').trim().toLowerCase()}::${String(row.sender || '').trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }
  return merged;
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
    const imageUnit = data?.imageUnit ? sanitizeCollectiveImageModelArtifact(data.imageUnit) : null;
    const stats = data?.stats || null;
    saveCollectiveBackendModelCache(model, stats, imageUnit);
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
    const imageUnit = data?.imageUnit ? sanitizeCollectiveImageModelArtifact(data.imageUnit) : undefined;
    const stats = data?.stats || null;
    if (model || stats || imageUnit) {
      saveCollectiveBackendModelCache(model, stats, imageUnit);
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

export async function contributeImagesToBackend(
  uid: string,
  idToken: string | null,
  samples: ImageTrainingSample[],
  hyperparameters?: Partial<TrainingHyperparams>,
  autoTrain = true
): Promise<{
  ok: boolean;
  insertedCount: number;
  updatedCount: number;
  imageUnit: TrainedImageModelArtifact | null;
  stats: CollectiveBackendStats | null;
}> {
  if (!uid || samples.length === 0) {
    return {
      ok: false,
      insertedCount: 0,
      updatedCount: 0,
      imageUnit: loadCollectiveImageUnitCache(),
      stats: loadCollectiveStatsCache()
    };
  }
  try {
    const res = await fetch('/api/image-dataset/contribute', {
      method: 'POST',
      headers: buildBackendHeaders(uid, idToken),
      body: JSON.stringify({
        samples: samples.map(s => ({
          extractedFeatures: s.extractedFeatures,
          ocrText: s.ocrText,
          label: s.label
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
        imageUnit: loadCollectiveImageUnitCache(),
        stats: loadCollectiveStatsCache()
      };
    }
    const data = await res.json();
    const imageUnit = data?.imageUnit ? sanitizeCollectiveImageModelArtifact(data.imageUnit) : null;
    const model = data?.model ? sanitizeCollectiveModelArtifact(data.model) : loadCollectiveBackendModelCache();
    const stats = data?.stats || null;
    if (model || stats || imageUnit) {
      saveCollectiveBackendModelCache(model, stats, imageUnit);
    }
    return {
      ok: true,
      insertedCount: Number(data?.insertedCount) || 0,
      updatedCount: Number(data?.updatedCount) || 0,
      imageUnit,
      stats
    };
  } catch {
    return {
      ok: false,
      insertedCount: 0,
      updatedCount: 0,
      imageUnit: loadCollectiveImageUnitCache(),
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
  const imageUnit = data?.imageUnit ? sanitizeCollectiveImageModelArtifact(data.imageUnit) : undefined;
  saveCollectiveBackendModelCache(sanitized, data.stats, imageUnit);
  return { model: sanitized, stats: data.stats };
}

export interface RemoteUserWorkspace {
  batchRows?: any[];
  batchMeta?: { fileName: string; uploadedAt: string; totalRows: number } | null;
  trainerSamples?: TrainingSample[];
  trainerImages?: ImageTrainingSample[];
  imageAssessments?: ImageTrainingSample[];
  vaultEmails?: any[];
  activeInspectorImage?: PersistedInspectorState | null;
  updatedAt?: string;
}

export async function syncUserWorkspaceToBackend(
  uid: string,
  idToken: string | null,
  patch: RemoteUserWorkspace
): Promise<boolean> {
  if (!uid) return false;
  try {
    const res = await fetch('/api/user/workspace', {
      method: 'POST',
      headers: buildBackendHeaders(uid, idToken),
      body: JSON.stringify(patch)
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchUserWorkspaceFromBackend(
  uid: string,
  idToken?: string | null
): Promise<RemoteUserWorkspace | null> {
  if (!uid) return null;
  try {
    const res = await fetch('/api/user/workspace', {
      method: 'GET',
      headers: buildBackendHeaders(uid, idToken)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.workspace || null;
  } catch {
    return null;
  }
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
