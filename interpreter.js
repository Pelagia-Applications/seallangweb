// ============================================================
// SEALLANG WEB INTERPRETER
// Lexer → Parser → Tree-walk Interpreter
// Supports: dive, bark, swim, pod, let, mut, if/else,
//           fish/fish_int/fish_float, string interpolation,
//           field access, pod construction, arithmetic/comparison,
//           functions with surface (return), match, tide/catch
// ============================================================

// ---- TOKEN TYPES ----

const TT = {
  // Keywords
  DIVE:'DIVE', SURFACE:'SURFACE', POD:'POD', SWIM:'SWIM',
  BARK:'BARK', TIDE:'TIDE', LET:'LET', MUT:'MUT',
  IF:'IF', ELSE:'ELSE', MATCH:'MATCH', CATCH:'CATCH', IN:'IN', SELF:'SELF',
  // Types
  TYINT:'TYINT', TYFLOAT:'TYFLOAT', TYBOOL:'TYBOOL', TYSTR:'TYSTR',
  // Literals
  INT:'INT', FLOAT:'FLOAT', TRUE:'TRUE', FALSE:'FALSE', STR:'STR',
  // Identifier
  IDENT:'IDENT',
  // Operators
  PLUS:'PLUS', MINUS:'MINUS', STAR:'STAR', SLASH:'SLASH',
  EQEQ:'EQEQ', NEQ:'NEQ', LTEQ:'LTEQ', GTEQ:'GTEQ', LT:'LT', GT:'GT',
  AND:'AND', OR:'OR', EQ:'EQ', BANG:'BANG',
  // Punctuation
  LPAREN:'LPAREN', RPAREN:'RPAREN', LBRACE:'LBRACE', RBRACE:'RBRACE',
  COMMA:'COMMA', COLON:'COLON', SEMI:'SEMI', ARROW:'ARROW',
  DOTDOT:'DOTDOT', DOT:'DOT',
  EOF:'EOF',
};

const KEYWORDS = {
  'dive':TT.DIVE, 'surface':TT.SURFACE, 'pod':TT.POD, 'swim':TT.SWIM,
  'bark':TT.BARK, 'tide':TT.TIDE, 'let':TT.LET, 'mut':TT.MUT,
  'if':TT.IF, 'else':TT.ELSE, 'match':TT.MATCH, 'catch':TT.CATCH,
  'in':TT.IN, 'self':TT.SELF,
  'int':TT.TYINT, 'float':TT.TYFLOAT, 'bool':TT.TYBOOL, 'str':TT.TYSTR,
  'true':TT.TRUE, 'false':TT.FALSE,
};

// ---- LEXER ----

function lex(src) {
  const tokens = [];
  let i = 0;
  const len = src.length;

  while (i < len) {
    // Whitespace
    if (/[ \t\r\n]/.test(src[i])) { i++; continue; }
    // Line comment: ~
    if (src[i] === '~') { while (i < len && src[i] !== '\n') i++; continue; }

    // String literal
    if (src[i] === '"') {
      let s = '';
      i++;
      while (i < len && src[i] !== '"') {
        if (src[i] === '\\') { i++; s += src[i] === 'n' ? '\n' : src[i]; }
        else s += src[i];
        i++;
      }
      i++; // closing "
      tokens.push({ type: TT.STR, value: s });
      continue;
    }

    // Number
    if (/[0-9]/.test(src[i]) || (src[i] === '-' && /[0-9]/.test(src[i+1]) && (tokens.length === 0 || ['PLUS','MINUS','STAR','SLASH','EQ','EQEQ','NEQ','LT','GT','LTEQ','GTEQ','AND','OR','COMMA','COLON','LPAREN','LBRACE','ARROW'].includes(tokens[tokens.length-1]?.type)))) {
      let num = '';
      if (src[i] === '-') { num = '-'; i++; }
      while (i < len && /[0-9]/.test(src[i])) { num += src[i]; i++; }
      if (src[i] === '.' && src[i+1] !== '.') {
        num += '.'; i++;
        while (i < len && /[0-9]/.test(src[i])) { num += src[i]; i++; }
        tokens.push({ type: TT.FLOAT, value: parseFloat(num) });
      } else {
        tokens.push({ type: TT.INT, value: parseInt(num, 10) });
      }
      continue;
    }

    // Identifier / keyword
    if (/[a-zA-Z_]/.test(src[i])) {
      let word = '';
      while (i < len && /[a-zA-Z0-9_]/.test(src[i])) { word += src[i]; i++; }
      const kw = KEYWORDS[word];
      tokens.push(kw ? { type: kw } : { type: TT.IDENT, value: word });
      continue;
    }

    // Two-char operators
    const two = src[i] + (src[i+1] || '');
    const twoMap = { '==':TT.EQEQ,'!=':TT.NEQ,'<=':TT.LTEQ,'>=':TT.GTEQ,'&&':TT.AND,'||':TT.OR,'->':TT.ARROW,'..':TT.DOTDOT };
    if (twoMap[two]) { tokens.push({ type: twoMap[two] }); i += 2; continue; }

    // Single-char
    const oneMap = { '+':TT.PLUS,'-':TT.MINUS,'*':TT.STAR,'/':TT.SLASH,'<':TT.LT,'>':TT.GT,'=':TT.EQ,'!':TT.BANG,'(':TT.LPAREN,')':TT.RPAREN,'{':TT.LBRACE,'}':TT.RBRACE,',':TT.COMMA,':':TT.COLON,';':TT.SEMI,'.':TT.DOT };
    if (oneMap[src[i]]) { tokens.push({ type: oneMap[src[i]] }); i++; continue; }

    throw new Error(`Unexpected character '${src[i]}' at position ${i}`);
  }

  tokens.push({ type: TT.EOF });
  return tokens;
}

