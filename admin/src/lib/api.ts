import axios from 'axios';

const API_BASE = ''; // same origin — uses /admin/api, /health, etc. Vite proxy handles dev.

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) {
    config.headers = config.headers || {};
    (config.headers as any).Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      // auto logout on 401 unless on login page
      if (!location.pathname.includes('/admin/login')) {
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_user');
        if (location.pathname.startsWith('/admin')) location.href = '/admin/login';
      }
    }
    return Promise.reject(err);
  }
);

export type Paginated<T> = {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export async function loginAdmin(email: string, password: string) {
  const r = await api.post('/admin/api/auth/login', { email, password });
  return r.data.data as { token: string; admin: any };
}

export async function fetchMe() {
  const r = await api.get('/admin/api/auth/me');
  return r.data.data;
}

export async function fetchStats() {
  const r = await api.get('/admin/api/stats');
  return r.data.data;
}

export async function fetchAuditLogs(params: any) {
  const r = await api.get('/admin/api/audit-logs', { params });
  return r.data as Paginated<any>;
}

export async function fetchEntities(entity: string, params: any) {
  const map: Record<string, string> = {
    users: '/admin/api/users',
    technicians: '/admin/api/technicians',
    requests: '/admin/api/service-requests',
    offers: '/admin/api/offers',
    payments: '/admin/api/payment-logs',
    transactions: '/admin/api/transactions',
    instapay: '/admin/api/instapay',
    cards: '/admin/api/payment-cards',
    promos: '/admin/api/promo-codes',
    posts: '/admin/api/posts',
    verifications: '/admin/api/verifications',
    tickets: '/admin/api/support-tickets',
    reviews: '/admin/api/reviews',
    appointments: '/admin/api/appointments',
    notifications: '/admin/api/notifications',
    rooms: '/admin/api/chat-rooms',
    families: '/admin/api/families',
    search: '/admin/api/search-index',
    audit: '/admin/api/audit-logs',
  };
  const path = map[entity] || `/admin/api/${entity}`;
  const r = await api.get(path, { params });
  return r.data as Paginated<any> | any;
}
