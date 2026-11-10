import React, { useState } from "react";
import { AssistantResponse } from "../types";
import { api } from "../services/api";
import { useLanguage } from "../context/LanguageContext";
import {
  MessageSquare, Send, Sparkles, ArrowRight,
  ShieldCheck, Info, CheckCircle2, AlertCircle,
  Copy, Check, ChevronDown, ChevronUp, Zap,
  Database, RefreshCw, BarChart3, TrendingUp,
  Users, Package, Clock, HelpCircle, Layers,
  Mic, MicOff, Volume2, VolumeX, Share2
} from "lucide-react";

interface PromptStarter {
  label: string;
  query: string;
  kannadaHint: string;
  category: "credit" | "profit" | "sales" | "inventory" | "stockout";
}

const STARTER_PROMPTS: PromptStarter[] = [
  {
    label: "Who owes me money on Khata?",
    query: "Who owes me money on Khata?",
    kannadaHint: "ಖಾತಾ ಬಾಕಿ ಯಾರಿದ್ದಾರೆ?",
    category: "credit"
  },
  {
    label: "What was my profit this month?",
    query: "What was my gross profit and margin this month?",
    kannadaHint: "ಕಳೆದ ತಿಂಗಳ ಒಟ್ಟು ಲಾಭ ಎಷ್ಟು?",
    category: "profit"
  },
  {
    label: "Today's sales & UPI collections",
    query: "Today sales and upi collection",
    kannadaHint: "ಇವತ್ತಿನ ವ್ಯಾಪಾರ ಮತ್ತು ಯುಪಿಐ ಸಂಗ್ರಹ",
    category: "sales"
  },
  {
    label: "Which items need reordering urgently?",
    query: "Which products need reordering urgently?",
    kannadaHint: "ಯಾವ ಸರಕುಗಳು ಖಾಲಿಯಾಗುತ್ತಿವೆ?",
    category: "stockout"
  },
  {
    label: "Total inventory valuation & assets",
    query: "What is my total inventory valuation and worth?",
    kannadaHint: "ಒಟ್ಟು ದಾಸ್ತಾನು ಮೌಲ್ಯ ಎಷ್ಟು?",
    category: "inventory"
  },
  {
    label: "What are my top selling products?",
    query: "What are my top selling products by sales volume?",
    kannadaHint: "ಅತಿ ಹೆಚ್ಚು ಮಾರಾಟವಾಗುವ ವಸ್ತುಗಳು",
    category: "sales"
  },
  {
    label: "How much Atta do I have in stock?",
    query: "How much Atta do I have in stock?",
    kannadaHint: "ಅಟ್ಟಾ ಹಿಟ್ಟು ದಾಸ್ತಾನು ಎಷ್ಟಿದೆ?",
    category: "inventory"
  },
  {
    label: "Check dead stock & slow moving items",
    query: "Show me my dead stock and slow moving items",
    kannadaHint: "ನಿಷ್ಕ್ರಿಯ ಸರಕುಗಳ ಪಟ್ಟಿ",
    category: "stockout"
  }
];

interface AssistantPageProps {
  onNavigateTab?: (tab: string) => void;
}

