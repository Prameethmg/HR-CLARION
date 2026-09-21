import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Brain,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Scale,
  ShieldCheck,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getSession, saveSession, rolePath } from "@/lib/session";

interface CompanySettings {
  company_name: string;
  company_tagline: string;
  company_email: string;
  company_phone: string;
  company_address: string;
  company_website: string;
  company_logo: string | null;
}

const DEFAULT_SETTINGS: CompanySettings = {
  company_name: "NIMBUS",
  company_tagline: "Your intelligent HR policy assistant",
  company_email: "",
  company_phone: "",
  company_address: "",
  company_website: "",
  company_logo: null,
};

const FEATURES = [
  {
    key: "reasoning",
    label: "AI Policy Reasoning",
    desc: "Our AI analyzes your question against 67 company policies, citations, and precedents to give precise, policy-backed answers.",
    icon: Brain,
    tone: "bg-cyan-500/20 text-cyan-300",
  },
  {
    key: "conflict",
    label: "Conflict Resolution",
    desc: "When policies conflict, our system automatically applies precedence rules and explains which clause wins and why.",
    icon: Scale,
    tone: "bg-indigo-500/20 text-indigo-300",
  },
  {
    key: "escalation",
    label: "Secure Escalation",
    desc: "Questions the AI can't answer with confidence are automatically escalated to HR with full context preserved.",
    icon: ShieldCheck,
    tone: "bg-emerald-500/20 text-emerald-300",
  },
];

