import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, LifeBuoy, Search, ShieldAlert, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { getSession, rolePath } from "@/lib/session";
import { cn } from "@/lib/utils";
import AppShell from "@/components/AppShell";
import Avatar from "@/components/Avatar";

interface EmployeeRow {
  id: string;
  name: string;
  department: string;
  role_title: string;
  manager_id: string | null;
  leave_balance: number;
  wfh_used_this_month: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  risk_factors: string[];
}

const riskPill = (level: "LOW" | "MEDIUM" | "HIGH"): string => {
  switch (level) {
    case "LOW":
      return "bg-green-100 text-green-700";
    case "MEDIUM":
      return "bg-amber-100 text-amber-700";
    case "HIGH":
      return "bg-red-100 text-red-700";
  }
};

const HRDirectory = () => {
  const navigate = useNavigate();
  const session = getSession();

  const [rows, setRows] = useState<EmployeeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"name" | "department" | "risk">("name");

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
      if (error || !data?.employees) {
        setError("Could not load employees.");
      } else {
        setRows(data.employees);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [session, navigate]);

  const filtered = useMemo(() => {
    if (!rows) return null;
    let list = rows;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        `${r.name} ${r.id} ${r.department}`.toLowerCase().includes(q)
      );
    }
    const sorted = [...list];
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "department") sorted.sort((a, b) => a.department.localeCompare(b.department));
    else sorted.sort((a, b) => a.risk_level.localeCompare(b.risk_level));
    return sorted;
  }, [rows, search, sort]);

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
  const highRisk = rows?.filter((r) => r.risk_level === "HIGH").length ?? 0;
  const stats = [
    { icon: Users, label: "Employees", value: String(rows?.length ?? 0), tone: "indigo" as const },
    { icon: ShieldAlert, label: "High risk", value: String(highRisk), tone: "amber" as const },
  ];

  return (
    <AppShell
      nav={nav}
      activeNav="directory"
      onNav={(id) => navigate(HR_ROUTES[id] ?? "/hr")}
      stats={stats}
      variant="premium"
      subtitle="HR Admin Desk"
      roleBadgeClass="border-purple-500/30 bg-purple-500/20 text-purple-300"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-500">
          HR Admin &gt; <span className="text-slate-800">Employees</span>
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
            placeholder="Search name or ID…"
            className="rounded-full border-2 border-slate-200 pl-9 focus-visible:ring-2 focus-visible:ring-[#0F3D2C]"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="rounded-full border-2 border-slate-200 bg-white px-4 py-2 text-sm focus:ring-[#0F3D2C]"
        >
          <option value="name">Sort: Name</option>
          <option value="department">Sort: Department</option>
          <option value="risk">Sort: Risk level</option>
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
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-200/60" />
          ))}
        </div>
      )}

      {filtered && filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
          No employees match.
        </div>
      )}

      {filtered && filtered.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/50">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="px-6 py-3 text-left text-sm font-semibold uppercase tracking-wider">Employee</th>
                <th className="px-6 py-3 text-left text-sm font-semibold uppercase tracking-wider">ID</th>
                <th className="px-6 py-3 text-left text-sm font-semibold uppercase tracking-wider">Department</th>
                <th className="px-6 py-3 text-left text-sm font-semibold uppercase tracking-wider">Leave</th>
                <th className="px-6 py-3 text-left text-sm font-semibold uppercase tracking-wider">WFH used</th>
                <th className="px-6 py-3 text-left text-sm font-semibold uppercase tracking-wider">Risk</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 py-4 transition-colors last:border-0 hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={e.name} />
                      <span className="font-medium text-slate-800">{e.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{e.id}</td>
                  <td className="px-6 py-4 text-slate-700">{e.department}</td>
                  <td className="px-6 py-4 text-slate-700">{e.leave_balance}</td>
                  <td className="px-6 py-4 text-slate-700">{e.wfh_used_this_month}</td>
                  <td className="px-6 py-4">
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", riskPill(e.risk_level))}>
                      {e.risk_level}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
};

export default HRDirectory;
