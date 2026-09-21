import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { BookOpen, LifeBuoy, Loader2, ShieldAlert, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getSession, rolePath } from "@/lib/session";
import { cn } from "@/lib/utils";
import AppShell from "@/components/AppShell";
import Avatar from "@/components/Avatar";

interface PolicyRow {
  clause_id: string;
  doc_title: string;
  section_ref: string;
  topic: string;
  scope: string;
  precedence: number;
  effective_date: string | null;
}

interface EmployeeRow {
  id: string;
  name: string;
  department: string;
  role_title: string;
  manager_id: string | null;
  leave_balance: number;
  wfh_used_this_month: number;
  risk_score: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  risk_factors: string[];
}

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

interface OverviewData {
  policies: PolicyRow[];
  employees: EmployeeRow[];
  escalations: EscalationRow[];
}

const formatDate = (value: string | null | undefined): string =>
  value ? value.slice(0, 10) : "—";

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const riskBadge = (level: "LOW" | "MEDIUM" | "HIGH"): string => {
  switch (level) {
    case "LOW":
      return "bg-green-100 text-green-700";
    case "MEDIUM":
      return "bg-amber-100 text-amber-700";
    case "HIGH":
      return "bg-red-100 text-red-700";
  }
};

const escalationStatusBadge = (status: string): string => {
  switch (status) {
    case "OPEN":
      return "border border-amber-200 bg-amber-100 text-amber-700";
    case "RESOLVED":
      return "border border-emerald-200 bg-emerald-100 text-emerald-700";
    default:
      return "border border-slate-200 bg-slate-100 text-slate-700";
  }
};

const scopeBadge = (scope: string): string =>
  scope === "COMPANY"
     ? "bg-[#8FA88A] text-[#1A1A1A]"
     : "bg-[#F7F5EF] text-[#1A1A1A]";

const SectionHeading = ({
  children,
   accent = "border-l-[#C8F169]",
}: {
  children: React.ReactNode;
  accent?: string;
}) => (
  <h2 className={`mb-3 border-l-[3px] ${accent} pl-3 text-base font-extrabold tracking-tight text-slate-900`}>
    {children}
  </h2>
);

const EmptyState = ({ message }: { message: string }) => (
  <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-8 text-center">
    <p className="text-sm font-medium text-slate-700">{message}</p>
  </div>
);

const OverviewSkeleton = () => (
  <div className="space-y-4">
    {[0, 1, 2].map((i) => (
      <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-200/60" />
    ))}
  </div>
);

const CARD = "rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/50";

