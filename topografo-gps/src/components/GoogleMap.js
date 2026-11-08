import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker, Polygon, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

const FILL = 'rgba(176,0,58,0.55)';

// Mapa de Google (imágenes satelitales de Google). Solo se usa cuando la app
// se compiló con una clave de Google Maps (ver app.config.js).
export default function GoogleMap({
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
  const mapRef = useRef(null);
  const [center, setCenter] = useState(null);
  const firstFix = useRef(true);
  const lastFit = useRef(null);
  const followRef = useRef(follow);
  followRef.current = follow;

  // Seguir la posición GPS
  useEffect(() => {
    if (!current || !mapRef.current) return;
    if (firstFix.current && !points.length) {
      firstFix.current = false;
      mapRef.current.animateCamera({ center: { latitude: current.lat, longitude: current.lon }, zoom: 18 }, { duration: 600 });
    } else if (follow) {
      mapRef.current.animateCamera({ center: { latitude: current.lat, longitude: current.lon } }, { duration: 400 });
    }
  }, [current, follow, points.length]);

  // Encuadrar el lote
  useEffect(() => {
    if (fitKey == null || fitKey === lastFit.current || !mapRef.current) return;
    lastFit.current = fitKey;
    if (!points.length) return;
    firstFix.current = false;
    mapRef.current.fitToCoordinates(
      points.map((p) => ({ latitude: p.lat, longitude: p.lon })),
      { edgePadding: { top: 120, right: 60, bottom: 160, left: 60 }, animated: true },
    );
  }, [fitKey, points]);

  const coords = points.map((p) => ({ latitude: p.lat, longitude: p.lon }));
  const many = points.length > 60;

  const handleRegion = (r) => {
    const c = { lat: r.latitude, lon: r.longitude };
    if (crosshair) setCenter(c);
    onCenterChange && onCenterChange(c);
  };

  return (
    <View style={[styles.wrap, style]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        mapType={mapType}
        initialRegion={{ latitude: 4.6, longitude: -74.1, latitudeDelta: 8, longitudeDelta: 8 }}
        toolbarEnabled={false}
        showsCompass
        rotateEnabled
        pitchEnabled={false}
        moveOnMarkerPress={false}
        onPanDrag={() => {
          if (followRef.current && onFollowChange) onFollowChange(false);
        }}
        onRegionChange={handleRegion}
        onRegionChangeComplete={handleRegion}
      >
        {coords.length >= 3 && <Polygon coordinates={coords} fillColor={FILL} strokeColor="#ffffff" strokeWidth={2.5} />}
        {coords.length === 2 && <Polyline coordinates={coords} strokeColor="#ffffff" strokeWidth={2.5} />}

        {crosshair && center && coords.length > 0 && (
          <Polyline
            coordinates={[
              coords[coords.length - 1],
              { latitude: center.lat, longitude: center.lon },
              ...(coords.length >= 2 ? [coords[0]] : []),
            ]}
            strokeColor="#ffffff"
            strokeWidth={2}
            lineDashPattern={[4, 10]}
          />
        )}

        {(sides || []).map((s) => {
          const a = points[s.from - 1];
          const b = points[s.to - 1];
          if (!a || !b) return null;
          return (
            <Marker
              key={`s${s.from}-${s.label}`}
              coordinate={{ latitude: (a.lat + b.lat) / 2, longitude: (a.lon + b.lon) / 2 }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
              tappable={false}
            >
              <View style={styles.side}>
                <Text style={styles.sideText}>{s.label}</Text>
              </View>
            </Marker>
          );
        })}

        {points.map((p, i) =>
          many && i > 0 && !editable ? null : (
            <Marker
              key={`v${i}-${p.lat}-${p.lon}`}
              coordinate={{ latitude: p.lat, longitude: p.lon }}
              anchor={{ x: 0.5, y: 0.5 }}
              draggable={editable}
              tracksViewChanges={false}
              onDragEnd={(e) => {
                const c = e.nativeEvent.coordinate;
                onVertexMove && onVertexMove(i, { lat: c.latitude, lon: c.longitude });
              }}
            >
              <View style={[styles.vtx, i === 0 && styles.vtxFirst]}>
                <Text style={[styles.vtxText, i === 0 && styles.vtxTextFirst]}>{i + 1}</Text>
              </View>
            </Marker>
          ),
        )}

        {current && (
          <>
            <Circle
              center={{ latitude: current.lat, longitude: current.lon }}
              radius={current.acc || 0}
              strokeColor="rgba(33,150,243,0.8)"
              fillColor="rgba(33,150,243,0.15)"
              strokeWidth={1}
            />
            <Marker
              coordinate={{ latitude: current.lat, longitude: current.lon }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
              tappable={false}
              zIndex={10}
            >
              <View style={styles.me} />
            </Marker>
          </>
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, overflow: 'hidden', backgroundColor: '#1b2a1f' },
  side: { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  sideText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  vtx: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#b0003a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vtxFirst: { backgroundColor: '#00c853', borderColor: '#fff' },
  vtxText: { color: '#222', fontSize: 11, fontWeight: '800' },
  vtxTextFirst: { color: '#fff' },
  me: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#2196f3',
    borderWidth: 2.5,
    borderColor: '#fff',
  },
});
