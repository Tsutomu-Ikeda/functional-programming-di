import * as TE from 'fp-ts/lib/TaskEither';
import * as RTE from 'fp-ts/lib/ReaderTaskEither';
import * as IO from 'fp-ts/lib/IO';
import { pipe } from 'fp-ts/lib/function';

/**
 * Generic effect combinator for ReaderTaskEither
 * Executes a side effect and passes through the context unchanged
 */
export const withEffect = <R, T, E = never>(
  effectFn: (env: R, context: T) => IO.IO<void>,
) =>
  (context: T): RTE.ReaderTaskEither<R, E, T> =>
    pipe(
      RTE.ask<R>(),
      RTE.flatMapTaskEither((env) =>
        TE.fromIO(effectFn(env, context)),
      ),
      RTE.map(() => context),
    );

/**
 * Generic async effect combinator for ReaderTaskEither
 * Executes an async effect and passes through the context unchanged
 */
export const withAsyncEffect = <R, T, E>(
  effectFn: (env: R, context: T) => TE.TaskEither<E, void>,
) =>
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

export const createEffect = <R>() => ({
  /**
   * Create a synchronous effect using IO
   */
  sync: <T>(effectFn: (env: R, context: T) => IO.IO<void>) =>
    withEffect<R, T, never>(effectFn),

  /**
   * Create an asynchronous effect using TaskEither
   */
  async: <T, E>(effectFn: (env: R, context: T) => TE.TaskEither<E, void>) =>
    withAsyncEffect<R, T, E>(effectFn),
});
