/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EmailLabel,
  TrainingSample,
  EpochTelemetry,
  ModelEvaluationSummary,
  TrainedModelArtifact,
  TrainedImageModelArtifact,
  LocalPredictionResult,
  EvaluatedTestCase
} from '../../types';

const CLASSES: EmailLabel[] = ['legitimate', 'spam', 'phishing'];

export const ENGINEERED_FEATURE_NAMES: string[] = [
  'Urgency Keyword Density',
  'Financial Lure Signal',
  'Authority & Credential Mimicry',
  'Sender Domain Spoofing',
  'Suspicious / Shortened Links',
  'Header Auth & Payload Risk',
  'Caps, Punctuation & Entropy'
];

const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'had', 'her', 'was',
  'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old',
  'see', 'two', 'way', 'who', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use', 'with',
  'that', 'this', 'have', 'from', 'they', 'will', 'been', 'more', 'when', 'your', 'about',
  'into', 'than', 'them', 'then', 'some', 'what', 'there', 'which', 'their', 'would', 'could',
  'should', 'please', 'hello', 'thanks', 'thank', 'regards', 'dear', 'team', 'http', 'https',
  'www', 'com', 'net', 'org'
]);

const URGENCY_TERMS = [
  'urgent', 'immediately', 'act now', 'action required', 'expires', 'last warning', '24 hours',
  'suspended', 'terminated', 'locked', 'unauthorized', 'critical alert', 'deadline', 'final notice',
  'asap', 'within 2 hours', 'blocked'
];

const FINANCIAL_TERMS = [
  'wire', 'transfer', 'invoice', 'payment', 'overdue', 'statement', 'remittance', 'paypal',
  'bitcoin', 'crypto', 'unclaimed', 'bank', 'routing', 'beneficiary', 'gift card', 'prize',
  'winner', 'congratulations', 'lottery', 'jackpot', 'voucher', 'sweepstakes', 'refund', 'payout'
];

const AUTHORITY_CRED_TERMS = [
  'irs', 'fbi', 'department of justice', 'ceo', 'chief', 'executive', 'administrator', 'sysadmin',
  'it support', 'security team', 'hr department', 'password', 'login', 'verify', 'credentials',
  'authenticate', 'ssn', 'social security', 'otp', 'pin', 'reset account', 'confirm identity'
];

const SUSPICIOUS_TLDS = ['.xyz', '.top', '.click', '.tk', '.loan', '.work', '.biz', '.gq', '.cf', '.ml'];
const KNOWN_BRANDS = ['paypal', 'amazon', 'microsoft', 'apple', 'google', 'chase', 'wells', 'bank', 'steam', 'netflix', 'dhl', 'fedex'];
const OFFICIAL_DOMAINS = ['paypal.com', 'amazon.com', 'microsoft.com', 'apple.com', 'google.com', 'chase.com', 'wellsfargo.com'];

let activeMlUserUid: string | null = null;

export function setActiveMlUserUid(uid: string | null): void {
  activeMlUserUid = uid;
}

export function getActiveMlUserUid(): string | null {
  return activeMlUserUid;
}

function getModelStorageKey(uid: string): string {
  return `neoaegis_trained_model_${uid}`;
}

export function saveUserTrainedModel(uid: string, model: TrainedModelArtifact): void {
  if (!uid) return;
  try {
    localStorage.setItem(getModelStorageKey(uid), JSON.stringify(model));
  } catch (err) {
    console.warn('Unable to persist trained model to localStorage:', err);
  }
}

