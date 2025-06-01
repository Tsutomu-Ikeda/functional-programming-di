import * as TE from 'fp-ts/lib/TaskEither';
import * as RTE from 'fp-ts/lib/ReaderTaskEither';
import * as IO from 'fp-ts/lib/IO';
import { pipe } from 'fp-ts/lib/function';

/**
 * Interface for effect combinators
 */
export interface EffectCombinators<R, Err> {
  /**
   * Create a synchronous effect using IO
   */
  sync: <T>(effectFn: (env: R, context: T) => IO.IO<void>) => (context: T) => RTE.ReaderTaskEither<R, Err, T>;

  /**
   * Create an asynchronous effect using TaskEither
   */
  async: <T>(
    effectFn: (env: R, context: T) => TE.TaskEither<Err, void>,
  ) => (context: T) => RTE.ReaderTaskEither<R, Err, T>;

  /**
   * Create a synchronous transformation using IO
   */
  syncTransform: <TIn, TOut>(
    transformFn: (env: R, input: TIn) => IO.IO<TOut>,
  ) => (input: TIn) => RTE.ReaderTaskEither<R, Err, TOut>;

  /**
   * Create an asynchronous transformation using TaskEither
   */
  asyncTransform: <TIn, TOut>(
    transformFn: (env: R, input: TIn) => TE.TaskEither<Err, TOut>,
  ) => (input: TIn) => RTE.ReaderTaskEither<R, Err, TOut>;
}

/**
 * Generic effect combinator for ReaderTaskEither
 * Executes a side effect and passes through the context unchanged
 */
export const withEffect =
  <R, T, E = never>(effectFn: (env: R, context: T) => IO.IO<void>) =>
  (context: T): RTE.ReaderTaskEither<R, E, T> =>
    pipe(
      RTE.ask<R>(),
      RTE.flatMapTaskEither((env) => TE.fromIO(effectFn(env, context))),
      RTE.map(() => context),
    );

/**
 * Generic async effect combinator for ReaderTaskEither
 * Executes an async effect and passes through the context unchanged
 */
export const withAsyncEffect =
  <R, T, E>(effectFn: (env: R, context: T) => TE.TaskEither<E, void>) =>
  (context: T): RTE.ReaderTaskEither<R, E, T> =>
    pipe(
      RTE.ask<R>(),
      RTE.flatMapTaskEither((env) =>
        pipe(
          effectFn(env, context),
          TE.map(() => context),
        ),
      ),
    );

export const createEffect = <R, Err>(): EffectCombinators<R, Err> => ({
  /**
   * Create a synchronous effect using IO
   */
  sync: <T>(effectFn: (env: R, context: T) => IO.IO<void>) => withEffect<R, T, Err>(effectFn),

  /**
   * Create an asynchronous effect using TaskEither
   */
  async: <T>(effectFn: (env: R, context: T) => TE.TaskEither<Err, void>) => withAsyncEffect<R, T, Err>(effectFn),

  /**
   * Create a synchronous transformation using IO
   */
  syncTransform:
    <TIn, TOut>(transformFn: (env: R, input: TIn) => IO.IO<TOut>) =>
    (input: TIn): RTE.ReaderTaskEither<R, Err, TOut> =>
      pipe(
        RTE.ask<R>(),
        RTE.flatMapTaskEither((env) => TE.fromIO(transformFn(env, input))),
      ),

  /**
   * Create an asynchronous transformation using TaskEither
   */
  asyncTransform:
    <TIn, TOut>(transformFn: (env: R, input: TIn) => TE.TaskEither<Err, TOut>) =>
    (input: TIn): RTE.ReaderTaskEither<R, Err, TOut> =>
      pipe(
        RTE.ask<R>(),
        RTE.flatMapTaskEither((env) => transformFn(env, input)),
      ),
});
