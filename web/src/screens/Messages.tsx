import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import type { Me } from "../api";
import { useMe } from "../auth";
import { formatClock } from "../lib/format";
import { useNow } from "../lib/useNow";
import { useInbox, useSend, useThread } from "../people";
import { FormError } from "../ui";
import { Shell } from "./Shell";

export function Inbox() {
  const me = useMe().data as Me;
  const inbox = useInbox();
  const now = useNow(60_000);
  return (
    <Shell>
      <section className="card" aria-labelledby="inbox-title">
        <h1 id="inbox-title">Messages</h1>
        <FormError message={inbox.error?.message} />
        {inbox.data && !inbox.data.length && (
          <p className="muted">
            No conversations yet. Find travellers who share your interests on the <Link to="/people">People</Link> tab.
          </p>
        )}
        <ul className="inbox">
          {inbox.data?.map((c) => (
            <li key={c.id}>
              <Link to={`/messages/${c.id}`}>
                <span className="avatar" aria-hidden>
                  {(c.with[0]?.username ?? "?").slice(0, 1).toUpperCase()}
                </span>
                <span className="inbox-text">
                  <strong>{c.with.map((u) => u.username).join(", ") || "Just you"}</strong>
                  <span className="muted small inbox-last">
                    {c.lastMessage ? `${c.lastMessage.from === me.id ? "You: " : ""}${c.lastMessage.body}` : "No messages yet"}
                  </span>
                </span>
                <span className="muted small">{formatClock(c.updatedAt, now)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </Shell>
  );
}

export function Conversation() {
  const { id = "" } = useParams();
  const me = useMe().data as Me;
  const inbox = useInbox();
  const thread = useThread(id);
  const send = useSend(id);
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const now = useNow(60_000);
  const other = inbox.data?.find((c) => c.id === id)?.with.map((u) => u.username).join(", ");

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [thread.data?.length]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    send.mutate(body, { onSuccess: () => setText("") });
  };

  return (
    <Shell>
      <section className="card chat" aria-label={`Conversation with ${other ?? "a traveller"}`}>
        <div className="chat-head">
          <Link to="/messages" className="linklike">
            ← Messages
          </Link>
          <h1>{other ?? "…"}</h1>
        </div>
        <FormError message={thread.error?.message} />
        <ol className="messages" aria-live="polite">
          {thread.data?.map((m) => (
            <li key={m.id} className={m.from === me.id ? "mine" : "theirs"}>
              <p>{m.content.body}</p>
              <time className="small">{formatClock(m.createdAt, now)}</time>
            </li>
          ))}
        </ol>
        {thread.data && !thread.data.length && <p className="muted">Say hello. Messages arrive straight away.</p>}
        <div ref={end} />
        <form className="compose" onSubmit={submit}>
          <label className="sr-only" htmlFor="compose">
            Message
          </label>
          <textarea
            id="compose"
            rows={2}
            maxLength={5000}
            placeholder="Write a message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) submit(e);
            }}
          />
          <button className="btn btn-primary" disabled={send.isPending || !text.trim()}>
            Send
          </button>
        </form>
        <FormError message={send.error?.message} />
      </section>
    </Shell>
  );
}
