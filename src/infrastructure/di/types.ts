export type Injectable<T, U extends unknown[], V> = {
  (...args: U): V;
  inject: (deps: Partial<T> | ((d: T) => Partial<T>)) => Injectable<T, U, V>;
};
export const depend = <T extends Record<string, unknown>, U extends unknown[], V>(
  dependencies: T,
  cb: (deps: T, ...args: U) => V,
): Injectable<T, U, V> => {
  const fn = (...args: U): V => cb(dependencies, ...args);
  fn.inject = (deps: Partial<T> | ((d: T) => Partial<T>)): Injectable<T, U, V> =>
    typeof deps === 'function'
      ? depend({ ...dependencies, ...deps(dependencies) }, cb)
      : depend({ ...dependencies, ...deps }, cb);
  return fn;
};

export type Lifecycle = 'singleton' | 'scoped' | 'transient'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ServiceDefinition<T = any> {
  factory: () => T | Promise<T>;
  lifecycle: Lifecycle;
  instance?: T;
}

export interface RequestContext {
  requestId: string;
  startTime: Date;
  metadata: Record<string, unknown>;
}

export interface DIContainer {
  register<T>(key: string, definition: ServiceDefinition<T>): void;
  resolve<T>(key: string, context?: RequestContext): Promise<T>;
  createScope(context: RequestContext): ScopedContainer;
}

export interface ScopedContainer {
  resolve<T>(key: string): Promise<T>;
  dispose(): Promise<void>;
}
