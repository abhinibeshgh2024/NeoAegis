/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpamMetrics, EmailRecord } from './types';

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
  const len = str.length;
  const frequencies: { [key: string]: number } = {};
  for (let i = 0; i < len; i++) {
    const c = str[i];
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
export function analyzeEmail(subject: string, body: string, headers: string): SpamMetrics {
  const combinedText = `${subject} ${body}`.toLowerCase();
  
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
  const links = body.match(urlRegex) || [];
  const suspiciousLinkCount = links.filter(l => {
    const low = l.toLowerCase();
    return low.includes('verify') || low.includes('secure-') || low.includes('bit.ly') || low.includes('tinyurl') || low.includes('login') || low.includes('pay-');
  }).length;

  const shortenedUrlsCount = links.filter(l => {
    return l.includes('bit.ly') || l.includes('tinyurl.com') || l.includes('t.co') || l.includes('goo.gl') || l.includes('ow.ly');
  }).length;

  // Header mismatched domains mock check
  let mismatchedDomainsCount = 0;
  if (/from:.*<(.*)>/i.test(headers)) {
    const fromDomain = headers.match(/from:.*@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i)?.[1] || '';
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

  const spamScore = Math.min(99, Math.max(2, baseSpamScore));
  const phishingLikelihood = Math.min(99, Math.max(1, basePhishingLikelihood));

  // Sender reputation mapping based on spamScore
  let senderReputationRank: 'A' | 'B' | 'C' | 'D' | 'F' = 'A';
  if (spamScore > 80) senderReputationRank = 'F';
  else if (spamScore > 60) senderReputationRank = 'D';
  else if (spamScore > 40) senderReputationRank = 'C';
  else if (spamScore > 15) senderReputationRank = 'B';

  const vectorSimilarityScore = Math.round(Math.min(98, 12 + (spamScore * 0.85)));

  // Simulated defense rating represents security posture (inverse of threat level)
  const defenseRating = Math.round(100 - (spamScore * 0.6) - (phishingLikelihood * 0.4));

  // Compute rule diagnostics
  const rulesEvaluatedCount = 37;
  let rulesTriggeredCount = 0;
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
  };
}

// Generate extensive realistic presets for testing
export const MOCK_EMAILS: EmailRecord[] = [
  {
    id: 'mail-1',
    subject: 'Action Required: Confirm wire instructions for unpaid statement_958172',
    sender: 'accounts-paypal@secures-verify.com',
    recipient: 'finance-clerk@agency-enterprise.com',
    body: 'Dear customer, We detected an unauthorized attempt to transfer funds from your account. Immediately confirm your routing information and wire credentials to prevent permanent suspension. Failing to complete verification within 24 hours will cause automated system lockouts.',
    rawHeaders: 'Received: from unverified-relay.secures-verify.com (103.21.94.13) by smtp.agency-enterprise.com;\nDate: Thu, 18 Jun 2026 02:40:11 GMT\nFrom: PaypaI Security Team <accounts-paypal@secures-verify.com>\nTo: finance-clerk@agency-enterprise.com\nDKIM: Fail\nSPF: Fail\nSubject: Action Required: Confirm wire instructions\nContent-Disposition: attachment; filename="statement_958172.exe"',
    timestamp: '2026-06-18T02:40:11Z',
    isSpam: true,
    metrics: analyzeEmail(
      'Action Required: Confirm wire instructions for unpaid statement_958172',
      'Dear customer, We detected an unauthorized attempt to transfer funds from your account. Immediately confirm your routing information and wire credentials to prevent permanent suspension. Failing to complete verification within 24 hours will cause automated system lockouts.',
      'Received: from unverified-relay.secures-verify.com (103.21.94.13) by smtp.agency-enterprise.com;\nDate: Thu, 18 Jun 2026 02:40:11 GMT\nFrom: PaypaI Security Team <accounts-paypal@secures-verify.com>\nTo: finance-clerk@agency-enterprise.com\nDKIM: Fail\nSPF: Fail\nSubject: Action Required: Confirm wire instructions\nContent-Disposition: attachment; filename="statement_958172.exe"'
    )
  },
  {
    id: 'mail-2',
    subject: 'Urgent: CEO request for Steam gifts cards for client lunch - send immediately',
    sender: 'chief-officer-direct@gmail-corporate-ceo.xyz',
    recipient: 'staff-assistant@agency-enterprise.com',
    body: 'Are you at your workbench desk right now? I am stuck in a board presentation board of members and need you to purchase 5 Steam gift cards of $100 value each. Send me the serial codes scratchoff instantly to this mail. Sent from my iPad.',
    rawHeaders: 'Received: from smtp-out.gmail-corporate-ceo.xyz (185.191.240.5) by smtp.agency-enterprise.com;\nDate: Thu, 18 Jun 2026 09:12:33 GMT\nFrom: CEO Office <chief-officer-direct@gmail-corporate-ceo.xyz>\nTo: staff-assistant@agency-enterprise.com\nDKIM: None\nSPF: Pass\nSubject: Urgent: CEO request for Steam gifts cards',
    timestamp: '2026-06-18T09:12:33Z',
    isSpam: true,
    metrics: analyzeEmail(
      'Urgent: CEO request for Steam gifts cards for client lunch - send immediately',
      'Are you at your workbench desk right now? I am stuck in a board presentation board of members and need you to purchase 5 Steam gift cards of $100 value each. Send me the serial codes scratchoff instantly to this mail. Sent from my iPad.',
      'Received: from smtp-out.gmail-corporate-ceo.xyz (185.191.240.5) by smtp.agency-enterprise.com;\nDate: Thu, 18 Jun 2026 09:12:33 GMT\nFrom: CEO Office <chief-officer-direct@gmail-corporate-ceo.xyz>\nTo: staff-assistant@agency-enterprise.com\nDKIM: None\nSPF: Pass\nSubject: Urgent: CEO request for Steam gifts cards'
    )
  },
  {
    id: 'mail-3',
    subject: '[Internal Project] Scope of work for Sprint Review and Q3 timelines',
    sender: 'alex.k@agency-enterprise.com',
    recipient: 'staff-assistant@agency-enterprise.com',
    body: 'Hello Team, attached is the revised planning layout for our upcoming Q3 system design review. Please review the timelines and comments regarding user interface testing variables. Let me know if you need clarification before tomorrow afternoon.',
    rawHeaders: 'Received: from corporate-mail-internal (192.168.1.15) by corporate-gateway.agency-enterprise.com;\nDate: Thu, 18 Jun 2026 08:30:00 GMT\nFrom: Alex K <alex.k@agency-enterprise.com>\nTo: staff-assistant@agency-enterprise.com\nDKIM-Signature: dkim=pass\nReceived-SPF: pass\nSubject: [Internal Project] Scope of work for Sprint Review',
    timestamp: '2026-06-18T08:30:00Z',
    isSpam: false,
    metrics: analyzeEmail(
      '[Internal Project] Scope of work for Sprint Review and Q3 timelines',
      'Hello Team, attached is the revised planning layout for our upcoming Q3 system design review. Please review the timelines and comments regarding user interface testing variables. Let me know if you need clarification before tomorrow afternoon.',
      'Received: from corporate-mail-internal (192.168.1.15) by corporate-gateway.agency-enterprise.com;\nDate: Thu, 18 Jun 2026 08:30:00 GMT\nFrom: Alex K <alex.k@agency-enterprise.com>\nTo: staff-assistant@agency-enterprise.com\nDKIM-Signature: dkim=pass\nReceived-SPF: pass\nSubject: [Internal Project] Scope of work for Sprint Review'
    )
  },
  {
    id: 'mail-4',
    subject: 'CONGRATULATIONS: You won cash sweepstakes lucky draw prize 4921-27',
    sender: 'no-reply-drawings-international@lottery-winner-online-co.xyz',
    recipient: 'user-winner@agency-enterprise.com',
    body: 'Dear lucky winner, your email address was officially selected for $500,000 lottery compensations! Click on http://bit.ly/claim-jackpot-winner immediately or fill out dynamic feedback document files to register payout instantly!!! UNLIMITED FREE GIFT CARDS TO ACTIVATE NOW.',
    rawHeaders: 'Received: from unverified-gateway (193.109.112.5) by smtp.agency-enterprise.com;\nDate: Thu, 18 Jun 2026 01:10:44 GMT\nFrom: Jackpot drawings <no-reply-drawings-international@lottery-winner-online-co.xyz>\nTo: user-receiver@agency-enterprise.com\nDKIM: Fail\nSPF: Fail\nSubject: CONGRATULATIONS: You won cash sweepstakes lucky draw',
    timestamp: '2026-06-18T01:10:44Z',
    isSpam: true,
    metrics: analyzeEmail(
      'CONGRATULATIONS: You won cash sweepstakes lucky draw prize 4921-27',
      'Dear lucky winner, your email address was officially selected for $500,000 lottery compensations! Click on http://bit.ly/claim-jackpot-winner immediately or fill out dynamic feedback document files to register payout instantly!!! UNLIMITED FREE GIFT CARDS TO ACTIVATE NOW.',
      'Received: from unverified-gateway (193.109.112.5) by smtp.agency-enterprise.com;\nDate: Thu, 18 Jun 2026 01:10:44 GMT\nFrom: Jackpot drawings <no-reply-drawings-international@lottery-winner-online-co.xyz>\nTo: user-receiver@agency-enterprise.com\nDKIM: Fail\nSPF: Fail\nSubject: CONGRATULATIONS: You won cash sweepstakes lucky draw'
    )
  }
];
