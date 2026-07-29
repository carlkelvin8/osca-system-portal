"use client";

/**
 * Dashboard shell — Clean Professional with Dark Mode support
 */

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  Users,
  CalendarCheck,
  Package,
  BarChart3,
  LogOut,
  Camera,
  LayoutDashboard,
  ChevronRight,
  Bell,
  ScanFace,
  UserCircle,
  Building2,
  ShieldCheck,
  AlertTriangle,
  Gavel,
  TrendingUp,
  History,
  Moon,
  Sun,
  Menu,
  X,
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useThemeStore } from "@/store/useThemeStore";
import { useNotificationStore } from "@/store/useNotificationStore";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { Avatar } from "@/components/ui/Avatar";
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
      roles: ["admin", "director", "staff", "coach", "student"],
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
      ],
    },
    {
      href: "/dashboard/users",
      label: "Users",
      icon: Users,
      roles: ["admin", "director", "staff"],
    },
    {
      href: "/dashboard/admin/fr-config",
      label: "FR Config",
      icon: ScanFace,
      roles: ["admin", "director", "staff"],
    },
    {
      href: "/dashboard/reports",
      label: "Reports",
      icon: BarChart3,
      roles: ["admin", "director", "staff"],
    },
    {
      href: "/dashboard/analytics",
      label: "Analytics",
      icon: TrendingUp,
      roles: ["admin", "director", "staff"],
    },
    {
      href: "/dashboard/facilities",
      label: "Facilities",
      icon: Building2,
      roles: ["admin", "director", "staff"],
    },
    {
      href: "/dashboard/eligibility",
      label: "Eligibility",
      icon: ShieldCheck,
      roles: ["admin", "director", "staff", "student"],
    },
    {
      href: "/dashboard/incidents",
      label: "Incidents",
      icon: AlertTriangle,
      roles: ["admin", "director", "staff"],
    },
    {
      href: "/dashboard/sanctions",
      label: "Sanctions",
      icon: Gavel,
      roles: ["admin", "director", "staff", "student"],
    },
    {
      href: "/dashboard/audit-logs",
      label: "Audit Logs",
      icon: History,
      roles: ["admin", "director"],
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
  const { notifications, unreadCount, markAllRead } = useNotificationStore();
  const router = useRouter();
  const pathname = usePathname();
  const crumbs = useBreadcrumb(pathname);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  // Only redirect after auth check is complete — avoids race with Zustand hydration
  useEffect(() => {
    if (!isLoading && !isAuthenticated && user === null) {
      router.push("/login");
    }
  }, [isLoading, isAuthenticated, user, router]);

  // Show spinner while auth is resolving (isLoading) or user not yet loaded
  if (isLoading || (!isAuthenticated && user === null)) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? "bg-[#0f1219]" : "bg-[#f5f6f8]"}`}>
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

  return (
    <div className={`flex h-screen ${isDark ? "dark bg-[#0f1219]" : "bg-[#f5f6f8]"}`}>
      {/* ── Mobile Menu Overlay ── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setMobileMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
        </div>
      )}

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside className={`${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-50 w-52 bg-[#0f172a] text-white flex flex-col shrink-0 transition-transform duration-300`}>
        {/* Brand */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/8">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/osca-logo.png" alt="OSCA Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#f8fafc] leading-tight">OSCA Management System</p>
              <p className="text-[11px] text-[#94a3b8]">NAAP-Villamor</p>
            </div>
          </div>
          <button onClick={() => setMobileMenuOpen(false)} className="lg:hidden p-1 text-white/50 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {visibleNav.map((item) => {
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
            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${isActive
                    ? "bg-[#2563eb] text-white"
                    : isSectionOpen
                      ? "text-[#e2e8f0] bg-white/6"
                      : "text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-white/6"
                    }`}
                >
                  <Icon size={17} className="shrink-0" />
                  {item.label}
                </Link>
                {isSectionOpen && visibleChildren.length > 0 && (
                  <div className="ml-4 mt-0.5 space-y-0.5 border-l border-white/10 pl-3">
                    {visibleChildren.map((child) => {
                      const isChildActive = pathname.startsWith(child.href);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={`block px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${isChildActive
                            ? "bg-[#2563eb] text-white"
                            : "text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-white/6"
                            }`}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* User section */}
        <div className="px-2 py-3 border-t border-white/8 space-y-0.5">
          <Link href="/dashboard/profile" className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/6 transition-colors">
            <Avatar
              src={user.profile_picture_url}
              name={user.full_name}
              size="sm"
            />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-[#f1f5f9] truncate leading-tight">
                {user.full_name}
              </p>
              <p className="text-[11px] text-[#94a3b8]">{roleLabel[user.role]}</p>
            </div>
          </Link>
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-[#94a3b8] hover:text-white hover:bg-white/6 rounded-lg transition-colors"
          >
            <LogOut size={15} className="shrink-0" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowLogoutConfirm(false)}>
          <div className={`${isDark ? "bg-[#1a1f2e] border border-[#2a3040]" : "bg-white"} rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4`} onClick={(e) => e.stopPropagation()}>
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
              <button onClick={() => setShowLogoutConfirm(false)} className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-xl transition ${isDark ? "text-gray-300 bg-[#2a3040] hover:bg-[#353d4f]" : "text-gray-700 bg-gray-100 hover:bg-gray-200"}`}>Cancel</button>
              <button onClick={handleLogout} className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700 transition">Sign Out</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className={`h-14 ${isDark ? "bg-[#1a1f2e] border-[#2a2f3e]" : "bg-white border-[#e5e7eb]"} border-b flex items-center px-4 lg:px-6 gap-3 shrink-0`}>
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
                <div className={`absolute right-0 top-10 w-80 rounded-xl shadow-xl border z-50 ${isDark ? "bg-[#1a1f2e] border-[#2a2f3e]" : "bg-white border-gray-200"}`}>
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
                        <div key={n.id} className={`px-4 py-3 border-b last:border-0 ${!n.read ? (isDark ? "bg-blue-900/10" : "bg-blue-50/50") : ""} ${isDark ? "border-[#2a2f3e]" : "border-gray-50"}`}>
                          <p className={`text-sm font-medium ${isDark ? "text-white" : "text-gray-900"}`}>{n.title}</p>
                          <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"} mt-0.5`}>{n.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Avatar */}
            <Avatar
              src={user.profile_picture_url}
              name={user.full_name}
              size="md"
            />
          </div>
        </header>

        {/* Offline banner */}
        <OfflineBanner />

        {/* Page content */}
        <main className={`flex-1 overflow-auto ${isDark ? "bg-[#0f1219]" : ""}`}>
          <div className="p-4 lg:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
