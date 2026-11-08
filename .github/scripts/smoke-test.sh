#!/usr/bin/env bash
# Prueba de humo en emulador: instala el APK, abre la app, recorre las pantallas
# principales y falla si la app se cierra. Deja capturas y logcat en ./smoke/.
set -u
PKG=com.diseador.topografogps
OUT=smoke
mkdir -p "$OUT"
APK=$(ls ./*.apk | head -n1)
echo "APK: $APK"

adb wait-for-device
adb install -r -g "$APK" || { echo "::error::No se pudo instalar el APK"; exit 1; }
# Posición GPS simulada (finca de prueba en Colombia): lon lat alt
adb emu geo fix -76.24092 1.85448 1557 || true
adb logcat -c

shot() {
  adb exec-out screencap -p > "$OUT/$1.png"
  # Copia pequeña en base64 dentro del log, para poder revisarla sin descargar artefactos
  if command -v convert >/dev/null; then
    convert "$OUT/$1.png" -resize 300x -quality 55 "$OUT/$1.jpg"
    echo "===SCREENSHOT-BEGIN $1==="
    base64 -w 0 "$OUT/$1.jpg"
    echo
    echo "===SCREENSHOT-END $1==="
  fi
}

alive() { [ -n "$(adb shell pidof $PKG | tr -d '\r')" ]; }

check() {
  if ! alive; then
    echo "::error::La app se cerró ($1)"
    adb logcat -d > "$OUT/logcat.txt"
    echo "----- logcat (errores) -----"
    grep -E "FATAL|AndroidRuntime|ReactNativeJS|ReactNative|Hermes|Exception|Error" "$OUT/logcat.txt" | tail -n 150
    shot "crash-$1"
    exit 1
  fi
}

# Toca el centro del primer elemento cuyo texto contenga $1
tap_text() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  adb shell cat /sdcard/ui.xml > "$OUT/ui.xml"
  local b
  b=$(grep -o "text=\"[^\"]*$1[^\"]*\"[^>]*bounds=\"\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]\"" "$OUT/ui.xml" | head -n1 | grep -o 'bounds="[^"]*"')
  if [ -z "$b" ]; then
    echo "::warning::No encontré el texto '$1' en pantalla"
    return 1
  fi
  local n
  n=$(echo "$b" | grep -o '[0-9]\+' | tr '\n' ' ')
  set -- $n
  adb shell input tap $(( ($1 + $3) / 2 )) $(( ($2 + $4) / 2 ))
}

adb shell monkey -p $PKG -c android.intent.category.LAUNCHER 1 >/dev/null
sleep 20
check "al abrir"
shot "1-inicio"

if tap_text "Nuevo levantamiento"; then
  sleep 12
  check "al abrir la medición"
  shot "2-medicion"
  # Agregar tres puntos con el botón + (centro inferior) moviendo el mapa entre cada uno
  if tap_text "Clima"; then
    sleep 12
    check "en Clima"
    shot "3-clima"
    adb shell input keyevent KEYCODE_BACK
    sleep 3
  fi
  if tap_text "Altitud"; then
    sleep 12
    check "en Altitud"
    shot "4-altitud"
    adb shell input keyevent KEYCODE_BACK
    sleep 3
  fi
  check "al volver a la medición"
fi

adb logcat -d > "$OUT/logcat.txt"
echo "----- logcat de la app (últimas líneas) -----"
grep -E "ReactNativeJS|AndroidRuntime" "$OUT/logcat.txt" | tail -n 60
echo "La app funcionó durante toda la prueba."
