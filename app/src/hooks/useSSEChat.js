import { useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { extractDataFromSSE } from '../utils/sseParser';
import { useChatStore, chatActions } from '../stores/chatStore';
import { api } from '../lib/api';

export const useSSEChat = () => {
  const abortControllerRef = useRef(null);

  // Use Zustand store
  const store = useChatStore();
  const {
    messages,
    isLoading,
    isProcessingFunction,
    error,
    sessionId,
    isSessionReady,
    currentAgent,
    userId,
    appName,
  } = store;

  // Initialize store and create session
  useEffect(() => {
    if (!userId || !appName) {
      chatActions.initialize(config.defaultUserId, config.defaultAppName);
    }
  }, [userId, appName]);

  const createSession = useCallback(async () => {
    try {
      const currentStore = useChatStore.getState();
      currentStore.setSessionReady(false);
      currentStore.clearError();

      const newSessionId = uuidv4();
      const sessionData = {
        sessionId: newSessionId,
        state: {},
        events: []
      };

      console.log('Creating session...');

      const response = await api.chat.createSession(
        appName || config.defaultAppName,
        userId || config.defaultUserId,
        sessionData
      );

      console.log('✅ Session created:', response);

      const finalSessionId = response.id || newSessionId;
      currentStore.setSessionId(finalSessionId);
      currentStore.setSessionReady(true);

      return finalSessionId;
    } catch (err) {
      console.error('❌ Failed to create session:', err);
      const currentStore = useChatStore.getState();
      currentStore.setError(`Failed to create session: ${err.message}`);
      throw err;
    }
  }, [appName, userId]);

  useEffect(() => {
    if (!sessionId && !isLoading) {
      createSession();
    }
  }, [sessionId, isLoading, createSession]);

  const sendMessage = useCallback(async (messageContent) => {
    if (!messageContent.trim() || isLoading || !isSessionReady || !sessionId) {
      if (!isSessionReady) {
        const currentStore = useChatStore.getState();
        currentStore.setError('Session not ready yet. Please wait...');
      }
      return;
    }

    let aiMessageId;
    try {
      // Add user message and prepare AI response
      aiMessageId = chatActions.sendUserMessage(messageContent);

      const currentStore = useChatStore.getState();
      currentStore.setLoading(true);
      currentStore.clearError();

      // Create abort controller for this request
      abortControllerRef.current = new AbortController();

      const requestBody = {
        appName: appName || config.defaultAppName,
        userId: userId || config.defaultUserId,
        sessionId,
        newMessage: {
          parts: [{ text: messageContent.trim() }],
          role: 'user'
        },
        streaming: true
      };

      console.log('Sending message...');

      // Use API client for SSE streaming
      const response = await api.chat.sendMessage(requestBody, {
        signal: abortControllerRef.current.signal,
      });

      // Handle SSE streaming
      await handleSSEStream(response, aiMessageId);

    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Request was cancelled');
      } else {
        console.error('Chat error:', err);
        const currentStore = useChatStore.getState();
        currentStore.setError(`Failed to send message: ${err.message}`);

        // Remove the failed AI message
        if (aiMessageId) {
          currentStore.removeMessage(aiMessageId);
        }
      }
    } finally {
      const currentStore = useChatStore.getState();
      currentStore.setLoading(false);
      currentStore.setProcessingFunction(false);
      currentStore.setCurrentAgent('');
      abortControllerRef.current = null;
    }
  }, [isLoading, sessionId, userId, appName, isSessionReady]);

  // Handle SSE stream processing
  const handleSSEStream = async (response, aiMessageId) => {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No readable stream available');
    }

    const decoder = new TextDecoder();
    let lineBuffer = '';
    let eventDataBuffer = '';
    let accumulatedText = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          console.log('✅ Stream completed');
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        lineBuffer += chunk;

        // Process complete lines
        let eolIndex;
        while ((eolIndex = lineBuffer.indexOf('\n')) >= 0) {
          const line = lineBuffer.substring(0, eolIndex);
          lineBuffer = lineBuffer.substring(eolIndex + 1);

          if (line.trim() === '') {
            // Empty line: dispatch event
            if (eventDataBuffer.length > 0) {
              const jsonDataToParse = eventDataBuffer.endsWith('\n')
                ? eventDataBuffer.slice(0, -1)
                : eventDataBuffer;

              try {
                const parsedData = extractDataFromSSE(jsonDataToParse);

                // Process text content
                if (parsedData.textParts.length > 0) {
                  for (const text of parsedData.textParts) {
                    accumulatedText += text;
                  }

                  // Update the AI message with accumulated text
                  const currentStore = useChatStore.getState();
                  currentStore.updateMessage(aiMessageId, {
                    content: accumulatedText,
                    hasContent: true
                  });
                }

                // Process function calls
                if (parsedData.functionCall) {
                  console.log('⚡ Processing function call:', parsedData.functionCall);
                  const currentStore = useChatStore.getState();
                  currentStore.setProcessingFunction(true);
                  chatActions.addFunctionCall(aiMessageId, parsedData.functionCall);
                }

                // Process function responses
                if (parsedData.functionResponse) {
                  console.log('✅ Processing function response:', parsedData.functionResponse);
                  const currentStore = useChatStore.getState();
                  currentStore.setProcessingFunction(false);
                  chatActions.addFunctionResponse(aiMessageId, parsedData.functionResponse);
                }

                // Update current agent
                if (parsedData.agent) {
                  const currentStore = useChatStore.getState();
                  currentStore.setCurrentAgent(parsedData.agent);
                }

              } catch (parseError) {
                console.error('❌ Failed to parse SSE event:', parseError);
              }

              eventDataBuffer = '';
            }
          } else if (line.startsWith('data:')) {
            const dataContent = line.substring(5).trimStart();
            eventDataBuffer += dataContent + '\n';
          }
        }
      }

      // Final update
      const currentStore = useChatStore.getState();
      currentStore.updateMessage(aiMessageId, {
        content: accumulatedText,
        hasContent: true,
        isStreaming: false
      });

    } catch (streamError) {
      if (streamError.name !== 'AbortError') {
        console.error('Stream processing error:', streamError);
        throw streamError;
      }
    }
  };

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const recreateSession = useCallback(async () => {
    try {
      const currentStore = useChatStore.getState();
      currentStore.resetSession();
      await createSession();
    } catch (err) {
      console.error('Failed to recreate session:', err);
      const currentStore = useChatStore.getState();
      currentStore.setError(`Failed to recreate session: ${err.message}`);
    }
  }, [createSession]);

  return {
    messages,
    isLoading,
    isProcessingFunction,
    error,
    currentAgent,
    sendMessage,
    cancelRequest,
    recreateSession,
    sessionId,
    isSessionReady
  };
};