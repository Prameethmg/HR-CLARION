import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, LifeBuoy, Search, ShieldAlert, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { getSession, rolePath } from "@/lib/session";
import { cn } from "@/lib/utils";
import AppShell from "@/components/AppShell";

interface PolicyRow {
  clause_id: string;
  doc_title: string;
  section_ref: string;
  topic: string;
  scope: string;
  precedence: number;
  effective_date: string | null;
  clause_text: string;
}

const scopeBadge = (scope: string): string =>
  scope === "COMPANY" ? "bg-[#8FA88A] text-[#1A1A1A]" : "bg-[#F7F5EF] text-[#1A1A1A]";

const HRPolicies = () => {
  const navigate = useNavigate();
  const session = getSession();

  const [rows, setRows] = useState<PolicyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

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
      if (error || !data?.policies) {
        setError("Could not load policies.");
      } else {
        setRows(data.policies);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [session, navigate]);

  const topics = useMemo(
    () => ["ALL", ...Array.from(new Set((rows ?? []).map((p) => p.topic))).sort()],
    [rows]
  );

  const filtered = useMemo(() => {
    if (!rows) return null;
    let list = rows;
    if (topic !== "ALL") list = list.filter((p) => p.topic === topic);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((p) =>
        `${p.clause_id} ${p.clause_text} ${p.doc_title}`.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => a.clause_id.localeCompare(b.clause_id));
  }, [rows, topic, search]);

  if (!session) {
    return <Navigate to="/login" replace />;
  }
  if (session.role !== "HR") {
    return <Navigate to={rolePath(session.role)} replace />;
  }

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
  const stats = [
    { icon: BookOpen, label: "Clauses", value: String(rows?.length ?? 0), tone: "emerald" as const },
    { icon: Search, label: "Topics", value: String(Math.max(topics.length - 1, 0)), tone: "indigo" as const },
  ];

  return (
    <AppShell
      nav={nav}
      activeNav="policies"
      onNav={(id) => navigate(HR_ROUTES[id] ?? "/hr")}
      stats={stats}
      variant="premium"
      subtitle="HR Admin Desk"
      roleBadgeClass="border-purple-500/30 bg-purple-500/20 text-purple-300"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-500">
          HR Admin &gt; <span className="text-slate-800">Policies</span>
        </div>
        <Link
          to="/hr"
          className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clause text or ID…"
            className="rounded-full border-2 border-slate-200 pl-9 focus-visible:ring-2 focus-visible:ring-[#0F3D2C]"
          />
        </div>
        <select
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="rounded-full border-2 border-slate-200 bg-white px-4 py-2 text-sm focus:ring-[#0F3D2C]"
        >
          {topics.map((t) => (
            <option key={t} value={t}>
              {t === "ALL" ? "All topics" : t}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {!rows && !error && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl bg-slate-200/60" />
          ))}
        </div>
      )}

      {filtered && filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
          No policies match.
        </div>
      )}

      {filtered && filtered.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/50">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="px-6 py-3 text-left text-sm font-semibold uppercase tracking-wider">Clause</th>
                <th className="px-6 py-3 text-left text-sm font-semibold uppercase tracking-wider">Topic</th>
                <th className="px-6 py-3 text-left text-sm font-semibold uppercase tracking-wider">Section</th>
                <th className="px-6 py-3 text-left text-sm font-semibold uppercase tracking-wider">Scope</th>
                <th className="px-6 py-3 text-left text-sm font-semibold uppercase tracking-wider">Precedence</th>
                <th className="px-6 py-3 text-left text-sm font-semibold uppercase tracking-wider">Clause text</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const isOpen = expanded === p.clause_id;
                const text = p.clause_text ?? "";
                return (
                  <tr
                    key={p.clause_id}
                    className="border-b border-slate-100 py-4 align-top transition-colors last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-6 py-4 font-semibold text-slate-800">{p.clause_id}</td>
                    <td className="px-6 py-4 text-slate-700">{p.topic}</td>
                    <td className="px-6 py-4 text-slate-700">{p.section_ref}</td>
                    <td className="px-6 py-4">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", scopeBadge(p.scope))}>
                        {p.scope}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-700">{p.precedence}</td>
                    <td className="max-w-md px-6 py-4 text-slate-600">
                      <p className={isOpen ? "" : "line-clamp-2"}>{text}</p>
                      {text.length > 120 && (
                        <button
                          onClick={() => setExpanded(isOpen ? null : p.clause_id)}
                          className="mt-1 text-xs font-medium text-[#0F3D2C] underline underline-offset-2"
                        >
                          {isOpen ? "View less" : "View more"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
};

export default HRPolicies;
