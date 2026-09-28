export const TOTAL_ROUNDS = 5
export const BREAK_SECONDS = 4

// Multiplication draws from its own, smaller operand range (`multiplyMax`)
// than +/-, so problems stay mental-math-sized even at Hard, where +/-
// operands run much bigger.
export const DIFFICULTIES = {
  easy: {
    label: 'Easy',
    operators: ['+', '-'],
    min: 1,
    max: 20,
    timeoutSeconds: 12,
  },
  medium: {
    label: 'Medium',
    operators: ['+', '-', '*'],
    min: 5,
    max: 50,
    multiplyMax: 12,
    timeoutSeconds: 15,
  },
  hard: {
    label: 'Hard',
    operators: ['+', '-', '*'],
    min: 10,
    max: 200,
    multiplyMax: 20,
    timeoutSeconds: 18,
  },
}

const OPERATOR_SYMBOLS = { '+': '+', '-': '−', '*': '×' }

export function operatorSymbol(operator) {
  return OPERATOR_SYMBOLS[operator] ?? operator
}

export function computeAnswer({ operand_a, operand_b, operator }) {
  if (operator === '+') return operand_a + operand_b
  if (operator === '-') return operand_a - operand_b
  return operand_a * operand_b
}

// Subtraction is kept non-negative (larger operand first).
export function generateProblem(difficulty) {
  const { operators, min, max, multiplyMax } = DIFFICULTIES[difficulty]
  const operator = operators[Math.floor(Math.random() * operators.length)]

  if (operator === '*') {
    const cap = multiplyMax ?? max
    const operand_a = randomInt(1, cap)
    const operand_b = randomInt(1, cap)
    return { operand_a, operand_b, operator }
  }

  let operand_a = randomInt(min, max)
  let operand_b = randomInt(min, max)
  if (operator === '-' && operand_b > operand_a) {
    ;[operand_a, operand_b] = [operand_b, operand_a]
  }
  return { operand_a, operand_b, operator }
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
