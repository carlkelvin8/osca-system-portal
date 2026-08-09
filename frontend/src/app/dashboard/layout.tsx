"use client";

/**
 * Dashboard shell — Clean Professional with Dark Mode support
 */

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Users,
  CalendarCheck,
  Package,
  BarChart3,
  LogOut,
  Camera,
  LayoutDashboard,
  ChevronLeft,
  ChevronRight,
  Bell,
  ScanFace,
  UserCircle,
  Building2,
  ShieldCheck,
  AlertTriangle,
  Gavel,
  TrendingUp,
  ScrollText,
  Moon,
  Sun,
  Menu,
  X,
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useThemeStore } from "@/store/useThemeStore";
import { useSidebarStore } from "@/store/useSidebarStore";
import { useNotificationStore } from "@/store/useNotificationStore";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import type { UserRole } from "@/types";

// ── Nav definition ────────────────────────────────────────────────────────────

interface NavChild {
  href: string;
  label: string;
  roles: UserRole[];
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles: UserRole[];
  children?: NavChild[];
}

const navItems: NavItem[] = [
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      roles: ["admin", "director", "coach", "pe_instructor", "student", "staff"],
    },
    {
      href: "/dashboard/attendance",
      label: "Attendance",
      icon: CalendarCheck,
      roles: ["admin", "director", "coach", "student"],
      children: [
        {
          href: "/dashboard/attendance/roster",
          label: "Player Roster",
          roles: ["coach"],
        },
      ],
    },
    {
      href: "/dashboard/inventory",
      label: "Inventory",
      icon: Package,
      roles: ["admin", "director", "pe_instructor", "coach", "staff"],
      children: [
        {
          href: "/dashboard/inventory/requests",
          label: "Equipment Requests",
          roles: ["admin", "director", "coach", "pe_instructor", "staff"],
        },
        {
          href: "/dashboard/inventory/borrow-scanner",
          label: "Borrow Scanner",
          roles: ["admin", "director", "staff"],
        },
        {
          href: "/dashboard/inventory/return-scanner",
          label: "Return Scanner",
          roles: ["admin", "director", "staff"],
        },
      ],
    },
    {
      href: "/dashboard/users",
      label: "Users",
      icon: Users,
      roles: ["admin", "director", "staff"],
    },
    {
      href: "/dashboard/audit-logs",
      label: "Audit Logs",
      icon: ScrollText,
      roles: ["admin"],
    },
    {
      href: "/dashboard/admin/fr-config",
      label: "FR Config",
      icon: ScanFace,
      roles: ["admin", "director"],
    },
    {
      href: "/dashboard/reports",
      label: "Reports",
      icon: BarChart3,
      roles: ["admin", "director", "coach", "staff"],
    },
    {
      href: "/dashboard/analytics",
      label: "Analytics",
      icon: TrendingUp,
      roles: ["admin", "director", "coach"],
    },
    {
      href: "/dashboard/facilities",
      label: "Facilities",
      icon: Building2,
      roles: ["admin", "director", "coach", "pe_instructor", "staff"],
      children: [
        {
          href: "/dashboard/facilities/reservations",
          label: "Venue Reservations",
          roles: ["admin", "director", "coach", "pe_instructor", "staff"],
        },
      ],
    },
    {
      href: "/dashboard/eligibility",
      label: "Eligibility",
      icon: ShieldCheck,
      roles: ["admin", "director", "coach", "student"],
    },
    {
      href: "/dashboard/incidents",
      label: "Incidents",
      icon: AlertTriangle,
      roles: ["admin", "director", "coach", "staff"],
    },
    {
      href: "/dashboard/sanctions",
      label: "Sanctions",
      icon: Gavel,
      roles: ["admin", "director", "coach", "student"],
    },
    {
      href: "/kiosk",
      label: "Attendance Scan",
      icon: Camera,
      roles: ["admin", "coach"],
    },
    {
      href: "/dashboard/profile",
      label: "Profile",
      icon: UserCircle,
      roles: ["admin", "director", "coach", "pe_instructor", "student", "staff"],
    },
  ];

// ── Role badge label ───────────────────────────────────────────────────────────

const roleLabel: Record<UserRole, string> = {
  admin: "Admin",
  coach: "Coach",
  pe_instructor: "PE Instructor",
  student: "Student",
  director: "Director",
  staff: "Staff",
};

