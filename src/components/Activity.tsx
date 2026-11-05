"use client";
import { useUi } from "./Shell";
import { workflow } from "@/i18n/workflow";
import type { AgentEvent } from "@/lib/domain/types";
export default function Activity({
  events,
  busy,
}: {
  events: AgentEvent[];
  busy: boolean;
}) {
  const { language } = useUi(),
    w = workflow[language];
  const visible = events.slice(-18);
  return (
    <aside
      className="panel agent-activity no-print"
      aria-live="polite"
      aria-busy={busy}
    >
      <h2>{w.activity}</h2>
      {!visible.length && <p className="caption">{w.emptyState}</p>}
      <ol>
        {visible.map((e, i) => (
          <li key={i} className={`activity-event ${e.status}`}>
            <span className="activity-dot" aria-hidden="true">
              {e.status === "completed"
                ? "✓"
                : e.status === "failed"
                  ? "!"
                  : "·"}
            </span>
            <div>
              <strong>
                {w.toolLabels[e.tool as keyof typeof w.toolLabels] ??
                  w.activity}
              </strong>
              <small>
                {e.documentId && `${e.documentId} · `}
                {e.code === "PAUSED" ? w.paused : w[e.status]}
              </small>
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );
}
