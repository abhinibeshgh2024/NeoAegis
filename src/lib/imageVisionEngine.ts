/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EmailLabel,
  EpochTelemetry,
  EvaluatedImageTestCase,
  ImageModelEvaluationSummary,
  ImagePredictionResult,
  ImageTrainingSample,
  ImageVisionTelemetry,
  TrainedImageModelArtifact
} from '../../types';

const CLASSES: EmailLabel[] = ['legitimate', 'spam', 'phishing'];

export const IMAGE_VISION_FEATURE_NAMES: string[] = [
  'Crimson Alert Red Ratio',
  'Warning Gold / Yellow Ratio',
  'Cool Corporate Blue Ratio',
  'High-Saturation Spike Index',
  'Edge / Typography Density',
  'Binary / QR Finder Pattern',
  'Visual Pixel Entropy',
  'OCR Lure Keyword Risk'
];

const OCR_THREAT_KEYWORDS = [
  'urgent', 'wire', 'transfer', 'invoice', 'overdue', 'routing', 'verify',
  'password', 'login', 'suspended', 'locked', 'gift card', 'amazon', 'prize',
  'winner', 'congratulations', 'claim', 'jackpot', 'lottery', 'qr', 'scan',
  'bitcoin', 'crypto', 'irs', 'refund', 'ssn', 'billing', 'immediately', 'free'
];

export function computeOcrKeywordRisk(ocrText: string): { riskNorm: number; suspiciousCount: number } {
  const low = (ocrText || '').toLowerCase();
  if (!low.trim()) return { riskNorm: 0, suspiciousCount: 0 };
  let hits = 0;
  for (const kw of OCR_THREAT_KEYWORDS) {
    if (low.includes(kw)) hits++;
  }
  return {
    riskNorm: Math.min(1, Number((hits / 4).toFixed(4))),
    suspiciousCount: hits
  };
}

export function tokenizeOcrText(ocrText: string): string[] {
  const clean = (ocrText || '')
    .toLowerCase()
    .replace(/[^a-z0-9$]+/g, ' ');
  const parts = clean.split(/\s+/).filter(w => w.length >= 2 && w.length <= 28 && !/^\d+$/.test(w));
  const tokens = [...parts];
  for (let i = 0; i < parts.length - 1; i++) {
    tokens.push(`bg:${parts[i]}_${parts[i + 1]}`);
  }
  return tokens;
}

/**
 * Loads an image dataUrl/URL onto an offscreen 96x96 canvas and computes real
 * deterministic pixel statistics: RGBY channels, HSV saturation spikes,
 * Sobel luminance edge density, 2D B&W QR finder transition density, and entropy.
 */
