import { DIContainer, ScopedContainer, ServiceDefinition, RequestContext } from './types';

export class Container implements DIContainer {
  private services = new Map<string, ServiceDefinition>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private singletons = new Map<string, any>();

  register<T>(key: string, definition: ServiceDefinition<T>): void {
    this.services.set(key, definition);
  }

  async resolve<T>(key: string, context?: RequestContext): Promise<T> {
    const definition = this.services.get(key);
    if (!definition) {
      throw new Error(`Service ${key} not registered`);
    }

    if (definition.lifecycle === 'singleton') {
      if (!this.singletons.has(key)) {
        const instance = await definition.factory();
        this.singletons.set(key, instance);
      }
      return this.singletons.get(key);
    }

    if (definition.lifecycle === 'transient') {
      return await definition.factory();
    }

    // For scoped services, we need a context
    if (!context) {
      throw new Error(`Scoped service ${key} requires a request context`);
    }

    return await definition.factory();
  }

  createScope(context: RequestContext): ScopedContainer {
    return new ScopedContainerImpl(this, context);
  }
}

class ScopedContainerImpl implements ScopedContainer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private scopedInstances = new Map<string, any>();
  private disposed = false;

  constructor(
    private parent: Container,
    private context: RequestContext
  ) {}

  async resolve<T>(key: string): Promise<T> {
    if (this.disposed) {
      throw new Error('Container has been disposed');
    }

    const definition = this.parent['services'].get(key);
    if (!definition) {
      throw new Error(`Service ${key} not registered`);
    }

    if (definition.lifecycle === 'singleton') {
      return await this.parent.resolve(key, this.context);
    }

    if (definition.lifecycle === 'scoped') {
      if (!this.scopedInstances.has(key)) {
        const instance = await definition.factory();
        this.scopedInstances.set(key, instance);
      }
      return this.scopedInstances.get(key);
    }

    // Transient
    return await definition.factory();
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;

    // Dispose scoped instances that implement dispose method
    for (const [_key, instance] of this.scopedInstances) {
      if (instance && typeof instance.dispose === 'function') {
        await instance.dispose();
      }
    }

    this.scopedInstances.clear();
    this.disposed = true;
  }
}

export const createContainer = (): DIContainer => new Container();
