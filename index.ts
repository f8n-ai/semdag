import type { ZodType, ZodTypeDef } from 'zod'
import type { Serializable } from './json'

/** Represents a type, with Zod for validation/parsing, and custom equality. */
export interface Type<T extends Serializable> {
  name: string
  schema: ZodType<T, ZodTypeDef, T>
  equals: (a: T, b: T) => boolean
}

/** Represents a morphism (transformation) between two types. */
export type Morphism<A extends Serializable, B extends Serializable> =
  | BasicMorphism<A, B>
  | ReversibleMorphism<A, B>
  | ComposedMorphism<A, any, B> // Allow any intermediate type in composition

interface BasicMorphism<A extends Serializable, B extends Serializable> {
  kind: 'basic'
  map: (a: A) => B
  source: Type<A>
  target: Type<B>
}

interface ReversibleMorphism<A extends Serializable, B extends Serializable> {
  kind: 'reversible'
  map: (a: A) => B
  source: Type<A>
  target: Type<B>
  inverse: (b: B) => A
}

interface ComposedMorphism<A extends Serializable, B extends Serializable, C extends Serializable> {
  kind: 'composed'
  map: (a: A) => C
  source: Type<A>
  target: Type<C>
  first: Morphism<A, B>
  second: Morphism<B, C>
}

/** Creates a reversible morphism. */
export const reversibleMorphism = <A extends Serializable, B extends Serializable>(
  source: Type<A>,
  target: Type<B>,
  forward: (a: A) => B,
  backward: (b: B) => A,
): Morphism<A, B> => {
  return { kind: 'reversible', map: forward, source, target, inverse: backward }
}

/** Creates a basic (non-reversible) morphism. */
export const morphism = <A extends Serializable, B extends Serializable>(
  source: Type<A>,
  target: Type<B>,
  forward: (a: A) => B,
): Morphism<A, B> => {
  return { kind: 'basic', map: forward, source: source, target: target }
}

/** Composes two morphisms. */
export const compose = <A extends Serializable, B extends Serializable, C extends Serializable>(
  first: Morphism<A, B>,
  second: Morphism<B, C>,
): Morphism<A, C> => {
  if (first.target.schema !== second.source.schema) {
    throw new Error(`Cannot compose morphisms: Incompatible types.
            First morphism target type: ${first.target.name}
            Second morphism source type: ${second.source.name}`)
  }

  return {
    kind: 'composed',
    map: (a: A) => second.map(first.map(a)),
    source: first.source,
    target: second.target,
    first,
    second,
  }
}

/** Checks if a morphism is reversible. */
export const isReversible = <A extends Serializable, B extends Serializable>(m: Morphism<A, B>): boolean => {
  return m.kind === 'reversible'
}

/** Gets the inverse function of a reversible morphism. */
export const inverseOf = <A extends Serializable, B extends Serializable>(
  m: Morphism<A, B>,
): ((b: B) => A) | undefined => {
  if (m.kind === 'reversible') {
    return m.inverse
  }
  return undefined
}

/** Checks if a reversible morphism preserves properties (round-trip). */
export const checkReversibility = <A extends Serializable, B extends Serializable>(
  m: Morphism<A, B>,
  testValue: A,
): boolean => {
  const inverse = inverseOf(m)
  if (!inverse) {
    return false
  }

  const forward = m.map(testValue)
  const backward = inverse(forward)
  return m.source.equals(testValue, backward)
}

/** Represents either a successful result or an error. */
export type Result<T, E> = { success: true; value: T } | { success: false; error: E }

// Helper function for reversing composed morphisms
const _reverseComposed = <A extends Serializable, B extends Serializable>(
  m: ComposedMorphism<A, B, B>,
  value: B,
): Result<A, string> => {
  if (!isReversible(m.second)) {
    return {
      success: false,
      error: `Morphism "${m.second.source.name} -> ${m.second.target.name}" within composition is not reversible`,
    }
  }
  if (!isReversible(m.first)) {
    return {
      success: false,
      error: `Morphism "${m.first.source.name} -> ${m.first.target.name}" within composition is not reversible`,
    }
  }

  const secondReversed = (m.second as ReversibleMorphism<B, B>).inverse(value)
  const firstReversed = (m.first as ReversibleMorphism<A, B>).inverse(secondReversed)
  return { success: true, value: firstReversed }
}

/** Attempts to reverse a morphism. Returns a Result type. */
export const reverse = <A extends Serializable, B extends Serializable>(
  m: Morphism<A, B>,
  value: B,
): Result<A, string> => {
  switch (m.kind) {
    case 'reversible':
      return { success: true, value: m.inverse(value) }
    case 'composed':
      return _reverseComposed(m, value)
    case 'basic':
      return { success: false, error: `Morphism "${m.source.name} -> ${m.target.name}" is not reversible` }
    default:
      return { success: false, error: 'Unknown morphism kind' }
  }
}
