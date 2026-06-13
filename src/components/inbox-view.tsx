"use client";

import { ArrowUpRight, RefreshCcw, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { BackLink } from "./back-link";
import { CatIcon } from "./cat-icon";
import { QuickCapture } from "./quick-capture";
import type { InboxItemView } from "@/lib/planning/view-data";

type InboxAction = "task" | "routine" | "delete";

const actionLabels: Record<InboxAction, string> = {
  task: "已提升为任务",
  routine: "已转成日常",
  delete: "已删除",
};

export function InboxView({
  initialItems,
  dataUnavailable = false,
}: {
  initialItems: InboxItemView[];
  dataUnavailable?: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const overLimit = items.length > 10;

  useEffect(() => {
    function handleCreated(event: Event) {
      const item = (event as CustomEvent<{ id: string; title: string }>).detail;
      if (!item?.id || !item.title) return;
      setItems((current) => [{ id: item.id, title: item.title, age: "刚刚" }, ...current]);
      setLastAction("已加入 Inbox");
    }

    window.addEventListener("inbox:item-created", handleCreated);
    return () => window.removeEventListener("inbox:item-created", handleCreated);
  }, []);

  async function act(id: string, action: InboxAction) {
    if (dataUnavailable) {
      setLastAction("本地数据源未配置，暂时无法处理。");
      return;
    }

    setPendingId(id);
    const response = await fetch("/api/inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    setPendingId(null);

    if (!response.ok) {
      setLastAction("处理失败，请重试。");
      return;
    }

    setItems((current) => current.filter((item) => item.id !== id));
    setLastAction(actionLabels[action]);
  }

  return (
    <div className="paw-page">
      <section className="paw-page-header">
        <BackLink />
        <h1 className="paw-page-date">暂存池</h1>
        <div className="paw-agent-row">
          <CatIcon size={40} mood="think" />
          <p className="paw-agent-msg">想到什么先丢进来，不占今天的容量。攒着的 {items.length} 条想处理时再处理。</p>
        </div>
        <div className="paw-status-pills">
          <span className="paw-status-pill">未处理 {items.length}</span>
          <span className="paw-status-pill">不占今日容量</span>
          {lastAction ? <span className="paw-status-pill link">{lastAction}</span> : null}
        </div>
      </section>

      {dataUnavailable ? (
        <section className="paw-trust-banner">
          <TriangleAlert size={18} className="mt-0.5 flex-none text-amber-700" />
          当前没有 DATABASE_URL，Inbox 会显示为空态；配置数据库后会读取真实数据。
        </section>
      ) : null}

      {overLimit ? (
        <section className="paw-trust-banner">
          <CatIcon size={28} mood="worried" />
          攒了 10 多条啦，挑几条处理一下吧，不用一次清空。
        </section>
      ) : null}

      <QuickCapture />

      <section className="paw-list-card">
        <div className="paw-list-header">
          <div>
            <h2 className="paw-list-title">未处理条目</h2>
            <p className="paw-list-subtitle">每条想清楚一件事就行：变成任务、变成日常、还是删掉。</p>
          </div>
          <span className="paw-status-pill">不打扰计划</span>
        </div>

        {items.length === 0 ? (
          <div className="paw-empty mt-4">
            <h3>暂存池是空的</h3>
            <p>随手记下的想法会先到这里，想处理的时候再处理。</p>
          </div>
        ) : (
          <div className="paw-list">
            {items.map((item) => (
              <div key={item.id} className="paw-list-row">
                <div className="min-w-0">
                  <p className="paw-row-title">{item.title}</p>
                  <p className="paw-row-meta">{item.age} 前捕获 · 仍未分类</p>
                </div>
                <div className="paw-row-actions">
                  <button
                    type="button"
                    disabled={pendingId === item.id}
                    onClick={() => void act(item.id, "task")}
                    className="paw-secondary-btn !px-3 !py-2 !text-xs"
                  >
                    <ArrowUpRight size={13} />
                    提升为任务
                  </button>
                  <button
                    type="button"
                    disabled={pendingId === item.id}
                    onClick={() => void act(item.id, "routine")}
                    className="paw-secondary-btn !px-3 !py-2 !text-xs"
                  >
                    <RefreshCcw size={13} />
                    转成日常
                  </button>
                  <button
                    type="button"
                    disabled={pendingId === item.id}
                    onClick={() => void act(item.id, "delete")}
                    className="paw-secondary-btn !px-3 !py-2 !text-xs text-[var(--app-danger)]"
                  >
                    <Trash2 size={13} />
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
