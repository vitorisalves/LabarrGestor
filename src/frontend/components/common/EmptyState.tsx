import React from 'react';
import { LucideIcon, Package } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  message?: string;
  actionButton?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = Package,
  title = "Nenhum registro encontrado",
  description,
  message,
  actionButton,
  className = ''
}) => {
  const displayDesc = description || message;
  return (
    <div className={`flex flex-col items-center justify-center py-16 px-4 bg-white border border-dashed border-slate-200 rounded-2xl text-center ${className}`}>
      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-slate-300" />
      </div>
      <h3 className="text-lg font-bold text-slate-800 uppercase tracking-tight mb-1">{title}</h3>
      {displayDesc && <p className="text-slate-500 text-sm max-w-sm mb-6 font-medium">{displayDesc}</p>}
      {actionButton}
    </div>
  );
};
