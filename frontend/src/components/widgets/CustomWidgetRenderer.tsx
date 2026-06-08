import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { transform } from "sucrase";

import type { Widget } from "../../lib/types";

/**
 * Runtime mount for AI-generated widgets.
 *
 * There is no build-time bundler story for these — the source lives in the
 * `custom_widgets` table as a single function expression
 * `({ widget }) => { ... }` (see app.repositories.custom_widgets.CUSTOM_WIDGET_CONTRACT
 * server-side). We transpile it with Sucrase (JSX → React.createElement) and
 * execute it via `new Function`, handing it only the bindings the contract
 * allows (React + the common hooks) — it shares the page's React instance so
 * theming/Tailwind/SSE all just work like any other widget.
 *
 * This is *not* a security sandbox (the function body still runs in the page's
 * global scope) — see the threat-model note in the implementation plan: the
 * realistic risk here is the LLM producing broken JSX, not a malicious actor.
 * The error boundary below is the load-bearing safety net.
 */

type CustomComponent = (props: { widget: Widget }) => React.ReactElement | null;
type CompileResult = { component: CustomComponent } | { error: string };

const compiledCache = new Map<string, CompileResult>();

function compile(source: string): CompileResult {
  const cached = compiledCache.get(source);
  if (cached) return cached;

  let result: CompileResult;
  try {
    const { code } = transform(`const Widget = (${source});\nreturn Widget;`, {
      transforms: ["jsx"],
    });
    const factory = new Function("React", "useState", "useEffect", "useMemo", "useRef", code);
    const component = factory(React, useState, useEffect, useMemo, useRef) as unknown;
    if (typeof component !== "function") {
      throw new Error("widget source must evaluate to a function of the shape ({ widget }) => ...");
    }
    result = { component: component as CustomComponent };
  } catch (err) {
    result = { error: err instanceof Error ? err.message : String(err) };
  }
  compiledCache.set(source, result);
  return result;
}

function ErrorCard({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-3 text-center">
      <span className="text-sm font-medium text-red-300/80">{title}</span>
      {detail && <span className="text-xs text-red-300/60 line-clamp-3">{detail}</span>}
    </div>
  );
}

class CustomWidgetBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return <ErrorCard title="Widget error" detail={this.state.error.message} />;
    }
    return this.props.children;
  }
}

interface Props {
  widget: Widget;
  sourceCode: string;
}

function CustomWidgetRenderer({ widget, sourceCode }: Props) {
  const compiled = useMemo(() => compile(sourceCode), [sourceCode]);

  if ("error" in compiled) {
    return <ErrorCard title="Widget failed to compile" detail={compiled.error} />;
  }

  const Component = compiled.component;
  return (
    <CustomWidgetBoundary key={sourceCode}>
      <Component widget={widget} />
    </CustomWidgetBoundary>
  );
}

export default CustomWidgetRenderer;
