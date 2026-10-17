// Tiny highlighters for YAML/TOML sources and unified diffs. Used at build time (hero, docs pages)
// and in the browser (demo diffs), so both look the same. Output is HTML; input is always escaped.

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function value(v: string): string {
  // strings, numbers and punctuation inside a YAML flow value
  return v.replace(
    /("(?:[^"\\]|\\.)*"|'[^']*')|(-?\b\d+(?:\.\d+)?\b)|([{}\[\],])|(\b[A-Za-z_][\w-]*(?=:\s))|(&amp;|&lt;|&gt;)/g,
    (m, str, num, punc, key, ent) => {
      if (str) return `<span class="t-str">${str}</span>`;
      if (num) return `<span class="t-num">${num}</span>`;
      if (punc) return `<span class="t-punc">${punc}</span>`;
      if (key) return `<span class="t-key">${key}</span>`;
      return ent ?? m;
    },
  );
}

/** One line of YAML (or TOML / shell): comments, keys, strings, numbers. */
export function highlightLine(raw: string): string {
  let line = escapeHtml(raw);
  let comment = "";
  // a "#" starts a comment unless it's inside quotes
  let inStr: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inStr) {
      if (c === inStr) inStr = null;
    } else if (c === '"' || c === "'") {
      inStr = c;
    } else if (c === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
      comment = line.slice(i);
      line = line.slice(0, i);
      break;
    }
  }
  const m = line.match(/^(\s*(?:-\s+)?)([\w."-]+|\[[\w.]+\])(\s*[:=])(.*)$/);
  let body: string;
  if (m && !/^\s*\|/.test(m[4])) {
    body = `${m[1]}<span class="t-key">${m[2]}</span><span class="t-punc">${m[3]}</span>${value(m[4])}`;
  } else if (/^\s*\[[\w.]+\]\s*$/.test(line)) {
    body = `<span class="t-key">${line}</span>`;
  } else if (m) {
    body = `${m[1]}<span class="t-key">${m[2]}</span><span class="t-punc">${m[3]}</span>${m[4]}`;
  } else {
    body = /^\s*[.\w]+$/.test(line) ? line : value(line);
  }
  return body + (comment ? `<span class="t-com">${comment}</span>` : "");
}

/** A whole file: like highlightLine, but the text of block scalars (`key: >` / `key: |`) stays plain. */
export function highlightSource(text: string): string {
  let block = -1; // indent of the key that opened a block scalar
  return text
    .split("\n")
    .map((line) => {
      const indent = line.length - line.trimStart().length;
      if (block >= 0 && (line.trim() === "" || indent > block)) return escapeHtml(line);
      block = /:\s*[>|][-+]?\s*(#.*)?$/.test(line) ? indent : -1;
      return highlightLine(line);
    })
    .join("\n");
}

/** A unified diff body (from the first @@ on): added/removed lines tinted, the rest highlighted. */
export function highlightDiff(diff: string): string {
  return diff
    .split("\n")
    .map((line) => {
      if (line.startsWith("@@")) return `<span class="d-hunk">${escapeHtml(line)}</span>`;
      if (line.startsWith("+")) return `<span class="d-add">+${highlightLine(line.slice(1))}</span>`;
      if (line.startsWith("-")) return `<span class="d-del">-${highlightLine(line.slice(1))}</span>`;
      return `<span class="d-ctx">${highlightLine(line)}</span>`;
    })
    .join("");
}
