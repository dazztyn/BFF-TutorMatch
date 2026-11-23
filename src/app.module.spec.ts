import { formatearError } from './app.module';

describe('formatearError', () => {
  it.each([
    [400, 'BAD_REQUEST'],
    [401, 'UNAUTHENTICATED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [409, 'CONFLICT'],
    [503, 'SERVICE_UNAVAILABLE'],
  ])('traduce un %i a %s', (statusCode, code) => {
    const error = formatearError({
      message: 'x',
      extensions: {
        code: 'INTERNAL_SERVER_ERROR',
        originalError: { statusCode },
      },
    });
    expect(error.extensions?.code).toBe(code);
  });

  it('deja igual los errores sin estado HTTP conocido', () => {
    const error = {
      message: 'x',
      extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
    };
    expect(formatearError(error)).toBe(error);
  });
});
