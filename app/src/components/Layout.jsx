import { Outlet, useParams, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import SessionList from './SessionList';

export default function Layout() {
  const { sessionId } = useParams();
  const location = useLocation();

  // Show session list for chat routes (both /chat and /chat/:sessionId)
  const isChatRoute = location.pathname.startsWith('/chat');
  const hasSession = Boolean(sessionId);

  return (
    <Container>
      {isChatRoute && <SessionList />}
      <MainContent $hasSession={isChatRoute}>
        <Outlet />
      </MainContent>
    </Container>
  );
}

const Container = styled.div`
  display: flex;
  height: 100vh;
  background: #f5f5f5;
`;

const MainContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: ${props => props.$hasSession ? 'calc(100% - 300px)' : '100%'};
`;