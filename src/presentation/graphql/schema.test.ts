import { buildSchema, GraphQLSchema, GraphQLObjectType, GraphQLEnumType, GraphQLInputObjectType } from 'graphql';
import { typeDefs, schema } from './schema';

describe('GraphQL Schema', () => {
  describe('typeDefs', () => {
    it('should contain valid GraphQL type definitions', () => {
      expect(typeDefs).toContain('type User');
      expect(typeDefs).toContain('enum UserRole');
      expect(typeDefs).toContain('input CreateUserInput');
      expect(typeDefs).toContain('type CreateUserResult');
      expect(typeDefs).toContain('type GetUserResult');
      expect(typeDefs).toContain('type Query');
      expect(typeDefs).toContain('type Mutation');
    });

    it('should define User type with correct fields', () => {
      expect(typeDefs).toContain('id: ID!');
      expect(typeDefs).toContain('email: String!');
      expect(typeDefs).toContain('name: String!');
      expect(typeDefs).toContain('role: UserRole!');
    });

    it('should define UserRole enum with correct values', () => {
      expect(typeDefs).toContain('ADMIN');
      expect(typeDefs).toContain('USER');
      expect(typeDefs).toContain('GUEST');
    });

    it('should define CreateUserInput with required fields', () => {
      expect(typeDefs).toContain('email: String!');
      expect(typeDefs).toContain('name: String!');
      expect(typeDefs).toContain('password: String!');
    });

    it('should define result types with success, data, and error fields', () => {
      expect(typeDefs).toContain('success: Boolean!');
      expect(typeDefs).toContain('data: User');
      expect(typeDefs).toContain('error: String');
    });

    it('should define Query operations', () => {
      expect(typeDefs).toContain('getUser(id: ID!): GetUserResult!');
    });

    it('should define Mutation operations', () => {
      expect(typeDefs).toContain('createUser(input: CreateUserInput!): CreateUserResult!');
    });
  });

  describe('schema', () => {
    it('should be a valid GraphQL schema', () => {
      expect(schema).toBeInstanceOf(GraphQLSchema);
    });

    it('should build schema from typeDefs without errors', () => {
      expect(() => buildSchema(typeDefs)).not.toThrow();
    });

    it('should have Query type', () => {
      const queryType = schema.getQueryType();
      expect(queryType).toBeDefined();
      expect(queryType?.name).toBe('Query');
    });

    it('should have Mutation type', () => {
      const mutationType = schema.getMutationType();
      expect(mutationType).toBeDefined();
      expect(mutationType?.name).toBe('Mutation');
    });

    it('should have User type with correct fields', () => {
      const userType = schema.getType('User') as GraphQLObjectType;
      expect(userType).toBeDefined();
      expect(userType.name).toBe('User');

      const fields = userType.getFields();
      expect(fields.id).toBeDefined();
      expect(fields.email).toBeDefined();
      expect(fields.name).toBeDefined();
      expect(fields.role).toBeDefined();
    });

    it('should have UserRole enum type', () => {
      const userRoleType = schema.getType('UserRole') as GraphQLEnumType;
      expect(userRoleType).toBeDefined();
      expect(userRoleType.name).toBe('UserRole');

      const values = userRoleType.getValues();
      expect(values.map(v => v.name)).toContain('ADMIN');
      expect(values.map(v => v.name)).toContain('USER');
      expect(values.map(v => v.name)).toContain('GUEST');
    });

    it('should have CreateUserInput input type', () => {
      const createUserInputType = schema.getType('CreateUserInput') as GraphQLInputObjectType;
      expect(createUserInputType).toBeDefined();
      expect(createUserInputType.name).toBe('CreateUserInput');

      const fields = createUserInputType.getFields();
      expect(fields.email).toBeDefined();
      expect(fields.name).toBeDefined();
      expect(fields.password).toBeDefined();
    });

    it('should have CreateUserResult type', () => {
      const createUserResultType = schema.getType('CreateUserResult') as GraphQLObjectType;
      expect(createUserResultType).toBeDefined();
      expect(createUserResultType.name).toBe('CreateUserResult');

      const fields = createUserResultType.getFields();
      expect(fields.success).toBeDefined();
      expect(fields.data).toBeDefined();
      expect(fields.error).toBeDefined();
    });

    it('should have GetUserResult type', () => {
      const getUserResultType = schema.getType('GetUserResult') as GraphQLObjectType;
      expect(getUserResultType).toBeDefined();
      expect(getUserResultType.name).toBe('GetUserResult');

      const fields = getUserResultType.getFields();
      expect(fields.success).toBeDefined();
      expect(fields.data).toBeDefined();
      expect(fields.error).toBeDefined();
    });

    it('should have getUser query field', () => {
      const queryType = schema.getQueryType();
      const fields = queryType?.getFields();
      expect(fields?.getUser).toBeDefined();
      expect(fields?.getUser.args).toHaveLength(1);
      expect(fields?.getUser.args[0].name).toBe('id');
    });

    it('should have createUser mutation field', () => {
      const mutationType = schema.getMutationType();
      const fields = mutationType?.getFields();
      expect(fields?.createUser).toBeDefined();
      expect(fields?.createUser.args).toHaveLength(1);
      expect(fields?.createUser.args[0].name).toBe('input');
    });
  });

  describe('Schema validation', () => {
    it('should validate that all types are properly defined', () => {
      const typeMap = schema.getTypeMap();

      // Check that all custom types exist
      expect(typeMap.User).toBeDefined();
      expect(typeMap.UserRole).toBeDefined();
      expect(typeMap.CreateUserInput).toBeDefined();
      expect(typeMap.CreateUserResult).toBeDefined();
      expect(typeMap.GetUserResult).toBeDefined();
    });

    it('should have consistent field types across result types', () => {
      const createUserResultType = schema.getType('CreateUserResult') as GraphQLObjectType;
      const getUserResultType = schema.getType('GetUserResult') as GraphQLObjectType;

      const createFields = createUserResultType.getFields();
      const getFields = getUserResultType.getFields();

      // Both should have the same structure
      expect(createFields.success.type.toString()).toBe(getFields.success.type.toString());
      expect(createFields.data.type.toString()).toBe(getFields.data.type.toString());
      expect(createFields.error.type.toString()).toBe(getFields.error.type.toString());
    });
  });
});
