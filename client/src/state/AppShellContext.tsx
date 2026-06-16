import React, { createContext, useContext, useReducer, useMemo } from 'react';
import {
  shellReducer,
  initialShellState,
  type ShellState,
  type ShellAction,
} from './appMachine';

interface ShellContextValue {
  shell: ShellState;
  dispatch: React.Dispatch<ShellAction>;
}

const AppShellContext = createContext<ShellContextValue | null>(null);

export const AppShellProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [shell, dispatch] = useReducer(shellReducer, initialShellState);
  const value = useMemo(() => ({ shell, dispatch }), [shell]);
  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
};

export function useShell(): ShellContextValue {
  const ctx = useContext(AppShellContext);
  if (!ctx) throw new Error('useShell must be used within <AppShellProvider>');
  return ctx;
}
