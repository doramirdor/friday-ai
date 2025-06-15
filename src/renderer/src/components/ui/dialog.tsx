import React from 'react';

interface DialogProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface DialogContentProps {
  children: React.ReactNode;
  className?: string;
}

interface DialogHeaderProps {
  children: React.ReactNode;
  className?: string;
}

interface DialogTitleProps {
  children: React.ReactNode;
  className?: string;
}

interface DialogTriggerProps {
  children: React.ReactNode;
  asChild?: boolean;
}

export const Dialog: React.FC<DialogProps> = ({ children, open, onOpenChange }) => {
  return (
    <div className={`fixed inset-0 z-50 ${open ? 'block' : 'hidden'}`}>
      <div className="fixed inset-0 bg-black/50" onClick={() => onOpenChange?.(false)} />
      {children}
    </div>
  );
};

export const DialogContent: React.FC<DialogContentProps> = ({ children, className = '' }) => {
  const baseClasses = 'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-gray-200 bg-white p-6 shadow-lg rounded-lg';
  
  return (
    <div className={`${baseClasses} ${className}`}>
      {children}
    </div>
  );
};

export const DialogHeader: React.FC<DialogHeaderProps> = ({ children, className = '' }) => {
  return (
    <div className={`flex flex-col space-y-1.5 text-center sm:text-left ${className}`}>
      {children}
    </div>
  );
};

export const DialogTitle: React.FC<DialogTitleProps> = ({ children, className = '' }) => {
  return (
    <h3 className={`text-lg font-semibold leading-none tracking-tight ${className}`}>
      {children}
    </h3>
  );
};

export const DialogTrigger: React.FC<DialogTriggerProps> = ({ children }) => {
  return <>{children}</>;
}; 