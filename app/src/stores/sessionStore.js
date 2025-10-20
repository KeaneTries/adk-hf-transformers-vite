/**
 * Session Store using Zustand for managing multiple sessions
 */

import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { api } from '../lib/api';
import { config } from '../config';

// Helper function to ensure valid timestamp
const normalizeTimestamp = (timestamp) => {
  if (!timestamp || timestamp === 0 || isNaN(timestamp)) {
    return Math.floor(Date.now() / 1000); // Convert to seconds
  }
  
  // If timestamp is in seconds (Unix timestamp), keep it as is
  // If timestamp is in milliseconds (JavaScript timestamp), convert to seconds
  if (timestamp > 1000000000000) { // If greater than year 2001 in milliseconds
    return Math.floor(timestamp / 1000); // Convert milliseconds to seconds
  }
  
  return timestamp; // Already in seconds
};

export const useSessionStore = create()(
  devtools(
    persist(
      (set, get) => ({
        // State
        sessions: [], // Array of session objects: { id, appName, userId, lastUpdateTime, title }
        currentSessionId: null,
        isLoadingSessions: false,
        error: null,
        abortController: null,
        newlyCreatedSessions: new Set(), // Track sessions that were just created

        // Actions
        setSessions: (sessions) =>
          set((state) => {
            // Normalize timestamps for all sessions
            const normalizedSessions = sessions.map(session => ({
              ...session,
              lastUpdateTime: normalizeTimestamp(session.lastUpdateTime)
            }));
            return { 
              ...state, 
              sessions: normalizedSessions.sort((a, b) => b.lastUpdateTime - a.lastUpdateTime)
            };
          }),

        addSession: (session) =>
          set((state) => {
            const sessionWithValidTime = {
              ...session,
              lastUpdateTime: normalizeTimestamp(session.lastUpdateTime)
            };
            const newSessions = [sessionWithValidTime, ...state.sessions];
            return {
              ...state,
              sessions: newSessions.sort((a, b) => b.lastUpdateTime - a.lastUpdateTime),
            };
          }),

        updateSession: (sessionId, updates) =>
          set((state) => {
            const updatedSessions = state.sessions.map(session =>
              session.id === sessionId ? { ...session, ...updates } : session
            );
            return {
              ...state,
              sessions: updatedSessions.sort((a, b) => b.lastUpdateTime - a.lastUpdateTime),
            };
          }),

        removeSession: (sessionId) =>
          set((state) => ({
            ...state,
            sessions: state.sessions.filter(session => session.id !== sessionId),
            currentSessionId: state.currentSessionId === sessionId ? null : state.currentSessionId,
          })),

        setCurrentSessionId: (sessionId) =>
          set((state) => ({ 
            ...state, 
            currentSessionId: sessionId
          })),

        clearCurrentSession: () =>
          set((state) => ({ ...state, currentSessionId: null })),

        setLoadingSessions: (isLoading) =>
          set((state) => ({ ...state, isLoadingSessions: isLoading })),

        setError: (error) =>
          set((state) => ({ ...state, error })),

        clearError: () =>
          set((state) => ({ ...state, error: null })),

        // Fix existing sessions with invalid timestamps
        fixInvalidTimestamps: () =>
          set((state) => {
            const fixedSessions = state.sessions.map(session => ({
              ...session,
              lastUpdateTime: normalizeTimestamp(session.lastUpdateTime)
            }));
            return {
              ...state,
              sessions: fixedSessions.sort((a, b) => b.lastUpdateTime - a.lastUpdateTime)
            };
          }),

        setAbortController: (controller) =>
          set((state) => ({ ...state, abortController: controller })),

        markSessionAsNewlyCreated: (sessionId) =>
          set((state) => {
            const newSet = new Set(state.newlyCreatedSessions);
            newSet.add(sessionId);
            return { ...state, newlyCreatedSessions: newSet };
          }),

        isSessionNewlyCreated: (sessionId) => {
          const state = get();
          return state.newlyCreatedSessions.has(sessionId);
        },

        clearNewlyCreatedFlag: (sessionId) =>
          set((state) => {
            const newSet = new Set(state.newlyCreatedSessions);
            newSet.delete(sessionId);
            return { ...state, newlyCreatedSessions: newSet };
          }),

        // Refresh sessions from server (lighter version of loadSessions)
        refreshSessions: async (appName = config.defaultAppName, userId = config.defaultUserId) => {
          const state = get();
          
          try {
            const sessions = await api.chat.listSessions(appName, userId);

            const formattedSessions = sessions.map(session => ({
              id: session.id,
              appName: session.appName,
              userId: session.userId,
              lastUpdateTime: normalizeTimestamp(session.lastUpdateTime),
              title: `${session.id.slice(0, 8)}...`,
            }));

            state.setSessions(formattedSessions);
          } catch (error) {
            console.error('Failed to refresh sessions:', error);
            // Don't show error for refresh, just log it
          }
        },

        // Async actions
        loadSessions: async (appName = config.defaultAppName, userId = config.defaultUserId) => {
          const state = get();
          
          // Cancel any existing request
          if (state.abortController) {
            state.abortController.abort();
          }

          const controller = new AbortController();
          state.setAbortController(controller);
          state.setLoadingSessions(true);
          state.clearError();

          try {
            const sessions = await api.chat.listSessions(appName, userId);

            const formattedSessions = sessions.map(session => ({
              id: session.id,
              appName: session.appName,
              userId: session.userId,
              lastUpdateTime: normalizeTimestamp(session.lastUpdateTime),
              title: `${session.id.slice(0, 8)}...`,
            }));

            state.setSessions(formattedSessions);
          } catch (error) {
            if (error.name !== 'AbortError') {
              console.error('Failed to load sessions:', error);
              state.setError(`Failed to load sessions: ${error.message}`);
            }
          } finally {
            state.setLoadingSessions(false);
            state.setAbortController(null);
          }
        },

        createNewSession: async (appName = config.defaultAppName, userId = config.defaultUserId) => {
          const state = get();
          
          // Cancel any existing request
          if (state.abortController) {
            state.abortController.abort();
          }

          const controller = new AbortController();
          state.setAbortController(controller);
          state.clearError();

          try {
            const newSessionId = uuidv4();
            const sessionData = {
              sessionId: newSessionId,
              state: {},
              events: []
            };

            const response = await api.chat.createSession(appName, userId, sessionData);
            const finalSessionId = response.id || newSessionId;

            const newSession = {
              id: finalSessionId,
              appName,
              userId,
              lastUpdateTime: Math.floor(Date.now() / 1000),
              title: `${finalSessionId.slice(0, 8)}...`,
            };

            state.addSession(newSession);
            state.setCurrentSessionId(finalSessionId);
            state.markSessionAsNewlyCreated(finalSessionId);

            return finalSessionId;
          } catch (error) {
            if (error.name !== 'AbortError') {
              console.error('Failed to create session:', error);
              state.setError(`Failed to create session: ${error.message}`);
              throw error;
            }
          } finally {
            state.setAbortController(null);
          }
        },

        deleteSession: async (sessionId, appName = config.defaultAppName, userId = config.defaultUserId) => {
          const state = get();
          
          try {
            await api.chat.deleteSession(appName, userId, sessionId);
            state.removeSession(sessionId);
          } catch (error) {
            console.error('Failed to delete session:', error);
            state.setError(`Failed to delete session: ${error.message}`);
            throw error;
          }
        },

        // Selectors
        getCurrentSession: () => {
          const state = get();
          return state.sessions.find(session => session.id === state.currentSessionId);
        },

        getSessionById: (sessionId) => {
          const state = get();
          return state.sessions.find(session => session.id === sessionId);
        },
      }),
      {
        name: 'session-store',
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          sessions: state.sessions,
          currentSessionId: state.currentSessionId,
          // Don't persist newlyCreatedSessions - it should reset on page reload
        }),
        onRehydrateStorage: () => (state) => {
          // Fix any sessions with invalid timestamps after rehydration
          if (state && state.sessions) {
            const fixedSessions = state.sessions.map(session => ({
              ...session,
              lastUpdateTime: normalizeTimestamp(session.lastUpdateTime)
            }));
            state.sessions = fixedSessions.sort((a, b) => b.lastUpdateTime - a.lastUpdateTime);
          }
        },
      }
    )
  )
);

// Selector hooks for better performance
export const useSessions = () => useSessionStore((state) => state.sessions);
export const useCurrentSessionId = () => useSessionStore((state) => state.currentSessionId);
export const useSessionsLoading = () => useSessionStore((state) => state.isLoadingSessions);
export const useSessionsError = () => useSessionStore((state) => state.error);

export default useSessionStore;