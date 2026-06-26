"use client";

import { ChatbotLauncher, ChatbotProvider } from "@rsainth/chatdock-sdk/react";
import type { ReactNode } from "react";

async function getDemoToken() {
  return "next-basic-demo-token";
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ChatbotProvider
      endpoint="/api/chat"
      getAuthToken={getDemoToken}
      context={() => ({
        pathname: window.location.pathname,
        example: "next-basic",
      })}
      initialSuggestions={[
        "What is my current status?",
        "What does this example include?",
        "How do I replace the local model?",
      ]}
      labels={{
        panelTitle: "Next Basic Assistant",
        panelSubtitle: "Local mock model, SDK route, and one demo tool.",
      }}
    >
      {children}
      <ChatbotLauncher />
    </ChatbotProvider>
  );
}
