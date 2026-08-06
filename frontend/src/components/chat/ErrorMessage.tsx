import { MascotMessage } from './MascotMessage';

/** Mensaje de error del backend (400/503/network) — el personaje se muestra `alert` (rojo), coherente con "algo salió mal", aunque no sea un veredicto de IOC. */
export function ErrorMessage({ message }: { message: string }) {
  return (
    <MascotMessage scanStatus="success" level="malicious" tone="error" glitchClassName="fx-burst-message">
      <p className="font-mono-pixel text-lg text-pixel-malicious">{message}</p>
    </MascotMessage>
  );
}
