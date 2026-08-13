import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';

import { TestModeProvider } from './context/TestModeContext';

// Industry-standard guard to intercept and swallow circular structure JSON stringification crashes
// that are triggered by third-party browser extensions (like Google Translate or React DevTools)
if (typeof window !== 'undefined') {
  const isCircularError = (msg: string | null | undefined): boolean => {
    if (!msg) return false;
    const normalized = msg.toLowerCase();
    return (
      normalized.includes('circular structure') ||
      normalized.includes('circular reference') ||
      normalized.includes('json.stringify')
    );
  };

  const originalStringify = JSON.stringify;
  JSON.stringify = function (value: any, replacer?: any, space?: any) {
    try {
      return originalStringify.call(JSON, value, replacer, space);
    } catch (e: any) {
      if (e instanceof TypeError && (
        e.message.toLowerCase().includes('circular') || 
        e.message.toLowerCase().includes('json.stringify') ||
        e.message.toLowerCase().includes('stringifying')
      )) {
        try {
          const seen = new WeakSet();
          const clean = function (val: any): any {
            if (val === null || typeof val !== 'object') return val;
            if (seen.has(val)) return '[Circular]';
            seen.add(val);
            if (Array.isArray(val)) {
              return val.map(clean);
            }
            const res: any = {};
            for (const key of Object.keys(val)) {
              try {
                res[key] = clean(val[key]);
              } catch (keysErr) {
                res[key] = '[Property Unreadable]';
              }
            }
            return res;
          };
          return originalStringify.call(JSON, clean(value), replacer, space);
        } catch (innerErr) {
          return '"[Circular/Error]"';
        }
      }
      throw e;
    }
  } as any;

  window.addEventListener('error', (event) => {
    const errorMsg = event.error?.message || event.message;
    if (isCircularError(errorMsg)) {
      console.warn('Swallowed circular JSON stringification error from window.onerror:', event.error || errorMsg);
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    const errorMsg = event.reason?.message || String(event.reason);
    if (isCircularError(errorMsg)) {
      console.warn('Swallowed circular JSON stringification rejection from unhandledrejection:', event.reason || errorMsg);
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <TestModeProvider>
        <App />
      </TestModeProvider>
    </ErrorBoundary>
  </StrictMode>,
);