// ---- PARSER ----

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek()    { return this.tokens[this.pos]; }
  advance() { return this.tokens[this.pos++]; }

  expect(type) {
    const t = this.peek();
    if (t.type !== type) throw new Error(`Expected ${type}, got ${t.type} ('${t.value ?? ''}')`);
    return this.advance();
  }

  check(type) { return this.peek().type === type; }

  eat(type) {
    if (this.check(type)) { this.advance(); return true; }
    return false;
  }

  // ---- Program ----

  parseProgram() {
    const pods = [], functions = [];
    while (!this.check(TT.EOF)) {
      if (this.check(TT.POD))  pods.push(this.parsePod());
      else if (this.check(TT.DIVE)) functions.push(this.parseFunction());
      else throw new Error(`Expected 'pod' or 'dive', got ${this.peek().type}`);
    }
    return { pods, functions };
  }

  // ---- Pod ----

  parsePod() {
    this.expect(TT.POD);
    const name = this.expect(TT.IDENT).value;
    this.expect(TT.LBRACE);
    const fields = [];
    while (!this.check(TT.RBRACE) && !this.check(TT.EOF)) {
      const fname = this.expect(TT.IDENT).value;
      this.expect(TT.COLON);
      const ty = this.parseType();
      fields.push({ name: fname, ty });
      this.eat(TT.COMMA);
    }
    this.expect(TT.RBRACE);
    return { kind: 'Pod', name, fields };
  }

  // ---- Function ----

  parseFunction() {
    this.expect(TT.DIVE);
    const name = this.expect(TT.IDENT).value;
    this.expect(TT.LPAREN);
    const params = this.parseParams();
    this.expect(TT.RPAREN);
    let returnType = null;
    if (this.eat(TT.ARROW)) returnType = this.parseType();
    this.expect(TT.LBRACE);
    const body = this.parseBlock();
    this.expect(TT.RBRACE);
    return { kind: 'Function', name, params, returnType, body };
  }

  parseParams() {
    const params = [];
    while (!this.check(TT.RPAREN) && !this.check(TT.EOF)) {
      const name = this.expect(TT.IDENT).value;
      this.expect(TT.COLON);
      const ty = this.parseType();
      params.push({ name, ty });
      this.eat(TT.COMMA);
    }
    return params;
  }

  parseType() {
    const t = this.advance();
    switch (t.type) {
      case TT.TYINT:   return 'int';
      case TT.TYFLOAT: return 'float';
      case TT.TYBOOL:  return 'bool';
      case TT.TYSTR:   return 'str';
      case TT.IDENT:   return t.value;
      default: throw new Error(`Expected type, got ${t.type}`);
    }
  }

  // ---- Statements ----

  parseBlock() {
    const stmts = [];
    while (!this.check(TT.RBRACE) && !this.check(TT.EOF)) {
      stmts.push(this.parseStmt());
    }
    return stmts;
  }

  parseStmt() {
    const t = this.peek();

    if (t.type === TT.LET) {
      this.advance();
      const name = this.expect(TT.IDENT).value;
      this.expect(TT.COLON);
      const ty = this.parseType();
      this.expect(TT.EQ);
      const value = this.parseExpr();
      this.eat(TT.SEMI);
      return { kind: 'Let', name, ty, value };
    }

    if (t.type === TT.MUT) {
      this.advance();
      const name = this.expect(TT.IDENT).value;
      this.expect(TT.COLON);
      const ty = this.parseType();
      this.expect(TT.EQ);
      const value = this.parseExpr();
      this.eat(TT.SEMI);
      return { kind: 'Mut', name, ty, value };
    }

    if (t.type === TT.BARK) {
      this.advance();
      this.expect(TT.LPAREN);
      const expr = this.parseExpr();
      this.expect(TT.RPAREN);
      this.eat(TT.SEMI);
      return { kind: 'Bark', expr };
    }

    if (t.type === TT.SURFACE) {
      this.advance();
      const expr = this.parseExpr();
      this.eat(TT.SEMI);
      return { kind: 'Return', expr };
    }

    if (t.type === TT.IF) {
      this.advance();
      const condition = this.parseExpr();
      this.expect(TT.LBRACE);
      const thenBody = this.parseBlock();
      this.expect(TT.RBRACE);
      let elseBody = null;
      if (this.eat(TT.ELSE)) {
        this.expect(TT.LBRACE);
        elseBody = this.parseBlock();
        this.expect(TT.RBRACE);
      }
      return { kind: 'If', condition, thenBody, elseBody };
    }

    if (t.type === TT.SWIM) {
      this.advance();
      const varName = this.expect(TT.IDENT).value;
      this.expect(TT.IN);
      const from = this.parseExpr();
      this.expect(TT.DOTDOT);
      const to = this.parseExpr();
      this.expect(TT.LBRACE);
      const body = this.parseBlock();
      this.expect(TT.RBRACE);
      return { kind: 'Swim', var: varName, from, to, body };
    }

    if (t.type === TT.MATCH) {
      return this.parseMatch();
    }

    // Assignment or expression statement
    if (t.type === TT.IDENT) {
      // Peek ahead to detect assignment or field assignment
      const savedPos = this.pos;
      const name = this.advance().value;

      // field assignment: name.field = expr
      if (this.check(TT.DOT)) {
        this.advance();
        const field = this.expect(TT.IDENT).value;
        if (this.check(TT.EQ)) {
          this.advance();
          const value = this.parseExpr();
          this.eat(TT.SEMI);
          return { kind: 'AssignField', object: name, field, value };
        }
        // not an assignment; backtrack
        this.pos = savedPos;
      } else if (this.check(TT.EQ)) {
        this.advance();
        const value = this.parseExpr();
        this.eat(TT.SEMI);
        return { kind: 'Assign', name, value };
      } else {
        this.pos = savedPos;
      }
    }

    // Fallthrough: expression statement
    const expr = this.parseExpr();
    this.eat(TT.SEMI);
    return { kind: 'ExprStmt', expr };
  }

  parseMatch() {
    this.expect(TT.MATCH);
    const subject = this.parseExpr();
    this.expect(TT.LBRACE);
    const arms = [];
    while (!this.check(TT.RBRACE) && !this.check(TT.EOF)) {
      const pattern = this.parseExpr();
      this.expect(TT.ARROW);
      this.expect(TT.LBRACE);
      const body = this.parseBlock();
      this.expect(TT.RBRACE);
      this.eat(TT.COMMA);
      arms.push({ pattern, body });
    }
    this.expect(TT.RBRACE);
    return { kind: 'Match', subject, arms };
  }

  // ---- Expressions ----

  parseExpr() { return this.parseOr(); }

  parseOr() {
    let left = this.parseAnd();
    while (this.check(TT.OR)) {
      this.advance();
      left = { kind: 'BinOp', op: '||', left, right: this.parseAnd() };
    }
    return left;
  }

  parseAnd() {
    let left = this.parseEquality();
    while (this.check(TT.AND)) {
      this.advance();
      left = { kind: 'BinOp', op: '&&', left, right: this.parseEquality() };
    }
    return left;
  }

  parseEquality() {
    let left = this.parseComparison();
    while (this.check(TT.EQEQ) || this.check(TT.NEQ)) {
      const op = this.advance().type === TT.EQEQ ? '==' : '!=';
      left = { kind: 'BinOp', op, left, right: this.parseComparison() };
    }
    return left;
  }

  parseComparison() {
    let left = this.parseAddSub();
    while ([TT.LT, TT.GT, TT.LTEQ, TT.GTEQ].includes(this.peek().type)) {
      const map = { [TT.LT]:'<', [TT.GT]:'>', [TT.LTEQ]:'<=', [TT.GTEQ]:'>=' };
      const op = map[this.advance().type];
      left = { kind: 'BinOp', op, left, right: this.parseAddSub() };
    }
    return left;
  }

  parseAddSub() {
    let left = this.parseMulDiv();
    while (this.check(TT.PLUS) || this.check(TT.MINUS)) {
      const op = this.advance().type === TT.PLUS ? '+' : '-';
      left = { kind: 'BinOp', op, left, right: this.parseMulDiv() };
    }
    return left;
  }

  parseMulDiv() {
    let left = this.parseUnary();
    while (this.check(TT.STAR) || this.check(TT.SLASH)) {
      const op = this.advance().type === TT.STAR ? '*' : '/';
      left = { kind: 'BinOp', op, left, right: this.parseUnary() };
    }
    return left;
  }

  parseUnary() {
    if (this.check(TT.BANG)) {
      this.advance();
      return { kind: 'Unary', op: '!', expr: this.parseUnary() };
    }
    if (this.check(TT.MINUS)) {
      this.advance();
      return { kind: 'Unary', op: '-', expr: this.parseUnary() };
    }
    return this.parsePostfix();
  }

  parsePostfix() {
    let expr = this.parsePrimary();
    while (this.check(TT.DOT)) {
      this.advance();
      const field = this.expect(TT.IDENT).value;
      expr = { kind: 'FieldAccess', object: expr, field };
    }
    return expr;
  }

  parsePrimary() {
    const t = this.peek();

    if (t.type === TT.INT)   { this.advance(); return { kind: 'Int',   value: t.value }; }
    if (t.type === TT.FLOAT) { this.advance(); return { kind: 'Float', value: t.value }; }
    if (t.type === TT.TRUE)  { this.advance(); return { kind: 'Bool',  value: true }; }
    if (t.type === TT.FALSE) { this.advance(); return { kind: 'Bool',  value: false }; }
    if (t.type === TT.STR)   { this.advance(); return { kind: 'Str',   value: t.value }; }

    if (t.type === TT.LPAREN) {
      this.advance();
      const expr = this.parseExpr();
      this.expect(TT.RPAREN);
      return expr;
    }

    if (t.type === TT.IDENT) {
      this.advance();
      const name = t.value;

      // Function call
      if (this.check(TT.LPAREN)) {
        this.advance();
        const args = [];
        while (!this.check(TT.RPAREN) && !this.check(TT.EOF)) {
          args.push(this.parseExpr());
          this.eat(TT.COMMA);
        }
        this.expect(TT.RPAREN);
        return { kind: 'Call', name, args };
      }

      // Pod initialiser: Name { field: val, ... }
      if (this.check(TT.LBRACE)) {
        this.advance();
        const fields = [];
        while (!this.check(TT.RBRACE) && !this.check(TT.EOF)) {
          const fname = this.expect(TT.IDENT).value;
          this.expect(TT.COLON);
          const val = this.parseExpr();
          fields.push([fname, val]);
          this.eat(TT.COMMA);
        }
        this.expect(TT.RBRACE);
        return { kind: 'PodInit', name, fields };
      }

      return { kind: 'Var', name };
    }

    throw new Error(`Unexpected token: ${t.type} ('${t.value ?? ''}')`);
  }
}

