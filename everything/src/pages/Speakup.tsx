import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Home,
  Loader2,
  Lock,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import AppShell from "@/components/AppShell";

const CATEGORIES = ["HARASSMENT", "DISCRIMINATION", "RETALIATION", "SAFETY", "OTHER"];

const fieldClass =
  "w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition-all duration-300 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10";

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

const Speakup = () => {
  const navigate = useNavigate();
  const session = getSession();

  const [category, setCategory] = useState("");
  const [incidentText, setIncidentText] = useState("");
  const [period, setPeriod] = useState("");
  const [location, setLocation] = useState("");
  const [wantsFollowup, setWantsFollowup] = useState(false);
  const [contactNote, setContactNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [balances, setBalances] = useState<{ leave: number; wfh: number } | null>(null);
  const [checkToken, setCheckToken] = useState("");
  const [checkLoading, setCheckLoading] = useState(false);
  const [checkResult, setCheckResult] = useState<{ status: string; updated_at: string } | null>(null);
  const [checkNotFound, setCheckNotFound] = useState(false);

  const checkStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = checkToken.trim();
    if (!value || checkLoading) return;
    setCheckLoading(true);
    setCheckResult(null);
    setCheckNotFound(false);
    try {
      const { data, error } = await supabase.functions.invoke("getSpeakupStatus", {
        body: { report_token: value },
      });
      if (error || !data?.status) {
        setCheckNotFound(true);
      } else {
        setCheckResult({ status: data.status, updated_at: data.updated_at });
      }
    } finally {
      setCheckLoading(false);
    }
  };

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
    if (!category || !incidentText.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("submitSpeakupReport", {
        body: {
          category,
          incident_text: incidentText,
          incident_period: period.trim(),
          location: location.trim(),
          wants_followup: wantsFollowup,
          contact_note: wantsFollowup ? contactNote.trim() : undefined,
        },
      });
      if (error || !data?.report_token) {
        setError("Your report could not be submitted. Please try again.");
      } else {
        setToken(data.report_token);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      setCopied(false);
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

  const content = token ? (
    <div className="mx-auto max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col items-center rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-xl shadow-slate-200/60">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/25">
          <CheckCircle2 className="h-10 w-10" />
        </div>
        <h1 className="mt-6 text-2xl font-extrabold tracking-tight text-slate-900">Report submitted</h1>
        <p className="mt-2 text-sm text-slate-500">
          Keep this reference safe — it is the only way to check your report&apos;s status.
        </p>
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <code className="flex-1 break-all font-mono text-lg text-slate-900">{token}</code>
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 rounded-full border border-slate-300 px-4 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-100"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            to="/speakup/status"
            className="rounded-full bg-gradient-to-r from-indigo-600 to-cyan-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition-all hover:-translate-y-0.5 hover:shadow-xl"
          >
            View status
          </Link>
          <Link
            to="/employee"
            className="rounded-full border-2 border-slate-200 px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-indigo-500 hover:text-indigo-600"
          >
            Back to Chat
          </Link>
        </div>
      </div>
    </div>
  ) : (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-cyan-600 text-white shadow-lg shadow-indigo-500/25">
          <ShieldCheck className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900">
          Speak up — confidential reporting
        </h1>
        <p className="mt-1 text-slate-500">
          Report a concern in confidence. This is handled with care and discretion.
        </p>
      </div>

      <div className="flex animate-in items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: "100ms" }}>
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
        <p className="text-sm text-indigo-900">
          This report goes to the Internal Committee (HR) only. It is not visible to your manager,
          and it is not read by the AI.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="animate-in rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60 fade-in slide-in-from-bottom-4 duration-700"
        style={{ animationDelay: "200ms" }}
      >
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="speakup-category" className="mb-2 block text-sm font-semibold text-slate-700">
              Category
            </Label>
            <select
              id="speakup-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
              className={fieldClass}
            >
              <option value="" disabled>
                Select a category
              </option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="speakup-incident" className="mb-2 block text-sm font-semibold text-slate-700">
              What happened
            </Label>
            <Textarea
              id="speakup-incident"
              value={incidentText}
              onChange={(e) => setIncidentText(e.target.value)}
              rows={5}
              required
              placeholder="Describe what happened, as clearly as you are comfortable with."
              className={`${fieldClass} min-h-[140px]`}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="speakup-period" className="mb-2 block text-sm font-semibold text-slate-700">
              Roughly when
            </Label>
            <Input
              id="speakup-period"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="e.g. March 2026"
              className={fieldClass}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="speakup-location" className="mb-2 block text-sm font-semibold text-slate-700">
              Where <span className="font-normal text-slate-400">(optional)</span>
            </Label>
            <Input
              id="speakup-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Main office, floor 3"
              className={fieldClass}
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-start gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={wantsFollowup}
                onChange={(e) => setWantsFollowup(e.target.checked)}
                className="mt-0.5 h-5 w-5 accent-indigo-600"
              />
              <span>I want the Internal Committee to be able to contact me</span>
            </label>
            {wantsFollowup && (
              <div className="space-y-2 pt-1">
                <Label htmlFor="speakup-contact" className="mb-2 block text-sm font-semibold text-slate-700">
                  How to reach you (optional)
                </Label>
                <Input
                  id="speakup-contact"
                  value={contactNote}
                  onChange={(e) => setContactNote(e.target.value)}
                  placeholder="Email, phone, or another way to reach you"
                  className={fieldClass}
                />
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <Button
            type="submit"
            disabled={submitting || !category || !incidentText.trim()}
            className="w-full rounded-full bg-gradient-to-r from-indigo-600 to-cyan-600 py-4 text-lg font-bold text-white shadow-lg shadow-indigo-500/25 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Submit report"}
          </Button>
        </div>
      </form>

      <div className="flex animate-in items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: "300ms" }}>
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <p className="text-sm text-amber-800">
          If you are in immediate danger, contact your local emergency services rather than using
          this form.
        </p>
      </div>

      <div className="animate-in rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60 fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: "400ms" }}>
        <h2 className="text-xl font-extrabold tracking-tight text-slate-900">
          Check a report status
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Paste your report token to see its status.
        </p>
        <form onSubmit={checkStatus} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Input
            value={checkToken}
            onChange={(e) => setCheckToken(e.target.value)}
            placeholder="Paste your token here"
            className={cn(fieldClass, "font-mono")}
          />
          <Button
            type="submit"
            disabled={checkLoading || !checkToken.trim()}
            className="shrink-0 rounded-full bg-gradient-to-r from-indigo-600 to-cyan-600 px-6 py-3 font-bold text-white shadow-lg shadow-indigo-500/25 transition-all hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
          >
            {checkLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check status"}
          </Button>
        </form>
        {checkResult && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <span
              className={cn(
                "inline-block rounded-full px-3 py-1 text-xs font-bold",
                checkResult.status === "CLOSED"
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                  : checkResult.status === "UNDER_REVIEW"
                    ? "bg-indigo-100 text-indigo-800 border border-indigo-200"
                    : "bg-amber-100 text-amber-800 border border-amber-200"
              )}
            >
              {checkResult.status}
            </span>
            <p className="mt-2 text-xs text-slate-500">
              Last updated: {formatUpdated(checkResult.updated_at)}
            </p>
          </div>
        )}
        {checkNotFound && (
          <p className="mt-3 text-sm text-slate-500">
            We could not find a report with that token.
          </p>
        )}
      </div>
    </div>
  );

  return (
    <AppShell nav={nav} activeNav="concern" onNav={handleNav} stats={stats} variant="premium">
      {content}
    </AppShell>
  );
};

export default Speakup;
