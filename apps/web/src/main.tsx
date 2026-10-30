import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Root } from "./App";
import { initTheme } from "./lib/theme";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";

initTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element");
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <div className="root">
        <Root />
      </div>
    </QueryClientProvider>
  </StrictMode>,
);