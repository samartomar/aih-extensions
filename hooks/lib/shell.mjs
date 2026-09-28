// Just enough shell parsing to find the git commands inside a Bash or
// PowerShell command line, including ones nested in `bash -c`, `pwsh -Command`,
// `eval`, `$(...)`, backticks and heredocs fed to a shell. A seatbelt, not a
// sandbox: a script file or a dynamically built string still goes around it.
import path from 'node:path';

const KEYWORDS = new Set(['if', 'then', 'elif', 'else', 'do', 'while', 'until', '!', '{', '}']);
// Wrappers that run the command after them, with the options that take a value.
const WRAPPERS = {
  sudo: ['-u', '-g', '-C', '-D', '-h', '-p', '-r', '-t', '-T', '-U'], doas: ['-u', '-C'],
  env: ['-u', '-C', '-S'], nice: ['-n'], ionice: ['-c', '-n', '-p'], timeout: ['-k', '-s'],
  stdbuf: ['-i', '-o', '-e'], xargs: ['-I', '-n', '-P', '-d', '-E', '-L', '-s', '-a'],
  nohup: [], command: [], builtin: [], exec: ['-a'], time: ['-f', '-o'], '&': [], '.': [],
};
const POSITIONAL = { timeout: 1 }; // timeout 5 git ...
const SH = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);
const PS = new Set(['pwsh', 'powershell']);

const base = (w) => path.basename(String(w).replace(/\\/g, '/')).toLowerCase().replace(/\.exe$/, '');

