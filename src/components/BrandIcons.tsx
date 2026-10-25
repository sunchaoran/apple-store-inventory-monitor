import { useId } from "react";

/**
 * 拾果的标志：只取应用图标里的果子、叶子和对勾，不带底板，深浅主题下都清楚。
 * 图形与 assets/icon.svg 一致，改图标时两处要一起改。
 */
export function BrandMark({ className }: { className?: string }) {
  // useId 可能带冒号等字符，放进 SVG 的 url(#…) 引用前只保留安全字符。
  const id = `brand${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const fruit = `${id}-fruit`;
  const leaf = `${id}-leaf`;
  return (
    <svg viewBox="222 206 580 596" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={fruit} x1="0.2" y1="0.1" x2="0.85" y2="0.95">
          <stop offset="0" stopColor="#FF7B5E" />
          <stop offset="1" stopColor="#E2453B" />
        </linearGradient>
        <linearGradient id={leaf} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#5CCB8A" />
          <stop offset="1" stopColor="#2E9D63" />
        </linearGradient>
      </defs>
      <path d="M506 334 Q500 292 470 262" fill="none" stroke="#7A5134" strokeWidth="24" strokeLinecap="round" />
      <circle cx="512" cy="560" r="232" fill={`url(#${fruit})`} />
      <path d="M522 322 C552 252 618 214 684 214 C672 284 616 330 522 322 Z" fill={`url(#${leaf})`} />
      <path d="M404 566 L486 646 L628 500" fill="none" stroke="#fff" strokeWidth="64" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function GithubBrandIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M12 2C6.477 2 2 6.589 2 12.253c0 4.53 2.865 8.374 6.839 9.731.5.094.682-.222.682-.494 0-.244-.009-.888-.014-1.744-2.782.62-3.369-1.374-3.369-1.374-.455-1.184-1.11-1.499-1.11-1.499-.908-.636.069-.623.069-.623 1.004.073 1.532 1.057 1.532 1.057.892 1.568 2.341 1.115 2.91.853.091-.663.349-1.115.635-1.371-2.221-.259-4.555-1.14-4.555-5.067 0-1.119.389-2.034 1.029-2.751-.103-.26-.446-1.302.098-2.713 0 0 .84-.276 2.75 1.051A9.33 9.33 0 0 1 12 7.992a9.31 9.31 0 0 1 2.504.346c1.909-1.327 2.748-1.051 2.748-1.051.545 1.411.202 2.453.1 2.713.64.717 1.027 1.632 1.027 2.751 0 3.937-2.337 4.805-4.565 5.059.359.317.679.944.679 1.903 0 1.374-.012 2.482-.012 2.819 0 .275.18.593.688.493C19.14 20.625 22 16.783 22 12.253 22 6.589 17.523 2 12 2Z" clipRule="evenodd" />
    </svg>
  );
}

export function XBrandIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}
