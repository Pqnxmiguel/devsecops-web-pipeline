/**
 * Servicio de scan: orquesta IOC -> fuentes -> veredicto -> historial.
 *
 * Es la unica capa que conoce las tres a la vez. Los controllers no saben que
 * existen fuentes; las fuentes no saben que existe un historial.
 */

import { randomUUID } from 'node:crypto';
import { createIoc } from '../models/ioc.js';
import { aggregateVerdict, degradedSourceReport } from '../models/verdict.js';
import { AppError, SourceError } from '../utils/errors.js';

/**
 * Consulta una fuente sin dejar que su fallo tumbe el scan (ADR 3).
 * @param {{id: string, lookup: Function}} source
 * @param {object} ioc
 */
async function lookupOrDegrade(source, ioc) {
  try {
    return await source.lookup(ioc);
  } catch (error) {
    if (error instanceof SourceError) {
      return degradedSourceReport(source.id, error.kind);
    }
    // Un fallo inesperado (bug del cliente, forma de respuesta imprevista) se
    // degrada igual: el mensaje original no viaja al cliente, solo al log.
    console.error(`[scan] fallo inesperado en la fuente ${source.id}:`, error);
    return degradedSourceReport(source.id, 'unavailable');
  }
}

/**
 * @param {object} options
 * @param {{id: string, supports: Function, lookup: Function}[]} options.sources
 * @param {{add: Function}} options.historyRepository
 * @param {boolean} options.useMock
 */
export function createScanService({ sources, historyRepository, useMock }) {
  return {
    /**
     * @param {'ip'|'hash'|'domain'} type
     * @param {unknown} rawValue
     */
    async scan(type, rawValue) {
      // Valida y normaliza ANTES de tocar la red o el historial: un input
      // invalido no debe generar trafico saliente ni ocupar una entrada.
      const ioc = createIoc(type, rawValue);

      const applicable = sources.filter((source) => source.supports(ioc.type));
      if (applicable.length === 0) {
        // Caso limite hermano de `unknown`, resuelto en el otro extremo: aqui
        // no se intento nada, asi que no hay Scan que registrar ni veredicto
        // que emitir. Es un fallo de configuracion del servidor (503), no un
        // resultado del analisis; un 200 con `unknown` diria "lo miramos y no
        // sabemos" cuando la verdad es "no lo miramos". Lo que ambos caminos
        // comparten es el invariante: ninguno puede producir `clean`.
        throw new AppError(`No hay ninguna fuente configurada para IOCs de tipo "${ioc.type}".`, {
          status: 503,
          code: 'NO_SOURCE_AVAILABLE',
        });
      }

      // En paralelo y cada una con su propio presupuesto de tiempo: el scan
      // tarda lo que la fuente mas lenta, no la suma.
      const reports = await Promise.all(
        applicable.map((source) => lookupOrDegrade(source, ioc)),
      );

      const scan = Object.freeze({
        id: randomUUID(),
        ioc,
        verdict: aggregateVerdict(reports),
        sources: reports,
        scannedAt: new Date().toISOString(),
        mock: useMock,
      });

      historyRepository.add(scan);
      return scan;
    },
  };
}
