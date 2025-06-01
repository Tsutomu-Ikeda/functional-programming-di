import * as TE from 'fp-ts/lib/TaskEither';
import type * as RTE from 'fp-ts/lib/ReaderTaskEither';
import type { DomainError } from '../../domain/errors';

export const fx = {
  async: <I, O = void, Err = DomainError>() => ({
    has:
      <D>() =>
      (impl: (deps: D, input: I) => TE.TaskEither<Err, O>) =>
      (input: I): RTE.ReaderTaskEither<D, Err, O> =>
      (deps) =>
        impl(deps, input),
  }),
  sync: <I, O = void>() => ({
    has:
      <D>() =>
      (impl: (deps: D, input: I) => O) =>
      (input: I): RTE.ReaderTaskEither<D, never, O> =>
      (deps) =>
        TE.right(impl(deps, input)),
  }),
};
