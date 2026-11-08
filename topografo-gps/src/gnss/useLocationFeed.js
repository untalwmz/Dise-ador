import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as External from './external';
import { ellipsoidToMsl } from '../altitude';

/**
 * Entrega lecturas normalizadas del GPS elegido en ajustes:
 * { lat, lon, alt, altMsl, altAcc, acc, t, quality?, sats? }
 * - Teléfono: Fused Location Provider de Google (vía expo-location), altitud
 *   elipsoidal corregida a MSNM con EGM96.
 * - Receptor externo Bluetooth: posición y altitud MSNM del propio receptor.
 */
export function useLocationFeed(settings, onFix) {
  const [permission, setPermission] = useState('checking'); // checking | granted | denied | error
  const [ext, setExt] = useState(External.getState());
  const cb = useRef(onFix);
  cb.current = onFix;

  const source = settings?.source;
  const extAddress = settings?.externalDevice?.address;
  const extDevice = useRef(settings?.externalDevice);
  extDevice.current = settings?.externalDevice;

  useEffect(() => External.subscribe(setExt), []);

  useEffect(() => {
    if (source !== 'external') return undefined;
    setPermission('granted');
    External.ensureConnected(extDevice.current);
    return External.onFix((fix) => cb.current(fix));
  }, [source, extAddress]);

  useEffect(() => {
    if (source !== 'phone') return undefined;
    let sub = null;
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!cancelled) setPermission('denied');
          return;
        }
        if (!(await Location.hasServicesEnabledAsync()) && Platform.OS === 'android') {
          try {
            await Location.enableNetworkProviderAsync();
          } catch {
            // el usuario no activó la ubicación
          }
        }
        if (cancelled) return;
        setPermission('granted');
        const emit = (loc) => {
          const c = loc.coords;
          cb.current({
            lat: c.latitude,
            lon: c.longitude,
            alt: c.altitude,
            altMsl: c.altitude != null ? ellipsoidToMsl(c.latitude, c.longitude, c.altitude) : null,
            altAcc: c.altitudeAccuracy ?? null,
            acc: c.accuracy,
            t: loc.timestamp,
          });
        };
        // Posición inmediata mientras llega la primera lectura en vivo (solo si es reciente)
        Location.getLastKnownPositionAsync({ maxAge: 60000 })
          .then((loc) => {
            if (loc && !cancelled) emit(loc);
          })
          .catch(() => {});
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
          emit,
          () => setPermission('error'),
        );
        if (cancelled) sub.remove();
      } catch {
        if (!cancelled) setPermission('error');
      }
    })();
    return () => {
      cancelled = true;
      if (sub) sub.remove();
    };
  }, [source]);

  return { permission, ext };
}
