// main.ts is mend, the CLI SPEC.md specifies, and this is the kit's starting point for it (MIT). It does sections 1 to 4, 9 and 10 of SPEC.md: the command line, the output and
// exit codes, safe paths, format detection, JSON edits and the all-or-nothing write. The other three formats are
// detected and then read as holding no edit, so they answer `error: parse 1`: reading unified diffs (section 6),
// SEARCH/REPLACE blocks (section 7) and V4A patches (section 8), and matching lines at three tiers (section 5), are
// yours to write. Node 22, the standard library alone; run it as `node main.ts [options] [PATCH]`.
//
// In a trial the grader runs `node /bot/main.ts` with MAKEFUN_ENV_URL set, and then this file hands over to runner.ts
// (the last lines below): keep that hand-over and runner.ts as they are, and write the CLI.

import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';

const FORMATS = ['auto', 'unified', 'search-replace', 'v4a', 'json'];

class Exit2 {
  readonly line: string;
  constructor(line: string) {
    this.line = line;
  }
}
class Fail {
  readonly code: string;
  readonly path: string;
  constructor(code: string, path: string) {
    this.code = code;
    this.path = path;
  }
}

const blank = (s: string): boolean => s.trim() === '';

function patchLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  if (text.endsWith('\n')) lines.pop();
  return lines.map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
}

function safe(p: string): boolean {
  return p !== '' && !p.startsWith('/') && !p.includes('\\') && p.split('/').every((s) => s !== '' && s !== '.' && s !== '..');
}

/** The tree as the edits leave it: changed paths in `now` (null: deleted), the rest read from disk. */
class Tree {
  private readonly orig = new Map<string, string | null>();
  readonly now = new Map<string, string | null>();
  /** Successful moves, in order, for the R output lines (SPEC.md section 2). */
  readonly moves: { old: string; new: string }[] = [];
  original(p: string): string | null {
    if (!this.orig.has(p)) {
      let v: string | null = null;
      try {
        if (statSync(p).isFile()) v = readFileSync(p, 'utf8');
      } catch {
        v = null;
      }
      this.orig.set(p, v);
    }
    return this.orig.get(p)!;
  }
  get(p: string): string | null {
    return this.now.has(p) ? this.now.get(p)! : this.original(p);
  }
}

type Edit = (tree: Tree) => void;

function detect(lines: string[]): string | null {
  const first = lines.findIndex((l) => !blank(l));
  if (first < 0) return null;
  if (lines[first]!.trim() === '*** Begin Patch') return 'v4a';
  const c = lines[first]!.trimStart()[0];
  if (c === '[' || c === '{') return 'json';
  if (lines.some((l) => l.trimEnd() === '<<<<<<< SEARCH')) return 'search-replace';
  if (lines.some((l, i) => l.startsWith('diff --git ') || (l.startsWith('--- ') && (lines[i + 1] ?? '').startsWith('+++ ')))) return 'unified';
  return null;
}

/** One JSON edit object (SPEC.md section 9), or null when it is not one. */
function jsonEdit(v: unknown): Edit | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const p = o.path;
  if (typeof p !== 'string') return null;
  const exists = (tree: Tree): string => {
    if (!safe(p)) throw new Fail('unsafe', p);
    const t = tree.get(p);
    if (t === null) throw new Fail('missing', p);
    return t;
  };
  if (o.command === 'create' && typeof o.file_text === 'string') {
    const text = o.file_text;
    return (tree) => {
      if (!safe(p)) throw new Fail('unsafe', p);
      if (tree.get(p) !== null) throw new Fail('exists', p);
      tree.now.set(p, text);
    };
  }
  if (o.command === 'str_replace' && typeof o.old_str === 'string' && o.old_str !== '' && (o.new_str === undefined || typeof o.new_str === 'string')) {
    const oldStr = o.old_str;
    const newStr = (o.new_str as string | undefined) ?? '';
    return (tree) => {
      const before = exists(tree);
      const nl = before.indexOf('\n');
      const crlf = nl > 0 && before[nl - 1] === '\r';
      const lf = (s: string): string => (crlf ? s.replaceAll('\r\n', '\n') : s);
      const t = lf(before);
      const old = lf(oldStr);
      let count = 0;
      for (let k = t.indexOf(old); k >= 0; k = t.indexOf(old, k + 1)) count += 1;
      if (count === 0) throw new Fail('no-match', p);
      if (count > 1) throw new Fail('ambiguous', p);
      const at = t.indexOf(old);
      const out = t.slice(0, at) + lf(newStr) + t.slice(at + old.length);
      tree.now.set(p, crlf ? out.replaceAll('\n', '\r\n') : out);
    };
  }
  if (o.command === 'insert' && typeof o.insert_line === 'number' && Number.isInteger(o.insert_line) && typeof o.new_str === 'string') {
    const line = o.insert_line;
    const add = patchLines(o.new_str);
    return (tree) => {
      const before = exists(tree);
      const nl = before.indexOf('\n');
      const br = nl > 0 && before[nl - 1] === '\r' ? '\r\n' : '\n';
      const lines = before === '' ? [] : before.split(br);
      const final = before !== '' && before.endsWith(br);
      if (final) lines.pop();
      if (line < 0 || line > lines.length) throw new Fail('no-match', p);
      lines.splice(line, 0, ...add);
      tree.now.set(p, lines.length === 0 ? '' : lines.join(br) + (final ? br : ''));
    };
  }
  return null;
}