// ---- INTERPRETER ----

class ReturnSignal { constructor(value) { this.value = value; } }

class Interpreter {
  constructor(program, outputFn, inputFn) {
    this.pods    = {};        // pod definitions { name: [fieldNames] }
    this.funcs   = {};        // function definitions
    this.output  = outputFn;  // (string, class) => void
    this.input   = inputFn;   // async (prompt) => string
    this.globals = {};

    for (const pod of program.pods) {
      this.pods[pod.name] = pod.fields.map(f => f.name);
    }
    for (const fn of program.functions) {
      this.funcs[fn.name] = fn;
    }
  }

  async run() {
    if (!this.funcs['main']) throw new Error("No 'main' function found");
    await this.callFunction(this.funcs['main'], [], {});
  }

  async callFunction(fn, argValues, outerEnv) {
    const env = Object.create(outerEnv);
    fn.params.forEach((p, i) => { env[p.name] = argValues[i]; });
    try {
      await this.execBlock(fn.body, env);
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      throw e;
    }
    return null;
  }

  async execBlock(stmts, env) {
    for (const stmt of stmts) {
      await this.execStmt(stmt, env);
    }
  }

  async execStmt(stmt, env) {
    switch (stmt.kind) {
      case 'Let':
      case 'Mut': {
        env[stmt.name] = await this.evalExpr(stmt.value, env);
        break;
      }
      case 'Assign': {
        if (!(stmt.name in env)) throw new Error(`Undefined variable '${stmt.name}'`);
        env[stmt.name] = await this.evalExpr(stmt.value, env);
        break;
      }
      case 'AssignField': {
        const obj = env[stmt.object];
        if (obj == null || typeof obj !== 'object') throw new Error(`'${stmt.object}' is not a pod`);
        obj[stmt.field] = await this.evalExpr(stmt.value, env);
        break;
      }
      case 'Bark': {
        const val = await this.evalExpr(stmt.expr, env);
        this.output(this.display(val), 'value');
        break;
      }
      case 'Return': {
        const val = await this.evalExpr(stmt.expr, env);
        throw new ReturnSignal(val);
      }
      case 'If': {
        const cond = await this.evalExpr(stmt.condition, env);
        if (cond) {
          const child = Object.create(env);
          await this.execBlock(stmt.thenBody, child);
        } else if (stmt.elseBody) {
          const child = Object.create(env);
          await this.execBlock(stmt.elseBody, child);
        }
        break;
      }
      case 'Swim': {
        const from = await this.evalExpr(stmt.from, env);
        const to   = await this.evalExpr(stmt.to,   env);
        for (let i = from; i < to; i++) {
          const child = Object.create(env);
          child[stmt.var] = i;
          await this.execBlock(stmt.body, child);
        }
        break;
      }
      case 'Match': {
        const subject = await this.evalExpr(stmt.subject, env);
        for (const arm of stmt.arms) {
          const pattern = await this.evalExpr(arm.pattern, env);
          if (subject === pattern) {
            const child = Object.create(env);
            await this.execBlock(arm.body, child);
            break;
          }
        }
        break;
      }
      case 'ExprStmt': {
        await this.evalExpr(stmt.expr, env);
        break;
      }
      default:
        throw new Error(`Unknown statement kind: ${stmt.kind}`);
    }
  }

