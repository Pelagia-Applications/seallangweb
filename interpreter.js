(function () {
  // ============================================================
  // SEALLANG WEB INTERPRETER
  // Updated to match current compiler:
  //   + arrays (int[], float[], etc.) with literals, index, assign
  //   + modulo operator %
  //   + else if chains
  //   + math builtins: sqrt, pow, abs_int, floor, ceil, min_int, max_int
  //   + len() built-in for arrays
  //   + bark remains a builtin (not a keyword)
  //   + pod init uses uppercase-first convention (no knownPods scan needed)
  // ============================================================

  // ---- TOKEN TYPES ----

  const TT = {
    DIVE:'DIVE', SURFACE:'SURFACE', POD:'POD', SWIM:'SWIM',
    BARK:'BARK', TIDE:'TIDE', LET:'LET', MUT:'MUT',
    IF:'IF', ELSE:'ELSE', MATCH:'MATCH', CATCH:'CATCH', IN:'IN', SELF:'SELF',
    TYINT:'TYINT', TYFLOAT:'TYFLOAT', TYBOOL:'TYBOOL', TYSTR:'TYSTR',
    INT:'INT', FLOAT:'FLOAT', TRUE:'TRUE', FALSE:'FALSE', STR:'STR',
    IDENT:'IDENT',
    PLUS:'PLUS', MINUS:'MINUS', STAR:'STAR', SLASH:'SLASH', PERCENT:'PERCENT',
    EQEQ:'EQEQ', NEQ:'NEQ', LTEQ:'LTEQ', GTEQ:'GTEQ', LT:'LT', GT:'GT',
    AND:'AND', OR:'OR', EQ:'EQ', BANG:'BANG',
    LPAREN:'LPAREN', RPAREN:'RPAREN', LBRACE:'LBRACE', RBRACE:'RBRACE',
    LBRACKET:'LBRACKET', RBRACKET:'RBRACKET',
    COMMA:'COMMA', COLON:'COLON', SEMI:'SEMI', ARROW:'ARROW',
    DOTDOT:'DOTDOT', DOT:'DOT',
    EOF:'EOF',
  };

  // bark is NOT a keyword — it's handled as a builtin function.
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
      // Whitespace
      if (/[ \t\r\n]/.test(src[i])) { i++; continue; }
      // Line comment: ~
      if (src[i] === '~') { while (i < len && src[i] !== '\n') i++; continue; }

      // String literal
      if (src[i] === '"') {
        let s = '';
        i++;
        while (i < len && src[i] !== '"') {
          if (src[i] === '\\') {
            i++;
            if (src[i] === 'n') s += '\n';
            else if (src[i] === 't') s += '\t';
            else s += src[i];
          } else {
            s += src[i];
          }
          i++;
        }
        i++; // closing "
        tokens.push({ type: TT.STR, value: s });
        continue;
      }

      // Number (no signed literal in lexer — unary minus handled in parser)
      if (/[0-9]/.test(src[i])) {
        let num = '';
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

      // Two-char operators (check before single-char)
      const two = src[i] + (src[i+1] || '');
      const twoMap = {
        '==':TT.EQEQ, '!=':TT.NEQ, '<=':TT.LTEQ, '>=':TT.GTEQ,
        '&&':TT.AND, '||':TT.OR, '->':TT.ARROW, '..':TT.DOTDOT
      };
      if (twoMap[two]) { tokens.push({ type: twoMap[two] }); i += 2; continue; }

      // Single-char
      const oneMap = {
        '+':TT.PLUS, '-':TT.MINUS, '*':TT.STAR, '/':TT.SLASH, '%':TT.PERCENT,
        '<':TT.LT, '>':TT.GT, '=':TT.EQ, '!':TT.BANG,
        '(':TT.LPAREN, ')':TT.RPAREN,
        '{':TT.LBRACE, '}':TT.RBRACE,
        '[':TT.LBRACKET, ']':TT.RBRACKET,
        ',':TT.COMMA, ':':TT.COLON, ';':TT.SEMI, '.':TT.DOT
      };
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
    check(type) { return this.peek().type === type; }
    eat(type) { if (this.check(type)) { this.advance(); return true; } return false; }

    expect(type) {
      const t = this.peek();
      if (t.type !== type) throw new Error(`Expected ${type}, got ${t.type} ('${t.value ?? ''}')`);
      return this.advance();
    }

    parseProgram() {
      const pods = [], functions = [];
      while (!this.check(TT.EOF)) {
        if (this.check(TT.POD))        pods.push(this.parsePod());
        else if (this.check(TT.DIVE))  functions.push(this.parseFunction());
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

    // Parse type, including array suffix: int[]
    parseType() {
      const t = this.advance();
      let base;
      switch (t.type) {
        case TT.TYINT:   base = 'int'; break;
        case TT.TYFLOAT: base = 'float'; break;
        case TT.TYBOOL:  base = 'bool'; break;
        case TT.TYSTR:   base = 'str'; break;
        case TT.IDENT:   base = t.value; break;
        default: throw new Error(`Expected type, got ${t.type}`);
      }
      // Array suffix: int[]
      if (this.check(TT.LBRACKET)) {
        this.advance();
        this.expect(TT.RBRACKET);
        return { array: true, elem: base };
      }
      return base;
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

      if (t.type === TT.IF) return this.parseIf();
      if (t.type === TT.SWIM) return this.parseSwim();
      if (t.type === TT.MATCH) return this.parseMatch();

      // Expression statement — also handles assignments
      const expr = this.parseExpr();

      if (this.check(TT.EQ)) {
        this.advance();
        const value = this.parseExpr();
        this.eat(TT.SEMI);
        // Determine assignment target from the parsed expression
        if (expr.kind === 'Var') {
          return { kind: 'Assign', name: expr.name, value };
        }
        if (expr.kind === 'FieldAccess' && expr.object.kind === 'Var') {
          return { kind: 'AssignField', object: expr.object.name, field: expr.field, value };
        }
        if (expr.kind === 'Index' && expr.array.kind === 'Var') {
          return { kind: 'AssignIndex', name: expr.array.name, index: expr.index, value };
        }
        throw new Error('Invalid assignment target');
      }

      this.eat(TT.SEMI);
      return { kind: 'ExprStmt', expr };
    }

    parseIf() {
      this.expect(TT.IF);
      const condition = this.parseExpr();
      this.expect(TT.LBRACE);
      const thenBody = this.parseBlock();
      this.expect(TT.RBRACE);

      let elseBody = null;
      if (this.eat(TT.ELSE)) {
        if (this.check(TT.IF)) {
          // else if — parse the nested if as a single statement in the else block
          elseBody = [this.parseIf()];
        } else {
          this.expect(TT.LBRACE);
          elseBody = this.parseBlock();
          this.expect(TT.RBRACE);
        }
      }
      return { kind: 'If', condition, thenBody, elseBody };
    }

    parseSwim() {
      this.expect(TT.SWIM);
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

    // ---- Expressions (Pratt-style precedence climbing) ----

    parseExpr() { return this.parseBinary(0); }

    parseBinary(minPrec) {
      let left = this.parseUnary();
      while (true) {
        const op = this.peekBinOp();
        if (!op) break;
        const prec = opPrec(op);
        if (prec < minPrec) break;
        this.advance();
        const right = this.parseBinary(prec + 1);
        left = { kind: 'BinOp', op, left, right };
      }
      return left;
    }

    peekBinOp() {
      const map = {
        [TT.PLUS]:'Add', [TT.MINUS]:'Sub', [TT.STAR]:'Mul',
        [TT.SLASH]:'Div', [TT.PERCENT]:'Mod',
        [TT.EQEQ]:'Eq', [TT.NEQ]:'NotEq',
        [TT.LT]:'Lt', [TT.GT]:'Gt', [TT.LTEQ]:'LtEq', [TT.GTEQ]:'GtEq',
        [TT.AND]:'And', [TT.OR]:'Or',
      };
      return map[this.peek().type] || null;
    }

    parseUnary() {
      if (this.check(TT.BANG))  { this.advance(); return { kind:'Not', expr: this.parseUnary() }; }
      if (this.check(TT.MINUS)) {
        this.advance();
        const expr = this.parseUnary();
        // Fold constant negatives for cleanliness
        if (expr.kind === 'Int')   return { kind:'Int',   value: -expr.value };
        if (expr.kind === 'Float') return { kind:'Float', value: -expr.value };
        return { kind:'BinOp', op:'Sub', left:{ kind:'Int', value:0 }, right:expr };
      }
      return this.parsePostfix();
    }

    parsePostfix() {
      let expr = this.parsePrimary();
      while (true) {
        if (this.check(TT.DOT)) {
          this.advance();
          const field = this.expect(TT.IDENT).value;
          expr = { kind:'FieldAccess', object:expr, field };
        } else if (this.check(TT.LBRACKET)) {
          this.advance();
          const index = this.parseExpr();
          this.expect(TT.RBRACKET);
          expr = { kind:'Index', array:expr, index };
        } else break;
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

      // Array literal: [1, 2, 3]
      if (t.type === TT.LBRACKET) {
        this.advance();
        const elements = [];
        while (!this.check(TT.RBRACKET) && !this.check(TT.EOF)) {
          elements.push(this.parseExpr());
          this.eat(TT.COMMA);
        }
        this.expect(TT.RBRACKET);
        return { kind:'ArrayLit', elements };
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
          return { kind:'Call', name, args };
        }

        // Pod init: only when name starts with uppercase (matches compiler convention)
        if (this.check(TT.LBRACE) && /^[A-Z]/.test(name)) {
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

  function opPrec(op) {
    switch (op) {
      case 'Or':  return 1;
      case 'And': return 2;
      case 'Eq': case 'NotEq': return 3;
      case 'Lt': case 'Gt': case 'LtEq': case 'GtEq': return 4;
      case 'Add': case 'Sub': return 5;
      case 'Mul': case 'Div': case 'Mod': return 6;
      default: return 0;
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
      this.mutableVars = new WeakMap();

      for (const pod of program.pods)       this.pods[pod.name]  = pod.fields.map(f => f.name);
      for (const fn  of program.functions)  this.funcs[fn.name]  = fn;
    }

    async run() {
      if (!this.funcs['main']) throw new Error("No 'main' function found");
      await this.callFunction(this.funcs['main'], [], {});
    }

    async callFunction(fn, argValues, _outer) {
      const env = {};
      this.mutableVars.set(env, new Set());
      fn.params.forEach((p, i) => {
        env[p.name] = argValues[i];
        this.mutableVars.get(env).add(p.name);
      });
      try {
        await this.execBlock(fn.body, env);
      } catch (e) {
        if (e instanceof ReturnSignal) return e.value;
        throw e;
      }
      return null;
    }

    makeChildEnv(parent) {
      const child = Object.create(parent);
      this.mutableVars.set(child, new Set());
      return child;
    }

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
          break;
        }
        case 'Mut': {
          env[stmt.name] = await this.evalExpr(stmt.value, env);
          this.mutableVars.get(env)?.add(stmt.name);
          break;
        }
        case 'Assign': {
          const owner = this.findOwner(env, stmt.name);
          if (!owner) throw new Error(`Undefined variable '${stmt.name}'`);
          if (!this.mutableVars.get(owner)?.has(stmt.name))
            throw new Error(`Cannot reassign immutable variable '${stmt.name}' (declared with 'let')`);
          owner[stmt.name] = await this.evalExpr(stmt.value, env);
          break;
        }
        case 'AssignField': {
          const owner = this.findOwner(env, stmt.object);
          if (!owner) throw new Error(`Undefined variable '${stmt.object}'`);
          const obj = owner[stmt.object];
          if (obj == null || typeof obj !== 'object' || Array.isArray(obj))
            throw new Error(`'${stmt.object}' is not a pod`);
          obj[stmt.field] = await this.evalExpr(stmt.value, env);
          break;
        }
        case 'AssignIndex': {
          const owner = this.findOwner(env, stmt.name);
          if (!owner) throw new Error(`Undefined variable '${stmt.name}'`);
          if (!this.mutableVars.get(owner)?.has(stmt.name))
            throw new Error(`Cannot mutate elements of immutable array '${stmt.name}'`);
          const arr = owner[stmt.name];
          if (!Array.isArray(arr)) throw new Error(`'${stmt.name}' is not an array`);
          const idx = await this.evalExpr(stmt.index, env);
          if (idx < 0 || idx >= arr.length) throw new Error(`Index ${idx} out of bounds for array of length ${arr.length}`);
          arr[idx] = await this.evalExpr(stmt.value, env);
          break;
        }
        case 'Return': {
          throw new ReturnSignal(await this.evalExpr(stmt.expr, env));
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

        case 'ArrayLit': {
          const elems = [];
          for (const e of expr.elements) elems.push(await this.evalExpr(e, env));
          return elems;
        }

        case 'Index': {
          const arr = await this.evalExpr(expr.array, env);
          const idx = await this.evalExpr(expr.index, env);
          if (!Array.isArray(arr)) throw new Error('Indexing a non-array value');
          if (idx < 0 || idx >= arr.length) throw new Error(`Index ${idx} out of bounds (length ${arr.length})`);
          return arr[idx];
        }

        case 'FieldAccess': {
          const obj = await this.evalExpr(expr.object, env);
          if (obj == null || typeof obj !== 'object' || Array.isArray(obj))
            throw new Error(`Cannot access field '${expr.field}' on a non-pod value`);
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

        case 'Not': {
          return !(await this.evalExpr(expr.expr, env));
        }

        case 'BinOp': {
          const l = await this.evalExpr(expr.left,  env);
          const r = await this.evalExpr(expr.right, env);
          switch (expr.op) {
            case 'Add':   return (typeof l === 'string' || typeof r === 'string') ? String(l) + String(r) : l + r;
            case 'Sub':   return l - r;
            case 'Mul':   return l * r;
            case 'Div':   if (r === 0) throw new Error('Division by zero'); return l / r;
            case 'Mod':   if (r === 0) throw new Error('Modulo by zero');   return l % r;
            case 'Eq':    return l === r;
            case 'NotEq': return l !== r;
            case 'Lt':    return l < r;
            case 'Gt':    return l > r;
            case 'LtEq':  return l <= r;
            case 'GtEq':  return l >= r;
            case 'And':   return l && r;
            case 'Or':    return l || r;
            default: throw new Error(`Unknown operator: ${expr.op}`);
          }
        }

        case 'Call':
          return await this.callBuiltinOrUser(expr.name, expr.args, env);

        default:
          throw new Error(`Unknown expression kind: ${expr.kind}`);
      }
    }

    async callBuiltinOrUser(name, argExprs, env) {
      // --- Output ---
      if (name === 'bark') {
        const val = await this.evalExpr(argExprs[0], env);
        this.output(this.display(val), 'value');
        return null;
      }

      // --- Input ---
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

      // --- Type casts ---
      if (name === 'int')   return Math.trunc(await this.evalExpr(argExprs[0], env));
      if (name === 'float') return parseFloat(await this.evalExpr(argExprs[0], env));
      if (name === 'str')   return String(await this.evalExpr(argExprs[0], env));
      if (name === 'bool')  return Boolean(await this.evalExpr(argExprs[0], env));

      // --- Math builtins ---
      if (name === 'sqrt')    return Math.sqrt(await this.evalExpr(argExprs[0], env));
      if (name === 'pow')     { const base = await this.evalExpr(argExprs[0], env); const exp = await this.evalExpr(argExprs[1], env); return Math.pow(base, exp); }
      if (name === 'abs_int') return Math.abs(Math.trunc(await this.evalExpr(argExprs[0], env)));
      if (name === 'floor')   return Math.floor(await this.evalExpr(argExprs[0], env));
      if (name === 'ceil')    return Math.ceil(await this.evalExpr(argExprs[0], env));
      if (name === 'min_int') { const a = await this.evalExpr(argExprs[0], env); const b = await this.evalExpr(argExprs[1], env); return Math.min(a, b); }
      if (name === 'max_int') { const a = await this.evalExpr(argExprs[0], env); const b = await this.evalExpr(argExprs[1], env); return Math.max(a, b); }

      // --- Array builtins ---
      if (name === 'len') {
        const val = await this.evalExpr(argExprs[0], env);
        if (!Array.isArray(val)) throw new Error('len() requires an array');
        return val.length;
      }

      // --- User-defined function ---
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
      if (Array.isArray(val)) return '[' + val.map(v => this.display(v)).join(', ') + ']';
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

    arrays: `~ Arrays in SealLang

  dive main() {
      let nums: int[] = [10, 20, 30, 40, 50]
      bark(nums[0])
      bark(nums[4])

      swim i in 0..5 {
          bark(nums[i])
      }

      mut scores: int[] = [1, 2, 3]
      scores[1] = 99
      bark(scores[1])

      let temps: float[] = [98.6, 37.0, 100.4]
      bark(temps[0])
  }`,

    fibonacci: `~ Fibonacci sequence using recursion
  
  dive fib(n: int) -> int {
      if n <= 1 {
          surface n
      }
      surface fib(n - 1) + fib(n - 2)
  }
  
  dive main() {
      let terms: int = fish_int("How many fibonacci numbers? ")
  
      swim i in 0..terms {
          let result: int = fib(i)
          bark(result)
      }
  }`,

    math: `~ Math builtins

  dive main() {
      let a: int = 17 % 5
      bark(a)

      let b: float = sqrt(144.0)
      bark(b)

      let c: float = pow(2.0, 10.0)
      bark(c)

      let d: int = abs_int(-42)
      bark(d)

      let e: int = floor(3.9)
      let f: int = ceil(3.1)
      bark(e)
      bark(f)

      let g: int = min_int(10, 20)
      let h: int = max_int(10, 20)
      bark(g)
      bark(h)
  }`,

    logic: `~ else if and ! operator

  dive main() {
      let score: int = 85

      if score >= 90 {
          bark("Grade: A")
      } else if score >= 80 {
          bark("Grade: B")
      } else if score >= 70 {
          bark("Grade: C")
      } else {
          bark("Grade: F")
      }

      let passing: bool = score >= 70
      let failing: bool = !passing
      if failing {
          bark("You are failing!")
      } else {
          bark("You are passing!")
      }
  }`,
  };


  // ---- SYNTAX HIGHLIGHTER ----
  // Mirrors the TextMate grammar from the VS Code extension.
  // Tokenises line-by-line using the same regex patterns and
  // returns an HTML string with <span class="hl-*"> wrappers.

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // Token rules: [regex, classNameOrFn]
  // Processed in order; first match wins per position.
  const HIGHLIGHT_RULES = [
    // Comments (~...)
    [/~.*$/,                                   'hl-comment'],
    // Strings (with escape + interpolation inside)
    [/"(?:[^"\]|\.)*"/,                      null, highlightString],
    // Float before int
    [/\d+\.\d+/,                           'hl-number'],
    // Integer
    [/\d+/,                                'hl-number'],
    // dive funcname(  — keyword + name together
    [/(dive)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()/,  null, (m) =>
      `<span class="hl-fn-kw">${escHtml(m[1])}</span>${m[0].slice(m[1].length, m[0].length - m[2].length - (m[0].match(/\s+/)||[''])[0].length)}<span class="hl-fn-name">${escHtml(m[2])}</span>`
    ],
    // pod TypeName
    [/(pod)\s+([A-Z][a-zA-Z0-9_]*)/,      null, (m) =>
      `<span class="hl-pod-kw">${escHtml(m[1])}</span> <span class="hl-type-name">${escHtml(m[2])}</span>`
    ],
    // Builtins (before generic keywords)
    [/(bark|fish_int|fish_float|fish|sqrt|pow|abs_int|abs_float|floor|ceil|min_int|max_int|len)/, 'hl-builtin'],
    // Control keywords
    [/(if|else|swim|in|match|catch|tide|surface)/, 'hl-keyword'],
    // let / mut
    [/(let|mut)/,                          'hl-decl'],
    // Types (including array suffix handled separately)
    [/(int|float|bool|str)/,              'hl-type'],
    // Booleans
    [/(true|false)/,                       'hl-bool'],
    // Pod type names (uppercase ident)
    [/[A-Z][a-zA-Z0-9_]*/,               'hl-type-name'],
    // Function calls (lowercase ident followed by ()
    [/([a-z_][a-zA-Z0-9_]*)\s*(?=\()/,     'hl-fn-call'],
    // Operators
    [/(==|!=|<=|>=|->|\.\.|\|\||&&|[+\-*\/%<>!]|(?<![=!<>])=(?!=))/, 'hl-op'],
    // Plain identifiers
    [/[a-zA-Z_][a-zA-Z0-9_]*/,           'hl-ident'],
  ];

  function highlightString(m) {
    // m[0] is the full string including quotes
    const inner = m[0].slice(1, -1);
    let out = '<span class="hl-string">&quot;';
    let i = 0;
    while (i < inner.length) {
      // Escape sequence
      if (inner[i] === '\\' && i + 1 < inner.length) {
        out += `<span class="hl-escape">${escHtml(inner.slice(i, i+2))}</span>`;
        i += 2;
        continue;
      }
      // Interpolation {varName}
      const interp = inner.slice(i).match(/^\{[a-zA-Z_][a-zA-Z0-9_]*\}/);
      if (interp) {
        out += `<span class="hl-interp">${escHtml(interp[0])}</span>`;
        i += interp[0].length;
        continue;
      }
      out += escHtml(inner[i]);
      i++;
    }
    out += '&quot;</span>';
    return out;
  }

  function highlightLine(line) {
    let out = '';
    let i = 0;
    while (i < line.length) {
      let matched = false;
      for (const [rx, cls, fn] of HIGHLIGHT_RULES) {
        const re = new RegExp(rx.source, 'y'); // sticky at position i
        re.lastIndex = i;
        const m = re.exec(line);
        if (!m) continue;
        if (fn) {
          out += fn(m);
        } else {
          out += `<span class="${cls}">${escHtml(m[0])}</span>`;
        }
        i += m[0].length;
        matched = true;
        break;
      }
      if (!matched) {
        out += escHtml(line[i]);
        i++;
      }
    }
    return out;
  }

  function highlightCode(code) {
    return code.split('\n').map(highlightLine).join('\n');
  }

  function syncHighlight() {
    const code = editor.value;
    // Trailing newline: add a space so the layer height matches the textarea
    highlightLayer.innerHTML = highlightCode(code) + '\n';
    // Keep scroll in sync
    highlightLayer.scrollTop  = editor.scrollTop;
    highlightLayer.scrollLeft = editor.scrollLeft;
  }

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
      if (window.sealRefreshHighlight) window.sealRefreshHighlight();
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

})();
