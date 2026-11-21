/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpamMetrics, LocalPredictionResult, TrainedModelArtifact } from './types';
import { loadUserTrainedModel, predictWithModel } from './src/lib/localMlEngine';

// Large static lists of rules & weights
const SPAM_KEYWORDS_FINANCIAL = [
  'wire transfer', 'invoice', 'payment due', 'overdue', 'statement', 'remittance',
  'paypal', 'bitcoin', 'crypto', 'unclaimed funds', 'bank transfer', 'routing number',
  'account sweep', 'compensation', 'beneficiary', 'western union', 'million dollars'
];

const SPAM_KEYWORDS_URGENT = [
  'urgent', 'act immediately', 'action required', 'expires in', 'last warning',
  '24 hours', 'account suspended', 'terminated', 'security breach', 'unauthorized login',
  'verify identity', 'passwords changed', 'blocked', 'critical alert', 'suspended immediately'
];

const SPAM_KEYWORDS_GIFT_LOTTERY = [
  'gift card', 'prize winner', 'congratulations', 'won a raffle', 'free entry',
  'walmart coupon', 'survey reward', 'lottery ticket', 'claim rewards', 'jackpot',
  'guaranteed payout', 'exclusive deal', 'survey participant'
];

const SPAM_KEYWORDS_AUTHORITY = [
  'internal revenue service', 'irs', 'department of justice', 'fbi', 'federal court',
  'ceo', 'executive officer', 'chief technical', 'board administrative', 'system administrator',
  'accounts department', 'it support desk', 'hr representative'
];

// Helper to calculate Shannon Entropy (randomness of characters to bypass spam filters)
function calculateEntropy(str: string): number {
  if (!str) return 0;
  const sample = str.length > 2500 ? str.slice(0, 2500) : str;
  const len = sample.length;
  const frequencies: { [key: string]: number } = {};
  for (let i = 0; i < len; i++) {
    const c = sample[i];
    frequencies[c] = (frequencies[c] || 0) + 1;
  }
  let entropy = 0;
  for (const c in frequencies) {
    const p = frequencies[c] / len;
    entropy -= p * Math.log2(p);
  }
  return Number((entropy / 8 * 100).toFixed(1)); // Normalize roughly as % of max ASCII entropy
}

/**
 * Parses and computes the 34 spam indices and metrics on cold input.
 */
