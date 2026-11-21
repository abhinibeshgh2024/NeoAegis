/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EmailLabel,
  GranularThreatTier,
  TrainingSample,
  EpochTelemetry,
  TrainedModelArtifact,
  TrainedImageModelArtifact,
  LocalPredictionResult,
  EvaluatedTestCase
} from '../../types';

export const ML_CLASSES: EmailLabel[] = ['legitimate', 'spam', 'phishing'];

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

export interface TrainingHyperparams {
  trainSplitRatio: number;
  learningRate: number;
  smoothingLambda: number;
  epochs: number;
}

function shannonEntropyNorm(str: string): number {
  if (!str) return 0;
  const sample = str.length > 2500 ? str.slice(0, 2500) : str;
  const freq: Record<string, number> = {};
  for (let i = 0; i < sample.length; i++) {
    const ch = sample[i];
    freq[ch] = (freq[ch] || 0) + 1;
  }
  let ent = 0;
  for (const ch in freq) {
    const p = freq[ch] / sample.length;
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
  const boundedBody = body && body.length > 4000 ? body.slice(0, 4000) : (body || '');
  const boundedHeaders = rawHeaders && rawHeaders.length > 2000 ? rawHeaders.slice(0, 2000) : (rawHeaders || '');
  const combined = `${subject} ${boundedBody}`.toLowerCase();
  const senderLow = (sender || '').toLowerCase();
  const headersLow = boundedHeaders.toLowerCase();

  let urgHits = 0;
  for (const term of URGENCY_TERMS) {
    if (combined.includes(term)) urgHits++;
  }
  const urgencyScore = Math.min(1, urgHits / 3);

  let finHits = 0;
  for (const term of FINANCIAL_TERMS) {
    if (combined.includes(term)) finHits++;
  }
  const financialScore = Math.min(1, finHits / 3);

  let authHits = 0;
  for (const term of AUTHORITY_CRED_TERMS) {
    if (combined.includes(term)) authHits++;
  }
  const authorityScore = Math.min(1, authHits / 2.5);

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
  if (/paypai|micros0ft|arnazon|app1e/i.test(`${sender} ${subject} ${boundedBody.slice(0, 1000)}`)) {
    spoofScore += 0.45;
  }
  spoofScore = Math.min(1, spoofScore);

  const urls = boundedBody.match(/https?:\/\/[^\s"'<>]+/gi) || [];
  let linkRisk = 0;
  const maxUrls = Math.min(urls.length, 10);
  for (let ui = 0; ui < maxUrls; ui++) {
    const u = urls[ui];
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

  let headerRisk = 0;
  if (headersLow.includes('dkim=fail') || headersLow.includes('dkim: fail')) headerRisk += 0.35;
  if (headersLow.includes('spf=fail') || headersLow.includes('received-spf: fail')) headerRisk += 0.35;
  if (headersLow.includes('unverified-relay')) headerRisk += 0.25;
  if (/\.(exe|scr|vbs|bat|js|cmd|zip|rar)\b/i.test(`${headersLow} ${combined}`)) headerRisk += 0.4;
  if (/display:\s*none|font-size:\s*0/i.test(combined)) headerRisk += 0.45;
  headerRisk = Math.min(1, headerRisk);

  let upper = 0;
  let letters = 0;
  for (let i = 0; i < boundedBody.length; i++) {
    const code = boundedBody.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      upper++;
      letters++;
    } else if (code >= 97 && code <= 122) {
      letters++;
    }
  }
  const capsRatio = letters > 0 ? upper / letters : 0;
  const exclam = (combined.match(/!/g) || []).length;
  const currency = (combined.match(/\$/g) || []).length;
  const punctRatio = Math.min(1, (exclam * 0.12) + (currency * 0.18));
  const entropy = shannonEntropyNorm(boundedBody);
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
  const boundedBody = body && body.length > 4000 ? body.slice(0, 4000) : (body || '');

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
    for (let i = 0; i < filtered.length - 1; i++) {
      tokens.push(`bg:${filtered[i]}_${filtered[i + 1]}`);
    }
  };

  extractWords(subject, 2, '');
  extractWords(boundedBody, 1, '');

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

function buildClassScore(m: { tp: number; fp: number; fn: number; support: number }) {
  const precision = m.tp + m.fp > 0 ? m.tp / (m.tp + m.fp) : 0;
  const recall = m.tp + m.fn > 0 ? m.tp / (m.tp + m.fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return {
    precision: Number(precision.toFixed(4)),
    recall: Number(recall.toFixed(4)),
    f1: Number(f1.toFixed(4)),
    support: m.support
  };
}

export async function trainClassifierCore(
  dataset: TrainingSample[],
  ownerUid: string,
  params: TrainingHyperparams,
  onProgress?: (progressPct: number, telemetry: EpochTelemetry) => void,
  existingImageUnit?: TrainedImageModelArtifact
): Promise<TrainedModelArtifact> {
  if (dataset.length < 4) {
    throw new Error('At least 4 labeled samples are required to split and train the model.');
  }

  const engCount = ENGINEERED_FEATURE_NAMES.length;

  const byClass: Record<EmailLabel, TrainingSample[]> = {
    legitimate: [],
    spam: [],
    phishing: []
  };
  dataset.forEach(s => {
    const lbl: EmailLabel = ML_CLASSES.includes(s.label) ? s.label : 'spam';
    byClass[lbl].push({ ...s, label: lbl });
  });

  const trainSamples: TrainingSample[] = [];
  const testSamples: TrainingSample[] = [];

  ML_CLASSES.forEach((cls, clsIdx) => {
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

  if (testSamples.length === 0 && trainSamples.length > 2) {
    const moved = trainSamples.pop();
    if (moved) testSamples.push(moved);
  }

  const docFreq = new Map<string, number>();
  for (let i = 0; i < trainSamples.length; i++) {
    const s = trainSamples[i];
    const uniqueToks = new Set(tokenizeEmail(s.subject, s.body, s.sender));
    uniqueToks.forEach(t => {
      docFreq.set(t, (docFreq.get(t) || 0) + 1);
    });
    if (i > 0 && i % 2500 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

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

  const trainVecs: SparseSampleVector[] = [];
  for (let i = 0; i < trainSamples.length; i++) {
    const s = trainSamples[i];
    trainVecs.push(vectorizeSample(s, vocabMap, idf, ML_CLASSES.indexOf(s.label)));
    if (i > 0 && i % 2500 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  const testVecs: SparseSampleVector[] = [];
  for (let i = 0; i < testSamples.length; i++) {
    const s = testSamples[i];
    testVecs.push(vectorizeSample(s, vocabMap, idf, ML_CLASSES.indexOf(s.label)));
    if (i > 0 && i % 2500 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  const totalDims = engCount + vocabulary.length;
  const weights: [number[], number[], number[]] = [
    new Array(totalDims).fill(0),
    new Array(totalDims).fill(0),
    new Array(totalDims).fill(0)
  ];
  const bias: [number, number, number] = [0, 0, 0];

  const classCounts = [0, 0, 0];
  trainVecs.forEach(v => classCounts[v.labelIdx]++);
  const activeClassCount = classCounts.filter(c => c > 0).length || 1;
  const classWeights = classCounts.map(cnt =>
    cnt > 0 ? nTrainTotal / (activeClassCount * cnt) : 0
  );

  const history: EpochTelemetry[] = [];
  const totalEpochs = Math.max(5, Math.min(120, Math.round(params.epochs)));
  const lr = Math.max(0.01, Math.min(2.0, params.learningRate));
  const l2 = Math.max(0.0001, Math.min(0.25, params.smoothingLambda));

  for (let epoch = 1; epoch <= totalEpochs; epoch++) {
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
      const sampleWeight = classWeights[y] || 1;

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

    let testCorrect = 0;
    const evalSet = testVecs.length > 0 ? testVecs : trainVecs;
    for (let i = 0; i < evalSet.length; i++) {
      const vec = evalSet[i];
      const probs = computeLogitsAndProbs(vec, weights, bias, engCount);
      const predIdx = probs[0] >= probs[1] && probs[0] >= probs[2] ? 0 : probs[1] >= probs[2] ? 1 : 2;
      if (predIdx === vec.labelIdx) testCorrect++;
    }

    const telemetry: EpochTelemetry = {
      epoch,
      trainLoss: Number((totalLoss * invN + regLoss * 0.05).toFixed(4)),
      trainAccuracy: Number(((trainCorrect / trainVecs.length) * 100).toFixed(1)),
      testAccuracy: Number(((testCorrect / Math.max(1, evalSet.length)) * 100).toFixed(1))
    };
    history.push(telemetry);

    if (onProgress) {
      onProgress(Math.round((epoch / totalEpochs) * 100), telemetry);
      if (epoch % 2 === 0 || epoch === totalEpochs) {
        await new Promise(resolve => setTimeout(resolve, 18));
      }
    } else if (trainVecs.length > 3000 && epoch % 4 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

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

    const actualThreat = actualIdx !== 0;
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

    if (src && testCases.length < 300) {
      testCases.push({
        id: src.id || `tc-${i + 1}`,
        subject: src.subject,
        sender: src.sender,
        actualLabel: ML_CLASSES[actualIdx],
        predictedLabel: ML_CLASSES[predIdx],
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

  const thresholds = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.0];
  const totalPos = threatScoresWithTruth.filter(t => t.isThreat).length;
  const totalNeg = threatScoresWithTruth.filter(t => !t.isThreat).length;
  const rocCurve =
    totalPos > 0 && totalNeg > 0
      ? thresholds.map(th => {
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
        })
      : [
          { fpr: 0, tpr: 0 },
          { fpr: 1, tpr: 1 }
        ];
  rocCurve.sort((a, b) => a.fpr - b.fpr || a.tpr - b.tpr);

  let rocAUC = 0;
  for (let i = 1; i < rocCurve.length; i++) {
    const dx = rocCurve[i].fpr - rocCurve[i - 1].fpr;
    const avgY = (rocCurve[i].tpr + rocCurve[i - 1].tpr) / 2;
    rocAUC += dx * avgY;
  }
  rocAUC = Number(Math.max(0.5, Math.min(1, rocAUC)).toFixed(3));

  const topTokensByClass: Record<EmailLabel, { token: string; weight: number }[]> = {
    legitimate: [],
    spam: [],
    phishing: []
  };

  ML_CLASSES.forEach((cls, cIdx) => {
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

  return {
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
    imageUnit: existingImageUnit
  };
}

/**
 * Strips all raw email test-case subjects and senders from a collective model
 * so one user can NEVER inspect another user's contributed email metadata.
 */
export function sanitizeCollectiveModelArtifact(artifact: TrainedModelArtifact): TrainedModelArtifact {
  return {
    ...artifact,
    ownerUid: 'collective-backend',
    evaluation: {
      ...artifact.evaluation,
      testCases: []
    }
  };
}

export function prepareModelVocabCache(model: TrainedModelArtifact | null | undefined): Map<string, number> | undefined {
  if (!model || !Array.isArray(model.vocabulary) || model.vocabulary.length === 0) return undefined;
  const vocabMap = new Map<string, number>();
  for (let i = 0; i < model.vocabulary.length; i++) {
    vocabMap.set(model.vocabulary[i], i);
  }
  return vocabMap;
}

export function predictWithModel(
  subject: string,
  body: string,
  sender: string,
  rawHeaders: string,
  model: TrainedModelArtifact,
  cachedVocabMap?: Map<string, number>
): LocalPredictionResult {
  const engCount = model.engineeredFeatureNames.length;
  const vocabMap = cachedVocabMap || prepareModelVocabCache(model) || new Map<string, number>();

  const vec = vectorizeSample(
    { subject, body, sender, rawHeaders },
    vocabMap,
    model.idf,
    0
  );

  const probs = computeLogitsAndProbs(vec, model.weights, model.bias, engCount);
  const predIdx = probs[0] >= probs[1] && probs[0] >= probs[2] ? 0 : probs[1] >= probs[2] ? 1 : 2;
  const predictedLabel = ML_CLASSES[predIdx];

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

export const GRANULAR_TIER_META: Record<
  GranularThreatTier,
  { label: string; shortLabel: string; baseClass: EmailLabel }
> = {
  complete_legitimate: {
    label: 'Complete Legitimate',
    shortLabel: 'Complete Legit',
    baseClass: 'legitimate'
  },
  suspicious: {
    label: 'Borderline / Suspicious',
    shortLabel: 'Borderline',
    baseClass: 'legitimate'
  },
  spam: {
    label: 'Spam',
    shortLabel: 'Spam',
    baseClass: 'spam'
  },
  highly_spam: {
    label: 'Highly Spam',
    shortLabel: 'Highly Spam',
    baseClass: 'spam'
  },
  phishing: {
    label: 'Phishing',
    shortLabel: 'Phishing',
    baseClass: 'phishing'
  },
  highly_phishing: {
    label: 'Highly Phishing',
    shortLabel: 'Highly Phishing',
    baseClass: 'phishing'
  }
};

export function normalizeEmailLabel(raw: string | undefined | null): EmailLabel {
  const val = String(raw || '').trim().toLowerCase();
  if (
    val.includes('phish') ||
    val.includes('malicious') ||
    val.includes('scam') ||
    val.includes('fraud') ||
    val.includes('credential') ||
    val.includes('bec') ||
    val === '2'
  ) {
    return 'phishing';
  }
  if (
    val.includes('not spam') ||
    val.includes('non-spam') ||
    val.includes('nonspam') ||
    val.includes('legit') ||
    val.includes('ham') ||
    val.includes('clean') ||
    val.includes('safe') ||
    val.includes('benign') ||
    val.includes('normal') ||
    val.includes('good') ||
    val === 'false' ||
    val === '0'
  ) {
    return 'legitimate';
  }
  return 'spam';
}

export function classifyGranularEmailTier(
  subject: string,
  body: string,
  sender: string,
  rawHeaders: string = '',
  rawLabel?: string | null,
  scoreOverride?: number,
  phishOverride?: number
): { baseLabel: EmailLabel; granularTier: GranularThreatTier; severityScore: number } {
  const labelText = String(rawLabel || '').trim().toLowerCase();
  const feats = extractEngineeredFeatures(subject, body, sender, rawHeaders);
  const rawSignalScore = Math.min(
    99,
    Math.max(
      2,
      Math.round(
        (feats[0] * 18 +
          feats[1] * 18 +
          feats[2] * 22 +
          feats[3] * 22 +
          feats[4] * 18 +
          feats[5] * 15 +
          feats[6] * 12) *
          1.15
      )
    )
  );
  const phishSignal = Math.round(feats[2] * 35 + feats[3] * 35 + feats[4] * 25 + feats[5] * 20);
  const severityScore = scoreOverride !== undefined ? scoreOverride : rawSignalScore;
  const phishSeverity = phishOverride !== undefined ? phishOverride : phishSignal;

  if (labelText) {
    if (
      (labelText.includes('high') || labelText.includes('severe') || labelText.includes('critical')) &&
      (labelText.includes('phish') || labelText.includes('bec') || labelText.includes('scam'))
    ) {
      return { baseLabel: 'phishing', granularTier: 'highly_phishing', severityScore: Math.max(80, severityScore) };
    }
    if (
      (labelText.includes('high') || labelText.includes('severe') || labelText.includes('heavy')) &&
      labelText.includes('spam')
    ) {
      return { baseLabel: 'spam', granularTier: 'highly_spam', severityScore: Math.max(78, severityScore) };
    }
    if (
      (labelText.includes('complete') || labelText.includes('verified') || labelText.includes('clean') || labelText.includes('safe')) &&
      (labelText.includes('legit') || labelText.includes('ham') || labelText.includes('safe') || labelText.includes('clean'))
    ) {
      return { baseLabel: 'legitimate', granularTier: 'complete_legitimate', severityScore: Math.min(18, severityScore) };
    }
    if (labelText.includes('suspicious') || labelText.includes('borderline') || labelText.includes('grey')) {
      return { baseLabel: 'legitimate', granularTier: 'suspicious', severityScore: Math.max(30, Math.min(49, severityScore)) };
    }
  }

  const baseLabel: EmailLabel = labelText
    ? normalizeEmailLabel(labelText)
    : phishSeverity >= 48 || feats[2] + feats[3] >= 0.7
    ? 'phishing'
    : severityScore >= 45
    ? 'spam'
    : 'legitimate';

  if (baseLabel === 'phishing') {
    const isHigh = severityScore >= 72 || phishSeverity >= 55 || feats[3] >= 0.45 || feats[5] >= 0.35;
    return {
      baseLabel: 'phishing',
      granularTier: isHigh ? 'highly_phishing' : 'phishing',
      severityScore: Math.max(isHigh ? 78 : 55, severityScore)
    };
  }

  if (baseLabel === 'spam') {
    const isHigh = severityScore >= 72 || feats[1] >= 0.65 || feats[6] >= 0.45 || feats[4] >= 0.45;
    return {
      baseLabel: 'spam',
      granularTier: isHigh ? 'highly_spam' : 'spam',
      severityScore: Math.max(isHigh ? 76 : 52, severityScore)
    };
  }

  const isBorderline = severityScore >= 28 || feats[0] + feats[1] + feats[4] >= 0.45;
  return {
    baseLabel: 'legitimate',
    granularTier: isBorderline ? 'suspicious' : 'complete_legitimate',
    severityScore
  };
}

function parseCsvRecordsFast(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let inQuotes = false;
  let fieldStart = 0;
  let currentParts: string[] | null = null;
  const len = content.length;

  for (let i = 0; i < len; i++) {
    const ch = content.charCodeAt(i);
    if (ch === 34) { // '"'
      if (inQuotes && content.charCodeAt(i + 1) === 34) {
        if (!currentParts) currentParts = [];
        currentParts.push(content.slice(fieldStart, i), '"');
        i++;
        fieldStart = i + 1;
      } else {
        if (!inQuotes && i === fieldStart) {
          inQuotes = true;
          fieldStart = i + 1;
        } else if (inQuotes) {
          if (!currentParts) currentParts = [];
          currentParts.push(content.slice(fieldStart, i));
          inQuotes = false;
          fieldStart = i + 1;
        }
      }
    } else if (ch === 44 && !inQuotes) { // ','
      const rawVal = currentParts
        ? (currentParts.push(content.slice(fieldStart, i)), currentParts.join(''))
        : content.slice(fieldStart, i);
      row.push(rawVal.trim());
      currentParts = null;
      fieldStart = i + 1;
    } else if ((ch === 10 || ch === 13) && !inQuotes) { // '\n' or '\r'
      const rawVal = currentParts
        ? (currentParts.push(content.slice(fieldStart, i)), currentParts.join(''))
        : content.slice(fieldStart, i);
      row.push(rawVal.trim());
      currentParts = null;
      if (ch === 13 && content.charCodeAt(i + 1) === 10) {
        i++;
      }
      if (row.some(cell => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      fieldStart = i + 1;
    }
  }

  if (fieldStart <= len) {
    const tailVal = currentParts
      ? (currentParts.push(content.slice(fieldStart)), currentParts.join(''))
      : content.slice(fieldStart);
    row.push(tailVal.trim());
  }
  if (row.some(cell => cell.length > 0)) {
    rows.push(row);
  }
  return rows;
}

function buildCsvColumnMapping(headerRow: string[]) {
  const firstCols = headerRow.map(c => c.toLowerCase().replace(/[^a-z0-9_]/g, ''));
  const hasHeader =
    firstCols.some(c =>
      [
        'subject', 'title', 'body', 'text', 'emailtext', 'bodytext', 'content', 'message',
        'label', 'class', 'category', 'actual', 'actualstatus', 'status', 'tier',
        'emailtype', 'spam', 'isspam', 'target', 'type', 'sender', 'from', 'email', 'v1', 'v2'
      ].includes(c)
    );

  const subjIdx = hasHeader ? firstCols.findIndex(c => c === 'subject' || c === 'title') : 0;
  const bodyIdx = hasHeader
    ? firstCols.findIndex(c =>
        c === 'body' ||
        c === 'text' ||
        c === 'emailtext' ||
        c === 'bodytext' ||
        c === 'content' ||
        c === 'message' ||
        c === 'v2'
      )
    : 1;
  const senderIdx = hasHeader ? firstCols.findIndex(c => c === 'sender' || c === 'from' || c === 'email') : 2;
  const labelIdx = hasHeader
    ? firstCols.findIndex(c =>
        c === 'label' ||
        c === 'class' ||
        c === 'category' ||
        c === 'actual' ||
        c === 'actualstatus' ||
        c === 'status' ||
        c === 'tier' ||
        c === 'emailtype' ||
        c === 'spam' ||
        c === 'isspam' ||
        c === 'target' ||
        c === 'type' ||
        c === 'v1'
      )
    : 3;
  const headersIdx = hasHeader ? firstCols.findIndex(c => c === 'rawheaders' || c === 'headers') : -1;

  return { hasHeader, subjIdx, bodyIdx, senderIdx, labelIdx, headersIdx };
}

function rowToTrainingSample(
  cols: string[],
  rowIndex: number,
  batchStamp: number,
  colMap: ReturnType<typeof buildCsvColumnMapping>
): TrainingSample | null {
  if (cols.length < 2) return null;
  const { hasHeader, subjIdx, bodyIdx, senderIdx, labelIdx, headersIdx } = colMap;

  let rawBody = '';
  if (hasHeader) {
    rawBody = bodyIdx >= 0 ? cols[bodyIdx] || '' : subjIdx >= 0 ? cols[subjIdx] || '' : '';
  } else {
    rawBody = cols[1] || cols[0] || '';
  }

  let rawSubject = '';
  if (hasHeader) {
    rawSubject = subjIdx >= 0 ? cols[subjIdx] || '' : '';
  } else {
    rawSubject = cols[0] || '';
  }

  if (!rawSubject && rawBody) {
    rawSubject = rawBody.slice(0, 72).replace(/\s+/g, ' ').trim();
  }
  const subject = rawSubject || '(No Subject)';
  const body = rawBody || subject;
  const sender = hasHeader
    ? senderIdx >= 0 && cols[senderIdx]
      ? cols[senderIdx]
      : 'dataset@uploaded.csv'
    : cols.length >= 3 && cols[2]
    ? cols[2]
    : 'dataset@uploaded.csv';
  const rawHeaders = headersIdx >= 0 && cols[headersIdx] ? cols[headersIdx] : `From: ${sender}`;
  const rawLabel =
    labelIdx >= 0
      ? cols[labelIdx] || ''
      : !hasHeader && cols.length >= 4
      ? cols[cols.length - 1]
      : '';
  const classified = classifyGranularEmailTier(
    subject,
    body,
    sender,
    rawHeaders,
    rawLabel && rawLabel.trim().length > 0 ? rawLabel : undefined
  );

  return {
    id: `csv-${batchStamp}-${rowIndex}`,
    subject,
    body,
    sender,
    rawHeaders,
    label: classified.baseLabel,
    granularTier: classified.granularTier,
    evaluatedScore: classified.severityScore,
    source: 'upload'
  };
}

export function parseDatasetFileContent(content: string, fileName: string): TrainingSample[] {
  const isJson = fileName.toLowerCase().endsWith('.json') || content.trimStart().startsWith('[') || content.trimStart().startsWith('{');
  const samples: TrainingSample[] = [];
  const batchStamp = Date.now();

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
      const rawHeaders = row.rawHeaders ? String(row.rawHeaders) : `From: ${sender}`;
      const rawLabelVal =
        row.tier ?? row.granularTier ?? row.label ?? row.category ?? row.class ?? row.actual ?? (row.isSpam === true ? 'spam' : row.isSpam === false ? 'legitimate' : '');
      const hasExplicitLabel = String(rawLabelVal || '').trim().length > 0;
      const classified = classifyGranularEmailTier(
        subject || '(No Subject)',
        body || subject,
        sender,
        rawHeaders,
        hasExplicitLabel ? String(rawLabelVal) : undefined
      );

      if (subject || body) {
        samples.push({
          id: `json-${batchStamp}-${idx}`,
          subject: subject || '(No Subject)',
          body: body || subject,
          sender,
          rawHeaders,
          label: classified.baseLabel,
          granularTier: classified.granularTier,
          evaluatedScore: classified.severityScore,
          source: 'upload'
        });
      }
    });
    return samples;
  }

  const rows = parseCsvRecordsFast(content);
  if (rows.length === 0) return [];

  const colMap = buildCsvColumnMapping(rows[0]);
  const startRow = colMap.hasHeader ? 1 : 0;
  for (let i = startRow; i < rows.length; i++) {
    const item = rowToTrainingSample(rows[i], i, batchStamp, colMap);
    if (item) samples.push(item);
  }

  return samples;
}

/**
 * Cooperative non-blocking parser for large 50,000+ email CSV/JSON uploads.
 * Yields to the browser/Node event loop every 1,500 rows so the UI stays responsive at 60fps.
 */
export async function parseDatasetFileContentAsync(
  content: string,
  fileName: string,
  onProgress?: (pct: number, parsedCount: number, totalRows: number) => void
): Promise<TrainingSample[]> {
  const isJson = fileName.toLowerCase().endsWith('.json') || content.trimStart().startsWith('[') || content.trimStart().startsWith('{');
  const batchStamp = Date.now();
  const samples: TrainingSample[] = [];
  const YIELD_CHUNK = 1500;

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
    const total = rows.length;
    for (let idx = 0; idx < total; idx++) {
      const row = rows[idx];
      if (row && typeof row === 'object') {
        const subject = String(row.subject || row.title || '').trim();
        const body = String(row.body || row.text || row.content || row.message || '').trim();
        const sender = String(row.sender || row.from || 'unknown@sender.org').trim();
        const rawHeaders = row.rawHeaders ? String(row.rawHeaders) : `From: ${sender}`;
        const rawLabelVal =
          row.tier ?? row.granularTier ?? row.label ?? row.category ?? row.class ?? row.actual ?? (row.isSpam === true ? 'spam' : row.isSpam === false ? 'legitimate' : '');
        const hasExplicitLabel = String(rawLabelVal || '').trim().length > 0;
        const classified = classifyGranularEmailTier(
          subject || '(No Subject)',
          body || subject,
          sender,
          rawHeaders,
          hasExplicitLabel ? String(rawLabelVal) : undefined
        );
        if (subject || body) {
          samples.push({
            id: `json-${batchStamp}-${idx}`,
            subject: subject || '(No Subject)',
            body: body || subject,
            sender,
            rawHeaders,
            label: classified.baseLabel,
            granularTier: classified.granularTier,
            evaluatedScore: classified.severityScore,
            source: 'upload'
          });
        }
      }
      if (idx > 0 && idx % YIELD_CHUNK === 0) {
        onProgress?.(Math.min(99, Math.round((idx / Math.max(1, total)) * 100)), samples.length, total);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    onProgress?.(100, samples.length, total);
    return samples;
  }

  onProgress?.(5, 0, 0);
  await new Promise(resolve => setTimeout(resolve, 0));
  const rows = parseCsvRecordsFast(content);
  if (rows.length === 0) {
    onProgress?.(100, 0, 0);
    return [];
  }

  const colMap = buildCsvColumnMapping(rows[0]);
  const startRow = colMap.hasHeader ? 1 : 0;
  const totalRows = Math.max(0, rows.length - startRow);

  for (let i = startRow; i < rows.length; i++) {
    const item = rowToTrainingSample(rows[i], i, batchStamp, colMap);
    if (item) samples.push(item);

    const processed = i - startRow + 1;
    if (processed % YIELD_CHUNK === 0) {
      onProgress?.(Math.min(99, Math.round((processed / Math.max(1, totalRows)) * 100)), samples.length, totalRows);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  onProgress?.(100, samples.length, totalRows);
  return samples;
}
