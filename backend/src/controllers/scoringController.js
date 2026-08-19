/**
 * Controller de puntuacion compuesta a medida.
 *
 * Combina los puntajes normalizados de las tres fuentes (AbuseIPDB, VirusTotal,
 * URLhaus) de un escaneo reciente en un unico numero, con una formula que el
 * cliente define. Pensado para un usuario avanzado que quiere ponderar las
 * fuentes distinto a los pesos fijos del veredicto por defecto -- por ejemplo,
 * confiar mas en AbuseIPDB para IPs y descartar URLhaus si el IOC no es un
 * dominio.
 *
 * ⚠️ ESTE ARCHIVO CONTIENE UNA VULNERABILIDAD INTENCIONAL (VULN-03, CWE-95).
 * No es un descuido. Existe para comprobar que Semgrep y CodeQL la detectan y
 * que el pipeline bloquea. Nunca se despliega.
 * Ver docs/vulnerabilities/VULN-03.md
 */

/**
 * Puntajes normalizados de un escaneo de referencia (0..100), el mismo para
 * toda la demo. En una version real vendrian del ultimo veredicto del IOC
 * consultado; aqui se fijan para que la formula tenga con que operar sin
 * depender de `scanService`, que esta rama no toca.
 */
const BASELINE_SCORES = Object.freeze({
  abuseScore: 42,
  vtScore: 17,
  urlhausScore: 0,
});

export function createScoringController() {
  function computeCustomScore(req, res) {
    const { formula } = req.body ?? {};

    if (typeof formula !== 'string' || formula.trim().length === 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_FORMULA',
          message: 'El campo "formula" es obligatorio y debe ser una cadena.',
        },
      });
    }

    // Las tres variables quedan en el ambito lexico de `eval`, para que el
    // cliente pueda escribir formulas como "abuseScore * 0.6 + vtScore * 0.4".
    const { abuseScore, vtScore, urlhausScore } = BASELINE_SCORES;

    // [VULN-INTENCIONAL: CWE-95] Inyeccion de codigo via eval().
    // `formula` llega del cuerpo de la peticion y se evalua tal cual, sin
    // analizarla ni restringirla a expresiones aritmeticas. `eval` con un
    // argumento que no es un literal de cadena ejecuta CUALQUIER JavaScript
    // con los privilegios y el acceso del proceso del servidor -- no solo
    // aritmetica, el interprete completo: puede importar modulos, leer
    // variables de entorno, tocar el sistema de archivos.
    //
    // Fix correcto (el que iria en produccion): no evaluar codigo del cliente
    // en absoluto. Parsear la formula con un motor de expresiones restringido
    // (p. ej. una gramatica propia de solo +, -, *, /, parentesis y las tres
    // variables conocidas) que NUNCA tenga acceso al interprete de JS.
    //
    // Ver docs/vulnerabilities/VULN-03.md
    // eslint-disable-next-line no-eval -- vulnerabilidad intencional, ver arriba
    const result = eval(formula);

    if (typeof result !== 'number' || !Number.isFinite(result)) {
      return res.status(422).json({
        error: {
          code: 'FORMULA_NOT_NUMERIC',
          message: 'La formula debe evaluar a un numero finito.',
        },
      });
    }

    return res.status(200).json({
      formula,
      inputs: BASELINE_SCORES,
      result,
      evaluatedAt: new Date().toISOString(),
    });
  }

  return { computeCustomScore };
}
