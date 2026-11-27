// The formula language used by content data (src/data/schema.ts → Formula).
// Numbers, LVL, KEY, STR, DEX, INT, WIL, var.<name>, + - * ( ), min/max/floor/half,
// and dice: "1d6", "d20", "d66", "2d4+DEX", and stat-count dice "WIL d20" — per Core
// Rules p.7 (PDF 4): "If a stat is listed before a die roll, roll a number of dice equal
// to the stat. For example, 'WIL d8' means that if your WIL is 2, you roll 2d8."
// Parsed by hand (no eval).

export type Node =
  | { k: "num"; v: number }
  | { k: "ref"; name: string }
  | { k: "dice"; count: Node; sides: number; tens: boolean }
  | { k: "bin"; op: "+" | "-" | "*"; a: Node; b: Node }
  | { k: "neg"; a: Node }
  | { k: "fn"; name: "min" | "max" | "floor" | "half"; args: Node[] };

export type Scope = Record<string, number>;

const REFS = new Set(["LVL", "KEY", "STR", "DEX", "INT", "WIL"]);
const FNS = new Set(["min", "max", "floor", "half"]);

type Tok = { t: "num"; v: number } | { t: "id"; v: string } | { t: "dice"; sides: number; tens: boolean } | { t: "op"; v: string };

