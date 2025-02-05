import { z } from 'zod'
export const LiteralSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])
export type Literal = z.infer<typeof LiteralSchema>

export type DeserializedJson = Literal | { [key: string]: DeserializedJson } | DeserializedJson[]

export const DeserializedJsonSchema: z.ZodType<DeserializedJson> = z.lazy(() =>
  z.union([LiteralSchema, z.array(DeserializedJsonSchema), z.record(DeserializedJsonSchema)]),
)

export const SerializableSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.date(),
  z.undefined(),
  z.symbol(),
])

export type Serializable =
  | string
  | number
  | boolean
  | null
  | undefined
  | { [key: string]: Serializable } // Add support for objects
  | Serializable[] // Add support for arrays

export type SerializableJson = Serializable | { [key: string]: SerializableJson } | SerializableJson[]
