import React from 'react';

interface DrawerProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface DrawerContentProps {
  children: React.ReactNode;
  className?: string;
}

interface DrawerTriggerProps {
  children: React.ReactNode;
}

export const Drawer: React.FC<DrawerProps> = ({ children, open, onOpenChange }) => {
  return (
    <div className={`fixed inset-0 z-50 ${open ? 'block' : 'hidden'}`}>
      <div className="fixed inset-0 bg-black/50" onClick={() => onOpenChange?.(false)} />
      {children}
    </div>
  );
};

export const DrawerContent: React.FC<DrawerContentProps> = ({ children, className = '' }) => {
  const baseClasses = 'fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 rounded-t-lg p-4 max-h-[80vh] overflow-y-auto';
  
  return (
    <div className={`${baseClasses} ${className}`}>
      {children}
    </div>
  );
};

export const DrawerTrigger: React.FC<DrawerTriggerProps> = ({ children }) => {
  return <>{children}</>;
}; 