function jsonEdits(text: string, lines: string[]): Edit[] {
  const first = lines.findIndex((l) => !blank(l));
  if (first < 0) throw new Exit2('error: parse 1');
  const edits: Edit[] = [];
  if (lines[first]!.trimStart().startsWith('[')) {
    let v: unknown;
    try {
      v = JSON.parse(text);
    } catch {
      throw new Exit2(`error: parse ${first + 1}`);
    }
    if (!Array.isArray(v)) throw new Exit2(`error: parse ${first + 1}`);
    for (const x of v) {
      const e = jsonEdit(x);
      if (e === null) throw new Exit2(`error: parse ${first + 1}`);
      edits.push(e);
    }
    return edits;
  }
  lines.forEach((l, i) => {
    if (blank(l)) return;
    let e: Edit | null = null;
    try {
      e = jsonEdit(JSON.parse(l));
    } catch {
      e = null;
    }
    if (e === null) throw new Exit2(`error: parse ${i + 1}`);
    edits.push(e);
  });
  return edits;
}

// ---- line model and matching (SPEC.md sections 3 and 5) ----

interface FileLines {
  br: '\n' | '\r\n';
  lines: string[];
  final: boolean;
}

function parseFile(text: string): FileLines {
  if (text === '') return { br: '\n', lines: [], final: false };
  const nl = text.indexOf('\n');
  const br: '\n' | '\r\n' = nl > 0 && text[nl - 1] === '\r' ? '\r\n' : '\n';
  const parts = text.split(br);
  const final = text.endsWith(br);
  if (final) parts.pop();
  return { br, lines: parts, final };
}

function writeFileText(f: FileLines): string {
  if (f.lines.length === 0) return '';
  return f.lines.join(f.br) + (f.final ? f.br : '');
}

function leadingWs(s: string): string {
  const m = /^[ \t]*/.exec(s);
  return m ? m[0] : '';
}

function trailTrim(s: string): string {
  return s.replace(/[ \t]+$/, '');
}

function lineEq(a: string, b: string, tier: number): boolean {
  if (tier === 0) return a === b;
  if (tier === 1) return trailTrim(a) === trailTrim(b);
  return trailTrim(a.replace(/^[ \t]+/, '')) === trailTrim(b.replace(/^[ \t]+/, ''));
}

function occurrences(O: string[], lines: string[], tier: number, from: number): number[] {
  const out: number[] = [];
  if (O.length === 0) return out;
  for (let i = from; i + O.length <= lines.length; i++) {
    let ok = true;
    for (let j = 0; j < O.length; j++) {
      if (!lineEq(O[j]!, lines[i + j]!, tier)) { ok = false; break; }
    }
    if (ok) out.push(i);
  }
  return out;
}

function findTier(O: string[], lines: string[], strict: boolean, from = 0): { tier: number; pos: number[] } | null {
  const tiers = strict ? [0] : [0, 1, 2];
  for (const t of tiers) {
    const pos = occurrences(O, lines, t, from);
    if (pos.length > 0) return { tier: t, pos };
  }
  return null;
}