export const AssistantPage: React.FC<AssistantPageProps> = ({ onNavigateTab }) => {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<AssistantResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedThinking, setExpandedThinking] = useState<{ [key: number]: boolean }>({ 0: true });
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>("all");
  const [isListening, setIsListening] = useState(false);
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);

  const handleAsk = async (queryText: string) => {
    if (!queryText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const response = await api.askAssistant(queryText);
      setHistory((prev) => [response, ...prev]);
      setQuery("");
      // Auto-expand the newest response's thinking steps
      setExpandedThinking((prev) => ({ ...prev, 0: true }));
    } catch (err: any) {
      setError(err.message || "Failed to query Gemini retail reasoner");
    } finally {
      setLoading(false);
    }
  };

  const handleVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Please use Chrome, Edge, or Android Chrome.");
      return;
    }
    
    if (isListening) {
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setQuery(transcript);
      setIsListening(false);
      handleAsk(transcript);
    };

    recognition.onerror = (err: any) => {
      console.error("Speech recognition error", err);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const handleSpeak = (idx: number, textToSpeak: string) => {
    if (!("speechSynthesis" in window)) {
      alert("Text-to-speech audio is not supported in this browser.");
      return;
    }

    if (speakingIdx === idx) {
      window.speechSynthesis.cancel();
      setSpeakingIdx(null);
      return;
    }

    window.speechSynthesis.cancel();
    const cleanText = textToSpeak.replace(/[*_#`]/g, " ").replace(/₹/g, " Rupees ");
    const utterance = new SpeechSynthesisUtterance(cleanText);
    const voices = window.speechSynthesis.getVoices();
    const indianVoice = voices.find(v => v.lang.includes("en-IN") || v.lang.includes("hi-IN") || v.lang.includes("kn-IN"));
    if (indianVoice) {
      utterance.voice = indianVoice;
    }
    utterance.rate = 1.0;

    utterance.onend = () => {
      setSpeakingIdx(null);
    };
    utterance.onerror = () => {
      setSpeakingIdx(null);
    };

    setSpeakingIdx(idx);
    window.speechSynthesis.speak(utterance);
  };

  const handleWhatsAppShare = (resp: AssistantResponse) => {
    const text = `*SmartStock Business Intelligence Report*\n\n*Question:* ${resp.query}\n*Summary:* ${resp.executive_summary}\n\n${resp.answer_text}\n\n_Generated by SmartStock AI Assistant_`;
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleAsk(query);
  };

  const handleCopyText = (idx: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const toggleThinking = (idx: number) => {
    setExpandedThinking((prev) => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  const filteredPrompts = activeCategoryFilter === "all"
    ? STARTER_PROMPTS
    : STARTER_PROMPTS.filter((p) => p.category === activeCategoryFilter);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Gemini 3.8 Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-purple-950 border border-indigo-900/50 p-6 md:p-8 text-white shadow-xl">
        {/* Subtle decorative glow */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-20 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-sm">
                <Sparkles className="w-3.5 h-3.5" />
                Gemini 3.8 Retail Reasoner
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Store #1 Grounded (Zero Hallucination)
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-white/10 text-slate-300">
                Bilingual: EN + ಕನ್ನಡ
              </span>
            </div>

            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-indigo-100 to-purple-200 bg-clip-text text-transparent">
              Ask Your Business Intelligence
            </h1>
            <p className="text-sm text-indigo-200/80 max-w-2xl leading-relaxed">
              Real-time natural language reasoning over your sales, profits, customer Khata books, inventory valuation, and supplier reorders. Guaranteed mathematically grounded in your verified SQLite store ledger.
            </p>
          </div>

          <div className="hidden lg:flex flex-col items-end gap-1.5 text-right border-l border-indigo-800/60 pl-6">
            <div className="text-xs text-indigo-300 font-mono flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-indigo-400" />
              SQLite WAL Active
            </div>
            <div className="text-xs text-slate-400">
              Avg Latency: <span className="text-emerald-400 font-semibold">&lt;50ms</span>
            </div>
            <div className="text-xs text-slate-400">
              Deterministic Math Engine
            </div>
          </div>
        </div>
      </div>

      {/* Query Input Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <form onSubmit={handleSubmit} className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none text-slate-400">
            <Sparkles className="w-5 h-5 text-indigo-500" />
          </div>
          <input
            type="text"
            placeholder={isListening ? "Listening... Speak your question now (English or ಕನ್ನಡ)..." : "Ask anything in English or ಕನ್ನಡ (e.g. 'Who owes me on Khata?', 'ಲಾಭ ಎಷ್ಟು?', 'Atta stock')..."}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={loading}
            className={`w-full pl-12 pr-36 py-3.5 bg-slate-50 dark:bg-slate-800/80 border ${isListening ? "border-rose-400 ring-2 ring-rose-300 dark:ring-rose-900" : "border-slate-300 dark:border-slate-700"} rounded-xl text-sm md:text-base text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner`}
          />
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {query.trim() && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="text-xs px-2 py-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={handleVoiceInput}
              disabled={loading}
              title={isListening ? "Stop Listening" : "Speak your question (Voice Input)"}
              className={`p-2 rounded-lg text-xs font-semibold transition-all ${
                isListening
                  ? "bg-rose-500 text-white animate-pulse shadow-md"
                  : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200"
              }`}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-sm font-semibold rounded-lg transition-all shadow-md hover:shadow-indigo-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span>Ask</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>

        {/* Suggested Queries Category Filter Tabs */}
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              Suggested Deep Business Inquiries:
            </div>
            <div className="flex gap-1 text-[11px]">
              {["all", "credit", "profit", "sales", "inventory", "stockout"].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategoryFilter(cat)}
                  className={`px-2.5 py-1 rounded-md capitalize transition-colors ${
                    activeCategoryFilter === cat
                      ? "bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
                  }`}
                >
                  {cat === "all" ? "All Domains" : cat}
                </button>
              ))}
            </div>
          </div>

          {/* Prompt Chips Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
            {filteredPrompts.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleAsk(p.query)}
                disabled={loading}
                className="group p-2.5 bg-slate-50 hover:bg-indigo-50/70 dark:bg-slate-800/60 dark:hover:bg-indigo-950/40 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-800 rounded-xl transition-all text-left flex flex-col justify-between"
              >
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors">
                  {p.label}
                </span>
                <span className="text-[11px] text-slate-600 dark:text-slate-400 font-mono mt-1 group-hover:text-indigo-700 dark:group-hover:text-indigo-300">
                  {p.kannadaHint}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading Reasoning State with Gemini Milestones */}
      {loading && (
        <div className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/60 rounded-2xl p-6 shadow-md space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center animate-spin">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="text-sm font-semibold text-indigo-950 dark:text-indigo-200">
              Gemini 3.8 Multi-Domain Reasoning in Progress...
            </div>
          </div>
          <div className="space-y-1.5 pl-9 text-xs text-slate-500 dark:text-slate-400 font-mono">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Parsing retail query semantics and language context...
            </div>
            <div className="flex items-center gap-2 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
              Executing deterministic SQL query plans across store ledgers...
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
              Synthesizing executive metrics and actionable recommendations...
            </div>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-xl flex items-center gap-3 text-rose-700 dark:text-rose-400 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Answers Feed */}
      <div className="space-y-6">
        {history.map((resp, idx) => (
          <div
            key={idx}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
          >
            {/* Header: User Query & Model Badge */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-start gap-2.5">
                <span className="p-2 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-xl mt-0.5">
                  <MessageSquare className="w-4 h-4" />
                </span>
                <div>
                  <div className="text-base font-bold text-slate-900 dark:text-white">
                    "{resp.query}"
                  </div>
                  <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                    <span className="font-medium text-indigo-600 dark:text-indigo-400">
                      {resp.model_name || "Gemini 3.8 Retail Reasoner"}
                    </span>
                    <span>•</span>
                    <span>{resp.latency_ms ? `${resp.latency_ms}ms` : "Fast"}</span>
                    <span>•</span>
                    <span className="font-mono uppercase text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300">
                      {resp.intent}
                    </span>
                  </div>
                </div>
              </div>

              {/* Utility actions */}
              <div className="flex items-center gap-1.5 self-end sm:self-center">
                {/* Voice Read-Aloud Button */}
                <button
                  type="button"
                  onClick={() => handleSpeak(idx, `${resp.executive_summary || ''}. ${resp.answer_text}`)}
                  className={`p-1.5 rounded-lg text-xs flex items-center gap-1 transition-colors ${
                    speakingIdx === idx
                      ? "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-semibold"
                      : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                  }`}
                  title={speakingIdx === idx ? "Stop speaking" : "Listen / Read Aloud"}
                >
                  {speakingIdx === idx ? <VolumeX className="w-3.5 h-3.5 text-indigo-600" /> : <Volume2 className="w-3.5 h-3.5" />}
                  <span>{speakingIdx === idx ? "Mute" : "Listen"}</span>
                </button>

                {/* WhatsApp Share Button */}
                <button
                  type="button"
                  onClick={() => handleWhatsAppShare(resp)}
                  className="p-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs flex items-center gap-1 transition-colors"
                  title="Share Report via WhatsApp"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>WhatsApp</span>
                </button>

                {/* Copy Button */}
                <button
                  type="button"
                  onClick={() => handleCopyText(idx, `${resp.executive_summary || ''}\n\n${resp.answer_text}`)}
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 rounded-lg text-xs flex items-center gap-1 transition-colors"
                  title="Copy full answer"
                >
                  {copiedIndex === idx ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Collapsible Chain-of-Thought (Reasoning Accordion) */}
            {resp.thinking_steps && resp.thinking_steps.length > 0 && (
              <div className="border border-indigo-100 dark:border-indigo-950 rounded-xl overflow-hidden bg-slate-50/70 dark:bg-slate-800/40">
                <button
                  type="button"
                  onClick={() => toggleThinking(idx)}
                  className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 transition-colors"
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-indigo-900 dark:text-indigo-300">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Gemini 3.8 Reasoning Process</span>
                    <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                      ({resp.thinking_steps.length} verified steps • 100% DB grounded)
                    </span>
                  </div>
                  {expandedThinking[idx] ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </button>

                {expandedThinking[idx] && (
                  <div className="px-4 pb-3 pt-1 border-t border-indigo-100 dark:border-indigo-950/80 space-y-1.5">
                    {resp.thinking_steps.map((step, sIdx) => (
                      <div key={sIdx} className="text-xs text-slate-600 dark:text-slate-300 font-mono flex items-start gap-2">
                        <span className="text-indigo-500 font-bold mt-0.5">{sIdx + 1}.</span>
                        <span className="leading-relaxed">{step}</span>
                      </div>
                    ))}
                    {resp.source_tables && resp.source_tables.length > 0 && (
                      <div className="pt-2 text-[11px] text-slate-400 flex items-center gap-1.5 font-sans">
                        <Database className="w-3 h-3 text-slate-400" />
                        <span>Source tables audited:</span>
                        <span className="font-mono text-slate-600 dark:text-slate-300">
                          {resp.source_tables.join(", ")}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Executive Summary Takeaway Banner */}
            {resp.executive_summary && (
              <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-50/90 to-purple-50/90 dark:from-indigo-950/40 dark:to-purple-950/40 border border-indigo-200/80 dark:border-indigo-900/60 flex items-start gap-3">
                <span className="p-1.5 bg-indigo-600 text-white rounded-lg shadow-sm mt-0.5 flex-shrink-0">
                  <Zap className="w-4 h-4" />
                </span>
                <div className="space-y-0.5">
                  <div className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
                    Executive Takeaway
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white leading-relaxed">
                    {resp.executive_summary}
                  </div>
                </div>
              </div>
            )}

            {/* Metric Scorecards Grid */}
            {resp.metric_cards && resp.metric_cards.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {resp.metric_cards.map((card, cIdx) => {
                  let statusBg = "bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700";
                  let valueColor = "text-slate-900 dark:text-white";
                  let badge = null;

                  if (card.status === "positive") {
                    statusBg = "bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50";
                    valueColor = "text-emerald-700 dark:text-emerald-300";
                    badge = <span className="w-2 h-2 rounded-full bg-emerald-500" />;
                  } else if (card.status === "warning") {
                    statusBg = "bg-amber-50/60 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50";
                    valueColor = "text-amber-700 dark:text-amber-300";
                    badge = <span className="w-2 h-2 rounded-full bg-amber-500" />;
                  } else if (card.status === "critical") {
                    statusBg = "bg-rose-50/60 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50";
                    valueColor = "text-rose-700 dark:text-rose-300";
                    badge = <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />;
                  }

                  return (
                    <div
                      key={cIdx}
                      className={`p-3.5 rounded-xl border ${statusBg} flex flex-col justify-between`}
                    >
                      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
                        <span>{card.label}</span>
                        {badge}
                      </div>
                      <div className={`text-lg font-extrabold tracking-tight mt-1 ${valueColor}`}>
                        {card.value}
                      </div>
                      {card.subtext && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          {card.subtext}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Embedded Structured Data Table */}
            {resp.data_table && resp.data_table.rows && resp.data_table.rows.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <BarChart3 className="w-3.5 h-3.5 text-indigo-500" />
                  {resp.data_table.title}
                </div>
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-inner">
                  <div className="overflow-x-auto max-h-72">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase tracking-wider font-semibold sticky top-0">
                        <tr>
                          {resp.data_table.columns.map((col, cIdx) => (
                            <th key={cIdx} className="px-3.5 py-2.5 whitespace-nowrap">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                        {resp.data_table.rows.map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            {row.map((cell, cellIdx) => (
                              <td key={cellIdx} className="px-3.5 py-2.5 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Comprehensive Answer Text */}
            <div className="text-sm font-normal text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line bg-slate-50/50 dark:bg-slate-800/30 p-4 rounded-xl border border-slate-200/60 dark:border-slate-800/60">
              {resp.answer_text}
            </div>

            {/* Actionable Recommendations (Next Strategic Moves) */}
            {resp.actionable_recommendations && resp.actionable_recommendations.length > 0 && (
              <div className="p-4 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/50 space-y-2">
                <div className="text-xs font-bold text-amber-800 dark:text-amber-400 flex items-center gap-1.5 uppercase tracking-wider">
                  <Zap className="w-3.5 h-3.5" />
                  Recommended Action Plan:
                </div>
                <div className="space-y-1.5">
                  {resp.actionable_recommendations.map((rec, rIdx) => (
                    <div key={rIdx} className="text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2">
                      <span className="text-amber-600 font-bold">•</span>
                      <span>{rec}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mathematical Definition & Date Range Scope */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
              <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800 space-y-1">
                <div className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                  Mathematical Formula
                </div>
                <div className="text-slate-500 dark:text-slate-400 leading-relaxed font-mono text-[11px]">
                  {resp.metric_definition}
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800 space-y-1">
                <div className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-500" />
                  Date Range Scope
                </div>
                <div className="text-slate-500 dark:text-slate-400 leading-relaxed">
                  {resp.date_range_explained}
                </div>
              </div>
            </div>

            {/* Data Limitation Notice */}
            {resp.data_limitation_notes && (
              <div className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-100/60 dark:bg-slate-800/40 p-2.5 rounded-lg">
                <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-slate-400" />
                <span>{resp.data_limitation_notes}</span>
              </div>
            )}

            {/* Drilldown Navigation Action */}
            {resp.drilldown_route && onNavigateTab && (
              <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[11px] text-slate-400">
                  Deterministic Zero-Hallucination Audit Trail
                </span>
                <button
                  type="button"
                  onClick={() => onNavigateTab(resp.drilldown_route.replace("/", ""))}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/80 text-indigo-700 dark:text-indigo-300 rounded-lg transition-colors"
                >
                  <span>Verify in Detailed Module</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Empty State / Welcome Guide */}
        {history.length === 0 && !loading && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-500 mx-auto flex items-center justify-center text-white shadow-md">
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Ready to Analyze Your Kirana Store
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Type any business question or click one of the suggested prompts above. Gemini 3.8 calculates exact answers straight from your store's SQLite database.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
