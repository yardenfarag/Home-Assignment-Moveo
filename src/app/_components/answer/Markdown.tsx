/**
 * Renders the agent's Markdown answer safely (no raw HTML) with our typography.
 */
import ReactMarkdown from "react-markdown";

/** Props for {@link Markdown}. */
interface MarkdownProps {
  text: string;
}

/** Renders Markdown with readable spacing on the dark theme. */
export function Markdown({ text }: MarkdownProps) {
  return (
    <div className="space-y-3 text-[15px] leading-relaxed text-slate-200">
      <ReactMarkdown
        components={{
          p: ({ children }) => <p>{children}</p>,
          strong: ({ children }) => <strong className="font-medium text-slate-50">{children}</strong>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5 marker:text-slate-500">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5 marker:text-slate-500">{children}</ol>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-sky-300 underline underline-offset-2">
              {children}
            </a>
          ),
          code: ({ children }) => <code className="rounded bg-white/10 px-1 py-0.5 text-[13px]">{children}</code>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
