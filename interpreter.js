// ============================================================
// SEALLANG WEB INTERPRETER
// Lexer → Parser → Tree-walk Interpreter
// ============================================================

// ---- TOKEN TYPES ----

const TT = {
  DIVE:'DIVE', SURFACE:'SURFACE', POD:'POD', SWIM:'SWIM',
  TIDE:'TIDE', LET:'LET', MUT:'MUT',
  IF:'IF', ELSE:'ELSE', MATCH:'MATCH', CATCH:'CATCH', IN:'IN', SELF:'SELF',
  TYINT:'TYINT', TYFLOAT:'TYFLOAT', TYBOOL:'TYBOOL', TYSTR:'TYSTR',
  INT:'INT', FLOAT:'FLOAT', TRUE:'TRUE', FALSE:'FALSE', STR:'STR',
  IDENT:'IDENT',
  PLUS:'PLUS', MINUS:'MINUS', STAR:'STAR', SLASH:'SLASH',
  EQEQ:'EQEQ', NEQ:'NEQ', LTEQ:'LTEQ', GTEQ:'GTEQ', LT:'LT', GT:'GT',
  AND:'AND', OR:'OR', EQ:'EQ', BANG:'BANG',
  LPAREN:'LPAREN', RPAREN:'RPAREN', LBRACE:'LBRACE', RBRACE:'RBRACE',
  COMMA:'COMMA', COLON:'COLON', SEMI:'SEMI', ARROW:'ARROW',
  DOTDOT:'DOTDOT', DOT:'DOT',
  EOF:'EOF',
};

// FIX 1: 'bark' is NOT a keyword token — it is a regular identifier.
// Making bark a keyword caused parsePrimary() to never match it as a
// callable IDENT, producing "Expected IDENT, got BARK" on any bark() call
// that landed in expression position (e.g. inside loops, if bodies, etc.).
// bark/fish/fish_int/fish_float are all handled as built-in functions at
// the interpreter level, so they don't need to be keywords.
const KEYWORDS = {
  dive:TT.DIVE, surface:TT.SURFACE, pod:TT.POD, swim:TT.SWIM,
  tide:TT.TIDE, let:TT.LET, mut:TT.MUT,
  if:TT.IF, else:TT.ELSE, match:TT.MATCH, catch:TT.CATCH,
  in:TT.IN, self:TT.SELF,
  int:TT.TYINT, float:TT.TYFLOAT, bool:TT.TYBOOL, str:TT.TYSTR,
  true:TT.TRUE, false:TT.FALSE,
};

// ---- LEXER ----

