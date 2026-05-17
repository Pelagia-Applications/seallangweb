# SealLang Language Reference (1.0)

> SealLang is a statically-typed, compiled programming language with ocean-themed syntax.
> Programs are made of **pods** (structs) and **dives** (functions), and every statement lives inside a dive.

---

## Table of Contents

1. [File Structure](#1-file-structure)
2. [Comments](#2-comments)
3. [Types](#3-types)
4. [Variables](#4-variables)
5. [Operators](#5-operators)
6. [Control Flow](#6-control-flow)
7. [Loops](#7-loops)
8. [Functions (dive)](#8-functions-dive)
9. [Pods (structs)](#9-pods-structs)
10. [String Interpolation](#10-string-interpolation)
11. [Built-in Functions](#11-built-in-functions)
12. [Output](#12-output)
13. [Keyword Reference](#13-keyword-reference)

---

## 1. File Structure

A SealLang source file (`.seal`) consists of any number of **pod definitions** followed by any number of **function definitions**. Pod definitions must come before functions at the top level. Every program must contain a `main` function — that is the entry point.

```seal
~ pod definitions come first
pod Seal {
    name: str,
    age: int
}

~ then function definitions
dive main() {
    bark("hello!")
}
```

> **Rule:** All top-level items must be either a `pod` or a `dive`. No standalone statements are allowed outside a function.

---

## 2. Comments

Comments begin with a tilde `~` and run to the end of the line. There are no block comments.

```seal
~ This is a full-line comment

let x: int = 5  ~ This is an inline comment
```

---

## 3. Types

SealLang has four primitive types and supports named pod types.

| Type    | Description                        | Example literals         |
|---------|------------------------------------|--------------------------|
| `int`   | 64-bit signed integer              | `0`, `-7`, `1000`        |
| `float` | 64-bit floating-point number       | `3.14`, `-0.5`, `100.0`  |
| `bool`  | Boolean                            | `true`, `false`          |
| `str`   | UTF-8 string                       | `"hello"`, `"seal 🦭"`   |
| `Name`  | A named pod type (user-defined)    | `Seal`, `Point`          |

There is also an implicit `void` return type for functions that do not `surface` a value.

---

## 4. Variables

### Immutable — `let`

Declare an immutable binding with `let`. The type is always explicit.

```seal
let x: int = 42
let name: str = "Wally"
let is_happy: bool = true
let ratio: float = 3.14
```

Once bound, a `let` variable **cannot be reassigned**.

### Mutable — `mut`

Declare a mutable binding with `mut`. These can be reassigned later with `=`.

```seal
mut count: int = 0
count = count + 1
```

### Assignment

Reassign a `mut` variable or a field of a mutable pod instance:

```seal
mut score: int = 0
score = 100          ~ reassign variable

mut s: Seal = Seal { age: 1, weight: 80.0 }
s.age = 2            ~ reassign a field
```

> **Note:** Attempting to reassign a `let` binding is a type error.

---

## 5. Operators

### Arithmetic

| Operator | Operation      | Types         |
|----------|----------------|---------------|
| `+`      | Addition       | `int`, `float`, `str` (concatenation) |
| `-`      | Subtraction    | `int`, `float` |
| `*`      | Multiplication | `int`, `float` |
| `/`      | Division       | `int`, `float` |

```seal
let sum: int   = 3 + 4      ~ 7
let diff: float = 10.0 - 2.5 ~ 7.5
let prod: int  = 6 * 7      ~ 42
let quot: float = 9.0 / 4.0  ~ 2.25
```

### Comparison

All comparison operators return `bool`.

| Operator | Meaning                  |
|----------|--------------------------|
| `==`     | Equal to                 |
| `!=`     | Not equal to             |
| `<`      | Less than                |
| `>`      | Greater than             |
| `<=`     | Less than or equal to    |
| `>=`     | Greater than or equal to |

```seal
let a: bool = 5 == 5    ~ true
let b: bool = 3 != 4    ~ true
let c: bool = 10 > 20   ~ false
```

### Logical

| Operator | Meaning     |
|----------|-------------|
| `&&`     | Logical AND |
| `\|\|`   | Logical OR  |
| `!`      | Logical NOT |

```seal
let both: bool = true && false   ~ false
let either: bool = true || false ~ true
let flipped: bool = !true        ~ false
```

### Operator Precedence

From highest to lowest:

| Level | Operators          |
|-------|--------------------|
| 6     | `*` `/`            |
| 5     | `+` `-`            |
| 4     | `<` `>` `<=` `>=`  |
| 3     | `==` `!=`          |
| 2     | `&&`               |
| 1     | `\|\|`             |

Use parentheses `( )` to override precedence.

---

## 6. Control Flow

### if / else

```seal
if condition {
    ~ executed when condition is true
} else {
    ~ executed otherwise
}
```

The `else` branch is optional. The condition must be a `bool` expression — there is no implicit truthy/falsy conversion.

```seal
let x: int = 10
let y: int = 20

if x < y {
    bark("x is smaller")
} else {
    bark("y is smaller or equal")
}
```

### if without else

```seal
let logged_in: bool = true

if logged_in {
    bark("Welcome back!")
}
```

### Nested if

```seal
if a > 0 {
    if a > 100 {
        bark("large positive")
    } else {
        bark("small positive")
    }
} else {
    bark("non-positive")
}
```

### match

Match compares a value against a series of patterns. The first arm whose pattern equals the subject is executed.

```seal
match value {
    1 -> {
        bark("one")
    },
    2 -> {
        bark("two")
    },
}
```

> **Note:** `match` performs strict equality checks. There is no wildcard/default arm in the current version.

---

## 7. Loops

### swim (range loop)

`swim` iterates a variable over a half-open integer range `from..to` (inclusive start, exclusive end).

```seal
swim i in 0..5 {
    bark(i)
}
~ prints: 0, 1, 2, 3, 4
```

The loop variable (`i` above) is automatically bound as `int` inside the body and is read-only within the loop.

```seal
~ Sum 1 through 10
mut total: int = 0
swim n in 1..11 {
    total = total + n
}
bark(total)  ~ 55
```

The range bounds can be any `int` expression:

```seal
let start: int = 2
let end: int = 8
swim i in start..end {
    bark(i * i)
}
```

---

## 8. Functions (dive)

### Declaration

Functions are declared with `dive`. Parameters are comma-separated `name: type` pairs. An optional return type is specified with `->`.

```seal
dive name(param1: type1, param2: type2) -> returnType {
    ~ body
}
```

### Void function (no return value)

```seal
dive greet(name: str) {
    bark("Hello, {name}!")
}
```

### Function with return value

Use `surface` to return a value. The returned expression must match the declared return type.

```seal
dive add(a: int, b: int) -> int {
    surface a + b
}
```

### Calling functions

```seal
dive main() {
    greet("Wally")

    let result: int = add(3, 4)
    bark(result)  ~ 7
}
```

### Recursion

Functions can call themselves recursively:

```seal
dive factorial(n: int) -> int {
    if n <= 1 {
        surface 1
    } else {
        surface n * factorial(n - 1)
    }
}

dive main() {
    bark(factorial(5))  ~ 120
}
```

### The `main` function

Every program must define a `dive main()` with no parameters and no return type. It is the program's entry point.

```seal
dive main() {
    bark("program starts here")
}
```

---

## 9. Pods (structs)

Pods are named collections of typed fields — similar to structs in other languages.

### Defining a pod

Pod definitions go at the top level, before any functions. Fields are separated by commas (trailing comma is optional).

```seal
pod Seal {
    name: str,
    age: int,
    weight: float
}
```

### Constructing an instance

Use the pod name followed by `{ field: value, ... }`:

```seal
let s: Seal = Seal { name: "Wally", age: 3, weight: 120.5 }
```

All fields must be provided. Order does not matter.

### Accessing fields

Use dot notation:

```seal
bark(s.name)    ~ "Wally"
bark(s.age)     ~ 3
bark(s.weight)  ~ 120.5
```

### Mutating fields

The pod variable must be declared with `mut`:

```seal
mut s: Seal = Seal { name: "Wally", age: 3, weight: 120.5 }
s.age = 4
s.weight = 125.0
bark(s.age)  ~ 4
```

### Pods as function parameters

```seal
pod Point {
    x: int,
    y: int
}

dive distance_from_origin(p: Point) -> float {
    ~ simplified — returns x+y as float for demonstration
    surface p.x + p.y
}

dive main() {
    let p: Point = Point { x: 3, y: 4 }
    bark(distance_from_origin(p))
}
```

---

## 10. String Interpolation

Curly braces `{varName}` inside a string literal are replaced with the current value of the named variable. Any type can be interpolated — it is converted to its string representation automatically.

```seal
let name: str = "Wally"
let age: int = 5
let weight: float = 120.5

bark("Hello, {name}!")           ~ Hello, Wally!
bark("Age: {age}")               ~ Age: 5
bark("Weight: {weight} kg")      ~ Weight: 120.5 kg
bark("{name} is {age} yrs old.") ~ Wally is 5 yrs old.
```

> **Note:** Only simple variable names are supported inside `{ }`. Expressions like `{a + b}` are not interpolated.

---

## 11. Built-in Functions

### Input — `fish`, `fish_int`, `fish_float`

These functions pause execution and prompt the user for input.

| Function      | Prompt type | Returns |
|---------------|-------------|---------|
| `fish(prompt)`       | `str` | `str`   |
| `fish_int(prompt)`   | `str` | `int`   |
| `fish_float(prompt)` | `str` | `float` |

```seal
dive main() {
    let name: str = fish("What is your name? ")
    bark("Hello, {name}!")

    let age: int = fish_int("How old are you? ")
    bark("You are {age} years old.")

    let score: float = fish_float("Enter your score: ")
    bark("Score: {score}")
}
```

> `fish_int` and `fish_float` will error at runtime if the user enters something that cannot be parsed as a number.

---

## 12. Output

### bark

`bark` prints a single value to standard output, followed by a newline. It accepts any type.

```seal
bark("hello")       ~ string
bark(42)            ~ int
bark(3.14)          ~ float
bark(true)          ~ bool
bark(s.age)         ~ field value
bark(add(2, 3))     ~ function call result
```

`bark` takes exactly one argument.

---

## 13. Keyword Reference

| Keyword   | Role                                    | Analogue in other languages |
|-----------|-----------------------------------------|-----------------------------|
| `dive`    | Declare a function                      | `fn`, `def`, `function`     |
| `surface` | Return a value from a function          | `return`                    |
| `pod`     | Declare a struct/record type            | `struct`, `class`, `record` |
| `let`     | Declare an immutable variable           | `val`, `const`, `let`       |
| `mut`     | Declare a mutable variable              | `var`, `let mut`            |
| `bark`    | Print a value to output                 | `print`, `println`, `echo`  |
| `swim`    | Range-based for loop                    | `for`, `foreach`            |
| `if`      | Conditional branch                      | `if`                        |
| `else`    | Alternative branch                      | `else`                      |
| `match`   | Pattern matching                        | `match`, `switch`           |
| `in`      | Used in `swim` loop range syntax        | `in`                        |
| `tide`    | Mark a fallible operation *(reserved)*  | `try`                       |
| `catch`   | Handle a tide error *(reserved)*        | `catch`                     |
| `true`    | Boolean literal true                    | `true`                      |
| `false`   | Boolean literal false                   | `false`                     |
| `int`     | Integer type annotation                 | `int`, `i64`                |
| `float`   | Float type annotation                   | `float`, `f64`, `double`    |
| `bool`    | Boolean type annotation                 | `bool`, `boolean`           |
| `str`     | String type annotation                  | `str`, `String`             |

---

## Quick Reference Card

```
~ comment

~ Types: int  float  bool  str  PodName

~ Variables
let x: int = 10
mut y: int = 0
y = 5

~ Output
bark("hello")
bark(x)

~ Input
let s: str   = fish("prompt ")
let n: int   = fish_int("prompt ")
let f: float = fish_float("prompt ")

~ Arithmetic: +  -  *  /
~ Comparison: ==  !=  <  >  <=  >=
~ Logical:    &&  ||  !

~ Conditionals
if x > 0 {
    bark("positive")
} else {
    bark("non-positive")
}

~ Loop (half-open range)
swim i in 0..10 {
    bark(i)
}

~ Function
dive add(a: int, b: int) -> int {
    surface a + b
}

~ Struct
pod Seal {
    name: str,
    age: int
}
let s: Seal = Seal { name: "Wally", age: 3 }
bark(s.name)

~ String interpolation
bark("Hello, {name}! You are {age} years old.")
```
