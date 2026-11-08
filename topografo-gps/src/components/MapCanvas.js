import Constants from 'expo-constants';
import GoogleMap from './GoogleMap';
import LeafletMap from './LeafletMap';

// true si el APK se compiló con clave de Google Maps (secreto GOOGLE_MAPS_API_KEY).
export const GOOGLE_MAPS_AVAILABLE = Constants.expoConfig?.extra?.googleMaps === true;

// Mapa del lote. provider: 'google' | 'esri'. Sin clave siempre se usa Esri,
// porque el SDK de Google se cierra si no encuentra la clave.
export default function MapCanvas({ provider = 'google', ...props }) {
  if (provider === 'google' && GOOGLE_MAPS_AVAILABLE) return <GoogleMap {...props} />;
  return <LeafletMap {...props} />;
}