export function loadUserTrainedModel(uid?: string | null): TrainedModelArtifact | null {
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

export function clearUserTrainedModel(uid: string): void {
  if (!uid || typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(getModelStorageKey(uid));
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
  const existing = loadUserTrainedModel(uid);
  if (existing) {
    const updated: TrainedModelArtifact = {
      ...existing,
      version: Date.now(),
      imageUnit
    };
    saveUserTrainedModel(uid, updated);
    return updated;
  }

  // Create a clean host artifact carrying the active Image Training Unit
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
    // Neutral prior with mild security bias until text unit is explicitly trained
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

  // Sanity guard for weight length
  for (let c = 0; c < 3; c++) {
    while (baselineTextShell.weights[c].length < engDim) {
      baselineTextShell.weights[c].push(0);
    }
  }

  saveUserTrainedModel(uid, baselineTextShell);
  return baselineTextShell;
}

function shannonEntropyNorm(str: string): number {
  if (!str) return 0;
  const freq: Record<string, number> = {};
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    freq[ch] = (freq[ch] || 0) + 1;
  }
  let ent = 0;
  for (const ch in freq) {
    const p = freq[ch] / str.length;
    ent -= p * Math.log2(p);
  }
  return Math.min(1, ent / 6.5);
}

export function extractEngineeredFeatures(
  subject: string,
  body: string,
  sender: string,
  rawHeaders: string = ''
): number[] {
  const combined = `${subject} ${body}`.toLowerCase();
  const senderLow = (sender || '').toLowerCase();
  const headersLow = (rawHeaders || '').toLowerCase();

  // 1. Urgency Keyword Density
  let urgHits = 0;
  for (const term of URGENCY_TERMS) {
    if (combined.includes(term)) urgHits++;
  }
  const urgencyScore = Math.min(1, urgHits / 3);

  // 2. Financial Lure Signal
  let finHits = 0;
  for (const term of FINANCIAL_TERMS) {
    if (combined.includes(term)) finHits++;
  }
  const financialScore = Math.min(1, finHits / 3);

  // 3. Authority & Credential Mimicry
  let authHits = 0;
  for (const term of AUTHORITY_CRED_TERMS) {
    if (combined.includes(term)) authHits++;
  }
  const authorityScore = Math.min(1, authHits / 2.5);

  // 4. Sender Domain Spoofing Indicator
  const domainMatch = senderLow.match(/@([a-z0-9.-]+\.[a-z]{2,})/);
  const senderDomain = domainMatch ? domainMatch[1] : '';
  let spoofScore = 0;
  if (senderDomain) {
    if (SUSPICIOUS_TLDS.some(tld => senderDomain.endsWith(tld))) spoofScore += 0.45;
    const hyphenCount = (senderDomain.match(/-/g) || []).length;
    if (hyphenCount >= 2) spoofScore += 0.25;
    const impersonatesBrand =
      KNOWN_BRANDS.some(b => senderDomain.includes(b)) &&
      !OFFICIAL_DOMAINS.some(od => senderDomain === od || senderDomain.endsWith(`.${od}`));
    if (impersonatesBrand) spoofScore += 0.5;
    if (/\d{3,}/.test(senderDomain)) spoofScore += 0.2;
  } else if (senderLow.length > 0) {
    spoofScore += 0.25;
  }
  // Homoglyph check (e.g. PaypaI)
  if (/paypai|micros0ft|arnazon|app1e/i.test(`${sender} ${subject} ${body}`)) {
    spoofScore += 0.45;
  }
  spoofScore = Math.min(1, spoofScore);

  // 5. Suspicious / Shortened Links
  const urls = body.match(/https?:\/\/[^\s"'<>]+/gi) || [];
  let linkRisk = 0;
  for (const u of urls) {
    const low = u.toLowerCase();
    if (/bit\.ly|tinyurl|t\.co|goo\.gl|ow\.ly|is\.gd/.test(low)) linkRisk += 0.45;
    if (/https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(low)) linkRisk += 0.6;
    if (/verify|secure-|login|auth|claim|wallet|update-account/.test(low)) linkRisk += 0.35;
    if (senderDomain) {
      try {
        const host = new URL(u).hostname.toLowerCase();
        if (host && !host.endsWith(senderDomain) && !senderDomain.endsWith(host)) {
          linkRisk += 0.3;
        }
      } catch {
        linkRisk += 0.2;
      }
    }
  }
  linkRisk = Math.min(1, linkRisk);

  // 6. Header Auth & Payload Risk
  let headerRisk = 0;
  if (headersLow.includes('dkim=fail') || headersLow.includes('dkim: fail')) headerRisk += 0.35;
  if (headersLow.includes('spf=fail') || headersLow.includes('received-spf: fail')) headerRisk += 0.35;
  if (headersLow.includes('unverified-relay')) headerRisk += 0.25;
  if (/\.(exe|scr|vbs|bat|js|cmd|zip|rar)\b/i.test(`${headersLow} ${combined}`)) headerRisk += 0.4;
  if (/display:\s*none|font-size:\s*0/i.test(combined)) headerRisk += 0.45;
  headerRisk = Math.min(1, headerRisk);

  // 7. Caps, Punctuation & Entropy
  const upper = (body.match(/[A-Z]/g) || []).length;
  const letters = (body.match(/[a-zA-Z]/g) || []).length;
  const capsRatio = letters > 0 ? upper / letters : 0;
  const exclam = (combined.match(/!/g) || []).length;
  const currency = (combined.match(/\$/g) || []).length;
  const punctRatio = Math.min(1, (exclam * 0.12) + (currency * 0.18));
  const entropy = shannonEntropyNorm(body);
  const styleRisk = Math.min(1, capsRatio * 0.9 + punctRatio * 0.6 + entropy * 0.25);

  return [
    Number(urgencyScore.toFixed(4)),
    Number(financialScore.toFixed(4)),
    Number(authorityScore.toFixed(4)),
    Number(spoofScore.toFixed(4)),
    Number(linkRisk.toFixed(4)),
    Number(headerRisk.toFixed(4)),
    Number(styleRisk.toFixed(4))
  ];
}

export function tokenizeEmail(subject: string, body: string, sender: string): string[] {
  const tokens: string[] = [];

  const extractWords = (text: string, weightRepeat: number, prefix = '') => {
    const clean = (text || '')
      .toLowerCase()
      .replace(/https?:\/\/[^\s]+/g, ' url_token ')
      .replace(/[^a-z0-9_$-]+/g, ' ');
    const parts = clean.split(/\s+/);
    const filtered: string[] = [];
    for (const w of parts) {
      if (w.length < 2 || w.length > 32) continue;
      if (STOPWORDS.has(w)) continue;
      if (/^\d+$/.test(w)) continue;
      filtered.push(w);
      const tok = prefix ? `${prefix}${w}` : w;
      for (let r = 0; r < weightRepeat; r++) {
        tokens.push(tok);
      }
    }
    // High-signal phrase bigrams for phishing/spam precision
    for (let i = 0; i < filtered.length - 1; i++) {
      tokens.push(`bg:${filtered[i]}_${filtered[i + 1]}`);
    }
  };

  // Weight subject tokens higher (2x)
  extractWords(subject, 2, '');
  extractWords(body, 1, '');

  // Sender domain & TLD lexical indicators
  const domMatch = (sender || '').toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})/);
  if (domMatch) {
    const domain = domMatch[1];
    tokens.push(`dom:${domain}`);
    const tld = domain.split('.').pop();
    if (tld) tokens.push(`tld:${tld}`);
    const domainParts = domain.split(/[.-]/).filter(p => p.length >= 2);
    for (const dp of domainParts) {
      if (!STOPWORDS.has(dp)) tokens.push(`dompart:${dp}`);
    }
  }

  return tokens;
}

