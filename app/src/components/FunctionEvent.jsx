import { useState } from 'react';
import styled from 'styled-components';

const FunctionEventContainer = styled.div`
  background: ${props => props.$isResponse ? '#f0fdf4' : '#f0f9ff'};
  border: 1px solid ${props => props.$isResponse ? '#22c55e' : '#0ea5e9'};
  border-radius: 0.5rem;
  padding: 0.75rem;
  margin: 0.5rem 0;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
`;

const FunctionHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  color: ${props => props.$isResponse ? '#15803d' : '#0369a1'};
  cursor: pointer;
  user-select: none;
`;

const FunctionIcon = styled.span`
  font-size: 1.2rem;
`;

const FunctionName = styled.span`
  color: ${props => props.$isResponse ? '#14532d' : '#0c4a6e'};
`;

const DataContainer = styled.div`
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: ${props => props.$isResponse ? '#dcfce7' : '#e0f2fe'};
  border-radius: 0.25rem;
  font-size: 0.875rem;
`;

const DataLabel = styled.div`
  font-weight: 500;
  color: ${props => props.$isResponse ? '#15803d' : '#0369a1'};
  margin-bottom: 0.25rem;
`;

const DataContent = styled.pre`
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  color: ${props => props.$isResponse ? '#14532d' : '#0c4a6e'};
  font-size: 0.8rem;
`;

const FunctionEvent = ({ type, name, args, response }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const isResponse = type === 'response';
  const data = isResponse ? response : args;
  const hasData = data && Object.keys(data).length > 0;
  
  const getStatusText = () => {
    if (isResponse) {
      return hasData ? 'Response received' : 'No response';
    } else {
      return `(${hasData ? Object.keys(data).length : 0} args)`;
    }
  };
  
  const getIcon = () => {
    return isResponse ? '✅' : '⚡';
  };
  
  const getDataLabel = () => {
    return isResponse ? 'Response:' : 'Arguments:';
  };
  
  return (
    <FunctionEventContainer $isResponse={isResponse}>
      <FunctionHeader 
        $isResponse={isResponse}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <FunctionIcon>{getIcon()}</FunctionIcon>
        <FunctionName $isResponse={isResponse}>{name}</FunctionName>
        <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>
          {getStatusText()}
        </span>
        {hasData && (
          <span style={{ fontSize: '0.8rem', marginLeft: 'auto' }}>
            {isExpanded ? '▼' : '▶'}
          </span>
        )}
      </FunctionHeader>
      
      {isExpanded && hasData && (
        <DataContainer $isResponse={isResponse}>
          <DataLabel $isResponse={isResponse}>{getDataLabel()}</DataLabel>
          <DataContent $isResponse={isResponse}>
            {JSON.stringify(data, null, 2)}
          </DataContent>
        </DataContainer>
      )}
    </FunctionEventContainer>
  );
};

export default FunctionEvent;