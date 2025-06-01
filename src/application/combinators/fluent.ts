import * as TE from 'fp-ts/lib/TaskEither';
import * as RTE from 'fp-ts/lib/ReaderTaskEither';

export const fx = {
  async:
    <I = void, O = void, Err = unknown>() => ({
      has:
        <D>() =>
        (
          impl: (deps: D, input: I) => TE.TaskEither<Err, O>,
        ) =>
        (input: I): RTE.ReaderTaskEither<D, Err, O> =>
          (deps) => impl(deps, input),
    }),
  sync:
    <I = void, O = void>() => ({
      has:
        <D>() =>
        (
          impl: (deps: D, input: I) => O,
        ) =>
        (input: I): RTE.ReaderTaskEither<D, never, O> =>
          (deps) => TE.right(impl(deps, input)),
    }),
} as const;