export function analyzeEmailWithModel(
  subject: string,
  body: string,
  headers: string,
  senderOverride?: string,
  modelOverride?: TrainedModelArtifact | null,
  vocabCacheOverride?: Map<string, number>
): { metrics: SpamMetrics; modelPrediction: LocalPredictionResult | null } {
  const safeBody = body && body.length > 4000 ? body.slice(0, 4000) : (body || '');
  const safeHeaders = headers && headers.length > 2500 ? headers.slice(0, 2500) : (headers || '');
  const combinedText = `${subject} ${safeBody}`.toLowerCase();
  
  // 1. Keyword Trigger Metrics
  let finCount = 0;
  SPAM_KEYWORDS_FINANCIAL.forEach(word => { if (combinedText.includes(word)) finCount++; });
  const financialSensationIndex = Math.min(100, Math.round((finCount / 3) * 100));

  let urgCount = 0;
  SPAM_KEYWORDS_URGENT.forEach(word => { if (combinedText.includes(word)) urgCount++; });
  const urgencyCoefficient = Math.min(100, Math.round((urgCount / 3) * 100));

  let autCount = 0;
  SPAM_KEYWORDS_AUTHORITY.forEach(word => { if (combinedText.includes(word)) autCount++; });
  const authorityMimicryIndex = Math.min(100, Math.round((autCount / 2) * 100));

  let giftCount = 0;
  SPAM_KEYWORDS_GIFT_LOTTERY.forEach(word => { if (combinedText.includes(word)) giftCount++; });
  const giftIndex = Math.min(100, Math.round((giftCount / 2) * 100));

  const totalTriggers = finCount + urgCount + autCount + giftCount;
  const keywordDangerDensity = Math.min(100, Math.round((totalTriggers / 8) * 100));

  // 2. Link & Domain Metrics
  // Match URLs
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  const links = (safeBody.match(urlRegex) || []).slice(0, 12);
  const suspiciousLinkCount = links.filter(l => {
    const low = l.toLowerCase();
    return low.includes('verify') || low.includes('secure-') || low.includes('bit.ly') || low.includes('tinyurl') || low.includes('login') || low.includes('pay-');
  }).length;

  const shortenedUrlsCount = links.filter(l => {
    return l.includes('bit.ly') || l.includes('tinyurl.com') || l.includes('t.co') || l.includes('goo.gl') || l.includes('ow.ly');
  }).length;

  // Header mismatched domains mock check
  let mismatchedDomainsCount = 0;
  if (/from:.*<(.*)>/i.test(safeHeaders)) {
    const fromDomain = safeHeaders.match(/from:.*@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i)?.[1] || '';
    const linkDomains = links.map(l => {
      try {
        const u = new URL(l);
        return u.hostname;
      } catch { return ''; }
    }).filter(h => h !== '');
    
    linkDomains.forEach(ld => {
      if (fromDomain && !ld.endsWith(fromDomain) && !fromDomain.endsWith(ld)) {
        mismatchedDomainsCount++;
      }
    });
  }

  // Tracking Pixels (frequently zero-size or typical tracking host elements)
  const trackingPixelsDetected = (body.match(/<img[^>]*width=["']?1["']?[^>]*height=["']?1["']?/gi) || []).length +
                                (body.includes('pixel') || body.includes('track.php') ? 1 : 0);

  // Blacklist IP (simulated matching typical spam IPs in mock headers)
  let ipBlacklistMatches = 0;
  const ipMatches = headers.match(/\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g) || [];
  const dangerousIPs = ['103.21.', '193.109.', '45.143.', '185.191.'];
  ipMatches.forEach(ip => {
    if (dangerousIPs.some(dip => ip.startsWith(dip))) {
      ipBlacklistMatches++;
    }
  });

  // 3. Technical Deliverability Checks (simulated parsing from rawHeaders)
  let dkimStatus: 'Pass' | 'Fail' | 'None' = 'None';
  let spfStatus: 'Pass' | 'Fail' | 'None' = 'None';
  let dmarcComplianceScore = 100;

  if (headers.toLowerCase().includes('dkim=pass') || headers.toLowerCase().includes('dkim-signature')) dkimStatus = 'Pass';
  else if (headers.toLowerCase().includes('dkim=fail')) dkimStatus = 'Fail';

  if (headers.toLowerCase().includes('spf=pass') || headers.toLowerCase().includes('received-spf: pass')) spfStatus = 'Pass';
  else if (headers.toLowerCase().includes('spf=fail') || headers.toLowerCase().includes('received-spf: fail')) {
    spfStatus = 'Fail';
    dmarcComplianceScore -= 50;
  }

  if (dkimStatus === 'Fail') dmarcComplianceScore -= 40;
  if (dkimStatus === 'None' && spfStatus === 'None') dmarcComplianceScore = 0;

  // 4. Inbound Hops & Relay Server
  const inboundHopCount = (headers.match(/received:/gi) || []).length || 1;
  const relayServerRiskIndex = Math.min(100, Math.max(10, inboundHopCount * 12 + (headers.includes('unverified-relay') ? 35 : 0)));

  // 5. Text Structure & Composition Metrics
  const uppercaseLetters = (body.match(/[A-Z]/g) || []).length;
  const lowercaseLetters = (body.match(/[a-z]/g) || []).length;
  const totalLetters = uppercaseLetters + lowercaseLetters;
  const capitalizationRatio = totalLetters > 0 ? Math.round((uppercaseLetters / totalLetters) * 100) : 0;

  const exclamationCount = (body.match(/!/g) || []).length;
  const questionCount = (body.match(/\?/g) || []).length;
  const currencyCount = (body.match(/\$/g) || []).length;
  const punctuationExaggerationIndex = Math.min(100, (exclamationCount * 15) + (currencyCount * 20) + (questionCount * 10));

  // Subject-to-Body Sentiment Divergence
  // E.g. subject is normal ("Meeting note details") but body talks about urgent money or suspended credentials
  let subjectSentimentDivergence = 20;
  const dangerousSubjectWords = ['verify', 'suspend', 'warn', 'alert', 'notice', 'immediate', 'action'];
  const dangerousBodyWords = ['wire', 'remit', 'password', 'login', 'social security', 'refund', 'bitcoin'];
  const hasVagueSubject = dangerousSubjectWords.some(w => subject.toLowerCase().includes(w));
  const hasSpamBody = dangerousBodyWords.some(w => body.toLowerCase().includes(w));
  if (!hasVagueSubject && hasSpamBody) {
    subjectSentimentDivergence = 85; // Disconnected: subjects sounds innocent, body contains lures
  }

  // Sender-Recipient Name Discrepancy
  let senderRecipientDiscrepancy = false;
  const senderMatch = headers.match(/from:.*?([a-zA-Z0-9.-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]+)/i);
  const recipientMatch = headers.match(/to:.*?([a-zA-Z0-9.-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]+)/i);
  if (senderMatch && recipientMatch) {
    const sen = senderMatch[1].split('@')[0].toLowerCase();
    const rec = recipientMatch[1].split('@')[0].toLowerCase();
    // Typical pattern of mimicking but actually sent to totally random address/domain
    if (combinedText.includes('dear customer') || combinedText.includes('dear user')) {
      senderRecipientDiscrepancy = true;
    }
  }

  // Zero-Font Hidden Text
  const zeroFontHiddenTextDetected = body.includes('display:none') || body.includes('font-size:0') || body.includes('font-size: 0') || body.includes('display: none');

  // Attachment Risk
  let attachmentRiskIndex = 0;
  const attachments = headers.match(/Content-Disposition: attachment; filename="?([^"\n\s]+)"?/g) || [];
  if (attachments.length > 0) {
    attachments.forEach(att => {
      const lowAtt = att.toLowerCase();
      if (lowAtt.endsWith('.exe') || lowAtt.endsWith('.scr') || lowAtt.endsWith('.vbs') || lowAtt.endsWith('.bat') || lowAtt.endsWith('.js') || lowAtt.endsWith('.cmd')) {
        attachmentRiskIndex = Math.max(attachmentRiskIndex, 95);
      } else if (lowAtt.endsWith('.zip') || lowAtt.endsWith('.rar') || lowAtt.endsWith('.7z') || lowAtt.endsWith('.gz')) {
        attachmentRiskIndex = Math.max(attachmentRiskIndex, 75);
      } else if (lowAtt.endsWith('.pdf') || lowAtt.endsWith('.docx') || lowAtt.endsWith('.html')) {
        attachmentRiskIndex = Math.max(attachmentRiskIndex, 45); // Medium risk vectors
      } else {
        attachmentRiskIndex = Math.max(attachmentRiskIndex, 20);
      }
    });
  }

  const messageEntropy = calculateEntropy(body);

  // Time-of-day unusual hours (simulated checking Date header in unusual zone or early 1 AM - 4 AM)
  let unusualHoursTrigger = false;
  const dateMatch = headers.match(/Date:.*?\s(\d{2}):/i);
  if (dateMatch) {
    const hour = parseInt(dateMatch[1], 10);
    if (hour >= 1 && hour <= 4) {
      unusualHoursTrigger = true;
    }
  }

  // Simulated metrics that are filled dynamically or default-calculated
  const imageToTextPayloadRatio = body.toLowerCase().includes('<img>') || body.toLowerCase().includes('<img ') ? 65 : 0;
  const ocrSuspiciousWordsCount = 0;
  const qrCodePresenceRisk = false;
  const visualColorRiskLevel = 0;
  const metadataAgeOfImageDays = 0;

  // Let's compute overall heuristics rules and weights to derive Spam Score and Phishing Likelihood
  let baseSpamScore = 10;
  let basePhishingLikelihood = 5;

  if (financialSensationIndex > 30) { baseSpamScore += 20; basePhishingLikelihood += 15; }
  if (urgencyCoefficient > 30) { baseSpamScore += 15; basePhishingLikelihood += 25; }
  if (authorityMimicryIndex > 40) { baseSpamScore += 10; basePhishingLikelihood += 30; }
  if (giftIndex > 40) { baseSpamScore += 30; basePhishingLikelihood += 10; }
  if (suspiciousLinkCount > 0) { baseSpamScore += 15; basePhishingLikelihood += 35; }
  if (shortenedUrlsCount > 0) { baseSpamScore += 10; basePhishingLikelihood += 15; }
  if (mismatchedDomainsCount > 0) { baseSpamScore += 15; basePhishingLikelihood += 25; }
  if (trackingPixelsDetected > 0) { baseSpamScore += 10; basePhishingLikelihood += 10; }
  if (spfStatus === 'Fail') { baseSpamScore += 15; basePhishingLikelihood += 15; }
  if (dkimStatus === 'Fail') { baseSpamScore += 15; basePhishingLikelihood += 10; }
  if (attachmentRiskIndex > 50) { baseSpamScore += 25; basePhishingLikelihood += 15; }
  if (capitalizationRatio > 25) { baseSpamScore += 10; }
  if (punctuationExaggerationIndex > 30) { baseSpamScore += 10; }
  if (zeroFontHiddenTextDetected) { baseSpamScore += 30; }
  if (senderRecipientDiscrepancy) { baseSpamScore += 15; basePhishingLikelihood += 20; }
  if (unusualHoursTrigger) { baseSpamScore += 10; }

  // Check if user has an active locally trained ML model
  const senderFromHeader =
    senderOverride ||
    headers.match(/from:.*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i)?.[1] ||
    '';
  const activeModel = modelOverride !== undefined ? modelOverride : loadUserTrainedModel();
  const hasTrainedTextUnit = Boolean(
    activeModel && (activeModel.datasetSize > 0 || activeModel.vocabulary.length > 0)
  );
  let modelPrediction: LocalPredictionResult | null = null;

  let spamScore = Math.min(99, Math.max(2, baseSpamScore));
  let phishingLikelihood = Math.min(99, Math.max(1, basePhishingLikelihood));

  if (activeModel && hasTrainedTextUnit) {
    modelPrediction = predictWithModel(subject, safeBody, senderFromHeader, safeHeaders, activeModel, vocabCacheOverride);
    spamScore = modelPrediction.spamScore;
    phishingLikelihood = modelPrediction.phishingLikelihood;
  }

  // Sender reputation mapping based on spamScore
  let senderReputationRank: 'A' | 'B' | 'C' | 'D' | 'F' = 'A';
  if (spamScore > 80) senderReputationRank = 'F';
  else if (spamScore > 60) senderReputationRank = 'D';
  else if (spamScore > 40) senderReputationRank = 'C';
  else if (spamScore > 15) senderReputationRank = 'B';

  const vectorSimilarityScore = Math.round(Math.min(98, 12 + (spamScore * 0.85)));

  // Defense rating represents security posture (inverse of threat level)
  const defenseRating = Math.max(1, Math.round(100 - (spamScore * 0.6) - (phishingLikelihood * 0.4)));

  // Compute rule diagnostics
  const rulesEvaluatedCount = hasTrainedTextUnit && activeModel ? 34 + activeModel.engineeredFeatureNames.length : 34;
  let rulesTriggeredCount = 0;
  if (hasTrainedTextUnit && modelPrediction && modelPrediction.predictedLabel !== 'legitimate') rulesTriggeredCount++;
  if (financialSensationIndex > 20) rulesTriggeredCount++;
  if (urgencyCoefficient > 20) rulesTriggeredCount++;
  if (authorityMimicryIndex > 20) rulesTriggeredCount++;
  if (giftIndex > 20) rulesTriggeredCount++;
  if (suspiciousLinkCount > 0) rulesTriggeredCount++;
  if (shortenedUrlsCount > 0) rulesTriggeredCount++;
  if (mismatchedDomainsCount > 0) rulesTriggeredCount++;
  if (trackingPixelsDetected > 0) rulesTriggeredCount++;
  if (ipBlacklistMatches > 0) rulesTriggeredCount++;
  if (spfStatus === 'Fail') rulesTriggeredCount++;
  if (dkimStatus === 'Fail') rulesTriggeredCount++;
  if (attachmentRiskIndex > 30) rulesTriggeredCount++;
  if (capitalizationRatio > 25) rulesTriggeredCount++;
  if (punctuationExaggerationIndex > 25) rulesTriggeredCount++;
  if (zeroFontHiddenTextDetected) rulesTriggeredCount++;
  if (senderRecipientDiscrepancy) rulesTriggeredCount++;
  if (unusualHoursTrigger) rulesTriggeredCount++;

  return {
    metrics: {
      spamScore,
      phishingLikelihood,
      senderReputationRank,
      keywordDangerDensity,
      urgencyCoefficient,
      financialSensationIndex,
      authorityMimicryIndex,
      subjectSentimentDivergence,
      capitalizationRatio,
      punctuationExaggerationIndex,
      unusualHoursTrigger,
      suspiciousLinkCount,
      mismatchedDomainsCount,
      shortenedUrlsCount,
      trackingPixelsDetected,
      ipBlacklistMatches,
      dkimStatus,
      spfStatus,
      dmarcComplianceScore,
      inboundHopCount,
      relayServerRiskIndex,
      imageToTextPayloadRatio,
      ocrSuspiciousWordsCount,
      qrCodePresenceRisk,
      visualColorRiskLevel,
      metadataAgeOfImageDays,
      messageEntropy,
      zeroFontHiddenTextDetected,
      senderRecipientDiscrepancy,
      attachmentRiskIndex,
      vectorSimilarityScore,
      rulesEvaluatedCount,
      rulesTriggeredCount,
      defenseRating
    },
    modelPrediction
  };
}

/**
 * Parses and computes the 34 spam indices and metrics on cold input.
 */
export function analyzeEmail(subject: string, body: string, headers: string): SpamMetrics {
  return analyzeEmailWithModel(subject, body, headers).metrics;
}
