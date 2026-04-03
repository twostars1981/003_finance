"use client";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";

const MODEL_MARKER = "\n\n— 사용 모델:";

export function splitAnalysisContent(full: string): {
  markdown: string;
  modelLabel?: string;
} {
  const i = full.indexOf(MODEL_MARKER);
  if (i === -1) return { markdown: full.trimEnd() };
  return {
    markdown: full.slice(0, i).trimEnd(),
    modelLabel: full.slice(i + MODEL_MARKER.length).trim() || undefined,
  };
}

const markdownComponents: Components = {
  p: ({ children }) => (
    <p className="mb-3 text-sm leading-relaxed text-kf-text/95 last:mb-0">
      {children}
    </p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-kf-text">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-kf-muted">{children}</em>
  ),
  ul: ({ children }) => (
    <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-kf-text/95">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-kf-text/95">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => (
    <h3 className="mb-2 mt-5 border-b border-kf-border pb-1 text-base font-semibold text-kf-text first:mt-0">
      {children}
    </h3>
  ),
  h2: ({ children }) => (
    <h3 className="mb-2 mt-5 text-base font-semibold text-kf-text first:mt-0">
      {children}
    </h3>
  ),
  h3: ({ children }) => (
    <h4 className="mb-2 mt-4 text-sm font-semibold text-kf-text first:mt-0">
      {children}
    </h4>
  ),
  code: ({ className, children, ...props }) => {
    const inline = !className;
    if (inline) {
      return (
        <code
          className="rounded bg-kf-elevated px-1.5 py-0.5 font-mono text-[0.85em] text-kf-accent"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code className="block font-mono text-xs text-kf-text" {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mb-3 overflow-x-auto rounded-md border border-kf-border bg-kf-bg p-3 text-kf-text">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-3 border-l-[3px] border-kf-accent/50 pl-3 text-sm italic text-kf-muted">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      className="font-medium text-kf-link underline decoration-kf-border-strong/50 underline-offset-2 hover:text-kf-accent"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  hr: () => <hr className="my-4 border-kf-border" />,
};

type Props = {
  content: string;
};

export function AiAnalysisView({ content }: Props) {
  const { markdown, modelLabel } = splitAnalysisContent(content);

  return (
    <div className="mt-4 min-w-0 max-w-full overflow-hidden rounded-md border border-kf-border bg-kf-bg p-3 sm:p-4">
      <div className="ai-analysis-md break-words">
        <ReactMarkdown components={markdownComponents}>{markdown}</ReactMarkdown>
      </div>
      {modelLabel ? (
        <p className="mt-4 border-t border-kf-border pt-3 text-xs text-kf-dim">
          사용 모델:{" "}
          <span className="font-mono text-kf-muted">{modelLabel}</span>
        </p>
      ) : null}
    </div>
  );
}
