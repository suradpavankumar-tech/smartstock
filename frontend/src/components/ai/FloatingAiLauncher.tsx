import React, { useState, useEffect, useRef } from "react";
import { ArrowUp, ArrowUpRight, Brain, Sparkles, Square, ShieldAlert, X } from "lucide-react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { AIMessage, AIModeType, AIRuntime } from "../../types";
import { AiKpiStrip, FormattedAiMarkdown } from "./AiVisuals";

interface FloatingAiLauncherProps {
  visible: boolean;
  onExpandWorkspace: (prompt?: string, mode?: AIModeType) => void;
}

export const FloatingAiLauncher: React.FC<FloatingAiLauncherProps> = ({
  visible,
  onExpandWorkspace,
}) => {
  const { currentBusiness } = useAuth();
  const [open, setOpen] = useState(false);
  const [runtime, setRuntime] = useState<AIRuntime | null>(null);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [aiMode, setAiMode] = useState<AIModeType>("QUICK_ASSIST");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamText, setStreamText] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamTextRef = useRef<string>("");
  const requestSeqRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      requestSeqRef.current += 1;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      requestSeqRef.current += 1;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || !currentBusiness?.id) return;
    let cancelled = false;
    api
      .getAiRuntime()
      .then((rt) => {
        if (!cancelled) setRuntime(rt);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [visible, currentBusiness?.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, streamText]);

  if (!visible) return null;

  const badgeCount =
    (runtime?.pending_approvals_count || 0) + (runtime?.active_alerts_count || 0);

  const stopStreaming = () => {
    abortControllerRef.current?.abort();
  };

  const handleSend = async (overrideText?: string) => {
    const trimmed = (overrideText !== undefined ? overrideText : input).trim();
    if (!trimmed || loading) return;

    const targetMode: AIModeType = aiMode;
    const reqSeq = ++requestSeqRef.current;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const tempUser: AIMessage = {
      id: Date.now(),
      conversation_id: conversationId || 0,
      role: "user",
      content: trimmed,
      mode: targetMode,
      language: "auto",
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

    setMessages((prev) => [...prev, tempUser]);
    if (overrideText === undefined) setInput("");
    setLoading(true);
    setStreamText("");
    streamTextRef.current = "";

    try {
      const resp = await api.aiUltraChatStream(
        {
          message: trimmed,
          conversation_id: conversationId,
          mode: targetMode,
          language: "auto",
        },
        {
          onToken: (delta) => {
            if (reqSeq !== requestSeqRef.current) return;
            streamTextRef.current += delta;
            setStreamText((prev) => prev + delta);
          },
        },
        controller.signal
      );
      if (reqSeq !== requestSeqRef.current) return;
      setConversationId(resp.conversation_id);
      setMessages((prev) => [
        ...prev.slice(0, -1),
        resp.user_message,
        resp.assistant_message,
      ]);
      api
        .getAiRuntime()
        .then(setRuntime)
        .catch(() => {});
    } catch (err: any) {
      if (reqSeq !== requestSeqRef.current) return;
      if (err?.name === "AbortError" || controller.signal.aborted) {
        const partial = streamTextRef.current.trimEnd();
        if (partial) {
          setMessages((prev) => [
            ...prev,
            {
              ...tempUser,
              id: Date.now() + 1,
              role: "assistant",
              content: `${partial}\n\n*(Stopped)*`,
            },
          ]);
        }
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          ...tempUser,
          id: Date.now() + 1,
          role: "assistant",
          content: err.message || "Couldn't reach SmartStock AI right now.",
        },
      ]);
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      if (reqSeq === requestSeqRef.current) {
        setLoading(false);
        setStreamText("");
        streamTextRef.current = "";
      }
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end">
      {open && (
        <div className="mb-3 w-[min(395px,calc(100vw-2rem))] h-[min(520px,calc(100vh-7rem))] liquid-modal rounded-[24px] flex flex-col overflow-hidden shadow-[0_24px_70px_rgba(0,0,0,0.85),0_0_28px_rgba(94,234,212,0.14)] border border-white/[0.16]">
          {/* Clean Header */}
          <div className="px-4 py-3 border-b border-white/[0.08] bg-white/[0.02] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-[#5EEAD4]/15 border border-[#5EEAD4]/40 text-[#6EE7B7] flex items-center justify-center shrink-0">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#F8FAFC] truncate">SmartStock AI</div>
                <div className="text-[10.5px] text-[#A1AEBB] truncate">
                  {runtime?.workspace_name || currentBusiness?.name}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onExpandWorkspace(undefined, aiMode);
                }}
                title="Open full chat"
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-[#A1AEBB] hover:text-[#6EE7B7] hover:bg-white/[0.06] inline-flex items-center gap-1 transition-colors"
              >
                <span>Open full chat</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close SmartStock AI"
                className="p-1.5 rounded-lg text-[#A1AEBB] hover:text-[#F8FAFC] hover:bg-white/[0.06]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Pending Strip (opens conversational review cleanly in full chat) */}
          {badgeCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onExpandWorkspace(
                  "Show pending approvals and today's briefing",
                  "QUICK_ASSIST"
                );
              }}
              className="px-4 py-2 bg-[#FBBF24]/10 border-b border-[#FBBF24]/20 flex items-center justify-between text-[11px] text-[#FDE68A] hover:bg-[#FBBF24]/15 transition-colors"
            >
              <span className="inline-flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-[#FBBF24]" />
                <span>
                  {runtime?.pending_approvals_count || 0} pending draft(s) ·{" "}
                  {runtime?.active_alerts_count || 0} alert(s)
                </span>
              </span>
              <span className="font-semibold text-[#6EE7B7]">Review →</span>
            </button>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3.5 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col justify-center space-y-4 py-2">
                <div className="text-center space-y-1.5 px-2">
                  <div className="w-9 h-9 rounded-full bg-[#5EEAD4]/15 border border-[#5EEAD4]/35 text-[#6EE7B7] flex items-center justify-center mx-auto">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="text-sm font-bold text-[#F8FAFC]">How can I help?</div>
                  <p className="text-[11.5px] text-[#A1AEBB] leading-relaxed">
                    Chat naturally in English, ಕನ್ನಡ or हिन्दी — switch Normal or Deep anytime.
                  </p>
                </div>

                <div className="space-y-1.5">
                  {[
                    "How much profit did I make this month?",
                    "ಈ ತಿಂಗಳ ಲಾಭ ಎಷ್ಟು?",
                    "Check low stock & prepare a PO draft",
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void handleSend(prompt)}
                      className="w-full text-left px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs text-[#E2E8F0] hover:text-[#6EE7B7] transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl px-3.5 py-2 bg-[#5EEAD4]/15 border border-[#5EEAD4]/30 text-xs text-[#F8FAFC] leading-relaxed">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="space-y-2.5">
                    <FormattedAiMarkdown content={m.content} />
                    {(m.mode === "DEEP_ANALYSIS" || m.mode === "AGENT") && (
                      <AiKpiStrip kpis={m.payload?.kpis || []} compact />
                    )}
                    {(m.payload?.charts?.length > 0 ||
                      m.payload?.tables?.length > 0 ||
                      m.payload?.approvals?.length > 0) && (
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          onExpandWorkspace(undefined, m.mode as AIModeType);
                        }}
                        className="text-[11px] font-medium text-[#6EE7B7] hover:underline inline-flex items-center gap-1"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>View full details & approve in chat →</span>
                      </button>
                    )}
                  </div>
                )
              )
            )}
            {loading && (
              <div className="space-y-2">
                <div className="text-[11.5px] text-[#6EE7B7]/85 animate-pulse flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Thinking...</span>
                </div>
                {streamText && <FormattedAiMarkdown content={streamText} />}
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Composer with Normal | Deep Toggle */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
            className="p-3 border-t border-white/[0.08] bg-[#080B10]/60 space-y-2"
          >
            <div className="rounded-2xl bg-[#0B1018]/95 border border-white/[0.14] focus-within:border-[#5EEAD4]/55 px-3 py-2 space-y-1.5">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  aiMode === "DEEP_ANALYSIS"
                    ? "Ask in depth about SmartStock..."
                    : "Ask anything..."
                }
                aria-label="Ask SmartStock AI"
                className="w-full bg-transparent text-xs text-[#F8FAFC] placeholder-[#A1AEBB]/60 focus:outline-none"
              />
              <div className="flex items-center justify-between gap-2">
                <div
                  role="group"
                  aria-label="Quick AI mode"
                  className="inline-flex items-center p-0.5 rounded-full bg-white/[0.04] border border-white/[0.1]"
                >
                  <button
                    type="button"
                    onClick={() => setAiMode("QUICK_ASSIST")}
                    aria-pressed={aiMode === "QUICK_ASSIST"}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold inline-flex items-center gap-1 transition-all ${
                      aiMode === "QUICK_ASSIST"
                        ? "bg-white/[0.14] text-[#F8FAFC]"
                        : "text-[#A1AEBB] hover:text-[#F8FAFC]"
                    }`}
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>Normal</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiMode("DEEP_ANALYSIS")}
                    aria-pressed={aiMode === "DEEP_ANALYSIS"}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold inline-flex items-center gap-1 transition-all ${
                      aiMode === "DEEP_ANALYSIS"
                        ? "bg-[#5EEAD4]/18 text-[#6EE7B7] border border-[#5EEAD4]/40"
                        : "text-[#A1AEBB] hover:text-[#F8FAFC]"
                    }`}
                  >
                    <Brain className="w-2.5 h-2.5" />
                    <span>Deep</span>
                  </button>
                </div>

                {loading ? (
                  <button
                    type="button"
                    onClick={stopStreaming}
                    aria-label="Stop generating"
                    title="Stop generating"
                    className="w-7 h-7 rounded-full bg-white/[0.14] hover:bg-[#FB7185]/25 border border-white/[0.2] hover:border-[#FB7185]/45 text-[#F8FAFC] hover:text-[#FB7185] flex items-center justify-center shrink-0 transition-colors"
                  >
                    <Square className="w-3 h-3 fill-current" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className="w-7 h-7 rounded-full bg-[#5EEAD4] text-[#080B10] flex items-center justify-center disabled:opacity-35 shrink-0 transition-opacity"
                    aria-label="Send message"
                  >
                    <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Floating Launcher Pill */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open SmartStock AI"
        className="group relative inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-[#5EEAD4] to-[#6EE7B7] text-[#080B10] font-extrabold text-xs shadow-[0_10px_30px_rgba(94,234,212,0.42)] hover:scale-[1.03] active:scale-[0.98] transition-all"
      >
        <Sparkles className="w-4 h-4" />
        <span>Ask AI</span>
        {badgeCount > 0 && (
          <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-[#080B10] text-[#FBBF24] text-[10px] font-mono font-bold">
            {badgeCount}
          </span>
        )}
      </button>
    </div>
  );
};
