import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  Check,
  ClipboardList,
  Home,
  Loader2,
  MessageSquare,
  Send,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSession, rolePath } from "@/lib/session";
import { cn } from "@/lib/utils";
import AppShell from "@/components/AppShell";
import Avatar from "@/components/Avatar";

interface EmployeeRecord {
  id: string;
  name: string;
  department: string;
  role_title: string;
  manager_id: string | null;
  leave_balance: number;
  wfh_used_this_month: number;
}

interface PolicyDecision {
  answer: string;
  applicable_rule: string;
  conflict_detected: boolean;
  conflict_explanation: string;
  citations: string[];
  confidence: number;
  action_required: boolean;
  action_type: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  question?: string;
  topic?: string;
  decision?: PolicyDecision;
  submitted?: boolean;
  error?: boolean;
}

interface HistoryRequest {
  request_id: string;
  request_type: string;
  details: string;
  reason: string;
  status: string;
  decided_by: string | null;
  decided_at: string | null;
}

interface HistoryEscalation {
  escalation_id: string;
  question_text: string;
  reason: string;
  confidence: number;
  status: string;
  created_at: string;
  hr_reply: string | null;
  hr_reply_at: string | null;
}

interface RequestHistory {
  requests: HistoryRequest[];
  escalations: HistoryEscalation[];
}

const SUGGESTIONS = [
  "What is WFH?",
  "Am I eligible for WFH?",
  "The general WFH policy says 5 days but my department says 3 — which applies?",
  "How many leave days do I have left?",
];

const LOADING_STEPS = [
  { at: 0, label: "Reading your question" },
  { at: 3, label: "Looking up your employee record" },
  { at: 6, label: "Searching HR Clarion policies for the most relevant clauses" },
  { at: 11, label: "Comparing clauses and checking which one takes precedence" },
  { at: 17, label: "Applying your balances and department rules" },
  { at: 24, label: "Writing your answer with citations" },
];

// Decorative pastel accents, rotated across cards/tags (never status-bearing).
const ACCENTS = [
  "bg-[#C8F169]",
  "bg-[#0F3D2C]",
  "bg-[#F7F5EF]",
  "bg-[#8FA88A]",
];

const classifyTopic = (text: string): string => {
  const lower = text.toLowerCase();
  if (
    lower.includes("wfh") ||
    lower.includes("remote") ||
    lower.includes("work from home") ||
    (lower.includes("department rule") && lower.includes("company rule")) ||
    lower.includes("department policy") ||
    lower.includes("company policy") ||
    lower.includes("policy override") ||
    lower.includes("which rule applies")
  ) {
    return "WFH";
  }
  if (lower.includes("leave") || lower.includes("vacation") || lower.includes("days off")) {
    return "LEAVE";
  }
  return "UNKNOWN";
};

const isWfhDefinitionQuestion = (text: string): boolean => {
  const lower = text.toLowerCase().replace(/[?!.]/g, " ");
  return (
    (lower.includes("what is wfh") ||
      lower.includes("what does wfh mean") ||
      lower.includes("what is work from home") ||
      lower.includes("what does work from home mean")) &&
    !lower.includes("how many") &&
    !lower.includes("eligible") &&
    !lower.includes("apply")
  );
};

const actionLabel = (actionType: string): string => {
  switch (actionType) {
    case "WFH_REQUEST":
      return "Apply for WFH";
    case "LEAVE_REQUEST":
      return "Apply for Leave";
    default:
      return "";
  }
};

const formatDate = (value: string | null | undefined): string =>
  value ? value.slice(0, 10) : "—";

const requestStatusClass = (status: string): string => {
  switch (status) {
    case "PENDING":
      return "bg-amber-100 text-amber-800";
    case "APPROVED":
      return "bg-green-100 text-green-800";
    case "REJECTED":
      return "bg-red-100 text-red-800";
    case "EXPIRED":
      return "bg-slate-200 text-slate-600";
    default:
      return "bg-slate-100 text-slate-700";
  }
};