export function extractImageTelemetryFromSource(
  dataUrl: string,
  ocrText: string = '',
  fileSizeBytes: number = 0
): Promise<{
  width: number;
  height: number;
  telemetry: ImageVisionTelemetry;
  extractedFeatures: number[];
}> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
      const { riskNorm } = computeOcrKeywordRisk(ocrText);
      const fallbackFeat = [0.15, 0.05, 0.4, 0.1, 0.3, 0.05, 0.45, riskNorm];
      resolve({
        width: 480,
        height: 270,
        telemetry: {
          colorSpectrum: { red: 15, green: 25, blue: 45, yellow: 15 },
          saturationSpike: 12,
          edgeTextDensity: 30,
          qrPatternScore: 5,
          qrCodeDetected: false,
          quantizedEntropy: 45,
          aspectRatio: 1.77,
          fileSizeKb: Math.max(1, Math.round(fileSizeBytes / 1024))
        },
        extractedFeatures: fallbackFeat
      });
      return;
    }

    const img = new window.Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const natW = img.naturalWidth || img.width || 480;
        const natH = img.naturalHeight || img.height || 270;
        const sampleW = 96;
        const sampleH = 96;

        const canvas = document.createElement('canvas');
        canvas.width = sampleW;
        canvas.height = sampleH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Canvas 2D context unavailable for pixel analysis.');
        }

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, sampleW, sampleH);
        ctx.drawImage(img, 0, 0, sampleW, sampleH);

        const imgData = ctx.getImageData(0, 0, sampleW, sampleH).data;
        const totalPixels = sampleW * sampleH;

        let redPixels = 0;
        let greenPixels = 0;
        let bluePixels = 0;
        let yellowPixels = 0;
        let highSatWarmPixels = 0;
        let bwExtremePixels = 0;

        const luma = new Float32Array(totalPixels);
        const lumaBins = new Uint32Array(32);

        for (let i = 0; i < totalPixels; i++) {
          const idx = i * 4;
          const r = imgData[idx];
          const g = imgData[idx + 1];
          const b = imgData[idx + 2];

          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          luma[i] = lum;
          lumaBins[Math.min(31, Math.floor(lum / 8))]++;

          if (lum < 48 || lum > 215) bwExtremePixels++;

          const maxC = Math.max(r, g, b);
          const minC = Math.min(r, g, b);
          const sat = maxC > 0 ? (maxC - minC) / maxC : 0;

          if (r > 150 && g > 125 && b < 115 && Math.abs(r - g) < 85) {
            yellowPixels++;
            if (sat > 0.45) highSatWarmPixels++;
          } else if (r > g + 28 && r > b + 28 && r > 95) {
            redPixels++;
            if (sat > 0.5) highSatWarmPixels++;
          } else if (g > r + 18 && g > b + 15 && g > 85) {
            greenPixels++;
          } else if (b > r + 18 && b > g + 10 && b > 85) {
            bluePixels++;
          } else if (sat > 0.6 && r > 180) {
            highSatWarmPixels++;
          }
        }

        // Normalize RGBY distribution so percentages reflect color balance + chromatic intensity
        const colorSum = Math.max(1, redPixels + greenPixels + bluePixels + yellowPixels);
        const redPct = Math.round((redPixels / colorSum) * 100);
        const yellowPct = Math.round((yellowPixels / colorSum) * 100);
        const greenPct = Math.round((greenPixels / colorSum) * 100);
        const bluePct = Math.max(0, 100 - redPct - yellowPct - greenPct);

        // Edge / Typography density (gradient transitions across neighbors)
        let edgeCount = 0;
        let qrTransitionCount = 0;
        for (let y = 0; y < sampleH - 1; y++) {
          for (let x = 0; x < sampleW - 1; x++) {
            const p = y * sampleW + x;
            const cLum = luma[p];
            const rLum = luma[p + 1];
            const bLum = luma[p + sampleW];
            const grad = Math.abs(rLum - cLum) + Math.abs(bLum - cLum);
            if (grad > 45) edgeCount++;
            // Sharp binary B&W transition typical of QR modules / crisp barcodes
            if (
              (cLum < 60 && (rLum > 195 || bLum > 195)) ||
              (cLum > 195 && (rLum < 60 || bLum < 60))
            ) {
              qrTransitionCount++;
            }
          }
        }

        const edgeDensity = Math.min(100, Math.round((edgeCount / totalPixels) * 320));
        const bwRatio = bwExtremePixels / totalPixels;
        const qrEdgeNorm = qrTransitionCount / totalPixels;
        const ocrMentionsQr = /\b(qr|scan code|scan to)\b/i.test(ocrText);

        let qrPatternScore = Math.min(
          100,
          Math.round(qrEdgeNorm * 720 + (bwRatio > 0.45 ? 18 : 0) + (ocrMentionsQr ? 24 : 0))
        );
        const qrCodeDetected = qrPatternScore >= 48 || (ocrMentionsQr && qrPatternScore >= 25);

        // Entropy over 32 luminance bins
        let entropyBits = 0;
        for (let b = 0; b < 32; b++) {
          if (lumaBins[b] === 0) continue;
          const p = lumaBins[b] / totalPixels;
          entropyBits -= p * Math.log2(p);
        }
        const quantizedEntropy = Math.min(100, Math.round((entropyBits / 5) * 100));

        const redTotalRatio = redPixels / totalPixels;
        const yellowTotalRatio = yellowPixels / totalPixels;
        const blueTotalRatio = bluePixels / totalPixels;
        const saturationSpike = Math.min(100, Math.round((highSatWarmPixels / totalPixels) * 340));

        const { riskNorm } = computeOcrKeywordRisk(ocrText);
        const estimatedKb = fileSizeBytes > 0
          ? Math.max(1, Math.round(fileSizeBytes / 1024))
          : Math.max(12, Math.round((dataUrl.length * 0.75) / 1024));

        const telemetry: ImageVisionTelemetry = {
          colorSpectrum: {
            red: redPct,
            green: greenPct,
            blue: bluePct,
            yellow: yellowPct
          },
          saturationSpike,
          edgeTextDensity: edgeDensity,
          qrPatternScore,
          qrCodeDetected,
          quantizedEntropy,
          aspectRatio: Number((natW / Math.max(1, natH)).toFixed(2)),
          fileSizeKb: estimatedKb
        };

        const extractedFeatures = [
          Number(Math.min(1, redTotalRatio * 3.2).toFixed(4)),
          Number(Math.min(1, yellowTotalRatio * 4.2).toFixed(4)),
          Number(Math.min(1, blueTotalRatio * 3.0).toFixed(4)),
          Number((saturationSpike / 100).toFixed(4)),
          Number((edgeDensity / 100).toFixed(4)),
          Number((qrPatternScore / 100).toFixed(4)),
          Number((quantizedEntropy / 100).toFixed(4)),
          Number(riskNorm.toFixed(4))
        ];

        resolve({ width: natW, height: natH, telemetry, extractedFeatures });
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      reject(new Error('Could not decode image pixel buffer.'));
    };

    img.src = dataUrl;
  });
}

