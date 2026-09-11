"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getUserById } from "@/lib/mock-data";
import type { Comment, CommentType } from "@/lib/types";
import { AuthorLink } from "@/components/ui/AuthorLink";
import { TranslatableText } from "@/components/ui/TranslateButton";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

const TYPE_LABEL: Record<CommentType, string> = {
  question: "question",
  suggestion: "suggestion",
  sharing: "just sharing",
};

export function Discussion({
  initialComments,
  composeLabel,
  postAuthorId,
}: {
  initialComments: Comment[];
  composeLabel: string;
  postAuthorId?: string;
}) {
  const { requireAuth, user } = useAuth();
  const [comments, setComments] = useState(initialComments);
  const [composeOpen, setComposeOpen] = useState(false);
  const [type, setType] = useState<CommentType>("question");
  const [body, setBody] = useState("");

  function openCompose() {
    if (requireAuth()) setComposeOpen((v) => !v);
  }

  function submit() {
    if (!body.trim() || !user) return;
    const newComment: Comment = {
      id: `local-${Date.now()}`,
      parentType: "experience-post",
      parentId: "local",
      authorId: user.id,
      type,
      body: body.trim(),
      createdAt: new Date().toISOString(),
    };
    setComments((c) => [...c, newComment]);
    setBody("");
    setComposeOpen(false);
  }

  return (
    <div className="card">
      <p className="title" style={{ marginBottom: 12 }}>Discussion</p>
      {comments.map((comment) => (
        <CommentRow key={comment.id} comment={comment} postAuthorId={postAuthorId} />
      ))}

      <Button style={{ width: "100%", marginTop: 12 }} onClick={openCompose}>
        {composeLabel}
      </Button>
      <div className={`compose-inline${composeOpen ? " open" : ""}`}>
        <select value={type} onChange={(e) => setType(e.target.value as CommentType)} style={{ marginBottom: 8 }}>
          <option value="question">Question</option>
          <option value="suggestion">Suggestion</option>
          <option value="sharing">Just sharing</option>
        </select>
        <textarea placeholder="Write something..." value={body} onChange={(e) => setBody(e.target.value)} />
        <Button variant="primary" style={{ marginTop: 8 }} onClick={submit}>
          Post
        </Button>
      </div>
    </div>
  );
}

function CommentRow({ comment, postAuthorId }: { comment: Comment; postAuthorId?: string }) {
  const author = getUserById(comment.authorId);
  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, marginBottom: 10 }}>
      <div className="row wrap" style={{ gap: 6, marginBottom: 4 }}>
        <Badge variant="neutral">{TYPE_LABEL[comment.type]}</Badge>
        {author && <AuthorLink userId={author.id} name={author.name} />}
        <span className="tiny">{new Date(comment.createdAt).toLocaleDateString()}</span>
      </div>
      <TranslatableText text={comment.body} as="p" className="muted" />
      {comment.replies?.map((reply) => {
        const replyAuthor = getUserById(reply.authorId);
        return (
          <div className="reply" key={reply.id}>
            <div className="row" style={{ gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 500 }}>{replyAuthor?.name}</span>
              {reply.authorId === postAuthorId && <Badge style={{ fontSize: 10 }}>author</Badge>}
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              {reply.body}
            </p>
          </div>
        );
      })}
    </div>
  );
}
