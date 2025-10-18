import { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { useSSEChat } from '../hooks/useSSEChat';
import FunctionEvent from './FunctionEvent';

export default function Chat() {
    const [inputValue, setInputValue] = useState('');
    const messagesEndRef = useRef(null);

    const {
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
    } = useSSEChat();

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!inputValue.trim() || isLoading) return;

        await sendMessage(inputValue);
        setInputValue('');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };



    return (
        <ChatContainer>
            <Header>
                <div style={{ width: '100px' }}></div>
                <HeaderInfo>
                    <div>AI Chat Interface</div>
                    {currentAgent && <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>Agent: {currentAgent}</div>}
                    <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                        Session: {sessionId ? `${sessionId.slice(0, 8)}...` : 'Creating...'}
                        {!isSessionReady && <span style={{ color: '#fbbf24' }}> (Initializing)</span>}
                        {isSessionReady && <span style={{ color: '#10b981' }}> (Ready)</span>}
                    </div>
                </HeaderInfo>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Button onClick={recreateSession} disabled={isLoading}>
                        New Session
                    </Button>
                </div>
            </Header>

            <MessagesContainer>
                {messages.map((message) => (
                    <Message key={message.id} $isUser={message.role === 'user'}>
                        {/* Function Calls */}
                        {message.functionCalls && message.functionCalls.map((functionCall, index) => (
                            <FunctionEvent
                                key={`${message.id}-call-${index}`}
                                type="call"
                                name={functionCall.name}
                                args={functionCall.args}
                            />
                        ))}
                        
                        {/* Function Responses */}
                        {message.functionResponses && message.functionResponses.map((functionResponse, index) => (
                            <FunctionEvent
                                key={`${message.id}-response-${index}`}
                                type="response"
                                name={functionResponse.name}
                                response={functionResponse.response}
                            />
                        ))}
                        
                        {/* Regular Message Content */}
                        {message.content && (
                            <MessageBubble $isUser={message.role === 'user'}>
                                {message.content}
                            </MessageBubble>
                        )}
                        
                        {!isLoading && (
                        <MessageMeta>
                            {new Date(message.timestamp).toLocaleTimeString()}
                        </MessageMeta>)}
                    </Message>
                ))}

                {/* Show loading when waiting for initial response */}
                {isLoading && messages.length > 0 && !messages[messages.length - 1]?.hasContent && (
                    <LoadingIndicator>
                        <span>Thinking</span>
                        <LoadingDots>
                            <span></span>
                            <span></span>
                            <span></span>
                        </LoadingDots>
                    </LoadingIndicator>
                )}

                {/* Show loading when processing function calls */}
                {isProcessingFunction && (
                    <LoadingIndicator>
                        <span>Processing function call</span>
                        <LoadingDots>
                            <span></span>
                            <span></span>
                            <span></span>
                        </LoadingDots>
                    </LoadingIndicator>
                )}

                {error && <ErrorMessage>{error}</ErrorMessage>}

                {!isSessionReady && !error && (
                    <LoadingIndicator>
                        <span>Initializing session</span>
                        <LoadingDots>
                            <span></span>
                            <span></span>
                            <span></span>
                        </LoadingDots>
                    </LoadingIndicator>
                )}

                <div ref={messagesEndRef} />
            </MessagesContainer>

            <InputContainer>
                <TextArea
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={isSessionReady ? "Type your message... (Press Enter to send, Shift+Enter for new line)" : "Initializing session..."}
                    disabled={isLoading || !isSessionReady}
                    rows={1}
                />
                {isLoading ? (
                    <SendButton onClick={cancelRequest} disabled={false}>
                        Cancel
                    </SendButton>
                ) : (
                    <SendButton
                        onClick={handleSubmit}
                        disabled={!inputValue.trim() || !isSessionReady}
                    >
                        Send
                    </SendButton>
                )}
            </InputContainer>
        </ChatContainer>
    );
};

const ChatContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-width: 800px;
  margin: 0 auto;
  background: #f5f5f5;
`;

const Header = styled.div`
  background: #2563eb;
  color: white;
  padding: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: bold;
  font-size: 1.2rem;
`;

const HeaderInfo = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
`;

const Button = styled.button`
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.9rem;
  
  &:hover {
    background: rgba(255, 255, 255, 0.3);
  }
`;

const MessagesContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const Message = styled.div`
  display: flex;
  flex-direction: column;
  align-items: ${props => props.$isUser ? 'flex-end' : 'flex-start'};
`;

const MessageBubble = styled.div`
  max-width: 70%;
  padding: 0.75rem 1rem;
  border-radius: 1rem;
  background: ${props => props.$isUser ? '#2563eb' : '#ffffff'};
  color: ${props => props.$isUser ? 'white' : '#333'};
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  white-space: pre-wrap;
  word-wrap: break-word;
`;

const MessageMeta = styled.div`
  font-size: 0.75rem;
  color: #666;
  margin-top: 0.25rem;
  margin-bottom: 0.25rem;
`;

const InputContainer = styled.div`
  padding: 1rem;
  background: white;
  border-top: 1px solid #e5e5e5;
  display: flex;
  gap: 0.5rem;
  align-items: flex-end;
`;

const TextArea = styled.textarea`
  flex: 1;
  min-height: 40px;
  max-height: 120px;
  padding: 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  resize: none;
  font-family: inherit;
  font-size: 1rem;
  
  &:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
  }
  
  &:disabled {
    background: #f3f4f6;
    cursor: not-allowed;
  }
`;

const SendButton = styled.button`
  padding: 0.75rem 1.5rem;
  background: ${props => props.disabled ? '#9ca3af' : '#2563eb'};
  color: white;
  border: none;
  border-radius: 0.5rem;
  cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
  font-weight: 500;
  transition: background-color 0.2s;
  
  &:hover:not(:disabled) {
    background: #1d4ed8;
  }
`;

const LoadingIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #666;
  font-style: italic;
`;

const LoadingDots = styled.div`
  display: flex;
  gap: 2px;
  
  span {
    width: 4px;
    height: 4px;
    background: #666;
    border-radius: 50%;
    animation: pulse 1.4s ease-in-out infinite both;
    
    &:nth-child(1) { animation-delay: -0.32s; }
    &:nth-child(2) { animation-delay: -0.16s; }
    &:nth-child(3) { animation-delay: 0s; }
  }
  
  @keyframes pulse {
    0%, 80%, 100% {
      transform: scale(0);
    }
    40% {
      transform: scale(1);
    }
  }
`;

const ErrorMessage = styled.div`
  background: #fee2e2;
  color: #dc2626;
  padding: 0.75rem;
  border-radius: 0.5rem;
  margin: 0.5rem 0;
  border: 1px solid #fecaca;
`;