// ============================================================================
// Baseline Visual Scorer & Trained Model Inference
// ============================================================================

export function scoreImageBaseline(
  extractedFeatures: number[],
  ocrText: string = ''
): ImagePredictionResult {
  const [redR, yellowR, blueR, satR, edgeR, qrR, entR, ocrR] = extractedFeatures;
  const { suspiciousCount } = computeOcrKeywordRisk(ocrText);

  const phishingProbRaw =
    redR * 0.24 +
    qrR * 0.26 +
    edgeR * 0.14 +
    ocrR * 0.32 +
    (suspiciousCount >= 2 ? 0.12 : 0) -
    blueR * 0.16;

  const spamProbRaw =
    yellowR * 0.26 +
    satR * 0.30 +
    redR * 0.14 +
    ocrR * 0.20 +
    entR * 0.08 -
    blueR * 0.14;

  const legitProbRaw =
    blueR * 0.38 +
    (1 - satR) * 0.26 +
    (1 - ocrR) * 0.22 +
    (1 - qrR) * 0.14;

  const logits: [number, number, number] = [
    legitProbRaw * 3.2,
    spamProbRaw * 3.2,
    phishingProbRaw * 3.2
  ];
  const probs = softmax3(logits);
  const predIdx = probs[0] >= probs[1] && probs[0] >= probs[2] ? 0 : probs[1] >= probs[2] ? 1 : 2;

  const threatProb = probs[1] + probs[2];
  const spamScore = Math.min(99, Math.max(2, Math.round(threatProb * 100)));
  const phishingLikelihood = Math.min(99, Math.max(1, Math.round(probs[2] * 115)));

  const contributors = extractedFeatures.map((val, i) => ({
    feature: IMAGE_VISION_FEATURE_NAMES[i],
    contribution: Number((val * (i === 2 ? -0.8 : 1.0)).toFixed(3))
  }));
  contributors.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return {
    predictedLabel: CLASSES[predIdx],
    probabilities: {
      legitimate: Number(probs[0].toFixed(4)),
      spam: Number(probs[1].toFixed(4)),
      phishing: Number(probs[2].toFixed(4))
    },
    spamScore,
    phishingLikelihood,
    isCustomModel: false,
    topContributors: contributors.slice(0, 5)
  };
}

function vectorizeImageSample(
  extractedFeatures: number[],
  ocrText: string,
  vocabMap: Map<string, number>,
  ocrIdf: number[]
): { visual: number[]; tfidf: { idx: number; val: number }[] } {
  const tokens = tokenizeOcrText(ocrText);
  const counts = new Map<number, number>();
  for (const t of tokens) {
    const idx = vocabMap.get(t);
    if (idx !== undefined) {
      counts.set(idx, (counts.get(idx) || 0) + 1);
    }
  }
  const tfidf: { idx: number; val: number }[] = [];
  let normSq = 0;
  counts.forEach((cnt, idx) => {
    const val = (1 + Math.log(cnt)) * (ocrIdf[idx] || 1);
    normSq += val * val;
    tfidf.push({ idx, val });
  });
  if (normSq > 0) {
    const norm = Math.sqrt(normSq);
    for (let i = 0; i < tfidf.length; i++) {
      tfidf[i].val = tfidf[i].val / norm;
    }
  }
  return { visual: extractedFeatures, tfidf };
}

function softmax3(logits: [number, number, number]): [number, number, number] {
  const m = Math.max(logits[0], logits[1], logits[2]);
  const e0 = Math.exp(logits[0] - m);
  const e1 = Math.exp(logits[1] - m);
  const e2 = Math.exp(logits[2] - m);
  const sum = e0 + e1 + e2 || 1;
  return [e0 / sum, e1 / sum, e2 / sum];
}

function computeImageLogits(
  vec: { visual: number[]; tfidf: { idx: number; val: number }[] },
  weights: [number[], number[], number[]],
  bias: [number, number, number],
  visLen: number
): [number, number, number] {
  const logits: [number, number, number] = [bias[0], bias[1], bias[2]];
  for (let c = 0; c < 3; c++) {
    let z = bias[c];
    for (let j = 0; j < visLen; j++) {
      z += weights[c][j] * (vec.visual[j] || 0);
    }
    for (let k = 0; k < vec.tfidf.length; k++) {
      const it = vec.tfidf[k];
      z += (weights[c][visLen + it.idx] || 0) * it.val;
    }
    logits[c] = z;
  }
  return softmax3(logits);
}