const EmployeePolicyDesk = () => {
  const navigate = useNavigate();
  const session = getSession();

  const [employee, setEmployee] = useState<EmployeeRecord | null>(null);
  const [employeeError, setEmployeeError] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittingIndex, setSubmittingIndex] = useState<number | null>(null);
  const [view, setView] = useState<"chat" | "requests">("chat");
  const [history, setHistory] = useState<RequestHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const historyFetchedRef = useRef(false);
  const [elapsed, setElapsed] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!session) return;
    if (session.role !== "EMPLOYEE") {
      navigate(rolePath(session.role), { replace: true });
      return;
    }
    let cancelled = false;
    const fetchEmployee = async () => {
      const { data, error } = await supabase.functions.invoke("getPolicyContext", {
        body: { employee_id: session.id, topic: "WFH" },
      });
      if (cancelled) return;
      if (!error && data?.employee) {
        setEmployee(data.employee);
      } else {
        setEmployeeError(true);
      }
    };
    fetchEmployee();
    return () => {
      cancelled = true;
    };
  }, [session, navigate]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, loading]);

  // Progress-checklist timer: starts from 0 every time loading becomes true,
  // ticks once per second, and is cleaned up when loading turns false or the
  // component unmounts.
  useEffect(() => {
    if (!loading) {
      setElapsed(0);
      return;
    }
    setElapsed(0);
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, [loading]);

  const submitQuestion = useCallback(
    async (question: string, appendUserBubble = true) => {
      const text = question.trim();
      if (!text || loading || !session) return;
      const topic = classifyTopic(text);
      if (appendUserBubble) {
        setMessages((prev) => [...prev, { role: "user", question: text }]);
      }
      setInput("");
      setLoading(true);
      setError(null);
      const appendFailure = () => {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            topic,
            error: true,
            question: text,
            decision: {
              answer: "Sorry, the policy engine could not respond right now.",
              applicable_rule: "",
              conflict_detected: false,
              conflict_explanation: "",
              citations: [],
              confidence: 0,
              action_required: false,
              action_type: "",
            },
          },
        ]);
      };
      try {
        if (isWfhDefinitionQuestion(text)) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              topic,
              decision: {
                answer:
                  "WFH means Work From Home. It allows employees to work remotely instead of working from the office.",
                applicable_rule: "WFH-01",
                conflict_detected: false,
                conflict_explanation: "",
                citations: ["WFH-01 §1.1"],
                confidence: 1,
                action_required: false,
                action_type: "",
              },
            },
          ]);
          return;
        }

        // Attempt the call; retry exactly once on failure to ride over
        // transient gateway timeouts before showing the generic error.
        let res;
        try {
          res = await supabase.functions.invoke("getPolicyDecision", {
            body: { employee_id: session.id, question: text, topic },
          });
        } catch (err) {
          console.error("getPolicyDecision initial call failed:", err);
          res = { data: null, error: err };
        }
        if (res.error || !res.data) {
          try {
            res = await supabase.functions.invoke("getPolicyDecision", {
              body: { employee_id: session.id, question: text, topic },
            });
          } catch (err) {
            console.error("getPolicyDecision retry failed:", err);
            res = { data: null, error: err };
          }
        }
        const { data, error } = res;
        if (error || !data) {
          appendFailure();
        } else {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", topic, decision: data as PolicyDecision },
          ]);
        }
      } finally {
        setLoading(false);
      }
    },
    [loading, session]
  );

  if (!session) {
    return <Navigate to="/login" replace />;
  }
  if (session.role !== "EMPLOYEE") {
    return <Navigate to={rolePath(session.role)} replace />;
  }

  const showAction = (topic: string | undefined, decision: PolicyDecision | undefined) => {
    if (!decision || !decision.action_required) return false;
    if (topic === "UNKNOWN") return false;
    if (decision.action_type === "ESCALATE") return false;
    return actionLabel(decision.action_type) !== "";
  };

  const handleApply = async (messageIndex: number) => {
    const msg = messages[messageIndex];
    if (!msg?.decision || msg.submitted || submittingIndex !== null || !session) return;
    const decision = msg.decision;
    setSubmittingIndex(messageIndex);
    setError(null);
    try {
      const details =
        decision.action_type === "WFH_REQUEST"
          ? "WFH request submitted via assistant"
          : "Leave request submitted via assistant";
      const { error } = await supabase.functions.invoke("createRequest", {
        body: {
          employee_id: session.id,
          request_type: decision.action_type,
          details,
          reason: "Requested via HR Clarion assistant",
          reasoning_snapshot: JSON.stringify(decision),
          citations: (decision.citations ?? []).join(", "),
        },
      });
      if (error) {
        setError("Could not submit your request. Please try again.");
      } else {
        setMessages((prev) =>
          prev.map((m, i) => (i === messageIndex ? { ...m, submitted: true } : m))
        );
      }
    } finally {
      setSubmittingIndex(null);
    }
  };

  const retryQuestion = (index: number, question: string) => {
    // Drop the failed answer bubble, then re-ask without duplicating the
    // employee's original message.
    setMessages((prev) => prev.filter((_, i) => i !== index));
    submitQuestion(question, false);
  };

  const openRequests = async () => {
    setView("requests");
    if (historyFetchedRef.current || !session) return;
    historyFetchedRef.current = true;
    setHistoryLoading(true);
    setHistoryError(false);
    try {
      const { data, error } = await supabase.functions.invoke("getEmployeeRequestHistory", {
        body: { employee_id: session.id },
      });
      if (error || !data) {
        setHistoryError(true);
      } else {
        setHistory({
          requests: data.requests ?? [],
          escalations: data.escalations ?? [],
        });
      }
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleNav = (id: string) => {
    if (id === "concern") {
      navigate("/speakup");
    } else if (id === "requests") {
      openRequests();
    } else {
      setView("chat");
    }
  };

  const currentStepIndex = LOADING_STEPS.reduce(
    (acc, s, i) => (elapsed >= s.at ? i : acc),
    -1
  );

  const nav = [
    { id: "chat", label: "Chat", icon: MessageSquare },
    { id: "requests", label: "My Requests", icon: ClipboardList },
    { id: "concern", label: "Report a Concern", icon: AlertCircle },
  ];
  const activeNav = view === "requests" ? "requests" : "chat";
  const stats = employee
    ? [
        { icon: Calendar, label: "Leave balance", value: `${employee.leave_balance}`, tone: "emerald" as const },
        { icon: Home, label: "WFH used", value: `${employee.wfh_used_this_month}`, tone: "amber" as const },
      ]
    : [];

  const userName = employee?.name ?? session.id;

  return (
    <AppShell nav={nav} activeNav={activeNav} onNav={handleNav} stats={stats} variant="premium">
      {error && (
        <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mx-auto flex h-full w-full max-w-6xl flex-col">
        {view === "requests" ? (
          <div className="space-y-6">
            <header className="border-b border-slate-200/80 pb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Employee self-service</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Your requests</h1>
              <p className="mt-1 text-sm text-slate-500">Track requests and questions shared with your manager or HR.</p>
            </header>
            <section className="rounded-2xl border border-slate-200/80 bg-white/70 p-5 shadow-sm backdrop-blur-sm">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700">
                <ClipboardList className="h-4 w-4 text-cyan-700" />
                Requests
              </h2>
              {historyLoading ? (
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                  <span className="text-sm text-slate-500">Loading…</span>
                </div>
              ) : historyError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  Couldn't load your request history.
                </div>
              ) : !history || history.requests.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-8 text-center text-sm text-slate-500">
                  No requests yet
                </div>
              ) : (
                <div className="space-y-3">
                  {history.requests.map((r) => (
                    <div key={r.request_id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          {r.request_type}
                        </p>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-medium",
                            requestStatusClass(r.status)
                          )}
                        >
                          {r.status}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-800">{r.details}</p>
                      {r.reason && <p className="mt-1 text-sm text-slate-500">{r.reason}</p>}
                      {r.decided_at && (
                        <p className="mt-2 text-xs text-slate-500">
                          Decided {formatDate(r.decided_at)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200/80 bg-white/70 p-5 shadow-sm backdrop-blur-sm">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700">
                <AlertCircle className="h-4 w-4 text-cyan-700" />
                Escalations
              </h2>
              {historyLoading ? (
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                  <span className="text-sm text-slate-500">Loading…</span>
                </div>
              ) : historyError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  Couldn't load your request history.
                </div>
              ) : !history || history.escalations.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-8 text-center text-sm text-slate-500">
                  No escalations yet
                </div>
              ) : (
                <div className="space-y-3">
                  {history.escalations.map((e) => (
                    <div key={e.escalation_id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm text-slate-800">{e.question_text}</p>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-medium",
                            e.status === "OPEN"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-green-100 text-green-800"
                          )}
                        >
                          {e.status}
                        </span>
                      </div>
                      {e.hr_reply ? (
                        <p className="mt-2 text-sm text-slate-700">HR reply: {e.hr_reply}</p>
                      ) : (
                        <p className="mt-2 text-sm text-slate-500">Awaiting HR reply</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : (
          <>
            <header className="mb-4 flex flex-col gap-4 border-b border-slate-200/80 pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">HR Clarion assistant</p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Your policy desk</h1>
                <p className="mt-1 max-w-2xl text-sm text-slate-500">
                  Get clear, personalised answers from the latest HR policies.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 self-start rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 sm:self-auto">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" /> Policies online
              </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/70 shadow-[0_18px_50px_rgba(15,61,44,0.08)] backdrop-blur-sm">
              {messages.length === 0 && (
                <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-4 text-sm font-medium text-slate-600 sm:px-8">
                  Start with a suggested question or ask anything about leave and WFH.
                </div>
              )}

            <div ref={listRef} aria-live="polite" className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-8">
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="flex animate-in items-end justify-end gap-2 fade-in slide-in-from-bottom-2 duration-300">
                    <div className="max-w-2xl rounded-2xl rounded-br-sm bg-[#0F3D2C] px-5 py-3.5 text-sm leading-relaxed text-white shadow-md shadow-emerald-950/15">
                      {m.question}
                    </div>
                    <Avatar name={userName} />
                  </div>
                ) : (
                  <div key={i} className="flex animate-in items-start gap-3 fade-in slide-in-from-bottom-2 duration-300">
                    <Avatar name="HR Clarion" />
                    <div
                      className={cn(
                        "max-w-2xl rounded-2xl rounded-bl-sm border px-5 py-4 shadow-sm",
                        m.error || m.topic === "UNKNOWN" || m.decision?.action_type === "ESCALATE"
                          ? "border-amber-200 bg-amber-50/90"
                          : "border-slate-200 bg-white/95"
                      )}
                    >
                      {m.error ? (
                        <div className="space-y-3">
                          <div className="flex items-start gap-2 text-sm text-red-700">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                            <p>{m.decision?.answer}</p>
                          </div>
                          {m.question && (
                            <Button
                              size="sm"
                              className="rounded-lg bg-[#0F3D2C] text-white shadow-sm hover:bg-[#15573f]"
                              disabled={loading}
                              onClick={() => retryQuestion(i, m.question!)}
                            >
                              Try again
                            </Button>
                          )}
                        </div>
                      ) : (
                        <>
                          <p className="text-sm leading-relaxed text-slate-800">
                            {m.decision?.answer}
                          </p>
                          {m.decision?.conflict_detected && (
                            <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 border-l-4 border-l-amber-500 bg-amber-50 px-3 py-2 text-sm">
                              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                              <div>
                                <p className="font-medium text-amber-800">Conflict detected</p>
                                {m.decision.conflict_explanation && (
                                  <p className="mt-0.5 text-amber-700">
                                    {m.decision.conflict_explanation}
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                          {m.decision?.citations && m.decision.citations.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {m.decision.citations.map((c, j) => (
                                <span
                                  key={j}
                                  className={`rounded-full border border-white/50 px-2.5 py-0.5 text-xs font-medium text-slate-800 ${ACCENTS[j % 4]}`}
                                >
                                  {c}
                                </span>
                              ))}
                            </div>
                          )}
                          {showAction(m.topic, m.decision) && !m.submitted && (
                            <Button
                              size="sm"
                              className="mt-4 rounded-lg bg-[#0F3D2C] text-white shadow-sm hover:bg-[#15573f]"
                              disabled={submittingIndex !== null}
                              onClick={() => handleApply(i)}
                            >
                              {submittingIndex === i
                                ? "Submitting…"
                                : actionLabel(m.decision!.action_type)}
                            </Button>
                          )}
                          {m.submitted && (
                            <div className="mt-3 flex items-center gap-1.5 text-sm text-emerald-700">
                              <Check className="h-4 w-4 shrink-0" />
                              <span>Your request has been submitted to your manager.</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              )}

              {loading && (
                <div className="flex items-start gap-3">
                  <Avatar name="HR Clarion" />
                  <div className="max-w-2xl flex-1 rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur-md" role="status">
                    {LOADING_STEPS.map((step, i) => {
                      if (elapsed < step.at) return null;
                      const isCurrent = i === currentStepIndex;
                      return (
                        <div key={step.at} className="mb-3 flex items-center gap-3 last:mb-0">
                          {isCurrent ? (
                            <span className="h-2 w-2 shrink-0 animate-ping rounded-full bg-indigo-600" />
                          ) : (
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                              <Check className="h-3.5 w-3.5" />
                            </span>
                          )}
                          <span className="font-medium text-slate-700">{step.label}</span>
                        </div>
                      );
                    })}
                    {elapsed >= 32 && (
                      <p className="mt-3 text-xs text-slate-500">
                        Still working, detailed answers take a little longer.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-4 sm:px-8">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submitQuestion(s)}
                  disabled={loading}
                  className="inline-flex cursor-pointer items-center rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-cyan-600 hover:bg-cyan-50 hover:text-cyan-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                >
                  {s}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitQuestion(input);
              }}
              className="border-t border-slate-200 bg-white px-4 py-4 sm:px-8 sm:pb-6"
            >
              <label htmlFor="policy-question" className="sr-only">Ask a policy question</label>
              <div className="relative flex items-center rounded-xl border border-slate-300 bg-white shadow-sm transition-all focus-within:border-cyan-700 focus-within:ring-4 focus-within:ring-cyan-700/10">
                <Input
                  id="policy-question"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your HR question…"
                  disabled={loading}
                  className="flex-1 rounded-xl border-0 bg-transparent px-4 py-3.5 pr-24 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus-visible:ring-0 sm:text-base"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  aria-label="Send policy question"
                  className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-2 rounded-lg bg-[#0F3D2C] px-3.5 py-2 font-semibold text-white shadow-sm transition-colors hover:bg-[#15573f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F169] focus-visible:ring-offset-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:right-2 sm:px-4"
                >
                  <Send className="h-4 w-4" />
                  Send
                </button>
              </div>
            </form>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
};

export default EmployeePolicyDesk;
