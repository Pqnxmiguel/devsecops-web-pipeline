import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { detectIocType, isPlausibleForType } from '../../lib/iocDetect';
import type { IocType } from '../../lib/types';

interface ScanFormProps {
  onSubmit: (type: IocType, value: string) => void;
  loading: boolean;
}

const TYPE_LABEL: Record<IocType, string> = {
  ip: 'IP',
  hash: 'Hash',
  domain: 'Dominio',
};

/**
 * Formulario único de consulta con detección automática de tipo + selector
 * manual para corregirla. La validación de aquí es SOLO UX (feedback
 * temprano, habilitar/deshabilitar el botón): la autoritativa vive en el
 * backend (`createIoc`), y cualquier error que el backend devuelva se
 * muestra igual, sin duplicar sus reglas.
 */
export function ScanForm({ onSubmit, loading }: ScanFormProps) {
  const [value, setValue] = useState('');
  const [type, setType] = useState<IocType>('ip');
  const [typeTouchedManually, setTypeTouchedManually] = useState(false);
  const inputId = useId();
  const typeId = useId();

  const detected = useMemo(() => detectIocType(value), [value]);

  useEffect(() => {
    if (typeTouchedManually) return;
    if (detected) setType(detected);
  }, [detected, typeTouchedManually]);

  const trimmed = value.trim();
  const plausible = trimmed !== '' && isPlausibleForType(trimmed, type);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!plausible || loading) return;
    onSubmit(type, trimmed);
  }

  return (
    <Card as="section" aria-label="Consultar un IOC">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor={inputId} className="block font-pixel text-[10px] text-pixel-fog uppercase mb-2">
            IP / hash / dominio
          </label>
          <Input
            id={inputId}
            name="value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="192.0.2.1, ejemplo.com, 44d8861..."
            autoComplete="off"
            spellCheck={false}
            error={trimmed !== '' && !plausible ? `No parece un ${TYPE_LABEL[type].toLowerCase()} válido.` : null}
          />
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor={typeId} className="block font-pixel text-[10px] text-pixel-fog uppercase mb-2">
              Tipo
            </label>
            <Select
              id={typeId}
              value={type}
              onChange={(e) => {
                setTypeTouchedManually(true);
                setType(e.target.value as IocType);
              }}
            >
              <option value="ip">IP</option>
              <option value="hash">Hash</option>
              <option value="domain">Dominio</option>
            </Select>
          </div>

          <Button type="submit" disabled={!plausible || loading} className="ml-auto">
            {loading ? 'Escaneando…' : 'Escanear'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
