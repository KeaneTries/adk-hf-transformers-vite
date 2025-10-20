import { useRef, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { useSSEChat } from '../hooks/useSSEChat';
import { useChatStore } from '../stores/chatStore';
import FunctionWorkGroup from './FunctionWorkGroup';
import InputBox from './InputBox';

export default function Chat() {
  const messagesEndRef = useRef(null);
  const { sessionId } = useParams();
  const location = useLocation();
  const { messages } = useChatStore();

  const {
    isLoading,
    isProcessingFunction,
    error,
    sendMessage,
    cancelRequest,
    isSessionReady
  } = useSSEChat(sessionId);

  // Check if this session has any messages
  const hasMessages = messages.length > 0;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (messageContent) => {
    await sendMessage(messageContent);
  };

  // Handle initial message from navigation state
  useEffect(() => {
    const initialMessage = location.state?.initialMessage;
    if (initialMessage && sessionId && isSessionReady && messages.length === 0) {
      handleSendMessage(initialMessage);
      // Clear the state to prevent re-sending
      window.history.replaceState({}, document.title);
    }
  }, [sessionId, isSessionReady, messages.length, location.state]);

  return (
    <ChatContainer>
      {!hasMessages ? (
        // Welcome state with centered input
        <WelcomeContainer>
          <WelcomeMessage>
            <WelcomeTitle>Start Your Conversation</WelcomeTitle>
            {sessionId && !isSessionReady ? (
              <WelcomeText>
                Initializing session{sessionId ? ` (${sessionId})` : ' (creating new session)'}
                <LoadingDots>
                  <span></span>
                  <span></span>
                  <span></span>
                </LoadingDots>
              </WelcomeText>
            ) : (
              <WelcomeText>Type a message below to begin chatting with the AI assistant.</WelcomeText>
            )}
          </WelcomeMessage>

          <WelcomeInputWrapper>
            <InputBox
              onSendMessage={handleSendMessage}
              isLoading={isLoading}
              isSessionReady={sessionId ? isSessionReady : true}
              onCancel={cancelRequest}
            />
          </WelcomeInputWrapper>
        </WelcomeContainer>
      ) : (
        // Chat state with messages and bottom input
        <>
          <MessagesContainer>
            {messages.map((message) => (
              <Message key={message.id} $isUser={message.role === 'user'}>
                {/* Function Work Group */}
                <FunctionWorkGroup
                  functionCalls={message.functionCalls || []}
                  functionResponses={message.functionResponses || []}
                />

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

            <div ref={messagesEndRef} />
          </MessagesContainer>

          <InputBoxWrapper>
            <InputBox
              onSendMessage={handleSendMessage}
              isLoading={isLoading}
              isSessionReady={sessionId ? isSessionReady : true}
              onCancel={cancelRequest}
            />
          </InputBoxWrapper>
        </>
      )}
    </ChatContainer>
  );
};

const ChatContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100vh;
  width: 70vw;
  background: #f5f5f5;
`;

const MessagesContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  padding: 10vh;
  width: 100%;
  gap: 1rem;
`;

const Message = styled.div`
  display: flex;
  flex-direction: column;
  align-items: ${props => props.$isUser ? 'flex-end' : 'flex-start'};
  width: 100%;
  max-width: 100%;
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

const InputBoxWrapper = styled.div`
  width: 100%;
  padding: 0 10vh;
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

const WelcomeContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  width: 100%;
  gap: 2rem;
`;

const WelcomeMessage = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2rem;
`;

const WelcomeInputWrapper = styled.div`
  width: 100%;
  max-width: 600px;
  padding: 0 2rem;
`;

const WelcomeTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 600;
  color: #343a40;
  margin-bottom: 0.5rem;
`;

const WelcomeText = styled.p`
  font-size: 1rem;
  color: #6c757d;
  line-height: 1.6;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  justify-content: center;
`;