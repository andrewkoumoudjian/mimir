"use client";

import { useState } from "react";
import type { AssistantReply } from "@/types/assistant";

type AssistantPanelProps = {
  datasetName: string;
  transactionCount: number;
  riskAlertCount: number;
  workflowItemCount: number;
};

type PanelMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const starterQuestions = [
  "What should a manager review first in this workbook?",
  "Which merchants drive the most spend?",
  "Why are so many items marked as workflow?",
];

export function AssistantPanel({
  datasetName: _datasetName,
  transactionCount: _transactionCount,
  riskAlertCount: _riskAlertCount,
  workflowItemCount: _workflowItemCount,
}: AssistantPanelProps) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<PanelMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(question: string) {
    const trimmedQuestion = question.trim();

    if (!trimmedQuestion || isSubmitting) {
      return;
    }

    const nextUserMessage = createPanelMessage("user", trimmedQuestion);
    const nextConversation = [...messages, nextUserMessage];

    setDraft("");
    setError(null);
    setIsSubmitting(true);
    setMessages(nextConversation);

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messages: nextConversation.map(({ role, content }) => ({ role, content })),
        }),
      });

      const payload = (await response.json()) as AssistantReply & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "The assistant could not answer that question.");
      }

      setMessages((currentMessages) => [
        ...currentMessages,
        createPanelMessage("assistant", normalizeAssistantReply(payload.reply)),
      ]);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The assistant could not answer that question.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <aside className="assistant-panel">
      <div className="assistant-question-list">
        {starterQuestions.map((question) => (
          <button
            key={question}
            type="button"
            className="assistant-question-chip"
            disabled={isSubmitting}
            onClick={() => handleSubmit(question)}
          >
            {question}
          </button>
        ))}
      </div>

      <div className="assistant-thread" aria-live="polite">
        {messages.length === 0 ? (
          <p className="assistant-empty">
            Ask about top merchants, risky transactions, workflow-heavy alerts, or why a
            pattern was flagged.
          </p>
        ) : (
          messages.map((message) => (
            <article
              key={message.id}
              className={`assistant-bubble assistant-bubble-${message.role}`}
            >
              <p className="assistant-bubble-label">
                {message.role === "user" ? "You" : "Claude"}
              </p>
              <p className="assistant-bubble-copy">{message.content}</p>
            </article>
          ))
        )}
      </div>

      <form
        className="assistant-form"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit(draft);
        }}
      >
        <label className="assistant-input">
          <textarea
            rows={3}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Summarize the biggest policy-risk patterns in this workbook."
          />
        </label>

        <div className="assistant-form-footer">
          <button
            type="submit"
            className="assistant-submit"
            disabled={isSubmitting || draft.trim().length === 0}
          >
            {isSubmitting ? "Thinking..." : "Ask Claude"}
          </button>
        </div>
      </form>

      {error ? <p className="assistant-error">{error}</p> : null}
    </aside>
  );
}

function createPanelMessage(role: PanelMessage["role"], content: string): PanelMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
  };
}

function normalizeAssistantReply(value: string) {
  return value
    .replace(/\r/g, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
