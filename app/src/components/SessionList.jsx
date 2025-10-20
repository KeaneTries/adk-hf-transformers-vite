import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { useSessionStore } from '../stores/sessionStore';
import { useChatStore } from '../stores/chatStore';
import SessionMenu from './SessionMenu';

export default function SessionList() {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const [deletingSessionId, setDeletingSessionId] = useState(null);
  
  const {
    sessions,
    currentSessionId,
    isLoadingSessions,
    error,
    loadSessions,
    refreshSessions,
    createNewSession,
    deleteSession,
    setCurrentSessionId,
    clearCurrentSession,
    clearError,
    fixInvalidTimestamps,
    abortController,
    setAbortController,
  } = useSessionStore();

  const { resetSession, clearMessages, abortCurrentRequest } = useChatStore();

  // Load sessions on component mount and fix invalid timestamps
  useEffect(() => {
    // Fix any existing sessions with invalid timestamps first
    fixInvalidTimestamps();
    // Then load fresh sessions from API
    loadSessions();
  }, [loadSessions, fixInvalidTimestamps]);

  // Update current session when URL changes
  useEffect(() => {
    if (sessionId && sessionId !== currentSessionId) {
      setCurrentSessionId(sessionId);
    } else if (!sessionId && currentSessionId) {
      // Clear current session when on /chat route (no sessionId in URL)
      clearCurrentSession();
    }
  }, [sessionId, currentSessionId, setCurrentSessionId, clearCurrentSession]);

  // Clear current session on unmount
  useEffect(() => {
    return () => {
      clearCurrentSession();
    };
  }, [clearCurrentSession]);

  const handleSessionClick = (session) => {
    setCurrentSessionId(session.id);
    navigate(`/chat/${session.id}`);
  };

  const handleNewSession = async () => {
    try {
      clearError();
      const newSessionId = await createNewSession();
      if (newSessionId) {
        navigate(`/chat/${newSessionId}`);
      }
    } catch (error) {
      console.error('Failed to create new session:', error);
    }
  };

  const handleDeleteSession = async (sessionIdToDelete) => {
    if (!confirm('Are you sure you want to delete this session?')) {
      return;
    }

    try {
      setDeletingSessionId(sessionIdToDelete);
      await deleteSession(sessionIdToDelete);
      
      // If we deleted the current session, clear everything but stay on the page
      if (sessionIdToDelete === currentSessionId) {
        // Clear current session selection
        clearCurrentSession();
        
        // Clear chat state and messages
        resetSession();
        clearMessages();
        
        // Update URL to remove session ID but stay in the session area
        navigate('/chat', { replace: true });
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    } finally {
      setDeletingSessionId(null);
    }
  };

  const handleGoHome = () => {
    // Abort any ongoing session requests (from session store)
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }

    // Abort any ongoing chat requests (from chat store)
    abortCurrentRequest();

    // Clear current session selection
    clearCurrentSession();
    
    // Reset chat state and clear messages (this also aborts requests)
    resetSession();
    clearMessages();
    
    // Navigate to home page
    navigate('/');
  };

  const formatTime = (timestamp) => {
    // Handle invalid timestamps
    if (!timestamp || timestamp === 0 || isNaN(timestamp)) {
      return 'Just now';
    }
    
    try {
      // Convert Unix timestamp (seconds) to JavaScript timestamp (milliseconds)
      const jsTimestamp = timestamp < 1000000000000 ? timestamp * 1000 : timestamp;
      const date = new Date(jsTimestamp);
      
      // Check if the date is valid
      if (isNaN(date.getTime())) {
        return 'Just now';
      }
      return date.toLocaleString();
    } catch (error) {
      return 'Just now';
    }
  };

  return (
    <Container>
      <Header>
        <Title 
          onClick={handleGoHome}
          tabIndex={0}
        >
          ADK Chats
        </Title>
        <NewSessionButton onClick={handleNewSession} disabled={isLoadingSessions}>
          + New Chat
        </NewSessionButton>
      </Header>

      {error && (
        <ErrorMessage>
          {error}
          <button onClick={() => clearError()}>×</button>
        </ErrorMessage>
      )}

      {isLoadingSessions ? (
        <LoadingContainer>
          <LoadingSpinner />
          <span>Loading sessions...</span>
        </LoadingContainer>
      ) : (
        <SessionsList>
          {sessions.length === 0 ? (
            <EmptyState>
              <p>No sessions yet</p>
              <p>Create your first session to get started</p>
            </EmptyState>
          ) : (
            sessions.map((session) => (
              <SessionItem
                key={session.id}
                $isActive={session.id === currentSessionId}
                onClick={() => handleSessionClick(session)}
              >
                <SessionContent>
                  <SessionTitle>{session.title}</SessionTitle>
                  <SessionMeta>
                    <SessionId>{session.id.slice(0, 8)}...</SessionId>
                    <SessionTime>{formatTime(session.lastUpdateTime)}</SessionTime>
                  </SessionMeta>
                </SessionContent>
                <SessionMenu
                  onDelete={() => handleDeleteSession(session.id)}
                  isDeleting={deletingSessionId === session.id}
                />
              </SessionItem>
            ))
          )}
        </SessionsList>
      )}
    </Container>
  );
}