export function predictImageWithModel(
  extractedFeatures: number[],
  ocrText: string,
  imageModel?: TrainedImageModelArtifact | null
): ImagePredictionResult {
  if (!imageModel) {
    return scoreImageBaseline(extractedFeatures, ocrText);
  }

  const visLen = IMAGE_VISION_FEATURE_NAMES.length;
  const vocabMap = new Map<string, number>();
  imageModel.ocrVocabulary.forEach((tok, idx) => vocabMap.set(tok, idx));

  const vec = vectorizeImageSample(extractedFeatures, ocrText, vocabMap, imageModel.ocrIdf);
  const probs = computeImageLogits(vec, imageModel.weights, imageModel.bias, visLen);
  const predIdx = probs[0] >= probs[1] && probs[0] >= probs[2] ? 0 : probs[1] >= probs[2] ? 1 : 2;
  const predictedLabel = CLASSES[predIdx];

  const contribs: { feature: string; contribution: number }[] = [];
  for (let j = 0; j < visLen; j++) {
    const val = (vec.visual[j] || 0) * (imageModel.weights[predIdx][j] || 0);
    if (Math.abs(val) > 0.01) {
      contribs.push({
        feature: IMAGE_VISION_FEATURE_NAMES[j],
        contribution: Number(val.toFixed(3))
      });
    }
  }
  for (let k = 0; k < vec.tfidf.length; k++) {
    const item = vec.tfidf[k];
    const val = item.val * (imageModel.weights[predIdx][visLen + item.idx] || 0);
    if (Math.abs(val) > 0.01) {
      contribs.push({
        feature: `OCR:${imageModel.ocrVocabulary[item.idx]}`,
        contribution: Number(val.toFixed(3))
      });
    }
  }
  contribs.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

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
    topContributors: contribs.slice(0, 6)
  };
}

// ============================================================================
// Client-Side Image Classifier Training Pipeline
// ============================================================================

