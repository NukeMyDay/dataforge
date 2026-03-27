import { useState, useRef, useEffect, FormEvent } from "react";

interface Message {
  role: "user" | "assistant";
  text: string;
}

interface Props {
  silo?: "education" | "regulatory";
}

export default function ChatWidget({ silo }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { role: "user", text }]);
    setLoading(true);

    try {
      const apiBase = import.meta.env.VITE_API_URL ?? "";
      const res = await fetch(`${apiBase}/v1/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, context: { silo } }),
      });

      const body = (await res.json()) as { data?: { reply?: string }; error?: string };

      if (!res.ok) throw new Error(body.error ?? "Chat error");
      const reply = body.data?.reply ?? "No response.";
      setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-brand-600 text-white rounded-full shadow-lg hover:bg-brand-700 transition-colors flex items-center justify-center text-2xl z-50"
        aria-label={open ? "Close chat" : "Open AI chat"}
      >
        {open ? "✕" : "💬"}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 w-80 sm:w-96 bg-white border border-gray-200 rounded-2xl shadow-2xl flex flex-col z-50 max-h-[520px]">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <span className="text-xl">🤖</span>
            <div>
              <div className="text-sm font-semibold text-gray-900">DataForge AI</div>
              <div className="text-xs text-gray-400">Ask about programs or regulations</div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {messages.length === 0 && (
              <div className="text-center text-gray-400 text-sm py-8">
                <div className="text-3xl mb-2">💡</div>
                <p>Try asking:</p>
                <div className="mt-2 space-y-1 text-xs">
                  {silo === "regulatory" ? (
                    <>
                      <p className="italic">"What permits do I need for an outdoor event in NRW?"</p>
                      <p className="italic">"How long does a Veranstaltungsgenehmigung take?"</p>
                    </>
                  ) : (
                    <>
                      <p className="italic">"English-taught CS masters in the Netherlands?"</p>
                      <p className="italic">"Cheapest data science programs in Germany?"</p>
                    </>
                  )}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-brand-600 text-white rounded-br-sm"
                      : "bg-gray-100 text-gray-800 rounded-bl-sm"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 text-gray-400 px-3 py-2 rounded-xl rounded-bl-sm text-sm">
                  <span className="inline-flex gap-1">
                    <span className="animate-bounce" style={{ animationDelay: "0ms" }}>●</span>
                    <span className="animate-bounce" style={{ animationDelay: "150ms" }}>●</span>
                    <span className="animate-bounce" style={{ animationDelay: "300ms" }}>●</span>
                  </span>
                </div>
              </div>
            )}
            {error && (
              <div className="text-xs text-red-500 bg-red-50 rounded-lg p-2">{error}</div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form onSubmit={send} className="p-3 border-t border-gray-100 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question..."
              disabled={loading}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="px-3 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-40 transition-colors text-sm font-medium"
            >
              Send
            </button>
          </form>
        </div>
      )}
    </>
  );
}
