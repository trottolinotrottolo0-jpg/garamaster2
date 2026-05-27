import { Fragment, type ReactNode } from "react";

function parseInline(text: string, keyPrefix: string): ReactNode {
  const parts: ReactNode[] = [];
  const regex = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let partIndex = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[1] !== undefined) {
      parts.push(
        <strong key={`${keyPrefix}-b-${partIndex++}`} className="font-bold text-white">
          {match[1]}
        </strong>
      );
    } else if (match[2] !== undefined) {
      parts.push(
        <em key={`${keyPrefix}-i-${partIndex++}`} className="italic text-slate-300">
          {match[2]}
        </em>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  if (parts.length === 0) return text;
  if (parts.length === 1) return parts[0];

  return <Fragment>{parts}</Fragment>;
}

function isListItem(line: string): boolean {
  return /^\s*[\*\-]\s+/.test(line);
}

function isOrderedItem(line: string): boolean {
  return /^\s*\d+\.\s+/.test(line);
}

function isHeading(line: string): boolean {
  return /^#{1,4}\s+/.test(line.trim());
}

type FormattedMessageProps = {
  text: string;
  className?: string;
};

export function FormattedMessage({ text, className = "" }: FormattedMessageProps) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let lineIndex = 0;
  let blockKey = 0;

  while (lineIndex < lines.length) {
    const line = lines[lineIndex];
    const trimmed = line.trim();

    if (trimmed === "" || trimmed === "---" || trimmed === "***") {
      lineIndex++;
      continue;
    }

    const h3Match = trimmed.match(/^###\s+(.+)$/);
    if (h3Match) {
      blocks.push(
        <h3
          key={blockKey++}
          className="text-sm font-extrabold text-brand-gold mt-4 mb-2 first:mt-0 tracking-tight"
        >
          {parseInline(h3Match[1], `h3-${blockKey}`)}
        </h3>
      );
      lineIndex++;
      continue;
    }

    const h4Match = trimmed.match(/^####\s+(.+)$/);
    if (h4Match) {
      blocks.push(
        <h4 key={blockKey++} className="text-xs font-bold text-white mt-3 mb-1.5">
          {parseInline(h4Match[1], `h4-${blockKey}`)}
        </h4>
      );
      lineIndex++;
      continue;
    }

    const h2Match = trimmed.match(/^##\s+(.+)$/);
    if (h2Match) {
      blocks.push(
        <h2 key={blockKey++} className="text-base font-extrabold text-white mt-4 mb-2">
          {parseInline(h2Match[1], `h2-${blockKey}`)}
        </h2>
      );
      lineIndex++;
      continue;
    }

    if (isListItem(line)) {
      const items: ReactNode[] = [];
      while (lineIndex < lines.length && isListItem(lines[lineIndex])) {
        const itemMatch = lines[lineIndex].match(/^\s*[\*\-]\s+(.+)$/);
        if (!itemMatch) break;
        const indent = lines[lineIndex].match(/^(\s*)/)?.[1]?.length ?? 0;
        items.push(
          <li
            key={items.length}
            className={`leading-relaxed ${indent >= 2 ? "ml-4" : ""}`}
          >
            {parseInline(itemMatch[1], `ul-${blockKey}-${items.length}`)}
          </li>
        );
        lineIndex++;
      }
      blocks.push(
        <ul
          key={blockKey++}
          className="list-disc list-inside space-y-1.5 my-2.5 marker:text-brand-gold text-slate-200"
        >
          {items}
        </ul>
      );
      continue;
    }

    if (isOrderedItem(line)) {
      const items: ReactNode[] = [];
      while (lineIndex < lines.length && isOrderedItem(lines[lineIndex])) {
        const itemMatch = lines[lineIndex].match(/^\s*\d+\.\s+(.+)$/);
        if (!itemMatch) break;
        items.push(
          <li key={items.length} className="leading-relaxed pl-0.5">
            {parseInline(itemMatch[1], `ol-${blockKey}-${items.length}`)}
          </li>
        );
        lineIndex++;
      }
      blocks.push(
        <ol
          key={blockKey++}
          className="list-decimal list-inside space-y-2 my-2.5 text-slate-200"
        >
          {items}
        </ol>
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (lineIndex < lines.length) {
      const current = lines[lineIndex];
      const currentTrimmed = current.trim();
      if (
        currentTrimmed === "" ||
        currentTrimmed === "---" ||
        isHeading(current) ||
        isListItem(current) ||
        isOrderedItem(current)
      ) {
        break;
      }
      paragraphLines.push(currentTrimmed);
      lineIndex++;
    }

    if (paragraphLines.length > 0) {
      blocks.push(
        <p key={blockKey++} className="my-2 leading-relaxed text-slate-100">
          {parseInline(paragraphLines.join(" "), `p-${blockKey}`)}
        </p>
      );
    } else {
      lineIndex++;
    }
  }

  return (
    <div className={`space-y-0.5 text-[13px] font-sans ${className}`.trim()}>
      {blocks}
    </div>
  );
}