  async evalExpr(expr, env) {
    switch (expr.kind) {
      case 'Int':   return expr.value;
      case 'Float': return expr.value;
      case 'Bool':  return expr.value;
      case 'Str':   return this.interpolate(expr.value, env);

      case 'Var': {
        if (expr.name in env) return env[expr.name];
        throw new Error(`Undefined variable '${expr.name}'`);
      }

      case 'FieldAccess': {
        const obj = await this.evalExpr(expr.object, env);
        if (obj == null || typeof obj !== 'object') throw new Error(`Cannot access field '${expr.field}' on a non-pod value`);
        if (!(expr.field in obj)) throw new Error(`Pod has no field '${expr.field}'`);
        return obj[expr.field];
      }

      case 'PodInit': {
        if (!this.pods[expr.name]) throw new Error(`Unknown pod type '${expr.name}'`);
        const instance = { __pod__: expr.name };
        for (const [fname, fexpr] of expr.fields) {
          instance[fname] = await this.evalExpr(fexpr, env);
        }
        return instance;
      }

      case 'BinOp': {
        const l = await this.evalExpr(expr.left,  env);
        const r = await this.evalExpr(expr.right, env);
        switch (expr.op) {
          case '+':  return (typeof l === 'string' || typeof r === 'string') ? String(l) + String(r) : l + r;
          case '-':  return l - r;
          case '*':  return l * r;
          case '/':  if (r === 0) throw new Error('Division by zero'); return l / r;
          case '==': return l === r;
          case '!=': return l !== r;
          case '<':  return l < r;
          case '>':  return l > r;
          case '<=': return l <= r;
          case '>=': return l >= r;
          case '&&': return l && r;
          case '||': return l || r;
          default: throw new Error(`Unknown operator: ${expr.op}`);
        }
      }

      case 'Unary': {
        const val = await this.evalExpr(expr.expr, env);
        if (expr.op === '!') return !val;
        if (expr.op === '-') return -val;
        throw new Error(`Unknown unary op: ${expr.op}`);
      }

      case 'Call': {
        return await this.callBuiltinOrUser(expr.name, expr.args, env);
      }

      default:
        throw new Error(`Unknown expression kind: ${expr.kind}`);
    }
  }

