"use client";

import { KeyRound, Plus, RotateCcw, Save, Settings, ShieldCheck, Trash2, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BackLink } from "./back-link";
import { CatIcon } from "./cat-icon";

type DaySegment = "morning" | "afternoon" | "evening";
type EnergyLevel = "low" | "medium" | "high";
type RoutineTimeSegment = "morning" | "afternoon" | "evening" | "specific_window";

type Routine = {
  id: string;
  title: string;
  defaultTimeSegment: RoutineTimeSegment;
  defaultStartTime: string | null;
  defaultEndTime: string | null;
  weekdayPattern: string;
  estimatedMinutes: number;
  energyLevel: EnergyLevel;
};

type SegmentEnergySetting = {
  segment: DaySegment;
  energyLevel: EnergyLevel;
};

type SettingsResponse = {
  routines: Routine[];
  segmentEnergySettings: SegmentEnergySetting[];
  recoveryTarget: {
    minutes: number;
    editable: false;
    source: "system_default";
  };
};

type RoutineForm = Omit<Routine, "id"> & { id?: string };

const segmentLabels: Record<DaySegment | RoutineTimeSegment, string> = {
  morning: "上午",
  afternoon: "下午",
  evening: "晚上",
  specific_window: "指定时间",
};

const energyLabels: Record<EnergyLevel, string> = {
  low: "低",
  medium: "中",
  high: "高",
};

const defaultEnergySettings: SegmentEnergySetting[] = [
  { segment: "morning", energyLevel: "high" },
  { segment: "afternoon", energyLevel: "medium" },
  { segment: "evening", energyLevel: "low" },
];

const emptyRoutineForm: RoutineForm = {
  title: "",
  defaultTimeSegment: "morning",
  defaultStartTime: null,
  defaultEndTime: null,
  weekdayPattern: "daily",
  estimatedMinutes: 30,
  energyLevel: "low",
};

const recoveryTarget = {
  minutes: 480,
  editable: false,
  source: "system_default" as const,
};

function formatHours(minutes: number) {
  return `${Math.round(minutes / 60)} 小时`;
}

function routinePayload(form: RoutineForm) {
  return {
    ...form,
    title: form.title.trim(),
    weekdayPattern: form.weekdayPattern.trim(),
    defaultStartTime: form.defaultStartTime || null,
    defaultEndTime: form.defaultEndTime || null,
  };
}