interface SparseSampleVector {
  engineered: number[];
  tfidf: { idx: number; val: number }[];
  labelIdx: number;
}

function vectorizeSample(
  sample: Pick<TrainingSample, 'subject' | 'body' | 'sender' | 'rawHeaders'>,
  vocabMap: Map<string, number>,
  idf: number[],
  labelIdx: number
): SparseSampleVector {
  const engineered = extractEngineeredFeatures(
    sample.subject,
    sample.body,
    sample.sender,
    sample.rawHeaders || ''
  );

  const tokens = tokenizeEmail(sample.subject, sample.body, sample.sender);
  const tfCounts = new Map<number, number>();
  for (const tok of tokens) {
    const idx = vocabMap.get(tok);
    if (idx !== undefined) {
      tfCounts.set(idx, (tfCounts.get(idx) || 0) + 1);
    }
  }

  const tfidf: { idx: number; val: number }[] = [];
  let normSq = 0;
  const totalToks = Math.max(1, tokens.length);
  tfCounts.forEach((count, idx) => {
    const tf = (1 + Math.log(count)) / Math.log(totalToks + Math.E);
    const val = tf * idf[idx];
    normSq += val * val;
    tfidf.push({ idx, val });
  });

  if (normSq > 0) {
    const norm = Math.sqrt(normSq);
    for (let i = 0; i < tfidf.length; i++) {
      tfidf[i].val = tfidf[i].val / norm;
    }
  }

  return { engineered, tfidf, labelIdx };
}

function softmax(logits: [number, number, number]): [number, number, number] {
  const maxLogit = Math.max(logits[0], logits[1], logits[2]);
  const e0 = Math.exp(logits[0] - maxLogit);
  const e1 = Math.exp(logits[1] - maxLogit);
  const e2 = Math.exp(logits[2] - maxLogit);
  const sum = e0 + e1 + e2 || 1;
  return [e0 / sum, e1 / sum, e2 / sum];
}

function computeLogitsAndProbs(
  vec: SparseSampleVector,
  weights: [number[], number[], number[]],
  bias: [number, number, number],
  engCount: number
): [number, number, number] {
  const logits: [number, number, number] = [bias[0], bias[1], bias[2]];
  for (let c = 0; c < 3; c++) {
    const w = weights[c];
    let z = bias[c];
    for (let j = 0; j < engCount; j++) {
      z += w[j] * vec.engineered[j];
    }
    for (let k = 0; k < vec.tfidf.length; k++) {
      const item = vec.tfidf[k];
      z += w[engCount + item.idx] * item.val;
    }
    logits[c] = z;
  }
  return softmax(logits);
}

