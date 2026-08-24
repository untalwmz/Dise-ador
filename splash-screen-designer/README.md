# Splash Screen Designer

App móvil (Expo + React Native + TypeScript) para diseñar splash screens visualmente y exportarlos como un componente **`SplashScreen.tsx`** listo para pegar en cualquier proyecto React Native / Expo.

## Qué incluye

- Vista previa en vivo dentro de un mockup de teléfono.
- **Fondo**: color sólido o degradado (con presets + selector de dirección).
- **Texto**: título y subtítulo, con color independiente para cada uno.
- **Color de acento** (usado en el ícono y el indicador de carga).
- **Ícono**: 8 íconos preestablecidos o una imagen propia elegida desde la galería del dispositivo.
- **Indicador de carga**: puntos, anillo giratorio, barra, o ninguno.
- **Exportación**:
  - Genera `SplashScreen.tsx` (+ `LoadingIndicator.tsx` si aplica) y abre la hoja de compartir nativa (Archivos, AirDrop, correo, etc.).
  - Botón "Copiar código" para pegarlo directamente en tu editor.

## Estructura del proyecto

```
splash-screen-designer/
├── App.tsx
├── app.json
├── eas.json
├── src/
│   ├── types.ts                  # SplashConfig y valores por defecto
│   ├── constants/presets.ts      # swatches, degradados, íconos, spinners
│   ├── components/
│   │   ├── PhonePreview.tsx      # mockup con vista previa en vivo
│   │   ├── ColorField.tsx        # swatches + input hex
│   │   ├── SegmentedControl.tsx  # selector tipo pill
│   │   ├── IconPicker.tsx        # íconos preset + galería
│   │   └── FieldGroup.tsx
│   ├── screens/DesignerScreen.tsx
│   └── utils/
│       ├── codeGenerator.ts      # genera el TSX final
│       └── exportProject.ts      # escribe archivos y comparte
└── assets/ (icon, splash, adaptive-icon placeholders)
```

## Correr en local

```bash
npm install
npx expo start
```

Escanea el QR con la app **Expo Go** (Android/iOS) o presiona `a` / `i` para abrir en un emulador.

## Subir a GitHub

```bash
git init
git add .
git commit -m "Splash Screen Designer - proyecto inicial"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/splash-screen-designer.git
git push -u origin main
```

## Compilar el APK/IPA (sin instalar Android Studio / Xcode)

Este proyecto ya incluye `eas.json`. Con el repo en GitHub puedes compilar en la nube de Expo:

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android --profile preview   # genera un .apk instalable
eas build --platform ios --profile preview        # requiere cuenta Apple Developer
```

También puedes conectar el repo directamente en [expo.dev](https://expo.dev) → "New project" → importar desde GitHub, y disparar builds desde ahí sin usar la terminal.

## Compilar automáticamente con GitHub Actions

El proyecto incluye `.github/workflows/eas-build.yml`, que dispara un build de Android en la nube de EAS cada vez que haces `push` a `main` (o manualmente desde la pestaña **Actions** de tu repo, eligiendo el perfil `preview`, `production` o `development`).

### Configuración necesaria (una sola vez)

1. Crea una cuenta en [expo.dev](https://expo.dev) si no tienes una.
2. Genera un token de acceso: `eas login` en tu máquina y luego `eas whoami` para confirmar, o desde [expo.dev/accounts/[cuenta]/settings/access-tokens](https://expo.dev/accounts).
3. En GitHub, ve a tu repo → **Settings → Secrets and variables → Actions → New repository secret**.
4. Crea un secreto llamado `EXPO_TOKEN` con el valor del token generado.
5. Haz `git push` a `main` (o dispara el workflow manualmente) — el build corre en los servidores de EAS, no en el runner de GitHub, así que no necesitas Android SDK ni nada instalado.
6. El progreso y el `.apk` final se ven en tu [dashboard de expo.dev](https://expo.dev/accounts) (pestaña "Builds").

> El workflow usa `--no-wait` para no bloquear el runner de GitHub mientras EAS compila (puede tardar varios minutos). Si prefieres que la Action espere y falle si el build falla, quita `--no-wait` del último paso.

## Personalizar el ícono/splash de la propia app (opcional)

Los archivos en `assets/icon.png`, `assets/splash.png` y `assets/adaptive-icon.png` son marcadores de posición generados automáticamente. Reemplázalos por tu propio arte (1024×1024 para íconos) antes de publicar.

## Próximos pasos sugeridos

- Guardar/cargar presets favoritos con `AsyncStorage`.
- Exportar también `app.json` con los colores elegidos como `splash.backgroundColor`.
- Soporte para tipografías personalizadas (`expo-font`) además del peso de fuente.
