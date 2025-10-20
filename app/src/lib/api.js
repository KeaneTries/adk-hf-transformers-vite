/**
 * Axios API Client with Best Practices
 */

import axios from 'axios';
import { config } from '../config.js';

// Create axios instance with base configuration
const apiClient = axios.create({
  baseURL: config.apiBaseUrl,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    if (import.meta.env.DEV) {
      console.log('🚀 API Request:', config.method?.toUpperCase(), config.url);
    }
    return config;
  },
  (error) => {
    console.error('❌ Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor
apiClient.interceptors.response.use(
  (response) => {
    if (import.meta.env.DEV) {
      console.log('✅ API Response:', response.status, response.config.url);
    }
    return response;
  },
  (error) => {
    if (import.meta.env.DEV) {
      console.error('❌ API Error:', error.response?.status, error.message);
    }
    return Promise.reject(error);
  }
);

// API methods
export const api = {
  get: (url, config = {}) => apiClient.get(url, config),
  post: (url, data, config = {}) => apiClient.post(url, data, config),
  put: (url, data, config = {}) => apiClient.put(url, data, config),
  patch: (url, data, config = {}) => apiClient.patch(url, data, config),
  delete: (url, config = {}) => apiClient.delete(url, config),

  // Chat-specific methods
  chat: {
    createSession: async (appName, userId, sessionData) => {
      const response = await apiClient.post(
        `/apps/${appName}/users/${userId}/sessions`,
        sessionData
      );
      return response.data;
    },

    getSession: async (appName, userId, sessionId) => {
      const response = await apiClient.get(
        `/apps/${appName}/users/${userId}/sessions/${sessionId}`
      );
      return response.data;
    },

    listSessions: async (appName, userId) => {
      const response = await apiClient.get(
        `/apps/${appName}/users/${userId}/sessions`
      );
      return response.data;
    },

    deleteSession: async (appName, userId, sessionId) => {
      const response = await apiClient.delete(
        `/apps/${appName}/users/${userId}/sessions/${sessionId}`
      );
      return response.data;
    },

    sendMessage: async (requestBody, options = {}) => {
      // Use fetch for SSE since axios doesn't handle it well
      const url = `${apiClient.defaults.baseURL}/run_sse`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(requestBody),
        ...options,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return response;
    },
  },
};

export { apiClient };
export default api;