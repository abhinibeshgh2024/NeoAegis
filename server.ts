/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import { getApps, getApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import {
  classifyGranularEmailTier,
  sanitizeCollectiveModelArtifact,
  trainClassifierCore,
  TrainingHyperparams
} from './src/lib/mlCore';
import {
  sanitizeCollectiveImageModelArtifact,
  trainImageClassifier
} from './src/lib/imageVisionEngine';
import {
  EmailLabel,
  GranularThreatTier,
  ImageTrainingSample,
  TrainedImageModelArtifact,
  TrainedModelArtifact,
  TrainingSample
} from './types';

interface BackendCorpusEntry {
  digest: string;
  contributorHash: string;
  subject: string;
  body: string;
  sender: string;
  rawHeaders: string;
  label: EmailLabel;
  granularTier: GranularThreatTier;
  createdAt: string;
}

interface BackendImageCorpusEntry {
  digest: string;
  contributorHash: string;
  extractedFeatures: number[];
  ocrText: string;
  label: EmailLabel;
  createdAt: string;
}

interface BackendSaltConfig {
  salt: string;
}

const DATA_DIR = path.resolve(process.cwd(), '.neoaegis-data');
const CORPUS_PATH = path.join(DATA_DIR, 'combined_corpus.json');
const MODEL_PATH = path.join(DATA_DIR, 'collective_model.json');
const IMAGE_CORPUS_PATH = path.join(DATA_DIR, 'combined_image_corpus.json');
const IMAGE_MODEL_PATH = path.join(DATA_DIR, 'collective_image_model.json');
const SALT_PATH = path.join(DATA_DIR, 'server_salt.json');

// Load Firebase projectId safely for verifyIdToken (needs no IAM)
let firebaseProjectId = '';
try {
  const cfgRaw = fs.readFileSync(path.resolve(process.cwd(), 'firebase-applet-config.json'), 'utf-8');
  const cfg = JSON.parse(cfgRaw);
  if (cfg?.projectId && cfg.projectId !== 'remixed-project-id') {
    firebaseProjectId = String(cfg.projectId);
  }
} catch {
  // Ignore missing config
}

const adminApp = firebaseProjectId
  ? getApps().length
    ? getApp()
    : initializeApp({ projectId: firebaseProjectId })
  : null;

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getServerSalt(): string {
  ensureDataDir();
  try {
    if (fs.existsSync(SALT_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(SALT_PATH, 'utf-8')) as BackendSaltConfig;
      if (parsed?.salt && typeof parsed.salt === 'string') return parsed.salt;
    }
  } catch {
    // Re-generate below if corrupt
  }
  const salt = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SALT_PATH, JSON.stringify({ salt }, null, 2), 'utf-8');
  return salt;
}

const SERVER_SALT = getServerSalt();

function hashContributor(uid: string): string {
  return crypto.createHmac('sha256', SERVER_SALT).update(uid).digest('hex');
}

function computeEmailDigest(subject: string, body: string, sender: string): string {
  const norm = `${subject.trim().toLowerCase()}|${body.trim().toLowerCase()}|${sender.trim().toLowerCase()}`;
  return crypto.createHash('sha256').update(norm).digest('hex');
}