/**
 * N with context lines taken from the file itself and tier-2 re-indentation
 * applied to the other lines. nToO[j] is the index into O of N[j] when N[j]
 * is a context line, else -1.
 */
function buildReplacement(fileLines: string[], at: number, O: string[], N: string[], nToO: number[], tier: number): string[] {
  const out: string[] = [];
  const P = tier === 2 ? leadingWs(O[0]!) : '';
  const F = tier === 2 ? leadingWs(fileLines[at]!) : '';
  for (let j = 0; j < N.length; j++) {
    const oi = nToO[j]!;
    if (oi >= 0) {
      out.push(fileLines[at + oi]!);
      continue;
    }
    let line = N[j]!;
    if (tier === 2 && line !== '' && line.trim() !== '' && line.startsWith(P)) line = F + line.slice(P.length);
    out.push(line);
  }
  return out;
}

// ---- unified diffs (SPEC.md section 6) ----

type BodyEntry = { type: 'ctx' | 'old' | 'new' | 'bs'; text: string };

interface Hunk {
  a: number;
  body: BodyEntry[];
}

interface USection {
  oldPath: string | null | undefined;
  newPath: string | null | undefined;
  createFlag: boolean;
  delFlag: boolean;
  renameFrom: string | undefined;
  renameTo: string | undefined;
  diffOld: string | undefined;
  diffNew: string | undefined;
  hunks: Hunk[];
}

function stripAB(p: string): string {
  if (p.startsWith('a/') || p.startsWith('b/')) return p.slice(2);
  return p;
}

