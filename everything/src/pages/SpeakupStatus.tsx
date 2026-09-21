import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  Calendar,
  ClipboardList,
  Home,
  Loader2,
  MessageSquare,
  Search,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSession } from "@/lib/session";
import AppShell from "@/components/AppShell";

const fieldClass =
  "w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 font-mono text-slate-900 outline-none transition-all duration-300 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10";

const formatUpdated = (value: string): string => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const statusPill = (status: string): string =>
  status === "OPEN"
    ? "bg-amber-100 text-amber-800 border border-amber-200"
    : "bg-emerald-100 text-emerald-800 border border-emerald-200";

const SpeakupStatus = () => {
  const navigate = useNavigate();
  const session = getSession();

  const [token, setToken] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ status: string; updated_at: string } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);
  const [balances, setBalances] = useState<{ leave: number; wfh: number } | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase.functions.invoke("getPolicyContext", {
        body: { employee_id: session.id, topic: "WFH" },
      });
      if (!cancelled && !error && data?.employee) {
        setBalances({
          leave: data.employee.leave_balance,
          wfh: data.employee.wfh_used_this_month,
        });
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = token.trim();
    if (!value || checking) return;
    setChecking(true);
    setResult(null);
    setNotFound(false);
    setError(false);
    try {
      const { data, error } = await supabase.functions.invoke("getSpeakupStatus", {
        body: { report_token: value },
      });
      if (error || !data?.status) {
        // One generic message — never confirms or denies whether a token exists.
        setNotFound(true);
      } else {
        setResult({ status: data.status, updated_at: data.updated_at });
      }
    } catch {
      setError(true);
    } finally {
      setChecking(false);
    }
  };

  const handleNav = (id: string) => {
    if (id === "concern") return;
    navigate("/employee");
  };

  const nav = [
    { id: "chat", label: "Chat", icon: MessageSquare },
    { id: "requests", label: "My Requests", icon: ClipboardList },
    { id: "concern", label: "Report a Concern", icon: AlertCircle },
  ];
  const stats = balances
    ? [
        { icon: Calendar, label: "Leave balance", value: `${balances.leave}`, tone: "emerald" as const },
        { icon: Home, label: "WFH used", value: `${balances.wfh}`, tone: "amber" as const },
      ]
    : [];

  return (
    <AppShell nav={nav} activeNav="concern" onNav={handleNav} stats={stats} variant="premium">
      <div className="mx-auto max-w-2xl animate-in space-y-6 fade-in slide-in-from-bottom-4 duration-700">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Check a report</h1>
          <p className="mt-1 text-slate-500">
            Enter the token you received when you submitted your report.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60"
        >
          <div className="space-y-2">
            <Label htmlFor="speakup-status-token" className="mb-2 block text-sm font-semibold text-slate-700">
              Report token
            </Label>
            <Input
              id="speakup-status-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Your 12-character token"
              className={fieldClass}
            />
          </div>

          {error && (
            <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              Something went wrong. Please try again.
            </div>
          )}

          <Button
            type="submit"
            disabled={checking || !token.trim()}
            className="mt-6 w-full rounded-full bg-gradient-to-r from-indigo-600 to-cyan-600 py-4 text-lg font-bold text-white shadow-lg shadow-indigo-500/25 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {checking ? <Loader2 className="h-5 w-5 animate-spin" /> : "Check status"}
          </Button>
        </form>

        {result && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">Status</p>
                <span
                  className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-bold ${statusPill(result.status)}`}
                >
                  {result.status}
                </span>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-500">Last updated</p>
                <p className="mt-1 text-sm text-slate-700">{formatUpdated(result.updated_at)}</p>
              </div>
            </div>
          </div>
        )}

        {notFound && (
          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6">
            <Search className="h-5 w-5 shrink-0 text-slate-400" />
            <p className="text-sm text-slate-600">
              We could not find a report with that token.
            </p>
          </div>
        )}

        <p className="text-sm text-slate-500">
          Want to submit a new report?{" "}
          <Link to="/speakup" className="font-semibold text-indigo-600 underline underline-offset-2">
            Speak up
          </Link>
        </p>
      </div>
    </AppShell>
  );
};

export default SpeakupStatus;