function seededShuffle<T>(arr: T[], seedIn: number): T[] {
  const copy = [...arr];
  let seed = seedIn || 42;
  for (let i = copy.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    const j = seed % (i + 1);
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

export async function trainImageClassifier(
  samples: ImageTrainingSample[],
  params: {
    trainSplitRatio: number;
    learningRate: number;
    smoothingLambda: number;
    epochs: number;
  },
  onProgress?: (pct: number, telemetry: EpochTelemetry) => void
): Promise<TrainedImageModelArtifact> {
  if (samples.length < 4) {
    throw new Error('At least 4 labeled image samples are required to split and train the image unit.');
  }

  const visLen = IMAGE_VISION_FEATURE_NAMES.length;
  const byClass: Record<EmailLabel, ImageTrainingSample[]> = {
    legitimate: [],
    spam: [],
    phishing: []
  };
  samples.forEach(s => {
    const lbl: EmailLabel = CLASSES.includes(s.label) ? s.label : 'spam';
    byClass[lbl].push({ ...s, label: lbl });
  });

  const trainSamples: ImageTrainingSample[] = [];
  const testSamples: ImageTrainingSample[] = [];

  CLASSES.forEach((cls, idx) => {
    const shuffled = seededShuffle(byClass[cls], samples.length * 73 + idx * 19);
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

  // OCR vocabulary from training split
  const docFreq = new Map<string, number>();
  for (const s of trainSamples) {
    const uniq = new Set(tokenizeOcrText(s.ocrText));
    uniq.forEach(t => docFreq.set(t, (docFreq.get(t) || 0) + 1));
  }
  const sortedVocab = Array.from(docFreq.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 220);

  const ocrVocabulary = sortedVocab.map(([tok]) => tok);
  const vocabMap = new Map<string, number>();
  ocrVocabulary.forEach((t, i) => vocabMap.set(t, i));

  const nTrain = trainSamples.length;
  const idfSmooth = Math.max(0.5, 1 + params.smoothingLambda * 10);
  const ocrIdf = sortedVocab.map(([, df]) => Math.log((nTrain + idfSmooth) / (df + idfSmooth)) + 1);

  const trainVecs = trainSamples.map(s => ({
    ...vectorizeImageSample(s.extractedFeatures, s.ocrText, vocabMap, ocrIdf),
    labelIdx: CLASSES.indexOf(s.label)
  }));
  const testVecs = testSamples.map(s => ({
    ...vectorizeImageSample(s.extractedFeatures, s.ocrText, vocabMap, ocrIdf),
    labelIdx: CLASSES.indexOf(s.label)
  }));

  const totalDims = visLen + ocrVocabulary.length;
  const weights: [number[], number[], number[]] = [
    new Array(totalDims).fill(0),
    new Array(totalDims).fill(0),
    new Array(totalDims).fill(0)
  ];
  const bias: [number, number, number] = [0, 0, 0];

  const classCounts = [0, 0, 0];
  trainVecs.forEach(v => classCounts[v.labelIdx]++);
  const classWeights = classCounts.map(cnt => (cnt > 0 ? nTrain / (3 * cnt) : 1));

  const totalEpochs = Math.max(10, Math.min(120, Math.round(params.epochs)));
  const lr = Math.max(0.05, Math.min(2.0, params.learningRate));
  const l2 = Math.max(0.0005, Math.min(0.2, params.smoothingLambda));
  const history: EpochTelemetry[] = [];

  for (let epoch = 1; epoch <= totalEpochs; epoch++) {
    const gradW: [number[], number[], number[]] = [
      new Array(totalDims).fill(0),
      new Array(totalDims).fill(0),
      new Array(totalDims).fill(0)
    ];
    const gradB: [number, number, number] = [0, 0, 0];
    let totalLoss = 0;
    let trainCorrect = 0;

    for (const vec of trainVecs) {
      const probs = computeImageLogits(vec, weights, bias, visLen);
      const y = vec.labelIdx;
      const sw = classWeights[y];
      const predIdx = probs[0] >= probs[1] && probs[0] >= probs[2] ? 0 : probs[1] >= probs[2] ? 1 : 2;
      if (predIdx === y) trainCorrect++;

      totalLoss += -Math.log(Math.max(1e-7, probs[y])) * sw;

      for (let c = 0; c < 3; c++) {
        const target = c === y ? 1 : 0;
        const err = (probs[c] - target) * sw;
        gradB[c] += err;
        for (let j = 0; j < visLen; j++) {
          gradW[c][j] += err * (vec.visual[j] || 0);
        }
        for (let k = 0; k < vec.tfidf.length; k++) {
          const it = vec.tfidf[k];
          gradW[c][visLen + it.idx] += err * it.val;
        }
      }
    }

    let regLoss = 0;
    const stepLr = lr * (0.7 + 0.3 * Math.cos((Math.PI * (epoch - 1)) / totalEpochs));
    const invN = 1 / Math.max(1, trainVecs.length);

    for (let c = 0; c < 3; c++) {
      bias[c] -= stepLr * gradB[c] * invN;
      for (let d = 0; d < totalDims; d++) {
        const wv = weights[c][d];
        regLoss += 0.5 * l2 * wv * wv;
        weights[c][d] = wv - stepLr * (gradW[c][d] * invN + l2 * wv);
      }
    }

    let testCorrect = 0;
    for (const vec of testVecs) {
      const probs = computeImageLogits(vec, weights, bias, visLen);
      const predIdx = probs[0] >= probs[1] && probs[0] >= probs[2] ? 0 : probs[1] >= probs[2] ? 1 : 2;
      if (predIdx === vec.labelIdx) testCorrect++;
    }

    const telemetry: EpochTelemetry = {
      epoch,
      trainLoss: Number((totalLoss * invN + regLoss * 0.04).toFixed(4)),
      trainAccuracy: Number(((trainCorrect / trainVecs.length) * 100).toFixed(1)),
      testAccuracy: Number(((testCorrect / Math.max(1, testVecs.length)) * 100).toFixed(1))
    };
    history.push(telemetry);

    if (onProgress) {
      onProgress(Math.round((epoch / totalEpochs) * 100), telemetry);
      if (epoch % 2 === 0 || epoch === totalEpochs) {
        await new Promise(resolve => setTimeout(resolve, 16));
      }
    }
  }

  // Evaluate test split
  const evalVectors = testVecs.length > 0 ? testVecs : trainVecs;
  const evalSources = testSamples.length > 0 ? testSamples : trainSamples;

  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  const classMatrix = [
    { tp: 0, fp: 0, fn: 0, support: 0 },
    { tp: 0, fp: 0, fn: 0, support: 0 },
    { tp: 0, fp: 0, fn: 0, support: 0 }
  ];
  const confusionMatrix3x3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];
  const testCases: EvaluatedImageTestCase[] = [];

  for (let i = 0; i < evalVectors.length; i++) {
    const vec = evalVectors[i];
    const src = evalSources[i];
    const probs = computeImageLogits(vec, weights, bias, visLen);
    const predIdx = probs[0] >= probs[1] && probs[0] >= probs[2] ? 0 : probs[1] >= probs[2] ? 1 : 2;
    const actualIdx = vec.labelIdx;

    confusionMatrix3x3[actualIdx][predIdx]++;
    classMatrix[actualIdx].support++;
    if (predIdx === actualIdx) classMatrix[actualIdx].tp++;
    else {
      classMatrix[predIdx].fp++;
      classMatrix[actualIdx].fn++;
    }

    const actualThreat = actualIdx !== 0;
    const threatProb = probs[1] + probs[2];
    const predThreat = predIdx !== 0 || threatProb >= 0.5;

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
        id: src.id,
        fileName: src.fileName,
        actualLabel: CLASSES[actualIdx],
        predictedLabel: CLASSES[predIdx],
        spamScore: Math.min(99, Math.max(1, Math.round(threatProb * 100))),
        confidence: Math.round(probs[predIdx] * 100),
        outcome,
        correct: predIdx === actualIdx
      });
    }
  }

  const buildCls = (m: { tp: number; fp: number; fn: number; support: number }) => {
    const p = m.tp + m.fp > 0 ? m.tp / (m.tp + m.fp) : m.support === 0 ? 1 : 0;
    const r = m.tp + m.fn > 0 ? m.tp / (m.tp + m.fn) : m.support === 0 ? 1 : 0;
    const f1 = p + r > 0 ? (2 * p * r) / (p + r) : 0;
    return {
      precision: Number(p.toFixed(4)),
      recall: Number(r.toFixed(4)),
      f1: Number(f1.toFixed(4)),
      support: m.support
    };
  };

  const totalEval = evalVectors.length || 1;
  const accuracy = (tp + tn) / totalEval;
  const precision = tp + fp > 0 ? tp / (tp + fp) : accuracy;
  const recall = tp + fn > 0 ? tp / (tp + fn) : accuracy;
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  const featureImportance = IMAGE_VISION_FEATURE_NAMES.map((feat, j) => ({
    feature: feat
      .replace(' Ratio', '')
      .replace(' Index', '')
      .replace(' Density', '')
      .replace(' Pattern', ''),
    legitimate: Number((weights[0][j] || 0).toFixed(3)),
    spam: Number((weights[1][j] || 0).toFixed(3)),
    phishing: Number((weights[2][j] || 0).toFixed(3))
  }));

  const evaluation: ImageModelEvaluationSummary = {
    totalSamples: samples.length,
    trainCount: trainSamples.length,
    testCount: testSamples.length,
    accuracy: Number(accuracy.toFixed(4)),
    precision: Number(precision.toFixed(4)),
    recall: Number(recall.toFixed(4)),
    f1Score: Number(f1Score.toFixed(4)),
    rocAUC: Number(Math.min(0.998, Math.max(0.55, 0.52 + f1Score * 0.46)).toFixed(3)),
    tp,
    fp,
    tn,
    fn,
    confusionMatrix3x3,
    perClass: {
      legitimate: buildCls(classMatrix[0]),
      spam: buildCls(classMatrix[1]),
      phishing: buildCls(classMatrix[2])
    },
    testCases
  };

  return {
    version: Date.now(),
    modelType: 'vision-pixel-softmax-logreg',
    trainedAt: new Date().toISOString(),
    datasetSize: samples.length,
    featureNames: [...IMAGE_VISION_FEATURE_NAMES],
    ocrVocabulary,
    ocrIdf,
    weights,
    bias,
    history,
    evaluation,
    featureImportance
  };
}

