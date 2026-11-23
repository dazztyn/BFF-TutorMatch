import { SesionesMock } from '../sesiones/sesiones.mock';
import type { Usuario } from '../usuarios/usuarios.models';
import { UsuariosMock } from '../usuarios/usuarios.mock';
import {
  EvaluacionesResolver,
  ResumenTutorResolver,
} from './evaluaciones.resolver';
import { MaterialMock } from './material.mock';
import { MaterialResolver } from './material.resolver';

// Lunes 2 de diciembre de 2030, bloque A (08:10 en Chile = 11:10 UTC).
const inicio = new Date('2030-12-02T11:10:00Z');
const fin = new Date('2030-12-02T12:40:00Z');

describe('resolvers de material y evaluaciones', () => {
  let sesiones: SesionesMock;
  let material: MaterialMock;
  let tutor: string;

  beforeEach(async () => {
    sesiones = new SesionesMock();
    const usuarios = new UsuariosMock();
    material = new MaterialMock(sesiones, usuarios);
    tutor = (
      await usuarios.registro({
        nombre: 'Ana',
        email: 'a@uc.cl',
        password: 'p',
      })
    ).usuario.id;
    await usuarios.agregarRamosTutor(tutor, [
      { ramoCodigo: 'MAT1610', notaAprobacion: 6, periodoAprobacion: '2025-2' },
    ]);
  });

  it('publica, lista y elimina avisos con el usuario del token', async () => {
    const resolver = new MaterialResolver(material);
    const aviso = await resolver.publicarAviso(
      'MAT1610',
      'Título',
      'Texto',
      tutor,
    );
    expect(await resolver.listar(tutor, tutor, 'MAT1610')).toEqual([aviso]);
    expect(await resolver.eliminarMaterial(aviso.id, tutor)).toBe(true);
    expect(await resolver.listar(tutor)).toEqual([]);
  });

  it('evalúa una sesión finalizada y muestra el promedio del tutor', async () => {
    await sesiones.marcarCasilla(tutor, 'MAT1610', inicio);
    const sesion = await sesiones.crear({
      tutorId: tutor,
      estudianteId: 'est-1',
      ramoCodigo: 'MAT1610',
      inicio,
      fin,
    });
    await sesiones.confirmar(sesion.id, tutor);
    await sesiones.finalizar(sesion.id, tutor);

    const evaluaciones = new EvaluacionesResolver(material);
    // Sin comentario se guarda como texto vacío.
    expect(await evaluaciones.evaluar(sesion.id, 4, 'est-1')).toMatchObject({
      nota: 4,
      comentario: '',
    });
    expect(await evaluaciones.evaluacionesTutor(tutor, 'otro')).toMatchObject({
      promedio: 4,
      cantidad: 1,
    });
    expect(await evaluaciones.misEvaluaciones('est-1')).toHaveLength(1);

    const resumen = new ResumenTutorResolver(material);
    const ctx = {};
    const usuario = (id: string) => ({ id }) as Usuario;
    expect(await resumen.promedioEvaluaciones(usuario(tutor), ctx)).toBe(4);
    expect(await resumen.cantidadEvaluaciones(usuario(tutor), ctx)).toBe(1);
    expect(
      await resumen.promedioEvaluaciones(usuario('sin-evaluaciones'), ctx),
    ).toBe(0);
  });
});