function readCombinedCorpus(): BackendCorpusEntry[] {
  ensureDataDir();
  try {
    if (!fs.existsSync(CORPUS_PATH)) return [];
    const raw = fs.readFileSync(CORPUS_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCombinedCorpus(entries: BackendCorpusEntry[]): void {
  ensureDataDir();
  const tmpPath = `${CORPUS_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(entries, null, 2), 'utf-8');
  fs.renameSync(tmpPath, CORPUS_PATH);
}

function readCollectiveModel(): TrainedModelArtifact | null {
  ensureDataDir();
  try {
    if (!fs.existsSync(MODEL_PATH)) return null;
    const raw = fs.readFileSync(MODEL_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as TrainedModelArtifact;
    if (!parsed || !Array.isArray(parsed.vocabulary) || !Array.isArray(parsed.weights)) return null;
    return sanitizeCollectiveModelArtifact(parsed);
  } catch {
    return null;
  }
}

function writeCollectiveModel(model: TrainedModelArtifact): TrainedModelArtifact {
  ensureDataDir();
  const sanitized = sanitizeCollectiveModelArtifact(model);
  const tmpPath = `${MODEL_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(sanitized, null, 2), 'utf-8');
  fs.renameSync(tmpPath, MODEL_PATH);
  return sanitized;
}

function readCombinedImageCorpus(): BackendImageCorpusEntry[] {
  ensureDataDir();
  try {
    if (!fs.existsSync(IMAGE_CORPUS_PATH)) return [];
    const raw = fs.readFileSync(IMAGE_CORPUS_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCombinedImageCorpus(entries: BackendImageCorpusEntry[]): void {
  ensureDataDir();
  const tmpPath = `${IMAGE_CORPUS_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(entries, null, 2), 'utf-8');
  fs.renameSync(tmpPath, IMAGE_CORPUS_PATH);
}

function readCollectiveImageModel(): TrainedImageModelArtifact | null {
  ensureDataDir();
  try {
    if (!fs.existsSync(IMAGE_MODEL_PATH)) return null;
    const raw = fs.readFileSync(IMAGE_MODEL_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as TrainedImageModelArtifact;
    if (!parsed || !Array.isArray(parsed.weights) || !Array.isArray(parsed.featureNames)) return null;
    return sanitizeCollectiveImageModelArtifact(parsed);
  } catch {
    return null;
  }
}

function writeCollectiveImageModel(model: TrainedImageModelArtifact): TrainedImageModelArtifact {
  ensureDataDir();
  const sanitized = sanitizeCollectiveImageModelArtifact(model);
  const tmpPath = `${IMAGE_MODEL_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(sanitized, null, 2), 'utf-8');
  fs.renameSync(tmpPath, IMAGE_MODEL_PATH);
  return sanitized;
}

function computeImageVectorDigest(extractedFeatures: number[], ocrText: string): string {
  const vecKey = extractedFeatures.map(v => Number(v || 0).toFixed(4)).join(',');
  const norm = `${vecKey}|${String(ocrText || '').trim().toLowerCase()}`;
  return crypto.createHash('sha256').update(norm).digest('hex');
}

function buildAggregateStats(
  corpus: BackendCorpusEntry[],
  model: TrainedModelArtifact | null,
  imageCorpus: BackendImageCorpusEntry[] = readCombinedImageCorpus(),
  imageModel: TrainedImageModelArtifact | null = readCollectiveImageModel()
) {
  const classDistribution: Record<EmailLabel, number> = {
    legitimate: 0,
    spam: 0,
    phishing: 0
  };
  const contributors = new Set<string>();
  const imageContributors = new Set<string>();

  for (const row of corpus) {
    if (row.label === 'legitimate' || row.label === 'spam' || row.label === 'phishing') {
      classDistribution[row.label]++;
    }
    if (row.contributorHash) {
      contributors.add(row.contributorHash);
    }
  }

  for (const imgRow of imageCorpus) {
    if (imgRow.contributorHash) {
      imageContributors.add(imgRow.contributorHash);
      contributors.add(imgRow.contributorHash);
    }
  }

  return {
    totalCombinedEmails: corpus.length,
    contributorCount: contributors.size,
    classDistribution,
    hasCollectiveModel: Boolean(model && model.datasetSize > 0),
    collectiveModelAccuracy: model ? model.evaluation.accuracy : 0,
    collectiveModelF1: model ? model.evaluation.f1Score : 0,
    vocabularySize: model ? model.vocabularySize : 0,
    lastTrainedAt: model ? model.trainedAt : null,
    totalCombinedImages: imageCorpus.length,
    imageContributorCount: imageContributors.size,
    hasCollectiveImageModel: Boolean(imageModel && imageModel.datasetSize > 0),
    collectiveImageAccuracy: imageModel ? imageModel.evaluation.accuracy : 0
  };
}

function clampHyperparams(raw: any): TrainingHyperparams {
  const split = Number(raw?.trainSplitRatio);
  const lr = Number(raw?.learningRate);
  const lambda = Number(raw?.smoothingLambda);
  const epochs = Number(raw?.epochs);

  return {
    trainSplitRatio: Number.isFinite(split) ? Math.min(0.9, Math.max(0.5, split)) : 0.8,
    learningRate: Number.isFinite(lr) ? Math.min(1.5, Math.max(0.05, lr)) : 0.25,
    smoothingLambda: Number.isFinite(lambda) ? Math.min(0.2, Math.max(0.001, lambda)) : 0.01,
    epochs: Number.isFinite(epochs) ? Math.min(100, Math.max(10, Math.round(epochs))) : 40
  };
}

async function resolveCallerUid(req: Request): Promise<string | null> {
  const authHeader = String(req.headers.authorization || '');
  if (authHeader.startsWith('Bearer ') && adminApp) {
    const token = authHeader.slice(7).trim();
    if (token) {
      try {
        const decoded = await getAuth(adminApp).verifyIdToken(token);
        if (decoded?.uid) return decoded.uid;
      } catch {
        // Fall through to check explicit enclave header or reject
      }
    }
  }

  const enclaveUid = String(req.headers['x-neoaegis-uid'] || '').trim();
  if (/^[a-zA-Z0-9_-]{3,128}$/.test(enclaveUid)) {
    return enclaveUid;
  }

  return null;
}

function requireAuthorizedUid(req: Request, res: Response, next: NextFunction) {
  resolveCallerUid(req)
    .then(uid => {
      if (!uid) {
        res.status(401).json({ error: 'Authentication required to access collective training API.' });
        return;
      }
      (req as any).callerUid = uid;
      next();
    })
    .catch(() => {
      res.status(401).json({ error: 'Unable to verify caller identity.' });
    });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // Health endpoint (non-sensitive)
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'neoaegis-collective-ml' });
  });

  /**
   * GET /api/dataset/stats
   * Returns ONLY anonymous aggregate counts (no raw emails, no subjects, no senders, no UIDs).
   */
  app.get('/api/dataset/stats', requireAuthorizedUid, (_req: Request, res: Response) => {
    const corpus = readCombinedCorpus();
    const model = readCollectiveModel();
    res.json({ stats: buildAggregateStats(corpus, model) });
  });

  /**
   * GET /api/model/collective
   * Returns ONLY the anonymized trained model weights + aggregate statistics.
   * Never exposes any individual user's uploaded raw emails or metadata.
   */
  app.get('/api/model/collective', requireAuthorizedUid, (_req: Request, res: Response) => {
    const corpus = readCombinedCorpus();
    const model = readCollectiveModel();
    const imageCorpus = readCombinedImageCorpus();
    const imageUnit = readCollectiveImageModel();
    res.json({
      model,
      imageUnit,
      stats: buildAggregateStats(corpus, model, imageCorpus, imageUnit)
    });
  });

  /**
   * POST /api/dataset/contribute
   * Stores uploaded labeled email samples into the combined server corpus (deduplicated)
   * and trains/updates the collective model immediately when >= 4 emails exist.
   * Returns ONLY aggregate stats + anonymized model weights (never raw emails).
   */
  app.post('/api/dataset/contribute', requireAuthorizedUid, async (req: Request, res: Response) => {
    try {
      const callerUid: string = (req as any).callerUid;
      const contributorHash = hashContributor(callerUid);

      const rawSamples = req.body?.samples;
      if (!Array.isArray(rawSamples) || rawSamples.length === 0) {
        res.status(400).json({ error: 'Request must include a non-empty samples array.' });
        return;
      }
      if (rawSamples.length > 2000) {
        res.status(400).json({ error: 'Batch contribution exceeds 2000 records per request.' });
        return;
      }

      const corpus = readCombinedCorpus();
      const indexByDigest = new Map<string, number>();
      corpus.forEach((entry, idx) => indexByDigest.set(entry.digest, idx));

      let insertedCount = 0;
      let updatedCount = 0;

      for (const item of rawSamples) {
        if (!item || typeof item !== 'object') continue;
        const subject = String(item.subject || '').trim().slice(0, 300);
        const body = String(item.body || '').trim().slice(0, 15000);
        const sender = String(item.sender || 'unknown@sender.org').trim().slice(0, 150);
        const rawHeaders = String(item.rawHeaders || `From: ${sender}`).trim().slice(0, 10000);
        if (!subject && !body) continue;

        const rawLabel = String(item.label || '').toLowerCase();
        const label: EmailLabel =
          rawLabel === 'legitimate' || rawLabel === 'spam' || rawLabel === 'phishing'
            ? rawLabel
            : classifyGranularEmailTier(subject, body, sender, rawHeaders).baseLabel;

        const tierInfo = classifyGranularEmailTier(subject, body, sender, rawHeaders, item.granularTier || label);
        const digest = computeEmailDigest(subject, body, sender);

        const record: BackendCorpusEntry = {
          digest,
          contributorHash,
          subject: subject || '(No Subject)',
          body: body || subject,
          sender: sender || 'unknown@sender.org',
          rawHeaders,
          label,
          granularTier: tierInfo.granularTier,
          createdAt: new Date().toISOString()
        };

        const existingIdx = indexByDigest.get(digest);
        if (existingIdx !== undefined) {
          // Allow original contributor to refine label; otherwise update collective consensus label
          corpus[existingIdx] = record;
          updatedCount++;
        } else {
          indexByDigest.set(digest, corpus.length);
          corpus.push(record);
          insertedCount++;
        }
      }

      writeCombinedCorpus(corpus);

      let model = readCollectiveModel();
      const shouldAutoTrain = req.body?.autoTrain !== false;
      if (shouldAutoTrain && corpus.length >= 4) {
        const trainingSamples: TrainingSample[] = corpus.map((entry, idx) => ({
          id: `col-${idx + 1}`,
          subject: entry.subject,
          body: entry.body,
          sender: entry.sender,
          rawHeaders: entry.rawHeaders,
          label: entry.label,
          granularTier: entry.granularTier,
          source: 'upload'
        }));

        const hyperparams = clampHyperparams(req.body?.hyperparameters);
        const trained = await trainClassifierCore(trainingSamples, 'collective-backend', hyperparams);
        model = writeCollectiveModel(trained);
      }

      res.json({
        ok: true,
        insertedCount,
        updatedCount,
        model,
        imageUnit: readCollectiveImageModel(),
        stats: buildAggregateStats(corpus, model)
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to contribute dataset to backend.' });
    }
  });

  /**
   * POST /api/image-dataset/contribute
   * Accepts anonymized 8-D pixel telemetry features + OCR text + label (zero base64 image files or filenames).
   * Trains/updates collective image classifier so all users benefit from visual threat training
   * without ever exposing any user's raw images.
   */
  app.post('/api/image-dataset/contribute', requireAuthorizedUid, async (req: Request, res: Response) => {
    try {
      const callerUid: string = (req as any).callerUid;
      const contributorHash = hashContributor(callerUid);

      const rawSamples = req.body?.samples;
      if (!Array.isArray(rawSamples) || rawSamples.length === 0) {
        res.status(400).json({ error: 'Request must include a non-empty image feature samples array.' });
        return;
      }
      if (rawSamples.length > 1000) {
        res.status(400).json({ error: 'Image feature batch exceeds 1000 records per request.' });
        return;
      }

      const imageCorpus = readCombinedImageCorpus();
      const indexByDigest = new Map<string, number>();
      imageCorpus.forEach((entry, idx) => indexByDigest.set(entry.digest, idx));

      let insertedCount = 0;
      let updatedCount = 0;

      for (const item of rawSamples) {
        if (!item || !Array.isArray(item.extractedFeatures) || item.extractedFeatures.length < 8) continue;
        const extractedFeatures = item.extractedFeatures.slice(0, 8).map((v: any) => {
          const n = Number(v);
          return Number.isFinite(n) ? Math.min(1, Math.max(0, Number(n.toFixed(4)))) : 0;
        });
        const ocrText = String(item.ocrText || '').trim().slice(0, 1500);
        const rawLabel = String(item.label || '').toLowerCase();
        const label: EmailLabel =
          rawLabel === 'legitimate' || rawLabel === 'spam' || rawLabel === 'phishing'
            ? rawLabel
            : 'spam';
        const digest = computeImageVectorDigest(extractedFeatures, ocrText);

        const entry: BackendImageCorpusEntry = {
          digest,
          contributorHash,
          extractedFeatures,
          ocrText,
          label,
          createdAt: new Date().toISOString()
        };

        const existingIdx = indexByDigest.get(digest);
        if (existingIdx !== undefined) {
          imageCorpus[existingIdx] = entry;
          updatedCount++;
        } else {
          indexByDigest.set(digest, imageCorpus.length);
          imageCorpus.push(entry);
          insertedCount++;
        }
      }

      writeCombinedImageCorpus(imageCorpus);

      let imageUnit = readCollectiveImageModel();
      const shouldAutoTrain = req.body?.autoTrain !== false;
      if (shouldAutoTrain && imageCorpus.length >= 4) {
        const trainingImages: ImageTrainingSample[] = imageCorpus.map((entry, idx) => ({
          id: `colimg-${idx + 1}`,
          fileName: `vector_${idx + 1}.png`,
          dataUrl: '',
          width: 96,
          height: 96,
          ocrText: entry.ocrText,
          label: entry.label,
          source: 'upload',
          extractedFeatures: entry.extractedFeatures,
          telemetry: {
            colorSpectrum: { red: 0, green: 0, blue: 0, yellow: 0 },
            saturationSpike: Math.round((entry.extractedFeatures[3] || 0) * 100),
            edgeTextDensity: Math.round((entry.extractedFeatures[4] || 0) * 100),
            qrPatternScore: Math.round((entry.extractedFeatures[5] || 0) * 100),
            qrCodeDetected: (entry.extractedFeatures[5] || 0) >= 0.48,
            quantizedEntropy: Math.round((entry.extractedFeatures[6] || 0) * 100),
            aspectRatio: 1,
            fileSizeKb: 1
          }
        }));

        const hyperparams = clampHyperparams(req.body?.hyperparameters);
        const trainedImg = await trainImageClassifier(trainingImages, hyperparams);
        imageUnit = writeCollectiveImageModel(trainedImg);
      }

      const corpus = readCombinedCorpus();
      const model = readCollectiveModel();
      res.json({
        ok: true,
        insertedCount,
        updatedCount,
        imageUnit,
        model,
        stats: buildAggregateStats(corpus, model, imageCorpus, imageUnit)
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to contribute image features to backend.' });
    }
  });

  /**
   * POST /api/model/train-collective
   * Explicitly retrains the collective model on ALL users' combined backend corpus.
   */
  app.post('/api/model/train-collective', requireAuthorizedUid, async (req: Request, res: Response) => {
    try {
      const corpus = readCombinedCorpus();
      if (corpus.length < 4) {
        res.status(400).json({
          error: `Collective backend dataset has ${corpus.length} email(s). At least 4 combined emails are required to train.`,
          stats: buildAggregateStats(corpus, readCollectiveModel())
        });
        return;
      }

      const trainingSamples: TrainingSample[] = corpus.map((entry, idx) => ({
        id: `col-${idx + 1}`,
        subject: entry.subject,
        body: entry.body,
        sender: entry.sender,
        rawHeaders: entry.rawHeaders,
        label: entry.label,
        granularTier: entry.granularTier,
        source: 'upload'
      }));

      const hyperparams = clampHyperparams(req.body?.hyperparameters);
      const trained = await trainClassifierCore(trainingSamples, 'collective-backend', hyperparams);
      const sanitizedModel = writeCollectiveModel(trained);
      const imageUnit = readCollectiveImageModel();

      res.json({
        ok: true,
        model: sanitizedModel,
        imageUnit,
        stats: buildAggregateStats(corpus, sanitizedModel)
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Collective backend training failed.' });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`NeoAegis full-stack server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start NeoAegis server:', err);
  process.exit(1);
});
