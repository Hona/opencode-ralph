import type { AgentAdapter } from "./types";

const adapters = new Map<string, AgentAdapter>();

export function registerAdapter(adapter: AgentAdapter): void {
  if (adapters.has(adapter.name)) {
    throw new Error(`Adapter "${adapter.name}" already registered`);
  }
  adapters.set(adapter.name, adapter);
}

export function getAdapter(name: string): AgentAdapter | undefined {
  return adapters.get(name);
}

export function listAdapters(): AgentAdapter[] {
  return Array.from(adapters.values());
}

export async function initializeAdapters(): Promise<void> {
  if (adapters.size > 0) return;
  const { OpencodeRunAdapter } = await import("./opencode-run");
  const { CodexAdapter } = await import("./codex");

  registerAdapter(new OpencodeRunAdapter());
  registerAdapter(new CodexAdapter());
}
