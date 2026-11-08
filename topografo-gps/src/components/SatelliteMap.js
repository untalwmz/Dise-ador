import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

// Mapa satelital con Leaflet dentro de un WebView. Usa las imágenes de
// Esri World Imagery (no requiere API key). Necesita internet para las teselas;
// si no hay conexión, la medición sigue funcionando igual.
const HTML = `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { margin:0; padding:0; height:100%; width:100%; background:#1b2a1f; }
  #offline { display:none; position:absolute; inset:0; color:#cfe8d4; font:15px sans-serif;
    align-items:center; justify-content:center; text-align:center; padding:24px; }
  .lbl { background: rgba(0,0,0,.65); color:#fff; border:none; border-radius:4px;
    font: bold 11px sans-serif; padding: 1px 4px; box-shadow:none; }
  .lbl:before { display:none; }
  .side { background: rgba(255,214,0,.9); color:#000; border:none; font: bold 10px sans-serif;
    padding: 0 3px; box-shadow:none; }
  .side:before { display:none; }
  /* El panel inferior de la app tapa unos px del mapa */
  .leaflet-bottom { margin-bottom: 16px; }
</style>
</head><body>
<div id="map"></div>
<div id="offline">Sin conexión: no se puede mostrar el mapa satelital.<br/>La medición GPS sigue funcionando.</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function(){
  function post(msg){ if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg)); }
  if (typeof L === 'undefined') {
    document.getElementById('offline').style.display = 'flex';
    window.setData = function(){};
    post({type:'offline'});
    return;
  }
  var map = L.map('map', { zoomControl: false, attributionControl: true, maxZoom: 22 }).setView([0,0], 2);
  // Esri no tiene imágenes a zoom 18-19 en muchas zonas rurales y devuelve
  // teselas "Map data not yet available". Por defecto usamos zoom 17 (cobertura
  // casi global, ampliado al acercarse) y consultamos el servicio "tilemap" para
  // subir a 18/19 solo donde realmente hay imagen.
  var SAT_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer';
  var SAFE_ZOOM = 17;
  var sat = L.tileLayer(SAT_URL + '/tile/{z}/{y}/{x}', {
    maxNativeZoom: SAFE_ZOOM, maxZoom: 22, attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics'
  }).addTo(map);
  var labels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    maxNativeZoom: SAFE_ZOOM, maxZoom: 22
  });

  var availCache = {};
  function tileXY(lat, lon, z) {
    var n = Math.pow(2, z), r = lat * Math.PI / 180;
    return [Math.floor((lon + 180) / 360 * n),
            Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n)];
  }
  // true / false según haya imagen; null si no se pudo consultar.
  function hasImagery(lat, lon, z) {
    var t = tileXY(lat, lon, z), key = z + '/' + t[1] + '/' + t[0];
    if (key in availCache) return Promise.resolve(availCache[key]);
    return fetch(SAT_URL + '/tilemap/' + key + '/1/1?f=json')
      .then(function(r){ return r.json(); })
      .then(function(j){
        var ok = !!(j && j.valid !== false && j.data && j.data[0] === 1);
        availCache[key] = ok;
        return ok;
      })
      .catch(function(){ return null; });
  }
  function setNative(z) {
    if (sat.options.maxNativeZoom === z) return;
    sat.options.maxNativeZoom = z;
    // redraw() no recalcula el rango de teselas al cambiar de nivel: re-agregamos la capa.
    if (map.hasLayer(sat)) {
      map.removeLayer(sat);
      sat.addTo(map);
      sat.bringToBack();
    }
    post({type:'nativeZoom', value:z});
  }
  var checking = false, pendingCheck = false;
  function updateNative() {
    if (checking) { pendingCheck = true; return; }
    if (map.getZoom() <= SAFE_ZOOM) return;
    checking = true;
    var c = map.getCenter();
    (function tryZoom(z) {
      if (z <= SAFE_ZOOM) { setNative(SAFE_ZOOM); return done(); }
      hasImagery(c.lat, c.lng, z).then(function(ok){
        if (ok === null) return done();      // sin respuesta: nos quedamos como estamos
        if (ok) { setNative(z); return done(); }
        tryZoom(z - 1);
      });
    })(19);
    function done() {
      checking = false;
      if (pendingCheck) { pendingCheck = false; updateNative(); }
    }
  }
  var nativeTimer = null;
  map.on('moveend zoomend', function(){
    clearTimeout(nativeTimer);
    nativeTimer = setTimeout(updateNative, 400);
  });
  var streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxNativeZoom: 19, maxZoom: 22, attribution: '© OpenStreetMap'
  });
  L.control.layers({ 'Satélite': sat, 'Calles': streets }, { 'Nombres': labels }, { position: 'topright' }).addTo(map);
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

  var poly = L.polygon([], { color:'#ffd600', weight:3, fillColor:'#ffd600', fillOpacity:0.18 }).addTo(map);
  var line = L.polyline([], { color:'#ffd600', weight:3 }).addTo(map);
  var closing = L.polyline([], { color:'#ffd600', weight:2, dashArray:'6 6' }).addTo(map);
  var vertexLayer = L.layerGroup().addTo(map);
  var sideLayer = L.layerGroup().addTo(map);
  var accCircle = L.circle([0,0], { radius: 0, color:'#2196f3', weight:1, fillOpacity:0.15 });
  var me = L.circleMarker([0,0], { radius: 7, color:'#fff', weight:2, fillColor:'#2196f3', fillOpacity:1 });
  var follow = true;
  var firstFix = true;

  map.on('dragstart', function(){ if (follow) { follow = false; post({type:'follow', value:false}); } });

  window.setData = function(d) {
    var pts = (d.points || []).map(function(p){ return [p.lat, p.lon]; });
    var showLabels = d.labels !== false && pts.length <= 80;
    vertexLayer.clearLayers();
    sideLayer.clearLayers();
    if (d.closed && pts.length >= 3) {
      poly.setLatLngs(pts); line.setLatLngs([]); closing.setLatLngs([]);
    } else {
      poly.setLatLngs([]); line.setLatLngs(pts);
      closing.setLatLngs(pts.length >= 2 ? [pts[pts.length-1], pts[0]] : []);
    }
    pts.forEach(function(ll, i){
      var m = L.circleMarker(ll, { radius: i === 0 ? 6 : 4, color:'#000', weight:1,
        fillColor: i === 0 ? '#00e676' : '#ffd600', fillOpacity:1 }).addTo(vertexLayer);
      if (showLabels && (d.closed || i === 0)) m.bindTooltip('V' + (i+1), { permanent:true, direction:'top', className:'lbl', offset:[0,-4] });
    });
    if (d.sides && d.closed) {
      d.sides.forEach(function(s){
        var a = pts[s.from-1], b = pts[s.to-1];
        if (!a || !b) return;
        L.tooltip({ permanent:true, direction:'center', className:'side' })
          .setLatLng([(a[0]+b[0])/2, (a[1]+b[1])/2]).setContent(s.label).addTo(sideLayer);
      });
    }
    if (d.current) {
      var c = [d.current.lat, d.current.lon];
      me.setLatLng(c); accCircle.setLatLng(c); accCircle.setRadius(d.current.acc || 0);
      if (!map.hasLayer(me)) { accCircle.addTo(map); me.addTo(map); }
      if (firstFix) { map.setView(c, 19); firstFix = false; }
      else if (follow) { map.panTo(c, { animate: true }); }
    } else if (map.hasLayer(me)) { map.removeLayer(me); map.removeLayer(accCircle); }
    if (typeof d.follow === 'boolean') follow = d.follow;
    if (d.fit && pts.length) {
      firstFix = false;
      map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 20 });
    }
  };
  post({type:'ready'});
})();
</script>
</body></html>`;

