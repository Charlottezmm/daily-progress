"use client";

import { ArrowRight, CheckCircle2, Circle, Loader2, SkipForward } from "lucide-react";
import { useEffect, useState } from "react";

type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  href: string;
  status: "complete" | "skipped" | "next" | "pending";
  skipEventType?: "schedule_import_skipped" | "connector_setup_skipped";
};

type OnboardingState = {
  completedCount: number;
  totalCount: number;
  nextStep: OnboardingStep | null;
  steps: OnboardingStep[];
};

function statusLabel(status: OnboardingStep["status"]) {
  if (status === "complete") return "已完成";
  if (status === "skipped") return "已跳过";
  if (status === "next") return "下一步";
  return "待处理";
}

function skipLabel(eventType: NonNullable<OnboardingStep["skipEventType"]>) {
  if (eventType === "schedule_import_skipped") return "跳过固定日程导入";
  return "跳过连接设置";
}

export function OnboardingChecklist() {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingEvent, setPendingEvent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/onboarding")
      .then(async (response) => {
        if (!response.ok) throw new Error("onboarding_unavailable");
        return response.json() as Promise<OnboardingState>;
      })
      .then((body) => {
        if (mounted) setState(body);
      })
      .catch(() => {
        if (mounted) setError("无法读取 onboarding 状态");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  async function skip(eventType: NonNullable<OnboardingStep["skipEventType"]>) {
    setPendingEvent(eventType);
    setError(null);
    try {
      const response = await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventKey: eventType }),
      });
      if (!response.ok) throw new Error("skip_failed");
      setState((await response.json()) as OnboardingState);
    } catch {
      setError("跳过失败，请稍后再试");
    } finally {
      setPendingEvent(null);
    }
  }

  if (loading) {
    return (
      <section className="paw-onboarding-card" aria-live="polite">
        <div className="paw-onboarding-head">
          <div>
            <p className="paw-section-label">First run</p>
            <h2>v1 formal checklist</h2>
          </div>
        </div>
        <div className="paw-status-pill" role="status">
          <Loader2 size={16} className="paw-spin" />
          正在读取 onboarding 状态
        </div>
      </section>
    );
  }

  if (!state) {
    return (
      <section className="paw-onboarding-card" aria-live="polite">
        <div className="paw-onboarding-head">
          <div>
            <p className="paw-section-label">First run</p>
            <h2>v1 formal checklist</h2>
          </div>
        </div>
        <div className="paw-status-pill warn" role="status">
          {error ?? "无法读取 onboarding 状态"}
        </div>
      </section>
    );
  }

  if (state.completedCount >= state.totalCount) return null;

  return (
    <section className="paw-onboarding-card" aria-live="polite">
      <div className="paw-onboarding-head">
        <div>
          <p className="paw-section-label">First run</p>
          <h2>v1 formal checklist</h2>
        </div>
        <span className="paw-status-pill" role="status" aria-label={`Onboarding progress ${state.completedCount} of ${state.totalCount}`}>
          {state.completedCount}/{state.totalCount}
        </span>
      </div>

      {error ? (
        <div className="paw-status-pill warn" role="status">
          {error}
        </div>
      ) : null}
      {pendingEvent ? (
        <div className="paw-status-pill" role="status">
          正在更新 checklist
        </div>
      ) : null}

      <div className="paw-onboarding-steps">
        {state.steps.map((step) => (
          <div key={step.id} className={`paw-onboarding-step ${step.status}`}>
            <span className="paw-onboarding-icon" aria-hidden="true">
              {step.status === "complete" || step.status === "skipped" ? <CheckCircle2 size={18} /> : <Circle size={18} />}
            </span>
            <a href={step.href} className="paw-onboarding-link">
              <span>{step.title}</span>
              <small>{step.description}</small>
            </a>
            <span className={`paw-onboarding-status ${step.status}`}>{statusLabel(step.status)}</span>
            {step.skipEventType && step.status !== "complete" && step.status !== "skipped" ? (
              <button
                type="button"
                className="paw-onboarding-skip"
                onClick={() => skip(step.skipEventType!)}
                disabled={pendingEvent === step.skipEventType}
              >
                {pendingEvent === step.skipEventType ? <Loader2 size={14} className="paw-spin" /> : <SkipForward size={14} />}
                {pendingEvent === step.skipEventType ? "保存中" : skipLabel(step.skipEventType)}
              </button>
            ) : null}
            {step.status === "next" ? <ArrowRight size={16} className="paw-onboarding-arrow" aria-hidden="true" /> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