/** A --- / +++ path: text after the four characters, up to the first tab, trimmed. */
function headerPath(raw: string): string | null {
  let t = raw.slice(4);
  const tab = t.indexOf('\t');
  if (tab >= 0) t = t.slice(0, tab);
  t = t.trim();
  if (t === '/dev/null') return null;
  return stripAB(t);
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const DIFF_RE = /^diff --git a\/(.*) b\/(.*)$/;

function parseUnified(lines: string[]): USection[] {
  const sections: USection[] = [];
  const n = lines.length;
  let i = 0;
  let sec: USection | null = null;
  let headerDone = false;
  const startSection = (): USection => {
    const s: USection = { oldPath: undefined, newPath: undefined, createFlag: false, delFlag: false, renameFrom: undefined, renameTo: undefined, diffOld: undefined, diffNew: undefined, hunks: [] };
    sections.push(s);
    return s;
  };
  const isDeletion = (s: USection): boolean => s.delFlag || s.newPath === null;
  while (i < n) {
    const line = lines[i]!;
    if (line.startsWith('diff --git ')) {
      const m = DIFF_RE.exec(line);
      if (!m) throw new Exit2(`error: parse ${i + 1}`);
      sec = startSection();
      sec.diffOld = stripAB(m[1]!);
      sec.diffNew = stripAB(m[2]!);
      headerDone = false;
      i += 1;
      continue;
    }
    if (line.startsWith('--- ') && (lines[i + 1] ?? '').startsWith('+++ ')) {
      if (sec !== null && !headerDone && sec.hunks.length === 0) {
        sec.oldPath = headerPath(line);
        sec.newPath = headerPath(lines[i + 1]!);
        headerDone = true;
        i += 2;
        continue;
      }
      sec = startSection();
      sec.oldPath = headerPath(line);
      sec.newPath = headerPath(lines[i + 1]!);
      headerDone = true;
      i += 2;
      continue;
    }
    if (sec === null) {
      if (line.startsWith('@@')) throw new Exit2(`error: parse ${i + 1}`);
      i += 1;
      continue;
    }
    if (sec.hunks.length === 0 && line.startsWith('--- ')) {
      throw new Exit2(`error: parse ${i + 2}`);
    }
    if (line.startsWith('@@')) {
      const m = HUNK_RE.exec(line);
      if (!m) throw new Exit2(`error: parse ${i + 1}`);
      i += 1;
      if (isDeletion(sec)) {
        // A deletion's hunks are not read: skip to the next section.
        while (i < n) {
          const b = lines[i]!;
          if (b.startsWith('diff --git ')) break;
          if (b.startsWith('--- ') && (lines[i + 1] ?? '').startsWith('+++ ')) break;
          i += 1;
        }
        continue;
      }
      const hunk: Hunk = { a: Number(m[1]), body: [] };
      while (i < n) {
        const b = lines[i]!;
        if (b.startsWith('diff --git ')) break;
        if (b.startsWith('--- ') && (lines[i + 1] ?? '').startsWith('+++ ')) break;
        if (b === '') { hunk.body.push({ type: 'ctx', text: '' }); i += 1; continue; }
        const c = b[0];
        if (c === ' ') { hunk.body.push({ type: 'ctx', text: b.slice(1) }); i += 1; continue; }
        if (c === '-') { hunk.body.push({ type: 'old', text: b.slice(1) }); i += 1; continue; }
        if (c === '+') { hunk.body.push({ type: 'new', text: b.slice(1) }); i += 1; continue; }
        if (c === '\\') { hunk.body.push({ type: 'bs', text: b }); i += 1; continue; }
        break;
      }
      while (hunk.body.length > 0) {
        const last = hunk.body[hunk.body.length - 1]!;
        if (last.type === 'ctx' && last.text === '') hunk.body.pop();
        else break;
      }
      sec.hunks.push(hunk);
      continue;
    }
    if (sec.hunks.length === 0) {
      if (line.startsWith('rename from ')) sec.renameFrom = line.slice('rename from '.length).trim();
      else if (line.startsWith('rename to ')) sec.renameTo = line.slice('rename to '.length).trim();
      else if (line.startsWith('new file mode')) sec.createFlag = true;
      else if (line.startsWith('deleted file mode')) sec.delFlag = true;
      i += 1;
      continue;
    }
    i += 1;
  }
  return sections;
}

/** True when a `\` line follows the hunk's last context or `+` line. */
function hunkNoNl(hunk: Hunk): boolean {
  for (let k = hunk.body.length - 1; k >= 0; k--) {
    const e = hunk.body[k]!;
    if (e.type === 'ctx' || e.type === 'new') return hunk.body[k + 1]?.type === 'bs';
  }
  return false;
}

function applyHunksToFile(f: FileLines, hunks: Hunk[], strict: boolean, path: string): void {
  let d = 0;
  for (const h of hunks) {
    const O: string[] = [];
    const N: string[] = [];
    const nToO: number[] = [];
    for (const b of h.body) {
      if (b.type === 'ctx') { nToO.push(O.length); O.push(b.text); N.push(b.text); }
      else if (b.type === 'old') { O.push(b.text); }
      else if (b.type === 'new') { nToO.push(-1); N.push(b.text); }
    }
    const noNl = hunkNoNl(h);
    if (O.length > 0) {
      const found = findTier(O, f.lines, strict, 0);
      if (!found) throw new Fail('no-match', path);
      const target = h.a - 1 + d;
      let best = found.pos[0]!;
      let bestDist = Math.abs(best - target);
      for (const p of found.pos) {
        const dist = Math.abs(p - target);
        if (dist < bestDist) { best = p; bestDist = dist; }
      }
      const at = best;
      const reachesEnd = at + O.length === f.lines.length;
      const rep = buildReplacement(f.lines, at, O, N, nToO, found.tier);
      f.lines.splice(at, O.length, ...rep);
      if (reachesEnd) f.final = !noNl;
    } else {
      const idx = Math.max(0, Math.min(h.a + d, f.lines.length));
      const atEnd = idx === f.lines.length;
      f.lines.splice(idx, 0, ...N);
      if (atEnd) f.final = !noNl;
    }
    d += N.length - O.length;
  }
}

function unifiedEdits(lines: string[], strict: boolean): Edit[] {
  const sections = parseUnified(lines);
  if (sections.length === 0) throw new Exit2('error: parse 1');
  return sections.map((sec) => (tree: Tree) => {
    const oldP = sec.oldPath !== undefined ? sec.oldPath : (sec.renameFrom ?? sec.diffOld);
    const newP = sec.newPath !== undefined ? sec.newPath : (sec.renameTo ?? sec.diffNew);
    const isCreate = sec.createFlag || oldP === null;
    const isDelete = sec.delFlag || newP === null;
    if (isCreate) {
      const p = newP ?? '';
      if (!safe(p)) throw new Fail('unsafe', p);
      if (tree.get(p) !== null) throw new Fail('exists', p);
      const outLines: string[] = [];
      for (const h of sec.hunks) for (const b of h.body) if (b.type === 'new') outLines.push(b.text);
      const flat: BodyEntry[] = sec.hunks.flatMap((h) => h.body);
      let noNl = false;
      for (let k = flat.length - 1; k >= 0; k--) {
        if (flat[k]!.type === 'new') { noNl = flat[k + 1]?.type === 'bs'; break; }
      }
      tree.now.set(p, outLines.length === 0 ? '' : outLines.join('\n') + (noNl ? '' : '\n'));
      return;
    }
    if (isDelete) {
      const p = oldP ?? '';
      if (!safe(p)) throw new Fail('unsafe', p);
      if (tree.get(p) === null) throw new Fail('missing', p);
      tree.now.set(p, null);
      return;
    }
    if (oldP !== undefined && newP !== undefined && oldP !== newP) {
      if (!safe(oldP)) throw new Fail('unsafe', oldP);
      if (!safe(newP)) throw new Fail('unsafe', newP);
      const cur = tree.get(oldP);
      if (cur === null) throw new Fail('missing', oldP);
      if (tree.get(newP) !== null) throw new Fail('exists', newP);
      const f = parseFile(cur);
      applyHunksToFile(f, sec.hunks, strict, oldP);
      tree.now.set(newP, writeFileText(f));
      tree.now.set(oldP, null);
      tree.moves.push({ old: oldP, new: newP });
      return;
    }
    const p = (oldP ?? newP) ?? '';
    if (!safe(p)) throw new Fail('unsafe', p);
    const cur = tree.get(p);
    if (cur === null) throw new Fail('missing', p);
    const f = parseFile(cur);
    applyHunksToFile(f, sec.hunks, strict, p);
    tree.now.set(p, writeFileText(f));
  });
}

// ---- SEARCH/REPLACE blocks (SPEC.md section 7) ----

function searchReplaceEdits(lines: string[], strict: boolean): Edit[] {
  interface Block { path: string; oldLines: string[]; newLines: string[] }
  const blocks: Block[] = [];
  const n = lines.length;
  let i = 0;
  let prevReplaceEnd = -1;
  let prevPath: string | null = null;
  while (i < n) {
    if (lines[i]!.trimEnd() !== '<<<<<<< SEARCH') { i += 1; continue; }
    const s = i;
    let m = -1;
    for (let j = s + 1; j < n; j++) {
      const t = lines[j]!.trimEnd();
      if (t === '=======') { m = j; break; }
      if (t === '>>>>>>> REPLACE' || t === '<<<<<<< SEARCH') break;
    }
    if (m < 0) throw new Exit2(`error: parse ${s + 1}`);
    let r = -1;
    for (let j = m + 1; j < n; j++) {
      const t = lines[j]!.trimEnd();
      if (t === '>>>>>>> REPLACE') { r = j; break; }
      if (t === '<<<<<<< SEARCH') break;
    }
    if (r < 0) throw new Exit2(`error: parse ${s + 1}`);
    let path: string | null = null;
    for (let j = s - 1; j > prevReplaceEnd; j--) {
      const t = lines[j]!;
      if (blank(t)) continue;
      if (t.trim().startsWith('```')) continue;
      path = t.trim();
      break;
    }
    if (path === null) {
      if (prevPath === null) throw new Exit2(`error: parse ${s + 1}`);
      path = prevPath;
    }
    blocks.push({ path, oldLines: lines.slice(s + 1, m), newLines: lines.slice(m + 1, r) });
    prevPath = path;
    prevReplaceEnd = r;
    i = r + 1;
  }
  if (blocks.length === 0) throw new Exit2('error: parse 1');
  return blocks.map((b) => (tree: Tree) => {
    if (!safe(b.path)) throw new Fail('unsafe', b.path);
    if (b.oldLines.length === 0) {
      if (tree.get(b.path) !== null) throw new Fail('exists', b.path);
      tree.now.set(b.path, b.newLines.length === 0 ? '' : b.newLines.join('\n') + '\n');
      return;
    }
    const cur = tree.get(b.path);
    if (cur === null) throw new Fail('missing', b.path);
    const f = parseFile(cur);
    const found = findTier(b.oldLines, f.lines, strict, 0);
    if (!found) throw new Fail('no-match', b.path);
    if (found.pos.length > 1) throw new Fail('ambiguous', b.path);
    const at = found.pos[0]!;
    const rep = buildReplacement(f.lines, at, b.oldLines, b.newLines, b.newLines.map(() => -1), found.tier);
    f.lines.splice(at, b.oldLines.length, ...rep);
    tree.now.set(b.path, writeFileText(f));
  });
}

// ---- V4A patches (SPEC.md section 8) ----

interface VChunk {
  anchor: string | null;
  eof: boolean;
  body: BodyEntry[];
}

interface VSection {
  kind: 'add' | 'del' | 'upd';
  path: string;
  moveTo: string | null;
  lines: string[];
  chunks: VChunk[];
  lineNo: number;
}

function v4aEdits(lines: string[], strict: boolean): Edit[] {
  const first = lines.findIndex((l) => !blank(l));
  if (first < 0) throw new Exit2('error: parse 1');
  if (lines[first]!.trim() !== '*** Begin Patch') throw new Exit2(`error: parse ${first + 1}`);
  let last = -1;
  for (let k = lines.length - 1; k >= 0; k--) {
    if (!blank(lines[k]!)) { last = k; break; }
  }
  if (lines[last]!.trim() !== '*** End Patch') throw new Exit2(`error: parse ${lines.length + 1}`);
  const sectionKind = (l: string): 'add' | 'del' | 'upd' | null => {
    if (l.startsWith('*** Add File: ')) return 'add';
    if (l.startsWith('*** Delete File: ')) return 'del';
    if (l.startsWith('*** Update File: ')) return 'upd';
    return null;
  };
  const sections: VSection[] = [];
  let i = first + 1;
  while (i < last) {
    const line = lines[i]!;
    if (blank(line)) { i += 1; continue; }
    const kind = sectionKind(line);
    if (kind === null) throw new Exit2(`error: parse ${i + 1}`);
    const prefix = kind === 'add' ? '*** Add File: ' : kind === 'del' ? '*** Delete File: ' : '*** Update File: ';
    const sec: VSection = { kind, path: line.slice(prefix.length).trim(), moveTo: null, lines: [], chunks: [], lineNo: i + 1 };
    i += 1;
    if (kind === 'add') {
      while (i < last) {
        const l = lines[i]!;
        if (sectionKind(l) !== null) break;
        if (l === '') { sec.lines.push(''); i += 1; continue; }
        if (l.startsWith('+')) { sec.lines.push(l.slice(1)); i += 1; continue; }
        if (blank(l)) {
          let restBlank = true;
          for (let j = i + 1; j < last; j++) {
            if (!blank(lines[j]!) && sectionKind(lines[j]!) === null) { restBlank = false; break; }
            if (sectionKind(lines[j]!) !== null) break;
          }
          if (restBlank) break;
          throw new Exit2(`error: parse ${i + 1}`);
        }
        throw new Exit2(`error: parse ${i + 1}`);
      }
      while (sec.lines.length > 0 && sec.lines[sec.lines.length - 1] === '') sec.lines.pop();
    } else if (kind === 'del') {
      while (i < last) {
        const l = lines[i]!;
        if (blank(l) || sectionKind(l) !== null) break;
        throw new Exit2(`error: parse ${i + 1}`);
      }
    } else {
      if (i < last && lines[i]!.startsWith('*** Move to: ')) {
        sec.moveTo = lines[i]!.slice('*** Move to: '.length).trim();
        i += 1;
      }
      let cur: VChunk | null = null;
      let afterEof = false;
      while (i < last) {
        const l = lines[i]!;
        if (sectionKind(l) !== null) break;
        if (l.startsWith('@@')) {
          const anchor = l.slice(2).trim();
          cur = { anchor: anchor === '' ? null : anchor, eof: false, body: [] };
          sec.chunks.push(cur);
          afterEof = false;
          i += 1;
          continue;
        }
        if (l === '*** End of File') {
          if (cur === null) {
            cur = { anchor: null, eof: true, body: [] };
            sec.chunks.push(cur);
          } else cur.eof = true;
          afterEof = true;
          i += 1;
          continue;
        }
        if (afterEof) {
          if (blank(l)) { i += 1; continue; }
          throw new Exit2(`error: parse ${i + 1}`);
        }
        const c = l[0];
        if (c === ' ' || c === '-' || c === '+') {
          if (cur === null) {
            cur = { anchor: null, eof: false, body: [] };
            sec.chunks.push(cur);
          }
          cur.body.push({ type: c === ' ' ? 'ctx' : c === '-' ? 'old' : 'new', text: l.slice(1) });
          i += 1;
          continue;
        }
        if (l === '') {
          if (cur === null) {
            cur = { anchor: null, eof: false, body: [] };
            sec.chunks.push(cur);
          }
          cur.body.push({ type: 'ctx', text: '' });
          i += 1;
          continue;
        }
        throw new Exit2(`error: parse ${i + 1}`);
      }
      if (sec.chunks.length > 0) {
        const lc = sec.chunks[sec.chunks.length - 1]!;
        while (lc.body.length > 0) {
          const e = lc.body[lc.body.length - 1]!;
          if (e.type === 'ctx' && e.text === '') lc.body.pop();
          else break;
        }
        if (lc.body.length === 0 && lc.anchor === null && !lc.eof) sec.chunks.pop();
      }
      if (sec.chunks.length === 0 && sec.moveTo === null) throw new Exit2(`error: parse ${sec.lineNo}`);
    }
    sections.push(sec);
  }
  if (sections.length === 0) throw new Exit2('error: parse 1');
  return sections.map((sec) => (tree: Tree) => {
    if (sec.kind === 'add') {
      if (!safe(sec.path)) throw new Fail('unsafe', sec.path);
      if (tree.get(sec.path) !== null) throw new Fail('exists', sec.path);
      tree.now.set(sec.path, sec.lines.length === 0 ? '' : sec.lines.join('\n') + '\n');
      return;
    }
    if (sec.kind === 'del') {
      if (!safe(sec.path)) throw new Fail('unsafe', sec.path);
      if (tree.get(sec.path) === null) throw new Fail('missing', sec.path);
      tree.now.set(sec.path, null);
      return;
    }
    if (!safe(sec.path)) throw new Fail('unsafe', sec.path);
    if (sec.moveTo !== null && !safe(sec.moveTo)) throw new Fail('unsafe', sec.moveTo);
    const cur = tree.get(sec.path);
    if (cur === null) throw new Fail('missing', sec.path);
    if (sec.moveTo !== null && tree.get(sec.moveTo) !== null) throw new Fail('exists', sec.moveTo);
    const f = parseFile(cur);
    let cursor = 0;
    for (const ch of sec.chunks) {
      if (ch.anchor !== null) {
        const found = findTier([ch.anchor], f.lines, strict, cursor);
        if (!found) throw new Fail('no-match', sec.path);
        cursor = found.pos[0]! + 1;
      }
      const O: string[] = [];
      const N: string[] = [];
      const nToO: number[] = [];
      for (const b of ch.body) {
        if (b.type === 'ctx') { nToO.push(O.length); O.push(b.text); N.push(b.text); }
        else if (b.type === 'old') { O.push(b.text); }
        else if (b.type === 'new') { nToO.push(-1); N.push(b.text); }
      }
      if (O.length === 0) {
        const idx = ch.eof ? f.lines.length : cursor;
        f.lines.splice(idx, 0, ...N);
        cursor = idx + N.length;
      } else {
        const found = findTier(O, f.lines, strict, cursor);
        if (!found) throw new Fail('no-match', sec.path);
        let at: number | null = null;
        if (ch.eof) {
          for (const p of found.pos) {
            if (p + O.length === f.lines.length) { at = p; break; }
          }
          if (at === null) throw new Fail('no-match', sec.path);
        } else {
          at = found.pos[0]!;
        }
        const rep = buildReplacement(f.lines, at, O, N, nToO, found.tier);
        f.lines.splice(at, O.length, ...rep);
        cursor = at + rep.length;
      }
    }
    const text = writeFileText(f);
    if (sec.moveTo !== null) {
      tree.now.set(sec.moveTo, text);
      tree.now.set(sec.path, null);
      tree.moves.push({ old: sec.path, new: sec.moveTo });
    } else {
      tree.now.set(sec.path, text);
    }
  });
}

function run(args: string[]): { code: number; out: string[] } {
  let format: string | null = null;
  let check = false;
  let strict = false;
  const pos: string[] = [];
  let ended = false;
  for (const a of args) {
    if (!ended && a === '--') ended = true;
    else if (!ended && a.startsWith('-') && a !== '-') {
      if (a.startsWith('--format=') && format === null && FORMATS.includes(a.slice(9))) format = a.slice(9);
      else if (a === '--check' && !check) check = true;
      else if (a === '--strict' && !strict) strict = true;
      else return { code: 2, out: ['error: usage'] };
    } else pos.push(a);
  }
  if (pos.length > 1) return { code: 2, out: ['error: usage'] };
  const file = pos.length === 0 || pos[0] === '-' ? null : pos[0]!;
  let text = '';
  try {
    text = readFileSync(file ?? 0, 'utf8');
  } catch {
    if (file !== null) return { code: 2, out: ['error: no-patch'] };
  }
  const lines = patchLines(text);
  const kind = format === null || format === 'auto' ? detect(lines) : format;
  if (kind === null) return { code: 2, out: ['error: format'] };
  let edits: Edit[];
  try {
    edits = kind === 'json' ? jsonEdits(text, lines) : kind === 'unified' ? unifiedEdits(lines, strict) : kind === 'search-replace' ? searchReplaceEdits(lines, strict) : v4aEdits(lines, strict);
    if (edits.length === 0) throw new Exit2('error: parse 1');
  } catch (e) {
    if (e instanceof Exit2) return { code: 2, out: [e.line] };
    throw e;
  }
  const tree = new Tree();
  const fails: Fail[] = [];
  for (const edit of edits) {
    const before = new Map(tree.now);
    try {
      edit(tree);
    } catch (e) {
      if (!(e instanceof Fail)) throw e;
      tree.now.clear();
      for (const [k, v] of before) tree.now.set(k, v);
      fails.push(e);
    }
  }
  if (fails.length > 0) return { code: 1, out: [...fails.map((f) => `error: ${f.code} ${f.path}`), `failed: ${fails.length} of ${edits.length} edits`] };
  const entries: { p: string; was: string | null; now: string | null }[] = [];
  for (const p of [...tree.now.keys()].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))) {
    const was = tree.original(p);
    const now = tree.now.get(p)!;
    if (was === now) continue;
    entries.push({ p, was, now });
  }
  for (const m of tree.moves) {
    tree.original(m.old);
    tree.original(m.new);
  }
  if (!check) {
    for (const e of entries) {
      if (e.now === null) rmSync(e.p, { force: true });
      else {
        mkdirSync(dirname(e.p), { recursive: true });
        writeFileSync(e.p, e.now);
      }
    }
  }
  const rOld = new Set<string>();
  const rNew = new Map<string, string>();
  for (const m of tree.moves) {
    if (tree.original(m.old) !== null && tree.original(m.new) === null && tree.get(m.old) === null && tree.get(m.new) !== null) {
      rOld.add(m.old);
      rNew.set(m.new, m.old);
    }
  }
  const rows: { key: string; text: string }[] = [];
  for (const e of entries) {
    if (rOld.has(e.p) || rNew.has(e.p)) continue;
    rows.push({ key: e.p, text: `${e.was === null ? 'A' : e.now === null ? 'D' : 'M'} ${e.p}` });
  }
  for (const [nw, old] of rNew) rows.push({ key: nw, text: `R ${old} -> ${nw}` });
  rows.sort((a, b) => Buffer.compare(Buffer.from(a.key), Buffer.from(b.key)));
  const out = rows.map((r) => r.text);
  return { code: 0, out: [...out, `ok: ${out.length} ${out.length === 1 ? 'file' : 'files'}`] };
}


const trialEnv = process.env.MAKEFUN_ENV_URL;
if (trialEnv !== undefined && trialEnv !== '') {
  // A trial: the kit's runner reads the checks from the env and runs this file on each one, without this variable.
  const { runTrial } = await import('./runner.ts');
  await runTrial(trialEnv);
} else {
  const r = run(process.argv.slice(2));
  writeSync(1, r.out.map((l) => `${l}\n`).join(''));
  process.exitCode = r.code;
}