const HRAdminOverview = () => {
  const navigate = useNavigate();
  const session = getSession();

  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState<string>("escalations");
  const [replyOpen, setReplyOpen] = useState<Record<string, boolean>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replySending, setReplySending] = useState<Record<string, boolean>>({});
  const [replyErrors, setReplyErrors] = useState<Record<string, string | null>>({});
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
      if (error || !data?.policies || !data?.employees || !data?.escalations) {
        setError("Could not load overview data.");
      } else {
        setData(data);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [session, navigate]);

  if (!session) {
    return <Navigate to="/login" replace />;
  }
  if (session.role !== "HR") {
    return <Navigate to={rolePath(session.role)} replace />;
  }

  const openCount = data?.escalations.filter((e) => e.status === "OPEN").length ?? 0;

  const sendReply = async (escalationId: string) => {
    const text = (replyDrafts[escalationId] ?? "").trim();
    if (!text || replySending[escalationId]) return;
    setReplySending((p) => ({ ...p, [escalationId]: true }));
    setReplyErrors((p) => ({ ...p, [escalationId]: null }));
    try {
      const { data, error } = await supabase.functions.invoke("replyToEscalation", {
        body: { escalation_id: escalationId, hr_reply: text },
      });
      if (error || !data?.escalation) {
        setReplyErrors((p) => ({
          ...p,
          [escalationId]: "Couldn't send the reply. Please try again.",
        }));
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
  const stats = [
    { icon: LifeBuoy, label: "Open escalations", value: String(openCount), tone: "amber" as const, to: "/hr/escalations" },
    { icon: Users, label: "Total employees", value: String(data?.employees.length ?? 0), tone: "indigo" as const, to: "/hr/employees" },
    { icon: BookOpen, label: "Total policies", value: String(data?.policies.length ?? 0), tone: "emerald" as const, to: "/hr/policies" },
  ];

  return (
    <AppShell
      nav={nav}
      activeNav={activeNav}
      onNav={(id) => (id === "speakup" ? navigate("/hr/speakup") : setActiveNav(id))}
      stats={stats}
      variant="premium"
      subtitle="HR Admin Desk"
      roleBadgeClass="border-purple-500/30 bg-purple-500/20 text-purple-300"
    >
      <h2 className="mb-6 text-2xl font-extrabold tracking-tight text-slate-800">HR Admin Dashboard</h2>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{error}</span>
        </div>
      )}
      {!data && !error && <OverviewSkeleton />}

      {data && activeNav === "escalations" && (
        <section>
           <SectionHeading accent="border-l-[#F7F5EF]">Escalation Queue</SectionHeading>
          {data.escalations.length === 0 ? (
            <EmptyState message="No escalations found." />
          ) : (
            <div className="space-y-4">
              {data.escalations.map((x) => {
                const row = escalationUpdates[x.escalation_id] ?? x;
                const hasReply = !!row.hr_reply;
                const draft = replyDrafts[x.escalation_id] ?? "";
                const sending = replySending[x.escalation_id] ?? false;
                const replyErr = replyErrors[x.escalation_id] ?? null;
                return (
                  <div key={x.escalation_id} className={cn(CARD, "p-6")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={row.employee_name} />
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800">{row.employee_name}</p>
                          <p className="line-clamp-2 text-sm text-slate-600">{row.question_text}</p>
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${escalationStatusBadge(row.status)}`}
                      >
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

                    {hasReply ? (
                      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                        <p className="text-sm text-slate-700">HR reply: {row.hr_reply}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Replied {formatDateTime(row.hr_reply_at)}
                        </p>
                      </div>
                    ) : replyOpen[x.escalation_id] ? (
                      <div className="mt-3 space-y-2">
                        <Textarea
                          value={draft}
                          onChange={(e) =>
                            setReplyDrafts((p) => ({
                              ...p,
                              [x.escalation_id]: e.target.value,
                            }))
                          }
                          placeholder="Type your reply…"
                          rows={2}
                          className="rounded-xl border-2 border-slate-200 bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                        />
                        {replyErr && <p className="text-xs text-red-600">{replyErr}</p>}
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            className="rounded-full bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-md transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/30"
                            disabled={sending || !draft.trim()}
                            onClick={() => sendReply(x.escalation_id)}
                          >
                            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Reply"}
                          </Button>
                          <button
                            type="button"
                            onClick={() =>
                              setReplyOpen((p) => ({ ...p, [x.escalation_id]: false }))
                            }
                            className="text-xs text-slate-500 hover:text-slate-700"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 flex justify-end">
                        <Button
                          size="sm"
                          className="rounded-full bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-md transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/30"
                          onClick={() =>
                            setReplyOpen((p) => ({ ...p, [x.escalation_id]: true }))
                          }
                        >
                          Reply
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {data && activeNav === "directory" && (
        <section>
           <SectionHeading accent="border-l-[#0F3D2C]">Employee Directory</SectionHeading>
          {data.employees.length === 0 ? (
            <EmptyState message="No employees found." />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {data.employees.map((e) => (
                <div key={e.id} className={cn(CARD, "p-6")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={e.name} />
                      <div>
                        <p className="font-semibold text-slate-800">{e.name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {e.role_title} · {e.department}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${riskBadge(e.risk_level)}`}
                    >
                      {e.risk_level}
                    </span>
                  </div>

                  <div className="mt-4 flex gap-5">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        Leave balance
                      </p>
                      <p className="text-sm font-semibold tabular-nums text-slate-800">
                        {e.leave_balance} days
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        WFH used
                      </p>
                      <p className="text-sm font-semibold tabular-nums text-slate-800">
                        {e.wfh_used_this_month} days
                      </p>
                    </div>
                  </div>

                  {e.risk_factors.length > 0 && (
                    <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500">
                      {e.risk_factors.join("; ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {data && activeNav === "policies" && (
        <section>
           <SectionHeading accent="border-l-[#C8F169]">Policy Registry</SectionHeading>
          {data.policies.length === 0 ? (
            <EmptyState message="No policies found." />
          ) : (
            <div className={cn(CARD, "overflow-hidden")}>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="px-6 py-3 text-left text-sm font-semibold uppercase tracking-wider">
                      Clause
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold uppercase tracking-wider">
                      Document
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold uppercase tracking-wider">
                      Section
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold uppercase tracking-wider">
                      Topic
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold uppercase tracking-wider">
                      Scope
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold uppercase tracking-wider">
                      Precedence
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold uppercase tracking-wider">
                      Effective
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.policies.map((p, idx) => (
                    <tr
                      key={p.clause_id}
                      className={cn(
                        "border-b border-slate-100 py-4 transition-colors last:border-0 hover:bg-slate-50",
                        idx % 2 === 1 && "bg-slate-50/50"
                      )}
                    >
                      <td className="px-6 py-4 font-semibold text-slate-800">{p.clause_id}</td>
                      <td className="px-6 py-4 text-slate-700">{p.doc_title}</td>
                      <td className="px-6 py-4 text-slate-700">{p.section_ref}</td>
                      <td className="px-6 py-4 text-slate-700">{p.topic}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${scopeBadge(p.scope)}`}
                        >
                          {p.scope}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-700">{p.precedence}</td>
                      <td className="px-6 py-4 text-slate-700">{formatDate(p.effective_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </AppShell>
  );
};

export default HRAdminOverview;
