/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Image, Sparkles, Upload, AlertTriangle, Eye, ShieldAlert,
  Sliders, Info, Compass, HelpCircle, CheckCircle, RefreshCw
} from 'lucide-react';
import { ImageAnalysisResult, SpamMetrics } from './types';

// Preset mock image items so users can test immediately!
interface ImagePreset {
  id: string;
  title: string;
  mockUrl: string;
  desc: string;
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

const PRESET_SPAM_IMAGES: ImagePreset[] = [
  {
    id: 'img-1',
    title: 'Urgent Wire Invoice Flyer',
    mockUrl: 'https://images.unsplash.com/photo-1544377193-33dcf4d68fb5?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3', // Styled as structured billing document
    desc: 'Mock scanned document image with intense orange header alerts, demanding immediate bank wiring updates.',
    colorSpectrum: { red: 35, green: 25, blue: 15, yellow: 25 },
    ocrDetectedText: 'PAYMENT DUE: WIRE FORWARDING UPDATE REQUIRED. TRANSFER $4,582 TO CORPORATE PAYROLL CLEARING ROUTING CODE SECURE-71-82 IMMEDIATELY.',
    qrCodeDetected: false,
    metadataSizeKb: 124,
    detectedMetrics: {
      colorSpikeDanger: 74,
      textDensity: 82,
      obfuscationScore: 12,
      phishingLureMatch: 95
    },
    metrics: {
      spamScore: 84,
      phishingLikelihood: 92,
      keywordDangerDensity: 85,
      urgencyCoefficient: 90,
      financialSensationIndex: 95,
      authorityMimicryIndex: 50,
      imageToTextPayloadRatio: 85,
      ocrSuspiciousWordsCount: 6,
      qrCodePresenceRisk: false,
      visualColorRiskLevel: 75,
      metadataAgeOfImageDays: 2
    }
  },
  {
    id: 'img-2',
    title: 'Fake Amazon Gift Giveaway Flyer',
    mockUrl: 'https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3', // Highly colorful gift splash artwork
    desc: 'Extremely saturated graphic block with zero body text designed to bypass email filter systems.',
    colorSpectrum: { red: 55, green: 10, blue: 10, yellow: 25 },
    ocrDetectedText: 'CONGRATULATIONS VALUED CUSTOMER! YOU HAVE BEEN SELECTED FOR $1000 AMAZON SHOPPING VOUCHERS. SCAN THE QR CODE TO LOG IN AND REDEEM.',
    qrCodeDetected: true,
    metadataSizeKb: 341,
    detectedMetrics: {
      colorSpikeDanger: 85,
      textDensity: 45,
      obfuscationScore: 90,
      phishingLureMatch: 80
    },
    metrics: {
      spamScore: 94,
      phishingLikelihood: 85,
      keywordDangerDensity: 70,
      urgencyCoefficient: 75,
      financialSensationIndex: 60,
      authorityMimicryIndex: 40,
      imageToTextPayloadRatio: 99,
      ocrSuspiciousWordsCount: 5,
      qrCodePresenceRisk: true,
      visualColorRiskLevel: 90,
      metadataAgeOfImageDays: 1
    }
  },
  {
    id: 'img-3',
    title: 'Safe Corporate Design System Asset',
    mockUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3', // Calm blue corporate design art
    desc: 'Normal clean corporate presentation graphic with high metadata lifetime and standard background elements.',
    colorSpectrum: { red: 5, green: 30, blue: 60, yellow: 5 },
    ocrDetectedText: 'AGENCY ENTERPRISE INTERFACE OVERVIEW: SYSTEM BLUEPRINTS AND METRIC PARSING OUTCOMES.',
    qrCodeDetected: false,
    metadataSizeKb: 89,
    detectedMetrics: {
      colorSpikeDanger: 5,
      textDensity: 15,
      obfuscationScore: 5,
      phishingLureMatch: 2
    },
    metrics: {
      spamScore: 4,
      phishingLikelihood: 1,
      keywordDangerDensity: 5,
      urgencyCoefficient: 5,
      financialSensationIndex: 0,
      authorityMimicryIndex: 0,
      imageToTextPayloadRatio: 25,
      ocrSuspiciousWordsCount: 0,
      qrCodePresenceRisk: false,
      visualColorRiskLevel: 5,
      metadataAgeOfImageDays: 142
    }
  }
];

export default function ImageAnalyzer() {
  const [activePreset, setActivePreset] = useState<ImagePreset>(PRESET_SPAM_IMAGES[0]);
  const [analyzing, setAnalyzing] = useState(false);
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [customFileName, setCustomFileName] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Trigger simulated loader when preset is adjusted
  const changePreset = (p: ImagePreset) => {
    setAnalyzing(true);
    setCustomImage(null);
    setTimeout(() => {
      setActivePreset(p);
      setAnalyzing(false);
    }, 600);
  };

  // Drag and drop handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAnalyzing(true);
      setCustomFileName(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        const urlStr = reader.result as string;
        setCustomImage(urlStr);

        // Generate a dynamic mock analysis calculation based on file name or random criteria
        setTimeout(() => {
          const isSus = file.name.toLowerCase().includes('invoice') || file.name.toLowerCase().includes('winning') || file.name.toLowerCase().includes('gift');
          const mockPreset: ImagePreset = {
            id: 'custom-file',
            title: file.name,
            mockUrl: urlStr,
            desc: `User uploaded image file: ${file.name}. Parsed dynamically.`,
            colorSpectrum: {
              red: isSus ? 45 : 15,
              green: 20,
              blue: isSus ? 10 : 50,
              yellow: isSus ? 25 : 15
            },
            ocrDetectedText: isSus 
              ? 'ALERT: VERIFY ACCOUNT PAYOUT ON ATTACHED SECURE FILE ROUTING.' 
              : 'SANDBOX SPECIFICATION DIAGRAM. SYSTEM AUDITED AND LOGGED OK.',
            qrCodeDetected: isSus,
            metadataSizeKb: Math.round(file.size / 1024),
            detectedMetrics: {
              colorSpikeDanger: isSus ? 80 : 15,
              textDensity: isSus ? 65 : 30,
              obfuscationScore: isSus ? 75 : 10,
              phishingLureMatch: isSus ? 85 : 5
            },
            metrics: {
              spamScore: isSus ? 89 : 8,
              phishingLikelihood: isSus ? 91 : 4,
              keywordDangerDensity: isSus ? 80 : 10,
              urgencyCoefficient: isSus ? 85 : 5,
              financialSensationIndex: isSus ? 90 : 0,
              authorityMimicryIndex: isSus ? 70 : 0,
              imageToTextPayloadRatio: 90,
              ocrSuspiciousWordsCount: isSus ? 4 : 0,
              qrCodePresenceRisk: isSus,
              visualColorRiskLevel: isSus ? 78 : 12,
              metadataAgeOfImageDays: 0 // Newly created file
            }
          };
          setActivePreset(mockPreset);
          setAnalyzing(false);
        }, 800);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in" id="image-analyzer-view">
      
      {/* Left panel: Image drag and drop OR Preset loader */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 lg:col-span-5 space-y-5 flex flex-col justify-between">
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-display font-medium text-white flex items-center space-x-2">
              <Image className="text-indigo-400 h-5 w-5" />
              <span>SPAM IMAGE TELEMETRY EXPOSER</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Test how modern flyers, coupons, and scanned invoice JPGs are parsed to subvert textual keyword firewalls.
            </p>
          </div>

          {/* Quick interactive items */}
          <div>
            <span className="text-[10px] font-mono text-slate-500 uppercase">LOAD METRIC PRESETS INSTANTLY</span>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {PRESET_SPAM_IMAGES.map(p => (
                <button
                  key={p.id}
                  onClick={() => changePreset(p)}
                  className={`px-2 py-2 text-3xs font-mono rounded-lg border text-left transition-all duration-200 ${
                    activePreset.id === p.id && !customImage
                      ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400 font-bold'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="block truncate font-semibold">{p.title}</span>
                  <span className="block text-[9px] text-slate-500 truncate mt-0.5">{p.id.toUpperCase()}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Image visual canvas */}
          <div className="relative bg-slate-950 border border-slate-800 rounded-xl overflow-hidden aspect-video flex items-center justify-center group">
            {analyzing ? (
              <div className="text-center space-y-2">
                <RefreshCw className="h-8 w-8 text-indigo-400 animate-spin mx-auto" />
                <span className="text-xs font-mono text-slate-400">Executing OCR parsing algorithms...</span>
              </div>
            ) : (
              <>
                <img 
                  src={customImage || activePreset.mockUrl} 
                  alt={activePreset.title} 
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover opacity-80"
                />
                
                {/* HUD Matrix overlays */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent p-4 flex flex-col justify-between pointer-events-none">
                  <div className="flex justify-between items-start">
                    <span className="px-2 py-0.5 bg-indigo-500/8c backdrop-blur-md text-[9px] font-mono rounded text-white border border-indigo-400/30">
                      OCR DETECT: ON
                    </span>
                    <span className="px-2 py-0.5 bg-slate-950/80 backdrop-blur-md text-[9px] font-mono rounded text-slate-400">
                      SCALE: {activePreset.metadataSizeKb} KB
                    </span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-mono text-indigo-400 block tracking-widest uppercase">
                      // RASTER INSPECTOR ENGINE
                    </span>
                    <span className="text-xs font-sans font-medium text-white block truncate">
                      {activePreset.title}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* File Drag sector */}
        <div>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            accept="image/*"
            className="hidden" 
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-4 border-2 border-dashed border-slate-800 bg-slate-950/50 hover:bg-slate-950 hover:border-indigo-500/40 rounded-xl transition duration-200 text-center flex flex-col items-center justify-center space-y-1 group"
          >
            <Upload className="h-5 w-5 text-slate-500 group-hover:text-indigo-400 transition-colors" />
            <span className="text-xs font-mono text-slate-300">Drag & Drop or click to upload target asset</span>
            <span className="text-[10px] font-mono text-slate-500">Supports PNG, JPG, WEBP (No client data uploaded)</span>
          </button>
        </div>

      </div>

      {/* Right panel: Deep image color analysis & OCR extracts */}
      <div className="space-y-6 lg:col-span-7">
        
        {/* Dynamic Image Telemetry parameters */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center space-x-2">
              <Sliders className="h-5 w-5 text-indigo-400" />
              <h3 className="text-sm font-mono font-medium text-white">OCR TEXT EXTRACTION & SPECTRUM DATA</h3>
            </div>
            <span className={`px-2.5 py-0.5 text-xs font-mono rounded-lg font-bold ${
              (activePreset.metrics.spamScore || 0) > 50 ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
            }`}>
              Image Threat Rating: {activePreset.metrics.spamScore || 0}%
            </span>
          </div>

          {/* OCR text capture block */}
          <div className="space-y-2">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">EXTRACTED TEXT STRINGS (AUTOMATED OCR)</span>
            <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl font-mono text-xs text-slate-300 leading-relaxed border-l-2 border-l-indigo-500 relative">
              <span className="absolute bottom-2 right-2 text-[9px] text-slate-600">CONFIDENCE: PASS 94%</span>
              &ldquo;{activePreset.ocrDetectedText}&rdquo;
            </div>
          </div>

          {/* Image spectrum breakdown */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 text-center">
              <span className="text-[10px] font-mono text-slate-500">RED GAIN</span>
              <div className="w-full bg-slate-900 h-1.5 rounded-full mt-2 overflow-hidden">
                <div className="bg-red-500 h-full" style={{ width: `${activePreset.colorSpectrum.red}%` }}></div>
              </div>
              <span className="text-xs font-mono text-slate-300 mt-1 block">{activePreset.colorSpectrum.red}%</span>
            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 text-center">
              <span className="text-[10px] font-mono text-slate-500">YELLOW GAIN</span>
              <div className="w-full bg-slate-900 h-1.5 rounded-full mt-2 overflow-hidden">
                <div className="bg-yellow-500 h-full" style={{ width: `${activePreset.colorSpectrum.yellow}%` }}></div>
              </div>
              <span className="text-xs font-mono text-slate-300 mt-1 block">{activePreset.colorSpectrum.yellow}%</span>
            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 text-center">
              <span className="text-[10px] font-mono text-slate-500">GREEN GAIN</span>
              <div className="w-full bg-slate-900 h-1.5 rounded-full mt-2 overflow-hidden">
                <div className="bg-emerald-500 h-full" style={{ width: `${activePreset.colorSpectrum.green}%` }}></div>
              </div>
              <span className="text-xs font-mono text-slate-300 mt-1 block">{activePreset.colorSpectrum.green}%</span>
            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 text-center">
              <span className="text-[10px] font-mono text-slate-500">BLUE GAIN</span>
              <div className="w-full bg-slate-900 h-1.5 rounded-full mt-2 overflow-hidden">
                <div className="bg-indigo-500 h-full" style={{ width: `${activePreset.colorSpectrum.blue}%` }}></div>
              </div>
              <span className="text-xs font-mono text-slate-300 mt-1 block">{activePreset.colorSpectrum.blue}%</span>
            </div>

          </div>

          {/* Raster Diagnostic Indices */}
          <div className="space-y-3 pt-2">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">ANOMALY WEIGHT ASSIGNMENTS</span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-xs font-sans text-slate-200 block">Saturated Color Warnings</span>
                  <span className="text-[10px] font-mono text-slate-500">Presence of extreme layout color prompts</span>
                </div>
                <span className={`text-sm font-mono font-bold ${activePreset.detectedMetrics.colorSpikeDanger > 60 ? 'text-red-400' : 'text-slate-400'}`}>
                  {activePreset.detectedMetrics.colorSpikeDanger}%
                </span>
              </div>

              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-xs font-sans text-slate-200 block">OCR Text Area Density</span>
                  <span className="text-[10px] font-mono text-slate-500">Ratio of lettering overlay bounding boxes</span>
                </div>
                <span className="text-sm font-mono text-slate-300 font-bold">
                  {activePreset.detectedMetrics.textDensity}%
                </span>
              </div>

              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-xs font-sans text-slate-200 block">Metadata Age Obfuscation</span>
                  <span className="text-[10px] font-mono text-slate-500">Exposes lack of camera / software model stamps</span>
                </div>
                <span className="text-sm font-mono text-amber-400 font-bold">
                  {activePreset.detectedMetrics.obfuscationScore}%
                </span>
              </div>

              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-xs font-sans text-slate-200 block">Lure Match Vector Index</span>
                  <span className="text-[10px] font-mono text-slate-500">Confidence matching bait template words</span>
                </div>
                <span className={`text-sm font-mono font-bold ${activePreset.detectedMetrics.phishingLureMatch > 60 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {activePreset.detectedMetrics.phishingLureMatch}%
                </span>
              </div>

            </div>
          </div>

          {/* QR Code Warning Callout */}
          {activePreset.qrCodeDetected && (
            <div className="bg-red-950/20 border border-red-500/20 p-4 rounded-xl flex items-start space-x-3 text-xs text-red-300">
              <ShieldAlert className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold font-sans block text-sm">QR Code Phishing (Quishing) Vector Detected</span>
                <p className="mt-1 leading-relaxed text-red-400">
                  This image contains a highly contrastive 2D matrix barcode (QR Code). Attackers leverage QR codes within flyers to redirect sandbox recipients directly off secure mail clients, guiding victims onto fraudulent financial validation forms hosted outside standard email security proxies.
                </p>
              </div>
            </div>
          )}

        </div>
      </div>

    </div>
  );
}
