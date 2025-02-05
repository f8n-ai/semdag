import { beforeEach, describe, expect, it } from 'bun:test'
import { z } from 'zod'
import {
  type Morphism,
  type Type,
  checkReversibility,
  compose,
  inverseOf,
  morphism,
  reverse,
  reversibleMorphism,
} from './index' // Import from the correct file

import type { Serializable } from './json'

// --- Helper Functions ---
const createStringType = (): Type<string> => ({
  name: 'String',
  schema: z.string(),
  equals: (a, b) => a === b,
})

const createNumberType = (): Type<number> => ({
  name: 'Number',
  schema: z.number(),
  equals: (a, b) => Math.abs(a - b) < Number.EPSILON,
})

const createBooleanType = (): Type<boolean> => ({
  name: 'Boolean',
  schema: z.boolean(),
  equals: (a, b) => a === b,
})

const createUserType = (): Type<{ id: number; name: string }> => ({
  name: 'User',
  schema: z.object({
    id: z.number(),
    name: z.string(),
  }),
  equals: (a, b) => a.id === b.id && a.name === b.name,
})

describe('Morphisms Library', () => {
  let StringType: Type<string>
  let NumberType: Type<number>
  let BooleanType: Type<boolean>
  let UserType: Type<{ id: number; name: string }>

  beforeEach(() => {
    StringType = createStringType()
    NumberType = createNumberType()
    BooleanType = createBooleanType()
    UserType = createUserType()
  })

  it('should create and validate basic types', () => {
    expect(StringType.schema.safeParse('hello').success).toBe(true)
    expect(StringType.schema.safeParse(123).success).toBe(false)
    expect(NumberType.schema.safeParse(123).success).toBe(true)
    expect(NumberType.schema.safeParse('hello').success).toBe(false)
    expect(BooleanType.schema.safeParse(true).success).toBe(true)
    expect(BooleanType.schema.safeParse(123).success).toBe(false)

    expect(StringType.equals('hello', 'hello')).toBe(true)
    expect(StringType.equals('hello', 'world')).toBe(false)
    expect(NumberType.equals(1.0, 1.0000000001)).toBe(true) // Due to epsilon
    expect(NumberType.equals(1, 2)).toBe(false)
    expect(BooleanType.equals(true, true)).toBe(true)
    expect(BooleanType.equals(true, false)).toBe(false)
  })

  it('should create and use reversible morphisms', () => {
    const toUpperCase = reversibleMorphism(
      StringType,
      StringType,
      (s) => s.toUpperCase(),
      (s) => s.toLowerCase(),
    )
    expect(toUpperCase.map('hello')).toBe('HELLO')
    expect(inverseOf(toUpperCase)?.('HELLO')).toBe('hello')
    expect(checkReversibility(toUpperCase, 'hello')).toBe(true)
  })

  it('should create and use non-reversible morphisms', () => {
    const toAbsoluteValue = morphism(NumberType, NumberType, (n) => Math.abs(n))
    expect(toAbsoluteValue.map(-5)).toBe(5)
    expect(inverseOf(toAbsoluteValue)).toBeUndefined()
    expect(checkReversibility(toAbsoluteValue, -5)).toBe(false)
  })

  it('should compose morphisms correctly', () => {
    const toUpperCase = reversibleMorphism(
      StringType,
      StringType,
      (s) => s.toUpperCase(),
      (s) => s.toLowerCase(),
    )
    const addPrefix = reversibleMorphism(
      StringType,
      StringType,
      (s) => `PRE_${s}`,
      (s) => s.slice(4),
    )

    const composed = compose(toUpperCase, addPrefix)
    expect(composed.map('hello')).toBe('PRE_HELLO')
    const reversed = reverse(composed, 'PRE_HELLO')
    expect(reversed.success && reversed.value).toBe('hello')
    expect(checkReversibility(composed, 'hello')).toBe(true)
  })

  it('should handle deeply nested compositions', () => {
    const addOne = reversibleMorphism(
      NumberType,
      NumberType,
      (n) => n + 1,
      (n) => n - 1,
    )
    let composed: Morphism<number, number> = addOne
    for (let i = 0; i < 10; i++) {
      composed = compose(composed, addOne)
    }
    expect(composed.map(5)).toBe(15)
    const reversed = reverse(composed, 15)
    expect(reversed.success && reversed.value).toBe(5)
    expect(checkReversibility(composed, 5)).toBe(true)
  })

  it('should correctly reverse composed morphisms', () => {
    const toUpperCase = reversibleMorphism(
      StringType,
      StringType,
      (s) => s.toUpperCase(),
      (s) => s.toLowerCase(),
    )
    const addPrefix = reversibleMorphism(
      StringType,
      StringType,
      (s) => `PRE_${s}`,
      (s) => s.slice(4),
    )
    const composed = compose(toUpperCase, addPrefix)

    const reversed = reverse(composed, 'PRE_HELLO')
    expect(reversed.success && reversed.value).toBe('hello')
  })

  it('should handle errors during reverse', () => {
    const toAbsoluteValue = morphism(NumberType, NumberType, (n) => Math.abs(n))
    const result = reverse(toAbsoluteValue, 5)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Morphism "Number -> Number" is not reversible')
    }

    // Test a different non-reversible case
    const numToString = morphism(NumberType, StringType, (n) => n.toString())
    const result2 = reverse(numToString, '5')
    expect(result2.success).toBe(false)
    if (!result2.success) {
      expect(result2.error).toContain('is not reversible')
    }
  })

  it('should correctly compose with morphisms that change types', () => {
    const numToString = reversibleMorphism(
      NumberType,
      StringType,
      (n) => n.toString(),
      (s) => {
        const result = NumberType.schema.safeParse(Number(s))
        if (!result.success) throw new Error(result.error.message)
        return result.data
      },
    )
    const stringToBool = reversibleMorphism(
      StringType,
      BooleanType,
      (s) => s === 'true',
      (b) => b.toString(),
    )
    const composed = compose(numToString, stringToBool)
    expect(composed).toBeDefined()

    const forwardResult = composed.map(123)
    expect(forwardResult).toBe(false) // 123.toString() !== "true"

    const reversedResult = reverse(composed, true) // "true" -> "true" -> NaN
    expect(reversedResult.success).toBe(false) //Expect fail
    expect(checkReversibility(composed, 123)).toBe(false)
  })

  it('should correctly handle a reversible morphism with a complex type', () => {
    const UserSchema = z.object({
      id: z.number(),
      name: z.string(),
      email: z.string().email(),
      isActive: z.boolean(),
    })
    type User = z.infer<typeof UserSchema>

    const UserType: Type<User> = {
      name: 'User',
      schema: UserSchema,
      equals: (a, b) => a.id === b.id && a.name === b.name && a.email === b.email && a.isActive === b.isActive,
    }
    const userToString = reversibleMorphism(
      UserType,
      StringType,
      (user) => JSON.stringify(UserSchema.parse(user)),
      (s) => UserSchema.parse(JSON.parse(s)),
    )

    const testUser: User = { id: 1, name: 'Alice', email: 'test@test.com', isActive: true }
    const serializedUser = userToString.map(testUser)
    expect(UserSchema.safeParse(JSON.parse(serializedUser)).success).toBe(true)

    const reversedResult = reverse(userToString, serializedUser)
    expect(reversedResult.success && reversedResult.value).toEqual(testUser)
    expect(checkReversibility(userToString, testUser)).toBe(true)
  })

  it('should compose with user defined morphisms', () => {
    const addPrefix = (prefix: string): Morphism<string, string> => {
      return reversibleMorphism(
        StringType,
        StringType,
        (s: string) => prefix + s,
        (s: string) => (s.startsWith(prefix) ? s.slice(prefix.length) : s),
      )
    }
    const toUpperCase = reversibleMorphism(
      StringType,
      StringType,
      (s) => s.toUpperCase(),
      (s) => s.toLowerCase(),
    )
    const composed = compose(toUpperCase, addPrefix('test_'))
    expect(composed.map('hello')).toBe('test_HELLO')

    const result = reverse(composed, 'test_HELLO')
    if (result.success) {
      expect(result.value).toBe('hello')
    }
  })

  it('should throw an error when composing incompatible morphisms', () => {
    const stringToNum = morphism(StringType, NumberType, (s) => Number(s))
    const numToBool = morphism(NumberType, BooleanType, (n) => n > 0)

    expect(() => compose(stringToNum, numToBool)).toThrow()
  })

  it('reverse should return an appropriate error message for unknown morphism kinds', () => {
    const unknownMorphism = { kind: 'unknown' }
    // @ts-expect-error
    const result = reverse(unknownMorphism, 'someValue')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Unknown morphism kind')
    }
  })

  it('ComposedMorphism should maintain correct source and target types', () => {
    const numToString = reversibleMorphism(
      NumberType,
      StringType,
      (n) => n.toString(),
      (s) => Number.parseFloat(s),
    )
    const toUpperCase = reversibleMorphism(
      StringType,
      StringType,
      (s) => s.toUpperCase(),
      (s) => s.toLowerCase(),
    )

    const composed = compose(numToString, toUpperCase)

    expect(composed.source.name).toBe(NumberType.name)
    expect(composed.target.name).toBe(StringType.name)
  })
  it('should not be able to compose morphisms with different schemas on their source and target', () => {
    const stringToNum = morphism(StringType, NumberType, (s) => Number(s))
    const numToBool = morphism(NumberType, BooleanType, (n) => n > 0)
    expect(() => compose(stringToNum, numToBool)).toThrowError(/Cannot compose morphisms/)
  })
})