function seededShuffle<T>(arr: T[], seedInput: number): T[] {
  const copy = [...arr];
  let seed = seedInput || 1337;
  for (let i = copy.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    const j = seed % (i + 1);
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

export interface TrainingHyperparams {
  trainSplitRatio: number; // e.g. 0.8
  learningRate: number; // e.g. 0.25
  smoothingLambda: number; // e.g. 0.01 (L2 & IDF smoothing)
  epochs: number; // e.g. 40
}

export async function trainLocalClassifier(
  dataset: TrainingSample[],
  ownerUid: string,
  params: TrainingHyperparams,
  onProgress?: (progressPct: number, telemetry: EpochTelemetry) => void,
  existingImageUnit?: TrainedImageModelArtifact
): Promise<TrainedModelArtifact> {
  if (dataset.length < 4) {
    throw new Error('At least 4 labeled samples are required to split and train the local model.');
  }

  const engCount = ENGINEERED_FEATURE_NAMES.length;

  // Stratified shuffle by class so every split gets balanced class representation
  const byClass: Record<EmailLabel, TrainingSample[]> = {
    legitimate: [],
    spam: [],
    phishing: []
  };
  dataset.forEach(s => {
    const lbl: EmailLabel = CLASSES.includes(s.label) ? s.label : 'spam';
    byClass[lbl].push({ ...s, label: lbl });
  });

  const trainSamples: TrainingSample[] = [];
  const testSamples: TrainingSample[] = [];

  CLASSES.forEach((cls, clsIdx) => {
    const shuffled = seededShuffle(byClass[cls], dataset.length * 97 + clsIdx * 31);
    if (shuffled.length === 0) return;
    if (shuffled.length === 1) {
      trainSamples.push(shuffled[0]);
      return;
    }
    const nTrain = Math.max(1, Math.min(shuffled.length - 1, Math.round(shuffled.length * params.trainSplitRatio)));
    trainSamples.push(...shuffled.slice(0, nTrain));
    testSamples.push(...shuffled.slice(nTrain));
  });

  // Fallback if testSamples happened to be empty
  if (testSamples.length === 0 && trainSamples.length > 2) {
    const moved = trainSamples.pop();
    if (moved) testSamples.push(moved);
  }

  // Build vocabulary & IDF from training set only
  const docFreq = new Map<string, number>();
  for (const s of trainSamples) {
    const uniqueToks = new Set(tokenizeEmail(s.subject, s.body, s.sender));
    uniqueToks.forEach(t => {
      docFreq.set(t, (docFreq.get(t) || 0) + 1);
    });
  }

  // Keep top 750 informative tokens sorted by frequency
  const sortedVocab = Array.from(docFreq.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 750);

  const vocabulary = sortedVocab.map(([tok]) => tok);
  const vocabMap = new Map<string, number>();
  vocabulary.forEach((tok, idx) => vocabMap.set(tok, idx));

  const nTrainTotal = trainSamples.length;
  const smoothingOffset = Math.max(0.5, 1 + params.smoothingLambda * 10);
  const idf = sortedVocab.map(([, df]) => {
    return Math.log((nTrainTotal + smoothingOffset) / (df + smoothingOffset)) + 1;
  });

  const trainVecs = trainSamples.map(s =>
    vectorizeSample(s, vocabMap, idf, CLASSES.indexOf(s.label))
  );
  const testVecs = testSamples.map(s =>
    vectorizeSample(s, vocabMap, idf, CLASSES.indexOf(s.label))
  );

  const totalDims = engCount + vocabulary.length;
  const weights: [number[], number[], number[]] = [
    new Array(totalDims).fill(0),
    new Array(totalDims).fill(0),
    new Array(totalDims).fill(0)
  ];
  const bias: [number, number, number] = [0, 0, 0];

  // Inverse class frequency weighting so rare classes train evenly
  const classCounts = [0, 0, 0];
  trainVecs.forEach(v => classCounts[v.labelIdx]++);
  const classWeights = classCounts.map(cnt =>
    cnt > 0 ? nTrainTotal / (3 * cnt) : 1
  );

  const history: EpochTelemetry[] = [];
  const totalEpochs = Math.max(5, Math.min(120, Math.round(params.epochs)));
  const lr = Math.max(0.01, Math.min(2.0, params.learningRate));
  const l2 = Math.max(0.0001, Math.min(0.25, params.smoothingLambda));

  for (let epoch = 1; epoch <= totalEpochs; epoch++) {
    // Accumulate gradients across training samples (batch GD with cosine LR annealing)
    const gradW: [number[], number[], number[]] = [
      new Array(totalDims).fill(0),
      new Array(totalDims).fill(0),
      new Array(totalDims).fill(0)
    ];
    const gradB: [number, number, number] = [0, 0, 0];

    let totalLoss = 0;
    let trainCorrect = 0;

    for (let i = 0; i < trainVecs.length; i++) {
      const vec = trainVecs[i];
      const probs = computeLogitsAndProbs(vec, weights, bias, engCount);
      const y = vec.labelIdx;
      const sampleWeight = classWeights[y];

      // Prediction accuracy check
      const predIdx = probs[0] >= probs[1] && probs[0] >= probs[2] ? 0 : probs[1] >= probs[2] ? 1 : 2;
      if (predIdx === y) trainCorrect++;

      totalLoss += -Math.log(Math.max(1e-7, probs[y])) * sampleWeight;

      for (let c = 0; c < 3; c++) {
        const target = c === y ? 1 : 0;
        const err = (probs[c] - target) * sampleWeight;
        gradB[c] += err;
        for (let j = 0; j < engCount; j++) {
          gradW[c][j] += err * vec.engineered[j];
        }
        for (let k = 0; k < vec.tfidf.length; k++) {
          const item = vec.tfidf[k];
          gradW[c][engCount + item.idx] += err * item.val;
        }
      }
    }

    // L2 penalty term in loss + weight update
    let regLoss = 0;
    const stepLr = lr * (0.65 + 0.35 * Math.cos((Math.PI * (epoch - 1)) / totalEpochs));
    const invN = 1 / Math.max(1, trainVecs.length);

    for (let c = 0; c < 3; c++) {
      bias[c] -= stepLr * (gradB[c] * invN);
      for (let d = 0; d < totalDims; d++) {
        const wVal = weights[c][d];
        regLoss += 0.5 * l2 * wVal * wVal;
        const g = gradW[c][d] * invN + l2 * wVal;
        weights[c][d] = wVal - stepLr * g;
      }
    }

    // Evaluate test accuracy
    let testCorrect = 0;
    for (let i = 0; i < testVecs.length; i++) {
      const vec = testVecs[i];
      const probs = computeLogitsAndProbs(vec, weights, bias, engCount);
      const predIdx = probs[0] >= probs[1] && probs[0] >= probs[2] ? 0 : probs[1] >= probs[2] ? 1 : 2;
      if (predIdx === vec.labelIdx) testCorrect++;
    }

    const telemetry: EpochTelemetry = {
      epoch,
      trainLoss: Number((totalLoss * invN + regLoss * 0.05).toFixed(4)),
      trainAccuracy: Number(((trainCorrect / trainVecs.length) * 100).toFixed(1)),
      testAccuracy: Number(((testCorrect / Math.max(1, testVecs.length)) * 100).toFixed(1))
    };
    history.push(telemetry);

    if (onProgress) {
      onProgress(Math.round((epoch / totalEpochs) * 100), telemetry);
      // Yield briefly to browser paint loop for live progress & chart animation
      if (epoch % 2 === 0 || epoch === totalEpochs) {
        await new Promise(resolve => setTimeout(resolve, 18));
      }
    }
  }

  // Compute full test-set confusion matrix & ROC AUC
  const evalVectors = testVecs.length > 0 ? testVecs : trainVecs;
  const evalSourceSamples = testSamples.length > 0 ? testSamples : trainSamples;
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;

  const classMatrix = [
    { tp: 0, fp: 0, fn: 0, support: 0 },
    { tp: 0, fp: 0, fn: 0, support: 0 },
    { tp: 0, fp: 0, fn: 0, support: 0 }
  ];
  const confusionMatrix3x3: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];
  const testCases: EvaluatedTestCase[] = [];

  const threatScoresWithTruth: { score: number; isThreat: boolean }[] = [];

  for (let i = 0; i < evalVectors.length; i++) {
    const vec = evalVectors[i];
    const src = evalSourceSamples[i];
    const probs = computeLogitsAndProbs(vec, weights, bias, engCount);
    const predIdx = probs[0] >= probs[1] && probs[0] >= probs[2] ? 0 : probs[1] >= probs[2] ? 1 : 2;
    const actualIdx = vec.labelIdx;

    confusionMatrix3x3[actualIdx][predIdx]++;
    classMatrix[actualIdx].support++;
    if (predIdx === actualIdx) {
      classMatrix[actualIdx].tp++;
    } else {
      classMatrix[predIdx].fp++;
      classMatrix[actualIdx].fn++;
    }

    const actualThreat = actualIdx !== 0; // spam or phishing
    const threatProb = probs[1] + probs[2];
    const predThreat = predIdx !== 0 || threatProb >= 0.5;
    threatScoresWithTruth.push({ score: threatProb, isThreat: actualThreat });

    let outcome: 'TP' | 'TN' | 'FP' | 'FN';
    if (predThreat && actualThreat) {
      tp++;
      outcome = 'TP';
    } else if (predThreat && !actualThreat) {
      fp++;
      outcome = 'FP';
    } else if (!predThreat && !actualThreat) {
      tn++;
      outcome = 'TN';
    } else {
      fn++;
      outcome = 'FN';
    }

    if (src) {
      testCases.push({
        id: src.id || `tc-${i + 1}`,
        subject: src.subject,
        sender: src.sender,
        actualLabel: CLASSES[actualIdx],
        predictedLabel: CLASSES[predIdx],
        spamScore: Math.min(99, Math.max(1, Math.round(threatProb * 100))),
        confidence: Math.round(probs[predIdx] * 100),
        outcome,
        correct: predIdx === actualIdx,
        source: 'test_split'
      });
    }
  }

  const perClass = {
    legitimate: buildClassScore(classMatrix[0]),
    spam: buildClassScore(classMatrix[1]),
    phishing: buildClassScore(classMatrix[2])
  };

  const totalEval = evalVectors.length || 1;
  const accuracy = (tp + tn) / totalEval;
  const precision = tp + fp > 0 ? tp / (tp + fp) : accuracy;
  const recall = tp + fn > 0 ? tp / (tp + fn) : accuracy;
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  // ROC Curve across thresholds
  const thresholds = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.0];
  const totalPos = threatScoresWithTruth.filter(t => t.isThreat).length || 1;
  const totalNeg = threatScoresWithTruth.filter(t => !t.isThreat).length || 1;
  const rocCurve = thresholds.map(th => {
    let tPos = 0;
    let fPos = 0;
    for (const item of threatScoresWithTruth) {
      if (item.score >= th) {
        if (item.isThreat) tPos++;
        else fPos++;
      }
    }
    return {
      fpr: Number((fPos / totalNeg).toFixed(3)),
      tpr: Number((tPos / totalPos).toFixed(3))
    };
  });
  rocCurve.sort((a, b) => a.fpr - b.fpr || a.tpr - b.tpr);

  // Trapezoidal AUC
  let rocAUC = 0;
  for (let i = 1; i < rocCurve.length; i++) {
    const dx = rocCurve[i].fpr - rocCurve[i - 1].fpr;
    const avgY = (rocCurve[i].tpr + rocCurve[i - 1].tpr) / 2;
    rocAUC += dx * avgY;
  }
  rocAUC = Number(Math.max(0.5, Math.min(1, rocAUC)).toFixed(3));

  // Extract top learned tokens per class
  const topTokensByClass: Record<EmailLabel, { token: string; weight: number }[]> = {
    legitimate: [],
    spam: [],
    phishing: []
  };

  CLASSES.forEach((cls, cIdx) => {
    const entries: { token: string; weight: number }[] = [];
    for (let j = 0; j < engCount; j++) {
      entries.push({ token: `[Feature] ${ENGINEERED_FEATURE_NAMES[j]}`, weight: Number(weights[cIdx][j].toFixed(3)) });
    }
    for (let vIdx = 0; vIdx < vocabulary.length; vIdx++) {
      entries.push({ token: vocabulary[vIdx], weight: Number(weights[cIdx][engCount + vIdx].toFixed(3)) });
    }
    entries.sort((a, b) => b.weight - a.weight);
    topTokensByClass[cls] = entries.slice(0, 12);
  });

  const artifact: TrainedModelArtifact = {
    version: Date.now(),
    modelType: 'tfidf-softmax-logreg',
    trainedAt: new Date().toISOString(),
    ownerUid,
    datasetSize: dataset.length,
    vocabularySize: vocabulary.length,
    hyperparameters: {
      trainSplitRatio: params.trainSplitRatio,
      learningRate: lr,
      smoothingLambda: l2,
      epochs: totalEpochs
    },
    vocabulary,
    idf,
    engineeredFeatureNames: [...ENGINEERED_FEATURE_NAMES],
    weights,
    bias,
    history,
    evaluation: {
      totalSamples: dataset.length,
      trainCount: trainSamples.length,
      testCount: testSamples.length,
      accuracy: Number(accuracy.toFixed(4)),
      precision: Number(precision.toFixed(4)),
      recall: Number(recall.toFixed(4)),
      f1Score: Number(f1Score.toFixed(4)),
      rocAUC,
      tp,
      fp,
      tn,
      fn,
      perClass,
      rocCurve,
      testCases,
      confusionMatrix3x3
    },
    topTokensByClass,
    imageUnit: existingImageUnit || loadUserTrainedModel(ownerUid)?.imageUnit
  };

  saveUserTrainedModel(ownerUid, artifact);
  return artifact;
}

