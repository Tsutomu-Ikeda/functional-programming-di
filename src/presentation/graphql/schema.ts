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
  }
`;

export const schema = buildSchema(typeDefs);
