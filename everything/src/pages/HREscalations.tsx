import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, LifeBuoy, Loader2, Search, ShieldAlert, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getSession, rolePath } from "@/lib/session";
import { cn } from "@/lib/utils";
import AppShell from "@/components/AppShell";
import Avatar from "@/components/Avatar";

interface EscalationRow {
  escalation_id: string;
  employee_id: string;
  employee_name: string;
  question_text: string;
  reason: string;
  confidence: number;
  status: string;
  created_at: string;
  hr_reply: string | null;
  hr_reply_at: string | null;
}

const formatDate = (value: string | null | undefined): string =>
  value ? value.slice(0, 10) : "—";

const statusPill = (status: string): string =>
  status === "OPEN"
    ? "border border-amber-200 bg-amber-100 text-amber-700"
    : "border border-emerald-200 bg-emerald-100 text-emerald-700";

const HREscalations = () => {
  const navigate = useNavigate();
  const session = getSession();

  const [rows, setRows] = useState<EscalationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "OPEN" | "RESOLVED">("all");
  const [search, setSearch] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replySending, setReplySending] = useState<Record<string, boolean>>({});
  const [escalationUpdates, setEscalationUpdates] = useState<Record<string, EscalationRow>>({});

  useEffect(() => {
    if (!session) return;
    if (session.role !== "HR") {
      navigate(rolePath(session.role), { replace: true });
      return;
    }
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase.functions.invoke("getAdminOverview", {});
      if (cancelled) return;
      if (error || !data?.escalations) {
        setError("Could not load escalations.");
      } else {
        setRows(data.escalations);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [session, navigate]);

  const filtered = useMemo(() => {
    if (!rows) return null;
    let list = rows.filter((r) => (tab === "all" ? true : r.status === tab));
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        `${r.employee_name} ${r.question_text}`.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  }, [rows, tab, search]);

  if (!session) {
    return <Navigate to="/login" replace />;
  }
  if (session.role !== "HR") {
    return <Navigate to={rolePath(session.role)} replace />;
  }

  const sendReply = async (escalationId: string) => {
    const text = (replyDrafts[escalationId] ?? "").trim();
    if (!text || replySending[escalationId]) return;
    setReplySending((p) => ({ ...p, [escalationId]: true }));
    try {
      const { data, error } = await supabase.functions.invoke("replyToEscalation", {
        body: { escalation_id: escalationId, hr_reply: text },
      });
      if (error || !data?.escalation) {
        setError("Couldn't send the reply. Please try again.");
      } else {
        setEscalationUpdates((p) => ({ ...p, [escalationId]: data.escalation }));
      }
    } finally {
      setReplySending((p) => ({ ...p, [escalationId]: false }));
    }
  };

  const nav = [
    { id: "escalations", label: "Escalation Queue", icon: LifeBuoy },
    { id: "directory", label: "Employee Directory", icon: Users },
    { id: "policies", label: "Policy Registry", icon: BookOpen },
    { id: "speakup", label: "Speak-Up Reports", icon: ShieldAlert },
  ];
  const HR_ROUTES: Record<string, string> = {
    escalations: "/hr/escalations",
    directory: "/hr/employees",
    policies: "/hr/policies",
    speakup: "/hr/speakup",
  };
  const openCount = rows?.filter((r) => r.status === "OPEN").length ?? 0;
  const stats = [
    { icon: LifeBuoy, label: "Open", value: String(openCount), tone: "amber" as const },
    { icon: Users, label: "Total", value: String(rows?.length ?? 0), tone: "indigo" as const },
  ];

  return (
    <AppShell
      nav={nav}
      activeNav="escalations"
      onNav={(id) => navigate(HR_ROUTES[id] ?? "/hr")}
      stats={stats}
      variant="premium"
      subtitle="HR Admin Desk"
      roleBadgeClass="border-purple-500/30 bg-purple-500/20 text-purple-300"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-500">
          HR Admin &gt; <span className="text-slate-800">Escalations</span>
        </div>
        <Link
          to="/hr"
          className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-full border border-slate-200 bg-white p-1">
          {(["all", "OPEN", "RESOLVED"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                tab === t
                  ? "bg-[#0F3D2C] text-white"
                  : "text-slate-600 hover:bg-slate-50"
              )}
            >
              {t === "all" ? "All" : t}
            </button>
          ))}
        </div>
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee or question…"
            className="rounded-full border-2 border-slate-200 pl-9 focus-visible:ring-2 focus-visible:ring-[#0F3D2C]"
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {!rows && !error && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200/60" />
          ))}
        </div>
      )}

      {filtered && filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
          No escalations match.
        </div>
      )}

      {filtered && filtered.length > 0 && (
        <div className="space-y-4">
          {filtered.map((x) => {
            const row = escalationUpdates[x.escalation_id] ?? x;
            const draft = replyDrafts[x.escalation_id] ?? "";
            const sending = replySending[x.escalation_id] ?? false;
            return (
              <div key={x.escalation_id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={row.employee_name} />
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800">{row.employee_name}</p>
                      <p className="line-clamp-2 text-sm text-slate-600">{row.question_text}</p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusPill(row.status)}`}>
                    {row.status}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                    Confidence {x.confidence}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                    {x.reason}
                  </span>
                  <span className="text-xs text-slate-500">· {formatDate(x.created_at)}</span>
                </div>

                {row.hr_reply ? (
                  <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                    <p className="text-sm text-slate-700">HR reply: {row.hr_reply}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Replied {formatDate(row.hr_reply_at)}
                    </p>
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    <Textarea
                      value={draft}
                      onChange={(e) =>
                        setReplyDrafts((p) => ({ ...p, [x.escalation_id]: e.target.value }))
                      }
                      placeholder="Type your reply…"
                      rows={2}
                      className="rounded-xl border-2 border-slate-200 bg-white focus:border-[#0F3D2C] focus:ring-2 focus:ring-[#0F3D2C]/10"
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        className="rounded-full bg-[#C8F169] px-4 py-2 font-semibold text-[#0F3D2C] shadow-md transition-all hover:bg-[#B8E455]"
                        disabled={sending || !draft.trim()}
                        onClick={() => sendReply(x.escalation_id)}
                      >
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Reply"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
};

export default HREscalations;
