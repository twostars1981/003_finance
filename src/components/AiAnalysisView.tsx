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
    <p className="mb-3 text-sm leading-relaxed text-zinc-800 last:mb-0 dark:text-zinc-200">
      {children}
    </p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-zinc-900 dark:text-zinc-50">
      {children}
    </strong>
  ),
  em: ({ children }) => (
    <em className="italic text-zinc-700 dark:text-zinc-300">{children}</em>
  ),
  ul: ({ children }) => (
    <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-zinc-800 dark:text-zinc-200">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-zinc-800 dark:text-zinc-200">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => (
    <h3 className="mb-2 mt-5 border-b border-zinc-200 pb-1 text-base font-semibold text-zinc-900 first:mt-0 dark:border-zinc-700 dark:text-zinc-50">
      {children}
    </h3>
  ),
  h2: ({ children }) => (
    <h3 className="mb-2 mt-5 text-base font-semibold text-zinc-900 first:mt-0 dark:text-zinc-50">
      {children}
    </h3>
  ),
  h3: ({ children }) => (
    <h4 className="mb-2 mt-4 text-sm font-semibold text-zinc-900 first:mt-0 dark:text-zinc-50">
      {children}
    </h4>
  ),
  code: ({ className, children, ...props }) => {
    const inline = !className;
    if (inline) {
      return (
        <code
          className="rounded bg-zinc-200/80 px-1.5 py-0.5 font-mono text-[0.85em] text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        className="block font-mono text-xs text-zinc-100"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mb-3 overflow-x-auto rounded-lg bg-zinc-900 p-3 text-zinc-100 dark:bg-zinc-950">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-3 border-l-4 border-indigo-300 pl-3 text-sm text-zinc-600 italic dark:border-indigo-600 dark:text-zinc-400">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      className="font-medium text-indigo-600 underline decoration-indigo-400/60 underline-offset-2 hover:text-indigo-500 dark:text-indigo-400"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  hr: () => (
    <hr className="my-4 border-zinc-200 dark:border-zinc-700" />
  ),
};

type Props = {
  content: string;
};

export function AiAnalysisView({ content }: Props) {
  const { markdown, modelLabel } = splitAnalysisContent(content);

  return (
    <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/80">
      <div className="ai-analysis-md">
        <ReactMarkdown components={markdownComponents}>{markdown}</ReactMarkdown>
      </div>
      {modelLabel ? (
        <p className="mt-4 border-t border-zinc-200 pt-3 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          사용 모델: <span className="font-mono text-zinc-700 dark:text-zinc-300">{modelLabel}</span>
        </p>
      ) : null}
    </div>
  );
}