// Remove heredoc / here-string bodies (they are data), except when the
// command reading them is a shell, in which case the body is returned as code.
function heredocs(command, powershell) {
  const lines = command.split('\n'), keep = [], code = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    keep.push(line);
    if (powershell) {
      if (/@["']\s*$/.test(line)) { while (i + 1 < lines.length && !/^["']@/.test(lines[i + 1])) i++; i++; }
      continue;
    }
    const m = /(?<!<)<<(?!<)(-?)\s*(['"]?)([A-Za-z_][\w.-]*)\2/.exec(line);
    if (!m) continue;
    // A `<<` inside a quoted string is not a heredoc.
    const before = line.slice(0, m.index);
    if ((before.split("'").length - 1) % 2 || (before.split('"').length - 1) % 2) continue;
    const body = [];
    while (i + 1 < lines.length && (m[1] ? lines[i + 1].replace(/^\t+/, '') : lines[i + 1]) !== m[3]) body.push(lines[++i]);
    i++; // the delimiter line
    const head = base(line.trim().split(/\s+/)[0] ?? '');
    if (SH.has(head) || PS.has(head)) code.push(body.join('\n'));
  }
  return { text: keep.join('\n'), code };
}

// Find the matching close paren of a `$(` / `<(` starting at `open`.
function closeParen(s, open) {
  let depth = 0, quote = null;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (quote) { if (c === quote) quote = null; else if (c === '\\' && quote === '"') i++; continue; }
    if (c === "'" || c === '"') quote = c;
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i;
  }
  return s.length;
}

// Split into segments (separated by ; && || | & newlines and parentheses),
// each a list of words with quotes removed. Command substitutions are returned
// separately so their contents get checked too. Bash rules by default: `\`
// escapes outside quotes, inside "..." only before $ ` " \ and newline;
// backslash-newline is a line continuation. PowerShell rules: `\` is literal
// and the backtick escapes (backtick-newline is a continuation).
export function segments(command, { powershell = false } = {}) {
  const { text, code } = heredocs(command.replace(/\r\n/g, '\n'), powershell);
  const segs = [], subs = [...code];
  const esc = powershell ? '`' : '\\';
  let words = [], word = '', inWord = false, quote = null;
  const endWord = () => { if (inWord) words.push(word); word = ''; inWord = false; };
  const endSegment = () => { endWord(); if (words.length) segs.push(words); words = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (c === esc && next === '\n' && quote !== "'") { i++; continue; } // line continuation
    if (quote === "'") { if (c === "'") quote = null; else word += c; continue; }
    // $( ) and <( ) run a command, also inside double quotes.
    if ((c === '$' || c === '<' || c === '>') && next === '(' && !(c !== '$' && quote)) {
      const end = closeParen(text, i + 1);
      subs.push(text.slice(i + 2, end));
      word += '$()'; inWord = true; i = end;
      continue;
    }
    if (!powershell && c === '`') { // bash backtick substitution
      let end = i + 1;
      while (end < text.length && text[end] !== '`') end += text[end] === '\\' ? 2 : 1;
      subs.push(text.slice(i + 1, end));
      word += '$()'; inWord = true; i = end;
      continue;
    }
    if (quote === '"') {
      if (c === '"') quote = null;
      else if (c === esc && (powershell || /[$`"\\]/.test(next ?? ''))) word += text[++i];
      else word += c;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; inWord = true; continue; }
    if (c === esc && i + 1 < text.length) { word += text[++i]; inWord = true; continue; }
    if (c === ';' || c === '\n' || c === '(' || c === ')' || c === '|' || c === '&') {
      if (c === '&' && !inWord && words.length === 0 && next !== '&') continue; // PowerShell call operator
      endSegment();
      if ((c === '|' || c === '&') && next === c) i++;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r') { endWord(); continue; }
    word += c; inWord = true;
  }
  endSegment();
  return { segs, subs };
}

function stripPrefix(words) {
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    if (KEYWORDS.has(w) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) { i++; continue; }
    const name = base(w);
    if (!Object.hasOwn(WRAPPERS, name)) break;
    i++;
    while (words[i]?.startsWith('-') && words[i] !== '-') i += WRAPPERS[name].includes(words[i]) ? 2 : 1;
    i += POSITIONAL[name] ?? 0;
  }
  return words.slice(i);
}

// The command string a shell or eval-like word runs, if any.
function nested(head, words) {
  if (head === 'eval') return { command: words.slice(1).join(' '), powershell: false };
  if (head === 'iex' || head === 'invoke-expression') return { command: words.slice(1).join(' '), powershell: true };
  if (SH.has(head)) {
    const k = words.findIndex((w, j) => j > 0 && /^-[A-Za-z]*c[A-Za-z]*$/.test(w));
    return k > -1 && words[k + 1] !== undefined ? { command: words[k + 1], powershell: false } : null;
  }
  if (PS.has(head)) {
    const enc = words.findIndex((w, j) => j > 0 && /^-(e|ec|enc|encodedcommand)$/i.test(w));
    if (enc > -1 && words[enc + 1]) return { command: Buffer.from(words[enc + 1], 'base64').toString('utf16le'), powershell: true };
    const k = words.findIndex((w, j) => j > 0 && /^-(c|command)$/i.test(w));
    return k > -1 ? { command: words.slice(k + 1).join(' '), powershell: true } : null;
  }
  if (head === 'cmd') {
    const k = words.findIndex((w, j) => j > 0 && /^\/[ck]$/i.test(w));
    return k > -1 ? { command: words.slice(k + 1).join(' '), powershell: false } : null;
  }
  return null;
}

// Every git invocation in the command: { sub, args, cwd: [-C dirs], config: [-c k=v] }.
export function gitCommands(command, { powershell = false } = {}, depth = 0) {
  if (depth > 4) return [];
  const { segs, subs } = segments(command, { powershell });
  const found = subs.flatMap((body) => gitCommands(body, { powershell }, depth + 1));
  for (const raw of segs) {
    const words = stripPrefix(raw);
    if (!words.length) continue;
    const head = base(words[0]);
    const inner = nested(head, words);
    if (inner) { found.push(...gitCommands(inner.command, { powershell: inner.powershell }, depth + 1)); continue; }
    if (head !== 'git') continue;
    const cwd = [], config = [];
    let i = 1;
    for (; i < words.length && words[i].startsWith('-'); i++) {
      const w = words[i];
      if (w === '-C') cwd.push(words[++i]);
      else if (w === '-c') config.push(words[++i] ?? '');
      else if (['--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env'].includes(w)) i++;
    }
    if (i < words.length) found.push({ sub: words[i], args: words.slice(i + 1), cwd, config });
  }
  return found;
}

// --long, --long=value, or a letter inside a short cluster like -fdx.
export function hasFlag(args, long, short) {
  return args.some((a) => (long && (a === long || a.startsWith(long + '='))) || (short && /^-[A-Za-z]+$/.test(a) && a.includes(short)));
}