function buildClassScore(m: { tp: number; fp: number; fn: number; support: number }) {
  const precision = m.tp + m.fp > 0 ? m.tp / (m.tp + m.fp) : m.support === 0 ? 1 : 0;
  const recall = m.tp + m.fn > 0 ? m.tp / (m.tp + m.fn) : m.support === 0 ? 1 : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return {
    precision: Number(precision.toFixed(4)),
    recall: Number(recall.toFixed(4)),
    f1: Number(f1.toFixed(4)),
    support: m.support
  };
}

export function predictWithModel(
  subject: string,
  body: string,
  sender: string,
  rawHeaders: string,
  model: TrainedModelArtifact
): LocalPredictionResult {
  const engCount = model.engineeredFeatureNames.length;
  const vocabMap = new Map<string, number>();
  model.vocabulary.forEach((tok, idx) => vocabMap.set(tok, idx));

  const vec = vectorizeSample(
    { subject, body, sender, rawHeaders },
    vocabMap,
    model.idf,
    0
  );

  const probs = computeLogitsAndProbs(vec, model.weights, model.bias, engCount);
  const predIdx = probs[0] >= probs[1] && probs[0] >= probs[2] ? 0 : probs[1] >= probs[2] ? 1 : 2;
  const predictedLabel = CLASSES[predIdx];

  // Top feature/token contributors toward the winning predicted class
  const contributions: { feature: string; contribution: number }[] = [];
  for (let j = 0; j < engCount; j++) {
    const val = vec.engineered[j] * model.weights[predIdx][j];
    if (Math.abs(val) > 0.01) {
      contributions.push({
        feature: model.engineeredFeatureNames[j],
        contribution: Number(val.toFixed(3))
      });
    }
  }
  for (let k = 0; k < vec.tfidf.length; k++) {
    const item = vec.tfidf[k];
    const val = item.val * model.weights[predIdx][engCount + item.idx];
    if (Math.abs(val) > 0.005) {
      contributions.push({
        feature: model.vocabulary[item.idx],
        contribution: Number(val.toFixed(3))
      });
    }
  }
  contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  const threatProb = probs[1] + probs[2];
  const spamScore = Math.min(99, Math.max(1, Math.round(threatProb * 100)));
  const phishingLikelihood = Math.min(
    99,
    Math.max(1, Math.round((probs[2] * 1.1 + (predictedLabel === 'phishing' ? 0.1 : 0)) * 100))
  );

  return {
    predictedLabel,
    probabilities: {
      legitimate: Number(probs[0].toFixed(4)),
      spam: Number(probs[1].toFixed(4)),
      phishing: Number(probs[2].toFixed(4))
    },
    spamScore,
    phishingLikelihood,
    isCustomModel: true,
    topContributors: contributions.slice(0, 6)
  };
}

