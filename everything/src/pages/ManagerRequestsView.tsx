import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Eye,
  Inbox,
  List,
  Loader2,
  Search,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getSession, rolePath } from "@/lib/session";
import { cn } from "@/lib/utils";
import AppShell from "@/components/AppShell";
import Avatar from "@/components/Avatar";

interface RequestRow {
  request_id: string;
  employee_id: string;
  employee_name: string;
  request_type: string;
  details: string;
  reason: string;
  status: string;
  manager_id: string | null;
  decided_by: string | null;
  decided_at: string | null;
  reasoning_snapshot: string | null;
  citations: string | null;
}

const PAGE_SIZE = 10;

const statusBadgeClass = (status: string): string => {
  switch (status) {
    case "PENDING":
      return "border border-amber-200 bg-amber-100 text-amber-800";
    case "APPROVED":
      return "border border-emerald-200 bg-emerald-100 text-emerald-800";
    case "REJECTED":
      return "border border-red-200 bg-red-100 text-red-800";
    default:
      return "border border-slate-200 bg-slate-100 text-slate-700";
  }
};

const formatDate = (value: string | null | undefined): string =>
  value ? value.slice(0, 10) : "—";

interface ManagerRequestsViewProps {
  status: "all" | "pending" | "approved" | "rejected";
  title: string;
}

