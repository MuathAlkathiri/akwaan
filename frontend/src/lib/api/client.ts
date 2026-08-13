import axios, { AxiosInstance, AxiosError } from "axios";
import { runtimeConfig } from "@/config/runtime-config";
import { authStorage } from "@/features/auth/storage/auth-storage";

declare module "axios" {
  export interface AxiosRequestConfig {
    skipAuthRedirect?: boolean;
  }
  export interface InternalAxiosRequestConfig {
    skipAuthRedirect?: boolean;
  }
}

let redirectingToLogin = false;

const apiClient: AxiosInstance = axios.create({
  baseURL: runtimeConfig.apiBaseUrl,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    if (typeof window !== "undefined") {
      const token = authStorage.getToken();
      if (token && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }

    // For FormData requests, remove the default JSON Content-Type header
    // and let the browser/Axios add the correct multipart boundary
    if (config.data instanceof FormData) {
      config.headers.delete("Content-Type");
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Response interceptor
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error: AxiosError) => {
    if (
      error.response?.status === 401 &&
      !error.config?.skipAuthRedirect &&
      typeof window !== "undefined"
    ) {
      authStorage.clear();
      if (window.location.pathname !== "/login" && !redirectingToLogin) {
        redirectingToLogin = true;
        window.location.href = "/login";
      }
    }

    const message =
      error.response?.data || error.message || "An error occurred";
    console.error("API Error:", message);
    return Promise.reject(error);
  },
);

export default apiClient;