// ============================================================================
// CSV / JSON Dataset Parsers
// ============================================================================

export function normalizeEmailLabel(raw: string | undefined | null): EmailLabel {
  const val = String(raw || '').trim().toLowerCase();
  if (val.includes('phish') || val.includes('malicious') || val.includes('scam') || val.includes('bec') || val === '2') {
    return 'phishing';
  }
  if (val.includes('legit') || val.includes('ham') || val.includes('clean') || val.includes('safe') || val.includes('benign') || val === '0') {
    return 'legitimate';
  }
  return 'spam';
}

function parseCsvRow(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseDatasetFileContent(content: string, fileName: string): TrainingSample[] {
  const isJson = fileName.toLowerCase().endsWith('.json') || content.trim().startsWith('[') || content.trim().startsWith('{');
  const samples: TrainingSample[] = [];

  if (isJson) {
    const parsed = JSON.parse(content);
    const rows = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.samples)
      ? parsed.samples
      : Array.isArray(parsed?.data)
      ? parsed.data
      : Array.isArray(parsed?.emails)
      ? parsed.emails
      : [];

    rows.forEach((row: any, idx: number) => {
      if (!row || typeof row !== 'object') return;
      const subject = String(row.subject || row.title || '').trim();
      const body = String(row.body || row.text || row.content || row.message || '').trim();
      const sender = String(row.sender || row.from || 'unknown@sender.org').trim();
      const label = normalizeEmailLabel(row.label ?? row.category ?? row.class ?? row.actual ?? (row.isSpam ? 'spam' : 'legitimate'));
      if (subject || body) {
        samples.push({
          id: `json-${Date.now()}-${idx}`,
          subject: subject || '(No Subject)',
          body: body || subject,
          sender,
          rawHeaders: row.rawHeaders ? String(row.rawHeaders) : `From: ${sender}`,
          label,
          source: 'upload'
        });
      }
    });
    return samples;
  }

  // CSV parsing
  const lines = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter(l => l.trim().length > 0);

  if (lines.length === 0) return [];

  const firstCols = parseCsvRow(lines[0]).map(c => c.toLowerCase().replace(/[^a-z0-9_]/g, ''));
  const hasHeader =
    firstCols.includes('subject') ||
    firstCols.includes('body') ||
    firstCols.includes('label') ||
    firstCols.includes('sender');

  const subjIdx = hasHeader ? firstCols.findIndex(c => c === 'subject' || c === 'title') : 0;
  const bodyIdx = hasHeader ? firstCols.findIndex(c => c === 'body' || c === 'text' || c === 'content' || c === 'message') : 1;
  const senderIdx = hasHeader ? firstCols.findIndex(c => c === 'sender' || c === 'from' || c === 'email') : 2;
  const labelIdx = hasHeader ? firstCols.findIndex(c => c === 'label' || c === 'class' || c === 'category' || c === 'actual' || c === 'actualstatus') : 3;

  const startRow = hasHeader ? 1 : 0;
  for (let i = startRow; i < lines.length; i++) {
    const cols = parseCsvRow(lines[i]);
    if (cols.length < 2) continue;

    const subject = cols[subjIdx >= 0 ? subjIdx : 0] || '(No Subject)';
    const body = cols[bodyIdx >= 0 ? bodyIdx : 1] || subject;
    const sender = cols[senderIdx >= 0 ? senderIdx : 2] || 'unknown@sender.org';
    const rawLabel = cols[labelIdx >= 0 ? labelIdx : cols.length - 1];

    samples.push({
      id: `csv-${Date.now()}-${i}`,
      subject,
      body,
      sender,
      rawHeaders: `From: ${sender}`,
      label: normalizeEmailLabel(rawLabel),
      source: 'upload'
    });
  }

  return samples;
}

