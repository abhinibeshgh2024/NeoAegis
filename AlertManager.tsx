/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, ShieldX, Terminal, RefreshCw, AlertTriangle, Play,
  Settings, Check, X, BellDot, HeartCrack, Flame, Radio
} from 'lucide-react';
import { AlertNotification } from './types';

interface AlertManagerProps {
  onTriggerGlobalAlert: (alert: AlertNotification) => void;
  alerts: AlertNotification[];
  onResolveAlert: (id: string) => void;
}

const TEMPLATE_PHISHING_ATTEMPTS = [
  {
    id: 'crit-alert-1',
    timestamp: new Date().toISOString(),
    sender: 'security-notify@sec-bank-chase-update.com',
    subject: 'Emergency Notification: Unauthorized login from Lagos, Nigeria. Confirm identity.',
    type: 'credential_harvesting' as const,
    severity: 'critical' as const,
    resolved: false,
    details: 'Impersonates Chase Banking Security Portal. Incorporates typo-squatted sender domain sec-bank-chase-update.com. Body contains shortened redirect links targeting login verification credential harvesting forms.'
  },
  {
    id: 'crit-alert-2',
    timestamp: new Date().toISOString(),
    sender: 'billing-remit@invoice-services-quick.xyz',
    subject: 'Action Required: Unpaid PDF statement balance #29571 - Wire transfer updated',
    type: 'phishing' as const,
    severity: 'high' as const,
    resolved: false,
    details: 'Supplier ledger hijacking invoice fraud campaign. Includes dangerous statement.pdf.exe file attachment (Risk factor: 95%). Demands update to routing instructions for vendor transfers.'
  },
  {
    id: 'crit-alert-3',
    timestamp: new Date().toISOString(),
    sender: 'chief-executive-executive@inc-admin-ceo.com',
    subject: 'URGENT: Purchase gift cards for client appreciation - confidential executive order',
    type: 'impersonation' as const,
    severity: 'high' as const,
    resolved: false,
    details: 'Business Email Compromise (BEC) scenario. Attacking server spoofing corporate CEO requested staff assistant to secure iTunes scratch card codes to bypass external cash management auditing guidelines.'
  },
  {
    id: 'crit-alert-4',
    timestamp: new Date().toISOString(),
    sender: 'sys-admin-webportal@enterprise-accounts-auth.net',
    subject: 'Password Verification Needed - Account termination scheduled in 2 hours',
    type: 'credential_harvesting' as const,
    severity: 'critical' as const,
    resolved: false,
    details: 'Fake Microsoft 365 single sign-on redirect landing layouts. Utilizes hidden display:none fonts inside email body layout markup seeks to bypass lexical dictionary parsers.'
  }
];

