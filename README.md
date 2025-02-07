# semdag: Type-Safe Reversible Data Transformations in TypeScript

This library isn't about academic purity. It's about solving real problems with data transformations in TypeScript, *safely* and *reversibly*, in a way that scales. It's inspired by category theory, but it's *not* a category theory library. It's a *practical* tool for building robust systems.

## Getting Started

Install:

```
pnpm add @f8n-ai/semdag
```

```
bun add @f8n-ai/semdag
```

```
npm install --save @f8n-ai/semdag
```

## The Problem (and Why You Should Care)

You've been there. You're building a system that needs to transform data:

*   **Data Migration:** Moving data between database schemas, upgrading versions, or integrating with external systems.
*   **API Gateways:** Transforming requests and responses between different services.
*   **Frontend/Backend Communication:** Serializing and deserializing data between your client and server.
*   **Complex State Machines:** Managing valid state transitions in your application.
*   **Data Pipelines:** Cleaning, normalizing, and transforming data for analysis or machine learning.

You start with simple functions.  `dtoToEntity`, `entityToDto`, `requestToInternal`, `internalToResponse`.  It works. For a while.

Then, things get messy:

*   **Hidden Bugs:** You realize you've lost data during a transformation.  A field was dropped.  A string was uppercased when it shouldn't have been.  A date was misinterpreted.
*   **Reversibility Nightmares:** You need to *undo* a transformation, but you realize your functions aren't truly reversible.  Or, worse, you *thought* they were reversible, but they weren't.
*   **Composition Hell:** You're chaining transformations together, and it's becoming impossible to reason about the overall behavior of the pipeline.  A small change in one function breaks everything downstream.
*   **Type System Betrayal:** You *thought* TypeScript was protecting you, but you're finding `any` types creeping in, and the compiler is giving you cryptic errors that you can't decipher.

I've been there. I've spent *days* debugging data corruption issues caused by seemingly innocuous transformations. I've wrestled with TypeScript's type system, trying to express complex relationships between data types, and failing. I've seen systems that *looked* type-safe, but were riddled with runtime errors.

This library is the result of that pain.

## The Solution (and How It Works)

The core idea is simple: **Morphisms**.  A morphism is just a transformation from one type to another.  But it's a transformation with *guarantees*:

1.  **Type Safety (as much as possible):**  We use TypeScript's generics and Zod's schema validation to ensure that morphisms are type-safe.  We can't achieve *perfect* compile-time type safety for all possible compositions (due to limitations in TypeScript's type system), but we get as close as we can, and we use runtime checks to catch any remaining issues.

2.  **Reversibility (when it matters):**  Morphisms can be *reversible*.  If you have a morphism `f` from `A` to `B`, and it's reversible, you have a corresponding `inverse` function that goes from `B` back to `A`.  And it's not just *any* inverse; it's a *semantic* inverse.  It preserves the *meaning* of the data, not just the structure. We call this the "semantic dagger".

3.  **Composability (with guarantees):**  You can *compose* morphisms.  If you have a morphism `f` from `A` to `B`, and a morphism `g` from `B` to `C`, you can create a new morphism `compose(f, g)` that goes from `A` to `C`.  And the library *guarantees* that the composition is valid (using runtime schema checks).