  async callBuiltinOrUser(name, argExprs, env) {
    // Builtins
    if (name === 'bark') {
      const val = await this.evalExpr(argExprs[0], env);
      this.output(this.display(val), 'value');
      return null;
    }
    if (name === 'fish') {
      const prompt = argExprs.length ? this.display(await this.evalExpr(argExprs[0], env)) : '';
      return await this.input(prompt, 'str');
    }
    if (name === 'fish_int') {
      const prompt = argExprs.length ? this.display(await this.evalExpr(argExprs[0], env)) : '';
      const raw = await this.input(prompt, 'int');
      const n = parseInt(raw, 10);
      if (isNaN(n)) throw new Error(`fish_int: '${raw}' is not an integer`);
      return n;
    }
    if (name === 'fish_float') {
      const prompt = argExprs.length ? this.display(await this.evalExpr(argExprs[0], env)) : '';
      const raw = await this.input(prompt, 'float');
      const n = parseFloat(raw);
      if (isNaN(n)) throw new Error(`fish_float: '${raw}' is not a number`);
      return n;
    }
    if (name === 'int') {
      const v = await this.evalExpr(argExprs[0], env);
      return parseInt(v, 10);
    }
    if (name === 'float') {
      const v = await this.evalExpr(argExprs[0], env);
      return parseFloat(v);
    }
    if (name === 'str') {
      const v = await this.evalExpr(argExprs[0], env);
      return String(v);
    }
    if (name === 'bool') {
      const v = await this.evalExpr(argExprs[0], env);
      return Boolean(v);
    }

    // User-defined function
    const fn = this.funcs[name];
    if (!fn) throw new Error(`Undefined function '${name}'`);
    const argValues = [];
    for (const a of argExprs) argValues.push(await this.evalExpr(a, env));
    return await this.callFunction(fn, argValues, {});
  }

