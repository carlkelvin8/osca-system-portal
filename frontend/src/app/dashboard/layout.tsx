"use client";


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
  Megaphone,
  Moon,
  Sun,
  Menu,
  X,
  Search,
  CornerDownLeft,
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useThemeStore } from "@/store/useThemeStore";
import { useSidebarStore } from "@/store/useSidebarStore";
import { useNotificationStore } from "@/store/useNotificationStore";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import type { UserRole } from "@/types";


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
      roles: ["admin", "director", "coach", "student", "staff"],
      children: [
        {
          href: "/dashboard/attendance/roster",
          label: "Player Roster",
          roles: ["coach"],
        },
      ],
    },
    {
      href: "/kiosk",
      label: "Attendance Scan",
      icon: Camera,
      roles: ["admin", "director", "staff", "coach"],
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
      href: "/dashboard/announcements",
      label: "Announcements",
      icon: Megaphone,
      roles: ["admin", "director", "staff"],
    },
    {
      href: "/dashboard/eligibility",
      label: "Eligibility",
      icon: ShieldCheck,
      roles: ["admin", "director", "coach", "student", "staff"],
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
      href: "/dashboard/incidents",
      label: "Incidents",
      icon: AlertTriangle,
      roles: ["admin", "director", "coach", "staff"],
    },
    {
      href: "/dashboard/sanctions",
      label: "Sanctions",
      icon: Gavel,
      roles: ["admin", "director", "coach", "student", "staff"],
    },
    {
      href: "/dashboard/audit-logs",
      label: "Audit Logs",
      icon: ScrollText,
      roles: ["admin"],
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
      href: "/dashboard/admin/fr-config",
      label: "FR Config",
      icon: ScanFace,
      roles: ["admin", "director", "staff"],
    },
    {
      href: "/dashboard/profile",
      label: "Profile",
      icon: UserCircle,
      roles: ["admin", "director", "coach", "pe_instructor", "student", "staff"],
    },
  ];


const roleLabel: Record<UserRole, string> = {
  admin: "Admin",
  coach: "Coach",
  pe_instructor: "PE Instructor",
  student: "Student",
  director: "Director",
  staff: "Staff",
};


function pageTitleFor(pathname: string): string {
  const flat = navItems.flatMap((item) => [
    { label: item.label, href: item.href },
    ...(item.children ?? []).map((c) => ({ label: c.label, href: c.href })),
  ]);
  const sorted = [...flat].sort((a, b) => b.href.length - a.href.length);
  const match = sorted.find(
    (f) => pathname === f.href || pathname.startsWith(f.href + "/")
  );
  return match?.label ?? "Dashboard";
}


function TopbarBreadcrumb({ pageTitle }: { pageTitle: string }) {
  const { isDark } = useThemeStore();
  const isHome = pageTitle === "Dashboard";

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5">
      <Link
        href="/dashboard"
        className={`flex shrink-0 items-center gap-1.5 transition-colors ${isHome ? "font-bold text-[#1557C0]" : isDark ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-[#1557C0]"}`}
      >
        <LayoutDashboard size={15} />
        Dashboard
      </Link>
      {!isHome && (
        <>
          <ChevronRight size={14} className={`shrink-0 ${isDark ? "text-gray-600" : "text-gray-300"}`} />
          <span className={`truncate font-bold ${isDark ? "text-white" : "text-[#0B1F3A]"}`}>{pageTitle}</span>
        </>
      )}
    </nav>
  );
}


