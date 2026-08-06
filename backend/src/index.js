/**
 * Punto de entrada del proceso.
 *
 * Separado de `app.js` a proposito: aqui esta todo lo que tiene efectos sobre el
 * sistema operativo (escuchar un puerto, apagar limpio), y nada de eso ocurre
 * al importar la app en un test.
 *
 * La configuracion se carga en el import de `config`: si falta una API key en
 * modo real, el proceso muere ANTES de escuchar. Nunca a mitad de un request.
 */

import { config } from './config/index.js';
import { createApp } from './app.js';

const server = createApp(config).listen(config.port, () => {
  console.log(
    `[ioc-scanner] escuchando en http://localhost:${config.port} ` +
      `(v${config.version}, fuentes ${config.useMockSources ? 'simuladas' : 'reales'})`,
  );
});

/** Apagado limpio: deja de aceptar conexiones y espera a las que estan en curso. */
function shutdown(signal) {
  console.log(`[ioc-scanner] ${signal} recibido, cerrando...`);
  server.close(() => process.exit(0));
  // Red de seguridad: si una conexion se niega a cerrar, no colgar para siempre.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
