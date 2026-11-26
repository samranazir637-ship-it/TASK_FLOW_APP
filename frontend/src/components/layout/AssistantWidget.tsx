import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, LoaderCircle, Send, X } from "lucide-react";
import { api, errorMessage } from "@/services/api";

type Message = { role: "user" | "assistant"; content: string };
type AssistantStatus = { enabled: boolean; mode: "user" | "admin" };

export function AssistantWidget() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .get<AssistantStatus>("/assistant/status")
      .then(({ data }) => setStatus(data))
      .catch(() => {
        setStatus({ enabled: false, mode: "user" });
      });
  }, []);

  useEffect(() => {
    historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending, open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = input.trim();
    if (!content || pending || !status?.enabled) return;
    const next = [...messages, { role: "user" as const, content }].slice(-12);
    setMessages(next);
    setInput("");
    setError("");
    setPending(true);
    try {
      const { data } = await api.post<{ reply: string; mode: "user" | "admin" }>(
        "/assistant/chat",
        {
          messages: next,
        },
        { timeout: 45_000 },
      );
      setMessages((current) =>
        [...current, { role: "assistant" as const, content: data.reply }].slice(-12),
      );
      if (
        content.match(/\b(create|add|make|update|change|edit|delete|remove|complete|finish)\b/i)
      ) {
        await queryClient.invalidateQueries();
      }
    } catch (requestError) {
      setError(errorMessage(requestError, "The assistant could not respond. Please try again."));
    } finally {
      setPending(false);
    }
  }

  if (!status) return null;
  const label = status.mode === "admin" ? "Admin assistant" : "Task assistant";
  return (
    <div className="assistant-widget">
      {open && (
        <section className="assistant-panel" aria-label={label}>
          <header className="assistant-header">
            <span className="assistant-avatar">
              <Bot size={18} aria-hidden="true" />
            </span>
            <span>
              <strong>{label}</strong>
              <small>
                {status.enabled ? "Your TaskFlow workspace" : "Needs an OpenRouter API key"}
              </small>
            </span>
            <button
              className="assistant-close"
              type="button"
              aria-label="Close assistant"
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>
          </header>
          <div
            className="assistant-messages"
            ref={historyRef}
            aria-live="polite"
            aria-label="Conversation"
          >
            {messages.length === 0 && (
              <p className="assistant-welcome">
                Hi! I can help manage your tasks. Try “Show my pending tasks” or “Add a high
                priority task to call the dentist.”
              </p>
            )}
            {messages.map((message, index) => (
              <p className={`assistant-message ${message.role}`} key={`${index}-${message.role}`}>
                {message.content}
              </p>
            ))}
            {pending && (
              <p className="assistant-message assistant">
                <LoaderCircle
                  size={15}
                  className="assistant-spin"
                  aria-label="Assistant is thinking"
                />
              </p>
            )}
            {error && (
              <p className="assistant-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <form className="assistant-form" onSubmit={submit}>
            <label className="sr-only" htmlFor="assistant-input">
              Message the assistant
            </label>
            <textarea
              id="assistant-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={
                status.enabled ? "Ask about your tasks…" : "Set OPENROUTER_API_KEY in backend .env"
              }
              maxLength={2000}
              rows={2}
              disabled={!status.enabled || pending}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <button
              className="assistant-send"
              aria-label="Send message"
              type="submit"
              disabled={!status.enabled || pending || !input.trim()}
            >
              <Send size={17} />
            </button>
          </form>
          <p className="assistant-footnote">
            Messages go to OpenRouter. Task changes follow your permissions; AI can be wrong.
          </p>
        </section>
      )}
      <button
        className={`assistant-launcher${open ? " is-open" : ""}`}
        aria-label={open ? "Close assistant" : undefined}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <X size={21} />
        ) : (
          <>
            <Bot size={21} />
            <span>{status.mode === "admin" ? "Admin AI" : "Ask AI"}</span>
          </>
        )}
      </button>
    </div>
  );
}
