import { useLayoutEffect, useRef } from "react";

import { cn } from "@/lib/utils";

const STAMP = /^(\[[^\]]+\])\s(.*)$/s;

/** 只做阅读辅助的配色：有货的逐项结果标绿，告警和失败标琥珀色，不参与任何判断。 */
function lineTone(text: string): string | undefined {
  if (/ · 有货：/.test(text)) return "text-in-stock";
  if (text.startsWith("告警：") || /失败/.test(text)) return "text-unknown-text";
  return undefined;
}

/**
 * 活动日志。
 *
 * 新内容追加在底部；停在底部时自动跟随最新一行，往上翻看历史时不打断阅读。
 * 所在分页隐藏时元素没有高度，切回来要再对齐一次底部。
 */
export function ActivityLog({ logs, active }: { logs: string[]; active: boolean }) {
  const viewport = useRef<HTMLDivElement>(null);
  const following = useRef(true);

  useLayoutEffect(() => {
    const element = viewport.current;
    if (element && active && following.current) element.scrollTop = element.scrollHeight;
  }, [logs, active]);

  return (
    <div
      ref={viewport}
      role="log"
      aria-label="活动日志内容"
      tabIndex={0}
      onScroll={(event) => {
        const element = event.currentTarget;
        following.current = element.scrollHeight - element.scrollTop - element.clientHeight < 32;
      }}
      className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-4 py-3 focus-visible:outline-none"
    >
      {logs.length === 0 ? (
        <p className="py-10 text-center text-xs text-muted-foreground">等待监控活动…</p>
      ) : (
        <div className="space-y-1.5 font-mono text-xs leading-5 break-words whitespace-pre-wrap select-text">
          {logs.map((line, index) => {
            const match = STAMP.exec(line);
            const text = match?.[2] ?? line;
            return (
              <p key={`${index}-${line.length}`} className={cn("text-foreground/85", lineTone(text))}>
                {match ? <span className="text-muted-foreground/80">{match[1]} </span> : null}
                {text}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}
