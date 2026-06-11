"use client";

import { Check, Lock, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { CatIcon } from "./cat-icon";
import type { RescheduleViewData } from "@/lib/planning/view-data";

type Decision = "accepted" | "rejected";
type PatchItem = RescheduleViewData["patchItems"][number];
type ApplyPatchResponse = {
  skipped?: Array<{ reason?: string }>;
};

export function ReviewPreview({ data }: { data: RescheduleViewData }) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [appliedPatchIds, setAppliedPatchIds] = useState<string[]>([]);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const visiblePatchItems = data.patchItems.filter((item) => !appliedPatchIds.includes(item.patchId));
  const actionable = visiblePatchItems.filter((item) => !item.protected);
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
    for (const item of actionable) {
      if (decisions[item.id] !== "accepted") continue;
      const operationIndex = Number(item.id.split(":")[1]);
      if (!Number.isInteger(operationIndex)) continue;
      acceptedByPatch.set(item.patchId, [...(acceptedByPatch.get(item.patchId) ?? []), operationIndex]);
    }

    if (acceptedByPatch.size === 0) return;

    setIsApplying(true);
    setApplyError(null);
    try {
      for (const [patchId, acceptedOperationIndexes] of acceptedByPatch.entries()) {
        const response = await fetch("/api/patches/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patchId, acceptedOperationIndexes }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? "应用建议失败");
        }
        const body = (await response.json().catch(() => null)) as ApplyPatchResponse | null;
        const skipped = body?.skipped ?? [];
        setAppliedPatchIds((current) => [...current, patchId]);
        setDecisions((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !id.startsWith(`${patchId}:`))));
        if (skipped.length > 0) {
          const reasons = [...new Set(skipped.map((item) => item.reason).filter(Boolean))];
          setApplyError(`有 ${skipped.length} 条建议未应用${reasons.length > 0 ? `：${reasons.join("；")}` : ""}`);
          continue;
        }
      }
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : "应用建议失败");
    } finally {
      setIsApplying(false);
    }
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

      <div className="paw-trust-banner">Routine 和 Recovery 受保护，Agent 只能动任务的时间和优先级。</div>

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
                {decision ? <span className="paw-status-pill link">{decision === "accepted" ? "已接受" : "已拒绝"}</span> : null}
              </div>
              <h2 className="paw-suggestion-what mt-3">{item.title}</h2>
              <p className="paw-suggestion-why">{item.reason}</p>
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
                  {item.protected ? (
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
        <button type="button" onClick={applySelected} disabled={accepted === 0 || isApplying} className="paw-primary-btn">
          {isApplying ? "应用中" : `应用 ${accepted} 项建议`}
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