function tokenize(src: string): Tok[] {
  const s = src.replace(/×/g, "*").replace(/[−–]/g, "-");
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s.charAt(i);
    if (c === " ") {
      i++;
      continue;
    }
    // Dice: "d6", "d66", "d100" (count, if any, comes from the previous number/id).
    const dice = /^d(\d+)/.exec(s.slice(i));
    if (dice?.[1]) {
      const sides = Number(dice[1]);
      const tens = sides === 44 || sides === 66 || sides === 88;
      out.push({ t: "dice", sides: tens ? Number(String(sides).charAt(0)) : sides, tens });
      i += dice[0].length;
      continue;
    }
    const num = /^\d+(\.\d+)?/.exec(s.slice(i));
    if (num) {
      out.push({ t: "num", v: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const id = /^(var\.[a-zA-Z]+|[A-Za-z]+)/.exec(s.slice(i));
    if (id) {
      out.push({ t: "id", v: id[0] });
      i += id[0].length;
      continue;
    }
    if ("+-*(),".includes(c)) {
      out.push({ t: "op", v: c });
      i++;
      continue;
    }
    throw new Error(`Unexpected "${c}" in formula "${src}"`);
  }
  return out;
}

/** Parses a formula. Throws with a readable message on bad input. */
export function parseFormula(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => {
    const t = peek();
    return t?.t === "op" && t.v === v;
  };
  const expect = (v: string) => {
    if (!isOp(v)) throw new Error(`Expected "${v}" in formula "${src}"`);
    p++;
  };

  function expr(): Node {
    let left = term();
    while (isOp("+") || isOp("-")) {
      const op = (toks[p++] as { v: "+" | "-" }).v;
      left = { k: "bin", op, a: left, b: term() };
    }
    return left;
  }
  function term(): Node {
    let left = unary();
    while (isOp("*")) {
      p++;
      left = { k: "bin", op: "*", a: left, b: unary() };
    }
    return left;
  }
  function unary(): Node {
    if (isOp("-")) {
      p++;
      return { k: "neg", a: unary() };
    }
    return postfix();
  }
  // A primary optionally followed by a dice token: "2d6", "WIL d20", "(LVL)d4".
  function postfix(): Node {
    const t = peek();
    if (t?.t === "dice") {
      p++;
      return { k: "dice", count: { k: "num", v: 1 }, sides: t.sides, tens: t.tens };
    }
    const base = primary();
    const next = peek();
    if (next?.t === "dice") {
      p++;
      return { k: "dice", count: base, sides: next.sides, tens: next.tens };
    }
    return base;
  }
  function primary(): Node {
    const t = peek();
    if (!t) throw new Error(`Unexpected end of formula "${src}"`);
    if (t.t === "num") {
      p++;
      return { k: "num", v: t.v };
    }
    if (t.t === "op" && t.v === "(") {
      p++;
      const e = expr();
      expect(")");
      return e;
    }
    if (t.t === "id") {
      p++;
      if (FNS.has(t.v)) {
        expect("(");
        const args = [expr()];
        while (isOp(",")) {
          p++;
          args.push(expr());
        }
        expect(")");
        return { k: "fn", name: t.v as "min" | "max" | "floor" | "half", args };
      }
      if (REFS.has(t.v) || t.v.startsWith("var.")) return { k: "ref", name: t.v };
      throw new Error(`Unknown name "${t.v}" in formula "${src}"`);
    }
    throw new Error(`Unexpected token in formula "${src}"`);
  }

  const node = expr();
  if (p !== toks.length) throw new Error(`Unexpected extra input in formula "${src}"`);
  return node;
}

function lookup(scope: Scope, name: string): number {
  const v = scope[name];
  if (v === undefined) throw new Error(`Formula needs a value for ${name}`);
  return v;
}

/** Evaluates a formula with no dice to a number. */
export function evalNumber(src: string | Node, scope: Scope): number {
  const node = typeof src === "string" ? parseFormula(src) : src;
  const ev = (n: Node): number => {
    switch (n.k) {
      case "num":
        return n.v;
      case "ref":
        return lookup(scope, n.name);
      case "neg":
        return -ev(n.a);
      case "bin":
        return n.op === "+" ? ev(n.a) + ev(n.b) : n.op === "-" ? ev(n.a) - ev(n.b) : ev(n.a) * ev(n.b);
      case "fn": {
        const args = n.args.map(ev);
        if (n.name === "min") return Math.min(...args);
        if (n.name === "max") return Math.max(...args);
        if (n.name === "floor") return Math.floor(args[0] ?? 0);
        return Math.floor((args[0] ?? 0) / 2);
      }
      case "dice":
        throw new Error("This formula contains dice; use toDice()");
    }
  };
  return ev(node);
}

export interface DiceGroup {
  count: number;
  sides: number;
  /** d44/d66/d88: two dice read as tens and ones (no Primary Die). */
  tens: boolean;
}

/** A rollable expression: dice groups (left to right) plus a flat modifier. */
export interface DiceSpec {
  groups: DiceGroup[];
  flat: number;
}

/**
 * Turns a formula into dice + flat bonus. Dice must be added at the top level
 * ("1d8+STR", "2d4+DEX-1"); multiplying or subtracting dice is not supported.
 */
export function toDice(src: string | Node, scope: Scope): DiceSpec {
  const node = typeof src === "string" ? parseFormula(src) : src;
  const spec: DiceSpec = { groups: [], flat: 0 };
  const walk = (n: Node, sign: 1 | -1) => {
    if (n.k === "bin" && n.op === "+") {
      walk(n.a, sign);
      walk(n.b, sign);
    } else if (n.k === "bin" && n.op === "-") {
      walk(n.a, sign);
      walk(n.b, sign === 1 ? -1 : 1);
    } else if (n.k === "dice") {
      if (sign === -1) throw new Error("Subtracting dice isn't supported");
      const count = evalNumber(n.count, scope);
      if (count > 0) spec.groups.push({ count, sides: n.sides, tens: n.tens });
    } else {
      if (containsDice(n)) throw new Error("Dice can only be added at the top level of a formula");
      spec.flat += sign * evalNumber(n, scope);
    }
  };
  walk(node, 1);
  return spec;
}

export function containsDice(n: Node): boolean {
  switch (n.k) {
    case "dice":
      return true;
    case "bin":
      return containsDice(n.a) || containsDice(n.b);
    case "neg":
      return containsDice(n.a);
    case "fn":
      return n.args.some(containsDice);
    default:
      return false;
  }
}

/** Names a formula refers to (to validate content against the allowed names). */
export function references(src: string): string[] {
  const out = new Set<string>();
  const walk = (n: Node) => {
    if (n.k === "ref") out.add(n.name);
    else if (n.k === "bin") {
      walk(n.a);
      walk(n.b);
    } else if (n.k === "neg") walk(n.a);
    else if (n.k === "fn") n.args.forEach(walk);
    else if (n.k === "dice") walk(n.count);
  };
  walk(parseFormula(src));
  return [...out];
}

/** "1d8+2", for display. */
export function diceText(spec: DiceSpec): string {
  const dice = spec.groups.map((g) => (g.tens ? `d${g.sides}${g.sides}` : `${g.count}d${g.sides}`));
  const flat = spec.flat === 0 ? "" : spec.flat > 0 ? `+${spec.flat}` : `${spec.flat}`;
  return (dice.join("+") || "0") + (dice.length ? flat : flat.replace(/^\+/, ""));
}
