import React, { createContext, useContext, useState, useEffect } from 'react';

interface TestModeContextType {
  isTestMode: boolean;
  toggleTestMode: () => void;
  resetTestData: () => Promise<void>;
}

const TestModeContext = createContext<TestModeContextType | undefined>(undefined);

export const TestModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isTestMode, setIsTestMode] = useState<boolean>(() => {
    const savedMode = localStorage.getItem('gestor_test_mode');
    return savedMode === 'true';
  });

  useEffect(() => {
    localStorage.setItem('gestor_test_mode', isTestMode.toString());

    // Intercepta requisições fetch para adicionar o cabeçalho de modo de teste
    const originalFetch = window.fetch || globalThis.fetch;
    
    const fetchInterceptor = async (...args: any[]) => {
      let [resource, config] = args;
      
      if (isTestMode) {
        if (typeof resource === 'string' && resource.includes('/api/')) {
          config = config || {};
          config.headers = {
            ...config.headers,
            'X-Test-Mode': 'true'
          };
        } else if (resource instanceof Request && resource.url.includes('/api/')) {
          resource.headers.set('X-Test-Mode', 'true');
        }
      }
      
      return originalFetch.apply(window, [resource, config] as any);
    };

    try {
      Object.defineProperty(window, 'fetch', {
        value: fetchInterceptor,
        writable: true,
        configurable: true
      });
    } catch (e) {
      try {
        Object.defineProperty(globalThis, 'fetch', {
          value: fetchInterceptor,
          writable: true,
          configurable: true
        });
      } catch (e2) {
        console.warn("Could not intercept fetch", e2);
      }
    }

    return () => {
      try {
        Object.defineProperty(window, 'fetch', {
          value: originalFetch,
          writable: true,
          configurable: true
        });
      } catch (e) {
        Object.defineProperty(globalThis, 'fetch', {
          value: originalFetch,
          writable: true,
          configurable: true
        });
      }
    };
  }, [isTestMode]);

  const toggleTestMode = () => {
    setIsTestMode(prev => !prev);
  };

  const resetTestData = async () => {
    const response = await fetch('/api/test-mode/reset', {
      method: 'POST',
      headers: { 'X-Test-Mode': 'true' }
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Falha ao resetar os dados de teste.');
    }
  };

  return (
    <TestModeContext.Provider value={{ isTestMode, toggleTestMode, resetTestData }}>
      {children}
    </TestModeContext.Provider>
  );
};

export const useTestMode = () => {
  const context = useContext(TestModeContext);
  if (context === undefined) {
    throw new Error('useTestMode must be used within a TestModeProvider');
  }
  return context;
};
