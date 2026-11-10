import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowRight,
  ArrowUp,
  AlertCircle,
  Brain,
  Check,
  Copy,
  FileSpreadsheet,
  Mic,
  MicOff,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Plus,
  RefreshCw,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { NavItemKey } from "../components/Sidebar";
import {
  AIConversation,
  AIDocument,
  AILanguageType,
  AIMessage,
  AIModeType,
  AIRuntime,
  AISpecialistTrace,
  AIApproval,
} from "../types";
import {
  AiApprovalCard,
  AiChartRenderer,
  AiDataTable,
  AiKpiStrip,
  AiReasoningDrawer,
  FormattedAiMarkdown,
} from "../components/ai/AiVisuals";

interface AgentPageProps {
  onNavigateTab?: (tab: NavItemKey) => void;
  externalPromptRequest?: { text: string; mode?: AIModeType; nonce: number } | null;
}

const NORMAL_STARTERS: string[] = [
  "How much profit did I make this month?",
  "ಈ ತಿಂಗಳ ಲಾಭ ಎಷ್ಟು?",
  "Check low stock & prepare a PO draft",
  "How can I attract more customers?",
];

const DEEP_STARTERS: string[] = [
  "Analyze my store in depth",
  "Why did my profit change recently?",
  "Highest margins & working capital lockup",
  "7-day demand forecast & supplier comparison",
];

const KANNADA_STARTERS: string[] = [
  "ಈ ತಿಂಗಳ ಲಾಭ ಎಷ್ಟು?",
  "ಕಡಿಮೆ ಸ್ಟಾಕ್ ನೋಡಿ ಖರೀದಿ ಆರ್ಡರ್ ಡ್ರಾಫ್ಟ್ ಮಾಡಿ",
  "ನನ್ನ ಅಂಗಡಿಯಲ್ಲಿ ಹೆಚ್ಚು ಗ್ರಾಹಕರನ್ನು ಆಕರ್ಷಿಸುವುದು ಹೇಗೆ?",
  "ನನ್ನ ಅಂಗಡಿಯ ಸಂಪೂರ್ಣ ವಿಶ್ಲೇಷಣೆ ತೋರಿಸಿ",
];

