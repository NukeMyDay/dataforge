import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from "react";
import { api } from "@/api/client.js";

interface Source {
  title: string;
  url?: string;
  type?: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

const STARTER_PROMPTS = [
  "Ich möchte ein Unternehmen gründen – wo fange ich an?",
  "Welche Rechtsform passt zu mir?",
  "Was kostet eine GmbH-Gründung?",
  "Welche Genehmigungen brauche ich als Handwerker?",
  "Was muss ich beim Finanzamt anmelden?",
];

function SourceChip({ source }: { source: Source }) {
  const label = source.title ?? source.type ?? "Quelle";
  if (source.url) {
    return (
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors border border-brand-200"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
        {label}
      </a>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
      {label}
    </span>
  );
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] sm:max-w-[70%] bg-brand-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed">
        {content}
      </div>
    </div>
  );
}

function AssistantBubble({ content, sources }: { content: string; sources?: Source[] }) {
  return (
    <div className="flex justify-start gap-3">
      <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-brand-700 text-sm font-bold">S</span>
      </div>
      <div className="max-w-[85%] sm:max-w-[70%]">
        <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed text-gray-900 whitespace-pre-wrap">
          {content}
        </div>
        {sources && sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {sources.map((src, i) => (
              <SourceChip key={i} source={src} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start gap-3">
      <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
        <span className="text-brand-700 text-sm font-bold">S</span>
      </div>
      <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1 items-center h-4">
          <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.3s]" />
          <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.15s]" />
          <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" />
        </div>
      </div>
    </div>
  );
}

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  async function sendMessage(text: string) {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: text.trim() };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      const res = await api.assistant.chat(
        nextMessages.map((m) => ({ role: m.role, content: m.content }))
      );
      const assistantMessage: Message = {
        role: "assistant",
        content: res.data.reply,
        sources: res.data.sources,
      };
      setMessages([...nextMessages, assistantMessage]);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 429) {
        setError("Du hast gerade zu viele Anfragen gesendet. Bitte warte kurz und versuche es erneut.");
      } else {
        setError("Ein Fehler ist aufgetreten. Bitte versuche es gleich noch einmal.");
      }
    } finally {
      setIsLoading(false);
      // Refocus input after response
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-4 py-4 shrink-0">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center">
              <span className="text-white text-sm font-bold">S</span>
            </div>
            <div>
              <h1 className="font-semibold text-gray-900 leading-tight">Sophex Startup Assistant</h1>
              <p className="text-xs text-gray-500">Dein KI-Guide durch die Gründung</p>
            </div>
            <div className="ml-auto flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Online
            </div>
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto space-y-4">
          {isEmpty && !isLoading && (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-2xl bg-brand-600 flex items-center justify-center mx-auto mb-4">
                <span className="text-white text-2xl font-bold">S</span>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-1">Wie kann ich helfen?</h2>
              <p className="text-gray-500 text-sm mb-8">
                Stelle mir deine Fragen rund um die Unternehmensgründung in Deutschland.
              </p>

              {/* Starter prompts */}
              <div className="flex flex-wrap gap-2 justify-center">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => sendMessage(prompt)}
                    className="px-3 py-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-xl hover:border-brand-400 hover:text-brand-700 hover:bg-brand-50 transition-colors text-left"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) =>
            msg.role === "user" ? (
              <UserBubble key={i} content={msg.content} />
            ) : (
              <AssistantBubble key={i} content={msg.content} sources={msg.sources} />
            )
          )}

          {isLoading && <TypingIndicator />}

          {error && (
            <div className="flex justify-start gap-3">
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-red-600 text-sm">!</span>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-red-700 max-w-[85%] sm:max-w-[70%]">
                {error}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-gray-200 bg-white px-4 py-4 shrink-0">
        <div className="max-w-2xl mx-auto">
          <form onSubmit={handleSubmit}>
            <div className="flex gap-2 items-end">
              <label htmlFor="assistant-input" className="sr-only">
                Nachricht eingeben
              </label>
              <textarea
                id="assistant-input"
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Schreib eine Nachricht..."
                rows={1}
                disabled={isLoading}
                className="flex-1 resize-none px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 disabled:opacity-50 disabled:cursor-not-allowed max-h-32 overflow-y-auto leading-relaxed"
                style={{ minHeight: "46px" }}
                aria-label="Nachricht eingeben"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="px-4 py-3 bg-brand-600 text-white rounded-xl hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                aria-label="Senden"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
            <p className="text-center text-xs text-gray-400 mt-2">
              Powered by Sophex + Claude · Drücke Enter zum Senden, Shift+Enter für neue Zeile
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
