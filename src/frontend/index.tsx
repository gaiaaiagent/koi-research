import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import './index.css';
import React, { useEffect, useState } from 'react';
import { KnowledgeTab } from './ui/knowledge-tab.tsx'; // Assuming knowledge-tab.tsx is in ./ui/
// import type { AgentPanel } from '@elizaos/core'; // Commented out if not available

const queryClient = new QueryClient();

// Simple function to extract agent ID from the URL path format: /chat/[agentId]
function extractAgentIdFromUrl(): string | null {
  try {
    const pathSegments = window.location.pathname.split('/');
    const chatIndex = pathSegments.findIndex(segment => segment === 'chat');
    
    if (chatIndex >= 0 && chatIndex < pathSegments.length - 1) {
      return pathSegments[chatIndex + 1];
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting agent ID from URL:', error);
    return null;
  }
}

function App() {
  const [agentId, setAgentId] = useState<string | null>(null);
  const fallbackAgentId = "b850bc30-45f8-0041-a00a-83df46d8555d"; // Fallback default agent ID
  
  useEffect(() => {
    // Get agent ID from URL
    const urlAgentId = extractAgentIdFromUrl();
    
    if (urlAgentId) {
      console.log(`Using agent ID from URL: ${urlAgentId}`);
      setAgentId(urlAgentId);
    } else {
      console.log(`No agent ID found in URL, using fallback: ${fallbackAgentId}`);
      setAgentId(fallbackAgentId);
    }
  }, []);
  
  // Show loading state while determining agent ID
  if (!agentId) {
    return <div className="p-4">Loading knowledge panel...</div>;
  }
  
  return (
    <QueryClientProvider client={queryClient}>
      <KnowledgeTab agentId={agentId} />
    </QueryClientProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

// Define AgentPanel locally if not available from @elizaos/core
// TODO: Verify if a shared AgentPanel type exists in @elizaos/core or elsewhere
export interface AgentPanel {
  name: string;
  path: string;
  component: React.ComponentType<any>; // or a more specific props type e.g., React.ComponentType<KnowledgePanelProps>
  icon?: string; // e.g., Lucide icon name
  public?: boolean;
  // Add other properties as defined by your panel system
}

/**
 * Defines the frontend panels provided by the Knowledge plugin.
 * These panels can be registered with the agent's UI to display plugin-specific views.
 */

// Props that might be passed to the panel component by the main application
interface KnowledgePanelProps {
  agentId: string; // UUID string
  // Add any other props your panel components might need from the core app
}

const KnowledgePanelComponent: React.FC<KnowledgePanelProps> = ({ agentId }) => {
  // The KnowledgeTab now expects agentId as a UUID.
  // If the core app passes it as string, ensure conversion or type assertion as needed.
  return <KnowledgeTab agentId={agentId as any} />; // Cast to any for now if UUID type causes issues here
};

export const panels: AgentPanel[] = [
  {
    name: 'Knowledge', // Name displayed in the UI for the tab/panel
    path: 'knowledge',   // Unique path/identifier for this panel
    component: KnowledgePanelComponent, // The React component to render
    icon: 'Book', // Optional: lucide icon name string
    public: false, // Typically, agent-specific panels are not public unless they show general info
  },
];

// You might also need to export a function that the core system calls to get these panels,
// or this array might be directly imported.
// e.g., export const getKnowledgePanels = () => panels;

// Also re-export utils or other frontend assets if needed from the plugin
export * from './utils';