function lex(src) {
  const tokens = [];
  let i = 0;
  const len = src.length;

  while (i < len) {
    if (/[ \t\r\n]/.test(src[i])) { i++; continue; }
    if (src[i] === '~') { while (i < len && src[i] !== '\n') i++; continue; }

    if (src[i] === '"') {
      let s = '';
      i++;
      while (i < len && src[i] !== '"') {
        if (src[i] === '\\') { i++; s += src[i] === 'n' ? '\n' : src[i]; }
        else s += src[i];
        i++;
      }
      i++;
      tokens.push({ type: TT.STR, value: s });
      continue;
    }

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

    if (/[a-zA-Z_]/.test(src[i])) {
      let word = '';
      while (i < len && /[a-zA-Z0-9_]/.test(src[i])) { word += src[i]; i++; }
      const kw = KEYWORDS[word];
      tokens.push(kw ? { type: kw } : { type: TT.IDENT, value: word });
      continue;
    }

    const two = src[i] + (src[i+1] || '');
    const twoMap = { '==':TT.EQEQ,'!=':TT.NEQ,'<=':TT.LTEQ,'>=':TT.GTEQ,'&&':TT.AND,'||':TT.OR,'->':TT.ARROW,'..':TT.DOTDOT };
    if (twoMap[two]) { tokens.push({ type: twoMap[two] }); i += 2; continue; }

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
    // Populated during parseProgram so parsePrimary can distinguish pod inits
    this.knownPods = new Set();
  }

  peek()    { return this.tokens[this.pos]; }
  advance() { return this.tokens[this.pos++]; }
  check(type) { return this.peek().type === type; }
  eat(type) { if (this.check(type)) { this.advance(); return true; } return false; }

  expect(type) {
    const t = this.peek();
    if (t.type !== type) throw new Error(`Expected ${type}, got ${t.type} ('${t.value ?? ''}')`);
    return this.advance();
  }

  parseProgram() {
    const pods = [], functions = [];
    // First pass: collect all pod names so parsePrimary can recognise pod inits
    const savedPos = this.pos;
    while (!this.check(TT.EOF)) {
      if (this.check(TT.POD)) {
        this.advance(); // consume 'pod'
        if (this.check(TT.IDENT)) this.knownPods.add(this.peek().value);
      }
      this.advance();
    }
    this.pos = savedPos;
    // Second pass: actually parse
    while (!this.check(TT.EOF)) {
      if (this.check(TT.POD))  pods.push(this.parsePod());
      else if (this.check(TT.DIVE)) functions.push(this.parseFunction());
      else throw new Error(`Expected 'pod' or 'dive', got ${this.peek().type}`);
    }
    return { pods, functions };
  }

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

  parseBlock() {
    const stmts = [];
    while (!this.check(TT.RBRACE) && !this.check(TT.EOF)) stmts.push(this.parseStmt());
    return stmts;
  }

  parseStmt() {
    const t = this.peek();

    if (t.type === TT.LET || t.type === TT.MUT) {
      const isMut = t.type === TT.MUT;
      this.advance();
      const name = this.expect(TT.IDENT).value;
      this.expect(TT.COLON);
      const ty = this.parseType();
      this.expect(TT.EQ);
      const value = this.parseExpr();
      this.eat(TT.SEMI);
      return { kind: isMut ? 'Mut' : 'Let', name, ty, value };
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

    if (t.type === TT.MATCH) return this.parseMatch();

    // FIX 2: assignment detection — check for IDENT followed by = or .field =
    if (t.type === TT.IDENT) {
      const savedPos = this.pos;
      const name = this.advance().value;

      if (this.check(TT.DOT)) {
        this.advance();
        const field = this.expect(TT.IDENT).value;
        if (this.check(TT.EQ)) {
          this.advance();
          const value = this.parseExpr();
          this.eat(TT.SEMI);
          return { kind: 'AssignField', object: name, field, value };
        }
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

    // Fallthrough to expression statement (covers bark(...), function calls, etc.)
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

  parseExpr()       { return this.parseOr(); }
  parseOr()         { let l = this.parseAnd();        while (this.check(TT.OR))   { this.advance(); l = { kind:'BinOp', op:'||', left:l, right:this.parseAnd() }; }        return l; }
  parseAnd()        { let l = this.parseEquality();   while (this.check(TT.AND))  { this.advance(); l = { kind:'BinOp', op:'&&', left:l, right:this.parseEquality() }; }   return l; }
  parseEquality()   { let l = this.parseComparison(); while (this.check(TT.EQEQ)||this.check(TT.NEQ)) { const op=this.advance().type===TT.EQEQ?'==':'!='; l={kind:'BinOp',op,left:l,right:this.parseComparison()}; } return l; }
  parseComparison() { let l = this.parseAddSub();     while ([TT.LT,TT.GT,TT.LTEQ,TT.GTEQ].includes(this.peek().type)) { const m={[TT.LT]:'<',[TT.GT]:'>',[TT.LTEQ]:'<=',[TT.GTEQ]:'>='}; const op=m[this.advance().type]; l={kind:'BinOp',op,left:l,right:this.parseAddSub()}; } return l; }
  parseAddSub()     { let l = this.parseMulDiv();     while (this.check(TT.PLUS)||this.check(TT.MINUS)) { const op=this.advance().type===TT.PLUS?'+':'-'; l={kind:'BinOp',op,left:l,right:this.parseMulDiv()}; } return l; }
  parseMulDiv()     { let l = this.parseUnary();      while (this.check(TT.STAR)||this.check(TT.SLASH)) { const op=this.advance().type===TT.STAR?'*':'/'; l={kind:'BinOp',op,left:l,right:this.parseUnary()}; } return l; }

  parseUnary() {
    if (this.check(TT.BANG))  { this.advance(); return { kind:'Unary', op:'!', expr:this.parseUnary() }; }
    if (this.check(TT.MINUS)) { this.advance(); return { kind:'Unary', op:'-', expr:this.parseUnary() }; }
    return this.parsePostfix();
  }

  parsePostfix() {
    let expr = this.parsePrimary();
    while (this.check(TT.DOT)) {
      this.advance();
      const field = this.expect(TT.IDENT).value;
      expr = { kind:'FieldAccess', object:expr, field };
    }
    return expr;
  }

  parsePrimary() {
    const t = this.peek();

    if (t.type === TT.INT)   { this.advance(); return { kind:'Int',   value:t.value }; }
    if (t.type === TT.FLOAT) { this.advance(); return { kind:'Float', value:t.value }; }
    if (t.type === TT.TRUE)  { this.advance(); return { kind:'Bool',  value:true }; }
    if (t.type === TT.FALSE) { this.advance(); return { kind:'Bool',  value:false }; }
    if (t.type === TT.STR)   { this.advance(); return { kind:'Str',   value:t.value }; }

    if (t.type === TT.LPAREN) {
      this.advance();
      const expr = this.parseExpr();
      this.expect(TT.RPAREN);
      return expr;
    }

    if (t.type === TT.IDENT) {
      this.advance();
      const name = t.value;

      if (this.check(TT.LPAREN)) {
        this.advance();
        const args = [];
        while (!this.check(TT.RPAREN) && !this.check(TT.EOF)) {
          args.push(this.parseExpr());
          this.eat(TT.COMMA);
        }
        this.expect(TT.RPAREN);
        return { kind:'Call', name, args };
      }

      // FIX: only treat IDENT { as a pod init when it is a registered pod name.
      // Without this guard, expressions like (x < y) where y is followed by a
      // block-opening { (e.g. the then-body of an if) would be mis-parsed as a
      // pod initialiser, consuming the { and crashing on the missing colon.
      if (this.check(TT.LBRACE) && this.knownPods.has(name)) {
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
        return { kind:'PodInit', name, fields };
      }

      return { kind:'Var', name };
    }

    throw new Error(`Unexpected token: ${t.type} ('${t.value ?? ''}')`);
  }
}

// ---- INTERPRETER ----

class ReturnSignal { constructor(value) { this.value = value; } }

class Interpreter {
  constructor(program, outputFn, inputFn) {
    this.pods   = {};
    this.funcs  = {};
    this.output = outputFn;
    this.input  = inputFn;

    // FIX 3: track mutability — store which variable names were declared with 'mut'
    this.mutableVars = new WeakMap(); // env object → Set of mutable names

    for (const pod of program.pods)  this.pods[pod.name]  = pod.fields.map(f => f.name);
    for (const fn  of program.functions) this.funcs[fn.name] = fn;
  }

  async run() {
    if (!this.funcs['main']) throw new Error("No 'main' function found");
    await this.callFunction(this.funcs['main'], [], {});
  }

  async callFunction(fn, argValues, _outerEnv) {
    // Functions get a fresh flat env (no prototype chain across function calls)
    const env = {};
    this.mutableVars.set(env, new Set());
    fn.params.forEach((p, i) => {
      env[p.name] = argValues[i];
      this.mutableVars.get(env).add(p.name); // params are reassignable inside the fn
    });
    try {
      await this.execBlock(fn.body, env);
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      throw e;
    }
    return null;
  }

  // FIX 4: scope chain for blocks uses prototype inheritance but assignment
  // must walk the chain to find the *owning* frame and write there, not shadow.
  makeChildEnv(parentEnv) {
    const child = Object.create(parentEnv);
    this.mutableVars.set(child, new Set());
    return child;
  }

  // Walk up prototype chain to find which env owns a variable
  findOwner(env, name) {
    let e = env;
    while (e !== null) {
      if (Object.prototype.hasOwnProperty.call(e, name)) return e;
      e = Object.getPrototypeOf(e);
    }
    return null;
  }

  async execBlock(stmts, env) {
    for (const stmt of stmts) await this.execStmt(stmt, env);
  }

  async execStmt(stmt, env) {
    switch (stmt.kind) {
      case 'Let': {
        env[stmt.name] = await this.evalExpr(stmt.value, env);
        // let = not mutable, don't add to mutableVars set
        break;
      }
      case 'Mut': {
        env[stmt.name] = await this.evalExpr(stmt.value, env);
        this.mutableVars.get(env)?.add(stmt.name);
        break;
      }
      case 'Assign': {
        // FIX 4: find the frame that owns this variable and write there
        const owner = this.findOwner(env, stmt.name);
        if (!owner) throw new Error(`Undefined variable '${stmt.name}'`);
        // Check mutability — walk up to find the declaring frame's mut set
        let declFrame = owner;
        const isMut = this.mutableVars.get(declFrame)?.has(stmt.name);
        if (!isMut) throw new Error(`Cannot reassign immutable variable '${stmt.name}' (declared with 'let')`);
        owner[stmt.name] = await this.evalExpr(stmt.value, env);
        break;
      }
      case 'AssignField': {
        const owner = this.findOwner(env, stmt.object);
        if (!owner) throw new Error(`Undefined variable '${stmt.object}'`);
        const obj = owner[stmt.object];
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
          await this.execBlock(stmt.thenBody, this.makeChildEnv(env));
        } else if (stmt.elseBody) {
          await this.execBlock(stmt.elseBody, this.makeChildEnv(env));
        }
        break;
      }
      case 'Swim': {
        const from = await this.evalExpr(stmt.from, env);
        const to   = await this.evalExpr(stmt.to,   env);
        for (let i = from; i < to; i++) {
          const child = this.makeChildEnv(env);
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
            await this.execBlock(arm.body, this.makeChildEnv(env));
            break;
          }
        }
        break;
      }
      case 'ExprStmt':
        await this.evalExpr(stmt.expr, env);
        break;
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
          default:   throw new Error(`Unknown operator: ${expr.op}`);
        }
      }

      case 'Unary': {
        const val = await this.evalExpr(expr.expr, env);
        if (expr.op === '!') return !val;
        if (expr.op === '-') return -val;
        throw new Error(`Unknown unary op: ${expr.op}`);
      }

      case 'Call':
        return await this.callBuiltinOrUser(expr.name, expr.args, env);

      default:
        throw new Error(`Unknown expression kind: ${expr.kind}`);
    }
  }

  async callBuiltinOrUser(name, argExprs, env) {
    // FIX 1: bark is now a regular built-in function, not a keyword.
    // It works in all positions: statement, expression, nested call argument.
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
    if (name === 'int')   { return parseInt(await this.evalExpr(argExprs[0], env), 10); }
    if (name === 'float') { return parseFloat(await this.evalExpr(argExprs[0], env)); }
    if (name === 'str')   { return String(await this.evalExpr(argExprs[0], env)); }
    if (name === 'bool')  { return Boolean(await this.evalExpr(argExprs[0], env)); }

    const fn = this.funcs[name];
    if (!fn) throw new Error(`Undefined function '${name}'`);
    const argValues = [];
    for (const a of argExprs) argValues.push(await this.evalExpr(a, env));
    return await this.callFunction(fn, argValues, env);
  }

  interpolate(str, env) {
    return str.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, name) =>
      (name in env ? this.display(env[name]) : `{${name}}`)
    );
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
// FIX 5: 'loop' example used 'let' for sum then tried to reassign it — changed to 'mut'

