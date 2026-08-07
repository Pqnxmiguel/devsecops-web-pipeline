import { MascotMessage } from './MascotMessage';

/** Mensaje de texto plano del personaje: saludo, aclaración de tipo no reconocido. Nunca lleva HTML — a diferencia de `VerdictMessage`, este es el camino "seguro" con el que se puede comparar la VULN-07. */
export function MascotTextMessage({ text }: { text: string }) {
  return (
    <MascotMessage scanStatus="idle" level={null} glitchClassName="fx-burst-message">
      <p className="font-mono-pixel text-lg text-pixel-mist">{text}</p>
    </MascotMessage>
  );
}