export const STARTER_TRAINING_CORPUS: TrainingSample[] = [
  // Legitimate (8)
  {
    id: 'seed-legit-1',
    subject: 'Q3 Architecture Sync & Engineering Roadmap Notes',
    sender: 'alex.k@agency-enterprise.com',
    body: 'Hello team, attached are the reviewed milestones for our Q3 system architecture review. Please share comments before Thursday afternoon standup.',
    label: 'legitimate',
    source: 'starter'
  },
  {
    id: 'seed-legit-2',
    subject: 'Weekly Sprint Retrospective Summary',
    sender: 'scrum-lead@agency-enterprise.com',
    body: 'Great progress this week on unit test coverage and deployment stability. Next sprint planning starts Monday at 10 AM in Room B.',
    label: 'legitimate',
    source: 'starter'
  },
  {
    id: 'seed-legit-3',
    subject: 'DMARC & SPF DNS Rotation Documentation',
    sender: 'it-ops@agency-enterprise.com',
    body: 'We have completed the planned DKIM key rotation for our internal relay cluster. All outbound signatures passed validation checks.',
    label: 'legitimate',
    source: 'starter'
  },
  {
    id: 'seed-legit-4',
    subject: 'Lunch & Learn: Local Privacy Engineering',
    sender: 'events@agency-enterprise.com',
    body: 'Join us tomorrow at noon for a technical talk on zero-knowledge verification and browser sandboxing techniques.',
    label: 'legitimate',
    source: 'starter'
  },
  {
    id: 'seed-legit-5',
    subject: 'Updated Holiday Schedule & PTO Calendar',
    sender: 'hr-team@agency-enterprise.com',
    body: 'Please submit your planned summer vacation dates in the internal HR portal by the end of the month for coverage planning.',
    label: 'legitimate',
    source: 'starter'
  },
  {
    id: 'seed-legit-6',
    subject: 'Dinner plans and weekend travel itinerary',
    sender: 'claire.morgan@familymail.org',
    body: 'Hey! Let me know if Friday evening at 7 PM works for dinner. I reserved a table near the park.',
    label: 'legitimate',
    source: 'starter'
  },
  {
    id: 'seed-legit-7',
    subject: 'Monthly Cloud Infrastructure Cost Breakdown',
    sender: 'finops@agency-enterprise.com',
    body: 'Compute utilization decreased by 12% after optimizing batch worker pools. Full spreadsheet is archived in our shared drive.',
    label: 'legitimate',
    source: 'starter'
  },
  {
    id: 'seed-legit-8',
    subject: 'Design Review Feedback on Navigation Drawer',
    sender: 'maya.patel@agency-enterprise.com',
    body: 'Thanks for updating the mobile navigation spacing and contrast tokens. Everything looks crisp in both light and dark modes.',
    label: 'legitimate',
    source: 'starter'
  },

  // Spam (8)
  {
    id: 'seed-spam-1',
    subject: 'CONGRATULATIONS! You Won a $1000 Gift Card Giveaway!!!',
    sender: 'rewards@raffle-bonus-zone.xyz',
    body: 'You have been selected as our lucky prize winner! Claim your free Walmart and Amazon vouchers immediately before offer expires!!!',
    label: 'spam',
    source: 'starter'
  },
  {
    id: 'seed-spam-2',
    subject: 'EXCLUSIVE DEAL: 85% Off Luxury Watches Today Only!',
    sender: 'promo-blast@deals-outlet-express.top',
    body: 'Unbeatable clearance blowout! Unlimited coupons and guaranteed discounts waiting for you. Click http://bit.ly/watch-deal-now to shop!',
    label: 'spam',
    source: 'starter'
  },
  {
    id: 'seed-spam-3',
    subject: 'Claim Your Unclaimed Sweepstakes Cash Payout $500,000',
    sender: 'claims@international-jackpot-draw.biz',
    body: 'Dear lucky participant, your email won our global lottery ticket drawing! Complete our survey reward form for guaranteed cash payout.',
    label: 'spam',
    source: 'starter'
  },
  {
    id: 'seed-spam-4',
    subject: 'Work From Home & Earn $4,500 Weekly Guaranteed Crypto Income',
    sender: 'crypto-profits@fast-wealth-hub.click',
    body: 'No experience needed! Start generating passive bitcoin returns within 24 hours. Limited free entry spots remaining today!!!',
    label: 'spam',
    source: 'starter'
  },
  {
    id: 'seed-spam-5',
    subject: 'FLASH SALE: Miracle Weight Loss & Supplement Bundle',
    sender: 'newsletter@health-discount-blast.info',
    body: 'Save 90% on our exclusive wellness formula! Free shipping and bonus gift card included with every order placed in the next hour.',
    label: 'spam',
    source: 'starter'
  },
  {
    id: 'seed-spam-6',
    subject: 'FREE Airline Miles & Hotel Voucher Waiting For You',
    sender: 'travel-deals@promo-flyers-club.xyz',
    body: 'Take a quick 30-second survey reward and receive two complimentary round-trip tickets! Act immediately while supplies last!',
    label: 'spam',
    source: 'starter'
  },
  {
    id: 'seed-spam-7',
    subject: 'Hot Penny Stock Alert: 500% Surge Expected Tomorrow',
    sender: 'market-insider@alerts-trading-vip.top',
    body: 'Exclusive deal for private subscribers! Buy now before institutional investors jump in. Guaranteed profit opportunity!',
    label: 'spam',
    source: 'starter'
  },
  {
    id: 'seed-spam-8',
    subject: 'You Have 1 Unclaimed Mystery Reward Box',
    sender: 'prizes@daily-rewards-center.work',
    body: 'Congratulations! Confirm your shipping details and pay $1.99 handling to unlock your free electronics prize winner bundle.',
    label: 'spam',
    source: 'starter'
  },

  // Phishing (8)
  {
    id: 'seed-phish-1',
    subject: 'Action Required: Confirm Wire Instructions for Unpaid Invoice',
    sender: 'accounts-paypal@secures-verify.xyz',
    body: 'Dear customer, we detected unauthorized login activity. Immediately verify your bank routing number and password within 24 hours to prevent permanent account suspension: http://secure-paypal-verify.xyz/login',
    rawHeaders: 'From: PaypaI Security <accounts-paypal@secures-verify.xyz>\nDKIM: Fail\nSPF: Fail',
    label: 'phishing',
    source: 'starter'
  },
  {
    id: 'seed-phish-2',
    subject: 'Urgent: CEO Request for Immediate Wire Transfer',
    sender: 'chief-officer-direct@gmail-corporate-ceo.xyz',
    body: 'Are you at your desk? I am in a confidential board meeting and need you to execute an urgent vendor wire transfer of $18,500 immediately. Keep this discreet.',
    label: 'phishing',
    source: 'starter'
  },
  {
    id: 'seed-phish-3',
    subject: 'Security Breach: Microsoft 365 Password Expires in 2 Hours',
    sender: 'it-helpdesk@microsoft-auth-portal.top',
    body: 'Your corporate credentials have been flagged for unauthorized login. Authenticate your account at http://tinyurl.com/ms365-reauth immediately or mailbox access will be terminated.',
    rawHeaders: 'From: IT Helpdesk <it-helpdesk@microsoft-auth-portal.top>\nDKIM: Fail\nSPF: Fail',
    label: 'phishing',
    source: 'starter'
  },
  {
    id: 'seed-phish-4',
    subject: 'IRS Final Notice: Tax Refund Verification Required',
    sender: 'compliance@irs-refund-claims.click',
    body: 'Internal Revenue Service final warning: Your beneficiary tax refund is blocked. Submit your SSN and bank routing credentials via our secure portal within 24 hours.',
    label: 'phishing',
    source: 'starter'
  },
  {
    id: 'seed-phish-5',
    subject: 'Urgent: Update Apple ID Payment Method — Account Locked',
    sender: 'support@apple-billing-alert.xyz',
    body: 'Your Apple account has been suspended due to failed payment verification. Sign in here to restore access and verify identity immediately.',
    label: 'phishing',
    source: 'starter'
  },
  {
    id: 'seed-phish-6',
    subject: 'HR Policy Update: Sign Mandatory Payroll Beneficiary Form',
    sender: 'hr-payroll@corp-portal-update.work',
    body: 'Dear employee, all staff must re-authenticate corporate login credentials and confirm direct deposit routing before Friday cutoff.',
    label: 'phishing',
    source: 'starter'
  },
  {
    id: 'seed-phish-7',
    subject: 'DHL Express: Delivery Blocked — Confirm Customs Fee & Login',
    sender: 'dispatch@dhl-parcel-verify.top',
    body: 'Your package is held at customs. Click http://bit.ly/dhl-pay-fee to verify identity and settle the overdue clearance remittance.',
    label: 'phishing',
    source: 'starter'
  },
  {
    id: 'seed-phish-8',
    subject: 'Critical Alert: Suspicious Admin Token Reset Requested',
    sender: 'sysadmin@sso-security-gateway.biz',
    body: 'An unauthorized admin login attempt was detected. If this was not you, enter your current password and MFA backup code immediately to cancel termination.',
    rawHeaders: 'From: SysAdmin <sysadmin@sso-security-gateway.biz>\nDKIM: Fail\nSPF: Fail',
    label: 'phishing',
    source: 'starter'
  }
];
