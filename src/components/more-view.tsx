import { Archive, CalendarDays, ChevronRight, Clock3, Download, KeyRound, Settings } from "lucide-react";
import Link from "next/link";
import { CatIcon } from "./cat-icon";

type Tool = {
  href: string;
  title: string;
  text: string;
  icon: typeof Archive;
  active: boolean;
};

const sections: Array<{ title: string; tools: Tool[] }> = [
  {
    title: "收集",
    tools: [
      {
        href: "/inbox",
        title: "暂存池",
        text: "临时捕捉琐事，不占今日容量。",
        icon: Archive,
        active: true,
      },
      {
        href: "/import",
        title: "导入",
        text: "导入计划文档和课表文件。",
        icon: Download,
        active: true,
      },
    ],
  },
  {
    title: "约束",
    tools: [
      {
        href: "/more",
        title: "日历与课程",
        text: "课程、固定日程、不可用时间。",
        icon: CalendarDays,
        active: false,
      },
      {
        href: "/more",
        title: "日常事项",
        text: "家务、通勤、运动等固定消耗。",
        icon: Clock3,
        active: false,
      },
    ],
  },
  {
    title: "连接",
    tools: [
      {
        href: "/settings",
        title: "设置",
        text: "Workspace、规则默认值和恢复目标。",
        icon: Settings,
        active: true,
      },
      {
        href: "/settings",
        title: "MCP 连接",
        text: "给 Codex / Cowork 读取计划数据。",
        icon: KeyRound,
        active: true,
      },
    ],
  },
];

export function MoreView() {
  return (
    <div className="paw-page">
      <section className="paw-page-header">
        <h1 className="paw-page-date">更多</h1>
        <div className="paw-agent-row">
          <CatIcon size={40} mood="sleep" />
          <p className="paw-agent-msg">不常用的入口都收在这里。每天看 Today、Plan、Review 就够了。</p>
        </div>
      </section>

      <div className="paw-more-sections">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="paw-more-section-title">{section.title}</h2>
            <div className="paw-more-grid">
              {section.tools.map((tool) => {
                const Icon = tool.icon;
                const content = (
                  <div className={`paw-more-card ${tool.active ? "" : "disabled"}`}>
                    <span className="paw-more-icon">
                      <Icon size={18} />
                    </span>
                    <div>
                      <h3 className="paw-more-label">{tool.title}</h3>
                      <p className="paw-more-text">{tool.text}</p>
                      {!tool.active ? <span className="paw-more-badge">即将开放</span> : null}
                    </div>
                    {tool.active ? (
                      <span className="paw-more-action" aria-hidden="true">
                        <ChevronRight size={18} />
                      </span>
                    ) : null}
                  </div>
                );

                return tool.active ? (
                  <Link key={tool.title} href={tool.href} className="block no-underline">
                    {content}
                  </Link>
                ) : (
                  <div key={tool.title}>{content}</div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <p className="paw-version">PawPlan v0.1</p>
    </div>
  );
}
