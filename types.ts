/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SpamMetrics {
  // General Threat Indicators (1-5)
  spamScore: number;                 // 0 to 100
  phishingLikelihood: number;        // 0 to 100
  senderReputationRank: 'A' | 'B' | 'C' | 'D' | 'F';
  keywordDangerDensity: number;      // 0 to 100
  urgencyCoefficient: number;        // 0 to 100

  // Semantic Markers (6-11)
  financialSensationIndex: number;   // 0 to 100
  authorityMimicryIndex: number;     // 0 to 100
  subjectSentimentDivergence: number;// 0 to 100
  capitalizationRatio: number;       // percentage of uppercase letters in body
  punctuationExaggerationIndex: number; // 0 to 100 based on !, ?, $ counts
  unusualHoursTrigger: boolean;      // True if email was sent in night hours e.g. 1-4 AM

  // Link & Domain Factors (12-16)
  suspiciousLinkCount: number;
  mismatchedDomainsCount: number;
  shortenedUrlsCount: number;
  trackingPixelsDetected: number;
  ipBlacklistMatches: number;

  // Technical Deliverability Checks (17-21)
  dkimStatus: 'Pass' | 'Fail' | 'None';
  spfStatus: 'Pass' | 'Fail' | 'None';
  dmarcComplianceScore: number;      // 0 to 100
  inboundHopCount: number;
  relayServerRiskIndex: number;      // 0 to 100

  // Visual/Image Threat Indicators (22-26)
  imageToTextPayloadRatio: number;   // percentage
  ocrSuspiciousWordsCount: number;
  qrCodePresenceRisk: boolean;
  visualColorRiskLevel: number;      // percentage (red, golden, high contrast yellow detection)
  metadataAgeOfImageDays: number;    // Simulated metadata analysis

  // Advanced Security Elements (27-31)
  messageEntropy: number;            // randomness ranking of body base64 / text bypass
  zeroFontHiddenTextDetected: boolean;
  senderRecipientDiscrepancy: boolean;
  attachmentRiskIndex: number;       // 0 to 100 based on file types
  vectorSimilarityScore: number;     // similarity score to spam corpus

  // Local Rule Triggers (32-34)
  rulesEvaluatedCount: number;       // total checks run
  rulesTriggeredCount: number;       // checks failed
  defenseRating: number;             // overall resilience of client infrastructure
}

export interface EmailRecord {
  id: string;
  subject: string;
  sender: string;
  recipient: string;
  body: string;
  rawHeaders: string;
  timestamp: string;
  isSpam: boolean;
  metrics: SpamMetrics;
}

export interface ImageAnalysisResult {
  fileName: string;
  previewUrl: string;
  width: number;
  height: number;
  colorSpectrum: { red: number; green: number; blue: number; yellow: number };
  ocrDetectedText: string;
  qrCodeDetected: boolean;
  metadataSizeKb: number;
  detectedMetrics: {
    colorSpikeDanger: number;
    textDensity: number;
    obfuscationScore: number;
    phishingLureMatch: number;
  };
  metrics: Partial<SpamMetrics>;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  ragContext?: {
    chunkTitle: string;
    text: string;
    relevance: number;
  }[];
}

export interface AlertNotification {
  id: string;
  timestamp: string;
  sender: string;
  subject: string;
  type: 'phishing' | 'credential_harvesting' | 'impersonation' | 'blackmail' | 'malware_distribution';
  severity: 'low' | 'medium' | 'high' | 'critical';
  resolved: boolean;
  details: string;
}
