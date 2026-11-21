import { calzaFirma, contentDisposition } from './archivos.controller';

describe('ArchivosController', () => {
  it('acepta solo archivos cuyos primeros bytes calzan con el tipo declarado', () => {
    const pdf = Buffer.from('%PDF-1.7\n');
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0,
    ]);
    const exe = Buffer.from('MZ\x90\x00');

    expect(calzaFirma('application/pdf', pdf)).toBe(true);
    expect(calzaFirma('image/png', png)).toBe(true);
    expect(
      calzaFirma('image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0])),
    ).toBe(true);
    expect(calzaFirma('application/pdf', exe)).toBe(false);
    expect(calzaFirma('image/png', pdf)).toBe(false);
    expect(calzaFirma('text/html', pdf)).toBe(false);
  });

  it('codifica el nombre en Content-Disposition según RFC 5987', () => {
    expect(contentDisposition('Guía "final" (1).pdf')).toBe(
      `inline; filename="Gu_a _final_ (1).pdf"; filename*=UTF-8''Gu%C3%ADa%20%22final%22%20%281%29.pdf`,
    );
  });
});
