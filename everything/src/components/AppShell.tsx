import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, LogOut, Menu, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { getSession, clearSession } from "@/lib/session";
import { CARD_CLASS } from "@/lib/theme";
import Avatar from "./Avatar";

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface StatItem {
  icon: LucideIcon;
  label: string;
  value: string;
  to?: string;
  tone?: "emerald" | "amber" | "indigo" | "red";
}

interface NotificationRow {
  id: string;
  user_id: string;
  message: string;
  type: string;
  related_id: string | null;
  is_read: boolean;
  created_at: string;
}

const formatCreatedAt = (value: string): string => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

interface AppShellProps {
  nav: NavItem[];
  activeNav: string;
  onNav: (id: string) => void;
  stats: StatItem[];
  variant?: "light" | "premium";
  subtitle?: string;
  roleBadgeClass?: string;
  children: React.ReactNode;
}

const AppShell = ({
  nav,
  activeNav,
  onNav,
  stats,
  variant = "light",
  subtitle = "Employee Policy Desk",
  roleBadgeClass = "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  children,
}: AppShellProps) => {
  const navigate = useNavigate();
  const session = getSession();
  const premium = variant === "premium";

  const [identity, setIdentity] = useState<{ name: string; department: string } | null>(null);
  const [notifications, setNotifications] = useState<NotificationRow[] | null>(null);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifError, setNotifError] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => setRailCollapsed(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const loadIdentity = async () => {
      const { data, error } = await supabase.functions.invoke("getPolicyContext", {
        body: { employee_id: session.id, topic: "WFH" },
      });
      if (!cancelled && !error && data?.employee) {
        setIdentity({
          name: data.employee.name ?? session.id,
          department: data.employee.department ?? "",
        });
      } else if (!cancelled) {
        setIdentity({ name: session.id, department: "" });
      }
    };
    loadIdentity();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const fetchNotifications = useCallback(async () => {
    if (!session) return;
    setNotifLoading(true);
    setNotifError(false);
    try {
      const { data, error } = await supabase.functions.invoke("getNotifications", {
        body: { user_id: session.id },
      });
      if (error || !data?.notifications) {
        setNotifError(true);
      } else {
        setNotifications(data.notifications);
      }
    } catch {
      setNotifError(true);
    } finally {
      setNotifLoading(false);
    }
  }, [session]);

  // Badge count: fetch once on mount only (not on every render).
  useEffect(() => {
    if (!session) return;
    fetchNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Fetch fresh exactly once each time the panel opens; cancelled on close.
  useEffect(() => {
    if (!notifOpen || !session) return;
    let cancelled = false;
    setNotifLoading(true);
    setNotifError(false);
    const load = async () => {
      const { data, error } = await supabase.functions.invoke("getNotifications", {
        body: { user_id: session.id },
      });
      if (cancelled) return;
      if (error || !data?.notifications) {
        setNotifError(true);
      } else {
        setNotifications(data.notifications);
      }
      if (!cancelled) setNotifLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [notifOpen, session]);

  const unreadCount = notifications?.filter((n) => !n.is_read).length ?? 0;

  const handleBellClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNotifOpen((o) => !o);
  };

  // Optimistic mark-all-read: zero the badge immediately, then one silent refetch.
  const handleMarkAllRead = async () => {
    if (!session) return;
    setNotifications((prev) => (prev ?? []).map((n) => ({ ...n, is_read: true })));
    await supabase.functions.invoke("markNotificationsRead", {
      body: { user_id: session.id },
    });
    await fetchNotifications();
  };

  const handleRetry = () => {
    fetchNotifications();
  };

  const handleLogout = () => {
    clearSession();
    navigate("/login", { replace: true });
  };

  const renderBell = (dark: boolean) => (
    <div className="relative">
      <button
        onClick={handleBellClick}
        aria-label="Notifications"
        className={cn(
          "relative flex h-10 w-10 items-center justify-center rounded-xl border transition-colors",
          dark
            ? "border-white/10 bg-white/5 text-white hover:bg-white/10"
            : "border-transparent text-[#6B6B6B] hover:bg-[#EFE9DD]"
        )}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span
            className={cn(
              "absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white",
              dark ? "border-2 border-slate-900" : "border-2 border-[#F7F5EF]"
            )}
          >
            {unreadCount}
          </span>
        )}
      </button>
    </div>
  );

  const renderSidebar = (collapsed: boolean, closeMobile?: () => void) => (
    <>
      <div className="flex items-center gap-3 px-4 py-5">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold",
            premium
              ? "bg-gradient-to-br from-indigo-600 to-cyan-600 text-white"
              : "bg-[#0F3D2C] text-white"
          )}
        >
          HC
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "truncate text-sm font-semibold",
                premium
                  ? "bg-gradient-to-r from-white to-indigo-200 bg-clip-text text-transparent"
                  : "text-[#1A1A1A]"
              )}
            >
              HR Clarion
            </p>
            <p className={cn("truncate text-xs", premium ? "text-slate-400" : "text-[#6B6B6B]")}>
              {subtitle}
            </p>
          </div>
        )}
        {closeMobile && (
          <button
            onClick={closeMobile}
            aria-label="Close menu"
            className="rounded-full p-1.5 text-[#6B6B6B] hover:bg-[#EFE9DD] sm:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="px-3">
        <div
          className={cn(
            "flex items-center gap-3 p-3",
            premium
              ? "mb-6 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md"
              : cn(CARD_CLASS, "p-3"),
            collapsed && "justify-center p-2"
          )}
        >
          {premium ? (
            <div className="rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 p-0.5">
              <Avatar name={identity?.name ?? session?.id ?? "?"} className="h-14 w-14 rounded-xl text-xl" />
            </div>
          ) : (
            <Avatar name={identity?.name ?? session?.id ?? "?"} />
          )}
          {!collapsed && (
            <div className="min-w-0">
              <p className={cn("truncate text-lg", premium ? "font-bold text-white" : "text-sm font-semibold text-[#1A1A1A]")}>
                {identity?.name ?? session?.id ?? "—"}
              </p>
              {identity?.department && (
                <p className={cn("mt-0.5 truncate", premium ? "text-xs text-slate-400" : "text-[11px] text-[#6B6B6B]")}>
                  {identity.department}
                </p>
              )}
              {premium ? (
                <span className={cn("mt-1.5 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", roleBadgeClass)}>
                  {session?.role ?? ""}
                </span>
              ) : (
                <span className="mt-1 inline-block rounded-full bg-[#EFE9DD] px-2 py-0.5 text-[10px] font-medium text-[#6B6B6B]">
                  {session?.role ?? ""}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <nav className={cn("mt-4 flex-1 space-y-1 px-3", premium && "space-y-2")}>
        {nav.map((item, i) => {
          const active = item.id === activeNav;
          return (
            <button
              key={item.id}
              onClick={() => {
                onNav(item.id);
                closeMobile?.();
              }}
              title={collapsed ? item.label : undefined}
              style={
                premium && !collapsed
                  ? { animationDelay: `${i * 100}ms` }
                  : undefined
              }
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all duration-300",
                premium ? "group mx-3 w-[calc(100%-24px)] px-4 py-3 mb-2 animate-in fade-in slide-in-from-left-1" : "",
                active
                  ? premium
                    ? "bg-gradient-to-r from-indigo-600 to-cyan-600 font-medium text-white shadow-lg shadow-indigo-500/25"
                     : "border-l-[3px] border-l-[#C8F169] bg-[#C8F169]/15 font-medium text-[#1A1A1A]"
                  : premium
                    ? "text-slate-400 hover:bg-white/5 hover:text-white"
                    : "text-[#6B6B6B] hover:bg-[#EFE9DD] hover:text-[#1A1A1A]",
                collapsed && "justify-center px-0"
              )}
            >
              <item.icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  premium && "h-5 w-5 transition-transform group-hover:scale-110"
                )}
              />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="space-y-2 px-3 pb-3">
          {stats.map((s) => {
            const inner =
              premium ? (
                <div
                  className={cn(
                    "flex items-center justify-between rounded-xl border p-3",
                    s.tone === "amber"
                      ? "bg-gradient-to-br from-amber-500/20 to-amber-600/10 border-amber-500/30"
                      : s.tone === "indigo"
                        ? "bg-gradient-to-br from-indigo-500/20 to-indigo-600/10 border-indigo-500/30"
                        : s.tone === "red"
                          ? "bg-gradient-to-br from-red-500/20 to-red-600/10 border-red-500/30"
                          : "bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border-emerald-500/30"
                  )}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white">
                    <s.icon className="h-4 w-4" />
                  </span>
                  <div className="text-right">
                    <p className="text-[11px] text-slate-300">{s.label}</p>
                    <p className="text-2xl font-bold text-white">{s.value}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2">
                  <s.icon className="h-4 w-4 shrink-0 text-[#6B6B6B]" />
                  <span className="truncate text-xs text-[#6B6B6B]">{s.label}</span>
                  <span className="ml-auto text-sm font-semibold text-[#1A1A1A]">{s.value}</span>
                </div>
              );
            const cls = cn(
              premium ? "" : CARD_CLASS,
              "flex items-center gap-2 px-3 py-2",
              s.to &&
                cn(
                  "cursor-pointer transition-all",
                  premium ? "hover:scale-[1.02]" : "hover:ring-2 hover:ring-blue-500/20"
                )
            );
            return s.to ? (
              <Link key={s.label} to={s.to} className={cls}>
                {inner}
              </Link>
            ) : (
              <div key={s.label} className={cls}>
                {inner}
              </div>
            );
          })}
        </div>
      )}

      <div
        className={cn(
          "flex items-center gap-1 border-t px-3 py-3",
          premium ? "border-white/10" : "border-[#E9E2D6]"
        )}
      >
        {renderBell(premium)}
        <button
          onClick={handleLogout}
          className={cn(
            "flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-all",
            premium
              ? "text-slate-400 hover:bg-white/5 hover:text-white"
              : "text-[#6B6B6B] hover:bg-[#EFE9DD] hover:text-[#1A1A1A]",
            collapsed && "justify-center px-2"
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Log out</span>}
        </button>
      </div>
    </>
  );

  return (
    <div
      className={cn(
        "flex h-screen overflow-hidden font-sans",
        premium
          ? "relative bg-gradient-to-br from-slate-50 via-white to-indigo-50/30"
          : "bg-[#F7F5EF]"
      )}
    >
      {premium && (
        <>
          <div className="pointer-events-none absolute left-0 top-0 h-96 w-96 animate-pulse rounded-full bg-indigo-200/20 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 right-0 h-96 w-96 animate-pulse rounded-full bg-cyan-200/20 blur-3xl" />
        </>
      )}

      <aside
        className={cn(
          "hidden h-full w-64 flex-col border-r sm:flex",
          premium ? "border-white/10 bg-slate-900 text-white shadow-2xl" : "border-[#E9E2D6] bg-[#F7F5EF]"
        )}
      >
        {renderSidebar(railCollapsed)}
      </aside>

      <div className="flex h-full min-w-0 flex-1 flex-col">
        <div
          className={cn(
            "flex items-center justify-between border-b px-4 py-3 sm:hidden",
            premium ? "border-white/10 bg-slate-900 text-white" : "border-[#E9E2D6] bg-[#F7F5EF]"
          )}
        >
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className={cn(
              "rounded-full p-1.5 hover:bg-white/10",
              premium ? "text-white" : "text-[#1A1A1A] hover:bg-[#EFE9DD]"
            )}
          >
            <Menu className="h-5 w-5" />
          </button>
          <p className={cn("text-sm font-semibold", premium ? "text-white" : "text-[#1A1A1A]")}>
            HR Clarion
          </p>
          <div className="flex items-center">{renderBell(premium)}</div>
        </div>

        <main className="flex-1 overflow-y-auto p-6 max-lg:p-4">{children}</main>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 sm:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <aside
            className={cn(
              "absolute inset-y-0 left-0 flex w-64 flex-col border-r",
              premium ? "border-white/10 bg-slate-900 text-white" : "border-[#E9E2D6] bg-[#F7F5EF]"
            )}
          >
            {renderSidebar(false, () => setMobileOpen(false))}
          </aside>
        </div>
      )}

      {/* Notification slide-over drawer — fixed to the viewport so the clipped
          sidebar can never hide it. key forces the slide-in to play once. */}
      {notifOpen && (
        <>
          <div className="fixed inset-0 z-[99] bg-black/20" onClick={() => setNotifOpen(false)} />
          <div
            key="notif-panel"
            onClick={(e) => e.stopPropagation()}
            className="fixed right-0 top-0 z-[100] h-full w-96 max-w-full border-l border-slate-200 bg-white p-5 shadow-2xl animate-in slide-in-from-right duration-300"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold tracking-tight text-[#0F3D2C]">Notifications</h3>
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs font-semibold text-[#C8F169] underline underline-offset-2"
              >
                Mark all read
              </button>
            </div>

            {notifLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-14 animate-pulse rounded-xl border-l-4 border-[#C8F169] bg-[#C8F169]/10"
                  />
                ))}
              </div>
            ) : notifError ? (
              <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                <p className="text-sm text-red-600">Couldn't load notifications.</p>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="rounded-full border border-slate-300 px-4 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-100"
                >
                  Retry
                </button>
              </div>
            ) : !notifications || notifications.length === 0 ? (
              <div className="flex min-h-[200px] items-center justify-center text-sm text-slate-400">
                No notifications yet
              </div>
            ) : (
              <ul className="space-y-2">
                {notifications.slice(0, 10).map((n, j) => (
                  <li
                    key={n.id}
                    onClick={handleMarkAllRead}
                    className={cn(
                      "cursor-pointer rounded-xl border-l-4 p-3 transition-colors hover:bg-slate-50",
                      n.is_read
                        ? "border-transparent bg-white"
                        : "border-[#C8F169] bg-[#C8F169]/20"
                    )}
                  >
                    <p className="text-sm font-medium leading-snug text-[#0F3D2C]">{n.message}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="rounded-full bg-[#C8F169] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#0F3D2C]">
                        {n.type}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {formatCreatedAt(n.created_at)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default AppShell;
