"use client";

import { useEffect, useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import { inventoryApi, usersApi } from "@/lib/api";
import {
  User as UserIcon,
  Mail,
  Shield,
  Calendar,
  Activity,
  Camera,
  Loader2,
  Download,
  Printer,
} from "lucide-react";
import { format } from "date-fns";
import QRCode from "qrcode";
import { Avatar } from "@/components/ui/Avatar";
import DigitalID from "@/components/ui/DigitalID";

export default function ProfilePage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const digitalIdRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const hasBorrowingQR = user?.role === "coach" || user?.role === "pe_instructor";
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const { data: borrowingId, isLoading: loadingBid } = useQuery({
    queryKey: ["borrowing-id-me"],
    queryFn: async () => {
      const res = await inventoryApi.getMyBorrowingId();
      return res.data as { qr_code: string; is_active: boolean };
    },
    enabled: hasBorrowingQR,
  });

  useEffect(() => {
    if (borrowingId?.qr_code) {
      QRCode.toDataURL(borrowingId.qr_code, { width: 200, margin: 2 })
        .then(setQrDataUrl)
        .catch(() => setQrDataUrl(null));
    }
  }, [borrowingId?.qr_code]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const res = await usersApi.uploadProfilePicture(user.id, file);
      useAuthStore.setState({ user: { ...user, profile_picture_url: res.data.profile_picture_url } });
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch {
      // silently fail
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDownload = async () => {
    if (!digitalIdRef.current) return;
    setDownloading(true);
    try {
      const { toPng } = await import("dom-to-image-more");
      const dataUrl = await toPng(digitalIdRef.current, { quality: 1 });
      const link = document.createElement("a");
      link.download = `digital-id-${user?.full_name.replace(/\s+/g, "-").toLowerCase()}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      // silently fail
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (!user) return null;

  const roleLabel: Record<string, string> = {
    admin: "System Administrator",
    director: "OSCA Director",
    coach: "Coach",
    pe_instructor: "PE Instructor",
    student: "Student",
  };

  const infoRows: { label: string; value: string | null; icon: React.ElementType }[] = [
    { label: "Email", value: user.email, icon: Mail },
    { label: "Role", value: roleLabel[user.role] ?? user.role, icon: Shield },
    { label: "Sport / Art", value: user.sport_or_art, icon: Activity },
    { label: "Course", value: user.course, icon: UserIcon },
    { label: "Year Level", value: user.year_level, icon: UserIcon },
    { label: "Student ID", value: user.student_id, icon: UserIcon },
    { label: "Employee ID", value: user.employee_id, icon: UserIcon },
    { label: "Department", value: user.department, icon: UserIcon },
    {
      label: "Member Since",
      value: user.created_at ? format(new Date(user.created_at), "MMMM d, yyyy") : null,
      icon: Calendar,
    },
    {
      label: "Last Login",
      value: user.last_login_at
        ? format(new Date(user.last_login_at), "MMM d, yyyy 'at' h:mm a")
        : null,
      icon: Calendar,
    },
  ];

  const visibleRows = infoRows.filter((r) => r.value);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="text-sm text-gray-500">Your account information</p>
      </div>

      {/* Profile card */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-[#1E3A5F] to-[#2563eb]" />

        <div className="px-6 pb-6">
          <div className="-mt-12 mb-4 relative inline-block">
            <Avatar
              src={user.profile_picture_url}
              name={user.full_name}
              size="xl"
              className="border-4 border-white shadow-lg"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-0 right-0 w-8 h-8 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-full flex items-center justify-center shadow-lg transition disabled:opacity-60"
              title="Change profile picture"
            >
              {uploading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Camera size={14} />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleUpload}
              className="hidden"
            />
          </div>

          <h2 className="text-xl font-bold text-gray-900">{user.full_name}</h2>
          <p className="text-sm text-gray-500">{roleLabel[user.role] ?? user.role}</p>
          {user.sport_or_art && (
            <span className="inline-block mt-2 px-3 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
              {user.sport_or_art}
            </span>
          )}
        </div>
      </div>

      {/* Digital ID — Coach / PE Instructor only */}
      {hasBorrowingQR && (
        <div className="flex flex-col items-center gap-4">
          {qrDataUrl && borrowingId ? (
            <>
              <DigitalID
                ref={digitalIdRef}
                user={user}
                qrDataUrl={qrDataUrl}
                borrowingQrCode={borrowingId.qr_code}
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-[#0d1f3c] text-white rounded-lg hover:bg-[#16304f] transition disabled:opacity-50 font-medium"
                >
                  {downloading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  Download Digital ID
                </button>
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium"
                >
                  <Printer size={14} />
                  Print Digital ID
                </button>
              </div>
            </>
          ) : loadingBid ? (
            <div className="flex flex-col items-center gap-2 py-8">
              <Loader2 size={24} className="animate-spin text-gray-400" />
              <p className="text-sm text-gray-400">Generating your Digital ID&hellip;</p>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">
              Unable to load Digital ID. Please try again later.
            </p>
          )}
        </div>
      )}

      {/* Info table */}
      <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
        {visibleRows.map((row) => {
          const Icon = row.icon;
          return (
            <div key={row.label} className="flex items-center gap-3 px-6 py-4">
              <Icon size={16} className="text-gray-400 shrink-0" />
              <span className="text-sm text-gray-500 w-32 shrink-0">{row.label}</span>
              <span className="text-sm font-medium text-gray-900">{row.value}</span>
            </div>
          );
        })}
      </div>

      {/* Status badges */}
      <div className="flex flex-wrap gap-3">
        <span
          className={`px-3 py-1.5 text-xs font-medium rounded-full ${
            user.is_active
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {user.is_active ? "Active" : "Inactive"}
        </span>
        <span
          className={`px-3 py-1.5 text-xs font-medium rounded-full ${
            user.is_face_enrolled
              ? "bg-blue-100 text-blue-800"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          {user.is_face_enrolled ? "Face Enrolled" : "Not Enrolled"}
        </span>
        {user.biometric_consent && (
          <span className="px-3 py-1.5 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
            Biometric Consent Given
          </span>
        )}
      </div>
    </div>
  );
}
