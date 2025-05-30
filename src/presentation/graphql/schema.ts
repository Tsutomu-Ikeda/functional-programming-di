import { buildSchema } from 'graphql';

export const typeDefs = `
  type User {
    id: ID!
    email: String!
    name: String!
    role: UserRole!
  }

  enum UserRole {
    ADMIN
    USER
    GUEST
  }

  input CreateUserInput {
    email: String!
    name: String!
    password: String!
  }

  type ValidationError {
    field: String!
    message: String!
  }

  type FailedUserInput {
    input: CreateUserInput!
    errors: [ValidationError!]!
  }

  type BulkCreateUserResult {
    success: Boolean!
    data: BulkUserOperationResult
    error: String
  }

  type BulkUserOperationResult {
    successful: [User!]!
    failed: [FailedUserInput!]!
  }

  type CreateUserResult {
    success: Boolean!
    data: User
    error: String
  }

  type GetUserResult {
    success: Boolean!
    data: User
    error: String
  }

  type Query {
    getUser(id: ID!): GetUserResult!
  }

  type Mutation {
    createUser(input: CreateUserInput!): CreateUserResult!
    bulkCreateUsers(csvContent: String!): BulkCreateUserResult!
  }
`;

export const schema = buildSchema(typeDefs);