const ManagerRequestsView = ({ status, title }: ManagerRequestsViewProps) => {
  const navigate = useNavigate();
  const session = getSession();

  const [requests, setRequests] = useState<RequestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"decision" | "name" | "status">("decision");
  const [page, setPage] = useState(1);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<RequestRow | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("getManagerRequests", {
      body: { manager_id: session?.id },
    });
    if (error || !data?.requests) {
      setError("Could not load requests.");
    } else {
      setRequests(data.requests);
      setError(null);
    }
  }, [session?.id]);

  useEffect(() => {
    if (!session) return;
    if (session.role !== "MANAGER") {
      navigate(rolePath(session.role), { replace: true });
      return;
    }
    load();
  }, [session, navigate, load]);

  const filtered = useMemo(() => {
    if (!requests) return null;
    // DB stores UPPERCASE statuses; map the route prop accordingly.
    const statusFilter = status === "all" ? null : status.toUpperCase();
    let rows = requests.filter((r) =>
      statusFilter ? r.status === statusFilter : true
    );
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) =>
        [r.employee_name, r.request_type, r.details, r.reason, r.citations ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }
    const sorted = [...rows];
    if (sort === "decision") {
      sorted.sort((a, b) => (b.decided_at ?? "").localeCompare(a.decided_at ?? ""));
    } else if (sort === "name") {
      sorted.sort((a, b) => a.employee_name.localeCompare(b.employee_name));
    } else {
      sorted.sort((a, b) => a.status.localeCompare(b.status));
    }
    return sorted;
  }, [requests, status, search, sort]);

  const totalPages = filtered ? Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)) : 1;
  const pageRows = filtered?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) ?? [];

  useEffect(() => {
    setPage(1);
  }, [search, status]);

  if (!session) {
    return <Navigate to="/login" replace />;
  }
  if (session.role !== "MANAGER") {
    return <Navigate to={rolePath(session.role)} replace />;
  }

  const decide = async (requestId: string, decision: "APPROVED" | "REJECTED") => {
    if (!window.confirm(`${decision === "APPROVED" ? "Approve" : "Reject"} this request?`)) return;
    if (pendingId) return;
    setPendingId(requestId);
    try {
      const { error } = await supabase.functions.invoke("decideRequest", {
        body: { request_id: requestId, decision, decided_by: session.id },
      });
      if (error) {
        toast.error("Could not update the request. Please try again.");
      } else {
        toast.success(`Request ${decision.toLowerCase()}.`);
        await load();
      }
    } finally {
      setPendingId(null);
    }
  };

  const exportCsv = () => {
    if (!filtered) return;
    const header = ["Employee", "Type", "Decision date", "Status", "Policy Reference", "Reason"];
    const lines = filtered.map((r) =>
      [
        r.employee_name,
        r.request_type,
        formatDate(r.decided_at),
        r.status,
        r.citations ?? "",
        (r.reason ?? "").replace(/"/g, '""'),
      ]
        .map((v) => `"${v}"`)
        .join(",")
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const today = new Date().toISOString().slice(0, 10);
    a.download = `${status}_requests_${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const nav = [
    { id: "queue", label: "Approval Queue", icon: Inbox },
    { id: "team", label: "Team Requests", icon: Users },
  ];
  const stats = [
    { icon: List, label: "Total requests", value: String(requests?.length ?? 0), to: "/manager/requests/all" },
    { icon: Clock, label: "Pending", value: String(requests?.filter((r) => r.status === "PENDING").length ?? 0), to: "/manager/requests/pending" },
    { icon: CheckCircle2, label: "Approved", value: String(requests?.filter((r) => r.status === "APPROVED").length ?? 0), to: "/manager/requests/approved" },
    { icon: XCircle, label: "Rejected", value: String(requests?.filter((r) => r.status === "REJECTED").length ?? 0), to: "/manager/requests/rejected" },
  ];

  return (
    <AppShell nav={nav} activeNav="queue" onNav={() => navigate("/manager")} stats={stats} variant="premium" subtitle="Manager Policy Desk">
      <div className="mb-6">
        <p className="mb-2 text-sm font-medium text-[#0F3D2C]/60">
          Home &gt; Manager &gt; <span className="text-[#0F3D2C]">{title}</span>
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-3xl font-extrabold tracking-tight text-[#0F3D2C]">{title}</h2>
          <Link
            to="/manager"
            className="flex items-center gap-1 rounded-full border border-[#0F3D2C]/20 bg-white px-4 py-2 text-sm text-[#0F3D2C] transition-all hover:bg-[#0F3D2C] hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
          </Link>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-[#0F3D2C]/10 bg-white p-4 shadow-sm">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0F3D2C]/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee, type, details, reason…"
            className="rounded-full border border-[#0F3D2C]/20 bg-[#F7F5EF] py-2 pl-10 outline-none transition-all focus:border-[#0F3D2C] focus-visible:ring-2 focus-visible:ring-[#0F3D2C]/20"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="rounded-full border border-[#0F3D2C]/20 bg-[#F7F5EF] px-4 py-2 text-sm focus:ring-[#0F3D2C]"
        >
          <option value="decision">Sort: Decision date</option>
          <option value="name">Sort: Employee name</option>
          <option value="status">Sort: Status</option>
        </select>
        <Button
          variant="outline"
          size="sm"
          onClick={exportCsv}
          disabled={!filtered || filtered.length === 0}
          className="rounded-full bg-[#C8F169] px-4 py-2 font-semibold text-[#0F3D2C] shadow-md transition-transform hover:scale-105"
        >
          <Download className="mr-1 h-3.5 w-3.5" /> Export CSV
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-[#E8C4B8] bg-[#F9E9E2] px-3 py-2 text-sm text-[#9A4A35]">
          {error}
        </div>
      )}

      {!requests && !error && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-[#8FA88A]/50" />
          ))}
        </div>
      )}

      {requests && requests.length === 0 && (
        <div className="rounded-xl border border-dashed border-[#E9E2D6] bg-[#F7F5EF] px-6 py-10 text-center text-sm text-[#6B6B6B]">
          No requests assigned to you.
        </div>
      )}

      {requests && requests.length > 0 && filtered && filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-[#E9E2D6] bg-[#F7F5EF] px-6 py-10 text-center text-sm text-[#6B6B6B]">
          No {status} requests match your filters.
        </div>
      )}

      {pageRows.length > 0 && (
        <div className="space-y-3">
          {pageRows.map((r) => (
            <div key={r.request_id} className="mb-4 rounded-2xl border border-[#0F3D2C]/10 bg-white p-6 shadow-sm transition-shadow duration-300 hover:shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar name={r.employee_name} />
                  <div>
                    <p className="text-xl font-bold text-[#0F3D2C]">{r.employee_name}</p>
                    <p className="text-xs uppercase tracking-wide text-[#0F3D2C]/70">{r.request_type}</p>
                  </div>
                </div>
                <span className={cn("rounded-full px-3 py-1 text-xs font-bold", statusBadgeClass(r.status))}>
                  {r.status}
                </span>
              </div>

              <div className="mt-3 grid gap-1 text-sm text-[#0F3D2C]/60 sm:grid-cols-2">
                <p>Decision date: {formatDate(r.decided_at)}</p>
                <p>Decided by: {r.decided_by ?? "—"}</p>
              </div>
              <p className="mt-2 text-sm text-[#0F3D2C]/70">{r.details}</p>
              {r.reason && <p className="mt-1 text-sm text-[#0F3D2C]/60">{r.reason}</p>}
              {r.citations && (
                <p className="mt-2 text-xs text-[#0F3D2C]/60">Policy reference: {r.citations}</p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {r.status === "PENDING" ? (
                  <>
                    <Button
                      size="sm"
                      className="rounded-full bg-[#C8F169] px-6 py-2 font-bold text-[#0F3D2C] shadow-md transition-transform hover:scale-105"
                      disabled={pendingId !== null}
                      onClick={() => decide(r.request_id, "APPROVED")}
                    >
                      {pendingId === r.request_id ? "Updating…" : "Approve"}
                    </Button>
                    <Button
                      size="sm"
                      className="rounded-full bg-red-500 px-6 py-2 font-bold text-white shadow-md transition-transform hover:scale-105"
                      disabled={pendingId !== null}
                      onClick={() => decide(r.request_id, "REJECTED")}
                    >
                      Reject
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full border border-[#0F3D2C]/20 px-4 py-2 text-[#0F3D2C] hover:bg-[#0F3D2C] hover:text-white"
                    onClick={() => setSelected(r)}
                  >
                    <Eye className="mr-1 h-3.5 w-3.5" /> View Details
                  </Button>
                )}
              </div>
            </div>
          ))}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2 text-sm text-[#6B6B6B]">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-full p-1 hover:bg-[#EFE9DD] disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-full p-1 hover:bg-[#EFE9DD] disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="border-[#E9E2D6] bg-[#F7F5EF] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[#1A1A1A]">Request details</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm text-[#1A1A1A]">
              <div className="flex items-center gap-3">
                <Avatar name={selected.employee_name} />
                <div>
                  <p className="font-medium">{selected.employee_name}</p>
                  <p className="text-xs uppercase tracking-wide text-[#6B6B6B]">{selected.request_type}</p>
                </div>
                <span className={cn("ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium", statusBadgeClass(selected.status))}>
                  {selected.status}
                </span>
              </div>
              <p>{selected.details}</p>
              {selected.reason && <p className="text-[#6B6B6B]">{selected.reason}</p>}
              {selected.citations && (
                <p className="text-xs text-[#6B6B6B]">Policy reference: {selected.citations}</p>
              )}
              <div className="grid gap-1 text-xs text-[#6B6B6B] sm:grid-cols-2">
                <p>Decision date: {formatDate(selected.decided_at)}</p>
                <p>Decided by: {selected.decided_by ?? "—"}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
};

export default ManagerRequestsView;
