import { useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';

// Botón "atrás" de Android, solo para la pantalla visible.
export function useBackButton(active, handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      ref.current();
      return true;
    });
    return () => sub.remove();
  }, [active]);
}
