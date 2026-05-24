export interface ToolParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

export interface McpTool {
  name: string;
  description: string;
  parameters: ToolParameter[];
}

export interface McpServer {
  id: string;
  name: string;
  description: string;
  url: string;
  connected: boolean;
  tools: McpTool[];
}

export interface PacketLog {
  id: string;
  timestamp: string;
  direction: "client-to-host" | "host-to-server" | "server-to-host" | "host-to-llm" | "llm-to-host";
  service: string;
  payload: any;
}

export interface Message {
  id: string;
  sender: "user" | "assistant" | "system" | "mcp-call";
  text: string;
  timestamp: Date;
  toolUsage?: {
    toolName: string;
    params: any;
    result: any;
  };
}

export interface TenderRequirement {
  category: "SOA" | "ISO" | "Fatturato" | "Referenze" | "Altro";
  description: string;
  satisfied: boolean;
  details: string;
}

export interface DocumentSection {
  id: string;
  title: string;
  importance: "high" | "medium" | "low";
  summary: string;
  originalTextSnippet: string;
  scoreWeight?: string; // e.g. "30 Punti" or "25 Punti"
}

export interface TenderDocument {
  id: string;
  title: string;
  cig: string;
  region: string;
  value: string;
  category: string;
  deadline: string;
  requirements: TenderRequirement[];
  sections: DocumentSection[];
  anomalies: string[];
  penalties: string[];
}
