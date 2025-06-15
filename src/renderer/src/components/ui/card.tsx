import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Card: React.FC<CardProps> = ({ children, className = '', ...props }) => {
  const baseClasses = 'rounded-lg border border-gray-200 bg-white shadow-sm';
  
  return (
    <div className={`${baseClasses} ${className}`} {...props}>
      {children}
    </div>
  );
}; 