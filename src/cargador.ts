export type Cargador<T> = (id: string) => Promise<T | null>;

// Junta en una sola llamada en lote todos los ids que piden los resolvers en la misma
// vuelta del event loop (por ejemplo, el tutor de cada sesión de una lista) y recuerda
// los resultados. Se crea uno por request, así nunca mezcla datos de dos consultas.
// idDe dice a qué id corresponde cada resultado; los ids sin resultado quedan en null.
export const crearCargador = <T>(
  obtener: (ids: string[]) => Promise<T[]>,
  idDe: (t: T) => string,
): Cargador<T> => {
  const cache = new Map<string, Promise<T | null>>();
  let lote: string[] = [];
  let pendiente: Promise<Map<string, T>> | null = null;

  return (id) => {
    let resultado = cache.get(id);
    if (!resultado) {
      if (!pendiente) {
        lote = [];
        // setImmediate corre después de que GraphQL llamó a todos los resolvers de la lista.
        pendiente = new Promise((listo) => setImmediate(listo)).then(
          async () => {
            const ids = lote;
            pendiente = null;
            return new Map((await obtener(ids)).map((t) => [idDe(t), t]));
          },
        );
      }
      lote.push(id);
      resultado = pendiente.then((porId) => porId.get(id) ?? null);
      cache.set(id, resultado);
    }
    return resultado;
  };
};