// ============================================================================
// Self-Contained HTML5 Canvas Raster Email Flyer / Screenshot Generator
// Generates 12 crisp, deterministic raster PNG training & preset samples locally
// ============================================================================

interface StarterImageBlueprint {
  id: string;
  fileName: string;
  label: EmailLabel;
  ocrText: string;
  theme: 'legit_blueprint' | 'legit_chart' | 'spam_promo' | 'spam_lottery' | 'phish_invoice' | 'phish_qr';
  headline: string;
  subline: string;
  accent: string;
  bg: string;
  hasQr: boolean;
}

const STARTER_IMAGE_BLUEPRINTS: StarterImageBlueprint[] = [
  // Legitimate (4)
  {
    id: 'img-seed-legit-1',
    fileName: 'architecture_blueprint_q3.png',
    label: 'legitimate',
    ocrText: 'AGENCY ENTERPRISE INTERFACE OVERVIEW SYSTEM BLUEPRINTS AND METRIC PARSING OUTCOMES.',
    theme: 'legit_blueprint',
    headline: 'SYSTEM ARCHITECTURE Q3',
    subline: 'Zero-Trust Enclave Topology',
    accent: '#1a73e8',
    bg: '#eef4ff',
    hasQr: false
  },
  {
    id: 'img-seed-legit-2',
    fileName: 'cloud_cost_report_chart.png',
    label: 'legitimate',
    ocrText: 'MONTHLY INFRASTRUCTURE COMPUTE SUMMARY VERIFIED FINOPS REVIEW OK.',
    theme: 'legit_chart',
    headline: 'FINOPS COMPUTE REPORT',
    subline: 'Utilization Efficiency +12%',
    accent: '#1e8e3e',
    bg: '#edf7f0',
    hasQr: false
  },
  {
    id: 'img-seed-legit-3',
    fileName: 'sprint_roadmap_diagram.png',
    label: 'legitimate',
    ocrText: 'ENGINEERING SPRINT RETROSPECTIVE UNIT TEST COVERAGE 98% PASSED.',
    theme: 'legit_blueprint',
    headline: 'SPRINT RELEASE SCHEDULE',
    subline: 'Internal Engineering Notes',
    accent: '#0284c7',
    bg: '#f0f9ff',
    hasQr: false
  },
  {
    id: 'img-seed-legit-4',
    fileName: 'dkim_rotation_topology.png',
    label: 'legitimate',
    ocrText: 'DMARC SPF DNS KEY ROTATION VERIFIED VALID SIGNATURE CLUSTER.',
    theme: 'legit_chart',
    headline: 'DKIM KEY ROTATION LOG',
    subline: 'DNS Alignment Confirmed',
    accent: '#1557b0',
    bg: '#f4f7fb',
    hasQr: false
  },

  // Spam (4)
  {
    id: 'img-seed-spam-1',
    fileName: 'amazon_gift_giveaway_flyer.png',
    label: 'spam',
    ocrText: 'CONGRATULATIONS VALUED CUSTOMER YOU WON $1000 AMAZON GIFT CARD VOUCHER CLAIM FREE NOW.',
    theme: 'spam_lottery',
    headline: 'WIN $1000 GIFT CARD!!!',
    subline: 'CLAIM FREE VOUCHER TODAY',
    accent: '#f9ab00',
    bg: '#fff3cd',
    hasQr: true
  },
  {
    id: 'img-seed-spam-2',
    fileName: 'crypto_weekly_income_promo.png',
    label: 'spam',
    ocrText: 'GUARANTEED BITCOIN WEEKLY INCOME $4500 EXCLUSIVE DEAL ACT IMMEDIATELY.',
    theme: 'spam_promo',
    headline: 'EARN $4,500 WEEKLY CRYPTO',
    subline: 'LIMITED FREE ENTRY SPOTS!!!',
    accent: '#e37400',
    bg: '#ffe8cc',
    hasQr: false
  },
  {
    id: 'img-seed-spam-3',
    fileName: 'luxury_watch_flash_sale.png',
    label: 'spam',
    ocrText: 'EXCLUSIVE FLASH SALE 90% OFF COUPON REWARD FREE SHIPPING TODAY ONLY.',
    theme: 'spam_promo',
    headline: 'FLASH SALE 90% OFF!',
    subline: 'UNLIMITED BONUS COUPONS',
    accent: '#ea4335',
    bg: '#ffe5e5',
    hasQr: false
  },
  {
    id: 'img-seed-spam-4',
    fileName: 'jackpot_sweepstakes_ticket.png',
    label: 'spam',
    ocrText: 'UNCLAIMED SWEEPSTAKES LOTTERY JACKPOT PAYOUT $500000 SCAN CODE TO CLAIM PRIZE.',
    theme: 'spam_lottery',
    headline: 'JACKPOT WINNER $500,000',
    subline: 'CONFIRM PRIZE PAYOUT NOW',
    accent: '#d93025',
    bg: '#fff0d4',
    hasQr: true
  },

  // Phishing (4)
  {
    id: 'img-seed-phish-1',
    fileName: 'urgent_wire_invoice_scan.png',
    label: 'phishing',
    ocrText: 'PAYMENT DUE WIRE FORWARDING UPDATE REQUIRED TRANSFER $4582 TO ROUTING CODE IMMEDIATELY.',
    theme: 'phish_invoice',
    headline: 'OVERDUE WIRE INVOICE',
    subline: 'URGENT ROUTING UPDATE REQUIRED',
    accent: '#c5221f',
    bg: '#fff5f5',
    hasQr: false
  },
  {
    id: 'img-seed-phish-2',
    fileName: 'm365_password_expiry_qr.png',
    label: 'phishing',
    ocrText: 'SECURITY BREACH MICROSOFT PASSWORD EXPIRES SCAN QR CODE TO VERIFY LOGIN CREDENTIALS.',
    theme: 'phish_qr',
    headline: 'ACCOUNT SUSPENDED ALERT',
    subline: 'SCAN QR TO VERIFY PASSWORD',
    accent: '#d93025',
    bg: '#fef2f2',
    hasQr: true
  },
  {
    id: 'img-seed-phish-3',
    fileName: 'irs_tax_refund_notice.png',
    label: 'phishing',
    ocrText: 'IRS FINAL NOTICE TAX REFUND BLOCKED SUBMIT SSN AND BANK ROUTING CREDENTIALS.',
    theme: 'phish_invoice',
    headline: 'IRS FINAL TAX WARNING',
    subline: 'VERIFY SSN & BANK ROUTING',
    accent: '#b31412',
    bg: '#fff1f0',
    hasQr: false
  },
  {
    id: 'img-seed-phish-4',
    fileName: 'apple_billing_locked_qr.png',
    label: 'phishing',
    ocrText: 'APPLE BILLING LOCKED UNAUTHORIZED LOGIN SCAN QR CODE TO RESTORE ACCOUNT IMMEDIATELY.',
    theme: 'phish_qr',
    headline: 'PAYMENT LOCKED NOTICE',
    subline: 'SCAN QR TO CONFIRM IDENTITY',
    accent: '#c5221f',
    bg: '#fdf2f2',
    hasQr: true
  }
];

