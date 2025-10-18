import { useState, useRef, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { extractDataFromSSE } from '../utils/sseParser';

export const useSSEChat = () => {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingFunction, setIsProcessingFunction] = useState(false);
  const [error, setError] = useState(null);
  const [currentAgent, setCurrentAgent] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [isSessionReady, setIsSessionReady] = useState(false);
  
  const abortControllerRef = useRef(null);
  
  // Session management
  const userId = config.defaultUserId;
  const appName = config.defaultAppName;

  // Create session on component mount
  useEffect(() => {
    const createSession = async () => {
      try {
        const newSessionId = uuidv4();
        const sessionUrl = `${config.apiBaseUrl}/apps/${appName}/users/${userId}/sessions`;
        const requestBody = {
          sessionId: newSessionId,
          state: {},
          events: []
        };
        
        console.log('Creating session...');
        console.log('URL:', sessionUrl);
        console.log('Request body:', JSON.stringify(requestBody, null, 2));
        
        const response = await fetch(sessionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody)
        });

        console.log('Session creation response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Session creation failed:', response.status, errorText);
          throw new Error(`Failed to create session: ${response.status} - ${errorText}`);
        }

        const sessionData = await response.json();
        console.log('✅ Session created successfully:', sessionData);
        
        const finalSessionId = sessionData.id || newSessionId;
        console.log('Using session ID:', finalSessionId);
        
        setSessionId(finalSessionId);
        setIsSessionReady(true);
      } catch (err) {
        console.error('❌ Failed to create session:', err);
        setError(`Failed to create session: ${err.message}`);
      }
    };

    createSession();
  }, [appName, userId]);

  const sendMessage = useCallback(async (messageContent) => {
    if (!messageContent.trim() || isLoading || !isSessionReady || !sessionId) {
      if (!isSessionReady) {
        setError('Session not ready yet. Please wait...');
      }
      return;
    }
    
    const userMessage = {
      id: uuidv4(),
      content: messageContent.trim(),
      role: 'user',
      timestamp: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);
    
    // Create AI message placeholder
    const aiMessageId = uuidv4();
    const aiMessage = {
      id: aiMessageId,
      content: '',
      role: 'assistant',
      timestamp: new Date().toISOString(),
      isStreaming: false,
      hasContent: false
    };
    
    setMessages(prev => [...prev, aiMessage]);
    
    try {
      // Create abort controller for this request
      abortControllerRef.current = new AbortController();
      
      const requestBody = {
        appName,
        userId,
        sessionId,
        newMessage: {
          parts: [
            {
              text: userMessage.content
            }
          ],
          role: 'user'
        },
        streaming: true
      };

      console.log('Sending request to:', `${config.apiBaseUrl}/run_sse`);
      console.log('Request body:', JSON.stringify(requestBody, null, 2));

      const response = await fetch(`${config.apiBaseUrl}/run_sse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(requestBody),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Response error:', response.status, errorText);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }

      // Handle SSE streaming
      console.log('✅ Response OK, starting SSE processing...');
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No readable stream available');
      }

      const decoder = new TextDecoder();
      let lineBuffer = '';
      let eventDataBuffer = '';
      let accumulatedText = '';
      let chunkCount = 0;

      const processStream = async () => {
        try {
          console.log('🔄 Starting stream processing...');
          
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              console.log('✅ Stream completed, total chunks:', chunkCount);
              break;
            }
            
            chunkCount++;
            const chunk = decoder.decode(value, { stream: true });
            console.log(`📦 Chunk ${chunkCount} (${chunk.length} bytes):`, JSON.stringify(chunk.substring(0, 200)));
            
            lineBuffer += chunk;
            
            // Process complete lines
            let eolIndex;
            while ((eolIndex = lineBuffer.indexOf('\n')) >= 0) {
              const line = lineBuffer.substring(0, eolIndex);
              lineBuffer = lineBuffer.substring(eolIndex + 1);
              
              console.log('📝 Processing line:', JSON.stringify(line));
              
              if (line.trim() === '') {
                // Empty line: dispatch event
                console.log('🔄 Empty line detected, dispatching event...');
                if (eventDataBuffer.length > 0) {
                  const jsonDataToParse = eventDataBuffer.endsWith('\n')
                    ? eventDataBuffer.slice(0, -1)
                    : eventDataBuffer;
                  
                  console.log('🎯 Parsing JSON data:', jsonDataToParse.substring(0, 200) + '...');
                  
                  try {
                    // Use proper SSE parser
                    const parsedData = extractDataFromSSE(jsonDataToParse);
                    console.log('✅ Parsed SSE data:', parsedData);
                    
                    // Process text content
                    if (parsedData.textParts.length > 0) {
                      for (const text of parsedData.textParts) {
                        console.log('📝 Adding text:', text);
                        accumulatedText += text;
                      }
                      
                      console.log('💬 Accumulated text so far:', accumulatedText);
                      
                      // Update the AI message with accumulated text
                      setMessages(prev => prev.map(msg => 
                        msg.id === aiMessageId 
                          ? { ...msg, content: accumulatedText, hasContent: true }
                          : msg
                      ));
                    }
                    
                    // Process function calls
                    if (parsedData.functionCall) {
                      console.log('⚡ Processing function call:', parsedData.functionCall);
                      setIsProcessingFunction(true);
                      setMessages(prev => prev.map(msg => 
                        msg.id === aiMessageId 
                          ? { 
                              ...msg, 
                              functionCalls: [...(msg.functionCalls || []), parsedData.functionCall],
                              hasContent: true
                            }
                          : msg
                      ));
                    }
                    
                    // Process function responses
                    if (parsedData.functionResponse) {
                      console.log('✅ Processing function response:', parsedData.functionResponse);
                      setIsProcessingFunction(false);
                      setMessages(prev => prev.map(msg => 
                        msg.id === aiMessageId 
                          ? { 
                              ...msg, 
                              functionResponses: [...(msg.functionResponses || []), parsedData.functionResponse],
                              hasContent: true
                            }
                          : msg
                      ));
                    }
                    
                    // Update current agent if available
                    if (parsedData.agent) {
                      console.log('🤖 Setting current agent:', parsedData.agent);
                      setCurrentAgent(parsedData.agent);
                    }
                    
                  } catch (parseError) {
                    console.error('❌ Failed to parse SSE event:', parseError);
                    console.error('❌ Problematic JSON:', jsonDataToParse);
                  }
                  
                  eventDataBuffer = '';
                }
              } else if (line.startsWith('data:')) {
                // Accumulate data lines
                const dataContent = line.substring(5).trimStart();
                console.log('📊 Adding data line:', dataContent);
                eventDataBuffer += dataContent + '\n';
              } else if (line.startsWith(':')) {
                console.log('💭 Comment line:', line);
              } else {
                console.log('❓ Unknown line type:', line);
              }
            }
          }
          
          // Handle any remaining data
          if (eventDataBuffer.length > 0) {
            console.log('🔚 Processing final event data buffer...');
            const jsonDataToParse = eventDataBuffer.endsWith('\n')
              ? eventDataBuffer.slice(0, -1)
              : eventDataBuffer;
            
            console.log('🎯 Final JSON data:', jsonDataToParse);
            
            try {
              const parsedData = extractDataFromSSE(jsonDataToParse);
              console.log('✅ Final parsed SSE data:', parsedData);
              
              if (parsedData.textParts.length > 0) {
                for (const text of parsedData.textParts) {
                  accumulatedText += text;
                }
                
                console.log('💬 Final accumulated text:', accumulatedText);
              }
              
              // Final update with all accumulated data
              setMessages(prev => prev.map(msg => 
                msg.id === aiMessageId 
                  ? { 
                      ...msg, 
                      content: accumulatedText, 
                      hasContent: true,
                      functionCalls: msg.functionCalls || [],
                      functionResponses: msg.functionResponses || []
                    }
                  : msg
              ));
            } catch (parseError) {
              console.error('❌ Failed to parse final SSE event:', parseError);
              console.error('❌ Final problematic JSON:', jsonDataToParse);
            }
          } else {
            console.log('ℹ️ No remaining event data to process');
          }
          
        } catch (streamError) {
          if (streamError.name !== 'AbortError') {
            console.error('Stream processing error:', streamError);
            throw streamError;
          }
        }
      };

      await processStream();
      
      // Mark streaming as complete
      setMessages(prev => prev.map(msg => 
        msg.id === aiMessageId 
          ? { ...msg, hasContent: true }
          : msg
      ));
      
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Request was cancelled');
      } else {
        console.error('Chat error:', err);
        setError(`Failed to send message: ${err.message}`);
        
        // Remove the failed AI message
        setMessages(prev => prev.filter(msg => msg.id !== aiMessageId));
      }
    } finally {
      setIsLoading(false);
      setIsProcessingFunction(false);
      setCurrentAgent('');
      abortControllerRef.current = null;
    }
  }, [isLoading, sessionId, userId, appName, isSessionReady]);

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const recreateSession = useCallback(async () => {
    setIsSessionReady(false);
    setError(null);
    
    try {
      const newSessionId = uuidv4();
      
      const response = await fetch(`${config.apiBaseUrl}/apps/${appName}/users/${userId}/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: newSessionId,
          state: {},
          events: []
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to create session: ${response.status}`);
      }

      const sessionData = await response.json();
      console.log('New session created:', sessionData);
      
      setSessionId(sessionData.id || newSessionId);
      setIsSessionReady(true);
      setMessages([]); // Clear messages for new session
    } catch (err) {
      console.error('Failed to recreate session:', err);
      setError(`Failed to recreate session: ${err.message}`);
    }
  }, [appName, userId]);

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