  // String interpolation: {varName} inside strings
  interpolate(str, env) {
    return str.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, name) => {
      if (name in env) return this.display(env[name]);
      return `{${name}}`;
    });
  }

  display(val) {
    if (val === null || val === undefined) return 'void';
    if (typeof val === 'object' && val.__pod__) {
      const fields = Object.entries(val)
        .filter(([k]) => k !== '__pod__')
        .map(([k, v]) => `${k}: ${this.display(v)}`)
        .join(', ');
      return `${val.__pod__} { ${fields} }`;
    }
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    return String(val);
  }
}

// ---- EXAMPLES ----

const EXAMPLES = {
  hello: `~ Hello World in SealLang 🦭\n\ndive main() {\n    bark("a seal has entered the chat")\n\n    let x: int = 10\n    let y: int = 20\n\n    if x < y {\n        bark("x is smaller")\n    } else {\n        bark("y is smaller")\n    }\n\n    swim i in 0..5 {\n        bark(i)\n    }\n}`,

  loop: `~ Loops and arithmetic\n\ndive main() {\n    let sum: int = 0\n    swim i in 1..11 {\n        sum = sum + i\n    }\n    bark("Sum 1..10 =")\n    bark(sum)\n\n    swim n in 0..8 {\n        bark(n * n)\n    }\n}`,

  pods: `~ Pods are like structs\n\npod Seal {\n    age: int,\n    weight: float\n}\n\ndive main() {\n    let s: Seal = Seal { age: 3, weight: 120.5 }\n    bark(s.age)\n    bark(s.weight)\n\n    mut t: Seal = Seal { age: 1, weight: 80.0 }\n    t.age = 2\n    bark(t.age)\n}`,

  funcs: `~ Functions with surface (return)\n\ndive add(a: int, b: int) -> int {\n    surface a + b\n}\n\ndive greet(name: str) {\n    bark("Hello, {name}!")\n}\n\ndive main() {\n    let result: int = add(7, 13)\n    bark(result)\n    greet("Wally")\n}`,

  interp: `~ String interpolation with {}\n\ndive main() {\n    let name: str = "Wally"\n    let age: int = 5\n    let weight: float = 150.3\n    bark("Hello, {name}!")\n    bark("Age: {age}")\n    bark("Weight: {weight} kg")\n    bark("{name} is {age} years old.")\n}`,

  fish: `~ User input with fish()\n\ndive main() {\n    let name: str = fish("What is your name? ")\n    bark("Hello, {name}!")\n\n    let age: int = fish_int("How old are you? ")\n    bark("You are {age} years old.")\n\n    let score: float = fish_float("Enter a score: ")\n    bark("Score: {score}")\n}`,
};

