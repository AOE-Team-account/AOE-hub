"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import type { UiKey } from "@/lib/i18n/strings";
import { useAuth } from "@/contexts/AuthContext";
import { friendlyWriteError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";
import type { Comment, CommentType, User } from "@/lib/types";
import { AuthorLink } from "@/components/ui/AuthorLink";
import { Translated } from "@/components/ui/Translated";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { NoticeBox } from "@/components/review/NoticeBox";
import { ReportButton } from "@/components/ui/ReportButton";

const TYPE_LABEL_KEY: Record<CommentType, UiKey> = {
  question: "discussion.type.question",
  suggestion: "discussion.type.suggestion",
  sharing: "discussion.type.sharing",
};

export function Discussion({
  parentType,
  parentId,
  initialComments,
  authors,
  composeLabel,
  postAuthorId,
  notices = {},
}: {
  parentType: "file" | "experience-post";
  parentId: string;
  initialComments: Comment[];
  authors: Record<string, User | undefined>;
  composeLabel: string;
  postAuthorId?: string;
  notices?: Record<string, { tier: string; body: string }>;
}) {
  const { t } = useLanguage();
  const { requireAuth, user } = useAuth();
  const router = useRouter();
  const [comments, setComments] = useState(initialComments);
  const [composeOpen, setComposeOpen] = useState(false);
  const [type, setType] = useState<CommentType>("question");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync when the parent Server Component re-fetches after router.refresh().
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setComments(initialComments);
  }, [initialComments]);

  // Answerers' comments are pinned to the top of the thread (oldest first
  // within each group, as before).
  const isAnswerer = (id: string) => authors[id]?.badges.includes("answerer") ?? false;
  const sortedComments = [...comments.filter((c) => isAnswerer(c.authorId)), ...comments.filter((c) => !isAnswerer(c.authorId))];

  function openCompose() {
    if (requireAuth()) setComposeOpen((v) => !v);
  }

  async function submit() {
    if (!body.trim() || !user) return;
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase
      .from("comments")
      .insert({ parent_type: parentType, parent_id: parentId, author_id: user.id, type, body: body.trim() });
    setSubmitting(false);
    if (insertError) {
      setError(friendlyWriteError(insertError));
      return;
    }
    setBody("");
    setComposeOpen(false);
    router.refresh();
  }

  return (
    <div className="card">
      <p className="title" style={{ marginBottom: 12 }}>{t("discussion.title")}</p>
      {comments.length === 0 && <p className="muted">{t("discussion.none")}</p>}
      {sortedComments.map((comment) => (
        <CommentRow key={comment.id} comment={comment} authors={authors} postAuthorId={postAuthorId} notices={notices} parentType={parentType} parentId={parentId} />
      ))}

      <Button style={{ width: "100%", marginTop: 12 }} onClick={openCompose}>
        {composeLabel}
      </Button>
      <div className={`compose-inline${composeOpen ? " open" : ""}`}>
        <select value={type} onChange={(e) => setType(e.target.value as CommentType)} style={{ marginBottom: 8 }}>
          <option value="question">{t("discussion.type.question")}</option>
          <option value="suggestion">{t("discussion.type.suggestion")}</option>
          <option value="sharing">{t("discussion.type.sharing")}</option>
        </select>
        <textarea placeholder={t("discussion.placeholder")} value={body} onChange={(e) => setBody(e.target.value)} />
        {error && (
          <p className="muted" style={{ color: "#b5471f", marginTop: 6 }}>
            {error}
          </p>
        )}
        <Button variant="primary" style={{ marginTop: 8 }} onClick={submit} disabled={submitting || !body.trim()}>
          {submitting ? t("discussion.posting") : t("discussion.post")}
        </Button>
      </div>
    </div>
  );
}

