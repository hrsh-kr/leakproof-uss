// Turns the project's markdown docs into HTML fragments, so the site and docs never drift apart.
import fs from 'node:fs';
import path from 'node:path';

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function inlineMd(raw) {
  let s = esc(raw);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  return s;
}

const splitRow = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

/** Find pipe tables; each returns { heading, header, rows }. heading = last markdown heading above. */
export function parseTables(md) {
  const lines = md.split('\n');
  const out = [];
  let heading = '';
  for (let i = 0; i < lines.length; i++) {
    const h = /^(#{1,4})\s+(.*)$/.exec(lines[i]);
    if (h) heading = h[2].trim();
    if (lines[i].startsWith('|') && i + 1 < lines.length && /^\|[\s:|-]+\|?$/.test(lines[i + 1])) {
      const header = splitRow(lines[i]);
      const rows = [];
      let j = i + 2;
      while (j < lines.length && lines[j].startsWith('|')) { rows.push(splitRow(lines[j])); j++; }
      out.push({ heading, header, rows });
      i = j - 1;
    }
  }
  return out;
}

export function tableHtml(t, opts = {}) {
  const cls = opts.className ? ' ' + opts.className : '';
  const head = t.header.map((c) => `<th scope="col">${inlineMd(c)}</th>`).join('');
  const body = t.rows.map((r) => `<tr>${r.map((c) => `<td>${inlineMd(c)}</td>`).join('')}</tr>`).join('');
  return `<div class="table-wrap"><table class="data${cls}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

export function sectionBetween(md, startRe, endRe) {
  const m = startRe.exec(md);
  if (!m) return '';
  const rest = md.slice(m.index + m[0].length);
  const e = endRe.exec(rest);
  return e ? rest.slice(0, e.index) : rest;
}

function listHtml(block) {
  const items = [];
  for (const line of block.split('\n')) {
    const m = /^[-*]\s+(.*)$/.exec(line.trim());
    if (m) items.push(`<li>${inlineMd(m[1])}</li>`);
  }
  return items.length ? `<ul>${items.join('')}</ul>` : '';
}

export function makeGenerators(projectRoot) {
  const read = (f) => fs.readFileSync(path.join(projectRoot, f), 'utf8');
  return {
    requirements() {
      const md = read('06_requirements_register.md');
      const wanted = ['Usability', 'Security', 'Privacy', 'Functional'];
      return parseTables(md).filter((t) => wanted.includes(t.heading))
        .map((t) => `<h3>${esc(t.heading)}</h3>${tableHtml(t)}`).join('\n');
    },
    threats() {
      const md = read('05_threat_model_v0.md');
      const t = parseTables(md).find((x) => /Threats by stage/.test(x.heading));
      return t ? tableHtml(t) : '';
    },
    limits() {
      const md = read('05_threat_model_v0.md');
      const block = sectionBetween(md, /## 5\. Limits we state openly\n/, /\n## /);
      const items = block.split('\n').map((l) => /^\d+\.\s+(.*)$/.exec(l.trim())).filter(Boolean).map((m) => `<li>${inlineMd(m[1])}</li>`);
      return `<ol class="plain">${items.join('')}</ol>`;
    },
    assumptions() {
      const md = read('02_final_scope_and_decisions.md');
      const t = parseTables(md).find((x) => /^3\. Assumptions/.test(x.heading));
      return t ? tableHtml(t) : '';
    },
    rqs() {
      const md = read('02_final_scope_and_decisions.md');
      const t = parseTables(md).find((x) => /^5\. What we do not know/.test(x.heading));
      return t ? tableHtml(t) : '';
    },
    scope() {
      const md = read('02_final_scope_and_decisions.md');
      const t = parseTables(md).find((x) => /^2\. In scope/.test(x.heading));
      return t ? tableHtml(t) : '';
    },
    decisions() {
      const md = read('02_final_scope_and_decisions.md');
      const body = sectionBetween(md, /## 4\. Decision log\n/, /\n## 5\./);
      const parts = body.split(/\n(?=### D\d+\.)/).filter((p) => /^### D\d+\./.test(p));
      return parts.map((p) => {
        const [first, ...rest] = p.split('\n');
        const title = first.replace(/^###\s+/, '');
        return `<details class="decision"><summary>${inlineMd(title)}</summary>${listHtml(rest.join('\n'))}</details>`;
      }).join('\n');
    },
  };
}
