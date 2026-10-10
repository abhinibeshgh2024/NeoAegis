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
      <div className="bg-[#f8f9fa] border border-[#dadce0] rounded-2xl p-5 lg:col-span-7 flex flex-col justify-between h-[580px]">
        
        {/* Header bar */}
        <div className="flex items-center justify-between pb-3 border-b border-[#dadce0]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-full bg-[#e8f0fe] flex items-center justify-center">
              <Bot className="h-4 w-4 text-[#1a73e8]" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-[#202124] flex items-center space-x-1.5">
                <span>SecOps Threat RAG Assistant</span>
                <span className="inline-block w-2 h-2 rounded-full bg-[#1e8e3e]"></span>
              </h3>
              <p className="text-[11px] text-[#5f6368]">100% Client-Side Vector Knowledge Retrieval</p>
            </div>
          </div>

          <span className="px-2.5 py-0.5 bg-[#e8f0fe] text-[#1967d2] text-[11px] font-medium rounded-full">
            Offline Secure
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
                <div className="w-7 h-7 rounded-full bg-[#e8f0fe] border border-[#d2e3fc] flex items-center justify-center shrink-0">
                  <Bot className="h-4 w-4 text-[#1a73e8]" />
                </div>
              )}

              <div className={`max-w-[85%] rounded-2xl p-4 ${
                msg.sender === 'user' 
                  ? 'bg-[#1a73e8] text-white rounded-tr-xs shadow-2xs' 
                  : 'bg-white border border-[#dadce0] text-[#202124] rounded-tl-xs whitespace-pre-line leading-relaxed shadow-2xs'
              }`}>
                {msg.text}

                {/* Sub-context indicators for assistant messages */}
                {msg.sender === 'assistant' && msg.ragContext && msg.ragContext.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-[#f1f3f4] text-[11px] text-[#5f6368]">
                    <span className="font-medium block text-[#5f6368] mb-1.5">Retrieved Sources ({msg.ragContext.length})</span>
                    <div className="space-y-1.5">
                      {msg.ragContext.map((c, ci) => (
                        <div key={ci} className="bg-[#f8f9fa] border border-[#dadce0] p-2.5 rounded-xl">
                          <span className="font-medium block text-[#1a73e8]">{c.chunkTitle} (Match: {c.relevance}%)</span>
                          <span className="text-[11px] block text-[#5f6368] mt-0.5">&ldquo;{c.text.substring(0, 110)}...&rdquo;</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {msg.sender === 'user' && (
                <div className="w-7 h-7 rounded-full bg-[#1a73e8] text-white flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-medium">You</span>
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-start space-x-2.5 justify-start">
              <div className="w-7 h-7 rounded-full bg-[#e8f0fe] border border-[#d2e3fc] flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-[#1a73e8]" />
              </div>
              <div className="bg-white border border-[#dadce0] rounded-2xl p-3.5 rounded-tl-xs text-[#5f6368] flex items-center space-x-2 shadow-2xs">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-[#1a73e8]" />
                <span>Searching local threat index...</span>
              </div>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Input box form */}
        <div className="space-y-3 pt-3 border-t border-[#dadce0]">
          
          {/* Quick preset triggers */}
          <div className="flex flex-wrap gap-1.5">
            <button 
              onClick={() => executeQuery("Tell me about CEO and CEO gift card scams")}
              className="px-3 py-1 bg-white hover:bg-[#e8f0fe] border border-[#dadce0] hover:border-[#d2e3fc] text-[#3c4043] hover:text-[#1967d2] rounded-full text-xs transition font-medium flex items-center space-x-1.5 cursor-pointer">
              <Sparkles className="w-3 h-3 text-[#fbbc04]" />
              <span>CEO gift card scams</span>
            </button>
            <button 
              onClick={() => executeQuery("What is details about SPF and DKIM signatures?")}
              className="px-3 py-1 bg-white hover:bg-[#e8f0fe] border border-[#dadce0] hover:border-[#d2e3fc] text-[#3c4043] hover:text-[#1967d2] rounded-full text-xs transition font-medium flex items-center space-x-1.5 cursor-pointer">
              <Sparkles className="w-3 h-3 text-[#1a73e8]" />
              <span>SPF & DKIM details</span>
            </button>
            <button 
              onClick={() => executeQuery("Explain zero-font invisible text display obfuscation")}
              className="px-3 py-1 bg-white hover:bg-[#e8f0fe] border border-[#dadce0] hover:border-[#d2e3fc] text-[#3c4043] hover:text-[#1967d2] rounded-full text-xs transition font-medium flex items-center space-x-1.5 cursor-pointer">
              <Sparkles className="w-3 h-3 text-[#ea4335]" />
              <span>Zero-font obfuscation</span>
            </button>
          </div>

          <form onSubmit={handleSend} className="flex items-center space-x-2">
            <input 
              type="text" 
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder="Ask RAG Assistant e.g., 'How do we block image-based spam?'"
              className="flex-1 bg-white border border-[#dadce0] text-[#202124] px-4 py-2.5 rounded-full text-xs focus:outline-none focus:border-[#1a73e8] focus:ring-2 focus:ring-[#e8f0fe]"
            />
            <button 
              type="submit"
              className="p-2.5 bg-[#1a73e8] hover:bg-[#1557b0] text-white rounded-full transition duration-150 cursor-pointer shadow-2xs"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>

        </div>

      </div>

      {/* Right panel: Static RAG Index Visualizer */}
      <div className="space-y-6 lg:col-span-5">
        
        <div className="bg-[#f8f9fa] border border-[#dadce0] rounded-2xl p-5 space-y-4">
          <div className="flex items-center space-x-2 border-b border-[#dadce0] pb-3">
            <BookOpen className="text-[#1a73e8] h-5 w-5" />
            <h3 className="text-sm font-medium text-[#202124]">Local Knowledge Base Directory</h3>
          </div>

          <p className="text-xs text-[#5f6368] leading-relaxed">
            This directory caches pre-compiled security intelligence chunks mapped during query vector scans. TF-IDF intersections find matches locally to prevent cloud data egress.
          </p>

          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {KNOWLEDGE_BASE.map(doc => {
              const matched = lastRAGMatches.find(m => m.doc.id === doc.id);
              
              return (
                <div 
                  key={doc.id} 
                  className={`p-3.5 rounded-xl border text-left transition ${
                    matched 
                      ? 'border-[#1a73e8] bg-[#e8f0fe]/50' 
                      : 'border-[#dadce0] bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-medium text-[#5f6368]">{doc.id}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      matched ? 'bg-[#e8f0fe] text-[#1967d2]' : 'bg-[#f1f3f4] text-[#5f6368]'
                    }`}>
                      {matched ? `Match: ${matched.relevance}%` : doc.category.replace('_', ' ')}
                    </span>
                  </div>

                  <h4 className="text-xs font-medium text-[#202124] mt-1.5">{doc.title}</h4>
                  <p className="text-[11px] text-[#5f6368] mt-1 leading-snug">{doc.summary}</p>
                </div>
              );
            })}
          </div>

          <div className="bg-white p-3 rounded-xl border border-[#dadce0] flex items-center space-x-2 text-xs text-[#5f6368]">
            <Info className="h-4 w-4 text-[#1a73e8] shrink-0" />
            <span>Search algorithm computes normalized vector cosine similarity locally.</span>
          </div>
        </div>

      </div>

    </div>
  );
}
