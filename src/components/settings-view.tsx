import { KeyRound, RotateCcw, Settings, ShieldCheck, Zap } from "lucide-react";
import { CatIcon } from "./cat-icon";

const settings = [
  {
    title: "Workspace",
    text: "单人数据空间、登录密码和本地部署信息。",
    icon: Settings,
  },
  {
    title: "MCP 连接",
    text: "给 Codex / Cowork 读取计划、写回建议和保存摘要。",
    icon: KeyRound,
  },
  {
    title: "恢复目标",
    text: "每周 recovery 最低时长，Agent 不能压缩。",
    icon: ShieldCheck,
  },
  {
    title: "日常事项",
    text: "家务、做饭、通勤、运动等固定容量。",
    icon: RotateCcw,
  },
  {
    title: "能量规则",
    text: "告诉 Agent：上午适合高强度任务，晚上尽量排低能量任务。",
    icon: Zap,
  },
];

export function SettingsView() {
  return (
    <div className="paw-page">
      <section className="paw-page-header">
        <p className="paw-greeting">Settings</p>
        <h1 className="paw-page-date">设置</h1>
        <div className="paw-agent-row">
          <CatIcon size={44} mood="sleep" />
          <p className="paw-agent-msg">这里放不会每天改的规则。Today 不承担设置功能，避免主界面变复杂。</p>
        </div>
      </section>

      <section className="paw-more-grid">
        {settings.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="paw-more-card disabled">
              <span className="paw-more-icon">
                <Icon size={18} />
              </span>
              <div>
                <h2 className="paw-more-label">{item.title}</h2>
                <p className="paw-more-text">{item.text}</p>
                <p className="paw-more-text">暂未开放编辑</p>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