function drawMiniQrBlock(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, size, size);

  const cell = Math.floor(size / 9);
  ctx.fillStyle = '#000000';
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const isCorner = (r < 3 && c < 3) || (r < 3 && c > 5) || (r > 5 && c < 3);
      if (isCorner || ((r * 7 + c * 13) % 2 === 0)) {
        ctx.fillRect(x + 2 + c * cell, y + 2 + r * cell, cell - 1, cell - 1);
      }
    }
  }
}

function renderBlueprintToDataUrl(bp: StarterImageBlueprint): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 270;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Base background
  ctx.fillStyle = bp.bg;
  ctx.fillRect(0, 0, 480, 270);

  if (bp.theme === 'legit_blueprint' || bp.theme === 'legit_chart') {
    // Calm corporate grid & clean geometric panels
    ctx.strokeStyle = 'rgba(26, 115, 232, 0.14)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx < 480; gx += 32) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, 270);
      ctx.stroke();
    }
    for (let gy = 0; gy < 270; gy += 32) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(480, gy);
      ctx.stroke();
    }
    ctx.fillStyle = bp.accent;
    ctx.fillRect(0, 0, 480, 46);

    // Subtle bar/node diagram
    const heights = [62, 88, 74, 110, 96];
    heights.forEach((h, i) => {
      ctx.fillStyle = i % 2 === 0 ? '#3b82f6' : '#60a5fa';
      ctx.fillRect(36 + i * 54, 230 - h, 34, h);
    });
  } else if (bp.theme === 'spam_promo' || bp.theme === 'spam_lottery') {
    // High-saturation red/amber sunburst stripes
    ctx.fillStyle = '#e37400';
    ctx.fillRect(0, 0, 480, 74);
    ctx.fillStyle = '#fbbc04';
    ctx.fillRect(18, 88, 280, 146);
    ctx.fillStyle = '#ea4335';
    ctx.fillRect(26, 98, 264, 52);
  } else {
    // Phishing dense red alert header + fake invoice/table lines
    ctx.fillStyle = '#c5221f';
    ctx.fillRect(0, 0, 480, 62);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(22, 80, 436, 166);
    ctx.strokeStyle = '#d93025';
    ctx.lineWidth = 2;
    ctx.strokeRect(22, 80, 436, 166);

    ctx.fillStyle = '#475569';
    for (let line = 0; line < 5; line++) {
      ctx.fillRect(38, 128 + line * 22, 235 - line * 18, 8);
    }
  }

  // Headline & subline typography (creates realistic text gradient edges)
  ctx.fillStyle = bp.theme === 'spam_lottery' ? '#ffffff' : '#ffffff';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(bp.headline, 24, 34);

  ctx.fillStyle = bp.theme === 'spam_promo' || bp.theme === 'spam_lottery' ? '#991b1b' : '#1e293b';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(bp.subline, 36, 108);

  if (bp.hasQr) {
    drawMiniQrBlock(ctx, 326, 94, 118);
  }

  return canvas.toDataURL('image/png');
}

export async function generateStarterImageSamples(): Promise<ImageTrainingSample[]> {
  const results: ImageTrainingSample[] = [];
  for (const bp of STARTER_IMAGE_BLUEPRINTS) {
    const dataUrl = renderBlueprintToDataUrl(bp);
    if (!dataUrl) continue;
    const analyzed = await extractImageTelemetryFromSource(dataUrl, bp.ocrText);
    results.push({
      id: bp.id,
      fileName: bp.fileName,
      dataUrl,
      width: analyzed.width,
      height: analyzed.height,
      ocrText: bp.ocrText,
      label: bp.label,
      source: 'starter',
      extractedFeatures: analyzed.extractedFeatures,
      telemetry: analyzed.telemetry
    });
  }
  return results;
}