const Container = styled.div`
  width: 300px;
  height: 100vh;
  background: #f8f9fa;
  border-right: 1px solid #e9ecef;
  display: flex;
  flex-direction: column;
`;

const Header = styled.div`
  padding: 1rem;
  border-bottom: 1px solid #e9ecef;
  background: white;
`;

const Title = styled.h2`
  margin: 0 0 1rem 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: #343a40;
  cursor: pointer;
  transition: color 0.2s;
  outline: none;

  &:hover,
  &:focus {
    color: #2563eb;
  }
`;

const NewSessionButton = styled.button`
  width: 100%;
  padding: 0.75rem;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover:not(:disabled) {
    background: #1d4ed8;
  }

  &:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }
`;

const ErrorMessage = styled.div`
  background: #fee2e2;
  color: #dc2626;
  padding: 0.75rem;
  margin: 0.5rem;
  border-radius: 0.5rem;
  border: 1px solid #fecaca;
  display: flex;
  justify-content: space-between;
  align-items: center;

  button {
    background: none;
    border: none;
    color: #dc2626;
    font-size: 1.25rem;
    cursor: pointer;
    padding: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  gap: 1rem;
  color: #6b7280;
`;

const LoadingSpinner = styled.div`
  width: 24px;
  height: 24px;
  border: 2px solid #e5e7eb;
  border-top: 2px solid #2563eb;
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

const SessionsList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
  color: #6b7280;

  p:first-child {
    font-weight: 500;
    margin-bottom: 0.5rem;
  }

  p:last-child {
    font-size: 0.875rem;
    margin: 0;
  }
`;

const SessionItem = styled.div`
  padding: 0.75rem;
  margin-bottom: 0.5rem;
  background: ${props => props.$isActive ? '#e0e7ff' : 'white'};
  border: 1px solid ${props => props.$isActive ? '#2563eb' : '#e5e7eb'};
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: space-between;

  &:hover {
    background: ${props => props.$isActive ? '#e0e7ff' : '#f3f4f6'};
    border-color: ${props => props.$isActive ? '#2563eb' : '#d1d5db'};
    
    button {
      opacity: 1;
    }
  }
`;

const SessionContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const SessionTitle = styled.div`
  font-weight: 500;
  color: #374151;
  margin-bottom: 0.25rem;
`;

const SessionMeta = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const SessionId = styled.span`
  font-size: 0.75rem;
  color: #6b7280;
  font-family: monospace;
`;

const SessionTime = styled.span`
  font-size: 0.75rem;
  color: #6b7280;
`;

