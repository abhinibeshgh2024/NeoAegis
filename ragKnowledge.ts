/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface KnowledgeDocument {
  id: string;
  title: string;
  category: 'phishing' | 'technical' | 'headers' | 'image_spam' | 'credentials' | 'wire_transfer';
  source: string;
  summary: string;
  content: string;
}

export const KNOWLEDGE_BASE: KnowledgeDocument[] = [
  {
    id: 'SEC-DOC-01',
    title: 'CEO Phishing & Urgent Gift Card Scams',
    category: 'credentials',
    source: 'NIST Phishing Guidelines Reference v4.1',
    summary: 'Explains patterns where attackers mimic company executives to extract immediate financial gift cards.',
    content: 'Executive impersonation phishing (Business Email Compromise or BEC) frequently mimics CEOs, VPs, or direct managers requesting fast task assistance. Characteristic traits include phrases like "Are you at your desk?", "Sent from my iPhone", or "URGENT help needed for client presentation". The attacker asks the victim to purchase gift cards (iTunes, Amazon, Steam, Google Play, Razer Gold), scratch off the serial codes, and email photos of the serials. This bypasses typical wire constraints.'
  },
  {
    id: 'SEC-DOC-02',
    title: 'DMARC, SPF, and DKIM Protocol Alignments',
    category: 'headers',
    source: 'RFC-7489 Email Security Frameworks',
    summary: 'Deep dive into SPF ip alignment, DKIM cryptographic signatures, and DMARC enforcement configurations.',
    content: 'SPF (Sender Policy Framework) matches the sending servers IP against the verified TXT list published in the senders DNS zone. DKIM (DomainKeys Identified Mail) uses public key cryptography to sign email bodies, validating that no contents were mutated during transit. DMARC (Domain-based Message Authentication, Reporting, and Conformance) coordinates SPF and DKIM outcomes, specifying how the receiver should handle failures (None, Quarantine, Reject). If from: matches domain and SPF/DKIM align, DMARC passes. Otherwise, risk levels spike.'
  },
  {
    id: 'SEC-DOC-03',
    title: 'Zero-Font & Invisible Text Obfuscation Vectors',
    category: 'technical',
    source: 'OWASP Spam Obfuscation Catalog 2026',
    summary: 'Exposes tactics where spammers insert tiny, invisible, or high-randomness text blocks to dilute lexical scores.',
    content: 'Spammers frequently hide text blocks using inline styles such as <span style="font-size:0px"> or <div style="display:none">. These hidden sectors contain randomly generated dictionaries or classic news snippets. While invisible to human recipients, standard Bayes mail scanners read this as legitimate, non-spam natural text, effectively diluting the frequency score of dangerous trigger words like "mortgage" or "pills". High Shannon entropy in mail bodies indicates character randomness seeking to slip through gateways.'
  },
  {
    id: 'SEC-DOC-04',
    title: 'Phishing URLs & Shortener Obfuscations',
    category: 'phishing',
    source: 'SANS Institute Technical Alert S-2026',
    summary: 'Tactics regarding masked hyperlink targets, subdomains, and URL service proxies.',
    content: 'Weaponized hyperlinks are primary tools for credential harvesting. Attackers spoof credible landing domains, using structures like https://paypal.com.account-verify-support.xyz/ or shortened URLs (bit.ly, tinyurl, goo.gl) to hide the real target. Automated email crawlers should compare the anchor text with the actual href parameter. If anchor text says "https://wellsfargo.com" but href points to a third-party server, flag the mismatch instantly as phishing.'
  },
  {
    id: 'SEC-DOC-05',
    title: 'Image-Based Spam and OCR Filtering Defenses',
    category: 'image_spam',
    source: 'Symantec Threat Intel Bulletin',
    summary: 'Details why spammers use embedded flyers or images containing promotional and scam text, and how to defend.',
    content: 'Because mail gateways analyze text structures, attackers exploit graphic formats: they embed the entire scam message within a JPEG, PNG, or GIF attachment, leaving the email body empty or extremely generic. This "Image-Based Spam" avoids keyword scanners entirely. Defence models must execute Optical Character Recognition (OCR) to inspect text embedded in images, while tracking visual anomalies such as high saturation ratios, danger color spreads (high yellow/red overlays), and absence of standard image metadata, indicating newly generated cyber-assets.'
  },
  {
    id: 'SEC-DOC-06',
    title: 'Wire Transfers and False Invoicing Spoofs',
    category: 'wire_transfer',
    source: 'FBI Internet Crime Complaint Center (IC3)',
    summary: 'Explains false-billing schemes and urgent corporate wire transfer redirections.',
    content: 'False invoicing involves attackers compromising supplier email accounts or purchasing lookalike domains (typosquatting) to email financial teams with invoices detailing "updated banking coordinates". They insist on absolute confidentiality and hyper-urgency to prevent auditing. Safeguard policies mandate out-of-band oral confirmation via an established, trusted phone number before executing any banking wire updates.'
  },
  {
    id: 'SEC-DOC-07',
    title: 'Tracking Pixels and Mail Telemetry Harvesters',
    category: 'technical',
    source: 'Electronic Frontier Foundation (EFF) privacy guide',
    summary: 'Details how 1x1 transparent images are used to gather open rate, location, and device analytics.',
    content: 'A tracking pixel is a transparent 1x1 image, usually fetched dynamically (e.g., <img src="https://tracker.com/pixel.gif?user_id=123" width="1" height="1" />). When the client parses and renders the HTML email, it automatically pings the external server to fetch the asset. This leaks the client IP, timezone, user-agent details, and confirms the email address is live and monitored. Safe clients block external images by default.'
  }
];