4.  **Zod Integration:** We use [Zod](https://zod.dev/) for schema validation and parsing.  Zod is a fantastic library that lets you define the shape and constraints of your data, and it automatically infers the corresponding TypeScript types.  This means you get both runtime validation and compile-time type safety.

5.  **Practicality over Purity:** This library is *not* a strict implementation of category theory. It's inspired by it, but it's designed for real-world use in TypeScript. We make pragmatic compromises where necessary to achieve the best balance of type safety, usability, and performance.

The core types are:

*   **`Type<T>`:**  Defines a data type, using a Zod schema for validation and a custom `equals` function for semantic equality.
*   **`Morphism<A, B>`:**  Represents a transformation from type `A` to type `B`.
*   **`Result<T, E>`:** Represents either a successful result or an error.

The key functions are:

*   **`reversibleMorphism`:** Creates a reversible morphism (you provide the forward and backward functions).
*   **`morphism`:** Creates a basic (non-reversible) morphism.
*   **`compose`:** Composes two or more morphisms. This is where the magic happens. It performs runtime schema checks to ensure that the composition is valid.
*   **`isReversible`:** Checks if a morphism is reversible.
*   **`inverseOf`:** Gets the inverse function of a reversible morphism.
*   **`checkReversibility`:** Checks if a reversible morphism preserves properties (round-trip).
*   **`reverse`:** Attempts to reverse a morphism, returning a `Result` type.

## Example

```typescript
import { z } from 'zod';
import { Type, reversibleMorphism, compose, reverse } from './morphisms';

// Define a Zod schema for a User
const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
});

// Define a Type for User, using the Zod schema
type User = z.infer<typeof UserSchema>;
const UserType: Type<User> = {
  name: "User",
  schema: UserSchema,
  equals: (a, b) => a.id === b.id, // Users are equal if their IDs are equal
};

// Define a Zod schema for a UserDTO (Data Transfer Object)
const UserDtoSchema = z.object({
  userId: z.number(), // Different field names
  userName: z.string(),
  userEmail: z.string().email(),
});

type UserDto = z.infer<typeof UserDtoSchema>;
const UserDtoType: Type<UserDto> = {
    name: "UserDto",
    schema: UserDtoSchema,
    equals: (a, b) => a.userId === b.userId
}

// Create a reversible morphism to convert between User and UserDto
const userToDto = reversibleMorphism(
  UserType,
  UserDtoType,
  (user: User) => ({ userId: user.id, userName: user.name, userEmail: user.email }),
  (dto: UserDto) => ({ id: dto.userId, name: dto.userName, email: dto.userEmail, isActive: true }) //Assume active
);

// Create a morphism to get a user's email
const StringType: Type<string> = {
    name: "String",
    schema: z.string(),
    equals: (a, b) => a === b,
};
const getEmail = morphism(UserType, StringType, user => user.email);

// Compose the morphisms
const userDtoEmail = compose(userToDto, getEmail); // COMPILE ERROR!

// Example usage
const user: User = { id: 123, name: "Alice", email: "alice@example.com", isActive: true };

// Transform to DTO
const dto = userToDto.map(user);
console.log(dto); // Output: { userId: 123, userName: 'Alice', userEmail: 'alice@example.com' }

// Reverse the transformation
const reversedUser = reverse(userToDto, dto);
if (reversedUser.success) {
  console.log(reversedUser.value); // Output: { id: 123, name: 'Alice', email: 'alice@example.com' }
} else {
  console.error(reversedUser.error);
}
```

## Limitations (and Why They Exist)

*   **`any` within `ComposedMorphism`:** The `ComposedMorphism` interface uses `any` for the intermediate types in the `components` array. This is an internal implementation detail and *does not* affect the external type safety of the library. It's a consequence of TypeScript's limitations in handling generic type inference with function composition and discriminated unions. We compensate for this with runtime schema checks.
*   **Runtime Schema Checks:** The `compose` function performs runtime checks to ensure that the Zod schemas of the composed morphisms are compatible. This adds a small runtime overhead, but it's necessary to guarantee type safety in the general case.
* **No HKT Emulation**: I am not using HKT emulation as it would make this library significantly more complex.

## Conclusion

This library is a pragmatic solution to a common problem. It's not perfect, but let's face it - we all make these mistakes eventually. Let's just make them close to impossible. IMO, this is a step up from most home-rolled transformation logic libraries I've seen in the wild. It's designed to be used, extended, improved.  If you find bugs (and I'm sure there are still some lurking), report them.  If you have ideas for improvements, contribute.

Let's build something robust, together.
