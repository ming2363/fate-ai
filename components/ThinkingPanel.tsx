"use client";

export function ThinkingPanel({
  phaseLabel,
  elapsed,
  text,
  truncated,
  expanded,
  onToggle,
  onCancel,
  tasks,
}: {
  readonly phaseLabel: string;
  readonly elapsed: string;
  readonly text: string;
  readonly truncated: boolean;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly onCancel: () => void;
  readonly tasks?: readonly { readonly label: string; readonly phase: string; readonly text: string; readonly truncated: boolean }[];
}) {
  const hasProcess = tasks ? tasks.some((task) => task.text.length > 0) : text.length > 0;
  return (
    <section className="think" aria-label="解读进度">
      <div className="think-head">
        <strong>{tasks ? "解读进度" : phaseLabel}</strong>
        <span className="fine">已用 {elapsed}</span>
      </div>
      <p className="fine">每部分通过检查后才显示正文；过程片段不代表最终结论。</p>
      {tasks ? tasks.map((task) => <div key={task.label} className="think-task">
        <div className="think-task-head"><strong>{task.label}</strong><span>{task.phase}</span></div>
        <p className="fine">{task.phase === "已完成" ? "已通过检查，正文见下方。" : task.phase === "未完成" ? "这部分暂未得到可用结果。" : task.text ? `已收到 ${task.text.length}${task.truncated ? "+" : ""} 字过程片段，正在继续处理。` : "等待模型返回过程片段。"}</p>
        {expanded && task.text ? <pre className="open" aria-hidden="true">{task.text}</pre> : null}
      </div>) : <>
        <p className="fine">{text ? `已收到 ${text.length}${truncated ? "+" : ""} 字过程片段。` : "等待模型返回过程片段。"}</p>
        {expanded && text ? <pre className="open" aria-hidden="true">{text}</pre> : null}
      </>}
      <div className="actions">
        <button type="button" className="quiet" aria-expanded={expanded} disabled={!hasProcess} onClick={onToggle}>{expanded ? "收起原始过程" : "查看原始过程"}</button>
        <button type="button" className="quiet" onClick={onCancel}>取消生成</button>
      </div>
    </section>
  );
}