export default function AlertManager({ onTriggerGlobalAlert, alerts, onResolveAlert }: AlertManagerProps) {
  const [activeAlert, setActiveAlert] = useState<AlertNotification | null>(null);

  // Trigger simulated incoming threat
  const simulateThreat = () => {
    const idx = Math.floor(Math.random() * TEMPLATE_PHISHING_ATTEMPTS.length);
    const selectedTemplate = TEMPLATE_PHISHING_ATTEMPTS[idx];
    const newAlert: AlertNotification = {
      ...selectedTemplate,
      id: `${selectedTemplate.id}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      resolved: false
    };

    onTriggerGlobalAlert(newAlert);
    setActiveAlert(newAlert);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in" id="alert-manager-view">
      
      {/* Left panel: Live Alerts Feed HUD */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 md:p-6 lg:col-span-5 flex flex-col justify-between space-y-4 shadow-3xs">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Radio className="text-red-500 h-5 w-5 animate-pulse" />
              <h3 className="text-sm font-mono font-bold text-slate-900">LIVE ATTACK INCIDENT INGESTION FEED</h3>
            </div>
            <span className="px-2 py-0.5 bg-red-50 text-red-600 border border-red-200 text-[10px] font-mono rounded font-bold">
              REAL-TIME BROADCASTER
            </span>
          </div>

          <p className="text-xs text-slate-500">
            Simulate standard tactical incoming campaigns directly testing client sandbox deflection rates.
          </p>

          {/* Trigger simulator button */}
          <button
            onClick={simulateThreat}
            className="w-full py-3 bg-red-50 border border-red-200 text-red-700 hover:bg-red-100/50 hover:border-red-300 text-xs font-mono font-bold rounded-xl transition duration-200 flex items-center justify-center space-x-2 shadow-3xs cursor-pointer"
          >
            <Play className="h-4 w-4" />
            <span>TRIGGER SIMULATED INCOMING PHISHING CAMPAIGN</span>
          </button>

          {/* Incident Listings Feed */}
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1" id="alerts-incidents-feed">
            {alerts.map(item => (
              <div
                key={item.id}
                onClick={() => setActiveAlert(item)}
                className={`p-3.5 rounded-xl border transition-all duration-200 cursor-pointer text-left relative ${
                  activeAlert?.id === item.id 
                    ? 'bg-red-50/50 border-red-300/80 shadow-2xs' 
                    : item.resolved 
                      ? 'bg-slate-100/50 border-slate-200 opacity-70' 
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50 shadow-3xs'
                }`}
              >
                {!item.resolved && (
                  <span className="absolute top-3.5 right-3.5 w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                )}
                
                <div className="flex items-center space-x-2">
                  <span className={`px-1.5 py-0.5 text-[9px] uppercase font-mono font-bold rounded border ${
                    item.severity === 'critical' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {item.severity}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </span>
                </div>

                <div className="text-xs font-sans font-semibold text-slate-800 truncate mt-1">
                  {item.subject}
                </div>
                <div className="text-[10px] text-slate-500 font-mono truncate mt-0.5">
                  Sender: {item.sender}
                </div>

                {item.resolved && (
                  <div className="text-[9px] text-emerald-600 font-mono mt-1.5 flex items-center space-x-1">
                    <Check className="h-3 w-3" />
                    <span>DEFUSED & QUARANTINED</span>
                  </div>
                )}
              </div>
            ))}

            {alerts.length === 0 && (
              <div className="text-center py-12 text-slate-400 text-xs font-mono border border-dashed border-slate-200 rounded-xl bg-white shadow-3xs">
                No active threats flagged in stream. Send simulated payload vectors to test defenses!
              </div>
            )}
          </div>
        </div>

        <div className="text-[10px] text-slate-400 font-mono pt-3 border-t border-slate-200 flex justify-between">
          <span>Client Feed: Active</span>
          <span>Buffer: Circular FIFO Queue</span>
        </div>
      </div>

      {/* Right panel: Active Threat Action center & SOC Remediation workflow */}
      <div className="lg:col-span-7">
        {activeAlert ? (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 md:p-6 space-y-6 animate-fade-in shadow-3xs" id="active-alert-details">
            <div className="flex items-start justify-between pb-4 border-b border-slate-200">
              <div>
                <span className="text-[9px] font-mono text-red-600 uppercase tracking-widest block font-bold">INCIDENT REPORT TELEMETRY</span>
                <h3 className="text-base font-sans font-semibold text-slate-900 mt-1">
                  {activeAlert.subject}
                </h3>
              </div>

              <span className={`px-2.5 py-1 text-xs font-mono rounded font-bold uppercase border ${
                activeAlert.severity === 'critical' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {activeAlert.severity} THREAT
              </span>
            </div>

            {/* Static meta info */}
            <div className="grid grid-cols-2 gap-4 text-xs font-mono">
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-3xs">
                <span className="text-[10px] text-slate-400 block font-bold">SENDER ORIGIN DOMAIN</span>
                <span className="text-slate-700 font-sans font-semibold block mt-1 break-all">{activeAlert.sender}</span>
              </div>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-3xs">
                <span className="text-[10px] text-slate-400 block font-bold">THREAT PATTERN PROFILE</span>
                <span className="text-slate-700 block mt-1 uppercase font-bold">
                  {activeAlert.type.replace('_', ' ')}
                </span>
              </div>
            </div>

            {/* Detailed Payload Diagnostics */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">ATTACK DESCRIPTION & LEXICAL VECTORS</span>
              <p className="bg-white border border-slate-200 p-4 rounded-xl text-xs text-slate-600 leading-relaxed font-sans shadow-3xs">
                {activeAlert.details}
              </p>
            </div>

            {/* Actions workflow */}
            <div className="space-y-3 pt-2">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">SOC RESOLUTION PLAYBOOK ACTIONS</span>
              
              {activeAlert.resolved ? (
                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl flex items-center space-x-2 text-emerald-800 text-xs shadow-3xs">
                  <Check className="h-5 w-5 text-emerald-600" />
                  <span>Threat fully neutralized. Senders domain blocked, target records marked as hazardous, SOC logs updated successfully.</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  
                  <button
                    onClick={() => onResolveAlert(activeAlert.id)}
                    className="py-3 bg-indigo-600 hover:bg-indigo-750 text-white text-center font-bold rounded-xl transition duration-150 flex items-center justify-center space-x-1 cursor-pointer shadow-xs"
                  >
                    <Check className="h-4 w-4" />
                    <span>SANDBOX & BLOCK DOMAIN</span>
                  </button>

                  <button
                    onClick={() => onResolveAlert(activeAlert.id)}
                    className="py-3 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-center rounded-xl transition duration-150 flex items-center justify-center space-x-1 cursor-pointer shadow-3xs"
                  >
                    <X className="h-4 w-4" />
                    <span>MARK RECOGNIZED / RESOLVED</span>
                  </button>

                </div>
              )}
            </div>

          </div>
        ) : (
          <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-6 border border-slate-200 rounded-2xl bg-slate-50 text-slate-400 space-y-2 shadow-3xs">
            <Radio className="h-8 w-8 text-slate-300 animate-pulse" />
            <h4 className="text-sm font-mono text-slate-800 font-bold">SELECT ACTIVE ALERT ELEMENT</h4>
            <p className="text-xs text-slate-500 max-w-sm">
              Click any inbound attack incident from the live ingestion feed on the left to inspect vector metrics and execute defensive containment protocols.
            </p>
          </div>
        )}
      </div>

    </div>
  );
}
