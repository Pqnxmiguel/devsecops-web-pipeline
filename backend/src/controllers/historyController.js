/**
 * Controller del historial.
 *
 * Habla solo con la interfaz del repositorio: no sabe si detras hay un array en
 * memoria o SQLite.
 */

/**
 * @param {{list: (page: {limit: number, offset: number}) => object}} historyRepository
 */
export function createHistoryController(historyRepository) {
  return {
    /** GET /api/history */
    async listHistory(req, res) {
      // `req.pagination` lo deja el middleware de validacion ya saneado.
      res.status(200).json(historyRepository.list(req.pagination));
    },
  };
}
