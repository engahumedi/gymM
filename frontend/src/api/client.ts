import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

interface RetryQueueItem {
  resolve: (value?: unknown) => void;
  reject: (error: unknown) => void;
  config: InternalAxiosRequestConfig;
}

let isRefreshing = false;
let retryQueue: RetryQueueItem[] = [];

function processQueue(error: AxiosError | null) {
  retryQueue.forEach(({ resolve, reject, config }) => {
    if (error) reject(error);
    else resolve(apiClient(config));
  });
  retryQueue = [];
}

// In dev: Vite proxies /api → localhost:3001
// In production: Express serves both frontend & API from the same origin
export const apiClient = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (originalRequest.url?.includes('/auth/')) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          retryQueue.push({ resolve, reject, config: originalRequest });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await apiClient.post('/auth/refresh');
        processQueue(null);
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as AxiosError);
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export function extractError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.error?.message || err.message || 'خطأ غير معروف';
  }
  if (err instanceof Error) return err.message;
  return 'خطأ غير معروف';
}
