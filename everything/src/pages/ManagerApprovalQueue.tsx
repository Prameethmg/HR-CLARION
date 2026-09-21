import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Inbox,
  List,
  Loader2,
  Users,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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

const formatDate = (value: string | null | undefined): string =>
  value ? value.slice(0, 10) : "—";

const statusBadgeClass = (status: string): string => {
  switch (status) {
    case "PENDING":
      return "border border-amber-200 bg-amber-100 text-amber-700";
    case "APPROVED":
      return "border border-emerald-200 bg-emerald-100 text-emerald-700";
    case "REJECTED":
      return "border border-red-200 bg-red-100 text-red-700";
    default:
      return "border border-slate-200 bg-slate-100 text-slate-700";
  }
};

const statusAccent = (status: string): string => {
  switch (status) {
    case "PENDING":
      return "#F59E0B";
    case "APPROVED":
      return "#10B981";
    case "REJECTED":
      return "#EF4444";
    default:
      return "#94A3B8";
  }
};

// Decorative pastel accents, rotated across cards/tags (never status-bearing).
const ACCENTS = [
  "bg-[#C8F169]",
  "bg-[#0F3D2C]",
  "bg-[#F7F5EF]",
  "bg-[#8FA88A]",
];

const SkeletonCard = () => (
  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50">
    <div className="flex items-center justify-between">
      <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
      <div className="h-5 w-16 animate-pulse rounded-full bg-slate-200" />
    </div>
    <div className="mt-3 h-3 w-3/4 animate-pulse rounded bg-slate-100" />
    <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-slate-100" />
  </div>
);

const ManagerApprovalQueue = () => {
  const navigate = useNavigate();
  const session = getSession();

  const [requests, setRequests] = useState<RequestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState<string>("queue");

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

  const decide = async (requestId: string, decision: "APPROVED" | "REJECTED") => {
    if (!session || pendingId) return;
    setPendingId(requestId);
    setError(null);
    try {
      const { error } = await supabase.functions.invoke("decideRequest", {
        body: { request_id: requestId, decision, decided_by: session.id },
      });
      if (error) {
        setError("Could not update the request. Please try again.");
      } else {
        await load();
      }
    } finally {
      setPendingId(null);
    }
  };

  // Client-side sort only: PENDING first (preserving their existing relative
  // order — requests have no created_at), then non-pending grouped below.
  const sortedRequests = useMemo(() => {
    if (!requests) return null;
    const pending = requests.filter((r) => r.status === "PENDING");
    const others = requests.filter((r) => r.status !== "PENDING");
    return [...pending, ...others];
  }, [requests]);

  if (!session) {
    return <Navigate to="/login" replace />;
  }
  if (session.role !== "MANAGER") {
    return <Navigate to={rolePath(session.role)} replace />;
  }

  const counts = {
    total: requests?.length ?? 0,
    pending: requests?.filter((r) => r.status === "PENDING").length ?? 0,
    approved: requests?.filter((r) => r.status === "APPROVED").length ?? 0,
    rejected: requests?.filter((r) => r.status === "REJECTED").length ?? 0,
  };

  const handleDelete = async (requestId: string) => {
    if (!window.confirm("Delete this request? This cannot be undone.")) return;
    if (deletingId) return;
    setDeletingId(requestId);
    setDeleteError(null);
    try {
      const { error } = await supabase.functions.invoke("deleteRequest", {
        body: { request_id: requestId },
      });
      if (error) {
        setDeleteError("Could not delete this request. Please try again.");
      } else {
        setRequests((prev) =>
          prev ? prev.filter((r) => r.request_id !== requestId) : prev
        );
      }
    } finally {
      setDeletingId(null);
    }
  };

  const nav = [
    { id: "queue", label: "Approval Queue", icon: Inbox },
    { id: "team", label: "Team Requests", icon: Users },
  ];
  const stats = [
    { icon: List, label: "Total requests", value: String(counts.total), to: "/manager/requests/all", tone: "indigo" as const },
    { icon: Clock, label: "Pending", value: String(counts.pending), to: "/manager/requests/pending", tone: "amber" as const },
    { icon: CheckCircle2, label: "Approved", value: String(counts.approved), to: "/manager/requests/approved", tone: "emerald" as const },
    { icon: XCircle, label: "Rejected", value: String(counts.rejected), to: "/manager/requests/rejected", tone: "red" as const },
  ];

  return (
    <AppShell
      nav={nav}
      activeNav={activeNav}
      onNav={setActiveNav}
      stats={stats}
      variant="premium"
      subtitle="Manager Policy Desk"
    >
      {activeNav === "team" ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
          Nothing here yet.
        </div>
      ) : (
        <>
          <h2 className="mb-6 text-2xl font-extrabold tracking-tight text-slate-800">Approval Queue</h2>

          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!requests && !error && (
            <div className="space-y-4">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          )}

          {requests && requests.length === 0 && (
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white px-10 py-10 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                  <Inbox className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">No requests to review</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Requests assigned to you will appear here.
                  </p>
                </div>
              </div>
            </div>
          )}

          {requests && requests.length > 0 && (
            <div className="space-y-4">
              {deleteError && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {deleteError}
                </p>
              )}
              {sortedRequests!.map((r) => (
                <div
                  key={r.request_id}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 transition-shadow duration-300 hover:shadow-xl"
                  style={{ borderLeft: `3px solid ${statusAccent(r.status)}` }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={r.employee_name} />
                      <div>
                        <p className="font-semibold text-slate-800">{r.employee_name}</p>
                        <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                          {r.request_type}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(r.status)}`}
                    >
                      {r.status}
                    </span>
                  </div>

                  <p className="mt-3 text-sm text-slate-800">{r.details}</p>
                  {r.reason && <p className="mt-1 text-sm text-slate-500">{r.reason}</p>}

                  {r.citations && r.citations.trim() !== "" && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {r.citations.split(",").map((c, j) => (
                        <span
                          key={j}
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium text-slate-700 ${ACCENTS[j % 4]}`}
                        >
                          {c.trim()}
                        </span>
                      ))}
                    </div>
                  )}

                  {r.status === "PENDING" ? (
                    <div className="mt-4 flex gap-2">
                      <Button
                        size="sm"
                        className="rounded-full bg-emerald-600 px-4 py-2 text-white shadow-md transition-all duration-300 hover:bg-emerald-700"
                        disabled={pendingId !== null}
                        onClick={() => decide(r.request_id, "APPROVED")}
                      >
                        {pendingId === r.request_id ? "Updating…" : "Approve"}
                      </Button>
                      <Button
                        size="sm"
                        className="rounded-full bg-red-600 px-4 py-2 text-white shadow-md transition-all duration-300 hover:bg-red-700"
                        disabled={pendingId !== null}
                        onClick={() => decide(r.request_id, "REJECTED")}
                      >
                        Reject
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-slate-500">
                        Decided by {r.decided_by}
                        {r.decided_at ? ` on ${formatDate(r.decided_at)}` : ""}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full border-red-200 text-red-600 hover:bg-red-50"
                        disabled={deletingId !== null}
                        onClick={() => handleDelete(r.request_id)}
                      >
                        {deletingId === r.request_id ? "Deleting…" : "Delete"}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
};

export default ManagerApprovalQueue;
