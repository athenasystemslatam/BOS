// La base entrega como máximo 1000 filas por pedido y corta sin avisar.
// Esto pide de a 1000 hasta traer todo y devuelve { data, error } igual que
// una consulta normal. La consulta tiene que ordenar por una columna única
// (ej. "id"); si no, las páginas pueden repetir o saltear filas.
type Pagina = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function paginado<T = any>(
  consulta: (desde: number, hasta: number) => Pagina
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta(desde, desde + 999);
    if (error) return { data: null, error };
    filas.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return { data: filas, error: null };
  }
}
