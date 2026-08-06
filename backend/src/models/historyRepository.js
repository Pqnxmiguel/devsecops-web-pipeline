/**
 * Repositorio del historial de scans.
 *
 * La implementacion es en memoria, pero los controllers hablan SOLO con esta
 * interfaz:
 *
 *   add(scan)                 -> el scan almacenado (congelado)
 *   list({ limit, offset })   -> { items, total, limit, offset }, mas reciente primero
 *   count()                   -> numero de scans almacenados
 *   clear()                   -> vacia el repositorio
 *
 * Cambiar a SQLite es escribir otro factory con estos cuatro metodos; ningun
 * controller se entera.
 */

/**
 * @param {object} options
 * @param {number} options.maxEntries  Tope duro de scans retenidos.
 */
export function createInMemoryHistoryRepository({ maxEntries }) {
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new Error('historyRepository: maxEntries debe ser un entero positivo.');
  }

  /**
   * Buffer ordenado del mas reciente al mas antiguo. El limite es lo que impide
   * que un proceso de larga vida crezca sin control con cada request.
   * @type {readonly object[]}
   */
  let entries = [];

  return {
    /** @param {object} scan */
    add(scan) {
      const stored = Object.freeze({ ...scan });
      entries = [stored, ...entries];
      if (entries.length > maxEntries) {
        entries = entries.slice(0, maxEntries);
      }
      return stored;
    },

    /**
     * @param {object} page
     * @param {number} page.limit
     * @param {number} page.offset
     */
    list({ limit, offset }) {
      return {
        items: entries.slice(offset, offset + limit),
        total: entries.length,
        limit,
        offset,
      };
    },

    count() {
      return entries.length;
    },

    clear() {
      entries = [];
    },
  };
}