export function SettingsView() {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [energySettings, setEnergySettings] = useState<SegmentEnergySetting[]>(defaultEnergySettings);
  const [routineForm, setRoutineForm] = useState<RoutineForm>(emptyRoutineForm);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [dataUnavailable, setDataUnavailable] = useState(false);

  const isEditing = Boolean(routineForm.id);
  const activeRecoveryTarget = useMemo(() => recoveryTarget, []);

  useEffect(() => {
    let active = true;

    async function loadSettings() {
      try {
        const response = await fetch("/api/settings");
        if (!response.ok) {
          if (active) {
            setDataUnavailable(true);
            setMessage("当前数据源未配置，设置页会显示默认值但无法保存。");
          }
          return;
        }

        const data = (await response.json()) as SettingsResponse;
        if (!active) return;
        setRoutines(data.routines ?? []);
        setEnergySettings(data.segmentEnergySettings ?? defaultEnergySettings);
        setDataUnavailable(false);
      } catch {
        if (!active) return;
        setDataUnavailable(true);
        setMessage("设置读取失败，请稍后重试。");
      }
    }

    void loadSettings();
    return () => {
      active = false;
    };
  }, []);

  function updateEnergy(segment: DaySegment, energyLevel: EnergyLevel) {
    setEnergySettings((current) =>
      current.map((setting) => (setting.segment === segment ? { ...setting, energyLevel } : setting)),
    );
  }

  async function saveEnergy() {
    setPending("energy");
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save_energy", settings: energySettings }),
    });
    setPending(null);

    if (!response.ok) {
      setMessage("能量规则保存失败。");
      return;
    }
    setMessage("能量规则已保存。");
  }

  async function saveRoutine(event: React.FormEvent) {
    event.preventDefault();
    if (!routineForm.title.trim()) {
      setMessage("日常事项需要标题。");
      return;
    }

    setPending("routine");
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "upsert_routine", routine: routinePayload(routineForm) }),
    });
    const data = (await response.json()) as { routine?: Routine; error?: string };
    setPending(null);

    if (!response.ok || !data.routine) {
      setMessage(data.error ?? "日常事项保存失败。");
      return;
    }

    setRoutines((current) => {
      if (!routineForm.id) return [...current, data.routine as Routine];
      return current.map((routine) => (routine.id === data.routine?.id ? (data.routine as Routine) : routine));
    });
    setRoutineForm(emptyRoutineForm);
    setMessage("日常事项已保存。");
  }

  async function deleteExistingRoutine(id: string) {
    setPending(id);
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_routine", id }),
    });
    setPending(null);

    if (!response.ok) {
      setMessage("日常事项删除失败。");
      return;
    }

    setRoutines((current) => current.filter((routine) => routine.id !== id));
    if (routineForm.id === id) setRoutineForm(emptyRoutineForm);
    setMessage("日常事项已删除。");
  }

  return (
    <div className="paw-page">
      <section className="paw-page-header">
        <BackLink />
        <h1 className="paw-page-date">设置</h1>
        <div className="paw-agent-row">
          <CatIcon size={40} mood="sleep" />
          <p className="paw-agent-msg">不常改的规则放这里，Today 保持干净。</p>
        </div>
        <div className="paw-status-pills">
          <span className="paw-status-pill">Recovery: 系统默认 {formatHours(activeRecoveryTarget.minutes)}</span>
          {dataUnavailable ? <span className="paw-status-pill warn">数据源未配置</span> : null}
          {message ? <span className="paw-status-pill link">{message}</span> : null}
        </div>
      </section>

      <section className="paw-list-card mb-4">
        <div className="paw-list-header">
          <div>
            <h2 className="paw-list-title">Workspace / MCP 还未开放</h2>
            <p className="paw-list-subtitle">Workspace 密码、部署信息和 MCP token 仍然只显示状态，不在这里做假配置。</p>
          </div>
          <span className="paw-more-icon">
            <KeyRound size={18} />
          </span>
        </div>
        <div className="paw-more-grid mt-4">
          <div className="paw-more-card disabled">
            <span className="paw-more-icon">
              <Settings size={18} />
            </span>
            <div>
              <h3 className="paw-more-label">Workspace</h3>
              <p className="paw-more-text">登录、密码和部署参数暂不开放编辑。</p>
            </div>
          </div>
          <div className="paw-more-card disabled">
            <span className="paw-more-icon">
              <KeyRound size={18} />
            </span>
            <div>
              <h3 className="paw-more-label">MCP 连接</h3>
              <p className="paw-more-text">MCP token 与权限管理未开放，不生成占位 token。</p>
            </div>
          </div>
        </div>
      </section>

      <section className="paw-list-card mb-4">
        <div className="paw-list-header">
          <div>
            <h2 className="paw-list-title">恢复目标</h2>
            <p className="paw-list-subtitle">系统默认 {formatHours(activeRecoveryTarget.minutes)}，当前不可编辑。</p>
          </div>
          <span className="paw-more-icon">
            <ShieldCheck size={18} />
          </span>
        </div>
        <div className="paw-list-row">
          <div>
            <p className="paw-row-title">系统默认 {formatHours(activeRecoveryTarget.minutes)}</p>
            <p className="paw-row-meta">source: {activeRecoveryTarget.source} · Agent 不应把 recovery 压到目标以下。</p>
          </div>
          <button type="button" disabled className="paw-secondary-btn !px-3 !py-2 !text-xs">
            暂不可配置
          </button>
        </div>
      </section>

      <section className="paw-list-card mb-4">
        <div className="paw-list-header">
          <div>
            <h2 className="paw-list-title">日常事项</h2>
            <p className="paw-list-subtitle">保存到 routines，用于家务、做饭、通勤、运动等固定容量。</p>
          </div>
          <span className="paw-more-icon">
            <RotateCcw size={18} />
          </span>
        </div>

        <form onSubmit={saveRoutine} className="grid gap-3 border-b border-[var(--app-line)] py-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label>
              <span className="paw-field-label">标题</span>
              <input
                value={routineForm.title}
                onChange={(event) => setRoutineForm((current) => ({ ...current, title: event.target.value }))}
                className="paw-input"
                placeholder="做饭 / 通勤 / 运动"
              />
            </label>
            <label>
              <span className="paw-field-label">默认时段</span>
              <select
                value={routineForm.defaultTimeSegment}
                onChange={(event) =>
                  setRoutineForm((current) => ({
                    ...current,
                    defaultTimeSegment: event.target.value as RoutineTimeSegment,
                  }))
                }
                className="paw-input"
              >
                <option value="morning">上午</option>
                <option value="afternoon">下午</option>
                <option value="evening">晚上</option>
                <option value="specific_window">指定时间</option>
              </select>
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-5">
            <label>
              <span className="paw-field-label">开始</span>
              <input
                type="time"
                value={routineForm.defaultStartTime ?? ""}
                onChange={(event) => setRoutineForm((current) => ({ ...current, defaultStartTime: event.target.value }))}
                className="paw-input"
              />
            </label>
            <label>
              <span className="paw-field-label">结束</span>
              <input
                type="time"
                value={routineForm.defaultEndTime ?? ""}
                onChange={(event) => setRoutineForm((current) => ({ ...current, defaultEndTime: event.target.value }))}
                className="paw-input"
              />
            </label>
            <label>
              <span className="paw-field-label">星期规则</span>
              <input
                value={routineForm.weekdayPattern}
                onChange={(event) => setRoutineForm((current) => ({ ...current, weekdayPattern: event.target.value }))}
                className="paw-input"
              />
            </label>
            <label>
              <span className="paw-field-label">分钟</span>
              <input
                type="number"
                min={1}
                value={routineForm.estimatedMinutes}
                onChange={(event) =>
                  setRoutineForm((current) => ({
                    ...current,
                    estimatedMinutes: Number(event.target.value),
                  }))
                }
                className="paw-input"
              />
            </label>
            <label>
              <span className="paw-field-label">能量</span>
              <select
                value={routineForm.energyLevel}
                onChange={(event) =>
                  setRoutineForm((current) => ({ ...current, energyLevel: event.target.value as EnergyLevel }))
                }
                className="paw-input"
              >
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
              </select>
            </label>
          </div>
          <div className="paw-save-row !mt-1">
            <button type="submit" disabled={pending === "routine"} className="paw-primary-btn !px-4 !py-2 !text-sm">
              {isEditing ? <Save size={15} /> : <Plus size={15} />}
              {pending === "routine" ? "保存中" : isEditing ? "保存修改" : "新增日常"}
            </button>
            {isEditing ? (
              <button
                type="button"
                onClick={() => setRoutineForm(emptyRoutineForm)}
                className="paw-secondary-btn !px-4 !py-2 !text-sm"
              >
                取消编辑
              </button>
            ) : null}
          </div>
        </form>

        {routines.length === 0 ? (
          <div className="paw-empty mt-4">
            <h3>还没有日常事项</h3>
            <p>新增后会保存到当前 workspace 的 routines。</p>
          </div>
        ) : (
          <div className="paw-list">
            {routines.map((routine) => (
              <div key={routine.id} className="paw-list-row">
                <div className="min-w-0">
                  <p className="paw-row-title">{routine.title}</p>
                  <p className="paw-row-meta">
                    {segmentLabels[routine.defaultTimeSegment]} · {routine.estimatedMinutes} 分钟 · 能量
                    {energyLabels[routine.energyLevel]} · {routine.weekdayPattern}
                  </p>
                </div>
                <div className="paw-row-actions">
                  <button
                    type="button"
                    onClick={() => setRoutineForm(routine)}
                    className="paw-secondary-btn !px-3 !py-2 !text-xs"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    disabled={pending === routine.id}
                    onClick={() => void deleteExistingRoutine(routine.id)}
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

      <section className="paw-list-card">
        <div className="paw-list-header">
          <div>
            <h2 className="paw-list-title">能量规则</h2>
            <p className="paw-list-subtitle">保存到 segment_energy_settings，告诉 Agent 每个时段适合什么强度。</p>
          </div>
          <span className="paw-more-icon">
            <Zap size={18} />
          </span>
        </div>

        <div className="paw-list">
          {energySettings.map((setting) => (
            <label key={setting.segment} className="paw-list-row">
              <div>
                <p className="paw-row-title">{segmentLabels[setting.segment]}</p>
                <p className="paw-row-meta">默认任务能量强度</p>
              </div>
              <select
                value={setting.energyLevel}
                onChange={(event) => updateEnergy(setting.segment, event.target.value as EnergyLevel)}
                className="paw-input min-w-[120px]"
              >
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
              </select>
            </label>
          ))}
        </div>
        <div className="paw-save-row">
          <button
            type="button"
            disabled={pending === "energy"}
            onClick={() => void saveEnergy()}
            className="paw-primary-btn !px-4 !py-2 !text-sm"
          >
            <Save size={15} />
            {pending === "energy" ? "保存中" : "保存能量规则"}
          </button>
        </div>
      </section>
    </div>
  );
}