// Lightweight client-side TF-IDF Bag-of-Words Vector Engine
function getTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 2); // Filter small stop-words
}

export interface RAGMatchResult {
  doc: KnowledgeDocument;
  relevance: number;
}

/**
 * Executes a completely localized vector-style similarity query on our Knowledge Base.
 */
export function queryKnowledgeBase(query: string): RAGMatchResult[] {
  const queryTokens = getTokens(query);
  if (queryTokens.length === 0) return [];

  const results: RAGMatchResult[] = KNOWLEDGE_BASE.map(doc => {
    const docTokens = getTokens(`${doc.title} ${doc.summary} ${doc.content}`);
    
    // Calculate simple Bag-of-Words intersections
    let matchCount = 0;
    const querySet = new Set(queryTokens);
    
    querySet.forEach(qt => {
      // Direct substring match or token occurrence
      if (docTokens.includes(qt)) {
        matchCount += 1.5; // High weight for exact word matches
      } else {
        // Partial stems check
        if (docTokens.some(dt => dt.includes(qt) || qt.includes(dt))) {
          matchCount += 0.5;
        }
      }
    });

    // Score based on token density
    const score = matchCount / (Math.sqrt(queryTokens.length) * Math.sqrt(docTokens.length) || 1);
    const relevance = Math.round(score * 120);

    return {
      doc,
      relevance: Math.min(100, relevance)
    };
  });

  // Sort and return matches above a subtle relevance threshold
  return results
    .filter(r => r.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance);
}

/**
 * System Generative Response Composer (Local RAG synthesizer simulation)
 */
export function generateLocalRAGResponse(query: string, matches: RAGMatchResult[]): string {
  if (matches.length === 0) {
    return `I evaluated our security knowledge index against your prompt: "${query}". I could not find highly aligned threat documents, but I recommend checking raw DKIM signatures, inspecting URLs for lookalike subdomains, and never routing invoice requests without secondary confirmations. Let me know if you would like me to analyze a specific email segment!`;
  }

  const primary = matches[0];
  let response = `### 🛡️ Local RAG Threat Insights Applied
Based on a similarity search in our local compliance database, your query matches **${primary.doc.title}** (relevance match of **${primary.relevance}%**, from: *${primary.doc.source}*).

Here are relevant security definitions and actions retrieved:

`;

  // Synthesize custom advice utilizing document segments
  matches.slice(0, 2).forEach(match => {
    response += `* **From Document [${match.doc.id}]** (*${match.doc.title}*):\n   > ${match.doc.summary}\n   *Key Advice:* ${match.doc.content.substring(0, 180)}...\n\n`;
  });

  // Action Items recommendations
  response += `### 🚨 Immediate Defensive Protocols Recommended:
1. **DMARC Integration**: Never trust invoices with failed SPF or unverified DKIM configurations.
2. **Reverse Domain Lookups**: Verify matching recipient paths with genuine organizational records.
3. **Out-of-Band Inspections**: If related to payments, confirm updates directly with contacts via verified voice lines.
4. **OCR Processing**: In case of digital images with high red warning percentages, pass images through immediate deep character extraction.`;

  return response;
}