export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading, logout, fetchCurrentUser } = useAuthStore();
  const { isDark, toggle: toggleTheme } = useThemeStore();
  const { notifications, unreadCount, markAllRead, markRead, fetch: fetchNotifications } = useNotificationStore();
  const router = useRouter();
  const pathname = usePathname();
  const pageTitle = pageTitleFor(pathname);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { collapsed, toggle: toggleCollapsed } = useSidebarStore();
  const [navTip, setNavTip] = useState<{ label: string; left: number; top: number } | null>(null);

  const showNavTip = (e: React.MouseEvent<HTMLElement>, label: string) => {
    if (!collapsed) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setNavTip({ label, left: rect.right + 12, top: rect.top + rect.height / 2 });
  };
  const hideNavTip = () => setNavTip(null);

  useEffect(() => {
    setNavTip(null);
  }, [collapsed]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

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

  useEffect(() => {
    if (isAuthenticated && user) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, user, fetchNotifications]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && user === null) {
      router.push("/login");
    }
  }, [isLoading, isAuthenticated, user, router]);

  if (isLoading || (!isAuthenticated && user === null)) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? "bg-[#0F172A]" : "bg-[#f2f5f9]"}`}>
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#2563eb]" />
      </div>
    );
  }

  if (!user) return null;

  const visibleNav = navItems.filter((item) => item.roles.includes(user.role));

  const q = searchQuery.trim().toLowerCase();
  const searchResults: { label: string; href: string }[] = [];
  if (q) {
    for (const item of visibleNav) {
      if (searchResults.length >= 8) break;
      if (item.label.toLowerCase().includes(q)) searchResults.push({ label: item.label, href: item.href });
      for (const child of item.children ?? []) {
        if (searchResults.length >= 8) break;
        if (
          child.roles.includes(user.role) &&
          child.label.toLowerCase().includes(q)
        ) {
          searchResults.push({ label: child.label, href: child.href });
        }
      }
    }
  }

  const handleSearchNav = (href: string) => {
    router.push(href);
    setSearchQuery("");
    setSearchOpen(false);
  };

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  const initials =
    (user.first_name?.[0] ?? "") + (user.last_name?.[0] ?? "");

  return (
    <div className={`flex h-screen ${isDark ? "dark bg-[#0F172A]" : "bg-[#f2f5f9]"}`}>
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setMobileMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
        </div>
      )}

      <aside className={`${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 fixed lg:static relative inset-y-0 left-0 z-50 w-52 bg-[#0f172a] text-white flex flex-col shrink-0 transition-[width,transform] duration-500 ease-[cubic-bezier(.16,1,.3,1)] ${collapsed ? "lg:w-[72px]" : "lg:w-52"}`}>
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

      {navTip && (
        <div
          className="fixed z-[150] pointer-events-none bg-[#0b1220] text-white text-xs font-medium px-2.5 py-1.5 rounded-md shadow-lg border border-white/10 whitespace-nowrap"
          style={{ left: navTip.left, top: navTip.top, transform: "translateY(-50%)" }}
        >
          {navTip.label}
        </div>
      )}

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

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className={`h-16 ${isDark ? "bg-[#1E293B] border-[#334155]" : "bg-white border-[#e5e7eb]"} border-b flex items-center gap-4 px-4 lg:px-6 shrink-0`}>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <button onClick={() => setMobileMenuOpen(true)} className="lg:hidden p-2 -ml-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 text-gray-600 dark:text-gray-300 shrink-0">
              <Menu size={20} />
            </button>
            <TopbarBreadcrumb pageTitle={pageTitle} />
          </div>

          <div className="flex-1 flex justify-center">
            <div className="relative w-full max-w-md">
              <Search size={15} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${isDark ? "text-gray-500" : "text-gray-400"}`} />
              <input
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setSearchOpen(false);
                  if (e.key === "Enter" && searchResults.length > 0) {
                    handleSearchNav(searchResults[0].href);
                  }
                }}
                placeholder="Search anything..."
                className={`w-full h-9 pl-9 pr-3 text-sm rounded-full border transition-colors focus:outline-none focus:ring-2 ${
                  isDark
                    ? "bg-[#0F172A]/60 border-[#334155] text-white placeholder:text-gray-500 focus:border-[#2563eb] focus:ring-[#2563eb]/20"
                    : "bg-[#f2f5f9] border-transparent text-gray-700 placeholder:text-gray-400 hover:bg-gray-100 focus:bg-white focus:border-[#2563eb] focus:ring-[#2563eb]/15"
                }`}
              />

              {searchOpen && searchResults.length > 0 && (
                <div className={`absolute left-0 right-0 top-full mt-2 rounded-xl shadow-xl border z-50 overflow-hidden ${isDark ? "bg-[#1E293B] border-[#334155]" : "bg-white border-gray-200"}`}>
                  {searchResults.map((r) => (
                    <button
                      key={r.href}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSearchNav(r.href);
                      }}
                      className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm text-left transition-colors ${isDark ? "text-gray-200 hover:bg-white/5" : "text-gray-700 hover:bg-gray-50"}`}
                    >
                      <span className="truncate">{r.label}</span>
                      <CornerDownLeft size={13} className={`shrink-0 ${isDark ? "text-gray-500" : "text-gray-300"}`} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-1 justify-end">
            <button
              onClick={toggleTheme}
              className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${isDark ? "text-yellow-400 hover:bg-white/5" : "text-gray-500 hover:bg-gray-100"}`}
              title={isDark ? "Light mode" : "Dark mode"}
            >
              {isDark ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            <div className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className={`relative w-9 h-9 flex items-center justify-center rounded-full transition-colors ${isDark ? "text-gray-400 hover:bg-white/5" : "text-gray-500 hover:bg-gray-100"}`}
                title="Notifications"
              >
                <Bell size={17} />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className={`absolute right-0 top-12 w-80 rounded-xl shadow-xl border z-50 ${isDark ? "bg-[#1E293B] border-[#334155]" : "bg-white border-gray-200"}`}>
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

            <Link
              href="/dashboard/profile"
              title={user.full_name}
              className="ml-1 w-9 h-9 rounded-full bg-[#2563eb] flex items-center justify-center text-white text-xs font-semibold hover:ring-2 hover:ring-[#2563eb]/40 transition-shadow shrink-0"
            >
              {initials.toUpperCase() || "?"}
            </Link>
          </div>
        </header>

        <OfflineBanner />

        <main className={`flex-1 overflow-auto ${isDark ? "bg-[#0F172A]" : "bg-[#f2f5f9]"}`}>
          <div className="p-5 lg:p-7">{children}</div>
        </main>
      </div>
    </div>
  );
}
