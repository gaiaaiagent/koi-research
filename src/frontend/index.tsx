import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import './index.css';
import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { KnowledgeTab } from './ui/knowledge-tab.tsx';

const queryClient = new QueryClient();

// Define the interface for the ELIZA_CONFIG
interface ElizaConfig {
  agentId: string;
  apiBase: string;
}

// Declare global window extension for TypeScript
declare global {
  interface Window {
    ELIZA_CONFIG?: ElizaConfig;
  }
}

/**
 * Main Knowledge route component
 */
function KnowledgeRoute() {
  const config = window.ELIZA_CONFIG;
  const agentId = config?.agentId;
  
  if (!agentId) {
    return (
      <div className="p-4 text-center">
        <div className="text-red-600 font-medium">Error: Agent ID not found</div>
        <div className="text-sm text-gray-600 mt-2">
          The server should inject the agent ID configuration.
        </div>
      </div>
    );
  }

  return <KnowledgeProvider agentId={agentId} />;
}

/**
 * Knowledge provider component
 */
function KnowledgeProvider({ agentId }: { agentId: string }) {
  return (
    <QueryClientProvider client={queryClient}>
      <KnowledgeTab agentId={agentId} />
    </QueryClientProvider>
  );
}

// Initialize the application with router
const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <BrowserRouter>
      <Routes>
        <Route path="/display" element={<KnowledgeRoute />} />
      </Routes>
    </BrowserRouter>
  );
}

// Define types for integration with agent UI system
export interface AgentPanel {
  name: string;
  path: string;
  component: React.ComponentType<any>;
  icon?: string;
  public?: boolean;
}

interface KnowledgePanelProps {
  agentId: string;
}

/**
 * Knowledge panel component for the plugin system
 */
const KnowledgePanelComponent: React.FC<KnowledgePanelProps> = ({ agentId }) => {
  return <KnowledgeTab agentId={agentId} />;
};

// Export the panel configuration for integration with the agent UI
export const panels: AgentPanel[] = [
  {
    name: 'Knowledge',
    path: 'knowledge', 
    component: KnowledgePanelComponent,
    icon: 'Book',
    public: false,
  },
];

export * from './utils';
