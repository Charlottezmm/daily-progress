"use client";

import { Check, Lock, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { CatIcon } from "./cat-icon";
import type { RescheduleViewData } from "@/lib/planning/view-data";

type Decision = "accepted" | "rejected";
type PatchItem = RescheduleViewData["patchItems"][number];
type ApplyPatchResponse = {
  status?: "applied" | "rejected" | "conflicted";
  skipped?: Array<{ index: number; reason?: string }>;
  conflicts?: Array<{ index: number; reason?: string; expected?: Record<string, unknown>; actual?: Record<string, unknown> }>;
};

export function ReviewPreview({ data }: { data: RescheduleViewData }) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [closedPatchIds, setClosedPatchIds] = useState<string[]>([]);
  const [reviewResults, setReviewResults] = useState<Record<string, Pick<PatchItem, "skipped" | "skippedReason" | "conflict">>>({});
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const visiblePatchItems = data.patchItems
    .filter((item) => !closedPatchIds.includes(item.patchId))
    .map((item) => ({ ...item, ...reviewResults[item.id] }));
  const actionable = visiblePatchItems.filter((item) => !item.protected && !item.skipped && !item.conflict);
  const accepted = actionable.filter((item) => decisions[item.id] === "accepted").length;
  const rejected = actionable.filter((item) => decisions[item.id] === "rejected").length;
  const pending = actionable.length - accepted - rejected;

  function decide(id: string, decision: Decision) {
    setDecisions((current) => {
      const next = { ...current };
      if (next[id] === decision) {
        delete next[id];
      } else {
        next[id] = decision;
      }
      return next;
    });
  }

  function acceptAll() {
    setDecisions(Object.fromEntries(actionable.map((item) => [item.id, "accepted" as Decision])));
  }

  async function applySelected() {
    const acceptedByPatch = new Map<string, number[]>();
    const rejectedByPatch = new Map<string, number[]>();
    for (const item of actionable) {
      if (!decisions[item.id]) continue;
      const operationIndex = item.operationIndex;
      const target = decisions[item.id] === "accepted" ? acceptedByPatch : rejectedByPatch;
      target.set(item.patchId, [...(target.get(item.patchId) ?? []), operationIndex]);
    }

    const patchIds = new Set([...acceptedByPatch.keys(), ...rejectedByPatch.keys()]);
    if (patchIds.size === 0 || pending > 0) return;

    setIsApplying(true);
    setApplyError(null);
    try {
      for (const patchId of patchIds) {
        const acceptedOperationIndexes = acceptedByPatch.get(patchId) ?? [];
        const rejectedOperationIndexes = rejectedByPatch.get(patchId) ?? [];
        const response = await fetch("/api/patches/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patchId, acceptedOperationIndexes, rejectedOperationIndexes }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? "应用建议失败");
        }
        const body = (await response.json().catch(() => null)) as ApplyPatchResponse | null;
        const skipped = body?.skipped ?? [];
        const conflicts = body?.conflicts ?? [];
        if (body?.status === "applied" || body?.status === "rejected") {
          setClosedPatchIds((current) => [...current, patchId]);
          setDecisions((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !id.startsWith(`${patchId}:`))));
        }
        if (skipped.length > 0 || conflicts.length > 0) {
          setReviewResults((current) => {
            const next = { ...current };
            for (const item of skipped) {
              next[`${patchId}:${item.index}`] = {
                ...next[`${patchId}:${item.index}`],
                skipped: true,
                skippedReason: item.reason,
              };
            }
            for (const item of conflicts) {
              next[`${patchId}:${item.index}`] = {
                ...next[`${patchId}:${item.index}`],
                conflict: {
                  reason: item.reason ?? "操作存在冲突",
                  expected: item.expected,
                  actual: item.actual,
                },
              };
            }
            return next;
          });
          const reasons = [...new Set([...skipped, ...conflicts].map((item) => item.reason).filter(Boolean))];
          setApplyError(`有 ${Math.max(skipped.length, conflicts.length)} 条建议未应用${reasons.length > 0 ? `：${reasons.join("；")}` : ""}`);
          continue;
        }
      }
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : "应用建议失败");
    } finally {
      setIsApplying(false);
    }
  }

  function formatConflictSide(value: Record<string, unknown> | undefined) {
    if (!value) return "无";
    return Object.entries(value).map(([key, entry]) => `${key}: ${String(entry ?? "无")}`).join("；");
  }

  return (
    <div className="paw-page">
      <section className="paw-page-header">
        <h1 className="paw-page-date">审核</h1>
        <div className="paw-agent-row">
          <CatIcon size={40} mood="think" />
          <p className="paw-agent-msg">这些是 Agent 提的调整建议，你点头才会生效。</p>
        </div>
      </section>

      {data.dataUnavailable ? (
        <section className="paw-status-pill warn" role="status">
          当前没有 DATABASE_URL，无法读取 agent patch；配置数据库后会显示待审核建议。
        </section>
      ) : null}

      <div className="paw-trust-banner">Routine 和 Recovery 受保护；Agent 可以提任务调整或日程导入草稿，但只有你确认后才会写入。</div>

      {applyError ? (
        <section className="paw-status-pill warn" role="status">
          {applyError}
        </section>
      ) : null}

      <section className="paw-suggestion-list">
        {visiblePatchItems.length === 0 ? (
          <div className="paw-empty">
            <h2>暂时没有新建议</h2>
            <p>Agent 提出调整后会出现在这里，逐条确认就行。</p>
          </div>
        ) : null}

        {visiblePatchItems.map((item: PatchItem) => {
          const decision = decisions[item.id];
          return (
            <article
              key={item.id}
              className={`paw-suggestion-card ${item.protected ? "protected" : ""} ${decision === "accepted" ? "accepted" : ""} ${decision === "rejected" ? "rejected" : ""}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="paw-status-pill">{item.kind}</span>
                {item.protected ? (
                  <span className="paw-status-pill">
                    <Lock size={12} />
                    已阻止
                  </span>
                ) : null}
                {item.skipped ? <span className="paw-status-pill warn">未应用</span> : null}
                {item.conflict ? <span className="paw-status-pill warn">冲突</span> : null}
                {decision ? <span className="paw-status-pill link">{decision === "accepted" ? "已接受" : "已拒绝"}</span> : null}
              </div>
              <h2 className="paw-suggestion-what mt-3">{item.title}</h2>
              <p className="paw-suggestion-why">类型：{item.operationType}</p>
              <p className="paw-suggestion-why">{item.reason}</p>
              <p className="paw-suggestion-why">
                来源：patch {item.provenance.patchId.slice(0, 8)} · op {item.provenance.operationIndex} · {item.provenance.createdBy} · {new Date(item.provenance.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
              </p>
              {item.skippedReason ? <p className="paw-suggestion-why">未应用原因：{item.skippedReason}</p> : null}
              {item.conflict ? (
                <div className="paw-status-pill warn" role="status">
                  冲突：{item.conflict.reason}；期望 {formatConflictSide(item.conflict.expected)}；当前 {formatConflictSide(item.conflict.actual)}
                </div>
              ) : null}
              <div className="paw-suggestion-row">
                <div className="paw-suggestion-diff">
                  <div className="paw-diff-box paw-diff-before">
                    <div className="paw-diff-label">Before</div>
                    {item.from ?? "无"}
                  </div>
                  <div className="paw-diff-box paw-diff-after">
                    <div className="paw-diff-label">After</div>
                    {item.to ?? "无"}
                  </div>
                </div>

                <div className="paw-suggestion-actions">
                  {item.protected || item.skipped || item.conflict ? (
                    <div className="paw-status-pill">需要手动处理</div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => decide(item.id, "accepted")}
                        disabled={isApplying}
                        className={`paw-sg-btn accept ${decision === "accepted" ? "selected" : ""}`}
                      >
                        <Check size={15} />
                        接受
                      </button>
                      <button
                        type="button"
                        onClick={() => decide(item.id, "rejected")}
                        disabled={isApplying}
                        className={`paw-sg-btn reject ${decision === "rejected" ? "selected" : ""}`}
                      >
                        <X size={15} />
                        拒绝
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="paw-status-pills">
                {item.impact.map((impact) => (
                  <span key={impact} className="paw-status-pill">{impact}</span>
                ))}
                <span className="paw-status-pill">{item.capacity}</span>
                {item.protectedEvidence.map((evidence) => (
                  <span key={evidence} className="paw-status-pill">
                    <Lock size={12} />
                    {evidence}
                  </span>
                ))}
              </div>
            </article>
          );
        })}
      </section>

      {visiblePatchItems.length > 0 ? (
      <section className="paw-review-bottom">
        <button type="button" onClick={() => setDecisions({})} disabled={isApplying} className="paw-secondary-btn">
          <RotateCcw size={14} /> 重新选择
        </button>
        <button type="button" onClick={acceptAll} disabled={isApplying} className="paw-secondary-btn">
          全部接受
        </button>
        <button type="button" onClick={applySelected} disabled={actionable.length === 0 || pending > 0 || isApplying} className="paw-primary-btn">
          {isApplying ? "提交中" : accepted > 0 ? `提交审核：应用 ${accepted} 项` : "提交审核：全部拒绝"}
        </button>
        <span className="paw-status-pill">
          {accepted} 接受 · {rejected} 拒绝 · {pending} 待定
        </span>
      </section>
      ) : null}
    </div>
  );
}

export const ReschedulePreview = ReviewPreview;
