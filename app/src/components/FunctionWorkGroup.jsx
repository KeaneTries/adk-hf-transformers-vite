import { useState } from 'react';
import styled from 'styled-components';
import FunctionEvent from './FunctionEvent';

const WorkGroupContainer = styled.div`
  margin: 0.5rem 0;
  width: 100%;
  max-width: 100%;
`;

const ShowWorkHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  cursor: pointer;
  user-select: none;
  font-size: 0.9rem;
  color: #64748b;
  width: 100%;
  box-sizing: border-box;
  
  &:hover {
    background: #f1f5f9;
  }
`;

const ShowWorkButton = styled.span`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-left: auto;
`;

const FunctionEventsContainer = styled.div`
  margin-top: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
`;

const FunctionWorkGroup = ({ functionCalls = [], functionResponses = [] }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const hasFunctions = functionCalls.length > 0 || functionResponses.length > 0;
  
  if (!hasFunctions) return null;
  
  return (
    <WorkGroupContainer>
      <ShowWorkHeader onClick={() => setIsExpanded(!isExpanded)}>
        <span>Agent functions executed</span>
        <ShowWorkButton>
          Show Work {isExpanded ? '▼' : '▶'}
        </ShowWorkButton>
      </ShowWorkHeader>
      
      {isExpanded && (
        <FunctionEventsContainer>
          {functionCalls.map((functionCall, index) => (
            <FunctionEvent
              key={`call-${index}`}
              type="call"
              name={functionCall.name}
              args={functionCall.args}
            />
          ))}
          
          {functionResponses.map((functionResponse, index) => (
            <FunctionEvent
              key={`response-${index}`}
              type="response"
              name={functionResponse.name}
              response={functionResponse.response}
            />
          ))}
        </FunctionEventsContainer>
      )}
    </WorkGroupContainer>
  );
};

export default FunctionWorkGroup;