const SatelliteMap = forwardRef(function SatelliteMap({ data, onFollowChange, style }, ref) {
  const webRef = useRef(null);
  const [ready, setReady] = useState(false);
  const pending = useRef(data);
  pending.current = data;

  const send = useCallback((d) => {
    if (!webRef.current || !d) return;
    webRef.current.injectJavaScript(`window.setData && window.setData(${JSON.stringify(d)}); true;`);
  }, []);

  useEffect(() => {
    if (ready) send(data);
  }, [ready, data, send]);

  useImperativeHandle(ref, () => ({
    recenter: () => send({ ...pending.current, follow: true }),
    fit: () => send({ ...pending.current, fit: true }),
  }));

  return (
    <View style={[styles.wrap, style]}>
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html: HTML, baseUrl: 'https://localhost/' }}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        overScrollMode="never"
        onMessage={(e) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data);
            if (msg.type === 'ready') setReady(true);
            if (msg.type === 'follow') onFollowChange && onFollowChange(msg.value);
          } catch {
            // mensaje inválido: ignorar
          }
        }}
        style={styles.web}
      />
    </View>
  );
});

export default SatelliteMap;

const styles = StyleSheet.create({
  wrap: { flex: 1, overflow: 'hidden', backgroundColor: '#1b2a1f' },
  web: { flex: 1, backgroundColor: '#1b2a1f' },
});
