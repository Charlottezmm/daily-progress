"use client";

import { Ban, Eye, FileText, Save, Table } from "lucide-react";
import { useState } from "react";
import { CatIcon } from "./cat-icon";

type PlanPreview = {
  goal: string | null;
  projects: Array<{ name: string; deadline: string | null }>;
  constraints: string[];
};

type TimetablePreviewRow = {
  title: string;
  kind: "course" | "meeting" | "unavailable" | "routine" | "recovery";
  dayOfWeek: string | null;
  startTime: string;
  endTime: string;
  startsOn: string;
  endsOn: string;
  course: string | null;
  recurrence: string | null;
  notes: string | null;
};

type RequestState = "idle" | "previewing" | "saving";

const planExample = `Goal: ship PawPlan tomorrow

## Projects
- PawPlan Import: save imports by 2026-06-11

## Constraints
- protect tomorrow morning for verification
`;

const timetableExample = `title,kind,day_of_week,start_time,end_time,starts_on,ends_on,course,recurrence,notes
Deep Learning Lecture,course,Monday,09:00,11:00,2026-09-01,2026-09-14,Deep Learning,weekly,Room 204
`;

async function postJson<T>(url: string, body: Record<string, string>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "Import request failed");
  return payload as T;
}

export function ImportView() {
  const [planMarkdown, setPlanMarkdown] = useState(planExample);
  const [planPreview, setPlanPreview] = useState<PlanPreview | null>(null);
  const [planState, setPlanState] = useState<RequestState>("idle");
  const [planMessage, setPlanMessage] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  const [timetableCsv, setTimetableCsv] = useState(timetableExample);
  const [timetablePreview, setTimetablePreview] = useState<TimetablePreviewRow[] | null>(null);
  const [timetableState, setTimetableState] = useState<RequestState>("idle");
  const [timetableMessage, setTimetableMessage] = useState<string | null>(null);
  const [timetableError, setTimetableError] = useState<string | null>(null);

  async function previewPlan() {
    setPlanState("previewing");
    setPlanError(null);
    setPlanMessage(null);
    try {
      const payload = await postJson<{ preview: PlanPreview }>("/api/imports/plan", { markdown: planMarkdown });
      setPlanPreview(payload.preview);
    } catch (error) {
      setPlanPreview(null);
      setPlanError(error instanceof Error ? error.message : "Plan preview failed");
    } finally {
      setPlanState("idle");
    }
  }

  async function savePlan() {
    setPlanState("saving");
    setPlanError(null);
    setPlanMessage(null);
    try {
      const payload = await postJson<{ message: string }>("/api/imports/plan/save", { markdown: planMarkdown });
      setPlanMessage(payload.message);
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : "Plan save failed");
    } finally {
      setPlanState("idle");
    }
  }

  async function previewTimetable() {
    setTimetableState("previewing");
    setTimetableError(null);
    setTimetableMessage(null);
    try {
      const payload = await postJson<{ preview: TimetablePreviewRow[] }>("/api/imports/timetable", { csv: timetableCsv });
      setTimetablePreview(payload.preview);
    } catch (error) {
      setTimetablePreview(null);
      setTimetableError(error instanceof Error ? error.message : "Timetable preview failed");
    } finally {
      setTimetableState("idle");
    }
  }

  async function saveTimetable() {
    setTimetableState("saving");
    setTimetableError(null);
    setTimetableMessage(null);
    try {
      const payload = await postJson<{ message: string }>("/api/imports/timetable/save", { csv: timetableCsv });
      setTimetableMessage(payload.message);
    } catch (error) {
      setTimetableError(error instanceof Error ? error.message : "Timetable save failed");
    } finally {
      setTimetableState("idle");
    }
  }

  return (
    <div className="paw-page">
      <section className="paw-page-header">
        <p className="paw-greeting">Import</p>
        <h1 className="paw-page-date">导入</h1>
        <div className="paw-agent-row">
          <CatIcon size={44} mood="think" />
          <p className="paw-agent-msg">先预览，再保存。plan.md 只写入项目和导入摘要；timetable.csv 会新增课程和时间块。</p>
        </div>
      </section>

      <section className="paw-import-grid">
        <div className="paw-card paw-import-panel">
          <div className="paw-import-heading">
            <span className="paw-more-icon">
              <FileText size={18} />
            </span>
            <div>
              <h2 className="paw-more-label">plan.md</h2>
              <p className="paw-more-text">保存会写入 active plan 的导入摘要和项目，不自动生成 tasks 或 milestones。</p>
            </div>
          </div>
          <label className="paw-field-label" htmlFor="plan-markdown">
            Markdown 内容
          </label>
          <textarea
            id="plan-markdown"
            className="paw-textarea paw-import-textarea"
            value={planMarkdown}
            onChange={(event) => {
              setPlanMarkdown(event.target.value);
              setPlanPreview(null);
              setPlanMessage(null);
            }}
          />
          <div className="paw-save-row">
            <button className="paw-secondary-btn" type="button" onClick={previewPlan} disabled={planState !== "idle"}>
              <Eye size={16} />
              {planState === "previewing" ? "正在预览" : "预览"}
            </button>
            <button
              className="paw-primary-btn"
              type="button"
              onClick={savePlan}
              disabled={planState !== "idle" || !planPreview}
            >
              <Save size={16} />
              {planState === "saving" ? "正在保存" : "保存"}
            </button>
          </div>
          {planError ? <p className="paw-error">{planError}</p> : null}
          {planMessage ? <p className="paw-toast">{planMessage}</p> : null}
          {planPreview ? (
            <div className="paw-import-preview">
              <p className="paw-row-title">Goal: {planPreview.goal ?? "未识别"}</p>
              <p className="paw-row-meta">Projects: {planPreview.projects.length}</p>
              <ul className="paw-list">
                {planPreview.projects.map((project) => (
                  <li className="paw-list-row" key={`${project.name}-${project.deadline ?? "none"}`}>
                    <span className="paw-row-title">{project.name}</span>
                    <span className="paw-row-meta">{project.deadline ?? "无 deadline"}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="paw-card paw-import-panel">
          <div className="paw-import-heading">
            <span className="paw-more-icon">
              <Table size={18} />
            </span>
            <div>
              <h2 className="paw-more-label">timetable.csv</h2>
              <p className="paw-more-text">保存会按日期范围展开并新增 time_blocks；重复保存会继续新增记录。</p>
            </div>
          </div>
          <label className="paw-field-label" htmlFor="timetable-csv">
            CSV 内容
          </label>
          <textarea
            id="timetable-csv"
            className="paw-textarea paw-import-textarea"
            value={timetableCsv}
            onChange={(event) => {
              setTimetableCsv(event.target.value);
              setTimetablePreview(null);
              setTimetableMessage(null);
            }}
          />
          <div className="paw-save-row">
            <button className="paw-secondary-btn" type="button" onClick={previewTimetable} disabled={timetableState !== "idle"}>
              <Eye size={16} />
              {timetableState === "previewing" ? "正在预览" : "预览"}
            </button>
            <button
              className="paw-primary-btn"
              type="button"
              onClick={saveTimetable}
              disabled={timetableState !== "idle" || !timetablePreview}
            >
              <Save size={16} />
              {timetableState === "saving" ? "正在保存" : "保存"}
            </button>
          </div>
          {timetableError ? <p className="paw-error">{timetableError}</p> : null}
          {timetableMessage ? <p className="paw-toast">{timetableMessage}</p> : null}
          {timetablePreview ? (
            <div className="paw-import-preview">
              <p className="paw-row-meta">Preview rows: {timetablePreview.length}</p>
              <ul className="paw-list">
                {timetablePreview.map((row, index) => (
                  <li className="paw-list-row" key={`${row.title}-${index}`}>
                    <span className="paw-row-title">{row.title}</span>
                    <span className="paw-row-meta">
                      {row.kind} · {row.dayOfWeek ?? row.startsOn} · {row.startTime}-{row.endTime}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="paw-card paw-import-panel disabled">
          <div className="paw-import-heading">
            <span className="paw-more-icon">
              <Ban size={18} />
            </span>
            <div>
              <h2 className="paw-more-label">HTML</h2>
              <p className="paw-more-text">HTML 暂未开放。</p>
              <p className="paw-more-text">当前不会解析、预览或保存 HTML 内容。</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
