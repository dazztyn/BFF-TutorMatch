import type { Usuario } from './usuarios.models';

export type CargadorUsuarios = (id: string) => Promise<Usuario | null>;

// Junta en una sola llamada a ObtenerUsuarios todos los ids que piden los resolvers en la
// misma vuelta del event loop (por ejemplo, el tutor de cada sesión de una lista) y
// recuerda los resultados. Se crea uno por request, así nunca mezcla datos de dos consultas.
export const crearCargadorUsuarios = (
  obtener: (ids: string[]) => Promise<Usuario[]>,
): CargadorUsuarios => {
  const cache = new Map<string, Promise<Usuario | null>>();
  let lote: string[] = [];
  let pendiente: Promise<Map<string, Usuario>> | null = null;

  return (id) => {
    let usuario = cache.get(id);
    if (!usuario) {
      if (!pendiente) {
        lote = [];
        // setImmediate corre después de que GraphQL llamó a todos los resolvers de la lista.
        pendiente = new Promise((listo) => setImmediate(listo)).then(
          async () => {
            const ids = lote;
            pendiente = null;
            return new Map((await obtener(ids)).map((u) => [u.id, u]));
          },
        );
      }
      lote.push(id);
      usuario = pendiente.then((porId) => porId.get(id) ?? null);
      cache.set(id, usuario);
    }
    return usuario;
  };
};
