import { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';

export default function SessionMenu({ onDelete, isDeleting }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleMenuClick = (e) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    setIsOpen(false);
    onDelete();
  };

  return (
    <MenuContainer ref={menuRef}>
      <MenuButton onClick={handleMenuClick} disabled={isDeleting}>
        {isDeleting ? '...' : '⋮'}
      </MenuButton>
      {isOpen && (
        <MenuDropdown>
          <MenuItem onClick={handleDelete} $danger>
            Delete Session
          </MenuItem>
        </MenuDropdown>
      )}
    </MenuContainer>
  );
}

const MenuContainer = styled.div`
  position: relative;
`;

const MenuButton = styled.button`
  background: none;
  border: none;
  color: #6b7280;
  font-size: 1.25rem;
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 0.25rem;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background: #f3f4f6;
    color: #374151;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.3;
  }
`;

const MenuDropdown = styled.div`
  position: absolute;
  top: 100%;
  right: 0;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  z-index: 10;
  min-width: 120px;
`;

const MenuItem = styled.button`
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  font-size: 0.875rem;
  color: ${props => props.$danger ? '#dc2626' : '#374151'};
  
  &:hover {
    background: ${props => props.$danger ? '#fee2e2' : '#f3f4f6'};
  }

  &:first-child {
    border-radius: 0.5rem 0.5rem 0 0;
  }

  &:last-child {
    border-radius: 0 0 0.5rem 0.5rem;
  }
`;