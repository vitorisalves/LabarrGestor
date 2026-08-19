import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  variant?: 'default' | 'indigo' | 'emerald' | 'amber' | 'rose';
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = 'default',
  className = ''
}) => {
  const variantStyles = {
    default: 'bg-white border-slate-200 text-slate-900',
    indigo: 'bg-indigo-50/50 border-indigo-100 text-indigo-900',
    emerald: 'bg-emerald-50/50 border-emerald-100 text-emerald-900',
    amber: 'bg-amber-50/50 border-amber-100 text-amber-900',
    rose: 'bg-rose-50/50 border-rose-100 text-rose-900',
  };

  const iconBgStyles = {
    default: 'bg-slate-100 text-slate-600',
    indigo: 'bg-indigo-100 text-indigo-600',
    emerald: 'bg-emerald-100 text-emerald-600',
    amber: 'bg-amber-100 text-amber-600',
    rose: 'bg-rose-100 text-rose-600',
  };

  return (
    <div className={`p-6 rounded-2xl border shadow-sm flex items-center justify-between ${variantStyles[variant]} ${className}`}>
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">{title}</p>
        <p className="text-2xl md:text-3xl font-black">{value}</p>
        {subtitle && <p className="text-xs font-medium text-slate-400 mt-1">{subtitle}</p>}
      </div>
      {Icon && (
        <div className={`p-3 rounded-xl ${iconBgStyles[variant]}`}>
          <Icon className="w-6 h-6" />
        </div>
      )}
    </div>
  );
};
