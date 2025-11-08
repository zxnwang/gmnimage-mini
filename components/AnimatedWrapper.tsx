import React from 'react';

interface AnimatedWrapperProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}

const AnimatedWrapper: React.FC<AnimatedWrapperProps> = ({ children, delay = 0, className = '' }) => {
  const style: React.CSSProperties = {
    animationDelay: `${delay}ms`,
    animationFillMode: 'backwards',
  };

  return (
    <div style={style} className={`animate-fade-in-up ${className}`}>
      {children}
    </div>
  );
};

export default AnimatedWrapper;
