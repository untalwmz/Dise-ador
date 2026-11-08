import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

// Mapa Leaflet dentro de un WebView con imágenes Esri World Imagery (sin API key).
// Es el respaldo cuando la app se compila sin clave de Google Maps.
const HTML = `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { margin:0; padding:0; height:100%; width:100%; background:#1b2a1f; }
  #offline { display:none; position:absolute; inset:0; color:#cfe8d4; font:15px sans-serif;
    align-items:center; justify-content:center; text-align:center; padding:24px; }
  .side { background: rgba(0,0,0,.55); color:#fff; border:none; border-radius:8px;
    font: 600 11px sans-serif; padding: 1px 5px; box-shadow:none; }
  .side:before { display:none; }
  .vtx { width:22px; height:22px; border-radius:11px; background:#fff; color:#222; border:2px solid #b0003a;
    font: bold 11px sans-serif; display:flex; align-items:center; justify-content:center; box-sizing:border-box; }
  .vtx.first { background:#00c853; color:#fff; border-color:#fff; }
  .leaflet-bottom { margin-bottom: 70px; }
  .leaflet-control-attribution { font-size: 9px; }
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
    post({type:'ready'});
    return;
  }
  var map = L.map('map', { zoomControl: false, attributionControl: true, maxZoom: 22 }).setView([4.6, -74.1], 5);

  // Esri no tiene imágenes a zoom 18-19 en muchas zonas rurales ("Map data not yet
  // available"): por defecto zoom 17 ampliado y "tilemap" para subir donde hay imagen.
  var SAT_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer';
  var SAFE_ZOOM = 17;
  var sat = L.tileLayer(SAT_URL + '/tile/{z}/{y}/{x}', {
    maxNativeZoom: SAFE_ZOOM, maxZoom: 22, attribution: 'Esri, Maxar, Earthstar Geographics'
  }).addTo(map);
  var labels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    maxNativeZoom: SAFE_ZOOM, maxZoom: 22
  });
  var streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxNativeZoom: 19, maxZoom: 22, attribution: '© OpenStreetMap'
  });
  var mapType = 'satellite';
  function setMapType(t) {
    if (t === mapType) return;
    mapType = t;
    [sat, labels, streets].forEach(function(l){ if (map.hasLayer(l)) map.removeLayer(l); });
    if (t === 'standard') streets.addTo(map);
    else { sat.addTo(map); if (t === 'hybrid') labels.addTo(map); }
  }

  var availCache = {};
  function tileXY(lat, lon, z) {
    var n = Math.pow(2, z), r = lat * Math.PI / 180;
    return [Math.floor((lon + 180) / 360 * n),
            Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n)];
  }
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
    if (map.hasLayer(sat)) { map.removeLayer(sat); sat.addTo(map); sat.bringToBack(); }
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
        if (ok === null) return done();
        if (ok) { setNative(z); return done(); }
        tryZoom(z - 1);
      });
    })(19);
    function done() { checking = false; if (pendingCheck) { pendingCheck = false; updateNative(); } }
  }
  var nativeTimer = null;
  map.on('moveend zoomend', function(){ clearTimeout(nativeTimer); nativeTimer = setTimeout(updateNative, 400); });
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

  var STYLE = { color:'#ffffff', weight:2.5, fillColor:'#b0003a', fillOpacity:0.55 };
  var poly = L.polygon([], STYLE).addTo(map);
  var line = L.polyline([], { color:'#ffffff', weight:2.5 }).addTo(map);
  var guides = L.polyline([], { color:'#ffffff', weight:2, dashArray:'2 6' }).addTo(map);
  var vertexLayer = L.layerGroup().addTo(map);
  var sideLayer = L.layerGroup().addTo(map);
  var accCircle = L.circle([0,0], { radius: 0, color:'#2196f3', weight:1, fillOpacity:0.15, interactive:false });
  var me = L.circleMarker([0,0], { radius: 7, color:'#fff', weight:2, fillColor:'#2196f3', fillOpacity:1, interactive:false });
  var follow = true, firstFix = true, crosshair = false, pts = [], lastFitKey = null;

  map.on('dragstart', function(){ if (follow) { follow = false; post({type:'follow', value:false}); } });

  function drawShape() {
    if (pts.length >= 3) { poly.setLatLngs(pts); line.setLatLngs([]); }
    else { poly.setLatLngs([]); line.setLatLngs(pts); }
  }
  function drawGuides() {
    if (!crosshair || !pts.length) { guides.setLatLngs([]); return; }
    var c = map.getCenter();
    var segs = [[pts[pts.length-1], c]];
    if (pts.length >= 2) segs.push([c, pts[0]]);
    guides.setLatLngs(segs);
  }
  var lastCenterPost = 0;
  function postCenter() {
    var c = map.getCenter();
    post({type:'center', lat:c.lat, lon:c.lng, zoom: map.getZoom()});
  }
  map.on('move', function(){
    drawGuides();
    var now = Date.now();
    if (now - lastCenterPost > 120) { lastCenterPost = now; postCenter(); }
  });
  map.on('moveend', postCenter);

  window.setData = function(d) {
    pts = (d.points || []).map(function(p){ return [p.lat, p.lon]; });
    crosshair = !!d.crosshair;
    if (d.mapType) setMapType(d.mapType);
    drawShape();
    vertexLayer.clearLayers();
    sideLayer.clearLayers();
    var many = pts.length > 60;
    pts.forEach(function(ll, i){
      var m;
      if (many && i > 0 && !d.editable) {
        m = L.circleMarker(ll, { radius: 3, color:'#fff', weight:1, fillColor:'#b0003a', fillOpacity:1 });
      } else {
        m = L.marker(ll, {
          draggable: !!d.editable,
          icon: L.divIcon({ className:'', iconSize:[22,22], iconAnchor:[11,11],
            html: '<div class="vtx' + (i === 0 ? ' first' : '') + '">' + (i+1) + '</div>' })
        });
        m.on('drag', function(e){ var p = e.target.getLatLng(); pts[i] = [p.lat, p.lng]; drawShape(); drawGuides(); });
        m.on('dragend', function(e){ var p = e.target.getLatLng(); post({type:'vertexMove', index:i, lat:p.lat, lon:p.lng}); });
      }
      m.addTo(vertexLayer);
    });
    (d.sides || []).forEach(function(s){
      var a = pts[s.from-1], b = pts[s.to-1];
      if (!a || !b) return;
      L.tooltip({ permanent:true, direction:'center', className:'side' })
        .setLatLng([(a[0]+b[0])/2, (a[1]+b[1])/2]).setContent(s.label).addTo(sideLayer);
    });
    drawGuides();
    if (d.current) {
      var c = [d.current.lat, d.current.lon];
      me.setLatLng(c); accCircle.setLatLng(c); accCircle.setRadius(d.current.acc || 0);
      if (!map.hasLayer(me)) { accCircle.addTo(map); me.addTo(map); }
      if (typeof d.follow === 'boolean') follow = d.follow;
      if (firstFix && !pts.length) { map.setView(c, 18); firstFix = false; }
      else if (follow) { map.panTo(c, { animate: true }); }
    } else {
      if (map.hasLayer(me)) { map.removeLayer(me); map.removeLayer(accCircle); }
      if (typeof d.follow === 'boolean') follow = d.follow;
    }
    if (d.fitKey != null && d.fitKey !== lastFitKey) {
      lastFitKey = d.fitKey;
      if (pts.length) { firstFix = false; map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 20 }); }
    }
  };
  post({type:'ready'});
  postCenter();
})();
</script>
</body></html>`;

