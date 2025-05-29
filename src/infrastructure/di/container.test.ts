import { Container, createContainer } from './container';
import { ServiceDefinition, RequestContext, ScopedContainer } from './types';

describe('Container', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  describe('register', () => {
    it('should register a service definition', () => {
      const definition: ServiceDefinition<string> = {
        factory: async () => 'test',
        lifecycle: 'singleton'
      };

      expect(() => container.register('test', definition)).not.toThrow();
    });
  });

  describe('resolve', () => {
    it('should resolve singleton service', async () => {
      const definition: ServiceDefinition<string> = {
        factory: async () => 'singleton-value',
        lifecycle: 'singleton'
      };

      container.register('test', definition);

      const result1 = await container.resolve<string>('test');
      const result2 = await container.resolve<string>('test');

      expect(result1).toBe('singleton-value');
      expect(result2).toBe('singleton-value');
      expect(result1).toBe(result2); // Same instance
    });

    it('should resolve transient service', async () => {
      let counter = 0;
      const definition: ServiceDefinition<number> = {
        factory: async () => ++counter,
        lifecycle: 'transient'
      };

      container.register('test', definition);

      const result1 = await container.resolve<number>('test');
      const result2 = await container.resolve<number>('test');

      expect(result1).toBe(1);
      expect(result2).toBe(2);
    });

    it('should resolve scoped service with context', async () => {
      const definition: ServiceDefinition<string> = {
        factory: async () => 'scoped-value',
        lifecycle: 'scoped'
      };

      const context: RequestContext = {
        requestId: 'test-request',
        startTime: new Date(),
        metadata: {}
      };

      container.register('test', definition);

      const result = await container.resolve<string>('test', context);

      expect(result).toBe('scoped-value');
    });

    it('should throw error for unregistered service', async () => {
      await expect(container.resolve('nonexistent')).rejects.toThrow('Service nonexistent not registered');
    });

    it('should throw error for scoped service without context', async () => {
      const definition: ServiceDefinition<string> = {
        factory: async () => 'scoped-value',
        lifecycle: 'scoped'
      };

      container.register('test', definition);

      await expect(container.resolve('test')).rejects.toThrow('Scoped service test requires a request context');
    });
  });

  describe('createScope', () => {
    it('should create a scoped container', () => {
      const context: RequestContext = {
        requestId: 'test-request',
        startTime: new Date(),
        metadata: {}
      };

      const scopedContainer = container.createScope(context);

      expect(scopedContainer).toBeDefined();
      expect(typeof scopedContainer.resolve).toBe('function');
      expect(typeof scopedContainer.dispose).toBe('function');
    });
  });
});

describe('ScopedContainer', () => {
  let container: Container;
  let scopedContainer: ScopedContainer;
  let context: RequestContext;

  beforeEach(() => {
    container = new Container();
    context = {
      requestId: 'test-request',
      startTime: new Date(),
      metadata: {}
    };
    scopedContainer = container.createScope(context);
  });

  describe('resolve', () => {
    it('should resolve singleton service from parent', async () => {
      const definition: ServiceDefinition<string> = {
        factory: async () => 'singleton-value',
        lifecycle: 'singleton'
      };

      container.register('test', definition);

      const result = await scopedContainer.resolve<string>('test');

      expect(result).toBe('singleton-value');
    });

    it('should resolve scoped service and cache it', async () => {
      let counter = 0;
      const definition: ServiceDefinition<number> = {
        factory: async () => ++counter,
        lifecycle: 'scoped'
      };

      container.register('test', definition);

      const result1 = await scopedContainer.resolve<number>('test');
      const result2 = await scopedContainer.resolve<number>('test');

      expect(result1).toBe(1);
      expect(result2).toBe(1); // Same instance in scope
    });

    it('should resolve transient service without caching', async () => {
      let counter = 0;
      const definition: ServiceDefinition<number> = {
        factory: async () => ++counter,
        lifecycle: 'transient'
      };

      container.register('test', definition);

      const result1 = await scopedContainer.resolve<number>('test');
      const result2 = await scopedContainer.resolve<number>('test');

      expect(result1).toBe(1);
      expect(result2).toBe(2);
    });

    it('should throw error for unregistered service', async () => {
      await expect(scopedContainer.resolve('nonexistent')).rejects.toThrow('Service nonexistent not registered');
    });

    it('should throw error when container is disposed', async () => {
      await scopedContainer.dispose();

      await expect(scopedContainer.resolve('test')).rejects.toThrow('Container has been disposed');
    });
  });

  describe('dispose', () => {
    it('should dispose scoped instances with dispose method', async () => {
      const mockDispose = jest.fn();
      const mockInstance = { dispose: mockDispose };

      const definition: ServiceDefinition = {
        factory: async () => mockInstance,
        lifecycle: 'scoped'
      };

      container.register('test', definition);

      await scopedContainer.resolve('test');
      await scopedContainer.dispose();

      expect(mockDispose).toHaveBeenCalled();
    });

    it('should handle instances without dispose method', async () => {
      const mockInstance = { value: 'test' };

      const definition: ServiceDefinition = {
        factory: async () => mockInstance,
        lifecycle: 'scoped'
      };

      container.register('test', definition);

      await scopedContainer.resolve('test');

      expect(async () => await scopedContainer.dispose()).not.toThrow();
    });

    it('should not dispose twice', async () => {
      const mockDispose = jest.fn();
      const mockInstance = { dispose: mockDispose };

      const definition: ServiceDefinition = {
        factory: async () => mockInstance,
        lifecycle: 'scoped'
      };

      container.register('test', definition);

      await scopedContainer.resolve('test');
      await scopedContainer.dispose();
      await scopedContainer.dispose(); // Second call

      expect(mockDispose).toHaveBeenCalledTimes(1);
    });
  });
});

describe('createContainer', () => {
  it('should create a new container instance', () => {
    const container = createContainer();

    expect(container).toBeDefined();
    expect(typeof container.register).toBe('function');
    expect(typeof container.resolve).toBe('function');
    expect(typeof container.createScope).toBe('function');
  });
});