function CommentRow({
  comment,
  authors,
  postAuthorId,
  notices,
  parentType,
  parentId,
}: {
  comment: Comment;
  authors: Record<string, User | undefined>;
  postAuthorId?: string;
  notices: Record<string, { tier: string; body: string }>;
  parentType: "file" | "experience-post";
  parentId: string;
}) {
  const { t } = useLanguage();
  const { requireAuth, user } = useAuth();
  const router = useRouter();
  // Replies are one level deep: answering a reply lands in the same thread,
  // starting with the name of the person answered.
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  function openReply(toName?: string) {
    if (!requireAuth()) return;
    setReplyBody(toName ? `@${toName} ` : "");
    setReplyError(null);
    setReplyOpen(true);
  }

  async function sendReply() {
    if (!replyBody.trim() || !user) return;
    setReplying(true);
    setReplyError(null);
    const { error } = await createClient()
      .from("comments")
      .insert({ parent_type: parentType, parent_id: parentId, parent_comment_id: comment.id, author_id: user.id, type: comment.type, body: replyBody.trim() });
    setReplying(false);
    if (error) {
      setReplyError(friendlyWriteError(error));
      return;
    }
    setReplyBody("");
    setReplyOpen(false);
    router.refresh();
  }
  const author = authors[comment.authorId];
  const pinned = author?.badges.includes("answerer");
  const verified = author?.badges.includes("verified");
  return (
    <div
      style={{
        borderTop: "1px solid var(--border)",
        paddingTop: 10,
        marginBottom: 10,
        ...(verified ? { background: "var(--pin-bg)", borderRadius: 8, padding: "10px 10px 2px" } : {}),
      }}
    >
      <div className="row wrap" style={{ gap: 6, marginBottom: 4 }}>
        {pinned && <Badge variant="neutral">{t("discussion.pinned")}</Badge>}
        <Badge variant="neutral">{t(TYPE_LABEL_KEY[comment.type])}</Badge>
        {author && <AuthorLink userId={author.id} name={author.name} badges={author.badges} />}
        <span className="tiny">{new Date(comment.createdAt).toLocaleDateString()}</span>
        <ReportButton targetType="comment" targetId={comment.id} />
      </div>
      <NoticeBox notice={notices[comment.id]} itemKey={`comment:${comment.id}`} />
      <Translated type="comment" id={comment.id} field="body" text={comment.body} className="muted" note />
      <p className="tiny" style={{ margin: "2px 0 8px" }}>
        <button type="button" className="link-btn" onClick={() => openReply()}>{t("discussion.reply")}</button>
      </p>
      {comment.replies?.map((reply) => {
        const replyAuthor = authors[reply.authorId];
        return (
          <div className="reply" key={reply.id}>
            <div className="row" style={{ gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 500 }}>{replyAuthor?.name}</span>
              {reply.authorId === postAuthorId && <Badge style={{ fontSize: 10 }}>{t("discussion.author")}</Badge>}
              <ReportButton targetType="comment" targetId={reply.id} />
            </div>
            <NoticeBox notice={notices[reply.id]} itemKey={`comment:${reply.id}`} />
            <Translated type="comment" id={reply.id} field="body" text={reply.body} className="muted" style={{ margin: 0, fontSize: 13 }} note />
            <p className="tiny" style={{ margin: "2px 0 0" }}>
              <button type="button" className="link-btn" onClick={() => openReply(replyAuthor?.name)}>{t("discussion.reply")}</button>
            </p>
          </div>
        );
      })}
      {replyOpen && (
        <div className="reply" style={{ marginTop: 8 }}>
          <textarea placeholder={t("discussion.replyPlaceholder")} value={replyBody} onChange={(e) => setReplyBody(e.target.value)} rows={3} />
          {replyError && <p className="muted" style={{ color: "#b5471f", marginTop: 6 }}>{replyError}</p>}
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <Button variant="primary" size="small" onClick={sendReply} disabled={replying || !replyBody.trim()}>
              {replying ? t("discussion.posting") : t("discussion.replyPost")}
            </Button>
            <Button size="small" onClick={() => setReplyOpen(false)}>{t("common.cancel")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