const EXAMPLES = {
  hello: `~ Hello World in SealLang 🦭

dive main() {
    bark("a seal has entered the chat")

    let x: int = 10
    let y: int = 20

    if x < y {
        bark("x is smaller")
    } else {
        bark("y is smaller")
    }

    swim i in 0..5 {
        bark(i)
    }
}`,

  loop: `~ Loops and arithmetic

dive main() {
    mut sum: int = 0
    swim i in 1..11 {
        sum = sum + i
    }
    bark("Sum 1..10 =")
    bark(sum)

    swim n in 0..8 {
        bark(n * n)
    }
}`,

  pods: `~ Pods are like structs

pod Seal {
    age: int,
    weight: float
}

dive main() {
    let s: Seal = Seal { age: 3, weight: 120.5 }
    bark(s.age)
    bark(s.weight)

    mut t: Seal = Seal { age: 1, weight: 80.0 }
    t.age = 2
    bark(t.age)
}`,

  funcs: `~ Functions with surface (return)

dive add(a: int, b: int) -> int {
    surface a + b
}

dive greet(name: str) {
    bark("Hello, {name}!")
}

dive main() {
    let result: int = add(7, 13)
    bark(result)
    greet("Wally")
}`,

  interp: `~ String interpolation with {}

dive main() {
    let name: str = "Wally"
    let age: int = 5
    let weight: float = 150.3
    bark("Hello, {name}!")
    bark("Age: {age}")
    bark("Weight: {weight} kg")
    bark("{name} is {age} years old.")
}`,

  fish: `~ User input with fish()

dive main() {
    let name: str = fish("What is your name? ")
    bark("Hello, {name}!")

    let age: int = fish_int("How old are you? ")
    bark("You are {age} years old.")

    let score: float = fish_float("Enter a score: ")
    bark("Score: {score}")
}`,
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
  statusMsg.textContent = msg;
  statusDot.className = 'status-dot' + (state === 'ok' ? '' : ' ' + state);
}

function clearOutput() { outputEl.innerHTML = ''; }

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

// ---- Drag-to-resize ----
const resizeHandle = document.getElementById('resizeHandle');
const paneEditor   = document.getElementById('paneEditor');
const workspace    = document.getElementById('workspace');

if (resizeHandle && paneEditor && workspace) {
  let dragging = false, startY, startH;
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