export default function LeafletMap({
  points,
  sides,
  current,
  follow,
  onFollowChange,
  mapType = 'satellite',
  crosshair = false,
  onCenterChange,
  editable = false,
  onVertexMove,
  fitKey,
  style,
}) {
  const webRef = useRef(null);
  const [ready, setReady] = useState(false);

  const send = useCallback((d) => {
    if (!webRef.current) return;
    webRef.current.injectJavaScript(`window.setData && window.setData(${JSON.stringify(d)}); true;`);
  }, []);

  useEffect(() => {
    if (!ready) return;
    send({
      points: points.map((p) => ({ lat: p.lat, lon: p.lon })),
      sides,
      current: current ? { lat: current.lat, lon: current.lon, acc: current.acc } : null,
      follow,
      mapType,
      crosshair,
      editable,
      fitKey,
    });
  }, [ready, points, sides, current, follow, mapType, crosshair, editable, fitKey, send]);

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
          let msg;
          try {
            msg = JSON.parse(e.nativeEvent.data);
          } catch {
            return;
          }
          if (msg.type === 'ready') setReady(true);
          else if (msg.type === 'follow') onFollowChange && onFollowChange(msg.value);
          else if (msg.type === 'center') onCenterChange && onCenterChange({ lat: msg.lat, lon: msg.lon });
          else if (msg.type === 'vertexMove') onVertexMove && onVertexMove(msg.index, { lat: msg.lat, lon: msg.lon });
        }}
        style={styles.web}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, overflow: 'hidden', backgroundColor: '#1b2a1f' },
  web: { flex: 1, backgroundColor: '#1b2a1f' },
});