export const AgentPage: React.FC<AgentPageProps> = ({
  onNavigateTab,
  externalPromptRequest,
}) => {
  const { currentBusiness } = useAuth();
  const { language: appLanguage } = useLanguage();
  const userRole = currentBusiness?.role || "OWNER";

  // Clean ChatGPT Layout State
  const [showSidebar, setShowSidebar] = useState(true);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);

  // Runtime & Error State
  const [runtime, setRuntime] = useState<AIRuntime | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ChatGPT Mode (Normal | Deep) & Language State
  const [aiMode, setAiMode] = useState<AIModeType>("QUICK_ASSIST");
  const [aiLang, setAiLang] = useState<AILanguageType>("auto");
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<AIMessage[]>([]);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamStage, setStreamStage] = useState<string>("");
  const [streamAgents, setStreamAgents] = useState<AISpecialistTrace[]>([]);
  const [streamText, setStreamText] = useState<string>("");

  // Attachments & Voice
  const [attachedDoc, setAttachedDoc] = useState<AIDocument | null>(null);
  const [docTypeSelect, setDocTypeSelect] = useState<string>("PURCHASE_INVOICE");
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [copiedId, setCopiedId] = useState<number | string | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [speakingId, setSpeakingId] = useState<number | string | null>(null);
  const [isListening, setIsListening] = useState(false);

  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const plusMenuRef = useRef<HTMLDivElement | null>(null);
  const handledExternalNonceRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamTextRef = useRef<string>("");
  const requestSeqRef = useRef<number>(0);

  const hasSpeechInput =
    typeof window !== "undefined" &&
    Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const hasSpeechOutput = typeof window !== "undefined" && "speechSynthesis" in window;

  const refreshRuntime = useCallback(async () => {
    try {
      setLoadError(null);
      const rt = await api.getAiRuntime();
      setRuntime(rt);
    } catch (err: any) {
      setLoadError(err.message || "Unable to connect to SmartStock AI");
    }
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const list = await api.getAiConversations();
      setConversations(list);
    } catch {
      // handled silently
    }
  }, []);

  useEffect(() => {
    void refreshRuntime();
    void loadConversations();
  }, [currentBusiness?.id, refreshRuntime, loadConversations]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, streamText]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
        setPlusMenuOpen(false);
      }
    };
    if (plusMenuOpen) {
      document.addEventListener("mousedown", handleOutside);
      return () => document.removeEventListener("mousedown", handleOutside);
    }
  }, [plusMenuOpen]);

  useEffect(() => {
    return () => {
      requestSeqRef.current += 1;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      if (hasSpeechOutput) window.speechSynthesis.cancel();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    };
  }, [hasSpeechOutput]);

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const selectConversation = async (conv: AIConversation) => {
    requestSeqRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setSending(false);
    setStreamStage("");
    setStreamAgents([]);
    setStreamText("");
    streamTextRef.current = "";
    setActiveConversationId(conv.id);
    try {
      const msgs = await api.getAiConversationMessages(conv.id);
      setMessages(msgs);
    } catch (err: any) {
      setLoadError(err.message || "Failed to load conversation history");
    }
  };

  const startNewChat = () => {
    requestSeqRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setSending(false);
    setStreamStage("");
    setStreamAgents([]);
    setStreamText("");
    streamTextRef.current = "";
    if (hasSpeechOutput) window.speechSynthesis.cancel();
    setSpeakingId(null);
    setActiveConversationId(null);
    setMessages([]);
    setAttachedDoc(null);
  };

  const handleDeleteConversation = async (convId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.deleteAiConversation(convId);
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (activeConversationId === convId) {
        startNewChat();
      }
    } catch {}
  };

  const speakText = (id: number | string, text: string, langCode?: string) => {
    if (!hasSpeechOutput) return;
    if (speakingId === id) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const cleaned = text.replace(/[#*`>_]/g, "");
    const utter = new SpeechSynthesisUtterance(cleaned);
    const chosen = langCode || aiLang;
    utter.lang = chosen === "kn" ? "kn-IN" : chosen === "hi" ? "hi-IN" : "en-IN";
    utter.onend = () => setSpeakingId(null);
    utter.onerror = () => setSpeakingId(null);
    setSpeakingId(id);
    window.speechSynthesis.speak(utter);
  };

  const toggleVoiceInput = () => {
    if (!hasSpeechInput) return;
    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      setIsListening(false);
      return;
    }
    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SpeechRec();
    rec.lang =
      aiLang === "kn" || appLanguage === "kn"
        ? "kn-IN"
        : aiLang === "hi"
        ? "hi-IN"
        : "en-IN";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (evt: any) => {
      const transcript = evt.results?.[0]?.[0]?.transcript || "";
      if (transcript) {
        setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      }
    };
    rec.onend = () => setIsListening(false);
    rec.onerror = () => setIsListening(false);
    recognitionRef.current = rec;
    setIsListening(true);
    rec.start();
  };

  const sendMessage = useCallback(
    async (overrideText?: string, overrideMode?: AIModeType) => {
      const trimmed = (overrideText !== undefined ? overrideText : input).trim();
      if (!trimmed || sending) return;

      const targetMode: AIModeType = overrideMode || aiMode;
      const reqSeq = ++requestSeqRef.current;
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const optimisticUserMsg: AIMessage = {
        id: Date.now(),
        conversation_id: activeConversationId || 0,
        role: "user",
        content: trimmed,
        mode: targetMode,
        language: aiLang,
        confidence: 1,
        payload: {
          kpis: [],
          charts: [],
          tables: [],
          evidence: [],
          assumptions: [],
          recommendations: [],
          agents_involved: [],
          tool_traces: [],
          actions: [],
          approval_ids: [],
          approvals: [],
          follow_ups: [],
          llm_provider: "user",
        },
        tokens_used: 0,
        latency_ms: 0,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimisticUserMsg]);
      if (overrideText === undefined) setInput("");
      setPlusMenuOpen(false);
      setSending(true);
      setStreamStage(
        aiLang === "kn"
          ? "ಆಲೋಚಿಸುತ್ತಿದ್ದೇನೆ..."
          : targetMode === "DEEP_ANALYSIS"
          ? "Deep analyzing SmartStock records..."
          : "Thinking..."
      );
      setStreamAgents([]);
      setStreamText("");
      streamTextRef.current = "";

      try {
        const docIdToSend = attachedDoc?.id || null;
        const response = await api.aiUltraChatStream(
          {
            message: trimmed,
            conversation_id: activeConversationId,
            mode: targetMode,
            language: aiLang,
            document_id: docIdToSend,
            voice_input: false,
          },
          {
            onStatus: () => {
              if (reqSeq !== requestSeqRef.current) return;
              setStreamStage(
                aiLang === "kn"
                  ? "ಅಂಗಡಿ ಮಾಹಿತಿ ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ..."
                  : targetMode === "DEEP_ANALYSIS"
                  ? "Consulting SmartStock specialists..."
                  : "Thinking..."
              );
            },
            onAgentStep: (step) => {
              if (reqSeq !== requestSeqRef.current) return;
              setStreamAgents((prev) => [...prev, step]);
            },
            onToken: (delta) => {
              if (reqSeq !== requestSeqRef.current) return;
              streamTextRef.current += delta;
              setStreamText((prev) => prev + delta);
            },
          },
          controller.signal
        );

        if (reqSeq !== requestSeqRef.current) return;

        setActiveConversationId(response.conversation_id);
        setAttachedDoc(null);

        setMessages((prev) => [
          ...prev.slice(0, -1),
          response.user_message,
          response.assistant_message,
        ]);

        if (autoSpeak && hasSpeechOutput) {
          speakText(
            response.assistant_message.id,
            response.assistant_message.content,
            response.detected_language
          );
        }

        void loadConversations();
        void refreshRuntime();
      } catch (err: any) {
        if (reqSeq !== requestSeqRef.current) return;

        if (err?.name === "AbortError" || controller.signal.aborted) {
          const partial = streamTextRef.current.trimEnd();
          if (partial) {
            const stoppedNote =
              aiLang === "kn" ? "\n\n*(ಉತ್ತರ ನಿಲ್ಲಿಸಲಾಗಿದೆ)*" : "\n\n*(Stopped)*";
            const stoppedMsg: AIMessage = {
              id: Date.now() + 1,
              conversation_id: activeConversationId || 0,
              role: "assistant",
              content: `${partial}${stoppedNote}`,
              mode: targetMode,
              language: aiLang,
              confidence: 0.9,
              payload: {
                kpis: [],
                charts: [],
                tables: [],
                evidence: [],
                assumptions: [],
                recommendations: [],
                agents_involved: [],
                tool_traces: [],
                actions: [],
                approval_ids: [],
                approvals: [],
                follow_ups: [],
                llm_provider: "stopped",
              },
              tokens_used: 0,
              latency_ms: 0,
              created_at: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, stoppedMsg]);
          }
          return;
        }

        const errMsg: AIMessage = {
          id: Date.now() + 1,
          conversation_id: activeConversationId || 0,
          role: "assistant",
          content: err.message || "SmartStock AI encountered a connection error.",
          mode: targetMode,
          language: aiLang,
          confidence: 0,
          payload: {
            kpis: [],
            charts: [],
            tables: [],
            evidence: [],
            assumptions: [],
            recommendations: [],
            agents_involved: [],
            tool_traces: [],
            actions: [],
            approval_ids: [],
            approvals: [],
            follow_ups: [],
            llm_provider: "error",
          },
          tokens_used: 0,
          latency_ms: 0,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        if (reqSeq === requestSeqRef.current) {
          setSending(false);
          setStreamStage("");
          setStreamAgents([]);
          setStreamText("");
          streamTextRef.current = "";
        }
      }
    },
    [
      input,
      sending,
      aiMode,
      activeConversationId,
      aiLang,
      attachedDoc,
      autoSpeak,
      hasSpeechOutput,
      loadConversations,
      refreshRuntime,
    ]
  );

  // Trigger external prompt when handed off from Floating Launcher
  useEffect(() => {
    if (
      externalPromptRequest &&
      externalPromptRequest.nonce !== handledExternalNonceRef.current
    ) {
      handledExternalNonceRef.current = externalPromptRequest.nonce;
      if (externalPromptRequest.mode) {
        setAiMode(externalPromptRequest.mode);
      }
      void sendMessage(externalPromptRequest.text, externalPromptRequest.mode);
    }
  }, [externalPromptRequest, sendMessage]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDoc(true);
    setLoadError(null);
    setPlusMenuOpen(false);
    try {
      const doc = await api.uploadAiDocument(file, docTypeSelect, activeConversationId);
      setAttachedDoc(doc);
      if (!input.trim()) {
        setInput(
          aiLang === "kn"
            ? `ಅಪ್‌ಲೋಡ್ ಮಾಡಿದ ${doc.filename} ಫೈಲ್ ಪರಿಶೀಲಿಸಿ`
            : `Analyze uploaded ${doc.document_type.toLowerCase().replace(/_/g, " ")}: ${doc.filename}`
        );
      }
    } catch (err: any) {
      setLoadError(err.message || "Document upload failed.");
    } finally {
      setUploadingDoc(false);
      e.target.value = "";
    }
  };

  const syncUpdatedApproval = (updated: AIApproval) => {
    setMessages((prev) =>
      prev.map((m) => ({
        ...m,
        payload: {
          ...m.payload,
          approvals: (m.payload?.approvals || []).map((a) =>
            a.id === updated.id ? updated : a
          ),
        },
      }))
    );
    void refreshRuntime();
  };

  const handleApproveAction = async (approvalId: number, note?: string) => {
    const updated = await api.approveAiAction(approvalId, note);
    syncUpdatedApproval(updated);
  };

  const handleRejectAction = async (approvalId: number, note?: string) => {
    const updated = await api.rejectAiAction(approvalId, note);
    syncUpdatedApproval(updated);
  };

  const handleCopy = (id: number | string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1600);
  };

  const shopName = runtime?.workspace_name || currentBusiness?.name || "your store";

  const starterList =
    aiLang === "kn"
      ? KANNADA_STARTERS
      : aiMode === "DEEP_ANALYSIS"
      ? DEEP_STARTERS
      : NORMAL_STARTERS;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="h-[calc(100vh-7.25rem)] min-h-[540px] rounded-[24px] bg-gradient-to-b from-[rgba(48,62,72,0.58)] via-[rgba(30,40,48,0.55)] to-[#080B10]/95 border border-white/[0.14] shadow-[0_30px_70px_-15px_rgba(0,0,0,0.9),0_0_36px_-8px_rgba(94,234,212,0.1)] relative overflow-hidden backdrop-blur-2xl flex flex-col">
        {/* Hidden shared file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.txt,.pdf,.json,.png,.jpg,.jpeg"
          className="hidden"
          onChange={(e) => void handleFileUpload(e)}
        />

        {/* CLEAN MINIMAL CHATGPT-STYLE TOP HEADER */}
        <header className="h-14 px-4 sm:px-6 border-b border-white/[0.08] flex items-center justify-between gap-3 shrink-0 bg-white/[0.02]">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setShowSidebar((v) => !v)}
              title={showSidebar ? "Hide chat history" : "Show chat history"}
              aria-label={showSidebar ? "Hide chat history" : "Show chat history"}
              className="p-2 rounded-xl text-[#A1AEBB] hover:text-[#F8FAFC] hover:bg-white/[0.06] transition-colors shrink-0"
            >
              {showSidebar ? (
                <PanelLeftClose className="w-4 h-4" />
              ) : (
                <PanelLeftOpen className="w-4 h-4" />
              )}
            </button>

            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-[#5EEAD4]/15 border border-[#5EEAD4]/40 text-[#6EE7B7] flex items-center justify-center shrink-0">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <span className="text-sm font-bold text-[#F8FAFC] tracking-tight truncate">
                SmartStock AI
              </span>
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-[#A1AEBB]/80 truncate">
                <span>·</span>
                <span className="truncate max-w-[200px]">{shopName}</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={startNewChat}
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-[#E2E8F0] hover:text-[#F8FAFC] hover:bg-white/[0.07] inline-flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New chat</span>
            </button>

            {hasSpeechOutput && (
              <button
                type="button"
                onClick={() => {
                  const next = !autoSpeak;
                  setAutoSpeak(next);
                  if (!next) {
                    window.speechSynthesis.cancel();
                    setSpeakingId(null);
                  }
                }}
                title={autoSpeak ? "Voice reply enabled" : "Enable voice reply"}
                aria-label="Toggle voice response"
                className={`p-2 rounded-xl transition-colors ${
                  autoSpeak
                    ? "bg-[#5EEAD4]/15 text-[#6EE7B7] border border-[#5EEAD4]/35"
                    : "text-[#A1AEBB] hover:text-[#F8FAFC] hover:bg-white/[0.06]"
                }`}
              >
                {autoSpeak ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
            )}
          </div>
        </header>

        {/* Inline Error Banner (only on API failures) */}
        {loadError && (
          <div className="px-5 py-2 bg-[#FB7185]/12 border-b border-[#FB7185]/30 text-[#FB7185] text-xs flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{loadError}</span>
            </div>
            <button
              type="button"
              onClick={() => setLoadError(null)}
              className="hover:text-[#F8FAFC]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* MAIN SPLIT BODY: CLEAN HISTORY + CHAT STREAM */}
        <div className="flex-1 min-h-0 flex relative">
          {/* Collapsible History Sidebar */}
          {showSidebar && (
            <aside className="hidden md:flex w-[240px] shrink-0 flex-col border-r border-white/[0.08] bg-[#080B10]/30">
              <div className="flex-1 overflow-y-auto p-3 space-y-1">
                <div className="px-2.5 pb-1.5 pt-0.5 text-[11px] font-medium text-[#A1AEBB]/70">
                  Recent chats
                </div>
                {conversations.length === 0 ? (
                  <div className="px-2.5 py-3 text-xs text-[#A1AEBB]/65 leading-relaxed">
                    Your conversations will appear here.
                  </div>
                ) : (
                  conversations.map((c) => {
                    const active = activeConversationId === c.id;
                    return (
                      <div
                        key={c.id}
                        onClick={() => void selectConversation(c)}
                        className={`group flex items-center justify-between gap-2 px-3 py-2 rounded-xl cursor-pointer transition-colors ${
                          active
                            ? "bg-white/[0.09] text-[#F8FAFC]"
                            : "text-[#CBD5E1] hover:bg-white/[0.05] hover:text-[#F8FAFC]"
                        }`}
                      >
                        <span className="text-xs truncate flex-1">{c.title}</span>
                        <button
                          type="button"
                          onClick={(e) => void handleDeleteConversation(c.id, e)}
                          title="Delete chat"
                          className="p-1 rounded text-[#A1AEBB] hover:text-[#FB7185] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </aside>
          )}

          {/* MAIN CHAT AREA */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto text-center space-y-7 py-6">
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-[#5EEAD4]/15 border border-[#5EEAD4]/40 text-[#6EE7B7] flex items-center justify-center mx-auto shadow-[0_0_28px_rgba(94,234,212,0.2)]">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <h1 className="text-xl sm:text-2xl font-bold text-[#F8FAFC] tracking-tight">
                      {aiLang === "kn"
                        ? "ನಾನು ನಿಮಗೆ ಇಂದು ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?"
                        : "What can I help with?"}
                    </h1>
                    <p className="text-xs sm:text-sm text-[#A1AEBB] max-w-md mx-auto leading-relaxed">
                      {aiLang === "kn"
                        ? "ಕನ್ನಡ, English ಅಥವಾ हिन्दी ಯಲ್ಲಿ ಸಹಜವಾಗಿ ಕೇಳಿ — ಸರಳ ಉತ್ತರಗಳಿಗೆ Normal ಅಥವಾ ಆಳವಾದ ವಿಶ್ಲೇಷಣೆಗೆ Deep ಬಳಸಿ."
                        : "Chat naturally in English, ಕನ್ನಡ, or हिन्दी. Use Normal for direct answers or Deep for full SmartStock store intelligence."}
                    </p>
                  </div>

                  {/* 4 Clean Conversational Suggestions */}
                  <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left">
                    {starterList.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => void sendMessage(prompt)}
                        className="px-4 py-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.09] hover:border-[#5EEAD4]/40 text-xs sm:text-[13px] text-[#E2E8F0] hover:text-[#F8FAFC] flex items-center justify-between gap-2 transition-all group"
                      >
                        <span className="truncate">{prompt}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-[#A1AEBB]/60 group-hover:text-[#6EE7B7] shrink-0 transition-colors" />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="max-w-3xl mx-auto space-y-6">
                  {messages.map((msg) =>
                    msg.role === "user" ? (
                      <div key={msg.id} className="flex justify-end">
                        <div className="max-w-[82%] sm:max-w-[70%] rounded-3xl px-4 py-2.5 bg-[#5EEAD4]/14 border border-[#5EEAD4]/30 text-[13.5px] text-[#F8FAFC] leading-relaxed whitespace-pre-wrap">
                          {msg.content}
                        </div>
                      </div>
                    ) : (
                      <div key={msg.id} className="group flex items-start gap-3">
                        <div className="w-7 h-7 rounded-full bg-[#5EEAD4]/15 border border-[#5EEAD4]/40 text-[#6EE7B7] flex items-center justify-center shrink-0 mt-0.5">
                          <Sparkles className="w-3.5 h-3.5" />
                        </div>

                        <div className="flex-1 min-w-0 space-y-3.5">
                          <FormattedAiMarkdown content={msg.content} />

                          {/* Rich Analytics, Charts, Tables & Agent Traces ONLY in Deep Mode */}
                          {(msg.mode === "DEEP_ANALYSIS" || msg.mode === "AGENT") && (
                            <>
                              <AiKpiStrip kpis={msg.payload?.kpis || []} />

                              {(msg.payload?.charts || []).map((ch) => (
                                <AiChartRenderer key={ch.chart_id} chart={ch} />
                              ))}

                              {(msg.payload?.tables || []).map((tb) => (
                                <AiDataTable key={tb.table_id} table={tb} />
                              ))}
                            </>
                          )}

                          {/* Inline Interactive Approval Cards (shown cleanly whenever drafts exist) */}
                          {(msg.payload?.approvals || []).map((appr) => (
                            <AiApprovalCard
                              key={appr.id}
                              approval={appr}
                              userRole={userRole}
                              language={msg.language}
                              onApprove={handleApproveAction}
                              onReject={handleRejectAction}
                            />
                          ))}

                          {(msg.mode === "DEEP_ANALYSIS" || msg.mode === "AGENT") && (
                            <AiReasoningDrawer
                              agents={msg.payload?.agents_involved || []}
                              tools={msg.payload?.tool_traces || []}
                              evidence={msg.payload?.evidence || []}
                              assumptions={msg.payload?.assumptions || []}
                              recommendations={msg.payload?.recommendations || []}
                              dataQuality={msg.payload?.data_quality}
                              llmProvider={msg.payload?.llm_provider}
                              language={msg.language}
                            />
                          )}

                          {/* Action Shortcuts */}
                          {msg.payload?.actions && msg.payload.actions.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {msg.payload.actions.map((act, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => {
                                    if (act.target_tab && onNavigateTab) {
                                      onNavigateTab(act.target_tab as NavItemKey);
                                    } else if (act.prompt) {
                                      void sendMessage(act.prompt, act.mode || undefined);
                                    }
                                  }}
                                  className="px-3 py-1.5 rounded-xl bg-[#5EEAD4]/12 hover:bg-[#5EEAD4]/20 border border-[#5EEAD4]/35 text-xs font-medium text-[#6EE7B7] inline-flex items-center gap-1.5 transition-colors"
                                >
                                  <span>{act.label}</span>
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Suggested Next Questions */}
                          {msg.payload?.follow_ups && msg.payload.follow_ups.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {msg.payload.follow_ups.map((fq, fIdx) => (
                                <button
                                  key={fIdx}
                                  type="button"
                                  onClick={() => void sendMessage(fq)}
                                  className="px-3 py-1 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] text-[11.5px] text-[#CBD5E1] hover:text-[#6EE7B7] transition-colors"
                                >
                                  {fq}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Quiet Copy & Speak Controls */}
                          <div className="flex items-center gap-3 text-[11px] text-[#A1AEBB]/75 pt-0.5">
                            <button
                              type="button"
                              onClick={() => handleCopy(msg.id, msg.content)}
                              className="hover:text-[#F8FAFC] inline-flex items-center gap-1 transition-colors"
                            >
                              {copiedId === msg.id ? (
                                <>
                                  <Check className="w-3 h-3 text-[#6EE7B7]" />
                                  <span className="text-[#6EE7B7]">
                                    {msg.language === "kn" ? "ನಕಲಾಗಿದೆ" : "Copied"}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>{msg.language === "kn" ? "ನಕಲಿಸಿ" : "Copy"}</span>
                                </>
                              )}
                            </button>
                            {hasSpeechOutput && (
                              <button
                                type="button"
                                onClick={() => speakText(msg.id, msg.content, msg.language)}
                                className="hover:text-[#6EE7B7] inline-flex items-center gap-1 transition-colors"
                              >
                                <Volume2 className="w-3 h-3" />
                                <span>
                                  {speakingId === msg.id
                                    ? msg.language === "kn"
                                      ? "ನಿಲ್ಲಿಸಿ"
                                      : "Stop"
                                    : msg.language === "kn"
                                    ? "ಕೇಳಿ"
                                    : "Listen"}
                                </span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  )}

                  {/* Clean ChatGPT Streaming Progress */}
                  {sending && (
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-full bg-[#5EEAD4]/15 border border-[#5EEAD4]/40 text-[#6EE7B7] flex items-center justify-center shrink-0 mt-0.5 animate-pulse">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-2.5 pt-1">
                        <div className="text-xs text-[#6EE7B7]/90">
                          {aiMode === "DEEP_ANALYSIS" && streamAgents.length > 0
                            ? aiLang === "kn"
                              ? `${streamAgents.length} ವಿಶೇಷ ಏಜೆಂಟ್‌ಗಳೊಂದಿಗೆ ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ...`
                              : `Analyzing across ${streamAgents.length} specialist${
                                  streamAgents.length > 1 ? "s" : ""
                                }...`
                            : streamStage || (aiLang === "kn" ? "ಆಲೋಚಿಸುತ್ತಿದ್ದೇನೆ..." : "Thinking...")}
                        </div>
                        {streamText && <FormattedAiMarkdown content={streamText} />}
                      </div>
                    </div>
                  )}

                  <div ref={threadEndRef} />
                </div>
              )}
            </div>

            {/* FLOATING CHATGPT SEARCH BAR WITH NORMAL / DEEP MODE SWITCH */}
            <div className="px-4 sm:px-8 pb-4 pt-2 shrink-0">
              <div className="max-w-3xl mx-auto relative" ref={plusMenuRef}>
                {attachedDoc && (
                  <div className="mb-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#7DD3FC]/12 border border-[#7DD3FC]/35 text-xs text-[#7DD3FC]">
                    <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate font-medium max-w-[260px]">
                      {attachedDoc.filename}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAttachedDoc(null)}
                      className="p-0.5 hover:text-[#F8FAFC]"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Minimal `+` Attachments & Language Popover */}
                {plusMenuOpen && (
                  <div className="absolute bottom-full left-0 mb-2 w-72 rounded-2xl bg-[#0D131D]/95 border border-white/[0.15] shadow-[0_20px_50px_rgba(0,0,0,0.85)] backdrop-blur-2xl p-2.5 space-y-2.5 z-30">
                    <div className="space-y-1.5">
                      <select
                        value={docTypeSelect}
                        onChange={(e) => setDocTypeSelect(e.target.value)}
                        aria-label="Document type"
                        className="w-full rounded-xl px-2.5 py-1.5 text-[11px] text-[#CBD5E1] bg-[#080B10]/90 border border-white/[0.1] focus:outline-none"
                      >
                        <option value="PURCHASE_INVOICE">Purchase Invoice</option>
                        <option value="SUPPLIER_QUOTE">Supplier Quotation</option>
                        <option value="CATALOGUE">Product Catalogue (CSV/XLSX)</option>
                        <option value="RECEIPT_PHOTO">Invoice / Label Photo</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full px-3 py-2 rounded-xl text-xs text-[#F8FAFC] hover:bg-white/[0.07] flex items-center gap-2.5 text-left transition-colors"
                      >
                        <Paperclip className="w-4 h-4 text-[#7DD3FC]" />
                        <span>Upload invoice, CSV, XLSX, or photo</span>
                      </button>
                    </div>

                    <div className="pt-2 border-t border-white/[0.08]">
                      <div className="text-[10px] text-[#A1AEBB] mb-1.5 px-0.5">
                        Reply language
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {[
                          { id: "auto" as AILanguageType, label: "Auto" },
                          { id: "en" as AILanguageType, label: "EN" },
                          { id: "kn" as AILanguageType, label: "ಕನ್ನಡ" },
                          { id: "hi" as AILanguageType, label: "हिन्दी" },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setAiLang(opt.id);
                              setPlusMenuOpen(false);
                            }}
                            className={`px-1.5 py-1 rounded-lg text-[10.5px] font-medium transition-colors ${
                              aiLang === opt.id
                                ? "bg-[#5EEAD4]/20 text-[#6EE7B7] border border-[#5EEAD4]/40"
                                : "bg-white/[0.04] text-[#A1AEBB] hover:text-[#F8FAFC] border border-transparent"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void sendMessage();
                  }}
                  className="rounded-[26px] bg-[#0B1018]/92 border border-white/[0.15] focus-within:border-[#5EEAD4]/55 px-3.5 pt-2.5 pb-2 space-y-2 shadow-[0_12px_36px_rgba(0,0,0,0.45)] transition-colors"
                >
                  <textarea
                    rows={1}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendMessage();
                      }
                    }}
                    placeholder={
                      aiLang === "kn"
                        ? aiMode === "DEEP_ANALYSIS"
                          ? "SmartStock ಆಳವಾದ ವಿಶ್ಲೇಷಣೆಗಾಗಿ ಕನ್ನಡದಲ್ಲಿ ಕೇಳಿ..."
                          : "ಕನ್ನಡದಲ್ಲಿ ಏನನ್ನಾದರೂ ಕೇಳಿ..."
                        : aiMode === "DEEP_ANALYSIS"
                        ? "Ask in depth about SmartStock profits, margins, stock & forecasts..."
                        : "Message SmartStock AI in English, ಕನ್ನಡ, or हिन्दी..."
                    }
                    aria-label="Message SmartStock AI"
                    className="w-full bg-transparent resize-none px-1 py-0.5 text-[13.5px] text-[#F8FAFC] placeholder-[#A1AEBB]/60 focus:outline-none max-h-32 leading-relaxed"
                  />

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        disabled={uploadingDoc}
                        onClick={() => setPlusMenuOpen((v) => !v)}
                        title="Attach file or pick language"
                        aria-label="Open attachments and language menu"
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[#CBD5E1] hover:text-[#F8FAFC] hover:bg-white/[0.08] shrink-0 transition-colors"
                      >
                        {uploadingDoc ? (
                          <RefreshCw className="w-4 h-4 animate-spin text-[#6EE7B7]" />
                        ) : (
                          <Plus className="w-4 h-4" />
                        )}
                      </button>

                      {/* ChatGPT-style Normal / Deep Mode Switch inside Search Bar */}
                      <div
                        role="group"
                        aria-label="AI response mode"
                        className="inline-flex items-center p-0.5 rounded-full bg-white/[0.04] border border-white/[0.1]"
                      >
                        <button
                          type="button"
                          onClick={() => setAiMode("QUICK_ASSIST")}
                          aria-pressed={aiMode === "QUICK_ASSIST"}
                          title="Normal: direct ChatGPT-style answers"
                          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold inline-flex items-center gap-1 transition-all ${
                            aiMode === "QUICK_ASSIST"
                              ? "bg-white/[0.14] text-[#F8FAFC] shadow-sm"
                              : "text-[#A1AEBB] hover:text-[#F8FAFC]"
                          }`}
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>Normal</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setAiMode("DEEP_ANALYSIS")}
                          aria-pressed={aiMode === "DEEP_ANALYSIS"}
                          title="Deep: in-depth SmartStock charts, KPIs, forecasts & multi-agent analysis"
                          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold inline-flex items-center gap-1 transition-all ${
                            aiMode === "DEEP_ANALYSIS"
                              ? "bg-[#5EEAD4]/18 text-[#6EE7B7] border border-[#5EEAD4]/40 shadow-[0_0_12px_rgba(94,234,212,0.2)]"
                              : "text-[#A1AEBB] hover:text-[#F8FAFC] border border-transparent"
                          }`}
                        >
                          <Brain className="w-3 h-3" />
                          <span>Deep</span>
                        </button>
                      </div>

                      {aiLang !== "auto" && (
                        <button
                          type="button"
                          onClick={() => setAiLang("auto")}
                          title="Reset language to auto-detect"
                          className="px-2 py-0.5 rounded-full bg-[#5EEAD4]/12 border border-[#5EEAD4]/30 text-[10.5px] font-medium text-[#6EE7B7] hover:bg-[#5EEAD4]/20 transition-colors"
                        >
                          {aiLang === "kn" ? "ಕನ್ನಡ ×" : aiLang === "hi" ? "हिन्दी ×" : "EN ×"}
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {hasSpeechInput && (
                        <button
                          type="button"
                          onClick={toggleVoiceInput}
                          title={isListening ? "Stop voice input" : "Speak"}
                          aria-label="Voice input"
                          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                            isListening
                              ? "bg-[#FB7185]/20 text-[#FB7185] animate-pulse"
                              : "text-[#CBD5E1] hover:text-[#F8FAFC] hover:bg-white/[0.08]"
                          }`}
                        >
                          {isListening ? (
                            <MicOff className="w-4 h-4" />
                          ) : (
                            <Mic className="w-4 h-4" />
                          )}
                        </button>
                      )}

                      {sending ? (
                        <button
                          type="button"
                          onClick={stopStreaming}
                          title={aiLang === "kn" ? "ಉತ್ತರ ನಿಲ್ಲಿಸಿ" : "Stop generating"}
                          aria-label="Stop generating"
                          className="w-8 h-8 rounded-full bg-white/[0.14] hover:bg-[#FB7185]/25 border border-white/[0.2] hover:border-[#FB7185]/45 text-[#F8FAFC] hover:text-[#FB7185] flex items-center justify-center shrink-0 transition-colors"
                        >
                          <Square className="w-3.5 h-3.5 fill-current" />
                        </button>
                      ) : (
                        <button
                          type="submit"
                          disabled={!input.trim()}
                          aria-label="Send message"
                          className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#5EEAD4] to-[#6EE7B7] text-[#080B10] flex items-center justify-center disabled:opacity-30 shrink-0 transition-opacity hover:brightness-105"
                        >
                          <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                        </button>
                      )}
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
