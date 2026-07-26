/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Bot, Send, ShieldCheck, Terminal, BookOpen, Info, 
  Sparkles, Layers, RefreshCw, FileCode2, HelpCircle
} from 'lucide-react';
import { queryKnowledgeBase, generateLocalRAGResponse, RAGMatchResult, KNOWLEDGE_BASE } from './ragKnowledge';
import { ChatMessage } from './types';

interface ChatAssistantProps {
  onSearchQuery?: (q: string) => void;
}

export default function ChatAssistant({ onSearchQuery }: ChatAssistantProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-init',
      sender: 'assistant',
      text: "### 👋 Greetings, SecOps Specialist\nI am your offline digital **RAG Assistant**. I can execute keyword vector lookups across our localized Threat Intelligence Library to help you neutralize compliance vectors, authenticate deliverability headers, and inspect image obfuscation structures.\n\nTry clicking any of the **Heuristic Prompt Bubbles** or ask a custom question below to test the retrieval stack!",
      timestamp: new Date().toISOString()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastRAGMatches, setLastRAGMatches] = useState<RAGMatchResult[]>([]);

  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Prompt execution handler
  const executeQuery = (queryStr: string) => {
    if (!queryStr.trim()) return;

    // User message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: queryStr,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setLoading(true);

    // Call local RAG database
    setTimeout(() => {
      const matches = queryKnowledgeBase(queryStr);
      setLastRAGMatches(matches);

      const generatedTxt = generateLocalRAGResponse(queryStr, matches);

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: generatedTxt,
        timestamp: new Date().toISOString(),
        ragContext: matches.slice(0, 3).map(m => ({
          chunkTitle: m.doc.title,
          text: m.doc.content,
          relevance: m.relevance
        }))
      };

      setMessages(prev => [...prev, assistantMsg]);
      setLoading(false);
    }, 900);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    executeQuery(inputText);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in" id="rag-assistant-view">
      
      {/* Left panel: Chat UI */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 lg:col-span-7 flex flex-col justify-between h-[580px]">
        
        {/* Header bar */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <Bot className="h-5 w-5 text-indigo-400" />
            <div>
              <h3 className="text-sm font-mono font-medium text-white flex items-center space-x-1.5">
                <span>SECOPS THREAT RAG AGENT</span>
                <span className="inline-block w-2 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              </h3>
              <p className="text-[10px] text-slate-500 font-mono">Simulating 100% Client-Side Vector Retrieval</p>
            </div>
          </div>

          <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-mono rounded">
            DB: OFF-LINE SECURE
          </span>
        </div>

        {/* Messages feed */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1 text-xs">
          
          {messages.map(msg => (
            <div 
              key={msg.id} 
              className={`flex items-start space-x-2.5 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender === 'assistant' && (
                <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center shrink-0">
                  <Bot className="h-4 w-4 text-indigo-400" />
                </div>
              )}

              <div className={`max-w-[85%] rounded-2xl p-4 ${
                msg.sender === 'user' 
                  ? 'bg-indigo-600 text-white rounded-tr-none' 
                  : 'bg-slate-950 border border-slate-800 text-slate-300 rounded-tl-none whitespace-pre-line leading-relaxed'
              }`}>
                {msg.text}

                {/* Sub-context indicators for assistant messages */}
                {msg.sender === 'assistant' && msg.ragContext && msg.ragContext.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-900/60 text-[10px] text-slate-500">
                    <span className="font-mono block uppercase text-slate-400 font-bold mb-1">// RETRIEVED SOURCES STACK ({msg.ragContext.length})</span>
                    <div className="space-y-1.5">
                      {msg.ragContext.map((c, ci) => (
                        <div key={ci} className="bg-slate-900/40 border border-slate-800/50 p-2 rounded">
                          <span className="font-sans block text-indigo-400 font-medium">{c.chunkTitle} (Match: {c.relevance}%)</span>
                          <span className="text-[9px] block text-slate-500 italic mt-0.5 mt-1">&ldquo;{c.text.substring(0, 110)}...&rdquo;</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {msg.sender === 'user' && (
                <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-mono text-slate-400 font-bold">ME</span>
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-start space-x-2.5 justify-start">
              <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-indigo-400" />
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 rounded-tl-none text-slate-500 font-mono flex items-center space-x-2">
                <RefreshCw className="h-3 w-3 animate-spin text-indigo-400" />
                <span>Scanning Term-Frequency indices...</span>
              </div>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Input box form */}
        <div className="space-y-3 pt-3 border-t border-slate-800/80">
          
          {/* Quick preset triggers */}
          <div className="flex flex-wrap gap-1.5">
            <button 
              onClick={() => executeQuery("Tell me about CEO and CEO gift card scams")}
              className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white rounded-lg text-2xs transition font-mono flex items-center space-x-1">
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>CEO gift card scams</span>
            </button>
            <button 
              onClick={() => executeQuery("What is details about SPF and DKIM signatures?")}
              className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white rounded-lg text-2xs transition font-mono flex items-center space-x-1">
              <Sparkles className="w-3 h-3 text-indigo-400" />
              <span>SPF and DKIM details</span>
            </button>
            <button 
              onClick={() => executeQuery("Explain zero-font invisible text display obfuscation")}
              className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white rounded-lg text-2xs transition font-mono flex items-center space-x-1">
              <Sparkles className="w-3 h-3 text-red-400" />
              <span>What is zero-font?</span>
            </button>
          </div>

          <form onSubmit={handleSend} className="flex items-center space-x-2">
            <input 
              type="text" 
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder="Ask RAG Copilot e.g., 'How do we block image-based spam?'"
              className="flex-1 bg-slate-950 border border-slate-800 text-white p-3 rounded-xl text-xs font-mono focus:outline-none focus:border-indigo-500"
            />
            <button 
              type="submit"
              className="p-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition duration-150"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>

        </div>

      </div>

      {/* Right panel: Static RAG Index Visualizer */}
      <div className="space-y-6 lg:col-span-5">
        
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
            <BookOpen className="text-indigo-400 h-5 w-5" />
            <h3 className="text-sm font-mono font-medium text-white">LOCAL DATABASE CHUNKS DIRECTORY</h3>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed font-sans">
            This directory caches pre-compiled, secure text records mapped during query vector scans. TF-IDF intersections find matches locally to prevent unauthorized cloud telemetry leaks or data egress.
          </p>

          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {KNOWLEDGE_BASE.map(doc => {
              const matched = lastRAGMatches.find(m => m.doc.id === doc.id);
              
              return (
                <div 
                  key={doc.id} 
                  className={`p-3 rounded-lg border text-left transition ${
                    matched 
                      ? 'border-indigo-500 bg-indigo-500/5' 
                      : 'border-slate-800 bg-slate-950'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono font-bold text-slate-500">{doc.id}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[8px] uppercase font-mono font-semibold ${
                      matched ? 'bg-indigo-500/10 text-indigo-400' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {matched ? `Similarity Match: ${matched.relevance}%` : doc.category.replace('_', ' ')}
                    </span>
                  </div>

                  <h4 className="text-xs font-sans font-medium text-white mt-1.5">{doc.title}</h4>
                  <p className="text-[11px] text-slate-400 mt-1 italic leading-snug">{doc.summary}</p>
                </div>
              );
            })}
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center space-x-2 text-[11px] text-slate-500">
            <Info className="h-4 w-4 text-slate-400 shrink-0" />
            <span>Search algorithm calculates normalized card distance mapping frequencies.</span>
          </div>
        </div>

      </div>

    </div>
  );
}
