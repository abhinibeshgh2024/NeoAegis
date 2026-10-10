/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Shield, Lock, Cpu, Languages, FileSpreadsheet, Eye,
  CheckCircle2, Sparkles, Database, Clock, Mail, Layers, Network, Key
} from 'lucide-react';

/**
 * Dedicated Vector Emblem Symbol for NeoAegis
 * Represents the Aegis Hexagonal Cyber Shield + Mail Envelope Vector Core + 4-Color Google Security Nodes
 */
export function NeoAegisSymbol({
  className,
  size = 'md'
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClass =
    className ||
    (size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-14 h-14' : 'w-10 h-10');
  return (
    <div
      className={`${sizeClass} rounded-xl bg-[#e8f0fe] border border-[#aecbfa] flex items-center justify-center shrink-0 relative overflow-hidden shadow-2xs select-none`}
      title="NeoAegis — Advanced Mail Assessment, Decision and Sandbox Apparatus"
    >
      <svg
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-4/5 h-4/5"
      >
        {/* Outer Aegis Shield Frame */}
        <path
          d="M20 3.5L6.5 9.2V18.8C6.5 27.6 12.25 35.45 20 37.5C27.75 35.45 33.5 27.6 33.5 18.8V9.2L20 3.5Z"
          fill="#1A73E8"
          fillOpacity="0.12"
          stroke="#1A73E8"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        {/* Inner Shield Quadrant Accent */}
        <path
          d="M20 7.2L10 11.4V18.5C10 25.1 14.2 31.1 20 32.8C25.8 31.1 30 25.1 30 18.5V11.4L20 7.2Z"
          fill="#FFFFFF"
          stroke="#4285F4"
          strokeWidth="1.2"
        />
        {/* Envelope Assessment Vector Lines */}
        <path
          d="M13 15.5H27V24.5C27 25.05 26.55 25.5 26 25.5H14C13.45 25.5 13 25.05 13 24.5V15.5Z"
          fill="#E8F0FE"
          stroke="#1967D2"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M13.5 16L20 21.2L26.5 16"
          stroke="#EA4335"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Four-Color Security Verification Nodes */}
        <circle cx="20" cy="11.5" r="1.6" fill="#4285F4" />
        <circle cx="29.5" cy="18.5" r="1.5" fill="#FBBC05" />
        <circle cx="10.5" cy="18.5" r="1.5" fill="#EA4335" />
        <circle cx="20" cy="29.2" r="1.8" fill="#34A853" />
      </svg>
      <span className="absolute bottom-0 inset-x-0 h-1 bg-gradient-to-r from-[#4285F4] via-[#EA4335] via-[#FBBC05] to-[#34A853]"></span>
    </div>
  );
}

interface AboutSectionProps {
  savedDataCount?: number;
  emailsParsedCount?: number;
  formattedWorkingDuration?: string;
  userEmail?: string | null;
}

export default function AboutSection({
  savedDataCount = 0,
  emailsParsedCount = 0,
  formattedWorkingDuration = '00h 00m 00s',
  userEmail
}: AboutSectionProps) {
  return (
    <div className="space-y-6 animate-fade-in text-left" id="about-neoaegis-view">
      {/* Hero Banner with Dedicated Project Symbol */}
      <div className="bg-[#f8f9fa] border border-[#dadce0] rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-start sm:items-center gap-4">
          <NeoAegisSymbol className="w-16 h-16" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl md:text-2xl font-semibold text-[#202124] tracking-tight">
                NeoAegis
              </h2>
              <span className="px-2.5 py-0.5 bg-[#e8f0fe] text-[#1967d2] text-xs font-medium rounded-full">
                v2.6 Enterprise Security Edition
              </span>
            </div>
            <p className="text-xs sm:text-sm font-medium text-[#1a73e8] mt-1">
              Advanced Mail Assessment, Decision and Sandbox Apparatus
            </p>
            <p className="text-xs text-[#5f6368] mt-1.5 max-w-2xl leading-relaxed">
              A next-generation, privacy-preserving email threat intelligence, forensic sandboxing, and multi-modal phishing assessment platform engineered for Security Operations Centers (SOC) and enterprise analysts.
            </p>
          </div>
        </div>
      </div>

      {/* Live Personal Session Telemetry Summary inside About */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-[#dadce0] rounded-2xl p-4 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-full bg-[#e8f0fe] text-[#1a73e8] flex items-center justify-center shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-[#5f6368] block">Your Saved Data Vault</span>
            <span className="text-lg font-semibold text-[#202124]">{savedDataCount} Protected Records</span>
            <span className="text-[10px] text-[#1e8e3e] block">Isolated to {userEmail || 'your profile'}</span>
          </div>
        </div>

        <div className="bg-white border border-[#dadce0] rounded-2xl p-4 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-full bg-[#e6f4ea] text-[#1e8e3e] flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-[#5f6368] block">Working Hours Duration</span>
            <span className="text-lg font-semibold text-[#202124] font-mono">{formattedWorkingDuration}</span>
            <span className="text-[10px] text-[#5f6368] block">Active analyst session timer</span>
          </div>
        </div>

        <div className="bg-white border border-[#dadce0] rounded-2xl p-4 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-full bg-[#fef7e0] text-[#e37400] flex items-center justify-center shrink-0">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-[#5f6368] block">Number of Emails Parsed</span>
            <span className="text-lg font-semibold text-[#202124]">{emailsParsedCount} Emails</span>
            <span className="text-[10px] text-[#5f6368] block">Evaluated by 34-metric engine</span>
          </div>
        </div>
      </div>

      {/* About Content & Core Aim of the Software */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-[#dadce0] rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-[#f1f3f4] pb-3">
            <Sparkles className="w-5 h-5 text-[#1a73e8]" />
            <h3 className="text-base font-medium text-[#202124]">About NeoAegis & Software Overview</h3>
          </div>

          <p className="text-xs sm:text-sm text-[#3c4043] leading-relaxed">
            <strong>NeoAegis</strong> (<em>Advanced Mail Assessment, Decision and Sandbox Apparatus</em>) is a comprehensive email security workbench designed to inspect, detonate, and classify sophisticated inbound email threats—including Business Email Compromise (BEC), credential harvesting lures, QR-code phishing (&ldquo;Quishing&rdquo;), and zero-font HTML obfuscation—within an isolated browser enclave.
          </p>

          <p className="text-xs sm:text-sm text-[#3c4043] leading-relaxed">
            Traditional cloud-based email scanners often require uploading confidential corporate correspondence, attachments, or credentials to third-party servers. NeoAegis eliminates this data-egress risk by executing its <strong>34-point heuristic classifier</strong>, <strong>Shadow DOM HTML sanitizer</strong>, <strong>in-browser multi-lingual lure translator</strong>, and <strong>8-dimensional quantized vector embedding engine</strong> locally inside the analyst&rsquo;s browser session, while synchronizing authorized audit trails to each analyst&rsquo;s private, UID-isolated cloud vault.
          </p>

          <div className="bg-[#f8f9fa] border border-[#dadce0] rounded-xl p-4 space-y-2.5">
            <h4 className="text-xs font-semibold text-[#202124] uppercase tracking-wider">
              Key Operational Capabilities
            </h4>
            <ul className="space-y-2 text-xs text-[#3c4043]">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#1e8e3e] shrink-0 mt-0.5" />
                <span><strong>34-Metric Real-Time Telemetry:</strong> Evaluates lexical danger density, urgency pressure, authority mimicry, SPF/DKIM/DMARC alignment, and relay hop risks simultaneously.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#1e8e3e] shrink-0 mt-0.5" />
                <span><strong>Isolated Shadow DOM & Forensics Lab:</strong> Strips malicious XSS scripts, defangs 1x1 tracking pixels, highlights zero-font hidden text stuffing, and validates OpenPGP cryptographic signatures.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#1e8e3e] shrink-0 mt-0.5" />
                <span><strong>Per-User Zero-Trust Data Isolation:</strong> Every analyst authenticates prior to portal entry; saved emails, threat scores, exported reports, and working hours are strictly isolated to the logged-in user.</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Core Aim & Mission Pillars */}
        <div className="lg:col-span-5 bg-[#f8f9fa] border border-[#dadce0] rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-[#dadce0] pb-3">
            <Shield className="w-5 h-5 text-[#1a73e8]" />
            <h3 className="text-base font-medium text-[#202124]">Core Aim of This Software</h3>
          </div>

          <p className="text-xs text-[#5f6368] leading-relaxed">
            The primary aim of NeoAegis is to empower security teams and organizations with a deterministic, zero-leakage decision apparatus that bridges automated heuristic detection with human forensic verification:
          </p>

          <div className="space-y-3">
            <div className="bg-white border border-[#dadce0] rounded-xl p-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#1a73e8]">
                <Lock className="w-4 h-4" />
                <span>1. Eliminate Phishing & Executive Impersonation</span>
              </div>
              <p className="text-xs text-[#5f6368] mt-1 leading-relaxed">
                Detect deceptive social engineering patterns, mismatched domains, and financial wire urgency before an employee clicks a malicious link or authorizes a fraudulent transfer.
              </p>
            </div>

            <div className="bg-white border border-[#dadce0] rounded-xl p-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#1e8e3e]">
                <Cpu className="w-4 h-4" />
                <span>2. Guarantee Zero-Knowledge Client Privacy</span>
              </div>
              <p className="text-xs text-[#5f6368] mt-1 leading-relaxed">
                Process multi-lingual translation, quantized vector similarity clustering, and k-Anonymity password breach checks locally in the browser without exposing plaintext data to external APIs.
              </p>
            </div>

            <div className="bg-white border border-[#dadce0] rounded-xl p-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#e37400]">
                <Layers className="w-4 h-4" />
                <span>3. Provide Auditable Per-Analyst Workspaces</span>
              </div>
              <p className="text-xs text-[#5f6368] mt-1 leading-relaxed">
                Enforce strict authentication gating and UID-level data isolation so each analyst maintains a private, tamper-evident catalog of parsed emails, exported forensic dossiers, and session working hours.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Architectural Modules Grid */}
      <div className="bg-white border border-[#dadce0] rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-medium text-[#202124]">Integrated Security Architecture Modules</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-[#f8f9fa] border border-[#dadce0] space-y-1.5">
            <Eye className="w-4 h-4 text-[#1a73e8]" />
            <h4 className="font-medium text-[#202124]">Optical OCR & Quishing</h4>
            <p className="text-[11px] text-[#5f6368] leading-relaxed">
              Extracts embedded text from image-only spam flyers and flags malicious QR code redirects.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#f8f9fa] border border-[#dadce0] space-y-1.5">
            <Languages className="w-4 h-4 text-[#1e8e3e]" />
            <h4 className="font-medium text-[#202124]">Local Lure Translator</h4>
            <p className="text-[11px] text-[#5f6368] leading-relaxed">
              Translates foreign phishing correspondence locally while highlighting adversarial trigger vocabulary.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#f8f9fa] border border-[#dadce0] space-y-1.5">
            <Network className="w-4 h-4 text-[#e37400]" />
            <h4 className="font-medium text-[#202124]">8-D Vector Clustering</h4>
            <p className="text-[11px] text-[#5f6368] leading-relaxed">
              Computes cosine similarity across 8 linguistic threat dimensions to group related attack campaigns.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#f8f9fa] border border-[#dadce0] space-y-1.5">
            <Key className="w-4 h-4 text-[#d93025]" />
            <h4 className="font-medium text-[#202124]">PGP & k-Anonymity</h4>
            <p className="text-[11px] text-[#5f6368] leading-relaxed">
              Verifies OpenPGP signed armor blocks and checks credential leaks via SHA-1 5-char prefix range queries.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
