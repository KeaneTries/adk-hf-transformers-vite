import { useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { extractDataFromSSE } from '../utils/sseParser';
import { useChatStore, chatActions } from '../stores/chatStore';
import { useSessionStore } from '../stores/sessionStore';
import { api } from '../lib/api';

export const useSSEChat = (urlSessionId) => {
  const navigate = useNavigate();
  const abortControllerRef = useRef(null);

  // Use Zustand stores
  const store = useChatStore();
  const { refreshSessions, isSessionNewlyCreated, clearNewlyCreatedFlag } = useSessionStore();
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
    pendingMessage,
  } = store;

  // Initialize store and create session
  useEffect(() => {
    if (!userId || !appName) {
      chatActions.initialize(config.defaultUserId, config.defaultAppName);
    }
  }, [userId, appName]);

  // Update session when URL changes
  useEffect(() => {
    if (urlSessionId && urlSessionId !== sessionId) {
      const currentStore = useChatStore.getState();

      // Check if the session exists in the session store
      const sessionStore = useSessionStore.getState();
      const sessionExists = sessionStore.getSessionById(urlSessionId);

      if (!sessionExists) {
        // Session doesn't exist (likely deleted), redirect to main chat page
        console.log('Session not found in store, redirecting to main chat:', urlSessionId);
        navigate('/chat', { replace: true });
        return;
      }

      currentStore.switchSession(urlSessionId);

      // Check if this is a newly created session
      if (isSessionNewlyCreated(urlSessionId)) {
        // For newly created sessions, mark as ready and check for pending messages
        console.log('Session is newly created, marking as ready:', urlSessionId);
        currentStore.setSessionReady(true);
        clearNewlyCreatedFlag(urlSessionId);

        // Check for pending message and send it
        const pendingMsg = currentStore.pendingMessage;
        if (pendingMsg) {
          console.log('📤 Sending pending message for newly created session:', pendingMsg);
          currentStore.clearPendingMessage();

          // Send the pending message directly
          setTimeout(async () => {
            let aiMessageId;
            try {
              // Add user message and prepare AI response
              aiMessageId = chatActions.sendUserMessage(pendingMsg);

              currentStore.setLoading(true);
              currentStore.clearError();

              // Create abort controller for this request
              abortControllerRef.current = new AbortController();
              currentStore.setAbortController(abortControllerRef.current);

              const requestBody = {
                appName: appName || config.defaultAppName,
                userId: userId || config.defaultUserId,
                sessionId: urlSessionId,
                newMessage: {
                  parts: [{ text: pendingMsg.trim() }],
                  role: 'user'
                },
                streaming: true
              };

              console.log('Sending pending message for newly created session...');

              // Use API client for SSE streaming
              const response = await api.chat.sendMessage(requestBody, {
                signal: abortControllerRef.current.signal,
              });

              // Handle SSE streaming
              await handleSSEStream(response, aiMessageId);

              // Refresh sessions to get updated lastUpdateTime from server
              refreshSessions();

            } catch (err) {
              if (err.name === 'AbortError') {
                console.log('Request was cancelled');
              } else {
                console.error('Chat error:', err);
                currentStore.setError(`Failed to send message: ${err.message}`);

                // Remove the failed AI message
                if (aiMessageId) {
                  currentStore.removeMessage(aiMessageId);
                }
              }
            } finally {
              currentStore.setLoading(false);
              currentStore.setProcessingFunction(false);
              currentStore.setCurrentAgent('');
              currentStore.setAbortController(null);
              abortControllerRef.current = null;
            }
          }, 100); // Small delay to ensure everything is ready
        }
      } else {
        // For existing sessions, load data from server
        loadSessionData(urlSessionId);
      }
    } else if (!urlSessionId && sessionId) {
      // Clear session when visiting /chat route (no sessionId in URL)
      const currentStore = useChatStore.getState();
      currentStore.resetSession();
    }
  }, [urlSessionId, sessionId, isSessionNewlyCreated, clearNewlyCreatedFlag, navigate]);

  const loadSessionData = useCallback(async (sessionId) => {
    try {
      const currentStore = useChatStore.getState();
      currentStore.setSessionReady(false);
      currentStore.clearError();

      console.log('Loading session data for:', sessionId);

      // Fetch session data from API
      const response = await api.chat.getSession(
        appName || config.defaultAppName,
        userId || config.defaultUserId,
        sessionId
      );

      console.log('✅ Session data loaded:', response);

      // Only clear messages if we have events to load, otherwise keep existing messages
      // This prevents clearing messages that were just added for new sessions
      if (response.events && response.events.length > 0) {
        currentStore.clearMessages();

        // Convert events to messages format
        const messages = response.events.map(event => ({
          id: event.id || uuidv4(),
          content: event.content?.parts?.find(part => part.text)?.text || '',
          role: event.content?.role || 'assistant',
          timestamp: new Date(event.timestamp).toISOString(),
          functionCalls: event.content?.parts?.filter(part => part.functionCall).map(part => part.functionCall) || [],
          functionResponses: event.content?.parts?.filter(part => part.functionResponse).map(part => part.functionResponse) || [],
        }));

        // Update store with loaded messages
        messages.forEach(message => {
          currentStore.addMessage(message);
        });
      }

      // Always set session ready after successful API response, regardless of events
      currentStore.setSessionReady(true);

      // Send pending message if there is one
      const pendingMsg = currentStore.pendingMessage;
      if (pendingMsg) {
        console.log('📤 Sending pending message:', pendingMsg);
        currentStore.clearPendingMessage();

        // Send the pending message directly without session creation check
        // since we know the session is ready at this point
        setTimeout(async () => {
          let aiMessageId;
          try {
            // Add user message and prepare AI response
            aiMessageId = chatActions.sendUserMessage(pendingMsg);

            currentStore.setLoading(true);
            currentStore.clearError();

            // Create abort controller for this request
            abortControllerRef.current = new AbortController();
            currentStore.setAbortController(abortControllerRef.current);

            const requestBody = {
              appName: appName || config.defaultAppName,
              userId: userId || config.defaultUserId,
              sessionId: sessionId,
              newMessage: {
                parts: [{ text: pendingMsg.trim() }],
                role: 'user'
              },
              streaming: true
            };

            console.log('Sending pending message directly...');

            // Use API client for SSE streaming
            const response = await api.chat.sendMessage(requestBody, {
              signal: abortControllerRef.current.signal,
            });

            // Handle SSE streaming
            await handleSSEStream(response, aiMessageId);

            // Refresh sessions to get updated lastUpdateTime from server
            refreshSessions();

          } catch (err) {
            if (err.name === 'AbortError') {
              console.log('Request was cancelled');
            } else {
              console.error('Chat error:', err);
              currentStore.setError(`Failed to send message: ${err.message}`);

              // Remove the failed AI message
              if (aiMessageId) {
                currentStore.removeMessage(aiMessageId);
              }
            }
          } finally {
            currentStore.setLoading(false);
            currentStore.setProcessingFunction(false);
            currentStore.setCurrentAgent('');
            currentStore.setAbortController(null);
            abortControllerRef.current = null;
          }
        }, 100); // Small delay to ensure everything is ready
      }
    } catch (err) {
      console.error('❌ Failed to load session:', err);
      const currentStore = useChatStore.getState();

      // If session not found (404), redirect to main chat page
      if (err.response && err.response.status === 404) {
        console.log('Session not found on server, redirecting to main chat:', sessionId);
        navigate('/chat', { replace: true });
        return;
      }

      currentStore.setError(`Failed to load session: ${err.message}`);
    }
  }, [appName, userId]);

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

      // Immediately add the session to the session store to prevent race condition
      const sessionStore = useSessionStore.getState();
      const newSession = {
        id: finalSessionId,
        appName: appName || config.defaultAppName,
        userId: userId || config.defaultUserId,
        lastUpdateTime: Math.floor(Date.now() / 1000),
        title: `${finalSessionId.slice(0, 8)}...`,
      };
      sessionStore.addSession(newSession);
      sessionStore.markSessionAsNewlyCreated(finalSessionId);

      return finalSessionId;
    } catch (err) {
      console.error('❌ Failed to create session:', err);
      const currentStore = useChatStore.getState();
      currentStore.setError(`Failed to create session: ${err.message}`);
      throw err;
    }
  }, [appName, userId]);

  // No automatic session creation - sessions are created only when user sends a message

  const sendMessage = useCallback(async (messageContent) => {
    if (!messageContent.trim() || isLoading) {
      return;
    }

    // If we don't have a session yet (on /chat route), create one first
    if (!sessionId) {
      try {
        const newSessionId = await createSession();
        // Store the pending message to send after navigation
        const currentStore = useChatStore.getState();
        currentStore.setPendingMessage(messageContent.trim());
        // Navigate to the new session URL using React Router
        navigate(`/chat/${newSessionId}`, { replace: true });
        // The message will be sent after the session loads via useEffect
        return;
      } catch (err) {
        console.error('Failed to create session for message:', err);
        return;
      }
    }

    // Check if session is ready (but skip this check if we just created the session)
    const currentStore = useChatStore.getState();
    if (!currentStore.isSessionReady) {
      currentStore.setError('Session not ready yet. Please wait...');
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
      currentStore.setAbortController(abortControllerRef.current);

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

      // Refresh sessions to get updated lastUpdateTime from server
      refreshSessions();

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
      currentStore.setAbortController(null);
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