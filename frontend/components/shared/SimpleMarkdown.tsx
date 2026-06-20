"use client";

import type { ReactNode } from "react";
import Link from "next/link";

function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      parts.push(
        <code key={key++} className="rounded bg-muted px-1 py-0.5 text-xs">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("[")) {
      const linkMatch = /\[([^\]]+)\]\(([^)]+)\)/.exec(token);
      if (linkMatch) {
        const [, label, href] = linkMatch;
        if (href.startsWith("http")) {
          parts.push(
            <a key={key++} href={href} className="text-cyan-600 hover:underline" target="_blank" rel="noreferrer">
              {label}
            </a>,
          );
        } else {
          parts.push(
            <Link key={key++} href={href} className="text-cyan-600 hover:underline">
              {label}
            </Link>,
          );
        }
      }
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** Lightweight markdown renderer for in-app user guides (no extra dependency). */
export function SimpleMarkdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let listItems: string[] = [];
  let key = 0;

  const flushList = () => {
    if (!listItems.length) return;
    nodes.push(
      <ul key={key++} className="my-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {listItems.map((item, idx) => (
          <li key={idx}>{renderInline(item)}</li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushList();
      continue;
    }
    if (line.startsWith("# ")) {
      flushList();
      nodes.push(
        <h1 key={key++} className="mb-4 text-2xl font-bold text-foreground">
          {line.slice(2)}
        </h1>,
      );
      continue;
    }
    if (line.startsWith("## ")) {
      flushList();
      nodes.push(
        <h2 key={key++} className="mb-3 mt-6 text-xl font-semibold text-foreground">
          {line.slice(3)}
        </h2>,
      );
      continue;
    }
    if (line.startsWith("### ")) {
      flushList();
      nodes.push(
        <h3 key={key++} className="mb-2 mt-4 text-lg font-medium text-foreground">
          {line.slice(4)}
        </h3>,
      );
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      listItems.push(line.slice(2));
      continue;
    }
    if (/^\|.+\|$/.test(line.trim())) {
      flushList();
      nodes.push(
        <p key={key++} className="my-2 overflow-x-auto font-mono text-xs text-muted-foreground">
          {line}
        </p>,
      );
      continue;
    }
    flushList();
    nodes.push(
      <p key={key++} className="my-2 text-sm leading-relaxed text-muted-foreground">
        {renderInline(line)}
      </p>,
    );
  }
  flushList();

  return <article className="max-w-none">{nodes}</article>;
}
