import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, LifeBuoy, Search, ShieldAlert, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSession, rolePath } from "@/lib/session";
import { cn } from "@/lib/utils";
import AppShell from "@/components/AppShell";

interface SpeakupReport {
  id: string;
  report_token: string;
  category: string;
  incident_text: string;
  incident_period: string | null;
  location: string | null;
  wants_followup: boolean;
  has_contact: boolean;
  status: string;
  created_at: string;
  updated_at: string;
}

const formatDate = (value: string | null | undefined): string =>
  value ? value.slice(0, 10) : "—";

const statusPill = (status: string): string => {
  switch (status) {
    case "SUBMITTED":
      return "bg-amber-100 text-amber-800 border border-amber-200";
    case "UNDER_REVIEW":
      return "bg-indigo-100 text-indigo-800 border border-indigo-200";
    case "CLOSED":
      return "bg-emerald-100 text-emerald-800 border border-emerald-200";
    default:
      return "bg-slate-100 text-slate-700 border border-slate-200";
  }
};

const HRSpeakup = () => {
  const navigate = useNavigate();
  const session = getSession();

  const [rows, setRows] = useState<SpeakupReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!session) return;
    if (session.role !== "HR") {
      navigate(rolePath(session.role), { replace: true });
      return;
    }
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase.functions.invoke("getSpeakupReports", {
        body: { user_id: session.id },
      });
      if (cancelled) return;
      if (error || !data?.reports) {
        setError("Could not load speak-up reports.");
      } else {
        setRows(data.reports);
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

  const filtered = rows
    ? rows.filter((r) =>
        `${r.category} ${r.incident_text} ${r.report_token} ${r.status}`
          .toLowerCase()
          .includes(search.trim().toLowerCase())
      )
    : null;

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
  const openReports = rows?.filter((r) => r.status !== "CLOSED").length ?? 0;
  const stats = [
    { icon: ShieldAlert, label: "Open", value: String(openReports), tone: "amber" as const },
    { icon: LifeBuoy, label: "Total", value: String(rows?.length ?? 0), tone: "indigo" as const },
  ];

  return (
    <AppShell
      nav={nav}
      activeNav="speakup"
      onNav={(id) => navigate(HR_ROUTES[id] ?? "/hr")}
      stats={stats}
      variant="premium"
      subtitle="HR Admin Desk"
      roleBadgeClass="border-purple-500/30 bg-purple-500/20 text-purple-300"
    >
      <div className="mb-6">
        <p className="mb-2 text-sm font-medium text-[#0F3D2C]/60">
          HR Admin &gt; <span className="text-[#0F3D2C]">Speak-Up Reports</span>
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-3xl font-extrabold tracking-tight text-[#0F3D2C]">
            Speak-Up Reports
          </h2>
          <Link
            to="/hr"
            className="flex items-center gap-1 rounded-full border border-[#0F3D2C]/20 bg-white px-4 py-2 text-sm text-[#0F3D2C] transition-all hover:bg-[#0F3D2C] hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
          </Link>
        </div>
      </div>

      <div className="mb-6 flex items-center gap-4 rounded-2xl border border-[#0F3D2C]/10 bg-white p-4 shadow-sm">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0F3D2C]/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search category, text, token, status…"
            className="w-full rounded-full border border-[#0F3D2C]/20 bg-[#F7F5EF] px-4 py-2 pl-10 text-slate-900 outline-none transition-all focus:border-[#0F3D2C] focus:ring-2 focus:ring-[#0F3D2C]/20"
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
          No speak-up reports found.
        </div>
      )}

      {filtered && filtered.length > 0 && (
        <div className="space-y-4">
          {filtered.map((r) => (
            <div
              key={r.id}
              className="rounded-2xl border border-[#0F3D2C]/10 bg-white p-6 shadow-sm transition-shadow duration-300 hover:shadow-lg"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-bold text-[#0F3D2C]">{r.category}</p>
                  <p className="mt-0.5 font-mono text-xs text-slate-500">#{r.report_token}</p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-bold",
                    statusPill(r.status)
                  )}
                >
                  {r.status}
                </span>
              </div>
              <p className="mt-3 text-sm text-[#0F3D2C]/70">{r.incident_text}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                {r.incident_period && <span>When: {r.incident_period}</span>}
                {r.location && <span>Where: {r.location}</span>}
                <span>Submitted: {formatDate(r.created_at)}</span>
                <span>Updated: {formatDate(r.updated_at)}</span>
                {r.has_contact && (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                    Contact on file
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
};

export default HRSpeakup;
