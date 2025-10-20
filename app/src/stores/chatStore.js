/**
 * Chat Store using Zustand with Best Practices
 */

import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';

// Create the chat store with middleware composition
export const useChatStore = create()(
  devtools(
    persist(
      (set, get) => ({
        // State
        messages: [],
        isLoading: false,
        isProcessingFunction: false,
        error: null,
        sessionId: null,
        isSessionReady: false,
        currentAgent: '',
        userId: null,
        appName: null,
        abortController: null,
        pendingMessage: null,

        // Actions
        addMessage: (message) => {
          const newMessage = {
            id: uuidv4(),
            timestamp: new Date().toISOString(),
            ...message,
          };
          set((state) => ({
            ...state,
            messages: [...state.messages, newMessage],
          }));
          return newMessage.id;
        },

        updateMessage: (messageId, updates) =>
          set((state) => ({
            ...state,
            messages: state.messages.map(msg =>
              msg.id === messageId ? { ...msg, ...updates } : msg
            ),
          })),

        removeMessage: (messageId) =>
          set((state) => ({
            ...state,
            messages: state.messages.filter(msg => msg.id !== messageId),
          })),

        clearMessages: () =>
          set((state) => ({ ...state, messages: [] })),

        setLoading: (isLoading) =>
          set((state) => ({ ...state, isLoading })),

        setProcessingFunction: (isProcessing) =>
          set((state) => ({ ...state, isProcessingFunction: isProcessing })),

        setError: (error) =>
          set((state) => ({ ...state, error })),

        clearError: () =>
          set((state) => ({ ...state, error: null })),

        setSessionId: (sessionId) =>
          set((state) => ({ ...state, sessionId })),

        setSessionReady: (isReady) =>
          set((state) => ({ ...state, isSessionReady: isReady })),

        setCurrentAgent: (agent) =>
          set((state) => ({ ...state, currentAgent: agent })),

        setUserId: (userId) =>
          set((state) => ({ ...state, userId })),

        setAppName: (appName) =>
          set((state) => ({ ...state, appName })),

        setAbortController: (controller) =>
          set((state) => ({ ...state, abortController: controller })),

        setPendingMessage: (message) =>
          set((state) => ({ ...state, pendingMessage: message })),

        clearPendingMessage: () =>
          set((state) => ({ ...state, pendingMessage: null })),

        abortCurrentRequest: () => {
          const state = get();
          if (state.abortController) {
            state.abortController.abort();
            state.setAbortController(null);
          }
        },

        resetSession: () => {
          const state = get();
          // Abort any ongoing request first
          if (state.abortController) {
            state.abortController.abort();
          }
          
          set((prevState) => ({
            ...prevState,
            sessionId: null,
            isSessionReady: false,
            currentAgent: '',
            messages: [],
            error: null,
            isLoading: false,
            isProcessingFunction: false,
            abortController: null,
            pendingMessage: null,
          }));
        },

        switchSession: (newSessionId) =>
          set((state) => ({
            ...state,
            sessionId: newSessionId,
            isSessionReady: false,
            currentAgent: '',
            messages: [],
            error: null,
          })),

        // Selectors
        getMessageById: (messageId) => {
          const state = get();
          return state.messages.find(msg => msg.id === messageId);
        },

        canSendMessage: () => {
          const state = get();
          return state.isSessionReady && !state.isLoading;
        },
      }),
      {
        name: 'chat-store',
        storage: createJSONStorage(() => sessionStorage),
        partialize: (state) => ({
          messages: state.messages,
          sessionId: state.sessionId,
          userId: state.userId,
          appName: state.appName,
        }),
      }
    )
  )
);

// Selector hooks for better performance
export const useChatMessages = () => useChatStore((state) => state.messages);
export const useChatLoading = () => useChatStore((state) => state.isLoading);
export const useChatError = () => useChatStore((state) => state.error);

// Action creators for complex operations
export const chatActions = {
  initialize: (userId, appName) => {
    const store = useChatStore.getState();
    store.setUserId(userId);
    store.setAppName(appName);
  },

  sendUserMessage: (content) => {
    const store = useChatStore.getState();
    
    // Add user message
    store.addMessage({
      content: content.trim(),
      role: 'user',
    });

    // Add AI message placeholder
    const aiMessageId = store.addMessage({
      content: '',
      role: 'assistant',
      isStreaming: true,
      hasContent: false,
    });

    return aiMessageId;
  },

  addFunctionCall: (messageId, functionCall) => {
    const store = useChatStore.getState();
    const message = store.getMessageById(messageId);
    
    if (message) {
      const functionCalls = message.functionCalls || [];
      store.updateMessage(messageId, {
        functionCalls: [...functionCalls, functionCall],
        hasContent: true,
      });
    }
  },

  addFunctionResponse: (messageId, functionResponse) => {
    const store = useChatStore.getState();
    const message = store.getMessageById(messageId);
    
    if (message) {
      const functionResponses = message.functionResponses || [];
      store.updateMessage(messageId, {
        functionResponses: [...functionResponses, functionResponse],
        hasContent: true,
      });
    }
  },
};

export default useChatStore;