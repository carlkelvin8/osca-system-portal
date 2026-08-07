/**
 * Axios API client with JWT interceptors.
 * Automatically refreshes access tokens on 401.
 */
import axios, { AxiosInstance, AxiosError } from "axios";
import Cookies from "js-cookie";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost/api/v1";

// ── Client Instance ───────────────────────────────────────────────────────────

const api: AxiosInstance = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

// ── Request Interceptor — Attach Bearer Token ─────────────────────────────────

api.interceptors.request.use((config) => {
  const token = Cookies.get("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }
  return config;
});

// ── Response Interceptor — Auto Token Refresh ─────────────────────────────────

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: string) => void;
  reject: (reason: unknown) => void;
}> = [];

const processQueue = (error: AxiosError | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as typeof error.config & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers!["Authorization"] = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = Cookies.get("refresh_token");
      if (!refreshToken) {
        processQueue(error, null);
        isRefreshing = false;
        window.location.href = "/login";
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(`${API_BASE}/auth/refresh`, {
          refresh_token: refreshToken,
        });

        Cookies.set("access_token", data.access_token, {
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          expires: 1 / 96, // 15 minutes
        });
        Cookies.set("refresh_token", data.refresh_token, {
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          expires: 7,
        });

        processQueue(null, data.access_token);
        originalRequest.headers!["Authorization"] = `Bearer ${data.access_token}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as AxiosError, null);
        Cookies.remove("access_token");
        Cookies.remove("refresh_token");
        window.location.href = "/login";
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;

// ── API Functions ─────────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    api.post("/auth/login", { email, password }),
  logout: () => api.post("/auth/logout"),
  me: () => api.get("/auth/me"),
  refresh: (refresh_token: string) =>
    api.post("/auth/refresh", { refresh_token }),
};

export const usersApi = {
  list: (params?: Record<string, string | number | boolean>) =>
    api.get("/users", { params }),
  get: (id: string) => api.get(`/users/${id}`),
  create: (data: Record<string, unknown>) => api.post("/users/register", data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch(`/users/${id}`, data),
  deactivate: (id: string) => api.delete(`/users/${id}`),
  deletePermanently: (id: string) => api.delete(`/users/${id}/permanent`),
  uploadProfilePicture: (userId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.put(`/users/${userId}/profile-picture`, formData);
  },
};

export const attendanceApi = {
  createSession: (data: Record<string, unknown>) =>
    api.post("/attendance/sessions", data),
  updateSession: (id: string, data: Record<string, unknown>) =>
    api.patch(`/attendance/sessions/${id}`, data),
  endSession: (id: string) =>
    api.post(`/attendance/sessions/${id}/end`),
  listSessions: (params?: Record<string, string | number | boolean>) =>
    api.get("/attendance/sessions", { params }),
  getSession: (id: string) =>
    api.get(`/attendance/sessions/${id}`),
  scan: (data: Record<string, unknown>) =>
    api.post("/attendance/scan", data),
  enroll: (data: Record<string, unknown>) =>
    api.post("/attendance/enroll", data),
  getRecords: (params?: Record<string, string | number | boolean>) =>
    api.get("/attendance/records", { params }),
};

export const inventoryApi = {
  listEquipment: (params?: Record<string, string | number | boolean>) =>
    api.get("/inventory/equipment", { params }),
  getEquipment: (id: string) => api.get(`/inventory/equipment/${id}`),
  getEquipmentByQR: (qrCode: string) =>
    api.get(`/inventory/equipment/qr/${qrCode}`),
  createEquipment: (data: Record<string, unknown>) =>
    api.post("/inventory/equipment", data),
  updateEquipment: (id: string, data: Record<string, unknown>) =>
    api.patch(`/inventory/equipment/${id}`, data),
  getMyBorrowingId: () =>
    api.get("/inventory/borrowing-ids/me"),
  issueBorrowingId: (instructorId: string) =>
    api.post(`/inventory/borrowing-ids/${instructorId}`),
  borrow: (data: Record<string, unknown>) => api.post("/inventory/borrow", data),
  return: (data: Record<string, unknown>) => api.post("/inventory/return", data),
  listTransactions: (params?: Record<string, string | number | boolean>) =>
    api.get("/inventory/transactions", { params }),
  // Equipment Request workflow
  createRequest: (data: Record<string, unknown>) =>
    api.post("/inventory/requests", data),
  listRequests: (params?: Record<string, string | number | boolean>) =>
    api.get("/inventory/requests", { params }),
  getRequest: (id: string) => api.get(`/inventory/requests/${id}`),
  getRequestQR: (id: string) =>
    api.get(`/inventory/requests/${id}/qr`, { responseType: "blob" }),
  getRequestByQR: (qrValue: string) =>
    api.get(`/inventory/requests/qr/${encodeURIComponent(qrValue)}`),
  getRequestsByEquipment: (equipmentId: string) =>
    api.get(`/inventory/requests/by-equipment/${equipmentId}`),
  approveRequest: (id: string, data?: Record<string, unknown>) =>
    api.put(`/inventory/requests/${id}/approve`, data ?? {}),
  rejectRequest: (id: string, rejection_reason: string) =>
    api.put(`/inventory/requests/${id}/reject`, { rejection_reason }),
  cancelRequest: (id: string) =>
    api.put(`/inventory/requests/${id}/cancel`),
  deleteRequest: (id: string) =>
    api.delete(`/inventory/requests/${id}`),
};

export const staffBorrowApi = {
  scanBorrowingId: (qrCode: string) =>
    api.get(`/inventory/borrowing-ids/scan/${encodeURIComponent(qrCode)}`),
  createBorrow: (data: Record<string, unknown>) =>
    api.post("/inventory/borrow/staff", data),
  scanTransactionQr: (qrCode: string) =>
    api.get(`/inventory/transactions/qr/${encodeURIComponent(qrCode)}`),
  confirmRelease: (id: string, data?: Record<string, unknown>) =>
    api.put(`/inventory/transactions/${id}/release`, data ?? {}),
  completeTransaction: (id: string) =>
    api.put(`/inventory/transactions/${id}/complete`),
};

export type ReportFormat = "json" | "csv" | "xlsx" | "pdf";

const reportGet = (
  path: string,
  params: Record<string, unknown>,
  format: ReportFormat = "json",
) =>
  api.get(path, {
    params: { ...params, format },
    responseType: format === "json" ? "json" : "blob",
  });

export const reportsApi = {
  attendancePdf: (params?: Record<string, string>) =>
    api.get("/reports/attendance/pdf", {
      params,
      responseType: "blob",
    }),
  attendanceXlsx: (params?: Record<string, string>) =>
    api.get("/reports/attendance/xlsx", {
      params,
      responseType: "blob",
    }),
  inventoryPdf: () => api.get("/reports/inventory/pdf", { responseType: "blob" }),
  inventoryXlsx: () =>
    api.get("/reports/inventory/xlsx", { responseType: "blob" }),
  inventoryMonthly: (year: number, month: number, format: "json" | "pdf" | "xlsx" | "csv" = "json") =>
    api.get("/reports/inventory/monthly", {
      params: { year, month, format },
      responseType: format === "json" ? "json" : "blob",
    }),
  dashboardSummary: () => api.get("/reports/dashboard/summary"),
  dailyAttendance: (params?: Record<string, unknown>) => {
    const fmt = params?.format as string;
    return api.get("/reports/attendance/daily", {
      params,
      responseType: fmt && fmt !== "json" ? "blob" : "json",
    });
  },
  weeklyAttendance: (params?: Record<string, unknown>) => {
    const fmt = params?.format as string;
    return api.get("/reports/attendance/weekly", {
      params,
      responseType: fmt && fmt !== "json" ? "blob" : "json",
    });
  },
  monthlyAttendance: (params?: Record<string, unknown>) => {
    const fmt = params?.format as string;
    return api.get("/reports/attendance/monthly", {
      params,
      responseType: fmt && fmt !== "json" ? "blob" : "json",
    });
  },
  inventoryEquipment: (params: Record<string, unknown>, format: ReportFormat = "json") =>
    reportGet("/reports/inventory/equipment", params, format),
  borrowingHistory: (params: Record<string, unknown>, format: ReportFormat = "json") =>
    reportGet("/reports/inventory/borrowing-history", params, format),
  returnedEquipment: (params: Record<string, unknown>, format: ReportFormat = "json") =>
    reportGet("/reports/inventory/returned", params, format),
  lostDamagedEquipment: (params: Record<string, unknown>, format: ReportFormat = "json") =>
    reportGet("/reports/inventory/lost-damaged", params, format),
  venueReservations: (params: Record<string, unknown>, format: ReportFormat = "json") =>
    reportGet("/reports/facilities/venue-reservations", params, format),
  venueUsage: (params: Record<string, unknown>, format: ReportFormat = "json") =>
    reportGet("/reports/facilities/venue-usage", params, format),
  facilityStatus: (params: Record<string, unknown>, format: ReportFormat = "json") =>
    reportGet("/reports/facilities/status", params, format),
  eligibleStudents: (params: Record<string, unknown>, format: ReportFormat = "json") =>
    reportGet("/reports/eligibility/eligible", params, format),
  restrictedStudents: (params: Record<string, unknown>, format: ReportFormat = "json") =>
    reportGet("/reports/eligibility/restricted", params, format),
  ineligibleStudents: (params: Record<string, unknown>, format: ReportFormat = "json") =>
    reportGet("/reports/eligibility/ineligible", params, format),
  incidentReports: (params: Record<string, unknown>, format: ReportFormat = "json") =>
    reportGet("/reports/incidents/reports", params, format),
  incidentCategories: (params: Record<string, unknown>, format: ReportFormat = "json") =>
    reportGet("/reports/incidents/categories", params, format),
  incidentSummary: (params: Record<string, unknown>, format: ReportFormat = "json") =>
    reportGet("/reports/incidents/summary", params, format),
  activeSanctions: (params: Record<string, unknown>, format: ReportFormat = "json") =>
    reportGet("/reports/sanctions/active", params, format),
  completedSanctions: (params: Record<string, unknown>, format: ReportFormat = "json") =>
    reportGet("/reports/sanctions/completed", params, format),
  sanctionHistory: (params: Record<string, unknown>, format: ReportFormat = "json") =>
    reportGet("/reports/sanctions/history", params, format),
};

export const announcementsApi = {
  list: (params?: Record<string, string | number | boolean>) =>
    api.get("/announcements", { params }),
  create: (data: Record<string, unknown>) =>
    api.post("/announcements", data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch(`/announcements/${id}`, data),
  remove: (id: string) => api.delete(`/announcements/${id}`),
  uploadImage: (id: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post(`/announcements/${id}/image`, formData);
  },
};

export const adminApi = {
  getFRConfig: () => api.get("/admin/fr-config"),
  updateFRConfig: (data: Record<string, unknown>) => api.put("/admin/fr-config", data),
};


// ── Facilities ────────────────────────────────────────────────────────────────

export const facilitiesApi = {
  list: (params?: Record<string, string | number | boolean>) =>
    api.get("/facilities", { params }),
  create: (data: Record<string, unknown>) =>
    api.post("/facilities", data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch(`/facilities/${id}`, data),
  delete: (id: string) =>
    api.delete(`/facilities/${id}`),
  uploadImage: (id: string, formData: FormData) =>
    api.post(`/facilities/${id}/image`, formData),
  listReservations: (params?: Record<string, string | number | boolean>) =>
    api.get("/facilities/reservations", { params }),
  listVenueReservations: (id: string) =>
    api.get(`/facilities/${id}/reservations`),
  createReservation: (data: Record<string, unknown>) =>
    api.post("/facilities/reservations", data),
  approveReservation: (id: string) =>
    api.patch(`/facilities/reservations/${id}/approve`),
  rejectReservation: (id: string, data: Record<string, unknown>) =>
    api.patch(`/facilities/reservations/${id}/reject`, data),
  listSchedules: (params?: Record<string, string | number | boolean>) =>
    api.get("/facilities/schedules", { params }),
  createSchedule: (data: Record<string, unknown>) =>
    api.post("/facilities/schedules", data),
};

// ── Notifications ─────────────────────────────────────────────────────────────

export const notificationsApi = {
  list: () =>
    api.get("/notifications"),
  markRead: (id: string) =>
    api.patch(`/notifications/${id}/read`),
  markAllRead: () =>
    api.patch("/notifications/read-all"),
};

// ── Eligibility ───────────────────────────────────────────────────────────────

export const eligibilityApi = {
  list: (params?: Record<string, string | number | boolean>) =>
    api.get("/eligibility", { params }),
  listStudents: (params?: Record<string, string | number | boolean>) =>
    api.get("/eligibility/students", { params }),
  create: (data: Record<string, unknown>) =>
    api.post("/eligibility", data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch(`/eligibility/${id}`, data),
};

// ── Incidents ─────────────────────────────────────────────────────────────────

export const incidentsApi = {
  list: (params?: Record<string, string | number | boolean>) =>
    api.get("/incidents", { params }),
  create: (data: Record<string, unknown>) =>
    api.post("/incidents", data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch(`/incidents/${id}`, data),
};

// ── Sanctions ─────────────────────────────────────────────────────────────────

export const sanctionsApi = {
  list: (params?: Record<string, string | number | boolean>) =>
    api.get("/sanctions", { params }),
  create: (data: Record<string, unknown>) =>
    api.post("/sanctions", data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch(`/sanctions/${id}`, data),
  acknowledge: (id: string) =>
    api.post(`/sanctions/${id}/acknowledge`),
};

// ── Offline Sync ──────────────────────────────────────────────────────────────

export const auditLogsApi = {
  list: (params?: Record<string, string | number | boolean>) =>
    api.get("/audit-logs", { params }),
  get: (id: string) => api.get(`/audit-logs/${id}`),
  getModules: () => api.get("/audit-logs/filters/modules"),
  getActions: () => api.get("/audit-logs/filters/actions"),
  exportCsv: (params?: Record<string, string | number | boolean>) =>
    api.get("/audit-logs/export/csv", { params, responseType: "blob" }),
  exportXlsx: (params?: Record<string, string | number | boolean>) =>
    api.get("/audit-logs/export/xlsx", { params, responseType: "blob" }),
  exportPdf: (params?: Record<string, string | number | boolean>) =>
    api.get("/audit-logs/export/pdf", { params, responseType: "blob" }),
};

// ── Offline Sync ──────────────────────────────────────────────────────────────

export const syncApi = {
  upload: (data: Record<string, unknown>) =>
    api.post("/sync/upload", data),
  status: (params?: Record<string, string>) =>
    api.get("/sync/status", { params }),
  retry: (id: string) =>
    api.post(`/sync/retry/${id}`),
};
