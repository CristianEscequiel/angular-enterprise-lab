// ¿`iso` cae en el mismo día calendario LOCAL que `now`? Compara año, mes y día en la zona horaria
// del usuario: una orden cerrada a las 23:30 locales es "de hoy" aunque en UTC ya sea mañana.
//
// `now` se recibe como parámetro (no se lee `new Date()` acá) para poder probar los bordes del día
// sin un reloj real. Un ISO inválido o vacío nunca es "hoy": devuelve `false`, no lanza.
export function isSameLocalDay(iso: string, now: Date): boolean {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}
