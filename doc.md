# SealLang Language Reference 🦭

> SealLang is a statically-typed, compiled programming language with ocean-themed syntax.
> Programs are made of **pods** (structs) and **dives** (functions), and every statement lives inside a dive.

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
10. [Arrays](#10-arrays) *(new in 1.1)*
11. [String Interpolation](#11-string-interpolation)
12. [Built-in Functions](#12-built-in-functions)
13. [Output](#13-output)
14. [Keyword Reference](#14-keyword-reference)

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

SealLang has four primitive types, array types, and named pod types.

| Type       | Description                          | Example literals              |
|------------|--------------------------------------|-------------------------------|
| `int`      | 64-bit signed integer                | `0`, `-7`, `1000`             |
| `float`    | 64-bit floating-point number         | `3.14`, `-0.5`, `100.0`       |
| `bool`     | Boolean                              | `true`, `false`               |
| `str`      | UTF-8 string                         | `"hello"`, `"seal 🦭"`        |
| `Type[]`   | Array of any type *(new in 1.1)*     | `[1, 2, 3]`, `[1.0, 2.5]`    |
| `Name`     | A named pod type (user-defined)      | `Seal`, `Point`               |

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

Reassign a `mut` variable, a field of a mutable pod instance, or an element of a mutable array:

```seal
mut score: int = 0
score = 100              ~ reassign variable

mut s: Seal = Seal { age: 1, weight: 80.0 }
s.age = 2                ~ reassign a field

mut nums: int[] = [1, 2, 3]
nums[0] = 99             ~ reassign an array element (new in 1.1)
```

> **Note:** Attempting to reassign a `let` binding, or mutate elements of a `let` array, is a runtime error.

---

## 5. Operators

### Arithmetic

| Operator | Operation      | Types                                 |
|----------|----------------|---------------------------------------|
| `+`      | Addition       | `int`, `float`, `str` (concatenation) |
| `-`      | Subtraction    | `int`, `float`                        |
| `*`      | Multiplication | `int`, `float`                        |
| `/`      | Division       | `int`, `float`                        |
| `%`      | Modulo *(new)* | `int`, `float`                        |

```seal
let sum: int    = 3 + 4       ~ 7
let diff: float = 10.0 - 2.5  ~ 7.5
let prod: int   = 6 * 7       ~ 42
let quot: float = 9.0 / 4.0   ~ 2.25
let rem: int    = 17 % 5      ~ 2
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
let both: bool    = true && false   ~ false
let either: bool  = true || false   ~ true
let flipped: bool = !true           ~ false
```

### Operator Precedence

From highest to lowest:

| Level | Operators            |
|-------|----------------------|
| 6     | `*` `/` `%`          |
| 5     | `+` `-`              |
| 4     | `<` `>` `<=` `>=`   |
| 3     | `==` `!=`            |
| 2     | `&&`                 |
| 1     | `\|\|`               |

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

### else if *(new in 1.1)*

Chain multiple conditions with `else if`. Only the first matching branch runs.

```seal
let score: int = fish_int("Enter your score: ")

if score >= 90 {
    bark("Grade: A")
} else if score >= 80 {
    bark("Grade: B")
} else if score >= 70 {
    bark("Grade: C")
} else if score >= 60 {
    bark("Grade: D")
} else {
    bark("Grade: F")
}
```

There is no limit on the number of `else if` arms.

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

The loop variable is automatically bound as `int` inside the body and is read-only within the loop.

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

### Looping over an array *(new in 1.1)*

Use `swim` with `len()` to iterate over an array by index:

```seal
let nums: int[] = [10, 20, 30, 40, 50]
swim i in 0..len(nums) {
    bark(nums[i])
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
dive fib(n: int) -> int {
    if n <= 1 {
        surface n
    }
    surface fib(n - 1) + fib(n - 2)
}

dive main() {
    swim i in 0..10 {
        bark(fib(i))
    }
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

> **Convention:** Pod names must start with an **uppercase letter** (e.g. `Seal`, `Point`). This is how the compiler distinguishes pod initialisers like `Seal { ... }` from block statements.

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

dive sum_coords(p: Point) -> int {
    surface p.x + p.y
}

dive main() {
    let p: Point = Point { x: 3, y: 4 }
    bark(sum_coords(p))  ~ 7
}
```

---

## 10. Arrays *(new in 1.1)*

Arrays are ordered, fixed-length sequences of values all of the same type.

### Array types

Append `[]` to any base type to form its array type:

```seal
let nums: int[]   = [1, 2, 3]
let temps: float[] = [98.6, 37.0, 100.4]
let flags: bool[]  = [true, false, true]
let words: str[]   = ["seal", "wave", "tide"]
```

### Array literals

Write elements between `[` and `]`, separated by commas:

```seal
let primes: int[] = [2, 3, 5, 7, 11]
```

### Reading elements

Use zero-based index notation `arr[i]`:

```seal
let nums: int[] = [10, 20, 30]
bark(nums[0])   ~ 10
bark(nums[2])   ~ 30
```

Accessing an out-of-bounds index is a runtime error.

### Mutating elements

The array variable must be declared with `mut`:

```seal
mut scores: int[] = [1, 2, 3]
scores[1] = 99
bark(scores[1])  ~ 99
```

Mutating an element of a `let` array is a runtime error.

### Getting the length

Use the `len()` built-in:

```seal
let nums: int[] = [10, 20, 30, 40, 50]
bark(len(nums))  ~ 5
```

### Looping over an array

```seal
let nums: int[] = [10, 20, 30, 40, 50]
swim i in 0..len(nums) {
    bark(nums[i])
}
```

### Full example

```seal
dive main() {
    ~ declare an int array
    let nums: int[] = [10, 20, 30, 40, 50]

    ~ read elements
    bark(nums[0])   ~ 10
    bark(nums[4])   ~ 50

    ~ loop over array
    swim i in 0..5 {
        bark(nums[i])
    }

    ~ mutate an element
    mut scores: int[] = [1, 2, 3]
    scores[1] = 99
    bark(scores[1])  ~ 99

    ~ float array
    let temps: float[] = [98.6, 37.0, 100.4]
    bark(temps[0])   ~ 98.6
}
```

---

## 11. String Interpolation

Curly braces `{varName}` inside a string literal are replaced with the current value of the named variable. Any type can be interpolated — it is converted to its string representation automatically.

```seal
let name: str  = "Wally"
let age: int   = 5
let weight: float = 120.5

bark("Hello, {name}!")            ~ Hello, Wally!
bark("Age: {age}")                ~ Age: 5
bark("Weight: {weight} kg")       ~ Weight: 120.5 kg
bark("{name} is {age} yrs old.")  ~ Wally is 5 yrs old.
```

> **Note:** Only simple variable names are supported inside `{ }`. Expressions like `{a + b}` are not interpolated.

---

## 12. Built-in Functions

### Output — `bark`

`bark` prints a single value followed by a newline. It accepts any type including arrays.

```seal
bark("hello")          ~ string
bark(42)               ~ int
bark(3.14)             ~ float
bark(true)             ~ bool
bark([1, 2, 3])        ~ array: [1, 2, 3]
bark(s.age)            ~ field value
bark(add(2, 3))        ~ function call result
```

### Input — `fish`, `fish_int`, `fish_float`

These functions pause execution and prompt the user for input.

| Function               | Returns |
|------------------------|---------|
| `fish(prompt)`         | `str`   |
| `fish_int(prompt)`     | `int`   |
| `fish_float(prompt)`   | `float` |

```seal
let name: str   = fish("What is your name? ")
let age: int    = fish_int("How old are you? ")
let score: float = fish_float("Enter a score: ")
```

> `fish_int` and `fish_float` error at runtime if the input cannot be parsed as a number.

### Array — `len` *(new in 1.1)*

Returns the number of elements in an array as an `int`.

```seal
let nums: int[] = [10, 20, 30]
bark(len(nums))  ~ 3
```

### Math *(new in 1.1)*

| Function              | Description                            | Returns  |
|-----------------------|----------------------------------------|----------|
| `sqrt(x)`             | Square root                            | `float`  |
| `pow(base, exp)`      | Raise `base` to the power `exp`        | `float`  |
| `abs_int(n)`          | Absolute value of an integer           | `int`    |
| `floor(x)`            | Round down to nearest integer          | `int`    |
| `ceil(x)`             | Round up to nearest integer            | `int`    |
| `min_int(a, b)`       | Smaller of two integers                | `int`    |
| `max_int(a, b)`       | Larger of two integers                 | `int`    |

```seal
dive main() {
    let a: int   = 17 % 5           ~ 2
    let b: float = sqrt(144.0)      ~ 12.0
    let c: float = pow(2.0, 10.0)   ~ 1024.0
    let d: int   = abs_int(-42)     ~ 42
    let e: int   = floor(3.9)       ~ 3
    let f: int   = ceil(3.1)        ~ 4
    let g: int   = min_int(10, 20)  ~ 10
    let h: int   = max_int(10, 20)  ~ 20
    bark(a)
    bark(b)
    bark(c)
    bark(d)
    bark(e)
    bark(f)
    bark(g)
    bark(h)
}
```

---

## 13. Output

### bark

`bark` prints a single value to standard output, followed by a newline. It accepts any type.

```seal
bark("hello")       ~ string
bark(42)            ~ int
bark(3.14)          ~ float
bark(true)          ~ bool
bark([1, 2, 3])     ~ [1, 2, 3]
bark(s.age)         ~ field value
bark(add(2, 3))     ~ function call result
```

`bark` takes exactly one argument.

---

## 14. Keyword Reference

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
| `else`    | Alternative branch / `else if` chain    | `else`, `elif`              |
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

~ Types: int  float  bool  str  int[]  float[]  PodName

~ Variables
let x: int = 10
mut y: int = 0
y = 5

~ Arrays (new in 1.1)
let nums: int[] = [10, 20, 30]
bark(nums[0])
mut scores: int[] = [1, 2, 3]
scores[1] = 99
bark(len(nums))

~ Output / Input
bark("hello")
bark(x)
let s: str   = fish("prompt ")
let n: int   = fish_int("prompt ")
let f: float = fish_float("prompt ")

~ Arithmetic: +  -  *  /  %
~ Comparison: ==  !=  <  >  <=  >=
~ Logical:    &&  ||  !

~ Conditionals
if x > 0 {
    bark("positive")
} else if x == 0 {
    bark("zero")
} else {
    bark("negative")
}

~ Loop (half-open range)
swim i in 0..10 {
    bark(i)
}

~ Loop over array
swim i in 0..len(nums) {
    bark(nums[i])
}

~ Function
dive add(a: int, b: int) -> int {
    surface a + b
}

~ Recursion
dive fib(n: int) -> int {
    if n <= 1 { surface n }
    surface fib(n - 1) + fib(n - 2)
}

~ Pod (must start with uppercase)
pod Seal {
    name: str,
    age: int
}
let s: Seal = Seal { name: "Wally", age: 3 }
bark(s.name)
mut s2: Seal = Seal { name: "Bob", age: 1 }
s2.age = 2

~ Math builtins (new in 1.1)
sqrt(144.0)      ~ 12.0
pow(2.0, 10.0)   ~ 1024.0
abs_int(-5)      ~ 5
floor(3.9)       ~ 3
ceil(3.1)        ~ 4
min_int(1, 2)    ~ 1
max_int(1, 2)    ~ 2

~ String interpolation
bark("Hello, {name}! You are {age} years old.")
```
