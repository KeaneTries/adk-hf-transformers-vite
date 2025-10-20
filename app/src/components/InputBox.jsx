import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useChatStore } from '../stores/chatStore';

export default function InputBox({ onSendMessage, isLoading, isSessionReady, placeholder, onCancel }) {
  const [inputValue, setInputValue] = useState('');
  const { sessionId } = useChatStore();

  // Clear input when session changes or is reset
  useEffect(() => {
    setInputValue('');
  }, [sessionId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;
    
    await onSendMessage(inputValue);
    setInputValue('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <InputContainer>
      <TextArea
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || "Type your message..."}
        disabled={isLoading || !isSessionReady}
        rows={1}
      />
      {isLoading ? (
        <SendButton onClick={onCancel} disabled={false}>
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
  );
}

const InputContainer = styled.div`
  padding: 1rem;
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