const Login = () => {
  const navigate = useNavigate();
  const session = getSession();
  const [brandingEdit, setBrandingEdit] = useState(
    () => new URLSearchParams(window.location.search).get("branding") === "1"
  );
  const [activeFeature, setActiveFeature] = useState<string | null>(null);

  const [settings, setSettings] = useState<CompanySettings>(DEFAULT_SETTINGS);
  const [draft, setDraft] = useState<CompanySettings>(DEFAULT_SETTINGS);
  const [logoFile, setLogoFile] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session && !brandingEdit) {
      navigate(rolePath(session.role), { replace: true });
    }
  }, [navigate, session, brandingEdit]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase.functions.invoke("getCompanySettings", {});
      if (cancelled) return;
      if (!error && data?.settings) {
        setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
        setDraft({ ...DEFAULT_SETTINGS, ...data.settings });
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be under 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogoFile(typeof reader.result === "string" ? reader.result : null);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveBranding = async () => {
    if (!session || saving) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("updateCompanySettings", {
        body: {
          user_id: session.id,
          company_name: draft.company_name,
          company_tagline: draft.company_tagline,
          company_email: draft.company_email,
          company_phone: draft.company_phone,
          company_address: draft.company_address,
          company_website: draft.company_website,
          company_logo: logoFile,
        },
      });
      if (error || !data?.settings) {
        toast.error("Could not save branding. Please try again.");
      } else {
        const merged = { ...DEFAULT_SETTINGS, ...data.settings };
        setSettings(merged);
        setDraft(merged);
        setLogoFile(null);
        toast.success("Branding saved.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    let data: { id?: string; role?: string } | null = null;
    let error: unknown = null;
    try {
      const res = await supabase.functions.invoke("login", {
        body: { id, password },
      });
      data = res.data as { id?: string; role?: string } | null;
      error = res.error;
    } catch (err) {
      error = err;
    }

    setLoading(false);

    if (error || !data || typeof data.id !== "string" || typeof data.role !== "string") {
      setError("Invalid ID or password");
      return;
    }

    saveSession({ id: data.id, role: data.role });
    navigate(rolePath(data.role), { replace: true });
  };

  const isHr = session?.role === "HR";
  const logo = logoFile ?? settings.company_logo;
  const activeFeatureData = FEATURES.find((f) => f.key === activeFeature);

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 font-sans">
      {/* glowing orbs */}
      <div className="pointer-events-none absolute left-0 top-0 h-96 w-96 animate-pulse rounded-full bg-blue-500/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-96 w-96 animate-pulse rounded-full bg-indigo-500/10 blur-3xl" />
      <div
        className="pointer-events-none absolute left-1/2 top-1/3 h-[28rem] w-[28rem] -translate-x-1/2 animate-pulse rounded-full bg-cyan-500/10 blur-3xl"
        style={{ animationDuration: "6s" }}
      />
      {/* subtle grid texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />

      {/* HR edit toggle (top-right) */}
      {isHr && !brandingEdit && (
        <button
          type="button"
          onClick={() => setBrandingEdit(true)}
           className="absolute right-5 top-5 z-20 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-indigo-200 backdrop-blur-md transition-colors hover:bg-white/10"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit branding
        </button>
      )}

      <div className="relative z-10 w-full max-w-6xl px-6 py-12">
        <div className="flex flex-col items-center gap-12 lg:flex-row lg:gap-16">
          {/* Left — branding */}
          <div className="flex w-full flex-col items-center text-center lg:w-1/2 lg:items-start lg:text-left">
            <div
              className="animate-in fade-in zoom-in duration-700"
              style={{ animationDelay: "0ms" }}
            >
              {logo ? (
                <img
                  src={logo}
                  alt="Company logo"
                  className="h-[160px] w-[160px] rounded-full bg-white object-contain shadow-2xl shadow-blue-500/30 transition-transform duration-300 hover:scale-105"
                  crossOrigin="anonymous"
                />
              ) : (
                <div className="flex h-[160px] w-[160px] items-center justify-center rounded-3xl border border-white/10 bg-white/5 backdrop-blur-sm transition-transform duration-300 hover:scale-105">
                  <img
                    src="/nimbus-logo.png"
                    alt="Nimbus logo"
                    className="h-[130px] w-[130px] object-contain"
                  />
                </div>
              )}
            </div>

            <h1
              className="animate-in mb-2 mt-4 text-4xl font-black text-white fade-in duration-700"
              style={{ animationDelay: "100ms" }}
            >
              {settings.company_name || "NIMBUS"}
            </h1>
            <p
              className="animate-in mb-8 text-lg italic text-blue-200 fade-in duration-700"
              style={{ animationDelay: "200ms" }}
            >
              {settings.company_tagline || "Your intelligent HR policy assistant"}
            </p>

            {/* trust stats */}
            <div
              className="mb-8 grid w-full animate-in grid-cols-3 gap-3 fade-in slide-in-from-bottom-4 duration-700"
              style={{ animationDelay: "250ms" }}
            >
              {[
                { value: "67", label: "Policy clauses" },
                { value: "<1s", label: "Clause retrieval" },
                { value: "100%", label: "Cited answers" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center backdrop-blur-md"
                >
                  <p className="bg-gradient-to-r from-white to-cyan-200 bg-clip-text text-2xl font-black text-transparent">
                    {s.value}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{s.label}</p>
                </div>
              ))}
            </div>

            {/* feature pills with dialogs */}
            <div className="w-full">
              {FEATURES.map((f, i) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setActiveFeature(f.key)}
                   className="group mb-3 flex w-full animate-in cursor-pointer items-center gap-3 rounded-full border border-white/20 bg-white/10 p-4 text-left backdrop-blur-md transition-all duration-300 hover:scale-105 hover:bg-white/20 fade-in duration-700"
                  style={{ animationDelay: `${300 + i * 100}ms` }}
                >
                  <span className={`flex h-9 w-9 items-center justify-center rounded-full ${f.tone}`}>
                    <f.icon className="h-4 w-4" />
                  </span>
                  <span className="flex-1 text-sm font-medium text-white">{f.label}</span>
                  <span className="text-xs text-indigo-300 opacity-0 transition-opacity group-hover:opacity-100">
                    Learn more →
                  </span>
                </button>
              ))}
            </div>

            {/* contact glass card */}
            {(settings.company_email || settings.company_phone || settings.company_address) && (
              <div
                className="mt-6 w-full animate-in rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl fade-in duration-700"
                style={{ animationDelay: "600ms" }}
              >
                {settings.company_email && (
                  <p className="mb-4 flex items-center gap-4 break-all text-slate-200 last:mb-0">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-300">
                      <Mail className="h-4 w-4" />
                    </span>
                    {settings.company_email}
                  </p>
                )}
                {settings.company_phone && (
                  <p className="mb-4 flex items-center gap-4 text-slate-200 last:mb-0">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500/20 text-green-300">
                      <Phone className="h-4 w-4" />
                    </span>
                    {settings.company_phone}
                  </p>
                )}
                {settings.company_address && (
                  <p className="flex items-center gap-4 text-slate-200 last:mb-0">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-red-300">
                      <MapPin className="h-4 w-4" />
                    </span>
                    {settings.company_address}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Right — sign-in form */}
          <div className="flex w-full justify-center lg:w-1/2">
            <div className="w-full max-w-md animate-in rounded-3xl bg-white p-10 shadow-2xl fade-in slide-in-from-right-4 duration-700 lg:max-w-md"
              style={{ animationDelay: "150ms" }}
            >
              <h2 className="mb-2 text-3xl font-extrabold tracking-tight text-slate-800">Sign In</h2>
              <p className="mb-6 text-slate-500">Use your employee ID and password</p>

              {/* demo role quick-fill */}
              <div className="mb-6">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Quick demo sign-in
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "Employee", id: "EMP001" },
                    { label: "Manager", id: "MGR001" },
                    { label: "HR", id: "HR001" },
                  ].map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setId(r.id);
                        setPassword("password123");
                      }}
                      className="rounded-full border-2 border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-600 transition-all hover:-translate-y-0.5 hover:border-indigo-500 hover:bg-indigo-50 hover:text-indigo-700"
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="relative mb-6">
                  <label htmlFor="id" className="mb-2 block text-sm font-semibold text-slate-700">
                    Employee ID
                  </label>
                  <User className="absolute left-4 top-11 h-4 w-4 text-slate-400" />
                  <Input
                    id="id"
                    value={id}
                    onChange={(e) => setId(e.target.value)}
                    placeholder="e.g. EMP001"
                    autoComplete="username"
                    required
                    className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 py-3.5 pl-12 text-slate-900 outline-none transition-all duration-300 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                  />
                </div>

                <div className="relative mb-6">
                  <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-700">
                    Password
                  </label>
                  <Lock className="absolute left-4 top-11 h-4 w-4 text-slate-400" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 py-3.5 pl-12 pr-10 text-slate-900 outline-none transition-all duration-300 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-11 text-slate-400 transition-colors hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {error && (
                  <div className="mb-6 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 text-lg font-bold text-white shadow-lg shadow-blue-500/25 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/40 active:translate-y-0 active:scale-[0.98]"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign In"}
                </Button>
              </form>

              {/* role-bar area (kept as-is: divider + Edit branding for HR) */}
              <div className="mt-8 rounded-xl border border-slate-200 bg-slate-100 p-4">
                <p className="text-center text-xs text-slate-500">
                  {settings.company_name || "NIMBUS"} · Employee Policy Desk
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* feature info dialog */}
      <Dialog open={!!activeFeatureData} onOpenChange={(o) => !o && setActiveFeature(null)}>
        <DialogContent className="border-slate-200 bg-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800">
              {activeFeatureData && (
                <>
                  <span className={`flex h-9 w-9 items-center justify-center rounded-full ${activeFeatureData.tone}`}>
                    <activeFeatureData.icon className="h-4 w-4" />
                  </span>
                  {activeFeatureData.label}
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-relaxed text-slate-600">{activeFeatureData?.desc}</p>
        </DialogContent>
      </Dialog>

      {/* HR edit panel */}
      {isHr && brandingEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">Edit branding</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBrandingEdit(false)}
                className="rounded-full"
              >
                <X className="mr-1 h-3.5 w-3.5" /> Close
              </Button>
            </div>

            <div className="space-y-4 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-6">
              <div className="space-y-1.5">
                <Label htmlFor="brand-logo" className="text-slate-700">
                  Company logo (PNG, JPG, SVG)
                </Label>
                <label
                  htmlFor="brand-logo"
                  className="flex h-32 w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/50 text-sm text-blue-600 transition-colors hover:bg-blue-50"
                >
                  Click to upload (max 2 MB)
                </label>
                <input
                  id="brand-logo"
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  onChange={handleLogoFile}
                  className="hidden"
                />
                {logoFile && (
                  <img
                    src={logoFile}
                    alt="Logo preview"
                    className="mt-2 h-16 w-16 rounded-lg border border-slate-200 object-contain"
                  />
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brand-name" className="text-slate-700">
                  Company name
                </Label>
                <Input
                  id="brand-name"
                  value={draft.company_name}
                  onChange={(e) => setDraft((d) => ({ ...d, company_name: e.target.value }))}
                  className="rounded-xl border-2 border-slate-200 bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brand-tagline" className="text-slate-700">
                  Tagline / description
                </Label>
                <Input
                  id="brand-tagline"
                  value={draft.company_tagline}
                  onChange={(e) => setDraft((d) => ({ ...d, company_tagline: e.target.value }))}
                  className="rounded-xl border-2 border-slate-200 bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brand-website" className="text-slate-700">
                  Website URL
                </Label>
                <Input
                  id="brand-website"
                  value={draft.company_website}
                  onChange={(e) => setDraft((d) => ({ ...d, company_website: e.target.value }))}
                  className="rounded-xl border-2 border-slate-200 bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brand-email" className="text-slate-700">
                  Email
                </Label>
                <Input
                  id="brand-email"
                  type="email"
                  value={draft.company_email}
                  onChange={(e) => setDraft((d) => ({ ...d, company_email: e.target.value }))}
                  className="rounded-xl border-2 border-slate-200 bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brand-phone" className="text-slate-700">
                  Phone
                </Label>
                <Input
                  id="brand-phone"
                  value={draft.company_phone}
                  onChange={(e) => setDraft((d) => ({ ...d, company_phone: e.target.value }))}
                  className="rounded-xl border-2 border-slate-200 bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brand-address" className="text-slate-700">
                  Address
                </Label>
                <Textarea
                  id="brand-address"
                  value={draft.company_address}
                  onChange={(e) => setDraft((d) => ({ ...d, company_address: e.target.value }))}
                  rows={2}
                  className="rounded-xl border-2 border-slate-200 bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>
              <Button
                onClick={handleSaveBranding}
                disabled={saving}
                className="w-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 py-3 font-semibold text-white shadow-lg transition-colors"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save branding"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* footer */}
      <p className="absolute bottom-5 left-0 right-0 z-10 text-center text-sm text-slate-400">
        © 2025 {settings.company_name || "NIMBUS"} - Team GASP
      </p>
    </div>
  );
};

export default Login;
