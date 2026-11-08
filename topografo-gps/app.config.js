// Configuración dinámica: agrega la clave de Google Maps si existe la variable de
// entorno GOOGLE_MAPS_API_KEY al compilar (en GitHub Actions viene de un secreto).
// Sin clave, la app usa el mapa de respaldo (Esri) y no incluye Google Maps.
module.exports = ({ config }) => {
  const key = (process.env.GOOGLE_MAPS_API_KEY || '').trim();
  const plugins = (config.plugins || []).filter((p) => (Array.isArray(p) ? p[0] : p) !== 'react-native-maps');
  if (key) plugins.push(['react-native-maps', { androidGoogleMapsApiKey: key }]);
  return {
    ...config,
    plugins,
    extra: { ...(config.extra || {}), googleMaps: Boolean(key) },
  };
};
