import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Polygon, Polyline, Text as SvgText } from 'react-native-svg';
import { toLocal } from '../geo';
import { colors } from '../theme';

// Croquis del lote en coordenadas locales (norte arriba). Funciona sin internet.
export default function Sketch({ points, closed = true, sides, height = 260 }) {
  const [width, setWidth] = useState(0);
  const pad = 28;

  const shape = useMemo(() => {
    if (!width || points.length < 2) return null;
    const { xy } = toLocal(points);
    const xs = xy.map((p) => p.x);
    const ys = xy.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);
    const scale = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
    const offX = (width - spanX * scale) / 2;
    const offY = (height - spanY * scale) / 2;
    const pts = xy.map((p) => ({
      x: offX + (p.x - minX) * scale,
      y: height - (offY + (p.y - minY) * scale),
    }));
    // Barra de escala "redonda" (~1/4 del ancho)
    const target = (width / 4) / scale;
    const pow = 10 ** Math.floor(Math.log10(target));
    const nice = [1, 2, 5, 10].map((m) => m * pow).filter((v) => v <= target).pop() || pow;
    return { pts, scaleLen: nice * scale, scaleLabel: nice >= 1000 ? `${nice / 1000} km` : `${nice} m` };
  }, [points, width, height]);

  const showLabels = points.length <= 40;

  return (
    <View style={[styles.box, { height }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {shape && (
        <Svg width={width} height={height}>
          {closed && points.length >= 3 ? (
            <Polygon
              points={shape.pts.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="rgba(46,125,50,0.15)"
              stroke={colors.primary}
              strokeWidth={2}
            />
          ) : (
            <Polyline
              points={shape.pts.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={colors.primary}
              strokeWidth={2}
            />
          )}
          {showLabels &&
            sides &&
            sides.map((s) => {
              const a = shape.pts[s.from - 1];
              const b = shape.pts[s.to - 1];
              if (!a || !b) return null;
              return (
                <SvgText
                  key={`s${s.from}`}
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2 - 3}
                  fontSize={9}
                  fill={colors.textMuted}
                  textAnchor="middle"
                >
                  {s.length.toFixed(1)} m
                </SvgText>
              );
            })}
          {shape.pts.map((p, i) => (
            <G key={i}>
              <Circle cx={p.x} cy={p.y} r={i === 0 ? 4 : 3} fill={i === 0 ? colors.accent : colors.primary} />
              {showLabels && (
                <SvgText x={p.x + 5} y={p.y - 5} fontSize={10} fontWeight="bold" fill={colors.text}>
                  V{i + 1}
                </SvgText>
              )}
            </G>
          ))}
          {/* Norte */}
          <G>
            <Line x1={width - 18} y1={30} x2={width - 18} y2={10} stroke={colors.text} strokeWidth={2} />
            <Polygon points={`${width - 22},14 ${width - 18},6 ${width - 14},14`} fill={colors.text} />
            <SvgText x={width - 18} y={42} fontSize={10} textAnchor="middle" fill={colors.text}>
              N
            </SvgText>
          </G>
          {/* Escala */}
          <G>
            <Line x1={10} y1={height - 10} x2={10 + shape.scaleLen} y2={height - 10} stroke={colors.text} strokeWidth={2} />
            <Line x1={10} y1={height - 14} x2={10} y2={height - 6} stroke={colors.text} strokeWidth={2} />
            <Line
              x1={10 + shape.scaleLen}
              y1={height - 14}
              x2={10 + shape.scaleLen}
              y2={height - 6}
              stroke={colors.text}
              strokeWidth={2}
            />
            <SvgText x={14 + shape.scaleLen} y={height - 7} fontSize={10} fill={colors.text}>
              {shape.scaleLabel}
            </SvgText>
          </G>
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: '#fafaf5', borderRadius: 12, borderWidth: 1, borderColor: colors.border },
});
