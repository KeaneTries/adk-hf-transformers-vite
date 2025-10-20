import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { useSessionStore } from '../stores/sessionStore';
import { useSSEChat } from '../hooks/useSSEChat';
import InputBox from './InputBox';

export default function Welcome() {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const { createNewSession } = useSessionStore();
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  const {
    isLoading,
    isSessionReady,
    sendMessage,
    cancelRequest,
  } = useSSEChat(sessionId);



  const handleSendMessage = async (messageContent) => {
    try {
      let currentSessionId = sessionId;

      // If no session exists, create one first
      if (!currentSessionId) {
        setIsCreatingSession(true);
        currentSessionId = await createNewSession();
        if (currentSessionId) {
          // Navigate to the new session with the message in state
          navigate(`/chat/${currentSessionId}`, {
            state: { initialMessage: messageContent }
          });
        }
        setIsCreatingSession(false);
      } else {
        // Send the message directly if session already exists
        await sendMessage(messageContent);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      setIsCreatingSession(false);
    }
  };

  return (
    <Container>
      <Content>
        <Title>Welcome to ADK Chats</Title>
        <Description>
          {sessionId ? "Let's continue our conversation with your AI assistant." : 'Go ahead and ask our AI assistant anything!'}
        </Description>
        <InputBoxWrapper>
          <InputBox
            onSendMessage={handleSendMessage}
            isLoading={isLoading || isCreatingSession}
            isSessionReady={sessionId ? isSessionReady : true}
            placeholder={sessionId ? "Type your message to start the conversation..." : "Type your message to create a new session..."}
            onCancel={cancelRequest}
          />
        </InputBoxWrapper>
      </Content>
    </Container>
  );
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
`;

const Content = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  width: 70vw;
  max-width: 70vw;
  margin: 0 auto;
  padding: 2rem;
`;

const Title = styled.h1`
  font-size: 2rem;
  font-weight: 600;
  color: #343a40;
  margin-bottom: 1rem;
`;

const Description = styled.p`
  font-size: 1.1rem;
  color: #6c757d;
  line-height: 1.6;
  margin-bottom: 2rem;
`;

const InputBoxWrapper = styled.div`
  width: 100%;
  max-width: 500px;
`;