// ---- UI GLUE ----

const editor    = document.getElementById('editor');
const outputEl  = document.getElementById('output');
const runBtn    = document.getElementById('runBtn');
const clearBtn  = document.getElementById('clearBtn');
const picker    = document.getElementById('examplePicker');
const inputRow  = document.getElementById('inputRow');
const inputEl   = document.getElementById('userInput');
const submitBtn = document.getElementById('submitInput');
const statusMsg = document.getElementById('statusMsg');
const statusDot = document.getElementById('statusDot');

function addLine(text, cls = 'value') {
  const div = document.createElement('div');
  div.className = 'out-line ' + cls;
  div.textContent = text;
  outputEl.appendChild(div);
  outputEl.scrollTop = outputEl.scrollHeight;
}

function setStatus(msg, state = 'ok') {
  // state: 'ok' | 'error' | 'running'
  statusMsg.textContent = msg;
  statusDot.className = 'status-dot' + (state === 'ok' ? '' : ' ' + state);
}

function clearOutput() {
  outputEl.innerHTML = '';
}

// ---- Async input for fish() ----
let inputResolver = null;

function requestInput(prompt) {
  return new Promise(resolve => {
    inputResolver = resolve;
    document.getElementById('inputPromptLabel').textContent = prompt || '›';
    inputRow.classList.add('visible');
    inputEl.value = '';
    inputEl.focus();
    addLine(prompt, 'prompt-line');
  });
}

function submitInput() {
  if (!inputResolver) return;
  const val = inputEl.value;
  inputRow.classList.remove('visible');
  addLine(val, 'info');
  const resolve = inputResolver;
  inputResolver = null;
  resolve(val);
}

submitBtn.addEventListener('click', submitInput);
inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') submitInput(); });

// ---- Run ----
async function runCode() {
  clearOutput();
  setStatus('Running…', 'running');
  runBtn.disabled = true;

  const src = editor.value;
  try {
    const tokens = lex(src);
    const parser = new Parser(tokens);
    const program = parser.parseProgram();

    const interp = new Interpreter(
      program,
      (text, cls) => addLine(text, cls),
      (prompt) => requestInput(prompt),
    );

    await interp.run();
    addLine('Program finished successfully.', 'success');
    setStatus('Success', 'ok');
  } catch (e) {
    addLine('Error: ' + e.message, 'error');
    setStatus('Error', 'error');
  }

  runBtn.disabled = false;
}

runBtn.addEventListener('click', runCode);
clearBtn.addEventListener('click', () => { clearOutput(); setStatus('Ready', 'ok'); });

editor.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runCode(); }
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = editor.selectionStart, end = editor.selectionEnd;
    editor.value = editor.value.slice(0, s) + '    ' + editor.value.slice(end);
    editor.selectionStart = editor.selectionEnd = s + 4;
  }
});

picker.addEventListener('change', () => {
  const key = picker.value;
  if (key && EXAMPLES[key]) {
    editor.value = EXAMPLES[key];
    clearOutput();
    setStatus('Ready', 'ok');
  }
  picker.value = '';
});

// ---- Drag-to-resize handle ----
const resizeHandle = document.getElementById('resizeHandle');
const paneEditor   = document.getElementById('paneEditor');
const workspace    = document.getElementById('workspace');

if (resizeHandle && paneEditor && workspace) {
  let dragging = false;
  let startY, startH;

  resizeHandle.addEventListener('mousedown', e => {
    dragging = true;
    startY = e.clientY;
    startH = paneEditor.getBoundingClientRect().height;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const delta = e.clientY - startY;
    const wsH   = workspace.getBoundingClientRect().height;
    const newH  = Math.min(Math.max(startH + delta, 80), wsH - 80);
    paneEditor.style.flex = 'none';
    paneEditor.style.height = newH + 'px';
  });

  document.addEventListener('mouseup', () => {
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}