import LeafletMap from './LeafletMap';

// Fuentes de imágenes satelitales gratuitas y sin clave.
export const IMAGERY = [
  { value: 'clarity', label: 'Esri Clarity (nítida)' },
  { value: 'esri', label: 'Esri estándar (reciente)' },
];

// Mapa del lote (Leaflet en WebView).
export default function MapCanvas(props) {
  return <LeafletMap {...props} />;
}
