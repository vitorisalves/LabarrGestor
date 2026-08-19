import React from 'react';
import { Search } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChange,
  placeholder = 'Buscar...',
  className = '',
  id
}) => {
  return (
    <div className={`relative group ${className}`}>
      <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
      <input
        id={id}
        type="text"
        placeholder={placeholder}
        className="w-full pl-14 pr-4 py-4 bg-white border border-slate-200 focus:border-indigo-500 rounded-2xl outline-none transition-all shadow-sm text-base font-medium"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
};
