import { FileText, Table } from "lucide-react";
import { CatIcon } from "./cat-icon";

export function ImportView() {
  return (
    <div className="paw-page">
      <section className="paw-page-header">
        <p className="paw-greeting">Import</p>
        <h1 className="paw-page-date">导入</h1>
        <div className="paw-agent-row">
          <CatIcon size={44} mood="think" />
          <p className="paw-agent-msg">导入入口只负责把计划和课表写进数据层；拆分和重排仍然交给 Agent 审核。</p>
        </div>
      </section>

      <section className="paw-more-grid">
        <div className="paw-more-card disabled">
          <span className="paw-more-icon">
            <FileText size={18} />
          </span>
          <div>
            <h2 className="paw-more-label">计划文档</h2>
            <p className="paw-more-text">支持 plan.md / html 文档导入，生成待确认拆分。</p>
            <p className="paw-more-text">暂未开放上传与预览。</p>
          </div>
        </div>
        <div className="paw-more-card disabled">
          <span className="paw-more-icon">
            <Table size={18} />
          </span>
          <div>
            <h2 className="paw-more-label">课表文件</h2>
            <p className="paw-more-text">支持 timetable.csv，用作课程和不可用时间约束。</p>
            <p className="paw-more-text">暂未开放上传与校验。</p>
          </div>
        </div>
      </section>
    </div>
  );
}