// ── Breadcrumb helper ─────────────────────────────────────────────────────────

function useBreadcrumb(pathname: string) {
  const segments = pathname.replace("/dashboard", "").split("/").filter(Boolean);
  const crumbs: { label: string; href: string }[] = [
    { label: "Dashboard", href: "/dashboard" },
  ];
  let path = "/dashboard";
  for (const seg of segments) {
    path += `/${seg}`;
    crumbs.push({
      label: seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, " "),
      href: path,
    });
  }
  return crumbs;
}

// ── Layout ────────────────────────────────────────────────────────────────────

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading, logout, fetchCurrentUser } = useAuthStore();
  const { isDark, toggle: toggleTheme } = useThemeStore();
  const { notifications, unreadCount, markAllRead, markRead, fetch: fetchNotifications } = useNotificationStore();
  const router = useRouter();
  const pathname = usePathname();
  const crumbs = useBreadcrumb(pathname);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { collapsed, toggle: toggleCollapsed } = useSidebarStore();
  const [navTip, setNavTip] = useState<{ label: string; left: number; top: number } | null>(null);

  // Show a floating label tooltip in icon-only (collapsed) mode
  const showNavTip = (e: React.MouseEvent<HTMLElement>, label: string) => {
    if (!collapsed) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setNavTip({ label, left: rect.right + 12, top: rect.top + rect.height / 2 });
  };
  const hideNavTip = () => setNavTip(null);

  useEffect(() => {
    setNavTip(null);
  }, [collapsed]);

  // Close the mobile drawer whenever the route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Lock body scroll while the mobile drawer is open
  useEffect(() => {
    if (mobileMenuOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [mobileMenuOpen]);

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  // Poll notifications from the backend once authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, user, fetchNotifications]);

  // Only redirect after auth check is complete — avoids race with Zustand hydration
  useEffect(() => {
    if (!isLoading && !isAuthenticated && user === null) {
      router.push("/login");
    }
  }, [isLoading, isAuthenticated, user, router]);

  // Show spinner while auth is resolving (isLoading) or user not yet loaded
  if (isLoading || (!isAuthenticated && user === null)) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? "bg-[#0F172A]" : "bg-[#f2f5f9]"}`}>
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#2563eb]" />
      </div>
    );
  }

  // TypeScript narrowing: after the early return above, user must be non-null here
  if (!user) return null;

  const visibleNav = navItems.filter((item) => item.roles.includes(user.role));

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  // Initials for avatar
  const initials =
    (user.first_name?.[0] ?? "") + (user.last_name?.[0] ?? "");

  return (
    <div className={`flex h-screen ${isDark ? "dark bg-[#0F172A]" : "bg-[#f2f5f9]"}`}>
      {/* ── Mobile Menu Overlay ── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setMobileMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
        </div>
      )}

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside className={`${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 fixed lg:static relative inset-y-0 left-0 z-50 w-52 bg-[#0f172a] text-white flex flex-col shrink-0 transition-[width,transform] duration-500 ease-[cubic-bezier(.16,1,.3,1)] ${collapsed ? "lg:w-[72px]" : "lg:w-52"}`}>
        {/* Collapse toggle (desktop) */}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden lg:flex absolute z-50 -right-3 top-[22px] w-6 h-6 items-center justify-center rounded-full bg-[#0f172a] border border-white/15 text-white/70 shadow-lg hover:bg-[#2563eb] hover:text-white hover:border-[#2563eb] transition-colors duration-200"
        >
          <ChevronLeft
            size={14}
            className={`transition-transform duration-300 ease-[cubic-bezier(.16,1,.3,1)] ${collapsed ? "rotate-180" : ""}`}
          />
        </button>

        {/* Brand */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/8">
          <Link href="/dashboard" className={`flex items-center gap-2.5 min-w-0 ${collapsed ? "lg:justify-center lg:gap-0" : ""}`}>
            <div className="w-9 h-9 rounded-full bg-white overflow-hidden flex items-center justify-center shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/osca-logo.png"
                alt="OSCA Logo"
                className="w-full h-full object-cover"
              />
            </div>
            <div className={`min-w-0 overflow-hidden whitespace-nowrap transition-all duration-300 ${collapsed ? "lg:opacity-0 lg:max-w-0" : ""}`}>
              <p className="text-sm font-bold text-[#f8fafc] leading-tight">OSCA System</p>
              <p className="text-[11px] text-[#94a3b8]">NAAP-Villamor</p>
            </div>
          </Link>
          <button onClick={() => setMobileMenuOpen(false)} className="lg:hidden p-1 text-white/50 hover:text-white shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {visibleNav.map((item, index) => {
            const Icon = item.icon;
            const visibleChildren = item.children?.filter((c) => c.roles.includes(user.role)) ?? [];
            const hasActiveChild = visibleChildren.some((c) => pathname.startsWith(c.href));
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : hasActiveChild
                  ? false
                  : pathname.startsWith(item.href);
            const isSectionOpen = pathname.startsWith(item.href) && item.href !== "/dashboard";
            const showParentPill = isActive || (collapsed && hasActiveChild);
            return (
              <motion.div
                key={item.href}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.035, duration: 0.4, ease: "easeOut" }}
              >
                <Link
                  href={item.href}
                  onMouseEnter={(e) => showNavTip(e, item.label)}
                  onMouseLeave={hideNavTip}
                  className={`group relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors duration-200 ${collapsed ? "lg:justify-center lg:gap-0" : ""} ${
                    isActive
                      ? "text-white"
                      : isSectionOpen
                        ? "text-[#e2e8f0]"
                        : "text-[#94a3b8] hover:text-[#e2e8f0]"
                  }`}
                >
                  <span className="pointer-events-none absolute inset-0 rounded-lg bg-white/6 origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300 ease-out" />
                  {showParentPill && (
                    <motion.span
                      layoutId="sidebar-active-pill"
                      className="absolute inset-0 rounded-lg bg-[#2563eb]"
                      transition={{ type: "spring", stiffness: 500, damping: 38 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center min-w-0">
                    <Icon size={17} className="shrink-0 transition-transform duration-200 group-hover:scale-110" />
                    <span className={`overflow-hidden whitespace-nowrap transition-all duration-300 ${collapsed ? "lg:ml-0 lg:opacity-0 lg:max-w-0" : "ml-2.5 opacity-100 max-w-40"}`}>
                      {item.label}
                    </span>
                  </span>
                </Link>
                {isSectionOpen && visibleChildren.length > 0 && (
                  <div className={`ml-4 mt-0.5 space-y-0.5 border-l border-white/10 pl-3 ${collapsed ? "lg:hidden" : ""}`}>
                    {visibleChildren.map((child) => {
                      const isChildActive = pathname.startsWith(child.href);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={`relative block px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                            isChildActive ? "text-white" : "text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-white/6"
                          }`}
                        >
                          {isChildActive && (
                            <motion.span
                              layoutId="sidebar-active-pill"
                              className="absolute inset-0 rounded-lg bg-[#2563eb]"
                              transition={{ type: "spring", stiffness: 500, damping: 38 }}
                            />
                          )}
                          <span className="relative z-10">{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            );
          })}
        </nav>

        {/* User section */}
        <div className="px-2 py-3 border-t border-white/8 space-y-0.5">
          <Link
            href="/dashboard/profile"
            onMouseEnter={(e) => showNavTip(e, "Profile")}
            onMouseLeave={hideNavTip}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors hover:bg-white/6 ${collapsed ? "lg:justify-center lg:gap-0" : ""}`}
          >
            <div className="w-7 h-7 rounded-full bg-[#2563eb] flex items-center justify-center text-white text-xs font-semibold shrink-0">
              {initials.toUpperCase() || "?"}
            </div>
            <div className={`min-w-0 overflow-hidden whitespace-nowrap transition-all duration-300 ${collapsed ? "lg:opacity-0 lg:max-w-0" : ""}`}>
              <p className="text-[13px] font-medium text-[#f1f5f9] truncate leading-tight">
                {user.full_name}
              </p>
              <p className="text-[11px] text-[#94a3b8]">{roleLabel[user.role]}</p>
            </div>
          </Link>
          <button
            onClick={() => setShowLogoutConfirm(true)}
            onMouseEnter={(e) => showNavTip(e, "Sign Out")}
            onMouseLeave={hideNavTip}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-[#94a3b8] hover:text-white hover:bg-white/6 rounded-lg transition-colors ${collapsed ? "lg:justify-center lg:gap-0" : ""}`}
          >
            <LogOut size={15} className="shrink-0" />
            <span className={`overflow-hidden whitespace-nowrap transition-all duration-300 ${collapsed ? "lg:opacity-0 lg:max-w-0" : "opacity-100 max-w-20"}`}>
              Sign Out
            </span>
          </button>
        </div>
      </aside>

      {/* Collapsed-mode tooltip */}
      {navTip && (
        <div
          className="fixed z-[150] pointer-events-none bg-[#0b1220] text-white text-xs font-medium px-2.5 py-1.5 rounded-md shadow-lg border border-white/10 whitespace-nowrap"
          style={{ left: navTip.left, top: navTip.top, transform: "translateY(-50%)" }}
        >
          {navTip.label}
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowLogoutConfirm(false)}>
          <div className={`${isDark ? "bg-[#1E293B] border border-[#334155]" : "bg-white"} rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                <LogOut size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className={`font-bold ${isDark ? "text-white" : "text-gray-900"}`}>Sign Out</h3>
                <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>Are you sure you want to sign out?</p>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowLogoutConfirm(false)} className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-xl transition ${isDark ? "text-gray-300 bg-[#334155] hover:bg-[#475569]" : "text-gray-700 bg-gray-100 hover:bg-gray-200"}`}>Cancel</button>
              <button onClick={handleLogout} className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700 transition">Sign Out</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className={`h-14 ${isDark ? "bg-[#1E293B] border-[#334155]" : "bg-white border-[#e5e7eb]"} border-b flex items-center px-4 lg:px-6 gap-3 shrink-0`}>
          {/* Mobile menu button */}
          <button onClick={() => setMobileMenuOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 text-gray-600">
            <Menu size={20} />
          </button>

          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-xs text-[#6b7280] flex-1 min-w-0">
            {crumbs.map((crumb, i) => (
              <span key={crumb.href} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight size={12} className="text-[#d1d5db]" />}
                {i === crumbs.length - 1 ? (
                  <span className={`font-medium ${isDark ? "text-white" : "text-[#111827]"}`}>{crumb.label}</span>
                ) : (
                  <Link href={crumb.href} className="hover:text-[#374151] transition-colors">
                    {crumb.label}
                  </Link>
                )}
              </span>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* Dark mode toggle */}
            <button
              onClick={toggleTheme}
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${isDark ? "text-yellow-400 hover:bg-white/5" : "text-gray-500 hover:bg-gray-100"}`}
              title={isDark ? "Light mode" : "Dark mode"}
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className={`relative w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${isDark ? "text-gray-400 hover:bg-white/5" : "text-gray-500 hover:bg-gray-100"}`}
              >
                <Bell size={16} />
                {unreadCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {/* Notification dropdown */}
              {notifOpen && (
                <div className={`absolute right-0 top-10 w-80 rounded-xl shadow-xl border z-50 ${isDark ? "bg-[#1E293B] border-[#334155]" : "bg-white border-gray-200"}`}>
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <span className={`text-sm font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>Notifications</span>
                    {unreadCount > 0 && (
                      <button onClick={markAllRead} className="text-xs text-blue-600 hover:underline">Mark all read</button>
                    )}
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-6">No notifications</p>
                    ) : (
                      notifications.slice(0, 10).map((n) => (
                        <button
                          key={n.id}
                          onClick={() => markRead(n.id)}
                          className={`w-full text-left px-4 py-3 border-b last:border-0 transition-colors ${!n.read ? (isDark ? "bg-blue-900/10" : "bg-blue-50/50") : ""} ${isDark ? "border-[#334155] hover:bg-white/5" : "border-gray-50 hover:bg-gray-50"}`}
                        >
                          <p className={`text-sm font-medium ${isDark ? "text-white" : "text-gray-900"}`}>{n.title}</p>
                          <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"} mt-0.5`}>{n.message}</p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Avatar */}
            <div className="w-8 h-8 rounded-full bg-[#2563eb] flex items-center justify-center text-white text-xs font-semibold">
              {initials.toUpperCase() || "?"}
            </div>
          </div>
        </header>

        {/* Offline banner */}
        <OfflineBanner />

        {/* Page content */}
        <main className={`flex-1 overflow-auto ${isDark ? "bg-[#0F172A]" : "bg-[#f2f5f9]"}`}>
          <div className="p-5 lg:p-7">{children}</div>
        </main>
      </div>
    </div>
  );
}
